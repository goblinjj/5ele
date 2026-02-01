import Phaser from 'phaser';
import {
  Wuxing,
  WUXING_COLORS,
  WUXING_NAMES,
  NodeType,
  Skill,
  SkillTrigger,
  Equipment,
  BattleEngine,
  BattleEvent,
  Combatant as EngineCombatant,
  BattleConfig,
  generateEnemies,
  generateLoot,
  getTotalSpeed,
  getAttackWuxing,
  getDefenseWuxing,
  getTotalAttack,
  getTotalDefense,
} from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';

interface DisplayCombatant {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  wuxing?: Wuxing;  // 可选，无属性时为 undefined
  isPlayer: boolean;
  x: number;
  y: number;
  sprite?: Phaser.GameObjects.Container;
}

/**
 * 战斗场景 - 水墨画风格 UI
 */
export class BattleScene extends Phaser.Scene {
  private mode: 'single' | 'multi' = 'single';
  private nodeType: NodeType | 'final' = NodeType.NORMAL_BATTLE;
  private round: number = 1;

  private displayCombatants: Map<string, DisplayCombatant> = new Map();
  private engineCombatants: EngineCombatant[] = [];

  // UI 常量 - 移动端竖屏优化
  private readonly UI = {
    // 战斗区域（竖屏布局）
    battleFieldY: 550,
    playerX: 180,
    enemyStartX: 400,
    enemySpacing: 100,

    // 状态栏
    statusBarY: 80,
    statusBarHeight: 60,

    // HP 条尺寸
    hpBarWidth: 70,
    hpBarHeight: 8,
    hpBarOffsetY: -50,

    // 战斗单位
    playerSize: 45,
    enemySize: 38,

    // 颜色主题 - 水墨画风格
    colors: {
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
    },
  };

  constructor() {
    super({ key: 'BattleScene' });
  }

  init(data: { mode: 'single' | 'multi'; nodeType: NodeType | 'final'; round: number }): void {
    this.mode = data.mode || 'single';
    this.nodeType = data.nodeType || NodeType.NORMAL_BATTLE;
    this.round = data.round || 1;
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // 创建背景层
    this.createBackground();

    // 创建顶部信息栏
    this.createTopBar();

    // 创建战斗场地
    this.createBattleField();

    // 初始化战斗单位
    this.initCombatants();

    // 开始战斗
    this.time.delayedCall(800, () => this.runBattle());
  }

  private createBackground(): void {
    const { width, height } = this.cameras.main;
    const { colors } = this.UI;

    // 深色渐变背景
    const bgGraphics = this.add.graphics();

    // 主背景
    bgGraphics.fillStyle(colors.bgDark, 1);
    bgGraphics.fillRect(0, 0, width, height);

    // 添加微妙的纹理 - 水墨晕染效果
    for (let i = 0; i < 8; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(100, height);
      const radius = Phaser.Math.Between(100, 300);
      bgGraphics.fillStyle(colors.inkBlack, 0.3);
      bgGraphics.fillCircle(x, y, radius);
    }

    // 顶部装饰线
    bgGraphics.lineStyle(2, colors.goldAccent, 0.3);
    bgGraphics.lineBetween(50, 120, width - 50, 120);

    // 底部装饰线
    bgGraphics.lineBetween(50, height - 60, width - 50, height - 60);
  }

  private createTopBar(): void {
    const { width } = this.cameras.main;
    const { colors, statusBarY } = this.UI;

    // 顶部状态栏背景
    const topBarBg = this.add.graphics();
    topBarBg.fillStyle(colors.inkBlack, 0.8);
    topBarBg.fillRoundedRect(20, 15, width - 40, 90, 8);
    topBarBg.lineStyle(1, colors.goldAccent, 0.4);
    topBarBg.strokeRoundedRect(20, 15, width - 40, 90, 8);

    // 战斗标题
    const titleText = this.nodeType === 'final' ? '最终决战' :
                      this.nodeType === NodeType.ELITE_BATTLE ? '精英战斗' : '战斗';

    const titleStyle = {
      fontFamily: '"Noto Serif SC", "Source Han Serif CN", serif',
      fontSize: '32px',
      color: '#f0e6d3',
      fontStyle: 'bold',
    };

    this.add.text(width / 2, 45, titleText, titleStyle).setOrigin(0.5);

    // 回合数 - 左侧
    this.add.text(50, 45, `第 ${this.round} 轮`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '18px',
      color: '#8b949e',
    }).setOrigin(0, 0.5);

