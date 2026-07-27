/**
 * explore-service.test.ts — M3-B memory injection for explore prompt
 *
 * Plain tsx script (no test runner). Run from web/ directory:
 *   npx tsx server/prism/explore-service.test.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  MEMORY_INJECTION_CATEGORIES,
  MEMORY_INJECTION_MAX_CHARS,
  deriveDataRequestStableId,
  formatMemoryForPrompt,
  persistDataRequestsToMemory,
} from './explore-service.js';
import { loadMemory } from './prism-memory.js';
import type { DataRequest } from './types.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_TEMPLATE_PATH = path.join(MODULE_DIR, 'prompts', 'unity-explore-prompt.txt');

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

function makeTempRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'explore-memory-test-'));
}

function rmTempRoot(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function substitutePromptPlaceholders(
  template: string,
  memoryBlock: string,
): string {
  return template
    .replace(/\{\{RUN_ID\}\}/g, 'test-run')
    .replace(/\{\{OUTPUT_DIR\}\}/g, 'web/data/prism-out/test-run/stamp')
    .replace(/\{\{FRAME_BUDGET_MS\}\}/g, '16.67')
    .replace(/\{\{TARGET_FPS\}\}/g, '60')
    .replace(/\{\{MEMORY_INJECTION\}\}/g, memoryBlock);
}

// ─────────────────────────── 1. priors 格式化非空 ─────────────────────

console.log('\n[1] formatMemoryForPrompt returns non-empty priors text');
{
  const block = formatMemoryForPrompt();
  assert(block.length > 0, 'memory block is non-empty', block.length);
  assert(
    block.includes('MapSignificanceMgr') || block.includes('MapCameraCtrl'),
    'block contains known prior keyword',
    block.slice(0, 200),
  );
  assert(block.includes('## priors'), 'block grouped by priors category', block.slice(0, 80));
}

// ─────────────────────────── 2. 注入进 prompt 占位已替换 ─────────────

console.log('\n[2] memory injected into explore prompt template');
{
  const template = fs.readFileSync(PROMPT_TEMPLATE_PATH, 'utf-8');
  const memoryBlock = formatMemoryForPrompt();
  const promptText = substitutePromptPlaceholders(template, memoryBlock);

  assert(!promptText.includes('{{MEMORY_INJECTION}}'), 'no leftover MEMORY_INJECTION placeholder');
  assert(
    promptText.includes('MapSignificanceMgr') || promptText.includes('MapCameraCtrl'),
    'final prompt contains prior knowledge',
  );
}

// ─────────────────────────── 3. 空大脑返回空串 ───────────────────────

console.log('\n[3] empty memory root returns empty injection block');
{
  const root = makeTempRoot();
  try {
    const block = formatMemoryForPrompt({ root });
    assert(block === '', 'empty root yields empty string', block);

    const template = fs.readFileSync(PROMPT_TEMPLATE_PATH, 'utf-8');
    const promptText = substitutePromptPlaceholders(template, block);
    assert(!promptText.includes('{{MEMORY_INJECTION}}'), 'empty injection still replaces placeholder');
  } finally {
    rmTempRoot(root);
  }
}

// ─────────────────────────── 4. F2 免责说明在位 ─────────────────────

console.log('\n[4] unity-explore-prompt.txt contains F2 disclaimer');
{
  const template = fs.readFileSync(PROMPT_TEMPLATE_PATH, 'utf-8');
  assert(
    template.includes('参考线索') && template.includes('不是盯防清单'),
    'template has reference-not-checklist disclaimer',
  );
  assert(
    template.includes('仍以本次真实数据为准') &&
      (template.includes('硬报')) &&
      (template.includes('不漏报') || template.includes('就不报')),
    'template has data-first free-discovery disclaimer',
  );
}

// ─────────────────────────── 5. 长度受控 ───────────────────────────

console.log('\n[5] injection length capped');
{
  const block = formatMemoryForPrompt();
  assert(
    block.length <= MEMORY_INJECTION_MAX_CHARS + 120,
    'block within max chars (+ truncation note slack)',
    block.length,
  );
}

// ─────────────────────────── 6. M3-C persist DataRequests ──────────

console.log('\n[6] persistDataRequestsToMemory writes capabilities entries');
{
  const root = makeTempRoot();
  try {
    const requests: DataRequest[] = [
      {
        id: 'llm-id-1',
        want: 'Per-marker GC allocation breakdown',
        rationale: 'Validate H3: Lua GC spikes correlate with marker X',
        suspectedAxis: 'marker',
        closestExistingTool: 'query_markers',
      },
      {
        id: 'llm-id-2',
        want: 'Thread wake latency histogram',
        rationale: 'Check off-CPU wait on render thread',
      },
    ];

    const count = persistDataRequestsToMemory(requests, { runId: 'run-test-001', root });
    assert(count === 2, 'persisted 2 entries', count);

    const loaded = loadMemory({ categories: ['capabilities'], root });
    const caps = loaded.byCategory.capabilities ?? [];
    assert(caps.length === 2, 'capabilities has 2 entries', caps.length);

    const first = caps.find((e) => e.content.includes('Per-marker GC allocation'));
    assert(first !== undefined, 'first entry content present', first?.content);
    assert(first?.source === 'run-test-001', 'source tagged with runId', first?.source);
    assert(first?.id.startsWith('dr-'), 'id is dr-<hash> derived', first?.id);
  } finally {
    rmTempRoot(root);
  }
}

// ─────────────────────────── 7. stable id dedup (same content twice) ─

console.log('\n[7] same DataRequest persisted twice stays 1 entry (stable id overwrite)');
{
  const root = makeTempRoot();
  try {
    const dr: DataRequest = {
      id: 'random-llm-slug',
      want: 'GPU frame time per pass',
      rationale: 'Need URP pass breakdown for H2',
    };

    persistDataRequestsToMemory([dr], { runId: 'run-a', root });
    persistDataRequestsToMemory([dr], { runId: 'run-b', root });

    const loaded = loadMemory({ categories: ['capabilities'], root });
    const caps = loaded.byCategory.capabilities ?? [];
    assert(caps.length === 1, 'only 1 entry after duplicate persist', caps.length);
    assert(
      deriveDataRequestStableId(dr) === caps[0]?.id,
      'entry id matches derived stable id',
      caps[0]?.id,
    );
    assert(caps[0]?.source === 'run-b', 'second persist overwrites source', caps[0]?.source);
  } finally {
    rmTempRoot(root);
  }
}

// ─────────────────────────── 8. empty / disabled / error tolerance ─

console.log('\n[8] empty requests and disabled persist return 0 without throw');
{
  const root = makeTempRoot();
  try {
    assert(persistDataRequestsToMemory([], { root }) === 0, 'empty array returns 0');
    assert(
      persistDataRequestsToMemory(
        [{ id: 'x', want: 'w', rationale: 'r' }],
        { root, enabled: false },
      ) === 0,
      'enabled:false returns 0',
    );

    let threw = false;
    try {
      const badRoot = path.join(root, 'blocked');
      fs.writeFileSync(badRoot, 'not a directory');
      persistDataRequestsToMemory(
        [{ id: 'x', want: 'bad root test', rationale: 'r' }],
        { root: badRoot, enabled: true },
      );
    } catch {
      threw = true;
    }
    assert(!threw, 'persist does not throw on append failure');
  } finally {
    rmTempRoot(root);
  }
}

// ─────────────────────────── 9. capabilities in injection categories ─

console.log('\n[9] MEMORY_INJECTION_CATEGORIES includes capabilities');
{
  assert(
    MEMORY_INJECTION_CATEGORIES.includes('capabilities'),
    'capabilities in injection list',
    MEMORY_INJECTION_CATEGORIES,
  );

  const root = makeTempRoot();
  try {
    persistDataRequestsToMemory(
      [{ id: 'x', want: 'Injected capability gap', rationale: 'for prompt test' }],
      { root },
    );
    const block = formatMemoryForPrompt({ root });
    assert(block.includes('## capabilities'), 'formatMemory includes capabilities section', block);
    assert(
      block.includes('Injected capability gap'),
      'formatMemory includes capability content',
      block.slice(0, 300),
    );
  } finally {
    rmTempRoot(root);
  }
}

// ─────────────────────────── Summary ───────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passCount} PASS, ${failCount} FAIL`);
if (failCount > 0) {
  console.log('OVERALL: FAIL');
  process.exit(1);
} else {
  console.log('OVERALL: PASS');
  process.exit(0);
}
