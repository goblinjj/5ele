// 用法：node tools/render3d/render.mjs <角色名> [--sheet <输出目录>]
//   默认：按 chars.json 渲染出 atlas.png + atlas.json
//   --sheet：每个动作均匀取 16 帧拼成一张带时间标注的预览图，用来挑选动作区间
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const name = process.argv[2];
const sheetDir = process.argv.includes('--sheet') ? process.argv[process.argv.indexOf('--sheet') + 1] : null;
const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'chars.json'), 'utf8'))[name];
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

  if (sheetDir) {
    fs.mkdirSync(sheetDir, { recursive: true });
    for (const [clip, def] of Object.entries(cfg.clips)) {
      const dur = info.durations[def.file], n = 16;
      await page.evaluate(() => window.begin(8, 2));
      for (let i = 0; i < n; i++) {
        const t = dur * i / n;
        await page.evaluate((f, t, k, c, r, l) => { window.draw(f, t, k, c, r); window.label(l, c, r); }, def.file, t, def.keep ?? 0, i % 8, Math.floor(i / 8), t.toFixed(2));
      }
      await save(path.join(sheetDir, `${name}_${clip}.png`), '#3a4350');
      console.log(clip, def.file, dur.toFixed(2) + 's');
    }
  } else {
    const list = [];
    for (const [clip, def] of Object.entries(cfg.clips)) {
      const dur = info.durations[def.file];
      const from = def.from ?? 0, to = def.to ?? dur;
      for (let i = 0; i < def.frames; i++) {
        // 循环动作首尾相接，不取终点；一次性动作取满首尾
        const k = def.loop && !def.yoyo ? i / def.frames : i / (def.frames - 1);
        list.push({ clip, i, file: def.file, t: from + (to - from) * k, keep: def.keep ?? 0 });
      }
    }
    const cols = Math.floor(2048 / cfg.cell), rows = Math.ceil(list.length / cols);
    await page.evaluate((c, r) => window.begin(c, r), cols, rows);
    const frames = {};
    for (let n = 0; n < list.length; n++) {
      const f = list[n], col = n % cols, row = Math.floor(n / cols);
      const hand = await page.evaluate((file, t, k, c, r) => window.draw(file, t, k, c, r), f.file, f.t, f.keep, col, row);
      const rect = { x: col * cfg.cell, y: row * cfg.cell, w: cfg.cell, h: cfg.cell };
      frames[`${f.clip}_${f.i}`] = { frame: rect, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: cfg.cell, h: cfg.cell }, sourceSize: { w: cfg.cell, h: cfg.cell }, hand };
    }
    const out = path.join(ROOT, cfg.out);
    fs.mkdirSync(out, { recursive: true });
    await save(path.join(out, 'atlas.png'));
    // 脚底在单元格里的位置：模型原点投影
    const footY = (0.5 + (cfg.centerY * Math.cos(cfg.pitch * Math.PI / 180)) / (2 * cfg.zoom)) * cfg.cell;
    const clips = Object.fromEntries(Object.entries(cfg.clips).map(([k, d]) => [k, { frames: d.frames, ms: d.ms, loop: !!d.loop, yoyo: !!d.yoyo }]));
    fs.writeFileSync(path.join(out, 'atlas.json'), JSON.stringify({ frames, meta: { image: 'atlas.png', size: { w: cols * cfg.cell, h: rows * cfg.cell }, scale: 1 }, char: { cell: cfg.cell, footX: cfg.cell / 2, footY: Math.round(footY * 10) / 10, heightPx: Math.round(cfg.cell / (2 * cfg.zoom) * 10) / 10, clips } }));
    console.log(`${list.length} 帧 → ${path.join(cfg.out, 'atlas.png')} (${cols * cfg.cell}×${rows * cfg.cell})`);
  }
} finally { await browser.close(); srv.close(); }
