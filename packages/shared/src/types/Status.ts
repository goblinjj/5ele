import { Wuxing } from './Wuxing.js';
import { PlayerEquipment, getAllWuxingLevels } from './Equipment.js';

/**
 * 角色状态类型
 */
export enum StatusType {
  // 五行圆满 - 集齐5种五行法宝
  WUXING_MASTERY = 'wuxing_mastery',

  // 金属性被动
  METAL_PENETRATE = 'metal_penetrate',   // 破防
  METAL_BLEED = 'metal_bleed',           // 流血

  // 木属性被动
  WOOD_REGEN = 'wood_regen',             // 生机
  WOOD_SURVIVE = 'wood_survive',         // 不朽
  WOOD_REVIVE = 'wood_revive',           // 涅槃

  // 水属性被动
  WATER_SLOW = 'water_slow',             // 寒息
  WATER_FREEZE = 'water_freeze',         // 冰封
  WATER_SHATTER = 'water_shatter',       // 冰碎

  // 火属性被动
  FIRE_BURN = 'fire_burn',               // 灼烧
  FIRE_STACK = 'fire_stack',             // 烈焰
  FIRE_EXPLODE = 'fire_explode',         // 引爆
  FIRE_EMBER = 'fire_ember',             // 余烬

  // 土属性被动
  EARTH_REDUCE = 'earth_reduce',         // 坚韧
  EARTH_REFLECT = 'earth_reflect',       // 反震
  EARTH_IMMUNE = 'earth_immune',         // 不动
  EARTH_REVENGE = 'earth_revenge',       // 蓄力
}

/**
 * 状态定义
 */
export interface StatusDefinition {
  id: StatusType;
  name: string;
  description: string;
  effects: string[];  // 效果列表（静态描述或占位）
  icon: string;       // 显示图标
  color: string;      // 显示颜色
}

/**
 * 根据等级生成具体效果描述
 */
