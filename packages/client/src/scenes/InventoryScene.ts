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
  StatusType,
  STATUS_DEFINITIONS,
  PlayerStatus,
  getWuxingPassiveStatuses,
  WuxingPassiveStatus,
  getStatusEffectsForLevel,
  getEquipmentSkillsDisplay,
  formatSkillsText,
  getSkillDef,
} from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';
import { SynthesisSystem } from '../systems/SynthesisSystem.js';
import { uiConfig, LAYOUT } from '../config/uiConfig.js';

type PopupMode = 'view' | 'select-synthesize' | 'select-devour';

interface SlotInfo {
  type: 'inventory' | 'weapon' | 'armor' | 'treasure';
  index: number;
  equipment: Equipment | null;
}

/**
 * 灵囊管理场景 - 横屏优化 (1280x720)
 */
export class InventoryScene extends Phaser.Scene {
  private popup?: Phaser.GameObjects.Container;
  private topMessage?: Phaser.GameObjects.Container;
  private specialNotification?: Phaser.GameObjects.Container;
  private statusPopup?: Phaser.GameObjects.Container;
  private currentSlot?: SlotInfo;
  private popupMode: PopupMode = 'view';
  private firstSelectedSlot?: SlotInfo;
  private cancelButton?: Phaser.GameObjects.Container;
  private useFragmentsToggle: boolean = false;

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
    const { width, height } = this.cameras.main;

    // 全屏背景
    this.add.rectangle(width / 2, height / 2, width, height, this.colors.bgDark, 0.98);

    // 标题栏
    this.createHeader();

    // 上半部分：装备栏（武器、铠甲、灵器）
    this.createEquipmentSection();

    // 中间：状态栏
    this.createStatusBar();

    // 下半部分：背包栏
    this.createInventorySection();

    // 关闭按钮
    this.createCloseButton();

