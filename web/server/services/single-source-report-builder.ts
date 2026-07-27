// 单源 Objective Action Builder — 客观指标为基座，AOE 知识库为可选补充

import type { SkillKind } from './skill-config.js';
import {
  type SummaryJson,
  type ActionItem,
  type TreeNode,
  pct,
  ms,
  metricVal,
  classifySimpleperfHotspot,
  isAtraceObserverHotspot,
  findPlayerLoopPhases,
  findHotspotCallChain,
  detectAtraceOverhead,
  matchAoeHint,
  sortActions,
  renderActionsSection,
} from './objective-report-utils.js';

function pushAction(actions: ActionItem[], item: ActionItem): void {
  if (!actions.some(a => a.title === item.title)) actions.push(item);
}

export function buildPerfettoMarkdown(summary: SummaryJson): { headline: string; markdown: string } {
  const meta = (summary.meta as Record<string, unknown>) ?? {};
  const metrics = (summary.metrics as Array<{ key: string; value: number }>) ?? [];
  const frame = (summary.frame as Array<Record<string, number | string>>) ?? [];
  const sched = summary.threadSchedView as {
    primary?: Array<{ name: string; runningPct: number; runnablePct: number; sleepingPct: number }>;
    jobWorkers?: Array<{ name: string; runningPct: number }>;
  } | null;
  const off = summary.offCpuReasons as {
    plainLanguage?: string; interpretation?: string; sleepingPct?: number;
  } | null;
  const throttling = summary.throttling as { level?: string; bigCoreReachPct?: number; evidence?: string[]; confirmedAvailable?: boolean } | null;
  const aoe = (summary.aoeHotSlices as Array<{ label: string; totalPct: number; totalMs: number; avgMs: number; count: number }>) ?? [];
  const fa = summary.frameAnalysis as {
    summary?: { count?: number; p50Ms?: number; p95Ms?: number; fps?: number; slowFrameRate33?: number };
    flags?: Array<{ frameIndex: number; targetId: string; ruleId: string; severity: string; message: string }>;
  } | null;
  const callTrees = (summary.callTrees as Array<{ thread?: string; root?: TreeNode }>) ?? [];
  const atrace = (summary.atraceSlices as Record<string, { avgMs?: number; count?: number }>) ?? {};
  const parseStatus = summary.parseStatus as string | undefined;
  const parseNotes = summary.parseNotes as string | undefined;
  const choreo = frame.find(f => f.frameDefinition === 'choreographer');
  const playerloopFrame = frame.find(f => f.frameDefinition === 'playerloop');

  const mainRun = metricVal(metrics, 'thread.UnityMain.runningPct') ?? 0;
  const mainSleep = metricVal(metrics, 'thread.UnityMain.sleepingPct') ?? 0;
  const gfxRun = metricVal(metrics, 'thread.UnityGfxRenderS.runningPct') ?? 0;
  const phases = findPlayerLoopPhases(callTrees);

  const cpuBound = mainRun >= 70;
  const waitBound = mainSleep >= 40 && mainRun < 50;
  const bottleneckLabel = cpuBound
    ? 'CPU-bound（主线程在算）'
    : waitBound
      ? '等待型（主线程多在睡眠）'
      : '混合 / 需结合阶段树细判';

  const plP50 = fa?.summary?.p50Ms ?? (playerloopFrame?.p50Ms as number | undefined);
  const plP95 = fa?.summary?.p95Ms ?? (playerloopFrame?.p95Ms as number | undefined);
  const slowPct = fa?.summary?.slowFrameRate33 ?? 0;

  const actions: ActionItem[] = [];

  if (cpuBound) {
    const scriptPct = phases
      .filter(p => p.name.includes('BehaviourUpdate') || p.name.includes('ScriptRun'))
      .reduce((s, p) => s + p.totalPct, 0);
    pushAction(actions, {
      priority: 1,
      title: '削减主线程 CPU 计算（头号方向）',
      why: `UnityMain Running ${mainRun.toFixed(1)}% → 瓶颈在主线程真实计算，不是等 GPU/锁/vsync。`,
      action: scriptPct >= 25
        ? '优先优化 Update/LateUpdate 脚本路径（BehaviourUpdate 子树）；对照下方阶段表与 AOE 命中模块逐项减频/裁剪。'
        : '主线程在算但脚本占比不极端 → 同时看 FinishFrameRendering 与 URP 主线程收尾。',
      evidence: `thread.UnityMain.runningPct=${mainRun.toFixed(1)}% · offCpuReasons.interpretation`,
    });
  } else if (waitBound) {
    pushAction(actions, {
      priority: 1,
      title: '排查主线程在等什么（off-CPU / GPU / 锁）',
      why: `UnityMain Sleeping ${mainSleep.toFixed(1)}%，Running 仅 ${mainRun.toFixed(1)}%。`,
      action: '结合渲染线程 Sleeping%、WaitForPresent/Gfx.WaitForPresent slice、binder 与 FrameTimeline（若可采）判断等 GPU / vsync / 锁。',
      evidence: `thread.UnityMain.sleepingPct=${mainSleep.toFixed(1)}%`,
    });
  }

  const finishRender = phases.find(p => p.name.includes('FinishFrameRendering'));
  if (finishRender && finishRender.totalPct >= 20) {
    pushAction(actions, {
      priority: 2,
      title: '定位主线程渲染收尾（FinishFrameRendering）',
      why: `PostLateUpdate.FinishFrameRendering 占主线程 ${finishRender.totalPct.toFixed(1)}%，偏高。`,
      action: '查 URP RenderSingleCamera / CullScriptable / 批处理与 SRP 命令构建；渲染线程 Running 低时更像主线程侧 CPU 工作而非等 GPU。',
      evidence: `callTrees.UnityMain → PlayerLoop → ${finishRender.name} ${finishRender.totalPct.toFixed(1)}%`,
    });
  }

  const canvas = aoe.find(s => s.label.includes('PlayerUpdateCanvases'));
  if (canvas && canvas.avgMs >= 1.0) {
    pushAction(actions, {
      priority: 3,
      title: '减少 UGUI Canvas 重建',
      why: `PlayerUpdateCanvases 均次 ${canvas.avgMs.toFixed(2)}ms（知识库：MeshUI 化后 >1ms 不合理）。`,
      action: '拆分动静 Canvas、避免每帧 dirty；确认压测场景是否仍有 UGUI 未迁移。',
      evidence: `aoeHotSlices.PlayerUpdateCanvases avgMs=${canvas.avgMs.toFixed(2)}`,
    });
  }

  if (slowPct >= 10) {
    pushAction(actions, {
      priority: 3,
      title: '针对慢帧做逐帧下钻',
      why: `PlayerLoop >33ms 占比 ${slowPct.toFixed(1)}%（P95 ${ms(plP95)}）。`,
      action: '在 Web 详情查看 frameAnalysis.flags 命中帧；对照 TServer/MapSignificance/GC 尖刺帧。',
      evidence: `frame.playerloop.p95Ms=${plP95?.toFixed(2) ?? '—'} · slowFrameRate33=${slowPct.toFixed(1)}%`,
    });
  }

  const gcSlice = atrace['GC.Collect'];
  if (gcSlice && (gcSlice.avgMs ?? 0) >= 5) {
    pushAction(actions, {
      priority: 4,
      title: '抑制 GC 尖刺（与 Unity/simpleperf 交叉）',
      why: `atrace GC.Collect 均次 ${gcSlice.avgMs?.toFixed(1)}ms。`,
      action: '查每帧托管分配/GC.Alloc；削减触发同步 GC 的分配点。',
      evidence: `atraceSlices.GC.Collect avgMs=${gcSlice.avgMs?.toFixed(1)}`,
    });
  }

  if (throttling?.level === 'suspected' || throttling?.level === 'confirmed') {
    pushAction(actions, {
      priority: 5,
      title: '确认是否降频并纳入结论折扣',
      why: `降频 level=${throttling.level}，大核可达 ${pct(throttling.bigCoreReachPct)}。`,
      action: '补采带 thermal/sysfs 旁路（scaling_max_freq vs cpuinfo_max_freq）；确认后再对帧结论打折。',
      evidence: 'detail.perfetto.throttling',
    });
  }

  if (!summary.frameTimeline) {
    pushAction(actions, {
      priority: 8,
      title: '补采 FrameTimeline 以量化显示掉帧',
      why: '本 trace 无 actual_frame_timeline → 无法量化 VSync miss。',
      action: '重采 trace 并开启 FrameTimeline；区分应用卡 vs 合成/显示链路卡。',
      evidence: 'detail.perfetto.frameTimeline=null',
    });
  }

  const headline = cpuBound
    ? `Perfetto: CPU-bound · UnityMain Running ${mainRun.toFixed(0)}% · PlayerLoop P95 ${ms(plP95, 1)}`
    : `Perfetto: ${bottleneckLabel} · UnityMain Running ${mainRun.toFixed(0)}%`;

  const topConclusion = cpuBound
    ? `**${bottleneckLabel}** — 主线程 ${mainRun.toFixed(1)}% 在 Running，优化方向是**减主线程计算量**，不是等 GPU。PlayerLoop P50 ${ms(plP50)} / P95 ${ms(plP95)}。`
    : waitBound
      ? `**${bottleneckLabel}** — 主线程 Sleeping ${mainSleep.toFixed(1)}%，需先弄清在等什么再定优化方向。`
      : `**${bottleneckLabel}** — UnityMain Running ${mainRun.toFixed(1)}% / Sleeping ${mainSleep.toFixed(1)}%。`;

  const lines: string[] = [
    '# 系统级性能分析报告 · perfetto 单源',
    '',
    `> **结论**: ${topConclusion}`,
    '> 数据源：仅 perfetto（Why：线程在算还是在等、机器状态）。**帧口径 PlayerLoop 与 Choreographer 不同，禁直比**（见 §十）。',
    `> 设备 ${meta.device ?? '—'} · 场景 ${meta.scene ?? '—'} · 窗口 ~${meta.durationSec ?? '—'}s · builder: objective-action`,
    '',
    '---',
    '',
    '## 必做动作（按 ROI）',
    '',
    ...renderActionsSection(sortActions(actions)),
    '---',
    '',
    '## 一、概览',
    '',
    '| 维度 | 数值 | 证据 |',
    '|---|---|---|',
    `| 瓶颈定性 | **${bottleneckLabel}** | thread.UnityMain.* |`,
    `| 主线程 Running / Sleeping | ${pct(mainRun)} / ${pct(mainSleep)} | metrics |`,
    `| 渲染线程 Running | ${pct(gfxRun)}（Sleeping 高常正常） | thread.UnityGfxRenderS |`,
    `| PlayerLoop P50 / P95 | ${ms(plP50)} / ${ms(plP95)} | frameAnalysis / frame.playerloop |`,
    `| PlayerLoop 慢帧 >33ms | ${pct(slowPct)} | frameAnalysis |`,
    `| CPU 均频 | ${metricVal(metrics, 'system.cpuFreqAvgMhz')?.toFixed(0) ?? '—'} MHz | system.cpuFreqAvgMhz |`,
    `| 降频 | ${throttling?.level ?? '—'}${throttling?.confirmedAvailable ? '' : '（推测级）'} | throttling |`,
    `| 解析状态 | ${parseStatus ?? '—'} | parseStatus |`,
    '',
    '---',
    '',
    '## 二、瓶颈类型定性（核心）',
    '',
    off?.interpretation ?? `_Running ${pct(mainRun)} / Sleeping ${pct(mainSleep)}_`,
    '',
    gfxRun < 25 && cpuBound
      ? `渲染线程 UnityGfxRenderS Running 仅 ${pct(gfxRun)} → **渲染线程不是瓶颈**，与主线程 CPU-bound 一致。`
      : '',
    '',
    '---',
    '',
    '## 三、主线程 PlayerLoop 阶段（atrace 子树）',
    '',
    '> 来自 callTrees[UnityMain] PlayerLoop 直接子阶段 totalPct；回答「一帧时间花在哪些阶段」。',
    '',
    '| 阶段 | 占主线程 | 说明 |',
    '|---|---|---|',
  ];

  const phaseHints: Record<string, string> = {
    'Update.ScriptRunBehaviourUpdate': 'C# Update / 脚本',
    'PreLateUpdate.ScriptRunBehaviourLateUpdate': 'C# LateUpdate',
    'PostLateUpdate.FinishFrameRendering': '帧渲染收尾 / URP 主线程部分',
    'PostLateUpdate.PlayerUpdateCanvases': 'UGUI Canvas（应偏低若已 MeshUI 化）',
    'PostLateUpdate.PlayerSendFrameComplete': '帧提交完成',
  };

  for (const p of phases.slice(0, 8)) {
    const hint = phaseHints[p.name] ?? (p.name.includes('Script') ? '脚本' : '');
    lines.push(`| ${p.name} | ${pct(p.totalPct)} | ${hint} |`);
  }
  if (!phases.length) lines.push('| _无 PlayerLoop 子树_ | — | 检查 callTrees |');

  lines.push('', '---', '', '## 四、线程调度', '', '| 线程 | Running | Runnable | Sleeping |', '|---|---|---|---|');
  for (const t of sched?.primary ?? []) {
    lines.push(`| ${t.name} | ${pct(t.runningPct)} | ${pct(t.runnablePct)} | ${pct(t.sleepingPct)} |`);
  }
  if (sched?.jobWorkers?.length) {
    lines.push('', '**JobWorker 池**（ECS 并行算力）:');
    for (const j of sched.jobWorkers.slice(0, 6)) {
      lines.push(`- ${j.name}: Running ${pct(j.runningPct)}`);
    }
  }

  lines.push('', '---', '', '## 五、off-CPU 说明（人话）', '');
  if (off?.plainLanguage) lines.push(off.plainLanguage, '');
  if (off?.interpretation) lines.push(`**本样本**: ${off.interpretation}`, '');

  const aoeHits = aoe.filter(s => matchAoeHint(s.label));
  if (aoeHits.length) {
    lines.push('', '---', '', '## 六、AOE 业务关注点（补充，非全量分析基座）', '',
      '> 以下仅覆盖知识库已登记模块；未列出者仍可能存在于上方阶段树/flags 中。',
      '', '| 模块 | 均次 | 窗口占比 | 知识库 | 建议 |', '|---|---|---|---|---|');
    for (const s of aoeHits.slice(0, 10)) {
      const hint = matchAoeHint(s.label)!;
      const warn = hint.warnAvgMs != null && s.avgMs >= hint.warnAvgMs ? ' ⚠️' : '';
      lines.push(`| ${s.label}${warn} | ${ms(s.avgMs)} | ${pct(s.totalPct)} | ${hint.knowledgeRef} | ${hint.action.slice(0, 80)}… |`);
    }
  }

  if (fa?.summary?.count) {
    lines.push('', '---', '', '## 七、PlayerLoop 逐帧统计', '',
      '| 指标 | 值 |', '|---|---|',
      `| 帧数 | ${fa.summary.count} |`,
      `| P50 / P95 | ${ms(fa.summary.p50Ms)} / ${ms(fa.summary.p95Ms)} |`,
      `| FPS | ${fa.summary.fps?.toFixed?.(1) ?? '—'} |`,
      `| >33ms | ${pct(fa.summary.slowFrameRate33)} |`,
    );
    const flags = fa.flags?.slice(0, 6) ?? [];
    if (flags.length) {
      lines.push('', '**规则命中（节选）**:');
      for (const f of flags) lines.push(`- 帧 ${f.frameIndex} · ${f.targetId} · ${f.message}`);
    }
  }

  lines.push('', '---', '', '## 八、降频与机器状态', '');
  if (throttling) {
    lines.push(`- level: **${throttling.level}** · 大核可达 ${pct(throttling.bigCoreReachPct)}`);
    if (throttling.evidence?.length) throttling.evidence.slice(0, 3).forEach(e => lines.push(`- ${e}`));
  }
  lines.push(`- Binder: ${metricVal(metrics, 'system.binder.count') ?? '—'} 次 · PSS ${metricVal(metrics, 'system.pssMb') ?? '—'} MB`);

  lines.push('', '---', '', '## 九、局限与可信度', '');
  if (parseNotes) lines.push(`- ${parseNotes}`, '');
  lines.push(
    '- perfetto **不能**回答 native 函数级热点（→ simpleperf）',
    '- GPU 是否瓶颈：无 GPU busy 计数器时**无法定论**',
    '- 显示掉帧：无 FrameTimeline 时**无法量化** VSync miss',
    '- 降频确认级需 sysfs/thermal 旁路',
  );

  lines.push('', '---', '', '## 十、帧口径：Choreographer 是什么？', '',
    '**Choreographer** = Android 系统 Choreographer#doFrame 间隔，表示**屏幕刷新节拍（vsync）**，不是 Unity 算完一帧的耗时。',
    '',
    choreo
      ? `- 本样本 Choreographer：P50 ${ms(choreo.p50Ms as number)} · fps ${(choreo.fps as number)?.toFixed?.(1) ?? '—'}（≈60Hz 显示节拍）`
      : '- 本样本无 Choreographer 摘要',
    plP50
      ? `- 本样本 PlayerLoop（应用帧）：P50 ${ms(plP50)} · P95 ${ms(plP95)} — **与 Unity Profiler 可比**`
      : '',
    '',
    '**禁止**把 Choreographer 16.6ms 与 PlayerLoop 26ms 直接比较；前者是显示信号，后者是应用主循环墙钟。',
  );

  return { headline, markdown: lines.filter(l => l !== undefined).join('\n') };
}

