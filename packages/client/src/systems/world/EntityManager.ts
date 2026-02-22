import Phaser from 'phaser';
import { Combatant } from '@xiyou/shared';

export interface WorldEntity {
  sprite: Phaser.Physics.Arcade.Sprite;
  combatant: Combatant;
  hpBar?: Phaser.GameObjects.Graphics;
  hpBarBg?: Phaser.GameObjects.Graphics;
  patrolCenterX: number;
  patrolCenterY: number;
  state: 'patrol' | 'chase' | 'attack';
  patrolTimer: number;   // 巡逻换向计时（ms）
  /** 攻击阶段：ready=待机, attacking=攻击中(60%), cooldown=冷却中(40%) */
  attackPhase: 'ready' | 'attacking' | 'cooldown';
  /** 当前攻击阶段剩余时间(ms) */
  attackPhaseTimer: number;
  /** 本轮攻击总间隔(ms)，用于计算冷却和动画速度 */
  attackCurrentInterval: number;
  atlasKey: string;
}

export class EntityManager {
  private enemies: Map<string, WorldEntity> = new Map();

  add(id: string, entity: WorldEntity): void {
    this.enemies.set(id, entity);
  }

  remove(id: string): void {
    this.enemies.delete(id);
  }

  get(id: string): WorldEntity | undefined {
    return this.enemies.get(id);
  }

  getAll(): WorldEntity[] {
    return Array.from(this.enemies.values());
  }

  getAlive(): WorldEntity[] {
    return this.getAll().filter(e => e.combatant.hp > 0);
  }

  clear(): void {
    this.enemies.clear();
  }
}
