import { Equipment, PlayerEquipment } from '../types/Equipment.js';
import { AttributeSkillId, getSkillDef, getSkillValue } from '../data/AttributeSkillDatabase.js';
import { Wuxing } from '../types/Wuxing.js';

/**
 * 技能显示信息
 */
export interface SkillDisplayInfo {
  id: AttributeSkillId;
  name: string;
  description: string;
  level: number;
  value: number;
}

/**
 * 获取装备的技能显示信息
 * @param equipment 装备
 * @param wuxingLevel 对应五行的等级（用于计算数值）
 */
export function getEquipmentSkillsDisplay(
  equipment: Equipment,
  wuxingLevel: number = 1
): SkillDisplayInfo[] {
  if (!equipment.attributeSkills || equipment.attributeSkills.length === 0) {
    return [];
  }

  return equipment.attributeSkills.map(skillId => {
    const def = getSkillDef(skillId);
    const value = getSkillValue(skillId, wuxingLevel);
    const description = def.description.replace('{value}', String(value));

    return {
      id: skillId,
      name: def.name,
      description,
      level: wuxingLevel,
      value,
    };
  });
}

/**
 * 格式化技能列表为文本
 */
export function formatSkillsText(
  skills: SkillDisplayInfo[],
  separator: string = '\n'
): string {
  if (skills.length === 0) return '';
  return skills.map(s => `${s.name}: ${s.description}`).join(separator);
}

/**
 * 获取单个技能的简短描述
 */
export function getSkillShortDesc(skillId: AttributeSkillId, level: number): string {
  const def = getSkillDef(skillId);
  const value = getSkillValue(skillId, level);
  return `${def.name} ${value}${def.description.includes('%') ? '%' : ''}`;
}

/**
 * 获取装备技能数量上限（根据强化等级）
 */
export function getMaxSkillCount(upgradeLevel: number): number {
  return Math.min(5, upgradeLevel + 1);
}

/**
 * 判断装备是否可以强化获得更多技能
 */
export function canGainMoreSkills(equipment: Equipment): boolean {
  if (!equipment.wuxing) return false;
  const currentCount = equipment.attributeSkills?.length ?? 0;
  const maxCount = getMaxSkillCount(equipment.upgradeLevel);
  return currentCount < maxCount && currentCount < 5;
}

/**
 * 获取所有装备的技能汇总（去重合并，相同技能等级取最高）
 */
export function getAllEquipmentSkills(equipment: PlayerEquipment): SkillDisplayInfo[] {
  const skillMap = new Map<AttributeSkillId, SkillDisplayInfo>();

  const processEquipment = (equip: Equipment | null) => {
    if (!equip || !equip.attributeSkills) return;
    const wuxingLevel = equip.wuxingLevel ?? 1;

    for (const skillId of equip.attributeSkills) {
      const existing = skillMap.get(skillId);
      if (!existing || existing.level < wuxingLevel) {
        const def = getSkillDef(skillId);
        const value = getSkillValue(skillId, wuxingLevel);
        skillMap.set(skillId, {
          id: skillId,
          name: def.name,
          description: def.description.replace('{value}', String(value)),
          level: wuxingLevel,
          value,
        });
      }
    }
  };

  processEquipment(equipment.weapon);
  processEquipment(equipment.armor);
  equipment.treasures.forEach(t => processEquipment(t));

  return Array.from(skillMap.values());
}
