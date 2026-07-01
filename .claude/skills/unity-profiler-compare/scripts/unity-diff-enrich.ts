/**
 * unity-diff-enrich.ts — 确定性叙事 enrich 层（hybrid 中间层）
 *
 * 与 simpleperf-diff 的 enrich_v4_report.py 同构：不调 AI，用规则模板渲染。
 *
 * 输入：骨架 markdown（含 _AI_FILL_ 占位）+ unity-diff-summary.json
 * 输出：enriched markdown（占位被通用模板段落替换 + 表格后增叙事段）
 *
 * 数字保护：本层从 summary.json 直接取数，渲染到模板里，AI/手工都改不到（除非改 summary）。
 *
 * 通用化原则：完全按节点名 / 路径关键词 + Δ 数字阈值套模板，不出现任何项目特定业务名硬编码。
 */
import * as fs from 'fs';
import * as path from 'path';

interface DiffNumberPair {
  base: number | null;
  cur: number | null;
  delta: number | null;
  deltaPct: number | null;
  status: string;
}

interface CallTreeNodeDiff {
  path: string;
  name: string;
  depth: number;
  msPerFrameTotal: DiffNumberPair;
  msPerFrameSelf: DiffNumberPair;
  threadPct: DiffNumberPair;
  gcAllocCount: DiffNumberPair;
  status: string;
  children: CallTreeNodeDiff[];
}

interface UnityDiffSummary {
  meta: { base: { label: string; frameCount: number }; cur: { label: string; frameCount: number } };
  consistency: { targetFpsMatch: boolean; framesRatio: number; note: string[] };
  frameSummary: Record<string, DiffNumberPair>;
  callTreesDiff: { threadName: string; baseFrameCount: number; curFrameCount: number; msPerFrameTotal: DiffNumberPair; roots: CallTreeNodeDiff[] }[];
  markersByThreadDiff: Record<string, { name: string; thread: string; msSelfMean: DiffNumberPair; status: string }[]>;
  gcAttribution: {
    totalAllocPerFrame: DiffNumberPair;
    gcBytesPerFrame?: DiffNumberPair;
    topSubtrees: { path: string; name: string; gcAlloc: DiffNumberPair; msPerFrameTotal: DiffNumberPair }[];
  };
  topHotspots?: {
    rank: number; name: string; path: string;
    msPerFrameSelf: DiffNumberPair; msPerFrameTotal: DiffNumberPair;
    gcAllocCount: DiffNumberPair; status: string;
  }[];
  spikes: { newSpikes: { name: string; spikeRatio: DiffNumberPair; msSelfMean: DiffNumberPair }[]; resolvedSpikes: any[]; changed: any[] };
  presence: { addedInCur: string[]; removedFromCur: string[] };
}

// ============ 通用模板：按节点名 / 路径关键词 + 阈值匹配 ============

interface NarrativeRule {
  match: (node: { name: string; path: string }) => boolean;
  category: string;
  business: (n: NodeCtx) => string;
  boundary: (n: NodeCtx) => string[];
  optimize: (n: NodeCtx) => string[];
}

interface NodeCtx {
  name: string;
  path: string;
  selfDelta: number;
  totalDelta: number;
  selfRatio: number; // self/total %
  gcDelta: number;
  isNewlyAdded: boolean;
}

