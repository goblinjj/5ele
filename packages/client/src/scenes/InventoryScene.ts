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
} from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';
import { SynthesisSystem } from '../systems/SynthesisSystem.js';

type PopupMode = 'view' | 'select-synthesize' | 'select-devour';

interface SlotInfo {
  type: 'inventory' | 'weapon' | 'armor' | 'treasure';
  index: number;
  equipment: Equipment | null;
}

/**
 * 背包管理场景 - 横屏优化 (1280x720)
 */
export class InventoryScene extends Phaser.Scene {
  private popup?: Phaser.GameObjects.Container;
  private topMessage?: Phaser.GameObjects.Container;
  private specialNotification?: Phaser.GameObjects.Container;
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

    // 上半部分：装备栏（武器、铠甲、法宝）
    this.createEquipmentSection();

    // 下半部分：背包栏
    this.createInventorySection();

    // 关闭按钮
    this.createCloseButton();

    // ESC关闭
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.popup) {
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
    const titleSize = Math.max(18, Math.min(26, width * 0.022));
    this.add.text(width / 2, headerHeight / 2, '背包管理', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${titleSize}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 玩家状态（左侧）
    const player = gameState.getPlayerState();
    const statsFontSize = Math.max(11, Math.min(15, width * 0.013));
    this.add.text(width * 0.03, headerHeight / 2, `❤️ ${player.hp}/${player.maxHp}  ⚔️ ${gameState.getTotalAttack()}  🛡️ ${gameState.getTotalDefense()}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${statsFontSize}px`,
      color: '#8b949e',
    }).setOrigin(0, 0.5);

    // 碎片数量（右侧）
    const fragments = gameState.getFragmentCount();
    this.add.text(width * 0.92, headerHeight / 2, `💎 碎片: ${fragments}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${statsFontSize}px`,
      color: '#a855f7',
    }).setOrigin(1, 0.5);
  }

  private createEquipmentSection(): void {
    const { width, height } = this.cameras.main;
    const headerHeight = height * 0.08;
    const sectionY = headerHeight + height * 0.02;
    const sectionHeight = height * 0.42;

    // 装备区域背景
    const sectionBg = this.add.graphics();
    sectionBg.fillStyle(this.colors.inkBlack, 0.5);
    sectionBg.fillRoundedRect(width * 0.02, sectionY, width * 0.96, sectionHeight, 8);
    sectionBg.lineStyle(1, this.colors.inkGrey, 0.5);
    sectionBg.strokeRoundedRect(width * 0.02, sectionY, width * 0.96, sectionHeight, 8);

    // 槽位大小 - 更大以填充空间
    const slotSize = Math.max(70, Math.min(90, height * 0.14));
    const fontSize = Math.max(12, Math.min(16, width * 0.014));
    const labelFontSize = Math.max(11, Math.min(14, width * 0.012));

    // === 左侧：武器和铠甲 ===
    const leftStartX = width * 0.08;
    const equipY = sectionY + sectionHeight * 0.5;

    // 武器
    this.add.text(leftStartX, equipY - slotSize * 0.7, '武器', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${labelFontSize}px`,
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
      fontSize: `${labelFontSize}px`,
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

    // === 右侧：法宝 ===
    const treasureStartX = width * 0.35;
    const treasures = gameState.getTreasures();

    // 法宝标题
    this.add.text(treasureStartX, sectionY + 15, '法宝栏', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${labelFontSize}px`,
      color: '#d4a853',
      fontStyle: 'bold',
    });

    // 6个法宝槽位，一行显示
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
    const topSectionHeight = height * 0.42;
    const sectionY = headerHeight + topSectionHeight + height * 0.04;
    const sectionHeight = height * 0.40;

    // 背包区域背景
    const sectionBg = this.add.graphics();
    sectionBg.fillStyle(this.colors.inkBlack, 0.5);
    sectionBg.fillRoundedRect(width * 0.02, sectionY, width * 0.96, sectionHeight, 8);
    sectionBg.lineStyle(1, this.colors.inkGrey, 0.5);
    sectionBg.strokeRoundedRect(width * 0.02, sectionY, width * 0.96, sectionHeight, 8);

    const fontSize = Math.max(12, Math.min(16, width * 0.014));
    const labelFontSize = Math.max(11, Math.min(14, width * 0.012));

    // 分区标题
    const usedSlots = INVENTORY_SIZE - gameState.getEmptySlotCount();
    this.add.text(width * 0.05, sectionY + 15, `背包 (${usedSlots}/${INVENTORY_SIZE})`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${labelFontSize}px`,
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

      if (equipment.skill) {
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

    // 响应式字体 - 更大
    const titleFontSize = Math.max(24, Math.min(32, width * 0.028));
    const labelFontSize = Math.max(18, Math.min(24, width * 0.02));
    const textFontSize = Math.max(16, Math.min(22, width * 0.018));
    const iconRadius = Math.max(50, Math.min(70, panelHeight * 0.16));

    const panel = this.add.graphics();
    panel.fillStyle(this.colors.inkBlack, 0.98);
    panel.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
    panel.lineStyle(3, borderColor, 0.9);
    panel.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
    this.popup.add(panel);

    // 左右布局：左侧图标，右侧文字
    const iconX = -panelWidth * 0.3;
    const textX = panelWidth * 0.05;
    const textWidth = panelWidth * 0.55;
    const color = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0x8b949e;

    // 左侧：装备图标
    const icon = this.add.circle(iconX, -panelHeight * 0.08, iconRadius, color);
    icon.setStrokeStyle(4, 0xffffff, 0.6);
    this.popup.add(icon);

    const levelStr = equipment.wuxing !== undefined ? `${equipment.wuxingLevel ?? 1}` : '-';
    const levelText = this.add.text(iconX, -panelHeight * 0.08, levelStr, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${titleFontSize + 4}px`,
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.popup.add(levelText);

    // 类型图标
    const typeIcon = this.getTypeIcon(equipment.type);
    const typeIconText = this.add.text(iconX, panelHeight * 0.1, typeIcon, {
      fontSize: `${iconRadius * 0.5}px`,
    }).setOrigin(0.5);
    this.popup.add(typeIconText);

    // 右侧：文字信息
    let yOffset = -panelHeight * 0.32;

    // 名称
    const nameText = this.add.text(textX, yOffset, equipment.name, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${titleFontSize}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    this.popup.add(nameText);

    yOffset += titleFontSize + 12;

    // 类型 + 稀有度
    const typeAndRarity = `${this.getEquipmentTypeName(equipment.type)} · ${this.getRarityName(equipment.rarity)}`;
    const typeRarityText = this.add.text(textX, yOffset, typeAndRarity, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${labelFontSize}px`,
      color: this.getRarityColor(equipment.rarity),
    }).setOrigin(0, 0.5);
    this.popup.add(typeRarityText);

    yOffset += labelFontSize + 10;

    // 五行属性
    const wuxingName = equipment.wuxing !== undefined ? WUXING_NAMES[equipment.wuxing] : '无';
    const wuxingLevelStr = equipment.wuxing !== undefined ? ` Lv.${equipment.wuxingLevel ?? 1}` : '';
    const wuxingText = this.add.text(textX, yOffset, `${wuxingName}属性${wuxingLevelStr}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${labelFontSize}px`,
      color: '#' + color.toString(16).padStart(6, '0'),
    }).setOrigin(0, 0.5);
    this.popup.add(wuxingText);

    yOffset += labelFontSize + 10;

    // 攻防
    const stats: string[] = [];
    if (equipment.attack) stats.push(`攻击 +${equipment.attack}`);
    if (equipment.defense) stats.push(`防御 +${equipment.defense}`);
    if (stats.length > 0) {
      const statsText = this.add.text(textX, yOffset, stats.join('   '), {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${textFontSize}px`,
        color: '#f0e6d3',
      }).setOrigin(0, 0.5);
      this.popup.add(statsText);
      yOffset += textFontSize + 10;
    }

    // 技能
    if (equipment.skill) {
      yOffset += 5;
      const skillNameText = this.add.text(textX, yOffset, `【${equipment.skill.name}】`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${labelFontSize}px`,
        color: '#d4a853',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      this.popup.add(skillNameText);

      yOffset += labelFontSize + 8;
      const skillDescText = this.add.text(textX, yOffset, equipment.skill.description, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${textFontSize - 2}px`,
        color: '#8b949e',
        wordWrap: { width: textWidth },
      }).setOrigin(0, 0);
      this.popup.add(skillDescText);
    }

    // 按钮区域
    const btnY = panelHeight / 2 - panelHeight * 0.15;
    const btnWidth = Math.max(100, Math.min(130, panelWidth * 0.2));
    const btnHeight = Math.max(42, Math.min(55, height * 0.08));
    const btnSpacing = btnWidth * 1.2;
    const btnFontSize = Math.max(16, Math.min(20, width * 0.017));

    if (slotInfo.type === 'inventory') {
      this.createPopupButton(-btnSpacing, btnY, '装备', () => this.equipItem(slotInfo), btnWidth, btnHeight, btnFontSize);
      this.createPopupButton(0, btnY, '合成', () => this.startSynthesizeMode(slotInfo), btnWidth, btnHeight, btnFontSize);
      this.createPopupButton(btnSpacing, btnY, '吞噬', () => this.startDevourMode(slotInfo), btnWidth, btnHeight, btnFontSize);
    } else {
      this.createPopupButton(0, btnY, '卸下', () => this.unequipItem(slotInfo), btnWidth, btnHeight, btnFontSize);
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
          this.showTopMessage('法宝栏已满！', '#f85149');
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
      this.showTopMessage('背包已满！', '#f85149');
      return;
    }

    let success = false;
    if (slotInfo.type === 'weapon') {
      const weapon = gameState.getWeapon();
      if (weapon) {
        gameState.addToInventory(weapon);
        gameState.getPlayerState().equipment.weapon = null;
        success = true;
      }
    } else if (slotInfo.type === 'armor') {
      const armor = gameState.getArmor();
      if (armor) {
        gameState.addToInventory(armor);
        gameState.getPlayerState().equipment.armor = null;
        success = true;
      }
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

    // 显示选择提示和碎片开关（始终显示开关）
    this.showTopMessage(`选择另一件装备进行合成 (碎片: ${fragments})`, '#d4a853', false);
    this.showCancelButton(true); // 始终显示碎片开关
  }

  private startDevourMode(slotInfo: SlotInfo): void {
    this.closePopup();
    this.popupMode = 'select-devour';
    this.firstSelectedSlot = slotInfo;
    this.showTopMessage('选择要吞噬的装备', '#d4a853', false);
    this.showCancelButton(false);
  }

  private showCancelButton(showFragmentToggle: boolean): void {
    this.hideCancelButton();

    const { width, height } = this.cameras.main;
    const btnWidth = Math.max(100, Math.min(130, width * 0.11));
    const btnHeight = Math.max(36, Math.min(46, height * 0.065));
    const fontSize = Math.max(14, Math.min(17, width * 0.015));

    // 按钮放在消息下方（消息在 height * 0.50，按钮在 height * 0.56）
    this.cancelButton = this.add.container(width / 2, height * 0.56);

    // 取消按钮
    const cancelBtnX = showFragmentToggle ? -width * 0.1 : 0;
    const cancelBg = this.add.rectangle(cancelBtnX, 0, btnWidth, btnHeight, this.colors.redAccent);
    cancelBg.setStrokeStyle(2, 0xffffff, 0.5);
    cancelBg.setInteractive({ useHandCursor: true });

    const cancelText = this.add.text(cancelBtnX, 0, '取消', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${fontSize}px`,
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
        fontSize: `${fontSize - 1}px`,
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
      fontSize: '32px',
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
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.specialNotification.add(symbolText);

    const nameText = this.add.text(0, 50, equipment.name, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '24px',
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.specialNotification.add(nameText);

    const rarityText = this.add.text(0, 85, this.getRarityName(equipment.rarity), {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
      color: this.getRarityColor(equipment.rarity),
    }).setOrigin(0.5);
    this.specialNotification.add(rarityText);

    if (equipment.skill) {
      const skillText = this.add.text(0, 115, `【${equipment.skill.name}】${equipment.skill.description}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '12px',
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
      fontSize: '16px',
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
    const fontSize = Math.max(15, Math.min(20, width * 0.017));

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
      fontSize: `${fontSize}px`,
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
      case EquipmentType.TREASURE: return '法宝';
      default: return '装备';
    }
  }

  private createCloseButton(): void {
    const { width, height } = this.cameras.main;
    const headerHeight = height * 0.08;
    const fontSize = Math.max(20, Math.min(28, width * 0.022));

    const closeBtn = this.add.text(width * 0.97, headerHeight / 2, '✕', {
      fontFamily: 'Arial',
      fontSize: `${fontSize}px`,
      color: '#8b949e',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    closeBtn.on('pointerover', () => closeBtn.setColor('#f0e6d3'));
    closeBtn.on('pointerout', () => closeBtn.setColor('#8b949e'));
    closeBtn.on('pointerup', () => this.closeScene());
  }

  private closeScene(): void {
    this.scene.stop();
    this.scene.resume('MapScene');
  }
}
