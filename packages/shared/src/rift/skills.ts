import { Wuxing } from '../types/index.js';
import type { PlayerStats } from './gear.js';

/**
 * 技能：五行各十门，循序渐进。
 *
 *  - 要用本行能量修习才学得会；越往后的技能，要求本行修为越高、修习越贵。
 *  - 学会之后用得越多越熟练——每升一级熟练度，伤害更高、冷却更短、范围更大。
 *  - 招式只有八种路数（kind），每门技能是「路数 + 五行 + 数值」，所以加新技能只用加一行。
 */
export type SkillId = string;

export type SkillKind =
  /** 以自身为圆心的一圈 */
  | 'nova'
  /** 砸向妖异最密集处（count 颗） */
  | 'strike'
  /** 分袭最近的几只（count 道） */
  | 'blades'
  /** 朝最近的妖异打出一道直线 */
  | 'lance'
  /** 在妖异最密集处留下一片持续伤害的区域 */
  | 'zone'
  /** 回复生命（自己与附近同伴），顺带伤到四周 */
  | 'heal'
  /** 护体：一段时间内减伤，起手震伤四周 */
  | 'guard'
  /** 一段时间内攻击提升 */
  | 'buff';

export interface SkillDef {
  id: SkillId;
  name: string;
  wuxing: Wuxing;
  kind: SkillKind;
  /** 本行第几门（1..10） */
  rank: number;
  /** 修习要求：本行修为至少几重 */
  need: number;
  /** 修习所需的本行能量 */
  learn: number;
  /** 每次施放消耗的灵力与冷却（毫秒） */
  qi: number;
  cd: number;
  /** 每一下的伤害倍率（乘攻击力） */
  power: number;
  /** 半径；blades / lance 是射程 */
  radius: number;
  /** blades 的道数、strike 的颗数 */
  count: number;
  /** zone / guard / buff 的持续时间（毫秒） */
  ms: number;
  /** 点燃 */
  burn: boolean;
  /** 必定暴击 */
  crit: boolean;
  /** 冻结 / 震住多久（毫秒，首领只吃三成） */
  stagger: number;
  /** 回复自己 / 同伴多少生命（比例） */
  heal: number;
  mateHeal: number;
  /** 护体期间所受伤害乘多少 */
  block: number;
  /** 攻击提升多少（比例） */
  atk: number;
  desc: string;
}

/** 各门技能要求的本行修为、修习花费 */
export const RANK_NEED = [0, 2, 4, 7, 10, 14, 18, 23, 28, 34] as const;
export const RANK_LEARN = [40, 70, 110, 170, 260, 380, 550, 800, 1150, 1600] as const;
/** 直线招式的宽度、区域招式多久跳一次伤害、落下类招式的延迟、能指定多远 */
export const LANCE_WIDTH = 90;
export const ZONE_TICK_MS = 500;
export const STRIKE_DELAY = 650;
export const SKILL_AIM_RANGE = 620;

type Extra = Partial<Pick<SkillDef, 'count' | 'ms' | 'burn' | 'crit' | 'stagger' | 'heal' | 'mateHeal' | 'block' | 'atk'>>;
const HOLD: Record<Wuxing, string> = {
  [Wuxing.FIRE]: '震慑', [Wuxing.METAL]: '震慑', [Wuxing.WATER]: '冻结', [Wuxing.WOOD]: '缠住', [Wuxing.EARTH]: '震住',
};

