import Phaser from 'phaser';
import { WUXING_COLORS, Wuxing } from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';
import { uiConfig } from '../config/uiConfig.js';

/**
 * 主菜单场景 - 响应式布局（基于屏幕百分比）
 */
export class MenuScene extends Phaser.Scene {
  private readonly colors = {
    bgDark: 0x0d1117,
    inkBlack: 0x1c2128,
    inkGrey: 0x30363d,
    paperWhite: 0xf0e6d3,
    goldAccent: 0xd4a853,
  };

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    this.createBackground();
    this.createTitle();
    this.createWuxingDecoration();
    this.createButtons();

    // 版本号 - 底部 5%
    this.add.text(width / 2, height * 0.95, 'v0.3.0', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontXS}px`,
      color: '#484f58',
    }).setOrigin(0.5);
  }

  private createBackground(): void {
    const { width, height } = this.cameras.main;

    const bgGraphics = this.add.graphics();
    bgGraphics.fillStyle(this.colors.bgDark, 1);
    bgGraphics.fillRect(0, 0, width, height);

    // 水墨晕染效果
    for (let i = 0; i < 8; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const radius = Phaser.Math.Between(width * 0.06, width * 0.15);
      bgGraphics.fillStyle(this.colors.inkBlack, 0.5);
      bgGraphics.fillCircle(x, y, radius);
    }

    // 装饰线 - 上方 18%，下方 80%
    bgGraphics.lineStyle(1, this.colors.goldAccent, 0.3);
    bgGraphics.lineBetween(width * 0.03, height * 0.18, width * 0.97, height * 0.18);
    bgGraphics.lineBetween(width * 0.03, height * 0.80, width * 0.97, height * 0.80);
  }

  private createTitle(): void {
    const { width, height } = this.cameras.main;

    // 主标题 - 顶部 9%
    const title = this.add.text(width / 2, height * 0.09, '无极', {
      fontFamily: '"Noto Serif SC", "Source Han Serif CN", serif',
      fontSize: `${uiConfig.font3XL}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    });
    title.setOrigin(0.5);
    title.setStroke('#000000', 6);

    // 标题光效
    this.tweens.add({
      targets: title,
      alpha: { from: 0.9, to: 1 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 副标题 - 顶部 15%
    this.add.text(width / 2, height * 0.15, '五行轮转 · 意志之争', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontLG}px`,
      color: '#8b949e',
    }).setOrigin(0.5);
  }

  private createWuxingDecoration(): void {
    const { width, height } = this.cameras.main;

    const wuxingOrder = [Wuxing.METAL, Wuxing.WOOD, Wuxing.WATER, Wuxing.FIRE, Wuxing.EARTH];
    const wuxingSymbols = ['金', '木', '水', '火', '土'];

    // 响应式大小 - 放大图标
    const circleRadius = Math.max(22, Math.min(34, width * 0.028));
    const spacing = Math.max(60, Math.min(90, width * 0.08));
    const startX = width / 2 - (wuxingOrder.length - 1) * spacing / 2;
    const y = height * 0.27; // 27% 从顶部

    wuxingOrder.forEach((wuxing, index) => {
      const x = startX + index * spacing;
      const color = WUXING_COLORS[wuxing];

      const aura = this.add.circle(x, y, circleRadius + 8, color, 0.15);
      const circle = this.add.circle(x, y, circleRadius, color, 0.8);
      circle.setStrokeStyle(2, 0xffffff, 0.3);

      const symbol = this.add.text(x, y, wuxingSymbols[index], {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: `${uiConfig.fontLG}px`,
        color: '#ffffff',
      }).setOrigin(0.5);

      this.tweens.add({
        targets: aura,
        scaleX: 1.3,
        scaleY: 1.3,
        alpha: 0,
        duration: 1500,
        delay: index * 300,
        repeat: -1,
        ease: 'Power2.easeOut',
      });
    });

    // 相克说明 - 五行下方
    this.add.text(width / 2, y + circleRadius + 32, '相克：金→木→土→水→火→金', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#6e7681',
    }).setOrigin(0.5);
  }

  private createButtons(): void {
    const { width, height } = this.cameras.main;

    // 开始游戏按钮 - 纵向排列 48%
    this.createButton(width / 2, height * 0.48, '开始游戏', '单人模式', () => this.startSinglePlayer());

    // 多人模式按钮 - 纵向排列 58%
    this.createButton(width / 2, height * 0.58, '多人模式', '敬请期待', () => this.startMultiPlayer(), true);

    // 游戏介绍链接 67%
    this.createLinkButton(width / 2, height * 0.67, '游戏介绍', () => this.openLanding());
  }

  private createLinkButton(x: number, y: number, text: string, onClick: () => void): void {
    const linkText = this.add.text(x, y, `📜 ${text}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontLG}px`,
      color: '#8b949e',
    }).setOrigin(0.5);

    linkText.setInteractive({ useHandCursor: true });

    linkText.on('pointerover', () => {
      linkText.setColor('#d4a853');
      linkText.setScale(1.05);
    });

    linkText.on('pointerout', () => {
      linkText.setColor('#8b949e');
      linkText.setScale(1);
    });

    linkText.on('pointerup', onClick);
  }

  private openLanding(): void {
    window.open('/landing/', '_blank');
  }

  private createButton(
    x: number,
    y: number,
    text: string,
    subText: string,
    onClick: () => void,
    disabled: boolean = false
  ): void {
    const { width, height } = this.cameras.main;

    // 响应式按钮尺寸（放大）
    const buttonWidth = Math.max(260, Math.min(520, width * 0.75));
    const buttonHeight = Math.max(64, Math.min(90, height * 0.07));

    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(this.colors.inkBlack, 0.9);
    bg.fillRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 12);
    bg.lineStyle(2, disabled ? this.colors.inkGrey : this.colors.goldAccent, disabled ? 0.3 : 0.6);
    bg.strokeRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 12);

    const buttonText = this.add.text(0, -buttonHeight * 0.14, text, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.font2XL}px`,
      color: disabled ? '#484f58' : '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const buttonSubText = this.add.text(0, buttonHeight * 0.22, subText, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: disabled ? '#30363d' : '#8b949e',
    }).setOrigin(0.5);

    container.add([bg, buttonText, buttonSubText]);

    if (!disabled) {
      const hitArea = this.add.rectangle(0, 0, buttonWidth, buttonHeight, 0x000000, 0);
      hitArea.setInteractive({ useHandCursor: true });
      container.add(hitArea);

      hitArea.on('pointerover', () => {
        bg.clear();
        bg.fillStyle(this.colors.goldAccent, 0.9);
        bg.fillRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 12);
        bg.lineStyle(2, this.colors.paperWhite, 0.8);
        bg.strokeRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 12);
        buttonText.setColor('#0d1117');
        buttonSubText.setColor('#30363d');
      });

      hitArea.on('pointerout', () => {
        bg.clear();
        bg.fillStyle(this.colors.inkBlack, 0.9);
        bg.fillRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 12);
        bg.lineStyle(2, this.colors.goldAccent, 0.6);
        bg.strokeRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 12);
        buttonText.setColor('#f0e6d3');
        buttonSubText.setColor('#8b949e');
      });

      hitArea.on('pointerdown', () => container.setScale(0.98));
      hitArea.on('pointerup', () => {
        container.setScale(1);
        onClick();
      });
    }
  }

  private startSinglePlayer(): void {
    gameState.reset();
    this.scene.start('PrologueScene');
  }

  private startMultiPlayer(): void {
    const { width, height } = this.cameras.main;
    const tip = this.add.text(width / 2, height * 0.78, '多人模式开发中...', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#8b949e',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: tip,
      alpha: 0,
      duration: 1500,
      delay: 1000,
      onComplete: () => tip.destroy(),
    });
  }
}
