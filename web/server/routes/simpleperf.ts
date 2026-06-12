import { FastifyInstance } from 'fastify';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { v4 as uuid } from 'uuid';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { simpleperfSessions } from '../db/schema.js';
import { assetService } from '../services/asset-service.js';
import { createOrGetAiSession, destroyAiSession } from '../services/ai-agent-session.js';
import { getConfig } from '../utils/config.js';
import type { SimpleperfProgressEvent, SimpleperfStage } from '../../shared/types.js';


interface SimpleperfMeta {
  projectName?: string;
  version?: string;
  branch?: string;
  buildId?: string;
  device?: string;
  scene?: string;
  runId?: string;
  notes?: string;
  binaryCacheLocalPath?: string;
}


const progressEvents = new Map<string, SimpleperfProgressEvent[]>();
const progressClients = new Map<string, Set<NodeJS.WritableStream>>();

export async function simpleperfRoutes(app: FastifyInstance) {

  app.get('/simpleperf/sessions', async (request) => {
    const query = request.query as { limit?: string };
    const limit = Math.min(Number(query.limit || 50), 200);
    const db = getDb();
    const items = await db.select().from(simpleperfSessions).orderBy(desc(simpleperfSessions.createdAt)).limit(limit).all();
    return { items };
  });

  app.get('/simpleperf/sessions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await getSimpleperfSession(id);
    if (!item) return reply.status(404).send({ error: 'simpleperf session 不存在' });
    return item;
  });

  app.post('/simpleperf/upload', async (request, reply) => {
    const sessionId = uuid();
    const config = getConfig();
    const workDir = path.join(config.dataDir, 'simpleperf', sessionId);
    const inputDir = path.join(workDir, 'input');
    const binaryCacheDir = path.join(inputDir, 'binary_cache');
    fs.mkdirSync(binaryCacheDir, { recursive: true });

    const meta: SimpleperfMeta = {};
    let perfDataAssetId = '';
    let binaryCacheAssetIds: string[] = [];
    let perfDataPath = '';
    let binaryCachePath = '';
    let perfDataName = '';
    let perfDataSize = 0;

    const parts = request.parts();
    for await (const part of parts) {
      if (part.type === 'field') {
        (meta as any)[part.fieldname] = String(part.value || '');
        continue;
      }

      if (part.fieldname === 'perfData') {
        const target = path.join(inputDir, sanitizePathPart(part.filename || 'perf.data'));
        await pipeline(part.file, fs.createWriteStream(target));
        const asset = await assetService.registerExistingFile({
          filePath: target,
          fileName: part.filename || 'perf.data',
          assetType: 'perf_data',
          source: 'web_upload',
          mimeType: part.mimetype,
          metadata: { ...meta },
        });
        perfDataAssetId = asset.id;
        perfDataPath = target;
        perfDataName = asset.fileName;
        perfDataSize = asset.fileSize;
      } else if (part.fieldname === 'binaryCacheFiles') {
        const relative = sanitizeRelativePath((part as any).fields?.webkitRelativePath?.value || part.filename || 'binary_cache_file');
        const target = path.join(binaryCacheDir, relative.replace(/^binary_cache[\\/]/, ''));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        await pipeline(part.file, fs.createWriteStream(target));
        const asset = await assetService.registerExistingFile({
          filePath: target,
          fileName: part.filename || path.basename(target),
          assetType: 'binary_cache_file',
          source: 'web_upload',
          mimeType: part.mimetype,
          metadata: { ...meta, relativePath: path.relative(binaryCacheDir, target).replace(/\\/g, '/') },
        });
        binaryCacheAssetIds.push(asset.id);
        binaryCachePath = binaryCacheDir;
      }
    }

    if (!perfDataPath) {
      return reply.status(400).send({ error: '请上传 perf.data 文件' });
    }

    const localBinaryCachePath = resolveLocalBinaryCachePath(meta.binaryCacheLocalPath);
    if (localBinaryCachePath) {
      if (!fs.existsSync(localBinaryCachePath) || !fs.statSync(localBinaryCachePath).isDirectory()) {
        return reply.status(400).send({ error: `本地 binary_cache 路径不存在或不是目录：${localBinaryCachePath}` });
      }
      binaryCachePath = localBinaryCachePath;
    }

    const now = Date.now();


    emitSimpleperfProgress(sessionId, 'stage', 'creating_session', '正在创建 simpleperf 分析会话', 18);
    const db = getDb();
    await db.insert(simpleperfSessions).values({

      id: sessionId,
      runId: meta.runId || null,
      fileName: perfDataName || path.basename(perfDataPath),
      fileSize: perfDataSize,
      perfDataPath,
      binaryCachePath: binaryCachePath || null,
      status: 'pending',
      projectName: meta.projectName || '',
      version: meta.version || '',
      branch: meta.branch || null,
      buildId: meta.buildId || null,
      device: meta.device || null,
      scene: meta.scene || null,
      notes: meta.notes || null,
      resultJsonPath: null,
      resultTextPath: null,
      foldedPath: null,
      flamegraphPath: null,
      error: null,
      aiReportPath: null,
      createdAt: now,
      completedAt: null,
      duration: null,
    });

    await assetService.linkSessionAsset({ sessionId, sessionType: 'simpleperf', assetId: perfDataAssetId, role: 'input' });
    for (const assetId of binaryCacheAssetIds) {
      await assetService.linkSessionAsset({ sessionId, sessionType: 'simpleperf', assetId, role: 'symbol' });
    }
    const symbolMessage = localBinaryCachePath ? `使用本地符号目录：${localBinaryCachePath}` : `上传符号文件 ${binaryCacheAssetIds.length} 个`;
    emitSimpleperfProgress(sessionId, 'stage', 'upload_completed', `上传完成：perf.data 1 个，${symbolMessage}`, 25);

    return reply.status(201).send({ id: sessionId, status: 'pending', perfDataAssetId, binaryCacheFiles: binaryCacheAssetIds.length, binaryCachePath });


  });

  app.post('/simpleperf/sessions/:id/analyze', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body || {}) as { topN?: number; flamegraphThread?: string; aiModel?: string };
    const session = await getSimpleperfSession(id);
    if (!session) return reply.status(404).send({ error: 'simpleperf session 不存在' });

    await dbUpdate(id, { status: 'queued', error: null });
    emitSimpleperfProgress(id, 'stage', 'queued', '已进入 simpleperf 分析队列', 30);
    runSimpleperfAnalysis(id, Number(body.topN || 60), body.flamegraphThread || '__ALL__', body.aiModel || 'mock').catch(err => {

      console.error('[simpleperf] analyze failed:', err);
    });

    return { sessionId: id, status: 'queued' };
  });

  app.get('/simpleperf/sessions/:id/report', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await getSimpleperfSession(id);
    if (!session) return reply.status(404).send({ error: 'simpleperf session 不存在' });
    const paths = resolveSimpleperfArtifactPaths(id, session);
    let report: any = null;
    let aiReport = '';
    if (paths.resultJsonPath && fs.existsSync(paths.resultJsonPath)) {
      report = JSON.parse(fs.readFileSync(paths.resultJsonPath, 'utf-8'));
    }
    if (paths.aiReportPath && fs.existsSync(paths.aiReportPath)) {
      aiReport = fs.readFileSync(paths.aiReportPath, 'utf-8');
    }
    return { session: { ...session, ...paths }, report, aiReport, events: progressEvents.get(id) || [] };
  });

  app.get('/simpleperf/sessions/:id/events', async (request, reply) => {
    const { id } = request.params as { id: string };
    const session = await getSimpleperfSession(id);
    if (!session) return reply.status(404).send({ error: 'simpleperf session 不存在' });

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
    for (const event of progressEvents.get(id) || []) {
      client.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    request.raw.on('close', () => {
      clients.delete(client);
      if (clients.size === 0) progressClients.delete(id);
    });
  });

  app.get('/simpleperf/sessions/:id/artifact/:kind', async (request, reply) => {

    const { id, kind } = request.params as { id: string; kind: string };
    const session = await getSimpleperfSession(id);
    if (!session) return reply.status(404).send({ error: 'simpleperf session 不存在' });
    const paths = resolveSimpleperfArtifactPaths(id, session);
    const filePath = kind === 'json' ? paths.resultJsonPath : kind === 'txt' ? paths.resultTextPath : kind === 'folded' ? paths.foldedPath : kind === 'ai' ? paths.aiReportPath : null;
    if (!filePath || !fs.existsSync(filePath)) return reply.status(404).send({ error: '产物不存在' });

    return reply.sendFile(path.basename(filePath), path.dirname(filePath));
  });
}

