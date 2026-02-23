import Phaser from 'phaser';
import {
  Combatant, AttributeSkillId,
  calculateSkillEffectLevels, getSkillValue,
} from '@xiyou/shared';
import { EntityManager, WorldEntity } from '../world/EntityManager.js';
import { SpawnSystem } from '../world/SpawnSystem.js';
import { inputManager } from '../input/InputManager.js';
import { resolveCombat } from './CombatResolver.js';
import { eventBus, GameEvent } from '../../core/EventBus.js';

/** 基准攻击间隔：1 秒（速度=1 时） */
const BASE_ATTACK_INTERVAL = 1000;
const BASE_SPEED = 1;

/** 残魂（玩家）自动普攻范围 */
export const AUTO_ATTACK_RANGE = 120;

/** 妖异攻击范围：残魂的 2/3（残魂比妖异大 50%） */
export const ENEMY_ATTACK_RANGE = 80;

/** AOE 技能配置：颜色 + 范围 + CD */
const AOE_CONFIG: Record<string, { color: number; radius: number; label: string; cd: number }> = {
  [AttributeSkillId.LIEKONGZHAN]: { color: 0xd4a853, radius: 180, label: '裂空斩', cd: 5000 },
  [AttributeSkillId.HANCHAO]:     { color: 0x58a6ff, radius: 200, label: '寒潮',   cd: 6000 },
  [AttributeSkillId.JINGJI]:      { color: 0x3fb950, radius: 160, label: '荆棘',   cd: 5000 },
  [AttributeSkillId.FENTIAN]:     { color: 0xf85149, radius: 220, label: '焚天',   cd: 7000 },
  [AttributeSkillId.DILIE]:       { color: 0xa16946, radius: 140, label: '地裂',   cd: 6000 },
};

interface PendingDamage {
  timer: number;
  attacker: Combatant;
  playerSprite: Phaser.Physics.Arcade.Sprite;
  range: number;
}

/** 时间制状态效果追踪（沙盒模式，单位 ms） */
interface TimedStatus {
  burning: number;   // 剩余时间 ms（>0 = 激活）
  slowed: number;    // 剩余时间 ms
  burnTickTimer: number; // 灼烧伤害 tick 计时
}

export class CombatSystem {
  private scene: Phaser.Scene;
  private entityManager: EntityManager;
  private spawnSystem: SpawnSystem;
  private activeSkillIds: AttributeSkillId[];

  private playerAttackTimer: number = 0;
  /** 攻击动画保护计时器：>0 时不允许移动动画覆盖攻击动画 */
  private playerAttackAnimTimer: number = 0;
  /** 塑型中：暂停玩家自动普攻 */
  private playerChanneling: boolean = false;
  private playerSkillTimers: number[] = [];
  private playerSkillMaxTimers: number[] = [];
  /** 延迟伤害队列：攻击动画播完后才结算 */
  private pendingDamages: PendingDamage[] = [];

  /** 生机：被动回血计时器 */
  private passiveHealTimer: number = 3000;

  /** 玩家状态效果追踪 */
  private playerStatus: TimedStatus = { burning: 0, slowed: 0, burnTickTimer: 0 };
  /** 敌人状态效果追踪（按 combatant.id 映射） */
  private enemyStatuses: Map<string, TimedStatus> = new Map();

  /** 游戏是否已结束（失败后停止所有战斗逻辑） */
  private gameOver: boolean = false;

  constructor(
    scene: Phaser.Scene,
    entityManager: EntityManager,
    spawnSystem: SpawnSystem,
    activeSkillIds: AttributeSkillId[] = []
  ) {
    this.scene = scene;
    this.entityManager = entityManager;
    this.spawnSystem = spawnSystem;
    // 支持全部 AOE 技能（最多 5 个）
    this.activeSkillIds = activeSkillIds;

    this.playerSkillMaxTimers = this.activeSkillIds.map(id => AOE_CONFIG[id]?.cd ?? 5000);
    this.playerSkillTimers = this.playerSkillMaxTimers.map(() => 0);
  }

