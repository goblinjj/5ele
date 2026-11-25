import Phaser from 'phaser';
import {
  GearItem, RARITY_NAMES, WUXING_NAMES, formOf, kindOf,
  formatStat, resonanceOf, RESONANCE_LABEL, Wuxing,
  itemColor, itemCss, displayName, gradeMult, StatLine,
} from '@xiyou/shared';
import { WX_TINT } from '../config/worldConfig.js';
import { sfx } from '../systems/audio/Sfx.js';

export const SERIF = '"Noto Serif SC", "Songti SC", "STSong", serif';
export const SANS = '"Noto Sans SC", "PingFang SC", sans-serif';
export const GOLD = 0xd4a853;
export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

export const WX_CSS: Record<Wuxing, string> = {
  [Wuxing.METAL]: '#f2e6c2',
  [Wuxing.WOOD]: '#4ade80',
  [Wuxing.WATER]: '#4f9dff',
  [Wuxing.FIRE]: '#ff6a4c',
  [Wuxing.EARTH]: '#e3b23c',
};

export interface ButtonOpts {
  color?: number;
  fill?: number;
  fontSize?: number;
  disabled?: boolean;
  depth?: number;
}

/** 圆角按钮（按下变暗，松手触发） */
export function button(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string,
  onClick: () => void, opts: ButtonOpts = {},
): Phaser.GameObjects.Container {
  const color = opts.color ?? GOLD;
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const draw = (down: boolean) => {
    g.clear();
    g.fillStyle(opts.fill ?? 0x0d1117, opts.disabled ? 0.5 : down ? 1 : 0.88);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(22, h / 2));
    if (down) { g.fillStyle(color, 0.25); g.fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(22, h / 2)); }
    g.lineStyle(3, color, opts.disabled ? 0.3 : 0.95);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, Math.min(22, h / 2));
  };
  draw(false);
  const t = scene.add.text(0, 0, label, {
    fontFamily: SERIF, fontSize: `${opts.fontSize ?? 30}px`, fontStyle: 'bold',
    color: opts.disabled ? '#6e7681' : hex(color === GOLD ? 0xffe9a8 : color), align: 'center',
  }).setOrigin(0.5);
  c.add([g, t]);
  c.setSize(w, h);
  if (!opts.disabled) {
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => draw(true));
    c.on('pointerout', () => draw(false));
    c.on('pointerup', () => { draw(false); sfx.click(); onClick(); });
  }
  if (opts.depth !== undefined) c.setDepth(opts.depth);
  c.setData('label', t);
  return c;
}

/** 兵器图标：品质边框 + 器型字 + 五行色 */
export function gearIcon(scene: Phaser.Scene, x: number, y: number, size: number, item: GearItem | null, placeholder?: string): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const r = size * 0.16;
  if (!item) {
    g.fillStyle(0x0b1016, 0.8);
    g.fillRoundedRect(-size / 2, -size / 2, size, size, r);
    g.lineStyle(2, 0x30363d, 1);
    g.strokeRoundedRect(-size / 2, -size / 2, size, size, r);
    c.add(g);
    if (placeholder) {
      c.add(scene.add.text(0, 0, placeholder, { fontFamily: SERIF, fontSize: `${Math.round(size * 0.26)}px`, color: '#484f58' }).setOrigin(0.5));
    }
    return c;
  }
  const rc = itemColor(item);
  if (item.rarity >= 3) {
    const glow = scene.add.image(0, 0, 'fx_glow').setTint(rc).setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(size * 1.7, size * 1.7).setAlpha(item.rarity === 4 ? 0.55 : 0.3);
    c.add(glow);
  }
  g.fillStyle(0x0b1016, 0.95);
  g.fillRoundedRect(-size / 2, -size / 2, size, size, r);
  g.fillStyle(rc, 0.14);
  g.fillRoundedRect(-size / 2, -size / 2, size, size, r);
  g.lineStyle(item.rarity >= 3 ? 4 : 3, rc, 1);
  g.strokeRoundedRect(-size / 2, -size / 2, size, size, r);
  // 五行角标
  g.fillStyle(WX_TINT[item.wuxing], 1);
  g.fillCircle(size / 2 - size * 0.17, -size / 2 + size * 0.17, size * 0.09);
  c.add(g);
  c.add(scene.add.text(0, 2, kindOf(item), {
    fontFamily: SERIF, fontSize: `${Math.round(size * 0.46)}px`, fontStyle: 'bold',
    color: WX_CSS[item.wuxing], stroke: '#000000', strokeThickness: 4,
  }).setOrigin(0.5));
  if (item.grade) {
    c.add(scene.add.text(size / 2 - 5, size / 2 - 4, `+${item.grade}`, {
      fontFamily: SANS, fontSize: `${Math.round(size * 0.22)}px`, fontStyle: 'bold', color: '#ffe066',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(1, 1));
  }
  c.add(scene.add.text(-size / 2 + 6, size / 2 - 4, `${item.tier}`, {
    fontFamily: SANS, fontSize: `${Math.round(size * 0.2)}px`, fontStyle: 'bold', color: '#c9d1d9',
    stroke: '#000000', strokeThickness: 3,
  }).setOrigin(0, 1));
  return c;
}

/** 兵器说明的多行文字 */
export function itemLines(item: GearItem, path: Wuxing | null): { text: string; color: string; size: number }[] {
  const out: { text: string; color: string; size: number }[] = [];
  const form = formOf(item);
  out.push({ text: displayName(item), color: itemCss(item), size: 38 });
  out.push({
    text: `${RARITY_NAMES[item.rarity]} · ${WUXING_NAMES[item.wuxing]}行 · ${item.tier} 重天`,
    color: '#8b949e', size: 24,
  });
  out.push({ text: `【${form.kind}·${form.move}】${form.desc}`, color: form.melee ? '#ffb36b' : '#9fd8ff', size: 25 });
  const res = resonanceOf(path, item.wuxing);
  if (RESONANCE_LABEL[res]) {
    out.push({ text: `五行共鸣：${RESONANCE_LABEL[res]}`, color: res === 'clash' ? '#f85149' : '#4ade80', size: 24 });
  }
  // 显示数值含淬炼加成
  const g = gradeMult(item);
  const scaled = (l: StatLine): StatLine => ({ stat: l.stat, value: l.value * g });
  item.base.forEach(l => out.push({ text: formatStat(scaled(l)), color: '#f0e6d3', size: 30 }));
  item.affixes.forEach(l => out.push({ text: `◆ ${formatStat(scaled(l))}`, color: '#79c0ff', size: 28 }));
  return out;
}

/** 屏幕上方的提示条 */
export function toast(scene: Phaser.Scene, msg: string, color: string = '#ffe9a8'): void {
  const t = scene.add.text(360, 210, msg, {
    fontFamily: SERIF, fontSize: '30px', fontStyle: 'bold', color,
    backgroundColor: '#0d1117e6', padding: { x: 26, y: 14 }, align: 'center',
    wordWrap: { width: 620, useAdvancedWrap: true },
  }).setOrigin(0.5).setDepth(9000);
  scene.tweens.add({ targets: t, y: 180, alpha: { from: 1, to: 0 }, delay: 1400, duration: 500, onComplete: () => t.destroy() });
}

export function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
