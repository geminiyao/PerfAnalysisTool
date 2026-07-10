/**
 * render-report.ts — Phase B renderer: 把 Prism 探索产出（verdict + findings）
 * 渲染成一份人可读的中文 markdown 报告。
 *
 * 设计锚点（PRISM-CHARTER F6/F8 + DR-23）：
 * - F6 TL;DR 优先：报告第一屏 = 总判定 + 最重要的几条，一眼看爽。
 * - F8 动态判定：开头是 Verdict（这次行不行/坏在哪/坏多少），不是套路问题清单。
 * - DR-23 主次呈现：**按 verdict.primaryDrivers 排序组织**，把真正的第一主因顶到最前，
 *   不照搬 LLM 给的 severity（它常把"现象/罕见尖峰"排在"普遍主因"前面）。
 *
 * 用法：node --import tsx server/prism/render-report.ts --dir <explore输出目录>
 *      默认 dir = data/prism-out/<runId> 下最新的时间戳目录（或该目录本身）。
 */
import * as fs from 'fs';
import * as path from 'path';

// ─────────────────────── 类型定义 ───────────────────────

interface Evidence {
  tool: string;
  args: Record<string, unknown>;
  resultDigest: unknown;
}

interface Finding {
  id: string;
  title?: string;
  conclusion: string;
  severity: string;
  confidence: string;
  evidence: Evidence[];
  reasoning?: string;
  recommendation?: string;
  selfCritique?: string;
  symbols?: string[];
  tags?: string[];
}

interface Driver {
  driver: string;
  impact: string;
  evidenceRefs?: string[];
}

interface Verdict {
  rating: string;
  headline: string;
  frameBudgetMs?: number;
  observedP50Ms?: number;
  observedP95Ms?: number;
  observedP99Ms?: number;
  observedMaxMs?: number;
  observedMaxFrameIndex?: number;
  pctFramesOverBudget?: number;
  pctFramesOver2xBudget?: number;
  primaryDrivers?: Driver[];
}

// ─────────────────────── 상수 ───────────────────────

const RATING_CN: Record<string, string> = {
  excellent: '🟢 优秀',
  pass:      '🟢 及格',
  weak:      '🟡 偏弱',
  fail:      '🔴 不合格',
};

const SEV_ICON: Record<string, string> = {
  critical: '🔴',
  high:     '🟠',
  medium:   '🟡',
  low:      '🟢',
  info:     'ℹ️',
};

const SEV_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};

const CONF_CN: Record<string, string> = {
  high: '高置信', medium: '中置信', low: '低置信',
};

const SEV_CN: Record<string, string> = {
  critical: '严重', high: '高', medium: '中', low: '低', info: '信息',
};

// ─────────────────────── 工具函数 ───────────────────────

/** 安全取数字，缺失返回 "—" 而非 "?" */
function num(v: unknown, digits = 1): string {
  if (typeof v === 'number' && isFinite(v)) return v.toFixed(digits);
  return '—';
}

/** 安全取字符串，缺失返回 fallback */
function str(v: unknown, fallback = '—'): string {
  if (v == null || v === '') return fallback;
  return String(v);
}

// ─────────────────────── ASCII 调用树渲染 ───────────────────────

/**
 * 树节点形状（drillDownMarker/aggregateSubtree 可能有的字段集合）
 */
interface TreeNode {
  name?: string;
  label?: string;
  totalMsPerFrame?: number;
  selfMsPerFrame?: number;
  totalMs?: number;
  selfMs?: number;
  pct?: number;
  children?: TreeNode[];
  [key: string]: unknown;
}

function isTreeNode(o: unknown): o is TreeNode {
  if (!o || typeof o !== 'object') return false;
  const obj = o as Record<string, unknown>;
  return (
    (typeof obj['name'] === 'string' || typeof obj['label'] === 'string') &&
    (typeof obj['totalMsPerFrame'] === 'number' ||
     typeof obj['selfMsPerFrame'] === 'number' ||
     typeof obj['totalMs'] === 'number' ||
     typeof obj['children'] !== 'undefined')
  );
}