async function runSimpleperfAnalysis(sessionId: string, topN: number, flamegraphThread: string, aiModel: string) {
  const startedAt = Date.now();
  const db = getDb();
  const config = getConfig();
  const session = await getSimpleperfSession(sessionId);
  if (!session) throw new Error(`simpleperf session 不存在: ${sessionId}`);

  const simpleperfRoot = path.join(config.skillProjectPath, 'simpleperf');
  const outPrefix = path.join(config.dataDir, 'simpleperf', sessionId, 'result', 'analyze');
  fs.mkdirSync(path.dirname(outPrefix), { recursive: true });

  await db.update(simpleperfSessions).set({ status: 'running', error: null }).where(eq(simpleperfSessions.id, sessionId));
  emitSimpleperfProgress(sessionId, 'stage', 'extracting_perf', '正在提取 perf 信息并解析符号表', 38);

  const args = [path.join(simpleperfRoot, 'scripts', 'analyze.py'), session.perfDataPath, '--out', outPrefix, '--top', String(topN), '--flamegraph'];

  if (flamegraphThread && flamegraphThread !== '__ALL__') args.push(flamegraphThread);
  if (session.binaryCachePath) args.splice(2, 0, '--binary-cache', session.binaryCachePath);

  const python = process.env.PYTHON || 'python';
  const result = await new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(python, args, { cwd: simpleperfRoot, shell: true, windowsHide: true, env: { ...process.env } });
    let output = '';
    child.stdout.on('data', d => {
      const text = d.toString();
      output += text;
      emitSimpleperfEvent({ sessionId, type: 'log', stage: 'extracting_perf', message: text.trim(), text, createdAt: Date.now() });
    });
    child.stderr.on('data', d => {
      const text = d.toString();
      output += text;
      emitSimpleperfEvent({ sessionId, type: 'log', stage: 'extracting_perf', message: text.trim(), text, createdAt: Date.now() });
    });

    child.on('close', code => resolve({ code, output }));
    child.on('error', err => resolve({ code: -1, output: err.message }));
  });

  const resultJsonPath = outPrefix + '.json';
  const resultTextPath = outPrefix + '.txt';
  const foldedPath = outPrefix + '.folded';
  if (result.code !== 0 || !fs.existsSync(resultJsonPath)) {
    const error = result.output || `退出码 ${result.code}`;
    await db.update(simpleperfSessions).set({ status: 'failed', error }).where(eq(simpleperfSessions.id, sessionId));
    emitSimpleperfEvent({ sessionId, type: 'error', stage: 'failed', message: 'simpleperf 提取失败', error, progress: 100, createdAt: Date.now() });
    return;
  }

  emitSimpleperfProgress(sessionId, 'stage', 'extract_completed', 'perf 信息提取完成', 52);
  emitSimpleperfProgress(sessionId, 'stage', 'generating_structured_report', '正在生成结构化报告', 58);
  const report = JSON.parse(fs.readFileSync(resultJsonPath, 'utf-8'));
  const enhancedReport = enhanceSimpleperfReport(report);
  fs.writeFileSync(resultJsonPath, JSON.stringify(enhancedReport, null, 2), 'utf-8');

  await db.update(simpleperfSessions).set({
    status: 'ai_analyzing',
    resultJsonPath,
    resultTextPath: fs.existsSync(resultTextPath) ? resultTextPath : null,
    foldedPath: fs.existsSync(foldedPath) ? foldedPath : null,
  } as any).where(eq(simpleperfSessions.id, sessionId));
  emitSimpleperfEvent({ sessionId, type: 'structured_report', stage: 'structured_report_ready', message: '结构化报告已生成', progress: 65, report: enhancedReport, createdAt: Date.now() });
  emitSimpleperfArtifact(sessionId, 'json', resultJsonPath, 'JSON 结构化报告已产出');
  if (fs.existsSync(resultTextPath)) emitSimpleperfArtifact(sessionId, 'txt', resultTextPath, 'TXT 报告已产出');
  if (fs.existsSync(foldedPath)) emitSimpleperfArtifact(sessionId, 'folded', foldedPath, 'Folded stack 已产出');

  const aiReportPath = path.join(path.dirname(outPrefix), 'ai-report.md');
  let aiReport = '';
  try {
    aiReport = await generateSimpleperfAiReport(sessionId, enhancedReport, aiModel, {
      onPrompt: prompt => emitSimpleperfEvent({ sessionId, type: 'ai_prompt', stage: 'ai_prompt_ready', message: 'AI 分析提示词已生成', progress: 70, prompt, createdAt: Date.now() }),
      onThinking: message => emitSimpleperfProgress(sessionId, 'stage', 'ai_thinking', message, 74),
      onDelta: text => emitSimpleperfEvent({ sessionId, type: 'ai_delta', stage: 'ai_streaming', message: 'AI 正在输出分析', progress: 82, text, createdAt: Date.now() }),
      onDone: () => emitSimpleperfProgress(sessionId, 'stage', 'ai_completed', 'AI 输出完成', 90),
    });
  } catch (err: any) {
    aiReport = `${buildSimpleperfHeuristicReport(enhancedReport)}\n\n> AI 生成失败，已回退规则报告：${err.message || err}`;
    emitSimpleperfEvent({ sessionId, type: 'error', stage: 'ai_completed', message: 'AI 生成失败，已回退规则报告', error: err.message || String(err), progress: 90, createdAt: Date.now() });
  }

  emitSimpleperfProgress(sessionId, 'stage', 'writing_ai_report', '正在产出 ai-report.md', 94);
  fs.writeFileSync(aiReportPath, aiReport, 'utf-8');
  emitSimpleperfArtifact(sessionId, 'ai', aiReportPath, 'ai-report.md 产出完成');
  emitSimpleperfProgress(sessionId, 'stage', 'report_ready', '分析报告产出完成', 98);

  await db.update(simpleperfSessions).set({
    status: 'completed',
    resultJsonPath,
    resultTextPath: fs.existsSync(resultTextPath) ? resultTextPath : null,
    foldedPath: fs.existsSync(foldedPath) ? foldedPath : null,
    completedAt: Date.now(),
    duration: Date.now() - startedAt,
    aiReportPath,
  } as any).where(eq(simpleperfSessions.id, sessionId));
  emitSimpleperfEvent({ sessionId, type: 'done', stage: 'completed', message: '分析完成', progress: 100, createdAt: Date.now() });

  for (const item of [

    { path: resultJsonPath, type: 'report_json', role: 'report' },
    { path: resultTextPath, type: 'report_txt', role: 'report' },
    { path: foldedPath, type: 'folded_stack', role: 'flamegraph' },
    { path: aiReportPath, type: 'report_md', role: 'ai_report' },
  ]) {
    if (!fs.existsSync(item.path)) continue;
    const asset = await assetService.registerExistingFile({ filePath: item.path, assetType: item.type, source: 'generated', metadata: { sessionId } });
    await assetService.linkSessionAsset({ sessionId, sessionType: 'simpleperf', assetId: asset.id, role: item.role });
  }
}

