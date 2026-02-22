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
  attackTimer: number;   // 攻击 CD 计时（ms）
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
