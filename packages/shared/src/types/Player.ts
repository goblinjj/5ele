import { Equipment, PlayerEquipment, EquipmentType, Rarity } from './Equipment.js';
import { WuxingLevel } from './Wuxing.js';

/**
 * 背包容量
 */
export const INVENTORY_SIZE = 10;

/**
 * 最大法宝数量
 */
export const MAX_TREASURES = 8;

/**
 * 背包
 */
export interface Inventory {
  slots: (Equipment | null)[];
  fragmentCount: number; // 法宝碎片数量
}

/**
 * 玩家状态
 */
export interface PlayerState {
  id: string;
  name: string;

  // 生命值
  hp: number;
  maxHp: number;

  // 装备
  equipment: PlayerEquipment;

  // 背包
  inventory: Inventory;

  // 陷害卡
  trapCards: TrapCard[];

  // 是否准备好
  isReady: boolean;

  // 掉率加成（1.0 = 100%，10.0 = 1000%）
  dropRate: number;
}

/**
 * 陷害卡
 */
export interface TrapCard {
  id: string;
  name: string;
  description: string;
  effect: TrapEffect;
}

/**
 * 陷害效果
 */
export interface TrapEffect {
  type: 'debuff' | 'bad_options' | 'damage';
  value?: number;
}

/**
 * 玩家外显信息（同步阶段可见）
 */
export interface PlayerVisibleInfo {
  id: string;
  name: string;

  // 外显：装备五行
  weaponWuxing: WuxingLevel | null;
  armorWuxing: WuxingLevel | null;

  // 外显：状态
  isInjured: boolean;    // 受伤（HP < 50%）
  isWeak: boolean;       // 虚弱（HP < 25%）
  isPoisoned: boolean;   // 中毒

  // 法宝数量（不显示具体内容）
  treasureCount: number;
}

/**
 * 初始武器 - 木棍（无属性）
 */
const STARTER_WEAPON: Equipment = {
  id: 'starter_weapon',
  name: '木棍',
  type: EquipmentType.WEAPON,
  rarity: Rarity.COMMON,
  // 无五行属性
  attack: 1,
  speed: 0,
  upgradeLevel: 0,
};

/**
 * 创建初始玩家状态
 */
export function createInitialPlayerState(id: string, name: string): PlayerState {
  return {
    id,
    name,
    hp: 25,
    maxHp: 25,
    equipment: {
      weapon: { ...STARTER_WEAPON },
      armor: null,  // 无初始铠甲
      treasures: [],
    },
    inventory: {
      slots: new Array(INVENTORY_SIZE).fill(null),
      fragmentCount: 0,
    },
    trapCards: [],
    isReady: false,
    dropRate: 10.0,  // 1000% 掉率，测试用
  };
}

/**
 * 获取玩家外显信息
 */
export function getVisibleInfo(player: PlayerState): PlayerVisibleInfo {
  const { equipment } = player;

  // 只有装备存在且有五行属性时才返回
  const weaponWuxing = equipment.weapon?.wuxing !== undefined ? {
    wuxing: equipment.weapon.wuxing,
    level: equipment.weapon.wuxingLevel ?? 1,
  } : null;

  const armorWuxing = equipment.armor?.wuxing !== undefined ? {
    wuxing: equipment.armor.wuxing,
    level: equipment.armor.wuxingLevel ?? 1,
  } : null;

  return {
    id: player.id,
    name: player.name,
    weaponWuxing,
    armorWuxing,
    isInjured: player.hp < player.maxHp * 0.5,
    isWeak: player.hp < player.maxHp * 0.25,
    isPoisoned: false, // TODO: 实现中毒状态
    treasureCount: equipment.treasures.length,
  };
}
