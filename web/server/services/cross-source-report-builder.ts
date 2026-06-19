// 从 cross-source digest + insights 生成 p1-cross 级 Markdown (确定性, 非 fallback  stub)。

import type { Insight } from '../../shared/perf-model.js';
import type { CrossSourceDigest } from './cross-source-digest.js';

function fmtPct(v: number | undefined, d = 1): string {
  return v == null ? '—' : `${v.toFixed(d)}%`;
}

function fmtMs(v: number | undefined, d = 2): string {
  return v == null ? '—' : `${v.toFixed(d)}ms`;
}

function insightSection(insights: Insight[], filter: (i: Insight) => boolean, title: string): string[] {
  const items = insights.filter(filter);
  if (!items.length) return [];
  const lines = [`## ${title}`, ''];
  for (const ins of items) {
    lines.push(`### ${ins.conclusion}`);
    lines.push('');
    lines.push(`- **严重度**: ${ins.severity} · **置信度**: ${ins.confidence} · **源**: ${ins.sources.join(', ')}`);
    if (ins.evidence?.length) {
      lines.push('- **证据**:');
      for (const e of ins.evidence) lines.push(`  - \`${e.source}\`: ${e.detail}`);
    }
    if (ins.recommendation) lines.push(`- **建议**: ${ins.recommendation}`);
    lines.push('');
  }
  return lines;
}

