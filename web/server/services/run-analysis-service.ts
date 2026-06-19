// Run 入库后的 skill 分析 (Unity CLI skill / 多源 cross builder)

import fs from 'fs';
import path from 'path';
import type { Run } from '../../shared/perf-model.js';
import type { CliProvider } from '../../shared/types.js';
import { getConfig } from '../utils/config.js';
import { executeCli } from './cli-executor.js';
import { generateCrossSourceAnalysisForRun } from './cross-source-analysis-service.js';
import { saveAnalysisWithReport } from './analysis-store.js';
import { saveReportMarkdown } from './report-export.js';
import { saveAnalysisLogs, readPreprocessJson } from './report-artifacts.js';
import {
  findMatchingPerformanceReport,
  frameCountFromMarkdown,
  resolveUnityTargetFps,
  runUnityPreprocessScript,
} from './unity-preprocess-runner.js';
import { getRun } from './run-store.js';
import { defaultCliProvider, isCliAvailable, cliUnavailableHint } from '../utils/cli-resolver.js';

export interface RunAnalysisOptions {
  cliProvider?: CliProvider;
  targetFps?: number;
  onLog?: (line: string) => void;
}

function findRawPath(run: Run, roleHint: string): string | undefined {
  const ref = run.profile.raw?.find(r =>
    r.localPath && (r.role?.includes(roleHint) || r.fileName?.includes(roleHint)),
  );
  if (ref?.localPath && fs.existsSync(ref.localPath)) return ref.localPath;
  const bySource = run.profile.raw?.find(r => r.localPath && fs.existsSync(r.localPath));
  return bySource?.localPath;
}

function extractHeadline(markdown: string): string {
  const line = markdown.split('\n').find(l => l.startsWith('#'));
  return line ? line.replace(/^#+\s*/, '').trim() : 'Unity Profiler 分析报告';
}

/** Unity 单源: 走与旧 session 相同的 unity-profiler-analysis CLI skill → performance-report.md */
export async function runUnityProfilerSkillAnalysis(
  runId: string,
  opts: RunAnalysisOptions = {},
): Promise<{ markdownPath: string; outputDir: string }> {
  const run = getRun(runId);
  if (!run) throw new Error(`Run 不存在: ${runId}`);

  const pdataPath = run.profile.raw?.find(r => r.source === 'unity_profiler' && r.localPath)?.localPath
    ?? findRawPath(run, 'pdata');
  if (!pdataPath || !fs.existsSync(pdataPath)) {
    throw new Error('Run 无 unity .pdata 路径, 无法执行 skill');
  }

  const config = getConfig();
  const outputDir = path.join(config.dataDir, 'results', runId);
  fs.mkdirSync(outputDir, { recursive: true });

  const targetFps = resolveUnityTargetFps(opts.targetFps, run.meta);
  let cliProvider = opts.cliProvider ?? defaultCliProvider(config.cliPaths);
  if (cliProvider !== 'mock' && !isCliAvailable(cliProvider, config.cliPaths?.[cliProvider])) {
    opts.onLog?.(`[warn] ${cliUnavailableHint(cliProvider)} 已回退 Mock 模式`);
    cliProvider = 'mock';
  }

  opts.onLog?.(`[skill] 重建 preprocess (targetFps=${targetFps})…`);
  await runUnityPreprocessScript(pdataPath, outputDir, targetFps, opts.onLog);

  opts.onLog?.(`[skill] Unity Profiler skill (${cliProvider}) → ${outputDir}`);

  const result = await executeCli({
    sessionId: runId,
    pdataPath,
    outputDir,
    cliProvider,
    params: { targetFps },
    onLog: opts.onLog,
  });

  if (result.logs?.length) {
    saveAnalysisLogs(runId, result.logs);
  }

  if (!result.success) {
    throw new Error(result.error || 'Unity skill 分析失败');
  }

  const reportPath = path.join(outputDir, 'performance-report.md');
  if (!fs.existsSync(reportPath)) {
    throw new Error('skill 未产出 performance-report.md');
  }

  const markdown = fs.readFileSync(reportPath, 'utf-8');
  const pre = readPreprocessJson(runId);
  const reportFrames = frameCountFromMarkdown(markdown);
  const preFrames = pre?.frameSummary && typeof (pre.frameSummary as { count?: number }).count === 'number'
    ? (pre.frameSummary as { count: number }).count
    : null;
  if (reportFrames != null && preFrames != null && reportFrames !== preFrames) {
    opts.onLog?.(`[warn] 报告帧数 ${reportFrames} ≠ preprocess ${preFrames}，Mock/旧报告可能不匹配当前 pdata`);
  }
  const headline = extractHeadline(markdown);
  const exportedPath = saveReportMarkdown('p-web-unity', `performance-report_${runId}`, markdown);

  saveAnalysisWithReport(
    {
      id: `analysis_${runId}_unity`,
      mode: 'single',
      runIds: [runId],
      status: 'completed',
      skill: 'unity-profiler-analysis',
    },
    { headline, markdown, insights: [] },
    { analysisId: `analysis_${runId}_unity`, skill: 'unity-profiler-analysis' },
  );

  opts.onLog?.(`[skill] 报告已入库并落盘: ${exportedPath}`);
  return { markdownPath: exportedPath, outputDir };
}

/** 入库后自动分析: unity 单源 → skill; 多源 → cross builder; 其它单源 → 占位说明 */
export async function runPostIngestAnalysis(
  runId: string,
  opts: RunAnalysisOptions = {},
): Promise<{ skill: string; markdownPath?: string }> {
  const run = getRun(runId);
  if (!run) throw new Error(`Run 不存在: ${runId}`);

  const { sources } = run;

  if (sources.length >= 2) {
    opts.onLog?.('[skill] 多源 Run → cross-source 报告…');
    const res = generateCrossSourceAnalysisForRun(runId);
    return { skill: 'cross-source-analysis', markdownPath: res.markdownPath };
  }

  if (sources.length === 1 && sources[0] === 'unity_profiler') {
    const res = await runUnityProfilerSkillAnalysis(runId, {
      ...opts,
      targetFps: resolveUnityTargetFps(opts.targetFps, run.meta),
    });
    return { skill: 'unity-profiler-analysis', markdownPath: res.markdownPath };
  }

  // simpleperf / perfetto 单源: 报告加厚留下一阶段
  const note = `# ${sources[0]} 单源 Run\n\n> 数据已入库。单源 AI 厚报告 (${sources[0]}) 将在下一阶段接入对应 skill。\n\n请在 Run 详情「分析概览」查看 metrics / callTree。`;
  saveAnalysisWithReport(
    {
      id: `analysis_${runId}_pending`,
      mode: 'single',
      runIds: [runId],
      status: 'completed',
      skill: `${sources[0]}-analysis-pending`,
    },
    { headline: `${sources[0]} 已入库 (skill 待接入)`, markdown: note, insights: [] },
    { analysisId: `analysis_${runId}_pending` },
  );
  opts.onLog?.(`[skill] ${sources[0]} 单源: 跳过 AI skill (下阶段)`);
  return { skill: `${sources[0]}-pending` };
}
