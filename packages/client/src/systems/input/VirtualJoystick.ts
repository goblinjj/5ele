import Phaser from 'phaser';
import { inputManager } from './InputManager.js';
import { RENDER_SCALE } from '../../config/gameConfig.js';

/**
 * 浮动虚拟摇杆：
 *  - 在允许区域内任意位置按下，摇杆底座就出现在手指处
 *  - 本次触摸期间底座固定不动，松手后下一次触摸重新定位
 *  - 带死区与响应曲线：推到 60% 行程即满速
 */
export class VirtualJoystick {
  private scene: Phaser.Scene;
  private restX: number;
  private restY: number;
  private baseRadius: number;

  private base: Phaser.GameObjects.Graphics;
  private thumb: Phaser.GameObjects.Graphics;

  private pointerId: number = -1;
  private originX: number = 0;
  private originY: number = 0;
  private minY: number;
  private enabled: boolean = true;

  private onDown: (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => void;
  private onMove: (p: Phaser.Input.Pointer) => void;
  private onUp: (p: Phaser.Input.Pointer) => void;

  constructor(scene: Phaser.Scene, restX: number, restY: number, baseRadius: number, minY: number) {
    this.scene = scene;
    this.restX = restX;
    this.restY = restY;
    this.baseRadius = baseRadius;
    this.minY = minY;

    this.base = scene.add.graphics().setDepth(100);
    this.base.fillStyle(0x0d1117, 0.35);
    this.base.fillCircle(0, 0, baseRadius);
    this.base.lineStyle(3, 0xd4a853, 0.55);
    this.base.strokeCircle(0, 0, baseRadius);
    this.base.lineStyle(1.5, 0xd4a853, 0.25);
    this.base.strokeCircle(0, 0, baseRadius * 0.6);

    const tr = baseRadius * 0.42;
    this.thumb = scene.add.graphics().setDepth(101);
    this.thumb.fillStyle(0xd4a853, 0.75);
    this.thumb.fillCircle(0, 0, tr);
    this.thumb.lineStyle(2, 0xfff3c4, 0.8);
    this.thumb.strokeCircle(0, 0, tr);

    this.toRest();

    this.onDown = (pointer, over) => {
      if (!this.enabled || this.pointerId !== -1) return;
      if (over && over.length > 0) return;         // 按在按钮上
      if (pointer.y / RENDER_SCALE < this.minY) return;
      this.pointerId = pointer.id;
      this.originX = pointer.x / RENDER_SCALE;
      this.originY = pointer.y / RENDER_SCALE;
      this.base.setPosition(this.originX, this.originY).setAlpha(1);
      this.thumb.setPosition(this.originX, this.originY).setAlpha(1);
      inputManager.setMove(0, 0);
    };
    this.onMove = (pointer) => {
      if (pointer.id !== this.pointerId) return;
      this.track(pointer.x / RENDER_SCALE, pointer.y / RENDER_SCALE);
    };
    this.onUp = (pointer) => {
      if (pointer.id !== this.pointerId) return;
      this.release();
    };

    scene.input.on('pointerdown', this.onDown);
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerup', this.onUp);
    scene.input.on('pointerupoutside', this.onUp);
  }

  private toRest(): void {
    this.base.setPosition(this.restX, this.restY).setAlpha(0.45);
    this.thumb.setPosition(this.restX, this.restY).setAlpha(0.45);
  }

  private track(px: number, py: number): void {
    const dx = px - this.originX;
    const dy = py - this.originY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 底座固定在本次按下的位置；摇杆头最多拖到底座边缘
    const clamped = Math.min(dist, this.baseRadius);
    const ux = dist > 0 ? dx / dist : 0;
    const uy = dist > 0 ? dy / dist : 0;
    this.thumb.setPosition(this.originX + ux * clamped, this.originY + uy * clamped);

    const raw = clamped / this.baseRadius;
    const DEAD = 0.14;
    if (raw < DEAD) {
      inputManager.setMove(0, 0);
      return;
    }
    // 60% 行程即满速
    const force = Math.min(1, (raw - DEAD) / (0.6 - DEAD));
    inputManager.setMove(ux * force, uy * force);
  }

  private release(): void {
    this.pointerId = -1;
    inputManager.setMove(0, 0);
    this.toRest();
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v && this.pointerId !== -1) this.release();
    this.base.setVisible(v);
    this.thumb.setVisible(v);
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown);
    this.scene.input.off('pointermove', this.onMove);
    this.scene.input.off('pointerup', this.onUp);
    this.scene.input.off('pointerupoutside', this.onUp);
    this.base.destroy();
    this.thumb.destroy();
    inputManager.setMove(0, 0);
  }
}