export function getStatusEffectsForLevel(statusType: StatusType, level: number): string[] {
  const clampedLevel = Math.max(1, Math.min(5, level));

  switch (statusType) {
    // 金属性
    case StatusType.METAL_PENETRATE: {
      const values = [10, 20, 35, 50, 70];
      return [`无视敌人 ${values[clampedLevel - 1]}% 防御`];
    }
    case StatusType.METAL_BLEED: {
      const chances = [0, 0, 15, 25, 100];
      const damages = [0, 0, 5, 5, 10];
      const doubled = clampedLevel >= 5;
      return [
        `${chances[clampedLevel - 1]}% 概率造成流血`,
        `流血每回合造成 ${damages[clampedLevel - 1]}% 最大生命值伤害`,
        '流血可叠加最多5层',
        ...(doubled ? ['Lv5: 流血伤害翻倍'] : []),
      ];
    }

    // 木属性
    case StatusType.WOOD_REGEN: {
      const regens = [3, 5, 8, 12, 15];
      const doubleWhenLow = clampedLevel >= 4;
      return [
        `每回合恢复 ${regens[clampedLevel - 1]}% 最大生命值`,
        ...(doubleWhenLow ? ['生命值低于30%时，回复量翻倍'] : []),
      ];
    }
    case StatusType.WOOD_SURVIVE:
      return ['每回合首次受到致命伤害时，保留 1 点生命值'];
    case StatusType.WOOD_REVIVE:
      return ['战斗中死亡时，以 50% 生命值复活', '每场战斗仅触发一次'];

    // 水属性
    case StatusType.WATER_SLOW: {
      const chances = [15, 25, 35, 35, 35];
      const reductions = [20, 30, 30, 30, 30];
      const bonusDamage = clampedLevel >= 3;
      return [
        `${chances[clampedLevel - 1]}% 概率减速敌人`,
        `减速 ${reductions[clampedLevel - 1]}%，持续2回合`,
        ...(bonusDamage ? ['对减速目标伤害 +15%'] : []),
      ];
    }
    case StatusType.WATER_FREEZE: {
      const chances = [0, 0, 0, 20, 30];
      return [
        `${chances[clampedLevel - 1]}% 概率冻结敌人`,
        '被冻结的敌人跳过下一回合',
      ];
    }
    case StatusType.WATER_SHATTER:
      return ['冻结解除时，对敌人造成 100% 攻击力的额外伤害'];

    // 火属性
    case StatusType.FIRE_BURN: {
      const damages = [3, 5, 5, 5, 8];
      const durations = [2, 3, 3, 3, 3];
      return [
        '攻击时对敌人施加灼烧',
        `灼烧每回合造成 ${damages[clampedLevel - 1]}% 最大生命值伤害`,
        `持续 ${durations[clampedLevel - 1]} 回合`,
      ];
    }
    case StatusType.FIRE_STACK:
      return ['灼烧效果可叠加', '最多叠加 3 层，每层独立造成伤害'];
    case StatusType.FIRE_EXPLODE: {
      const damages = [0, 0, 0, 20, 35];
      return [
        '灼烧叠满 3 层时自动引爆',
        `引爆造成 ${damages[clampedLevel - 1]}% 最大生命值伤害`,
        '引爆后清除所有灼烧层数',
      ];
    }
    case StatusType.FIRE_EMBER:
      return ['引爆后敌人进入余烬状态', '余烬状态下受到的火属性伤害 +50%'];

    // 土属性
    case StatusType.EARTH_REDUCE: {
      const reductions = [10, 18, 25, 35, 45];
      return [`受到的所有伤害减少 ${reductions[clampedLevel - 1]}%`];
    }
    case StatusType.EARTH_REFLECT: {
      const reflects = [0, 0, 15, 25, 40];
      return [`受到攻击时，反弹 ${reflects[clampedLevel - 1]}% 伤害给攻击者`];
    }
    case StatusType.EARTH_IMMUNE:
      return ['生命值高于 70% 时', '免疫冻结、减速等控制效果'];
    case StatusType.EARTH_REVENGE:
      return ['每承受 3 次攻击后', '下一次攻击伤害 +100%'];

    // 五行圆满
    case StatusType.WUXING_MASTERY:
      return [
        '五行克制伤害 +30%',
        '五行相生治疗 +50%',
        '免疫所有负面状态效果',
        '每回合恢复 5% 最大生命值',
      ];

    default:
      return [];
  }
}

/**
 * 状态定义表
 */
