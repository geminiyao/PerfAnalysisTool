#!/usr/bin/env node
/**
 * 将各流水线当前代表报告同步到 output/samples/<pipeline>/performance-report.<后缀>.md
 * 用法（项目根）: node scripts/sync-sample-reports.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SAMPLES = path.join(ROOT, 'output', 'samples');

/** @type {Record<string, { source: string; destSuffix: string; note?: string }>} */
const PIPELINES = {
  'unity-single': {
    source: 'output/p1-unity/performance-report_20260618150000.md',
    destSuffix: 'cli-sourcemap',
    note: 'CLI 样例，含 marker→源码映射',
  },
  'unity-diff': {
    source: 'output/p-web-unity-diff/performance-report_udiff_e2e_outside_ai_thickened.md',
    destSuffix: 'ai-thickened',
    note: 'Web 正式流程 ai-thickened（enrich + CodeBuddy + validateUnityDiffQuality PASS）',
  },
  'perfetto-single': {
    source: 'docs/report/_intermediate/e2e_sprint7_single/run1.md',
    destSuffix: 'e2e-l3-filled',
    note: 'Sprint 7 单次 e2e L3，LLM_FILL=0',
  },
  'perfetto-diff': {
    source: 'docs/report/_intermediate/e2e_sprint7/run1.md',
    destSuffix: 'e2e-l3-triad',
    note: 'Sprint 7 三态 e2e L3（base/cur/throttle）',
  },
  'simpleperf-single': {
    source: 'output/p-web-simpleperf/performance-report_sp_single_e2e_ai_thickened.md',
    destSuffix: 'ai-thickened',
    note: 'hybrid single: Provider + enrich + CLI + quality gate',
  },
  'simpleperf-diff': {
    source: 'output/p-web-simpleperf-diff/performance-report_spdiff_1782740117775_0c520744_20260629214732.md',
    destSuffix: 'web-v4-diff',
    note: 'Web 落盘 v4 hybrid diff',
  },
  'cross-single': {
    source: 'output/p-web-cross/performance-report_run_cross_1782825036064_a77732_20260630211037.md',
    destSuffix: 'fallback-builder',
    note: 'fallback builder 产出（AI 路径待验收）',
  },
};

function destFileName(destSuffix) {
  return `performance-report.${destSuffix}.md`;
}

function pruneStaleReports(destDir, keepFile) {
  if (!fs.existsSync(destDir)) return;
  for (const name of fs.readdirSync(destDir)) {
    if (name.startsWith('performance-report') && name.endsWith('.md') && name !== keepFile) {
      fs.unlinkSync(path.join(destDir, name));
    }
  }
}

function syncOne(pipeline, { source, destSuffix, note }) {
  const srcAbs = path.join(ROOT, source.replace(/\//g, path.sep));
  const destDir = path.join(SAMPLES, pipeline);
  const destName = destFileName(destSuffix);
  const destMd = path.join(destDir, destName);
  const destMeta = path.join(destDir, 'meta.json');

  if (!fs.existsSync(srcAbs)) {
    console.error(`[skip] ${pipeline}: 源不存在 ${source}`);
    return false;
  }
  fs.mkdirSync(destDir, { recursive: true });
  pruneStaleReports(destDir, destName);
  fs.copyFileSync(srcAbs, destMd);
  const meta = {
    pipeline,
    destFile: destName,
    destSuffix,
    sourcePath: source,
    syncedAt: new Date().toISOString(),
    note: note ?? '',
    sourceMtime: fs.statSync(srcAbs).mtime.toISOString(),
  };
  fs.writeFileSync(destMeta, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
  console.log(`[ok] ${pipeline} → ${destName} ← ${source}`);
  return true;
}

let ok = 0;
for (const [pipeline, cfg] of Object.entries(PIPELINES)) {
  if (syncOne(pipeline, cfg)) ok++;
}
console.log(`\n同步完成: ${ok}/${Object.keys(PIPELINES).length}（cross-diff 待 Phase C）`);
