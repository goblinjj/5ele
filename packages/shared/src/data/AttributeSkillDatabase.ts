import { Wuxing } from '../types/Wuxing.js';

/**
 * 属性技能ID
 */
export enum AttributeSkillId {
  // 金属性
  RUIDU = 'ruidu',       // 锐度 - 暴击率
  FENGMANG = 'fengmang', // 锋芒 - 暴击伤害
  POJIA = 'pojia',       // 破甲 - 无视防御
  SHAYI = 'shayi',       // 杀意 - 斩杀加成
  HANFENG = 'hanfeng',   // 寒锋 - 暴击减速

  // 水属性
  LINGDONG = 'lingdong', // 灵动 - 闪避率
  DONGCHA = 'dongcha',   // 洞察 - 命中率
  NINGZHI = 'ningzhi',   // 凝滞 - 减速率
  XUANBING = 'xuanbing', // 玄冰 - 控制加伤
  RUNZE = 'runze',       // 润泽 - 闪避回血

  // 木属性
  GENJI = 'genji',       // 根基 - 最大生命
  SHENGJI = 'shengji',   // 生机 - 每回合回复
  RENXING = 'renxing',   // 韧性 - 低血减伤
  FENGCHUN = 'fengchun', // 逢春 - 致命保护
  NUMU = 'numu',         // 怒木 - 低血加攻

  // 火属性
  YANWEI = 'yanwei',     // 炎威 - 攻击力%
  LIAOYUAN = 'liaoyuan', // 燎原 - 灼烧率
  BAORAN = 'baoran',     // 暴燃 - 灼烧加伤
  FENYI = 'fenyi',       // 焚意 - 残血狂暴
  YUJIN = 'yujin',       // 余烬 - 受击灼敌

  // 土属性
  JIANBI = 'jianbi',     // 坚壁 - 防御力%
  PANSHI = 'panshi',     // 磐石 - 格挡率
  HOUTU = 'houtu',       // 厚土 - 固定减伤
  FANZHEN = 'fanzhen',   // 反震 - 反伤
  XUSHI = 'xushi',       // 蓄势 - 蓄力爆发
}

/**
 * 技能触发时机
 */
export enum SkillTrigger {
  BATTLE_INIT = 'battleInit',   // 战斗初始化（修改属性）
  TURN_START = 'turnStart',     // 回合开始
  ON_ATTACK = 'onAttack',       // 攻击判定时
  AFTER_ATTACK = 'afterAttack', // 攻击后（施加状态）
  ON_DEFEND = 'onDefend',       // 防御判定时
  AFTER_DEFEND = 'afterDefend', // 防御后（反击等）
  ON_LOW_HP = 'onLowHp',        // 低血量触发
}

/**
 * 技能定义
 */
export interface AttributeSkillDef {
  id: AttributeSkillId;
  name: string;
  description: string;
  wuxing: Wuxing;
  trigger: SkillTrigger;
  // 10级数值表，索引0=1级，索引9=10级
  values: number[];
}

/**
 * 金属性技能
 */