const RULES: NarrativeRule[] = [
  // 1. Lua 调度类
  {
    match: n => /Lua|xLua/i.test(n.name) || /Lua|xLua/i.test(n.path.split('▸').slice(-3).join('▸')),
    category: 'Lua 调度',
    business: n => `Lua 业务调度模块。base 阶段轻负载下成本可忽略；cur 阶段业务用例触发更密集，Lua 回调（OnTick / OnUpdate / OnLateUpdate / scheduler）执行频次或单次成本上升 → 子树整体激增。`,
    boundary: n => [
      '✅ unity profiler 给到 ms/帧 与 self/total 比率，可定位是"自身循环慢"还是"子调用慢"',
      '⚠️ Lua 内部具体是哪个 Lua 函数 / 协程，需配合 xLua Profiler 或自定义 Lua 埋点（profiler 看不到 Lua 内部行）',
    ],
    optimize: n => [
      'Lua 调度回调降频（不必每帧 tick 的逻辑改 N 帧 tick 一次）',
      '缓存上帧 Lua 计算结果，仅状态变化时重算',
      '审计 Lua↔C# 交互（CrossCall），减少装箱 / 字符串拼接 / table 临时对象（也能间接缓解 GC）',
    ],
  },

  // 2. URP / RenderGraph / 渲染管线配置类
  {
    match: n => /^URP\.|RenderGraph|RenderPipeline|RendererSetup/i.test(n.name),
    category: 'URP 渲染管线',
    business: n => `URP 渲染管线相关阶段。涨幅通常源于：(a) 新增 / 改变 pass，(b) RenderTexture / RT handle 数量上升，(c) Material 切换增多，(d) 透明物体数量爆发。`,
    boundary: n => [
      '✅ profile 给到 ms/帧 与 self/total → 可区分"配置阶段慢"vs"子 pass 执行慢"',
      '⚠️ 不能直接看 drawcall / SetPass / triangle 计数，需 Frame Debugger / RenderDoc 复核',
    ],
    optimize: n => [
      '静态化：把不随帧变的配置（pass 依赖 / RT 句柄）一次性 setup，避免每帧重建',
      '场景级 pass 裁剪：低优先级 pass 按需开关（如远景阴影 / 雾效 / 后处理）',
      'RenderTexture 句柄池化复用，避免每帧重新分配 RT',
    ],
  },

  // 3. UI / Canvas / MeshUI 类
  {
    match: n => /UGUI|Canvas|MeshUI|MUILayout|UIControl/i.test(n.name),
    category: 'UI 系统',
    business: n => `UI 渲染 / 布局相关模块。负载增长常见原因：屏幕上活跃 UI 元素数量大幅上升、Canvas 标记 dirty 频次提高、3D-UI 世界坐标→屏幕坐标转换批量执行等。`,
    boundary: n => [
      '✅ self/total=' + n.selfRatio.toFixed(0) + '% 已标识是否自身循环瓶颈',
      '✅ gcAlloc Δ ' + (n.gcDelta >= 0 ? '+' : '') + n.gcDelta.toFixed(0) + ' 显示是否伴随 GC 压力',
      '⚠️ 不能直接看是哪一类 UI 元素涨（buff 图标 / 战斗数字 / 头标）→ 需源码审计或加业务埋点',
    ],
    optimize: n => [
      '降频更新：UI 通常无需 60Hz 刷新，改为 2-3 帧或脏标记触发',
      '脏标记机制：仅状态/位置变化的 UI 重算，静态 UI 跳过',
      '批处理 / 分帧预算：每帧只处理 N 个 UI 元素，剩余下帧；玩家不可感知',
    ],
  },

  // 4. ECS / Burst Job 类
  {
    match: n => /\(Burst\)|ECS|JobSystem|ParallelFor|Worker/i.test(n.name),
    category: 'ECS / Burst Job',
    business: n => `ECS Burst Job 类负载。base 没有此 Job 通常意味着对应业务实体未存在；cur 出现 / 涨幅说明实体数（如 ECS Entity 实例）激增触发并行计算。`,
    boundary: n => [
      '✅ Burst Job 默认下沉到 Job Worker 线程并行，**不阻塞主线程** — 主线程只承担调度成本',
      '✅ 多 Job Worker 应同步出现该 Job → 确认是真并行而非主线程串行',
      '⚠️ Burst lib 内部不可符号化细分（需源码审计 Job 实现）',
    ],
    optimize: n => [
      '检查是否真有必要每帧调度（部分 ECS Job 可定时触发或事件驱动）',
      'Job 批处理粒度调优（chunk size 太小 → 调度开销占主，太大 → 并行度损失）',
      '冷数据剥离（不必每帧扫的实体放到独立 archetype 或 query 中）',
    ],
  },

  // 5. Mgr / Manager / Ctrl 类（业务管理器，最通用）
  {
    match: n => /(Mgr|Manager|Ctrl|Controller|System)$|\.\w+(Mgr|Manager|Ctrl)\b/i.test(n.name),
    category: '业务管理器',
    business: n => `业务管理器模块。每帧逐对象遍历 / 状态刷新成本随对象数线性增长。${n.isNewlyAdded ? 'cur 完全新增表明 base 场景下没有此类业务对象（如行军部队 / 战斗实体 / 动态资源）。' : `base→cur 涨幅 ${n.totalDelta.toFixed(2)}ms/帧 暗示对象数量或刷新频次显著上升。`}`,
    boundary: n => [
      `✅ self/total=${n.selfRatio.toFixed(0)}% ${n.selfRatio > 70 ? '→ 自身循环即瓶颈，外层调用者不是问题' : '→ 主要由子节点贡献，需进一步下钻子节点'}`,
      '⚠️ 不能区分"对象数多"vs"单对象处理慢"vs"内部缓存失效"，需源码审计或加业务埋点',
    ],
    optimize: n => [
      '增量更新：仅处理状态变化的对象，缓存上帧结果',
      '距离 / 可见性裁剪：屏幕外或远距离对象按 LOD 降级或不刷',
      '降频：非每帧必要的逻辑改为 N 帧执行一次，玩家通常不可感知',
    ],
  },

  // 6. 资源加载 / IO 类
  {
    match: n => /Loading|File\.|AssetBundle|Resource\.|ab_unload|TryUnload/i.test(n.name),
    category: '资源加载 / IO',
    business: n => `资源加载或卸载相关。base 凉机预加载充分；cur 业务触发动态加载（场景细节 prefab / 单位贴图 / Shader 序列化）→ IO 子线程或同步加载阻塞主线程。`,
    boundary: n => [
      '✅ 子线程的 File.Read / Open 可旁路确认是 IO 阻塞还是 CPU 解析瓶颈',
      '⚠️ 加载内容（哪个 prefab / asset bundle / shader）需 Memory Profiler 或加载日志',
    ],
    optimize: n => [
      '预加载策略：把 cur 触发的动态资源前置到场景加载阶段或异步预热',
      '资源 LOD / 流式：远景资源延迟加载或低 LOD',
      '减少 prefab / shader 变体数（运行时编译耗 CPU）',
    ],
  },

  // 7. 兜底（其它命中 degraded 的节点）
  {
    match: () => true,
    category: '通用业务模块',
    business: n => `${n.isNewlyAdded ? 'cur 新引入此模块（base 完全没有）。' : `base→cur 此模块负载从 ${n.totalDelta < 0 ? '改善' : '上升'} ${Math.abs(n.totalDelta).toFixed(2)}ms/帧。`}增长机制需结合源码审计确认。`,
    boundary: n => [
      `✅ self/total=${n.selfRatio.toFixed(0)}% 标识${n.selfRatio > 70 ? '自身循环即瓶颈' : '主要由子节点贡献'}`,
      '⚠️ profile 数据已到 marker 级别，更细需要源码审计或自定义埋点',
    ],
    optimize: n => [
      '检查是否每帧必要执行；若否，改降频或事件驱动',
      '数据结构 / 算法层面优化（缓存 / 增量 / 避免重复计算）',
      '若有大量分配，减少临时对象（List/Dict/string concat/装箱）',
    ],
  },
];

