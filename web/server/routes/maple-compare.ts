import { FastifyInstance } from 'fastify';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { v4 as uuid } from 'uuid';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { mapleCompareSessions } from '../db/schema.js';
import { createOrGetAiSession, destroyAiSession } from '../services/ai-agent-session.js';
import { getConfig } from '../utils/config.js';
import type { SimpleperfProgressEvent, SimpleperfStage } from '../../shared/types.js';

const progressEvents = new Map<string, SimpleperfProgressEvent[]>();
const progressClients = new Map<string, Set<NodeJS.WritableStream>>();

interface MapleCompareMeta {
  label?: string;
  device?: string;
  scene?: string;
}

interface LocalAnalyzeBody extends MapleCompareMeta {
  baseDir?: string;
  optDir?: string;
}

interface LocalResolveBody {
  dir?: string;
  name?: string;
}

export async function mapleCompareRoutes(app: FastifyInstance) {

  app.get('/maple-compare/sessions', async (request) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(Number(query.limit || 50), 200);
    const db = getDb();
    const items = await db.select().from(mapleCompareSessions).orderBy(desc(mapleCompareSessions.createdAt)).limit(limit).all();
    return { items };
  });

  app.get('/maple-compare/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await getMapleCompareSession(id);
    if (!session) return reply.status(404).send({ error: 'Maple 三源对比 session 不存在' });
    return session;
  });

  app.post('/maple-compare/upload', async (request, reply) => {
    const sessionId = uuid();
    const config = getConfig();
    const workDir = path.join(config.dataDir, 'maple-compare', sessionId);
    const baseDir = path.join(workDir, 'base');
    const optDir = path.join(workDir, 'opt');
    fs.mkdirSync(baseDir, { recursive: true });
    fs.mkdirSync(optDir, { recursive: true });

    const meta: MapleCompareMeta = {};
    let baseCount = 0;
    let optCount = 0;

    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'field') {
        (meta as any)[part.fieldname] = String(part.value || '');
        continue;
      }

      if (part.fieldname !== 'baseFiles[]' && part.fieldname !== 'baseFiles' && part.fieldname !== 'optFiles[]' && part.fieldname !== 'optFiles') {
        part.file.resume();
        continue;
      }

      const rootDir = part.fieldname.startsWith('baseFiles') ? baseDir : optDir;
      const relative = sanitizeRelativePath(getPartRelativePath(part) || part.filename || 'file');
      const target = path.join(rootDir, stripTopDirectory(relative));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await pipeline(part.file, fs.createWriteStream(target));
      if (rootDir === baseDir) baseCount += 1;
      else optCount += 1;
    }

    if (baseCount === 0 || optCount === 0) {
      return reply.status(400).send({ error: '请同时上传 baseFiles[] 和 optFiles[]' });
    }

    ensureMetaJson(baseDir, { label: 'base', device: meta.device || '', scene: meta.scene || '', compare_label: meta.label || '' });
    ensureMetaJson(optDir, { label: 'opt', device: meta.device || '', scene: meta.scene || '', compare_label: meta.label || '' });

    await createMapleCompareSession(sessionId, { ...meta, baseDir, optDir });

    emitProgress(sessionId, 'stage', 'upload_completed', `上传完成：base ${baseCount} 个文件，opt ${optCount} 个文件`, 25);
    return reply.status(201).send({ id: sessionId, status: 'pending', baseFiles: baseCount, optFiles: optCount });
  });

  app.post('/maple-compare/local/resolve', async (request, reply) => {
    const body = (request.body || {}) as LocalResolveBody;
    const rawDir = String(body.dir || body.name || '').trim();
    if (!rawDir) return reply.status(400).send({ error: '请拖拽选择目录' });

    const result = resolveLocalRunDir(rawDir, getConfig());
    console.info('[maple-compare] local dir resolve', { rawDir, result });
    if (!result.resolvedDir) {
      return reply.status(400).send({ error: `目录不存在或未找到 perf.data/*.pdata/*.pftrace: ${rawDir}`, ...result });
    }
    return { ...result };
  });

  app.post('/maple-compare/local', async (request, reply) => {
    const body = (request.body || {}) as LocalAnalyzeBody;
    const config = getConfig();
    const rawBaseDir = String(body.baseDir || '').trim();
    const rawOptDir = String(body.optDir || '').trim();

    if (!rawBaseDir || !rawOptDir) {
      return reply.status(400).send({ error: '请拖拽选择 baseDir 和 optDir' });
    }

    const baseResolve = resolveLocalRunDir(rawBaseDir, config);

    const optResolve = resolveLocalRunDir(rawOptDir, config);
    console.info('[maple-compare] local analyze resolve', { rawBaseDir, rawOptDir, baseResolve, optResolve });
    if (!baseResolve.resolvedDir) {
      return reply.status(400).send({ error: `baseDir 不存在或未找到 perf.data/*.pdata/*.pftrace: ${rawBaseDir}`, debug: baseResolve });
    }
    if (!optResolve.resolvedDir) {
      return reply.status(400).send({ error: `optDir 不存在或未找到 perf.data/*.pdata/*.pftrace: ${rawOptDir}`, debug: optResolve });
    }
    const baseDir = baseResolve.resolvedDir;
    const optDir = optResolve.resolvedDir;


    ensureMetaJson(baseDir, { label: 'base', device: body.device || '', scene: body.scene || '', compare_label: body.label || '' });
    ensureMetaJson(optDir, { label: 'opt', device: body.device || '', scene: body.scene || '', compare_label: body.label || '' });


    const sessionId = uuid();
    await createMapleCompareSession(sessionId, { ...body, baseDir, optDir });
    emitProgress(sessionId, 'stage', 'upload_completed', `已使用本地目录：base=${baseDir}，opt=${optDir}`, 25);
    return reply.status(201).send({ id: sessionId, status: 'pending', mode: 'local', baseDir, optDir });
  });


  app.post('/maple-compare/sessions/:id/analyze', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { aiModel?: string };
    const session = await getMapleCompareSession(id);
    if (!session) return reply.status(404).send({ error: 'Maple 三源对比 session 不存在' });

    await dbUpdate(id, { status: 'queued', error: null });
    emitProgress(id, 'stage', 'queued', '已进入 Maple 三源对比分析队列', 30);
    runMapleCompareAnalysis(id, body.aiModel || 'mock').catch(err => console.error('[maple-compare] analyze failed:', err));

    return { sessionId: id, status: 'queued' };
  });

  app.get('/maple-compare/sessions/:id/report', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await getMapleCompareSession(id);
    if (!session) return reply.status(404).send({ error: 'Maple 三源对比 session 不存在' });
    const paths = resolveArtifactPaths(id, session);
    let reportJson: any = null;
    let reportMd = '';
    if (paths.resultJsonPath && fs.existsSync(paths.resultJsonPath)) {
      reportJson = JSON.parse(fs.readFileSync(paths.resultJsonPath, 'utf-8'));
    }
    if (paths.reportMdPath && fs.existsSync(paths.reportMdPath)) {
      reportMd = fs.readFileSync(paths.reportMdPath, 'utf-8');
    }
    return { session: { ...session, ...paths }, reportJson, reportMd, events: progressEvents.get(id) || [] };
  });

  app.get('/maple-compare/sessions/:id/events', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await getMapleCompareSession(id);
    if (!session) return reply.status(404).send({ error: 'Maple 三源对比 session 不存在' });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const client = reply.raw as NodeJS.WritableStream;
    const clients = progressClients.get(id) || new Set<NodeJS.WritableStream>();
    clients.add(client);
    progressClients.set(id, clients);

    client.write(`data: ${JSON.stringify({ type: 'connected', sessionId: id, createdAt: Date.now() })}\n\n`);
    for (const event of progressEvents.get(id) || []) client.write(`data: ${JSON.stringify(event)}\n\n`);

    request.raw.on('close', () => {
      clients.delete(client);
      if (clients.size === 0) progressClients.delete(id);
    });
  });

  app.get('/maple-compare/sessions/:id/artifact/md', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await getMapleCompareSession(id);
    if (!session) return reply.status(404).send({ error: 'Maple 三源对比 session 不存在' });
    const paths = resolveArtifactPaths(id, session);
    if (!paths.reportMdPath || !fs.existsSync(paths.reportMdPath)) return reply.status(404).send({ error: 'Markdown 报告不存在' });
    return reply.sendFile(path.basename(paths.reportMdPath), path.dirname(paths.reportMdPath));
  });

  app.get('/maple-compare/sessions/:id/artifact/flame', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await getMapleCompareSession(id);
    if (!session) return reply.status(404).send({ error: 'Maple 三源对比 session 不存在' });
    const paths = resolveArtifactPaths(id, session);
    if (!paths.flamegraphPath || !fs.existsSync(paths.flamegraphPath)) return reply.status(404).send({ error: '差分火焰图尚未生成' });
    return reply.sendFile(path.basename(paths.flamegraphPath), path.dirname(paths.flamegraphPath));
  });
}

