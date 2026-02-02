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

  init(data: { mode: 'single' | 'multi'; nodeType: NodeType | 'final'; round: number }): void {
    this.mode = data.mode || 'single';
    this.nodeType = data.nodeType || NodeType.NORMAL_BATTLE;
    this.round = data.round || 1;
  }

  private inventoryButton?: Phaser.GameObjects.Container;
  private isBattleRunning: boolean = false;

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

    const titleText = this.nodeType === 'final' ? '最终决战' :
                      this.nodeType === NodeType.ELITE_BATTLE ? '精英战斗' : '战斗';

    const titleSize = Math.max(18, Math.min(28, width * 0.022));
    this.add.text(width / 2, height * 0.065, titleText, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${titleSize}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const infoSize = Math.max(12, Math.min(16, width * 0.013));
    this.add.text(width * 0.04, height * 0.065, `第 ${this.round} 轮`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${infoSize}px`,
      color: '#8b949e',
    }).setOrigin(0, 0.5);

    this.createPlayerStatusBar(width * 0.96, height * 0.065);
  }

  private createPlayerStatusBar(x: number, y: number): void {
    const { width } = this.cameras.main;
    const player = gameState.getPlayerState();
    const fontSize = Math.max(10, Math.min(14, width * 0.011));

    this.add.text(x, y - 12, `❤️ ${player.hp}/${player.maxHp}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${fontSize}px`,
      color: '#f85149',
    }).setOrigin(1, 0.5);

    this.add.text(x, y + 12, `⚔ ${gameState.getTotalAttack()}  🛡 ${gameState.getTotalDefense()}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${fontSize - 2}px`,
      color: '#8b949e',
    }).setOrigin(1, 0.5);
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

    const fontSize = Math.max(10, Math.min(14, width * 0.011));
    const btnText = this.add.text(0, 0, '📦 背包', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${fontSize}px`,
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
      // 总是刷新玩家显示和数据
      this.refreshPlayerCombatant();
      // 更新顶部状态栏显示
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

    const playerState = gameState.getPlayerState();
    const nodeTypeStr = this.getNodeTypeString();
    const enemies = generateEnemies(
      nodeTypeStr,
      this.round,
      playerState.monsterScaling,
      playerState.monsterCountBonus
    );
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
    const symbolSize = Math.max(16, Math.min(28, width * 0.022));
    const symbolText = this.add.text(0, 0, wuxingSymbol, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${combatant.isPlayer ? symbolSize : symbolSize * 0.85}px`,
      color: '#ffffff',
    }).setOrigin(0.5);

    const nameY = hpBarOffsetY - height * 0.035;
    const nameSize = Math.max(10, Math.min(13, width * 0.01));
    const nameBg = this.add.rectangle(0, nameY, width * 0.09, height * 0.03, this.colors.inkBlack, 0.8);
    nameBg.setStrokeStyle(1, bodyColor, 0.5);

    const nameText = this.add.text(0, nameY, combatant.name, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${nameSize}px`,
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

    const hpTextSize = Math.max(8, Math.min(10, width * 0.008));
    const hpText = this.add.text(0, hpBarOffsetY, `${combatant.hp}`, {
      fontFamily: 'monospace',
      fontSize: `${hpTextSize}px`,
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    hpText.setName('hpText');

    if (combatant.isPlayer) {
      const markerSize = Math.max(9, Math.min(11, width * 0.009));
      const playerMarker = this.add.text(0, bodySize + height * 0.035, '▲ 玩家', {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${markerSize}px`,
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
    this.isBattleRunning = true;
    await this.showCenterText('战斗开始！', '#f0e6d3');

    const config: BattleConfig = {
      allowEquipmentChange: this.nodeType !== 'final',
      isPvP: false,
    };

    const engine = new BattleEngine(this.engineCombatants, config);
    const result = engine.run();

    for (const event of result.events) {
      await this.playEvent(event);
    }

    const playerSurvivor = result.survivingCombatants.find(c => c.isPlayer);
    if (playerSurvivor) {
      gameState.getPlayerState().hp = playerSurvivor.hp;
    } else {
      gameState.getPlayerState().hp = 0;
    }

    await this.delay(500);

    if (result.winnerId) {
      await this.showCenterText('胜利！', '#3fb950');
      await this.handleVictory();
    } else {
      await this.delay(500);
      this.showGameOver();
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

      case 'round_end':
        await this.delay(turnDelay);
        break;

      case 'battle_end':
        break;
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

    const titleSize = Math.max(26, Math.min(36, width * 0.03));
    const title = this.add.text(width / 2, height * 0.08, '战利品', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${titleSize}px`,
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

    const closePopup = () => {
      if (currentPopup) {
        currentPopup.destroy();
        currentPopup = null;
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
        fontSize: `${slotSize * 0.24}px`,
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      slotContainer.add(levelText);

      const typeIcon = item.type === 'weapon' ? '⚔️' : item.type === 'armor' ? '🛡️' : '💎';
      const typeText = this.add.text(0, slotSize * 0.3, typeIcon, {
        fontSize: `${slotSize * 0.22}px`,
      }).setOrigin(0.5);
      slotContainer.add(typeText);

      bg.on('pointerup', () => {
        closePopup();
        currentPopup = this.createLootPopup(item, width / 2, height / 2);
        lootContainer.add(currentPopup);
      });
    });

    const infoFontSize = Math.max(14, Math.min(18, width * 0.015));
    const countText = this.add.text(width / 2, startY + rows * slotSpacing + 25, `共 ${items.length} 件`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${infoFontSize}px`,
      color: '#8b949e',
    }).setOrigin(0.5);
    lootContainer.add(countText);

    if (fragmentsGained > 0) {
      const fragmentText = this.add.text(width / 2, startY + rows * slotSpacing + 50, `${fragmentsGained} 件物品已炼化为碎片`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${infoFontSize - 2}px`,
        color: '#a855f7',
      }).setOrigin(0.5);
      lootContainer.add(fragmentText);
    }

    const btnY = height * 0.88;
    const btnWidth = width * 0.15;
    const btnHeight = height * 0.08;
    const btnSpacing = width * 0.18;
    const btnFontSize = Math.max(14, Math.min(18, width * 0.015));

    // 背包按钮
    const bagBtnBg = this.add.rectangle(width / 2 - btnSpacing / 2, btnY, btnWidth, btnHeight, this.colors.inkGrey);
    bagBtnBg.setStrokeStyle(2, this.colors.goldAccent, 0.5);
    bagBtnBg.setInteractive({ useHandCursor: true });
    lootContainer.add(bagBtnBg);

    const bagBtnText = this.add.text(width / 2 - btnSpacing / 2, btnY, '📦 背包', {
      fontFamily: '"Noto Sans SC", serif',
      fontSize: `${btnFontSize}px`,
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

    // 继续冒险按钮
    const continueBtnBg = this.add.rectangle(width / 2 + btnSpacing / 2, btnY, btnWidth, btnHeight, this.colors.goldAccent);
    continueBtnBg.setStrokeStyle(2, 0xffffff, 0.5);
    continueBtnBg.setInteractive({ useHandCursor: true });
    lootContainer.add(continueBtnBg);

    const continueBtnText = this.add.text(width / 2 + btnSpacing / 2, btnY, '继续冒险', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${btnFontSize}px`,
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

    // 响应式尺寸
    const panelWidth = Math.max(320, Math.min(420, width * 0.35));
    const panelHeight = item.skill ? Math.max(340, height * 0.52) : Math.max(280, height * 0.42);
    const borderColor = this.getRarityBorderColor(item.rarity);

    const bg = this.add.graphics();
    bg.fillStyle(this.colors.inkBlack, 0.98);
    bg.fillRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
    bg.lineStyle(3, borderColor, 0.9);
    bg.strokeRoundedRect(-panelWidth / 2, -panelHeight / 2, panelWidth, panelHeight, 12);
    popup.add(bg);

    // 响应式字体
    const nameFontSize = Math.max(20, Math.min(26, width * 0.022));
    const labelFontSize = Math.max(14, Math.min(18, width * 0.015));
    const textFontSize = Math.max(15, Math.min(20, width * 0.017));

    let yOffset = -panelHeight / 2 + 30;

    const nameText = this.add.text(0, yOffset, item.name, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${nameFontSize}px`,
      color: '#f0e6d3',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    popup.add(nameText);

    yOffset += 32;

    const typeName = item.type === 'weapon' ? '武器' : item.type === 'armor' ? '铠甲' : '法宝';
    const typeRarityText = this.add.text(0, yOffset, `${typeName} · ${this.getRarityNameCN(item.rarity)}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${labelFontSize}px`,
      color: this.getRarityColor(item.rarity),
    }).setOrigin(0.5);
    popup.add(typeRarityText);

    yOffset += 28;

    const wuxingColor = item.wuxing !== undefined ? WUXING_COLORS[item.wuxing] : 0x8b949e;
    const wuxingName = item.wuxing !== undefined ? WUXING_NAMES[item.wuxing] : '无';
    const wuxingLevelStr = item.wuxing !== undefined ? ` Lv.${item.wuxingLevel ?? 1}` : '';
    const wuxingText = this.add.text(0, yOffset, `${wuxingName}属性${wuxingLevelStr}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${labelFontSize}px`,
      color: '#' + wuxingColor.toString(16).padStart(6, '0'),
    }).setOrigin(0.5);
    popup.add(wuxingText);

    yOffset += 28;

    const stats: string[] = [];
    if (item.attack) stats.push(`攻击 +${item.attack}`);
    if (item.defense) stats.push(`防御 +${item.defense}`);
    if (stats.length > 0) {
      const statsText = this.add.text(0, yOffset, stats.join('   '), {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${textFontSize}px`,
        color: '#f0e6d3',
      }).setOrigin(0.5);
      popup.add(statsText);
      yOffset += 28;
    }

    if (item.skill) {
      yOffset += 8;
      const skillNameText = this.add.text(0, yOffset, `【${item.skill.name}】`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${labelFontSize}px`,
        color: '#d4a853',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      popup.add(skillNameText);

      yOffset += 24;
      const skillDescText = this.add.text(0, yOffset, item.skill.description, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${labelFontSize - 2}px`,
        color: '#8b949e',
        wordWrap: { width: panelWidth * 0.85 },
        align: 'center',
      }).setOrigin(0.5, 0);
      popup.add(skillDescText);
    }

    const closeText = this.add.text(0, panelHeight / 2 - 25, '点击其他地方关闭', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${labelFontSize - 3}px`,
      color: '#6e7681',
    }).setOrigin(0.5);
    popup.add(closeText);

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
        fontSize: '42px',
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

    const panelWidth = width * 0.35;
    const panelHeight = height * 0.38;
    const panelBg = this.add.graphics();
    panelBg.fillStyle(this.colors.inkBlack, 0.95);
    panelBg.fillRoundedRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 12);
    panelBg.lineStyle(2, this.colors.redAccent, 0.6);
    panelBg.strokeRoundedRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 12);

    this.add.text(width / 2, height / 2 - panelHeight * 0.25, '败 北', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '48px',
      color: '#f85149',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2, '西游路漫漫，来日再战', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '16px',
      color: '#8b949e',
    }).setOrigin(0.5);

    const btnWidth = panelWidth * 0.5;
    const btnHeight = height * 0.065;
    const btnY = height / 2 + panelHeight * 0.3;

    const btnBg = this.add.rectangle(width / 2, btnY, btnWidth, btnHeight, this.colors.inkGrey);
    btnBg.setStrokeStyle(2, this.colors.paperCream, 0.5);
    btnBg.setInteractive({ useHandCursor: true });

    const btnText = this.add.text(width / 2, btnY, '返回主菜单', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '16px',
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

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.9);

    const panelWidth = width * 0.4;
    const panelHeight = height * 0.45;
    const panelBg = this.add.graphics();
    panelBg.fillStyle(this.colors.inkBlack, 0.95);
    panelBg.fillRoundedRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 12);
    panelBg.lineStyle(2, this.colors.goldAccent, 0.8);
    panelBg.strokeRoundedRect(width / 2 - panelWidth / 2, height / 2 - panelHeight / 2, panelWidth, panelHeight, 12);

    this.add.text(width / 2, height / 2 - panelHeight * 0.28, '✨ 通关成功 ✨', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '42px',
      color: '#d4a853',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 - panelHeight * 0.05, '恭喜你完成了西游肉鸽！', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '18px',
      color: '#f0e6d3',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + panelHeight * 0.08, '取经路漫漫，终得正果', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '14px',
      color: '#8b949e',
    }).setOrigin(0.5);

    const btnWidth = panelWidth * 0.4;
    const btnHeight = height * 0.065;
    const btnY = height / 2 + panelHeight * 0.3;

    const btnBg = this.add.rectangle(width / 2, btnY, btnWidth, btnHeight, this.colors.goldAccent);
    btnBg.setStrokeStyle(2, 0xffffff, 0.5);
    btnBg.setInteractive({ useHandCursor: true });

    const btnText = this.add.text(width / 2, btnY, '再来一局', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '16px',
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