function describe(d: SkillDef): string {
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const sec = (ms: number) => `${Math.round(ms / 100) / 10} 秒`;
  const dmg = `${pct(d.power)} 伤害`;
  let s = '';
  switch (d.kind) {
    case 'nova': s = `以自身为圆心，对四周造成 ${dmg}`; break;
    case 'strike': s = d.count > 1 ? `连落 ${d.count} 击，砸向妖异最密集处，每击 ${dmg}` : `砸向妖异最密集处，造成 ${dmg}`; break;
    case 'blades': s = `分袭最近的妖异，最多 ${d.count} 道（越熟练越多），每道 ${dmg}`; break;
    case 'lance': s = `朝最近的妖异打出一道直线，贯穿沿途，造成 ${dmg}`; break;
    case 'zone': s = `在妖异最密集处留下一片区域，持续 ${sec(d.ms)}，每半秒 ${dmg}`; break;
    case 'heal': s = `回复自身 ${pct(d.heal)} 生命，附近同伴回复 ${pct(d.mateHeal)}${d.power > 0 ? `，并对四周造成 ${dmg}` : ''}`; break;
    case 'guard': s = `护体 ${sec(d.ms)}，所受伤害减少 ${pct(1 - d.block)}，起手震伤四周 ${dmg}`; break;
    case 'buff': s = `${sec(d.ms)}内攻击提升 ${pct(d.atk)}`; break;
  }
  if (d.crit) s += '，必定暴击';
  if (d.burn) s += '，并点燃';
  if (d.stagger > 0) s += `，${HOLD[d.wuxing]} ${sec(d.stagger)}`;
  return s;
}

const list: SkillDef[] = [];
function add(wuxing: Wuxing, id: string, name: string, kind: SkillKind, qi: number, cdSec: number, power: number, radius: number, extra: Extra = {}): void {
  const rank = list.filter(s => s.wuxing === wuxing).length + 1;
  const d: SkillDef = {
    id, name, wuxing, kind, rank, need: RANK_NEED[rank - 1], learn: RANK_LEARN[rank - 1], qi, cd: cdSec * 1000, power, radius,
    count: 1, ms: 0, burn: false, crit: false, stagger: 0, heal: 0, mateHeal: 0, block: 1, atk: 0, desc: '', ...extra,
  };
  d.desc = describe(d);
  list.push(d);
}

// 火：清群与灼烧
add(Wuxing.FIRE, 'ring',       '燎原',     'nova',   30, 7,  1.7, 300, { burn: true });
add(Wuxing.FIRE, 'firecrow',   '火鸦',     'blades', 30, 7,  1.5, 480, { count: 4, burn: true });
add(Wuxing.FIRE, 'meteor',     '焚天',     'strike', 50, 11, 3.4, 230, { burn: true });
add(Wuxing.FIRE, 'flameblade', '炎刃',     'buff',   35, 18, 0,   0,   { ms: 8000, atk: 0.25 });
add(Wuxing.FIRE, 'firewall',   '烈焰阵',   'zone',   45, 14, 0.7, 240, { ms: 5000, burn: true });
add(Wuxing.FIRE, 'flamelance', '流火',     'lance',  40, 9,  3.2, 560, { burn: true });
add(Wuxing.FIRE, 'inferno',    '爆炎',     'nova',   55, 12, 3.0, 360, { burn: true });
add(Wuxing.FIRE, 'skyfire',    '天火',     'strike', 70, 16, 3.2, 220, { count: 3, burn: true });
add(Wuxing.FIRE, 'ignis',      '焚身',     'buff',   50, 24, 0,   0,   { ms: 10000, atk: 0.45 });
add(Wuxing.FIRE, 'redlotus',   '红莲业火', 'nova',   90, 28, 5.5, 460, { burn: true });

// 金：暴击与点杀
add(Wuxing.METAL, 'blades',      '万剑',     'blades', 40, 8,  2.4, 520, { count: 6, crit: true });
add(Wuxing.METAL, 'pierce',      '破锋',     'lance',  30, 7,  2.8, 520, { crit: true });
add(Wuxing.METAL, 'edge',        '锐意',     'buff',   30, 18, 0,   0,   { ms: 8000, atk: 0.2 });
add(Wuxing.METAL, 'goldbell',    '金钟',     'guard',  35, 16, 1.0, 220, { ms: 3000, block: 0.4 });
add(Wuxing.METAL, 'swordring',   '剑环',     'nova',   40, 9,  2.2, 280, { crit: true });
add(Wuxing.METAL, 'mountaincut', '斩岳',     'strike', 55, 12, 4.2, 200, { crit: true });
add(Wuxing.METAL, 'swordarray',  '剑阵',     'zone',   55, 15, 0.9, 250, { ms: 5000 });
add(Wuxing.METAL, 'flyingedge',  '飞刃',     'blades', 55, 10, 2.8, 560, { count: 8, crit: true });
add(Wuxing.METAL, 'peerless',    '无双',     'buff',   55, 24, 0,   0,   { ms: 10000, atk: 0.5 });
add(Wuxing.METAL, 'allswords',   '万剑归宗', 'blades', 90, 26, 3.4, 620, { count: 12, crit: true });

