import Phaser from 'phaser';
import {
  GearItem, EQUIP_SLOTS, EquipSlotKey, slotTypeOf, SLOT_NAME, PATHS, Wuxing, WUXING_NAMES,
  computeStats, powerOf, statsWith, bestSlotFor, salvageValue, RARITY_NAMES, RARITY_CSS,
  TIER_NAMES, MAX_PARTY, ProfileView, RoomView, PlayerStats,
  SETS, SET_ORDER, SetId, pieceKey, craftCost, refineCost, MAX_GRADE, displayName, CODEX_BONUS_PCT,
} from '@xiyou/shared';
import { Avatar } from '../systems/avatar/Avatar.js';
import { applyRenderScale } from '../config/gameConfig.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/dims.js';
import { WX_TINT } from '../config/worldConfig.js';
import { Fx } from '../systems/fx/Fx.js';
import { WorldBackdrop } from '../systems/world/WorldBackdrop.js';
import { net } from '../systems/net/Net.js';
import { sfx } from '../systems/audio/Sfx.js';
import { button, gearIcon, itemLines, toast, fmtTime, SERIF, SANS, GOLD, WX_CSS } from '../ui/kit.js';

const W = GAME_WIDTH;
const H = GAME_HEIGHT;
const COLS = 6;
const ROWS = 4;
const CELL = 104;
const PAGE = COLS * ROWS;

