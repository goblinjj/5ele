import Phaser from 'phaser';
import { Combatant, NORMAL_ENEMIES, Wuxing } from '@xiyou/shared';
import { EntityManager, WorldEntity, EnemyTier } from './EntityManager.js';
import {
  ZONES, ZoneDef, ZONE_RADIUS, WORLD_SIZE, WX_TINT,
  ENEMY_SCALE, ELITE_SCALE, BOSS_SCALE, STAT_SCALE,
} from '../../config/worldConfig.js';
import { Fx } from '../fx/Fx.js';

const MONSTER_ATLAS_MAP: Record<string, string> = {
  '树妖':   'monster_tree_demon',
  '獠牙怪': 'monster_fang_beast',
  '青鳞蛇': 'monster_green_snake',
  '赤狐精': 'monster_red_fox',
  '石头精': 'monster_stone_spirit',
};

const MONSTER_ATLAS_PATHS: Record<string, { json: string; image: string }> = {
  monster_tree_demon:   { json: 'assets/monsters/树妖/atlas.json',  image: 'assets/monsters/树妖/atlas.png' },
  monster_fang_beast:   { json: 'assets/monsters/獠牙怪/atlas.json', image: 'assets/monsters/獠牙怪/atlas.png' },
  monster_green_snake:  { json: 'assets/monsters/青鳞蛇/atlas.json', image: 'assets/monsters/青鳞蛇/atlas.png' },
  monster_red_fox:      { json: 'assets/monsters/赤狐精/atlas.json',  image: 'assets/monsters/赤狐精/atlas.png' },
  monster_stone_spirit: { json: 'assets/monsters/石头精/atlas.json',  image: 'assets/monsters/石头精/atlas.png' },
};

/** 各类妖异的基础移速 */
const KIND_SPEED = { charger: 175, swift: 270, caster: 170, brute: 150, slammer: 135 } as const;

/** 场上妖异数量上限（保证移动端帧率） */
export const MAX_ENEMIES = 36;

export class SpawnSystem {
  private scene: Phaser.Scene;
  private entityManager: EntityManager;
  private enemyGroup: Phaser.Physics.Arcade.Group;
  private fx: Fx;
  private seq: number = 0;

  constructor(scene: Phaser.Scene, entityManager: EntityManager, fx: Fx) {
    this.scene = scene;
    this.entityManager = entityManager;
    this.fx = fx;
    this.enemyGroup = scene.physics.add.group();
  }

  /** 预加载所有怪物图集（在 preload() 中调用） */
  static preloadAtlases(scene: Phaser.Scene): void {
    Object.entries(MONSTER_ATLAS_PATHS).forEach(([key, paths]) => {
      if (!scene.textures.exists(key)) {
        scene.load.atlas(key, paths.image, paths.json);
      }
    });
  }

  /** 创建怪物动画（在 create() 中调用） */
  createAnims(): void {
    const animTypes = ['idle', 'run', 'atk', 'hurt', 'magic', 'die'];
    Object.keys(MONSTER_ATLAS_PATHS).forEach(atlasKey => {
      if (!this.scene.textures.exists(atlasKey)) return;
      animTypes.forEach(anim => {
        const key = `${atlasKey}_${anim}`;
        if (this.scene.anims.exists(key)) return;
        const frames: Phaser.Types.Animations.AnimationFrame[] = [];
        for (let i = 0; i < 6; i++) {
          const f = `character_${anim}_${i}`;
          if (this.scene.textures.get(atlasKey).has(f)) {
            frames.push({ key: atlasKey, frame: f });
          }
        }
        if (frames.length > 0) {
          this.scene.anims.create({
            key,
            frames,
            frameRate: anim === 'idle' ? 8 : 12,
            repeat: anim === 'idle' || anim === 'run' ? -1 : 0,
          });
        }
      });
    });
  }

  // ───────────────────────── 生成 ─────────────────────────

  /** 构造一只妖异的战斗数据（数值随轮次成长） */
  private buildCombatant(zone: ZoneDef, round: number, tier: EnemyTier): Combatant {
    const tpl = NORMAL_ENEMIES.find(e => e.name === zone.monster) ?? NORMAL_ENEMIES[0];
    // 器物数值是 1~10 的小数，战斗中统一 ×STAT_SCALE
    const grow = 1 + (round - 1) * 0.45;
    let hp = tpl.hp * 3.4 * grow * STAT_SCALE;
    let attack = (tpl.attack + 2.5 + (round - 1) * 1.3) * STAT_SCALE;
    let defense = (tpl.defense + (round - 1) * 0.4) * STAT_SCALE;
    if (zone.kind === 'brute') hp *= 1.5;

    let name = tpl.name;
    if (tier === 'elite') {
      hp = hp * 3.2 + 6 * STAT_SCALE;
      attack *= 1.35;
      defense += STAT_SCALE;
      name = `${tpl.name}·魁`;
    } else if (tier === 'boss') {
      hp = (110 * grow + 60) * STAT_SCALE;
      attack *= 1.6;
      defense += 1.5 * STAT_SCALE;
      name = '病变核心';
    }
    hp = Math.ceil(hp);
    attack = Math.round(attack);
    defense = Math.round(defense);

    this.seq++;
    return {
      id: `${tpl.id}_${tier}_${round}_${this.seq}`,
      name,
      hp,
      maxHp: hp,
      attack,
      defense,
      speed: tpl.speed,
      isPlayer: false,
      attackWuxing: { wuxing: zone.wuxing, level: Math.min(10, round) },
      defenseWuxing: { wuxing: zone.wuxing, level: Math.min(10, round) },
      frozen: false,
    };
  }

