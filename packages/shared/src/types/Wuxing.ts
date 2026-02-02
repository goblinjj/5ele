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

/**
 * 五行被动特性配置
 */
export interface WuxingPassiveConfig {
  level: number;

  // 金属性 - 穿透破防、流血
  ignoreDefensePercent?: number;  // 无视防御百分比
  bleedChance?: number;           // 流血概率 (%)
  bleedDamagePercent?: number;    // 流血伤害 (最大生命值%)
  bleedDoubled?: boolean;         // 流血伤害翻倍

  // 木属性 - 持续回复、韧性
  regenPercent?: number;          // 每回合回复 (最大生命值%)
  regenDoubleWhenLow?: boolean;   // 低血量(30%以下)时回复翻倍
  surviveLethal?: boolean;        // 致命伤害保留1HP (每回合一次)
  canRevive?: boolean;            // 可以复活
  reviveHpPercent?: number;       // 复活血量百分比

  // 水属性 - 控制减速、冻结
  slowChance?: number;            // 减速概率 (%)
  slowSpeedReduction?: number;    // 减速量 (%)
  slowDuration?: number;          // 减速持续回合
  slowedDamageBonus?: number;     // 对减速目标伤害加成 (%)
  freezeChance?: number;          // 冻结概率 (%)
  freezeShatterDamage?: number;   // 冻结破碎伤害 (攻击力%)

  // 火属性 - 灼烧DoT、引爆
  burnDamagePercent?: number;     // 灼烧伤害 (最大生命值%)
  burnDuration?: number;          // 灼烧持续回合
  burnStackable?: boolean;        // 灼烧可叠加 (最多3层)
  burnExplodeDamage?: number;     // 3层引爆伤害 (最大生命值%)
  emberDebuff?: boolean;          // 引爆后余烬debuff (火伤害+50%)

  // 土属性 - 减伤、反弹
  damageReduction?: number;       // 受伤减免 (%)
  reflectPercent?: number;        // 反弹伤害 (%)
  controlImmune?: boolean;        // 免疫控制 (HP>70%时)
  revengeStacks?: number;         // 蓄力攻击需要承受次数
  revengeDamageBonus?: number;    // 蓄力攻击伤害加成 (%)
}

/**
 * 五行被动配置表 (等级1-5)
 */
export const WUXING_PASSIVE_CONFIG: Record<Wuxing, WuxingPassiveConfig[]> = {
  // 金 - 锋锐之道
  [Wuxing.METAL]: [
    { level: 1, ignoreDefensePercent: 10 },
    { level: 2, ignoreDefensePercent: 20 },
    { level: 3, ignoreDefensePercent: 35, bleedChance: 15, bleedDamagePercent: 5 },
    { level: 4, ignoreDefensePercent: 50, bleedChance: 25, bleedDamagePercent: 5 },
    { level: 5, ignoreDefensePercent: 70, bleedChance: 100, bleedDamagePercent: 10, bleedDoubled: true },
  ],
  // 木 - 生生不息
  [Wuxing.WOOD]: [
    { level: 1, regenPercent: 3 },
    { level: 2, regenPercent: 5 },
    { level: 3, regenPercent: 8, surviveLethal: true },
    { level: 4, regenPercent: 12, surviveLethal: true, regenDoubleWhenLow: true },
    { level: 5, regenPercent: 15, surviveLethal: true, regenDoubleWhenLow: true, canRevive: true, reviveHpPercent: 50 },
  ],
  // 水 - 寒冰掌控
  [Wuxing.WATER]: [
    { level: 1, slowChance: 15, slowSpeedReduction: 20, slowDuration: 2 },
    { level: 2, slowChance: 25, slowSpeedReduction: 30, slowDuration: 2 },
    { level: 3, slowChance: 35, slowSpeedReduction: 30, slowDuration: 2, slowedDamageBonus: 15 },
    { level: 4, slowChance: 35, slowSpeedReduction: 30, slowDuration: 2, slowedDamageBonus: 15, freezeChance: 20 },
    { level: 5, slowChance: 35, slowSpeedReduction: 30, slowDuration: 2, slowedDamageBonus: 15, freezeChance: 30, freezeShatterDamage: 100 },
  ],
  // 火 - 焚天烈焰
  [Wuxing.FIRE]: [
    { level: 1, burnDamagePercent: 3, burnDuration: 2 },
    { level: 2, burnDamagePercent: 5, burnDuration: 3 },
    { level: 3, burnDamagePercent: 5, burnDuration: 3, burnStackable: true },
    { level: 4, burnDamagePercent: 5, burnDuration: 3, burnStackable: true, burnExplodeDamage: 20 },
    { level: 5, burnDamagePercent: 8, burnDuration: 3, burnStackable: true, burnExplodeDamage: 35, emberDebuff: true },
  ],
  // 土 - 厚德载物
  [Wuxing.EARTH]: [
    { level: 1, damageReduction: 10 },
    { level: 2, damageReduction: 18 },
    { level: 3, damageReduction: 25, reflectPercent: 15 },
    { level: 4, damageReduction: 35, reflectPercent: 25, controlImmune: true },
    { level: 5, damageReduction: 45, reflectPercent: 40, controlImmune: true, revengeStacks: 3, revengeDamageBonus: 100 },
  ],
};

/**
 * 获取五行被动配置
 */
export function getWuxingPassiveConfig(wuxing: Wuxing, level: number): WuxingPassiveConfig | null {
  const configs = WUXING_PASSIVE_CONFIG[wuxing];
  const clampedLevel = Math.max(1, Math.min(5, level));
  return configs[clampedLevel - 1] || null;
}

/**
 * 五行克制加成 (按攻击方等级)
 */
export const WUXING_CONQUER_BONUS: Record<number, { damageBonus: number; resistReduction: number }> = {
  1: { damageBonus: 0.20, resistReduction: 0.10 },
  2: { damageBonus: 0.30, resistReduction: 0.15 },
  3: { damageBonus: 0.40, resistReduction: 0.20 },
  4: { damageBonus: 0.55, resistReduction: 0.25 },
  5: { damageBonus: 0.75, resistReduction: 0.30 },
};
