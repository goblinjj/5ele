import Phaser from 'phaser';
import {
  Combatant, AttributeSkillId, Wuxing,
  getSkillValue, checkFengchun, addXushiStack, resetXushiStacks,
} from '@xiyou/shared';
import { EntityManager, WorldEntity } from '../world/EntityManager.js';
import { SpawnSystem } from '../world/SpawnSystem.js';
import { inputManager } from '../input/InputManager.js';
import { resolveCombat } from './CombatResolver.js';
import { eventBus, GameEvent } from '../../core/EventBus.js';
import { Fx, FX_DEPTH } from '../fx/Fx.js';
import { AUTO_ATTACK_RANGE, WX_TINT, SPIRIT_TINT } from '../../config/worldConfig.js';
import { sfx } from '../audio/Sfx.js';

/** 范围技能配置 */
export interface AoeConfig {
  label: string;
  wuxing: Wuxing;
  radius: number;
  cd: number;
  /** 伤害倍率 */
  mult: number;
}
export const AOE_CONFIG: Record<string, AoeConfig> = {
  [AttributeSkillId.LIEKONGZHAN]: { label: '裂空斩', wuxing: Wuxing.METAL, radius: 340, cd: 5000, mult: 1.6 },
  [AttributeSkillId.HANCHAO]:     { label: '寒潮',   wuxing: Wuxing.WATER, radius: 380, cd: 6000, mult: 1.0 },
  [AttributeSkillId.JINGJI]:      { label: '荆棘',   wuxing: Wuxing.WOOD,  radius: 320, cd: 5000, mult: 1.0 },
  [AttributeSkillId.FENTIAN]:     { label: '焚天',   wuxing: Wuxing.FIRE,  radius: 400, cd: 7000, mult: 1.0 },
  [AttributeSkillId.DILIE]:       { label: '地裂',   wuxing: Wuxing.EARTH, radius: 300, cd: 6000, mult: 1.2 },
};
export const AOE_SKILL_IDS = new Set<AttributeSkillId>(Object.keys(AOE_CONFIG) as AttributeSkillId[]);

/** 本源之击的基础间隔（ms），速度越高越快。出手慢而重：每一击都要算数 */
const BASE_ATTACK_INTERVAL = 1150;
/** 起手到气劲离手的时间 */
const ATTACK_WINDUP = 190;
/** 单发伤害倍率（补偿放慢的攻速） */
const BASIC_MULT = 2.0;

/** 御：架势持续 / 冷却 / 防反判定窗口 / 普通格挡的减伤 */
const GUARD_DURATION = 520;
const GUARD_COOLDOWN = 1500;
const PARRY_WINDOW = 230;
const GUARD_BLOCK_MULT = 0.3;
/** 防反的反击倍率、破绽时间 */
const PARRY_COUNTER_MULT = 3;
const PARRY_STAGGER = 1700;
/** 妖异处于破绽（硬直）时受到的额外伤害 */
const STAGGER_BONUS = 1.5;
const BOLT_SPEED = 1150;

const BURN_TICK = 1000;
const BURN_DURATION = 4000;
const SLOW_DURATION = 3500;

interface PlayerBolt {
  img: Phaser.GameObjects.Image;
  target: WorldEntity | null;
  vx: number;
  vy: number;
  life: number;
  color: number;
  mult: number;
  basic: boolean;
}

interface EnemyBolt {
  img: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
  source: WorldEntity;
  vx: number;
  vy: number;
  life: number;
  mult: number;
}

interface TimedStatus {
  burning: number;
  slowed: number;
  burnTick: number;
}

export class CombatSystem {
  private scene: Phaser.Scene;
  private entityManager: EntityManager;
  private spawnSystem: SpawnSystem;
  private fx: Fx;
  private player: Phaser.Physics.Arcade.Sprite;
  private pc: Combatant;

  private skillIds: AttributeSkillId[] = [];
  private skillTimers: number[] = [];
  private skillMaxTimers: number[] = [];

  private attackTimer: number = 0;
  private attackAnimTimer: number = 0;
  /** 起手中的一击：倒计时结束才真正放出气劲 */
  private windupTimer: number = 0;
  private guardTimer: number = 0;
  private guardElapsed: number = 0;
  private guardCd: number = 0;
  private currentTarget: WorldEntity | null = null;

  private bolts: PlayerBolt[] = [];
  private enemyBolts: EnemyBolt[] = [];
  private enemyStatuses: Map<string, TimedStatus> = new Map();

  private regenTimer: number = 3000;
  private statusFxTimer: number = 0;
  private invulnTimer: number = 0;
  private playerSlowTimer: number = 0;
  private hurtFlashTimer: number = 0;

  /** 连斩 */
  private combo: number = 0;
  private comboTimer: number = 0;
  private kills: number = 0;

  private gameOver: boolean = false;
  private lastDelta: number = 16;

