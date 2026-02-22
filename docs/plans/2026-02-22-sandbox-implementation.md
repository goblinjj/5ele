# 沙盒模式 + MOBA 战斗 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将游戏从回合制改为开放世界实时战斗——玩家在气脉区域自由探索，接触妖异触发实时战斗，MOBA 移动端操控。

**Architecture:** 新建 `WorldScene`（游戏世界）+ `HUDScene`（UI 覆盖层）并行运行；`InputManager` 单例轮询输入；`CombatSystem` 基于攻击冷却 CD 在 `update()` 中计算伤害；所有跨系统通信通过 `EventBus`；复用 `shared/` 中所有伤害计算逻辑。

**Tech Stack:** Phaser 3 Arcade Physics, TypeScript, `@xiyou/shared` 伤害计算, 自定义虚拟摇杆

---

## 关键设计决策

- **WorldScene 相机视口**：`setViewport(0, 0, width, height * 0.6)` — 世界只渲染在上 60%
- **HUDScene**：与 WorldScene 并行运行，全屏渲染 UI（摇杆、技能键、HP 条）
- **InputManager**：轮询单例，HUDScene 写入，WorldScene 读取
- **CombatResolver**：直接调用 `calculateFinalDamage()`，不修改 BattleEngine
- **世界大小**：2160 × 2808（视口的 3 倍，可随时扩展）
- **敌人 AI**：巡逻半径内随机走动，感知范围内追击玩家

---

### Task 1: EventBus

**Files:**
- Create: `packages/client/src/core/EventBus.ts`

**Step 1: 创建 EventBus**

```typescript
// packages/client/src/core/EventBus.ts

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
```

**Step 2: 验证编译**

```bash
cd /Volumes/T7/work/fighting && pnpm --filter client build 2>&1 | tail -5
```

预期：`built in X.XXs`，无错误。

**Step 3: Commit**

```bash
git add packages/client/src/core/EventBus.ts
git commit -m "feat: 添加 EventBus 全局事件总线"
```

---

### Task 2: InputManager（轮询单例）

**Files:**
- Create: `packages/client/src/systems/input/InputManager.ts`

**Step 1: 创建 InputManager**

```typescript
// packages/client/src/systems/input/InputManager.ts

export class InputManager {
  private static instance: InputManager;

  /** 移动方向向量，长度 0~1 */
  moveX: number = 0;
  moveY: number = 0;

  /** 技能按钮状态：[普攻持续按下, 技能1按下, 技能2按下] */
  skillActive: boolean[] = [false, false, false];

  /** 技能触发脉冲（每次按下只触发一次） */
  skillJustPressed: boolean[] = [false, false, false];

  static getInstance(): InputManager {
    if (!InputManager.instance) {
      InputManager.instance = new InputManager();
    }
    return InputManager.instance;
  }

  /** 由 HUDScene 每帧调用，更新移动向量 */
  setMove(x: number, y: number): void {
    this.moveX = x;
    this.moveY = y;
  }

  /** 由 HUDScene 调用，技能按下 */
  pressSkill(index: number): void {
    this.skillActive[index] = true;
    this.skillJustPressed[index] = true;
  }

  /** 由 HUDScene 调用，技能松开 */
  releaseSkill(index: number): void {
    this.skillActive[index] = false;
  }

  /** 由 WorldScene 每帧调用，消费脉冲 */
  consumeJustPressed(): boolean[] {
    const copy = [...this.skillJustPressed];
    this.skillJustPressed = [false, false, false];
    return copy;
  }
}

export const inputManager = InputManager.getInstance();
```

**Step 2: 验证编译**

```bash
cd /Volumes/T7/work/fighting && pnpm --filter client build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add packages/client/src/systems/input/InputManager.ts
git commit -m "feat: 添加 InputManager 输入单例"
```

---

### Task 3: 虚拟摇杆 VirtualJoystick

**Files:**
- Create: `packages/client/src/systems/input/VirtualJoystick.ts`

**Step 1: 创建自定义虚拟摇杆（无外部依赖）**