function nodeLabel(n: TreeNode): string {
  const name = n.name ?? n.label ?? '(unknown)';
  const parts: string[] = [name];
  const total = n.totalMsPerFrame ?? n.totalMs;
  const self  = n.selfMsPerFrame  ?? n.selfMs;
  if (typeof total === 'number') parts.push(`${total.toFixed(2)}ms/帧`);
  else if (typeof self === 'number') parts.push(`self ${self.toFixed(2)}ms`);
  if (typeof n.pct === 'number') parts.push(`${n.pct.toFixed(1)}%`);
  return parts.join(' ');
}

function renderTree(nodes: TreeNode[], prefix = '', isLast = false, depth = 0): string {
  const lines: string[] = [];
  nodes.forEach((node, i) => {
    const last   = i === nodes.length - 1;
    const branch = last ? '└─' : '├─';
    const label  = nodeLabel(node);
    lines.push(`${prefix}${depth === 0 ? '' : branch + ' '}${label}`);
    if (Array.isArray(node.children) && node.children.length > 0) {
      const childPrefix = depth === 0 ? '' : prefix + (last ? '   ' : '│  ');
      lines.push(renderTree(node.children as TreeNode[], childPrefix, last, depth + 1));
    }
  });
  return lines.join('\n');
}

/**
 * 从一条 evidence 的 resultDigest 中尝试提取树形结构。
 * 返回渲染好的 ASCII 代码块，或 null（无树数据）。
 */
function tryRenderCallTree(digest: unknown): string | null {
  if (!digest) return null;

  // 如果 digest 本身是树节点或节点数组
  if (Array.isArray(digest)) {
    const nodes = digest.filter(isTreeNode) as TreeNode[];
    if (nodes.length > 0) {
      return '```\n' + renderTree(nodes, '', false, 0) + '\n```';
    }
  }

  if (typeof digest === 'object' && digest !== null) {
    // 优先：digest 本身就是一个树节点（含 name + children 的 root）
    if (isTreeNode(digest)) {
      return '```\n' + renderTree([digest as TreeNode], '', false, 0) + '\n```';
    }
    const obj = digest as Record<string, unknown>;
    // 次级：常见包装形状：{ root: {...} } 或 { tree: [...] } 或 { nodes: [...] } 或 { callTree: [...] }
    // 注意：不直接把 children 单独提出来（那会跳过根节点）
    for (const key of ['root', 'tree', 'nodes', 'callTree']) {
      const val = obj[key];
      if (Array.isArray(val)) {
        const nodes = val.filter(isTreeNode) as TreeNode[];
        if (nodes.length > 0) {
          return '```\n' + renderTree(nodes, '', false, 0) + '\n```';
        }
      }
      if (isTreeNode(val)) {
        return '```\n' + renderTree([val as TreeNode], '', false, 0) + '\n```';
      }
    }
  }

  return null;
}

// ─────────────────────── 建议段落解析 ───────────────────────

/**
 * 把 recommendation 字符串转成 markdown 编号列表（如果已含编号项则分拆，否则原文输出）。
 * 支持格式：1) 2) 3)  /  ①②③  /  (1)(2)(3)  /  - item  /  · item
 */
function renderRecommendation(rec: string): string {
  if (!rec) return '';

  // 检测是否含 序号条目
  const numberedPatterns = [
    /^\s*(\d+)[.)、]\s+/m,   // 1. 2. 3.  /  1) 2)  /  1、
    /^\s*[①②③④⑤⑥⑦⑧⑨⑩]/m,  // ①②③
    /^\s*\(\d+\)\s+/m,       // (1)(2)
  ];
  const hasNumbered = numberedPatterns.some(p => p.test(rec));

  if (!hasNumbered) {
    // 检测 - / · 开头的条目
    const bulletLines = rec.split('\n').filter(l => /^\s*[-·•]\s+/.test(l));
    if (bulletLines.length >= 2) {
      // 已是 bullet list，直接返回
      return rec.trim();
    }
    // 纯段落，原文
    return rec.trim();
  }

  // 按编号拆分
  // 统一把 ① ② … 替换为 1) 2) 方便分割
  const normalized = rec
    .replace(/[①]/g, '1) ').replace(/[②]/g, '2) ').replace(/[③]/g, '3) ')
    .replace(/[④]/g, '4) ').replace(/[⑤]/g, '5) ').replace(/[⑥]/g, '6) ')
    .replace(/[⑦]/g, '7) ').replace(/[⑧]/g, '8) ').replace(/[⑨]/g, '9) ')
    .replace(/\((\d+)\)/g, '$1)');

  // 分割成段
  const segments = normalized.split(/(?=\n?\s*\d+[.)、]\s+)/).map(s => s.trim()).filter(Boolean);
  if (segments.length < 2) return rec.trim();

  return segments.map(seg => {
    // 把 "1) 内容" → "1. 内容" 以便 markdown 渲染
    const cleaned = seg.replace(/^(\d+)[.)、]\s*/, '$1. ');
    return cleaned;
  }).join('\n');
}

