FROM node:20-alpine

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制 package.json
COPY package.json ./

# 创建 shared 包的符号链接目录
RUN mkdir -p node_modules/@xiyou/shared

# 安装依赖
RUN pnpm install

# 复制源代码
COPY . .

EXPOSE 5173

# 启动开发服务器
CMD ["pnpm", "run", "dev"]
