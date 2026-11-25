import Phaser from 'phaser';
import { MONSTERS, MonsterDef, WeaponForm, UNARMED_FORM, SkillId, SKILLS, Wuxing } from '@xiyou/shared';
import { ENEMY_SCALE, WX_TINT } from '../../config/worldConfig.js';
import { MONSTER_ATLAS_MAP } from '../world/SpawnSystem.js';
import { Avatar } from '../avatar/Avatar.js';
import { Fx, FX_DEPTH } from '../fx/Fx.js';
import { SkillShader, ShaderKind } from '../fx/SkillShader.js';

/**
 * 营地的挂机战斗：纯演出
 *
 * 残魂站在左边，游荡的妖异从右边一只只走过来，被兵器（或带着的技能）打散，
 * 留下的能量飞进「挂机收益」。真正的收益按时间由服务器结算，这里不产生任何数值。
 * 演出用的就是玩家现在的兵器器型和带着的技能，换了装备一眼能看出区别。
 */

/** 序列帧动画：玩家残魂与各种妖异共用一套命名 */
export function ensureCharAnims(scene: Phaser.Scene, atlases: string[]): void {
  for (const atlas of atlases) {
    if (!scene.textures.exists(atlas)) continue;
    const tex = scene.textures.get(atlas);
    // 预渲染的图集自带动作表（每段几帧、播多久）；老图集没有，按 6 帧的老规矩来
    const clips = (tex.customData as { char?: { clips?: Record<string, { frames: number; ms: number; loop: boolean }> } }).char?.clips;
    for (const anim of ['idle', 'run', 'atk', 'hurt', 'magic', 'die']) {
      const key = `${atlas}_${anim}`;
      if (scene.anims.exists(key)) continue;
      const def = clips?.[anim];
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = 0; i < (def?.frames ?? 6); i++) {
        const f = `character_${anim}_${i}`;
        if (tex.has(f)) frames.push({ key: atlas, frame: f });
      }
      if (!frames.length) continue;
      const loop = anim === 'idle' || anim === 'run';
      scene.anims.create({ key, frames, frameRate: def ? frames.length / (def.ms / 1000) : anim === 'idle' ? 8 : 12, repeat: loop ? -1 : 0 });
    }
  }
}

const SHADER_OF: Record<SkillId, ShaderKind> = {
  ring: 'fire', meteor: 'blast', blades: 'blade', frost: 'frost', bloom: 'bloom', bastion: 'bastion',
};

interface Mob {
  def: MonsterDef;
  spr: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  x: number;
  y: number;
  hp: number;
  /** 走到离残魂多远就停下 */
  stop: number;
  speed: number;
  dead: boolean;
  /** 离下一次出手还有多久；正在播哪段动作 */
  atkT: number;
  anim: string;
  /** 被惊动了没有；没被惊动时在原地附近晃悠 */
  aggro: boolean;
  roamX: number;
  roamY: number;
  roamT: number;
}

const SCALE = ENEMY_SCALE;
/** 贴图中心到脚底的距离 */
const FOOT = 307 * SCALE * 0.36;
/** 残魂走路的速度（像素/秒） */
const WALK = 170;
/** 演出用的血量：妖异每下打掉多少、每秒回多少、倒下后躺多久 */
const HP_MAX = 100;
const MOB_DMG = 9;
const REGEN = 1.5;
const DOWN_MS = 3500;
/** 残魂走到多近，妖异才会扑上来 */
const AGGRO = 210;

export interface IdleBounds { left: number; top: number; right: number; bottom: number }

export class IdleBattle {
  private scene: Phaser.Scene;
  private avatar: Avatar;
  private fx: Fx;
  private shader: SkillShader;
  /** 残魂脚下的位置 */
  private x: number;
  private y: number;
  private bounds: IdleBounds;
  private onDrop: (wx: Wuxing, x: number, y: number) => void;

