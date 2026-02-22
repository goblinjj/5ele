import Phaser from 'phaser';
import { NodeType, GameNode, WUXING_COLORS, WUXING_NAMES, generateEnemies, Combatant } from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';
import { uiConfig, LAYOUT } from '../config/uiConfig.js';

interface BattleNodeInfo extends GameNode {
  enemies?: Combatant[];
}

/**
 * 地图场景 - 响应式布局（基于屏幕百分比）
 */
export class MapScene extends Phaser.Scene {
  private mode: 'single' | 'multi' = 'single';
  private currentRound: number = 1;
  private maxRounds: number = 7; // 第7轮为最终局
  private nodeOptions: BattleNodeInfo[] = [];

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
    super({ key: 'MapScene' });
  }

  init(data: { mode: 'single' | 'multi'; round?: number }): void {
    this.mode = data.mode || 'single';
    this.currentRound = data.round || 1;
  }

  create(): void {
    this.createBackground();
    this.createHeader();
    this.createPlayerStatus();
    this.generateNodeOptions();
    this.displayNodes();
  }

  private createBackground(): void {
    const { width, height } = this.cameras.main;

    const bgGraphics = this.add.graphics();
    bgGraphics.fillStyle(this.colors.bgDark, 1);
    bgGraphics.fillRect(0, 0, width, height);

    for (let i = 0; i < 6; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(height * 0.15, height);
      const radius = Phaser.Math.Between(width * 0.06, width * 0.15);
      bgGraphics.fillStyle(this.colors.inkBlack, 0.4);
      bgGraphics.fillCircle(x, y, radius);
    }
  }

  private createHeader(): void {
    const { width, height } = this.cameras.main;

    // 顶部栏 - 高度 10%
    const headerHeight = height * 0.1;
    const headerBg = this.add.graphics();
    headerBg.fillStyle(this.colors.inkBlack, 0.9);
    headerBg.fillRect(0, 0, width, headerHeight);

    // 回合数
    this.add.text(width / 2, headerHeight / 2, `第 ${this.currentRound} / ${this.maxRounds} 轮`, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontLG}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);
  }

  private createPlayerStatus(): void {
    const { width, height } = this.cameras.main;
    const y = height * 0.14;
    const statHeight = height * 0.06;

    // 属性背景
    const statsBg = this.add.graphics();
    statsBg.fillStyle(this.colors.inkGrey, 0.5);
    statsBg.fillRoundedRect(width * 0.02, y - statHeight / 2, width * 0.96, statHeight, 8);

    const player = gameState.getPlayerState();

    // HP 条
    const hpBarWidth = width * 0.1;
    const hpPercent = player.hp / player.maxHp;
    const hpX = width * 0.04;

    this.add.rectangle(hpX + hpBarWidth / 2, y, hpBarWidth + 4, 18, this.colors.inkBlack);

    const hpBar = this.add.rectangle(
      hpX,
      y,
      hpBarWidth * hpPercent,
      14,
      hpPercent > 0.5 ? this.colors.greenAccent : hpPercent > 0.25 ? 0xeab308 : this.colors.redAccent
    );
    hpBar.setOrigin(0, 0.5);

    this.add.text(hpX + hpBarWidth / 2, y, `${player.hp}/${player.maxHp}`, {
      fontFamily: 'monospace',
      fontSize: `${uiConfig.fontXS}px`,
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 攻防速（横向排列）
    const statsX = width * 0.18;
    this.add.text(statsX, y, `⚔️ ${gameState.getTotalAttack()}  🛡️ ${gameState.getTotalDefense()}  ⚡ ${gameState.getTotalSpeed()}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#8b949e',
    }).setOrigin(0, 0.5);

    // 五行显示
    const weapon = gameState.getWeapon();
    const armor = gameState.getArmor();
    let wuxingX = width * 0.3;
    const circleSize = Math.max(10, Math.min(15, width * 0.012));

    if (weapon && weapon.wuxing !== undefined) {
      const color = WUXING_COLORS[weapon.wuxing];
      this.add.circle(wuxingX, y, circleSize, color).setStrokeStyle(1, 0xffffff, 0.5);
      this.add.text(wuxingX, y, `${weapon.wuxingLevel ?? 1}`, {
        fontFamily: 'monospace',
        fontSize: `${uiConfig.fontXS}px`,
        color: '#ffffff',
      }).setOrigin(0.5);
      wuxingX += circleSize * 3;
    }

    if (armor && armor.wuxing !== undefined) {
      const color = WUXING_COLORS[armor.wuxing];
      this.add.circle(wuxingX, y, circleSize, color).setStrokeStyle(1, 0xffffff, 0.5);
      this.add.text(wuxingX, y, `${armor.wuxingLevel ?? 1}`, {
        fontFamily: 'monospace',
        fontSize: `${uiConfig.fontXS}px`,
        color: '#ffffff',
      }).setOrigin(0.5);
    }

    // 碎片
    const fragments = gameState.getFragmentCount();
    if (fragments > 0) {
      this.add.text(width * 0.96, y, `💎 ${fragments}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontSM}px`,
        color: '#a855f7',
      }).setOrigin(1, 0.5);
    }
  }

  private generateNodeOptions(): void {
    this.nodeOptions = [];
    const playerState = gameState.getPlayerState();

    // 第7轮是最终局，只有一个选择：最终Boss战斗
    if (this.currentRound >= this.maxRounds) {
      const enemies = generateEnemies('final', this.currentRound, playerState.monsterScaling, playerState.monsterCountBonus);
      this.nodeOptions.push({
        type: NodeType.ELITE_BATTLE,
        name: '病变核心',
        description: '净化区域深处的病变之源',
        enemies: enemies,
      });
      return;
    }

    // 第一个必定是战斗节点
    const battleRoll = Math.random();
    if (battleRoll < 0.7) {
      const enemies = generateEnemies('normal', this.currentRound, playerState.monsterScaling, playerState.monsterCountBonus);
      this.nodeOptions.push({
        type: NodeType.NORMAL_BATTLE,
        name: '普通战斗',
        description: '遭遇一群妖异',
        enemies: enemies,
      });
    } else {
      const enemies = generateEnemies('elite', this.currentRound, playerState.monsterScaling, playerState.monsterCountBonus);
      this.nodeOptions.push({
        type: NodeType.ELITE_BATTLE,
        name: '精英战斗',
        description: '遭遇强大妖异，五行之力充沛',
        enemies: enemies,
      });
    }

    // 生成额外的节点选项，但休整最多只能有1个
    let restCount = 0;
    for (let i = 0; i < 2; i++) {
      let node = this.randomNode();
      // 如果已经有休整节点了，重新生成直到不是休整
      while (node.type === NodeType.REST && restCount >= 1) {
        node = this.randomNode();
      }
      if (node.type === NodeType.REST) {
        restCount++;
      }
      this.nodeOptions.push(node);
    }

    this.shuffleArray(this.nodeOptions);
  }

  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  private randomNode(): BattleNodeInfo {
    const roll = Math.random();
    const playerState = gameState.getPlayerState();
    let type: NodeType;
    let name: string;
    let description: string;
    let enemies: Combatant[] | undefined;

    if (roll < 0.35) {
      type = NodeType.REST;
      name = '休整';
      description = '恢复生命值';
    } else if (roll < 0.55) {
      type = NodeType.NORMAL_BATTLE;
      name = '普通战斗';
      description = '遭遇一群妖异';
      enemies = generateEnemies('normal', this.currentRound, playerState.monsterScaling, playerState.monsterCountBonus);
    } else if (roll < 0.75) {
      type = NodeType.RANDOM_EVENT;
      name = '随机事件';
      description = '未知的遭遇...';
    } else if (roll < 0.88) {
      type = NodeType.ELITE_BATTLE;
      name = '精英战斗';
      description = '遭遇强大妖异，五行之力充沛';
      enemies = generateEnemies('elite', this.currentRound, playerState.monsterScaling, playerState.monsterCountBonus);
    } else {
      type = NodeType.STORY;
      name = '命脉奇遇';
      description = '探索五行脉络的奥秘';
    }

    return { type, name, description, enemies };
  }

  private displayNodes(): void {
    const { width, height } = this.cameras.main;

    // 标题
    this.add.text(width / 2, height * 0.22, '选择气穴', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontLG}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 2 列 Grid 布局
    const cols = 2;
    const cardWidth = Math.max(160, Math.min(300, width * 0.44));
    const cardHeight = Math.max(110, Math.min(160, height * 0.13));
    const colSpacing = cardWidth * 1.1;
    const rowSpacing = cardHeight * 1.2;
    const gridWidth = (cols - 1) * colSpacing;
    const startX = width / 2 - gridWidth / 2;
    const startY = height * 0.30;

    this.nodeOptions.forEach((node, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * colSpacing;
      const y = startY + row * rowSpacing;
      this.createNodeCard(x, y, node, index, cardWidth, cardHeight);
    });
  }

  private createNodeCard(x: number, y: number, node: BattleNodeInfo, index: number, cardWidth: number, cardHeight: number): void {
    const { width, height } = this.cameras.main;
    const nodeColor = this.getNodeColor(node.type);

    const container = this.add.container(x, y + 30);
    container.setAlpha(0);

    // 卡片背景
    const bgGraphics = this.add.graphics();
    bgGraphics.fillStyle(this.colors.inkBlack, 0.9);
    bgGraphics.fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 12);
    bgGraphics.lineStyle(2, nodeColor, 0.6);
    bgGraphics.strokeRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 12);
    container.add(bgGraphics);

    // 左右布局：35% 图标区域，65% 文字区域
    const iconAreaX = uiConfig.getIconCenterX(cardWidth);
    const textAreaX = uiConfig.getTextStartX(cardWidth);
    const textWidth = uiConfig.getTextWidth(cardWidth);

    // 如果是战斗节点，显示敌人预览
    if (node.enemies && node.enemies.length > 0) {
      const enemyIconSize = Math.max(22, Math.min(32, cardWidth * 0.11));
      const enemySpacing = enemyIconSize * 1.3;
      const maxPerRow = 2;

      node.enemies.forEach((enemy, i) => {
        const row = Math.floor(i / maxPerRow);
        const col = i % maxPerRow;
        const ex = iconAreaX - (maxPerRow - 1) * enemySpacing / 2 + col * enemySpacing;
        const ey = -cardHeight * 0.1 + row * enemySpacing;
        const enemyColor = enemy.attackWuxing?.wuxing !== undefined ? WUXING_COLORS[enemy.attackWuxing.wuxing] : 0x8b949e;

        const enemyIcon = this.add.circle(ex, ey, enemyIconSize, enemyColor, 0.9);
        enemyIcon.setStrokeStyle(2, 0xffffff, 0.5);
        container.add(enemyIcon);

        const levelStr = enemy.attackWuxing?.level?.toString() ?? '?';
        const levelText = this.add.text(ex, ey, levelStr, {
          fontFamily: 'monospace',
          fontSize: `${uiConfig.fontMD}px`,
          color: '#ffffff',
          fontStyle: 'bold',
        }).setOrigin(0.5);
        container.add(levelText);
      });
    } else {
      // 非战斗节点显示图标
      const iconSize = Math.max(35, Math.min(50, cardWidth * 0.16));
      const iconBg = this.add.circle(iconAreaX, 0, iconSize, nodeColor, 0.3);
      iconBg.setStrokeStyle(2, nodeColor, 0.6);
      container.add(iconBg);

      const icon = this.add.text(iconAreaX, 0, this.getNodeIcon(node.type), {
        fontSize: `${uiConfig.fontXL}px`,
      }).setOrigin(0.5);
      container.add(icon);
    }

    // 右侧文字区域（左对齐）
    const nameText = this.add.text(textAreaX, -cardHeight * 0.18, node.name, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontLG}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    container.add(nameText);

    const descText = this.add.text(textAreaX, cardHeight * 0.05, node.description, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: '#8b949e',
      wordWrap: { width: textWidth },
    }).setOrigin(0, 0.5);
    container.add(descText);

    // 额外信息
    const infoText = this.getNodeInfo(node.type);
    if (infoText) {
      const info = this.add.text(textAreaX, cardHeight * 0.28, infoText, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontSM}px`,
        color: this.getNodeInfoColor(node.type),
      }).setOrigin(0, 0.5);
      container.add(info);
    }

    // 交互区域
    const hitArea = this.add.rectangle(0, 0, cardWidth, cardHeight, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });
    container.add(hitArea);

    // 入场动画 - 从下方弹入
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
      });
      bgGraphics.clear();
      bgGraphics.fillStyle(this.colors.inkBlack, 0.95);
      bgGraphics.fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 12);
      bgGraphics.lineStyle(3, this.colors.goldAccent, 1);
      bgGraphics.strokeRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 12);
    });

    hitArea.on('pointerout', () => {
      this.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 150,
      });
      bgGraphics.clear();
      bgGraphics.fillStyle(this.colors.inkBlack, 0.9);
      bgGraphics.fillRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 12);
      bgGraphics.lineStyle(2, nodeColor, 0.6);
      bgGraphics.strokeRoundedRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight, 12);
    });

    hitArea.on('pointerup', () => this.selectNode(node, index));
  }

  private getNodeColor(type: NodeType): number {
    switch (type) {
      case NodeType.NORMAL_BATTLE: return 0x6e7681;
      case NodeType.REST: return this.colors.greenAccent;
      case NodeType.ELITE_BATTLE: return this.colors.redAccent;
      case NodeType.STORY: return 0xa855f7;
      case NodeType.RANDOM_EVENT: return this.colors.goldAccent;
      default: return this.colors.inkGrey;
    }
  }

  private getNodeIcon(type: NodeType): string {
    switch (type) {
      case NodeType.NORMAL_BATTLE: return '⚔️';
      case NodeType.REST: return '🏕️';
      case NodeType.ELITE_BATTLE: return '👹';
      case NodeType.STORY: return '📜';
      case NodeType.RANDOM_EVENT: return '❓';
      default: return '❔';
    }
  }

  private getNodeInfo(type: NodeType): string | null {
    switch (type) {
      case NodeType.REST: return '恢复全部生命';
      case NodeType.ELITE_BATTLE: return '高难度·高奖励';
      default: return null;
    }
  }

  private getNodeInfoColor(type: NodeType): string {
    switch (type) {
      case NodeType.REST: return '#3fb950';
      case NodeType.ELITE_BATTLE: return '#f85149';
      default: return '#8b949e';
    }
  }

  private selectNode(node: BattleNodeInfo, index: number): void {
    if (node.type === NodeType.REST) {
      this.showRestEffect();
    } else if (node.type === NodeType.NORMAL_BATTLE || node.type === NodeType.ELITE_BATTLE) {
      // 如果是最终局（第7轮），传递 'final' 类型
      const nodeType = this.currentRound >= this.maxRounds ? 'final' : node.type;
      this.scene.start('BattleScene', {
        mode: this.mode,
        nodeType: nodeType,
        round: this.currentRound,
        enemies: node.enemies, // 传递预生成的敌人
      });
    } else if (node.type === NodeType.STORY) {
      this.scene.start('BattleScene', {
        mode: this.mode,
        nodeType: node.type,
        round: this.currentRound,
        enemies: node.enemies, // 传递预生成的敌人
      });
    } else {
      this.handleRandomEvent();
    }
  }

  private showRestEffect(): void {
    const { width, height } = this.cameras.main;

    gameState.fullHeal();

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8);

    const panelWidth = Math.min(300, width * 0.6);
    const panelHeight = Math.min(160, height * 0.25);
    const panelBg = this.add.graphics();
    panelBg.fillStyle(this.colors.inkBlack, 0.95);
    panelBg.fillRoundedRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 12);
    panelBg.lineStyle(2, this.colors.greenAccent, 0.6);
    panelBg.strokeRoundedRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 12);

    const icon = this.add.text(width / 2, height / 2 - panelHeight * 0.2, '🏕️', {
      fontSize: `${uiConfig.font2XL}px`,
    }).setOrigin(0.5);

    const text = this.add.text(width / 2, height / 2 + panelHeight * 0.15, '休息中...\n生命值已恢复', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontLG}px`,
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

    const panelWidth = Math.min(300, width * 0.6);
    const panelHeight = Math.min(160, height * 0.25);
    const panelBg = this.add.graphics();
    panelBg.fillStyle(this.colors.inkBlack, 0.95);
    panelBg.fillRoundedRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 12);
    panelBg.lineStyle(2, isGood ? this.colors.greenAccent : this.colors.redAccent, 0.6);
    panelBg.strokeRoundedRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 12);

    const icon = this.add.text(width / 2, height / 2 - panelHeight * 0.2, emoji, {
      fontSize: `${uiConfig.font2XL}px`,
    }).setOrigin(0.5);

    const text = this.add.text(width / 2, height / 2 + panelHeight * 0.15, message, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontMD}px`,
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