  constructor(
    scene: Phaser.Scene,
    entityManager: EntityManager,
    spawnSystem: SpawnSystem,
    fx: Fx,
    player: Phaser.Physics.Arcade.Sprite,
    playerCombatant: Combatant,
  ) {
    this.scene = scene;
    this.entityManager = entityManager;
    this.spawnSystem = spawnSystem;
    this.fx = fx;
    this.player = player;
    this.pc = playerCombatant;
  }

  // ───────────────────────── 对外查询 ─────────────────────────

  /** 装备变化后更新可用的范围技能（保留已有冷却） */
  setSkills(ids: AttributeSkillId[]): void {
    const old = new Map<AttributeSkillId, number>();
    this.skillIds.forEach((id, i) => old.set(id, this.skillTimers[i]));
    this.skillIds = ids.slice(0, 5);
    this.skillMaxTimers = this.skillIds.map(id => AOE_CONFIG[id]?.cd ?? 5000);
    this.skillTimers = this.skillIds.map(id => old.get(id) ?? 0);
  }

  getSkillIds(): AttributeSkillId[] { return this.skillIds; }
  getSkillTimers(): number[] { return this.skillTimers; }
  getSkillMaxTimers(): number[] { return this.skillMaxTimers; }
  getKills(): number { return this.kills; }
  getCombo(): number { return this.combo; }
  getTarget(): WorldEntity | null { return this.currentTarget; }
  isAttackAnimActive(): boolean { return this.attackAnimTimer > 0; }
  isInvulnerable(): boolean { return this.invulnTimer > 0; }
  isGuarding(): boolean { return this.guardTimer > 0; }
  /** 是否处于防反判定窗口内 */
  isParryWindow(): boolean { return this.guardTimer > 0 && this.guardElapsed <= PARRY_WINDOW; }
  getGuardCdPct(): number { return this.guardCd / GUARD_COOLDOWN; }
  setInvulnerable(ms: number): void { this.invulnTimer = Math.max(this.invulnTimer, ms); }

  /** 玩家移速倍率（被减速 / 连斩加速） */
  getPlayerSpeedMul(): number {
    let m = this.playerSlowTimer > 0 ? 0.6 : 1;
    // 架势中移动缓慢
    if (this.guardTimer > 0) m *= 0.4;
    if (this.combo >= 3) m *= 1.1;
    return m;
  }

  isEnemySlowed(id: string): boolean {
    const st = this.enemyStatuses.get(id);
    return !!st && st.slowed > 0;
  }

  /** 每轮开始时重置"每场一次"的效果 */
  resetRoundFlags(): void {
    if (this.pc.statusEffects) this.pc.statusEffects.hasSurvivedLethal = false;
  }

  /** 玩家攻击五行的表现色 */
  private attackColor(): number {
    const wx = this.pc.attackWuxing?.wuxing;
    return wx ? WX_TINT[wx] : SPIRIT_TINT;
  }

  private attackInterval(): number {
    let interval = BASE_ATTACK_INTERVAL / (1 + 0.22 * Math.max(0, this.pc.speed));
    if (this.combo >= 8) interval *= 0.7;
    else if (this.combo >= 3) interval *= 0.85;
    return Math.max(480, interval);
  }

  // ───────────────────────── 主循环 ─────────────────────────

