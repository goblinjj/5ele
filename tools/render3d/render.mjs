// 用法：node tools/render3d/render.mjs <角色名> [--sheet <输出目录>]
//   默认：按 chars.json 渲染出 atlas.webp + atlas.json
//   --sheet：每个动作均匀取 16 帧拼成一张带时间标注的预览图，用来挑选动作区间
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const name = process.argv[2];
const sheetDir = process.argv.includes('--sheet') ? process.argv[process.argv.indexOf('--sheet') + 1] : null;
const lineup = process.argv.includes('--lineup');
const all = JSON.parse(fs.readFileSync(path.join(HERE, 'chars.json'), 'utf8'));
// 临时配置（挑动作时用）：EXTRA=<json 文件>
if (process.env.EXTRA) Object.assign(all, JSON.parse(fs.readFileSync(process.env.EXTRA, 'utf8')));
const resolve = n => all[n] && { ...(all[n].base ? resolve(all[n].base) : {}), ...all[n] };
const cfg = lineup ? all.hero : resolve(name);
if (!cfg) { console.error('chars.json 里没有这个角色：' + name); process.exit(1); }
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const srv = http.createServer((req, res) => {
  const p = path.normalize(path.join(ROOT, decodeURIComponent(req.url.split('?')[0])));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript' }[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(`http://127.0.0.1:${port}/tools/render3d/page.html`);
  await page.waitForFunction('window.ready === true');
  const info = await page.evaluate(c => window.setup(c), { ...cfg, base: `/${cfg.dir}/` });
  console.log(JSON.stringify(info));
  const save = async (file, bg) => { const url = await page.evaluate(b => window.finish(b), bg); fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64')); };

  if (lineup) {
    // 把 model/ 里所有带蒙皮的模型各摆 4 个姿势排成一张图，用来挑角色
    const dir = path.join(ROOT, cfg.dir);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.fbx') && fs.statSync(path.join(dir, f)).size > 2e6).sort();
    const shots = [['Idle.fbx', 0.5], ['Running.fbx', 0.2], ['Sword And Shield Slash.fbx', 0.6], ['Standing 2H Cast Spell 01.fbx', 1.5], ['Falling Back Death.fbx', 1.0]];
    const clips = Object.fromEntries(shots.map(([f]) => [f, { file: f }]));
    const urls = [];
    for (const skin of files) {
      await page.goto(`http://127.0.0.1:${port}/tools/render3d/page.html`);
      await page.waitForFunction('window.ready === true');
      try {
        const inf = await page.evaluate(c => window.setup(c), { ...cfg, height: 0, zoom: 0.8, skin, clips, base: `/${cfg.dir}/` });
        await page.evaluate((n) => window.begin(n, 1), shots.length);
        for (let i = 0; i < shots.length; i++) await page.evaluate((f, t, c) => { window.draw(f, t, null, c, 0); }, shots[i][0], shots[i][1], i);
        await page.evaluate((l) => window.label(l, 0, 0), `${skin}  h=${inf.height.toFixed(0)}`);
        urls.push(await page.evaluate(() => window.finish('#3a4350')));
        console.log(skin, inf.height.toFixed(1), JSON.stringify(inf.maps));
      } catch (e) { console.log(skin, 'FAILED', String(e).slice(0, 200)); }
    }
    const per = 5;
    for (let k = 0; k * per < urls.length; k++) {
      const part = urls.slice(k * per, k * per + per);
      const out = await page.evaluate(async (list, w, h) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h * list.length; const x = c.getContext('2d');
        for (let i = 0; i < list.length; i++) { const im = new Image(); im.src = list[i]; await im.decode(); x.drawImage(im, 0, i * h); }
        return c.toDataURL('image/png');
      }, part, cfg.cell * shots.length, cfg.cell);
      fs.mkdirSync(sheetDir, { recursive: true });
      fs.writeFileSync(path.join(sheetDir, `lineup_${k}.png`), Buffer.from(out.split(',')[1], 'base64'));
    }
  } else if (sheetDir) {

    fs.mkdirSync(sheetDir, { recursive: true });
    // 每段动作一行、均匀取 8 帧，标上时间
    const entries = Object.entries(cfg.clips), n = 8;
    await page.evaluate((c, r) => window.begin(c, r), n, entries.length);
    for (let r = 0; r < entries.length; r++) {
      const [clip, def] = entries[r], dur = info.durations[def.file];
      for (let i = 0; i < n; i++) {
        const t = dur * i / n;
        await page.evaluate((f, t, k, c, r, l) => { window.draw(f, t, k, c, r); window.label(l, c, r); }, def.file, t, def.keep ?? null, i, r, (i ? '' : clip + ' ') + t.toFixed(2));
      }
      console.log(clip, def.file, dur.toFixed(2) + 's');
    }
    await save(path.join(sheetDir, `${name}.png`), '#3a4350');
  } else {
    const list = [];
    for (const [clip, def] of Object.entries(cfg.clips)) {
      const dur = info.durations[def.file];
      const from = def.from ?? 0, to = def.to ?? dur;
      for (let i = 0; i < def.frames; i++) {
        // 循环动作首尾相接，不取终点；一次性动作取满首尾
        const k = def.pingpong ? 1 - Math.abs(1 - 2 * i / def.frames) : def.loop && !def.yoyo ? i / def.frames : i / (def.frames - 1);
        list.push({ clip, i, file: def.file, t: from + (to - from) * k, keep: def.keep ?? null, from, to });
      }
    }
    const hands = [];
    for (const f of list) hands.push(await page.evaluate((file, t, k, a, b) => window.capture(file, t, k, a, b), f.file, f.t, f.keep, f.from, f.to));
    const packed = await page.evaluate(w => window.pack(w), cfg.atlasWidth ?? 2048);
    const frames = {};
    const prefix = cfg.prefix ?? '';
    list.forEach((f, n) => {
      const r = packed.rects[n];
      const fr = { frame: { x: r.x, y: r.y, w: r.w, h: r.h }, rotated: false, trimmed: true, spriteSourceSize: { x: r.sx, y: r.sy, w: r.w, h: r.h }, sourceSize: { w: cfg.cell, h: cfg.cell } };
      if (hands[n]) fr.hand = hands[n];
      frames[`${prefix}${f.clip}_${f.i}`] = fr;
    });
    const out = path.join(ROOT, cfg.out);
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'atlas.webp'), Buffer.from(packed.url.split(',')[1], 'base64'));
    // 脚底在单元格里的位置：模型原点投影
    const footY = (0.5 + (cfg.centerY * Math.cos(cfg.pitch * Math.PI / 180)) / (2 * cfg.zoom)) * cfg.cell;
    const clips = Object.fromEntries(Object.entries(cfg.clips).map(([k, d]) => [k, { frames: d.frames, ms: d.ms, loop: !!d.loop, yoyo: !!d.yoyo }]));
    fs.writeFileSync(path.join(out, 'atlas.json'), JSON.stringify({ frames, meta: { image: 'atlas.webp', size: { w: packed.w, h: packed.h }, scale: 1 }, char: { cell: cfg.cell, footX: cfg.cell / 2, footY: Math.round(footY * 10) / 10, heightPx: Math.round(cfg.cell / (2 * cfg.zoom) * 10) / 10, clips } }));
    console.log(`${list.length} 帧 → ${path.join(cfg.out, 'atlas.webp')} (${packed.w}×${packed.h})`);
  }
} finally { await browser.close(); srv.close(); }
