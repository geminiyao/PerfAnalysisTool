#!/usr/bin/env node
/**
 * E2E: simpleperf single hybrid (Provider → enrich → CLI → quality gate)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
const ROOT = path.resolve(WEB_ROOT, '..');

const PERF = 'D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_stressmove.data';
const BCACHE = 'D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/binary_cache';

const checks: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`);
}

async function main() {
  process.chdir(WEB_ROOT);
  const { buildSimpleperfSingleReport } = await import('../services/simpleperf-single-service.js');
  check('perf.data exists', fs.existsSync(PERF), PERF);

  const t0 = Date.now();
  const skipAi = process.argv.includes('--skip-ai');
  const result = await buildSimpleperfSingleReport(
    {
      perfPath: PERF,
      binaryCachePath: BCACHE,
      label: 'stressmove e2e',
      scene: 'outside-stressmove',
      device: 'PAL-AL00',
    },
    { skipAiEnrich: skipAi, onLog: line => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${line}`) },
  );

  check('pipeline done', Boolean(result.markdown), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (skipAi) {
    check('deliverSource enriched/provider', ['enriched', 'provider'].includes(result.deliverSource), result.deliverSource);
  } else {
    check('deliverSource ai-authored', result.deliverSource === 'ai-authored', result.deliverSource);
    check('LLM_FILL == 0', !(result.markdown.match(/LLM_FILL/g) ?? []).length);
  }
  check('§0 present', result.markdown.includes('## §0'));
  check('§2 libil2cpp', result.markdown.includes('libil2cpp'));
  check('exported', fs.existsSync(result.reportPath), result.reportPath);

  const sampleSrc = path.join(ROOT, 'output/p-web-simpleperf/performance-report_sp_single_e2e_ai_thickened.md');
  fs.mkdirSync(path.dirname(sampleSrc), { recursive: true });
  fs.copyFileSync(result.reportPath, sampleSrc);
  check('sample copied', fs.existsSync(sampleSrc));

  const failed = checks.filter(c => !c.ok);
  console.log(`\nE2E: ${checks.length - failed.length}/${checks.length}`);
  if (failed.length) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
