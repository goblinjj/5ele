import { WuxingLevel } from '../types/Wuxing.js';
import { Skill } from '../types/Equipment.js';

/**
 * 战斗配置
 */
export interface BattleConfig {
  allowEquipmentChange: boolean;  // PvE: true, PvP最终战: false
  isPvP: boolean;
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
  attackWuxing: WuxingLevel | null;
  defenseWuxing: WuxingLevel | null;
  skills: Skill[];
  isPlayer: boolean;

  // 临时状态
  frozen: boolean;
  attackDebuff: number;
}

/**
 * 战斗事件类型
 */
export type BattleEventType =
  | 'battle_start'
  | 'round_start'
  | 'turn_start'
  | 'attack'
  | 'skill_trigger'
  | 'damage'
  | 'heal'
  | 'miss'
  | 'death'
  | 'frozen_skip'
  | 'equip_change'
  | 'round_end'
  | 'battle_end';

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
