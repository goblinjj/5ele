import { Wuxing, WUXING_CONQUERS, WUXING_GENERATES } from '../types/Wuxing.js';
import { PlayerStats, GearItem, Energy, WX_ORDER } from './gear.js';

/**
 * 秘境（刷怪副本）的共用参数：前后端必须一致
 */

export const RIFT_SIZE = 3200;
/**
 * 玩家一屏能看到的范围（以人为中心的半宽、半高，世界坐标）。
 * 对应客户端秘境镜头的缩放（RiftScene 的 RIFT_ZOOM），妖异要刷在这个范围之外。
 */
export const RIFT_VIEW = { halfW: 560, halfH: 1220 } as const;
export const RIFT_CENTER = RIFT_SIZE / 2;
export const MAX_PARTY = 4;
/** 服务器模拟频率 / 快照频率 */
export const SERVER_TICK_MS = 50;
export const SNAPSHOT_EVERY = 2;

/** 净化进度满 100 时病变核心现身 */
export const PROGRESS_GOAL = 100;
export const PROGRESS_NORMAL = 1.4;
export const PROGRESS_ELITE = 9;
/**
 * 砍怪的节奏：妖异少而耐打，一只要砍上好几下；平时在原地晃悠，人走近了才扑上来。
 *  - hpMult：普通妖异血量在图鉴数值上再乘多少
 *  - aggro / eliteAggro：多近才会被惊动；packAggro：一只被惊动，这么近的同伴一起上
 *  - leash：追出这么远就放弃；despawn：没被惊动、离所有人都这么远的，悄悄撤掉换一批
 */
export const PACING = { hpMult: 3, aggro: 380, eliteAggro: 480, packAggro: 280, leash: 980, despawn: 2100 } as const;

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
  ringRadius: 300,
  ringMult: 1.7,
  /** 焚天：陨火 */
  meteorDelay: 650,
  meteorRadius: 230,
  meteorMult: 3.4,
  meteorRange: 620,
  /** 灼烧：每秒造成攻击力的 35% */
  burnDps: 0.35,
  burnMs: 4000,
} as const;

// ───────────────────────── 技能：修习与熟练 ─────────────────────────

/**
 * 技能不是天生就会的：要用对应的五行能量修习才学得会。
 * 学会之后用得越多越熟练——每升一级熟练度，伤害更高、冷却更短。
 */
export type SkillId = 'ring' | 'meteor' | 'blades' | 'frost' | 'bloom' | 'bastion';
export interface SkillDef {
  id: SkillId;
  name: string;
  wuxing: Wuxing;
  /** 修习所需的本行能量 */
  learn: number;
  /** 每次施放消耗的灵力与冷却（毫秒） */
  qi: number;
  cd: number;
  desc: string;
}
export const SKILLS: Record<SkillId, SkillDef> = {
  ring:    { id: 'ring',    name: '燎原', wuxing: Wuxing.FIRE,  learn: 40,  qi: 30, cd: 7000,  desc: '以自身为圆心放出火环，灼烧周围的妖异' },
  meteor:  { id: 'meteor',  name: '焚天', wuxing: Wuxing.FIRE,  learn: 120, qi: 50, cd: 11000, desc: '召一颗陨火砸向妖异最密集处' },
  blades:  { id: 'blades',  name: '万剑', wuxing: Wuxing.METAL, learn: 80,  qi: 40, cd: 8000,  desc: '剑气分袭最近的几只妖异（越熟练越多），必定暴击' },
  frost:   { id: 'frost',   name: '寒潮', wuxing: Wuxing.WATER, learn: 80,  qi: 35, cd: 10000, desc: '寒气席卷四周，冻结妖异 2.2 秒' },
  bloom:   { id: 'bloom',   name: '回春', wuxing: Wuxing.WOOD,  learn: 80,  qi: 40, cd: 14000, desc: '回复自身 30% 生命，荆棘刺伤四周；附近同伴回复 20%' },
  bastion: { id: 'bastion', name: '磐石', wuxing: Wuxing.EARTH, learn: 80,  qi: 40, cd: 14000, desc: '震地伤敌，并得磐石护体 4 秒，所受伤害减少 70%' },
};
export const SKILL_ORDER: SkillId[] = ['ring', 'meteor', 'blades', 'frost', 'bloom', 'bastion'];
/** 一局最多携带几门技能 */
export const LOADOUT_MAX = 2;
/** 各技能的数值（熟练度另乘伤害倍率） */
export const SK = {
  blades:  { count: 6, range: 520, mult: 2.4 },
  frost:   { radius: 340, mult: 1.0, freezeMs: 2200 },
  bloom:   { heal: 0.3, mateHeal: 0.2, radius: 300, mult: 0.9 },
  bastion: { radius: 270, mult: 1.6, ms: 4000, block: 0.3 },
} as const;
/** 存档里记的是每个技能用过多少次；没有这一项 = 还没学会 */
export type SkillBook = Partial<Record<SkillId, number>>;