```typescript
// packages/client/src/systems/input/VirtualJoystick.ts
import Phaser from 'phaser';
import { inputManager } from './InputManager.js';

export class VirtualJoystick {
  private scene: Phaser.Scene;
  private baseX: number;
  private baseY: number;
  private baseRadius: number;
  private thumbRadius: number;

  private base!: Phaser.GameObjects.Graphics;
  private thumb!: Phaser.GameObjects.Graphics;

  private pointerId: number = -1;
  private active: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number, baseRadius: number = 70) {
    this.scene = scene;
    this.baseX = x;
    this.baseY = y;
    this.baseRadius = baseRadius;
    this.thumbRadius = baseRadius * 0.45;

    this.createGraphics();
    this.bindInput();
  }

  private createGraphics(): void {
    this.base = this.scene.add.graphics();
    this.base.fillStyle(0xffffff, 0.08);
    this.base.fillCircle(0, 0, this.baseRadius);
    this.base.lineStyle(2, 0xd4a853, 0.4);
    this.base.strokeCircle(0, 0, this.baseRadius);
    this.base.setPosition(this.baseX, this.baseY);
    this.base.setScrollFactor(0);
    this.base.setDepth(100);

    this.thumb = this.scene.add.graphics();
    this.thumb.fillStyle(0xd4a853, 0.5);
    this.thumb.fillCircle(0, 0, this.thumbRadius);
    this.thumb.setPosition(this.baseX, this.baseY);
    this.thumb.setScrollFactor(0);
    this.thumb.setDepth(101);
  }

  private bindInput(): void {
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // 只响应左半屏的触摸
      if (pointer.x < this.scene.cameras.main.width / 2 && this.pointerId === -1) {
        this.active = true;
        this.pointerId = pointer.id;
        this.update(pointer.x, pointer.y);
      }
    });

    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.pointerId) {
        this.update(pointer.x, pointer.y);
      }
    });

    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.pointerId) {
        this.active = false;
        this.pointerId = -1;
        this.thumb.setPosition(this.baseX, this.baseY);
        inputManager.setMove(0, 0);
      }
    });
  }

  private update(px: number, py: number): void {
    const dx = px - this.baseX;
    const dy = py - this.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(dist, this.baseRadius);
    const angle = Math.atan2(dy, dx);

    const thumbX = this.baseX + Math.cos(angle) * clampedDist;
    const thumbY = this.baseY + Math.sin(angle) * clampedDist;
    this.thumb.setPosition(thumbX, thumbY);

    // 归一化向量（0~1）
    const force = clampedDist / this.baseRadius;
    inputManager.setMove(
      Math.cos(angle) * force,
      Math.sin(angle) * force
    );
  }

  destroy(): void {
    this.base.destroy();
    this.thumb.destroy();
  }
}
```

**Step 2: 验证编译**

```bash
cd /Volumes/T7/work/fighting && pnpm --filter client build 2>&1 | tail -5
```

**Step 3: Commit**

```bash
git add packages/client/src/systems/input/VirtualJoystick.ts
git commit -m "feat: 添加自定义虚拟摇杆"
```

---

### Task 4: HUDScene（UI 覆盖层）

**Files:**
- Create: `packages/client/src/scenes/HUDScene.ts`
- Modify: `packages/client/src/config/gameConfig.ts`

**Step 1: 创建 HUDScene**