// ─────────────────────── 证据链渲染 ───────────────────────

function renderDigest(digest: unknown): string {
  if (digest == null) return '（无摘要）';
  if (typeof digest === 'string') {
    const trimmed = digest.trim();
    return trimmed || '（无摘要）';
  }
  if (typeof digest === 'object') {
    // 尝试紧凑化：只取数值型字段和简短字符串字段
    const obj = digest as Record<string, unknown>;
    const compact = Object.entries(obj)
      .filter(([, v]) => typeof v === 'number' || (typeof v === 'string' && String(v).length < 80))
      .map(([k, v]) => `${k}: ${typeof v === 'number' ? num(v, 2) : v}`)
      .join(' · ');
    if (compact) return compact;
    // 降级：JSON 截断
    const json = JSON.stringify(digest);
    return json.length > 300 ? json.slice(0, 300) + '…' : json;
  }
  return String(digest);
}

function renderEvidenceBlock(ev: Evidence[]): string {
  if (!ev || ev.length === 0) return '（无证据）';
  return ev.map((e, i) => {
    const argStr = Object.entries(e.args || {})
      .filter(([k]) => k !== 'runId')
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(', ');
    const digest = renderDigest(e.resultDigest);
    return `${i + 1}. \`${e.tool}(${argStr})\`\n   → ${digest}`;
  }).join('\n');
}

// ─────────────────────── 主渲染函数 ───────────────────────

