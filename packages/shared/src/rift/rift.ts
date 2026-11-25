import { Wuxing, WUXING_CONQUERS, WUXING_GENERATES } from '../types/Wuxing.js';
import { PlayerStats, GearItem, Energy, WX_ORDER } from './gear.js';

/**
 * 秘境（刷怪副本）的共用参数：前后端必须一致
 */

export const RIFT_SIZE = 3200;
export const RIFT_CENTER = RIFT_SIZE / 2;
export const MAX_PARTY = 4;
/** 服务器模拟频率 / 快照频率 */
export const SERVER_TICK_MS = 50;
export const SNAPSHOT_EVERY = 2;

/** 净化进度满 100 时病变核心现身 */
export const PROGRESS_GOAL = 100;
export const PROGRESS_NORMAL = 0.45;
export const PROGRESS_ELITE = 5;

// ───────────────────────── 五行之道 ─────────────────────────

export interface PathDef {
  wuxing: Wuxing;
  name: string;
  role: string;
  desc: string;
  available: boolean;
}

export const PATHS: Record<Wuxing, PathDef> = {
  [Wuxing.FIRE]:  { wuxing: Wuxing.FIRE,  name: '离火之道', role: '清群', desc: '兵器出手带火，燎原焚尽周身，焚天陨火砸落敌阵。技能要耗灵力，灵力靠吸纳妖异残留的能量。', available: true },
  [Wuxing.METAL]: { wuxing: Wuxing.METAL, name: '庚金之道', role: '点杀', desc: '锋锐穿透，暴击斩首。', available: false },
  [Wuxing.WATER]: { wuxing: Wuxing.WATER, name: '玄水之道', role: '控场', desc: '寒潮冻结，拉扯风筝。', available: false },
  [Wuxing.WOOD]:  { wuxing: Wuxing.WOOD,  name: '青木之道', role: '续航', desc: '生生不息，荆棘反噬。', available: false },
  [Wuxing.EARTH]: { wuxing: Wuxing.EARTH, name: '戊土之道', role: '坚守', desc: '磐石不动，防反震杀。', available: false },
};

/** 离火之道的技能参数 */
export const FIRE = {
  /** 兵器命中：引燃几率；杖的灵弹溅射 */
  igniteChance: 0.25,
  splashRadius: 85,
  splashMult: 0.45,
  /** 燎原：以自身为圆心的火环 */
  ringCd: 7000,
  ringCost: 30,
  ringRadius: 300,
  ringMult: 1.7,
  /** 焚天：陨火 */
  meteorCd: 11000,
  meteorCost: 50,
  meteorDelay: 650,
  meteorRadius: 230,
  meteorMult: 3.4,
  meteorRange: 620,
  /** 灼烧：每秒造成攻击力的 35% */
  burnDps: 0.35,
  burnMs: 4000,
} as const;

// ───────────────────────── 能量与灵力 ─────────────────────────

/**
 * 妖异溃散后留下一团与它同属的五行能量：
 *   - 收进存档，用于修炼与淬炼兵器（orbValue）
 *   - 同时化作局内的「灵力」，技能要有足够灵力才放得出（qiGain）
 */
export const QI_START = 50;
/** 一团能量的分量：层数越高越足；魁首 ×6，病变核心散成五行各一团 */
export function orbValue(tier: number, mtier: MonsterTier): number {
  const v = 1 + 0.6 * (tier - 1);
  return Math.max(1, Math.round(v * (mtier === 2 ? 8 : mtier === 1 ? 6 : 1)));
}
/** 一团能量化成多少灵力：生我之气最补，克我之气难以炼化 */
export function qiGain(path: Wuxing, wx: Wuxing, mtier: MonsterTier): number {
  const base = mtier === 0 ? 6 : 20;
  let m = 1;
  if (WUXING_GENERATES[wx] === path) m = 1.5;
  else if (wx === path) m = 1.2;
  else if (WUXING_CONQUERS[wx] === path) m = 0.6;
  return Math.round(base * m);
}
export const ORB_MAGNET = 230;
export const ORB_PICK = 46;
export function wxIndex(wx: Wuxing): number {
  return WX_ORDER.indexOf(wx);
}

/** 遁 / 御 */
export const DODGE = { speed: 1350, duration: 170, cooldown: 2600, invuln: 340 } as const;
export const GUARD = { duration: 520, cooldown: 1500, parryWindow: 230, blockMult: 0.3 } as const;
/** 防反：反震伤害（自身攻击力倍数）与妖异硬直；完美闪避赐予的必暴火球 */
export const PARRY_MULT = 4;
export const STAGGER_MS = 1700;
export const STAGGER_BONUS = 1.5;
export const PERFECT_DODGE_CRITS = 4;

export const PLAYER_BASE_SPEED = 410;
export const PICKUP_RADIUS = 110;
export const REVIVE_RADIUS = 140;
export const REVIVE_MS = 2500;

