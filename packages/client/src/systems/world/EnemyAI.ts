import Phaser from 'phaser';
import { EntityManager, WorldEntity } from './EntityManager.js';
import { SpawnSystem } from './SpawnSystem.js';
import { CombatSystem } from '../combat/CombatSystem.js';
import { Fx } from '../fx/Fx.js';
import { WX_TINT, ZONE_RADIUS } from '../../config/worldConfig.js';
import { sfx } from '../audio/Sfx.js';

/** 索敌范围：大约一个屏幕（半屏高 780）。只有魁首无视距离、全图追杀 */
const DETECT_RANGE = 760;
/** 追出这个距离仍够不着就放弃，回到原处游荡 */
const LEASH_RANGE = 1150;
const PATROL_SPEED = 55;

const TELE_COLOR = 0xff2a1a;
const TELE_EDGE = 0xffd0c0;
/** 预警画在地表装饰之上、角色之下 */
const TELE_DEPTH = -8;

/**
 * 妖异 AI：五种妖异各有打法，所有攻击都有蓄力预警，可以走位或用「遁」躲开。
 *
 *  獠牙怪（金）charger  —— 锁定方向后直线冲锋
 *  青鳞蛇（水）swift    —— 高速贴身撕咬，命中附带减速
 *  赤狐精（火）caster   —— 保持距离吐狐火
 *  树妖  （木）brute    —— 皮厚、缓慢回血，近身重击
 *  石头精（土）slammer  —— 大范围震地
 *  病变核心 boss        —— 环形弹幕 + 召唤爪牙 + 震地
 */
export class EnemyAI {
  private scene: Phaser.Scene;
  private entityManager: EntityManager;
  private spawnSystem: SpawnSystem;
  private combat: CombatSystem;
  private fx: Fx;
  private round: number = 1;

  constructor(scene: Phaser.Scene, em: EntityManager, spawn: SpawnSystem, combat: CombatSystem, fx: Fx) {
    this.scene = scene;
    this.entityManager = em;
    this.spawnSystem = spawn;
    this.combat = combat;
    this.fx = fx;
  }

  setRound(round: number): void {
    this.round = round;
  }

  update(delta: number, player: Phaser.Physics.Arcade.Sprite): void {
    const alive = this.entityManager.getAlive();
    for (let i = 0; i < alive.length; i++) {
      this.updateEntity(alive[i], delta, player);
    }
    // 死亡动画中的也要同步阴影位置
    const all = this.entityManager.getAll();
    for (let i = 0; i < all.length; i++) this.spawnSystem.syncVisuals(all[i]);
  }

  // ───────────────────────── 单体更新 ─────────────────────────

