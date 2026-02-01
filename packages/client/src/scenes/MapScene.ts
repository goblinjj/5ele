import Phaser from 'phaser';
import { NodeType, GameNode, WUXING_COLORS, WUXING_NAMES } from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';

/**
 * 地图场景 - 节点选择（水墨画风格）
 */
export class MapScene extends Phaser.Scene {
  private mode: 'single' | 'multi' = 'single';
  private currentRound: number = 1;
  private maxRounds: number = 6;
  private nodeOptions: GameNode[] = [];

  // UI 颜色主题
  private readonly colors = {
    bgDark: 0x0d1117,
    bgMid: 0x161b22,
    inkBlack: 0x1c2128,
    inkGrey: 0x30363d,
    paperWhite: 0xf0e6d3,
    paperCream: 0xe8dcc8,
    goldAccent: 0xd4a853,
    redAccent: 0xc94a4a,
    greenAccent: 0x3fb950,
    blueAccent: 0x58a6ff,
  };

  constructor() {
    super({ key: 'MapScene' });
  }

  init(data: { mode: 'single' | 'multi'; round?: number }): void {
    this.mode = data.mode || 'single';
    this.currentRound = data.round || 1;
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // 背景
    this.createBackground();

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

  private createBackground(): void {
    const { width, height } = this.cameras.main;

    // 深色背景
    const bgGraphics = this.add.graphics();
    bgGraphics.fillStyle(this.colors.bgDark, 1);
    bgGraphics.fillRect(0, 0, width, height);

    // 水墨晕染效果
    for (let i = 0; i < 6; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(100, height);
      const radius = Phaser.Math.Between(80, 200);
      bgGraphics.fillStyle(this.colors.inkBlack, 0.4);
      bgGraphics.fillCircle(x, y, radius);
    }

    // 装饰线
    bgGraphics.lineStyle(1, this.colors.goldAccent, 0.2);
    bgGraphics.lineBetween(40, 110, width - 40, 110);
    bgGraphics.lineBetween(40, height - 50, width - 40, height - 50);
  }

  private createHeader(): void {
    const { width } = this.cameras.main;

    // 顶部栏背景
    const headerBg = this.add.graphics();
    headerBg.fillStyle(this.colors.inkBlack, 0.9);
    headerBg.fillRoundedRect(20, 15, width - 40, 80, 8);
    headerBg.lineStyle(1, this.colors.goldAccent, 0.4);
    headerBg.strokeRoundedRect(20, 15, width - 40, 80, 8);

    // 回合数
    this.add.text(50, 40, `第 ${this.currentRound}/${this.maxRounds} 轮`, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '28px',
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    // 模式
    const modeText = this.mode === 'single' ? '单人模式' : '多人模式';
    this.add.text(width - 50, 40, modeText, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '16px',
      color: '#8b949e',
    }).setOrigin(1, 0.5);
  }

  private createPlayerStatus(): void {
    const { width } = this.cameras.main;
    const player = gameState.getPlayerState();
    const centerX = width / 2;
    const y = 55;

    // 状态面板背景
    const panelWidth = 320;
    const panelBg = this.add.graphics();
    panelBg.fillStyle(this.colors.inkGrey, 0.6);
    panelBg.fillRoundedRect(centerX - panelWidth / 2, 25, panelWidth, 50, 6);

    // HP 条
    const hpBarWidth = 100;
    const hpBarHeight = 14;
    const hpPercent = player.hp / player.maxHp;
    const hpX = centerX - 100;

    // HP 条背景
    this.add.rectangle(hpX, y, hpBarWidth + 4, hpBarHeight + 4, this.colors.inkBlack);

    // HP 条本体
    const hpBar = this.add.rectangle(
      hpX - hpBarWidth / 2,
      y,
      hpBarWidth * hpPercent,
      hpBarHeight,
      hpPercent > 0.5 ? this.colors.greenAccent : hpPercent > 0.25 ? 0xeab308 : this.colors.redAccent
    );
    hpBar.setOrigin(0, 0.5);

    // HP 数值
    this.add.text(hpX, y, `${player.hp}/${player.maxHp}`, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 攻击力
    this.add.text(centerX + 10, y - 8, `⚔ ${gameState.getTotalAttack()}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
      color: '#f85149',
    }).setOrigin(0, 0.5);

    // 防御力
    this.add.text(centerX + 60, y - 8, `🛡 ${gameState.getTotalDefense()}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
      color: '#58a6ff',
    }).setOrigin(0, 0.5);

    // 五行显示（只有有五行属性时才显示）
    const weapon = gameState.getWeapon();
    const armor = gameState.getArmor();

    if (weapon && weapon.wuxing !== undefined) {
      const color = WUXING_COLORS[weapon.wuxing];
      const wuxingCircle = this.add.circle(centerX + 10, y + 12, 10, color);
      wuxingCircle.setStrokeStyle(1, 0xffffff, 0.5);
      this.add.text(centerX + 10, y + 12, `${weapon.wuxingLevel ?? 1}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
      }).setOrigin(0.5);
    }

    if (armor && armor.wuxing !== undefined) {
      const color = WUXING_COLORS[armor.wuxing];
      const wuxingCircle = this.add.circle(centerX + 35, y + 12, 10, color);
      wuxingCircle.setStrokeStyle(1, 0xffffff, 0.5);
      this.add.text(centerX + 35, y + 12, `${armor.wuxingLevel ?? 1}`, {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffffff',
      }).setOrigin(0.5);
    }

    // 碎片数量
    const fragments = gameState.getFragmentCount();
    if (fragments > 0) {
      this.add.text(centerX + 100, y, `💎 ${fragments}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '14px',
        color: '#a855f7',
      }).setOrigin(0, 0.5);
    }
  }

