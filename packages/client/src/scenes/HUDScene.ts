import Phaser from 'phaser';
import { VirtualJoystick } from '../systems/input/VirtualJoystick.js';
import { inputManager } from '../systems/input/InputManager.js';
import { eventBus, GameEvent } from '../core/EventBus.js';
import { uiConfig, LAYOUT } from '../config/uiConfig.js';

export class HUDScene extends Phaser.Scene {
  private joystick!: VirtualJoystick;
  private skillButtons: Phaser.GameObjects.Container[] = [];
  private playerHpBar!: Phaser.GameObjects.Graphics;
  private playerHpText!: Phaser.GameObjects.Text;
  private playerMaxHp: number = 100;
  private playerHp: number = 100;
  private cdOverlays: Phaser.GameObjects.Graphics[] = [];
  private cdTexts: Phaser.GameObjects.Text[] = [];

  constructor() {
    super({ key: 'HUDScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;
    const panelY = height * LAYOUT.VIEWPORT_RATIO;

    // 操控面板背景
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x0d1117, 0.92);
    panelBg.fillRect(0, panelY, width, height * LAYOUT.PANEL_RATIO);
    panelBg.lineStyle(1, 0xd4a853, 0.3);
    panelBg.lineBetween(0, panelY, width, panelY);

    // 玩家HP条（面板顶部）
    this.createPlayerHpBar(width, panelY);

    // 虚拟摇杆（左下）
    const joystickX = width * 0.22;
    const joystickY = panelY + (height * LAYOUT.PANEL_RATIO) * 0.55;
    this.joystick = new VirtualJoystick(this, joystickX, joystickY, Math.min(width * 0.12, 80));

    // 技能按钮（右下）
    this.createSkillButtons(width, panelY, height);

    // 监听 HP 变更事件
    const hpHandler = (hp: unknown, maxHp: unknown) => {
      this.playerHp = hp as number;
      this.playerMaxHp = maxHp as number;
      this.updateHpBar();
    };
    eventBus.on(GameEvent.PLAYER_HP_CHANGE, hpHandler);

    // 监听技能CD更新
    const cdHandler = (timers: unknown, maxTimers: unknown) => {
      this.updateSkillCds(timers as number[], maxTimers as number[]);
    };
    eventBus.on(GameEvent.SKILL_CD_UPDATE, cdHandler);
  }

  private createPlayerHpBar(width: number, panelY: number): void {
    const barW = width * 0.55;
    const barH = 14;
    const barX = width * 0.06;
    const barY = panelY + 18;

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x1c2128, 1);
    bg.fillRoundedRect(barX - 2, barY - 2, barW + 4, barH + 4, 4);

    this.playerHpBar = this.add.graphics();
    this.updateHpBar();

    this.playerHpText = this.add.text(barX + barW / 2, barY + barH / 2, '', {
      fontFamily: 'monospace',
      fontSize: `${uiConfig.fontXS}px`,
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(10);

    // 标签
    this.add.text(barX, barY - 14, '残魂', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontXS}px`,
      color: '#d4a853',
    });
  }

  private updateHpBar(): void {
    if (!this.playerHpBar) return;
    const { width, height } = this.cameras.main;
    const panelY = height * LAYOUT.VIEWPORT_RATIO;
    const barW = width * 0.55;
    const barH = 14;
    const barX = width * 0.06;
    const barY = panelY + 18;

    const pct = Math.max(0, this.playerHp / this.playerMaxHp);
    const color = pct > 0.5 ? 0x3fb950 : pct > 0.25 ? 0xeab308 : 0xf85149;

    this.playerHpBar.clear();
    this.playerHpBar.fillStyle(color, 1);
    this.playerHpBar.fillRoundedRect(barX, barY, barW * pct, barH, 3);

    if (this.playerHpText) {
      this.playerHpText.setText(`${this.playerHp}/${this.playerMaxHp}`);
    }
  }

  private createSkillButtons(width: number, panelY: number, height: number): void {
    const btnSize = Math.min(width * 0.15, 90);
    const btnY = panelY + (height * LAYOUT.PANEL_RATIO) * 0.5;
    const labels = ['普攻', '技能\n①', '技能\n②'];
    const colors = [0x3fb950, 0x58a6ff, 0xa855f7];

    labels.forEach((label, i) => {
      const btnX = width * 0.62 + i * (btnSize + width * 0.04);
      const container = this.add.container(btnX, btnY);

      const bg = this.add.graphics();
      bg.fillStyle(colors[i], 0.25);
      bg.fillCircle(0, 0, btnSize / 2);
      bg.lineStyle(2, colors[i], 0.7);
      bg.strokeCircle(0, 0, btnSize / 2);

      const txt = this.add.text(0, 0, label, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontXS}px`,
        color: '#ffffff',
        align: 'center',
      }).setOrigin(0.5);

      const cdOverlay = this.add.graphics();
      cdOverlay.setDepth(102);

      const cdText = this.add.text(0, 0, '', {
        fontFamily: 'monospace',
        fontSize: `${uiConfig.fontXS}px`,
        color: '#ffffff',
      }).setOrigin(0.5).setDepth(103).setAlpha(0);

      container.add([bg, txt, cdOverlay, cdText]);
      container.setSize(btnSize, btnSize);
      container.setInteractive();

      this.cdOverlays.push(cdOverlay);
      this.cdTexts.push(cdText);

      container.on('pointerdown', () => {
        bg.clear();
        bg.fillStyle(colors[i], 0.6);
        bg.fillCircle(0, 0, btnSize / 2);
        bg.lineStyle(2, colors[i], 1);
        bg.strokeCircle(0, 0, btnSize / 2);
        inputManager.pressSkill(i);
      });

      container.on('pointerup', () => {
        bg.clear();
        bg.fillStyle(colors[i], 0.25);
        bg.fillCircle(0, 0, btnSize / 2);
        bg.lineStyle(2, colors[i], 0.7);
        bg.strokeCircle(0, 0, btnSize / 2);
        inputManager.releaseSkill(i);
      });

      container.on('pointerout', () => {
        inputManager.releaseSkill(i);
      });

      this.skillButtons.push(container);
    });
  }

  private updateSkillCds(timers: number[], maxTimers: number[]): void {
    timers.forEach((t, i) => {
      if (i === 0) return; // 普攻不显示CD
      const overlay = this.cdOverlays[i];
      const cdText = this.cdTexts[i];
      if (!overlay || !cdText) return;

      overlay.clear();
      if (t > 0 && maxTimers[i] > 0) {
        const pct = t / maxTimers[i];
        const btnSize = Math.min(this.cameras.main.width * 0.15, 90);
        overlay.fillStyle(0x000000, 0.6 * pct);
        overlay.fillCircle(0, 0, btnSize / 2);
        cdText.setText(`${(t / 1000).toFixed(1)}s`).setAlpha(1);
      } else {
        cdText.setText('').setAlpha(0);
      }
    });
  }

  shutdown(): void {
    this.joystick?.destroy();
  }
}
