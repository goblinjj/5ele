import { Wuxing, WUXING_CONQUERS, WUXING_GENERATES } from '../types/Wuxing.js';

/**
 * 兵器与五行修炼
 *
 * 身上只有一件装备：兵器。器型决定出手方式（近战 / 远程），词条只管输出；空手时以气劲御敌。
 * 一切成长都来自「五行能量」：妖异溃散后留下的能量，
 * 收集起来可以修炼五行（人物升级）、凝练兵器（按投入的五行比例定器型）、精炼兵器（威力指数增长，可能失败）。
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
  kind: WeaponKind | '空手';
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

/** 空手：中距离的气劲，不追踪也不溅射，比任何兵器都弱 */
export const UNARMED_FORM: WeaponForm = {
  kind: '空手', move: '气劲', melee: false, desc: '中距离 · 掌出气劲，凝出兵器之前的权宜之计',
  interval: 620, range: 340, mult: 0.9, arc: 0, width: 0, bolts: 1, spread: 0, splash: false,
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
/** 兵器的出手方式；空手时是气劲 */
export function formOf(item: GearItem | null | undefined): WeaponForm {
  return item ? WEAPON_FORMS[kindOf(item)] : UNARMED_FORM;
}

export function itemCss(item: GearItem): string {
  return RARITY_CSS[item.rarity];
}
export function itemColor(item: GearItem): number {
  return RARITY_COLORS[item.rarity];
}

/**
 * 精炼：+1 ~ +10，消耗与兵器同属的能量。
 *   - 每次消耗固定（只看兵器的层数，不随阶数涨）
 *   - 兵器的全部数值随阶数指数增长：每阶 ×1.25，+10 约为 9.3 倍
 *   - 阶数越高越容易失败；失败时能量照扣、阶数不变
 */
export const MAX_GRADE = 10;
export const GRADE_GROWTH = 1.25;
export function gradeMult(item: Pick<GearItem, 'grade'>): number {
  return Math.pow(GRADE_GROWTH, item.grade ?? 0);
}
export function refineCost(item: Pick<GearItem, 'tier'>): number {
  return Math.round(50 * (1 + 0.3 * (item.tier - 1)));
}
/** 从 grade 阶升到下一阶的成功率（百分数） */
const REFINE_RATE = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
export function refineRate(grade: number): number {
  return REFINE_RATE[Math.max(0, Math.min(REFINE_RATE.length - 1, grade))];
}
export function displayName(item: GearItem): string {
  return item.grade ? `${item.name} +${item.grade}` : item.name;
}

// ───────────────────────── 凝练兵器 ─────────────────────────

/**
 * 凝练：投入五行能量凝成一件兵器。
 *   - 投得最多的一行为「主」，定兵器的五行
 *   - 第二多的一行为「辅」，它与主的生克关系定器型：
 *       辅远少于主（纯） → 杖　　辅生主 → 扇　　主生辅 → 枪　　辅克主 → 刃　　主克辅 → 剑
 *   - 投入总量定品质：达到起步量为凡品，之后每翻一倍升一档
 */
export const FORGE_PURE = 0.25;
export function forgeBase(tier: number): number {
  return Math.round(30 * Math.pow(1.35, tier - 1));
}
export function forgeRarity(total: number, tier: number): GearRarity | -1 {
  const q = total / forgeBase(tier);
  if (q < 1) return -1;
  return Math.min(4, Math.floor(Math.log2(q) + 1e-9)) as GearRarity;
}
/** 达到某一档品质所需的投入总量 */
export function forgeNeed(rarity: number, tier: number): number {
  return forgeBase(tier) * Math.pow(2, rarity);
}

export interface ForgeOutcome {
  main: Wuxing;
  sub: Wuxing | null;
  kind: WeaponKind;
  /** 主辅关系的说明，如「木生火」 */
  why: string;
}
const WX_CN: Record<Wuxing, string> = {
  [Wuxing.METAL]: '金', [Wuxing.WOOD]: '木', [Wuxing.WATER]: '水', [Wuxing.FIRE]: '火', [Wuxing.EARTH]: '土',
};
export function forgeOutcome(amounts: Energy): ForgeOutcome | null {
  const sorted = WX_ORDER.map(wx => ({ wx, n: Math.max(0, amounts[wx] ?? 0) })).sort((a, b) => b.n - a.n);
  if (sorted[0].n <= 0) return null;
  const main = sorted[0].wx;
  const m = WX_CN[main];
  if (sorted[1].n < sorted[0].n * FORGE_PURE) return { main, sub: null, kind: '杖', why: `${m}气精纯` };
  const sub = sorted[1].wx;
  const u = WX_CN[sub];
  if (WUXING_GENERATES[sub] === main) return { main, sub, kind: '扇', why: `${u}生${m}` };
  if (WUXING_GENERATES[main] === sub) return { main, sub, kind: '枪', why: `${m}生${u}` };
  if (WUXING_CONQUERS[sub] === main) return { main, sub, kind: '刃', why: `${u}克${m}` };
  return { main, sub, kind: '剑', why: `${m}克${u}` };
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
  [Wuxing.METAL]: { wuxing: Wuxing.METAL, name: '锋锐', desc: '攻击 +10%　暴击 +0.8%' },
  [Wuxing.WOOD]:  { wuxing: Wuxing.WOOD,  name: '生机', desc: '生命 +15%　每秒回血 +1.2' },
  [Wuxing.WATER]: { wuxing: Wuxing.WATER, name: '流转', desc: '冷却 -1.5%　灵力上限 +10　移速 +1%' },
  [Wuxing.FIRE]:  { wuxing: Wuxing.FIRE,  name: '炽烈', desc: '暴伤 +10%　灼烧 +12%　技能范围 +2%' },
  [Wuxing.EARTH]: { wuxing: Wuxing.EARTH, name: '厚重', desc: '减伤 +1.8%　生命 +8%' },
};

export const MAX_CULT = 40;
/** 一个人最多同修几行 */
export const MAX_CULT_KINDS = 2;
/** 散功时返还已投入能量的比例 */
export const CULT_REFUND = 0.7;

/** 从 level 重升到下一重所需的本行能量 */
export function cultCost(level: number): number {
  return Math.round(10 + 8 * level + 1.2 * level * level);
}
/** 修到 level 重一共投入了多少 */
export function cultSpent(level: number): number {
  let n = 0;
  for (let i = 0; i < level; i++) n += cultCost(i);
  return n;
}
/** 已经在修的几行 */
export function cultKinds(cult: Energy): Wuxing[] {
  return WX_ORDER.filter(wx => (cult[wx] ?? 0) > 0);
}
/** 能否再升一重；不能时给出原因（slots = 已同修两行，这一行修不了） */
export function cultBlock(cult: Energy, energy: Energy, wx: Wuxing): '' | 'max' | 'slots' | 'energy' {
  const lv = cult[wx] ?? 0;
  if (lv >= MAX_CULT) return 'max';
  if (lv <= 0 && cultKinds(cult).length >= MAX_CULT_KINDS) return 'slots';
  if ((energy[wx] ?? 0) < cultCost(lv)) return 'energy';
  return '';
}

/** 境界：修为总和每 8 重一个大境界（同修两行，满 80 重） */
export const REALMS = ['凡胎', '炼气', '筑基', '金丹', '元婴', '化神', '炼虚', '合体', '大乘', '渡劫'] as const;
export const REALM_COLORS = [0x9fb3c8, 0x9fd8ff, 0x4ade80, 0xffe066, 0xffa31a, 0xff6a4c, 0xc084fc, 0xff4fd8, 0xfff3a0, 0xffffff] as const;
export function realmIndex(cult: Energy): number {
  return Math.min(REALMS.length - 1, Math.floor(energyTotal(cult) / 8));
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
  /** 一局最多能带回的五行能量（各行合计） */
  carry: number;
}

export const BASE_ATTACK = 10;
export const BASE_HP = 300;
/** 基础回血（每秒） */
export const BASE_REGEN = 2;
export const BASE_QI = 100;
/** 一局带回能量的上限：修为越深，容得下的越多 */
export const BASE_CARRY = 150;
export const CARRY_PER_LEVEL = 12;
export function carryCap(cult: Energy): number {
  return BASE_CARRY + CARRY_PER_LEVEL * energyTotal(cult);
}

/** 兵器词条 + 五行修为 → 属性 */
/**
 * 修为与兵器、技能的联动：修哪一行，同属的兵器和技能跟着变强。
 *  - 兵器：属性（含词条）每重 +2.5%
 *  - 技能：威力每重 +4%
 */
export const CULT_BOND = { weapon: 0.025, skill: 0.04 } as const;
const cultLv = (cult: Energy | null | undefined, wx: Wuxing): number => Math.max(0, Math.min(MAX_CULT, cult?.[wx] ?? 0));
export function weaponBond(cult: Energy | null | undefined, wx: Wuxing): number {
  return 1 + CULT_BOND.weapon * cultLv(cult, wx);
}
export function skillBond(cult: Energy | null | undefined, wx: Wuxing): number {
  return 1 + CULT_BOND.skill * cultLv(cult, wx);
}

/** 主修的那一行：修为最高的；一行都没修是 null。（早先开局要「择一道」，现在由修炼决定） */
export function mainWx(cult: Energy | null | undefined): Wuxing | null {
  let best: Wuxing | null = null, lv = 0;
  for (const wx of WX_ORDER) if ((cult?.[wx] ?? 0) > lv) { lv = cult![wx]; best = wx; }
  return best;
}

/** @param _path 已不参与计算（保留参数位，调用处不用改） */
export function computeStats(weapon: GearItem | null | undefined, _path: Wuxing | null | undefined, cult: Energy): PlayerStats {
  const sum: Record<StatKey, number> = { atk: 0, atkPct: 0, aspd: 0, crit: 0, critDmg: 0, area: 0, burn: 0 };
  if (weapon) {
    const m = gradeMult(weapon) * weaponBond(cult, weapon.wuxing);
    for (const l of [...weapon.base, ...weapon.affixes]) if (l.stat in sum) sum[l.stat] += l.value * m;
  }
  const c = (wx: Wuxing) => Math.max(0, Math.min(MAX_CULT, cult[wx] ?? 0));
  const metal = c(Wuxing.METAL), wood = c(Wuxing.WOOD), water = c(Wuxing.WATER), fire = c(Wuxing.FIRE), earth = c(Wuxing.EARTH);
  return {
    attack: Math.round((BASE_ATTACK + sum.atk) * (1 + (sum.atkPct + metal * 10) / 100)),
    maxHp: Math.round(BASE_HP * (1 + (wood * 15 + earth * 8) / 100)),
    aspd: Math.min(150, sum.aspd),
    crit: Math.min(75, 5 + sum.crit + metal * 0.8),
    critDmg: 50 + sum.critDmg + fire * 10,
    area: Math.min(120, sum.area + fire * 2),
    move: Math.min(60, water),
    dr: Math.min(70, earth * 1.8),
    cdr: Math.min(60, water * 1.5),
    burn: sum.burn + fire * 12,
    regen: BASE_REGEN + wood * 1.2,
    qiMax: BASE_QI + water * 10,
    carry: BASE_CARRY + CARRY_PER_LEVEL * (metal + wood + water + fire + earth),
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
