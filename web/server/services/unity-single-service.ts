// unity-single-service.ts — Hybrid v6 Unity Profiler 单次（Provider 骨架 → LLM 填槽 → 质量门）

import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { v4 as uuid } from 'uuid';
import type { CliProvider } from '../../shared/types.js';
import type { IngestMeta } from './run-ingest-service.js';
import { runSourceProfileBuild } from './source-profile-runner.js';
import { saveAnalysisWithReport } from './analysis-store.js';
import { saveReportMarkdown } from './report-export.js';
import { getConfig } from '../utils/config.js';
import {
  defaultCliProvider,
  isCliAvailable,
  cliUnavailableHint,
  resolveCliExecutable,
  spawnCliProcess,
} from '../utils/cli-resolver.js';
import { normalizeReportInOutputDir, resolveSkillDir } from './skill-config.js';
import { findMatchingSkillReport } from './source-profile-runner.js';

export interface UnitySingleSample {
  pdataPath: string;
  label?: string;
  device?: string;
  scene?: string;
  targetFps?: number;
}

export interface UnitySingleOptions {
  meta?: IngestMeta;
  cliProvider?: CliProvider;
  skipAiEnrich?: boolean;
  onLog?: (line: string) => void;
}

export interface UnitySingleResult {
  runId: string;
  reportPath: string;
  outputDir: string;
  markdown: string;
  skeletonPath: string;
  summaryPath: string;
  usedAi: boolean;
  deliverSource: 'ai-authored' | 'skeleton';
}

interface SingleReportQuality {
  ok: boolean;
  errors: string[];
  warnings: string[];
  lineCount: number;
  skeletonLineCount: number;
  llmFillRemaining: number;
}

const CLI_ARGS: Record<CliProvider, string[]> = {
  codebuddy: ['-p', '--output-format', 'stream-json', '-y', '--dangerously-skip-permissions', '--allowedTools', 'Bash,Read,Write,Glob,Grep,Edit'],
  claude: ['-p', '--output-format', 'stream-json', '--allowedTools', 'Bash,Read,Write,Glob,Grep,Edit'],
  mock: [],
};

/** stressmove 等大数据集 §4 线程多、槽位 ~50；18min + 仅改 output 文件 */
const CLI_TIMEOUT_MS = 18 * 60 * 1000;

function reportHeadline(markdown: string): string {
  const m = markdown.match(/^>\s*<!-- LLM_FILL:§0:①[^>]+-->/m);
  if (m) {
    const line = markdown.split('\n').find(l => l.startsWith('## §0'));
    return line ? 'Unity 单次 CPU 报告' : 'Unity 单次报告';
  }
  const quote = markdown.split('\n').find(l => l.startsWith('> **①'));
  return quote ? quote.replace(/^>\s*/, '').slice(0, 120) : 'Unity 单次报告';
}

async function renderSkeleton(
  preprocessPath: string,
  outputDir: string,
  projectRoot: string,
  label: string,
  onLog?: (line: string) => void,
): Promise<{ skeletonPath: string; summaryPath: string }> {
  const script = path.join(projectRoot, '.claude/skills/unity-profiler-analysis/scripts/unity-single-builder.ts');
  const skeletonPath = path.join(outputDir, 'performance-report_unity_single_skeleton.md');
  const summaryPath = path.join(outputDir, 'unity-single-summary.json');

  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['tsx', script, '--input', preprocessPath, '--out', outputDir, '--label', label], {
      cwd: projectRoot,
      shell: true,
      windowsHide: true,
    });
    let stderr = '';
    child.stderr?.on('data', d => { stderr += d.toString(); onLog?.(`[builder] ${d.toString().trim().slice(0, 200)}`); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`unity-single-builder exit ${code}: ${stderr.slice(-500)}`)));
    setTimeout(() => { child.kill('SIGTERM'); reject(new Error('unity-single-builder 超时')); }, 120_000);
  });

  if (!fs.existsSync(skeletonPath)) throw new Error(`骨架未产出: ${skeletonPath}`);
  return { skeletonPath, summaryPath };
}

