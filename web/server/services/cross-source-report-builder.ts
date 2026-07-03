// 从 cross-source digest + insights 生成高密度 Markdown（对标 ULTIMATE v5.3 / v4.1）。
// Phase 4 重写：使用 Phase 1a/1b/2/3 全部新字段，做到程序拼装也能 ≥80% 章节覆盖。

import type { Insight } from '../../shared/perf-model.js';
import type { CrossSourceDigest, IndentedNode, AlignedHotNode } from './cross-source-digest.js';

function fmtPct(v: number | undefined | null, d = 1): string {
  return v == null ? '—' : `${v.toFixed(d)}%`;
}

function fmtMs(v: number | undefined | null, d = 2): string {
  return v == null ? '—' : `${v.toFixed(d)}ms`;
}

function fmtNum(v: number | undefined | null, d = 1): string {
  return v == null ? '—' : v.toFixed(d);
}

/** 把 IndentedNode[] 渲染为带 ASCII 缩进的代码块（保留树形）。 */
function renderIndentedTree(nodes: IndentedNode[], opts: { maxLines?: number; minPct?: number } = {}): string {
  if (!nodes.length) return '_无数据_';
  const maxLines = opts.maxLines ?? 30;
  const minPct = opts.minPct ?? 0;
  const lines = ['```'];
  let count = 0;
  for (const n of nodes) {
    if (count >= maxLines) { lines.push(`... (${nodes.length - count} more)`); break; }
    if ((n.totalPct ?? 0) < minPct) continue;
    const indent = '  '.repeat(Math.min(n.depth, 8));
    const ms = n.totalMs != null ? `${n.totalMs.toFixed(2)}ms` : '';
    const pct = n.totalPct != null ? `${n.totalPct.toFixed(1)}%` : '';
    const self = n.selfMs != null && n.selfMs > 0.05 ? ` self=${n.selfMs.toFixed(2)}` : '';
    const src = n.sourceFrame ? ` [${n.sourceFrame}]` : '';
    const layer = n.layer ? ` <${n.layer}>` : '';
    const gc = n.gcAllocCount ? ` gcAlloc=${n.gcAllocCount}` : '';
    lines.push(`${indent}└─ ${n.name} (${ms} / ${pct})${self}${layer}${gc}${src}`);
    count++;
  }
  lines.push('```');
  return lines.join('\n');
}

