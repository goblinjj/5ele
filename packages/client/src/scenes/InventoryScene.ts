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
import { uiConfig, LAYOUT, UIConfig } from '../config/uiConfig.js';
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
 *  - 单击格子     → 右侧详情面板显示装备信息及操作按钮（穿戴/卸下/归元）
 *  - 拖动到同类装备格 → 穿戴（背包→装备栏）或卸下（装备栏→背包区）
 *  - 拖动到另一背包格上 → 弹出上下文菜单（重组/归元/碎片/取消）
 */
export class InventoryScene extends Phaser.Scene {
  private topMessage?: Phaser.GameObjects.Container;
  private specialNotification?: Phaser.GameObjects.Container;
  private contextMenu?: Phaser.GameObjects.Container;

  // 拖拽状态
  private isDragging: boolean = false;
  private dragStart = { x: 0, y: 0 };
  private dragSourceSlot?: SlotInfo;
  private dragContainer?: Phaser.GameObjects.Container;

  // 上下文菜单碎片开关
  private contextMenuUseFragments: boolean = false;

  // 槽位几何信息（用于拖拽释放时的碰撞检测）
  private slotGeometries: Array<{ x: number; y: number; size: number; slotInfo: SlotInfo }> = [];

  /** 当前选中槽位（单击显示详情） */
  private selectedSlot?: SlotInfo;
  /** 双击检测 */
  private lastClickTime: number = 0;
  private lastClickSlot?: SlotInfo;
  /** 详情面板容器（右栏，选中后更新） */
  private detailPanel?: Phaser.GameObjects.Container;
  /** 详情面板几何（createEquipmentAndDetailLayout 后固定） */
  private detailPanelX: number = 0;
  private detailPanelY: number = 0;
  private detailPanelW: number = 0;
  private detailPanelH: number = 0;

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
    const vpH = Math.floor(fullH * LAYOUT.VIEWPORT_RATIO);
    this.cameras.main.setViewport(0, 0, width, vpH);

    this.slotGeometries = [];
    this.isDragging = false;
    this.dragSourceSlot = undefined;
    this.selectedSlot = undefined;
    this.lastClickTime = 0;
    this.lastClickSlot = undefined;

    this.add.rectangle(width / 2, vpH / 2, width, vpH, this.colors.bgDark, 0.98);