  update(
    delta: number,
    player: Phaser.Physics.Arcade.Sprite,
    playerCombatant: Combatant
  ): void {
    if (this.gameOver) return;

    this.playerAttackTimer = Math.max(0, this.playerAttackTimer - delta);
    this.playerAttackAnimTimer = Math.max(0, this.playerAttackAnimTimer - delta);
    this.playerSkillTimers = this.playerSkillTimers.map(t => Math.max(0, t - delta));

    // ── 生机被动回血（每 3 秒，数值直接使用技能等级值，非百分比） ──
    this.passiveHealTimer -= delta;
    if (this.passiveHealTimer <= 0) {
      this.passiveHealTimer = 3000;
      this.applyShengjiHeal(player, playerCombatant);
    }

    // ── 玩家状态效果 Tick ──
    this.tickPlayerStatus(delta, player, playerCombatant);

    // ── 敌人状态效果 Tick ──
    this.tickEnemyStatuses(delta);

    const alive = this.entityManager.getAlive();

    // ---- 结算延迟伤害（玩家普攻动画结束后） ----
    this.pendingDamages = this.pendingDamages.filter(pd => {
      pd.timer -= delta;
      if (pd.timer <= 0) {
        const target = this.getNearestEnemy(pd.playerSprite, this.entityManager.getAlive(), pd.range);
        if (target) {
          this.attackEnemy(pd.attacker, target, player, playerCombatant);
        } else {
          this.showMissText(pd.playerSprite.x, pd.playerSprite.y - 30);
        }
        return false;
      }
      return true;
    });

    // ---- 玩家自动普攻（伤害延迟到动画结束，塑型中暂停） ----
    if (this.playerAttackTimer <= 0 && !this.playerChanneling) {
      const target = this.getNearestEnemy(player, alive, AUTO_ATTACK_RANGE);
      if (target) {
        const interval = this.getAttackInterval(playerCombatant.speed);
        this.playerAttackTimer = interval;
        // 攻击阶段 = 60% 间隔
        const animDuration = interval * 0.6;
        this.playerAttackAnimTimer = animDuration;

        // 朝向目标
        player.setFlipX(target.sprite.x < player.x);

        // 播放攻击动画，速度随攻击速度缩放
        const magicKey = 'player_spirit_magic';
        if (this.scene.anims.exists(magicKey)) {
          player.play(magicKey, true);
          player.anims.timeScale = BASE_ATTACK_INTERVAL / interval;
        }

        // 在攻击动画约结束时结算伤害
        this.pendingDamages.push({
          timer: animDuration,
          attacker: playerCombatant,
          playerSprite: player,
          range: AUTO_ATTACK_RANGE,
        });
      }
    }

    // ---- 手动主动技能（按钮触发） ----
    const justPressed = inputManager.consumeJustPressed();
    this.activeSkillIds.forEach((skillId, i) => {
      if (justPressed[i] && this.playerSkillTimers[i] <= 0) {
        this.playerSkillTimers[i] = this.playerSkillMaxTimers[i];
        this.executeActiveSkill(skillId, player, playerCombatant, alive);
      }
    });

    // ---- 妖异攻击玩家（相位制：60%攻击 + 40%冷却） ----
    alive.forEach(entity => {
      const dist = Phaser.Math.Distance.Between(
        entity.sprite.x, entity.sprite.y, player.x, player.y
      );

      if (entity.attackPhase === 'ready') {
        if (dist <= ENEMY_ATTACK_RANGE && entity.state === 'attack') {
          const interval = this.getAttackInterval(entity.combatant.speed);
          entity.attackCurrentInterval = interval;
          entity.attackPhase = 'attacking';
          entity.attackPhaseTimer = interval * 0.6;

          entity.sprite.setFlipX(player.x < entity.sprite.x);

          if (entity.atlasKey) {
            const atkKey = `${entity.atlasKey}_atk`;
            if (this.scene.anims.exists(atkKey)) {
              entity.sprite.play(atkKey, true);
              entity.sprite.anims.timeScale = BASE_ATTACK_INTERVAL / interval;
            }
          }
        }
      } else if (entity.attackPhase === 'attacking') {
        entity.attackPhaseTimer -= delta;

        if (dist > ENEMY_ATTACK_RANGE) {
          entity.attackPhase = 'ready';
          entity.attackPhaseTimer = 0;
        } else if (entity.attackPhaseTimer <= 0) {
          this.attackPlayer(entity, playerCombatant, player);
          eventBus.emit(GameEvent.PLAYER_HP_CHANGE, playerCombatant.hp, playerCombatant.maxHp);

          entity.attackPhase = 'cooldown';
          entity.attackPhaseTimer = entity.attackCurrentInterval * 0.4;
        }
      } else {
        // cooldown
        entity.attackPhaseTimer -= delta;
        if (entity.attackPhaseTimer <= 0) {
          entity.attackPhase = 'ready';
          entity.attackPhaseTimer = 0;
        }
      }
    });
  }