  private updateEntity(e: WorldEntity, delta: number, player: Phaser.Physics.Arcade.Sprite): void {
    const body = e.sprite.body as Phaser.Physics.Arcade.Body;
    const px = player.x, py = player.y;
    const dx = px - e.sprite.x, dy = py - e.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist, ny = dy / dist;

    e.cooldown = Math.max(0, e.cooldown - delta);

    // 树妖：缓慢回血
    if (e.kind === 'brute' && e.combatant.hp < e.combatant.maxHp) {
      e.regenTimer -= delta;
      if (e.regenTimer <= 0) {
        e.regenTimer = 3000;
        e.combatant.hp = Math.min(e.combatant.maxHp, e.combatant.hp + Math.ceil(e.combatant.maxHp * 0.06));
        this.spawnSystem.updateHpBar(e);
      }
    }

    // 硬直（地裂）
    if (e.stunTimer > 0) {
      e.stunTimer -= delta;
      if (e.knockTimer > 0) {
        e.knockTimer -= delta;
        body.setVelocity(e.knockX, e.knockY);
      } else {
        body.setVelocity(0, 0);
      }
      if (e.phase !== 'idle') this.endAttack(e);
      this.playAnim(e, 'idle');
      return;
    }

    // 索敌：魁首全图追杀；其余妖异只在一屏之内发现残魂，被甩开太远则放弃
    if (e.tier === 'elite') {
      e.aggro = true;
    } else if (!e.aggro) {
      if (dist < DETECT_RANGE) e.aggro = true;
    } else if (dist > LEASH_RANGE && e.phase === 'idle') {
      e.aggro = false;
      e.patrolTimer = 0;
    }

    // 攻击流程中
    if (e.phase !== 'idle') {
      this.updateAttack(e, delta, body, dist, nx, ny, player);
      return;
    }

    // 击退
    if (e.knockTimer > 0) {
      e.knockTimer -= delta;
      body.setVelocity(e.knockX, e.knockY);
      return;
    }

    if (!e.aggro) {
      this.patrol(e, delta, body);
      return;
    }

    const slowed = this.combat.isEnemySlowed(e.combatant.id);
    const speed = e.moveSpeed * (slowed ? 0.5 : 1) * (e.enraged ? 1.3 : 1);
    e.sprite.setFlipX(dx < 0);

    if (e.tier === 'boss') {
      this.updateBoss(e, delta, body, dist, nx, ny, speed, player);
      return;
    }

    switch (e.kind) {
      case 'charger':
        if (dist < 380 && e.cooldown <= 0) {
          this.beginAttack(e, 520, nx, ny);
        } else if (dist > 300) {
          body.setVelocity(nx * speed, ny * speed);
        } else {
          // 绕着残魂游走，等待冲锋
          body.setVelocity(-ny * speed * 0.7, nx * speed * 0.7);
        }
        break;

      case 'caster': {
        if (dist < 560 && e.cooldown <= 0) {
          this.beginAttack(e, 480, nx, ny);
          break;
        }
        if (dist > 430) body.setVelocity(nx * speed, ny * speed);
        else if (dist < 270) body.setVelocity(-nx * speed * 0.85, -ny * speed * 0.85);
        else body.setVelocity(-ny * speed * 0.5, nx * speed * 0.5);
        break;
      }

      case 'slammer':
        if (dist < 150 && e.cooldown <= 0) this.beginAttack(e, 850, nx, ny);
        else if (dist > 110) body.setVelocity(nx * speed, ny * speed);
        else body.setVelocity(0, 0);
        break;

      case 'swift':
        if (dist < 100 && e.cooldown <= 0) this.beginAttack(e, 380, nx, ny);
        else if (dist > 80) body.setVelocity(nx * speed, ny * speed);
        else body.setVelocity(0, 0);
        break;

      case 'brute':
      default:
        if (dist < 115 && e.cooldown <= 0) this.beginAttack(e, 560, nx, ny);
        else if (dist > 90) body.setVelocity(nx * speed, ny * speed);
        else body.setVelocity(0, 0);
        break;
    }

    const moving = Math.abs(body.velocity.x) > 5 || Math.abs(body.velocity.y) > 5;
    this.playAnim(e, moving ? 'run' : 'idle');
  }

  private patrol(e: WorldEntity, delta: number, body: Phaser.Physics.Arcade.Body): void {
    e.patrolTimer -= delta;
    if (e.patrolTimer <= 0) {
      e.patrolTimer = Phaser.Math.Between(1500, 3500);
      const hx = e.homeX - e.sprite.x, hy = e.homeY - e.sprite.y;
      const fromHome = Math.sqrt(hx * hx + hy * hy);
      if (fromHome > ZONE_RADIUS + 200) {
        // 离驻地很远（放弃追击 / 侵袭途中）：快步赶回去
        const v = e.moveSpeed * 0.8;
        body.setVelocity((hx / fromHome) * v, (hy / fromHome) * v);
        e.patrolTimer = 600;
      } else if (fromHome > ZONE_RADIUS - 60) {
        body.setVelocity((hx / fromHome) * PATROL_SPEED, (hy / fromHome) * PATROL_SPEED);
      } else if (Math.random() < 0.35) {
        body.setVelocity(0, 0);
      } else {
        const a = Math.random() * Math.PI * 2;
        body.setVelocity(Math.cos(a) * PATROL_SPEED, Math.sin(a) * PATROL_SPEED);
      }
      if (Math.abs(body.velocity.x) > 1) e.sprite.setFlipX(body.velocity.x < 0);
    }
    const moving = Math.abs(body.velocity.x) > 5 || Math.abs(body.velocity.y) > 5;
    this.playAnim(e, moving ? 'run' : 'idle');
  }

