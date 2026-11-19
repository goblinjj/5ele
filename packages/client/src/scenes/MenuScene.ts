import Phaser from 'phaser';
import { WUXING_NAMES } from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';
import { WorldBackdrop } from '../systems/world/WorldBackdrop.js';
import { WX_ORDER, WX_TINT, SPIRIT_TINT } from '../config/worldConfig.js';
import { sfx } from '../systems/audio/Sfx.js';

const SERIF = '"Noto Serif SC", "Songti SC", "STSong", serif';
const SANS = '"Noto Sans SC", "PingFang SC", sans-serif';
const GOLD = 0xd4a853;
const PLAYER_ATLAS = 'player_spirit';

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/**
 * 主菜单
 *
 * 画面：墨色大地上的太极八卦阵缓缓旋转，五行沿相生环绕行，
 * 残魂悬于阵心 —— 与游戏内的气脉区域是同一套视觉语言。
 */
export class MenuScene extends Phaser.Scene {
  private taiji!: Phaser.GameObjects.Image;
  private bagua!: Phaser.GameObjects.Image;
  private orbs: Array<{ glow: Phaser.GameObjects.Image; core: Phaser.GameObjects.Arc; label: Phaser.GameObjects.Text }> = [];
  private links!: Phaser.GameObjects.Graphics;
  private orbitAngle: number = 0;
  private cx: number = 0;
  private cy: number = 0;
  private starting: boolean = false;

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    WorldBackdrop.ensureTextures(this);
    this.orbs = [];
    this.orbitAngle = 0;
    this.starting = false;
    this.cx = width / 2;
    this.cy = height * 0.43;

    this.createBackground(width, height);
    this.createDiagram();
    this.createSpirit();
    this.createTitle(width, height);
    this.createButtons(width, height);

    this.add.text(width / 2, height - 44, 'v0.4.0', {
      fontFamily: SANS, fontSize: '18px', color: '#484f58',
    }).setOrigin(0.5);

    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  // ───────────────────────── 背景 ─────────────────────────

  private createBackground(width: number, height: number): void {
    this.cameras.main.setBackgroundColor('#05080b');
    this.add.tileSprite(width / 2, height / 2, width, height, 'bg_ground').setTint(0x9fb4bc);

    // 阵心的本源之光
    this.add.image(this.cx, this.cy, 'fx_glow').setTint(SPIRIT_TINT)
      .setBlendMode(Phaser.BlendModes.ADD).setScale(5.2).setAlpha(0.3);

    // 升腾的灵气
    this.add.particles(0, 0, 'fx_dot', {
      x: { min: 0, max: width },
      y: { min: height * 0.15, max: height },
      lifespan: 5200,
      speedY: { min: -46, max: -14 },
      speedX: { min: -10, max: 10 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.6, end: 0 },
      tint: [SPIRIT_TINT, GOLD, 0xffffff],
      frequency: 110,
      blendMode: Phaser.BlendModes.ADD,
    });

    // 暗角（置于最上层之下的装饰层之上）
    this.add.image(width / 2, height / 2, 'fx_vignette')
      .setDisplaySize(width * 1.3, height * 1.15).setDepth(50);
  }

  // ───────────────────────── 太极 · 八卦 · 五行 ─────────────────────────

  private readonly ORBIT_R = 268;

