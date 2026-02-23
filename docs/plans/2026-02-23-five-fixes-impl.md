# Five Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 5 issues: HUD popup, inventory redesign, enemy bounds, inventory-full loot stop, active-skill position + CD.

**Architecture:** All changes isolated to HUDScene.ts, InventoryScene.ts, WorldScene.ts. No new files needed.

**Tech Stack:** Phaser 5 / TypeScript. Build: `pnpm --filter client build`.

---

## Task 1: Fix HUD info popup (技能/状态/Buff 弹框)

**Files:**
- Modify: `packages/client/src/scenes/HUDScene.ts`

**Root cause:** `toggleInfoPopup()` destroys the popup if ANY `activePopup` exists, regardless of which pill was clicked. Clicking a second pill just closes the current popup instead of swapping content.

**Step 1: Add persistent popup fields to class (after `activePopup` field ~line 51)**

Replace:
```typescript
/** 当前弹窗（点击技能/状态/buff 时显示） */
private activePopup: Phaser.GameObjects.Container | null = null;
```
With:
```typescript
/** 当前弹窗（点击技能/状态/buff 时显示） */
private activePopup: Phaser.GameObjects.Container | null = null;
/** 持久化弹窗组件（不销毁，只 setVisible） */
private infoPopupContainer!: Phaser.GameObjects.Container;
private infoPopupBg!: Phaser.GameObjects.Graphics;
private infoPopupTitle!: Phaser.GameObjects.Text;
private infoPopupDesc!: Phaser.GameObjects.Text;
private infoPopupHit!: Phaser.GameObjects.Rectangle;
/** 当前展示的 pill key（title 文字），用于 toggle 判断 */
private infoPopupKey: string = '';
```

**Step 2: Create persistent popup in `create()` (after the event listeners, before `shutdown`)**

Add this call at the end of `create()`:
```typescript
this.createPersistentInfoPopup();
```

**Step 3: Add `createPersistentInfoPopup()` method**

Add this method to the class:
```typescript
private createPersistentInfoPopup(): void {
  const { width } = this.cameras.main;
  const popupW = Math.min(width * 0.7, 260);
  const popupH = 80;

  this.infoPopupContainer = this.add.container(width / 2, 0).setDepth(300).setVisible(false);

  this.infoPopupBg = this.add.graphics();
  this.infoPopupContainer.add(this.infoPopupBg);

  this.infoPopupTitle = this.add.text(0, 10, '', {
    fontFamily: '"Noto Serif SC", serif',
    fontSize: '13px',
    color: '#d4a853',
  }).setOrigin(0.5, 0);
  this.infoPopupContainer.add(this.infoPopupTitle);

  this.infoPopupDesc = this.add.text(0, 30, '', {
    fontFamily: '"Noto Sans SC", sans-serif',
    fontSize: '11px',
    color: '#c9d1d9',
    wordWrap: { width: popupW - 20 },
    align: 'center',
  }).setOrigin(0.5, 0);
  this.infoPopupContainer.add(this.infoPopupDesc);

  this.infoPopupHit = this.add.rectangle(0, popupH / 2, popupW, popupH, 0xffffff, 0)
    .setInteractive({ useHandCursor: true });
  this.infoPopupHit.on('pointerup', () => this.hideInfoPopup());
  this.infoPopupContainer.add(this.infoPopupHit);
}
```

**Step 4: Add `showInfoPopup()` and `hideInfoPopup()` methods**

