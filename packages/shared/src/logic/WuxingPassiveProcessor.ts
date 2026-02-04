import { Combatant, BattleEvent } from './BattleTypes.js';
import {
  calculateSkillEffectLevels,
  applyBattleInitSkills,
  processTurnStartSkills,
} from './AttributeSkillProcessor.js';

/**
 * 初始化战斗者的属性技能效果
 */
export function initCombatantSkills(combatant: Combatant): void {
  // 初始化状态效果
  combatant.statusEffects = combatant.statusEffects || {};
  combatant.xushiStacks = 0;

  // 如果有属性技能，计算生效等级
  if (combatant.attributeSkills && combatant.allWuxingLevels) {
    combatant.skillEffectLevels = calculateSkillEffectLevels(
      combatant.attributeSkills,
      combatant.allWuxingLevels
    );

    // 应用战斗初始化技能（根基、炎威、坚壁等）
    applyBattleInitSkills(combatant, combatant.skillEffectLevels);
  }
}

/**
 * 回合开始时处理状态效果
 */
export function processStartOfTurnEffects(combatant: Combatant): BattleEvent[] {
  const events: BattleEvent[] = [];

  // 确保 statusEffects 存在
  if (!combatant.statusEffects) {
    combatant.statusEffects = {};
  }
  const effects = combatant.statusEffects;

  // 重置每回合一次的致命保护
  effects.hasSurvivedLethal = false;

  // 五行圆满：每回合恢复5%最大生命值（最少1点）
  if (combatant.hasWuxingMastery && combatant.hp < combatant.maxHp) {
    const masteryHeal = Math.max(1, Math.floor(combatant.maxHp * 0.05));
    const actualHeal = Math.min(masteryHeal, combatant.maxHp - combatant.hp);
    combatant.hp += actualHeal;
    events.push({
      type: 'status_heal',
      targetId: combatant.id,
      value: actualHeal,
      message: '五行圆满',
    });
  }

  // 属性技能：回合开始效果（生机等）
  if (combatant.skillEffectLevels) {
    const skillEvents = processTurnStartSkills(combatant, combatant.skillEffectLevels);
    events.push(...skillEvents);
  }

  // 灼烧伤害
  if (effects.burning && effects.burning.stacks > 0 && effects.burning.turnsLeft > 0) {
    const burnDamage = Math.max(1, Math.floor(combatant.maxHp * effects.burning.damagePercent * effects.burning.stacks / 100));
    combatant.hp = Math.max(0, combatant.hp - burnDamage);
    events.push({
      type: 'status_damage',
      targetId: combatant.id,
      value: burnDamage,
      statusType: 'burning',
      stacks: effects.burning.stacks,
      message: '灼烧',
    });

    // 减少灼烧持续时间
    effects.burning.turnsLeft--;
    if (effects.burning.turnsLeft <= 0) {
      effects.burning = undefined;
    }
  }

  // 减速持续时间
  if (effects.slowed && effects.slowed.turnsLeft > 0) {
    effects.slowed.turnsLeft--;
    if (effects.slowed.turnsLeft <= 0) {
      effects.slowed = undefined;
    }
  }

  return events;
}

/**
 * 施加灼烧状态
 */
export function applyBurning(target: Combatant, stacks: number = 1): void {
  if (!target.statusEffects) target.statusEffects = {};

  if (!target.statusEffects.burning) {
    target.statusEffects.burning = {
      stacks: stacks,
      damagePercent: 3, // 每层3%最大生命值
      turnsLeft: 2,
    };
  } else {
    target.statusEffects.burning.stacks = Math.min(3, target.statusEffects.burning.stacks + stacks);
    target.statusEffects.burning.turnsLeft = 2;
  }
}

/**
 * 施加减速状态
 */
export function applySlow(target: Combatant, turns: number = 1): void {
  if (!target.statusEffects) target.statusEffects = {};

  target.statusEffects.slowed = {
    turnsLeft: turns,
  };
}

/**
 * 检查目标是否被减速
 */
export function isSlowed(target: Combatant): boolean {
  return !!(target.statusEffects?.slowed && target.statusEffects.slowed.turnsLeft > 0);
}

/**
 * 检查目标是否被灼烧
 */
export function isBurning(target: Combatant): boolean {
  return !!(target.statusEffects?.burning && target.statusEffects.burning.stacks > 0);
}