function alignedRow(a: AlignedHotNode): string {
  const u = a.unity ? `${fmtPct(a.unity.selfPct)} self / ${fmtPct(a.unity.totalPct)} total` : '—';
  const p = a.perfetto ? `${a.perfetto.name.slice(0, 32)} (${fmtPct(a.perfetto.totalPct)})` : '—';
  const s = a.simpleperf ? `${a.simpleperf.name.slice(0, 32)} (${fmtPct(a.simpleperf.totalPct)})` : '—';
  const conflict = a.conflict ? `⚠️ ${a.conflict.kind}` : '✅';
  return `| ${a.shortKey} | ${u} | ${p} | ${s} | ${conflict} |`;
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

/** 构建完整跨源 Markdown 报告（对标 ULTIMATE v5.3 / v4.1）。 */
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
  const sce = digest.sameCaptureExt;
  const tev = digest.throttlingEvidence;
  const off = digest.offCpuAttribution;

  const lines: string[] = [
    `# 跨源综合性能分析报告 — ${run.label || run.id} (${run.device || '?'} / ${run.scene || '?'})`,
    '',
    `> Run: \`${run.id}\` · 设备 ${run.device || '—'} · 场景 ${run.scene || '—'} · 源 ${run.sources.join(' + ')}`,
    `> 生成: cross-source-report-builder · ${digest.generatedAt.slice(0, 19)}`,
    `> 数据源: unity_profiler (${run.frameCount ?? '?'} 帧) + simpleperf + perfetto`,
    '',
    '---',
    '',
  ];

  // §0 一句话结论
  lines.push('## §0 一句话结论', '', `**${headline}**`, '');
  const topRec = insights.find(i => i.recommendation && i.severity !== 'info');
  if (topRec?.recommendation) {
    lines.push(`> **首要建议**: ${topRec.recommendation}`, '');
  }
  lines.push('---', '');

  // §1 同源性 / 可比性校验
  lines.push('## §1 同源性 / 可比性校验', '');
  lines.push('| 项 | unity | perfetto | simpleperf |');
  lines.push('|---|---|---|---|');
  lines.push(`| 时长 | ${fmtMs(sce.durationMs.unity)} | ${fmtMs(sce.durationMs.perfetto)} | ${fmtMs(sce.durationMs.simpleperf)} |`);
  lines.push(`| 帧口径 | playerloop | choreographer | — |`);
  lines.push('');
  lines.push(`- **时长偏差**: ${fmtPct(sce.durationDriftPct)} → 判定 **${sce.verdict}**`);
  if (sce.timeOffsetMaxMin != null) lines.push(`- **采集时刻偏差**: ${sce.timeOffsetMaxMin.toFixed(1)} 分钟`);
  lines.push(`- **关键**: playerloop vs choreographer **禁直比** — playerloop=Unity 主循环墙钟，choreographer=系统 vsync 节拍`);
  if (digest.frame.length) {
    lines.push('', '| source | def | P50 | P95 | P99 | FPS | 慢帧 |', '|---|---|---|---|---|---|---|');
    for (const f of digest.frame) {
      lines.push(`| ${f.source} | ${f.def} | ${fmtMs(f.p50Ms)} | ${fmtMs(f.p95Ms)} | ${fmtMs(f.p99Ms)} | ${f.fps.toFixed(1)} | ${fmtPct(f.slowFrameRate)} |`);
    }
  }
  lines.push('', '---', '');

  // §2 瓶颈类型定型
  lines.push('## §2 瓶颈类型定型', '');
  if (pfMain) {
    lines.push('| 证据 | 数值 | 出处 |', '|---|---|---|');
    lines.push(`| UnityMain Running | ${fmtPct(pfMain.runningPct)} | perfetto |`);
    lines.push(`| UnityMain Sleeping | ${fmtPct(pfMain.sleepingPct)} | perfetto |`);
    lines.push(`| UnityMain Runnable | ${fmtPct(pfMain.runnablePct)} | perfetto |`);
    if (bi.simpleperf_UnityMain_cpuPct != null) {
      lines.push(`| UnityMain 占全机 CPU | ${fmtPct(bi.simpleperf_UnityMain_cpuPct)} | simpleperf |`);
    }
    lines.push(`| 降频 verdict | ${tev.verdict} (sidecar=${tev.sidecarAvailable ? 'ok' : 'missing'}) | throttlingEvidence |`);
    lines.push(`| 大核 reachPct | ${fmtPct(tev.bigCoreReachPct)} | perfetto cpufreq |`);
    lines.push('');
    let bottleneck = '';
    if (pfMain.runningPct >= 80) bottleneck = '**CPU-bound** (UnityMain 主线程)';
    else if (pfMain.sleepingPct >= 30) bottleneck = '**等待型** — 看 §7 off-CPU 拆分确定等什么';
    else bottleneck = '**混合型** (算 + 等)';
    lines.push(`**判定**: ${bottleneck}`, '');
  } else {
    lines.push('_perfetto 主线程调度数据缺失_', '');
  }
  lines.push('---', '');

  // §3 主循环阶段分解（unity 主轴 + perfetto 佐证）
  lines.push('## §3 主循环阶段分解（unity worst+median 合成 ∥ perfetto atrace 佐证）', '');
  lines.push('### 3.1 Unity 一帧时间洋葱剥离', '');
  lines.push(renderIndentedTree(digest.unityCallTreeComposite, { maxLines: 30, minPct: 0.5 }));
  lines.push('');
  if (digest.perfettoCallTreeIndented.length) {
    lines.push('### 3.2 Perfetto atrace UnityMain 缩进树（同口径佐证）', '');
    const main = digest.perfettoCallTreeIndented.find(t => t.thread === 'UnityMain');
    if (main) lines.push(renderIndentedTree(main.nodes, { maxLines: 25, minPct: 1 }));
  }
  lines.push('', '---', '');

  // §4 Top 热点清单（三源对位 + 冲突标注）
  lines.push('## §4 Top 热点清单（三源对位 + 冲突标注）', '');
  if (digest.alignedHotNodes.length) {
    lines.push('| 业务节点 | unity | perfetto | simpleperf | 状态 |');
    lines.push('|---|---|---|---|---|');
    for (const a of digest.alignedHotNodes) lines.push(alignedRow(a));
    lines.push('');
    const conflicts = digest.alignedHotNodes.filter(a => a.conflict);
    if (conflicts.length) {
      lines.push('**冲突明细**:');
      for (const c of conflicts) lines.push(`- ⚠️ \`${c.shortKey}\`: ${c.conflict!.detail}`);
      lines.push('');
    }
  } else {
    lines.push('_无业务热点对位数据_', '');
  }
  lines.push('---', '');

  // §5 Top 波动 / 慢帧
  if (digest.unitySpikes.length) {
    lines.push('## §5 Top 波动 / 慢帧（Unity spikes）', '');
    lines.push('| marker | spike 倍数 | median → max | 帧窗口 |', '|---|---|---|---|');
    for (const s of digest.unitySpikes.slice(0, 8)) {
      lines.push(`| ${s.name} | ${s.spikeRatio?.toFixed(1) ?? '—'}× | ${fmtMs(s.msSelfMedian)} → ${fmtMs(s.msSelfMax)} | ${s.window ?? '—'} |`);
    }
    lines.push('');
    if (digest.gc.allocCount) {
      lines.push(`**GC 压力**: ${fmtNum(digest.gc.allocCount)} alloc/帧 → GC.Collect ${fmtMs(digest.gc.collectMsPerFrame)} ms/帧`, '');
    }
    lines.push('---', '');
  }

  // §6 Simpleperf 独家：so 负载分布 + 中间件功耗观感
  lines.push('## §6 Simpleperf 独家：so 负载分布 / 中间件功耗', '');
  if (digest.simpleperfSoBreakdown?.layers.length) {
    lines.push('### 6.1 So 分层占比（business / engine / runtime / middleware / noise）', '');
    lines.push('| 层 | 占比 | 头部 so |', '|---|---|---|');
    for (const l of digest.simpleperfSoBreakdown.layers) {
      const libs = l.libs.slice(0, 4).map(lb => `${lb.name} ${lb.pct.toFixed(2)}%`).join(', ');
      lines.push(`| **${l.layer}** | ${fmtPct(l.pct)} | ${libs || '—'} |`);
    }
    lines.push('');
    // libil2cpp vs libxlua 关键对比
    const business = digest.simpleperfSoBreakdown.layers.find(l => l.layer === 'business');
    if (business) {
      const il2cpp = business.libs.find(lb => /libil2cpp/i.test(lb.name));
      const xlua = business.libs.find(lb => /libxlua/i.test(lb.name));
      if (il2cpp && xlua) {
        lines.push(`**主线程 C# vs Lua 对比**: libil2cpp ${il2cpp.pct.toFixed(2)}% vs libxlua ${xlua.pct.toFixed(2)}% → C#/Lua 比 ${(il2cpp.pct / xlua.pct).toFixed(1)}×`, '');
      }
    }
  }
  if (digest.threadCategory.length) {
    lines.push('### 6.2 线程身份分类（功耗观感）', '');
    lines.push('| 线程 | 占机 CPU | 类别 |', '|---|---|---|');
    for (const t of digest.threadCategory.slice(0, 12)) {
      lines.push(`| ${t.name} | ${fmtPct(t.cpuPct)} | ${t.category} (${t.reason}) |`);
    }
    lines.push('');
  }
  if (digest.nativeReverseCallStack.length) {
    lines.push('### 6.3 Native 函数反向调用栈（Top selfPct）', '');
    for (const e of digest.nativeReverseCallStack.slice(0, 4)) {
      lines.push(`**${e.func}** (selfPct=${e.selfPct.toFixed(2)}%) on \`${e.thread}\``);
      lines.push('```');
      e.callers.forEach((c, i) => lines.push(`${'  '.repeat(i)}└─ ${c.name} (${fmtPct(c.totalPct)})`));
      lines.push('```');
    }
    lines.push('');
  }
  lines.push('---', '');

  // §7 Perfetto 独家：调度 / 互等 / 降频
  lines.push('## §7 Perfetto 独家：调度 / 互等 / 降频', '');
  lines.push('### 7.1 Off-CPU 等待原因分类', '');
  lines.push(`数据源：**${off.dataSource}** — ${off.note}`, '');
  if (off.sleepingPct != null) {
    lines.push('| 等待类别 | 占主线程时间 | 来源 slice |', '|---|---|---|');
    const cat = off.byCategory;
    lines.push(`| 等 GPU | ${fmtPct(cat.gpu_wait.pctOfMain)} | ${cat.gpu_wait.sliceNames.join(', ') || '—'} |`);
    lines.push(`| 等 vsync | ${fmtPct(cat.vsync_wait.pctOfMain)} | ${cat.vsync_wait.sliceNames.join(', ') || '—'} |`);
    lines.push(`| 等锁 | ${fmtPct(cat.lock_wait.pctOfMain)} | ${cat.lock_wait.sliceNames.join(', ') || '—'} |`);
    lines.push(`| 等 binder | ${fmtPct(cat.binder_wait.pctOfMain)} | ${cat.binder_wait.sliceNames.join(', ') || '—'} |`);
    lines.push(`| GC STW | ${fmtPct(cat.gc_stw.pctOfMain)} | ${cat.gc_stw.sliceNames.join(', ') || '—'} |`);
    lines.push(`| other_sleep | ${fmtPct(cat.other_sleep.pctOfMain)} | (${cat.other_sleep.note}) |`);
    lines.push('');
    if (off.evidence.length) {
      lines.push('**关键证据**:');
      for (const e of off.evidence) lines.push(`- ${e}`);
      lines.push('');
    }
  }
  const itw = digest.interThreadWait;
  lines.push('### 7.2 多线程互等', '');
  lines.push(`- **binder**: ${itw.binder.count} 次 / 平均 ${fmtMs(itw.binder.avgMs)} / 对端 server ${itw.binder.serverPid ?? '—'} (${itw.binder.serverName ?? '未识别'})`);
  if (itw.renderWaitGpu.totalMs != null) lines.push(`- **Render 等 GPU**: ${fmtMs(itw.renderWaitGpu.totalMs)} (${fmtPct(itw.renderWaitGpu.pctOfRender)})`);
  else lines.push(`- **Render 等 GPU**: ${itw.renderWaitGpu.note}`);
  if (itw.mainVsRender) lines.push(`- **主 vs Render 关系**: ${itw.mainVsRender.relation}`);
  lines.push('');
  lines.push('### 7.3 降频证据链', '');
  lines.push(`- **verdict**: ${tev.verdict} (sidecar=${tev.sidecarAvailable ? 'ok' : 'missing'})`);
  if (tev.thermal.before || tev.thermal.after) {
    lines.push(`- **温度**: before ${tev.thermal.before?.tempsMaxC ?? '—'}°C → after ${tev.thermal.after?.tempsMaxC ?? '—'}°C${tev.thermal.deltaC != null ? ` (Δ ${tev.thermal.deltaC > 0 ? '+' : ''}${tev.thermal.deltaC}°C)` : ''}`);
  }
  if (tev.cpuinfoMaxFreqMhz.length) lines.push(`- **cpuinfo_max_freq**: ${tev.cpuinfoMaxFreqMhz.join(' / ')} MHz`);
  if (tev.scalingMaxFreqMhz.length) lines.push(`- **scaling_max_freq**: ${tev.scalingMaxFreqMhz.join(' / ')} MHz`);
  if (tev.bigCoreReachPct != null) lines.push(`- **大核 reach**: ${fmtPct(tev.bigCoreReachPct)}`);
  if (tev.coolingActive) lines.push(`- **cooling 激活**: 是`);
  for (const e of tev.evidence) lines.push(`  - ${e}`);
  lines.push('');
  lines.push('---', '');

  // §8 可执行建议
  lines.push(...insightSection(insights, i => i.id.startsWith('cross.'), '§8.1 共性结论 (多源同向, 高置信)'));
  lines.push(...insightSection(insights, i => i.id.startsWith('unique.'), '§8.2 各源独有问题'));
  lines.push(...insightSection(
    insights,
    i => !!i.recommendation && !i.id.startsWith('unique.') && !i.id.startsWith('cross.'),
    '§8.3 可执行建议',
  ));

  // §9 局限与可信度
  lines.push('## §9 局限与可信度', '');
  if (digest.capabilityMatrix.length) {
    lines.push('| 维度 | 状态 | 说明 |', '|---|---|---|');
    for (const c of digest.capabilityMatrix) {
      const icon = c.status === 'ok' ? '✅' : c.status === 'partial' ? '🟡' : '❌';
      lines.push(`| ${c.dimension} | ${icon} ${c.status} | ${c.note} |`);
    }
    lines.push('');
  }
  if (notes.length) lines.push(...notes.map(n => `- ${n}`), '');
  if (!digest.sourceMapAvailable) lines.push('- **源码映射**: 未配置 projectPath，建议只能到 marker/manager 级');

  lines.push('', '---', '', `_本报告由 cross-source-analysis skill 自动产出 (digest 版本: Phase 4) · 共 ${digest.alignedHotNodes.length} 业务对位 · ${digest.nativeReverseCallStack.length} native 反向追溯_`);

  return lines.join('\n');
}
