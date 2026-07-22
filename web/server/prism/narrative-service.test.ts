/**
 * narrative-service.test.ts — WT-049: JSON 修复回路 + timing 测试
 *
 * Plain tsx script (no test runner). Run from web/ directory:
 *   npx tsx server/prism/narrative-service.test.ts
 *
 * 测试用 mock LLM runner（不真跑 LLM），覆盖：
 *   1. 正常路径：LLM 产出合规 JSON → 修复回路不触发 → repairCount=0 → timing 各环节都有值
 *   2. 非法 JSON 1 次修复：LLM 第 1 次产出非法 JSON → 修复回路触发 → 第 2 次合规 → repairCount=1
 *   3. 非法 JSON 2 次修复失败：LLM 1/2/3 次都非法 → 修复回路 2 次 → 仍失败 → makeNarrativeError
 *   4. 修复 prompt 含原 prompt + 错误信息 + 错误位置附近 raw 片段
 *   5. timing 数据完整：跑完后 timing 含 precheck/prompt_inject/cli_resolve/llm_call/artifact_check/json_parse/provenance_check/red_team/file_io/total
 *
 * 注意：测试要快（< 5 秒），不真跑 LLM。通过 RunPrismNarrativeOpts.llmRunner 注入 mock。
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPrismNarrative, type LlmRunnerCtx, type LlmRunnerResult } from './narrative-service.js';
import type { NarrativeReport } from './narrative-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, label: string, detail?: unknown): void {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passCount++;
  } else {
    console.log(`  FAIL: ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
    failCount++;
  }
}

// ─────────────────────────── 测试夹具 ───────────────────────────

/**
 * 创建一个临时 run 目录，写入 findings.json + verdict.json（runPrismNarrative 前置检查需要）。
 * 返回 { root, outputDir, narrativePath, cleanup }。
 */
