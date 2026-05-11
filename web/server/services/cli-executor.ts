import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getConfig } from '../utils/config.js';
import { emitProgress } from '../routes/analysis.js';
import type { ProgressEvent, CliProvider } from '../../shared/types.js';

export interface AnalysisJob {
  sessionId: string;
  pdataPath: string;
  outputDir: string;
  cliProvider: CliProvider;
}

interface CliProviderConfig {
  name: string;
  label: string;
  buildArgs: (prompt: string) => string[];
}

const CLI_PROVIDERS: Record<CliProvider, CliProviderConfig> = {
  codebuddy: {
    name: 'codebuddy',
    label: 'CodeBuddy',
    buildArgs: (prompt: string) => [
      '-p', prompt,
      '--output-format', 'stream-json',
      '-y',
      '--allowedTools', 'Bash,Read,Write,Glob,Grep',
    ],
  },
  claude: {
    name: 'claude',
    label: 'Claude Code',
    buildArgs: (prompt: string) => [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--allowedTools', 'Bash,Read,Write,Glob,Grep',
    ],
  },
  mock: {
    name: 'mock',
    label: 'Mock',
    buildArgs: () => [],
  },
};

function getCliCommand(provider: CliProvider): string {
  const config = getConfig();
  const pathMap = config.cliPaths || {};
  return pathMap[provider] || provider;
}

/** 共享执行状态 */
interface ExecutionState {
  skillVerified: boolean;
  toolCallCount: number;
  resolved: boolean;
}

// ============================================================
// 主执行入口
// ============================================================

export async function executeCli(job: AnalysisJob): Promise<{ success: boolean; error?: string; logs: string[] }> {
  const config = getConfig();
  fs.mkdirSync(job.outputDir, { recursive: true });

  if (job.cliProvider === 'mock') {
    return executeMock(job, config);
  }

  const prompt = buildPrompt(job.pdataPath, job.outputDir);
  const provider = CLI_PROVIDERS[job.cliProvider] || CLI_PROVIDERS.codebuddy;
  const cliCommand = getCliCommand(job.cliProvider);
  const args = provider.buildArgs(prompt);

  // 收集全部日志行
  const logLines: string[] = [];

  // 共享状态对象（引用传递，不会有值拷贝问题）
  const state: ExecutionState = {
    skillVerified: false,
    toolCallCount: 0,
    resolved: false,
  };

  return new Promise((resolve) => {
    const emit = (stage: ProgressEvent['stage'], progress: number, message: string, log?: string) => {
      if (log) logLines.push(log);
      // cli-executor 不再发 completed/failed 事件（交由 queue 控制最终状态）
      if (stage === 'completed' || stage === 'failed') return;
      emitProgress({
        sessionId: job.sessionId,
        stage,
        progress,
        message,
        timestamp: Date.now(),
        log,
      });
    };

    const doResolve = (result: { success: boolean; error?: string }) => {
      if (!state.resolved) {
        state.resolved = true;
        resolve({ ...result, logs: logLines });
      }
    };

    // 推送调试信息
    const skillPath = path.resolve(config.skillProjectPath, '.claude/skills/unity-profiler-analysis').replace(/\\/g, '/');
    emit('preprocessing', 5, `正在启动 ${provider.label} CLI...`, `[系统] skill: ${skillPath}`);
    emit('preprocessing', 5, '准备中...', `[系统] pdata: ${path.resolve(job.pdataPath).replace(/\\/g, '/')}`);
    emit('preprocessing', 5, '准备中...', `[系统] 输出目录: ${path.resolve(job.outputDir).replace(/\\/g, '/')}`);

    const child: ChildProcess = spawn(cliCommand, args, {
      cwd: config.skillProjectPath,
      env: { ...process.env },
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let jsonBuffer = '';

    child.stdout?.on('data', (data: Buffer) => {
      jsonBuffer += data.toString();

      const lines = jsonBuffer.split('\n');
      jsonBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          handleStreamEvent(event, emit, child, state, doResolve);
        } catch {
          // 非 JSON 行，原样推送
          if (trimmed.length > 0) {
            emit('analyzing', 50, '分析中...', trimmed.slice(0, 300));
          }
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        emit('analyzing', 50, '分析中...', `[stderr] ${text.slice(0, 300)}`);
      }
    });

    child.on('error', (err) => {
      emit('failed', 0, `${provider.label} CLI 启动失败: ${err.message}`);
      doResolve({ success: false, error: `${provider.label}: ${err.message}` });
    });

    child.on('close', (code) => {
      if (!state.resolved) {
        if (code === 0) {
          const hasReport = fs.existsSync(path.join(job.outputDir, 'performance-report.md'));
          const hasPreprocess = fs.existsSync(path.join(job.outputDir, 'preprocess-result.json'));
          const fileStatus = `preprocess: ${hasPreprocess ? '✅' : '❌'}, report: ${hasReport ? '✅' : '❌'}`;

          if (!hasReport || !hasPreprocess) {
            // CLI 退出码正常但输出文件缺失 → 视为失败
            const errMsg = `CLI 执行完毕但输出文件缺失 (${fileStatus})`;
            logLines.push(`[错误] ${errMsg}`);
            doResolve({ success: false, error: errMsg });
          } else {
            logLines.push(`[完成] tool 调用: ${state.toolCallCount}次, ${fileStatus}`);
            emitProgress({
              sessionId: job.sessionId,
              stage: 'analyzing',
              progress: 95,
              message: `AI 分析完成，正在保存结果... (${fileStatus})`,
              timestamp: Date.now(),
              log: `[完成] tool 调用: ${state.toolCallCount}次, ${fileStatus}`,
            });
            doResolve({ success: true });
          }
        } else {
          logLines.push(`[错误] CLI 退出码: ${code}`);
          doResolve({ success: false, error: `CLI 退出码: ${code}` });
        }
      }
    });

    // 超时保护 (10分钟)
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        emit('failed', 0, '分析超时 (10分钟)');
        doResolve({ success: false, error: '分析超时' });
      }
    }, 10 * 60 * 1000);
  });
}

