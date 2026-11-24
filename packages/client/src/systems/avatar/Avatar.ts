import Phaser from 'phaser';
import {
  Equipped, GearItem, Wuxing, kindOf, itemColor, SETS, setCounts, SetId,
} from '@xiyou/shared';
import { WX_TINT } from '../../config/worldConfig.js';

/**
 * 人形纸娃娃：部件分开绘制，由程序按姿势参数驱动
 *
 *  - 每一帧都是姿势插值，帧率多高就有多顺；状态切换时平滑过渡
 *  - 装备外显：武器器型（剑 刃 杖 枪 扇）、护甲款式（袍 衣 = 长袍，甲 铠 = 甲胄）与五行配色、
 *    法宝悬浮身后（印 铃 镜 葫芦 塔）、佩饰化作环绕腰间的灵珠、套装与传说带光环
 *  - 部件纹理按「款式 + 颜色」缓存在全局纹理管理器里，同样的装备只画一次
 *
 * 坐标：容器原点在双脚中间，面朝右；所有部件纹理按 2 倍绘制再缩小，放大镜头也清晰。
 */

const S = 2;
const SKIN = '#f3d9c6';
const SKIN_SHADE = '#d9b59c';
const HAIR = '#1b1d29';

type Style = 'robe' | 'armor' | 'spirit';

interface Pose {
  bob: number;
  lean: number;
  head: number;
  legF: number;
  legB: number;
  armF: number;
  armB: number;
  /** 武器的世界角度（不是相对手臂） */
  wpn: number;
  squash: number;
}

const ZERO: Pose = { bob: 0, lean: 0, head: 0, legF: 0, legB: 0, armF: 0.25, armB: -0.15, wpn: -0.8, squash: 1 };

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

/** 护甲配色：主色取五行色（压暗），镶边取品质 / 套装色 */
function armorColors(armor: GearItem | null): { main: number; trim: number; style: Style } {
  if (!armor) return { main: 0xbfe0ff, trim: 0x9fd8ff, style: 'spirit' };
  const k = kindOf(armor);
  return {
    main: WX_TINT[armor.wuxing],
    trim: itemColor(armor),
    style: k === '甲' || k === '铠' ? 'armor' : 'robe',
  };
}

// ───────────────────────── 部件纹理 ─────────────────────────

