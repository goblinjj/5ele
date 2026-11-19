import { Wuxing } from '@xiyou/shared';

/**
 * 程序化音效：全部用 Web Audio 实时合成，不需要任何音频文件。
 *
 * 五行对应五声音阶（宫商角徵羽）：
 *   土 = 宫(C)  金 = 商(D)  木 = 角(E)  火 = 徵(G)  水 = 羽(A)
 * 拾取能量、换装、塑型等与五行相关的声音都落在这五个音上，
 * 所以无论怎么叠加听起来都是和谐的。
 */

const STORAGE_KEY = 'wuji.sfx.muted';

/** 五声音阶频率（C5 起） */
const WX_FREQ: Record<Wuxing, number> = {
  [Wuxing.EARTH]: 523.25, // 宫 C5
  [Wuxing.METAL]: 587.33, // 商 D5
  [Wuxing.WOOD]: 659.25,  // 角 E5
  [Wuxing.FIRE]: 783.99,  // 徵 G5
  [Wuxing.WATER]: 880.0,  // 羽 A5
};
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

type Wave = OscillatorType;

interface ToneOpts {
  freq: number;
  /** 结束频率（滑音） */
  to?: number;
  type?: Wave;
  dur: number;
  gain?: number;
  attack?: number;
  delay?: number;
}

interface NoiseOpts {
  dur: number;
  gain?: number;
  /** 滤波器 */
  filter?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
  delay?: number;
}

