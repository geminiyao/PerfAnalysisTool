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
import type { NarrativeReport, NarrativeItem } from './narrative-types.js';

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

  let html = `
  <div class="tree-row" style="margin-left:${indent}px">
    <div class="tree-bar" style="width:${widthPct.toFixed(1)}%;background:${col.bg};border-left:3px solid ${col.border}">
      <span class="tree-label" style="color:${col.text}">${htmlEsc(node.name)}</span>
      <span class="tree-ms">${htmlEsc(displayMs)}</span>
      <span class="tree-pct">${pctStr}%</span>
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

  // sourceInsight callout
  const insightSection = item.sourceInsight
    ? `<div class="source-insight"><span class="insight-label">源码归因</span>${htmlEsc(item.sourceInsight).replace(/\n/g, '<br>')}</div>`
    : '';

  // Recommendations numbered list
  const recsHTML = item.recommendations.length
    ? `<div class="rec-section">
        <div class="rec-label">优化建议</div>
        <ol class="rec-list">${item.recommendations.map(r => `<li>${htmlEsc(r)}</li>`).join('')}</ol>
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
      <p class="narrative-text">${htmlEsc(item.narrative).replace(/\n/g, '<br>')}</p>
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
  const conclusionsHTML = narrative.topConclusions.map(row => {
    const sc = sevStyle(row.severity);
    return `<tr>
      <td class="tc-rank">${row.rank}</td>
      <td class="tc-problem">${htmlEsc(row.problem)}</td>
      <td class="tc-kind">${htmlEsc(KIND_CN[row.kind] ?? row.kind)}</td>
      <td class="tc-contribution">${htmlEsc(row.contribution)}</td>
      <td class="tc-severity"><span class="chip sev-chip" style="color:${sc.dot};background:${sc.badge}">${SEV_CN[row.severity] ?? row.severity}</span></td>
    </tr>`;
  }).join('');

  // ── ruledOut strip ──
  const ruledOutHTML = (narrative.ruledOut ?? []).length
    ? `<div class="ruled-out-strip">
        <span class="ruled-out-label">已排除</span>
        ${narrative.ruledOut!.map(r => `<span class="ruled-out-item" title="${htmlEsc(r.why)}">${htmlEsc(r.name)}: <em>${htmlEsc(r.why)}</em></span>`).join('')}
      </div>`
    : '';

  // ── § sections ──
  const sectionsHTML = narrative.sections.map(sec => {
    const introHTML = sec.intro
      ? `<p class="section-intro">${htmlEsc(sec.intro).replace(/\n/g, '<br>')}</p>`
      : '';
    const itemsHTML = sec.items.map((item, i) => {
      const key = `${sec.heading}::${i}`;
      const tree = treesByItemKey.get(key);
      return renderItemCard(item, tree);
    }).join('');
    return `
  <div class="narrative-section">
    <div class="section-heading">${htmlEsc(sec.heading)}</div>
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
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
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
}
.tree-note {
  padding: 10px 14px;
  font-size: 13px;
  color: #78909c;
  background: #080d14;
  font-style: italic;
}
.tree-row { margin-bottom: 4px; min-width: 0; }
.tree-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-radius: 3px;
  min-width: 120px;
  max-width: 100%;
  overflow: hidden;
  cursor: default;
  transition: filter 0.12s;
}
.tree-bar:hover { filter: brightness(1.2); }
.tree-label {
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
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
<div class="overview-block">${htmlEsc(narrative.overview).replace(/\n/g, '<br>')}</div>

<!-- ═══════════════════ Metrics strip ═══════════════════ -->
<div class="metrics-strip">
${metricsHTML}
</div>

<!-- ═══════════════════ § 核心结论 ═══════════════════ -->
<div class="section-title">核心结论</div>
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

<!-- ═══════════════════ § 主题分群 ═══════════════════ -->
<div class="section-title">主题分群</div>
${sectionsHTML || '<p class="muted">（暂无分群内容）</p>'}

<!-- ═══════════════════ § 优化优先级 ═══════════════════ -->
<div class="section-title">优化优先级</div>
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

async function requeryTrees(
  narrative: NarrativeReport,
  dbPath: string | undefined,
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

  if (refs.length === 0) return map;

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
        maxDepth: 5,
        minMsPerFrame: 0.1,
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

  const treesByItemKey = await requeryTrees(narrative, dbPath);

  const html = renderHTML({ narrative, verdict, treesByItemKey });

  const outPath = path.join(dir, 'report.html');
  fs.writeFileSync(outPath, html, 'utf-8');

  const fileSizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`\n[render-html] Written: ${outPath}`);
  console.log(`[render-html] Size: ${fileSizeKB} KB`);
  console.log(`[render-html] Call-trees re-queried: ${treesByItemKey.size}`);
}

main().catch(e => {
  console.error('[render-html] Fatal:', e);
  process.exit(1);
});
