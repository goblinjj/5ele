/// <reference types="vite/client" />
import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig.js';

// 创建游戏实例
const game = new Phaser.Game(gameConfig);

// 开发模式下暴露 game 实例
if (import.meta.env.DEV) {
  (window as any).game = game;
}
