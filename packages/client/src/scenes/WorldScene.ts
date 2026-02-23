import Phaser from 'phaser';
import { LAYOUT } from '../config/uiConfig.js';
import { inputManager } from '../systems/input/InputManager.js';
import { eventBus, GameEvent } from '../core/EventBus.js';
import { gameState } from '../systems/GameStateManager.js';
import {
  Combatant,
  Equipment,
  getTotalAttack,
  getTotalDefense,
  getTotalSpeed,
  getAttackWuxing,
  getDefenseWuxing,
  getAllWuxingLevels,
  getAllAttributeSkills,
  AttributeSkillId,
  Wuxing,
  WUXING_COLORS,
  WUXING_NAMES,
  generateSimpleLoot,
} from '@xiyou/shared';
import { EntityManager } from '../systems/world/EntityManager.js';
import { SpawnSystem } from '../systems/world/SpawnSystem.js';
import { CombatSystem, AUTO_ATTACK_RANGE, ENEMY_ATTACK_RANGE } from '../systems/combat/CombatSystem.js';

/**
 * 世界尺寸：角色显示大小 ≈ 46px（307 × 0.15），地图 = 角色 × 50
 * 2300 × 2300
 */
const WORLD_W = 2300;
const WORLD_H = 2300;

/** 每轮游戏时间（秒）：第 N 轮 = 60 + (N-1) * 15 */
function getRoundDuration(round: number): number {
  return 60 + (round - 1) * 15;
}

/** 塑型基准时长（ms） */
const CHANNEL_DURATION = 2000;

/** 五行相生链：A 生 B */
const WX_GENERATES: Partial<Record<Wuxing, Wuxing>> = {
  [Wuxing.WOOD]:  Wuxing.FIRE,
  [Wuxing.FIRE]:  Wuxing.EARTH,
  [Wuxing.EARTH]: Wuxing.METAL,
  [Wuxing.METAL]: Wuxing.WATER,
  [Wuxing.WATER]: Wuxing.WOOD,
};
/** 五行相克链：A 克 B */
const WX_OVERCOMES: Partial<Record<Wuxing, Wuxing>> = {
  [Wuxing.WOOD]:  Wuxing.EARTH,
  [Wuxing.EARTH]: Wuxing.WATER,
  [Wuxing.WATER]: Wuxing.FIRE,
  [Wuxing.FIRE]:  Wuxing.METAL,
  [Wuxing.METAL]: Wuxing.WOOD,
};

/**
 * 从能量的角度计算五行关系及成功率
 * 生(50%) 助(40%) 泄(25%) 克(30%) 耗(35%)
 */
function calcWuxingResult(
  defWuxing: Wuxing | undefined,
  energyWuxing: Wuxing
): { rel: string; rate: number } {
  if (defWuxing === undefined) return { rel: '无属', rate: 0.25 };
  if (defWuxing === energyWuxing) return { rel: '助', rate: 0.40 };
  // 生：防御生能量（对能量有利）
  if (WX_GENERATES[defWuxing] === energyWuxing) return { rel: '生', rate: 0.50 };
  // 泄：能量生防御（能量被泄耗）
  if (WX_GENERATES[energyWuxing] === defWuxing) return { rel: '泄', rate: 0.25 };
  // 克：防御克能量
  if (WX_OVERCOMES[defWuxing] === energyWuxing) return { rel: '克', rate: 0.30 };
  // 耗：能量克防御（能量被耗）
  if (WX_OVERCOMES[energyWuxing] === defWuxing) return { rel: '耗', rate: 0.35 };
  return { rel: '无属', rate: 0.25 };
}

/** 玩家移动速度 */
const PLAYER_SPEED = 220;

/** 图集键 */
const PLAYER_ATLAS = 'player_spirit';

/** AOE 攻击技能 ID 集合 */
const AOE_SKILL_IDS = new Set([
  AttributeSkillId.LIEKONGZHAN,
  AttributeSkillId.HANCHAO,
  AttributeSkillId.JINGJI,
  AttributeSkillId.FENTIAN,
  AttributeSkillId.DILIE,
]);