```typescript
private showInfoPopup(title: string, description: string, color: number): void {
  const { width } = this.cameras.main;
  const colorHex = '#' + color.toString(16).padStart(6, '0');
  const popupW = Math.min(width * 0.7, 260);

  this.infoPopupTitle.setText(title).setColor(colorHex);
  this.infoPopupDesc.setText(description);

  // 根据描述高度调整背景
  const totalH = Math.max(80, 30 + this.infoPopupDesc.height + 14);
  this.infoPopupBg.clear();
  this.infoPopupBg.fillStyle(0x1c2128, 0.97);
  this.infoPopupBg.fillRoundedRect(-popupW / 2, 0, popupW, totalH, 8);
  this.infoPopupBg.lineStyle(1.5, color, 0.8);
  this.infoPopupBg.strokeRoundedRect(-popupW / 2, 0, popupW, totalH, 8);

  this.infoPopupHit.setSize(popupW, totalH).setY(totalH / 2);

  // 底部对齐控制面板顶部 - 8px
  this.infoPopupContainer.setY(this.panelY - 8 - totalH);
  this.infoPopupContainer.setVisible(true);
  this.infoPopupKey = title;
}

private hideInfoPopup(): void {
  this.infoPopupContainer?.setVisible(false);
  this.infoPopupKey = '';
}
```

**Step 5: Replace `toggleInfoPopup()` method**

Replace the old `toggleInfoPopup()` (lines 583-641) with:
```typescript
private toggleInfoPopup(title: string, description: string, color: number): void {
  // 同一 pill 再次点击 → 关闭；不同 pill → 更新内容
  if (this.infoPopupContainer?.visible && this.infoPopupKey === title) {
    this.hideInfoPopup();
  } else {
    this.showInfoPopup(title, description, color);
  }
}
```

**Step 6: Remove old `activePopup` usage in `shutdown()`**

In `shutdown()`, replace:
```typescript
this.activePopup?.destroy();
this.activePopup = null;
```
With:
```typescript
this.hideInfoPopup();
```

**Step 7: Build and verify**
```bash
pnpm --filter client build
```
Expected: TypeScript compiles with no errors.

Manual test: open game, equip an item with skills. Click a skill pill → popup appears. Click same pill → popup closes. Click different pill → popup content updates without closing/reopening.

**Step 8: Commit**
```bash
git add packages/client/src/scenes/HUDScene.ts
git commit -m "fix: redesign HUD info popup to be persistent (setVisible instead of destroy/create)"
```

---

## Task 2: Inventory Scene redesign (灵囊管理)

**Files:**
- Modify: `packages/client/src/scenes/InventoryScene.ts`

**Root cause:** `showViewPopup()` creates a full-screen overlay rectangle that intercepts the second tap for double-click equip.

**Design:** Remove overlay. Replace with an inline detail panel on the right side of the equipment area. Single tap selects item and shows detail. Equip/unequip/归元 via buttons in detail panel. 重组 via drag (unchanged). No full-screen overlay anywhere.

**Layout:**
```
HEADER (8%)
─────────────────────────────────────────
LEFT COLUMN (45%) | RIGHT COLUMN (55%)
  装备区           |  详情面板
  [武][防][T1~T5] |  (tap item to view)
─────────────────────────────────────────
背包 (full width, 10 slots)
□□□□□□□□□□
```

**Step 1: Add new class fields after existing field declarations (~line 54)**

```typescript
/** 当前选中槽位（单击高亮） */
private selectedSlot?: SlotInfo;
/** 详情面板容器 */
private detailPanel?: Phaser.GameObjects.Container;
/** 装备/背包区域容器（重建用） */
private equipSlotsContainer?: Phaser.GameObjects.Container;
private inventorySlotsContainer?: Phaser.GameObjects.Container;
/** 详情面板 Y 起始、高度（createDetailPanel 后固定） */
private detailPanelX: number = 0;
private detailPanelY: number = 0;
private detailPanelW: number = 0;
private detailPanelH: number = 0;
```

**Step 2: Replace `create()` to use new layout**

Replace the body of `create()` with:
```typescript
create(): void {
  const { width, height: fullH } = this.cameras.main;
  const vpH = Math.floor(fullH * LAYOUT.VIEWPORT_RATIO);
  this.cameras.main.setViewport(0, 0, width, vpH);

  // 重置状态
  this.slotGeometries = [];
  this.isDragging = false;
  this.dragSourceSlot = undefined;
  this.lastClickTime = 0;
  this.lastClickSlot = undefined;
  this.selectedSlot = undefined;

  // 背景
  this.add.rectangle(width / 2, vpH / 2, width, vpH, this.colors.bgDark, 0.98);

  this.createHeader();
  this.createEquipmentAndDetailLayout();
  this.createInventorySection();
  this.createCloseButton();

  this.input.keyboard?.on('keydown-ESC', () => {
    if (this.contextMenu) {
      this.closeContextMenu();
    } else {
      this.closeScene();
    }
  });

  this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
    this.onGlobalPointerMove(pointer);
  });
  this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
    this.onGlobalPointerUp(pointer);
  });
}
```

