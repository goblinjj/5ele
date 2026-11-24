import { Wuxing, WUXING_CONQUERS, WUXING_GENERATES } from '../types/Wuxing.js';
import { GearSlot } from './slots.js';
import { SETS, SetId, SetFx, GRADE_STEP, CODEX_BONUS_PCT } from './sets.js';

export { GearSlot };

/**
 * 刷宝装备
 *
 * 五个栏位：武器 / 护甲 / 两枚佩饰 / 法宝。
 * 品质越高词条越多；传说（橙）额外带一条改变技能形态的「异能」。
 * 装备有五行属性，与玩家所修之道相合时数值更高（五行共鸣）。
 */

export const EQUIP_SLOTS = ['weapon', 'armor', 'charm1', 'charm2', 'relic'] as const;
export type EquipSlotKey = typeof EQUIP_SLOTS[number];
export type Equipped = Record<EquipSlotKey, GearItem | null>;

export function slotTypeOf(key: EquipSlotKey): GearSlot {
  if (key === 'weapon') return GearSlot.WEAPON;
  if (key === 'armor') return GearSlot.ARMOR;
  if (key === 'relic') return GearSlot.RELIC;
  return GearSlot.CHARM;
}

export const SLOT_NAME: Record<GearSlot, string> = {
  [GearSlot.WEAPON]: '武器',
  [GearSlot.ARMOR]: '护甲',
  [GearSlot.CHARM]: '佩饰',
  [GearSlot.RELIC]: '法宝',
};

/** 0 凡品（白）· 1 良品（绿）· 2 上品（蓝）· 3 极品（紫）· 4 传说（橙） */
export type GearRarity = 0 | 1 | 2 | 3 | 4;
export const RARITY_NAMES = ['凡品', '良品', '上品', '极品', '传说'] as const;
export const RARITY_COLORS = [0xc9d1d9, 0x4ade80, 0x58a6ff, 0xc084fc, 0xffa31a] as const;
export const RARITY_CSS = ['#c9d1d9', '#4ade80', '#58a6ff', '#c084fc', '#ffa31a'] as const;
/** 每档品质的随机词条数 */
const AFFIX_COUNT = [0, 1, 2, 3, 3];

// ───────────────────────── 属性 ─────────────────────────

export type StatKey =
  | 'atk' | 'atkPct' | 'aspd' | 'crit' | 'critDmg' | 'area' | 'move'
  | 'hp' | 'dr' | 'cdr' | 'burn' | 'pickup' | 'find' | 'regen';

interface StatDef {
  name: string;
  /** 百分比属性显示 % */
  pct: boolean;
  /** 一重天时的随机区间；flat 属性随层数成长更快 */
  range: [number, number];
  flat: boolean;
  /** 上限（百分比属性防止无限叠加） */
  cap?: number;
}

export const STAT_DEFS: Record<StatKey, StatDef> = {
  atk:     { name: '攻击',     pct: false, range: [2, 5],   flat: true },
  atkPct:  { name: '攻击',     pct: true,  range: [5, 12],  flat: false },
  aspd:    { name: '攻速',     pct: true,  range: [5, 12],  flat: false, cap: 150 },
  crit:    { name: '暴击率',   pct: true,  range: [3, 7],   flat: false, cap: 75 },
  critDmg: { name: '暴击伤害', pct: true,  range: [10, 25], flat: false },
  area:    { name: '技能范围', pct: true,  range: [6, 14],  flat: false, cap: 120 },
  move:    { name: '移速',     pct: true,  range: [4, 9],   flat: false, cap: 60 },
  hp:      { name: '生命',     pct: false, range: [25, 55], flat: true },
  dr:      { name: '减伤',     pct: true,  range: [3, 7],   flat: false, cap: 60 },
  cdr:     { name: '冷却缩减', pct: true,  range: [4, 9],   flat: false, cap: 50 },
  burn:    { name: '灼烧伤害', pct: true,  range: [12, 28], flat: false },
  pickup:  { name: '拾取范围', pct: true,  range: [15, 35], flat: false },
  find:    { name: '寻宝',     pct: true,  range: [6, 15],  flat: false, cap: 300 },
  regen:   { name: '每秒回血', pct: false, range: [1, 3],   flat: true },
};

