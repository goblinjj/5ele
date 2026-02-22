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
    const panelY = height * LAYOUT.VIEWPORT_RATIO;
    this.panelY = panelY;

    // 操控面板背景
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x0d1117, 0.92);
    panelBg.fillRect(0, panelY, width, height * LAYOUT.PANEL_RATIO);
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
      this.add.text(width * 0.75, panelY + (height * LAYOUT.PANEL_RATIO) * 0.5, '装备技能\n解锁技能', {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontXS}px`,
        color: '#484f58',
        align: 'center',
      }).setOrigin(0.5);
    }

    // 灵囊按钮（面板右上区）
    this.createInventoryButton(width, panelY, height);

    // 赋能按钮（灵囊左侧）
    this.createWuxingButton(width, panelY, height);

    // 属性/技能/状态显示区（HP条正下方，装备变化后可刷新）
    this.infoArea = this.add.container(0, panelY + 38).setDepth(51);
    this.refreshInfoArea();

    // 动态 Buff 显示区（channelingBonus 等）
    this.buffArea = this.add.container(0, panelY + 78).setDepth(51);

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

    // 监听击杀进度
    eventBus.on(GameEvent.KILL_COUNT_UPDATE, (count: unknown, target: unknown) => {
      this.killCountText?.setText(`击杀 ${count}/${target}`);
    });

    // 监听 buff 列表
    eventBus.on(GameEvent.BUFF_UPDATE, (buffs: unknown) => {
      this.renderBuffs(buffs as { label: string; color: number }[]);
    });

    // 监听五行所属变更，刷新赋能按钮
    eventBus.on(GameEvent.WUXING_CHOSEN, (wuxing: unknown) => {
      this.refreshWuxingButton(wuxing as Wuxing | undefined);
    });

    // 监听装备变化，刷新属性/技能/状态展示
    eventBus.on(GameEvent.STATS_CHANGED, () => {
      this.refreshInfoArea();
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
        const btnSize = Math.min(this.cameras.main.width * 0.17, 100);
        overlay.fillStyle(0x000000, 0.6 * pct);
        overlay.fillCircle(0, 0, btnSize / 2);
        cdText.setText(`${(t / 1000).toFixed(1)}s`).setAlpha(1);
      } else {
        cdText.setText('').setAlpha(0);
      }
    });
  }

  private createInventoryButton(width: number, panelY: number, height: number): void {
    const panelH = height * LAYOUT.PANEL_RATIO;
    const btnSize = 50;
    const btnX = width - 32 - btnSize / 2;
    const btnY = panelY + panelH * 0.28;

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
      fontFamily: '"Noto Serif SC", serif', fontSize: '18px', color: '#d4a853',
    }).setOrigin(0.5);
    const sub = this.add.text(0, 14, '囊', {
      fontFamily: '"Noto Serif SC", serif', fontSize: '11px', color: '#8b949e',
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
    const statsLabel = this.add.text(width * 0.06, 0, statsStr, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#8b949e',
    }).setOrigin(0, 0.5);
    this.infoArea.add(statsLabel);

    // ── 第二行（+20px）：技能 pills ──
    const skills = getAllEquipmentSkills(eq);
    let x = width * 0.06;
    const row2Y = 20;
    const pillH = 16;
    if (skills.length === 0) {
      this.infoArea.add(this.add.text(x, row2Y, '技能: 暂无', { fontFamily: '"Noto Sans SC", sans-serif', fontSize: '10px', color: '#484f58' }).setOrigin(0, 0.5));
    } else {
      this.infoArea.add(this.add.text(x, row2Y, '技能', { fontFamily: '"Noto Sans SC", sans-serif', fontSize: '10px', color: '#484f58' }).setOrigin(0, 0.5));
      x += 26;
      for (const skill of skills) {
        const label = `${skill.name} Lv${skill.level}`;
        const pill = this.createInfoPill(x, row2Y, label, 0xd4a853, pillH);
        this.infoArea.add(pill);
        x += pill.width + 5;
        if (x > width * 0.88) break;
      }
    }

    // ── 第三行（+20px）：五行被动状态 pills ──
    const statuses = getWuxingPassiveStatuses(eq);
    x = width * 0.06;
    const row3Y = 40;
    if (statuses.length > 0) {
      this.infoArea.add(this.add.text(x, row3Y, '状态', { fontFamily: '"Noto Sans SC", sans-serif', fontSize: '10px', color: '#484f58' }).setOrigin(0, 0.5));
      x += 26;
      for (const st of statuses) {
        const def2 = STATUS_DEFINITIONS[st.type];
        if (!def2) continue;
        const label = `${def2.name} Lv${st.level}`;
        const color = parseInt(def2.color.replace('#', ''), 16);
        const pill = this.createInfoPill(x, row3Y, label, color, pillH);
        this.infoArea.add(pill);
        x += pill.width + 5;
        if (x > width * 0.88) break;
      }
    }
  }

  /** 创建一个 pill 标签 Text 对象（带背景需用 Graphics，这里简化为带色的 Text） */
  private createInfoPill(x: number, y: number, label: string, color: number, pillH: number): Phaser.GameObjects.Text {
    const colorHex = '#' + color.toString(16).padStart(6, '0');
    const txt = this.add.text(x, y, label, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '10px',
      color: colorHex,
      backgroundColor: colorHex + '22',
      padding: { x: 5, y: 2 },
    }).setOrigin(0, 0.5);
    void pillH; // pillH reserved for future border drawing
    return txt;
  }

  /** 赋能按钮（灵囊左侧，展示当前五行所属） */
  private createWuxingButton(width: number, panelY: number, height: number): void {
    const panelH = height * LAYOUT.PANEL_RATIO;
    const btnSize = 50;
    // 灵囊按钮在 width-32-25，赋能在其左边 btnSize+8
    const btnX = width - 32 - btnSize / 2 - btnSize - 10;
    const btnY = panelY + panelH * 0.28;

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
      fontFamily: '"Noto Serif SC", serif', fontSize: '18px', color: iconColor,
    }).setOrigin(0.5);
    this.wuxingBtnSub = this.add.text(0, 14, '赋能', {
      fontFamily: '"Noto Serif SC", serif', fontSize: '11px', color: '#8b949e',
    }).setOrigin(0.5);

    container.add([this.wuxingBtnBg, this.wuxingBtnLabel, this.wuxingBtnSub]);
    container.setSize(btnSize, btnSize).setInteractive();
    container.on('pointerdown', () => drawWuxingBg(true, gameState.getChosenWuxing()));
    container.on('pointerout', () => drawWuxingBg(false, gameState.getChosenWuxing()));
    container.on('pointerup', () => {
      drawWuxingBg(false, gameState.getChosenWuxing());
      this.toggleWuxingPicker(btnX, btnY - btnSize / 2 - 8);
    });
  }

  /** 刷新赋能按钮显示（五行所属变化时） */
  private refreshWuxingButton(wuxing: Wuxing | undefined): void {
    if (!this.wuxingBtnBg || !this.wuxingBtnLabel) return;
    const color = wuxing ? WUXING_COLORS[wuxing] : 0x8b949e;
    this.wuxingBtnBg.clear();
    this.wuxingBtnBg.fillStyle(0x1c2128, 0.9);
    this.wuxingBtnBg.fillRoundedRect(-25, -25, 50, 50, 8);
    this.wuxingBtnBg.lineStyle(1.5, color, 0.6);
    this.wuxingBtnBg.strokeRoundedRect(-25, -25, 50, 50, 8);

    const iconText = wuxing ? WUXING_NAMES[wuxing] : '无';
    const iconColor = wuxing ? ('#' + WUXING_COLORS[wuxing].toString(16).padStart(6, '0')) : '#484f58';
    this.wuxingBtnLabel.setText(iconText).setColor(iconColor);
  }

  /** 打开/关闭五行选择器浮层（全部使用 scene 直属对象，避免 Container 嵌套 input 问题） */
  private toggleWuxingPicker(anchorX: number, anchorY: number): void {
    if (this.wuxingPickerObjects.length > 0) {
      this.closeWuxingPicker();
      return;
    }

    const available = gameState.getAvailableWuxing();
    if (available.length === 0) {
      const tip = this.add.text(anchorX, anchorY - 10, '装备有五行属性的灵器', {
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
    const cy = anchorY - pillH / 2 - 4;

    // 背景遮罩（tap 关闭）— scene 直属
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

      // 背景图形（scene 直属，无 input）
      const bg = this.add.graphics().setDepth(201);
      bg.fillStyle(0x1c2128, 0.95);
      bg.fillRoundedRect(ox - pillW / 2, cy - pillH / 2, pillW, pillH, 10);
      bg.lineStyle(2, opt.color, isSelected ? 1 : 0.5);
      bg.strokeRoundedRect(ox - pillW / 2, cy - pillH / 2, pillW, pillH, 10);
      this.wuxingPickerObjects.push(bg);

      // 文字标签（scene 直属）
      const lbl = this.add.text(ox, cy, opt.label, {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: '18px',
        color: '#' + opt.color.toString(16).padStart(6, '0'),
      }).setOrigin(0.5).setDepth(202);
      this.wuxingPickerObjects.push(lbl);

      // 交互区（scene 直属透明矩形）
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

  private renderBuffs(buffs: { label: string; color: number }[]): void {
    this.buffArea.removeAll(true);
    if (!buffs || buffs.length === 0) return;

    const pillH = 18;
    const gap = 6;
    let x = this.cameras.main.width * 0.06;

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