  /** 攻击动画是否正在播放（供 WorldScene 保护动画不被覆盖） */
  isAttackAnimActive(): boolean {
    return this.playerAttackAnimTimer > 0;
  }

  /** 设置塑型状态（塑型中暂停自动普攻） */
  setPlayerChanneling(value: boolean): void {
    this.playerChanneling = value;
  }

  // ───────────────────────── 被动技能 ─────────────────────────

  /** 生机：每 3 秒恢复 X 点生命（直接使用技能等级数值，不再是百分比） */
  private applyShengjiHeal(
    player: Phaser.Physics.Arcade.Sprite,
    playerCombatant: Combatant
  ): void {
    if (!playerCombatant.attributeSkills?.includes(AttributeSkillId.SHENGJI)) return;
    if (playerCombatant.hp >= playerCombatant.maxHp) return;

    const wuxingLevels = playerCombatant.allWuxingLevels ?? new Map();
    const skillLevels = calculateSkillEffectLevels(playerCombatant.attributeSkills, wuxingLevels);
    const level = skillLevels.levels.get(AttributeSkillId.SHENGJI);
    if (!level) return;

    // 直接使用技能数值作为回复量（非百分比）
    const healAmount = Math.max(1, getSkillValue(AttributeSkillId.SHENGJI, level));
    playerCombatant.hp = Math.min(playerCombatant.maxHp, playerCombatant.hp + healAmount);
    eventBus.emit(GameEvent.PLAYER_HP_CHANGE, playerCombatant.hp, playerCombatant.maxHp);
    this.showHealText(player.x, player.y - 30, healAmount);
  }

  /** 玩家状态效果 Tick（灼烧伤害、减速过期） */
  private tickPlayerStatus(
    delta: number,
    _player: Phaser.Physics.Arcade.Sprite,
    playerCombatant: Combatant
  ): void {
    if (this.playerStatus.burning > 0) {
      this.playerStatus.burning -= delta;
      this.playerStatus.burnTickTimer -= delta;
      if (this.playerStatus.burnTickTimer <= 0) {
        this.playerStatus.burnTickTimer = 2000;
        // 灼烧：每 tick 固定 2 点伤害
        const burnDmg = 2;
        playerCombatant.hp = Math.max(0, playerCombatant.hp - burnDmg);
        eventBus.emit(GameEvent.PLAYER_HP_CHANGE, playerCombatant.hp, playerCombatant.maxHp);
        if (playerCombatant.hp <= 0) {
          this.triggerGameOver();
        }
      }
    }
    if (this.playerStatus.slowed > 0) {
      this.playerStatus.slowed -= delta;
    }
  }

  /** 敌人状态效果 Tick（灼烧伤害、减速过期） */
  private tickEnemyStatuses(delta: number): void {
    const alive = this.entityManager.getAlive();
    alive.forEach(entity => {
      const id = entity.combatant.id;
      const st = this.enemyStatuses.get(id);
      if (!st) return;

      if (st.burning > 0) {
        st.burning -= delta;
        st.burnTickTimer -= delta;
        if (st.burnTickTimer <= 0) {
          st.burnTickTimer = 2000;
          // 敌人灼烧：固定 2 点
          const burnDmg = 2;
          entity.combatant.hp = Math.max(0, entity.combatant.hp - burnDmg);
          this.showDamageText(entity.sprite.x, entity.sprite.y - 30, burnDmg, 0xff6633);
          if (entity.hpBar) {
            this.spawnSystem.updateEnemyHpBar(entity.hpBar, entity.combatant.hp, entity.combatant.maxHp);
          }
          if (entity.combatant.hp <= 0) this.onEnemyDeath(entity);
        }
      }
      if (st.slowed > 0) {
        st.slowed -= delta;
      }
    });
  }

  // ───────────────────────── 主动技能 ─────────────────────────

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

    let totalDamage = 0;
    alive.forEach(e => {
      const d = Phaser.Math.Distance.Between(player.x, player.y, e.sprite.x, e.sprite.y);
      if (d <= radius) {
        const result = resolveCombat(playerCombatant, e.combatant);
        this.applyDamageToEnemy(e, result.damage, playerCombatant, result.healTarget);
        totalDamage += result.damage;

        // 自身回血（被土生时）
        if (result.healSelf > 0) {
          playerCombatant.hp = Math.min(playerCombatant.maxHp, playerCombatant.hp + result.healSelf);
          eventBus.emit(GameEvent.PLAYER_HP_CHANGE, playerCombatant.hp, playerCombatant.maxHp);
          this.showHealText(player.x, player.y - 50, result.healSelf);
        }

        // 焚天：施加灼烧
        if (skillId === AttributeSkillId.FENTIAN) {
          this.applyBurningToEnemy(e, 6000);
        }
        // 寒潮：施加减速
        if (skillId === AttributeSkillId.HANCHAO) {
          this.applySlowToEnemy(e, 4000);
        }
      }
    });

