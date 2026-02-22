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
} from '@xiyou/shared';

/** 世界尺寸（视口的3倍） */
const WORLD_W = 2160;
const WORLD_H = 2808;

/** 玩家移动速度 */
const PLAYER_SPEED = 220;

/** 图集键 */
const PLAYER_ATLAS = 'player_spirit';

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerCombatant!: Combatant;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private _cdBroadcastTick: number = 0;

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

    // ---- 键盘备用 ----
    this.cursors = this.input.keyboard?.createCursorKeys();

    // ---- 创建玩家动画 ----
    this.createPlayerAnims();

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

    if (this.textures.exists(PLAYER_ATLAS)) {
      this.player = this.physics.add.sprite(startX, startY, PLAYER_ATLAS, 'character_idle_0');
    } else {
      // 占位（无贴图时用默认精灵）
      this.player = this.physics.add.sprite(startX, startY, '__DEFAULT');
    }

    this.player.setCollideWorldBounds(true);
    this.player.setDepth(10);
    this.player.setScale(2.5);

    // 碰撞体缩小
    if (this.player.body) {
      (this.player.body as Phaser.Physics.Arcade.Body).setSize(24, 32).setOffset(20, 24);
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

  /** 供 CombatSystem 调用 */
  getPlayer(): Phaser.Physics.Arcade.Sprite { return this.player; }
  getPlayerCombatant(): Combatant { return this.playerCombatant; }
}
