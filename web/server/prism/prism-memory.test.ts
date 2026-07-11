/**
 * prism-memory.test.ts — M3-A 持久大脑存取单测
 *
 * Plain tsx script (no test runner). Run from web/ directory:
 *   npx tsx server/prism/prism-memory.test.ts
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  MEMORY_CATEGORIES,
  appendMemory,
  loadMemory,
  loadMemoryIndex,
} from './prism-memory.js';

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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prism-memory-test-'));
}

function rmTempRoot(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ─────────────────────────── 1. append → load 读回 ─────────────────

console.log('\n[1] appendMemory then loadMemory read-back');
{
  const root = makeTempRoot();
  try {
    const saved = appendMemory(
      'knowledge',
      { id: 'k1', content: 'GC.Collect 70ms 卡顿由 LuaMgr 帧尾触发', source: 'test-run' },
      { root },
    );
    assert(saved.id === 'k1', 'append returns id k1');
    assert(saved.category === 'knowledge', 'append sets category knowledge');

    const loaded = loadMemory({ root });
    const k1 = loaded.byCategory.knowledge?.find((e) => e.id === 'k1');
    assert(k1 !== undefined, 'loadMemory finds k1 in knowledge');
    assert(
      k1?.content.includes('GC.Collect 70ms'),
      'loaded content matches append',
      k1?.content,
    );
    assert(k1?.source === 'test-run', 'loaded source preserved', k1?.source);
  } finally {
    rmTempRoot(root);
  }
}

// ─────────────────────────── 2. 按分类筛选 ───────────────────────────

console.log('\n[2] loadMemory category filter');
{
  const root = makeTempRoot();
  try {
    appendMemory('knowledge', { id: 'k2', content: 'knowledge only' }, { root });
    appendMemory('lessons', { id: 'l1', content: 'lesson only' }, { root });

    const knowledgeOnly = loadMemory({ categories: ['knowledge'], root });
    assert(
      (knowledgeOnly.byCategory.knowledge?.length ?? 0) === 1,
      'filter knowledge returns 1 entry',
      knowledgeOnly.byCategory,
    );
    assert(
      knowledgeOnly.byCategory.lessons === undefined,
      'filter knowledge excludes lessons key',
      knowledgeOnly.byCategory,
    );
    assert(
      knowledgeOnly.entries.every((e) => e.category === 'knowledge'),
      'all entries are knowledge category',
      knowledgeOnly.entries,
    );
  } finally {
    rmTempRoot(root);
  }
}

// ─────────────────────────── 3. 空/缺分类不报错 ─────────────────────

console.log('\n[3] empty / missing category does not throw');
{
  const root = makeTempRoot();
  try {
    let threw = false;
    try {
      const empty = loadMemory({ root });
      assert(empty.entries.length === 0, 'empty root returns zero entries', empty.entries);
      assert(
        Object.keys(empty.byCategory).length === MEMORY_CATEGORIES.filter((c) => c.enabled).length,
        'empty root still has enabled category keys',
        Object.keys(empty.byCategory),
      );
    } catch {
      threw = true;
    }
    assert(!threw, 'loadMemory on empty root does not throw');

    const unknown = loadMemory({ categories: ['nonexistent-cat'], root });
    assert(unknown.entries.length === 0, 'unknown category filter returns empty', unknown.entries);
    assert(
      Object.keys(unknown.byCategory).length === 0,
      'unknown category filter has no byCategory keys',
      unknown.byCategory,
    );
  } finally {
    rmTempRoot(root);
  }
}

// ─────────────────────────── 4. 可插拔：只加载 priors ─────────────────

console.log('\n[4] loadMemory({categories:["priors"]}) only returns priors');
{
  const defaultRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'prism-memory');
  const priorsOnly = loadMemory({ categories: ['priors'] });
  assert(priorsOnly.entries.length >= 2, 'priors has ingested prior-knowledge entries', priorsOnly.entries.length);
  assert(
    priorsOnly.entries.every((e) => e.category === 'priors'),
    'all entries are priors',
    priorsOnly.entries.map((e) => e.category),
  );
  assert(
    priorsOnly.byCategory.knowledge === undefined,
    'priors-only load excludes knowledge',
    Object.keys(priorsOnly.byCategory),
  );
  assert(
    priorsOnly.byCategory.capabilities === undefined,
    'priors-only load excludes capabilities',
    Object.keys(priorsOnly.byCategory),
  );

  const index = loadMemoryIndex();
  assert(index.categories.priors !== undefined, 'index lists priors', index.categories);
  assert(fs.existsSync(path.join(defaultRoot, 'index.json')), 'index.json exists on disk');
}

// ─────────────────────────── 5. 可扩展：注册表加测试分类 ─────────────

console.log('\n[5] extensibility — new category via MEMORY_CATEGORIES registry');
{
  const root = makeTempRoot();
  const testCategory = {
    name: 'test-ext',
    dir: 'test-ext',
    enabled: true,
    description: '单测临时分类',
  };
  MEMORY_CATEGORIES.push(testCategory);
  try {
    const saved = appendMemory('test-ext', { id: 'x1', content: 'extensible category works' }, { root });
    assert(saved.category === 'test-ext', 'append to new category succeeds');

    const loaded = loadMemory({ categories: ['test-ext'], root });
    assert(
      loaded.byCategory['test-ext']?.[0]?.id === 'x1',
      'load from new category works',
      loaded.byCategory['test-ext'],
    );

    const index = loadMemoryIndex({ root });
    assert(index.categories['test-ext']?.count === 1, 'index tracks new category', index.categories);
  } finally {
    MEMORY_CATEGORIES.pop();
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