  private form: WeaponForm = UNARMED_FORM;
  private skills: SkillId[] = [];
  private mobs: Mob[] = [];
  private spawnT = 600;
  private atkT = 500;
  private skillT = 5000;
  private skillIdx = 0;
  private active = false;
  /** 场上没有妖异时闲逛去的地方 */
  private roam: { x: number; y: number } | null = null;
  private roamT = 0;
  private hp = HP_MAX;
  /** 倒下后离复活还有多久 */
  private downT = 0;
  /** 刚复活的无敌时间 */
  private invuln = 0;
  /** 出招硬直：动作放完之前不走动 */
  private lockT = 0;
  private bar: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, avatar: Avatar, fx: Fx, shader: SkillShader, bounds: IdleBounds, onDrop: (wx: Wuxing, x: number, y: number) => void) {
    this.scene = scene;
    this.avatar = avatar;
    this.fx = fx;
    this.shader = shader;
    this.bounds = bounds;
    this.x = (bounds.left + bounds.right) / 2;
    this.y = (bounds.top + bounds.bottom) / 2;
    this.onDrop = onDrop;
    ensureCharAnims(scene, Object.values(MONSTER_ATLAS_MAP));
    this.bar = scene.add.graphics().setDepth(4500);
    this.place();
  }

  setLoadout(form: WeaponForm, skills: SkillId[]): void {
    this.form = form;
    this.skills = skills;
  }

  /** 可活动的范围变了（比如下半屏被组队面板占了） */
  setBounds(b: IdleBounds): void {
    this.bounds = b;
    this.x = Phaser.Math.Clamp(this.x, b.left, b.right);
    this.y = Phaser.Math.Clamp(this.y, b.top, b.bottom);
    this.roam = null;
    this.place();
  }

  /** 关掉时把场上的妖异清走 */
  setActive(v: boolean): void {
    if (this.active === v) return;
    this.active = v;
    if (!v) {
      this.mobs.forEach(m => { m.spr.destroy(); m.shadow.destroy(); });
      this.mobs = [];
      this.hp = HP_MAX; this.downT = 0; this.lockT = 0;
      this.avatar.setDown(false);
      this.bar.clear();
    }
  }

  private place(): void {
    this.avatar.setPosition(this.x, this.y).setDepth(this.y);
  }

  /** 够得着的距离：近战贴身，远程隔着半个场子就开打 */
  private get reach(): number {
    return this.form.melee ? this.form.range * 0.75 + 20 : Math.min(this.form.range * 0.6, 300);
  }

  /** 妖异从场地四周冒出来 */
  private spawn(): void {
    const def = MONSTERS[Math.floor(Math.random() * MONSTERS.length)];
    const atlas = MONSTER_ATLAS_MAP[def.atlas];
    if (!atlas || !this.scene.textures.exists(atlas)) return;
    // 散落在场地各处，离残魂远一些；凭空凝出来
    const b = this.bounds;
    let x = 0, y = 0;
    for (let i = 0; i < 8; i++) {
      x = Phaser.Math.Between(b.left - 30, b.right + 30);
      y = Phaser.Math.Between(b.top, b.bottom);
      if (Math.hypot(x - this.x, y - this.y) > 300) break;
    }
    const spr = this.scene.add.sprite(x, y - FOOT, atlas, 'character_idle_0').setScale(SCALE).setDepth(y);
    if (this.scene.anims.exists(`${atlas}_idle`)) spr.play(`${atlas}_idle`);
    const shadow = this.scene.add.image(x, y, 'fx_shadow').setScale(SCALE * 3).setDepth(y - 1);
    spr.setAlpha(0); shadow.setAlpha(0);
    this.scene.tweens.add({ targets: [spr, shadow], alpha: 1, duration: 420 });
    this.fx.flashGlow(x, y - FOOT, 70, WX_TINT[def.wuxing], 380, 0.4);
    this.mobs.push({
      def, spr, shadow, x, y,
      hp: this.form.melee && this.form.kind !== '刃' ? 6 : 7,
      // 施法的妖异隔着一段距离出手，其余的贴上来打
      stop: def.kind === 'caster' ? 190 + Math.random() * 50 : 46 + Math.random() * 30,
      speed: def.speed * 0.62,
      dead: false,
      atkT: 200 + Math.random() * 400,
      anim: 'idle',
      aggro: false, roamX: x, roamY: y, roamT: 800 + Math.random() * 2500,
    });
  }

  private hit(m: Mob, power: number = 1): void {
    if (m.dead) return;
    m.aggro = true;
    m.hp -= power;
    const d = Math.hypot(m.x - this.x, m.y - this.y) || 1;
    m.x += (m.x - this.x) / d * 10;
    m.y += (m.y - this.y) / d * 10;
    m.spr.setTintFill(0xffffff);
    this.scene.time.delayedCall(60, () => { if (m.spr.active) m.spr.clearTint(); });
    this.fx.burst(m.x, m.y - FOOT, 0xffc06a, 3);
    if (m.hp > 0) return;
    m.dead = true;
    const atlas = MONSTER_ATLAS_MAP[m.def.atlas];
    if (atlas && this.scene.anims.exists(`${atlas}_die`)) m.spr.play(`${atlas}_die`, true);
    this.fx.burst(m.x, m.y - FOOT, WX_TINT[m.def.wuxing], 6);
    this.scene.tweens.add({ targets: [m.spr, m.shadow], alpha: 0, duration: 320, delay: 420, onComplete: () => { m.spr.destroy(); m.shadow.destroy(); } });
    this.onDrop(m.def.wuxing, m.x, m.y - FOOT);
  }

  private dist(m: Mob): number {
    return Math.hypot(m.x - this.x, m.y - this.y);
  }

  private attack(): boolean {
    const live = this.mobs.filter(m => !m.dead && this.dist(m) <= this.reach + 10).sort((a, b) => this.dist(a) - this.dist(b));
    if (!live.length) return false;
    const form = this.form;
    const t = live[0];
    const dir = t.x >= this.x ? 1 : -1;
    this.avatar.setFacing(dir);
    const ang = Math.atan2(t.y - this.y, t.x - this.x);
    const sx = this.x + dir * 18, sy = this.y - 62;
    this.lockT = 340;
    if (form.melee) {
      this.avatar.play(form.arc > 0 ? 'slash' : 'attack');
      const r = form.range * 0.45;
      const mx = this.x + Math.cos(ang) * r, my = this.y - 40 + Math.sin(ang) * r;
      if (form.arc > 0) this.fx.slash(mx, my, ang + 0.9, form.range * 0.9, 0xffe2a0);
      else this.fx.slash(mx, my, ang, form.range * 1.1, 0xffe2a0);
      // 剑和枪一下扫中一片，刃只砍最近的
      (form.kind === '刃' ? [t] : live).forEach(m => this.hit(m));
      return true;
    }
    this.avatar.play('attack');
    const targets = live.slice(0, Math.max(1, form.bolts));
    for (let i = 0; i < Math.max(1, form.bolts); i++) {
      const m = targets[i % targets.length];
      const ty = m.y - FOOT + (form.bolts > 1 ? (i - 1) * 16 : 0);
      const bolt = this.scene.add.image(sx, sy, 'fx_bolt').setTint(0xffe2a0).setBlendMode(Phaser.BlendModes.ADD)
        .setOrigin(0.85, 0.5).setScale(form.bolts > 1 || form.kind === '空手' ? 0.5 : 0.7).setRotation(Math.atan2(ty - sy, m.x - sx)).setDepth(FX_DEPTH - 6);
      this.scene.tweens.add({ targets: bolt, x: m.x, y: ty, duration: 150, onComplete: () => { bolt.destroy(); this.hit(m, i < targets.length ? 1 : 0.5); } });
    }
    return true;
  }

  /** 每隔一阵放一门带着的技能，把身边的妖异一扫而空 */
  private castSkill(): boolean {
    const near = this.mobs.filter(m => !m.dead && this.dist(m) < 230);
    if (!this.skills.length || near.length < 2) return false;
    const id = this.skills[this.skillIdx++ % this.skills.length];
    const kind = SHADER_OF[id];
    const tint = WX_TINT[SKILLS[id].wuxing];
    this.avatar.play('cast');
    this.lockT = 460;
    const cx = this.x, cy = this.y - 30;
    if (id === 'blades') {
      near.forEach((m, i) => this.scene.time.delayedCall(i * 70, () => {
        const ang = Math.atan2(m.y - FOOT - (this.y - 70), m.x - this.x);
        const len = Math.hypot(m.x - this.x, m.y - FOOT - (this.y - 70)) + 60;
        this.shader.play('blade', (this.x + m.x) / 2, (this.y - 70 + m.y - FOOT) / 2, len, 300, FX_DEPTH - 5, ang);
        if (!this.shader.enabled) this.fx.slash((this.x + m.x) / 2, (this.y - 70 + m.y - FOOT) / 2, ang, len, 0xfff3c0);
      }));
    } else if (id === 'bastion') {
      this.shader.play(kind, cx, cy, 150, 1200, FX_DEPTH - 6, 0, () => ({ x: this.x, y: this.y - 30 }));
    } else {
      this.shader.play(kind, cx, cy, 440, id === 'frost' ? 900 : 600, FX_DEPTH - 6);
    }
    if (!this.shader.enabled) this.fx.ring(cx, cy, 200, tint, 460, 0.1);
    this.fx.flashGlow(cx, cy, 100, tint, 260, 0.12);
    this.scene.time.delayedCall(220, () => near.forEach(m => this.hit(m, 9)));
    return true;
  }

  /** 残魂自己找事做：追最近的妖异，够得着就停下来打；没妖异就四处走走 */
  private moveHero(sec: number): void {
    // 招式没收完不走动
    if (this.lockT > 0) { this.avatar.setMoving(0); return; }
    const live = this.mobs.filter(m => !m.dead);
    let tx = this.x, ty = this.y, stopAt = 6;
    if (live.length) {
      const t = live.reduce((a, b) => (this.dist(a) < this.dist(b) ? a : b));
      // 目标还在场外：迎上去，但不走出场地
      tx = t.x; ty = t.y; stopAt = this.reach * 0.8;
      this.roam = null;
    } else {
      this.roamT -= sec * 1000;
      if (!this.roam || this.roamT <= 0) {
        const b = this.bounds;
        this.roam = { x: Phaser.Math.Between(b.left, b.right), y: Phaser.Math.Between(b.top, b.bottom) };
        this.roamT = 2600 + Math.random() * 2000;
      }
      tx = this.roam.x; ty = this.roam.y;
    }
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
    if (d <= stopAt) { this.avatar.setMoving(0); return; }
    const step = Math.min(d - stopAt, WALK * sec);
    const b = this.bounds;
    const nx = Phaser.Math.Clamp(this.x + dx / d * step, b.left, b.right);
    const ny = Phaser.Math.Clamp(this.y + dy / d * step, b.top, b.bottom);
    const moved = Math.hypot(nx - this.x, ny - this.y) > 0.2;
    this.x = nx; this.y = ny;
    this.avatar.setMoving(moved ? 0.85 : 0);
    if (moved && Math.abs(dx) > 4) this.avatar.setFacing(dx);
    this.place();
  }

  private setAnim(m: Mob, anim: string): void {
    if (m.anim === anim) return;
    m.anim = anim;
    const key = `${MONSTER_ATLAS_MAP[m.def.atlas]}_${anim}`;
    if (this.scene.anims.exists(key)) m.spr.play(key, true);
  }

  /** 妖异贴上来就动手：抬手，片刻后打中 */
  private mobAttack(m: Mob): void {
    m.atkT = 1100 + Math.random() * 700;
    const caster = m.def.kind === 'caster';
    this.setAnim(m, caster ? 'magic' : 'atk');
    if (caster) {
      const bolt = this.scene.add.image(m.x, m.y - FOOT, 'fx_glow').setTint(WX_TINT[m.def.wuxing]).setBlendMode(Phaser.BlendModes.ADD).setScale(0.12).setDepth(FX_DEPTH - 6);
      this.scene.tweens.add({ targets: bolt, x: this.x, y: this.y - 50, duration: 300, delay: 200, onComplete: () => bolt.destroy() });
    }
    this.scene.time.delayedCall(caster ? 500 : 260, () => {
      if (m.dead || !m.spr.active || this.downT > 0 || this.invuln > 0 || !this.active) return;
      if (!caster && this.dist(m) > m.stop + 40) return;
      this.hp -= MOB_DMG;
      this.avatar.hurt();
      this.fx.burst(this.x, this.y - 50, 0xff6b6b, 3);
      if (this.hp <= 0) this.fall();
    });
    this.scene.time.delayedCall(620, () => { if (!m.dead && m.spr.active && (m.anim === 'atk' || m.anim === 'magic')) this.setAnim(m, 'idle'); });
  }

  private fall(): void {
    this.hp = 0;
    this.downT = DOWN_MS;
    this.lockT = 0;
    this.avatar.setMoving(0);
    this.avatar.setDown(true);
    this.fx.burst(this.x, this.y - 40, 0x9fd8ff, 10);
  }

  /** 躺够了重新凝聚：满血起身，把围着的妖异震开 */
  private revive(): void {
    this.hp = HP_MAX;
    this.invuln = 1500;
    this.avatar.setDown(false);
    this.fx.flashGlow(this.x, this.y - 40, 150, 0x9fd8ff, 420, 0.5);
    this.fx.ring(this.x, this.y, 150, 0x9fd8ff, 420, 0.12);
    for (const m of this.mobs) {
      if (m.dead) continue;
      const d = this.dist(m) || 1;
      if (d < 170) { m.x += (m.x - this.x) / d * (170 - d); m.y += (m.y - this.y) / d * (170 - d); }
    }
  }

  private drawBar(): void {
    this.bar.clear();
    if (this.hp >= HP_MAX && this.downT <= 0) return;
    const w = 64, x = this.x - w / 2, y = this.y - 150;
    this.bar.fillStyle(0x000000, 0.65).fillRect(x - 2, y - 2, w + 4, 9);
    if (this.downT > 0) this.bar.fillStyle(0x9fd8ff, 0.9).fillRect(x, y, w * (1 - this.downT / DOWN_MS), 5);
    else this.bar.fillStyle(0x3fb950, 1).fillRect(x, y, w * Math.max(0, this.hp / HP_MAX), 5);
  }

  update(dt: number): void {
    if (!this.active) return;
    const sec = dt / 1000;
    this.mobs = this.mobs.filter(m => m.spr.active);
    this.lockT = Math.max(0, this.lockT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    const down = this.downT > 0;
    if (down) {
      this.downT -= dt;
      if (this.downT <= 0) this.revive();
    } else {
      this.hp = Math.min(HP_MAX, this.hp + REGEN * sec);
      this.moveHero(sec);
    }
    for (const m of this.mobs) {
      if (m.dead) continue;
      const dx = this.x - m.x, dy = this.y - m.y, d = Math.hypot(dx, dy) || 1;
      if (down) {
        // 残魂倒下了：妖异在原地晃着
        if (m.anim !== 'atk' && m.anim !== 'magic') this.setAnim(m, 'idle');
      } else if (m.anim === 'atk' || m.anim === 'magic') {
        // 出手的动作没放完，站着不动
      } else if (!m.aggro) {
        // 靠近了才出击；平时在原地附近慢慢晃
        if (d < AGGRO) { m.aggro = true; continue; }
        m.roamT -= dt;
        if (m.roamT <= 0) {
          m.roamT = 2400 + Math.random() * 3000;
          m.roamX = Phaser.Math.Clamp(m.x + Phaser.Math.Between(-70, 70), this.bounds.left - 30, this.bounds.right + 30);
          m.roamY = Phaser.Math.Clamp(m.y + Phaser.Math.Between(-70, 70), this.bounds.top, this.bounds.bottom);
        }
        const rx = m.roamX - m.x, ry = m.roamY - m.y, rd = Math.hypot(rx, ry);
        if (rd > 4) {
          const step = Math.min(rd, m.speed * 0.35 * sec);
          m.x += rx / rd * step; m.y += ry / rd * step;
          this.setAnim(m, 'run');
          m.spr.setPosition(m.x, m.y - FOOT).setFlipX(rx < 0).setDepth(m.y);
          m.shadow.setPosition(m.x, m.y).setDepth(m.y - 1);
          continue;
        }
        this.setAnim(m, 'idle');
      } else if (d > m.stop + 4) {
        const step = Math.min(d - m.stop, m.speed * sec);
        m.x += dx / d * step; m.y += dy / d * step;
        if (m.anim !== 'atk' && m.anim !== 'magic') this.setAnim(m, 'run');
      } else {
        if (m.anim === 'run') this.setAnim(m, 'idle');
        m.atkT -= dt;
        if (m.atkT <= 0) this.mobAttack(m);
      }
      m.spr.setPosition(m.x, m.y - FOOT).setFlipX(dx < 0).setDepth(m.y);
      m.shadow.setPosition(m.x, m.y).setDepth(m.y - 1);
    }
    this.drawBar();

    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 900 + Math.random() * 1200;
      if (this.mobs.filter(m => !m.dead).length < 5) this.spawn();
    }
    if (down) return;
    this.skillT -= dt;
    if (this.skillT <= 0) this.skillT = this.castSkill() ? 6500 : 700;
    this.atkT -= dt;
    if (this.atkT <= 0) this.atkT = this.attack() ? Math.max(420, this.form.interval * 1.15) : 150;
  }
}
