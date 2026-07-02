#!/usr/bin/env node
/**
 * E2E: unity diff full pipeline (same as Web backend, ai-thickened acceptance).
 * Usage: npx tsx server/scripts/e2e-unity-diff.ts [--http]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
const ROOT = path.resolve(WEB_ROOT, '..');

const BASE = path.join(ROOT, 'unity/unity-outside-baseline.pdata');
const CUR = path.join(ROOT, 'unity/unity-outside-stressmove.pdata');
const GOLD = path.join(ROOT, 'docs/report/performance-report_unity_diff_GOLDEN.md');

const checks: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
}

const skipAi = process.argv.includes('--skip-ai');

async function runServiceE2e() {
  process.chdir(WEB_ROOT);
  const { buildUnityCompareReport } = await import('../services/unity-compare-service.js');

  for (const fp of [BASE, CUR]) {
    check(`file exists: ${path.basename(fp)}`, fs.existsSync(fp), fp);
  }

  const t0 = Date.now();
  const onLog = (line: string) => {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[+${elapsed}s] ${line}`);
  };

  const result = await buildUnityCompareReport(
    {
      basePdataPath: BASE,
      curPdataPath: CUR,
      baseLabel: 'outside-baseline',
      curLabel: 'outside-stressmove',
      scene: 'outside 行军压测',
      targetFps: 60,
    },
    {
      skipAiEnrich: skipAi,
      onLog,
    },
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  check('pipeline completed', Boolean(result.markdown), `${elapsed}s diffId=${result.diffId}`);
  if (!skipAi) {
    check('deliverSource ai-authored', result.deliverSource === 'ai-authored', result.deliverSource);
    check('usedAi', result.usedAi === true, `usedAi=${result.usedAi}`);
  } else {
    check('deliverSource enriched (skip-ai)', result.deliverSource === 'enriched', result.deliverSource);
  }

  const md = result.markdown;
  const lines = md.split('\n').length;
  check('report has §0', md.includes('## §0'));
  check('report has §3 Top-N table', md.includes('### Top-N 主线程热点（帧预算'));
  check('report has Top-N driven call tree', md.includes('### Top-N 驱动调用树'));
  check('report has phase overview tree', md.includes('### 主线程 phase 总览'));
  check('report has §3 present-frame Top-N', md.includes('出现帧 self 均值'));
  check('report has §3.3 hotspot subsection', md.includes('### 3.3 '));
  check('report has 模块内部细分', md.includes('**模块内部细分**'));
  check('report has §5 GC trace header', md.includes('全 trace'));
  check('report has §8 ROI index', md.includes('## §8 可执行建议'));
  check('ENRICH_FILL == 0', !(md.match(/ENRICH_FILL/g) ?? []).length);
  if (!skipAi) {
    check('LLM_FILL == 0', !(md.match(/<!-- LLM_FILL/g) ?? []).length);
  } else {
    const llmCount = (md.match(/<!-- LLM_FILL/g) ?? []).length;
    check('LLM_FILL present (skip-ai skeleton)', llmCount > 0, `${llmCount} slots`);
  }

  const qualityPath = path.join(result.outputDir, 'unity-diff-quality.json');
  if (fs.existsSync(qualityPath)) {
    const q = JSON.parse(fs.readFileSync(qualityPath, 'utf-8')) as { deliverSource?: string };
    const expectedSource = skipAi ? 'enriched' : 'ai-authored';
    check('quality.json deliverSource', q.deliverSource === expectedSource, q.deliverSource);
  }

  if (fs.existsSync(GOLD)) {
    const goldLines = fs.readFileSync(GOLD, 'utf-8').split('\n').length;
    const ratio = lines / goldLines;
    check('length ratio vs gold >= 0.78', ratio >= 0.78, `${ratio.toFixed(2)}x (${lines}/${goldLines})`);
  }

  check('enriched on disk', fs.existsSync(result.enrichedPath), result.enrichedPath);
  check('exported report path exists', fs.existsSync(result.reportPath), result.reportPath);

  const sampleSrc = skipAi
    ? path.join(ROOT, 'output/p-web-unity-diff/performance-report_udiff_e2e_outside_enriched_v2.md')
    : path.join(ROOT, 'output/p-web-unity-diff/performance-report_udiff_e2e_outside_ai_thickened.md');
  fs.mkdirSync(path.dirname(sampleSrc), { recursive: true });
  fs.copyFileSync(result.reportPath, sampleSrc);
  check('sample source copied', fs.existsSync(sampleSrc), sampleSrc);

  return result;
}

async function runHttpE2e() {
  const baseUrl = process.env.E2E_BASE_URL || 'http://localhost:3000/cpu/api';
  const health = await fetch(`${baseUrl}/settings`).catch(() => null);
  if (!health?.ok) {
    check('HTTP server reachable', false, baseUrl);
    return;
  }
  check('HTTP server reachable', true, baseUrl);

  const startRes = await fetch(`${baseUrl}/runs/ingest/unity-compare/local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      basePath: BASE,
      curPath: CUR,
      baseLabel: 'outside-baseline',
      curLabel: 'outside-stressmove',
      targetFps: 60,
      skipAiEnrich: false,
    }),
  });
  if (!startRes.ok) {
    check('POST unity-compare/local', false, await startRes.text());
    return;
  }
  const { jobId } = await startRes.json() as { jobId: string };
  check('job created', Boolean(jobId), jobId);

  let reportMarkdown = '';
  let lastError = '';
  for (let i = 0; i < 240; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const poll = await fetch(`${baseUrl}/runs/ingest/jobs/${jobId}`);
    const data = await poll.json() as { job: { status: string; error?: string }; events: Array<{ type: string; reportMarkdown?: string }> };
    if (data.job.status === 'failed') {
      lastError = data.job.error || 'unknown';
      break;
    }
    const done = [...data.events].reverse().find(e => e.type === 'done');
    if (done?.reportMarkdown) {
      reportMarkdown = done.reportMarkdown;
      break;
    }
  }

  check('HTTP job done (ai-thickened)', Boolean(reportMarkdown), lastError || `${reportMarkdown.split('\n').length} lines`);
  if (reportMarkdown) {
    check('HTTP report §3 Top-N', reportMarkdown.includes('### Top-N 主线程热点'));
  }
}

const http = process.argv.includes('--http');
const httpOnly = process.argv.includes('--http-only');
if (!httpOnly) await runServiceE2e();
if (http || httpOnly) await runHttpE2e();

const failed = checks.filter(c => !c.ok);
console.log('\n---');
console.log(`E2E: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.error('FAILED:', failed.map(f => f.name).join(', '));
  process.exit(1);
}
