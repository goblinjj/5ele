import Phaser from 'phaser';
import { VirtualJoystick } from '../systems/input/VirtualJoystick.js';
import { inputManager } from '../systems/input/InputManager.js';
import { eventBus, GameEvent } from '../core/EventBus.js';
import { uiConfig, LAYOUT } from '../config/uiConfig.js';
import {
  AttributeSkillId, getAllAttributeSkills, Wuxing, WUXING_COLORS, WUXING_NAMES,
  getAllEquipmentSkills, getWuxingPassiveStatuses, STATUS_DEFINITIONS,
} from '@xiyou/shared';
import { gameState } from '../systems/GameStateManager.js';

/** 与 CombatSystem 保持一致 */
const AOE_SKILL_IDS = new Set([
  AttributeSkillId.LIEKONGZHAN,
  AttributeSkillId.HANCHAO,
  AttributeSkillId.JINGJI,
  AttributeSkillId.FENTIAN,
  AttributeSkillId.DILIE,
]);

const AOE_SKILL_META: Record<string, { label: string; color: number }> = {
  [AttributeSkillId.LIEKONGZHAN]: { label: '裂空斩', color: 0xd4a853 },
  [AttributeSkillId.HANCHAO]:     { label: '寒潮',   color: 0x58a6ff },
  [AttributeSkillId.JINGJI]:      { label: '荆棘',   color: 0x3fb950 },
  [AttributeSkillId.FENTIAN]:     { label: '焚天',   color: 0xf85149 },
  [AttributeSkillId.DILIE]:       { label: '地裂',   color: 0xa16946 },
};

export class HUDScene extends Phaser.Scene {
  private joystick!: VirtualJoystick;
  private playerHpBar!: Phaser.GameObjects.Graphics;
  private playerHpText!: Phaser.GameObjects.Text;
  private playerMaxHp: number = 100;
  private playerHp: number = 100;
  /** AOE 技能按钮的 CD 覆盖层和文字 */
  private aoeSkillCdOverlays: Phaser.GameObjects.Graphics[] = [];
  private aoeSkillCdTexts: Phaser.GameObjects.Text[] = [];
  private buffArea!: Phaser.GameObjects.Container;
  /** AOE 技能按钮区（buff 栏下方） */
  private aoeSkillArea!: Phaser.GameObjects.Container;
  /** 属性/技能/状态容器（装备变化时整体重建） */
  private infoArea!: Phaser.GameObjects.Container;
  private panelY: number = 0;
  /** 五行直列按钮容器（持久显示，无需点击展开） */
  private wuxingDirectContainer!: Phaser.GameObjects.Container;
  /** 持久化弹窗（scene 级别对象，非 Container，避免 setVisible 不级联的问题） */
  private popupBg!: Phaser.GameObjects.Graphics;
  private popupTitle!: Phaser.GameObjects.Text;
  private popupDesc!: Phaser.GameObjects.Text;
  private popupHit!: Phaser.GameObjects.Rectangle;
  /** 当前展示的 pill key，用于 toggle 判断 */
  private popupKey: string = '';
  /** 上一次 buff 数据（供合并弹框使用） */
  private lastBuffs: { label: string; color: number; description?: string }[] = [];
  /** 游戏失败覆盖是否已显示（防止重复创建） */
  private gameOverShown: boolean = false;

  constructor() {
    super({ key: 'HUDScene' });
  }

  create(): void {
    const { width, height } = this.cameras.main;
    const panelH = height * LAYOUT.PANEL_RATIO;
    const panelY = height * LAYOUT.VIEWPORT_RATIO;
    this.panelY = panelY;
    this.gameOverShown = false;

    // 操控面板背景
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x0d1117, 0.92);
    panelBg.fillRect(0, panelY, width, panelH);
    panelBg.lineStyle(1, 0xd4a853, 0.3);
    panelBg.lineBetween(0, panelY, width, panelY);
    // 摇杆区分割线：上方 35% 为内容展示区，下方 65% 为摇杆区
    panelBg.lineStyle(1, 0xd4a853, 0.18);
    panelBg.lineBetween(0, panelY + panelH * 0.35, width, panelY + panelH * 0.35);

