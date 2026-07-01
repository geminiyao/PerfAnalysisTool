// Run 入库后的 skill 分析 (三源 CLI skill + 多源 cross builder)

import fs from 'fs';
import path from 'path';
import type { Run, SourceId } from '../../shared/perf-model.js';
import type { CliProvider } from '../../shared/types.js';
import { getConfig } from '../utils/config.js';
import { executeCli } from './cli-executor.js';
import { generateCrossSourceAnalysisForRun } from './cross-source-analysis-service.js';
import { saveAnalysisWithReport } from './analysis-store.js';
import { saveReportMarkdown } from './report-export.js';
import { saveAnalysisLogs, readPreprocessJson } from './report-artifacts.js';
import {
  frameCountFromMarkdown,
  resolveUnityTargetFps,
} from './unity-preprocess-runner.js';
import {
  runSourceProfileBuild,
  resolveSimpleperfBinaryCache,
} from './source-profile-runner.js';
import { getSkillConfig, type SkillKind, normalizeReportInOutputDir } from './skill-config.js';
import { getRun } from './run-store.js';
import { defaultCliProvider, isCliAvailable, cliUnavailableHint } from '../utils/cli-resolver.js';
import type { PerfettoIngestOptions } from './run-ingest-service.js';

export interface RunAnalysisOptions {
  cliProvider?: CliProvider;
  targetFps?: number;
  perfetto?: PerfettoIngestOptions;
  binaryCachePath?: string;
  onLog?: (line: string) => void;
}

const SINGLE_SOURCE_SKILL_KINDS = ['unity_profiler', 'perfetto', 'simpleperf'] as const;

function isSingleSourceSkill(source: SourceId): source is SkillKind {
  return (SINGLE_SOURCE_SKILL_KINDS as readonly string[]).includes(source);
}
const SINGLE_SOURCE_SKILLS: Record<SkillKind, { skill: string; exportDir: string }> = {
  unity_profiler: { skill: 'unity-profiler-analysis', exportDir: 'p-web-unity' },
  perfetto: { skill: 'perfetto-trace-analysis', exportDir: 'p-web-perfetto' },
  simpleperf: { skill: 'simpleperf-native-analysis', exportDir: 'p-web-simpleperf' },
};

function findRawPath(run: Run, source: SourceId): string | undefined {
  const ref = run.profile.raw?.find(r =>
    r.source === source && r.localPath && fs.existsSync(r.localPath),
  );
  return ref?.localPath;
}

