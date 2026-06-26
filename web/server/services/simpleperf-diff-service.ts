import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { v4 as uuid } from 'uuid';
import type { CliProvider } from '../../shared/types.js';
import {
  buildSimpleperfDiffProfile,
  ingestProfile,
  runProjectPython,
  type IngestMeta,
} from './run-ingest-service.js';
import { saveAnalysisWithReport } from './analysis-store.js';
import { saveReportMarkdown } from './report-export.js';
import { getConfig } from '../utils/config.js';
import { defaultCliProvider, isCliAvailable, cliUnavailableHint, resolveCliExecutable, spawnCliProcess } from '../utils/cli-resolver.js';

export interface SimpleperfDiffInput {
  basePerfPath: string;
  curPerfPath: string;
  binaryCachePath?: string;
  sceneBase?: string;
  sceneCur?: string;
}

export interface SimpleperfDiffBundleInput {
  reportMarkdown: string;
  diffJsonPath?: string;
  providerReportPath?: string;
}

export interface SimpleperfDiffOptions {
  meta?: IngestMeta;
  binaryCachePath?: string;
  sceneBase?: string;
  sceneCur?: string;
  cliProvider?: CliProvider;
  skipAiEnrich?: boolean;
  /** @deprecated use skipAiEnrich — only skips optional CLI boost; Python enrich always runs */
  skipCliBoost?: boolean;
  onLog?: (line: string) => void;
}

export interface SimpleperfDiffResult {
  diffId: string;
  runId: string;
  reportPath: string;
  outputDir: string;
  markdown: string;
  usedAi: boolean;
}

interface CliProviderConfig {
  label: string;
  buildArgs: (prompt: string) => string[];
}

const CLI_PROVIDERS: Record<CliProvider, CliProviderConfig> = {
  codebuddy: {
    label: 'CodeBuddy',
    buildArgs: (prompt: string) => [
      '-p', prompt,
      '--output-format', 'stream-json',
      '-y',
      '--dangerously-skip-permissions',
      '--allowedTools', 'Read,Write,Glob,Grep',
    ],
  },
  claude: {
    label: 'Claude Code',
    buildArgs: (prompt: string) => [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--allowedTools', 'Read,Write,Glob,Grep',
    ],
  },
  mock: { label: 'Mock', buildArgs: () => [] },
};

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80);
}

function goldenReportPath(projectRoot: string): string {
  return path.join(projectRoot, 'docs', 'report', 'performance-report_simpleperf_ULTIMATE_v4.md');
}

