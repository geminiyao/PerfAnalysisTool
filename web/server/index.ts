import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import path from 'path';
import fs from 'fs';
import { getConfig } from './utils/config.js';
import { getDb, closeDb } from './db/index.js';
import { uploadRoutes } from './routes/upload.js';
import { analysisRoutes } from './routes/analysis.js';
import { historyRoutes } from './routes/history.js';
import { compareRoutes } from './routes/compare.js';
import { trendsRoutes } from './routes/trends.js';
import { optimizeRoutes } from './routes/optimize.js';
import { settingsRoutes } from './routes/settings.js';
import { assetRoutes } from './routes/assets.js';
import { aiChatRoutes } from './routes/ai-chat.js';
import { simpleperfRoutes } from './routes/simpleperf.js';
import { mapleRoutes } from './routes/maple.js';
import { mapleCompareRoutes } from './routes/maple-compare.js';
import { runsRoutes } from './routes/runs.js';
import { triadTrendsRoutes } from './routes/triad-trends.js';
import { runIngestRoutes } from './routes/run-ingest.js';
import { reportPreviewRoutes } from './routes/report-preview.js';
import { reportViewerRoutes } from './routes/report-viewer.js';

const config = getConfig();

const app = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  },
});

async function start() {
  // 插件注册
  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: {
      fileSize: parseSize(config.maxUploadSize),
    },
  });

  // 初始化数据库
  getDb();
  console.log('✓ Database initialized');

  // 注册 API 路由：同时支持根路径 /api 和子路径 /cpu/api
  const apiRouteGroups = [
    uploadRoutes,
    analysisRoutes,
    historyRoutes,
    compareRoutes,
    trendsRoutes,
    optimizeRoutes,
    settingsRoutes,
    assetRoutes,
    aiChatRoutes,
    simpleperfRoutes,
    mapleRoutes,
    mapleCompareRoutes,
    runsRoutes,
    triadTrendsRoutes,
    runIngestRoutes,
    reportPreviewRoutes,
    reportViewerRoutes,
  ];
  for (const routes of apiRouteGroups) {
    await app.register(routes, { prefix: '/api' });
    await app.register(routes, { prefix: '/cpu/api' });
  }

  // 生产模式下提供静态前端文件
  const clientDistCandidates = [
    path.resolve(import.meta.dirname, '../dist/client'),
    path.resolve(import.meta.dirname, '../../client'),
    path.resolve(process.cwd(), 'dist/client'),
  ];
  const clientDist = clientDistCandidates.find(dir => fs.existsSync(path.join(dir, 'index.html'))) || clientDistCandidates[0];
  try {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: '/cpu/',
      wildcard: true,
    });
    app.get('/', async (_req, reply) => reply.redirect('/cpu/'));
    app.get('/cpu', async (_req, reply) => reply.redirect('/cpu/'));
    console.log(`✓ Static client served from: ${clientDist}`);
    // SPA 回退
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/cpu/api')) {
        reply.status(404).send({ error: 'Not found' });
      } else {
        reply.sendFile('index.html');
      }
    });
  } catch {
    // 开发模式下前端由 Vite 提供
  }

  // 健康检查
  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: Date.now(),
    version: '1.0.0',
  }));

  // 启动服务器
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    console.log(`\n🚀 Perf Dashboard Server running at http://localhost:${config.port}`);
    console.log(`   Data directory: ${config.dataDir}\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// 优雅关闭
process.on('SIGINT', async () => {
  closeDb();
  await app.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  closeDb();
  await app.close();
  process.exit(0);
});

function parseSize(size: string): number {
  const match = size.match(/^(\d+)(mb|gb|kb)?$/i);
  if (!match) return 200 * 1024 * 1024; // 默认 200MB
  const num = parseInt(match[1]);
  const unit = (match[2] || 'mb').toLowerCase();
  switch (unit) {
    case 'kb': return num * 1024;
    case 'mb': return num * 1024 * 1024;
    case 'gb': return num * 1024 * 1024 * 1024;
    default: return num * 1024 * 1024;
  }
}

start();
