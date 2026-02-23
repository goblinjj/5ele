import Phaser from 'phaser';
import {
  Equipment,
  EquipmentType,
  Wuxing,
  WUXING_COLORS,
  WUXING_NAMES,
  Rarity,
  INVENTORY_SIZE,
  MAX_TREASURES,
  getEquipmentSkillsDisplay,
} from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';
import { SynthesisSystem } from '../systems/SynthesisSystem.js';
import { uiConfig, LAYOUT } from '../config/uiConfig.js';
import { eventBus, GameEvent } from '../core/EventBus.js';

interface SlotInfo {
  type: 'inventory' | 'weapon' | 'armor' | 'treasure';
  index: number;
  equipment: Equipment | null;
}

/**
 * 灵囊管理场景
 *
 * 交互方式：
 *  - 单击格子     → 仅查看装备属性（只读弹窗）
 *  - 双击格子     → 直接穿戴/卸下
 *  - 拖动到同类装备格 → 穿戴（背包→装备栏）或卸下（装备栏→背包区）
 *  - 拖动到另一背包格上 → 弹出上下文菜单（重组/归元/碎片/取消）
 */
export class InventoryScene extends Phaser.Scene {
  private popup?: Phaser.GameObjects.Container;
  private topMessage?: Phaser.GameObjects.Container;
  private specialNotification?: Phaser.GameObjects.Container;
  private contextMenu?: Phaser.GameObjects.Container;
  private currentSlot?: SlotInfo;

  // 拖拽状态
  private isDragging: boolean = false;
  private dragStart = { x: 0, y: 0 };
  private dragSourceSlot?: SlotInfo;
  private dragContainer?: Phaser.GameObjects.Container;

  // 双击检测
  private lastClickTime: number = 0;
  private lastClickSlot?: SlotInfo;

  // 上下文菜单碎片开关
  private contextMenuUseFragments: boolean = false;

  // 槽位几何信息（用于拖拽释放时的碰撞检测）
  private slotGeometries: Array<{ x: number; y: number; size: number; slotInfo: SlotInfo }> = [];

  // 颜色主题
  private readonly colors = {
    bgDark: 0x0d1117,
    inkBlack: 0x1c2128,
    inkGrey: 0x30363d,
    paperWhite: 0xf0e6d3,
    goldAccent: 0xd4a853,
    redAccent: 0xc94a4a,
    greenAccent: 0x3fb950,
    blueAccent: 0x58a6ff,
  };

  constructor() {
    super({ key: 'InventoryScene' });
  }