function matchRule(node: NodeCtx): NarrativeRule {
  return RULES.find(r => r.match(node))!;
}

// ============ §3 / §4 / §5 确定性要点 ============

function fmtDeltaMs(pair: DiffNumberPair): string {
  const d = pair.delta ?? 0;
  return `${d >= 0 ? '+' : ''}${d.toFixed(2)}ms/帧`;
}

function findNodeByPath(main: UnityDiffSummary['callTreesDiff'][0], targetPath: string): CallTreeNodeDiff | null {
  let found: CallTreeNodeDiff | null = null;
  const walk = (n: CallTreeNodeDiff) => {
    if (n.path === targetPath) found = n;
    n.children.forEach(walk);
  };
  main.roots.forEach(walk);
  return found;
}

function buildSection3Bullets(summary: UnityDiffSummary): string {
  const hotspots = summary.topHotspots?.slice(0, 4) ?? [];
  if (!hotspots.length) return '- _无显著 degraded 业务热点（self Δ < 0.3ms/帧）_';
  const main = summary.callTreesDiff.find(t => /Main Thread/i.test(t.threadName));
  return hotspots.map(h => {
    const node = main ? findNodeByPath(main, h.path) : null;
    const ctx: NodeCtx = node
      ? ctxFromDiff(node)
      : {
          name: h.name, path: h.path,
          selfDelta: h.msPerFrameSelf.delta ?? 0,
          totalDelta: h.msPerFrameTotal.delta ?? 0,
          selfRatio: 0, gcDelta: h.gcAllocCount.delta ?? 0,
          isNewlyAdded: h.status === 'newly_added',
        };
    const rule = matchRule(ctx);
    const gcNote = ctx.gcDelta !== 0 ? `；GC.Alloc Δ ${ctx.gcDelta >= 0 ? '+' : ''}${ctx.gcDelta.toFixed(0)} 次（全 trace）` : '';
    return `- **${h.name}** self ${fmtDeltaMs(h.msPerFrameSelf)}（${rule.category}）：${rule.business(ctx).split('。')[0]}。${gcNote}`;
  }).join('\n');
}