async function runMapleCompareAnalysis(sessionId: string, aiModel: string) {
  const startedAt = Date.now();
  const config = getConfig();
  const session = await getMapleCompareSession(sessionId);
  if (!session) throw new Error(`Maple 三源对比 session 不存在: ${sessionId}`);

  const resultDir = path.join(config.dataDir, 'maple-compare', sessionId, 'result');
  fs.mkdirSync(resultDir, { recursive: true });
  const outPrefix = path.join(resultDir, 'report');
  const scriptTextPath = `${outPrefix}.txt`;
  const resultJsonPath = `${outPrefix}.json`;
  const reportMdPath = path.join(resultDir, 'ai-report.md');


  await dbUpdate(sessionId, { status: 'running', error: null });
  emitProgress(sessionId, 'stage', 'extracting_perf', '正在调用 maple_compare.py 执行三源对比', 38);

  if (!session.baseDir || !session.optDir) {
    const error = 'baseDir 或 optDir 缺失';
    await dbUpdate(sessionId, { status: 'failed', error });
    emitEvent({ sessionId, type: 'error', stage: 'failed', message: 'Maple 三源对比失败', error, progress: 100, createdAt: Date.now() });
    return;
  }

  const python = process.env.PYTHON || 'python';
  const args: string[] = [
    path.join(config.skillProjectPath, 'scripts', 'maple_compare.py'),
    '--base', session.baseDir,
    '--opt', session.optDir,
    '--out', scriptTextPath,

  ];

  const result = await new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(python, args, { cwd: config.skillProjectPath, shell: true, windowsHide: true, env: { ...process.env } });
    let output = '';
    child.stdout.on('data', (d: Buffer) => {
      const text = d.toString();
      output += text;
      emitEvent({ sessionId, type: 'log', stage: 'extracting_perf', message: text.trim(), text, createdAt: Date.now() });
    });
    child.stderr.on('data', (d: Buffer) => {
      const text = d.toString();
      output += text;
      emitEvent({ sessionId, type: 'log', stage: 'extracting_perf', message: text.trim(), text, createdAt: Date.now() });
    });
    child.on('close', (code: number | null) => resolve({ code, output }));
    child.on('error', (err: Error) => resolve({ code: -1, output: err.message }));
  });


  if (result.code !== 0 || !fs.existsSync(resultJsonPath)) {
    const expected = { scriptTextPath, resultJsonPath, existingFiles: fs.existsSync(resultDir) ? fs.readdirSync(resultDir) : [] };
    const error = `${result.output || `退出码 ${result.code}`}\n[debug] ${JSON.stringify(expected)}`;
    await dbUpdate(sessionId, { status: 'failed', error });
    emitEvent({ sessionId, type: 'error', stage: 'failed', message: 'Maple 三源对比失败', error, progress: 100, createdAt: Date.now() });

    return;
  }

  const reportJson = JSON.parse(fs.readFileSync(resultJsonPath, 'utf-8'));
  await dbUpdate(sessionId, { status: 'ai_analyzing', resultJsonPath, reportMdPath: fs.existsSync(scriptTextPath) ? scriptTextPath : null });

  emitProgress(sessionId, 'stage', 'extract_completed', 'maple_compare.py 分析完成', 52);
  emitEvent({ sessionId, type: 'structured_report', stage: 'structured_report_ready', message: '结构化 JSON 已生成', progress: 65, report: reportJson, createdAt: Date.now() });
  emitArtifact(sessionId, 'json', resultJsonPath, 'JSON 结构化报告已产出');

  // 差分火焰图（整段采样，独立 spawn diff_flamegraph.py，与其它 Tab 解耦；失败不影响主报告）
  try {
    emitProgress(sessionId, 'stage', 'extract_completed', '正在生成差分火焰图（整段采样，约需 1~2 分钟）', 58);
    const flamePath = await generateMapleFlamegraph(session.baseDir!, session.optDir!, resultDir);
    emitArtifact(sessionId, 'flame', flamePath, '差分火焰图已生成');
  } catch (e: any) {
    emitEvent({ sessionId, type: 'log', stage: 'extract_completed', message: `差分火焰图生成失败（不影响其余报告）：${e.message || e}`, createdAt: Date.now() });
  }

  let reportMd = '';
  try {
    reportMd = await generateMapleAiReport(sessionId, reportJson, aiModel, {
      onPrompt: prompt => emitEvent({ sessionId, type: 'ai_prompt', stage: 'ai_prompt_ready', message: 'AI 分析提示词已生成', progress: 70, prompt, createdAt: Date.now() }),
      onThinking: message => emitProgress(sessionId, 'stage', 'ai_thinking', message, 74),
      onDelta: text => emitEvent({ sessionId, type: 'ai_delta', stage: 'ai_streaming', message: 'AI 正在输出 Maple 分析', progress: 82, text, createdAt: Date.now() }),
      onDone: () => emitProgress(sessionId, 'stage', 'ai_completed', 'AI 输出完成', 90),
    });
  } catch (err: any) {
    reportMd = `${buildMapleHeuristicReport(reportJson)}\n\n> AI 生成失败，已回退规则报告：${err.message || err}`;
    emitEvent({ sessionId, type: 'error', stage: 'ai_completed', message: 'AI 生成失败，已回退规则报告', error: err.message || String(err), progress: 90, createdAt: Date.now() });
  }

  emitProgress(sessionId, 'stage', 'writing_ai_report', '正在产出 report.md', 94);
  fs.writeFileSync(reportMdPath, reportMd, 'utf-8');
  emitArtifact(sessionId, 'md', reportMdPath, 'Markdown 报告产出完成');
  emitProgress(sessionId, 'stage', 'report_ready', 'Maple 三源对比报告产出完成', 98);

  await dbUpdate(sessionId, {
    status: 'completed',
    resultJsonPath,
    reportMdPath,
    completedAt: Date.now(),
    duration: Date.now() - startedAt,
  });
  emitEvent({ sessionId, type: 'done', stage: 'completed', message: '分析完成', progress: 100, createdAt: Date.now() });
}

