import { Wuxing, WUXING_CONQUERS, WUXING_GENERATES } from '@xiyou/shared';

/** 气脉区域（世界）边长 */
export const WORLD_SIZE = 3200;
export const WORLD_CENTER = WORLD_SIZE / 2;

/** 五行阵眼到太极中心的距离 / 阵眼半径 */
export const ZONE_DISTANCE = 1080;
export const ZONE_RADIUS = 430;

export type EnemyKind = 'charger' | 'swift' | 'caster' | 'brute' | 'slammer';

export interface ZoneDef {
  wuxing: Wuxing;
  /** 该阵眼滋生的妖异 */
  monster: string;
  kind: EnemyKind;
  x: number;
  y: number;
}

/**
 * 五行阵眼按相生顺序顺时针排布：木 → 火 → 土 → 金 → 水
 * （相邻为相生，隔位为相克，与地面上的五行图一致）
 */
const ZONE_ORDER: Array<Pick<ZoneDef, 'wuxing' | 'monster' | 'kind'>> = [
  { wuxing: Wuxing.WOOD,  monster: '树妖',   kind: 'brute' },
  { wuxing: Wuxing.FIRE,  monster: '赤狐精', kind: 'caster' },
  { wuxing: Wuxing.EARTH, monster: '石头精', kind: 'slammer' },
  { wuxing: Wuxing.METAL, monster: '獠牙怪', kind: 'charger' },
  { wuxing: Wuxing.WATER, monster: '青鳞蛇', kind: 'swift' },
];

export const ZONES: ZoneDef[] = ZONE_ORDER.map((z, i) => {
  const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
  return {
    ...z,
    x: WORLD_CENTER + Math.cos(angle) * ZONE_DISTANCE,
    y: WORLD_CENTER + Math.sin(angle) * ZONE_DISTANCE,
  };
});

/** 画面表现用的五行色（金用暖白金，避免纯白刺眼） */
export const WX_TINT: Record<Wuxing, number> = {
  [Wuxing.METAL]: 0xf2e6c2,
  [Wuxing.WOOD]:  0x4ade80,
  [Wuxing.WATER]: 0x4f9dff,
  [Wuxing.FIRE]:  0xff5a3c,
  [Wuxing.EARTH]: 0xe3b23c,
};
/** 无五行时残魂本源的颜色 */
export const SPIRIT_TINT = 0x9fd8ff;

export type WuxingRelation = 'none' | 'same' | 'ke' | 'beike' | 'sheng' | 'bisheng';

/**
 * 以 a 为主视角看 b：
 *  ke = a 克 b；beike = a 被 b 克；sheng = a 生 b；bisheng = a 被 b 生
 */
export function relationOf(a: Wuxing | undefined | null, b: Wuxing | undefined | null): WuxingRelation {
  if (!a || !b) return 'none';
  if (a === b) return 'same';
  if (WUXING_CONQUERS[a] === b) return 'ke';
  if (WUXING_CONQUERS[b] === a) return 'beike';
  if (WUXING_GENERATES[a] === b) return 'sheng';
  if (WUXING_GENERATES[b] === a) return 'bisheng';
  return 'none';
}

/** 画面参数（设计分辨率 720×1560） */
export const PLAYER_SCALE = 0.38;
export const ENEMY_SCALE = 0.34;
export const ELITE_SCALE = 0.48;
export const BOSS_SCALE = 0.78;

export const PLAYER_SPEED = 410;
/** 残魂本源之击的射程 */
export const AUTO_ATTACK_RANGE = 340;
/** 能量被吸引的范围 */
export const ORB_MAGNET_RANGE = 230;

/** 每轮时长（秒） */
export function getRoundDuration(round: number): number {
  return Math.min(150, 75 + (round - 1) * 10);
}
/** 是否为病变核心轮 */
export function isBossRound(round: number): boolean {
  return round % 5 === 0;
}

/**
 * 战斗数值放大倍数：器物上仍是 1~10 的小数值，
 * 进入实时战斗时攻 / 防 / 血统一 ×10，让五行倍率的差距能体现在整数伤害上。
 */
export const STAT_SCALE = 10;

/**
 * 五行伤害倍率（攻击方五行 → 防御方五行）
 *
 *   克（我克彼）    ×2.5   正面压制
 *   得生（彼生我）  ×1.5   借对方之气壮大自身
 *   比（同属）      ×1.0
 *   受制（彼克我）  ×0.5   被对方压制
 *   泄（我生彼）    ×0.25  气力反哺对方，几乎无效
 *
 * 攻防用的是同一张表：
 *   进攻看武器 —— 用克制妖异的五行打它；
 *   防守看防具 —— 穿妖异所「生」的五行最安全（它打你只有 ×0.25），
 *                 穿被妖异所克的五行则会受到 ×2.5 的重创。
 */
export const WX_MULT: Record<WuxingRelation, number> = {
  ke: 2.5,
  bisheng: 1.5,
  same: 1,
  none: 1,
  beike: 0.5,
  sheng: 0.25,
};

export function wuxingMultiplier(attacker: Wuxing | undefined | null, defender: Wuxing | undefined | null): number {
  return WX_MULT[relationOf(attacker, defender)];
}

/** 面对某五行的妖异：最佳进攻五行（克它）与最佳防守五行（它所生） */
export function bestAttackAgainst(enemy: Wuxing): Wuxing {
  return (Object.keys(WUXING_CONQUERS) as Wuxing[]).find(w => WUXING_CONQUERS[w] === enemy)!;
}
export function bestDefenseAgainst(enemy: Wuxing): Wuxing {
  return WUXING_GENERATES[enemy];
}

/** 五行固定展示顺序（相生顺序） */
export const WX_ORDER: Wuxing[] = [Wuxing.WOOD, Wuxing.FIRE, Wuxing.EARTH, Wuxing.METAL, Wuxing.WATER];
