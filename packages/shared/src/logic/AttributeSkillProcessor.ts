import {
  AttributeSkillId,
  SkillTrigger,
  getSkillDef,
  getSkillValue,
} from '../data/AttributeSkillDatabase.js';
import { Wuxing } from '../types/Wuxing.js';
import { Combatant, BattleEvent } from './BattleTypes.js';

/**
 * 玩家的技能效果等级（考虑重复技能加成）
 */
export interface SkillEffectLevels {
  // 技能ID -> 生效等级（五行等级 + 重复加成，上限10）
  levels: Map<AttributeSkillId, number>;
}

/**
 * 计算玩家所有技能的生效等级
 * @param allSkills 所有装备的技能列表（扁平化）
 * @param wuxingLevels 玩家各五行等级
 */
export function calculateSkillEffectLevels(
  allSkills: AttributeSkillId[],
  wuxingLevels: Map<Wuxing, number>
): SkillEffectLevels {
  const levels = new Map<AttributeSkillId, number>();

  // 统计每个技能出现次数
  const skillCounts = new Map<AttributeSkillId, number>();
  for (const skillId of allSkills) {
    skillCounts.set(skillId, (skillCounts.get(skillId) ?? 0) + 1);
  }

  // 计算每个技能的生效等级
  for (const [skillId, count] of skillCounts) {
    const skillDef = getSkillDef(skillId);
    const baseLevel = wuxingLevels.get(skillDef.wuxing) ?? 0;
    // 重复技能每多一个+1级，上限10
    const effectLevel = Math.min(10, baseLevel + (count - 1));
    if (effectLevel > 0) {
      levels.set(skillId, effectLevel);
    }
  }

  return { levels };
}

/**
 * 战斗初始化时应用技能效果（修改属性）
 */
export function applyBattleInitSkills(
  combatant: Combatant,
  skillLevels: SkillEffectLevels
): void {
  for (const [skillId, level] of skillLevels.levels) {
    const def = getSkillDef(skillId);
    if (def.trigger !== SkillTrigger.BATTLE_INIT) continue;

    const value = getSkillValue(skillId, level);

    switch (skillId) {
      case AttributeSkillId.GENJI:
        // 根基：最大生命+X
        combatant.maxHp += value;
        combatant.hp += value;
        break;
      case AttributeSkillId.YANWEI:
        // 炎威：攻击力+X%
        combatant.attack = Math.floor(combatant.attack * (1 + value / 100));
        break;
      case AttributeSkillId.JIANBI:
        // 坚壁：防御力+X%
        combatant.defense = Math.floor(combatant.defense * (1 + value / 100));
        break;
    }
  }
}

/**
 * 回合开始时处理技能效果
 */
export function processTurnStartSkills(
  combatant: Combatant,
  skillLevels: SkillEffectLevels
): BattleEvent[] {
  const events: BattleEvent[] = [];

  for (const [skillId, level] of skillLevels.levels) {
    const def = getSkillDef(skillId);
    if (def.trigger !== SkillTrigger.TURN_START) continue;

    const value = getSkillValue(skillId, level);

    switch (skillId) {
      case AttributeSkillId.SHENGJI:
        // 生机：每回合回复X%最大生命
        if (combatant.hp < combatant.maxHp) {
          const healAmount = Math.max(1, Math.floor(combatant.maxHp * value / 100));
          const actualHeal = Math.min(healAmount, combatant.maxHp - combatant.hp);
          combatant.hp += actualHeal;
          events.push({
            type: 'status_heal',
            targetId: combatant.id,
            value: actualHeal,
            message: '生机',
          });
        }
        break;
    }
  }

  return events;
}

/**
 * 攻击判定时的技能效果结果
 */
export interface AttackSkillResult {
  critRate: number;        // 暴击率加成
  critDamage: number;      // 暴击伤害加成（百分比）
  ignoreDefense: number;   // 无视防御（百分比）
  executeDamage: number;   // 斩杀额外伤害（固定值）
  hitRate: number;         // 命中率加成
  slowedBonus: number;     // 对减速目标伤害加成（百分比）
  burningBonus: number;    // 对灼烧目标伤害加成（百分比）
  rageBonus: number;       // 残血狂暴加成（百分比）
  lowHpAttackBonus: number; // 低血量攻击加成（百分比）
}

