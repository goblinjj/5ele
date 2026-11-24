# 五行秘境联机服务（在仓库根目录构建：docker compose up -d --build）
FROM node:22-alpine AS build
WORKDIR /app
RUN npm i -g pnpm@9
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --filter "@xiyou/server..."
COPY packages/shared packages/shared
COPY packages/server packages/server
RUN pnpm --filter @xiyou/shared build && pnpm --filter @xiyou/server build

FROM node:22-alpine
ENV NODE_ENV=production PORT=2567 DATA_DIR=/data
COPY --from=build /app /app
WORKDIR /app/packages/server
VOLUME /data
EXPOSE 2567
CMD ["node", "dist/index.js"]
