import Phaser from 'phaser';
import { VirtualJoystick } from '../systems/input/VirtualJoystick.js';
import { inputManager } from '../systems/input/InputManager.js';
import { eventBus, GameEvent } from '../core/EventBus.js';
import { uiConfig, LAYOUT } from '../config/uiConfig.js';
import { AttributeSkillId, getAllAttributeSkills } from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';

/** 与 CombatSystem 保持一致 */
const AOE_SKILL_IDS = new Set([
  AttributeSkillId.LIEKONGZHAN,
  AttributeSkillId.HANCHAO,
  AttributeSkillId.JINGJI,
  AttributeSkillId.FENTIAN,
  AttributeSkillId.DILIE,
]);

const AOE_SKILL_META: Record<string, { label: string; color: number }> = {
  [AttributeSkillId.LIEKONGZHAN]: { label: '裂空斩', color: 0xd4a853 },
  [AttributeSkillId.HANCHAO]:     { label: '寒潮',   color: 0x58a6ff },
  [AttributeSkillId.JINGJI]:      { label: '荆棘',   color: 0x3fb950 },
  [AttributeSkillId.FENTIAN]:     { label: '焚天',   color: 0xf85149 },
  [AttributeSkillId.DILIE]:       { label: '地裂',   color: 0xa16946 },
};

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

    // 玩家HP条
    this.createPlayerHpBar(width, panelY);

    // 虚拟摇杆（左下）
    const joystickX = width * 0.22;
    const joystickY = panelY + (height * LAYOUT.PANEL_RATIO) * 0.55;
    this.joystick = new VirtualJoystick(this, joystickX, joystickY, Math.min(width * 0.12, 80));

    // 获取玩家装备中的主动技能（最多2个）
    const playerState = gameState.getPlayerState();
    const allSkills = getAllAttributeSkills(playerState.equipment);
    const activeSkills = allSkills.filter(id => AOE_SKILL_IDS.has(id)).slice(0, 2);

    // 技能按钮（右下，只显示装备获得的主动技能）
    if (activeSkills.length > 0) {
      this.createSkillButtons(width, panelY, height, activeSkills);
    } else {
      // 无主动技能时显示提示
      this.add.text(width * 0.75, panelY + (height * LAYOUT.PANEL_RATIO) * 0.5, '装备技能\n解锁技能', {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontXS}px`,
        color: '#484f58',
        align: 'center',
      }).setOrigin(0.5);
    }

    // 监听 HP 变更
    eventBus.on(GameEvent.PLAYER_HP_CHANGE, (hp: unknown, maxHp: unknown) => {
      this.playerHp = hp as number;
      this.playerMaxHp = maxHp as number;
      this.updateHpBar();
    });

    // 监听技能 CD
    eventBus.on(GameEvent.SKILL_CD_UPDATE, (timers: unknown, maxTimers: unknown) => {
      this.updateSkillCds(timers as number[], maxTimers as number[]);
    });
  }

  private createPlayerHpBar(width: number, panelY: number): void {
    const barW = width * 0.55;
    const barH = 14;
    const barX = width * 0.06;
    const barY = panelY + 18;

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

  private createSkillButtons(
    width: number,
    panelY: number,
    height: number,
    activeSkills: AttributeSkillId[]
  ): void {
    const btnSize = Math.min(width * 0.17, 100);
    const btnY = panelY + (height * LAYOUT.PANEL_RATIO) * 0.52;
    const gap = btnSize + width * 0.05;
    // 居右布局
    const totalW = activeSkills.length * btnSize + (activeSkills.length - 1) * width * 0.05;
    const startX = width - width * 0.06 - totalW / 2 + btnSize / 2;

    activeSkills.forEach((skillId, i) => {
      const meta = AOE_SKILL_META[skillId] ?? { label: '技能', color: 0x8b949e };
      const btnX = startX + i * gap;
      const container = this.add.container(btnX, btnY);

      const color = meta.color;
      const bg = this.add.graphics();
      bg.fillStyle(color, 0.2);
      bg.fillCircle(0, 0, btnSize / 2);
      bg.lineStyle(2, color, 0.7);
      bg.strokeCircle(0, 0, btnSize / 2);

      const txt = this.add.text(0, 0, meta.label, {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: `${uiConfig.fontXS}px`,
        color: '#ffffff',
        align: 'center',
      }).setOrigin(0.5);

      const cdOverlay = this.add.graphics().setDepth(102);
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

      const idx = i; // capture

      container.on('pointerdown', () => {
        bg.clear();
        bg.fillStyle(color, 0.55);
        bg.fillCircle(0, 0, btnSize / 2);
        bg.lineStyle(2, color, 1);
        bg.strokeCircle(0, 0, btnSize / 2);
        inputManager.pressSkill(idx);
      });

      container.on('pointerup', () => {
        bg.clear();
        bg.fillStyle(color, 0.2);
        bg.fillCircle(0, 0, btnSize / 2);
        bg.lineStyle(2, color, 0.7);
        bg.strokeCircle(0, 0, btnSize / 2);
        inputManager.releaseSkill(idx);
      });

      container.on('pointerout', () => inputManager.releaseSkill(idx));

      this.skillButtons.push(container);
    });
  }

  private updateSkillCds(timers: number[], maxTimers: number[]): void {
    timers.forEach((t, i) => {
      const overlay = this.cdOverlays[i];
      const cdText = this.cdTexts[i];
      if (!overlay || !cdText) return;
      overlay.clear();
      if (t > 0 && maxTimers[i] > 0) {
        const pct = t / maxTimers[i];
        const btnSize = Math.min(this.cameras.main.width * 0.17, 100);
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