function reportHeadline(markdown: string): string {
  const line = markdown.split('\n').find(l => l.startsWith('#') || l.startsWith('## §0'));
  if (!line) return 'simpleperf v4 差分报告';
  return line.replace(/^#+\s*/, '').trim().slice(0, 120);
}

function subjectiveFpsLabel(meta?: IngestMeta): string | undefined {
  if (!meta?.targetFps) return undefined;
  return `~${meta.targetFps} fps`;
}

async function runPostProviderPipeline(workDir: string, onLog?: (line: string) => void): Promise<void> {
  onLog?.('[diff] build_simpleperf_diff_summary…');
  await runProjectPython('scripts/build_simpleperf_diff_summary.py', [workDir], onLog, 120_000);
  onLog?.('[diff] validate_v4_report…');
  await runProjectPython('scripts/validate_v4_report.py', [workDir], onLog, 120_000);
  const providerReport = path.join(workDir, 'report', 'performance-report_simpleperf_v4.md');
  onLog?.('[diff] compare_v4_report_quality (Provider)…');
  await runProjectPython(
    'scripts/compare_v4_report_quality.py',
    [providerReport, '--min-length-ratio=0.82'],
    onLog,
    60_000,
  );
}

async function runQualityGate(reportPath: string, minRatio: number, onLog?: (line: string) => void): Promise<boolean> {
  try {
    await runProjectPython(
      'scripts/compare_v4_report_quality.py',
      [reportPath, `--min-length-ratio=${minRatio}`],
      onLog,
      60_000,
    );
    return true;
  } catch (e: any) {
    onLog?.(`[quality] FAIL: ${e.message || e}`);
    return false;
  }
}

function buildDiffEnrichPrompt(workDir: string): string {
  const config = getConfig();
  const skillDir = path.join(config.skillProjectPath, '.claude', 'skills', 'simpleperf-diff-analysis').replace(/\\/g, '/');
  const providerReport = path.join(workDir, 'report', 'performance-report_simpleperf_v4.md').replace(/\\/g, '/');
  const aiReport = path.join(workDir, 'report', 'performance-report_simpleperf_AI_v4.md').replace(/\\/g, '/');
  const summary = path.join(workDir, 'simpleperf-diff-summary.json').replace(/\\/g, '/');
  const golden = goldenReportPath(config.skillProjectPath).replace(/\\/g, '/');
  return [
    'Unity Android CPU analyst. HYBRID mode: enrich existing Provider v4 simpleperf diff report only.',
    '',
    `[SKILL] ${skillDir}/SKILL.md`,
    `[KNOWLEDGE] ${config.skillProjectPath.replace(/\\/g, '/')}/docs/aoe-cpu-analysis-knowledge.md`,
    '',
    '## Input (READ FIRST)',
    `- Provider skeleton: ${providerReport}`,
    `- Summary JSON: ${summary}`,
    `- Gold reference: ${golden}`,
    '',
    '## Task',
    '1. Read Provider skeleton completely.',
    '2. Keep ALL tables, mermaid charts, call trees, section headers UNCHANGED.',
    '3. ONLY enrich §0 and §4.3–4.6 narrative (no new numbers).',
    `4. Write enriched report to: ${aiReport}`,
    `5. Also copy final to: ${path.join(workDir, 'performance-report.md').replace(/\\/g, '/')}`,
    '6. Do NOT invent §4.1 probe table or duplicate Top-N tables.',
  ].join('\n');
}

async function runCliDiffEnrich(
  workDir: string,
  provider: CliProvider,
  onLog?: (line: string) => void,
): Promise<string | null> {
  const dest = path.join(workDir, 'performance-report.md');
  const aiReport = path.join(workDir, 'report', 'performance-report_simpleperf_AI_v4.md');
  const providerReport = path.join(workDir, 'report', 'performance-report_simpleperf_v4.md');

  if (provider === 'mock') {
    onLog?.('[diff] Mock: 跳过 AI 润色，使用 Provider 报告');
    return null;
  }

  const cfg = getConfig();
  const providerCfg = CLI_PROVIDERS[provider] ?? CLI_PROVIDERS.codebuddy;
  const { command, resolved } = resolveCliExecutable(provider, cfg.cliPaths?.[provider]);
  if (!resolved) throw new Error(cliUnavailableHint(provider));

  const prompt = buildDiffEnrichPrompt(workDir);
  fs.writeFileSync(path.join(workDir, 'diff-cli-prompt.txt'), prompt, 'utf-8');
  const args = providerCfg.buildArgs(prompt);
  const logs: string[] = [];
  onLog?.(`[diff] ${providerCfg.label} CLI 润色…`);

  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawnCliProcess(command, args, {
      cwd: cfg.skillProjectPath,
      env: process.env,
      windowsHide: true,
      stdio: 'pipe',
    });
    let jsonBuffer = '';
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      fs.writeFileSync(path.join(workDir, 'diff-cli.log'), logs.join('\n'), 'utf-8');
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
        logs.push(trimmed.slice(0, 600));
        onLog?.(`[cli] ${trimmed.slice(0, 400)}`);
      }
    });
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        logs.push(`[stderr] ${text}`);
        onLog?.(`[stderr] ${text.slice(0, 400)}`);
      }
    });
    child.on('error', err => finish(err));
    child.on('close', code => {
      if (code !== 0) {
        finish(new Error(`CLI 退出码: ${code}`));
        return;
      }
      finish();
    });
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        finish(new Error('simpleperf diff AI 润色超时'));
      }
    }, 12 * 60 * 1000);
  });

  if (fs.existsSync(aiReport)) return aiReport;
  if (fs.existsSync(dest)) return dest;
  return null;
}