interface MapleAiCallbacks {
  onPrompt?: (prompt: string) => void;
  onThinking?: (message: string) => void;
  onDelta?: (text: string) => void;
  onDone?: () => void;
}

async function generateMapleAiReport(sessionId: string, report: any, aiModel: string, callbacks: MapleAiCallbacks = {}) {
  const prompt = buildMapleAiPrompt(report);
  callbacks.onPrompt?.(prompt);

  if (aiModel === 'mock') {
    callbacks.onThinking?.('规则版分析，不调用真实模型，正在生成报告');
    const content = buildMapleHeuristicReport(report);
    for (const chunk of chunkText(content, 360)) callbacks.onDelta?.(chunk);
    callbacks.onDone?.();
    return content;
  }

  const sessionKey = `maple-compare-report-${sessionId}`;
  const entry = createOrGetAiSession(sessionKey, { model: aiModel, thinking: { type: 'adaptive' } });
  try {
    callbacks.onThinking?.('AI 已收到 Maple 三源对比提示词，正在思考');
    await entry.session.send(prompt);
    let content = '';
    for await (const msg of entry.session.stream()) {
      entry.lastActive = Date.now();
      const event = msg as any;
      if (event.type === 'assistant' || event.type === 'stream_event') {
        for (const block of event.message?.content || []) {
          if (block.type === 'text') {
            const text = block.text || '';
            content += text;
            callbacks.onDelta?.(text);
          }
        }
      } else if (event.type === 'result' && event.result && !content) {
        content = event.result;
        callbacks.onDelta?.(event.result);
      }
    }
    const finalContent = content.trim() || buildMapleHeuristicReport(report);
    callbacks.onDone?.();
    return finalContent;
  } catch (err) {
    destroyAiSession(sessionKey);
    throw err;
  }
}