  // ───────────────────────── 攻击流程 ─────────────────────────

  /** 攻击落点半径（圆形预警用） */
  private strikeRadius(e: WorldEntity): number {
    const s = e.tier === 'boss' ? 2.0 : e.tier === 'elite' ? 1.35 : 1;
    switch (e.kind) {
      case 'slammer': return 185 * s;
      case 'brute': return 135 * s;
      case 'swift': return 115 * s;
      default: return 130 * s;
    }
  }

  private beginAttack(e: WorldEntity, windup: number, nx: number, ny: number): void {
    const body = e.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    e.phase = 'windup';
    // 蓄力整体偏短，留给玩家的反应窗口更紧
    e.phaseDuration = windup * 1.2 * (e.enraged ? 0.85 : 1);
    e.phaseTimer = e.phaseDuration;
    e.dirX = nx;
    e.dirY = ny;
    e.strikeHit = false;
    e.sprite.setFlipX(nx < 0);

    // 动作
    const animName = e.kind === 'caster' ? 'magic' : 'atk';
    const key = `${e.atlasKey}_${animName}`;
    if (e.atlasKey && this.scene.anims.exists(key)) {
      e.sprite.play(key, true);
      // 6 帧 @12fps = 500ms，压到蓄力时长内
      e.sprite.anims.timeScale = Math.max(0.5, 500 / (e.phaseDuration + 120));
    }

    // 蓄力：身体下沉蓄劲
    this.fx.stretchTo(e.sprite, e.baseScale, 0.9, 1.1, e.phaseDuration);

    // 预警：外框一开始就标出完整范围，内部填充随蓄力涨满；涨满即出手
    const footY = e.sprite.y + 30;
    if (e.kind === 'charger' && e.tier !== 'boss') {
      const len = 470, wid = 76;
      if (!(e.tele instanceof Phaser.GameObjects.Rectangle)) {
        e.tele?.destroy();
        e.teleEdge?.destroy();
        e.tele = this.scene.add.rectangle(0, 0, len, wid, TELE_COLOR, 1).setOrigin(0, 0.5).setDepth(TELE_DEPTH);
        e.teleEdge = this.scene.add.rectangle(0, 0, len, wid, TELE_COLOR, 0.14).setOrigin(0, 0.5)
          .setStrokeStyle(5, TELE_EDGE, 1).setDepth(TELE_DEPTH + 1);
      }
      const rot = Math.atan2(ny, nx);
      e.tele.setPosition(e.sprite.x, footY - 10).setRotation(rot).setVisible(true).setAlpha(0.45).setScale(0.02, 1);
      e.teleEdge!.setPosition(e.sprite.x, footY - 10).setRotation(rot).setVisible(true).setAlpha(1);
    } else {
      if (!(e.tele instanceof Phaser.GameObjects.Image)) {
        e.tele?.destroy();
        e.teleEdge?.destroy();
        e.tele = this.scene.add.image(0, 0, 'fx_disc').setTint(TELE_COLOR).setDepth(TELE_DEPTH);
        e.teleEdge = this.scene.add.image(0, 0, 'fx_ring').setTint(TELE_EDGE).setDepth(TELE_DEPTH + 1);
      }
      const full = (this.teleRadius(e) * 2) / 256;
      e.tele.setPosition(e.sprite.x, footY).setVisible(true).setAlpha(0.5).setScale(full * 0.05);
      e.teleEdge!.setPosition(e.sprite.x, footY).setVisible(true).setAlpha(1).setScale(full * 1.06);
    }
  }

  /** 预警圈半径：近身 / 震地是真实的命中范围；赤狐精只是施法提示 */
  private teleRadius(e: WorldEntity): number {
    return e.kind === 'caster' && e.tier !== 'boss' ? 62 : this.strikeRadius(e);
  }

  private endAttack(e: WorldEntity): void {
    e.phase = 'idle';
    e.phaseTimer = 0;
    e.tele?.setVisible(false);
    e.teleEdge?.setVisible(false);
    // 被打断（硬直）时把蓄力的形变还原
    if (e.sprite.scaleX !== e.baseScale) this.fx.squash(e.sprite, e.baseScale, e.sprite.scaleX / e.baseScale, e.sprite.scaleY / e.baseScale, 120);
    e.sprite.anims.timeScale = 1;
  }

