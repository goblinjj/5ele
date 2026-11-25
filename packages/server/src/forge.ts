import {
  Wuxing, WX_ORDER, WUXING_NAMES, CULT, cultCost, cultBlock, motherOf, CULT_GAP,
  refineCost, MAX_GRADE, GearItem,
} from '@xiyou/shared';
import { Profile } from './store.js';

/**
 * 修炼与淬炼：五行能量的两个去处
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

/** 淬炼：兵器升一阶，消耗与兵器同属的能量（手里的和兵匣里的都可以） */
export function refine(p: Profile, id: string): Result {
  const it: GearItem | undefined = p.weapon?.id === id ? p.weapon : p.stash.find(i => i.id === id);
  if (!it) return { ok: false, msg: '找不到这件兵器' };
  const g = it.grade ?? 0;
  if (g >= MAX_GRADE) return { ok: false, msg: '已淬炼至最高阶' };
  const cost = refineCost(it);
  if (p.energy[it.wuxing] < cost) return { ok: false, msg: `${WUXING_NAMES[it.wuxing]}行能量不足（${p.energy[it.wuxing]}/${cost}）` };
  p.energy[it.wuxing] -= cost;
  it.grade = g + 1;
  return { ok: true, msg: `${it.name} 淬炼至 +${it.grade}` };
}
