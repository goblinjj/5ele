import Phaser from 'phaser';
import { WUXING_COLORS } from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';

/**
 * 主菜单场景
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // 标题
    const title = this.add.text(width / 2, height * 0.25, '西游肉鸽', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '64px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    });
    title.setOrigin(0.5);

    // 副标题
    const subtitle = this.add.text(width / 2, height * 0.35, '五行策略 · 回合对战', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '24px',
      color: '#aaaaaa',
    });
    subtitle.setOrigin(0.5);

    // 五行装饰圆圈
    const wuxingList = Object.values(WUXING_COLORS);
    const circleRadius = 15;
    const spacing = 50;
    const startX = width / 2 - (wuxingList.length - 1) * spacing / 2;

    wuxingList.forEach((color, index) => {
      const circle = this.add.circle(
        startX + index * spacing,
        height * 0.45,
        circleRadius,
        color
      );
      circle.setStrokeStyle(2, 0xffffff, 0.5);

      // 添加脉冲动画
      this.tweens.add({
        targets: circle,
        scaleX: 1.2,
        scaleY: 1.2,
        alpha: 0.7,
        duration: 1000,
        delay: index * 200,
        yoyo: true,
        repeat: -1,
      });
    });

    // 单人模式按钮
    this.createButton(
      width / 2,
      height * 0.6,
      '单人模式',
      () => this.startSinglePlayer()
    );

    // 多人模式按钮
    this.createButton(
      width / 2,
      height * 0.72,
      '多人模式',
      () => this.startMultiPlayer()
    );

    // 版本号
    this.add.text(width - 10, height - 10, 'v0.1.0', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#666666',
    }).setOrigin(1, 1);
  }

  private createButton(x: number, y: number, text: string, onClick: () => void): void {
    const buttonWidth = 200;
    const buttonHeight = 50;

    // 按钮背景
    const bg = this.add.rectangle(x, y, buttonWidth, buttonHeight, 0x4a4a6a);
    bg.setStrokeStyle(2, 0x6a6a8a);
    bg.setInteractive({ useHandCursor: true });

    // 按钮文字
    const buttonText = this.add.text(x, y, text, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '20px',
      color: '#ffffff',
    });
    buttonText.setOrigin(0.5);

    // 交互效果
    bg.on('pointerover', () => {
      bg.setFillStyle(0x5a5a7a);
      buttonText.setColor('#ffff00');
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(0x4a4a6a);
      buttonText.setColor('#ffffff');
    });

    bg.on('pointerdown', () => {
      bg.setFillStyle(0x3a3a5a);
    });

    bg.on('pointerup', () => {
      bg.setFillStyle(0x5a5a7a);
      onClick();
    });
  }

  private startSinglePlayer(): void {
    console.log('开始单人模式');
    // 重置游戏状态
    gameState.reset();
    this.scene.start('MapScene', { mode: 'single', round: 1 });
  }

  private startMultiPlayer(): void {
    console.log('多人模式暂未实现');
    // TODO: 实现多人模式匹配
  }
}
