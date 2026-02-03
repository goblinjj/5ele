import Phaser from 'phaser';
import {
  Wuxing,
  WUXING_COLORS,
  WUXING_NAMES,
  NodeType,
  Skill,
  Equipment,
  Rarity,
  BattleEngine,
  BattleEvent,
  Combatant as EngineCombatant,
  BattleConfig,
  RoundResult,
  generateEnemies,
  generateLoot,
  getTotalSpeed,
  getAttackWuxing,
  getDefenseWuxing,
  getTotalAttack,
  getTotalDefense,
  getAllWuxingLevels,
  StatusType,
} from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';
import { uiConfig, LAYOUT } from '../config/uiConfig.js';

interface DisplayCombatant {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  wuxing?: Wuxing;
  isPlayer: boolean;
  x: number;
  y: number;
  sprite?: Phaser.GameObjects.Container;
}

/**
 * 战斗场景 - 响应式布局
 */
export class BattleScene extends Phaser.Scene {
  private mode: 'single' | 'multi' = 'single';
  private nodeType: NodeType | 'final' = NodeType.NORMAL_BATTLE;
  private round: number = 1;
  private preGeneratedEnemies?: EngineCombatant[];

  private displayCombatants: Map<string, DisplayCombatant> = new Map();
  private engineCombatants: EngineCombatant[] = [];
  private enemyCount: number = 0;

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
    super({ key: 'BattleScene' });
  }

  init(data: { mode: 'single' | 'multi'; nodeType: NodeType | 'final'; round: number; enemies?: EngineCombatant[] }): void {
    this.mode = data.mode || 'single';
    this.nodeType = data.nodeType || NodeType.NORMAL_BATTLE;
    this.round = data.round || 1;
    this.preGeneratedEnemies = data.enemies;
  }

  private inventoryButton?: Phaser.GameObjects.Container;
  private topBarHpText?: Phaser.GameObjects.Text;
  private battleEngine?: BattleEngine;
  private equipmentChanged: boolean = false;

  create(): void {
    this.createBackground();
    this.createTopBar();
    this.createBattleField();
    this.createInventoryButton();
    this.initCombatants();

    // 直接开始战斗
    this.time.delayedCall(800, () => this.runBattle());
  }

  private createBackground(): void {
    const { width, height } = this.cameras.main;

    const bgGraphics = this.add.graphics();
    bgGraphics.fillStyle(this.colors.bgDark, 1);
    bgGraphics.fillRect(0, 0, width, height);

    for (let i = 0; i < 8; i++) {
      const x = Phaser.Math.Between(0, width);
      const y = Phaser.Math.Between(height * 0.15, height);
      const radius = Phaser.Math.Between(width * 0.08, width * 0.2);
      bgGraphics.fillStyle(this.colors.inkBlack, 0.3);
      bgGraphics.fillCircle(x, y, radius);
    }

    bgGraphics.lineStyle(2, this.colors.goldAccent, 0.3);
    bgGraphics.lineBetween(width * 0.04, height * 0.17, width * 0.96, height * 0.17);
    bgGraphics.lineBetween(width * 0.04, height * 0.92, width * 0.96, height * 0.92);
  }

  private createTopBar(): void {
    const { width, height } = this.cameras.main;

    const topBarBg = this.add.graphics();
    topBarBg.fillStyle(this.colors.inkBlack, 0.8);
    topBarBg.fillRoundedRect(width * 0.02, height * 0.02, width * 0.96, height * 0.13, 8);
    topBarBg.lineStyle(1, this.colors.goldAccent, 0.4);
    topBarBg.strokeRoundedRect(width * 0.02, height * 0.02, width * 0.96, height * 0.13, 8);

    const titleText = this.nodeType === 'final' ? '病变核心' :
                      this.nodeType === NodeType.ELITE_BATTLE ? '精英战斗' : '战斗';

    this.add.text(width / 2, height * 0.065, titleText, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontXL}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width * 0.04, height * 0.065, `第 ${this.round} 轮`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#8b949e',
    }).setOrigin(0, 0.5);

    this.createPlayerStatusBar(width * 0.96, height * 0.065);
  }

  private createPlayerStatusBar(x: number, y: number): void {
    const player = gameState.getPlayerState();

    this.topBarHpText = this.add.text(x, y - 12, `❤️ ${player.hp}/${player.maxHp}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#f85149',
    }).setOrigin(1, 0.5);

    this.add.text(x, y + 12, `⚔ ${gameState.getTotalAttack()}  🛡 ${gameState.getTotalDefense()}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontXS}px`,
      color: '#8b949e',
    }).setOrigin(1, 0.5);
  }

  private updateTopBarHp(): void {
    if (this.topBarHpText) {
      const player = gameState.getPlayerState();
      this.topBarHpText.setText(`❤️ ${player.hp}/${player.maxHp}`);
    }
  }

  private createBattleField(): void {
    const { width, height } = this.cameras.main;
    const battleFieldY = height * 0.6;

    const fieldGraphics = this.add.graphics();

    fieldGraphics.fillStyle(0x000000, 0.3);
    fieldGraphics.fillEllipse(width / 2, battleFieldY + height * 0.12, width * 0.55, height * 0.18);

    fieldGraphics.fillStyle(this.colors.inkGrey, 0.4);
    fieldGraphics.fillEllipse(width / 2, battleFieldY + height * 0.1, width * 0.53, height * 0.15);

    fieldGraphics.lineStyle(2, this.colors.goldAccent, 0.2);
    fieldGraphics.strokeEllipse(width / 2, battleFieldY + height * 0.1, width * 0.53, height * 0.15);

    fieldGraphics.lineStyle(1, this.colors.paperCream, 0.15);
    fieldGraphics.lineBetween(width / 2, battleFieldY - height * 0.15, width / 2, battleFieldY + height * 0.18);
  }

  private createInventoryButton(): void {
    const { width, height } = this.cameras.main;

    // 背包按钮 - 放在右下角
    const btnWidth = width * 0.08;
    const btnHeight = height * 0.06;
    const btnX = width * 0.94;
    const btnY = height * 0.88;

    this.inventoryButton = this.add.container(btnX, btnY);

    const btnBg = this.add.rectangle(0, 0, btnWidth, btnHeight, this.colors.inkBlack, 0.9);
    btnBg.setStrokeStyle(2, this.colors.goldAccent, 0.6);
    btnBg.setInteractive({ useHandCursor: true });
    this.inventoryButton.add(btnBg);

    const btnText = this.add.text(0, 0, '📦 灵囊', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontSM}px`,
      color: '#f0e6d3',
    }).setOrigin(0.5);
    this.inventoryButton.add(btnText);

    btnBg.on('pointerover', () => {
      btnBg.setFillStyle(this.colors.goldAccent);
      btnText.setColor('#0d1117');
    });

    btnBg.on('pointerout', () => {
      btnBg.setFillStyle(this.colors.inkBlack);
      btnText.setColor('#f0e6d3');
    });

    btnBg.on('pointerup', () => {
      this.openInventory();
    });
  }

  private openInventory(): void {
    // 暂停战斗场景，打开背包
    this.scene.pause();
    this.scene.launch('InventoryScene');
    this.scene.get('InventoryScene').events.once('shutdown', () => {
      this.scene.resume();
      // 标记装备已更换，下一回合计算时会使用新装备
      this.equipmentChanged = true;
      // 刷新玩家显示
      this.refreshPlayerCombatant();
      this.updateTopBarStats();
    });
  }

  private updateTopBarStats(): void {
    // 这里可以更新顶部状态栏，但由于顶部栏是静态创建的，
    // 最简单的方式是不做任何事情（下次战斗会正确显示）
    // 如果需要实时更新，可以将状态栏元素保存为类成员变量
  }

  private initCombatants(): void {
    const { width, height } = this.cameras.main;
    const battleFieldY = height * 0.55;
    const playerX = width * 0.28;
    const enemyStartX = width * 0.58;
    const enemySpacing = width * 0.12;

    this.displayCombatants.clear();
    this.engineCombatants = [];

    const playerCombatant = this.createPlayerCombatant();
    this.engineCombatants.push(playerCombatant);

    const playerDisplay: DisplayCombatant = {
      id: playerCombatant.id,
      name: playerCombatant.name,
      hp: playerCombatant.hp,
      maxHp: playerCombatant.maxHp,
      wuxing: playerCombatant.attackWuxing?.wuxing,
      isPlayer: true,
      x: playerX,
      y: battleFieldY,
    };
    this.displayCombatants.set(playerCombatant.id, playerDisplay);

    // 使用预生成的敌人，或者重新生成
    let enemies: EngineCombatant[];
    if (this.preGeneratedEnemies && this.preGeneratedEnemies.length > 0) {
      // 深拷贝预生成的敌人，避免修改原数据
      enemies = this.preGeneratedEnemies.map(e => ({ ...e }));
    } else {
      const playerState = gameState.getPlayerState();
      const nodeTypeStr = this.getNodeTypeString();
      enemies = generateEnemies(
        nodeTypeStr,
        this.round,
        playerState.monsterScaling,
        playerState.monsterCountBonus
      );
    }
    this.enemyCount = enemies.length;

    const totalEnemyWidth = (enemies.length - 1) * enemySpacing;
    const startX = enemyStartX + (width * 0.35 - totalEnemyWidth) / 2;

    enemies.forEach((enemy, i) => {
      this.engineCombatants.push(enemy);

      const enemyDisplay: DisplayCombatant = {
        id: enemy.id,
        name: enemy.name,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        wuxing: enemy.attackWuxing?.wuxing,
        isPlayer: false,
        x: startX + i * enemySpacing,
        y: battleFieldY + (i % 2 === 0 ? -height * 0.04 : height * 0.04),
      };
      this.displayCombatants.set(enemy.id, enemyDisplay);
    });

    let delay = 0;
    this.displayCombatants.forEach(c => {
      c.sprite = this.createCombatantSprite(c, delay);
      delay += 150;
    });
  }

  private createPlayerCombatant(): EngineCombatant {
    const playerState = gameState.getPlayerState();
    const equipment = {
      weapon: gameState.getWeapon(),
      armor: gameState.getArmor(),
      treasures: gameState.getTreasures(),
    };

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
      hasWuxingMastery: gameState.hasStatus(StatusType.WUXING_MASTERY),
      allWuxingLevels: getAllWuxingLevels(equipment),
    };
  }

  private getNodeTypeString(): 'normal' | 'elite' | 'final' {
    if (this.nodeType === 'final') return 'final';
    if (this.nodeType === NodeType.ELITE_BATTLE) return 'elite';
    return 'normal';
  }

  private createCombatantSprite(combatant: DisplayCombatant, delay: number = 0): Phaser.GameObjects.Container {
    const { width, height } = this.cameras.main;
    const hpBarWidth = width * 0.07;
    const hpBarHeight = height * 0.015;
    const hpBarOffsetY = -height * 0.08;
    const playerSize = width * 0.045;
    const enemySize = width * 0.038;

    const container = this.add.container(combatant.x, combatant.y + height * 0.08);
    container.setAlpha(0);

    const bodySize = combatant.isPlayer ? playerSize : enemySize;
    const bodyColor = combatant.wuxing !== undefined ? WUXING_COLORS[combatant.wuxing] : 0x8b949e;

    const aura = this.add.circle(0, 0, bodySize + 10, bodyColor, 0.2);
    const body = this.add.circle(0, 0, bodySize, bodyColor);
    body.setStrokeStyle(3, this.colors.paperWhite, 0.6);

    const wuxingSymbol = this.getWuxingSymbol(combatant.wuxing);
    const symbolText = this.add.text(0, 0, wuxingSymbol, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${combatant.isPlayer ? uiConfig.fontLG : uiConfig.fontMD}px`,
      color: '#ffffff',
    }).setOrigin(0.5);

    const nameY = hpBarOffsetY - height * 0.035;
    const nameBg = this.add.rectangle(0, nameY, width * 0.09, height * 0.03, this.colors.inkBlack, 0.8);
    nameBg.setStrokeStyle(1, bodyColor, 0.5);

    const nameText = this.add.text(0, nameY, combatant.name, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontXS}px`,
      color: '#f0e6d3',
    }).setOrigin(0.5);

    const hpBarBg = this.add.rectangle(0, hpBarOffsetY, hpBarWidth + 4, hpBarHeight + 4, this.colors.inkBlack);
    hpBarBg.setStrokeStyle(1, this.colors.inkGrey);

    // 根据实际HP百分比创建血条
    const hpPercent = Math.max(0, combatant.hp / combatant.maxHp);
    const initialWidth = hpBarWidth * hpPercent;
    let barColor: number;
    if (hpPercent < 0.25) {
      barColor = this.colors.redAccent;
    } else if (hpPercent < 0.5) {
      barColor = 0xeab308;
    } else {
      barColor = this.colors.greenAccent;
    }

    const hpBar = this.add.rectangle(
      -hpBarWidth / 2,
      hpBarOffsetY,
      initialWidth,
      hpBarHeight,
      barColor
    );
    hpBar.setOrigin(0, 0.5);
    hpBar.setName('hpBar');
    hpBar.setData('maxWidth', hpBarWidth);

    const hpText = this.add.text(0, hpBarOffsetY, `${combatant.hp}`, {
      fontFamily: 'monospace',
      fontSize: `${uiConfig.fontXS - 2}px`,
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    hpText.setName('hpText');

    if (combatant.isPlayer) {
      const playerMarker = this.add.text(0, bodySize + height * 0.035, '▲ 玩家', {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontXS}px`,
        color: '#d4a853',
      }).setOrigin(0.5);
      container.add(playerMarker);
    }

    container.add([aura, body, symbolText, nameBg, nameText, hpBarBg, hpBar, hpText]);

    this.tweens.add({
      targets: container,
      y: combatant.y,
      alpha: 1,
      duration: 500,
      delay: delay,
      ease: 'Back.easeOut',
    });

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

    return container;
  }

  private getWuxingSymbol(wuxing?: Wuxing): string {
    if (wuxing === undefined) return '无';
    switch (wuxing) {
      case Wuxing.METAL: return '金';
      case Wuxing.WOOD: return '木';
      case Wuxing.WATER: return '水';
      case Wuxing.FIRE: return '火';
      case Wuxing.EARTH: return '土';
      default: return '?';
    }
  }

  private refreshPlayerCombatant(): void {
    // 更新玩家战斗者数据
    const newPlayerCombatant = this.createPlayerCombatant();
    const index = this.engineCombatants.findIndex(c => c.isPlayer);
    if (index >= 0) {
      this.engineCombatants[index] = newPlayerCombatant;
    }

    // 更新显示
    const playerDisplay = this.displayCombatants.get('player');
    if (playerDisplay) {
      playerDisplay.wuxing = newPlayerCombatant.attackWuxing?.wuxing;
      playerDisplay.hp = newPlayerCombatant.hp;
      playerDisplay.maxHp = newPlayerCombatant.maxHp;

      // 重新创建sprite
      if (playerDisplay.sprite) {
        playerDisplay.sprite.destroy();
      }
      playerDisplay.sprite = this.createCombatantSprite(playerDisplay, 0);
    }
  }

  private async runBattle(): Promise<void> {
    await this.showCenterText('战斗开始！', '#f0e6d3');

    const config: BattleConfig = {
      allowEquipmentChange: this.nodeType !== 'final',
      isPvP: false,
    };

    // 创建战斗引擎并初始化
    this.battleEngine = new BattleEngine(this.engineCombatants, config);
    this.equipmentChanged = false;

    // 播放初始化事件
    const initEvents = this.battleEngine.initialize();
    for (const event of initEvents) {
      await this.playEvent(event);
    }

    // 逐回合计算和播放
    while (!this.battleEngine.isBattleOver()) {
      // 如果装备更换了，更新玩家数据
      if (this.equipmentChanged) {
        this.updateEnginePlayerData();
        this.equipmentChanged = false;
      }

      // 计算单个回合
      const roundResult = this.battleEngine.runSingleRound();

      // 播放回合事件
      for (const event of roundResult.events) {
        await this.playEvent(event);
      }

      // 同步显示状态
      this.syncDisplayFromEngine();

      if (roundResult.isOver) {
        break;
      }
    }

    // 播放战斗结束事件
    await this.playEvent({ type: 'battle_end' });

    // 同步最终状态
    const combatants = this.battleEngine.getCombatants();
    const playerCombatant = combatants.find(c => c.isPlayer);
    if (playerCombatant) {
      gameState.getPlayerState().hp = playerCombatant.hp;
    } else {
      gameState.getPlayerState().hp = 0;
    }

    await this.delay(500);

    const winnerId = this.battleEngine.getWinnerId();
    if (winnerId) {
      await this.showCenterText('净化！', '#3fb950');
      await this.handleVictory();
    } else {
      await this.delay(500);
      this.showGameOver();
    }
  }

  /**
   * 更新战斗引擎中的玩家数据（换装后调用）
   */
  private updateEnginePlayerData(): void {
    if (!this.battleEngine) return;

    const newPlayerData = this.createPlayerCombatant();
    this.battleEngine.updatePlayerCombatant({
      attack: newPlayerData.attack,
      defense: newPlayerData.defense,
      speed: newPlayerData.speed,
      attackWuxing: newPlayerData.attackWuxing,
      defenseWuxing: newPlayerData.defenseWuxing,
      skills: newPlayerData.skills,
    });
  }

  /**
   * 从引擎同步显示状态
   */
  private syncDisplayFromEngine(): void {
    if (!this.battleEngine) return;

    const combatants = this.battleEngine.getCombatants();
    for (const combatant of combatants) {
      const display = this.displayCombatants.get(combatant.id);
      if (display) {
        display.hp = combatant.hp;
        display.wuxing = combatant.attackWuxing?.wuxing;
      }
    }
  }

  private async playEvent(event: BattleEvent): Promise<void> {
    const damageDelay = 400;
    const turnDelay = 600;

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
            await this.delay(damageDelay);
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
              this.showWuxingEffect(target, '克制！', true);
            }

            target.hp = Math.max(0, target.hp - event.value);
            this.showDamage(target, event.value, event.isCritical || false);
            this.createHitParticles(target);
            this.updateHpBar(target);
            // 如果是玩家受伤，更新顶部血条
            if (target.isPlayer) {
              gameState.getPlayerState().hp = target.hp;
              this.updateTopBarHp();
            }
            await this.delay(damageDelay);
          }
        }
        break;

      case 'heal':
        if (event.targetId && event.value !== undefined) {
          const target = this.displayCombatants.get(event.targetId);
          if (target) {
            if (event.wuxingEffect === 'generate') {
              this.showWuxingEffect(target, '相生！', false);
            }
            target.hp = Math.min(target.maxHp, target.hp + event.value);
            this.showHeal(target, event.value);
            this.createHealParticles(target);
            this.updateHpBar(target);
            // 如果是玩家治疗，更新顶部血条
            if (target.isPlayer) {
              gameState.getPlayerState().hp = target.hp;
              this.updateTopBarHp();
            }
            await this.delay(damageDelay);
          }
        }
        break;

      case 'miss':
        if (event.targetId) {
          const target = this.displayCombatants.get(event.targetId);
          if (target) {
            this.showMiss(target);
            await this.delay(damageDelay);
          }
        }
        break;

      case 'frozen_skip':
        if (event.actorId) {
          const actor = this.displayCombatants.get(event.actorId);
          if (actor) {
            this.showStatus(actor, '冻结!', '#58a6ff');
            await this.delay(turnDelay);
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

      // 五行状态效果事件
      case 'status_applied':
        if (event.targetId) {
          const target = this.displayCombatants.get(event.targetId);
          if (target) {
            const statusColors: Record<string, string> = {
              bleeding: '#c94a4a',   // 红色 - 流血
              burning: '#ff9500',    // 橙色 - 灼烧
              slowed: '#58a6ff',     // 蓝色 - 减速
              frozen: '#58a6ff',     // 蓝色 - 冻结
              embers: '#ff6b6b',     // 红橙色 - 余烬
            };
            const color = statusColors[event.statusType || ''] || '#d4a853';
            const stackStr = event.stacks && event.stacks > 1 ? ` x${event.stacks}` : '';
            this.showStatus(target, `${event.message || event.statusType}${stackStr}`, color);
            await this.delay(damageDelay / 2);
          }
        }
        break;

      case 'status_damage':
        if (event.targetId && event.value !== undefined) {
          const target = this.displayCombatants.get(event.targetId);
          if (target) {
            const color = event.statusType === 'bleeding' ? '#c94a4a' : '#ff9500';
            target.hp = Math.max(0, target.hp - event.value);
            // 显示技能名称和伤害值
            const skillName = event.message || (event.statusType === 'bleeding' ? '流血' : '灼烧');
            this.showFloatingText(target, `${skillName} -${event.value}`, color, 20, -100);
            this.updateHpBar(target);
            if (target.isPlayer) {
              gameState.getPlayerState().hp = target.hp;
              this.updateTopBarHp();
            }
            await this.delay(damageDelay / 2);
          }
        }
        break;

      case 'status_heal':
        if (event.targetId && event.value !== undefined) {
          const target = this.displayCombatants.get(event.targetId);
          if (target) {
            target.hp = Math.min(target.maxHp, target.hp + event.value);
            // 显示技能名称和回复值
            const skillName = event.message || '生机';
            this.showFloatingText(target, `${skillName} +${event.value}`, '#22c55e', 20, -100);
            this.createHealParticles(target);
            this.updateHpBar(target);
            if (target.isPlayer) {
              gameState.getPlayerState().hp = target.hp;
              this.updateTopBarHp();
            }
            await this.delay(damageDelay / 2);
          }
        }
        break;

      case 'armor_penetrate':
        if (event.targetId && event.value !== undefined) {
          const target = this.displayCombatants.get(event.targetId);
          if (target) {
            // 显示破金额外伤害（伤害已包含在主伤害中，这里只是展示效果）
            const skillName = event.message || '破金';
            this.showFloatingText(target, `${skillName} +${event.value}`, '#c0c0c0', 18, -60);
            await this.delay(damageDelay / 4);
          }
        }
        break;

      case 'damage_reduced':
        if (event.targetId && event.value !== undefined) {
          const target = this.displayCombatants.get(event.targetId);
          if (target) {
            // 显示坚韧减伤效果（不减少HP，只是显示减少了多少伤害）
            const skillName = event.message || '坚韧';
            this.showFloatingText(target, `${skillName} -${event.value}`, '#8b5a2b', 18, -80);
            await this.delay(damageDelay / 4);
          }
        }
        break;

      case 'reflect_damage':
        if (event.targetId && event.value !== undefined) {
          const target = this.displayCombatants.get(event.targetId);
          if (target) {
            target.hp = Math.max(0, target.hp - event.value);
            this.showFloatingText(target, `反震 -${event.value}`, '#eab308', 22, -100);
            this.createHitParticles(target);
            this.updateHpBar(target);
            if (target.isPlayer) {
              gameState.getPlayerState().hp = target.hp;
              this.updateTopBarHp();
            }
            await this.delay(damageDelay);
          }
        }
        break;

      case 'survive_lethal':
        if (event.targetId) {
          const target = this.displayCombatants.get(event.targetId);
          if (target) {
            target.hp = 1;
            this.showFloatingText(target, '不朽!', '#22c55e', 26, -130);
            this.updateHpBar(target);
            if (target.isPlayer) {
              gameState.getPlayerState().hp = target.hp;
              this.updateTopBarHp();
            }
            await this.delay(damageDelay);
          }
        }
        break;

      case 'revive':
        if (event.targetId && event.value !== undefined) {
          const target = this.displayCombatants.get(event.targetId);
          if (target) {
            target.hp = event.value;
            // 重建精灵显示复活
            if (target.sprite) {
              target.sprite.destroy();
            }
            target.sprite = this.createCombatantSprite(target, 0);
            this.showFloatingText(target, '涅槃重生!', '#d4a853', 28, -130);
            if (target.isPlayer) {
              gameState.getPlayerState().hp = target.hp;
              this.updateTopBarHp();
            }
            await this.delay(turnDelay);
          }
        }
        break;

      case 'burn_explode':
        if (event.targetId && event.value !== undefined) {
          const target = this.displayCombatants.get(event.targetId);
          if (target) {
            target.hp = Math.max(0, target.hp - event.value);
            const skillName = event.message || '灼烧引爆';
            this.showFloatingText(target, `${skillName} -${event.value}`, '#ff6b6b', 28, -100);
            this.createExplosionParticles(target);
            this.updateHpBar(target);
            if (target.isPlayer) {
              gameState.getPlayerState().hp = target.hp;
              this.updateTopBarHp();
            }
            await this.delay(damageDelay);
          }
        }
        break;

      case 'freeze_shatter':
        if (event.targetId && event.value !== undefined) {
          const target = this.displayCombatants.get(event.targetId);
          if (target) {
            target.hp = Math.max(0, target.hp - event.value);
            const skillName = event.message || '冻结破碎';
            this.showFloatingText(target, `${skillName} -${event.value}`, '#58a6ff', 24, -100);
            this.createHitParticles(target);
            this.updateHpBar(target);
            if (target.isPlayer) {
              gameState.getPlayerState().hp = target.hp;
              this.updateTopBarHp();
            }
            await this.delay(damageDelay);
          }
        }
        break;

      case 'round_end':
        await this.delay(turnDelay);
        break;

      case 'battle_end':
        break;
    }
  }

  private createExplosionParticles(target: DisplayCombatant): void {
    if (!target.sprite) return;

    // 火焰爆炸粒子效果
    for (let i = 0; i < 15; i++) {
      const angle = (i / 15) * Math.PI * 2;
      const particle = this.add.circle(
        target.x,
        target.y,
        Phaser.Math.Between(5, 12),
        Phaser.Math.Between(0, 1) > 0.5 ? 0xff6b6b : 0xff9500
      );

      const distance = Phaser.Math.Between(60, 120);
      this.tweens.add({
        targets: particle,
        x: target.x + Math.cos(angle) * distance,
        y: target.y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0,
        duration: 500,
        ease: 'Power2.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private createHitParticles(target: DisplayCombatant): void {
    if (!target.sprite) return;

    for (let i = 0; i < 8; i++) {
      const particle = this.add.circle(
        target.x + Phaser.Math.Between(-20, 20),
        target.y + Phaser.Math.Between(-20, 20),
        Phaser.Math.Between(3, 8),
        0xff6b6b
      );

      this.tweens.add({
        targets: particle,
        x: particle.x + Phaser.Math.Between(-60, 60),
        y: particle.y + Phaser.Math.Between(-80, -20),
        alpha: 0,
        scale: 0,
        duration: 500,
        ease: 'Power2.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private createHealParticles(target: DisplayCombatant): void {
    if (!target.sprite) return;

    for (let i = 0; i < 6; i++) {
      const particle = this.add.circle(
        target.x + Phaser.Math.Between(-30, 30),
        target.y + 30,
        Phaser.Math.Between(4, 8),
        0x3fb950
      );

      this.tweens.add({
        targets: particle,
        y: particle.y - 80,
        alpha: 0,
        duration: 800,
        delay: i * 50,
        ease: 'Power2.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private async handleVictory(): Promise<void> {
    const nodeTypeStr = this.getNodeTypeString();
    const playerState = gameState.getPlayerState();
    const loot = generateLoot(nodeTypeStr, this.round, playerState.dropRate, this.enemyCount);

    await this.showLootScreen(loot.items);
  }

  private async showLootScreen(items: Equipment[]): Promise<void> {
    const { width, height } = this.cameras.main;

    // 立即将战利品加入背包
    let fragmentsGained = 0;
    for (const item of items) {
      if (!gameState.isInventoryFull()) {
        gameState.addToInventory(item);
      } else {
        fragmentsGained++;
        gameState.addFragment();
      }
    }

    const lootContainer = this.add.container(0, 0);

    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.9);
    lootContainer.add(overlay);

    const title = this.add.text(width / 2, height * 0.08, '塑形器物', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.font2XL}px`,
      color: '#d4a853',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    lootContainer.add(title);

    // 增大槽位尺寸
    const slotSize = Math.max(70, Math.min(95, width * 0.075));
    const cols = Math.min(items.length, 8);
    const rows = Math.ceil(items.length / cols);
    const slotSpacing = slotSize * 1.1;
    const gridWidth = cols * slotSpacing;
    const startX = (width - gridWidth) / 2 + slotSpacing / 2;
    const startY = height * 0.22;

    let currentPopup: Phaser.GameObjects.Container | null = null;
    let popupOverlay: Phaser.GameObjects.Rectangle | null = null;

    const closePopup = () => {
      if (currentPopup) {
        currentPopup.destroy();
        currentPopup = null;
      }
      if (popupOverlay) {
        popupOverlay.destroy();
        popupOverlay = null;
      }
    };

    items.forEach((item, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * slotSpacing;
      const y = startY + row * slotSpacing;

      const slotContainer = this.add.container(x, y);
      lootContainer.add(slotContainer);

      const wuxingColor = item.wuxing !== undefined ? WUXING_COLORS[item.wuxing] : 0x8b949e;
      const borderColor = this.getRarityBorderColor(item.rarity);

      const bg = this.add.rectangle(0, 0, slotSize * 0.9, slotSize * 0.9, this.colors.inkBlack, 0.9);
      bg.setStrokeStyle(3, borderColor, 0.8);
      bg.setInteractive({ useHandCursor: true });
      slotContainer.add(bg);

      const icon = this.add.circle(0, -slotSize * 0.08, slotSize * 0.32, wuxingColor);
      icon.setStrokeStyle(2, 0xffffff, 0.5);
      slotContainer.add(icon);

      const levelStr = item.wuxing !== undefined ? `${item.wuxingLevel ?? 1}` : '-';
      const levelText = this.add.text(0, -slotSize * 0.08, levelStr, {
        fontFamily: 'monospace',
        fontSize: `${uiConfig.fontMD}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      slotContainer.add(levelText);

      const typeIcon = item.type === 'weapon' ? '⚔️' : item.type === 'armor' ? '🛡️' : '💎';
      const typeText = this.add.text(0, slotSize * 0.3, typeIcon, {
        fontSize: `${uiConfig.fontMD}px`,
      }).setOrigin(0.5);
      slotContainer.add(typeText);

      bg.on('pointerup', () => {
        closePopup();
        // 创建点击其他区域关闭的遮罩
        popupOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5);
        popupOverlay.setInteractive();
        popupOverlay.on('pointerup', closePopup);
        lootContainer.add(popupOverlay);

        currentPopup = this.createLootPopup(item, width / 2, height / 2);
        lootContainer.add(currentPopup);

        // 连接弹窗内的关闭按钮
        const closeBtn = currentPopup.getData('closeBtn') as Phaser.GameObjects.Rectangle;
        if (closeBtn) {
          closeBtn.on('pointerup', closePopup);
        }
      });
    });

    const countText = this.add.text(width / 2, startY + rows * slotSpacing + 25, `共 ${items.length} 件`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: '#8b949e',
    }).setOrigin(0.5);
    lootContainer.add(countText);

    if (fragmentsGained > 0) {
      const fragmentText = this.add.text(width / 2, startY + rows * slotSpacing + 50, `${fragmentsGained} 件器物已归元为碎片`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontSM}px`,
        color: '#a855f7',
      }).setOrigin(0.5);
      lootContainer.add(fragmentText);
    }

    const btnY = height * 0.88;
    const btnWidth = width * 0.15;
    const btnHeight = height * 0.08;
    const btnSpacing = width * 0.18;

    // 背包按钮
    const bagBtnBg = this.add.rectangle(width / 2 - btnSpacing / 2, btnY, btnWidth, btnHeight, this.colors.inkGrey);
    bagBtnBg.setStrokeStyle(2, this.colors.goldAccent, 0.5);
    bagBtnBg.setInteractive({ useHandCursor: true });
    lootContainer.add(bagBtnBg);

    const bagBtnText = this.add.text(width / 2 - btnSpacing / 2, btnY, '📦 灵囊', {
      fontFamily: '"Noto Sans SC", serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: '#f0e6d3',
    }).setOrigin(0.5);
    lootContainer.add(bagBtnText);

    bagBtnBg.on('pointerover', () => {
      bagBtnBg.setFillStyle(this.colors.goldAccent);
      bagBtnText.setColor('#0d1117');
    });
    bagBtnBg.on('pointerout', () => {
      bagBtnBg.setFillStyle(this.colors.inkGrey);
      bagBtnText.setColor('#f0e6d3');
    });
    bagBtnBg.on('pointerup', () => {
      this.scene.pause();
      this.scene.launch('InventoryScene');
      this.scene.get('InventoryScene').events.once('shutdown', () => {
        this.scene.resume();
      });
    });

    // 继续探索按钮
    const continueBtnBg = this.add.rectangle(width / 2 + btnSpacing / 2, btnY, btnWidth, btnHeight, this.colors.goldAccent);
    continueBtnBg.setStrokeStyle(2, 0xffffff, 0.5);
    continueBtnBg.setInteractive({ useHandCursor: true });
    lootContainer.add(continueBtnBg);

    const continueBtnText = this.add.text(width / 2 + btnSpacing / 2, btnY, '选择气穴', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: '#0d1117',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    lootContainer.add(continueBtnText);

    continueBtnBg.on('pointerover', () => continueBtnBg.setFillStyle(0xffffff));
    continueBtnBg.on('pointerout', () => continueBtnBg.setFillStyle(this.colors.goldAccent));

    await new Promise<void>(resolve => {
      continueBtnBg.on('pointerup', () => {
        lootContainer.destroy();
        resolve();
      });
    });

    if (this.nodeType === 'final') {
      this.showGameComplete();
      return;
    }

    this.scene.start('MapScene', {
      mode: this.mode,
      round: this.round + 1,
    });
  }

  private createLootPopup(item: Equipment, x: number, y: number): Phaser.GameObjects.Container {
    const { width, height } = this.cameras.main;
    const popup = this.add.container(x, y);

    // 响应式尺寸 - 更大的弹窗
    const panelWidth = Math.max(500, Math.min(700, width * 0.58));
    const panelHeight = Math.max(320, Math.min(420, height * 0.6));
    const borderColor = this.getRarityBorderColor(item.rarity);

    const bg = this.add.graphics();
    bg.fillStyle(this.colors.inkBlack, 0.98);
    bg.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
    bg.lineStyle(3, borderColor, 0.9);
    bg.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
    popup.add(bg);

    const iconRadius = Math.max(50, Math.min(70, panelHeight * 0.16));

    // 左右布局：35% 图标，65% 文字
    const iconX = uiConfig.getIconCenterX(panelWidth);
    const textX = uiConfig.getTextStartX(panelWidth);
    const textWidth = uiConfig.getTextWidth(panelWidth);
    const wuxingColor = item.wuxing !== undefined ? WUXING_COLORS[item.wuxing] : 0x8b949e;

    // 左侧：装备图标
    const icon = this.add.circle(iconX, -panelHeight * 0.08, iconRadius, wuxingColor);
    icon.setStrokeStyle(4, 0xffffff, 0.6);
    popup.add(icon);

    const levelStr = item.wuxing !== undefined ? `${item.wuxingLevel ?? 1}` : '-';
    const levelText = this.add.text(iconX, -panelHeight * 0.08, levelStr, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontXL}px`,
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    popup.add(levelText);

    // 类型图标
    const typeIcon = item.type === 'weapon' ? '⚔️' : item.type === 'armor' ? '🛡️' : '💎';
    const typeIconText = this.add.text(iconX, panelHeight * 0.1, typeIcon, {
      fontSize: `${uiConfig.fontXL}px`,
    }).setOrigin(0.5);
    popup.add(typeIconText);

    // 右侧：文字信息
    let yOffset = -panelHeight * 0.32;

    // 名称
    const nameText = this.add.text(textX, yOffset, item.name, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontXL}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);
    popup.add(nameText);

    yOffset += uiConfig.fontXL + 12;

    // 类型 + 稀有度
    const typeName = item.type === 'weapon' ? '武器' : item.type === 'armor' ? '铠甲' : '灵器';
    const typeRarityText = this.add.text(textX, yOffset, `${typeName} · ${this.getRarityNameCN(item.rarity)}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontLG}px`,
      color: this.getRarityColor(item.rarity),
    }).setOrigin(0, 0.5);
    popup.add(typeRarityText);

    yOffset += uiConfig.fontLG + 10;

    // 五行属性
    const wuxingName = item.wuxing !== undefined ? WUXING_NAMES[item.wuxing] : '无';
    const wuxingLevelStr = item.wuxing !== undefined ? ` Lv.${item.wuxingLevel ?? 1}` : '';
    const wuxingText = this.add.text(textX, yOffset, `${wuxingName}属性${wuxingLevelStr}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontLG}px`,
      color: '#' + wuxingColor.toString(16).padStart(6, '0'),
    }).setOrigin(0, 0.5);
    popup.add(wuxingText);

    yOffset += uiConfig.fontLG + 10;

    // 攻防
    const stats: string[] = [];
    if (item.attack) stats.push(`攻击 +${item.attack}`);
    if (item.defense) stats.push(`防御 +${item.defense}`);
    if (stats.length > 0) {
      const statsText = this.add.text(textX, yOffset, stats.join('   '), {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontMD}px`,
        color: '#f0e6d3',
      }).setOrigin(0, 0.5);
      popup.add(statsText);
      yOffset += uiConfig.fontMD + 10;
    }

    // 技能
    if (item.skill) {
      yOffset += 5;
      const skillNameText = this.add.text(textX, yOffset, `【${item.skill.name}】`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontLG}px`,
        color: '#d4a853',
        fontStyle: 'bold',
      }).setOrigin(0, 0.5);
      popup.add(skillNameText);

      yOffset += uiConfig.fontLG + 8;
      const skillDescText = this.add.text(textX, yOffset, item.skill.description, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontSM}px`,
        color: '#8b949e',
        wordWrap: { width: textWidth },
      }).setOrigin(0, 0);
      popup.add(skillDescText);
    }

    // 关闭按钮
    const closeBtnSize = Math.max(36, panelHeight * 0.08);
    const closeBtnX = panelWidth / 2 - closeBtnSize / 2 - 10;
    const closeBtnY = -panelHeight / 2 + closeBtnSize / 2 + 10;

    const closeBtnBg = this.add.rectangle(closeBtnX, closeBtnY, closeBtnSize, closeBtnSize, this.colors.inkGrey, 0.8);
    closeBtnBg.setStrokeStyle(2, this.colors.goldAccent, 0.5);
    closeBtnBg.setInteractive({ useHandCursor: true });
    popup.add(closeBtnBg);

    const closeBtnText = this.add.text(closeBtnX, closeBtnY, '✕', {
      fontFamily: 'Arial',
      fontSize: `${uiConfig.fontLG}px`,
      color: '#8b949e',
    }).setOrigin(0.5);
    popup.add(closeBtnText);

    closeBtnBg.on('pointerover', () => {
      closeBtnBg.setFillStyle(this.colors.redAccent, 0.9);
      closeBtnText.setColor('#ffffff');
    });
    closeBtnBg.on('pointerout', () => {
      closeBtnBg.setFillStyle(this.colors.inkGrey, 0.8);
      closeBtnText.setColor('#8b949e');
    });

    const closeText = this.add.text(0, panelHeight / 2 - 25, '点击空白处或关闭按钮', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontXS}px`,
      color: '#6e7681',
    }).setOrigin(0.5);
    popup.add(closeText);

    // 标记关闭按钮，供外部使用
    popup.setData('closeBtn', closeBtnBg);

    return popup;
  }

  private getRarityBorderColor(rarity: Rarity | string): number {
    switch (rarity) {
      case Rarity.COMMON:
      case 'common': return 0x8b949e;
      case Rarity.UNCOMMON:
      case 'uncommon': return 0x3fb950;
      case Rarity.RARE:
      case 'rare': return 0x58a6ff;
      case Rarity.EPIC:
      case 'epic': return 0xa855f7;
      case Rarity.LEGENDARY:
      case 'legendary': return 0xd4a853;
      default: return 0x8b949e;
    }
  }

  private getRarityNameCN(rarity: Rarity | string): string {
    switch (rarity) {
      case Rarity.LEGENDARY:
      case 'legendary': return '传说';
      case Rarity.EPIC:
      case 'epic': return '史诗';
      case Rarity.RARE:
      case 'rare': return '稀有';
      case Rarity.UNCOMMON:
      case 'uncommon': return '优秀';
      default: return '普通';
    }
  }

  private getRarityColor(rarity: Rarity | string): string {
    switch (rarity) {
      case Rarity.LEGENDARY:
      case 'legendary': return '#d4a853';
      case Rarity.EPIC:
      case 'epic': return '#a855f7';
      case Rarity.RARE:
      case 'rare': return '#58a6ff';
      case Rarity.UNCOMMON:
      case 'uncommon': return '#3fb950';
      default: return '#8b949e';
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

    this.tweens.add({
      targets: floatText,
      y: floatText.y - 50,
      scaleX: { from: 0.5, to: 1 },
      scaleY: { from: 0.5, to: 1 },
      duration: 300,
      ease: 'Back.easeOut',
    });

    this.tweens.add({
      targets: floatText,
      y: floatText.y - 100,
      alpha: 0,
      duration: 800,
      delay: 500,
      ease: 'Power2',
      onComplete: () => floatText.destroy(),
    });
  }

  private showDamage(combatant: DisplayCombatant, damage: number, isCrit: boolean = false): void {
    const color = isCrit ? '#ff6b6b' : '#f85149';
    const size = isCrit ? 32 : 26;
    const text = isCrit ? `${damage}!` : `-${damage}`;
    this.showFloatingText(combatant, text, color, size);

    if (combatant.sprite) {
      this.tweens.add({
        targets: combatant.sprite,
        x: combatant.x + 10,
        duration: 60,
        yoyo: true,
        repeat: 3,
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
    this.showFloatingText(combatant, `【${skillName}】`, '#d4a853', 16, -130);
  }

  private showStatus(combatant: DisplayCombatant, status: string, color: string = '#58a6ff'): void {
    this.showFloatingText(combatant, status, color, 18, -130);
  }

  private showWuxingEffect(combatant: DisplayCombatant, effectName: string, isConquer: boolean): void {
    const color = isConquer ? '#ff9500' : '#3fb950';
    this.showFloatingText(combatant, effectName, color, 20, -130);
  }

  private showCenterText(text: string, color: string = '#f0e6d3'): Promise<void> {
    return new Promise(resolve => {
      const { width, height } = this.cameras.main;

      const mask = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.5);

      const centerText = this.add.text(width / 2, height / 2, text, {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: `${uiConfig.font2XL}px`,
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
        duration: 400,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: [centerText, mask],
            alpha: 0,
            duration: 500,
            delay: 800,
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

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.9);

    const panelWidth = width * 0.45;
    const panelHeight = height * 0.55;
    const panelBg = this.add.graphics();
    panelBg.fillStyle(this.colors.inkBlack, 0.95);
    panelBg.fillRoundedRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 12);
    panelBg.lineStyle(2, this.colors.redAccent, 0.6);
    panelBg.strokeRoundedRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 12);

    this.add.text(width / 2, height / 2 - panelHeight * 0.38, '崩坏', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.font2XL}px`,
      color: '#f85149',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 结语文字
    const epilogueLines = [
      '你的意志被妖异吞噬，',
      '未能完成使命。',
      '',
      '但本源不会停止。',
      '新的残魂将会诞生，',
      '继续这场永无止境的净化之旅。',
    ];

    let yOffset = height / 2 - panelHeight * 0.18;
    epilogueLines.forEach(line => {
      this.add.text(width / 2, yOffset, line, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontMD}px`,
        color: line === '' ? '#8b949e' : '#a0a0a0',
      }).setOrigin(0.5);
      yOffset += line === '' ? 10 : 28;
    });

    const btnWidth = panelWidth * 0.4;
    const btnHeight = height * 0.065;
    const btnY = height / 2 + panelHeight * 0.38;

    const btnBg = this.add.rectangle(width / 2, btnY, btnWidth, btnHeight, this.colors.inkGrey);
    btnBg.setStrokeStyle(2, this.colors.paperCream, 0.5);
    btnBg.setInteractive({ useHandCursor: true });

    const btnText = this.add.text(width / 2, btnY, '返回主菜单', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: '#f0e6d3',
    }).setOrigin(0.5);

    btnBg.on('pointerover', () => {
      btnBg.setFillStyle(this.colors.goldAccent);
      btnText.setColor('#0d1117');
    });

    btnBg.on('pointerout', () => {
      btnBg.setFillStyle(this.colors.inkGrey);
      btnText.setColor('#f0e6d3');
    });

    btnBg.on('pointerup', () => {
      gameState.reset();
      this.scene.start('MenuScene');
    });
  }

  private showGameComplete(): void {
    const { width, height } = this.cameras.main;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.95);

    const panelWidth = width * 0.55;
    const panelHeight = height * 0.75;
    const panelBg = this.add.graphics();
    panelBg.fillStyle(this.colors.inkBlack, 0.95);
    panelBg.fillRoundedRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 12);
    panelBg.lineStyle(2, this.colors.goldAccent, 0.8);
    panelBg.strokeRoundedRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 12);

    this.add.text(width / 2, height / 2 - panelHeight * 0.4, '使命完成', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.font2XL}px`,
      color: '#d4a853',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 结语文字 - 完整版
    const epilogueLines = [
      { text: '使命完成。你将回归本源，不留下任何痕迹。', color: '#f0e6d3' },
      { text: '', color: '' },
      { text: '你不知道自己从何而来。', color: '#a0a0a0' },
      { text: '你从未见过本源的模样。', color: '#a0a0a0' },
      { text: '你只是被赋予了使命，然后去做了。', color: '#a0a0a0' },
      { text: '', color: '' },
      { text: '新的残魂会诞生，', color: '#8b949e' },
      { text: '背负同样的使命，踏上同样的路。', color: '#8b949e' },
    ];

    let yOffset = height / 2 - panelHeight * 0.25;
    epilogueLines.forEach(line => {
      if (line.text === '') {
        yOffset += 12;
        return;
      }
      const isEmphasis = (line as { emphasis?: boolean }).emphasis;
      this.add.text(width / 2, yOffset, line.text, {
        fontFamily: isEmphasis ? '"Noto Serif SC", serif' : '"Noto Sans SC", sans-serif',
        fontSize: `${isEmphasis ? uiConfig.fontXL : uiConfig.fontMD}px`,
        color: line.color,
        fontStyle: isEmphasis ? 'bold' : 'normal',
      }).setOrigin(0.5);
      yOffset += isEmphasis ? 35 : 26;
    });

    const btnWidth = panelWidth * 0.3;
    const btnHeight = height * 0.065;
    const btnY = height / 2 + panelHeight * 0.4;

    const btnBg = this.add.rectangle(width / 2, btnY, btnWidth, btnHeight, this.colors.goldAccent);
    btnBg.setStrokeStyle(2, 0xffffff, 0.5);
    btnBg.setInteractive({ useHandCursor: true });

    const btnText = this.add.text(width / 2, btnY, '再来一局', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontMD}px`,
      color: '#0d1117',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    btnBg.on('pointerover', () => btnBg.setFillStyle(0xffffff));
    btnBg.on('pointerout', () => btnBg.setFillStyle(this.colors.goldAccent));

    btnBg.on('pointerup', () => {
      gameState.reset();
      this.scene.start('MenuScene');
    });
  }

  private async playAttackAnimation(attacker: DisplayCombatant, defender: DisplayCombatant): Promise<void> {
    if (!attacker.sprite) return;

    const originalX = attacker.x;
    const originalY = attacker.y;
    const { width } = this.cameras.main;
    const attackDuration = 200;

    this.createAttackParticles(attacker);

    await new Promise<void>(resolve => {
      this.tweens.add({
        targets: attacker.sprite,
        x: defender.x - (attacker.isPlayer ? width * 0.06 : -width * 0.06),
        y: defender.y,
        duration: attackDuration,
        ease: 'Power3.easeIn',
        onComplete: () => resolve(),
      });
    });

    if (defender.sprite) {
      const flash = this.add.circle(defender.x, defender.y, 70, 0xffffff, 0.7);
      this.tweens.add({
        targets: flash,
        alpha: 0,
        scale: 1.5,
        duration: 250,
        onComplete: () => flash.destroy(),
      });
    }

    await new Promise<void>(resolve => {
      this.tweens.add({
        targets: attacker.sprite,
        x: originalX,
        y: originalY,
        duration: attackDuration,
        ease: 'Power2.easeOut',
        onComplete: () => resolve(),
      });
    });
  }

  private createAttackParticles(attacker: DisplayCombatant): void {
    const color = attacker.wuxing !== undefined ? WUXING_COLORS[attacker.wuxing] : 0xffffff;
    const { width } = this.cameras.main;

    for (let i = 0; i < 5; i++) {
      const particle = this.add.circle(
        attacker.x + Phaser.Math.Between(-10, 10),
        attacker.y + Phaser.Math.Between(-10, 10),
        Phaser.Math.Between(4, 10),
        color
      );

      const targetX = attacker.isPlayer ? attacker.x + width * 0.12 : attacker.x - width * 0.12;

      this.tweens.add({
        targets: particle,
        x: targetX + Phaser.Math.Between(-30, 30),
        y: attacker.y + Phaser.Math.Between(-50, 50),
        alpha: 0,
        duration: 400,
        delay: i * 30,
        ease: 'Power2.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private async playDeathAnimation(combatant: DisplayCombatant): Promise<void> {
    if (!combatant.sprite) return;

    for (let i = 0; i < 12; i++) {
      const color = combatant.wuxing !== undefined ? WUXING_COLORS[combatant.wuxing] : 0x8b949e;
      const particle = this.add.circle(
        combatant.x + Phaser.Math.Between(-20, 20),
        combatant.y + Phaser.Math.Between(-20, 20),
        Phaser.Math.Between(5, 12),
        color
      );

      this.tweens.add({
        targets: particle,
        x: particle.x + Phaser.Math.Between(-100, 100),
        y: particle.y + Phaser.Math.Between(-100, 100),
        alpha: 0,
        scale: 0,
        duration: 600,
        delay: i * 30,
        ease: 'Power2.easeOut',
        onComplete: () => particle.destroy(),
      });
    }

    await new Promise<void>(resolve => {
      this.tweens.add({
        targets: combatant.sprite,
        alpha: 0,
        scaleX: 0,
        scaleY: 0,
        angle: combatant.isPlayer ? -45 : 45,
        duration: 500,
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

    const hpBar = combatant.sprite.getByName('hpBar') as Phaser.GameObjects.Rectangle;
    const hpText = combatant.sprite.getByName('hpText') as Phaser.GameObjects.Text;

    if (hpBar) {
      const hpBarWidth = hpBar.getData('maxWidth') as number;
      const hpPercent = Math.max(0, combatant.hp / combatant.maxHp);
      const newWidth = hpBarWidth * hpPercent;

      this.tweens.add({
        targets: hpBar,
        width: newWidth,
        duration: 300,
        ease: 'Power2.easeOut',
      });

      let barColor: number;
      if (hpPercent < 0.25) {
        barColor = this.colors.redAccent;
      } else if (hpPercent < 0.5) {
        barColor = 0xeab308;
      } else {
        barColor = this.colors.greenAccent;
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
