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

  private currentLineIndex: number = 0;
  private displayedTexts: Phaser.GameObjects.Text[] = [];
  private skipButton?: Phaser.GameObjects.Container;
  private isAnimating: boolean = false;

  constructor() {
    super({ key: 'PrologueScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    this.createBackground();
    this.createSkipButton();

    // 点击任意位置加速/跳过
    this.input.on('pointerdown', () => this.handleClick());

    // 开始逐行显示文字
    this.time.delayedCall(500, () => this.showNextLine());
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
    if (this.isAnimating) {
      // 如果正在动画中，跳过当前动画
      return;
    }

    if (this.currentLineIndex < this.textLines.length) {
      // 加速显示下一行
      this.showNextLine();
    } else {
      // 所有文字已显示，进入游戏
      this.startGame();
    }
  }

  private showNextLine(): void {
    if (this.currentLineIndex >= this.textLines.length) {
      // 所有行显示完毕，等待点击
      this.time.delayedCall(1500, () => {
        if (this.currentLineIndex >= this.textLines.length) {
          this.showContinueHint();
        }
      });
      return;
    }

    const { width, height } = this.cameras.main;
    const line = this.textLines[this.currentLineIndex];

    // 计算文字位置 - 居中显示
    const totalLines = this.textLines.length;
    const lineHeight = uiConfig.fontLG + 16;
    const startY = height * 0.5 - (totalLines * lineHeight) / 2;
    const y = startY + this.currentLineIndex * lineHeight;

    // 判断是否是强调行（最后一行"使命"）
    const isEmphasis = this.currentLineIndex === this.textLines.length - 1;

    const text = this.add.text(width / 2, y, line, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${isEmphasis ? uiConfig.fontXL : uiConfig.fontLG}px`,
      color: isEmphasis ? '#d4a853' : '#f0e6d3',
      fontStyle: isEmphasis ? 'bold' : 'normal',
    }).setOrigin(0.5).setAlpha(0);

    this.displayedTexts.push(text);
    this.isAnimating = true;

    // 淡入动画
    this.tweens.add({
      targets: text,
      alpha: 1,
      duration: 600,
      ease: 'Power2.easeOut',
      onComplete: () => {
        this.isAnimating = false;
        this.currentLineIndex++;

        // 自动显示下一行
        if (this.currentLineIndex < this.textLines.length) {
          this.time.delayedCall(line === '' ? 300 : 800, () => this.showNextLine());
        } else {
          // 显示完毕
          this.time.delayedCall(1200, () => this.showContinueHint());
        }
      },
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
      duration: 500,
    });

    // 闪烁提示
    this.tweens.add({
      targets: hint,
      alpha: 0.5,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      delay: 500,
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