  update(delta: number, moving: boolean): void {
    if (this.gameOver) return;
    this.lastDelta = delta;

    this.attackTimer -= delta;
    this.attackAnimTimer = Math.max(0, this.attackAnimTimer - delta);
    this.invulnTimer = Math.max(0, this.invulnTimer - delta);
    this.playerSlowTimer = Math.max(0, this.playerSlowTimer - delta);
    for (let i = 0; i < this.skillTimers.length; i++) {
      this.skillTimers[i] = Math.max(0, this.skillTimers[i] - delta);
    }

    if (this.hurtFlashTimer > 0) {
      this.hurtFlashTimer -= delta;
      if (this.hurtFlashTimer <= 0) this.player.clearTint();
    }

    if (this.comboTimer > 0) {
      this.comboTimer -= delta;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // ---- 御 ----
    this.guardCd = Math.max(0, this.guardCd - delta);
    if (this.guardTimer > 0) {
      this.guardTimer -= delta;
      this.guardElapsed += delta;
    }
    if (inputManager.consumeGuard() && this.guardCd <= 0 && this.guardTimer <= 0) {
      this.guardTimer = GUARD_DURATION;
      this.guardElapsed = 0;
      this.guardCd = GUARD_COOLDOWN;
      this.windupTimer = 0; // 架势打断起手
      sfx.guard();
    }

    this.tickPassiveRegen(delta);
    this.tickEnemyStatuses(delta);
    this.updateAutoAttack(moving);
    this.updateSkills();
    this.updateBolts(delta);
    this.updateEnemyBolts(delta);
  }

  // ───────────────────────── 本源之击（自动普攻） ─────────────────────────

  /** 索敌：射程内血量最少的妖异（血量相同取更近的），优先收掉残血 */
  private findTarget(range: number): WorldEntity | null {
    let pick: WorldEntity | null = null;
    let bestHp = Infinity;
    let bestD2 = Infinity;
    const r2 = range * range;
    const px = this.player.x, py = this.player.y;
    const alive = this.entityManager.getAlive();
    for (let i = 0; i < alive.length; i++) {
      const e = alive[i];
      const dx = e.sprite.x - px, dy = e.sprite.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      const hp = e.combatant.hp;
      if (hp < bestHp || (hp === bestHp && d2 < bestD2)) {
        bestHp = hp; bestD2 = d2; pick = e;
      }
    }
    return pick;
  }

  private updateAutoAttack(_moving: boolean): void {
    if (this.attackTimer > 0 && this.windupTimer <= 0) {
      // 冷却期间只在目标失效时重新索敌（用于朝向与锁定标记）
      const t = this.currentTarget;
      if (!t || t.dying || t.combatant.hp <= 0 ||
          Phaser.Math.Distance.Between(this.player.x, this.player.y, t.sprite.x, t.sprite.y) > AUTO_ATTACK_RANGE) {
        this.currentTarget = this.findTarget(AUTO_ATTACK_RANGE);
      }
      return;
    }
    // 起手已完成：气劲离手（目标若已溃散则改打当前血量最少的）
    if (this.windupTimer > 0) {
      this.windupTimer -= this.lastDelta;
      if (this.windupTimer <= 0) {
        const tgt = this.findTarget(AUTO_ATTACK_RANGE * 1.15);
        this.currentTarget = tgt;
        if (tgt) this.fireBolt(tgt, BASIC_MULT, true);
      }
      return;
    }
    if (this.guardTimer > 0) return; // 架势中不出手

    // 每次出手都重新挑选射程内血量最少的
    const target = this.findTarget(AUTO_ATTACK_RANGE);
    this.currentTarget = target;
    if (!target) return;

    this.attackTimer = this.attackInterval();
    this.windupTimer = ATTACK_WINDUP;

    // 出手动作：移动中也会播放（不影响移动速度）
    this.player.setFlipX(target.sprite.x < this.player.x);
    const atkKey = 'player_spirit_atk';
    if (this.scene.anims.exists(atkKey)) {
      this.player.play(atkKey, true);
      // 6 帧 @12fps = 500ms，压到 ~380ms，气劲在第 3 帧前后离手
      this.player.anims.timeScale = 1.3;
      this.attackAnimTimer = 380;
    }
    // 掌心聚气
    const color = this.attackColor();
    const dir = target.sprite.x < this.player.x ? -1 : 1;
    this.fx.flashGlow(this.player.x + dir * 34, this.player.y - 14, 46, color, ATTACK_WINDUP + 60, 0.7);
    this.fx.ember(this.player.x + dir * 30, this.player.y - 10, color, 4, 18);
  }

  private fireBolt(target: WorldEntity, mult: number, basic: boolean): void {
    const color = this.attackColor();
    const sx = this.player.x;
    const sy = this.player.y - 14;
    const angle = Math.atan2(target.sprite.y - sy, target.sprite.x - sx);
    const img = this.scene.add.image(sx + Math.cos(angle) * 30, sy + Math.sin(angle) * 30, 'fx_bolt')
      .setTint(color).setBlendMode(Phaser.BlendModes.ADD)
      .setOrigin(0.85, 0.5).setRotation(angle).setScale(basic ? 1.05 : 1.4, basic ? 0.85 : 1.1).setDepth(FX_DEPTH);
    this.bolts.push({
      img, target,
      vx: Math.cos(angle) * BOLT_SPEED,
      vy: Math.sin(angle) * BOLT_SPEED,
      life: 700,
      color,
      mult,
      basic,
    });
    this.fx.flashGlow(sx + Math.cos(angle) * 34, sy + Math.sin(angle) * 34, 34, color, 140, 0.9);
    sfx.shoot();
  }

  private updateBolts(delta: number): void {
    const dt = delta / 1000;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= delta;

      // 追踪存活目标
      const t = b.target;
      if (t && !t.dying && t.combatant.hp > 0) {
        const a = Math.atan2(t.sprite.y - b.img.y, t.sprite.x - b.img.x);
        b.vx = Math.cos(a) * BOLT_SPEED;
        b.vy = Math.sin(a) * BOLT_SPEED;
        b.img.setRotation(a);
      } else {
        b.target = null;
      }
      b.img.x += b.vx * dt;
      b.img.y += b.vy * dt;
      this.fx.trail(b.img.x, b.img.y, b.color, 3);

      // 命中判定
      let hit: WorldEntity | null = null;
      if (b.target) {
        const r = 34 + 60 * b.target.baseScale;
        if (Phaser.Math.Distance.Squared(b.img.x, b.img.y, b.target.sprite.x, b.target.sprite.y) < r * r) hit = b.target;
      } else {
        const alive = this.entityManager.getAlive();
        for (let k = 0; k < alive.length; k++) {
          const e = alive[k];
          const r = 30 + 60 * e.baseScale;
          if (Phaser.Math.Distance.Squared(b.img.x, b.img.y, e.sprite.x, e.sprite.y) < r * r) { hit = e; break; }
        }
      }

      if (hit) {
        this.hitEnemy(hit, b.mult, b.color, Math.atan2(b.vy, b.vx), b.basic);
        b.img.destroy();
        this.bolts.splice(i, 1);
      } else if (b.life <= 0) {
        b.img.destroy();
        this.bolts.splice(i, 1);
      }
    }
  }

