import Phaser from 'phaser';

/** 特效层深度（世界内对象按 y 排序，深度 0~3200；特效统一在其上） */
export const FX_DEPTH = 5000;

const FONT_NUM = '"Noto Serif SC", "Songti SC", serif';

/**
 * 程序化特效：所有贴图都在运行时用 Canvas 生成，不依赖额外美术资源。
 */
export class Fx {
  private scene: Phaser.Scene;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private textPool: Phaser.GameObjects.Text[] = [];
  private motes!: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 打击停顿剩余时间（真实毫秒） */
  private stopTimer: number = 0;
  private embers!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    Fx.ensureTextures(scene);
    this.sparks = scene.add.particles(0, 0, 'fx_dot', {
      lifespan: { min: 220, max: 520 },
      speed: { min: 90, max: 380 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(FX_DEPTH + 5);

    // 拖尾微粒：几乎不动，原地缩小消失
    this.motes = scene.add.particles(0, 0, 'fx_dot', {
      lifespan: { min: 180, max: 380 },
      speed: { min: 0, max: 28 },
      scale: { start: 0.85, end: 0 },
      alpha: { start: 0.85, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(FX_DEPTH - 3);

    // 升腾的余烬 / 灵气
    this.embers = scene.add.particles(0, 0, 'fx_dot', {
      lifespan: { min: 500, max: 1000 },
      speedX: { min: -30, max: 30 },
      speedY: { min: -130, max: -50 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.95, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(FX_DEPTH + 4);
  }

  // ───────────────────────── 贴图生成 ─────────────────────────

  static ensureTextures(scene: Phaser.Scene): void {
    const tx = scene.textures;

    const radial = (
      key: string, size: number,
      stops: Array<[number, string]>
    ) => {
      if (tx.exists(key)) return;
      const c = tx.createCanvas(key, size, size)!;
      const ctx = c.getContext();
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      stops.forEach(([o, col]) => g.addColorStop(o, col));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
      c.refresh();
    };

    // 柔光
    radial('fx_glow', 256, [
      [0, 'rgba(255,255,255,1)'],
      [0.25, 'rgba(255,255,255,0.55)'],
      [0.6, 'rgba(255,255,255,0.14)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    // 小光点
    radial('fx_dot', 24, [
      [0, 'rgba(255,255,255,1)'],
      [0.4, 'rgba(255,255,255,0.8)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    // 暗角
    radial('fx_vignette', 512, [
      [0, 'rgba(0,0,0,0)'],
      [0.55, 'rgba(0,0,0,0)'],
      [0.85, 'rgba(0,0,0,0.45)'],
      [1, 'rgba(0,0,0,0.85)'],
    ]);

    // 脚下阴影
    if (!tx.exists('fx_shadow')) {
      const c = tx.createCanvas('fx_shadow', 128, 48)!;
      const ctx = c.getContext();
      ctx.save();
      ctx.translate(64, 24);
      ctx.scale(1, 24 / 64);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 64);
      g.addColorStop(0, 'rgba(0,0,0,0.6)');
      g.addColorStop(0.6, 'rgba(0,0,0,0.3)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-64, -64, 128, 128);
      ctx.restore();
      c.refresh();
    }

    // 圆环（冲击波 / 脚下五行环）
    if (!tx.exists('fx_ring')) {
      const s = 256;
      const c = tx.createCanvas('fx_ring', s, s)!;
      const ctx = c.getContext();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 18;
      ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 14, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,1)';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 14, 0, Math.PI * 2); ctx.stroke();
      c.refresh();
    }

    // 实心预警圆（妖异蓄力范围）
    if (!tx.exists('fx_disc')) {
      const s = 256;
      const c = tx.createCanvas('fx_disc', s, s)!;
      const ctx = c.getContext();
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2 - 4);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(0.8, 'rgba(255,255,255,0.32)');
      g.addColorStop(1, 'rgba(255,255,255,0.55)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2); ctx.stroke();
      c.refresh();
    }

    // 气劲弹（朝右）
    if (!tx.exists('fx_bolt')) {
      const w = 96, h = 32;
      const c = tx.createCanvas('fx_bolt', w, h)!;
      const ctx = c.getContext();
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,1)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.quadraticCurveTo(w * 0.6, 0, w - h / 2, 2);
      ctx.arc(w - h / 2, h / 2, h / 2 - 2, -Math.PI / 2, Math.PI / 2);
      ctx.quadraticCurveTo(w * 0.6, h, 0, h / 2);
      ctx.fill();
      c.refresh();
    }

    // 斩击弧
    if (!tx.exists('fx_slash')) {
      const s = 256;
      const c = tx.createCanvas('fx_slash', s, s)!;
      const ctx = c.getContext();
      ctx.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = `rgba(255,255,255,${0.12 + i * 0.16})`;
        ctx.lineWidth = 34 - i * 5;
        ctx.beginPath();
        ctx.arc(s / 2, s / 2, s / 2 - 30, -Math.PI * 0.42, Math.PI * 0.42);
        ctx.stroke();
      }
      c.refresh();
    }
  }

  // ───────────────────────── 特效 ─────────────────────────

  /** 火花爆散 */
  burst(x: number, y: number, color: number, count: number = 8): void {
    this.sparks.setParticleTint(color);
    this.sparks.explode(count, x, y);
  }

  // ───────────────────────── 打击停顿 ─────────────────────────

  /** 命中瞬间让整个世界几乎静止 ms 毫秒，给这一击"分量" */
  hitStop(ms: number): void {
    this.stopTimer = Math.max(this.stopTimer, ms);
  }

  /**
   * 每帧调用一次：推进停顿计时，返回本帧的全局时间倍率（停顿中约 0.04，否则 1）。
   * worldScale 是"子弹时间"的世界流速（1 = 正常）：只作用在妖异身上——
   * 动画与物理按它放慢，残魂自己的速度由调用方补偿回来。
   */
  tickTimeScale(rawDelta: number, worldScale: number = 1): number {
    const stopping = this.stopTimer > 0;
    if (stopping) this.stopTimer -= rawDelta;
    const k = stopping ? 0.04 : 1;
    this.scene.tweens.timeScale = k;
    this.scene.time.timeScale = k;
    this.scene.anims.globalTimeScale = k * worldScale;
    // Arcade 物理的 timeScale 是反的：越大越慢
    this.scene.physics.world.timeScale = 1 / (k * worldScale);
    return k;
  }

  /**
   * 场景结束时恢复正常流速（动画管理器是全局共享的，必须还原）。
   * 关闭过程中各插件的销毁顺序不固定，物理世界等可能已经不在了，逐项判空。
   */
  resetTimeScale(): void {
    this.stopTimer = 0;
    const s = this.scene;
    if (s.anims) s.anims.globalTimeScale = 1;
    if (s.tweens) s.tweens.timeScale = 1;
    if (s.time) s.time.timeScale = 1;
    if (s.physics?.world) s.physics.world.timeScale = 1;
  }

  // ───────────────────────── 挤压与拉伸 ─────────────────────────

  /** 瞬间变形后弹回原状（受击被压扁、出手前冲被拉长） */
  squash(sprite: Phaser.GameObjects.Sprite, base: number, sx: number, sy: number, duration: number = 160): void {
    if (!sprite.active) return;
    (sprite.getData('sq') as Phaser.Tweens.Tween | undefined)?.stop();
    sprite.setScale(base * sx, base * sy);
    sprite.setData('sq', this.scene.tweens.add({
      targets: sprite, scaleX: base, scaleY: base, duration, ease: 'Back.easeOut',
    }));
  }

  /** 缓慢变形并保持（蓄力时身体下沉蓄劲），之后由 squash 接管弹回 */
  stretchTo(sprite: Phaser.GameObjects.Sprite, base: number, sx: number, sy: number, duration: number): void {
    if (!sprite.active) return;
    (sprite.getData('sq') as Phaser.Tweens.Tween | undefined)?.stop();
    sprite.setData('sq', this.scene.tweens.add({
      targets: sprite, scaleX: base * sx, scaleY: base * sy, duration, ease: 'Sine.easeIn',
    }));
  }

  /** 拖尾微粒（弹道、移动、能量飞行） */
  trail(x: number, y: number, color: number, count: number = 1): void {
    this.motes.setParticleTint(color);
    this.motes.emitParticleAt(x, y, count);
  }

  /** 向上飘散的余烬（灼烧、魁首气场、塑型） */
  ember(x: number, y: number, color: number, count: number = 1, spread: number = 20): void {
    this.embers.setParticleTint(color);
    for (let i = 0; i < count; i++) {
      this.embers.emitParticleAt(x + (Math.random() - 0.5) * spread * 2, y + (Math.random() - 0.5) * spread, 1);
    }
  }

  /** 沿圆周迸发的火花（范围技能边缘、震地） */
  radial(x: number, y: number, radius: number, color: number, count: number = 20): void {
    this.sparks.setParticleTint(color);
    const off = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = off + (i / count) * Math.PI * 2;
      this.sparks.emitParticleAt(x + Math.cos(a) * radius, y + Math.sin(a) * radius, 1);
    }
  }

  /** 多色庆祝礼花 */
  celebrate(x: number, y: number, colors: number[]): void {
    colors.forEach((c, i) => {
      this.scene.time.delayedCall(i * 90, () => {
        const a = Math.random() * Math.PI * 2;
        const d = 60 + Math.random() * 140;
        const bx = x + Math.cos(a) * d, by = y + Math.sin(a) * d * 0.7;
        this.burst(bx, by, c, 22);
        this.ember(bx, by, c, 8, 40);
        this.ring(bx, by, 90, c, 420);
      });
    });
  }

  /** 扩散圆环 */
  ring(x: number, y: number, radius: number, color: number, duration: number = 420, fromScale: number = 0.15): void {
    const full = (radius * 2) / 256;
    const img = this.scene.add.image(x, y, 'fx_ring')
      .setTint(color).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(full * fromScale).setDepth(FX_DEPTH);
    this.scene.tweens.add({
      targets: img, scale: full, alpha: 0, duration, ease: 'Cubic.easeOut',
      onComplete: () => img.destroy(),
    });
  }

  /** 一闪而过的柔光 */
  flashGlow(x: number, y: number, radius: number, color: number, duration: number = 300, alpha: number = 0.8): void {
    const img = this.scene.add.image(x, y, 'fx_glow')
      .setTint(color).setBlendMode(Phaser.BlendModes.ADD)
      .setScale((radius * 2) / 256).setAlpha(alpha).setDepth(FX_DEPTH - 1);
    this.scene.tweens.add({
      targets: img, alpha: 0, scale: img.scale * 1.25, duration, ease: 'Quad.easeOut',
      onComplete: () => img.destroy(),
    });
  }

  /** 斩击弧（朝 angle 方向） */
  slash(x: number, y: number, angle: number, size: number, color: number): void {
    const img = this.scene.add.image(x, y, 'fx_slash')
      .setTint(color).setBlendMode(Phaser.BlendModes.ADD)
      .setRotation(angle).setScale((size / 256) * 0.7).setDepth(FX_DEPTH);
    this.scene.tweens.add({
      targets: img, scale: size / 256, alpha: 0, duration: 220, ease: 'Quad.easeOut',
      onComplete: () => img.destroy(),
    });
  }

  /** 残影（遁） */
  afterimage(sprite: Phaser.GameObjects.Sprite, color: number): void {
    const img = this.scene.add.image(sprite.x, sprite.y, sprite.texture.key, sprite.frame.name)
      .setScale(sprite.scaleX, sprite.scaleY).setFlipX(sprite.flipX)
      .setTintFill(color).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(sprite.depth - 1);
    this.scene.tweens.add({
      targets: img, alpha: 0, duration: 260,
      onComplete: () => img.destroy(),
    });
  }

  /** 镜头震动 */
  shake(intensity: number = 0.004, duration: number = 90): void {
    this.scene.cameras.main.shake(duration, intensity, false);
  }

  /** 飘字（对象池） */
  floatText(
    x: number, y: number, text: string, color: string,
    size: number = 26, rise: number = 70, duration: number = 750
  ): void {
    let t = this.textPool.pop();
    if (!t) {
      t = this.scene.add.text(0, 0, '', {
        fontFamily: FONT_NUM,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 5,
      }).setOrigin(0.5).setDepth(FX_DEPTH + 20);
    }
    const jitter = (Math.random() - 0.5) * 36;
    t.setText(text).setColor(color).setFontSize(size)
      .setPosition(x + jitter, y).setAlpha(1).setScale(0.5).setVisible(true).setActive(true);
    const obj = t;
    this.scene.tweens.add({
      targets: obj, scale: 1, duration: 110, ease: 'Back.easeOut',
    });
    this.scene.tweens.add({
      targets: obj, y: y - rise, alpha: 0, duration, ease: 'Cubic.easeIn',
      onComplete: () => {
        obj.setVisible(false).setActive(false);
        this.textPool.push(obj);
      },
    });
  }
}
