import Phaser from 'phaser';
import { isLowQuality } from '../../config/gameConfig.js';

/**
 * 技能与妖异攻击的特效：片元着色器
 *
 * 每种特效是一段 GLSL，画在一块正方形上，由 progress（0→1）驱动整段演出。
 * 噪声火舌、冰晶、藤蔓这类「会流动」的图案用贴图序列帧做不出来，用着色器逐像素算。
 *
 *  - 着色器在创建对象时才编译，手机上会卡一下，所以进秘境时先各建一个预热，之后复用对象池
 *  - 输出是预乘过的颜色、alpha 很低：叠在画面上是发光的加色效果
 *  - 只在 WebGL 且画质为「高清」时启用；否则 play 什么也不做，场景里原有的贴图特效照常
 */

export type ShaderKind = 'fire' | 'blast' | 'frost' | 'bloom' | 'bastion' | 'blade'
  | 'warnCircle' | 'warnLane' | 'impact' | 'claw' | 'wisp';

const HEAD = `
precision mediump float;
uniform float progress;
uniform float seed;
// 染色（妖异攻击按五行 / 危险色染；技能特效自带配色，不用它）
uniform vec3 color;
// 这段特效已经播了多少秒（不用全局时间：数值大了手机上精度不够，噪声会抖）
uniform float life;
#define T (progress * life)
varying vec2 outTexCoord;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}
float easeOut(float t) { return 1.0 - pow(1.0 - t, 3.0); }
`;