export function renderReport(
  verdict: Verdict | null,
  findings: Finding[],
  meta?: { runId?: string; toolCalls?: number; verified?: string },
): { report: string; audit: string } {
  const L: string[] = [];
  const A: string[] = [];  // 审计文档（技术论证/自审/证据链），与正式报告分离
  A.push(`# 审计底稿 · ${meta?.runId ?? ''}`);
  A.push('');
  A.push('> 本文件是正式报告 report.md 的配套审计底稿：每条发现的技术论证、自我审查、可回溯证据链。');
  A.push('> 正式报告只保留"数据+人话建议+调用树"，审计信息放这里，供需要核查的人查阅。');
  A.push('');
  A.push('---');
  A.push('');
  const budget = verdict?.frameBudgetMs ?? 16.67;
  const fps = Math.round(1000 / budget);

  // ════════════════════════════════════════════════════
  // 标题 + 总判定区
  // ════════════════════════════════════════════════════
  const runLabel = meta?.runId ? ` · ${meta.runId}` : '';
  L.push(`# 性能分析报告${runLabel}`);
  L.push('');

  if (verdict) {
    const ratingStr = RATING_CN[verdict.rating] ?? verdict.rating;
    L.push(`## 总判定：${ratingStr}`);
    L.push('');
    L.push(`> ${verdict.headline}`);
    L.push('');

    // 元信息表（与 §0 写机报告对齐）
    const maxLabel = verdict.observedMaxFrameIndex != null
      ? `${num(verdict.observedMaxMs)}ms（帧 #${verdict.observedMaxFrameIndex}）`
      : num(verdict.observedMaxMs) + 'ms';

    let overBudgetStr = '—';
    if (verdict.pctFramesOverBudget != null) {
      overBudgetStr = `${num(verdict.pctFramesOverBudget)}%`;
      if (verdict.pctFramesOver2xBudget != null) {
        overBudgetStr += `（其中超 2× 预算：${num(verdict.pctFramesOver2xBudget)}%）`;
      }
    }

    L.push('| 指标 | 数值 |');
    L.push('|------|------|');
    L.push(`| 目标帧预算 | ${num(verdict.frameBudgetMs)}ms / ${fps}fps |`);
    L.push(`| 实测中位（P50） | ${num(verdict.observedP50Ms)}ms |`);
    L.push(`| P95 | ${num(verdict.observedP95Ms)}ms |`);
    L.push(`| P99 | ${num(verdict.observedP99Ms)}ms |`);
    L.push(`| 最差帧 | ${maxLabel} |`);
    L.push(`| 超预算帧占比 | ${overBudgetStr} |`);
    L.push('');
  } else {
    L.push('> ⚠️ 无 verdict.json，仅展示 findings。');
    L.push('');
  }

  // ════════════════════════════════════════════════════
  // §0 结论先行（TL;DR） — 问题先行，F6
  // ════════════════════════════════════════════════════
  L.push('---');
  L.push('');
  L.push('## §0 结论先行');
  L.push('');

  // 归一化 primaryDrivers：LLM 可能输出 (a) 字符串(finding id 引用) 或 (b) {driver,impact,evidenceRefs} 对象
  const rawDrivers = verdict?.primaryDrivers ?? [];
  const findingById = new Map(findings.map(f => [f.id.toLowerCase(), f]));
  const drivers = (rawDrivers as unknown[]).map((d): { driver: string; impact: string; evidenceRefs?: string[] } => {
    if (typeof d === 'string') {
      // 字符串 = finding id 引用；用该 finding 的结论首句当描述
      const f = findingById.get(d.toLowerCase());
      const firstSentence = f ? f.conclusion.split(/[。\n]/)[0] : '';
      return { driver: f ? firstSentence : d, impact: '', evidenceRefs: f ? [d] : undefined };
    }
    const o = d as { driver?: string; name?: string; title?: string; impact?: string; description?: string; evidenceRefs?: string[] };
    return {
      driver: o.driver ?? o.name ?? o.title ?? '(未命名主因)',
      impact: o.impact ?? o.description ?? '',
      evidenceRefs: o.evidenceRefs,
    };
  });
  if (drivers.length > 0) {
    drivers.forEach((d, i) => {
      L.push(`**${i + 1}. ${d.driver}**`);
      L.push('');
      if (d.impact) L.push(`   ${d.impact}`);
      if (d.evidenceRefs?.length) {
        L.push('');
        L.push(`   _依据：${d.evidenceRefs.join('；')}_`);
      }
      L.push('');
    });
  } else {
    L.push('_（未提供主因列表）_');
    L.push('');
  }

  // ════════════════════════════════════════════════════
  // §1 详细发现
  // ════════════════════════════════════════════════════
  L.push('---');
  L.push('');
  L.push(`## §1 详细发现（${findings.length} 条）`);
  L.push('');

  if (findings.length === 0) {
    L.push('_（暂无 findings）_');
    L.push('');
  } else {
    // 按 primaryDrivers 顺序排序（DR-23），其次按 severity
    const driverOrder = new Map(drivers.map((d, i) => [d.driver.toLowerCase(), i]));
    const findingDriverIndex = (f: Finding): number => {
      for (const [pattern, idx] of driverOrder.entries()) {
        if (
          f.id.toLowerCase().includes(pattern) ||
          f.conclusion.toLowerCase().includes(pattern) ||
          (f.tags ?? []).some(t => t.toLowerCase().includes(pattern))
        ) {
          return idx;
        }
      }
      return 999;
    };

    const sorted = [...findings].sort((a, b) => {
      const da = findingDriverIndex(a);
      const db = findingDriverIndex(b);
      if (da !== db) return da - db;
      return (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9);
    });

    sorted.forEach((f, idx) => {
      const icon = SEV_ICON[f.severity] ?? '•';
      const sevTag = SEV_CN[f.severity] ?? f.severity;
      const confTag = CONF_CN[f.confidence] ?? f.confidence;
      // 标题：优先用 LLM 写的短标题；无则从 conclusion 提炼首句（不是硬截断）
      const heading = (f.title && f.title.trim())
        ? f.title.trim()
        : f.conclusion.split(/[。！？\n]/)[0].trim().slice(0, 30);
      L.push(`### ${icon} 发现${idx + 1}：${heading}`);
      L.push('');
      L.push(`<sub>严重度：**${sevTag}** ｜ 置信度：**${confTag}**</sub>`);
      L.push('');

      // 结论（完整人话）
      L.push(f.conclusion.trim());
      L.push('');

      // 调用树（仅当存在真实树数据时渲染）
      const treeEvidence = (f.evidence ?? []).find(e =>
        e.tool === 'drillDownMarker' || e.tool === 'aggregateSubtree' || e.tool === 'getCallTree',
      );
      if (treeEvidence) {
        const treeBlock = tryRenderCallTree(treeEvidence.resultDigest);
        if (treeBlock) {
          L.push('**调用树**');
          L.push('');
          L.push(treeBlock);
          L.push('');
        } else if (typeof treeEvidence.resultDigest === 'string' && treeEvidence.resultDigest.trim()) {
          // LLM 已将其总结为字符串
          L.push('**调用树摘要**');
          L.push('');
          L.push('```');
          L.push(treeEvidence.resultDigest.trim());
          L.push('```');
          L.push('');
        }
      }

      // 优化建议（识别编号格式并渲染为列表）
      if (f.recommendation) {
        L.push('**优化建议**');
        L.push('');
        L.push(renderRecommendation(f.recommendation));
        L.push('');
      }

      // 标签
      if (f.tags?.length) {
        L.push(`_标签：${f.tags.join(' · ')}_`);
        L.push('');
      }

      // 技术细节（技术论证/自我审查/证据链）不进正式报告——收集到审计文档 report-audit.md
      A.push(`## 发现${idx + 1}：${heading}  \`[${f.id}]\``);
      A.push('');
      if (f.reasoning) {
        A.push('**技术论证**');
        A.push('');
        A.push(f.reasoning.trim());
        A.push('');
      }
      if (f.selfCritique) {
        A.push('**自我审查**');
        A.push('');
        A.push(f.selfCritique.trim());
        A.push('');
      }
      A.push('**证据链**');
      A.push('');
      A.push(renderEvidenceBlock(f.evidence ?? []));
      A.push('');
      A.push('---');
      A.push('');

      L.push('---');
      L.push('');
    });
  }

  // ════════════════════════════════════════════════════
  // 页脚
  // ════════════════════════════════════════════════════
  const toolCallsStr = meta?.toolCalls != null ? `${meta.toolCalls} 次查询` : '— 次查询';
  const verifiedStr  = meta?.verified ?? '—';
  L.push(`_Prism 探索：${toolCallsStr}　证据核对：${verifiedStr}　｜ 技术论证/证据链见 report-audit.md_`);
  L.push('');

  return { report: L.join('\n'), audit: A.join('\n') };
}

