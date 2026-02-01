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
  wuxing: Wuxing;
  isPlayer: boolean;
  x: number;
  y: number;
  sprite?: Phaser.GameObjects.Container;
}

/**
 * 战斗场景
 */
export class BattleScene extends Phaser.Scene {
  private mode: 'single' | 'multi' = 'single';
  private nodeType: NodeType | 'final' = NodeType.NORMAL_BATTLE;
  private round: number = 1;

  private displayCombatants: Map<string, DisplayCombatant> = new Map();
  private engineCombatants: EngineCombatant[] = [];

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

    // 背景
    this.add.rectangle(width / 2, height / 2, width, height, 0x1a1a2e);

    // 创建战斗场地
    this.createBattleField();

    // 初始化战斗单位
    this.initCombatants();

    // 创建 UI
    this.createUI();

    // 开始战斗
    this.time.delayedCall(1000, () => this.runBattle());
  }

  private createBattleField(): void {
    const { width, height } = this.cameras.main;

    const graphics = this.add.graphics();
    graphics.fillStyle(0x2a2a4a, 1);

    const centerX = width / 2;
    const centerY = height / 2 + 50;
    const fieldWidth = 500;
    const fieldHeight = 250;

    graphics.beginPath();
    graphics.moveTo(centerX, centerY - fieldHeight / 2);
    graphics.lineTo(centerX + fieldWidth / 2, centerY);
    graphics.lineTo(centerX, centerY + fieldHeight / 2);
    graphics.lineTo(centerX - fieldWidth / 2, centerY);
    graphics.closePath();
    graphics.fill();

    graphics.lineStyle(2, 0x4a4a6a);
    graphics.strokePath();
  }

  private initCombatants(): void {
    const { width, height } = this.cameras.main;
    const centerY = height / 2 + 50;

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
      wuxing: playerCombatant.attackWuxing?.wuxing || Wuxing.FIRE,
      isPlayer: true,
      x: width / 2 - 150,
      y: centerY,
    };
    this.displayCombatants.set(playerCombatant.id, playerDisplay);

    // 生成敌人
    const nodeTypeStr = this.getNodeTypeString();
    const enemies = generateEnemies(nodeTypeStr, this.round);

    enemies.forEach((enemy, i) => {
      this.engineCombatants.push(enemy);

      const enemyDisplay: DisplayCombatant = {
        id: enemy.id,
        name: enemy.name,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        wuxing: enemy.attackWuxing?.wuxing || Wuxing.WOOD,
        isPlayer: false,
        x: width / 2 + 100 + i * 80,
        y: centerY - 30 + i * 40,
      };
      this.displayCombatants.set(enemy.id, enemyDisplay);
    });

    // 创建精灵
    this.displayCombatants.forEach(c => {
      c.sprite = this.createCombatantSprite(c);
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

  private createCombatantSprite(combatant: DisplayCombatant): Phaser.GameObjects.Container {
    const container = this.add.container(combatant.x, combatant.y);

    const bodyColor = WUXING_COLORS[combatant.wuxing];
    const bodySize = combatant.isPlayer ? 35 : 30;
    const body = this.add.circle(0, 0, bodySize, bodyColor);
    body.setStrokeStyle(2, 0xffffff, 0.5);

    const nameText = this.add.text(0, -50, combatant.name, {
      fontFamily: 'Arial',
      fontSize: '14px',
      color: '#ffffff',
    }).setOrigin(0.5);

    const hpBarBg = this.add.rectangle(0, -35, 50, 8, 0x333333);
    hpBarBg.setStrokeStyle(1, 0x555555);

    const hpBar = this.add.rectangle(-25 + 25, -35, 50, 6, 0x22c55e);
    hpBar.setOrigin(0, 0.5);
    hpBar.setName('hpBar');

    container.add([body, nameText, hpBarBg, hpBar]);

    if (combatant.isPlayer) {
      const playerMark = this.add.text(0, 50, '▲', {
        fontFamily: 'Arial',
        fontSize: '20px',
        color: '#22c55e',
      }).setOrigin(0.5);
      container.add(playerMark);
    }

    this.updateHpBar(combatant);

    return container;
  }

  private createUI(): void {
    const { width } = this.cameras.main;

    const titleText = this.nodeType === 'final' ? '最终决战' :
                      this.nodeType === NodeType.ELITE_BATTLE ? '精英战斗' : '战斗';
    this.add.text(width / 2, 30, titleText, {
      fontFamily: 'Arial',
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(20, 30, `第 ${this.round} 轮`, {
      fontFamily: 'Arial',
      fontSize: '18px',
      color: '#aaaaaa',
    });
  }

  private async runBattle(): Promise<void> {
    await this.showCenterText('战斗开始！', '#ffffff');

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
      await this.showCenterText('胜利！', '#22c55e');
      await this.handleVictory();
    } else {
      await this.delay(500);
      this.showGameOver();
    }
  }

  private async playEvent(event: BattleEvent): Promise<void> {
    switch (event.type) {
      case 'battle_start':
        // 已经显示过开始文字
        break;

      case 'round_start':
        // 可选：显示回合数
        break;

      case 'turn_start':
        // 可选：高亮当前行动者
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
            // 播放攻击动画
            if (actor && actor.id !== target.id) {
              await this.playAttackAnimation(actor, target);
            }

            // 显示五行效果
            if (event.wuxingEffect === 'conquer') {
              this.showWuxingEffect(target, '克制', true);
            }

            // 更新显示 HP
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
            this.showStatus(actor, '冻结!', '#3b82f6');
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
        // 无需特殊处理
        break;
    }
  }

  private async handleVictory(): Promise<void> {
    const nodeTypeStr = this.getNodeTypeString();
    const loot = generateLoot(nodeTypeStr, this.round);

    // 显示掉落
    await this.showLootScreen(loot.items);

    // 自动拾取
    let fragmentsGained = 0;
    for (const item of loot.items) {
      if (!gameState.isInventoryFull()) {
        gameState.addToInventory(item);
      } else {
        fragmentsGained++;
        gameState.addFragment();
      }
    }

    // 显示溢出提示
    if (fragmentsGained > 0) {
      await this.showCenterText(`${fragmentsGained} 件物品炼化`, '#fbbf24');
      await this.delay(500);
    }

    // 跳转到地图
    this.scene.start('MapScene', {
      mode: this.mode,
      round: this.round + 1,
    });
  }

  private async showLootScreen(items: Equipment[]): Promise<void> {
    const { width, height } = this.cameras.main;

    // 半透明背景
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);

    // 标题
    const title = this.add.text(width / 2, 80, '战利品', {
      fontFamily: 'Arial',
      fontSize: '32px',
      color: '#fbbf24',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // 显示物品
    const itemTexts: Phaser.GameObjects.Text[] = [];
    items.forEach((item, i) => {
      const rarityColor = this.getRarityColor(item.rarity);
      const text = this.add.text(width / 2, 150 + i * 40, `${item.name} (${WUXING_NAMES[item.wuxing]})`, {
        fontFamily: 'Arial',
        fontSize: '20px',
        color: rarityColor,
      }).setOrigin(0.5);
      itemTexts.push(text);
    });

    // 等待点击继续
    await new Promise<void>(resolve => {
      const continueText = this.add.text(width / 2, height - 80, '点击继续', {
        fontFamily: 'Arial',
        fontSize: '18px',
        color: '#aaaaaa',
      }).setOrigin(0.5);

      this.tweens.add({
        targets: continueText,
        alpha: 0.5,
        duration: 500,
        yoyo: true,
        repeat: -1,
      });

      this.input.once('pointerup', () => {
        overlay.destroy();
        title.destroy();
        itemTexts.forEach(t => t.destroy());
        continueText.destroy();
        resolve();
      });
    });
  }

  private getRarityColor(rarity: string): string {
    switch (rarity) {
      case 'legendary': return '#ff8c00';
      case 'epic': return '#a855f7';
      case 'rare': return '#3b82f6';
      case 'uncommon': return '#22c55e';
      default: return '#ffffff';
    }
  }

  private showFloatingText(
    combatant: DisplayCombatant,
    text: string,
    color: string = '#ffffff',
    fontSize: number = 24,
    offsetY: number = -70
  ): void {
    if (!combatant.sprite) return;

    const floatText = this.add.text(combatant.x, combatant.y + offsetY, text, {
      fontFamily: 'Arial',
      fontSize: `${fontSize}px`,
      color: color,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5);

    this.tweens.add({
      targets: floatText,
      y: floatText.y - 50,
      alpha: 0,
      duration: 1000,
      ease: 'Power2',
      onComplete: () => floatText.destroy(),
    });
  }

  private showDamage(combatant: DisplayCombatant, damage: number, isCrit: boolean = false): void {
    const color = isCrit ? '#ff6b6b' : '#ef4444';
    const size = isCrit ? 32 : 24;
    const text = isCrit ? `${damage}!` : `-${damage}`;
    this.showFloatingText(combatant, text, color, size);
  }

  private showHeal(combatant: DisplayCombatant, amount: number): void {
    this.showFloatingText(combatant, `+${amount}`, '#22c55e', 24);
  }

  private showMiss(combatant: DisplayCombatant): void {
    this.showFloatingText(combatant, 'MISS', '#aaaaaa', 20);
  }

  private showSkillTrigger(combatant: DisplayCombatant, skillName: string): void {
    this.showFloatingText(combatant, `【${skillName}】`, '#fbbf24', 18, -90);
  }

  private showStatus(combatant: DisplayCombatant, status: string, color: string = '#3b82f6'): void {
    this.showFloatingText(combatant, status, color, 18, -90);
  }

  private showWuxingEffect(combatant: DisplayCombatant, effectName: string, isConquer: boolean): void {
    const color = isConquer ? '#ff9500' : '#22c55e';
    this.showFloatingText(combatant, effectName, color, 20, -90);
  }

  private showCenterText(text: string, color: string = '#ffffff'): Promise<void> {
    return new Promise(resolve => {
      const { width, height } = this.cameras.main;

      const centerText = this.add.text(width / 2, height / 2, text, {
        fontFamily: 'Arial',
        fontSize: '48px',
        color: color,
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
      }).setOrigin(0.5).setAlpha(0);

      this.tweens.add({
        targets: centerText,
        alpha: 1,
        scale: { from: 0.5, to: 1.2 },
        duration: 300,
        yoyo: true,
        hold: 500,
        onComplete: () => {
          centerText.destroy();
          resolve();
        },
      });
    });
  }

  private showGameOver(): void {
    const { width, height } = this.cameras.main;

    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.9);

    this.add.text(width / 2, height / 2 - 50, '失败', {
      fontFamily: 'Arial',
      fontSize: '64px',
      color: '#ef4444',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2 + 20, '西游路漫漫，来日再战', {
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

  private async playAttackAnimation(attacker: DisplayCombatant, defender: DisplayCombatant): Promise<void> {
    if (!attacker.sprite) return;

    const originalX = attacker.x;
    const originalY = attacker.y;

    await new Promise<void>(resolve => {
      this.tweens.add({
        targets: attacker.sprite,
        x: defender.x,
        y: defender.y,
        duration: 150,
        ease: 'Power2',
        onComplete: () => resolve(),
      });
    });

    await new Promise<void>(resolve => {
      this.tweens.add({
        targets: attacker.sprite,
        x: originalX,
        y: originalY,
        duration: 150,
        ease: 'Power2',
        onComplete: () => resolve(),
      });
    });
  }

  private async playDeathAnimation(combatant: DisplayCombatant): Promise<void> {
    if (!combatant.sprite) return;

    await new Promise<void>(resolve => {
      this.tweens.add({
        targets: combatant.sprite,
        alpha: 0,
        scale: 0.5,
        duration: 300,
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
    if (hpBar) {
      const hpPercent = combatant.hp / combatant.maxHp;
      hpBar.setSize(50 * hpPercent, 6);

      if (hpPercent < 0.25) {
        hpBar.setFillStyle(0xef4444);
      } else if (hpPercent < 0.5) {
        hpBar.setFillStyle(0xeab308);
      } else {
        hpBar.setFillStyle(0x22c55e);
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => this.time.delayedCall(ms, resolve));
  }
}