  private createDiagram(): void {
    this.bagua = this.add.image(this.cx, this.cy, 'bg_bagua').setScale(0.6).setAlpha(0.6);
    // 相生环 + 相克星（每帧随五行转动重绘）
    this.links = this.add.graphics();
    this.taiji = this.add.image(this.cx, this.cy, 'bg_taiji').setScale(0.44).setAlpha(0.7);

    WX_ORDER.forEach(wx => {
      const tint = WX_TINT[wx];
      const glow = this.add.image(0, 0, 'fx_glow').setTint(tint)
        .setBlendMode(Phaser.BlendModes.ADD).setScale(0.75).setAlpha(0.75);
      const core = this.add.circle(0, 0, 37, 0x0a0f14, 0.92).setStrokeStyle(3, tint, 1);
      const label = this.add.text(0, 0, WUXING_NAMES[wx], {
        fontFamily: SERIF, fontSize: '42px', fontStyle: 'bold', color: hex(tint),
      }).setOrigin(0.5);
      this.tweens.add({
        targets: glow, alpha: 0.4, scale: 0.9,
        duration: 1400 + Math.random() * 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      this.orbs.push({ glow, core, label });
    });
    this.layoutOrbs();
  }

  private layoutOrbs(): void {
    const pts: Array<{ x: number; y: number }> = [];
    this.orbs.forEach((o, i) => {
      const a = this.orbitAngle - Math.PI / 2 + (i * Math.PI * 2) / 5;
      const x = this.cx + Math.cos(a) * this.ORBIT_R;
      const y = this.cy + Math.sin(a) * this.ORBIT_R;
      o.glow.setPosition(x, y);
      o.core.setPosition(x, y);
      o.label.setPosition(x, y);
      pts.push({ x, y });
    });

    const g = this.links;
    g.clear();
    g.lineStyle(2, GOLD, 0.28);
    g.strokeCircle(this.cx, this.cy, this.ORBIT_R);
    // 隔位相克
    pts.forEach((p, i) => {
      const q = pts[(i + 2) % 5];
      g.lineStyle(2, WX_TINT[WX_ORDER[i]], 0.22);
      g.lineBetween(p.x, p.y, q.x, q.y);
    });
  }

  /** 悬于阵心的残魂 */
  private createSpirit(): void {
    if (!this.textures.exists(PLAYER_ATLAS)) return;
    const idleKey = `${PLAYER_ATLAS}_idle`;
    if (!this.anims.exists(idleKey)) {
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = 0; i < 6; i++) {
        const f = `character_idle_${i}`;
        if (this.textures.get(PLAYER_ATLAS).has(f)) frames.push({ key: PLAYER_ATLAS, frame: f });
      }
      if (frames.length > 0) this.anims.create({ key: idleKey, frames, frameRate: 8, repeat: -1 });
    }
    this.add.image(this.cx, this.cy + 86, 'fx_shadow').setScale(1.5).setAlpha(0.8);
    const spirit = this.add.sprite(this.cx, this.cy - 6, PLAYER_ATLAS, 'character_idle_0').setScale(0.62);
    if (this.anims.exists(idleKey)) spirit.play(idleKey);
    this.tweens.add({
      targets: spirit, y: this.cy - 22, duration: 1800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  // ───────────────────────── 标题 ─────────────────────────

  private createTitle(width: number, height: number): void {
    const y = height * 0.105;
    const title = this.add.text(width / 2, y, '无极', {
      fontFamily: SERIF, fontSize: '168px', fontStyle: 'bold', color: '#f0e6d3',
      stroke: '#05080b', strokeThickness: 10,
      shadow: { offsetX: 0, offsetY: 0, color: '#9fd8ff', blur: 34, fill: true, stroke: false },
      // 留出边距，否则光晕会被文字画布的边界裁出一个方框
      padding: { x: 60, y: 50 },
    }).setOrigin(0.5).setDepth(60);
    // 金白渐变
    const grad = title.context.createLinearGradient(0, 0, 0, title.height);
    grad.addColorStop(0.15, '#ffffff');
    grad.addColorStop(0.55, '#f0e6d3');
    grad.addColorStop(1, '#c79a45');
    title.setFill(grad);

    const subY = y + 122;
    const sub = this.add.text(width / 2, subY, '五 行 轮 转 · 意 志 之 争', {
      fontFamily: SERIF, fontSize: '28px', color: hex(GOLD),
    }).setOrigin(0.5).setDepth(60);
    const g = this.add.graphics().setDepth(60);
    const half = sub.width / 2 + 22;
    g.lineStyle(2, GOLD, 0.6);
    g.lineBetween(width / 2 - half - 90, subY, width / 2 - half, subY);
    g.lineBetween(width / 2 + half, subY, width / 2 + half + 90, subY);
    g.fillStyle(GOLD, 0.9);
    g.fillCircle(width / 2 - half - 90, subY, 3);
    g.fillCircle(width / 2 + half + 90, subY, 3);

    title.setAlpha(0).setScale(1.12);
    sub.setAlpha(0);
    this.tweens.add({ targets: title, alpha: 1, scale: 1, duration: 900, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: sub, alpha: 1, duration: 700, delay: 500 });
  }

  // ───────────────────────── 按钮 ─────────────────────────

  private createButtons(width: number, height: number): void {
    // 主按钮
    const bw = 440, bh = 104;
    const bx = width / 2, by = height * 0.745;
    const glow = this.add.image(bx, by, 'fx_glow').setTint(GOLD).setBlendMode(Phaser.BlendModes.ADD)
      .setDisplaySize(bw * 1.5, bh * 2.6).setAlpha(0.35).setDepth(60);
    this.tweens.add({ targets: glow, alpha: 0.15, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const bg = this.add.graphics().setDepth(61);
    const draw = (down: boolean) => {
      bg.clear();
      bg.fillStyle(down ? 0x3d2c10 : 0x0d1117, 0.92);
      bg.fillRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, bh / 2);
      bg.lineStyle(3, 0xffe9a8, 1);
      bg.strokeRoundedRect(bx - bw / 2, by - bh / 2, bw, bh, bh / 2);
      bg.lineStyle(1.5, GOLD, 0.5);
      bg.strokeRoundedRect(bx - bw / 2 + 8, by - bh / 2 + 8, bw - 16, bh - 16, (bh - 16) / 2);
    };
    draw(false);
    this.add.text(bx, by - 2, '踏 入 气 脉', {
      fontFamily: SERIF, fontSize: '46px', fontStyle: 'bold', color: '#ffe9a8',
    }).setOrigin(0.5).setDepth(62);
    const hit = this.add.rectangle(bx, by, bw, bh, 0xffffff, 0).setDepth(63).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => draw(true));
    hit.on('pointerout', () => draw(false));
    hit.on('pointerup', () => { draw(false); sfx.unlock(); sfx.click(); this.startSinglePlayer(); });

    this.add.text(bx, by + bh / 2 + 34, '夺回五行之力，让世界归于平衡', {
      fontFamily: SERIF, fontSize: '22px', color: '#8b949e',
    }).setOrigin(0.5).setDepth(60);

    // 次级入口
    const rowY = height * 0.875;
    this.createLink(width / 2 - 150, rowY, '游戏介绍', true, () => window.open('/landing/index.html', '_blank'));
    // 音效开关（记在本机）
    const soundLabel = () => `音效：${sfx.isMuted() ? '关' : '开'}`;
    const soundLink = this.createLink(width / 2 + 150, rowY, soundLabel(), true, () => {
      sfx.unlock();
      sfx.setMuted(!sfx.isMuted());
      soundLink.setText(soundLabel());
      sfx.click();
    });
    const sep = this.add.graphics().setDepth(60);
    sep.lineStyle(1.5, 0x30363d, 1);
    sep.lineBetween(width / 2, rowY - 16, width / 2, rowY + 16);
    this.add.text(width / 2, rowY + 62, '多人模式 · 敬请期待', {
      fontFamily: SANS, fontSize: '18px', color: '#484f58',
    }).setOrigin(0.5).setDepth(60);
  }

  private createLink(x: number, y: number, label: string, enabled: boolean, onClick: () => void): Phaser.GameObjects.Text {
    const t = this.add.text(x, y, label, {
      fontFamily: SERIF, fontSize: '26px', color: enabled ? '#c9d1d9' : '#484f58',
      padding: { x: 18, y: 14 },
    }).setOrigin(0.5).setDepth(60);
    if (!enabled) return t;
    t.setInteractive({ useHandCursor: true });
    t.on('pointerover', () => t.setColor(hex(GOLD)));
    t.on('pointerout', () => t.setColor('#c9d1d9'));
    t.on('pointerup', onClick);
    return t;
  }

  private startSinglePlayer(): void {
    if (this.starting) return;
    this.starting = true;
    gameState.reset();
    this.cameras.main.fadeOut(350, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('PrologueScene');
    });
  }

  update(_time: number, delta: number): void {
    this.taiji.rotation += delta * 0.00035;
    this.bagua.rotation -= delta * 0.00008;
    this.orbitAngle += delta * 0.00012;
    this.layoutOrbs();
  }
}