// 水：冻结与控场
add(Wuxing.WATER, 'frost',    '寒潮',     'nova',   35, 10, 1.0, 340, { stagger: 2200 });
add(Wuxing.WATER, 'icicle',   '冰锥',     'blades', 30, 7,  1.8, 480, { count: 4, stagger: 600 });
add(Wuxing.WATER, 'mirror',   '水镜',     'guard',  35, 16, 0.8, 220, { ms: 3500, block: 0.4 });
add(Wuxing.WATER, 'rime',     '凝霜',     'zone',   45, 14, 0.5, 260, { ms: 5000, stagger: 500 });
add(Wuxing.WATER, 'icespear', '玄冰刺',   'lance',  40, 9,  2.8, 560, { stagger: 1200 });
add(Wuxing.WATER, 'tide',     '潮汐',     'nova',   50, 12, 2.4, 380, { stagger: 800 });
add(Wuxing.WATER, 'seal',     '冰封',     'strike', 55, 14, 2.6, 240, { stagger: 3200 });
add(Wuxing.WATER, 'clarity',  '澄心',     'heal',   40, 20, 0,   300, { heal: 0.2, mateHeal: 0.15 });
add(Wuxing.WATER, 'blizzard', '暴雪',     'zone',   70, 20, 0.8, 340, { ms: 6000, stagger: 700 });
add(Wuxing.WATER, 'zero',     '绝对零度', 'nova',   90, 28, 3.2, 480, { stagger: 4000 });

// 木：回复与缠绕
add(Wuxing.WOOD, 'bloom',    '回春',     'heal',   40, 14, 0.9,  300, { heal: 0.3, mateHeal: 0.2 });
add(Wuxing.WOOD, 'thorns',   '荆棘',     'nova',   30, 8,  1.8,  280);
add(Wuxing.WOOD, 'vine',     '藤鞭',     'lance',  35, 8,  2.6,  540, { stagger: 700 });
add(Wuxing.WOOD, 'miasma',   '毒瘴',     'zone',   45, 14, 0.75, 260, { ms: 6000 });
add(Wuxing.WOOD, 'barkskin', '木甲',     'guard',  40, 16, 1.0,  220, { ms: 4000, block: 0.45 });
add(Wuxing.WOOD, 'leaves',   '落叶',     'blades', 45, 9,  2.0,  520, { count: 7 });
add(Wuxing.WOOD, 'renew',    '生息',     'heal',   55, 18, 1.2,  340, { heal: 0.45, mateHeal: 0.3 });
add(Wuxing.WOOD, 'forest',   '森罗',     'strike', 60, 14, 3.4,  250, { count: 2, stagger: 900 });
add(Wuxing.WOOD, 'wither',   '枯荣',     'buff',   50, 24, 0,    0,   { ms: 10000, atk: 0.35 });
add(Wuxing.WOOD, 'spring',   '万木逢春', 'heal',   90, 30, 3.0,  420, { heal: 0.7, mateHeal: 0.5 });

