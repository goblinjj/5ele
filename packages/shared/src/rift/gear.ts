import { Wuxing, WUXING_CONQUERS, WUXING_GENERATES } from '../types/Wuxing.js';

/**
 * 兵器与五行修炼
 *
 * 身上只有一件装备：兵器。器型决定出手方式（近战 / 远程），词条只管输出。
 * 其余的成长全部来自「五行能量」：妖异溃散后留下的能量，
 * 收集起来可以修炼五行（人物升级）、淬炼兵器（强化）。
 */

export const WX_ORDER: Wuxing[] = [Wuxing.METAL, Wuxing.WOOD, Wuxing.WATER, Wuxing.FIRE, Wuxing.EARTH];

/** 五行能量 / 五行修为：每一行一个数 */
export type Energy = Record<Wuxing, number>;
export function emptyEnergy(): Energy {
  return { [Wuxing.METAL]: 0, [Wuxing.WOOD]: 0, [Wuxing.WATER]: 0, [Wuxing.FIRE]: 0, [Wuxing.EARTH]: 0 };
}
export function energyTotal(e: Energy): number {
  return WX_ORDER.reduce((a, wx) => a + (e[wx] ?? 0), 0);
}

/** 0 凡品（白）· 1 良品（绿）· 2 上品（蓝）· 3 极品（紫）· 4 传说（橙） */
export type GearRarity = 0 | 1 | 2 | 3 | 4;
export const RARITY_NAMES = ['凡品', '良品', '上品', '极品', '传说'] as const;
export const RARITY_COLORS = [0xc9d1d9, 0x4ade80, 0x58a6ff, 0xc084fc, 0xffa31a] as const;
export const RARITY_CSS = ['#c9d1d9', '#4ade80', '#58a6ff', '#c084fc', '#ffa31a'] as const;
/** 每档品质的随机词条数 */
const AFFIX_COUNT = [0, 1, 2, 3, 4];

// ───────────────────────── 器型 ─────────────────────────

export type WeaponKind = '剑' | '刃' | '枪' | '杖' | '扇';
export const WEAPON_KINDS: WeaponKind[] = ['剑', '刃', '枪', '杖', '扇'];

export interface WeaponForm {
  kind: WeaponKind;
  /** 招式名 */
  move: string;
  melee: boolean;
  desc: string;
  /** 出手间隔（毫秒，未计攻速） */
  interval: number;
  /** 索敌 / 命中距离 */
  range: number;
  /** 每次命中的伤害倍率 */
  mult: number;
  /** 近战扇形的张角（弧度）；0 表示直线突刺 */
  arc: number;
  /** 直线突刺的宽度 */
  width: number;
  /** 远程：一次出手的弹数与散开角度 */
  bolts: number;
  spread: number;
  /** 远程：命中后是否溅射 */
  splash: boolean;
}

export const WEAPON_FORMS: Record<WeaponKind, WeaponForm> = {
  剑: { kind: '剑', move: '横斩', melee: true, desc: '近战 · 身前大扇面横斩，一剑扫中多只', interval: 520, range: 185, mult: 1.5, arc: 2.3, width: 0, bolts: 0, spread: 0, splash: false },
  刃: { kind: '刃', move: '快斩', melee: true, desc: '近战 · 出手极快的连斩，贴身才打得到', interval: 290, range: 150, mult: 0.85, arc: 1.7, width: 0, bolts: 0, spread: 0, splash: false },
  枪: { kind: '枪', move: '突刺', melee: true, desc: '近战 · 直线突刺，贯穿一路上的妖异', interval: 700, range: 330, mult: 1.75, arc: 0, width: 96, bolts: 0, spread: 0, splash: false },
  杖: { kind: '杖', move: '灵弹', melee: false, desc: '远程 · 自动追敌的灵弹，命中后溅射', interval: 640, range: 560, mult: 1.0, arc: 0, width: 0, bolts: 1, spread: 0, splash: true },
  扇: { kind: '扇', move: '流火', melee: false, desc: '远程 · 一次扇出三道流火，中距离覆盖一片', interval: 720, range: 440, mult: 0.55, arc: 0, width: 0, bolts: 3, spread: 0.3, splash: false },
};

// ───────────────────────── 词条 ─────────────────────────

export type StatKey = 'atk' | 'atkPct' | 'aspd' | 'crit' | 'critDmg' | 'area' | 'burn';

