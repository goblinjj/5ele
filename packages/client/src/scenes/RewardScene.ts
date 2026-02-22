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
  getEquipmentSkillsDisplay,
} from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';
import { uiConfig } from '../config/uiConfig.js';

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
    this.add.text(width / 2, height * 0.04, '选择器物', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontXL}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.07, '五行之力已凝练，选择一件器物', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#8b949e',
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
    const cardWidth = width * 0.85;
    const cardHeight = height * 0.22;
    const startY = height * 0.15;
    const spacing = cardHeight * 1.12;

    this.rewardOptions.forEach((equip, index) => {
      this.createRewardCard(width / 2, startY + index * spacing, equip, index, cardWidth, cardHeight);
    });

    // 跳过按钮
    const skipBtn = this.add.text(width / 2, height * 0.92, '跳过', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: '#888888',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    skipBtn.on('pointerover', () => skipBtn.setColor('#ffffff'));
    skipBtn.on('pointerout', () => skipBtn.setColor('#888888'));
    skipBtn.on('pointerup', () => this.skipReward());
  }

  private createRewardCard(x: number, y: number, equip: Equipment, index: number, cardWidth: number, cardHeight: number): void {
    // 卡片背景
    const bgColor = this.getRarityColor(equip.rarity);
    const bg = this.add.rectangle(x, y, cardWidth, cardHeight, bgColor);
    bg.setStrokeStyle(3, 0xffffff, 0.5);
    bg.setInteractive({ useHandCursor: true });

    // 五行图标（左侧）
    const iconX = x - cardWidth * 0.35;
    const iconRadius = Math.min(cardHeight * 0.25, cardWidth * 0.1);
    const wuxingColor = equip.wuxing !== undefined ? WUXING_COLORS[equip.wuxing] : 0x8b949e;
    const icon = this.add.circle(iconX, y, iconRadius, wuxingColor);
    icon.setStrokeStyle(2, 0xffffff, 0.5);

    this.add.text(iconX, y, equip.wuxing !== undefined ? `${equip.wuxingLevel ?? 1}` : '-', {
      fontFamily: 'Arial',
      fontSize: `${uiConfig.fontLG}px`,
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 右侧文字区域
    const textX = x - cardWidth * 0.1;

    // 装备名称
    this.add.text(textX, y - cardHeight * 0.32, equip.name, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 稀有度 + 类型
    const typeName = equip.type === EquipmentType.WEAPON ? '武器' :
                     equip.type === EquipmentType.ARMOR ? '铠甲' : '灵器';
    this.add.text(textX, y - cardHeight * 0.12, `${this.getRarityName(equip.rarity)} · ${typeName}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: this.getRarityTextColor(equip.rarity),
    }).setOrigin(0.5);

    // 属性
    let statsText = '';
    if (equip.attack) statsText += `攻击 +${equip.attack}  `;
    if (equip.defense) statsText += `防御 +${equip.defense}`;
    this.add.text(textX, y + cardHeight * 0.05, statsText, {
      fontFamily: 'monospace',
      fontSize: `${uiConfig.fontMD}px`,
      color: '#22c55e',
    }).setOrigin(0.5);

    // 五行属性
    const wuxingName = equip.wuxing !== undefined ? WUXING_NAMES[equip.wuxing] : '无';
    const wuxingLevelStr = equip.wuxing !== undefined ? ` Lv.${equip.wuxingLevel ?? 1}` : '';
    this.add.text(textX, y + cardHeight * 0.22, `${wuxingName}属性${wuxingLevelStr}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#' + wuxingColor.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);

    // 技能描述
    const skills = getEquipmentSkillsDisplay(equip, equip.wuxingLevel ?? 1);
    if (skills.length > 0) {
      this.add.text(x, y + cardHeight * 0.28, `【${skills[0].name}】${skills[0].description}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontXS}px`,
        color: '#fbbf24',
        wordWrap: { width: cardWidth * 0.85 },
        align: 'center',
      }).setOrigin(0.5, 0.5);
    }

    // 交互效果
    bg.on('pointerover', () => {
      bg.setScale(1.02);
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
      fontSize: `${uiConfig.fontMD}px`,
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
      fontSize: `${uiConfig.font2XL}px`,
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
      fontSize: `${uiConfig.font3XL}px`,
      color: '#fbbf24',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 20, '你成功净化了这片区域', {
      fontFamily: 'Arial',
      fontSize: `${uiConfig.fontXL}px`,
      color: '#ffffff',
    }).setOrigin(0.5);

    const returnBtn = this.add.text(width / 2, height / 2 + 100, '返回主菜单', {
      fontFamily: 'Arial',
      fontSize: `${uiConfig.fontLG}px`,
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
