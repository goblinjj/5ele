# 竖屏 UI 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将游戏从横屏 1280×720 改为竖屏 720×1560（9:19.5），上半部分为游戏视口，下半部分为操控面板。

**Architecture:** 修改 `gameConfig.ts` 基准尺寸；在 `uiConfig.ts` 增加分区常量；逐场景调整布局坐标，重点修复 `RewardScene` 的硬编码像素值，并将 `MapScene`、`BattleScene` 的横向布局改为竖向适配。

**Tech Stack:** Phaser 3, TypeScript, `this.cameras.main.width/height` 响应式布局

---

### Task 1: 修改基准尺寸与分区常量

**Files:**
- Modify: `packages/client/src/config/gameConfig.ts`
- Modify: `packages/client/src/config/uiConfig.ts`

**Step 1: 修改 gameConfig.ts**

将 `packages/client/src/config/gameConfig.ts` 第 10-12 行改为：

```typescript
// 设计基准尺寸（9:19.5 竖屏）
export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1560;
```

**Step 2: 在 uiConfig.ts 增加分区常量**

在 `packages/client/src/config/uiConfig.ts` 的 `LAYOUT` 对象中增加分区常量（第 7-12 行）：

```typescript
export const LAYOUT = {
  /** 图标区域宽度占比 */
  ICON_WIDTH_RATIO: 0.35,
  /** 文字区域宽度占比 */
  TEXT_WIDTH_RATIO: 0.65,
  /** 游戏视口区域高度占比（上半） */
  VIEWPORT_RATIO: 0.60,
  /** 操控面板区域高度占比（下半） */
  PANEL_RATIO: 0.40,
};
```

同时在 `UIConfig` 类中增加两个便捷 getter（在 `get height()` 之后）：

```typescript
/** 游戏视口底部 Y（分区线） */
get panelY(): number {
  return this._height * LAYOUT.VIEWPORT_RATIO;
}

/** 操控面板中心 Y */
get panelCenterY(): number {
  return this._height * (LAYOUT.VIEWPORT_RATIO + LAYOUT.PANEL_RATIO / 2);
}
```

**Step 3: 启动游戏验证尺寸**

```bash
cd /Volumes/T7/work/fighting
pnpm --filter client dev
```

预期：浏览器中游戏画布为竖向，720×1560 比例，整体内容可能错乱（后续步骤修复）。

**Step 4: Commit**

```bash
git add packages/client/src/config/gameConfig.ts packages/client/src/config/uiConfig.ts
git commit -m "feat: 切换竖屏基准尺寸 720×1560，增加分区常量"
```

---

### Task 2: 修复 RewardScene 硬编码值 + 竖向卡片布局

**Files:**
- Modify: `packages/client/src/scenes/RewardScene.ts`

这是改动最大的场景，所有硬编码像素值全部替换为 `%` 计算。

**Step 1: 修复 `create()` 方法的标题区（第 36-54 行）**

替换：
```typescript
// 标题
this.add.text(width / 2, 60, '选择奖励', {
  fontFamily: 'Arial',
  fontSize: '36px',
  color: '#ffffff',
  fontStyle: 'bold',
}).setOrigin(0.5);

this.add.text(width / 2, 100, '选择一件装备加入背包', {
  fontFamily: 'Arial',
  fontSize: '18px',
  color: '#aaaaaa',
}).setOrigin(0.5);
```

改为：
```typescript
// 标题
this.add.text(width / 2, height * 0.04, '选择器物', {
  fontFamily: '"Noto Serif SC", serif',
  fontSize: `${uiConfig.fontXL}px`,
  color: '#f0e6d3',
  fontStyle: 'bold',
}).setOrigin(0.5);

this.add.text(width / 2, height * 0.07, '五行之力已凝练，选择一件器物', {
  fontFamily: '"Noto Sans SC", sans-serif',
  fontSize: `${uiConfig.fontSM}px`,
  color: '#8b949e',
}).setOrigin(0.5);
```

需要在文件顶部导入 `uiConfig`：
```typescript
import { uiConfig } from '../config/uiConfig.js';
```

**Step 2: 修复 `displayRewards()` 方法（第 184-205 行）**