interface LootDrop {
  graphics: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  x: number;
  y: number;
  wuxing: Wuxing;
  level: number;
  collected: boolean;
}

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerCombatant!: Combatant;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private _cdBroadcastTick: number = 0;
  private entityManager!: EntityManager;
  private spawnSystem!: SpawnSystem;
  private combatSystem!: CombatSystem;
  private activeSkillIds: AttributeSkillId[] = [];
  private currentRound: number = 1;
  /** 本轮剩余时间（ms） */
  private roundTimer: number = 0;
  /** 轮间过渡倒计时（ms），> 0 时进入过渡阶段 */
  private roundTransitionTimer: number = 0;
  /** 是否正在过渡（防止重复触发） */
  private roundTransitioning: boolean = false;
  /** 游戏是否已失败 */
  private isGameOver: boolean = false;
  /** 视口固定：剩余妖异数量文字 */
  private enemyCountText!: Phaser.GameObjects.Text;
  /** 视口固定：轮次计时器文字 */
  private roundTimerText!: Phaser.GameObjects.Text;
  /** 轮次结束横幅（过渡期显示，non-blocking） */
  private roundBannerObjects: Phaser.GameObjects.GameObject[] = [];
  private enemyIndicator!: Phaser.GameObjects.Graphics;
  private attackRangeIndicator!: Phaser.GameObjects.Graphics;
  private lootDrops: LootDrop[] = [];
  // 塑型系统
  private isChanneling: boolean = false;
  private channelingTimer: number = 0;
  private channelingTarget?: LootDrop;
  private channelingIndicator!: Phaser.GameObjects.Graphics;
  /** 塑型失败累计补偿概率：每次失败 +5%，成功后清零 */
  private channelingBonus: number = 0;
  /** 五行所属粒子发射器（跟随玩家） */
  private wuxingEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() {
    super({ key: 'WorldScene' });
  }

  preload(): void {
    if (!this.textures.exists(PLAYER_ATLAS)) {
      this.load.atlas(
        PLAYER_ATLAS,
        'assets/player/灵体残骸/atlas.png',
        'assets/player/灵体残骸/atlas.json'
      );
    }

    this.entityManager = new EntityManager();
    this.spawnSystem = new SpawnSystem(this, this.entityManager);
    this.spawnSystem.preloadAtlases();
  }

  create(): void {
    // 清理上一局残留的事件监听，防止多局游戏重复注册导致事件触发多次
    eventBus.clear();

    const { width, height } = this.cameras.main;
    const viewportH = Math.floor(height * LAYOUT.VIEWPORT_RATIO);

    // ---- 相机视口：已关闭（测试用） ----
    this.cameras.main.setVisible(false);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor('#000000');

    // 物理世界边界（必须单独设置，与相机边界无关）
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);

    // ---- 世界背景 ----
    this.createWorldBackground();

    // ---- 玩家 ----
    this.createPlayer();

    // ---- 相机跟随玩家 ----
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // 碰撞：玩家与敌人不重叠
    this.physics.add.collider(this.player, this.spawnSystem.getEnemyGroup());
    // 碰撞：敌人之间不重叠
    this.physics.add.collider(this.spawnSystem.getEnemyGroup(), this.spawnSystem.getEnemyGroup());

    // ---- 键盘备用 ----
    this.cursors = this.input.keyboard?.createCursorKeys();

    // ---- 创建玩家动画 ----
    this.createPlayerAnims();

    // ---- 怪物动画 + 生成 ----
    this.spawnSystem.createAnims();
    this.spawnSystem.spawnEnemies(WORLD_W, WORLD_H, this.currentRound);

    // ---- 战斗系统 ----
    this.combatSystem = new CombatSystem(this, this.entityManager, this.spawnSystem, this.activeSkillIds);

    // ---- 指示器（世界坐标，随相机移动） ----
    this.enemyIndicator = this.add.graphics().setDepth(15);
    this.attackRangeIndicator = this.add.graphics().setDepth(14);
    this.channelingIndicator = this.add.graphics().setDepth(16);

    // ---- 轮次计时器 ----
    this.roundTimer = getRoundDuration(this.currentRound) * 1000;
    this.roundTransitionTimer = 0;
    this.roundTransitioning = false;
    this.isGameOver = false;
    this.roundBannerObjects = [];

    // ---- 视口固定 UI：剩余妖异 + 计时器（用 setScrollFactor(0) 固定在视口） ----
    this.enemyCountText = this.add.text(width / 2, 20, '剩余妖异 --', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '14px',
      color: '#d4a853',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(100).setScrollFactor(0);

    this.roundTimerText = this.add.text(width * 0.85, 20, `第${this.currentRound}轮 ${getRoundDuration(this.currentRound)}s`, {
      fontFamily: 'monospace',
      fontSize: '13px',
      color: '#8b949e',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(100).setScrollFactor(0);

    eventBus.on(GameEvent.ENEMY_DIED, () => this.onEnemyDied());
    eventBus.on(GameEvent.LOOT_DROPPED, (data: unknown) => {
      const d = data as { x: number; y: number; wuxing: Wuxing; level: number };
      this.createLootDrop(d.x, d.y, d.wuxing, d.level);
    });
    eventBus.on(GameEvent.GAME_OVER, () => this.onGameOver());

    // 初始妖异数量（delayedCall 确保 HUDScene 已启动）
    this.time.delayedCall(100, () => {
      const count = this.entityManager.getAlive().length;
      this.enemyCountText?.setText(`剩余妖异 ${count}`);
      eventBus.emit(GameEvent.ENEMY_COUNT_UPDATE, count);
    });

    // ---- 启动 HUDScene（先停止确保 create() 重新执行，重注册所有事件监听） ----
    if (this.scene.isActive('HUDScene')) {
      this.scene.stop('HUDScene');
    }
    this.scene.launch('HUDScene');

    // 发送初始 HP
    eventBus.emit(
      GameEvent.PLAYER_HP_CHANGE,
      this.playerCombatant.hp,
      this.playerCombatant.maxHp
    );

    // 装备变化时同步 playerCombatant 战斗属性（保证技能/属性实时生效）
    eventBus.on(GameEvent.STATS_CHANGED, () => {
      const eq = gameState.getPlayerState().equipment;
      this.playerCombatant.attack = getTotalAttack(eq);
      this.playerCombatant.defense = getTotalDefense(eq);
      this.playerCombatant.speed = getTotalSpeed(eq);
      this.playerCombatant.attributeSkills = getAllAttributeSkills(eq);
      this.playerCombatant.allWuxingLevels = getAllWuxingLevels(eq);

      // maxHp 可能随装备变化（按比例调整当前 HP）
      const ps = gameState.getPlayerState();
      if (ps.maxHp !== this.playerCombatant.maxHp) {
        const ratio = this.playerCombatant.hp / this.playerCombatant.maxHp;
        this.playerCombatant.maxHp = ps.maxHp;
        this.playerCombatant.hp = Math.max(1, Math.round(ps.maxHp * ratio));
        eventBus.emit(GameEvent.PLAYER_HP_CHANGE, this.playerCombatant.hp, this.playerCombatant.maxHp);
      }

      // 若有五行所属选择，重新应用覆盖
      const chosen = gameState.getChosenWuxing();
      if (chosen) {
        this.playerCombatant.attackWuxing  = { wuxing: chosen, level: 1 };
        this.playerCombatant.defenseWuxing = { wuxing: chosen, level: 1 };
      } else {
        this.playerCombatant.attackWuxing  = getAttackWuxing(eq);
        this.playerCombatant.defenseWuxing = getDefenseWuxing(eq);
      }
    });

    // ---- 五行所属粒子 ----
    this.generateWuxingParticleTextures();
    // 监听五行所属变化
    eventBus.on(GameEvent.WUXING_CHOSEN, (wuxing: unknown) => {
      this.onWuxingChosen(wuxing as Wuxing | undefined);
    });
    // 如果已有选择，初始化粒子
    const initWuxing = gameState.getChosenWuxing();
    if (initWuxing) this.startWuxingParticles(initWuxing);
  }

  update(_time: number, delta: number): void {
    if (this.isGameOver) return;
    // 灵囊界面开启时暂停世界更新（防止玩家死亡/倒计时归零）
    if (this.scene.isActive('InventoryScene')) return;

    // ---- 轮次过渡倒计时（玩家可继续操作） ----
    if (this.roundTransitioning) {
      this.roundTransitionTimer -= delta;
      if (this.roundTransitionTimer <= 0) {
        this.startNextRound();
        return;
      }
      // 过渡中继续更新横幅倒计时文字
      this._cdBroadcastTick = (this._cdBroadcastTick + 1) % 5;
      if (this._cdBroadcastTick === 0) {
        const secs = Math.max(1, Math.ceil(this.roundTransitionTimer / 1000));
        const bannerCountdown = this.roundBannerObjects[2] as Phaser.GameObjects.Text | undefined;
        if (bannerCountdown?.active) bannerCountdown.setText(`${secs} 秒后进入下一轮...`);
        eventBus.emit(
          GameEvent.SKILL_CD_UPDATE,
          this.combatSystem.getPlayerSkillTimers(),
          this.combatSystem.getPlayerSkillMaxTimers()
        );
      }
      // 过渡期玩家仍可移动和战斗
      this.movePlayer(delta);
      this.updateEnemies(delta);
      this.combatSystem.update(delta, this.player, this.playerCombatant);
      this.updateEnemyIndicator();
      this.updateAttackRangeIndicator();
      this.updateLootDrops();
      this.updateChanneling(delta);
      return;
    }

    if (!this.roundTransitioning) {
      this.roundTimer -= delta;
    }

    // 广播计时器（每5帧一次）
    this._cdBroadcastTick = (this._cdBroadcastTick + 1) % 5;
    if (this._cdBroadcastTick === 0) {
      const secsLeft = Math.max(0, Math.ceil(this.roundTimer / 1000));
      const color = secsLeft <= 10 ? '#f85149' : secsLeft <= 30 ? '#eab308' : '#8b949e';
      this.roundTimerText?.setText(`第${this.currentRound}轮 ${secsLeft}s`).setColor(color);
      eventBus.emit(GameEvent.ROUND_TIMER_UPDATE, secsLeft, this.currentRound);
      eventBus.emit(
        GameEvent.SKILL_CD_UPDATE,
        this.combatSystem.getPlayerSkillTimers(),
        this.combatSystem.getPlayerSkillMaxTimers()
      );
    }

    // 超时 → 本轮结束
    if (this.roundTimer <= 0) {
      this.triggerRoundEnd();
      return;
    }

    this.movePlayer(delta);
    this.updateEnemies(delta);
    this.combatSystem.update(delta, this.player, this.playerCombatant);
    this.updateEnemyIndicator();
    this.updateAttackRangeIndicator();
    this.updateLootDrops();
    this.updateChanneling(delta);
  }

  // -----------------------------------------------

  private createWorldBackground(): void {
    const g = this.add.graphics();

    g.fillStyle(0x1a3a1a, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);

    g.lineStyle(1, 0x2d5c2d, 0.8);
    for (let x = 0; x <= WORLD_W; x += 120) {
      g.lineBetween(x, 0, x, WORLD_H);
    }
    for (let y = 0; y <= WORLD_H; y += 120) {
      g.lineBetween(0, y, WORLD_W, y);
    }

    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(0, WORLD_W);
      const y = Phaser.Math.Between(0, WORLD_H);
      const r = Phaser.Math.Between(40, 150);
      g.fillStyle(0x274d27, 0.6);
      g.fillCircle(x, y, r);
    }

    g.lineStyle(8, 0xd4a853, 0.9);
    g.strokeRect(0, 0, WORLD_W, WORLD_H);
    g.lineStyle(3, 0xf0e6d3, 0.4);
    g.strokeRect(10, 10, WORLD_W - 20, WORLD_H - 20);
  }

  private createPlayer(): void {
    const startX = WORLD_W / 2;
    const startY = WORLD_H / 2;

    const playerState = gameState.getPlayerState();
    const equipment = playerState.equipment;

    const chosenWuxing = gameState.getChosenWuxing();
    const wuxingOverride = chosenWuxing ? { wuxing: chosenWuxing, level: 1 } : null;
    this.playerCombatant = {
      id: 'player',
      name: '残魂',
      hp: playerState.hp,
      maxHp: playerState.maxHp,
      attack: getTotalAttack(equipment),
      defense: getTotalDefense(equipment),
      speed: getTotalSpeed(equipment),
      isPlayer: true,
      attackWuxing: wuxingOverride ?? getAttackWuxing(equipment),
      defenseWuxing: wuxingOverride ?? getDefenseWuxing(equipment),
      allWuxingLevels: getAllWuxingLevels(equipment),
      attributeSkills: getAllAttributeSkills(equipment),
      frozen: false,
    };

    const allSkills = getAllAttributeSkills(equipment);
    this.activeSkillIds = allSkills.filter(id => AOE_SKILL_IDS.has(id));

    if (this.textures.exists(PLAYER_ATLAS)) {
      this.player = this.physics.add.sprite(startX, startY, PLAYER_ATLAS, 'character_idle_0');
    } else {
      this.player = this.physics.add.sprite(startX, startY, '__DEFAULT');
    }

    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.player.setScale(0.15);

    if (this.player.body) {
      (this.player.body as Phaser.Physics.Arcade.Body).setSize(200, 260).setOffset(54, 24);
    }
  }

  private createPlayerAnims(): void {
    if (!this.textures.exists(PLAYER_ATLAS)) return;
    const types = ['idle', 'run', 'atk', 'hurt', 'magic', 'die'];
    types.forEach(anim => {
      const key = `${PLAYER_ATLAS}_${anim}`;
      if (this.anims.exists(key)) return;
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = 0; i < 6; i++) {
        const f = `character_${anim}_${i}`;
        if (this.textures.get(PLAYER_ATLAS).has(f)) {
          frames.push({ key: PLAYER_ATLAS, frame: f });
        }
      }
      if (frames.length > 0) {
        this.anims.create({
          key,
          frames,
          frameRate: anim === 'idle' ? 8 : 12,
          repeat: anim === 'idle' ? -1 : 0,
        });
      }
    });
    this.player.play(`${PLAYER_ATLAS}_idle`);
  }

  private movePlayer(_delta: number): void {
    let vx = inputManager.moveX;
    let vy = inputManager.moveY;

    if (this.cursors) {
      if (this.cursors.left?.isDown) vx = -1;
      else if (this.cursors.right?.isDown) vx = 1;
      if (this.cursors.up?.isDown) vy = -1;
      else if (this.cursors.down?.isDown) vy = 1;
    }

    const moving = Math.abs(vx) > 0.05 || Math.abs(vy) > 0.05;

    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(
      vx * PLAYER_SPEED,
      vy * PLAYER_SPEED
    );

    if (vx < 0) this.player.setFlipX(true);
    else if (vx > 0) this.player.setFlipX(false);

    // 攻击动画优先级最高，播放期间不允许被移动动画覆盖
    if (this.textures.exists(PLAYER_ATLAS) && !this.combatSystem.isAttackAnimActive()) {
      const currentAnim = this.player.anims.currentAnim?.key;
      const runKey = `${PLAYER_ATLAS}_run`;
      const idleKey = `${PLAYER_ATLAS}_idle`;
      const magicKey = `${PLAYER_ATLAS}_magic`;
      if (moving) {
        if (currentAnim !== runKey) this.player.play(runKey, true);
      } else if (this.isChanneling) {
        if (currentAnim !== magicKey) this.player.play(magicKey, true);
      } else {
        if (currentAnim !== idleKey) this.player.play(idleKey, true);
      }
    }
  }

  private updateEnemies(delta: number): void {
    const playerX = this.player.x;
    const playerY = this.player.y;
    const DETECT_RANGE = 300;
    // 妖异进入 attack 状态的范围（略大于实际攻击判定，让妖异缓慢接近）
    const ATTACK_STATE_RANGE = ENEMY_ATTACK_RANGE + 60; // 140
    const PATROL_SPEED = 60;
    const CHASE_SPEED = 110;

    this.entityManager.getAlive().forEach(entity => {
      const { sprite } = entity;
      const dist = Phaser.Math.Distance.Between(sprite.x, sprite.y, playerX, playerY);

      if (dist < ATTACK_STATE_RANGE) {
        entity.state = 'attack';
      } else if (dist < DETECT_RANGE) {
        entity.state = 'chase';
      } else {
        entity.state = 'patrol';
      }

      const body = sprite.body as Phaser.Physics.Arcade.Body;

      if (entity.state === 'chase' || entity.state === 'attack') {
        // 攻击动画播放中：停止移动
        if (entity.attackPhase === 'attacking') {
          body.setVelocity(0, 0);
        } else {
          const angle = Math.atan2(playerY - sprite.y, playerX - sprite.x);
          // 减速状态：移速降低 50%
          const isSlowed = this.combatSystem?.isEnemySlowed(entity.combatant.id) ?? false;
          const baseSpeed = entity.state === 'attack' ? CHASE_SPEED * 0.3 : CHASE_SPEED;
          const speed = isSlowed ? baseSpeed * 0.5 : baseSpeed;
          body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        }
        sprite.setFlipX(playerX < sprite.x);
      } else {
        entity.patrolTimer -= delta;
        if (entity.patrolTimer <= 0) {
          entity.patrolTimer = Phaser.Math.Between(2000, 4000);
          const dx = sprite.x - entity.patrolCenterX;
          const dy = sprite.y - entity.patrolCenterY;
          const distFromCenter = Math.sqrt(dx * dx + dy * dy);
          if (distFromCenter > 200) {
            const backAngle = Math.atan2(entity.patrolCenterY - sprite.y, entity.patrolCenterX - sprite.x);
            body.setVelocity(Math.cos(backAngle) * PATROL_SPEED, Math.sin(backAngle) * PATROL_SPEED);
          } else {
            const angle = Math.random() * Math.PI * 2;
            body.setVelocity(Math.cos(angle) * PATROL_SPEED, Math.sin(angle) * PATROL_SPEED);
          }
        }
      }

      if (entity.atlasKey) {
        const isMoving = Math.abs(body.velocity.x) > 5 || Math.abs(body.velocity.y) > 5;
        const runKey  = `${entity.atlasKey}_run`;
        const idleKey = `${entity.atlasKey}_idle`;
        const atkKey  = `${entity.atlasKey}_atk`;
        const hurtKey = `${entity.atlasKey}_hurt`;
        const cur = sprite.anims.currentAnim?.key;
        // 攻击/受击动画优先：播放中不允许被移动动画覆盖
        const isBusy = sprite.anims.isPlaying && (cur === atkKey || cur === hurtKey);
        if (!isBusy) {
          if (isMoving && cur !== runKey && this.anims.exists(runKey)) sprite.play(runKey, true);
          else if (!isMoving && cur !== idleKey && this.anims.exists(idleKey)) sprite.play(idleKey, true);
        }
      }

      if (entity.hpBar && entity.hpBarBg) {
        entity.hpBar.setPosition(sprite.x, sprite.y);
        entity.hpBarBg.setPosition(sprite.x, sprite.y);
      }
    });
  }

  // ---- 攻击范围指示器（在玩家周围显示可攻击圆圈） ----
  private updateAttackRangeIndicator(): void {
    const g = this.attackRangeIndicator;
    g.clear();

    const alive = this.entityManager.getAlive();
    if (alive.length === 0) return;

    // 有敌人在攻击范围内才显示
    const hasInRange = alive.some(e =>
      Phaser.Math.Distance.Between(this.player.x, this.player.y, e.sprite.x, e.sprite.y) < AUTO_ATTACK_RANGE
    );
    if (!hasInRange) return;

    // 细蓝白圆圈标注攻击范围
    g.lineStyle(1.5, 0xadd8e6, 0.5);
    g.strokeCircle(this.player.x, this.player.y, AUTO_ATTACK_RANGE);
  }

  // ---- 最近妖异方向指示器 ----
  private updateEnemyIndicator(): void {
    const g = this.enemyIndicator;
    g.clear();

    const alive = this.entityManager.getAlive();
    if (alive.length === 0) return;

    // 画面内有妖异时隐藏指示器
    const camView = this.cameras.main.worldView;
    const anyVisible = alive.some(e => camView.contains(e.sprite.x, e.sprite.y));
    if (anyVisible) return;

    // 找最近妖异
    let nearest = alive[0];
    let minDist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y, nearest.sprite.x, nearest.sprite.y
    );
    for (let i = 1; i < alive.length; i++) {
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, alive[i].sprite.x, alive[i].sprite.y
      );
      if (d < minDist) { minDist = d; nearest = alive[i]; }
    }

    const angle = Math.atan2(
      nearest.sprite.y - this.player.y,
      nearest.sprite.x - this.player.x
    );

    const R = 36;
    const cx = this.player.x + Math.cos(angle) * R;
    const cy = this.player.y + Math.sin(angle) * R;

    const arrowLen = 12;
    const arrowW = 6;
    const tipX = cx + Math.cos(angle) * arrowLen;
    const tipY = cy + Math.sin(angle) * arrowLen;
    const leftX = cx + Math.cos(angle + Math.PI * 0.7) * arrowW;
    const leftY = cy + Math.sin(angle + Math.PI * 0.7) * arrowW;
    const rightX = cx + Math.cos(angle - Math.PI * 0.7) * arrowW;
    const rightY = cy + Math.sin(angle - Math.PI * 0.7) * arrowW;

    g.fillStyle(0xf85149, 0.9);
    g.fillTriangle(tipX, tipY, leftX, leftY, rightX, rightY);

    g.lineStyle(1.5, 0xf85149, 0.4);
    g.strokeCircle(this.player.x, this.player.y, R);
  }

  // ---- 五行能量掉落 ----
  private createLootDrop(x: number, y: number, wuxing: Wuxing, level: number): void {
    const color = WUXING_COLORS[wuxing];
    const wuxingName = WUXING_NAMES[wuxing] ?? '元';

    const g = this.add.graphics().setDepth(8);
    g.fillStyle(color, 0.85);
    g.fillCircle(0, 0, 10);
    g.lineStyle(2, 0xffffff, 0.7);
    g.strokeCircle(0, 0, 10);
    g.setPosition(x, y);

    this.tweens.add({
      targets: g,
      scaleX: 1.35,
      scaleY: 1.35,
      alpha: 0.65,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const label = this.add.text(x, y - 18, `${wuxingName}能 Lv${level}`, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '10px',
      color: '#' + color.toString(16).padStart(6, '0'),
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(9);

    this.lootDrops.push({ graphics: g, label, x, y, wuxing, level, collected: false });
  }

  private updateLootDrops(): void {
    // 背包已满时不触发塑型
    if (gameState.isInventoryFull()) return;
    if (this.isChanneling) return;

    // 移动中不触发塑型（停止后才重新开始）
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (Math.abs(body.velocity.x) > 10 || Math.abs(body.velocity.y) > 10) return;

    // 收集范围内所有可塑型的能量，按距离从近到远排序
    const candidates = this.lootDrops
      .filter(d => !d.collected)
      .map(d => ({
        drop: d,
        dist: Phaser.Math.Distance.Between(this.player.x, this.player.y, d.x, d.y),
      }))
      .filter(({ dist }) => dist < AUTO_ATTACK_RANGE)
      .sort((a, b) => a.dist - b.dist);

    for (const { drop } of candidates) {
      // 能量附近有妖异时跳过
      const nearbyEnemy = this.entityManager.getAlive().some(e =>
        Phaser.Math.Distance.Between(drop.x, drop.y, e.sprite.x, e.sprite.y) < 150
      );
      if (nearbyEnemy) continue;

      const idx = this.lootDrops.indexOf(drop);
      if (idx !== -1) this.lootDrops.splice(idx, 1);
      this.startChanneling(drop);
      break;
    }
  }

  private startChanneling(drop: LootDrop): void {
    this.isChanneling = true;
    this.channelingTimer = CHANNEL_DURATION;
    this.channelingTarget = drop;
    this.combatSystem.setPlayerChanneling(true);

    // 飘字：仅显示五行关系字符（生/助/泄/克/耗），无属性时不显示
    const defWuxing = this.playerCombatant.defenseWuxing?.wuxing;
    const { rel, rate } = calcWuxingResult(defWuxing, drop.wuxing);
    if (rel !== '无属') {
      const relColor = rate >= 0.45 ? 0x3fb950 : rate >= 0.38 ? 0xd4a853 : rate >= 0.32 ? 0xeab308 : 0xf85149;
      const relColorHex = '#' + relColor.toString(16).padStart(6, '0');
      const floatTxt = this.add.text(drop.x, drop.y - 20, rel, {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: '22px',
        color: relColorHex,
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(30);
      this.tweens.add({
        targets: floatTxt,
        y: drop.y - 60,
        alpha: 0,
        duration: 900,
        ease: 'Power2',
        onComplete: () => floatTxt.destroy(),
      });
    }
  }

  private updateChanneling(delta: number): void {
    if (!this.isChanneling || !this.channelingTarget) return;

    // 移动打断塑型
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (Math.abs(body.velocity.x) > 10 || Math.abs(body.velocity.y) > 10) {
      this.cancelChanneling();
      return;
    }

    this.channelingTimer -= delta;

    // 绘制进度弧（围绕器物，金色圆弧，顺时针填充）
    const g = this.channelingIndicator;
    g.clear();
    const progress = 1 - Math.max(0, this.channelingTimer) / CHANNEL_DURATION;
    if (progress > 0) {
      const tx = this.channelingTarget.x;
      const ty = this.channelingTarget.y;
      const endAngle = -Math.PI / 2 + Math.PI * 2 * progress;
      // 背景圆（灰色）
      g.lineStyle(4, 0x30363d, 0.6);
      g.strokeCircle(tx, ty, 20);
      // 进度弧（金色）
      g.lineStyle(4, 0xd4a853, 1.0);
      g.beginPath();
      g.arc(tx, ty, 20, -Math.PI / 2, endAngle, false, 0.02);
      g.strokePath();
    }

    if (this.channelingTimer <= 0) {
      this.resolveChanneling();
    }
  }

  private cancelChanneling(): void {
    if (!this.isChanneling || !this.channelingTarget) return;
    this.isChanneling = false;
    this.channelingIndicator.clear();
    this.combatSystem.setPlayerChanneling(false);
    // 将能量放回可拾取列表，停下后可重新触发
    const drop = this.channelingTarget;
    this.channelingTarget = undefined;
    this.lootDrops.push(drop);
  }

  private resolveChanneling(): void {
    this.isChanneling = false;
    this.channelingIndicator.clear();
    this.combatSystem.setPlayerChanneling(false);

    const target = this.channelingTarget;
    this.channelingTarget = undefined;
    if (!target) return;

    target.graphics.destroy();
    target.label.destroy();

    // 五行关系决定成功率（加上累计补偿）
    const defWuxing = this.playerCombatant.defenseWuxing?.wuxing;
    const { rel, rate } = calcWuxingResult(defWuxing, target.wuxing);
    const effectiveRate = Math.min(0.95, rate + this.channelingBonus);

    if (Math.random() < effectiveRate) {
      this.channelingBonus = 0;
      const items = generateSimpleLoot('normal', 1, 1.0);
      items.forEach(eq => gameState.addToInventory(eq as Equipment));
      this.showLootText(target.x, target.y, `塑型成功【${rel}】`, 0x3fb950);
    } else {
      this.channelingBonus = Math.min(0.70, this.channelingBonus + 0.05);
      this.showLootText(target.x, target.y, `塑型失败【${rel}】 补偿+5%`, 0xf85149);
    }
    this.emitBuffs();
  }

  /** 向 HUDScene 广播当前 buff 列表 */
  private emitBuffs(): void {
    const buffs: { label: string; color: number }[] = [];
    if (this.channelingBonus > 0) {
      buffs.push({
        label: `塑型补偿 +${Math.round(this.channelingBonus * 100)}%`,
        color: 0xd4a853,
      });
    }
    eventBus.emit(GameEvent.BUFF_UPDATE, buffs);
  }

  private clearLootDrops(): void {
    if (this.isChanneling) {
      this.isChanneling = false;
      this.channelingIndicator.clear();
      this.channelingTarget?.graphics.destroy();
      this.channelingTarget?.label.destroy();
      this.channelingTarget = undefined;
      this.combatSystem?.setPlayerChanneling(false);
    }
    this.lootDrops.forEach(drop => {
      drop.graphics.destroy();
      drop.label.destroy();
    });
    this.lootDrops = [];
  }

  private showLootText(x: number, y: number, msg: string, color: number): void {
    const colorHex = '#' + color.toString(16).padStart(6, '0');
    const text = this.add.text(x, y - 20, msg, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '12px',
      color: colorHex,
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(30);
    this.tweens.add({
      targets: text,
      y: y - 50,
      alpha: 0,
      duration: 1200,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  /** 妖异死亡时：更新剩余数量，若全部消灭则触发轮次结束 */
  private onEnemyDied(): void {
    if (this.isGameOver) return;
    const remaining = this.entityManager.getAlive().length;
    this.enemyCountText?.setText(`剩余妖异 ${remaining}`);
    eventBus.emit(GameEvent.ENEMY_COUNT_UPDATE, remaining);

    if (remaining === 0 && !this.roundTransitioning) {
      this.triggerRoundEnd();
    }
  }

  /** 触发本轮结束（超时或全灭均调用此方法） */
  private triggerRoundEnd(): void {
    if (this.roundTransitioning || this.isGameOver) return;
    this.roundTransitioning = true;
    this.roundTransitionTimer = 10000; // 10 秒过渡

    // 非阻塞式顶部横幅（setScrollFactor(0) 固定在视口，不遮挡中央视野）
    const { width } = this.cameras.main;
    const bannerW = Math.min(width * 0.72, 320);
    const bannerH = 44;
    const bannerX = (width - bannerW) / 2;
    const bannerY = 44;

    const bg = this.add.graphics().setDepth(200).setScrollFactor(0);
    bg.fillStyle(0x0d1117, 0.88);
    bg.fillRoundedRect(bannerX, bannerY, bannerW, bannerH, 8);
    bg.lineStyle(1.5, 0xd4a853, 0.7);
    bg.strokeRoundedRect(bannerX, bannerY, bannerW, bannerH, 8);

    const titleTxt = this.add.text(width / 2, bannerY + 8, `第 ${this.currentRound} 轮结束`, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '14px',
      color: '#d4a853',
    }).setOrigin(0.5, 0).setDepth(201).setScrollFactor(0);

    const countdownTxt = this.add.text(width / 2, bannerY + 26, '10 秒后进入下一轮...', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '11px',
      color: '#8b949e',
    }).setOrigin(0.5, 0).setDepth(201).setScrollFactor(0);

    this.roundBannerObjects = [bg, titleTxt, countdownTxt];
  }

  /** 过渡完成后，清场并开始下一轮 */
  private startNextRound(): void {
    this.currentRound++;
    this.roundTimer = getRoundDuration(this.currentRound) * 1000;
    this.roundTransitioning = false;

    // 销毁横幅
    this.roundBannerObjects.forEach(o => (o as Phaser.GameObjects.GameObject).destroy());
    this.roundBannerObjects = [];

    // 清除残余怪物和能量掉落，生成新一波
    this.spawnSystem.clearAll();
    this.clearLootDrops();
    this.spawnSystem.spawnEnemies(WORLD_W, WORLD_H, this.currentRound);

    const newCount = this.entityManager.getAlive().length;
    this.enemyCountText?.setText(`剩余妖异 ${newCount}`);
    const dur = getRoundDuration(this.currentRound);
    this.roundTimerText?.setText(`第${this.currentRound}轮 ${dur}s`).setColor('#8b949e');
    eventBus.emit(GameEvent.ENEMY_COUNT_UPDATE, newCount);
  }

  /** 游戏失败：停止逻辑，并直接触发 HUDScene 显示失败覆盖 */
  private onGameOver(): void {
    if (this.isGameOver) return;
    this.isGameOver = true;
    // 直接调用 HUDScene（双路触发，防止 eventBus 时序问题）
    if (this.scene.isActive('HUDScene')) {
      (this.scene.get('HUDScene') as any)?.showGameOverOverlay?.();
    }
  }

  // ---- 五行所属系统 ----

  /** 为每个五行预先生成粒子纹理 */
  private generateWuxingParticleTextures(): void {
    Object.values(Wuxing).forEach(wx => {
      const key = `wx_particle_${wx}`;
      if (this.textures.exists(key)) return;
      const color = WUXING_COLORS[wx as Wuxing];
      const g = this.add.graphics();
      g.fillStyle(color, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture(key, 8, 8);
      g.setVisible(false);
      g.destroy();
    });
  }

  /** 五行所属改变时触发：更新战斗属性、粒子特效 */
  private onWuxingChosen(wuxing: Wuxing | undefined): void {
    // 更新战斗属性
    if (wuxing) {
      this.playerCombatant.attackWuxing = { wuxing, level: 1 };
      this.playerCombatant.defenseWuxing = { wuxing, level: 1 };
      this.triggerWuxingBurst(wuxing);
    } else {
      this.playerCombatant.attackWuxing = null;
      this.playerCombatant.defenseWuxing = null;
    }
    this.startWuxingParticles(wuxing);
  }

  /** 爆发粒子特效（五行变化瞬间） */
  private triggerWuxingBurst(wuxing: Wuxing): void {
    const key = `wx_particle_${wuxing}`;
    if (!this.textures.exists(key)) return;
    const burst = this.add.particles(this.player.x, this.player.y, key, {
      lifespan: 900,
      speed: { min: 60, max: 200 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 1, end: 0 },
      quantity: 1,
      emitting: false,
    }).setDepth(20);
    burst.explode(50, this.player.x, this.player.y);
    this.time.delayedCall(1200, () => burst.destroy());
  }

  /** 启动（或停止）跟随玩家的持续粒子特效 */
  private startWuxingParticles(wuxing: Wuxing | undefined): void {
    // 停止旧的发射器
    if (this.wuxingEmitter) {
      this.wuxingEmitter.stop();
      this.wuxingEmitter.destroy();
      this.wuxingEmitter = undefined;
    }
    if (!wuxing) return;

    const key = `wx_particle_${wuxing}`;
    if (!this.textures.exists(key)) return;

    this.wuxingEmitter = this.add.particles(0, 0, key, {
      lifespan: 700,
      speed: { min: 15, max: 50 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.8, end: 0 },
      quantity: 1,
      frequency: 120,
      follow: this.player,
      followOffset: { x: 0, y: -8 },
      angle: { min: 0, max: 360 },
    }).setDepth(11);
  }

  /** WorldScene 停止时（死亡/返回菜单）清理子场景和事件 */
  shutdown(): void {
    this.scene.stop('HUDScene');
    this.scene.stop('InventoryScene');
    eventBus.clear();
  }

  /** 供 CombatSystem 调用 */
  getPlayer(): Phaser.Physics.Arcade.Sprite { return this.player; }
  getPlayerCombatant(): Combatant { return this.playerCombatant; }
  getEntityManager(): EntityManager { return this.entityManager; }
  getSpawnSystem(): SpawnSystem { return this.spawnSystem; }
  getActiveSkillIds(): AttributeSkillId[] { return this.activeSkillIds; }
}
