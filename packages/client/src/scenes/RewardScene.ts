import Phaser from 'phaser';
import {
  Equipment,
  EquipmentType,
  Rarity,
  Wuxing,
  WUXING_COLORS,
  WUXING_NAMES,
  NodeType,
  INVENTORY_SIZE,
  BOSS_DROPS,
  getLegendaryEquipment,
} from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';

/**
 * 奖励场景 - 三选一
 */
export class RewardScene extends Phaser.Scene {
  private mode: 'single' | 'multi' = 'single';
  private round: number = 1;
  private nodeType: NodeType | 'final' = NodeType.NORMAL_BATTLE;
  private rewardOptions: Equipment[] = [];

  constructor() {
    super({ key: 'RewardScene' });
  }

  init(data: { mode: 'single' | 'multi'; round: number; nodeType: NodeType | 'final' }): void {
    this.mode = data.mode || 'single';
    this.round = data.round || 1;
    this.nodeType = data.nodeType || NodeType.NORMAL_BATTLE;
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // 背景
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    // 标题
    this.add.text(width / 2, 60, '选择奖励', {
      fontFamily: 'Arial',
      fontSize: '36px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, 100, '选择一件装备加入背包', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    // 生成奖励选项
    this.generateRewards();

    // 显示奖励卡片
    this.displayRewards();
  }

  private generateRewards(): void {
    this.rewardOptions = [];
    const isElite = this.nodeType === NodeType.ELITE_BATTLE;
    const isFinal = this.nodeType === 'final';

    // 尝试获取Boss掉落
    const bossDrop = this.tryBossDrop();

    for (let i = 0; i < 3; i++) {
      // 第一个位置放Boss掉落（如果有）
      if (i === 0 && bossDrop) {
        this.rewardOptions.push(bossDrop);
      } else {
        this.rewardOptions.push(this.randomEquipment(isElite || isFinal));
      }
    }
  }

  private tryBossDrop(): Equipment | null {
    // 根据节点类型确定Boss
    let bossId: string | null = null;

    if (this.nodeType === 'final') {
      bossId = 'boss_final';
    } else if (this.nodeType === NodeType.ELITE_BATTLE) {
      // 精英战斗随机选择一个Boss掉落表
      const eliteBosses = ['boss_bajie', 'boss_wujing', 'boss_dragon'];
      bossId = eliteBosses[Math.floor(Math.random() * eliteBosses.length)];
    }

    if (!bossId) return null;

    // 查找Boss掉落表
    const bossDropTable = BOSS_DROPS.find(b => b.bossId === bossId);
    if (!bossDropTable) return null;

    // 按概率尝试掉落
    for (const drop of bossDropTable.drops) {
      if (Math.random() < drop.dropRate) {
        const legendary = getLegendaryEquipment(drop.equipmentId);
        if (legendary) {
          // 返回新实例
          return {
            ...legendary,
            id: `${legendary.id}_${Date.now()}`,
          };
        }
      }
    }

    return null;
  }

  private randomEquipment(isHighQuality: boolean): Equipment {
    const types = [EquipmentType.WEAPON, EquipmentType.ARMOR, EquipmentType.TREASURE];
    const type = types[Math.floor(Math.random() * types.length)];

    const wuxings = Object.values(Wuxing);
    const wuxing = wuxings[Math.floor(Math.random() * wuxings.length)] as Wuxing;

    const rarityRoll = Math.random();
    let rarity: Rarity;
    if (isHighQuality) {
      rarity = rarityRoll < 0.3 ? Rarity.EPIC : rarityRoll < 0.7 ? Rarity.RARE : Rarity.UNCOMMON;
    } else {
      rarity = rarityRoll < 0.1 ? Rarity.RARE : rarityRoll < 0.4 ? Rarity.UNCOMMON : Rarity.COMMON;
    }

    const baseStats = this.getBaseStats(rarity);

    return {
      id: `equip_${Date.now()}_${Math.random()}`,
      name: this.generateName(type, wuxing, rarity),
      type,
      rarity,
      wuxing,
      wuxingLevel: rarity === Rarity.EPIC ? 2 : 1,
      attack: type === EquipmentType.WEAPON || type === EquipmentType.TREASURE ? baseStats : undefined,
      defense: type === EquipmentType.ARMOR || type === EquipmentType.TREASURE ? baseStats : undefined,
      upgradeLevel: 0,
    };
  }

  private getBaseStats(rarity: Rarity): number {
    switch (rarity) {
      case Rarity.COMMON: return 1;
      case Rarity.UNCOMMON: return 2;
      case Rarity.RARE: return 3;
      case Rarity.EPIC: return 4;
      case Rarity.LEGENDARY: return 5;
      default: return 1;
    }
  }

  private generateName(type: EquipmentType, wuxing: Wuxing, rarity: Rarity): string {
    const wuxingName = WUXING_NAMES[wuxing];

    const weaponNames = ['剑', '刀', '枪', '戟', '棍'];
    const armorNames = ['甲', '袍', '衣', '铠'];
    const treasureNames = ['珠', '镜', '印', '符', '环'];

    let baseName: string;
    switch (type) {
      case EquipmentType.WEAPON:
        baseName = weaponNames[Math.floor(Math.random() * weaponNames.length)];
        break;
      case EquipmentType.ARMOR:
        baseName = armorNames[Math.floor(Math.random() * armorNames.length)];
        break;
      case EquipmentType.TREASURE:
        baseName = treasureNames[Math.floor(Math.random() * treasureNames.length)];
        break;
    }

    const prefix = rarity === Rarity.EPIC ? '上古' :
                   rarity === Rarity.RARE ? '精良' :
                   rarity === Rarity.UNCOMMON ? '优质' : '';

    return `${prefix}${wuxingName}${baseName}`;
  }

  private displayRewards(): void {
    const { width, height } = this.cameras.main;
    const cardWidth = 200;
    const cardHeight = 300;
    const spacing = 250;
    const startX = width / 2 - spacing;

    this.rewardOptions.forEach((equip, index) => {
      this.createRewardCard(startX + index * spacing, height / 2, equip, index);
    });

    // 跳过按钮
    const skipBtn = this.add.text(width / 2, height - 60, '跳过', {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#888888',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    skipBtn.on('pointerover', () => skipBtn.setColor('#ffffff'));
    skipBtn.on('pointerout', () => skipBtn.setColor('#888888'));
    skipBtn.on('pointerup', () => this.skipReward());
  }

  private createRewardCard(x: number, y: number, equip: Equipment, index: number): void {
    const cardWidth = 200;
    const cardHeight = 300;

    // 卡片背景（根据稀有度变色）
    const bgColor = this.getRarityColor(equip.rarity);
    const bg = this.add.rectangle(x, y, cardWidth, cardHeight, bgColor);
    bg.setStrokeStyle(3, 0xffffff, 0.5);
    bg.setInteractive({ useHandCursor: true });

    // 五行图标（无属性时用灰色）
    const wuxingColor = equip.wuxing !== undefined ? WUXING_COLORS[equip.wuxing] : 0x8b949e;
    const icon = this.add.circle(x, y - 80, 30, wuxingColor);
    icon.setStrokeStyle(2, 0xffffff, 0.5);

    // 五行等级（无属性时显示"-"）
    this.add.text(x, y - 80, equip.wuxing !== undefined ? `${equip.wuxingLevel ?? 1}` : '-', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 装备名称
    this.add.text(x, y - 30, equip.name, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 稀有度
    this.add.text(x, y, this.getRarityName(equip.rarity), {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: this.getRarityTextColor(equip.rarity),
    }).setOrigin(0.5);

    // 类型
    const typeName = equip.type === EquipmentType.WEAPON ? '武器' :
                     equip.type === EquipmentType.ARMOR ? '铠甲' : '法宝';
    this.add.text(x, y + 25, typeName, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#aaaaaa',
    }).setOrigin(0.5);

    // 属性
    let statsText = '';
    if (equip.attack) statsText += `攻击 +${equip.attack}  `;
    if (equip.defense) statsText += `防御 +${equip.defense}`;

    this.add.text(x, y + 60, statsText, {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#22c55e',
    }).setOrigin(0.5);

    // 五行属性（无属性时显示"无属性"）
    const wuxingName = equip.wuxing !== undefined ? WUXING_NAMES[equip.wuxing] : '无';
    const wuxingLevelStr = equip.wuxing !== undefined ? ` Lv.${equip.wuxingLevel ?? 1}` : '';
    this.add.text(x, y + 90, `${wuxingName}属性${wuxingLevelStr}`, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#' + wuxingColor.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    // 技能描述
    if (equip.skill) {
      this.add.text(x, y + 115, `【${equip.skill.name}】`, {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: '#fbbf24',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      this.add.text(x, y + 130, equip.skill.description, {
        fontFamily: 'Arial',
        fontSize: '11px',
        color: '#cccccc',
        wordWrap: { width: cardWidth - 20 },
        align: 'center',
      }).setOrigin(0.5, 0);
    }

    // 交互效果
    bg.on('pointerover', () => {
      bg.setScale(1.05);
      bg.setStrokeStyle(3, 0xffff00, 1);
    });

    bg.on('pointerout', () => {
      bg.setScale(1);
      bg.setStrokeStyle(3, 0xffffff, 0.5);
    });

    bg.on('pointerup', () => {
      this.selectReward(equip, index);
    });
  }

  private getRarityColor(rarity: Rarity): number {
    switch (rarity) {
      case Rarity.COMMON: return 0x4a4a4a;
      case Rarity.UNCOMMON: return 0x22543d;
      case Rarity.RARE: return 0x1e40af;
      case Rarity.EPIC: return 0x6b21a8;
      case Rarity.LEGENDARY: return 0xb45309;
      default: return 0x4a4a4a;
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

  private getRarityTextColor(rarity: Rarity): string {
    switch (rarity) {
      case Rarity.COMMON: return '#aaaaaa';
      case Rarity.UNCOMMON: return '#22c55e';
      case Rarity.RARE: return '#3b82f6';
      case Rarity.EPIC: return '#a855f7';
      case Rarity.LEGENDARY: return '#f59e0b';
      default: return '#aaaaaa';
    }
  }

  private selectReward(equip: Equipment, index: number): void {
    console.log(`选择了: ${equip.name}`);

    // 检查背包是否已满
    if (gameState.isInventoryFull()) {
      this.showMessage('背包已满！请先清理背包');
      return;
    }

    // 添加到背包
    const success = gameState.addToInventory(equip);
    if (success) {
      this.showSelectionEffect(equip);
    } else {
      this.showMessage('无法添加到背包');
    }
  }

  private showMessage(message: string): void {
    const { width, height } = this.cameras.main;

    const text = this.add.text(width / 2, height - 100, message, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#ef4444',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: text,
      alpha: 0,
      y: height - 120,
      duration: 1500,
      onComplete: () => text.destroy(),
    });
  }

  private showSelectionEffect(equip: Equipment): void {
    const { width, height } = this.cameras.main;

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    const text = this.add.text(width / 2, height / 2, `获得了 ${equip.name}！`, {
      fontFamily: 'Arial',
      fontSize: '32px',
      color: '#22c55e',
    }).setOrigin(0.5);

    this.time.delayedCall(1200, () => {
      this.goToNextScene();
    });
  }

  private skipReward(): void {
    console.log('跳过奖励');
    this.goToNextScene();
  }

  private goToNextScene(): void {
    if (this.nodeType === 'final') {
      // 游戏结束，显示胜利
      this.showVictory();
    } else {
      // 继续到地图，进入下一轮
      this.scene.start('MapScene', { mode: this.mode, round: this.round + 1 });
    }
  }

  private showVictory(): void {
    const { width, height } = this.cameras.main;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.9);

    this.add.text(width / 2, height / 2 - 50, '胜利！', {
      fontFamily: 'Arial',
      fontSize: '64px',
      color: '#fbbf24',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 20, '你成功完成了西游试炼', {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#ffffff',
    }).setOrigin(0.5);

    const returnBtn = this.add.text(width / 2, height / 2 + 100, '返回主菜单', {
      fontFamily: 'Arial',
      fontSize: '20px',
      color: '#aaaaaa',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    returnBtn.on('pointerover', () => returnBtn.setColor('#ffffff'));
    returnBtn.on('pointerout', () => returnBtn.setColor('#aaaaaa'));
    returnBtn.on('pointerup', () => {
      gameState.reset();
      this.scene.start('MenuScene');
    });
  }
}
