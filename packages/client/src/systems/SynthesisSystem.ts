import {
  Equipment,
  Wuxing,
  WUXING_GENERATES,
  WUXING_CONQUERS,
  getWuxingRelation,
  checkRecipe,
  getLegendaryEquipment,
  SPECIAL_RECIPES,
} from '@xiyou/shared';
import { gameState } from './GameStateManager.js';

/**
 * 合成结果
 */
export interface SynthesisResult {
  success: boolean;
  result?: Equipment;        // 成功时的产物
  destroyedItem?: Equipment; // 被销毁/分解的装备
  gotFragment: boolean;      // 是否获得碎片
  message: string;
}

/**
 * 吞噬结果
 */
export interface DevourResult {
  success: boolean;
  upgradedItem?: Equipment;
  message: string;
}

/**
 * 合成概率表（黑盒，不暴露给玩家）
 */
const SYNTHESIS_RATES = {
  same: 0.5, // 同属性 50%

  // 相生概率（因属性而异）
  generate: {
    [Wuxing.METAL]: 0.3,
    [Wuxing.WATER]: 0.2,
    [Wuxing.WOOD]: 0.3,
    [Wuxing.FIRE]: 0.2,
    [Wuxing.EARTH]: 0.3,
  } as Record<Wuxing, number>,

  // 相克概率（因属性而异）
  conquer: {
    [Wuxing.METAL]: 0.2,
    [Wuxing.WATER]: 0.3,
    [Wuxing.WOOD]: 0.2,
    [Wuxing.FIRE]: 0.3,
    [Wuxing.EARTH]: 0.2,
  } as Record<Wuxing, number>,
};

/**
 * 碎片加成（每个 +5%）
 */
const FRAGMENT_BONUS = 0.05;

/**
 * 吞噬成功率
 */
const DEVOUR_BASE_RATE = 0.15;


/**
 * 合成系统
 */
export class SynthesisSystem {
  /**
   * 合成两件装备
   */
  static synthesize(slot1: number, slot2: number): SynthesisResult {
    const inventory = gameState.getInventory();
    const item1 = inventory[slot1];
    const item2 = inventory[slot2];

    if (!item1 || !item2) {
      return {
        success: false,
        gotFragment: false,
        message: '请选择两件装备进行合成',
      };
    }

    if (slot1 === slot2) {
      return {
        success: false,
        gotFragment: false,
        message: '不能选择同一件装备',
      };
    }

    // 检查特殊配方
    const specialResult = this.checkSpecialRecipe(item1, item2);
    if (specialResult) {
      // 移除两件装备
      gameState.removeFromInventory(slot1);
      gameState.removeFromInventory(slot2 > slot1 ? slot2 - 1 : slot2);
      // 添加结果
      gameState.addToInventory(specialResult);

      return {
        success: true,
        result: specialResult,
        gotFragment: false,
        message: `合成成功！获得了 ${specialResult.name}！`,
      };
    }

    // 计算合成概率
    const fragmentCount = gameState.getFragmentCount();
    const baseRate = this.getBaseRate(item1.wuxing, item2.wuxing);
    const finalRate = Math.min(baseRate + fragmentCount * FRAGMENT_BONUS, 0.95);

    // 判断成功/失败
    const roll = Math.random();
    const success = roll < finalRate;

    if (success) {
      // 成功：随机选择一个装备升级
      const upgradeFirst = Math.random() < 0.5;
      const upgraded = upgradeFirst ? item1 : item2;
      const destroyed = upgradeFirst ? item2 : item1;
      const destroyedSlot = upgradeFirst ? slot2 : slot1;
      const upgradedSlot = upgradeFirst ? slot1 : slot2;

      // 升级装备
      const upgradedItem = this.upgradeEquipment(upgraded);

      // 移除被销毁的装备
      gameState.removeFromInventory(destroyedSlot);

      // 更新升级后的装备
      const newSlot = destroyedSlot < upgradedSlot ? upgradedSlot - 1 : upgradedSlot;
      inventory[newSlot] = upgradedItem;

      return {
        success: true,
        result: upgradedItem,
        destroyedItem: destroyed,
        gotFragment: false,
        message: `合成成功！${upgradedItem.name} 升级了！`,
      };
    } else {
      // 失败：随机一件变成碎片
      const destroyFirst = Math.random() < 0.5;
      const destroyedSlot = destroyFirst ? slot1 : slot2;
      const destroyed = destroyFirst ? item1 : item2;

      gameState.removeFromInventory(destroyedSlot);
      gameState.addFragment();

      return {
        success: false,
        destroyedItem: destroyed,
        gotFragment: true,
        message: `合成失败... ${destroyed.name} 分解成了碎片`,
      };
    }
  }

