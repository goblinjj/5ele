import {
  Wuxing, PlayerStats, WeaponForm, formOf, Energy, emptyEnergy, energyTotal, WX_ORDER,
  MAX_TIER,
  QI_START, orbValue, qiGain, wxIndex,
  RIFT_SIZE, RIFT_CENTER, SERVER_TICK_MS, SNAPSHOT_EVERY,
  PROGRESS_GOAL, PROGRESS_NORMAL, PROGRESS_ELITE,
  FIRE, GUARD, DODGE, PARRY_MULT, STAGGER_MS, STAGGER_BONUS, PERFECT_DODGE_CRITS,
  REVIVE_RADIUS, REVIVE_MS,
  MONSTERS, MonsterDef, MonsterTier, ELITE, BOSS, ENEMY_BOLT_SPEED,
  tierHpMult, tierDmgMult, partyHpMult, wxMult,
  attackInterval, skillCd, skillLevel, skillDmgMult, SkillId, SKILLS, SKILL_ORDER, SK, skillRadius, bladeCount,
  EnemyAttack, EnemyBoltSpawn, SpawnInfo, S2C, C2S, RunPlayerInfo,
} from '@xiyou/shared';
import { Profile, markDirty } from './store.js';

/**
 * 秘境模拟（服务器权威）
 *
 * 服务器负责：妖异的生成 / 移动 / 出招、玩家出手的伤害结算、能量的掉落与吸纳、灵力、进度与结算。
 * 客户端负责：自己角色的移动、遁与御的判定、被击中的判定（预警结束时自己在不在范围内）。
 * 这样手机网络有延迟时，防反和闪避仍然手感准确；而伤害数值和掉落都由服务器给出。
 */

export interface RunMember {
  id: string;
  profile: Profile;
  stats: PlayerStats;
  send(msg: S2C): void;
}

interface RunPlayer extends RunMember {
  idx: number;
  path: Wuxing;
  x: number;
  y: number;
  f: number;
  a: number;
  hp: number;
  down: boolean;
  revive: number;
  left: boolean;
  kills: number;
  /** 兵器的出手方式（开局时定下，局内不换） */
  form: WeaponForm;
  /** 出手令牌：校验出手频率，允许少量网络抖动 */
  atkTokens: number;
  /** 局内灵力：吸纳能量获得，放技能消耗 */
  qi: number;
  /** 地上留给这名玩家的能量 */
  orbs: Map<number, Orb>;
  /** 本局吸纳的五行能量 */
  gained: Energy;
  /** 开局时的技能熟练度；-1 = 没学会 */
  skillLv: Record<SkillId, number>;
  /** 本局携带的技能，与各自上次施放的时刻 */
  loadout: SkillId[];
  lastCast: Partial<Record<SkillId, number>>;
  lastParry: number;
  lastPDodge: number;
  crits: number;
}

interface Orb {
  x: number;
  y: number;
  wx: Wuxing;
  n: number;
  /** 来自哪一档妖异（决定化成多少灵力） */
  mt: MonsterTier;
}

type EnemyState = 'chase' | 'windup' | 'lunge' | 'recover';

interface Enemy {
  id: number;
  k: number;
  def: MonsterDef;
  tier: MonsterTier;
  x: number;
  y: number;
  hp: number;
  max: number;
  speed: number;
  dmg: number;
  size: number;
  state: EnemyState;
  timer: number;
  cd: number;
  target: RunPlayer | null;
  retarget: number;
  attack: EnemyAttack | null;
  lvx: number;
  lvy: number;
  stagger: number;
  burnMs: number;
  burnDps: number;
  burnOwner: RunPlayer | null;
  bossStep: number;
  dead: boolean;
}

interface Scheduled {
  at: number;
  fn: () => void;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2;
const clampW = (v: number) => Math.max(90, Math.min(RIFT_SIZE - 90, v));

export class Run {
  readonly tier: number;
  private players: RunPlayer[];
  private enemies = new Map<number, Enemy>();
  private seq = 0;
  private orbSeq = 0;
  private now = 0;
  private tickN = 0;
  private progress = 0;
  private boss: Enemy | null = null;
  private spawnTimer = 0;
  private burnTimer = 0;
  private dmgBatch: number[] = [];
  private schedule: Scheduled[] = [];
  private ended = false;
  private allDownAt = 0;
  private timer: NodeJS.Timeout;
  private onEnd: () => void;