async function generateMapleFlamegraph(baseDir: string, optDir: string, resultDir: string) {
  const config = getConfig();
  const outPath = path.join(resultDir, 'report_flamegraph.html');
  const python = process.env.PYTHON || 'python';
  const args = [
    path.join(config.skillProjectPath, 'scripts', 'diff_flamegraph.py'),
    '--base', baseDir,
    '--opt', optDir,
    '--out', outPath,
  ];
  const result = await new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(python, args, { cwd: config.skillProjectPath, shell: true, windowsHide: true, env: { ...process.env } });
    let output = '';
    child.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { output += d.toString(); });
    child.on('close', (code: number | null) => resolve({ code, output }));
    child.on('error', (err: Error) => resolve({ code: -1, output: err.message }));
  });
  if (result.code !== 0 || !fs.existsSync(outPath)) {
    throw new Error(result.output ? result.output.slice(-500) : `退出码 ${result.code}`);
  }
  return outPath;
}

async function createMapleCompareSession(sessionId: string, meta: MapleCompareMeta & { baseDir: string; optDir: string }) {
  const now = Date.now();
  const db = getDb();
  await db.insert(mapleCompareSessions).values({
    id: sessionId,
    label: meta.label || '',
    device: meta.device || '',
    scene: meta.scene || '',
    baseDir: meta.baseDir,
    optDir: meta.optDir,
    status: 'pending',
    error: null,
    resultJsonPath: null,
    reportMdPath: null,
    createdAt: now,
    completedAt: null,
    duration: null,
  });
}