export const SKILL_MAX_LEVEL = 10;
export const SKILL_RANKS = ['初学', '入门', '小成', '熟练', '精通', '大成', '圆融', '通玄', '化境', '登峰', '造极'] as const;
/** 熟练到 level 级累计要用多少次 */
export function skillNeed(level: number): number {
  return 8 * level * level;
}
export function skillLevel(uses: number | undefined): number {
  if (uses === undefined) return -1;
  return Math.min(SKILL_MAX_LEVEL, Math.floor(Math.sqrt(Math.max(0, uses) / 8)));
}
/**
 * 技能范围随熟练度成长：刚学会只有四成半，每级 +5.5%，10 级才是完整范围。
 * 万剑则是剑气的数量随熟练度增加（3 → 6 道）。
 */
export function skillAreaMult(level: number): number {
  return 0.45 + 0.055 * Math.max(0, Math.min(SKILL_MAX_LEVEL, level));
}
/** 技能的作用半径：基础半径 × 熟练度 × 属性里的技能范围 */
export function skillRadius(id: SkillId, level: number, s: Pick<PlayerStats, 'area'>): number {
  const base = id === 'ring' ? FIRE.ringRadius : id === 'meteor' ? FIRE.meteorRadius
    : id === 'frost' ? SK.frost.radius : id === 'bloom' ? SK.bloom.radius : id === 'bastion' ? SK.bastion.radius : SK.blades.range;
  return base * skillAreaMult(level) * (id === 'blades' ? 1 : 1 + s.area / 100);
}
export function bladeCount(level: number): number {
  return Math.min(SK.blades.count, 3 + Math.floor(Math.max(0, level) * 0.3));
}

/**
 * 参悟：不靠实战，直接花技能所属那一行的能量补满到下一级——离下一级还差几次，就按每次 3 点能量算。
 * 实战用得多的技能参悟就便宜，多余的能量也有了去处。
 */
export const SKILL_TRAIN_PER_USE = 3;
export function skillTrainCost(uses: number): number {
  const lv = skillLevel(uses);
  if (lv < 0 || lv >= SKILL_MAX_LEVEL) return 0;
  return Math.max(1, skillNeed(lv + 1) - uses) * SKILL_TRAIN_PER_USE;
}

/** 每级熟练度：伤害 +12%，冷却 -3% */
export function skillDmgMult(level: number): number {
  return 1 + 0.12 * Math.max(0, level);
}
export function skillCdMult(level: number): number {
  return 1 - 0.03 * Math.max(0, level);
}

// ───────────────────────── 能量与灵力 ─────────────────────────

/**
 * 妖异溃散后留下一团与它同属的五行能量：
 *   - 收进存档，用于修炼、凝练与精炼兵器（orbValue）；一局能带回的总量有上限（PlayerStats.carry）
 *   - 同时化作局内的「灵力」，技能要有足够灵力才放得出（qiGain）
 */
