import {
  PlayerState,
  Equipment,
  EquipmentType,
  INVENTORY_SIZE,
  MAX_TREASURES,
  createInitialPlayerState,
} from '@xiyou/shared';

/**
 * 游戏状态管理器（单例）
 * 管理玩家状态、背包、装备等
 */
export class GameStateManager {
  private static instance: GameStateManager;
  private playerState: PlayerState;

  private constructor() {
    this.playerState = createInitialPlayerState('player', '玩家');
  }

  static getInstance(): GameStateManager {
    if (!GameStateManager.instance) {
      GameStateManager.instance = new GameStateManager();
    }
    return GameStateManager.instance;
  }

  /**
   * 重置游戏状态（新游戏）
   */
  reset(): void {
    this.playerState = createInitialPlayerState('player', '玩家');
  }

  /**
   * 获取玩家状态
   */
  getPlayerState(): PlayerState {
    return this.playerState;
  }

  /**
   * 获取背包
   */
  getInventory(): (Equipment | null)[] {
    return this.playerState.inventory.slots;
  }

  /**
   * 获取碎片数量
   */
  getFragmentCount(): number {
    return this.playerState.inventory.fragmentCount;
  }

  /**
   * 增加碎片
   */
  addFragment(): void {
    this.playerState.inventory.fragmentCount++;
  }

  /**
   * 消耗碎片（合成时使用）
   */
  useFragments(count: number): boolean {
    if (this.playerState.inventory.fragmentCount >= count) {
      this.playerState.inventory.fragmentCount -= count;
      return true;
    }
    return false;
  }

  /**
   * 检查背包是否已满
   */
  isInventoryFull(): boolean {
    return this.playerState.inventory.slots.every(slot => slot !== null);
  }

  /**
   * 获取背包空位数量
   */
  getEmptySlotCount(): number {
    return this.playerState.inventory.slots.filter(slot => slot === null).length;
  }

  /**
   * 添加物品到背包
   */
  addToInventory(equipment: Equipment): boolean {
    const emptyIndex = this.playerState.inventory.slots.findIndex(s => s === null);
    if (emptyIndex === -1) return false;
    this.playerState.inventory.slots[emptyIndex] = equipment;
    return true;
  }

  /**
   * 从背包移除物品
   */
  removeFromInventory(index: number): Equipment | null {
    if (index < 0 || index >= INVENTORY_SIZE) return null;
    const item = this.playerState.inventory.slots[index];
    this.playerState.inventory.slots[index] = null;
    return item;
  }

  /**
   * 获取装备的武器
   */
  getWeapon(): Equipment | null {
    return this.playerState.equipment.weapon;
  }

  /**
   * 获取装备的铠甲
   */
  getArmor(): Equipment | null {
    return this.playerState.equipment.armor;
  }

  /**
   * 获取装备的法宝列表
   */
  getTreasures(): Equipment[] {
    return this.playerState.equipment.treasures;
  }

  /**
   * 装备武器（从背包）
   */
  equipWeapon(inventoryIndex: number): boolean {
    const item = this.playerState.inventory.slots[inventoryIndex];
    if (!item || item.type !== EquipmentType.WEAPON) return false;

    // 如果已有武器，放回背包
    const oldWeapon = this.playerState.equipment.weapon;
    if (oldWeapon) {
      this.playerState.inventory.slots[inventoryIndex] = oldWeapon;
    } else {
      this.playerState.inventory.slots[inventoryIndex] = null;
    }

    this.playerState.equipment.weapon = item;
    return true;
  }

  /**
   * 装备铠甲（从背包）
   */
  equipArmor(inventoryIndex: number): boolean {
    const item = this.playerState.inventory.slots[inventoryIndex];
    if (!item || item.type !== EquipmentType.ARMOR) return false;

    const oldArmor = this.playerState.equipment.armor;
    if (oldArmor) {
      this.playerState.inventory.slots[inventoryIndex] = oldArmor;
    } else {
      this.playerState.inventory.slots[inventoryIndex] = null;
    }

    this.playerState.equipment.armor = item;
    return true;
  }

  /**
   * 装备法宝（从背包）
   */
  equipTreasure(inventoryIndex: number): boolean {
    const item = this.playerState.inventory.slots[inventoryIndex];
    if (!item || item.type !== EquipmentType.TREASURE) return false;

    if (this.playerState.equipment.treasures.length >= MAX_TREASURES) {
      return false;
    }

    this.playerState.inventory.slots[inventoryIndex] = null;
    this.playerState.equipment.treasures.push(item);
    return true;
  }

  /**
   * 卸下法宝（放回背包）
   */
  unequipTreasure(treasureIndex: number): boolean {
    if (treasureIndex < 0 || treasureIndex >= this.playerState.equipment.treasures.length) {
      return false;
    }

    if (this.isInventoryFull()) return false;

    const treasure = this.playerState.equipment.treasures.splice(treasureIndex, 1)[0];
    return this.addToInventory(treasure);
  }

  /**
   * 受到伤害
   */
  takeDamage(damage: number): void {
    this.playerState.hp = Math.max(0, this.playerState.hp - damage);
  }

  /**
   * 治疗
   */
  heal(amount: number): void {
    this.playerState.hp = Math.min(this.playerState.maxHp, this.playerState.hp + amount);
  }

  /**
   * 完全恢复
   */
  fullHeal(): void {
    this.playerState.hp = this.playerState.maxHp;
  }

  /**
   * 检查是否存活
   */
  isAlive(): boolean {
    return this.playerState.hp > 0;
  }

  /**
   * 获取总攻击力
   */
  getTotalAttack(): number {
    let attack = this.playerState.equipment.weapon?.attack ?? 1;
    for (const treasure of this.playerState.equipment.treasures) {
      attack += treasure.attack ?? 0;
    }
    return attack;
  }

  /**
   * 获取总防御力
   */
  getTotalDefense(): number {
    let defense = this.playerState.equipment.armor?.defense ?? 0;
    for (const treasure of this.playerState.equipment.treasures) {
      defense += treasure.defense ?? 0;
    }
    return defense;
  }
}

// 导出单例
export const gameState = GameStateManager.getInstance();
