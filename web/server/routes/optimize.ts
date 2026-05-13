import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { getConfig, updateConfig } from '../utils/config.js';
import { getDb } from '../db/index.js';
import { optimizeResults } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import type { SourcePathStatus, OptimizeSuggestRequest, OptimizeSuggestEvent, CliProvider } from '../../shared/types.js';

interface SourceMapping {
  source: 'grep' | 'engine';
  files?: { path: string; line: number }[];
  snippet?: string;
  note?: string;
}

interface MarkerSourceMap {
  _meta: { lastUpdated: string; projectPath: string };
  [markerName: string]: SourceMapping | any;
}

export async function optimizeRoutes(app: FastifyInstance) {

  // ============================================================
  // 源码路径配置
  // ============================================================

  app.get('/config/source-path', async () => {
    const config = getConfig();
    const p = config.sourceProjectPath;
    if (!p) return { configured: false } satisfies SourcePathStatus;

    const exists = fs.existsSync(p);
    const hasAssets = exists && fs.existsSync(path.join(p, 'Assets'));
    return {
      configured: true,
      path: p,
      hasAssets,
    } satisfies SourcePathStatus;
  });

  app.post('/config/source-path', async (request, reply) => {
    const { path: srcPath } = request.body as { path: string };
    if (!srcPath || typeof srcPath !== 'string') {
      return reply.status(400).send({ error: '请提供源码路径' });
    }

    const normalized = path.resolve(srcPath);
    if (!fs.existsSync(normalized)) {
      return reply.status(400).send({ error: `路径不存在: ${normalized}` });
    }

    const hasAssets = fs.existsSync(path.join(normalized, 'Assets'));
    updateConfig({ sourceProjectPath: normalized });

    return {
      configured: true,
      path: normalized,
      hasAssets,
    } satisfies SourcePathStatus;
  });

  // ============================================================
  // Marker 源码映射（调用 map-source.ts）
  // ============================================================

  app.post('/optimize/map-source', async (request, reply) => {
    const { sessionId } = request.body as { sessionId: string };
    const config = getConfig();

    if (!config.sourceProjectPath) {
      return reply.status(412).send({ error: '未配置源码路径，请先在设置中关联 Unity 工程目录' });
    }

    const resultDir = path.join(config.dataDir, 'results', sessionId);
    const preprocessPath = path.join(resultDir, 'preprocess-result.json');
    if (!fs.existsSync(preprocessPath)) {
      return reply.status(404).send({ error: '未找到预处理数据' });
    }

    const mapOutputPath = path.join(resultDir, 'marker-source-map.json');

    // 如果已有缓存且源码路径未变，直接返回
    if (fs.existsSync(mapOutputPath)) {
      try {
        const cached: MarkerSourceMap = JSON.parse(fs.readFileSync(mapOutputPath, 'utf-8'));
        if (cached._meta?.projectPath === config.sourceProjectPath) {
          return { cached: true, map: cached };
        }
      } catch { /* re-generate */ }
    }

    const skillScriptsDir = path.resolve(
      config.skillProjectPath,
      '.claude/skills/unity-profiler-analysis/scripts',
    );
    const mapSourceScript = path.join(skillScriptsDir, 'map-source.ts');

    if (!fs.existsSync(mapSourceScript)) {
      return reply.status(500).send({ error: 'map-source.ts 脚本不存在' });
    }

    // 同步执行 map-source.ts（通常 < 10s）
    return new Promise((resolve) => {
      const child = spawn('npx', [
        'tsx', mapSourceScript,
        '--input', preprocessPath,
        '--project', config.sourceProjectPath!,
        '--output', mapOutputPath,
      ], {
        cwd: skillScriptsDir,
        shell: true,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stderr = '';
      child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

      child.on('close', (code) => {
        if (code === 0 && fs.existsSync(mapOutputPath)) {
          try {
            const map = JSON.parse(fs.readFileSync(mapOutputPath, 'utf-8'));
            resolve({ cached: false, map });
          } catch {
            reply.status(500).send({ error: '解析 marker-source-map.json 失败' });
            resolve(undefined);
          }
        } else {
          reply.status(500).send({ error: `map-source 执行失败 (code=${code}): ${stderr.slice(0, 500)}` });
          resolve(undefined);
        }
      });

      child.on('error', (err) => {
        reply.status(500).send({ error: `map-source 启动失败: ${err.message}` });
        resolve(undefined);
      });

      setTimeout(() => {
        if (child.exitCode === null) {
          child.kill('SIGTERM');
          reply.status(504).send({ error: 'map-source 执行超时 (60s)' });
          resolve(undefined);
        }
      }, 60_000);
    });
  });

  // ============================================================
  // AI 优化建议 — POST start + GET progress (SSE) + DB 持久化
  // ============================================================

  interface TaskState {
    child: ReturnType<typeof spawn> | null;
    promptFile: string;
    sessionId: string;
    issueKey: string;
    issueType: string;
    sourceFiles: { path: string; line: number; snippet?: string }[];
    resultChunks: string[];
    eventBuffer: OptimizeSuggestEvent[];
  }

  const optimizeTasks = new Map<string, TaskState>();
  const optimizeSseClients = new Map<string, Set<(event: OptimizeSuggestEvent) => void>>();

  function broadcastTask(taskId: string, event: OptimizeSuggestEvent) {
    const clients = optimizeSseClients.get(taskId);
    if (clients && clients.size > 0) {
      for (const send of clients) send(event);
    } else {
      const task = optimizeTasks.get(taskId);
      if (task) task.eventBuffer.push(event);
    }
  }

  function handleOptimizeStreamEvent(taskId: string, event: any) {
    switch (event.type) {
      case 'system':
        if (event.subtype === 'init') {
          broadcastTask(taskId, { type: 'log', log: `[系统] model: ${event.model}` });
        }
        break;

      case 'assistant':
        for (const block of (event.message?.content || [])) {
          if (block.type === 'thinking') {
            broadcastTask(taskId, { type: 'log', log: `[思考] ${(block.thinking || '').slice(0, 150)}` });
          }
          if (block.type === 'text' && block.text) {
            const task = optimizeTasks.get(taskId);
            if (task) task.resultChunks.push(block.text);
            broadcastTask(taskId, { type: 'chunk', text: block.text });
          }
          if (block.type === 'tool_use') {
            const toolName = block.name || 'unknown';
            const inputStr = JSON.stringify(block.input || {}).slice(0, 200);
            broadcastTask(taskId, { type: 'log', log: `[工具] ${toolName}: ${inputStr}` });
          }
        }
        break;

      case 'user':
        for (const r of (event.message?.content || [])) {
          if (r.type === 'tool_result') {
            const text = r.content?.[0]?.text || '';
            const prefix = r.is_error ? '[工具错误]' : '[工具结果]';
            broadcastTask(taskId, { type: 'log', log: `${prefix} ${text.slice(0, 200)}` });
          }
        }
        break;

      case 'result': {
        const cost = event.total_cost_usd ? `$${event.total_cost_usd.toFixed(4)}` : '';
        const duration = event.duration_ms ? `${Math.round(event.duration_ms / 1000)}s` : '';
        broadcastTask(taskId, { type: 'log', log: `[完成] 耗时: ${duration}, 费用: ${cost}` });
        break;
      }
    }
  }

  function saveOptimizeResultToDb(task: TaskState) {
    const fullResult = task.resultChunks.join('');
    if (!fullResult) return;
    try {
      const db = getDb();
      const existing = db.select().from(optimizeResults)
        .where(and(
          eq(optimizeResults.sessionId, task.sessionId),
          eq(optimizeResults.issueKey, task.issueKey),
        ))
        .get();

      const sourceFilesJson = JSON.stringify(
        task.sourceFiles.map(f => ({ path: f.path, line: f.line }))
      );

      if (existing) {
        db.update(optimizeResults)
          .set({ result: fullResult, sourceFiles: sourceFilesJson, createdAt: Date.now() })
          .where(eq(optimizeResults.id, existing.id))
          .run();
      } else {
        db.insert(optimizeResults).values({
          id: randomUUID(),
          sessionId: task.sessionId,
          issueKey: task.issueKey,
          issueType: task.issueType,
          result: fullResult,
          sourceFiles: sourceFilesJson,
          createdAt: Date.now(),
        }).run();
      }
      console.log(`[optimize] Saved result to DB: session=${task.sessionId} issue=${task.issueKey} len=${fullResult.length}`);
    } catch (err: any) {
      console.error('[optimize] Failed to save result:', err.message);
    }
  }

  // ---- 查询 API ----

  app.get('/optimize/results/:sessionId', async (request) => {
    const { sessionId } = request.params as { sessionId: string };
    const db = getDb();
    const rows = db.select().from(optimizeResults)
      .where(eq(optimizeResults.sessionId, sessionId))
      .all();

    const result: Record<string, { result: string; sourceFiles: any[]; createdAt: number }> = {};
    for (const row of rows) {
      result[row.issueKey] = {
        result: row.result || '',
        sourceFiles: row.sourceFiles ? JSON.parse(row.sourceFiles) : [],
        createdAt: row.createdAt,
      };
    }
    return result;
  });

  // ---- POST /optimize/start ----

  app.post('/optimize/start', async (request, reply) => {
    const body = request.body as OptimizeSuggestRequest & { issueKey: string };
    const config = getConfig();

    if (!config.sourceProjectPath) {
      return reply.status(412).send({ error: '未配置源码路径' });
    }

    const resultDir = path.join(config.dataDir, 'results', body.sessionId);
    const mapPath = path.join(resultDir, 'marker-source-map.json');

    let sourceFiles: { path: string; line: number; snippet?: string }[] = [];
    let sourceContext = '（无法定位到源码文件）';

    if (fs.existsSync(mapPath)) {
      try {
        const map: MarkerSourceMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'));
        const mapping = map[body.markerName] as SourceMapping | undefined;
        if (mapping?.files && mapping.files.length > 0) {
          sourceFiles = mapping.files.map(f => ({
            path: f.path,
            line: f.line,
            snippet: readSourceSnippet(f.path, f.line, config.sourceProjectPath!),
          }));
          sourceContext = sourceFiles.map(f =>
            `文件: ${f.path}:${f.line}\n\`\`\`csharp\n${f.snippet || '(无法读取)'}\n\`\`\``
          ).join('\n\n');
        }
      } catch { /* proceed without source map */ }
    }

    const prompt = buildOptimizePrompt(body, sourceContext);
    const promptFile = path.join(resultDir, `optimize-prompt-${Date.now()}.txt`);
    fs.writeFileSync(promptFile, prompt, 'utf-8');

    const taskId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const cliCommand = config.cliPaths?.codebuddy
      || config.cliPaths?.claude
      || 'codebuddy';

    const promptFilePosix = promptFile.replace(/\\/g, '/');
    const shortPrompt = `请先用 Read 工具读取 ${promptFilePosix} 文件的全部内容，然后严格按照文件中的指令输出分析结果。用中文回答。`;
    const quotedPrompt = `"${shortPrompt.replace(/"/g, '\\"')}"`;
    const args = [
      '-p', quotedPrompt,
      '--output-format', 'stream-json',
      '-y',
      '--allowedTools', 'Read',
    ];

    console.log('[optimize] taskId:', taskId, 'issueKey:', body.issueKey);
    console.log('[optimize] CLI:', cliCommand);
    console.log('[optimize] CWD:', config.sourceProjectPath);

    const child = spawn(cliCommand, args, {
      cwd: config.sourceProjectPath,
      shell: true,
      windowsHide: true,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    console.log('[optimize] CLI pid:', child.pid);

    const taskState: TaskState = {
      child,
      promptFile,
      sessionId: body.sessionId,
      issueKey: body.issueKey,
      issueType: body.issueType,
      sourceFiles,
      resultChunks: [],
      eventBuffer: [],
    };
    optimizeTasks.set(taskId, taskState);
    if (!optimizeSseClients.has(taskId)) {
      optimizeSseClients.set(taskId, new Set());
    }

    broadcastTask(taskId, { type: 'source_found', sourceFiles });
    broadcastTask(taskId, { type: 'log', log: `[系统] 正在启动 CLI...` });

    let jsonBuffer = '';
    let hasOutput = false;

    child.stdout?.on('data', (data: Buffer) => {
      hasOutput = true;
      jsonBuffer += data.toString();
      const lines = jsonBuffer.split('\n');
      jsonBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          handleOptimizeStreamEvent(taskId, event);
        } catch {
          if (trimmed.length > 5 && !trimmed.startsWith('{')) {
            broadcastTask(taskId, { type: 'log', log: trimmed.slice(0, 300) });
          }
        }
      }
    });

    let stderrBuf = '';
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      stderrBuf += text;
      if (text) {
        broadcastTask(taskId, { type: 'log', log: `[stderr] ${text.slice(0, 300)}` });
      }
    });

    child.on('close', (code, signal) => {
      console.log(`[optimize] CLI exited code=${code} signal=${signal} hasOutput=${hasOutput}`);
      if (code === 0) {
        saveOptimizeResultToDb(taskState);
        broadcastTask(taskId, { type: 'done' });
      } else {
        const hint = !hasOutput && stderrBuf
          ? stderrBuf.trim().slice(0, 300)
          : `退出码 ${code}, 信号 ${signal}`;
        broadcastTask(taskId, { type: 'error', error: `CLI 执行失败: ${hint}` });
      }
      try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
      setTimeout(() => {
        optimizeTasks.delete(taskId);
        optimizeSseClients.delete(taskId);
      }, 10_000);
    });

    child.on('error', (err) => {
      console.error('[optimize] CLI spawn error:', err.message);
      broadcastTask(taskId, { type: 'error', error: `CLI 启动失败: ${err.message}。请确认 codebuddy 或 claude 命令可用。` });
    });

    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        broadcastTask(taskId, { type: 'error', error: '优化分析超时 (10分钟)' });
      }
    }, 10 * 60 * 1000);

    return { taskId, sourceFiles };
  });

  // ---- GET /optimize/progress/:taskId — SSE ----

  app.get('/optimize/progress/:taskId', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    if (!optimizeSseClients.has(taskId)) {
      optimizeSseClients.set(taskId, new Set());
    }

    const send = (event: OptimizeSuggestEvent) => {
      try {
        if (!reply.raw.writable) return;
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch { /* ignore */ }
    };

    optimizeSseClients.get(taskId)!.add(send);

    // Flush buffered events that arrived before SSE connected
    const task = optimizeTasks.get(taskId);
    if (task && task.eventBuffer.length > 0) {
      for (const buffered of task.eventBuffer) send(buffered);
      task.eventBuffer.length = 0;
    }

    request.raw.on('close', () => {
      const clients = optimizeSseClients.get(taskId);
      if (clients) {
        clients.delete(send);
        if (clients.size === 0) {
          optimizeSseClients.delete(taskId);
        }
      }
      if (optimizeSseClients.get(taskId)?.size === 0) {
        const t = optimizeTasks.get(taskId);
        if (t?.child && t.child.exitCode === null) {
          console.log('[optimize] All SSE clients disconnected, killing CLI');
          t.child.kill('SIGTERM');
        }
      }
    });

    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', taskId })}\n\n`);
  });

  // ---- POST /optimize/cancel/:taskId ----

  app.post('/optimize/cancel/:taskId', async (request) => {
    const { taskId } = request.params as { taskId: string };
    const task = optimizeTasks.get(taskId);
    if (task?.child && task.child.exitCode === null) {
      task.child.kill('SIGTERM');
      return { cancelled: true };
    }
    return { cancelled: false };
  });

  // ---- POST /optimize/apply-patch ----

  app.post('/optimize/apply-patch', async (request, reply) => {
    const { filePath, before, after } = request.body as { filePath: string; before: string; after: string };
    const config = getConfig();

    if (!config.sourceProjectPath) {
      return reply.status(412).send({ error: '未配置源码路径' });
    }
    if (!filePath || !before || !after) {
      return reply.status(400).send({ error: '缺少 filePath / before / after 参数' });
    }

    const fullPath = path.isAbsolute(filePath)
      ? filePath
      : path.join(config.sourceProjectPath, filePath);

    if (!fs.existsSync(fullPath)) {
      return reply.status(404).send({ error: `文件不存在: ${fullPath}` });
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    if (!content.includes(before)) {
      return reply.status(409).send({ error: '源文件内容与修改前代码不匹配，可能已被修改' });
    }

    fs.writeFileSync(fullPath, content.replace(before, after), 'utf-8');
    console.log(`[optimize] Applied patch to ${fullPath}`);
    return { success: true, file: fullPath };
  });
}