  // ───────────────────────── 对妖异造成伤害 ─────────────────────────

  /**
   * 残魂命中妖异
   * @param angle 击退方向
   * @param isBasic 是否普攻（触发攻击后被动）
   */
  private hitEnemy(target: WorldEntity, mult: number, color: number, angle: number, isBasic: boolean): number {
    if (target.dying) return 0;
    // 破绽：硬直中的妖异受到额外伤害
    const staggered = target.stunTimer > 0;
    const res = resolveCombat(this.pc, target.combatant, staggered ? mult * STAGGER_BONUS : mult);
    const tx = target.sprite.x;
    const ty = target.sprite.y - 60 * target.baseScale;

    target.combatant.hp = Math.max(0, target.combatant.hp - res.damage);
    this.spawnSystem.updateHpBar(target);
    if (isBasic) resetXushiStacks(this.pc);

    // 飘字：克 → 金色大字；得生 → 亮色；受制 / 泄 → 灰色小字并标注
    if (res.relation === 'ke') {
      this.fx.floatText(tx, ty - 34, `克 ${res.damage}${res.critical ? '!' : ''}`, '#ffe066', res.critical ? 42 : 36, 88);
    } else if (res.critical) {
      this.fx.floatText(tx, ty - 34, `${res.damage}!`, '#ffb020', 38, 88);
    } else if (res.relation === 'sheng') {
      this.fx.floatText(tx, ty - 30, `泄 ${res.damage}`, '#6e7681', 20, 50);
    } else if (res.relation === 'beike') {
      this.fx.floatText(tx, ty - 30, `制 ${res.damage}`, '#8b949e', 21, 54);
    } else if (res.relation === 'bisheng') {
      this.fx.floatText(tx, ty - 30, `${res.damage}`, '#b6f0c8', 29, 74);
    } else {
      this.fx.floatText(tx, ty - 30, `${res.damage}`, '#ffffff', 26);
    }

    sfx.hit(res.relation === 'ke', res.relation === 'sheng' || res.relation === 'beike');
    if (staggered) this.fx.floatText(tx, ty - 74, '破绽', '#ffb020', 22, 40, 500);

    // 受击反馈：闪白、火花、击退
    target.sprite.setTintFill(0xffffff);
    target.flashTimer = 70;
    this.fx.burst(tx, ty + 10, color, res.critical || res.relation === 'ke' ? 12 : 6);
    if (target.tier === 'normal' && target.phase === 'idle') {
      const kb = res.relation === 'ke' || res.critical ? 320 : 190;
      target.knockX = Math.cos(angle) * kb;
      target.knockY = Math.sin(angle) * kb;
      target.knockTimer = 110;
    }
    if (target.atlasKey && target.phase === 'idle' && target.combatant.hp > 0) {
      const hurtKey = `${target.atlasKey}_hurt`;
      if (this.scene.anims.exists(hurtKey)) {
        target.sprite.play(hurtKey, true);
        target.sprite.anims.timeScale = 2;
      }
    }
    target.aggro = true;

    if (target.combatant.hp <= 0) {
      this.killEnemy(target);
    } else if (isBasic) {
      this.applyAfterAttackPassives(target, res.critical);
    }
    return res.damage;
  }

  private skillLevel(id: AttributeSkillId): number {
    return this.pc.skillEffectLevels?.levels.get(id) ?? 0;
  }

  /** 燎原 / 凝滞 / 寒锋 */
  private applyAfterAttackPassives(target: WorldEntity, critical: boolean): void {
    const liaoyuan = this.skillLevel(AttributeSkillId.LIAOYUAN);
    if (liaoyuan && Math.random() * 100 < getSkillValue(AttributeSkillId.LIAOYUAN, liaoyuan)) {
      this.applyBurn(target);
    }
    const ningzhi = this.skillLevel(AttributeSkillId.NINGZHI);
    if (ningzhi && Math.random() * 100 < getSkillValue(AttributeSkillId.NINGZHI, ningzhi)) {
      this.applySlow(target);
    }
    if (critical) {
      const hanfeng = this.skillLevel(AttributeSkillId.HANFENG);
      if (hanfeng && Math.random() * 100 < getSkillValue(AttributeSkillId.HANFENG, hanfeng)) {
        this.applySlow(target);
      }
    }
  }

