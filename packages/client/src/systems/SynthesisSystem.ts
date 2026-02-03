import {
  Equipment,
  Wuxing,
  WUXING_GENERATES,
  WUXING_CONQUERS,
  checkRecipe,
  getLegendaryEquipment,
  SPECIAL_RECIPES,
} from '@xiyou/shared';
import { gameState } from './GameStateManager.js';

/**
 * 重组结果
 */
export interface SynthesisResult {
  success: boolean;
  result?: Equipment;        // 成功时的产物
  destroyedItems: Equipment[]; // 被销毁的器物（两件都会销毁）
  fragmentsGained: number;   // 获得的碎片数量
  message: string;
  isSpecial?: boolean;       // 是否为特殊重组（传说器物）
}

/**
 * 归元结果
 */
export interface DevourResult {
  success: boolean;
  upgradedItem?: Equipment;
  message: string;
}

/**
 * 五行重组关系类型
 * 相生（辅生主）: 60% - 土生金、水生木、金生水、木生火、火生土
 * 相助（同属性）: 50%
 * 相耗（主克辅）: 40% - 金克木、木克土、土克水、水克火、火克金
 * 相克（辅克主）: 30%
 * 相泻（主生辅）: 20%
 */
type SynthesisRelation = 'generate' | 'assist' | 'consume' | 'conquer' | 'drain';

/**
 * 重组概率表
 */
