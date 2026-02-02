import { Combatant, BattleEvent, StatusEffects } from './BattleTypes.js';
import { Wuxing, getWuxingPassiveConfig, WuxingPassiveConfig } from '../types/Wuxing.js';

/**
 * 初始化战斗者的五行被动属性
 * 使用 allWuxingLevels 统计所有装备的五行，应用对应被动
 */
export function initWuxingPassives(combatant: Combatant): void {
  // 初始化状态效果
  combatant.statusEffects = combatant.statusEffects || {};

  // 初始化五行被动追踪字段
  combatant.ignoreDefensePercent = 0;
  combatant.damageReduction = 0;
  combatant.damageReflectPercent = 0;
  combatant.controlImmune = false;
  combatant.revengeStacks = 0;
  combatant.revengeDamageBonus = 0;
  combatant.canSurviveLethal = false;
  combatant.canRevive = false;
  combatant.reviveHpPercent = 0;

  // 如果有 allWuxingLevels（玩家），使用它来初始化所有被动
  if (combatant.allWuxingLevels && combatant.allWuxingLevels.size > 0) {
    combatant.allWuxingLevels.forEach((level, wuxing) => {
      const config = getWuxingPassiveConfig(wuxing, level);
      if (!config) return;

      // 金属性：破防
      if (wuxing === Wuxing.METAL && config.ignoreDefensePercent) {
        combatant.ignoreDefensePercent = Math.max(combatant.ignoreDefensePercent ?? 0, config.ignoreDefensePercent);
      }

      // 木属性：回复、不朽、涅槃
      if (wuxing === Wuxing.WOOD) {
        if (config.regenPercent) {
          combatant.statusEffects!.regeneration = {
            percent: config.regenPercent,
            doubleWhenLow: config.regenDoubleWhenLow || false,
          };
        }
        if (config.surviveLethal) {
          combatant.canSurviveLethal = true;
        }
        if (config.canRevive) {
          combatant.canRevive = true;
          combatant.reviveHpPercent = config.reviveHpPercent || 50;
        }
      }

      // 土属性：减伤、反弹、免控、蓄力
      if (wuxing === Wuxing.EARTH) {
        if (config.damageReduction) {
          combatant.damageReduction = Math.max(combatant.damageReduction ?? 0, config.damageReduction);
        }
        if (config.reflectPercent) {
          combatant.damageReflectPercent = Math.max(combatant.damageReflectPercent ?? 0, config.reflectPercent);
        }
        if (config.controlImmune) {
          combatant.controlImmune = true;
        }
        if (config.revengeStacks) {
          combatant.revengeDamageBonus = config.revengeDamageBonus || 100;
        }
      }

      // 水、火的攻击效果在 applyAttackWuxingEffects 中根据 allWuxingLevels 处理
    });
  } else {
    // 向后兼容：怪物使用旧的 attackWuxing/defenseWuxing 逻辑
    if (combatant.attackWuxing) {
      const config = getWuxingPassiveConfig(combatant.attackWuxing.wuxing, combatant.attackWuxing.level);
      if (config && config.ignoreDefensePercent) {
        combatant.ignoreDefensePercent = config.ignoreDefensePercent;
      }
    }

    if (combatant.defenseWuxing) {
      const config = getWuxingPassiveConfig(combatant.defenseWuxing.wuxing, combatant.defenseWuxing.level);
      if (config) {
        if (config.regenPercent) {
          combatant.statusEffects!.regeneration = {
            percent: config.regenPercent,
            doubleWhenLow: config.regenDoubleWhenLow || false,
          };
        }
        if (config.surviveLethal) combatant.canSurviveLethal = true;
        if (config.canRevive) {
          combatant.canRevive = true;
          combatant.reviveHpPercent = config.reviveHpPercent || 50;
        }
        if (config.damageReduction) combatant.damageReduction = config.damageReduction;
        if (config.reflectPercent) combatant.damageReflectPercent = config.reflectPercent;
        if (config.controlImmune) combatant.controlImmune = true;
        if (config.revengeStacks) combatant.revengeDamageBonus = config.revengeDamageBonus || 100;
      }
    }
  }
}

