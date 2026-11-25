import Phaser from 'phaser';
import { MONSTERS, MonsterDef, WeaponForm, UNARMED_FORM, SkillId, SkillKind, SKILLS, Wuxing } from '@xiyou/shared';
import { ENEMY_SCALE, WX_TINT } from '../../config/worldConfig.js';
import { MONSTER_ATLAS_MAP } from '../world/SpawnSystem.js';
import { Avatar, AvatarLook } from '../avatar/Avatar.js';
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

/** 挂机演出里每种路数用哪套特效（只求看得出是哪一类，不求和秘境里一模一样） */
const SHADER_OF: Record<SkillKind, ShaderKind> = {
  nova: 'fire', strike: 'blast', blades: 'blade', lance: 'blade', zone: 'frost', heal: 'bloom', guard: 'bastion', buff: 'bastion',
};
const NATIVE: Record<ShaderKind, Wuxing | null> = {
  fire: Wuxing.FIRE, blast: Wuxing.FIRE, frost: Wuxing.WATER, bloom: Wuxing.WOOD, bastion: Wuxing.EARTH, blade: Wuxing.METAL,
  warnCircle: null, warnLane: null, impact: null, claw: null, wisp: null,
};

interface Mob {
  def: MonsterDef;
  spr: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  x: number;
  y: number;
  hp: number;
  /** 走到离目标多远就停下 */
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

/** 场上的一个人：自己，或者队友 */
interface Hero {
  id: string;
  avatar: Avatar;
  /** 队友头上的名字；自己没有 */
  label: Phaser.GameObjects.Text | null;
  mine: boolean;
  x: number;
  y: number;
  form: WeaponForm;
  skills: SkillId[];
  hp: number;
  /** 倒下后离复活还有多久 */
  downT: number;
  /** 刚复活的无敌时间 */
  invuln: number;
  /** 出招硬直：动作放完之前不走动 */
  lockT: number;
  atkT: number;
  skillT: number;
  skillIdx: number;
  /** 场上没有妖异时闲逛去的地方 */
  roam: { x: number; y: number } | null;
  roamT: number;
  sig: string;
}

/** 队友长什么样、怎么出手 */
export interface IdleMate {
  id: string;
  name: string;
  look: AvatarLook;
  form: WeaponForm;
  skills: SkillId[];
  sig: string;
}

const SCALE = ENEMY_SCALE;
/** 贴图中心到脚底的距离 */
const FOOT = 307 * SCALE * 0.36;
/** 人走路的速度（像素/秒） */
const WALK = 170;
const HERO_SCALE = 1.1;
/** 演出用的血量：妖异每下打掉多少、每秒回多少、倒下后躺多久 */
const HP_MAX = 100;
const MOB_DMG = 9;
const REGEN = 1.5;
const DOWN_MS = 3500;
/** 人走到多近，妖异才会扑上来 */
const AGGRO = 210;

export interface IdleBounds { left: number; top: number; right: number; bottom: number }

export class IdleBattle {
  private scene: Phaser.Scene;
  private fx: Fx;
  private shader: SkillShader;
  private bounds: IdleBounds;
  private onDrop: (wx: Wuxing, x: number, y: number) => void;

  /** 第一个是自己，后面是队友 */
  private heroes: Hero[] = [];
  private mobs: Mob[] = [];
  private spawnT = 600;
  private active = false;
  private bar: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, avatar: Avatar, fx: Fx, shader: SkillShader, bounds: IdleBounds, onDrop: (wx: Wuxing, x: number, y: number) => void) {
    this.scene = scene;
    this.fx = fx;
    this.shader = shader;
    this.bounds = bounds;
    this.onDrop = onDrop;
    ensureCharAnims(scene, Object.values(MONSTER_ATLAS_MAP));
    this.bar = scene.add.graphics().setDepth(4500);
    this.heroes.push(this.makeHero('me', avatar, null, true, (bounds.left + bounds.right) / 2, (bounds.top + bounds.bottom) / 2));
    this.place(this.heroes[0]);
  }

  private makeHero(id: string, avatar: Avatar, label: Phaser.GameObjects.Text | null, mine: boolean, x: number, y: number): Hero {
    return {
      id, avatar, label, mine, x, y, form: UNARMED_FORM, skills: [],
      hp: HP_MAX, downT: 0, invuln: 0, lockT: 0, atkT: 500 + Math.random() * 400, skillT: 4000 + Math.random() * 3000, skillIdx: 0,
      roam: null, roamT: 0, sig: '',
    };
  }

