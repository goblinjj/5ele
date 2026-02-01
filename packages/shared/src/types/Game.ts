import { PlayerState, PlayerVisibleInfo } from './Player.js';
import { Equipment } from './Equipment.js';

/**
 * 游戏阶段
 */
export enum GamePhase {
  WAITING = 'waiting',       // 等待玩家加入
  EXPLORING = 'exploring',   // 探索节点选择
  BATTLE = 'battle',         // 战斗中
  REWARD = 'reward',         // 三选一奖励
  SYNC = 'sync',             // 同步等待
  FINAL_BATTLE = 'final',    // 最终决战
  RESULT = 'result',         // 结算
}

/**
 * 节点类型
 */
export enum NodeType {
  NORMAL_BATTLE = 'normal_battle',   // 普通战斗
  REST = 'rest',                     // 休整
  ELITE_BATTLE = 'elite_battle',     // 精英战斗
  STORY = 'story',                   // 81难剧情
  RANDOM_EVENT = 'random_event',     // 随机事件
}

/**
 * 节点信息
 */
export interface GameNode {
  type: NodeType;
  name: string;
  description: string;
}

/**
 * 游戏状态
 */
export interface GameState {
  phase: GamePhase;
  round: number;
  maxRounds: number;

  // 玩家（完整状态，仅服务端）
  players: Map<string, PlayerState>;

  // 当前可选节点
  nodeOptions: GameNode[];

  // 玩家选择
  playerNodeChoices: Map<string, number>;

  // 当前奖励选项
  rewardOptions: Equipment[];
}

/**
 * 客户端游戏状态（仅包含可见信息）
 */
export interface ClientGameState {
  phase: GamePhase;
  round: number;
  maxRounds: number;

  // 自己的完整状态
  self: PlayerState;

  // 其他玩家的外显信息
  others: PlayerVisibleInfo[];

  // 当前可选节点
  nodeOptions: GameNode[];

  // 当前奖励选项
  rewardOptions: Equipment[];
}

/**
 * 战斗结果
 */
export interface BattleResult {
  winnerId: string | null; // null 表示 Boss/怪物获胜
  rounds: BattleRound[];
  rewards: Equipment[];
}

/**
 * 战斗回合
 */
export interface BattleRound {
  actions: BattleAction[];
}

/**
 * 战斗动作
 */
export interface BattleAction {
  actorId: string;
  targetId: string;
  actionType: 'attack' | 'skill' | 'heal';
  damage?: number;
  heal?: number;
  skillName?: string;
  isCritical?: boolean;
  wuxingEffect?: 'conquer' | 'generate' | 'neutral';
}

/**
 * 延迟揭示的陷害信息
 */
export interface TrapReveal {
  usedBy: string;
  targetId: string;
  cardName: string;
  round: number;
}