  constructor(tier: number, members: RunMember[], onEnd: () => void) {
    this.tier = tier;
    this.onEnd = onEnd;
    this.players = members.map((m, idx) => {
      const ang = (idx / Math.max(1, members.length)) * Math.PI * 2;
      return {
        ...m,
        idx,
        path: m.profile.path ?? Wuxing.FIRE,
        x: RIFT_CENTER + Math.cos(ang) * 90,
        y: RIFT_CENTER + Math.sin(ang) * 90,
        f: 1, a: 0,
        hp: m.stats.maxHp,
        down: false, revive: 0, left: false,
        kills: 0,
        form: formOf(m.profile.weapon),
        atkTokens: 3,
        qi: Math.min(m.stats.qiMax, QI_START),
        orbs: new Map(),
        gained: emptyEnergy(),
        skillLv: Object.fromEntries(SKILL_ORDER.map(id => [id, skillLevel(m.profile.skills[id])])) as Record<SkillId, number>,
        loadout: [...m.profile.loadout],
        lastCast: {},
        lastParry: -1e9, lastPDodge: -1e9,
        crits: 0,
      };
    });

    const info: RunPlayerInfo[] = this.players.map(p => ({ id: p.id, name: p.profile.name, path: p.path, stats: p.stats, weapon: p.profile.weapon, cult: p.profile.cult, skills: { ...p.profile.skills }, loadout: p.loadout }));
    this.players.forEach(p => p.send({ t: 'runStart', tier, you: p.id, players: info }));
    // 开局给几群妖异，不用干等
    for (let i = 0; i < 3; i++) this.spawnPack(i === 0 ? 820 : 1000);

    this.timer = setInterval(() => this.tick(), SERVER_TICK_MS);
  }

  // ───────────────────────── 对外 ─────────────────────────

  get alivePlayers(): RunPlayer[] {
    return this.players.filter(p => !p.left);
  }

  removeMember(id: string): void {
    const p = this.players.find(q => q.id === id);
    if (!p || p.left) return;
    // 中途离开：地上的能量照样收走（不超过带回上限）
    this.collectAll(p);
    p.left = true;
    p.down = true;
    if (this.alivePlayers.length === 0) this.stop();
  }

  stop(): void {
    clearInterval(this.timer);
    this.ended = true;
  }

  handle(id: string, msg: C2S): void {
    const p = this.players.find(q => q.id === id);
    if (!p || p.left) return;
    switch (msg.t) {
      case 'mv': {
        if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
        p.x = clampW(msg.x);
        p.y = clampW(msg.y);
        p.f = msg.f < 0 ? -1 : 1;
        p.a = msg.a | 0;
        break;
      }
      case 'hp': {
        if (!Number.isFinite(msg.hp) || p.down) return;
        p.hp = Math.max(0, Math.min(p.stats.maxHp, Math.round(msg.hp)));
        if (p.hp <= 0) this.knockDown(p);
        break;
      }
      case 'hit': this.onHit(p, msg.s, msg.id); break;
      case 'swing': this.onSwing(p, msg.ids); break;
      case 'orb': this.onOrb(p, msg.id); break;
      case 'cast': this.onCast(p, msg.s, msg.x, msg.y); break;
      case 'parry': this.onParry(p, msg.id); break;
      case 'pdodge': {
        if (this.now - p.lastPDodge < DODGE.cooldown * 0.6) return;
        p.lastPDodge = this.now;
        p.crits = PERFECT_DODGE_CRITS;
        break;
      }
      case 'ready': this.resync(p); break;
    }
  }

  /** 客户端切场景期间收不到消息，就绪后把场上状态完整补发一遍 */
  private resync(p: RunPlayer): void {
    const list: SpawnInfo[] = [];
    for (const e of this.enemies.values()) if (!e.dead) list.push(this.spawnInfo(e));
    if (list.length) p.send({ t: 'spawn', list });
    if (this.boss && !this.boss.dead) p.send({ t: 'boss', id: this.boss.id });
    if (p.orbs.size) {
      const orbs: number[] = [];
      for (const [id, o] of p.orbs) orbs.push(id, o.x, o.y, wxIndex(o.wx), o.n, o.mt);
      p.send({ t: 'orbs', list: orbs });
    }
    p.send({ t: 'qi', v: p.qi });
    for (const q of this.players) if (q.down && !q.left) p.send({ t: 'down', p: q.idx });
  }

