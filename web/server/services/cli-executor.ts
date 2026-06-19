import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { getConfig } from '../utils/config.js';
import { resolveCliExecutable, cliUnavailableHint, spawnCliProcess } from '../utils/cli-resolver.js';
import { emitProgress } from '../routes/analysis.js';
import type { ProgressEvent, CliProvider } from '../../shared/types.js';
import {
  type SkillKind,
  buildSkillPrompt,
  checkSkillOutput,
  missingSkillFiles,
  normalizeReportInOutputDir,
  resolveSkillDir,
  getSkillConfig,
} from './skill-config.js';
import { findMatchingSkillReport, readProfileHints } from './source-profile-runner.js';

export interface AnalysisJob {
  sessionId: string;
  /** @deprecated 使用 inputPath + skill */
  pdataPath?: string;
  inputPath: string;
  skill: SkillKind;
  outputDir: string;
  cliProvider: CliProvider;
  params?: {
    targetFps?: number;
    jankMultiplier?: number;
    bigJankMultiplier?: number;
    budgetRatio?: number;
  };
  /** 可选: 将进度/日志转发到 ingest job 等外部消费者 */
  onLog?: (line: string) => void;
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
  const { command, resolved } = resolveCliExecutable(provider, pathMap[provider]);
  if (!resolved && provider !== 'mock') {
    console.warn(`[cli-executor] ${provider} 未解析到绝对路径，将尝试 PATH 命令名: ${command}`);
  }
  return command;
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
  const skill = job.skill ?? 'unity_profiler';
  const inputPath = job.inputPath ?? job.pdataPath;
  if (!inputPath) {
    return { success: false, error: '缺少 inputPath', logs: ['[错误] 缺少 inputPath'] };
  }

  fs.mkdirSync(job.outputDir, { recursive: true });

  if (job.cliProvider === 'mock') {
    return executeMock({ ...job, skill, inputPath }, config);
  }

  const provider = CLI_PROVIDERS[job.cliProvider] || CLI_PROVIDERS.codebuddy;
  const cliCommand = getCliCommand(job.cliProvider);
  const logLines: string[] = [];
  const { resolved } = resolveCliExecutable(job.cliProvider, config.cliPaths?.[job.cliProvider]);

  if (!resolved) {
    const error = cliUnavailableHint(job.cliProvider);
    logLines.push(`[错误] ${error}`);
    emitProgress({
      sessionId: job.sessionId,
      stage: 'failed',
      progress: 0,
      message: error,
      timestamp: Date.now(),
      log: `[错误] ${error}`,
    });
    return { success: false, error, logs: logLines };
  }

  const missingRequiredFiles = missingSkillFiles(config.skillProjectPath, skill);

  if (!fs.existsSync(inputPath) || missingRequiredFiles.length > 0) {
    const error = !fs.existsSync(inputPath)
      ? `输入文件不存在: ${inputPath}`
      : `${getSkillConfig(skill).kind} skill 文件缺失: ${missingRequiredFiles.join(', ')}`;
    logLines.push(`[错误] ${error}`);
    emitProgress({
      sessionId: job.sessionId,
      stage: 'failed',
      progress: 0,
      message: error,
      timestamp: Date.now(),
      log: `[错误] ${error}`,
    });
    return { success: false, error, logs: logLines };
  }

  const prompt = buildSkillPrompt(skill, config.skillProjectPath, inputPath, job.outputDir, {
    targetFps: job.params?.targetFps,
  });
  const args = provider.buildArgs(prompt);

  // 共享状态对象（引用传递，不会有值拷贝问题）
  const state: ExecutionState = {
    skillVerified: false,
    toolCallCount: 0,
    resolved: false,
  };

