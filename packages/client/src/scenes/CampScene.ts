import Phaser from 'phaser';
import {
  GearItem, PATHS, Wuxing, WUXING_NAMES,
  computeStats, powerOf, salvageValue, RARITY_NAMES, RARITY_CSS,
  TIER_NAMES, MAX_TIER, MAX_PARTY, ProfileView, RoomView, PlayerStats,
  refineCost, refineRate, GRADE_GROWTH, MAX_GRADE, displayName, formOf, UNARMED_FORM, WEAPON_FORMS,
  Energy, emptyEnergy, forgeBase, forgeRarity, forgeNeed, forgeOutcome,
  CULT, MAX_CULT, MAX_CULT_KINDS, CULT_REFUND, cultCost, cultSpent, cultKinds, cultBlock,
  SKILLS, SKILL_ORDER, SKILL_RANKS, SKILL_MAX_LEVEL, LOADOUT_MAX, SkillId, skillLevel, skillNeed, skillDmgMult, skillCdMult, skillAreaMult, skillTrainCost,
  idleGain, idleRate, IDLE_CAP_MS,
  realmOf, realmIndex, REALM_COLORS, energyTotal,
} from '@xiyou/shared';
import { Avatar } from '../systems/avatar/Avatar.js';
import { applyRenderScale } from '../config/gameConfig.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/dims.js';
import { WX_TINT } from '../config/worldConfig.js';
import { Fx } from '../systems/fx/Fx.js';
import { SkillShader } from '../systems/fx/SkillShader.js';
import { IdleBattle } from '../systems/idle/IdleBattle.js';
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

/** 五行按相生顺序排 */
/** 九重天各自的颜色：由清冷到炽烈 */
const TIER_COLORS = [0, 0x9fd8ff, 0x6fb6ff, 0x4ade80, 0x9be36a, 0xffe066, 0xffa31a, 0xff6a4c, 0xff4fd8, 0xc084fc];

/** 挂机战斗的舞台：残魂站的位置 */
const STAGE_X = 200;
const STAGE_Y = 680;
/** 挂机收益栏的上沿 */
const IDLE_Y = 1080;

const CULT_ORDER: Wuxing[] = [Wuxing.WOOD, Wuxing.FIRE, Wuxing.EARTH, Wuxing.METAL, Wuxing.WATER];

