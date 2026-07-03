// perfetto-diff-service.ts — Hybrid v6 perfetto N 份对比 service
// Provider 跑骨架渲染（render_perfetto_skeleton.py）→ LLM 填占位符 → 质量门
// 与现有 perfetto-triad-service.ts 并列；triad 是 N=3 的特例，本服务支持 N≥2 任意份数。
// 复用 simpleperf-diff-service / unity-profiler-compare 的设计模式。

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

export interface PerfettoDiffSample {
  role: string;             // 任意角色名（如 base/cur/throttle/v1.0/v1.1 ...）
  tracePath: string;
  sampleDir?: string;
  label?: string;
}

export interface PerfettoDiffOptions {
  meta?: IngestMeta;
  perfetto?: PerfettoIngestOptions;
  cliProvider?: CliProvider;
  onLog?: (line: string) => void;
}

export interface PerfettoDiffResult {
  diffId: string;
  runIds: string[];
  reportPath: string;
  outputDir: string;
  markdown: string;
  skeletonPath: string;
}

interface CliProviderConfig {
  label: string;
  buildArgs: () => string[];
}

interface DiffReportQuality {
  ok: boolean;
  errors: string[];
  warnings: string[];
  lineCount: number;
  skeletonLineCount: number;
  llmFillRemaining: number;
}

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

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80);
}

