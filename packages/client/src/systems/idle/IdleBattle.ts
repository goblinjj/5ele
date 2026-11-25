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
}

const SCALE = ENEMY_SCALE * 1.45;
/** 贴图中心到脚底的距离 */
const FOOT = 307 * SCALE * 0.36;

export class IdleBattle {
  private scene: Phaser.Scene;
  private avatar: Avatar;
  private fx: Fx;
  private shader: SkillShader;
  private x: number;
  private y: number;
  private right: number;
  private onDrop: (wx: Wuxing, x: number, y: number) => void;

  private form: WeaponForm = UNARMED_FORM;
  private skills: SkillId[] = [];
  private mobs: Mob[] = [];
  private spawnT = 600;
  private atkT = 500;
  private skillT = 5000;
  private skillIdx = 0;
  private active = false;

  constructor(scene: Phaser.Scene, avatar: Avatar, fx: Fx, shader: SkillShader, x: number, y: number, right: number, onDrop: (wx: Wuxing, x: number, y: number) => void) {
    this.scene = scene;
    this.avatar = avatar;
    this.fx = fx;
    this.shader = shader;
    this.x = x;
    this.y = y;
    this.right = right;
    this.onDrop = onDrop;
    ensureCharAnims(scene, Object.values(MONSTER_ATLAS_MAP));
  }

  setLoadout(form: WeaponForm, skills: SkillId[]): void {
    this.form = form;
    this.skills = skills;
  }

  /** 关掉时把场上的妖异清走 */
  setActive(v: boolean): void {
    if (this.active === v) return;
    this.active = v;
    if (!v) {
      this.mobs.forEach(m => { m.spr.destroy(); m.shadow.destroy(); });
      this.mobs = [];
    }
  }

  private get reach(): number {
    return this.form.melee ? this.form.range + 20 : Math.min(this.form.range, this.right - this.x - 40);
  }

  private spawn(): void {
    const def = MONSTERS[Math.floor(Math.random() * MONSTERS.length)];
    const atlas = MONSTER_ATLAS_MAP[def.atlas];
    if (!atlas || !this.scene.textures.exists(atlas)) return;
    const y = this.y + Phaser.Math.Between(-150, 120);
    const x = this.right + 90;
    const spr = this.scene.add.sprite(x, y - FOOT, atlas, 'character_idle_0').setScale(SCALE).setFlipX(true).setDepth(y);
    if (this.scene.anims.exists(`${atlas}_run`)) spr.play(`${atlas}_run`);
    const shadow = this.scene.add.image(x, y, 'fx_shadow').setScale(SCALE * 3).setDepth(y - 1);
    this.mobs.push({
      def, spr, shadow, x, y,
      hp: this.form.melee && this.form.kind !== '刃' ? 2 : 3,
      stop: (this.form.melee ? 110 : 150) + Math.random() * 60,
      speed: def.speed * 0.75,
      dead: false,
    });
  }

  private hit(m: Mob, power: number = 1): void {
    if (m.dead) return;
    m.hp -= power;
    m.x += 12;
    m.spr.setTintFill(0xffffff);
    this.scene.time.delayedCall(60, () => { if (m.spr.active) m.spr.clearTint(); });
    this.fx.burst(m.x, m.y - FOOT, 0xffc06a, 5);
    if (m.hp > 0) return;
    m.dead = true;
    const atlas = MONSTER_ATLAS_MAP[m.def.atlas];
    if (atlas && this.scene.anims.exists(`${atlas}_die`)) m.spr.play(`${atlas}_die`, true);
    this.fx.burst(m.x, m.y - FOOT, WX_TINT[m.def.wuxing], 10);
    this.scene.tweens.add({ targets: [m.spr, m.shadow], alpha: 0, duration: 320, delay: 120, onComplete: () => { m.spr.destroy(); m.shadow.destroy(); } });
    this.onDrop(m.def.wuxing, m.x, m.y - FOOT);
  }