  /**
   * 吞噬（指定装备吞噬另一个装备）
   */
  static devour(targetSlot: number, sacrificeSlot: number): DevourResult {
    const inventory = gameState.getInventory();
    const target = inventory[targetSlot];
    const sacrifice = inventory[sacrificeSlot];

    if (!target || !sacrifice) {
      return {
        success: false,
        message: '请选择目标装备和祭品装备',
      };
    }

    if (targetSlot === sacrificeSlot) {
      return {
        success: false,
        message: '不能吞噬自己',
      };
    }

    // 移除祭品
    gameState.removeFromInventory(sacrificeSlot);

    // 判断吞噬是否成功
    const roll = Math.random();
    if (roll < DEVOUR_BASE_RATE) {
      // 成功：目标装备升级
      const upgraded = this.upgradeEquipment(target);
      const newSlot = sacrificeSlot < targetSlot ? targetSlot - 1 : targetSlot;
      inventory[newSlot] = upgraded;

      return {
        success: true,
        upgradedItem: upgraded,
        message: `吞噬成功！${upgraded.name} 变得更强了！`,
      };
    } else {
      return {
        success: false,
        message: `吞噬失败... ${sacrifice.name} 消失了`,
      };
    }
  }

  /**
   * 获取合成基础概率
   */
  private static getBaseRate(wuxing1: Wuxing, wuxing2: Wuxing): number {
    if (wuxing1 === wuxing2) {
      return SYNTHESIS_RATES.same;
    }

    const relation = getWuxingRelation(wuxing1, wuxing2);

    if (relation === 'generate') {
      return SYNTHESIS_RATES.generate[wuxing1];
    }

    if (relation === 'conquer') {
      return SYNTHESIS_RATES.conquer[wuxing1];
    }

    // 无关系，取中间值
    return 0.3;
  }

  /**
   * 检查特殊配方
   */
  private static checkSpecialRecipe(item1: Equipment, item2: Equipment): Equipment | null {
    const recipe = checkRecipe(item1, item2);
    if (!recipe) return null;

    // 检查成功率
    if (Math.random() > recipe.successRate) {
      return null;
    }

    // 获取传说装备模板
    const legendary = getLegendaryEquipment(recipe.resultId);
    if (!legendary) return null;

    // 返回新实例
    return {
      ...legendary,
      id: `${legendary.id}_${Date.now()}`,
    };
  }

  /**
   * 升级装备
   */
  private static upgradeEquipment(equipment: Equipment): Equipment {
    return {
      ...equipment,
      upgradeLevel: equipment.upgradeLevel + 1,
      attack: equipment.attack ? equipment.attack + 1 : undefined,
      defense: equipment.defense ? equipment.defense + 1 : undefined,
      wuxingLevel: equipment.wuxingLevel + (equipment.upgradeLevel % 2 === 0 ? 1 : 0),
      name: this.getUpgradedName(equipment),
    };
  }

  /**
   * 获取升级后的名称
   */
  private static getUpgradedName(equipment: Equipment): string {
    const level = equipment.upgradeLevel + 1;
    const baseName = equipment.name.replace(/\+\d+$/, '').trim();
    return `${baseName} +${level}`;
  }
}
