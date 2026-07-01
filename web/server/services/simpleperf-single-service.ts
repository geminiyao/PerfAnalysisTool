// simpleperf-single-service.ts — Hybrid v4 simpleperf 单次形态
// Provider (build_simpleperf_profile N=1) → enrich_v4_single → 可选 CLI → 质量门

import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import type { CliProvider } from '../../shared/types.js';
import type { IngestMeta } from './run-ingest-service.js';
import { buildSimpleperfProfile, ingestProfile, runProjectPython } from './run-ingest-service.js';
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
import { resolveSkillDir } from './skill-config.js';
import type { ChildProcess } from 'child_process';

export interface SimpleperfSingleSample {
  perfPath: string;
  binaryCachePath?: string;
  label?: string;
  device?: string;
  scene?: string;
}

export interface SimpleperfSingleOptions {
  meta?: IngestMeta;
  cliProvider?: CliProvider;
  skipAiEnrich?: boolean;
  onLog?: (line: string) => void;
}

export interface SimpleperfSingleResult {
  runId: string;
  reportPath: string;
  outputDir: string;
  markdown: string;
  providerPath: string;
  enrichedPath: string;
  usedAi: boolean;
  deliverSource: 'ai-authored' | 'enriched' | 'provider';
}

const CLI_ARGS: Record<CliProvider, string[]> = {
  codebuddy: ['-p', '--output-format', 'stream-json', '-y', '--dangerously-skip-permissions', '--allowedTools', 'Bash,Read,Write,Glob,Grep,Edit'],
  claude: ['-p', '--output-format', 'stream-json', '--allowedTools', 'Bash,Read,Write,Glob,Grep,Edit'],
  mock: [],
};

function reportHeadline(markdown: string): string {
  const line = markdown.split('\n').find(l => l.startsWith('#'));
  return line ? line.replace(/^#+\s*/, '').trim().slice(0, 120) : 'Simpleperf 单次报告';
}

async function runQualityGate(reportPath: string, minRatio: number, onLog?: (line: string) => void): Promise<boolean> {
  try {
    await runProjectPython(
      'scripts/compare_v4_single_report_quality.py',
      [reportPath, String(minRatio)],
      onLog,
      60_000,
    );
    return true;
  } catch (e: any) {
    onLog?.(`[single] 质量门 FAIL: ${e.message?.slice(0, 200)}`);
    return false;
  }
}

function buildCliPrompt(workDir: string, enrichedPath: string, projectRoot: string): string {
  const skillDir = resolveSkillDir(projectRoot, 'simpleperf').replace(/\\/g, '/');
  const templatePath = path.join(skillDir, 'prompts', 'single-prompt.txt');
  const template = fs.readFileSync(templatePath, 'utf-8');
  const summaryPath = path.join(workDir, 'simpleperf-profile-summary.json').replace(/\\/g, '/');
  const golden = path.join(projectRoot, 'output', 'samples', 'simpleperf-single', 'performance-report.web-stressmove.md').replace(/\\/g, '/');
  const outputPath = path.join(workDir, 'performance-report.md').replace(/\\/g, '/');
  const enrichedNorm = path.resolve(enrichedPath).replace(/\\/g, '/');
  return template
    .replace(/\{\{ENRICHED_PATH\}\}/g, enrichedNorm)
    .replace(/\{\{SUMMARY_PATH\}\}/g, summaryPath)
    .replace(/\{\{GOLDEN_PATH\}\}/g, golden)
    .replace(/\{\{OUTPUT_PATH\}\}/g, outputPath);
}

async function runCliSingle(
  workDir: string,
  enrichedPath: string,
  provider: CliProvider,
  onLog?: (line: string) => void,
): Promise<void> {
  const config = getConfig();
  const dest = path.join(workDir, 'performance-report.md');
  if (provider === 'mock') {
    fs.copyFileSync(enrichedPath, dest);
    return;
  }
  const { command, resolved } = resolveCliExecutable(provider, config.cliPaths?.[provider]);
  if (!resolved) throw new Error(cliUnavailableHint(provider));

  const prompt = buildCliPrompt(workDir, enrichedPath, config.skillProjectPath);
  fs.writeFileSync(path.join(workDir, 'single-cli-prompt.txt'), prompt, 'utf-8');
  const args = CLI_ARGS[provider] ?? CLI_ARGS.codebuddy;
  onLog?.(`[single] CLI 加厚 (${provider})…`);

  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawnCliProcess(command, args, {
      cwd: config.skillProjectPath,
      env: process.env,
      windowsHide: true,
      stdio: 'pipe',
    });
    const logs: string[] = [];
    try {
      child.stdin?.write(prompt);
      child.stdin?.end();
    } catch (e: any) {
      onLog?.(`[single] stdin: ${e.message}`);
    }
    child.stdout?.on('data', (d: Buffer) => {
      const t = d.toString().trim();
      if (t) { logs.push(t); onLog?.(`[cli] ${t.slice(0, 300)}`); }
    });
    child.stderr?.on('data', (d: Buffer) => {
      const t = d.toString().trim();
      if (t) onLog?.(`[stderr] ${t.slice(0, 300)}`);
    });
    child.on('error', reject);
    child.on('close', code => {
      fs.writeFileSync(path.join(workDir, 'single-cli.log'), logs.join('\n'), 'utf-8');
      if (code !== 0) reject(new Error(`CLI exit ${code}`));
      else if (!fs.existsSync(dest)) reject(new Error('CLI 未产出 performance-report.md'));
      else resolve();
    });
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        reject(new Error('CLI 超时'));
      }
    }, 12 * 60 * 1000);
  });
}