  return new Promise((resolve) => {
    const emit = (stage: ProgressEvent['stage'], progress: number, message: string, log?: string) => {
      if (log) {
        logLines.push(log);
        job.onLog?.(log);
      }
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
    const skillPath = resolveSkillDir(config.skillProjectPath, skill).replace(/\\/g, '/');
    emit('preprocessing', 5, `正在启动 ${provider.label} CLI...`, `[系统] cli: ${cliCommand.replace(/\\/g, '/')}`);
    emit('preprocessing', 5, '准备中...', `[系统] skill: ${skillPath}`);
    emit('preprocessing', 5, '准备中...', `[系统] input: ${path.resolve(inputPath).replace(/\\/g, '/')}`);
    emit('preprocessing', 5, '准备中...', `[系统] 输出目录: ${path.resolve(job.outputDir).replace(/\\/g, '/')}`);

    const child: ChildProcess = spawnCliProcess(cliCommand, args, {
      cwd: config.skillProjectPath,
      env: process.env,
      windowsHide: true,
      stdio: 'pipe',
    });

    // prompt 已通过 -p 传入，勿再写 stdin（避免部分 CLI 行为异常）

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
          normalizeReportInOutputDir(job.outputDir);
          const check = checkSkillOutput(job.outputDir, skill);

          if (!check.ok) {
            const errMsg = !check.hasReport
              ? `CLI 退出但未生成 performance-report.md (${check.status})。若 stderr 含 reg/wmic/powershell，请重启 Web 服务后再试。`
              : `CLI 执行完毕但输出文件缺失 (${check.status})`;
            logLines.push(`[错误] ${errMsg}`);
            doResolve({ success: false, error: errMsg });
          } else {
            logLines.push(`[完成] tool 调用: ${state.toolCallCount}次, ${check.status}`);
            emitProgress({
              sessionId: job.sessionId,
              stage: 'analyzing',
              progress: 95,
              message: `AI 分析完成，正在保存结果... (${check.status})`,
              timestamp: Date.now(),
              log: `[完成] tool 调用: ${state.toolCallCount}次, ${check.status}`,
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
    case 'error': {
      const msg = event.error || event.message || JSON.stringify(event);
      emit('failed', 0, 'CLI 内部错误', `[错误] ${String(msg).slice(0, 500)}`);
      break;
    }

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

          if (toolName === 'Bash' && (inputStr.includes('preprocess') || inputStr.includes('build_'))) {
            progress = 20;
            message = '执行预处理 / profile 构建脚本';
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
// Mock 模式
// ============================================================

async function executeMock(
  job: AnalysisJob,
  config: ReturnType<typeof getConfig>,
): Promise<{ success: boolean; error?: string; logs: string[] }> {
  const skill = job.skill ?? 'unity_profiler';
  const inputPath = job.inputPath ?? job.pdataPath ?? '';
  const logLines: string[] = [];
  const emit = (stage: ProgressEvent['stage'], progress: number, message: string, log?: string) => {
    if (log) {
      logLines.push(log);
      job.onLog?.(log);
    }
    emitProgress({
      sessionId: job.sessionId,
      stage,
      progress,
      message,
      timestamp: Date.now(),
      log,
    });
  };

  const cfg = getSkillConfig(skill);
  const destReport = path.join(job.outputDir, 'performance-report.md');
  const profileSummary = path.join(job.outputDir, cfg.profileSummaryFile);

  emit('preprocessing', 10, '[Mock] 开始模拟分析...', '[Mock] 使用已有数据，不消耗 token');
  await sleep(400);

  if (!fs.existsSync(profileSummary)) {
    emit('failed', 20, '[Mock] 缺少 profile summary', `[Mock] 请先完成入库或改用 CodeBuddy CLI (${cfg.profileSummaryFile})`);
    return { success: false, error: `缺少 ${cfg.profileSummaryFile}`, logs: logLines };
  }

  const hints = readProfileHints(job.outputDir, skill);
  emit('preprocessing', 40, '[Mock] 使用当前 profile', `[Mock] scene=${hints.scene ?? '?'} device=${hints.device ?? '?'}`);

  await sleep(300);
  emit('analyzing', 70, '[Mock] 匹配已有报告...', `[Mock] 查找 output/${cfg.mockOutputSubdirs[0]}/performance-report*.md`);

  const matched = findMatchingSkillReport(skill, job.outputDir, hints);

  if (matched) {
    fs.copyFileSync(matched, destReport);
    emit('analyzing', 90, '[Mock] 报告已复制', `[Mock] ${path.basename(matched)}`);
  } else {
    const stub = [
      `# Mock ${cfg.reportTitleFallback}`,
      '',
      `> Mock 模式：未找到与当前 run 匹配的已有报告 (${skill})。`,
      `> 输入: ${inputPath}`,
      `> 请切换 **CodeBuddy CLI** 重新生成完整报告。`,
      '',
    ].join('\n');
    fs.writeFileSync(destReport, stub, 'utf-8');
    emit('analyzing', 90, '[Mock] 已生成占位报告', `[Mock] 需要 output/${cfg.mockOutputSubdirs[0]}/ 下匹配的 md`);
  }

  await sleep(200);
  emit('completed', 100, '[Mock] 模拟分析完成');
  return { success: true, logs: logLines };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
