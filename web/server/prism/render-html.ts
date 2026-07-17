/**
 * render-html.ts — Prism HTML report renderer (deterministic, no LLM).
 *
 * Usage (from cwd web/):
 *   node --import tsx server/prism/render-html.ts --dir <run-output-dir>
 *
 * Reads:   <dir>/narrative.json  (required — NarrativeReport shape)
 *          <dir>/verdict.json    (optional — numeric metric strip)
 * Outputs: <dir>/report.html
 *
 * Features:
 * - Self-contained HTML (inline CSS + JS, opens by double-click)
 * - Dark Unity-Timeline-inspired theme
 * - Narrative-flow structure: overview → topConclusions → sections → prioritySummary
 * - Flame-bar call-tree re-queried from real DB at render time (drillDownMarker)
 * - Zero audit info (证据链/自我审查/技术论证) — narrative.json has none
 */

import * as fs from 'fs';
import * as path from 'path';
import { openPrismDb } from './db.js';
import { drillDownMarker } from './tools.js';
import type { DrillDownNode } from './tools.js';
import type { NarrativeReport, NarrativeItem, VisualAsset } from './narrative-types.js';

// ─────────────────────── Verdict numeric metrics shape ───────────────────────

interface Verdict {
  runId?: string;
  rating?: string;
  frameBudgetMs?: number;
  observedP50Ms?: number;
  observedP95Ms?: number;
  observedP99Ms?: number;
  observedMaxMs?: number;
  observedMaxFrameIndex?: number;
  pctFramesOverBudget?: number;
}

// ─────────────────────── Tiny helpers ───────────────────────

function htmlEsc(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function num(v: unknown, digits = 1): string {
  if (typeof v === 'number' && isFinite(v)) return v.toFixed(digits);
  return '—';
}

// ─────────────────────── Minimal markdown renderer (WT-030) ───────────────────────
// 支持 5 类 token：GFM 表格 / 代码围栏 / 粗体 / 行内代码 / 换行。
// 不引入 markdown 库（marked/markdown-it 等都不引），手写最小解析器。
// 复杂 markdown（标题 # / 列表 - / 链接 []() / 图片 ![]()）降级为纯文本，不报错。
// 先 htmlEsc 再解析 token，避免 XSS（narrative.json 是 LLM 产的，内容不可信）。

/**
 * 把已经 htmlEsc 过的单元格文本做行内 token 解析（粗体 / 行内代码）。
 * 不解析表格/代码围栏/换行（这些是块级 token，由 renderMarkdownLite 处理）。
 */
export function renderInlineMarkdown(s: string): string {
  // 行内代码 `x` → <code>x</code>（先处理代码，避免代码内的 ** 被解析成粗体）
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '`') {
      // 找下一个反引号
      const end = s.indexOf('`', i + 1);
      if (end === -1) {
        out += ch;
        i++;
        continue;
      }
      const code = s.slice(i + 1, end);
      out += `<code>${code}</code>`;
      i = end + 1;
      continue;
    }
    if (ch === '*' && s[i + 1] === '*') {
      // 粗体 **x** → <strong>x</strong>
      const end = s.indexOf('**', i + 2);
      if (end === -1) {
        out += ch;
        i++;
        continue;
      }
      const inner = s.slice(i + 2, end);
      out += `<strong>${renderInlineMarkdown(inner)}</strong>`;
      i = end + 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** 判断一行是否是 GFM 表格的分隔行（|---|---| 形式） */
function isTableSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  // 去掉首尾 | 后，每段应全是 -、:、空格
  const inner = trimmed.replace(/^\|/, '').replace(/\|$/, '').trim();
  if (inner === '') return false;
  const cells = inner.split('|');
  if (cells.length === 0) return false;
  return cells.every(c => /^\s*:?-+:?\s*$/.test(c));
}

/** 判断一行是否是表格行（含 | 且不是分隔行） */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  if (isTableSeparatorRow(line)) return false;
  // 至少有一个 | 把行分成 >=2 段
  return trimmed.split('|').filter(s => s.trim() !== '' || true).length >= 2;
}

/** 解析表格行（去首尾 |，按 | 分列，trim 每格） */
function parseTableRow(line: string): string[] {
  let trimmed = line.trim();
  // 去掉首尾的 |（如果有）
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map(c => c.trim());
}

/**
 * 把一段 markdown 文本渲染成 HTML 片段（不含外层 <p>）。
 *
 * 流程：
 *   1. 先 htmlEsc 整个文本（XSS 防护）
 *   2. 按代码围栏 ``` 切段（代码优先，围栏内的 | 不解析为表格）
 *   3. 在非代码段里按连续表格行切块（表格优先，表格外才做行内 token）
 *   4. 行内 token（粗体 / 行内代码）最后处理
 */
