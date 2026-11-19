import Phaser from 'phaser';
import { VirtualJoystick } from '../systems/input/VirtualJoystick.js';
import { inputManager } from '../systems/input/InputManager.js';
import { eventBus, GameEvent } from '../core/EventBus.js';
import { LAYOUT } from '../config/uiConfig.js';
import {
  Wuxing, WUXING_NAMES, EquipmentType,
  getAllEquipmentSkills,
} from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';
import { AOE_CONFIG } from '../systems/combat/CombatSystem.js';
import { getEquippedAoeSkills, quickSwapGear } from './WorldScene.js';
import { Fx } from '../systems/fx/Fx.js';
import { wrapCJK } from '../systems/fx/ItemIcon.js';
import { ZONES, WORLD_SIZE, WORLD_CENTER, WX_TINT, WX_ORDER, isBossRound } from '../config/worldConfig.js';
import { sfx } from '../systems/audio/Sfx.js';

const SERIF = '"Noto Serif SC", "Songti SC", serif';
const SANS = '"Noto Sans SC", "PingFang SC", sans-serif';
const GOLD = 0xd4a853;

interface WorldState {
  round: number;
  phase: 'fight' | 'rest' | 'victory' | 'over';
  secsLeft: number;
  kills: number;
  quota: number;
  totalKills: number;
  enemies: number;
  combo: number;
  dashPct: number;
  skillTimers: number[];
  skillMax: number[];
  zones: number[];
  px: number;
  py: number;
  boss: { name: string; hp: number; maxHp: number; wuxing: Wuxing } | null;
  bossZone: number;
  fragments: number;
  bagFull: boolean;
}

interface RoundButton {
  x: number;
  y: number;
  r: number;
  objs: Phaser.GameObjects.GameObject[];
  cd: Phaser.GameObjects.Graphics;
  cdText: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
}

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/**
 * 战斗 HUD：覆盖在全屏世界之上。
 *  上方：生命 / 攻防速 / 轮次与净化进度 / 灵囊 / 五行阵图
 *  下方：浮动摇杆（左）、遁 + 范围技能（右下弧形）、五行所属（右侧竖列）
 */
export class HUDScene extends Phaser.Scene {
  private joystick!: VirtualJoystick;

  // 生命
  private hpBar!: Phaser.GameObjects.Graphics;
  private hpText!: Phaser.GameObjects.Text;
  private hp: number = 1;
  private maxHp: number = 1;
  private hpLag: number = 1;

  // 顶部信息
  private statObjs: Phaser.GameObjects.GameObject[] = [];
  private buffText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private timerText!: Phaser.GameObjects.Text;
  private progressBar!: Phaser.GameObjects.Graphics;
  private progressText!: Phaser.GameObjects.Text;
  private minimap!: Phaser.GameObjects.Graphics;
  private bossBar!: Phaser.GameObjects.Graphics;
  private bossText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private bagBadge!: Phaser.GameObjects.Text;
  private lastCombo: number = 0;
  private lastFragments: number = 0;

  // 操控
  private dashBtn!: RoundButton;
  private skillBtns: RoundButton[] = [];
  private wuxingObjs: Phaser.GameObjects.GameObject[] = [];
  private controlObjs: Phaser.GameObjects.GameObject[] = [];

  // 横幅
  private bannerObjs: Phaser.GameObjects.GameObject[] = [];

  // 灵囊开启时的下方效果面板
  private infoPanelObjs: Phaser.GameObjects.GameObject[] = [];
  private infoPanelText!: Phaser.GameObjects.Text;
  private inventoryOpen: boolean = false;
  private lastBuffs: { label: string; color: number; description?: string }[] = [];

  private overlayShown: boolean = false;
  private lastState?: WorldState;

  constructor() {
    super({ key: 'HUDScene' });
  }

