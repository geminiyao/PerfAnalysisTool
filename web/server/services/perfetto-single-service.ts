// perfetto-single-service.ts — Hybrid v6 perfetto 单次形态 service
// Provider 跑骨架渲染（render_perfetto_skeleton.py，N=1）→ LLM 填占位符 → 质量门
// 与 perfetto-diff-service.ts 同构；diff 是 N≥2，本服务是 N=1。

import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { v4 as uuid } from 'uuid';
import type { CliProvider } from '../../shared/types.js';
import type { IngestMeta, PerfettoIngestOptions } from './run-ingest-service.js';
import { buildPerfettoProfile, ingestProfile } from './run-ingest-service.js';
import { saveRun } from './run-store.js';
import { saveAnalysisWithReport } from './analysis-store.js';
import { PERF_PROFILE_SCHEMA_VERSION, type Run } from '../../shared/perf-model.js';
import { saveReportMarkdown } from './report-export.js';
import { getConfig } from '../utils/config.js';
import { defaultCliProvider, isCliAvailable, cliUnavailableHint, resolveCliExecutable, spawnCliProcess } from '../utils/cli-resolver.js';
import { normalizeReportInOutputDir, resolveSkillDir } from './skill-config.js';
import { findMatchingSkillReport } from './source-profile-runner.js';

export interface PerfettoSingleSample {
  tracePath: string;
  sampleDir?: string;
  label?: string;
}

export interface PerfettoSingleOptions {
  meta?: IngestMeta;
  perfetto?: PerfettoIngestOptions;
  cliProvider?: CliProvider;
  onLog?: (line: string) => void;
}

export interface PerfettoSingleResult {
  runId: string;
  reportPath: string;
  outputDir: string;
  markdown: string;
  skeletonPath: string;
}

interface CliProviderConfig {
  label: string;
  buildArgs: () => string[];
}

interface SingleReportQuality {
  ok: boolean;
  errors: string[];
  warnings: string[];
  lineCount: number;
  skeletonLineCount: number;
  llmFillRemaining: number;
}

const SINGLE_ROLE = 'single';

const CLI_PROVIDERS: Record<CliProvider, CliProviderConfig> = {
  codebuddy: {
    label: 'CodeBuddy',
    buildArgs: () => [
      '-p',
      '--output-format', 'stream-json',
      '-y',
      '--dangerously-skip-permissions',
      '--allowedTools', 'Bash,Read,Write,Glob,Grep',
    ],
  },
  claude: {
    label: 'Claude Code',
    buildArgs: () => [
      '-p',
      '--output-format', 'stream-json',
      '--allowedTools', 'Bash,Read,Write,Glob,Grep',
    ],
  },
  mock: {
    label: 'Mock',
    buildArgs: () => [],
  },
};

