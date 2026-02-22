import Phaser from 'phaser';
import { Combatant, generateSimpleLoot, AttributeSkillId } from '@xiyou/shared';
import { EntityManager, WorldEntity } from '../world/EntityManager.js';
import { SpawnSystem } from '../world/SpawnSystem.js';
import { inputManager } from '../input/InputManager.js';
import { resolveCombat } from './CombatResolver.js';
import { eventBus, GameEvent } from '../../core/EventBus.js';
import { gameState } from '../GameStateManager.js';

const BASE_ATTACK_INTERVAL = 800;  // 自动普攻稍快
const BASE_SPEED = 10;

/** AOE 技能配置：颜色 + 范围 */
const AOE_CONFIG: Record<string, { color: number; radius: number; label: string; cd: number }> = {
  [AttributeSkillId.LIEKONGZHAN]: { color: 0xd4a853, radius: 180, label: '裂空斩', cd: 5000 },
  [AttributeSkillId.HANCHAO]:     { color: 0x58a6ff, radius: 200, label: '寒潮',   cd: 6000 },
  [AttributeSkillId.JINGJI]:      { color: 0x3fb950, radius: 160, label: '荆棘',   cd: 5000 },
  [AttributeSkillId.FENTIAN]:     { color: 0xf85149, radius: 220, label: '焚天',   cd: 7000 },
  [AttributeSkillId.DILIE]:       { color: 0xa16946, radius: 140, label: '地裂',   cd: 6000 },
};

export class CombatSystem {
  private scene: Phaser.Scene;
  private entityManager: EntityManager;
  private spawnSystem: SpawnSystem;
  private activeSkillIds: AttributeSkillId[];

  private playerAttackTimer: number = 0;
  private playerSkillTimers: number[] = [0, 0];
  private playerSkillMaxTimers: number[] = [5000, 8000]; // 默认值，会被 activeSkillIds 覆盖

  constructor(
    scene: Phaser.Scene,
    entityManager: EntityManager,
    spawnSystem: SpawnSystem,
    activeSkillIds: AttributeSkillId[] = []
  ) {
    this.scene = scene;
    this.entityManager = entityManager;
    this.spawnSystem = spawnSystem;
    this.activeSkillIds = activeSkillIds.slice(0, 2);

    // 根据装备技能设置 CD
    this.playerSkillMaxTimers = this.activeSkillIds.map(id => AOE_CONFIG[id]?.cd ?? 5000);
    this.playerSkillTimers = this.playerSkillMaxTimers.map(() => 0);
  }

  update(
    delta: number,
    player: Phaser.Physics.Arcade.Sprite,
    playerCombatant: Combatant
  ): void {
    this.playerAttackTimer = Math.max(0, this.playerAttackTimer - delta);
    this.playerSkillTimers = this.playerSkillTimers.map(t => Math.max(0, t - delta));

    const alive = this.entityManager.getAlive();

    // ---- 自动普攻（无需按键） ----
    if (this.playerAttackTimer <= 0) {
      const target = this.getNearestEnemy(player, alive, 120);
      if (target) {
        this.playerAttackTimer = this.getAttackInterval(playerCombatant.speed);
        this.attackEnemy(playerCombatant, target);
      }
    }

    // ---- 手动主动技能（来自装备）----
    const justPressed = inputManager.consumeJustPressed();
    this.activeSkillIds.forEach((skillId, i) => {
      if (justPressed[i] && this.playerSkillTimers[i] <= 0) {
        this.playerSkillTimers[i] = this.playerSkillMaxTimers[i];
        this.executeActiveSkill(skillId, player, playerCombatant, alive);
      }
    });

    // ---- 敌人攻击玩家 ----
    alive.forEach(entity => {
      entity.attackTimer = Math.max(0, entity.attackTimer - delta);
      const dist = Phaser.Math.Distance.Between(
        entity.sprite.x, entity.sprite.y, player.x, player.y
      );
      if (dist < 50 && entity.attackTimer <= 0 && entity.state === 'attack') {
        entity.attackTimer = this.getAttackInterval(entity.combatant.speed);
        this.attackPlayer(entity.combatant, playerCombatant);
        eventBus.emit(GameEvent.PLAYER_HP_CHANGE, playerCombatant.hp, playerCombatant.maxHp);
      }
    });
  }