async function getMapleCompareSession(id: string) {
  const db = getDb();
  return db.select().from(mapleCompareSessions).where(eq(mapleCompareSessions.id, id)).get();
}


async function dbUpdate(id: string, patch: Record<string, unknown>) {
  const db = getDb();
  await db.update(mapleCompareSessions).set(patch as any).where(eq(mapleCompareSessions.id, id));
}

function emitProgress(sessionId: string, type: SimpleperfProgressEvent['type'], stage: SimpleperfStage, message: string, progress?: number) {
  emitEvent({ sessionId, type, stage, message, progress, createdAt: Date.now() });
}

function emitArtifact(sessionId: string, kind: 'json' | 'md' | 'flame', filePath: string, message: string) {
  emitEvent({
    sessionId,
    type: 'artifact',
    stage: kind === 'md' ? 'report_ready' : 'structured_report_ready',
    message,
    progress: kind === 'md' ? 98 : kind === 'flame' ? 60 : 66,
    artifact: { kind, path: filePath, url: `/cpu/api/maple-compare/sessions/${sessionId}/artifact/${kind}` },
    createdAt: Date.now(),
  });
}

function emitEvent(event: SimpleperfProgressEvent) {
  const list = progressEvents.get(event.sessionId) || [];
  list.push(event);
  progressEvents.set(event.sessionId, list.slice(-300));

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of progressClients.get(event.sessionId) || []) {
    try {
      client.write(payload);
    } catch {
      progressClients.get(event.sessionId)?.delete(client);
    }
  }
}

