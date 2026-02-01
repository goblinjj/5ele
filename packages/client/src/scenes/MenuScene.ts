import Phaser from 'phaser';
import { WUXING_COLORS, Wuxing } from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';

/**
 * 主菜单场景 - 水墨画风格
 */
export class MenuScene extends Phaser.Scene {
  // UI 颜色主题
  private readonly colors = {
    bgDark: 0x0d1117,
    inkBlack: 0x1c2128,
    inkGrey: 0x30363d,
    paperWhite: 0xf0e6d3,
    paperCream: 0xe8dcc8,
    goldAccent: 0xd4a853,
  };

  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // 背景
    this.createBackground();

    // 标题区域
    this.createTitle();

    // 五行装饰
    this.createWuxingDecoration();

    // 按钮
    this.createButtons();

    // 版本号
    this.add.text(width - 20, height - 20, 'v0.2.0', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
      color: '#484f58',
    }).setOrigin(1, 1);
  }

  private createBackground(): void {
    const { width, height } = this.cameras.main;

    // 深色背景
    const bgGraphics = this.add.graphics();
    bgGraphics.fillStyle(this.colors.bgDark, 1);
    bgGraphics.fillRect(0, 0, width, height);

    // 水墨晕染效果
    for (let i = 0; i < 10; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const radius = Phaser.Math.Between(60, 180);
      bgGraphics.fillStyle(this.colors.inkBlack, 0.5);
      bgGraphics.fillCircle(x, y, radius);
    }

    // 顶部和底部装饰线
    bgGraphics.lineStyle(1, this.colors.goldAccent, 0.3);
    bgGraphics.lineBetween(60, 80, width - 60, 80);
    bgGraphics.lineBetween(60, height - 80, width - 60, height - 80);

    // 角落装饰
    const cornerSize = 30;
    bgGraphics.lineStyle(2, this.colors.goldAccent, 0.4);
    // 左上
    bgGraphics.lineBetween(40, 60, 40 + cornerSize, 60);
    bgGraphics.lineBetween(40, 60, 40, 60 + cornerSize);
    // 右上
    bgGraphics.lineBetween(width - 40, 60, width - 40 - cornerSize, 60);
    bgGraphics.lineBetween(width - 40, 60, width - 40, 60 + cornerSize);
    // 左下
    bgGraphics.lineBetween(40, height - 60, 40 + cornerSize, height - 60);
    bgGraphics.lineBetween(40, height - 60, 40, height - 60 - cornerSize);
    // 右下
    bgGraphics.lineBetween(width - 40, height - 60, width - 40 - cornerSize, height - 60);
    bgGraphics.lineBetween(width - 40, height - 60, width - 40, height - 60 - cornerSize);
  }

  private createTitle(): void {
    const { width, height } = this.cameras.main;

    // 主标题
    const title = this.add.text(width / 2, height * 0.22, '西游肉鸽', {
      fontFamily: '"Noto Serif SC", "Source Han Serif CN", serif',
      fontSize: '72px',
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

    // 副标题
    const subtitle = this.add.text(width / 2, height * 0.32, '五行策略 · 回合对战', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '22px',
      color: '#8b949e',
    });
    subtitle.setOrigin(0.5);
  }

  private createWuxingDecoration(): void {
    const { width, height } = this.cameras.main;

    const wuxingOrder = [Wuxing.METAL, Wuxing.WOOD, Wuxing.WATER, Wuxing.FIRE, Wuxing.EARTH];
    const wuxingSymbols = ['金', '木', '水', '火', '土'];
    const circleRadius = 22;
    const spacing = 70;
    const startX = width / 2 - (wuxingOrder.length - 1) * spacing / 2;
    const y = height * 0.42;

    wuxingOrder.forEach((wuxing, index) => {
      const x = startX + index * spacing;
      const color = WUXING_COLORS[wuxing];

      // 外圈光晕
      const aura = this.add.circle(x, y, circleRadius + 8, color, 0.15);

      // 主圆
      const circle = this.add.circle(x, y, circleRadius, color, 0.8);
      circle.setStrokeStyle(2, 0xffffff, 0.3);

      // 五行符号
      const symbol = this.add.text(x, y, wuxingSymbols[index], {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: '18px',
        color: '#ffffff',
      }).setOrigin(0.5);

      // 脉冲动画 - 错开时间
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

    // 相生相克说明
    this.add.text(width / 2, y + 50, '相克：金→木→土→水→火→金', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '12px',
      color: '#6e7681',
    }).setOrigin(0.5);
  }

  private createButtons(): void {
    const { width, height } = this.cameras.main;

    // 单人模式按钮
    this.createButton(
      width / 2,
      height * 0.58,
      '开始游戏',
      '单人模式',
      () => this.startSinglePlayer()
    );

    // 多人模式按钮
    this.createButton(
      width / 2,
      height * 0.70,
      '多人模式',
      '敬请期待',
      () => this.startMultiPlayer(),
      true
    );
  }

  private createButton(
    x: number,
    y: number,
    text: string,
    subText: string,
    onClick: () => void,
    disabled: boolean = false
  ): void {
    const buttonWidth = 220;
    const buttonHeight = 60;

    // 按钮容器
    const container = this.add.container(x, y);

    // 按钮背景
    const bg = this.add.graphics();
    bg.fillStyle(this.colors.inkBlack, 0.9);
    bg.fillRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 8);
    bg.lineStyle(2, disabled ? this.colors.inkGrey : this.colors.goldAccent, disabled ? 0.3 : 0.6);
    bg.strokeRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 8);

    // 按钮主文字
    const buttonText = this.add.text(0, -8, text, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '22px',
      color: disabled ? '#484f58' : '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 按钮副文字
    const buttonSubText = this.add.text(0, 16, subText, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '12px',
      color: disabled ? '#30363d' : '#8b949e',
    }).setOrigin(0.5);

    container.add([bg, buttonText, buttonSubText]);

    if (!disabled) {
      // 交互区域
      const hitArea = this.add.rectangle(0, 0, buttonWidth, buttonHeight, 0x000000, 0);
      hitArea.setInteractive({ useHandCursor: true });
      container.add(hitArea);

      hitArea.on('pointerover', () => {
        bg.clear();
        bg.fillStyle(this.colors.goldAccent, 0.9);
        bg.fillRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 8);
        bg.lineStyle(2, this.colors.paperWhite, 0.8);
        bg.strokeRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 8);
        buttonText.setColor('#0d1117');
        buttonSubText.setColor('#30363d');
      });

      hitArea.on('pointerout', () => {
        bg.clear();
        bg.fillStyle(this.colors.inkBlack, 0.9);
        bg.fillRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 8);
        bg.lineStyle(2, this.colors.goldAccent, 0.6);
        bg.strokeRoundedRect(-buttonWidth / 2, -buttonHeight / 2, buttonWidth, buttonHeight, 8);
        buttonText.setColor('#f0e6d3');
        buttonSubText.setColor('#8b949e');
      });

      hitArea.on('pointerdown', () => {
        container.setScale(0.98);
      });

      hitArea.on('pointerup', () => {
        container.setScale(1);
        onClick();
      });
    }
  }

  private startSinglePlayer(): void {
    console.log('开始单人模式');
    gameState.reset();
    this.scene.start('MapScene', { mode: 'single', round: 1 });
  }

  private startMultiPlayer(): void {
    console.log('多人模式暂未实现');
    // 显示提示
    const { width, height } = this.cameras.main;
    const tip = this.add.text(width / 2, height * 0.80, '多人模式开发中...', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
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
