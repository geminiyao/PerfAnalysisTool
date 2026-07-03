#!/usr/bin/env node
/**
 * E2E: unity single full pipeline (same as Web backend).
 * Usage: npx tsx server/scripts/e2e-unity-single.ts [--skip-ai]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
const ROOT = path.resolve(WEB_ROOT, '..');

const PDATA = path.join(ROOT, 'unity/unity-outside-baseline.pdata');
const GOLD = path.join(ROOT, 'output/samples/unity-single/performance-report.cli-sourcemap.md');

const checks: { name: string; ok: boolean; detail?: string }[] = [];

function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
}

const skipAi = process.argv.includes('--skip-ai');

async function runServiceE2e() {
  process.chdir(WEB_ROOT);
  const { buildUnitySingleReport } = await import('../services/unity-single-service.js');

  check(`file exists: ${path.basename(PDATA)}`, fs.existsSync(PDATA), PDATA);

  const t0 = Date.now();
  const onLog = (line: string) => {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[+${elapsed}s] ${line}`);
  };

  const result = await buildUnitySingleReport(
    {
      pdataPath: PDATA,
      label: 'outside-baseline',
      scene: 'outside 行军基线',
      targetFps: 60,
    },
    {
      skipAiEnrich: skipAi,
      onLog,
    },
  );
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  check('pipeline completed', Boolean(result.markdown), `${elapsed}s runId=${result.runId}`);
  if (!skipAi) {
    check('deliverSource ai-authored', result.deliverSource === 'ai-authored', result.deliverSource);
    check('usedAi', result.usedAi === true, `usedAi=${result.usedAi}`);
  } else {
    check('deliverSource skeleton (skip-ai)', result.deliverSource === 'skeleton', result.deliverSource);
  }

  const md = result.markdown;
  const lines = md.split('\n').length;
  check('report has §0', md.includes('## §0'));
  check('report has §3 Top-N table', md.includes('### 3.2 Top-N'));
  check('report has interleaved hotspot §3.4', /### 3\.4 .+\*\*入口\*\*/s.test(md) || md.includes('### 3.4 '));
  check('report has pruned phase tree', md.includes('### 3.1 主线程 phase 总览'));
  check('report has §3.3 hotspot intro', md.includes('### 3.3 Top 热点细化分析'));
  if (skipAi) {
    check('report has §4 thread LLM_FILL slot', md.includes('LLM_FILL:§4:'));
  } else {
    check('report has §4 各线程负载', md.includes('## §4 各线程负载'));
  }
  check('report has §5 GC', md.includes('## §5'));
  check('report has §9 ROI index', md.includes('## §9 可执行建议'));
  check('skeleton on disk', fs.existsSync(result.skeletonPath), result.skeletonPath);
  check('summary on disk', fs.existsSync(result.summaryPath), result.summaryPath);

  if (!skipAi) {
    check('LLM_FILL == 0', !(md.match(/<!-- LLM_FILL/g) ?? []).length);
  } else {
    const llmCount = (md.match(/<!-- LLM_FILL/g) ?? []).length;
    check('LLM_FILL present (skip-ai skeleton)', llmCount > 0, `${llmCount} slots`);
  }

  const qualityPath = path.join(result.outputDir, 'unity-single-quality.json');
  if (fs.existsSync(qualityPath)) {
    const q = JSON.parse(fs.readFileSync(qualityPath, 'utf-8')) as { ok?: boolean };
    check('quality.json ok', q.ok === true, String(q.ok));
  }

  if (fs.existsSync(GOLD)) {
    const goldLines = fs.readFileSync(GOLD, 'utf-8').split('\n').length;
    const ratio = lines / goldLines;
    check('length ratio vs gold >= 0.55', ratio >= 0.55, `${ratio.toFixed(2)}x (${lines}/${goldLines})`);
  }

  check('exported report path exists', fs.existsSync(result.reportPath), result.reportPath);

  const sampleSrc = skipAi
    ? path.join(ROOT, 'output/p-web-unity/performance-report_usingle_e2e_outside_skeleton.md')
    : path.join(ROOT, 'output/p-web-unity/performance-report_usingle_e2e_outside_ai_thickened.md');
  fs.mkdirSync(path.dirname(sampleSrc), { recursive: true });
  fs.copyFileSync(result.reportPath, sampleSrc);
  check('sample source copied', fs.existsSync(sampleSrc), sampleSrc);

  return result;
}

await runServiceE2e();

const failed = checks.filter(c => !c.ok);
console.log('\n---');
console.log(`E2E: ${checks.length - failed.length}/${checks.length} passed`);
if (failed.length) {
  console.error('FAILED:', failed.map(f => f.name).join(', '));
  process.exit(1);
}