  private statusOf(target: WorldEntity): TimedStatus {
    let st = this.enemyStatuses.get(target.combatant.id);
    if (!st) {
      st = { burning: 0, slowed: 0, burnTick: BURN_TICK };
      this.enemyStatuses.set(target.combatant.id, st);
    }
    return st;
  }

  private applyBurn(target: WorldEntity): void {
    const st = this.statusOf(target);
    if (st.burning <= 0) st.burnTick = BURN_TICK;
    st.burning = BURN_DURATION;
    if (!target.combatant.statusEffects) target.combatant.statusEffects = {};
    target.combatant.statusEffects.burning = { stacks: 1, damagePercent: 0, turnsLeft: 1 };
    this.refreshTint(target);
  }

  private applySlow(target: WorldEntity): void {
    const st = this.statusOf(target);
    st.slowed = SLOW_DURATION;
    if (!target.combatant.statusEffects) target.combatant.statusEffects = {};
    target.combatant.statusEffects.slowed = { turnsLeft: 1 };
    this.refreshTint(target);
  }

  /** 按当前状态恢复妖异的染色（闪白结束 / 状态变化时调用） */
  refreshTint(target: WorldEntity): void {
    if (target.dying || !target.sprite.active) return;
    const st = this.enemyStatuses.get(target.combatant.id);
    if (st && st.burning > 0) target.sprite.setTint(0xff9a5c);
    else if (st && st.slowed > 0) target.sprite.setTint(0x8ecbff);
    else if (target.enraged) target.sprite.setTint(0xff7a7a);
    else if (target.tier === 'boss') target.sprite.setTint(0xc9a0ff);
    else target.sprite.clearTint();
  }

  private tickEnemyStatuses(delta: number): void {
    const alive = this.entityManager.getAlive();
    // 状态粒子每 110ms 发一轮
    this.statusFxTimer -= delta;
    const emitFx = this.statusFxTimer <= 0;
    if (emitFx) this.statusFxTimer = 110;
    for (let i = 0; i < alive.length; i++) {
      const entity = alive[i];

      if (entity.flashTimer > 0) {
        entity.flashTimer -= delta;
        if (entity.flashTimer <= 0) this.refreshTint(entity);
      }

      const st = this.enemyStatuses.get(entity.combatant.id);
      if (emitFx) {
        const ex = entity.sprite.x, ey = entity.sprite.y;
        const spread = 110 * entity.baseScale;
        // 魁首 / 核心：五行气焰；狂暴：血色戾气
        if (entity.tier !== 'normal') this.fx.ember(ex, ey + 20, WX_TINT[entity.wuxing], entity.tier === 'boss' ? 3 : 1, spread);
        if (entity.enraged) this.fx.ember(ex, ey, 0xff3b3b, 1, spread);
        if (st && st.burning > 0) this.fx.ember(ex, ey, 0xff7a2a, 2, spread);
        if (st && st.slowed > 0) this.fx.trail(ex + (Math.random() - 0.5) * spread * 2, ey + (Math.random() - 0.5) * spread * 2, 0x9fd8ff, 2);
        // 蓄力中：向内聚拢的危险火星
        if (entity.phase === 'windup') this.fx.ember(ex, ey + 30, 0xff5a3a, 1, spread * 1.4);
      }
      if (!st) continue;

      if (st.burning > 0) {
        st.burning -= delta;
        st.burnTick -= delta;
        if (st.burnTick <= 0) {
          st.burnTick += BURN_TICK;
          const dmg = Math.max(1, Math.round(entity.combatant.maxHp * 0.06));
          entity.combatant.hp = Math.max(0, entity.combatant.hp - dmg);
          this.spawnSystem.updateHpBar(entity);
          this.fx.floatText(entity.sprite.x, entity.sprite.y - 70 * entity.baseScale - 20, `${dmg}`, '#ff7a3c', 20, 50);
          this.fx.burst(entity.sprite.x, entity.sprite.y, 0xff6a2a, 3);
          if (entity.combatant.hp <= 0) { this.killEnemy(entity); continue; }
        }
        if (st.burning <= 0) {
          if (entity.combatant.statusEffects) delete entity.combatant.statusEffects.burning;
          this.refreshTint(entity);
        }
      }
      if (st.slowed > 0) {
        st.slowed -= delta;
        if (st.slowed <= 0) {
          if (entity.combatant.statusEffects) delete entity.combatant.statusEffects.slowed;
          this.refreshTint(entity);
        }
      }
    }
  }

