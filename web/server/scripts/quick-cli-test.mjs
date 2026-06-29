#!/usr/bin/env node
/**
 * 快速验证 web 流程的 LLM 阶段：用现有 workDir 直接跑 runCliDiffEnrich，
 * 不重解析 perf.data。专门 isolate Web 那条 codebuddy CLI 调用链路。
 */
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
process.chdir(WEB_ROOT);

const workDir = process.argv[2] || 'data/results/spdiff_1782738076508_214bae02';
const fullWorkDir = path.resolve(workDir);
console.log(`[quick-cli-test] workDir = ${fullWorkDir}`);

const aiReport = path.join(fullWorkDir, 'report', 'performance-report_simpleperf_AI_v4.md');
console.log(`[quick-cli-test] before: LLM_FILL count = ${(fs.readFileSync(aiReport, 'utf8').match(/LLM_FILL/g) || []).length}`);

// 模仿 simpleperf-diff-service.ts 的 runCliDiffEnrich 调用方式（stdio pipe + stdin prompt）
const { spawn } = await import('child_process');

const skillRoot = path.resolve(WEB_ROOT, '..');
const promptFile = path.join(fullWorkDir, 'diff-cli-prompt.txt');
const prompt = fs.readFileSync(promptFile, 'utf8');
console.log(`[quick-cli-test] prompt length = ${prompt.length} chars`);
console.log(`[quick-cli-test] cwd = ${skillRoot}`);

const codebuddy = 'C:/Users/garyychen/AppData/Roaming/npm/codebuddy.cmd';
const args = ['-p', '--output-format', 'stream-json', '--include-partial-messages',
              '-y', '--dangerously-skip-permissions',
              '--allowedTools', 'Bash,Read,Write,Glob,Grep,Edit'];

const t0 = Date.now();
const child = spawn(codebuddy, args, { cwd: skillRoot, shell: true, stdio: 'pipe' });
child.stdin.write(prompt);
child.stdin.end();

let editCount = 0;
child.stdout.on('data', (d) => {
  const text = d.toString();
  const editMatches = text.match(/"name":"Edit"/g);
  if (editMatches) editCount += editMatches.length;
  if (text.includes('ENRICH_DONE')) {
    console.log(`[quick-cli-test] saw ENRICH_DONE`);
  }
});
child.stderr.on('data', (d) => process.stderr.write(`[stderr] ${d}`));

await new Promise((resolve) => child.on('close', (code) => {
  const dt = (Date.now() - t0) / 1000;
  console.log(`[quick-cli-test] exit=${code} in ${dt.toFixed(1)}s editCalls=${editCount}`);
  resolve();
}));

const after = (fs.readFileSync(aiReport, 'utf8').match(/LLM_FILL/g) || []).length;
const lines = fs.readFileSync(aiReport, 'utf8').split('\n').length;
console.log(`[quick-cli-test] after:  LLM_FILL count = ${after}, lines = ${lines}`);
console.log(after === 0 ? '[quick-cli-test] ✓ 全部填空完成' : `[quick-cli-test] ✗ 还剩 ${after} 个占位符`);
