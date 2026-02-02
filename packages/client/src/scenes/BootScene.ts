import Phaser from 'phaser';
import { uiConfig } from '../config/uiConfig.js';

/**
 * 启动场景 - 加载资源
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    // 显示加载进度
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 初始化全局 UI 配置
    uiConfig.init(width, height);

    // 开发模式下暴露 uiConfig，方便调试字体大小
    if (import.meta.env.DEV) {
      (window as any).uiConfig = uiConfig;
    }

    const progressBar = this.add.graphics();
    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

    const loadingText = this.add.text(width / 2, height / 2 - 50, '加载中...', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#ffffff',
    });
    loadingText.setOrigin(0.5, 0.5);

    const percentText = this.add.text(width / 2, height / 2, '0%', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#ffffff',
    });
    percentText.setOrigin(0.5, 0.5);

    // 监听加载进度
    this.load.on('progress', (value: number) => {
      percentText.setText(`${Math.round(value * 100)}%`);
      progressBar.clear();
      progressBar.fillStyle(0x22c55e, 1);
      progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
      percentText.destroy();
    });

    // TODO: 加载实际资源
    // 暂时模拟加载延迟
    for (let i = 0; i < 10; i++) {
      this.load.image(`placeholder_${i}`, 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');
    }
  }

  create(): void {
    // 跳转到菜单场景
    this.scene.start('MenuScene');
  }
}