/** 冷却缩减后的冷却时间 */
export function withCdr(ms: number, s: Pick<PlayerStats, 'cdr'>): number {
  return ms * (1 - s.cdr / 100);
}
/** 兵器出手间隔 */
export function attackInterval(form: { interval: number }, s: Pick<PlayerStats, 'aspd'>): number {
  return form.interval / (1 + s.aspd / 100);
}
export function meteorCd(s: Pick<PlayerStats, 'cdr'>): number {
  return withCdr(FIRE.meteorCd, s);
}

// ───────────────────────── 五行克制 ─────────────────────────

/** 攻击方五行 → 防御方五行的伤害倍率（单修一道，倍率比旧版温和） */
export function wxMult(attacker: Wuxing, defender: Wuxing): number {
  if (attacker === defender) return 1;
  if (WUXING_CONQUERS[attacker] === defender) return 1.5;   // 我克彼
  if (WUXING_GENERATES[defender] === attacker) return 1.2;  // 彼生我：借其气
  if (WUXING_CONQUERS[defender] === attacker) return 0.7;   // 彼克我
  if (WUXING_GENERATES[attacker] === defender) return 0.8;  // 我生彼：泄气
  return 1;
}

// ───────────────────────── 秘境层数 ─────────────────────────

export function tierHpMult(tier: number): number {
  return Math.pow(1.34, tier - 1);
}
export function tierDmgMult(tier: number): number {
  return 0.65 * Math.pow(1.22, tier - 1);
}
/** 组队时妖异血量加成 */
export function partyHpMult(n: number): number {
  return 1 + 0.65 * (Math.max(1, n) - 1);
}

// ───────────────────────── 妖异 ─────────────────────────

export type MonsterKind = 'charger' | 'swift' | 'caster' | 'brute' | 'slammer';
export type MonsterTier = 0 | 1 | 2; // 普通 / 魁首 / 病变核心

export interface MonsterDef {
  kind: MonsterKind;
  name: string;
  /** 客户端图集目录名 */
  atlas: string;
  wuxing: Wuxing;
  hp: number;
  dmg: number;
  speed: number;
  /** 发起攻击的距离 */
  reach: number;
  windup: number;
  cooldown: number;
  /** 圆形攻击半径 / 冲锋长度 */
  size: number;
}

export const MONSTERS: MonsterDef[] = [
  { kind: 'charger', name: '獠牙怪', atlas: '獠牙怪', wuxing: Wuxing.METAL, hp: 34, dmg: 20, speed: 175, reach: 380, windup: 620, cooldown: 2600, size: 440 },
  { kind: 'swift',   name: '青鳞蛇', atlas: '青鳞蛇', wuxing: Wuxing.WATER, hp: 24, dmg: 13, speed: 265, reach: 120, windup: 430, cooldown: 1500, size: 110 },
  { kind: 'caster',  name: '赤狐精', atlas: '赤狐精', wuxing: Wuxing.FIRE,  hp: 26, dmg: 16, speed: 165, reach: 520, windup: 650, cooldown: 2400, size: 0 },
  { kind: 'brute',   name: '树妖',   atlas: '树妖',   wuxing: Wuxing.WOOD,  hp: 52, dmg: 24, speed: 145, reach: 140, windup: 720, cooldown: 2200, size: 135 },
  { kind: 'slammer', name: '石头精', atlas: '石头精', wuxing: Wuxing.EARTH, hp: 46, dmg: 26, speed: 135, reach: 170, windup: 900, cooldown: 2800, size: 185 },
];

export const ELITE = { hpMult: 7, dmgMult: 1.6, sizeMult: 1.35, speedMult: 1.08 } as const;
export const BOSS = { hpMult: 42, dmgMult: 1.5, speed: 120, size: 260 } as const;
export const ENEMY_BOLT_SPEED = 520;

// ───────────────────────── 通信协议 ─────────────────────────

/** 存档中给客户端看的部分 */
export interface ProfileView {
  name: string;
  path: Wuxing | null;
  /** 手里的兵器 */
  weapon: GearItem | null;
  /** 兵匣：备用兵器 */
  stash: GearItem[];
  stashCap: number;
  /** 五行能量（可花费） */
  energy: Energy;
  /** 五行修为（每行的重数） */
  cult: Energy;
  /** 小于等于这个品质的兵器拾取时自动化去；-1 = 不化 */
  autoSalvage: number;
  maxTier: number;
  /** 各层最快通关（毫秒） */
  best: Record<number, number>;
}

export interface RoomPlayerView {
  id: string;
  name: string;
  path: Wuxing | null;
  power: number;
  host: boolean;
}

export interface RoomView {
  code: string;
  tier: number;
  maxTier: number;
  players: RoomPlayerView[];
  state: 'lobby' | 'run';
}