interface ThreadNarrativeRule {
  matchThread: (thread: string) => boolean;
  matchMarker?: (marker: string) => boolean;
  line: (thread: string, diffs: UnityDiffSummary['markersByThreadDiff'][string]) => string;
}

const THREAD_NARRATIVES: ThreadNarrativeRule[] = [
  {
    matchThread: t => /Render|Gfx|Present|Submit|Camera/i.test(t),
    matchMarker: m => /PresentFrame|Submit|Render|Camera|URP/i.test(m),
    line: (thread, diffs) => {
      const top = diffs.find(d => d.status !== 'stable') ?? diffs[0];
      const dlt = top?.msSelfMean.delta ?? 0;
      const sign = dlt >= 0 ? '上升' : '下降';
      return `> **${thread}**：Submit / PresentFrame 链路 ${sign} ${Math.abs(dlt).toFixed(2)}ms（${top?.name ?? '—'}）；通常反映 draw / pass 数量或 GPU 同步等待变化，需 Frame Debugger 复核 pass 与 RT 分配。`;
    },
  },
  {
    matchThread: t => /Job|Worker|Burst|Background/i.test(t),
    matchMarker: m => /Burst|Job|ParallelFor|Worker/i.test(m),
    line: (thread, diffs) => {
      const burst = diffs.filter(d => /Burst|Job|ParallelFor/i.test(d.name));
      const top = burst[0] ?? diffs.find(d => d.status !== 'stable') ?? diffs[0];
      const dlt = top?.msSelfMean.delta ?? 0;
      return `> **${thread}**：Burst Job 调度 ${dlt >= 0 ? '加重' : '减轻'} ${Math.abs(dlt).toFixed(2)}ms（${top?.name ?? '—'}）；并行 Job 默认不阻塞主线程，涨幅多来自实体数 / chunk 粒度 / 调度频次。`;
    },
  },
  {
    matchThread: t => /Loading|File|IO|Asset/i.test(t),
    matchMarker: m => /Loading|File\.|AssetBundle|Resource\.|TryUnload/i.test(m),
    line: (thread, diffs) => {
      const io = diffs.filter(d => /Loading|File\.|Asset|Resource/i.test(d.name));
      const top = io[0] ?? diffs.find(d => d.status !== 'stable') ?? diffs[0];
      const dlt = top?.msSelfMean.delta ?? 0;
      return `> **${thread}**：Loading / IO ${dlt >= 0 ? '阻塞加重' : '阻塞减轻'} ${Math.abs(dlt).toFixed(2)}ms（${top?.name ?? '—'}）；动态加载或 AB 解析可能占用子线程并间接拖慢主线程同步点。`;
    },
  },
];

