import { Wuxing } from '../types/Wuxing.js';
import { Combatant } from '../logic/BattleTypes.js';
import { randomSkillFromWuxing, AttributeSkillId } from './AttributeSkillDatabase.js';

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
 * 规则：第N轮 = N个怪物
 */
function getNormalMonsterCount(round: number): number {
  return Math.min(round, 6); // 最多6个
}

/**
 * 根据回合数计算精英战斗小兵数量
 * 规则：第N轮精英战斗 = N个小怪 + 1个精英
 */
function getEliteMinionCount(round: number): number {
  return Math.min(round, 6); // 最多6个小怪
}

/**
 * 根据节点类型生成敌人
 * - 普通战斗：第N轮 = N个普通怪
 * - 精英战斗：第N轮 = N个普通怪 + 1个精英
 * - Boss战斗：1个Boss + 2个精英
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
    // 普通战斗：第N轮 = N个普通怪
    const count = getNormalMonsterCount(round) + monsterCountBonus;
    for (let i = 0; i < count; i++) {
      const template = NORMAL_ENEMIES[Math.floor(Math.random() * NORMAL_ENEMIES.length)];
      enemies.push(createCombatantFromTemplate(template, i, scaling, false, round));
    }
  } else if (nodeType === 'elite') {
    // 精英战斗：和普通战斗怪物数量一致，但其中一个是精英
    const totalCount = getNormalMonsterCount(round) + monsterCountBonus;
    const minionCount = Math.max(0, totalCount - 1); // 留一个位置给精英

    // 先添加普通怪
    for (let i = 0; i < minionCount; i++) {
      const minionTemplate = NORMAL_ENEMIES[Math.floor(Math.random() * NORMAL_ENEMIES.length)];
      enemies.push(createCombatantFromTemplate(minionTemplate, i, scaling * 0.8, false, round));
    }
    // 再添加精英（放在最后，通常是主目标）- 有装备和技能
    const eliteTemplate = ELITE_ENEMIES[Math.floor(Math.random() * ELITE_ENEMIES.length)];
    enemies.push(createCombatantFromTemplate(eliteTemplate, minionCount, scaling, true, round));
  } else {
    // Boss战斗：1个Boss + 2个精英
    // 先添加2个精英 - 有装备和技能
    for (let i = 0; i < 2; i++) {
      const eliteTemplate = ELITE_ENEMIES[Math.floor(Math.random() * ELITE_ENEMIES.length)];
      enemies.push(createCombatantFromTemplate(eliteTemplate, i, scaling * 0.9, true, round));
    }
    // 再添加Boss（放在最后，主目标）- 有更多技能
    const bossTemplate = BOSS_ENEMIES[0];
    enemies.push(createCombatantFromTemplate(bossTemplate, 2, scaling * 1.2, true, round, true));
  }

  return enemies;
}

/**
 * 获取敌人数量（用于计算掉落）
 * - 普通战斗：N个普通怪
 * - 精英战斗：N个普通怪 + 1个精英
 * - Boss战斗：1个Boss + 2个精英
 */
export function getEnemyCount(
  nodeType: 'normal' | 'elite' | 'final',
  round: number,
  monsterCountBonus: number = 0
): number {
  if (nodeType === 'normal') {
    return getNormalMonsterCount(round) + monsterCountBonus;
  } else if (nodeType === 'elite') {
    // 精英战斗和普通战斗怪物数量一致
    return getNormalMonsterCount(round) + monsterCountBonus;
  } else {
    return 3; // 1 Boss + 2 精英
  }
}

function createCombatantFromTemplate(
  template: EnemyTemplate,
  index: number,
  scaling: number,
  isElite: boolean = false,
  round: number = 1,
  isBoss: boolean = false
): Combatant {
  const scaledHp = Math.floor(template.hp * scaling);

  // 精英怪和Boss穿戴本属性装备（体现为拥有同属性技能）
  // 技能数量随回合增加：回合1-2=1技能，回合3-4=2技能，回合5+=3技能
  // Boss额外+1技能
  let attributeSkills: AttributeSkillId[] = [];
  if (isElite) {
    const baseSkillCount = Math.min(Math.ceil(round / 2), 3);
    const skillCount = isBoss ? baseSkillCount + 1 : baseSkillCount;

    for (let i = 0; i < skillCount; i++) {
      const skill = randomSkillFromWuxing(template.wuxing);
      if (skill && !attributeSkills.includes(skill)) {
        attributeSkills.push(skill);
      }
    }
  }

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
    attributeSkills: attributeSkills.length > 0 ? attributeSkills : undefined,
  };
}
