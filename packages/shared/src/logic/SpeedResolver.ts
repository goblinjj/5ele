import { WUXING_SPEED_MODIFIER, WUXING_SPEED_PRIORITY } from '../types/Wuxing.js';
import { Combatant } from './BattleTypes.js';

/**
 * 计算战斗者的最终速度
 */
export function calculateCombatantSpeed(combatant: Combatant): number {
  const baseSpeed = combatant.speed;
  const wuxingMod = combatant.attackWuxing
    ? WUXING_SPEED_MODIFIER[combatant.attackWuxing.wuxing]
    : 0;
  return baseSpeed + wuxingMod;
}

/**
 * 按速度排序战斗者（速度高的在前）
 */
export function sortBySpeed(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => {
    const speedA = calculateCombatantSpeed(a);
    const speedB = calculateCombatantSpeed(b);

    // 速度不同：速度高的先行动
    if (speedA !== speedB) {
      return speedB - speedA;
    }

    // 速度相同：按五行优先级
    const priorityA = a.attackWuxing
      ? WUXING_SPEED_PRIORITY[a.attackWuxing.wuxing]
      : 0;
    const priorityB = b.attackWuxing
      ? WUXING_SPEED_PRIORITY[b.attackWuxing.wuxing]
      : 0;

    return priorityB - priorityA;
  });
}

/**
 * 获取存活的战斗者
 */
export function getAliveCombatants(combatants: Combatant[]): Combatant[] {
  return combatants.filter(c => c.hp > 0);
}
