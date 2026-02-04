import { Equipment, EquipmentType, Rarity, RARITY_WUXING_LEVEL } from '../types/Equipment.js';
import { Wuxing, WUXING_NAMES } from '../types/Wuxing.js';
import { BOSS_DROPS, getLegendaryEquipment } from '../data/EquipmentDatabase.js';
import { randomSkillFromWuxing } from '../data/AttributeSkillDatabase.js';

/**
 * 单个敌人的掉落
 */
export interface EnemyDrop {
  choices: Equipment[];  // 3个选项供玩家选择
  fragments: number;     // 掉落的碎片数量(1-5)
}

/**
 * 掉落结果（新版：支持3选1）
 */
export interface LootResult {
  items: Equipment[];           // 兼容旧代码
  enemyDrops: EnemyDrop[];      // 每个敌人的掉落（3选1）
  bossDrop?: Equipment;         // Boss特殊掉落（直接获得，不需选择）
}

/**
 * 生成战斗掉落（新版3选1系统）
 * @param nodeType 节点类型
 * @param round 当前回合
 * @param dropRate 掉率倍数（影响碎片数量）
 * @param enemyCount 击杀的怪物数量（每个怪物有一次3选1）
 */
export function generateLoot(
  nodeType: 'normal' | 'elite' | 'final',
  round: number,
  dropRate: number = 1.0,
  enemyCount: number = 1
): LootResult {
  const enemyDrops: EnemyDrop[] = [];
  const items: Equipment[] = []; // 兼容旧代码

  // Boss特殊掉落
  const bossDrop = tryBossDrop(nodeType);
  if (bossDrop) {
    items.push(bossDrop);
  }

  // 根据节点类型确定品质
  const isHighQuality = nodeType === 'elite' || nodeType === 'final';

  // 每个敌人生成一次掉落（3选1 + 碎片）
  for (let enemy = 0; enemy < enemyCount; enemy++) {
    // 生成3个装备选项
    const choices: Equipment[] = [];
    for (let i = 0; i < 3; i++) {
      choices.push(generateRandomEquipment(isHighQuality, round));
    }

    // 生成碎片数量（1-5，受掉率影响）
    const baseFragments = randomInt(1, 5);
    const fragments = Math.floor(baseFragments * dropRate);

    enemyDrops.push({
      choices,
      fragments: Math.max(1, fragments),
    });

    // 兼容旧代码：将第一个选项加入items
    items.push(choices[0]);
  }

  return { items, enemyDrops, bossDrop: bossDrop || undefined };
}

/**
 * 生成简单掉落（不使用3选1，用于兼容）
 */
export function generateSimpleLoot(
  nodeType: 'normal' | 'elite' | 'final',
  round: number,
  dropRate: number = 1.0,
  enemyCount: number = 1
): Equipment[] {
  const items: Equipment[] = [];

  // Boss掉落
  const bossDrop = tryBossDrop(nodeType);
  if (bossDrop) {
    items.push(bossDrop);
  }

  // 每个怪物单独计算掉落
  for (let enemy = 0; enemy < enemyCount; enemy++) {
    let baseLootPerEnemy: number;
    switch (nodeType) {
      case 'normal':
        baseLootPerEnemy = randomInt(1, 2);
        break;
      case 'elite':
        baseLootPerEnemy = randomInt(2, 4);
        break;
      case 'final':
        baseLootPerEnemy = randomInt(3, 5);
        break;
    }

    const lootCount = Math.floor(baseLootPerEnemy * dropRate);
    const isHighQuality = nodeType === 'elite' || nodeType === 'final';
    for (let i = 0; i < lootCount; i++) {
      items.push(generateRandomEquipment(isHighQuality, round));
    }
  }

  return items;
}

function tryBossDrop(nodeType: 'normal' | 'elite' | 'final'): Equipment | null {
  let bossId: string | null = null;

  if (nodeType === 'final') {
    bossId = 'boss_final';
  } else if (nodeType === 'elite') {
    const eliteBosses = ['boss_bajie', 'boss_wujing', 'boss_dragon'];
    bossId = eliteBosses[Math.floor(Math.random() * eliteBosses.length)];
  }

  if (!bossId) return null;

  const bossDropTable = BOSS_DROPS.find(b => b.bossId === bossId);
  if (!bossDropTable) return null;

  for (const drop of bossDropTable.drops) {
    if (Math.random() < drop.dropRate) {
      const legendary = getLegendaryEquipment(drop.equipmentId);
      if (legendary) {
        return {
          ...legendary,
          id: `${legendary.id}_${Date.now()}`,
        };
      }
    }
  }

  return null;
}

function generateRandomEquipment(isHighQuality: boolean, round: number): Equipment {
  const types = [EquipmentType.WEAPON, EquipmentType.ARMOR, EquipmentType.TREASURE];
  const type = types[Math.floor(Math.random() * types.length)];

  const wuxings = Object.values(Wuxing);
  const wuxing = wuxings[Math.floor(Math.random() * wuxings.length)] as Wuxing;

  const rarityRoll = Math.random();
  let rarity: Rarity;
  if (isHighQuality) {
    rarity = rarityRoll < 0.3 ? Rarity.EPIC : rarityRoll < 0.7 ? Rarity.RARE : Rarity.UNCOMMON;
  } else {
    rarity = rarityRoll < 0.1 ? Rarity.RARE : rarityRoll < 0.4 ? Rarity.UNCOMMON : Rarity.COMMON;
  }

  const baseStats = getBaseStats(rarity);
  const baseSpeed = Math.floor(Math.random() * 2); // 0-1
  const wuxingLevel = RARITY_WUXING_LEVEL[rarity];

  // 生成初始技能（+0装备有1个技能）
  const firstSkill = randomSkillFromWuxing(wuxing);

  return {
    id: `equip_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: generateName(type, wuxing, rarity),
    type,
    rarity,
    wuxing,
    wuxingLevel,
    attack: type === EquipmentType.WEAPON || type === EquipmentType.TREASURE ? baseStats : undefined,
    defense: type === EquipmentType.ARMOR || type === EquipmentType.TREASURE ? baseStats : undefined,
    speed: baseSpeed,
    upgradeLevel: 0,
    attributeSkills: firstSkill ? [firstSkill] : [],
  };
}

function getBaseStats(rarity: Rarity): number {
  switch (rarity) {
    case Rarity.COMMON: return 1;
    case Rarity.UNCOMMON: return 2;
    case Rarity.RARE: return 3;
    case Rarity.EPIC: return 4;
    case Rarity.LEGENDARY: return 5;
    default: return 1;
  }
}

function generateName(type: EquipmentType, wuxing: Wuxing, rarity: Rarity): string {
  const wuxingName = WUXING_NAMES[wuxing];

  const weaponNames = ['剑', '刀', '枪', '戟', '棍'];
  const armorNames = ['甲', '袍', '衣', '铠'];
  const treasureNames = ['珠', '镜', '印', '符', '环'];

  let baseName: string;
  switch (type) {
    case EquipmentType.WEAPON:
      baseName = weaponNames[Math.floor(Math.random() * weaponNames.length)];
      break;
    case EquipmentType.ARMOR:
      baseName = armorNames[Math.floor(Math.random() * armorNames.length)];
      break;
    case EquipmentType.TREASURE:
      baseName = treasureNames[Math.floor(Math.random() * treasureNames.length)];
      break;
  }

  const prefix = rarity === Rarity.EPIC ? '上古' :
                 rarity === Rarity.RARE ? '精良' :
                 rarity === Rarity.UNCOMMON ? '优质' : '';

  return `${prefix}${wuxingName}${baseName}`;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