/**
 * 计算攻击时的技能效果
 */
export function calculateAttackSkills(
  attacker: Combatant,
  defender: Combatant,
  skillLevels: SkillEffectLevels
): AttackSkillResult {
  const result: AttackSkillResult = {
    critRate: 0,
    critDamage: 0,
    ignoreDefense: 0,
    executeDamage: 0,
    hitRate: 0,
    slowedBonus: 0,
    burningBonus: 0,
    rageBonus: 0,
    lowHpAttackBonus: 0,
  };

  for (const [skillId, level] of skillLevels.levels) {
    const def = getSkillDef(skillId);
    if (def.trigger !== SkillTrigger.ON_ATTACK && def.trigger !== SkillTrigger.ON_LOW_HP) continue;

    const value = getSkillValue(skillId, level);

    switch (skillId) {
      case AttributeSkillId.RUIDU:
        // 锐度：暴击率
        result.critRate += value;
        break;
      case AttributeSkillId.FENGMANG:
        // 锋芒：暴击伤害加成
        result.critDamage += value;
        break;
      case AttributeSkillId.POJIA:
        // 破甲：无视防御
        result.ignoreDefense += value;
        break;
      case AttributeSkillId.SHAYI:
        // 杀意：对低于30%生命的目标额外伤害
        if (defender.hp < defender.maxHp * 0.3) {
          result.executeDamage += value;
        }
        break;
      case AttributeSkillId.DONGCHA:
        // 洞察：命中率
        result.hitRate += value;
        break;
      case AttributeSkillId.XUANBING:
        // 玄冰：对减速目标伤害加成
        if (defender.statusEffects?.slowed) {
          result.slowedBonus += value;
        }
        break;
      case AttributeSkillId.BAORAN:
        // 暴燃：对灼烧目标伤害加成
        if (defender.statusEffects?.burning) {
          result.burningBonus += value;
        }
        break;
      case AttributeSkillId.FENYI:
        // 焚意：生命越低攻击越高
        const hpPercent = attacker.hp / attacker.maxHp;
        // 线性计算：满血0%加成，空血100%加成
        result.rageBonus += Math.floor(value * (1 - hpPercent));
        break;
      case AttributeSkillId.NUMU:
        // 怒木：生命低于50%时攻击加成
        if (attacker.hp < attacker.maxHp * 0.5) {
          result.lowHpAttackBonus += value;
        }
        break;
    }
  }

  return result;
}

/**
 * 防御判定时的技能效果结果
 */
export interface DefendSkillResult {
  dodgeRate: number;       // 闪避率
  blockRate: number;       // 格挡率
  damageReduction: number; // 固定减伤（百分比）
  lowHpReduction: number;  // 低血量减伤（百分比）
}

/**
 * 计算防御时的技能效果
 */
export function calculateDefendSkills(
  defender: Combatant,
  skillLevels: SkillEffectLevels
): DefendSkillResult {
  const result: DefendSkillResult = {
    dodgeRate: 0,
    blockRate: 0,
    damageReduction: 0,
    lowHpReduction: 0,
  };

  for (const [skillId, level] of skillLevels.levels) {
    const def = getSkillDef(skillId);
    if (def.trigger !== SkillTrigger.ON_DEFEND && def.trigger !== SkillTrigger.ON_LOW_HP) continue;

    const value = getSkillValue(skillId, level);

    switch (skillId) {
      case AttributeSkillId.LINGDONG:
        // 灵动：闪避率
        result.dodgeRate += value;
        break;
      case AttributeSkillId.PANSHI:
        // 磐石：格挡率
        result.blockRate += value;
        break;
      case AttributeSkillId.HOUTU:
        // 厚土：固定减伤
        result.damageReduction += value;
        break;
      case AttributeSkillId.RENXING:
        // 韧性：低血量减伤
        if (defender.hp < defender.maxHp * 0.3) {
          result.lowHpReduction += value;
        }
        break;
    }
  }

  return result;
}

/**
 * 攻击后效果（施加状态）
 */
export interface AfterAttackResult {
  events: BattleEvent[];
  applyBurning: boolean;
  applySlow: boolean;
}

/**
 * 处理攻击后的技能效果
 */
