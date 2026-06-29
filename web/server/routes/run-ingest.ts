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
  runPerfettoTriadIngestJob,
  runSimpleperfDiffBundleIngestJob,
  runSimpleperfDiffIngestJob,
  runSimpleperfIngestJob,
  runUnifiedIngestJob,
  runUnityIngestJob,
  subscribeIngestJob,
  unsubscribeIngestJob,
} from '../services/ingest-job-service.js';
import type { PerfettoTriadInput, PerfettoTriadRole } from '../services/perfetto-triad-service.js';

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

function safeUploadPath(rootDir: string, filename: string): string {
  const normalized = filename.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(p => p && p !== '.' && p !== '..');
  const safe = parts.length ? path.join(...parts) : 'upload.bin';
  const dest = path.resolve(rootDir, safe);
  const root = path.resolve(rootDir);
  if (!dest.startsWith(root + path.sep) && dest !== root) {
    throw new Error(`非法上传路径: ${filename}`);
  }
  return dest;
}

const PERFETTO_TRACE_EXTS = new Set(['.pftrace', '.perfetto-trace', '.trace']);
const SIDECAR_NAMES = new Set(['collection-manifest.json', 'thermal_before.txt', 'thermal_after.txt', 'cpuinfo_max_freq.txt', 'meta.json']);

function listFilesRecursive(dir: string): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const fp = path.join(dir, name);
    const st = fs.statSync(fp);
    if (st.isDirectory()) out.push(...listFilesRecursive(fp));
    else out.push(fp);
  }
  return out;
}

function findPerfettoTrace(files: string[]): string | null {
  return files.find(fp => PERFETTO_TRACE_EXTS.has(path.extname(fp).toLowerCase())) ?? null;
}

function sampleDirForTrace(tracePath: string): string {
  return path.dirname(tracePath);
}

