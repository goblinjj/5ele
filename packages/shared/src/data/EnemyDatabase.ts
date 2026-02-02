import { Wuxing } from '../types/Wuxing.js';
import { Skill, SkillTrigger } from '../types/Equipment.js';
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
  skills: Skill[];
}

/**
 * 普通怪物模板 - 降低难度，适合初期
 */
export const NORMAL_ENEMIES: EnemyTemplate[] = [
  {
    id: 'goblin',
    name: '小妖',
    hp: 4,
    attack: 1,
    defense: 0,
    speed: 0,
    wuxing: Wuxing.WOOD,
    wuxingLevel: 1,
    skills: [],
  },
  {
    id: 'wolf',
    name: '狼妖',
    hp: 5,
    attack: 2,
    defense: 0,
    speed: 1,
    wuxing: Wuxing.METAL,
    wuxingLevel: 1,
    skills: [],
  },
  {
    id: 'snake',
    name: '蛇妖',
    hp: 3,
    attack: 2,
    defense: 0,
    speed: 2,
    wuxing: Wuxing.WATER,
    wuxingLevel: 1,
    skills: [],
  },
  {
    id: 'fox',
    name: '狐妖',
    hp: 4,
    attack: 1,
    defense: 1,
    speed: 1,
    wuxing: Wuxing.FIRE,
    wuxingLevel: 1,
    skills: [],
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
    skills: [],
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
    skills: [],
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
    skills: [],
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
    skills: [
      {
        id: 'skill_niuqi',
        name: '牛气冲天',
        description: '战斗开始时攻击+2',
        trigger: SkillTrigger.PASSIVE,
        attackBonus: 2,
      },
    ],
  },
];

/**
 * 根据回合数计算普通战斗怪物数量
 * 回合1: 1只, 回合2: 1-2只, 回合3: 2只, 回合4: 2-3只, 回合5+: 3只
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
 * 回合1-2: 0只, 回合3: 1只, 回合4: 1-2只, 回合5+: 2只
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
 * @param nodeType 节点类型
 * @param round 当前回合
 * @param monsterScaling 每轮成长系数（来自玩家属性，默认0.20）
 * @param monsterCountBonus 怪物数量加成（来自玩家属性，默认0）
 */
export function generateEnemies(
  nodeType: 'normal' | 'elite' | 'final',
  round: number,
  monsterScaling: number = 0.20,
  monsterCountBonus: number = 0
): Combatant[] {
  // 每轮按比例成长，第一轮基础值
  const scaling = 1 + (round - 1) * monsterScaling;
  const enemies: Combatant[] = [];

  if (nodeType === 'normal') {
    // 普通战斗：根据回合数逐渐增加怪物数量
    const baseCount = getNormalMonsterCount(round);
    const count = Math.min(baseCount + monsterCountBonus, 4); // 最多4个
    for (let i = 0; i < count; i++) {
      const template = NORMAL_ENEMIES[Math.floor(Math.random() * NORMAL_ENEMIES.length)];
      enemies.push(createCombatantFromTemplate(template, i, scaling));
    }
  } else if (nodeType === 'elite') {
    // 精英战斗：1个精英怪 + 随回合增加的小兵
    const eliteTemplate = ELITE_ENEMIES[Math.floor(Math.random() * ELITE_ENEMIES.length)];
    enemies.push(createCombatantFromTemplate(eliteTemplate, 0, scaling));

    // 根据回合数添加小兵
    const minionCount = getEliteMinionCount(round);
    for (let i = 0; i < minionCount; i++) {
      const minionTemplate = NORMAL_ENEMIES[Math.floor(Math.random() * NORMAL_ENEMIES.length)];
      enemies.push(createCombatantFromTemplate(minionTemplate, i + 1, scaling * 0.8));
    }
  } else {
    // Boss 战斗：1个Boss + 2个小兵
    const bossTemplate = BOSS_ENEMIES[0];
    enemies.push(createCombatantFromTemplate(bossTemplate, 0, scaling * 1.2)); // Boss额外20%成长

    // 添加2个小兵（使用普通怪物模板，稍弱）
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
    // 精英战斗：1个精英怪 + 小兵
    return 1 + getEliteMinionCount(round);
  } else {
    // Boss战斗：1 Boss + 2小兵
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
    skills: [...template.skills],
    isPlayer: false,
    frozen: false,
    attackDebuff: 0,
  };
}