export function processAfterAttackSkills(
  attacker: Combatant,
  defender: Combatant,
  skillLevels: SkillEffectLevels,
  wasCrit: boolean
): AfterAttackResult {
  const result: AfterAttackResult = {
    events: [],
    applyBurning: false,
    applySlow: false,
  };

  // 五行圆满免疫负面状态
  if (defender.hasWuxingMastery) {
    return result;
  }

  for (const [skillId, level] of skillLevels.levels) {
    const def = getSkillDef(skillId);
    if (def.trigger !== SkillTrigger.AFTER_ATTACK) continue;

    const value = getSkillValue(skillId, level);

    switch (skillId) {
      case AttributeSkillId.HANFENG:
        // 寒锋：暴击时概率减速
        if (wasCrit && Math.random() * 100 < value) {
          result.applySlow = true;
          result.events.push({
            type: 'status_applied',
            actorId: attacker.id,
            targetId: defender.id,
            statusType: 'slowed',
            message: '寒锋',
          });
        }
        break;
      case AttributeSkillId.NINGZHI:
        // 凝滞：概率减速
        if (Math.random() * 100 < value) {
          result.applySlow = true;
          result.events.push({
            type: 'status_applied',
            actorId: attacker.id,
            targetId: defender.id,
            statusType: 'slowed',
            message: '凝滞',
          });
        }
        break;
      case AttributeSkillId.LIAOYUAN:
        // 燎原：概率灼烧
        if (Math.random() * 100 < value) {
          result.applyBurning = true;
          result.events.push({
            type: 'status_applied',
            actorId: attacker.id,
            targetId: defender.id,
            statusType: 'burning',
            message: '燎原',
          });
        }
        break;
    }
  }

  return result;
}

/**
 * 防御后效果（反击等）
 */
export interface AfterDefendResult {
  events: BattleEvent[];
  reflectDamage: number;
  healAmount: number;
  applyBurning: boolean;
  addXushiStack: boolean;
}

/**
 * 处理防御后的技能效果
 */
export function processAfterDefendSkills(
  attacker: Combatant,
  defender: Combatant,
  skillLevels: SkillEffectLevels,
  damageTaken: number,
  dodged: boolean
): AfterDefendResult {
  const result: AfterDefendResult = {
    events: [],
    reflectDamage: 0,
    healAmount: 0,
    applyBurning: false,
    addXushiStack: false,
  };

  for (const [skillId, level] of skillLevels.levels) {
    const def = getSkillDef(skillId);
    if (def.trigger !== SkillTrigger.AFTER_DEFEND) continue;

    const value = getSkillValue(skillId, level);

    switch (skillId) {
      case AttributeSkillId.RUNZE:
        // 润泽：闪避成功时回血
        if (dodged) {
          result.healAmount = Math.max(1, Math.floor(defender.maxHp * value / 100));
          result.events.push({
            type: 'status_heal',
            targetId: defender.id,
            value: result.healAmount,
            message: '润泽',
          });
        }
        break;
      case AttributeSkillId.FANZHEN:
        // 反震：反弹伤害
        if (damageTaken > 0) {
          result.reflectDamage = Math.floor(damageTaken * value / 100);
          if (result.reflectDamage > 0) {
            result.events.push({
              type: 'damage',
              actorId: defender.id,
              targetId: attacker.id,
              value: result.reflectDamage,
              message: '反震',
            });
          }
        }
        break;
      case AttributeSkillId.YUJIN:
        // 余烬：受击时概率使攻击者灼烧
        if (damageTaken > 0 && !attacker.hasWuxingMastery && Math.random() * 100 < value) {
          result.applyBurning = true;
          result.events.push({
            type: 'status_applied',
            actorId: defender.id,
            targetId: attacker.id,
            statusType: 'burning',
            message: '余烬',
          });
        }
        break;
      case AttributeSkillId.XUSHI:
        // 蓄势：受击时叠加层数
        if (damageTaken > 0) {
          result.addXushiStack = true;
        }
        break;
    }
  }

  return result;
}

/**
 * 检查致命保护（逢春）
 */
