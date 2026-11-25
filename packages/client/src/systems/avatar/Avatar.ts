import Phaser from 'phaser';
import {
  GearItem, Wuxing, Energy, kindOf, itemColor, WX_ORDER, realmIndex, REALM_COLORS,
} from '@xiyou/shared';
import { WX_TINT } from '../../config/worldConfig.js';

/**
 * 人物：3D 模型预渲染出来的序列帧（tools/render3d 生成 assets/hero）
 *
 *  - 待机、奔跑、挥砍、直刺、出手、施法、受击、倒地各一段，按状态切换
 *  - 兵器仍是程序画的：图集每一帧都记着右手握点和兵器朝向，兵器贴在手上跟着动，
 *    所以换兵器、换品质不用重新渲染模型
 *  - 修过的每一行化作一颗环绕腰间的灵珠；境界到了筑基脚下生出光环
 *
 * 坐标：容器原点在双脚中间，面朝右。
 */

export const HERO_ATLAS = 'hero';
/** 人物站立时在容器里的高度（像素，未乘外部缩放） */
const BODY_H = 122;
const S = 2;
/** 兵器相对人物的大小 */
const WPN = 0.85;

interface ClipDef { frames: number; ms: number; loop: boolean; yoyo: boolean }
interface CharMeta { cell: number; footX: number; footY: number; heightPx: number; clips: Record<string, ClipDef> }

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}
function shade(c: number, k: number): string {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * k));
  const b = Math.min(255, Math.round((c & 255) * k));
  return `rgb(${r},${g},${b})`;
}

function makeTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, w * S, h * S)!;
  const ctx = tex.context;
  ctx.save();
  ctx.scale(S, S);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  ctx.restore();
  tex.refresh();
  return key;
}

/** 人物外观由什么决定 */
export interface AvatarLook {
  weapon: GearItem | null;
  path: Wuxing | null;
  cult: Energy | null;
}

/** 武器：握把在左端，沿 +x 延伸 */
function weaponTex(scene: Phaser.Scene, kind: string, wx: Wuxing, trim: number): { key: string; len: number } {
  const key = `av_wpn_${kind}_${wx}_${trim}`;
  const c = WX_TINT[wx];
  const steel = shade(0xd8dde8, 1);
  const tr = hex(trim);
  const glow = hex(c);
  switch (kind) {
    case '杖':
      makeTex(scene, key, 100, 24, ctx => {
        ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(4, 12); ctx.lineTo(84, 12); ctx.stroke();
        ctx.strokeStyle = tr; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(88, 12, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(88, 12, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(86, 10, 2, 0, Math.PI * 2); ctx.fill();
      });
      return { key, len: 100 };
    case '枪':
      makeTex(scene, key, 112, 20, ctx => {
        ctx.strokeStyle = '#5a3c24'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(2, 10); ctx.lineTo(90, 10); ctx.stroke();
        ctx.fillStyle = '#d23b2a';
        ctx.beginPath(); ctx.moveTo(86, 10); ctx.lineTo(80, 2); ctx.lineTo(78, 18); ctx.closePath(); ctx.fill();
        ctx.fillStyle = steel;
        ctx.beginPath(); ctx.moveTo(88, 6); ctx.lineTo(111, 10); ctx.lineTo(88, 14); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = glow; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(90, 10); ctx.lineTo(108, 10); ctx.stroke();
      });
      return { key, len: 112 };
    case '扇':
      makeTex(scene, key, 48, 52, ctx => {
        ctx.save(); ctx.translate(6, 26);
        ctx.fillStyle = shade(c, 0.85);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 40, -1.05, 1.05); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
        for (let a = -1; a <= 1.01; a += 0.25) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 40, Math.sin(a) * 40); ctx.stroke(); }
        ctx.strokeStyle = tr; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(0, 0, 40, -1.05, 1.05); ctx.stroke();
        ctx.restore();
      });
      return { key, len: 48 };
    case '刃':
      makeTex(scene, key, 84, 24, ctx => {
        ctx.fillStyle = '#3b2a1c'; ctx.fillRect(2, 10, 16, 5);
        ctx.fillStyle = tr; ctx.fillRect(17, 6, 4, 13);
        ctx.fillStyle = steel;
        ctx.beginPath(); ctx.moveTo(21, 8); ctx.quadraticCurveTo(60, 4, 83, 2); ctx.quadraticCurveTo(70, 16, 21, 17); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = glow; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(24, 9); ctx.quadraticCurveTo(60, 6, 80, 4); ctx.stroke();
      });
      return { key, len: 84 };
    default: // 剑
      makeTex(scene, key, 86, 16, ctx => {
        ctx.fillStyle = '#3b2a1c'; ctx.fillRect(2, 6, 14, 4);
        ctx.fillStyle = tr; ctx.fillRect(15, 2, 4, 12);
        ctx.fillStyle = steel;
        ctx.beginPath(); ctx.moveTo(19, 5); ctx.lineTo(78, 5); ctx.lineTo(85, 8); ctx.lineTo(78, 11); ctx.lineTo(19, 11); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = glow; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(21, 8); ctx.lineTo(80, 8); ctx.stroke();
      });
      return { key, len: 86 };
  }
}

