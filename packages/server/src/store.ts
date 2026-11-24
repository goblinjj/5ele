import { promises as fs, existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import {
  GearItem, Equipped, emptyEquipped, ProfileView, Wuxing,
} from '@xiyou/shared';

/**
 * 玩家存档：每个设备一个 JSON 文件，放在数据卷里。
 * 写入先落临时文件再改名，进程中途被杀也不会写坏存档。
 */

export const STASH_CAP = 60;
const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
const PLAYER_DIR = path.join(DATA_DIR, 'players');

export interface Profile {
  did: string;
  name: string;
  path: Wuxing | null;
  stash: GearItem[];
  equip: Equipped;
  mats: number;
  autoSalvage: number;
  maxTier: number;
  best: Record<number, number>;
  created: number;
  seen: number;
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
      did, name: cleanName(name), path: null, stash: [], equip: emptyEquipped(),
      mats: 0, autoSalvage: -1, maxTier: 1, best: {}, created: Date.now(), seen: Date.now(),
    };
    dirty.add(did);
  }
  // 兼容旧存档字段
  p.equip = { ...emptyEquipped(), ...p.equip };
  p.best ??= {};
  p.seen = Date.now();
  cache.set(did, p);
  return p;
}

export function markDirty(p: Profile): void {
  dirty.add(p.did);
}

export function viewOf(p: Profile): ProfileView {
  return {
    name: p.name, path: p.path, stash: p.stash, stashCap: STASH_CAP, equip: p.equip,
    mats: p.mats, autoSalvage: p.autoSalvage, maxTier: p.maxTier, best: p.best,
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