  /** 在阵眼内滋生 count 只妖异，返回实际生成数量 */
  spawnZonePack(zoneIndex: number, count: number, round: number): number {
    const zone = ZONES[zoneIndex];
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      if (this.entityManager.getAlive().length >= MAX_ENEMIES) break;
      const a = Math.random() * Math.PI * 2;
      const r = 60 + Math.random() * (ZONE_RADIUS - 110);
      this.spawnEnemy(zone, zoneIndex, zone.x + Math.cos(a) * r, zone.y + Math.sin(a) * r, round, 'normal', false);
      spawned++;
    }
    return spawned;
  }

  /** 阵眼之魁（精英） */
  spawnElite(zoneIndex: number, round: number): WorldEntity {
    const zone = ZONES[zoneIndex];
    return this.spawnEnemy(zone, zoneIndex, zone.x, zone.y, round, 'elite', false);
  }

  /** 病变核心 */
  spawnBoss(zoneIndex: number, round: number): WorldEntity {
    const zone = ZONES[zoneIndex];
    return this.spawnEnemy(zone, zoneIndex, zone.x, zone.y, round, 'boss', true);
  }

  /**
   * 侵袭：一小队妖异在视野外凝聚成形，直扑残魂
   * @returns 实际生成数量
   */
  spawnHunters(px: number, py: number, count: number, round: number, wuxing?: Wuxing): number {
    const zone = wuxing
      ? ZONES.find(z => z.wuxing === wuxing)!
      : ZONES[Math.floor(Math.random() * ZONES.length)];
    // 在玩家视野外找一个落点
    let cx = px, cy = py;
    for (let tries = 0; tries < 8; tries++) {
      const a = Math.random() * Math.PI * 2;
      const d = 880 + Math.random() * 160;
      cx = Phaser.Math.Clamp(px + Math.cos(a) * d, 120, WORLD_SIZE - 120);
      cy = Phaser.Math.Clamp(py + Math.sin(a) * d, 120, WORLD_SIZE - 120);
      if (Phaser.Math.Distance.Between(cx, cy, px, py) > 700) break;
    }
    let spawned = 0;
    for (let i = 0; i < count; i++) {
      if (this.entityManager.getAlive().length >= MAX_ENEMIES) break;
      const a = (i / count) * Math.PI * 2;
      this.spawnEnemy(zone, -1, cx + Math.cos(a) * 70, cy + Math.sin(a) * 70, round, 'normal', true);
      spawned++;
    }
    return spawned;
  }

  /** 病变核心召唤的爪牙（贴身生成） */
  spawnMinions(x: number, y: number, count: number, round: number, wuxing: Wuxing): void {
    const zone = ZONES.find(z => z.wuxing === wuxing)!;
    for (let i = 0; i < count; i++) {
      if (this.entityManager.getAlive().length >= MAX_ENEMIES) break;
      const a = (i / count) * Math.PI * 2 + Math.random();
      this.spawnEnemy(zone, -1, x + Math.cos(a) * 150, y + Math.sin(a) * 150, round, 'normal', true);
    }
  }

  private spawnEnemy(
    zone: ZoneDef, zoneIndex: number,
    x: number, y: number,
    round: number, tier: EnemyTier, aggro: boolean,
  ): WorldEntity {
    const s = this.scene;
    const combatant = this.buildCombatant(zone, round, tier);
    const atlasKey = MONSTER_ATLAS_MAP[zone.monster];
    const hasAtlas = !!atlasKey && s.textures.exists(atlasKey);
    const tint = WX_TINT[zone.wuxing];

    x = Phaser.Math.Clamp(x, 80, WORLD_SIZE - 80);
    y = Phaser.Math.Clamp(y, 80, WORLD_SIZE - 80);

    const sprite = hasAtlas
      ? s.physics.add.sprite(x, y, atlasKey, 'character_idle_0')
      : s.physics.add.sprite(x, y, '__DEFAULT');
    if (hasAtlas) sprite.play(`${atlasKey}_idle`);

    const baseScale = tier === 'boss' ? BOSS_SCALE : tier === 'elite' ? ELITE_SCALE : ENEMY_SCALE;
    sprite.setScale(baseScale);
    sprite.setCollideWorldBounds(true);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setCircle(62, 92, 130);
    if (tier === 'boss') {
      body.setImmovable(true);
      sprite.setTint(0xc9a0ff);
    }

    const footY = y + 307 * baseScale * 0.36;
    const shadow = s.add.image(x, footY, 'fx_shadow').setScale(baseScale * 3.1).setDepth(-20);
    const ring = s.add.image(x, footY, 'fx_ring').setTint(tint)
      .setScale(baseScale * 1.25, baseScale * 0.5).setAlpha(tier === 'normal' ? 0.55 : 0.95).setDepth(-19);
    if (tier !== 'normal') ring.setBlendMode(Phaser.BlendModes.ADD);

    const barW = tier === 'boss' ? 200 : tier === 'elite' ? 110 : 64;
    const hpBg = s.add.rectangle(x, y, barW + 4, 10, 0x000000, 0.7).setVisible(false);
    const hpFill = s.add.rectangle(x, y, barW, 6, tint, 1).setOrigin(0, 0.5).setVisible(false);

    const entity: WorldEntity = {
      sprite, combatant,
      atlasKey: hasAtlas ? atlasKey : '',
      kind: zone.kind,
      tier,
      wuxing: zone.wuxing,
      zoneIndex,
      shadow, ring, hpBg, hpFill,
      homeX: zone.x, homeY: zone.y,
      aggro,
      patrolTimer: Math.random() * 1500,
      phase: 'idle',
      phaseTimer: 0,
      phaseDuration: 0,
      cooldown: 200 + Math.random() * 600,
      dirX: 1, dirY: 0,
      strikeHit: false,
      knockX: 0, knockY: 0, knockTimer: 0,
      stunTimer: 0,
      regenTimer: 3000,
      bossBurstTimer: 3500,
      bossSummonTimer: 9000,
      baseScale,
      moveSpeed: KIND_SPEED[zone.kind] * (tier === 'elite' ? 1.1 : tier === 'boss' ? 0.75 : 1) * (0.92 + Math.random() * 0.16),
      enraged: false,
      dying: false,
      flashTimer: 0,
    };

    // 凝聚成形：从五行光点中显现
    sprite.setAlpha(0).setScale(baseScale * 0.4);
    s.tweens.add({ targets: sprite, alpha: 1, scale: baseScale, duration: 320, ease: 'Back.easeOut' });
    this.fx.flashGlow(x, y, tier === 'normal' ? 90 : 220, tint, 420, 0.7);

    this.entityManager.add(combatant.id, entity);
    this.enemyGroup.add(sprite);
    return entity;
  }

  // ───────────────────────── 显示同步 ─────────────────────────

  /** 每帧同步阴影 / 五行环 / 血条位置与深度 */
  syncVisuals(entity: WorldEntity): void {
    const { sprite, baseScale } = entity;
    const footY = sprite.y + 307 * baseScale * 0.36;
    sprite.setDepth(footY);
    entity.shadow.setPosition(sprite.x, footY);
    entity.ring.setPosition(sprite.x, footY);
    if (entity.hpBg.visible) {
      const top = sprite.y - 307 * baseScale * 0.42;
      entity.hpBg.setPosition(sprite.x, top).setDepth(footY + 1);
      entity.hpFill.setPosition(sprite.x - (entity.hpBg.width - 4) / 2, top).setDepth(footY + 2);
    }
  }

  updateHpBar(entity: WorldEntity): void {
    const pct = Phaser.Math.Clamp(entity.combatant.hp / entity.combatant.maxHp, 0, 1);
    // 病变核心的血条显示在屏幕上方
    const show = entity.tier !== 'boss' && (pct < 1 || entity.tier === 'elite');
    entity.hpBg.setVisible(show);
    entity.hpFill.setVisible(show);
    entity.hpFill.width = (entity.hpBg.width - 4) * pct;
  }

  /** 销毁一只妖异的全部显示对象 */
  destroyEntity(entity: WorldEntity): void {
    entity.shadow.destroy();
    entity.ring.destroy();
    entity.hpBg.destroy();
    entity.hpFill.destroy();
    entity.tele?.destroy();
    entity.tele = undefined;
    if (entity.sprite.active) entity.sprite.destroy();
    this.entityManager.remove(entity.combatant.id);
  }

  /** 让剩余妖异消散（不掉落），用于气脉暂稳 */
  dissolveAll(): void {
    this.entityManager.getAll().forEach(entity => {
      if (entity.dying) return;
      entity.dying = true;
      entity.combatant.hp = 0;
      (entity.sprite.body as Phaser.Physics.Arcade.Body | null)?.setEnable(false);
      entity.tele?.setVisible(false);
      this.fx.burst(entity.sprite.x, entity.sprite.y, WX_TINT[entity.wuxing], 6);
      this.scene.tweens.add({
        targets: [entity.sprite, entity.shadow, entity.ring],
        alpha: 0, duration: 500,
        onComplete: () => this.destroyEntity(entity),
      });
    });
    this.entityManager.markDirty();
  }

  /** 立即清场（重开时调用） */
  clearAll(): void {
    this.entityManager.getAll().forEach(entity => this.destroyEntity(entity));
    this.entityManager.clear();
    this.enemyGroup.clear();
  }

  getEnemyGroup(): Phaser.Physics.Arcade.Group {
    return this.enemyGroup;
  }
}