**Step 3: Add `createEquipmentAndDetailLayout()` method**

This replaces `createEquipmentSection()`. Add:
```typescript
private createEquipmentAndDetailLayout(): void {
  const { width, height } = this.cameras.main;
  const headerH = height * 0.08;
  const sectionY = headerH + height * 0.01;
  const sectionH = height * 0.50;  // 装备+详情区占50%
  const leftW = width * 0.44;
  const rightX = width * 0.46;
  this.detailPanelX = rightX;
  this.detailPanelY = sectionY;
  this.detailPanelW = width * 0.52;
  this.detailPanelH = sectionH;

  // 左栏背景
  const leftBg = this.add.graphics();
  leftBg.fillStyle(this.colors.inkBlack, 0.5);
  leftBg.fillRoundedRect(width * 0.01, sectionY, leftW, sectionH, 8);
  leftBg.lineStyle(1, this.colors.inkGrey, 0.5);
  leftBg.strokeRoundedRect(width * 0.01, sectionY, leftW, sectionH, 8);

  // 右栏背景（详情面板占位）
  const rightBg = this.add.graphics();
  rightBg.fillStyle(this.colors.inkBlack, 0.3);
  rightBg.fillRoundedRect(rightX, sectionY, this.detailPanelW, sectionH, 8);
  rightBg.lineStyle(1, this.colors.inkGrey, 0.3);
  rightBg.strokeRoundedRect(rightX, sectionY, this.detailPanelW, sectionH, 8);

  const slotSize = Math.min(54, (leftW - 16) / 3);
  const midY = sectionY + sectionH * 0.5;

  // 武器
  const weaponX = width * 0.02 + slotSize * 0.5 + 4;
  this.add.text(weaponX, sectionY + 16, '武器', {
    fontFamily: '"Noto Sans SC", sans-serif', fontSize: '10px', color: '#d4a853',
  }).setOrigin(0.5);
  this.createSlot(weaponX, midY - slotSize * 0.1, { type: 'weapon', index: 0, equipment: gameState.getWeapon() }, slotSize);

  // 防具
  const armorX = weaponX + slotSize + 8;
  this.add.text(armorX, sectionY + 16, '防具', {
    fontFamily: '"Noto Sans SC", sans-serif', fontSize: '10px', color: '#d4a853',
  }).setOrigin(0.5);
  this.createSlot(armorX, midY - slotSize * 0.1, { type: 'armor', index: 0, equipment: gameState.getArmor() }, slotSize);

  // 灵器标签
  const treasureStartX = width * 0.01 + 4;
  this.add.text(treasureStartX + leftW * 0.5, sectionY + 16, '灵器', {
    fontFamily: '"Noto Sans SC", sans-serif', fontSize: '10px', color: '#d4a853',
  }).setOrigin(0.5);

  // 5个灵器槽位（两行：3+2）
  const treasures = gameState.getTreasures();
  const tSlotSize = Math.min(46, (leftW - 8) / 3 - 4);
  const tRow1Y = sectionY + sectionH * 0.32;
  const tRow2Y = sectionY + sectionH * 0.68;
  const tStartX = width * 0.01 + 4 + tSlotSize * 0.5;
  const tGap = (leftW - 8) / 3;

  for (let i = 0; i < MAX_TREASURES; i++) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const tx = tStartX + col * tGap;
    const ty = row === 0 ? tRow1Y : tRow2Y;
    this.createSlot(tx, ty, { type: 'treasure', index: i, equipment: treasures[i] || null }, tSlotSize);
  }

  // 详情面板（初始显示空状态提示）
  this.refreshDetailPanel(undefined);
}
```

