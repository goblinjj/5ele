import { Combatant, BattleConfig, BattleEvent, EngineBattleResult } from './BattleTypes.js';
import { calculateFinalDamage } from './DamageCalculator.js';
import { sortBySpeed, getAliveCombatants } from './SpeedResolver.js';
import {
  initCombatantSkills,
  processStartOfTurnEffects,
  applyBurning,
  applySlow,
  isSlowed,
  isBurning,
} from './WuxingPassiveProcessor.js';
import {
  calculateAttackSkills,
  calculateDefendSkills,
  processAfterAttackSkills,
  processAfterDefendSkills,
  checkFengchun,
  getXushiBonus,
  resetXushiStacks,
  addXushiStack,
} from './AttributeSkillProcessor.js';

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
    this.combatants = combatants.map(c => ({
      ...c,
      statusEffects: { ...c.statusEffects },
    }));
    this.config = config;
  }

  /**
   * 执行完整战斗
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
   * 初始化战斗
   */
  initialize(): BattleEvent[] {
    if (this.initialized) return [];

    const events: BattleEvent[] = [];

    // 初始化每个战斗者的技能效果
    for (const combatant of this.combatants) {
      initCombatantSkills(combatant);
    }

    events.push({ type: 'battle_start' });

    this.initialized = true;
    return events;
  }

  /**
   * 计算单个回合
   */
  runSingleRound(): RoundResult {
    const events: BattleEvent[] = [];

    if (!this.initialized) {
      events.push(...this.initialize());
    }

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
   * 更新玩家战斗者数据
   */
  updatePlayerCombatant(newPlayerData: Partial<Combatant>): void {
    const playerIndex = this.combatants.findIndex(c => c.isPlayer);
    if (playerIndex >= 0) {
      const player = this.combatants[playerIndex];
      this.combatants[playerIndex] = {
        ...player,
        ...newPlayerData,
        hp: player.hp,
        statusEffects: player.statusEffects,
      };
      initCombatantSkills(this.combatants[playerIndex]);
    }
  }

  isBattleOver(): boolean {
    const alive = getAliveCombatants(this.combatants);
    const alivePlayers = alive.filter(c => c.isPlayer);
    const aliveEnemies = alive.filter(c => !c.isPlayer);
    return alivePlayers.length === 0 || aliveEnemies.length === 0;
  }

  getWinnerId(): string | null {
    const alive = getAliveCombatants(this.combatants);
    const alivePlayers = alive.filter(c => c.isPlayer);
    return alivePlayers.length > 0 ? alivePlayers[0].id : null;
  }

  getRoundNumber(): number {
    return this.roundNumber;
  }

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
      return events;
    }

    // 处理回合开始的状态效果
    const turnStartEvents = processStartOfTurnEffects(actor);
    events.push(...turnStartEvents);

    // 检查是否因状态伤害死亡
    if (actor.hp <= 0) {
      if (this.tryFengchun(actor, events)) {
        // 逢春触发，继续
      } else {
        events.push({ type: 'death', targetId: actor.id });
        return events;
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

    // 获取攻击者和防御者的技能效果
    const attackerSkills = attacker.skillEffectLevels;
    const defenderSkills = defender.skillEffectLevels;

    // 计算防御技能
    const defendSkillResult = defenderSkills
      ? calculateDefendSkills(defender, defenderSkills)
      : { dodgeRate: 0, blockRate: 0, damageReduction: 0, lowHpReduction: 0 };

    // 计算攻击技能
    const attackSkillResult = attackerSkills
      ? calculateAttackSkills(attacker, defender, attackerSkills)
      : { critRate: 0, critDamage: 0, ignoreDefense: 0, executeDamage: 0, hitRate: 0, slowedBonus: 0, burningBonus: 0, rageBonus: 0, lowHpAttackBonus: 0 };

    // 闪避判定（灵动）
    const finalDodgeRate = Math.max(0, defendSkillResult.dodgeRate - attackSkillResult.hitRate);
    if (Math.random() * 100 < finalDodgeRate) {
      events.push({ type: 'miss', actorId: attacker.id, targetId: defender.id });

      // 润泽：闪避成功时回血
      if (defenderSkills) {
        const afterDefend = processAfterDefendSkills(attacker, defender, defenderSkills, 0, true);
        if (afterDefend.healAmount > 0) {
          const actualHeal = Math.min(afterDefend.healAmount, defender.maxHp - defender.hp);
          defender.hp += actualHeal;
          events.push(...afterDefend.events);
        }
      }
      return events;
    }

    // 格挡判定（磐石）
    let blocked = false;
    if (Math.random() * 100 < defendSkillResult.blockRate) {
      blocked = true;
      events.push({ type: 'block', actorId: attacker.id, targetId: defender.id });
    }

    // 暴击判定（锐度）
    let isCrit = false;
    if (Math.random() * 100 < attackSkillResult.critRate) {
      isCrit = true;
      events.push({ type: 'critical', actorId: attacker.id, targetId: defender.id });
    }

    // 计算基础伤害
    const ignoreDefense = Math.floor(defender.defense * attackSkillResult.ignoreDefense / 100);
    const damageResult = calculateFinalDamage(attacker, defender, ignoreDefense);

    let finalDamage = damageResult.damage;

    // 暴击伤害（锋芒）
    if (isCrit) {
      const critMultiplier = 1.5 + attackSkillResult.critDamage / 100;
      finalDamage = Math.floor(finalDamage * critMultiplier);
    }

    // 攻击力加成（炎威、怒木、焚意）
    const attackBonus = attackSkillResult.rageBonus + attackSkillResult.lowHpAttackBonus;
    if (attackBonus > 0) {
      finalDamage = Math.floor(finalDamage * (1 + attackBonus / 100));
    }

    // 对减速目标加伤（玄冰）
    if (attackSkillResult.slowedBonus > 0) {
      finalDamage = Math.floor(finalDamage * (1 + attackSkillResult.slowedBonus / 100));
    }

    // 对灼烧目标加伤（暴燃）
    if (attackSkillResult.burningBonus > 0) {
      finalDamage = Math.floor(finalDamage * (1 + attackSkillResult.burningBonus / 100));
    }

    // 斩杀加伤（杀意）
    finalDamage += attackSkillResult.executeDamage;

    // 蓄势加伤（土属性）
    if (attackerSkills) {
      const xushiBonus = getXushiBonus(attacker, attackerSkills);
      if (xushiBonus > 0) {
        finalDamage = Math.floor(finalDamage * (1 + xushiBonus / 100));
        resetXushiStacks(attacker);
      }
    }

    // 格挡减伤（磐石）
    if (blocked) {
      finalDamage = Math.floor(finalDamage * 0.5);
    }

    // 固定减伤（厚土）
    if (defendSkillResult.damageReduction > 0) {
      finalDamage = Math.floor(finalDamage * (1 - defendSkillResult.damageReduction / 100));
    }

    // 低血量减伤（韧性）
    if (defendSkillResult.lowHpReduction > 0) {
      finalDamage = Math.floor(finalDamage * (1 - defendSkillResult.lowHpReduction / 100));
    }

    // 最低伤害1
    finalDamage = Math.max(1, finalDamage);

    // 应用伤害
    defender.hp = Math.max(0, defender.hp - finalDamage);
    events.push({
      type: 'damage',
      actorId: attacker.id,
      targetId: defender.id,
      value: finalDamage,
      wuxingEffect: damageResult.wuxingEffect,
      isCritical: isCrit,
    });

    // 攻击后效果（寒锋、凝滞、燎原）
    if (attackerSkills) {
      const afterAttack = processAfterAttackSkills(attacker, defender, attackerSkills, isCrit);
      events.push(...afterAttack.events);

      if (afterAttack.applySlow) {
        applySlow(defender, 1);
      }
      if (afterAttack.applyBurning) {
        applyBurning(defender, 1);
      }
    }

    // 防御后效果（反震、余烬、蓄势）
    if (defenderSkills) {
      const afterDefend = processAfterDefendSkills(attacker, defender, defenderSkills, finalDamage, false);
      events.push(...afterDefend.events);

      // 反震伤害
      if (afterDefend.reflectDamage > 0) {
        attacker.hp = Math.max(0, attacker.hp - afterDefend.reflectDamage);
        events.push({
          type: 'reflect_damage',
          actorId: defender.id,
          targetId: attacker.id,
          value: afterDefend.reflectDamage,
        });

        if (attacker.hp <= 0) {
          if (!this.tryFengchun(attacker, events)) {
            events.push({ type: 'death', targetId: attacker.id });
          }
        }
      }

      // 余烬灼烧攻击者
      if (afterDefend.applyBurning) {
        applyBurning(attacker, 1);
      }

      // 蓄势叠层
      if (afterDefend.addXushiStack) {
        addXushiStack(defender);
      }
    }

    // 检查防御者死亡
    if (defender.hp <= 0) {
      if (!this.tryFengchun(defender, events)) {
        events.push({ type: 'death', targetId: defender.id });
      }
    }

    return events;
  }

  /**
   * 尝试触发逢春
   */
  private tryFengchun(combatant: Combatant, events: BattleEvent[]): boolean {
    if (!combatant.skillEffectLevels) return false;

    const result = checkFengchun(combatant, combatant.skillEffectLevels);
    if (result.protected) {
      events.push(...result.events);
      return true;
    }
    return false;
  }
}