function torsoTex(scene: Phaser.Scene, style: Style, main: number, trim: number): string {
  const key = `av_torso_${style}_${main}_${trim}`;
  // 56×74，髋部在 (28, 46)
  return makeTex(scene, key, 56, 74, ctx => {
    const base = style === 'spirit' ? 'rgba(200,230,255,0.85)' : shade(main, style === 'armor' ? 0.55 : 0.62);
    const dark = style === 'spirit' ? 'rgba(140,190,235,0.9)' : shade(main, 0.38);
    const tr = hex(trim);
    // 下摆
    ctx.fillStyle = dark;
    ctx.beginPath();
    if (style === 'armor') {
      ctx.moveTo(14, 40); ctx.lineTo(42, 40); ctx.lineTo(46, 64); ctx.lineTo(10, 64); ctx.closePath();
    } else {
      ctx.moveTo(15, 40); ctx.lineTo(41, 40); ctx.quadraticCurveTo(50, 60, 52, 72); ctx.lineTo(4, 72); ctx.quadraticCurveTo(6, 60, 15, 40);
    }
    ctx.fill();
    if (style === 'armor') {
      // 甲片
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      for (let x = 14; x <= 44; x += 6) { ctx.beginPath(); ctx.moveTo(x, 42); ctx.lineTo(x + 1, 63); ctx.stroke(); }
    }
    ctx.strokeStyle = tr;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (style === 'armor') { ctx.moveTo(10, 63); ctx.lineTo(46, 63); } else { ctx.moveTo(5, 71); ctx.lineTo(51, 71); }
    ctx.stroke();

    // 上身
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.moveTo(16, 8); ctx.quadraticCurveTo(28, 2, 40, 8);
    ctx.lineTo(42, 42); ctx.quadraticCurveTo(28, 46, 14, 42); ctx.closePath();
    ctx.fill();
    // 交领
    ctx.strokeStyle = style === 'spirit' ? 'rgba(255,255,255,0.9)' : tr;
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(22, 6); ctx.lineTo(32, 24); ctx.lineTo(36, 7); ctx.stroke();
    if (style === 'armor') {
      // 护心镜与肩甲
      ctx.fillStyle = tr;
      ctx.beginPath(); ctx.arc(30, 26, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = shade(main, 0.75);
      ctx.beginPath(); ctx.ellipse(16, 11, 8, 6, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(40, 11, 8, 6, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = tr; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(16, 11, 8, 6, -0.3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(40, 11, 8, 6, 0.3, 0, Math.PI * 2); ctx.stroke();
    }
    // 腰带
    ctx.fillStyle = style === 'spirit' ? 'rgba(160,210,255,1)' : tr;
    ctx.fillRect(14, 36, 28, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(14, 36, 28, 1.5);
    // 腰带垂绦
    ctx.strokeStyle = style === 'spirit' ? 'rgba(160,210,255,0.9)' : tr;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(32, 41); ctx.quadraticCurveTo(34, 50, 31, 58); ctx.stroke();
  });
}

function armTex(scene: Phaser.Scene, style: Style, main: number, trim: number): string {
  const key = `av_arm_${style}_${main}_${trim}`;
  // 14×38，肩在 (7, 3)
  return makeTex(scene, key, 14, 38, ctx => {
    ctx.fillStyle = style === 'spirit' ? 'rgba(200,230,255,0.85)' : shade(main, style === 'armor' ? 0.5 : 0.6);
    ctx.beginPath();
    ctx.moveTo(2, 4); ctx.quadraticCurveTo(7, -1, 12, 4); ctx.lineTo(style === 'robe' ? 13 : 11, 28); ctx.lineTo(style === 'robe' ? 1 : 3, 28); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = style === 'spirit' ? 'rgba(255,255,255,0.9)' : hex(trim);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(style === 'robe' ? 1 : 3, 27); ctx.lineTo(style === 'robe' ? 13 : 11, 27); ctx.stroke();
    // 手
    ctx.fillStyle = SKIN;
    ctx.beginPath(); ctx.arc(7, 32, 4.6, 0, Math.PI * 2); ctx.fill();
  });
}

function legTex(scene: Phaser.Scene, style: Style): string {
  const key = `av_leg_${style}`;
  // 14×44，髋在 (7, 2)
  return makeTex(scene, key, 14, 44, ctx => {
    ctx.fillStyle = style === 'spirit' ? 'rgba(170,210,245,0.85)' : '#2a2d3a';
    ctx.beginPath(); ctx.moveTo(2, 2); ctx.lineTo(12, 2); ctx.lineTo(11, 34); ctx.lineTo(3, 34); ctx.closePath(); ctx.fill();
    // 靴
    ctx.fillStyle = style === 'spirit' ? 'rgba(220,240,255,0.95)' : '#15161d';
    ctx.beginPath(); ctx.moveTo(2, 32); ctx.lineTo(11, 32); ctx.lineTo(14, 42); ctx.lineTo(2, 42); ctx.closePath(); ctx.fill();
  });
}

function headTex(scene: Phaser.Scene): string {
  // 40×46，颈在 (20, 44)
  return makeTex(scene, 'av_head', 40, 46, ctx => {
    // 颈
    ctx.fillStyle = SKIN_SHADE;
    ctx.fillRect(16, 34, 8, 11);
    // 脸
    ctx.fillStyle = SKIN;
    ctx.beginPath(); ctx.ellipse(21, 25, 12.5, 13.5, 0, 0, Math.PI * 2); ctx.fill();
    // 发：披发 + 发髻
    ctx.fillStyle = HAIR;
    ctx.beginPath();
    ctx.moveTo(8, 27); ctx.quadraticCurveTo(6, 10, 20, 9); ctx.quadraticCurveTo(33, 9, 34, 20);
    ctx.quadraticCurveTo(26, 17, 22, 21); ctx.quadraticCurveTo(15, 18, 13, 34); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(14, 7, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c9a24a';
    ctx.fillRect(10, 9, 9, 2.5);
    // 眼与眉
    ctx.fillStyle = '#1b1d29';
    ctx.beginPath(); ctx.ellipse(28.5, 25, 1.8, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = '#1b1d29';
    ctx.beginPath(); ctx.moveTo(26, 20.5); ctx.lineTo(31, 20); ctx.stroke();
    // 腮红
    ctx.fillStyle = 'rgba(230,120,110,0.35)';
    ctx.beginPath(); ctx.arc(28, 30, 2.6, 0, Math.PI * 2); ctx.fill();
  });
}

function ribbonTex(scene: Phaser.Scene, color: number): string {
  const key = `av_ribbon_${color}`;
  // 34×12，系结点在右端 (34, 6)
  return makeTex(scene, key, 34, 12, ctx => {
    ctx.fillStyle = hex(color);
    ctx.beginPath();
    ctx.moveTo(34, 5); ctx.quadraticCurveTo(18, 0, 2, 4); ctx.lineTo(6, 7); ctx.lineTo(1, 10); ctx.quadraticCurveTo(18, 8, 34, 8);
    ctx.closePath(); ctx.fill();
  });
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

function relicTex(scene: Phaser.Scene, kind: string, wx: Wuxing, trim: number): string {
  const key = `av_relic_${kind}_${wx}_${trim}`;
  const c = hex(WX_TINT[wx]);
  const tr = hex(trim);
  return makeTex(scene, key, 34, 40, ctx => {
    ctx.lineWidth = 2;
    ctx.strokeStyle = tr;
    switch (kind) {
      case '铃':
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(17, 6); ctx.quadraticCurveTo(5, 10, 6, 30); ctx.lineTo(28, 30); ctx.quadraticCurveTo(29, 10, 17, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = tr; ctx.beginPath(); ctx.arc(17, 33, 3.5, 0, Math.PI * 2); ctx.fill();
        break;
      case '镜':
        ctx.fillStyle = tr; ctx.beginPath(); ctx.arc(17, 18, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(17, 18, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(13, 14, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = tr; ctx.fillRect(15, 31, 4, 7);
        break;
      case '葫芦':
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(17, 12, 7, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(17, 27, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = tr; ctx.fillRect(13, 17, 8, 3); ctx.fillRect(15, 2, 4, 4);
        break;
      case '塔':
        ctx.fillStyle = c;
        for (let i = 0; i < 4; i++) {
          const w = 26 - i * 5, y = 34 - i * 8;
          ctx.fillRect(17 - w / 2, y - 6, w, 6);
          ctx.strokeRect(17 - w / 2, y - 6, w, 6);
        }
        ctx.fillStyle = tr; ctx.beginPath(); ctx.moveTo(17, 0); ctx.lineTo(21, 6); ctx.lineTo(13, 6); ctx.fill();
        break;
      default: // 印
        ctx.fillStyle = c; ctx.fillRect(5, 16, 24, 20); ctx.strokeRect(5, 16, 24, 20);
        ctx.fillStyle = tr; ctx.fillRect(12, 6, 10, 10);
        ctx.beginPath(); ctx.arc(17, 6, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5; ctx.strokeRect(10, 21, 14, 10);
        break;
    }
  });
}

// ───────────────────────── 纸娃娃 ─────────────────────────

export type AvatarAction = 'none' | 'attack' | 'cast';

export class Avatar extends Phaser.GameObjects.Container {
  private baseScale: number;
  private facing = 1;
  private moving = 0;
  private dashing = false;
  private guarding = false;
  private down = false;
  private action: AvatarAction = 'none';
  private actionT = 0;
  private actionDur = 1;
  private hurtT = 0;
  private t = Math.random() * 10;
  private pose: Pose = { ...ZERO };

  private rig!: Phaser.GameObjects.Container;
  private shadow!: Phaser.GameObjects.Image;
  private aura!: Phaser.GameObjects.Image;
  private relic?: Phaser.GameObjects.Image;
  private relicGlow?: Phaser.GameObjects.Image;
  private ribbon!: Phaser.GameObjects.Image;
  private head!: Phaser.GameObjects.Image;
  private torso!: Phaser.GameObjects.Image;
  private legF!: Phaser.GameObjects.Image;
  private legB!: Phaser.GameObjects.Image;
  private armB!: Phaser.GameObjects.Image;
  private armF!: Phaser.GameObjects.Container;
  private weapon?: Phaser.GameObjects.Image;
  private weaponGlow?: Phaser.GameObjects.Image;
  private charms: Phaser.GameObjects.Image[] = [];
  private flashables: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, x: number, y: number, equip: Equipped | null, scale: number = 1) {
    super(scene, x, y);
    this.baseScale = scale;
    scene.add.existing(this);
    this.build(equip);
  }

  /** 换装：整体重建部件（纹理有缓存，开销很小） */
  setEquip(equip: Equipped | null): void {
    this.removeAll(true);
    this.charms = [];
    this.flashables = [];
    this.relic = undefined;
    this.relicGlow = undefined;
    this.weapon = undefined;
    this.weaponGlow = undefined;
    this.build(equip);
  }

  private build(equip: Equipped | null): void {
    const s = this.scene;
    const eq = equip ?? { weapon: null, armor: null, charm1: null, charm2: null, relic: null };
    const { main, trim, style } = armorColors(eq.armor);

    // 套装五件 / 传说：脚下光环
    let auraColor = 0;
    const counts = setCounts(eq);
    for (const id of Object.keys(counts) as SetId[]) if ((counts[id] ?? 0) >= 5) auraColor = SETS[id].color;
    if (!auraColor && Object.values(eq).some(i => i?.legend)) auraColor = 0xffa31a;

    this.shadow = s.add.image(0, 0, 'fx_shadow').setScale(1.0, 0.9).setAlpha(0.9);
    this.aura = s.add.image(0, -6, 'fx_ring').setTint(auraColor || 0x9fd8ff).setScale(0.62, 0.24)
      .setAlpha(auraColor ? 0.9 : 0).setBlendMode(Phaser.BlendModes.ADD);
    this.add([this.shadow, this.aura]);

    // 法宝：悬在身后
    if (eq.relic) {
      const k = relicTex(s, kindOf(eq.relic), eq.relic.wuxing, itemColor(eq.relic));
      this.relicGlow = s.add.image(-34, -104, 'fx_glow').setTint(itemColor(eq.relic)).setScale(0.32).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD);
      this.relic = s.add.image(-34, -104, k).setScale(1 / S);
      this.add([this.relicGlow, this.relic]);
    }

    this.rig = s.add.container(0, 0);
    this.add(this.rig);

    const legKey = legTex(s, style);
    this.legB = s.add.image(-4, -42, legKey).setOrigin(0.5, 2 / 44).setScale(1 / S).setTint(0xb8b8c4);
    this.legF = s.add.image(5, -42, legKey).setOrigin(0.5, 2 / 44).setScale(1 / S);
    const armKey = armTex(s, style, main, trim);
    this.armB = s.add.image(-8, -74, armKey).setOrigin(0.5, 3 / 38).setScale(1 / S).setTint(0xb0b0bc);
    this.torso = s.add.image(0, -40, torsoTex(s, style, main, trim)).setOrigin(0.5, 46 / 74).setScale(1 / S);
    this.ribbon = s.add.image(-6, -110, ribbonTex(s, style === 'spirit' ? 0x9fd8ff : trim)).setOrigin(1, 0.5).setScale(1 / S);
    this.head = s.add.image(2, -78, headTex(s)).setOrigin(0.5, 44 / 46).setScale(1 / S);

    // 前臂 + 武器
    this.armF = s.add.container(8, -74);
    const armFront = s.add.image(0, 0, armKey).setOrigin(0.5, 3 / 38).setScale(1 / S);
    this.armF.add(armFront);
    if (eq.weapon) {
      const w = weaponTex(s, kindOf(eq.weapon), eq.weapon.wuxing, itemColor(eq.weapon));
      const kind = kindOf(eq.weapon);
      const gripX = kind === '杖' || kind === '枪' ? 0.3 : 0.06;
      this.weapon = s.add.image(0, 15, w.key).setOrigin(gripX, 0.5).setScale(1 / S);
      if (eq.weapon.rarity >= 3 || eq.weapon.set) {
        this.weaponGlow = s.add.image(0, 15, 'fx_glow').setTint(itemColor(eq.weapon)).setBlendMode(Phaser.BlendModes.ADD)
          .setOrigin(0.5).setScale(w.len / 256 * 1.3, 0.22).setAlpha(0.5);
        this.armF.add(this.weaponGlow);
      }
      this.armF.add(this.weapon);
    }

    this.rig.add([this.legB, this.armB, this.legF, this.torso, this.ribbon, this.head, this.armF]);
    this.flashables = [this.legB, this.legF, this.armB, armFront, this.torso, this.head];

    // 佩饰：环绕腰间的灵珠
    for (const it of [eq.charm1, eq.charm2]) {
      if (!it) continue;
      const orb = s.add.image(0, -50, 'fx_glow').setTint(it.set ? itemColor(it) : WX_TINT[it.wuxing]).setScale(0.13).setBlendMode(Phaser.BlendModes.ADD);
      this.charms.push(orb);
      this.add(orb);
    }

    this.setScale(this.baseScale * this.facing, this.baseScale);
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
  setDashing(v: boolean): void { this.dashing = v; }
  setGuarding(v: boolean): void { this.guarding = v; }
  setDown(v: boolean): void { this.down = v; }

  play(action: AvatarAction): void {
    this.action = action;
    this.actionT = 0;
    this.actionDur = action === 'cast' ? 420 : 240;
  }

  hurt(): void {
    this.hurtT = 180;
    this.flashables.forEach(i => i.setTintFill(0xff6b6b));
    this.scene.time.delayedCall(90, () => {
      this.flashables.forEach(i => { if (!i.active) return; i.clearTint(); });
      this.legB?.setTint(0xb8b8c4);
      this.armB?.setTint(0xb0b0bc);
    });
  }

  // ───────────────────────── 每帧 ─────────────────────────

  private target(): Pose {
    const t = this.t;
    const p: Pose = { ...ZERO };
    if (this.down) {
      return { ...p, lean: 0, armF: -0.4, armB: 0.3, wpn: 0.4, legF: 0.2, legB: -0.1, squash: 1 };
    }
    // 待机：呼吸
    p.bob = Math.sin(t * 2.4) * 1.4;
    p.armF = 0.22 + Math.sin(t * 2.4) * 0.04;
    p.armB = -0.12 - Math.sin(t * 2.4) * 0.04;
    p.head = Math.sin(t * 1.2) * 0.03;

    // 跑动：腿臂反向摆，身体前倾、上下颠
    if (this.moving > 0.05) {
      const ph = t * 13;
      const m = this.moving;
      p.legF = Math.sin(ph) * 0.65 * m;
      p.legB = -Math.sin(ph) * 0.65 * m;
      p.armB = Math.sin(ph) * 0.55 * m - 0.1;
      p.armF = 0.15 - Math.sin(ph) * 0.35 * m;
      p.lean = 0.14 * m;
      p.bob = -Math.abs(Math.sin(ph)) * 4 * m + 1;
      p.wpn = -0.5;
    }
    if (this.guarding) {
      p.armF = -1.25; p.wpn = -1.45; p.lean = -0.08; p.armB = -0.5;
    }
    if (this.dashing) {
      p.lean = 0.5; p.legF = 0.8; p.legB = -0.6; p.armB = 1.0; p.armF = 0.9; p.wpn = 0.5; p.bob = -3;
    }

    // 出手：前臂前推，武器指向前方；施法：双手高举
    if (this.action !== 'none') {
      const k = this.actionT / this.actionDur;
      const out = k < 0.35 ? Phaser.Math.Easing.Back.Out(k / 0.35) : 1 - Phaser.Math.Easing.Quadratic.InOut((k - 0.35) / 0.65);
      if (this.action === 'attack') {
        p.armF = Phaser.Math.Linear(p.armF, -1.5, out);
        p.wpn = Phaser.Math.Linear(p.wpn, 0.05, out);
        p.lean = Phaser.Math.Linear(p.lean, 0.12, out);
        p.armB = Phaser.Math.Linear(p.armB, 0.5, out);
      } else {
        p.armF = Phaser.Math.Linear(p.armF, -2.7, out);
        p.armB = Phaser.Math.Linear(p.armB, -2.5, out);
        p.wpn = Phaser.Math.Linear(p.wpn, -1.57, out);
        p.lean = Phaser.Math.Linear(p.lean, -0.1, out);
        p.squash = 1 + 0.06 * out;
      }
    }
    if (this.hurtT > 0) p.lean -= 0.35 * (this.hurtT / 180);
    return p;
  }

  tick(dt: number): void {
    this.t += dt / 1000;
    if (this.action !== 'none') {
      this.actionT += dt;
      if (this.actionT >= this.actionDur) this.action = 'none';
    }
    this.hurtT = Math.max(0, this.hurtT - dt);

    // 姿势平滑逼近目标：出手时跟得紧，其余放松
    const tgt = this.target();
    const rate = this.action !== 'none' || this.dashing ? 40 : 16;
    const k = 1 - Math.exp(-rate * dt / 1000);
    const p = this.pose;
    (Object.keys(p) as (keyof Pose)[]).forEach(key => { p[key] += (tgt[key] - p[key]) * k; });

    this.rig.setRotation(this.down ? -1.45 : p.lean * 0.6).setPosition(this.down ? -30 : 0, p.bob + (this.down ? -14 : 0));
    this.rig.setScale(1, p.squash);
    this.legF.setRotation(-p.legF);
    this.legB.setRotation(-p.legB);
    this.torso.setRotation(p.lean * 0.4);
    this.head.setRotation(p.head + p.lean * 0.2);
    this.armB.setRotation(p.armB);
    this.armF.setRotation(p.armF);
    if (this.weapon) {
      const local = p.wpn - p.armF;
      this.weapon.setRotation(local);
      this.weaponGlow?.setRotation(local).setPosition(Math.cos(local) * 18, 15 + Math.sin(local) * 18);
    }
    // 发带随动作飘
    this.ribbon.setRotation(Math.sin(this.t * 3.1) * 0.18 + p.lean * 0.8 + this.moving * 0.35);

    // 法宝上下浮动，佩饰环绕
    if (this.relic) {
      const y = -104 + Math.sin(this.t * 1.8) * 5;
      this.relic.setY(y).setRotation(Math.sin(this.t * 1.1) * 0.12);
      this.relicGlow?.setY(y).setAlpha(0.4 + Math.sin(this.t * 2.6) * 0.15);
    }
    this.charms.forEach((c, i) => {
      const a = this.t * 2.2 + i * Math.PI;
      c.setPosition(Math.cos(a) * 30, -48 + Math.sin(a) * 9);
      // 转到身后时压暗
      c.setAlpha(Math.sin(a) > 0 ? 0.95 : 0.45);
    });
    if (this.aura.alpha > 0) this.aura.setAlpha(0.65 + Math.sin(this.t * 3) * 0.25);
    this.setAlpha(this.down ? 0.55 : 1);
  }
}
