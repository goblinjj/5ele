import { Combatant, Wuxing } from '@xiyou/shared';

export interface CombatResult {
  damage: number;
  missed: boolean;
  critical: boolean;
  attackerId: string;
  defenderId: string;
  /** 被攻击方生攻击方时，攻击方每次攻击自身回复 1 血 */
  healSelf: number;
  /** 攻击方生被攻击方时，每次攻击为对方回复 1 血（伤害为 0） */
  healTarget: number;
}

/** 五行相生链：A 生 B */
const WX_GENERATES: Partial<Record<Wuxing, Wuxing>> = {
  [Wuxing.WOOD]:  Wuxing.FIRE,
  [Wuxing.FIRE]:  Wuxing.EARTH,
  [Wuxing.EARTH]: Wuxing.METAL,
  [Wuxing.METAL]: Wuxing.WATER,
  [Wuxing.WATER]: Wuxing.WOOD,
};

/** 五行相克链：A 克 B */
const WX_OVERCOMES: Partial<Record<Wuxing, Wuxing>> = {
  [Wuxing.WOOD]:  Wuxing.EARTH,
  [Wuxing.EARTH]: Wuxing.WATER,
  [Wuxing.WATER]: Wuxing.FIRE,
  [Wuxing.FIRE]:  Wuxing.METAL,
  [Wuxing.METAL]: Wuxing.WOOD,
};

/**
 * 五行关系倍率（以攻击方视角）：
 *  - 攻击方生被攻击方：0% 伤害，+1 治疗对方
 *  - 同属性：100% 伤害
 *  - 攻击方克被攻击方：200% 伤害
 *  - 被攻击方克攻击方：50% 伤害
 *  - 被攻击方生攻击方：100% 伤害，+1 治疗自身
 *  - 无五行：100% 伤害
 */
function getWuxingMultiplier(
  attackerWuxing: Wuxing | undefined,
  defenderWuxing: Wuxing | undefined
): { multiplier: number; healSelf: number; healTarget: number } {
  if (!attackerWuxing || !defenderWuxing) {
    return { multiplier: 1.0, healSelf: 0, healTarget: 0 };
  }

  // 攻击方生被攻击方
  if (WX_GENERATES[attackerWuxing] === defenderWuxing) {
    return { multiplier: 0, healSelf: 0, healTarget: 1 };
  }
  // 同属性
  if (attackerWuxing === defenderWuxing) {
    return { multiplier: 1.0, healSelf: 0, healTarget: 0 };
  }
  // 攻击方克被攻击方
  if (WX_OVERCOMES[attackerWuxing] === defenderWuxing) {
    return { multiplier: 2.0, healSelf: 0, healTarget: 0 };
  }
  // 被攻击方克攻击方
  if (WX_OVERCOMES[defenderWuxing] === attackerWuxing) {
    return { multiplier: 0.5, healSelf: 0, healTarget: 0 };
  }
  // 被攻击方生攻击方
  if (WX_GENERATES[defenderWuxing] === attackerWuxing) {
    return { multiplier: 1.0, healSelf: 1, healTarget: 0 };
  }

  return { multiplier: 1.0, healSelf: 0, healTarget: 0 };
}

/**
 * 无状态伤害解算器
 * 基于双方五行属性计算伤害，同一公式用于双向攻防。
 * base = max(0, attack - defense)，再乘五行倍率。
 */
export function resolveCombat(attacker: Combatant, defender: Combatant): CombatResult {
  const baseDamage = Math.max(0, attacker.attack - defender.defense);

  const attackerWuxing = attacker.attackWuxing?.wuxing;
  const defenderWuxing = defender.defenseWuxing?.wuxing;

  const { multiplier, healSelf, healTarget } = getWuxingMultiplier(attackerWuxing, defenderWuxing);

  // baseDamage > 0 且有伤害倍率时，保证至少造成 1 点伤害（避免 0.5 倍截断为 0）
  const rawDamage = Math.floor(baseDamage * multiplier);
  const finalDamage = multiplier > 0 ? Math.max(1, rawDamage) : rawDamage;

  return {
    damage: finalDamage,
    missed: false,
    critical: false,
    attackerId: attacker.id,
    defenderId: defender.id,
    healSelf,
    healTarget,
  };
}