/**
 * 营地：换装、分解、选秘境、组队
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
    this.avatar = new Avatar(this, W / 2, 345, null, 1.7).setDepth(5).setVisible(false);
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
    const sig = Object.values(p.equip).map(i => (i ? `${i.id}${i.grade ?? 0}` : '-')).join('|');
    if (sig !== this.avatarSig) { this.avatarSig = sig; this.avatar.setEquip(p.equip); }
    if (!p.path) {
      this.drawPathSelect();
      return;
    }
    this.drawHeader(p);
    this.drawEquip(p);
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
    return computeStats(p.equip, p.path, p.codex.length);
  }
  private power(p: ProfileView, key?: EquipSlotKey, item?: GearItem | null): number {
    return powerOf(key ? statsWith(p.equip, p.path, key, item ?? null, p.codex.length) : this.stats(p));
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
    d.add(this.add.text(W - 36, 40, `战力 ${powerOf(stats)}`, { fontFamily: SERIF, fontSize: '40px', fontStyle: 'bold', color: '#ffe066' }).setOrigin(1, 0));
    d.add(this.add.text(W - 36, 90, `玄晶 ${p.mats}`, { fontFamily: SANS, fontSize: '24px', color: '#c084fc' }).setOrigin(1, 0));

    // 左侧属性
    const lines = [
      `攻击 ${stats.attack}`,
      `生命 ${stats.maxHp}`,
      `暴击 ${Math.round(stats.crit)}%`,
      `暴伤 +${Math.round(stats.critDmg)}%`,
      `攻速 +${Math.round(stats.aspd)}%`,
      `冷却 -${Math.round(stats.cdr)}%`,
    ];
    d.add(this.add.text(36, 150, lines.join('\n'), { fontFamily: SANS, fontSize: '23px', color: '#8b949e', lineSpacing: 8 }));

    // 右侧：图鉴入口与精魄
    d.add(button(this, W - 110, 172, 170, 70, '图 鉴', () => this.showCodex(), { fontSize: 30, color: 0x3fe0a0 }));
    d.add(this.add.text(W - 110, 212, `已登记 ${p.codex.length} 件\n攻击生命 +${p.codex.length * CODEX_BONUS_PCT}%`, {
      fontFamily: SANS, fontSize: '20px', color: '#6ee7a0', align: 'center', lineSpacing: 4,
    }).setOrigin(0.5, 0));
    const ess = Object.entries(p.essence).filter(([, n]) => n > 0).map(([t, n]) => `${t}重 ×${n}`);
    d.add(this.add.text(W - 110, 268, ess.length ? `精魄\n${ess.slice(-3).join('\n')}` : '精魄 —', {
      fontFamily: SANS, fontSize: '19px', color: '#e0b0ff', align: 'center', lineSpacing: 2,
    }).setOrigin(0.5, 0));
  }

  // ───────────────────────── 装备栏 ─────────────────────────

  private drawEquip(p: ProfileView): void {
    const d = this.dyn;
    const size = 100;
    const gap = (W - 60 - size * 5) / 4;
    EQUIP_SLOTS.forEach((key, i) => {
      const x = 30 + size / 2 + i * (size + gap);
      const y = 440;
      const it = p.equip[key];
      d.add(gearIcon(this, x, y, size, it, SLOT_NAME[slotTypeOf(key)]));
      d.add(this.add.text(x, y + size / 2 + 4, SLOT_NAME[slotTypeOf(key)], { fontFamily: SERIF, fontSize: '20px', color: '#6e7681' }).setOrigin(0.5, 0));
      if (it) {
        const hit = this.add.rectangle(x, y, size, size, 0, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => this.showItem(it, 'equip', key));
        d.add(hit);
      }
    });
  }

  // ───────────────────────── 灵囊 ─────────────────────────

  private sortedStash(p: ProfileView): GearItem[] {
    return [...p.stash].sort((a, b) => (b.set ? 1 : 0) - (a.set ? 1 : 0) || b.rarity - a.rarity || b.tier - a.tier);
  }

  private drawStash(p: ProfileView): void {
    const d = this.dyn;
    const top = 524;
    d.add(this.add.text(36, top, `灵囊 ${p.stash.length}/${p.stashCap}`, { fontFamily: SERIF, fontSize: '28px', fontStyle: 'bold', color: '#d4a853' }));

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
        // 比身上的好就标一个绿色箭头
        if (this.power(p, bestSlotFor(p.equip, p.path, it), it) > cur) {
          d.add(this.add.text(x + CELL / 2 - 10, y + CELL / 2 - 22, '▲', { fontFamily: SANS, fontSize: '20px', color: '#3fb950', stroke: '#000', strokeThickness: 4 }).setOrigin(1, 1));
        }
        const hit = this.add.rectangle(x, y, CELL - 6, CELL - 6, 0, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => this.showItem(it, 'stash'));
        d.add(hit);
      }
    }
    const by = gy + ROWS * CELL + 36;
    if (pages > 1) {
      d.add(button(this, 90, by, 120, 60, '◀', () => { this.page = (this.page + pages - 1) % pages; this.refresh(); }, { fontSize: 28 }));
      d.add(this.add.text(200, by, `${this.page + 1}/${pages}`, { fontFamily: SANS, fontSize: '24px', color: '#8b949e' }).setOrigin(0.5));
      d.add(button(this, 310, by, 120, 60, '▶', () => { this.page = (this.page + 1) % pages; this.refresh(); }, { fontSize: 28 }));
    }
    d.add(button(this, W - 150, by, 240, 60, '批量分解', () => this.showSalvage(p), { fontSize: 26, color: 0xc084fc }));
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
   * 装备详情
   * @param from 来源：灵囊 / 身上 / 图鉴，决定下方的操作按钮
   */
  private showItem(item: GearItem, from: 'stash' | 'equip' | 'vault', equippedAt?: EquipSlotKey): void {
    const p = net.profile!;
    const lines = itemLines(item, p.path, p.equip);
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

    let compare = '';
    let compareColor = '#8b949e';
    const slot = equippedAt ?? bestSlotFor(p.equip, p.path, item);
    if (from !== 'equip') {
      const cur = this.power(p);
      const next = this.power(p, slot, item);
      const delta = next - cur;
      const old = p.equip[slot];
      compare = `${old ? `替换 ${displayName(old)}` : '穿戴到空栏位'}\n战力 ${cur} → ${next}（${delta >= 0 ? '+' : ''}${delta}）`;
      compareColor = delta > 0 ? '#3fb950' : delta < 0 ? '#f85149' : '#8b949e';
    }
    const cmp = compare ? this.add.text(W / 2, y + 6, compare, { fontFamily: SANS, fontSize: '25px', color: compareColor, align: 'center', lineSpacing: 6 }).setOrigin(0.5, 0) : null;
    if (cmp) y += cmp.height + 20;

    // 升阶信息
    const g = item.grade ?? 0;
    const rc = refineCost(item.tier, g);
    const have = p.essence[item.tier] ?? 0;
    const canRefine = g < MAX_GRADE && have >= rc.essence && p.mats >= rc.mats;
    const refineText = g >= MAX_GRADE ? '已是最高阶' : `升阶 +${g + 1}：${item.tier}重天精魄 ${have}/${rc.essence} · 玄晶 ${p.mats}/${rc.mats}`;
    const rt = this.add.text(W / 2, y + 6, refineText, { fontFamily: SANS, fontSize: '22px', color: canRefine ? '#e0b0ff' : '#6e7681', align: 'center' }).setOrigin(0.5, 0);
    y += rt.height + 16;

    const height = y + 150 + 220;
    const { c, top } = this.openPopup(height);
    c.add(gearIcon(this, W / 2, top + 80, 100, item));
    texts.forEach(t => { t.y += top + 150; c.add(t); });
    if (cmp) { cmp.y += top + 150; c.add(cmp); }
    rt.y += top + 150;
    c.add(rt);

    const by1 = top + height - 170;
    const by2 = top + height - 70;
    const close = () => this.closePopup();
    const refineBtn = (x: number, w: number) => button(this, x, by1, w, 80, `升阶`, () => { net.send({ t: 'refine', id: item.id }); close(); }, { color: 0xe0b0ff, disabled: !canRefine, fontSize: 28 });
    if (from === 'equip') {
      c.add(refineBtn(W / 2, 300));
      c.add(button(this, W / 2, by2, 300, 80, '卸下', () => { net.send({ t: 'unequip', slot: equippedAt! }); close(); }));
    } else if (from === 'vault') {
      c.add(refineBtn(W / 2, 300));
      c.add(button(this, W / 2, by2, 300, 80, '取出穿戴', () => { sfx.swap(item.wuxing); net.send({ t: 'withdraw', id: item.id }); close(); }));
    } else {
      if (item.set) {
        const k = pieceKey(item.set, item.piece ?? 0);
        const fresh = !p.codex.includes(k);
        c.add(button(this, W / 2 - 160, by1, 270, 80, fresh ? '登记图鉴' : '替换图鉴', () => { net.send({ t: 'register', id: item.id }); close(); }, { color: 0x3fe0a0, fontSize: 28 }));
        c.add(refineBtn(W / 2 + 160, 270));
      } else {
        c.add(refineBtn(W / 2, 300));
      }
      c.add(button(this, W / 2 - 160, by2, 270, 80, '穿戴', () => { sfx.swap(item.wuxing); net.send({ t: 'equip', id: item.id, slot }); close(); }));
      c.add(button(this, W / 2 + 160, by2, 270, 80, `分解 +${salvageValue(item)}`, () => { net.send({ t: 'salvage', ids: [item.id] }); close(); }, { color: 0xc084fc, fontSize: 26 }));
    }
  }

  // ───────────────────────── 图鉴 ─────────────────────────

  private showCodex(): void {
    const p = net.profile;
    if (!p) return;
    const rowH = 196;
    const height = 150 + SET_ORDER.length * rowH;
    const { c, top } = this.openPopup(height);
    c.add(this.add.text(W / 2, top + 30, '图 鉴', { fontFamily: SERIF, fontSize: '44px', fontStyle: 'bold', color: '#3fe0a0' }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, top + 92, `已登记 ${p.codex.length}/${SET_ORDER.length * 5} · 攻击与生命 +${p.codex.length * CODEX_BONUS_PCT}%`, {
      fontFamily: SANS, fontSize: '22px', color: '#8b949e',
    }).setOrigin(0.5, 0));

    const equipped = new Set(Object.values(p.equip).filter(Boolean).map(i => `${i!.set}:${i!.piece}`));
    SET_ORDER.forEach((id, row) => {
      const set = SETS[id];
      const y0 = top + 140 + row * rowH;
      const unlocked = p.maxTier >= set.lo;
      c.add(this.add.text(56, y0, `${set.name} · ${set.lo}~${set.hi}重天`, { fontFamily: SERIF, fontSize: '28px', fontStyle: 'bold', color: unlocked ? set.css : '#484f58' }));
      const inVault = p.vault.filter(v => v.set === id);
      c.add(this.add.text(56, y0 + 40, `(5) ${set.desc5}`, {
        fontFamily: SANS, fontSize: '18px', color: unlocked ? '#8b949e' : '#484f58',
        wordWrap: { width: inVault.length ? W - 330 : W - 120, useAdvancedWrap: true },
      }));
      if (inVault.length) {
        c.add(button(this, W - 130, y0 + 22, 170, 56, '穿整套', () => { net.send({ t: 'wearSet', set: id }); this.closePopup(); }, { fontSize: 24, color: set.color }));
      }
      set.pieces.forEach((pc, i) => {
        const x = 96 + i * 132;
        const y = y0 + 128;
        const k = pieceKey(id, i);
        const item = p.vault.find(v => v.set === id && v.piece === i) ?? null;
        const registered = p.codex.includes(k);
        const icon = gearIcon(this, x, y, 92, item, pc.kind);
        if (!item) icon.setAlpha(registered ? 0.55 : 0.35);
        c.add(icon);
        if (!item && registered) {
          c.add(this.add.text(x, y + 30, equipped.has(k) ? '穿戴中' : '已登记', { fontFamily: SANS, fontSize: '17px', color: '#6ee7a0', stroke: '#000', strokeThickness: 3 }).setOrigin(0.5));
        }
        const hit = this.add.rectangle(x, y, 96, 96, 0, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => {
          if (item) this.showItem(item, 'vault');
          else this.showCraft(id, i);
        });
        c.add(hit);
      });
    });
  }

  /** 缺的部件：用精魄定向合成 */
  private showCraft(id: SetId, piece: number): void {
    const p = net.profile!;
    const set = SETS[id];
    const pc = set.pieces[piece];
    const cost = craftCost(set);
    const have = p.essence[set.lo] ?? 0;
    const unlocked = p.maxTier >= set.lo;
    const ok = unlocked && have >= cost.essence && p.mats >= cost.mats;
    const { c, top } = this.openPopup(560);
    c.add(gearIcon(this, W / 2, top + 90, 110, null, pc.kind));
    c.add(this.add.text(W / 2, top + 170, pc.name, { fontFamily: SERIF, fontSize: '40px', fontStyle: 'bold', color: set.css }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, top + 230, `${set.name}套装 · ${SLOT_NAME[pc.slot]}\n掉落于 ${set.lo}~${set.hi} 重天，病变核心掉率最高`, {
      fontFamily: SANS, fontSize: '23px', color: '#8b949e', align: 'center', lineSpacing: 6,
    }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, top + 320, unlocked
      ? `合成：${set.lo}重天精魄 ${have}/${cost.essence} · 玄晶 ${p.mats}/${cost.mats}`
      : `需要先解锁 ${set.lo} 重天`, { fontFamily: SANS, fontSize: '24px', color: ok ? '#e0b0ff' : '#6e7681' }).setOrigin(0.5, 0));
    c.add(button(this, W / 2 - 150, top + 470, 260, 84, '返回', () => this.showCodex(), { color: 0x8b949e }));
    c.add(button(this, W / 2 + 150, top + 470, 260, 84, '合成', () => { net.send({ t: 'craft', set: id, piece }); this.closePopup(); }, { color: set.color, disabled: !ok }));
  }

  private showSalvage(p: ProfileView): void {
    const { c, top } = this.openPopup(760);
    c.add(this.add.text(W / 2, top + 40, '批量分解', { fontFamily: SERIF, fontSize: '40px', fontStyle: 'bold', color: '#c084fc' }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, top + 100, '不会分解套装件和比身上更好的装备', { fontFamily: SANS, fontSize: '22px', color: '#8b949e' }).setOrigin(0.5, 0));
    const cur = this.power(p);
    for (let r = 0; r <= 3; r++) {
      // 不分解套装件，也不分解比身上更好的
      const ids = p.stash.filter(it => !it.set && it.rarity <= r && this.power(p, bestSlotFor(p.equip, p.path, it), it) <= cur).map(it => it.id);
      const gain = p.stash.filter(it => ids.includes(it.id)).reduce((a, it) => a + salvageValue(it), 0);
      c.add(button(this, W / 2, top + 190 + r * 100, W - 160, 80, `${RARITY_NAMES[r]}及以下 · ${ids.length} 件 · +${gain}`, () => {
        if (ids.length) net.send({ t: 'salvage', ids });
        this.closePopup();
      }, { fontSize: 26, color: Phaser.Display.Color.HexStringToColor(RARITY_CSS[r]).color, disabled: !ids.length }));
    }
    // 拾取时自动分解
    const label = p.autoSalvage < 0 ? '关闭' : `${RARITY_NAMES[p.autoSalvage]}及以下`;
    c.add(this.add.text(W / 2, top + 600, `拾取时自动分解：${label}`, { fontFamily: SERIF, fontSize: '28px', color: '#f0e6d3' }).setOrigin(0.5));
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