/** 各栏位可以出现的随机词条 */
const SLOT_AFFIXES: Record<GearSlot, StatKey[]> = {
  [GearSlot.WEAPON]: ['atk', 'atkPct', 'aspd', 'crit', 'critDmg', 'burn', 'area'],
  [GearSlot.ARMOR]:  ['hp', 'dr', 'regen', 'move', 'atkPct', 'cdr', 'pickup'],
  [GearSlot.CHARM]:  ['crit', 'critDmg', 'aspd', 'move', 'find', 'pickup', 'hp', 'atk', 'burn'],
  [GearSlot.RELIC]:  ['cdr', 'area', 'burn', 'atkPct', 'find', 'regen', 'critDmg'],
};

export interface StatLine {
  stat: StatKey;
  value: number;
}

// ───────────────────────── 传说异能 ─────────────────────────

export type LegendId = 'liaoyuan_heart' | 'chiyan_feather' | 'fentian_seal' | 'jinwu_armor';

export interface LegendDef {
  id: LegendId;
  name: string;
  slot: GearSlot;
  wuxing: Wuxing;
  desc: string;
}

export const LEGENDS: Record<LegendId, LegendDef> = {
  chiyan_feather: {
    id: 'chiyan_feather', name: '赤炎羽', slot: GearSlot.WEAPON, wuxing: Wuxing.FIRE,
    desc: '火球命中后迸裂出 3 枚流火，各造成 45% 伤害',
  },
  jinwu_armor: {
    id: 'jinwu_armor', name: '金乌羽衣', slot: GearSlot.ARMOR, wuxing: Wuxing.FIRE,
    desc: '防反成功时立即释放一次燎原，并重置燎原冷却',
  },
  liaoyuan_heart: {
    id: 'liaoyuan_heart', name: '燎原之心', slot: GearSlot.CHARM, wuxing: Wuxing.FIRE,
    desc: '灼烧中的妖异死亡时爆裂，对周围造成 90% 伤害并引燃',
  },
  fentian_seal: {
    id: 'fentian_seal', name: '焚天印', slot: GearSlot.RELIC, wuxing: Wuxing.FIRE,
    desc: '焚天连落三颗陨火（每颗 75%），冷却缩短 30%',
  },
};

// ───────────────────────── 装备 ─────────────────────────

export interface GearItem {
  id: string;
  slot: GearSlot;
  name: string;
  rarity: GearRarity;
  /** 物品等级 = 掉落时的秘境层数 */
  tier: number;
  wuxing: Wuxing;
  /** 底材固有属性 */
  base: StatLine[];
  /** 随机词条 */
  affixes: StatLine[];
  legend?: LegendId;
  /** 器型：剑 刃 杖 枪 扇 / 甲 袍 衣 铠 / 佩 坠 环 珠 / 印 铃 镜 葫芦 塔（决定外观） */
  kind?: string;
  /** 升阶 0~10，每阶所有数值 +8% */
  grade?: number;
  /** 套装与部件序号 */
  set?: SetId;
  piece?: number;
}

const WX_PREFIX: Record<Wuxing, string> = {
  [Wuxing.METAL]: '庚金',
  [Wuxing.WOOD]: '青木',
  [Wuxing.WATER]: '玄水',
  [Wuxing.FIRE]: '离火',
  [Wuxing.EARTH]: '戊土',
};
const MATERIAL = ['', '粗铜', '寒铁', '玄铁', '精钢', '灵玉', '紫晶', '星陨', '太虚', '混元'];
const BASE_NAMES: Record<GearSlot, string[]> = {
  [GearSlot.WEAPON]: ['剑', '刃', '杖', '枪', '扇'],
  [GearSlot.ARMOR]: ['甲', '袍', '衣', '铠'],
  [GearSlot.CHARM]: ['佩', '坠', '环', '珠'],
  [GearSlot.RELIC]: ['印', '铃', '镜', '葫芦', '塔'],
};

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

