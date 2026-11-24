import { Wuxing } from '../types/Wuxing.js';
import { GearSlot } from './slots.js';
import type { StatLine } from './gear.js';

/**
 * 套装
 *
 * 每重天对应 1~2 套，只在对应的层数掉落（病变核心掉率最高）。
 * 每套 5 件：兵 / 甲 / 两枚佩饰 / 法宝。
 *   2 件、3 件：属性加成
 *   5 件：改变玩法的效果
 */

export type SetId = 'fenyan' | 'jinglei' | 'xuanming' | 'changsheng' | 'kunyuan' | 'tiangang';
export type SetFx = 'fenyan5' | 'jinglei5' | 'xuanming5' | 'changsheng5' | 'kunyuan5' | 'tiangang5';

export interface SetPiece {
  slot: GearSlot;
  /** 器型（决定外观）：剑 刃 杖 枪 扇 / 甲 袍 衣 铠 / 佩 坠 环 珠 / 印 铃 镜 葫芦 塔 */
  kind: string;
  name: string;
}

export interface SetDef {
  id: SetId;
  name: string;
  wuxing: Wuxing;
  /** 掉落层数区间 */
  lo: number;
  hi: number;
  color: number;
  css: string;
  pieces: SetPiece[];
  bonus2: StatLine[];
  bonus3: StatLine[];
  fx5: SetFx;
  desc5: string;
}

const P = (slot: GearSlot, kind: string, name: string): SetPiece => ({ slot, kind, name });

export const SETS: Record<SetId, SetDef> = {
  fenyan: {
    id: 'fenyan', name: '焚炎', wuxing: Wuxing.FIRE, lo: 1, hi: 3, color: 0xff7a45, css: '#ff7a45',
    pieces: [
      P(GearSlot.WEAPON, '剑', '焚炎剑'), P(GearSlot.ARMOR, '袍', '焚炎袍'),
      P(GearSlot.CHARM, '佩', '焚炎佩'), P(GearSlot.CHARM, '珠', '焚炎珠'), P(GearSlot.RELIC, '葫芦', '焚炎葫芦'),
    ],
    bonus2: [{ stat: 'atkPct', value: 15 }],
    bonus3: [{ stat: 'burn', value: 60 }],
    fx5: 'fenyan5', desc5: '每第 8 枚火球命中时，引落一颗小陨火（120% 伤害）',
  },
  jinglei: {
    id: 'jinglei', name: '惊雷', wuxing: Wuxing.METAL, lo: 2, hi: 4, color: 0xf2e27a, css: '#f2e27a',
    pieces: [
      P(GearSlot.WEAPON, '枪', '惊雷枪'), P(GearSlot.ARMOR, '铠', '惊雷铠'),
      P(GearSlot.CHARM, '环', '惊雷环'), P(GearSlot.CHARM, '坠', '惊雷坠'), P(GearSlot.RELIC, '印', '惊雷印'),
    ],
    bonus2: [{ stat: 'aspd', value: 15 }],
    bonus3: [{ stat: 'crit', value: 10 }],
    fx5: 'jinglei5', desc5: '暴击时落下一道惊雷，对目标周围造成 70% 伤害',
  },
  xuanming: {
    id: 'xuanming', name: '玄冥', wuxing: Wuxing.WATER, lo: 3, hi: 6, color: 0x6fb6ff, css: '#6fb6ff',
    pieces: [
      P(GearSlot.WEAPON, '扇', '玄冥扇'), P(GearSlot.ARMOR, '衣', '玄冥衣'),
      P(GearSlot.CHARM, '珠', '玄冥珠'), P(GearSlot.CHARM, '佩', '玄冥佩'), P(GearSlot.RELIC, '镜', '玄冥镜'),
    ],
    bonus2: [{ stat: 'hp', value: 120 }],
    bonus3: [{ stat: 'dr', value: 10 }],
    fx5: 'xuanming5', desc5: '防反成功后 3 秒内无敌，防反伤害翻倍',
  },
  changsheng: {
    id: 'changsheng', name: '长生', wuxing: Wuxing.WOOD, lo: 4, hi: 7, color: 0x6ee7a0, css: '#6ee7a0',
    pieces: [
      P(GearSlot.WEAPON, '杖', '长生杖'), P(GearSlot.ARMOR, '袍', '长生袍'),
      P(GearSlot.CHARM, '坠', '长生坠'), P(GearSlot.CHARM, '环', '长生环'), P(GearSlot.RELIC, '铃', '长生铃'),
    ],
    bonus2: [{ stat: 'regen', value: 8 }],
    bonus3: [{ stat: 'find', value: 40 }, { stat: 'pickup', value: 80 }],
    fx5: 'changsheng5', desc5: '每击杀一只妖异，回复 2% 生命',
  },
  kunyuan: {
    id: 'kunyuan', name: '坤元', wuxing: Wuxing.EARTH, lo: 5, hi: 8, color: 0xe8b85a, css: '#e8b85a',
    pieces: [
      P(GearSlot.WEAPON, '刃', '坤元刃'), P(GearSlot.ARMOR, '甲', '坤元甲'),
      P(GearSlot.CHARM, '佩', '坤元佩'), P(GearSlot.CHARM, '珠', '坤元珠'), P(GearSlot.RELIC, '塔', '坤元塔'),
    ],
    bonus2: [{ stat: 'area', value: 25 }],
    bonus3: [{ stat: 'cdr', value: 15 }],
    fx5: 'kunyuan5', desc5: '燎原过后留下火域 3 秒，每秒造成 50% 伤害',
  },
  tiangang: {
    id: 'tiangang', name: '天罡', wuxing: Wuxing.FIRE, lo: 7, hi: 9, color: 0xff4fd8, css: '#ff4fd8',
    pieces: [
      P(GearSlot.WEAPON, '剑', '天罡剑'), P(GearSlot.ARMOR, '铠', '天罡铠'),
      P(GearSlot.CHARM, '环', '天罡环'), P(GearSlot.CHARM, '佩', '天罡佩'), P(GearSlot.RELIC, '印', '天罡印'),
    ],
    bonus2: [{ stat: 'atkPct', value: 25 }],
    bonus3: [{ stat: 'critDmg', value: 60 }],
    fx5: 'tiangang5', desc5: '每次释放焚天，接下来 5 枚火球必定暴击',
  },
};

export const SET_ORDER: SetId[] = ['fenyan', 'jinglei', 'xuanming', 'changsheng', 'kunyuan', 'tiangang'];

/** 某一层能掉的套装 */
export function setsForTier(tier: number): SetDef[] {
  return SET_ORDER.map(id => SETS[id]).filter(s => tier >= s.lo && tier <= s.hi);
}

/** 图鉴键：套装 + 部件序号 */
export function pieceKey(set: SetId, index: number): string {
  return `${set}:${index}`;
}

/** 合成套装件的花费（以套装起始层的精魄计） */
export function craftCost(set: SetDef): { essence: number; mats: number } {
  return { essence: 5, mats: Math.round(150 * (1 + 0.3 * (set.lo - 1))) };
}

/** 升阶：+1 ~ +10，每阶所有数值 +8%，花费随阶数上涨，不会失败 */
export const MAX_GRADE = 10;
export const GRADE_STEP = 0.08;
export function refineCost(tier: number, grade: number): { essence: number; mats: number } {
  return { essence: grade + 1, mats: Math.round(15 * (grade + 1) * (1 + 0.3 * (tier - 1))) };
}

/** 图鉴加成：每登记一件套装件，攻击与生命 +1% */
export const CODEX_BONUS_PCT = 1;
