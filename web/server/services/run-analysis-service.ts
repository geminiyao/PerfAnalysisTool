// 默认按源生成热点报告。专项分析入口继续使用对应的原始文件。

import fs from 'fs';
import type { Run, SourceId } from '../../shared/perf-model.js';
import type { CliProvider } from '../../shared/types.js';
import { saveHotspotReports } from './hotspot-reports.js';
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

export function runPostIngestAnalysis(runId: string, opts: RunAnalysisOptions = {}) {
  return runAnalysisForSources(runId, [], opts);
}

export async function runAnalysisForSources(runId: string, sources: string[], opts: RunAnalysisOptions = {}) {
  const run = getRun(runId);
  if (!run) throw new Error('采集记录不存在');
  opts.onLog?.('按数据源整理热点报告');
  return saveHotspotReports(run, sources);
}
