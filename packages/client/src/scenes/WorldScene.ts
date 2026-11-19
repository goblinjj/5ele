import Phaser from 'phaser';
import { inputManager } from '../systems/input/InputManager.js';
import { eventBus, GameEvent } from '../core/EventBus.js';
import { gameState } from '../systems/GameStateManager.js';
import {
  Combatant,
  getTotalAttack,
  getTotalDefense,
  getTotalSpeed,
  getAttackWuxing,
  getDefenseWuxing,
  getAllWuxingLevels,
  getAllAttributeSkills,
  calculateSkillEffectLevels,
  getSkillValue,
  generateWuxingEquipment,
  AttributeSkillId,
  Wuxing,
  WUXING_NAMES,
  Rarity,
  Equipment,
  EquipmentType,
  MAX_TREASURES,
} from '@xiyou/shared';
import { EntityManager, WorldEntity, EnemyTier } from '../systems/world/EntityManager.js';
import { SpawnSystem } from '../systems/world/SpawnSystem.js';
import { EnemyAI } from '../systems/world/EnemyAI.js';
import { WorldBackdrop } from '../systems/world/WorldBackdrop.js';
import { CombatSystem, AOE_SKILL_IDS } from '../systems/combat/CombatSystem.js';
import { Fx, FX_DEPTH } from '../systems/fx/Fx.js';
import {
  WORLD_SIZE, WORLD_CENTER, ZONES, WX_TINT, SPIRIT_TINT,
  PLAYER_SCALE, PLAYER_SPEED, AUTO_ATTACK_RANGE, ORB_MAGNET_RANGE,
  getRoundDuration, isBossRound, relationOf, STAT_SCALE,
} from '../config/worldConfig.js';
import { sfx } from '../systems/audio/Sfx.js';

const PLAYER_ATLAS = 'player_spirit';

/** 遁（闪避） */
const DASH_SPEED = 1350;
const DASH_DURATION = 170;
const DASH_COOLDOWN = 3000;
const DASH_INVULN = 340;

/** 塑型：每份能量的凝练时长（不打断移动与攻击） */
const SHAPE_DURATION = 600;
/** 轮间调息时长 */
const REST_DURATION = 6000;

const RARITY_COLOR: Record<string, string> = {
  [Rarity.COMMON]: '#c9d1d9',
  [Rarity.UNCOMMON]: '#4ade80',
  [Rarity.RARE]: '#58a6ff',
  [Rarity.EPIC]: '#c084fc',
  [Rarity.LEGENDARY]: '#ffb020',
};

interface Orb {
  glow: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
  wuxing: Wuxing;
  level: number;
  highQuality: boolean;
  life: number;
  speed: number;
  /** 落地弹开的初速度 */
  vx: number;
  vy: number;
}

interface ShapeJob {
  wuxing: Wuxing;
  level: number;
  highQuality: boolean;
}

type RoundPhase = 'fight' | 'rest' | 'victory' | 'over';

/**
 * 塑型成功率：以残魂防具的五行为「我」，看被吸纳的能量
 *   生（能量生我）75%  比（同属）60%  耗（我克能量）50%  泄（我生能量）40%  克（能量克我）30%
 */
function shapingRate(defWuxing: Wuxing | undefined, energy: Wuxing): { rel: string; rate: number } {
  switch (relationOf(defWuxing, energy)) {
    case 'bisheng': return { rel: '生', rate: 0.75 };
    case 'same': return { rel: '比', rate: 0.60 };
    case 'ke': return { rel: '耗', rate: 0.50 };
    case 'sheng': return { rel: '泄', rate: 0.40 };
    case 'beike': return { rel: '克', rate: 0.30 };
    default: return { rel: '无属', rate: 0.45 };
  }
}

/** 灵囊与身上是否已有某五行的某类器物 */
function ownsGear(type: EquipmentType, wuxing: Wuxing): boolean {
  const eq = gameState.getPlayerState().equipment;
  const equipped = type === EquipmentType.WEAPON ? eq.weapon : eq.armor;
  if (equipped?.wuxing === wuxing) return true;
  return gameState.getInventory().some(it => it?.type === type && it.wuxing === wuxing);
}

/**
 * 在灵囊中找出某五行最好的武器 / 防具并换上（原来穿的回到灵囊同一格）
 * @returns 换上的器物；没有可换的返回 null
 */
export function quickSwapGear(type: EquipmentType.WEAPON | EquipmentType.ARMOR, wuxing: Wuxing): Equipment | null {
  const inv = gameState.getInventory();
  let best = -1;
  let bestScore = -1;
  inv.forEach((it, i) => {
    if (!it || it.type !== type || it.wuxing !== wuxing) return;
    const main = type === EquipmentType.WEAPON ? (it.attack ?? 0) : (it.defense ?? 0);
    const score = main * 100 + (it.wuxingLevel ?? 1) * 10 + it.upgradeLevel * 5 + (it.hp ?? 0);
    if (score > bestScore) { bestScore = score; best = i; }
  });
  if (best < 0) return null;
  const item = inv[best]!;
  const ok = type === EquipmentType.WEAPON ? gameState.equipWeapon(best) : gameState.equipArmor(best);
  return ok ? item : null;
}