  // ───────────────────────── 主循环 ─────────────────────────

  private tick(): void {
    if (this.ended) return;
    const dt = SERVER_TICK_MS;
    this.now += dt;
    this.tickN++;

    // 定时事件（陨火落地等）
    if (this.schedule.length) {
      const due = this.schedule.filter(s => s.at <= this.now);
      if (due.length) {
        this.schedule = this.schedule.filter(s => s.at > this.now);
        due.forEach(s => s.fn());
      }
    }

    // 出手令牌回复（出手频率校验，允许少量网络抖动）
    for (const p of this.players) {
      const rate = dt / attackInterval(p.form, p.stats);
      p.atkTokens = Math.min(3, p.atkTokens + rate * 1.25);
    }

    this.updateRevive(dt);
    this.updateSpawns(dt);
    for (const e of this.enemies.values()) this.updateEnemy(e, dt);
    this.updateBurns(dt);

    if (this.dmgBatch.length) {
      this.broadcast({ t: 'dmg', d: this.dmgBatch });
      this.dmgBatch = [];
    }
    if (this.tickN % SNAPSHOT_EVERY === 0) this.sendSnapshot();

    // 全员倒下：失败
    const alive = this.alivePlayers;
    if (alive.length && alive.every(p => p.down)) {
      if (!this.allDownAt) this.allDownAt = this.now;
      else if (this.now - this.allDownAt > 2500) this.finish(false);
    } else {
      this.allDownAt = 0;
    }
  }

  private broadcast(msg: S2C): void {
    for (const p of this.players) if (!p.left) p.send(msg);
  }

  private sendSnapshot(): void {
    const e: number[] = [];
    for (const en of this.enemies.values()) {
      if (en.dead) continue;
      const flags = (en.stagger > 0 ? 1 : 0) | (en.burnMs > 0 ? 2 : 0);
      e.push(en.id, Math.round(en.x), Math.round(en.y), Math.ceil(en.hp), flags);
    }
    const p: (number | string)[] = [];
    for (const pl of this.players) {
      if (pl.left) continue;
      p.push(pl.idx, Math.round(pl.x), Math.round(pl.y), pl.f, pl.a, pl.hp, pl.stats.maxHp, pl.down ? 1 : 0);
    }
    this.broadcast({ t: 'snap', e, p, prog: Math.min(PROGRESS_GOAL, Math.round(this.progress * 10) / 10), ms: this.now });
  }

  // ───────────────────────── 倒地与救援 ─────────────────────────

  private knockDown(p: RunPlayer): void {
    if (p.down) return;
    p.down = true;
    p.revive = 0;
    p.hp = 0;
    this.broadcast({ t: 'down', p: p.idx });
  }

  private updateRevive(dt: number): void {
    for (const p of this.alivePlayers) {
      if (!p.down) continue;
      const helper = this.alivePlayers.some(q => q !== p && !q.down && dist2(q.x, q.y, p.x, p.y) < REVIVE_RADIUS ** 2);
      p.revive = helper ? p.revive + dt : Math.max(0, p.revive - dt * 0.5);
      if (p.revive >= REVIVE_MS) {
        p.down = false;
        p.revive = 0;
        p.hp = Math.round(p.stats.maxHp * 0.4);
        this.broadcast({ t: 'up', p: p.idx });
      }
    }
  }

  // ───────────────────────── 妖异生成 ─────────────────────────

  private get enemyCap(): number {
    return Math.min(56, 30 + 8 * (this.alivePlayers.length - 1));
  }

  private updateSpawns(dt: number): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 400;
    const alive = [...this.enemies.values()].filter(e => !e.dead).length;
    const cap = this.boss ? Math.round(this.enemyCap * 0.45) : this.enemyCap;
    if (alive < cap * 0.75) this.spawnPack();
  }

  private spawnPack(distance?: number): void {
    const targets = this.alivePlayers.filter(p => !p.down);
    if (!targets.length) return;
    const anchor = targets[Math.floor(Math.random() * targets.length)];
    const k = Math.floor(Math.random() * MONSTERS.length);
    const def = MONSTERS[k];
    const ang = Math.random() * Math.PI * 2;
    const d = distance ?? rand(820, 1080);
    const cx = clampW(anchor.x + Math.cos(ang) * d);
    const cy = clampW(anchor.y + Math.sin(ang) * d);
    const size = { swift: [5, 7], caster: [3, 4], charger: [3, 4], brute: [2, 3], slammer: [2, 3] }[def.kind];
    const n = Math.round(rand(size[0], size[1]));
    const eliteAt = Math.random() < 0.16 ? 0 : -1;
    const list: SpawnInfo[] = [];
    for (let i = 0; i < n; i++) {
      const e = this.makeEnemy(k, i === eliteAt ? 1 : 0, clampW(cx + rand(-120, 120)), clampW(cy + rand(-120, 120)));
      list.push(this.spawnInfo(e));
    }
    this.broadcast({ t: 'spawn', list });
  }

