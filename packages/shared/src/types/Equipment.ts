import { Wuxing, WuxingLevel } from './Wuxing.js';

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
 * 技能触发类型
 */
export enum SkillTrigger {
  PASSIVE = 'passive',           // 被动，始终生效
  ON_HIT = 'onHit',              // 攻击时触发
  ON_DEFEND = 'onDefend',        // 被攻击时触发
  BATTLE_START = 'battleStart',  // 战斗开始时触发
  BATTLE_END = 'battleEnd',      // 战斗结束时触发
}

/**
 * 技能定义
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  trigger: SkillTrigger;

  // 触发概率（0-1，仅对触发型技能有效）
  triggerChance?: number;

  // 效果
  damage?: number;           // 造成伤害
  heal?: number;             // 回复生命
  selfDamage?: number;       // 自损（黑魔法）
  attackBonus?: number;      // 攻击加成
  defenseBonus?: number;     // 防御加成
  wuxingLevelBonus?: number; // 五行等级加成
  damageMultiplier?: number; // 伤害倍率（如2.0表示双倍伤害）
  ignoreDefense?: number;    // 无视防御
  dodge?: boolean;           // 闪避

  // 五行相关
  wuxing?: Wuxing;
}

/**
 * 装备定义
 */
export interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  rarity: Rarity;

  // 五行属性
  wuxing: Wuxing;
  wuxingLevel: number;

  // 基础属性（低数值系统）
  attack?: number;   // 攻击力 1-10
  defense?: number;  // 防御力 1-10
  speed?: number;    // 速度 0-3

  // 附带技能
  skill?: Skill;

  // 升级等级
  upgradeLevel: number;
}

/**
 * 玩家装备栏
 */
export interface PlayerEquipment {
  weapon: Equipment | null;     // 武器 x1
  armor: Equipment | null;      // 铠甲 x1
  treasures: Equipment[];       // 法宝 x5-8
}

/**
 * 计算玩家的攻击五行等级
 */
export function getAttackWuxing(equipment: PlayerEquipment): WuxingLevel | null {
  if (!equipment.weapon) return null;

  let level = equipment.weapon.wuxingLevel;

  // 铠甲同属性加成
  if (equipment.armor?.wuxing === equipment.weapon.wuxing) {
    level += equipment.armor.wuxingLevel;
  }

  // 法宝同属性加成
  for (const treasure of equipment.treasures) {
    if (treasure.wuxing === equipment.weapon.wuxing) {
      level += treasure.wuxingLevel;
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
  if (!equipment.armor) return null;

  let level = equipment.armor.wuxingLevel;

  // 法宝同属性加成
  for (const treasure of equipment.treasures) {
    if (treasure.wuxing === equipment.armor.wuxing) {
      level += treasure.wuxingLevel;
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
