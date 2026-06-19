// 跨源分析生成服务 — 供 CLI 与 Web API 共用。

import fs from 'fs';
import path from 'path';
import { buildCrossSourceDigest } from './cross-source-digest.js';
import { generateCrossSourceInsights } from './cross-source-insights.js';
import { buildCrossSourceMarkdown } from './cross-source-report-builder.js';
import { saveCrossDigestJson, saveCrossReportMarkdown } from './report-export.js';
import { saveAnalysisWithReport, getAnalysisReportByRunId } from './analysis-store.js';
import { getRun } from './run-store.js';

export interface GenerateCrossSourceOptions {
  analysisId?: string;
  markdownPath?: string;
  digestOut?: string;
}

/** 为多源 Run 生成/更新 cross-source 分析并入库。 */
export function generateCrossSourceAnalysisForRun(
  runId: string,
  opts: GenerateCrossSourceOptions = {},
) {
  const run = getRun(runId);
  if (!run) throw new Error(`Run 不存在: ${runId}`);
  if (run.sources.length < 2) {
    throw new Error('交叉分析需要至少 2 个数据源; 单源 Run 请查看各源分区');
  }

  const analysisId = opts.analysisId ?? `analysis_${runId}_cross`;
  const digest = buildCrossSourceDigest(runId);

  const digestPath = opts.digestOut
    ? (() => {
        const out = path.resolve(opts.digestOut);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(digest, null, 2), 'utf-8');
        return out;
      })()
    : saveCrossDigestJson(runId, digest);

  const { insights, headline } = generateCrossSourceInsights(digest);

  let markdown = '';
  if (opts.markdownPath && fs.existsSync(path.resolve(opts.markdownPath))) {
    markdown = fs.readFileSync(path.resolve(opts.markdownPath), 'utf-8');
  } else {
    markdown = buildCrossSourceMarkdown(digest, insights, headline);
  }

  const markdownPath = saveCrossReportMarkdown(runId, markdown);

  const saved = saveAnalysisWithReport(
    {
      id: analysisId,
      mode: 'single',
      runIds: [runId],
      status: 'completed',
      skill: 'cross-source-analysis',
    },
    { headline, markdown, insights },
    { analysisId, skill: 'cross-source-analysis' },
  );

  return { ...saved, markdownPath, digestPath };
}

export function getCrossSourceAnalysisForRun(runId: string) {
  return getAnalysisReportByRunId(runId);
}