function buildSinglePrompt(skeletonPath: string, summaryPath: string, outputDir: string, projectRoot: string): string {
  const skillDir = resolveSkillDir(projectRoot, 'unity_profiler').replace(/\\/g, '/');
  const template = fs.readFileSync(path.join(skillDir, 'prompts', 'single-prompt.txt'), 'utf-8');
  const golden = path.join(projectRoot, 'output', 'samples', 'unity-single', 'performance-report.cli-sourcemap.md').replace(/\\/g, '/');
  return template
    .replace(/\{\{SKELETON_PATH\}\}/g, path.resolve(skeletonPath).replace(/\\/g, '/'))
    .replace(/\{\{SUMMARY_PATH\}\}/g, path.resolve(summaryPath).replace(/\\/g, '/'))
    .replace(/\{\{OUTPUT_PATH\}\}/g, path.join(outputDir, 'performance-report.md').replace(/\\/g, '/'))
    .replace(/\{\{GOLDEN_PATH\}\}/g, golden);
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
  const llmFillRemaining = (report.match(/<!-- LLM_FILL/g) ?? []).length;
  if (llmFillRemaining > 0) errors.push(`LLM_FILL 残留 ${llmFillRemaining} 处`);

  const required = ['## §0', '## §3', '### 3.1 主线程 phase 总览', '### 3.2 Top-N', '### 3.3 Top 热点细化分析', '### 3.4 ', '## §4', '## §5', '## §9'];
  for (const sec of required) {
    if (!report.includes(sec)) errors.push(`缺章节/块: ${sec}`);
  }

  if (skeleton) {
    const tableRows = skeleton.split(/\r?\n/).filter(l => l.startsWith('|') && l.includes('|'));
    let missing = 0;
    for (const row of tableRows.slice(0, 150)) {
      if (!report.includes(row)) missing++;
    }
    if (missing > 8) errors.push(`骨架表格行缺失 ${missing} 条`);
  }

  if (skeletonLineCount > 0 && lineCount < skeletonLineCount * 0.82) {
    errors.push(`厚度不足: ${lineCount} < ${Math.floor(skeletonLineCount * 0.82)} 行`);
  }

  return { ok: errors.length === 0, errors, warnings, lineCount, skeletonLineCount, llmFillRemaining };
}

async function runCliSingle(
  outputDir: string,
  skeletonPath: string,
  summaryPath: string,
  provider: CliProvider,
  projectRoot: string,
  onLog?: (line: string) => void,
): Promise<void> {
  const dest = path.join(outputDir, 'performance-report.md');
  if (provider === 'mock') {
    const matched = findMatchingSkillReport('unity_profiler', outputDir, {});
    if (!matched) throw new Error('Mock 模式未找到可复用 unity 报告');
    fs.copyFileSync(matched, dest);
    return;
  }

  const cfg = getConfig();
  const { command, resolved } = resolveCliExecutable(provider, cfg.cliPaths?.[provider]);
  if (!resolved) throw new Error(cliUnavailableHint(provider));

  // 工作副本：CLI 只改 output；skeleton 保持只读对照
  fs.copyFileSync(skeletonPath, dest);
  const slotCount = (fs.readFileSync(dest, 'utf-8').match(/<!-- LLM_FILL/g) ?? []).length;
  onLog?.(`[unity-single] 已复制骨架 → performance-report.md（${slotCount} 个 LLM_FILL 槽）`);

  const prompt = buildSinglePrompt(skeletonPath, summaryPath, outputDir, projectRoot);
  fs.writeFileSync(path.join(outputDir, 'unity-single-cli-prompt.txt'), prompt, 'utf-8');
  onLog?.(`[unity-single] CLI 填槽 (${provider})，超时 ${CLI_TIMEOUT_MS / 60_000}min…`);

  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawnCliProcess(command, CLI_ARGS[provider] ?? CLI_ARGS.codebuddy, {
      cwd: cfg.skillProjectPath,
      env: process.env,
      windowsHide: true,
      stdio: 'pipe',
    });
    const logs: string[] = [];
    let settled = false;
    let timedOut = false;
    let killTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      fs.writeFileSync(path.join(outputDir, 'unity-single-cli.log'), logs.join('\n'), 'utf-8');
      normalizeReportInOutputDir(outputDir);
      if (err) reject(err);
      else resolve();
    };

    try { child.stdin?.write(prompt); child.stdin?.end(); } catch (e: any) { onLog?.(`stdin: ${e.message}`); }
    child.stdout?.on('data', d => { const t = d.toString().trim(); if (t) { logs.push(t); onLog?.(`[cli] ${t.slice(0, 300)}`); } });
    child.stderr?.on('data', d => { const t = d.toString().trim(); if (t) onLog?.(`[stderr] ${t.slice(0, 300)}`); });
    child.on('error', err => finish(err));
    child.on('close', code => {
      if (timedOut) {
        finish(new Error('AI 润色超时'));
        return;
      }
      if (code !== 0) finish(new Error(`CLI exit ${code}`));
      else if (!fs.existsSync(dest)) finish(new Error(`CLI 未生成 ${dest}`));
      else finish();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      onLog?.('[unity-single] CLI 超时，终止子进程…');
      if (child.exitCode === null) child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL');
      }, 8_000);
    }, CLI_TIMEOUT_MS);
  });
}