export const METAL_SKILLS: AttributeSkillDef[] = [
  {
    id: AttributeSkillId.RUIDU,
    name: '锐度',
    description: '暴击率+{value}%，暴击造成150%伤害',
    wuxing: Wuxing.METAL,
    trigger: SkillTrigger.ON_ATTACK,
    values: [5, 8, 11, 14, 17, 20, 23, 26, 29, 33],
  },
  {
    id: AttributeSkillId.FENGMANG,
    name: '锋芒',
    description: '暴击伤害+{value}%',
    wuxing: Wuxing.METAL,
    trigger: SkillTrigger.ON_ATTACK,
    values: [10, 15, 20, 25, 30, 36, 42, 48, 55, 65],
  },
  {
    id: AttributeSkillId.POJIA,
    name: '破甲',
    description: '无视目标{value}%防御',
    wuxing: Wuxing.METAL,
    trigger: SkillTrigger.ON_ATTACK,
    values: [5, 8, 11, 14, 17, 20, 23, 26, 29, 33],
  },
  {
    id: AttributeSkillId.SHAYI,
    name: '杀意',
    description: '对生命值低于30%的目标，伤害+{value}',
    wuxing: Wuxing.METAL,
    trigger: SkillTrigger.ON_ATTACK,
    values: [3, 5, 8, 11, 15, 19, 24, 29, 35, 42],
  },
  {
    id: AttributeSkillId.HANFENG,
    name: '寒锋',
    description: '暴击时{value}%概率使目标减速1回合',
    wuxing: Wuxing.METAL,
    trigger: SkillTrigger.AFTER_ATTACK,
    values: [10, 15, 20, 25, 30, 36, 42, 48, 55, 65],
  },
];

/**
 * 水属性技能
 */
export const WATER_SKILLS: AttributeSkillDef[] = [
  {
    id: AttributeSkillId.LINGDONG,
    name: '灵动',
    description: '闪避率+{value}%，闪避时完全规避伤害',
    wuxing: Wuxing.WATER,
    trigger: SkillTrigger.ON_DEFEND,
    values: [4, 6, 8, 10, 12, 14, 16, 18, 21, 25],
  },
  {
    id: AttributeSkillId.DONGCHA,
    name: '洞察',
    description: '命中率+{value}%，降低目标闪避效果',
    wuxing: Wuxing.WATER,
    trigger: SkillTrigger.ON_ATTACK,
    values: [5, 8, 11, 14, 17, 20, 23, 26, 29, 33],
  },
  {
    id: AttributeSkillId.NINGZHI,
    name: '凝滞',
    description: '攻击时{value}%概率使目标减速',
    wuxing: Wuxing.WATER,
    trigger: SkillTrigger.AFTER_ATTACK,
    values: [8, 12, 16, 20, 24, 28, 32, 36, 41, 48],
  },
  {
    id: AttributeSkillId.XUANBING,
    name: '玄冰',
    description: '对减速状态的敌人伤害+{value}%',
    wuxing: Wuxing.WATER,
    trigger: SkillTrigger.ON_ATTACK,
    values: [5, 8, 11, 14, 17, 21, 25, 29, 34, 40],
  },
  {
    id: AttributeSkillId.RUNZE,
    name: '润泽',
    description: '闪避成功时回复{value}%最大生命',
    wuxing: Wuxing.WATER,
    trigger: SkillTrigger.AFTER_DEFEND,
    values: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12],
  },
];

/**
 * 木属性技能
 */
export const WOOD_SKILLS: AttributeSkillDef[] = [
  {
    id: AttributeSkillId.GENJI,
    name: '根基',
    description: '最大生命值+{value}',
    wuxing: Wuxing.WOOD,
    trigger: SkillTrigger.BATTLE_INIT,
    values: [20, 35, 50, 70, 90, 115, 140, 170, 200, 240],
  },
  {
    id: AttributeSkillId.SHENGJI,
    name: '生机',
    description: '每回合回复{value}%最大生命',
    wuxing: Wuxing.WOOD,
    trigger: SkillTrigger.TURN_START,
    values: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12],
  },
  {
    id: AttributeSkillId.RENXING,
    name: '韧性',
    description: '生命低于30%时，受到伤害减少{value}%',
    wuxing: Wuxing.WOOD,
    trigger: SkillTrigger.ON_LOW_HP,
    values: [5, 8, 11, 14, 17, 20, 23, 26, 30, 35],
  },
  {
    id: AttributeSkillId.FENGCHUN,
    name: '逢春',
    description: '受到致命伤害时，{value}%概率保留1点生命（每场限1次）',
    wuxing: Wuxing.WOOD,
    trigger: SkillTrigger.ON_LOW_HP,
    values: [5, 8, 11, 14, 17, 21, 25, 29, 34, 40],
  },
  {
    id: AttributeSkillId.NUMU,
    name: '怒木',
    description: '生命低于50%时，攻击力+{value}%',
    wuxing: Wuxing.WOOD,
    trigger: SkillTrigger.ON_LOW_HP,
    values: [5, 8, 11, 14, 18, 22, 26, 30, 35, 42],
  },
];

