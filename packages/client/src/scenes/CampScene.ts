import Phaser from 'phaser';
import {
  GearItem, PATHS, Wuxing, WUXING_NAMES, WUXING_GENERATES,
  computeStats, powerOf, salvageValue, RARITY_NAMES, RARITY_CSS,
  TIER_NAMES, MAX_PARTY, ProfileView, RoomView, PlayerStats,
  refineCost, MAX_GRADE, displayName, formOf,
  CULT, MAX_CULT, CULT_GAP, cultCost, cultBlock, motherOf, realmOf, realmIndex, REALM_COLORS, energyTotal,
} from '@xiyou/shared';
import { Avatar } from '../systems/avatar/Avatar.js';
import { applyRenderScale } from '../config/gameConfig.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/dims.js';
import { WX_TINT } from '../config/worldConfig.js';
import { Fx } from '../systems/fx/Fx.js';
import { WorldBackdrop } from '../systems/world/WorldBackdrop.js';
import { net } from '../systems/net/Net.js';
import { sfx } from '../systems/audio/Sfx.js';
import { button, gearIcon, itemLines, toast, fmtTime, hex, SERIF, SANS, GOLD, WX_CSS } from '../ui/kit.js';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;
const COLS = 6;
const ROWS = 2;
const CELL = 104;
const PAGE = COLS * ROWS;

/** 修炼面板按相生顺序排：左边那一行生右边那一行 */
const CULT_ORDER: Wuxing[] = [Wuxing.WOOD, Wuxing.FIRE, Wuxing.EARTH, Wuxing.METAL, Wuxing.WATER];

/**
 * 营地：五行修炼、兵器、选秘境、组队
 */
