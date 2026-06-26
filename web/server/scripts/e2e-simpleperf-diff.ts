#!/usr/bin/env node
/**
 * E2E: simpleperf diff full pipeline (same as Web backend).
 * Usage: npx tsx server/scripts/e2e-simpleperf-diff.ts [--http]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');

const BASE = 'D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_base.data';
const CUR = 'D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_stressmove.data';
const BCACHE = 'D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/binary_cache';
const GOLD = path.join(WEB_ROOT, '..', 'docs/report/performance-report_simpleperf_ULTIMATE_v4.md');

const checks: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
}

async function runServiceE2e() {
  process.chdir(WEB_ROOT);
  const { buildSimpleperfDiffReport } = await import('../services/simpleperf-diff-service.js');
  const { runProjectPython } = await import('../services/run-ingest-service.js');

  for (const fp of [BASE, CUR, BCACHE]) {
    check(`file exists: ${path.basename(fp)}`, fs.existsSync(fp), fp);
  }

  const t0 = Date.now();
  const result = await buildSimpleperfDiffReport(
    {
      basePerfPath: BASE,
      curPerfPath: CUR,
      binaryCachePath: BCACHE,
      sceneBase: '野外空场景',
      sceneCur: 'stressmove 行军线压测（约 300 队）',
    },
    {
      meta: {
        label: 'e2e_web_pipeline',
        device: 'MateXs2 (PAL-AL00, aarch64)',
        targetFps: 45,
      },
      skipAiEnrich: true,
      onLog: line => console.log(`  ${line}`),
    },
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  check('pipeline completed', Boolean(result.markdown), `${elapsed}s diffId=${result.diffId}`);
  check('usedAi (enriched)', result.usedAi === true, `usedAi=${result.usedAi}`);

  const lines = result.markdown.split('\n').length;
  check('report has §0', result.markdown.includes('## §0 结论先行'));
  check('report has §11', result.markdown.includes('## §11 本源能力边界'));
  check('report has +30.7%', result.markdown.includes('30.7'));
  check('report has §10.1 memcpy', result.markdown.includes('### 10.1'));
  check('report lines >= 600', lines >= 600, `${lines} lines`);

  const enrichedOnDisk = path.join(result.outputDir, 'report', 'performance-report_simpleperf_AI_v4.md');
  check('enriched file on disk', fs.existsSync(enrichedOnDisk));

  try {
    await runProjectPython(
      'scripts/compare_v4_report_quality.py',
      [enrichedOnDisk, '--min-length-ratio=0.92'],
      undefined,
      60_000,
    );
    check('compare quality >=0.92x gold', true);
  } catch (e: any) {
    check('compare quality >=0.92x gold', false, e.message?.slice(0, 200));
  }

  if (fs.existsSync(GOLD)) {
    const goldLines = fs.readFileSync(GOLD, 'utf-8').split('\n').length;
    const ratio = lines / goldLines;
    check('length ratio vs gold', ratio >= 0.9, `${ratio.toFixed(2)}x (${lines}/${goldLines})`);
  }

  check('exported report path exists', fs.existsSync(result.reportPath), result.reportPath);

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

  const startRes = await fetch(`${baseUrl}/runs/ingest/simpleperf-diff/local`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      basePath: BASE,
      curPath: CUR,
      binaryCachePath: BCACHE,
      sceneBase: '野外空场景',
      sceneCur: 'stressmove 行军线压测（约 300 队）',
      device: 'MateXs2 (PAL-AL00, aarch64)',
      targetFps: 45,
      label: 'e2e_http',
      skipAiEnrich: true,
    }),
  });
  if (!startRes.ok) {
    check('POST simpleperf-diff/local', false, await startRes.text());
    return;
  }
  const { jobId } = await startRes.json() as { jobId: string };
  check('job created', Boolean(jobId), jobId);

  let reportMarkdown = '';
  let lastError = '';
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const poll = await fetch(`${baseUrl}/runs/ingest/jobs/${jobId}`);
    const data = await poll.json() as { job: { status: string; error?: string }; events: Array<{ type: string; reportMarkdown?: string; error?: string }> };
    if (data.job.status === 'failed') {
      lastError = data.job.error || 'unknown';
      break;
    }
    const done = [...data.events].reverse().find(e => e.type === 'done');
    if (done?.reportMarkdown) {
      reportMarkdown = done.reportMarkdown;
      break;
    }
    if (data.job.status === 'done' && !reportMarkdown) {
      lastError = 'job done but reportMarkdown missing in events';
      break;
    }
  }

  check('HTTP job done', Boolean(reportMarkdown), lastError || `${reportMarkdown.split('\n').length} lines`);
  if (reportMarkdown) {
    check('HTTP report §0', reportMarkdown.includes('## §0 结论先行'));
    check('HTTP report enriched §10', reportMarkdown.includes('### 10.1'));
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