function resolveArtifactPaths(sessionId: string, session: any) {
  const config = getConfig();
  const resultDir = path.join(config.dataDir, 'maple-compare', sessionId, 'result');
  const fallbackJson = path.join(resultDir, 'report.json');
  const fallbackMd = path.join(resultDir, 'ai-report.md');
  const fallbackFlame = path.join(resultDir, 'report_flamegraph.html');
  return {
    resultJsonPath: session.resultJsonPath || (fs.existsSync(fallbackJson) ? fallbackJson : null),
    reportMdPath: session.reportMdPath || (fs.existsSync(fallbackMd) ? fallbackMd : null),
    flamegraphPath: session.flamegraphPath || (fs.existsSync(fallbackFlame) ? fallbackFlame : null),
  };
}

function buildMapleAiPrompt(report: any) {
  return [
    '你是 Unity/Android 性能分析专家。请基于 Maple ILOpt 三源对比 JSON 生成中文 Markdown 报告。',
    '必须按四章结构输出：## 1. Unity Profiler / pdata 结论、## 2. simpleperf CPU 采样结论、## 3. perfetto 调度与帧时长结论、## 4. 三源交叉分析与下一步建议。',
    '要求覆盖 [A]~[H] 八个维度，区分高置信/中置信/低置信；指出优化有效、无效或采集证据不足；结论要可执行，避免只复述表格。',
    '下面是结构化 JSON 摘要：',
    JSON.stringify(compactMapleForAi(report), null, 2),
  ].join('\n\n');
}

function compactMapleForAi(report: any) {
  return {
    meta: report.meta,
    il2cpp_stats: report.il2cpp_stats,
    main_thread_hotspots: {
      compare: (report.main_thread_hotspots?.compare || []).slice(0, 15),
    },
    level1_so_compare: {
      threads: (report.level1_so_compare?.threads || []).slice(0, 6).map((t: any) => ({ ...t, libs: (t.libs || []).slice(0, 8) })),
    },
    level2_anchor_compare: { anchors: (report.level2_anchor_compare?.anchors || []).slice(0, 12) },
    level3_func_diff: { items: (report.level3_func_diff?.items || []).slice(0, 4) },
    worker_threads: (report.worker_threads || []).slice(0, 8),
    perfetto: report.perfetto,
    pdata: report.pdata,
    frame_counts: report.frame_counts,
  };
}