/**
 * 火属性技能
 */
export const FIRE_SKILLS: AttributeSkillDef[] = [
  {
    id: AttributeSkillId.YANWEI,
    name: '炎威',
    description: '攻击力+{value}%',
    wuxing: Wuxing.FIRE,
    trigger: SkillTrigger.BATTLE_INIT,
    values: [5, 8, 11, 14, 17, 20, 24, 28, 32, 38],
  },
  {
    id: AttributeSkillId.LIAOYUAN,
    name: '燎原',
    description: '攻击时{value}%概率施加灼烧',
    wuxing: Wuxing.FIRE,
    trigger: SkillTrigger.AFTER_ATTACK,
    values: [10, 14, 18, 22, 26, 30, 34, 38, 43, 50],
  },
  {
    id: AttributeSkillId.BAORAN,
    name: '暴燃',
    description: '对灼烧状态的敌人伤害+{value}%',
    wuxing: Wuxing.FIRE,
    trigger: SkillTrigger.ON_ATTACK,
    values: [5, 8, 11, 14, 17, 21, 25, 29, 34, 40],
  },
  {
    id: AttributeSkillId.FENYI,
    name: '焚意',
    description: '生命越低，攻击力越高（最高+{value}%）',
    wuxing: Wuxing.FIRE,
    trigger: SkillTrigger.ON_ATTACK,
    values: [8, 12, 16, 20, 25, 30, 36, 42, 50, 60],
  },
  {
    id: AttributeSkillId.YUJIN,
    name: '余烬',
    description: '受到伤害时，{value}%概率使攻击者灼烧',
    wuxing: Wuxing.FIRE,
    trigger: SkillTrigger.AFTER_DEFEND,
    values: [8, 11, 14, 17, 20, 24, 28, 32, 37, 44],
  },
];

/**
 * 土属性技能
 */
export const EARTH_SKILLS: AttributeSkillDef[] = [
  {
    id: AttributeSkillId.JIANBI,
    name: '坚壁',
    description: '防御力+{value}%',
    wuxing: Wuxing.EARTH,
    trigger: SkillTrigger.BATTLE_INIT,
    values: [5, 8, 11, 14, 17, 20, 24, 28, 32, 38],
  },
  {
    id: AttributeSkillId.PANSHI,
    name: '磐石',
    description: '格挡率+{value}%，格挡时伤害减少50%',
    wuxing: Wuxing.EARTH,
    trigger: SkillTrigger.ON_DEFEND,
    values: [5, 7, 9, 11, 13, 15, 17, 19, 22, 25],
  },
  {
    id: AttributeSkillId.HOUTU,
    name: '厚土',
    description: '所有受到的伤害-{value}%',
    wuxing: Wuxing.EARTH,
    trigger: SkillTrigger.ON_DEFEND,
    values: [3, 5, 7, 9, 11, 13, 15, 17, 19, 22],
  },
  {
    id: AttributeSkillId.FANZHEN,
    name: '反震',
    description: '受到伤害时，将{value}%伤害反弹给攻击者',
    wuxing: Wuxing.EARTH,
    trigger: SkillTrigger.AFTER_DEFEND,
    values: [5, 7, 9, 11, 13, 16, 19, 22, 26, 30],
  },
  {
    id: AttributeSkillId.XUSHI,
    name: '蓄势',
    description: '连续受到攻击时，下次攻击伤害+{value}%（最多叠3层）',
    wuxing: Wuxing.EARTH,
    trigger: SkillTrigger.AFTER_DEFEND,
    values: [8, 12, 16, 20, 25, 30, 36, 42, 50, 60],
  },
];