  private attack(): boolean {
    const live = this.mobs.filter(m => !m.dead && m.x - this.x <= this.reach && m.x < this.right - 10).sort((a, b) => a.x - b.x);
    if (!live.length) return false;
    const form = this.form;
    const sx = this.x + 30, sy = this.y - 110;
    if (form.melee) {
      this.avatar.play(form.arc > 0 ? 'slash' : 'attack');
      const t = live[0];
      const mx = this.x + form.range * 0.6, my = this.y - 70;
      if (form.arc > 0) {
        this.fx.slash(mx, my, 1.2, form.range * 1.5, 0xffe2a0);
        if (form.kind === '剑') this.fx.slash(mx + 10, my + 10, 1.9, form.range * 1.3, 0xffe2a0);
      } else {
        this.fx.slash(this.x + form.range * 0.55, my, 0, form.range * 1.9, 0xffe2a0);
      }
      // 剑和枪一下扫中一片，刃只砍最近的
      (form.kind === '刃' ? [t] : live).forEach(m => this.hit(m));
      return true;
    }
    this.avatar.play('attack');
    this.fx.flashGlow(sx + 20, sy, 60, 0xffd27a, 120, 0.8);
    const targets = live.slice(0, Math.max(1, form.bolts));
    for (let i = 0; i < Math.max(1, form.bolts); i++) {
      const m = targets[i % targets.length];
      const ty = m.y - FOOT + (form.bolts > 1 ? (i - 1) * 26 : 0);
      const bolt = this.scene.add.image(sx, sy, 'fx_bolt').setTint(0xffe2a0).setBlendMode(Phaser.BlendModes.ADD)
        .setOrigin(0.85, 0.5).setScale(form.bolts > 1 || form.kind === '空手' ? 0.8 : 1.1).setRotation(Math.atan2(ty - sy, m.x - sx)).setDepth(FX_DEPTH - 6);
      this.scene.tweens.add({ targets: bolt, x: m.x, y: ty, duration: 150, onComplete: () => { bolt.destroy(); this.hit(m, i < targets.length ? 1 : 0.5); } });
    }
    return true;
  }

  /** 每隔一阵放一门带着的技能，把场上的妖异一扫而空 */
  private castSkill(): boolean {
    const live = this.mobs.filter(m => !m.dead && m.x < this.right);
    if (!this.skills.length || live.length < 2) return false;
    const id = this.skills[this.skillIdx++ % this.skills.length];
    const kind = SHADER_OF[id];
    const tint = WX_TINT[SKILLS[id].wuxing];
    this.avatar.play('cast');
    const cx = this.x + 150, cy = this.y - 50;
    if (id === 'blades') {
      live.forEach((m, i) => this.scene.time.delayedCall(i * 70, () => {
        const ang = Math.atan2(m.y - FOOT - (this.y - 120), m.x - this.x);
        const len = Math.hypot(m.x - this.x, m.y - FOOT - (this.y - 120)) + 120;
        this.shader.play('blade', (this.x + m.x) / 2, (this.y - 120 + m.y - FOOT) / 2, len, 300, FX_DEPTH - 5, ang);
        if (!this.shader.enabled) this.fx.slash((this.x + m.x) / 2, (this.y - 120 + m.y - FOOT) / 2, ang, len, 0xfff3c0);
      }));
    } else if (id === 'bastion' || id === 'bloom') {
      this.shader.play(kind, this.x, this.y - 70, id === 'bastion' ? 220 : 320, id === 'bastion' ? 1200 : 900, FX_DEPTH - 6);
    } else {
      this.shader.play(kind, cx, cy, 400, id === 'frost' ? 900 : 600, FX_DEPTH - 6);
    }
    if (!this.shader.enabled) this.fx.ring(cx, cy, 240, tint, 460, 0.1);
    this.fx.flashGlow(cx, cy, 120, tint, 260, 0.12);
    this.scene.time.delayedCall(220, () => live.forEach(m => this.hit(m, 9)));
    return true;
  }

  update(dt: number): void {
    if (!this.active) return;
    const sec = dt / 1000;
    this.mobs = this.mobs.filter(m => m.spr.active);
    for (const m of this.mobs) {
      if (m.dead) continue;
      const target = this.x + m.stop;
      if (m.x > target) m.x = Math.max(target, m.x - m.speed * sec);
      m.spr.setPosition(m.x, m.y - FOOT);
      m.shadow.setPosition(m.x, m.y);
    }

    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 900 + Math.random() * 900;
      if (this.mobs.filter(m => !m.dead).length < 4) this.spawn();
    }
    this.skillT -= dt;
    if (this.skillT <= 0) this.skillT = this.castSkill() ? 6500 : 700;
    this.atkT -= dt;
    if (this.atkT <= 0) this.atkT = this.attack() ? Math.max(380, this.form.interval * 1.15) : 150;
  }
}
