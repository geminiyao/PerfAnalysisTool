// Run 入库后的 skill 分析 (三源 CLI skill + 多源 cross builder)

import fs from 'fs';
import type { Run, SourceId } from '../../shared/perf-model.js';
import type { CliProvider } from '../../shared/types.js';
import { generateCrossSourceAnalysisForRun } from './cross-source-analysis-service.js';
import { resolveUnityTargetFps } from './unity-preprocess-runner.js';
import { resolveSimpleperfBinaryCache } from './source-profile-runner.js';
import type { SkillKind } from './skill-config.js';
import { getRun } from './run-store.js';
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

  // unity 单次：Hybrid v6 Provider 骨架 → LLM 填槽
  if (source === 'unity_profiler') {
    const { buildUnitySingleReport } = await import('./unity-single-service.js');
    const result = await buildUnitySingleReport(
      {
        pdataPath: inputPath,
        label: run.label,
        device: run.meta?.device,
        scene: run.meta?.scene,
        targetFps: resolveUnityTargetFps(opts.targetFps, run.meta),
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

  throw new Error(`不支持的 skill 源: ${source}`);
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
