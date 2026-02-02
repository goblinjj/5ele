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
 * 状态效果
 */
export interface StatusEffects {
  // 流血 (金)
  bleeding?: {
    stacks: number;        // 叠加层数
    damagePercent: number; // 每层每回合伤害 (最大生命值%)
  };

  // 回复 (木)
  regeneration?: {
    percent: number;       // 每回合回复 (最大生命值%)
    doubleWhenLow: boolean; // 低血量时回复翻倍
  };
  hasSurvivedLethal?: boolean;  // 本回合是否触发过致命保护
  hasRevived?: boolean;         // 是否已复活过

  // 减速 (水)
  slowed?: {
    speedReduction: number; // 速度降低百分比
    turnsLeft: number;      // 剩余回合
  };

  // 灼烧 (火)
  burning?: {
    stacks: number;        // 叠加层数 (最多3层)
    damagePercent: number; // 每层每回合伤害
    turnsLeft: number;     // 剩余回合
  };
  hasEmbers?: boolean;     // 余烬状态 (火伤害+50%)
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

  // 状态效果 (由 initWuxingPassives 初始化)
  statusEffects?: StatusEffects;

  // 五行被动追踪 (由 initWuxingPassives 初始化，默认为0/false)
  ignoreDefensePercent?: number;   // 金属性：无视防御百分比
  damageReduction?: number;        // 土属性：受伤减免百分比
  damageReflectPercent?: number;   // 土属性：反弹伤害百分比
  controlImmune?: boolean;         // 土Lv4：免疫控制 (HP>70%)
  revengeStacks?: number;          // 土Lv5：蓄力攻击计数
  revengeDamageBonus?: number;     // 土Lv5：蓄力攻击伤害加成
  canSurviveLethal?: boolean;      // 木Lv3+：致命保护
  canRevive?: boolean;             // 木Lv5：可以复活
  reviveHpPercent?: number;        // 木Lv5：复活血量百分比
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
  | 'battle_end'
  // 五行状态效果事件
  | 'status_applied'    // 状态效果施加
  | 'status_damage'     // 状态伤害 (流血/灼烧)
  | 'status_heal'       // 状态回复 (木回复)
  | 'reflect_damage'    // 反弹伤害
  | 'survive_lethal'    // 致命保护触发
  | 'revive'            // 复活
  | 'burn_explode'      // 灼烧引爆
  | 'freeze_shatter';   // 冻结破碎伤害

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