async function getSimpleperfSession(id: string) {
  const db = getDb();
  return db.select().from(simpleperfSessions).where(eq(simpleperfSessions.id, id)).get();
}

function emitSimpleperfProgress(sessionId: string, type: SimpleperfProgressEvent['type'], stage: SimpleperfStage, message: string, progress?: number) {
  emitSimpleperfEvent({ sessionId, type, stage, message, progress, createdAt: Date.now() });
}

function emitSimpleperfArtifact(sessionId: string, kind: 'json' | 'txt' | 'folded' | 'ai', filePath: string, message: string) {
  emitSimpleperfEvent({
    sessionId,
    type: 'artifact',
    stage: kind === 'ai' ? 'report_ready' : 'structured_report_ready',
    message,
    progress: kind === 'ai' ? 98 : 66,
    artifact: { kind, path: filePath, url: `/cpu/api/simpleperf/sessions/${sessionId}/artifact/${kind}` },
    createdAt: Date.now(),
  });
}

function emitSimpleperfEvent(event: SimpleperfProgressEvent) {
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

function resolveSimpleperfArtifactPaths(sessionId: string, session: any) {
  const config = getConfig();
  const resultDir = path.join(config.dataDir, 'simpleperf', sessionId, 'result');
  const fallbackJson = path.join(resultDir, 'analyze.json');
  const fallbackTxt = path.join(resultDir, 'analyze.txt');
  const fallbackFolded = path.join(resultDir, 'analyze.folded');
  const fallbackAi = path.join(resultDir, 'ai-report.md');
  return {
    resultJsonPath: session.resultJsonPath || (fs.existsSync(fallbackJson) ? fallbackJson : null),
    resultTextPath: session.resultTextPath || (fs.existsSync(fallbackTxt) ? fallbackTxt : null),
    foldedPath: session.foldedPath || (fs.existsSync(fallbackFolded) ? fallbackFolded : null),
    aiReportPath: session.aiReportPath || (fs.existsSync(fallbackAi) ? fallbackAi : null),
  };
}


async function dbUpdate(id: string, patch: Record<string, unknown>) {
  const db = getDb();
  await db.update(simpleperfSessions).set(patch as any).where(eq(simpleperfSessions.id, id));
}

function enhanceSimpleperfReport(report: any) {
  const lowValueReasons = [
    { test: (f: string) => f.startsWith('!!!') || /\[\+0x?[0-9a-f]+\]/i.test(f), reason: '未符号化地址，需检查 binary_cache/符号表，不能直接作为业务结论' },
    { test: (f: string) => /memcpy|memmove|memset|pthread_|syscall|malloc|free|operator new|operator delete/i.test(f), reason: '通用系统/内存/runtime 调用，需看调用方或折叠栈上游业务帧' },
    { test: (f: string) => /luaV_execute|luaD_call|lua_pcall|propagatemark|luaC_|GC_/i.test(f), reason: '脚本虚拟机/GC 底层入口，需定位 Lua/C# 调用栈或触发场景' },
    { test: (_f: string, lib: string) => /libGLES|vulkan|adreno|mali/i.test(lib), reason: 'GPU Driver 符号，通常需要结合渲染线程上游 Unity/业务渲染调用判断' },
  ];

  const hotspots = (report.hotspots || []).map((h: any) => {
    const reason = lowValueReasons.find(r => r.test(String(h.func || ''), String(h.lib || '')))?.reason || '';
    return {
      ...h,
      diagnosticValue: reason ? 'low' : 'candidate',
      reason,
    };
  });

  const businessHotspots = hotspots.filter((h: any) => h.diagnosticValue !== 'low').slice(0, 20);
  const lowValueHotspots = hotspots.filter((h: any) => h.diagnosticValue === 'low').slice(0, 20);
  const unresolvedCount = hotspots.filter((h: any) => String(h.func || '').startsWith('!!!') || /\[\+0x?[0-9a-f]+\]/i.test(String(h.func || ''))).length;

  return {
    ...report,
    hotspots,
    businessHotspots,
    lowValueHotspots,
    diagnostics: {
      unresolvedCount,
      lowValueCount: lowValueHotspots.length,
      topThread: report.threads?.[0] || null,
      topLib: report.libs?.[0] || null,
    },
  };
}

interface SimpleperfAiCallbacks {
  onPrompt?: (prompt: string) => void;
  onThinking?: (message: string) => void;
  onDelta?: (text: string) => void;
  onDone?: () => void;
}

async function generateSimpleperfAiReport(sessionId: string, report: any, aiModel: string, callbacks: SimpleperfAiCallbacks = {}) {
  const prompt = buildSimpleperfAiPrompt(report);
  callbacks.onPrompt?.(prompt);

  if (aiModel === 'mock') {
    callbacks.onThinking?.('规则版分析，不调用真实模型，正在生成报告');
    const content = buildSimpleperfHeuristicReport(report);
    for (const chunk of chunkText(content, 360)) callbacks.onDelta?.(chunk);
    callbacks.onDone?.();
    return content;
  }

  const sessionKey = `simpleperf-report-${sessionId}`;
  const entry = createOrGetAiSession(sessionKey, { model: aiModel, thinking: { type: 'adaptive' } });

  try {
    callbacks.onThinking?.('AI 已收到首轮提示词，正在思考');
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
    const finalContent = content.trim() || buildSimpleperfHeuristicReport(report);
    callbacks.onDone?.();
    return finalContent;
  } catch (err: any) {
    console.error('[simpleperf] AI report failed:', err);
    destroyAiSession(sessionKey);
    throw err;
  }
}

function buildSimpleperfAiPrompt(report: any) {
  return [
    '你是 Android native simpleperf 性能分析助手。请基于下面 simpleperf 单次分析结果生成中文性能分析报告。',
    '分析原则：\n1. 不要简单复述 Top Hotspots。\n2. 优先基于线程 CPU 分布、SO 占比、业务候选热点给结论。\n3. 对 memcpy/memmove/memset/pthread/syscall/malloc/free/operator new/delete/luaV_execute/luaD_call/luaC_/GC/GPU Driver/未符号化地址等低诊断价值热点，需要解释为什么不能直接作为业务结论。\n4. 如存在未符号化符号、libxxx.so[+offset]、!!! 等情况，必须评估 binary_cache / unstripped so / build-id 匹配风险。\n5. 结论要区分高置信结论、中置信业务线索、低置信/需要补采证据。\n6. 输出要面向研发可执行，避免泛泛而谈。',
    '请按以下结构输出：\n# simpleperf AI 分析报告\n\n## 1. 结论摘要\n## 2. 关键证据\n## 3. 业务可疑点\n## 4. 低诊断价值热点说明\n## 5. 符号化与采集质量\n## 6. 下一步验证建议',
    '下面是 simpleperf 结构化摘要：',
    JSON.stringify(compactSimpleperfForAi(report), null, 2),
  ].join('\n\n');
}


function chunkText(text: string, size: number) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function compactSimpleperfForAi(report: any) {

  return {
    meta: report.meta,
    diagnostics: report.diagnostics,
    threads: (report.threads || []).slice(0, 8),
    libs: (report.libs || []).slice(0, 10),
    businessHotspots: (report.businessHotspots || []).slice(0, 15),
    lowValueHotspots: (report.lowValueHotspots || []).slice(0, 12),
  };
}

function buildSimpleperfHeuristicReport(report: any) {
  const topThread = report.diagnostics?.topThread;
  const topLib = report.diagnostics?.topLib;
  const business = report.businessHotspots || [];
  const low = report.lowValueHotspots || [];
  const lines = [
    '# simpleperf AI 分析报告（规则版）',
    '',
    '## 结论摘要',
    `- CPU 采样主要集中在线程：${topThread ? `${topThread.name} (${topThread.pct}%)` : '未知'}。`,
    `- SO 占比最高：${topLib ? `${topLib.name} (${topLib.pct}%)` : '未知'}。`,
    `- 当前 Top 热点中低诊断价值项 ${report.diagnostics?.lowValueCount || 0} 个，未符号化项 ${report.diagnostics?.unresolvedCount || 0} 个。`,
    '',
    '## 业务可疑点（优先看这些，而不是底层通用函数）',
  ];

  if (business.length === 0) {
    lines.push('- 暂未从 Top 热点中识别出高置信业务函数；建议先修复符号化并查看 folded stack 上游调用链。');
  } else {
    business.slice(0, 10).forEach((h: any, idx: number) => {
      lines.push(`${idx + 1}. \`${h.func}\` · ${h.lib} · ${h.pct}% · self ${h.self_ms}`);
    });
  }

  lines.push('', '## 低价值热点说明');
  low.slice(0, 10).forEach((h: any) => lines.push(`- \`${h.func}\` · ${h.lib} · ${h.pct}%：${h.reason}`));

  lines.push(
    '',
    '## 下一步验证建议',
    '- 不要直接把 `luaV_execute`、`__memcpy`、`propagatemark`、未符号化 `!!!...` 当作业务结论；应查看 folded stack/火焰图中的上游业务帧。',
    '- 若 `!!!...` 或 `libxxx.so[+offset]` 较多，优先检查上传的 `binary_cache` 是否包含对应 unstripped so、build-id 是否匹配。',
    '- 对候选业务函数做 A/B 对比或场景复现，确认它们是否随版本/功能开关变化。',
  );
  return lines.join('\n');
}

function resolveLocalBinaryCachePath(input?: string) {
  const value = String(input || '').trim();
  if (!value) return '';
  const normalized = path.resolve(value);
  return normalized;
}

function sanitizePathPart(input: string) {
  return input.replace(/[\\/:*?"<>|]/g, '_') || 'file';
}


function sanitizeRelativePath(input: string) {
  return input.replace(/^[a-zA-Z]:/, '').replace(/\.\./g, '').replace(/^[/\\]+/, '').replace(/[<>:"|?*]/g, '_') || 'file';
}