// ============================================================
// stream-json 事件解析
// ============================================================

function handleStreamEvent(
  event: any,
  emit: (stage: ProgressEvent['stage'], progress: number, message: string, log?: string) => void,
  child: ChildProcess,
  state: ExecutionState,
  doResolve: (result: { success: boolean; error?: string }) => void,
) {
  switch (event.type) {
    case 'system': {
      if (event.subtype === 'init') {
        emit('preprocessing', 8, 'CLI 已初始化', `[系统] cwd: ${event.cwd}, model: ${event.model}`);
      }
      break;
    }

    case 'assistant': {
      const content = event.message?.content || [];
      for (const block of content) {
        if (block.type === 'thinking') {
          emit('analyzing', 50, 'AI 思考中...', `[思考] ${(block.thinking || '').slice(0, 150)}`);
        }

        if (block.type === 'text') {
          const text = block.text || '';

          // 只检测明确的 SKILL_NOT_FOUND 标记
          if (text.includes('SKILL_NOT_FOUND')) {
            child.kill('SIGTERM');
            emit('failed', 0, 'Skill 未被识别，已停止', `[错误] ${text.slice(0, 200)}`);
            doResolve({ success: false, error: 'Skill 未被识别' });
            return;
          }

          emit('analyzing', 70, '生成报告中...', `[AI输出] ${text.slice(0, 200)}`);
        }

        if (block.type === 'tool_use') {
          state.toolCallCount++;
          state.skillVerified = true;

          const toolName = block.name || 'unknown';
          const inputStr = JSON.stringify(block.input || {});

          // 根据工具调用推断真实阶段
          let progress = 30;
          let message = `执行: ${toolName}`;

          if (toolName === 'Bash' && inputStr.includes('preprocess')) {
            progress = 20;
            message = '执行预处理脚本 preprocess.ts';
          } else if (toolName === 'Bash' && inputStr.includes('map-source')) {
            progress = 40;
            message = '执行源码映射 map-source.ts';
          } else if (toolName === 'Read') {
            progress = 50;
            message = '读取文件';
          } else if (toolName === 'Write') {
            progress = 85;
            message = '写入结果文件';
          }

          emit('analyzing', progress, message, `[tool #${state.toolCallCount}] ${toolName}: ${inputStr.slice(0, 250)}`);
        }
      }
      break;
    }

    case 'user': {
      const results = event.message?.content || [];
      for (const r of results) {
        if (r.type === 'tool_result') {
          const text = r.content?.[0]?.text || '';
          const isError = r.is_error;
          const prefix = isError ? '[工具错误]' : '[工具结果]';
          emit('analyzing', 55, isError ? '工具执行出错' : '工具执行完成', `${prefix} ${text.slice(0, 300)}`);
        }
      }
      break;
    }

    case 'result': {
      if (event.subtype === 'success') {
        const cost = event.total_cost_usd ? `$${event.total_cost_usd.toFixed(4)}` : '';
        const duration = event.duration_ms ? `${Math.round(event.duration_ms / 1000)}s` : '';
        // 不发 completed — 由 queue 在 extractMetrics 之后统一发
        emit('analyzing', 95, 'AI 分析完成，正在保存结果...', `[结果] 耗时: ${duration}, 费用: ${cost}, turns: ${event.num_turns}`);
      } else {
        emit('failed', 0, '分析失败', `[结果] ${event.result || '未知错误'}`);
      }
      break;
    }
  }
}

