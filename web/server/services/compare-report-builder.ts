// P3-2: 从 RunCompareResult 生成对比厚 Markdown (report-spec §5 五步)。

import type { RunCompareResult } from '../../shared/run-compare-types.js';
import { getRun } from './run-store.js';

const VERDICT_ZH: Record<string, string> = {
  effective: '优化有效',
  ineffective: '效果不明显',
  regression: '有回归',
  inconclusive: '无法结论',
};

const SOURCE_LABEL: Record<string, string> = {
  unity_profiler: 'Unity Profiler',
  simpleperf: 'simpleperf',
  perfetto: 'Perfetto',
};

function fmtDelta(d: number, pct: number | null, unit = ''): string {
  const sign = d > 0 ? '+' : '';
  const p = pct != null ? ` (${sign}${pct}%)` : '';
  return `${sign}${d.toFixed(2)}${unit}${p}`;
}

export function buildCompareMarkdown(result: RunCompareResult): string {
  const base = getRun(result.baseRunId);
  const current = getRun(result.currentRunId);
  const baseLabel = base?.label || result.baseRunId;
  const curLabel = current?.label || result.currentRunId;

  const lines: string[] = [
    `# 对比分析报告 — ${baseLabel} vs ${curLabel}`,
    '',
    `> 基准: \`${result.baseRunId}\` · 当前: \`${result.currentRunId}\``,
    `> 生成: compare-report-builder · report-spec §5`,
    '',
    '---',
    '',
    '## 一、一句话结论',
    '',
    `**${VERDICT_ZH[result.verdict] ?? result.verdict}** (${result.confidence} 置信度)`,
    '',
    result.headline,
    '',
    `_${result.verdictReason}_`,
    '',
    '---',
    '',
    '## 二、可比性校验',
    '',
    `**等级**: ${result.comparability.level}`,
    '',
    '| 检查项 | 通过 | 详情 |',
    '|---|---|---|',
  ];

  for (const c of result.comparability.checks) {
    lines.push(`| ${c.name} | ${c.ok ? '✓' : '✗'} | ${c.detail} |`);
  }
  if (result.comparability.warnings.length) {
    lines.push('', '**警告**:', ...result.comparability.warnings.map(w => `- ${w}`));
  }
  if (result.comparability.level === 'not_comparable') {
    lines.push('', '> ⚠️ 不可比时不给出优化结论。');
  }

  lines.push('', '---', '', '## 三、三张差分树 (宏观 + 大 delta 节点)', '');

  for (const tree of result.diffTrees) {
    const label = SOURCE_LABEL[tree.source] ?? tree.source;
    lines.push(`### ${label}`, '');
    if (tree.note) lines.push(`> ${tree.note}`, '');
    if (tree.macro.length) {
      lines.push('**宏观对比**', '', '| 指标 | 基准 | 当前 | 变化 | 趋势 |', '|---|---|---|---|---|');
      for (const m of tree.macro) {
        const trend = m.delta === 0 ? '持平' : m.improved ? '改善' : '恶化';
        lines.push(`| ${m.label} | ${m.baseline.toFixed(2)} | ${m.current.toFixed(2)} | ${fmtDelta(m.delta, m.deltaPct)} | ${trend} |`);
      }
      lines.push('');
    }
    if (tree.topNodes.length) {
      lines.push('**大 delta 节点**', '', '| 状态 | 节点 | 变化 |', '|---|---|---|');
      for (const n of tree.topNodes.slice(0, 15)) {
        const mask = n.mask === 'A' ? '新增' : n.mask === 'D' ? '删除' : '变化';
        const delta = n.deltaPct != null ? `${n.deltaPct > 0 ? '+' : ''}${n.deltaPct}%` : '';
        const ms = n.deltaMs != null ? ` / ${n.deltaMs > 0 ? '+' : ''}${n.deltaMs}ms` : '';
        const inl = n.maybeInlined ? ' [疑似内联]' : '';
        lines.push(`| ${mask} | ${n.name} | ${delta}${ms}${inl} |`);
      }
      lines.push('');
    } else {
      lines.push('_无显著节点变化 (或缺 callTrees)_', '');
    }
  }

  lines.push('---', '', '## 四、各源独有对比', '');

  const u = result.unique.unity_profiler;
  if (u) {
    lines.push('### Unity — Jank / Marker', '');
    lines.push(`- Jank: ${u.jank.baseline.count} → ${u.jank.current.count} (${u.jank.delta.count > 0 ? '+' : ''}${u.jank.delta.count})`);
    lines.push(`- BigJank: ${u.jank.baseline.bigCount} → ${u.jank.current.bigCount}`);
    lines.push(`- Jank 率: ${u.jank.baseline.rate.toFixed(2)}% → ${u.jank.current.rate.toFixed(2)}%`);
    if (u.topMarkerDeltas.length) {
      lines.push('', '| Marker | 基准 | 当前 | 变化 |', '|---|---|---|---|');
      for (const m of u.topMarkerDeltas.slice(0, 10)) {
        lines.push(`| ${m.label} | ${m.baseline.toFixed(2)} | ${m.current.toFixed(2)} | ${fmtDelta(m.delta, m.deltaPct)} |`);
      }
    }
    lines.push('');
  }

  const sp = result.unique.simpleperf;
  if (sp) {
    lines.push('### simpleperf — SO / Anchor', '');
    lines.push('> SO 占比 = 某代码库占 CPU 时间, 下降=更省');
    if (sp.soDeltas.length) {
      lines.push('', '| SO | 基准% | 当前% | Δpp |', '|---|---|---|---|');
      for (const m of sp.soDeltas.slice(0, 8)) {
        lines.push(`| ${m.label} | ${m.baseline.toFixed(2)} | ${m.current.toFixed(2)} | ${fmtDelta(m.delta, m.deltaPct)} |`);
      }
    }
    lines.push('');
  }

  const pf = result.unique.perfetto;
  if (pf) {
    lines.push('### Perfetto — 调度 / 频率', '');
    if (pf.throttleNote) lines.push(`> ${pf.throttleNote}`, '');
    const all = [...pf.threadDeltas, ...pf.systemDeltas];
    if (all.length) {
      lines.push('', '| 指标 | 基准 | 当前 | 变化 |', '|---|---|---|---|');
      for (const m of all) {
        lines.push(`| ${m.label} | ${m.baseline.toFixed(2)} | ${m.current.toFixed(2)} | ${fmtDelta(m.delta, m.deltaPct)} |`);
      }
    }
    lines.push('');
  }

  lines.push('---', '', '## 五、综合结论 (共性 / 独有)', '');

  if (!result.synthesis.length) {
    lines.push('_无可比结论或未检测到多源同向变化_');
  } else {
    lines.push('| 类型 | 涉及源 | 结论 | 证据 |', '|---|---|---|---|');
    for (const s of result.synthesis) {
      lines.push(`| ${s.kind === 'common' ? '共性' : '独有'} | ${s.sources.join('+')} | ${s.conclusion} | ${s.evidence} |`);
    }
  }

  lines.push('', '---', '', '## 附录', '', '- **差分火焰图**: `/runs/compare/flamegraph?baseRunId=&currentRunId=` (simpleperf, 需两 Run 均有 simpleperf 源)');
  lines.push('- **术语**: `[D]`=热点消失/内联消除; `[A]`=新增; `[M]`=仍在但变化');

  return lines.join('\n');
}