function makeTempRunDir(): { outputDir: string; narrativePath: string; findingsPath: string; verdictPath: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'narrative-wt049-test-'));
  const outputDir = root;  // 不需要子目录
  const narrativePath = path.join(outputDir, 'narrative.json');
  const findingsPath = path.join(outputDir, 'findings.json');
  const verdictPath = path.join(outputDir, 'verdict.json');
  // findings.json: 最小合法结构（explore 阶段产出）
  fs.writeFileSync(findingsPath, JSON.stringify([], null, 2), 'utf-8');
  // verdict.json: 最小合法结构
  fs.writeFileSync(verdictPath, JSON.stringify({ rating: 'pass', summary: 'test' }, null, 2), 'utf-8');
  return {
    outputDir,
    narrativePath,
    findingsPath,
    verdictPath,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

/** 构造一个最小合法 NarrativeReport（generatedBy='LLM'，过 provenance 校验） */
function makeValidNarrative(): NarrativeReport {
  return {
    runId: 'test-run',
    overview: 'test overview for narrative-service unit test (>=20 chars)',
    rating: 'pass',
    topConclusions: [
      { rank: 1, problem: 'p1', kind: '稳态大头', contribution: 'c1', severity: 'critical' },
      { rank: 2, problem: 'p2', kind: '稳态大头', contribution: 'c2', severity: 'high' },
      { rank: 3, problem: 'p3', kind: '高频尖峰', contribution: 'c3', severity: 'medium' },
    ],
    sections: [
      { heading: '§0 结论先行', items: [] },
      { heading: '§1 采集元信息', items: [] },
      { heading: '§2 稳态开销', items: [] },
    ],
    prioritySummary: [{ priority: 'P0', action: 'a', benefit: 'b' }],
    narrativeProvenance: {
      stage: 'narrative-llm',
      promptVersion: 'test-prompt@v1',
      generatedBy: 'LLM',
    },
  };
}

/** 构造一个非法 JSON 字符串（模拟 LLM 产出非法 JSON——raw `"` 在字符串值里） */
function makeInvalidNarrativeJson(): string {
  // 故意构造非法 JSON：字符串值里有未转义的 raw 双引号 + 未转义换行
  return `{
  "runId": "test-run",
  "overview": "bad "quoted" value with raw quotes",
  "rating": "pass",
  "topConclusions": [],
  "sections": [],
  "prioritySummary": [],
  "narrativeProvenance": {
    "stage": "narrative-llm",
    "promptVersion": "test@v1",
    "generatedBy": "LLM"
  }
}`;
}

/**
 * 构造 mock llmRunner。每次调用把 narrative.json 写到 ctx.narrativePath。
 * @param outputs 队列：第 1 个是首次 LLM 调用产出，后续是修复回路重试产出。
 *                 每个元素是 { json: string | null }——null 表示这次产出非法 JSON（直接写 raw 字符串）。
 *                 字符串表示合法 JSON（直接写）。
 * @param receivedPrompts 收到的 prompt 列表（测试用例 4 检查修复 prompt 内容）
 */
function makeMockRunner(
  outputs: { raw: string; valid: boolean }[],
  receivedPrompts: string[],
): (promptText: string, ctx: LlmRunnerCtx) => Promise<LlmRunnerResult> {
  let callIdx = 0;
  return async (promptText: string, ctx: LlmRunnerCtx): Promise<LlmRunnerResult> => {
    receivedPrompts.push(promptText);
    const out = outputs[Math.min(callIdx, outputs.length - 1)];
    callIdx++;
    // 把产出写到 narrativePath（模拟 LLM 写文件）
    fs.writeFileSync(ctx.narrativePath, out.raw, 'utf-8');
    return { exitCode: 0, stdoutTail: '', stderrTail: '' };
  };
}

// ─────────────────────────── 1. 正常路径 ───────────────────────────

console.log('\n[1] 正常路径：LLM 产出合规 JSON → 修复回路不触发 → repairCount=0 → timing 各环节都有值');

{
  const fixture = makeTempRunDir();
  try {
    const validJson = JSON.stringify(makeValidNarrative(), null, 2);
    const receivedPrompts: string[] = [];
    const result = await runPrismNarrative({
      source: 'unity',
      runId: 'test-normal',
      outputDir: fixture.outputDir,
      llmRunner: makeMockRunner([{ raw: validJson, valid: true }], receivedPrompts),
      timeoutMs: 5000,
    });

    assert(result.success, '正常路径 success=true', result.error);
    assert(result.narrative?.narrativeProvenance?.repairCount === 0,
      '正常路径 repairCount=0（修复回路不触发）',
      result.narrative?.narrativeProvenance?.repairCount);
    assert(receivedPrompts.length === 1, '正常路径只调用 LLM 1 次（无修复重试）', receivedPrompts.length);

    // timing 各环节都有值
    const timing = result.narrative?.narrativeProvenance?.timing ?? {};
    const expectedKeys = ['precheck', 'prompt_inject', 'cli_resolve', 'llm_call', 'artifact_check', 'json_parse', 'provenance_check', 'red_team', 'file_io', 'total'];
    for (const k of expectedKeys) {
      assert(typeof timing[k] === 'number' && timing[k] >= 0, `timing 含 ${k}（>=0）`, timing[k]);
    }
    // 正常路径不应有 json_repair_retry_* 字段
    assert(timing['json_repair_retry_1'] === undefined, '正常路径无 json_repair_retry_1');
    assert(timing['json_repair_retry_2'] === undefined, '正常路径无 json_repair_retry_2');
  } finally {
    fixture.cleanup();
  }
}

// ─────────────────────────── 2. 非法 JSON 1 次修复 ───────────────────────────

console.log('\n[2] 非法 JSON 1 次修复：LLM 第 1 次非法 → 修复回路触发 → 第 2 次合规 → repairCount=1');

{
  const fixture = makeTempRunDir();
  try {
    const validJson = JSON.stringify(makeValidNarrative(), null, 2);
    const invalidJson = makeInvalidNarrativeJson();
    const receivedPrompts: string[] = [];
    const result = await runPrismNarrative({
      source: 'unity',
      runId: 'test-repair1',
      outputDir: fixture.outputDir,
      llmRunner: makeMockRunner([
        { raw: invalidJson, valid: false },  // 第 1 次：非法
        { raw: validJson, valid: true },      // 第 2 次（修复 1）：合规
      ], receivedPrompts),
      timeoutMs: 5000,
    });

    assert(result.success, '1 次修复后 success=true', result.error);
    assert(result.narrative?.narrativeProvenance?.repairCount === 1,
      '1 次修复后 repairCount=1',
      result.narrative?.narrativeProvenance?.repairCount);
    assert(receivedPrompts.length === 2, 'LLM 调用 2 次（1 首次 + 1 修复）', receivedPrompts.length);

    const timing = result.narrative?.narrativeProvenance?.timing ?? {};
    assert(typeof timing['json_repair_retry_1'] === 'number', 'timing 含 json_repair_retry_1', timing['json_repair_retry_1']);
    assert(timing['json_repair_retry_2'] === undefined, '1 次修复成功 → 无 json_repair_retry_2');
  } finally {
    fixture.cleanup();
  }
}

// ─────────────────────────── 3. 非法 JSON 2 次修复失败 ───────────────────────────

console.log('\n[3] 非法 JSON 2 次修复失败：LLM 1/2/3 次都非法 → 修复回路 2 次 → 仍失败 → makeNarrativeError');

{
  const fixture = makeTempRunDir();
  try {
    const invalidJson = makeInvalidNarrativeJson();
    const receivedPrompts: string[] = [];
    const result = await runPrismNarrative({
      source: 'unity',
      runId: 'test-repair2-fail',
      outputDir: fixture.outputDir,
      llmRunner: makeMockRunner([
        { raw: invalidJson, valid: false },  // 第 1 次：非法
        { raw: invalidJson, valid: false },  // 第 2 次（修复 1）：非法
        { raw: invalidJson, valid: false },  // 第 3 次（修复 2）：非法
      ], receivedPrompts),
      timeoutMs: 5000,
    });

    assert(!result.success, '2 次修复仍失败 → success=false', result);
    assert(/repair|JSON/i.test(result.error ?? ''), 'error 信息含 repair/JSON', result.error);
    assert(receivedPrompts.length === 3, 'LLM 调用 3 次（1 首次 + 2 修复）', receivedPrompts.length);
  } finally {
    fixture.cleanup();
  }
}

// ─────────────────────────── 4. 修复 prompt 含原 prompt + 错误信息 + raw 片段 ───────────────────────────

console.log('\n[4] 修复 prompt 含原 prompt + "JSON 解析失败" + 错误位置附近 raw 片段');

{
  const fixture = makeTempRunDir();
  try {
    const validJson = JSON.stringify(makeValidNarrative(), null, 2);
    const invalidJson = makeInvalidNarrativeJson();
    const receivedPrompts: string[] = [];
    const result = await runPrismNarrative({
      source: 'unity',
      runId: 'test-repair-prompt',
      outputDir: fixture.outputDir,
      llmRunner: makeMockRunner([
        { raw: invalidJson, valid: false },
        { raw: validJson, valid: true },
      ], receivedPrompts),
      timeoutMs: 5000,
    });

    assert(result.success, '修复成功（前置条件）', result.error);
    assert(receivedPrompts.length === 2, 'LLM 调用 2 次', receivedPrompts.length);

    const repairPrompt = receivedPrompts[1];
    // 4a. 含原 prompt 内容（narrative-prompt.txt 的某段关键词，如 "narrative" 或 "overview"）
    assert(/narrative|overview|topConclusions/i.test(repairPrompt),
      '修复 prompt 含原 prompt 内容（narrative/overview/topConclusions 关键词）',
      repairPrompt.slice(0, 200));
    // 4b. 含"JSON 解析失败"或类似错误提示
    assert(/JSON.*解析失败|解析失败|修复并重新/i.test(repairPrompt),
      '修复 prompt 含 "JSON 解析失败/修复并重新" 提示',
      repairPrompt.slice(-400));
    // 4c. 含错误位置附近 raw 片段（非法 JSON 里的 "bad" 或 "quoted" 关键词）
    assert(/bad|quoted/i.test(repairPrompt),
      '修复 prompt 含错误位置附近 raw 片段（bad/quoted 关键词）',
      repairPrompt.slice(-400));
    // 4d. 含"完整可解析的 JSON"要求
    assert(/完整.*可解析.*JSON|完整.*JSON/i.test(repairPrompt),
      '修复 prompt 含 "完整可解析 JSON" 要求',
      repairPrompt.slice(-400));
  } finally {
    fixture.cleanup();
  }
}

// ─────────────────────────── 5. timing 数据完整 ───────────────────────────

console.log('\n[5] timing 数据完整：跑完后 timing 含 precheck/prompt_inject/cli_resolve/llm_call/artifact_check/json_parse/provenance_check/red_team/file_io/total');

{
  const fixture = makeTempRunDir();
  try {
    const validJson = JSON.stringify(makeValidNarrative(), null, 2);
    const receivedPrompts: string[] = [];
    const result = await runPrismNarrative({
      source: 'unity',
      runId: 'test-timing',
      outputDir: fixture.outputDir,
      llmRunner: makeMockRunner([{ raw: validJson, valid: true }], receivedPrompts),
      timeoutMs: 5000,
    });

    assert(result.success, '正常路径 success（前置条件）', result.error);
    const timing = result.narrative?.narrativeProvenance?.timing;
    assert(timing !== undefined && timing !== null, 'timing 字段存在', timing);

    if (timing) {
      const requiredKeys = [
        'precheck', 'prompt_inject', 'cli_resolve', 'llm_call',
        'artifact_check', 'json_parse', 'provenance_check',
        'red_team', 'file_io', 'total',
      ];
      let allPresent = true;
      const missing: string[] = [];
      for (const k of requiredKeys) {
        if (typeof timing[k] !== 'number' || timing[k] < 0) {
          allPresent = false;
          missing.push(k);
        }
      }
      assert(allPresent, `timing 含全部 10 个必填环节字段`, { missing, present: Object.keys(timing) });
      // total 应 >= 各环节之和的近似值（不严格相等，因为 measure 之间有微小开销）
      assert(timing.total >= 0, 'timing.total >= 0', timing.total);
      // llm_call 应有值（即使是 mock，runner 调用耗时 > 0）
      assert(typeof timing.llm_call === 'number', 'timing.llm_call 是数字', timing.llm_call);
    }
  } finally {
    fixture.cleanup();
  }
}

// ─────────────────────────── Summary ───────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passCount} PASS, ${failCount} FAIL`);
if (failCount > 0) {
  console.log('\nOVERALL: FAIL');
  process.exit(1);
} else {
  console.log('\nOVERALL: PASS');
  process.exit(0);
}