function reportHeadline(markdown: string): string {
  const line = markdown.split('\n').find(l => l.startsWith('#'));
  return line ? line.replace(/^#+\s*/, '').trim().slice(0, 120) : 'Perfetto N 份对比报告';
}

function goldenReportPath(projectRoot: string): string {
  const v53 = path.join(projectRoot, 'docs', 'report', 'performance-report_perfetto_ULTIMATE_v5.3.md');
  if (fs.existsSync(v53)) return v53;
  return path.join(projectRoot, 'docs', 'report', 'performance-report_perfetto_ULTIMATE_v5.2.md');
}

/** 调 render_perfetto_skeleton.py 渲染骨架（确定性，无 LLM）。 */
async function renderSkeleton(samples: PerfettoDiffSample[], outputDir: string, projectRoot: string, onLog?: (line: string) => void): Promise<string> {
  const py = process.env.PYTHON || 'python';
  const script = path.join(projectRoot, 'scripts', 'render_perfetto_skeleton.py');
  const skeletonPath = path.join(outputDir, 'skeleton.md');
  const args: string[] = [script];
  for (const s of samples) {
    const summaryPath = path.join(outputDir, sanitizeId(s.role), 'perfetto-profile-summary.json');
    args.push('--sample', `${s.role}=${summaryPath}`);
  }
  args.push('--out', skeletonPath);

  onLog?.(`[diff] render skeleton: ${py} ${args.map(a => a.replace(/\\/g, '/')).join(' ')}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(py, args, { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`render_perfetto_skeleton.py 失败 rc=${code}: ${stderr.slice(-1000)}`));
      else { onLog?.(`[diff] skeleton ok: ${stderr.trim()}`); resolve(); }
    });
  });

  if (!fs.existsSync(skeletonPath)) {
    throw new Error(`骨架渲染未产出 ${skeletonPath}`);
  }
  return skeletonPath;
}

function buildDiffPrompt(samples: PerfettoDiffSample[], outputDir: string, skeletonPath: string, projectRoot: string): string {
  const skillDir = resolveSkillDir(projectRoot, 'perfetto-diff' as any).replace(/\\/g, '/');
  // skill-config 可能不识别 perfetto-diff key，回退到固定路径
  const fallbackSkillDir = path.join(projectRoot, '.claude', 'skills', 'perfetto-diff-analysis').replace(/\\/g, '/');
  const finalSkillDir = fs.existsSync(fallbackSkillDir) ? fallbackSkillDir : skillDir;
  const promptPath = path.join(finalSkillDir, 'prompts', 'diff-prompt.txt');
  const goldenPath = goldenReportPath(projectRoot).replace(/\\/g, '/');
  const outputPath = path.join(outputDir, 'performance-report.md').replace(/\\/g, '/');
  const skeletonNorm = path.resolve(skeletonPath).replace(/\\/g, '/');

  const sampleLines = samples.map(s => {
    const summaryPath = path.join(outputDir, sanitizeId(s.role), 'perfetto-profile-summary.json').replace(/\\/g, '/');
    return `  - ${s.role}: summary=${summaryPath}`;
  }).join('\n');

  const template = fs.readFileSync(promptPath, 'utf-8');
  return template
    .replace(/\{\{SKELETON_PATH\}\}/g, skeletonNorm)
    .replace(/\{\{OUTPUT_PATH\}\}/g, outputPath)
    .replace(/\{\{GOLDEN_PATH\}\}/g, goldenPath)
    .replace(/\{\{SAMPLE_LINES\}\}/g, sampleLines);
}

function validateDiffReport(reportPath: string, skeletonPath: string): DiffReportQuality {
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

async function runCliDiff(
  diffId: string,
  samples: PerfettoDiffSample[],
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

  const prompt = buildDiffPrompt(samples, outputDir, skeletonPath, projectRoot);
  fs.writeFileSync(path.join(outputDir, 'diff-cli-prompt.txt'), prompt, 'utf-8');

  const args = providerCfg.buildArgs();
  const logs: string[] = [];
  onLog?.(`[diff] ${providerCfg.label} CLI → ${outputDir}`);

  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawnCliProcess(command, args, {
      cwd: cfg.skillProjectPath,
      env: process.env,
      windowsHide: true,
      stdio: 'pipe',
    });
    // stdin 注入 prompt（避开 Windows .cmd 长 prompt 截断）
    child.stdin?.write(prompt);
    child.stdin?.end();

    let jsonBuffer = '';
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      fs.writeFileSync(path.join(outputDir, 'diff-cli.log'), logs.join('\n'), 'utf-8');
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
        finish(new Error('Perfetto diff 报告生成超时 (45 分钟)'));
      }
    }, 45 * 60 * 1000);
  });
}

export async function buildPerfettoDiffReport(
  samples: PerfettoDiffSample[],
  opts: PerfettoDiffOptions = {},
): Promise<PerfettoDiffResult> {
  if (samples.length < 2) throw new Error(`perfetto-diff 至少需要 2 份样本，收到 ${samples.length}`);

  const config = getConfig();
  const diffId = opts.meta?.runId || `diff_${Date.now()}_${uuid().slice(0, 8)}`;
  const outputDir = path.join(config.dataDir, 'results', diffId);
  fs.mkdirSync(outputDir, { recursive: true });

  const runIds: string[] = [];
  for (const s of samples) {
    const runId = `${diffId}_${sanitizeId(s.role)}`;
    const roleDir = path.join(outputDir, sanitizeId(s.role));
    fs.mkdirSync(roleDir, { recursive: true });
    opts.onLog?.(`[diff] 构建 ${s.role} perfetto profile…`);
    const profile = await buildPerfettoProfile(
      s.tracePath,
      { ...opts.meta, runId, label: s.label ?? `${s.role}_${path.basename(s.sampleDir || path.dirname(s.tracePath))}` },
      opts.perfetto ?? {},
      roleDir,
      opts.onLog,
    );
    const run = await ingestProfile(profile, {
      ...opts.meta,
      runId,
      label: s.label ?? `${s.role}_${path.basename(s.sampleDir || path.dirname(s.tracePath))}`,
      scene: opts.meta?.scene ?? s.role,
    });
    runIds.push(run.id);
  }

  // 检查所有 summary 都存在
  for (const s of samples) {
    const sp = path.join(outputDir, sanitizeId(s.role), 'perfetto-profile-summary.json');
    if (!fs.existsSync(sp)) throw new Error(`缺少 ${s.role} summary: ${sp}`);
  }

  // 渲染骨架
  const skeletonPath = await renderSkeleton(samples, outputDir, config.skillProjectPath, opts.onLog);

  // 跑 LLM
  const cliProvider = opts.cliProvider ?? defaultCliProvider(config.cliPaths);
  if (cliProvider !== 'mock' && !isCliAvailable(cliProvider, config.cliPaths?.[cliProvider])) {
    throw new Error(`${cliUnavailableHint(cliProvider)} Perfetto diff 报告需 CLI provider`);
  }

  let reportPath = path.join(outputDir, 'performance-report.md');
  let quality: DiffReportQuality;
  try {
    await runCliDiff(diffId, samples, outputDir, skeletonPath, cliProvider, config.skillProjectPath, opts.onLog);
    quality = validateDiffReport(reportPath, skeletonPath);
  } catch (e) {
    opts.onLog?.(`[diff][warn] CLI 失败: ${(e as Error).message}; 兜底交付骨架`);
    fs.copyFileSync(skeletonPath, reportPath);
    quality = validateDiffReport(reportPath, skeletonPath);
    quality.warnings.push(`L1 兜底：CLI 失败，直接交付骨架 (${(e as Error).message.slice(0, 120)})`);
  }

  // 质量门 fail 时的二次兜底（保证用户必有产物）
  if (!quality.ok) {
    opts.onLog?.(`[diff][quality] 报告质量门未通过：${quality.errors.join('; ')}；交付骨架兜底版`);
    fs.copyFileSync(skeletonPath, reportPath);
    quality.warnings.push(`L1 兜底：质量门 fail，回退骨架。errors=${quality.errors.join('; ')}`);
    quality.errors = []; // 兜底成功后不再算 fail
    quality.ok = true;
  }
  fs.writeFileSync(path.join(outputDir, 'diff-report-quality.json'), JSON.stringify(quality, null, 2), 'utf-8');

  const markdown = fs.readFileSync(reportPath, 'utf-8');
  const exported = saveReportMarkdown('p-web-perfetto-diff', `performance-report_${sanitizeId(diffId)}`, markdown);

  const parentRun: Run = {
    id: diffId,
    label: opts.meta?.label ?? `Perfetto ${samples.length} 份对比 ${diffId}`,
    sources: ['perfetto_diff'],
    status: 'ready',
    meta: {
      device: opts.meta?.device,
      scene: opts.meta?.scene ?? 'perfetto_diff',
      projectName: opts.meta?.projectName,
      version: opts.meta?.version,
      notes: `${samples.map((s, i) => `${s.role}=${runIds[i]}`).join('; ')}; report=${exported}`,
    },
    profile: {
      raw: [],
      core: {
        schemaVersion: PERF_PROFILE_SCHEMA_VERSION,
        metrics: [],
        frame: [],
        threads: [],
        system: {},
        confidence: { perFrameAlignmentOk: true, notes: ['Perfetto diff parent run; metrics live in child runs.'] },
      },
      detail: { perfetto_diff: { diffId, runIds, outputDir, reportPath: exported, skeletonPath, quality, sampleCount: samples.length } },
    },
    createdAt: Date.now(),
    completedAt: Date.now(),
  };
  saveRun(parentRun);
  saveAnalysisWithReport(
    {
      id: `analysis_${diffId}_perfetto_diff`,
      mode: 'compare',
      runIds: [diffId, ...runIds],
      status: 'completed',
      skill: 'perfetto-diff-analysis',
    },
    { headline: reportHeadline(markdown), markdown, insights: [] },
    { analysisId: `analysis_${diffId}_perfetto_diff`, skill: 'perfetto-diff-analysis' },
  );

  return { diffId, runIds, reportPath: exported, outputDir, markdown, skeletonPath };
}