export const STATUS_DEFINITIONS: Record<StatusType, StatusDefinition> = {
  [StatusType.WUXING_MASTERY]: {
    id: StatusType.WUXING_MASTERY,
    name: '五行圆满',
    description: '集齐金、木、水、火、土五种五行法宝，领悟五行相生相克之道。',
    effects: [
      '五行克制伤害 +30%',
      '五行相生治疗 +50%',
      '免疫所有负面状态效果',
      '每回合恢复 5% 最大生命值',
    ],
    icon: '☯',
    color: '#ffd700',
  },

  // 金属性被动
  [StatusType.METAL_PENETRATE]: {
    id: StatusType.METAL_PENETRATE,
    name: '破金',
    description: '金属性的锐利之力，无视敌人部分防御。',
    effects: ['无视敌人 10%-70% 防御（随等级提升）'],
    icon: '⚔',
    color: '#c0c0c0',
  },
  [StatusType.METAL_BLEED]: {
    id: StatusType.METAL_BLEED,
    name: '裂伤',
    description: '金属性的锋芒可造成流血效果。',
    effects: ['攻击有概率造成流血', '流血每回合造成最大生命值百分比伤害', '流血可叠加'],
    icon: '🩸',
    color: '#c0c0c0',
  },

  // 木属性被动
  [StatusType.WOOD_REGEN]: {
    id: StatusType.WOOD_REGEN,
    name: '生机',
    description: '木属性蕴含的生命之力，持续恢复生命。',
    effects: ['每回合恢复 3%-15% 最大生命值（随等级提升）', '低血量时恢复翻倍（Lv4+）'],
    icon: '🌿',
    color: '#228b22',
  },
  [StatusType.WOOD_SURVIVE]: {
    id: StatusType.WOOD_SURVIVE,
    name: '不朽',
    description: '木属性的生命守护，在致命一击时保留一丝生机。',
    effects: ['每回合首次受到致命伤害时，保留 1 点生命值'],
    icon: '🛡',
    color: '#228b22',
  },
  [StatusType.WOOD_REVIVE]: {
    id: StatusType.WOOD_REVIVE,
    name: '涅槃',
    description: '木属性的究极力量，可从死亡中复生。',
    effects: ['战斗中死亡时，以 50% 生命值复活（每场战斗一次）'],
    icon: '🌳',
    color: '#228b22',
  },

  // 水属性被动
  [StatusType.WATER_SLOW]: {
    id: StatusType.WATER_SLOW,
    name: '寒息',
    description: '水属性的寒气可减缓敌人行动。',
    effects: ['攻击有概率造成减速', '对减速目标伤害 +15%（Lv3+）'],
    icon: '❄',
    color: '#4169e1',
  },
  [StatusType.WATER_FREEZE]: {
    id: StatusType.WATER_FREEZE,
    name: '冰封',
    description: '水属性的极寒之力可冻结敌人。',
    effects: ['攻击有概率冻结敌人', '被冻结的敌人跳过下一回合'],
    icon: '🧊',
    color: '#4169e1',
  },
  [StatusType.WATER_SHATTER]: {
    id: StatusType.WATER_SHATTER,
    name: '冰碎',
    description: '水属性的终极冰霜之力。',
    effects: ['冻结解除时对敌人造成额外伤害'],
    icon: '💎',
    color: '#4169e1',
  },

  // 火属性被动
  [StatusType.FIRE_BURN]: {
    id: StatusType.FIRE_BURN,
    name: '灼烧',
    description: '火属性的炎热可灼伤敌人。',
    effects: ['攻击造成灼烧效果', '灼烧每回合造成最大生命值百分比伤害'],
    icon: '🔥',
    color: '#ff4500',
  },
  [StatusType.FIRE_STACK]: {
    id: StatusType.FIRE_STACK,
    name: '烈焰',
    description: '火属性的烈焰可以层层叠加。',
    effects: ['灼烧可叠加至 3 层', '每层增加灼烧伤害'],
    icon: '🔥',
    color: '#ff4500',
  },
  [StatusType.FIRE_EXPLODE]: {
    id: StatusType.FIRE_EXPLODE,
    name: '引爆',
    description: '火属性的爆裂之力。',
    effects: ['灼烧叠满 3 层时引爆', '引爆造成最大生命值 20%-35% 伤害'],
    icon: '💥',
    color: '#ff4500',
  },
  [StatusType.FIRE_EMBER]: {
    id: StatusType.FIRE_EMBER,
    name: '余烬',
    description: '火属性的究极火焰之力。',
    effects: ['引爆后敌人进入余烬状态', '余烬状态下受到的火属性伤害 +50%'],
    icon: '🌋',
    color: '#ff4500',
  },

  // 土属性被动
  [StatusType.EARTH_REDUCE]: {
    id: StatusType.EARTH_REDUCE,
    name: '坚韧',
    description: '土属性的防护之力，减少受到的伤害。',
    effects: ['受到的所有伤害减少 10%-45%（随等级提升）'],
    icon: '🪨',
    color: '#8b4513',
  },
  [StatusType.EARTH_REFLECT]: {
    id: StatusType.EARTH_REFLECT,
    name: '反震',
    description: '土属性可以反弹部分伤害给攻击者。',
    effects: ['受到攻击时反弹 15%-40% 伤害给攻击者'],
    icon: '↩',
    color: '#8b4513',
  },
  [StatusType.EARTH_IMMUNE]: {
    id: StatusType.EARTH_IMMUNE,
    name: '不动',
    description: '土属性的稳固之力，高血量时免疫控制。',
    effects: ['生命值高于 70% 时免疫冻结、减速等控制效果'],
    icon: '⛰',
    color: '#8b4513',
  },
  [StatusType.EARTH_REVENGE]: {
    id: StatusType.EARTH_REVENGE,
    name: '蓄力',
    description: '土属性的积蓄之力，承受攻击后爆发。',
    effects: ['每承受 3 次攻击后', '下一次攻击伤害 +100%'],
    icon: '💪',
    color: '#8b4513',
  },
};

