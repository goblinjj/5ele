import { promises as fs, existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import {
  GearItem, ProfileView, Wuxing, computeStats, Energy, emptyEnergy, WX_ORDER, WEAPON_KINDS,
  kindOf, salvageValue, MAX_CULT,
} from '@xiyou/shared';

/**
 * 玩家存档：每个设备一个 JSON 文件，放在数据卷里。
 * 写入先落临时文件再改名，进程中途被杀也不会写坏存档。
 */

export const STASH_CAP = 24;
const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const PLAYER_DIR = path.join(DATA_DIR, 'players');

export interface Profile {
  did: string;
  name: string;
  path: Wuxing | null;
  /** 手里的兵器 */
  weapon: GearItem | null;
  /** 兵匣 */
  stash: GearItem[];
  /** 五行能量与五行修为 */
  energy: Energy;
  cult: Energy;
  maxTier: number;
  best: Record<number, number>;
  created: number;
  seen: number;
}

/**
 * 旧存档（五个装备栏 + 套装图鉴 + 玄晶 / 精魄）迁移到「只有兵器 + 五行能量」：
 *   - 兵器保留（身上的、灵囊里的、图鉴里的）
 *   - 其余装备按品质化成与它同属的能量；玄晶、精魄折成五行能量平分
 */
function migrate(raw: any): void {
  const energy: Energy = { ...emptyEnergy(), ...(raw.energy ?? {}) };
  const isWeapon = (it: any) => it && (it.slot === undefined || it.slot === 'weapon');
  const clean = (it: any): GearItem => ({
    id: it.id, name: it.name, rarity: it.rarity, tier: it.tier, wuxing: it.wuxing,
    base: (it.base ?? []).filter((l: any) => l.stat === 'atk'),
    affixes: (it.affixes ?? []).filter((l: any) => ['atk', 'atkPct', 'aspd', 'crit', 'critDmg', 'area', 'burn'].includes(l.stat)),
    kind: kindOf(it), ...(it.grade ? { grade: it.grade } : {}),
  });
  const melt = (it: any) => {
    if (!it || !WX_ORDER.includes(it.wuxing)) return;
    energy[it.wuxing as Wuxing] += salvageValue({ rarity: it.rarity ?? 0, tier: it.tier ?? 1, grade: it.grade }) * (it.set ? 2 : 1);
  };

  if (raw.equip) {
    const eq = raw.equip;
    const weapons: GearItem[] = [];
    for (const it of [...(raw.stash ?? []), ...(raw.vault ?? [])]) {
      if (isWeapon(it)) weapons.push(clean(it)); else melt(it);
    }
    for (const key of ['armor', 'charm1', 'charm2', 'relic']) melt(eq[key]);
    raw.weapon = eq.weapon ? clean(eq.weapon) : null;
    raw.stash = weapons;
    const mats = Number(raw.mats) || 0;
    let ess = 0;
    for (const [tier, n] of Object.entries(raw.essence ?? {})) ess += (Number(n) || 0) * 10 * (Number(tier) || 1);
    const share = Math.round((mats + ess) / 5);
    WX_ORDER.forEach(wx => { energy[wx] += share; });
    delete raw.equip; delete raw.vault; delete raw.autoSalvage; delete raw.codex; delete raw.mats; delete raw.essence;
  }
  raw.weapon ??= null;
  raw.stash = (raw.stash ?? []).filter((it: any) => it && WEAPON_KINDS.includes(it.kind));
  // 兵匣放不下的化成能量
  if (raw.stash.length > STASH_CAP) {
    raw.stash.sort((a: GearItem, b: GearItem) => b.rarity - a.rarity || b.tier - a.tier);
    while (raw.stash.length > STASH_CAP) melt(raw.stash.pop());
  }
  raw.energy = energy;
  raw.cult = { ...emptyEnergy(), ...(raw.cult ?? {}) };
  WX_ORDER.forEach(wx => {
    raw.energy[wx] = Math.max(0, Math.round(Number(raw.energy[wx]) || 0));
    raw.cult[wx] = Math.max(0, Math.min(MAX_CULT, Math.round(Number(raw.cult[wx]) || 0)));
  });
}

if (!existsSync(PLAYER_DIR)) mkdirSync(PLAYER_DIR, { recursive: true });

const cache = new Map<string, Profile>();
const dirty = new Set<string>();
let flushing = false;

function fileOf(did: string): string {
  return path.join(PLAYER_DIR, `${did}.json`);
}

/** 设备号只允许安全字符，防止路径穿越 */
export function validDid(did: unknown): did is string {
  return typeof did === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(did);
}

export function cleanName(name: unknown): string {
  const s = typeof name === 'string' ? name.replace(/[\s\u0000-\u001f<>]/g, '').slice(0, 10) : '';
  return s || `残魂${Math.floor(Math.random() * 9000 + 1000)}`;
}

export function loadProfile(did: string, name?: string): Profile {
  const hit = cache.get(did);
  if (hit) return hit;
  let p: Profile | null = null;
  const f = fileOf(did);
  if (existsSync(f)) {
    try {
      p = JSON.parse(readFileSync(f, 'utf8')) as Profile;
    } catch (e) {
      console.error('存档损坏，备份后重建', did, e);
      fs.rename(f, `${f}.broken-${Date.now()}`).catch(() => {});
    }
  }
  if (!p) {
    p = {
      did, name: cleanName(name), path: null, weapon: null, stash: [],
      energy: emptyEnergy(), cult: emptyEnergy(), maxTier: 1, best: {}, created: Date.now(), seen: Date.now(),
    };
    dirty.add(did);
  }
  // 兼容旧存档字段
  if ((p as any).equip) dirty.add(did);
  migrate(p);
  p.best ??= {};
  p.seen = Date.now();
  cache.set(did, p);
  return p;
}

/** 按存档算属性（兵器 + 五行修为） */
export function statsOf(p: Profile) {
  return computeStats(p.weapon, p.path, p.cult);
}

export function markDirty(p: Profile): void {
  dirty.add(p.did);
}

export function viewOf(p: Profile): ProfileView {
  return {
    name: p.name, path: p.path, weapon: p.weapon, stash: p.stash, stashCap: STASH_CAP,
    energy: p.energy, cult: p.cult, maxTier: p.maxTier, best: p.best,
  };
}

export async function flush(): Promise<void> {
  if (flushing || dirty.size === 0) return;
  flushing = true;
  const ids = [...dirty];
  dirty.clear();
  try {
    for (const did of ids) {
      const p = cache.get(did);
      if (!p) continue;
      const f = fileOf(did);
      const tmp = `${f}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(p));
      await fs.rename(tmp, f);
    }
  } catch (e) {
    console.error('存档写入失败', e);
    ids.forEach(id => dirty.add(id));
  } finally {
    flushing = false;
  }
}

setInterval(() => { flush(); }, 3000);
