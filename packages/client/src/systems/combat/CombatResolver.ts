import { Combatant, calculateFinalDamage } from '@xiyou/shared';

export interface CombatResult {
  damage: number;
  missed: boolean;
  critical: boolean;
  attackerId: string;
  defenderId: string;
}

/**
 * 无状态伤害解算器 — 复用 shared 伤害计算公式
 */
export function resolveCombat(attacker: Combatant, defender: Combatant): CombatResult {
  // 闪避检定（5%基础闪避）
  if (Math.random() < 0.05) {
    return { damage: 0, missed: true, critical: false, attackerId: attacker.id, defenderId: defender.id };
  }

  // 使用 shared 伤害公式（ignoreDefense=0，即不无视防御）
  const damageResult = calculateFinalDamage(attacker, defender, 0);
  const baseDamage = damageResult.damage;

  // 暴击检定（基础 10%）
  const isCrit = Math.random() < 0.10;
  const finalDamage = Math.max(1, Math.floor(isCrit ? baseDamage * 1.5 : baseDamage));

  return {
    damage: finalDamage,
    missed: false,
    critical: isCrit,
    attackerId: attacker.id,
    defenderId: defender.id,
  };
}