/**
 * 玩家状态记录
 */
export interface PlayerStatus {
  type: StatusType;
  acquiredAt: number;  // 获取时间戳
}

/**
 * 检查是否集齐五行法宝
 */
export function checkWuxingMastery(treasureWuxings: (Wuxing | undefined)[]): boolean {
  // 需要 5 种不同的五行
  const uniqueWuxings = new Set(
    treasureWuxings.filter((w): w is Wuxing => w !== undefined)
  );
  return uniqueWuxings.size >= 5;
}

/**
 * 获取状态显示信息
 */
export function getStatusDisplayInfo(statusType: StatusType): StatusDefinition | null {
  return STATUS_DEFINITIONS[statusType] || null;
}

/**
 * 五行被动状态信息
 */
export interface WuxingPassiveStatus {
  type: StatusType;
  level: number;
  wuxing: Wuxing;
}

/**
 * 根据装备获取激活的五行被动状态
 * 统计所有装备的五行，相同五行等级相加
 */
export function getWuxingPassiveStatuses(equipment: PlayerEquipment): WuxingPassiveStatus[] {
  const statuses: WuxingPassiveStatus[] = [];
  const wuxingLevels = getAllWuxingLevels(equipment);

  // 遍历所有五行类型
  wuxingLevels.forEach((level, wuxing) => {
    switch (wuxing) {
      case Wuxing.METAL:
        // 金: 破防(Lv1+) + 流血(Lv3+)
        statuses.push({ type: StatusType.METAL_PENETRATE, level, wuxing });
        if (level >= 3) statuses.push({ type: StatusType.METAL_BLEED, level, wuxing });
        break;

      case Wuxing.WOOD:
        // 木: 生机(Lv1+) + 不朽(Lv3+) + 涅槃(Lv5+)
        statuses.push({ type: StatusType.WOOD_REGEN, level, wuxing });
        if (level >= 3) statuses.push({ type: StatusType.WOOD_SURVIVE, level, wuxing });
        if (level >= 5) statuses.push({ type: StatusType.WOOD_REVIVE, level, wuxing });
        break;

      case Wuxing.WATER:
        // 水: 寒息(Lv1+) + 冰封(Lv4+) + 冰碎(Lv5+)
        statuses.push({ type: StatusType.WATER_SLOW, level, wuxing });
        if (level >= 4) statuses.push({ type: StatusType.WATER_FREEZE, level, wuxing });
        if (level >= 5) statuses.push({ type: StatusType.WATER_SHATTER, level, wuxing });
        break;

      case Wuxing.FIRE:
        // 火: 灼烧(Lv1+) + 烈焰(Lv3+) + 引爆(Lv4+) + 余烬(Lv5+)
        statuses.push({ type: StatusType.FIRE_BURN, level, wuxing });
        if (level >= 3) statuses.push({ type: StatusType.FIRE_STACK, level, wuxing });
        if (level >= 4) statuses.push({ type: StatusType.FIRE_EXPLODE, level, wuxing });
        if (level >= 5) statuses.push({ type: StatusType.FIRE_EMBER, level, wuxing });
        break;

      case Wuxing.EARTH:
        // 土: 坚韧(Lv1+) + 反震(Lv3+) + 不动(Lv4+) + 蓄力(Lv5+)
        statuses.push({ type: StatusType.EARTH_REDUCE, level, wuxing });
        if (level >= 3) statuses.push({ type: StatusType.EARTH_REFLECT, level, wuxing });
        if (level >= 4) statuses.push({ type: StatusType.EARTH_IMMUNE, level, wuxing });
        if (level >= 5) statuses.push({ type: StatusType.EARTH_REVENGE, level, wuxing });
        break;
    }
  });

  return statuses;
}
