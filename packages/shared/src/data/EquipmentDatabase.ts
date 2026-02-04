import { Equipment, EquipmentType, Rarity, RARITY_WUXING_LEVEL } from '../types/Equipment.js';
import { Wuxing } from '../types/Wuxing.js';
import { AttributeSkillId, randomSkillFromWuxing } from './AttributeSkillDatabase.js';

/**
 * 传说级装备（Boss掉落或特殊合成）
 */
export const LEGENDARY_EQUIPMENT: Record<string, Equipment> = {
  // ===== 武器 =====

  // 如意金箍棒 - 悟空神器
  RUYI_JINGU_BANG: {
    id: 'ruyi_jingu_bang',
    name: '如意金箍棒',
    type: EquipmentType.WEAPON,
    rarity: Rarity.LEGENDARY,
    wuxing: Wuxing.METAL,
    wuxingLevel: 5,
    attack: 6,
    speed: 2,
    upgradeLevel: 2,
    attributeSkills: [AttributeSkillId.RUIDU, AttributeSkillId.FENGMANG, AttributeSkillId.POJIA],
  },

  // 九齿钉耙 - 八戒神器
  JIUCHI_DINGPA: {
    id: 'jiuchi_dingpa',
    name: '九齿钉耙',
    type: EquipmentType.WEAPON,
    rarity: Rarity.EPIC,
    wuxing: Wuxing.WOOD,
    wuxingLevel: 4,
    attack: 5,
    speed: 0,
    upgradeLevel: 1,
    attributeSkills: [AttributeSkillId.GENJI, AttributeSkillId.SHENGJI],
  },

  // 降妖宝杖 - 沙僧神器
  XIANGYAO_BAOZHANG: {
    id: 'xiangyao_baozhang',
    name: '降妖宝杖',
    type: EquipmentType.WEAPON,
    rarity: Rarity.EPIC,
    wuxing: Wuxing.WATER,
    wuxingLevel: 4,
    attack: 4,
    defense: 2,
    speed: 1,
    upgradeLevel: 1,
    attributeSkills: [AttributeSkillId.LINGDONG, AttributeSkillId.DONGCHA],
  },

  // 炎龙剑
  YANLONG_JIAN: {
    id: 'yanlong_jian',
    name: '炎龙剑',
    type: EquipmentType.WEAPON,
    rarity: Rarity.EPIC,
    wuxing: Wuxing.FIRE,
    wuxingLevel: 4,
    attack: 5,
    speed: 2,
    upgradeLevel: 1,
    attributeSkills: [AttributeSkillId.YANWEI, AttributeSkillId.LIAOYUAN],
  },

  // ===== 法宝 =====

  // 紫金红葫芦
  ZIJIN_HULU: {
    id: 'zijin_hulu',
    name: '紫金红葫芦',
    type: EquipmentType.TREASURE,
    rarity: Rarity.LEGENDARY,
    wuxing: Wuxing.FIRE,
    wuxingLevel: 5,
    attack: 3,
    speed: 1,
    upgradeLevel: 2,
    attributeSkills: [AttributeSkillId.YANWEI, AttributeSkillId.LIAOYUAN, AttributeSkillId.BAORAN],
  },

  // 芭蕉扇
  BAJIAO_SHAN: {
    id: 'bajiao_shan',
    name: '芭蕉扇',
    type: EquipmentType.TREASURE,
    rarity: Rarity.EPIC,
    wuxing: Wuxing.FIRE,
    wuxingLevel: 4,
    attack: 4,
    speed: 2,
    upgradeLevel: 1,
    attributeSkills: [AttributeSkillId.YANWEI, AttributeSkillId.FENYI],
  },

  // 照妖镜
  ZHAOYAO_JING: {
    id: 'zhaoyao_jing',
    name: '照妖镜',
    type: EquipmentType.TREASURE,
    rarity: Rarity.RARE,
    wuxing: Wuxing.METAL,
    wuxingLevel: 3,
    attack: 2,
    speed: 1,
    upgradeLevel: 1,
    attributeSkills: [AttributeSkillId.POJIA, AttributeSkillId.SHAYI],
  },

  // 金刚琢
  JINGANG_ZHUO: {
    id: 'jingang_zhuo',
    name: '金刚琢',
    type: EquipmentType.TREASURE,
    rarity: Rarity.LEGENDARY,
    wuxing: Wuxing.METAL,
    wuxingLevel: 5,
    attack: 3,
    defense: 2,
    speed: 1,
    upgradeLevel: 2,
    attributeSkills: [AttributeSkillId.RUIDU, AttributeSkillId.FENGMANG, AttributeSkillId.HANFENG],
  },

  // 定海神珠
  DINGHAI_SHENZHU: {
    id: 'dinghai_shenzhu',
    name: '定海神珠',
    type: EquipmentType.TREASURE,
    rarity: Rarity.LEGENDARY,
    wuxing: Wuxing.WATER,
    wuxingLevel: 5,
    attack: 2,
    defense: 3,
    speed: 0,
    upgradeLevel: 2,
    attributeSkills: [AttributeSkillId.LINGDONG, AttributeSkillId.NINGZHI, AttributeSkillId.XUANBING],
  },

  // ===== 铠甲 =====

  // 锦斓袈裟
  JINLAN_JIASHA: {
    id: 'jinlan_jiasha',
    name: '锦斓袈裟',
    type: EquipmentType.ARMOR,
    rarity: Rarity.LEGENDARY,
    wuxing: Wuxing.EARTH,
    wuxingLevel: 5,
    defense: 5,
    speed: 0,
    upgradeLevel: 2,
    attributeSkills: [AttributeSkillId.JIANBI, AttributeSkillId.HOUTU, AttributeSkillId.FANZHEN],
  },

  // 藕丝步云履
  OUSI_BUYUNLV: {
    id: 'ousi_buyunlv',
    name: '藕丝步云履',
    type: EquipmentType.ARMOR,
    rarity: Rarity.EPIC,
    wuxing: Wuxing.WATER,
    wuxingLevel: 4,
    defense: 3,
    speed: 3,
    upgradeLevel: 1,
    attributeSkills: [AttributeSkillId.LINGDONG, AttributeSkillId.RUNZE],
  },

  // 紧箍咒
  JINGU_ZHOU: {
    id: 'jingu_zhou',
    name: '紧箍咒',
    type: EquipmentType.ARMOR,
    rarity: Rarity.LEGENDARY,
    wuxing: Wuxing.EARTH,
    wuxingLevel: 5,
    defense: 2,
    attack: 4,
    speed: 0,
    upgradeLevel: 1,
    attributeSkills: [AttributeSkillId.JIANBI, AttributeSkillId.XUSHI],
  },

  // 玄冰铠
  XUANBING_KAI: {
    id: 'xuanbing_kai',
    name: '玄冰铠',
    type: EquipmentType.ARMOR,
    rarity: Rarity.EPIC,
    wuxing: Wuxing.WATER,
    wuxingLevel: 4,
    defense: 5,
    speed: 0,
    upgradeLevel: 1,
    attributeSkills: [AttributeSkillId.LINGDONG, AttributeSkillId.XUANBING],
  },
};