export const QI_START = 50;
/** 一团能量的分量：层数越高越足；魁首 ×6，病变核心散成五行各一团 */
export function orbValue(tier: number, mtier: MonsterTier): number {
  const v = 1 + 0.6 * (tier - 1);
  return Math.max(1, Math.round(v * (mtier === 2 ? 16 : mtier === 1 ? 12 : 3)));
}
/** 一团能量化成多少灵力：生我之气最补，克我之气难以炼化 */
export function qiGain(path: Wuxing, wx: Wuxing, mtier: MonsterTier): number {
  const base = mtier === 0 ? 14 : 30;
  let m = 1;
  if (WUXING_GENERATES[wx] === path) m = 1.5;
  else if (wx === path) m = 1.2;
  else if (WUXING_CONQUERS[wx] === path) m = 0.6;
  return Math.round(base * m);
}
// ───────────────────────── 挂机收益 ─────────────────────────

/**
 * 营地里残魂会自己清剿游荡的妖异：不在秘境里的时间也在慢慢攒五行能量。
 * 按时间累计，最多攒 IDLE_CAP_MS，要回营地手动领取；解锁的层数越高攒得越快。
 * 比亲自下秘境慢得多（一重天每小时约 90 点，下一趟秘境几分钟就有 150）。
 */
export const IDLE_CAP_MS = 8 * 3600 * 1000;
/** 每分钟攒下的能量（五行合计） */
export function idleRate(maxTier: number): number {
  return 1.5 * (1 + 0.6 * (Math.max(1, maxTier) - 1));
}
/** 挂了 ms 毫秒能领多少：五行平分 */
export function idleGain(maxTier: number, ms: number): Energy {
  const minutes = Math.max(0, Math.min(IDLE_CAP_MS, ms)) / 60000;
  const each = Math.floor((idleRate(maxTier) * minutes) / 5);
  const out = {} as Energy;
  for (const wx of WX_ORDER) out[wx] = each;
  return out;
}

export const ORB_MAGNET = 230;
export const ORB_PICK = 46;
/** 地上的能量没人捡，过这么久就散了；最后一段慢慢淡掉 */
export const ORB_LIFE_MS = 60000;
export const ORB_FADE_MS = 12000;
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
/** 技能冷却：属性里的冷却缩减 × 熟练度 */
export function skillCd(id: SkillId, s: Pick<PlayerStats, 'cdr'>, level: number): number {
  return withCdr(SKILLS[id].cd, s) * skillCdMult(level);
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
  { kind: 'swift',   name: '木魅',   atlas: '木魅',   wuxing: Wuxing.WOOD,  hp: 20, dmg: 12, speed: 285, reach: 115, windup: 400, cooldown: 1400, size: 105 },
  { kind: 'caster',  name: '白面鬼', atlas: '白面鬼', wuxing: Wuxing.METAL, hp: 30, dmg: 18, speed: 150, reach: 560, windup: 720, cooldown: 2700, size: 0 },
  { kind: 'charger', name: '赤煞',   atlas: '赤煞',   wuxing: Wuxing.FIRE,  hp: 30, dmg: 22, speed: 185, reach: 340, windup: 560, cooldown: 2500, size: 400 },
  { kind: 'brute',   name: '溺尸',   atlas: '溺尸',   wuxing: Wuxing.WATER, hp: 58, dmg: 21, speed: 130, reach: 140, windup: 780, cooldown: 2300, size: 140 },
  { kind: 'brute',   name: '土伯',   atlas: '土伯',   wuxing: Wuxing.EARTH, hp: 64, dmg: 22, speed: 125, reach: 135, windup: 760, cooldown: 2400, size: 130 },
  { kind: 'slammer', name: '铁卫',   atlas: '铁卫',   wuxing: Wuxing.METAL, hp: 50, dmg: 28, speed: 130, reach: 175, windup: 950, cooldown: 3000, size: 195 },
  { kind: 'caster',  name: '玄冥客', atlas: '玄冥客', wuxing: Wuxing.WATER, hp: 24, dmg: 15, speed: 175, reach: 500, windup: 600, cooldown: 2200, size: 0 },
];

export const ELITE = { hpMult: 4, dmgMult: 1.6, sizeMult: 1.35, speedMult: 1.08 } as const;
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
  maxTier: number;
  /** 各层最快通关（毫秒） */
  best: Record<number, number>;
  /** 学会的技能与各自用过的次数 */
  skills: SkillBook;
  /** 带进秘境的技能（最多 LOADOUT_MAX 门） */
  loadout: SkillId[];
  /** 不捡取的五行能量（带回上限有限，把位置留给想要的） */
  skip: Wuxing[];
  /** 挂机收益从什么时候开始攒（服务器时间），以及发出这份存档时的服务器时间 */
  idleSince: number;
  now: number;
}