**Step 4: Add `refreshDetailPanel()` method**

```typescript
private refreshDetailPanel(slotInfo: SlotInfo | undefined): void {
  if (this.detailPanel) {
    this.detailPanel.destroy();
    this.detailPanel = undefined;
  }

  const container = this.add.container(this.detailPanelX, this.detailPanelY).setDepth(50);
  this.detailPanel = container;
  const W = this.detailPanelW;
  const H = this.detailPanelH;

  if (!slotInfo?.equipment) {
    // 空状态
    container.add(
      this.add.text(W / 2, H / 2, '点击装备\n查看详情', {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '13px',
        color: '#484f58',
        align: 'center',
      }).setOrigin(0.5)
    );
    return;
  }

  const equipment = slotInfo.equipment;
  const color = equipment.wuxing !== undefined ? WUXING_COLORS[equipment.wuxing] : 0x8b949e;
  const colorHex = '#' + color.toString(16).padStart(6, '0');
  let y = 16;
  const pad = 12;

  // 名称
  container.add(
    this.add.text(pad, y, equipment.name, {
      fontFamily: '"Noto Serif SC", serif',
      fontSize: '14px',
      color: '#f0e6d3',
      fontStyle: 'bold',
    })
  );
  y += 22;

  // 类型 · 稀有度
  container.add(
    this.add.text(pad, y, `${this.getEquipmentTypeName(equipment.type)} · ${this.getRarityName(equipment.rarity)}`, {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '11px',
      color: this.getRarityColor(equipment.rarity),
    })
  );
  y += 18;

  // 五行属性
  if (equipment.wuxing !== undefined) {
    const wuxName = WUXING_NAMES[equipment.wuxing];
    container.add(
      this.add.text(pad, y, `${wuxName}属 Lv.${equipment.wuxingLevel ?? 1}${equipment.upgradeLevel > 0 ? ` +${equipment.upgradeLevel}` : ''}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '11px',
        color: colorHex,
      })
    );
    y += 18;
  }

  // 属性数值
  const stats: string[] = [];
  if (equipment.attack)  stats.push(`攻+${equipment.attack}`);
  if (equipment.defense) stats.push(`防+${equipment.defense}`);
  if (equipment.speed)   stats.push(`速+${equipment.speed}`);
  if (equipment.hp)      stats.push(`血+${equipment.hp}`);
  if (stats.length > 0) {
    container.add(
      this.add.text(pad, y, stats.join('  '), {
        fontFamily: 'monospace',
        fontSize: '11px',
        color: '#f0e6d3',
      })
    );
    y += 18;
  }

  // 技能列表
  const skills = getEquipmentSkillsDisplay(equipment, equipment.wuxingLevel ?? 1);
  if (skills.length > 0) {
    y += 4;
    for (const skill of skills) {
      const skillLine = this.add.text(pad, y, `✦ ${skill.name}: ${skill.description}`, {
        fontFamily: '"Noto Sans SC", sans-serif',
        fontSize: '10px',
        color: colorHex,
        wordWrap: { width: W - pad * 2 },
      });
      container.add(skillLine);
      y += skillLine.height + 4;
    }
  }

  // 操作按钮区（底部对齐）
  const btnY = H - 44;
  const btnH = 30;
  const btnW = (W - pad * 3) / 2;

  // 穿戴/卸下按钮
  const isEquipped = slotInfo.type !== 'inventory';
  const equipBtnLabel = isEquipped ? '卸下' : '穿戴';
  const equipBtnColor = isEquipped ? 0x6e7681 : 0x1a7f37;

  const equipBg = this.add.graphics();
  equipBg.fillStyle(equipBtnColor, 0.9);
  equipBg.fillRoundedRect(pad, btnY, btnW, btnH, 6);
  container.add(equipBg);

  const equipTxt = this.add.text(pad + btnW / 2, btnY + btnH / 2, equipBtnLabel, {
    fontFamily: '"Noto Sans SC", sans-serif',
    fontSize: '13px',
    color: '#ffffff',
    fontStyle: 'bold',
  }).setOrigin(0.5);
  container.add(equipTxt);

  const equipHit = this.add.rectangle(pad + btnW / 2, btnY + btnH / 2, btnW, btnH, 0xffffff, 0).setInteractive({ useHandCursor: true });
  equipHit.on('pointerup', () => {
    if (isEquipped) {
      this.unequipItem(slotInfo);
    } else {
      this.equipItem(slotInfo);
    }
  });
  container.add(equipHit);

  // 归元按钮（仅对已装备的装备栏有效）
  if (isEquipped) {
    const devourX = pad * 2 + btnW;
    const devourBg = this.add.graphics();
    devourBg.fillStyle(0x6e2c00, 0.9);
    devourBg.fillRoundedRect(devourX, btnY, btnW, btnH, 6);
    container.add(devourBg);

    const devourTxt = this.add.text(devourX + btnW / 2, btnY + btnH / 2, '归元', {
      fontFamily: '"Noto Sans SC", sans-serif',
      fontSize: '13px',
      color: '#f0a030',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add(devourTxt);

    const devourHit = this.add.rectangle(devourX + btnW / 2, btnY + btnH / 2, btnW, btnH, 0xffffff, 0).setInteractive({ useHandCursor: true });
    devourHit.on('pointerup', () => {
      this.selectedSlot = slotInfo;
      this.showTopMessage('选择背包中的装备作为归元目标');
    });
    container.add(devourHit);
  }
}
```

**Step 5: Replace `createInventorySection()` to be full-width below the split area**

```typescript
private createInventorySection(): void {
  const { width, height } = this.cameras.main;
  const headerH = height * 0.08;
  const splitH = height * 0.50;
  const sectionY = headerH + height * 0.01 + splitH + height * 0.01;
  const sectionH = height - sectionY - 8;

  const sectionBg = this.add.graphics();
  sectionBg.fillStyle(this.colors.inkBlack, 0.5);
  sectionBg.fillRoundedRect(width * 0.01, sectionY, width * 0.98, sectionH, 8);
  sectionBg.lineStyle(1, this.colors.inkGrey, 0.5);
  sectionBg.strokeRoundedRect(width * 0.01, sectionY, width * 0.98, sectionH, 8);

  const usedSlots = INVENTORY_SIZE - gameState.getEmptySlotCount();
  this.add.text(width * 0.04, sectionY + 12, `背包 (${usedSlots}/${INVENTORY_SIZE})`, {
    fontFamily: '"Noto Sans SC", sans-serif',
    fontSize: '11px',
    color: '#d4a853',
    fontStyle: 'bold',
  });

  // 碎片数量
  const fragments = gameState.getFragmentCount();
  this.add.text(width * 0.96, sectionY + 12, `💎×${fragments}`, {
    fontFamily: '"Noto Sans SC", sans-serif',
    fontSize: '11px',
    color: '#a855f7',
  }).setOrigin(1, 0);

  const cols = INVENTORY_SIZE;
  const availW = width * 0.96;
  const spacing = availW / cols;
  const slotSize = Math.min(spacing * 0.88, sectionH * 0.75);
  const startX = width * 0.02 + spacing * 0.5;
  const slotY = sectionY + sectionH * 0.55;

  const inventory = gameState.getInventory();
  for (let i = 0; i < INVENTORY_SIZE; i++) {
    const x = startX + i * spacing;
    this.createSlot(x, slotY, { type: 'inventory', index: i, equipment: inventory[i] }, slotSize);
  }
}
```

**Step 6: Modify `onGlobalPointerUp` to use detail panel instead of popup**

Replace the else branch (single/double click) in `onGlobalPointerUp`:
```typescript
} else {
  // 单击检测（移除双击穿戴，改为通过详情面板按钮操作）
  const now = Date.now();
  const src = this.dragSourceSlot;

  // 归元模式：第二次点击选择目标
  if (this.selectedSlot && this.topMessage) {
    if (src.equipment && src.type === 'inventory') {
      this.closeTopMessage();
      this.handleDevour(this.selectedSlot, src);
      this.selectedSlot = undefined;
    }
  } else {
    // 普通选中逻辑
    if (src.equipment) {
      this.refreshDetailPanel(src);
    } else {
      this.refreshDetailPanel(undefined);
    }
  }

  this.lastClickTime = now;
  this.lastClickSlot = src;
}
```

**Step 7: Add `handleDevour()` method (归元逻辑)**

```typescript
private handleDevour(equipSlot: SlotInfo, sacrificeSlot: SlotInfo): void {
  const equipped = equipSlot.equipment;
  const sacrifice = sacrificeSlot.equipment;
  if (!equipped || !sacrifice) return;

  const result = SynthesisSystem.devour(equipped, sacrifice);
  if (result.success) {
    // 更新装备数据
    const updatedEq = result.equipment!;
    if (equipSlot.type === 'weapon') {
      gameState.equip(updatedEq);
    } else if (equipSlot.type === 'armor') {
      gameState.equip(updatedEq);
    } else if (equipSlot.type === 'treasure') {
      gameState.equipTreasure(updatedEq, equipSlot.index);
    }
    // 移除牺牲品
    gameState.removeFromInventory(sacrificeSlot.index);
    this.showTopMessage(`归元成功！${equipped.name} +1`, 0x3fb950);
  } else {
    this.showTopMessage(`归元失败`, 0xf85149);
    // 牺牲品仍消耗
    gameState.removeFromInventory(sacrificeSlot.index);
  }

  eventBus.emit(GameEvent.STATS_CHANGED);
  this.time.delayedCall(1200, () => {
    this.scene.restart();
  });
}
```

**Step 8: Remove old `showViewPopup()` and `closePopup()` references**

- Delete `showViewPopup()` method (lines 601-750)
- Delete `closePopup()` method (lines 752-758)
- Remove `popup` field usage in `create()` keyboard handler (just remove the `closePopup()` call in ESC handler)
- Remove `this.popup` field declaration

**Step 9: Update `showContextMenu` to keep working for 重组**

Keep existing context menu for 重组 (drag-and-drop between inventory slots). The context menu has its own close mechanism and doesn't use a global overlay, so it should be fine. Just verify the context menu's `showContextMenu()` still works.

**Step 10: Build and verify**
```bash
pnpm --filter client build
```
Expected: TypeScript compiles with no errors.

Manual test: open inventory, tap weapon → right panel shows weapon details + [卸下] button. Tap inventory item → right panel shows item details + [穿戴] button. Tap [穿戴] → item equips, panel updates. Tap equipped item + [归元] → topMessage shows, tap inventory item → devour executes.

**Step 11: Commit**
```bash
git add packages/client/src/scenes/InventoryScene.ts
git commit -m "feat: redesign inventory scene - split panel layout, remove overlay, button-based equip/归元"
```

---

## Task 3: Stop loot drops when inventory is full

**Files:**
- Modify: `packages/client/src/scenes/WorldScene.ts`

**Step 1: Add inventory-full check at top of `updateLootDrops()` (line 678)**

At the very start of the method, before any other logic:
```typescript
private updateLootDrops(): void {
  // 背包已满时不触发塑型
  if (gameState.isInventoryFull()) return;
  if (this.isChanneling) return;
  // ... rest unchanged
```

**Step 2: Build and verify**
```bash
pnpm --filter client build
```

**Step 3: Commit**
```bash
git add packages/client/src/scenes/WorldScene.ts
git commit -m "fix: skip loot channeling when inventory is full"
```

---

## Task 4: Enemy world boundary (already fixed in SpawnSystem.ts line 149)

After reading SpawnSystem.ts, `sprite.setCollideWorldBounds(true)` is already present at line 149. **No change needed.** If enemies are still crossing boundaries during testing, investigate whether the physics world bounds match the expected area or if the issue is with patrol behavior going out of bounds visually.

**Step 1: Verify in gameplay that enemies don't cross edges**

Build and run. If enemies still escape, the issue is patrol center placement. Patrol centers are clamped in `spawnEnemies()` (line 108-109), but the physics body offset might cause visual overflow. In that case, increase the clamping margin from 200 to 300 in SpawnSystem.ts:
```typescript
const x = Math.max(300, Math.min(worldW - 300, centerX + Math.cos(angle) * radius));
const y = Math.max(300, Math.min(worldH - 300, centerY + Math.sin(angle) * radius));
```

---

## Task 5: Move active skills to above the divider line + fix CD display

**Files:**
- Modify: `packages/client/src/scenes/HUDScene.ts`

**Current state:** `aoeSkillArea` container is at `panelY + 92` (hardcoded), which is the 4th row in the upper section. Need to move to just above the divider line at `panelY + panelH * 0.35`.

**Step 1: Calculate new Y position and move aoeSkillArea**

In `create()`, change:
```typescript
// AOE 技能按钮区（buff 栏下方）
this.aoeSkillArea = this.add.container(0, panelY + 92).setDepth(51);
```
To:
```typescript
// AOE 技能按钮区：位于分割线（上方35%区域最底部）正上方
const dividerY = panelY + panelH * 0.35;
const aoeSkillH = 32; // 按钮高度 + 上下间距
this.aoeSkillArea = this.add.container(0, dividerY - aoeSkillH).setDepth(51);
```

**Step 2: Update button dimensions in `refreshAoeSkillButtons()`**

Increase button height from 22 to 28, and make buttons auto-fit full width:

Replace:
```typescript
const btnW = 68;
const btnH = 22;
const gap = 6;
let x = width * 0.05;
```
With:
```typescript
const totalSkills = activeSkills.length;
const availW = width * 0.90;
const gap = 4;
const btnW = Math.floor((availW - gap * (totalSkills - 1)) / totalSkills);
const btnH = 28;
let x = width * 0.05;
```

**Step 3: Update CD overlay coordinates in `updateAoeSkillCds()` to match new btnH=28**

Replace:
```typescript
const btnW = 68;
const btnH = 22;
const gap = 6;
const x = width * 0.05 + i * (btnW + gap);
```
With:
```typescript
const totalSkills = this.aoeSkillCdOverlays.length;
const availW = width * 0.90;
const gap = 4;
const btnW = Math.floor((availW - gap * (totalSkills - 1)) / totalSkills);
const btnH = 28;
const x = width * 0.05 + i * (btnW + gap);
```

**Step 4: Move infoArea, buffArea up to fit within upper 35% section**

The HP bar is at `panelY + 10` (height 12). Row 2 (skills) at `panelY + 28`. Row 3 (statuses) at `panelY + 42`. These all fit before the AOE buttons which now sit at `dividerY - 32`.

Verify there's no overlap: dividerY = `panelY + panelH * 0.35`. On a 844px phone: panelH = 337px, dividerY = panelY + 118px. AOE buttons start at panelY + 86px. Third info row (statuses) is at panelY + 70px. Gap between row 3 and AOE buttons = 16px. ✓

**Step 5: Build and verify**
```bash
pnpm --filter client build
```

Manual test: equip an AOE skill item. The skill button should appear just above the divider line (above the joystick area). Trigger skill → CD countdown shows in large white text over dark overlay on button.

**Step 6: Commit**
```bash
git add packages/client/src/scenes/HUDScene.ts
git commit -m "fix: move AOE skill buttons to just above joystick divider, full-width auto-size"
```

---

## Final verification

```bash
pnpm --filter client build
```

Run the game and verify all 5 fixes:
1. ✓ Skill/status/buff pills → popup shows/updates/closes correctly
2. ✓ Inventory: tap item → detail panel. [穿戴]/[卸下] buttons work. No global overlay.
3. ✓ Inventory full → loot drops don't trigger channeling
4. ✓ Enemies stay within world bounds
5. ✓ AOE skill buttons just above joystick area, CD countdown visible
