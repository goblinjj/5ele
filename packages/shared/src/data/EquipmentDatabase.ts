import { Equipment, EquipmentType, Rarity, Skill, SkillTrigger } from '../types/Equipment.js';
import { Wuxing } from '../types/Wuxing.js';

/**
 * 西游神器 - 传说/史诗级装备
 */
export const LEGENDARY_EQUIPMENT: Record<string, Equipment> = {
  // ===== 武器 =====

  // 如意金箍棒 - 悟空神器，Boss掉落
  RUYI_JINGU_BANG: {
    id: 'ruyi_jingu_bang',
    name: '如意金箍棒',
    type: EquipmentType.WEAPON,
    rarity: Rarity.LEGENDARY,
    wuxing: Wuxing.METAL,
    wuxingLevel: 3,
    attack: 6,
    speed: 2,
    upgradeLevel: 0,
    skill: {
      id: 'skill_dinghai',
      name: '定海',
      description: '30%几率造成双倍伤害',
      trigger: SkillTrigger.ON_HIT,
      triggerChance: 0.3,
      damageMultiplier: 2.0,
    },
  },

  // 九齿钉耙 - 八戒神器，Boss掉落
  JIUCHI_DINGPA: {
    id: 'jiuchi_dingpa',
    name: '九齿钉耙',
    type: EquipmentType.WEAPON,
    rarity: Rarity.EPIC,
    wuxing: Wuxing.WOOD,
    wuxingLevel: 2,
    attack: 5,
    speed: 0,
    upgradeLevel: 0,
    skill: {
      id: 'skill_tanchi',
      name: '贪吃',
      description: '攻击时20%几率回复1点HP',
      trigger: SkillTrigger.ON_HIT,
      triggerChance: 0.2,
      heal: 1,
    },
  },

  // 降妖宝杖 - 沙僧神器，Boss掉落
  XIANGYAO_BAOZHANG: {
    id: 'xiangyao_baozhang',
    name: '降妖宝杖',
    type: EquipmentType.WEAPON,
    rarity: Rarity.EPIC,
    wuxing: Wuxing.WATER,
    wuxingLevel: 2,
    attack: 4,
    defense: 2,
    speed: 1,
    upgradeLevel: 0,
    skill: {
      id: 'skill_liusha',
      name: '流沙',
      description: '被动增加2点防御',
      trigger: SkillTrigger.PASSIVE,
      defenseBonus: 2,
    },
  },

  // ===== 法宝 =====

  // 紫金红葫芦 - 合成获得
  ZIJIN_HULU: {
    id: 'zijin_hulu',
    name: '紫金红葫芦',
    type: EquipmentType.TREASURE,
    rarity: Rarity.LEGENDARY,
    wuxing: Wuxing.FIRE,
    wuxingLevel: 3,
    attack: 3,
    speed: 1,
    upgradeLevel: 0,
    skill: {
      id: 'skill_shou',
      name: '收',
      description: '战斗开始时对敌人造成2点伤害',
      trigger: SkillTrigger.BATTLE_START,
      damage: 2,
    },
  },

  // 芭蕉扇 - 合成获得
  BAJIAO_SHAN: {
    id: 'bajiao_shan',
    name: '芭蕉扇',
    type: EquipmentType.TREASURE,
    rarity: Rarity.EPIC,
    wuxing: Wuxing.FIRE,
    wuxingLevel: 2,
    attack: 4,
    speed: 2,
    upgradeLevel: 0,
    skill: {
      id: 'skill_shanfeng',
      name: '煽风',
      description: '火属性五行等级+2',
      trigger: SkillTrigger.PASSIVE,
      wuxingLevelBonus: 2,
      wuxing: Wuxing.FIRE,
    },
  },

  // 照妖镜 - 合成获得
  ZHAOYAO_JING: {
    id: 'zhaoyao_jing',
    name: '照妖镜',
    type: EquipmentType.TREASURE,
    rarity: Rarity.RARE,
    wuxing: Wuxing.METAL,
    wuxingLevel: 2,
    attack: 2,
    speed: 1,
    upgradeLevel: 0,
    skill: {
      id: 'skill_zhaoyao',
      name: '照妖',
      description: '攻击时无视1点防御',
      trigger: SkillTrigger.PASSIVE,
      ignoreDefense: 1,
    },
  },

  // 金刚琢 - 合成获得
  JINGANG_ZHUO: {
    id: 'jingang_zhuo',
    name: '金刚琢',
    type: EquipmentType.TREASURE,
    rarity: Rarity.LEGENDARY,
    wuxing: Wuxing.METAL,
    wuxingLevel: 3,
    attack: 3,
    defense: 2,
    speed: 1,
    upgradeLevel: 0,
    skill: {
      id: 'skill_jiaoxie',
      name: '缴械',
      description: '被攻击时25%几率使敌人本回合攻击-2',
      trigger: SkillTrigger.ON_DEFEND,
      triggerChance: 0.25,
      attackBonus: -2, // 负值表示减少敌人攻击
    },
  },

  // 定海神珠 - Boss掉落
  DINGHAI_SHENZHU: {
    id: 'dinghai_shenzhu',
    name: '定海神珠',
    type: EquipmentType.TREASURE,
    rarity: Rarity.LEGENDARY,
    wuxing: Wuxing.WATER,
    wuxingLevel: 3,
    attack: 2,
    defense: 3,
    speed: 0,
    upgradeLevel: 0,
    skill: {
      id: 'skill_dinghai_zhu',
      name: '定海',
      description: '水属性五行等级+3',
      trigger: SkillTrigger.PASSIVE,
      wuxingLevelBonus: 3,
      wuxing: Wuxing.WATER,
    },
  },

  // ===== 铠甲 =====

  // 锦斓袈裟 - 合成获得
  JINLAN_JIASHA: {
    id: 'jinlan_jiasha',
    name: '锦斓袈裟',
    type: EquipmentType.ARMOR,
    rarity: Rarity.LEGENDARY,
    wuxing: Wuxing.EARTH,
    wuxingLevel: 3,
    defense: 5,
    speed: 0,
    upgradeLevel: 0,
    skill: {
      id: 'skill_foguang',
      name: '佛光',
      description: '战斗开始时回复2点HP',
      trigger: SkillTrigger.BATTLE_START,
      heal: 2,
    },
  },

  // 藕丝步云履 - 合成获得
  OUSI_BUYUNLV: {
    id: 'ousi_buyunlv',
    name: '藕丝步云履',
    type: EquipmentType.ARMOR,
    rarity: Rarity.EPIC,
    wuxing: Wuxing.WATER,
    wuxingLevel: 2,
    defense: 3,
    speed: 3,
    upgradeLevel: 0,
    skill: {
      id: 'skill_buyun',
      name: '步云',
      description: '被攻击时30%几率闪避',
      trigger: SkillTrigger.ON_DEFEND,
      triggerChance: 0.3,
      dodge: true,
    },
  },

  // 紧箍咒 - Boss掉落（双刃剑）
  JINGU_ZHOU: {
    id: 'jingu_zhou',
    name: '紧箍咒',
    type: EquipmentType.ARMOR,
    rarity: Rarity.LEGENDARY,
    wuxing: Wuxing.EARTH,
    wuxingLevel: 2,
    defense: 2,
    attack: 4,
    speed: 0,
    upgradeLevel: 0,
    skill: {
      id: 'skill_jingu',
      name: '紧箍',
      description: '攻击+4，但每回合自损1点HP',
      trigger: SkillTrigger.PASSIVE,
      attackBonus: 4,
      selfDamage: 1,
    },
  },

  // 玄冰铠 - 合成获得（原有的）
  XUANBING_KAI: {
    id: 'xuanbing_kai',
    name: '玄冰铠',
    type: EquipmentType.ARMOR,
    rarity: Rarity.EPIC,
    wuxing: Wuxing.WATER,
    wuxingLevel: 3,
    defense: 5,
    speed: 0,
    upgradeLevel: 0,
    skill: {
      id: 'skill_xuanbing',
      name: '玄冰',
      description: '被攻击时20%几率冻结敌人，使其下回合无法攻击',
      trigger: SkillTrigger.ON_DEFEND,
      triggerChance: 0.2,
    },
  },

  // 炎龙剑 - 合成获得（原有的）
  YANLONG_JIAN: {
    id: 'yanlong_jian',
    name: '炎龙剑',
    type: EquipmentType.WEAPON,
    rarity: Rarity.EPIC,
    wuxing: Wuxing.FIRE,
    wuxingLevel: 3,
    attack: 5,
    speed: 2,
    upgradeLevel: 0,
    skill: {
      id: 'skill_yanlong',
      name: '炎龙',
      description: '攻击时25%几率灼烧敌人，额外造成1点伤害',
      trigger: SkillTrigger.ON_HIT,
      triggerChance: 0.25,
      damage: 1,
    },
  },
};

