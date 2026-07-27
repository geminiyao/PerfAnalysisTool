// 单源客观报告 — 共享工具（格式化 / 分层 / AOE 补充配置）

export function pct(v: number | undefined | null, d = 1): string {
  return v == null ? '—' : `${v.toFixed(d)}%`;
}

export function ms(v: number | undefined | null, d = 2): string {
  return v == null ? '—' : `${v.toFixed(d)}ms`;
}

export function metricVal(metrics: Array<{ key: string; value: number }>, key: string): number | undefined {
  return metrics.find(m => m.key === key)?.value;
}

export type SummaryJson = Record<string, unknown>;

export interface TreeNode {
  name: string;
  totalMs?: number;
  totalPct?: number;
  selfMs?: number;
  selfPct?: number;
  count?: number;
  layer?: string;
  children?: TreeNode[];
}

export interface ActionItem {
  priority: number;
  title: string;
  why: string;
  action: string;
  evidence: string;
}

/** AOE 业务补充（非报告基座；仅命中时输出） */
export interface AoeWatchHint {
  id: string;
  patterns: string[];
  knowledgeRef: string;
  note: string;
  warnAvgMs?: number;
  action: string;
}

export const AOE_WATCH_HINTS: AoeWatchHint[] = [
  {
    id: 'MapSignificanceMgr',
    patterns: ['MapSignificanceMgr'],
    knowledgeRef: '§3 重要度管理器',
    note: '任务多时易接近每帧 3ms 顶格，反映整体负载',
    warnAvgMs: 0.8,
    action: '排查实体增删洪峰与网络消息驱动的重要度任务；考虑降频更新或分批处理 MapEntity',
  },
  {
    id: 'OutSideViewArmyLineMgr',
    patterns: ['OutSideViewArmyLineMgr'],
    knowledgeRef: '§4 行军线',
    note: '压测场景常见高负载',
    warnAvgMs: 0.5,
    action: '检查行军线刷新频率与 Burst Job（CalculateVertexJob）规模；静止场景应明显降低',
  },
  {
    id: 'BattleHeadMgr',
    patterns: ['BattleHeadMgr'],
    knowledgeRef: '§3 头像管理器',
    action: '与 BattleUIManager 交叉看；检查同屏头像数量与 Lua tick 频率',
  },
  {
    id: 'MeshUIManager',
    patterns: ['MeshUIManager'],
    knowledgeRef: '§5 MeshUI',
    action: '压测悬浮 UI 多时应重点看；减少每帧 MeshUI 重建/布局',
  },
  {
    id: 'MapCameraCtrl',
    patterns: ['MapCameraCtrl'],
    knowledgeRef: '§5 视野拖动',
    note: '拖动时可高；静止时应低',
    action: '区分是否在拖视野：静止时仍高 → 查视野更新逻辑；拖动时高 → 查 MapSignificance 联动',
  },
  {
    id: 'PlayerUpdateCanvases',
    patterns: ['PlayerUpdateCanvases'],
    knowledgeRef: '§7 UGUI',
    note: '主场景悬浮 UI 已 MeshUI 化，>1ms/次不合理',
    warnAvgMs: 1.0,
    action: '拆分动静 Canvas、减少每帧 Rebuild；确认是否仍有 UGUI 头顶字未迁移',
  },
  {
    id: 'InitializationSystemGroup',
    patterns: ['InitializationSystemGroup'],
    knowledgeRef: '§8 ECS Initialization',
    warnAvgMs: 1.0,
    action: '主线程 ECS 组应仅分发 job；>1ms 或 Complete 等待 → 查 ECS 依赖与 job 阻塞',
  },
  {
    id: 'SimulationSystemGroup',
    patterns: ['SimulationSystemGroup'],
    knowledgeRef: '§8 ECS Simulation',
    warnAvgMs: 1.0,
    action: '同上；确认 Simulation job 是否在 JobWorker 执行而非主线程等待',
  },
  {
    id: 'PresentationSystemGroup',
    patterns: ['PresentationSystemGroup'],
    knowledgeRef: '§8 ECS Presentation',
    warnAvgMs: 1.0,
    action: 'Presentation 分发异常时查 ECS 依赖可视化工具',
  },
  {
    id: 'TServer',
    patterns: ['TServer'],
    knowledgeRef: '§2 网络消息',
    action: '压测网络洪峰时查 Recv/Decode/Handle 分布；考虑限流或合并消息',
  },
  {
    id: 'WaitForPresent',
    patterns: ['WaitForPresent', 'Gfx.WaitForPresent'],
    knowledgeRef: '§9 渲染等 GPU',
    action: '出现 WaitForPresent 说明渲染提交在等 GPU；结合 Gfx 线程 Running% 判断是否 GPU 压力',
  },
  {
    id: 'ResManager',
    patterns: ['ResManager', 'LoaderManager'],
    knowledgeRef: '§10 资源加载',
    action: '实体洪峰/切视野时常见；查异步加载队列与 EndOfFrame 集中加载',
  },
  {
    id: 'LuaMultiThreadGC',
    patterns: ['LuaMultiThreadGC'],
    knowledgeRef: '§11 Lua GC',
    warnAvgMs: 3.0,
    action: '单次尖刺 >3ms 表明 Lua GC 压力；查 Lua 分配与 GC 策略',
  },
];

