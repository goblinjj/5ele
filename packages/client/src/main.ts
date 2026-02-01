/// <reference types="vite/client" />
import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig.js';

// 创建游戏实例
const game = new Phaser.Game(gameConfig);

// 检测是否已经以 PWA 方式运行（全屏模式）
function isRunningAsPWA(): boolean {
  return window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
}

// 检测是否为移动设备
function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 0 && window.matchMedia('(pointer: coarse)').matches);
}

// 显示添加到主屏幕的提示
function showInstallPrompt(): void {
  // 如果已经是 PWA 模式，不显示提示
  if (isRunningAsPWA()) return;

  // 如果不是移动设备，不显示提示
  if (!isMobileDevice()) return;

  // 检查是否已经显示过提示（本次会话）
  if (sessionStorage.getItem('installPromptShown')) return;
  sessionStorage.setItem('installPromptShown', 'true');

  // 延迟显示，让游戏先加载
  setTimeout(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/.test(navigator.userAgent);

    let message = '';
    if (isIOS) {
      message = '点击底部分享按钮 → "添加到主屏幕" 获得全屏体验';
    } else if (isAndroid) {
      message = '点击菜单 → "添加到主屏幕" 获得全屏体验';
    } else {
      return; // 其他设备不显示
    }

    // 创建提示元素
    const prompt = document.createElement('div');
    prompt.id = 'install-prompt';
    prompt.innerHTML = `
      <div style="
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(28, 33, 40, 0.95);
        color: #f0e6d3;
        padding: 12px 20px;
        border-radius: 8px;
        border: 1px solid #d4a853;
        font-family: 'Noto Sans SC', sans-serif;
        font-size: 13px;
        z-index: 10000;
        max-width: 90%;
        text-align: center;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      ">
        <div style="margin-bottom: 8px;">📱 ${message}</div>
        <button id="dismiss-prompt" style="
          background: #d4a853;
          color: #0d1117;
          border: none;
          padding: 6px 16px;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
        ">知道了</button>
      </div>
    `;
    document.body.appendChild(prompt);

    // 点击关闭
    document.getElementById('dismiss-prompt')?.addEventListener('click', () => {
      prompt.remove();
    });

    // 10秒后自动关闭
    setTimeout(() => {
      prompt.remove();
    }, 10000);
  }, 3000);
}

// 初始化
showInstallPrompt();

// 开发模式下暴露 game 实例
if (import.meta.env.DEV) {
  (window as any).game = game;
}