export async function buildSimpleperfSingleReport(
  sample: SimpleperfSingleSample,
  opts: SimpleperfSingleOptions = {},
): Promise<SimpleperfSingleResult> {
  if (!sample?.perfPath) throw new Error('simpleperf-single 缺少 perfPath');

  const config = getConfig();
  const runId = opts.meta?.runId || `sp_${Date.now()}_${uuid().slice(0, 8)}`;
  const outputDir = path.join(config.dataDir, 'results', runId);
  fs.mkdirSync(outputDir, { recursive: true });

  const label = sample.label ?? opts.meta?.label ?? path.basename(sample.perfPath, '.data');
  opts.onLog?.('[single] Provider build_simpleperf_profile (N=1)…');
  const profile = await buildSimpleperfProfile(
    sample.perfPath,
    {
      ...opts.meta,
      runId,
      label,
      device: sample.device ?? opts.meta?.device,
      scene: sample.scene ?? opts.meta?.scene,
      binaryCachePath: sample.binaryCachePath,
    },
    outputDir,
    opts.onLog,
  );

  await ingestProfile(profile, { ...opts.meta, runId, label });

  const providerPath = path.join(outputDir, 'report', 'performance-report_simpleperf_single_v4.md');
  if (!fs.existsSync(providerPath)) {
    throw new Error(`Provider 骨架未产出: ${providerPath}`);
  }

  opts.onLog?.('[single] enrich_v4_single_report…');
  await runProjectPython('scripts/enrich_v4_single_report.py', [outputDir], opts.onLog, 120_000);
  const enrichedPath = path.join(outputDir, 'report', 'performance-report_simpleperf_AI_single_v4.md');
  if (!fs.existsSync(enrichedPath)) {
    throw new Error(`enrich 未产出: ${enrichedPath}`);
  }

  let deliverPath = enrichedPath;
  let usedAi = false;
  let deliverSource: SimpleperfSingleResult['deliverSource'] = 'enriched';

  const cliProvider = opts.cliProvider ?? defaultCliProvider(config.cliPaths);
  if (!opts.skipAiEnrich) {
    if (cliProvider === 'mock' || !isCliAvailable(cliProvider, config.cliPaths?.[cliProvider])) {
      throw new Error(`ai-thickened 需要 CLI (${cliProvider}) 可用`);
    }
    await runCliSingle(outputDir, enrichedPath, cliProvider, opts.onLog);
    const aiPath = path.join(outputDir, 'performance-report.md');
    if (!(await runQualityGate(aiPath, 0.75, opts.onLog))) {
      throw new Error('validateSimpleperfSingleQuality FAIL');
    }
    deliverPath = aiPath;
    usedAi = true;
    deliverSource = 'ai-authored';
    opts.onLog?.('[single] ai-thickened ✅');
  } else if (!(await runQualityGate(enrichedPath, 0.7, opts.onLog))) {
    opts.onLog?.('[single] enriched 未过质量门，回退 Provider');
    deliverPath = providerPath;
    deliverSource = 'provider';
    usedAi = false;
  }

  const markdown = fs.readFileSync(deliverPath, 'utf-8');
  fs.writeFileSync(path.join(outputDir, 'performance-report.md'), markdown, 'utf-8');
  fs.writeFileSync(
    path.join(outputDir, 'single-report-quality.json'),
    JSON.stringify({ usedAi, deliverSource, providerPath, enrichedPath, deliverPath }, null, 2),
    'utf-8',
  );

  const exported = saveReportMarkdown('p-web-simpleperf', `performance-report_${runId}`, markdown);

  try {
    saveAnalysisWithReport(
      {
        id: `analysis_${runId}_simpleperf_single`,
        mode: 'single',
        runIds: [runId],
        status: 'completed',
        skill: 'simpleperf-native-analysis',
      },
      { headline: reportHeadline(markdown), markdown, insights: [] },
      { analysisId: `analysis_${runId}_simpleperf_single`, skill: 'simpleperf-native-analysis' },
    );
  } catch (e: any) {
    opts.onLog?.(`[single] 入库失败 (报告已导出): ${e.message}`);
  }

  opts.onLog?.(`[single] 完成 (${deliverSource}) → ${exported}`);
  return {
    runId,
    reportPath: exported,
    outputDir,
    markdown,
    providerPath,
    enrichedPath,
    usedAi,
    deliverSource,
  };
}
