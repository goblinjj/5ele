import Phaser from 'phaser';
import { LAYOUT } from '../config/uiConfig.js';
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
  AttributeSkillId,
} from '@xiyou/shared';
import { EntityManager } from '../systems/world/EntityManager.js';
import { SpawnSystem } from '../systems/world/SpawnSystem.js';
import { CombatSystem } from '../systems/combat/CombatSystem.js';

/** 世界尺寸（视口的5倍，Brotato风格大地图） */
const WORLD_W = 3600;
const WORLD_H = 4680;

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

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerCombatant!: Combatant;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private _cdBroadcastTick: number = 0;
  private entityManager!: EntityManager;
  private spawnSystem!: SpawnSystem;
  private combatSystem!: CombatSystem;
  private activeSkillIds: AttributeSkillId[] = [];

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

    // 初始化实体管理器（在preload中创建以便preloadAtlases可以加载图集）
    this.entityManager = new EntityManager();
    this.spawnSystem = new SpawnSystem(this, this.entityManager);
    this.spawnSystem.preloadAtlases();
  }

  create(): void {
    const { width, height } = this.cameras.main;
    const viewportH = Math.floor(height * LAYOUT.VIEWPORT_RATIO);

    // ---- 相机视口：只占上 60% ----
    this.cameras.main.setViewport(0, 0, width, viewportH);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

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
    this.spawnSystem.spawnEnemies(WORLD_W, WORLD_H, 1);

    // ---- 战斗系统 ----
    this.combatSystem = new CombatSystem(this, this.entityManager, this.spawnSystem, this.activeSkillIds);

    // ---- 启动 HUDScene ----
    this.scene.launch('HUDScene');

    // 发送初始 HP
    eventBus.emit(
      GameEvent.PLAYER_HP_CHANGE,
      this.playerCombatant.hp,
      this.playerCombatant.maxHp
    );
  }

  update(_time: number, delta: number): void {
    this.movePlayer(delta);
    this.updateEnemies(delta);
    this.combatSystem.update(delta, this.player, this.playerCombatant);

    // 广播技能 CD（每5帧一次）
    this._cdBroadcastTick = (this._cdBroadcastTick + 1) % 5;
    if (this._cdBroadcastTick === 0) {
      eventBus.emit(
        GameEvent.SKILL_CD_UPDATE,
        this.combatSystem.getPlayerSkillTimers(),
        this.combatSystem.getPlayerSkillMaxTimers()
      );
    }
  }

  // -----------------------------------------------

  private createWorldBackground(): void {
    const g = this.add.graphics();

    // 底色
    g.fillStyle(0x0d1a0d, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);

    // 网格纹理（气脉感）
    g.lineStyle(1, 0x1a2e1a, 0.6);
    for (let x = 0; x <= WORLD_W; x += 120) {
      g.lineBetween(x, 0, x, WORLD_H);
    }
    for (let y = 0; y <= WORLD_H; y += 120) {
      g.lineBetween(0, y, WORLD_W, y);
    }

    // 散布气穴光点
    for (let i = 0; i < 40; i++) {
      const x = Phaser.Math.Between(0, WORLD_W);
      const y = Phaser.Math.Between(0, WORLD_H);
      const r = Phaser.Math.Between(30, 100);
      g.fillStyle(0x1a3a1a, 0.5);
      g.fillCircle(x, y, r);
    }
  }

  private createPlayer(): void {
    const startX = WORLD_W / 2;
    const startY = WORLD_H / 2;

    const playerState = gameState.getPlayerState();

    const equipment = playerState.equipment;

    // 构建 Combatant 数据
    this.playerCombatant = {
      id: 'player',
      name: '残魂',
      hp: playerState.hp,
      maxHp: playerState.maxHp,
      attack: getTotalAttack(equipment),
      defense: getTotalDefense(equipment),
      speed: getTotalSpeed(equipment),
      isPlayer: true,
      attackWuxing: getAttackWuxing(equipment),
      defenseWuxing: getDefenseWuxing(equipment),
      allWuxingLevels: getAllWuxingLevels(equipment),
      attributeSkills: getAllAttributeSkills(equipment),
      frozen: false,
    };

    // AOE_ATTACK 类技能作为主动技能（最多2个）
    const allSkills = getAllAttributeSkills(equipment);
    this.activeSkillIds = allSkills.filter(id => AOE_SKILL_IDS.has(id)).slice(0, 2);

    if (this.textures.exists(PLAYER_ATLAS)) {
      this.player = this.physics.add.sprite(startX, startY, PLAYER_ATLAS, 'character_idle_0');
    } else {
      // 占位（无贴图时用默认精灵）
      this.player = this.physics.add.sprite(startX, startY, '__DEFAULT');
    }

    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    // At scale 0.15, sprite 307px → displayed ~46px
    this.player.setScale(0.15);

    // 碰撞体：在本地坐标系下设置，offset 居中
    if (this.player.body) {
      // At scale 0.15, sprite 307px → displayed 46px. Body in local coords: 200×260, offset to center
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

    // 键盘备用
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

    // 面向
    if (vx < 0) this.player.setFlipX(true);
    else if (vx > 0) this.player.setFlipX(false);

    // 动画
    if (this.textures.exists(PLAYER_ATLAS)) {
      const currentAnim = this.player.anims.currentAnim?.key;
      const runKey = `${PLAYER_ATLAS}_run`;
      const idleKey = `${PLAYER_ATLAS}_idle`;
      if (moving && currentAnim !== runKey) this.player.play(runKey, true);
      else if (!moving && currentAnim !== idleKey) this.player.play(idleKey, true);
    }
  }

  private updateEnemies(delta: number): void {
    const playerX = this.player.x;
    const playerY = this.player.y;
    const DETECT_RANGE = 300;
    const ATTACK_RANGE = 90;
    const PATROL_SPEED = 60;
    const CHASE_SPEED = 110;

    this.entityManager.getAlive().forEach(entity => {
      const { sprite } = entity;
      const dist = Phaser.Math.Distance.Between(sprite.x, sprite.y, playerX, playerY);

      // 状态切换
      if (dist < ATTACK_RANGE) {
        entity.state = 'attack';
      } else if (dist < DETECT_RANGE) {
        entity.state = 'chase';
      } else {
        entity.state = 'patrol';
      }

      const body = sprite.body as Phaser.Physics.Arcade.Body;

      if (entity.state === 'chase' || entity.state === 'attack') {
        // 追击
        const angle = Math.atan2(playerY - sprite.y, playerX - sprite.x);
        const speed = entity.state === 'attack' ? CHASE_SPEED * 0.3 : CHASE_SPEED;
        body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        sprite.setFlipX(playerX < sprite.x);
      } else {
        // 巡逻：定时随机方向
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

      // 动画切换
      if (entity.atlasKey) {
        const isMoving = Math.abs(body.velocity.x) > 5 || Math.abs(body.velocity.y) > 5;
        const runKey = `${entity.atlasKey}_run`;
        const idleKey = `${entity.atlasKey}_idle`;
        const cur = sprite.anims.currentAnim?.key;
        if (isMoving && cur !== runKey && this.anims.exists(runKey)) sprite.play(runKey, true);
        else if (!isMoving && cur !== idleKey && this.anims.exists(idleKey)) sprite.play(idleKey, true);
      }

      // 更新 HP 条位置（跟随精灵）
      if (entity.hpBar && entity.hpBarBg) {
        entity.hpBar.setPosition(sprite.x, sprite.y);
        entity.hpBarBg.setPosition(sprite.x, sprite.y);
      }
    });
  }

  /** 供 CombatSystem 调用 */
  getPlayer(): Phaser.Physics.Arcade.Sprite { return this.player; }
  getPlayerCombatant(): Combatant { return this.playerCombatant; }
  getEntityManager(): EntityManager { return this.entityManager; }
  getSpawnSystem(): SpawnSystem { return this.spawnSystem; }
  getActiveSkillIds(): AttributeSkillId[] { return this.activeSkillIds; }
}