    // ESC关闭
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.statusPopup) {
        this.closeStatusPopup();
      } else if (this.popup) {
        this.closePopup();
      } else {
        this.closeScene();
      }
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

    // 玩家状态（左侧）
    const player = gameState.getPlayerState();
    this.add.text(width * 0.03, headerHeight / 2, `❤️ ${player.hp}/${player.maxHp}  ⚔️ ${gameState.getTotalAttack()}  🛡️ ${gameState.getTotalDefense()}  ⚡ ${gameState.getTotalSpeed()}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#8b949e',
    }).setOrigin(0, 0.5);

    // 碎片数量（右侧）
    const fragments = gameState.getFragmentCount();
    this.add.text(width * 0.92, headerHeight / 2, `💎 碎片: ${fragments}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#a855f7',
    }).setOrigin(1, 0.5);
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

  private createStatusBar(): void {
    const { width, height } = this.cameras.main;
    const headerHeight = height * 0.08;
    const topSectionHeight = height * 0.36;
    const sectionY = headerHeight + topSectionHeight + height * 0.02;
    const sectionHeight = height * 0.06;

    // 状态栏背景
    const sectionBg = this.add.graphics();
    sectionBg.fillStyle(this.colors.inkBlack, 0.3);
    sectionBg.fillRoundedRect(width * 0.02, sectionY, width * 0.96, sectionHeight, 6);
    sectionBg.lineStyle(1, this.colors.goldAccent, 0.3);
    sectionBg.strokeRoundedRect(width * 0.02, sectionY, width * 0.96, sectionHeight, 6);

    // 状态标题
    this.add.text(width * 0.05, sectionY + sectionHeight / 2, '状态:', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#8b949e',
    }).setOrigin(0, 0.5);

    // 获取玩家状态
    const playerStatuses = gameState.getStatuses();

    // 获取五行被动状态（统计所有装备的五行）
    const equipment = {
      weapon: gameState.getWeapon(),
      armor: gameState.getArmor(),
      treasures: gameState.getTreasures(),
    };
    const wuxingPassives = getWuxingPassiveStatuses(equipment);

    // 合并所有状态
    const allStatuses: { type: StatusType; level?: number }[] = [
      ...playerStatuses.map(s => ({ type: s.type })),
      ...wuxingPassives.map(s => ({ type: s.type, level: s.level })),
    ];

    const startX = width * 0.12;
    const labelHeight = sectionHeight * 0.7;

    if (allStatuses.length === 0) {
      // 无状态时显示提示
      this.add.text(startX, sectionY + sectionHeight / 2, '暂无特殊状态', {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontSM}px`,
        color: '#484f58',
        fontStyle: 'italic',
      }).setOrigin(0, 0.5);
    } else {
      // 计算标签布局
      const labelPadding = 8;
      let currentX = startX;

      // 显示状态标签
      allStatuses.forEach((status) => {
        const definition = STATUS_DEFINITIONS[status.type];
        if (!definition) return;

        // 计算标签宽度
        const displayText = status.level ? `${definition.icon}${definition.name}` : `${definition.icon} ${definition.name}`;
        const labelWidth = Math.max(50, displayText.length * 11 + 16);

        // 检查是否超出屏幕
        if (currentX + labelWidth > width * 0.86) return;

        const statusColor = Phaser.Display.Color.HexStringToColor(definition.color).color;

        // 状态标签背景
        const labelBg = this.add.rectangle(
          currentX + labelWidth / 2,
          sectionY + sectionHeight / 2,
          labelWidth,
          labelHeight,
          statusColor,
          0.2
        );
        labelBg.setStrokeStyle(1, statusColor, 0.6);
        labelBg.setInteractive({ useHandCursor: true });

        // 状态图标和名称
        const labelText = this.add.text(
          currentX + labelWidth / 2,
          sectionY + sectionHeight / 2,
          displayText,
          {
            fontFamily: '"Noto Sans SC", sans-serif',
            fontSize: `${uiConfig.fontXS}px`,
            color: definition.color,
            fontStyle: 'bold',
          }
        ).setOrigin(0.5);

        // 点击事件（传递等级）
        labelBg.on('pointerup', () => this.showStatusPopup(status.type, status.level));
        labelBg.on('pointerover', () => {
          labelBg.setFillStyle(statusColor, 0.4);
        });
        labelBg.on('pointerout', () => {
          labelBg.setFillStyle(statusColor, 0.2);
        });

        currentX += labelWidth + labelPadding;
      });
    }

    // 显示五行收集进度提示（如果没有五行圆满）
    if (!gameState.hasStatus(StatusType.WUXING_MASTERY)) {
      const treasures = gameState.getTreasures();
      const uniqueWuxings = new Set(
        treasures.map(t => t.wuxing).filter((w): w is Wuxing => w !== undefined)
      );
      const collected = uniqueWuxings.size;

      if (collected > 0 && collected < 5) {
        this.add.text(width * 0.88, sectionY + sectionHeight / 2, `五行进度: ${collected}/5`, {
          fontFamily: '"Noto Sans SC", sans-serif',
          fontSize: `${uiConfig.fontXS}px`,
          color: '#8b949e',
        }).setOrigin(1, 0.5);
      }
    }
  }

  private showStatusPopup(statusType: StatusType, level?: number): void {
    this.closeStatusPopup();

    const definition = STATUS_DEFINITIONS[statusType];
    if (!definition) return;

    const { width, height } = this.cameras.main;

    this.statusPopup = this.add.container(width / 2, height / 2);

    // 背景遮罩
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7);
    overlay.setInteractive();
    overlay.on('pointerup', () => this.closeStatusPopup());
    this.statusPopup.add(overlay);

    // 弹窗尺寸
    const panelWidth = Math.max(400, Math.min(500, width * 0.45));
    const panelHeight = Math.max(280, Math.min(350, height * 0.5));
    const statusColor = Phaser.Display.Color.HexStringToColor(definition.color).color;

    // 弹窗背景
    const panel = this.add.graphics();
    panel.fillStyle(this.colors.inkBlack, 0.98);
    panel.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
    panel.lineStyle(3, statusColor, 0.9);
    panel.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
    this.statusPopup.add(panel);

    // 图标
    const iconBg = this.add.circle(0, -panelHeight * 0.28, 35, statusColor, 0.2);
    iconBg.setStrokeStyle(2, statusColor, 0.8);
    this.statusPopup.add(iconBg);

    const iconText = this.add.text(0, -panelHeight * 0.28, definition.icon, {
      fontSize: `${uiConfig.font2XL}px`,
    }).setOrigin(0.5);
    this.statusPopup.add(iconText);

    // 标题（显示等级）
    const titleStr = level ? `${definition.name} Lv.${level}` : definition.name;
    const titleText = this.add.text(0, -panelHeight * 0.12, titleStr, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontXL}px`,
      color: definition.color,
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.statusPopup.add(titleText);

    // 描述
    const descText = this.add.text(0, panelHeight * 0.02, definition.description, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: '#8b949e',
      wordWrap: { width: panelWidth * 0.85 },
      align: 'center',
    }).setOrigin(0.5, 0);
    this.statusPopup.add(descText);

    // 效果列表（根据等级获取具体效果）
    const effects = level
      ? getStatusEffectsForLevel(statusType, level)
      : definition.effects;

    let effectY = panelHeight * 0.15;
    const effectsTitle = this.add.text(-panelWidth * 0.38, effectY, '当前效果:', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#d4a853',
      fontStyle: 'bold',
    }).setOrigin(0, 0);
    this.statusPopup.add(effectsTitle);

    effectY += uiConfig.fontSM + 8;

    effects.forEach((effect) => {
      const effectText = this.add.text(-panelWidth * 0.35, effectY, `• ${effect}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontSM}px`,
        color: '#3fb950',
      }).setOrigin(0, 0);
      this.statusPopup!.add(effectText);
      effectY += uiConfig.fontSM + 6;
    });

    // 关闭按钮
    const closeBtnY = panelHeight / 2 - 30;
    const closeBtn = this.add.rectangle(0, closeBtnY, 100, 36, this.colors.inkGrey);
    closeBtn.setStrokeStyle(2, statusColor, 0.5);
    closeBtn.setInteractive({ useHandCursor: true });

    const closeBtnText = this.add.text(0, closeBtnY, '关闭', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: '#f0e6d3',
    }).setOrigin(0.5);

    this.statusPopup.add([closeBtn, closeBtnText]);

    closeBtn.on('pointerover', () => closeBtn.setFillStyle(statusColor, 0.5));
    closeBtn.on('pointerout', () => closeBtn.setFillStyle(this.colors.inkGrey));
    closeBtn.on('pointerup', () => this.closeStatusPopup());

    // 入场动画
    this.statusPopup.setAlpha(0);
    this.statusPopup.setScale(0.9);
    this.tweens.add({
      targets: this.statusPopup,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });
  }

  private closeStatusPopup(): void {
    if (this.statusPopup) {
      this.statusPopup.destroy();
      this.statusPopup = undefined;
    }
  }

  private showSkillDetail(skillName: string, skillDescription: string): void {
    this.closeStatusPopup();

    const { width, height } = this.cameras.main;

    this.statusPopup = this.add.container(width / 2, height / 2);

    // 背景遮罩
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.7);
    overlay.setInteractive();
    overlay.on('pointerup', () => this.closeStatusPopup());
    this.statusPopup.add(overlay);

    // 弹窗尺寸
    const panelWidth = Math.max(320, Math.min(400, width * 0.35));
    const panelHeight = Math.max(180, Math.min(220, height * 0.32));

    // 弹窗背景
    const panel = this.add.graphics();
    panel.fillStyle(this.colors.inkBlack, 0.98);
    panel.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
    panel.lineStyle(3, this.colors.goldAccent, 0.9);
    panel.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
    this.statusPopup.add(panel);

    // 技能名称
    const titleText = this.add.text(0, -panelHeight * 0.28, `【${skillName}】`, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontLG}px`,
      color: '#d4a853',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.statusPopup.add(titleText);

    // 技能描述
    const descText = this.add.text(0, panelHeight * 0.02, skillDescription, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: '#f0e6d3',
      wordWrap: { width: panelWidth * 0.85 },
      align: 'center',
    }).setOrigin(0.5);
    this.statusPopup.add(descText);

    // 关闭按钮
    const closeBtnY = panelHeight / 2 - 30;
    const closeBtn = this.add.rectangle(0, closeBtnY, 80, 32, this.colors.inkGrey);
    closeBtn.setStrokeStyle(2, this.colors.goldAccent, 0.5);
    closeBtn.setInteractive({ useHandCursor: true });

    const closeBtnText = this.add.text(0, closeBtnY, '关闭', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#f0e6d3',
    }).setOrigin(0.5);

    this.statusPopup.add([closeBtn, closeBtnText]);

    closeBtn.on('pointerover', () => closeBtn.setFillStyle(this.colors.goldAccent, 0.8));
    closeBtn.on('pointerout', () => closeBtn.setFillStyle(this.colors.inkGrey));
    closeBtn.on('pointerup', () => this.closeStatusPopup());

    // 入场动画
    this.statusPopup.setAlpha(0);
    this.statusPopup.setScale(0.9);
    this.tweens.add({
      targets: this.statusPopup,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 200,
      ease: 'Back.easeOut',
    });
  }

  private createInventorySection(): void {
    const { width, height } = this.cameras.main;
    const headerHeight = height * 0.08;
    const topSectionHeight = height * 0.36;
    const statusBarHeight = height * 0.08;
    const sectionY = headerHeight + topSectionHeight + statusBarHeight + height * 0.04;
    const sectionHeight = height * 0.38;

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

    bg.on('pointerup', () => this.handleSlotClick(slotInfo));
    bg.on('pointerover', () => bg.setStrokeStyle(2, this.colors.goldAccent, 1));
    bg.on('pointerout', () => bg.setStrokeStyle(2, borderColor, equipment ? 0.8 : 0.3));
  }

  private getTypeIcon(type: EquipmentType): string {
    switch (type) {
      case EquipmentType.WEAPON: return '⚔️';
      case EquipmentType.ARMOR: return '🛡️';
      case EquipmentType.TREASURE: return '💎';
    }
  }

  private handleSlotClick(slotInfo: SlotInfo): void {
    if (this.popupMode === 'select-synthesize' || this.popupMode === 'select-devour') {
      if (slotInfo.type === 'inventory' && slotInfo.equipment && this.firstSelectedSlot) {
        if (slotInfo.type === this.firstSelectedSlot.type && slotInfo.index === this.firstSelectedSlot.index) {
          return;
        }
        this.performAction(slotInfo);
      }
      return;
    }

    if (slotInfo.equipment) {
      this.showPopup(slotInfo);
    }
  }

  private showPopup(slotInfo: SlotInfo): void {
    this.closePopup();
    this.currentSlot = slotInfo;
    this.popupMode = 'view';

    const { width, height } = this.cameras.main;
    const equipment = slotInfo.equipment!;

    this.popup = this.add.container(width / 2, height / 2);

    // 背景遮罩
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.6);
    overlay.setInteractive();
    overlay.on('pointerup', () => this.closePopup());
    this.popup.add(overlay);

    // 响应式尺寸 - 更大的弹窗
    const panelWidth = Math.max(500, Math.min(700, width * 0.58));
    const panelHeight = Math.max(350, Math.min(450, height * 0.65));
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
    const icon = this.add.circle(iconX, -panelHeight * 0.08, iconRadius, color);
    icon.setStrokeStyle(4, 0xffffff, 0.6);
    this.popup.add(icon);

    const levelStr = equipment.wuxing !== undefined ? `${equipment.wuxingLevel ?? 1}` : '-';
    const levelText = this.add.text(iconX, -panelHeight * 0.08, levelStr, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontXL}px`,
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.popup.add(levelText);

    // 类型图标
    const typeIcon = this.getTypeIcon(equipment.type);
    const typeIconText = this.add.text(iconX, panelHeight * 0.1, typeIcon, {
      fontSize: `${uiConfig.fontXL}px`,
    }).setOrigin(0.5);
    this.popup.add(typeIconText);

    // 右侧：文字信息
    let yOffset = -panelHeight * 0.32;

    // 名称
    const nameText = this.add.text(textX, yOffset, equipment.name, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontXL}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.popup.add(nameText);

    yOffset += uiConfig.fontXL + 12;

    // 类型 + 稀有度
    const typeAndRarity = `${this.getEquipmentTypeName(equipment.type)} · ${this.getRarityName(equipment.rarity)}`;
    const typeRarityText = this.add.text(textX, yOffset, typeAndRarity, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontLG}px`,
      color: this.getRarityColor(equipment.rarity),
    }).setOrigin(0, 0.5);
    this.popup.add(typeRarityText);

    yOffset += uiConfig.fontLG + 10;

    // 五行属性
    const wuxingName = equipment.wuxing !== undefined ? WUXING_NAMES[equipment.wuxing] : '无';
    const wuxingLevelStr = equipment.wuxing !== undefined ? ` Lv.${equipment.wuxingLevel ?? 1}` : '';
    const wuxingText = this.add.text(textX, yOffset, `${wuxingName}属性${wuxingLevelStr}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontLG}px`,
      color: '#' + color.toString(16).padStart(6, '0'),
    }).setOrigin(0, 0.5);
    this.popup.add(wuxingText);

    yOffset += uiConfig.fontLG + 10;

    // 攻防速血
    const stats: string[] = [];
    if (equipment.attack) stats.push(`攻击 +${equipment.attack}`);
    if (equipment.defense) stats.push(`防御 +${equipment.defense}`);
    if (equipment.speed) stats.push(`速度 +${equipment.speed}`);
    if (equipment.hp) stats.push(`血量 +${equipment.hp}`);
    if (stats.length > 0) {
      const statsText = this.add.text(textX, yOffset, stats.join('   '), {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontMD}px`,
        color: '#f0e6d3',
        wordWrap: { width: textWidth },
      }).setOrigin(0, 0.5);
      this.popup.add(statsText);
      yOffset += uiConfig.fontMD + 10;
    }

    // 技能（显示为图标，点击查看详情）
    const skills = getEquipmentSkillsDisplay(equipment, equipment.wuxingLevel ?? 1);
    if (skills.length > 0) {
      yOffset += 10;
      const iconSize = 28;
      const iconSpacing = 10;
      let iconX = textX;

      for (const skill of skills) {
        // 技能图标
        const skillColor = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0xd4a853;
        const iconBg = this.add.circle(iconX + iconSize / 2, yOffset, iconSize / 2, skillColor, 0.9);
        iconBg.setStrokeStyle(2, 0xffffff, 0.5);
        this.popup.add(iconBg);

        // 技能首字
        const skillChar = this.add.text(iconX + iconSize / 2, yOffset, skill.name.charAt(0), {
          fontFamily: '"Noto Sans SC", sans-serif',
          fontSize: '14px',
          color: '#ffffff',
          fontStyle: 'bold',
        }).setOrigin(0.5);
        this.popup.add(skillChar);

        // 点击显示详情
        iconBg.setInteractive({ useHandCursor: true });
        iconBg.on('pointerup', () => {
          this.showSkillDetail(skill.name, skill.description);
        });

        iconX += iconSize + iconSpacing;
      }
      yOffset += iconSize + 10;
    }

    // 按钮区域
    const btnY = panelHeight / 2 - panelHeight * 0.15;
    const btnWidth = Math.max(100, Math.min(130, panelWidth * 0.2));
    const btnHeight = Math.max(42, Math.min(55, height * 0.08));
    const btnSpacing = btnWidth * 1.2;

    if (slotInfo.type === 'inventory') {
      this.createPopupButton(-btnSpacing, btnY, '装备', () => this.equipItem(slotInfo), btnWidth, btnHeight, uiConfig.fontMD);
      this.createPopupButton(0, btnY, '重组', () => this.startSynthesizeMode(slotInfo), btnWidth, btnHeight, uiConfig.fontMD);
      this.createPopupButton(btnSpacing, btnY, '归元', () => this.startDevourMode(slotInfo), btnWidth, btnHeight, uiConfig.fontMD);
    } else {
      this.createPopupButton(0, btnY, '卸下', () => this.unequipItem(slotInfo), btnWidth, btnHeight, uiConfig.fontMD);
    }
  }

  private createPopupButton(x: number, y: number, text: string, onClick: () => void, btnWidth: number = 85, btnHeight: number = 38, fontSize: number = 15): void {
    if (!this.popup) return;

    const bg = this.add.rectangle(x, y, btnWidth, btnHeight, this.colors.inkGrey);
    bg.setStrokeStyle(2, this.colors.goldAccent, 0.5);
    bg.setInteractive({ useHandCursor: true });

    const btnText = this.add.text(x, y, text, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${fontSize}px`,
      color: '#f0e6d3',
    }).setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(this.colors.goldAccent);
      btnText.setColor('#0d1117');
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(this.colors.inkGrey);
      btnText.setColor('#f0e6d3');
    });

    bg.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      pointer.event.stopPropagation();
      onClick();
    });

    this.popup.add([bg, btnText]);
  }

  private closePopup(): void {
    if (this.popup) {
      this.popup.destroy();
      this.popup = undefined;
    }
    this.currentSlot = undefined;
    // 不重置 popupMode 和 firstSelectedSlot，让消息和弹窗独立
  }

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
      // 立即刷新界面
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
      this.showTopMessage(`卸下了 ${equipment.name}`, '#3fb950');
      // 立即刷新界面
      this.scene.restart();
    } else {
      this.showTopMessage('卸下失败', '#f85149');
    }
  }

  private startSynthesizeMode(slotInfo: SlotInfo): void {
    this.closePopup();
    this.popupMode = 'select-synthesize';
    this.firstSelectedSlot = slotInfo;
    this.showSynthesizeOptions();
  }

  private showSynthesizeOptions(): void {
    const { width, height } = this.cameras.main;
    const fragments = gameState.getFragmentCount();

    // 显示选择提示和碎片开关
    this.showTopMessage(`选择辅器物进行重组 (碎片: ${fragments})`, '#d4a853', false);
    this.showCancelButton(true); // 始终显示碎片开关
  }

  private startDevourMode(slotInfo: SlotInfo): void {
    this.closePopup();
    this.popupMode = 'select-devour';
    this.firstSelectedSlot = slotInfo;
    this.showTopMessage('选择要归元的器物', '#d4a853', false);
    this.showCancelButton(false);
  }

  private showCancelButton(showFragmentToggle: boolean): void {
    this.hideCancelButton();

    const { width, height } = this.cameras.main;
    const btnWidth = Math.max(100, Math.min(130, width * 0.11));
    const btnHeight = Math.max(36, Math.min(46, height * 0.065));

    // 按钮放在消息下方（消息在 height * 0.50，按钮在 height * 0.56）
    this.cancelButton = this.add.container(width / 2, height * 0.56);

    // 取消按钮
    const cancelBtnX = showFragmentToggle ? -width * 0.1 : 0;
    const cancelBg = this.add.rectangle(cancelBtnX, 0, btnWidth, btnHeight, this.colors.redAccent);
    cancelBg.setStrokeStyle(2, 0xffffff, 0.5);
    cancelBg.setInteractive({ useHandCursor: true });

    const cancelText = this.add.text(cancelBtnX, 0, '取消', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.cancelButton.add([cancelBg, cancelText]);

    cancelBg.on('pointerover', () => cancelBg.setFillStyle(0xff6b6b));
    cancelBg.on('pointerout', () => cancelBg.setFillStyle(this.colors.redAccent));
    cancelBg.on('pointerup', () => this.cancelSelectionMode());

    // 碎片开关（仅合成模式）
    if (showFragmentToggle) {
      const fragments = gameState.getFragmentCount();

      const getToggleText = (useFragments: boolean) => {
        if (fragments === 0) {
          return '无碎片';
        }
        return useFragments ? '✓ 使用碎片' : '不使用碎片';
      };

      const toggleWidth = Math.max(130, Math.min(160, width * 0.14));
      const toggleBg = this.add.rectangle(width * 0.1, 0, toggleWidth, btnHeight, this.useFragmentsToggle ? this.colors.greenAccent : this.colors.inkGrey);
      toggleBg.setStrokeStyle(2, this.colors.goldAccent, 0.5);
      toggleBg.setInteractive({ useHandCursor: true });

      const toggleText = this.add.text(width * 0.12, 0, getToggleText(this.useFragmentsToggle), {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontSM}px`,
        color: '#f0e6d3',
      }).setOrigin(0.5);

      this.cancelButton.add([toggleBg, toggleText]);

      // 有碎片时才允许点击
      if (fragments > 0) {
        toggleBg.on('pointerup', () => {
          this.useFragmentsToggle = !this.useFragmentsToggle;
          toggleBg.setFillStyle(this.useFragmentsToggle ? this.colors.greenAccent : this.colors.inkGrey);
          toggleText.setText(getToggleText(this.useFragmentsToggle));
        });
      }
    }
  }

  private hideCancelButton(): void {
    if (this.cancelButton) {
      this.cancelButton.destroy();
      this.cancelButton = undefined;
    }
  }

  private cancelSelectionMode(): void {
    this.closeTopMessage();
    this.hideCancelButton();
    this.popupMode = 'view';
    this.firstSelectedSlot = undefined;
    this.useFragmentsToggle = false;
  }

  private performAction(secondSlot: SlotInfo): void {
    if (!this.firstSelectedSlot || secondSlot.type !== 'inventory') return;

    const firstIndex = this.firstSelectedSlot.index;
    const secondIndex = secondSlot.index;

    this.closeTopMessage();
    this.hideCancelButton();

    if (this.popupMode === 'select-synthesize') {
      const result = SynthesisSystem.synthesize(firstIndex, secondIndex, this.useFragmentsToggle);

      if (result.isSpecial && result.result) {
        this.showSpecialSynthesisNotification(result.result);
      } else {
        this.showTopMessage(result.message, result.success ? '#3fb950' : '#f85149');
        this.time.delayedCall(1500, () => this.scene.restart());
      }
    } else {
      const result = SynthesisSystem.devour(firstIndex, secondIndex);
      this.showTopMessage(result.message, result.success ? '#3fb950' : '#f85149');
      this.time.delayedCall(1500, () => this.scene.restart());
    }

    this.popupMode = 'view';
    this.firstSelectedSlot = undefined;
    this.useFragmentsToggle = false;
  }

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
      scaleX: 1.5,
      scaleY: 1.5,
      alpha: 0.3,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const title = this.add.text(0, -100, '✨ 神器出世 ✨', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.font2XL}px`,
      color: '#d4a853',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.specialNotification.add(title);

    const iconColor = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0x8b949e;
    const icon = this.add.circle(0, -20, 40, iconColor);
    icon.setStrokeStyle(4, 0xffffff, 0.8);
    this.specialNotification.add(icon);

    const wuxingSymbol = equipment.wuxing !== undefined ? this.getWuxingSymbol(equipment.wuxing) : '神';
    const symbolText = this.add.text(0, -20, wuxingSymbol, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontXL}px`,
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.specialNotification.add(symbolText);

    const nameText = this.add.text(0, 50, equipment.name, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontLG}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.specialNotification.add(nameText);

    const rarityText = this.add.text(0, 85, this.getRarityName(equipment.rarity), {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: this.getRarityColor(equipment.rarity),
    }).setOrigin(0.5);
    this.specialNotification.add(rarityText);

    const specialSkills = getEquipmentSkillsDisplay(equipment, equipment.wuxingLevel ?? 1);
    if (specialSkills.length > 0) {
      const skillsText = specialSkills.map(s => `【${s.name}】${s.description}`).join('\n');
      const skillText = this.add.text(0, 115, skillsText, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontXS}px`,
        color: '#d4a853',
        wordWrap: { width: 280 },
        align: 'center',
      }).setOrigin(0.5, 0);
      this.specialNotification.add(skillText);
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
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 400,
      ease: 'Back.easeOut',
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
      case Wuxing.WOOD: return '木';
      case Wuxing.WATER: return '水';
      case Wuxing.FIRE: return '火';
      case Wuxing.EARTH: return '土';
      default: return '?';
    }
  }

  // 顶部消息（与弹窗独立）
  private showTopMessage(message: string, color: string = '#f0e6d3', autoHide: boolean = true): void {
    this.closeTopMessage();

    const { width, height } = this.cameras.main;
    const msgWidth = Math.max(400, Math.min(650, width * 0.55));
    const msgHeight = Math.max(50, Math.min(60, height * 0.085));

    // 放在装备区和背包区之间（按钮会在下方）
    this.topMessage = this.add.container(width / 2, height * 0.50);

    const bg = this.add.graphics();
    bg.fillStyle(this.colors.inkBlack, 0.98);
    bg.fillRoundedRect(-msgWidth / 2, -msgHeight / 2, msgWidth, msgHeight, 8);
    bg.lineStyle(2, this.colors.goldAccent, 0.8);
    bg.strokeRoundedRect(-msgWidth / 2, -msgHeight / 2, msgWidth, msgHeight, 8);
    this.topMessage.add(bg);

    const text = this.add.text(0, 0, message, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: color,
      align: 'center',
    }).setOrigin(0.5);
    this.topMessage.add(text);

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

  private getRarityName(rarity: Rarity): string {
    switch (rarity) {
      case Rarity.COMMON: return '普通';
      case Rarity.UNCOMMON: return '优秀';
      case Rarity.RARE: return '稀有';
      case Rarity.EPIC: return '史诗';
      case Rarity.LEGENDARY: return '传说';
      default: return '普通';
    }
  }

  private getRarityColor(rarity: Rarity): string {
    switch (rarity) {
      case Rarity.COMMON: return '#8b949e';
      case Rarity.UNCOMMON: return '#3fb950';
      case Rarity.RARE: return '#58a6ff';
      case Rarity.EPIC: return '#a855f7';
      case Rarity.LEGENDARY: return '#d4a853';
      default: return '#8b949e';
    }
  }

  private getRarityBorderColor(rarity: Rarity): number {
    switch (rarity) {
      case Rarity.COMMON: return 0x8b949e;
      case Rarity.UNCOMMON: return 0x3fb950;
      case Rarity.RARE: return 0x58a6ff;
      case Rarity.EPIC: return 0xa855f7;
      case Rarity.LEGENDARY: return 0xd4a853;
      default: return 0x8b949e;
    }
  }

  private getEquipmentTypeName(type: EquipmentType): string {
    switch (type) {
      case EquipmentType.WEAPON: return '武器';
      case EquipmentType.ARMOR: return '铠甲';
      case EquipmentType.TREASURE: return '灵器';
      default: return '器物';
    }
  }

  private createCloseButton(): void {
    const { width, height } = this.cameras.main;
    const headerHeight = height * 0.08;

    // 使用更大的点击区域
    const btnSize = Math.max(44, headerHeight * 0.9);
    const btnX = width - btnSize / 2 - 10;
    const btnY = headerHeight / 2;

    // 点击区域背景
    const hitArea = this.add.rectangle(btnX, btnY, btnSize, btnSize, this.colors.inkGrey, 0.5);
    hitArea.setStrokeStyle(1, this.colors.goldAccent, 0.3);
    hitArea.setInteractive({ useHandCursor: true });

    const closeText = this.add.text(btnX, btnY, '✕', {
      fontFamily: 'Arial',
      fontSize: `${uiConfig.fontXL}px`,
      color: '#8b949e',
    }).setOrigin(0.5);

    hitArea.on('pointerover', () => {
      hitArea.setFillStyle(this.colors.redAccent, 0.8);
      closeText.setColor('#ffffff');
    });
    hitArea.on('pointerout', () => {
      hitArea.setFillStyle(this.colors.inkGrey, 0.5);
      closeText.setColor('#8b949e');
    });
    hitArea.on('pointerup', () => this.closeScene());
  }

  private closeScene(): void {
    this.scene.stop();
    // MapScene 会在 shutdown 事件中处理刷新
  }
}