function buildSection4ThreadLine(thread: string, diffs: UnityDiffSummary['markersByThreadDiff'][string]): string {
  const visible = diffs.filter(d => d.status !== 'stable');
  const pool = (visible.length ? visible : diffs).slice(0, 5);
  const top = pool[0] ?? diffs[0];
  const dlt = top?.msSelfMean.delta ?? 0;

  // 线程名优先（避免 UpdateCameras / RenderBounds 等 marker 误触 PresentFrame 模板）
  if (/Submit|Present/i.test(thread) || /Render Thread/i.test(thread)) {
    const present = pool.find(d => /PresentFrame|Submit|ForwardRenderPass|RenderPass/i.test(d.name)) ?? top;
    const pd = present?.msSelfMean.delta ?? dlt;
    return `> **${thread}**：Submit / PresentFrame 链路 ${pd >= 0 ? '上升' : '下降'} ${Math.abs(pd).toFixed(2)}ms（${present?.name ?? '—'}）；通常反映 draw / pass 数量或 GPU 同步等待变化，需 Frame Debugger 复核 pass 与 RT 分配。`;
  }
  if (/Job\.Worker|Background Job/i.test(thread)) {
    const burst = pool.find(d => /\(Burst\)|ParallelFor|Job\b/i.test(d.name)) ?? top;
    const bd = burst?.msSelfMean.delta ?? dlt;
    return `> **${thread}**：Burst Job 调度 ${bd >= 0 ? '加重' : '减轻'} ${Math.abs(bd).toFixed(2)}ms（${burst?.name ?? '—'}）；并行 Job 默认不阻塞主线程，涨幅多来自实体数 / chunk 粒度 / 调度频次。`;
  }
  if (/Loading/i.test(thread)) {
    const io = pool.find(d => /Loading|File\.|Asset|Resource|Shader/i.test(d.name)) ?? top;
    const id = io?.msSelfMean.delta ?? dlt;
    return `> **${thread}**：Loading / IO ${id >= 0 ? '阻塞加重' : '阻塞减轻'} ${Math.abs(id).toFixed(2)}ms（${io?.name ?? '—'}）；动态加载或 AB 解析可能占用子线程并间接拖慢主线程同步点。`;
  }

  for (const rule of THREAD_NARRATIVES) {
    if (rule.matchThread(thread) || pool.some(d => rule.matchMarker?.(d.name))) {
      return rule.line(thread, pool);
    }
  }
  return `> **${thread}**：Top marker ${top?.name ?? '—'} self Δ ${dlt >= 0 ? '+' : ''}${dlt.toFixed(2)}ms；该线程负载变化需结合主线程 §3 对位模块判断是否同一业务触发。`;
}

function buildSection5Bullets(summary: UnityDiffSummary): string {
  const gc = summary.gcAttribution;
  const lines: string[] = [];
  const allocD = gc.totalAllocPerFrame.delta ?? 0;
  lines.push(`- 每帧 GC.Alloc **次数** ${allocD >= 0 ? '+' : ''}${allocD.toFixed(1)} 次/帧（PlayerLoop 子树累计，全 trace 口径）。`);
  if (gc.gcBytesPerFrame) {
    const bd = gc.gcBytesPerFrame.delta ?? 0;
    lines.push(`- 帧级 **分配字节** Δ ${bd >= 0 ? '+' : ''}${bd.toFixed(1)} KB/帧（` +
      '`memory.gcAllocatedInFrame` 均值）；**无法**按 §5 子树拆分字节归因。');
  }
  const top = gc.topSubtrees.slice(0, 3);
  if (top.length) {
    lines.push('- 叶子归因 Top 子树：' + top.map(s => {
      const gd = s.gcAlloc.delta ?? 0;
      return `\`${s.name}\` Δ ${gd >= 0 ? '+' : ''}${gd.toFixed(0)} 次`;
    }).join('；') + '。');
  }
  lines.push('- 若次数涨而字节 flat，多为小对象 / 临时容器频繁分配；若两者同涨，优先审计 Top 子树内的 List/Dict/string 拼接。');
  return lines.join('\n');
}

function fillEnrichPlaceholder(md: string, tag: string, content: string): string {
  const marker = `<!-- ENRICH_FILL:${tag} -->`;
  return md.includes(marker) ? md.replace(marker, content) : md;
}

// ============ 渲染辅助 ============

function fmtMs(v: number | null | undefined, d = 2): string {
  return v == null ? '—' : `${v.toFixed(d)}ms`;
}

