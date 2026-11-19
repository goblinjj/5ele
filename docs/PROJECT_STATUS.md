# 无极 - 项目状态

> 最后更新: 2026-11-19

竖屏手机网页游戏（Phaser 3 + TypeScript + Vite，pnpm monorepo，部署于 Cloudflare Pages `5ele`）。
世界观见 `docs/plans/2026-02-03-worldview-design.md`。

## 快速开始

```bash
pnpm install
pnpm build:shared     # 修改 packages/shared 后需要重新构建
pnpm dev:client       # http://localhost:5173
```

开发模式下浏览器控制台可用 `window.game` 与 `window.__dev`（gameState / eventBus / inputManager）。

## 当前玩法（实时动作）

流程：`MenuScene → PrologueScene → WorldScene`（并行 `HUDScene`，灵囊为 `InventoryScene`）。

- **地图**：3200×3200 的气脉区域。中央太极八卦阵是出生点，五个五行阵眼按相生顺序环列
  （木→火→土→金→水），地面刻有相生环与相克星。配置在 `config/worldConfig.ts`。
- **操控**：浮动摇杆（屏幕下方任意处按下）、「遁」闪避（带无敌帧，3 秒冷却）、「御」格挡 / 防反、
  范围技能按钮、兵 / 甲五行快换。键盘：WASD/方向键、空格=遁、Shift/F=御、1-5=技能、I=灵囊。
- **攻防节奏**：出手慢而重。残魂普攻有起手动作（约 0.19 秒后气劲离手），妖异蓄力更长、出手带前扑与斩击弧、收招有硬直。
  「御」架势 0.52 秒内受伤减七成；前 0.23 秒内被击中则**防反**：无伤、震退对方并还以 3 倍重击，弹道类攻击则回敬一发气劲，且「御」的冷却直接恢复。格挡与防反只用音效和闪光提示，不飘字。
  被防反 / 震晕的妖异处于破绽，受到伤害 +50%。
- **战斗**：残魂自动向射程内最近的妖异发射气劲弹，移动中也能攻击。
  核心是**五行快换**：进攻五行看武器、防守五行看防具，HUD 右侧「兵 / 甲」两列可一键换上灵囊里对应五行的器物，
  角标提示眼前妖异的最佳选择（克 / 御 / 危）。
  伤害 = 攻²/(攻+防) × 五行倍率（`worldConfig.WX_MULT`）：克 2.5 / 得生 1.5 / 同属 1 / 受制 0.5 / 泄 0.25。
  器物数值仍是 1~10，进入战斗时攻防血统一 ×10（`STAT_SCALE`）。
  解算在 `systems/combat/CombatResolver.ts`，并接入了属性技能（暴击、破甲、闪避、格挡、灼烧、减速、反震、蓄势、逢春等）。
- **妖异**（`systems/world/EnemyAI.ts`）：每个阵眼滋生对应五行的妖异，打法各异，攻击都有蓄力预警：
  獠牙怪（金）冲锋、青鳞蛇（水）高速撕咬并减速、赤狐精（火）远程狐火、
  树妖（木）皮厚回血、石头精（土）大范围震地。另有「魁」（精英）与「病变核心」（每 5 轮的首领）。
- **塑型**：妖异溃散后约六成留下五行能量（连续 2 只不掉则保底；魁首与核心必掉），靠近自动吸附并凝练成同五行的器物（优先补齐该五行缺的武器 / 防具）。
  成功率以防具五行为「我」：生（能量生我）75% / 比 60% / 耗（我克）50% / 泄（我生）40% / 克（克我）30%，
  失败 +5% 补偿并得 1 碎片；灵囊（15 格）已满时能量直接归元回血。
- **轮次**：每轮限时。击杀数达到净化目标 → 气脉暂稳（残敌消散、回复 15% 生命、6 秒调息）；
  超时 → 五行失衡加剧（残敌狂暴并滞留到下一轮）。期间不断有游荡妖异侵袭。
  第 5、10…轮击溃病变核心后可选择继续净化或回归本源。

## 代码结构（client/src）

| 路径 | 说明 |
|------|------|
| `scenes/WorldScene.ts` | 世界主循环：操控、能量与塑型、轮次流程 |
| `scenes/HUDScene.ts` | 全屏覆盖的战斗 HUD 与结算界面 |
| `scenes/InventoryScene.ts` | 灵囊（穿戴 / 重组 / 归元），占屏幕上方 60% |
| `systems/combat/` | `CombatSystem`（普攻弹道、技能、状态、受击）、`CombatResolver` |
| `systems/world/` | `SpawnSystem`、`EnemyAI`、`EntityManager`、`WorldBackdrop`（程序化地表） |
| `systems/fx/Fx.ts` | 程序化特效贴图、火花、冲击波、飘字对象池 |
| `systems/audio/Sfx.ts` | 程序化音效：全部用 Web Audio 实时合成，五行对应五声音阶 |
| `systems/input/` | `InputManager`、浮动 `VirtualJoystick` |
| `config/worldConfig.ts` | 地图 / 阵眼 / 五行色 / 数值常量 |

`packages/shared` 提供五行、装备、技能、掉落等规则数据。

## 已知遗留

- `MapScene` / `BattleScene` / `RewardScene` 是早期回合制玩法的代码，当前流程已不可达。
- 五行被动（`wuxing.MD` 中的破金、生机、寒息等）只在回合制 `BattleEngine` 中实现，实时战斗尚未接入。
- 数值（妖异成长、掉率、技能倍率）只经过自动脚本粗测，需要真机试玩后再调。
- `packages/server`（Colyseus 多人）仍是骨架。