  create(): void {
    const { width, height } = this.scale;
    Fx.ensureTextures(this);
    this.makeShadeTexture();

    this.statObjs = [];
    this.skillBtns = [];
    this.wuxingObjs = [];
    this.controlObjs = [];
    this.bannerObjs = [];
    this.infoPanelObjs = [];
    this.inventoryOpen = false;
    this.overlayShown = false;
    this.lastCombo = 0;
    this.lastFragments = gameState.getFragmentCount();
    this.lastBuffs = [];
    this.lastState = undefined;

    // 上下压暗，保证文字与按钮可读
    this.add.image(width / 2, 0, 'hud_shade').setOrigin(0.5, 0).setDisplaySize(width, 260).setFlipY(true).setAlpha(0.85);
    this.add.image(width / 2, height, 'hud_shade').setOrigin(0.5, 1).setDisplaySize(width, 560).setAlpha(0.8);

    this.createTopBar(width);
    this.createControls(width, height);
    this.createInfoPanel(width, height);

    this.refreshStats();
    this.refreshSkillButtons();
    this.refreshWuxingButtons();

    // ── 事件 ──
    eventBus.on(GameEvent.PLAYER_HP_CHANGE, (hp: unknown, maxHp: unknown) => {
      this.hp = hp as number;
      this.maxHp = maxHp as number;
      this.drawHp();
    });
    eventBus.on(GameEvent.WORLD_STATE, (s: unknown) => this.onWorldState(s as WorldState));
    eventBus.on(GameEvent.BUFF_UPDATE, (buffs: unknown) => {
      this.lastBuffs = (buffs as typeof this.lastBuffs) ?? [];
      this.buffText.setText(this.lastBuffs.map(b => b.label).join('  '));
    });
    eventBus.on(GameEvent.INVENTORY_CHANGED, () => this.refreshWuxingButtons());
    eventBus.on(GameEvent.STATS_CHANGED, () => {
      this.refreshStats();
      this.refreshSkillButtons();
      this.refreshWuxingButtons();
      if (this.inventoryOpen) this.infoPanelText.setText(this.buildEffectsText());
    });
    eventBus.on(GameEvent.BANNER, (b: unknown) => {
      const d = b as { title: string; sub?: string; color?: number };
      this.showBanner(d.title, d.sub ?? '', d.color ?? GOLD);
    });
    eventBus.on(GameEvent.VICTORY, (d: unknown) => {
      const v = d as { round: number; kills: number };
      this.showVictoryOverlay(v.round, v.kills);
    });

    this.input.keyboard?.on('keydown-I', () => this.toggleInventory());
    this.input.keyboard?.on('keydown-B', () => this.toggleInventory());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.joystick?.destroy();
      inputManager.reset();
    });
  }

  private makeShadeTexture(): void {
    if (this.textures.exists('hud_shade')) return;
    const c = this.textures.createCanvas('hud_shade', 8, 256)!;
    const ctx = c.getContext();
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.6, 'rgba(0,0,0,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);
    c.refresh();
  }

  // ───────────────────────── 顶部 ─────────────────────────

  private readonly HP = { x: 24, y: 30, w: 310, h: 32 };

  private createTopBar(width: number): void {
    const { x, y, w, h } = this.HP;

    // 生命条
    const frame = this.add.graphics();
    frame.fillStyle(0x05080b, 0.85);
    frame.fillRoundedRect(x - 4, y - 4, w + 8, h + 8, 8);
    frame.lineStyle(2, GOLD, 0.7);
    frame.strokeRoundedRect(x - 4, y - 4, w + 8, h + 8, 8);
    this.hpBar = this.add.graphics();
    this.hpText = this.add.text(x + w / 2, y + h / 2, '', {
      fontFamily: SERIF, fontSize: '22px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.buffText = this.add.text(x, y + 104, '', {
      fontFamily: SANS, fontSize: '18px', color: hex(GOLD), stroke: '#000000', strokeThickness: 3,
    });

    // 轮次 + 计时
    const cx = 478;
    this.roundText = this.add.text(cx, 28, '', {
      fontFamily: SERIF, fontSize: '28px', fontStyle: 'bold', color: hex(GOLD),
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 0);
    this.timerText = this.add.text(cx, 64, '', {
      fontFamily: SERIF, fontSize: '24px', color: '#c9d1d9', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5, 0);
    this.progressBar = this.add.graphics();
    this.progressText = this.add.text(cx, 113, '', {
      fontFamily: SANS, fontSize: '17px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    // 灵囊按钮
    const bx = width - 66, by = 72, bs = 88;
    const bag = this.add.graphics();
    const drawBag = (down: boolean) => {
      bag.clear();
      bag.fillStyle(0x0d1117, down ? 0.6 : 0.88);
      bag.fillRoundedRect(bx - bs / 2, by - bs / 2, bs, bs, 14);
      bag.lineStyle(2.5, GOLD, down ? 1 : 0.75);
      bag.strokeRoundedRect(bx - bs / 2, by - bs / 2, bs, bs, 14);
    };
    drawBag(false);
    this.add.text(bx, by - 2, '灵囊', {
      fontFamily: SERIF, fontSize: '28px', fontStyle: 'bold', color: hex(GOLD),
    }).setOrigin(0.5);
    this.bagBadge = this.add.text(bx + bs / 2 - 4, by - bs / 2 + 2, '满', {
      fontFamily: SANS, fontSize: '18px', fontStyle: 'bold', color: '#ffffff',
      backgroundColor: '#c94a4a', padding: { x: 5, y: 2 },
    }).setOrigin(1, 0).setVisible(false);
    const bagHit = this.add.rectangle(bx, by, bs + 12, bs + 12, 0xffffff, 0).setInteractive();
    bagHit.on('pointerdown', () => drawBag(true));
    bagHit.on('pointerout', () => drawBag(false));
    bagHit.on('pointerup', () => { drawBag(false); sfx.click(); this.toggleInventory(); });

    // 五行阵图（小地图）
    this.minimap = this.add.graphics();

    // 病变核心血条
    this.bossBar = this.add.graphics();
    this.bossText = this.add.text(width / 2, 262, '', {
      fontFamily: SERIF, fontSize: '22px', fontStyle: 'bold', color: '#e9d5ff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setVisible(false);

    // 连斩
    this.comboText = this.add.text(36, 330, '', {
      fontFamily: SERIF, fontSize: '40px', fontStyle: 'bold', color: '#ffe066',
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0, 0.5).setVisible(false);
  }

  private drawHp(): void {
    const { x, y, w, h } = this.HP;
    const pct = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    if (pct > this.hpLag) this.hpLag = pct;
    const color = pct > 0.5 ? 0x3fb950 : pct > 0.25 ? 0xeab308 : 0xf85149;
    const g = this.hpBar;
    g.clear();
    // 受击残影
    if (this.hpLag > pct) {
      g.fillStyle(0xffffff, 0.75);
      g.fillRoundedRect(x, y, Math.max(8, w * this.hpLag), h, 5);
    }
    if (pct > 0) {
      g.fillStyle(color, 1);
      g.fillRoundedRect(x, y, Math.max(8, w * pct), h, 5);
      g.fillStyle(0xffffff, 0.22);
      g.fillRoundedRect(x, y, Math.max(8, w * pct), h * 0.4, 5);
    }
    this.hpText.setText(`${Math.ceil(this.hp)} / ${this.maxHp}`);
  }

  /** 攻 / 防 / 速 徽章 + 碎片 */
  private refreshStats(): void {
    this.statObjs.forEach(o => o.destroy());
    this.statObjs = [];
    const defs = [
      { label: '攻', value: gameState.getTotalAttack(), color: 0xff7a5c },
      { label: '防', value: gameState.getTotalDefense(), color: 0x58a6ff },
      { label: '速', value: gameState.getTotalSpeed(), color: 0x4ade80 },
      { label: '碎片', value: gameState.getFragmentCount(), color: GOLD },
    ];
    let x = this.HP.x - 4;
    const y = this.HP.y + this.HP.h + 30;
    defs.forEach(d => {
      const t = this.add.text(0, y, `${d.label} ${d.value}`, {
        fontFamily: SANS, fontSize: '20px', fontStyle: 'bold', color: hex(d.color),
      }).setOrigin(0, 0.5);
      const bw = t.width + 18;
      const bg = this.add.graphics();
      bg.fillStyle(0x05080b, 0.8);
      bg.fillRoundedRect(x, y - 16, bw, 32, 8);
      bg.lineStyle(1.5, d.color, 0.6);
      bg.strokeRoundedRect(x, y - 16, bw, 32, 8);
      t.setX(x + 9).setDepth(1);
      this.statObjs.push(bg, t);
      x += bw + 8;
    });
  }

  // ───────────────────────── 操控区 ─────────────────────────

  private createControls(width: number, height: number): void {
    // 浮动摇杆：屏幕下半任意空白处按下即可
    this.joystick = new VirtualJoystick(this, 176, height - 250, 92, height * 0.40);

    // 遁
    this.dashBtn = this.makeRoundButton(width - 128, height - 200, 70, '遁', 0x9fd8ff, 46, () => inputManager.pressDash());
    this.controlObjs.push(...this.dashBtn.objs);
  }

  /** 圆形按钮（带冷却扇形遮罩） */
  private makeRoundButton(
    x: number, y: number, r: number, label: string, color: number, fontSize: number,
    onPress: () => void,
  ): RoundButton {
    const bg = this.add.graphics();
    bg.fillStyle(0x0b1016, 0.72);
    bg.fillCircle(x, y, r);
    bg.fillStyle(color, 0.16);
    bg.fillCircle(x, y, r);
    bg.lineStyle(3, color, 0.9);
    bg.strokeCircle(x, y, r);
    bg.lineStyle(1.5, color, 0.35);
    bg.strokeCircle(x, y, r - 8);

    const glow = this.add.image(x, y, 'fx_glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD)
      .setScale((r * 2.6) / 256).setAlpha(0);
    const txt = this.add.text(x, y, label, {
      fontFamily: SERIF, fontSize: `${fontSize}px`, fontStyle: 'bold', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    const cd = this.add.graphics();
    const cdText = this.add.text(x, y, '', {
      fontFamily: SERIF, fontSize: `${Math.round(fontSize * 0.8)}px`, fontStyle: 'bold', color: '#ffe066',
      stroke: '#000000', strokeThickness: 5,
    }).setOrigin(0.5).setVisible(false);

    const hit = this.add.circle(x, y, r + 8, 0xffffff, 0).setInteractive();
    hit.on('pointerdown', () => {
      onPress();
      glow.setAlpha(0.9);
      this.tweens.add({ targets: glow, alpha: 0, duration: 260 });
    });

    return { x, y, r, cd, cdText, label: txt, objs: [bg, glow, txt, cd, cdText, hit] };
  }

  private setCooldown(btn: RoundButton, remainMs: number, pct: number): void {
    btn.cd.clear();
    // 冷却中淡化技能名，让倒计时数字清晰
    btn.label.setAlpha(pct > 0.001 ? 0.18 : 1);
    if (pct > 0.001) {
      btn.cd.fillStyle(0x000000, 0.66);
      btn.cd.slice(btn.x, btn.y, btn.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct, false);
      btn.cd.fillPath();
      btn.cdText.setText(remainMs >= 1000 ? `${Math.ceil(remainMs / 1000)}` : (remainMs / 1000).toFixed(1));
      btn.cdText.setVisible(btn.cd.visible);
    } else {
      btn.cdText.setVisible(false);
    }
  }

  /** 范围技能：围绕「遁」按钮的弧形排布 */
  private refreshSkillButtons(): void {
    this.skillBtns.forEach(b => b.objs.forEach(o => o.destroy()));
    this.skillBtns = [];
    const ids = getEquippedAoeSkills();
    const cx = this.dashBtn.x, cy = this.dashBtn.y;
    ids.forEach((id, i) => {
      const cfg = AOE_CONFIG[id];
      if (!cfg) return;
      const a = Phaser.Math.DegToRad(170 + i * 31);
      const btn = this.makeRoundButton(
        cx + Math.cos(a) * 178, cy + Math.sin(a) * 178, 44,
        cfg.label.slice(0, 2), WX_TINT[cfg.wuxing], 26,
        () => inputManager.pressSkill(i),
      );
      this.skillBtns.push(btn);
    });
    this.applyControlVisibility();
  }

  /**
   * 五行快换：两列按钮，左列换武器（进攻五行），右列换防具（防守五行）。
   * 灵囊里有该五行的器物才可点；当前穿戴的高亮。
   */
  private refreshWuxingButtons(): void {
    this.wuxingObjs.forEach(o => o.destroy());
    this.wuxingObjs = [];
    const { width, height } = this.scale;
    const eq = gameState.getPlayerState().equipment;
    const inv = gameState.getInventory();
    const r = 31;
    const stepY = 70;
    const baseY = height - 478;

    const columns: Array<{ type: EquipmentType.WEAPON | EquipmentType.ARMOR; x: number; title: string; current?: Wuxing }> = [
      { type: EquipmentType.WEAPON, x: width - 124, title: '兵', current: eq.weapon?.wuxing },
      { type: EquipmentType.ARMOR, x: width - 50, title: '甲', current: eq.armor?.wuxing },
    ];

    columns.forEach(col => {
      const head = this.add.text(col.x, baseY - WX_ORDER.length * stepY + 22, col.title, {
        fontFamily: SERIF, fontSize: '22px', fontStyle: 'bold', color: hex(GOLD),
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5);
      this.wuxingObjs.push(head);

      WX_ORDER.forEach((wx, i) => {
        const y = baseY - (WX_ORDER.length - 1 - i) * stepY;
        const color = WX_TINT[wx];
        const equipped = col.current === wx;
        const owned = equipped || inv.some(it => it?.type === col.type && it.wuxing === wx);

        const g = this.add.graphics();
        g.fillStyle(0x0b1016, owned ? 0.8 : 0.45);
        g.fillCircle(col.x, y, r);
        if (owned) {
          g.fillStyle(color, equipped ? 0.6 : 0.14);
          g.fillCircle(col.x, y, r);
        }
        g.lineStyle(equipped ? 4 : 2, color, equipped ? 1 : owned ? 0.7 : 0.18);
        g.strokeCircle(col.x, y, r);
        const t = this.add.text(col.x, y, WUXING_NAMES[wx], {
          fontFamily: SERIF, fontSize: '30px', fontStyle: 'bold',
          color: equipped ? '#ffffff' : hex(color), stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setAlpha(owned ? 1 : 0.22);

        this.wuxingObjs.push(g, t);
        if (owned && !equipped) {
          const hit = this.add.circle(col.x, y, r + 3, 0xffffff, 0).setInteractive();
          hit.on('pointerdown', () => {
            const item = quickSwapGear(col.type, wx);
            if (!item) return;
            eventBus.emit(GameEvent.STATS_CHANGED);
            eventBus.emit(GameEvent.GEAR_SWAPPED, { item });
          });
          this.wuxingObjs.push(hit);
        }
      });
    });

    this.applyControlVisibility();
  }

  private applyControlVisibility(): void {
    const v = !this.inventoryOpen && !this.overlayShown;
    const set = (o: Phaser.GameObjects.GameObject) => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(v);
    this.controlObjs.forEach(set);
    this.skillBtns.forEach(b => b.objs.forEach(set));
    this.wuxingObjs.forEach(set);
    this.joystick?.setEnabled(v);
    if (v && this.lastState) this.updateCooldowns(this.lastState);
  }

  // ───────────────────────── 世界状态刷新 ─────────────────────────

  private onWorldState(s: WorldState): void {
    this.lastState = s;
    const { width } = this.scale;

    // 生命条残影缓慢追上
    const pct = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    if (this.hpLag > pct) {
      this.hpLag = Math.max(pct, this.hpLag - 0.03);
      this.drawHp();
    }

    // 轮次 / 计时 / 净化进度
    const g = this.progressBar;
    g.clear();
    if (s.round <= 0) {
      this.roundText.setText('');
      this.timerText.setText('');
      this.progressText.setText('');
    } else if (s.phase === 'rest') {
      this.roundText.setText(`第 ${s.round} 轮`).setColor('#4ade80');
      this.timerText.setText(`调息 ${s.secsLeft}s`).setColor('#4ade80');
      this.progressText.setText('');
    } else {
      const boss = isBossRound(s.round);
      this.roundText.setText(`第 ${s.round} 轮`).setColor(boss ? '#c084fc' : hex(GOLD));
      const tc = s.secsLeft <= 10 ? '#f85149' : s.secsLeft <= 25 ? '#eab308' : '#c9d1d9';
      this.timerText.setText(`${s.secsLeft}s`).setColor(tc);
      const bw = 230, bh = 22, bx = 478 - bw / 2, by = 102;
      g.fillStyle(0x05080b, 0.85);
      g.fillRoundedRect(bx - 2, by - 2, bw + 4, bh + 4, 6);
      if (!s.boss) {
        const p = s.quota > 0 ? Phaser.Math.Clamp(s.kills / s.quota, 0, 1) : 0;
        if (p > 0) {
          g.fillStyle(GOLD, 0.95);
          g.fillRoundedRect(bx, by, Math.max(8, bw * p), bh, 5);
        }
        this.progressText.setText(`净化 ${Math.min(s.kills, s.quota)} / ${s.quota}`);
      } else {
        g.fillStyle(0xc084fc, 0.5);
        g.fillRoundedRect(bx, by, bw, bh, 5);
        this.progressText.setText('击溃病变核心');
      }
      g.lineStyle(1.5, GOLD, 0.6);
      g.strokeRoundedRect(bx - 2, by - 2, bw + 4, bh + 4, 6);
    }

    // 病变核心血条
    const bb = this.bossBar;
    bb.clear();
    if (s.boss) {
      const bw = 520, bh = 20, bx = (width - bw) / 2, by = 284;
      const p = Phaser.Math.Clamp(s.boss.hp / s.boss.maxHp, 0, 1);
      bb.fillStyle(0x05080b, 0.9);
      bb.fillRoundedRect(bx - 3, by - 3, bw + 6, bh + 6, 6);
      bb.fillStyle(0xc084fc, 1);
      if (p > 0) bb.fillRoundedRect(bx, by, Math.max(8, bw * p), bh, 4);
      bb.lineStyle(2, 0xe9d5ff, 0.8);
      bb.strokeRoundedRect(bx - 3, by - 3, bw + 6, bh + 6, 6);
      this.bossText.setText(`${WUXING_NAMES[s.boss.wuxing]} · ${s.boss.name}`).setVisible(true);
    } else {
      this.bossText.setVisible(false);
    }

    // 连斩
    if (s.combo >= 2) {
      this.comboText.setText(`连斩 ×${s.combo}`).setVisible(true);
      this.comboText.setColor(s.combo >= 8 ? '#ff7a3c' : s.combo >= 3 ? '#ffe066' : '#ffffff');
      if (s.combo > this.lastCombo) {
        this.comboText.setScale(1.35);
        this.tweens.add({ targets: this.comboText, scale: 1, duration: 160, ease: 'Quad.easeOut' });
      }
    } else {
      this.comboText.setVisible(false);
    }
    this.lastCombo = s.combo;

    this.bagBadge.setVisible(s.bagFull);
    if (s.fragments !== this.lastFragments) {
      this.lastFragments = s.fragments;
      this.refreshStats();
    }
    this.drawMinimap(s);
    this.updateCooldowns(s);
  }

  private updateCooldowns(s: WorldState): void {
    if (this.inventoryOpen || this.overlayShown) return;
    this.setCooldown(this.dashBtn, s.dashPct * 3000, s.dashPct);
    this.skillBtns.forEach((btn, i) => {
      const t = s.skillTimers[i] ?? 0;
      const m = s.skillMax[i] ?? 1;
      this.setCooldown(btn, t, m > 0 ? t / m : 0);
    });
  }

  /** 五行阵图：五个阵眼的妖异数量 + 残魂位置 */
  private drawMinimap(s: WorldState): void {
    const g = this.minimap;
    g.clear();
    const cx = this.scale.width - 66, cy = 196, R = 58;
    g.fillStyle(0x05080b, 0.72);
    g.fillCircle(cx, cy, R);
    g.lineStyle(2, GOLD, 0.55);
    g.strokeCircle(cx, cy, R);
    const k = (R * 2 * 0.86) / WORLD_SIZE;
    const mx = (wx: number) => cx + (wx - WORLD_CENTER) * k;
    const my = (wy: number) => cy + (wy - WORLD_CENTER) * k;

    ZONES.forEach((z, i) => {
      const n = s.zones[i] ?? 0;
      const zx = mx(z.x), zy = my(z.y);
      if (n > 0) {
        g.fillStyle(WX_TINT[z.wuxing], 0.95);
        g.fillCircle(zx, zy, 5 + Math.min(6, n * 0.7));
      } else {
        g.lineStyle(1.5, WX_TINT[z.wuxing], 0.4);
        g.strokeCircle(zx, zy, 5);
      }
      if (i === s.bossZone) {
        g.lineStyle(2.5, 0xc084fc, 1);
        g.strokeCircle(zx, zy, 14);
      }
    });
    // 残魂
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx + (s.px - 0.5) * R * 2 * 0.86, cy + (s.py - 0.5) * R * 2 * 0.86, 4);
  }

  // ───────────────────────── 横幅 ─────────────────────────

  private showBanner(title: string, sub: string, color: number): void {
    this.bannerObjs.forEach(o => o.destroy());
    this.bannerObjs = [];
    const { width, height } = this.scale;
    const y = height * 0.25;

    const band = this.add.graphics();
    band.fillStyle(0x000000, 0.55);
    band.fillRect(0, y - 62, width, 132);
    band.lineStyle(2, color, 0.8);
    band.lineBetween(0, y - 62, width, y - 62);
    band.lineBetween(0, y + 70, width, y + 70);
    const t = this.add.text(width / 2, y - 18, title, {
      fontFamily: SERIF, fontSize: '50px', fontStyle: 'bold', color: hex(color),
      stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);
    const st = this.add.text(width / 2, y + 36, sub, {
      fontFamily: SERIF, fontSize: '24px', color: '#f0e6d3', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    const objs = [band, t, st];
    this.bannerObjs = objs;
    objs.forEach(o => o.setAlpha(0).setDepth(200));
    t.setScale(1.3);
    this.tweens.add({ targets: objs, alpha: 1, duration: 220 });
    this.tweens.add({ targets: t, scale: 1, duration: 300, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: objs, alpha: 0, duration: 450, delay: 2300,
      onComplete: () => {
        objs.forEach(o => o.destroy());
        if (this.bannerObjs === objs) this.bannerObjs = [];
      },
    });
  }

  // ───────────────────────── 灵囊 ─────────────────────────

  private createInfoPanel(width: number, height: number): void {
    const top = height * LAYOUT.VIEWPORT_RATIO;
    const bg = this.add.rectangle(width / 2, (top + height) / 2, width, height - top, 0x0d1117, 0.97)
      .setInteractive().setDepth(300);
    const line = this.add.graphics().setDepth(301);
    line.lineStyle(2, GOLD, 0.5);
    line.lineBetween(0, top, width, top);
    const title = this.add.text(28, top + 22, '当前效果', {
      fontFamily: SERIF, fontSize: '30px', fontStyle: 'bold', color: hex(GOLD),
    }).setDepth(301);
    const hint = this.add.text(width - 28, top + 30, '灵囊开启时世界静止', {
      fontFamily: SANS, fontSize: '18px', color: '#8b949e',
    }).setOrigin(1, 0).setDepth(301);
    this.infoPanelText = this.add.text(28, top + 76, '', {
      fontFamily: SANS, fontSize: '21px', color: '#c9d1d9',
      lineSpacing: 5,
    }).setDepth(301);
    this.infoPanelObjs = [bg, line, title, hint, this.infoPanelText];
    this.infoPanelObjs.forEach(o => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(false));
  }

  private buildEffectsText(): string {
    const eq = gameState.getPlayerState().equipment;
    const skills = getAllEquipmentSkills(eq);
    const parts: string[] = [];
    const wName = eq.weapon?.wuxing ? WUXING_NAMES[eq.weapon.wuxing] : '无';
    const aName = eq.armor?.wuxing ? WUXING_NAMES[eq.armor.wuxing] : '无';
    parts.push(
      `进攻五行（武器）：${wName}　　防守五行（防具）：${aName}`,
      '五行伤害：克 ×2.5　得生 ×1.5　同属 ×1　受制 ×0.5　泄 ×0.25',
      '进攻用克制妖异的五行；防守穿妖异所「生」的五行最稳，被克则重创。',
      '战斗中点右侧「兵 / 甲」两列即可快换灵囊里的器物。',
    );
    if (skills.length > 0) {
      parts.push('', '── 技能 ──');
      skills.forEach(sk => {
        const aoe = AOE_CONFIG[sk.id];
        parts.push(`${sk.name} Lv${sk.level}　${sk.description}${aoe ? `（冷却${aoe.cd / 1000}秒）` : ''}`);
      });
    }
    if (this.lastBuffs.length > 0) {
      parts.push('', '── 增益 ──');
      this.lastBuffs.forEach(b => parts.push(b.description ?? b.label));
    }
    return wrapCJK(parts.join('\n'), this.scale.width - 76, `21px ${SANS}`);
  }

  private toggleInventory(): void {
    if (this.overlayShown) return;
    if (this.scene.isActive('InventoryScene')) {
      this.scene.stop('InventoryScene');
    } else {
      inputManager.reset();
      this.scene.launch('InventoryScene');
      this.scene.bringToTop('InventoryScene');
    }
  }

  update(): void {
    // 灵囊可能由它自己的关闭按钮关掉，这里统一侦测开关状态
    const open = this.scene.isActive('InventoryScene');
    if (open === this.inventoryOpen) return;
    this.inventoryOpen = open;
    this.infoPanelObjs.forEach(o => (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(open));
    if (open) {
      this.infoPanelText.setText(this.buildEffectsText());
      this.dashBtn.cd.clear();
      this.skillBtns.forEach(b => b.cd.clear());
    } else {
      this.refreshStats();
    }
    this.applyControlVisibility();
  }

  // ───────────────────────── 结算 ─────────────────────────

  private makeOverlay(alpha: number): void {
    const { width, height } = this.scale;
    this.overlayShown = true;
    this.applyControlVisibility();
    const overlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0)
      .setInteractive().setDepth(1000);
    this.tweens.add({ targets: overlay, fillAlpha: alpha, duration: 500 });
  }

  private makeTextButton(y: number, label: string, color: string, onClick: () => void): Phaser.GameObjects.Text {
    const { width } = this.scale;
    const btn = this.add.text(width / 2, y, `【 ${label} 】`, {
      fontFamily: SERIF, fontSize: '40px', fontStyle: 'bold', color,
      stroke: '#000000', strokeThickness: 5, padding: { x: 30, y: 16 },
    }).setOrigin(0.5).setDepth(1001).setInteractive({ useHandCursor: true }).setAlpha(0);
    btn.on('pointerdown', () => btn.setScale(0.94));
    btn.on('pointerout', () => btn.setScale(1));
    btn.on('pointerup', () => { btn.setScale(1); sfx.click(); onClick(); });
    this.tweens.add({ targets: btn, alpha: 1, duration: 400, delay: 700 });
    return btn;
  }

  private backToMenu(): void {
    gameState.reset();
    this.scene.stop('InventoryScene');
    this.scene.stop('WorldScene');
    this.scene.start('MenuScene');
  }

  /** 残魂消散 */
  showGameOverOverlay(round: number = 1, kills: number = 0): void {
    if (this.overlayShown) return;
    const { width, height } = this.scale;
    this.scene.stop('InventoryScene');
    this.makeOverlay(0.8);

    const objs: Phaser.GameObjects.Text[] = [];
    objs.push(this.add.text(width / 2, height * 0.27, '残魂消散', {
      fontFamily: SERIF, fontSize: '84px', fontStyle: 'bold', color: '#f85149',
      stroke: '#000000', strokeThickness: 8,
    }));
    objs.push(this.add.text(width / 2, height * 0.27 + 100, '这一缕意志散入天地\n新的残魂终将诞生，背负同样的使命', {
      fontFamily: SERIF, fontSize: '26px', color: '#8b949e', align: 'center', lineSpacing: 10,
    }));
    objs.push(this.add.text(width / 2, height * 0.27 + 230, `坚持至第 ${round} 轮　　净化妖异 ${kills}`, {
      fontFamily: SERIF, fontSize: '30px', color: hex(GOLD),
    }));
    objs.forEach((o, i) => {
      o.setOrigin(0.5).setDepth(1001).setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 500, delay: 200 + i * 200 });
    });

    this.makeTextButton(height * 0.58, '再入轮回', hex(GOLD), () => {
      gameState.reset();
      this.scene.stop('InventoryScene');
      this.scene.get('WorldScene').scene.restart();
    });
    this.makeTextButton(height * 0.58 + 110, '返回', '#8b949e', () => this.backToMenu());
  }

  /** 病变核心溃散：这片气脉已净化 */
  private showVictoryOverlay(round: number, kills: number): void {
    if (this.overlayShown) return;
    const { width, height } = this.scale;
    this.scene.stop('InventoryScene');
    this.makeOverlay(0.72);

    const created: Phaser.GameObjects.GameObject[] = [];
    const title = this.add.text(width / 2, height * 0.24, '气脉净化', {
      fontFamily: SERIF, fontSize: '84px', fontStyle: 'bold', color: '#ffe9a8',
      stroke: '#000000', strokeThickness: 8,
    });
    const body = this.add.text(width / 2, height * 0.24 + 150,
      '病变核心溃散，五行之力重归纯粹。\n\n但这不是终结——\n世界的其他角落，新的病变仍在滋生。', {
        fontFamily: SERIF, fontSize: '27px', color: '#f0e6d3', align: 'center', lineSpacing: 10,
      });
    const stat = this.add.text(width / 2, height * 0.24 + 330, `第 ${round} 轮　　净化妖异 ${kills}`, {
      fontFamily: SERIF, fontSize: '30px', color: hex(GOLD),
    });
    [title, body, stat].forEach((o, i) => {
      o.setOrigin(0.5).setDepth(1001).setAlpha(0);
      this.tweens.add({ targets: o, alpha: 1, duration: 500, delay: 200 + i * 250 });
      created.push(o);
    });

    const cont = this.makeTextButton(height * 0.62, '继续净化', hex(GOLD), () => {
      // 关闭结算层，带着现有器物前往更深处
      this.children.list
        .filter(o => (o as unknown as { depth: number }).depth >= 1000)
        .forEach(o => o.destroy());
      this.overlayShown = false;
      this.applyControlVisibility();
      eventBus.emit(GameEvent.CONTINUE_RUN);
    });
    const back = this.makeTextButton(height * 0.62 + 110, '回归本源', '#8b949e', () => this.backToMenu());
    created.push(cont, back);
  }
}
