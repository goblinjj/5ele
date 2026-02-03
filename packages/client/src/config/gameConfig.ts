import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene.js';
import { MenuScene } from '../scenes/MenuScene.js';
import { PrologueScene } from '../scenes/PrologueScene.js';
import { MapScene } from '../scenes/MapScene.js';
import { BattleScene } from '../scenes/BattleScene.js';
import { RewardScene } from '../scenes/RewardScene.js';
import { InventoryScene } from '../scenes/InventoryScene.js';

// 设计基准尺寸（16:9 横屏）
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: '#0d1117',
  scene: [BootScene, MenuScene, PrologueScene, MapScene, BattleScene, RewardScene, InventoryScene],
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT, // 保持宽高比，自动适配
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 3,
  },
};