const SRC: Record<ShaderKind, string> = {
  // 燎原：一圈向外翻卷的火浪，圈内留下渐熄的余烬
  fire: HEAD + `
void main() {
  vec2 p = (outTexCoord - 0.5) * 2.0;
  float r = length(p);
  vec2 dir = p / max(r, 0.001);
  float R = mix(0.12, 0.9, easeOut(progress));
  float n = fbm(dir * 2.6 + vec2(r * 3.5 - T * 2.2, seed));
  float n2 = fbm(dir * 6.0 - vec2(T * 3.0, r * 5.0 + seed));
  float edge = r - R + (n - 0.5) * 0.24;
  float front = smoothstep(0.11, 0.0, abs(edge)) * (0.6 + n2);
  float tongues = smoothstep(0.0, -0.32, edge) * smoothstep(-0.5, -0.05, edge) * n2 * 1.3;
  float embers = smoothstep(R, 0.0, r) * pow(n2, 3.0) * 1.6 * (1.0 - progress);
  float fade = 1.0 - smoothstep(0.55, 1.0, progress);
  float I = (front * 1.6 + tongues + embers) * fade * smoothstep(1.0, 0.9, r);
  vec3 col = mix(vec3(0.75, 0.08, 0.02), vec3(1.0, 0.45, 0.08), smoothstep(0.1, 0.8, I));
  col = mix(col, vec3(1.0, 0.92, 0.6), smoothstep(0.9, 1.8, I));
  gl_FragColor = vec4(col * I, I * 0.22);
}`,

  // 焚天：落地的爆裂——白热的核心、放射的火舌、冲击波
  blast: HEAD + `
void main() {
  vec2 p = (outTexCoord - 0.5) * 2.0;
  float r = length(p);
  vec2 dir = p / max(r, 0.001);
  float e = easeOut(progress);
  float R = mix(0.05, 0.92, e);
  float rays = pow(fbm(dir * 3.2 + seed), 2.0) * 3.0;
  float reach = mix(0.25, 1.0, e);
  float burst = rays * smoothstep(reach, 0.0, r) * (1.0 - progress);
  float core = exp(-r * mix(3.0, 9.0, progress)) * (1.0 - progress) * 2.4;
  float shock = smoothstep(0.07, 0.0, abs(r - R)) * (1.0 - progress) * 1.8;
  float smoke = fbm(p * 3.0 + vec2(seed, T * 1.2)) * smoothstep(R, R * 0.3, r) * (1.0 - progress) * 0.7;
  float I = (burst + core + shock + smoke) * smoothstep(1.0, 0.88, r);
  vec3 col = mix(vec3(0.8, 0.12, 0.02), vec3(1.0, 0.55, 0.12), smoothstep(0.1, 0.9, I));
  col = mix(col, vec3(1.0, 0.97, 0.85), smoothstep(1.0, 2.2, I));
  gl_FragColor = vec4(col * I, I * 0.25);
}`,

  // 寒潮：六出冰晶向外疾长，霜气贴地铺开后缓缓化去
  frost: HEAD + `
void main() {
  vec2 p = (outTexCoord - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float grow = easeOut(min(1.0, progress * 2.6));
  float R = mix(0.08, 0.92, grow);
  float fade = 1.0 - smoothstep(0.45, 1.0, progress);
  // 六条主枝 + 侧枝
  float arm = pow(abs(cos(a * 3.0)), 260.0);
  float twig = pow(abs(cos(a * 3.0 + sin(r * 26.0) * 0.5)), 14.0) * step(0.5, fract(r * 7.0 + seed));
  float crystal = (arm * 1.1 + twig * 0.6) * smoothstep(R, R - 0.25, r) * smoothstep(0.0, 0.1, r);
  // 冰面：尖锐的晶格纹
  vec2 g = p * 7.0 + seed;
  float cell = abs(noise(g) - noise(g + 0.37)) ;
  float shards = smoothstep(0.05, 0.0, cell) * smoothstep(R, R - 0.4, r) * 0.6;
  float front = smoothstep(0.06, 0.0, abs(r - R)) * 1.6 * (1.0 - grow * 0.6);
  float mist = fbm(p * 2.5 - T * 0.6 + seed) * smoothstep(R, 0.0, r) * 0.45;
  float I = (crystal + shards + front + mist) * fade * smoothstep(1.0, 0.9, r);
  vec3 col = mix(vec3(0.12, 0.35, 0.85), vec3(0.55, 0.9, 1.0), smoothstep(0.1, 0.9, I));
  col = mix(col, vec3(1.0), smoothstep(1.0, 2.0, I));
  gl_FragColor = vec4(col * I, I * 0.2);
}`,

  // 回春：旋转上升的藤蔓光带与飘散的花瓣光点
  bloom: HEAD + `
void main() {
  vec2 p = (outTexCoord - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float e = easeOut(progress);
  float fade = sin(progress * 3.14159);
  float swirl = a + r * 5.0 - progress * 7.0;
  float vines = smoothstep(0.55, 1.0, cos(swirl * 3.0)) * smoothstep(1.0, 0.15, r) * smoothstep(0.02, 0.2, r);
  float petals = pow(max(0.0, cos(swirl * 5.0 + 1.3)), 10.0) * step(0.55, noise(vec2(a * 4.0, r * 9.0 - progress * 6.0 + seed)));
  float ringR = mix(0.1, 0.9, e);
  float wave = smoothstep(0.05, 0.0, abs(r - ringR)) * 1.2;
  float heart = exp(-r * 4.5) * 1.3;
  float I = (vines * 0.9 + petals * 1.4 + wave + heart) * fade * smoothstep(1.0, 0.9, r);
  vec3 col = mix(vec3(0.08, 0.55, 0.22), vec3(0.45, 1.0, 0.55), smoothstep(0.1, 0.9, I));
  col = mix(col, vec3(1.0, 0.98, 0.7), smoothstep(0.9, 1.9, I) + petals * 0.4);
  gl_FragColor = vec4(col * I, I * 0.18);
}`,

  // 磐石：六角晶格的护罩，边缘发亮，罩面有流动的土黄光纹；progress 控制淡入淡出
  bastion: HEAD + `
float hexEdge(vec2 p) {
  p = abs(vec2(p.x * 1.1547, p.y + p.x * 0.57735));
  vec2 f = fract(p) - 0.5;
  return max(abs(f.x), abs(f.y));
}
void main() {
  vec2 p = (outTexCoord - 0.5) * 2.0;
  float r = length(p);
  float appear = smoothstep(0.0, 0.08, progress) * (1.0 - smoothstep(0.88, 1.0, progress));
  float dome = smoothstep(0.92, 0.86, r);
  // 球面感：越靠边格子越挤
  vec2 sp = p * (1.0 + r * r * 0.9) * 4.2;
  float cells = smoothstep(0.40, 0.5, hexEdge(sp));
  float rim = pow(smoothstep(0.45, 0.9, r), 3.0) * 1.5;
  float flow = fbm(sp * 0.5 + vec2(0.0, T * 1.5)) ;
  float pulse = 0.75 + 0.25 * sin(T * 6.0 + r * 6.0);
  // 起手的一圈震波
  float shock = smoothstep(0.06, 0.0, abs(r - progress * 9.0)) * 2.0;
  float I = ((cells * (0.35 + flow * 0.9) + rim) * pulse + shock) * dome * appear;
  vec3 col = mix(vec3(0.55, 0.36, 0.08), vec3(1.0, 0.8, 0.3), smoothstep(0.1, 1.0, I));
  col = mix(col, vec3(1.0, 0.97, 0.8), smoothstep(1.1, 2.0, I));
  gl_FragColor = vec4(col * I, I * 0.14);
}`,

  // 万剑：一道疾掠的剑气——细长的白芒，拖着金色的锋尾
  blade: HEAD + `
void main() {
  vec2 p = (outTexCoord - 0.5) * 2.0;
  float head = mix(-1.1, 1.2, easeOut(progress));
  float tail = head - mix(0.5, 1.4, progress);
  float along = smoothstep(tail, head - 0.05, p.x) * smoothstep(head + 0.04, head - 0.02, p.x);
  float taper = mix(0.006, 0.035, smoothstep(tail, head, p.x));
  float core = exp(-pow(p.y / taper, 2.0));
  float halo = exp(-pow(p.y / (taper * 3.5), 2.0)) * 0.4;
  float flick = 0.8 + 0.2 * noise(vec2(p.x * 14.0 + seed, T * 20.0));
  float fade = 1.0 - smoothstep(0.7, 1.0, progress);
  float I = (core * 1.8 + halo) * along * flick * fade;
  vec3 col = mix(vec3(1.0, 0.75, 0.3), vec3(1.0), smoothstep(0.5, 1.6, I));
  gl_FragColor = vec4(col * I, I * 0.2);
}`,

  // ── 妖异的攻击：小而精，不抢技能的戏 ──

  // 圆形预警：细环 + 一圈缓缓转动的刻度，内里一层薄雾随蓄力铺满，出手前一闪
  warnCircle: HEAD + `
void main() {
  vec2 p = (outTexCoord - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float flash = smoothstep(0.86, 1.0, progress);
  float rim = smoothstep(0.022, 0.0, abs(r - 0.9));
  float ticks = step(0.55, fract(a / 6.2832 * 24.0 + T * 0.25)) * smoothstep(0.03, 0.0, abs(r - 0.82)) * 0.7;
  float fillR = 0.88 * progress;
  float edge = smoothstep(0.03, 0.0, abs(r - fillR)) * 0.9;
  float haze = smoothstep(fillR, fillR - 0.25, r) * (0.10 + 0.10 * noise(p * 5.0 + T * 0.8 + seed));
  float appear = smoothstep(0.0, 0.08, progress);
  float I = (rim * 0.9 + ticks + edge + haze) * appear + flash * smoothstep(0.92, 0.6, r) * 0.9;
  vec3 col = mix(color, vec3(1.0, 0.95, 0.9), flash * 0.8 + rim * 0.25);
  gl_FragColor = vec4(col * I, I * 0.25);
}`,

  // 冲锋预警：两条细边线，箭纹顺着冲锋方向流动，随蓄力从起点铺到终点
  warnLane: HEAD + `
void main() {
  vec2 uv = outTexCoord;
  float y = abs(uv.y - 0.5) * 2.0;
  float flash = smoothstep(0.86, 1.0, progress);
  float border = smoothstep(0.08, 0.0, abs(y - 0.92)) * 0.9;
  float ends = smoothstep(0.012, 0.0, abs(uv.x - 0.994)) * step(y, 0.92) * 0.7;
  float chev = step(0.62, fract(uv.x * 7.0 - y * 0.8 - T * 2.2));
  float reach = smoothstep(progress + 0.02, progress - 0.05, uv.x);
  float lane = step(y, 0.9) * (chev * 0.42 + 0.08) * reach;
  float tip = smoothstep(0.03, 0.0, abs(uv.x - progress)) * step(y, 0.9) * 0.8;
  float appear = smoothstep(0.0, 0.08, progress);
  float I = (border + ends + lane + tip) * appear + flash * step(y, 0.92) * 0.8;
  vec3 col = mix(color, vec3(1.0, 0.95, 0.9), flash * 0.8 + border * 0.2);
  gl_FragColor = vec4(col * I, I * 0.25);
}`,

  // 落地：一圈极细的震波，几道裂纹一闪即逝
  impact: HEAD + `
void main() {
  vec2 p = (outTexCoord - 0.5) * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float R = mix(0.25, 0.92, easeOut(progress));
  float fade = 1.0 - progress;
  float ring = smoothstep(0.035, 0.0, abs(r - R)) * 1.4;
  float cracks = pow(abs(cos(a * 3.5 + seed)), 70.0) * smoothstep(R, R * 0.2, r) * smoothstep(0.05, 0.2, r);
  float dust = noise(p * 6.0 + seed) * smoothstep(R, R - 0.3, r) * 0.25;
  float I = (ring + cracks * 1.1 + dust) * fade * fade;
  vec3 col = mix(color, vec3(1.0), smoothstep(0.7, 1.6, I));
  gl_FragColor = vec4(col * I, I * 0.2);
}`,

  // 爪痕：三道微弯的细痕，自上而下划过
  claw: HEAD + `
void main() {
  vec2 p = (outTexCoord - 0.5) * 2.0;
  float sweep = mix(-1.2, 1.3, easeOut(min(1.0, progress * 1.8)));
  float fade = 1.0 - smoothstep(0.45, 1.0, progress);
  float I = 0.0;
  for (int i = -1; i <= 1; i++) {
    float fi = float(i);
    float cy = fi * 0.34 + 0.22 * p.x * p.x - 0.08;
    float len = 0.85 - abs(fi) * 0.18;
    float w = 0.035 * smoothstep(len, 0.0, abs(p.x)) + 0.004;
    float line = exp(-pow((p.y - cy) / w, 2.0)) * smoothstep(len, len - 0.3, abs(p.x));
    I += line * smoothstep(sweep + 0.02, sweep - 0.5, p.x);
  }
  I *= fade;
  vec3 col = mix(color, vec3(1.0), smoothstep(0.5, 1.2, I));
  gl_FragColor = vec4(col * I * 1.6, I * 0.3);
}`,

  // 妖异的弹道：一点亮芯，拖一缕会抖的尾焰；朝 +x 飞
  wisp: HEAD + `
void main() {
  vec2 p = (outTexCoord - 0.5) * 2.0;
  vec2 h = p - vec2(0.55, 0.0);
  float head = exp(-dot(h, h) * 38.0) * 1.8;
  float halo = exp(-dot(h, h) * 7.0) * 0.5;
  float back = clamp((0.55 - p.x) / 1.5, 0.0, 1.0);
  float wob = (noise(vec2(p.x * 5.0 + T * 9.0, seed)) - 0.5) * 0.22 * back;
  float w = mix(0.16, 0.02, back);
  float tail = exp(-pow((p.y - wob) / w, 2.0)) * (1.0 - back) * step(p.x, 0.55) * (0.6 + 0.4 * noise(vec2(p.x * 9.0 - T * 14.0, seed + 3.0)));
  float I = (head + halo + tail * 0.9) * smoothstep(0.0, 0.05, progress);
  vec3 col = mix(color, vec3(1.0, 0.98, 0.9), smoothstep(0.7, 1.6, I));
  gl_FragColor = vec4(col * I, I * 0.25);
}`,
};

