import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene.js';
import { MenuScene } from '../scenes/MenuScene.js';
import { MapScene } from '../scenes/MapScene.js';
import { BattleScene } from '../scenes/BattleScene.js';
import { RewardScene } from '../scenes/RewardScene.js';
import { InventoryScene } from '../scenes/InventoryScene.js';

// 基准设计尺寸（竖屏移动端优先）
export const GAME_WIDTH = 750;
export const GAME_HEIGHT = 1334;

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
    min: {
      width: 375,
      height: 667,
    },
    max: {
      width: 750,
      height: 1334,
    },
  },
  input: {
    activePointers: 3,  // 支持多点触控
  },
};
