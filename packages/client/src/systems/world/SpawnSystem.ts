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
  monster_tree_demon:   { json: 'assets/monsters/树妖/atlas.json',  image: 'assets/monsters/树妖/atlas.png' },
  monster_fang_beast:   { json: 'assets/monsters/獠牙怪/atlas.json', image: 'assets/monsters/獠牙怪/atlas.png' },
  monster_green_snake:  { json: 'assets/monsters/青鳞蛇/atlas.json', image: 'assets/monsters/青鳞蛇/atlas.png' },
  monster_red_fox:      { json: 'assets/monsters/赤狐精/atlas.json',  image: 'assets/monsters/赤狐精/atlas.png' },
  monster_stone_spirit: { json: 'assets/monsters/石头精/atlas.json',  image: 'assets/monsters/石头精/atlas.png' },
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

  /** 预加载所有怪物图集（在 preload() 中调用） */
  preloadAtlases(): void {
    Object.entries(MONSTER_ATLAS_PATHS).forEach(([key, paths]) => {
      if (!this.scene.textures.exists(key)) {
        this.scene.load.atlas(key, paths.image, paths.json);
      }
    });
  }

  /** 创建怪物动画（在 create() 中调用） */
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
            repeat: anim === 'idle' || anim === 'run' ? -1 : 0,
          });
        }
      });
    });
  }

  /** 在地图上生成一批敌人 */
  spawnEnemies(worldW: number, worldH: number, round: number = 1): void {
    const playerState = gameState.getPlayerState();
    const scaling = playerState.monsterScaling ?? 0.3;

    // 初始一批
    const enemies = generateEnemies('normal', round, scaling, 0);

    const centerX = worldW / 2;
    const centerY = worldH / 2;
    const safeRadius = 400;

    enemies.forEach(combatant => {
      let x: number, y: number;
      do {
        x = Phaser.Math.Between(100, worldW - 100);
        y = Phaser.Math.Between(100, worldH - 100);
      } while (Phaser.Math.Distance.Between(x, y, centerX, centerY) < safeRadius);
      this.spawnEnemy(combatant, x, y);
    });

    // 额外分散生成
    for (let i = 0; i < 8; i++) {
      const moreEnemies = generateEnemies('normal', round, scaling, 0);
      const e = moreEnemies[Math.floor(Math.random() * moreEnemies.length)];
      const x = Phaser.Math.Between(100, worldW - 100);
      const y = Phaser.Math.Between(100, worldH - 100);
      // Give unique id to avoid collision
      e.id = `${e.id}_extra_${i}`;
      this.spawnEnemy(e, x, y);
    }
  }

  private spawnEnemy(combatant: Combatant, x: number, y: number): void {
    const atlasKey = MONSTER_ATLAS_MAP[combatant.name];
    let sprite: Phaser.Physics.Arcade.Sprite;

    if (atlasKey && this.scene.textures.exists(atlasKey)) {
      sprite = this.scene.physics.add.sprite(x, y, atlasKey, 'character_idle_0');
      sprite.play(`${atlasKey}_idle`);
    } else {
      // Fallback: colored rectangle approximation using graphics overlay
      sprite = this.scene.physics.add.sprite(x, y, '__DEFAULT');
      const color = combatant.attackWuxing?.wuxing !== undefined
        ? WUXING_COLORS[combatant.attackWuxing.wuxing as Wuxing]
        : 0x8b949e;
      sprite.setTint(color);
    }

    // At scale 0.13, sprite 307px → ~40px displayed
    sprite.setScale(0.13);
    sprite.setDepth(9);
    sprite.setCollideWorldBounds(true);
    if (sprite.body) {
      // At scale 0.13, sprite 307px → 40px displayed. Body local coords center the hitbox.
      (sprite.body as Phaser.Physics.Arcade.Body).setSize(200, 260).setOffset(54, 24);
    }

    // HP 条背景（位置适配 scale 0.13，精灵显示高约 40px，头顶约 y-20）
    const hpBarBg = this.scene.add.graphics();
    hpBarBg.fillStyle(0x1c2128, 1);
    hpBarBg.fillRect(-20, -25, 40, 5);
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
    hpBar.fillRect(-20, -25, 40 * pct, 5);
  }

  getEnemyGroup(): Phaser.Physics.Arcade.Group {
    return this.enemyGroup;
  }
}
