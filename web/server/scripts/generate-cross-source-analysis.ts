// generate-cross-source-analysis.ts — P4 收尾: correlate → insights[] → analyses/analysis_reports 入库。
//
// 流程:
//   1) buildCrossSourceDigest(runId)  — 确定性关联
//   2) generateCrossSourceInsights()  — 结构化 insights (去用例化, evidence {source,detail}[])
//   3) saveAnalysisWithReport()       — 写入 analyses + analysis_reports
//
// 用法:
//   tsx server/scripts/generate-cross-source-analysis.ts --run-id <id> \
//        [--digest-out <evidence.json>] [--markdown <report.md>] [--analysis-id <id>]
//
// 依据: docs/refactor-progress.md P4/XS1, docs/report-spec-and-data-contract.md §0/§6。

import fs from 'fs';
import path from 'path';
import { buildCrossSourceDigest } from '../services/cross-source-digest.js';
import { generateCrossSourceInsights } from '../services/cross-source-insights.js';
import { buildCrossSourceMarkdown } from '../services/cross-source-report-builder.js';
import { saveAnalysisWithReport, getAnalysisReport } from '../services/analysis-store.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

/** 找 output 下最新的 cross 综合报告 markdown (若无 --markdown)。 */
function findLatestCrossReport(): string | undefined {
  const dir = path.resolve('../output/p1-cross');
  if (!fs.existsSync(dir)) return undefined;
  const files = fs.readdirSync(dir)
    .filter(f => f.startsWith('performance-report_') && f.endsWith('.md'))
    .sort()
    .reverse();
  return files[0] ? path.join(dir, files[0]) : undefined;
}

function main(): void {
  const runId = arg('run-id');
  if (!runId) {
    console.error('Usage: tsx generate-cross-source-analysis.ts --run-id <id> [--digest-out <json>] [--markdown <md>] [--analysis-id <id>]');
    process.exit(1);
  }

  const analysisId = arg('analysis-id') ?? `analysis_${runId}_cross`;

  // 1) correlate
  let digest;
  try {
    digest = buildCrossSourceDigest(runId);
  } catch (e: any) {
    console.error(`[generate] correlate failed: ${e.message}`);
    process.exit(1);
  }

  const digestOut = arg('digest-out') ?? path.resolve('../output/p1-cross/cross-source-evidence.json');
  fs.mkdirSync(path.dirname(path.resolve(digestOut)), { recursive: true });
  fs.writeFileSync(path.resolve(digestOut), JSON.stringify(digest, null, 2), 'utf-8');
  console.error(`[generate] digest → ${path.resolve(digestOut)}`);

  // 2) insights
  const { insights, headline } = generateCrossSourceInsights(digest);
  console.error(`[generate] insights: ${insights.length} 条, headline: ${headline}`);

  // 3) markdown (可选, 来自已有 skill 报告)
  const mdPath = arg('markdown') ?? findLatestCrossReport();
  const markdown = mdPath && fs.existsSync(path.resolve(mdPath))
    ? fs.readFileSync(path.resolve(mdPath), 'utf-8')
    : buildCrossSourceMarkdown(digest, insights, headline);

  // 4) 入库
  const { analysis, report } = saveAnalysisWithReport(
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

  console.error(`[generate] saved analysis=${analysis.id} report=${report.id}`);
  console.error(`[generate] analysis_reports: headline=${!!report.headline} markdown=${report.markdown.length} chars insights=${report.insights.length}`);

  // 验收摘要
  const verify = getAnalysisReport(analysisId);
  if (!verify) {
    console.error('[generate] VERIFY FAIL: analysis_reports 无记录');
    process.exit(1);
  }

  const sample = verify.report.insights.slice(0, 2).map(i => ({
    id: i.id,
    severity: i.severity,
    sources: i.sources,
    evidence: i.evidence?.length,
    conclusion: i.conclusion.slice(0, 80),
  }));
  console.log(JSON.stringify({ analysisId, runId, headline: verify.report.headline, insightCount: verify.report.insights.length, sample }, null, 2));
}

main();