function buildMapleHeuristicReport(report: any) {
  const il2cpp = report.il2cpp_stats || {};
  const pdataBase = report.pdata?.base || {};
  const pdataOpt = report.pdata?.opt || {};
  const perfBase = report.perfetto?.base || {};
  const perfOpt = report.perfetto?.opt || {};
  const confidence = estimateConfidence(report);
  const lines = [
    '# Maple ILOpt 三源对比分析报告（规则版）',
    '',
    '## 1. Unity Profiler / pdata 结论',
    `- Base 帧数：${fmt(pdataBase.frame_count)}，Opt 帧数：${fmt(pdataOpt.frame_count)}。`,
    `- 帧时长 P95：${fmt(pdataBase.frame_ms_p95)}ms → ${fmt(pdataOpt.frame_ms_p95)}ms。`,
    `- PlayerLoop 均值：${fmt(pdataBase.markers?.PlayerLoop?.ms_mean)}ms → ${fmt(pdataOpt.markers?.PlayerLoop?.ms_mean)}ms。`,
    '',
    '## 2. simpleperf CPU 采样结论',
    `- libil2cpp 占比：${fmt(il2cpp.base_pct)}% → ${fmt(il2cpp.opt_pct)}%，变化 ${fmtSigned(il2cpp.delta_pp)}pp。`,
    `- libil2cpp 绝对耗时：${fmt(il2cpp.base_ms)}ms → ${fmt(il2cpp.opt_ms)}ms。`,
    `- 主线程热点变化 Top：${(report.main_thread_hotspots?.compare || []).slice(0, 5).map((h: any) => `${h.func}(${fmtSigned(h.delta_pct)}%)`).join('、') || '无' }。`,
    '',
    '## 3. perfetto 调度与帧时长结论',
    `- UnityMain Running：${fmt(perfBase.main_thread_running_pct)}% → ${fmt(perfOpt.main_thread_running_pct)}%。`,
    `- Runnable：${fmt(perfBase.main_thread_runnable_pct)}% → ${fmt(perfOpt.main_thread_runnable_pct)}%。`,
    `- 帧时长 P95：${fmt(perfBase.frame_p95_ms)}ms → ${fmt(perfOpt.frame_p95_ms)}ms。`,
    '',
    '## 4. 三源交叉分析与下一步建议',
    `- 综合置信度：${confidence.label}。`,
    ...confidence.notes.map(n => `- ${n}`),
    '- 若 simpleperf 改善但 pdata/perfetto 不改善，请检查采样窗口、场景一致性和 GPU/等待瓶颈。',
    '- 若 pdata/perfetto 改善但 simpleperf 无明显变化，请优先看主线程调度、WaitForTargetFPS、渲染线程与 Worker 迁移。',
  ];
  return lines.join('\n');
}

function estimateConfidence(report: any) {
  const notes: string[] = [];
  let score = 0;
  const il = report.il2cpp_stats || {};
  if (typeof il.delta_pp === 'number') {
    if (il.delta_pp < -0.5) { score += 1; notes.push('✓ simpleperf 显示 libil2cpp CPU 占比下降。'); }
    else if (il.delta_pp > 0.5) notes.push('! simpleperf 显示 libil2cpp CPU 占比上升。');
    else notes.push('≈ simpleperf 显示 libil2cpp 占比基本持平。');
  }
  const bP95 = report.pdata?.base?.frame_ms_p95;
  const oP95 = report.pdata?.opt?.frame_ms_p95;
  if (typeof bP95 === 'number' && typeof oP95 === 'number' && bP95 > 0) {
    const d = (oP95 - bP95) / bP95 * 100;
    if (d < -3) { score += 1; notes.push(`✓ pdata P95 帧时间下降 ${Math.abs(d).toFixed(1)}%。`); }
    else if (d > 3) notes.push(`! pdata P95 帧时间上升 ${d.toFixed(1)}%。`);
    else notes.push('≈ pdata P95 帧时间基本持平。');
  }
  const bRun = report.perfetto?.base?.main_thread_running_pct;
  const oRun = report.perfetto?.opt?.main_thread_running_pct;
  if (typeof bRun === 'number' && typeof oRun === 'number') {
    const d = oRun - bRun;
    if (d < -2) { score += 1; notes.push(`✓ perfetto UnityMain Running 占比下降 ${Math.abs(d).toFixed(1)}pp。`); }
    else if (d > 2) notes.push(`! perfetto UnityMain Running 占比上升 ${d.toFixed(1)}pp。`);
    else notes.push('≈ perfetto 主线程 Running 占比基本持平。');
  }
  return { label: score >= 2 ? '高' : score === 1 ? '中' : '低/证据不足', notes };
}

function chunkText(text: string, size: number) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function fmt(v: any) {
  return typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : 'N/A';
}

function fmtSigned(v: any) {
  return typeof v === 'number' && Number.isFinite(v) ? `${v > 0 ? '+' : ''}${v.toFixed(2)}` : 'N/A';
}

function ensureMetaJson(dir: string, meta: Record<string, unknown>) {
  const file = path.join(dir, 'meta.json');
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(meta, null, 2), 'utf-8');
}