// ============================================================
// Prompt 构建 - 全部使用绝对路径
// ============================================================

function buildPrompt(pdataPath: string, outputDir: string): string {
  const config = getConfig();
  const skillPath = path.resolve(config.skillProjectPath, '.claude/skills/unity-profiler-analysis').replace(/\\/g, '/');
  const normalizedPdata = path.resolve(pdataPath).replace(/\\/g, '/');
  const normalizedOutput = path.resolve(outputDir).replace(/\\/g, '/');

  // 用空格拼接而非 \n — Windows cmd.exe 的 shell: true 模式下
  // 真实换行符会被截断导致 CLI 只收到第一行 prompt
  return [
    `请使用 ${skillPath} skill 分析这个 pdata 文件: ${normalizedPdata}`,
    `输出目录: ${normalizedOutput}`,
    `请将 preprocess-result.json 和 performance-report.md 保存到输出目录。报告用中文。`,
    `重要：如果无法识别上述 skill，请直接回复"SKILL_NOT_FOUND"并停止，不要尝试自行分析。`,
  ].join(' ');
}

// ============================================================
// Mock 模式
// ============================================================

async function executeMock(
  job: AnalysisJob,
  config: ReturnType<typeof getConfig>,
): Promise<{ success: boolean; error?: string; logs: string[] }> {
  const logLines: string[] = [];
  const emit = (stage: ProgressEvent['stage'], progress: number, message: string, log?: string) => {
    if (log) logLines.push(log);
    emitProgress({
      sessionId: job.sessionId,
      stage,
      progress,
      message,
      timestamp: Date.now(),
      log,
    });
  };

  const defaultOutputDir = path.join(config.skillProjectPath, 'output');

  emit('preprocessing', 10, '[Mock] 开始模拟分析...', '[Mock] 使用已有数据，不消耗 token');
  await sleep(800);

  emit('preprocessing', 30, '[Mock] 读取预处理数据...', '[Mock] 复制 preprocess-result.json');
  await sleep(600);

  const srcPreprocess = path.join(defaultOutputDir, 'preprocess-result.json');
  if (fs.existsSync(srcPreprocess)) {
    fs.copyFileSync(srcPreprocess, path.join(job.outputDir, 'preprocess-result.json'));
    emit('preprocessing', 50, '[Mock] 预处理数据已复制', `[Mock] ${srcPreprocess}`);
  } else {
    emit('failed', 30, '[Mock] 未找到 output/preprocess-result.json', '[Mock] 请先手动执行一次 skill 生成数据');
    return { success: false, error: '未找到 output/preprocess-result.json', logs: logLines };
  }

  await sleep(500);
  emit('analyzing', 70, '[Mock] 复制分析报告...', '[Mock] 查找最新的 performance-report*.md');

  const reports = fs.readdirSync(defaultOutputDir)
    .filter(f => f.startsWith('performance-report') && f.endsWith('.md'))
    .map(f => ({ name: f, path: path.join(defaultOutputDir, f), mtime: fs.statSync(path.join(defaultOutputDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (reports.length > 0) {
    fs.copyFileSync(reports[0].path, path.join(job.outputDir, 'performance-report.md'));
    emit('analyzing', 90, '[Mock] 报告已复制', `[Mock] ${reports[0].name}`);
  } else {
    const mockReport = `# Mock 性能分析报告\n\n> Mock 模式占位报告。请使用真实 CLI 模式执行一次完整分析。\n`;
    fs.writeFileSync(path.join(job.outputDir, 'performance-report.md'), mockReport, 'utf-8');
    emit('analyzing', 90, '[Mock] 已生成占位报告');
  }

  await sleep(300);
  emit('completed', 100, '[Mock] 模拟分析完成');

  return { success: true, logs: logLines };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
