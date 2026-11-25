import { WebSocket } from 'ws';
import {
  C2S, S2C, RoomView, Wuxing, PATHS, WUXING_NAMES,
  powerOf, salvageValue, MAX_PARTY, MAX_TIER,
} from '@xiyou/shared';
import { Profile, loadProfile, markDirty, viewOf, validDid, cleanName, statsOf } from './store.js';
import { cultivate, refine, forge } from './forge.js';
import { Run } from './run.js';

/**
 * 连接、营地操作与房间（房间码组队）
 */

export class Session {
  readonly ws: WebSocket;
  profile: Profile | null = null;
  room: Room | null = null;
  /** 同一设备重复连接时，旧连接作废 */
  closed = false;

  constructor(ws: WebSocket) {
    this.ws = ws;
  }

  get id(): string {
    return this.profile?.did ?? '';
  }

  send(msg: S2C): void {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  sendProfile(): void {
    if (this.profile) this.send({ t: 'profile', p: viewOf(this.profile) });
  }
}

const online = new Map<string, Session>();
const rooms = new Map<string, Room>();

export function stats(): { online: number; rooms: number; runs: number } {
  let runs = 0;
  rooms.forEach(r => { if (r.run) runs++; });
  return { online: online.size, rooms: rooms.size, runs };
}

class Room {
  code: string;
  tier = 1;
  members: Session[] = [];
  host: Session;
  run: Run | null = null;

  constructor(code: string, host: Session) {
    this.code = code;
    this.host = host;
  }

  get maxTier(): number {
    return Math.min(MAX_TIER, this.host.profile?.maxTier ?? 1);
  }

  view(): RoomView {
    return {
      code: this.code,
      tier: this.tier,
      maxTier: this.maxTier,
      state: this.run ? 'run' : 'lobby',
      players: this.members.map(s => {
        const p = s.profile!;
        return { id: p.did, name: p.name, path: p.path, power: powerOf(statsOf(p)), host: s === this.host };
      }),
    };
  }

  sync(): void {
    const v = this.view();
    this.members.forEach(m => m.send({ t: 'room', room: v }));
  }

  remove(s: Session): void {
    this.members = this.members.filter(m => m !== s);
    this.run?.removeMember(s.id);
    s.room = null;
    s.send({ t: 'room', room: null });
    if (this.members.length === 0) {
      this.run?.stop();
      rooms.delete(this.code);
      return;
    }
    if (this.host === s) {
      this.host = this.members[0];
      this.tier = Math.min(this.tier, this.maxTier);
    }
    this.sync();
  }

  start(): void {
    if (this.run) return;
    const members = this.members.map(s => ({
      id: s.id,
      profile: s.profile!,
      stats: statsOf(s.profile!),
      send: (m: S2C) => s.send(m),
    }));
    this.run = new Run(this.tier, members, () => {
      this.run = null;
      this.members.forEach(m => m.sendProfile());
      this.sync();
    });
    this.sync();
  }
}

function newCode(): string {
  for (let i = 0; i < 50; i++) {
    const c = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(c)) return c;
  }
  return String(Date.now() % 100000);
}

export function onClose(s: Session): void {
  s.room?.remove(s);
  if (s.profile && online.get(s.profile.did) === s) online.delete(s.profile.did);
  s.closed = true;
}

