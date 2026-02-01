import { Equipment, EquipmentType, Rarity } from '../types/Equipment.js';
import { Wuxing, WUXING_NAMES } from '../types/Wuxing.js';
import { BOSS_DROPS, getLegendaryEquipment } from '../data/EquipmentDatabase.js';

/**
 * 掉落结果
 */
export interface LootResult {
  items: Equipment[];
}

/**
 * 生成战斗掉落
 */
export function generateLoot(
  nodeType: 'normal' | 'elite' | 'final',
  round: number
): LootResult {
  const items: Equipment[] = [];

  // 尝试 Boss 掉落
  const bossDrop = tryBossDrop(nodeType);
  if (bossDrop) {
    items.push(bossDrop);
  }

  // 确定掉落数量
  let lootCount: number;
  switch (nodeType) {
    case 'normal':
      lootCount = randomInt(1, 3);
      break;
    case 'elite':
      lootCount = randomInt(2, 4);
      break;
    case 'final':
      lootCount = randomInt(3, 5);
      break;
  }

  // 生成随机装备
  const isHighQuality = nodeType === 'elite' || nodeType === 'final';
  for (let i = items.length; i < lootCount; i++) {
    items.push(generateRandomEquipment(isHighQuality, round));
  }

  return { items };
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

  return {
    id: `equip_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    name: generateName(type, wuxing, rarity),
    type,
    rarity,
    wuxing,
    wuxingLevel: rarity === Rarity.EPIC ? 2 : 1,
    attack: type === EquipmentType.WEAPON || type === EquipmentType.TREASURE ? baseStats : undefined,
    defense: type === EquipmentType.ARMOR || type === EquipmentType.TREASURE ? baseStats : undefined,
    speed: baseSpeed,
    upgradeLevel: 0,
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