export interface RoomPlayerView {
  id: string;
  name: string;
  path: Wuxing | null;
  power: number;
  host: boolean;
  /** 外观与出手方式：营地的挂机演出里要把队友也画出来 */
  weapon: GearItem | null;
  cult: Energy;
  loadout: SkillId[];
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
  /** 开局时的技能熟练度（局内不变）与携带的技能 */
  skills: SkillBook;
  loadout: SkillId[];
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


export type C2S =
  | { t: 'hello'; did: string; name?: string }
  | { t: 'name'; name: string }
  | { t: 'path'; path: Wuxing }
  /** 换上兵匣里的兵器 */
  | { t: 'equip'; id: string }
  /** 化去兵器，返还同属能量 */
  | { t: 'salvage'; ids: string[] }
  /** 修炼：某一行升一重；散功：放弃这一行，返还部分能量 */
  | { t: 'cultivate'; wx: Wuxing }
  | { t: 'uncultivate'; wx: Wuxing }
  /** 修习一门技能 */
  | { t: 'learn'; skill: SkillId }
  /** 参悟：花能量把一门技能直接提到下一级 */
  | { t: 'train'; skill: SkillId }
  /** 选择带进秘境的技能 */
  | { t: 'loadout'; skills: SkillId[] }
  /** 设定不捡取哪几行的能量（营地和秘境里都能改） */
  | { t: 'skip'; list: Wuxing[] }
  /** 领取挂机收益 */
  | { t: 'idle' }
  /** 精炼兵器：尝试升一阶（可能失败） */
  | { t: 'refine'; id: string }
  /** 凝练兵器：投入的五行能量 */
  | { t: 'forge'; tier: number; amounts: Energy }
  | { t: 'create'; tier: number }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'tier'; tier: number }
  | { t: 'start' }
  /** 位置：x, y, 朝向(±1), 动作(0 站 1 跑 2 遁 3 御) */
  | { t: 'mv'; x: number; y: number; f: number; a: number }
  /** 远程兵器的一发弹道命中 */
  | { t: 'hit'; s: 'b'; id: number; x: number; y: number }
  /** 近战兵器的一次挥击，扫中的妖异 */
  | { t: 'swing'; ids: number[] }
  | { t: 'cast'; s: SkillId; x: number; y: number }
  | { t: 'hp'; hp: number }
  | { t: 'parry'; id: number }
  | { t: 'pdodge' }
  /** 吸纳一团能量 */
  | { t: 'orb'; id: number }
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
  /** 妖异溃散；orbs = 落在地上的能量 [能量id, 五行下标, 分量]*，全队共用，谁离得近谁捡 */
  | { t: 'die'; id: number; by: number; orbs?: number[] }
  /** 补发地上的能量 [能量id, x, y, 五行下标, 分量, 妖异档次]* */
  | { t: 'orbs'; list: number[] }
  /** 地上的能量没了：被谁捡走（by = 玩家下标），或是放太久散掉了（by = -1） */
  | { t: 'orbGone'; ids: number[]; by: number }
  /** 灵力校正（服务器拒绝了一次施放时） */
  | { t: 'qi'; v: number }
  | { t: 'dmg'; d: number[] }
  | { t: 'atk'; a: EnemyAttack }
  | { t: 'bolts'; list: EnemyBoltSpawn[] }
  /** 硬直；f = 1 表示是被冻住的 */
  | { t: 'stag'; id: number; ms: number; f?: 1 }
  | { t: 'cast'; p: number; s: SkillId; x: number; y: number }
  | { t: 'boss'; id: number }
  | { t: 'down'; p: number }
  | { t: 'up'; p: number }
  | { t: 'end'; ok: boolean; ms: number; tier: number; kills: number[]; best: boolean; energy: Energy }
  | { t: 'pong'; c: number };