function resolveLocalRunDir(input: string, config: ReturnType<typeof getConfig>) {
  const normalized = input.replace(/^file:\/\//, '').replace(/\\/g, '/').trim();
  const basename = path.basename(normalized) || normalized.split(/[\\/]/).filter(Boolean).pop() || normalized;
  const relativeInput = normalized.replace(/^\/+/, '');
  const searchRoots = getLocalSearchRoots(config);
  const candidates = new Set<string>();
  const checked: Array<{ path: string; exists: boolean; isDirectory: boolean; hasPerfData: boolean; sampleFiles: string[] }> = [];

  if (normalized && normalized !== '/') candidates.add(path.resolve(normalized));
  if (relativeInput && relativeInput !== normalized) candidates.add(path.resolve(relativeInput));
  for (const root of searchRoots) {
    if (relativeInput) candidates.add(path.resolve(root, relativeInput));
    if (basename && basename !== '/') {
      candidates.add(path.resolve(root, 'output', 'maple', basename));
      candidates.add(path.resolve(root, 'output', basename));
    }
  }
  if (relativeInput) candidates.add(path.resolve(config.dataDir, relativeInput));
  if (basename && basename !== '/') candidates.add(path.resolve(config.dataDir, 'maple', basename));

  for (const candidate of candidates) {
    const state = inspectRunDir(candidate);
    checked.push({ path: candidate, ...state });
    if (state.isDirectory && (state.hasPerfData || state.sampleFiles.length > 0)) {
      return { input, normalized, basename, resolvedDir: candidate, checked, searchRoots };
    }
  }

  for (const root of searchRoots) {
    const found = findRunDirByName(path.resolve(root, 'output'), basename, 5);
    if (found) return { input, normalized, basename, resolvedDir: found, checked, searchRoots };
  }

  return { input, normalized, basename, resolvedDir: null, checked, searchRoots };
}


function getLocalSearchRoots(config: ReturnType<typeof getConfig>) {
  const roots = new Set<string>();
  const addRoot = (dir?: string) => {
    if (dir && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) roots.add(path.resolve(dir));
  };

  addRoot(config.skillProjectPath);
  addRoot(process.cwd());
  addRoot(path.resolve(process.cwd(), '..'));
  addRoot(path.resolve(import.meta.dirname, '../../..'));
  addRoot(path.resolve(import.meta.dirname, '../../../..'));

  return Array.from(roots);
}


function findRunDirByName(root: string, targetName: string, maxDepth: number): string | null {
  if (maxDepth < 0 || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) return null;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(root, entry.name);
    if (entry.name === targetName && isUsableRunDir(full)) return full;
    const found = findRunDirByName(full, targetName, maxDepth - 1);
    if (found) return found;
  }
  return null;
}

function inspectRunDir(dir: string) {
  const exists = fs.existsSync(dir);
  const isDirectory = exists && fs.statSync(dir).isDirectory();
  const names = isDirectory ? fs.readdirSync(dir) : [];
  const hasPerfData = isDirectory && fs.existsSync(path.join(dir, 'perf.data'));
  const sampleFiles = names.filter(name => name.endsWith('.pdata') || name.endsWith('.pftrace')).slice(0, 10);
  return { exists, isDirectory, hasPerfData, sampleFiles };
}

function isUsableRunDir(dir: string) {
  const state = inspectRunDir(dir);
  return state.isDirectory && (state.hasPerfData || state.sampleFiles.length > 0);
}


function getPartRelativePath(part: any) {


  const fields = part.fields || {};
  return fields.webkitRelativePath?.value || fields.relativePath?.value || part.filename;
}

function stripTopDirectory(relative: string) {
  const normalized = relative.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length > 1) return parts.slice(1).join('/');
  return normalized;
}

function sanitizeRelativePath(input: string) {
  return input.replace(/^[a-zA-Z]:/, '').replace(/\.\./g, '').replace(/^[/\\]+/, '').replace(/[<>:"|?*]/g, '_') || 'file';
}
