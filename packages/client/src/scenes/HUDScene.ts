import Phaser from 'phaser';
import { VirtualJoystick } from '../systems/input/VirtualJoystick.js';
import { inputManager } from '../systems/input/InputManager.js';
import { eventBus, GameEvent } from '../core/EventBus.js';
import { uiConfig, LAYOUT } from '../config/uiConfig.js';
import {
  AttributeSkillId, getAllAttributeSkills, Wuxing, WUXING_COLORS, WUXING_NAMES,
  getAllEquipmentSkills, getWuxingPassiveStatuses, STATUS_DEFINITIONS,
} from '@xiyou/shared';
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
  private killCountText!: Phaser.GameObjects.Text;
  private buffArea!: Phaser.GameObjects.Container;
  /** 属性/技能/状态容器（装备变化时整体重建） */
  private infoArea!: Phaser.GameObjects.Container;
  private panelY: number = 0;
  /** 赋能按钮：记录背景图形和标签，供刷新用 */
  private wuxingBtnBg!: Phaser.GameObjects.Graphics;
  private wuxingBtnLabel!: Phaser.GameObjects.Text;
  private wuxingBtnSub!: Phaser.GameObjects.Text;
  /** 当前五行选择器所有 scene 级别对象（scene 直属，非 Container 子节点） */
  private wuxingPickerObjects: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super({ key: 'HUDScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;
    const panelH = height * LAYOUT.PANEL_RATIO;
    const panelY = height * LAYOUT.VIEWPORT_RATIO;
    this.panelY = panelY;

    // 操控面板背景
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x0d1117, 0.92);
    panelBg.fillRect(0, panelY, width, panelH);
    panelBg.lineStyle(1, 0xd4a853, 0.3);
    panelBg.lineBetween(0, panelY, width, panelY);

    // 击杀进度（视口区域顶部居中）
    this.killCountText = this.add.text(width / 2, 18, '击杀 0/10', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#d4a853',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(50);

    // ── 左上：HP 条 + 属性/技能/状态 ──
    this.createPlayerHpBar(width, panelY);

    // 属性/技能/状态展示区（HP条正下方）
    this.infoArea = this.add.container(0, panelY + 36).setDepth(51);
    this.refreshInfoArea();

    // Buff 展示区（技能/状态条下方）
    this.buffArea = this.add.container(0, panelY + 90).setDepth(51);

    // ── 右上：灵囊 + 赋能按钮 ──
    this.createInventoryButton(width, panelY);
    this.createWuxingButton(width, panelY);

    // ── 中央：虚拟摇杆 ──
    const joystickX = width * 0.5;
    const joystickY = panelY + panelH * 0.62;
    this.joystick = new VirtualJoystick(this, joystickX, joystickY, Math.min(width * 0.12, 80));

    // ── 右侧：主动技能按钮 ──
    const playerState = gameState.getPlayerState();
    const allSkills = getAllAttributeSkills(playerState.equipment);
    const activeSkills = allSkills.filter(id => AOE_SKILL_IDS.has(id)).slice(0, 2);

    if (activeSkills.length > 0) {
      this.createSkillButtons(width, panelY, panelH, activeSkills);
    }

    // ── 事件监听 ──
    eventBus.on(GameEvent.PLAYER_HP_CHANGE, (hp: unknown, maxHp: unknown) => {
      this.playerHp = hp as number;
      this.playerMaxHp = maxHp as number;
      this.updateHpBar();
    });

    eventBus.on(GameEvent.SKILL_CD_UPDATE, (timers: unknown, maxTimers: unknown) => {
      this.updateSkillCds(timers as number[], maxTimers as number[]);
    });

    eventBus.on(GameEvent.KILL_COUNT_UPDATE, (count: unknown, target: unknown) => {
      this.killCountText?.setText(`击杀 ${count}/${target}`);
    });

    eventBus.on(GameEvent.BUFF_UPDATE, (buffs: unknown) => {
      this.renderBuffs(buffs as { label: string; color: number }[]);
    });

    eventBus.on(GameEvent.WUXING_CHOSEN, (wuxing: unknown) => {
      this.refreshWuxingButton(wuxing as Wuxing | undefined);
    });

    eventBus.on(GameEvent.STATS_CHANGED, () => {
      this.refreshInfoArea();
    });
  }

  private createPlayerHpBar(width: number, panelY: number): void {
    // HP 条宽度：左侧 60%，右侧留给赋能+灵囊按钮
    const barW = width * 0.50;
    const barH = 14;
    const barX = width * 0.05;
    const barY = panelY + 14;

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

    this.add.text(barX, barY - 12, '残魂', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontXS}px`,
      color: '#d4a853',
    });
  }

  private updateHpBar(): void {
    if (!this.playerHpBar) return;
    const { width, height } = this.cameras.main;
    const panelY = height * LAYOUT.VIEWPORT_RATIO;
    const barW = width * 0.50;
    const barH = 14;
    const barX = width * 0.05;
    const barY = panelY + 14;

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
    panelH: number,
    activeSkills: AttributeSkillId[]
  ): void {
    const btnSize = Math.min(width * 0.16, 90);
    // 技能按钮放在右侧，摇杆右边
    const btnY = panelY + panelH * 0.62;
    const rightMargin = width * 0.05;
    const gap = btnSize + width * 0.03;
    // 从右向左排列
    const startX = width - rightMargin - btnSize / 2;

    activeSkills.forEach((skillId, i) => {
      const meta = AOE_SKILL_META[skillId] ?? { label: '技能', color: 0x8b949e };
      const btnX = startX - i * gap;
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

      const idx = i;

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
        const btnSize = Math.min(this.cameras.main.width * 0.16, 90);
        overlay.fillStyle(0x000000, 0.6 * pct);
        overlay.fillCircle(0, 0, btnSize / 2);
        cdText.setText(`${(t / 1000).toFixed(1)}s`).setAlpha(1);
      } else {
        cdText.setText('').setAlpha(0);
      }
    });
  }

  /** 灵囊按钮：右上角 */
  private createInventoryButton(width: number, panelY: number): void {
    const btnSize = 46;
    const rightMargin = 12;
    const btnX = width - rightMargin - btnSize / 2;
    const btnY = panelY + 14 + btnSize / 2; // 顶部对齐 HP 条

    const container = this.add.container(btnX, btnY).setDepth(52);
    const bg = this.add.graphics();
    const drawBg = (active: boolean) => {
      bg.clear();
      bg.fillStyle(0x1c2128, active ? 0.5 : 0.9);
      bg.fillRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 8);
      bg.lineStyle(1.5, 0xd4a853, active ? 1 : 0.6);
      bg.strokeRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 8);
    };
    drawBg(false);
    const icon = this.add.text(0, -4, '灵', {
      fontFamily: '"Noto Serif SC", serif', fontSize: '16px', color: '#d4a853',
    }).setOrigin(0.5);
    const sub = this.add.text(0, 12, '囊', {
      fontFamily: '"Noto Serif SC", serif', fontSize: '10px', color: '#8b949e',
    }).setOrigin(0.5);
    container.add([bg, icon, sub]);
    container.setSize(btnSize, btnSize).setInteractive();
    container.on('pointerdown', () => drawBg(true));
    container.on('pointerout', () => drawBg(false));
    container.on('pointerup', () => {
      drawBg(false);
      this.openInventory();
    });
  }

  /** 赋能按钮：灵囊左侧 */
  private createWuxingButton(width: number, panelY: number): void {
    const btnSize = 46;
    const rightMargin = 12;
    const gap = 8;
    const btnX = width - rightMargin - btnSize / 2 - btnSize - gap;
    const btnY = panelY + 14 + btnSize / 2;

    const container = this.add.container(btnX, btnY).setDepth(52);
    this.wuxingBtnBg = this.add.graphics();

    const drawWuxingBg = (active: boolean, wuxing?: Wuxing) => {
      const color = wuxing ? WUXING_COLORS[wuxing] : 0x8b949e;
      this.wuxingBtnBg.clear();
      this.wuxingBtnBg.fillStyle(0x1c2128, active ? 0.5 : 0.9);
      this.wuxingBtnBg.fillRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 8);
      this.wuxingBtnBg.lineStyle(1.5, color, active ? 1 : 0.6);
      this.wuxingBtnBg.strokeRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 8);
    };

    const initWuxing = gameState.getChosenWuxing();
    drawWuxingBg(false, initWuxing);

    const iconText = initWuxing ? WUXING_NAMES[initWuxing] : '无';
    const iconColor = initWuxing ? ('#' + WUXING_COLORS[initWuxing].toString(16).padStart(6, '0')) : '#484f58';
    this.wuxingBtnLabel = this.add.text(0, -4, iconText, {
      fontFamily: '"Noto Serif SC", serif', fontSize: '16px', color: iconColor,
    }).setOrigin(0.5);
    this.wuxingBtnSub = this.add.text(0, 12, '赋能', {
      fontFamily: '"Noto Serif SC", serif', fontSize: '10px', color: '#8b949e',
    }).setOrigin(0.5);

    container.add([this.wuxingBtnBg, this.wuxingBtnLabel, this.wuxingBtnSub]);
    container.setSize(btnSize, btnSize).setInteractive();
    container.on('pointerdown', () => drawWuxingBg(true, gameState.getChosenWuxing()));
    container.on('pointerout', () => drawWuxingBg(false, gameState.getChosenWuxing()));
    container.on('pointerup', () => {
      drawWuxingBg(false, gameState.getChosenWuxing());
      // 向下展开选择器（按钮在顶部，往下展开）
      this.toggleWuxingPicker(btnX, btnY + btnSize / 2 + 6);
    });
  }

  /** 刷新赋能按钮显示（五行所属变化时） */
  private refreshWuxingButton(wuxing: Wuxing | undefined): void {
    if (!this.wuxingBtnBg || !this.wuxingBtnLabel) return;
    const btnSize = 46;
    const color = wuxing ? WUXING_COLORS[wuxing] : 0x8b949e;
    this.wuxingBtnBg.clear();
    this.wuxingBtnBg.fillStyle(0x1c2128, 0.9);
    this.wuxingBtnBg.fillRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 8);
    this.wuxingBtnBg.lineStyle(1.5, color, 0.6);
    this.wuxingBtnBg.strokeRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 8);

    const iconText = wuxing ? WUXING_NAMES[wuxing] : '无';
    const iconColor = wuxing ? ('#' + WUXING_COLORS[wuxing].toString(16).padStart(6, '0')) : '#484f58';
    this.wuxingBtnLabel.setText(iconText).setColor(iconColor);
  }

  /** 打开/关闭五行选择器浮层（向下展开） */
  private toggleWuxingPicker(anchorX: number, anchorY: number): void {
    if (this.wuxingPickerObjects.length > 0) {
      this.closeWuxingPicker();
      return;
    }

    const available = gameState.getAvailableWuxing();
    if (available.length === 0) {
      const tip = this.add.text(anchorX, anchorY + 10, '装备有五行属性的灵器', {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '12px',
        color: '#8b949e',
        backgroundColor: '#1c2128',
        padding: { x: 8, y: 4 },
      }).setOrigin(0.5).setDepth(200);
      this.wuxingPickerObjects.push(tip);
      this.time.delayedCall(1500, () => {
        const idx = this.wuxingPickerObjects.indexOf(tip);
        if (idx !== -1) this.wuxingPickerObjects.splice(idx, 1);
        tip.destroy();
      });
      return;
    }

    const currentWuxing = gameState.getChosenWuxing();
    const options: Array<{ wuxing: Wuxing | null; label: string; color: number }> = available.map(wx => ({
      wuxing: wx,
      label: WUXING_NAMES[wx],
      color: WUXING_COLORS[wx],
    }));
    if (currentWuxing) {
      options.push({ wuxing: null, label: '清除', color: 0x484f58 });
    }

    const pillW = 52;
    const pillH = 52;
    const gap = 8;
    const totalW = options.length * pillW + (options.length - 1) * gap;
    const startX = anchorX - totalW / 2 + pillW / 2;
    // 向下展开：cy 是 pill 行中心，在 anchorY 下方
    const cy = anchorY + pillH / 2 + 4;

    // 背景遮罩（tap 关闭）
    const overlay = this.add.rectangle(
      this.cameras.main.width / 2,
      this.cameras.main.height / 2,
      this.cameras.main.width,
      this.cameras.main.height,
      0x000000, 0.01
    ).setDepth(199).setInteractive();
    overlay.on('pointerup', () => this.closeWuxingPicker());
    this.wuxingPickerObjects.push(overlay);

    options.forEach((opt, i) => {
      const ox = startX + i * (pillW + gap);
      const isSelected = opt.wuxing !== null && opt.wuxing === currentWuxing;

      const bg = this.add.graphics().setDepth(201);
      bg.fillStyle(0x1c2128, 0.95);
      bg.fillRoundedRect(ox - pillW / 2, cy - pillH / 2, pillW, pillH, 10);
      bg.lineStyle(2, opt.color, isSelected ? 1 : 0.5);
      bg.strokeRoundedRect(ox - pillW / 2, cy - pillH / 2, pillW, pillH, 10);
      this.wuxingPickerObjects.push(bg);

      const lbl = this.add.text(ox, cy, opt.label, {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: '18px',
        color: '#' + opt.color.toString(16).padStart(6, '0'),
      }).setOrigin(0.5).setDepth(202);
      this.wuxingPickerObjects.push(lbl);

      const hit = this.add.rectangle(ox, cy, pillW, pillH, 0xffffff, 0)
        .setDepth(203).setInteractive();
      hit.on('pointerup', () => {
        this.closeWuxingPicker();
        gameState.setChosenWuxing(opt.wuxing ?? undefined);
        eventBus.emit(GameEvent.WUXING_CHOSEN, opt.wuxing ?? undefined);
      });
      this.wuxingPickerObjects.push(hit);
    });
  }

  private closeWuxingPicker(): void {
    this.wuxingPickerObjects.forEach(o => (o as Phaser.GameObjects.GameObject).destroy());
    this.wuxingPickerObjects = [];
  }

  /** 重建属性/技能/状态显示（装备/五行变化时调用） */
  private refreshInfoArea(): void {
    this.infoArea.removeAll(true);
    const { width } = this.cameras.main;
    const eq = {
      weapon: gameState.getWeapon(),
      armor: gameState.getArmor(),
      treasures: gameState.getTreasures(),
    };

    // ── 第一行：ATK / DEF / SPD ──
    const atk = gameState.getTotalAttack();
    const def = gameState.getTotalDefense();
    const spd = gameState.getTotalSpeed();
    const statsStr = `攻 ${atk}  防 ${def}  速 ${spd}`;
    const statsLabel = this.add.text(width * 0.05, 0, statsStr, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#8b949e',
    }).setOrigin(0, 0.5);
    this.infoArea.add(statsLabel);

    // ── 第二行（+18px）：技能 pills ──
    const skills = getAllEquipmentSkills(eq);
    let x = width * 0.05;
    const row2Y = 18;
    const pillH = 16;
    if (skills.length === 0) {
      this.infoArea.add(this.add.text(x, row2Y, '技能: 暂无', {
        fontFamily: '"Noto Sans SC", sans-serif', fontSize: '10px', color: '#484f58',
      }).setOrigin(0, 0.5));
    } else {
      this.infoArea.add(this.add.text(x, row2Y, '技能', {
        fontFamily: '"Noto Sans SC", sans-serif', fontSize: '10px', color: '#484f58',
      }).setOrigin(0, 0.5));
      x += 26;
      for (const skill of skills) {
        const label = `${skill.name} Lv${skill.level}`;
        const pill = this.createInfoPill(x, row2Y, label, 0xd4a853, pillH);
        this.infoArea.add(pill);
        x += pill.width + 5;
        if (x > width * 0.82) break;
      }
    }

    // ── 第三行（+18px）：五行被动状态 pills ──
    const statuses = getWuxingPassiveStatuses(eq);
    x = width * 0.05;
    const row3Y = 36;
    if (statuses.length > 0) {
      this.infoArea.add(this.add.text(x, row3Y, '状态', {
        fontFamily: '"Noto Sans SC", sans-serif', fontSize: '10px', color: '#484f58',
      }).setOrigin(0, 0.5));
      x += 26;
      for (const st of statuses) {
        const def2 = STATUS_DEFINITIONS[st.type];
        if (!def2) continue;
        const label = `${def2.name} Lv${st.level}`;
        const color = parseInt(def2.color.replace('#', ''), 16);
        const pill = this.createInfoPill(x, row3Y, label, color, pillH);
        this.infoArea.add(pill);
        x += pill.width + 5;
        if (x > width * 0.82) break;
      }
    }
  }

  private createInfoPill(x: number, y: number, label: string, color: number, pillH: number): Phaser.GameObjects.Text {
    const colorHex = '#' + color.toString(16).padStart(6, '0');
    const txt = this.add.text(x, y, label, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '10px',
      color: colorHex,
      backgroundColor: colorHex + '22',
      padding: { x: 5, y: 2 },
    }).setOrigin(0, 0.5);
    void pillH;
    return txt;
  }

  private renderBuffs(buffs: { label: string; color: number }[]): void {
    this.buffArea.removeAll(true);
    if (!buffs || buffs.length === 0) return;

    const pillH = 18;
    const gap = 6;
    let x = this.cameras.main.width * 0.05;

    buffs.forEach(({ label, color }) => {
      const colorHex = '#' + color.toString(16).padStart(6, '0');
      const txt = this.add.text(0, 0, label, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '11px',
        color: colorHex,
      });
      const pillW = txt.width + 14;
      txt.destroy();

      const bg = this.add.graphics();
      bg.fillStyle(color, 0.18);
      bg.fillRoundedRect(x, -pillH / 2, pillW, pillH, 4);
      bg.lineStyle(1, color, 0.7);
      bg.strokeRoundedRect(x, -pillH / 2, pillW, pillH, 4);
      this.buffArea.add(bg);

      const label2 = this.add.text(x + pillW / 2, 0, label, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '11px',
        color: colorHex,
      }).setOrigin(0.5);
      this.buffArea.add(label2);

      x += pillW + gap;
    });
  }

  private openInventory(): void {
    if (this.scene.isActive('InventoryScene')) {
      this.scene.stop('InventoryScene');
    } else {
      this.scene.launch('InventoryScene');
      this.scene.bringToTop('InventoryScene');
    }
  }

  shutdown(): void {
    this.joystick?.destroy();
    this.closeWuxingPicker();
    this.wuxingPickerObjects = [];
  }
}
