import { Wuxing, WUXING_CONQUERS, WUXING_GENERATES } from '../types/Wuxing.js';
import { PlayerStats, LegendId } from './gear.js';

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
  [Wuxing.FIRE]:  { wuxing: Wuxing.FIRE,  name: '离火之道', role: '清群', desc: '火球自动追敌，燎原焚尽周身，焚天陨火砸落敌阵。灼烧可以层层蔓延。', available: true },
  [Wuxing.METAL]: { wuxing: Wuxing.METAL, name: '庚金之道', role: '点杀', desc: '锋锐穿透，暴击斩首。', available: false },
  [Wuxing.WATER]: { wuxing: Wuxing.WATER, name: '玄水之道', role: '控场', desc: '寒潮冻结，拉扯风筝。', available: false },
  [Wuxing.WOOD]:  { wuxing: Wuxing.WOOD,  name: '青木之道', role: '续航', desc: '生生不息，荆棘反噬。', available: false },
  [Wuxing.EARTH]: { wuxing: Wuxing.EARTH, name: '戊土之道', role: '坚守', desc: '磐石不动，防反震杀。', available: false },
};

/** 离火之道的技能参数 */
export const FIRE = {
  /** 火球：自动攻击 */
  boltInterval: 640,
  boltRange: 560,
  boltSpeed: 1150,
  boltMult: 1.0,
  splashRadius: 85,
  splashMult: 0.45,
  igniteChance: 0.25,
  /** 赤炎羽：迸裂流火 */
  splitCount: 3,
  splitMult: 0.45,
  splitRange: 260,
  /** 燎原：以自身为圆心的火环 */
  ringCd: 7000,
  ringRadius: 300,
  ringMult: 1.7,
  /** 焚天：陨火 */
  meteorCd: 11000,
  meteorDelay: 650,
  meteorRadius: 230,
  meteorMult: 3.4,
  meteorRange: 620,
  sealMeteors: 3,
  sealMult: 0.75,
  sealCdr: 0.3,
  /** 灼烧：每秒造成攻击力的 35% */
  burnDps: 0.35,
  burnMs: 4000,
  /** 燎原之心爆裂 */
  heartRadius: 180,
  heartMult: 0.9,
} as const;

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
export function boltInterval(s: Pick<PlayerStats, 'aspd'>): number {
  return FIRE.boltInterval / (1 + s.aspd / 100);
}
export function meteorCd(s: Pick<PlayerStats, 'cdr' | 'legends'>): number {
  return withCdr(FIRE.meteorCd, s) * (s.legends.includes('fentian_seal') ? 1 - FIRE.sealCdr : 1);
}
export function hasLegend(s: { legends: LegendId[] }, id: LegendId): boolean {
  return s.legends.includes(id);
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
  stash: import('./gear.js').GearItem[];
  stashCap: number;
  equip: import('./gear.js').Equipped;
  mats: number;
  /** 小于等于这个品质的装备拾取时自动分解；-1 = 不分解 */
  autoSalvage: number;
  maxTier: number;
  /** 各层最快通关（毫秒） */
  best: Record<number, number>;
  /** 图鉴：已登记的部件键（永久） */
  codex: string[];
  /** 图鉴里收着的套装件（不占灵囊） */
  vault: import('./gear.js').GearItem[];
  /** 各层精魄 */
  essence: Record<number, number>;
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
  /** 身上的装备（用于外显） */
  equip: import('./gear.js').Equipped;
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

/** 玩家技能代号：b 火球 · s 流火 · A 燎原 · B 焚天 · H 燎原之心爆裂 · m 焚炎陨火 · L 惊雷 · F 坤元火域（后四种仅表现） */
export type SkillCode = 'b' | 's' | 'A' | 'B' | 'H' | 'm' | 'L' | 'F';

export type C2S =
  | { t: 'hello'; did: string; name?: string }
  | { t: 'name'; name: string }
  | { t: 'path'; path: Wuxing }
  | { t: 'equip'; id: string; slot?: string }
  | { t: 'unequip'; slot: string }
  | { t: 'salvage'; ids: string[] }
  | { t: 'autoSalvage'; r: number }
  /** 图鉴：登记（灵囊 → 图鉴）/ 取出穿戴 / 穿上整套 / 合成缺的部件 */
  | { t: 'register'; id: string }
  | { t: 'withdraw'; id: string }
  | { t: 'wearSet'; set: string }
  | { t: 'craft'; set: string; piece: number }
  /** 炼器：升阶 */
  | { t: 'refine'; id: string }
  | { t: 'create'; tier: number }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'tier'; tier: number }
  | { t: 'start' }
  /** 位置：x, y, 朝向(±1), 动作(0 站 1 跑 2 遁 3 御), 生命 */
  | { t: 'mv'; x: number; y: number; f: number; a: number }
  | { t: 'hit'; s: SkillCode; id: number; x: number; y: number }
  | { t: 'cast'; s: SkillCode; x: number; y: number }
  | { t: 'hp'; hp: number }
  | { t: 'parry'; id: number }
  | { t: 'pdodge' }
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
  | { t: 'die'; id: number; by: number }
  | { t: 'dmg'; d: number[] }
  | { t: 'atk'; a: EnemyAttack }
  | { t: 'bolts'; list: EnemyBoltSpawn[] }
  | { t: 'stag'; id: number; ms: number }
  | { t: 'cast'; p: number; s: SkillCode; x: number; y: number }
  | { t: 'loot'; id: string; x: number; y: number; item: import('./gear.js').GearItem }
  | { t: 'got'; id: string; item?: import('./gear.js').GearItem; mats?: number }
  | { t: 'essence'; tier: number; n: number }
  | { t: 'boss'; id: number }
  | { t: 'down'; p: number }
  | { t: 'up'; p: number }
  | { t: 'end'; ok: boolean; ms: number; tier: number; kills: number[]; best: boolean; collected: number; mats: number; essence: number; items: import('./gear.js').GearItem[] }
  | { t: 'pong'; c: number };
