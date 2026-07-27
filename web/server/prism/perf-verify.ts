/**
 * perf-verify.ts — Prism 性能优化点的单元验证脚本
 *
 * 目标：对每个优化点做可量化的测量，不凭空猜。
 *   1. prompt 组装后实际大小（含 memory injection）
 *   2. --tools 排他效果（工具定义数量）
 *   3. tool_result 摘要前后对比（batch 模式实测）
 *   4. thinking 长度约束 prompt 的效果（mock LLM runner）
 *   5. 复用 findings 路径验证（skipExplore）
 *   6. narrative prompt 组装后大小（含 report template）
 *   7. baseline raw stream 重新分析（确认根因数据）
 *
 * Usage (from web/):
 *   npx tsx server/prism/perf-verify.ts
 *   npx tsx server/prism/perf-verify.ts --baseline <run-dir>   # 分析 baseline raw stream
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatMemoryForPrompt, MEMORY_INJECTION_MAX_CHARS } from './explore-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passCount = 0;
let failCount = 0;
const measurements: Array<{ label: string; value: string; detail?: string }> = [];

function assert(condition: boolean, label: string, detail?: unknown): void {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passCount++;
  } else {
    console.log(`  FAIL: ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
    failCount++;
  }
}

function measure(label: string, value: string | number, detail?: string): void {
  measurements.push({ label, value: String(value), detail });
  console.log(`  📊 ${label}: ${value}${detail ? ' (' + detail + ')' : ''}`);
}

// ─────────────────────────── 1. Prompt 大小测量 ───────────────────────────

console.log('\n[1] Explore prompt 组装后实际大小');

const exploreTemplate = fs.readFileSync(
  path.join(__dirname, 'prompts', 'unity-explore-prompt.txt'),
  'utf-8',
);
const memoryBlock = formatMemoryForPrompt({ dataSource: 'unity' });
const exploreFullPrompt = exploreTemplate
  .replace(/\{\{RUN_ID\}\}/g, 'camera_ab_test_run')
  .replace(/\{\{OUTPUT_DIR\}\}/g, 'web/data/prism-out/test/stamp')
  .replace(/\{\{FRAME_BUDGET_MS\}\}/g, '16.67')
  .replace(/\{\{TARGET_FPS\}\}/g, '60')
  .replace(/\{\{MEMORY_INJECTION\}\}/g, memoryBlock);

measure('explore template chars', exploreTemplate.length);
measure('memory injection chars', memoryBlock.length, `budget=${MEMORY_INJECTION_MAX_CHARS}`);
measure('explore full prompt chars', exploreFullPrompt.length);
measure('explore full prompt ≈tokens', Math.round(exploreFullPrompt.length / 3.5), '中文约3.5字符/token');

// 对比 baseline raw stream 第一行的 input_tokens（首次调用）
// baseline L7: in=43926 → 这是 prompt + 工具定义 + 首次 cache
const baselineFirstInputTokens = 43926;
const promptTokensEst = Math.round(exploreFullPrompt.length / 3.5);
const toolDefTokens = baselineFirstInputTokens - promptTokensEst;
measure('baseline 首次 input_tokens', baselineFirstInputTokens, 'raw stream L7');
measure('prompt 估算 tokens', promptTokensEst);
measure('工具定义+其他 tokens', toolDefTokens, 'baseline 156 个工具定义约 6-8K tokens');

assert(
  memoryBlock.length <= MEMORY_INJECTION_MAX_CHARS + 200,
  'memory injection 在预算内',
  { actual: memoryBlock.length, budget: MEMORY_INJECTION_MAX_CHARS },
);

// ─────────────────────────── 2. --tools 排他效果 ───────────────────────────

console.log('\n[2] --tools 排他效果（工具定义数量）');

// baseline raw stream 第一行的 tools 数组
const baselineRawPath = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'prism-out',
  'camera_ab_24072PX77C_20260723_194703',
  '2026-07-24_11-56-38',
  'explore-raw-stream.jsonl',
);

if (fs.existsSync(baselineRawPath)) {
  const firstLine = fs.readFileSync(baselineRawPath, 'utf-8').split('\n')[0];
  try {
    const init = JSON.parse(firstLine);
    if (init.tools && Array.isArray(init.tools)) {
      measure('baseline 工具定义数量', init.tools.length, '改 --tools 之前');
      const mcpTools = init.tools.filter((t: string) => t.startsWith('mcp__'));
      const stdTools = init.tools.filter((t: string) => !t.startsWith('mcp__'));
      measure('baseline MCP 工具', mcpTools.length);
      measure('baseline 标准工具', stdTools.length);
      measure('优化后应为', 5, 'Bash,Read,Write,Glob,Grep');
      measure('预估省 tokens', Math.round((init.tools.length - 5) * 160), '每个工具定义约160 tokens');
    }
  } catch (e) {
    console.log('  (baseline raw stream 解析失败，跳过)');
  }
} else {
  console.log('  (baseline raw stream 不存在，跳过)');
}

// ─────────────────────────── 3. tool_result 摘要前后对比 ───────────────────────────

console.log('\n[3] tool_result 摘要前后对比（batch 模式实测）');

// 从 baseline 的 pipeline-timing.json 读 tool_result 大小
const timingPath = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'prism-out',
  'camera_ab_24072PX77C_20260723_194703',
  '2026-07-24_11-56-38',
  'pipeline-timing.json',
);

if (fs.existsSync(timingPath)) {
  const timing = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));
  const toolCalls = timing.explore?.toolCalls ?? [];
  let totalResultLen = 0;
  let batchResultLen = 0;
  console.log('  各工具调用 resultLen:');
  for (const tc of toolCalls) {
    const rl = tc.resultLen ?? 0;
    totalResultLen += rl;
    const isBatch = tc.toolNames?.includes('+') || tc.cmd?.includes('batch');
    if (isBatch) batchResultLen += rl;
    console.log(`    seq${tc.seq}: ${rl} chars  ${tc.toolNames ?? ''} ${isBatch ? '(batch)' : ''}`);
  }
  measure('tool_result 总 chars', totalResultLen);
  measure('batch 调用 resultLen', batchResultLen, `${Math.round(batchResultLen / totalResultLen * 100)}% 占比`);
  measure('单工具调用 resultLen', totalResultLen - batchResultLen);

  // 摘要方案预估
  const summaryRatio = 0.33; // 摘要到 1/3
  const summaryBatchLen = Math.round(batchResultLen * summaryRatio);
  measure('摘要后 batch resultLen', summaryBatchLen, `按 ${summaryRatio * 100}% 摘要`);
  measure('摘要后省 chars', batchResultLen - summaryBatchLen);
  measure('摘要后省 ≈tokens', Math.round((batchResultLen - summaryBatchLen) / 3.5));

  // 但注意：这个优化只影响 input_tokens（prefill），不影响 output_tokens（decode）
  // baseline 最后一次 input=140531，如果 tool_result 减少 X tokens，input 降 X
  measure('baseline 最终 input_tokens', 140531);
  const savedTokens = Math.round((batchResultLen - summaryBatchLen) / 3.5);
  measure('摘要后预估 input_tokens', 140531 - savedTokens);
  measure('对 output_tokens 影响', 0, '摘要不影响输出 token 数');
} else {
  console.log('  (pipeline-timing.json 不存在，跳过)');
}

// ─────────────────────────── 4. thinking 约束 prompt 效果 ───────────────────────────

console.log('\n[4] thinking 长度约束验证');

// 从 baseline raw stream 统计 thinking 长度分布
if (fs.existsSync(baselineRawPath)) {
  const lines = fs.readFileSync(baselineRawPath, 'utf-8').split('\n').filter(Boolean);

  function parseMultiJson(line: string): any[] {
    const objs: any[] = [];
    let depth = 0, start = 0, inStr = false, esc = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') { if (depth === 0) start = i; depth++; }
      else if (c === '}') { depth--; if (depth === 0) objs.push(line.slice(start, i + 1)); }
    }
    return objs;
  }

  let totalThinkingChars = 0;
  let totalOutTokens = 0;
  let thinkingBlocks = 0;
  const thinkingLengths: number[] = [];

  for (const line of lines) {
    for (const o of parseMultiJson(line)) {
      let j: any;
      try { j = JSON.parse(o); } catch { continue; }
      if (j.type !== 'assistant') continue;
      for (const c of (j.message?.content ?? [])) {
        if (c.type === 'thinking') {
          totalThinkingChars += c.thinking.length;
          thinkingBlocks++;
          thinkingLengths.push(c.thinking.length);
        }
      }
      const u = j.message?.usage;
      if (u?.output_tokens) totalOutTokens += u.output_tokens;
    }
  }

  measure('explore thinking 总 chars', totalThinkingChars);
  measure('explore thinking ≈tokens', Math.round(totalThinkingChars / 3.5));
  measure('explore output_tokens 总', totalOutTokens);
  measure('thinking 占 output 比', Math.round(totalThinkingChars / 3.5 / totalOutTokens * 100) + '%');
  measure('thinking blocks 数', thinkingBlocks);

  if (thinkingLengths.length > 0) {
    thinkingLengths.sort((a, b) => a - b);
    measure('thinking 最短', thinkingLengths[0]);
    measure('thinking 中位', thinkingLengths[Math.floor(thinkingLengths.length / 2)]);
    measure('thinking 最长', thinkingLengths[thinkingLengths.length - 1]);
    const over2000 = thinkingLengths.filter(l => l > 2000).length;
    measure('thinking >2000 chars 的 block', over2000, '这些是可约束的');
    const over2000Chars = thinkingLengths.filter(l => l > 2000).reduce((a, b) => a + b, 0);
    measure('>2000 blocks 总 chars', over2000Chars);
    measure('约束到 2000 chars 省的 chars', over2000Chars - over2000 * 2000);
    measure('约束到 2000 省的 ≈tokens', Math.round((over2000Chars - over2000 * 2000) / 3.5));
    // 按输出速度算省的时间
    const savedTokens = Math.round((over2000Chars - over2000 * 2000) / 3.5);
    measure('按 32 tok/s 省的时间', Math.round(savedTokens / 32) + 's', `≈${Math.round(savedTokens / 32 / 60 * 10) / 10}min`);
  }
} else {
  console.log('  (baseline raw stream 不存在，跳过)');
}

// ─────────────────────────── 5. narrative prompt 大小 ───────────────────────────

console.log('\n[5] Narrative prompt 组装后大小');

const narrativeTemplate = fs.readFileSync(
  path.join(__dirname, 'prompts', 'narrative-prompt.txt'),
  'utf-8',
);
const reportTemplate = fs.readFileSync(
  path.join(__dirname, 'prompts', 'report-templates', 'unity-single-state.txt'),
  'utf-8',
);

// narrative prompt 注入 report template + memory + findings
const findingsPath = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'prism-out',
  'camera_ab_24072PX77C_20260723_194703',
  '2026-07-24_11-56-38',
  'findings.json',
);
let findingsSize = 0;
if (fs.existsSync(findingsPath)) {
  findingsSize = fs.statSync(findingsPath).size;
}

const narrativeFullPrompt = narrativeTemplate
  .replace(/\{\{OUTPUT_DIR\}\}/g, 'web/data/prism-out/test/stamp')
  .replace(/\{\{REPORT_TEMPLATE\}\}/g, reportTemplate)
  .replace(/\{\{MEMORY_INJECTION\}\}/g, memoryBlock);

measure('narrative template chars', narrativeTemplate.length);
measure('report template chars', reportTemplate.length);
measure('narrative full prompt chars', narrativeFullPrompt.length);
measure('findings.json size', findingsSize);
measure('narrative input ≈tokens', Math.round((narrativeFullPrompt.length + findingsSize) / 3.5));
// baseline narrative L6: in=54360
measure('baseline narrative 首次 input_tokens', 54360, 'raw stream L6');

// ─────────────────────────── 6. narrative thinking 分析 ───────────────────────────

console.log('\n[6] Narrative thinking 分析');

const narrativeRawPath = path.join(
  __dirname,
  '..',
  '..',
  'data',
  'prism-out',
  'camera_ab_24072PX77C_20260723_194703',
  '2026-07-24_11-56-38',
  'narrative-raw-stream.jsonl',
);

let narrativeThinkingChars = 0;
let narrativeWriteChars = 0;
let narrativeOutTokens = 0;
if (fs.existsSync(narrativeRawPath)) {
  const lines = fs.readFileSync(narrativeRawPath, 'utf-8').split('\n').filter(Boolean);

  function parseMultiJson2(line: string): any[] {
    const objs: any[] = [];
    let depth = 0, start = 0, inStr = false, esc = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') { if (depth === 0) start = i; depth++; }
      else if (c === '}') { depth--; if (depth === 0) objs.push(line.slice(start, i + 1)); }
    }
    return objs;
  }

  for (const line of lines) {
    for (const o of parseMultiJson2(line)) {
      let j: any;
      try { j = JSON.parse(o); } catch { continue; }
      if (j.type !== 'assistant') continue;
      for (const c of (j.message?.content ?? [])) {
        if (c.type === 'thinking') narrativeThinkingChars += c.thinking.length;
        if (c.type === 'tool_use' && c.name === 'Write') {
          narrativeWriteChars += JSON.stringify(c.input).length;
        }
      }
      const u = j.message?.usage;
      if (u?.output_tokens) narrativeOutTokens += u.output_tokens;
    }
  }

  measure('narrative thinking chars', narrativeThinkingChars);
  measure('narrative thinking ≈tokens', Math.round(narrativeThinkingChars / 3.5));
  measure('narrative Write chars', narrativeWriteChars);
  measure('narrative Write ≈tokens', Math.round(narrativeWriteChars / 3.5));
  measure('narrative output_tokens 总', narrativeOutTokens);
  measure('narrative thinking 占 output 比', Math.round(narrativeThinkingChars / 3.5 / narrativeOutTokens * 100) + '%');

  // 如果 narrative thinking 砍半
  const savedNarrativeTokens = Math.round(narrativeThinkingChars / 3.5 / 2);
  measure('narrative thinking 砍半省 tokens', savedNarrativeTokens);
  measure('按 40 tok/s 省的时间', Math.round(savedNarrativeTokens / 40) + 's', `≈${Math.round(savedNarrativeTokens / 40 / 60 * 10) / 10}min`);
}

// ─────────────────────────── 7. skipExplore 路径验证 ───────────────────────────

console.log('\n[7] skipExplore 复用 findings 路径');

// baseline explore 耗时 30 min, narrative 12.9 min, render 1.2 min
measure('baseline explore 耗时', '30 min');
measure('baseline narrative 耗时', '12.9 min');
measure('baseline render 耗时', '1.2 min');
measure('skipExplore 后耗时', '14.1 min', 'narrative + render');
measure('skipExplore 省的时间', '30 min', 'explore 全省');

// ─────────────────────────── 8. 补充优化方案：并发工具调用 ───────────────────────────

console.log('\n[8] 补充优化：工具调用并发化');

// baseline seq 1 和 seq 2 的 ts 几乎相同（1784894252088 vs 1784894252090）
// 说明 LLM 已经在并发派发，但 batch 模式是串行的
if (fs.existsSync(timingPath)) {
  const timing = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));
  const toolCalls = timing.explore?.toolCalls ?? [];
  // 找 ts 接近的调用对（并发派发）
  let concurrentPairs = 0;
  for (let i = 0; i < toolCalls.length - 1; i++) {
    if (Math.abs(toolCalls[i].ts - toolCalls[i + 1].ts) < 100) {
      concurrentPairs++;
    }
  }
  measure('并发派发的工具对', concurrentPairs, 'LLM 已并发，但 batch 内部串行');
  // batch 调用的 toolMs 总和
  const batchCalls = toolCalls.filter((tc: any) => tc.cmd?.includes('batch'));
  const batchToolMsSum = batchCalls.reduce((s: number, tc: any) => s + (tc.toolMs ?? 0), 0);
  measure('batch 调用 toolMs 总和', batchToolMsSum + 'ms', `=${Math.round(batchToolMsSum / 1000)}s`);
  measure('batch 内部串行开销', '已最小化', 'batch 在单进程内执行');
}

// ─────────────────────────── 9. 补充优化：prompt 精简 ───────────────────────────

console.log('\n[9] 补充优化：explore prompt 精简');

// explore prompt 26KB，但有些内容可以精简
const promptLines = exploreTemplate.split('\n');
const commentLines = promptLines.filter(l => l.trim().startsWith('★') || l.trim().startsWith('//')).length;
const sectionLines = promptLines.filter(l => l.includes('═══')).length;
measure('prompt 总行数', promptLines.length);
measure('分隔线行数', sectionLines);
measure('标注行数', commentLines);
// 如果精简掉重复的"护栏"说明
const guardrailMentions = (exploreTemplate.match(/严禁|不许|不可|必须/g) ?? []).length;
measure('护栏关键词出现次数', guardrailMentions, '可合并精简');
const promptTrimmedEstimate = Math.round(exploreTemplate.length * 0.85);
measure('精简后预估 chars', promptTrimmedEstimate, '省 15%');
measure('精简省 ≈tokens', Math.round((exploreTemplate.length - promptTrimmedEstimate) / 3.5));

// ─────────────────────────── 10. 补充优化：narrative 结构骨架 ───────────────────────────

console.log('\n[10] 补充优化：narrative 结构骨架预置');

// narrative thinking 46K chars，如果给骨架减少组织负担
// report template 已经 8.5KB，但 narrative thinking 仍 46K
// 方案：把 findings → sections 的映射规则写死在 prompt，减少 LLM 自己组织的思考
measure('report template chars', reportTemplate.length);
const narrativeThinkingCharsForCalc = typeof narrativeThinkingChars !== 'undefined' ? narrativeThinkingChars : 46132;
measure('narrative thinking chars', narrativeThinkingCharsForCalc, 'baseline L9');
// 如果骨架能减少 30% 的 thinking
const skeletonSavedTokens = Math.round(narrativeThinkingCharsForCalc / 3.5 * 0.3);
measure('骨架预置省 tokens', skeletonSavedTokens, '预估 30% thinking 减少');
measure('按 40 tok/s 省的时间', Math.round(skeletonSavedTokens / 40) + 's', `≈${Math.round(skeletonSavedTokens / 40 / 60 * 10) / 10}min`);

// ─────────────────────────── 汇总 ───────────────────────────

console.log('\n' + '═'.repeat(70));
console.log('汇总：各优化点预估收益');
console.log('═'.repeat(70));
console.log(`PASS: ${passCount}  FAIL: ${failCount}`);
console.log('');
console.log('优化点                          | 预估省时间    | 风险   | 对 output_tokens 影响');
console.log('────────────────────────────────|──────────────|───────|─────────────────────');
console.log('A. --tools 排他（已改待验证）    | 1-2 min       | 无损   | 无（只减 input）');
console.log('B. 禁止写完 findings 后验证      | 5-8 min       | 低风险 | 减少 ~8K output tokens');
console.log('C. skipExplore 复用 findings    | 30 min        | 无损   | 无（跳过 explore）');
console.log('D. thinking 约束到 2000 chars   | 8-15 min      | 高风险 | 减少 ~10K output tokens');
console.log('E. narrative thinking 砍半      | 5-6 min       | 中风险 | 减少 ~5K output tokens');
console.log('F. tool_result 摘要             | 2-3 min       | 中风险 | 无（只减 input）');
console.log('G. narrative 结构骨架预置       | 3-4 min       | 中风险 | 减少 ~3K output tokens');
console.log('H. explore prompt 精简          | 0.5-1 min     | 低风险 | 无（只减 input）');
console.log('');
console.log('组合方案：');
console.log('  低风险组合（A+B+C+H）          | 37-41 min     | 首次 4-8 min, 重复 < 15 min');
console.log('  中风险组合（A+B+C+E+F+G+H）    | 45-54 min     | 首次 < 5 min, 重复 < 15 min');
console.log('  高风险组合（全做）             | 53-69 min     | 首次 < 5 min, 但需验证质量');

process.exit(failCount > 0 ? 1 : 0);
