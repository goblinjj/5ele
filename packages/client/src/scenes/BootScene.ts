import Phaser from 'phaser';
import { uiConfig } from '../config/uiConfig.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig.js';
import { SpawnSystem } from '../systems/world/SpawnSystem.js';
import { HERO_ATLAS } from '../systems/avatar/Avatar.js';

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
    uiConfig.init(GAME_WIDTH, GAME_HEIGHT);
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
    this.load.atlas(HERO_ATLAS, 'assets/hero/atlas.png', 'assets/hero/atlas.json');
    SpawnSystem.preloadAtlases(this);
  }

  create(): void {
    // 等内嵌字体就绪再进菜单：Phaser 的文字是一次性栅格化的，字体晚到会停留在系统字体上
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      const splash = document.getElementById('splash');
      if (splash) {
        splash.classList.add('done');
        window.setTimeout(() => splash.remove(), 600);
      }
      this.scene.start('MenuScene');
    };
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.load) {
      fonts.load('700 32px "Noto Serif SC"', '无极五行').then(start, start);
      // 字体下载失败或太慢也不能卡住游戏
      window.setTimeout(start, 3000);
    } else {
      start();
    }
  }
}