async function finalizeDeliverable(
  workDir: string,
  providerReport: string,
  cliProvider: CliProvider,
  skipCliBoost: boolean,
  onLog?: (line: string) => void,
): Promise<{ markdown: string; usedAi: boolean }> {
  const dest = path.join(workDir, 'performance-report.md');
  const enrichedReport = path.join(workDir, 'report', 'performance-report_simpleperf_AI_v4.md');

  onLog?.('[diff] enrich_v4_report（叙事润色）…');
  await runProjectPython('scripts/enrich_v4_report.py', [workDir], onLog, 120_000);
  onLog?.('[diff] validate_v4_report（润色后）…');
  await runProjectPython('scripts/validate_v4_report.py', [workDir], onLog, 120_000);

  let deliverPath = enrichedReport;
  let usedAi = true;

  if (await runQualityGate(enrichedReport, 0.95, onLog)) {
    onLog?.('[diff] 润色报告达到金标准厚度 (≥0.95×)');
  } else if (await runQualityGate(enrichedReport, 0.92, onLog)) {
    onLog?.('[diff] 润色报告达到交付厚度 (≥0.92× 金标准)');
  } else if (await runQualityGate(enrichedReport, 0.82, onLog)) {
    onLog?.('[diff] 润色报告通过基础质量门');
  } else {
    onLog?.('[diff] 润色报告未过质量门，回退 Provider');
    deliverPath = providerReport;
    usedAi = false;
  }

  if (
    !skipCliBoost
    && cliProvider !== 'mock'
    && isCliAvailable(cliProvider, getConfig().cliPaths?.[cliProvider])
  ) {
    try {
      const cliPath = await runCliDiffEnrich(workDir, cliProvider, onLog);
      if (cliPath && await runQualityGate(cliPath, 0.95, onLog)) {
        deliverPath = cliPath;
        usedAi = true;
        onLog?.('[diff] CLI 润色超越金标准质量门');
      } else if (cliPath && await runQualityGate(cliPath, 0.82, onLog)) {
        const cliMd = fs.readFileSync(cliPath, 'utf-8');
        const curMd = fs.readFileSync(deliverPath, 'utf-8');
        if (cliMd.split('\n').length > curMd.split('\n').length) {
          deliverPath = cliPath;
          usedAi = true;
          onLog?.('[diff] CLI 润色更厚，采用 CLI 版本');
        }
      }
    } catch (e: any) {
      onLog?.(`[diff] CLI 润色跳过: ${e.message || e}`);
    }
  }

  if (!fs.existsSync(deliverPath)) {
    if (!fs.existsSync(providerReport)) {
      throw new Error(`报告不存在: ${deliverPath}`);
    }
    deliverPath = providerReport;
    usedAi = false;
  }

  const markdown = fs.readFileSync(deliverPath, 'utf-8');
  fs.writeFileSync(dest, markdown, 'utf-8');
  fs.writeFileSync(
    path.join(workDir, 'diff-report-quality.json'),
    JSON.stringify({ usedAi, deliverPath, providerReport, enrichedReport }, null, 2),
    'utf-8',
  );
  return { markdown, usedAi };
}

