/**
 * ingest-memory.test.ts — M3 摄入层单测（mock LLM，不依赖真实 CLI）
 *
 * Run from web/:
 *   npx tsx server/prism/ingest-memory.test.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ingestSource,
  parseKnowledgeJson,
  buildIngestPrompt,
  extractTextFromStreamJson,
} from './ingest-memory.js';
import { loadMemory } from './prism-memory.js';

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prism-ingest-test-'));
}

function rmTempRoot(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

const MOCK_ITEMS = [
  {
    id: 'test-src-playerloop',
    title: 'PlayerLoop 结构',
    content: 'Unity 主线程每帧执行 PlayerLoop，含 Initialization、Update、Rendering 等阶段。',
    tags: ['unity', 'playerloop'],
  },
  {
    id: 'test-src-gc-spike',
    title: 'GC Spike 模式',
    content: 'GC.Collect 出现在 spike 帧且耗时 > 2ms 通常由大量临时对象分配引起。',
    tags: ['gc'],
  },
];

// ─── (a) mock LLM → 正确入库 ─────────────────────────────────────

console.log('\n[1] ingestSource with mock LLM stores entries readable via loadMemory');
{
  const root = makeTempRoot();
  const sourceFile = path.join(root, 'sample.md');
  fs.writeFileSync(sourceFile, '# Sample\nSome unity perf notes.', 'utf8');

  try {
    const result = await ingestSource({
      sourcePath: sourceFile,
      category: 'priors',
      sourceLabel: 'test-src',
      root,
      llmRunner: async () => JSON.stringify(MOCK_ITEMS),
    });

    assert(result.success, 'ingest succeeds', result);
    assert(result.count === 2, 'ingest wrote 2 entries', result.count);

    const loaded = loadMemory({ categories: ['priors'], root });
    assert(loaded.entries.length === 2, 'loadMemory sees 2 priors', loaded.entries.length);

    const p1 = loaded.entries.find((e) => e.id === 'test-src-playerloop');
    assert(p1 !== undefined, 'finds test-src-playerloop');
    assert(p1?.content.includes('PlayerLoop'), 'content preserved', p1?.content);
    assert(p1?.source === 'test-src', 'source label set', p1?.source);
    assert(String((p1 as Record<string, unknown>).title) === 'PlayerLoop 结构', 'title in frontmatter');
  } finally {
    rmTempRoot(root);
  }
}

// ─── (b) 重跑同源 → 同 id 覆盖 ───────────────────────────────────

console.log('\n[2] re-ingest same source overwrites by id (no duplicate pile-up)');
{
  const root = makeTempRoot();
  const sourceFile = path.join(root, 'repeat.md');
  fs.writeFileSync(sourceFile, 'repeat source', 'utf8');

  const runner = async () =>
    JSON.stringify([
      { id: 'repeat-src-a', title: 'A', content: 'version-one' },
      { id: 'repeat-src-b', title: 'B', content: 'version-one' },
    ]);

  try {
    await ingestSource({
      sourcePath: sourceFile,
      category: 'knowledge',
      sourceLabel: 'repeat-src',
      root,
      llmRunner: runner,
    });

    const runnerV2 = async () =>
      JSON.stringify([
        { id: 'repeat-src-a', title: 'A', content: 'version-two' },
        { id: 'repeat-src-b', title: 'B', content: 'version-two' },
      ]);

    await ingestSource({
      sourcePath: sourceFile,
      category: 'knowledge',
      sourceLabel: 'repeat-src',
      root,
      llmRunner: runnerV2,
    });

    const loaded = loadMemory({ categories: ['knowledge'], root });
    assert(loaded.entries.length === 2, 'still 2 entries after re-run', loaded.entries.length);
    const a = loaded.entries.find((e) => e.id === 'repeat-src-a');
    assert(a?.content === 'version-two', 'id repeat-src-a overwritten', a?.content);
  } finally {
    rmTempRoot(root);
  }
}

// ─── (c) 非法 JSON 兜底 ──────────────────────────────────────────

console.log('\n[3] invalid LLM JSON does not throw; returns graceful failure');
{
  const root = makeTempRoot();
  const sourceFile = path.join(root, 'bad-json.md');
  fs.writeFileSync(sourceFile, 'x', 'utf8');

  try {
    let threw = false;
    let result;
    try {
      result = await ingestSource({
        sourcePath: sourceFile,
        category: 'priors',
        sourceLabel: 'bad-json',
        root,
        llmRunner: async () => 'Sure! Here is your data: not json at all',
      });
    } catch {
      threw = true;
    }
    assert(!threw, 'ingestSource does not throw on bad JSON');
    assert(result?.success === false, 'success is false', result);
    assert(
      (result?.error ?? '').includes('parseable') || (result?.error ?? '').includes('JSON'),
      'error mentions parse failure',
      result?.error,
    );

    const loaded = loadMemory({ categories: ['priors'], root });
    assert(loaded.entries.length === 0, 'no entries written on bad JSON', loaded.entries.length);
  } finally {
    rmTempRoot(root);
  }
}

// ─── helpers ─────────────────────────────────────────────────────

console.log('\n[4] parseKnowledgeJson extracts fenced and bare arrays');
{
  const bare = parseKnowledgeJson('[{"id":"a","title":"t","content":"c"}]');
  assert(bare?.length === 1, 'parses bare array', bare);

  const fenced = parseKnowledgeJson('```json\n[{"id":"b","title":"t","content":"c"}]\n```');
  assert(fenced?.[0]?.id === 'b', 'parses fenced json', fenced);

  assert(parseKnowledgeJson('no json here') === null, 'returns null for garbage');
}

console.log('\n[5] buildIngestPrompt includes sourceLabel and fidelity rules');
{
  const p = buildIngestPrompt('body text', 'my-label');
  assert(p.includes('my-label'), 'prompt contains sourceLabel');
  assert(p.includes('不要杜撰'), 'prompt forbids fabrication');
  assert(p.includes('body text'), 'prompt embeds source');
}

console.log('\n[6] extractTextFromStreamJson collects assistant text blocks');
{
  const stream = [
    '{"type":"assistant","message":{"content":[{"type":"text","text":"[{\\"id\\":\\"x\\""}]}}',
    '{"type":"assistant","message":{"content":[{"type":"text","text":",\\"title\\":\\"t\\",\\"content\\":\\"c\\"}]"}]}}',
  ].join('\n');
  const text = extractTextFromStreamJson(stream);
  assert(text.includes('[{"id":"x"'), 'reassembles streamed JSON text', text);
}

// ─── Summary ─────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passCount} PASS, ${failCount} FAIL`);
if (failCount > 0) {
  console.log('OVERALL: FAIL');
  process.exit(1);
} else {
  console.log('OVERALL: PASS');
  process.exit(0);
}
