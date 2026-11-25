import Phaser from 'phaser';
import {
  TIER_NAMES, PROGRESS_GOAL, FIRE, DODGE, GUARD,
  WUXING_NAMES, Wuxing, energyTotal, SKILL_RANKS, SKILLS, SkillId,
} from '@xiyou/shared';
import { WX_TINT } from '../config/worldConfig.js';
import { applyRenderScale, isLowQuality } from '../config/gameConfig.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/dims.js';
import { VirtualJoystick } from '../systems/input/VirtualJoystick.js';
import { inputManager } from '../systems/input/InputManager.js';
import { net } from '../systems/net/Net.js';
import { sfx } from '../systems/audio/Sfx.js';
import { RiftScene, EndMsg } from './RiftScene.js';
import { button, fmtTime, SERIF, SANS, hex, WX_CSS } from '../ui/kit.js';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;
/** 局内能量计数按相生顺序排 */
const WX_ROW: Wuxing[] = [Wuxing.WOOD, Wuxing.FIRE, Wuxing.EARTH, Wuxing.METAL, Wuxing.WATER];
const QI_COLOR = 0x6fd6ff;

/** 只在内容或颜色真的变了时才改：Text 每次 setText / setColor 都会重新栅格化 */
function setTextIf(t: Phaser.GameObjects.Text, text: string, color?: string): void {
  if (t.text !== text) t.setText(text);
  if (color && t.style.color !== color) t.setColor(color);
}

interface RoundBtn {
  x: number;
  y: number;
  r: number;
  label: Phaser.GameObjects.Text;
  cd: Phaser.GameObjects.Graphics;
  cdText: Phaser.GameObjects.Text;
  /** 灵力消耗（0 = 不耗灵力） */
  cost: number;
  costText?: Phaser.GameObjects.Text;
  parts: Phaser.GameObjects.GameObject[];
}

/**
 * 秘境界面：摇杆与技能键、进度、同伴、小地图、结算
 */
export class RiftHUDScene extends Phaser.Scene {
  private rift!: RiftScene;
  private joystick!: VirtualJoystick;
  private btnDodge!: RoundBtn;
  private btnGuard!: RoundBtn;
  private skillBtns: { b: RoundBtn; id: SkillId }[] = [];
  private gfx!: Phaser.GameObjects.Graphics;
  private mini!: Phaser.GameObjects.Graphics;
  private topText!: Phaser.GameObjects.Text;
  private progText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private qiText!: Phaser.GameObjects.Text;
  private wxTexts: Phaser.GameObjects.Text[] = [];
  private carryText!: Phaser.GameObjects.Text;
  private critText!: Phaser.GameObjects.Text;
  private downText!: Phaser.GameObjects.Text;
  private netText!: Phaser.GameObjects.Text;
  private mateTexts: Phaser.GameObjects.Text[] = [];
  private endLayer: Phaser.GameObjects.Container | null = null;
  private controls: Phaser.GameObjects.GameObject[] = [];
  private slowT = 0;
  private netT = 0;
  private miniT = 0;
  private hinted = false;

  constructor() {
    super({ key: 'RiftHUDScene' });
  }