    // ── 左上：HP 条 + 属性/技能/状态 ──
    this.createPlayerHpBar(width, panelY);

    // 属性/技能/状态展示区（HP条正下方，紧凑排列）
    this.infoArea = this.add.container(0, panelY + 28).setDepth(51);
    this.refreshInfoArea();

    // Buff 展示区（技能/状态条下方）
    this.buffArea = this.add.container(0, panelY + 70).setDepth(51);

    // AOE 技能按钮区：位于分割线（上方35%区域最底部）正上方
    const dividerY = panelY + panelH * 0.35;
    const aoeSkillH = 32;
    this.aoeSkillArea = this.add.container(0, dividerY - aoeSkillH).setDepth(51);
    this.refreshAoeSkillButtons();

    // ── 右上：灵囊 + 五行直列按钮 ──
    this.createInventoryButton(width, panelY);
    this.createWuxingDirectButtons(width, panelY);

    // ── 虚拟摇杆：面板下方 65% 全宽可用 ──
    const joystickMinY = panelY + panelH * 0.35; // 分割线以下全给摇杆
    const joystickX = width * 0.5;
    const joystickY = panelY + panelH * 0.675;   // 摇杆基点在摇杆区中央
    this.joystick = new VirtualJoystick(this, joystickX, joystickY, Math.min(width * 0.14, 90), joystickMinY);

    // ── 事件监听 ──
    eventBus.on(GameEvent.PLAYER_HP_CHANGE, (hp: unknown, maxHp: unknown) => {
      this.playerHp = hp as number;
      this.playerMaxHp = maxHp as number;
      this.updateHpBar();
    });

    eventBus.on(GameEvent.SKILL_CD_UPDATE, (timers: unknown, maxTimers: unknown) => {
      this.updateAoeSkillCds(timers as number[], maxTimers as number[]);
    });

    eventBus.on(GameEvent.BUFF_UPDATE, (buffs: unknown) => {
      this.renderBuffs(buffs as { label: string; color: number }[]);
    });

    eventBus.on(GameEvent.WUXING_CHOSEN, () => {
      this.refreshWuxingDirectButtons();
    });

    eventBus.on(GameEvent.STATS_CHANGED, () => {
      this.refreshInfoArea();
      this.refreshAoeSkillButtons();
      this.refreshWuxingDirectButtons();
    });

    eventBus.on(GameEvent.GAME_OVER, () => {
      this.showGameOverOverlay();
    });

    this.createPersistentInfoPopup();