function baseLines(slot: GearSlot, tier: number): StatLine[] {
  switch (slot) {
    case GearSlot.WEAPON: return [{ stat: 'atk', value: Math.round(rand(6, 9) * tierScale(tier, true)) }];
    case GearSlot.ARMOR: return [{ stat: 'hp', value: Math.round(rand(50, 80) * tierScale(tier, true)) }, { stat: 'dr', value: roll('dr', tier, 0.8) }];
    case GearSlot.CHARM: return [{ stat: pick(['crit', 'aspd', 'critDmg'] as StatKey[]), value: 0 }].map(l => ({ ...l, value: roll(l.stat, tier) }));
    case GearSlot.RELIC: return [{ stat: 'cdr', value: roll('cdr', tier) }, { stat: 'area', value: roll('area', tier, 0.8) }];
  }
}

let idSeq = 0;
export function newItemId(): string {
  idSeq = (idSeq + 1) % 1e6;
  return `${Date.now().toString(36)}${idSeq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** 生成一件装备 */
export function generateItem(tier: number, rarity: GearRarity, slot?: GearSlot, wuxing?: Wuxing): GearItem {
  slot ??= pick([GearSlot.WEAPON, GearSlot.WEAPON, GearSlot.ARMOR, GearSlot.ARMOR, GearSlot.CHARM, GearSlot.CHARM, GearSlot.RELIC]);
  let legend: LegendDef | undefined;
  if (rarity === 4) {
    const opts = Object.values(LEGENDS).filter(l => l.slot === slot);
    legend = opts.length ? pick(opts) : undefined;
  }
  const wx = legend?.wuxing ?? wuxing ?? pick(Object.values(Wuxing));
  const quality = 1 + rarity * 0.12;

  const pool = [...SLOT_AFFIXES[slot]];
  const affixes: StatLine[] = [];
  for (let i = 0; i < AFFIX_COUNT[rarity] && pool.length; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const stat = pool.splice(idx, 1)[0];
    affixes.push({ stat, value: roll(stat, tier, quality) });
  }

  const kind = legend ? LEGEND_KIND[legend.id] : pick(BASE_NAMES[slot]);
  const name = legend
    ? legend.name
    : `${WX_PREFIX[wx]}·${MATERIAL[Math.min(tier, MATERIAL.length - 1)]}${kind}`;

  return {
    id: newItemId(),
    slot,
    name,
    rarity,
    tier,
    wuxing: wx,
    base: baseLines(slot, tier).map(l => ({ ...l, value: STAT_DEFS[l.stat].flat ? Math.round(l.value * quality) : l.value })),
    affixes,
    legend: legend?.id,
    kind,
  };
}

const LEGEND_KIND: Record<LegendId, string> = {
  chiyan_feather: '扇', jinwu_armor: '衣', liaoyuan_heart: '珠', fentian_seal: '印',
};

/** 生成一件套装件（品质固定为极品，词条 2 条） */
export function generateSetPiece(setId: SetId, index: number, tier: number): GearItem {
  const set = SETS[setId];
  const p = set.pieces[index];
  const quality = 1 + 3 * 0.12;
  const pool = [...SLOT_AFFIXES[p.slot]];
  const affixes: StatLine[] = [];
  for (let i = 0; i < 2 && pool.length; i++) {
    const stat = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    affixes.push({ stat, value: roll(stat, tier, quality) });
  }
  return {
    id: newItemId(),
    slot: p.slot,
    name: p.name,
    rarity: 3,
    tier,
    wuxing: set.wuxing,
    base: baseLines(p.slot, tier).map(l => ({ ...l, value: STAT_DEFS[l.stat].flat ? Math.round(l.value * quality) : l.value })),
    affixes,
    kind: p.kind,
    set: setId,
    piece: index,
  };
}

/** 器型（旧存档没有 kind 字段时从名字末尾推断） */
export function kindOf(item: GearItem): string {
  if (item.kind) return item.kind;
  if (item.legend) return LEGEND_KIND[item.legend];
  for (const k of BASE_NAMES[item.slot]) if (item.name.endsWith(k)) return k;
  return BASE_NAMES[item.slot][0];
}

/** 装备显示颜色：套装用套装色，其余按品质 */
export function itemCss(item: GearItem): string {
  return item.set ? SETS[item.set].css : RARITY_CSS[item.rarity];
}
export function itemColor(item: GearItem): number {
  return item.set ? SETS[item.set].color : RARITY_COLORS[item.rarity];
}
export function gradeMult(item: GearItem): number {
  return 1 + (item.grade ?? 0) * GRADE_STEP;
}
export function displayName(item: GearItem): string {
  return item.grade ? `${item.name} +${item.grade}` : item.name;
}

/** 掉落品质：层数越高、寻宝越高，好东西越多 */
export function rollRarity(tier: number, findPct: number, minRarity: GearRarity = 0): GearRarity {
  const f = 1 + findPct / 100;
  const w = [
    55,
    30,
    12 * (1 + 0.12 * (tier - 1)) * f,
    2.6 * (1 + 0.3 * (tier - 1)) * f,
    0.45 * (1 + 0.4 * (tier - 1)) * f,
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

// ───────────────────────── 五行共鸣 ─────────────────────────

export type Resonance = 'same' | 'nourish' | 'clash' | 'none';

/** 装备五行与所修之道的关系：同道 +20%，生我 +10%，克我 -30% */
export function resonanceOf(path: Wuxing | null | undefined, item: Wuxing): Resonance {
  if (!path) return 'none';
  if (path === item) return 'same';
  if (WUXING_GENERATES[item] === path) return 'nourish';
  if (WUXING_CONQUERS[item] === path) return 'clash';
  return 'none';
}
export const RESONANCE_MULT: Record<Resonance, number> = { same: 1.2, nourish: 1.1, clash: 0.7, none: 1 };
export const RESONANCE_LABEL: Record<Resonance, string> = { same: '同道 +20%', nourish: '相生 +10%', clash: '相克 -30%', none: '' };

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
  pickup: number;
  find: number;
  regen: number;
  legends: LegendId[];
  /** 五件套效果 */
  setFx: SetFx[];
}

export const BASE_ATTACK = 10;
export const BASE_HP = 300;
/** 基础回血（每秒） */
export const BASE_REGEN = 2;

export function emptyEquipped(): Equipped {
  return { weapon: null, armor: null, charm1: null, charm2: null, relic: null };
}

/** 身上每套穿了几件 */
export function setCounts(eq: Equipped): Partial<Record<SetId, number>> {
  const out: Partial<Record<SetId, number>> = {};
  for (const key of EQUIP_SLOTS) {
    const it = eq[key];
    if (it?.set) out[it.set] = (out[it.set] ?? 0) + 1;
  }
  return out;
}

/**
 * 汇总属性
 * @param codexCount 图鉴已登记的套装件数（每件攻击与生命 +1%）
 */
export function computeStats(eq: Equipped, path: Wuxing | null | undefined, codexCount: number = 0): PlayerStats {
  const sum: Record<StatKey, number> = {
    atk: 0, atkPct: 0, aspd: 0, crit: 0, critDmg: 0, area: 0, move: 0,
    hp: 0, dr: 0, cdr: 0, burn: 0, pickup: 0, find: 0, regen: 0,
  };
  const legends: LegendId[] = [];
  for (const key of EQUIP_SLOTS) {
    const it = eq[key];
    if (!it) continue;
    const m = RESONANCE_MULT[resonanceOf(path, it.wuxing)] * gradeMult(it);
    for (const l of [...it.base, ...it.affixes]) sum[l.stat] += l.value * m;
    if (it.legend && !legends.includes(it.legend)) legends.push(it.legend);
  }
  // 套装加成（不受五行共鸣影响）
  const setFx: SetFx[] = [];
  const counts = setCounts(eq);
  for (const id of Object.keys(counts) as SetId[]) {
    const n = counts[id]!;
    const def = SETS[id];
    if (n >= 2) def.bonus2.forEach(l => { sum[l.stat] += l.value; });
    if (n >= 3) def.bonus3.forEach(l => { sum[l.stat] += l.value; });
    if (n >= 5) setFx.push(def.fx5);
  }
  const codexPct = codexCount * CODEX_BONUS_PCT;
  const cap = (k: StatKey, v: number) => Math.min(STAT_DEFS[k].cap ?? Infinity, v);
  return {
    attack: Math.round((BASE_ATTACK + sum.atk) * (1 + (sum.atkPct + codexPct) / 100)),
    maxHp: Math.round((BASE_HP + sum.hp) * (1 + codexPct / 100)),
    aspd: cap('aspd', sum.aspd),
    crit: cap('crit', 5 + sum.crit),
    critDmg: 50 + sum.critDmg,
    area: cap('area', sum.area),
    move: cap('move', sum.move),
    dr: cap('dr', sum.dr),
    cdr: cap('cdr', sum.cdr),
    burn: sum.burn,
    pickup: sum.pickup,
    find: cap('find', sum.find),
    regen: BASE_REGEN + sum.regen,
    legends,
    setFx,
  };
}

/** 战力：粗略衡量输出与生存，用于对比装备好坏 */
export function powerOf(s: PlayerStats): number {
  const dps = s.attack * (1 + (s.crit / 100) * (s.critDmg / 100)) * (1 + s.aspd / 100) * (1 + s.area / 250) * (1 + s.burn / 400) * (1 + s.cdr / 200);
  const tough = Math.sqrt((s.maxHp / BASE_HP) / (1 - s.dr / 100));
  return Math.round(dps * tough * 10 * (1 + s.legends.length * 0.12 + s.setFx.length * 0.15));
}

/** 把某件装备换到某个栏位后的属性（用于对比） */
export function statsWith(eq: Equipped, path: Wuxing | null | undefined, key: EquipSlotKey, item: GearItem | null, codexCount: number = 0): PlayerStats {
  return computeStats({ ...eq, [key]: item }, path, codexCount);
}

/** 一件装备应该放进哪个栏位：佩饰优先放空位，否则替换较弱的那个 */
export function bestSlotFor(eq: Equipped, path: Wuxing | null | undefined, item: GearItem): EquipSlotKey {
  if (item.slot !== GearSlot.CHARM) return item.slot as EquipSlotKey;
  if (!eq.charm1) return 'charm1';
  if (!eq.charm2) return 'charm2';
  const p1 = powerOf(statsWith(eq, path, 'charm1', item));
  const p2 = powerOf(statsWith(eq, path, 'charm2', item));
  return p1 >= p2 ? 'charm1' : 'charm2';
}

/** 分解所得玄晶 */
export function salvageValue(item: GearItem): number {
  return Math.round([1, 3, 8, 20, 60][item.rarity] * (item.set ? 2 : 1) * (1 + (item.grade ?? 0) * 0.5) * (1 + (item.tier - 1) * 0.3));
}

export function formatStat(l: StatLine): string {
  const d = STAT_DEFS[l.stat];
  const v = d.pct ? `${Math.round(l.value * 10) / 10}%` : `${Math.round(l.value)}`;
  return `${d.name} +${v}`;
}

/** 新玩家的第一件武器 */
export function starterWeapon(path: Wuxing): GearItem {
  const it = generateItem(1, 0, GearSlot.WEAPON, path);
  it.base = [{ stat: 'atk', value: 6 }];
  return it;
}