interface StatDef {
  name: string;
  /** 百分比属性显示 % */
  pct: boolean;
  /** 一重天时的随机区间；flat 属性随层数成长更快 */
  range: [number, number];
  flat: boolean;
}

export const STAT_DEFS: Record<StatKey, StatDef> = {
  atk:     { name: '攻击',     pct: false, range: [2, 5],   flat: true },
  atkPct:  { name: '攻击',     pct: true,  range: [5, 12],  flat: false },
  aspd:    { name: '攻速',     pct: true,  range: [5, 12],  flat: false },
  crit:    { name: '暴击率',   pct: true,  range: [3, 7],   flat: false },
  critDmg: { name: '暴击伤害', pct: true,  range: [10, 25], flat: false },
  area:    { name: '技能范围', pct: true,  range: [6, 14],  flat: false },
  burn:    { name: '灼烧伤害', pct: true,  range: [12, 28], flat: false },
};
const AFFIX_POOL: StatKey[] = ['atk', 'atkPct', 'aspd', 'crit', 'critDmg', 'burn', 'area'];

export interface StatLine {
  stat: StatKey;
  value: number;
}

// ───────────────────────── 兵器 ─────────────────────────

export interface GearItem {
  id: string;
  name: string;
  rarity: GearRarity;
  /** 物品等级 = 掉落时的秘境层数 */
  tier: number;
  wuxing: Wuxing;
  /** 底材固有属性 */
  base: StatLine[];
  /** 随机词条 */
  affixes: StatLine[];
  /** 器型：决定出手方式与外观 */
  kind: WeaponKind;
  /** 淬炼 0~MAX_GRADE，每阶所有数值 +8% */
  grade?: number;
}

const WX_PREFIX: Record<Wuxing, string> = {
  [Wuxing.METAL]: '庚金',
  [Wuxing.WOOD]: '青木',
  [Wuxing.WATER]: '玄水',
  [Wuxing.FIRE]: '离火',
  [Wuxing.EARTH]: '戊土',
};
const MATERIAL = ['', '粗铜', '寒铁', '玄铁', '精钢', '灵玉', '紫晶', '星陨', '太虚', '混元'];

export const MAX_TIER = 9;
export const TIER_NAMES = ['', '一重天', '二重天', '三重天', '四重天', '五重天', '六重天', '七重天', '八重天', '九重天'];