export interface Live {
  obj: Phaser.GameObjects.Shader;
  kind: ShaderKind;
  t: number;
  dur: number;
  follow?: () => { x: number; y: number };
  done?: boolean;
}

/** 着色器对象画在这么大的方块上，用缩放适配实际尺寸 */
const BASE = 256;

export class SkillShader {
  private scene: Phaser.Scene;
  readonly enabled: boolean;
  private pool = new Map<ShaderKind, Phaser.GameObjects.Shader[]>();
  private live: Live[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.enabled = scene.game.renderer.type === Phaser.WEBGL && !isLowQuality();
    if (!this.enabled) return;
    // 预热：每种先建一个，把编译的卡顿放在进场时
    (Object.keys(SRC) as ShaderKind[]).forEach(kind => this.release(kind, this.make(kind)));
  }

  private make(kind: ShaderKind): Phaser.GameObjects.Shader {
    const base = new Phaser.Display.BaseShader(`skill_${kind}`, SRC[kind], undefined, {
      progress: { type: '1f', value: 0 },
      seed: { type: '1f', value: 0 },
      life: { type: '1f', value: 1 },
      color: { type: '3f', value: { x: 1, y: 1, z: 1 } },
    });
    return this.scene.add.shader(base, 0, 0, BASE, BASE).setVisible(false).setActive(false);
  }