/**
 * 回合开始时处理状态效果 (回复、流血、灼烧等)
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

  // 木属性：回复
  if (effects.regeneration && effects.regeneration.percent > 0) {
    let regenPercent = effects.regeneration.percent;

    // 低血量时回复翻倍 (HP < 30%)
    if (effects.regeneration.doubleWhenLow && combatant.hp < combatant.maxHp * 0.3) {
      regenPercent *= 2;
    }

    // 最少恢复1点生命值
    const healAmount = Math.max(1, Math.floor(combatant.maxHp * regenPercent / 100));
    if (combatant.hp < combatant.maxHp) {
      const actualHeal = Math.min(healAmount, combatant.maxHp - combatant.hp);
      combatant.hp += actualHeal;
      events.push({
        type: 'status_heal',
        targetId: combatant.id,
        value: actualHeal,
        statusType: 'regeneration',
        message: '生机恢复',
      });
    }
  }

  // 金属性造成的流血
  if (effects.bleeding && effects.bleeding.stacks > 0) {
    const bleedDamage = Math.floor(combatant.maxHp * effects.bleeding.damagePercent * effects.bleeding.stacks / 100);
    if (bleedDamage > 0) {
      combatant.hp = Math.max(0, combatant.hp - bleedDamage);
      events.push({
        type: 'status_damage',
        targetId: combatant.id,
        value: bleedDamage,
        statusType: 'bleeding',
        stacks: effects.bleeding.stacks,
        message: '流血',
      });
    }
  }

  // 火属性造成的灼烧
  if (effects.burning && effects.burning.stacks > 0 && effects.burning.turnsLeft > 0) {
    const burnDamage = Math.floor(combatant.maxHp * effects.burning.damagePercent * effects.burning.stacks / 100);
    if (burnDamage > 0) {
      combatant.hp = Math.max(0, combatant.hp - burnDamage);
      events.push({
        type: 'status_damage',
        targetId: combatant.id,
        value: burnDamage,
        statusType: 'burning',
        stacks: effects.burning.stacks,
        message: '灼烧',
      });
    }

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
 * 攻击时应用五行效果 (流血、灼烧、减速、冻结)
 * 使用 allWuxingLevels 统计所有装备的五行
 */