// ─────────────────────── CLI 入口 ───────────────────────

function getFlag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

function main(): void {
  const dir = getFlag('--dir') ?? 'data/prism-out/unity-outside-stressmove';
  const read = (f: string) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
    } catch {
      return null;
    }
  };

  const verdict  = read('verdict.json')  as Verdict | null;
  const findings = (read('findings.json') as Finding[] | null) ?? [];
  const result   = read('explore-result.json') as {
    meta?: { toolCallCount?: number };
    verification?: { verifiedEvidence?: number; totalEvidence?: number };
  } | null;

  const runId = path.basename(dir);
  const meta = {
    runId,
    toolCalls: result?.meta?.toolCallCount,
    verified: result?.verification
      ? `${result.verification.verifiedEvidence ?? '—'}/${result.verification.totalEvidence ?? '—'} 通过`
      : undefined,
  };

  const { report, audit } = renderReport(verdict, findings, meta);
  const outPath = path.join(dir, 'report.md');
  const auditPath = path.join(dir, 'report-audit.md');
  fs.writeFileSync(outPath, report, 'utf-8');
  fs.writeFileSync(auditPath, audit, 'utf-8');
  console.log(`正式报告：${outPath}`);
  console.log(`审计底稿：${auditPath}`);
  console.log(`（${findings.length} findings, 报告 ${report.length} 字节 / 审计 ${audit.length} 字节）`);
}

main();