    // 技能/状态/Buff 区域单击 → 显示合并弹框（场景级监听，可靠触控）
    const maxWuxing = 5;
    const invBtnSize = uiConfig.btnSizePrimary;
    const wuxingGap = 8;
    const wuxingRightMargin = 12;
    // 留出灵囊 + 最多5个五行按钮的空间
    const effectsX2 = width - wuxingRightMargin - invBtnSize - wuxingGap - maxWuxing * (invBtnSize + wuxingGap);
    const effectsY1 = panelY + 22;
    const effectsY2 = panelY + 100;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.x <= effectsX2 &&
          pointer.y >= effectsY1 && pointer.y <= effectsY2) {
        this.toggleInfoPopup('当前效果', this.buildAllEffectsText(), 0xd4a853);
      }
    });
  }

  /** 测试方法B（保留供内部调用，无入口） */
  private createPlayerHpBar(width: number, panelY: number): void {
    // HP 条宽度：左侧 60%，右侧留给赋能+灵囊按钮
    const barW = width * 0.50;
    const barH = 12;
    const barX = width * 0.05;
    const barY = panelY + 10;

    const bg = this.add.graphics();
    bg.fillStyle(0x1c2128, 1);
    bg.fillRoundedRect(barX - 2, barY - 2, barW + 4, barH + 4, 4);

    this.playerHpBar = this.add.graphics();
    this.updateHpBar();

    this.playerHpText = this.add.text(barX + barW / 2, barY + barH / 2, '', {
      fontFamily: 'monospace',
      fontSize: `${uiConfig.fontXS}px`,
      color: '#ffffff',
    }).setOrigin(0.5).setDepth(10);

    this.add.text(barX, barY - 12, '残魂', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: `${uiConfig.fontXS}px`,
      color: '#d4a853',
    });
  }

  private updateHpBar(): void {
    if (!this.playerHpBar) return;
    const { width, height } = this.cameras.main;
    const panelY = height * LAYOUT.VIEWPORT_RATIO;
    const barW = width * 0.50;
    const barH = 12;
    const barX = width * 0.05;
    const barY = panelY + 10;

    const pct = Math.max(0, this.playerHp / this.playerMaxHp);
    const color = pct > 0.5 ? 0x3fb950 : pct > 0.25 ? 0xeab308 : 0xf85149;

    this.playerHpBar.clear();
    this.playerHpBar.fillStyle(color, 1);
    this.playerHpBar.fillRoundedRect(barX, barY, barW * pct, barH, 3);

    if (this.playerHpText) {
      this.playerHpText.setText(`${this.playerHp}/${this.playerMaxHp}`);
    }
  }

  /** 重建 AOE 技能按钮区（buff 栏下方，所有已拥有的范围技能） */
  private refreshAoeSkillButtons(): void {
    this.aoeSkillArea.removeAll(true);
    this.aoeSkillCdOverlays = [];
    this.aoeSkillCdTexts = [];

    const playerState = gameState.getPlayerState();
    const allSkills = getAllEquipmentSkills(playerState.equipment);
    const activeSkills = allSkills.filter(s => AOE_SKILL_IDS.has(s.id));
    if (activeSkills.length === 0) return;

    const { width } = this.cameras.main;
    const totalSkills = activeSkills.length;
    const btnW = uiConfig.btnSizeSkill;
    const btnH = uiConfig.btnSizeSkill;
    const gap = 8;
    const totalRowW = totalSkills * btnW + (totalSkills - 1) * gap;
    let x = (width - totalRowW) / 2;

    activeSkills.forEach((skill, i) => {
      const meta = AOE_SKILL_META[skill.id] ?? { label: skill.name, color: 0x8b949e };
      const color = meta.color;
      // 关键：用 const 捕获当前迭代的 x 值，避免闭包引用变量污染
      const btnX = x;

      const bg = this.add.graphics();
      bg.fillStyle(color, 0.2);
      bg.fillRoundedRect(btnX, -btnH / 2, btnW, btnH, 4);
      bg.lineStyle(1.5, color, 0.8);
      bg.strokeRoundedRect(btnX, -btnH / 2, btnW, btnH, 4);
      this.aoeSkillArea.add(bg);

      const lbl = this.add.text(btnX + btnW / 2, 0, meta.label, {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: '11px',
        color: '#ffffff',
      }).setOrigin(0.5);
      this.aoeSkillArea.add(lbl);

      const cdOverlay = this.add.graphics();
      this.aoeSkillArea.add(cdOverlay);
      this.aoeSkillCdOverlays.push(cdOverlay);

      const cdText = this.add.text(btnX + btnW / 2, 0, '', {
        fontFamily: 'monospace',
        fontSize: '10px',
        color: '#ffff88',
      }).setOrigin(0.5).setAlpha(0);
      this.aoeSkillArea.add(cdText);
      this.aoeSkillCdTexts.push(cdText);

      const hit = this.add.rectangle(btnX + btnW / 2, 0, btnW, btnH, 0xffffff, 0).setInteractive();
      this.aoeSkillArea.add(hit);

      const idx = i;
      hit.on('pointerdown', () => {
        bg.clear();
        bg.fillStyle(color, 0.55);
        bg.fillRoundedRect(btnX, -btnH / 2, btnW, btnH, 4);
        bg.lineStyle(1.5, color, 1);
        bg.strokeRoundedRect(btnX, -btnH / 2, btnW, btnH, 4);
        inputManager.pressSkill(idx);
      });
      hit.on('pointerup', () => {
        bg.clear();
        bg.fillStyle(color, 0.2);
        bg.fillRoundedRect(btnX, -btnH / 2, btnW, btnH, 4);
        bg.lineStyle(1.5, color, 0.8);
        bg.strokeRoundedRect(btnX, -btnH / 2, btnW, btnH, 4);
        inputManager.releaseSkill(idx);
      });
      hit.on('pointerout', () => inputManager.releaseSkill(idx));

      x += btnW + gap;
    });
  }

  private updateAoeSkillCds(timers: number[], maxTimers: number[]): void {
    timers.forEach((t, i) => {
      const overlay = this.aoeSkillCdOverlays[i];
      const cdText = this.aoeSkillCdTexts[i];
      if (!overlay || !cdText) return;
      overlay.clear();
      if (t > 0 && maxTimers[i] > 0) {
        const pct = t / maxTimers[i];
        const { width } = this.cameras.main;
        const totalSkills = this.aoeSkillCdOverlays.length;
        const btnW = uiConfig.btnSizeSkill;
        const btnH = uiConfig.btnSizeSkill;
        const gap = 8;
        const totalRowW = totalSkills * btnW + (totalSkills - 1) * gap;
        const x = (width - totalRowW) / 2 + i * (btnW + gap);
        overlay.fillStyle(0x000000, 0.6 * pct);
        overlay.fillRoundedRect(x, -btnH / 2, btnW, btnH, 4);
        cdText.setText(`${(t / 1000).toFixed(1)}s`).setAlpha(1);
      } else {
        cdText.setText('').setAlpha(0);
      }
    });
  }

  /** 灵囊按钮：右上角 */
  private createInventoryButton(width: number, panelY: number): void {
    const btnSize = uiConfig.btnSizePrimary;
    const rightMargin = 12;
    const btnX = width - rightMargin - btnSize / 2;
    const btnY = panelY + 10 + btnSize / 2; // 顶部对齐 HP 条

    const container = this.add.container(btnX, btnY).setDepth(52);
    const bg = this.add.graphics();
    const drawBg = (active: boolean) => {
      bg.clear();
      bg.fillStyle(0x1c2128, active ? 0.5 : 0.9);
      bg.fillRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 8);
      bg.lineStyle(1.5, 0xd4a853, active ? 1 : 0.6);
      bg.strokeRoundedRect(-btnSize / 2, -btnSize / 2, btnSize, btnSize, 8);
    };
    drawBg(false);
    const icon = this.add.text(0, -4, '灵', {
      fontFamily: '"Noto Serif SC", serif', fontSize: '16px', color: '#d4a853',
    }).setOrigin(0.5);
    const sub = this.add.text(0, 12, '囊', {
      fontFamily: '"Noto Serif SC", serif', fontSize: '10px', color: '#8b949e',
    }).setOrigin(0.5);
    container.add([bg, icon, sub]);
    container.setSize(btnSize, btnSize).setInteractive();
    container.on('pointerdown', () => drawBg(true));
    container.on('pointerout', () => drawBg(false));
    container.on('pointerup', () => {
      drawBg(false);
      this.openInventory();
    });
  }

  /** 创建五行直列按钮区（持久显示，无需展开，点击即选） */
  private createWuxingDirectButtons(width: number, panelY: number): void {
    void width; void panelY;
    this.wuxingDirectContainer = this.add.container(0, 0).setDepth(52);
    this.refreshWuxingDirectButtons();
  }

  /** 刷新五行直列按钮（装备变化 / 五行选择变化时调用） */
  private refreshWuxingDirectButtons(): void {
    this.wuxingDirectContainer.removeAll(true);
    const { width } = this.cameras.main;

    const available = gameState.getAvailableWuxing();
    if (available.length === 0) return;

    const currentWuxing = gameState.getChosenWuxing();
    const rightMargin = 12;
    const invBtnSize = uiConfig.btnSizePrimary; // 灵囊按钮宽度
    const gap = 8;
    const pillW = uiConfig.btnSizePrimary;
    const pillH = uiConfig.btnSizePrimary;
    // 基准 Y：与灵囊按钮同行（panelY + 10 + btnSize/2）
    const cy = this.panelY + 10 + pillH / 2;
    // 从右向左排列：灵囊在最右，五行按钮依次向左
    available.forEach((wx, i) => {
      const isSelected = wx === currentWuxing;
      const color = WUXING_COLORS[wx];
      const cx = width - rightMargin - invBtnSize - gap - i * (pillW + gap) - pillW / 2;

      const bg = this.add.graphics();
      bg.fillStyle(color, isSelected ? 0.35 : 0.08);
      bg.fillRoundedRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH, 8);
      bg.lineStyle(isSelected ? 2 : 1, color, isSelected ? 0.9 : 0.35);
      bg.strokeRoundedRect(cx - pillW / 2, cy - pillH / 2, pillW, pillH, 8);
      this.wuxingDirectContainer.add(bg);

      const lbl = this.add.text(cx, cy, WUXING_NAMES[wx], {
        fontFamily: '"Noto Serif SC", serif',
        fontSize: `${isSelected ? uiConfig.fontMD : uiConfig.fontSM}px`,
        color: '#' + color.toString(16).padStart(6, '0'),
      }).setOrigin(0.5);
      this.wuxingDirectContainer.add(lbl);

      const hit = this.add.rectangle(cx, cy, pillW, pillH, 0, 0).setInteractive();
      hit.on('pointerup', () => {
        const next = isSelected ? undefined : wx;
        gameState.setChosenWuxing(next);
        eventBus.emit(GameEvent.WUXING_CHOSEN, next);
      });
      this.wuxingDirectContainer.add(hit);
    });
  }

  /** 重建属性/技能/状态显示（装备/五行变化时调用） */
  private refreshInfoArea(): void {
    this.infoArea.removeAll(true);
    const { width } = this.cameras.main;
    const eq = {
      weapon: gameState.getWeapon(),
      armor: gameState.getArmor(),
      treasures: gameState.getTreasures(),
    };

    // ── 第一行：ATK / DEF / SPD ──
    const atk = gameState.getTotalAttack();
    const def = gameState.getTotalDefense();
    const spd = gameState.getTotalSpeed();
    const statsStr = `攻 ${atk}  防 ${def}  速 ${spd}`;
    const statsLabel = this.add.text(width * 0.05, 0, statsStr, {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#8b949e',
    }).setOrigin(0, 0.5);
    this.infoArea.add(statsLabel);

    // ── 第二行（+14px）：技能 pills ──
    const skills = getAllEquipmentSkills(eq);
    let x = width * 0.05;
    const row2Y = 14;
    const pillH = 14;
    // 右侧留出两个按钮的宽度（40*2 + gap + margin ≈ width*0.55 右侧）
    const pillMaxX = width * 0.58;
    if (skills.length === 0) {
      this.infoArea.add(this.add.text(x, row2Y, '技能: 暂无', {
        fontFamily: '"Noto Sans SC", sans-serif', fontSize: '10px', color: '#484f58',
      }).setOrigin(0, 0.5));
    } else {
      this.infoArea.add(this.add.text(x, row2Y, '技能', {
        fontFamily: '"Noto Sans SC", sans-serif', fontSize: '10px', color: '#484f58',
      }).setOrigin(0, 0.5));
      x += 26;
      for (const skill of skills) {
        const label = `${skill.name} Lv${skill.level}`;
        const desc = skill.description;
        const pill = this.createInfoPill(x, row2Y, label, 0xd4a853, pillH, desc);
        this.infoArea.add(pill);
        x += pill.width + 5;
        if (x > pillMaxX) break;
      }
    }

    // ── 第三行（+28px）：五行被动状态 pills ──
    const statuses = getWuxingPassiveStatuses(eq);
    x = width * 0.05;
    const row3Y = 28;
    if (statuses.length > 0) {
      this.infoArea.add(this.add.text(x, row3Y, '状态', {
        fontFamily: '"Noto Sans SC", sans-serif', fontSize: '10px', color: '#484f58',
      }).setOrigin(0, 0.5));
      x += 26;
      for (const st of statuses) {
        const def2 = STATUS_DEFINITIONS[st.type];
        if (!def2) continue;
        const label = `${def2.name} Lv${st.level}`;
        const color = parseInt(def2.color.replace('#', ''), 16);
        const pill = this.createInfoPill(x, row3Y, label, color, pillH, def2.description ?? '');
        this.infoArea.add(pill);
        x += pill.width + 5;
        if (x > pillMaxX) break;
      }
    }
  }

  private createInfoPill(
    x: number, y: number, label: string, color: number, pillH: number, description: string = ''
  ): Phaser.GameObjects.Text {
    const colorHex = '#' + color.toString(16).padStart(6, '0');
    const txt = this.add.text(x, y, label, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '10px',
      color: colorHex,
      backgroundColor: colorHex + '22',
      padding: { x: 5, y: 2 },
    }).setOrigin(0, 0.5);
    void pillH;

    void description; // 描述由区域级合并弹框统一展示
    return txt;
  }

  private renderBuffs(buffs: { label: string; color: number; description?: string }[]): void {
    this.lastBuffs = buffs ? [...buffs] : [];
    this.buffArea.removeAll(true);
    if (!buffs || buffs.length === 0) return;

    const pillH = 18;
    const gap = 6;
    let x = this.cameras.main.width * 0.05;

    buffs.forEach(({ label, color, description }) => {
      const colorHex = '#' + color.toString(16).padStart(6, '0');
      const tmp = this.add.text(0, -9999, label, {
        fontFamily: '"Noto Sans SC", sans-serif', fontSize: '11px', color: colorHex,
      });
      const pillW = tmp.width + 14;
      tmp.destroy();

      const bg = this.add.graphics();
      bg.fillStyle(color, 0.18);
      bg.fillRoundedRect(x, -pillH / 2, pillW, pillH, 4);
      bg.lineStyle(1, color, 0.7);
      bg.strokeRoundedRect(x, -pillH / 2, pillW, pillH, 4);
      this.buffArea.add(bg);

      const lbl = this.add.text(x + pillW / 2, 0, label, {
        fontFamily: '"Noto Sans SC", sans-serif', fontSize: '11px', color: colorHex,
      }).setOrigin(0.5);
      this.buffArea.add(lbl);

      x += pillW + gap;
    });
  }

  /** 创建持久弹窗（scene 级别，非 Container，避免 Phaser 3.80 Container.setVisible 不级联输入的问题） */
  private createPersistentInfoPopup(): void {
    const { width } = this.cameras.main;
    const popupW = Math.min(width * 0.82, 340);

    this.popupBg = this.add.graphics().setDepth(300).setVisible(false);

    this.popupTitle = this.add.text(width / 2, 0, '', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '15px',
      color: '#d4a853',
    }).setOrigin(0.5, 0).setDepth(300).setVisible(false);

    const popupLeft = width / 2 - popupW / 2 + 12;
    this.popupDesc = this.add.text(popupLeft, 0, '', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '13px',
      color: '#c9d1d9',
      wordWrap: { width: popupW - 24 },
      align: 'left',
    }).setOrigin(0, 0).setDepth(300).setVisible(false);

    // hit rect 初始时不可见且不可交互，显示后再激活
    this.popupHit = this.add.rectangle(width / 2, 0, popupW, 80, 0xffffff, 0)
      .setDepth(300).setVisible(false);
    this.popupHit.on('pointerup', () => this.hideInfoPopup());
  }

  private showInfoPopup(title: string, description: string, color: number): void {
    const { width } = this.cameras.main;
    const colorHex = '#' + color.toString(16).padStart(6, '0');
    const popupW = Math.min(width * 0.82, 340);
    const popupX = width / 2;

    // 先设置文字内容（以便测量高度）
    this.popupTitle.setText(title).setColor(colorHex).setX(popupX);
    this.popupDesc.setText(description).setX(popupX - popupW / 2 + 12);

    const totalH = Math.max(80, 34 + this.popupDesc.height + 14);
    const topY = Math.max(10, this.panelY - 8 - totalH);

    // 绘制背景
    this.popupBg.clear();
    this.popupBg.fillStyle(0x1c2128, 0.97);
    this.popupBg.fillRoundedRect(popupX - popupW / 2, topY, popupW, totalH, 8);
    this.popupBg.lineStyle(1.5, color, 0.8);
    this.popupBg.strokeRoundedRect(popupX - popupW / 2, topY, popupW, totalH, 8);

    // 定位文字
    this.popupTitle.setY(topY + 10);
    this.popupDesc.setY(topY + 30);

    // 定位并激活 hit rect
    this.popupHit.setPosition(popupX, topY + totalH / 2).setSize(popupW, totalH);
    if (!this.popupHit.input) {
      this.popupHit.setInteractive({ useHandCursor: true });
    }

    // 全部显示
    this.popupBg.setVisible(true);
    this.popupTitle.setVisible(true);
    this.popupDesc.setVisible(true);
    this.popupHit.setVisible(true);

    this.popupKey = title;
  }

  /** 构建"当前所有效果"合并文本 */
  private buildAllEffectsText(): string {
    const eq = {
      weapon: gameState.getWeapon(),
      armor: gameState.getArmor(),
      treasures: gameState.getTreasures(),
    };
    const skills = getAllEquipmentSkills(eq);
    const statuses = getWuxingPassiveStatuses(eq);
    const parts: string[] = [];

    if (skills.length > 0) {
      parts.push('── 技能 ──');
      for (const sk of skills) {
        parts.push(`${sk.name} Lv${sk.level}\n  ${sk.description}`);
      }
    }
    if (statuses.length > 0) {
      if (parts.length) parts.push('');
      parts.push('── 状态 ──');
      for (const st of statuses) {
        const def = STATUS_DEFINITIONS[st.type];
        if (def) parts.push(`${def.name} Lv${st.level}\n  ${def.description ?? ''}`);
      }
    }
    if (this.lastBuffs.length > 0) {
      if (parts.length) parts.push('');
      parts.push('── Buff ──');
      for (const b of this.lastBuffs) {
        parts.push(b.description ?? b.label);
      }
    }
    return parts.length > 0 ? parts.join('\n') : '暂无技能、状态或 Buff';
  }

  private hideInfoPopup(): void {
    this.popupBg?.setVisible(false);
    this.popupTitle?.setVisible(false);
    this.popupDesc?.setVisible(false);
    this.popupHit?.setVisible(false);
    this.popupKey = '';
  }

  /** 切换信息弹窗（点击技能/状态/buff pill 时调用） */
  private toggleInfoPopup(title: string, description: string, color: number): void {
    if (this.popupBg?.visible && this.popupKey === title) {
      this.hideInfoPopup();
    } else {
      this.showInfoPopup(title, description, color);
    }
  }

  /** 游戏失败全屏覆盖（遮盖操控区域） */
  showGameOverOverlay(): void {
    if (this.gameOverShown) return;
    this.gameOverShown = true;
    const { width, height } = this.cameras.main;

    // 全屏半透明遮罩（阻止所有操控交互）
    const overlay = this.add.graphics().setDepth(1000);
    overlay.fillStyle(0x000000, 0.78);
    overlay.fillRect(0, 0, width, height);
    overlay.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, width, height),
      Phaser.Geom.Rectangle.Contains
    );

    this.add.text(width / 2, height * 0.3, '游戏失败', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '38px',
      color: '#f85149',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(1001);

    this.add.text(width / 2, height * 0.3 + 52, '残魂已消散于天地之间', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '16px',
      color: '#8b949e',
    }).setOrigin(0.5).setDepth(1001);

    const restartBtn = this.add.text(width / 2, height * 0.52, '【 点击重新开始 】', {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '20px',
      color: '#d4a853',
      stroke: '#000000',
      strokeThickness: 2,
    }).setOrigin(0.5).setDepth(1001).setInteractive({ useHandCursor: true });

    restartBtn.on('pointerover', () => restartBtn.setColor('#ffe88a'));
    restartBtn.on('pointerout',  () => restartBtn.setColor('#d4a853'));
    restartBtn.on('pointerup', () => {
      gameState.reset();
      this.scene.stop('InventoryScene');
      // 重启 WorldScene（会自动 stop/launch HUDScene）
      const worldScene = this.scene.get('WorldScene');
      if (worldScene) {
        worldScene.scene.restart();
      }
    });
  }

  private openInventory(): void {
    if (this.scene.isActive('InventoryScene')) {
      this.scene.stop('InventoryScene');
    } else {
      this.scene.launch('InventoryScene');
      this.scene.bringToTop('InventoryScene');
      // HUDScene 始终保持最上层（弹框不被遮盖）
      this.scene.bringToTop('HUDScene');
    }
  }

  shutdown(): void {
    this.joystick?.destroy();
    this.popupKey = '';
  }
}