export function checkFengchun(
  combatant: Combatant,
  skillLevels: SkillEffectLevels
): { protected: boolean; events: BattleEvent[] } {
  const events: BattleEvent[] = [];

  // 已经触发过
  if (combatant.statusEffects?.hasSurvivedLethal) {
    return { protected: false, events };
  }

  const level = skillLevels.levels.get(AttributeSkillId.FENGCHUN);
  if (!level) {
    return { protected: false, events };
  }

  const chance = getSkillValue(AttributeSkillId.FENGCHUN, level);
  if (Math.random() * 100 < chance) {
    combatant.hp = 1;
    if (!combatant.statusEffects) combatant.statusEffects = {};
    combatant.statusEffects.hasSurvivedLethal = true;
    events.push({
      type: 'survive_lethal',
      targetId: combatant.id,
      value: 1,
      message: '逢春',
    });
    return { protected: true, events };
  }

  return { protected: false, events };
}

/**
 * 获取蓄势伤害加成
 */
export function getXushiBonus(
  combatant: Combatant,
  skillLevels: SkillEffectLevels
): number {
  const level = skillLevels.levels.get(AttributeSkillId.XUSHI);
  if (!level) return 0;

  const stacks = combatant.xushiStacks ?? 0;
  if (stacks === 0) return 0;

  const valuePerStack = getSkillValue(AttributeSkillId.XUSHI, level);
  return valuePerStack * stacks;
}

/**
 * 重置蓄势层数（攻击后）
 */
export function resetXushiStacks(combatant: Combatant): void {
  combatant.xushiStacks = 0;
}

/**
 * 增加蓄势层数（受击后）
 */
export function addXushiStack(combatant: Combatant): void {
  combatant.xushiStacks = Math.min(3, (combatant.xushiStacks ?? 0) + 1);
}

/**
 * AOE技能触发结果
 */
export interface AoeSkillResult {
  triggered: boolean;
  skillId: AttributeSkillId | null;
  skillName: string;
  damagePercent: number;     // 伤害百分比（基于原伤害）
  applySlow: boolean;        // 是否施加减速
  applyBurning: boolean;     // 是否施加灼烧
  lifestealPercent: number;  // 吸血百分比
  scalesWithEnemyCount: boolean; // 伤害是否随敌人数量提升
}

/**
 * 检查AOE技能是否触发
 */
export function checkAoeSkillTrigger(
  attacker: Combatant,
  skillLevels: SkillEffectLevels
): AoeSkillResult {
  const result: AoeSkillResult = {
    triggered: false,
    skillId: null,
    skillName: '',
    damagePercent: 0,
    applySlow: false,
    applyBurning: false,
    lifestealPercent: 0,
    scalesWithEnemyCount: false,
  };

  // 检查所有AOE技能
  const aoeSkills: AttributeSkillId[] = [
    AttributeSkillId.LIEKONGZHAN,  // 裂空斩
    AttributeSkillId.HANCHAO,      // 寒潮
    AttributeSkillId.JINGJI,       // 荆棘
    AttributeSkillId.FENTIAN,      // 焚天
    AttributeSkillId.DILIE,        // 地裂
  ];

  for (const skillId of aoeSkills) {
    const level = skillLevels.levels.get(skillId);
    if (!level) continue;

    const def = getSkillDef(skillId);
    if (def.trigger !== SkillTrigger.AOE_ATTACK) continue;

    const triggerChance = getSkillValue(skillId, level);
    if (Math.random() * 100 >= triggerChance) continue;

    // 技能触发！
    result.triggered = true;
    result.skillId = skillId;
    result.skillName = def.name;

    switch (skillId) {
      case AttributeSkillId.LIEKONGZHAN:
        // 裂空斩：70%伤害群攻
        result.damagePercent = 70;
        break;
      case AttributeSkillId.HANCHAO:
        // 寒潮：50%伤害 + 减速
        result.damagePercent = 50;
        result.applySlow = true;
        break;
      case AttributeSkillId.JINGJI:
        // 荆棘：50%伤害 + 吸血
        result.damagePercent = 50;
        result.lifestealPercent = 30; // 30%吸血
        break;
      case AttributeSkillId.FENTIAN:
        // 焚天：只施加灼烧，不造成直接伤害
        result.damagePercent = 0;
        result.applyBurning = true;
        break;
      case AttributeSkillId.DILIE:
        // 地裂：60%伤害，敌人越多伤害越高
        result.damagePercent = 60;
        result.scalesWithEnemyCount = true;
        break;
    }

    // 只触发一个AOE技能
    break;
  }

  return result;
}
