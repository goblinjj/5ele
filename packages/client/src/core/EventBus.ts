export enum GameEvent {
  // 战斗事件
  COMBAT_DAMAGE     = 'combat:damage',
  COMBAT_DEATH      = 'combat:death',
  COMBAT_LOOT       = 'combat:loot',
  // 玩家事件
  PLAYER_HP_CHANGE  = 'player:hp_change',
  PLAYER_SKILL      = 'player:skill',
  PLAYER_DEATH      = 'player:death',
  // 世界事件
  ENEMY_SPAWNED     = 'world:enemy_spawned',
  ENEMY_DIED        = 'world:enemy_died',
  // UI事件
  SKILL_CD_UPDATE   = 'ui:skill_cd',
  // 掉落事件
  LOOT_DROPPED      = 'world:loot_dropped',
  // 回合事件
  KILL_COUNT_UPDATE = 'world:kill_count',
  ROUND_COMPLETE    = 'world:round_complete',
}

type EventHandler = (...args: unknown[]) => void;

class EventBusClass {
  private static instance: EventBusClass;
  private handlers: Map<GameEvent, EventHandler[]> = new Map();

  static getInstance(): EventBusClass {
    if (!EventBusClass.instance) {
      EventBusClass.instance = new EventBusClass();
    }
    return EventBusClass.instance;
  }

  on(event: GameEvent, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(handler);
  }

  off(event: GameEvent, handler: EventHandler): void {
    const list = this.handlers.get(event);
    if (list) {
      const idx = list.indexOf(handler);
      if (idx !== -1) list.splice(idx, 1);
    }
  }

  emit(event: GameEvent, ...args: unknown[]): void {
    this.handlers.get(event)?.forEach(h => h(...args));
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const eventBus = EventBusClass.getInstance();