  private createInventoryButton(): void {
    const { width, height } = this.cameras.main;

    const btnWidth = 130;
    const btnHeight = 40;
    const btnX = width - 85;
    const btnY = height - 70;

    const bg = this.add.rectangle(btnX, btnY, btnWidth, btnHeight, this.colors.inkGrey);
    bg.setStrokeStyle(2, this.colors.goldAccent, 0.5);
    bg.setInteractive({ useHandCursor: true });

    const text = this.add.text(btnX, btnY, '📦 背包 (I)', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '16px',
      color: '#f0e6d3',
    }).setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(this.colors.goldAccent);
      text.setColor('#0d1117');
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(this.colors.inkGrey);
      text.setColor('#f0e6d3');
    });

    bg.on('pointerup', () => this.openInventory());
  }

  private openInventory(): void {
    this.scene.pause();
    this.scene.launch('InventoryScene');
  }

  private generateNodeOptions(): void {
    // 生成 3 个节点选项
    this.nodeOptions = [];

    // 第一个必定是战斗节点（普通或精英）
    const battleRoll = Math.random();
    if (battleRoll < 0.7) {
      this.nodeOptions.push({
        type: NodeType.NORMAL_BATTLE,
        name: '普通战斗',
        description: '遭遇一群小妖怪',
      });
    } else {
      this.nodeOptions.push({
        type: NodeType.ELITE_BATTLE,
        name: '精英战斗',
        description: '遭遇强力妖怪，奖励丰厚',
      });
    }

    // 其余两个随机生成（排除已选类型，增加多样性）
    for (let i = 0; i < 2; i++) {
      const node = this.randomNode();
      this.nodeOptions.push(node);
    }

    // 打乱顺序
    this.shuffleArray(this.nodeOptions);
  }

  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  private randomNode(): GameNode {
    // 节点类型概率（不包含战斗，因为第一个已保证）
    const roll = Math.random();
    let type: NodeType;
    let name: string;
    let description: string;

    if (roll < 0.35) {
      type = NodeType.REST;
      name = '休整';
      description = '恢复生命值';
    } else if (roll < 0.55) {
      type = NodeType.NORMAL_BATTLE;
      name = '普通战斗';
      description = '遭遇一群小妖怪';
    } else if (roll < 0.75) {
      type = NodeType.RANDOM_EVENT;
      name = '随机事件';
      description = '未知的遭遇...';
    } else if (roll < 0.88) {
      type = NodeType.ELITE_BATTLE;
      name = '精英战斗';
      description = '遭遇强力妖怪，奖励丰厚';
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
    const spacing = 240;
    const startX = width / 2 - (nodeCount - 1) * spacing / 2;

    // 标题
    this.add.text(width / 2, 150, '选择下一步行动', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '32px',
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 节点卡片
    this.nodeOptions.forEach((node, index) => {
      this.createNodeCard(startX + index * spacing, height / 2 + 30, node, index);
    });
  }

  private createNodeCard(x: number, y: number, node: GameNode, index: number): void {
    const cardWidth = 200;
    const cardHeight = 260;
    const nodeColor = this.getNodeColor(node.type);

    // 卡片容器
    const container = this.add.container(x, y + 30);
    container.setAlpha(0);

    // 卡片背景
    const bgGraphics = this.add.graphics();
    bgGraphics.fillStyle(this.colors.inkBlack, 0.9);
    bgGraphics.fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 10);
    bgGraphics.lineStyle(2, nodeColor, 0.6);
    bgGraphics.strokeRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 10);

    // 顶部装饰
    bgGraphics.fillStyle(nodeColor, 0.3);
    bgGraphics.fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, 60, { tl: 10, tr: 10, bl: 0, br: 0 });

    // 节点图标
    const iconBg = this.add.circle(0, -70, 35, nodeColor, 0.3);
    iconBg.setStrokeStyle(2, nodeColor, 0.6);

    const icon = this.add.text(0, -70, this.getNodeIcon(node.type), {
      fontSize: '32px',
    }).setOrigin(0.5);

    // 节点名称
    const nameText = this.add.text(0, -10, node.name, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '22px',
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 节点描述
    const descText = this.add.text(0, 30, node.description, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
      color: '#8b949e',
      wordWrap: { width: cardWidth - 30 },
      align: 'center',
    }).setOrigin(0.5);

    // 额外信息
    const infoText = this.getNodeInfo(node.type);
    if (infoText) {
      this.add.text(0, 70, infoText, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '12px',
        color: this.getNodeInfoColor(node.type),
      }).setOrigin(0.5);
      container.add(this.children.list[this.children.list.length - 1]);
    }

    // 交互区域
    const hitArea = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });

    container.add([bgGraphics, iconBg, icon, nameText, descText, hitArea]);

    // 入场动画
    this.tweens.add({
      targets: container,
      y: y,
      alpha: 1,
      duration: 400,
      delay: index * 100,
      ease: 'Back.easeOut',
    });

    // 交互效果
    hitArea.on('pointerover', () => {
      this.tweens.add({
        targets: container,
        scaleX: 1.05,
        scaleY: 1.05,
        duration: 150,
        ease: 'Power2.easeOut',
      });
      bgGraphics.clear();
      bgGraphics.fillStyle(this.colors.inkBlack, 0.95);
      bgGraphics.fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 10);
      bgGraphics.lineStyle(3, this.colors.goldAccent, 1);
      bgGraphics.strokeRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 10);
      bgGraphics.fillStyle(nodeColor, 0.4);
      bgGraphics.fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, 60, { tl: 10, tr: 10, bl: 0, br: 0 });
    });

    hitArea.on('pointerout', () => {
      this.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 150,
        ease: 'Power2.easeOut',
      });
      bgGraphics.clear();
      bgGraphics.fillStyle(this.colors.inkBlack, 0.9);
      bgGraphics.fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 10);
      bgGraphics.lineStyle(2, nodeColor, 0.6);
      bgGraphics.strokeRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 10);
      bgGraphics.fillStyle(nodeColor, 0.3);
      bgGraphics.fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, 60, { tl: 10, tr: 10, bl: 0, br: 0 });
    });

    hitArea.on('pointerup', () => {
      this.selectNode(node, index);
    });
  }

  private getNodeColor(type: NodeType): number {
    switch (type) {
      case NodeType.NORMAL_BATTLE:
        return 0x6e7681;
      case NodeType.REST:
        return this.colors.greenAccent;
      case NodeType.ELITE_BATTLE:
        return this.colors.redAccent;
      case NodeType.STORY:
        return 0xa855f7;
      case NodeType.RANDOM_EVENT:
        return this.colors.goldAccent;
      default:
        return this.colors.inkGrey;
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

  private getNodeInfo(type: NodeType): string | null {
    switch (type) {
      case NodeType.REST:
        return '恢复全部生命';
      case NodeType.ELITE_BATTLE:
        return '高难度 · 高奖励';
      default:
        return null;
    }
  }

  private getNodeInfoColor(type: NodeType): string {
    switch (type) {
      case NodeType.REST:
        return '#3fb950';
      case NodeType.ELITE_BATTLE:
        return '#f85149';
      default:
        return '#8b949e';
    }
  }

  private selectNode(node: GameNode, index: number): void {
    console.log(`选择了节点: ${node.name}`);

    if (node.type === NodeType.REST) {
      this.showRestEffect();
    } else if (node.type === NodeType.NORMAL_BATTLE || node.type === NodeType.ELITE_BATTLE) {
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
      this.handleRandomEvent();
    }
  }

  private showRestEffect(): void {
    const { width, height } = this.cameras.main;

    gameState.fullHeal();

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8);

    // 休息面板
    const panelBg = this.add.graphics();
    panelBg.fillStyle(this.colors.inkBlack, 0.95);
    panelBg.fillRoundedRect(width / 2 - 150, height / 2 - 80, 300, 160, 12);
    panelBg.lineStyle(2, this.colors.greenAccent, 0.6);
    panelBg.strokeRoundedRect(width / 2 - 150, height / 2 - 80, 300, 160, 12);

    const icon = this.add.text(width / 2, height / 2 - 30, '🏕️', {
      fontSize: '48px',
    }).setOrigin(0.5);

    const text = this.add.text(width / 2, height / 2 + 30, '休息中...\n生命值已恢复', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '20px',
      color: '#3fb950',
      align: 'center',
    }).setOrigin(0.5);

    this.time.delayedCall(1500, () => {
      overlay.destroy();
      panelBg.destroy();
      icon.destroy();
      text.destroy();
      this.nextRound();
    });
  }

  private handleRandomEvent(): void {
    const { width, height } = this.cameras.main;

    const isGood = Math.random() > 0.4;
    let message: string;
    let color: string;
    let emoji: string;

    if (isGood) {
      message = '遇到了一位仙人\n获得了祝福！';
      color = '#3fb950';
      emoji = '✨';
      gameState.heal(2);
    } else {
      message = '踩到了陷阱\n受到了伤害...';
      color = '#f85149';
      emoji = '💥';
      gameState.takeDamage(1);
    }

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8);

    const panelBg = this.add.graphics();
    panelBg.fillStyle(this.colors.inkBlack, 0.95);
    panelBg.fillRoundedRect(width / 2 - 150, height / 2 - 80, 300, 160, 12);
    panelBg.lineStyle(2, isGood ? this.colors.greenAccent : this.colors.redAccent, 0.6);
    panelBg.strokeRoundedRect(width / 2 - 150, height / 2 - 80, 300, 160, 12);

    const icon = this.add.text(width / 2, height / 2 - 30, emoji, {
      fontSize: '48px',
    }).setOrigin(0.5);

    const text = this.add.text(width / 2, height / 2 + 30, message, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '18px',
      color: color,
      align: 'center',
    }).setOrigin(0.5);

    this.time.delayedCall(1500, () => {
      overlay.destroy();
      panelBg.destroy();
      icon.destroy();
      text.destroy();

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
      this.scene.start('BattleScene', {
        mode: this.mode,
        nodeType: 'final',
        round: this.currentRound,
      });
    } else {
      this.scene.restart({ mode: this.mode, round: this.currentRound });
    }
  }
}