  create(): void {
    const { width, height: fullH } = this.cameras.main;
    // 只覆盖战斗视口（上 60%），操控面板仍可操作
    const vpH = Math.floor(fullH * LAYOUT.VIEWPORT_RATIO);
    this.cameras.main.setViewport(0, 0, width, vpH);

    // 重置拖拽/双击状态
    this.slotGeometries = [];
    this.isDragging = false;
    this.dragSourceSlot = undefined;
    this.lastClickTime = 0;
    this.lastClickSlot = undefined;

    // 背景仅覆盖视口区域
    this.add.rectangle(width / 2, vpH / 2, width, vpH, this.colors.bgDark, 0.98);

    // 标题栏
    this.createHeader();

    // 上半部分：装备栏（武器、铠甲、灵器）
    this.createEquipmentSection();

    // 下半部分：背包栏
    this.createInventorySection();

    // 关闭按钮
    this.createCloseButton();

    // ESC关闭
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.popup) {
        this.closePopup();
      } else if (this.contextMenu) {
        this.closeContextMenu();
      } else {
        this.closeScene();
      }
    });

    // 场景级指针事件（处理拖拽移动和释放）
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      this.onGlobalPointerMove(pointer);
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      this.onGlobalPointerUp(pointer);
    });
  }

  private createHeader(): void {
    const { width, height } = this.cameras.main;
    const headerHeight = height * 0.08;

    // 标题背景
    const headerBg = this.add.graphics();
    headerBg.fillStyle(this.colors.inkBlack, 0.9);
    headerBg.fillRect(0, 0, width, headerHeight);
    headerBg.lineStyle(1, this.colors.goldAccent, 0.3);
    headerBg.lineBetween(0, headerHeight, width, headerHeight);

    // 标题
    this.add.text(width / 2, headerHeight / 2, '灵囊管理', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontXL}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 碎片数量（右侧）
    const fragments = gameState.getFragmentCount();
    this.add.text(width * 0.92, headerHeight / 2, `💎 碎片: ${fragments}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#a855f7',
    }).setOrigin(1, 0.5);

    // 操作提示（左侧）
    this.add.text(width * 0.08, headerHeight / 2, '双击穿戴 · 拖拽重组', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontXS ?? 10}px`,
      color: '#8b949e',
    }).setOrigin(0, 0.5);
  }

  private createEquipmentSection(): void {
    const { width, height } = this.cameras.main;
    const headerHeight = height * 0.08;
    const sectionY = headerHeight + height * 0.02;
    const sectionHeight = height * 0.36;

    // 装备区域背景
    const sectionBg = this.add.graphics();
    sectionBg.fillStyle(this.colors.inkBlack, 0.5);
    sectionBg.fillRoundedRect(width * 0.02, sectionY, width * 0.96, sectionHeight, 8);
    sectionBg.lineStyle(1, this.colors.inkGrey, 0.5);
    sectionBg.strokeRoundedRect(width * 0.02, sectionY, width * 0.96, sectionHeight, 8);

    // 槽位大小 - 更大以填充空间
    const slotSize = Math.max(70, Math.min(90, height * 0.14));

    // === 左侧：武器和铠甲 ===
    const leftStartX = width * 0.08;
    const equipY = sectionY + sectionHeight * 0.5;

    // 武器
    this.add.text(leftStartX, equipY - slotSize * 0.7, '武器', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#d4a853',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.createSlot(leftStartX, equipY, {
      type: 'weapon',
      index: 0,
      equipment: gameState.getWeapon(),
    }, slotSize);

    // 铠甲
    const armorX = leftStartX + slotSize * 1.4;
    this.add.text(armorX, equipY - slotSize * 0.7, '铠甲', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#d4a853',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.createSlot(armorX, equipY, {
      type: 'armor',
      index: 0,
      equipment: gameState.getArmor(),
    }, slotSize);

    // === 分隔线 ===
    const dividerX = width * 0.32;
    sectionBg.lineStyle(1, this.colors.inkGrey, 0.4);
    sectionBg.lineBetween(dividerX, sectionY + 15, dividerX, sectionY + sectionHeight - 15);

    // === 右侧：灵器 ===
    const treasureStartX = width * 0.35;
    const treasures = gameState.getTreasures();

    // 灵器标题
    this.add.text(treasureStartX, sectionY + 15, '灵器栏', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#d4a853',
      fontStyle: 'bold',
    });

    // 6个灵器槽位，一行显示
    const availableTreasureWidth = width * 0.62;
    const treasureSpacing = availableTreasureWidth / MAX_TREASURES;
    const treasureSlotSize = Math.min(treasureSpacing * 0.85, slotSize * 0.9);

    for (let i = 0; i < MAX_TREASURES; i++) {
      const x = treasureStartX + treasureSpacing * 0.5 + i * treasureSpacing;
      const y = equipY;

      this.createSlot(x, y, {
        type: 'treasure',
        index: i,
        equipment: treasures[i] || null,
      }, treasureSlotSize);
    }
  }

  private createInventorySection(): void {
    const { width, height } = this.cameras.main;
    const headerHeight = height * 0.08;
    const topSectionHeight = height * 0.36;
    const sectionY = headerHeight + topSectionHeight + height * 0.02;
    const sectionHeight = height - sectionY - 8;

    // 背包区域背景
    const sectionBg = this.add.graphics();
    sectionBg.fillStyle(this.colors.inkBlack, 0.5);
    sectionBg.fillRoundedRect(width * 0.02, sectionY, width * 0.96, sectionHeight, 8);
    sectionBg.lineStyle(1, this.colors.inkGrey, 0.5);
    sectionBg.strokeRoundedRect(width * 0.02, sectionY, width * 0.96, sectionHeight, 8);

    // 分区标题
    const usedSlots = INVENTORY_SIZE - gameState.getEmptySlotCount();
    this.add.text(width * 0.05, sectionY + 15, `灵囊 (${usedSlots}/${INVENTORY_SIZE})`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#d4a853',
      fontStyle: 'bold',
    });

    // 槽位大小 - 计算以填满宽度
    const availableWidth = width * 0.90;
    const cols = 10; // 固定10列
    const slotSpacing = availableWidth / cols;
    const slotSize = Math.min(slotSpacing * 0.85, sectionHeight * 0.65);

    const inventory = gameState.getInventory();
    const startX = width * 0.05 + slotSpacing * 0.5;
    const slotY = sectionY + sectionHeight * 0.55;

    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const x = startX + i * slotSpacing;

      this.createSlot(x, slotY, {
        type: 'inventory',
        index: i,
        equipment: inventory[i],
      }, slotSize);
    }
  }

  private createSlot(x: number, y: number, slotInfo: SlotInfo, slotSize: number = 55): void {
    const container = this.add.container(x, y);
    const equipment = slotInfo.equipment;
    const iconRadius = slotSize * 0.33;
    const fontSize = Math.max(9, slotSize * 0.2);

    // 槽位背景
    const bgColor = slotInfo.type === 'inventory' ? this.colors.inkGrey : this.colors.inkBlack;
    const bg = this.add.rectangle(0, 0, slotSize, slotSize, bgColor, 0.8);
    const borderColor = equipment ? this.getRarityBorderColor(equipment.rarity) : 0x484f58;
    bg.setStrokeStyle(2, borderColor, equipment ? 0.8 : 0.3);
    bg.setInteractive({ useHandCursor: true });
    container.add(bg);

    if (equipment) {
      const color = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0x8b949e;
      const icon = this.add.circle(0, -slotSize * 0.06, iconRadius, color);
      icon.setStrokeStyle(2, 0xffffff, 0.4);
      container.add(icon);

      const levelStr = equipment.wuxing !== undefined ? `${equipment.wuxingLevel ?? 1}` : '-';
      const levelText = this.add.text(0, -slotSize * 0.06, levelStr, {
        fontFamily: 'monospace',
        fontSize: `${fontSize}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      container.add(levelText);

      const typeIcon = this.getTypeIcon(equipment.type);
      const typeText = this.add.text(0, slotSize * 0.32, typeIcon, {
        fontSize: `${fontSize * 0.9}px`,
      }).setOrigin(0.5);
      container.add(typeText);

      if (equipment.upgradeLevel > 0) {
        const upgradeText = this.add.text(slotSize * 0.35, -slotSize * 0.35, `+${equipment.upgradeLevel}`, {
          fontFamily: 'monospace',
          fontSize: `${fontSize * 0.8}px`,
          color: '#3fb950',
          fontStyle: 'bold',
        }).setOrigin(0.5);
        container.add(upgradeText);
      }

      if (equipment.attributeSkills && equipment.attributeSkills.length > 0) {
        const skillMark = this.add.text(-slotSize * 0.35, -slotSize * 0.35, '✦', {
          fontSize: `${fontSize}px`,
          color: '#d4a853',
        }).setOrigin(0.5);
        container.add(skillMark);
      }
    }

    // 注册槽位几何信息（用于拖拽命中检测）
    this.slotGeometries.push({ x, y, size: slotSize, slotInfo });

    // 事件：仅记录 pointerdown（所有 click/drag 逻辑统一在 onGlobalPointerUp 处理）
    bg.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.onSlotPointerDown(pointer, slotInfo);
    });

    // hover 边框高亮
    bg.on('pointerover', () => bg.setStrokeStyle(2, this.colors.goldAccent, 1));
    bg.on('pointerout', () => bg.setStrokeStyle(2, borderColor, equipment ? 0.8 : 0.3));
  }

  // ---- 拖拽系统 ----

  private onSlotPointerDown(pointer: Phaser.Input.Pointer, slotInfo: SlotInfo): void {
    if (!slotInfo.equipment) return;
    // 关闭现有弹窗
    this.closeContextMenu();
    // 记录拖拽起点
    this.dragSourceSlot = slotInfo;
    this.dragStart = { x: pointer.x, y: pointer.y };
    this.isDragging = false;
  }

  private onGlobalPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragSourceSlot) return;

    const dx = pointer.x - this.dragStart.x;
    const dy = pointer.y - this.dragStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!this.isDragging && dist > 12) {
      this.isDragging = true;
      this.closePopup();
      this.closeContextMenu();
      this.createDragVisual(pointer);
    }

    if (this.isDragging && this.dragContainer) {
      this.dragContainer.setPosition(pointer.x, pointer.y);
    }
  }

  private onGlobalPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.dragSourceSlot) return;

    if (this.isDragging) {
      const dropSlot = this.findSlotAtPosition(pointer.x, pointer.y);
      this.endDrag(pointer, dropSlot);
    } else {
      // 单击 or 双击检测
      const now = Date.now();
      const src = this.dragSourceSlot;
      if (
        this.lastClickSlot &&
        this.lastClickSlot.type === src.type &&
        this.lastClickSlot.index === src.index &&
        now - this.lastClickTime < 500
      ) {
        // 双击 → 穿戴 / 卸下
        this.handleDoubleClick(src);
        this.lastClickTime = 0;
        this.lastClickSlot = undefined;
      } else {
        // 单击 → 查看只读弹窗
        if (src.equipment) this.showViewPopup(src);
        this.lastClickTime = now;
        this.lastClickSlot = src;
      }
    }

    this.dragSourceSlot = undefined;
    this.isDragging = false;
  }

  private createDragVisual(pointer: Phaser.Input.Pointer): void {
    if (!this.dragSourceSlot?.equipment) return;
    const equipment = this.dragSourceSlot.equipment;
    const color = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0x8b949e;

    this.dragContainer = this.add.container(pointer.x, pointer.y).setDepth(200);
    const icon = this.add.circle(0, 0, 22, color, 0.9);
    icon.setStrokeStyle(3, 0xffffff, 0.8);
    this.dragContainer.add(icon);

    const levelStr = equipment.wuxing !== undefined ? `${equipment.wuxingLevel ?? 1}` : '-';
    this.dragContainer.add(
      this.add.text(0, 0, levelStr, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5)
    );
    this.dragContainer.setAlpha(0.85);
  }

  private findSlotAtPosition(x: number, y: number): SlotInfo | undefined {
    for (const geo of this.slotGeometries) {
      const half = geo.size / 2;
      if (Math.abs(x - geo.x) <= half && Math.abs(y - geo.y) <= half) {
        return geo.slotInfo;
      }
    }
    return undefined;
  }

  private endDrag(pointer: Phaser.Input.Pointer, dropSlot: SlotInfo | undefined): void {
    if (this.dragContainer) {
      this.dragContainer.destroy();
      this.dragContainer = undefined;
    }

    const source = this.dragSourceSlot;
    if (!source?.equipment) return;

    // 放到自己身上 → 取消
    if (!dropSlot || (dropSlot.type === source.type && dropSlot.index === source.index)) return;

    // 背包 → 装备栏（穿戴）
    if (
      source.type === 'inventory' &&
      (dropSlot.type === 'weapon' || dropSlot.type === 'armor' || dropSlot.type === 'treasure')
    ) {
      this.equipItem(source);
      return;
    }

    // 装备栏 → 背包区（卸下）
    if (
      (source.type === 'weapon' || source.type === 'armor' || source.type === 'treasure') &&
      dropSlot.type === 'inventory'
    ) {
      this.unequipItem(source);
      return;
    }

    // 背包格拖到另一背包格（有物品）→ 上下文菜单
    if (source.type === 'inventory' && dropSlot.type === 'inventory' && dropSlot.equipment) {
      this.showContextMenu(pointer.x, pointer.y, source, dropSlot);
      return;
    }

    // 其他情况 → 不操作
  }

  private handleDoubleClick(slotInfo: SlotInfo): void {
    this.closePopup();
    if (slotInfo.type === 'inventory' && slotInfo.equipment) {
      this.equipItem(slotInfo);
    } else if (slotInfo.type !== 'inventory' && slotInfo.equipment) {
      this.unequipItem(slotInfo);
    }
  }

  // ---- 上下文菜单（重组/归元/碎片/取消） ----

  private showContextMenu(x: number, y: number, sourceSlot: SlotInfo, targetSlot: SlotInfo): void {
    this.closeContextMenu();
    const { width, height } = this.cameras.main;
    this.contextMenuUseFragments = false;

    const menuW = 200;
    const menuH = 150;
    // 让菜单在指针上方，并保持在视口内
    const cx = Math.min(Math.max(x, menuW / 2 + 10), width - menuW / 2 - 10);
    const cy = Math.min(Math.max(y - menuH - 10, 10), height - menuH - 10);

    this.contextMenu = this.add.container(cx, cy).setDepth(150);

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(this.colors.inkBlack, 0.98);
    bg.fillRoundedRect(-menuW / 2, 0, menuW, menuH, 10);
    bg.lineStyle(2, this.colors.goldAccent, 0.8);
    bg.strokeRoundedRect(-menuW / 2, 0, menuW, menuH, 10);
    this.contextMenu.add(bg);

    const fragments = gameState.getFragmentCount();
    const btnW = 82;
    const btnH = 34;

    // 碎片开关（重组专用）
    const togBg = this.add.rectangle(0, 25, menuW - 20, btnH * 0.85, fragments > 0 ? this.colors.inkGrey : 0x1c1c1c);
    togBg.setStrokeStyle(1, this.colors.goldAccent, fragments > 0 ? 0.5 : 0.15);
    const togText = this.add.text(0, 25, fragments > 0 ? '不使用碎片' : '无碎片', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '12px',
      color: fragments > 0 ? '#d4a853' : '#555555',
    }).setOrigin(0.5);
    this.contextMenu.add([togBg, togText]);

    if (fragments > 0) {
      togBg.setInteractive({ useHandCursor: true });
      togBg.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation();
        this.contextMenuUseFragments = !this.contextMenuUseFragments;
        togBg.setFillStyle(this.contextMenuUseFragments ? this.colors.greenAccent : this.colors.inkGrey);
        togText.setText(this.contextMenuUseFragments ? '✓ 使用碎片' : '不使用碎片');
        togText.setColor(this.contextMenuUseFragments ? '#0d1117' : '#d4a853');
      });
    }

    // 重组按钮
    const synthBg = this.add.rectangle(-btnW * 0.62, 72, btnW, btnH, this.colors.inkGrey);
    synthBg.setStrokeStyle(1, this.colors.goldAccent, 0.5);
    synthBg.setInteractive({ useHandCursor: true });
    const synthTxt = this.add.text(-btnW * 0.62, 72, '重组', {
      fontFamily: '"Noto Sans SC", sans-serif', fontSize: '14px', color: '#f0e6d3',
    }).setOrigin(0.5);
    synthBg.on('pointerover', () => { synthBg.setFillStyle(this.colors.goldAccent); synthTxt.setColor('#0d1117'); });
    synthBg.on('pointerout', () => { synthBg.setFillStyle(this.colors.inkGrey); synthTxt.setColor('#f0e6d3'); });
    synthBg.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      this.closeContextMenu();
      this.performSynthesize(sourceSlot.index, targetSlot.index, this.contextMenuUseFragments);
    });
    this.contextMenu.add([synthBg, synthTxt]);

    // 归元按钮
    const devourBg = this.add.rectangle(btnW * 0.62, 72, btnW, btnH, this.colors.inkGrey);
    devourBg.setStrokeStyle(1, this.colors.goldAccent, 0.5);
    devourBg.setInteractive({ useHandCursor: true });
    const devourTxt = this.add.text(btnW * 0.62, 72, '归元', {
      fontFamily: '"Noto Sans SC", sans-serif', fontSize: '14px', color: '#f0e6d3',
    }).setOrigin(0.5);
    devourBg.on('pointerover', () => { devourBg.setFillStyle(this.colors.goldAccent); devourTxt.setColor('#0d1117'); });
    devourBg.on('pointerout', () => { devourBg.setFillStyle(this.colors.inkGrey); devourTxt.setColor('#f0e6d3'); });
    devourBg.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      this.closeContextMenu();
      this.performDevour(sourceSlot.index, targetSlot.index);
    });
    this.contextMenu.add([devourBg, devourTxt]);

    // 取消按钮
    const cancelBg = this.add.rectangle(0, 118, menuW - 20, btnH, this.colors.redAccent, 0.7);
    cancelBg.setStrokeStyle(1, 0xffffff, 0.3);
    cancelBg.setInteractive({ useHandCursor: true });
    const cancelTxt = this.add.text(0, 118, '取消', {
      fontFamily: '"Noto Sans SC", sans-serif', fontSize: '14px', color: '#ffffff',
    }).setOrigin(0.5);
    cancelBg.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      this.closeContextMenu();
    });
    this.contextMenu.add([cancelBg, cancelTxt]);
  }

  private closeContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.destroy();
      this.contextMenu = undefined;
    }
  }

  private getTypeIcon(type: EquipmentType): string {
    switch (type) {
      case EquipmentType.WEAPON: return '⚔️';
      case EquipmentType.ARMOR: return '🛡️';
      case EquipmentType.TREASURE: return '💎';
    }
  }

  // ---- 只读弹窗（单击查看） ----

  private showViewPopup(slotInfo: SlotInfo): void {
    this.closePopup();
    this.currentSlot = slotInfo;

    const { width, height } = this.cameras.main;
    const equipment = slotInfo.equipment!;

    this.popup = this.add.container(width / 2, height / 2);

    // 背景遮罩
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.6);
    overlay.setInteractive();
    overlay.on('pointerup', () => this.closePopup());
    this.popup.add(overlay);

    // 响应式尺寸
    const panelWidth = Math.max(500, Math.min(700, width * 0.58));
    const panelHeight = Math.max(320, Math.min(420, height * 0.60));
    const borderColor = this.getRarityBorderColor(equipment.rarity);
    const iconRadius = Math.max(50, Math.min(70, panelHeight * 0.16));

    const panel = this.add.graphics();
    panel.fillStyle(this.colors.inkBlack, 0.98);
    panel.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
    panel.lineStyle(3, borderColor, 0.9);
    panel.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
    this.popup.add(panel);

    // 左右布局：35% 图标，65% 文字
    const iconX = uiConfig.getIconCenterX(panelWidth);
    const textX = uiConfig.getTextStartX(panelWidth);
    const textWidth = uiConfig.getTextWidth(panelWidth);
    const color = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0x8b949e;

    // 左侧：装备图标
    const icon = this.add.circle(iconX, -panelHeight * 0.1, iconRadius, color);
    icon.setStrokeStyle(4, 0xffffff, 0.6);
    this.popup.add(icon);

    const levelStr = equipment.wuxing !== undefined ? `${equipment.wuxingLevel ?? 1}` : '-';
    this.popup.add(
      this.add.text(iconX, -panelHeight * 0.1, levelStr, {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: `${uiConfig.fontXL}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5)
    );

    // 类型图标
    this.popup.add(
      this.add.text(iconX, panelHeight * 0.07, this.getTypeIcon(equipment.type), {
        fontSize: `${uiConfig.fontXL}px`,
      }).setOrigin(0.5)
    );

    // 操作提示（图标下方）
    const actionHint = slotInfo.type === 'inventory' ? '双击可穿戴' : '双击可卸下';
    this.popup.add(
      this.add.text(iconX, panelHeight * 0.23, actionHint, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '11px',
        color: '#8b949e',
      }).setOrigin(0.5)
    );

    // 右侧：文字信息
    let yOffset = -panelHeight * 0.34;

    // 名称
    this.popup.add(
      this.add.text(textX, yOffset, equipment.name, {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: `${uiConfig.fontXL}px`,
        color: '#f0e6d3',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5)
    );
    yOffset += uiConfig.fontXL + 12;

    // 类型 + 稀有度
    this.popup.add(
      this.add.text(textX, yOffset, `${this.getEquipmentTypeName(equipment.type)} · ${this.getRarityName(equipment.rarity)}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontLG}px`,
        color: this.getRarityColor(equipment.rarity),
      }).setOrigin(0, 0.5)
    );
    yOffset += uiConfig.fontLG + 10;

    // 五行属性
    const wuxingName = equipment.wuxing !== undefined ? WUXING_NAMES[equipment.wuxing] : '无';
    const wuxingLevelStr = equipment.wuxing !== undefined ? ` Lv.${equipment.wuxingLevel ?? 1}` : '';
    this.popup.add(
      this.add.text(textX, yOffset, `${wuxingName}属性${wuxingLevelStr}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontLG}px`,
        color: '#' + color.toString(16).padStart(6, '0'),
      }).setOrigin(0, 0.5)
    );
    yOffset += uiConfig.fontLG + 10;

    // 攻防速血
    const stats: string[] = [];
    if (equipment.attack) stats.push(`攻击 +${equipment.attack}`);
    if (equipment.defense) stats.push(`防御 +${equipment.defense}`);
    if (equipment.speed) stats.push(`速度 +${equipment.speed}`);
    if (equipment.hp) stats.push(`血量 +${equipment.hp}`);
    if (stats.length > 0) {
      this.popup.add(
        this.add.text(textX, yOffset, stats.join('   '), {
          fontFamily: '"Noto Sans SC", sans-serif',
          fontSize: `${uiConfig.fontMD}px`,
          color: '#f0e6d3',
          wordWrap: { width: textWidth },
        }).setOrigin(0, 0.5)
      );
      yOffset += uiConfig.fontMD + 10;
    }

    // 技能图标
    const skills = getEquipmentSkillsDisplay(equipment, equipment.wuxingLevel ?? 1);
    if (skills.length > 0) {
      yOffset += 10;
      const iconSize = 28;
      const iconSpacing = 10;
      let ix = textX;

      for (const skill of skills) {
        const skillColor = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0xd4a853;
        const iconBg = this.add.circle(ix + iconSize / 2, yOffset, iconSize / 2, skillColor, 0.9);
        iconBg.setStrokeStyle(2, 0xffffff, 0.5);
        this.popup.add(iconBg);

        this.popup.add(
          this.add.text(ix + iconSize / 2, yOffset, skill.name.charAt(0), {
            fontFamily: '"Noto Sans SC", sans-serif',
            fontSize: '14px',
            color: '#ffffff',
            fontStyle: 'bold',
          }).setOrigin(0.5)
        );

        iconBg.setInteractive({ useHandCursor: true });
        iconBg.on('pointerup', () => this.showSkillDetail(skill.name, skill.description));

        ix += iconSize + iconSpacing;
      }
    }
  }

  private closePopup(): void {
    if (this.popup) {
      this.popup.destroy();
      this.popup = undefined;
    }
    this.currentSlot = undefined;
  }

  // ---- 装备/卸下 ----

  private equipItem(slotInfo: SlotInfo): void {
    const equipment = slotInfo.equipment;
    if (!equipment || slotInfo.type !== 'inventory') return;

    this.closePopup();

    let success = false;
    switch (equipment.type) {
      case EquipmentType.WEAPON:
        success = gameState.equipWeapon(slotInfo.index);
        break;
      case EquipmentType.ARMOR:
        success = gameState.equipArmor(slotInfo.index);
        break;
      case EquipmentType.TREASURE:
        if (gameState.getTreasures().length >= MAX_TREASURES) {
          this.showTopMessage('灵器栏已满！', '#f85149');
          return;
        }
        success = gameState.equipTreasure(slotInfo.index);
        break;
    }

    if (success) {
      this.showTopMessage(`装备了 ${equipment.name}`, '#3fb950');
      eventBus.emit(GameEvent.WUXING_CHOSEN, gameState.getChosenWuxing());
      eventBus.emit(GameEvent.STATS_CHANGED);
      this.scene.restart();
    } else {
      this.showTopMessage('装备失败', '#f85149');
    }
  }

  private unequipItem(slotInfo: SlotInfo): void {
    const equipment = slotInfo.equipment;
    if (!equipment) return;

    this.closePopup();

    if (gameState.isInventoryFull()) {
      this.showTopMessage('灵囊已满！', '#f85149');
      return;
    }

    let success = false;
    if (slotInfo.type === 'weapon') {
      success = gameState.unequipWeapon();
    } else if (slotInfo.type === 'armor') {
      success = gameState.unequipArmor();
    } else if (slotInfo.type === 'treasure') {
      success = gameState.unequipTreasure(slotInfo.index);
    }

    if (success) {
      const wasReset = gameState.validateChosenWuxing();
      if (wasReset) {
        eventBus.emit(GameEvent.WUXING_CHOSEN, undefined);
      }
      eventBus.emit(GameEvent.STATS_CHANGED);
      this.showTopMessage(`卸下了 ${equipment.name}`, '#3fb950');
      this.scene.restart();
    } else {
      this.showTopMessage('卸下失败', '#f85149');
    }
  }

  // ---- 合成/归元（由上下文菜单直接调用） ----

  private performSynthesize(firstIndex: number, secondIndex: number, useFragments: boolean): void {
    const result = SynthesisSystem.synthesize(firstIndex, secondIndex, useFragments);

    if (result.isSpecial && result.result) {
      this.showSpecialSynthesisNotification(result.result);
    } else {
      this.showTopMessage(result.message, result.success ? '#3fb950' : '#f85149');
      this.time.delayedCall(1500, () => this.scene.restart());
    }
  }

  private performDevour(firstIndex: number, secondIndex: number): void {
    const result = SynthesisSystem.devour(firstIndex, secondIndex);
    this.showTopMessage(result.message, result.success ? '#3fb950' : '#f85149');
    this.time.delayedCall(1500, () => this.scene.restart());
  }

  // ---- 特殊合成通知 ----

  private showSpecialSynthesisNotification(equipment: Equipment): void {
    const { width, height } = this.cameras.main;

    this.specialNotification = this.add.container(width / 2, height / 2);

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.9);
    this.specialNotification.add(overlay);

    const glow = this.add.graphics();
    const glowColor = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0xd4a853;
    glow.fillStyle(glowColor, 0.2);
    glow.fillCircle(0, 0, 150);
    this.specialNotification.add(glow);

    this.tweens.add({
      targets: glow,
      scaleX: 1.5, scaleY: 1.5, alpha: 0.3,
      duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    this.specialNotification.add(
      this.add.text(0, -100, '✨ 神器出世 ✨', {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: `${uiConfig.font2XL}px`,
        color: '#d4a853',
        fontStyle: 'bold',
      }).setOrigin(0.5)
    );

    const iconColor = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0x8b949e;
    const icon = this.add.circle(0, -20, 40, iconColor);
    icon.setStrokeStyle(4, 0xffffff, 0.8);
    this.specialNotification.add(icon);

    const wuxingSymbol = equipment.wuxing !== undefined ? this.getWuxingSymbol(equipment.wuxing) : '神';
    this.specialNotification.add(
      this.add.text(0, -20, wuxingSymbol, {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: `${uiConfig.fontXL}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5)
    );

    this.specialNotification.add(
      this.add.text(0, 50, equipment.name, {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: `${uiConfig.fontLG}px`,
        color: '#f0e6d3',
        fontStyle: 'bold',
      }).setOrigin(0.5)
    );

    this.specialNotification.add(
      this.add.text(0, 85, this.getRarityName(equipment.rarity), {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontSM}px`,
        color: this.getRarityColor(equipment.rarity),
      }).setOrigin(0.5)
    );

    const specialSkills = getEquipmentSkillsDisplay(equipment, equipment.wuxingLevel ?? 1);
    if (specialSkills.length > 0) {
      const skillsText = specialSkills.map(s => `【${s.name}】${s.description}`).join('\n');
      this.specialNotification.add(
        this.add.text(0, 115, skillsText, {
          fontFamily: '"Noto Sans SC", sans-serif',
          fontSize: `${uiConfig.fontXS ?? 10}px`,
          color: '#d4a853',
          wordWrap: { width: 280 },
          align: 'center',
        }).setOrigin(0.5, 0)
      );
    }

    const btnBg = this.add.rectangle(0, 180, 140, 40, this.colors.goldAccent);
    btnBg.setStrokeStyle(2, 0xffffff, 0.5);
    btnBg.setInteractive({ useHandCursor: true });
    const btnText = this.add.text(0, 180, '太棒了！', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: '#0d1117',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.specialNotification.add([btnBg, btnText]);

    btnBg.on('pointerover', () => btnBg.setFillStyle(0xffffff));
    btnBg.on('pointerout', () => btnBg.setFillStyle(this.colors.goldAccent));
    btnBg.on('pointerup', () => {
      this.closeSpecialNotification();
      this.scene.restart();
    });

    this.specialNotification.setAlpha(0);
    this.specialNotification.setScale(0.8);
    this.tweens.add({
      targets: this.specialNotification,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 400, ease: 'Back.easeOut',
    });
  }

  private closeSpecialNotification(): void {
    if (this.specialNotification) {
      this.specialNotification.destroy();
      this.specialNotification = undefined;
    }
  }

  private getWuxingSymbol(wuxing: Wuxing): string {
    switch (wuxing) {
      case Wuxing.METAL: return '金';
      case Wuxing.WOOD:  return '木';
      case Wuxing.WATER: return '水';
      case Wuxing.FIRE:  return '火';
      case Wuxing.EARTH: return '土';
      default: return '?';
    }
  }

  // 顶部消息
  private showTopMessage(message: string, color: string = '#f0e6d3', autoHide: boolean = true): void {
    this.closeTopMessage();

    const { width, height } = this.cameras.main;
    const msgWidth = Math.max(400, Math.min(650, width * 0.55));
    const msgHeight = Math.max(50, Math.min(60, height * 0.085));

    this.topMessage = this.add.container(width / 2, height * 0.50);

    const bg = this.add.graphics();
    bg.fillStyle(this.colors.inkBlack, 0.98);
    bg.fillRoundedRect(-msgWidth / 2, -msgHeight / 2, msgWidth, msgHeight, 8);
    bg.lineStyle(2, this.colors.goldAccent, 0.8);
    bg.strokeRoundedRect(-msgWidth / 2, -msgHeight / 2, msgWidth, msgHeight, 8);
    this.topMessage.add(bg);

    this.topMessage.add(
      this.add.text(0, 0, message, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontMD}px`,
        color: color,
        align: 'center',
      }).setOrigin(0.5)
    );

    if (autoHide) {
      this.time.delayedCall(1500, () => this.closeTopMessage());
    }
  }

  private closeTopMessage(): void {
    if (this.topMessage) {
      this.topMessage.destroy();
      this.topMessage = undefined;
    }
  }

  // ---- Helper methods ----

  private getRarityName(rarity: Rarity): string {
    switch (rarity) {
      case Rarity.COMMON:   return '普通';
      case Rarity.UNCOMMON: return '优秀';
      case Rarity.RARE:     return '稀有';
      case Rarity.EPIC:     return '史诗';
      case Rarity.LEGENDARY:return '传说';
      default: return '普通';
    }
  }

  private getRarityColor(rarity: Rarity): string {
    switch (rarity) {
      case Rarity.COMMON:   return '#8b949e';
      case Rarity.UNCOMMON: return '#3fb950';
      case Rarity.RARE:     return '#58a6ff';
      case Rarity.EPIC:     return '#a855f7';
      case Rarity.LEGENDARY:return '#d4a853';
      default: return '#8b949e';
    }
  }

  private getRarityBorderColor(rarity: Rarity): number {
    switch (rarity) {
      case Rarity.COMMON:   return 0x8b949e;
      case Rarity.UNCOMMON: return 0x3fb950;
      case Rarity.RARE:     return 0x58a6ff;
      case Rarity.EPIC:     return 0xa855f7;
      case Rarity.LEGENDARY:return 0xd4a853;
      default: return 0x8b949e;
    }
  }

  private getEquipmentTypeName(type: EquipmentType): string {
    switch (type) {
      case EquipmentType.WEAPON: return '武器';
      case EquipmentType.ARMOR:  return '铠甲';
      case EquipmentType.TREASURE:return '灵器';
      default: return '器物';
    }
  }

  private showSkillDetail(skillName: string, skillDescription: string): void {
    if (this.popup) this.closePopup();

    const { width, height } = this.cameras.main;
    this.popup = this.add.container(width / 2, height / 2).setDepth(100);

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7);
    overlay.setInteractive();
    overlay.on('pointerup', () => this.closePopup());
    this.popup.add(overlay);

    const panelWidth = Math.min(360, width * 0.85);
    const panelHeight = 180;
    const panel = this.add.graphics();
    panel.fillStyle(0x1c2128, 0.98);
    panel.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
    panel.lineStyle(2, 0xd4a853, 0.9);
    panel.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
    this.popup.add(panel);

    this.popup.add(
      this.add.text(0, -panelHeight * 0.28, `【${skillName}】`, {
        fontFamily: '"Noto Serif SC", serif', fontSize: '18px', color: '#d4a853', fontStyle: 'bold',
      }).setOrigin(0.5)
    );
    this.popup.add(
      this.add.text(0, 10, skillDescription, {
        fontFamily: '"Noto Sans SC", sans-serif', fontSize: '14px', color: '#f0e6d3',
        wordWrap: { width: panelWidth * 0.85 }, align: 'center',
      }).setOrigin(0.5)
    );

    const closeBtn = this.add.rectangle(0, panelHeight / 2 - 28, 80, 30, 0x30363d);
    closeBtn.setStrokeStyle(1.5, 0xd4a853, 0.5);
    closeBtn.setInteractive({ useHandCursor: true });
    closeBtn.on('pointerup', () => this.closePopup());
    this.popup.add(closeBtn);
    this.popup.add(
      this.add.text(0, panelHeight / 2 - 28, '关闭', {
        fontFamily: '"Noto Sans SC", sans-serif', fontSize: '13px', color: '#f0e6d3',
      }).setOrigin(0.5)
    );
  }

  private createCloseButton(): void {
    const { width, height } = this.cameras.main;
    const headerHeight = height * 0.08;

    const btnSize = Math.max(44, headerHeight * 0.9);
    const btnX = width - btnSize / 2 - 10;
    const btnY = headerHeight / 2;

    const hitArea = this.add.rectangle(btnX, btnY, btnSize, btnSize, this.colors.inkGrey, 0.5);
    hitArea.setStrokeStyle(1, this.colors.goldAccent, 0.3);
    hitArea.setInteractive({ useHandCursor: true });

    const closeText = this.add.text(btnX, btnY, '✕', {
      fontFamily: 'Arial',
      fontSize: `${uiConfig.fontXL}px`,
      color: '#8b949e',
    }).setOrigin(0.5);

    hitArea.on('pointerover', () => { hitArea.setFillStyle(this.colors.redAccent, 0.8); closeText.setColor('#ffffff'); });
    hitArea.on('pointerout', () => { hitArea.setFillStyle(this.colors.inkGrey, 0.5); closeText.setColor('#8b949e'); });
    hitArea.on('pointerup', () => this.closeScene());
  }

  private closeScene(): void {
    this.scene.stop();
  }
}