class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private muted: boolean = false;
  /** 各音效上次播放时间，用于限流（同一帧命中十只妖异不能响十次） */
  private last: Record<string, number> = {};

  constructor() {
    try {
      this.muted = window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  /**
   * 创建音频上下文并生成噪声缓冲。
   * 浏览器要求由用户手势触发，所以在首次触摸 / 点击时调用。
   */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      const ctx = this.ctx;
      // 压限，防止大量声音叠加时爆音
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.ratio.value = 8;
      comp.connect(ctx.destination);
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(comp);

      // 1 秒白噪声，所有"气声 / 撞击"都从它滤出来
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      window.localStorage.setItem(STORAGE_KEY, m ? '1' : '0');
    } catch { /* 隐私模式下忽略 */ }
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
    }
  }

  // ───────────────────────── 合成基元 ─────────────────────────

  private ready(): boolean {
    return !!this.ctx && !!this.master && !this.muted && this.ctx.state === 'running';
  }

  /** 限流：同名音效在 minGap 毫秒内只响一次 */
  private gate(name: string, minGap: number): boolean {
    const now = performance.now();
    if (now - (this.last[name] ?? 0) < minGap) return false;
    this.last[name] = now;
    return true;
  }

  private tone(o: ToneOpts): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    const peak = o.gain ?? 0.3;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  private noise(o: NoiseOpts): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 1200, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t0 + o.dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain ?? 0.3, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + o.dur + 0.02);
  }

  /** 带泛音的钟磬声 */
  private chime(freq: number, dur: number, gain: number, delay: number = 0): void {
    this.tone({ freq, dur, gain, type: 'sine', delay });
    this.tone({ freq: freq * 2.01, dur: dur * 0.6, gain: gain * 0.35, type: 'sine', delay });
    this.tone({ freq: freq * 3.02, dur: dur * 0.35, gain: gain * 0.15, type: 'triangle', delay });
  }

  // ───────────────────────── 战斗 ─────────────────────────

  /** 本源之击出手 */
  shoot(): void {
    if (!this.ready() || !this.gate('shoot', 70)) return;
    this.tone({ freq: 920, to: 380, dur: 0.09, gain: 0.07, type: 'triangle' });
    this.noise({ dur: 0.05, gain: 0.04, filter: 'highpass', freq: 3000 });
  }

  /** 命中妖异；克制时更亮更脆 */
  hit(ke: boolean, weak: boolean): void {
    if (!this.ready() || !this.gate(ke ? 'hitKe' : 'hit', 55)) return;
    if (weak) {
      // 打不动：闷响
      this.noise({ dur: 0.05, gain: 0.07, filter: 'lowpass', freq: 500 });
      return;
    }
    this.noise({ dur: 0.07, gain: ke ? 0.2 : 0.13, filter: 'bandpass', freq: ke ? 2600 : 1500, q: 1.2 });
    this.tone({ freq: ke ? 260 : 190, to: 90, dur: 0.09, gain: ke ? 0.2 : 0.13, type: 'square' });
    if (ke) this.chime(1568, 0.18, 0.09);
  }

  /** 妖异溃散 */
  enemyDie(wuxing: Wuxing, big: boolean): void {
    if (!this.ready() || !this.gate('die', 60)) return;
    this.noise({ dur: big ? 0.6 : 0.22, gain: big ? 0.3 : 0.16, filter: 'lowpass', freq: 2400, to: 200 });
    this.tone({ freq: big ? 220 : 330, to: big ? 40 : 70, dur: big ? 0.6 : 0.24, gain: big ? 0.32 : 0.16, type: 'sawtooth' });
    this.chime(WX_FREQ[wuxing], big ? 0.9 : 0.3, big ? 0.14 : 0.07, 0.03);
  }

  /** 残魂受击；被克时更重 */
  playerHurt(ke: boolean): void {
    if (!this.ready() || !this.gate('hurt', 90)) return;
    this.tone({ freq: ke ? 150 : 180, to: 45, dur: ke ? 0.34 : 0.2, gain: ke ? 0.42 : 0.28, type: 'sawtooth' });
    this.noise({ dur: ke ? 0.28 : 0.14, gain: ke ? 0.3 : 0.18, filter: 'lowpass', freq: ke ? 900 : 1400 });
    if (ke) this.tone({ freq: 98, to: 92, dur: 0.4, gain: 0.25, type: 'square', delay: 0.02 });
  }

  /** 闪避 / 化解 */
  dodge(): void {
    if (!this.ready() || !this.gate('dodge', 100)) return;
    this.noise({ dur: 0.12, gain: 0.1, filter: 'highpass', freq: 2500 });
  }

  /** 起势格挡 */
  guard(): void {
    if (!this.ready()) return;
    this.tone({ freq: 180, to: 260, dur: 0.12, gain: 0.14, type: 'triangle' });
    this.noise({ dur: 0.08, gain: 0.08, filter: 'bandpass', freq: 900 });
  }

  /** 普通格挡：闷响 */
  block(): void {
    if (!this.ready() || !this.gate('block', 80)) return;
    this.tone({ freq: 140, to: 70, dur: 0.16, gain: 0.3, type: 'square' });
    this.noise({ dur: 0.1, gain: 0.16, filter: 'lowpass', freq: 1200 });
  }

  /** 防反：清脆的金石之声 */
  parry(): void {
    if (!this.ready()) return;
    this.noise({ dur: 0.06, gain: 0.3, filter: 'highpass', freq: 4000 });
    this.chime(1318.5, 0.5, 0.22);
    this.chime(1975.5, 0.45, 0.16, 0.02);
    this.chime(2637, 0.6, 0.1, 0.05);
    this.tone({ freq: 90, to: 40, dur: 0.25, gain: 0.3, type: 'sine' });
  }

  /** 遁 */
  dash(): void {
    if (!this.ready()) return;
    this.noise({ dur: 0.22, gain: 0.22, filter: 'bandpass', freq: 500, to: 3200, q: 0.8 });
    this.tone({ freq: 300, to: 900, dur: 0.16, gain: 0.07, type: 'sine' });
  }

  /** 范围技能 */
  skill(wuxing: Wuxing): void {
    if (!this.ready()) return;
    const f = WX_FREQ[wuxing] / 2;
    this.noise({ dur: 0.5, gain: 0.3, filter: 'bandpass', freq: 300, to: 2600, q: 0.7 });
    this.tone({ freq: 110, to: 36, dur: 0.55, gain: 0.4, type: 'sine' });
    this.chime(f, 0.7, 0.2);
    this.chime(f * 1.5, 0.6, 0.13, 0.06);
    if (wuxing === Wuxing.FIRE) this.noise({ dur: 0.7, gain: 0.16, filter: 'lowpass', freq: 900, delay: 0.1 });
    if (wuxing === Wuxing.WATER) this.tone({ freq: 2200, to: 700, dur: 0.5, gain: 0.07, type: 'sine', delay: 0.05 });
    if (wuxing === Wuxing.METAL) this.tone({ freq: 2800, to: 2600, dur: 0.35, gain: 0.06, type: 'triangle' });
  }

  /** 妖异蓄力完成的重击 / 震地 */
  slam(): void {
    if (!this.ready() || !this.gate('slam', 120)) return;
    this.tone({ freq: 120, to: 34, dur: 0.32, gain: 0.34, type: 'sine' });
    this.noise({ dur: 0.2, gain: 0.16, filter: 'lowpass', freq: 600 });
  }

  /** 妖异吐出弹道 */
  enemyShoot(): void {
    if (!this.ready() || !this.gate('eshoot', 120)) return;
    this.tone({ freq: 300, to: 620, dur: 0.14, gain: 0.07, type: 'sawtooth' });
    this.noise({ dur: 0.12, gain: 0.06, filter: 'bandpass', freq: 1800 });
  }

  /** 回复生命 */
  heal(): void {
    if (!this.ready() || !this.gate('heal', 250)) return;
    this.chime(659.25, 0.3, 0.07);
    this.chime(987.77, 0.36, 0.06, 0.07);
  }

  // ───────────────────────── 器物 ─────────────────────────

  /** 吸纳五行能量：该五行对应的音 */
  pickup(wuxing: Wuxing): void {
    if (!this.ready() || !this.gate('pickup', 60)) return;
    this.chime(WX_FREQ[wuxing], 0.22, 0.1);
  }

  /** 塑型成功：本音 + 上方五度 */
  shapeOk(wuxing: Wuxing): void {
    if (!this.ready()) return;
    const f = WX_FREQ[wuxing];
    this.chime(f, 0.35, 0.13);
    this.chime(f * 1.5, 0.4, 0.12, 0.09);
    this.chime(f * 2, 0.55, 0.1, 0.18);
  }

  /** 塑型失败：能量逸散 */
  shapeFail(): void {
    if (!this.ready()) return;
    this.tone({ freq: 330, to: 150, dur: 0.26, gain: 0.1, type: 'triangle' });
    this.noise({ dur: 0.2, gain: 0.06, filter: 'highpass', freq: 2000 });
  }

  /** 换上某五行的武器 / 防具 */
  swap(wuxing: Wuxing | undefined): void {
    if (!this.ready()) return;
    const f = wuxing ? WX_FREQ[wuxing] : 440;
    this.noise({ dur: 0.08, gain: 0.12, filter: 'highpass', freq: 3500 });
    this.chime(f / 2, 0.3, 0.16);
    this.chime(f, 0.25, 0.1, 0.03);
  }

  // ───────────────────────── 流程 ─────────────────────────

  /** 界面点击 */
  click(): void {
    if (!this.ready() || !this.gate('click', 50)) return;
    this.tone({ freq: 880, to: 660, dur: 0.07, gain: 0.1, type: 'triangle' });
  }

  /** 新一轮开始：一声磬 */
  roundStart(): void {
    if (!this.ready()) return;
    this.chime(196, 1.6, 0.26);
    this.chime(392, 1.2, 0.1, 0.01);
    this.noise({ dur: 0.12, gain: 0.08, filter: 'bandpass', freq: 900 });
  }

  /** 气脉暂稳：五声上行 */
  roundClear(): void {
    if (!this.ready()) return;
    PENTA.forEach((f, i) => this.chime(f, 0.5, 0.12, i * 0.09));
  }

  /** 五行失衡 / 病变核心现身：低沉的不祥之音 */
  ominous(): void {
    if (!this.ready()) return;
    this.tone({ freq: 73.4, to: 69.3, dur: 1.6, gain: 0.34, type: 'sawtooth', attack: 0.08 });
    this.tone({ freq: 110, to: 103.8, dur: 1.5, gain: 0.2, type: 'sawtooth', attack: 0.1 });
    this.noise({ dur: 1.2, gain: 0.1, filter: 'lowpass', freq: 400 });
  }

  /** 击溃病变核心 */
  victory(): void {
    if (!this.ready()) return;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this.chime(f, 1.1, 0.14, i * 0.14));
    this.chime(261.63, 2.2, 0.18, 0.7);
  }

  /** 残魂消散 */
  gameOver(): void {
    if (!this.ready()) return;
    [440, 392, 329.63, 261.63, 196].forEach((f, i) => this.chime(f, 0.9, 0.13, i * 0.22));
    this.noise({ dur: 1.6, gain: 0.12, filter: 'lowpass', freq: 1500, to: 120 });
  }
}

export const sfx = new SfxEngine();

/** 在页面上挂一次性的手势监听，首次触摸 / 点击 / 按键时解锁音频 */
export function installAudioUnlock(): void {
  const handler = () => sfx.unlock();
  // 不移除监听：iOS 切到后台再回来会把上下文挂起，需要下一次手势恢复
  window.addEventListener('pointerdown', handler, { passive: true });
  window.addEventListener('touchend', handler, { passive: true });
  window.addEventListener('keydown', handler);
}
