import Phaser from 'phaser';
import { FX_DEPTH } from './Fx.js';

/**
 * 伤害数字：位图字体 + 对象池
 *
 * 普通 Text 每次改字都要在画布上重新排版、再上传成纹理，伤害数字一秒几十上百次，
 * 手机上非常吃性能。位图字体只是从一张图集里取字形，改字几乎没有开销。
 * 字形是白字黑边，用 tint 上色（黑边乘任何颜色仍是黑色）。
 */

export const DMG_FONT = 'dmg_font';
const CHARS = '0123456789!-+';
const CELL_W = 52;
const CELL_H = 72;

export function ensureDamageFont(scene: Phaser.Scene): void {
  if (scene.cache.bitmapFont.exists(DMG_FONT)) return;
  if (!scene.textures.exists(DMG_FONT)) {
    const tex = scene.textures.createCanvas(DMG_FONT, CELL_W * CHARS.length, CELL_H)!;
    const ctx = tex.context;
    ctx.font = '900 58px "Arial Black", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = 0; i < CHARS.length; i++) {
      const x = i * CELL_W + CELL_W / 2;
      const y = CELL_H / 2 + 2;
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#000000';
      ctx.strokeText(CHARS[i], x, y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(CHARS[i], x, y);
    }
    tex.refresh();
  }
  const data = Phaser.GameObjects.RetroFont.Parse(scene, {
    image: DMG_FONT,
    width: CELL_W,
    height: CELL_H,
    chars: CHARS,
    charsPerRow: CHARS.length,
    'spacing.x': 0,
    'spacing.y': 0,
    'offset.x': 0,
    'offset.y': 0,
    lineSpacing: 0,
  });
  scene.cache.bitmapFont.add(DMG_FONT, data);
}

export class DamageText {
  private scene: Phaser.Scene;
  private pool: Phaser.GameObjects.BitmapText[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    ensureDamageFont(scene);
  }

  /** 弹出一个数字：先放大弹出，再上浮淡出 */
  show(x: number, y: number, text: string, color: number, size: number, rise: number = 70, duration: number = 700, crit: boolean = false): void {
    let t = this.pool.pop();
    if (!t) {
      t = this.scene.add.bitmapText(0, 0, DMG_FONT, '').setOrigin(0.5).setDepth(FX_DEPTH + 20).setLetterSpacing(-16);
    }
    const jitter = (Math.random() - 0.5) * 40;
    t.setText(text).setFontSize(size).setTint(color)
      .setPosition(x + jitter, y).setAlpha(1).setScale(crit ? 1.9 : 1.4).setAngle(crit ? (Math.random() - 0.5) * 16 : 0)
      .setVisible(true).setActive(true);
    const obj = t;
    this.scene.tweens.add({ targets: obj, scale: 1, duration: crit ? 160 : 110, ease: 'Back.easeOut' });
    this.scene.tweens.add({
      targets: obj, y: y - rise, alpha: 0, duration, delay: crit ? 220 : 120, ease: 'Cubic.easeIn',
      onComplete: () => {
        obj.setVisible(false).setActive(false);
        this.pool.push(obj);
      },
    });
  }
}