/**
 * 特殊合成配方
 */
export interface SpecialRecipe {
  id: string;
  name: string;
  description: string;
  conditions: RecipeCondition[];
  resultId: string;
  successRate: number;
}

export interface RecipeCondition {
  type: 'name' | 'wuxing' | 'type' | 'rarity';
  value: string;
  count?: number;
}

export const SPECIAL_RECIPES: SpecialRecipe[] = [
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
  drops: {
    equipmentId: string;
    dropRate: number;
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

  const nameConditions = recipe.conditions.filter(c => c.type === 'name');
  if (nameConditions.length === 2) {
    const name1 = nameConditions[0].value;
    const name2 = nameConditions[1].value;
    const hasName1 = items.some(i => i.name.includes(name1));
    const hasName2 = items.some(i => i.name.includes(name2));
    return hasName1 && hasName2;
  }

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

/**
 * 为装备添加一个新技能（强化时调用）
 */
export function addRandomSkillToEquipment(equipment: Equipment): boolean {
  // 无五行装备不能添加技能
  if (!equipment.wuxing) return false;

  const existingSkills = equipment.attributeSkills ?? [];
  if (existingSkills.length >= 5) return false; // 已满

  const newSkill = randomSkillFromWuxing(equipment.wuxing, existingSkills);
  if (!newSkill) return false; // 没有可选技能了

  if (!equipment.attributeSkills) {
    equipment.attributeSkills = [];
  }
  equipment.attributeSkills.push(newSkill);
  return true;
}

/**
 * 创建一件基础装备
 */
export function createBaseEquipment(
  id: string,
  name: string,
  type: EquipmentType,
  rarity: Rarity,
  wuxing: Wuxing,
  stats: { attack?: number; defense?: number; speed?: number }
): Equipment {
  const wuxingLevel = RARITY_WUXING_LEVEL[rarity];
  const firstSkill = randomSkillFromWuxing(wuxing);

  return {
    id,
    name,
    type,
    rarity,
    wuxing,
    wuxingLevel,
    attack: stats.attack,
    defense: stats.defense,
    speed: stats.speed,
    upgradeLevel: 0,
    attributeSkills: firstSkill ? [firstSkill] : [],
  };
}
