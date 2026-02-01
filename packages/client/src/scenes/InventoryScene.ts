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
 * 背包管理场景 - 移动端优化版
 */
export class InventoryScene extends Phaser.Scene {
  private popup?: Phaser.GameObjects.Container;
  private centerMessage?: Phaser.GameObjects.Container;
  private specialNotification?: Phaser.GameObjects.Container;
  private currentSlot?: SlotInfo;
  private popupMode: PopupMode = 'view';
  private firstSelectedSlot?: SlotInfo;
  private cancelButton?: Phaser.GameObjects.Container;

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

    // 玩家属性
    this.createPlayerStats();

    // 装备栏（武器、铠甲、法宝）
    this.createEquipmentSection();

    // 背包栏
    this.createInventorySection();

    // 关闭按钮
    this.createCloseButton();

    // ESC/点击空白关闭弹窗
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.popup) {
        this.closePopup();
      } else {
        this.closeScene();
      }
    });
  }

  private createHeader(): void {
    const { width } = this.cameras.main;

    // 标题背景
    const headerBg = this.add.graphics();
    headerBg.fillStyle(this.colors.inkBlack, 0.9);
    headerBg.fillRect(0, 0, width, 80);

    // 标题
    this.add.text(width / 2, 40, '背包管理', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '28px',
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 碎片数量
    const fragments = gameState.getFragmentCount();
    if (fragments > 0) {
      this.add.text(width - 30, 40, `💎 ${fragments}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '16px',
        color: '#a855f7',
      }).setOrigin(1, 0.5);
    }
  }

  private createPlayerStats(): void {
    const { width } = this.cameras.main;
    const y = 120;

    // 属性背景
    const statsBg = this.add.graphics();
    statsBg.fillStyle(this.colors.inkGrey, 0.5);
    statsBg.fillRoundedRect(20, y - 25, width - 40, 50, 8);

    const player = gameState.getPlayerState();

    // HP
    this.add.text(40, y, `❤️ ${player.hp}/${player.maxHp}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '16px',
      color: '#f85149',
    }).setOrigin(0, 0.5);

    // 攻击
    this.add.text(width / 2 - 60, y, `⚔️ ${gameState.getTotalAttack()}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '16px',
      color: '#f85149',
    }).setOrigin(0, 0.5);

    // 防御
    this.add.text(width / 2 + 60, y, `🛡️ ${gameState.getTotalDefense()}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '16px',
      color: '#58a6ff',
    }).setOrigin(0, 0.5);
  }

  private createEquipmentSection(): void {
    const { width } = this.cameras.main;
    const startY = 180;

    // 分区标题
    this.add.text(30, startY, '装备栏', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '18px',
      color: '#8b949e',
    });

    // 武器
    this.add.text(30, startY + 35, '武器', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '12px',
      color: '#6e7681',
    });
    this.createSlot(90, startY + 70, {
      type: 'weapon',
      index: 0,
      equipment: gameState.getWeapon(),
    });

    // 铠甲
    this.add.text(170, startY + 35, '铠甲', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '12px',
      color: '#6e7681',
    });
    this.createSlot(230, startY + 70, {
      type: 'armor',
      index: 0,
      equipment: gameState.getArmor(),
    });

    // 法宝
    this.add.text(310, startY + 35, '法宝', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '12px',
      color: '#6e7681',
    });

    const treasures = gameState.getTreasures();
    const treasureStartX = 370;
    const slotSize = 70;

    for (let i = 0; i < MAX_TREASURES; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = treasureStartX + col * slotSize;
      const y = startY + 70 + row * slotSize;

      this.createSlot(x, y, {
        type: 'treasure',
        index: i,
        equipment: treasures[i] || null,
      });
    }
  }

  private createInventorySection(): void {
    const { width } = this.cameras.main;
    const startY = 380;
    const slotSize = 70;
    const cols = Math.floor((width - 40) / slotSize);
    const startX = (width - cols * slotSize) / 2 + slotSize / 2;

    // 分区标题
    const usedSlots = INVENTORY_SIZE - gameState.getEmptySlotCount();
    this.add.text(30, startY, `背包 (${usedSlots}/${INVENTORY_SIZE})`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '18px',
      color: '#8b949e',
    });

    const inventory = gameState.getInventory();

    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * slotSize;
      const y = startY + 50 + row * slotSize;

      this.createSlot(x, y, {
        type: 'inventory',
        index: i,
        equipment: inventory[i],
      });
    }
  }

  private createSlot(x: number, y: number, slotInfo: SlotInfo): void {
    const container = this.add.container(x, y);
    const equipment = slotInfo.equipment;

    // 槽位背景
    const bgColor = slotInfo.type === 'inventory' ? this.colors.inkGrey : this.colors.inkBlack;
    const bg = this.add.rectangle(0, 0, 60, 60, bgColor, 0.8);
    // 根据稀有度设置边框颜色
    const borderColor = equipment ? this.getRarityBorderColor(equipment.rarity) : 0x484f58;
    bg.setStrokeStyle(2, borderColor, equipment ? 0.8 : 0.3);
    bg.setInteractive({ useHandCursor: true });
    container.add(bg);

    if (equipment) {
      // 装备图标
      const color = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0x8b949e;
      const icon = this.add.circle(0, -3, 20, color);
      icon.setStrokeStyle(2, 0xffffff, 0.4);
      container.add(icon);

      // 五行等级/无属性标记
      const levelStr = equipment.wuxing !== undefined ? `${equipment.wuxingLevel ?? 1}` : '-';
      const levelText = this.add.text(0, -3, levelStr, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      container.add(levelText);

      // 类型图标
      const typeIcon = this.getTypeIcon(equipment.type);
      const typeText = this.add.text(0, 22, typeIcon, {
        fontSize: '12px',
      }).setOrigin(0.5);
      container.add(typeText);

      // 升级标记
      if (equipment.upgradeLevel > 0) {
        const upgradeText = this.add.text(22, -22, `+${equipment.upgradeLevel}`, {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#3fb950',
          fontStyle: 'bold',
        }).setOrigin(0.5);
        container.add(upgradeText);
      }

      // 技能标记
      if (equipment.skill) {
        const skillMark = this.add.text(-22, -22, '✦', {
          fontSize: '14px',
          color: '#d4a853',
        }).setOrigin(0.5);
        container.add(skillMark);
      }
    }

    // 点击事件
    bg.on('pointerup', () => {
      this.handleSlotClick(slotInfo);
    });

    // 悬停效果
    bg.on('pointerover', () => {
      bg.setStrokeStyle(2, this.colors.goldAccent, 1);
    });

    bg.on('pointerout', () => {
      bg.setStrokeStyle(2, borderColor, equipment ? 0.8 : 0.3);
    });
  }

  private getTypeIcon(type: EquipmentType): string {
    switch (type) {
      case EquipmentType.WEAPON: return '⚔️';
      case EquipmentType.ARMOR: return '🛡️';
      case EquipmentType.TREASURE: return '💎';
    }
  }

  private handleSlotClick(slotInfo: SlotInfo): void {
    // 选择模式：选择第二件装备
    if (this.popupMode === 'select-synthesize' || this.popupMode === 'select-devour') {
      if (slotInfo.type === 'inventory' && slotInfo.equipment && this.firstSelectedSlot) {
        // 不能选择同一个
        if (slotInfo.type === this.firstSelectedSlot.type && slotInfo.index === this.firstSelectedSlot.index) {
          return;
        }
        this.performAction(slotInfo);
      }
      return;
    }

    // 普通模式：显示弹窗
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

    // 弹窗面板 - 使用稀有度边框颜色
    const panelHeight = equipment.skill ? 410 : 350;
    const borderColor = this.getRarityBorderColor(equipment.rarity);
    const panel = this.add.graphics();
    panel.fillStyle(this.colors.inkBlack, 0.98);
    panel.fillRoundedRect(-160, -panelHeight / 2, 320, panelHeight, 12);
    panel.lineStyle(3, borderColor, 0.9);
    panel.strokeRoundedRect(-160, -panelHeight / 2, 320, panelHeight, 12);
    this.popup.add(panel);

    let yOffset = -panelHeight / 2 + 30;

    // 装备图标
    const color = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0x8b949e;
    const icon = this.add.circle(0, yOffset, 35, color);
    icon.setStrokeStyle(3, 0xffffff, 0.5);
    this.popup.add(icon);

    const levelStr = equipment.wuxing !== undefined ? `${equipment.wuxingLevel ?? 1}` : '-';
    const levelText = this.add.text(0, yOffset, levelStr, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '24px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.popup.add(levelText);

    yOffset += 55;

    // 名称
    const nameText = this.add.text(0, yOffset, equipment.name, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '22px',
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.popup.add(nameText);

    yOffset += 30;

    // 装备类型
    const typeNameText = this.add.text(0, yOffset, this.getEquipmentTypeName(equipment.type), {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
      color: '#8b949e',
    }).setOrigin(0.5);
    this.popup.add(typeNameText);

    yOffset += 22;

    // 稀有度
    const rarityText = this.add.text(0, yOffset, this.getRarityName(equipment.rarity), {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
      color: this.getRarityColor(equipment.rarity),
    }).setOrigin(0.5);
    this.popup.add(rarityText);

    yOffset += 25;

    // 五行属性
    const wuxingName = equipment.wuxing !== undefined ? WUXING_NAMES[equipment.wuxing] : '无';
    const wuxingLevelStr = equipment.wuxing !== undefined ? ` Lv.${equipment.wuxingLevel ?? 1}` : '';
    const wuxingText = this.add.text(0, yOffset, `${wuxingName}属性${wuxingLevelStr}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
      color: '#' + color.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);
    this.popup.add(wuxingText);

    yOffset += 30;

    // 攻防属性
    if (equipment.attack) {
      const attackText = this.add.text(0, yOffset, `攻击 +${equipment.attack}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '16px',
        color: '#f85149',
      }).setOrigin(0.5);
      this.popup.add(attackText);
      yOffset += 25;
    }

    if (equipment.defense) {
      const defenseText = this.add.text(0, yOffset, `防御 +${equipment.defense}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '16px',
        color: '#58a6ff',
      }).setOrigin(0.5);
      this.popup.add(defenseText);
      yOffset += 25;
    }

    // 技能
    if (equipment.skill) {
      yOffset += 5;
      const skillNameText = this.add.text(0, yOffset, `【${equipment.skill.name}】`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '14px',
        color: '#d4a853',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      this.popup.add(skillNameText);

      yOffset += 22;
      const skillDescText = this.add.text(0, yOffset, equipment.skill.description, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '12px',
        color: '#8b949e',
        wordWrap: { width: 280 },
        align: 'center',
      }).setOrigin(0.5, 0);
      this.popup.add(skillDescText);

      yOffset += 35;
    }

    // 按钮区域
    yOffset = panelHeight / 2 - 60;

    if (slotInfo.type === 'inventory') {
      // 背包物品：装备、合成、吞噬
      this.createPopupButton(-100, yOffset, '装备', () => this.equipItem(slotInfo));
      this.createPopupButton(0, yOffset, '合成', () => this.startSynthesizeMode(slotInfo));
      this.createPopupButton(100, yOffset, '吞噬', () => this.startDevourMode(slotInfo));
    } else {
      // 已装备物品：卸下
      this.createPopupButton(0, yOffset, '卸下', () => this.unequipItem(slotInfo));
    }
  }

  private createPopupButton(x: number, y: number, text: string, onClick: () => void): void {
    if (!this.popup) return;

    const btnWidth = 80;
    const btnHeight = 36;

    const bg = this.add.rectangle(x, y, btnWidth, btnHeight, this.colors.inkGrey);
    bg.setStrokeStyle(1, this.colors.goldAccent, 0.5);
    bg.setInteractive({ useHandCursor: true });

    const btnText = this.add.text(x, y, text, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
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
    this.popupMode = 'view';
    this.firstSelectedSlot = undefined;
  }

  private equipItem(slotInfo: SlotInfo): void {
    const equipment = slotInfo.equipment;
    if (!equipment || slotInfo.type !== 'inventory') return;

    // 先关闭弹层
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
          this.showCenterMessage('法宝栏已满！', '#f85149');
          return;
        }
        success = gameState.equipTreasure(slotInfo.index);
        break;
    }

    if (success) {
      // 弹层关闭后再显示消息
      this.time.delayedCall(100, () => {
        this.showCenterMessage(`装备了 ${equipment.name}`, '#3fb950');
        this.time.delayedCall(800, () => this.scene.restart());
      });
    } else {
      this.showCenterMessage('装备失败', '#f85149');
    }
  }

  private unequipItem(slotInfo: SlotInfo): void {
    const equipment = slotInfo.equipment;
    if (!equipment) return;

    // 先关闭弹层
    this.closePopup();

    // 检查背包空间
    if (gameState.isInventoryFull()) {
      this.time.delayedCall(100, () => {
        this.showCenterMessage('背包已满！', '#f85149');
      });
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
      this.time.delayedCall(100, () => {
        this.showCenterMessage(`卸下了 ${equipment.name}`, '#3fb950');
        this.time.delayedCall(800, () => this.scene.restart());
      });
    } else {
      this.time.delayedCall(100, () => {
        this.showCenterMessage('卸下失败', '#f85149');
      });
    }
  }

  private startSynthesizeMode(slotInfo: SlotInfo): void {
    this.closePopup();
    this.popupMode = 'select-synthesize';
    this.firstSelectedSlot = slotInfo;
    this.showCenterMessage('选择另一件装备进行合成', '#d4a853', false);
    this.showCancelButton();
  }

  private startDevourMode(slotInfo: SlotInfo): void {
    this.closePopup();
    this.popupMode = 'select-devour';
    this.firstSelectedSlot = slotInfo;
    this.showCenterMessage('选择要吞噬的装备', '#d4a853', false);
    this.showCancelButton();
  }

  private showCancelButton(): void {
    this.hideCancelButton();

    const { width, height } = this.cameras.main;
    this.cancelButton = this.add.container(width / 2, height - 80);

    const btnWidth = 120;
    const btnHeight = 40;

    const bg = this.add.rectangle(0, 0, btnWidth, btnHeight, this.colors.redAccent);
    bg.setStrokeStyle(2, 0xffffff, 0.5);
    bg.setInteractive({ useHandCursor: true });

    const text = this.add.text(0, 0, '取消', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.cancelButton.add([bg, text]);

    bg.on('pointerover', () => {
      bg.setFillStyle(0xff6b6b);
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(this.colors.redAccent);
    });

    bg.on('pointerup', () => {
      this.cancelSelectionMode();
    });
  }

  private hideCancelButton(): void {
    if (this.cancelButton) {
      this.cancelButton.destroy();
      this.cancelButton = undefined;
    }
  }

  private cancelSelectionMode(): void {
    this.closeCenterMessage();
    this.hideCancelButton();
    this.popupMode = 'view';
    this.firstSelectedSlot = undefined;
  }

  private performAction(secondSlot: SlotInfo): void {
    if (!this.firstSelectedSlot || secondSlot.type !== 'inventory') return;

    const firstIndex = this.firstSelectedSlot.index;
    const secondIndex = secondSlot.index;

    this.closeCenterMessage();
    this.hideCancelButton();

    if (this.popupMode === 'select-synthesize') {
      const result = SynthesisSystem.synthesize(firstIndex, secondIndex);

      if (result.isSpecial && result.result) {
        // 特殊合成（传说装备）- 显示大型通知
        this.showSpecialSynthesisNotification(result.result);
      } else {
        this.showCenterMessage(result.message, result.success ? '#3fb950' : '#f85149');
        this.time.delayedCall(1200, () => this.scene.restart());
      }
    } else {
      const result = SynthesisSystem.devour(firstIndex, secondIndex);
      this.showCenterMessage(result.message, result.success ? '#3fb950' : '#f85149');
      this.time.delayedCall(1200, () => this.scene.restart());
    }

    this.popupMode = 'view';
    this.firstSelectedSlot = undefined;
  }

  private showSpecialSynthesisNotification(equipment: Equipment): void {
    const { width, height } = this.cameras.main;

    this.specialNotification = this.add.container(width / 2, height / 2);

    // 全屏遮罩
    const overlay = this.add.rectangle(0, 0, width, height, 0x000000, 0.9);
    this.specialNotification.add(overlay);

    // 光效背景
    const glow = this.add.graphics();
    const glowColor = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0xd4a853;
    glow.fillStyle(glowColor, 0.2);
    glow.fillCircle(0, 0, 200);
    this.specialNotification.add(glow);

    // 光环动画
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

    // 主标题
    const title = this.add.text(0, -120, '✨ 神器出世 ✨', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '36px',
      color: '#d4a853',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.specialNotification.add(title);

    // 装备图标
    const iconColor = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0x8b949e;
    const icon = this.add.circle(0, -30, 50, iconColor);
    icon.setStrokeStyle(4, 0xffffff, 0.8);
    this.specialNotification.add(icon);

    // 五行符号
    const wuxingSymbol = equipment.wuxing !== undefined ? this.getWuxingSymbol(equipment.wuxing) : '神';
    const symbolText = this.add.text(0, -30, wuxingSymbol, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.specialNotification.add(symbolText);

    // 装备名称
    const nameText = this.add.text(0, 50, equipment.name, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '28px',
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.specialNotification.add(nameText);

    // 稀有度
    const rarityText = this.add.text(0, 90, this.getRarityName(equipment.rarity), {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '16px',
      color: this.getRarityColor(equipment.rarity),
    }).setOrigin(0.5);
    this.specialNotification.add(rarityText);

    // 技能描述
    if (equipment.skill) {
      const skillText = this.add.text(0, 130, `【${equipment.skill.name}】${equipment.skill.description}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '14px',
        color: '#d4a853',
        wordWrap: { width: 300 },
        align: 'center',
      }).setOrigin(0.5, 0);
      this.specialNotification.add(skillText);
    }

    // 关闭按钮
    const btnY = 220;
    const btnWidth = 160;
    const btnHeight = 45;

    const btnBg = this.add.rectangle(0, btnY, btnWidth, btnHeight, this.colors.goldAccent);
    btnBg.setStrokeStyle(2, 0xffffff, 0.5);
    btnBg.setInteractive({ useHandCursor: true });

    const btnText = this.add.text(0, btnY, '太棒了！', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '18px',
      color: '#0d1117',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.specialNotification.add([btnBg, btnText]);

    btnBg.on('pointerover', () => {
      btnBg.setFillStyle(0xffffff);
    });

    btnBg.on('pointerout', () => {
      btnBg.setFillStyle(this.colors.goldAccent);
    });

    btnBg.on('pointerup', () => {
      this.closeSpecialNotification();
      this.scene.restart();
    });

    // 入场动画
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

  private showCenterMessage(message: string, color: string = '#f0e6d3', autoHide: boolean = true): void {
    this.closeCenterMessage();

    const { width, height } = this.cameras.main;

    this.centerMessage = this.add.container(width / 2, height / 2);

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(this.colors.inkBlack, 0.95);
    bg.fillRoundedRect(-180, -40, 360, 80, 12);
    bg.lineStyle(2, this.colors.goldAccent, 0.6);
    bg.strokeRoundedRect(-180, -40, 360, 80, 12);
    this.centerMessage.add(bg);

    // 文字
    const text = this.add.text(0, 0, message, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '18px',
      color: color,
      align: 'center',
      wordWrap: { width: 320 },
    }).setOrigin(0.5);
    this.centerMessage.add(text);

    if (autoHide) {
      this.time.delayedCall(1500, () => this.closeCenterMessage());
    }
  }

  private closeCenterMessage(): void {
    if (this.centerMessage) {
      this.centerMessage.destroy();
      this.centerMessage = undefined;
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
    const { width } = this.cameras.main;

    const closeBtn = this.add.text(width - 30, 40, '✕', {
      fontFamily: 'Arial',
      fontSize: '28px',
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