/**
 * 所有技能按五行分组
 */
export const SKILLS_BY_WUXING: Record<Wuxing, AttributeSkillDef[]> = {
  [Wuxing.METAL]: METAL_SKILLS,
  [Wuxing.WATER]: WATER_SKILLS,
  [Wuxing.WOOD]: WOOD_SKILLS,
  [Wuxing.FIRE]: FIRE_SKILLS,
  [Wuxing.EARTH]: EARTH_SKILLS,
};

/**
 * 所有技能的映射表
 */
export const ALL_SKILLS: Record<AttributeSkillId, AttributeSkillDef> = {
  // 金
  [AttributeSkillId.RUIDU]: METAL_SKILLS[0],
  [AttributeSkillId.FENGMANG]: METAL_SKILLS[1],
  [AttributeSkillId.POJIA]: METAL_SKILLS[2],
  [AttributeSkillId.SHAYI]: METAL_SKILLS[3],
  [AttributeSkillId.HANFENG]: METAL_SKILLS[4],
  // 水
  [AttributeSkillId.LINGDONG]: WATER_SKILLS[0],
  [AttributeSkillId.DONGCHA]: WATER_SKILLS[1],
  [AttributeSkillId.NINGZHI]: WATER_SKILLS[2],
  [AttributeSkillId.XUANBING]: WATER_SKILLS[3],
  [AttributeSkillId.RUNZE]: WATER_SKILLS[4],
  // 木
  [AttributeSkillId.GENJI]: WOOD_SKILLS[0],
  [AttributeSkillId.SHENGJI]: WOOD_SKILLS[1],
  [AttributeSkillId.RENXING]: WOOD_SKILLS[2],
  [AttributeSkillId.FENGCHUN]: WOOD_SKILLS[3],
  [AttributeSkillId.NUMU]: WOOD_SKILLS[4],
  // 火
  [AttributeSkillId.YANWEI]: FIRE_SKILLS[0],
  [AttributeSkillId.LIAOYUAN]: FIRE_SKILLS[1],
  [AttributeSkillId.BAORAN]: FIRE_SKILLS[2],
  [AttributeSkillId.FENYI]: FIRE_SKILLS[3],
  [AttributeSkillId.YUJIN]: FIRE_SKILLS[4],
  // 土
  [AttributeSkillId.JIANBI]: EARTH_SKILLS[0],
  [AttributeSkillId.PANSHI]: EARTH_SKILLS[1],
  [AttributeSkillId.HOUTU]: EARTH_SKILLS[2],
  [AttributeSkillId.FANZHEN]: EARTH_SKILLS[3],
  [AttributeSkillId.XUSHI]: EARTH_SKILLS[4],
};

/**
 * 获取技能定义
 */
export function getSkillDef(skillId: AttributeSkillId): AttributeSkillDef {
  return ALL_SKILLS[skillId];
}

/**
 * 获取技能在指定等级的数值
 * @param skillId 技能ID
 * @param level 等级 1-10
 */
export function getSkillValue(skillId: AttributeSkillId, level: number): number {
  const skill = ALL_SKILLS[skillId];
  const clampedLevel = Math.max(1, Math.min(10, level));
  return skill.values[clampedLevel - 1];
}

/**
 * 获取某五行的所有技能ID
 */
export function getSkillIdsByWuxing(wuxing: Wuxing): AttributeSkillId[] {
  return SKILLS_BY_WUXING[wuxing].map(s => s.id);
}

/**
 * 从五行技能中随机选择一个
 */
export function randomSkillFromWuxing(wuxing: Wuxing, exclude: AttributeSkillId[] = []): AttributeSkillId | null {
  const available = getSkillIdsByWuxing(wuxing).filter(id => !exclude.includes(id));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}