```typescript
// packages/client/src/scenes/HUDScene.ts
import Phaser from 'phaser';
import { VirtualJoystick } from '../systems/input/VirtualJoystick.js';
import { inputManager } from '../systems/input/InputManager.js';
import { eventBus, GameEvent } from '../core/EventBus.js';
import { uiConfig, LAYOUT } from '../config/uiConfig.js';

export class HUDScene extends Phaser.Scene {
  private joystick!: VirtualJoystick;
  private skillButtons: Phaser.GameObjects.Container[] = [];
  private playerHpBar!: Phaser.GameObjects.Graphics;
  private playerHpText!: Phaser.GameObjects.Text;
  private playerMaxHp: number = 100;
  private playerHp: number = 100;

  constructor() {
    super({ key: 'HUDScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;
    const panelY = height * LAYOUT.VIEWPORT_RATIO;

    // 操控面板背景
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x0d1117, 0.92);
    panelBg.fillRect(0, panelY, width, height * LAYOUT.PANEL_RATIO);
    panelBg.lineStyle(1, 0xd4a853, 0.3);
    panelBg.lineBetween(0, panelY, width, panelY);

    // 玩家HP条（面板顶部）
    this.createPlayerHpBar(width, panelY);

    // 虚拟摇杆（左下）
    const joystickX = width * 0.22;
    const joystickY = panelY + (height * LAYOUT.PANEL_RATIO) * 0.55;
    this.joystick = new VirtualJoystick(this, joystickX, joystickY, Math.min(width * 0.12, 80));

    // 技能按钮（右下）
    this.createSkillButtons(width, panelY, height);

    // 监听 HP 变更事件
    eventBus.on(GameEvent.PLAYER_HP_CHANGE, (hp: unknown, maxHp: unknown) => {
      this.playerHp = hp as number;
      this.playerMaxHp = maxHp as number;
      this.updateHpBar();
    });
  }

  private createPlayerHpBar(width: number, panelY: number): void {
    const barW = width * 0.55;
    const barH = 14;
    const barX = width * 0.06;
    const barY = panelY + 18;

    // 背景
    const bg = this.add.graphics();
    bg.fillStyle(0x1c2128, 1);
    bg.fillRoundedRect(barX - 2, barY - 2, barW + 4, barH + 4, 4);

    this.playerHpBar = this.add.graphics();
    this.updateHpBar();

    this.playerHpText = this.add.text(barX + barW / 2, barY + barH / 2, '', {
      fontFamily: 'monospace',
      fontSize: `${uiConfig.fontXS}px`,
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(10);

    // 标签
    this.add.text(barX, barY - 14, '残魂', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontXS}px`,
      color: '#d4a853',
    });
  }

  private updateHpBar(): void {
    if (!this.playerHpBar) return;
    const { width, height } = this.cameras.main;
    const panelY = height * LAYOUT.VIEWPORT_RATIO;
    const barW = width * 0.55;
    const barH = 14;
    const barX = width * 0.06;
    const barY = panelY + 18;

    const pct = Math.max(0, this.playerHp / this.playerMaxHp);
    const color = pct > 0.5 ? 0x3fb950 : pct > 0.25 ? 0xeab308 : 0xf85149;

    this.playerHpBar.clear();
    this.playerHpBar.fillStyle(color, 1);
    this.playerHpBar.fillRoundedRect(barX, barY, barW * pct, barH, 3);

    if (this.playerHpText) {
      this.playerHpText.setText(`${this.playerHp}/${this.playerMaxHp}`);
    }
  }

  private createSkillButtons(width: number, panelY: number, height: number): void {
    const btnSize = Math.min(width * 0.15, 90);
    const btnY = panelY + (height * LAYOUT.PANEL_RATIO) * 0.5;
    const labels = ['普攻', '技能\n①', '技能\n②'];
    const colors = [0x3fb950, 0x58a6ff, 0xa855f7];

    labels.forEach((label, i) => {
      const btnX = width * 0.62 + i * (btnSize + width * 0.04);
      const container = this.add.container(btnX, btnY);

      const bg = this.add.graphics();
      bg.fillStyle(colors[i], 0.25);
      bg.fillCircle(0, 0, btnSize / 2);
      bg.lineStyle(2, colors[i], 0.7);
      bg.strokeCircle(0, 0, btnSize / 2);

      const txt = this.add.text(0, 0, label, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: `${uiConfig.fontXS}px`,
        color: '#ffffff',
        align: 'center',
      }).setOrigin(0.5);

      container.add([bg, txt]);
      container.setSize(btnSize, btnSize);
      container.setInteractive();

      container.on('pointerdown', () => {
        bg.clear();
        bg.fillStyle(colors[i], 0.6);
        bg.fillCircle(0, 0, btnSize / 2);
        bg.lineStyle(2, colors[i], 1);
        bg.strokeCircle(0, 0, btnSize / 2);
        inputManager.pressSkill(i);
      });

      container.on('pointerup', () => {
        bg.clear();
        bg.fillStyle(colors[i], 0.25);
        bg.fillCircle(0, 0, btnSize / 2);
        bg.lineStyle(2, colors[i], 0.7);
        bg.strokeCircle(0, 0, btnSize / 2);
        inputManager.releaseSkill(i);
      });

      container.on('pointerout', () => {
        inputManager.releaseSkill(i);
      });

      this.skillButtons.push(container);
    });
  }

  shutdown(): void {
    eventBus.off(GameEvent.PLAYER_HP_CHANGE, this.updateHpBar.bind(this));
    this.joystick?.destroy();
  }
}
```

**Step 2: 在 gameConfig.ts 注册 HUDScene 和 WorldScene（占位）**

修改 `packages/client/src/config/gameConfig.ts`：

```typescript
import { HUDScene } from '../scenes/HUDScene.js';
// WorldScene 将在 Task 5 创建，先添加 HUDScene
```

在 `scene` 数组中加入 `HUDScene`（在 BattleScene 之后）：
```typescript
scene: [BootScene, MenuScene, PrologueScene, MapScene, BattleScene, RewardScene, InventoryScene, HUDScene],
```

**Step 3: 验证编译**

```bash
cd /Volumes/T7/work/fighting && pnpm --filter client build 2>&1 | tail -5
```

**Step 4: Commit**

```bash
git add packages/client/src/scenes/HUDScene.ts packages/client/src/config/gameConfig.ts
git commit -m "feat: 添加 HUDScene（操控面板 + 虚拟摇杆 + HP 条）"
```

---

### Task 5: WorldScene 骨架 + 玩家移动

**Files:**
- Create: `packages/client/src/scenes/WorldScene.ts`
- Modify: `packages/client/src/config/gameConfig.ts`
- Modify: `packages/client/src/scenes/PrologueScene.ts`

**Step 1: 创建 WorldScene（骨架，只有玩家移动）**

```typescript
// packages/client/src/scenes/WorldScene.ts
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

    // ---- 启动 HUDScene ----
    this.scene.launch('HUDScene');

    // 发送初始 HP
    eventBus.emit(
      GameEvent.PLAYER_HP_CHANGE,
      this.playerCombatant.hp,
      this.playerCombatant.maxHp
    );

    // 创建玩家动画
    this.createPlayerAnims();
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

    // 世界边界
    const walls = this.physics.add.staticGroup();
    const thickness = 40;
    // 上
    walls.add(this.add.rectangle(WORLD_W / 2, -thickness / 2, WORLD_W, thickness));
    // 下
    walls.add(this.add.rectangle(WORLD_W / 2, WORLD_H + thickness / 2, WORLD_W, thickness));
    // 左
    walls.add(this.add.rectangle(-thickness / 2, WORLD_H / 2, thickness, WORLD_H));
    // 右
    walls.add(this.add.rectangle(WORLD_W + thickness / 2, WORLD_H / 2, thickness, WORLD_H));
    walls.getChildren().forEach(c => this.physics.world.enable(c));
  }

  private createPlayer(): void {
    const startX = WORLD_W / 2;
    const startY = WORLD_H / 2;

    const playerState = gameState.getPlayerState();

    // 构建 Combatant 数据
    this.playerCombatant = {
      id: 'player',
      name: '残魂',
      hp: playerState.hp,
      maxHp: playerState.maxHp,
      attack: getTotalAttack(playerState),
      defense: getTotalDefense(playerState),
      speed: getTotalSpeed(playerState),
      isPlayer: true,
      attackWuxing: getAttackWuxing(playerState),
      defenseWuxing: getDefenseWuxing(playerState),
      allWuxingLevels: getAllWuxingLevels(playerState),
      attributeSkills: getAllAttributeSkills(playerState),
      frozen: false,
    };

    if (this.textures.exists(PLAYER_ATLAS)) {
      this.player = this.physics.add.sprite(startX, startY, PLAYER_ATLAS, 'character_idle_0');
    } else {
      // 占位圆形（无贴图时）
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
```

**Step 2: 注册 WorldScene 到 gameConfig.ts**

在 `packages/client/src/config/gameConfig.ts` 中：
- 添加 import：`import { WorldScene } from '../scenes/WorldScene.js';`
- 在 scene 数组中加入 `WorldScene`

```typescript
scene: [BootScene, MenuScene, PrologueScene, MapScene, BattleScene, RewardScene, InventoryScene, HUDScene, WorldScene],
```

**Step 3: PrologueScene 路由到 WorldScene**

在 `packages/client/src/scenes/PrologueScene.ts` 第 179 行，将：
```typescript
this.scene.start('MapScene', { mode: 'single', round: 1 });
```
改为：
```typescript
this.scene.start('WorldScene');
```

**Step 4: 验证编译并运行**

```bash
cd /Volumes/T7/work/fighting && pnpm --filter client build 2>&1 | tail -5
```

启动开发服务器，验证：
- 点击开始游戏 → 序幕 → 进入 WorldScene（深绿色网格世界）
- 键盘方向键可移动玩家
- 底部出现操控面板（HUDScene）
- 摇杆可控制玩家移动

```bash
pnpm --filter client dev
```

**Step 5: Commit**

```bash
git add packages/client/src/scenes/WorldScene.ts packages/client/src/config/gameConfig.ts packages/client/src/scenes/PrologueScene.ts
git commit -m "feat: 添加 WorldScene 骨架，玩家可在开放世界移动"
```

---

### Task 6: 敌人实体 + AI + EntityManager

**Files:**
- Create: `packages/client/src/systems/world/EntityManager.ts`
- Create: `packages/client/src/systems/world/SpawnSystem.ts`
- Modify: `packages/client/src/scenes/WorldScene.ts`

**Step 1: 创建 EntityManager**

```typescript
// packages/client/src/systems/world/EntityManager.ts
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
```

**Step 2: 创建 SpawnSystem**

```typescript
// packages/client/src/systems/world/SpawnSystem.ts
import Phaser from 'phaser';
import { generateEnemies, Combatant, WUXING_COLORS, Wuxing } from '@xiyou/shared';
import { EntityManager, WorldEntity } from './EntityManager.js';
import { gameState } from '../GameStateManager.js';

const MONSTER_ATLAS_MAP: Record<string, string> = {
  '树妖':   'monster_tree_demon',
  '獠牙怪': 'monster_fang_beast',
  '青鳞蛇': 'monster_green_snake',
  '赤狐精': 'monster_red_fox',
  '石头精': 'monster_stone_spirit',
};

const MONSTER_ATLAS_PATHS: Record<string, { json: string; image: string }> = {
  monster_tree_demon:  { json: 'assets/monsters/树妖/atlas.json',  image: 'assets/monsters/树妖/atlas.png' },
  monster_fang_beast:  { json: 'assets/monsters/獠牙怪/atlas.json', image: 'assets/monsters/獠牙怪/atlas.png' },
  monster_green_snake: { json: 'assets/monsters/青鳞蛇/atlas.json', image: 'assets/monsters/青鳞蛇/atlas.png' },
  monster_red_fox:     { json: 'assets/monsters/赤狐精/atlas.json',  image: 'assets/monsters/赤狐精/atlas.png' },
  monster_stone_spirit:{ json: 'assets/monsters/石头精/atlas.json',  image: 'assets/monsters/石头精/atlas.png' },
};

export class SpawnSystem {
  private scene: Phaser.Scene;
  private entityManager: EntityManager;
  private enemyGroup: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene, entityManager: EntityManager) {
    this.scene = scene;
    this.entityManager = entityManager;
    this.enemyGroup = scene.physics.add.group();
  }

  /** 预加载所有怪物图集 */
  preloadAtlases(): void {
    Object.entries(MONSTER_ATLAS_PATHS).forEach(([key, paths]) => {
      if (!this.scene.textures.exists(key)) {
        this.scene.load.atlas(key, paths.image, paths.json);
      }
    });
  }

  /** 创建怪物动画 */
  createAnims(): void {
    const animTypes = ['idle', 'run', 'atk', 'hurt', 'die'];
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
            repeat: anim === 'idle' ? -1 : 0,
          });
        }
      });
    });
  }

  /** 在地图上生成一批敌人 */
  spawnEnemies(worldW: number, worldH: number, round: number = 1): void {
    const playerState = gameState.getPlayerState();
    const enemies = generateEnemies('normal', round, playerState.monsterScaling ?? 0.3, 0);

    // 分散生成，避免在玩家出生点附近
    const centerX = worldW / 2;
    const centerY = worldH / 2;
    const safeRadius = 400;

    enemies.forEach((combatant, i) => {
      let x: number, y: number;
      do {
        x = Phaser.Math.Between(100, worldW - 100);
        y = Phaser.Math.Between(100, worldH - 100);
      } while (Phaser.Math.Distance.Between(x, y, centerX, centerY) < safeRadius);

      this.spawnEnemy(combatant, x, y);
    });

    // 生成更多敌人分布在地图各处
    for (let i = 0; i < 8; i++) {
      const moreEnemies = generateEnemies('normal', round, playerState.monsterScaling ?? 0.3, 0);
      const e = moreEnemies[0];
      const x = Phaser.Math.Between(100, worldW - 100);
      const y = Phaser.Math.Between(100, worldH - 100);
      this.spawnEnemy(e, x, y);
    }
  }

  private spawnEnemy(combatant: Combatant, x: number, y: number): void {
    const atlasKey = MONSTER_ATLAS_MAP[combatant.name];
    let sprite: Phaser.Physics.Arcade.Sprite;

    if (atlasKey && this.scene.textures.exists(atlasKey)) {
      sprite = this.scene.physics.add.sprite(x, y, atlasKey, 'character_idle_0');
      sprite.play(`${atlasKey}_idle`);
      sprite.setFlipX(true); // 面向玩家方向
    } else {
      sprite = this.scene.physics.add.sprite(x, y, '__DEFAULT');
      // 用颜色圆形替代
      const color = combatant.attackWuxing?.wuxing !== undefined
        ? WUXING_COLORS[combatant.attackWuxing.wuxing as Wuxing]
        : 0x8b949e;
      sprite.setTint(color);
    }

    sprite.setScale(2.0);
    sprite.setDepth(9);
    sprite.setCollideWorldBounds(true);
    if (sprite.body) {
      (sprite.body as Phaser.Physics.Arcade.Body).setSize(28, 36).setOffset(18, 20);
    }

    // HP 条背景
    const hpBarBg = this.scene.add.graphics();
    hpBarBg.fillStyle(0x1c2128, 1);
    hpBarBg.fillRect(-24, -50, 48, 7);
    hpBarBg.setDepth(20);

    const hpBar = this.scene.add.graphics();
    hpBar.setDepth(21);

    this.updateEnemyHpBar(hpBar, combatant.hp, combatant.maxHp);

    const entity: WorldEntity = {
      sprite,
      combatant,
      hpBar,
      hpBarBg,
      patrolCenterX: x,
      patrolCenterY: y,
      state: 'patrol',
      patrolTimer: 0,
      attackTimer: 1000,
      atlasKey: atlasKey || '',
    };

    this.entityManager.add(combatant.id, entity);
    this.enemyGroup.add(sprite);
  }

  updateEnemyHpBar(hpBar: Phaser.GameObjects.Graphics, hp: number, maxHp: number): void {
    hpBar.clear();
    const pct = Math.max(0, hp / maxHp);
    const color = pct > 0.5 ? 0x3fb950 : pct > 0.25 ? 0xeab308 : 0xf85149;
    hpBar.fillStyle(color, 1);
    hpBar.fillRect(-24, -50, 48 * pct, 7);
  }

  getEnemyGroup(): Phaser.Physics.Arcade.Group {
    return this.enemyGroup;
  }
}
```

**Step 3: 在 WorldScene 中集成 EntityManager + SpawnSystem**

在 `packages/client/src/scenes/WorldScene.ts` 中：

1. 在 import 区添加：
```typescript
import { EntityManager } from '../systems/world/EntityManager.js';
import { SpawnSystem } from '../systems/world/SpawnSystem.js';
```

2. 在类成员变量中添加：
```typescript
private entityManager!: EntityManager;
private spawnSystem!: SpawnSystem;
```

3. 在 `preload()` 末尾添加：
```typescript
// 预加载怪物图集
this.entityManager = new EntityManager();
this.spawnSystem = new SpawnSystem(this, this.entityManager);
this.spawnSystem.preloadAtlases();
```

4. 在 `create()` 中 `this.scene.launch('HUDScene')` 之前添加：
```typescript
this.spawnSystem.createAnims();
this.spawnSystem.spawnEnemies(WORLD_W, WORLD_H, 1);
```

5. 在 `update()` 中添加敌人 AI 更新：
```typescript
update(_time: number, delta: number): void {
  this.movePlayer(delta);
  this.updateEnemies(delta);
}

