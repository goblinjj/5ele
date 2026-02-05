import { WuxingLevel, Wuxing } from '../types/Wuxing.js';
import { AttributeSkillId } from '../data/AttributeSkillDatabase.js';
import { SkillEffectLevels } from './AttributeSkillProcessor.js';

/**
 * 战斗配置
 */
export interface BattleConfig {
  allowEquipmentChange: boolean;  // PvE: true, PvP最终战: false
  isPvP: boolean;
}

/**
 * 状态效果
 */
export interface StatusEffects {
  // 流血
  bleeding?: {
    stacks: number;        // 叠加层数
    damagePercent: number; // 每层每回合伤害 (最大生命值%)
  };

  // 回复
  regeneration?: {
    percent: number;       // 每回合回复 (最大生命值%)
  };
  hasSurvivedLethal?: boolean;  // 本回合是否触发过致命保护（逢春）

  // 减速
  slowed?: {
    turnsLeft: number;      // 剩余回合
  };

  // 灼烧
  burning?: {
    stacks: number;        // 叠加层数
    damagePercent: number; // 每层每回合伤害
    turnsLeft: number;     // 剩余回合
  };
}

/**
 * 战斗者
 */
export interface Combatant {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  isPlayer: boolean;

  // 五行相关（保留用于克制计算）
  attackWuxing: WuxingLevel | null;
  defenseWuxing: WuxingLevel | null;

  // 所有五行等级汇总（上限10）
  allWuxingLevels?: Map<Wuxing, number>;

  // 属性技能（新系统）
  attributeSkills?: AttributeSkillId[];
  skillEffectLevels?: SkillEffectLevels;

  // 临时状态
  frozen: boolean;

  // 状态效果
  statusEffects?: StatusEffects;

  // 特殊状态
  hasWuxingMastery?: boolean;      // 五行圆满：5件法宝各为不同五行

  // 蓄势层数（土属性）
  xushiStacks?: number;
}

/**
 * 战斗阶段（用于技能触发时机）
 */
export enum BattlePhase {
  BATTLE_INIT = 'battle_init',     // 战斗初始化（根基、炎威、坚壁）
  ROUND_START = 'round_start',     // 回合开始
  TURN_START = 'turn_start',       // 行动开始（生机、灼烧伤害）
  BEFORE_ATTACK = 'before_attack', // 攻击前
  ON_ATTACK = 'on_attack',         // 攻击计算（锐度、破甲等）
  ON_DEFEND = 'on_defend',         // 防御计算（灵动、磐石等）
  AFTER_ATTACK = 'after_attack',   // 攻击后（寒锋、燎原等）
  AFTER_DEFEND = 'after_defend',   // 受击后（反震、余烬等）
  ON_DEATH = 'on_death',           // 死亡时（逢春）
  TURN_END = 'turn_end',           // 行动结束
  ROUND_END = 'round_end',         // 回合结束
}

/**
 * 战斗事件类型
 */
export type BattleEventType =
  | 'battle_start'
  | 'round_start'
  | 'turn_start'
  | 'skill_triggered'  // 技能触发（AOE技能、被动技能）
  | 'attack'
  | 'damage'
  | 'heal'
  | 'miss'             // 闪避
  | 'block'            // 格挡
  | 'critical'         // 暴击
  | 'death'
  | 'frozen_skip'
  | 'equip_change'
  | 'round_end'
  | 'battle_end'
  // 状态效果事件
  | 'status_applied'   // 状态效果施加（灼烧、减速等）
  | 'status_damage'    // 状态伤害（灼烧）
  | 'status_heal'      // 状态回复（生机、润泽等）
  | 'reflect_damage'   // 反震伤害
  | 'survive_lethal';  // 逢春触发

/**
 * 战斗事件
 */
export interface BattleEvent {
  type: BattleEventType;
  actorId?: string;
  targetId?: string;
  value?: number;
  skillName?: string;
  wuxingEffect?: 'conquer' | 'generate' | 'neutral';
  isCritical?: boolean;
  message?: string;
  // 状态效果相关
  statusType?: 'bleeding' | 'burning' | 'slowed' | 'frozen' | 'regeneration' | 'embers';
  stacks?: number;  // 状态叠加层数
  // AOE相关
  isAoe?: boolean;  // 是否是群攻伤害（同时显示所有伤害）
}

/**
 * 战斗引擎结果
 */
export interface EngineBattleResult {
  winnerId: string | null;  // null = 全部死亡或怪物获胜
  events: BattleEvent[];
  survivingCombatants: Combatant[];
}

/**
 * 空手攻击属性
 */
export const UNARMED_STATS = {
  attack: 1,
  speed: 0,
};
