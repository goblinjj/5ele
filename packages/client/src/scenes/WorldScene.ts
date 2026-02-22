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
import { CombatSystem, AUTO_ATTACK_RANGE } from '../systems/combat/CombatSystem.js';

/**
 * 世界尺寸：角色显示大小 ≈ 46px（307 × 0.15），地图 = 角色 × 50
 * 2300 × 2300
 */
const WORLD_W = 2300;
const WORLD_H = 2300;

/** 每轮击杀目标公式：第 N 轮需击杀 5×N 只（与 5 波×N 只/波 对应） */
function getKillTarget(round: number): number {
  return 5 * round;
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
 * 生(50%) 助(40%) 泄(35%) 克(30%) 耗(25%)
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
  if (WX_GENERATES[energyWuxing] === defWuxing) return { rel: '泄', rate: 0.35 };
  // 克：防御克能量
  if (WX_OVERCOMES[defWuxing] === energyWuxing) return { rel: '克', rate: 0.30 };
  // 耗：能量克防御（能量被耗）
  if (WX_OVERCOMES[energyWuxing] === defWuxing) return { rel: '耗', rate: 0.25 };
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
  private killCount: number = 0;
  private killTarget: number = 10;
  private currentRound: number = 1;
  private roundCompleting: boolean = false;
  private enemyIndicator!: Phaser.GameObjects.Graphics;
  private attackRangeIndicator!: Phaser.GameObjects.Graphics;
  private lootDrops: LootDrop[] = [];
  // 塑型系统
  private isChanneling: boolean = false;
  private channelingTimer: number = 0;
  private channelingTarget?: LootDrop;
  private channelingIndicator!: Phaser.GameObjects.Graphics;

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
    const { width, height } = this.cameras.main;
    const viewportH = Math.floor(height * LAYOUT.VIEWPORT_RATIO);

    // ---- 相机视口：只占上 60%，地图外显示黑色 ----
    this.cameras.main.setViewport(0, 0, width, viewportH);
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

    // ---- 回合目标 ----
    this.killTarget = getKillTarget(this.currentRound);
    this.killCount = 0;
    eventBus.on(GameEvent.ENEMY_DIED, () => this.onEnemyKilled());
    eventBus.on(GameEvent.LOOT_DROPPED, (data: unknown) => {
      const d = data as { x: number; y: number; wuxing: Wuxing; level: number };
      this.createLootDrop(d.x, d.y, d.wuxing, d.level);
    });
    eventBus.emit(GameEvent.KILL_COUNT_UPDATE, this.killCount, this.killTarget);

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
    this.updateEnemyIndicator();
    this.updateAttackRangeIndicator();
    this.updateLootDrops();
    this.updateChanneling(delta);

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

    const allSkills = getAllAttributeSkills(equipment);
    this.activeSkillIds = allSkills.filter(id => AOE_SKILL_IDS.has(id)).slice(0, 2);

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
    // 塑型中：锁定位置，强制播放 magic 动画
    if (this.isChanneling) {
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      if (this.textures.exists(PLAYER_ATLAS)) {
        const magicKey = `${PLAYER_ATLAS}_magic`;
        if (!this.player.anims.isPlaying || this.player.anims.currentAnim?.key !== magicKey) {
          this.player.play(magicKey, true);
        }
      }
      return;
    }

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

      if (dist < ATTACK_RANGE) {
        entity.state = 'attack';
      } else if (dist < DETECT_RANGE) {
        entity.state = 'chase';
      } else {
        entity.state = 'patrol';
      }

      const body = sprite.body as Phaser.Physics.Arcade.Body;

      if (entity.state === 'chase' || entity.state === 'attack') {
        const angle = Math.atan2(playerY - sprite.y, playerX - sprite.x);
        const speed = entity.state === 'attack' ? CHASE_SPEED * 0.3 : CHASE_SPEED;
        body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
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
    if (this.isChanneling) return; // 塑型中不检测新的能量
    for (let i = 0; i < this.lootDrops.length; i++) {
      const drop = this.lootDrops[i];
      if (drop.collected) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, drop.x, drop.y);
      if (dist < 35) {
        this.lootDrops.splice(i, 1);
        this.startChanneling(drop);
        break;
      }
    }
  }

  private startChanneling(drop: LootDrop): void {
    this.isChanneling = true;
    this.channelingTimer = CHANNEL_DURATION;
    this.channelingTarget = drop;
    this.combatSystem.setPlayerChanneling(true);

    // 在能量体上显示五行关系标签
    const defWuxing = this.playerCombatant.defenseWuxing?.wuxing;
    const { rel, rate } = calcWuxingResult(defWuxing, drop.wuxing);
    const relColor = rate >= 0.45 ? 0x3fb950 : rate >= 0.38 ? 0xd4a853 : rate >= 0.32 ? 0xeab308 : 0xf85149;
    const relColorHex = '#' + relColor.toString(16).padStart(6, '0');
    const relTxt = this.add.text(drop.x, drop.y - 32, `【${rel}】${Math.round(rate * 100)}%`, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '13px',
      color: relColorHex,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(20);
    // 2秒后随塑型结束自动消失
    this.time.delayedCall(CHANNEL_DURATION + 400, () => relTxt.destroy());
  }

  private updateChanneling(delta: number): void {
    if (!this.isChanneling || !this.channelingTarget) return;
    this.channelingTimer -= delta;

    // 绘制进度弧（金色圆弧，顺时针填充）
    const g = this.channelingIndicator;
    g.clear();
    const progress = 1 - Math.max(0, this.channelingTimer) / CHANNEL_DURATION;
    if (progress > 0) {
      const endAngle = -Math.PI / 2 + Math.PI * 2 * progress;
      g.lineStyle(3, 0xd4a853, 0.9);
      g.beginPath();
      g.arc(this.player.x, this.player.y, 42, -Math.PI / 2, endAngle, false, 0.02);
      g.strokePath();
      // 背景圆（灰色）
      g.lineStyle(3, 0x30363d, 0.5);
      g.strokeCircle(this.player.x, this.player.y, 42);
    }

    if (this.channelingTimer <= 0) {
      this.resolveChanneling();
    }
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

    // 五行关系决定成功率
    const defWuxing = this.playerCombatant.defenseWuxing?.wuxing;
    const { rel, rate } = calcWuxingResult(defWuxing, target.wuxing);

    if (Math.random() < rate) {
      const items = generateSimpleLoot('normal', 1, 1.0);
      items.forEach(eq => gameState.addToInventory(eq as Equipment));
      this.showLootText(target.x, target.y, `塑型成功【${rel}】`, 0x3fb950);
    } else {
      this.showLootText(target.x, target.y, `塑型失败【${rel}】`, 0xf85149);
    }
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

  private onEnemyKilled(): void {
    if (this.roundCompleting) return;
    this.killCount++;
    eventBus.emit(GameEvent.KILL_COUNT_UPDATE, this.killCount, this.killTarget);

    if (this.killCount >= this.killTarget) {
      this.roundCompleting = true;
      this.showRoundCompleteOverlay();
    }
  }

  private showRoundCompleteOverlay(): void {
    const cam = this.cameras.main;
    const cx = cam.worldView.x + cam.width / 2;
    const cy = cam.worldView.y + cam.height / 2;

    const bg = this.add.graphics().setDepth(200);
    bg.fillStyle(0x000000, 0.65);
    bg.fillRoundedRect(cx - 160, cy - 50, 320, 100, 16);

    this.add.text(cx, cy - 14, `第 ${this.currentRound} 轮完成！`, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '28px',
      color: '#d4a853',
    }).setOrigin(0.5).setDepth(201);

    this.add.text(cx, cy + 22, `下一轮目标：击杀 ${getKillTarget(this.currentRound + 1)} 只`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '16px',
      color: '#8b949e',
    }).setOrigin(0.5).setDepth(201);

    this.time.delayedCall(2500, () => {
      this.currentRound++;
      this.killCount = 0;
      this.killTarget = getKillTarget(this.currentRound);
      this.roundCompleting = false;

      this.children.list
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter(c => (c as any).depth >= 200)
        .forEach(c => (c as Phaser.GameObjects.GameObject).destroy());

      // 清除残余怪物和能量掉落，生成新一波
      this.spawnSystem.clearAll();
      this.clearLootDrops();
      this.spawnSystem.spawnEnemies(WORLD_W, WORLD_H, this.currentRound);

      eventBus.emit(GameEvent.KILL_COUNT_UPDATE, this.killCount, this.killTarget);
    });
  }

  /** 供 CombatSystem 调用 */
  getPlayer(): Phaser.Physics.Arcade.Sprite { return this.player; }
  getPlayerCombatant(): Combatant { return this.playerCombatant; }
  getEntityManager(): EntityManager { return this.entityManager; }
  getSpawnSystem(): SpawnSystem { return this.spawnSystem; }
  getActiveSkillIds(): AttributeSkillId[] { return this.activeSkillIds; }
}
