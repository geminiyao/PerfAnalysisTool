// POST /runs/ingest/* — 采集上传 Tab → 新 runs 模型（异步任务 + SSE 进度）

import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';
import { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import { getConfig } from '../utils/config.js';
import type { IngestMeta } from '../services/run-ingest-service.js';
import {
  createIngestJob,
  getIngestJob,
  getIngestJobEvents,
  runMergeIngestJob,
  runPerfettoIngestJob,
  runSimpleperfIngestJob,
  runUnifiedIngestJob,
  runUnityIngestJob,
  subscribeIngestJob,
  unsubscribeIngestJob,
} from '../services/ingest-job-service.js';

function parseMultipartFields(fields: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, field] of Object.entries(fields)) {
    if (!field) continue;
    if (typeof field === 'object' && field !== null && 'value' in field) {
      out[key] = String((field as { value?: string }).value ?? '');
    } else {
      out[key] = String(field);
    }
  }
  return out;
}

function metaFromFields(f: Record<string, string>): IngestMeta {
  return {
    runId: f.runId || undefined,
    label: f.label || undefined,
    device: f.device || undefined,
    scene: f.scene || undefined,
    projectName: f.projectName || undefined,
    version: f.version || undefined,
    notes: f.notes || undefined,
    targetFps: f.targetFps ? Number(f.targetFps) : undefined,
  };
}

