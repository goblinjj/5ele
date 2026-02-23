# Five Fixes Design — 2026-02-23

## 1. 技能/状态/Buff 弹框重设计

### 问题
`toggleInfoPopup()` 每次点击都 destroy + create，HUD 每帧刷新导致弹框被销毁。

### 设计
- 初始化时一次性创建持久化 popup 容器 `this.infoPopupContainer`（包含背景、标题文字、描述文字）
- 用 `setVisible(true/false)` 控制显示，用 `setText()` 更新内容
- 位置固定：游戏区域底部上方 8px（`panelY - popupHeight - 8`）
- 触发逻辑：
  - 点击 label → 若 popup 已显示且内容相同则关闭，否则更新内容并显示
  - 点击 popup 本身 → 关闭
  - 游戏继续运行，不阻断输入
- popup 宽度最大 `width * 0.7`，高度由内容决定（预分配固定高度 80px）

### 文件
- `packages/client/src/scenes/HUDScene.ts`

---

## 2. 灵囊管理界面重设计

### 问题
全局遮罩导致双击第二次落在遮罩上，无法穿戴；界面不利于移动端操作。

### 设计：双栏无遮罩布局

```
+-------左栏(48%)-------+-------右栏(52%)-------+
| 已装备                 | 【选中装备详情】         |
| [武器] [防具]          | 名称 · 属性 · 等级      |
| [法宝1~6]              | 技能列表                |
+------------------------| [穿戴/卸下] [归元]      |
| 背包 (已用/总量)        |                        |
| □□□□□□□□□□            | 若选中2件:              |
| □□□□□□□□□□            | [重组]                  |
| ...                    |                        |
+------------------------+------------------------+
```

- **单击装备** → 右侧面板显示详情，无遮罩，无弹框
- **再次单击已选中装备** → 取消选中，右侧面板清空
- **穿戴/卸下按钮** → 在右侧面板中操作，替代双击
- **归元**：选中一件装备后显示归元按钮，点击后选择背包中另一件作为牺牲品
- **重组**：选中两件装备后显示重组按钮
- 操作后立即刷新左侧格子，不关闭界面

### 文件
- `packages/client/src/scenes/InventoryScene.ts`（完全重写布局部分）

---

## 3. 妖异不能跨越地图边界

### 设计
在 `SpawnSystem.ts` 创建敌人精灵时添加 `enemy.setCollideWorldBounds(true)`。

### 文件
- `packages/client/src/systems/SpawnSystem.ts`

---

## 4. 背包满后不触发塑型

### 设计
在 `WorldScene.ts` 的 `updateLootDrops()` 方法开头：
```typescript
if (gameState.isInventoryFull()) return;
```
若背包已满，直接跳过所有塑型检测（不移除地面掉落物，等背包腾出空间后可继续）。

### 文件
- `packages/client/src/scenes/WorldScene.ts`

---

## 5. 主动技能位置 + CD 倒计时

### 设计
- 将 AOE 技能按钮区域移动到控制面板上半区最底部（分割线 `panelY + panelH * 0.35` 正上方）
- 按钮高度 28px，所有按钮均匀分布在全宽（`width * 0.9`），最多 5 个
- CD 倒计时：
  - 按钮上覆盖半透明灰色蒙版（CD 期间）
  - 按钮中央显示剩余秒数（白色加粗，字号 12）
  - CD 结束后移除蒙版，恢复可点击状态
- HP 条 / 技能/状态行 / Buff 行在上半区紧凑排列，为技能按钮留出空间

### 文件
- `packages/client/src/scenes/HUDScene.ts`