export function classifySimpleperfHotspot(func: string, lib: string): 'business' | 'engine' | 'runtime' | 'noise' {
  const f = func.toLowerCase();
  const l = lib.toLowerCase();
  if (f.includes('dummy::') || l.includes('kernel')) return 'noise';
  if (f.includes('atrace_') || f.includes('atrace_begin') || f.includes('atrace_end')) return 'runtime';
  if (f === '__vfprintf' || f === '__memcpy' || f.startsWith('__ieee754') || f === 'syscall') return 'runtime';
  if (f.includes('!!!') || l.includes('libgles')) return 'runtime';
  if (l.includes('libil2cpp') || l.includes('libxlua') || l.includes('lib_burst') || f.includes('aoe_')) return 'business';
  if (l.includes('libunity') || l.includes('libak')) return 'engine';
  if (l.includes('libc') || l.includes('libm') || l.includes('libart') || l.includes('linker')) return 'runtime';
  return 'engine';
}

export function isAtraceObserverHotspot(func: string, lib: string): boolean {
  const s = `${func} ${lib}`.toLowerCase();
  return s.includes('atrace') || s.includes('vfprintf') || s.includes('vsnprintf') || s.includes('__sfvwrite');
}

export function findPlayerLoopPhases(callTrees: Array<{ thread?: string; root?: TreeNode }>): Array<{ name: string; totalPct: number; totalMs: number }> {
  const main = callTrees.find(t => t.thread === 'UnityMain' || t.thread?.startsWith('UnityMain#'));
  const pl = main?.root?.children?.find(c => c.name === 'PlayerLoop');
  if (!pl?.children?.length) return [];
  return pl.children
    .map(c => ({ name: c.name, totalPct: c.totalPct ?? 0, totalMs: c.totalMs ?? 0 }))
    .sort((a, b) => b.totalPct - a.totalPct);
}

export function findPathInTree(node: TreeNode, match: (n: TreeNode) => boolean, path: string[] = []): string[] | null {
  const cur = [...path, node.name];
  if (match(node)) return cur;
  for (const c of node.children ?? []) {
    const found = findPathInTree(c, match, cur);
    if (found) return found;
  }
  return null;
}

export function findHotspotCallChain(
  callTrees: Array<{ thread?: string; root?: TreeNode }>,
  funcName: string,
): string | null {
  for (const t of callTrees) {
    if (!t.root) continue;
    const needle = funcName.slice(0, 32);
    const path = findPathInTree(t.root, n => n.name.includes(needle) || needle.includes(n.name.slice(0, 24)));
    if (path) return path.join('\n  → ');
  }
  return null;
}

export function detectAtraceOverhead(callTrees: Array<{ thread?: string; root?: TreeNode }>): boolean {
  for (const t of callTrees) {
    if (!t.root) continue;
    let found = false;
    const walk = (n: TreeNode) => {
      if (isAtraceObserverHotspot(n.name, '')) found = true;
      for (const c of n.children ?? []) walk(c);
    };
    walk(t.root);
    if (found) return true;
  }
  return false;
}

export function matchAoeHint(label: string): AoeWatchHint | undefined {
  return AOE_WATCH_HINTS.find(h => h.patterns.some(p => label.includes(p)));
}

export function sortActions(actions: ActionItem[]): ActionItem[] {
  return [...actions].sort((a, b) => a.priority - b.priority);
}

export function renderActionsSection(actions: ActionItem[]): string[] {
  if (!actions.length) return ['_暂无自动生成的必做项；请结合下方证据节判读。_'];
  const lines: string[] = [];
  actions.forEach((a, i) => {
    lines.push(`### ${i + 1}. ${a.title}`);
    lines.push('');
    lines.push(`- **为什么**: ${a.why}`);
    lines.push(`- **做什么**: ${a.action}`);
    lines.push(`- **证据**: ${a.evidence}`);
    lines.push('');
  });
  return lines;
}