  create(): void {
    applyRenderScale(this);
    this.rift = this.scene.get('RiftScene') as RiftScene;
    this.endLayer = null;
    this.controls = [];
    this.slowT = 0; this.netT = 0; this.miniT = 0; this.hinted = false;
    this.mateTexts = [];

    this.gfx = this.add.graphics();
    this.mini = this.add.graphics();
    this.topText = this.add.text(30, 26, '', { fontFamily: SERIF, fontSize: '30px', fontStyle: 'bold', color: '#ffe9a8', stroke: '#000', strokeThickness: 5 });
    this.progText = this.add.text(W / 2, 96, '', { fontFamily: SERIF, fontSize: '24px', fontStyle: 'bold', color: '#f0e6d3', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
    this.hpText = this.add.text(30, 140, '', { fontFamily: SANS, fontSize: '22px', fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0, 0.5);
    this.qiText = this.add.text(30, 176, '', { fontFamily: SANS, fontSize: '20px', fontStyle: 'bold', color: '#dff6ff', stroke: '#000', strokeThickness: 4 }).setOrigin(0, 0.5);
    // 本局吸纳的五行能量
    this.carryText = this.add.text(30, 246, '', { fontFamily: SANS, fontSize: '20px', fontStyle: 'bold', color: '#c9d1d9', stroke: '#000', strokeThickness: 4 }).setOrigin(0, 0.5);
    this.wxTexts = WX_ROW.map((wx, i) => this.add.text(30 + i * 92, 212, '', {
      fontFamily: SANS, fontSize: '21px', fontStyle: 'bold', color: WX_CSS[wx], stroke: '#000', strokeThickness: 4,
    }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true }).on('pointerup', () => {
      // 点一下切换这一行捡不捡
      const cur = net.profile?.skip ?? [];
      net.send({ t: 'skip', list: cur.includes(wx) ? cur.filter(w => w !== wx) : [...cur, wx] });
    }));
    this.critText = this.add.text(250, 246, '', { fontFamily: SANS, fontSize: '22px', fontStyle: 'bold', color: '#9fd8ff', stroke: '#000', strokeThickness: 4 }).setOrigin(0, 0.5);
    this.downText = this.add.text(W / 2, H * 0.36, '', {
      fontFamily: SERIF, fontSize: '40px', fontStyle: 'bold', color: '#f85149', stroke: '#000', strokeThickness: 6, align: 'center',
    }).setOrigin(0.5);
    for (let i = 0; i < 3; i++) {
      this.mateTexts.push(this.add.text(30, 276 + i * 52, '', { fontFamily: SANS, fontSize: '22px', fontStyle: 'bold', color: '#79c0ff', stroke: '#000', strokeThickness: 4 }));
    }

    // 撤离
    const leave = this.add.text(W - 30, 26, '撤离', {
      fontFamily: SERIF, fontSize: '26px', color: '#8b949e', backgroundColor: '#0d1117cc', padding: { x: 16, y: 8 },
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    leave.on('pointerup', () => this.confirmLeave());
    // 延迟与帧率：分辨卡顿来自网络还是手机性能
    this.netText = this.add.text(W - 30, 318, '', { fontFamily: SANS, fontSize: '20px', fontStyle: 'bold', stroke: '#000', strokeThickness: 4 }).setOrigin(1, 0);

    this.createControls();
  }

  // ───────────────────────── 操控 ─────────────────────────

  private createControls(): void {
    this.joystick = new VirtualJoystick(this, 176, H - 250, 92, H * 0.40);
    this.btnDodge = this.roundButton(W - 128, H - 200, 74, '遁', 0x9fd8ff, 46, () => inputManager.pressDash());
    this.btnGuard = this.roundButton(W - 300, H - 140, 60, '御', 0xffe9a8, 40, () => inputManager.pressGuard());
    // 技能键：带了几门就出几个，上方标熟练度
    const spots = [[W - 300, H - 320], [W - 150, H - 400]];
    this.skillBtns = this.rift.slots.slice(0, spots.length).map((id, i) => {
      const def = SKILLS[id];
      const b = this.roundButton(spots[i][0], spots[i][1], 60, def.name, WX_TINT[def.wuxing], 30, () => inputManager.pressSkill(i), def.qi);
      const rank = this.add.text(b.x, b.y - b.r - 14, SKILL_RANKS[Math.max(0, this.rift.skillLv[id])], { fontFamily: SERIF, fontSize: '19px', fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
      b.parts.push(rank);
      this.controls.push(rank);
      return { b, id };
    });
  }

  private roundButton(x: number, y: number, r: number, text: string, color: number, size: number, onPress: () => void, cost: number = 0): RoundBtn {
    const bg = this.add.graphics();
    bg.fillStyle(0x0b1016, 0.72);
    bg.fillCircle(x, y, r);
    bg.fillStyle(color, 0.16);
    bg.fillCircle(x, y, r);
    bg.lineStyle(3, color, 0.9);
    bg.strokeCircle(x, y, r);
    bg.lineStyle(1.5, color, 0.35);
    bg.strokeCircle(x, y, r - 8);
    const glow = this.add.image(x, y, 'fx_glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale((r * 2.6) / 256).setAlpha(0);
    const costText = cost > 0
      ? this.add.text(x, y + r + 16, `灵力 ${cost}`, { fontFamily: SANS, fontSize: '19px', fontStyle: 'bold', color: hex(QI_COLOR), stroke: '#000', strokeThickness: 4 }).setOrigin(0.5)
      : undefined;
    const parts: Phaser.GameObjects.GameObject[] = costText ? [costText] : [];
    const label = this.add.text(x, y, text, { fontFamily: SERIF, fontSize: `${size}px`, fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 4 }).setOrigin(0.5);
    const cd = this.add.graphics();
    const cdText = this.add.text(x, y, '', { fontFamily: SERIF, fontSize: `${Math.round(size * 0.85)}px`, fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5).setVisible(false);
    const hit = this.add.circle(x, y, r + 10, 0xffffff, 0).setInteractive();
    hit.on('pointerdown', () => {
      sfx.unlock();
      onPress();
      glow.setAlpha(0.9);
      this.tweens.add({ targets: glow, alpha: 0, duration: 260 });
    });
    parts.push(bg, glow, label, cd, cdText, hit);
    this.controls.push(...parts);
    return { x, y, r, label, cd, cdText, cost, costText, parts };
  }

  private setCd(b: RoundBtn, remain: number, total: number): void {
    const pct = total > 0 ? remain / total : 0;
    b.cd.clear();
    // 灵力不够：整个按钮压暗，消耗标红
    const lack = b.cost > 0 && this.rift.qi < b.cost;
    b.label.setAlpha(pct > 0.001 ? 0.2 : lack ? 0.35 : 1);
    if (b.costText) {
      const col = lack ? '#f85149' : hex(QI_COLOR);
      if (b.costText.style.color !== col) b.costText.setColor(col);
    }
    if (lack && pct <= 0.001) {
      b.cd.fillStyle(0x000000, 0.5);
      b.cd.fillCircle(b.x, b.y, b.r);
    }
    if (pct > 0.001) {
      b.cd.fillStyle(0x000000, 0.66);
      b.cd.slice(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct, false);
      b.cd.fillPath();
      setTextIf(b.cdText, remain >= 1000 ? `${Math.ceil(remain / 1000)}` : (remain / 1000).toFixed(1));
      b.cdText.setVisible(true);
    } else {
      b.cdText.setVisible(false);
    }
  }

  // ───────────────────────── 每帧 ─────────────────────────

  update(): void {
    const r = this.rift;
    if (!r?.stats || this.endLayer) return;
    const g = this.gfx;
    g.clear();

    // 不计时：慢慢刷，没有时间限制
    setTextIf(this.topText, TIER_NAMES[r.tier]);
    // 文字每改一次都要重新栅格化，所以延迟 / 帧率半秒刷新一次
    const now = this.time.now;
    const fps = Math.round(this.game.loop.actualFps);
    if (now - this.netT > 500) {
      this.netT = now;
      const rtt = net.rtt;
      setTextIf(this.netText, `延迟 ${rtt}ms · ${fps}帧`, rtt > 250 || fps < 30 ? '#f85149' : rtt > 120 || fps < 50 ? '#e3b23c' : '#3fb950');
    }
    // 持续掉帧：提示切换流畅画质（每局一次）
    this.slowT = fps < 42 ? this.slowT + this.game.loop.delta : 0;
    if (!this.hinted && this.slowT > 6000 && !isLowQuality()) {
      this.hinted = true;
      this.banner('画面不够流畅？', '可在主菜单把画质切换为「流畅」', 0xe3b23c);
    }

    // 进度 / 核心血条
    const bx = 90, bw = W - 180, by = 76, bh = 40;
    g.fillStyle(0x000000, 0.6);
    g.fillRoundedRect(bx - 4, by - 4, bw + 8, bh + 8, 12);
    const boss = r.bossHp;
    if (boss) {
      const p = Phaser.Math.Clamp(boss.hp / boss.max, 0, 1);
      g.fillStyle(0xc9a0ff, 1);
      g.fillRoundedRect(bx, by, Math.max(1, bw * p), bh, 10);
      setTextIf(this.progText, `病变核心 ${Math.ceil(p * 100)}%`);
    } else {
      const p = Phaser.Math.Clamp(r.progress / PROGRESS_GOAL, 0, 1);
      g.fillStyle(0xd4a853, 1);
      g.fillRoundedRect(bx, by, Math.max(1, bw * p), bh, 10);
      setTextIf(this.progText, p >= 1 ? '病变核心即将现身…' : `净化进度 ${Math.floor(p * 100)}%`);
    }

    // 自己的生命
    const hpw = 300;
    const hpP = Phaser.Math.Clamp(r.hp / r.stats.maxHp, 0, 1);
    g.fillStyle(0x000000, 0.6);
    g.fillRoundedRect(26, 126, hpw + 8, 30, 10);
    g.fillStyle(hpP > 0.35 ? 0x3fb950 : 0xf85149, 1);
    g.fillRoundedRect(30, 130, Math.max(1, hpw * hpP), 22, 8);
    setTextIf(this.hpText, `${Math.ceil(r.hp)} / ${r.stats.maxHp}`);
    // 灵力：吸纳能量获得，放技能消耗
    const qiP = Phaser.Math.Clamp(r.qi / r.stats.qiMax, 0, 1);
    g.fillStyle(0x000000, 0.6);
    g.fillRoundedRect(26, 164, hpw + 8, 24, 8);
    g.fillStyle(QI_COLOR, 1);
    if (qiP > 0.01) g.fillRoundedRect(30, 168, hpw * qiP, 16, 6);
    // 两个技能的门槛刻度
    g.fillStyle(0x000000, 0.55);
    for (const c of this.skillBtns.map(k => SKILLS[k.id].qi)) g.fillRect(30 + hpw * Math.min(1, c / r.stats.qiMax) - 1, 166, 2, 20);
    setTextIf(this.qiText, `灵力 ${Math.floor(r.qi)} / ${r.stats.qiMax}`);
    const skip = net.profile?.skip ?? [];
    WX_ROW.forEach((wx, i) => setTextIf(this.wxTexts[i], skip.includes(wx) ? `${WUXING_NAMES[wx]} 不捡` : `${WUXING_NAMES[wx]} ${r.gained[wx]}`, skip.includes(wx) ? '#6e7681' : WX_CSS[wx]));
    const carried = energyTotal(r.gained);
    const full = carried >= r.stats.carry;
    setTextIf(this.carryText, full ? `带回 ${carried}/${r.stats.carry} 已满` : `带回 ${carried}/${r.stats.carry}`, full ? '#e3b23c' : '#c9d1d9');
    setTextIf(this.critText, r.critCharges > 0 ? `必暴 ×${r.critCharges}` : '');

    // 同伴
    const mates = r.mateList;
    this.mateTexts.forEach((t, i) => {
      const m = mates[i];
      if (!m) { setTextIf(t, ''); return; }
      setTextIf(t, m.down ? `${m.info.name} · 倒地` : m.info.name, m.down ? '#f85149' : '#79c0ff');
      const y = 276 + i * 52 + 30;
      g.fillStyle(0x000000, 0.6);
      g.fillRect(30, y, 180, 10);
      g.fillStyle(0x58a6ff, 1);
      g.fillRect(30, y, 180 * Phaser.Math.Clamp(m.hp / Math.max(1, m.max), 0, 1), 10);
    });

    if (r.down && !r.ended) {
      setTextIf(this.downText, mates.some(m => !m.down) ? '你倒下了\n等待同伴靠近救援' : '你倒下了', '#f85149');
    } else if (r.rescuing) {
      setTextIf(this.downText, '救援中…', '#3fb950');
    } else {
      setTextIf(this.downText, '');
    }

    if (now - this.miniT > 120) { this.miniT = now; this.drawMinimap(); }

    // 冷却
    this.setCd(this.btnDodge, r.cdDodge, DODGE.cooldown);
    this.setCd(this.btnGuard, r.cdGuard, GUARD.cooldown);
    for (const k of this.skillBtns) this.setCd(k.b, r.cdLeft(k.id), r.cdOf(k.id));
  }

  private drawMinimap(): void {
    const r = this.rift;
    const m = this.mini;
    m.clear();
    const size = 170, x0 = W - 30 - size, y0 = 130;
    m.fillStyle(0x000000, 0.5);
    m.fillRoundedRect(x0, y0, size, size, 14);
    m.lineStyle(2, 0xd4a853, 0.5);
    m.strokeRoundedRect(x0, y0, size, size, 14);
    // 以自己为中心，显示周围 2400 范围
    const me = r.myPos;
    const span = 2400;
    const k = size / span;
    const toMap = (wx: number, wy: number): [number, number] | null => {
      const mx = x0 + size / 2 + (wx - me.x) * k;
      const my = y0 + size / 2 + (wy - me.y) * k;
      if (mx < x0 + 3 || mx > x0 + size - 3 || my < y0 + 3 || my > y0 + size - 3) return null;
      return [mx, my];
    };
    for (const e of r.enemyDots) {
      const p = toMap(e.x, e.y);
      if (!p) continue;
      m.fillStyle(e.tier === 2 ? 0xc9a0ff : 0xf85149, 1);
      m.fillCircle(p[0], p[1], e.tier === 2 ? 6 : e.tier === 1 ? 4 : 2.2);
    }
    for (const o of r.orbDots) {
      const p = toMap(o.x, o.y);
      if (!p) continue;
      m.fillStyle(WX_TINT[o.wx], 0.9);
      m.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3);
    }
    for (const mt of r.mateList) {
      const p = toMap(mt.x, mt.y);
      if (!p) continue;
      m.fillStyle(mt.down ? 0xf85149 : 0x58a6ff, 1);
      m.fillCircle(p[0], p[1], 5);
    }
    m.fillStyle(0xffe9a8, 1);
    m.fillCircle(x0 + size / 2, y0 + size / 2, 5);
  }

  // ───────────────────────── 提示与结算 ─────────────────────────

  banner(title: string, sub: string, color: number): void {
    const t = this.add.text(W / 2, H * 0.27, title, {
      fontFamily: SERIF, fontSize: '54px', fontStyle: 'bold', color: hex(color), stroke: '#000', strokeThickness: 7,
    }).setOrigin(0.5).setAlpha(0);
    const s = this.add.text(W / 2, H * 0.27 + 62, sub, {
      fontFamily: SERIF, fontSize: '28px', color: '#f0e6d3', stroke: '#000', strokeThickness: 5,
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: [t, s], alpha: 1, duration: 300, yoyo: true, hold: 1600, onComplete: () => { t.destroy(); s.destroy(); } });
  }

  private confirmLeave(): void {
    if (this.endLayer) return;
    const c = this.add.container(0, 0).setDepth(2000);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0, 0.7).setInteractive();
    c.add(shade);
    c.add(this.add.text(W / 2, H * 0.4, '撤离秘境？', { fontFamily: SERIF, fontSize: '46px', fontStyle: 'bold', color: '#ffe9a8' }).setOrigin(0.5));
    c.add(this.add.text(W / 2, H * 0.4 + 70, (net.room?.players.length ?? 1) > 1 ? '地上的能量会留给还在打的同伴' : '地上的能量会自动收走（不超过带回上限，设了不捡的除外）', { fontFamily: SERIF, fontSize: '26px', color: '#8b949e' }).setOrigin(0.5));
    c.add(button(this, W / 2 - 150, H * 0.55, 240, 90, '继续', () => c.destroy(), { color: 0x8b949e }));
    c.add(button(this, W / 2 + 150, H * 0.55, 240, 90, '撤离', () => { net.send({ t: (net.room?.players.length ?? 1) > 1 ? 'exit' : 'leave' }); this.backToCamp(); }));
  }

  showEnd(m: EndMsg): void {
    if (this.endLayer) return;
    this.controls.forEach(o => (o as any).setVisible?.(false));
    this.downText.setText('');
    this.joystick.setEnabled(false);
    const r = this.rift;
    const c = this.add.container(0, 0).setDepth(3000);
    this.endLayer = c;
    c.add(this.add.rectangle(W / 2, H / 2, W, H, 0, 0.78).setInteractive());
    c.add(this.add.text(W / 2, 260, m.ok ? '此重天已净化' : '净化失败', {
      fontFamily: SERIF, fontSize: '62px', fontStyle: 'bold', color: m.ok ? '#ffe9a8' : '#f85149', stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5));
    const lines = [
      TIER_NAMES[m.tier],
      `击杀 ${r.kills}　每分钟 ${m.ms > 0 ? Math.round((r.kills / m.ms) * 60000) : 0}`,
    ];
    if (m.ok && m.tier < 9) lines.push(`已解锁 ${TIER_NAMES[m.tier + 1]}`);
    c.add(this.add.text(W / 2, 350, lines.join('\n'), {
      fontFamily: SERIF, fontSize: '30px', color: '#f0e6d3', align: 'center', lineSpacing: 14,
    }).setOrigin(0.5, 0));

    // 本局吸纳的五行能量（含结算时自动收走的）
    const energy = m.energy ?? r.gained;
    c.add(this.add.text(W / 2, 520, `带回能量 ${energyTotal(energy)} / ${r.stats.carry}`, { fontFamily: SERIF, fontSize: '28px', fontStyle: 'bold', color: '#d4a853' }).setOrigin(0.5));
    WX_ROW.forEach((wx, i) => {
      const x = W / 2 + (i - 2) * 128;
      c.add(this.add.image(x, 600, 'fx_glow').setTint(WX_TINT[wx]).setBlendMode(Phaser.BlendModes.ADD).setScale(0.42).setAlpha(0.5));
      c.add(this.add.text(x, 588, WUXING_NAMES[wx], { fontFamily: SERIF, fontSize: '44px', fontStyle: 'bold', color: WX_CSS[wx], stroke: '#000', strokeThickness: 4 }).setOrigin(0.5));
      c.add(this.add.text(x, 642, `+${energy[wx] ?? 0}`, { fontFamily: SANS, fontSize: '28px', fontStyle: 'bold', color: '#f0e6d3' }).setOrigin(0.5));
    });

    c.add(button(this, W / 2, H - 220, 420, 110, '返回营地', () => this.backToCamp(), { fontSize: 38 }));
  }

  private backToCamp(): void {
    // 单人的临时队伍用完即散；组了队的留在队伍里，回营地接着挂机、随时再开一局
    const room = net.room;
    if (room && room.players.length <= 1) net.send({ t: 'leave' });
    this.joystick?.destroy();
    this.scene.stop();
    this.rift.scene.start('CampScene');
  }
}
