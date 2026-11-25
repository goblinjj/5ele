import type { C2S, S2C, ProfileView, RoomView } from '@xiyou/shared';

/**
 * 与联机服务的连接（单例）
 *  - 设备号存在本机，首次进入自动生成，相当于免注册账号
 *  - 断线自动重连，重连后重新 hello 拉取存档
 */

type Handler = (msg: any) => void;

function serverUrl(): string {
  const env = (import.meta as any).env?.VITE_SERVER_URL as string | undefined;
  if (env) return env;
  if ((import.meta as any).env?.DEV) return `ws://${location.hostname}:2567`;
  return 'wss://5ele.goblin.top/ws';
}

function deviceId(): string {
  const key = '5ele_did';
  let did = localStorage.getItem(key);
  if (!did || !/^[A-Za-z0-9_-]{16,64}$/.test(did)) {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    did = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(key, did);
  }
  return did;
}

class NetClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private retry = 0;
  private retryTimer = 0;
  private pingTimer = 0;
  readonly did = deviceId();
  profile: ProfileView | null = null;
  room: RoomView | null = null;
  status: 'idle' | 'connecting' | 'online' | 'offline' = 'idle';
  /** 服务器时间 - 本机时间（算挂机收益用） */
  skew = 0;
  /** 往返延迟（毫秒） */
  rtt = 0;

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.status = 'connecting';
    this.emit('status', this.status);
    const ws = new WebSocket(serverUrl());
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.status = 'online';
      this.emit('status', this.status);
      this.send({ t: 'hello', did: this.did, name: localStorage.getItem('5ele_name') ?? undefined });
      window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
    };
    ws.onmessage = ev => {
      let msg: S2C;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'profile') { this.profile = msg.p; if (msg.p.now) this.skew = msg.p.now - Date.now(); }
      else if (msg.t === 'room') this.room = msg.room;
      else if (msg.t === 'pong') this.rtt = Math.round(performance.now() - msg.c);
      this.emit(msg.t, msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.room = null;
      this.status = 'offline';
      window.clearInterval(this.pingTimer);
      this.emit('status', this.status);
      this.emit('room', { t: 'room', room: null });
      // 指数退避重连，最长 8 秒
      const wait = Math.min(8000, 600 * 2 ** this.retry++);
      window.clearTimeout(this.retryTimer);
      this.retryTimer = window.setTimeout(() => this.connect(), wait);
    };
    ws.onerror = () => {};
  }

  get online(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: C2S): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  on(type: string, fn: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) { set = new Set(); this.handlers.set(type, set); }
    set.add(fn);
    return () => set!.delete(fn);
  }

  private emit(type: string, msg: unknown): void {
    this.handlers.get(type)?.forEach(fn => {
      try { fn(msg); } catch (e) { console.error(e); }
    });
  }
}

export const net = new NetClient();
