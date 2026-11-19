import Phaser from 'phaser';
import { Wuxing, WUXING_NAMES } from '@xiyou/shared';
import { WORLD_SIZE, WORLD_CENTER, ZONES, ZONE_RADIUS, ZONE_DISTANCE, WX_TINT } from '../../config/worldConfig.js';
import { Fx } from '../fx/Fx.js';

/** 背景层深度（全部低于按 y 排序的角色层） */
const D_GROUND = -100;
const D_GLOW = -90;
const D_DIAGRAM = -80;
const D_DECOR = -60;

function rgba(color: number, a: number): string {
  return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${a})`;
}

/**
 * 气脉区域的地表：
 *  - 墨色大地（程序化噪点贴图平铺）
 *  - 中央太极 + 八卦阵
 *  - 五行阵眼按相生顺序环列，地面刻有相生环与相克星
 *  - 各阵眼散布对应五行的地貌
 */
export class WorldBackdrop {
  private scene: Phaser.Scene;
  private taiji!: Phaser.GameObjects.Image;
  private bagua!: Phaser.GameObjects.Image;
  private zoneGlows: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    Fx.ensureTextures(scene);
    WorldBackdrop.ensureTextures(scene);
    this.build();
  }

  // ───────────────────────── 贴图 ─────────────────────────

  /** 生成地表 / 太极 / 八卦 / 地貌贴图（主菜单也会复用） */
  static ensureTextures(scene: Phaser.Scene): void {
    Fx.ensureTextures(scene);
    const tx = scene.textures;

    // 墨色地面（可平铺）
    if (!tx.exists('bg_ground')) {
      const s = 512;
      const c = tx.createCanvas('bg_ground', s, s)!;
      const ctx = c.getContext();
      ctx.fillStyle = '#101c21';
      ctx.fillRect(0, 0, s, s);
      // 平铺安全的斑驳：每个斑点在四周各画一份
      const blot = (x: number, y: number, r: number, col: string) => {
        for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
          const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
          g.addColorStop(0, col);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
        }
      };
      const rnd = new Phaser.Math.RandomDataGenerator(['wuji-ground']);
      for (let i = 0; i < 46; i++) {
        const light = rnd.frac() < 0.55;
        blot(rnd.between(0, s), rnd.between(0, s), rnd.between(40, 130),
          light ? `rgba(46,74,78,${rnd.realInRange(0.10, 0.22)})` : `rgba(0,0,0,${rnd.realInRange(0.18, 0.4)})`);
      }
      // 细碎墨点
      for (let i = 0; i < 900; i++) {
        const v = rnd.between(0, 255);
        ctx.fillStyle = v > 128 ? `rgba(120,160,160,${rnd.realInRange(0.02, 0.07)})` : `rgba(0,0,0,${rnd.realInRange(0.05, 0.2)})`;
        const d = rnd.between(1, 3);
        ctx.fillRect(rnd.between(0, s), rnd.between(0, s), d, d);
      }
      c.refresh();
    }

    // 太极
    if (!tx.exists('bg_taiji')) {
      const s = 512, r = 240, cx = s / 2, cy = s / 2;
      const c = tx.createCanvas('bg_taiji', s, s)!;
      const ctx = c.getContext();
      const light = 'rgba(214,226,224,0.92)';
      const dark = 'rgba(14,20,26,0.95)';
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = light;
      // 左阳右阴：白（阳）居左、鱼头在上，黑（阴）居右、鱼头在下，顺时针流转
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI / 2, Math.PI * 1.5); ctx.fill();
      ctx.fillStyle = light;
      ctx.beginPath(); ctx.arc(cx, cy - r / 2, r / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(cx, cy + r / 2, r / 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy - r / 2, r / 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = light;
      ctx.beginPath(); ctx.arc(cx, cy + r / 2, r / 7, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(212,168,83,0.9)';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, Math.PI * 2); ctx.stroke();
      c.refresh();
    }

    // 八卦环
    if (!tx.exists('bg_bagua')) {
      const s = 1024, cx = s / 2, cy = s / 2;
      const c = tx.createCanvas('bg_bagua', s, s)!;
      const ctx = c.getContext();
      ctx.strokeStyle = 'rgba(212,168,83,0.55)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 500, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, 340, 0, Math.PI * 2); ctx.stroke();
      // 先天八卦：乾南（上）坤北（下）离东（左）坎西（右）
      // 自上顺时针：乾 巽 坎 艮 坤 震 离 兑；1=阳爻 0=阴爻，由内（初爻）到外
      const trigrams = [[1, 1, 1], [0, 1, 1], [0, 1, 0], [0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1], [1, 1, 0]];
      trigrams.forEach((tri, i) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((i * Math.PI) / 4);
        ctx.fillStyle = 'rgba(232,206,140,0.8)';
        tri.forEach((yang, k) => {
          const y = -372 - k * 34;
          if (yang) {
            ctx.fillRect(-62, y - 9, 124, 18);
          } else {
            ctx.fillRect(-62, y - 9, 50, 18);
            ctx.fillRect(12, y - 9, 50, 18);
          }
        });
        ctx.restore();
      });
      c.refresh();
    }

    // 五行地貌小件
    WorldBackdrop.makeDecor(scene);
  }

  private static makeDecor(scene: Phaser.Scene): void {
    const tx = scene.textures;
    const make = (key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
      if (tx.exists(key)) return;
      const c = tx.createCanvas(key, w, h)!;
      draw(c.getContext());
      c.refresh();
    };

    // 金：晶簇
    make('decor_metal', 96, 96, ctx => {
      const shard = (x: number, w: number, h: number, a: number) => {
        ctx.save(); ctx.translate(x, 90); ctx.rotate(a);
        const g = ctx.createLinearGradient(0, 0, 0, -h);
        g.addColorStop(0, 'rgba(120,110,80,0.9)'); g.addColorStop(1, 'rgba(255,248,220,0.95)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(0, -h); ctx.lineTo(w, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -h); ctx.lineTo(w, 0); ctx.closePath(); ctx.fill();
        ctx.restore();
      };
      shard(34, 13, 70, -0.25); shard(52, 16, 86, 0.05); shard(70, 11, 56, 0.35);
    });
    // 木：草丛
    make('decor_wood', 96, 96, ctx => {
      ctx.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const x = 20 + i * 7;
        const lean = (i - 4) * 5 + (i % 2 ? 4 : -4);
        const h = 40 + ((i * 37) % 34);
        ctx.strokeStyle = i % 3 === 0 ? 'rgba(134,239,172,0.95)' : 'rgba(34,160,84,0.95)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(x, 92); ctx.quadraticCurveTo(x, 92 - h * 0.6, x + lean, 92 - h); ctx.stroke();
      }
    });
    // 水：水洼
    make('decor_water', 128, 64, ctx => {
      ctx.save(); ctx.translate(64, 32); ctx.scale(1, 0.46);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 60);
      g.addColorStop(0, 'rgba(120,190,255,0.75)'); g.addColorStop(0.7, 'rgba(40,100,200,0.55)'); g.addColorStop(1, 'rgba(20,60,140,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(210,235,255,0.7)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(-8, -6, 26, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();
      ctx.beginPath(); ctx.arc(6, 4, 42, Math.PI * 0.1, Math.PI * 0.6); ctx.stroke();
      ctx.restore();
    });
    // 火：熔痕
    make('decor_fire', 128, 96, ctx => {
      const g = ctx.createRadialGradient(64, 56, 0, 64, 56, 60);
      g.addColorStop(0, 'rgba(255,120,40,0.45)'); g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 96);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const crack = (pts: number[][], w: number, col: string) => {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.stroke();
      };
      const a = [[10, 60], [34, 50], [52, 62], [70, 44], [96, 58], [118, 46]];
      const b = [[52, 62], [60, 82], [80, 90]];
      const d = [[70, 44], [64, 22], [78, 8]];
      [a, b, d].forEach(p => { crack(p, 9, 'rgba(255,90,30,0.55)'); crack(p, 3.5, 'rgba(255,220,130,0.95)'); });
    });
    // 土：岩石
    make('decor_earth', 96, 80, ctx => {
      const rock = (pts: number[][], top: string, side: string) => {
        ctx.fillStyle = side; ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = top; ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]); ctx.lineTo(pts[1][0], pts[1][1]); ctx.lineTo(pts[2][0], pts[2][1]);
        ctx.lineTo((pts[2][0] + pts[0][0]) / 2, pts[2][1] + 16); ctx.closePath(); ctx.fill();
      };
      rock([[8, 60], [30, 22], [62, 30], [74, 62], [52, 76], [20, 76]], 'rgba(214,170,90,0.95)', 'rgba(110,82,44,0.95)');
      rock([[58, 66], [70, 44], [88, 50], [92, 70], [78, 78]], 'rgba(190,150,80,0.95)', 'rgba(92,68,38,0.95)');
    });
    // 通用：碎石
    make('decor_pebble', 48, 32, ctx => {
      ctx.fillStyle = 'rgba(70,86,90,0.9)';
      ctx.beginPath(); ctx.ellipse(16, 20, 13, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(34, 16, 9, 6, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(130,150,152,0.6)';
      ctx.beginPath(); ctx.ellipse(13, 17, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
    });
  }

  // ───────────────────────── 场景搭建 ─────────────────────────

  private build(): void {
    const s = this.scene;
    const C = WORLD_CENTER;

    // 界外虚空 + 地面
    s.add.tileSprite(C, C, WORLD_SIZE + 2400, WORLD_SIZE + 2400, 'bg_ground')
      .setTint(0x304048).setDepth(D_GROUND - 1);
    s.add.tileSprite(C, C, WORLD_SIZE, WORLD_SIZE, 'bg_ground').setDepth(D_GROUND);

    // 大尺度明暗：打破地面贴图的平铺感
    const rnd = new Phaser.Math.RandomDataGenerator(['wuji-patches']);
    for (let i = 0; i < 46; i++) {
      const dark = rnd.frac() < 0.6;
      s.add.image(rnd.between(0, WORLD_SIZE), rnd.between(0, WORLD_SIZE), 'fx_glow')
        .setTint(dark ? 0x000000 : 0x2f5a62)
        .setAlpha(dark ? rnd.realInRange(0.35, 0.6) : rnd.realInRange(0.25, 0.45))
        .setScale(rnd.realInRange(2.4, 5.5), rnd.realInRange(1.8, 4.5))
        .setRotation(rnd.realInRange(0, Math.PI))
        .setBlendMode(dark ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
        .setDepth(D_GROUND + 1);
    }

    // 中央本源之光
    s.add.image(C, C, 'fx_glow').setTint(0x9fd8ff).setAlpha(0.20)
      .setScale(1500 / 256).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW);

    // 五行阵眼光晕
    ZONES.forEach(z => {
      const glow = s.add.image(z.x, z.y, 'fx_glow').setTint(WX_TINT[z.wuxing]).setAlpha(0.34)
        .setScale((ZONE_RADIUS * 3.4) / 256).setBlendMode(Phaser.BlendModes.ADD).setDepth(D_GLOW);
      this.zoneGlows.push(glow);
      s.tweens.add({
        targets: glow, alpha: 0.22, duration: 2600 + Math.random() * 1200,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    });

    // 地面五行图：相生环（外圈）+ 相克星（内连线）
    const g = s.add.graphics().setDepth(D_DIAGRAM);
    g.lineStyle(5, 0xd4a853, 0.16);
    g.strokeCircle(C, C, ZONE_DISTANCE);
    g.lineStyle(2, 0xd4a853, 0.10);
    g.strokeCircle(C, C, ZONE_DISTANCE + 26);
    ZONES.forEach((z, i) => {
      const ke = ZONES[(i + 2) % 5]; // 隔位相克
      g.lineStyle(4, WX_TINT[z.wuxing], 0.13);
      g.lineBetween(z.x, z.y, ke.x, ke.y);
    });
    // 阵眼刻环
    ZONES.forEach(z => {
      g.lineStyle(5, WX_TINT[z.wuxing], 0.38);
      g.strokeCircle(z.x, z.y, ZONE_RADIUS);
      g.lineStyle(2, WX_TINT[z.wuxing], 0.22);
      g.strokeCircle(z.x, z.y, ZONE_RADIUS - 22);
    });

    // 阵眼大字
    ZONES.forEach(z => {
      s.add.text(z.x, z.y, WUXING_NAMES[z.wuxing], {
        fontFamily: '"Noto Serif SC", "Songti SC", serif',
        fontSize: '300px',
        fontStyle: 'bold',
        color: '#' + WX_TINT[z.wuxing].toString(16).padStart(6, '0'),
      }).setOrigin(0.5).setAlpha(0.13).setDepth(D_DIAGRAM);
    });

    // 太极八卦阵
    this.bagua = s.add.image(C, C, 'bg_bagua').setAlpha(0.5).setScale(0.62).setDepth(D_DIAGRAM);
    this.taiji = s.add.image(C, C, 'bg_taiji').setAlpha(0.42).setScale(0.62).setDepth(D_DIAGRAM + 1);

    this.scatterDecor();
    this.buildBorder();
    this.buildAmbientParticles();
  }

  private scatterDecor(): void {
    const s = this.scene;
    const rnd = new Phaser.Math.RandomDataGenerator(['wuji-decor']);
    const keyOf: Record<Wuxing, string> = {
      [Wuxing.METAL]: 'decor_metal',
      [Wuxing.WOOD]: 'decor_wood',
      [Wuxing.WATER]: 'decor_water',
      [Wuxing.FIRE]: 'decor_fire',
      [Wuxing.EARTH]: 'decor_earth',
    };

    ZONES.forEach(z => {
      const key = keyOf[z.wuxing];
      for (let i = 0; i < 30; i++) {
        const a = rnd.realInRange(0, Math.PI * 2);
        // 越靠近阵眼越密
        const r = Math.pow(rnd.frac(), 0.7) * ZONE_RADIUS * 1.5;
        const x = z.x + Math.cos(a) * r;
        const y = z.y + Math.sin(a) * r;
        if (x < 40 || y < 40 || x > WORLD_SIZE - 40 || y > WORLD_SIZE - 40) continue;
        const img = s.add.image(x, y, key).setOrigin(0.5, 0.9)
          .setScale(rnd.realInRange(0.55, 1.05)).setFlipX(rnd.frac() < 0.5)
          .setAlpha(rnd.realInRange(0.3, 0.6)).setDepth(D_DECOR);
        if (z.wuxing === Wuxing.FIRE || z.wuxing === Wuxing.METAL) {
          img.setBlendMode(Phaser.BlendModes.SCREEN);
        }
      }
    });

    // 全图碎石
    for (let i = 0; i < 150; i++) {
      s.add.image(rnd.between(60, WORLD_SIZE - 60), rnd.between(60, WORLD_SIZE - 60), 'decor_pebble')
        .setScale(rnd.realInRange(0.6, 1.4)).setAlpha(rnd.realInRange(0.35, 0.7))
        .setFlipX(rnd.frac() < 0.5).setDepth(D_DECOR - 1);
    }
  }

  /** 各阵眼的环境粒子：木=飘叶 火=火星 土=尘 金=闪光 水=水汽；中央太极升腾本源灵气 */
  private buildAmbientParticles(): void {
    const s = this.scene;
    const ADD = Phaser.BlendModes.ADD;
    type Cfg = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
    const per: Record<Wuxing, Cfg> = {
      [Wuxing.WOOD]:  { lifespan: 3600, speedX: { min: -40, max: 40 }, speedY: { min: 10, max: 45 }, scale: { start: 0.7, end: 0.2 }, alpha: { start: 0.8, end: 0 }, frequency: 150 },
      [Wuxing.FIRE]:  { lifespan: 1700, speedX: { min: -25, max: 25 }, speedY: { min: -150, max: -60 }, scale: { start: 0.8, end: 0 }, alpha: { start: 1, end: 0 }, frequency: 70 },
      [Wuxing.EARTH]: { lifespan: 3000, speedX: { min: 20, max: 70 }, speedY: { min: -12, max: 12 }, scale: { start: 0.6, end: 0.9 }, alpha: { start: 0.45, end: 0 }, frequency: 140 },
      [Wuxing.METAL]: { lifespan: 650, speed: 0, scale: { start: 0, end: 1.5, ease: 'Sine.easeOut' }, alpha: { start: 1, end: 0 }, frequency: 110 },
      [Wuxing.WATER]: { lifespan: 2600, speedX: { min: -14, max: 14 }, speedY: { min: -55, max: -20 }, scale: { start: 0.5, end: 1.0 }, alpha: { start: 0.6, end: 0 }, frequency: 110 },
    };
    ZONES.forEach(z => {
      s.add.particles(0, 0, 'fx_dot', {
        ...per[z.wuxing],
        tint: WX_TINT[z.wuxing],
        blendMode: ADD,
        emitZone: { type: 'random', source: new Phaser.Geom.Circle(z.x, z.y, ZONE_RADIUS * 1.05) } as Phaser.Types.GameObjects.Particles.EmitZoneData,
      }).setDepth(D_DECOR + 2);
    });
    // 太极阵
    s.add.particles(0, 0, 'fx_dot', {
      lifespan: 2800,
      speedY: { min: -70, max: -25 },
      speedX: { min: -12, max: 12 },
      scale: { start: 0.7, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: [0x9fd8ff, 0xffffff, 0xd4a853],
      frequency: 90,
      blendMode: ADD,
      emitZone: { type: 'random', source: new Phaser.Geom.Circle(WORLD_CENTER, WORLD_CENTER, 330) } as Phaser.Types.GameObjects.Particles.EmitZoneData,
    }).setDepth(D_DECOR + 2);
  }

  /** 气脉边界：金线界壁 + 向外渐隐的黑雾 */
  private buildBorder(): void {
    const s = this.scene;
    const W = WORLD_SIZE;
    const g = s.add.graphics().setDepth(D_DECOR + 5);
    // 界外压暗
    g.fillStyle(0x000000, 0.72);
    g.fillRect(-1200, -1200, W + 2400, 1200);
    g.fillRect(-1200, W, W + 2400, 1200);
    g.fillRect(-1200, 0, 1200, W);
    g.fillRect(W, 0, 1200, W);
    // 界壁
    g.lineStyle(10, 0xd4a853, 0.22);
    g.strokeRect(-5, -5, W + 10, W + 10);
    g.lineStyle(3, 0xffe9a8, 0.85);
    g.strokeRect(0, 0, W, W);
  }

  /** 每帧调用：缓慢旋转太极与八卦 */
  update(delta: number): void {
    this.taiji.rotation += delta * 0.00012;
    this.bagua.rotation -= delta * 0.00005;
  }

  /** 阵眼被净化 / 再度滋生时调整光晕 */
  setZoneActive(index: number, active: boolean): void {
    const glow = this.zoneGlows[index];
    if (!glow) return;
    glow.setScale(((active ? 3.4 : 2.2) * ZONE_RADIUS) / 256);
  }
}