/**
 * 特殊合成配方
 */
export interface SpecialRecipe {
  id: string;
  name: string;
  description: string;
  // 配方条件
  conditions: RecipeCondition[];
  // 产出装备ID
  resultId: string;
  // 合成成功率（1.0 = 100%）
  successRate: number;
}

export interface RecipeCondition {
  // 条件类型
  type: 'name' | 'wuxing' | 'type' | 'rarity';
  // 匹配值
  value: string;
  // 需要数量
  count?: number;
}

export const SPECIAL_RECIPES: SpecialRecipe[] = [
  // ===== 西游神器合成 =====
  {
    id: 'recipe_zijin_hulu',
    name: '紫金红葫芦',
    description: '2件史诗火属性法宝',
    conditions: [
      { type: 'wuxing', value: Wuxing.FIRE },
      { type: 'type', value: EquipmentType.TREASURE },
      { type: 'rarity', value: Rarity.EPIC },
    ],
    resultId: 'zijin_hulu',
    successRate: 1.0,
  },
  {
    id: 'recipe_bajiao_shan',
    name: '芭蕉扇',
    description: '2件火属性法宝（稀有以上）',
    conditions: [
      { type: 'wuxing', value: Wuxing.FIRE },
      { type: 'type', value: EquipmentType.TREASURE },
    ],
    resultId: 'bajiao_shan',
    successRate: 0.8,
  },
  {
    id: 'recipe_zhaoyao_jing',
    name: '照妖镜',
    description: '2件金属性法宝',
    conditions: [
      { type: 'wuxing', value: Wuxing.METAL },
      { type: 'type', value: EquipmentType.TREASURE },
    ],
    resultId: 'zhaoyao_jing',
    successRate: 0.7,
  },
  {
    id: 'recipe_jingang_zhuo',
    name: '金刚琢',
    description: '1件传说金属性 + 1件史诗金属性',
    conditions: [
      { type: 'wuxing', value: Wuxing.METAL },
    ],
    resultId: 'jingang_zhuo',
    successRate: 1.0,
  },
  {
    id: 'recipe_jinlan_jiasha',
    name: '锦斓袈裟',
    description: '2件史诗土属性铠甲',
    conditions: [
      { type: 'wuxing', value: Wuxing.EARTH },
      { type: 'type', value: EquipmentType.ARMOR },
      { type: 'rarity', value: Rarity.EPIC },
    ],
    resultId: 'jinlan_jiasha',
    successRate: 1.0,
  },
  {
    id: 'recipe_ousi_buyunlv',
    name: '藕丝步云履',
    description: '2件水属性铠甲（稀有以上）',
    conditions: [
      { type: 'wuxing', value: Wuxing.WATER },
      { type: 'type', value: EquipmentType.ARMOR },
    ],
    resultId: 'ousi_buyunlv',
    successRate: 0.7,
  },
  {
    id: 'recipe_xuanbing_kai',
    name: '玄冰铠',
    description: '水甲 + 水镜',
    conditions: [
      { type: 'name', value: '水甲' },
      { type: 'name', value: '水镜' },
    ],
    resultId: 'xuanbing_kai',
    successRate: 1.0,
  },
  {
    id: 'recipe_yanlong_jian',
    name: '炎龙剑',
    description: '火剑 + 火珠',
    conditions: [
      { type: 'name', value: '火剑' },
      { type: 'name', value: '火珠' },
    ],
    resultId: 'yanlong_jian',
    successRate: 1.0,
  },
];