export function onMessage(s: Session, raw: string): void {
  let msg: C2S;
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;

  if (msg.t === 'ping') { s.send({ t: 'pong', c: msg.c }); return; }

  if (msg.t === 'hello') {
    if (!validDid(msg.did)) { s.send({ t: 'err', msg: '设备标识无效' }); return; }
    const prev = online.get(msg.did);
    if (prev && prev !== s) {
      prev.send({ t: 'err', msg: '已在其他页面登录' });
      onClose(prev);
      prev.ws.close();
    }
    s.profile = loadProfile(msg.did, msg.name);
    online.set(msg.did, s);
    s.sendProfile();
    return;
  }

  const p = s.profile;
  if (!p) return;

  // 秘境中的消息直接交给模拟
  if (s.room?.run) {
    if (msg.t === 'leave' || msg.t === 'exit') { s.room.remove(s); s.sendProfile(); return; }
    s.room.run.handle(s.id, msg);
    return;
  }

  switch (msg.t) {
    case 'name':
      p.name = cleanName(msg.name);
      markDirty(p);
      s.sendProfile();
      s.room?.sync();
      break;

    case 'path': {
      const def = PATHS[msg.path as Wuxing];
      if (!def?.available) { s.send({ t: 'err', msg: '此道尚未开放' }); return; }
      if (p.path) { s.send({ t: 'err', msg: '已入道，不可更改' }); return; }
      // 入道时两手空空：兵器要靠自己吸纳的五行能量凝练
      p.path = def.wuxing;
      markDirty(p);
      s.sendProfile();
      break;
    }

    case 'equip': {
      const idx = p.stash.findIndex(it => it.id === msg.id);
      if (idx < 0) return;
      const item = p.stash[idx];
      // 换下来的放回兵匣原位
      if (p.weapon) p.stash.splice(idx, 1, p.weapon); else p.stash.splice(idx, 1);
      p.weapon = item;
      markDirty(p);
      s.sendProfile();
      s.room?.sync();
      break;
    }

    case 'salvage': {
      if (!Array.isArray(msg.ids)) return;
      const ids = new Set(msg.ids);
      const gain: Partial<Record<Wuxing, number>> = {};
      p.stash = p.stash.filter(it => {
        if (!ids.has(it.id)) return true;
        const n = salvageValue(it);
        p.energy[it.wuxing] += n;
        gain[it.wuxing] = (gain[it.wuxing] ?? 0) + n;
        return false;
      });
      markDirty(p);
      s.sendProfile();
      const text = (Object.keys(gain) as Wuxing[]).map(wx => `${WUXING_NAMES[wx]} +${gain[wx]}`).join('　');
      if (text) s.send({ t: 'toast', msg: `化去兵器，能量归元：${text}` });
      break;
    }

    case 'cultivate':
    case 'forge':
    case 'refine': {
      const r = msg.t === 'cultivate' ? cultivate(p, msg.wx) : msg.t === 'forge' ? forge(p, msg.tier, msg.amounts) : refine(p, msg.id);
      if (!r.ok) { s.send({ t: 'err', msg: r.msg }); return; }
      markDirty(p);
      s.sendProfile();
      s.room?.sync();
      if (r.msg) s.send({ t: 'toast', msg: r.msg });
      break;
    }

    case 'create': {
      if (!p.path) { s.send({ t: 'err', msg: '请先选择所修之道' }); return; }
      s.room?.remove(s);
      const room = new Room(newCode(), s);
      room.tier = Math.max(1, Math.min(room.maxTier, msg.tier | 0));
      room.members.push(s);
      s.room = room;
      rooms.set(room.code, room);
      room.sync();
      break;
    }

    case 'join': {
      if (!p.path) { s.send({ t: 'err', msg: '请先选择所修之道' }); return; }
      const room = rooms.get(String(msg.code).trim());
      if (!room) { s.send({ t: 'err', msg: '没有这个房间' }); return; }
      if (room === s.room) return;
      if (room.run) { s.send({ t: 'err', msg: '对方已在秘境中，请等这一局结束' }); return; }
      if (room.members.length >= MAX_PARTY) { s.send({ t: 'err', msg: '房间已满' }); return; }
      s.room?.remove(s);
      room.members.push(s);
      s.room = room;
      room.sync();
      break;
    }

    case 'leave':
      s.room?.remove(s);
      break;

    case 'tier': {
      const room = s.room;
      if (!room || room.host !== s) return;
      room.tier = Math.max(1, Math.min(room.maxTier, msg.tier | 0));
      room.sync();
      break;
    }

    case 'start': {
      const room = s.room;
      if (!room || room.host !== s) return;
      room.start();
      break;
    }
  }
}
