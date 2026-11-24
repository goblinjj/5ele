import {
  Wuxing, PlayerStats, GearItem, GearRarity,
  generateItem, rollRarity, salvageValue, MAX_TIER,
  RIFT_SIZE, RIFT_CENTER, SERVER_TICK_MS, SNAPSHOT_EVERY,
  PROGRESS_GOAL, PROGRESS_NORMAL, PROGRESS_ELITE,
  FIRE, GUARD, DODGE, PARRY_MULT, STAGGER_MS, STAGGER_BONUS, PERFECT_DODGE_CRITS,
  REVIVE_RADIUS, REVIVE_MS,
  MONSTERS, MonsterDef, MonsterTier, ELITE, BOSS, ENEMY_BOLT_SPEED,
  tierHpMult, tierDmgMult, partyHpMult, wxMult,
  withCdr, boltInterval, meteorCd, hasLegend,
  EnemyAttack, EnemyBoltSpawn, SpawnInfo, S2C, C2S, RunPlayerInfo,
} from '@xiyou/shared';
import { Profile, markDirty, STASH_CAP } from './store.js';

/**
 * 秘境模拟（服务器权威）
 *
 * 服务器负责：妖异的生成 / 移动 / 出招、玩家技能的伤害结算、掉落与拾取、进度与结算。
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
  boltTokens: number;
  splitTokens: number;
  lastRing: number;
  lastMeteor: number;
  lastParry: number;
  lastPDodge: number;
  crits: number;
  loot: Map<string, { item: GearItem; x: number; y: number }>;
  collected: number;
  mats: number;
  got: GearItem[];
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
        boltTokens: 3, splitTokens: 0,
        lastRing: -1e9, lastMeteor: -1e9, lastParry: -1e9, lastPDodge: -1e9,
        crits: 0,
        loot: new Map(),
        collected: 0, mats: 0, got: [],
      };
    });

    const info: RunPlayerInfo[] = this.players.map(p => ({ id: p.id, name: p.profile.name, path: p.path, stats: p.stats }));
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
    // 中途离开：已经掉在地上的装备照样收进灵囊
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
      case 'cast': this.onCast(p, msg.s, msg.x, msg.y); break;
      case 'parry': this.onParry(p, msg.id); break;
      case 'pdodge': {
        if (this.now - p.lastPDodge < DODGE.cooldown * 0.6) return;
        p.lastPDodge = this.now;
        p.crits = PERFECT_DODGE_CRITS;
        break;
      }
      case 'pick': this.onPick(p, msg.id); break;
    }
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

    // 技能令牌回复（火球速率校验，允许少量网络抖动）
    for (const p of this.players) {
      const rate = dt / boltInterval(p.stats);
      p.boltTokens = Math.min(3, p.boltTokens + rate * 1.25);
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

  private roll(p: RunPlayer, e: Enemy, mult: number, useCrit: boolean): { amt: number; crit: boolean } {
    let crit = Math.random() < p.stats.crit / 100;
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

  private onHit(p: RunPlayer, s: string, id: number): void {
    if (p.down) return;
    const e = this.enemies.get(id);
    if (!e || e.dead) return;
    if (dist2(p.x, p.y, e.x, e.y) > (FIRE.boltRange + 380) ** 2) return;

    if (s === 'b') {
      if (p.boltTokens < 1) return;
      p.boltTokens -= 1;
      if (hasLegend(p.stats, 'chiyan_feather')) p.splitTokens = Math.min(9, p.splitTokens + FIRE.splitCount);
      const { amt, crit } = this.roll(p, e, FIRE.boltMult, true);
      const ignite = Math.random() < FIRE.igniteChance;
      const splash = this.enemiesNear(e.x, e.y, FIRE.splashRadius).filter(o => o !== e);
      this.damage(p, e, amt, crit);
      if (ignite) this.ignite(p, e);
      splash.forEach(o => {
        const r = this.roll(p, o, FIRE.splashMult, false);
        this.damage(p, o, r.amt, r.crit);
      });
    } else if (s === 's') {
      if (p.splitTokens < 1) return;
      p.splitTokens -= 1;
      const r = this.roll(p, e, FIRE.splitMult, false);
      this.damage(p, e, r.amt, r.crit);
    }
  }

  private onCast(p: RunPlayer, s: string, x: number, y: number): void {
    if (p.down || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const area = 1 + p.stats.area / 100;
    if (s === 'A') {
      // 客户端冷却到点就会放，服务器这边留 15% 容差
      if (this.now - p.lastRing < withCdr(FIRE.ringCd, p.stats) * 0.85) return;
      p.lastRing = this.now;
      const cx = dist2(x, y, p.x, p.y) < 250 ** 2 ? x : p.x;
      const cy = dist2(x, y, p.x, p.y) < 250 ** 2 ? y : p.y;
      this.broadcast({ t: 'cast', p: p.idx, s: 'A', x: Math.round(cx), y: Math.round(cy) });
      this.ring(p, cx, cy, FIRE.ringRadius * area, FIRE.ringMult);
    } else if (s === 'B') {
      if (this.now - p.lastMeteor < meteorCd(p.stats) * 0.85) return;
      if (dist2(x, y, p.x, p.y) > (FIRE.meteorRange + 300) ** 2) return;
      p.lastMeteor = this.now;
      this.broadcast({ t: 'cast', p: p.idx, s: 'B', x: Math.round(x), y: Math.round(y) });
      const r = FIRE.meteorRadius * area;
      if (hasLegend(p.stats, 'fentian_seal')) {
        for (let i = 0; i < FIRE.sealMeteors; i++) {
          const ox = i === 0 ? 0 : Math.cos(i * 2.4) * r * 0.9;
          const oy = i === 0 ? 0 : Math.sin(i * 2.4) * r * 0.9;
          this.later(FIRE.meteorDelay + i * 240, () => this.ring(p, x + ox, y + oy, r, FIRE.meteorMult * FIRE.sealMult));
        }
      } else {
        this.later(FIRE.meteorDelay, () => this.ring(p, x, y, r, FIRE.meteorMult));
      }
    }
  }

  private ring(p: RunPlayer, x: number, y: number, r: number, mult: number): void {
    for (const e of this.enemiesNear(x, y, r)) {
      const { amt, crit } = this.roll(p, e, mult, false);
      this.damage(p, e, amt, crit);
      this.ignite(p, e);
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
    // 金乌羽衣：防反后立刻能再放燎原（客户端随后会发 cast A）
    if (hasLegend(p.stats, 'jinwu_armor')) p.lastRing = -1e9;
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
    this.broadcast({ t: 'die', id: e.id, by: by.idx });

    // 燎原之心：灼烧中的妖异死亡时爆裂（链式引燃在下一个 tick 结算，避免递归过深）
    const owner = e.burnOwner;
    if (e.burnMs > 0 && owner && !owner.left && hasLegend(owner.stats, 'liaoyuan_heart')) {
      const x = e.x, y = e.y;
      this.later(80, () => {
        this.broadcast({ t: 'cast', p: owner.idx, s: 'H', x: Math.round(x), y: Math.round(y) });
        for (const o of this.enemiesNear(x, y, FIRE.heartRadius)) {
          const { amt, crit } = this.roll(owner, o, FIRE.heartMult, false);
          this.damage(owner, o, amt, crit);
          this.ignite(owner, o);
        }
      });
    }

    if (e.tier === 2) {
      this.boss = null;
      for (const p of this.alivePlayers) this.dropFor(p, e, 4, 2, true);
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

    for (const p of this.alivePlayers) {
      if (e.tier === 1) {
        this.dropFor(p, e, Math.random() < 0.5 ? 2 : 1, 1, false);
      } else {
        // 组队时掉率略高，鼓励一起刷
        const chance = 0.055 * (1 + p.stats.find / 200) * (1 + 0.15 * (this.alivePlayers.length - 1));
        if (Math.random() < chance) this.dropFor(p, e, 1, 0, false);
      }
    }
  }

  private bossDue = false;

  private dropFor(p: RunPlayer, e: Enemy, count: number, minRarity: GearRarity, boss: boolean): void {
    for (let i = 0; i < count; i++) {
      let rarity = rollRarity(this.tier, p.stats.find, minRarity);
      // 病变核心：保底一件极品，层数越高越容易出传说
      if (boss && i === 0) rarity = Math.random() < 0.12 + this.tier * 0.03 ? 4 : Math.max(3, rarity) as GearRarity;
      const item = generateItem(this.tier, rarity);
      const ang = Math.random() * Math.PI * 2;
      const d = boss ? rand(80, 220) : rand(20, 90);
      const x = Math.round(clampW(e.x + Math.cos(ang) * d));
      const y = Math.round(clampW(e.y + Math.sin(ang) * d));
      p.loot.set(item.id, { item, x, y });
      p.send({ t: 'loot', id: item.id, x, y, item });
    }
  }

  private onPick(p: RunPlayer, id: string): void {
    const l = p.loot.get(id);
    if (!l) return;
    if (dist2(p.x, p.y, l.x, l.y) > 400 ** 2) return;
    p.loot.delete(id);
    this.give(p, l.item, true);
  }

  /** 收进灵囊；低品质或灵囊满了就分解成玄晶 */
  private give(p: RunPlayer, item: GearItem, notify: boolean): void {
    const prof = p.profile;
    if (item.rarity <= prof.autoSalvage || prof.stash.length >= STASH_CAP) {
      const mats = salvageValue(item);
      prof.mats += mats;
      p.mats += mats;
      if (notify) p.send({ t: 'got', id: item.id, mats });
    } else {
      prof.stash.push(item);
      p.collected++;
      p.got.push(item);
      if (notify) p.send({ t: 'got', id: item.id, item });
    }
    markDirty(prof);
  }

  private collectAll(p: RunPlayer): void {
    for (const l of p.loot.values()) this.give(p, l.item, false);
    p.loot.clear();
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
        kills: this.players.map(q => q.kills), best, collected: p.collected, mats: p.mats,
        items: [...p.got].sort((a, b) => b.rarity - a.rarity).slice(0, 8),
      });
    }
    this.onEnd();
  }
}