// ============================================================
// 工具函数
// ============================================================

function readSourceSnippet(filePath: string, line: number, projectRoot: string): string {
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);
  try {
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, line - 10);
    const end = Math.min(lines.length, line + 20);
    return lines.slice(start, end).map((l, i) => {
      const lineNo = start + i + 1;
      const marker = lineNo === line ? ' >>>' : '    ';
      return `${marker} ${lineNo}: ${l}`;
    }).join('\n');
  } catch {
    return '';
  }
}

function buildOptimizePrompt(req: OptimizeSuggestRequest, sourceContext: string): string {
  const { issueType, markerName, callChain, hotPath, perfContext } = req;

  const perfDesc = issueType === 'jank'
    ? `帧耗时 ${perfContext.msFrame?.toFixed(1)}ms（${perfContext.ratio?.toFixed(1)}x median），主导 Marker: ${perfContext.dominantMarker || markerName}`
    : `self 均值 ${perfContext.msSelfMean?.toFixed(2)}ms，self 最大 ${perfContext.msSelfMax?.toFixed(2)}ms，占帧比例 ${perfContext.percentOfFrame?.toFixed(1)}%，线程: ${perfContext.thread || 'Main Thread'}`;

  const chainDesc = callChain
    ? `调用链:\n${callChain}`
    : hotPath
      ? `热路径:\n${hotPath}`
      : '';

  return [
    `你是一个资深 Unity 性能优化专家。请严格按照以下 Markdown 格式输出分析结果，不要偏离格式。`,
    ``,
    `## 输入信息`,
    `- 类型: ${issueType === 'hotspot' ? '热点 Marker' : issueType === 'jank' ? '卡顿帧' : '波动 Marker'}`,
    `- Marker: ${markerName}`,
    `- 数据: ${perfDesc}`,
    chainDesc ? `- ${chainDesc}` : '',
    `- 源码:\n${sourceContext}`,
    ``,
    `## 严格输出格式（必须遵守）`,
    ``,
    `按以下四个部分依次输出，每个部分用 ## 标题分隔:`,
    ``,
    `### 部分一: 根因分析`,
    `用编号列表列出 2-4 条导致此性能问题的根本原因。每条一句话，言简意赅。`,
    `格式示例:`,
    `## 根因分析`,
    `1. 每帧重复创建 XXX 对象导致 GC 压力`,
    `2. 未使用缓存，每次调用都触发 XXX 查找`,
    ``,
    `### 部分二: 优化建议`,
    `给出 2-3 个具体优化方案，每个方案用 ### 方案 N：标题 格式:`,
    `## 优化建议`,
    `### 方案 1：使用对象池复用`,
    `- **做法**：一句话描述`,
    `- **预期效果**：预估减少 X.Xms（从 Y.Yms 降至 Z.Zms）`,
    `- **风险**：简述改动风险或注意事项`,
    ``,
    `### 部分三: 代码对比`,
    `对最推荐的方案，给出修改前和修改后的代码。必须标注文件路径。`,
    `## 代码对比`,
    `**文件**: \`Assets/Scripts/XXX.cs\``,
    `**修改前**:`,
    "```csharp",
    `// 原始代码`,
    "```",
    `**修改后**:`,
    "```csharp",
    `// 优化后的代码`,
    "```",
    ``,
    `### 部分四（可选）: 补充说明`,
    `如有补充的注意事项、替代方案或 Unity 特定 API 的使用建议，放在这里。`,
    ``,
    `## 额外规则`,
    `- 用中文，代码注释也用中文`,
    `- 不要重复输入信息中的性能数据`,
    `- 如果源码中找不到对应文件，基于调用链和 Marker 名称给出通用优化建议`,
    `- 代码对比必须是可直接使用的完整代码片段，不要省略关键上下文`,
  ].filter(Boolean).join('\n');
}