private updateEnemies(delta: number): void {
  const playerX = this.player.x;
  const playerY = this.player.y;
  const DETECT_RANGE = 300;
  const ATTACK_RANGE = 90;
  const PATROL_SPEED = 60;
  const CHASE_SPEED = 110;

  this.entityManager.getAlive().forEach(entity => {
    const { sprite, combatant } = entity;
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
        const angle = Math.random() * Math.PI * 2;
        // 限制在巡逻半径内
        const dx = sprite.x - entity.patrolCenterX;
        const dy = sprite.y - entity.patrolCenterY;
        const distFromCenter = Math.sqrt(dx * dx + dy * dy);
        if (distFromCenter > 200) {
          // 回到中心
          const backAngle = Math.atan2(entity.patrolCenterY - sprite.y, entity.patrolCenterX - sprite.x);
          body.setVelocity(Math.cos(backAngle) * PATROL_SPEED, Math.sin(backAngle) * PATROL_SPEED);
        } else {
          body.setVelocity(Math.cos(angle) * PATROL_SPEED, Math.sin(angle) * PATROL_SPEED);
        }
      }
    }

    // 动画
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
```

**Step 4: 验证**

启动开发服务器，确认：
- 地图上出现多个敌人精灵
- 敌人在地图上随机巡逻
- 靠近玩家时追击
- 敌人头顶有 HP 条

**Step 5: Commit**

```bash
git add packages/client/src/systems/world/EntityManager.ts packages/client/src/systems/world/SpawnSystem.ts packages/client/src/scenes/WorldScene.ts
git commit -m "feat: 敌人 AI（巡逻/追击），EntityManager，SpawnSystem"
```

---

### Task 7: CombatResolver + CombatSystem

**Files:**
- Create: `packages/client/src/systems/combat/CombatResolver.ts`
- Create: `packages/client/src/systems/combat/CombatSystem.ts`
- Modify: `packages/client/src/scenes/WorldScene.ts`

**Step 1: 创建 CombatResolver（包装现有伤害计算）**

```typescript
// packages/client/src/systems/combat/CombatResolver.ts
import {
  Combatant,
  calculateFinalDamage,
  SkillTrigger,
  AttributeSkillId,
} from '@xiyou/shared';

export interface CombatResult {
  damage: number;
  missed: boolean;
  critical: boolean;
  attackerId: string;
  defenderId: string;
}

/**
 * 无状态伤害解算器 — 复用 shared 伤害计算公式
 */
export function resolveCombat(attacker: Combatant, defender: Combatant): CombatResult {
  // 闪避检定（简化）
  const dodgeRoll = Math.random();
  if (dodgeRoll < 0.05) {
    return { damage: 0, missed: true, critical: false, attackerId: attacker.id, defenderId: defender.id };
  }

  // 使用 shared 伤害公式
  const baseDamage = calculateFinalDamage(attacker, defender, false);

  // 暴击检定
  const critRate = 0.1; // 基础 10%，后续可通过技能提升
  const isCrit = Math.random() < critRate;
  const finalDamage = Math.max(1, Math.floor(isCrit ? baseDamage * 1.5 : baseDamage));

  return {
    damage: finalDamage,
    missed: false,
    critical: isCrit,
    attackerId: attacker.id,
    defenderId: defender.id,
  };
}
```

**Step 2: 创建 CombatSystem（实时 CD 循环）**

```typescript
// packages/client/src/systems/combat/CombatSystem.ts
import Phaser from 'phaser';
import { Combatant, generateLoot } from '@xiyou/shared';
import { EntityManager, WorldEntity } from '../world/EntityManager.js';
import { SpawnSystem } from '../world/SpawnSystem.js';
import { inputManager } from '../input/InputManager.js';
import { resolveCombat } from './CombatResolver.js';
import { eventBus, GameEvent } from '../../core/EventBus.js';
import { gameState } from '../GameStateManager.js';

/** 普攻攻击间隔（ms），速度越高间隔越短 */
const BASE_ATTACK_INTERVAL = 1200;
const BASE_SPEED = 10;

export class CombatSystem {
  private scene: Phaser.Scene;
  private entityManager: EntityManager;
  private spawnSystem: SpawnSystem;

  /** 玩家攻击冷却（ms） */
  private playerAttackTimer: number = 0;
  private playerSkillTimers: number[] = [0, 0, 0];

  constructor(scene: Phaser.Scene, entityManager: EntityManager, spawnSystem: SpawnSystem) {
    this.scene = scene;
    this.entityManager = entityManager;
    this.spawnSystem = spawnSystem;
  }

  /**
   * 每帧调用
   */
  update(
    delta: number,
    player: Phaser.Physics.Arcade.Sprite,
    playerCombatant: Combatant
  ): void {
    this.playerAttackTimer = Math.max(0, this.playerAttackTimer - delta);
    this.playerSkillTimers = this.playerSkillTimers.map(t => Math.max(0, t - delta));

    const justPressed = inputManager.consumeJustPressed();
    const alive = this.entityManager.getAlive();

    // ---- 玩家普攻 ----
    if (inputManager.skillActive[0] && this.playerAttackTimer <= 0) {
      const target = this.getNearestEnemy(player, alive, 100);
      if (target) {
        this.playerAttackTimer = this.getAttackInterval(playerCombatant.speed);
        this.attackEnemy(playerCombatant, target);
      }
    }

    // ---- 玩家技能①（AOE，范围攻击） ----
    if (justPressed[1] && this.playerSkillTimers[1] <= 0) {
      this.playerSkillTimers[1] = 5000;
      this.playerAoe(player, playerCombatant, alive, 180);
    }

    // ---- 玩家技能②（单体强攻） ----
    if (justPressed[2] && this.playerSkillTimers[2] <= 0) {
      this.playerSkillTimers[2] = 8000;
      const target = this.getNearestEnemy(player, alive, 200);
      if (target) {
        // 造成 2.5× 伤害
        const result = resolveCombat(playerCombatant, target.combatant);
        const ampDamage = Math.floor(result.damage * 2.5);
        this.applyDamageToEnemy(target, ampDamage, playerCombatant);
      }
    }

    // ---- 敌人攻击玩家 ----
    alive.forEach(entity => {
      entity.attackTimer = Math.max(0, entity.attackTimer - delta);
      const dist = Phaser.Math.Distance.Between(
        entity.sprite.x, entity.sprite.y, player.x, player.y
      );
      if (dist < 90 && entity.attackTimer <= 0 && entity.state === 'attack') {
        entity.attackTimer = this.getAttackInterval(entity.combatant.speed);
        this.attackPlayer(entity.combatant, playerCombatant);
        eventBus.emit(GameEvent.PLAYER_HP_CHANGE, playerCombatant.hp, playerCombatant.maxHp);
      }
    });
  }

  private getAttackInterval(speed: number): number {
    return Math.max(400, BASE_ATTACK_INTERVAL / (speed / BASE_SPEED));
  }

  private getNearestEnemy(
    player: Phaser.Physics.Arcade.Sprite,
    alive: WorldEntity[],
    maxRange: number
  ): WorldEntity | null {
    let nearest: WorldEntity | null = null;
    let minDist = maxRange;
    alive.forEach(e => {
      const d = Phaser.Math.Distance.Between(player.x, player.y, e.sprite.x, e.sprite.y);
      if (d < minDist) { minDist = d; nearest = e; }
    });
    return nearest;
  }

  private attackEnemy(attacker: Combatant, target: WorldEntity): void {
    const result = resolveCombat(attacker, target.combatant);
    this.applyDamageToEnemy(target, result.damage, attacker);
  }

  private applyDamageToEnemy(target: WorldEntity, damage: number, attacker: Combatant): void {
    target.combatant.hp = Math.max(0, target.combatant.hp - damage);

    // 伤害数字飘字
    this.showDamageText(target.sprite.x, target.sprite.y - 40, damage, 0xffffff);

    // 更新 HP 条
    if (target.hpBar) {
      this.spawnSystem.updateEnemyHpBar(target.hpBar, target.combatant.hp, target.combatant.maxHp);
    }

    // 播放受击动画
    if (target.atlasKey) {
      const hurtKey = `${target.atlasKey}_hurt`;
      if (this.scene.anims.exists(hurtKey)) {
        target.sprite.play(hurtKey, true);
      }
    }

    eventBus.emit(GameEvent.COMBAT_DAMAGE, { damage, target: target.combatant.id });

    // 死亡
    if (target.combatant.hp <= 0) {
      this.onEnemyDeath(target, attacker);
    }
  }

  private attackPlayer(attacker: Combatant, player: Combatant): void {
    const result = resolveCombat(attacker, player);
    player.hp = Math.max(0, player.hp - result.damage);
    this.showDamageText(
      this.scene.cameras.main.width / 2,
      100,
      result.damage,
      0xf85149
    );

    if (player.hp <= 0) {
      eventBus.emit(GameEvent.PLAYER_DEATH);
      this.scene.scene.start('MenuScene');
    }
  }

  private playerAoe(
    player: Phaser.Physics.Arcade.Sprite,
    playerCombatant: Combatant,
    targets: WorldEntity[],
    radius: number
  ): void {
    // 视觉效果
    const circle = this.scene.add.graphics();
    circle.lineStyle(3, 0xa855f7, 0.8);
    circle.strokeCircle(player.x, player.y, radius);
    this.scene.tweens.add({
      targets: circle,
      alpha: 0,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 500,
      onComplete: () => circle.destroy(),
    });

    targets.forEach(e => {
      const d = Phaser.Math.Distance.Between(player.x, player.y, e.sprite.x, e.sprite.y);
      if (d <= radius) {
        const result = resolveCombat(playerCombatant, e.combatant);
        this.applyDamageToEnemy(e, result.damage, playerCombatant);
      }
    });
  }

  private onEnemyDeath(entity: WorldEntity, killer: Combatant): void {
    // 死亡动画
    if (entity.atlasKey) {
      const dieKey = `${entity.atlasKey}_die`;
      if (this.scene.anims.exists(dieKey)) {
        entity.sprite.play(dieKey);
        entity.sprite.once('animationcomplete', () => {
          this.cleanupEnemy(entity);
        });
        return;
      }
    }
    this.cleanupEnemy(entity);
  }

  private cleanupEnemy(entity: WorldEntity): void {
    entity.sprite.destroy();
    entity.hpBar?.destroy();
    entity.hpBarBg?.destroy();
    this.entityManager.remove(entity.combatant.id);
    eventBus.emit(GameEvent.ENEMY_DIED, entity.combatant);

    // 掉落处理 —— 触发现有 RewardScene 流程
    const loot = generateLoot([entity.combatant], 1, []);
    if (loot.equipment.length > 0) {
      gameState.addToInventory(loot.equipment[0]);
    }
  }

  private showDamageText(x: number, y: number, damage: number, color: number): void {
    if (damage <= 0) return;
    const colorHex = '#' + color.toString(16).padStart(6, '0');
    const text = this.scene.add.text(x, y, `-${damage}`, {
      fontFamily: 'monospace',
      fontSize: '20px',
      color: colorHex,
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(30);

    this.scene.tweens.add({
      targets: text,
      y: y - 60,
      alpha: 0,
      duration: 900,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }

  getPlayerSkillTimers(): number[] {
    return this.playerSkillTimers;
  }

  getPlayerSkillMaxTimers(): number[] {
    return [0, 5000, 8000]; // 0 = 普攻无CD显示
  }
}
```

**Step 3: 在 WorldScene 中集成 CombatSystem**

在 `packages/client/src/scenes/WorldScene.ts` 中：

1. 添加 import：
```typescript
import { CombatSystem } from '../systems/combat/CombatSystem.js';
```

2. 添加成员变量：
```typescript
private combatSystem!: CombatSystem;
```

3. 在 `create()` 中 spawnEnemies 之后添加：
```typescript
this.combatSystem = new CombatSystem(this, this.entityManager, this.spawnSystem);
```

4. 在 `update()` 中添加：
```typescript
update(_time: number, delta: number): void {
  this.movePlayer(delta);
  this.updateEnemies(delta);
  this.combatSystem.update(delta, this.player, this.playerCombatant);
}
```

**Step 4: 验证**

启动开发服务器，测试：
- 靠近敌人，按住普攻键伤害数字出现
- 敌人 HP 条减少直至死亡，精灵消失
- 敌人攻击玩家，顶部 HP 条减少
- 技能① 触发 AOE，圆圈动画可见
- 玩家死亡跳回主菜单

**Step 5: Commit**

```bash
git add packages/client/src/systems/combat/CombatResolver.ts packages/client/src/systems/combat/CombatSystem.ts packages/client/src/scenes/WorldScene.ts
git commit -m "feat: CombatSystem 实时战斗（普攻/技能/AOE/死亡）"
```

---

### Task 8: 技能 CD 显示 + 整体收尾

**Files:**
- Modify: `packages/client/src/scenes/HUDScene.ts`
- Modify: `packages/client/src/scenes/WorldScene.ts`
- Modify: `packages/client/src/core/EventBus.ts`

**Step 1: 在 EventBus 中添加技能 CD 事件**

在 `GameEvent` 枚举中增加：
```typescript
SKILL_CD_UPDATE = 'ui:skill_cd',
```

**Step 2: WorldScene 每帧广播技能 CD**

在 `WorldScene.update()` 中，`combatSystem.update()` 之后添加：
```typescript
// 广播技能CD（降频：每5帧一次）
if (this._cdBroadcastTick === undefined) this._cdBroadcastTick = 0;
this._cdBroadcastTick = (this._cdBroadcastTick + 1) % 5;
if (this._cdBroadcastTick === 0) {
  eventBus.emit(
    GameEvent.SKILL_CD_UPDATE,
    this.combatSystem.getPlayerSkillTimers(),
    this.combatSystem.getPlayerSkillMaxTimers()
  );
}
```

添加成员变量：
```typescript
private _cdBroadcastTick: number = 0;
```

**Step 3: HUDScene 监听 CD 更新，在技能按钮上显示 CD 覆盖**

在 HUDScene 的 `createSkillButtons()` 方法中，为每个按钮保存 `cdOverlay` Graphics 引用：

在 `create()` 的末尾监听：
```typescript
eventBus.on(GameEvent.SKILL_CD_UPDATE, (timers: unknown, maxTimers: unknown) => {
  const t = timers as number[];
  const m = maxTimers as number[];
  this.updateSkillCds(t, m);
});
```

添加方法：
```typescript
private cdOverlays: Phaser.GameObjects.Graphics[] = [];
private cdTexts: Phaser.GameObjects.Text[] = [];

private updateSkillCds(timers: number[], maxTimers: number[]): void {
  timers.forEach((t, i) => {
    if (i === 0) return; // 普攻不显示CD
    const overlay = this.cdOverlays[i];
    const cdText = this.cdTexts[i];
    if (!overlay || !cdText) return;

    overlay.clear();
    if (t > 0 && maxTimers[i] > 0) {
      const pct = t / maxTimers[i];
      // 半透明遮罩
      const btn = this.skillButtons[i];
      if (btn) {
        const btnSize = Math.min(this.cameras.main.width * 0.15, 90);
        overlay.fillStyle(0x000000, 0.6 * pct);
        overlay.fillCircle(0, 0, btnSize / 2);
        cdText.setText(`${(t / 1000).toFixed(1)}s`).setAlpha(1);
      }
    } else {
      cdText.setText('').setAlpha(0);
    }
  });
}
```

在 `createSkillButtons()` 中，每个按钮容器创建后追加 `cdOverlay` 和 `cdText`：
```typescript
const cdOverlay = this.add.graphics();
cdOverlay.setDepth(102);
container.add(cdOverlay);
this.cdOverlays.push(cdOverlay);

const cdText = this.add.text(0, 0, '', {
  fontFamily: 'monospace',
  fontSize: `${uiConfig.fontXS}px`,
  color: '#ffffff',
}).setOrigin(0.5).setDepth(103).setAlpha(0);
container.add(cdText);
this.cdTexts.push(cdText);
```

**Step 4: 最终验证全流程**

```bash
cd /Volumes/T7/work/fighting && pnpm --filter client build 2>&1 | tail -5
pnpm --filter client dev
```

验证完整流程：
- [ ] 主菜单 → 序幕 → WorldScene
- [ ] 摇杆控制玩家移动
- [ ] 敌人巡逻并追击玩家
- [ ] 按住普攻键攻击最近敌人，显示伤害数字
- [ ] 敌人HP归零，死亡动画后消失
- [ ] 敌人攻击玩家，面板HP条减少
- [ ] 技能①触发AOE（圆圈动画）
- [ ] 技能②触发强攻（高倍伤害）
- [ ] 技能CD倒计时显示在按钮上
- [ ] 玩家HP归零返回主菜单

**Step 5: Commit**

```bash
git add .
git commit -m "feat: 技能CD显示完成，沙盒MOBA战斗MVP完整"
```

---

### Task 9: Build + Deploy

**Step 1: 最终 Build**

```bash
cd /Volumes/T7/work/fighting && pnpm build 2>&1 | tail -10
```

**Step 2: Deploy**

```bash
cd /Volumes/T7/work/fighting/packages/client && pnpm run deploy
```

**Step 3: Git Push**

```bash
cd /Volumes/T7/work/fighting && git push origin main
```