function perfettoOptionsFromFields(f: Record<string, string>) {
  const num = (key: string) => {
    const v = f[key];
    if (v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    profileName: f.profileName || undefined,
    sliceTreeMinPct: num('sliceTreeMinPct'),
    sliceTreeMaxDepth: num('sliceTreeMaxDepth'),
    summaryMinPct: num('summaryMinPct'),
    summaryMaxDepth: num('summaryMaxDepth'),
  };
}

async function saveUpload(fileStream: NodeJS.ReadableStream, destPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  await pipeline(fileStream, createWriteStream(destPath));
}

function jobPayload(jobId: string) {
  return { jobId, status: 'processing' as const };
}

export async function runIngestRoutes(app: FastifyInstance) {
  /** 任务状态 / 历史事件 */
  app.get('/runs/ingest/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = getIngestJob(id);
    if (!job) return reply.status(404).send({ error: '入库任务不存在' });
    return { job, events: getIngestJobEvents(id) };
  });

  /** SSE 实时进度 */
  app.get('/runs/ingest/jobs/:id/events', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = getIngestJob(id);
    if (!job) return reply.status(404).send({ error: '入库任务不存在' });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const client = reply.raw as NodeJS.WritableStream;
    subscribeIngestJob(id, client);
    request.raw.on('close', () => unsubscribeIngestJob(id, client));
  });

  /** Unity .pdata → build-profile → runs */
  app.post('/runs/ingest/unity', async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: '需要上传 .pdata 文件' });
    const ext = path.extname(data.filename).toLowerCase();
    if (ext !== '.pdata') return reply.status(400).send({ error: '仅支持 .pdata 文件' });

    const fields = parseMultipartFields((data.fields ?? {}) as Record<string, unknown>);
    const meta = metaFromFields(fields);
    const jobDir = path.join(getConfig().dataDir, 'uploads', 'ingest', uuid());
    const dest = path.join(jobDir, data.filename);
    await saveUpload(data.file, dest);

    const job = createIngestJob('unity');
    runUnityIngestJob(job.id, dest, meta);
    return reply.status(202).send(jobPayload(job.id));
  });

  /** simpleperf perf.data → build → runs */
  app.post('/runs/ingest/simpleperf', async (request, reply) => {
    const parts = request.parts();
    const fields: Record<string, string> = {};
    let perfDest: string | null = null;

    // 必须在循环内立即消费 file stream，否则 multipart 解析会死锁
    for await (const part of parts) {
      if (part.type === 'file' && (part.fieldname === 'perfData' || part.fieldname === 'file')) {
        const jobDir = path.join(getConfig().dataDir, 'uploads', 'ingest', uuid());
        perfDest = path.join(jobDir, part.filename || 'perf.data');
        await saveUpload(part.file, perfDest);
      } else if (part.type === 'field') {
        fields[part.fieldname] = String(part.value);
      }
    }

    if (!perfDest) return reply.status(400).send({ error: '需要上传 perf.data' });

    const meta = metaFromFields(fields);
    const job = createIngestJob('simpleperf');
    runSimpleperfIngestJob(job.id, perfDest, {
      ...meta,
      binaryCachePath: fields.binaryCacheLocalPath || undefined,
    });
    return reply.status(202).send(jobPayload(job.id));
  });

  /** perfetto .pftrace → build → runs */
  app.post('/runs/ingest/perfetto', async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: '需要上传 trace 文件' });
    const ext = path.extname(data.filename).toLowerCase();
    if (!['.pftrace', '.perfetto-trace', '.trace'].includes(ext)) {
      return reply.status(400).send({ error: '仅支持 .pftrace / .perfetto-trace 文件' });
    }

    const fields = parseMultipartFields((data.fields ?? {}) as Record<string, unknown>);
    const meta = metaFromFields(fields);
    const pfOptions = perfettoOptionsFromFields(fields);
    const jobDir = path.join(getConfig().dataDir, 'uploads', 'ingest', uuid());
    const dest = path.join(jobDir, data.filename);
    await saveUpload(data.file, dest);

    const job = createIngestJob('perfetto');
    runPerfettoIngestJob(job.id, dest, meta, pfOptions);
    return reply.status(202).send(jobPayload(job.id));
  });

  /** 统一拖放: 多文件/目录 → 识别 → 构建 → 入库 → skill 分析 */
  app.post('/runs/ingest/unified', async (request, reply) => {
    const parts = request.parts();
    const fields: Record<string, string> = {};
    const savedPaths: string[] = [];
    const jobDir = path.join(getConfig().dataDir, 'uploads', 'ingest', uuid());
    fs.mkdirSync(jobDir, { recursive: true });

    for await (const part of parts) {
      if (part.type === 'file') {
        const name = part.filename || part.fieldname || 'upload.bin';
        const dest = path.join(jobDir, name);
        await saveUpload(part.file, dest);
        savedPaths.push(dest);
      } else if (part.type === 'field') {
        fields[part.fieldname] = String(part.value);
      }
    }

    if (savedPaths.length === 0) {
      return reply.status(400).send({ error: '需要上传至少 1 个文件 (.pdata / perf.data / .pftrace / meta.json)' });
    }

    const meta = metaFromFields(fields);
    const pfOptions = perfettoOptionsFromFields(fields);
    const cliProvider = (fields.cliProvider as 'codebuddy' | 'claude' | 'mock' | undefined) || undefined;
    const skipAnalysis = fields.skipAnalysis === 'true' || fields.skipAnalysis === '1';

    const job = createIngestJob('unified');
    runUnifiedIngestJob(job.id, {
      filePaths: savedPaths,
      meta,
      binaryCachePath: fields.binaryCacheLocalPath || undefined,
      perfetto: pfOptions,
      cliProvider,
      targetFps: meta.targetFps,
      skipAnalysis,
    });
    return reply.status(202).send(jobPayload(job.id));
  });

  /** 合并已有单源 Run → 多源 Run */
  app.post('/runs/ingest/merge', async (request, reply) => {
    const body = request.body as {
      runIds?: string[];
      runId?: string;
      label?: string;
      device?: string;
      scene?: string;
      projectName?: string;
      version?: string;
    };
    if (!body.runIds || body.runIds.length < 2) {
      return reply.status(400).send({ error: '需要至少 2 个 runIds' });
    }

    const job = createIngestJob('merge');
    runMergeIngestJob(job.id, body.runIds, {
      runId: body.runId,
      label: body.label,
      device: body.device,
      scene: body.scene,
      projectName: body.projectName,
      version: body.version,
    });
    return reply.status(202).send(jobPayload(job.id));
  });
}
