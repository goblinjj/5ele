import Phaser from 'phaser';
import { Combatant, generateSimpleLoot } from '@xiyou/shared';
import { EntityManager, WorldEntity } from '../world/EntityManager.js';
import { SpawnSystem } from '../world/SpawnSystem.js';
import { inputManager } from '../input/InputManager.js';
import { resolveCombat } from './CombatResolver.js';
import { eventBus, GameEvent } from '../../core/EventBus.js';
import { gameState } from '../GameStateManager.js';

/** 普攻攻击间隔（ms），速度越高间隔越短 */
const BASE_ATTACK_INTERVAL = 1200;
const BASE_SPEED = 10;

export class CombatSystem {
  private scene: Phaser.Scene;
  private entityManager: EntityManager;
  private spawnSystem: SpawnSystem;

  /** 玩家攻击冷却（ms） */
  private playerAttackTimer: number = 0;
  private playerSkillTimers: number[] = [0, 0, 0];
  private readonly playerSkillMaxTimers: number[] = [0, 5000, 8000];

  constructor(scene: Phaser.Scene, entityManager: EntityManager, spawnSystem: SpawnSystem) {
    this.scene = scene;
    this.entityManager = entityManager;
    this.spawnSystem = spawnSystem;
  }

  /**
   * 每帧调用
   */
  update(
    delta: number,
    player: Phaser.Physics.Arcade.Sprite,
    playerCombatant: Combatant
  ): void {
    this.playerAttackTimer = Math.max(0, this.playerAttackTimer - delta);
    this.playerSkillTimers = this.playerSkillTimers.map(t => Math.max(0, t - delta));

    const justPressed = inputManager.consumeJustPressed();
    const alive = this.entityManager.getAlive();

    // ---- 玩家普攻（持续按住） ----
    if (inputManager.skillActive[0] && this.playerAttackTimer <= 0) {
      const target = this.getNearestEnemy(player, alive, 100);
      if (target) {
        this.playerAttackTimer = this.getAttackInterval(playerCombatant.speed);
        this.attackEnemy(playerCombatant, target);
      }
    }

    // ---- 玩家技能①（AOE，范围攻击） ----
    if (justPressed[1] && this.playerSkillTimers[1] <= 0) {
      this.playerSkillTimers[1] = this.playerSkillMaxTimers[1];
      this.playerAoe(player, playerCombatant, alive, 180);
    }

    // ---- 玩家技能②（单体强攻 2.5×） ----
    if (justPressed[2] && this.playerSkillTimers[2] <= 0) {
      this.playerSkillTimers[2] = this.playerSkillMaxTimers[2];
      const target = this.getNearestEnemy(player, alive, 200);
      if (target) {
        const result = resolveCombat(playerCombatant, target.combatant);
        const ampDamage = Math.floor(result.damage * 2.5);
        this.applyDamageToEnemy(target, ampDamage, playerCombatant);
      }
    }

    // ---- 敌人攻击玩家 ----
    alive.forEach(entity => {
      entity.attackTimer = Math.max(0, entity.attackTimer - delta);
      const dist = Phaser.Math.Distance.Between(
        entity.sprite.x, entity.sprite.y, player.x, player.y
      );
      if (dist < 90 && entity.attackTimer <= 0 && entity.state === 'attack') {
        entity.attackTimer = this.getAttackInterval(entity.combatant.speed);
        this.attackPlayer(entity.combatant, playerCombatant);
        eventBus.emit(GameEvent.PLAYER_HP_CHANGE, playerCombatant.hp, playerCombatant.maxHp);
      }
    });
  }

  private getAttackInterval(speed: number): number {
    return Math.max(400, BASE_ATTACK_INTERVAL / (speed / BASE_SPEED));
  }

  private getNearestEnemy(
    player: Phaser.Physics.Arcade.Sprite,
    alive: WorldEntity[],
    maxRange: number
  ): WorldEntity | null {
    let nearest: WorldEntity | null = null;
    let minDist = maxRange;
    alive.forEach(e => {
      const d = Phaser.Math.Distance.Between(player.x, player.y, e.sprite.x, e.sprite.y);
      if (d < minDist) { minDist = d; nearest = e; }
    });
    return nearest;
  }