  private makeEnemy(k: number, tier: MonsterTier, x: number, y: number): Enemy {
    const def = MONSTERS[k];
    const party = partyHpMult(this.alivePlayers.length);
    let hp = def.hp * tierHpMult(this.tier) * party;
    let dmg = def.dmg * tierDmgMult(this.tier);
    let size = def.size;
    let speed = def.speed * rand(0.92, 1.08);
    if (tier === 1) {
      hp *= ELITE.hpMult; dmg *= ELITE.dmgMult; size *= ELITE.sizeMult; speed *= ELITE.speedMult;
    } else if (tier === 2) {
      hp = def.hp * tierHpMult(this.tier) * party * BOSS.hpMult;
      dmg *= BOSS.dmgMult; size = BOSS.size; speed = BOSS.speed;
    }
    const e: Enemy = {
      id: ++this.seq, k, def, tier, x, y,
      hp: Math.ceil(hp), max: Math.ceil(hp),
      speed, dmg: Math.round(dmg), size,
      state: 'chase', timer: 0, cd: rand(400, 1400),
      target: null, retarget: 0, attack: null, lvx: 0, lvy: 0,
      stagger: 0, burnMs: 0, burnDps: 0, burnOwner: null,
      bossStep: 0, dead: false,
    };
    this.enemies.set(e.id, e);
    return e;
  }

  private spawnInfo(e: Enemy): SpawnInfo {
    return { id: e.id, k: e.k, tier: e.tier, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, max: e.max };
  }

  private spawnBoss(): void {
    const targets = this.alivePlayers.filter(p => !p.down);
    const anchor = targets[0] ?? this.players[0];
    const ang = Math.random() * Math.PI * 2;
    const boss = this.makeEnemy(4, 2, clampW(anchor.x + Math.cos(ang) * 520), clampW(anchor.y + Math.sin(ang) * 520));
    boss.cd = 1800;
    this.boss = boss;
    this.broadcast({ t: 'spawn', list: [this.spawnInfo(boss)] });
    this.broadcast({ t: 'boss', id: boss.id });
  }

  // ───────────────────────── 妖异 AI ─────────────────────────

  private updateEnemy(e: Enemy, dt: number): void {
    if (e.dead) return;
    const sec = dt / 1000;

    e.retarget -= dt;
    if (e.retarget <= 0 || !e.target || e.target.down || e.target.left) {
      e.retarget = 500;
      e.target = this.nearestPlayer(e.x, e.y);
    }

    if (e.stagger > 0) {
      e.stagger -= dt;
      if (e.state === 'windup') { e.state = 'recover'; e.timer = 300; e.attack = null; }
      return;
    }

    switch (e.state) {
      case 'chase': {
        e.cd -= dt;
        const t = e.target;
        if (!t) return;
        const dx = t.x - e.x, dy = t.y - e.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / d, ny = dy / d;
        let mv = 0;
        if (e.def.kind === 'caster' && e.tier !== 2) {
          if (d > e.def.reach * 0.85) mv = 1;
          else if (d < 300) mv = -0.8;
        } else if (d > e.def.reach * 0.7) {
          mv = 1;
        }
        // 互相推挤，别叠成一团
        let sx = 0, sy = 0;
        const r = e.tier === 2 ? 150 : e.tier === 1 ? 90 : 64;
        for (const o of this.enemies.values()) {
          if (o === e || o.dead) continue;
          const ox = e.x - o.x, oy = e.y - o.y;
          const od2 = ox * ox + oy * oy;
          if (od2 < r * r && od2 > 0.01) {
            const od = Math.sqrt(od2);
            sx += (ox / od) * (r - od);
            sy += (oy / od) * (r - od);
          }
        }
        e.x = clampW(e.x + (nx * mv * e.speed) * sec + sx * 0.12);
        e.y = clampW(e.y + (ny * mv * e.speed) * sec + sy * 0.12);
        if (e.cd <= 0 && d <= e.def.reach * (e.tier === 2 ? 2.2 : 1)) this.beginAttack(e, nx, ny);
        break;
      }
      case 'windup': {
        e.timer -= dt;
        if (e.timer <= 0) this.releaseAttack(e);
        break;
      }
      case 'lunge': {
        e.timer -= dt;
        e.x = clampW(e.x + e.lvx * sec);
        e.y = clampW(e.y + e.lvy * sec);
        if (e.timer <= 0) { e.state = 'recover'; e.timer = 500; }
        break;
      }
      case 'recover': {
        e.timer -= dt;
        if (e.timer <= 0) {
          e.state = 'chase';
          e.cd = e.def.cooldown * rand(1.05, 1.5) * (e.tier === 2 ? 0.55 : 1);
        }
        break;
      }
    }
  }