  private release(kind: ShaderKind, obj: Phaser.GameObjects.Shader): void {
    obj.setVisible(false).setActive(false);
    let list = this.pool.get(kind);
    if (!list) { list = []; this.pool.set(kind, list); }
    list.push(obj);
  }

  /**
   * 播放一段特效
   * @param size 方块边长（世界坐标）；圆形特效的直径约为它的 0.9
   * @param follow 每帧取位置（护罩跟着人走）
   * @param opts sizeY：非正方形时的另一边；color：染色
   * @returns 句柄，可交给 stop 提前收掉；着色器不可用时返回 null
   */
  play(
    kind: ShaderKind, x: number, y: number, size: number, dur: number, depth: number, rotation: number = 0,
    follow?: () => { x: number; y: number }, opts?: { sizeY?: number; color?: number },
  ): Live | null {
    if (!this.enabled) return null;
    const obj = this.pool.get(kind)?.pop() ?? this.make(kind);
    obj.setPosition(x, y).setScale(size / BASE, (opts?.sizeY ?? size) / BASE).setRotation(rotation).setDepth(depth).setVisible(true).setActive(true);
    obj.setUniform('progress.value', 0);
    obj.setUniform('seed.value', Math.random() * 40);
    obj.setUniform('life.value', dur / 1000);
    const c = opts?.color ?? 0xffffff;
    obj.setUniform('color.value.x', ((c >> 16) & 255) / 255);
    obj.setUniform('color.value.y', ((c >> 8) & 255) / 255);
    obj.setUniform('color.value.z', (c & 255) / 255);
    const live: Live = { obj, kind, t: 0, dur, follow };
    this.live.push(live);
    return live;
  }

  /** 提前收掉一段特效（预警被打断、弹道命中） */
  stop(live: Live | null | undefined): void {
    if (live) live.done = true;
  }

  update(dt: number): void {
    if (!this.live.length) return;
    this.live = this.live.filter(l => {
      l.t += dt;
      if (l.done || l.t >= l.dur) { this.release(l.kind, l.obj); return false; }
      l.obj.setUniform('progress.value', l.t / l.dur);
      if (l.follow) { const p = l.follow(); l.obj.setPosition(p.x, p.y); }
      return true;
    });
  }
}
