import Phaser from 'phaser';
import { uiConfig } from '../config/uiConfig.js';

/**
 * 序幕场景 - 显示游戏开场白
 */
export class PrologueScene extends Phaser.Scene {
  private readonly colors = {
    bgDark: 0x0d1117,
    inkBlack: 0x1c2128,
    paperWhite: 0xf0e6d3,
    goldAccent: 0xd4a853,
  };

  private textLines: string[] = [
    '无极生太极，太极生两仪，',
    '两仪生四象，四象生五行，五行化万物。',
    '',
    '这是世界的法则，亘古不变。',
    '',
    '然而五行失衡，万物病变。',
    '世界正在崩坏。',
    '',
    '而你——本源的意志残魂——',
    '被赋予了使命：',
    '',
    '夺回五行之力，让世界归于平衡。',
  ];

  private displayedTexts: Phaser.GameObjects.Text[] = [];
  private skipButton?: Phaser.GameObjects.Container;
  private canContinue: boolean = false;

  constructor() {
    super({ key: 'PrologueScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    this.createBackground();
    this.createSkipButton();

    // 点击任意位置继续
    this.input.on('pointerdown', () => this.handleClick());

    // 立即显示所有文字（1秒内完成）
    this.showAllLines();
  }

  private createBackground(): void {
    const { width, height } = this.cameras.main;

    const bgGraphics = this.add.graphics();
    bgGraphics.fillStyle(this.colors.bgDark, 1);
    bgGraphics.fillRect(0, 0, width, height);

    // 水墨晕染效果
    for (let i = 0; i < 12; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(0, height);
      const radius = Phaser.Math.Between(width * 0.08, width * 0.2);
      bgGraphics.fillStyle(this.colors.inkBlack, 0.4);
      bgGraphics.fillCircle(x, y, radius);
    }
  }

  private createSkipButton(): void {
    const { width, height } = this.cameras.main;

    this.skipButton = this.add.container(width * 0.92, height * 0.06);

    const btnBg = this.add.rectangle(0, 0, 80, 32, this.colors.inkBlack, 0.8);
    btnBg.setStrokeStyle(1, this.colors.goldAccent, 0.5);
    btnBg.setInteractive({ useHandCursor: true });

    const btnText = this.add.text(0, 0, '跳过', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#8b949e',
    }).setOrigin(0.5);

    this.skipButton.add([btnBg, btnText]);

    btnBg.on('pointerover', () => {
      btnBg.setFillStyle(this.colors.goldAccent);
      btnText.setColor('#0d1117');
    });

    btnBg.on('pointerout', () => {
      btnBg.setFillStyle(this.colors.inkBlack, 0.8);
      btnText.setColor('#8b949e');
    });

    btnBg.on('pointerup', () => this.startGame());
  }

  private handleClick(): void {
    if (this.canContinue) {
      this.startGame();
    }
  }

  private showAllLines(): void {
    const { width, height } = this.cameras.main;

    // 计算文字位置 - 居中显示
    const totalLines = this.textLines.length;
    const lineHeight = uiConfig.fontLG + 16;
    const startY = height * 0.5 - (totalLines * lineHeight) / 2;

    // 同时创建所有文字，立即显示（1秒内全部淡入完成）
    this.textLines.forEach((line, index) => {
      const y = startY + index * lineHeight;
      const isEmphasis = index === this.textLines.length - 1;

      const text = this.add.text(width / 2, y, line, {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: `${isEmphasis ? uiConfig.fontXL : uiConfig.fontLG}px`,
        color: isEmphasis ? '#d4a853' : '#f0e6d3',
        fontStyle: isEmphasis ? 'bold' : 'normal',
      }).setOrigin(0.5).setAlpha(0);

      this.displayedTexts.push(text);

      // 所有文字同时开始淡入，1秒内完成
      this.tweens.add({
        targets: text,
        alpha: 1,
        duration: 1000,
        ease: 'Power2.easeOut',
      });
    });

    // 1秒后显示继续提示
    this.time.delayedCall(1000, () => {
      this.canContinue = true;
      this.showContinueHint();
    });
  }

  private showContinueHint(): void {
    const { width, height } = this.cameras.main;

    const hint = this.add.text(width / 2, height * 0.88, '— 点击继续 —', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: '#6e7681',
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: hint,
      alpha: 1,
      duration: 300,
    });

    // 闪烁提示
    this.tweens.add({
      targets: hint,
      alpha: 0.5,
      duration: 800,
      yoyo: true,
      repeat: -1,
      delay: 300,
    });
  }

  private startGame(): void {
    // 淡出所有文字
    const { width, height } = this.cameras.main;

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0);

    this.tweens.add({
      targets: overlay,
      alpha: 1,
      duration: 800,
      onComplete: () => {
        this.scene.start('MapScene', { mode: 'single', round: 1 });
      },
    });
  }
}
