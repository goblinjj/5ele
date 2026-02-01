import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene.js';
import { MenuScene } from '../scenes/MenuScene.js';
import { MapScene } from '../scenes/MapScene.js';
import { BattleScene } from '../scenes/BattleScene.js';
import { RewardScene } from '../scenes/RewardScene.js';
import { InventoryScene } from '../scenes/InventoryScene.js';

// 基准设计尺寸（横屏，16:9）
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#0d1117',
  scene: [BootScene, MenuScene, MapScene, BattleScene, RewardScene, InventoryScene],
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // 横屏布局 (1280x720)，通过 CSS 和 JS 提示用户横屏
  },
  input: {
    activePointers: 3,
  },
};