export function applyAttackWuxingEffects(
  attacker: Combatant,
  defender: Combatant,
  damage: number
): { events: BattleEvent[]; bonusDamage: number } {
  const events: BattleEvent[] = [];
  let bonusDamage = 0;

  // 确保 defender.statusEffects 存在
  if (!defender.statusEffects) {
    defender.statusEffects = {};
  }

  // 五行圆满：免疫所有负面状态
  const isImmuneToStatus = defender.hasWuxingMastery ?? false;

  // 使用 allWuxingLevels（玩家）或 attackWuxing（怪物）
  const wuxingLevels: Map<Wuxing, number> = attacker.allWuxingLevels || new Map();

  // 如果没有 allWuxingLevels，使用旧的 attackWuxing 逻辑（怪物兼容）
  if (wuxingLevels.size === 0 && attacker.attackWuxing) {
    wuxingLevels.set(attacker.attackWuxing.wuxing, attacker.attackWuxing.level);
  }

  // 遍历所有五行类型，应用攻击效果
  wuxingLevels.forEach((level, wuxing) => {
    const config = getWuxingPassiveConfig(wuxing, level);
    if (!config) return;

    // 金属性：流血
    if (wuxing === Wuxing.METAL && config.bleedChance && config.bleedDamagePercent && !isImmuneToStatus) {
      if (Math.random() * 100 < config.bleedChance) {
        const bleedPercent = config.bleedDoubled ? config.bleedDamagePercent * 2 : config.bleedDamagePercent;

        if (!defender.statusEffects!.bleeding) {
          defender.statusEffects!.bleeding = { stacks: 1, damagePercent: bleedPercent };
        } else {
          defender.statusEffects!.bleeding.stacks = Math.min(5, defender.statusEffects!.bleeding.stacks + 1);
          defender.statusEffects!.bleeding.damagePercent = bleedPercent;
        }

        events.push({
          type: 'status_applied',
          actorId: attacker.id,
          targetId: defender.id,
          statusType: 'bleeding',
          stacks: defender.statusEffects!.bleeding.stacks,
          message: '流血',
        });
      }
    }

    // 水属性：减速和冻结
    if (wuxing === Wuxing.WATER && !isImmuneToStatus) {
      const isImmune = (defender.controlImmune ?? false) && defender.hp > defender.maxHp * 0.7;

      if (!isImmune) {
        if (config.freezeChance && Math.random() * 100 < config.freezeChance) {
          defender.frozen = true;
          events.push({
            type: 'status_applied',
            actorId: attacker.id,
            targetId: defender.id,
            statusType: 'frozen',
            message: '冻结',
          });

          if (config.freezeShatterDamage) {
            defender.statusEffects!.slowed = {
              speedReduction: 0,
              turnsLeft: -1,
            };
          }
        } else if (config.slowChance && Math.random() * 100 < config.slowChance) {
          defender.statusEffects!.slowed = {
            speedReduction: config.slowSpeedReduction || 20,
            turnsLeft: config.slowDuration || 2,
          };
          events.push({
            type: 'status_applied',
            actorId: attacker.id,
            targetId: defender.id,
            statusType: 'slowed',
            message: '减速',
          });
        }
      }

      if (config.slowedDamageBonus && defender.statusEffects!.slowed) {
        bonusDamage += Math.floor(damage * config.slowedDamageBonus / 100);
      }
    }

    // 火属性：灼烧
    if (wuxing === Wuxing.FIRE && config.burnDamagePercent && !isImmuneToStatus) {
      const burning = defender.statusEffects!.burning;

      if (!burning) {
        defender.statusEffects!.burning = {
          stacks: 1,
          damagePercent: config.burnDamagePercent,
          turnsLeft: config.burnDuration || 2,
        };
        events.push({
          type: 'status_applied',
          actorId: attacker.id,
          targetId: defender.id,
          statusType: 'burning',
          stacks: 1,
          message: '灼烧',
        });
      } else if (config.burnStackable) {
        const newStacks = Math.min(3, burning.stacks + 1);
        burning.stacks = newStacks;
        burning.turnsLeft = config.burnDuration || 2;
        burning.damagePercent = config.burnDamagePercent;

        events.push({
          type: 'status_applied',
          actorId: attacker.id,
          targetId: defender.id,
          statusType: 'burning',
          stacks: newStacks,
          message: `灼烧x${newStacks}`,
        });

        if (newStacks >= 3 && config.burnExplodeDamage) {
          const explodeDamage = Math.floor(defender.maxHp * config.burnExplodeDamage / 100);
          defender.hp = Math.max(0, defender.hp - explodeDamage);

          events.push({
            type: 'burn_explode',
            actorId: attacker.id,
            targetId: defender.id,
            value: explodeDamage,
            message: '灼烧引爆',
          });

          defender.statusEffects!.burning = undefined;

          if (config.emberDebuff) {
            defender.statusEffects!.hasEmbers = true;
            events.push({
              type: 'status_applied',
              actorId: attacker.id,
              targetId: defender.id,
              statusType: 'embers',
              message: '余烬',
            });
          }
        }
      } else {
        burning.turnsLeft = config.burnDuration || 2;
      }

      if (defender.statusEffects!.hasEmbers) {
        bonusDamage += Math.floor(damage * 0.5);
      }
    }
  });

  return { events, bonusDamage };
}

/**
 * 受伤时应用五行效果 (土属性减伤/反弹)
 */
export function applyDefenseWuxingEffects(
  attacker: Combatant,
  defender: Combatant,
  damage: number
): { events: BattleEvent[]; modifiedDamage: number; reflectDamage: number; damageReduced: number } {
  const events: BattleEvent[] = [];
  let modifiedDamage = damage;
  let reflectDamage = 0;
  let damageReduced = 0;

  // 土属性减伤（最少减少1点伤害）
  const damageReduction = defender.damageReduction ?? 0;
  if (damageReduction > 0) {
    const reduction = Math.max(1, Math.floor(damage * damageReduction / 100));
    damageReduced = reduction;
    modifiedDamage = Math.max(1, damage - reduction);
  }

  // 土属性反弹
  const reflectPercent = defender.damageReflectPercent ?? 0;
  if (reflectPercent > 0) {
    reflectDamage = Math.floor(modifiedDamage * reflectPercent / 100);
  }

  // 土Lv5蓄力攻击计数
  const revengeDamageBonus = defender.revengeDamageBonus ?? 0;
  if (revengeDamageBonus > 0) {
    defender.revengeStacks = (defender.revengeStacks ?? 0) + 1;
  }

  return { events, modifiedDamage, reflectDamage, damageReduced };
}