function extractHeadline(markdown: string, fallback: string): string {
  const line = markdown.split('\n').find(l => l.startsWith('#'));
  return line ? line.replace(/^#+\s*/, '').trim() : fallback;
}

async function runSingleSourceSkillAnalysis(
  runId: string,
  source: SkillKind,
  opts: RunAnalysisOptions = {},
): Promise<{ markdownPath: string; outputDir: string }> {
  const run = getRun(runId);
  if (!run) throw new Error(`Run 不存在: ${runId}`);

  const inputPath = findRawPath(run, source);
  if (!inputPath) throw new Error(`Run 无 ${source} 原始文件路径`);

  // perfetto 单次：Hybrid v6 骨架填空
  if (source === 'perfetto') {
    const { buildPerfettoSingleReport } = await import('./perfetto-single-service.js');
    const result = await buildPerfettoSingleReport(
      { tracePath: inputPath, label: run.label },
      {
        meta: {
          runId,
          label: run.label,
          device: run.meta?.device,
          scene: run.meta?.scene,
          projectName: run.meta?.projectName,
          version: run.meta?.version,
        },
        perfetto: opts.perfetto,
        cliProvider: opts.cliProvider,
        onLog: opts.onLog,
      },
    );
    return { markdownPath: result.reportPath, outputDir: result.outputDir };
  }

  // simpleperf 单次：Hybrid v4 Provider → enrich → CLI
  if (source === 'simpleperf') {
    const { buildSimpleperfSingleReport } = await import('./simpleperf-single-service.js');
    const result = await buildSimpleperfSingleReport(
      {
        perfPath: inputPath,
        binaryCachePath: opts.binaryCachePath ?? resolveSimpleperfBinaryCache(run.profile.raw),
        label: run.label,
        device: run.meta?.device,
        scene: run.meta?.scene,
      },
      {
        meta: {
          runId,
          label: run.label,
          device: run.meta?.device,
          scene: run.meta?.scene,
          projectName: run.meta?.projectName,
          version: run.meta?.version,
        },
        cliProvider: opts.cliProvider,
        skipAiEnrich: false,
        onLog: opts.onLog,
      },
    );
    return { markdownPath: result.reportPath, outputDir: result.outputDir };
  }

  const config = getConfig();
  const outputDir = path.join(config.dataDir, 'results', runId);
  fs.mkdirSync(outputDir, { recursive: true });

  const meta = { label: run.label, device: run.meta?.device, scene: run.meta?.scene };
  const skillMeta = SINGLE_SOURCE_SKILLS[source];
  const cfg = getSkillConfig(source);

  let cliProvider = opts.cliProvider ?? defaultCliProvider(config.cliPaths);
  if (cliProvider !== 'mock' && !isCliAvailable(cliProvider, config.cliPaths?.[cliProvider])) {
    opts.onLog?.(`[warn] ${cliUnavailableHint(cliProvider)} 已回退 Mock 模式`);
    cliProvider = 'mock';
  }

  opts.onLog?.(`[skill] 重建 ${source} profile → ${outputDir}`);
  await runSourceProfileBuild(source, inputPath, outputDir, {
    targetFps: resolveUnityTargetFps(opts.targetFps, run.meta),
    perfetto: opts.perfetto,
    binaryCachePath: opts.binaryCachePath ?? resolveSimpleperfBinaryCache(run.profile.raw),
    meta,
    onLog: opts.onLog,
  });

  if (source === 'unity_profiler') {
    const preSrc = path.join(outputDir, 'preprocess-result.json');
    if (!fs.existsSync(preSrc)) {
      const unitySummary = path.join(outputDir, 'unity-profile-summary.json');
      if (fs.existsSync(unitySummary)) {
        opts.onLog?.('[skill] 使用 build-profile 产出 (无 preprocess-result.json 副本)');
      }
    }
  }

  opts.onLog?.(`[skill] ${skillMeta.skill} (${cliProvider}) → ${outputDir}`);

  const result = await executeCli({
    sessionId: runId,
    skill: source,
    inputPath,
    outputDir,
    cliProvider,
    params: { targetFps: resolveUnityTargetFps(opts.targetFps, run.meta) },
    onLog: opts.onLog,
  });

  if (result.logs?.length) saveAnalysisLogs(runId, result.logs);

  if (!result.success) {
    throw new Error(result.error || `${skillMeta.skill} 分析失败`);
  }

  normalizeReportInOutputDir(outputDir);
  const reportPath = path.join(outputDir, 'performance-report.md');
  if (!fs.existsSync(reportPath)) {
    throw new Error('skill 未产出 performance-report.md');
  }

  const markdown = fs.readFileSync(reportPath, 'utf-8');

  if (source === 'unity_profiler') {
    const pre = readPreprocessJson(runId);
    const reportFrames = frameCountFromMarkdown(markdown);
    const preFrames = pre?.frameSummary && typeof (pre.frameSummary as { count?: number }).count === 'number'
      ? (pre.frameSummary as { count: number }).count
      : null;
    if (reportFrames != null && preFrames != null && reportFrames !== preFrames) {
      opts.onLog?.(`[warn] 报告帧数 ${reportFrames} ≠ preprocess ${preFrames}，Mock/旧报告可能不匹配`);
    }
  }

  const headline = extractHeadline(markdown, cfg.reportTitleFallback);
  const exportedPath = saveReportMarkdown(
    skillMeta.exportDir,
    `performance-report_${runId}`,
    markdown,
  );

  saveAnalysisWithReport(
    {
      id: `analysis_${runId}_${source}`,
      mode: 'single',
      runIds: [runId],
      status: 'completed',
      skill: skillMeta.skill,
    },
    { headline, markdown, insights: [] },
    { analysisId: `analysis_${runId}_${source}`, skill: skillMeta.skill },
  );

  opts.onLog?.(`[skill] 报告已入库并落盘: ${exportedPath}`);
  return { markdownPath: exportedPath, outputDir };
}

/** @deprecated 使用 runSingleSourceSkillAnalysis(runId, 'unity_profiler') */
export async function runUnityProfilerSkillAnalysis(
  runId: string,
  opts: RunAnalysisOptions = {},
): Promise<{ markdownPath: string; outputDir: string }> {
  return runSingleSourceSkillAnalysis(runId, 'unity_profiler', opts);
}

export async function runPerfettoSkillAnalysis(
  runId: string,
  opts: RunAnalysisOptions = {},
): Promise<{ markdownPath: string; outputDir: string }> {
  return runSingleSourceSkillAnalysis(runId, 'perfetto', opts);
}

export async function runSimpleperfSkillAnalysis(
  runId: string,
  opts: RunAnalysisOptions = {},
): Promise<{ markdownPath: string; outputDir: string }> {
  return runSingleSourceSkillAnalysis(runId, 'simpleperf', opts);
}

/** 入库后自动分析: 单源 → 对应 skill; 多源 → cross builder */
export async function runPostIngestAnalysis(
  runId: string,
  opts: RunAnalysisOptions = {},
): Promise<{ skill: string; markdownPath?: string }> {
  const run = getRun(runId);
  if (!run) throw new Error(`Run 不存在: ${runId}`);

  const { sources } = run;

  if (sources.length >= 2) {
    opts.onLog?.('[skill] 多源 Run → cross-source 报告…');
    const res = await generateCrossSourceAnalysisForRun(runId, { onLog: opts.onLog });
    return { skill: 'cross-source-analysis', markdownPath: res.markdownPath };
  }

  if (sources.length === 1 && isSingleSourceSkill(sources[0])) {
    const source = sources[0];
    const res = await runSingleSourceSkillAnalysis(runId, source, {
      ...opts,
      targetFps: resolveUnityTargetFps(opts.targetFps, run.meta),
    });
    return { skill: SINGLE_SOURCE_SKILLS[source].skill, markdownPath: res.markdownPath };
  }

  throw new Error(`不支持的 Run 源: ${sources.join(', ')}`);
}