function reportHeadline(markdown: string): string {
  const line = markdown.split('\n').find(l => l.startsWith('#'));
  return line ? line.replace(/^#+\s*/, '').trim().slice(0, 120) : 'Perfetto 单次报告';
}

function goldenReportPath(projectRoot: string): string {
  return path.join(projectRoot, 'docs', 'report', 'performance-report_perfetto_SINGLE_GOLDEN_v1.md');
}

/** 调 render_perfetto_skeleton.py 渲染骨架（N=1，确定性，无 LLM）。 */
async function renderSkeleton(summaryPath: string, outputDir: string, projectRoot: string, onLog?: (line: string) => void): Promise<string> {
  const py = process.env.PYTHON || 'python';
  const script = path.join(projectRoot, 'scripts', 'render_perfetto_skeleton.py');
  const skeletonPath = path.join(outputDir, 'skeleton.md');
  const args: string[] = [script, '--sample', `${SINGLE_ROLE}=${summaryPath}`, '--out', skeletonPath];

  onLog?.(`[single] render skeleton: ${py} ${args.map(a => a.replace(/\\/g, '/')).join(' ')}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(py, args, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`render_perfetto_skeleton.py 失败 rc=${code}: ${stderr.slice(-1000)}`));
      else { onLog?.(`[single] skeleton ok: ${stderr.trim()}`); resolve(); }
    });
  });

  if (!fs.existsSync(skeletonPath)) {
    throw new Error(`骨架渲染未产出 ${skeletonPath}`);
  }
  return skeletonPath;
}

function buildSinglePrompt(summaryPath: string, outputDir: string, skeletonPath: string, projectRoot: string): string {
  const skillDir = resolveSkillDir(projectRoot, 'perfetto').replace(/\\/g, '/');
  const promptPath = path.join(skillDir, 'prompts', 'single-prompt.txt');
  const goldenPath = goldenReportPath(projectRoot).replace(/\\/g, '/');
  const outputPath = path.join(outputDir, 'performance-report.md').replace(/\\/g, '/');
  const skeletonNorm = path.resolve(skeletonPath).replace(/\\/g, '/');
  const summaryNorm = path.resolve(summaryPath).replace(/\\/g, '/');
  const sampleLines = `  - ${SINGLE_ROLE}: summary=${summaryNorm}`;

  const template = fs.readFileSync(promptPath, 'utf-8');
  return template
    .replace(/\{\{SKELETON_PATH\}\}/g, skeletonNorm)
    .replace(/\{\{OUTPUT_PATH\}\}/g, outputPath)
    .replace(/\{\{GOLDEN_PATH\}\}/g, goldenPath)
    .replace(/\{\{SAMPLE_LINES\}\}/g, sampleLines);
}

function validateSingleReport(reportPath: string, skeletonPath: string): SingleReportQuality {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!fs.existsSync(reportPath)) {
    return { ok: false, errors: ['报告未生成'], warnings, lineCount: 0, skeletonLineCount: 0, llmFillRemaining: 0 };
  }
  const report = fs.readFileSync(reportPath, 'utf-8');
  const skeleton = fs.existsSync(skeletonPath) ? fs.readFileSync(skeletonPath, 'utf-8') : '';
  const lineCount = report.split(/\r?\n/).length;
  const skeletonLineCount = skeleton ? skeleton.split(/\r?\n/).length : 0;

  // hard-fail 1: 占位符必须 0 残留
  const llmFillRemaining = (report.match(/<!-- LLM_FILL/g) || []).length;
  if (llmFillRemaining > 0) errors.push(`LLM_FILL 占位符残留 ${llmFillRemaining} 个`);

  // hard-fail 2: 骨架表格必须逐字符存在
  if (skeleton) {
    const tableRows = skeleton.split(/\r?\n/).filter(l => l.startsWith('|') && l.includes('|'));
    let missingTableRows = 0;
    for (const row of tableRows.slice(0, 200)) {
      if (!report.includes(row)) missingTableRows++;
    }
    if (missingTableRows > 5) errors.push(`骨架表格行缺失 ${missingTableRows} 条`);
  }

  // hard-fail 3: 行数不能比骨架短太多
  if (skeletonLineCount > 0 && lineCount < skeletonLineCount * 0.85) {
    errors.push(`报告厚度不足: ${lineCount} 行 < 骨架 ${skeletonLineCount} 行的 85%`);
  }

  return { ok: errors.length === 0, errors, warnings, lineCount, skeletonLineCount, llmFillRemaining };
}

async function runCliSingle(
  summaryPath: string,
  outputDir: string,
  skeletonPath: string,
  provider: CliProvider,
  projectRoot: string,
  onLog?: (line: string) => void,
): Promise<void> {
  const dest = path.join(outputDir, 'performance-report.md');

  if (provider === 'mock') {
    const matched = findMatchingSkillReport('perfetto', outputDir, {});
    if (!matched) throw new Error('Mock 模式未找到可复用 perfetto 报告');
    fs.copyFileSync(matched, dest);
    onLog?.(`[Mock] 已复制 perfetto 报告: ${matched}`);
    return;
  }

  const cfg = getConfig();
  const providerCfg = CLI_PROVIDERS[provider] ?? CLI_PROVIDERS.codebuddy;
  const { command, resolved } = resolveCliExecutable(provider, cfg.cliPaths?.[provider]);
  if (!resolved) throw new Error(cliUnavailableHint(provider));

  const prompt = buildSinglePrompt(summaryPath, outputDir, skeletonPath, projectRoot);
  fs.writeFileSync(path.join(outputDir, 'single-cli-prompt.txt'), prompt, 'utf-8');

  const args = providerCfg.buildArgs();
  const logs: string[] = [];
  onLog?.(`[single] ${providerCfg.label} CLI → ${outputDir}`);

  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawnCliProcess(command, args, {
      cwd: cfg.skillProjectPath,
      env: process.env,
      windowsHide: true,
      stdio: 'pipe',
    });
    child.stdin?.write(prompt);
    child.stdin?.end();

    let jsonBuffer = '';
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      fs.writeFileSync(path.join(outputDir, 'single-cli.log'), logs.join('\n'), 'utf-8');
      if (err) reject(err);
      else resolve();
    };

    child.stdout?.on('data', (data: Buffer) => {
      jsonBuffer += data.toString();
      const lines = jsonBuffer.split('\n');
      jsonBuffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          const msg = event.type === 'assistant'
            ? JSON.stringify(event.message?.content ?? []).slice(0, 600)
            : event.type === 'result'
              ? `result: ${event.subtype ?? ''} ${event.duration_ms ? Math.round(event.duration_ms / 1000) + 's' : ''}`
              : event.type;
          logs.push(msg);
          onLog?.(`[cli] ${msg}`);
        } catch {
          logs.push(trimmed);
          onLog?.(trimmed.slice(0, 600));
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        logs.push(`[stderr] ${text}`);
        onLog?.(`[stderr] ${text.slice(0, 600)}`);
      }
    });

    child.on('error', err => finish(err));
    child.on('close', code => {
      normalizeReportInOutputDir(outputDir);
      if (code !== 0) {
        finish(new Error(`CLI 退出码: ${code}; ${logs.slice(-8).join('\n')}`));
        return;
      }
      if (!fs.existsSync(dest)) {
        finish(new Error(`CLI 未生成 ${dest}`));
        return;
      }
      finish();
    });

    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        finish(new Error('Perfetto single 报告生成超时 (45 分钟)'));
      }
    }, 45 * 60 * 1000);
  });
}

export async function buildPerfettoSingleReport(
  sample: PerfettoSingleSample,
  opts: PerfettoSingleOptions = {},
): Promise<PerfettoSingleResult> {
  if (!sample?.tracePath) throw new Error('perfetto-single 缺少 tracePath');

  const config = getConfig();
  const runId = opts.meta?.runId || `perfetto_${Date.now()}_${uuid().slice(0, 8)}`;
  const outputDir = path.join(config.dataDir, 'results', runId);
  fs.mkdirSync(outputDir, { recursive: true });

  const labelFallback = sample.label
    ?? `single_${path.basename(sample.sampleDir || path.dirname(sample.tracePath))}`;

  // 数据层：buildPerfettoProfile 把 perfetto-profile.json / perfetto-profile-summary.json 落到 outputDir
  opts.onLog?.(`[single] 构建 perfetto profile…`);
  const profile = await buildPerfettoProfile(
    sample.tracePath,
    { ...opts.meta, runId, label: labelFallback },
    opts.perfetto ?? {},
    outputDir,
    opts.onLog,
  );

  // 入库（只入子 run，本服务 runId 即子 run id；与 diff 不同，不再有 parent run）
  await ingestProfile(profile, {
    ...opts.meta,
    runId,
    label: labelFallback,
    scene: opts.meta?.scene ?? 'perfetto_single',
  });

  const summaryPath = path.join(outputDir, 'perfetto-profile-summary.json');
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`perfetto summary 缺失: ${summaryPath}`);
  }

  // 渲染骨架
  const skeletonPath = await renderSkeleton(summaryPath, outputDir, config.skillProjectPath, opts.onLog);

  // 跑 LLM
  const cliProvider = opts.cliProvider ?? defaultCliProvider(config.cliPaths);
  if (cliProvider !== 'mock' && !isCliAvailable(cliProvider, config.cliPaths?.[cliProvider])) {
    throw new Error(`${cliUnavailableHint(cliProvider)} Perfetto single 报告需 CLI provider`);
  }

  const reportPath = path.join(outputDir, 'performance-report.md');
  let quality: SingleReportQuality;
  try {
    await runCliSingle(summaryPath, outputDir, skeletonPath, cliProvider, config.skillProjectPath, opts.onLog);
    quality = validateSingleReport(reportPath, skeletonPath);
  } catch (e) {
    opts.onLog?.(`[single][warn] CLI 失败: ${(e as Error).message}; 兜底交付骨架`);
    fs.copyFileSync(skeletonPath, reportPath);
    quality = validateSingleReport(reportPath, skeletonPath);
    quality.warnings.push(`L1 兜底：CLI 失败，直接交付骨架 (${(e as Error).message.slice(0, 120)})`);
  }

  if (!quality.ok) {
    opts.onLog?.(`[single][quality] 报告质量门未通过：${quality.errors.join('; ')}；交付骨架兜底版`);
    fs.copyFileSync(skeletonPath, reportPath);
    quality.warnings.push(`L1 兜底：质量门 fail，回退骨架。errors=${quality.errors.join('; ')}`);
    quality.errors = [];
    quality.ok = true;
  }
  fs.writeFileSync(path.join(outputDir, 'single-report-quality.json'), JSON.stringify(quality, null, 2), 'utf-8');

  const markdown = fs.readFileSync(reportPath, 'utf-8');
  const exported = saveReportMarkdown('p-web-perfetto', `performance-report_${runId}`, markdown);

  saveAnalysisWithReport(
    {
      id: `analysis_${runId}_perfetto`,
      mode: 'single',
      runIds: [runId],
      status: 'completed',
      skill: 'perfetto-trace-analysis',
    },
    { headline: reportHeadline(markdown), markdown, insights: [] },
    { analysisId: `analysis_${runId}_perfetto`, skill: 'perfetto-trace-analysis' },
  );

  return { runId, reportPath: exported, outputDir, markdown, skeletonPath };
}
