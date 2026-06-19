// 报告 Markdown / digest 落盘到项目 output/ 目录 (验收对照 CLI 样例)。

import fs from 'fs';
import path from 'path';
import { getConfig } from '../utils/config.js';

function outputRoot(): string {
  return path.join(getConfig().skillProjectPath, 'output');
}

function timestampSlug(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 48);
}

/** 写入 output/<subdir>/<name>_<ts>.md，返回绝对路径。 */
export function saveReportMarkdown(subdir: string, nameStem: string, markdown: string): string {
  const dir = path.join(outputRoot(), subdir);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${nameStem}_${timestampSlug()}.md`);
  fs.writeFileSync(filePath, markdown, 'utf-8');
  return filePath;
}

/** 交叉分析 digest JSON。 */
export function saveCrossDigestJson(runId: string, digest: unknown): string {
  const dir = path.join(outputRoot(), 'p-web-cross');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `cross-source-evidence_${sanitizeId(runId)}.json`);
  fs.writeFileSync(filePath, JSON.stringify(digest, null, 2), 'utf-8');
  return filePath;
}

export function saveCrossReportMarkdown(runId: string, markdown: string): string {
  return saveReportMarkdown('p-web-cross', `performance-report_${sanitizeId(runId)}`, markdown);
}

export function saveCompareReportMarkdown(baseRunId: string, currentRunId: string, markdown: string): string {
  const stem = `compare_${sanitizeId(baseRunId)}_vs_${sanitizeId(currentRunId)}`;
  return saveReportMarkdown('p3-compare', stem, markdown);
}