    if (skillId === AttributeSkillId.JINGJI && totalDamage > 0) {
      const heal = Math.floor(totalDamage * 0.3);
      playerCombatant.hp = Math.min(playerCombatant.maxHp, playerCombatant.hp + heal);
      eventBus.emit(GameEvent.PLAYER_HP_CHANGE, playerCombatant.hp, playerCombatant.maxHp);
      this.showHealText(player.x, player.y - 50, heal);
    }
  }

  // ───────────────────────── 伤害计算 ─────────────────────────

  private getAttackInterval(speed: number): number {
    if (speed <= 0) return BASE_ATTACK_INTERVAL;
    return Math.max(300, BASE_ATTACK_INTERVAL / (speed / BASE_SPEED));
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

  private attackEnemy(
    attacker: Combatant,
    target: WorldEntity,
    playerSprite: Phaser.Physics.Arcade.Sprite,
    playerCombatant: Combatant
  ): void {
    const result = resolveCombat(attacker, target.combatant);
    this.applyDamageToEnemy(target, result.damage, attacker, result.healTarget);

    // 被土生：自身回血
    if (result.healSelf > 0) {
      playerCombatant.hp = Math.min(playerCombatant.maxHp, playerCombatant.hp + result.healSelf);
      eventBus.emit(GameEvent.PLAYER_HP_CHANGE, playerCombatant.hp, playerCombatant.maxHp);
      this.showHealText(playerSprite.x, playerSprite.y - 30, result.healSelf);
    }

    // 被动：攻击后触发效果
    this.processPlayerAfterAttackPassives(attacker, target, playerSprite);
  }

  /** 处理玩家攻击后被动技能（燎原/凝滞/余烬等） */
  private processPlayerAfterAttackPassives(
    attacker: Combatant,
    target: WorldEntity,
    _playerSprite: Phaser.Physics.Arcade.Sprite
  ): void {
    if (!attacker.attributeSkills || attacker.attributeSkills.length === 0) return;
    const wuxingLevels = attacker.allWuxingLevels ?? new Map();
    const skillLevels = calculateSkillEffectLevels(attacker.attributeSkills, wuxingLevels);

    // 燎原：X% 概率灼烧敌人
    const liaoyuanLevel = skillLevels.levels.get(AttributeSkillId.LIAOYUAN);
    if (liaoyuanLevel) {
      const chance = getSkillValue(AttributeSkillId.LIAOYUAN, liaoyuanLevel);
      if (Math.random() * 100 < chance) {
        this.applyBurningToEnemy(target, 6000);
      }
    }

    // 凝滞：X% 概率减速敌人
    const ningzhiLevel = skillLevels.levels.get(AttributeSkillId.NINGZHI);
    if (ningzhiLevel) {
      const chance = getSkillValue(AttributeSkillId.NINGZHI, ningzhiLevel);
      if (Math.random() * 100 < chance) {
        this.applySlowToEnemy(target, 4000);
      }
    }
  }

  private applyBurningToEnemy(target: WorldEntity, durationMs: number): void {
    const id = target.combatant.id;
    const st = this.enemyStatuses.get(id) ?? { burning: 0, slowed: 0, burnTickTimer: 0 };
    st.burning = Math.max(st.burning, durationMs);
    if (st.burnTickTimer <= 0) st.burnTickTimer = 2000;
    this.enemyStatuses.set(id, st);
  }

  private applySlowToEnemy(target: WorldEntity, durationMs: number): void {
    const id = target.combatant.id;
    const st = this.enemyStatuses.get(id) ?? { burning: 0, slowed: 0, burnTickTimer: 0 };
    st.slowed = Math.max(st.slowed, durationMs);
    this.enemyStatuses.set(id, st);
    if (!target.combatant.statusEffects) target.combatant.statusEffects = {};
    target.combatant.statusEffects.slowed = { turnsLeft: 1 };
  }

  private applyDamageToEnemy(
    target: WorldEntity,
    damage: number,
    _attacker: Combatant,
    healTarget: number = 0
  ): void {
    // 五行相生：治疗敌人（0 伤害，+1 血）
    if (healTarget > 0) {
      target.combatant.hp = Math.min(target.combatant.maxHp, target.combatant.hp + healTarget);
      if (target.hpBar) {
        this.spawnSystem.updateEnemyHpBar(target.hpBar, target.combatant.hp, target.combatant.maxHp);
      }
      this.showHealText(target.sprite.x, target.sprite.y - 25, healTarget);
      return;
    }

    if (damage <= 0) return;

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

  private attackPlayer(
    entity: WorldEntity,
    player: Combatant,
    playerSprite: Phaser.Physics.Arcade.Sprite
  ): void {
    const result = resolveCombat(entity.combatant, player);

    // 五行生关系：治疗玩家
    if (result.healTarget > 0) {
      player.hp = Math.min(player.maxHp, player.hp + result.healTarget);
      eventBus.emit(GameEvent.PLAYER_HP_CHANGE, player.hp, player.maxHp);
      this.showHealText(playerSprite.x, playerSprite.y - 30, result.healTarget);
      return;
    }

    // 妖异被自己五行生：回血
    if (result.healSelf > 0) {
      entity.combatant.hp = Math.min(entity.combatant.maxHp, entity.combatant.hp + result.healSelf);
      if (entity.hpBar) {
        this.spawnSystem.updateEnemyHpBar(entity.hpBar, entity.combatant.hp, entity.combatant.maxHp);
      }
    }

    if (result.damage > 0) {
      player.hp = Math.max(0, player.hp - result.damage);
      this.showDamageText(
        this.scene.cameras.main.worldView.x + this.scene.cameras.main.width / 2,
        this.scene.cameras.main.worldView.y + 60,
        result.damage,
        0xf85149
      );
    }

    // 余烬：受击时 X% 概率使攻击者灼烧
    if (player.attributeSkills) {
      const wuxingLevels = player.allWuxingLevels ?? new Map();
      const skillLevels = calculateSkillEffectLevels(player.attributeSkills, wuxingLevels);
      const yujinLevel = skillLevels.levels.get(AttributeSkillId.YUJIN);
      if (yujinLevel) {
        const chance = getSkillValue(AttributeSkillId.YUJIN, yujinLevel);
        if (Math.random() * 100 < chance) {
          this.applyBurningToEnemy(entity, 6000);
        }
      }
    }

    if (player.hp <= 0) {
      this.triggerGameOver();
    }
  }

  /** 触发游戏失败（发出事件，不直接切换场景） */
  private triggerGameOver(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    eventBus.emit(GameEvent.PLAYER_DEATH);
    eventBus.emit(GameEvent.GAME_OVER);
  }

  /** 查询敌人是否处于减速状态（供 WorldScene 调整移速） */
  isEnemySlowed(id: string): boolean {
    const st = this.enemyStatuses.get(id);
    return !!(st && st.slowed > 0);
  }

  /** 查询敌人是否处于灼烧状态（供显示用） */
  isEnemyBurning(id: string): boolean {
    const st = this.enemyStatuses.get(id);
    return !!(st && st.burning > 0);
  }

  private onEnemyDeath(entity: WorldEntity): void {
    this.enemyStatuses.delete(entity.combatant.id);

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
    const ex = entity.sprite.x;
    const ey = entity.sprite.y;
    entity.sprite.destroy();
    entity.hpBar?.destroy();
    entity.hpBarBg?.destroy();
    this.entityManager.remove(entity.combatant.id);
    eventBus.emit(GameEvent.ENEMY_DIED, entity.combatant);

    const wuxing = entity.combatant.attackWuxing?.wuxing;
    const level = entity.combatant.attackWuxing?.level ?? 1;
    if (wuxing !== undefined) {
      eventBus.emit(GameEvent.LOOT_DROPPED, { x: ex, y: ey, wuxing, level });
    }
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

  private showHealText(x: number, y: number, amount: number): void {
    const text = this.scene.add.text(x, y, `+${amount}`, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#3fb950',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(30);
    this.scene.tweens.add({
      targets: text,
      y: y - 35,
      alpha: 0,
      duration: 700,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  private showMissText(x: number, y: number): void {
    const text = this.scene.add.text(x, y, 'miss', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#8b949e',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(30);
    this.scene.tweens.add({
      targets: text,
      y: y - 30,
      alpha: 0,
      duration: 600,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  getActiveSkillIds(): AttributeSkillId[] { return this.activeSkillIds; }
  getPlayerSkillTimers(): number[] { return [...this.playerSkillTimers]; }
  getPlayerSkillMaxTimers(): number[] { return [...this.playerSkillMaxTimers]; }
}