export async function buildUnitySingleReport(
  sample: UnitySingleSample,
  opts: UnitySingleOptions = {},
): Promise<UnitySingleResult> {
  if (!sample?.pdataPath) throw new Error('unity-single 缺少 pdataPath');

  const config = getConfig();
  const runId = opts.meta?.runId || `unity_${Date.now()}_${uuid().slice(0, 8)}`;
  const outputDir = path.join(config.dataDir, 'results', runId);
  fs.mkdirSync(outputDir, { recursive: true });

  const label = sample.label ?? opts.meta?.label ?? path.basename(sample.pdataPath, '.pdata');
  const targetFps = sample.targetFps ?? opts.meta?.targetFps ?? 60;

  opts.onLog?.(`[unity-single] preprocess → ${outputDir}`);
  await runSourceProfileBuild('unity_profiler', sample.pdataPath, outputDir, {
    targetFps,
    meta: { label, device: sample.device, scene: sample.scene },
    onLog: opts.onLog,
  });

  const preprocessPath = path.join(outputDir, 'preprocess-result.json');
  if (!fs.existsSync(preprocessPath)) {
    throw new Error(`preprocess-result.json 缺失: ${preprocessPath}`);
  }

  const { skeletonPath, summaryPath } = await renderSkeleton(
    preprocessPath,
    outputDir,
    config.skillProjectPath,
    label,
    opts.onLog,
  );

  const reportPath = path.join(outputDir, 'performance-report.md');
  let deliverMd = fs.readFileSync(skeletonPath, 'utf-8');
  let usedAi = false;
  let deliverSource: UnitySingleResult['deliverSource'] = 'skeleton';
  let quality: SingleReportQuality;

  if (opts.skipAiEnrich) {
    opts.onLog?.('[unity-single] skipAiEnrich=true，交付 skeleton');
    fs.writeFileSync(reportPath, deliverMd, 'utf-8');
    quality = validateSingleReport(reportPath, skeletonPath);
    quality.warnings.push('skipAiEnrich：仅交付 Provider 骨架');
    quality.errors = quality.errors.filter(e => !e.includes('LLM_FILL'));
    quality.ok = quality.errors.length === 0;
  } else {
    const cliProvider = opts.cliProvider ?? defaultCliProvider(config.cliPaths);
    if (cliProvider === 'mock' || !isCliAvailable(cliProvider, config.cliPaths?.[cliProvider])) {
      throw new Error(`ai-authored 需要 CLI (${cliProvider})，当前不可用`);
    }
    try {
      await runCliSingle(outputDir, skeletonPath, summaryPath, cliProvider, config.skillProjectPath, opts.onLog);
      quality = validateSingleReport(reportPath, skeletonPath);
      if (!quality.ok) {
        throw new Error(quality.errors.join('; '));
      }
      deliverMd = fs.readFileSync(reportPath, 'utf-8');
      usedAi = true;
      deliverSource = 'ai-authored';
      opts.onLog?.(`[unity-single] ai-authored ✅ ${quality.lineCount} 行`);
    } catch (e) {
      opts.onLog?.(`[unity-single][warn] CLI/质量门失败: ${(e as Error).message}; 兜底交付骨架`);
      // skeleton 未被 CLI 修改（CLI 只写 performance-report.md）；始终从 pristine 骨架兜底
      fs.copyFileSync(skeletonPath, reportPath);
      quality = validateSingleReport(reportPath, skeletonPath);
      quality.warnings.push(`L0 兜底：${(e as Error).message.slice(0, 120)}`);
      deliverMd = fs.readFileSync(reportPath, 'utf-8');
      deliverSource = 'skeleton';
    }
  }
  fs.writeFileSync(path.join(outputDir, 'unity-single-quality.json'), JSON.stringify(quality!, null, 2), 'utf-8');

  const exported = saveReportMarkdown('p-web-unity', `performance-report_${runId}`, deliverMd);

  try {
    saveAnalysisWithReport(
      {
        id: `analysis_${runId}_unity`,
        mode: 'single',
        runIds: [runId],
        status: 'completed',
        skill: 'unity-profiler-analysis',
      },
      { headline: reportHeadline(deliverMd), markdown: deliverMd, insights: [] },
      { analysisId: `analysis_${runId}_unity`, skill: 'unity-profiler-analysis' },
    );
  } catch (e: any) {
    opts.onLog?.(`[unity-single] 入库失败 (报告已导出): ${e.message}`);
  }

  return {
    runId,
    reportPath: exported,
    outputDir,
    markdown: deliverMd,
    skeletonPath,
    summaryPath,
    usedAi,
    deliverSource,
  };
}