    this.createHeader();
    this.createEquipmentAndDetailLayout();
    this.createInventorySection();
    this.createCloseButton();

    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.contextMenu) {
        this.closeContextMenu();
      } else if (this.selectedSlot && this.topMessage) {
        // 取消归元模式
        this.selectedSlot = undefined;
        this.closeTopMessage();
      } else {
        this.closeScene();
      }
    });

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
      fontSize: `${uiConfig.font2XL}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);

  }

  private createEquipmentAndDetailLayout(): void {
    const { width, height } = this.cameras.main;
    const headerH = height * 0.08;
    const pad = 8;

    // ── 统一槽位尺寸（与背包格子一致）──
    const SLOT_SIZE = 90;
    const equipRowH = SLOT_SIZE + 30; // 槽位 + 标签行高
    const equipRowY = headerH + pad;
    const equipBg = this.add.graphics();
    equipBg.fillStyle(this.colors.inkBlack, 0.5);
    equipBg.fillRoundedRect(pad, equipRowY, width - pad * 2, equipRowH, 8);
    equipBg.lineStyle(1, this.colors.inkGrey, 0.5);
    equipBg.strokeRoundedRect(pad, equipRowY, width - pad * 2, equipRowH, 8);

    // 槽位中心 Y（标签22px 后居中）
    const equipCenterY = equipRowY + 35 + SLOT_SIZE / 2;

    // 武器/防具槽（固定 SLOT_SIZE）
    const wepSlotSize = SLOT_SIZE;

    // 武器槽
    const weaponX = pad * 2 + wepSlotSize / 2;
    this.add.text(weaponX, equipRowY + 6, '武器', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontLG}px`,
      color: '#d4a853',
    }).setOrigin(0.5, 0);
    this.createSlot(weaponX, equipCenterY, { type: 'weapon', index: 0, equipment: gameState.getWeapon() }, wepSlotSize);

    // 防具槽
    const armorX = weaponX + wepSlotSize + pad;
    this.add.text(armorX, equipRowY + 6, '防具', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontLG}px`,
      color: '#d4a853',
    }).setOrigin(0.5, 0);
    this.createSlot(armorX, equipCenterY, { type: 'armor', index: 0, equipment: gameState.getArmor() }, wepSlotSize);

    // 分隔线
    const divX = armorX + wepSlotSize / 2 + pad;
    const divGfx = this.add.graphics();
    divGfx.lineStyle(1, this.colors.inkGrey, 0.6);
    divGfx.lineBetween(divX, equipRowY + 8, divX, equipRowY + equipRowH - 8);

    // 灵器槽（SLOT_SIZE，均分右侧区域）
    const treasureAreaX = divX + pad;
    const treasureAreaW = width - treasureAreaX - pad * 2;
    const tCount = MAX_TREASURES; // 5
    const tSlotSize = SLOT_SIZE;
    const tGap = tCount > 1 ? Math.floor((treasureAreaW - tCount * tSlotSize) / (tCount - 1)) : 0;
    const tSlotY = equipCenterY;
    const treasures = gameState.getTreasures();

    // 灵器标签（在第一个上方）
    this.add.text(treasureAreaX + tSlotSize / 2, equipRowY + 6, '灵器', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontLG}px`,
      color: '#d4a853',
    }).setOrigin(0.5, 0);

    for (let i = 0; i < tCount; i++) {
      const tx = treasureAreaX + i * (tSlotSize + tGap) + tSlotSize / 2;
      this.createSlot(tx, tSlotY, { type: 'treasure', index: i, equipment: treasures[i] || null }, tSlotSize);
    }

    // ── 背包区域（固定在底部，pin to bottom）──
    const cols = 5;
    const rows = Math.ceil(INVENTORY_SIZE / cols);
    const gridPadY = 32;
    const slotGap = 6;
    const invSectionH = gridPadY + rows * SLOT_SIZE + (rows - 1) * slotGap + pad;
    const invSectionY = height - invSectionH - pad;

    // ── 详情面板（填充装备行与背包之间的空间）──
    const detailY = equipRowY + equipRowH + pad;
    const detailH = Math.max(100, invSectionY - detailY - pad);

    this.detailPanelX = pad;
    this.detailPanelY = detailY;
    this.detailPanelW = width - pad * 2;
    this.detailPanelH = detailH;

    const detailBg = this.add.graphics();
    detailBg.fillStyle(this.colors.inkBlack, 0.4);
    detailBg.fillRoundedRect(pad, detailY, width - pad * 2, detailH, 8);
    detailBg.lineStyle(1, this.colors.inkGrey, 0.4);
    detailBg.strokeRoundedRect(pad, detailY, width - pad * 2, detailH, 8);

    this.refreshDetailPanel(undefined);
  }

  private refreshDetailPanel(slotInfo: SlotInfo | undefined): void {
    if (this.detailPanel) {
      this.detailPanel.destroy();
      this.detailPanel = undefined;
    }

    const container = this.add.container(this.detailPanelX, this.detailPanelY).setDepth(50);
    this.detailPanel = container;
    const W = this.detailPanelW;
    const H = this.detailPanelH;

    if (!slotInfo?.equipment) {
      container.add(
        this.add.text(W / 2, H / 2, "单击查看\n拖拽重组", {
          fontFamily: '"Noto Sans SC", sans-serif',
          fontSize: '52px',
          color: '#484f58',
          align: 'center',
        }).setOrigin(0.5)
      );
      return;
    }

    const equipment = slotInfo.equipment;
    const color = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0x8b949e;
    const colorHex = '#' + color.toString(16).padStart(6, '0');
    let y = 64;
    const pad = 48;

    // 名称
    container.add(
      this.add.text(pad, y, equipment.name, {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: `${uiConfig.font2XL}px`,
        color: '#f0e6d3',
        fontStyle: 'bold',
      })
    );
    y += 88;

    // 类型 · 稀有度
    container.add(
      this.add.text(pad, y, `${this.getEquipmentTypeName(equipment.type)} · ${this.getRarityName(equipment.rarity)}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontLG}px`,
        color: this.getRarityColor(equipment.rarity),
      })
    );
    y += 72;

    // 五行属性
    if (equipment.wuxing !== undefined) {
      const wuxName = WUXING_NAMES[equipment.wuxing];
      container.add(
        this.add.text(pad, y, `${wuxName}属 Lv.${equipment.wuxingLevel ?? 1}${equipment.upgradeLevel > 0 ? ` +${equipment.upgradeLevel}` : ''}`, {
          fontFamily: '"Noto Sans SC", sans-serif',
          fontSize: `${uiConfig.fontLG}px`,
          color: colorHex,
        })
      );
      y += 72;
    }

    // 属性数值
    const stats: string[] = [];
    if (equipment.attack)  stats.push(`攻+${equipment.attack}`);
    if (equipment.defense) stats.push(`防+${equipment.defense}`);
    if (equipment.speed)   stats.push(`速+${equipment.speed}`);
    if (equipment.hp)      stats.push(`血+${equipment.hp}`);
    if (stats.length > 0) {
      container.add(
        this.add.text(pad, y, stats.join('  '), {
          fontFamily: 'monospace',
          fontSize: `${uiConfig.fontLG}px`,
          color: '#f0e6d3',
        })
      );
      y += 72;
    }

    // 技能列表
    const skills = getEquipmentSkillsDisplay(equipment, equipment.wuxingLevel ?? 1);
    if (skills.length > 0) {
      y += 16;
      for (const skill of skills) {
        const skillLine = this.add.text(pad, y, `✦ ${skill.name}: ${skill.description}`, {
          fontFamily: '"Noto Sans SC", sans-serif',
          fontSize: '40px',
          color: colorHex,
          wordWrap: { width: W - pad * 2 },
        });
        container.add(skillLine);
        y += skillLine.height + 16;
      }
    }

    // 操作按钮区（底部对齐）
    const btnH = 60;
    const btnY = H - btnH - 20;
    const isEquipped = slotInfo.type !== 'inventory';
    const btnW = isEquipped ? (W - pad * 3) / 2 : W - pad * 2;

    // 穿戴/卸下按钮
    const equipBtnLabel = isEquipped ? '卸下' : '穿戴';
    const equipBtnColor = isEquipped ? 0x484f58 : 0x1a7f37;

    const equipBg = this.add.graphics();
    equipBg.fillStyle(equipBtnColor, 0.9);
    equipBg.fillRoundedRect(pad, btnY, btnW, btnH, 6);
    container.add(equipBg);

    container.add(
      this.add.text(pad + btnW / 2, btnY + btnH / 2, equipBtnLabel, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontLG}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5)
    );

    const equipHit = this.add.rectangle(pad + btnW / 2, btnY + btnH / 2, btnW, btnH, 0xffffff, 0).setInteractive({ useHandCursor: true });
    equipHit.on('pointerup', () => {
      if (isEquipped) {
        this.unequipItem(slotInfo);
      } else {
        this.equipItem(slotInfo);
      }
    });
    container.add(equipHit);

    // 归元按钮（仅对装备栏中已穿戴的装备显示）
    if (isEquipped) {
      const devourX = pad * 2 + btnW;
      const devourBtnW = (W - pad * 3) / 2;

      const devourBg = this.add.graphics();
      devourBg.fillStyle(0x6e2c00, 0.9);
      devourBg.fillRoundedRect(devourX, btnY, devourBtnW, btnH, 6);
      container.add(devourBg);

      container.add(
        this.add.text(devourX + devourBtnW / 2, btnY + btnH / 2, '归元', {
          fontFamily: '"Noto Sans SC", sans-serif',
          fontSize: `${uiConfig.fontLG}px`,
          color: '#f0a030',
          fontStyle: 'bold',
        }).setOrigin(0.5)
      );

      const devourHit = this.add.rectangle(devourX + devourBtnW / 2, btnY + btnH / 2, devourBtnW, btnH, 0xffffff, 0).setInteractive({ useHandCursor: true });
      devourHit.on('pointerup', () => {
        this.selectedSlot = slotInfo;
        this.showTopMessage('选择背包中的装备作为归元目标', '#d4a853', false);
      });
      container.add(devourHit);
    }
  }

  private createInventorySection(): void {
    const { width, height } = this.cameras.main;
    const pad = 8;
    // 使用实例变量（由 createEquipmentAndDetailLayout 设置），避免重复计算
    const sectionY = this.detailPanelY + this.detailPanelH + pad;
    const sectionH = height - sectionY - pad;

    const sectionBg = this.add.graphics();
    sectionBg.fillStyle(this.colors.inkBlack, 0.5);
    sectionBg.fillRoundedRect(pad, sectionY, width - pad * 2, sectionH, 8);
    sectionBg.lineStyle(1, this.colors.inkGrey, 0.5);
    sectionBg.strokeRoundedRect(pad, sectionY, width - pad * 2, sectionH, 8);

    const usedSlots = INVENTORY_SIZE - gameState.getEmptySlotCount();
    this.add.text(width * 0.04, sectionY + 10, `背包 (${usedSlots}/${INVENTORY_SIZE})`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontLG}px`,
      color: '#d4a853',
      fontStyle: 'bold',
    });

    const fragments = gameState.getFragmentCount();
    this.add.text(width * 0.96, sectionY + 10, `💎×${fragments}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontXS}px`,
      color: '#a855f7',
    }).setOrigin(1, 0);

    // 2行×5列网格
    const cols = 5;
    const rows = Math.ceil(INVENTORY_SIZE / cols);
    const gridPadX = pad * 2;
    const gridPadY = 32; // 标题下方
    const slotGap = 6;
    const availW = width - pad * 2 - gridPadX * 2;
    const availH = sectionH - gridPadY - pad;
    const slotSize = Math.min(
      Math.floor((availW - slotGap * (cols - 1)) / cols),
      Math.floor((availH - slotGap * (rows - 1)) / rows),
      90  // 最大90px
    );
    const gridTotalW = cols * slotSize + (cols - 1) * slotGap;
    const startX = pad + gridPadX + slotSize / 2 + (availW - gridTotalW) / 2;
    const startY = sectionY + gridPadY + slotSize / 2;

    const inventory = gameState.getInventory();
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (slotSize + slotGap);
      const y = startY + row * (slotSize + slotGap);
      this.createSlot(x, y, { type: 'inventory', index: i, equipment: inventory[i] }, slotSize);
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
      const src = this.dragSourceSlot;

      // 归元模式：等待用户选择背包中的牺牲品
      if (this.selectedSlot && this.topMessage) {
        if (src.equipment && src.type === 'inventory') {
          this.closeTopMessage();
          this.handleDevour(this.selectedSlot, src);
          this.selectedSlot = undefined;
        } else if (!src.equipment) {
          // 点击空格子 → 取消归元模式
          this.selectedSlot = undefined;
          this.closeTopMessage();
        }
        // 点击非背包有装备格子时忽略（继续等待选择）
      } else {
        const now = Date.now();
        const isDoubleClick =
          this.lastClickSlot?.type === src.type &&
          this.lastClickSlot?.index === src.index &&
          now - this.lastClickTime < 500;

        if (isDoubleClick && src.equipment) {
          // 双击：穿戴（背包）或卸下（装备栏）
          if (src.type === 'inventory') {
            this.equipItem(src);
          } else {
            this.unequipItem(src);
          }
          this.lastClickTime = 0;
          this.lastClickSlot = undefined;
        } else {
          // 单击：更新详情面板
          this.refreshDetailPanel(src.equipment ? src : undefined);
          this.lastClickTime = now;
          this.lastClickSlot = src;
        }
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

  // ---- 装备/卸下 ----

  private equipItem(slotInfo: SlotInfo): void {
    const equipment = slotInfo.equipment;
    if (!equipment || slotInfo.type !== 'inventory') return;

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

  // ---- 归元（装备槽中的装备归元，消耗背包中的牺牲品） ----

  private handleDevour(equipSlot: SlotInfo, sacrificeSlot: SlotInfo): void {
    const equipped = equipSlot.equipment;
    const sacrifice = sacrificeSlot.equipment;
    if (!equipped || !sacrifice) return;

    // 归元只允许对已装备的槽位（非背包）
    if (equipSlot.type === 'inventory') return;

    gameState.removeFromInventory(sacrificeSlot.index);

    const result = SynthesisSystem.devourEquipped(equipSlot.type, equipSlot.index, sacrifice);
    eventBus.emit(GameEvent.STATS_CHANGED);  // always emit — inventory changed
    if (result.success && result.upgradedItem) {
      this.showTopMessage(`归元成功！${result.upgradedItem.name} 变得更强了！`, '#3fb950');
    } else {
      this.showTopMessage(`归元失败... ${sacrifice.name} 消散了`, '#f85149');
    }

    this.time.delayedCall(1200, () => this.scene.restart());
  }

  // ---- 合成/归元（由上下文菜单直接调用，均为背包格之间） ----

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

    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.9).setInteractive();
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

    this.topMessage = this.add.container(width / 2, height * 0.62);

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
