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
 * 精英怪物模板
 */
export const ELITE_ENEMIES: EnemyTemplate[] = [
  {
    id: 'bear',
    name: '熊罴怪',
    hp: 18,
    attack: 4,
    defense: 3,
    speed: 0,
    wuxing: Wuxing.EARTH,
    wuxingLevel: 2,
    skills: [],
  },
  {
    id: 'spider',
    name: '蜘蛛精',
    hp: 14,
    attack: 5,
    defense: 1,
    speed: 2,
    wuxing: Wuxing.FIRE,
    wuxingLevel: 2,
    skills: [],
  },
  {
    id: 'tiger',
    name: '虎力大仙',
    hp: 16,
    attack: 4,
    defense: 2,
    speed: 2,
    wuxing: Wuxing.METAL,
    wuxingLevel: 2,
    skills: [],
  },
];

/**
 * Boss 模板
 */
export const BOSS_ENEMIES: EnemyTemplate[] = [
  {
    id: 'niuwang',
    name: '牛魔王',
    hp: 40,
    attack: 5,
    defense: 3,
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
 * 根据节点类型生成敌人
 */
export function generateEnemies(
  nodeType: 'normal' | 'elite' | 'final',
  round: number
): Combatant[] {
  // 前两轮不加成，之后每轮 +10%
  const scaling = round <= 2 ? 1 : 1 + (round - 2) * 0.1;
  const enemies: Combatant[] = [];

  if (nodeType === 'normal') {
    // 普通战斗：第一轮只有1个，之后1-2个
    const count = round === 1 ? 1 : (Math.random() < 0.5 ? 1 : 2);
    for (let i = 0; i < count; i++) {
      const template = NORMAL_ENEMIES[Math.floor(Math.random() * NORMAL_ENEMIES.length)];
      enemies.push(createCombatantFromTemplate(template, i, scaling));
    }
  } else if (nodeType === 'elite') {
    // 精英战斗：1 个精英怪
    const template = ELITE_ENEMIES[Math.floor(Math.random() * ELITE_ENEMIES.length)];
    enemies.push(createCombatantFromTemplate(template, 0, scaling));
  } else {
    // Boss 战斗
    const template = BOSS_ENEMIES[0];
    enemies.push(createCombatantFromTemplate(template, 0, scaling));
  }

  return enemies;
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
