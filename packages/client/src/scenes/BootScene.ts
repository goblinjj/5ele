import Phaser from 'phaser';
import { uiConfig } from '../config/uiConfig.js';
import { SpawnSystem } from '../systems/world/SpawnSystem.js';

const PLAYER_ATLAS = 'player_spirit';

/**
 * 启动场景：在这里把全部图集一次加载完（约 5MB），
 * 进度显示在 index.html 的启动画面上，避免进入战斗时长时间黑屏。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    uiConfig.init(this.cameras.main.width, this.cameras.main.height);
    if (import.meta.env.DEV) {
      (window as any).uiConfig = uiConfig;
    }

    const fill = document.getElementById('splash-fill');
    const tip = document.getElementById('splash-tip');
    // 脚本下载完成算 10%，其余 90% 给图集
    const setProgress = (v: number) => {
      const pct = Math.round(10 + v * 90);
      if (fill) fill.style.width = `${pct}%`;
      if (tip) tip.textContent = `唤醒本源… ${pct}%`;
    };
    setProgress(0);
    this.load.on('progress', setProgress);
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      if (tip) tip.textContent = `资源加载失败：${file.key}，请刷新重试`;
    });

    this.load.atlas(PLAYER_ATLAS, 'assets/player/灵体残骸/atlas.png', 'assets/player/灵体残骸/atlas.json');
    SpawnSystem.preloadAtlases(this);
  }

  create(): void {
    const splash = document.getElementById('splash');
    if (splash) {
      splash.classList.add('done');
      window.setTimeout(() => splash.remove(), 600);
    }
    this.scene.start('MenuScene');
  }
}
