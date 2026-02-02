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
 * 战斗引擎
 */
export class BattleEngine {
  private combatants: Combatant[];
  private events: BattleEvent[] = [];
  private config: BattleConfig;
  private roundNumber: number = 0;

  constructor(combatants: Combatant[], config: BattleConfig) {
    // 深拷贝，包括状态效果
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
    this.initBattle();
    this.battleStartPhase();
    this.combatPhase();
    return this.buildResult();
  }

  /**
   * 初始化战斗
   */
  private initBattle(): void {
    // 初始化五行被动和装备被动技能
    for (const combatant of this.combatants) {
      initWuxingPassives(combatant);
      applyPassiveSkills(combatant);
    }

    this.events.push({ type: 'battle_start' });
  }

  /**
   * 战斗开始阶段
   */
  private battleStartPhase(): void {
    for (const combatant of this.combatants) {
      const events = processBattleStartSkills(combatant, this.combatants);
      this.events.push(...events);
    }
  }

  /**
   * 战斗主循环
   */
  private combatPhase(): void {
    while (this.roundNumber < MAX_ROUNDS) {
      this.roundNumber++;
      this.events.push({ type: 'round_start', value: this.roundNumber });

      const alive = getAliveCombatants(this.combatants);

      // 检查胜负
      const alivePlayers = alive.filter(c => c.isPlayer);
      const aliveEnemies = alive.filter(c => !c.isPlayer);

      if (alivePlayers.length === 0 || aliveEnemies.length === 0) {
        break;
      }

      // 按速度排序行动
      const turnOrder = sortBySpeed(alive);

      for (const actor of turnOrder) {
        if (actor.hp <= 0) continue;

        // 处理冻结状态
        if (actor.frozen) {
          this.events.push({ type: 'frozen_skip', actorId: actor.id });
          actor.frozen = false;

          // 水Lv5：冻结破碎伤害
          const shatterEvents = processFreezeShatter(actor, null);
          this.events.push(...shatterEvents);

          continue;
        }

        // 重置临时 debuff
        actor.attackDebuff = 0;

        // 处理回合开始的状态效果 (回复、流血、灼烧)
        const turnStartEvents = processStartOfTurnEffects(actor);
        this.events.push(...turnStartEvents);

        // 检查是否因状态伤害死亡
        if (actor.hp <= 0) {
          // 检查复活 (木Lv5)
          const reviveResult = checkRevive(actor);
          if (reviveResult.revived) {
            this.events.push(...reviveResult.events);
          } else {
            this.events.push({ type: 'death', targetId: actor.id });
            continue;
          }
        }

        // 处理被动自损
        const selfDamage = getPassiveSelfDamage(actor);
        if (selfDamage) {
          this.events.push({
            type: 'skill_trigger',
            actorId: actor.id,
            skillName: selfDamage.skillName,
          });
          actor.hp = Math.max(0, actor.hp - selfDamage.damage);
          this.events.push({
            type: 'damage',
            actorId: actor.id,
            targetId: actor.id,
            value: selfDamage.damage,
          });
          if (actor.hp <= 0) {
            // 检查复活
            const reviveResult = checkRevive(actor);
            if (reviveResult.revived) {
              this.events.push(...reviveResult.events);
            } else {
              this.events.push({ type: 'death', targetId: actor.id });
              continue;
            }
          }
        }

        // 选择目标
        const target = this.selectTarget(actor);
        if (!target) continue;

        // 执行攻击
        this.executeAttack(actor, target);

        // 再次检查胜负
        const stillAlive = getAliveCombatants(this.combatants);
        const playersLeft = stillAlive.filter(c => c.isPlayer).length;
        const enemiesLeft = stillAlive.filter(c => !c.isPlayer).length;

        if (playersLeft === 0 || enemiesLeft === 0) {
          break;
        }
      }

      this.events.push({ type: 'round_end', value: this.roundNumber });
    }

    this.events.push({ type: 'battle_end' });
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
  private executeAttack(attacker: Combatant, defender: Combatant): void {
    this.events.push({
      type: 'turn_start',
      actorId: attacker.id,
      targetId: defender.id,
    });

    // 处理防御技能
    const defendResult = processOnDefendSkills(defender, attacker);
    this.events.push(...defendResult.events);

    if (defendResult.dodged) {
      return; // 被闪避
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
    this.events.push(...hitResult.events);

    // 计算最终伤害
    let finalDamage = damageResult.damage;
    if (finalDamage > 0) {
      finalDamage = Math.floor(finalDamage * (hitResult.damageMultiplier ?? 1));
      finalDamage += hitResult.bonusDamage ?? 0;

      // 土Lv5蓄力攻击加成
      const revengeBonus = getRevengeDamageBonus(attacker);
      if (revengeBonus > 0) {
        finalDamage = Math.floor(finalDamage * (1 + revengeBonus / 100));
        this.events.push({
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
      this.events.push(...defenseEffects.events);
      actualDamage = defenseEffects.modifiedDamage;

      // 应用伤害
      defender.hp = Math.max(0, defender.hp - actualDamage);
      this.events.push({
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
        this.events.push({
          type: 'reflect_damage',
          actorId: defender.id,
          targetId: attacker.id,
          value: defenseEffects.reflectDamage,
        });

        // 检查攻击者是否因反弹死亡
        if (attacker.hp <= 0) {
          const reviveResult = checkRevive(attacker);
          if (reviveResult.revived) {
            this.events.push(...reviveResult.events);
          } else {
            this.events.push({ type: 'death', targetId: attacker.id });
          }
        }
      }

      // 应用攻击五行效果 (流血、灼烧、减速、冻结)
      const attackEffects = applyAttackWuxingEffects(attacker, defender, actualDamage);
      this.events.push(...attackEffects.events);

      // 五行效果的额外伤害
      if (attackEffects.bonusDamage > 0) {
        defender.hp = Math.max(0, defender.hp - attackEffects.bonusDamage);
        this.events.push({
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
      this.events.push({
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
      this.events.push({
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
        this.events.push(...protection.events);
      } else {
        // 检查复活
        const reviveResult = checkRevive(defender);
        if (reviveResult.revived) {
          this.events.push(...reviveResult.events);
        } else {
          this.events.push({ type: 'death', targetId: defender.id });
        }
      }
    }
  }

  /**
   * 构建战斗结果
   */
  private buildResult(): EngineBattleResult {
    const alive = getAliveCombatants(this.combatants);
    const alivePlayers = alive.filter(c => c.isPlayer);

    let winnerId: string | null = null;
    if (alivePlayers.length > 0) {
      winnerId = alivePlayers[0].id;
    }

    return {
      winnerId,
      events: this.events,
      survivingCombatants: alive,
    };
  }
}
