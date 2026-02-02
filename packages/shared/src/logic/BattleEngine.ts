import { Combatant, BattleConfig, BattleEvent, EngineBattleResult } from './BattleTypes.js';
import { calculateFinalDamage } from './DamageCalculator.js';
import { sortBySpeed, getAliveCombatants } from './SpeedResolver.js';
import {
  applyPassiveSkills,
  processBattleStartSkills,
  processOnHitSkills,
  processOnDefendSkills,
  getIgnoreDefense,
  getPassiveSelfDamage,
} from './SkillProcessor.js';
import {
  initWuxingPassives,
  processStartOfTurnEffects,
  applyAttackWuxingEffects,
  applyDefenseWuxingEffects,
  checkLethalProtection,
  checkRevive,
  processFreezeShatter,
  getRevengeDamageBonus,
  resetRevengeStacks,
} from './WuxingPassiveProcessor.js';

const MAX_ROUNDS = 50;

/**
 * 单回合结果
 */
export interface RoundResult {
  roundNumber: number;
  events: BattleEvent[];
  isOver: boolean;
  winnerId: string | null;
}

/**
 * 战斗引擎 - 支持逐回合计算
 */
export class BattleEngine {
  private combatants: Combatant[];
  private config: BattleConfig;
  private roundNumber: number = 0;
  private initialized: boolean = false;

  constructor(combatants: Combatant[], config: BattleConfig) {
    // 深拷贝，包括状态效果
    this.combatants = combatants.map(c => ({
      ...c,
      statusEffects: { ...c.statusEffects },
    }));
    this.config = config;
  }

  /**
   * 执行完整战斗 (一次性计算所有回合)
   */
  run(): EngineBattleResult {
    const initEvents = this.initialize();
    const allEvents: BattleEvent[] = [...initEvents];

    while (!this.isBattleOver() && this.roundNumber < MAX_ROUNDS) {
      const roundResult = this.runSingleRound();
      allEvents.push(...roundResult.events);
      if (roundResult.isOver) break;
    }

    allEvents.push({ type: 'battle_end' });

    return {
      winnerId: this.getWinnerId(),
      events: allEvents,
      survivingCombatants: getAliveCombatants(this.combatants),
    };
  }

  /**
   * 初始化战斗 (返回初始化事件)
   */
  initialize(): BattleEvent[] {
    if (this.initialized) return [];

    const events: BattleEvent[] = [];

    // 初始化五行被动和装备被动技能
    for (const combatant of this.combatants) {
      initWuxingPassives(combatant);
      applyPassiveSkills(combatant);
    }

    events.push({ type: 'battle_start' });

    // 战斗开始阶段技能
    for (const combatant of this.combatants) {
      const skillEvents = processBattleStartSkills(combatant, this.combatants);
      events.push(...skillEvents);
    }

    this.initialized = true;
    return events;
  }

  /**
   * 计算单个回合 (用于逐回合模式)
   */
  runSingleRound(): RoundResult {
    const events: BattleEvent[] = [];

    if (!this.initialized) {
      events.push(...this.initialize());
    }

    // 检查战斗是否已结束
    if (this.isBattleOver()) {
      return {
        roundNumber: this.roundNumber,
        events,
        isOver: true,
        winnerId: this.getWinnerId(),
      };
    }

    this.roundNumber++;
    events.push({ type: 'round_start', value: this.roundNumber });

    const alive = getAliveCombatants(this.combatants);
    const turnOrder = sortBySpeed(alive);

    for (const actor of turnOrder) {
      if (actor.hp <= 0) continue;

      const turnEvents = this.processTurn(actor);
      events.push(...turnEvents);

      // 检查战斗是否结束
      if (this.isBattleOver()) {
        break;
      }
    }

    events.push({ type: 'round_end', value: this.roundNumber });

    return {
      roundNumber: this.roundNumber,
      events,
      isOver: this.isBattleOver(),
      winnerId: this.getWinnerId(),
    };
  }

  /**
   * 更新玩家战斗者数据 (换装后调用)
   */
  updatePlayerCombatant(newPlayerData: Partial<Combatant>): void {
    const playerIndex = this.combatants.findIndex(c => c.isPlayer);
    if (playerIndex >= 0) {
      const player = this.combatants[playerIndex];
      // 保留当前HP和状态效果，更新装备相关属性
      this.combatants[playerIndex] = {
        ...player,
        ...newPlayerData,
        hp: player.hp, // 保留当前HP
        statusEffects: player.statusEffects, // 保留状态效果
      };
      // 重新初始化五行被动
      initWuxingPassives(this.combatants[playerIndex]);
    }
  }

