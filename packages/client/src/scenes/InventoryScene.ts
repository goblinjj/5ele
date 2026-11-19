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
import { createItemIcon, slotHintGlyph, wrapCJK } from '../systems/fx/ItemIcon.js';
import { WX_TINT } from '../config/worldConfig.js';
import { sfx } from '../systems/audio/Sfx.js';
import { GAME_WIDTH, GAME_HEIGHT, RENDER_SCALE, applyRenderScale } from '../config/gameConfig.js';

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
  private selectionRing?: Phaser.GameObjects.Graphics;
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

  /** 灵囊占屏幕上方的逻辑尺寸 */
  private get view(): { width: number; height: number } {
    return { width: GAME_WIDTH, height: Math.floor(GAME_HEIGHT * LAYOUT.VIEWPORT_RATIO) };
  }

  create(): void {
    const width = GAME_WIDTH;
    const vpH = this.view.height;
    // 视口以物理像素计，布局仍用逻辑坐标
    applyRenderScale(this);
    this.cameras.main.setViewport(0, 0, Math.round(width * RENDER_SCALE), Math.round(vpH * RENDER_SCALE));

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
    const { width, height } = this.view;
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
    const { width, height } = this.view;
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

    // 选中框：标出当前查看的是哪一格
    this.selectionRing?.destroy();
    this.selectionRing = undefined;
    if (slotInfo?.equipment) {
      const geo = this.slotGeometries.find(g => g.slotInfo.type === slotInfo.type && g.slotInfo.index === slotInfo.index);
      if (geo) {
        const r = this.add.graphics().setDepth(40);
        r.lineStyle(4, 0xffffff, 0.95);
        r.strokeRoundedRect(geo.x - geo.size / 2 - 3, geo.y - geo.size / 2 - 3, geo.size + 6, geo.size + 6, 14);
        this.selectionRing = r;
      }
    }

    const container = this.add.container(this.detailPanelX, this.detailPanelY).setDepth(50);
    this.detailPanel = container;
    const W = this.detailPanelW;
    const H = this.detailPanelH;
    const SERIF = '"Noto Serif SC", "Songti SC", serif';
    const SANS = '"Noto Sans SC", "PingFang SC", sans-serif';

    if (!slotInfo?.equipment) {
      container.add(
        this.add.text(W / 2, H / 2 - 24, '点选器物查看详情', {
          fontFamily: SERIF, fontSize: '34px', color: '#6e7681',
        }).setOrigin(0.5)
      );
      container.add(
        this.add.text(W / 2, H / 2 + 34, '双击穿戴 / 卸下　·　拖到另一件器物上可重组或归元', {
          fontFamily: SANS, fontSize: '20px', color: '#484f58',
        }).setOrigin(0.5)
      );
      return;
    }

    const equipment = slotInfo.equipment;
    const wxColor = equipment.wuxing !== undefined ? WX_TINT[equipment.wuxing] : 0xa9b4c0;
    const wxHex = '#' + wxColor.toString(16).padStart(6, '0');
    // 普通品质用米白，避免名称发灰
    const rarityHex = equipment.rarity === Rarity.COMMON ? '#f0e6d3' : this.getRarityColor(equipment.rarity);
    const pad = 24;

    // ── 头部：大图标 + 名称 + 类别 ──
    const iconSize = 124;
    const icon = createItemIcon(this, equipment, iconSize);
    icon.setPosition(pad + iconSize / 2, pad + iconSize / 2);
    container.add(icon);

    const textX = pad + iconSize + 22;
    const nameText = this.add.text(textX, pad + 2, equipment.name, {
      fontFamily: SERIF, fontSize: '40px', fontStyle: 'bold', color: rarityHex,
    });
    // 名称过长时缩小
    const nameMaxW = W - textX - pad;
    if (nameText.width > nameMaxW) nameText.setScale(nameMaxW / nameText.width);
    container.add(nameText);

    const upgrade = equipment.upgradeLevel > 0 ? `　强化 +${equipment.upgradeLevel}` : '';
    container.add(
      this.add.text(textX, pad + 56, `${this.getEquipmentTypeName(equipment.type)} · ${this.getRarityName(equipment.rarity)}${upgrade}`, {
        fontFamily: SANS, fontSize: '22px', color: '#8b949e',
      })
    );
    container.add(
      this.add.text(textX, pad + 92,
        equipment.wuxing !== undefined
          ? `${WUXING_NAMES[equipment.wuxing]}属　五行 Lv.${equipment.wuxingLevel ?? 1}`
          : '无五行属性', {
          fontFamily: SERIF, fontSize: '24px', fontStyle: 'bold',
          color: equipment.wuxing !== undefined ? wxHex : '#6e7681',
        })
    );

    // ── 属性徽章 ──
    let y = pad + iconSize + 18;
    const statDefs: Array<{ label: string; value?: number; color: number }> = [
      { label: '攻', value: equipment.attack, color: 0xff7a5c },
      { label: '防', value: equipment.defense, color: 0x58a6ff },
      { label: '速', value: equipment.speed, color: 0x4ade80 },
      { label: '血', value: equipment.hp, color: 0xf472b6 },
    ];
    let sx = pad;
    const chipH = 40;
    statDefs.forEach(st => {
      if (!st.value) return;
      const hex = '#' + st.color.toString(16).padStart(6, '0');
      const t = this.add.text(0, y + chipH / 2, `${st.label} +${st.value}`, {
        fontFamily: SANS, fontSize: '24px', fontStyle: 'bold', color: hex,
      }).setOrigin(0, 0.5);
      const cw = t.width + 24;
      const g = this.add.graphics();
      g.fillStyle(st.color, 0.12);
      g.fillRoundedRect(sx, y, cw, chipH, 8);
      g.lineStyle(1.5, st.color, 0.6);
      g.strokeRoundedRect(sx, y, cw, chipH, 8);
      t.setX(sx + 12);
      container.add([g, t]);
      sx += cw + 10;
    });
    y += chipH + 16;

    // ── 操作按钮（底部对齐）──
    const btnH = 66;
    const btnY = H - btnH - 18;
    const isEquipped = slotInfo.type !== 'inventory';

    // ── 技能（夹在徽章与按钮之间，放不下时自动缩小字号）──
    const skills = getEquipmentSkillsDisplay(equipment, equipment.wuxingLevel ?? 1);
    if (skills.length > 0) {
      const line = this.add.graphics();
      line.lineStyle(1, 0x30363d, 1);
      line.lineBetween(pad, y - 6, W - pad, y - 6);
      container.add(line);

      const availH = btnY - 14 - y;
      const raw = skills.map(sk => `✦ ${sk.name}　${sk.description}`).join('\n');
      // 中文按字符折行；放不下时逐级缩小字号
      let fontSize = 25;
      const skillText = this.add.text(pad, y + 4, '', {
        fontFamily: SANS, fontSize: `${fontSize}px`, color: '#e6c97a', lineSpacing: 8,
      });
      for (;;) {
        skillText.setFontSize(fontSize);
        skillText.setText(wrapCJK(raw, W - pad * 2 - 24, `${fontSize}px ${SANS}`));
        if (skillText.height <= availH || fontSize <= 15) break;
        fontSize -= 2;
      }
      container.add(skillText);
    }

    const makeBtn = (x: number, w: number, label: string, fill: number, stroke: number, textColor: string, onClick: () => void) => {
      const g = this.add.graphics();
      g.fillStyle(fill, 0.95);
      g.fillRoundedRect(x, btnY, w, btnH, 12);
      g.lineStyle(2, stroke, 0.9);
      g.strokeRoundedRect(x, btnY, w, btnH, 12);
      const t = this.add.text(x + w / 2, btnY + btnH / 2, label, {
        fontFamily: SERIF, fontSize: '30px', fontStyle: 'bold', color: textColor,
      }).setOrigin(0.5);
      const hit = this.add.rectangle(x + w / 2, btnY + btnH / 2, w, btnH, 0xffffff, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => g.setAlpha(0.6));
      hit.on('pointerout', () => g.setAlpha(1));
      hit.on('pointerup', () => { g.setAlpha(1); onClick(); });
      container.add([g, t, hit]);
    };

    if (isEquipped) {
      const bw = (W - pad * 3) / 2;
      makeBtn(pad, bw, '卸下', 0x21262d, 0x8b949e, '#f0e6d3', () => this.unequipItem(slotInfo));
      // 归元：消耗背包中的一件器物来强化这件已穿戴的器物
      makeBtn(pad * 2 + bw, bw, '归元', 0x3d2408, 0xd4a853, '#ffcf70', () => {
        this.selectedSlot = slotInfo;
        this.showTopMessage('选择背包中的器物作为归元的祭品', '#d4a853', false);
      });
    } else {
      makeBtn(pad, W - pad * 2, '穿戴', 0x14532d, 0x4ade80, '#eafff0', () => this.equipItem(slotInfo));
    }
  }

  private createInventorySection(): void {
    const { width, height } = this.view;
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
    this.add.text(width * 0.96, sectionY + 12, `碎片 ${fragments}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '22px',
      color: '#d4a853',
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
    const half = slotSize / 2;

    // 槽位底：圆角暗格
    const frame = this.add.graphics();
    const drawFrame = (hover: boolean) => {
      frame.clear();
      frame.fillStyle(0x0a0f14, 0.85);
      frame.fillRoundedRect(-half, -half, slotSize, slotSize, 12);
      if (hover) {
        frame.lineStyle(3, this.colors.goldAccent, 1);
      } else {
        frame.lineStyle(2, 0x30363d, equipment ? 0 : 0.9);
      }
      frame.strokeRoundedRect(-half, -half, slotSize, slotSize, 12);
    };
    drawFrame(false);
    container.add(frame);

    if (equipment) {
      container.add(createItemIcon(this, equipment, slotSize));
    } else {
      // 空槽暗纹：提示这里放什么
      const glyph = slotHintGlyph(slotInfo.type);
      if (glyph) {
        container.add(this.add.text(0, 0, glyph, {
          fontFamily: '"Noto Serif SC", "Songti SC", serif',
          fontSize: `${Math.round(slotSize * 0.42)}px`,
          color: '#30363d',
        }).setOrigin(0.5));
      }
    }

    // 悬停描边画在图标之上
    const hoverRing = this.add.graphics();
    container.add(hoverRing);

    const hit = this.add.rectangle(0, 0, slotSize, slotSize, 0xffffff, 0).setInteractive({ useHandCursor: true });
    container.add(hit);

    // 注册槽位几何信息（用于拖拽命中检测）
    this.slotGeometries.push({ x, y, size: slotSize, slotInfo });

    // 事件：仅记录 pointerdown（所有 click/drag 逻辑统一在 onGlobalPointerUp 处理）
    hit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.onSlotPointerDown(pointer, slotInfo);
    });
    hit.on('pointerover', () => {
      hoverRing.clear();
      hoverRing.lineStyle(3, this.colors.goldAccent, 1);
      hoverRing.strokeRoundedRect(-half, -half, slotSize, slotSize, 12);
    });
    hit.on('pointerout', () => hoverRing.clear());
  }

  // ---- 拖拽系统 ----

  private onSlotPointerDown(pointer: Phaser.Input.Pointer, slotInfo: SlotInfo): void {
    if (!slotInfo.equipment) return;
    // 关闭现有弹窗
    this.closeContextMenu();
    // 记录拖拽起点
    this.dragSourceSlot = slotInfo;
    this.dragStart = { x: (pointer.x / RENDER_SCALE), y: (pointer.y / RENDER_SCALE) };
    this.isDragging = false;
  }

  private onGlobalPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragSourceSlot) return;

    const dx = (pointer.x / RENDER_SCALE) - this.dragStart.x;
    const dy = (pointer.y / RENDER_SCALE) - this.dragStart.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!this.isDragging && dist > 12) {
      this.isDragging = true;
      this.closeContextMenu();
      this.createDragVisual(pointer);
    }

    if (this.isDragging && this.dragContainer) {
      this.dragContainer.setPosition((pointer.x / RENDER_SCALE), (pointer.y / RENDER_SCALE));
    }
  }

  private onGlobalPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.dragSourceSlot) return;

    if (this.isDragging) {
      const dropSlot = this.findSlotAtPosition((pointer.x / RENDER_SCALE), (pointer.y / RENDER_SCALE));
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
          if (src.equipment) sfx.click();
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
    this.dragContainer = this.add.container((pointer.x / RENDER_SCALE), (pointer.y / RENDER_SCALE)).setDepth(200);
    this.dragContainer.add(createItemIcon(this, this.dragSourceSlot.equipment, 96));
    this.dragContainer.setAlpha(0.9);
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
      this.showContextMenu((pointer.x / RENDER_SCALE), (pointer.y / RENDER_SCALE), source, dropSlot);
      return;
    }

    // 其他情况 → 不操作
  }

  // ---- 上下文菜单（重组/归元/碎片/取消） ----

  private showContextMenu(x: number, y: number, sourceSlot: SlotInfo, targetSlot: SlotInfo): void {
    this.closeContextMenu();
    const { width, height } = this.view;
    this.contextMenuUseFragments = false;

    const menuW = 440;
    const menuH = 300;
    // 让菜单在指针上方，并保持在视口内
    const cx = Math.min(Math.max(x, menuW / 2 + 10), width - menuW / 2 - 10);
    const cy = Math.min(Math.max(y - menuH - 20, 10), height - menuH - 10);

    this.contextMenu = this.add.container(cx, cy).setDepth(150);
    const SERIF = '"Noto Serif SC", "Songti SC", serif';
    const SANS = '"Noto Sans SC", "PingFang SC", sans-serif';

    const bg = this.add.graphics();
    bg.fillStyle(0x0d1117, 1);
    bg.fillRoundedRect(-menuW / 2, 0, menuW, menuH, 16);
    bg.lineStyle(2, this.colors.goldAccent, 0.85);
    bg.strokeRoundedRect(-menuW / 2, 0, menuW, menuH, 16);
    this.contextMenu.add(bg);
    // 吞掉菜单范围内的点击，避免点穿到下面的格子
    this.contextMenu.add(this.add.rectangle(0, menuH / 2, menuW, menuH, 0, 0).setInteractive());

    this.contextMenu.add(this.add.text(0, 20,
      `${sourceSlot.equipment?.name ?? ''}  →  ${targetSlot.equipment?.name ?? ''}`, {
        fontFamily: SERIF, fontSize: '22px', color: '#f0e6d3',
      }).setOrigin(0.5, 0));

    const addBtn = (
      bx: number, by: number, w: number, h: number, label: string,
      fill: number, stroke: number, color: string, onClick: () => void,
    ) => {
      const g = this.add.graphics();
      const draw = (f: number) => {
        g.clear();
        g.fillStyle(f, 1);
        g.fillRoundedRect(bx - w / 2, by - h / 2, w, h, 10);
        g.lineStyle(2, stroke, 0.9);
        g.strokeRoundedRect(bx - w / 2, by - h / 2, w, h, 10);
      };
      draw(fill);
      const t = this.add.text(bx, by, label, {
        fontFamily: SERIF, fontSize: '26px', fontStyle: 'bold', color,
      }).setOrigin(0.5);
      const hit = this.add.rectangle(bx, by, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        pointer.event.stopPropagation();
        onClick();
      });
      this.contextMenu!.add([g, t, hit]);
      return { text: t, redraw: draw };
    };

    // 碎片开关（提高重组成功率）
    const fragments = gameState.getFragmentCount();
    const tog = addBtn(0, 96, menuW - 40, 54,
      fragments > 0 ? `不使用碎片（持有 ${fragments}）` : '没有碎片',
      0x161b22, fragments > 0 ? this.colors.goldAccent : 0x30363d,
      fragments > 0 ? '#d4a853' : '#484f58',
      () => {
        if (fragments <= 0) return;
        this.contextMenuUseFragments = !this.contextMenuUseFragments;
        tog.redraw(this.contextMenuUseFragments ? 0x14532d : 0x161b22);
        tog.text.setText(this.contextMenuUseFragments ? `✓ 使用碎片（持有 ${fragments}）` : `不使用碎片（持有 ${fragments}）`);
        tog.text.setColor(this.contextMenuUseFragments ? '#eafff0' : '#d4a853');
      });
    tog.text.setFontFamily(SANS).setFontSize(22);

    const half = (menuW - 40 - 14) / 2;
    addBtn(-half / 2 - 7, 170, half, 64, '重组', 0x1c2128, this.colors.goldAccent, '#f0e6d3', () => {
      this.closeContextMenu();
      this.performSynthesize(sourceSlot.index, targetSlot.index, this.contextMenuUseFragments);
    });
    addBtn(half / 2 + 7, 170, half, 64, '归元', 0x3d2408, this.colors.goldAccent, '#ffcf70', () => {
      this.closeContextMenu();
      this.performDevour(sourceSlot.index, targetSlot.index);
    });
    addBtn(0, 246, menuW - 40, 54, '取消', 0x21262d, 0x8b949e, '#c9d1d9', () => this.closeContextMenu());
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
      sfx.swap(equipment.wuxing);
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
      sfx.click();
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
    const { width, height } = this.view;

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

    const { width, height } = this.view;
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
    const { width, height } = this.view;
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
