import Phaser from 'phaser';
import { NodeType, GameNode, WUXING_COLORS } from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';

/**
 * 地图场景 - 节点选择
 */
export class MapScene extends Phaser.Scene {
  private mode: 'single' | 'multi' = 'single';
  private currentRound: number = 1;
  private maxRounds: number = 6;
  private nodeOptions: GameNode[] = [];

  constructor() {
    super({ key: 'MapScene' });
  }

  init(data: { mode: 'single' | 'multi'; round?: number }): void {
    this.mode = data.mode || 'single';
    this.currentRound = data.round || 1;
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // 顶部信息栏
    this.createHeader();

    // 玩家状态栏
    this.createPlayerStatus();

    // 生成节点选项
    this.generateNodeOptions();

    // 显示节点选择
    this.displayNodes();

    // 背包按钮
    this.createInventoryButton();

    // 键盘快捷键
    this.input.keyboard?.on('keydown-I', () => this.openInventory());
  }

  private createHeader(): void {
    const { width } = this.cameras.main;

    // 背景
    this.add.rectangle(width / 2, 40, width, 80, 0x2a2a4a);

    // 回合数
    this.add.text(20, 40, `第 ${this.currentRound}/${this.maxRounds} 轮`, {
      fontFamily: 'Arial',
      fontSize: '24px',
      color: '#ffffff',
    }).setOrigin(0, 0.5);

    // 模式
    const modeText = this.mode === 'single' ? '单人模式' : '多人模式';
    this.add.text(width - 20, 40, modeText, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#aaaaaa',
    }).setOrigin(1, 0.5);
  }

  private createPlayerStatus(): void {
    const { width } = this.cameras.main;
    const player = gameState.getPlayerState();
    const startX = width / 2 - 200;
    const y = 40;

    // 生命值
    const hpPercent = player.hp / player.maxHp;
    const hpBarWidth = 100;

    this.add.rectangle(startX, y, hpBarWidth + 4, 16, 0x333333);
    this.add.rectangle(
      startX - hpBarWidth / 2 + (hpBarWidth * hpPercent) / 2,
      y,
      hpBarWidth * hpPercent,
      12,
      hpPercent > 0.5 ? 0x22c55e : hpPercent > 0.25 ? 0xeab308 : 0xef4444
    );

    this.add.text(startX, y, `${player.hp}/${player.maxHp}`, {
      fontFamily: 'Arial',
      fontSize: '12px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // 攻击力
    this.add.text(startX + 80, y, `⚔️ ${gameState.getTotalAttack()}`, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#ef4444',
    }).setOrigin(0, 0.5);

    // 防御力
    this.add.text(startX + 130, y, `🛡️ ${gameState.getTotalDefense()}`, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#3b82f6',
    }).setOrigin(0, 0.5);

    // 五行显示
    const weapon = gameState.getWeapon();
    const armor = gameState.getArmor();

    if (weapon) {
      const color = WUXING_COLORS[weapon.wuxing];
      this.add.circle(startX + 200, y, 10, color).setStrokeStyle(1, 0xffffff, 0.5);
      this.add.text(startX + 200, y, `${weapon.wuxingLevel}`, {
        fontFamily: 'Arial',
        fontSize: '10px',
        color: '#ffffff',
      }).setOrigin(0.5);
    }

    if (armor) {
      const color = WUXING_COLORS[armor.wuxing];
      this.add.circle(startX + 230, y, 10, color).setStrokeStyle(1, 0xffffff, 0.5);
      this.add.text(startX + 230, y, `${armor.wuxingLevel}`, {
        fontFamily: 'Arial',
        fontSize: '10px',
        color: '#ffffff',
      }).setOrigin(0.5);
    }

    // 碎片数量
    const fragments = gameState.getFragmentCount();
    if (fragments > 0) {
      this.add.text(startX + 280, y, `💎 ${fragments}`, {
        fontFamily: 'Arial',
        fontSize: '14px',
        color: '#a855f7',
      }).setOrigin(0, 0.5);
    }
  }

  private createInventoryButton(): void {
    const { width, height } = this.cameras.main;

    const btn = this.add.container(width - 80, height - 50);

    const bg = this.add.rectangle(0, 0, 120, 40, 0x4a4a6a);
    bg.setStrokeStyle(2, 0x6a6a8a);
    bg.setInteractive({ useHandCursor: true });

    const text = this.add.text(0, 0, '📦 背包 (I)', {
      fontFamily: 'Arial',
      fontSize: '16px',
      color: '#ffffff',
    }).setOrigin(0.5);

    btn.add([bg, text]);

    bg.on('pointerover', () => bg.setFillStyle(0x5a5a7a));
    bg.on('pointerout', () => bg.setFillStyle(0x4a4a6a));
    bg.on('pointerup', () => this.openInventory());
  }

  private openInventory(): void {
    this.scene.pause();
    this.scene.launch('InventoryScene');
  }

  private generateNodeOptions(): void {
    // 根据概率生成 2-3 个节点选项
    const optionCount = Phaser.Math.Between(2, 3);
    this.nodeOptions = [];

    for (let i = 0; i < optionCount; i++) {
      const node = this.randomNode();
      this.nodeOptions.push(node);
    }
  }

  private randomNode(): GameNode {
    // 节点类型概率
    const roll = Math.random();
    let type: NodeType;
    let name: string;
    let description: string;

    if (roll < 0.35) {
      type = NodeType.NORMAL_BATTLE;
      name = '普通战斗';
      description = '遭遇一群小妖怪';
    } else if (roll < 0.60) {
      type = NodeType.REST;
      name = '休整';
      description = '恢复生命值';
    } else if (roll < 0.75) {
      type = NodeType.ELITE_BATTLE;
      name = '精英战斗';
      description = '遭遇强力妖怪，奖励丰厚';
    } else if (roll < 0.88) {
      type = NodeType.RANDOM_EVENT;
      name = '随机事件';
      description = '未知的遭遇...';
    } else {
      type = NodeType.STORY;
      name = '西游奇遇';
      description = '进入一段特殊剧情';
    }

    return { type, name, description };
  }

  private displayNodes(): void {
    const { width, height } = this.cameras.main;
    const nodeCount = this.nodeOptions.length;
    const spacing = 300;
    const startX = width / 2 - (nodeCount - 1) * spacing / 2;

    this.add.text(width / 2, 130, '选择下一步行动', {
      fontFamily: 'Arial',
      fontSize: '28px',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.nodeOptions.forEach((node, index) => {
      this.createNodeCard(startX + index * spacing, height / 2 + 20, node, index);
    });
  }

  private createNodeCard(x: number, y: number, node: GameNode, index: number): void {
    const cardWidth = 220;
    const cardHeight = 280;

    // 卡片背景
    const bg = this.add.rectangle(x, y, cardWidth, cardHeight, this.getNodeColor(node.type));
    bg.setStrokeStyle(3, 0xffffff, 0.3);
    bg.setInteractive({ useHandCursor: true });

    // 节点图标
    const icon = this.add.circle(x, y - 60, 40, 0xffffff, 0.2);
    this.add.text(x, y - 60, this.getNodeIcon(node.type), {
      fontFamily: 'Arial',
      fontSize: '36px',
    }).setOrigin(0.5);

    // 节点名称
    this.add.text(x, y + 20, node.name, {
      fontFamily: 'Arial',
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 节点描述
    this.add.text(x, y + 60, node.description, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#cccccc',
      wordWrap: { width: cardWidth - 30 },
      align: 'center',
    }).setOrigin(0.5);

    // 交互效果
    bg.on('pointerover', () => {
      bg.setScale(1.05);
      bg.setStrokeStyle(3, 0xffff00, 0.8);
    });

    bg.on('pointerout', () => {
      bg.setScale(1);
      bg.setStrokeStyle(3, 0xffffff, 0.3);
    });

    bg.on('pointerup', () => {
      this.selectNode(node, index);
    });
  }

  private getNodeColor(type: NodeType): number {
    switch (type) {
      case NodeType.NORMAL_BATTLE:
        return 0x4a5568;
      case NodeType.REST:
        return 0x22543d;
      case NodeType.ELITE_BATTLE:
        return 0x742a2a;
      case NodeType.STORY:
        return 0x553c9a;
      case NodeType.RANDOM_EVENT:
        return 0x744210;
      default:
        return 0x4a4a4a;
    }
  }

  private getNodeIcon(type: NodeType): string {
    switch (type) {
      case NodeType.NORMAL_BATTLE:
        return '⚔️';
      case NodeType.REST:
        return '🏕️';
      case NodeType.ELITE_BATTLE:
        return '👹';
      case NodeType.STORY:
        return '📜';
      case NodeType.RANDOM_EVENT:
        return '❓';
      default:
        return '❔';
    }
  }

  private selectNode(node: GameNode, index: number): void {
    console.log(`选择了节点: ${node.name}`);

    if (node.type === NodeType.REST) {
      // 休整：恢复生命后继续
      this.showRestEffect();
    } else if (node.type === NodeType.NORMAL_BATTLE || node.type === NodeType.ELITE_BATTLE) {
      // 进入战斗
      this.scene.start('BattleScene', {
        mode: this.mode,
        nodeType: node.type,
        round: this.currentRound,
      });
    } else if (node.type === NodeType.STORY) {
      // TODO: 进入剧情场景
      this.scene.start('BattleScene', {
        mode: this.mode,
        nodeType: node.type,
        round: this.currentRound,
      });
    } else {
      // 随机事件
      this.handleRandomEvent();
    }
  }

  private showRestEffect(): void {
    const { width, height } = this.cameras.main;

    // 恢复生命值
    gameState.fullHeal();

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    const text = this.add.text(width / 2, height / 2, '休息中...\n恢复了生命值', {
      fontFamily: 'Arial',
      fontSize: '32px',
      color: '#22c55e',
      align: 'center',
    }).setOrigin(0.5);

    this.time.delayedCall(1500, () => {
      overlay.destroy();
      text.destroy();
      this.nextRound();
    });
  }

  private handleRandomEvent(): void {
    // 简单的随机事件处理
    const { width, height } = this.cameras.main;

    const isGood = Math.random() > 0.4;
    let message: string;
    let color: string;

    if (isGood) {
      message = '遇到了一位仙人，获得了祝福！';
      color = '#22c55e';
      gameState.heal(2);
    } else {
      message = '踩到了陷阱，受到了伤害...';
      color = '#ef4444';
      gameState.takeDamage(1);
    }

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    const text = this.add.text(width / 2, height / 2, message, {
      fontFamily: 'Arial',
      fontSize: '28px',
      color: color,
      align: 'center',
    }).setOrigin(0.5);

    this.time.delayedCall(1500, () => {
      overlay.destroy();
      text.destroy();

      // 检查是否死亡
      if (!gameState.isAlive()) {
        this.scene.start('MenuScene');
      } else {
        this.nextRound();
      }
    });
  }

  private nextRound(): void {
    this.currentRound++;

    if (this.currentRound > this.maxRounds) {
      // 进入最终决战
      this.scene.start('BattleScene', {
        mode: this.mode,
        nodeType: 'final',
        round: this.currentRound,
      });
    } else {
      // 重新创建场景
      this.scene.restart({ mode: this.mode, round: this.currentRound });
    }
  }
}