  private nearestPlayer(x: number, y: number): RunPlayer | null {
    let best: RunPlayer | null = null;
    let bd = Infinity;
    for (const p of this.players) {
      if (p.left || p.down) continue;
      const d = dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  private beginAttack(e: Enemy, nx: number, ny: number): void {
    const windupMult = e.tier === 1 ? 0.92 : 1;
    let shape: EnemyAttack['shape'] = 'circle';
    let ax = e.x, ay = e.y, r = e.size, len = 0;
    let windup = e.def.windup * windupMult;

    if (e.tier === 2) {
      // 病变核心：震地 → 环形弹幕 → 召唤 → 冲撞 轮换
      const step = e.bossStep++ % 4;
      if (step === 1 || step === 3 && Math.random() < 0.5) {
        shape = 'bolt'; r = 90; windup = 800;
      } else if (step === 2) {
        this.summonMinions(e);
        e.state = 'recover'; e.timer = 600;
        return;
      } else if (step === 3) {
        shape = 'lunge'; len = 640; r = 150; windup = 900;
      } else {
        shape = 'circle'; r = BOSS.size * 1.25; windup = 1100;
      }
    } else if (e.def.kind === 'charger') {
      shape = 'lunge'; len = e.size; r = 76 * (e.tier === 1 ? ELITE.sizeMult : 1);
    } else if (e.def.kind === 'caster') {
      shape = 'bolt'; r = 62;
    } else if (e.def.kind === 'swift') {
      ax = e.x + nx * 45; ay = e.y + ny * 45;
    }

    const atk: EnemyAttack = {
      id: e.id, shape, x: Math.round(ax), y: Math.round(ay),
      dx: Math.round(nx * 1000) / 1000, dy: Math.round(ny * 1000) / 1000,
      r: Math.round(r), len: Math.round(len), windup: Math.round(windup), dmg: e.dmg, wx: e.def.wuxing,
    };
    e.attack = atk;
    e.state = 'windup';
    e.timer = windup;
    this.broadcast({ t: 'atk', a: atk });
  }

  private releaseAttack(e: Enemy): void {
    const a = e.attack;
    e.attack = null;
    if (!a) { e.state = 'recover'; e.timer = 300; return; }
    if (a.shape === 'lunge') {
      const ms = 230;
      e.lvx = (a.dx * a.len) / (ms / 1000);
      e.lvy = (a.dy * a.len) / (ms / 1000);
      e.state = 'lunge';
      e.timer = ms;
      return;
    }
    if (a.shape === 'bolt') {
      const list: EnemyBoltSpawn[] = [];
      const shoot = (ang: number, dmg: number) => list.push({
        x: Math.round(e.x), y: Math.round(e.y - 40),
        vx: Math.round(Math.cos(ang) * ENEMY_BOLT_SPEED), vy: Math.round(Math.sin(ang) * ENEMY_BOLT_SPEED),
        life: 2400, dmg, wx: e.def.wuxing, src: e.id,
      });
      const base = Math.atan2(a.dy, a.dx);
      if (e.tier === 2) {
        const n = 16;
        for (let i = 0; i < n; i++) shoot(base + (i / n) * Math.PI * 2, Math.round(e.dmg * 0.6));
      } else if (e.tier === 1) {
        [-0.28, 0, 0.28].forEach(o => shoot(base + o, e.dmg));
      } else {
        shoot(base, e.dmg);
      }
      this.broadcast({ t: 'bolts', list });
    }
    e.state = 'recover';
    e.timer = e.tier === 2 ? 700 : 450;
  }

  private summonMinions(boss: Enemy): void {
    const list: SpawnInfo[] = [];
    const n = 3 + this.alivePlayers.length;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const e = this.makeEnemy(Math.floor(Math.random() * MONSTERS.length), 0,
        clampW(boss.x + Math.cos(ang) * 200), clampW(boss.y + Math.sin(ang) * 200));
      list.push(this.spawnInfo(e));
    }
    this.broadcast({ t: 'spawn', list });
  }

  // ───────────────────────── 玩家出手 ─────────────────────────

  private roll(p: RunPlayer, e: Enemy, mult: number, useCrit: boolean, forceCrit: boolean = false): { amt: number; crit: boolean } {
    let crit = forceCrit || Math.random() < p.stats.crit / 100;
    if (useCrit && p.crits > 0) { p.crits--; crit = true; }
    let amt = p.stats.attack * mult * wxMult(p.path, e.def.wuxing);
    if (e.stagger > 0) amt *= STAGGER_BONUS;
    if (crit) amt *= 1 + p.stats.critDmg / 100;
    return { amt: Math.max(1, Math.round(amt * rand(0.92, 1.08))), crit };
  }

  private damage(p: RunPlayer, e: Enemy, amt: number, crit: boolean, burn: boolean = false): void {
    if (e.dead) return;
    e.hp -= amt;
    this.dmgBatch.push(e.id, amt, crit ? 1 : 0, p.idx, burn ? 1 : 0);
    if (e.hp <= 0) this.kill(e, p);
  }

  private ignite(p: RunPlayer, e: Enemy): void {
    if (e.dead) return;
    e.burnMs = FIRE.burnMs;
    e.burnDps = Math.max(e.burnDps * 0.5, p.stats.attack * FIRE.burnDps * (1 + p.stats.burn / 100) * wxMult(p.path, e.def.wuxing));
    e.burnOwner = p;
  }

  private updateBurns(dt: number): void {
    this.burnTimer -= dt;
    if (this.burnTimer > 0) return;
    this.burnTimer = 500;
    for (const e of [...this.enemies.values()]) {
      if (e.dead || e.burnMs <= 0 || !e.burnOwner) continue;
      e.burnMs -= 500;
      this.damage(e.burnOwner, e, Math.max(1, Math.round(e.burnDps * 0.5)), false, true);
      if (e.burnMs <= 0) e.burnDps = 0;
    }
  }

  private enemiesNear(x: number, y: number, r: number): Enemy[] {
    const out: Enemy[] = [];
    for (const e of this.enemies.values()) {
      if (e.dead) continue;
      const er = e.tier === 2 ? 110 : e.tier === 1 ? 50 : 30;
      if (dist2(x, y, e.x, e.y) <= (r + er) ** 2) out.push(e);
    }
    return out;
  }

  /** 远程兵器：客户端报告一发弹道命中 */
  private onHit(p: RunPlayer, s: string, id: number): void {
    if (p.down || s !== 'b' || p.form.melee) return;
    const e = this.enemies.get(id);
    if (!e || e.dead) return;
    if (dist2(p.x, p.y, e.x, e.y) > (p.form.range + 380) ** 2) return;
    // 一次出手 bolts 发弹道，每发占 1/bolts 个令牌
    const cost = 1 / p.form.bolts;
    if (p.atkTokens < cost) return;
    p.atkTokens -= cost;
    const { amt, crit } = this.roll(p, e, p.form.mult, true);
    const ignite = Math.random() < FIRE.igniteChance / p.form.bolts;
    const splash = p.form.splash ? this.enemiesNear(e.x, e.y, FIRE.splashRadius).filter(o => o !== e) : [];
    this.damage(p, e, amt, crit);
    if (ignite) this.ignite(p, e);
    splash.forEach(o => {
      const r = this.roll(p, o, FIRE.splashMult, false);
      this.damage(p, o, r.amt, r.crit);
    });
  }

  /** 近战兵器：客户端报告一次挥击扫中的妖异 */
  private onSwing(p: RunPlayer, ids: unknown): void {
    if (p.down || !p.form.melee || !Array.isArray(ids)) return;
    if (p.atkTokens < 1) return;
    p.atkTokens -= 1;
    // 完美闪避的必暴：一次挥击算一次，扫中的全部暴击
    const forced = p.crits > 0;
    if (forced) p.crits--;
    const seen = new Set<number>();
    for (const raw of ids.slice(0, 12)) {
      const e = this.enemies.get(Number(raw));
      if (!e || e.dead || seen.has(e.id)) continue;
      seen.add(e.id);
      if (dist2(p.x, p.y, e.x, e.y) > (p.form.range + 380) ** 2) continue;
      const r = this.roll(p, e, p.form.mult, false, forced);
      this.damage(p, e, r.amt, r.crit);
      if (Math.random() < FIRE.igniteChance) this.ignite(p, e);
    }
  }

  /** 灵力不够就放不出；被拒时把服务器的灵力发回去校正 */
  private spendQi(p: RunPlayer, cost: number): boolean {
    if (p.qi < cost) { p.send({ t: 'qi', v: p.qi }); return false; }
    p.qi -= cost;
    return true;
  }

  private onCast(p: RunPlayer, id: SkillId, x: number, y: number): void {
    if (p.down || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const def = SKILLS[id];
    const lv = def ? p.skillLv[id] : -1;
    // 要学会、要带在身上
    if (!def || lv < 0 || !p.loadout.includes(id)) return;
    // 客户端冷却到点就会放，服务器这边留 15% 容差
    if (this.now - (p.lastCast[id] ?? -1e9) < skillCd(id, p.stats, lv) * 0.85) return;
    if (id === 'meteor' && dist2(x, y, p.x, p.y) > (FIRE.meteorRange + 300) ** 2) return;
    if (!this.spendQi(p, def.qi)) return;
    p.lastCast[id] = this.now;
    this.practice(p, id);

    const radius = skillRadius(id, lv, p.stats);
    const dm = skillDmgMult(lv);
    // 以自身为圆心的技能：允许客户端位置略有出入
    const near = dist2(x, y, p.x, p.y) < 250 ** 2;
    const cx = near ? x : p.x, cy = near ? y : p.y;
    const tell = (tx: number, ty: number) => this.broadcast({ t: 'cast', p: p.idx, s: id, x: Math.round(tx), y: Math.round(ty) });

    switch (id) {
      case 'ring':
        tell(cx, cy);
        this.ring(p, cx, cy, radius, FIRE.ringMult * dm);
        break;
      case 'meteor':
        tell(x, y);
        this.later(FIRE.meteorDelay, () => this.ring(p, x, y, radius, FIRE.meteorMult * dm));
        break;
      case 'blades': {
        // 剑气分袭最近的几只，必定暴击；妖异不够就集中补刀
        tell(cx, cy);
        const count = bladeCount(lv);
        const targets = this.enemiesNear(cx, cy, radius)
          .sort((a, b) => dist2(cx, cy, a.x, a.y) - dist2(cx, cy, b.x, b.y)).slice(0, count);
        if (!targets.length) break;
        for (let i = 0; i < count; i++) {
          const e = targets[i % targets.length];
          this.later(120 + i * 70, () => {
            if (e.dead) return;
            const r = this.roll(p, e, SK.blades.mult * dm * (i < targets.length ? 1 : 0.5), false, true);
            this.damage(p, e, r.amt, r.crit);
          });
        }
        break;
      }
      case 'frost':
        tell(cx, cy);
        for (const e of this.enemiesNear(cx, cy, radius)) {
          const r = this.roll(p, e, SK.frost.mult * dm, false);
          this.damage(p, e, r.amt, r.crit);
          if (e.dead) continue;
          // 冻结 = 硬直（核心只冻三成时间），打断正在蓄力的招式
          e.stagger = Math.max(e.stagger, SK.frost.freezeMs * (e.tier === 2 ? 0.3 : 1));
          e.attack = null;
          if (e.state === 'windup' || e.state === 'lunge') { e.state = 'recover'; e.timer = 200; }
          this.broadcast({ t: 'stag', id: e.id, ms: e.stagger, f: 1 });
        }
        break;
      case 'bloom':
        // 回血由各客户端自己结算（生命是客户端权威），这里只管荆棘
        tell(cx, cy);
        this.ring(p, cx, cy, radius, SK.bloom.mult * dm, false);
        break;
      case 'bastion':
        // 减伤同样在客户端结算
        tell(cx, cy);
        this.ring(p, cx, cy, radius, SK.bastion.mult * dm, false);
        break;
    }
  }

  /** 用一次，熟练一分（记在存档里，下一局生效） */
  private practice(p: RunPlayer, id: SkillId): void {
    p.profile.skills[id] = (p.profile.skills[id] ?? 0) + 1;
    markDirty(p.profile);
  }

  private ring(p: RunPlayer, x: number, y: number, r: number, mult: number, ignite: boolean = true): void {
    if (p.left) return;
    for (const e of this.enemiesNear(x, y, r)) {
      const { amt, crit } = this.roll(p, e, mult, false);
      this.damage(p, e, amt, crit);
      if (ignite) this.ignite(p, e);
    }
  }

  private onParry(p: RunPlayer, id: number): void {
    if (p.down) return;
    if (this.now - p.lastParry < GUARD.cooldown * 0.6) return;
    const e = this.enemies.get(id);
    if (!e || e.dead) return;
    if (dist2(p.x, p.y, e.x, e.y) > 900 ** 2) return;
    p.lastParry = this.now;
    e.stagger = e.tier === 2 ? STAGGER_MS * 0.5 : STAGGER_MS;
    e.attack = null;
    if (e.state === 'windup' || e.state === 'lunge') { e.state = 'recover'; e.timer = 200; }
    this.broadcast({ t: 'stag', id: e.id, ms: e.stagger });
    const { amt, crit } = this.roll(p, e, PARRY_MULT, false);
    this.damage(p, e, amt, crit);
  }

  private later(ms: number, fn: () => void): void {
    this.schedule.push({ at: this.now + ms, fn });
  }

  // ───────────────────────── 击杀与掉落 ─────────────────────────

  private kill(e: Enemy, by: RunPlayer): void {
    if (e.dead) return;
    e.dead = true;
    this.enemies.delete(e.id);
    by.kills++;

    // 残留的能量：每名玩家各得一份，自己去吸纳。病变核心散成五行各一团
    const n = orbValue(this.tier, e.tier);
    for (const p of this.players) {
      if (p.left) { continue; }
      const orbs: number[] = [];
      const kinds = e.tier === 2 ? WX_ORDER : [e.def.wuxing];
      for (const wx of kinds) {
        const id = ++this.orbSeq;
        p.orbs.set(id, { x: Math.round(e.x), y: Math.round(e.y), wx, n, mt: e.tier });
        orbs.push(id, wxIndex(wx), n);
      }
      p.send({ t: 'die', id: e.id, by: by.idx, orbs });
    }

    if (e.tier === 2) {
      this.boss = null;
      this.later(1800, () => this.finish(true));
      return;
    }

    if (!this.boss && !this.bossDue) {
      this.progress += e.tier === 1 ? PROGRESS_ELITE : PROGRESS_NORMAL;
      if (this.progress >= PROGRESS_GOAL) {
        this.progress = PROGRESS_GOAL;
        this.bossDue = true;
        this.later(1500, () => this.spawnBoss());
      }
    }
  }

  private bossDue = false;

  /** 吸纳一团能量：入账，并化作灵力 */
  private onOrb(p: RunPlayer, id: number): void {
    const o = p.orbs.get(id);
    if (!o) return;
    if (dist2(p.x, p.y, o.x, o.y) > 700 ** 2) return;
    p.orbs.delete(id);
    this.bank(p, o);
    p.qi = Math.min(p.stats.qiMax, p.qi + qiGain(p.path, o.wx, o.mt));
  }

  /** 入账：一局能带回的能量有上限，满了之后只化灵力 */
  private bank(p: RunPlayer, o: Orb): void {
    const n = Math.min(o.n, p.stats.carry - energyTotal(p.gained));
    if (n <= 0) return;
    p.profile.energy[o.wx] += n;
    p.gained[o.wx] += n;
    markDirty(p.profile);
  }

  private collectAll(p: RunPlayer): void {
    for (const o of p.orbs.values()) this.bank(p, o);
    p.orbs.clear();
  }

  private finish(ok: boolean): void {
    if (this.ended) return;
    this.stop();
    for (const p of this.alivePlayers) {
      this.collectAll(p);
      const prof = p.profile;
      let best = false;
      if (ok) {
        const prev = prof.best[this.tier];
        if (!prev || this.now < prev) { prof.best[this.tier] = this.now; best = true; }
        prof.maxTier = Math.max(prof.maxTier, Math.min(MAX_TIER, this.tier + 1));
      }
      markDirty(prof);
      p.send({
        t: 'end', ok, ms: this.now, tier: this.tier,
        kills: this.players.map(q => q.kills), best, energy: p.gained,
      });
    }
    this.onEnd();
  }
}