  private updateAttack(
    e: WorldEntity, delta: number, body: Phaser.Physics.Arcade.Body,
    dist: number, nx: number, ny: number, player: Phaser.Physics.Arcade.Sprite,
  ): void {
    e.phaseTimer -= delta;

    if (e.phase === 'windup') {
      body.setVelocity(0, 0);
      const t = 1 - Math.max(0, e.phaseTimer) / e.phaseDuration;
      // 预警随蓄力涨满；最后 150ms 整体爆闪，提示"就是现在"
      if (e.tele?.visible) {
        const flash = e.phaseTimer < 150 && Math.floor(e.phaseTimer / 50) % 2 === 0;
        if (e.tele instanceof Phaser.GameObjects.Rectangle) {
          e.tele.setScale(Math.max(0.02, t), 1).setAlpha(flash ? 0.9 : 0.4 + 0.3 * t);
        } else {
          const full = (this.teleRadius(e) * 2) / 256;
          e.tele.setScale(full * Math.max(0.05, t)).setAlpha(flash ? 1 : 0.5 + 0.4 * t);
        }
        const col = flash ? 0xffffff : TELE_COLOR;
        if (e.tele instanceof Phaser.GameObjects.Rectangle) e.tele.setFillStyle(col, 1);
        else e.tele.setTint(col);
        e.teleEdge?.setAlpha(0.75 + 0.25 * Math.sin(e.phaseTimer / 45));
      }
      if (e.phaseTimer > 0) return;

      // —— 出手 ——（前扑拉长再弹回）
      this.fx.squash(e.sprite, e.baseScale, 1.26, 0.8, 260);
      e.tele?.setVisible(false);
      e.teleEdge?.setVisible(false);
      if (e.kind === 'charger' && e.tier !== 'boss') {
        e.phase = 'strike';
        e.phaseTimer = 400;
        this.fx.flashGlow(e.sprite.x, e.sprite.y, 80, WX_TINT[e.wuxing], 200);
        return;
      }
      if (e.kind === 'caster' && e.tier !== 'boss') {
        // 朝残魂当前位置吐火
        const sx = e.sprite.x + nx * 40, sy = e.sprite.y - 20;
        const a = Math.atan2(player.y - sy, player.x - sx);
        const shots = e.tier === 'elite' ? [-0.28, 0, 0.28] : [0];
        shots.forEach(off => {
          this.combat.spawnEnemyBolt(e, sx, sy, Math.cos(a + off), Math.sin(a + off), 520, 1.4);
        });
        this.fx.flashGlow(sx, sy, 60, WX_TINT[e.wuxing], 200);
        e.phase = 'recover';
        e.phaseTimer = 250;
        e.cooldown = e.enraged ? 2000 : 2900;
        return;
      }

      // 近身 / 震地：落点判定
      const radius = this.strikeRadius(e);
      const tx = e.sprite.x, ty = e.sprite.y + 30;
      const hitDist = Phaser.Math.Distance.Between(tx, ty, player.x, player.y);
      const heavy = e.kind === 'slammer' || e.tier !== 'normal';
      if (hitDist < 900) sfx.slam();
      this.fx.ring(tx, ty, radius, heavy ? 0xffc27a : TELE_COLOR, heavy ? 360 : 240, 0.5);
      if (heavy) {
        this.fx.burst(tx, ty, 0xc9a06a, 14);
        this.fx.radial(tx, ty, radius * 0.9, 0xc9a06a, 18);
        if (hitDist < 700) this.fx.shake(0.005, 120);
      }
      // 出手动作：朝残魂扑出一小步，并划出一道斩击弧
      const la = Math.atan2(player.y - e.sprite.y, player.x - e.sprite.x);
      if (e.tier !== 'boss') {
        e.knockX = Math.cos(la) * 300;
        e.knockY = Math.sin(la) * 300;
        e.knockTimer = 90;
      }
      this.fx.slash(e.sprite.x + Math.cos(la) * radius * 0.45, e.sprite.y + Math.sin(la) * radius * 0.45, la, radius * 1.5, heavy ? 0xffc27a : 0xff6a5a);
      if (hitDist < radius) {
        this.combat.enemyStrikePlayer(e, e.kind === 'slammer' ? 2.0 : e.kind === 'swift' ? 1.2 : 1.5, e.kind === 'swift' ? 1400 : 0);
      }
      e.phase = 'recover';
      // 出手后的收招硬直：这是反击的窗口
      e.phaseTimer = e.kind === 'swift' ? 380 : 650;
      e.cooldown = (e.kind === 'slammer' ? 3200 : e.kind === 'swift' ? 1500 : 2200) * (e.enraged ? 0.75 : 1);
      return;
    }

    if (e.phase === 'strike') {
      // 獠牙怪冲锋：沿锁定方向直线突进，擦到就算命中
      const speed = 860;
      body.setVelocity(e.dirX * speed, e.dirY * speed);
      if (!e.strikeHit && dist < 78) {
        e.strikeHit = true;
        this.combat.enemyStrikePlayer(e, 1.7);
      }
      if (Math.random() < 0.5) this.fx.afterimage(e.sprite, WX_TINT[e.wuxing]);
      if (e.phaseTimer <= 0 || body.blocked.none === false) {
        body.setVelocity(0, 0);
        e.phase = 'recover';
        e.phaseTimer = 800;
        e.cooldown = e.enraged ? 2400 : 3400;
      }
      return;
    }

    // recover（出手瞬间的前扑在这里走完）
    if (e.knockTimer > 0) {
      e.knockTimer -= delta;
      body.setVelocity(e.knockX, e.knockY);
    } else {
      body.setVelocity(0, 0);
    }
    if (e.phaseTimer <= 0) this.endAttack(e);
  }