export function buildSimpleperfMarkdown(summary: SummaryJson): { headline: string; markdown: string } {
  const meta = (summary.meta as Record<string, unknown>) ?? {};
  const sc = summary.symbolCheck as {
    status?: string; appSymbolizedPct?: number; anchorsResolved?: number; anchorsTotal?: number;
    notes?: string[]; stackUnwind?: { status?: string; summary?: string };
  } | null;
  const lb = summary.layerBreakdown as Record<string, number> | null;
  const hotspots = (summary.hotspots as Array<{ func: string; lib: string; pct: number; self_ms: number }>) ?? [];
  const libs = (summary.libs as Array<{ name: string; pct: number }>) ?? [];
  const threads = (summary.threads as Array<{ name: string; pct: number }>) ?? [];
  const anchors = (summary.anchors as Array<{ name: string; subtreePct: number; subtreeMs: number }>) ?? [];
  const callTrees = (summary.callTrees as Array<{ thread?: string; root?: TreeNode }>) ?? [];
  const event = (meta.event as string) ?? 'cpu-clock';

  const stackOk = sc?.stackUnwind?.status === 'PASS';
  const symStatus = sc?.status ?? 'UNKNOWN';
  const symFail = symStatus === 'FAIL';
  const symWarn = symStatus === 'WARN' || symStatus === 'PASS_WITH_WARNING';
  const mainThread = threads.find(t => t.name === 'UnityMain');
  const mainPct = mainThread?.pct ?? 0;
  const controllable = (lb?.business ?? 0) + (lb?.engine ?? 0);

  const classified = hotspots.map(h => ({ ...h, layer: classifySimpleperfHotspot(h.func, h.lib) }));
  const businessHot = classified.filter(h => h.layer === 'business').slice(0, 8);
  const engineHot = classified.filter(h => h.layer === 'engine').slice(0, 6);
  const runtimeHot = classified.filter(h => h.layer === 'runtime').slice(0, 6);
  const atraceDetected = detectAtraceOverhead(callTrees) || classified.some(h => isAtraceObserverHotspot(h.func, h.lib));

  const actions: ActionItem[] = [];

  if (symFail || !stackOk) {
    pushAction(actions, {
      priority: 0,
      title: '先修复符号/栈再信函数级结论',
      why: `symbolCheck=${symStatus} · stackUnwind=${sc?.stackUnwind?.status ?? '—'}`,
      action: symFail
        ? '补全 binary_cache / .dbg.so；函数名未还原前仅参考 so/线程占比。'
        : '修复栈 unwind（见 docs/simpleperf_symbol_fix）；确认 __start_thread 可达。',
      evidence: 'symbolCheck + stackUnwind',
    });
  }

  if (atraceDetected) {
    pushAction(actions, {
      priority: 1,
      title: '排除 ATrace 观测开销后重采',
      why: '采样中检测到 atrace/vfprintf 链路 → 部分 CPU 可能是 trace 埋点，不是游戏逻辑。',
      action: '正式基线用非 trace 构建重采 perf.data；对比前后业务函数占比。',
      evidence: 'callTrees / hotspots 含 atrace 或 __vfprintf',
    });
  }

  if (mainPct >= 35 && !symFail) {
    pushAction(actions, {
      priority: 2,
      title: '优先优化 UnityMain 主线程 native 热点',
      why: `UnityMain 占全 CPU ${mainPct.toFixed(1)}%，ROI 最高。`,
      action: businessHot.length
        ? `先看业务层热点：${businessHot.slice(0, 3).map(h => h.func.slice(0, 40)).join('、')}。`
        : '符号不足时先看 libil2cpp/libunity 占比与 anchor 子树。',
      evidence: `cpu.thread.UnityMain.pct=${mainPct.toFixed(1)}%`,
    });
  }

  const wwise = libs.find(l => l.name.includes('AkSoundEngine'));
  if (wwise && wwise.pct >= 5) {
    pushAction(actions, {
      priority: 3,
      title: '核查 Wwise 音频 CPU',
      why: `libAkSoundEngine 占 ${wwise.pct.toFixed(1)}%，普通战斗采样偏高。`,
      action: '查并发 voice 数、DSP 效果链；用 Wwise Profiler 交叉确认。',
      evidence: `cpu.lib.libAkSoundEngine.pct=${wwise.pct.toFixed(1)}%`,
    });
  }

  const allocHot = classified.filter(h =>
    h.func.includes('MemoryManager') || h.func.includes('Allocate') || h.func.includes('GC'),
  );
  if (allocHot.reduce((s, h) => s + h.pct, 0) >= 2) {
    pushAction(actions, {
      priority: 4,
      title: '查内存分配 / GC 压力（与 Unity GC 交叉）',
      why: 'MemoryManager/Allocate 或 GC 相关 self% 合计偏高。',
      action: '对照 Unity Profiler GC.Alloc；减每帧托管/native 分配。',
      evidence: allocHot.map(h => `${h.func.slice(0, 36)} ${h.pct.toFixed(2)}%`).join('; '),
    });
  }

  const renderAnchor = anchors.find(a => a.name.includes('Render') || a.name.includes('GfxDevice'));
  if (renderAnchor && renderAnchor.subtreePct >= 15) {
    pushAction(actions, {
      priority: 5,
      title: '定位渲染管线 native 开销',
      why: `${renderAnchor.name} 子树 ${renderAnchor.subtreePct.toFixed(1)}%。`,
      action: '结合 engine 层热点（DrawRenderers、UIGeometryJob、Shader props）查批处理与 UI 几何。',
      evidence: `anchor.${renderAnchor.name} subtreePct=${renderAnchor.subtreePct.toFixed(1)}%`,
    });
  }

  if (symWarn && (sc?.appSymbolizedPct ?? 0) < 85) {
    pushAction(actions, {
      priority: 6,
      title: '提升 il2cpp 符号化率',
      why: `应用层符号化 ${pct(sc?.appSymbolizedPct)}，热点可能显示为 libil2cpp.so[+offset]。`,
      action: '按 SIMPLEPERF_TROUBLESHOOTING 补 .dbg.so / binary_cache；目标 ≥85%。',
      evidence: `symbolCheck.appSymbolizedPct=${sc?.appSymbolizedPct?.toFixed(1)}%`,
    });
  }

  const headline = symFail
    ? `simpleperf: 符号 FAIL — 仅参考 so/线程级`
    : `simpleperf: UnityMain ${mainPct.toFixed(0)}% CPU · 可控层 ${controllable.toFixed(0)}% · ${symStatus}`;

  const topLine = symFail
    ? '符号/栈未通过 → **函数级结论不可信**，以下仅 so/线程/分层占比可参考。'
    : mainPct >= 35
      ? `CPU **高度集中在 UnityMain（${mainPct.toFixed(1)}%）**，典型主线程 native 瓶颈。可控层（业务+引擎）约 ${controllable.toFixed(0)}%。`
      : `CPU 分布在多线程；UnityMain ${mainPct.toFixed(1)}%。可控层约 ${controllable.toFixed(0)}%。`;

  const lines: string[] = [
    '# CPU 性能分析报告 · simpleperf 单源',
    '',
    `> **结论**: ${topLine}`,
    '> 数据源：仅 simpleperf（Where：CPU 周期在哪个函数/库）。**不能**单独回答在算还是在等（→ perfetto）或引擎语义 marker（→ Unity）。',
    `> ${meta.device ?? '—'} · ${event} · 样本 ${meta.totalSamples ?? '—'} · builder: objective-action`,
    '',
    '---',
    '',
    '## 必做动作（按 ROI）',
    '',
    ...renderActionsSection(sortActions(actions)),
    '---',
    '',
    '## 一、概览 · 可信度门槛',
    '',
    '| 项 | 值 |',
    '|---|---|',
    `| symbolCheck | **${symStatus}** |`,
    `| 应用层符号化 | ${pct(sc?.appSymbolizedPct)} |`,
    `| stackUnwind | **${sc?.stackUnwind?.status ?? '—'}** |`,
    `| anchor 命中 | ${sc?.anchorsResolved ?? 0} / ${sc?.anchorsTotal ?? 0} |`,
    '',
  ];

  if (sc?.notes?.length) lines.push(...sc.notes.map(n => `- ${n}`), '');

  lines.push('---', '', '## 二、分层占比（结论先行）', '',
    '> **业务+引擎** ≈ 应用可控 CPU；**runtime+noise** 多为系统/驱动/观测开销。',
    '',
    '| 层 | 占比 | 含义 |',
    '|---|---|---|',
  );
  if (lb) {
    lines.push(
      `| 业务 | ${pct(lb.business)} | il2cpp/Lua/Burst/自研 |`,
      `| 引擎 | ${pct(lb.engine)} | libunity / 中间件 |`,
      `| 运行时 | ${pct(lb.runtime)} | libc/GLES/分配器 — **勿当业务热点优化** |`,
      `| 噪音 | ${pct(lb.noise)} | kernel/unknown |`,
    );
  }

  lines.push('', '---', '', '## 三、线程与库（Level 1）', '', '**线程 Top**:');
  for (const t of threads.slice(0, 6)) {
    const note = t.name === 'UnityMain' ? ' ← 主线程瓶颈' : '';
    lines.push(`- ${t.name}: ${pct(t.pct)}${note}`);
  }
  lines.push('', '**库 Top**:');
  for (const l of libs.slice(0, 8)) lines.push(`- ${l.name}: ${pct(l.pct)}`);

  lines.push('', '---', '', '## 四、热点函数（过滤后 · Level 3）', '',
    '> 已过滤 libc/libm/GLES 等 runtime 噪音；FAIL 时本节降级为参考。',
    '');

  if (symFail) {
    lines.push('_symbolCheck=FAIL：跳过函数级热点叙事，请看 §三 so/线程。_', '');
  } else {
    if (businessHot.length) {
      lines.push('### 业务层');
      for (const h of businessHot) {
        lines.push(`- **${h.func.slice(0, 56)}** · ${h.lib} · self ${pct(h.pct, 2)} · ${h.self_ms?.toFixed(0) ?? '—'} ms`);
        const chain = findHotspotCallChain(callTrees, h.func);
        if (chain) lines.push('  ```', `  ${chain}`, '  ```');
      }
      lines.push('');
    }
    if (engineHot.length) {
      lines.push('### 引擎层');
      for (const h of engineHot) {
        lines.push(`- ${h.func.slice(0, 56)} · self ${pct(h.pct, 2)}`);
      }
      lines.push('');
    }
    if (runtimeHot.length) {
      lines.push('### 运行时（勿当业务优化目标）');
      for (const h of runtimeHot.slice(0, 4)) {
        const tag = isAtraceObserverHotspot(h.func, h.lib) ? ' ⚠️ 可能含 trace 观测' : '';
        lines.push(`- ${h.func.slice(0, 48)} · ${pct(h.pct, 2)}${tag}`);
      }
      lines.push('');
    }
  }

  const hitAnchors = anchors.filter(a => a.subtreePct > 0);
  if (hitAnchors.length) {
    lines.push('---', '', '## 五、Anchor 子树（Level 2 · 抗内联）', '',
      '| anchor | 子树占比 | ms | 含义 |', '|---|---|---|---|');
    for (const a of hitAnchors) {
      let hint = '';
      if (a.name.includes('ScriptRunBehaviourUpdate')) hint = '脚本 Update 入口';
      else if (a.name.includes('ExecutePlayerLoop')) hint = '主循环入口';
      else if (a.name.includes('GfxDevice')) hint = '渲染 worker';
      else if (a.name.includes('RenderLoop')) hint = 'URP 渲染';
      lines.push(`| ${a.name} | ${pct(a.subtreePct, 2)} | ${a.subtreeMs?.toFixed(0) ?? '—'} | ${hint} |`);
    }
  }

  lines.push('', '---', '', '## 六、与 Unity / Perfetto 如何配合', '',
    '| 问题 | simpleperf | 需其它源 |',
    '|---|---|---|',
    '| native 函数/so 热点 | ✅ | — |',
    '| 主线程在算还是在等 | ❌ | perfetto Running/Sleeping |',
    '| 业务 marker / 每帧 ms | ❌ | Unity Profiler |',
    '| 降频 / GPU | ❌ | perfetto |',
    '',
    '**建议**：本报告定 native 热点方向 → perfetto 确认是否 CPU-bound → Unity 定脚本/GC 分配点。',
  );

  lines.push('', '---', '', '## 七、局限与可信度', '',
    `- event=\`${event}\`${event.includes('cycles') ? '：ms 为缩放周期（相对值）' : '：占比为采样 self%'}`,
    symWarn ? `- 符号 WARN：部分 il2cpp 为 [+offset]，业务热点可能不完整` : '',
    atraceDetected ? '- ⚠️ 检测到 atrace 链路：业务占比可能被观测开销抬高' : '',
    stackOk ? '- 栈 unwind PASS：call chain 可信' : '- 栈 unwind 异常：call chain 降级',
    '',
    '_完整 callTrees 见 simpleperf-profile.json；本报告由 objective-action builder 生成。_',
  );

  return { headline, markdown: lines.filter(l => l !== undefined).join('\n') };
}

export function buildBuiltinSingleSourceMarkdown(
  kind: SkillKind,
  summary: SummaryJson,
): { headline: string; markdown: string } {
  if (kind === 'perfetto') return buildPerfettoMarkdown(summary);
  if (kind === 'simpleperf') return buildSimpleperfMarkdown(summary);
  throw new Error(`无 objective builder: ${kind}`);
}