/** 构建完整跨源 Markdown 报告 (对标 output/p1-cross 结构)。 */
export function buildCrossSourceMarkdown(
  digest: CrossSourceDigest,
  insights: Insight[],
  headline: string,
): string {
  const { run } = digest;
  const fm = digest.frameMetricsUnity;
  const bi = digest.bottleneckInputs as {
    perfetto_UnityMain?: { runningPct: number; sleepingPct: number; runnablePct: number };
    simpleperf_UnityMain_cpuPct?: number;
    throttling?: { level?: string; bigCoreReachPct?: number };
  };
  const pfMain = bi.perfetto_UnityMain;
  const notes = (digest.confidence.notes as string[] | undefined) ?? [];

  const lines: string[] = [
    `# 跨源综合性能分析报告 — ${run.label || run.id} (${run.device || '?'} / ${run.scene || '?'})`,
    '',
    `> Run: \`${run.id}\` · 设备 ${run.device || '—'} · 场景 ${run.scene || '—'} · 源 ${run.sources.join(' + ')}`,
    `> 生成: cross-source-report-builder (digest + insights) · ${digest.generatedAt.slice(0, 19)}`,
    `> 依据: report-spec §0/§2/§3/§4/§6`,
    '',
    '---',
    '',
    '## 一、一句话结论',
    '',
    `**${headline}**`,
    '',
  ];

  const topRec = insights.find(i => i.recommendation && i.severity !== 'info');
  if (topRec?.recommendation) {
    lines.push(`> **首要建议**: ${topRec.recommendation}`);
    lines.push('');
  }

  lines.push('---', '', '## 二、同源性 / 可比性校验', '', '| 项 | 值 |', '|---|---|');
  lines.push(`| 设备 | ${run.device || '—'} |`);
  lines.push(`| 场景 | ${run.scene || '—'} |`);
  lines.push(`| 帧数 (unity) | ${run.frameCount ?? '—'} |`);
  if (digest.frame.length) {
    lines.push('| 帧口径 | 各源独立, **禁直比** |');
    for (const f of digest.frame) {
      lines.push(`| ${f.source}/${f.def} | P95=${fmtMs(f.p95Ms)} FPS=${f.fps.toFixed(1)} 慢帧=${fmtPct(f.slowFrameRate)} |`);
    }
  }
  const pfWin = (digest.sameCapture.perfetto as { profileWindow?: { durMs?: number } } | undefined)?.profileWindow;
  if (pfWin?.durMs != null) {
    lines.push(`| perfetto 窗口 | ${fmtMs(pfWin.durMs)} |`);
  }
  if (notes.length) {
    lines.push('', '**可信度备注**:', ...notes.map(n => `- ${n}`));
  }
  lines.push('');

  lines.push('---', '', '## 三、瓶颈类型定型', '');
  if (pfMain) {
    lines.push('| 证据 | 数值 | 出处 |', '|---|---|---|');
    lines.push(`| UnityMain Running | ${fmtPct(pfMain.runningPct)} | perfetto thread.UnityMain.runningPct |`);
    lines.push(`| UnityMain Sleeping | ${fmtPct(pfMain.sleepingPct)} | perfetto |`);
    if (bi.simpleperf_UnityMain_cpuPct != null) {
      lines.push(`| UnityMain 占全机 CPU | ${fmtPct(bi.simpleperf_UnityMain_cpuPct)} | simpleperf cpu.thread.UnityMain.pct |`);
    }
    if (bi.throttling?.level) {
      lines.push(`| 降频 | level=${bi.throttling.level}, 大核可达 ${fmtPct(bi.throttling.bigCoreReachPct)} | detail.perfetto.throttling |`);
    }
    lines.push('');
  } else {
    lines.push('_perfetto 主线程调度数据缺失_', '');
  }

  const stages = digest.perfettoStageBreakdown.filter(s => s.depth <= 1 && (s.totalPct ?? 0) >= 3).slice(0, 10);
  if (stages.length) {
    lines.push('---', '', '## 四、主循环阶段分解 (perfetto atrace)', '', '| 阶段 | 占 UnityMain |', '|---|---|');
    for (const s of stages) lines.push(`| ${s.name} | ${fmtPct(s.totalPct)} |`);
    lines.push('');
  }

  if (digest.unityHotMarkers.length) {
    lines.push('---', '', '## 五、Top 热点清单 (unity marker + simpleperf 印证)', '',
      '| # | 热点 | unity self/帧 | 占帧 | simpleperf 印证 |',
      '|---|---|---|---|---|');
    digest.unityHotMarkers.slice(0, 10).forEach((m, i) => {
      const sp = digest.simpleperfBusinessHotNodes.find(n =>
        m.name.includes(n.name.replace(/^CS:/, '')) || n.name.toLowerCase().includes((m.name.split('.').pop() ?? '').toLowerCase()),
      );
      lines.push(`| ${i + 1} | ${m.name} | ${fmtMs(m.msSelfMean)} | ${fmtPct(m.percentOfFrame)} | ${sp ? `${sp.name} (${fmtPct(sp.selfPct)})` : '—'} |`);
    });
    lines.push('');
  }

  if (digest.unitySpikes.length) {
    lines.push('---', '', '## 六、Top 波动 / 慢帧', '', '| marker | spike 倍数 | max | 帧窗口 |', '|---|---|---|---|');
    for (const s of digest.unitySpikes.slice(0, 6)) {
      lines.push(`| ${s.name} | ${s.spikeRatio?.toFixed(1) ?? '—'}x | ${fmtMs(s.msSelfMax)} | ${s.window ?? '—'} |`);
    }
    lines.push('');
  }

  lines.push('---', '');
  lines.push(...insightSection(insights, i => i.id.startsWith('cross.'), '七、共性结论 (多源同向)'));
  lines.push(...insightSection(insights, i => i.id.startsWith('unique.'), '八、各源独有问题'));
  lines.push(...insightSection(
    insights,
    i => !!i.recommendation && !i.id.startsWith('unique.') && !i.id.startsWith('cross.'),
    '九、可执行建议',
  ));

  lines.push('---', '', '## 十、局限与可信度', '');
  if (!digest.sourceMapAvailable) {
    lines.push('- **源码映射**: 未配置 projectPath, 建议只能到 marker/manager 级 (U3)。');
  }
  if (digest.bottleneckInputs.gpuBusyPct == null) {
    lines.push('- **GPU**: system.gpuBusyPct 缺失, GPU 是否次级瓶颈无法定论。');
  }
  if (notes.length) lines.push(...notes.map(n => `- ${n}`));
  lines.push('', '---', '', '_本报告由 Web「生成报告」自动产出; 可配合 CLI cross-source-analysis skill 做更深解读。_');

  return lines.join('\n');
}