// 土：护体与震慑
add(Wuxing.EARTH, 'bastion',    '磐石', 'guard',  40, 14, 1.6, 270, { ms: 4000, block: 0.3 });
add(Wuxing.EARTH, 'fissure',    '地裂', 'lance',  35, 8,  2.6, 520, { stagger: 600 });
add(Wuxing.EARTH, 'quake',      '震地', 'nova',   40, 10, 2.0, 300, { stagger: 1000 });
add(Wuxing.EARTH, 'rockfall',   '落石', 'strike', 50, 11, 3.6, 230, { stagger: 800 });
add(Wuxing.EARTH, 'quicksand',  '流沙', 'zone',   45, 14, 0.5, 270, { ms: 5500, stagger: 450 });
add(Wuxing.EARTH, 'stonespike', '石刺', 'blades', 45, 9,  2.2, 500, { count: 6, stagger: 500 });
add(Wuxing.EARTH, 'thickearth', '厚土', 'guard',  55, 20, 1.2, 260, { ms: 6000, block: 0.2 });
add(Wuxing.EARTH, 'unmoved',    '不动', 'buff',   50, 24, 0,   0,   { ms: 10000, atk: 0.35 });
add(Wuxing.EARTH, 'landslide',  '山崩', 'strike', 70, 16, 3.4, 230, { count: 3, stagger: 900 });
add(Wuxing.EARTH, 'mountain',   '镇岳', 'nova',   90, 28, 4.5, 460, { stagger: 2500 });

export const SKILLS: Record<SkillId, SkillDef> = Object.fromEntries(list.map(s => [s.id, s]));
export const SKILL_ORDER: SkillId[] = list.map(s => s.id);
/** 某一行的十门技能，按修习顺序 */
export function skillsOf(wx: Wuxing): SkillDef[] {
  return list.filter(s => s.wuxing === wx);
}
/** 一局最多携带几门技能 */
export const LOADOUT_MAX = 4;

/** 存档里记的是每个技能用过多少次；没有这一项 = 还没学会 */
export type SkillBook = Record<SkillId, number>;

export const SKILL_MAX_LEVEL = 10;
export const SKILL_RANKS = ['初学', '入门', '小成', '熟练', '精通', '大成', '圆融', '通玄', '化境', '登峰', '造极'] as const;
/** 熟练到 level 级累计要用多少次 */
export function skillNeed(level: number): number {
  return 8 * level * level;
}
export function skillLevel(uses: number | undefined): number {
  if (uses === undefined) return -1;
  return Math.min(SKILL_MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, uses) / 8)));
}
/** 技能范围随熟练度成长：刚学会只有四成半，每级 +5.5%，10 级才是完整范围 */
export function skillAreaMult(level: number): number {
  return 0.45 + 0.055 * Math.max(0, Math.min(SKILL_MAX_LEVEL, level));
}
/** 技能的作用半径：基础半径 × 熟练度 × 属性里的技能范围（分袭与直线类的射程不随熟练度变） */
export function skillRadius(id: SkillId, level: number, s: Pick<PlayerStats, 'area'>): number {
  const d = SKILLS[id];
  if (!d) return 0;
  if (d.kind === 'blades' || d.kind === 'lance') return d.radius;
  return d.radius * skillAreaMult(level) * (1 + s.area / 100);
}
/** 分袭类的道数随熟练度增加：从一半起步，10 级满额。落下类的颗数是固定的 */
export function skillCount(id: SkillId, level: number): number {
  const d = SKILLS[id];
  if (!d) return 0;
  if (d.kind !== 'blades') return d.count;
  const lo = Math.max(2, Math.ceil(d.count / 2));
  return Math.min(d.count, lo + Math.floor(Math.max(0, level) * (d.count - lo) / SKILL_MAX_LEVEL + 0.001));
}

/**
 * 参悟：不靠实战，直接花技能所属那一行的能量补满到下一级——离下一级还差几次，就按每次 3 点能量算。
 */
export const SKILL_TRAIN_PER_USE = 3;
export function skillTrainCost(uses: number): number {
  const lv = skillLevel(uses);
  if (lv < 0 || lv >= SKILL_MAX_LEVEL) return 0;
  return Math.max(1, skillNeed(lv + 1) - uses) * SKILL_TRAIN_PER_USE;
}

/** 每级熟练度：伤害 +12%，冷却 -3% */
export function skillDmgMult(level: number): number {
  return 1 + 0.12 * Math.max(0, level);
}
export function skillCdMult(level: number): number {
  return 1 - 0.03 * Math.max(0, level);
}