export async function buildSimpleperfDiffReport(
  input: SimpleperfDiffInput,
  opts: SimpleperfDiffOptions = {},
): Promise<SimpleperfDiffResult> {
  const config = getConfig();
  const diffId = opts.meta?.runId || `spdiff_${Date.now()}_${uuid().slice(0, 8)}`;
  const outputDir = path.join(config.dataDir, 'results', diffId);
  fs.mkdirSync(outputDir, { recursive: true });

  const meta: IngestMeta & { binaryCachePath?: string; sceneBase?: string; sceneCur?: string; subjectiveFps?: string } = {
    ...opts.meta,
    runId: diffId,
    label: opts.meta?.label ?? diffId,
    sceneBase: input.sceneBase ?? opts.sceneBase ?? 'base',
    sceneCur: input.sceneCur ?? opts.sceneCur ?? opts.meta?.scene ?? 'cur',
    subjectiveFps: subjectiveFpsLabel(opts.meta),
  };
  const bcache = input.binaryCachePath ?? opts.binaryCachePath;

  opts.onLog?.('[diff] Provider build_simpleperf_profile (base+cur)…');
  const built = await buildSimpleperfDiffProfile(
    input.basePerfPath,
    input.curPerfPath,
    {
      ...meta,
      binaryCachePath: bcache,
      sceneBase: meta.sceneBase,
      sceneCur: meta.sceneCur,
      subjectiveFps: meta.subjectiveFps,
    },
    outputDir,
    opts.onLog,
  );

  await runPostProviderPipeline(built.workDir, opts.onLog);

  const cliProvider = opts.cliProvider ?? defaultCliProvider(config.cliPaths);
  const { markdown, usedAi } = await finalizeDeliverable(
    built.workDir,
    built.reportPath,
    cliProvider,
    Boolean(opts.skipAiEnrich),
    opts.onLog,
  );

  const runId = `${diffId}_cur`;
  opts.onLog?.('[diff] 入库 cur profile…');
  await ingestProfile(built.profile, { ...meta, runId, label: meta.sceneCur });

  const exported = saveReportMarkdown('p-web-simpleperf-diff', `performance-report_${sanitizeId(diffId)}`, markdown);
  saveAnalysisWithReport(
    {
      id: `analysis_${diffId}_simpleperf_diff`,
      mode: 'compare',
      runIds: [runId],
      status: 'completed',
      skill: 'simpleperf-diff-analysis',
    },
    { headline: reportHeadline(markdown), markdown, insights: [] },
    { analysisId: `analysis_${diffId}_simpleperf_diff`, skill: 'simpleperf-diff-analysis' },
  );

  if (built.diffPath && fs.existsSync(built.diffPath)) {
    fs.copyFileSync(built.diffPath, path.join(outputDir, 'simpleperf-diff.json'));
  }

  return {
    diffId,
    runId,
    reportPath: exported,
    outputDir: built.workDir,
    markdown,
    usedAi,
  };
}

/** 客户端本地已分析：直接上传 markdown（+ 可选 diff JSON） */
export async function ingestSimpleperfDiffBundle(
  bundle: SimpleperfDiffBundleInput,
  opts: SimpleperfDiffOptions = {},
): Promise<SimpleperfDiffResult> {
  const config = getConfig();
  const diffId = opts.meta?.runId || `spdiff_bundle_${Date.now()}_${uuid().slice(0, 8)}`;
  const outputDir = path.join(config.dataDir, 'results', diffId);
  fs.mkdirSync(path.join(outputDir, 'report'), { recursive: true });

  const providerPath = path.join(outputDir, 'report', 'performance-report_simpleperf_v4.md');
  const src = bundle.providerReportPath && fs.existsSync(bundle.providerReportPath)
    ? bundle.providerReportPath
    : null;
  if (src) {
    fs.copyFileSync(src, providerPath);
  } else {
    fs.writeFileSync(providerPath, bundle.reportMarkdown, 'utf-8');
  }

  if (bundle.diffJsonPath && fs.existsSync(bundle.diffJsonPath)) {
    fs.mkdirSync(path.join(outputDir, 'diff'), { recursive: true });
    fs.copyFileSync(bundle.diffJsonPath, path.join(outputDir, 'diff', 'simpleperf-diff.json'));
  }

  opts.onLog?.('[diff] 校验上传报告质量…');
  const gateOk = await runQualityGate(providerPath, 0.78, opts.onLog);
  if (!gateOk) {
    opts.onLog?.('[diff] 警告: 上传报告未完全通过 v4 质量门，仍将展示上传内容');
  }

  const markdown = fs.readFileSync(providerPath, 'utf-8');
  fs.writeFileSync(path.join(outputDir, 'performance-report.md'), markdown, 'utf-8');

  const runId = `${diffId}_cur`;
  const exported = saveReportMarkdown('p-web-simpleperf-diff', `performance-report_${sanitizeId(diffId)}`, markdown);
  saveAnalysisWithReport(
    {
      id: `analysis_${diffId}_simpleperf_diff`,
      mode: 'compare',
      runIds: [runId],
      status: 'completed',
      skill: 'simpleperf-diff-analysis',
    },
    { headline: reportHeadline(markdown), markdown, insights: [] },
    { analysisId: `analysis_${diffId}_simpleperf_diff`, skill: 'simpleperf-diff-analysis' },
  );

  return {
    diffId,
    runId,
    reportPath: exported,
    outputDir,
    markdown,
    usedAi: false,
  };
}
