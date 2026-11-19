import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene.js';
import { MenuScene } from '../scenes/MenuScene.js';
import { PrologueScene } from '../scenes/PrologueScene.js';
import { MapScene } from '../scenes/MapScene.js';
import { BattleScene } from '../scenes/BattleScene.js';
import { RewardScene } from '../scenes/RewardScene.js';
import { InventoryScene } from '../scenes/InventoryScene.js';
import { HUDScene } from '../scenes/HUDScene.js';
import { WorldScene } from '../scenes/WorldScene.js';

// 设计基准尺寸（9:19.5 竖屏）—— 所有布局坐标都以它为准
export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1560;

/**
 * 渲染倍率：画布按设备的物理像素创建，而不是固定 720 宽再被浏览器拉伸放大。
 * 例如 390pt@3x 的手机，物理宽 1170 像素，倍率约 1.6；各场景的相机用同样的 zoom
 * 把 720×1560 的逻辑坐标映射到这块更大的画布上，所以布局代码不需要改动。
 */
function computeRenderScale(): number {
  if (typeof window === 'undefined') return 1;
  const dpr = window.devicePixelRatio || 1;
  // 横屏设备（桌面）按高度适配，竖屏按宽度适配
  const fit = Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT);
  const s = fit * dpr;
  return Math.max(1, Math.min(3, Math.round(s * 4) / 4));
}
export const RENDER_SCALE = computeRenderScale();

/**
 * 让场景相机以逻辑坐标（720×1560）工作。
 * UI 类场景以左上角为原点缩放；跟随型的世界相机保持中心缩放。
 */
export function applyRenderScale(scene: Phaser.Scene, centered: boolean = false): void {
  const cam = scene.cameras.main;
  cam.setZoom(RENDER_SCALE);
  if (!centered) cam.setOrigin(0, 0);
}

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: Math.round(GAME_WIDTH * RENDER_SCALE),
  height: Math.round(GAME_HEIGHT * RENDER_SCALE),
  parent: 'game-container',
  backgroundColor: '#0d1117',
  scene: [BootScene, MenuScene, PrologueScene, MapScene, BattleScene, RewardScene, InventoryScene, HUDScene, WorldScene],
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
