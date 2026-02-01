import Phaser from 'phaser';
import {
  Equipment,
  EquipmentType,
  WUXING_COLORS,
  WUXING_NAMES,
  Rarity,
  INVENTORY_SIZE,
} from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';
import { SynthesisSystem } from '../systems/SynthesisSystem.js';

/**
 * 背包/装备管理场景
 */
export class InventoryScene extends Phaser.Scene {
  private selectedSlots: number[] = [];
  private mode: 'normal' | 'synthesize' | 'devour' = 'normal';
  private devourTarget: number = -1;

  private slotSprites: Phaser.GameObjects.Container[] = [];
  private equipmentSprites: Map<string, Phaser.GameObjects.Container> = new Map();

  private infoPanel?: Phaser.GameObjects.Container;
  private messageText?: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'InventoryScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // 半透明背景
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.85);

    // 标题
    this.add.text(width / 2, 40, '背包管理', {
      fontFamily: 'Arial',
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 碎片数量
    this.add.text(width - 20, 40, `碎片: ${gameState.getFragmentCount()}`, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#a855f7',
    }).setOrigin(1, 0.5);

    // 创建装备栏
    this.createEquipmentSlots();

    // 创建背包格子
    this.createInventorySlots();

    // 创建操作按钮
    this.createActionButtons();

    // 创建信息面板
    this.createInfoPanel();

    // 消息文本
    this.messageText = this.add.text(width / 2, height - 30, '', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#22c55e',
    }).setOrigin(0.5);

    // 关闭按钮
    this.createCloseButton();

    // ESC 关闭
    this.input.keyboard?.on('keydown-ESC', () => this.closeScene());
  }

  private createEquipmentSlots(): void {
    const { width } = this.cameras.main;
    const startX = 100;
    const startY = 120;

    // 武器槽
    this.add.text(startX, startY - 25, '武器', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#aaaaaa',
    });
    this.createEquipSlot(startX, startY + 30, 'weapon', gameState.getWeapon());

    // 铠甲槽
    this.add.text(startX + 100, startY - 25, '铠甲', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#aaaaaa',
    });
    this.createEquipSlot(startX + 100, startY + 30, 'armor', gameState.getArmor());

    // 法宝槽
    this.add.text(startX + 220, startY - 25, '法宝', {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#aaaaaa',
    });

    const treasures = gameState.getTreasures();
    for (let i = 0; i < 8; i++) {
      const x = startX + 220 + (i % 4) * 70;
      const y = startY + 30 + Math.floor(i / 4) * 70;
      this.createEquipSlot(x, y, `treasure_${i}`, treasures[i] || null);
    }

    // 玩家属性显示
    const statsX = width - 200;
    this.add.text(statsX, startY, '玩家属性', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
    });

    const player = gameState.getPlayerState();
    this.add.text(statsX, startY + 30, `生命: ${player.hp}/${player.maxHp}`, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#22c55e',
    });

    this.add.text(statsX, startY + 50, `攻击: ${gameState.getTotalAttack()}`, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#ef4444',
    });

    this.add.text(statsX, startY + 70, `防御: ${gameState.getTotalDefense()}`, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#3b82f6',
    });
  }

  private createEquipSlot(x: number, y: number, slotId: string, equipment: Equipment | null): void {
    const container = this.add.container(x, y);

    // 槽位背景
    const bg = this.add.rectangle(0, 0, 60, 60, 0x333333);
    bg.setStrokeStyle(2, 0x555555);
    container.add(bg);

    if (equipment) {
      // 装备图标
      const color = WUXING_COLORS[equipment.wuxing];
      const icon = this.add.circle(0, 0, 22, color);
      icon.setStrokeStyle(2, 0xffffff, 0.5);
      container.add(icon);

      // 等级
      const levelText = this.add.text(0, 0, `${equipment.wuxingLevel}`, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      container.add(levelText);

      // 升级标记
      if (equipment.upgradeLevel > 0) {
        const upgradeText = this.add.text(20, -20, `+${equipment.upgradeLevel}`, {
          fontFamily: 'Arial',
          fontSize: '12px',
          color: '#22c55e',
        }).setOrigin(0.5);
        container.add(upgradeText);
      }

      // 技能标记
      if (equipment.skill) {
        const skillMark = this.add.text(-20, -20, '✦', {
          fontFamily: 'Arial',
          fontSize: '14px',
          color: '#fbbf24',
        }).setOrigin(0.5);
        container.add(skillMark);
      }
    }

    this.equipmentSprites.set(slotId, container);
  }

  private createInventorySlots(): void {
    const { width, height } = this.cameras.main;
    const startX = 100;
    const startY = 300;
    const slotSize = 70;
    const cols = 5;

    this.add.text(startX, startY - 30, `背包 (${INVENTORY_SIZE - gameState.getEmptySlotCount()}/${INVENTORY_SIZE})`, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
    });

    const inventory = gameState.getInventory();

    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * slotSize + 30;
      const y = startY + row * slotSize + 30;

      const container = this.createInventorySlot(x, y, i, inventory[i]);
      this.slotSprites.push(container);
    }
  }

  private createInventorySlot(x: number, y: number, index: number, equipment: Equipment | null): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);

    // 槽位背景
    const bg = this.add.rectangle(0, 0, 60, 60, 0x2a2a4a);
    bg.setStrokeStyle(2, 0x4a4a6a);
    bg.setInteractive({ useHandCursor: true });
    container.add(bg);

    if (equipment) {
      // 装备图标
      const color = WUXING_COLORS[equipment.wuxing];
      const icon = this.add.circle(0, -5, 20, color);
      icon.setStrokeStyle(2, 0xffffff, 0.3);
      container.add(icon);

      // 五行等级
      const levelText = this.add.text(0, -5, `${equipment.wuxingLevel}`, {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      container.add(levelText);

      // 类型图标
      const typeIcon = this.getTypeIcon(equipment.type);
      const typeText = this.add.text(0, 20, typeIcon, {
        fontFamily: 'Arial',
        fontSize: '12px',
      }).setOrigin(0.5);
      container.add(typeText);

      // 升级标记
      if (equipment.upgradeLevel > 0) {
        const upgradeText = this.add.text(22, -22, `+${equipment.upgradeLevel}`, {
          fontFamily: 'Arial',
          fontSize: '10px',
          color: '#22c55e',
        }).setOrigin(0.5);
        container.add(upgradeText);
      }

      // 技能标记
      if (equipment.skill) {
        const skillMark = this.add.text(-22, -22, '✦', {
          fontFamily: 'Arial',
          fontSize: '12px',
          color: '#fbbf24',
        }).setOrigin(0.5);
        container.add(skillMark);
      }
    }

    // 选中标记
    const selection = this.add.rectangle(0, 0, 64, 64, 0xffff00, 0);
    selection.setStrokeStyle(3, 0xffff00, 0);
    selection.setName('selection');
    container.add(selection);

    // 交互
    bg.on('pointerover', () => {
      if (!this.selectedSlots.includes(index)) {
        bg.setFillStyle(0x3a3a5a);
      }
      if (equipment) {
        this.showItemInfo(equipment);
      }
    });

    bg.on('pointerout', () => {
      if (!this.selectedSlots.includes(index)) {
        bg.setFillStyle(0x2a2a4a);
      }
    });

    bg.on('pointerup', () => {
      this.handleSlotClick(index, equipment);
    });

    return container;
  }

  private getTypeIcon(type: EquipmentType): string {
    switch (type) {
      case EquipmentType.WEAPON: return '⚔️';
      case EquipmentType.ARMOR: return '🛡️';
      case EquipmentType.TREASURE: return '💎';
    }
  }

  private handleSlotClick(index: number, equipment: Equipment | null): void {
    if (!equipment) return;

    if (this.mode === 'normal') {
      // 普通模式：选中/取消选中
      const selectionIndex = this.selectedSlots.indexOf(index);
      if (selectionIndex >= 0) {
        this.selectedSlots.splice(selectionIndex, 1);
        this.updateSlotSelection(index, false);
      } else {
        this.selectedSlots.push(index);
        this.updateSlotSelection(index, true);
      }
    } else if (this.mode === 'synthesize') {
      // 合成模式：选择两个
      const selectionIndex = this.selectedSlots.indexOf(index);
      if (selectionIndex >= 0) {
        this.selectedSlots.splice(selectionIndex, 1);
        this.updateSlotSelection(index, false);
      } else if (this.selectedSlots.length < 2) {
        this.selectedSlots.push(index);
        this.updateSlotSelection(index, true);

        if (this.selectedSlots.length === 2) {
          this.performSynthesis();
        }
      }
    } else if (this.mode === 'devour') {
      // 吞噬模式
      if (this.devourTarget < 0) {
        this.devourTarget = index;
        this.updateSlotSelection(index, true);
        this.showMessage('选择要被吞噬的装备');
      } else if (this.devourTarget !== index) {
        this.performDevour(this.devourTarget, index);
      }
    }
  }

  private updateSlotSelection(index: number, selected: boolean): void {
    const container = this.slotSprites[index];
    if (!container) return;

    const selection = container.getByName('selection') as Phaser.GameObjects.Rectangle;
    if (selection) {
      selection.setStrokeStyle(3, 0xffff00, selected ? 1 : 0);
    }
  }

  private createActionButtons(): void {
    const { width, height } = this.cameras.main;
    const buttonY = height - 100;

    // 装备按钮
    this.createButton(width / 2 - 200, buttonY, '装备', () => this.equipSelected());

    // 合成按钮
    this.createButton(width / 2 - 50, buttonY, '合成', () => this.startSynthesizeMode());

    // 吞噬按钮
    this.createButton(width / 2 + 100, buttonY, '吞噬', () => this.startDevourMode());

    // 取消按钮
    this.createButton(width / 2 + 250, buttonY, '取消', () => this.cancelMode());
  }

  private createButton(x: number, y: number, text: string, onClick: () => void): void {
    const bg = this.add.rectangle(x, y, 100, 40, 0x4a4a6a);
    bg.setStrokeStyle(2, 0x6a6a8a);
    bg.setInteractive({ useHandCursor: true });

    const buttonText = this.add.text(x, y, text, {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(0x5a5a7a);
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(0x4a4a6a);
    });

    bg.on('pointerup', onClick);
  }

  private createInfoPanel(): void {
    const { width, height } = this.cameras.main;

    this.infoPanel = this.add.container(width - 200, 300);

    const bg = this.add.rectangle(0, 0, 180, 200, 0x1a1a2e, 0.9);
    bg.setStrokeStyle(1, 0x4a4a6a);
    this.infoPanel.add(bg);

    this.infoPanel.setVisible(false);
  }

  private showItemInfo(equipment: Equipment): void {
    if (!this.infoPanel) return;

    // 清除旧内容
    this.infoPanel.removeAll(true);

    // 根据是否有技能调整面板高度
    const panelHeight = equipment.skill ? 260 : 200;

    const bg = this.add.rectangle(0, 0, 180, panelHeight, 0x1a1a2e, 0.95);
    bg.setStrokeStyle(1, 0x4a4a6a);
    this.infoPanel.add(bg);

    // 名称
    const nameText = this.add.text(0, -panelHeight / 2 + 20, equipment.name, {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.infoPanel.add(nameText);

    // 稀有度
    const rarityText = this.add.text(0, -panelHeight / 2 + 45, this.getRarityName(equipment.rarity), {
      fontFamily: 'Arial',
      fontSize: '12px',
      color: this.getRarityColor(equipment.rarity),
    }).setOrigin(0.5);
    this.infoPanel.add(rarityText);

    // 五行
    const wuxingText = this.add.text(0, -panelHeight / 2 + 70, `${WUXING_NAMES[equipment.wuxing]} Lv.${equipment.wuxingLevel}`, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#' + WUXING_COLORS[equipment.wuxing].toString(16).padStart(6, '0'),
    }).setOrigin(0.5);
    this.infoPanel.add(wuxingText);

    // 属性
    let yOffset = -panelHeight / 2 + 100;
    if (equipment.attack) {
      const attackText = this.add.text(0, yOffset, `攻击 +${equipment.attack}`, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#ef4444',
      }).setOrigin(0.5);
      this.infoPanel.add(attackText);
      yOffset += 20;
    }

    if (equipment.defense) {
      const defenseText = this.add.text(0, yOffset, `防御 +${equipment.defense}`, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#3b82f6',
      }).setOrigin(0.5);
      this.infoPanel.add(defenseText);
      yOffset += 20;
    }

    // 技能信息
    if (equipment.skill) {
      yOffset += 10;

      const skillNameText = this.add.text(0, yOffset, `【${equipment.skill.name}】`, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#fbbf24',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      this.infoPanel.add(skillNameText);
      yOffset += 20;

      const skillDescText = this.add.text(0, yOffset, equipment.skill.description, {
        fontFamily: 'Arial',
        fontSize: '11px',
        color: '#cccccc',
        wordWrap: { width: 160 },
        align: 'center',
      }).setOrigin(0.5, 0);
      this.infoPanel.add(skillDescText);
    }

    this.infoPanel.setVisible(true);
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
      case Rarity.COMMON: return '#aaaaaa';
      case Rarity.UNCOMMON: return '#22c55e';
      case Rarity.RARE: return '#3b82f6';
      case Rarity.EPIC: return '#a855f7';
      case Rarity.LEGENDARY: return '#f59e0b';
      default: return '#aaaaaa';
    }
  }

  private equipSelected(): void {
    if (this.selectedSlots.length !== 1) {
      this.showMessage('请选择一件装备');
      return;
    }

    const index = this.selectedSlots[0];
    const item = gameState.getInventory()[index];
    if (!item) return;

    let success = false;
    switch (item.type) {
      case EquipmentType.WEAPON:
        success = gameState.equipWeapon(index);
        break;
      case EquipmentType.ARMOR:
        success = gameState.equipArmor(index);
        break;
      case EquipmentType.TREASURE:
        success = gameState.equipTreasure(index);
        break;
    }

    if (success) {
      this.showMessage(`装备了 ${item.name}`);
      this.scene.restart();
    } else {
      this.showMessage('无法装备');
    }
  }

  private startSynthesizeMode(): void {
    this.cancelMode();
    this.mode = 'synthesize';
    this.showMessage('选择两件装备进行合成');
  }

  private startDevourMode(): void {
    this.cancelMode();
    this.mode = 'devour';
    this.devourTarget = -1;
    this.showMessage('选择要强化的装备');
  }

  private cancelMode(): void {
    this.mode = 'normal';
    this.devourTarget = -1;
    for (const index of this.selectedSlots) {
      this.updateSlotSelection(index, false);
    }
    this.selectedSlots = [];
    this.showMessage('');
  }

  private performSynthesis(): void {
    if (this.selectedSlots.length !== 2) return;

    const result = SynthesisSystem.synthesize(this.selectedSlots[0], this.selectedSlots[1]);
    this.showMessage(result.message);

    // 延迟刷新场景
    this.time.delayedCall(1000, () => {
      this.scene.restart();
    });
  }

  private performDevour(targetIndex: number, sacrificeIndex: number): void {
    const result = SynthesisSystem.devour(targetIndex, sacrificeIndex);
    this.showMessage(result.message);

    // 延迟刷新场景
    this.time.delayedCall(1000, () => {
      this.scene.restart();
    });
  }

  private showMessage(message: string): void {
    if (this.messageText) {
      this.messageText.setText(message);
    }
  }

  private createCloseButton(): void {
    const { width } = this.cameras.main;

    const closeBtn = this.add.text(width - 30, 20, '✕', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#aaaaaa',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    closeBtn.on('pointerover', () => closeBtn.setColor('#ffffff'));
    closeBtn.on('pointerout', () => closeBtn.setColor('#aaaaaa'));
    closeBtn.on('pointerup', () => this.closeScene());
  }

  private closeScene(): void {
    this.scene.stop();
    this.scene.resume('MapScene');
  }
}