const SYNTHESIS_RATES: Record<SynthesisRelation, number> = {
  generate: 0.6,  // 相生（辅生主）60%
  assist: 0.5,    // 相助（同属性）50%
  consume: 0.4,   // 相耗（主克辅）40%
  conquer: 0.3,   // 相克（辅克主）30%
  drain: 0.2,     // 相泻（主生辅）20%
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
   * 计算合成成功率（用于 UI 显示）
   * @param slot1 第一件装备的槽位
   * @param slot2 第二件装备的槽位
   * @param useFragments 是否使用碎片
   * @returns 成功率百分比字符串，如 "50%" 或错误信息
   */
  static calculateSuccessRate(slot1: number, slot2: number, useFragments: boolean = false): { rate: number; rateStr: string; error?: string } {
    const inventory = gameState.getInventory();
    const item1 = inventory[slot1];
    const item2 = inventory[slot2];

    if (!item1 || !item2) {
      return { rate: 0, rateStr: '0%', error: '请选择两件装备' };
    }

    if (item1.upgradeLevel !== item2.upgradeLevel) {
      return { rate: 0, rateStr: '0%', error: '强化等级不同' };
    }

    // 检查特殊配方
    const recipe = checkRecipe(item1, item2);
    if (recipe) {
      return { rate: recipe.successRate * 100, rateStr: `${Math.floor(recipe.successRate * 100)}% (特殊配方)` };
    }

    // 计算基础概率
    const baseRate = (item1.wuxing !== undefined && item2.wuxing !== undefined)
      ? this.getBaseRate(item1.wuxing, item2.wuxing)
      : 0.5;

    // 碎片加成
    let fragmentBonus = 0;
    if (useFragments) {
      const fragmentCount = gameState.getFragmentCount();
      fragmentBonus = fragmentCount * FRAGMENT_BONUS;
    }

    const finalRate = Math.min(baseRate + fragmentBonus, 0.95);
    const percent = Math.floor(finalRate * 100);

    return { rate: percent, rateStr: `${percent}%` };
  }

  /**
   * 合成两件装备
   * @param slot1 第一件装备的槽位（将被升级）
   * @param slot2 第二件装备的槽位（作为材料）
   * @param useFragments 是否消耗碎片提升成功率
   */
  static synthesize(slot1: number, slot2: number, useFragments: boolean = false): SynthesisResult {
    const inventory = gameState.getInventory();
    const item1 = inventory[slot1];
    const item2 = inventory[slot2];

    if (!item1 || !item2) {
      return {
        success: false,
        destroyedItems: [],
        fragmentsGained: 0,
        message: '请选择两件器物进行重组',
      };
    }

    if (slot1 === slot2) {
      return {
        success: false,
        destroyedItems: [],
        fragmentsGained: 0,
        message: '不能选择同一件装备',
      };
    }

    // 检查升级等级是否相同
    if (item1.upgradeLevel !== item2.upgradeLevel) {
      return {
        success: false,
        destroyedItems: [],
        fragmentsGained: 0,
        message: `只有相同强化等级的装备才能合成（+${item1.upgradeLevel} 与 +${item2.upgradeLevel} 不匹配）`,
      };
    }

    // 检查特殊配方
    const specialResult = this.checkSpecialRecipe(item1, item2);
    if (specialResult) {
      // 移除两件装备（先移除较大索引）
      if (slot1 > slot2) {
        gameState.removeFromInventory(slot1);
        gameState.removeFromInventory(slot2);
      } else {
        gameState.removeFromInventory(slot2);
        gameState.removeFromInventory(slot1);
      }
      // 添加结果
      gameState.addToInventory(specialResult);

      return {
        success: true,
        result: specialResult,
        destroyedItems: [item1, item2],
        fragmentsGained: 0,
        message: `重组成功！获得了 ${specialResult.name}！`,
        isSpecial: true,
      };
    }

    // 计算合成概率（无属性装备使用默认概率）
    const fragmentCount = gameState.getFragmentCount();
    const baseRate = (item1.wuxing !== undefined && item2.wuxing !== undefined)
      ? this.getBaseRate(item1.wuxing, item2.wuxing)
      : 0.5;  // 无属性时默认50%成功率

    // 碎片加成
    let fragmentBonus = 0;
    if (useFragments && fragmentCount > 0) {
      fragmentBonus = fragmentCount * FRAGMENT_BONUS;
      // 消耗所有碎片
      gameState.useAllFragments();
    }
    const finalRate = Math.min(baseRate + fragmentBonus, 0.95);

    // 判断成功/失败
    const roll = Math.random();
    const success = roll < finalRate;

    // 两件装备都会被销毁（先移除较大索引）
    if (slot1 > slot2) {
      gameState.removeFromInventory(slot1);
      gameState.removeFromInventory(slot2);
    } else {
      gameState.removeFromInventory(slot2);
      gameState.removeFromInventory(slot1);
    }

    if (success) {
      // 成功：第一件装备升级
      const upgradedItem = this.upgradeEquipment(item1);
      gameState.addToInventory(upgradedItem);

      return {
        success: true,
        result: upgradedItem,
        destroyedItems: [item1, item2],
        fragmentsGained: 0,
        message: `重组成功！${upgradedItem.name} 升级了！`,
      };
    } else {
      // 失败：获得2个碎片
      gameState.addFragment();
      gameState.addFragment();

      return {
        success: false,
        destroyedItems: [item1, item2],
        fragmentsGained: 2,
        message: `重组失败... ${item1.name} 和 ${item2.name} 归元为2个碎片`,
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
        message: '请选择目标器物和祭品器物',
      };
    }

    if (targetSlot === sacrificeSlot) {
      return {
        success: false,
        message: '不能归元自己',
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
        message: `归元成功！${upgraded.name} 变得更强了！`,
      };
    } else {
      return {
        success: false,
        message: `归元失败... ${sacrifice.name} 消散了`,
      };
    }
  }

  /**
   * 获取五行重组关系
   * @param primary 主器物（最终升级的器物）
   * @param secondary 辅器物（作为材料的器物）
   */
  private static getSynthesisRelation(primary: Wuxing, secondary: Wuxing): SynthesisRelation {
    // 相助：同属性
    if (primary === secondary) {
      return 'assist';
    }

    // 相生：辅生主（辅的生目标是主）
    if (WUXING_GENERATES[secondary] === primary) {
      return 'generate';
    }

    // 相耗：主克辅（主的克目标是辅）
    if (WUXING_CONQUERS[primary] === secondary) {
      return 'consume';
    }

    // 相克：辅克主（辅的克目标是主）
    if (WUXING_CONQUERS[secondary] === primary) {
      return 'conquer';
    }

    // 相泻：主生辅（主的生目标是辅）
    if (WUXING_GENERATES[primary] === secondary) {
      return 'drain';
    }

    // 理论上不会到这里，但作为保底
    return 'assist';
  }

  /**
   * 获取重组基础概率
   * @param primary 主器物属性
   * @param secondary 辅器物属性
   */
  private static getBaseRate(primary: Wuxing, secondary: Wuxing): number {
    const relation = this.getSynthesisRelation(primary, secondary);
    return SYNTHESIS_RATES[relation];
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
    // 五行等级只在有属性时升级
    const newWuxingLevel = equipment.wuxingLevel !== undefined
      ? equipment.wuxingLevel + (equipment.upgradeLevel % 2 === 0 ? 1 : 0)
      : undefined;

    return {
      ...equipment,
      upgradeLevel: equipment.upgradeLevel + 1,
      attack: equipment.attack ? equipment.attack + 1 : undefined,
      defense: equipment.defense ? equipment.defense + 1 : undefined,
      wuxingLevel: newWuxingLevel,
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
