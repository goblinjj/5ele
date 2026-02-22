import Phaser from 'phaser';
import { VirtualJoystick } from '../systems/input/VirtualJoystick.js';
import { inputManager } from '../systems/input/InputManager.js';
import { eventBus, GameEvent } from '../core/EventBus.js';
import { uiConfig, LAYOUT } from '../config/uiConfig.js';
import {
  AttributeSkillId, getAllAttributeSkills,
  Equipment, EquipmentType, Wuxing, WUXING_COLORS, WUXING_NAMES,
  INVENTORY_SIZE, MAX_TREASURES, Rarity,
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
  private inventoryOpen: boolean = false;
  private inventoryContainer?: Phaser.GameObjects.Container;
  private slotPopup?: Phaser.GameObjects.Container;

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
      // 无主动技能时显示提示
      this.add.text(width * 0.75, panelY + (height * LAYOUT.PANEL_RATIO) * 0.5, '装备技能\n解锁技能', {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontXS}px`,
        color: '#484f58',
        align: 'center',
      }).setOrigin(0.5);
    }

    // 灵囊按钮（面板右上区）
    this.createInventoryButton(width, panelY, height);

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
    container.on('pointerup', () => { drawBg(false); this.toggleInventory(); });
  }

  // ========== 游戏内背包 Overlay ==========

  private toggleInventory(): void {
    if (this.inventoryOpen) {
      this.inventoryContainer?.destroy();
      this.inventoryContainer = undefined;
      this.slotPopup?.destroy();
      this.slotPopup = undefined;
      this.inventoryOpen = false;
    } else {
      this.inventoryOpen = true;
      this.buildInventoryOverlay();
    }
  }

  private buildInventoryOverlay(): void {
    const { width, height } = this.cameras.main;
    const vpH = Math.floor(height * LAYOUT.VIEWPORT_RATIO);

    this.inventoryContainer = this.add.container(0, 0).setDepth(200);

    // 半透明背景，覆盖游戏视口
    const backdrop = this.add.graphics();
    backdrop.fillStyle(0x0d1117, 0.93);
    backdrop.fillRect(0, 0, width, vpH);
    backdrop.lineStyle(1, 0xd4a853, 0.3);
    backdrop.lineBetween(0, vpH, width, vpH);
    this.inventoryContainer.add(backdrop);

    // 标题栏
    const headerBg = this.add.graphics();
    headerBg.fillStyle(0x1c2128, 1);
    headerBg.fillRect(0, 0, width, 52);
    headerBg.lineStyle(1, 0xd4a853, 0.3);
    headerBg.lineBetween(0, 52, width, 52);
    this.inventoryContainer.add(headerBg);

    const titleTxt = this.add.text(width / 2, 26, '灵　囊', {
      fontFamily: '"Noto Serif SC", serif', fontSize: '20px', color: '#d4a853',
    }).setOrigin(0.5);
    this.inventoryContainer.add(titleTxt);

    // 关闭按钮
    const closeBtn = this.add.text(width - 22, 26, '✕', {
      fontFamily: 'Arial', fontSize: '20px', color: '#8b949e',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerup', () => this.toggleInventory());
    this.inventoryContainer.add(closeBtn);

    // 装备区域
    this.renderEquipSection(width, vpH);

    // 背包区域
    this.renderInventoryGrid(width, vpH);
  }

  private renderEquipSection(width: number, _vpH: number): void {
    const c = this.inventoryContainer!;
    const sY = 58;

    // 区标题
    const lbl = this.add.text(18, sY + 4, '已装备', {
      fontFamily: '"Noto Sans SC", sans-serif', fontSize: '12px', color: '#8b949e',
    });
    c.add(lbl);

    const weapon = gameState.getWeapon();
    const armor  = gameState.getArmor();
    const treasures = gameState.getTreasures();

    // 武器 & 铠甲：大格（75px）
    this.addEquipSlot(c, 52,  sY + 50, weapon,  'weapon',  0, 75, '武器');
    this.addEquipSlot(c, 145, sY + 50, armor,   'armor',   0, 75, '铠甲');

    // 分隔
    const divG = this.add.graphics();
    divG.lineStyle(1, 0x30363d, 0.8);
    divG.lineBetween(200, sY + 10, 200, sY + 110);
    c.add(divG);

    // 灵器：小格（56px），横排最多 6 个
    const txW = 56;
    const gap  = 10;
    const startX = 214;
    for (let i = 0; i < MAX_TREASURES; i++) {
      const tx = startX + i * (txW + gap);
      this.addEquipSlot(c, tx, sY + 50, treasures[i] ?? null, 'treasure', i, txW, i === 0 ? '灵器' : '');
    }
  }

  private addEquipSlot(
    c: Phaser.GameObjects.Container,
    cx: number, cy: number,
    eq: Equipment | null,
    slotType: 'weapon' | 'armor' | 'treasure',
    index: number,
    size: number,
    label: string,
  ): void {
    if (label) {
      const lbl = this.add.text(cx, cy - size / 2 - 14, label, {
        fontFamily: '"Noto Sans SC", sans-serif', fontSize: '11px', color: '#8b949e',
      }).setOrigin(0.5, 1);
      c.add(lbl);
    }
    const r = size / 2;
    const bgG = this.add.graphics();
    bgG.fillStyle(0x1c2128, 1);
    bgG.fillRoundedRect(cx - r, cy - r, size, size, 6);
    bgG.lineStyle(1.5, eq ? this.rarityColor(eq.rarity) : 0x30363d, eq ? 0.8 : 0.4);
    bgG.strokeRoundedRect(cx - r, cy - r, size, size, 6);
    c.add(bgG);

    if (eq) {
      const color = eq.wuxing !== undefined ? WUXING_COLORS[eq.wuxing] : 0x8b949e;
      const orb = this.add.circle(cx, cy - 6, r * 0.55, color, 0.9);
      orb.setStrokeStyle(1, 0xffffff, 0.4);
      c.add(orb);

      const wName = eq.wuxing !== undefined ? WUXING_NAMES[eq.wuxing] ?? '' : '';
      const orbTxt = this.add.text(cx, cy - 6, wName.charAt(0), {
        fontFamily: '"Noto Serif SC", serif', fontSize: `${Math.floor(size * 0.22)}px`, color: '#fff',
      }).setOrigin(0.5);
      c.add(orbTxt);

      const lvTxt = this.add.text(cx, cy + r * 0.55, `+${eq.upgradeLevel ?? 0}`, {
        fontFamily: 'monospace', fontSize: '10px', color: '#8b949e',
      }).setOrigin(0.5);
      c.add(lvTxt);
    } else {
      const emptyTxt = this.add.text(cx, cy, '空', {
        fontFamily: '"Noto Serif SC", serif', fontSize: '12px', color: '#30363d',
      }).setOrigin(0.5);
      c.add(emptyTxt);
    }

    // 触摸区域
    const hit = this.add.rectangle(cx, cy, size, size, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    c.add(hit);
    if (eq) {
      hit.on('pointerup', () =>
        this.showEquipPopup(cx, cy, eq, slotType, index)
      );
    }
  }

  private renderInventoryGrid(width: number, _vpH: number): void {
    const c = this.inventoryContainer!;
    const topY = 195;

    const inv = gameState.getInventory();
    const used = inv.filter(Boolean).length;
    const lbl = this.add.text(18, topY, `灵囊 (${used}/${INVENTORY_SIZE})`, {
      fontFamily: '"Noto Sans SC", sans-serif', fontSize: '12px', color: '#8b949e',
    });
    c.add(lbl);

    const slotSize = 92;
    const gap = 8;
    const cols = 5;
    const totalW = cols * slotSize + (cols - 1) * gap;
    const startX = (width - totalW) / 2 + slotSize / 2;

    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = startX + col * (slotSize + gap);
      const cy = topY + 30 + slotSize / 2 + row * (slotSize + gap);
      this.addInventorySlot(c, cx, cy, inv[i] ?? null, i, slotSize);
    }
  }

  private addInventorySlot(
    c: Phaser.GameObjects.Container,
    cx: number, cy: number,
    eq: Equipment | null,
    index: number,
    size: number,
  ): void {
    const r = size / 2;
    const bgG = this.add.graphics();
    bgG.fillStyle(0x1c2128, 0.8);
    bgG.fillRoundedRect(cx - r, cy - r, size, size, 6);
    bgG.lineStyle(1, eq ? this.rarityColor(eq.rarity) : 0x30363d, eq ? 0.7 : 0.3);
    bgG.strokeRoundedRect(cx - r, cy - r, size, size, 6);
    c.add(bgG);

    if (eq) {
      const color = eq.wuxing !== undefined ? WUXING_COLORS[eq.wuxing] : 0x8b949e;
      const orb = this.add.circle(cx, cy - 8, r * 0.45, color, 0.9);
      orb.setStrokeStyle(1, 0xffffff, 0.3);
      c.add(orb);

      const wName = eq.wuxing !== undefined ? WUXING_NAMES[eq.wuxing] ?? '' : '';
      c.add(this.add.text(cx, cy - 8, wName.charAt(0), {
        fontFamily: '"Noto Serif SC", serif', fontSize: '14px', color: '#fff',
      }).setOrigin(0.5));

      const typeIco = eq.type === EquipmentType.WEAPON ? '⚔' :
                      eq.type === EquipmentType.ARMOR  ? '盾' : '宝';
      c.add(this.add.text(cx, cy + r * 0.5, typeIco, {
        fontFamily: '"Noto Serif SC", serif', fontSize: '11px', color: '#8b949e',
      }).setOrigin(0.5));
    } else {
      c.add(this.add.text(cx, cy, `${index + 1}`, {
        fontFamily: 'monospace', fontSize: '14px', color: '#30363d',
      }).setOrigin(0.5));
    }

    const hit = this.add.rectangle(cx, cy, size, size, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    c.add(hit);
    if (eq) {
      hit.on('pointerup', () => this.showInventoryItemPopup(cx, cy, eq, index));
    }
  }

  private showEquipPopup(
    _cx: number, _cy: number,
    eq: Equipment,
    slotType: 'weapon' | 'armor' | 'treasure',
    index: number,
  ): void {
    this.slotPopup?.destroy();
    const { width } = this.cameras.main;
    const popW = 280, popH = 120;
    const px = width / 2, py = 500;

    const p = this.slotPopup = this.add.container(px, py).setDepth(210);
    this.inventoryContainer?.add(p);

    const bg = this.add.graphics();
    bg.fillStyle(0x1c2128, 0.98);
    bg.fillRoundedRect(-popW / 2, -popH / 2, popW, popH, 10);
    bg.lineStyle(1.5, 0xd4a853, 0.7);
    bg.strokeRoundedRect(-popW / 2, -popH / 2, popW, popH, 10);
    p.add(bg);

    p.add(this.add.text(0, -popH / 2 + 18, eq.name, {
      fontFamily: '"Noto Serif SC", serif', fontSize: '15px', color: '#f0e6d3',
    }).setOrigin(0.5));

    const unequipBtn = this.add.rectangle(0, 20, 120, 38, 0x30363d)
      .setStrokeStyle(1, 0xd4a853, 0.6).setInteractive({ useHandCursor: true });
    p.add(unequipBtn);
    p.add(this.add.text(0, 20, '卸下', {
      fontFamily: '"Noto Sans SC", sans-serif', fontSize: '14px', color: '#f0e6d3',
    }).setOrigin(0.5));

    unequipBtn.on('pointerup', () => {
      if (slotType === 'weapon') gameState.unequipWeapon();
      else if (slotType === 'armor') gameState.unequipArmor();
      else gameState.unequipTreasure(index);
      this.rebuildInventory();
    });
  }

  private showInventoryItemPopup(
    _cx: number, _cy: number,
    eq: Equipment, index: number,
  ): void {
    this.slotPopup?.destroy();
    const { width } = this.cameras.main;
    const popW = 300, popH = 130;
    const px = width / 2, py = 530;

    const p = this.slotPopup = this.add.container(px, py).setDepth(210);
    this.inventoryContainer?.add(p);

    const bg = this.add.graphics();
    bg.fillStyle(0x1c2128, 0.98);
    bg.fillRoundedRect(-popW / 2, -popH / 2, popW, popH, 10);
    bg.lineStyle(1.5, 0xd4a853, 0.7);
    bg.strokeRoundedRect(-popW / 2, -popH / 2, popW, popH, 10);
    p.add(bg);

    p.add(this.add.text(0, -popH / 2 + 18, eq.name, {
      fontFamily: '"Noto Serif SC", serif', fontSize: '15px', color: '#f0e6d3',
    }).setOrigin(0.5));

    const equipBtn = this.add.rectangle(-75, 25, 110, 38, 0x30363d)
      .setStrokeStyle(1, 0x3fb950, 0.7).setInteractive({ useHandCursor: true });
    p.add(equipBtn);
    p.add(this.add.text(-75, 25, '装备', {
      fontFamily: '"Noto Sans SC", sans-serif', fontSize: '14px', color: '#3fb950',
    }).setOrigin(0.5));

    const cancelBtn = this.add.rectangle(75, 25, 110, 38, 0x30363d)
      .setStrokeStyle(1, 0x484f58, 0.5).setInteractive({ useHandCursor: true });
    p.add(cancelBtn);
    p.add(this.add.text(75, 25, '取消', {
      fontFamily: '"Noto Sans SC", sans-serif', fontSize: '14px', color: '#8b949e',
    }).setOrigin(0.5));

    equipBtn.on('pointerup', () => {
      if (eq.type === EquipmentType.WEAPON) gameState.equipWeapon(index);
      else if (eq.type === EquipmentType.ARMOR) gameState.equipArmor(index);
      else gameState.equipTreasure(index);
      this.rebuildInventory();
    });
    cancelBtn.on('pointerup', () => { this.slotPopup?.destroy(); this.slotPopup = undefined; });
  }

  private rebuildInventory(): void {
    this.slotPopup?.destroy();
    this.slotPopup = undefined;
    this.inventoryContainer?.destroy();
    this.inventoryContainer = undefined;
    this.buildInventoryOverlay();
  }

  private rarityColor(rarity: Rarity): number {
    switch (rarity) {
      case Rarity.UNCOMMON:  return 0x3fb950;
      case Rarity.RARE:      return 0x58a6ff;
      case Rarity.EPIC:      return 0xa855f7;
      case Rarity.LEGENDARY: return 0xd4a853;
      default:               return 0x8b949e;
    }
  }

  shutdown(): void {
    this.joystick?.destroy();
  }
}
