import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Session, onMessage, onClose, stats } from './lobby.js';
import { flush } from './store.js';

const port = Number(process.env.PORT) || 2567;

const http = createServer((req, res) => {
  if (req.url === '/health' || req.url === '/ws/health') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: true, ...stats() }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: http, maxPayload: 16 * 1024 });

wss.on('connection', ws => {
  const s = new Session(ws);
  let alive = true;
  ws.on('pong', () => { alive = true; });
  const hb = setInterval(() => {
    if (!alive) { ws.terminate(); return; }
    alive = false;
    ws.ping();
  }, 20000);

  ws.on('message', data => {
    try {
      onMessage(s, data.toString());
    } catch (e) {
      console.error('处理消息出错', e);
    }
  });
  ws.on('close', () => {
    clearInterval(hb);
    onClose(s);
  });
  ws.on('error', () => {});
});

http.listen(port, () => {
  console.log(`五行秘境服务已启动，端口 ${port}`);
});

async function shutdown(): Promise<void> {
  console.log('正在保存存档…');
  await flush();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
