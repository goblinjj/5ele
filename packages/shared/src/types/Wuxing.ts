/**
 * 五行类型
 */
export enum Wuxing {
  METAL = 'metal',   // 金
  WOOD = 'wood',     // 木
  WATER = 'water',   // 水
  FIRE = 'fire',     // 火
  EARTH = 'earth',   // 土
}

/**
 * 五行中文名称
 */
export const WUXING_NAMES: Record<Wuxing, string> = {
  [Wuxing.METAL]: '金',
  [Wuxing.WOOD]: '木',
  [Wuxing.WATER]: '水',
  [Wuxing.FIRE]: '火',
  [Wuxing.EARTH]: '土',
};

/**
 * 五行颜色
 */
export const WUXING_COLORS: Record<Wuxing, number> = {
  [Wuxing.METAL]: 0xffffff, // 白
  [Wuxing.WOOD]: 0x22c55e,  // 绿
  [Wuxing.WATER]: 0x3b82f6, // 蓝
  [Wuxing.FIRE]: 0xef4444,  // 红
  [Wuxing.EARTH]: 0xeab308, // 黄
};

/**
 * 五行速度修正
 * 火最快 (+2)，土最慢 (-2)
 */
export const WUXING_SPEED_MODIFIER: Record<Wuxing, number> = {
  [Wuxing.FIRE]: 2,
  [Wuxing.METAL]: 1,
  [Wuxing.WOOD]: 0,
  [Wuxing.WATER]: -1,
  [Wuxing.EARTH]: -2,
};

/**
 * 五行速度优先级（速度相同时的排序）
 */
export const WUXING_SPEED_PRIORITY: Record<Wuxing, number> = {
  [Wuxing.FIRE]: 5,
  [Wuxing.METAL]: 4,
  [Wuxing.WOOD]: 3,
  [Wuxing.WATER]: 2,
  [Wuxing.EARTH]: 1,
};

/**
 * 相克关系：金→木→土→水→火→金
 * 克制时伤害增加
 */
export const WUXING_CONQUERS: Record<Wuxing, Wuxing> = {
  [Wuxing.METAL]: Wuxing.WOOD,
  [Wuxing.WOOD]: Wuxing.EARTH,
  [Wuxing.EARTH]: Wuxing.WATER,
  [Wuxing.WATER]: Wuxing.FIRE,
  [Wuxing.FIRE]: Wuxing.METAL,
};

/**
 * 相生关系：金→水→木→火→土→金
 * 相生时会给对方回血！
 */
export const WUXING_GENERATES: Record<Wuxing, Wuxing> = {
  [Wuxing.METAL]: Wuxing.WATER,
  [Wuxing.WATER]: Wuxing.WOOD,
  [Wuxing.WOOD]: Wuxing.FIRE,
  [Wuxing.FIRE]: Wuxing.EARTH,
  [Wuxing.EARTH]: Wuxing.METAL,
};

/**
 * 五行等级
 */
export interface WuxingLevel {
  wuxing: Wuxing;
  level: number;
}

/**
 * 检查是否相克
 */
export function isConquering(attacker: Wuxing, defender: Wuxing): boolean {
  return WUXING_CONQUERS[attacker] === defender;
}

/**
 * 检查是否相生
 */
export function isGenerating(attacker: Wuxing, defender: Wuxing): boolean {
  return WUXING_GENERATES[attacker] === defender;
}

/**
 * 获取五行关系类型
 */
export type WuxingRelation = 'conquer' | 'generate' | 'neutral';

export function getWuxingRelation(attacker: Wuxing, defender: Wuxing): WuxingRelation {
  if (isConquering(attacker, defender)) return 'conquer';
  if (isGenerating(attacker, defender)) return 'generate';
  return 'neutral';
}