/**
 * Boss掉落表
 */
export interface BossDrop {
  bossId: string;
  bossName: string;
  // 可掉落的装备ID列表
  drops: {
    equipmentId: string;
    dropRate: number; // 0-1
  }[];
}

export const BOSS_DROPS: BossDrop[] = [
  {
    bossId: 'boss_wukong',
    bossName: '齐天大圣',
    drops: [
      { equipmentId: 'ruyi_jingu_bang', dropRate: 0.3 },
      { equipmentId: 'jingu_zhou', dropRate: 0.2 },
    ],
  },
  {
    bossId: 'boss_bajie',
    bossName: '天蓬元帅',
    drops: [
      { equipmentId: 'jiuchi_dingpa', dropRate: 0.4 },
    ],
  },
  {
    bossId: 'boss_wujing',
    bossName: '卷帘大将',
    drops: [
      { equipmentId: 'xiangyao_baozhang', dropRate: 0.4 },
    ],
  },
  {
    bossId: 'boss_dragon',
    bossName: '龙王',
    drops: [
      { equipmentId: 'dinghai_shenzhu', dropRate: 0.25 },
      { equipmentId: 'ruyi_jingu_bang', dropRate: 0.15 },
    ],
  },
  {
    bossId: 'boss_final',
    bossName: '混世魔王',
    drops: [
      { equipmentId: 'ruyi_jingu_bang', dropRate: 0.2 },
      { equipmentId: 'jingang_zhuo', dropRate: 0.2 },
      { equipmentId: 'zijin_hulu', dropRate: 0.2 },
      { equipmentId: 'jinlan_jiasha', dropRate: 0.2 },
    ],
  },
];