  /**
   * 检查战斗是否结束
   */
  isBattleOver(): boolean {
    const alive = getAliveCombatants(this.combatants);
    const alivePlayers = alive.filter(c => c.isPlayer);
    const aliveEnemies = alive.filter(c => !c.isPlayer);
    return alivePlayers.length === 0 || aliveEnemies.length === 0;
  }

  /**
   * 获取胜利者ID
   */
  getWinnerId(): string | null {
    const alive = getAliveCombatants(this.combatants);
    const alivePlayers = alive.filter(c => c.isPlayer);
    return alivePlayers.length > 0 ? alivePlayers[0].id : null;
  }

  /**
   * 获取当前回合数
   */
  getRoundNumber(): number {
    return this.roundNumber;
  }

  /**
   * 获取所有战斗者 (用于同步显示)
   */
  getCombatants(): Combatant[] {
    return this.combatants;
  }

  /**
   * 处理单个战斗者的回合
   */
  private processTurn(actor: Combatant): BattleEvent[] {
    const events: BattleEvent[] = [];

    // 处理冻结状态
    if (actor.frozen) {
      events.push({ type: 'frozen_skip', actorId: actor.id });
      actor.frozen = false;

      // 水Lv5：冻结破碎伤害
      const shatterEvents = processFreezeShatter(actor, null);
      events.push(...shatterEvents);

      return events;
    }

    // 重置临时 debuff
    actor.attackDebuff = 0;

    // 处理回合开始的状态效果 (回复、流血、灼烧)
    const turnStartEvents = processStartOfTurnEffects(actor);
    events.push(...turnStartEvents);

    // 检查是否因状态伤害死亡
    if (actor.hp <= 0) {
      const reviveResult = checkRevive(actor);
      if (reviveResult.revived) {
        events.push(...reviveResult.events);
      } else {
        events.push({ type: 'death', targetId: actor.id });
        return events;
      }
    }

    // 处理被动自损
    const selfDamage = getPassiveSelfDamage(actor);
    if (selfDamage) {
      events.push({
        type: 'skill_trigger',
        actorId: actor.id,
        skillName: selfDamage.skillName,
      });
      actor.hp = Math.max(0, actor.hp - selfDamage.damage);
      events.push({
        type: 'damage',
        actorId: actor.id,
        targetId: actor.id,
        value: selfDamage.damage,
      });
      if (actor.hp <= 0) {
        const reviveResult = checkRevive(actor);
        if (reviveResult.revived) {
          events.push(...reviveResult.events);
        } else {
          events.push({ type: 'death', targetId: actor.id });
          return events;
        }
      }
    }

    // 选择目标
    const target = this.selectTarget(actor);
    if (!target) return events;

    // 执行攻击
    const attackEvents = this.executeAttack(actor, target);
    events.push(...attackEvents);

    return events;
  }

  /**
   * 选择攻击目标
   */
  private selectTarget(actor: Combatant): Combatant | null {
    const enemies = this.combatants.filter(
      c => c.isPlayer !== actor.isPlayer && c.hp > 0
    );
    if (enemies.length === 0) return null;
    return enemies[Math.floor(Math.random() * enemies.length)];
  }

