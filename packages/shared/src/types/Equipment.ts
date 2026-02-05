import { Wuxing, WuxingLevel } from './Wuxing.js';
import { AttributeSkillId } from '../data/AttributeSkillDatabase.js';

/**
 * 装备类型
 */
export enum EquipmentType {
  WEAPON = 'weapon',     // 武器
  ARMOR = 'armor',       // 铠甲
  TREASURE = 'treasure', // 法宝
}

/**
 * 装备稀有度
 */
export enum Rarity {
  COMMON = 'common',       // 普通
  UNCOMMON = 'uncommon',   // 优秀
  RARE = 'rare',           // 稀有
  EPIC = 'epic',           // 史诗
  LEGENDARY = 'legendary', // 传说
}

/**
 * 品质对应的五行等级
 */
export const RARITY_WUXING_LEVEL: Record<Rarity, number> = {
  [Rarity.COMMON]: 1,
  [Rarity.UNCOMMON]: 2,
  [Rarity.RARE]: 3,
  [Rarity.EPIC]: 4,
  [Rarity.LEGENDARY]: 5,
};

/**
 * 装备定义
 */
export interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  rarity: Rarity;

  // 五行属性（可选，初始武器无五行）
  wuxing?: Wuxing;
  wuxingLevel?: number;  // 由品质决定，1-5

  // 基础属性（低数值系统）
  attack?: number;   // 攻击力 1-10
  defense?: number;  // 防御力 1-10
  speed?: number;    // 速度 0-3
  hp?: number;       // 生命值加成 1-10

  // 属性技能列表（新系统，可选）
  attributeSkills?: AttributeSkillId[];

  // 强化等级 +0~+4，决定技能数量上限
  upgradeLevel: number;
}

/**
 * 玩家装备栏
 */
export interface PlayerEquipment {
  weapon: Equipment | null;     // 武器 x1
  armor: Equipment | null;      // 铠甲 x1
  treasures: Equipment[];       // 法宝 x5
}

/**
 * 计算玩家的攻击五行等级
 */
export function getAttackWuxing(equipment: PlayerEquipment): WuxingLevel | null {
  // 无武器或武器无五行属性
  if (!equipment.weapon || equipment.weapon.wuxing === undefined) return null;

  let level = equipment.weapon.wuxingLevel ?? 1;

  // 铠甲同属性加成
  if (equipment.armor?.wuxing === equipment.weapon.wuxing) {
    level += equipment.armor.wuxingLevel ?? 1;
  }

  // 法宝同属性加成
  for (const treasure of equipment.treasures) {
    if (treasure.wuxing === equipment.weapon.wuxing) {
      level += treasure.wuxingLevel ?? 1;
    }
  }

  return {
    wuxing: equipment.weapon.wuxing,
    level,
  };
}

/**
 * 计算玩家的防御五行等级
 */
export function getDefenseWuxing(equipment: PlayerEquipment): WuxingLevel | null {
  // 无铠甲或铠甲无五行属性
  if (!equipment.armor || equipment.armor.wuxing === undefined) return null;

  let level = equipment.armor.wuxingLevel ?? 1;

  // 法宝同属性加成
  for (const treasure of equipment.treasures) {
    if (treasure.wuxing === equipment.armor.wuxing) {
      level += treasure.wuxingLevel ?? 1;
    }
  }

  return {
    wuxing: equipment.armor.wuxing,
    level,
  };
}

/**
 * 计算玩家总攻击力
 */
export function getTotalAttack(equipment: PlayerEquipment): number {
  let attack = equipment.weapon?.attack ?? 0;

  for (const treasure of equipment.treasures) {
    attack += treasure.attack ?? 0;
  }

  return attack;
}

/**
 * 计算玩家总防御力
 */
export function getTotalDefense(equipment: PlayerEquipment): number {
  let defense = equipment.armor?.defense ?? 0;

  for (const treasure of equipment.treasures) {
    defense += treasure.defense ?? 0;
  }

  return defense;
}

/**
 * 计算玩家总速度
 */
export function getTotalSpeed(equipment: PlayerEquipment): number {
  let speed = equipment.weapon?.speed ?? 0;
  speed += equipment.armor?.speed ?? 0;

  for (const treasure of equipment.treasures) {
    speed += treasure.speed ?? 0;
  }

  return speed;
}

/**
 * 计算装备提供的总生命值
 */
export function getTotalEquipmentHp(equipment: PlayerEquipment): number {
  let hp = equipment.weapon?.hp ?? 0;
  hp += equipment.armor?.hp ?? 0;

  for (const treasure of equipment.treasures) {
    hp += treasure.hp ?? 0;
  }

  return hp;
}

/**
 * 计算所有装备的五行等级汇总
 * 统计武器+铠甲+所有法宝的五行，相同五行等级相加（上限10）
 */
export function getAllWuxingLevels(equipment: PlayerEquipment): Map<Wuxing, number> {
  const wuxingLevels = new Map<Wuxing, number>();

  // 武器
  if (equipment.weapon?.wuxing !== undefined) {
    const level = equipment.weapon.wuxingLevel ?? 1;
    wuxingLevels.set(equipment.weapon.wuxing, (wuxingLevels.get(equipment.weapon.wuxing) ?? 0) + level);
  }

  // 铠甲
  if (equipment.armor?.wuxing !== undefined) {
    const level = equipment.armor.wuxingLevel ?? 1;
    wuxingLevels.set(equipment.armor.wuxing, (wuxingLevels.get(equipment.armor.wuxing) ?? 0) + level);
  }

  // 法宝
  for (const treasure of equipment.treasures) {
    if (treasure.wuxing !== undefined) {
      const level = treasure.wuxingLevel ?? 1;
      wuxingLevels.set(treasure.wuxing, (wuxingLevels.get(treasure.wuxing) ?? 0) + level);
    }
  }

  // 上限10
  for (const [wuxing, level] of wuxingLevels) {
    wuxingLevels.set(wuxing, Math.min(10, level));
  }

  return wuxingLevels;
}

/**
 * 收集所有装备的属性技能（扁平化列表）
 */
export function getAllAttributeSkills(equipment: PlayerEquipment): AttributeSkillId[] {
  const skills: AttributeSkillId[] = [];

  if (equipment.weapon?.attributeSkills) {
    skills.push(...equipment.weapon.attributeSkills);
  }

  if (equipment.armor?.attributeSkills) {
    skills.push(...equipment.armor.attributeSkills);
  }

  for (const treasure of equipment.treasures) {
    if (treasure.attributeSkills) {
      skills.push(...treasure.attributeSkills);
    }
  }

  return skills;
}