/**
 * 检查致命伤害保护 (木Lv3+)
 */
export function checkLethalProtection(combatant: Combatant): { protected: boolean; events: BattleEvent[] } {
  const events: BattleEvent[] = [];
  const effects = combatant.statusEffects ?? {};

  // 已经使用过本回合的保护
  if (effects.hasSurvivedLethal) {
    return { protected: false, events };
  }

  // 有致命保护能力
  if ((combatant.canSurviveLethal ?? false) && combatant.hp <= 0) {
    combatant.hp = 1;
    if (!combatant.statusEffects) combatant.statusEffects = {};
    combatant.statusEffects.hasSurvivedLethal = true;
    events.push({
      type: 'survive_lethal',
      targetId: combatant.id,
      value: 1,
      message: '不朽之身',
    });
    return { protected: true, events };
  }

  return { protected: false, events };
}

/**
 * 检查复活 (木Lv5)
 */
export function checkRevive(combatant: Combatant): { revived: boolean; events: BattleEvent[] } {
  const events: BattleEvent[] = [];
  const effects = combatant.statusEffects ?? {};

  // 已经复活过
  if (effects.hasRevived) {
    return { revived: false, events };
  }

  // 有复活能力
  if ((combatant.canRevive ?? false) && combatant.hp <= 0) {
    const reviveHpPercent = combatant.reviveHpPercent ?? 50;
    const reviveHp = Math.floor(combatant.maxHp * reviveHpPercent / 100);
    combatant.hp = reviveHp;
    if (!combatant.statusEffects) combatant.statusEffects = {};
    combatant.statusEffects.hasRevived = true;
    events.push({
      type: 'revive',
      targetId: combatant.id,
      value: reviveHp,
      message: '涅槃重生',
    });
    return { revived: true, events };
  }

  return { revived: false, events };
}

/**
 * 处理冻结解除时的破碎伤害 (水Lv5)
 */
export function processFreezeShatter(
  combatant: Combatant,
  shatterSource: Combatant | null
): BattleEvent[] {
  const events: BattleEvent[] = [];

  // 检查是否有待触发的破碎伤害
  const slowed = combatant.statusEffects?.slowed;
  if (slowed && slowed.turnsLeft === -1) {
    // 获取攻击者的配置来确定破碎伤害
    if (shatterSource?.attackWuxing?.wuxing === Wuxing.WATER) {
      const config = getWuxingPassiveConfig(Wuxing.WATER, shatterSource.attackWuxing.level);
      if (config?.freezeShatterDamage) {
        const shatterDamage = Math.floor(shatterSource.attack * config.freezeShatterDamage / 100);
        combatant.hp = Math.max(0, combatant.hp - shatterDamage);
        events.push({
          type: 'freeze_shatter',
          actorId: shatterSource.id,
          targetId: combatant.id,
          value: shatterDamage,
          message: '冻结破碎',
        });
      }
    }
    // 清除标记
    if (combatant.statusEffects) {
      combatant.statusEffects.slowed = undefined;
    }
  }

  return events;
}

/**
 * 获取土Lv5蓄力攻击加成
 */
export function getRevengeDamageBonus(combatant: Combatant): number {
  // 土Lv5：每承受3次攻击后，下次攻击伤害+100%
  const revengeDamageBonus = combatant.revengeDamageBonus ?? 0;
  const revengeStacks = combatant.revengeStacks ?? 0;
  if (revengeDamageBonus > 0 && revengeStacks >= 3) {
    return revengeDamageBonus;
  }
  return 0;
}

/**
 * 重置土Lv5蓄力计数
 */
export function resetRevengeStacks(combatant: Combatant): void {
  const revengeStacks = combatant.revengeStacks ?? 0;
  if (revengeStacks >= 3) {
    combatant.revengeStacks = 0;
  }
}
