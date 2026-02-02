import { WuxingLevel, getWuxingRelation, WUXING_CONQUER_BONUS } from '../types/Wuxing.js';
import { Combatant } from './BattleTypes.js';

/**
 * 伤害计算结果
 */
export interface DamageResult {
  damage: number;  // 负数表示治疗敌人
  wuxingEffect: 'conquer' | 'generate' | 'neutral';
  isCritical: boolean;
}

/**
 * 计算基础伤害
 */
export function calculateBaseDamage(attack: number, defense: number): number {
  return Math.max(attack - defense, 1);
}

/**
 * 计算五行伤害修正
 * 克制加成根据攻击方等级从 WUXING_CONQUER_BONUS 表获取
 */
export function calculateWuxingMultiplier(
  attackWuxing: WuxingLevel | null,
  defenseWuxing: WuxingLevel | null
): { multiplier: number; effect: 'conquer' | 'generate' | 'neutral' } {
  // 无五行攻击 = 纯物理
  if (!attackWuxing) {
    return { multiplier: 1.0, effect: 'neutral' };
  }

  // 无五行防御 = 无克制关系，但有等级加成
  if (!defenseWuxing) {
    return { multiplier: 1.0, effect: 'neutral' };
  }

  const relation = getWuxingRelation(attackWuxing.wuxing, defenseWuxing.wuxing);
  const attackLevel = Math.max(1, Math.min(5, attackWuxing.level));
  const defenseLevel = Math.max(1, Math.min(5, defenseWuxing.level));

  switch (relation) {
    case 'conquer':
      // 相克：根据攻击方等级获取加成
      // Lv1: +20%, Lv2: +30%, Lv3: +40%, Lv4: +55%, Lv5: +75%
      const bonus = WUXING_CONQUER_BONUS[attackLevel] || WUXING_CONQUER_BONUS[1];
      // 防御方等级提供抵抗 (按表中的 resistReduction)
      const defenseBonus = WUXING_CONQUER_BONUS[defenseLevel] || WUXING_CONQUER_BONUS[1];
      const finalBonus = bonus.damageBonus - defenseBonus.resistReduction;
      return {
        multiplier: 1 + Math.max(0.1, finalBonus), // 最低 +10%
        effect: 'conquer',
      };

    case 'generate':
      // 相生：治疗敌人，基础 -0.5 倍，等级差影响治疗量
      const levelDiff = attackLevel - defenseLevel;
      return {
        multiplier: -(0.5 + levelDiff * 0.05),
        effect: 'generate',
      };

    default:
      // 中性：每级差 ±5%
      const neutralLevelDiff = attackLevel - defenseLevel;
      return {
        multiplier: 1.0 + neutralLevelDiff * 0.05,
        effect: 'neutral',
      };
  }
}

/**
 * 计算最终伤害
 */
export function calculateFinalDamage(
  attacker: Combatant,
  defender: Combatant,
  ignoreDefense: number = 0
): DamageResult {
  // 计算有效攻击力（考虑 debuff）
  const effectiveAttack = Math.max(1, attacker.attack - attacker.attackDebuff);
  const effectiveDefense = Math.max(0, defender.defense - ignoreDefense);

  // 基础伤害
  const baseDamage = calculateBaseDamage(effectiveAttack, effectiveDefense);

  // 五行修正
  const { multiplier, effect } = calculateWuxingMultiplier(
    attacker.attackWuxing,
    defender.defenseWuxing
  );

  // 五行圆满加成
  let masteryBonus = 1.0;
  if (attacker.hasWuxingMastery) {
    if (effect === 'conquer') {
      masteryBonus = 1.3;  // 五行克制伤害 +30%
    } else if (effect === 'generate') {
      masteryBonus = 1.5;  // 五行相生治疗 +50%
    }
  }

  // 最终伤害
  let finalDamage: number;
  if (multiplier < 0) {
    // 相生：治疗敌人
    finalDamage = -Math.floor(baseDamage * Math.abs(multiplier) * masteryBonus);
  } else {
    finalDamage = Math.floor(baseDamage * multiplier * masteryBonus);
  }

  return {
    damage: finalDamage,
    wuxingEffect: effect,
    isCritical: false,
  };
}