/** 秘境中一名玩家的公开信息 */
export interface RunPlayerInfo {
  id: string;
  name: string;
  path: Wuxing;
  stats: PlayerStats;
  /** 兵器与修为（用于外显） */
  weapon: GearItem | null;
  cult: Energy;
}

/**
 * 敌方攻击：
 *   circle —— 以 (x,y) 为圆心、半径 r 的范围，在 windup 后结算
 *   lunge  —— 从 (x,y) 沿 (dx,dy) 冲锋 len 距离、宽 r 的矩形
 *   bolt   —— windup 后发射弹道（实际弹道在 bolts 消息里）
 */
export interface EnemyAttack {
  id: number;
  shape: 'circle' | 'lunge' | 'bolt';
  x: number;
  y: number;
  dx: number;
  dy: number;
  r: number;
  len: number;
  windup: number;
  dmg: number;
  wx: Wuxing;
}

export interface EnemyBoltSpawn {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  wx: Wuxing;
  /** 来源妖异 id，防反用 */
  src: number;
}

export interface SpawnInfo {
  id: number;
  /** MONSTERS 下标 */
  k: number;
  tier: MonsterTier;
  x: number;
  y: number;
  hp: number;
  max: number;
}

/** 玩家技能代号：b 兵器弹道 · A 燎原 · B 焚天 */
export type SkillCode = 'b' | 'A' | 'B';

export type C2S =
  | { t: 'hello'; did: string; name?: string }
  | { t: 'name'; name: string }
  | { t: 'path'; path: Wuxing }
  /** 换上兵匣里的兵器 */
  | { t: 'equip'; id: string }
  /** 化去兵器，返还同属能量 */
  | { t: 'salvage'; ids: string[] }
  | { t: 'autoSalvage'; r: number }
  /** 修炼：某一行升一重 */
  | { t: 'cultivate'; wx: Wuxing }
  /** 淬炼兵器：升一阶 */
  | { t: 'refine'; id: string }
  | { t: 'create'; tier: number }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'tier'; tier: number }
  | { t: 'start' }
  /** 位置：x, y, 朝向(±1), 动作(0 站 1 跑 2 遁 3 御) */
  | { t: 'mv'; x: number; y: number; f: number; a: number }
  /** 远程兵器的一发弹道命中 */
  | { t: 'hit'; s: SkillCode; id: number; x: number; y: number }
  /** 近战兵器的一次挥击，扫中的妖异 */
  | { t: 'swing'; ids: number[] }
  | { t: 'cast'; s: SkillCode; x: number; y: number }
  | { t: 'hp'; hp: number }
  | { t: 'parry'; id: number }
  | { t: 'pdodge' }
  /** 吸纳一团能量 / 拾取一件兵器 */
  | { t: 'orb'; id: number }
  | { t: 'pick'; id: string }
  | { t: 'exit' }
  /** 秘境场景已就绪：服务器重发当前全部状态 */
  | { t: 'ready' }
  | { t: 'ping'; c: number };

export type S2C =
  | { t: 'profile'; p: ProfileView }
  | { t: 'err'; msg: string }
  | { t: 'toast'; msg: string }
  | { t: 'room'; room: RoomView | null }
  | { t: 'runStart'; tier: number; you: string; players: RunPlayerInfo[] }
  /** 快照：e = [id,x,y,hp,flags]*，p = [idx,x,y,f,a,hp,max,down]* ；flags: 1 硬直 2 灼烧 */
  | { t: 'snap'; e: number[]; p: (number | string)[]; prog: number; ms: number }
  | { t: 'spawn'; list: SpawnInfo[] }
  /** 妖异溃散；orbs = 留给你的能量 [能量id, 五行下标, 分量]* */
  | { t: 'die'; id: number; by: number; orbs?: number[] }
  /** 补发地上的能量 [能量id, x, y, 五行下标, 分量, 妖异档次]* */
  | { t: 'orbs'; list: number[] }
  /** 灵力校正（服务器拒绝了一次施放时） */
  | { t: 'qi'; v: number }
  | { t: 'dmg'; d: number[] }
  | { t: 'atk'; a: EnemyAttack }
  | { t: 'bolts'; list: EnemyBoltSpawn[] }
  | { t: 'stag'; id: number; ms: number }
  | { t: 'cast'; p: number; s: SkillCode; x: number; y: number }
  | { t: 'loot'; id: string; x: number; y: number; item: GearItem }
  /** 兵器入匣；或被自动化去，返还 n 点 wx 能量 */
  | { t: 'got'; id: string; item?: GearItem; wx?: Wuxing; n?: number }
  | { t: 'boss'; id: number }
  | { t: 'down'; p: number }
  | { t: 'up'; p: number }
  | { t: 'end'; ok: boolean; ms: number; tier: number; kills: number[]; best: boolean; energy: Energy; items: GearItem[] }
  | { t: 'pong'; c: number };