function ctxFromDiff(node: CallTreeNodeDiff): NodeCtx {
  const totalCur = node.msPerFrameTotal.cur ?? 0;
  const selfCur = node.msPerFrameSelf.cur ?? 0;
  return {
    name: node.name,
    path: node.path,
    selfDelta: node.msPerFrameSelf.delta ?? 0,
    totalDelta: node.msPerFrameTotal.delta ?? 0,
    selfRatio: totalCur > 0 ? (selfCur / totalCur) * 100 : 0,
    gcDelta: node.gcAllocCount.delta ?? 0,
    isNewlyAdded: node.status === 'newly_added',
  };
}

// ============ 替换 _AI_FILL_ 占位 + 注入叙事 ============

function enrichSkeleton(skeletonMd: string, summary: UnityDiffSummary): string {
  let md = skeletonMd;

  // §3 / §4 / §5 要点（确定性）
  md = fillEnrichPlaceholder(md, '§3要点', buildSection3Bullets(summary));
  md = fillEnrichPlaceholder(md, '§5要点', buildSection5Bullets(summary));
  for (const [thread, diffs] of Object.entries(summary.markersByThreadDiff)) {
    if (/Main Thread/i.test(thread) || !diffs.length) continue;
    const visible = diffs.filter(d => d.status !== 'stable');
    if (!visible.length) continue;
    md = fillEnrichPlaceholder(md, `§4:${thread}`, buildSection4ThreadLine(thread, diffs));
  }

  // §8 P{N} 替换 — 与 builder collectUniqueDegradedLeaves 同源（summary.topHotspots 前 5）
  const main = summary.callTreesDiff.find(t => /Main Thread/i.test(t.threadName));
  if (!main) return md;

  const STAGE_NAME_RE = /^(PlayerLoop|Update\.|LateUpdate\.|PreLateUpdate\.|FixedUpdate\.|Initialization\.|EarlyUpdate\.|PostLateUpdate\.|TimeUpdate\.|BehaviourUpdate$|LateBehaviourUpdate$|InitializationSystemGroup|SimulationSystemGroup|PresentationSystemGroup)/;
  const uniqueByLeaf: CallTreeNodeDiff[] = [];
  if (summary.topHotspots?.length) {
    for (const h of summary.topHotspots.slice(0, 5)) {
      const node = findNodeByPath(main, h.path);
      if (node) uniqueByLeaf.push(node);
    }
  }
  if (!uniqueByLeaf.length) {
    const candidates: CallTreeNodeDiff[] = [];
    const walk = (n: CallTreeNodeDiff) => {
      const selfDelta = n.msPerFrameSelf.delta ?? 0;
      if (!STAGE_NAME_RE.test(n.name) && n.status === 'degraded' && selfDelta >= 0.3) candidates.push(n);
      n.children.forEach(walk);
    };
    main.roots.forEach(walk);
    candidates.sort((a, b) => (b.msPerFrameSelf.delta ?? 0) - (a.msPerFrameSelf.delta ?? 0));
    const seenPaths = new Set<string>();
    for (const n of candidates) {
      let isAncestorOfSelected = false;
      for (const sp of seenPaths) {
        if (sp.startsWith(n.path + '▸')) { isAncestorOfSelected = true; break; }
      }
      if (isAncestorOfSelected) continue;
      uniqueByLeaf.push(n);
      seenPaths.add(n.path);
      if (uniqueByLeaf.length >= 5) break;
    }
  }

  // 替换每个 P{N} 块的 _AI_FILL_
  uniqueByLeaf.forEach((node, i) => {
    const ctx = ctxFromDiff(node);
    const rule = matchRule(ctx);
    const bizText = rule.business(ctx);
    const boundaryItems = rule.boundary(ctx);
    const optItems = rule.optimize(ctx);

    // 业务含义占位替换
    const bizPattern = new RegExp(
      `### P${i + 1}.*?\\*\\*业务含义\\*\\*[^：]*：[\\s\\S]*?- _待 AI 填充：业务背景解释_`,
      's'
    );
    md = md.replace(bizPattern, (block) => {
      return block.replace(
        /\*\*业务含义\*\*[^：]*：[\s\S]*?- _待 AI 填充：业务背景解释_/,
        `**业务含义**（${rule.category}类，自动归类）：\n- ${bizText}`
      );
    });

    // 本源边界占位替换
    const bndPattern = new RegExp(
      `### P${i + 1}.*?\\*\\*本源边界\\*\\*[^：]*：[\\s\\S]*?- _待 AI 填充：哪些诊断[^_]*_`,
      's'
    );
    md = md.replace(bndPattern, (block) => {
      const bndRendered = boundaryItems.map(s => `- ${s}`).join('\n');
      return block.replace(
        /\*\*本源边界\*\*[^：]*：[\s\S]*?- _待 AI 填充：哪些诊断[^_]*_/,
        `**本源边界**：\n${bndRendered}`
      );
    });

    // 优化方向占位替换
    const optPattern = new RegExp(
      `### P${i + 1}.*?\\*\\*优化方向\\*\\*[^：]*：[\\s\\S]*?3\\. _待 AI 填充：第三优化方向_`,
      's'
    );
    md = md.replace(optPattern, (block) => {
      const optRendered = optItems.map((s, j) => `${j + 1}. ${s}`).join('\n');
      return block.replace(
        /\*\*优化方向\*\*[^：]*：[\s\S]*?3\. _待 AI 填充：第三优化方向_/,
        `**优化方向**：\n${optRendered}`
      );
    });
  });

  // §0 一句话结论扩写：在原结论后追加场景背景 + 优化空间估算（基于数字，不写死项目）
  const meanDelta = summary.frameSummary.mean?.delta ?? 0;
  const top1 = uniqueByLeaf[0];
  const top1Delta = top1?.msPerFrameSelf.delta ?? 0;
  const top1Name = top1?.name ?? '—';
  const totalRecoverableEst = uniqueByLeaf.slice(0, 3).reduce((s, n) => s + (n.msPerFrameSelf.delta ?? 0), 0);
  const recoverPct = meanDelta > 0 ? ((totalRecoverableEst / meanDelta) * 100).toFixed(0) : '0';

  const headlineExtra = [
    '',
    `> **场景对比**：base ${summary.meta.base.label} (${summary.meta.base.frameCount} 帧) vs cur ${summary.meta.cur.label} (${summary.meta.cur.frameCount} 帧)。两份采集帧数比 ${summary.consistency.framesRatio}，target FPS ${summary.consistency.targetFpsMatch ? '一致' : '不一致 ⚠️'}。`,
    '>',
    `> **粗估优化空间**：仅 P1+P2+P3 三项业务模块（合计 self ${totalRecoverableEst.toFixed(2)}ms/帧）若全部回收，可缓解约 ${recoverPct}% 的总回归（${meanDelta.toFixed(2)}ms/帧）。剩余部分大概率来自压测场景的合理业务增量（实体数量 / RPC / 资源加载等），需业务侧权衡。`,
  ].join('\n');

  // 在 §0 原 "> **头号回归**" 行后追加（多行匹配，路径里可能有特殊字符）
  md = md.replace(
    /(> \*\*头号回归\*\*[^\n]*\n)/,
    `$1${headlineExtra}\n`,
  );

  return md;
}

// ============ CLI ============

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

function main() {
  const skeletonPath = arg('skeleton');
  const summaryPath = arg('summary');
  const outPath = arg('out');
  if (!skeletonPath || !summaryPath || !outPath) {
    console.error('Usage: tsx unity-diff-enrich.ts --skeleton <skeleton.md> --summary <summary.json> --out <enriched.md>');
    process.exit(1);
  }

  const skeletonMd = fs.readFileSync(skeletonPath, 'utf-8');
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as UnityDiffSummary;

  const enriched = enrichSkeleton(skeletonMd, summary);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, enriched, 'utf-8');

  const lines = enriched.split('\n').length;
  const remaining = (enriched.match(/_AI_FILL/g) ?? []).length;
  const remaining2 = (enriched.match(/_待 AI 填充/g) ?? []).length;
  const remaining3 = (enriched.match(/ENRICH_FILL/g) ?? []).length;
  console.error(`[enrich] ✅ ${outPath} (${lines} 行, 残留 _AI_FILL=${remaining}, _待 AI 填充=${remaining2}, ENRICH_FILL=${remaining3})`);
}

if (require.main === module) main();

export { enrichSkeleton };
