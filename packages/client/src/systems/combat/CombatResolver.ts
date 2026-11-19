import {
  Combatant,
  calculateAttackSkills,
  calculateDefendSkills,
  getXushiBonus,
} from '@xiyou/shared';
import { relationOf, WuxingRelation, WX_MULT, STAT_SCALE } from '../../config/worldConfig.js';

export interface CombatResult {
  damage: number;
  /** 被闪避（灵动） */
  dodged: boolean;
  /** 被格挡（磐石） */
  blocked: boolean;
  critical: boolean;
  /** 攻击方五行相对防御方五行的关系 */
  relation: WuxingRelation;
  /** 已废弃（五行相生不再回血），恒为 0 */
  healSelf: number;
  healTarget: number;
}

/**
 * 无状态伤害解算器（沙盒实时战斗用）
 *
 * 基础伤害 = 攻² / (攻 + 防)：防御越高收益递减，永远不会把伤害压成 0。
 * 五行倍率见 worldConfig.WX_MULT（克 2.5 / 得生 1.5 / 比 1 / 受制 0.5 / 泄 0.25）。
 *
 * 在此之上叠加属性技能：
 *  锐度/锋芒（暴击）、破甲、杀意、玄冰、暴燃、焚意、怒木、蓄势（攻击侧）
 *  灵动（闪避）、洞察（命中）、磐石（格挡）、厚土、韧性（防御侧）
 */
export function resolveCombat(attacker: Combatant, defender: Combatant, damageMult: number = 1): CombatResult {
  const relation = relationOf(attacker.attackWuxing?.wuxing, defender.defenseWuxing?.wuxing);
  const result: CombatResult = {
    damage: 0, dodged: false, blocked: false, critical: false,
    relation, healSelf: 0, healTarget: 0,
  };

  const atk = attacker.skillEffectLevels
    ? calculateAttackSkills(attacker, defender, attacker.skillEffectLevels)
    : null;
  const def = defender.skillEffectLevels
    ? calculateDefendSkills(defender, defender.skillEffectLevels)
    : null;

  // 闪避（灵动），被洞察抵消
  if (def && def.dodgeRate > 0) {
    const dodge = Math.max(0, def.dodgeRate - (atk?.hitRate ?? 0));
    if (Math.random() * 100 < dodge) {
      result.dodged = true;
      return result;
    }
  }

  let attackPower = Math.max(1, attacker.attack);
  if (atk) attackPower *= 1 + (atk.rageBonus + atk.lowHpAttackBonus) / 100;
  let defense = Math.max(0, defender.defense);
  if (atk && atk.ignoreDefense > 0) defense *= 1 - atk.ignoreDefense / 100;

  let dmg = (attackPower * attackPower) / (attackPower + defense) * WX_MULT[relation] * damageMult;

  if (atk) {
    dmg *= 1 + (atk.slowedBonus + atk.burningBonus) / 100;
    if (atk.critRate > 0 && Math.random() * 100 < atk.critRate) {
      result.critical = true;
      dmg *= 1.5 + atk.critDamage / 100;
    }
    // 杀意的固定加伤随数值放大
    dmg += atk.executeDamage * STAT_SCALE * 0.3;
  }
  // 蓄势（土）：受击叠层，下一击爆发
  if (attacker.skillEffectLevels && (attacker.xushiStacks ?? 0) > 0) {
    dmg *= 1 + getXushiBonus(attacker, attacker.skillEffectLevels) / 100;
  }

  if (def) {
    if (def.blockRate > 0 && Math.random() * 100 < def.blockRate) {
      result.blocked = true;
      dmg *= 0.5;
    }
    dmg *= Math.max(0.1, 1 - (def.damageReduction + def.lowHpReduction) / 100);
  }

  result.damage = Math.max(1, Math.round(dmg));
  return result;
}