  private executeActiveSkill(
    skillId: AttributeSkillId,
    player: Phaser.Physics.Arcade.Sprite,
    playerCombatant: Combatant,
    alive: WorldEntity[]
  ): void {
    const cfg = AOE_CONFIG[skillId];
    if (!cfg) return;

    const radius = cfg.radius;
    const color = cfg.color;

    // 视觉效果
    const circle = this.scene.add.graphics();
    circle.lineStyle(3, color, 0.9);
    circle.strokeCircle(player.x, player.y, radius);
    circle.fillStyle(color, 0.15);
    circle.fillCircle(player.x, player.y, radius);
    this.scene.tweens.add({
      targets: circle,
      alpha: 0,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 600,
      onComplete: () => circle.destroy(),
    });

    // AOE 命中 + 吸血（荆棘）
    let totalDamage = 0;
    alive.forEach(e => {
      const d = Phaser.Math.Distance.Between(player.x, player.y, e.sprite.x, e.sprite.y);
      if (d <= radius) {
        const result = resolveCombat(playerCombatant, e.combatant);
        this.applyDamageToEnemy(e, result.damage, playerCombatant);
        totalDamage += result.damage;
      }
    });

    // 荆棘：回血
    if (skillId === AttributeSkillId.JINGJI && totalDamage > 0) {
      const heal = Math.floor(totalDamage * 0.3);
      playerCombatant.hp = Math.min(playerCombatant.maxHp, playerCombatant.hp + heal);
      eventBus.emit(GameEvent.PLAYER_HP_CHANGE, playerCombatant.hp, playerCombatant.maxHp);
      this.showDamageText(player.x, player.y - 50, heal, 0x3fb950);
    }
  }

  private getAttackInterval(speed: number): number {
    // 防止 speed=0（未装备时）导致除零得到 Infinity
    return Math.max(300, BASE_ATTACK_INTERVAL / (Math.max(1, speed) / BASE_SPEED));
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
    this.showDamageText(target.sprite.x, target.sprite.y - 25, damage, 0xffffff);
    if (target.hpBar) {
      this.spawnSystem.updateEnemyHpBar(target.hpBar, target.combatant.hp, target.combatant.maxHp);
    }
    if (target.atlasKey) {
      const hurtKey = `${target.atlasKey}_hurt`;
      if (this.scene.anims.exists(hurtKey)) target.sprite.play(hurtKey, true);
    }
    eventBus.emit(GameEvent.COMBAT_DAMAGE, { damage, target: target.combatant.id });
    if (target.combatant.hp <= 0) this.onEnemyDeath(target);
  }

  private attackPlayer(attacker: Combatant, player: Combatant): void {
    const result = resolveCombat(attacker, player);
    player.hp = Math.max(0, player.hp - result.damage);
    this.showDamageText(
      this.scene.cameras.main.worldView.x + this.scene.cameras.main.width / 2,
      this.scene.cameras.main.worldView.y + 60,
      result.damage,
      0xf85149
    );
    if (player.hp <= 0) {
      eventBus.emit(GameEvent.PLAYER_DEATH);
      this.scene.scene.start('MenuScene');
    }
  }

  private onEnemyDeath(entity: WorldEntity): void {
    if (entity.atlasKey) {
      const dieKey = `${entity.atlasKey}_die`;
      if (this.scene.anims.exists(dieKey)) {
        entity.sprite.play(dieKey);
        entity.sprite.once('animationcomplete', () => this.cleanupEnemy(entity));
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
    const loot = generateSimpleLoot('normal', 1, 0.3);
    loot.forEach(eq => gameState.addToInventory(eq));
  }

  private showDamageText(x: number, y: number, damage: number, color: number): void {
    if (damage <= 0) return;
    const colorHex = '#' + color.toString(16).padStart(6, '0');
    const text = this.scene.add.text(x, y, `-${damage}`, {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: colorHex,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(30);
    this.scene.tweens.add({
      targets: text,
      y: y - 40,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  getActiveSkillIds(): AttributeSkillId[] { return this.activeSkillIds; }
  getPlayerSkillTimers(): number[] { return [...this.playerSkillTimers]; }
  getPlayerSkillMaxTimers(): number[] { return [...this.playerSkillMaxTimers]; }
}