  private attackEnemy(attacker: Combatant, target: WorldEntity): void {
    const result = resolveCombat(attacker, target.combatant);
    this.applyDamageToEnemy(target, result.damage, attacker);
  }

  private applyDamageToEnemy(target: WorldEntity, damage: number, _attacker: Combatant): void {
    target.combatant.hp = Math.max(0, target.combatant.hp - damage);

    // 伤害飘字
    this.showDamageText(target.sprite.x, target.sprite.y - 40, damage, 0xffffff);

    // 更新 HP 条
    if (target.hpBar) {
      this.spawnSystem.updateEnemyHpBar(target.hpBar, target.combatant.hp, target.combatant.maxHp);
    }

    // 受击动画
    if (target.atlasKey) {
      const hurtKey = `${target.atlasKey}_hurt`;
      if (this.scene.anims.exists(hurtKey)) {
        target.sprite.play(hurtKey, true);
      }
    }

    eventBus.emit(GameEvent.COMBAT_DAMAGE, { damage, target: target.combatant.id });

    if (target.combatant.hp <= 0) {
      this.onEnemyDeath(target);
    }
  }

  private attackPlayer(attacker: Combatant, player: Combatant): void {
    const result = resolveCombat(attacker, player);
    player.hp = Math.max(0, player.hp - result.damage);

    // 伤害飘字（屏幕固定位置，因为相机跟随玩家）
    this.showDamageText(
      this.scene.cameras.main.worldView.x + this.scene.cameras.main.width / 2,
      this.scene.cameras.main.worldView.y + 80,
      result.damage,
      0xf85149
    );

    if (player.hp <= 0) {
      eventBus.emit(GameEvent.PLAYER_DEATH);
      this.scene.scene.start('MenuScene');
    }
  }

  private playerAoe(
    player: Phaser.Physics.Arcade.Sprite,
    playerCombatant: Combatant,
    targets: WorldEntity[],
    radius: number
  ): void {
    // 视觉效果
    const circle = this.scene.add.graphics();
    circle.lineStyle(3, 0xa855f7, 0.8);
    circle.strokeCircle(player.x, player.y, radius);
    this.scene.tweens.add({
      targets: circle,
      alpha: 0,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 500,
      onComplete: () => circle.destroy(),
    });

    targets.forEach(e => {
      const d = Phaser.Math.Distance.Between(player.x, player.y, e.sprite.x, e.sprite.y);
      if (d <= radius) {
        const result = resolveCombat(playerCombatant, e.combatant);
        this.applyDamageToEnemy(e, result.damage, playerCombatant);
      }
    });
  }

  private onEnemyDeath(entity: WorldEntity): void {
    // 死亡动画
    if (entity.atlasKey) {
      const dieKey = `${entity.atlasKey}_die`;
      if (this.scene.anims.exists(dieKey)) {
        entity.sprite.play(dieKey);
        entity.sprite.once('animationcomplete', () => {
          this.cleanupEnemy(entity);
        });
        return;
      }
    }
    this.cleanupEnemy(entity);
  }

  private cleanupEnemy(entity: WorldEntity): void {
    entity.sprite.destroy();
    entity.hpBar?.destroy();
    entity.hpBarBg?.destroy();
    this.entityManager.remove(entity.combatant.id);
    eventBus.emit(GameEvent.ENEMY_DIED, entity.combatant);

    // 掉落：generateSimpleLoot(nodeType, round, dropRate) => Equipment[]
    const loot = generateSimpleLoot('normal', 1, 0.3);
    loot.forEach(eq => gameState.addToInventory(eq));
  }

  private showDamageText(x: number, y: number, damage: number, color: number): void {
    if (damage <= 0) return;
    const colorHex = '#' + color.toString(16).padStart(6, '0');
    const text = this.scene.add.text(x, y, `-${damage}`, {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: colorHex,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(30);

    this.scene.tweens.add({
      targets: text,
      y: y - 60,
      alpha: 0,
      duration: 900,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  getPlayerSkillTimers(): number[] {
    return [...this.playerSkillTimers];
  }

  getPlayerSkillMaxTimers(): number[] {
    return [...this.playerSkillMaxTimers];
  }
}
