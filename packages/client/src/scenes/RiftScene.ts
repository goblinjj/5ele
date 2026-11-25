import Phaser from 'phaser';
import {
  Wuxing, WUXING_NAMES, GearItem, itemColor, itemCss, PlayerStats, RunPlayerInfo,
  RIFT_SIZE, RIFT_CENTER, MONSTERS, MonsterDef, MonsterTier, SpawnInfo, EnemyAttack, EnemyBoltSpawn,
  FIRE, DODGE, GUARD, PLAYER_BASE_SPEED, PICKUP_RADIUS, REVIVE_RADIUS, REVIVE_MS,
  wxMult, attackInterval, skillCd, skillLevel, SKILLS, SKILL_ORDER, SkillDef, skillCount, STRIKE_DELAY, SKILL_AIM_RANGE, LANCE_WIDTH, SkillId, skillRadius,
  computeStats, powerOf, WeaponForm, formOf, UNARMED_FORM, Energy, energyTotal, emptyEnergy, WX_ORDER,
  QI_START, qiGain, ORB_MAGNET, ORB_PICK, ORB_LIFE_MS, ORB_FADE_MS,
} from '@xiyou/shared';
import { GAME_HEIGHT, applyRenderScale } from '../config/gameConfig.js';
import { WX_TINT, PLAYER_SCALE, ENEMY_SCALE, ELITE_SCALE, BOSS_SCALE } from '../config/worldConfig.js';
import { Fx, FX_DEPTH } from '../systems/fx/Fx.js';
import { WorldBackdrop } from '../systems/world/WorldBackdrop.js';
import { MONSTER_ATLAS_MAP } from '../systems/world/SpawnSystem.js';
import { inputManager } from '../systems/input/InputManager.js';
import { net } from '../systems/net/Net.js';
import { sfx } from '../systems/audio/Sfx.js';
import { SANS, WX_CSS } from '../ui/kit.js';
import { DamageText } from '../systems/fx/DamageText.js';
import { Avatar } from '../systems/avatar/Avatar.js';
import { SkillShader, Live } from '../systems/fx/SkillShader.js';
import { ensureCharAnims } from '../systems/idle/IdleBattle.js';

const PLAYER_ATLAS = 'player_spirit';
/** 秘境镜头相对界面的缩放 */
const RIFT_ZOOM = 0.74;
/** 出招后的硬直（毫秒）：普通出手 / 施法 */
const ATTACK_LOCK = 320;
const CAST_LOCK = 460;
const FIRE_TINT = 0xff6a3c;
const TELE_COLOR = 0xff2a1a;
const TELE_EDGE = 0xffd0c0;
const TELE_DEPTH = -8;
/** 玩家身体判定半径 */
const BODY_R = 34;
/** 弹道：飞得快、转向有上限，接近直线才不飘 */
const BOLT_SPEED = 1850;
const BOLT_TURN = 9;
const BOLT_HIT_R = 48;
/** 远端实体按服务器时间回放，比最新快照晚这么多毫秒，用来吸收网络抖动 */
const INTERP_DELAY = 150;
/** 快照断档时最多外推这么久，之后原地等待 */
const MAX_EXTRAPOLATE = 150;

interface Sample {
  t: number;
  x: number;
  y: number;
}

