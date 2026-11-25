import { defineConfig } from 'vite';

export default defineConfig({
  // 每次构建一个新版本号，拼到图集地址后面：图和它的 JSON 必须是同一批，
  // 否则浏览器缓存里旧图配新坐标，动画就全乱了
  define: { __BUILD__: JSON.stringify(String(Date.now())) },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    target: 'esnext',
  },
});
