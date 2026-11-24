import {
  GearItem, GearSlot, EquipSlotKey, SETS, SetId, pieceKey, craftCost, refineCost, MAX_GRADE,
  generateSetPiece, bestSlotFor, computeStats, powerOf, displayName,
} from '@xiyou/shared';
import { Profile, STASH_CAP } from './store.js';

/**
 * 图鉴（套装收藏）与炼器
 *
 * 图鉴里收着的套装件不占灵囊；登记过的部件永久计入图鉴加成。
 * 套装件卸下时，若图鉴里该部件位还空着，自动收回图鉴。
 */

type Result = { ok: true; msg?: string } | { ok: false; msg: string };

const keyOf = (it: GearItem) => (it.set !== undefined && it.piece !== undefined ? pieceKey(it.set, it.piece) : '');

/** 单件强弱（只看这件自身，用来决定图鉴里留哪一件） */
function itemScore(p: Profile, it: GearItem): number {
  const slot = it.slot === GearSlot.CHARM ? 'charm1' : (it.slot as EquipSlotKey);
  return powerOf(computeStats({ weapon: null, armor: null, charm1: null, charm2: null, relic: null, [slot]: it }, p.path));
}

/** 放回：登记过且图鉴空位的套装件回图鉴，其余进灵囊 */
export function putBack(p: Profile, it: GearItem): boolean {
  const k = keyOf(it);
  if (k && p.codex.includes(k) && !p.vault.some(v => keyOf(v) === k)) {
    p.vault.push(it);
    return true;
  }
  if (p.stash.length >= STASH_CAP) return false;
  p.stash.push(it);
  return true;
}

export function register(p: Profile, id: string): Result {
  const idx = p.stash.findIndex(it => it.id === id);
  if (idx < 0) return { ok: false, msg: '找不到这件装备' };
  const it = p.stash[idx];
  const k = keyOf(it);
  if (!k) return { ok: false, msg: '只有套装件可以登记' };
  const fresh = !p.codex.includes(k);
  const old = p.vault.find(v => keyOf(v) === k);
  p.stash.splice(idx, 1);
  if (old) {
    // 图鉴里已有同一部件：留更强的那件，另一件回灵囊
    if (itemScore(p, old) >= itemScore(p, it)) {
      p.stash.splice(idx, 0, it);
      return { ok: false, msg: `图鉴中的 ${displayName(old)} 更强，未替换` };
    }
    p.vault = p.vault.filter(v => v !== old);
    p.stash.splice(idx, 0, old);
  }
  p.vault.push(it);
  if (fresh) p.codex.push(k);
  return { ok: true, msg: fresh ? `${it.name} 已登记 · 图鉴加成 +1%` : `已用 ${displayName(it)} 替换图鉴中的旧件` };
}

/** 从图鉴取出并直接穿上 */
export function withdraw(p: Profile, id: string, slot?: EquipSlotKey): Result {
  const it = p.vault.find(v => v.id === id);
  if (!it) return { ok: false, msg: '图鉴里没有这件' };
  slot ??= bestSlotFor(p.equip, p.path, it);
  const old = p.equip[slot];
  p.vault = p.vault.filter(v => v !== it);
  p.equip[slot] = it;
  if (old && !putBack(p, old)) {
    // 放不回去就撤销
    p.equip[slot] = old;
    p.vault.push(it);
    return { ok: false, msg: '灵囊已满，先整理一下' };
  }
  return { ok: true };
}

export function wearSet(p: Profile, setId: string): Result {
  const set = SETS[setId as SetId];
  if (!set) return { ok: false, msg: '没有这套' };
  const pieces = p.vault.filter(v => v.set === set.id).sort((a, b) => (a.piece ?? 0) - (b.piece ?? 0));
  if (!pieces.length) return { ok: false, msg: '图鉴里还没有这套的部件' };
  let charm = 0;
  for (const it of pieces) {
    const slot: EquipSlotKey = it.slot === GearSlot.CHARM ? (charm++ === 0 ? 'charm1' : 'charm2') : (it.slot as EquipSlotKey);
    const r = withdraw(p, it.id, slot);
    if (!r.ok) return r;
  }
  return { ok: true, msg: `已换上${set.name}（${pieces.length} 件）` };
}

export function craft(p: Profile, setId: string, piece: number): Result {
  const set = SETS[setId as SetId];
  if (!set || !set.pieces[piece]) return { ok: false, msg: '没有这个部件' };
  if (p.maxTier < set.lo) return { ok: false, msg: `需要先解锁${set.lo}重天` };
  const cost = craftCost(set);
  if ((p.essence[set.lo] ?? 0) < cost.essence) return { ok: false, msg: `需要 ${set.lo} 重天精魄 ×${cost.essence}` };
  if (p.mats < cost.mats) return { ok: false, msg: `需要玄晶 ×${cost.mats}` };
  const tier = Math.max(set.lo, Math.min(set.hi, p.maxTier));
  const it = generateSetPiece(set.id, piece, tier);
  const k = keyOf(it);
  const hasCopy = p.vault.some(v => keyOf(v) === k);
  if (hasCopy && p.stash.length >= STASH_CAP) return { ok: false, msg: '灵囊已满' };
  p.essence[set.lo] -= cost.essence;
  p.mats -= cost.mats;
  const fresh = !p.codex.includes(k);
  if (fresh) p.codex.push(k);
  if (hasCopy) p.stash.push(it); else p.vault.push(it);
  return { ok: true, msg: `合成 ${it.name}${hasCopy ? '（已放入灵囊）' : fresh ? ' · 已登记' : ''}` };
}

/** 找到这件装备（灵囊 / 图鉴 / 身上都可以升阶） */
function findAnywhere(p: Profile, id: string): GearItem | null {
  return p.stash.find(i => i.id === id)
    ?? p.vault.find(i => i.id === id)
    ?? Object.values(p.equip).find(i => i?.id === id)
    ?? null;
}

export function refine(p: Profile, id: string): Result {
  const it = findAnywhere(p, id);
  if (!it) return { ok: false, msg: '找不到这件装备' };
  const g = it.grade ?? 0;
  if (g >= MAX_GRADE) return { ok: false, msg: '已是最高阶' };
  const cost = refineCost(it.tier, g);
  if ((p.essence[it.tier] ?? 0) < cost.essence) return { ok: false, msg: `需要 ${it.tier} 重天精魄 ×${cost.essence}` };
  if (p.mats < cost.mats) return { ok: false, msg: `需要玄晶 ×${cost.mats}` };
  p.essence[it.tier] -= cost.essence;
  p.mats -= cost.mats;
  it.grade = g + 1;
  return { ok: true, msg: `${it.name} 升至 +${it.grade}` };
}