  private killEnemy(entity: WorldEntity): void {
    if (entity.dying) return;
    entity.dying = true;
    entity.combatant.hp = 0;
    this.entityManager.markDirty();
    this.enemyStatuses.delete(entity.combatant.id);
    if (this.currentTarget === entity) this.currentTarget = null;

    const { sprite } = entity;
    const body = sprite.body as Phaser.Physics.Arcade.Body | null;
    body?.setVelocity(0, 0);
    body?.setEnable(false);
    entity.tele?.setVisible(false);
    entity.teleEdge?.setVisible(false);
    entity.hpBg.setVisible(false);
    entity.hpFill.setVisible(false);
    entity.ring.setVisible(false);

    const tint = WX_TINT[entity.wuxing];
    const big = entity.tier !== 'normal';
    sfx.enemyDie(entity.wuxing, big);
    this.fx.burst(sprite.x, sprite.y, tint, big ? 40 : 14);
    this.fx.ember(sprite.x, sprite.y, tint, big ? 24 : 8, big ? 90 : 36);
    this.fx.ring(sprite.x, sprite.y, big ? 260 : 110, tint, big ? 600 : 380);
    this.fx.flashGlow(sprite.x, sprite.y, big ? 260 : 120, tint, 320, 0.8);
    if (big) this.fx.shake(entity.tier === 'boss' ? 0.012 : 0.006, entity.tier === 'boss' ? 420 : 180);

    sprite.clearTint();
    if (entity.atlasKey) {
      const dieKey = `${entity.atlasKey}_die`;
      if (this.scene.anims.exists(dieKey)) {
        sprite.play(dieKey, true);
        sprite.anims.timeScale = 1.8;
      }
    }
    this.scene.tweens.add({
      targets: [sprite, entity.shadow],
      alpha: 0, duration: 320, delay: 180,
      onComplete: () => this.spawnSystem.destroyEntity(entity),
    });

    this.kills++;
    this.combo++;
    this.comboTimer = 3500;

    eventBus.emit(GameEvent.ENEMY_DIED, entity);
    eventBus.emit(GameEvent.LOOT_DROPPED, {
      x: sprite.x, y: sprite.y,
      wuxing: entity.wuxing,
      level: entity.combatant.attackWuxing?.level ?? 1,
      tier: entity.tier,
    });
  }

  // ───────────────────────── 范围技能 ─────────────────────────

  private updateSkills(): void {
    const pressed = inputManager.consumeJustPressed();
    for (let i = 0; i < this.skillIds.length; i++) {
      if (pressed[i] && this.skillTimers[i] <= 0) {
        this.skillTimers[i] = this.skillMaxTimers[i];
        this.castSkill(this.skillIds[i]);
      }
    }
  }

  private castSkill(skillId: AttributeSkillId): void {
    const cfg = AOE_CONFIG[skillId];
    if (!cfg) return;
    const px = this.player.x, py = this.player.y;
    const color = WX_TINT[cfg.wuxing];
    const r = cfg.radius;

    // 演出
    sfx.skill(cfg.wuxing);
    this.fx.ring(px, py, r, color, 480, 0.1);
    this.fx.ring(px, py, r * 0.7, 0xffffff, 340, 0.1);
    this.fx.flashGlow(px, py, r * 1.1, color, 480, 0.75);
    this.fx.burst(px, py, color, 28);
    this.fx.radial(px, py, r, color, 30);
    this.fx.ember(px, py, color, 16, r * 0.6);
    this.fx.shake(0.008, 160);
    this.fx.floatText(px, py - 110, cfg.label, '#' + color.toString(16).padStart(6, '0'), 44, 60, 900);
    if (skillId === AttributeSkillId.LIEKONGZHAN) {
      for (let k = 0; k < 6; k++) this.fx.slash(px, py, (k * Math.PI) / 3, r * 1.6, color);
    }
    const magicKey = 'player_spirit_magic';
    if (this.scene.anims.exists(magicKey)) {
      this.player.play(magicKey, true);
      this.player.anims.timeScale = 2;
      this.attackAnimTimer = 300;
    }

    const targets = this.entityManager.getAlive().filter(e =>
      Phaser.Math.Distance.Between(px, py, e.sprite.x, e.sprite.y) <= r + 50 * e.baseScale
    );
    // 技能等级提升威力；地裂：敌人越多伤害越高
    const lv = this.skillLevel(skillId);
    const power = 1 + (lv ? getSkillValue(skillId, lv) : 0) / 100;
    const mult = (skillId === AttributeSkillId.DILIE ? cfg.mult + 0.1 * targets.length : cfg.mult) * power;

    let total = 0;
    targets.forEach(e => {
      const angle = Math.atan2(e.sprite.y - py, e.sprite.x - px);
      total += this.hitEnemy(e, mult, color, angle, false);
      if (e.dying) return;
      if (skillId === AttributeSkillId.FENTIAN) this.applyBurn(e);
      if (skillId === AttributeSkillId.HANCHAO) this.applySlow(e);
      if (skillId === AttributeSkillId.DILIE && e.tier !== 'boss') {
        e.stunTimer = 900;
        e.knockX = Math.cos(angle) * 420;
        e.knockY = Math.sin(angle) * 420;
        e.knockTimer = 160;
      }
    });

    // 荆棘：吸取生命
    if (skillId === AttributeSkillId.JINGJI && total > 0) {
      this.healPlayer(Math.max(1, Math.floor(total * 0.3)));
    }
  }

