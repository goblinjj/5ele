import Phaser from 'phaser';
import { Equipment, EquipmentType, Rarity, Wuxing, WUXING_NAMES } from '@xiyou/shared';
import { WX_TINT } from '../../config/worldConfig.js';

/** 品质色 */
export const RARITY_TINT: Record<string, number> = {
  [Rarity.COMMON]: 0x9aa4ae,
  [Rarity.UNCOMMON]: 0x4ade80,
  [Rarity.RARE]: 0x58a6ff,
  [Rarity.EPIC]: 0xc084fc,
  [Rarity.LEGENDARY]: 0xffb020,
};

const TEX = 160;
const SERIF = '"Noto Serif SC", "Songti SC", serif';

const css = (c: number, a: number = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;
/** 颜色明暗调整：f>1 提亮（向白混合），f<1 压暗 */
function shade(c: number, f: number): number {
  let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  if (f <= 1) { r *= f; g *= f; b *= f; }
  else { const t = f - 1; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ───────────────────────── 器形 ─────────────────────────

/** 兵刃：斜置长剑 */
function drawWeapon(ctx: CanvasRenderingContext2D, color: number): void {
  ctx.save();
  ctx.translate(TEX / 2, TEX / 2);
  ctx.rotate(Math.PI / 4);
  // 剑身
  const blade = ctx.createLinearGradient(-10, 0, 10, 0);
  blade.addColorStop(0, css(shade(color, 1.75)));
  blade.addColorStop(0.5, css(shade(color, 1.25)));
  blade.addColorStop(0.5, css(shade(color, 0.8)));
  blade.addColorStop(1, css(shade(color, 0.55)));
  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.moveTo(0, -62); ctx.lineTo(10, -46); ctx.lineTo(9, 22); ctx.lineTo(-9, 22); ctx.lineTo(-10, -46);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = css(shade(color, 1.9), 0.9); ctx.lineWidth = 1.5; ctx.stroke();
  // 护手
  ctx.fillStyle = '#d4a853';
  roundRect(ctx, -24, 20, 48, 9, 4); ctx.fill();
  ctx.fillStyle = '#fff3c4';
  ctx.fillRect(-20, 21, 40, 2.5);
  // 剑柄
  ctx.fillStyle = '#4a3420';
  roundRect(ctx, -5, 29, 10, 26, 3); ctx.fill();
  ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = 2;
  for (let y = 34; y < 54; y += 6) { ctx.beginPath(); ctx.moveTo(-5, y); ctx.lineTo(5, y + 3); ctx.stroke(); }
  // 剑首
  ctx.fillStyle = '#d4a853';
  ctx.beginPath(); ctx.arc(0, 59, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = css(shade(color, 1.4));
  ctx.beginPath(); ctx.arc(0, 59, 3.5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** 甲胄：胸甲 + 肩吞 */
function drawArmor(ctx: CanvasRenderingContext2D, color: number): void {
  ctx.save();
  ctx.translate(TEX / 2, TEX / 2 + 4);
  const body = ctx.createLinearGradient(0, -50, 0, 52);
  body.addColorStop(0, css(shade(color, 1.45)));
  body.addColorStop(1, css(shade(color, 0.5)));
  // 胸甲轮廓
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-20, -46);
  ctx.quadraticCurveTo(0, -30, 20, -46);
  ctx.lineTo(44, -34);
  ctx.quadraticCurveTo(38, -10, 34, 6);
  ctx.quadraticCurveTo(34, 36, 0, 54);
  ctx.quadraticCurveTo(-34, 36, -34, 6);
  ctx.quadraticCurveTo(-38, -10, -44, -34);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = css(shade(color, 1.8), 0.95); ctx.lineWidth = 2.5; ctx.stroke();
  // 肩吞
  ctx.fillStyle = css(shade(color, 0.8));
  [-1, 1].forEach(s => {
    ctx.beginPath();
    ctx.ellipse(s * 44, -34, 17, 12, s * 0.5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  });
  // 中脊与甲片
  ctx.strokeStyle = css(shade(color, 1.9), 0.55); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -32); ctx.lineTo(0, 50); ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const y = -8 + i * 18;
    ctx.beginPath(); ctx.moveTo(-32 + i * 5, y); ctx.quadraticCurveTo(0, y + 12, 32 - i * 5, y); ctx.stroke();
  }
  // 护心镜
  ctx.fillStyle = '#d4a853';
  ctx.beginPath(); ctx.arc(0, -14, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = css(shade(color, 1.7));
  ctx.beginPath(); ctx.arc(0, -14, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** 灵器：宝珠 + 环 */
function drawTreasure(ctx: CanvasRenderingContext2D, color: number): void {
  const cx = TEX / 2, cy = TEX / 2 + 2;
  // 光晕
  const halo = ctx.createRadialGradient(cx, cy, 10, cx, cy, 64);
  halo.addColorStop(0, css(shade(color, 1.3), 0.55));
  halo.addColorStop(1, css(color, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, TEX, TEX);
  // 后半环
  ctx.strokeStyle = '#d4a853'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(cx, cy + 4, 52, 17, -0.35, Math.PI, Math.PI * 2); ctx.stroke();
  // 珠
  const orb = ctx.createRadialGradient(cx - 13, cy - 15, 4, cx, cy, 36);
  orb.addColorStop(0, '#ffffff');
  orb.addColorStop(0.25, css(shade(color, 1.5)));
  orb.addColorStop(0.75, css(shade(color, 0.85)));
  orb.addColorStop(1, css(shade(color, 0.4)));
  ctx.fillStyle = orb;
  ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = css(shade(color, 1.8), 0.9); ctx.lineWidth = 2; ctx.stroke();
  // 前半环
  ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(cx, cy + 4, 52, 17, -0.35, 0, Math.PI); ctx.stroke();
}

/** 生成（并缓存）某类器物的图标贴图，返回贴图 key */
export function ensureItemTexture(
  scene: Phaser.Scene, type: EquipmentType, wuxing: Wuxing | undefined, rarity: Rarity,
): string {
  const key = `item_${type}_${wuxing ?? 'none'}_${rarity}`;
  if (scene.textures.exists(key)) return key;

  const color = wuxing ? WX_TINT[wuxing] : 0xa9b4c0;
  const rar = RARITY_TINT[rarity] ?? RARITY_TINT[Rarity.COMMON];
  const canvas = scene.textures.createCanvas(key, TEX, TEX)!;
  const ctx = canvas.getContext();

  // 底板：五行色的深色晕染
  roundRect(ctx, 4, 4, TEX - 8, TEX - 8, 20);
  const bg = ctx.createRadialGradient(TEX / 2, TEX * 0.42, 6, TEX / 2, TEX / 2, TEX * 0.72);
  bg.addColorStop(0, css(shade(color, 0.5)));
  bg.addColorStop(0.6, css(shade(color, 0.2)));
  bg.addColorStop(1, '#0a0f14');
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.save();
  roundRect(ctx, 4, 4, TEX - 8, TEX - 8, 20);
  ctx.clip();
  if (type === EquipmentType.WEAPON) drawWeapon(ctx, color);
  else if (type === EquipmentType.ARMOR) drawArmor(ctx, color);
  else drawTreasure(ctx, color);
  // 顶部高光
  const gloss = ctx.createLinearGradient(0, 0, 0, TEX * 0.5);
  gloss.addColorStop(0, 'rgba(255,255,255,0.13)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  ctx.fillRect(0, 0, TEX, TEX * 0.5);
  ctx.restore();

  // 品质边框
  roundRect(ctx, 4, 4, TEX - 8, TEX - 8, 20);
  ctx.strokeStyle = css(rar, 1); ctx.lineWidth = 5; ctx.stroke();
  roundRect(ctx, 10, 10, TEX - 20, TEX - 20, 15);
  ctx.strokeStyle = css(rar, 0.3); ctx.lineWidth = 2; ctx.stroke();

  // 五行印（右下）
  if (wuxing) {
    const sx = TEX - 34, sy = TEX - 34;
    ctx.fillStyle = 'rgba(8,12,16,0.9)';
    ctx.beginPath(); ctx.arc(sx, sy, 22, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = css(color); ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = css(shade(color, 1.25));
    ctx.font = `bold 28px ${SERIF}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(WUXING_NAMES[wuxing], sx, sy + 1);
  }

  canvas.refresh();
  return key;
}

/**
 * 创建一个器物图标（容器原点在中心）
 * 左上角显示强化等级，左下角用小点表示技能数量
 */
export function createItemIcon(scene: Phaser.Scene, equipment: Equipment, size: number): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const key = ensureItemTexture(scene, equipment.type, equipment.wuxing, equipment.rarity);
  c.add(scene.add.image(0, 0, key).setDisplaySize(size, size));

  if (equipment.upgradeLevel > 0) {
    c.add(scene.add.text(-size * 0.4, -size * 0.42, `+${equipment.upgradeLevel}`, {
      fontFamily: SERIF, fontSize: `${Math.round(size * 0.26)}px`, fontStyle: 'bold',
      color: '#7dff9b', stroke: '#000000', strokeThickness: 4,
    }));
  }

  const skillCount = equipment.attributeSkills?.length ?? 0;
  if (skillCount > 0) {
    const g = scene.add.graphics();
    const r = Math.max(3, size * 0.055);
    for (let i = 0; i < Math.min(skillCount, 5); i++) {
      const x = -size * 0.36 + i * r * 2.6, y = size * 0.36;
      g.fillStyle(0x000000, 0.8); g.fillCircle(x, y, r + 1.5);
      g.fillStyle(0xffe066, 1); g.fillCircle(x, y, r);
    }
    c.add(g);
  }
  return c;
}

/** 空槽位的器形暗纹 */
export function slotHintGlyph(type: 'weapon' | 'armor' | 'treasure' | 'inventory'): string {
  return type === 'weapon' ? '兵' : type === 'armor' ? '甲' : type === 'treasure' ? '器' : '';
}

let measureCtx: CanvasRenderingContext2D | null = null;

/**
 * 按字符折行（中文没有空格，Phaser 自带的按词折行会在奇怪的位置断开）
 * @param font CSS font 字符串，例如 `24px "Noto Sans SC"`
 */
export function wrapCJK(text: string, maxWidth: number, font: string): string {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  const ctx = measureCtx;
  if (!ctx) return text;
  ctx.font = font;
  // 行首禁则：这些标点不能出现在行首
  const noLeading = '，。、；：！？）》」』%％';
  return text.split('\n').map(paragraph => {
    const lines: string[] = [];
    let line = '';
    for (const ch of paragraph) {
      if (line && ctx.measureText(line + ch).width > maxWidth && !noLeading.includes(ch)) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    lines.push(line);
    return lines.join('\n');
  }).join('\n');
}
