import {
  Wuxing, WX_ORDER, WUXING_NAMES, CULT, cultCost, cultBlock, motherOf, CULT_GAP,
  refineCost, refineRate, MAX_GRADE, GearItem, Energy, MAX_TIER,
  forgeBase, forgeRarity, forgeOutcome, generateItem, RARITY_NAMES,
} from '@xiyou/shared';
import { Profile, STASH_CAP } from './store.js';

/**
 * 修炼、凝练、精炼：五行能量的三个去处
 */

type Result = { ok: true; msg?: string } | { ok: false; msg: string };

/** 修炼：某一行升一重，消耗本行能量 */
export function cultivate(p: Profile, wx: Wuxing): Result {
  if (!WX_ORDER.includes(wx)) return { ok: false, msg: '没有这一行' };
  const lv = p.cult[wx];
  const block = cultBlock(p.cult, p.energy, wx);
  if (block === 'max') return { ok: false, msg: `${WUXING_NAMES[wx]}行已修至圆满` };
  if (block === 'mother') {
    const m = motherOf(wx);
    return { ok: false, msg: `${WUXING_NAMES[m]}生${WUXING_NAMES[wx]}：${WUXING_NAMES[wx]}行最多高出${WUXING_NAMES[m]}行 ${CULT_GAP} 重，先修${WUXING_NAMES[m]}行` };
  }
  if (block === 'energy') return { ok: false, msg: `${WUXING_NAMES[wx]}行能量不足（${p.energy[wx]}/${cultCost(lv)}）` };
  p.energy[wx] -= cultCost(lv);
  p.cult[wx] = lv + 1;
  return { ok: true, msg: `${WUXING_NAMES[wx]}行·${CULT[wx].name} 升至 ${lv + 1} 重` };
}

/** 精炼：兵器尝试升一阶。能量先扣，成败另算——失败不退 */
export function refine(p: Profile, id: string): Result {
  const it: GearItem | undefined = p.weapon?.id === id ? p.weapon : p.stash.find(i => i.id === id);
  if (!it) return { ok: false, msg: '找不到这件兵器' };
  const g = it.grade ?? 0;
  if (g >= MAX_GRADE) return { ok: false, msg: '已精炼至最高阶' };
  const cost = refineCost(it);
  if (p.energy[it.wuxing] < cost) return { ok: false, msg: `${WUXING_NAMES[it.wuxing]}行能量不足（${p.energy[it.wuxing]}/${cost}）` };
  p.energy[it.wuxing] -= cost;
  if (Math.random() * 100 >= refineRate(g)) {
    return { ok: true, msg: `精炼失败 · ${cost} 点${WUXING_NAMES[it.wuxing]}行能量散尽` };
  }
  it.grade = g + 1;
  return { ok: true, msg: `精炼成功 · ${it.name} +${it.grade}` };
}

/** 凝练：投入五行能量凝成兵器；主辅两行的生克定器型，总量定品质 */
export function forge(p: Profile, tier: number, raw: unknown): Result {
  tier = Math.max(1, Math.min(Math.min(MAX_TIER, p.maxTier), tier | 0));
  const amounts = {} as Energy;
  let total = 0;
  for (const wx of WX_ORDER) {
    const n = Math.floor(Number((raw as any)?.[wx]) || 0);
    if (n < 0 || n > p.energy[wx]) return { ok: false, msg: `${WUXING_NAMES[wx]}行能量不足` };
    amounts[wx] = n;
    total += n;
  }
  const out = forgeOutcome(amounts);
  const rarity = forgeRarity(total, tier);
  if (!out || rarity < 0) return { ok: false, msg: `能量太少，凝不成形（至少 ${forgeBase(tier)}）` };
  if (p.weapon && p.stash.length >= STASH_CAP) return { ok: false, msg: '兵匣已满，先化去几件' };
  for (const wx of WX_ORDER) p.energy[wx] -= amounts[wx];
  const it = generateItem(tier, rarity as 0 | 1 | 2 | 3 | 4, out.main, out.kind);
  // 空手时直接握在手里
  if (!p.weapon) p.weapon = it; else p.stash.push(it);
  return { ok: true, msg: `凝成 ${RARITY_NAMES[it.rarity]}·${it.name}` };
}
