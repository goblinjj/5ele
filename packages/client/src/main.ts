/// <reference types="vite/client" />
import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig.js';

// 创建游戏实例
const game = new Phaser.Game(gameConfig);

// 全屏请求函数
function requestFullscreen(): void {
  const elem = document.documentElement;

  if (elem.requestFullscreen) {
    elem.requestFullscreen().catch(() => {});
  } else if ((elem as any).webkitRequestFullscreen) {
    // Safari/iOS
    (elem as any).webkitRequestFullscreen();
  } else if ((elem as any).mozRequestFullScreen) {
    // Firefox
    (elem as any).mozRequestFullScreen();
  } else if ((elem as any).msRequestFullscreen) {
    // IE/Edge
    (elem as any).msRequestFullscreen();
  }
}

// 检测是否为移动设备
function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches);
}

// 首次触摸/点击时请求全屏（仅移动设备）
let fullscreenRequested = false;
function setupFullscreenOnInteraction(): void {
  if (!isMobileDevice()) return;

  const handleInteraction = (): void => {
    if (fullscreenRequested) return;
    fullscreenRequested = true;

    requestFullscreen();

    // 移除监听器
    document.removeEventListener('touchstart', handleInteraction);
    document.removeEventListener('click', handleInteraction);
  };

  document.addEventListener('touchstart', handleInteraction, { once: true });
  document.addEventListener('click', handleInteraction, { once: true });
}

// 初始化全屏支持
setupFullscreenOnInteraction();

// 开发模式下暴露 game 实例和全屏函数
if (import.meta.env.DEV) {
  (window as any).game = game;
  (window as any).requestFullscreen = requestFullscreen;
}