function buildTriadSampleFromDir(role: PerfettoTriadRole, sampleDir: string, label?: string): PerfettoTriadInput {
  const root = path.resolve(sampleDir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`${role} sample 目录不存在: ${sampleDir}`);
  }
  const allFiles = listFilesRecursive(root);
  const tracePath = findPerfettoTrace(allFiles);
  if (!tracePath) throw new Error(`${role} 未找到 .pftrace / .perfetto-trace / .trace: ${sampleDir}`);
  return { role, tracePath, sampleDir: sampleDirForTrace(tracePath), label: label || role };
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
      'Access-Control-Allow-Origin': request.headers.origin || '*',
      'Access-Control-Allow-Credentials': 'true',
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

  /** perfetto sample 目录/多文件/.pftrace → build → runs；旁路文件需与 trace 同目录 */
  app.post('/runs/ingest/perfetto', async (request, reply) => {
    const parts = request.parts();
    const fields: Record<string, string> = {};
    const savedPaths: string[] = [];
    const jobDir = path.join(getConfig().dataDir, 'uploads', 'ingest', uuid());
    fs.mkdirSync(jobDir, { recursive: true });

    for await (const part of parts) {
      if (part.type === 'file') {
        const name = part.filename || part.fieldname || 'upload.bin';
        const dest = safeUploadPath(jobDir, name);
        await saveUpload(part.file, dest);
        savedPaths.push(dest);
      } else if (part.type === 'field') {
        fields[part.fieldname] = String(part.value);
      }
    }

    if (savedPaths.length === 0) return reply.status(400).send({ error: '需要上传 trace 文件或 sample 目录' });
    const allFiles = listFilesRecursive(jobDir);
    const tracePath = findPerfettoTrace(allFiles);
    if (!tracePath) return reply.status(400).send({ error: '仅支持 .pftrace / .perfetto-trace / .trace 文件' });

    const traceDir = sampleDirForTrace(tracePath);
    const sidecars = allFiles.filter(fp => SIDECAR_NAMES.has(path.basename(fp).toLowerCase()));
    for (const fp of sidecars) {
      const dest = path.join(traceDir, path.basename(fp));
      if (path.resolve(fp) !== path.resolve(dest) && !fs.existsSync(dest)) fs.copyFileSync(fp, dest);
    }

    const meta = metaFromFields(fields);
    const pfOptions = perfettoOptionsFromFields(fields);
    const job = createIngestJob('perfetto');
    runPerfettoIngestJob(job.id, tracePath, meta, pfOptions);
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
        const dest = safeUploadPath(jobDir, name);
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

  /** Perfetto 三态: base/cur/throttle 三份 sample 目录/文件 → v5.2 三态对比报告 */
  app.post('/runs/ingest/perfetto-triad', async (request, reply) => {
    const parts = request.parts();
    const fields: Record<string, string> = {};
    const byRole: Record<PerfettoTriadRole, string[]> = { base: [], cur: [], throttle: [] };
    const jobDir = path.join(getConfig().dataDir, 'uploads', 'ingest', uuid());
    fs.mkdirSync(jobDir, { recursive: true });

    for await (const part of parts) {
      if (part.type === 'file') {
        const role = part.fieldname as PerfettoTriadRole;
        if (!['base', 'cur', 'throttle'].includes(role)) {
          await part.file.resume?.();
          continue;
        }
        const name = part.filename || 'upload.bin';
        const dest = safeUploadPath(path.join(jobDir, role), name);
        await saveUpload(part.file, dest);
        byRole[role].push(dest);
      } else if (part.type === 'field') {
        fields[part.fieldname] = String(part.value);
      }
    }

    const samples: PerfettoTriadInput[] = [];
    for (const role of ['base', 'cur', 'throttle'] as PerfettoTriadRole[]) {
      if (!byRole[role].length) return reply.status(400).send({ error: `需要上传 ${role} sample` });
      const root = path.join(jobDir, role);
      const allFiles = listFilesRecursive(root);
      const tracePath = findPerfettoTrace(allFiles);
      if (!tracePath) return reply.status(400).send({ error: `${role} 未找到 .pftrace / .perfetto-trace / .trace` });
      const traceDir = sampleDirForTrace(tracePath);
      const sidecars = allFiles.filter(fp => SIDECAR_NAMES.has(path.basename(fp).toLowerCase()));
      for (const fp of sidecars) {
        const dest = path.join(traceDir, path.basename(fp));
        if (path.resolve(fp) !== path.resolve(dest) && !fs.existsSync(dest)) fs.copyFileSync(fp, dest);
      }
      samples.push({ role, tracePath, sampleDir: traceDir, label: fields[`${role}Label`] || role });
    }

    const meta = metaFromFields(fields);
    const pfOptions = perfettoOptionsFromFields(fields);
    const cliProvider = (fields.cliProvider as 'codebuddy' | 'claude' | 'mock' | undefined) || undefined;
    const job = createIngestJob('perfetto_triad');
    runPerfettoTriadIngestJob(job.id, { samples, meta, perfetto: pfOptions, cliProvider });
    return reply.status(202).send(jobPayload(job.id));
  });

  /** Perfetto 三态本地路径模式: 仅提交 sample 目录路径，后端直接读取本机目录，绕过大文件上传 */
  app.post('/runs/ingest/perfetto-triad/local', async (request, reply) => {
    const body = request.body as {
      paths?: Partial<Record<PerfettoTriadRole, string>>;
      labels?: Partial<Record<PerfettoTriadRole, string>>;
      cliProvider?: 'codebuddy' | 'claude' | 'mock';
      runId?: string;
      label?: string;
      device?: string;
      scene?: string;
      projectName?: string;
      version?: string;
      notes?: string;
      targetFps?: number;
      profileName?: string;
      sliceTreeMinPct?: number;
      sliceTreeMaxDepth?: number;
      summaryMinPct?: number;
      summaryMaxDepth?: number;
    };
    const samples: PerfettoTriadInput[] = [];
    try {
      for (const role of ['base', 'cur', 'throttle'] as PerfettoTriadRole[]) {
        const dir = body.paths?.[role];
        if (!dir) return reply.status(400).send({ error: `需要填写 ${role} sample 目录路径` });
        samples.push(buildTriadSampleFromDir(role, dir, body.labels?.[role]));
      }
    } catch (e: any) {
      return reply.status(400).send({ error: e.message || String(e) });
    }

    const meta: IngestMeta = {
      runId: body.runId || undefined,
      label: body.label || undefined,
      device: body.device || undefined,
      scene: body.scene || undefined,
      projectName: body.projectName || undefined,
      version: body.version || undefined,
      notes: body.notes || undefined,
      targetFps: body.targetFps !== undefined ? Number(body.targetFps) : undefined,
    };
    const pfOptions = {
      profileName: body.profileName || undefined,
      sliceTreeMinPct: body.sliceTreeMinPct !== undefined ? Number(body.sliceTreeMinPct) : undefined,
      sliceTreeMaxDepth: body.sliceTreeMaxDepth !== undefined ? Number(body.sliceTreeMaxDepth) : undefined,
      summaryMinPct: body.summaryMinPct !== undefined ? Number(body.summaryMinPct) : undefined,
      summaryMaxDepth: body.summaryMaxDepth !== undefined ? Number(body.summaryMaxDepth) : undefined,
    };
    const job = createIngestJob('perfetto_triad');
    runPerfettoTriadIngestJob(job.id, { samples, meta, perfetto: pfOptions, cliProvider: body.cliProvider });
    return reply.status(202).send(jobPayload(job.id));
  });

  /** simpleperf base+cur 差分 → v4 标准报告（Provider + 可选 AI 润色） */
  app.post('/runs/ingest/simpleperf-diff', async (request, reply) => {
    const parts = request.parts();
    const fields: Record<string, string> = {};
    const byRole: Record<'base' | 'cur', string | null> = { base: null, cur: null };
    const jobDir = path.join(getConfig().dataDir, 'uploads', 'ingest', uuid());
    fs.mkdirSync(jobDir, { recursive: true });

    for await (const part of parts) {
      if (part.type === 'file') {
        const role = part.fieldname as 'base' | 'cur';
        if (!['base', 'cur'].includes(role)) {
          await part.file.resume?.();
          continue;
        }
        const dest = safeUploadPath(path.join(jobDir, role), part.filename || 'perf.data');
        await saveUpload(part.file, dest);
        byRole[role] = dest;
      } else if (part.type === 'field') {
        fields[part.fieldname] = String(part.value);
      }
    }

    if (!byRole.base || !byRole.cur) {
      return reply.status(400).send({ error: '需要上传 base 与 cur 两份 perf.data' });
    }

    const meta = metaFromFields(fields);
    const cliProvider = (fields.cliProvider as 'codebuddy' | 'claude' | 'mock' | undefined) || undefined;
    // Web 默认开启 CLI 润色（覆盖 §0 / §4.3-§4.6 / §6.2 / §9 narrative gaps）
    // 显式 skipAiEnrich=true 才跳过；Python enrich 始终执行
    const skipAiEnrich = fields.skipAiEnrich === 'true' || fields.skipAiEnrich === '1';
    const job = createIngestJob('simpleperf_diff');
    runSimpleperfDiffIngestJob(job.id, {
      input: { basePerfPath: byRole.base, curPerfPath: byRole.cur },
      meta,
      binaryCachePath: fields.binaryCacheLocalPath || undefined,
      sceneBase: fields.sceneBase || undefined,
      sceneCur: fields.sceneCur || undefined,
      cliProvider,
      skipAiEnrich,
    });
    return reply.status(202).send(jobPayload(job.id));
  });

  /** simpleperf 差分本地路径：base.data + cur.data + binary_cache */
  app.post('/runs/ingest/simpleperf-diff/local', async (request, reply) => {
    const body = request.body as {
      basePath?: string;
      curPath?: string;
      binaryCachePath?: string;
      sceneBase?: string;
      sceneCur?: string;
      cliProvider?: 'codebuddy' | 'claude' | 'mock';
      skipAiEnrich?: boolean;
      runId?: string;
      label?: string;
      device?: string;
      scene?: string;
      projectName?: string;
      version?: string;
      notes?: string;
      targetFps?: number;
    };
    if (!body.basePath || !body.curPath) {
      return reply.status(400).send({ error: '需要填写 basePath 与 curPath' });
    }
    for (const [label, fp] of [['base', body.basePath], ['cur', body.curPath]] as const) {
      if (!fs.existsSync(fp)) {
        return reply.status(400).send({ error: `${label} 文件不存在: ${fp}` });
      }
    }

    const meta: IngestMeta = {
      runId: body.runId || undefined,
      label: body.label || undefined,
      device: body.device || undefined,
      scene: body.scene || undefined,
      projectName: body.projectName || undefined,
      version: body.version || undefined,
      notes: body.notes || undefined,
      targetFps: body.targetFps !== undefined ? Number(body.targetFps) : undefined,
    };
    const job = createIngestJob('simpleperf_diff');
    runSimpleperfDiffIngestJob(job.id, {
      input: {
        basePerfPath: body.basePath,
        curPerfPath: body.curPath,
        binaryCachePath: body.binaryCachePath,
        sceneBase: body.sceneBase,
        sceneCur: body.sceneCur,
      },
      meta,
      binaryCachePath: body.binaryCachePath,
      sceneBase: body.sceneBase,
      sceneCur: body.sceneCur,
      cliProvider: body.cliProvider,
      skipAiEnrich: body.skipAiEnrich === true,
    });
    return reply.status(202).send(jobPayload(job.id));
  });

  /** 客户端本地已分析：上传 v4 markdown（+ 可选 diff JSON） */
  app.post('/runs/ingest/simpleperf-diff/bundle', async (request, reply) => {
    const parts = request.parts();
    const fields: Record<string, string> = {};
    let reportPath: string | null = null;
    let diffJsonPath: string | null = null;
    const jobDir = path.join(getConfig().dataDir, 'uploads', 'ingest', uuid());
    fs.mkdirSync(jobDir, { recursive: true });

    for await (const part of parts) {
      if (part.type === 'file') {
        const dest = safeUploadPath(jobDir, part.filename || 'upload.bin');
        await saveUpload(part.file, dest);
        if (part.fieldname === 'report' || part.fieldname === 'reportMarkdown') {
          reportPath = dest;
        } else if (part.fieldname === 'diffJson' || part.fieldname === 'simpleperf-diff.json') {
          diffJsonPath = dest;
        } else if (!reportPath && /\.md$/i.test(part.filename || '')) {
          reportPath = dest;
        } else if (!diffJsonPath && /\.json$/i.test(part.filename || '')) {
          diffJsonPath = dest;
        }
      } else if (part.type === 'field') {
        fields[part.fieldname] = String(part.value);
      }
    }

    if (!reportPath) {
      return reply.status(400).send({ error: '需要上传 performance-report.md 或 v4 差分报告' });
    }

    const markdown = fs.readFileSync(reportPath, 'utf-8');
    const meta = metaFromFields(fields);
    const job = createIngestJob('simpleperf_diff');
    runSimpleperfDiffBundleIngestJob(job.id, {
      bundle: {
        reportMarkdown: markdown,
        diffJsonPath: diffJsonPath || undefined,
        providerReportPath: reportPath,
      },
      meta,
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
