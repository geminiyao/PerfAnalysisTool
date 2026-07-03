#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
const ROOT = path.resolve(WEB_ROOT, '..');
const PDATA = path.join(ROOT, 'unity/unity-outside-stressmove.pdata');
const SAMPLE_OUT = path.join(ROOT, 'output/p-web-unity/performance-report_usingle_e2e_stressmove_ai_thickened.md');

process.chdir(WEB_ROOT);
const skipAi = process.argv.includes('--skip-ai');
const { buildUnitySingleReport } = await import('../services/unity-single-service.js');

if (!fs.existsSync(PDATA)) throw new Error(`pdata 不存在: ${PDATA}`);

const t0 = Date.now();
const onLog = (line: string) => console.log(`[+${((Date.now() - t0) / 1000).toFixed(1)}s] ${line}`);

const result = await buildUnitySingleReport(
  {
    pdataPath: PDATA,
    label: 'outside-stressmove',
    scene: 'outside 行军压测',
    targetFps: 60,
  },
  { skipAiEnrich: skipAi, onLog },
);

fs.mkdirSync(path.dirname(SAMPLE_OUT), { recursive: true });
fs.copyFileSync(result.reportPath, SAMPLE_OUT);

console.log('\n---');
console.log(`deliverSource: ${result.deliverSource}`);
console.log(`usedAi: ${result.usedAi}`);
console.log(`lines: ${result.markdown.split('\n').length}`);
console.log(`report: ${result.reportPath}`);
console.log(`sample: ${SAMPLE_OUT}`);
