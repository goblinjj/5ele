import { WuxingLevel, getWuxingRelation } from '../types/Wuxing.js';
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
 */
export function calculateWuxingMultiplier(
  attackWuxing: WuxingLevel | null,
  defenseWuxing: WuxingLevel | null
): { multiplier: number; effect: 'conquer' | 'generate' | 'neutral' } {
  // 无五行攻击 = 纯物理
  if (!attackWuxing || !defenseWuxing) {
    return { multiplier: 1.0, effect: 'neutral' };
  }

  const relation = getWuxingRelation(attackWuxing.wuxing, defenseWuxing.wuxing);
  const levelDiff = attackWuxing.level - defenseWuxing.level;

  switch (relation) {
    case 'conquer':
      // 相克：基础 1.5 倍，每级差 ±10%
      return {
        multiplier: 1.5 + levelDiff * 0.1,
        effect: 'conquer',
      };
    case 'generate':
      // 相生：治疗敌人，基础 -0.5 倍
      return {
        multiplier: -(0.5 + levelDiff * 0.05),
        effect: 'generate',
      };
    default:
      // 中性：每级差 ±5%
      return {
        multiplier: 1.0 + levelDiff * 0.05,
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

  // 最终伤害
  let finalDamage: number;
  if (multiplier < 0) {
    // 相生：治疗敌人
    finalDamage = -Math.floor(baseDamage * Math.abs(multiplier));
  } else {
    finalDamage = Math.floor(baseDamage * multiplier);
  }

  return {
    damage: finalDamage,
    wuxingEffect: effect,
    isCritical: false,
  };
}
