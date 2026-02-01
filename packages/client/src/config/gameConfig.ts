import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene.js';
import { MenuScene } from '../scenes/MenuScene.js';
import { MapScene } from '../scenes/MapScene.js';
import { BattleScene } from '../scenes/BattleScene.js';
import { RewardScene } from '../scenes/RewardScene.js';
import { InventoryScene } from '../scenes/InventoryScene.js';

// 基准设计尺寸（横屏）- 用于 RESIZE 模式的最小尺寸
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 450;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
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
    mode: Phaser.Scale.RESIZE, // 使用 RESIZE 模式，让画布自动适应窗口大小
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: '100%',
    height: '100%',
    min: {
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
  },
  input: {
    activePointers: 3,
  },
};