/**
 * 获取传说装备
 */
export function getLegendaryEquipment(id: string): Equipment | null {
  const key = id.toUpperCase().replace(/-/g, '_');
  return LEGENDARY_EQUIPMENT[key] || Object.values(LEGENDARY_EQUIPMENT).find(e => e.id === id) || null;
}

/**
 * 检查两件装备是否匹配配方
 */
export function checkRecipe(item1: Equipment, item2: Equipment): SpecialRecipe | null {
  for (const recipe of SPECIAL_RECIPES) {
    if (matchesRecipe(item1, item2, recipe)) {
      return recipe;
    }
  }
  return null;
}

function matchesRecipe(item1: Equipment, item2: Equipment, recipe: SpecialRecipe): boolean {
  const items = [item1, item2];

  // 检查名称条件（需要两个不同名称都匹配）
  const nameConditions = recipe.conditions.filter(c => c.type === 'name');
  if (nameConditions.length === 2) {
    const name1 = nameConditions[0].value;
    const name2 = nameConditions[1].value;
    const hasName1 = items.some(i => i.name.includes(name1));
    const hasName2 = items.some(i => i.name.includes(name2));
    return hasName1 && hasName2;
  }

  // 检查其他条件（两件装备都需要满足）
  for (const condition of recipe.conditions) {
    if (condition.type === 'name') continue;

    const allMatch = items.every(item => {
      switch (condition.type) {
        case 'wuxing':
          return item.wuxing === condition.value;
        case 'type':
          return item.type === condition.value;
        case 'rarity':
          return item.rarity === condition.value || isHigherRarity(item.rarity, condition.value as Rarity);
        default:
          return false;
      }
    });

    if (!allMatch) return false;
  }

  return true;
}

function isHigherRarity(actual: Rarity, minimum: Rarity): boolean {
  const order = [Rarity.COMMON, Rarity.UNCOMMON, Rarity.RARE, Rarity.EPIC, Rarity.LEGENDARY];
  return order.indexOf(actual) > order.indexOf(minimum);
}
