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
    this.add.rectangle(width / 2, height / 2, width, height, this.colors.bgDark, 0.95);

    // 标题栏
    this.createHeader();

    // 左侧：装备栏
    this.createEquipmentSection();

    // 右侧：背包栏
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
    const headerHeight = height * 0.1;

    // 标题背景
    const headerBg = this.add.graphics();
    headerBg.fillStyle(this.colors.inkBlack, 0.9);
    headerBg.fillRect(0, 0, width, headerHeight);

    // 标题
    const titleSize = Math.max(16, Math.min(24, width * 0.02));
    this.add.text(width / 2, headerHeight / 2, '背包管理', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${titleSize}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 玩家状态
    const player = gameState.getPlayerState();
    const statsFontSize = Math.max(10, Math.min(14, width * 0.012));
    this.add.text(width * 0.12, headerHeight / 2, `❤️ ${player.hp}/${player.maxHp}  ⚔️ ${gameState.getTotalAttack()}  🛡️ ${gameState.getTotalDefense()}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${statsFontSize}px`,
      color: '#8b949e',
    }).setOrigin(0, 0.5);

    // 碎片数量
    const fragments = gameState.getFragmentCount();
    this.add.text(width * 0.92, headerHeight / 2, `💎 ${fragments}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${statsFontSize + 2}px`,
      color: '#a855f7',
    }).setOrigin(1, 0.5);
  }

  private createEquipmentSection(): void {
    const { width, height } = this.cameras.main;
    const startX = width * 0.06;
    const startY = height * 0.15;
    const slotSize = Math.max(45, Math.min(60, width * 0.05));
    const fontSize = Math.max(10, Math.min(14, width * 0.012));
    const labelFontSize = Math.max(9, Math.min(12, width * 0.01));

    // 分区标题
    this.add.text(startX, startY, '装备栏', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${fontSize}px`,
      color: '#8b949e',
    });

    // 武器
    this.add.text(startX, startY + height * 0.05, '武器', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${labelFontSize}px`,
      color: '#6e7681',
    });
    this.createSlot(startX + slotSize * 0.5, startY + height * 0.12, {
      type: 'weapon',
      index: 0,
      equipment: gameState.getWeapon(),
    }, slotSize);

    // 铠甲
    this.add.text(startX + slotSize * 1.5, startY + height * 0.05, '铠甲', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${labelFontSize}px`,
      color: '#6e7681',
    });
    this.createSlot(startX + slotSize * 2, startY + height * 0.12, {
      type: 'armor',
      index: 0,
      equipment: gameState.getArmor(),
    }, slotSize);

    // 法宝
    this.add.text(startX, startY + height * 0.22, '法宝', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${labelFontSize}px`,
      color: '#6e7681',
    });

    const treasures = gameState.getTreasures();
    const treasureCols = 3;

    for (let i = 0; i < MAX_TREASURES; i++) {
      const col = i % treasureCols;
      const row = Math.floor(i / treasureCols);
      const x = startX + slotSize * 0.5 + col * slotSize * 1.1;
      const y = startY + height * 0.3 + row * slotSize * 1.1;

      this.createSlot(x, y, {
        type: 'treasure',
        index: i,
        equipment: treasures[i] || null,
      }, slotSize);
    }
  }

  private createInventorySection(): void {
    const { width, height } = this.cameras.main;
    const startX = width * 0.28;
    const startY = height * 0.15;
    const slotSize = Math.max(45, Math.min(60, width * 0.05));
    const fontSize = Math.max(10, Math.min(14, width * 0.012));

    // 计算可用宽度内能放多少列
    const availableWidth = width * 0.68;
    const cols = Math.min(12, Math.floor(availableWidth / (slotSize * 1.1)));

    // 分区标题
    const usedSlots = INVENTORY_SIZE - gameState.getEmptySlotCount();
    this.add.text(startX, startY, `背包 (${usedSlots}/${INVENTORY_SIZE})`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${fontSize}px`,
      color: '#8b949e',
    });

    const inventory = gameState.getInventory();

    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + slotSize * 0.5 + col * slotSize * 1.1;
      const y = startY + height * 0.08 + row * slotSize * 1.1;

      this.createSlot(x, y, {
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

    // 弹窗面板
    const panelHeight = equipment.skill ? 380 : 320;
    const borderColor = this.getRarityBorderColor(equipment.rarity);
    const panel = this.add.graphics();
    panel.fillStyle(this.colors.inkBlack, 0.98);
    panel.fillRoundedRect(-150, -panelHeight / 2, 300, panelHeight, 12);
    panel.lineStyle(3, borderColor, 0.9);
    panel.strokeRoundedRect(-150, -panelHeight / 2, 300, panelHeight, 12);
    this.popup.add(panel);

    let yOffset = -panelHeight / 2 + 25;

    // 装备图标
    const color = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0x8b949e;
    const icon = this.add.circle(0, yOffset, 30, color);
    icon.setStrokeStyle(3, 0xffffff, 0.5);
    this.popup.add(icon);

    const levelStr = equipment.wuxing !== undefined ? `${equipment.wuxingLevel ?? 1}` : '-';
    const levelText = this.add.text(0, yOffset, levelStr, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.popup.add(levelText);

    yOffset += 45;

    // 名称
    const nameText = this.add.text(0, yOffset, equipment.name, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '20px',
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.popup.add(nameText);

    yOffset += 25;

    // 类型 + 稀有度
    const typeAndRarity = `${this.getEquipmentTypeName(equipment.type)} · ${this.getRarityName(equipment.rarity)}`;
    const typeRarityText = this.add.text(0, yOffset, typeAndRarity, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '12px',
      color: this.getRarityColor(equipment.rarity),
    }).setOrigin(0.5);
    this.popup.add(typeRarityText);

    yOffset += 22;

    // 五行属性
    const wuxingName = equipment.wuxing !== undefined ? WUXING_NAMES[equipment.wuxing] : '无';
    const wuxingLevelStr = equipment.wuxing !== undefined ? ` Lv.${equipment.wuxingLevel ?? 1}` : '';
    const wuxingText = this.add.text(0, yOffset, `${wuxingName}属性${wuxingLevelStr}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '13px',
      color: '#' + color.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);
    this.popup.add(wuxingText);

    yOffset += 25;

    // 攻防
    const stats: string[] = [];
    if (equipment.attack) stats.push(`攻击 +${equipment.attack}`);
    if (equipment.defense) stats.push(`防御 +${equipment.defense}`);
    if (stats.length > 0) {
      const statsText = this.add.text(0, yOffset, stats.join('   '), {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '14px',
        color: '#f0e6d3',
      }).setOrigin(0.5);
      this.popup.add(statsText);
      yOffset += 25;
    }

    // 技能
    if (equipment.skill) {
      const skillNameText = this.add.text(0, yOffset, `【${equipment.skill.name}】`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '13px',
        color: '#d4a853',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      this.popup.add(skillNameText);

      yOffset += 18;
      const skillDescText = this.add.text(0, yOffset, equipment.skill.description, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '11px',
        color: '#8b949e',
        wordWrap: { width: 260 },
        align: 'center',
      }).setOrigin(0.5, 0);
      this.popup.add(skillDescText);
    }

    // 按钮区域
    yOffset = panelHeight / 2 - 50;

    if (slotInfo.type === 'inventory') {
      this.createPopupButton(-90, yOffset, '装备', () => this.equipItem(slotInfo));
      this.createPopupButton(0, yOffset, '合成', () => this.startSynthesizeMode(slotInfo));
      this.createPopupButton(90, yOffset, '吞噬', () => this.startDevourMode(slotInfo));
    } else {
      this.createPopupButton(0, yOffset, '卸下', () => this.unequipItem(slotInfo));
    }
  }

  private createPopupButton(x: number, y: number, text: string, onClick: () => void): void {
    if (!this.popup) return;

    const btnWidth = 70;
    const btnHeight = 32;

    const bg = this.add.rectangle(x, y, btnWidth, btnHeight, this.colors.inkGrey);
    bg.setStrokeStyle(1, this.colors.goldAccent, 0.5);
    bg.setInteractive({ useHandCursor: true });

    const btnText = this.add.text(x, y, text, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '13px',
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
    const btnWidth = Math.max(80, Math.min(100, width * 0.08));
    const btnHeight = Math.max(28, Math.min(36, height * 0.05));
    const fontSize = Math.max(11, Math.min(14, width * 0.012));

    this.cancelButton = this.add.container(width / 2, height * 0.92);

    // 取消按钮
    const cancelBtnX = showFragmentToggle ? -width * 0.08 : 0;
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
      const bonusPercent = fragments * 5; // 每个碎片 +5%

      const getToggleText = (useFragments: boolean) => {
        if (fragments === 0) {
          return '无碎片';
        }
        return useFragments ? `✓ 碎片 (+${bonusPercent}%)` : '不使用碎片';
      };

      const toggleWidth = Math.max(120, Math.min(160, width * 0.14));
      const toggleBg = this.add.rectangle(width * 0.08, 0, toggleWidth, btnHeight, this.useFragmentsToggle ? this.colors.greenAccent : this.colors.inkGrey);
      toggleBg.setStrokeStyle(2, this.colors.goldAccent, 0.5);
      toggleBg.setInteractive({ useHandCursor: true });

      const toggleText = this.add.text(width * 0.08, 0, getToggleText(this.useFragmentsToggle), {
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
      // 先计算成功率用于显示
      const rateInfo = SynthesisSystem.calculateSuccessRate(firstIndex, secondIndex, this.useFragmentsToggle);
      const result = SynthesisSystem.synthesize(firstIndex, secondIndex, this.useFragmentsToggle);

      if (result.isSpecial && result.result) {
        this.showSpecialSynthesisNotification(result.result);
      } else {
        // 在消息中显示成功率（debug用）
        const rateMsg = `[成功率: ${rateInfo.rateStr}] `;
        this.showTopMessage(rateMsg + result.message, result.success ? '#3fb950' : '#f85149');
        this.time.delayedCall(1500, () => this.scene.restart());
      }
    } else {
      // 吞噬成功率固定 15%
      const result = SynthesisSystem.devour(firstIndex, secondIndex);
      const rateMsg = '[成功率: 15%] ';
      this.showTopMessage(rateMsg + result.message, result.success ? '#3fb950' : '#f85149');
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
    const msgWidth = Math.max(300, Math.min(500, width * 0.45));
    const msgHeight = Math.max(40, Math.min(50, height * 0.07));
    const fontSize = Math.max(12, Math.min(16, width * 0.013));

    this.topMessage = this.add.container(width / 2, height * 0.14);

    const bg = this.add.graphics();
    bg.fillStyle(this.colors.inkBlack, 0.95);
    bg.fillRoundedRect(-msgWidth / 2, -msgHeight / 2, msgWidth, msgHeight, 8);
    bg.lineStyle(2, this.colors.goldAccent, 0.6);
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
    const headerHeight = height * 0.1;
    const fontSize = Math.max(18, Math.min(24, width * 0.02));

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