  setLoadout(form: WeaponForm, skills: SkillId[]): void {
    this.heroes[0].form = form;
    this.heroes[0].skills = skills;
  }

  /** 队伍里的其他人：进来的添上，走了的撤掉，换了装备的换装 */
  setMates(mates: IdleMate[]): void {
    const keep = new Set(mates.map(m => m.id));
    this.heroes = this.heroes.filter(h => {
      if (h.mine || keep.has(h.id)) return true;
      h.avatar.destroy(); h.label?.destroy();
      return false;
    });
    for (const m of mates) {
      let h = this.heroes.find(q => q.id === m.id);
      if (!h) {
        const b = this.bounds;
        const x = Phaser.Math.Between(b.left, b.right), y = Phaser.Math.Between(b.top, b.bottom);
        const avatar = new Avatar(this.scene, x, y, m.look, HERO_SCALE);
        const label = this.scene.add.text(x, y, m.name, { fontFamily: 'sans-serif', fontSize: '18px', color: '#79c0ff', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5, 1);
        h = this.makeHero(m.id, avatar, label, false, x, y);
        this.heroes.push(h);
        this.fx.flashGlow(x, y - 50, 110, 0x79c0ff, 420, 0.4);
      } else if (h.sig !== m.sig) {
        h.avatar.setLook(m.look);
      }
      if (h.label && h.label.text !== m.name) h.label.setText(m.name);
      h.sig = m.sig; h.form = m.form; h.skills = m.skills;
      h.avatar.setVisible(this.active); h.label?.setVisible(this.active);
      this.place(h);
    }
  }

  /** 可活动的范围变了 */
  setBounds(b: IdleBounds): void {
    this.bounds = b;
    for (const h of this.heroes) {
      h.x = Phaser.Math.Clamp(h.x, b.left, b.right);
      h.y = Phaser.Math.Clamp(h.y, b.top, b.bottom);
      h.roam = null;
      this.place(h);
    }
  }

  /** 关掉时把场上的妖异清走 */
  setActive(v: boolean): void {
    if (this.active === v) return;
    this.active = v;
    for (const h of this.heroes) {
      if (!h.mine) { h.avatar.setVisible(v); h.label?.setVisible(v); }
      if (!v) { h.hp = HP_MAX; h.downT = 0; h.lockT = 0; h.avatar.setDown(false); }
    }
    if (!v) {
      this.mobs.forEach(m => { m.spr.destroy(); m.shadow.destroy(); });
      this.mobs = [];
      this.bar.clear();
    }
  }

  private place(h: Hero): void {
    h.avatar.setPosition(h.x, h.y).setDepth(h.y);
    h.label?.setPosition(h.x, h.y - 142).setDepth(h.y + 1);
  }

  /** 够得着的距离：近战贴身，远程隔着一段就开打 */
  private reach(h: Hero): number {
    return h.form.melee ? h.form.range * 0.75 + 20 : Math.min(h.form.range * 0.6, 300);
  }

  private dist(h: Hero, m: { x: number; y: number }): number {
    return Math.hypot(m.x - h.x, m.y - h.y);
  }

  /** 离某处最近的、还站着的人 */
  private nearestHero(x: number, y: number): Hero | null {
    let best: Hero | null = null, bd = Infinity;
    for (const h of this.heroes) {
      if (h.downT > 0) continue;
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  /** 妖异散落在场地各处，离人远一些；凭空凝出来 */
  private spawn(): void {
    const def = MONSTERS[Math.floor(Math.random() * MONSTERS.length)];
    const atlas = MONSTER_ATLAS_MAP[def.atlas];
    if (!atlas || !this.scene.textures.exists(atlas)) return;
    const b = this.bounds;
    let x = 0, y = 0;
    for (let i = 0; i < 8; i++) {
      x = Phaser.Math.Between(b.left - 30, b.right + 30);
      y = Phaser.Math.Between(b.top, b.bottom);
      if (this.heroes.every(h => Math.hypot(x - h.x, y - h.y) > 280)) break;
    }
    const spr = this.scene.add.sprite(x, y - FOOT, atlas, 'character_idle_0').setScale(SCALE).setDepth(y);
    if (this.scene.anims.exists(`${atlas}_idle`)) spr.play(`${atlas}_idle`);
    const shadow = this.scene.add.image(x, y, 'fx_shadow').setScale(SCALE * 3).setDepth(y - 1);
    spr.setAlpha(0); shadow.setAlpha(0);
    this.scene.tweens.add({ targets: [spr, shadow], alpha: 1, duration: 420 });
    this.fx.flashGlow(x, y - FOOT, 70, WX_TINT[def.wuxing], 380, 0.4);
    this.mobs.push({
      def, spr, shadow, x, y,
      hp: 6,
      // 施法的妖异隔着一段距离出手，其余的贴上来打
      stop: def.kind === 'caster' ? 190 + Math.random() * 50 : 46 + Math.random() * 30,
      speed: def.speed * 0.62,
      dead: false,
      atkT: 200 + Math.random() * 400,
      anim: 'idle',
      aggro: false, roamX: x, roamY: y, roamT: 800 + Math.random() * 2500,
    });
  }

  private hit(h: Hero, m: Mob, power: number = 1): void {
    if (m.dead) return;
    m.aggro = true;
    m.hp -= power;
    const d = this.dist(h, m) || 1;
    m.x += (m.x - h.x) / d * 10;
    m.y += (m.y - h.y) / d * 10;
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

  private attack(h: Hero): boolean {
    const reach = this.reach(h);
    const live = this.mobs.filter(m => !m.dead && this.dist(h, m) <= reach + 10).sort((a, b) => this.dist(h, a) - this.dist(h, b));
    if (!live.length) return false;
    const form = h.form;
    const t = live[0];
    const dir = t.x >= h.x ? 1 : -1;
    h.avatar.setFacing(dir);
    const ang = Math.atan2(t.y - h.y, t.x - h.x);
    const sx = h.x + dir * 18, sy = h.y - 62;
    h.lockT = 340;
    if (form.melee) {
      h.avatar.play(form.arc > 0 ? 'slash' : 'attack');
      const r = form.range * 0.45;
      const mx = h.x + Math.cos(ang) * r, my = h.y - 40 + Math.sin(ang) * r;
      if (form.arc > 0) this.fx.slash(mx, my, ang + 0.9, form.range * 0.9, 0xffe2a0);
      else this.fx.slash(mx, my, ang, form.range * 1.1, 0xffe2a0);
      // 剑和枪一下扫中一片，刃只砍最近的
      (form.kind === '刃' ? [t] : live).forEach(m => this.hit(h, m));
      return true;
    }
    h.avatar.play('attack');
    const targets = live.slice(0, Math.max(1, form.bolts));
    for (let i = 0; i < Math.max(1, form.bolts); i++) {
      const m = targets[i % targets.length];
      const ty = m.y - FOOT + (form.bolts > 1 ? (i - 1) * 16 : 0);
      const bolt = this.scene.add.image(sx, sy, 'fx_bolt').setTint(0xffe2a0).setBlendMode(Phaser.BlendModes.ADD)
        .setOrigin(0.85, 0.5).setScale(form.bolts > 1 || form.kind === '空手' ? 0.5 : 0.7).setRotation(Math.atan2(ty - sy, m.x - sx)).setDepth(FX_DEPTH - 6);
      this.scene.tweens.add({ targets: bolt, x: m.x, y: ty, duration: 150, onComplete: () => { bolt.destroy(); this.hit(h, m, i < targets.length ? 1 : 0.5); } });
    }
    return true;
  }

  /** 每隔一阵放一门带着的技能，把身边的妖异一扫而空 */
  private castSkill(h: Hero): boolean {
    const near = this.mobs.filter(m => !m.dead && this.dist(h, m) < 230);
    if (!h.skills.length || near.length < 2) return false;
    const id = h.skills[h.skillIdx++ % h.skills.length];
    const def = SKILLS[id];
    if (!def) return false;
    const kind = SHADER_OF[def.kind];
    const tint = WX_TINT[def.wuxing];
    const dye = NATIVE[kind] === def.wuxing ? undefined : { color: tint };
    h.avatar.play('cast');
    h.lockT = 460;
    const cx = h.x, cy = h.y - 30;
    if (def.kind === 'blades' || def.kind === 'lance') {
      near.forEach((m, i) => this.scene.time.delayedCall(i * 70, () => {
        const ang = Math.atan2(m.y - FOOT - (h.y - 70), m.x - h.x);
        const len = Math.hypot(m.x - h.x, m.y - FOOT - (h.y - 70)) + 60;
        this.shader.play('blade', (h.x + m.x) / 2, (h.y - 70 + m.y - FOOT) / 2, len, 300, FX_DEPTH - 5, ang, undefined, dye);
        if (!this.shader.enabled) this.fx.slash((h.x + m.x) / 2, (h.y - 70 + m.y - FOOT) / 2, ang, len, tint);
      }));
    } else if (def.kind === 'guard' || def.kind === 'buff') {
      this.shader.play(kind, cx, cy, 150, 1200, FX_DEPTH - 6, 0, () => ({ x: h.x, y: h.y - 30 }), dye);
    } else {
      this.shader.play(kind, cx, cy, 440, def.kind === 'zone' ? 900 : 600, FX_DEPTH - 6, 0, undefined, dye);
    }
    if (!this.shader.enabled) this.fx.ring(cx, cy, 200, tint, 460, 0.1);
    this.fx.flashGlow(cx, cy, 100, tint, 260, 0.12);
    this.scene.time.delayedCall(220, () => near.forEach(m => this.hit(h, m, 9)));
    return true;
  }

  /** 各人自己找事做：追最近的妖异，够得着就停下来打；没妖异就四处走走 */
  private moveHero(h: Hero, sec: number): void {
    // 招式没收完不走动
    if (h.lockT > 0) { h.avatar.setMoving(0); return; }
    const live = this.mobs.filter(m => !m.dead);
    let tx = h.x, ty = h.y, stopAt = 6;
    if (live.length) {
      // 队友各挑各的：别人已经贴上去的那只，自己就嫌远一点
      const busy = (m: Mob) => this.heroes.some(o => o !== h && o.downT <= 0 && this.dist(o, m) < 150) ? 220 : 0;
      const t = live.reduce((a, b) => (this.dist(h, a) + busy(a) < this.dist(h, b) + busy(b) ? a : b));
      tx = t.x; ty = t.y; stopAt = this.reach(h) * 0.8;
      h.roam = null;
    } else {
      h.roamT -= sec * 1000;
      if (!h.roam || h.roamT <= 0) {
        const b = this.bounds;
        h.roam = { x: Phaser.Math.Between(b.left, b.right), y: Phaser.Math.Between(b.top, b.bottom) };
        h.roamT = 2600 + Math.random() * 2000;
      }
      tx = h.roam.x; ty = h.roam.y;
    }
    const dx = tx - h.x, dy = ty - h.y, d = Math.hypot(dx, dy);
    if (d <= stopAt) { h.avatar.setMoving(0); return; }
    const step = Math.min(d - stopAt, WALK * sec);
    const b = this.bounds;
    const nx = Phaser.Math.Clamp(h.x + dx / d * step, b.left, b.right);
    const ny = Phaser.Math.Clamp(h.y + dy / d * step, b.top, b.bottom);
    const moved = Math.hypot(nx - h.x, ny - h.y) > 0.2;
    h.x = nx; h.y = ny;
    h.avatar.setMoving(moved ? 0.85 : 0);
    if (moved && Math.abs(dx) > 4) h.avatar.setFacing(dx);
    this.place(h);
  }

  private setAnim(m: Mob, anim: string): void {
    if (m.anim === anim) return;
    m.anim = anim;
    const key = `${MONSTER_ATLAS_MAP[m.def.atlas]}_${anim}`;
    if (this.scene.anims.exists(key)) m.spr.play(key, true);
  }

  /** 妖异贴上来就动手：抬手，片刻后打中 */
  private mobAttack(m: Mob, h: Hero): void {
    m.atkT = 1100 + Math.random() * 700;
    const caster = m.def.kind === 'caster';
    this.setAnim(m, caster ? 'magic' : 'atk');
    if (caster) {
      const bolt = this.scene.add.image(m.x, m.y - FOOT, 'fx_glow').setTint(WX_TINT[m.def.wuxing]).setBlendMode(Phaser.BlendModes.ADD).setScale(0.12).setDepth(FX_DEPTH - 6);
      this.scene.tweens.add({ targets: bolt, x: h.x, y: h.y - 50, duration: 300, delay: 200, onComplete: () => bolt.destroy() });
    }
    this.scene.time.delayedCall(caster ? 500 : 260, () => {
      if (m.dead || !m.spr.active || h.downT > 0 || h.invuln > 0 || !this.active || !h.avatar.active) return;
      if (!caster && this.dist(h, m) > m.stop + 40) return;
      h.hp -= MOB_DMG;
      h.avatar.hurt();
      this.fx.burst(h.x, h.y - 50, 0xff6b6b, 3);
      if (h.hp <= 0) this.fall(h);
    });
    this.scene.time.delayedCall(620, () => { if (!m.dead && m.spr.active && (m.anim === 'atk' || m.anim === 'magic')) this.setAnim(m, 'idle'); });
  }

  private fall(h: Hero): void {
    h.hp = 0;
    h.downT = DOWN_MS;
    h.lockT = 0;
    h.avatar.setMoving(0);
    h.avatar.setDown(true);
    this.fx.burst(h.x, h.y - 40, 0x9fd8ff, 10);
  }

  /** 躺够了重新凝聚：满血起身，把围着的妖异震开 */
  private revive(h: Hero): void {
    h.hp = HP_MAX;
    h.invuln = 1500;
    h.avatar.setDown(false);
    this.fx.flashGlow(h.x, h.y - 40, 150, 0x9fd8ff, 420, 0.5);
    this.fx.ring(h.x, h.y, 150, 0x9fd8ff, 420, 0.12);
    for (const m of this.mobs) {
      if (m.dead) continue;
      const d = this.dist(h, m) || 1;
      if (d < 170) { m.x += (m.x - h.x) / d * (170 - d); m.y += (m.y - h.y) / d * (170 - d); }
    }
  }

  private drawBars(): void {
    this.bar.clear();
    for (const h of this.heroes) {
      if (h.hp >= HP_MAX && h.downT <= 0) continue;
      const w = 64, x = h.x - w / 2, y = h.y - 136;
      this.bar.fillStyle(0x000000, 0.65).fillRect(x - 2, y - 2, w + 4, 9);
      if (h.downT > 0) this.bar.fillStyle(0x9fd8ff, 0.9).fillRect(x, y, w * (1 - h.downT / DOWN_MS), 5);
      else this.bar.fillStyle(0x3fb950, 1).fillRect(x, y, w * Math.max(0, h.hp / HP_MAX), 5);
    }
  }

  update(dt: number): void {
    if (!this.active) return;
    const sec = dt / 1000;
    this.mobs = this.mobs.filter(m => m.spr.active);

    for (const h of this.heroes) {
      // 自己的人形由营地场景驱动，队友的在这里驱动
      if (!h.mine) h.avatar.tick(dt);
      h.lockT = Math.max(0, h.lockT - dt);
      h.invuln = Math.max(0, h.invuln - dt);
      if (h.downT > 0) {
        h.downT -= dt;
        if (h.downT <= 0) this.revive(h);
        continue;
      }
      h.hp = Math.min(HP_MAX, h.hp + REGEN * sec);
      this.moveHero(h, sec);
      h.skillT -= dt;
      if (h.skillT <= 0) h.skillT = this.castSkill(h) ? 6500 : 700;
      h.atkT -= dt;
      if (h.atkT <= 0) h.atkT = this.attack(h) ? Math.max(420, h.form.interval * 1.15) : 150;
    }

    for (const m of this.mobs) {
      if (m.dead) continue;
      const t = this.nearestHero(m.x, m.y);
      const busy = m.anim === 'atk' || m.anim === 'magic';
      if (!t) {
        // 人都倒下了：妖异在原地晃着
        if (!busy) this.setAnim(m, 'idle');
        continue;
      }
      const dx = t.x - m.x, dy = t.y - m.y, d = Math.hypot(dx, dy) || 1;
      let face = dx;
      if (busy) {
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
          face = rx;
          this.setAnim(m, 'run');
        } else {
          face = m.spr.flipX ? -1 : 1;
          this.setAnim(m, 'idle');
        }
      } else if (d > m.stop + 4) {
        const step = Math.min(d - m.stop, m.speed * sec);
        m.x += dx / d * step; m.y += dy / d * step;
        this.setAnim(m, 'run');
      } else {
        if (m.anim === 'run') this.setAnim(m, 'idle');
        m.atkT -= dt;
        if (m.atkT <= 0) this.mobAttack(m, t);
      }
      m.spr.setPosition(m.x, m.y - FOOT).setFlipX(face < 0).setDepth(m.y);
      m.shadow.setPosition(m.x, m.y).setDepth(m.y - 1);
    }
    this.drawBars();

    // 人多了妖异也多一些
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = (900 + Math.random() * 1200) / Math.sqrt(this.heroes.length);
      if (this.mobs.filter(m => !m.dead).length < 3 + 2 * this.heroes.length) this.spawn();
    }
  }
}