/**
 * 营地：挂机界面。残魂在上方自动清剿游荡的妖异（演出），挂机收益按时间累计、手动领取；
 * 大半屏留给挂机演出，底下只有收益栏、五行能量和一排四个入口（修炼 / 兵器 / 技能 / 秘境），秘境的选项在弹出面板里
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
  /** 凝练面板里正在投入的能量 */
  private forgeAmt: Energy = emptyEnergy();
  private forgeTier = 0;
  /** 当前打开的面板：存档更新后原样重开，面板里的数字才会跟着变 */
  private panel: 'cult' | 'arms' | 'skills' | 'rift' | null = null;
  private fx!: Fx;
  private idle!: IdleBattle;
  private idleTime: Phaser.GameObjects.Text | null = null;
  private idleAmt: Phaser.GameObjects.Text | null = null;
  private idleBar: Phaser.GameObjects.Graphics | null = null;
  private idleT = 0;
  private shaderFx!: SkillShader;

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
    this.add.image(STAGE_X, STAGE_Y, 'fx_glow').setTint(0x9fd8ff).setBlendMode(Phaser.BlendModes.ADD).setScale(1.5, 0.5).setAlpha(0.22);
    this.avatar = new Avatar(this, STAGE_X, STAGE_Y, null, 2).setDepth(STAGE_Y).setVisible(false);
    // 挂机战斗：妖异从右边走来，被自动打散，能量飞进收益栏
    this.fx = new Fx(this);
    this.shaderFx = new SkillShader(this);
    this.idle = new IdleBattle(this, this.avatar, this.fx, this.shaderFx, STAGE_X, STAGE_Y, W, (wx, x, y) => this.flyOrb(wx, x, y));
    this.idleTime = this.idleAmt = this.idleBar = null;
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
    const dt = Math.min(50, delta);
    if (this.avatar.visible) this.avatar.tick(dt);
    this.idle.update(dt);
    this.shaderFx.update(dt);
    this.idleT -= delta;
    if (this.idleT <= 0) { this.idleT = 500; this.updateIdle(); }
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
    // 客户端比联机服务新：旧服务的存档里没有五行能量，别硬画
    if (!p.energy || !p.cult) {
      this.avatar.setVisible(false);
      this.idle.setActive(false);
      this.dyn.add(this.add.text(W / 2, H / 2, '联机服务尚未更新到新版本\n请稍后再试', {
        fontFamily: SERIF, fontSize: '34px', color: '#e3b23c', align: 'center', lineSpacing: 12,
      }).setOrigin(0.5));
      return;
    }
    this.tier = Math.max(1, Math.min(p.maxTier, this.tier));
    this.avatar.setVisible(!!p.path);
    this.idle.setActive(!!p.path);
    this.idle.setLoadout(formOf(p.weapon), p.loadout ?? []);
    this.idleTime = this.idleAmt = this.idleBar = null;
    const sig = `${p.path}|${p.weapon ? `${p.weapon.id}${p.weapon.grade ?? 0}` : '-'}|${CULT_ORDER.map(wx => p.cult[wx]).join(',')}`;
    if (sig !== this.avatarSig) { this.avatarSig = sig; this.avatar.setLook({ weapon: p.weapon, path: p.path, cult: p.cult }); }
    if (!p.path) {
      this.drawPathSelect();
      return;
    }
    this.drawHeader(p, !net.room);
    if (net.room) { if (this.panel === 'rift') this.closePopup(); this.drawRoom(p, net.room); }
    // 面板开着：按新存档重画
    if (this.popup && this.panel === 'cult') this.showCultPanel();
    else if (this.popup && this.panel === 'arms') this.showArms();
    else if (this.popup && this.panel === 'skills') this.showSkills();
    else if (this.popup && this.panel === 'rift') this.showRift();
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

  /** 主界面：名号、境界、战力、人物、五行能量，和三个入口 */
  private drawHeader(p: ProfileView, full: boolean = true): void {
    const d = this.dyn;
    const stats = this.stats(p);
    const name = this.add.text(36, 34, `${p.name} ✎`, { fontFamily: SERIF, fontSize: '34px', fontStyle: 'bold', color: '#f0e6d3' })
      .setInteractive({ useHandCursor: true });
    name.on('pointerup', () => {
      const n = window.prompt('修改名号（最多 10 字）', p.name);
      if (n && n.trim()) { localStorage.setItem('5ele_name', n.trim()); net.send({ t: 'name', name: n.trim() }); }
    });
    d.add(name);
    d.add(this.add.text(36, 82, `${PATHS[p.path!].name} · ${realmOf(p.cult)}境`, { fontFamily: SERIF, fontSize: '26px', color: WX_CSS[p.path!] }));
    d.add(this.add.text(W - 36, 34, `战力 ${powerOf(stats)}`, { fontFamily: SERIF, fontSize: '40px', fontStyle: 'bold', color: '#ffe066' }).setOrigin(1, 0));

    // 手里的兵器：一行
    const it = p.weapon;
    const form = formOf(it);
    // 组队房间占着下半屏时，只留顶栏和挂机演出
    if (!full) return;
    d.add(this.add.text(W / 2, IDLE_Y - 46, `${it ? displayName(it) : '空手'} · ${form.melee ? '近战' : it ? '远程' : '中距离'}${form.move}`, {
      fontFamily: SERIF, fontSize: '24px', color: it ? RARITY_CSS[it.rarity] : '#8b949e',
    }).setOrigin(0.5, 0));

    // 挂机收益：按时间累计，手动领取
    const bx = 36, by = IDLE_Y, bw = W - 72, bh = 84;
    const g = this.add.graphics();
    g.fillStyle(0x0d1117, 0.92);
    g.fillRoundedRect(bx, by, bw, bh, 18);
    g.lineStyle(2, GOLD, 0.6);
    g.strokeRoundedRect(bx, by, bw, bh, 18);
    d.add(g);
    this.idleBar = this.add.graphics();
    d.add(this.idleBar);
    this.idleTime = this.add.text(bx + 22, by + 12, '', { fontFamily: SERIF, fontSize: '24px', fontStyle: 'bold', color: '#d4a853' });
    this.idleAmt = this.add.text(bx + 22, by + 46, '', { fontFamily: SANS, fontSize: '20px', color: '#c9d1d9' });
    d.add([this.idleTime, this.idleAmt]);
    d.add(button(this, bx + bw - 90, by + bh / 2, 150, 60, '领取', () => { sfx.shapeOk(p.path!); net.send({ t: 'idle' }); }, { fontSize: 28 }));
    this.updateIdle();

    // 五行能量：一行五个数
    CULT_ORDER.forEach((wx, i) => {
      const x = W / 2 + (i - 2) * 132;
      d.add(this.add.text(x - 6, IDLE_Y + 128, WUXING_NAMES[wx], { fontFamily: SERIF, fontSize: '34px', fontStyle: 'bold', color: WX_CSS[wx], stroke: '#000', strokeThickness: 4 }).setOrigin(1, 0.5));
      d.add(this.add.text(x + 2, IDLE_Y + 130, `${p.energy[wx]}`, { fontFamily: SANS, fontSize: '26px', fontStyle: 'bold', color: '#f0e6d3' }).setOrigin(0, 0.5));
    });

    // 三个入口：能做点什么的时候亮起来
    const kinds = cultKinds(p.cult);
    const canCult = CULT_ORDER.some(wx => cultBlock(p.cult, p.energy, wx) === '');
    const canLearn = SKILL_ORDER.some(id => p.skills?.[id] === undefined && p.energy[SKILLS[id].wuxing] >= SKILLS[id].learn);
    const total = CULT_ORDER.reduce((a, wx) => a + p.energy[wx], 0);
    const canForge = !p.weapon && total >= forgeBase(1);
    const entries: { label: string; sub: string; hot: boolean; open: () => void }[] = [
      { label: '修 炼', sub: kinds.length ? kinds.map(wx => `${WUXING_NAMES[wx]} ${p.cult[wx]} 重`).join(' · ') : '尚未修炼', hot: canCult, open: () => this.showCultPanel() },
      { label: '兵 器', sub: it ? `兵匣 ${p.stash.length} 件` : '可凝练兵器', hot: canForge, open: () => this.showArms() },
      { label: '技 能', sub: (p.loadout ?? []).length ? (p.loadout ?? []).map(id => SKILLS[id].name).join(' · ') : '尚未修习', hot: canLearn, open: () => this.showSkills() },
      { label: '秘 境', sub: TIER_NAMES[this.tier], hot: false, open: () => this.showRift() },
    ];
    // 底下一排四个小入口，其余空间都留给挂机演出
    entries.forEach((e, i) => {
      const x = W / 2 + (i - 1.5) * 168, y = IDLE_Y + 240;
      d.add(button(this, x, y, 154, 82, e.label, e.open, { fontSize: 30, color: i === 3 ? 0x58a6ff : undefined }));
      d.add(this.add.text(x, y + 50, e.sub, { fontFamily: SANS, fontSize: '17px', color: '#8b949e', align: 'center', wordWrap: { width: 160, useAdvancedWrap: true } }).setOrigin(0.5, 0));
      if (e.hot) {
        const dot = this.add.circle(x + 64, y - 34, 8, 0xff5a3c).setStrokeStyle(2, 0x000000, 0.8);
        this.tweens.add({ targets: dot, scale: 1.35, duration: 600, yoyo: true, repeat: -1 });
        d.add(dot);
      }
    });
  }

  /** 挂机收益的读数（半秒刷一次；只在文字变了才改） */
  private updateIdle(): void {
    const p = net.profile;
    if (!p || !this.idleTime || !this.idleAmt || !this.idleBar || !this.idleTime.active) return;
    const ms = Math.max(0, Math.min(IDLE_CAP_MS, Date.now() + net.skew - (p.idleSince ?? Date.now())));
    const full = ms >= IDLE_CAP_MS;
    const each = idleGain(p.maxTier, ms)[Wuxing.FIRE];
    const hms = (v: number) => { const s = Math.floor(v / 1000); return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
    const a = full ? `挂机收益已满 ${hms(IDLE_CAP_MS)}` : `挂机 ${hms(ms)} / ${Math.round(IDLE_CAP_MS / 3600000)} 小时`;
    const b = `五行能量各 +${each} · 每小时 +${Math.floor(idleRate(p.maxTier) * 12)}/行`;
    if (this.idleTime.text !== a) this.idleTime.setText(a).setColor(full ? '#ffe066' : '#d4a853');
    if (this.idleAmt.text !== b) this.idleAmt.setText(b);
    // 底边一条进度：攒到上限为止
    const bx = 36, by = IDLE_Y, bw = W - 72, bh = 84;
    this.idleBar.clear();
    this.idleBar.fillStyle(full ? 0xffe066 : GOLD, 0.9);
    this.idleBar.fillRoundedRect(bx + 14, by + bh - 9, Math.max(4, (bw - 28) * (ms / IDLE_CAP_MS)), 4, 2);
  }

  /** 挂机战斗里妖异留下的能量：飞进收益栏（演出，收益本身按时间算） */
  private flyOrb(wx: Wuxing, x: number, y: number): void {
    const orb = this.add.image(x, y, 'fx_glow').setTint(WX_TINT[wx]).setBlendMode(Phaser.BlendModes.ADD).setScale(0.22).setDepth(4000);
    this.tweens.add({
      targets: orb, x: 150 + Math.random() * 200, y: IDLE_Y + 42, scale: 0.1, duration: 620, ease: 'Cubic.easeIn', delay: 160,
      onComplete: () => {
        orb.destroy();
        if (this.idleTime?.active) this.tweens.add({ targets: this.idleTime, scale: 1.06, duration: 90, yoyo: true });
      },
    });
  }

  // ───────────────────────── 五行修炼 ─────────────────────────

  /** 修炼面板：属性一览 + 五行 */
  private showCultPanel(): void {
    const p = net.profile;
    if (!p) return;
    const { c, top } = this.openPopup(630);
    this.panel = 'cult';
    const stats = this.stats(p);
    c.add(this.add.text(W / 2, top + 28, '修 炼', { fontFamily: SERIF, fontSize: '42px', fontStyle: 'bold', color: '#ffe9a8' }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, top + 88, `${realmOf(p.cult)}境 · 修为 ${energyTotal(p.cult)} 重 · 每局带回能量上限 ${stats.carry}`, {
      fontFamily: SANS, fontSize: '21px', color: hex(REALM_COLORS[realmIndex(p.cult)]),
    }).setOrigin(0.5, 0));
    const cells = [
      `攻击 ${stats.attack}`, `生命 ${stats.maxHp}`, `减伤 ${Math.round(stats.dr)}%`,
      `暴击 ${Math.round(stats.crit)}%`, `暴伤 +${Math.round(stats.critDmg)}%`, `回血 ${stats.regen.toFixed(1)}/秒`,
      `冷却 -${Math.round(stats.cdr)}%`, `灵力 ${stats.qiMax}`, `移速 +${Math.round(stats.move)}%`,
    ];
    cells.forEach((t, i) => {
      c.add(this.add.text(84 + (i % 3) * 200, top + 138 + Math.floor(i / 3) * 36, t, { fontFamily: SANS, fontSize: '22px', color: '#c9d1d9' }));
    });
    this.drawCult(p, c, top + 262);
  }

  // ───────────────────────── 五行修炼 ─────────────────────────

  private drawCult(p: ProfileView, d: Phaser.GameObjects.Container, top: number): void {
    const kinds = cultKinds(p.cult);
    d.add(this.add.text(60, top, '五行', { fontFamily: SERIF, fontSize: '28px', fontStyle: 'bold', color: '#d4a853' }));
    d.add(this.add.text(W - 60, top + 6, `最多同修 ${MAX_CULT_KINDS} 行 · 已修 ${kinds.length}/${MAX_CULT_KINDS}`, { fontFamily: SANS, fontSize: '20px', color: '#6e7681' }).setOrigin(1, 0));

    const cw = 118, gap = (W - 108 - cw * 5) / 4, ch = 286;
    CULT_ORDER.forEach((wx, i) => {
      const x = 54 + cw / 2 + i * (cw + gap);
      const y0 = top + 46;
      const lv = p.cult[wx];
      const block = cultBlock(p.cult, p.energy, wx);
      const cost = cultCost(lv);
      // 已同修两行，这一行修不了：整张卡压暗，能量照样显示（可用于凝练、精炼、修习技能）
      const shut = block === 'slots';
      const g = this.add.graphics();
      g.fillStyle(0x0d1117, 0.9);
      g.fillRoundedRect(x - cw / 2, y0, cw, ch, 18);
      g.fillStyle(WX_TINT[wx], shut ? 0.03 : 0.08);
      g.fillRoundedRect(x - cw / 2, y0, cw, ch, 18);
      g.lineStyle(2.5, WX_TINT[wx], block === '' ? 1 : shut ? 0.2 : 0.45);
      g.strokeRoundedRect(x - cw / 2, y0, cw, ch, 18);
      // 能量进度：离下一重还差多少
      if (block !== 'max' && !shut) {
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
      d.add(this.add.text(x, y0 + 46, WUXING_NAMES[wx], { fontFamily: SERIF, fontSize: '58px', fontStyle: 'bold', color: WX_CSS[wx], stroke: '#000', strokeThickness: 4 }).setOrigin(0.5).setAlpha(shut ? 0.45 : 1));
      d.add(this.add.text(x, y0 + 100, CULT[wx].name, { fontFamily: SERIF, fontSize: '22px', color: shut ? '#484f58' : '#c9d1d9' }).setOrigin(0.5));
      d.add(this.add.text(x, y0 + 136, shut ? '未修' : `${lv} 重`, { fontFamily: SERIF, fontSize: '30px', fontStyle: 'bold', color: shut ? '#484f58' : '#f0e6d3' }).setOrigin(0.5));
      d.add(this.add.text(x, y0 + 168, block === 'max' || shut ? `能量 ${p.energy[wx]}` : `${p.energy[wx]} / ${cost}`, {
        fontFamily: SANS, fontSize: '20px', fontStyle: 'bold', color: WX_CSS[wx],
      }).setOrigin(0.5));
      const info = this.add.rectangle(x, y0 + 100, cw, 200, 0, 0).setInteractive({ useHandCursor: true });
      info.on('pointerup', () => this.showCult(wx));
      d.add(info);
      const label = block === 'max' ? '圆满' : shut ? '不可修' : '修炼';
      d.add(button(this, x, y0 + ch - 42, cw - 16, 60, label, () => {
        if (block === '') { sfx.shapeOk(wx); net.send({ t: 'cultivate', wx }); } else this.showCult(wx);
      }, { fontSize: 24, color: block === '' ? WX_TINT[wx] : 0x6e7681 }));
    });
  }

  /** 某一行的修炼详情 */
  private showCult(wx: Wuxing): void {
    const p = net.profile;
    if (!p) return;
    const lv = p.cult[wx];
    const cost = cultCost(lv);
    const block = cultBlock(p.cult, p.energy, wx);
    const { c, top } = this.openPopup(700, () => this.showCultPanel());
    c.add(this.add.text(W / 2, top + 40, `${WUXING_NAMES[wx]}行 · ${CULT[wx].name}`, { fontFamily: SERIF, fontSize: '46px', fontStyle: 'bold', color: WX_CSS[wx] }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, top + 110, `当前 ${lv} / ${MAX_CULT} 重`, { fontFamily: SERIF, fontSize: '30px', color: '#f0e6d3' }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, top + 170, `每修一重\n${CULT[wx].desc.replace(/　/g, '\n')}`, {
      fontFamily: SANS, fontSize: '25px', color: '#c9d1d9', align: 'center', lineSpacing: 8,
    }).setOrigin(0.5, 0));
    const others = cultKinds(p.cult).map(k => WUXING_NAMES[k]).join('、');
    const tips = [
      `${WUXING_NAMES[wx]}行能量来自${WUXING_NAMES[wx]}属妖异的残留`,
      block === 'slots'
        ? `最多同修 ${MAX_CULT_KINDS} 行，你已修${others}。要改修这一行，先把其中一行散功`
        : `一个人最多同修 ${MAX_CULT_KINDS} 行；不修的那几行能量仍可用来凝练、精炼兵器和修习技能`,
    ];
    c.add(this.add.text(W / 2, top + 350, tips.join('\n'), {
      fontFamily: SANS, fontSize: '21px', color: block === 'slots' ? '#e3b23c' : '#8b949e', align: 'center', lineSpacing: 8, wordWrap: { width: W - 130, useAdvancedWrap: true },
    }).setOrigin(0.5, 0));
    const label = block === 'max' ? '已圆满' : block === 'slots' ? '不可修' : `修炼 · ${WUXING_NAMES[wx]}能量 ${p.energy[wx]}/${cost}`;
    c.add(button(this, W / 2, top + 520, W - 160, 90, label, () => {
      sfx.shapeOk(wx);
      net.send({ t: 'cultivate', wx });
      // 留在这个面板里可以连着修
      this.time.delayedCall(140, () => { if (this.popup) this.showCult(wx); });
    }, { color: WX_TINT[wx], disabled: block !== '', fontSize: 30 }));
    if (lv > 0) {
      const back = Math.floor(cultSpent(lv) * CULT_REFUND);
      c.add(button(this, W / 2, top + 625, W - 280, 64, `散功 · 修为归零，返还 ${back} 能量`, () => this.confirmReset(wx, back), { color: 0x8b949e, fontSize: 22 }));
    }
  }

  private confirmReset(wx: Wuxing, back: number): void {
    const { c, top } = this.openPopup(420, () => this.showCult(wx));
    c.add(this.add.text(W / 2, top + 50, `${WUXING_NAMES[wx]}行散功？`, { fontFamily: SERIF, fontSize: '42px', fontStyle: 'bold', color: '#f85149' }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, top + 130, `${WUXING_NAMES[wx]}行修为归零，只返还 ${Math.round(CULT_REFUND * 100)}% 的投入（${back} 点能量）\n之后可以改修别的一行`, {
      fontFamily: SANS, fontSize: '24px', color: '#c9d1d9', align: 'center', lineSpacing: 10, wordWrap: { width: W - 140, useAdvancedWrap: true },
    }).setOrigin(0.5, 0));
    c.add(button(this, W / 2 - 150, top + 330, 250, 84, '再想想', () => this.showCult(wx), { color: 0x8b949e }));
    c.add(button(this, W / 2 + 150, top + 330, 250, 84, '散功', () => { net.send({ t: 'uncultivate', wx }); this.showCultPanel(); }, { color: 0xf85149 }));
  }

  // ───────────────────────── 技能修习 ─────────────────────────

  /** 技能要用五行能量修习才学得会；用得越多越熟练；带进秘境的最多两门 */
  private showSkills(): void {
    const p = net.profile;
    if (!p) return;
    const rowH = 178;
    const { c, top } = this.openPopup(170 + SKILL_ORDER.length * rowH);
    this.panel = 'skills';
    const loadout: SkillId[] = p.loadout ?? [];
    c.add(this.add.text(W / 2, top + 26, '技 能', { fontFamily: SERIF, fontSize: '42px', fontStyle: 'bold', color: '#ffe9a8' }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, top + 86, `越用越熟练，也可花能量参悟升级 · 等级越高范围越大 · 最多带 ${LOADOUT_MAX} 门`, { fontFamily: SANS, fontSize: '20px', color: '#8b949e' }).setOrigin(0.5, 0));
    SKILL_ORDER.forEach((id, i) => {
      const def = SKILLS[id];
      const y0 = top + 136 + i * rowH;
      const uses = p.skills?.[id];
      const lv = skillLevel(uses);
      const tint = WX_TINT[def.wuxing];
      const on = loadout.includes(id);
      const g = this.add.graphics();
      g.fillStyle(on ? tint : 0x05080b, on ? 0.1 : 0.9);
      g.fillRoundedRect(52, y0, W - 104, rowH - 14, 18);
      g.lineStyle(on ? 3 : 2, tint, lv >= 0 ? 0.9 : 0.35);
      g.strokeRoundedRect(52, y0, W - 104, rowH - 14, 18);
      c.add(g);
      c.add(this.add.text(76, y0 + 14, def.name, { fontFamily: SERIF, fontSize: '36px', fontStyle: 'bold', color: WX_CSS[def.wuxing] }).setAlpha(lv >= 0 ? 1 : 0.6));
      c.add(this.add.text(168, y0 + 28, `${WUXING_NAMES[def.wuxing]}行 · 灵力 ${def.qi} · 冷却 ${def.cd / 1000} 秒`, { fontFamily: SANS, fontSize: '19px', color: '#6e7681' }));
      c.add(this.add.text(76, y0 + 66, def.desc, { fontFamily: SANS, fontSize: '20px', color: '#c9d1d9', wordWrap: { width: W - 330, useAdvancedWrap: true }, lineSpacing: 4 }));
      const bx = W - 140, by = y0 + 80;
      if (lv < 0) {
        const have = p.energy[def.wuxing];
        c.add(this.add.text(bx, by - 52, `${WUXING_NAMES[def.wuxing]}能量 ${have}/${def.learn}`, { fontFamily: SANS, fontSize: '19px', color: have >= def.learn ? WX_CSS[def.wuxing] : '#6e7681' }).setOrigin(0.5));
        c.add(button(this, bx, by, 150, 62, '修习', () => { sfx.shapeOk(def.wuxing); net.send({ t: 'learn', skill: id }); }, { color: tint, disabled: have < def.learn, fontSize: 26 }));
      } else {
        const maxed = lv >= SKILL_MAX_LEVEL;
        const lo = skillNeed(lv), hi = skillNeed(lv + 1);
        c.add(this.add.text(bx, by - 52, `${SKILL_RANKS[lv]} · ${lv} 级`, { fontFamily: SERIF, fontSize: '22px', fontStyle: 'bold', color: '#ffe066' }).setOrigin(0.5));
        const full = !on && loadout.length >= LOADOUT_MAX;
        c.add(button(this, bx, by - 12, 150, 52, on ? '卸下' : '携带', () => {
          if (full) { toast(this, `最多携带 ${LOADOUT_MAX} 门，先卸下一门`, '#f85149'); return; }
          net.send({ t: 'loadout', skills: on ? loadout.filter(k => k !== id) : [...loadout, id] });
        }, { color: on ? 0x8b949e : full ? 0x6e7681 : tint, fontSize: 24 }));
        // 参悟：花本行能量直接升一级
        if (!maxed) {
          const cost = skillTrainCost(uses!);
          const have = p.energy[def.wuxing];
          c.add(button(this, bx, by + 50, 150, 48, `参悟 ${WUXING_NAMES[def.wuxing]}${cost}`, () => { sfx.shapeOk(def.wuxing); net.send({ t: 'train', skill: id }); }, { color: tint, disabled: have < cost, fontSize: 21 }));
        }
        // 熟练度进度与当前加成
        const bw = W - 330;
        const pct = maxed ? 1 : Phaser.Math.Clamp((uses! - lo) / (hi - lo), 0, 1);
        g.fillStyle(0x000000, 0.7);
        g.fillRoundedRect(76, y0 + 126, bw, 10, 5);
        g.fillStyle(tint, 1);
        if (pct > 0.01) g.fillRoundedRect(76, y0 + 126, bw * pct, 10, 5);
        c.add(this.add.text(76, y0 + 140, `范围 ${Math.round(skillAreaMult(lv) * 100)}% · 伤害 +${Math.round((skillDmgMult(lv) - 1) * 100)}% · 冷却 -${Math.round((1 - skillCdMult(lv)) * 100)}%${maxed ? '' : ` · 再用 ${hi - uses!} 次升级`}`, {
          fontFamily: SANS, fontSize: '17px', color: '#8b949e',
        }));
      }
    });
  }

  // ───────────────────────── 兵匣 ─────────────────────────

  private sortedStash(p: ProfileView): GearItem[] {
    return [...p.stash].sort((a, b) => b.rarity - a.rarity || b.tier - a.tier || (b.grade ?? 0) - (a.grade ?? 0));
  }

  /** 兵器面板：手里的兵器、兵匣、凝练入口 */
  private showArms(): void {
    const p = net.profile;
    if (!p) return;
    const { c, top } = this.openPopup(760);
    this.panel = 'arms';
    c.add(this.add.text(W / 2, top + 28, '兵 器', { fontFamily: SERIF, fontSize: '42px', fontStyle: 'bold', color: '#ffe9a8' }).setOrigin(0.5, 0));

    // 手里的
    const it = p.weapon;
    const form = formOf(it);
    c.add(gearIcon(this, 130, top + 180, 124, it, '空手'));
    c.add(this.add.text(220, top + 128, it ? displayName(it) : '空手', { fontFamily: SERIF, fontSize: '32px', fontStyle: 'bold', color: it ? RARITY_CSS[it.rarity] : '#8b949e' }));
    c.add(this.add.text(220, top + 174, `${form.melee ? '近战' : it ? '远程' : '中距离'} · ${form.move}`, { fontFamily: SANS, fontSize: '22px', color: form.melee ? '#ffb36b' : '#9fd8ff' }));
    c.add(this.add.text(220, top + 206, it ? '点击查看 / 精炼' : '用五行能量凝练出第一件兵器', { fontFamily: SANS, fontSize: '20px', color: '#6e7681' }));
    if (it) {
      const hit = this.add.rectangle(W / 2, top + 180, W - 120, 140, 0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => this.showItem(it, 'equip'));
      c.add(hit);
    }

    // 兵匣
    const st = top + 270;
    c.add(this.add.text(60, st, `兵匣 ${p.stash.length}/${p.stashCap}`, { fontFamily: SERIF, fontSize: '26px', fontStyle: 'bold', color: '#d4a853' }));
    const items = this.sortedStash(p);
    const pages = Math.max(1, Math.ceil(items.length / PAGE));
    this.page = Math.min(this.page, pages - 1);
    const cell = 100;
    const gx = (W - COLS * cell) / 2;
    const gy = st + 44;
    const cur = this.power(p);
    for (let i = 0; i < PAGE; i++) {
      const one = items[this.page * PAGE + i] ?? null;
      const x = gx + (i % COLS) * cell + cell / 2;
      const y = gy + Math.floor(i / COLS) * cell + cell / 2;
      c.add(gearIcon(this, x, y, cell - 10, one));
      if (one) {
        // 比手里的强就标一个绿色箭头
        if (this.power(p, one) > cur) {
          c.add(this.add.text(x + cell / 2 - 10, y + cell / 2 - 22, '▲', { fontFamily: SANS, fontSize: '20px', color: '#3fb950', stroke: '#000', strokeThickness: 4 }).setOrigin(1, 1));
        }
        const hit = this.add.rectangle(x, y, cell - 6, cell - 6, 0, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => this.showItem(one, 'stash'));
        c.add(hit);
      }
    }
    const by = gy + ROWS * cell + 40;
    if (pages > 1) {
      c.add(button(this, 100, by, 70, 56, '◀', () => { this.page = (this.page + pages - 1) % pages; this.showArms(); }, { fontSize: 24 }));
      c.add(this.add.text(166, by, `${this.page + 1}/${pages}`, { fontFamily: SANS, fontSize: '22px', color: '#8b949e' }).setOrigin(0.5));
      c.add(button(this, 232, by, 70, 56, '▶', () => { this.page = (this.page + 1) % pages; this.showArms(); }, { fontSize: 24 }));
    }
    c.add(button(this, W / 2, top + 760 - 76, W - 160, 88, '凝 练 兵 器', () => this.showForge(), { fontSize: 32 }));
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

  /** 秘境面板：选哪一重天、独自进还是组队 */
  private showRift(): void {
    const p = net.profile;
    if (!p) return;
    const { c: d, top } = this.openPopup(600);
    this.panel = 'rift';
    d.add(this.add.text(W / 2, top + 30, '秘 境', { fontFamily: SERIF, fontSize: '42px', fontStyle: 'bold', color: '#ffe9a8' }).setOrigin(0.5, 0));
    const setTier = (t: number) => {
      this.tier = Math.max(1, Math.min(p.maxTier, t));
      localStorage.setItem('5ele_tier', String(this.tier));
      this.refresh();
      this.showRift();
    };
    // 要去哪一重天：点开秘境图选
    const best = p.best[this.tier];
    this.tierCard(d, top + 180, this.tier, best ? `最快 ${fmtTime(best)}` : '尚未通关', () => this.showMap(p.maxTier, this.tier, p.best, setTier));

    const by = top + 340;
    d.add(button(this, W / 2, by, W - 120, 110, '独自进入', () => {
      sfx.unlock();
      net.send({ t: 'create', tier: this.tier });
      net.send({ t: 'start' });
    }, { fontSize: 36 }));
    d.add(button(this, W / 2 - 160, by + 150, 280, 96, '开房组队', () => { sfx.unlock(); this.closePopup(); net.send({ t: 'create', tier: this.tier }); }, { fontSize: 30, color: 0x58a6ff }));
    d.add(button(this, W / 2 + 160, by + 150, 280, 96, '加入房间', () => { sfx.unlock(); this.showKeypad(); }, { fontSize: 30, color: 0x58a6ff }));
  }

  /** 当前选中的那一重天：一张可点的牌子，点开是秘境图 */
  private tierCard(d: Phaser.GameObjects.Container, y: number, tier: number, sub: string, open: () => void, k: number = 1): void {
    const w = (W - 120) * (k < 1 ? 0.7 : 1), h = 132 * k;
    const color = TIER_COLORS[tier];
    const g = this.add.graphics();
    g.fillStyle(0x05080b, 0.9);
    g.fillRoundedRect(W / 2 - w / 2, y - h / 2, w, h, 20);
    g.fillStyle(color, 0.07);
    g.fillRoundedRect(W / 2 - w / 2, y - h / 2, w, h, 20);
    g.lineStyle(2.5, color, 0.9);
    g.strokeRoundedRect(W / 2 - w / 2, y - h / 2, w, h, 20);
    d.add(g);
    d.add(this.add.text(W / 2, y - 16 * k, TIER_NAMES[tier], { fontFamily: SERIF, fontSize: `${Math.round(48 * k)}px`, fontStyle: 'bold', color: '#ffe9a8' }).setOrigin(0.5));
    d.add(this.add.text(W / 2, y + 32 * k, sub, { fontFamily: SANS, fontSize: `${Math.round(22 * k)}px`, color: '#8b949e' }).setOrigin(0.5));
    d.add(this.add.text(W / 2 + w / 2 - 22, y, '图 ›', { fontFamily: SERIF, fontSize: `${Math.round(26 * k)}px`, color: hex(color) }).setOrigin(1, 0.5));
    const hit = this.add.rectangle(W / 2, y, w, h, 0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerup', () => { sfx.click(); open(); });
    d.add(hit);
  }

  /**
   * 秘境图：九重天自下而上一条蜿蜒的路，通关一重才露出下一重
   * @param pick 选中某一重天之后做什么（单人改本地选择，房主改房间层数）
   */
  private showMap(maxTier: number, cur: number, best: Record<number, number>, pick: (tier: number) => void): void {
    const height = 1330;
    const { c, top } = this.openPopup(height);
    c.add(this.add.text(W / 2, top + 26, '秘 境 图', { fontFamily: SERIF, fontSize: '42px', fontStyle: 'bold', color: '#ffe9a8' }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, top + 84, '越往上妖异越强，留下的能量也越足', { fontFamily: SANS, fontSize: '21px', color: '#8b949e' }).setOrigin(0.5, 0));

    const pos = (t: number) => ({ x: W / 2 + Math.sin(t * 1.9 + 0.6) * 150, y: top + height - 96 - (t - 1) * 132 });
    // 路：走过的是金线，没到的是暗线
    const g = this.add.graphics();
    for (let t = 1; t < MAX_TIER; t++) {
      const a = pos(t), b = pos(t + 1);
      const open = t + 1 <= maxTier;
      g.lineStyle(open ? 5 : 3, open ? GOLD : 0x30363d, open ? 0.75 : 0.8);
      const curve = new Phaser.Curves.CubicBezier(
        new Phaser.Math.Vector2(a.x, a.y), new Phaser.Math.Vector2(a.x, a.y - 70),
        new Phaser.Math.Vector2(b.x, b.y + 70), new Phaser.Math.Vector2(b.x, b.y),
      );
      curve.draw(g, 24);
    }
    c.add(g);

    for (let t = 1; t <= MAX_TIER; t++) {
      const { x, y } = pos(t);
      const open = t <= maxTier;
      const color = open ? TIER_COLORS[t] : 0x484f58;
      const on = t === cur;
      if (on) {
        const glow = this.add.image(x, y, 'fx_glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.75).setAlpha(0.7);
        this.tweens.add({ targets: glow, alpha: 0.3, scale: 0.9, duration: 900, yoyo: true, repeat: -1 });
        c.add(glow);
      }
      const n = this.add.graphics();
      n.fillStyle(0x0b1016, 1);
      n.fillCircle(x, y, 46);
      n.fillStyle(color, open ? 0.16 : 0.05);
      n.fillCircle(x, y, 46);
      n.lineStyle(on ? 5 : 3, color, open ? 1 : 0.6);
      n.strokeCircle(x, y, 46);
      if (on) { n.lineStyle(2, 0xffffff, 0.7); n.strokeCircle(x, y, 54); }
      c.add(n);
      c.add(this.add.text(x, y - 2, open ? TIER_NAMES[t][0] : '锁', {
        fontFamily: SERIF, fontSize: open ? '46px' : '30px', fontStyle: 'bold', color: open ? hex(color) : '#484f58', stroke: '#000', strokeThickness: 4,
      }).setOrigin(0.5));
      // 说明写在节点外侧（路往哪边拐，字就放另一边）
      const left = x > W / 2;
      const lx = left ? x - 66 : x + 66;
      const done = !!best[t];
      c.add(this.add.text(lx, y - 16, TIER_NAMES[t], { fontFamily: SERIF, fontSize: '28px', fontStyle: 'bold', color: open ? '#f0e6d3' : '#484f58' }).setOrigin(left ? 1 : 0, 0.5));
      c.add(this.add.text(lx, y + 18, !open ? `通关${TIER_NAMES[t - 1]}后开启` : done ? `已净化 · 最快 ${fmtTime(best[t])}` : '尚未净化', {
        fontFamily: SANS, fontSize: '19px', color: !open ? '#484f58' : done ? '#d4a853' : '#8b949e',
      }).setOrigin(left ? 1 : 0, 0.5));
      if (open) {
        const hit = this.add.rectangle(W / 2, y, W - 100, 120, 0, 0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => { sfx.click(); this.closePopup(); pick(t); });
        c.add(hit);
      }
    }
  }

  private drawRoom(p: ProfileView, room: RoomView): void {
    const d = this.dyn;
    const top = 900;
    this.drawPanelBg(top);
    const host = room.players.find(q => q.host);
    const isHost = host?.id === net.did;
    d.add(this.add.text(W / 2, top + 22, `房间码 ${room.code}`, { fontFamily: SERIF, fontSize: '44px', fontStyle: 'bold', color: '#79c0ff' }).setOrigin(0.5, 0));
    d.add(this.add.text(W / 2, top + 80, '把房间码告诉同伴，即可一起刷', { fontFamily: SANS, fontSize: '22px', color: '#6e7681' }).setOrigin(0.5, 0));

    // 层数（房主可调）
    const ty = top + 150;
    if (isHost) {
      this.tierCard(d, ty, room.tier, '点击打开秘境图', () => this.showMap(room.maxTier, room.tier, p.best, t => net.send({ t: 'tier', tier: t })), 0.8);
    } else {
      d.add(this.add.text(W / 2, ty, TIER_NAMES[room.tier], { fontFamily: SERIF, fontSize: '38px', fontStyle: 'bold', color: '#ffe9a8' }).setOrigin(0.5));
    }

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
    this.panel = null;
  }

  /** @param back 点面板外的空白处时回到哪里；不给就直接关掉 */
  private openPopup(height: number, back?: () => void): { c: Phaser.GameObjects.Container; top: number } {
    this.closePopup();
    const c = this.add.container(0, 0).setDepth(8000);
    const shade = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7).setInteractive();
    shade.on('pointerup', () => (back ? back() : this.closePopup()));
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

    // 精炼：每次消耗固定，威力指数增长，阶数越高越容易失败（失败不退能量）
    const g = item.grade ?? 0;
    const cost = refineCost(item);
    const have = p.energy[item.wuxing];
    const canRefine = g < MAX_GRADE && have >= cost;
    const wxName = WUXING_NAMES[item.wuxing];
    const refineText = g >= MAX_GRADE ? '已精炼至最高阶'
      : `精炼 +${g + 1}：全部数值 ×${GRADE_GROWTH} · 成功率 ${refineRate(g)}%\n${wxName}行能量 ${have}/${cost}${refineRate(g) < 100 ? ' · 失败不退' : ''}`;
    const rt = this.add.text(W / 2, y + 6, refineText, { fontFamily: SANS, fontSize: '22px', color: canRefine ? WX_CSS[item.wuxing] : '#6e7681', align: 'center', lineSpacing: 6 }).setOrigin(0.5, 0);
    y += rt.height + 16;

    const height = y + 150 + (from === 'stash' ? 220 : 130);
    const { c, top } = this.openPopup(height, () => this.showArms());
    c.add(gearIcon(this, W / 2, top + 80, 100, item));
    texts.forEach(t => { t.y += top + 150; c.add(t); });
    if (cmp) { cmp.y += top + 150; c.add(cmp); }
    rt.y += top + 150;
    c.add(rt);

    const by2 = top + height - 70;
    const by1 = by2 - 100;
    const close = () => this.showArms();
    const refineBtn = (bx: number, bw: number, byy: number) => button(this, bx, byy, bw, 80, '精炼', () => {
      sfx.shapeOk(item.wuxing);
      net.send({ t: 'refine', id: item.id });
      // 留在详情里可以连着炼
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

  // ───────────────────────── 凝练兵器 ─────────────────────────

  /** 投入五行能量凝成兵器：主辅两行的生克定器型，总量定品质 */
  private showForge(reset: boolean = true): void {
    const p = net.profile;
    if (!p) return;
    if (reset) { this.forgeAmt = emptyEnergy(); this.forgeTier = p.maxTier; }
    const tier = this.forgeTier = Math.max(1, Math.min(p.maxTier, this.forgeTier || p.maxTier));
    const amt = this.forgeAmt;
    CULT_ORDER.forEach(wx => { amt[wx] = Math.max(0, Math.min(p.energy[wx], amt[wx])); });
    const total = CULT_ORDER.reduce((a, wx) => a + amt[wx], 0);
    const base = forgeBase(tier);
    const step = Math.max(5, Math.round(base / 6));
    const out = forgeOutcome(amt);
    const rarity: number = forgeRarity(total, tier);
    const again = () => this.showForge(false);

    const { c, top } = this.openPopup(1180, () => this.showArms());
    c.add(this.add.text(W / 2, top + 30, '凝 练 兵 器', { fontFamily: SERIF, fontSize: '42px', fontStyle: 'bold', color: '#ffe9a8' }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, top + 92, '投得最多的一行为主，定五行；第二多的为辅，主辅生克定器型', {
      fontFamily: SANS, fontSize: '20px', color: '#8b949e',
    }).setOrigin(0.5, 0));

    // 层数：兵器的底子，层数越高起步量越大
    const ty = top + 168;
    c.add(button(this, 150, ty, 80, 56, '◀', () => { this.forgeTier = tier - 1; again(); }, { disabled: tier <= 1, fontSize: 24 }));
    c.add(button(this, W - 150, ty, 80, 56, '▶', () => { this.forgeTier = tier + 1; again(); }, { disabled: tier >= p.maxTier, fontSize: 24 }));
    c.add(this.add.text(W / 2, ty, `${TIER_NAMES[tier]}品阶 · 起步 ${base}`, { fontFamily: SERIF, fontSize: '28px', color: '#f0e6d3' }).setOrigin(0.5));

    // 五行投入
    CULT_ORDER.forEach((wx, i) => {
      const y = top + 250 + i * 86;
      const set = (n: number) => { amt[wx] = Math.max(0, Math.min(p.energy[wx], Math.round(n))); again(); };
      c.add(this.add.text(70, y, WUXING_NAMES[wx], { fontFamily: SERIF, fontSize: '46px', fontStyle: 'bold', color: WX_CSS[wx], stroke: '#000', strokeThickness: 4 }).setOrigin(0.5));
      c.add(this.add.text(108, y + 14, `有 ${p.energy[wx]}`, { fontFamily: SANS, fontSize: '19px', color: '#6e7681' }).setOrigin(0, 0.5));
      const role = out?.main === wx ? '主' : out?.sub === wx ? '辅' : '';
      c.add(this.add.text(108, y - 14, role, { fontFamily: SERIF, fontSize: '21px', fontStyle: 'bold', color: '#ffe066' }).setOrigin(0, 0.5));
      c.add(button(this, 270, y, 76, 62, '－', () => set(amt[wx] - step), { fontSize: 30, color: WX_TINT[wx], disabled: amt[wx] <= 0 }));
      c.add(this.add.text(366, y, `${amt[wx]}`, { fontFamily: SANS, fontSize: '34px', fontStyle: 'bold', color: amt[wx] > 0 ? '#f0e6d3' : '#484f58' }).setOrigin(0.5));
      c.add(button(this, 462, y, 76, 62, '＋', () => set(amt[wx] + step), { fontSize: 30, color: WX_TINT[wx], disabled: amt[wx] >= p.energy[wx] }));
      c.add(button(this, 590, y, 130, 62, '全投', () => set(p.energy[wx]), { fontSize: 24, color: WX_TINT[wx], disabled: amt[wx] >= p.energy[wx] }));
    });

    // 预览
    const py = top + 700;
    const g = this.add.graphics();
    g.fillStyle(0x05080b, 0.9);
    g.fillRoundedRect(60, py, W - 120, 250, 20);
    g.lineStyle(2, out ? WX_TINT[out.main] : 0x30363d, 0.9);
    g.strokeRoundedRect(60, py, W - 120, 250, 20);
    c.add(g);
    if (!out) {
      c.add(this.add.text(W / 2, py + 125, '投入五行能量，看看能凝出什么', { fontFamily: SERIF, fontSize: '26px', color: '#6e7681' }).setOrigin(0.5));
    } else {
      const form = WEAPON_FORMS[out.kind];
      c.add(this.add.text(W / 2, py + 22, `${out.why} → ${WUXING_NAMES[out.main]}行 · ${out.kind}`, {
        fontFamily: SERIF, fontSize: '36px', fontStyle: 'bold', color: WX_CSS[out.main],
      }).setOrigin(0.5, 0));
      c.add(this.add.text(W / 2, py + 76, form.desc, { fontFamily: SANS, fontSize: '22px', color: form.melee ? '#ffb36b' : '#9fd8ff' }).setOrigin(0.5, 0));
      const quality = rarity < 0
        ? `投入 ${total} / ${base}，还凝不成形`
        : `投入 ${total} → ${RARITY_NAMES[rarity]}${rarity < 4 ? `（${forgeNeed(rarity + 1, tier)} 可达${RARITY_NAMES[rarity + 1]}）` : ''}`;
      c.add(this.add.text(W / 2, py + 122, quality, {
        fontFamily: SERIF, fontSize: '26px', fontStyle: 'bold', color: rarity < 0 ? '#f85149' : RARITY_CSS[rarity],
      }).setOrigin(0.5, 0));
      c.add(this.add.text(W / 2, py + 170, '纯一行→杖　辅生主→扇　主生辅→枪\n辅克主→刃　主克辅→剑', {
        fontFamily: SANS, fontSize: '19px', color: '#6e7681', align: 'center', lineSpacing: 6,
      }).setOrigin(0.5, 0));
    }

    const by = top + 1180 - 80;
    c.add(button(this, W / 2 - 170, by, 240, 84, '清空', () => { this.forgeAmt = emptyEnergy(); again(); }, { color: 0x8b949e, fontSize: 28 }));
    c.add(button(this, W / 2 + 130, by, 320, 84, '凝 练', () => {
      sfx.shapeOk(out!.main);
      net.send({ t: 'forge', tier, amounts: { ...amt } });
      this.showArms();
    }, { disabled: !out || rarity < 0, fontSize: 32 }));
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
