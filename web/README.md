# Unity Profiler Performance Dashboard

Unity Profiler 性能分析 Web 平台，支持 .pdata 文件上传、AI 自动分析、报告生成、历史对比和趋势追踪。

## 技术栈

- **前端**: React 18 + Ant Design + ECharts + Vite
- **后端**: Fastify 5 + Drizzle ORM + SQLite (better-sqlite3)
- **AI 分析**: CodeBuddy CLI / Claude Code CLI (stream-json 模式)

## 本地开发

```bash
cd web
npm install
npm run dev
```

- 前端: http://localhost:5173 (Vite 热更新)
- 后端: http://localhost:3000 (tsx watch 自动重启)
- Vite 自动代理 `/api` 请求到后端

## 服务器部署

### 前置条件

1. **Node.js 20+**
2. **CodeBuddy CLI** (或 Claude Code CLI) 已安装并完成登录认证
3. **PM2** 进程守护 (`npm install -g pm2`)

### 部署步骤

```bash
# 1. 拉取代码
git clone <repo-url>
cd PerfAnalysisTool_Codebuddy/web

# 2. 安装依赖（仅生产依赖）
npm install --production=false   # 需要 devDependencies 来 build

# 3. 构建（前端打包 + 后端编译）
npm run build
# 产物:
#   dist/client/  - 前端静态文件
#   dist/server/  - 后端 JS

# 4. PM2 启动守护进程
pm2 start dist/server/index.js --name perf-dashboard

# 5. 访问
# http://<服务器IP>:3000
```

### 自定义配置

创建 `web/config.json` 覆盖默认值：

```json
{
  "port": 3000,
  "dataDir": "./data",
  "maxUploadSize": "200mb",
  "skillProjectPath": "/path/to/PerfAnalysisTool_Codebuddy",
  "cliPaths": {
    "codebuddy": "/usr/local/bin/codebuddy",
    "claude": "/usr/local/bin/claude"
  }
}
```

也可用环境变量覆盖：

| 环境变量 | 说明 | 默认值 |
|---------|------|-------|
| `PERF_PORT` | 服务端口 | 3000 |
| `PERF_DATA_DIR` | 数据存储目录 | ./data |
| `CODEBUDDY_PATH` | CodeBuddy CLI 路径 | PATH 中的 codebuddy |
| `CLAUDE_CLI_PATH` | Claude Code CLI 路径 | PATH 中的 claude |

### PM2 常用命令

```bash
pm2 status                          # 查看进程状态
pm2 logs perf-dashboard             # 实时日志
pm2 logs perf-dashboard --lines 100 # 最近 100 行日志
pm2 monit                           # 实时监控面板 (CPU/内存/日志)
pm2 restart perf-dashboard          # 重启
pm2 stop perf-dashboard             # 停止
pm2 delete perf-dashboard           # 删除进程
```

### Nginx 反向代理 (可选)

如需通过 80/443 端口或域名访问：

```nginx
server {
    listen 80;
    server_name perf.yourteam.com;

    client_max_body_size 200m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # SSE 长连接支持
    location /api/analysis/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
    }
}
```

### 开机自启 (可选)

```bash
pm2 startup      # 生成系统启动脚本（按提示执行输出的命令）
pm2 save         # 保存当前进程列表
```

## 目录结构

```
web/
├── server/              # 后端 (Fastify)
│   ├── db/              # SQLite 数据库 (Drizzle ORM)
│   ├── routes/          # API 路由
│   ├── services/        # 业务逻辑 (队列、CLI 执行、指标提取)
│   └── utils/           # 配置管理
├── src/                 # 前端 (React)
│   ├── pages/           # 页面组件
│   ├── components/      # 通用组件
│   └── services/        # API 调用
├── shared/              # 前后端共享类型
├── data/                # 运行时数据 (自动创建)
│   ├── uploads/         # 上传的 .pdata 文件
│   ├── results/         # 分析结果 (JSON + MD + 日志)
│   └── db.sqlite        # SQLite 数据库
└── dist/                # 构建产物 (npm run build)
    ├── client/          # 前端静态文件
    └── server/          # 后端编译 JS
```