  // ───────────────────────── 玩家受击 / 回复 ─────────────────────────

  healPlayer(amount: number): void {
    if (amount <= 0 || this.pc.hp >= this.pc.maxHp) return;
    const before = this.pc.hp;
    this.pc.hp = Math.min(this.pc.maxHp, this.pc.hp + amount);
    this.fx.floatText(this.player.x, this.player.y - 90, `+${this.pc.hp - before}`, '#4ade80', 26);
    this.fx.ember(this.player.x, this.player.y + 20, 0x4ade80, 8, 40);
    sfx.heal();
    this.emitHp();
  }

  private emitHp(): void {
    eventBus.emit(GameEvent.PLAYER_HP_CHANGE, this.pc.hp, this.pc.maxHp);
  }

  /** 生机：每 3 秒回复 */
  private tickPassiveRegen(delta: number): void {
    this.regenTimer -= delta;
    if (this.regenTimer > 0) return;
    this.regenTimer = 3000;
    const lv = this.skillLevel(AttributeSkillId.SHENGJI);
    if (lv) this.healPlayer(Math.max(1, Math.round(this.pc.maxHp * getSkillValue(AttributeSkillId.SHENGJI, lv) / 100)));
  }

  /**
   * 妖异的一次攻击落到残魂身上
   * @returns 是否真正造成了伤害
   */
  enemyStrikePlayer(entity: WorldEntity, mult: number = 1, slowMs: number = 0): boolean {
    if (this.gameOver) return false;
    const px = this.player.x, py = this.player.y - 80;

    // 遁 / 受击保护
    if (this.invulnTimer > 0) return false;

    // 御：出手瞬间架住 → 防反；架势中 → 格挡减伤
    let guarded = false;
    if (this.guardTimer > 0) {
      if (this.guardElapsed <= PARRY_WINDOW) {
        this.parry(entity);
        return false;
      }
      guarded = true;
      mult *= GUARD_BLOCK_MULT;
    }

    const res = resolveCombat(entity.combatant, this.pc, mult);

    if (res.dodged) {
      this.fx.floatText(px, py, '闪', '#9fd8ff', 30);
      sfx.dodge();
      const runze = this.skillLevel(AttributeSkillId.RUNZE);
      if (runze) this.healPlayer(Math.max(1, Math.round(this.pc.maxHp * getSkillValue(AttributeSkillId.RUNZE, runze) / 100)));
      return false;
    }

    this.pc.hp = Math.max(0, this.pc.hp - res.damage);
    // 被克：红色大字 + 强震；妖异之气被防具所化（泄）：几乎无伤
    const ke = res.relation === 'ke';
    const weak = res.relation === 'sheng' || res.relation === 'beike';
    if (guarded) {
      sfx.block();
      this.fx.ring(this.player.x, this.player.y, 110, 0xc9d1d9, 220, 0.6);
    }
    // 「御」的格挡只靠音效提示；磐石（被动格挡）仍标「挡」
    const label = (res.blocked ? '挡 ' : ke ? '被克 ' : res.relation === 'sheng' ? '化 ' : '') + `-${res.damage}`;
    this.fx.floatText(px, py, label, ke ? '#ff3b3b' : weak ? '#c9d1d9' : '#ff7a7a', ke ? 42 : weak ? 24 : 30, ke ? 96 : 70);
    if (!guarded) sfx.playerHurt(ke);
    this.player.setTint(0xff6a6a);
    this.hurtFlashTimer = 140;
    this.fx.burst(this.player.x, this.player.y - 20, 0xff5a5a, ke ? 18 : 8);
    this.fx.shake(ke ? 0.016 : weak ? 0.003 : 0.007, ke ? 200 : 130);
    if (ke) this.fx.ring(this.player.x, this.player.y, 150, 0xff3b3b, 320);
    this.invulnTimer = 140;
    if (slowMs > 0) this.playerSlowTimer = slowMs;

    // 受击被动
    addXushiStack(this.pc);
    if (!entity.dying) {
      const yujin = this.skillLevel(AttributeSkillId.YUJIN);
      if (yujin && Math.random() * 100 < getSkillValue(AttributeSkillId.YUJIN, yujin)) this.applyBurn(entity);
      const fanzhen = this.skillLevel(AttributeSkillId.FANZHEN);
      if (fanzhen) {
        const reflect = Math.max(1, Math.round(res.damage * getSkillValue(AttributeSkillId.FANZHEN, fanzhen) / 100));
        entity.combatant.hp = Math.max(0, entity.combatant.hp - reflect);
        this.spawnSystem.updateHpBar(entity);
        this.fx.floatText(entity.sprite.x, entity.sprite.y - 60, `震 ${reflect}`, '#e3b23c', 22);
        if (entity.combatant.hp <= 0) this.killEnemy(entity);
      }
    }

    // 逢春：致命保护
    if (this.pc.hp <= 0 && this.pc.skillEffectLevels) {
      const saved = checkFengchun(this.pc, this.pc.skillEffectLevels);
      if (saved.protected) {
        this.fx.floatText(this.player.x, this.player.y - 130, '逢春', '#4ade80', 40, 70, 1000);
        this.fx.ring(this.player.x, this.player.y, 200, 0x4ade80, 500);
        this.invulnTimer = 1200;
      }
    }

    this.emitHp();
    if (this.pc.hp <= 0) this.triggerGameOver();
    return true;
  }

