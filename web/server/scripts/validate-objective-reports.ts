/**
 * 离线生成 objective 报告到 output/（Step 1 验收）
 *
 * 用法 (web/):
 *   npx tsx server/scripts/validate-objective-reports.ts
 */
import fs from 'fs';
import path from 'path';
import { buildBuiltinSingleSourceMarkdown } from '../services/single-source-report-builder.js';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const REFRESH = path.join(ROOT, 'output', 'p1-refresh');

function tsSlug(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function writeReport(subdir: string, summaryPath: string, kind: 'perfetto' | 'simpleperf'): string {
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  const { headline, markdown } = buildBuiltinSingleSourceMarkdown(kind, summary);
  const outDir = path.join(ROOT, 'output', subdir);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `performance-report_objective_${tsSlug()}.md`);
  fs.writeFileSync(outPath, markdown, 'utf-8');
  console.error(`[validate] ${kind} → ${outPath}`);
  console.error(`[validate] headline: ${headline}`);
  const hasActions = markdown.includes('## 必做动作');
  const hasConclusion = markdown.includes('> **结论**');
  console.error(`[validate] checks: conclusion=${hasConclusion} actions=${hasActions} lines=${markdown.split('\n').length}`);
  return outPath;
}

function main(): void {
  const out: Record<string, string> = {};
  const perfettoSummary = path.join(REFRESH, 'perfetto', 'perfetto-profile-summary.json');
  const simpleSummary = path.join(REFRESH, 'simpleperf', 'simpleperf-profile-summary.json');
  if (fs.existsSync(perfettoSummary)) {
    out.perfetto = writeReport('p1-perfetto', perfettoSummary, 'perfetto');
  }
  if (fs.existsSync(simpleSummary)) {
    out.simpleperf = writeReport('p1-simpleperf', simpleSummary, 'simpleperf');
  }
  console.log(JSON.stringify(out, null, 2));
}

main();