export class CampScene extends Phaser.Scene {
  private dyn!: Phaser.GameObjects.Container;
  private popup: Phaser.GameObjects.Container | null = null;
  private page = 0;
  private tier = 1;
  private offs: (() => void)[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private avatar!: Avatar;
  private avatarSig = '';

  constructor() {
    super({ key: 'CampScene' });
  }

  create(): void {
    applyRenderScale(this);
    Fx.ensureTextures(this);
    WorldBackdrop.ensureTextures(this);
    this.cameras.main.setBackgroundColor('#05080b');
    this.add.tileSprite(W / 2, H / 2, W, H, 'bg_ground').setTint(0x56656c).setAlpha(0.55);
    this.add.image(W / 2, H / 2, 'fx_vignette').setDisplaySize(W * 1.3, H * 1.2).setAlpha(0.8);

    // 人形预览：穿什么显示什么
    this.add.image(W / 2, 345, 'fx_glow').setTint(0x9fd8ff).setBlendMode(Phaser.BlendModes.ADD).setScale(1.3, 0.5).setAlpha(0.25);
    this.avatar = new Avatar(this, W / 2, 345, null, 1.6).setDepth(5).setVisible(false);
    this.avatarSig = '';
    this.dyn = this.add.container(0, 0);
    this.popup = null;
    this.statusText = this.add.text(W - 20, 16, '', { fontFamily: SANS, fontSize: '20px', color: '#6e7681' }).setOrigin(1, 0).setDepth(50);

    this.offs = [
      net.on('profile', () => this.refresh()),
      net.on('room', () => this.refresh()),
      net.on('status', () => this.refresh()),
      net.on('err', (m: { msg: string }) => toast(this, m.msg, '#f85149')),
      net.on('toast', (m: { msg: string }) => toast(this, m.msg)),
      net.on('runStart', (m: unknown) => this.enterRift(m)),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.offs.forEach(f => f()));

    net.connect();
    this.tier = Math.min(net.profile?.maxTier ?? 1, Number(localStorage.getItem('5ele_tier')) || (net.profile?.maxTier ?? 1));
    this.refresh();
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  update(_t: number, delta: number): void {
    if (this.avatar.visible) this.avatar.tick(Math.min(50, delta));
    const s = net.status === 'online' ? `在线 · ${net.rtt}ms` : net.status === 'connecting' ? '连接中…' : '离线，正在重连';
    if (this.statusText.text !== s) this.statusText.setText(s);
  }

  private enterRift(start: unknown): void {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('RiftScene', { start }));
  }

  // ───────────────────────── 整体刷新 ─────────────────────────

  private refresh(): void {
    this.dyn.removeAll(true);
    const p = net.profile;
    if (!p) {
      this.dyn.add(this.add.text(W / 2, H / 2, net.status === 'offline' ? '无法连接服务器\n正在重试…' : '正在连接…', {
        fontFamily: SERIF, fontSize: '36px', color: '#8b949e', align: 'center',
      }).setOrigin(0.5));
      return;
    }
    this.tier = Math.max(1, Math.min(p.maxTier, this.tier));
    this.avatar.setVisible(!!p.path);
    const sig = `${p.path}|${p.weapon ? `${p.weapon.id}${p.weapon.grade ?? 0}` : '-'}|${CULT_ORDER.map(wx => p.cult[wx]).join(',')}`;
    if (sig !== this.avatarSig) { this.avatarSig = sig; this.avatar.setLook({ weapon: p.weapon, path: p.path, cult: p.cult }); }
    if (!p.path) {
      this.drawPathSelect();
      return;
    }
    this.drawHeader(p);
    this.drawCult(p);
    this.drawStash(p);
    if (net.room) this.drawRoom(p, net.room);
    else this.drawRiftPanel(p);
  }

  // ───────────────────────── 入道 ─────────────────────────

  private drawPathSelect(): void {
    const d = this.dyn;
    d.add(this.add.text(W / 2, 150, '择 一 道 而 修', { fontFamily: SERIF, fontSize: '52px', fontStyle: 'bold', color: '#ffe9a8' }).setOrigin(0.5));
    d.add(this.add.text(W / 2, 225, '五行之道只能择其一，入道后不可更改', { fontFamily: SERIF, fontSize: '26px', color: '#8b949e' }).setOrigin(0.5));
    const order = [Wuxing.FIRE, Wuxing.METAL, Wuxing.WATER, Wuxing.WOOD, Wuxing.EARTH];
    order.forEach((wx, i) => {
      const def = PATHS[wx];
      const y = 340 + i * 220;
      const g = this.add.graphics();
      g.fillStyle(0x0d1117, 0.9);
      g.fillRoundedRect(50, y - 90, W - 100, 190, 24);
      g.lineStyle(3, WX_TINT[wx], def.available ? 1 : 0.3);
      g.strokeRoundedRect(50, y - 90, W - 100, 190, 24);
      d.add(g);
      d.add(this.add.text(100, y - 60, WUXING_NAMES[wx], { fontFamily: SERIF, fontSize: '84px', fontStyle: 'bold', color: WX_CSS[wx] }).setAlpha(def.available ? 1 : 0.35));
      d.add(this.add.text(220, y - 62, `${def.name} · ${def.role}`, { fontFamily: SERIF, fontSize: '36px', fontStyle: 'bold', color: def.available ? '#f0e6d3' : '#6e7681' }));
      d.add(this.add.text(220, y - 10, def.available ? def.desc : `${def.desc}（尚未开放）`, {
        fontFamily: SERIF, fontSize: '24px', color: def.available ? '#c9d1d9' : '#484f58', wordWrap: { width: 420, useAdvancedWrap: true }, lineSpacing: 6,
      }));
      if (def.available) {
        const hit = this.add.rectangle(W / 2, y + 5, W - 100, 190, 0, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => { sfx.unlock(); sfx.swap(wx); net.send({ t: 'path', path: wx }); });
        d.add(hit);
      }
    });
  }

  // ───────────────────────── 顶栏 ─────────────────────────

  private stats(p: ProfileView): PlayerStats {
    return computeStats(p.weapon, p.path, p.cult);
  }
  /** 战力；传入兵器则算换上它之后的 */
  private power(p: ProfileView, item?: GearItem | null): number {
    return powerOf(item === undefined ? this.stats(p) : computeStats(item, p.path, p.cult));
  }

  private drawHeader(p: ProfileView): void {
    const d = this.dyn;
    const stats = this.stats(p);
    const name = this.add.text(36, 34, `${p.name} ✎`, { fontFamily: SERIF, fontSize: '34px', fontStyle: 'bold', color: '#f0e6d3' })
      .setInteractive({ useHandCursor: true });
    name.on('pointerup', () => {
      const n = window.prompt('修改名号（最多 10 字）', p.name);
      if (n && n.trim()) { localStorage.setItem('5ele_name', n.trim()); net.send({ t: 'name', name: n.trim() }); }
    });
    d.add(name);
    d.add(this.add.text(36, 82, PATHS[p.path!].name, { fontFamily: SERIF, fontSize: '26px', color: WX_CSS[p.path!] }));
    d.add(this.add.text(W - 36, 34, `战力 ${powerOf(stats)}`, { fontFamily: SERIF, fontSize: '40px', fontStyle: 'bold', color: '#ffe066' }).setOrigin(1, 0));
    d.add(this.add.text(W - 36, 86, `${realmOf(p.cult)}境 · 修为 ${energyTotal(p.cult)} 重`, {
      fontFamily: SERIF, fontSize: '24px', color: hex(REALM_COLORS[realmIndex(p.cult)]),
    }).setOrigin(1, 0));

    // 左侧属性
    const lines = [
      `攻击 ${stats.attack}`,
      `生命 ${stats.maxHp}`,
      `暴击 ${Math.round(stats.crit)}%`,
      `暴伤 +${Math.round(stats.critDmg)}%`,
      `减伤 ${Math.round(stats.dr)}%`,
      `回血 ${stats.regen.toFixed(1)}/秒`,
      `冷却 -${Math.round(stats.cdr)}%`,
      `灵力 ${stats.qiMax}`,
    ];
    d.add(this.add.text(36, 134, lines.join('\n'), { fontFamily: SANS, fontSize: '20px', color: '#8b949e', lineSpacing: 6 }));

    // 右侧：手里的兵器
    const wx = W - 116, wy = 218;
    const it = p.weapon;
    d.add(gearIcon(this, wx, wy, 132, it, '空手'));
    if (it) {
      const form = formOf(it);
      d.add(this.add.text(wx, wy + 76, displayName(it), {
        fontFamily: SERIF, fontSize: '21px', fontStyle: 'bold', color: RARITY_CSS[it.rarity], align: 'center', wordWrap: { width: 220, useAdvancedWrap: true },
      }).setOrigin(0.5, 0));
      d.add(this.add.text(wx, wy + 106, `${form.melee ? '近战' : '远程'} · ${form.move}`, {
        fontFamily: SANS, fontSize: '20px', color: form.melee ? '#ffb36b' : '#9fd8ff',
      }).setOrigin(0.5, 0));
      const hit = this.add.rectangle(wx, wy + 30, 200, 210, 0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this.showItem(it, 'equip'));
      d.add(hit);
    }
  }

  // ───────────────────────── 五行修炼 ─────────────────────────

  private drawCult(p: ProfileView): void {
    const d = this.dyn;
    const top = 400;
    d.add(this.add.text(36, top, '五行修炼', { fontFamily: SERIF, fontSize: '28px', fontStyle: 'bold', color: '#d4a853' }));
    d.add(this.add.text(W - 36, top + 6, '吸纳妖异残留的能量，充盈五行', { fontFamily: SANS, fontSize: '20px', color: '#6e7681' }).setOrigin(1, 0));

    const cw = 126, gap = (W - 48 - cw * 5) / 4, ch = 286;
    CULT_ORDER.forEach((wx, i) => {
      const x = 24 + cw / 2 + i * (cw + gap);
      const y0 = top + 46;
      const lv = p.cult[wx];
      const block = cultBlock(p.cult, p.energy, wx);
      const cost = cultCost(lv);
      const g = this.add.graphics();
      g.fillStyle(0x0d1117, 0.9);
      g.fillRoundedRect(x - cw / 2, y0, cw, ch, 18);
      g.fillStyle(WX_TINT[wx], 0.08);
      g.fillRoundedRect(x - cw / 2, y0, cw, ch, 18);
      g.lineStyle(2.5, WX_TINT[wx], block === '' ? 1 : 0.45);
      g.strokeRoundedRect(x - cw / 2, y0, cw, ch, 18);
      // 能量进度：离下一重还差多少
      if (block !== 'max') {
        const pct = Phaser.Math.Clamp(p.energy[wx] / cost, 0, 1);
        g.fillStyle(0x000000, 0.6);
        g.fillRoundedRect(x - cw / 2 + 10, y0 + 186, cw - 20, 10, 5);
        g.fillStyle(WX_TINT[wx], 1);
        if (pct > 0.02) g.fillRoundedRect(x - cw / 2 + 10, y0 + 186, (cw - 20) * pct, 10, 5);
      }
      d.add(g);
      if (block === '') {
        const glow = this.add.image(x, y0 + 46, 'fx_glow').setTint(WX_TINT[wx]).setBlendMode(Phaser.BlendModes.ADD).setScale(0.5).setAlpha(0.5);
        this.tweens.add({ targets: glow, alpha: 0.2, duration: 800, yoyo: true, repeat: -1 });
        d.add(glow);
      }
      d.add(this.add.text(x, y0 + 46, WUXING_NAMES[wx], { fontFamily: SERIF, fontSize: '58px', fontStyle: 'bold', color: WX_CSS[wx], stroke: '#000', strokeThickness: 4 }).setOrigin(0.5));
      d.add(this.add.text(x, y0 + 100, CULT[wx].name, { fontFamily: SERIF, fontSize: '22px', color: '#c9d1d9' }).setOrigin(0.5));
      d.add(this.add.text(x, y0 + 136, `${lv} 重`, { fontFamily: SERIF, fontSize: '30px', fontStyle: 'bold', color: '#f0e6d3' }).setOrigin(0.5));
      d.add(this.add.text(x, y0 + 168, block === 'max' ? `能量 ${p.energy[wx]}` : `${p.energy[wx]} / ${cost}`, {
        fontFamily: SANS, fontSize: '20px', fontStyle: 'bold', color: WX_CSS[wx],
      }).setOrigin(0.5));
      const info = this.add.rectangle(x, y0 + 100, cw, 200, 0, 0).setInteractive({ useHandCursor: true });
      info.on('pointerup', () => this.showCult(wx));
      d.add(info);
      const label = block === 'max' ? '圆满' : block === 'mother' ? `先修${WUXING_NAMES[motherOf(wx)]}` : '修炼';
      d.add(button(this, x, y0 + ch - 42, cw - 16, 60, label, () => {
        if (block === '') { sfx.shapeOk(wx); net.send({ t: 'cultivate', wx }); } else this.showCult(wx);
      }, { fontSize: 24, color: block === '' ? WX_TINT[wx] : 0x6e7681 }));
      // 相生箭头
      if (i < 4) d.add(this.add.text(x + cw / 2 + gap / 2, y0 + 46, '›', { fontFamily: SANS, fontSize: '26px', color: '#6e7681' }).setOrigin(0.5));
    });
  }

  /** 某一行的修炼详情 */
  private showCult(wx: Wuxing): void {
    const p = net.profile;
    if (!p) return;
    const lv = p.cult[wx];
    const cost = cultCost(lv);
    const block = cultBlock(p.cult, p.energy, wx);
    const mother = motherOf(wx);
    const { c, top } = this.openPopup(640);
    c.add(this.add.text(W / 2, top + 40, `${WUXING_NAMES[wx]}行 · ${CULT[wx].name}`, { fontFamily: SERIF, fontSize: '46px', fontStyle: 'bold', color: WX_CSS[wx] }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, top + 110, `当前 ${lv} / ${MAX_CULT} 重`, { fontFamily: SERIF, fontSize: '30px', color: '#f0e6d3' }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, top + 170, `每修一重\n${CULT[wx].desc.replace(/　/g, '\n')}`, {
      fontFamily: SANS, fontSize: '25px', color: '#c9d1d9', align: 'center', lineSpacing: 8,
    }).setOrigin(0.5, 0));
    const tips = [
      `${WUXING_NAMES[wx]}行能量来自${WUXING_NAMES[wx]}属妖异的残留`,
      `${WUXING_NAMES[mother]}生${WUXING_NAMES[wx]}：最多高出${WUXING_NAMES[mother]}行 ${CULT_GAP} 重（${WUXING_NAMES[mother]}行现为 ${p.cult[mother]} 重）`,
      `${WUXING_NAMES[wx]}生${WUXING_NAMES[WUXING_GENERATES[wx]]}：修高了它，${WUXING_NAMES[WUXING_GENERATES[wx]]}行才能继续精进`,
    ];
    c.add(this.add.text(W / 2, top + 350, tips.join('\n'), {
      fontFamily: SANS, fontSize: '21px', color: block === 'mother' ? '#e3b23c' : '#8b949e', align: 'center', lineSpacing: 8, wordWrap: { width: W - 130, useAdvancedWrap: true },
    }).setOrigin(0.5, 0));
    const label = block === 'max' ? '已圆满' : `修炼 · ${WUXING_NAMES[wx]}能量 ${p.energy[wx]}/${cost}`;
    c.add(button(this, W / 2, top + 560, W - 160, 90, label, () => {
      sfx.shapeOk(wx);
      net.send({ t: 'cultivate', wx });
      // 留在这个面板里可以连着修
      this.time.delayedCall(140, () => { if (this.popup) this.showCult(wx); });
    }, { color: WX_TINT[wx], disabled: block !== '', fontSize: 30 }));
  }

  // ───────────────────────── 兵匣 ─────────────────────────

  private sortedStash(p: ProfileView): GearItem[] {
    return [...p.stash].sort((a, b) => b.rarity - a.rarity || b.tier - a.tier || (b.grade ?? 0) - (a.grade ?? 0));
  }

  private drawStash(p: ProfileView): void {
    const d = this.dyn;
    const top = 758;
    d.add(this.add.text(36, top, `兵匣 ${p.stash.length}/${p.stashCap}`, { fontFamily: SERIF, fontSize: '28px', fontStyle: 'bold', color: '#d4a853' }));

    const items = this.sortedStash(p);
    const pages = Math.max(1, Math.ceil(items.length / PAGE));
    this.page = Math.min(this.page, pages - 1);
    const gx = (W - COLS * CELL) / 2;
    const gy = top + 44;
    const cur = this.power(p);
    for (let i = 0; i < PAGE; i++) {
      const it = items[this.page * PAGE + i] ?? null;
      const x = gx + (i % COLS) * CELL + CELL / 2;
      const y = gy + Math.floor(i / COLS) * CELL + CELL / 2;
      d.add(gearIcon(this, x, y, CELL - 10, it));
      if (it) {
        // 比手里的强就标一个绿色箭头
        if (this.power(p, it) > cur) {
          d.add(this.add.text(x + CELL / 2 - 10, y + CELL / 2 - 22, '▲', { fontFamily: SANS, fontSize: '20px', color: '#3fb950', stroke: '#000', strokeThickness: 4 }).setOrigin(1, 1));
        }
        const hit = this.add.rectangle(x, y, CELL - 6, CELL - 6, 0, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => this.showItem(it, 'stash'));
        d.add(hit);
      }
    }
    const by = gy + ROWS * CELL + 36;
    if (pages > 1) {
      d.add(button(this, 90, by, 120, 56, '◀', () => { this.page = (this.page + pages - 1) % pages; this.refresh(); }, { fontSize: 26 }));
      d.add(this.add.text(200, by, `${this.page + 1}/${pages}`, { fontFamily: SANS, fontSize: '24px', color: '#8b949e' }).setOrigin(0.5));
      d.add(button(this, 310, by, 120, 56, '▶', () => { this.page = (this.page + 1) % pages; this.refresh(); }, { fontSize: 26 }));
    }
    d.add(button(this, W - 150, by, 240, 56, '批量化去', () => this.showSalvage(p), { fontSize: 24, color: 0xc084fc }));
  }

  // ───────────────────────── 秘境面板 ─────────────────────────

  private drawPanelBg(top: number): void {
    const g = this.add.graphics();
    g.fillStyle(0x0d1117, 0.92);
    g.fillRoundedRect(24, top, W - 48, H - top - 30, 28);
    g.lineStyle(3, GOLD, 0.7);
    g.strokeRoundedRect(24, top, W - 48, H - top - 30, 28);
    this.dyn.add(g);
  }

  private drawRiftPanel(p: ProfileView): void {
    const d = this.dyn;
    const top = 1090;
    this.drawPanelBg(top);
    d.add(this.add.text(W / 2, top + 26, '秘 境', { fontFamily: SERIF, fontSize: '30px', fontStyle: 'bold', color: '#d4a853' }).setOrigin(0.5, 0));

    const ty = top + 120;
    const setTier = (t: number) => {
      this.tier = Math.max(1, Math.min(p.maxTier, t));
      localStorage.setItem('5ele_tier', String(this.tier));
      this.refresh();
    };
    d.add(button(this, 110, ty, 110, 84, '◀', () => setTier(this.tier - 1), { disabled: this.tier <= 1 }));
    d.add(button(this, W - 110, ty, 110, 84, '▶', () => setTier(this.tier + 1), { disabled: this.tier >= p.maxTier }));
    d.add(this.add.text(W / 2, ty - 18, TIER_NAMES[this.tier], { fontFamily: SERIF, fontSize: '48px', fontStyle: 'bold', color: '#ffe9a8' }).setOrigin(0.5));
    const best = p.best[this.tier];
    d.add(this.add.text(W / 2, ty + 30, best ? `最快 ${fmtTime(best)}` : '尚未通关', { fontFamily: SANS, fontSize: '22px', color: '#8b949e' }).setOrigin(0.5));

    const by = top + 250;
    d.add(button(this, W / 2, by, W - 120, 100, '独自进入', () => {
      sfx.unlock();
      net.send({ t: 'create', tier: this.tier });
      net.send({ t: 'start' });
    }, { fontSize: 36 }));
    d.add(button(this, W / 2 - 160, by + 125, 280, 90, '开房组队', () => { sfx.unlock(); net.send({ t: 'create', tier: this.tier }); }, { fontSize: 30, color: 0x58a6ff }));
    d.add(button(this, W / 2 + 160, by + 125, 280, 90, '加入房间', () => { sfx.unlock(); this.showKeypad(); }, { fontSize: 30, color: 0x58a6ff }));
  }

  private drawRoom(p: ProfileView, room: RoomView): void {
    const d = this.dyn;
    const top = 1090;
    this.drawPanelBg(top);
    const host = room.players.find(q => q.host);
    const isHost = host?.id === net.did;
    d.add(this.add.text(W / 2, top + 22, `房间码 ${room.code}`, { fontFamily: SERIF, fontSize: '44px', fontStyle: 'bold', color: '#79c0ff' }).setOrigin(0.5, 0));
    d.add(this.add.text(W / 2, top + 80, '把房间码告诉同伴，即可一起刷', { fontFamily: SANS, fontSize: '22px', color: '#6e7681' }).setOrigin(0.5, 0));

    // 层数（房主可调）
    const ty = top + 150;
    if (isHost) {
      d.add(button(this, 120, ty, 90, 64, '◀', () => net.send({ t: 'tier', tier: room.tier - 1 }), { disabled: room.tier <= 1, fontSize: 26 }));
      d.add(button(this, W - 120, ty, 90, 64, '▶', () => net.send({ t: 'tier', tier: room.tier + 1 }), { disabled: room.tier >= room.maxTier, fontSize: 26 }));
    }
    d.add(this.add.text(W / 2, ty, TIER_NAMES[room.tier], { fontFamily: SERIF, fontSize: '38px', fontStyle: 'bold', color: '#ffe9a8' }).setOrigin(0.5));

    for (let i = 0; i < MAX_PARTY; i++) {
      const q = room.players[i];
      const x = i % 2 === 0 ? 60 : W / 2 + 10;
      const y = top + 210 + Math.floor(i / 2) * 84;
      const label = q ? `${q.host ? '★' : ''}${q.name}${q.id === net.did ? '（你）' : ''}` : '— 空位 —';
      d.add(this.add.text(x, y, label, { fontFamily: SERIF, fontSize: '27px', color: q ? '#f0e6d3' : '#484f58' }));
      if (q) d.add(this.add.text(x, y + 36, `${q.path ? WUXING_NAMES[q.path] : ''} · 战力 ${q.power}`, { fontFamily: SANS, fontSize: '22px', color: q.path ? WX_CSS[q.path] : '#8b949e' }));
    }

    const by = H - 92;
    d.add(button(this, 170, by, 260, 84, '离开', () => net.send({ t: 'leave' }), { color: 0x8b949e, fontSize: 30 }));
    if (room.state === 'run') {
      d.add(this.add.text(W - 190, by, '秘境进行中…', { fontFamily: SERIF, fontSize: '28px', color: '#8b949e' }).setOrigin(0.5));
    } else if (isHost) {
      d.add(button(this, W - 190, by, 300, 88, '开始', () => net.send({ t: 'start' }), { fontSize: 34 }));
    } else {
      d.add(this.add.text(W - 190, by, '等待房主开始', { fontFamily: SERIF, fontSize: '28px', color: '#8b949e' }).setOrigin(0.5));
    }
  }

  // ───────────────────────── 弹窗 ─────────────────────────

  private closePopup(): void {
    this.popup?.destroy();
    this.popup = null;
  }

  private openPopup(height: number): { c: Phaser.GameObjects.Container; top: number } {
    this.closePopup();
    const c = this.add.container(0, 0).setDepth(1000);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setInteractive();
    shade.on('pointerup', () => this.closePopup());
    const top = Math.max(60, (H - height) / 2);
    const g = this.add.graphics();
    g.fillStyle(0x0d1117, 0.98);
    g.fillRoundedRect(30, top, W - 60, height, 28);
    g.lineStyle(3, GOLD, 0.9);
    g.strokeRoundedRect(30, top, W - 60, height, 28);
    // 面板本身吞掉点击，避免点到遮罩关闭
    const body = this.add.rectangle(W / 2, top + height / 2, W - 60, height, 0, 0).setInteractive();
    c.add([shade, g, body]);
    this.popup = c;
    return { c, top };
  }

  /**
   * 兵器详情
   * @param from 来源：兵匣 / 手里，决定下方的操作按钮
   */
  private showItem(item: GearItem, from: 'stash' | 'equip'): void {
    const p = net.profile!;
    const lines = itemLines(item, p.path);
    const texts: Phaser.GameObjects.Text[] = [];
    let y = 0;
    lines.forEach(l => {
      const t = this.add.text(W / 2, y, l.text, {
        fontFamily: SERIF, fontSize: `${l.size}px`, fontStyle: l.size >= 36 ? 'bold' : 'normal', color: l.color,
        align: 'center', wordWrap: { width: W - 140, useAdvancedWrap: true }, lineSpacing: 4,
      }).setOrigin(0.5, 0);
      texts.push(t);
      y += t.height + 10;
    });

    let cmp: Phaser.GameObjects.Text | null = null;
    if (from === 'stash') {
      const cur = this.power(p);
      const next = this.power(p, item);
      const delta = next - cur;
      const old = p.weapon;
      const a = old ? formOf(old) : null, b = formOf(item);
      const change = a && a.kind !== b.kind ? `出手方式：${a.melee ? '近战' : '远程'}·${a.move} → ${b.melee ? '近战' : '远程'}·${b.move}\n` : '';
      cmp = this.add.text(W / 2, y + 6, `${change}战力 ${cur} → ${next}（${delta >= 0 ? '+' : ''}${delta}）`, {
        fontFamily: SANS, fontSize: '25px', color: delta > 0 ? '#3fb950' : delta < 0 ? '#f85149' : '#8b949e', align: 'center', lineSpacing: 6,
      }).setOrigin(0.5, 0);
      y += cmp.height + 20;
    }

    // 淬炼：消耗与兵器同属的能量
    const g = item.grade ?? 0;
    const cost = refineCost(item);
    const have = p.energy[item.wuxing];
    const canRefine = g < MAX_GRADE && have >= cost;
    const wxName = WUXING_NAMES[item.wuxing];
    const refineText = g >= MAX_GRADE ? '已淬炼至最高阶' : `淬炼 +${g + 1}（全部数值再 +8%）：${wxName}行能量 ${have}/${cost}`;
    const rt = this.add.text(W / 2, y + 6, refineText, { fontFamily: SANS, fontSize: '22px', color: canRefine ? WX_CSS[item.wuxing] : '#6e7681', align: 'center' }).setOrigin(0.5, 0);
    y += rt.height + 16;

    const height = y + 150 + (from === 'stash' ? 220 : 130);
    const { c, top } = this.openPopup(height);
    c.add(gearIcon(this, W / 2, top + 80, 100, item));
    texts.forEach(t => { t.y += top + 150; c.add(t); });
    if (cmp) { cmp.y += top + 150; c.add(cmp); }
    rt.y += top + 150;
    c.add(rt);

    const by2 = top + height - 70;
    const by1 = by2 - 100;
    const close = () => this.closePopup();
    const refineBtn = (bx: number, bw: number, byy: number) => button(this, bx, byy, bw, 80, '淬炼', () => {
      sfx.shapeOk(item.wuxing);
      net.send({ t: 'refine', id: item.id });
      // 留在详情里可以连着淬
      this.time.delayedCall(140, () => {
        const np = net.profile;
        const fresh = np && (np.weapon?.id === item.id ? np.weapon : np.stash.find(i => i.id === item.id));
        if (fresh && this.popup) this.showItem(fresh, from);
      });
    }, { color: WX_TINT[item.wuxing], disabled: !canRefine, fontSize: 28 });
    if (from === 'equip') {
      c.add(refineBtn(W / 2, 340, by2));
    } else {
      c.add(refineBtn(W / 2, 340, by1));
      c.add(button(this, W / 2 - 160, by2, 270, 80, '换上', () => { sfx.swap(item.wuxing); net.send({ t: 'equip', id: item.id }); close(); }));
      c.add(button(this, W / 2 + 160, by2, 270, 80, `化去 ${wxName}+${salvageValue(item)}`, () => { net.send({ t: 'salvage', ids: [item.id] }); close(); }, { color: 0xc084fc, fontSize: 26 }));
    }
  }

  private showSalvage(p: ProfileView): void {
    const { c, top } = this.openPopup(760);
    c.add(this.add.text(W / 2, top + 40, '批量化去', { fontFamily: SERIF, fontSize: '40px', fontStyle: 'bold', color: '#c084fc' }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, top + 100, '兵器化去后返还同属的五行能量；比手里更强的不会动', { fontFamily: SANS, fontSize: '22px', color: '#8b949e' }).setOrigin(0.5, 0));
    const cur = this.power(p);
    for (let r = 0; r <= 3; r++) {
      // 比手里更强的留着
      const ids = p.stash.filter(it => it.rarity <= r && this.power(p, it) <= cur).map(it => it.id);
      const gain = p.stash.filter(it => ids.includes(it.id)).reduce((a, it) => a + salvageValue(it), 0);
      c.add(button(this, W / 2, top + 190 + r * 100, W - 160, 80, `${RARITY_NAMES[r]}及以下 · ${ids.length} 件 · +${gain}`, () => {
        if (ids.length) net.send({ t: 'salvage', ids });
        this.closePopup();
      }, { fontSize: 26, color: Phaser.Display.Color.HexStringToColor(RARITY_CSS[r]).color, disabled: !ids.length }));
    }
    // 拾取时自动化去
    const label = p.autoSalvage < 0 ? '关闭' : `${RARITY_NAMES[p.autoSalvage]}及以下`;
    c.add(this.add.text(W / 2, top + 600, `拾取时自动化去：${label}`, { fontFamily: SERIF, fontSize: '28px', color: '#f0e6d3' }).setOrigin(0.5));
    c.add(button(this, W / 2, top + 675, 300, 70, '切换', () => {
      const next = p.autoSalvage >= 2 ? -1 : p.autoSalvage + 1;
      net.send({ t: 'autoSalvage', r: next });
      this.time.delayedCall(120, () => net.profile && this.showSalvage(net.profile));
    }, { fontSize: 26 }));
  }

  private showKeypad(): void {
    let code = '';
    const { c, top } = this.openPopup(860);
    c.add(this.add.text(W / 2, top + 40, '输入房间码', { fontFamily: SERIF, fontSize: '36px', fontStyle: 'bold', color: '#79c0ff' }).setOrigin(0.5, 0));
    const shown = this.add.text(W / 2, top + 150, '_ _ _ _', { fontFamily: SANS, fontSize: '64px', fontStyle: 'bold', color: '#f0e6d3' }).setOrigin(0.5);
    c.add(shown);
    const render = () => shown.setText((code + '____').slice(0, 4).split('').join(' '));
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '←', '0', '✓'];
    keys.forEach((k, i) => {
      const x = W / 2 + ((i % 3) - 1) * 180;
      const y = top + 280 + Math.floor(i / 3) * 135;
      c.add(button(this, x, y, 160, 110, k, () => {
        if (k === '←') code = code.slice(0, -1);
        else if (k === '✓') {
          if (code.length === 4) { net.send({ t: 'join', code }); this.closePopup(); }
          return;
        } else if (code.length < 4) code += k;
        render();
        if (code.length === 4 && k !== '←') { net.send({ t: 'join', code }); this.closePopup(); }
      }, { fontSize: 44, color: k === '✓' ? 0x3fb950 : 0x58a6ff }));
    });
  }
}