  // ───────────────────────── 病变核心 ─────────────────────────

  private updateBoss(
    e: WorldEntity, delta: number, body: Phaser.Physics.Arcade.Body,
    dist: number, nx: number, ny: number, speed: number, player: Phaser.Physics.Arcade.Sprite,
  ): void {
    void player;
    const hpPct = e.combatant.hp / e.combatant.maxHp;
    const fury = hpPct < 0.5;

    // 环形弹幕
    e.bossBurstTimer -= delta;
    if (e.bossBurstTimer <= 0) {
      e.bossBurstTimer = fury ? 3400 : 4800;
      const n = fury ? 18 : 12;
      const offset = Math.random() * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const a = offset + (k / n) * Math.PI * 2;
        this.combat.spawnEnemyBolt(e, e.sprite.x, e.sprite.y, Math.cos(a), Math.sin(a), fury ? 330 : 280);
      }
      this.fx.ring(e.sprite.x, e.sprite.y, 240, WX_TINT[e.wuxing], 500);
      this.fx.flashGlow(e.sprite.x, e.sprite.y, 260, 0xc9a0ff, 400, 0.7);
    }

    // 召唤爪牙
    e.bossSummonTimer -= delta;
    if (e.bossSummonTimer <= 0) {
      e.bossSummonTimer = fury ? 8000 : 11000;
      this.spawnSystem.spawnMinions(e.sprite.x, e.sprite.y, fury ? 2 : 1, this.round, e.wuxing);
    }

    // 逼近并震地
    if (dist < 230 && e.cooldown <= 0) {
      this.beginAttack(e, 900, nx, ny);
      return;
    }
    if (dist > 160) body.setVelocity(nx * speed, ny * speed);
    else body.setVelocity(0, 0);
    const moving = Math.abs(body.velocity.x) > 5 || Math.abs(body.velocity.y) > 5;
    this.playAnim(e, moving ? 'run' : 'idle');
  }

  // ───────────────────────── 动画 ─────────────────────────

  private playAnim(e: WorldEntity, name: 'run' | 'idle'): void {
    if (!e.atlasKey) return;
    const key = `${e.atlasKey}_${name}`;
    const cur = e.sprite.anims.currentAnim?.key;
    if (cur === key) return;
    // 受击动画播完再切
    if (cur === `${e.atlasKey}_hurt` && e.sprite.anims.isPlaying) return;
    if (!this.scene.anims.exists(key)) return;
    e.sprite.play(key, true);
    e.sprite.anims.timeScale = 1;
  }
}
