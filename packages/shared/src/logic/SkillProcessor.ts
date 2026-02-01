import { Skill, SkillTrigger } from '../types/Equipment.js';
import { Combatant, BattleEvent } from './BattleTypes.js';

/**
 * 技能处理结果
 */
export interface SkillResult {
  triggered: boolean;
  events: BattleEvent[];
  damageMultiplier?: number;
  bonusDamage?: number;
  healAmount?: number;
  dodged?: boolean;
  frozen?: boolean;
  attackDebuff?: number;
}

/**
 * 处理被动技能（在战斗初始化时应用）
 */
export function applyPassiveSkills(combatant: Combatant): void {
  for (const skill of combatant.skills) {
    if (skill.trigger !== SkillTrigger.PASSIVE) continue;

    if (skill.attackBonus) {
      combatant.attack += skill.attackBonus;
    }
    if (skill.defenseBonus) {
      combatant.defense += skill.defenseBonus;
    }
    // 五行等级加成在初始化时已经处理
  }
}

/**
 * 处理战斗开始技能
 */
export function processBattleStartSkills(
  combatant: Combatant,
  allCombatants: Combatant[]
): BattleEvent[] {
  const events: BattleEvent[] = [];

  for (const skill of combatant.skills) {
    if (skill.trigger !== SkillTrigger.BATTLE_START) continue;

    events.push({
      type: 'skill_trigger',
      actorId: combatant.id,
      skillName: skill.name,
    });

    // 回复效果
    if (skill.heal && skill.heal > 0) {
      const healAmount = Math.min(skill.heal, combatant.maxHp - combatant.hp);
      combatant.hp += healAmount;
      events.push({
        type: 'heal',
        actorId: combatant.id,
        targetId: combatant.id,
        value: healAmount,
      });
    }

    // 对敌方造成伤害
    if (skill.damage && skill.damage > 0) {
      const enemies = allCombatants.filter(c => c.isPlayer !== combatant.isPlayer && c.hp > 0);
      for (const enemy of enemies) {
        enemy.hp = Math.max(0, enemy.hp - skill.damage);
        events.push({
          type: 'damage',
          actorId: combatant.id,
          targetId: enemy.id,
          value: skill.damage,
        });
        if (enemy.hp <= 0) {
          events.push({ type: 'death', targetId: enemy.id });
        }
      }
    }
  }

  return events;
}

/**
 * 处理攻击时技能（ON_HIT）
 */
export function processOnHitSkills(
  attacker: Combatant,
  defender: Combatant,
  baseDamage: number
): SkillResult {
  const result: SkillResult = {
    triggered: false,
    events: [],
    damageMultiplier: 1,
    bonusDamage: 0,
  };

  for (const skill of attacker.skills) {
    if (skill.trigger !== SkillTrigger.ON_HIT) continue;

    const chance = skill.triggerChance ?? 1;
    if (Math.random() >= chance) continue;

    result.triggered = true;
    result.events.push({
      type: 'skill_trigger',
      actorId: attacker.id,
      skillName: skill.name,
    });

    // 双倍伤害
    if (skill.damageMultiplier && skill.damageMultiplier > 1) {
      result.damageMultiplier = skill.damageMultiplier;
    }

    // 额外伤害
    if (skill.damage) {
      result.bonusDamage = (result.bonusDamage ?? 0) + skill.damage;
    }

    // 吸血
    if (skill.heal) {
      result.healAmount = (result.healAmount ?? 0) + skill.heal;
    }
  }

  return result;
}

/**
 * 处理防御时技能（ON_DEFEND）
 */
export function processOnDefendSkills(
  defender: Combatant,
  attacker: Combatant
): SkillResult {
  const result: SkillResult = {
    triggered: false,
    events: [],
  };

  for (const skill of defender.skills) {
    if (skill.trigger !== SkillTrigger.ON_DEFEND) continue;

    const chance = skill.triggerChance ?? 1;
    if (Math.random() >= chance) continue;

    result.triggered = true;
    result.events.push({
      type: 'skill_trigger',
      actorId: defender.id,
      skillName: skill.name,
    });

    // 闪避
    if (skill.dodge) {
      result.dodged = true;
      result.events.push({
        type: 'miss',
        actorId: attacker.id,
        targetId: defender.id,
      });
      return result; // 闪避后不再处理其他技能
    }

    // 缴械（降低攻击力）
    if (skill.attackBonus && skill.attackBonus < 0) {
      result.attackDebuff = Math.abs(skill.attackBonus);
    }

    // 冻结（通过 skill id 判断）
    if (skill.id === 'skill_xuanbing') {
      result.frozen = true;
    }
  }

  return result;
}

/**
 * 获取无视防御值
 */
export function getIgnoreDefense(combatant: Combatant): number {
  let ignoreDefense = 0;
  for (const skill of combatant.skills) {
    if (skill.trigger === SkillTrigger.PASSIVE && skill.ignoreDefense) {
      ignoreDefense += skill.ignoreDefense;
    }
  }
  return ignoreDefense;
}

/**
 * 获取被动自损值
 */
export function getPassiveSelfDamage(combatant: Combatant): { damage: number; skillName: string } | null {
  for (const skill of combatant.skills) {
    if (skill.trigger === SkillTrigger.PASSIVE && skill.selfDamage) {
      return { damage: skill.selfDamage, skillName: skill.name };
    }
  }
  return null;
}
