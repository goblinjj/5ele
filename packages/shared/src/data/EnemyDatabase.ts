import { Wuxing } from '../types/Wuxing.js';
import { Combatant } from '../logic/BattleTypes.js';

/**
 * 敌人模板
 */
export interface EnemyTemplate {
  id: string;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  wuxing: Wuxing;
  wuxingLevel: number;
}

/**
 * 普通怪物模板 - 降低难度，适合初期
 */
export const NORMAL_ENEMIES: EnemyTemplate[] = [
  {
    id: 'tree_demon',
    name: '树妖',
    hp: 4,
    attack: 1,
    defense: 0,
    speed: 0,
    wuxing: Wuxing.WOOD,
    wuxingLevel: 1,
  },
  {
    id: 'fang_beast',
    name: '獠牙怪',
    hp: 5,
    attack: 2,
    defense: 0,
    speed: 1,
    wuxing: Wuxing.METAL,
    wuxingLevel: 1,
  },
  {
    id: 'green_snake',
    name: '青鳞蛇',
    hp: 3,
    attack: 2,
    defense: 0,
    speed: 2,
    wuxing: Wuxing.WATER,
    wuxingLevel: 1,
  },
  {
    id: 'red_fox',
    name: '赤狐精',
    hp: 4,
    attack: 1,
    defense: 1,
    speed: 1,
    wuxing: Wuxing.FIRE,
    wuxingLevel: 1,
  },
  {
    id: 'stone_spirit',
    name: '石头精',
    hp: 5,
    attack: 1,
    defense: 1,
    speed: 0,
    wuxing: Wuxing.EARTH,
    wuxingLevel: 1,
  },
];

/**
 * 精英怪物模板 - 比玩家稍弱，但奖励丰厚
 */
export const ELITE_ENEMIES: EnemyTemplate[] = [
  {
    id: 'bear',
    name: '熊罴怪',
    hp: 12,
    attack: 3,
    defense: 2,
    speed: 0,
    wuxing: Wuxing.EARTH,
    wuxingLevel: 2,
  },
  {
    id: 'spider',
    name: '蜘蛛精',
    hp: 10,
    attack: 4,
    defense: 1,
    speed: 2,
    wuxing: Wuxing.FIRE,
    wuxingLevel: 2,
  },
  {
    id: 'tiger',
    name: '虎力大仙',
    hp: 11,
    attack: 3,
    defense: 2,
    speed: 2,
    wuxing: Wuxing.METAL,
    wuxingLevel: 2,
  },
  {
    id: 'yellow_robe',
    name: '黄袍怪',
    hp: 11,
    attack: 3,
    defense: 1,
    speed: 1,
    wuxing: Wuxing.WOOD,
    wuxingLevel: 2,
  },
  {
    id: 'carp_demon',
    name: '鲤鱼精',
    hp: 10,
    attack: 2,
    defense: 2,
    speed: 3,
    wuxing: Wuxing.WATER,
    wuxingLevel: 2,
  },
];

/**
 * Boss 模板 - 有挑战性但可战胜
 */
export const BOSS_ENEMIES: EnemyTemplate[] = [
  {
    id: 'niuwang',
    name: '牛魔王',
    hp: 30,
    attack: 4,
    defense: 2,
    speed: 1,
    wuxing: Wuxing.FIRE,
    wuxingLevel: 3,
  },
];

/**
 * 根据回合数计算普通战斗怪物数量
 */
function getNormalMonsterCount(round: number): number {
  if (round === 1) {
    return 1;
  } else if (round === 2) {
    return Math.random() < 0.5 ? 1 : 2;
  } else if (round === 3) {
    return 2;
  } else if (round === 4) {
    return Math.random() < 0.5 ? 2 : 3;
  } else {
    return 3;
  }
}

/**
 * 根据回合数计算精英战斗小兵数量
 */
function getEliteMinionCount(round: number): number {
  if (round <= 2) {
    return 0;
  } else if (round === 3) {
    return 1;
  } else if (round === 4) {
    return Math.random() < 0.5 ? 1 : 2;
  } else {
    return 2;
  }
}

/**
 * 根据节点类型生成敌人
 */
export function generateEnemies(
  nodeType: 'normal' | 'elite' | 'final',
  round: number,
  monsterScaling: number = 0.20,
  monsterCountBonus: number = 0
): Combatant[] {
  const scaling = 1 + (round - 1) * monsterScaling;
  const enemies: Combatant[] = [];

  if (nodeType === 'normal') {
    const baseCount = getNormalMonsterCount(round);
    const count = Math.min(baseCount + monsterCountBonus, 4);
    for (let i = 0; i < count; i++) {
      const template = NORMAL_ENEMIES[Math.floor(Math.random() * NORMAL_ENEMIES.length)];
      enemies.push(createCombatantFromTemplate(template, i, scaling));
    }
  } else if (nodeType === 'elite') {
    const eliteTemplate = ELITE_ENEMIES[Math.floor(Math.random() * ELITE_ENEMIES.length)];
    enemies.push(createCombatantFromTemplate(eliteTemplate, 0, scaling));

    const minionCount = getEliteMinionCount(round);
    for (let i = 0; i < minionCount; i++) {
      const minionTemplate = NORMAL_ENEMIES[Math.floor(Math.random() * NORMAL_ENEMIES.length)];
      enemies.push(createCombatantFromTemplate(minionTemplate, i + 1, scaling * 0.8));
    }
  } else {
    const bossTemplate = BOSS_ENEMIES[0];
    enemies.push(createCombatantFromTemplate(bossTemplate, 0, scaling * 1.2));

    for (let i = 0; i < 2; i++) {
      const minionTemplate = NORMAL_ENEMIES[Math.floor(Math.random() * NORMAL_ENEMIES.length)];
      enemies.push(createCombatantFromTemplate(minionTemplate, i + 1, scaling * 0.7));
    }
  }

  return enemies;
}

/**
 * 获取敌人数量（用于计算掉落）
 */
export function getEnemyCount(
  nodeType: 'normal' | 'elite' | 'final',
  round: number,
  monsterCountBonus: number = 0
): number {
  if (nodeType === 'normal') {
    const baseCount = getNormalMonsterCount(round);
    return Math.min(baseCount + monsterCountBonus, 4);
  } else if (nodeType === 'elite') {
    return 1 + getEliteMinionCount(round);
  } else {
    return 3;
  }
}

function createCombatantFromTemplate(
  template: EnemyTemplate,
  index: number,
  scaling: number
): Combatant {
  const scaledHp = Math.floor(template.hp * scaling);
  return {
    id: `enemy_${template.id}_${index}_${Date.now()}`,
    name: template.name,
    hp: scaledHp,
    maxHp: scaledHp,
    attack: Math.floor(template.attack * scaling),
    defense: Math.floor(template.defense * scaling),
    speed: template.speed,
    attackWuxing: { wuxing: template.wuxing, level: template.wuxingLevel },
    defenseWuxing: { wuxing: template.wuxing, level: template.wuxingLevel },
    isPlayer: false,
    frozen: false,
  };
}