export function renderMarkdownLite(md: string): string {
  if (!md) return '';

  // Step 1: htmlEsc 整个文本
  const escaped = htmlEsc(md);

  // Step 2: 按代码围栏切段
  const fenceRe = /```[^\n]*\n?[\s\S]*?```/g;
  const segments: { type: 'code' | 'text'; content: string }[] = [];
  let lastIdx = 0;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fenceRe.exec(escaped)) !== null) {
    if (fenceMatch.index > lastIdx) {
      segments.push({ type: 'text', content: escaped.slice(lastIdx, fenceMatch.index) });
    }
    segments.push({ type: 'code', content: fenceMatch[0] });
    lastIdx = fenceMatch.index + fenceMatch[0].length;
  }
  if (lastIdx < escaped.length) {
    segments.push({ type: 'text', content: escaped.slice(lastIdx) });
  }

  const blocks: string[] = [];

  for (const seg of segments) {
    if (seg.type === 'code') {
      // 代码围栏：```lang\ncode\n``` → <pre><code>code</code></pre>
      // 去掉开头的 ```lang 和结尾的 ```
      let content = seg.content;
      // 去掉开头 ``` 和可选语言标识
      content = content.replace(/^```[^\n]*\n?/, '');
      content = content.replace(/```$/, '');
      // content 已经 htmlEsc 过（整个 escaped 已 esc），直接放 <pre><code>
      blocks.push(`<pre><code>${content}</code></pre>`);
      continue;
    }

    // 文本段：按行扫描，识别表格块
    const lines = seg.content.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // 检测表格块：连续的表格行 + 分隔行
      if (isTableRow(line)) {
        // 看下面是否紧跟分隔行 + 数据行
        // 标准 GFM 表格：表头行 + 分隔行 + 数据行+
        if (i + 1 < lines.length && isTableSeparatorRow(lines[i + 1])) {
          // 完整表格：收集表头 + 分隔行 + 后续数据行
          const headerCells = parseTableRow(line);
          let j = i + 2;
          const dataRows: string[][] = [];
          while (j < lines.length && isTableRow(lines[j])) {
            dataRows.push(parseTableRow(lines[j]));
            j++;
          }
          // 渲染表格
          const thead = `<thead><tr>${headerCells.map(c => `<th>${renderInlineMarkdown(c)}</th>`).join('')}</tr></thead>`;
          const tbody = dataRows.length
            ? `<tbody>${dataRows.map(row => `<tr>${row.map(c => `<td>${renderInlineMarkdown(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
            : '';
          blocks.push(`<table>${thead}${tbody}</table>`);
          i = j;
          continue;
        }
        // 不是完整表格（无分隔行）→ 当普通文本行处理（降级）
      }

      // 普通文本行：行内 token + 换行
      // 空行不渲染（避免连续 <br>）
      if (line.trim() === '') {
        i++;
        continue;
      }
      blocks.push(renderInlineMarkdown(line) + '<br>');
      i++;
    }
  }

  // 拼接所有块，去掉末尾多余的 <br>
  let result = blocks.join('\n');
  result = result.replace(/(<br>)\s*$/,'');
  return result;
}

/** Category color from marker name (Unity Timeline palette). */
function categoryColor(markerName: string): { bg: string; border: string; text: string } {
  const n = markerName.toLowerCase();
  if (/gc\.|collect|alloc|garbage/.test(n))
    return { bg: '#f443361a', border: '#f44336', text: '#ff7961' };
  if (/wait|semaphore|idle|sync|present/.test(n))
    return { bg: '#9e9e9e1a', border: '#757575', text: '#bdbdbd' };
  if (/render|urp|gfx|draw|mesh|vr|blit|shadow|depth|pass|camera/.test(n))
    return { bg: '#4caf501a', border: '#4caf50', text: '#81c784' };
  if (/update|mgr|manager|cs:|lua|script|behaviour|mono/.test(n))
    return { bg: '#2196f31a', border: '#2196f3', text: '#64b5f6' };
  if (/job|worker|burst|thread|batch/.test(n))
    return { bg: '#9c27b01a', border: '#9c27b0', text: '#ce93d8' };
  if (/network|server|ntf|msg|socket|tserver/.test(n))
    return { bg: '#0096881a', border: '#009688', text: '#4db6ac' };
  return { bg: '#78909c1a', border: '#546e7a', text: '#90a4ae' };
}

const SEV_CN: Record<string, string> = {
  critical: '严重', high: '高', medium: '中', low: '低', info: '信息',
};
const SEV_COLOR: Record<string, { dot: string; badge: string }> = {
  critical: { dot: '#f44336', badge: '#f4433620' },
  high:     { dot: '#ff9800', badge: '#ff980020' },
  medium:   { dot: '#ffc107', badge: '#ffc10720' },
  low:      { dot: '#4caf50', badge: '#4caf5020' },
  info:     { dot: '#2196f3', badge: '#2196f320' },
};
const KIND_CN: Record<string, string> = {
  '稳态大头': '稳态大头', '高频尖峰': '高频尖峰', '低频尖峰': '低频尖峰',
};
const RATING_MAP: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  excellent: { emoji: '🟢', label: '优秀',  color: '#4caf50', bg: '#4caf5020' },
  pass:      { emoji: '🟢', label: '及格',  color: '#8bc34a', bg: '#8bc34a20' },
  weak:      { emoji: '🟡', label: '偏弱',  color: '#ffc107', bg: '#ffc10720' },
  fail:      { emoji: '🔴', label: '不合格', color: '#f44336', bg: '#f4433620' },
};

function sevStyle(sev: string): { dot: string; badge: string } {
  return SEV_COLOR[sev] ?? { dot: '#9e9e9e', badge: '#9e9e9e20' };
}

/** Theme-group accent colors — cycle by section index, not by heading name. */
const SECTION_GROUP_COLORS = [
  { border: '#2196f3', bg: '#2196f318' },
  { border: '#ff9800', bg: '#ff980018' },
  { border: '#9c27b0', bg: '#9c27b018' },
  { border: '#78909c', bg: '#78909c18' },
  { border: '#4caf50', bg: '#4caf5018' },
  { border: '#009688', bg: '#00968818' },
];

function sectionGroupColor(index: number): { border: string; bg: string } {
  return SECTION_GROUP_COLORS[index % SECTION_GROUP_COLORS.length];
}

// ─────────────────────── Call-tree rendering ───────────────────────

function renderTreeHTML(node: DrillDownNode, rootMs: number, depth: number): string {
  const totalMs = node.totalMsPerFrame;
  const widthPct = rootMs > 0 ? Math.max(1, (totalMs / rootMs) * 100) : 100;
  const col = categoryColor(node.name);
  const indent = depth * 20;

  const displayMs =
    node.selfMsPerFrame > 0 && node.selfMsPerFrame < totalMs
      ? `${totalMs.toFixed(2)}ms (self ${node.selfMsPerFrame.toFixed(2)}ms)`
      : `${totalMs.toFixed(2)}ms`;
  const pctStr = (node.pctOfRoot * 100).toFixed(1);

  // WT-033: 节点红线/涨幅/严重度标注（从 findings 注入，render 只呈现不判定）
  let annotationHTML = '';
  if (node.redlineFlag) {
    annotationHTML += `<span class="tree-redline" title="${htmlEsc(node.redlineFlag)}">🔴 ${htmlEsc(node.redlineFlag)}</span>`;
  }
  if (node.foldChange) {
    annotationHTML += `<span class="tree-fold" title="涨幅 ${htmlEsc(node.foldChange)}">📈 ${htmlEsc(node.foldChange)}</span>`;
  }
  // severityTag 通过 data-sev 属性 + CSS 左边框色体现（不额外加文字标注，避免冗余）
  const sevAttr = node.severityTag ? `data-sev="${htmlEsc(node.severityTag)}"` : '';

  let html = `
  <div class="tree-row" style="--tree-indent:${indent}px;--tree-width:${widthPct.toFixed(1)}%;--tree-bg:${col.bg};--tree-border:${col.border};">
    <div class="tree-bar" ${sevAttr}>
      <span class="tree-fill" aria-hidden="true"></span>
      <span class="tree-label" style="color:${col.text}" title="${htmlEsc(node.name)}">${htmlEsc(node.name)}</span>
      <span class="tree-ms">${htmlEsc(displayMs)}</span>
      <span class="tree-pct">${pctStr}%</span>
      ${annotationHTML}
    </div>
  </div>`;

  for (const child of node.children ?? []) {
    html += renderTreeHTML(child, rootMs, depth + 1);
  }
  return html;
}

const TREE_LEGEND = `
  <span class="legend-item" style="color:#81c784">■ 渲染</span>
  <span class="legend-item" style="color:#64b5f6">■ 脚本</span>
  <span class="legend-item" style="color:#ff7961">■ GC/内存</span>
  <span class="legend-item" style="color:#bdbdbd">■ 等待</span>
  <span class="legend-item" style="color:#ce93d8">■ Job</span>
  <span class="legend-item" style="color:#4db6ac">■ 网络</span>`;

// ─────────────────────── Visual asset rendering (WT-036) ───────────────────────
// 视觉资产从顶层字段移到 NarrativeItem.visualAsset，render 按 type 渲染。
// 通用类型：table（表格）/ ascii（ASCII 图）/ matrix（矩阵，按 levelColumn 上色）。
// 不硬编码 perfetto 特有字段名（metaInfo/threadOverview/throttlingMatrix/redlineMatrix）。

/** 矩阵判定档颜色（confirmed/likely/suspected 三档，通用） */
function matrixLevelClass(level: string): string {
  const l = String(level).toLowerCase();
  if (l === 'confirmed') return 'tm-confirmed';
  if (l === 'likely') return 'tm-likely';
  return 'tm-suspected';
}

/** 渲染视觉资产（WT-036：item.visualAsset，按 type 渲染） */
function renderVisualAsset(asset: VisualAsset): string {
  if (asset.type === 'ascii') {
    const content = asset.ascii?.content ?? '';
    if (!content) return '';
    return `<div class="ascii-art-block">
      <div class="ascii-art-title">${htmlEsc(asset.title)}</div>
      <pre class="ascii-art-content">${htmlEsc(content)}</pre>
      ${asset.ascii?.caption ? `<div class="ascii-art-caption">${htmlEsc(asset.ascii.caption)}</div>` : ''}
    </div>`;
  }

  // table 或 matrix：都渲染成 <table>，matrix 按 levelColumn 上色
  const table = asset.table;
  if (!table || !Array.isArray(table.headers) || table.headers.length === 0) return '';

  const levelColIdx = asset.type === 'matrix' && asset.levelColumn
    ? table.headers.findIndex(h => h === asset.levelColumn)
    : -1;

  const headerHTML = `<thead><tr>${table.headers.map(h => `<th>${htmlEsc(h)}</th>`).join('')}</tr></thead>`;
  const bodyHTML = `<tbody>${table.rows.map(row => {
    const cells = Array.isArray(row) ? row : [];
    // matrix 行按 levelColumn 的值上色
    const levelVal = levelColIdx >= 0 ? String(cells[levelColIdx] ?? '') : '';
    const rowClass = asset.type === 'matrix' && levelVal ? matrixLevelClass(levelVal) : '';
    const cellsHTML = table.headers.map((_, i) => `<td>${htmlEsc(String(cells[i] ?? '—'))}</td>`).join('');
    return `<tr${rowClass ? ` class="${rowClass}"` : ''}>${cellsHTML}</tr>`;
  }).join('')}</tbody>`;

  return `<div class="visual-asset-block">
    <div class="visual-asset-title">${htmlEsc(asset.title)}</div>
    <table class="asset-table${asset.type === 'matrix' ? ' matrix-table' : ''}">${headerHTML}${bodyHTML}</table>
  </div>`;
}

// ─────────────────────── Narrative item card ───────────────────────

function renderItemCard(item: NarrativeItem, tree: DrillDownNode | null | undefined): string {
  const sc = sevStyle(item.severity);

  // Flame-bar tree (or fallback note)
  let treeSection = '';
  if (tree) {
    const rootMs = tree.totalMsPerFrame;
    treeSection = `
    <div class="tree-section">
      <div class="tree-header">
        <span class="tree-title">调用树（per-frame avg）</span>
        <span class="tree-legend">${TREE_LEGEND}</span>
      </div>
      <div class="tree-container">
        ${renderTreeHTML(tree, rootMs, 0)}
      </div>
    </div>`;
  } else if (item.callTree?.note) {
    treeSection = `
    <div class="tree-section fallback">
      <div class="tree-header"><span class="tree-title">调用树备注</span></div>
      <div class="tree-note">${htmlEsc(item.callTree.note)}</div>
    </div>`;
  }

  // WT-036: 视觉资产渲染在 narrative 下方、callTree 上方（item.visualAsset，不是顶层字段）
  const visualAssetHTML = item.visualAsset ? renderVisualAsset(item.visualAsset) : '';

  // sourceInsight callout（保持 htmlEsc + <br>——它是代码片段，不需要表格）
  const insightSection = item.sourceInsight
    ? `<div class="source-insight"><span class="insight-label">源码归因</span>${htmlEsc(item.sourceInsight).replace(/\n/g, '<br>')}</div>`
    : '';

  // Recommendations numbered list
  const recs = Array.isArray(item.recommendations) ? item.recommendations : [];
  const recsHTML = recs.length
    ? `<div class="rec-section">
        <div class="rec-label">优化建议</div>
        <ol class="rec-list">${recs.map(r => `<li>${htmlEsc(r)}</li>`).join('')}</ol>
      </div>`
    : '';

  return `
  <div class="item-card">
    <div class="item-header">
      <span class="sev-dot" style="background:${sc.dot}" title="${SEV_CN[item.severity] ?? item.severity}"></span>
      <span class="item-title">${htmlEsc(item.title)}</span>
      <span class="chip sev-chip" style="color:${sc.dot};background:${sc.badge}">${SEV_CN[item.severity] ?? item.severity}</span>
    </div>
    <div class="item-body">
      <p class="narrative-text">${renderMarkdownLite(item.narrative)}</p>
      ${visualAssetHTML}
      ${treeSection}
      ${insightSection}
      ${recsHTML}
    </div>
  </div>`;
}

// ─────────────────────── Main HTML builder ───────────────────────

interface RenderOptions {
  narrative: NarrativeReport;
  verdict: Verdict | null;
  treesByItemKey: Map<string, DrillDownNode | null>;
}

function renderHTML(opts: RenderOptions): string {
  const { narrative, verdict, treesByItemKey } = opts;
  // WT-032: treesByKey 现在含 section items（key=<heading>::<i>）+ topConclusions（key=tc::<rank>）
  const treesByKey = treesByItemKey;

  const ratingInfo = RATING_MAP[narrative.rating] ?? { emoji: '—', label: narrative.rating ?? '—', color: '#9e9e9e', bg: '#9e9e9e20' };

  // ── Metrics strip ──
  const budget = verdict?.frameBudgetMs ?? null;
  const fps = budget ? Math.round(1000 / budget) : null;
  const metrics = [
    { label: '帧预算',  value: budget ? `${num(budget)}ms / ${fps}fps` : '—' },
    { label: 'P50',    value: verdict?.observedP50Ms != null ? `${num(verdict.observedP50Ms)}ms` : '—' },
    { label: 'P95',    value: verdict?.observedP95Ms != null ? `${num(verdict.observedP95Ms)}ms` : '—' },
    { label: 'P99',    value: verdict?.observedP99Ms != null ? `${num(verdict.observedP99Ms)}ms` : '—' },
    { label: '最差帧', value: verdict?.observedMaxMs != null
        ? (verdict.observedMaxFrameIndex != null
          ? `${num(verdict.observedMaxMs)}ms (#${verdict.observedMaxFrameIndex})`
          : `${num(verdict.observedMaxMs)}ms`)
        : '—' },
    { label: '超预算%', value: verdict?.pctFramesOverBudget != null ? `${num(verdict.pctFramesOverBudget)}%` : '—' },
  ];
  const metricsHTML = metrics.map(m => `
  <div class="metric-box">
    <div class="metric-label">${htmlEsc(m.label)}</div>
    <div class="metric-value">${htmlEsc(m.value)}</div>
  </div>`).join('');

  // ── § 核心结论 table ──
  // WT-032: critical/high 的 topConclusion 行下挂 callTree 或 asciiArt（v5.3 §0 标杆：每条结论配图）
  const conclusionsHTML = narrative.topConclusions.map(row => {
    const sc = sevStyle(row.severity);
    // 查这行结论的 callTree（key=tc::rank，由 requeryTrees 收集）
    const tree = treesByKey.get(`tc::${row.rank}`);
    let extraHTML = '';
    if (tree) {
      const rootMs = tree.totalMsPerFrame;
      extraHTML = `<tr><td colspan="5"><div class="tc-tree-section">
        <div class="tree-header">
          <span class="tree-title">调用树（per-frame avg）</span>
          <span class="tree-legend">${TREE_LEGEND}</span>
        </div>
        <div class="tree-container">${renderTreeHTML(tree, rootMs, 0)}</div>
      </div></td></tr>`;
    } else if (row.asciiArt) {
      // LLM 产的 ASCII 图，原样渲染在 <pre> 块
      extraHTML = `<tr><td colspan="5"><div class="tc-ascii-section">
        <div class="ascii-art-title">${htmlEsc(row.asciiArt.title)}</div>
        <pre class="ascii-art-content">${htmlEsc(row.asciiArt.content)}</pre>
        ${row.asciiArt.caption ? `<div class="ascii-art-caption">${htmlEsc(row.asciiArt.caption)}</div>` : ''}
      </div></td></tr>`;
    }
    return `<tr>
      <td class="tc-rank">${row.rank}</td>
      <td class="tc-problem">${htmlEsc(row.problem)}</td>
      <td class="tc-kind">${htmlEsc(KIND_CN[row.kind] ?? row.kind)}</td>
      <td class="tc-contribution">${htmlEsc(row.contribution)}</td>
      <td class="tc-severity"><span class="chip sev-chip" style="color:${sc.dot};background:${sc.badge}">${SEV_CN[row.severity] ?? row.severity}</span></td>
    </tr>${extraHTML}`;
  }).join('');

  // ── ruledOut strip ──
  const ruledOutHTML = (narrative.ruledOut ?? []).length
    ? `<div class="ruled-out-strip">
        <span class="ruled-out-label">已排除</span>
        ${narrative.ruledOut!.map(r => `<span class="ruled-out-item" title="${htmlEsc(r.why)}">${htmlEsc(r.name)}: <em>${htmlEsc(r.why)}</em></span>`).join('')}
      </div>`
    : '';

  // ── 视觉资产（WT-036：从顶层字段移到 section item.visualAsset，不再独立渲染） ──
  // 视觉资产现在挂在 NarrativeItem.visualAsset 里，由 renderItemCard 内部渲染。
  // 顶层不再有 metaInfo/threadOverview/throttlingMatrix/redlineMatrix/asciiArt 字段（perfetto 特有字段已删）。

  // ── TOC anchors ──
  const tocItems = [
    { label: '核心结论', id: 'sec-core-conclusions' },
    ...narrative.sections.map((sec, i) => ({ label: sec.heading, id: `sec-section-${i}` })),
    { label: '优化优先级', id: 'sec-priority' },
  ];
  const tocHTML = `
<div class="toc-block">
  <div class="toc-title">目录</div>
  <ul class="toc-list">
    ${tocItems.map(item => `<li><a href="#${item.id}">${htmlEsc(item.label)}</a></li>`).join('')}
  </ul>
</div>`;

  // ── § sections ──
  // WT-036: 视觉资产在 item.visualAsset 里（由 renderItemCard 渲染），section 级不再关联视觉资产
  const sectionsHTML = narrative.sections.map((sec, secIdx) => {
    const gc = sectionGroupColor(secIdx);
    const introHTML = sec.intro
      ? `<p class="section-intro">${renderMarkdownLite(sec.intro)}</p>`
      : '';

    // WT-036: 视觉资产在 item.visualAsset 里，由 renderItemCard 渲染，section 级不再关联视觉资产
    const itemsHTML = sec.items.map((item, i) => {
      const key = `${sec.heading}::${i}`;
      const tree = treesByItemKey.get(key);
      return renderItemCard(item, tree);
    }).join('');
    return `
  <div class="narrative-section">
    <div class="section-heading" id="sec-section-${secIdx}" style="border-left:4px solid ${gc.border};background:${gc.bg}">
      ${htmlEsc(sec.heading)}
    </div>
    ${introHTML}
    <div class="items-list">${itemsHTML}</div>
  </div>`;
  }).join('');

  // ── § 优化优先级 ──
  const priorityHTML = narrative.prioritySummary.map(row => {
    const isP0 = row.priority === 'P0';
    return `<tr class="${isP0 ? 'priority-p0' : ''}">
      <td class="pri-priority">${htmlEsc(row.priority)}</td>
      <td class="pri-action">${htmlEsc(row.action)}</td>
      <td class="pri-benefit">${htmlEsc(row.benefit)}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Prism 性能报告 · ${htmlEsc(narrative.runId)}</title>
<style>
:root {
  --bg: #0f0f1a;
  --surface: #1a1a2e;
  --surface2: #16213e;
  --surface3: #0f3460;
  --border: #2a2a4a;
  --text: #e0e0e0;
  --text-muted: #888;
  --accent: #7c4dff;
  --accent2: #00e5ff;
  --font-mono: 'Consolas', 'Courier New', monospace;
  --font-ui: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --radius: 8px;
  --radius-sm: 4px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.6;
  padding: 28px 32px;
  min-height: 100vh;
  max-width: 1200px;
  margin: 0 auto;
}
a { color: var(--accent2); }

/* ── Header ── */
.page-header {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.header-left { flex: 1; min-width: 200px; }
.report-title {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 6px;
  letter-spacing: -0.01em;
}
.run-id {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-muted);
}
.rating-badge {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 22px;
  border-radius: var(--radius);
  border: 1px solid;
  flex-shrink: 0;
}
.rating-emoji { font-size: 26px; line-height: 1; }
.rating-label { font-size: 22px; font-weight: 700; letter-spacing: 0.02em; }

/* Overview lead paragraph */
.overview-block {
  font-size: 15px;
  color: #c5cae9;
  line-height: 1.75;
  margin: 0 0 20px;
  padding: 16px 18px;
  background: var(--surface);
  border-left: 4px solid var(--accent);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  max-width: 960px;
}

/* Metrics strip */
.metrics-strip {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 32px;
}
.metric-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 10px 18px;
  min-width: 110px;
  text-align: center;
}
.metric-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.metric-value {
  font-size: 16px;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--accent2);
}

/* ── Table of contents ── */
.toc-block {
  margin-bottom: 28px;
  padding: 14px 18px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  max-width: 960px;
}
.toc-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 10px;
}
.toc-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.toc-list a {
  color: var(--accent2);
  text-decoration: none;
  font-size: 13.5px;
  line-height: 1.4;
}
.toc-list a:hover { text-decoration: underline; }

/* ── Section headers ── */
.section-title {
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  margin: 36px 0 14px;
  display: flex;
  align-items: center;
  gap: 10px;
}
.section-title::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 20px;
  background: var(--accent);
  border-radius: 2px;
  flex-shrink: 0;
}

/* ── Top conclusions table ── */
.top-conclusions {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
  font-size: 13.5px;
}
.top-conclusions th {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 2px solid var(--border);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  background: var(--surface2);
}
.top-conclusions td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
  background: var(--surface);
}
.top-conclusions tr:last-child td { border-bottom: none; }
.tc-rank { color: var(--accent); font-weight: 700; width: 36px; text-align: center; }
.tc-problem { font-weight: 600; color: #e8eaf6; }
.tc-kind { color: #90a4ae; white-space: nowrap; }
.tc-contribution { color: #b0bec5; }
.tc-severity { white-space: nowrap; }

/* WT-032: topConclusions 行下挂的 callTree / asciiArt 容器 */
.tc-tree-section {
  padding: 0 !important;
  background: #080d14;
  border-left: 3px solid var(--border);
}
.tc-tree-section .tree-container { padding: 10px 12px; }
.tc-tree-section .tree-header {
  padding: 8px 12px;
  background: #0f1b2d;
  border-bottom: 1px solid var(--border);
}
.tc-ascii-section {
  padding: 10px 14px !important;
  background: #080d14;
  border-left: 3px solid var(--accent2);
}
.tc-ascii-section .ascii-art-content { margin: 0; }
.tc-ascii-section .ascii-art-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent2);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── Ruled-out strip ── */
.ruled-out-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  padding: 10px 14px;
  background: #12181e;
  border: 1px solid #1e2a3a;
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
}
.ruled-out-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #546e7a;
  white-space: nowrap;
  margin-right: 4px;
}
.ruled-out-item {
  font-size: 12.5px;
  color: #607d8b;
}
.ruled-out-item em { color: #546e7a; font-style: normal; }

/* ── Narrative section ── */
.narrative-section {
  margin-bottom: 32px;
}
.section-heading {
  font-size: 16px;
  font-weight: 700;
  color: #e8eaf6;
  margin: 24px 0 10px;
  padding: 10px 12px 10px 14px;
  border-bottom: 1px solid var(--border);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}
.section-intro {
  color: #90a4ae;
  font-size: 13.5px;
  line-height: 1.7;
  margin-bottom: 14px;
  padding: 10px 14px;
  background: var(--surface2);
  border-radius: var(--radius-sm);
  border-left: 3px solid #37474f;
}
.items-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ── Item card ── */
.item-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.item-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--surface2);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.sev-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.item-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  flex: 1;
  min-width: 200px;
}
.chip {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 12px;
  font-weight: 500;
  flex-shrink: 0;
}
.item-body { padding: 14px 16px; }
.narrative-text {
  color: #cfd8dc;
  line-height: 1.75;
  margin-bottom: 14px;
  font-size: 13.5px;
}

/* ── Tree visualization ── */
.tree-section {
  margin: 14px 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.tree-section.fallback { border-color: #37474f; }
.tree-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #0f1b2d;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
  gap: 8px;
}
.tree-title {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent2);
}
.tree-legend { display: flex; gap: 10px; flex-wrap: wrap; }
.legend-item { font-size: 11px; }
.tree-container {
  padding: 10px 12px;
  background: #080d14;
  overflow-x: auto;
  --tree-full-width: 1080px;
}
.tree-note {
  padding: 10px 14px;
  font-size: 13px;
  color: #78909c;
  background: #080d14;
  font-style: italic;
}
.tree-row {
  margin-bottom: 4px;
  margin-left: var(--tree-indent);
  min-width: calc(var(--tree-full-width) - var(--tree-indent));
}
.tree-bar {
  position: relative;
  display: grid;
  grid-template-columns: minmax(360px, 1fr) auto auto;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-left: 3px solid var(--tree-border);
  border-radius: 3px;
  min-width: 520px;
  width: calc(var(--tree-full-width) - var(--tree-indent));
  overflow: visible;
  cursor: default;
  transition: filter 0.12s;
}
.tree-fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--tree-width);
  min-width: 8px;
  max-width: 100%;
  border-radius: 3px;
  background: var(--tree-bg);
  pointer-events: none;
}
.tree-bar:hover { filter: brightness(1.2); }
.tree-label,
.tree-ms,
.tree-pct {
  position: relative;
  z-index: 1;
}
.tree-label {
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: nowrap;
  overflow: visible;
  text-overflow: clip;
  min-width: 0;
}
.tree-ms {
  font-family: var(--font-mono);
  font-size: 12px;
  color: #e0e0e0;
  white-space: nowrap;
  flex-shrink: 0;
}
.tree-pct {
  font-family: var(--font-mono);
  font-size: 11px;
  color: #888;
  white-space: nowrap;
  flex-shrink: 0;
}

/* WT-033: callTree 节点红线/涨幅/严重度标注 */
.tree-redline {
  color: #ff7961;
  font-size: 11px;
  font-weight: 600;
  margin-left: 8px;
  white-space: nowrap;
  flex-shrink: 0;
}
.tree-fold {
  color: #ffb74d;
  font-size: 11px;
  font-weight: 600;
  margin-left: 8px;
  white-space: nowrap;
  flex-shrink: 0;
}
/* severityTag 通过 tree-bar 的 data-sev 属性 + CSS 左边框色体现 */
.tree-bar[data-sev="critical"] { border-left-color: #f44336 !important; box-shadow: inset 3px 0 0 #f44336; }
.tree-bar[data-sev="high"]     { border-left-color: #ff9800 !important; box-shadow: inset 3px 0 0 #ff9800; }
.tree-bar[data-sev="medium"]   { border-left-color: #ffc107 !important; }
.tree-bar[data-sev="low"]      { border-left-color: #4caf50 !important; }
.tree-bar[data-sev="healthy"]  { border-left-color: #4caf50 !important; }

/* ── Source insight callout ── */
.source-insight {
  margin: 12px 0;
  padding: 10px 14px;
  background: #0a1628;
  border: 1px solid #1e3050;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: #90caf9;
  line-height: 1.65;
  font-family: var(--font-mono);
}
.insight-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #42a5f5;
  margin-bottom: 6px;
  font-family: var(--font-ui);
}

/* ── Recommendations ── */
.rec-section { margin: 12px 0; }
.rec-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #7986cb;
  margin-bottom: 8px;
}
.rec-list {
  padding-left: 22px;
  color: #b0bec5;
  line-height: 1.8;
}
.rec-list li { margin-bottom: 4px; font-size: 13.5px; }

/* ── Priority table ── */
.priority-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13.5px;
}
.priority-table th {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 2px solid var(--border);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  background: var(--surface2);
}
.priority-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  vertical-align: top;
}
.priority-table tr:last-child td { border-bottom: none; }
.priority-p0 td { background: #1a1020; border-left: 3px solid #f44336; }
.pri-priority { font-weight: 700; color: var(--accent2); width: 60px; }
.pri-action { color: #e8eaf6; }
.pri-benefit { color: #90a4ae; }

/* ── 可选视觉资产（DR-45 §1.3，WT-036 移到 item.visualAsset）── */
.asset-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
  font-size: 13px;
  table-layout: fixed;   /* WT-036: 防长内容撑超框 */
  word-break: break-word; /* WT-036: 长文本自动换行 */
}
.asset-table th {
  text-align: left;
  padding: 8px 12px;
  border-bottom: 2px solid var(--border);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  background: var(--surface2);
  word-break: break-word;
}
.asset-table td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  vertical-align: top;
  word-break: break-word;
}
.asset-table tr:last-child td { border-bottom: none; }
.asset-label { color: var(--text-muted); font-weight: 600; white-space: nowrap; width: 140px; }
.asset-value { color: #e0e0e0; font-family: var(--font-mono); }
.ao-thread { font-weight: 600; color: #e8eaf6; white-space: nowrap; }

/* WT-036: visual-asset-block（item.visualAsset 渲染容器） */
.visual-asset-block {
  margin: 12px 0 16px 0;
}
.visual-asset-title {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 6px;
  font-weight: 600;
}

/* 降频判定矩阵：confirmed/likely/suspected 三档配色 */
.tm-confirmed td { background: #1a1020; }
.tm-confirmed .tm-level { color: #f44336; font-weight: 700; }
.tm-likely td { background: #1a1a1020; }
.tm-likely .tm-level { color: #ff9800; font-weight: 700; }
.tm-suspected td { background: var(--surface); }
.tm-suspected .tm-level { color: #ffc107; font-weight: 700; }

/* 红线矩阵 */
.rm-module { font-weight: 600; color: #ff7961; }

/* ASCII 图块（LLM 产文本，render 原样渲染在等宽 <pre>） */
.ascii-art-block {
  margin: 14px 0 20px;
  padding: 14px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  border-left: 4px solid var(--accent2);
}
.ascii-art-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--accent2);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ascii-art-content {
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.45;
  color: #cfd8dc;
  background: #080d14;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  white-space: pre;
  margin: 0;
}
.ascii-art-caption {
  margin-top: 8px;
  font-size: 12.5px;
  color: var(--text-muted);
  font-style: italic;
}

/* ── Footer ── */
.page-footer {
  margin-top: 48px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
  color: var(--text-muted);
  font-size: 12px;
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}
.footer-item { display: flex; gap: 6px; align-items: center; }
.footer-label { color: #546e7a; }
.muted { color: var(--text-muted); font-style: italic; }
</style>
</head>
<body>

<!-- ═══════════════════ Header ═══════════════════ -->
<div class="page-header">
  <div class="header-left">
    <div class="report-title">Prism 性能分析报告</div>
    <div class="run-id">${htmlEsc(narrative.runId)}</div>
  </div>
  <div class="rating-badge" style="color:${ratingInfo.color};background:${ratingInfo.bg};border-color:${ratingInfo.color}40">
    <div class="rating-emoji">${ratingInfo.emoji}</div>
    <div class="rating-label" style="color:${ratingInfo.color}">${htmlEsc(ratingInfo.label)}</div>
  </div>
</div>

<!-- Overview lead -->
<div class="overview-block">${renderMarkdownLite(narrative.overview)}</div>

<!-- ═══════════════════ Metrics strip ═══════════════════ -->
<div class="metrics-strip">
${metricsHTML}
</div>

<!-- ═══════════════════ TOC ═══════════════════ -->
${tocHTML}

<!-- ═══════════════════ § 核心结论 ═══════════════════ -->
<div class="section-title" id="sec-core-conclusions">核心结论</div>
<table class="top-conclusions">
  <thead>
    <tr>
      <th>#</th><th>问题</th><th>类型</th><th>对整体贡献</th><th>严重度</th>
    </tr>
  </thead>
  <tbody>
    ${conclusionsHTML || '<tr><td colspan="5" class="muted">（暂无结论行）</td></tr>'}
  </tbody>
</table>
${ruledOutHTML}

<!-- ═══════════════════ § 主题分群（视觉资产在 item.visualAsset 里，由 renderItemCard 渲染） ═══════════════════ -->
<div class="section-title">主题分群</div>
${sectionsHTML || '<p class="muted">（暂无分群内容）</p>'}

<!-- ═══════════════════ § 优化优先级 ═══════════════════ -->
<div class="section-title" id="sec-priority">优化优先级</div>
<table class="priority-table">
  <thead>
    <tr><th>优先级</th><th>动作</th><th>收益</th></tr>
  </thead>
  <tbody>
    ${priorityHTML || '<tr><td colspan="3" class="muted">（暂无优先级行）</td></tr>'}
  </tbody>
</table>

<!-- ═══════════════════ Footer ═══════════════════ -->
<div class="page-footer">
  <span class="footer-item"><span class="footer-label">runId</span>${htmlEsc(narrative.runId)}</span>
  <span class="footer-item"><span class="footer-label">生成时间</span>${new Date().toLocaleString('zh-CN')}</span>
  <span class="footer-item"><span class="footer-label">生成工具</span>Prism render-html (deterministic)</span>
</div>

</body>
</html>`;
}

// ─────────────────────── Re-query call trees ───────────────────────

/**
 * 判断 narrative 是否来自 perfetto 源。
 * perfetto runId 形如 "bk26b-perfetto-triad/2026-07-15_10-36-27"（含 perfetto）。
 */
function isPerfettoSource(narrative: NarrativeReport): boolean {
  return /perfetto/i.test(narrative.runId);
}

/**
 * perfetto callTree 节点（来自 perfetto-profile-summary.json）的松散结构。
 * 字段：name/totalMs/totalPct/count/layer/children。
 */
interface PerfettoNode {
  name: string;
  totalMs?: number;
  totalPct?: number;
  count?: number;
  layer?: string;
  children?: PerfettoNode[];
}

// ─── WT-033: callTree 节点标注（从 findings.json 的 evidence.resultDigest.callTreeAnnotations 注入） ───

/** explore LLM 在 finding 的 evidence.resultDigest.callTreeAnnotations 里产的结构化标注 */
interface CallTreeAnnotation {
  nodeName: string;
  redlineFlag?: string | null;
  foldChange?: string | null;
  severityTag?: 'critical' | 'high' | 'medium' | 'low' | 'healthy' | null;
}

/**
 * 从 findings.json 读所有 finding 的 evidence.resultDigest.callTreeAnnotations，建 nodeName → annotation map。
 * render 只读取并呈现，不写判定逻辑（判定在 explore LLM）。
 * findings.json 不存在或字段缺失时返回空 map（容错，不报错）。
 */
function loadCallTreeAnnotations(dir: string): Map<string, CallTreeAnnotation> {
  const map = new Map<string, CallTreeAnnotation>();
  const findingsPath = path.join(dir, 'findings.json');
  if (!fs.existsSync(findingsPath)) return map;
  try {
    const findings = JSON.parse(fs.readFileSync(findingsPath, 'utf-8'));
    if (!Array.isArray(findings)) return map;
    for (const f of findings) {
      // evidence 可能是数组或对象，resultDigest 在 evidence 里
      const evidence = f?.evidence;
      if (!evidence) continue;
      const evidenceList = Array.isArray(evidence) ? evidence : [evidence];
      for (const ev of evidenceList) {
        const annotations = ev?.resultDigest?.callTreeAnnotations;
        if (!Array.isArray(annotations)) continue;
        for (const ann of annotations) {
          if (ann && typeof ann.nodeName === 'string') {
            // 后写的覆盖先写的（同一节点名多次出现时取最新）
            map.set(ann.nodeName, ann as CallTreeAnnotation);
          }
        }
      }
    }
  } catch {
    // findings.json 解析失败 = 容错，返回空 map（render 不报错，只是没标注）
  }
  return map;
}

/**
 * 在 perfetto callTree 里按节点名搜索子树。
 * 先精确匹配 rootMarker；失败则按名字核心部分（去前缀/去 Gfx./URP. 等命名空间差异）子串回退。
 *
 * 名字归一化（呈现层职责，非判定）：narrative LLM 可能用 atrace slice 名
 * （如 Gfx.WaitForPresentOnGfxThread）而 callTree 用 Unity marker 名（如 URP.WaitForPresent），
 * 两者指同一等待点。render 层做名字归一化让树能渲染，不做任何性能判定。
 */
function findPerfettoSubtree(root: PerfettoNode, targetName: string): PerfettoNode | null {
  // 1. 精确匹配
  const exact = findPerfettoSubtreeExact(root, targetName);
  if (exact) return exact;

  // 2. 子串回退：取 targetName 的核心部分（去前缀，取最后一个 CamelCase 词组）
  //    如 Gfx.WaitForPresentOnGfxThread → WaitForPresent；Core.Update → Update
  //    在树里找 name 包含核心词的节点，唯一匹配则用，多匹配则不用（避免误匹配）
  const core = extractNameCore(targetName);
  if (!core || core.length < 4) return null;  // 太短的核心词易误匹配，不回退
  const candidates: PerfettoNode[] = [];
  collectContainsMatch(root, core, candidates);
  if (candidates.length === 1) return candidates[0];
  return null;
}

function findPerfettoSubtreeExact(node: PerfettoNode, targetName: string): PerfettoNode | null {
  if (node.name === targetName) return node;
  for (const child of node.children ?? []) {
    const found = findPerfettoSubtreeExact(child, targetName);
    if (found) return found;
  }
  return null;
}

/**
 * 提取 marker 名的核心部分用于模糊回退匹配。
 * Gfx.WaitForPresentOnGfxThread → WaitForPresent（去 Gfx. 前缀，去 OnGfxThread 后缀）
 * URP.WaitForPresent → WaitForPresent
 * Core.Update → Update
 */
function extractNameCore(name: string): string {
  // 去前缀（Gfx./URP./Core./Inl_ 等）
  let core = name.replace(/^(Gfx|URP|Core|Inl|PlayerLoop|PostLateUpdate|FinishFrameRendering)\./, '');
  // 去常见后缀（OnGfxThread/OnMainThread 等）
  core = core.replace(/On(GfxThread|MainThread|RenderThread)$/i, '');
  // 取第一个 CamelCase 词组（WaitForPresentOnGfxThread → WaitForPresent）
  const m = core.match(/^([A-Z][a-z]+(?:[A-Z][a-z]+)*)/);
  return m ? m[1] : core;
}

function collectContainsMatch(node: PerfettoNode, core: string, out: PerfettoNode[]): void {
  if (node.name.includes(core)) out.push(node);
  for (const child of node.children ?? []) collectContainsMatch(child, core, out);
}

/**
 * 把 perfetto 节点转成 DrillDownNode 兼容结构（renderTreeHTML 只读这些字段）。
 * per-frame avg = totalMs / count（count = 出现帧数）。
 * selfMsPerFrame：perfetto 没直接给 self，置 0（renderTreeHTML 仅在 self>0 且 <total 时显示）。
 * pctOfRoot：用 totalPct/100（相对 UnityMain 总窗口）。
 *
 * WT-033: annotations 是从 findings.json 读的 callTreeAnnotations map（按 nodeName 查）。
 *         转换时若 map 命中则透传 redlineFlag/foldChange/severityTag——render 只呈现不判定。
 */
function perfettoNodeToDrillDown(
  node: PerfettoNode,
  thread: string,
  rootPctOfRoot: number,
  annotations?: Map<string, CallTreeAnnotation>,
): DrillDownNode {
  const totalMs = node.totalMs ?? 0;
  const count = node.count ?? 1;
  const totalMsPerFrame = count > 0 ? totalMs / count : 0;
  const pctOfRoot = node.totalPct != null ? node.totalPct / 100 : 0;
  // WT-033: 从 findings 注入节点标注（按 nodeName 匹配）
  const ann = annotations?.get(node.name);
  return {
    name: node.name,
    thread,
    totalMsPerFrame,
    selfMsPerFrame: 0,  // perfetto summary 无 self 字段，置 0（renderTreeHTML 不显示 self 行）
    pctOfRoot,
    presentFrames: count,
    children: (node.children ?? []).map(c => perfettoNodeToDrillDown(c, thread, rootPctOfRoot, annotations)),
    // WT-033: 透传 findings 的 callTreeAnnotations（只在 map 命中时填，否则 undefined）
    redlineFlag: ann?.redlineFlag ?? undefined,
    foldChange: ann?.foldChange ?? undefined,
    severityTag: ann?.severityTag ?? undefined,
  };
}

/**
 * perfetto 源的 callTree 重查：读 perfetto-profile-summary.json 的 callTrees，
 * 按 rootMarker 名在树里搜索子树，转成 DrillDownNode。
 * 不走 sqlite / drillDownMarker（那是 unity 工具）。
 *
 * @param dir  run 输出目录（含 narrative.json），形如 .../bk26b-perfetto-triad/2026-07-15_10-36-27
 *             perfetto triad 数据在 dir 的父目录下的 cur/perfetto-profile-summary.json
 */
function requeryPerfettoTrees(
  narrative: NarrativeReport,
  refs: { key: string; rootMarker: string }[],
  dir: string,
): Map<string, DrillDownNode | null> {
  const map = new Map<string, DrillDownNode | null>();
  if (refs.length === 0) return map;

  // perfetto triad 数据目录：dir 是 .../<runBase>/<timestamp>，triad root = <runBase>
  // perfetto-profile-summary.json 在 <runBase>/cur/ 下（多态报告用 cur 态作主树）
  const triadRoot = path.dirname(dir);  // 去掉时间戳子目录
  const summaryPath = path.join(triadRoot, 'cur', 'perfetto-profile-summary.json');

  if (!fs.existsSync(summaryPath)) {
    console.warn(`[render-html] perfetto summary not found: ${summaryPath} — all callTrees fallback`);
    for (const ref of refs) map.set(ref.key, null);
    return map;
  }

  let summary: { callTrees?: { thread?: string; root?: PerfettoNode }[] };
  try {
    summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
  } catch (e) {
    console.warn(`[render-html] perfetto summary parse failed: ${(e as Error).message} — all callTrees fallback`);
    for (const ref of refs) map.set(ref.key, null);
    return map;
  }

  const callTrees = Array.isArray(summary.callTrees) ? summary.callTrees : [];
  if (callTrees.length === 0) {
    console.warn('[render-html] perfetto callTrees empty in summary — all callTrees fallback');
    for (const ref of refs) map.set(ref.key, null);
    return map;
  }

  // 用第一棵树（UnityMain）作主搜索树
  const mainTree = callTrees[0];
  const thread = mainTree.thread ?? 'UnityMain';
  const root = mainTree.root;
  if (!root) {
    console.warn('[render-html] perfetto main tree root missing — all callTrees fallback');
    for (const ref of refs) map.set(ref.key, null);
    return map;
  }

  // WT-033: 从 findings.json 读 callTreeAnnotations（explore LLM 产的节点标注），建 nodeName → annotation map
  const annotations = loadCallTreeAnnotations(dir);
  if (annotations.size > 0) {
    console.log(`[render-html] loaded ${annotations.size} callTree annotations from findings.json`);
  }

  for (const ref of refs) {
    const subtree = findPerfettoSubtree(root, ref.rootMarker);
    if (subtree) {
      const tree = perfettoNodeToDrillDown(subtree, thread, 1, annotations);
      map.set(ref.key, tree);
      console.log(`[render-html] perfetto tree OK: "${ref.rootMarker}" → ${tree.totalMsPerFrame.toFixed(2)}ms/frame`);
    } else {
      console.warn(`[render-html] perfetto tree NOT FOUND: "${ref.rootMarker}" — fallback to note`);
      map.set(ref.key, null);
    }
  }
  return map;
}

async function requeryTrees(
  narrative: NarrativeReport,
  dbPath: string | undefined,
  dir: string,
): Promise<Map<string, DrillDownNode | null>> {
  const map = new Map<string, DrillDownNode | null>();

  // Collect items with callTree.rootMarker
  type ItemRef = { key: string; rootMarker: string };
  const refs: ItemRef[] = [];
  for (const sec of narrative.sections) {
    sec.items.forEach((item, i) => {
      if (item.callTree?.rootMarker) {
        refs.push({ key: `${sec.heading}::${i}`, rootMarker: item.callTree.rootMarker });
      }
    });
  }
  // WT-032: 也收集 topConclusions 的 callTree refs（key=tc::rank）
  narrative.topConclusions.forEach((row) => {
    if (row.callTree?.rootMarker) {
      refs.push({ key: `tc::${row.rank}`, rootMarker: row.callTree.rootMarker });
    }
  });

  if (refs.length === 0) return map;

  // perfetto 源：走 perfetto-profile.json，不走 sqlite（DR-45 断链 4 修复）
  if (isPerfettoSource(narrative)) {
    return requeryPerfettoTrees(narrative, refs, dir);
  }

  // unity 源：走 sqlite + drillDownMarker
  let db: ReturnType<typeof openPrismDb> | null = null;
  try {
    db = openPrismDb(dbPath);
  } catch (e) {
    console.error('[render-html] Cannot open DB — all callTrees will show note text:', (e as Error).message);
    return map;
  }

  for (const ref of refs) {
    try {
      const result = drillDownMarker(db, {
        runId: narrative.runId,
        rootMarker: ref.rootMarker,
        maxDepth: 6,
        minMsPerFrame: 0.05,
        topPerLevel: 8,
      });
      const tree = result.data.tree;
      map.set(ref.key, tree);
      console.log(`[render-html] tree OK: "${ref.rootMarker}" → ${result.data.rootTotalMsPerFrame.toFixed(2)}ms/frame`);
    } catch (e) {
      console.warn(`[render-html] tree FAIL: "${ref.rootMarker}" — ${(e as Error).message}`);
      map.set(ref.key, null);
    }
  }

  try { db.close(); } catch { /* ignore */ }
  return map;
}

// ─────────────────────── CLI entry ───────────────────────

function getFlag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const dir = getFlag('--dir') ?? 'data/prism-out/unity-outside-stressmove';

  // Require narrative.json — do NOT fall back to findings.json
  const narrativePath = path.join(dir, 'narrative.json');
  if (!fs.existsSync(narrativePath)) {
    console.error(`[render-html] ERROR: narrative.json not found at ${narrativePath}`);
    console.error('[render-html] This renderer requires narrative.json (NarrativeReport shape). Run the narrative stage first.');
    process.exit(1);
  }

  let narrative: NarrativeReport;
  try {
    narrative = JSON.parse(fs.readFileSync(narrativePath, 'utf-8')) as NarrativeReport;
  } catch (e) {
    console.error(`[render-html] ERROR: failed to parse narrative.json — ${(e as Error).message}`);
    process.exit(1);
  }

  // DR-44 A2: provenance 强制校验——非 LLM 产出的 narrative.json 拒绝渲染。
  // 脚本拼的 narrative.json（无 narrativeProvenance 或 generatedBy !== 'LLM'）会被拦截，
  // 强制走 narrative LLM 阶段。
  if (
    !narrative.narrativeProvenance ||
    narrative.narrativeProvenance.generatedBy !== 'LLM'
  ) {
    const actual = narrative.narrativeProvenance?.generatedBy ?? 'missing';
    console.error(
      `[render-html] ERROR: narrative.json 的 narrativeProvenance.generatedBy 不是 'LLM'（实际：${actual}）。` +
        `脚本拼的 narrative.json 会被拒绝渲染——必须走 narrative LLM 阶段（DR-44 A2）。`,
    );
    process.exit(1);
  }

  // Optional verdict.json for numeric metrics
  let verdict: Verdict | null = null;
  const verdictPath = path.join(dir, 'verdict.json');
  if (fs.existsSync(verdictPath)) {
    try {
      verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf-8')) as Verdict;
    } catch {
      console.warn('[render-html] verdict.json found but failed to parse — metric strip will show "—"');
    }
  }

  const dbPath = getFlag('--db');
  console.log(`[render-html] dir=${dir}  runId=${narrative.runId}  rating=${narrative.rating}`);
  console.log(`[render-html] sections=${narrative.sections.length}  topConclusions=${narrative.topConclusions.length}`);

  const treesByItemKey = await requeryTrees(narrative, dbPath, dir);

  const html = renderHTML({ narrative, verdict, treesByItemKey });

  const outPath = path.join(dir, 'report.html');
  fs.writeFileSync(outPath, html, 'utf-8');

  const fileSizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`\n[render-html] Written: ${outPath}`);
  console.log(`[render-html] Size: ${fileSizeKB} KB`);
  console.log(`[render-html] Call-trees re-queried: ${treesByItemKey.size}`);
}

// ESM: only run main() when this file is the entry point (not when imported by tests)
import { fileURLToPath } from 'node:url';
const __renderHtmlFilename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __renderHtmlFilename;
if (isMainModule) {
  main().catch(e => {
    console.error('[render-html] Fatal:', e);
    process.exit(1);
  });
}
