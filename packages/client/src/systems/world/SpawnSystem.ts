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

/** 5 波次 → 5 种五行，固定在地图各个区域 */
const WAVE_DEFINITIONS = [
  { wuxing: Wuxing.METAL, relX: 0.18, relY: 0.18 }, // 左上 - 金
  { wuxing: Wuxing.WOOD,  relX: 0.82, relY: 0.18 }, // 右上 - 木
  { wuxing: Wuxing.WATER, relX: 0.18, relY: 0.82 }, // 左下 - 水
  { wuxing: Wuxing.FIRE,  relX: 0.82, relY: 0.82 }, // 右下 - 火
  { wuxing: Wuxing.EARTH, relX: 0.50, relY: 0.10 }, // 上中 - 土
];

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

  /**
   * 每轮生成 5 波敌人，每波固定位置、固定五行属性，每波数量 = 轮数
   */
  spawnEnemies(worldW: number, worldH: number, round: number = 1): void {
    const playerState = gameState.getPlayerState();
    const scaling = playerState.monsterScaling ?? 0.3;
    const enemiesPerWave = round;

    WAVE_DEFINITIONS.forEach((waveDef, waveIdx) => {
      const centerX = worldW * waveDef.relX;
      const centerY = worldH * waveDef.relY;
      const wuxingColor = WUXING_COLORS[waveDef.wuxing];

      // 生成足够的怪物模板
      const templates = generateEnemies('normal', round, scaling, 0);

      for (let i = 0; i < enemiesPerWave; i++) {
        const base = templates[i % templates.length];

        // 克隆并赋予唯一 ID + 强制五行属性
        const combatant: Combatant = {
          ...base,
          id: `${base.id}_w${waveIdx}_${i}_r${round}`,
          attackWuxing:  { wuxing: waveDef.wuxing, level: round },
          defenseWuxing: { wuxing: waveDef.wuxing, level: round },
        };

        // 在波次中心周围均匀散布（环形排布）
        const angle = (i / enemiesPerWave) * Math.PI * 2;
        const radius = 120 + i * 20; // 小半径聚拢，避免叠在一起
        const x = Math.max(200, Math.min(worldW - 200, centerX + Math.cos(angle) * radius));
        const y = Math.max(200, Math.min(worldH - 200, centerY + Math.sin(angle) * radius));

        this.spawnEnemy(combatant, x, y, centerX, centerY, wuxingColor);
      }
    });
  }

  /** 清除地图上所有剩余敌人（换轮时调用） */
  clearAll(): void {
    this.entityManager.getAll().forEach(entity => {
      entity.hpBar?.destroy();
      entity.hpBarBg?.destroy();
      if (entity.sprite.active) entity.sprite.destroy();
    });
    this.entityManager.clear();
    this.enemyGroup.clear(); // 清空引用（不重复 destroy）
  }

  private spawnEnemy(
    combatant: Combatant,
    x: number,
    y: number,
    patrolCenterX: number,
    patrolCenterY: number,
    tintColor: number,
  ): void {
    const atlasKey = MONSTER_ATLAS_MAP[combatant.name];
    let sprite: Phaser.Physics.Arcade.Sprite;

    if (atlasKey && this.scene.textures.exists(atlasKey)) {
      sprite = this.scene.physics.add.sprite(x, y, atlasKey, 'character_idle_0');
      sprite.play(`${atlasKey}_idle`);
    } else {
      sprite = this.scene.physics.add.sprite(x, y, '__DEFAULT');
    }

    // 用五行颜色染色，使每波视觉上统一
    sprite.setTint(tintColor);
    sprite.setScale(0.13);
    sprite.setDepth(9);
    sprite.setCollideWorldBounds(true);
    if (sprite.body) {
      (sprite.body as Phaser.Physics.Arcade.Body).setSize(200, 260).setOffset(54, 24);
    }

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
      patrolCenterX,
      patrolCenterY,
      state: 'patrol',
      patrolTimer: 0,
      attackPhase: 'ready',
      attackPhaseTimer: 0,
      attackCurrentInterval: 1000,
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