替换整个 `displayRewards()` 方法：
```typescript
private displayRewards(): void {
  const { width, height } = this.cameras.main;
  const cardWidth = width * 0.85;
  const cardHeight = height * 0.22;
  const startY = height * 0.15;
  const spacing = cardHeight * 1.12;

  this.rewardOptions.forEach((equip, index) => {
    this.createRewardCard(width / 2, startY + index * spacing, equip, index, cardWidth, cardHeight);
  });

  // 跳过按钮
  const skipBtn = this.add.text(width / 2, height * 0.92, '跳过', {
    fontFamily: '"Noto Sans SC", sans-serif',
    fontSize: `${uiConfig.fontMD}px`,
    color: '#888888',
  }).setOrigin(0.5).setInteractive({ useHandCursor: true });

  skipBtn.on('pointerover', () => skipBtn.setColor('#ffffff'));
  skipBtn.on('pointerout', () => skipBtn.setColor('#888888'));
  skipBtn.on('pointerup', () => this.skipReward());
}
```

**Step 3: 修复 `createRewardCard()` 方法（第 207-307 行）**

修改方法签名，增加 `cardWidth` 和 `cardHeight` 参数，并将所有内部硬编码偏移量改为基于 `cardHeight` 的比例：

```typescript
private createRewardCard(x: number, y: number, equip: Equipment, index: number, cardWidth: number, cardHeight: number): void {
  // 卡片背景
  const bgColor = this.getRarityColor(equip.rarity);
  const bg = this.add.rectangle(x, y, cardWidth, cardHeight, bgColor);
  bg.setStrokeStyle(3, 0xffffff, 0.5);
  bg.setInteractive({ useHandCursor: true });

  // 五行图标（左侧）
  const iconX = x - cardWidth * 0.35;
  const iconRadius = Math.min(cardHeight * 0.25, cardWidth * 0.1);
  const wuxingColor = equip.wuxing !== undefined ? WUXING_COLORS[equip.wuxing] : 0x8b949e;
  const icon = this.add.circle(iconX, y, iconRadius, wuxingColor);
  icon.setStrokeStyle(2, 0xffffff, 0.5);

  this.add.text(iconX, y, equip.wuxing !== undefined ? `${equip.wuxingLevel ?? 1}` : '-', {
    fontFamily: 'Arial',
    fontSize: `${uiConfig.fontLG}px`,
    color: '#ffffff',
    fontStyle: 'bold',
  }).setOrigin(0.5);

  // 右侧文字区域
  const textX = x - cardWidth * 0.1;
  const textW = cardWidth * 0.55;

  // 装备名称
  this.add.text(textX, y - cardHeight * 0.32, equip.name, {
    fontFamily: '"Noto Serif SC", serif',
    fontSize: `${uiConfig.fontMD}px`,
    color: '#ffffff',
    fontStyle: 'bold',
  }).setOrigin(0.5);

  // 稀有度 + 类型
  const typeName = equip.type === EquipmentType.WEAPON ? '武器' :
                   equip.type === EquipmentType.ARMOR ? '铠甲' : '灵器';
  this.add.text(textX, y - cardHeight * 0.12, `${this.getRarityName(equip.rarity)} · ${typeName}`, {
    fontFamily: '"Noto Sans SC", sans-serif',
    fontSize: `${uiConfig.fontSM}px`,
    color: this.getRarityTextColor(equip.rarity),
  }).setOrigin(0.5);

  // 属性
  let statsText = '';
  if (equip.attack) statsText += `攻击 +${equip.attack}  `;
  if (equip.defense) statsText += `防御 +${equip.defense}`;
  this.add.text(textX, y + cardHeight * 0.05, statsText, {
    fontFamily: 'monospace',
    fontSize: `${uiConfig.fontMD}px`,
    color: '#22c55e',
  }).setOrigin(0.5);

  // 五行属性
  const wuxingName = equip.wuxing !== undefined ? WUXING_NAMES[equip.wuxing] : '无';
  const wuxingLevelStr = equip.wuxing !== undefined ? ` Lv.${equip.wuxingLevel ?? 1}` : '';
  this.add.text(textX, y + cardHeight * 0.22, `${wuxingName}属性${wuxingLevelStr}`, {
    fontFamily: '"Noto Sans SC", sans-serif',
    fontSize: `${uiConfig.fontSM}px`,
    color: '#' + wuxingColor.toString(16).padStart(6, '0'),
  }).setOrigin(0.5);

  // 技能描述
  const skills = getEquipmentSkillsDisplay(equip, equip.wuxingLevel ?? 1);
  if (skills.length > 0) {
    this.add.text(x, y + cardHeight * 0.36, `【${skills[0].name}】${skills[0].description}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: `${uiConfig.fontXS}px`,
      color: '#fbbf24',
      wordWrap: { width: cardWidth * 0.85 },
      align: 'center',
    }).setOrigin(0.5, 0);
  }

  // 交互效果
  bg.on('pointerover', () => {
    bg.setScale(1.02);
    bg.setStrokeStyle(3, 0xffff00, 1);
  });
  bg.on('pointerout', () => {
    bg.setScale(1);
    bg.setStrokeStyle(3, 0xffffff, 0.5);
  });
  bg.on('pointerup', () => {
    this.selectReward(equip, index);
  });
}
```

**Step 4: 验证奖励场景**

启动游戏，打完一场战斗后进入奖励场景，确认：
- 3 张卡片纵向排列
- 无硬编码像素导致的布局错误
- 跳过按钮在底部 92% 处

**Step 5: Commit**

```bash
git add packages/client/src/scenes/RewardScene.ts
git commit -m "fix: RewardScene 全面替换硬编码值，改为竖向卡片布局"
```

---

### Task 3: 修改 BattleScene 布局（战斗区压缩到上 60%）

**Files:**
- Modify: `packages/client/src/scenes/BattleScene.ts`

**Step 1: 调整背景装饰线（`createBackground()`，第 308-309 行）**

将底部装饰线从 `height * 0.92` 改为分区线位置：
```typescript
bgGraphics.lineBetween(width * 0.04, height * 0.12, width * 0.96, height * 0.12);
bgGraphics.lineBetween(width * 0.04, height * 0.58, width * 0.96, height * 0.58);
```

**Step 2: 调整战场椭圆（`createBattleField()`，第 363-380 行）**

将 `battleFieldY` 从 `height * 0.6` 改为 `height * 0.35`，使战场在上半区域中央：
```typescript
private createBattleField(): void {
  const { width, height } = this.cameras.main;
  const battleFieldY = height * 0.35;

  const fieldGraphics = this.add.graphics();

  fieldGraphics.fillStyle(0x000000, 0.3);
  fieldGraphics.fillEllipse(width / 2, battleFieldY + height * 0.07, width * 0.85, height * 0.12);

  fieldGraphics.fillStyle(this.colors.inkGrey, 0.4);
  fieldGraphics.fillEllipse(width / 2, battleFieldY + height * 0.06, width * 0.82, height * 0.10);

  fieldGraphics.lineStyle(2, this.colors.goldAccent, 0.2);
  fieldGraphics.strokeEllipse(width / 2, battleFieldY + height * 0.06, width * 0.82, height * 0.10);

  fieldGraphics.lineStyle(1, this.colors.paperCream, 0.15);
  fieldGraphics.lineBetween(width / 2, battleFieldY - height * 0.10, width / 2, battleFieldY + height * 0.12);
}
```

**Step 3: 调整战斗者初始位置（`initCombatants()`，第 440-444 行）**

将 `battleFieldY` 从 `height * 0.55` 改为 `height * 0.32`：
```typescript
private initCombatants(): void {
  const { width, height } = this.cameras.main;
  const battleFieldY = height * 0.32;
  const playerX = width * 0.25;
  // ... 其余不变
```

**Step 4: 将灵囊按钮移至操控面板区（`createInventoryButton()`，第 382-418 行）**

将 `btnY` 从 `height * 0.88` 改为 `height * 0.64`（面板顶部）：
```typescript
const btnX = width * 0.82;
const btnY = height * 0.64;
const btnWidth = width * 0.14;
const btnHeight = height * 0.04;
```

**Step 5: 验证战斗场景**

启动游戏，进入战斗，确认：
- 战场椭圆在屏幕上 60% 区域内
- 玩家和敌人精灵在战场上方正确分布
- 灵囊按钮不与战场重叠

**Step 6: Commit**

```bash
git add packages/client/src/scenes/BattleScene.ts
git commit -m "fix: BattleScene 战斗区移至上60%，灵囊按钮移至面板区"
```

---

### Task 4: 修改 MapScene 节点为 2 列竖排

**Files:**
- Modify: `packages/client/src/scenes/MapScene.ts`

**Step 1: 调整玩家状态栏位置（`createPlayerStatus()`，第 84-163 行）**

将状态栏从 `height * 0.17` 移到顶栏下方 `height * 0.14`（竖屏顶栏更紧凑）：
```typescript
const y = height * 0.14;
const statHeight = height * 0.06;
```

**Step 2: 替换 `displayNodes()` 方法（第 301-322 行）**

将 3 列横排改为 2 列竖排 Grid：

```typescript
private displayNodes(): void {
  const { width, height } = this.cameras.main;

  // 标题
  this.add.text(width / 2, height * 0.22, '选择气穴', {
    fontFamily: '"Noto Serif SC", serif',
    fontSize: `${uiConfig.fontLG}px`,
    color: '#f0e6d3',
    fontStyle: 'bold',
  }).setOrigin(0.5);

  // 2 列 Grid 布局
  const cols = 2;
  const cardWidth = Math.max(160, Math.min(300, width * 0.44));
  const cardHeight = Math.max(110, Math.min(160, height * 0.13));
  const colSpacing = cardWidth * 1.1;
  const rowSpacing = cardHeight * 1.2;
  const gridWidth = (cols - 1) * colSpacing;
  const startX = width / 2 - gridWidth / 2;
  const startY = height * 0.30;

  this.nodeOptions.forEach((node, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = startX + col * colSpacing;
    const y = startY + row * rowSpacing;
    this.createNodeCard(x, y, node, index, cardWidth, cardHeight);
  });
}
```

**Step 3: 将灵囊按钮和玩家状态移至面板区**

`createInventoryButton()` 的 `btnY` 改为 `height * 0.64`（分区线下方）：
```typescript
const btnX = width / 2;
const btnY = height * 0.64;
const btnWidth = Math.max(120, Math.min(200, width * 0.35));
const btnHeight = Math.max(44, Math.min(60, height * 0.04));
```

**Step 4: 验证地图场景**

启动游戏，进入地图，确认：
- 3 个气穴节点以 2 列方式显示（2 + 1）
- 灵囊按钮在下方面板区
- 整体不超出上 60% 视口

**Step 5: Commit**

```bash
git add packages/client/src/scenes/MapScene.ts
git commit -m "fix: MapScene 节点改为2列竖排，布局适配竖屏"
```

---

### Task 5: 调整 MenuScene 间距

**Files:**
- Modify: `packages/client/src/scenes/MenuScene.ts`

**Step 1: 微调主菜单布局**

MenuScene 已是 `%` 布局，主要调整按钮宽度和间距，使其在竖屏下更饱满。

找到按钮宽度计算，将 `width * 0.20` 改为 `width * 0.60`：
```typescript
const btnWidth = Math.max(200, Math.min(460, width * 0.60));
const btnHeight = Math.max(50, Math.min(70, height * 0.055));
```

找到按钮间距，将横向间距改为纵向间距：
```typescript
// 原来是横向排列两个按钮，改为纵向
// 开始游戏按钮
const btn1Y = height * 0.62;
// 多人模式按钮
const btn2Y = height * 0.70;
```

（具体行号需在文件中查找 `开始游戏` 和 `多人模式` 的位置）

**Step 2: 验证主菜单**

确认：
- 按钮宽度占满竖屏宽度的 60%
- 两个按钮纵向排列，不拥挤

**Step 3: Commit**

```bash
git add packages/client/src/scenes/MenuScene.ts
git commit -m "fix: MenuScene 按钮改为竖向排列，适配竖屏宽度"
```

---

### Task 6: 全场景整体验证

**Step 1: 完整流程测试**

```bash
cd /Volumes/T7/work/fighting
pnpm --filter client dev
```

按顺序测试以下流程：
- [ ] 主菜单正常显示，按钮无重叠
- [ ] 点击开始游戏进入地图场景
- [ ] 地图节点 2 列排列，灵囊按钮在下方
- [ ] 选择战斗节点进入战斗场景
- [ ] 战场在上 60% 区域，玩家/敌人位置正确
- [ ] 战斗结束进入奖励场景
- [ ] 奖励卡片纵向排列，无溢出
- [ ] 选择奖励后返回地图

**Step 2: 检查无硬编码残留**

```bash
grep -n "fontSize: '[0-9]" packages/client/src/scenes/RewardScene.ts
grep -n "y: [0-9]\{2,3\}" packages/client/src/scenes/RewardScene.ts
```

预期：无任何输出（所有硬编码已清除）。

**Step 3: 最终 Commit**

```bash
git add -A
git commit -m "feat: 竖屏UI改造完成（720×1560，上下分区布局）"
```