/** 当前装备提供的范围技能（去重、保持顺序，最多 5 个）—— HUD 与战斗系统共用 */
export function getEquippedAoeSkills(): AttributeSkillId[] {
  const all = getAllAttributeSkills(gameState.getPlayerState().equipment);
  const out: AttributeSkillId[] = [];
  all.forEach(id => {
    if (AOE_SKILL_IDS.has(id) && !out.includes(id)) out.push(id);
  });
  return out.slice(0, 5);
}

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerShadow!: Phaser.GameObjects.Image;
  private playerAura!: Phaser.GameObjects.Image;
  private rangeRing!: Phaser.GameObjects.Image;
  private targetMark!: Phaser.GameObjects.Image;
  private guardRing!: Phaser.GameObjects.Image;
  private guardGlow!: Phaser.GameObjects.Image;
  private pc!: Combatant;

  private keys?: Record<string, Phaser.Input.Keyboard.Key>;

  private fx!: Fx;
  private backdrop!: WorldBackdrop;
  private entityManager!: EntityManager;
  private spawnSystem!: SpawnSystem;
  private combat!: CombatSystem;
  private enemyAI!: EnemyAI;

  // 操控
  private facingX: number = 1;
  private facingY: number = 0;
  private dashTimer: number = 0;
  private dashCd: number = 0;
  private dashDirX: number = 1;
  private dashDirY: number = 0;
  private dashGhostTimer: number = 0;

  // 轮次
  private round: number = 1;
  private phase: RoundPhase = 'fight';
  private roundTimer: number = 0;
  private restTimer: number = 0;
  private hunterTimer: number = 0;
  private roundKills: number = 0;
  private roundQuota: number = 0;
  private boss: WorldEntity | null = null;
  private zoneAlive: number[] = [0, 0, 0, 0, 0];

  // 五行能量与塑型
  private orbs: Orb[] = [];
  private shapeQueue: ShapeJob[] = [];
  private shapeTimer: number = 0;
  private shapeGfx!: Phaser.GameObjects.Graphics;
  /** 塑型失败累计补偿概率：每次失败 +5%，成功后清零 */
  private shapingBonus: number = 0;

  private indicator!: Phaser.GameObjects.Graphics;
  private wuxingEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private stateTick: number = 0;
  private trailTick: number = 0;
  /** 连续多少只普通妖异没有留下能量（掉落保底用） */
  private dryKills: number = 0;
  private statsSynced: boolean = false;

  constructor() {
    super({ key: 'WorldScene' });
  }

  preload(): void {
    if (!this.textures.exists(PLAYER_ATLAS)) {
      this.load.atlas(PLAYER_ATLAS, 'assets/player/灵体残骸/atlas.png', 'assets/player/灵体残骸/atlas.json');
    }
    SpawnSystem.preloadAtlases(this);
  }

  create(): void {
    // 清理上一局残留的事件监听与输入
    eventBus.clear();
    inputManager.reset();
    this.resetState();

    const { width, height } = this.scale;

    // ---- 相机：全屏，残魂略偏上，给下方操控区留出视野 ----
    const cam = this.cameras.main;
    cam.setViewport(0, 0, width, height);
    cam.setBounds(-260, -260, WORLD_SIZE + 520, WORLD_SIZE + 520);
    cam.setBackgroundColor('#020406');
    this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);

    // ---- 世界 ----
    this.fx = new Fx(this);
    this.backdrop = new WorldBackdrop(this);
    this.createAtmosphere(width, height);

    // ---- 残魂 ----
    this.createPlayer();
    this.createPlayerAnims();
    cam.startFollow(this.player, true, 0.14, 0.14, 0, -height * 0.07);
    cam.fadeIn(600, 0, 0, 0);

    // ---- 系统 ----
    this.entityManager = new EntityManager();
    this.spawnSystem = new SpawnSystem(this, this.entityManager, this.fx);
    this.spawnSystem.createAnims();
    this.combat = new CombatSystem(this, this.entityManager, this.spawnSystem, this.fx, this.player, this.pc);
    this.enemyAI = new EnemyAI(this, this.entityManager, this.spawnSystem, this.combat, this.fx);
    // 妖异之间互相推挤，避免叠成一团（不与残魂碰撞，残魂不会被卡住）
    this.physics.add.collider(this.spawnSystem.getEnemyGroup(), this.spawnSystem.getEnemyGroup());

    this.shapeGfx = this.add.graphics().setDepth(FX_DEPTH + 2);
    this.indicator = this.add.graphics().setDepth(FX_DEPTH + 3);

    this.syncPlayerStats();
    this.setupKeyboard();
    this.bindEvents();

    // ---- HUD ----
    if (this.scene.isActive('HUDScene')) this.scene.stop('HUDScene');
    this.scene.launch('HUDScene');
    this.scene.bringToTop('HUDScene');

    // 「五行所属」已由武器 / 防具的五行取代
    gameState.setChosenWuxing(undefined);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.onShutdown());

    // HUD 就绪后同步一次生命值
    this.time.delayedCall(100, () => {
      eventBus.emit(GameEvent.PLAYER_HP_CHANGE, this.pc.hp, this.pc.maxHp);
    });
  }

  /** 场景实例会被复用（重新开始），所有运行期状态都要在这里复位 */
  private resetState(): void {
    this.facingX = 1; this.facingY = 0;
    this.dashTimer = 0; this.dashCd = 0; this.dashGhostTimer = 0;
    // 以"第 0 轮调息"开局，短暂停顿后自动进入第 1 轮
    this.round = 0;
    this.phase = 'rest';
    this.roundTimer = 0; this.restTimer = 400; this.hunterTimer = 0;
    this.roundKills = 0; this.roundQuota = 0;
    this.boss = null;
    this.zoneAlive = [0, 0, 0, 0, 0];
    this.orbs = [];
    this.shapeQueue = [];
    this.shapeTimer = 0;
    this.shapingBonus = 0;
    this.wuxingEmitter = undefined;
    this.stateTick = 0;
    this.trailTick = 0;
    this.dryKills = 0;
    this.statsSynced = false;
  }

  private onShutdown(): void {
    this.scene.stop('HUDScene');
    this.scene.stop('InventoryScene');
    inputManager.reset();
    eventBus.clear();
  }

  // ───────────────────────── 搭建 ─────────────────────────

  /** 漂浮的灵气微尘 + 暗角 */
  private createAtmosphere(width: number, height: number): void {
    this.add.particles(0, 0, 'fx_dot', {
      x: { min: 0, max: width },
      y: { min: 0, max: height },
      lifespan: 4200,
      speedY: { min: -38, max: -10 },
      speedX: { min: -14, max: 14 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 0.55, end: 0 },
      tint: [0x9fd8ff, 0xd4a853, 0xffffff],
      frequency: 170,
      blendMode: Phaser.BlendModes.ADD,
    }).setScrollFactor(0).setDepth(FX_DEPTH - 20);

    this.add.image(width / 2, height / 2, 'fx_vignette')
      .setDisplaySize(width * 1.25, height * 1.12)
      .setScrollFactor(0).setDepth(FX_DEPTH + 60);
  }

  private createPlayer(): void {
    const ps = gameState.getPlayerState();
    this.pc = {
      id: 'player',
      name: '残魂',
      hp: ps.hp * STAT_SCALE,
      maxHp: ps.maxHp * STAT_SCALE,
      attack: 1,
      defense: 0,
      speed: 0,
      isPlayer: true,
      attackWuxing: null,
      defenseWuxing: null,
      frozen: false,
      statusEffects: {},
    };

    const C = WORLD_CENTER;
    this.playerAura = this.add.image(C, C, 'fx_glow').setBlendMode(Phaser.BlendModes.ADD)
      .setTint(SPIRIT_TINT).setScale(1.25).setAlpha(0.42).setDepth(-12);
    this.tweens.add({ targets: this.playerAura, alpha: 0.26, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.rangeRing = this.add.image(C, C, 'fx_ring').setTint(SPIRIT_TINT)
      .setScale((AUTO_ATTACK_RANGE * 2) / 256).setAlpha(0.07).setDepth(-14);
    this.targetMark = this.add.image(C, C, 'fx_ring').setTint(0xffe066)
      .setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(-13);
    this.playerShadow = this.add.image(C, C, 'fx_shadow').setScale(PLAYER_SCALE * 3).setDepth(-11);
    // 御的护体气罩
    this.guardRing = this.add.image(C, C, 'fx_ring').setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(FX_DEPTH - 4);
    this.guardGlow = this.add.image(C, C, 'fx_glow').setBlendMode(Phaser.BlendModes.ADD).setVisible(false).setDepth(FX_DEPTH - 5);

    this.player = this.textures.exists(PLAYER_ATLAS)
      ? this.physics.add.sprite(C, C, PLAYER_ATLAS, 'character_idle_0')
      : this.physics.add.sprite(C, C, '__DEFAULT');
    this.player.setScale(PLAYER_SCALE);
    this.player.setCollideWorldBounds(true);
    (this.player.body as Phaser.Physics.Arcade.Body).setCircle(56, 98, 130);
  }

  private createPlayerAnims(): void {
    if (!this.textures.exists(PLAYER_ATLAS)) return;
    const types = ['idle', 'run', 'atk', 'hurt', 'magic', 'die'];
    types.forEach(anim => {
      const key = `${PLAYER_ATLAS}_${anim}`;
      if (this.anims.exists(key)) this.anims.remove(key);
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = 0; i < 6; i++) {
        const f = `character_${anim}_${i}`;
        if (this.textures.get(PLAYER_ATLAS).has(f)) frames.push({ key: PLAYER_ATLAS, frame: f });
      }
      if (frames.length > 0) {
        this.anims.create({
          key,
          frames,
          frameRate: anim === 'idle' ? 8 : 12,
          repeat: anim === 'idle' || anim === 'run' ? -1 : 0,
        });
      }
    });
    this.player.play(`${PLAYER_ATLAS}_idle`);
  }

  private setupKeyboard(): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    kb.on('keydown-SPACE', () => inputManager.pressDash());
    kb.on('keydown-SHIFT', () => inputManager.pressGuard());
    kb.on('keydown-F', () => inputManager.pressGuard());
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].forEach((name, i) => {
      kb.on(`keydown-${name}`, () => inputManager.pressSkill(i));
    });
  }

  private bindEvents(): void {
    eventBus.on(GameEvent.ENEMY_DIED, (e: unknown) => this.onEnemyDied(e as WorldEntity));
    eventBus.on(GameEvent.LOOT_DROPPED, (data: unknown) => {
      const d = data as { x: number; y: number; wuxing: Wuxing; level: number; tier: EnemyTier };
      this.dropLoot(d.x, d.y, d.wuxing, d.level, d.tier);
    });
    eventBus.on(GameEvent.GAME_OVER, () => this.onGameOver());
    eventBus.on(GameEvent.PLAYER_HP_CHANGE, () => {
      const ps = gameState.getPlayerState();
      ps.hp = Math.max(0, Math.min(ps.maxHp, Math.round(this.pc.hp / STAT_SCALE)));
    });
    eventBus.on(GameEvent.STATS_CHANGED, () => this.syncPlayerStats());
    // HUD 快换器物：换上后给一个该五行的爆发提示
    eventBus.on(GameEvent.GEAR_SWAPPED, (data: unknown) => {
      const d = data as { item: Equipment };
      const wx = d.item.wuxing;
      const tint = wx ? WX_TINT[wx] : SPIRIT_TINT;
      sfx.swap(wx);
      this.fx.burst(this.player.x, this.player.y, tint, 22);
      this.fx.ring(this.player.x, this.player.y, 130, tint, 320);
      this.fx.floatText(this.player.x, this.player.y - 120, d.item.name, '#' + tint.toString(16).padStart(6, '0'), 26, 50, 700);
    });
    eventBus.on(GameEvent.CONTINUE_RUN, () => {
      if (this.phase !== 'victory') return;
      this.beginRest(false);
    });
  }

  // ───────────────────────── 属性同步 ─────────────────────────

  /** 从装备重新计算战斗属性（装备 / 五行所属变化时调用） */
  private syncPlayerStats(): void {
    const ps = gameState.getPlayerState();
    const eq = ps.equipment;
    const pc = this.pc;

    pc.attributeSkills = getAllAttributeSkills(eq);
    pc.allWuxingLevels = getAllWuxingLevels(eq);
    pc.skillEffectLevels = calculateSkillEffectLevels(pc.attributeSkills, pc.allWuxingLevels);
    const lv = (id: AttributeSkillId) => pc.skillEffectLevels!.levels.get(id) ?? 0;

    // 炎威 / 坚壁 / 根基
    const yanwei = lv(AttributeSkillId.YANWEI);
    const jianbi = lv(AttributeSkillId.JIANBI);
    const genji = lv(AttributeSkillId.GENJI);
    pc.attack = getTotalAttack(eq) * STAT_SCALE * (1 + (yanwei ? getSkillValue(AttributeSkillId.YANWEI, yanwei) : 0) / 100);
    pc.defense = getTotalDefense(eq) * STAT_SCALE * (1 + (jianbi ? getSkillValue(AttributeSkillId.JIANBI, jianbi) : 0) / 100);
    pc.speed = getTotalSpeed(eq);

    const newMax = (ps.maxHp + (genji ? getSkillValue(AttributeSkillId.GENJI, genji) : 0)) * STAT_SCALE;
    if (newMax !== pc.maxHp) {
      const ratio = pc.maxHp > 0 ? pc.hp / pc.maxHp : 1;
      pc.maxHp = newMax;
      pc.hp = Math.max(1, Math.min(newMax, Math.round(newMax * ratio)));
      eventBus.emit(GameEvent.PLAYER_HP_CHANGE, pc.hp, pc.maxHp);
    }

    // 攻击五行看武器，防御五行看防具 —— 战斗中靠快速换装来生克
    const prevAtk = pc.attackWuxing?.wuxing;
    pc.attackWuxing = getAttackWuxing(eq);
    pc.defenseWuxing = getDefenseWuxing(eq);
    if (pc.attackWuxing?.wuxing !== prevAtk || !this.statsSynced) {
      this.statsSynced = true;
      this.startWuxingParticles(pc.attackWuxing?.wuxing);
    }

    const tint = pc.attackWuxing ? WX_TINT[pc.attackWuxing.wuxing] : SPIRIT_TINT;
    this.playerAura?.setTint(tint);
    this.rangeRing?.setTint(tint);

    this.combat?.setSkills(getEquippedAoeSkills());
  }

  // ───────────────────────── 主循环 ─────────────────────────

  update(_time: number, delta: number): void {
    if (this.phase === 'over' || !this.combat) return;
    // 灵囊开启时世界静止
    if (this.scene.isActive('InventoryScene')) {
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.physics.world.isPaused || this.physics.world.pause();
      return;
    }
    if (this.physics.world.isPaused && this.phase !== 'victory') this.physics.world.resume();
    if (this.phase === 'victory') return;

    delta = Math.min(delta, 50);
    this.backdrop.update(delta);

    const moving = this.movePlayer(delta);
    this.enemyAI.update(delta, this.player);
    this.combat.update(delta, moving);
    this.updatePlayerVisuals(moving);
    this.updateOrbs(delta);
    this.updateShaping(delta);
    this.updateRound(delta);
    this.updateIndicator();

    this.stateTick = (this.stateTick + 1) % 6;
    if (this.stateTick === 0) this.emitWorldState();
  }

  // ───────────────────────── 残魂操控 ─────────────────────────

  private movePlayer(delta: number): boolean {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    let vx = inputManager.moveX;
    let vy = inputManager.moveY;

    const k = this.keys;
    if (k) {
      const kx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      const ky = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
      if (kx !== 0 || ky !== 0) {
        const len = Math.sqrt(kx * kx + ky * ky);
        vx = kx / len; vy = ky / len;
      }
    }

    const mag = Math.sqrt(vx * vx + vy * vy);
    const moving = mag > 0.05;
    if (moving) {
      this.facingX = vx / mag;
      this.facingY = vy / mag;
    }

    // ---- 遁 ----
    this.dashCd = Math.max(0, this.dashCd - delta);
    if (inputManager.consumeDash() && this.dashCd <= 0 && this.dashTimer <= 0) {
      this.dashTimer = DASH_DURATION;
      this.dashCd = DASH_COOLDOWN;
      this.dashDirX = this.facingX;
      this.dashDirY = this.facingY;
      this.dashGhostTimer = 0;
      this.combat.setInvulnerable(DASH_INVULN);
      sfx.dash();
      const tint = this.pc.attackWuxing ? WX_TINT[this.pc.attackWuxing.wuxing] : SPIRIT_TINT;
      this.fx.ring(this.player.x, this.player.y, 90, tint, 260);
      this.fx.burst(this.player.x, this.player.y, tint, 10);
    }

    if (this.dashTimer > 0) {
      this.dashTimer -= delta;
      body.setVelocity(this.dashDirX * DASH_SPEED, this.dashDirY * DASH_SPEED);
      this.dashGhostTimer -= delta;
      if (this.dashGhostTimer <= 0) {
        this.dashGhostTimer = 28;
        this.fx.afterimage(this.player, this.pc.attackWuxing ? WX_TINT[this.pc.attackWuxing.wuxing] : SPIRIT_TINT);
      }
      this.player.setFlipX(this.dashDirX < 0);
      return true;
    }

    const speed = PLAYER_SPEED * this.combat.getPlayerSpeedMul();
    body.setVelocity(vx * speed, vy * speed);

    // 朝向：出手时看目标；移动时看移动方向；站定时看目标
    if (this.combat.isAttackAnimActive()) {
      const t = this.combat.getTarget();
      if (t) this.player.setFlipX(t.sprite.x < this.player.x);
    } else if (moving) {
      if (Math.abs(vx) > 0.15) this.player.setFlipX(vx < 0);
    } else {
      const t = this.combat.getTarget();
      if (t) this.player.setFlipX(t.sprite.x < this.player.x);
    }

    // 动画：跑动永远即时响应；出手动作只在站定时播放
    if (this.textures.exists(PLAYER_ATLAS)) {
      const cur = this.player.anims.currentAnim?.key;
      const runKey = `${PLAYER_ATLAS}_run`;
      const idleKey = `${PLAYER_ATLAS}_idle`;
      // 出手动作优先：播完之前不被跑动 / 待机覆盖（移动本身不受影响）
      if (this.combat.isAttackAnimActive()) {
        // 保持出手动作
      } else if (moving) {
        if (cur !== runKey) { this.player.play(runKey, true); this.player.anims.timeScale = 1.25; }
      } else {
        if (cur !== idleKey) { this.player.play(idleKey, true); this.player.anims.timeScale = 1; }
      }
    }
    return moving;
  }

  private updatePlayerVisuals(moving: boolean): void {
    const p = this.player;
    const footY = p.y + 307 * PLAYER_SCALE * 0.36;

    // 尾迹：移动时脚下散落灵光，遁时更浓；濒死时身上逸散血色残焰
    const tint = this.pc.attackWuxing ? WX_TINT[this.pc.attackWuxing.wuxing] : SPIRIT_TINT;
    this.trailTick = (this.trailTick + 1) % 3;
    if (this.dashTimer > 0) {
      this.fx.trail(p.x + (Math.random() - 0.5) * 30, p.y + (Math.random() - 0.5) * 60, tint, 4);
    } else if (moving && this.trailTick === 0) {
      this.fx.trail(p.x + (Math.random() - 0.5) * 24, footY - 8, tint, 1);
    }
    if (this.trailTick === 0 && this.pc.hp < this.pc.maxHp * 0.3) {
      this.fx.ember(p.x, p.y, 0xff4a4a, 1, 30);
    }
    p.setDepth(footY);
    this.playerShadow.setPosition(p.x, footY);
    this.playerAura.setPosition(p.x, footY - 10);
    this.rangeRing.setPosition(p.x, p.y);

    // 御：护体气罩。防反窗口内是金色亮环，之后转为防具五行色的格挡罩
    if (this.combat.isGuarding()) {
      const parry = this.combat.isParryWindow();
      const gc = parry ? 0xffe9a8 : (this.pc.defenseWuxing ? WX_TINT[this.pc.defenseWuxing.wuxing] : SPIRIT_TINT);
      this.guardRing.setVisible(true).setPosition(p.x, p.y).setTint(gc)
        .setScale(parry ? 0.78 : 0.66).setAlpha(parry ? 1 : 0.7);
      this.guardGlow.setVisible(true).setPosition(p.x, p.y).setTint(gc)
        .setScale(parry ? 0.95 : 0.75).setAlpha(parry ? 0.55 : 0.3);
      this.guardRing.rotation += 0.12;
    } else if (this.guardRing.visible) {
      this.guardRing.setVisible(false);
      this.guardGlow.setVisible(false);
    }

    // 无敌帧微微透明
    p.setAlpha(this.combat.isInvulnerable() && this.dashTimer <= 0 ? 0.7 : 1);

    // 锁定标记
    const t = this.combat.getTarget();
    if (t && !t.dying) {
      const ty = t.sprite.y + 307 * t.baseScale * 0.36;
      this.targetMark.setVisible(true).setPosition(t.sprite.x, ty)
        .setScale(t.baseScale * 1.7, t.baseScale * 0.7);
    } else {
      this.targetMark.setVisible(false);
    }
  }

  // ───────────────────────── 五行能量 ─────────────────────────

  /** 妖异溃散：变异意志消散，纯净的五行能量留在原地 */
  private dropLoot(x: number, y: number, wuxing: Wuxing, level: number, tier: EnemyTier): void {
    if (tier === 'boss') {
      for (let i = 0; i < 3; i++) this.createOrb(x, y, wuxing, level, true);
      return;
    }
    if (tier === 'elite') {
      this.createOrb(x, y, wuxing, level, true);
      this.createOrb(x, y, wuxing, level, false);
      return;
    }
    // 妖异数量少，每只约六成留下能量；连续 2 只没掉则下一只必掉
    if (Math.random() < 0.6 || this.dryKills >= 2) {
      this.dryKills = 0;
      this.createOrb(x, y, wuxing, level, false);
    } else {
      this.dryKills++;
    }
  }

  private createOrb(x: number, y: number, wuxing: Wuxing, level: number, highQuality: boolean): void {
    const tint = WX_TINT[wuxing];
    const glow = this.add.image(x, y, 'fx_glow').setTint(tint)
      .setBlendMode(Phaser.BlendModes.ADD).setScale(highQuality ? 0.5 : 0.34).setDepth(FX_DEPTH - 6);
    const core = this.add.image(x, y, 'fx_dot').setScale(highQuality ? 1.5 : 1.05).setDepth(FX_DEPTH - 5);
    this.tweens.add({
      targets: glow, scale: glow.scale * 1.3, alpha: 0.7,
      duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    const a = Math.random() * Math.PI * 2;
    const v = 160 + Math.random() * 160;
    this.orbs.push({
      glow, core, wuxing, level, highQuality,
      life: 45000, speed: 0,
      vx: Math.cos(a) * v, vy: Math.sin(a) * v,
    });
  }

  private destroyOrb(orb: Orb): void {
    this.tweens.killTweensOf(orb.glow);
    orb.glow.destroy();
    orb.core.destroy();
  }

  private updateOrbs(delta: number): void {
    const dt = delta / 1000;
    const px = this.player.x, py = this.player.y;
    // 调息阶段全图能量自动飞来
    const magnet = this.phase === 'rest' ? 99999 : ORB_MAGNET_RANGE;

    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.life -= delta;
      const dx = px - o.core.x, dy = py - o.core.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      if (dist < magnet) {
        // 被残魂牵引，越来越快
        o.speed = Math.min(1500, o.speed + 3200 * dt);
        o.core.x += (dx / dist) * o.speed * dt;
        o.core.y += (dy / dist) * o.speed * dt;
        this.fx.trail(o.core.x, o.core.y, WX_TINT[o.wuxing], 2);
      } else {
        o.speed = 0;
        // 落地弹开后减速停下
        o.core.x += o.vx * dt;
        o.core.y += o.vy * dt;
        o.vx *= 0.9; o.vy *= 0.9;
        // 静置时偶尔逸出一点灵光
        if (Math.random() < 0.05) this.fx.ember(o.core.x, o.core.y, WX_TINT[o.wuxing], 1, 14);
      }
      o.core.x = Phaser.Math.Clamp(o.core.x, 30, WORLD_SIZE - 30);
      o.core.y = Phaser.Math.Clamp(o.core.y, 30, WORLD_SIZE - 30);
      o.glow.setPosition(o.core.x, o.core.y);

      if (dist < 42) {
        this.absorbOrb(o);
        this.destroyOrb(o);
        this.orbs.splice(i, 1);
      } else if (o.life <= 0) {
        this.destroyOrb(o);
        this.orbs.splice(i, 1);
      }
    }
  }

  private absorbOrb(o: Orb): void {
    const tint = WX_TINT[o.wuxing];
    this.fx.burst(this.player.x, this.player.y - 10, tint, 10);
    this.fx.ember(this.player.x, this.player.y, tint, 6, 30);
    sfx.pickup(o.wuxing);
    if (gameState.isInventoryFull()) {
      // 灵囊已满：能量直接归元，化为己用
      this.combat.healPlayer(Math.ceil(this.pc.maxHp * (o.highQuality ? 0.06 : 0.02)));
      this.fx.floatText(this.player.x, this.player.y - 120, '灵囊已满 · 归元', '#d4a853', 22, 50, 900);
      return;
    }
    this.shapeQueue.push({ wuxing: o.wuxing, level: o.level, highQuality: o.highQuality });
    if (this.shapeQueue.length === 1) this.shapeTimer = SHAPE_DURATION;
  }

  // ───────────────────────── 塑型 ─────────────────────────

  /** 将吸纳的能量逐份凝练成器物；全程不影响移动与攻击 */
  private updateShaping(delta: number): void {
    const g = this.shapeGfx;
    g.clear();
    if (this.shapeQueue.length === 0) return;

    this.shapeTimer -= delta;
    const job = this.shapeQueue[0];
    const progress = 1 - Math.max(0, this.shapeTimer) / SHAPE_DURATION;
    const px = this.player.x, py = this.player.y - 118;
    const tint = WX_TINT[job.wuxing];

    g.lineStyle(6, 0x000000, 0.45);
    g.strokeCircle(px, py, 20);
    g.lineStyle(6, tint, 1);
    g.beginPath();
    g.arc(px, py, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress, false);
    g.strokePath();
    g.fillStyle(tint, 0.9);
    g.fillCircle(px, py, 8);
    // 凝练中的能量向核心汇聚
    if (Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2;
      this.fx.trail(px + Math.cos(a) * 26, py + Math.sin(a) * 26, tint, 1);
    }

    if (this.shapeTimer <= 0) {
      this.shapeQueue.shift();
      this.resolveShaping(job);
      if (this.shapeQueue.length > 0) this.shapeTimer = SHAPE_DURATION;
    }
  }

  private resolveShaping(job: ShapeJob): void {
    const px = this.player.x, py = this.player.y - 130;
    if (gameState.isInventoryFull()) {
      this.combat.healPlayer(Math.ceil(this.pc.maxHp * 0.02));
      return;
    }
    const { rel, rate } = shapingRate(this.pc.defenseWuxing?.wuxing, job.wuxing);
    // 魁首与核心的精纯能量更易成形
    const effective = Math.min(0.95, rate + this.shapingBonus + (job.highQuality ? 0.35 : 0));
    const relTag = rel === '无属' ? '' : `【${rel}】`;

    if (Math.random() < effective) {
      this.shapingBonus = 0;
      // 优先补齐该五行还没有的武器 / 防具，让五行快换尽早成型
      const want = !ownsGear(EquipmentType.WEAPON, job.wuxing) ? EquipmentType.WEAPON
        : !ownsGear(EquipmentType.ARMOR, job.wuxing) ? EquipmentType.ARMOR
        : null;
      let item = generateWuxingEquipment(job.wuxing, this.round, job.highQuality);
      for (let tries = 0; want && item.type !== want && tries < 12; tries++) {
        item = generateWuxingEquipment(job.wuxing, this.round, job.highQuality);
      }
      gameState.addToInventory(item);
      const worn = this.autoEquipIfSlotFree(item);
      sfx.shapeOk(job.wuxing);
      this.fx.floatText(px, py, `塑型成功${relTag} ${item.name}${worn ? ' · 已穿戴' : ''}`, RARITY_COLOR[item.rarity] ?? '#ffffff', 26, 90, 1300);
      this.fx.ring(this.player.x, this.player.y, 110, WX_TINT[job.wuxing], 380);
      this.fx.burst(this.player.x, py + 12, WX_TINT[job.wuxing], 16);
      this.fx.ember(this.player.x, this.player.y, WX_TINT[job.wuxing], 14, 50);
      eventBus.emit(GameEvent.INVENTORY_CHANGED);
    } else {
      this.shapingBonus = Math.min(0.70, this.shapingBonus + 0.05);
      gameState.addFragment();
      sfx.shapeFail();
      this.fx.burst(this.player.x, py + 12, 0x6e7681, 8);
      this.fx.floatText(px, py, `塑型失败${relTag} 碎片+1`, '#8b949e', 22, 70, 1000);
    }
    this.emitBuffs();
  }

  /**
   * 对应的装备位有空就直接穿上：灵器栏未满，或武器 / 防具位为空
   * @returns 是否已自动穿戴
   */
  private autoEquipIfSlotFree(item: Equipment): boolean {
    const idx = gameState.getInventory().indexOf(item);
    if (idx < 0) return false;
    const eq = gameState.getPlayerState().equipment;
    let ok = false;
    if (item.type === EquipmentType.TREASURE) {
      if (eq.treasures.length < MAX_TREASURES) ok = gameState.equipTreasure(idx);
    } else if (item.type === EquipmentType.WEAPON) {
      if (!eq.weapon) ok = gameState.equipWeapon(idx);
    } else if (item.type === EquipmentType.ARMOR) {
      if (!eq.armor) ok = gameState.equipArmor(idx);
    }
    if (ok) eventBus.emit(GameEvent.STATS_CHANGED);
    return ok;
  }

  private emitBuffs(): void {
    const buffs: { label: string; color: number; description?: string }[] = [];
    if (this.shapingBonus > 0) {
      buffs.push({
        label: `塑型补偿 +${Math.round(this.shapingBonus * 100)}%`,
        color: 0xd4a853,
        description: `塑型补偿：下次塑型成功率 +${Math.round(this.shapingBonus * 100)}%（成功后清零）`,
      });
    }
    eventBus.emit(GameEvent.BUFF_UPDATE, buffs);
  }

  // ───────────────────────── 轮次 ─────────────────────────

  private startRound(round: number): void {
    this.round = round;
    this.phase = 'fight';
    this.roundTimer = getRoundDuration(round) * 1000;
    this.roundKills = 0;
    this.boss = null;
    this.enemyAI.setRound(round);
    this.combat.resetRoundFlags();

    const bossRound = isBossRound(round);
    // 妖异少而强：每个阵眼只有两三只，逐只应对才有五行生克的余地
    const perZone = bossRound ? 2 : Math.min(5, 2 + Math.floor((round - 1) / 2));
    let quota = 0;
    ZONES.forEach((_z, i) => { quota += this.spawnSystem.spawnZonePack(i, perZone, round); });

    // 离残魂最远的阵眼
    const farthest = () => {
      let best = 0, bestD = -1;
      ZONES.forEach((z, i) => {
        const d = Phaser.Math.Distance.Between(z.x, z.y, this.player.x, this.player.y);
        if (d > bestD) { bestD = d; best = i; }
      });
      return best;
    };

    if (bossRound) sfx.ominous(); else sfx.roundStart();
    if (bossRound) {
      const zi = farthest();
      this.boss = this.spawnSystem.spawnBoss(zi, round);
      this.roundQuota = 1;
      eventBus.emit(GameEvent.BANNER, {
        title: `第 ${round} 轮 · 病变核心`,
        sub: `${WUXING_NAMES[ZONES[zi].wuxing]}之阵眼已彻底病变，击溃它`,
        color: 0xc084fc,
      });
    } else {
      const elites = round >= 6 ? 2 : round >= 2 ? 1 : 0;
      const used = new Set<number>();
      for (let k = 0; k < elites; k++) {
        let zi = Math.floor(Math.random() * 5);
        while (used.has(zi)) zi = (zi + 1) % 5;
        used.add(zi);
        this.spawnSystem.spawnElite(zi, round);
        quota++;
      }
      this.roundQuota = quota;
      eventBus.emit(GameEvent.BANNER, {
        title: `第 ${round} 轮`,
        sub: round === 1 ? '红圈蓄满的瞬间按「御」可防反' : elites > 0 ? '阵眼之中有魁首现身' : '净化妖异，稳固气脉',
        color: 0xd4a853,
      });
    }

    this.hunterTimer = 9000;
    this.emitWorldState();
  }

  private updateRound(delta: number): void {
    if (this.phase === 'rest') {
      this.restTimer -= delta;
      if (this.restTimer <= 0) this.startRound(this.round + 1);
      return;
    }
    if (this.phase !== 'fight') return;

    this.roundTimer -= delta;

    // 侵袭：游荡的妖异循着本源气息而来
    this.hunterTimer -= delta;
    if (this.hunterTimer <= 0) {
      this.hunterTimer = Math.max(7000, 11000 - this.round * 400);
      if (this.roundTimer > 6000) {
        const n = this.round >= 6 ? 3 : this.round >= 3 ? 2 : 1;
        this.spawnSystem.spawnHunters(this.player.x, this.player.y, n, this.round);
      }
    }

    if (this.roundTimer <= 0) this.roundTimeout();
  }

  private onEnemyDied(entity: WorldEntity): void {
    if (this.phase !== 'fight') return;
    this.roundKills++;

    if (entity.tier === 'boss') {
      this.onBossDefeated();
      return;
    }
    if (!this.boss && this.roundKills >= this.roundQuota) this.roundCleared();
  }

  /** 净化达标：气脉暂稳 */
  private roundCleared(): void {
    const heal = Math.ceil(this.pc.maxHp * 0.15);
    sfx.roundClear();
    this.combat.healPlayer(heal);
    this.fx.celebrate(this.player.x, this.player.y - 40, ZONES.map(z => WX_TINT[z.wuxing]));
    eventBus.emit(GameEvent.BANNER, {
      title: `第 ${this.round} 轮 · 气脉暂稳`,
      sub: `残余妖异消散，本源回复 ${heal} 点生命`,
      color: 0x4ade80,
    });
    this.beginRest(true);
  }

  /** 进入轮间调息：清场、能量自动汇聚 */
  private beginRest(dissolve: boolean): void {
    this.phase = 'rest';
    this.restTimer = REST_DURATION;
    if (this.physics.world.isPaused) this.physics.world.resume();
    if (dissolve) this.spawnSystem.dissolveAll();
    this.combat.clearProjectiles();
    this.emitWorldState();
  }

  /** 超时：五行失衡加剧，残余妖异狂暴并滞留到下一轮 */
  private roundTimeout(): void {
    sfx.ominous();
    const left = this.entityManager.getAlive();
    left.forEach(e => {
      if (e.enraged) return;
      e.enraged = true;
      e.combatant.attack += 1;
      this.combat.refreshTint(e);
    });
    if (this.boss && !this.boss.dying) {
      // 核心未破：时间重置，妖异继续涌来
      this.roundTimer = getRoundDuration(this.round) * 1000;
      eventBus.emit(GameEvent.BANNER, {
        title: '五行失衡加剧',
        sub: '病变核心仍在壮大，妖异陷入狂暴',
        color: 0xf85149,
      });
      this.fx.shake(0.01, 300);
      return;
    }
    this.fx.shake(0.01, 300);
    eventBus.emit(GameEvent.BANNER, {
      title: '五行失衡加剧',
      sub: left.length > 0 ? `${left.length} 只妖异陷入狂暴，滞留至下一轮` : '新的妖异正在滋生',
      color: 0xf85149,
    });
    this.startRound(this.round + 1);
  }

  private onBossDefeated(): void {
    this.boss = null;
    this.phase = 'victory';
    sfx.victory();
    this.fx.celebrate(this.player.x, this.player.y - 40, [...ZONES.map(z => WX_TINT[z.wuxing]), 0xffe9a8, 0xffffff]);
    this.spawnSystem.dissolveAll();
    this.combat.clearProjectiles();
    this.combat.healPlayer(Math.ceil(this.pc.maxHp * 0.5));
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.emitWorldState();
    // 留出核心溃散的演出时间
    this.time.delayedCall(1400, () => {
      eventBus.emit(GameEvent.VICTORY, { round: this.round, kills: this.combat.getKills() });
    });
  }

  private onGameOver(): void {
    if (this.phase === 'over') return;
    this.phase = 'over';
    sfx.gameOver();
    this.combat.stop();
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.physics.world.pause();
    const dieKey = `${PLAYER_ATLAS}_die`;
    if (this.anims.exists(dieKey)) this.player.play(dieKey, true);
    this.player.clearTint().setAlpha(1);
    this.fx.burst(this.player.x, this.player.y, SPIRIT_TINT, 50);
    this.fx.ring(this.player.x, this.player.y, 300, SPIRIT_TINT, 800);
    this.cameras.main.shake(300, 0.012);
    this.emitWorldState();
    (this.scene.get('HUDScene') as unknown as { showGameOverOverlay?: (r: number, k: number) => void })
      ?.showGameOverOverlay?.(this.round, this.combat.getKills());
  }

  // ───────────────────────── HUD 数据 / 指示 ─────────────────────────

  private emitWorldState(): void {
    this.zoneAlive = [0, 0, 0, 0, 0];
    const alive = this.entityManager.getAlive();
    for (let i = 0; i < alive.length; i++) {
      const z = alive[i].zoneIndex;
      if (z >= 0) this.zoneAlive[z]++;
    }
    ZONES.forEach((_z, i) => this.backdrop.setZoneActive(i, this.zoneAlive[i] > 0));

    const boss = this.boss && !this.boss.dying
      ? { name: this.boss.combatant.name, hp: this.boss.combatant.hp, maxHp: this.boss.combatant.maxHp, wuxing: this.boss.wuxing }
      : null;

    eventBus.emit(GameEvent.WORLD_STATE, {
      round: this.round,
      phase: this.phase,
      secsLeft: Math.max(0, Math.ceil((this.phase === 'rest' ? this.restTimer : this.roundTimer) / 1000)),
      kills: this.roundKills,
      quota: this.roundQuota,
      totalKills: this.combat.getKills(),
      enemies: alive.length,
      combo: this.combat.getCombo(),
      dashPct: this.dashCd / DASH_COOLDOWN,
      guardPct: this.combat.getGuardCdPct(),
      skillTimers: this.combat.getSkillTimers(),
      skillMax: this.combat.getSkillMaxTimers(),
      zones: this.zoneAlive,
      px: this.player.x / WORLD_SIZE,
      py: this.player.y / WORLD_SIZE,
      boss,
      bossZone: this.boss && !this.boss.dying ? this.boss.zoneIndex : -1,
      fragments: gameState.getFragmentCount(),
      bagFull: gameState.isInventoryFull(),
    });
  }

  /** 视野内没有妖异时，在残魂身边指出最近妖异 / 魁首 / 核心的方向 */
  private updateIndicator(): void {
    const g = this.indicator;
    g.clear();
    if (this.phase !== 'fight') return;
    const alive = this.entityManager.getAlive();
    if (alive.length === 0) return;

    const view = this.cameras.main.worldView;
    const px = this.player.x, py = this.player.y;
    let nearest: WorldEntity | null = null;
    let nearestD = Infinity;
    let anyVisible = false;
    const special: WorldEntity[] = [];

    for (let i = 0; i < alive.length; i++) {
      const e = alive[i];
      const vis = view.contains(e.sprite.x, e.sprite.y);
      if (vis) anyVisible = true;
      if (e.tier !== 'normal' && !vis) special.push(e);
      const d = Phaser.Math.Distance.Squared(px, py, e.sprite.x, e.sprite.y);
      if (d < nearestD) { nearestD = d; nearest = e; }
    }

    const arrow = (e: WorldEntity, radius: number, size: number, alpha: number) => {
      const a = Math.atan2(e.sprite.y - py, e.sprite.x - px);
      const cx = px + Math.cos(a) * radius, cy = py + Math.sin(a) * radius;
      g.fillStyle(WX_TINT[e.wuxing], alpha);
      g.fillTriangle(
        cx + Math.cos(a) * size, cy + Math.sin(a) * size,
        cx + Math.cos(a + 2.4) * size * 0.75, cy + Math.sin(a + 2.4) * size * 0.75,
        cx + Math.cos(a - 2.4) * size * 0.75, cy + Math.sin(a - 2.4) * size * 0.75,
      );
    };

    if (!anyVisible && nearest) arrow(nearest, 120, 20, 0.9);
    special.forEach(e => arrow(e, 160, e.tier === 'boss' ? 34 : 26, 1));
  }

  // ───────────────────────── 五行所属粒子 ─────────────────────────

  private startWuxingParticles(wuxing: Wuxing | undefined): void {
    if (this.wuxingEmitter) {
      this.wuxingEmitter.stop();
      this.wuxingEmitter.destroy();
      this.wuxingEmitter = undefined;
    }
    if (!wuxing) return;
    this.wuxingEmitter = this.add.particles(0, 0, 'fx_dot', {
      lifespan: 800,
      speed: { min: 20, max: 70 },
      scale: { start: 1.0, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: WX_TINT[wuxing],
      frequency: 70,
      blendMode: Phaser.BlendModes.ADD,
      follow: this.player,
      followOffset: { x: 0, y: 10 },
      angle: { min: 200, max: 340 },
    }).setDepth(FX_DEPTH - 8);
  }
}