/** 数值随层数成长的倍率：flat 属性约 ×1.3/层，百分比属性缓慢成长 */
function tierScale(tier: number, flat: boolean): number {
  return flat ? Math.pow(1.3, tier - 1) : 1 + (tier - 1) * 0.08;
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function roll(stat: StatKey, tier: number, quality: number = 1): number {
  const d = STAT_DEFS[stat];
  const v = rand(d.range[0], d.range[1]) * tierScale(tier, d.flat) * quality;
  return d.flat ? Math.max(1, Math.round(v)) : Math.round(v * 10) / 10;
}

let idSeq = 0;
export function newItemId(): string {
  idSeq = (idSeq + 1) % 1e6;
  return `${Date.now().toString(36)}${idSeq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** 生成一件兵器 */
export function generateItem(tier: number, rarity: GearRarity, wuxing?: Wuxing, kind?: WeaponKind): GearItem {
  const wx = wuxing ?? pick(WX_ORDER);
  const k = kind ?? pick(WEAPON_KINDS);
  const quality = 1 + rarity * 0.12;
  const pool = [...AFFIX_POOL];
  const affixes: StatLine[] = [];
  for (let i = 0; i < AFFIX_COUNT[rarity] && pool.length; i++) {
    const stat = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    affixes.push({ stat, value: roll(stat, tier, quality) });
  }
  return {
    id: newItemId(),
    name: `${WX_PREFIX[wx]}·${MATERIAL[Math.min(tier, MATERIAL.length - 1)]}${k}`,
    rarity,
    tier,
    wuxing: wx,
    base: [{ stat: 'atk', value: Math.round(rand(6, 9) * tierScale(tier, true) * quality) }],
    affixes,
    kind: k,
  };
}

/** 器型（旧存档没有 kind 字段时从名字末尾推断） */
export function kindOf(item: Pick<GearItem, 'kind' | 'name'>): WeaponKind {
  if (item.kind && WEAPON_FORMS[item.kind]) return item.kind;
  for (const k of WEAPON_KINDS) if (item.name.endsWith(k)) return k;
  return '杖';
}
/** 兵器的出手方式；空手时以掌风代杖 */
export function formOf(item: GearItem | null | undefined): WeaponForm {
  return WEAPON_FORMS[item ? kindOf(item) : '杖'];
}

export function itemCss(item: GearItem): string {
  return RARITY_CSS[item.rarity];
}
export function itemColor(item: GearItem): number {
  return RARITY_COLORS[item.rarity];
}

/** 淬炼：+1 ~ +10，每阶所有数值 +8%，消耗与兵器同属的五行能量，不会失败 */
export const MAX_GRADE = 10;
export const GRADE_STEP = 0.08;
export function gradeMult(item: GearItem): number {
  return 1 + (item.grade ?? 0) * GRADE_STEP;
}
export function refineCost(item: GearItem): number {
  return Math.round(14 * ((item.grade ?? 0) + 1) * (1 + 0.3 * (item.tier - 1)));
}
export function displayName(item: GearItem): string {
  return item.grade ? `${item.name} +${item.grade}` : item.name;
}

/** 掉落品质：层数越高，好东西越多 */
export function rollRarity(tier: number, minRarity: GearRarity = 0): GearRarity {
  const w = [
    55,
    30,
    12 * (1 + 0.12 * (tier - 1)),
    2.6 * (1 + 0.3 * (tier - 1)),
    0.45 * (1 + 0.4 * (tier - 1)),
  ];
  for (let i = 0; i < minRarity; i++) w[i] = 0;
  const sum = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i as GearRarity;
  }
  return 4;
}

/** 化去一件兵器，返还与它同属的五行能量 */
export function salvageValue(item: Pick<GearItem, 'rarity' | 'tier' | 'grade'>): number {
  return Math.round([2, 5, 12, 28, 70][item.rarity] * (1 + (item.grade ?? 0) * 0.5) * (1 + (item.tier - 1) * 0.3));
}

// ───────────────────────── 五行共鸣 ─────────────────────────

export type Resonance = 'same' | 'nourish' | 'clash' | 'none';

/** 兵器五行与所修之道的关系：同道 +20%，生我 +10%，克我 -30% */
export function resonanceOf(path: Wuxing | null | undefined, item: Wuxing): Resonance {
  if (!path) return 'none';
  if (path === item) return 'same';
  if (WUXING_GENERATES[item] === path) return 'nourish';
  if (WUXING_CONQUERS[item] === path) return 'clash';
  return 'none';
}
export const RESONANCE_MULT: Record<Resonance, number> = { same: 1.2, nourish: 1.1, clash: 0.7, none: 1 };
export const RESONANCE_LABEL: Record<Resonance, string> = { same: '同道 +20%', nourish: '相生 +10%', clash: '相克 -30%', none: '' };

// ───────────────────────── 五行修炼 ─────────────────────────

export interface CultDef {
  wuxing: Wuxing;
  /** 这一行修的是什么 */
  name: string;
  /** 每一重的加成说明 */
  desc: string;
}

/** 每一重修为带来的加成（数值见 computeStats） */
export const CULT: Record<Wuxing, CultDef> = {
  [Wuxing.METAL]: { wuxing: Wuxing.METAL, name: '锋锐', desc: '攻击 +4%　暴击 +0.4%' },
  [Wuxing.WOOD]:  { wuxing: Wuxing.WOOD,  name: '生机', desc: '生命 +6%　每秒回血 +0.4' },
  [Wuxing.WATER]: { wuxing: Wuxing.WATER, name: '流转', desc: '冷却 -1%　灵力上限 +4　移速 +0.5%' },
  [Wuxing.FIRE]:  { wuxing: Wuxing.FIRE,  name: '炽烈', desc: '暴伤 +4%　灼烧 +5%　技能范围 +1%' },
  [Wuxing.EARTH]: { wuxing: Wuxing.EARTH, name: '厚重', desc: '减伤 +1.2%　生命 +2%' },
};

export const MAX_CULT = 40;
/** 相生约束：一行的修为最多比「生它的那一行」高这么多重 */
export const CULT_GAP = 5;

/** 从 level 重升到下一重所需的本行能量 */
export function cultCost(level: number): number {
  return Math.round(10 + 8 * level + 1.2 * level * level);
}
/** 生我者：谁生这一行 */
export function motherOf(wx: Wuxing): Wuxing {
  return WX_ORDER.find(o => WUXING_GENERATES[o] === wx)!;
}
/** 能否再升一重；不能时给出原因 */
export function cultBlock(cult: Energy, energy: Energy, wx: Wuxing): '' | 'max' | 'mother' | 'energy' {
  const lv = cult[wx] ?? 0;
  if (lv >= MAX_CULT) return 'max';
  if (lv >= (cult[motherOf(wx)] ?? 0) + CULT_GAP) return 'mother';
  if ((energy[wx] ?? 0) < cultCost(lv)) return 'energy';
  return '';
}

/** 境界：五行修为总和每 20 重一个大境界 */
export const REALMS = ['凡胎', '炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'] as const;
export const REALM_COLORS = [0x9fb3c8, 0x9fd8ff, 0x4ade80, 0xffe066, 0xffa31a, 0xff6a4c, 0xc084fc, 0xff4fd8, 0xfff3a0, 0xffffff] as const;
export function realmIndex(cult: Energy): number {
  return Math.min(REALMS.length - 1, Math.floor(energyTotal(cult) / 20));
}
export function realmOf(cult: Energy): string {
  return REALMS[realmIndex(cult)];
}

// ───────────────────────── 汇总属性 ─────────────────────────

export interface PlayerStats {
  attack: number;
  maxHp: number;
  aspd: number;
  crit: number;
  critDmg: number;
  area: number;
  move: number;
  dr: number;
  cdr: number;
  burn: number;
  regen: number;
  /** 局内灵力上限 */
  qiMax: number;
}

export const BASE_ATTACK = 10;
export const BASE_HP = 300;
/** 基础回血（每秒） */
export const BASE_REGEN = 2;
export const BASE_QI = 100;

/** 兵器词条 + 五行修为 → 属性 */
export function computeStats(weapon: GearItem | null | undefined, path: Wuxing | null | undefined, cult: Energy): PlayerStats {
  const sum: Record<StatKey, number> = { atk: 0, atkPct: 0, aspd: 0, crit: 0, critDmg: 0, area: 0, burn: 0 };
  if (weapon) {
    const m = RESONANCE_MULT[resonanceOf(path, weapon.wuxing)] * gradeMult(weapon);
    for (const l of [...weapon.base, ...weapon.affixes]) if (l.stat in sum) sum[l.stat] += l.value * m;
  }
  const c = (wx: Wuxing) => Math.max(0, Math.min(MAX_CULT, cult[wx] ?? 0));
  const metal = c(Wuxing.METAL), wood = c(Wuxing.WOOD), water = c(Wuxing.WATER), fire = c(Wuxing.FIRE), earth = c(Wuxing.EARTH);
  return {
    attack: Math.round((BASE_ATTACK + sum.atk) * (1 + (sum.atkPct + metal * 4) / 100)),
    maxHp: Math.round(BASE_HP * (1 + (wood * 6 + earth * 2) / 100)),
    aspd: Math.min(150, sum.aspd),
    crit: Math.min(75, 5 + sum.crit + metal * 0.4),
    critDmg: 50 + sum.critDmg + fire * 4,
    area: Math.min(120, sum.area + fire),
    move: water * 0.5,
    dr: Math.min(60, earth * 1.2),
    cdr: Math.min(50, water),
    burn: sum.burn + fire * 5,
    regen: BASE_REGEN + wood * 0.4,
    qiMax: BASE_QI + water * 4,
  };
}

/** 战力：粗略衡量输出与生存，用于对比兵器好坏 */
export function powerOf(s: PlayerStats): number {
  const dps = s.attack * (1 + (s.crit / 100) * (s.critDmg / 100)) * (1 + s.aspd / 100) * (1 + s.area / 250) * (1 + s.burn / 400) * (1 + s.cdr / 200);
  const tough = Math.sqrt((s.maxHp / BASE_HP) / (1 - s.dr / 100));
  return Math.round(dps * tough * 10);
}

export function formatStat(l: StatLine): string {
  const d = STAT_DEFS[l.stat];
  const v = d.pct ? `${Math.round(l.value * 10) / 10}%` : `${Math.round(l.value)}`;
  return `${d.name} +${v}`;
}

/** 新玩家的第一件兵器 */
export function starterWeapon(path: Wuxing, kind: WeaponKind = '杖'): GearItem {
  const it = generateItem(1, 0, path, kind);
  it.base = [{ stat: 'atk', value: 6 }];
  return it;
}