/** 在采样缓冲里按时间取位置：区间内线性插值，超出最新样本则短暂外推 */
function sampleAt(buf: Sample[], t: number): Sample | null {
  const n = buf.length;
  if (!n) return null;
  if (t <= buf[0].t) return buf[0];
  for (let i = n - 1; i > 0; i--) {
    const a = buf[i - 1], b = buf[i];
    if (t >= a.t && t <= b.t) {
      const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
      return { t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
  }
  const last = buf[n - 1];
  if (n < 2) return last;
  const prev = buf[n - 2];
  const span = last.t - prev.t;
  if (span <= 0) return last;
  const ahead = Math.min(MAX_EXTRAPOLATE, t - last.t);
  return { t, x: last.x + ((last.x - prev.x) / span) * ahead, y: last.y + ((last.y - prev.y) / span) * ahead };
}

function pushSample(buf: Sample[], s: Sample): void {
  if (buf.length && buf[buf.length - 1].t >= s.t) return;
  buf.push(s);
  if (buf.length > 10) buf.shift();
}

interface CEnemy {
  id: number;
  def: MonsterDef;
  tier: MonsterTier;
  spr: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Image;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  burnFx: Phaser.GameObjects.Image;
  x: number;
  y: number;
  buf: Sample[];
  /** 受击后退的视觉偏移（只影响显示） */
  kx: number;
  ky: number;
  /** 程序动态：前倾、受击后仰、步伐相位 */
  lean: number;
  tilt: number;
  phase: number;
  hp: number;
  max: number;
  scale: number;
  flags: number;
  seen: number;
  anim: string;
  atkUntil: number;
}

interface Tele {
  a: EnemyAttack;
  end: number;
  start: number;
  fill: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  edge: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  /** 着色器版的预警（有它时 fill / edge 不显示） */
  sh: Live | null;
}

interface EBolt {
  b: EnemyBoltSpawn;
  x: number;
  y: number;
  life: number;
  img: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
  sh: Live | null;
}

interface MyBolt {
  /** 追踪的妖异；-1 = 直线飞 */
  target: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  core: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  scale: number;
}

/** 妖异残留的一团五行能量 */
interface Orb {
  id: number;
  wx: Wuxing;
  n: number;
  mt: MonsterTier;
  x: number;
  y: number;
  /** 落点（刚溃散时从妖异身上弹开） */
  tx: number;
  ty: number;
  age: number;
  /** 落地多久了（到时候就散） */
  life: number;
  speed: number;
  phase: number;
  glow: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
}

interface Mate {
  info: RunPlayerInfo;
  idx: number;
  spr: Avatar;
  shadow: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  hpBg: Phaser.GameObjects.Rectangle;
  hpFill: Phaser.GameObjects.Rectangle;
  reviveRing: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  buf: Sample[];
  f: number;
  a: number;
  hp: number;
  max: number;
  down: boolean;
}

export interface RunStartMsg {
  t: 'runStart';
  tier: number;
  you: string;
  players: RunPlayerInfo[];
}

export interface EndMsg {
  ok: boolean; ms: number; tier: number; kills: number[]; best: boolean; energy: Energy;
}

/**
 * 秘境：联机刷怪
 */
export class RiftScene extends Phaser.Scene {
  fx!: Fx;
  private dmgText!: DamageText;
  private backdrop!: WorldBackdrop;
  private offs: (() => void)[] = [];

  // 局内信息（HUD 读取）
  tier = 1;
  myIdx = 0;
  players: RunPlayerInfo[] = [];
  stats!: PlayerStats;
  /** 主修的那一行（没修炼是 null）：挨打时的克制、吸纳能量回多少灵力看它 */
  path: Wuxing | null = null;
  hp = 0;
  progress = 0;
  elapsed = 0;
  bossId = 0;
  ended: EndMsg | null = null;
  kills = 0;
  /** 本局吸纳的五行能量 */
  gained: Energy = emptyEnergy();
  /** 局内灵力：吸纳能量获得，放技能消耗 */
  qi = 0;
  /** 兵器的出手方式 */
  form: WeaponForm = UNARMED_FORM;
  private weapon: GearItem | null = null;
  /** 开局时的技能熟练度；-1 = 没学会 */
  skillLv = {} as Record<SkillId, number>;
  /** 本局携带的技能（对应界面上的技能键）与各自剩余的冷却 */
  slots: SkillId[] = [];
  skillCds: Partial<Record<SkillId, number>> = {};
  /** 磐石护体的剩余时间 */
  shieldT = 0;
  /** 护体期间所受伤害乘多少（由放的那门技能决定） */
  private shieldBlock = 1;
  private shader!: SkillShader;
  down = false;
  /** 完美闪避赐予的必暴出手 */
  critCharges = 0;

  // 冷却（毫秒，剩余）
  cdBolt = 0;
  cdDodge = 0;
  cdGuard = 0;

  // 本地角色
  private me!: Avatar;
  /** 人形纸娃娃的原点在脚下，逻辑坐标在身体中心 */
  private static readonly FOOT = 50;
  private meShadow!: Phaser.GameObjects.Image;
  private meAura!: Phaser.GameObjects.Image;
  private guardRing!: Phaser.GameObjects.Image;
  private x = RIFT_CENTER;
  private y = RIFT_CENTER;
  private facing = 1;
  private moveX = 0;
  private moveY = 0;
  private dashT = 0;
  private dashVx = 0;
  private dashVy = 0;
  private invuln = 0;
  /** 遁的无敌帧（只有它算完美闪避；救起后的无敌不算） */
  private dodgeWin = 0;
  private pdDone = false;
  private guardT = 0;
  /** 出招硬直：动作放完之前不能走动（御和遁可以打断） */
  private lockT = 0;
  private guardStart = -1e9;
  private animState = '';
  private castAnim = 0;
  private mateAtkT = new Map<number, number>();
  private sendMvT = 0;
  private sendHpT = 0;
  private hpDirty = false;
  private regenAcc = 0;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  /** 服务器时间 - 本地时间 的估计（取延迟最小的那次，并缓慢衰减以跟上漂移） */
  private clockOffset = NaN;
  private lastServerMs = 0;
  private hitSfxT = 0;
  private orbSfxT = 0;
  private lackT = 0;

  // 世界对象
  private enemies = new Map<number, CEnemy>();
  private teles: Tele[] = [];
  private ebolts: EBolt[] = [];
  private mybolts: MyBolt[] = [];
  private orbs = new Map<number, Orb>();
  private mates = new Map<number, Mate>();
  /** 我已经算进账的能量：万一同伴其实先捡到，好减回去 */
  private picked = new Map<number, { wx: Wuxing; n: number }>();

  constructor() {
    super({ key: 'RiftScene' });
  }

  init(data: { start: RunStartMsg }): void {
    const s = data.start;
    this.tier = s.tier;
    this.players = s.players;
    this.myIdx = Math.max(0, s.players.findIndex(p => p.id === s.you));
    const mine = s.players[this.myIdx];
    this.stats = mine.stats;
    this.path = mine.path;
    this.hp = this.stats.maxHp;
    this.progress = 0;
    this.elapsed = 0;
    this.bossId = 0;
    this.ended = null;
    this.kills = 0;
    this.gained = emptyEnergy();
    this.qi = Math.min(this.stats.qiMax, QI_START);
    this.weapon = mine.weapon ?? null;
    this.form = formOf(this.weapon);
    this.skillLv = Object.fromEntries(SKILL_ORDER.map(id => [id, skillLevel(mine.skills?.[id])])) as Record<SkillId, number>;
    this.slots = (mine.loadout ?? []).filter(id => this.skillLv[id] >= 0);
    this.skillCds = {};
    this.shieldT = 0;
    this.down = false;
    this.critCharges = 0;
    this.cdBolt = 400; this.cdDodge = 0; this.cdGuard = 0;
    const ang = (this.myIdx / Math.max(1, s.players.length)) * Math.PI * 2;
    this.x = RIFT_CENTER + Math.cos(ang) * 90;
    this.y = RIFT_CENTER + Math.sin(ang) * 90;
    this.facing = 1;
    this.lockT = 0;
    this.dashT = 0; this.invuln = 0; this.guardT = 0; this.guardStart = -1e9;
    this.enemies = new Map();
    this.teles = [];
    this.ebolts = [];
    this.mybolts = [];
    this.orbs = new Map();
    this.mates = new Map();
    this.animState = '';
    this.clockOffset = NaN;
    this.lastServerMs = 0;
  }

  create(): void {
    inputManager.reset();
    const cam = this.cameras.main;
    applyRenderScale(this, true);
    // 镜头拉远：人和妖异都小一些，一屏能看到更大一片战场
    cam.setZoom(cam.zoom * RIFT_ZOOM);
    cam.setBounds(-260, -260, RIFT_SIZE + 520, RIFT_SIZE + 520);
    cam.setBackgroundColor('#020406');

    this.fx = new Fx(this);
    this.dmgText = new DamageText(this);
    this.shader = new SkillShader(this);
    this.backdrop = new WorldBackdrop(this);
    this.createAnims();
    this.createMe();
    cam.startFollow(this.me, true, 0.14, 0.14, 0, -GAME_HEIGHT * 0.06);
    cam.fadeIn(500, 0, 0, 0);

    this.players.forEach((info, idx) => { if (idx !== this.myIdx) this.createMate(info, idx); });

    const kb = this.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,J,K,L') as Record<string, Phaser.Input.Keyboard.Key>;
      kb.on('keydown-SPACE', () => inputManager.pressDash());
      kb.on('keydown-J', () => inputManager.pressGuard());
      kb.on('keydown-K', () => inputManager.pressSkill(0));
      kb.on('keydown-L', () => inputManager.pressSkill(1));
    }

    this.offs = [
      net.on('snap', (m: any) => this.onSnap(m)),
      net.on('spawn', (m: { list: SpawnInfo[] }) => m.list.forEach(s => this.spawnEnemy(s))),
      net.on('die', (m: { id: number; by: number; orbs?: number[] }) => this.onDie(m.id, m.by, m.orbs)),
      net.on('orbGone', (m: { ids: number[]; by: number }) => this.onOrbGone(m.ids, m.by)),
      net.on('orbs', (m: { list: number[] }) => {
        for (let i = 0; i < m.list.length; i += 6) {
          this.addOrb(m.list[i], WX_ORDER[m.list[i + 3]], m.list[i + 4], m.list[i + 5] as MonsterTier, m.list[i + 1], m.list[i + 2], false);
        }
      }),
      net.on('qi', (m: { v: number }) => { this.qi = m.v; }),
      net.on('dmg', (m: { d: number[] }) => this.onDmg(m.d)),
      net.on('atk', (m: { a: EnemyAttack }) => this.onAttack(m.a)),
      net.on('bolts', (m: { list: EnemyBoltSpawn[] }) => m.list.forEach(b => this.spawnEBolt(b))),
      net.on('stag', (m: { id: number; ms: number; f?: 1 }) => this.onStagger(m.id, m.ms, m.f === 1)),
      net.on('cast', (m: { p: number; s: SkillId; x: number; y: number; e?: 1 }) => this.onRemoteCast(m.p, m.s, m.x, m.y, !!m.e)),
      net.on('boss', (m: { id: number }) => this.onBoss(m.id)),
      net.on('down', (m: { p: number }) => this.onDown(m.p)),
      net.on('up', (m: { p: number }) => this.onUp(m.p)),
      net.on('end', (m: EndMsg) => this.onEnd(m)),
      net.on('status', (st: string) => { if (st === 'offline' && !this.ended) this.onEnd({ ok: false, ms: this.elapsed, tier: this.tier, kills: [], best: false, energy: this.gained }); }),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.offs.forEach(f => f());
      this.offs = [];
      this.input.keyboard?.removeAllListeners();
      this.scene.stop('RiftHUDScene');
      inputManager.reset();
    });

    this.scene.launch('RiftHUDScene');
    this.scene.bringToTop('RiftHUDScene');
    sfx.roundStart();
    // 切场景期间漏掉的消息（开局的妖异、掉落）由服务器补发
    net.send({ t: 'ready' });
  }

  // ───────────────────────── 搭建 ─────────────────────────

  private createAnims(): void {
    ensureCharAnims(this, [PLAYER_ATLAS, ...Object.values(MONSTER_ATLAS_MAP)]);
  }

  private createMe(): void {
    const tint = this.path ? WX_TINT[this.path] : 0x9fd8ff;
    this.meAura = this.add.image(this.x, this.y, 'fx_glow').setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setScale(1.1).setAlpha(0.3).setDepth(-12);
    this.tweens.add({ targets: this.meAura, alpha: 0.16, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.meShadow = this.add.image(this.x, this.y, 'fx_shadow').setScale(PLAYER_SCALE * 3).setDepth(-11);
    this.guardRing = this.add.image(this.x, this.y, 'fx_ring').setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe9a8).setVisible(false).setDepth(FX_DEPTH - 4);
    const mine = this.players[this.myIdx];
    this.me = new Avatar(this, this.x, this.y + RiftScene.FOOT, { weapon: mine.weapon, path: mine.path, cult: mine.cult }, 1.15);
  }

  private createMate(info: RunPlayerInfo, idx: number): void {
    const ang = (idx / Math.max(1, this.players.length)) * Math.PI * 2;
    const x = RIFT_CENTER + Math.cos(ang) * 90;
    const y = RIFT_CENTER + Math.sin(ang) * 90;
    const tint = info.path ? WX_TINT[info.path] : 0x9fd8ff;
    const shadow = this.add.image(x, y, 'fx_shadow').setScale(PLAYER_SCALE * 3).setDepth(-11).setVisible(false);
    void tint;
    const spr = new Avatar(this, x, y + RiftScene.FOOT, { weapon: info.weapon, path: info.path, cult: info.cult }, 1.15);
    const name = this.add.text(x, y, info.name, {
      fontFamily: SANS, fontSize: '22px', fontStyle: 'bold', color: '#79c0ff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5, 1).setDepth(FX_DEPTH - 2);
    const hpBg = this.add.rectangle(x, y, 84, 10, 0x000000, 0.7).setDepth(FX_DEPTH - 2);
    const hpFill = this.add.rectangle(x, y, 80, 6, 0x3fb950, 1).setOrigin(0, 0.5).setDepth(FX_DEPTH - 1);
    const reviveRing = this.add.graphics().setDepth(FX_DEPTH - 3);
    this.mates.set(idx, { info, idx, spr, shadow, name, hpBg, hpFill, reviveRing, x, y, buf: [], f: 1, a: 0, hp: info.stats.maxHp, max: info.stats.maxHp, down: false });
  }

  // ───────────────────────── 网络消息 ─────────────────────────

  private onSnap(m: { e: number[]; p: (number | string)[]; prog: number; ms: number }): void {
    const now = this.time.now;
    this.progress = m.prog;
    this.elapsed = m.ms;
    this.lastServerMs = m.ms;
    const off = m.ms - now;
    this.clockOffset = Number.isNaN(this.clockOffset) ? off : Math.max(off, this.clockOffset - 3);
    const e = m.e;
    for (let i = 0; i < e.length; i += 5) {
      const en = this.enemies.get(e[i]);
      if (!en) continue;
      pushSample(en.buf, { t: m.ms, x: e[i + 1], y: e[i + 2] });
      en.hp = e[i + 3];
      en.flags = e[i + 4];
      en.seen = now;
    }
    const p = m.p;
    for (let i = 0; i < p.length; i += 8) {
      const idx = p[i] as number;
      if (idx === this.myIdx) continue;
      const mt = this.mates.get(idx);
      if (!mt) continue;
      pushSample(mt.buf, { t: m.ms, x: p[i + 1] as number, y: p[i + 2] as number });
      mt.f = p[i + 3] as number;
      mt.a = p[i + 4] as number;
      mt.hp = p[i + 5] as number;
      mt.max = p[i + 6] as number;
      mt.down = p[i + 7] === 1;
    }
    // 收不到快照的妖异（丢了死亡消息）清理掉
    for (const en of this.enemies.values()) {
      if (now - en.seen > 2000) this.removeEnemy(en, false);
    }
  }

  private spawnEnemy(s: SpawnInfo): void {
    if (this.enemies.has(s.id)) return;
    const def = MONSTERS[s.k];
    const atlas = MONSTER_ATLAS_MAP[s.tier === 2 ? '首领' : def.atlas];
    const has = !!atlas && this.textures.exists(atlas);
    const spr = has ? this.add.sprite(s.x, s.y, atlas, 'character_idle_0') : this.add.sprite(s.x, s.y, '__DEFAULT');
    const scale = s.tier === 2 ? BOSS_SCALE : s.tier === 1 ? ELITE_SCALE : ENEMY_SCALE;
    if (has) spr.play(`${atlas}_idle`);
    const tint = WX_TINT[def.wuxing];
    if (s.tier > 0 && spr.preFX) {
      spr.preFX.setPadding(24);
      spr.preFX.addGlow(s.tier === 2 ? 0xc9a0ff : tint, s.tier === 2 ? 4 : 3, 0, false, 0.1, 10);
    }
    const shadow = this.add.image(s.x, s.y, 'fx_shadow').setScale(scale * 3.1).setDepth(-20);
    const ring = this.add.image(s.x, s.y, 'fx_ring').setTint(tint).setScale(scale * 1.25, scale * 0.5).setAlpha(s.tier ? 0.95 : 0.55).setDepth(-19);
    if (s.tier) ring.setBlendMode(Phaser.BlendModes.ADD).setDepth(-18.5);
    const barW = s.tier === 2 ? 0 : s.tier === 1 ? 110 : 64;
    const hpBg = this.add.rectangle(s.x, s.y, barW + 4, 10, 0x000000, 0.7).setVisible(false);
    const hpFill = this.add.rectangle(s.x, s.y, barW, 6, tint, 1).setOrigin(0, 0.5).setVisible(false);
    const burnFx = this.add.image(s.x, s.y, 'fx_glow').setTint(FIRE_TINT).setBlendMode(Phaser.BlendModes.ADD).setScale(scale * 1.4).setAlpha(0).setVisible(false);

    const en: CEnemy = {
      id: s.id, def, tier: s.tier, spr, shadow, ring, hpBg, hpFill, burnFx,
      x: s.x, y: s.y, buf: [{ t: this.lastServerMs, x: s.x, y: s.y }], kx: 0, ky: 0, lean: 0, tilt: 0, phase: Math.random() * 6.28, hp: s.hp, max: s.max, scale, flags: 0, seen: this.time.now, anim: 'idle', atkUntil: 0,
    };
    spr.setAlpha(0).setScale(scale * 0.4);
    this.tweens.add({ targets: spr, alpha: 1, scale, duration: 320, ease: 'Back.easeOut' });
    this.fx.flashGlow(s.x, s.y, s.tier ? 220 : 90, tint, 420, 0.6);
    this.enemies.set(s.id, en);
  }

  private removeEnemy(en: CEnemy, animate: boolean): void {
    this.enemies.delete(en.id);
    this.teles = this.teles.filter(t => {
      if (t.a.id !== en.id) return true;
      t.fill.destroy(); t.edge.destroy(); this.shader.stop(t.sh);
      return false;
    });
    const destroy = () => {
      en.spr.destroy(); en.shadow.destroy(); en.ring.destroy(); en.hpBg.destroy(); en.hpFill.destroy(); en.burnFx.destroy();
    };
    en.hpBg.setVisible(false); en.hpFill.setVisible(false); en.burnFx.setVisible(false);
    if (!animate) { destroy(); return; }
    const atlas = MONSTER_ATLAS_MAP[en.tier === 2 ? '首领' : en.def.atlas];
    if (atlas && this.anims.exists(`${atlas}_die`)) en.spr.play(`${atlas}_die`, true);
    en.spr.setTintFill(0xffffff);
    this.time.delayedCall(70, () => { if (en.spr.active) en.spr.clearTint(); });
    this.tweens.add({ targets: en.spr, scale: en.scale * 1.22, duration: 90, yoyo: true, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: [en.spr, en.shadow, en.ring], alpha: 0, duration: 380, delay: 200, onComplete: destroy });
  }

  private onDie(id: number, by: number, orbs?: number[]): void {
    const en = this.enemies.get(id);
    if (!en) return;
    // 残留的能量从溃散处迸出
    if (orbs) {
      const count = orbs.length / 3;
      for (let i = 0; i < orbs.length; i += 3) {
        const ang = Math.random() * Math.PI * 2;
        const d = count > 1 ? 90 + Math.random() * 70 : 20 + Math.random() * 45;
        this.addOrb(orbs[i], WX_ORDER[orbs[i + 1]], orbs[i + 2], en.tier, en.x, en.y, true, en.x + Math.cos(ang) * d, en.y + Math.sin(ang) * d);
      }
    }
    const tint = WX_TINT[en.def.wuxing];
    this.fx.burst(en.x, en.y - 20, tint, en.tier ? 26 : 12);
    this.fx.ember(en.x, en.y, tint, en.tier ? 18 : 6, 40);
    if (en.tier === 2) {
      this.fx.shake(0.012, 500);
      this.fx.celebrate(en.x, en.y - 60, [0xc9a0ff, 0xffe9a8, FIRE_TINT, 0xffffff]);
      sfx.victory();
      this.bossId = 0;
    } else if (en.tier === 1) {
      this.fx.shake(0.006, 160);
    }
    sfx.enemyDie(en.def.wuxing, en.tier > 0);
    if (by === this.myIdx) this.kills++;
    this.removeEnemy(en, true);
  }

  private onDmg(d: number[]): void {
    for (let i = 0; i < d.length; i += 5) {
      const en = this.enemies.get(d[i]);
      if (!en) continue;
      const amt = d[i + 1], crit = d[i + 2] === 1, by = d[i + 3], burn = d[i + 4] === 1;
      en.hp = Math.max(0, en.hp - amt);
      const mine = by === this.myIdx;
      if (!mine && !burn) {
        const mt = this.mates.get(by);
        const last = this.mateAtkT.get(by) ?? 0;
        if (mt && this.time.now - last > 280) { this.mateAtkT.set(by, this.time.now); mt.spr.play('attack'); mt.spr.setFacing(en.x < mt.x ? -1 : 1); }
      }
      const top = en.y - 307 * en.scale * 0.42;
      if (burn) {
        if (mine) this.dmgText.show(en.x, top, `${amt}`, 0xff9a4a, 22, 50, 600);
        continue;
      }
      if (mine) {
        this.dmgText.show(en.x, top - 10, crit ? `${amt}!` : `${amt}`, crit ? 0xffd23c : 0xffffff, crit ? 46 : 30, crit ? 100 : 70, crit ? 800 : 650, crit);
        if (crit) {
          this.fx.shake(0.0025, 70);
          this.fx.flashGlow(en.x, en.y - 30, 90, 0xffd23c, 160, 0.7);
        }
      } else {
        this.dmgText.show(en.x, top, `${amt}`, 0x8b949e, 20, 50, 500);
      }
      if (mine) continue;
      // 同伴打中的：闪白 + 压扁
      en.spr.setTintFill(0xffffff);
      this.time.delayedCall(60, () => { if (en.spr.active) { en.spr.clearTint(); } });
      if (en.tier !== 2) this.fx.squash(en.spr, en.scale, 1.12, 0.88, 120);
    }
  }

  private onStagger(id: number, ms: number, frozen: boolean): void {
    const en = this.enemies.get(id);
    if (!en) return;
    if (frozen) {
      // 冻住：脚下一团寒光，持续到解冻
      this.teles = this.teles.filter(t => {
        if (t.a.id !== id) return true;
        t.fill.destroy(); t.edge.destroy(); this.shader.stop(t.sh);
        return false;
      });
      const ice = this.add.image(en.x, en.y - 10, 'fx_glow').setTint(0x8fd8ff).setBlendMode(Phaser.BlendModes.ADD).setScale(en.scale * 2.2).setAlpha(0.75).setDepth(FX_DEPTH - 9);
      this.tweens.add({ targets: ice, alpha: 0, duration: 300, delay: Math.max(0, ms - 300), onUpdate: () => ice.setPosition(en.x, en.y - 10), onComplete: () => ice.destroy() });
      return;
    }
    this.teles = this.teles.filter(t => {
      if (t.a.id !== id) return true;
      t.fill.destroy(); t.edge.destroy(); this.shader.stop(t.sh);
      return false;
    });
    this.fx.ring(en.x, en.y, 120, 0xffe9a8, 360);
    this.fx.floatText(en.x, en.y - 120, '破绽', '#ffe9a8', 28, 60, 800);
  }

  private onBoss(id: number): void {
    this.bossId = id;
    sfx.ominous();
    this.fx.shake(0.01, 400);
    (this.scene.get('RiftHUDScene') as any)?.banner?.('病变核心现身', '击破它，净化此重天', 0xc9a0ff);
  }

  private onDown(idx: number): void {
    if (idx === this.myIdx) {
      this.down = true;
      this.hp = 0;
      sfx.gameOver();
      this.me.setDown(true);
    } else {
      const mt = this.mates.get(idx);
      if (mt) mt.down = true;
    }
  }

  private onUp(idx: number): void {
    if (idx === this.myIdx) {
      this.down = false;
      this.hp = Math.round(this.stats.maxHp * 0.4);
      this.hpDirty = true;
      this.invuln = 1500;
      sfx.heal();
      this.fx.ring(this.x, this.y, 160, 0x3fb950, 500);
      this.me.setDown(false);
    } else {
      const mt = this.mates.get(idx);
      if (mt) mt.down = false;
    }
  }

  private onEnd(m: EndMsg): void {
    if (this.ended) return;
    this.ended = m;
    if (m.ok) sfx.victory(); else sfx.gameOver();
    (this.scene.get('RiftHUDScene') as any)?.showEnd?.(m);
  }

  // ───────────────────────── 敌方攻击 ─────────────────────────

  private onAttack(a: EnemyAttack): void {
    const en = this.enemies.get(a.id);
    const now = this.time.now;
    let fill: Tele['fill'];
    let edge: Tele['edge'];
    if (a.shape === 'lunge') {
      const rot = Math.atan2(a.dy, a.dx);
      fill = this.add.rectangle(a.x, a.y, a.len, a.r, TELE_COLOR, 1).setOrigin(0, 0.5).setRotation(rot).setAlpha(0.45).setScale(0.02, 1).setDepth(TELE_DEPTH);
      edge = this.add.rectangle(a.x, a.y, a.len, a.r, TELE_COLOR, 0.14).setOrigin(0, 0.5).setRotation(rot).setStrokeStyle(3, TELE_EDGE, 0.9).setDepth(TELE_DEPTH + 1);
    } else {
      const r = a.shape === 'bolt' ? Math.max(62, a.r) : a.r;
      const full = (r * 2) / 256;
      const y = a.shape === 'bolt' && en ? en.y : a.y;
      fill = this.add.image(a.x, y, 'fx_disc').setTint(a.shape === 'bolt' ? 0xff8a3c : TELE_COLOR).setScale(full * 0.05).setAlpha(0.5).setDepth(TELE_DEPTH);
      edge = this.add.image(a.x, y, 'fx_ring').setTint(TELE_EDGE).setScale(full * 1.06).setDepth(TELE_DEPTH + 1);
    }
    // 着色器版预警：细环、刻度、流动的箭纹；原来的色块只在着色器不可用时显示
    let sh: Live | null = null;
    if (this.shader.enabled) {
      const color = a.shape === 'bolt' ? 0xff9a4a : 0xff4a30;
      if (a.shape === 'lunge') {
        const rot = Math.atan2(a.dy, a.dx);
        sh = this.shader.play('warnLane', a.x + a.dx * a.len / 2, a.y + a.dy * a.len / 2, a.len, a.windup, TELE_DEPTH, rot, undefined, { sizeY: a.r, color });
      } else {
        sh = this.shader.play('warnCircle', fill.x, fill.y, (a.shape === 'bolt' ? Math.max(62, a.r) : a.r) * 2.22, a.windup, TELE_DEPTH, 0, undefined, { color });
      }
      fill.setVisible(false);
      edge.setVisible(false);
    }
    // 圆形的出手预警不画了：妖异自己有抬手的动作，看动作躲。冲锋的直线预警还留着（冲出去之前看不出往哪冲）
    if (a.shape !== 'lunge') {
      fill.setVisible(false);
      edge.setVisible(false);
      this.shader.stop(sh);
      sh = null;
    }
    this.teles.push({ a, start: now, end: now + a.windup, fill, edge, sh });

    if (en) {
      const atlas = MONSTER_ATLAS_MAP[en.tier === 2 ? '首领' : en.def.atlas];
      const anim = en.def.kind === 'caster' || a.shape === 'bolt' ? 'magic' : 'atk';
      if (atlas && this.anims.exists(`${atlas}_${anim}`)) {
        en.spr.play(`${atlas}_${anim}`, true);
        // 动作的发力点落在预警结束的那一刻：整段动作比前摇略长一点，收招留在后面
        const ms = en.spr.anims.currentAnim ? en.spr.anims.currentAnim.duration : 600;
        en.spr.anims.timeScale = ms / (a.windup + 160);
        en.anim = anim;
        en.atkUntil = now + a.windup + 160;
      }
      if (a.dx !== 0) en.spr.setFlipX(a.dx < 0);
      this.fx.stretchTo(en.spr, en.scale, 0.9, 1.1, a.windup);
    }
  }

  private updateTeles(): void {
    const now = this.time.now;
    this.teles = this.teles.filter(t => {
      const p = Math.min(1, (now - t.start) / Math.max(1, t.end - t.start));
      const flash = t.end - now < 130;
      if (t.fill instanceof Phaser.GameObjects.Rectangle) {
        t.fill.setScale(Math.max(0.02, p), 1).setAlpha(flash ? 0.9 : 0.4 + 0.3 * p);
      } else {
        const r = t.a.shape === 'bolt' ? Math.max(62, t.a.r) : t.a.r;
        const full = (r * 2) / 256;
        t.fill.setScale(full * Math.max(0.05, p)).setAlpha(flash ? 1 : 0.5 + 0.4 * p);
        (t.fill as Phaser.GameObjects.Image).setTint(flash ? 0xffffff : t.a.shape === 'bolt' ? 0xff8a3c : TELE_COLOR);
      }
      if (now < t.end) return true;
      t.fill.destroy();
      t.edge.destroy();
      this.shader.stop(t.sh);
      if (t.a.shape !== 'bolt') this.resolveStrike(t.a);
      return false;
    });
  }

  /** 预警结束的瞬间：自己在范围内就挨打（遁 / 御 在这里判定） */
  private resolveStrike(a: EnemyAttack): void {
    if (a.shape === 'circle') {
      if (this.shader.enabled) this.shader.play('impact', a.x, a.y, a.r * 2.3, 340, TELE_DEPTH + 1, 0, undefined, { color: WX_TINT[a.wx] });
      else this.fx.ring(a.x, a.y, a.r, TELE_EDGE, 260, 0.6);
      if (a.r >= 160) { sfx.slam(); this.fx.shake(0.004, 120); }
    }
    if (this.down || this.ended) return;
    let inside = false;
    if (a.shape === 'circle') {
      inside = (this.x - a.x) ** 2 + (this.y - a.y) ** 2 <= (a.r + BODY_R) ** 2;
    } else if (a.shape === 'lunge') {
      const rx = this.x - a.x, ry = this.y - a.y;
      const along = rx * a.dx + ry * a.dy;
      const perp = Math.abs(-rx * a.dy + ry * a.dx);
      inside = along >= -BODY_R && along <= a.len + BODY_R && perp <= a.r / 2 + BODY_R;
    }
    if (inside) this.takeHit(a.id, a.dmg, a.wx);
  }

  private spawnEBolt(b: EnemyBoltSpawn): void {
    sfx.enemyShoot();
    const tint = WX_TINT[b.wx];
    const img = this.add.image(b.x, b.y, 'fx_glow').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(0.42).setDepth(FX_DEPTH - 6);
    const core = this.add.image(b.x, b.y, 'fx_dot').setTint(0xffffff).setScale(2).setDepth(FX_DEPTH - 5);
    const eb: EBolt = { b, x: b.x, y: b.y, life: b.life, img, core, sh: null };
    // 着色器版弹道：亮芯拖尾焰
    if (this.shader.enabled) {
      eb.sh = this.shader.play('wisp', b.x, b.y, 130, b.life, FX_DEPTH - 6, Math.atan2(b.vy, b.vx), () => eb, { color: tint });
      img.setVisible(false);
      core.setVisible(false);
    }
    this.ebolts.push(eb);
  }

  private updateEBolts(dt: number): void {
    const sec = dt / 1000;
    this.ebolts = this.ebolts.filter(o => {
      o.x += o.b.vx * sec;
      o.y += o.b.vy * sec;
      o.life -= dt;
      o.img.setPosition(o.x, o.y);
      o.core.setPosition(o.x, o.y);
      let hit = false;
      if (!this.down && !this.ended && (o.x - this.x) ** 2 + (o.y - (this.y - 30)) ** 2 < (BODY_R + 24) ** 2) {
        hit = true;
        this.takeHit(o.b.src, o.b.dmg, o.b.wx);
      }
      if (hit || o.life <= 0 || o.x < 0 || o.y < 0 || o.x > RIFT_SIZE || o.y > RIFT_SIZE) {
        if (hit) this.fx.burst(o.x, o.y, WX_TINT[o.b.wx], 8);
        o.img.destroy();
        o.core.destroy();
        this.shader.stop(o.sh);
        return false;
      }
      return true;
    });
  }

  private takeHit(srcId: number, dmg: number, wx: Wuxing): void {
    if (this.invuln > 0) {
      // 遁的无敌帧内本该被击中：完美闪避（每次遁只算一次）
      if (this.dodgeWin > 0 && !this.pdDone) {
        this.pdDone = true;
        net.send({ t: 'pdodge' });
        this.critCharges = 4;
        this.fx.floatText(this.x, this.y - 150, '完美闪避', '#9fd8ff', 34, 80, 900);
        this.ghost();
        sfx.slowmoIn();
      }
      return;
    }
    if (this.guardT > 0) {
      if (this.time.now - this.guardStart <= GUARD.parryWindow) {
        net.send({ t: 'parry', id: srcId });
        sfx.parry();
        this.fx.ring(this.x, this.y, 180, 0xffe9a8, 360);
        this.fx.flashGlow(this.x, this.y - 30, 200, 0xffe9a8, 300, 0.9);
        this.fx.floatText(this.x, this.y - 150, '防反！', '#ffe9a8', 40, 90, 900);
        this.fx.shake(0.006, 140);
        this.cdGuard = 0;
        return;
      }
      sfx.block();
      dmg *= GUARD.blockMult;
      this.fx.ring(this.x, this.y, 110, 0xffe9a8, 240);
    }
    if (this.shieldT > 0) dmg *= this.shieldBlock;
    const mult = wxMult(wx, this.path);
    const amt = Math.max(1, Math.round(dmg * mult * (1 - this.stats.dr / 100)));
    this.hp = Math.max(0, this.hp - amt);
    this.hpDirty = true;
    this.me.hurt();
    // 身上留一道爪痕
    this.shader.play('claw', this.x, this.y - 45, 170, 300, FX_DEPTH - 2, Math.PI / 2 + (Math.random() - 0.5) * 1.2, undefined, { color: WX_TINT[wx] });
    this.dmgText.show(this.x, this.y - 120, `-${amt}`, mult > 1 ? 0xff4d4d : 0xff8a80, mult > 1 ? 36 : 28, 60, 700);
    sfx.playerHurt(mult > 1);
    this.fx.shake(mult > 1 ? 0.007 : 0.004, 110);
    if (this.hp <= 0) {
      net.send({ t: 'hp', hp: 0 });
      this.hpDirty = false;
    }
  }

  // ───────────────────────── 我方出手 ─────────────────────────

  private nearestEnemy(x: number, y: number, range: number, exclude?: number): CEnemy | null {
    let best: CEnemy | null = null;
    let bd = range * range;
    for (const en of this.enemies.values()) {
      if (en.id === exclude || en.hp <= 0) continue;
      const d = (en.x - x) ** 2 + (en.y - y) ** 2;
      if (d < bd) { bd = d; best = en; }
    }
    return best;
  }

  /** 妖异的身体半径（近战判定用） */
  private bodyR(en: CEnemy): number {
    return en.tier === 2 ? 110 : en.tier === 1 ? 50 : 30;
  }

  /** 兵器自动出手：器型决定是近战挥击还是远程弹道 */
  private updateAutoAttack(): void {
    // 站定了才出手；翻滚和格挡时也不出手
    if (this.cdBolt > 0 || this.down || this.dashT > 0 || this.guardT > 0 || Math.hypot(this.moveX, this.moveY) > 0.1) return;
    const form = this.form;
    // 近战要算上妖异的身体，否则贴着核心也够不着
    let target: CEnemy | null = null;
    let bd = Infinity;
    for (const en of this.enemies.values()) {
      if (en.hp <= 0) continue;
      const d = Math.hypot(en.x - this.x, en.y - this.y) - (form.melee ? this.bodyR(en) : 0);
      if (d <= form.range && d < bd) { bd = d; target = en; }
    }
    if (!target) return;
    this.cdBolt = attackInterval(form, this.stats);
    this.lockT = Math.min(ATTACK_LOCK, this.cdBolt);
    if (this.critCharges > 0) this.critCharges--;
    this.facing = target.x < this.x ? -1 : 1;
    this.me.setFacing(this.facing);
    if (form.melee) {
      this.swing(form, target);
      return;
    }
    const ox = this.x + this.facing * 20, oy = this.y - 60;
    const base = Math.atan2(target.y - 40 - oy, target.x - ox);
    for (let i = 0; i < form.bolts; i++) {
      const off = (i - (form.bolts - 1) / 2) * form.spread;
      // 兵器正中那发追踪目标，两侧的直线飞；空手的气劲不会拐弯
      this.fireBolt(ox, oy, base + off, off === 0 && this.weapon ? target.id : -1, form.bolts > 1 || !this.weapon ? 0.75 : 1, (form.range + 160) / BOLT_SPEED * 1000);
    }
    this.fx.flashGlow(ox + Math.cos(base) * 30, oy + Math.sin(base) * 30, 70, 0xffd27a, 120, 0.9);
    this.castAnim = 260;
    this.me.play('attack');
    sfx.shoot();
  }

  /** 近战挥击：扇面（剑 / 刃）或直线突刺（枪），扫中的一起结算 */
  private swing(form: WeaponForm, target: CEnemy): void {
    const ang = Math.atan2(target.y - this.y, target.x - this.x);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const hits: CEnemy[] = [];
    for (const en of this.enemies.values()) {
      if (en.hp <= 0) continue;
      const rx = en.x - this.x, ry = en.y - this.y;
      const r = this.bodyR(en);
      const d = Math.hypot(rx, ry);
      if (d - r > form.range) continue;
      let inside: boolean;
      if (form.arc > 0) {
        // 贴身的不看角度，免得绕到背后就砍不着
        inside = d < r + 50 || Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(ry, rx) - ang)) <= form.arc / 2;
      } else {
        const along = rx * dx + ry * dy;
        inside = along > -r && Math.abs(-rx * dy + ry * dx) <= form.width / 2 + r;
      }
      if (inside) hits.push(en);
    }
    if (!hits.includes(target)) hits.push(target);
    hits.sort((a, b) => (a.x - this.x) ** 2 + (a.y - this.y) ** 2 - (b.x - this.x) ** 2 - (b.y - this.y) ** 2);
    net.send({ t: 'swing', ids: hits.slice(0, 12).map(e => e.id) });

    const cx = this.x, cy = this.y - 40;
    if (form.arc > 0) {
      // 刀光：沿扇面排几道斩痕
      const n = form.kind === '剑' ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * (form.arc / (n + 0.5));
        this.fx.slash(cx + Math.cos(a) * form.range * 0.55, cy + Math.sin(a) * form.range * 0.55, a + Math.PI / 2, form.range * 1.15, 0xffe2a0);
      }
      this.fx.flashGlow(cx + dx * form.range * 0.5, cy + dy * form.range * 0.5, form.range * 0.8, FIRE_TINT, 150, 0.4);
      this.me.play('slash');
    } else {
      // 枪芒：一道贯穿的直线
      const beam = this.add.image(cx, cy, 'fx_bolt').setTint(0xffe2a0).setBlendMode(Phaser.BlendModes.ADD)
        .setOrigin(0, 0.5).setRotation(ang).setScale(0.2, 1.3).setDepth(FX_DEPTH - 5);
      this.tweens.add({ targets: beam, scaleX: (form.range + 40) / beam.width, duration: 80, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: beam, alpha: 0, scaleY: 0.3, delay: 80, duration: 160, onComplete: () => beam.destroy() });
      this.fx.flashGlow(cx + dx * form.range, cy + dy * form.range, 90, 0xffd27a, 160, 0.8);
      this.me.play('attack');
    }
    for (const en of hits) {
      const l = Math.hypot(en.x - this.x, en.y - this.y) || 1;
      this.hitFeedback(en, form.arc > 0 ? (en.x - this.x) / l : dx, form.arc > 0 ? (en.y - this.y) / l : dy, form.kind === '刃' ? 0.7 : 1.3);
      this.fx.burst(en.x, en.y - 30, FIRE_TINT, 5);
    }
    this.castAnim = 240;
    sfx.shoot();
    if (hits.length >= 3) this.fx.shake(0.003, 70);
  }

  private fireBolt(x: number, y: number, ang: number, target: number, scale: number, life: number): void {
    const core = this.add.image(x, y, 'fx_bolt').setTint(0xffe2a0).setBlendMode(Phaser.BlendModes.ADD)
      .setOrigin(0.85, 0.5).setScale(1.15 * scale, 0.9 * scale).setRotation(ang).setDepth(FX_DEPTH - 6);
    const glow = this.add.image(x, y, 'fx_glow').setTint(FIRE_TINT).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.42 * scale).setDepth(FX_DEPTH - 6);
    this.mybolts.push({ target, x, y, vx: Math.cos(ang) * BOLT_SPEED, vy: Math.sin(ang) * BOLT_SPEED, life, core, glow, scale });
  }

  private destroyBolt(b: MyBolt): void {
    b.core.destroy();
    b.glow.destroy();
  }

  private updateMyBolts(dt: number): void {
    const sec = dt / 1000;
    this.mybolts = this.mybolts.filter(b => {
      const t = b.target >= 0 ? this.enemies.get(b.target) : undefined;
      const speed = Math.hypot(b.vx, b.vy);
      if (t) {
        // 有限转向：大体直线飞，只修正一点点
        const want = Math.atan2(t.y - 40 - b.y, t.x - b.x);
        const cur = Math.atan2(b.vy, b.vx);
        const diff = Phaser.Math.Angle.Wrap(want - cur);
        const turn = Phaser.Math.Clamp(diff, -BOLT_TURN * sec, BOLT_TURN * sec);
        b.vx = Math.cos(cur + turn) * speed;
        b.vy = Math.sin(cur + turn) * speed;
      }
      b.x += b.vx * sec;
      b.y += b.vy * sec;
      b.life -= dt;
      b.core.setPosition(b.x, b.y).setRotation(Math.atan2(b.vy, b.vx));
      b.glow.setPosition(b.x, b.y);
      if (Math.random() < 0.5) this.fx.trail(b.x, b.y, FIRE_TINT, 1);

      // 先看原目标；目标没了或被甩开，就打沿途撞上的第一只
      let hit: CEnemy | null = null;
      if (t && (t.x - b.x) ** 2 + (t.y - 40 - b.y) ** 2 < BOLT_HIT_R ** 2) hit = t;
      if (!hit) {
        for (const en of this.enemies.values()) {
          if (en.hp <= 0) continue;
          const r = en.tier === 2 ? 110 : en.tier === 1 ? 64 : BOLT_HIT_R;
          if ((en.x - b.x) ** 2 + (en.y - 40 - b.y) ** 2 < r * r) { hit = en; break; }
        }
      }
      if (hit) {
        net.send({ t: 'hit', s: 'b', id: hit.id, x: Math.round(hit.x), y: Math.round(hit.y) });
        const ang = Math.atan2(b.vy, b.vx);
        this.fx.burst(b.x, b.y, FIRE_TINT, b.scale >= 1 ? 10 : 6);
        this.fx.slash(b.x, b.y, ang + (Math.random() - 0.5) * 0.8, b.scale >= 1 ? 150 : 100, 0xffc06a);
        this.hitFeedback(hit, Math.cos(ang), Math.sin(ang), b.scale >= 1 ? 1 : 0.6);
        if (this.form.splash) this.fx.flashGlow(b.x, b.y, FIRE.splashRadius, FIRE_TINT, 180, 0.55);
        this.destroyBolt(b);
        return false;
      }
      if (b.life <= 0) {
        this.fx.burst(b.x, b.y, FIRE_TINT, 3);
        this.destroyBolt(b);
        return false;
      }
      return true;
    });
  }

  /** 命中的手感在本地立刻给出（闪白、压扁、音效），伤害数字等服务器结算 */
  private hitFeedback(en: CEnemy, dx: number, dy: number, power: number): void {
    // 后退：核心几乎不动，魁首退得少
    const push = (en.tier === 2 ? 4 : en.tier === 1 ? 9 : 18) * power;
    en.kx += dx * push;
    en.ky += dy * push;
    // 受击后仰：朝飞来方向的反向歪一下
    en.tilt += (dx >= 0 ? 1 : -1) * (en.tier === 2 ? 0.04 : 0.22) * power;
    en.spr.setTintFill(0xffffff);
    this.time.delayedCall(60, () => { if (en.spr.active) { en.spr.clearTint(); } });
    if (en.tier !== 2) this.fx.squash(en.spr, en.scale, 1.12, 0.88, 120);
    const now = this.time.now;
    if (now - this.hitSfxT > 70) {
      this.hitSfxT = now;
      const m = wxMult(this.weapon?.wuxing, en.def.wuxing);
      sfx.hit(m > 1, m < 1);
    }
  }

  /** 技能冷却总长与剩余（HUD 也用） */
  cdOf(id: SkillId): number {
    return skillCd(id, this.stats, this.skillLv[id]);
  }
  cdLeft(id: SkillId): number {
    return this.skillCds[id] ?? 0;
  }

  /** 学会了才放得出 */
  private knows(id: SkillId): boolean {
    if (this.skillLv[id] >= 0) return true;
    const now = this.time.now;
    if (now - this.lackT > 900) {
      this.lackT = now;
      this.fx.floatText(this.x, this.y - 150, `尚未学会${SKILLS[id].name} · 回营地修习`, '#9fd8ff', 26, 60, 1000);
    }
    return false;
  }

  /** 灵力够不够放；不够就提示一声（别刷屏） */
  private spendQi(cost: number): boolean {
    if (this.qi >= cost) { this.qi -= cost; return true; }
    const now = this.time.now;
    if (now - this.lackT > 900) {
      this.lackT = now;
      this.fx.floatText(this.x, this.y - 150, '灵力不足 · 去吸纳妖异残留的能量', '#9fd8ff', 26, 60, 1000);
      sfx.shapeFail();
    }
    return false;
  }

  /** 施放一门带在身上的技能：本地立刻给出表现，伤害由服务器结算 */
  private cast(id: SkillId | undefined): void {
    if (!id || this.down || this.cdLeft(id) > 0 || !this.knows(id) || !this.spendQi(SKILLS[id].qi)) return;
    const def = SKILLS[id];
    this.skillCds[id] = this.cdOf(id);
    let tx = this.x, ty = this.y;
    if (def.kind === 'strike' || def.kind === 'zone') {
      // 落向妖异最密集处
      let best: CEnemy | null = null;
      let bestN = -1;
      const R2 = SKILL_AIM_RANGE ** 2;
      for (const en of this.enemies.values()) {
        if (en.hp <= 0 || (en.x - this.x) ** 2 + (en.y - this.y) ** 2 > R2) continue;
        let n = en.tier === 2 ? 4 : en.tier === 1 ? 2 : 0;
        for (const o of this.enemies.values()) if ((o.x - en.x) ** 2 + (o.y - en.y) ** 2 < 200 ** 2) n++;
        if (n > bestN) { bestN = n; best = en; }
      }
      tx = best ? best.x : this.x + this.facing * 300;
      ty = best ? best.y : this.y;
    } else if (def.kind === 'lance') {
      // 朝最近的妖异打出去；没有就朝面前
      const t = this.nearestEnemy(this.x, this.y, def.radius + 160);
      const ang = t ? Math.atan2(t.y - this.y, t.x - this.x) : this.facing > 0 ? 0 : Math.PI;
      tx = this.x + Math.cos(ang) * def.radius;
      ty = this.y + Math.sin(ang) * def.radius;
      this.facing = Math.cos(ang) < 0 ? -1 : 1;
      this.me.setFacing(this.facing);
    }
    net.send({ t: 'cast', s: id, x: Math.round(tx), y: Math.round(ty) });
    this.drawSkill(id, tx, ty, true);
    if (def.heal > 0) this.healBy(def.heal);
    if (def.kind === 'guard') { this.shieldT = def.ms; this.shieldBlock = def.block; }
    this.castAnim = 400;
    this.lockT = CAST_LOCK;
    this.me.play('cast');
  }

  private healBy(pct: number): void {
    if (this.down) return;
    const n = Math.ceil(this.stats.maxHp * pct);
    this.hp = Math.min(this.stats.maxHp, this.hp + n);
    this.hpDirty = true;
    this.dmgText.show(this.x, this.y - 130, `+${n}`, 0x6ee7a0, 34, 80, 900);
    sfx.heal();
  }

  /** 技能的画面表现：着色器是主体，贴图粒子、震屏、音效是点缀；着色器不可用时只剩后者 */
  /**
   * 画一门技能。招式只有八种路数，每种一套画法，颜色跟技能的五行走
   * （着色器各有本色：火 / 冰 / 木 / 土 / 金，别的五行借来用时染成自己的颜色）。
   * @param x,y 落点（以自身为圆心的就是人的位置）
   * @param who 同伴放的：他在哪儿（护罩、回春跟着他走）
   */
  private drawSkill(id: SkillId, x: number, y: number, mine: boolean, who?: { x: number; y: number }, lv: number = this.skillLv[id]): void {
    const def: SkillDef | undefined = SKILLS[id];
    if (!def) return;
    // 范围随熟练度成长；同伴的技能按对方开局时的熟练度画
    const R = skillRadius(id, lv, mine ? this.stats : { area: 0 });
    const tint = WX_TINT[def.wuxing];
    const sh = this.shader;
    const lite = !sh.enabled;
    const dye = (native: Wuxing) => (def.wuxing === native ? undefined : { color: tint });
    const from = mine ? { x: this.x, y: this.y } : who ? { x: who.x, y: who.y } : { x, y };
    const follow = mine ? () => ({ x: this.x, y: this.y - 30 }) : who ? () => ({ x: who.x, y: who.y - 30 }) : undefined;
    const few = mine ? 1 : 0.5;
    if (mine) sfx.skill(def.wuxing);

    switch (def.kind) {
      case 'nova': {
        const cold = def.wuxing === Wuxing.WATER;
        sh.play(cold ? 'frost' : 'fire', x, y, R * 2.25, cold ? 1000 : 620, FX_DEPTH - 7, 0, undefined, dye(cold ? Wuxing.WATER : Wuxing.FIRE));
        if (lite) { this.fx.ring(x, y, R, tint, 460, 0.1); this.fx.ring(x, y, R * 0.7, 0xffffff, 380, 0.1); }
        this.fx.radial(x, y, R, tint, Math.round(10 * few));
        this.fx.flashGlow(x, y, R * 0.5, tint, 260, lite ? 0.4 : 0.12);
        break;
      }
      case 'strike': {
        const mark = this.add.image(x, y, 'fx_ring').setTint(tint).setScale((R * 2) / 256).setAlpha(0).setDepth(TELE_DEPTH);
        this.tweens.add({ targets: mark, alpha: 0.7, duration: 200 });
        const rock = this.add.image(x - 220, y - 700, 'fx_glow').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setDepth(FX_DEPTH);
        this.tweens.add({
          targets: rock, x, y, duration: STRIKE_DELAY, ease: 'Quad.easeIn',
          onUpdate: () => this.fx.trail(rock.x, rock.y, tint, 1),
          onComplete: () => {
            rock.destroy();
            mark.destroy();
            sh.play('blast', x, y, R * 2.4, 560, FX_DEPTH - 6, 0, undefined, dye(Wuxing.FIRE));
            this.fx.flashGlow(x, y, R * 0.6, tint, 280, lite ? 0.5 : 0.2);
            if (lite) this.fx.ring(x, y, R, tint, 420, 0.2);
            this.fx.radial(x, y, R, tint, Math.round(12 * few));
            if (mine) { sfx.slam(); this.fx.shake(0.003, 100); }
          },
        });
        break;
      }
      case 'blades': {
        // 从头顶散开，分袭最近的几只
        const count = skillCount(id, lv);
        const targets = [...this.enemies.values()].filter(e => e.hp > 0 && (e.x - x) ** 2 + (e.y - y) ** 2 < (R + 60) ** 2)
          .sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - (b.x - x) ** 2 - (b.y - y) ** 2).slice(0, count);
        this.fx.flashGlow(x, y - 60, 80, tint, 200, 0.3);
        if (lite) this.fx.ring(x, y, 160, tint, 300, 0.2);
        for (let i = 0; i < count; i++) {
          const en = targets.length ? targets[i % targets.length] : null;
          this.time.delayedCall(60 + i * 70, () => {
            const ang0 = (i / count) * Math.PI * 2;
            const ex = en?.spr.active ? en.x : x + Math.cos(ang0) * 300;
            const ey = en?.spr.active ? en.y - 40 : y + Math.sin(ang0) * 300;
            const sx = x, sy = y - 70;
            const ang = Math.atan2(ey - sy, ex - sx);
            const len = Math.hypot(ex - sx, ey - sy) + 160;
            sh.play('blade', (sx + ex) / 2, (sy + ey) / 2, len, 300, FX_DEPTH - 5, ang, undefined, dye(Wuxing.METAL));
            if (lite) this.fx.slash((sx + ex) / 2, (sy + ey) / 2, ang, len, tint);
            this.time.delayedCall(150, () => {
              this.fx.burst(ex, ey, tint, 4);
              this.fx.slash(ex, ey, ang + 1.2, 80, 0xffffff);
              if (en?.spr.active && mine) this.hitFeedback(en, Math.cos(ang), Math.sin(ang), 1.4);
            });
          });
        }
        break;
      }
      case 'lance': {
        const ang = Math.atan2(y - from.y, x - from.x);
        const len = def.radius;
        const mx = from.x + Math.cos(ang) * len / 2, my = from.y - 40 + Math.sin(ang) * len / 2;
        sh.play('blade', mx, my, len * 1.15, 380, FX_DEPTH - 5, ang, undefined, { ...dye(Wuxing.METAL), sizeY: LANCE_WIDTH * 3 });
        this.fx.slash(mx, my, ang, len, tint);
        this.fx.flashGlow(from.x, from.y - 40, 70, tint, 200, 0.3);
        for (let i = 1; i <= 4; i++) this.time.delayedCall(i * 40, () => this.fx.burst(from.x + Math.cos(ang) * len * i / 4, from.y - 40 + Math.sin(ang) * len * i / 4, tint, 3));
        break;
      }
      case 'zone': {
        // 一片留在地上的区域：边界一直亮着，里面随跳伤一下下闪
        const cold = def.wuxing !== Wuxing.FIRE;
        sh.play(cold ? 'frost' : 'fire', x, y, R * 2.25, Math.min(def.ms, 1600), FX_DEPTH - 8, 0, undefined, dye(cold ? Wuxing.WATER : Wuxing.FIRE));
        const edge = this.add.image(x, y, 'fx_ring').setTint(tint).setScale((R * 2) / 256).setAlpha(0.55).setBlendMode(Phaser.BlendModes.ADD).setDepth(TELE_DEPTH);
        const fill = this.add.image(x, y, 'fx_disc').setTint(tint).setScale((R * 2) / 256).setAlpha(0.07).setDepth(TELE_DEPTH - 1);
        this.tweens.add({ targets: fill, alpha: 0.16, duration: 250, yoyo: true, repeat: Math.max(0, Math.floor(def.ms / 500) - 1) });
        this.tweens.add({ targets: [edge, fill], alpha: 0, duration: 300, delay: def.ms, onComplete: () => { edge.destroy(); fill.destroy(); } });
        this.time.addEvent({ delay: 500, repeat: Math.max(0, Math.floor(def.ms / 500) - 1), callback: () => this.fx.radial(x, y, R * 0.8, tint, Math.round(4 * few)) });
        break;
      }
      case 'heal': {
        sh.play('bloom', x, y, R * 2.25, 950, FX_DEPTH - 8, 0, follow ? () => { const p = follow(); return { x: p.x, y: p.y + 30 }; } : undefined, dye(Wuxing.WOOD));
        if (lite) this.fx.ring(x, y, R, tint, 520, 0.15);
        this.fx.ember(x, y, tint, Math.round(8 * few), R * 0.7);
        this.fx.flashGlow(x, y - 30, 90, tint, 360, 0.2);
        break;
      }
      case 'guard': {
        // 震地一下，然后护罩跟着人走到时间结束
        this.fx.ring(x, y, R, tint, 360, 0.08);
        this.fx.radial(x, y, R, tint, Math.round(8 * few));
        sh.play('bastion', x, y - 30, 200, def.ms, FX_DEPTH - 4, 0, follow, dye(Wuxing.EARTH));
        if (lite && follow) {
          const dome = this.add.image(x, y - 30, 'fx_ring').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(0.85).setAlpha(0.8).setDepth(FX_DEPTH - 4);
          this.tweens.add({ targets: dome, alpha: 0.35, duration: 500, yoyo: true, repeat: Math.max(0, Math.floor(def.ms / 1000) - 1), onUpdate: () => { const p = follow(); dome.setPosition(p.x, p.y); }, onComplete: () => dome.destroy() });
        }
        if (mine) sfx.slam();
        break;
      }
      case 'buff': {
        // 一圈光从脚下升起，然后身上一直带着淡淡的气焰
        this.fx.ring(x, y, 120, tint, 420, 0.1);
        this.fx.flashGlow(x, y - 50, 120, tint, 420, 0.35);
        this.fx.ember(x, y, tint, Math.round(10 * few), 60);
        if (follow) {
          const aura = this.add.image(x, y - 30, 'fx_glow').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(0.75).setAlpha(0.3).setDepth(FX_DEPTH - 9);
          this.tweens.add({ targets: aura, alpha: 0.14, duration: 500, yoyo: true, repeat: Math.max(0, Math.floor(def.ms / 1000) - 1), onUpdate: () => { const p = follow(); aura.setPosition(p.x, p.y - 20); }, onComplete: () => aura.destroy() });
        }
        if (mine) this.fx.floatText(x, y - 160, `${def.name} · 攻击 +${Math.round(def.atk * 100)}%`, WX_CSS[def.wuxing], 26, 60, 1000);
        break;
      }
    }
  }

  /** @param extra 连落几击里后面的那几击：施放者自己也要画 */
  private onRemoteCast(p: number, id: SkillId, x: number, y: number, extra: boolean): void {
    if (p === this.myIdx) {
      if (extra) this.drawSkill(id, x, y, true);
      return;
    }
    const def = SKILLS[id];
    if (!def) return;
    const mt = this.mates.get(p);
    const lv = skillLevel(mt?.info.skills?.[id]);
    if (!extra) mt?.spr.play('cast');
    this.drawSkill(id, x, y, false, mt, lv);
    // 同伴的回复类技能：自己在范围内也回一口
    if (def.mateHeal > 0 && (this.x - x) ** 2 + (this.y - y) ** 2 < skillRadius(id, lv, { area: 0 }) ** 2) this.healBy(def.mateHeal);
  }

  // ───────────────────────── 五行能量 ─────────────────────────

  private addOrb(id: number, wx: Wuxing, n: number, mt: MonsterTier, x: number, y: number, pop: boolean, tx: number = x, ty: number = y): void {
    if (this.orbs.has(id) || !wx) return;
    const tint = WX_TINT[wx];
    const big = mt > 0;
    const glow = this.add.image(x, y, 'fx_glow').setTint(tint).setBlendMode(Phaser.BlendModes.ADD).setScale(big ? 0.34 : 0.2).setAlpha(0.85).setDepth(FX_DEPTH - 8);
    const core = this.add.image(x, y, 'fx_dot').setTint(0xffffff).setBlendMode(Phaser.BlendModes.ADD).setScale(big ? 2.6 : 1.6).setDepth(FX_DEPTH - 8);
    this.orbs.set(id, {
      id, wx, n, mt, x, y,
      tx: Phaser.Math.Clamp(tx, 90, RIFT_SIZE - 90), ty: Phaser.Math.Clamp(ty, 90, RIFT_SIZE - 90),
      age: pop ? 0 : 1000, life: 0, speed: 0, phase: Math.random() * 6.28, glow, core,
    });
  }

  /** 能量先从溃散处弹开落定，靠近了被吸向自己，贴身即吸纳 */
  private updateOrbs(dt: number): void {
    const sec = dt / 1000;
    const now = this.time.now;
    const canPick = !this.down && !this.ended;
    const magnet2 = ORB_MAGNET ** 2;
    const skip = net.profile?.skip ?? [];
    // 组队时：带回已满就不跟同伴抢了；谁离得近谁捡
    const party = this.mates.size > 0;
    const full = party && energyTotal(this.gained) >= this.stats.carry;
    for (const o of this.orbs.values()) {
      o.age += dt;
      o.life += dt;
      if (o.life > ORB_LIFE_MS) { this.orbs.delete(o.id); o.glow.destroy(); o.core.destroy(); continue; }
      // 设了不捡的：留在地上，压暗
      const skipped = skip.includes(o.wx);
      if (o.age < 260) {
        const k = 1 - Math.exp(-dt / 70);
        o.x += (o.tx - o.x) * k;
        o.y += (o.ty - o.y) * k;
      } else if (canPick && !skipped && !full) {
        const dx = this.x - o.x, dy = this.y - 30 - o.y;
        const d2 = dx * dx + dy * dy;
        // 有同伴离它更近：让给他（已经在往我这儿飞的不算）
        if (party && o.speed <= 0 && d2 < magnet2) {
          let closer = false;
          for (const m of this.mates.values()) if (m.hp > 0 && (m.x - o.x) ** 2 + (m.y - 30 - o.y) ** 2 < d2 - 400) { closer = true; break; }
          if (closer) { this.drawOrb(o, now, skipped); continue; }
        }
        if (d2 < ORB_PICK ** 2) { this.collectOrb(o); continue; }
        if (d2 < magnet2 || o.speed > 0) {
          // 一旦被吸住就越飞越快，不会半路掉下
          o.speed = Math.min(1900, Math.max(520, o.speed) + 3200 * sec);
          const d = Math.sqrt(d2) || 1;
          const step = Math.min(d, o.speed * sec);
          o.x += (dx / d) * step;
          o.y += (dy / d) * step;
          if (Math.random() < 0.3) this.fx.trail(o.x, o.y, WX_TINT[o.wx], 1);
        }
      }
      this.drawOrb(o, now, skipped);
    }
  }

  /** 能量团的位置与明暗：设了不捡的压暗，快散的时候慢慢淡掉 */
  private drawOrb(o: Orb, now: number, skipped: boolean): void {
    const bob = o.speed > 0 ? 0 : Math.sin(now / 320 + o.phase) * 5;
    const fade = Phaser.Math.Clamp((ORB_LIFE_MS - o.life) / ORB_FADE_MS, 0, 1);
    o.glow.setPosition(o.x, o.y - 14 + bob).setAlpha((skipped ? 0.18 : 0.65 + 0.25 * Math.sin(now / 200 + o.phase)) * fade);
    o.core.setPosition(o.x, o.y - 14 + bob).setAlpha(fade);
  }

  /** 地上的能量没了：被同伴捡走，或放太久散了 */
  private onOrbGone(ids: number[], by: number): void {
    for (const id of ids) {
      const o = this.orbs.get(id);
      if (o) {
        this.orbs.delete(id);
        const parts = [o.glow, o.core];
        this.tweens.add({ targets: parts, alpha: 0, scale: 0.02, duration: 220, onComplete: () => parts.forEach(q => q.destroy()) });
        continue;
      }
      // 我以为捡到了，其实同伴先一步：把多记的那份减回去
      const mine = this.picked.get(id);
      if (mine && by !== this.myIdx) this.gained[mine.wx] = Math.max(0, this.gained[mine.wx] - mine.n);
      this.picked.delete(id);
    }
  }

  private collectOrb(o: Orb): void {
    this.orbs.delete(o.id);
    o.glow.destroy();
    o.core.destroy();
    net.send({ t: 'orb', id: o.id });
    // 一局能带回的能量有上限：满了之后只化灵力
    const room = this.stats.carry - energyTotal(this.gained);
    const n = Math.max(0, Math.min(o.n, room));
    this.gained[o.wx] += n;
    this.picked.set(o.id, { wx: o.wx, n });
    if (this.picked.size > 80) this.picked.delete(this.picked.keys().next().value as number);
    if (room > 0 && room - n <= 0) {
      (this.scene.get('RiftHUDScene') as any)?.banner?.('能量已满', '再吸纳的只化作灵力 · 提升修为可带回更多', 0xe3b23c);
    }
    const qi = qiGain(this.path, o.wx, o.mt);
    this.qi = Math.min(this.stats.qiMax, this.qi + qi);
    const tint = WX_TINT[o.wx];
    this.fx.flashGlow(this.x, this.y - 30, o.mt ? 110 : 60, tint, 200, 0.6);
    if (o.mt) {
      this.fx.ring(this.x, this.y, 110, tint, 320);
      if (n > 0) this.fx.floatText(this.x, this.y - 150, `${WUXING_NAMES[o.wx]} +${n}`, WX_CSS[o.wx], 28, 70, 900);
    }
    const now = this.time.now;
    if (now - this.orbSfxT > 90) { this.orbSfxT = now; sfx.pickup(o.wx); }
  }

  // ───────────────────────── 每帧 ─────────────────────────

  update(_t: number, rawDelta: number): void {
    const dt = Math.min(50, rawDelta);
    this.cdBolt = Math.max(0, this.cdBolt - dt);
    for (const id of this.slots) this.skillCds[id] = Math.max(0, (this.skillCds[id] ?? 0) - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    this.cdDodge = Math.max(0, this.cdDodge - dt);
    this.cdGuard = Math.max(0, this.cdGuard - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.dodgeWin = Math.max(0, this.dodgeWin - dt);
    this.guardT = Math.max(0, this.guardT - dt);
    this.castAnim = Math.max(0, this.castAnim - dt);

    if (!this.ended) {
      this.handleInput(dt);
      this.updateAutoAttack();
      this.regen(dt);
      this.sendState(dt);
    } else {
      inputManager.consumeDash();
      inputManager.consumeGuard();
      inputManager.consumeJustPressed();
    }

    this.updateMe(dt);
    this.updateEnemies(dt);
    this.updateMates(dt);
    this.updateTeles();
    this.updateEBolts(dt);
    this.updateMyBolts(dt);
    this.updateOrbs(dt);
    this.shader.update(dt);
    this.backdrop.update(dt);
  }

  private handleInput(dt: number): void {
    let mx = inputManager.moveX, my = inputManager.moveY;
    const k = this.keys;
    if (k) {
      const kx = (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0);
      const ky = (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0);
      if (kx || ky) { const l = Math.hypot(kx, ky); mx = kx / l; my = ky / l; }
    }
    const pressed = inputManager.consumeJustPressed();
    const dash = inputManager.consumeDash();
    const guard = inputManager.consumeGuard();
    if (this.down) { this.moveX = 0; this.moveY = 0; return; }

    if (pressed[0]) this.cast(this.slots[0]);
    if (pressed[1]) this.cast(this.slots[1]);
    if (pressed[2]) this.cast(this.slots[2]);
    if (pressed[3]) this.cast(this.slots[3]);

    if (dash && this.cdDodge <= 0) {
      let dx = mx, dy = my;
      const l = Math.hypot(dx, dy);
      if (l < 0.1) { dx = this.facing; dy = 0; } else { dx /= l; dy /= l; }
      this.dashVx = dx * DODGE.speed;
      this.dashVy = dy * DODGE.speed;
      this.dashT = DODGE.duration;
      this.breakAction();
      this.invuln = DODGE.invuln;
      this.dodgeWin = DODGE.invuln;
      this.pdDone = false;
      this.cdDodge = DODGE.cooldown;
      sfx.dash();
      this.ghost();
    }
    if (guard && this.cdGuard <= 0) {
      this.guardT = GUARD.duration;
      this.breakAction();
      this.guardStart = this.time.now;
      this.cdGuard = GUARD.cooldown;
      sfx.guard();
    }

    // 出招硬直里摇杆不管用
    this.lockT = Math.max(0, this.lockT - dt);
    if (this.lockT > 0 && this.dashT <= 0) { mx = 0; my = 0; }

    const sec = dt / 1000;
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.x += this.dashVx * sec;
      this.y += this.dashVy * sec;
      if (Math.random() < 0.5) this.ghost();
    } else {
      const speed = PLAYER_BASE_SPEED * (1 + this.stats.move / 100) * (this.guardT > 0 ? 0.45 : 1);
      this.x += mx * speed * sec;
      this.y += my * speed * sec;
    }
    this.x = Phaser.Math.Clamp(this.x, 90, RIFT_SIZE - 90);
    this.y = Phaser.Math.Clamp(this.y, 90, RIFT_SIZE - 90);
    this.moveX = mx;
    this.moveY = my;
    if (Math.abs(mx) > 0.1 && this.castAnim <= 0) this.facing = mx < 0 ? -1 : 1;
  }

  /** 御和遁打断正在放的招式：硬直取消，动作收掉 */
  private breakAction(): void {
    this.lockT = 0;
    this.castAnim = 0;
    this.me.play('none');
  }

  private regen(dt: number): void {
    if (this.down || this.stats.regen <= 0 || this.hp >= this.stats.maxHp) return;
    this.regenAcc += (this.stats.regen * dt) / 1000;
    if (this.regenAcc >= 1) {
      const n = Math.floor(this.regenAcc);
      this.regenAcc -= n;
      this.hp = Math.min(this.stats.maxHp, this.hp + n);
      this.hpDirty = true;
    }
  }

  private sendState(dt: number): void {
    this.sendMvT -= dt;
    if (this.sendMvT <= 0) {
      this.sendMvT = 66;
      const a = this.dashT > 0 ? 2 : this.guardT > 0 ? 3 : Math.hypot(this.moveX, this.moveY) > 0.1 ? 1 : 0;
      net.send({ t: 'mv', x: Math.round(this.x), y: Math.round(this.y), f: this.facing, a });
    }
    this.sendHpT -= dt;
    if (this.hpDirty && this.sendHpT <= 0) {
      this.sendHpT = 200;
      this.hpDirty = false;
      net.send({ t: 'hp', hp: this.hp });
    }
  }

  /** 遁的残影：一团淡蓝的光影 */
  private ghost(): void {
    const g = this.add.image(this.x, this.y - 10, 'fx_glow').setTint(0x9fd8ff).setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.5, 0.75).setAlpha(0.55).setDepth(this.y + RiftScene.FOOT - 1);
    this.tweens.add({ targets: g, alpha: 0, scaleX: 0.3, duration: 260, onComplete: () => g.destroy() });
  }

  private updateMe(dt: number): void {
    const me = this.me;
    const foot = this.y + RiftScene.FOOT;
    me.setPosition(this.x, foot).setDepth(foot);
    me.setFacing(this.facing);
    me.setMoving(this.dashT > 0 ? 1 : Math.hypot(this.moveX, this.moveY));
    me.setDashing(this.dashT > 0);
    me.setGuarding(this.guardT > 0);
    me.tick(dt);
    if (!this.down && this.invuln > 0) me.setAlpha(0.6);
    this.meShadow.setVisible(false);
    this.meAura.setPosition(this.x, this.y);

    if (this.guardT > 0) {
      const p = this.guardT / GUARD.duration;
      this.guardRing.setVisible(true).setPosition(this.x, this.y - 20).setScale(1.25 + (1 - p) * 0.15).setAlpha(0.4 + p * 0.5);
    } else {
      this.guardRing.setVisible(false);
    }
  }

  private updateEnemies(dt: number): void {
    const now = this.time.now;
    const rt = this.renderTime;
    for (const en of this.enemies.values()) {
      const s = sampleAt(en.buf, rt);
      const dx = s ? s.x - en.x : 0, dy = s ? s.y - en.y : 0;
      en.x += dx;
      en.y += dy;
      const decay = Math.exp(-dt / 70);
      en.kx *= decay;
      en.ky *= decay;
      en.tilt *= Math.exp(-dt / 110);
      // 序列帧只有 6 帧，叠一层程序动态让动作连贯：移动时前倾、步伐起伏
      const vx = dt > 0 ? (dx / dt) * 1000 : 0;
      const speed = dt > 0 ? (Math.hypot(dx, dy) / dt) * 1000 : 0;
      const leanTo = Phaser.Math.Clamp(vx / 900, -0.12, 0.12) * (en.tier === 2 ? 0.4 : 1);
      en.lean += (leanTo - en.lean) * (1 - Math.exp(-dt / 90));
      const stride = Math.min(1, speed / 120);
      const hop = -Math.abs(Math.sin(now / 1000 * 10 + en.phase)) * 6 * stride * (en.tier === 2 ? 0.5 : 1);
      const moving = Math.abs(dx) + Math.abs(dy) > dt * 0.05;
      if (Math.abs(dx) > 0.5 && now > en.atkUntil) en.spr.setFlipX(dx < 0);
      en.spr.setPosition(en.x + en.kx, en.y + en.ky + hop).setRotation(en.lean + en.tilt);
      const foot = en.y + 307 * en.scale * 0.36;
      en.spr.setDepth(foot);
      en.shadow.setPosition(en.x, foot);
      en.ring.setPosition(en.x, foot);

      if (now > en.atkUntil) {
        const want = moving ? 'run' : 'idle';
        if (en.anim !== want) {
          en.anim = want;
          const atlas = MONSTER_ATLAS_MAP[en.tier === 2 ? '首领' : en.def.atlas];
          if (atlas && this.anims.exists(`${atlas}_${want}`)) { en.spr.play(`${atlas}_${want}`, true); en.spr.anims.timeScale = 1; }
        }
      }

      const stag = (en.flags & 1) !== 0;
      const burning = (en.flags & 2) !== 0;
      en.spr.setAlpha(stag ? 0.75 + 0.25 * Math.sin(now / 60) : 1);
      en.burnFx.setVisible(burning).setPosition(en.x, en.y - 20).setAlpha(burning ? 0.35 + 0.15 * Math.sin(now / 90) : 0);
      if (burning && Math.random() < 0.12) this.fx.ember(en.x, en.y - 30, FIRE_TINT, 1, 20);

      if (en.tier !== 2) {
        const pct = Phaser.Math.Clamp(en.hp / en.max, 0, 1);
        const show = pct < 1 || en.tier === 1;
        en.hpBg.setVisible(show);
        en.hpFill.setVisible(show);
        if (show) {
          const top = en.y - 307 * en.scale * 0.42;
          en.hpBg.setPosition(en.x, top).setDepth(foot + 1);
          en.hpFill.setPosition(en.x - (en.hpBg.width - 4) / 2, top).setDepth(foot + 2);
          en.hpFill.width = (en.hpBg.width - 4) * pct;
        }
      }
    }
  }

  /** 远端实体的回放时刻（服务器时间） */
  private get renderTime(): number {
    if (Number.isNaN(this.clockOffset)) return this.lastServerMs;
    return this.time.now + this.clockOffset - INTERP_DELAY;
  }

  private updateMates(dt: number): void {
    const rt = this.renderTime;
    for (const m of this.mates.values()) {
      const s = sampleAt(m.buf, rt);
      const px = m.x;
      if (s) { m.x = s.x; m.y = s.y; }
      const foot = m.y + RiftScene.FOOT;
      m.spr.setPosition(m.x, foot).setDepth(foot);
      m.spr.setFacing(m.f);
      m.spr.setMoving(m.a === 1 || m.a === 2 ? 1 : Math.min(1, Math.abs(m.x - px) / Math.max(1, dt) * 3));
      m.spr.setDashing(m.a === 2);
      m.spr.setGuarding(m.a === 3);
      m.spr.setDown(m.down);
      m.spr.tick(dt);
      m.shadow.setPosition(m.x, m.y + 50);
      m.name.setPosition(m.x, m.y - 110);
      m.hpBg.setPosition(m.x, m.y - 96);
      m.hpFill.setPosition(m.x - 40, m.y - 96);
      m.hpFill.width = 80 * Phaser.Math.Clamp(m.hp / Math.max(1, m.max), 0, 1);

      // 倒地的同伴：靠近即可救援
      m.reviveRing.clear();
      if (m.down) {
        m.reviveRing.lineStyle(4, 0x3fb950, 0.8);
        m.reviveRing.strokeCircle(m.x, m.y + 20, REVIVE_RADIUS);
      }
    }
  }

  /** HUD 用：同伴是否在救援范围内（用于提示） */
  get rescuing(): boolean {
    for (const m of this.mates.values()) {
      if (m.down && (m.x - this.x) ** 2 + (m.y - this.y) ** 2 < REVIVE_RADIUS ** 2) return true;
    }
    return false;
  }

  get reviveMs(): number {
    return REVIVE_MS;
  }

  get bossHp(): { hp: number; max: number } | null {
    const b = this.bossId ? this.enemies.get(this.bossId) : undefined;
    return b ? { hp: b.hp, max: b.max } : null;
  }

  get mateList(): Mate[] {
    return [...this.mates.values()];
  }

  get myPos(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  get enemyDots(): IterableIterator<CEnemy> {
    return this.enemies.values();
  }

  get orbDots(): IterableIterator<Orb> {
    return this.orbs.values();
  }
}