  /**
   * 防反：完全化解这一击，震退并使对方露出破绽，随即还以一记重击。
   * 近身的直接反击；远处放弹道的则打回一发气劲。
   */
  private parry(entity: WorldEntity): void {
    const p = this.player;
    const color = this.pc.defenseWuxing ? WX_TINT[this.pc.defenseWuxing.wuxing] : SPIRIT_TINT;
    // 防反只用音效与闪光提示，不飘字
    sfx.parry();
    this.fx.ring(p.x, p.y, 190, 0xffe9a8, 360, 0.3);
    this.fx.ring(p.x, p.y, 120, color, 260, 0.3);
    this.fx.burst(p.x, p.y - 10, 0xffe9a8, 26);
    this.fx.shake(0.01, 140);
    this.scene.cameras.main.flash(90, 255, 240, 200, false);

    this.invulnTimer = 450;
    this.guardTimer = 0;
    this.guardCd = 0;        // 防反成功：冷却直接恢复
    this.attackTimer = Math.min(this.attackTimer, 250);

    if (entity.dying) return;
    const dx = entity.sprite.x - p.x, dy = entity.sprite.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const angle = Math.atan2(dy, dx);
    // 露出破绽
    entity.stunTimer = entity.tier === 'boss' ? 800 : PARRY_STAGGER;
    if (entity.tier !== 'boss') {
      entity.knockX = (dx / dist) * 380;
      entity.knockY = (dy / dist) * 380;
      entity.knockTimer = 170;
    }
    if (dist < 420) {
      this.fx.slash(p.x + Math.cos(angle) * 60, p.y + Math.sin(angle) * 60, angle, 260, 0xffe9a8);
      this.hitEnemy(entity, PARRY_COUNTER_MULT / STAGGER_BONUS, this.attackColor(), angle, false);
    } else {
      this.fireBolt(entity, PARRY_COUNTER_MULT / STAGGER_BONUS, false);
    }
  }

  private triggerGameOver(): void {
    if (this.gameOver) return;
    this.gameOver = true;
    eventBus.emit(GameEvent.PLAYER_DEATH);
    eventBus.emit(GameEvent.GAME_OVER);
  }

  // ───────────────────────── 妖异弹道 ─────────────────────────

  spawnEnemyBolt(entity: WorldEntity, x: number, y: number, dirX: number, dirY: number, speed: number, mult: number = 1): void {
    const tint = WX_TINT[entity.wuxing];
    const img = this.scene.add.image(x, y, 'fx_glow').setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD).setScale(0.36).setDepth(FX_DEPTH - 2);
    const core = this.scene.add.image(x, y, 'fx_dot').setScale(1.3).setDepth(FX_DEPTH - 1);
    sfx.enemyShoot();
    this.enemyBolts.push({ img, core, source: entity, vx: dirX * speed, vy: dirY * speed, life: 2600, mult });
  }

  private updateEnemyBolts(delta: number): void {
    const dt = delta / 1000;
    const px = this.player.x, py = this.player.y;
    for (let i = this.enemyBolts.length - 1; i >= 0; i--) {
      const b = this.enemyBolts[i];
      b.life -= delta;
      b.img.x += b.vx * dt;
      b.img.y += b.vy * dt;
      b.core.setPosition(b.img.x, b.img.y);
      this.fx.trail(b.img.x, b.img.y, WX_TINT[b.source.wuxing], 1);
      let done = b.life <= 0;
      if (!done && Phaser.Math.Distance.Squared(b.img.x, b.img.y, px, py) < 38 * 38) {
        if (this.invulnTimer <= 0) {
          this.enemyStrikePlayer(b.source, b.mult); // 架势内命中会在这里触发格挡 / 防反
          this.fx.burst(b.img.x, b.img.y, WX_TINT[b.source.wuxing], 8);
          done = true;
        }
      }
      if (done) {
        b.img.destroy();
        b.core.destroy();
        this.enemyBolts.splice(i, 1);
      }
    }
  }

  /** 清除所有飞行中的弹道（换轮 / 结束时） */
  clearProjectiles(): void {
    this.bolts.forEach(b => b.img.destroy());
    this.enemyBolts.forEach(b => { b.img.destroy(); b.core.destroy(); });
    this.bolts = [];
    this.enemyBolts = [];
  }

  stop(): void {
    this.gameOver = true;
  }
}
