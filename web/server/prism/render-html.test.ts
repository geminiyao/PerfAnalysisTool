/**
 * render-html.test.ts — WT-030 markdown lite renderer 单测
 *
 * Plain tsx script (no test runner). Run from web/ directory:
 *   npx tsx server/prism/render-html.test.ts
 *
 * 覆盖 8 个 case（工单要求）：
 *   1. 纯表格
 *   2. 表格 + 前后文本
 *   3. 代码围栏
 *   4. 粗体
 *   5. 行内代码
 *   6. 混合（表格 + 粗体 + 行内代码）
 *   7. XSS 防护
 *   8. 复杂降级（# 标题原样显示）
 */

import { renderMarkdownLite, renderInlineMarkdown } from './render-html.js';

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

function assertContains(haystack: string, needle: string, label: string): void {
  assert(haystack.includes(needle), label, { needle, haystack });
}

function assertNotContains(haystack: string, needle: string, label: string): void {
  assert(!haystack.includes(needle), label, { needle, haystack });
}

// ─────────────────────────── 1. 纯表格 ───────────────────────────
{
  const md = `| 指标 | base | cur | throttle |
|---|---|---|---|
| 1 | 2 | 3 | 4 |`;
  const html = renderMarkdownLite(md);
  console.log('\n[1] 纯表格');
  assertContains(html, '<table>', '含 <table>');
  assertContains(html, '<thead>', '含 <thead>');
  assertContains(html, '<th>指标</th>', '含表头单元格 指标');
  assertContains(html, '<th>base</th>', '含表头单元格 base');
  assertContains(html, '<th>throttle</th>', '含表头单元格 throttle');
  assertContains(html, '<tbody>', '含 <tbody>');
  assertContains(html, '<td>1</td>', '含数据格 1');
  assertContains(html, '<td>4</td>', '含数据格 4');
  assertNotContains(html, '|---|', '不含原始分隔行文本');
}

// ─────────────────────────── 2. 表格 + 前后文本 ───────────────────────────
{
  const md = `导语一段话

| a | b |
|---|---|
| 1 | 2 |

尾注一段话`;
  const html = renderMarkdownLite(md);
  console.log('\n[2] 表格 + 前后文本');
  assertContains(html, '<br>', '含换行 <br>');
  assertContains(html, '<table>', '含 <table>');
  assertContains(html, '<th>a</th>', '含表头 a');
  assertContains(html, '<th>b</th>', '含表头 b');
  assertContains(html, '<td>1</td>', '含数据格 1');
  assertContains(html, '<td>2</td>', '含数据格 2');
  assertContains(html, '导语一段话', '含前导文本');
  assertContains(html, '尾注一段话', '含尾部文本');
}

// ─────────────────────────── 3. 代码围栏 ───────────────────────────
{
  const md = '```js\nvar x = 1;\nconsole.log(x);\n```';
  const html = renderMarkdownLite(md);
  console.log('\n[3] 代码围栏');
  assertContains(html, '<pre><code>', '含 <pre><code>');
  assertContains(html, 'var x = 1;', '含代码内容 var x = 1;');
  assertContains(html, 'console.log(x);', '含代码内容 console.log(x);');
  assertNotContains(html, '<table>', '不含表格（代码内的 | 不解析为表格）');
}

// ─────────────────────────── 4. 粗体 ───────────────────────────
{
  const md = '这是**重点**内容';
  const html = renderMarkdownLite(md);
  console.log('\n[4] 粗体');
  assertContains(html, '<strong>重点</strong>', '含 <strong>重点</strong>');
}

// ─────────────────────────── 5. 行内代码 ───────────────────────────
{
  const md = '用 `foo` 函数';
  const html = renderMarkdownLite(md);
  console.log('\n[5] 行内代码');
  assertContains(html, '<code>foo</code>', '含 <code>foo</code>');
}

// ─────────────────────────── 6. 混合 ───────────────────────────
{
  const md = `**导语**：用 \`foo\` 工具

| 模块 | 调用次数 |
|---|---|
| A | 100 |
| B | 200 |`;
  const html = renderMarkdownLite(md);
  console.log('\n[6] 混合（表格 + 粗体 + 行内代码）');
  assertContains(html, '<strong>导语</strong>', '含粗体 导语');
  assertContains(html, '<code>foo</code>', '含行内代码 foo');
  assertContains(html, '<table>', '含表格');
  assertContains(html, '<th>模块</th>', '含表头 模块');
  assertContains(html, '<td>A</td>', '含数据格 A');
  assertContains(html, '<td>200</td>', '含数据格 200');
}

// ─────────────────────────── 7. XSS 防护 ───────────────────────────
{
  const md = '<script>alert(1)</script>';
  const html = renderMarkdownLite(md);
  console.log('\n[7] XSS 防护');
  assertNotContains(html, '<script>', '不含 <script> 标签（已转义）');
  assertContains(html, '&lt;script&gt;', '含转义后的 &lt;script&gt;');
}

// ─────────────────────────── 8. 复杂降级（# 标题原样显示） ───────────────────────────
{
  const md = '# 标题';
  const html = renderMarkdownLite(md);
  console.log('\n[8] 复杂降级（# 标题）');
  // 不支持标题 token，原样显示为纯文本（# 保留，不报错）
  assertContains(html, '# 标题', '原样显示 # 标题');
  assertNotContains(html, '<h1>', '不渲染为 <h1>');
}

// ─────────────────────────── 额外边界 case ───────────────────────────
{
  console.log('\n[额外] 边界 case');

  // 空字符串
  assert(renderMarkdownLite('') === '', '空字符串返回空');

  // 表格内嵌粗体
  const md1 = `| 模块 | 值 |
|---|---|
| **A** | 100 |`;
  const html1 = renderMarkdownLite(md1);
  assertContains(html1, '<strong>A</strong>', '表格单元格内支持粗体');

  // 代码围栏内含 |（不解析为表格）
  const md2 = '```\n| a | b |\n|---|---|\n| 1 | 2 |\n```';
  const html2 = renderMarkdownLite(md2);
  assertContains(html2, '<pre><code>', '代码围栏含表格符号仍渲染为 <pre><code>');
  assertNotContains(html2, '<table>', '代码围栏内的 | 不解析为 <table>');

  // 单元格内行内代码
  const md3 = `| fn | ms |
|---|---|
| \`foo\` | 1.5 |`;
  const html3 = renderMarkdownLite(md3);
  assertContains(html3, '<code>foo</code>', '表格单元格内支持行内代码');

  // renderInlineMarkdown 独立测
  const inline = renderInlineMarkdown('**a** and `b`');
  assertContains(inline, '<strong>a</strong>', 'renderInlineMarkdown 粗体');
  assertContains(inline, '<code>b</code>', 'renderInlineMarkdown 行内代码');
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
