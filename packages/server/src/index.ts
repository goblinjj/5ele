import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { createServer } from 'http';
import { GameRoom } from './rooms/GameRoom.js';

const port = Number(process.env.PORT) || 2567;

// 创建 HTTP 服务器
const httpServer = createServer();

// 创建 Colyseus 服务器
const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
  }),
});

// 注册游戏房间
gameServer.define('game', GameRoom);

// 启动服务器
httpServer.listen(port, () => {
  console.log(`🎮 游戏服务器已启动`);
  console.log(`📡 监听端口: ${port}`);
  console.log(`🔗 WebSocket: ws://localhost:${port}`);
});
