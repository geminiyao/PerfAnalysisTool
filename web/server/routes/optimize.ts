import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { getConfig, updateConfig } from '../utils/config.js';
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
  // AI 优化建议 — 拆为 POST start + GET progress (EventSource)
  // 与 analysis.ts 的 SSE 模式完全一致
  // ============================================================

  // taskId -> SSE client set (same pattern as analysis.ts sseClients)
  const optimizeTasks = new Map<string, {
    child: ReturnType<typeof spawn> | null;
    promptFile: string;
  }>();
  const optimizeSseClients = new Map<string, Set<(event: OptimizeSuggestEvent) => void>>();

  /**
   * POST /optimize/start — 启动 CLI 任务，返回 taskId
   */
  app.post('/optimize/start', async (request, reply) => {
    const body = request.body as OptimizeSuggestRequest;
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
      '--allowedTools', 'Read,Grep,Glob',
    ];

    console.log('[optimize] taskId:', taskId);
    console.log('[optimize] CLI:', cliCommand);
    console.log('[optimize] CWD:', config.sourceProjectPath);
    console.log('[optimize] Prompt file:', promptFile);

    const child = spawn(cliCommand, args, {
      cwd: config.sourceProjectPath,
      shell: true,
      windowsHide: true,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    console.log('[optimize] CLI pid:', child.pid);

    optimizeTasks.set(taskId, { child, promptFile });
    if (!optimizeSseClients.has(taskId)) {
      optimizeSseClients.set(taskId, new Set());
    }

    const broadcast = (event: OptimizeSuggestEvent) => {
      const clients = optimizeSseClients.get(taskId);
      if (clients) {
        for (const send of clients) send(event);
      }
    };

    // Immediately broadcast source files
    broadcast({ type: 'source_found', sourceFiles });

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
          if (event.type === 'assistant') {
            for (const block of (event.message?.content || [])) {
              if (block.type === 'text' && block.text) {
                broadcast({ type: 'chunk', text: block.text });
              }
            }
          }
        } catch {
          if (trimmed.length > 5 && !trimmed.startsWith('{')) {
            broadcast({ type: 'chunk', text: trimmed + '\n' });
          }
        }
      }
    });

    let stderrBuf = '';
    child.stderr?.on('data', (data: Buffer) => {
      stderrBuf += data.toString();
    });

    child.on('close', (code, signal) => {
      console.log(`[optimize] CLI exited code=${code} signal=${signal} hasOutput=${hasOutput} stderr=${stderrBuf.slice(0, 200)}`);
      if (code === 0) {
        broadcast({ type: 'done' });
      } else {
        const hint = !hasOutput && stderrBuf
          ? stderrBuf.trim().slice(0, 300)
          : `退出码 ${code}, 信号 ${signal}`;
        broadcast({ type: 'error', error: `CLI 执行失败: ${hint}` });
      }
      try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
      // Clean up after a delay so late-connecting SSE clients can see final status
      setTimeout(() => {
        optimizeTasks.delete(taskId);
        optimizeSseClients.delete(taskId);
      }, 10_000);
    });

    child.on('error', (err) => {
      console.error('[optimize] CLI spawn error:', err.message);
      broadcast({ type: 'error', error: `CLI 启动失败: ${err.message}。请确认 codebuddy 或 claude 命令可用。` });
    });

    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        broadcast({ type: 'error', error: '优化分析超时 (5分钟)' });
      }
    }, 5 * 60 * 1000);

    return { taskId, sourceFiles };
  });

  /**
   * GET /optimize/progress/:taskId — SSE 推送，使用 EventSource
   * 与 analysis.ts 的 /analysis/:id/progress 完全相同的模式
   */
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

    request.raw.on('close', () => {
      const clients = optimizeSseClients.get(taskId);
      if (clients) {
        clients.delete(send);
        if (clients.size === 0) {
          optimizeSseClients.delete(taskId);
        }
      }
      // If no more listeners and task is running, kill it
      if (optimizeSseClients.get(taskId)?.size === 0) {
        const task = optimizeTasks.get(taskId);
        if (task?.child && task.child.exitCode === null) {
          console.log('[optimize] All SSE clients disconnected, killing CLI');
          task.child.kill('SIGTERM');
        }
      }
    });

    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', taskId })}\n\n`);
  });

  /**
   * POST /optimize/cancel/:taskId — 取消正在运行的任务
   */
  app.post('/optimize/cancel/:taskId', async (request, reply) => {
    const { taskId } = request.params as { taskId: string };
    const task = optimizeTasks.get(taskId);
    if (task?.child && task.child.exitCode === null) {
      task.child.kill('SIGTERM');
      return { cancelled: true };
    }
    return { cancelled: false };
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
