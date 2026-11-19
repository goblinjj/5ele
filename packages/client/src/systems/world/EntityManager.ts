import Phaser from 'phaser';
import { Combatant, Wuxing } from '@xiyou/shared';
import { EnemyKind } from '../../config/worldConfig.js';

export type EnemyTier = 'normal' | 'elite' | 'boss';
export type AttackPhase = 'idle' | 'windup' | 'strike' | 'recover';

export interface WorldEntity {
  sprite: Phaser.Physics.Arcade.Sprite;
  combatant: Combatant;
  atlasKey: string;
  kind: EnemyKind;
  tier: EnemyTier;
  wuxing: Wuxing;
  /** 所属阵眼下标；-1 = 侵袭而来的游荡妖异 */
  zoneIndex: number;

  // 附属显示对象
  shadow: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  /** 蓄力预警（圆或矩形，按需创建） */
  tele?: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;

  // AI
  homeX: number;
  homeY: number;
  aggro: boolean;
  patrolTimer: number;
  phase: AttackPhase;
  phaseTimer: number;
  phaseDuration: number;
  cooldown: number;
  /** 冲锋 / 弹道方向 */
  dirX: number;
  dirY: number;
  strikeHit: boolean;
  /** 被击退 */
  knockX: number;
  knockY: number;
  knockTimer: number;
  stunTimer: number;
  regenTimer: number;
  /** 病变核心专用计时 */
  bossBurstTimer: number;
  bossSummonTimer: number;

  // 状态
  baseScale: number;
  moveSpeed: number;
  enraged: boolean;
  dying: boolean;
  flashTimer: number;
}

export class EntityManager {
  private enemies: Map<string, WorldEntity> = new Map();
  /** 存活列表缓存（每帧被多处读取） */
  private aliveCache: WorldEntity[] = [];
  private dirty: boolean = true;

  add(id: string, entity: WorldEntity): void {
    this.enemies.set(id, entity);
    this.dirty = true;
  }

  remove(id: string): void {
    this.enemies.delete(id);
    this.dirty = true;
  }

  markDirty(): void {
    this.dirty = true;
  }

  get(id: string): WorldEntity | undefined {
    return this.enemies.get(id);
  }

  getAll(): WorldEntity[] {
    return Array.from(this.enemies.values());
  }

  /** 存活且未处于死亡动画中的妖异 */
  getAlive(): WorldEntity[] {
    if (this.dirty) {
      this.aliveCache = [];
      this.enemies.forEach(e => {
        if (!e.dying && e.combatant.hp > 0) this.aliveCache.push(e);
      });
      this.dirty = false;
    }
    return this.aliveCache;
  }

  clear(): void {
    this.enemies.clear();
    this.dirty = true;
  }
}