    // 玩家状态 - 右侧
    this.createPlayerStatusBar(width - 50, 60);
  }

  private createPlayerStatusBar(x: number, y: number): void {
    const player = gameState.getPlayerState();
    const { colors } = this.UI;

    // HP 显示
    const hpText = this.add.text(x, y - 15, `❤️ ${player.hp}/${player.maxHp}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '16px',
      color: '#f85149',
    }).setOrigin(1, 0.5);

    // 攻防显示
    const statsText = this.add.text(x, y + 15, `⚔ ${gameState.getTotalAttack()}  🛡 ${gameState.getTotalDefense()}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
      color: '#8b949e',
    }).setOrigin(1, 0.5);
  }

  private createBattleField(): void {
    const { width, height } = this.cameras.main;
    const { colors, battleFieldY } = this.UI;

    // 战斗区域背景 - 椭圆形战场
    const fieldGraphics = this.add.graphics();

    // 地面阴影
    fieldGraphics.fillStyle(0x000000, 0.3);
    fieldGraphics.fillEllipse(width / 2, battleFieldY + 80, 600, 120);

    // 战场主体
    fieldGraphics.fillStyle(colors.inkGrey, 0.4);
    fieldGraphics.fillEllipse(width / 2, battleFieldY + 70, 580, 100);

    // 战场边缘高光
    fieldGraphics.lineStyle(2, colors.goldAccent, 0.2);
    fieldGraphics.strokeEllipse(width / 2, battleFieldY + 70, 580, 100);

    // VS 分隔线
    fieldGraphics.lineStyle(1, colors.paperCream, 0.15);
    fieldGraphics.lineBetween(width / 2, battleFieldY - 100, width / 2, battleFieldY + 120);
  }

  private initCombatants(): void {
    const { width } = this.cameras.main;
    const { battleFieldY, playerX, enemyStartX, enemySpacing } = this.UI;

    this.displayCombatants.clear();
    this.engineCombatants = [];

    // 创建玩家 Combatant
    const playerCombatant = this.createPlayerCombatant();
    this.engineCombatants.push(playerCombatant);

    // 创建玩家显示对象
    const playerDisplay: DisplayCombatant = {
      id: playerCombatant.id,
      name: playerCombatant.name,
      hp: playerCombatant.hp,
      maxHp: playerCombatant.maxHp,
      wuxing: playerCombatant.attackWuxing?.wuxing,  // 可能为 undefined
      isPlayer: true,
      x: playerX,
      y: battleFieldY,
    };
    this.displayCombatants.set(playerCombatant.id, playerDisplay);

    // 生成敌人
    const nodeTypeStr = this.getNodeTypeString();
    const enemies = generateEnemies(nodeTypeStr, this.round);

    // 计算敌人位置 - 均匀分布在右侧
    const enemyCount = enemies.length;
    const totalEnemyWidth = (enemyCount - 1) * enemySpacing;
    const startX = enemyStartX + (width - enemyStartX - 100 - totalEnemyWidth) / 2;

    enemies.forEach((enemy, i) => {
      this.engineCombatants.push(enemy);

      const enemyDisplay: DisplayCombatant = {
        id: enemy.id,
        name: enemy.name,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        wuxing: enemy.attackWuxing?.wuxing,  // 敌人通常有五行属性
        isPlayer: false,
        x: startX + i * enemySpacing,
        y: battleFieldY + (i % 2 === 0 ? -20 : 20), // 交错排列
      };
      this.displayCombatants.set(enemy.id, enemyDisplay);
    });

    // 创建精灵 - 使用动画入场
    let delay = 0;
    this.displayCombatants.forEach(c => {
      c.sprite = this.createCombatantSprite(c, delay);
      delay += 100;
    });
  }

  private createPlayerCombatant(): EngineCombatant {
    const playerState = gameState.getPlayerState();
    const equipment = {
      weapon: gameState.getWeapon(),
      armor: gameState.getArmor(),
      treasures: gameState.getTreasures(),
    };

    // 收集技能
    const skills: Skill[] = [];
    const allEquipment: Equipment[] = [...equipment.treasures];
    if (equipment.weapon) allEquipment.push(equipment.weapon);
    if (equipment.armor) allEquipment.push(equipment.armor);

    for (const equip of allEquipment) {
      if (equip.skill) {
        skills.push(equip.skill);
      }
    }

    return {
      id: 'player',
      name: playerState.name,
      hp: playerState.hp,
      maxHp: playerState.maxHp,
      attack: getTotalAttack(equipment),
      defense: getTotalDefense(equipment),
      speed: getTotalSpeed(equipment),
      attackWuxing: getAttackWuxing(equipment),
      defenseWuxing: getDefenseWuxing(equipment),
      skills,
      isPlayer: true,
      frozen: false,
      attackDebuff: 0,
    };
  }

  private getNodeTypeString(): 'normal' | 'elite' | 'final' {
    if (this.nodeType === 'final') return 'final';
    if (this.nodeType === NodeType.ELITE_BATTLE) return 'elite';
    return 'normal';
  }

  private createCombatantSprite(combatant: DisplayCombatant, delay: number = 0): Phaser.GameObjects.Container {
    const { colors, hpBarWidth, hpBarHeight, hpBarOffsetY, playerSize, enemySize } = this.UI;

    const container = this.add.container(combatant.x, combatant.y + 50);
    container.setAlpha(0);

    // 战斗单位主体
    const bodySize = combatant.isPlayer ? playerSize : enemySize;
    // 无属性时使用灰色
    const bodyColor = combatant.wuxing !== undefined ? WUXING_COLORS[combatant.wuxing] : 0x8b949e;

    // 外圈光环
    const aura = this.add.circle(0, 0, bodySize + 8, bodyColor, 0.2);

    // 主体圆形
    const body = this.add.circle(0, 0, bodySize, bodyColor);
    body.setStrokeStyle(3, colors.paperWhite, 0.6);

    // 五行符号 - 中心（无属性显示"无"）
    const wuxingSymbol = this.getWuxingSymbol(combatant.wuxing);
    const symbolText = this.add.text(0, 0, wuxingSymbol, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: combatant.isPlayer ? '28px' : '22px',
      color: '#ffffff',
    }).setOrigin(0.5);

    // 名称标签 - 上方
    const nameY = hpBarOffsetY - 25;
    const nameBg = this.add.rectangle(0, nameY, 100, 22, colors.inkBlack, 0.8);
    nameBg.setStrokeStyle(1, bodyColor, 0.5);

    const nameText = this.add.text(0, nameY, combatant.name, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
      color: '#f0e6d3',
    }).setOrigin(0.5);

    // HP 条背景
    const hpBarBg = this.add.rectangle(0, hpBarOffsetY, hpBarWidth + 4, hpBarHeight + 4, colors.inkBlack);
    hpBarBg.setStrokeStyle(1, colors.inkGrey);

    // HP 条本体 - 从左对齐
    const hpBar = this.add.rectangle(
      -hpBarWidth / 2,
      hpBarOffsetY,
      hpBarWidth,
      hpBarHeight,
      colors.greenAccent
    );
    hpBar.setOrigin(0, 0.5);
    hpBar.setName('hpBar');

    // HP 数值文字
    const hpText = this.add.text(0, hpBarOffsetY, `${combatant.hp}`, {
      fontFamily: 'monospace',
      fontSize: '10px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    hpText.setName('hpText');

    // 玩家标识
    if (combatant.isPlayer) {
      const playerMarker = this.add.text(0, bodySize + 20, '▲ 玩家', {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '12px',
        color: colors.goldAccent.toString(16).padStart(6, '0'),
      }).setOrigin(0.5);
      container.add(playerMarker);
    }

    container.add([aura, body, symbolText, nameBg, nameText, hpBarBg, hpBar, hpText]);

    // 入场动画
    this.tweens.add({
      targets: container,
      y: combatant.y,
      alpha: 1,
      duration: 400,
      delay: delay,
      ease: 'Back.easeOut',
    });

    // 光环呼吸动画
    this.tweens.add({
      targets: aura,
      scaleX: 1.1,
      scaleY: 1.1,
      alpha: 0.1,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.updateHpBar(combatant);

    return container;
  }

  private getWuxingSymbol(wuxing?: Wuxing): string {
    if (wuxing === undefined) return '无';  // 无属性
    switch (wuxing) {
      case Wuxing.METAL: return '金';
      case Wuxing.WOOD: return '木';
      case Wuxing.WATER: return '水';
      case Wuxing.FIRE: return '火';
      case Wuxing.EARTH: return '土';
      default: return '?';
    }
  }

  private async runBattle(): Promise<void> {
    await this.showCenterText('战斗开始！', '#f0e6d3');

    // 创建战斗引擎并运行
    const config: BattleConfig = {
      allowEquipmentChange: this.nodeType !== 'final',
      isPvP: false,
    };

    const engine = new BattleEngine(this.engineCombatants, config);
    const result = engine.run();

    // 播放所有事件
    for (const event of result.events) {
      await this.playEvent(event);
    }

    // 同步玩家 HP
    const playerSurvivor = result.survivingCombatants.find(c => c.isPlayer);
    if (playerSurvivor) {
      gameState.getPlayerState().hp = playerSurvivor.hp;
    } else {
      gameState.getPlayerState().hp = 0;
    }

    // 战斗结束处理
    await this.delay(300);

    if (result.winnerId) {
      await this.showCenterText('胜利！', '#3fb950');
      await this.handleVictory();
    } else {
      await this.delay(500);
      this.showGameOver();
    }
  }

  private async playEvent(event: BattleEvent): Promise<void> {
    switch (event.type) {
      case 'battle_start':
      case 'round_start':
      case 'turn_start':
        break;

      case 'skill_trigger':
        if (event.actorId && event.skillName) {
          const actor = this.displayCombatants.get(event.actorId);
          if (actor) {
            this.showSkillTrigger(actor, event.skillName);
            await this.delay(300);
          }
        }
        break;

      case 'damage':
        if (event.targetId && event.value !== undefined) {
          const target = this.displayCombatants.get(event.targetId);
          const actor = event.actorId ? this.displayCombatants.get(event.actorId) : null;

          if (target) {
            if (actor && actor.id !== target.id) {
              await this.playAttackAnimation(actor, target);
            }

            if (event.wuxingEffect === 'conquer') {
              this.showWuxingEffect(target, '克制', true);
            }

            target.hp = Math.max(0, target.hp - event.value);
            this.showDamage(target, event.value, event.isCritical || false);
            this.updateHpBar(target);
            await this.delay(250);
          }
        }
        break;

      case 'heal':
        if (event.targetId && event.value !== undefined) {
          const target = this.displayCombatants.get(event.targetId);
          if (target) {
            if (event.wuxingEffect === 'generate') {
              this.showWuxingEffect(target, '相生', false);
            }
            target.hp = Math.min(target.maxHp, target.hp + event.value);
            this.showHeal(target, event.value);
            this.updateHpBar(target);
            await this.delay(300);
          }
        }
        break;

      case 'miss':
        if (event.targetId) {
          const target = this.displayCombatants.get(event.targetId);
          if (target) {
            this.showMiss(target);
            await this.delay(300);
          }
        }
        break;

      case 'frozen_skip':
        if (event.actorId) {
          const actor = this.displayCombatants.get(event.actorId);
          if (actor) {
            this.showStatus(actor, '冻结!', '#58a6ff');
            await this.delay(400);
          }
        }
        break;

      case 'death':
        if (event.targetId) {
          const target = this.displayCombatants.get(event.targetId);
          if (target) {
            await this.playDeathAnimation(target);
          }
        }
        break;

      case 'round_end':
      case 'battle_end':
        break;
    }
  }

  private async handleVictory(): Promise<void> {
    const nodeTypeStr = this.getNodeTypeString();
    const dropRate = gameState.getPlayerState().dropRate;
    const loot = generateLoot(nodeTypeStr, this.round, dropRate);

    await this.showLootScreen(loot.items);

    let fragmentsGained = 0;
    for (const item of loot.items) {
      if (!gameState.isInventoryFull()) {
        gameState.addToInventory(item);
      } else {
        fragmentsGained++;
        gameState.addFragment();
      }
    }

    if (fragmentsGained > 0) {
      await this.showCenterText(`${fragmentsGained} 件物品炼化`, '#d4a853');
      await this.delay(500);
    }

    this.scene.start('MapScene', {
      mode: this.mode,
      round: this.round + 1,
    });
  }

  private async showLootScreen(items: Equipment[]): Promise<void> {
    const { width, height } = this.cameras.main;
    const { colors } = this.UI;

    // 全屏容器
    const lootContainer = this.add.container(0, 0);

    // 半透明遮罩
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.9);
    lootContainer.add(overlay);

    // 标题
    const title = this.add.text(width / 2, 80, '战利品', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '32px',
      color: '#d4a853',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    lootContainer.add(title);

    // 装备图标网格
    const slotSize = 70;
    const cols = Math.min(items.length, 5);
    const rows = Math.ceil(items.length / cols);
    const gridWidth = cols * slotSize;
    const startX = (width - gridWidth) / 2 + slotSize / 2;
    const startY = 180;

    // 当前弹窗
    let currentPopup: Phaser.GameObjects.Container | null = null;

    const closePopup = () => {
      if (currentPopup) {
        currentPopup.destroy();
        currentPopup = null;
      }
    };

    // 创建装备图标
    items.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * slotSize;
      const y = startY + row * slotSize;

      const slotContainer = this.add.container(x, y);
      lootContainer.add(slotContainer);

      // 槽位背景
      const wuxingColor = item.wuxing !== undefined ? WUXING_COLORS[item.wuxing] : 0x8b949e;
      const bg = this.add.rectangle(0, 0, 60, 60, colors.inkBlack, 0.9);
      bg.setStrokeStyle(2, wuxingColor, 0.8);
      bg.setInteractive({ useHandCursor: true });
      slotContainer.add(bg);

      // 装备图标
      const icon = this.add.circle(0, -3, 20, wuxingColor);
      icon.setStrokeStyle(2, 0xffffff, 0.4);
      slotContainer.add(icon);

      // 五行等级
      const levelStr = item.wuxing !== undefined ? `${item.wuxingLevel ?? 1}` : '-';
      const levelText = this.add.text(0, -3, levelStr, {
        fontFamily: 'monospace',
        fontSize: '14px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      slotContainer.add(levelText);

      // 类型图标
      const typeIcon = item.type === 'weapon' ? '⚔️' : item.type === 'armor' ? '🛡️' : '💎';
      const typeText = this.add.text(0, 22, typeIcon, {
        fontSize: '12px',
      }).setOrigin(0.5);
      slotContainer.add(typeText);

      // 点击显示弹窗
      bg.on('pointerup', () => {
        closePopup();
        currentPopup = this.createLootPopup(item, width / 2, height / 2 + 50);
        lootContainer.add(currentPopup);
      });
    });

    // 物品数量提示
    const countText = this.add.text(width / 2, startY + rows * slotSize + 30, `共 ${items.length} 件`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
      color: '#8b949e',
    }).setOrigin(0.5);
    lootContainer.add(countText);

    // 继续冒险按钮
    const btnY = height - 120;
    const btnWidth = 200;
    const btnHeight = 50;

    const btnBg = this.add.rectangle(width / 2, btnY, btnWidth, btnHeight, colors.goldAccent);
    btnBg.setStrokeStyle(2, 0xffffff, 0.5);
    btnBg.setInteractive({ useHandCursor: true });
    lootContainer.add(btnBg);

    const btnText = this.add.text(width / 2, btnY, '继续冒险', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '20px',
      color: '#0d1117',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    lootContainer.add(btnText);

    btnBg.on('pointerover', () => {
      btnBg.setFillStyle(0xffffff);
    });

    btnBg.on('pointerout', () => {
      btnBg.setFillStyle(colors.goldAccent);
    });

    // 等待点击继续
    await new Promise<void>(resolve => {
      btnBg.on('pointerup', () => {
        lootContainer.destroy();
        resolve();
      });
    });
  }

  private createLootPopup(item: Equipment, x: number, y: number): Phaser.GameObjects.Container {
    const { colors } = this.UI;
    const popup = this.add.container(x, y);

    const panelHeight = item.skill ? 280 : 220;

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(colors.inkBlack, 0.98);
    bg.fillRoundedRect(-150, -panelHeight / 2, 300, panelHeight, 12);
    bg.lineStyle(2, colors.goldAccent, 0.6);
    bg.strokeRoundedRect(-150, -panelHeight / 2, 300, panelHeight, 12);
    popup.add(bg);

    let yOffset = -panelHeight / 2 + 25;

    // 名称
    const nameText = this.add.text(0, yOffset, item.name, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '20px',
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    popup.add(nameText);

    yOffset += 30;

    // 稀有度
    const rarityText = this.add.text(0, yOffset, this.getRarityNameCN(item.rarity), {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
      color: this.getRarityColor(item.rarity),
    }).setOrigin(0.5);
    popup.add(rarityText);

    yOffset += 25;

    // 五行
    const wuxingColor = item.wuxing !== undefined ? WUXING_COLORS[item.wuxing] : 0x8b949e;
    const wuxingName = item.wuxing !== undefined ? WUXING_NAMES[item.wuxing] : '无';
    const wuxingLevelStr = item.wuxing !== undefined ? ` Lv.${item.wuxingLevel ?? 1}` : '';
    const wuxingText = this.add.text(0, yOffset, `${wuxingName}属性${wuxingLevelStr}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
      color: '#' + wuxingColor.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);
    popup.add(wuxingText);

    yOffset += 25;

    // 攻防
    if (item.attack) {
      const attackText = this.add.text(0, yOffset, `攻击 +${item.attack}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '14px',
        color: '#f85149',
      }).setOrigin(0.5);
      popup.add(attackText);
      yOffset += 22;
    }

    if (item.defense) {
      const defenseText = this.add.text(0, yOffset, `防御 +${item.defense}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '14px',
        color: '#58a6ff',
      }).setOrigin(0.5);
      popup.add(defenseText);
      yOffset += 22;
    }

    // 技能
    if (item.skill) {
      yOffset += 5;
      const skillNameText = this.add.text(0, yOffset, `【${item.skill.name}】`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '14px',
        color: '#d4a853',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      popup.add(skillNameText);

      yOffset += 20;
      const skillDescText = this.add.text(0, yOffset, item.skill.description, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '12px',
        color: '#8b949e',
        wordWrap: { width: 260 },
        align: 'center',
      }).setOrigin(0.5, 0);
      popup.add(skillDescText);
    }

    // 关闭提示
    const closeText = this.add.text(0, panelHeight / 2 - 20, '点击其他地方关闭', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '11px',
      color: '#6e7681',
    }).setOrigin(0.5);
    popup.add(closeText);

    return popup;
  }

  private getRarityNameCN(rarity: string): string {
    switch (rarity) {
      case 'legendary': return '传说';
      case 'epic': return '史诗';
      case 'rare': return '稀有';
      case 'uncommon': return '优秀';
      default: return '普通';
    }
  }

  private getRarityColor(rarity: string): string {
    switch (rarity) {
      case 'legendary': return '#ff8c00';
      case 'epic': return '#a855f7';
      case 'rare': return '#58a6ff';
      case 'uncommon': return '#3fb950';
      default: return '#f0e6d3';
    }
  }

  private showFloatingText(
    combatant: DisplayCombatant,
    text: string,
    color: string = '#ffffff',
    fontSize: number = 24,
    offsetY: number = -100
  ): void {
    if (!combatant.sprite) return;

    const floatText = this.add.text(combatant.x, combatant.y + offsetY, text, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${fontSize}px`,
      color: color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);

    // 弹出+上浮动画
    this.tweens.add({
      targets: floatText,
      y: floatText.y - 40,
      scaleX: { from: 0.5, to: 1 },
      scaleY: { from: 0.5, to: 1 },
      duration: 200,
      ease: 'Back.easeOut',
    });

    this.tweens.add({
      targets: floatText,
      y: floatText.y - 80,
      alpha: 0,
      duration: 600,
      delay: 400,
      ease: 'Power2',
      onComplete: () => floatText.destroy(),
    });
  }

  private showDamage(combatant: DisplayCombatant, damage: number, isCrit: boolean = false): void {
    const color = isCrit ? '#ff6b6b' : '#f85149';
    const size = isCrit ? 32 : 26;
    const text = isCrit ? `${damage}!` : `-${damage}`;
    this.showFloatingText(combatant, text, color, size);

    // 受击震动效果
    if (combatant.sprite) {
      this.tweens.add({
        targets: combatant.sprite,
        x: combatant.x + 8,
        duration: 50,
        yoyo: true,
        repeat: 2,
      });
    }
  }

  private showHeal(combatant: DisplayCombatant, amount: number): void {
    this.showFloatingText(combatant, `+${amount}`, '#3fb950', 24);
  }

  private showMiss(combatant: DisplayCombatant): void {
    this.showFloatingText(combatant, 'MISS', '#8b949e', 20);
  }

  private showSkillTrigger(combatant: DisplayCombatant, skillName: string): void {
    this.showFloatingText(combatant, `【${skillName}】`, '#d4a853', 16, -120);
  }

  private showStatus(combatant: DisplayCombatant, status: string, color: string = '#58a6ff'): void {
    this.showFloatingText(combatant, status, color, 18, -120);
  }

  private showWuxingEffect(combatant: DisplayCombatant, effectName: string, isConquer: boolean): void {
    const color = isConquer ? '#ff9500' : '#3fb950';
    this.showFloatingText(combatant, effectName, color, 18, -120);
  }

  private showCenterText(text: string, color: string = '#f0e6d3'): Promise<void> {
    return new Promise(resolve => {
      const { width, height } = this.cameras.main;

      // 背景遮罩
      const mask = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5);

      const centerText = this.add.text(width / 2, height / 2, text, {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: '48px',
        color: color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      }).setOrigin(0.5).setAlpha(0);

      this.tweens.add({
        targets: centerText,
        alpha: 1,
        scaleX: { from: 0.3, to: 1.1 },
        scaleY: { from: 0.3, to: 1.1 },
        duration: 300,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: [centerText, mask],
            alpha: 0,
            duration: 400,
            delay: 600,
            onComplete: () => {
              centerText.destroy();
              mask.destroy();
              resolve();
            },
          });
        },
      });
    });
  }

  private showGameOver(): void {
    const { width, height } = this.cameras.main;
    const { colors } = this.UI;

    // 全屏遮罩
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.9);

    // 失败面板
    const panelWidth = 400;
    const panelHeight = 250;
    const panelBg = this.add.graphics();
    panelBg.fillStyle(colors.inkBlack, 0.95);
    panelBg.fillRoundedRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 12);
    panelBg.lineStyle(2, colors.redAccent, 0.6);
    panelBg.strokeRoundedRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 12);

    // 失败标题
    this.add.text(width / 2, height / 2 - 60, '败 北', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '56px',
      color: '#f85149',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 副标题
    this.add.text(width / 2, height / 2, '西游路漫漫，来日再战', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '18px',
      color: '#8b949e',
    }).setOrigin(0.5);

    // 返回按钮
    const btnWidth = 160;
    const btnHeight = 45;
    const btnY = height / 2 + 70;

    const btnBg = this.add.rectangle(width / 2, btnY, btnWidth, btnHeight, colors.inkGrey);
    btnBg.setStrokeStyle(2, colors.paperCream, 0.5);
    btnBg.setInteractive({ useHandCursor: true });

    const btnText = this.add.text(width / 2, btnY, '返回主菜单', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '18px',
      color: '#f0e6d3',
    }).setOrigin(0.5);

    btnBg.on('pointerover', () => {
      btnBg.setFillStyle(colors.goldAccent);
      btnText.setColor('#0d1117');
    });

    btnBg.on('pointerout', () => {
      btnBg.setFillStyle(colors.inkGrey);
      btnText.setColor('#f0e6d3');
    });

    btnBg.on('pointerup', () => {
      gameState.reset();
      this.scene.start('MenuScene');
    });
  }

  private async playAttackAnimation(attacker: DisplayCombatant, defender: DisplayCombatant): Promise<void> {
    if (!attacker.sprite) return;

    const originalX = attacker.x;
    const originalY = attacker.y;

    // 冲刺
    await new Promise<void>(resolve => {
      this.tweens.add({
        targets: attacker.sprite,
        x: defender.x - (attacker.isPlayer ? 60 : -60),
        y: defender.y,
        duration: 120,
        ease: 'Power3.easeIn',
        onComplete: () => resolve(),
      });
    });

    // 攻击闪光
    if (defender.sprite) {
      const flash = this.add.circle(defender.x, defender.y, 60, 0xffffff, 0.6);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        scale: 1.5,
        duration: 200,
        onComplete: () => flash.destroy(),
      });
    }

    // 返回
    await new Promise<void>(resolve => {
      this.tweens.add({
        targets: attacker.sprite,
        x: originalX,
        y: originalY,
        duration: 150,
        ease: 'Power2.easeOut',
        onComplete: () => resolve(),
      });
    });
  }

  private async playDeathAnimation(combatant: DisplayCombatant): Promise<void> {
    if (!combatant.sprite) return;

    // 闪烁 + 缩小消失
    await new Promise<void>(resolve => {
      this.tweens.add({
        targets: combatant.sprite,
        alpha: 0,
        scaleX: 0,
        scaleY: 0,
        angle: combatant.isPlayer ? -45 : 45,
        duration: 400,
        ease: 'Power2.easeIn',
        onComplete: () => {
          combatant.sprite?.destroy();
          resolve();
        },
      });
    });
  }

  private updateHpBar(combatant: DisplayCombatant): void {
    if (!combatant.sprite) return;
    const { colors, hpBarWidth } = this.UI;

    const hpBar = combatant.sprite.getByName('hpBar') as Phaser.GameObjects.Rectangle;
    const hpText = combatant.sprite.getByName('hpText') as Phaser.GameObjects.Text;

    if (hpBar) {
      const hpPercent = Math.max(0, combatant.hp / combatant.maxHp);
      const newWidth = hpBarWidth * hpPercent;

      // 平滑动画
      this.tweens.add({
        targets: hpBar,
        width: newWidth,
        duration: 200,
        ease: 'Power2.easeOut',
      });

      // 颜色变化
      let barColor: number;
      if (hpPercent < 0.25) {
        barColor = colors.redAccent;
      } else if (hpPercent < 0.5) {
        barColor = 0xeab308;
      } else {
        barColor = colors.greenAccent;
      }
      hpBar.setFillStyle(barColor);
    }

    if (hpText) {
      hpText.setText(`${combatant.hp}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => this.time.delayedCall(ms, resolve));
  }
}
