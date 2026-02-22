import Phaser from 'phaser';
import { inputManager } from './InputManager.js';

export class VirtualJoystick {
  private scene: Phaser.Scene;
  private baseX: number;
  private baseY: number;
  private baseRadius: number;
  private thumbRadius: number;

  private base!: Phaser.GameObjects.Graphics;
  private thumb!: Phaser.GameObjects.Graphics;

  private pointerId: number = -1;

  constructor(scene: Phaser.Scene, x: number, y: number, baseRadius: number = 70) {
    this.scene = scene;
    this.baseX = x;
    this.baseY = y;
    this.baseRadius = baseRadius;
    this.thumbRadius = baseRadius * 0.45;

    this.createGraphics();
    this.bindInput();
  }

  private createGraphics(): void {
    this.base = this.scene.add.graphics();
    this.base.fillStyle(0xffffff, 0.08);
    this.base.fillCircle(0, 0, this.baseRadius);
    this.base.lineStyle(2, 0xd4a853, 0.4);
    this.base.strokeCircle(0, 0, this.baseRadius);
    this.base.setPosition(this.baseX, this.baseY);
    this.base.setScrollFactor(0);
    this.base.setDepth(100);

    this.thumb = this.scene.add.graphics();
    this.thumb.fillStyle(0xd4a853, 0.5);
    this.thumb.fillCircle(0, 0, this.thumbRadius);
    this.thumb.setPosition(this.baseX, this.baseY);
    this.thumb.setScrollFactor(0);
    this.thumb.setDepth(101);
  }

  private bindInput(): void {
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // 只响应左半屏的触摸
      if (pointer.x < this.scene.cameras.main.width / 2 && this.pointerId === -1) {
        this.pointerId = pointer.id;
        this.update(pointer.x, pointer.y);
      }
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.pointerId) {
        this.update(pointer.x, pointer.y);
      }
    });

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.pointerId) {
        this.pointerId = -1;
        this.thumb.setPosition(this.baseX, this.baseY);
        inputManager.setMove(0, 0);
      }
    });
  }

  private update(px: number, py: number): void {
    const dx = px - this.baseX;
    const dy = py - this.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(dist, this.baseRadius);
    const angle = Math.atan2(dy, dx);

    const thumbX = this.baseX + Math.cos(angle) * clampedDist;
    const thumbY = this.baseY + Math.sin(angle) * clampedDist;
    this.thumb.setPosition(thumbX, thumbY);

    // 归一化向量（0~1）
    const force = clampedDist / this.baseRadius;
    inputManager.setMove(
      Math.cos(angle) * force,
      Math.sin(angle) * force
    );
  }

  destroy(): void {
    this.base.destroy();
    this.thumb.destroy();
  }
}