  /**
   * 执行攻击
   */
  private executeAttack(attacker: Combatant, defender: Combatant): BattleEvent[] {
    const events: BattleEvent[] = [];

    events.push({
      type: 'turn_start',
      actorId: attacker.id,
      targetId: defender.id,
    });

    // 处理防御技能
    const defendResult = processOnDefendSkills(defender, attacker);
    events.push(...defendResult.events);

    if (defendResult.dodged) {
      return events; // 被闪避
    }

    if (defendResult.attackDebuff) {
      attacker.attackDebuff += defendResult.attackDebuff;
    }

    // 检查冻结：土属性高血量时免疫控制
    if (defendResult.frozen) {
      const isImmune = (defender.controlImmune ?? false) && defender.hp > defender.maxHp * 0.7;
      if (!isImmune) {
        attacker.frozen = true;
      }
    }

    // 计算伤害 - 包含金属性破防
    const skillIgnoreDefense = getIgnoreDefense(attacker);
    const wuxingIgnoreDefense = Math.floor(defender.defense * (attacker.ignoreDefensePercent ?? 0) / 100);
    const totalIgnoreDefense = skillIgnoreDefense + wuxingIgnoreDefense;
    const damageResult = calculateFinalDamage(attacker, defender, totalIgnoreDefense);

    // 处理攻击技能
    const hitResult = processOnHitSkills(attacker, defender, damageResult.damage);
    events.push(...hitResult.events);

    // 计算最终伤害
    let finalDamage = damageResult.damage;
    if (finalDamage > 0) {
      finalDamage = Math.floor(finalDamage * (hitResult.damageMultiplier ?? 1));
      finalDamage += hitResult.bonusDamage ?? 0;

      // 土Lv5蓄力攻击加成
      const revengeBonus = getRevengeDamageBonus(attacker);
      if (revengeBonus > 0) {
        finalDamage = Math.floor(finalDamage * (1 + revengeBonus / 100));
        events.push({
          type: 'skill_trigger',
          actorId: attacker.id,
          skillName: '蓄力攻击',
        });
        resetRevengeStacks(attacker);
      }
    }

    // 应用伤害或治疗
    if (finalDamage >= 0) {
      // 最低伤害为1（除非是相生治疗情况）
      let actualDamage = Math.max(1, finalDamage);

      // 土属性减伤和反弹
      const defenseEffects = applyDefenseWuxingEffects(attacker, defender, actualDamage);
      events.push(...defenseEffects.events);
      actualDamage = defenseEffects.modifiedDamage;

      // 应用伤害
      defender.hp = Math.max(0, defender.hp - actualDamage);
      events.push({
        type: 'damage',
        actorId: attacker.id,
        targetId: defender.id,
        value: actualDamage,
        wuxingEffect: damageResult.wuxingEffect,
        isCritical: (hitResult.damageMultiplier ?? 1) > 1,
      });

      // 处理反弹伤害
      if (defenseEffects.reflectDamage > 0) {
        attacker.hp = Math.max(0, attacker.hp - defenseEffects.reflectDamage);
        events.push({
          type: 'reflect_damage',
          actorId: defender.id,
          targetId: attacker.id,
          value: defenseEffects.reflectDamage,
        });

        // 检查攻击者是否因反弹死亡
        if (attacker.hp <= 0) {
          const reviveResult = checkRevive(attacker);
          if (reviveResult.revived) {
            events.push(...reviveResult.events);
          } else {
            events.push({ type: 'death', targetId: attacker.id });
          }
        }
      }

      // 应用攻击五行效果 (流血、灼烧、减速、冻结)
      const attackEffects = applyAttackWuxingEffects(attacker, defender, actualDamage);
      events.push(...attackEffects.events);

      // 五行效果的额外伤害
      if (attackEffects.bonusDamage > 0) {
        defender.hp = Math.max(0, defender.hp - attackEffects.bonusDamage);
        events.push({
          type: 'damage',
          actorId: attacker.id,
          targetId: defender.id,
          value: attackEffects.bonusDamage,
          message: '五行加成',
        });
      }
    } else {
      // 相生：治疗敌人
      const healAmount = Math.min(-finalDamage, defender.maxHp - defender.hp);
      defender.hp += healAmount;
      events.push({
        type: 'heal',
        actorId: attacker.id,
        targetId: defender.id,
        value: healAmount,
        wuxingEffect: damageResult.wuxingEffect,
      });
    }

    // 处理吸血
    if (hitResult.healAmount && hitResult.healAmount > 0) {
      const healAmount = Math.min(hitResult.healAmount, attacker.maxHp - attacker.hp);
      attacker.hp += healAmount;
      events.push({
        type: 'heal',
        actorId: attacker.id,
        targetId: attacker.id,
        value: healAmount,
      });
    }

    // 检查防御者死亡
    if (defender.hp <= 0) {
      // 木Lv3+：致命保护
      const protection = checkLethalProtection(defender);
      if (protection.protected) {
        events.push(...protection.events);
      } else {
        // 检查复活
        const reviveResult = checkRevive(defender);
        if (reviveResult.revived) {
          events.push(...reviveResult.events);
        } else {
          events.push({ type: 'death', targetId: defender.id });
        }
      }
    }

    return events;
  }
}