// ───────────────────────── 人物 ─────────────────────────

export type AvatarAction = 'none' | 'attack' | 'slash' | 'cast';

/** 未入道的残魂：整个人泛着冷光、半透明 */
const SPIRIT_TINT = 0xbfe0ff;

export class Avatar extends Phaser.GameObjects.Container {
  private baseScale: number;
  private facing = 1;
  private moving = 0;
  private dashing = false;
  private down = false;
  private action: AvatarAction = 'none';
  private actionT = 0;
  private actionDur = 1;
  private hurtT = 0;
  private downT = 0;
  private dashT = 1e9;
  private guarding = false;
  private t = Math.random() * 10;
  private loopT = 0;
  private clip = '';

  private meta!: CharMeta;
  private k = 1;
  private bodyTint = 0xffffff;
  private bodyAlpha = 1;
  private kind = '';
  private spr!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Image;
  private aura!: Phaser.GameObjects.Image;
  private weapon?: Phaser.GameObjects.Image;
  private weaponGlow?: Phaser.GameObjects.Image;
  private weaponLen = 0;
  private charms: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, look: AvatarLook | null, scale: number = 1) {
    super(scene, x, y);
    this.baseScale = scale;
    scene.add.existing(this);
    this.build(look);
  }

  /** 换装：整体重建（纹理有缓存，开销很小） */
  setLook(look: AvatarLook | null): void {
    this.removeAll(true);
    this.charms = [];
    this.weapon = undefined;
    this.weaponGlow = undefined;
    this.build(look);
  }

  private build(look: AvatarLook | null): void {
    const s = this.scene;
    const wpn = look?.weapon ?? null;
    this.meta = (s.textures.get(HERO_ATLAS).customData as { char: CharMeta }).char;
    this.k = BODY_H / this.meta.heightPx;
    this.kind = wpn ? kindOf(wpn) : '';
    this.bodyTint = look?.path ? 0xffffff : SPIRIT_TINT;
    this.bodyAlpha = look?.path ? 1 : 0.82;

    // 筑基以上：脚下光环，取境界色
    const realm = look?.cult ? realmIndex(look.cult) : 0;
    const auraColor = realm >= 2 ? REALM_COLORS[realm] : 0;

    this.shadow = s.add.image(0, 0, 'fx_shadow').setScale(1.0, 0.9).setAlpha(0.9);
    this.aura = s.add.image(0, -6, 'fx_ring').setTint(auraColor || 0x9fd8ff).setScale(0.62, 0.24)
      .setAlpha(auraColor ? 0.9 : 0).setBlendMode(Phaser.BlendModes.ADD);
    this.spr = s.add.sprite(0, 0, HERO_ATLAS, 'idle_0')
      .setOrigin(this.meta.footX / this.meta.cell, this.meta.footY / this.meta.cell)
      .setScale(this.k).setTint(this.bodyTint).setAlpha(this.bodyAlpha);
    this.add([this.shadow, this.aura, this.spr]);

    if (wpn) {
      const w = weaponTex(s, this.kind, wpn.wuxing, itemColor(wpn));
      const gripX = this.kind === '杖' || this.kind === '枪' ? 0.3 : 0.06;
      this.weaponLen = w.len;
      if (wpn.rarity >= 3 || (wpn.grade ?? 0) >= 5) {
        this.weaponGlow = s.add.image(0, 0, 'fx_glow').setTint(itemColor(wpn)).setBlendMode(Phaser.BlendModes.ADD)
          .setOrigin(0.5).setAlpha(0.5);
        this.add(this.weaponGlow);
      }
      this.weapon = s.add.image(0, 0, w.key).setOrigin(gripX, 0.5);
      this.add(this.weapon);
    }

    // 五行灵珠：修过的每一行一颗，环绕腰间
    for (const wx of WX_ORDER) {
      const lv = look?.cult?.[wx] ?? 0;
      if (lv <= 0) continue;
      const orb = s.add.image(0, -50, 'fx_glow').setTint(WX_TINT[wx]).setScale(0.1 + Math.min(0.07, lv * 0.003)).setBlendMode(Phaser.BlendModes.ADD);
      this.charms.push(orb);
      this.add(orb);
    }

    this.clip = '';
    this.setScale(this.baseScale * this.facing, this.baseScale);
    this.show('idle', 0);
  }

  // ───────────────────────── 状态 ─────────────────────────

  setFacing(dir: number): void {
    const f = dir < 0 ? -1 : 1;
    if (f === this.facing) return;
    this.facing = f;
    this.setScale(this.baseScale * f, this.baseScale);
  }

  /** 0 = 站立，1 = 全速奔跑 */
  setMoving(k: number): void { this.moving = Phaser.Math.Clamp(k, 0, 1); }
  setDashing(v: boolean): void {
    if (v && !this.dashing) this.dashT = 0;
    this.dashing = v;
  }
  setGuarding(v: boolean): void { this.guarding = v; }
  setDown(v: boolean): void {
    if (v && !this.down) this.downT = 0;
    this.down = v;
  }

  play(action: AvatarAction): void {
    this.action = action;
    this.actionT = 0;
    this.actionDur = action === 'none' ? 1 : this.meta.clips[this.actionClip(action)].ms;
  }

  /** 挥砍：刃是单手快刀，其余双手抡；出手：枪是直刺，其余是推出一道气劲 */
  private actionClip(action: AvatarAction): string {
    if (action === 'slash') return this.kind === '刃' ? 'slash2' : 'slash';
    if (action === 'attack') return this.kind === '枪' ? 'stab' : 'attack';
    return 'cast';
  }

  hurt(): void {
    this.hurtT = this.meta.clips.hurt.ms;
    this.spr.setTintFill(0xff6b6b);
    this.scene.time.delayedCall(90, () => { if (this.spr.active) this.spr.setTint(this.bodyTint); });
  }

  // ───────────────────────── 每帧 ─────────────────────────

  /** 摆到某段动作的进度 p（0..1），兵器跟到这一帧的手上 */
  private show(clip: string, p: number): void {
    const def = this.meta.clips[clip];
    const i = Math.min(def.frames - 1, Math.max(0, Math.floor(p * def.frames)));
    const name = `${clip}_${i}`;
    if (this.spr.frame.name !== name) this.spr.setFrame(name);
    if (!this.weapon) return;
    const hand = (this.spr.frame.customData as { hand?: number[] }).hand;
    if (!hand) return;
    const x = (hand[0] - this.meta.footX) * this.k, y = (hand[1] - this.meta.footY) * this.k;
    // 兵器指向镜头时会透视缩短，别缩得太短
    const len = Phaser.Math.Clamp(hand[3], 0.45, 1);
    // 站着不出招时兵器按固定的架势拿：长柄拄在身侧，刀剑斜指前上方；出招时才跟着手走
    const rest = clip === 'idle' || clip === 'run' || clip === 'hurt' || clip === 'guard';
    const long = this.kind === '杖' || this.kind === '枪';
    const pole = rest && this.kind !== '扇';
    const rot = !pole ? hand[2] : long ? -1.32 : clip === 'guard' ? -1.15 : clip === 'run' ? -0.2 : -0.62;
    const k = pole ? 1 : len;
    this.weapon.setPosition(x, y).setRotation(rot).setScale(k * WPN / S, WPN / S);
    this.weaponGlow?.setPosition(x + Math.cos(rot) * this.weaponLen * k * 0.2, y + Math.sin(rot) * this.weaponLen * k * 0.2)
      .setRotation(rot).setScale(this.weaponLen / 256 * 1.1 * k, 0.18);
  }

  tick(dt: number): void {
    this.t += dt / 1000;
    if (this.action !== 'none') {
      this.actionT += dt;
      if (this.actionT >= this.actionDur) this.action = 'none';
    }
    this.hurtT = Math.max(0, this.hurtT - dt);

    const clips = this.meta.clips;
    let clip: string, p: number;
    if (this.down) {
      this.downT += dt;
      clip = 'die'; p = Math.min(0.999, this.downT / clips.die.ms);
    } else if (this.dashing || this.dashT < clips.dash.ms) {
      // 遁：一个前滚翻，翻完还在冲就停在收势上
      this.dashT += dt;
      clip = 'dash'; p = Math.min(0.999, this.dashT / clips.dash.ms);
    } else if (this.action !== 'none') {
      clip = this.actionClip(this.action); p = this.actionT / this.actionDur;
    } else if (this.hurtT > 0 && this.moving <= 0.05) {
      clip = 'hurt'; p = 1 - this.hurtT / clips.hurt.ms;
    } else {
      clip = this.moving > 0.05 ? 'run' : this.guarding ? 'guard' : 'idle';
      if (clip !== this.clip) this.loopT = 0;
      const def = clips[clip];
      // 跑得越快步子越密；冲刺再快一截
      this.loopT += dt * (clip === 'run' ? (0.55 + 0.45 * this.moving) : 1);
      const u = this.loopT / def.ms;
      if (def.yoyo) { const m = u % 2; p = m < 1 ? m : 2 - m; } else p = u % 1;
      p = Math.min(0.999, p);
    }
    this.clip = clip;
    this.show(clip, p);

    // 灵珠环绕
    const nOrb = Math.max(1, this.charms.length);
    this.charms.forEach((c, i) => {
      const a = this.t * 2.2 + (i / nOrb) * Math.PI * 2;
      c.setPosition(Math.cos(a) * 30, -52 + Math.sin(a) * 9).setVisible(!this.down);
      // 转到身后时压暗
      c.setAlpha(Math.sin(a) > 0 ? 0.95 : 0.45);
    });
    if (this.aura.alpha > 0) this.aura.setAlpha(0.65 + Math.sin(this.t * 3) * 0.25);
    // 倒地和翻滚时兵器收起来
    const armed = !this.down && clip !== 'dash';
    this.weapon?.setVisible(armed);
    this.weaponGlow?.setVisible(armed);
    this.setAlpha(this.down ? 0.6 : 1);
  }
}
