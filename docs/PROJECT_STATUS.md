# 西游肉鸽策略游戏 - 项目状态

> 最后更新: 2026-02-01

## 快速开始

```bash
cd /Volumes/T7/work/fighting
pnpm install
pnpm build:shared
pnpm dev:client
```

游戏运行在 `http://localhost:5173`

---

## 项目结构

```
/Volumes/T7/work/fighting/
├── package.json                 # 根项目配置 (pnpm workspaces)
├── tsconfig.base.json           # 共享 TypeScript 配置
├── docker-compose.yml           # Docker 开发环境
├── docs/
│   ├── plans/
│   │   ├── 2026-01-31-西游肉鸽策略游戏设计.md
│   │   └── 2026-01-31-技术实现规划.md
│   └── PROJECT_STATUS.md        # 本文件
│
├── packages/
│   ├── shared/                  # 共享类型和数据
│   │   ├── src/
│   │   │   ├── types/
│   │   │   │   ├── Wuxing.ts    # 五行系统
│   │   │   │   ├── Equipment.ts # 装备和技能定义
│   │   │   │   ├── Player.ts    # 玩家状态
│   │   │   │   └── Game.ts      # 游戏节点类型
│   │   │   ├── data/
│   │   │   │   └── EquipmentDatabase.ts  # 西游神器和配方
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── client/                  # Phaser 3 客户端
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   └── gameConfig.ts
│   │   │   ├── scenes/
│   │   │   │   ├── BootScene.ts      # 启动场景
│   │   │   │   ├── MenuScene.ts      # 主菜单
│   │   │   │   ├── MapScene.ts       # 地图/节点选择
│   │   │   │   ├── BattleScene.ts    # 战斗场景
│   │   │   │   ├── RewardScene.ts    # 奖励三选一
│   │   │   │   └── InventoryScene.ts # 背包管理
│   │   │   ├── systems/
│   │   │   │   ├── GameStateManager.ts  # 游戏状态管理
│   │   │   │   └── SynthesisSystem.ts   # 合成系统
│   │   │   └── main.ts
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── package.json
│   │
│   └── server/                  # Colyseus 服务器 (待开发)
│       ├── src/
│       │   ├── rooms/
│       │   │   └── GameRoom.ts
│       │   └── index.ts
│       └── package.json
```

---

## 开发进度

### Phase 1: 基础框架 ✅ 完成

| 任务 | 状态 | 说明 |
|------|------|------|
| 项目结构初始化 | ✅ | pnpm workspaces monorepo |
| Docker 环境配置 | ✅ | docker-compose.yml |
| Phaser 3 客户端基础 | ✅ | Vite + TypeScript |
| 五行系统 | ✅ | 相生相克逻辑 |
| 装备系统 | ✅ | 武器/铠甲/法宝 |
| 单人战斗系统 | ✅ | 自动战斗 + 五行伤害计算 |

### Phase 2: 功能扩展 (当前进度)

| 任务 | 状态 | 说明 |
|------|------|------|
| 带技能的装备 | ✅ | 被动/触发/战斗开始型技能 |
| 西游神器 | ✅ | 13件传说/史诗装备 |
| 特殊合成配方 | ✅ | 8个配方 |
| Boss掉落系统 | ✅ | 5个Boss掉落表 |
| 战斗飘字效果 | ✅ | 伤害/治疗/技能/状态 |
| 多人模式 | ❌ | 待开发 |
| 陷害卡系统 | ❌ | 待开发 |
| 81难剧情关卡 | ❌ | 待开发 |

---

## 核心系统说明

### 五行系统 (`Wuxing.ts`)

```
相克（伤害加成）: 金→木→土→水→火→金
相生（治疗敌人）: 金→水→木→火→土→金
```

- 攻击五行由**武器**决定
- 防御五行由**铠甲**决定
- 同属性装备叠加五行等级

### 技能系统 (`SkillTrigger`)

| 类型 | 说明 | 示例 |
|------|------|------|
| `PASSIVE` | 始终生效 | 攻击+2, 防御+2 |
| `ON_HIT` | 攻击时触发 | 30%双倍伤害, 20%吸血 |
| `ON_DEFEND` | 被攻击时触发 | 30%闪避, 25%缴械 |
| `BATTLE_START` | 战斗开始时 | 回复2HP, 对敌造成2伤害 |

### 西游神器 (13件)

**武器 (Boss掉落):**
- 如意金箍棒 - 传说/金 - 30%双倍伤害
- 九齿钉耙 - 史诗/木 - 20%吸血
- 降妖宝杖 - 史诗/水 - 被动+2防御

**法宝 (合成/掉落):**
- 紫金红葫芦 - 传说/火 - 开局伤害2
- 芭蕉扇 - 史诗/火 - 火五行+2
- 照妖镜 - 稀有/金 - 无视1点防御
- 金刚琢 - 传说/金 - 25%缴械
- 定海神珠 - 传说/水 - 水五行+3

**铠甲 (合成/掉落):**
- 锦斓袈裟 - 传说/土 - 开局回复2HP
- 藕丝步云履 - 史诗/水 - 30%闪避
- 紧箍咒 - 传说/土 - 攻击+4, 每回合自损1HP
- 玄冰铠 - 史诗/水 - 20%冻结敌人
- 炎龙剑 - 史诗/火 - 25%灼烧

### 合成配方

| 材料 | 产出 | 成功率 |
|------|------|--------|
| 2件史诗火法宝 | 紫金红葫芦 | 100% |
| 2件火法宝 | 芭蕉扇 | 80% |
| 2件金法宝 | 照妖镜 | 70% |
| 2件史诗土铠甲 | 锦斓袈裟 | 100% |
| 2件水铠甲 | 藕丝步云履 | 70% |
| 火剑 + 火珠 | 炎龙剑 | 100% |
| 水甲 + 水镜 | 玄冰铠 | 100% |

---

## 游戏流程

```
主菜单 (MenuScene)
    ↓
地图选择 (MapScene) ←──────────────┐
    ↓                              │
节点类型:                          │
  - 普通战斗 → BattleScene         │
  - 精英战斗 → BattleScene         │
  - 休整 → 回复HP                  │
  - 随机事件 → 好/坏事件            │
  - 西游奇遇 → 剧情 (待开发)        │
    ↓                              │
战斗胜利 → 奖励三选一 (RewardScene) │
    ↓                              │
背包管理 (InventoryScene, 按I打开)  │
  - 装备                           │
  - 合成                           │
  - 吞噬                           │
    ↓                              │
下一轮 ────────────────────────────┘
    ↓ (6轮后)
最终Boss战 → 胜利/失败
```

---

## 待开发功能

### Phase 3: 多人模式
- Colyseus 房间同步
- 2-4人在线对战
- 最终Battle Royale式混战

### Phase 4: 陷害卡系统
- 战斗中随机触发干扰
- 延迟揭示机制

### Phase 5: 81难剧情
- 西游记主题故事事件
- 特殊关卡和Boss

### Phase 6: 微信小游戏
- 适配微信小游戏平台
- 触控优化

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 客户端 | Phaser 3 + TypeScript + Vite |
| 服务端 | Colyseus + Node.js |
| 共享 | TypeScript 类型定义 |
| 包管理 | pnpm workspaces |
| 容器化 | Docker + Docker Compose |

---

## 命令参考

```bash
# 安装依赖
pnpm install

# 构建共享包
pnpm build:shared

# 启动客户端开发服务器
pnpm dev:client

# 启动服务器 (多人模式)
pnpm dev:server

# Docker 启动
docker-compose up -d
```
