/**
 * WT-025 需求 2 · report-utils.ts — 报告层可复用工具（数据源无关）
 *
 * 抽自 perfetto-report-mvp.ts，供 perfetto / simpleperf / unity 报告脚本共用。
 * 约束（不变）：
 *   - 不硬编码业务名清单 / 绝对阈值 / §0-§9 死模板
 *   - 数据源无关：所有函数只依赖通用接口，不依赖 Perfetto 专有类型
 *   - 单态判定函数（judgeByP50Ratio / judgeByVsync）标注 draft，待 DR-42 验证后定稿
 *
 * WT-028 C1 反向沉淀 v5.3 渲染能力（DR-44 §4）：
 *   6. GC 归因换算：gcAllocToPerFrame（子树 N 次 → N 次/帧，v5.3 §6.3）
 *   7. 三态 ASCII 可视化：buildTriadAsciiBar / buildStateDistributionAscii（v5.3 §4.4）
 *   8. callTree ├─/└─ 缩进 + 涨幅% + 标注：renderCallTreeTriad（v5.3 §5.2）
 *   9. 树状下钻渲染 + 按贡献度排序：renderSubtreeDrilldown（v5.3 §0②）
 *
 * 五类工具（原）：
 *   1. 子树归并：buildNameParentChains / isAncestorOf / mergeBySubtree
 *   2. 人话化：humanizeRelativeJudgment / humanizeCausalInference / humanizeFoldChange
 *   3. 判定（多态 + 单态统一）：detectStateMode / judgeByFoldChange / judgeByP50Ratio / judgeByVsync
 *   4. 叙事：buildTopConclusionBlock / buildAsciiBar / buildSubtreeDrilldown
 *   5. 渲染：renderFourPartBlock / renderDrilldownCard / renderCallTreeWithSeverity
 *   6. v5.3 渲染能力（本工单新增）：gcAllocToPerFrame / buildTriadAsciiBar / buildStateDistributionAscii / renderCallTreeTriad / renderSubtreeDrilldown
 */

// ─────────────────────────── 共用类型 ───────────────────────────

/**
 * 通用调用树节点——数据源无关的最小接口。
 * Perfetto / simpleperf / unity 的 callTree 都能适配到这个形状。
 */
export interface ReportTreeNode {
  name: string;
  totalMs?: number;
  totalPct?: number;
  count?: number;
  children?: ReportTreeNode[];
}

/**
 * 子树归并：name → parentChain[] 映射（DR-41 规则 2）。
 * 从 callTree 动态构建，用于 top 列表的子树归并。
 */
export interface NameParentChain {
  name: string;
  parentChain: string[]; // 从 root 到该节点的祖先链（不含自身）
  perFrameMs: number | null;
}

/**
 * 相对基线（多态判定用）——与 WT-020 explore 层 RelativeBaseline 对齐。
 * foldChange/deltaPct 可空（explore 层可能返回 null）。
 */
export interface RelativeBaseline {
  baselineRole: string;
  compareRole: string;
  absoluteValue: string;
  baselineValue: string;
  foldChange?: number | null;
  deltaPct?: number | null;
  relativeJudgment: string;
}

/**
 * §0 三大独立结论的图文穿插四段式块（DR-41 规则 4）。
 * 每块 = 引用块结论 + 加粗一句话 + ASCII 图 + 关键数字解读。
 */
export interface TopConclusionBlock {
  rank: number;
  tag: string;          // "①" / "②" / "③"
  severity: 'critical' | 'warning' | 'info';
  oneLiner: string;     // 加粗一句话结论（人话，无字段名）
  asciiChart: string;   // ASCII 图（柱状/缩进树/对照）
  keyNumbers: string[]; // 关键数字解读，每条一行
  seeAlso: string;      // "详见 §X" 引用
  findingIds: string[]; // 关联 finding（仅 narrative.json 用，不渲染到 HTML 正文）
}

/**
 * 下钻卡片数据（DR-41 规则 3 下钻详情层）。
 */
export interface DrilldownCard {
  module: string;
  mergedChildren: string[];
  perFrameMs: number | null;
  keyNumbers: string[];
  callTreeSnippet?: string; // 可选的 callTree 缩进片段
  optimization?: string;    // 可选的优化方向
}

// ─────────────────────────── 1. 子树归并工具 ───────────────────────────

/**
 * 从 callTree 动态构建 name → parentChain[] 映射（DR-41 规则 2）。
 *
 * 数据源无关：接收通用 ReportTreeNode，Perfetto/simpleperf/unity 的 callTree 都能用。
 * frameCount 用于计算 perFrameMs（若 ≤0 则 perFrameMs=null）。
 *
 * 同名节点可能多次出现（不同分支），保留 parentChain 最长（最深的那个）。
 */
export function buildNameParentChains(
  root: ReportTreeNode | undefined,
  frameCount: number,
): Map<string, NameParentChain> {
  const result = new Map<string, NameParentChain>();
  const walk = (node: ReportTreeNode | undefined, ancestors: string[]) => {
    if (!node) return;
    const totalMs = typeof node.totalMs === 'number' ? node.totalMs : null;
    const perFrameMs = totalMs != null && frameCount > 0 ? totalMs / frameCount : null;
    const existing = result.get(node.name);
    if (!existing || ancestors.length > existing.parentChain.length) {
      result.set(node.name, {
        name: node.name,
        parentChain: [...ancestors],
        perFrameMs,
      });
    }
    if (node.children) {
      for (const c of node.children) walk(c, [...ancestors, node.name]);
    }
  };
  walk(root, []);
  return result;
}

/**
 * 判断 A 是否是 B 的祖先（A 在 B 的 parentChain 里）。
 */
export function isAncestorOf(
  ancestorName: string,
  childName: string,
  parentChains: Map<string, NameParentChain>,
): boolean {
  if (ancestorName === childName) return false;
  const child = parentChains.get(childName);
  if (!child) return false;
  return child.parentChain.includes(ancestorName);
}

/**
 * 对 top 列表做子树归并：若某节点的祖先已在列表里，跳过（或合并到祖先的 mergedChildren）。
 * 输入按贡献降序排列，输出保留贡献最大的祖先，child 挂在祖先的 mergedChildren 里。
 *
 * getName：从 entry 提取模块名的访问器（不同调用方用 name/module 字段名不一致）。
 * 归并的 child name 写回 entry 的 mergedChildren 字段（string[]）。
 */
export function mergeBySubtree<T extends Record<string, unknown>>(
  sortedEntries: T[],
  parentChains: Map<string, NameParentChain>,
  getName: (entry: T) => string,
): T[] {
  const result: T[] = [];
  for (const entry of sortedEntries) {
    const name = getName(entry);
    // 检查是否已有祖先在 result 里
    let mergedInto: T | null = null;
    for (const kept of result) {
      if (isAncestorOf(getName(kept), name, parentChains)) {
        mergedInto = kept;
        break;
      }
    }
    if (mergedInto) {
      // 归并：把当前 entry 的 name 加到祖先的 mergedChildren
      const keptChildren = (mergedInto.mergedChildren as string[] | undefined) ?? [];
      if (!keptChildren.includes(name)) {
        (mergedInto as Record<string, unknown>).mergedChildren = [...keptChildren, name];
      }
    } else {
      // 检查是否有后代已在 result 里——若有，把后代合并到当前 entry（当前 entry 贡献更大，应排在前）
      const descendantsInResult: T[] = [];
      for (const kept of result) {
        if (isAncestorOf(name, getName(kept), parentChains)) {
          descendantsInResult.push(kept);
        }
      }
      if (descendantsInResult.length > 0) {
        // 从 result 移除后代，合并到当前 entry
        const newMerged: string[] = (entry.mergedChildren as string[] | undefined) ?? [];
        for (const d of descendantsInResult) {
          const dName = getName(d);
          if (!newMerged.includes(dName)) newMerged.push(dName);
          const dChildren = (d.mergedChildren as string[] | undefined) ?? [];
          for (const mc of dChildren) {
            if (!newMerged.includes(mc)) newMerged.push(mc);
          }
        }
        (entry as Record<string, unknown>).mergedChildren = newMerged;
        const descNames = new Set(descendantsInResult.map((d) => getName(d)));
        // 从 result 里移除后代
        for (let i = result.length - 1; i >= 0; i--) {
          if (descNames.has(getName(result[i]))) result.splice(i, 1);
        }
        result.push(entry);
      } else {
        result.push(entry);
      }
    }
  }
  return result;
}

// ─────────────────────────── 2. 人话化工具 ───────────────────────────

/**
 * 把 relativeBaseline 转成人话（去字段名）。
 * foldChange=9999 sentinel → "仅在 X 出现（Y 无此节点）"。
 */
export function humanizeRelativeJudgment(rb: RelativeBaseline | undefined): string {
  if (!rb) return '';
  const fc = rb.foldChange;
  if (fc != null && fc >= 9999) {
    return `仅在 ${rb.compareRole} 出现（${rb.baselineRole} 无此节点）`;
  }
  if (fc != null && Number.isFinite(fc)) {
    if (fc > 1) {
      return `${rb.baselineRole} → ${rb.compareRole} 涨 ×${fc.toFixed(2)}`;
    } else if (fc < 1) {
      return `${rb.baselineRole} → ${rb.compareRole} 降 ×${fc.toFixed(2)}`;
    }
    return `${rb.baselineRole} → ${rb.compareRole} 持平`;
  }
  // 退化用原 relativeJudgment 但去掉字段名
  return rb.relativeJudgment
    .replace(/foldChange=9999 sentinel\)?/g, '新增路径')
    .replace(/foldChange=[\d.]+/g, (m) => `×${m.replace('foldChange=', '')}`);
}

/**
 * 把因果推理 inference 字符串转成人话（去 effectiveCoveragePct / maxWaitSlice / sleepingMs 等字段名）。
 */
export function humanizeCausalInference(inference: string): string {
  return inference
    .replace(/effectiveCoveragePct[≈=]([\d.]+)%?\s*\(maxWait\/sleepingMs\)/g, '主线程睡的时候约 $1% 在等该 wait slice')
    .replace(/effectiveCoveragePct[≈=]([\d.]+)%?/g, '主线程睡的时候约 $1% 在等该 wait slice')
    .replace(/maxWaitSlice=([^;]+)/g, '$1')
    .replace(/sleepingMs=([\d.]+)/g, 'Sleep $1ms')
    .replace(/byState\.S\.totalMs/g, 'Sleeping 累计')
    .replace(/nested sum coveragePct=[\d.]+%.*?(?=;|→|$)/g, '')
    .replace(/\(\s*—\s*use max not sum\s*\)/g, '');
}

/**
 * 把 foldChange 数值转成人话："新增" / "×N" / "持平"。
 * 用于 ROI rationale 等需要简短描述的场景。
 */
export function humanizeFoldChange(fc: number | undefined): string {
  if (fc == null) return '—';
  if (fc >= 9999) return '新增';
  if (!Number.isFinite(fc)) return '—';
  if (fc > 1) return `×${fc.toFixed(2)}`;
  if (fc < 1) return `×${fc.toFixed(2)}`;
  return '持平';
}

// ─────────────────────────── 3. 判定工具（多态 + 单态统一）───────────────────────────

/**
 * 检测报告是单态还是多态。
 * - 'multi'：有 ≥2 个态可对比（如 base/cur/throttle）
 * - 'single'：只有 1 个态（如 simpleperf/unity 单源）
 *
 * summaries 长度即态数。空数组视为 single（退化）。
 */
export function detectStateMode(summaries: unknown[]): 'single' | 'multi' {
  return summaries.length >= 2 ? 'multi' : 'single';
}

/**
 * 多态判定：用 foldChange 判定是否为热点涨幅。
 * threshold 为相对倍数阈值（如 2.0 = 涨 2 倍以上算热点）。
 * foldChange=9999 sentinel 视为新增路径（强信号）。
 */
export function judgeByFoldChange(fc: number | undefined, threshold: number): 'new' | 'rise' | 'flat' | 'drop' {
  if (fc == null) return 'flat';
  if (fc >= 9999) return 'new';
  if (!Number.isFinite(fc)) return 'flat';
  if (fc > threshold) return 'rise';
  if (fc < 1 / threshold) return 'drop';
  return 'flat';
}

/**
 * 单态判定（DR-42 draft）：用 perFrameMs 占 p50 的百分比判定是否为热点。
 * 例如 perFrameMs=8ms, p50Ms=30ms → ratio=26.7%，若 threshold=20% 则判 'hot'。
 *
 * // draft, pending DR-42 validation
 * 待 simpleperf / unity 单源验证后定稿。
 */
export function judgeByP50Ratio(
  perFrameMs: number | null,
  p50Ms: number | null,
  threshold: number, // 占比阈值，如 0.2 = 20%
): 'hot' | 'normal' | 'unknown' {
  if (perFrameMs == null || p50Ms == null || p50Ms <= 0) return 'unknown';
  const ratio = perFrameMs / p50Ms;
  if (ratio >= threshold) return 'hot';
  return 'normal';
}

/**
 * 单态判定（DR-42 draft）：用单次耗时 vs vsync 周期判定 GPU-bound。
 * 例如 avgMs=18ms, vsyncMs=16.66ms → ratio=1.08，若 threshold=1.0 则判 'gpu-bound'。
 *
 * // draft, pending DR-42 validation
 * 待 simpleperf / unity 单源验证后定稿。
 */
export function judgeByVsync(
  avgMs: number | null,
  vsyncMs: number | null,
  threshold: number, // 比值阈值，如 1.0 = 单次耗时 ≥ vsync 周期
): 'gpu-bound' | 'normal' | 'unknown' {
  if (avgMs == null || vsyncMs == null || vsyncMs <= 0) return 'unknown';
  const ratio = avgMs / vsyncMs;
  if (ratio >= threshold) return 'gpu-bound';
  return 'normal';
}

// ─────────────────────────── 4. 叙事工具 ───────────────────────────

/**
 * 构建 ASCII 柱状图：value/max 映射到 width 个 █/░ 字符。
 */
export function buildAsciiBar(value: number, max: number, width = 20): string {
  const w = Math.max(0, Math.min(width, Math.round((value / max) * width)));
  return '█'.repeat(w) + '░'.repeat(Math.max(0, width - w));
}

/**
 * 构建单个 TopConclusionBlock（DR-41 规则 4 四段式）。
 * 调用方负责组织 rank/tag/severity/oneLiner/asciiChart/keyNumbers/seeAlso 的语义，
 * 本函数只做组装——这样不同数据源可以用各自的逻辑生成内容，共用同一个块结构。
 */
export function buildTopConclusionBlock(params: {
  rank: number;
  tag: string;
  severity: 'critical' | 'warning' | 'info';
  oneLiner: string;
  asciiChart: string;
  keyNumbers: string[];
  seeAlso: string;
  findingIds: string[];
}): TopConclusionBlock {
  return {
    rank: params.rank,
    tag: params.tag,
    severity: params.severity,
    oneLiner: params.oneLiner,
    asciiChart: params.asciiChart,
    keyNumbers: params.keyNumbers,
    seeAlso: params.seeAlso,
    findingIds: params.findingIds,
  };
}

/**
 * 构建子树下钻结构（DR-41 规则 3 下钻详情层）。
 * 主入口 → 子树 → 红线模块三层。
 *
 * 从 callTree 提取指定 module 子树下的 top N 子节点（按 totalMs 降序），
 * 用于下钻详情卡片。
 */
export function buildSubtreeDrilldown(
  module: string,
  root: ReportTreeNode | undefined,
  topN: number,
): { module: string; children: Array<{ name: string; totalMs: number | null; perFrameMs: number | null }> } {
  const children: Array<{ name: string; totalMs: number | null; perFrameMs: number | null }> = [];
  if (!root) return { module, children };

  // 找到 module 节点
  let target: ReportTreeNode | null = null;
  const find = (n: ReportTreeNode | undefined) => {
    if (!n || target) return;
    if (n.name === module) { target = n; return; }
    if (n.children) for (const c of n.children) find(c);
  };
  find(root);
  if (!target?.children) return { module, children };

  // 收集子节点，按 totalMs 降序
  const sorted = [...target.children]
    .map((c) => ({
      name: c.name,
      totalMs: typeof c.totalMs === 'number' ? c.totalMs : null,
      perFrameMs: null,
    }))
    .sort((a, b) => (b.totalMs ?? 0) - (a.totalMs ?? 0));

  return { module, children: sorted.slice(0, topN) };
}

// ─────────────────────────── 5. 渲染工具 ───────────────────────────

/**
 * HTML 转义。
 */
export function htmlEsc(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 渲染四段式块 HTML（DR-41 规则 4：引用块 + ASCII 图 + 关键数字 + 详见 §X）。
 * 数据源无关：只依赖 TopConclusionBlock 结构。
 */
export function renderFourPartBlock(block: TopConclusionBlock, sevClass: (sev: string) => string): string {
  return `
    <div class="card conclusion-block ${sevClass(block.severity)}">
      <div class="block-tag">${htmlEsc(block.tag)}</div>
      <div class="block-body">
        <blockquote class="one-liner"><strong>${htmlEsc(block.oneLiner)}</strong></blockquote>
        <pre class="ascii">${htmlEsc(block.asciiChart)}</pre>
        <ul class="key-numbers">
          ${block.keyNumbers.map((k) => `<li>${htmlEsc(k)}</li>`).join('\n')}
        </ul>
        <p class="see-also">${htmlEsc(block.seeAlso)}</p>
      </div>
    </div>`;
}

/**
 * 渲染下钻卡片 HTML（DR-41 规则 3 下钻详情层）。
 * 数据源无关：只依赖 DrilldownCard 结构。
 */
export function renderDrilldownCard(card: DrilldownCard): string {
  const mergedNote = card.mergedChildren.length > 0
    ? `<p class="muted small">子树归并：${card.mergedChildren.map(htmlEsc).join(' / ')}</p>`
    : '';
  const perFrameLine = card.perFrameMs != null
    ? `<p>ms/帧：<strong>${card.perFrameMs.toFixed(2)}</strong></p>`
    : '';
  const keyNumberList = card.keyNumbers.length > 0
    ? `<ul class="key-numbers">${card.keyNumbers.map((k) => `<li>${htmlEsc(k)}</li>`).join('')}</ul>`
    : '';
  const callTreeLine = card.callTreeSnippet
    ? `<pre class="ascii">${htmlEsc(card.callTreeSnippet)}</pre>`
    : '';
  const optLine = card.optimization
    ? `<p class="note">${htmlEsc(card.optimization)}</p>`
    : '';
  return `
    <div class="card drilldown">
      <h4>${htmlEsc(card.module)}</h4>
      ${mergedNote}
      ${perFrameLine}
      ${keyNumberList}
      ${callTreeLine}
      ${optLine}
    </div>`;
}

/**
 * 渲染带严重程度标注的 callTree 缩进树（🔴/🟡/🟢/📈/[wrapper]）。
 * 数据源无关：接收通用 ReportTreeNode。
 *
 * severityOf：节点名 → 严重程度的回调（由调用方根据 findings/红线判定提供）。
 *   返回 'critical' | 'warning' | 'info' | 'wrapper' | null（null=不标注）
 */
export function renderCallTreeWithSeverity(
  root: ReportTreeNode | undefined,
  severityOf: (name: string) => 'critical' | 'warning' | 'info' | 'wrapper' | null,
  maxDepth: number,
): string {
  if (!root) return '';
  const lines: string[] = [];
  const sevMark = (s: 'critical' | 'warning' | 'info' | 'wrapper' | null): string => {
    if (s === 'critical') return ' 🔴';
    if (s === 'warning') return ' 🟡';
    if (s === 'info') return ' 🟢';
    if (s === 'wrapper') return ' [wrapper]';
    return '';
  };
  const walk = (n: ReportTreeNode, depth: number, prefix: string) => {
    if (depth > maxDepth) return;
    const ms = typeof n.totalMs === 'number' ? ` (${n.totalMs.toFixed(2)}ms)` : '';
    lines.push(`${prefix}${n.name}${ms}${sevMark(severityOf(n.name))}`);
    if (n.children) {
      for (let i = 0; i < n.children.length; i++) {
        const last = i === n.children.length - 1;
        walk(n.children[i], depth + 1, prefix + (last ? '  ' : '  '));
      }
    }
  };
  walk(root, 0, '');
  return lines.join('\n');
}

// ─────────────────────────── 6. v5.3 渲染能力（WT-028 C1 反向沉淀）───────────────────────────

/**
 * GC 归因换算：子树 N 次 → N 次/帧（v5.3 §6.3）。
 *
 * v5.3 标杆写法："BattleHeadMgr 子树 5341 次 → 11.0 次/帧"。
 * 数据源无关：接收总次数 + 帧数，返回每帧次数。
 *
 * @param totalCount 子树 GC.Alloc 总次数（从 callTree 子树聚合）
 * @param frameCount 该样本帧数
 * @returns 次/帧（保留 1 位小数）；frameCount ≤ 0 时返回 null
 */
export function gcAllocToPerFrame(totalCount: number, frameCount: number): number | null {
  if (frameCount <= 0) return null;
  return Math.round((totalCount / frameCount) * 10) / 10;
}

/**
 * 三态 ASCII 柱状图（v5.3 §4.4 状态分布可视化）。
 *
 * v5.3 标杆写法（三态对照）：
 * ```
 * base       ███████████████████████████████ ░░░    Run 86.94% / Sleep 12.04%
 * cur        ██████████████████████████ ░░░░░     Run 77.82% / Sleep 20.40%
 * throttle   ███████████████████ ░░░░░░░░░░       Run 56.99% / Sleep 38.99%
 * ```
 *
 * 数据源无关：接收 role → value 映射，返回多行 ASCII。每行 = role + bar + 数值解读。
 * valueLabel 用于解读行（如 "Run" / "Sleep"），让调用方决定语义。
 *
 * @param states 三态数据，按 role 顺序（如 [{role:'base', value:86.94}, ...]）
 * @param maxValue 柱状图最大值（如 100，表示百分比）；<=0 时自动取 states 最大值
 * @param valueLabel 数值标签（如 "Run" / "Sleep"），用于解读行
 * @param width 柱状图字符宽度（默认 30）
 */
export function buildTriadAsciiBar(
  states: Array<{ role: string; value: number | null }>,
  maxValue: number,
  valueLabel: string,
  width = 30,
): string {
  if (states.length === 0) return '';
  const max = maxValue > 0 ? maxValue : Math.max(...states.map((s) => s.value ?? 0));
  const roleWidth = Math.max(...states.map((s) => s.role.length)) + 1;
  const lines = states.map((s) => {
    const v = s.value;
    const bar = v != null ? buildAsciiBar(v, max, width) : '░'.repeat(width);
    const num = v != null ? `${valueLabel} ${v.toFixed(2)}%` : `${valueLabel} N/A`;
    return `${s.role.padEnd(roleWidth)}${bar}   ${num}`;
  });
  return lines.join('\n');
}

/**
 * 三态状态分布 ASCII 可视化（v5.3 §4.4 完整版）。
 *
 * v5.3 标杆写法：每态一行柱状图 + 解读行（说明该态特征）。
 *
 * 数据源无关：接收三态的 run/sleep/runnable 占比，返回 ASCII 图 + 解读。
 * 调用方提供 interpretation（每态一句话解读），本函数负责拼图。
 *
 * @param states 三态数据（role + run/sleep/runnable 百分比）
 * @param interpretations 每态的解读行（role → 一句话）
 * @param width 柱状图宽度（默认 30）
 */
export function buildStateDistributionAscii(
  states: Array<{
    role: string;
    runPct: number | null;
    sleepPct: number | null;
    runnablePct?: number | null;
  }>,
  interpretations: Record<string, string>,
  width = 30,
): string {
  if (states.length === 0) return '';
  const roleWidth = Math.max(...states.map((s) => s.role.length)) + 1;
  const lines: string[] = [];
  for (const s of states) {
    const run = s.runPct ?? 0;
    const sleep = s.sleepPct ?? 0;
    const runn = s.runnablePct ?? 0;
    const bar = buildAsciiBar(run, 100, width);
    const runnStr = s.runnablePct != null ? ` / Runn ${runn.toFixed(2)}%` : '';
    lines.push(
      `${s.role.padEnd(roleWidth)}${bar}   Run ${run.toFixed(2)}% / Sleep ${sleep.toFixed(2)}%${runnStr}`,
    );
    const interp = interpretations[s.role];
    if (interp) {
      lines.push(`${' '.repeat(roleWidth)}↑ ${interp}`);
    }
  }
  return lines.join('\n');
}

/**
 * callTree ├─/└─ 缩进树渲染 + 三态对照 [base/cur/throttle ms/帧] + 涨幅% + 标注（v5.3 §5.2）。
 *
 * v5.3 标杆写法：
 * ```
 * ├─ URP.AfterRendering  [base 1.68 / cur 6.84 / throttle 19.33] 📈🔵🔴 +307% / +183%
 * │  └─ URP.Submit
 * ```
 *
 * 数据源无关：接收通用 ReportTreeNode + 三态 perFrameMs 映射 + 严重程度回调。
 * 三态对照格式：`[base X / cur Y / throttle Z ms/帧]` + 涨幅% 标注。
 * 单态时退化为 `[cur Y ms/帧]`（无涨幅%） *
 * @param root 调用树根节点
 * @param triadPerFrame 三态 perFrameMs 映射：role → Map<nodeName, perFrameMs>
 *                       单态时只传一个 role（如 {single: Map}）
 * @param severityOf 节点名 → 严重程度回调（'critical'|'warning'|'info'|'wrapper'|'wait'|null）
 * @param maxDepth 最大深度
 * @param frameCounts 三态帧数映射（用于涨幅% 计算：foldChange = compare/base）
 * @returns 多行 ASCII 字符串
 */
export function renderCallTreeTriad(
  root: ReportTreeNode | undefined,
  triadPerFrame: Record<string, Map<string, number | null>>,
  severityOf: (name: string) => 'critical' | 'warning' | 'info' | 'wrapper' | 'wait' | null,
  maxDepth: number,
  frameCounts?: Record<string, number>,
): string {
  if (!root) return '';
  const roles = Object.keys(triadPerFrame);
  const isMulti = roles.length >= 2;
  const lines: string[] = [];

  const sevMark = (s: 'critical' | 'warning' | 'info' | 'wrapper' | 'wait' | null): string => {
    if (s === 'critical') return ' 🔴';
    if (s === 'warning') return ' 🟡';
    if (s === 'info') return ' 🟢';
    if (s === 'wrapper') return ' [wrapper]';
    if (s === 'wait') return ' 🔵';
    return '';
  };

  const formatPerFrame = (nodeName: string): string => {
    if (!isMulti) {
      // 单态：[cur Y ms/帧]
      const role = roles[0];
      const v = triadPerFrame[role]?.get(nodeName);
      if (v == null) return '';
      return ` [${role} ${v.toFixed(2)} ms/帧]`;
    }
    // 多态：[base X / cur Y / throttle Z] + 涨幅%
    const parts = roles.map((r) => {
      const v = triadPerFrame[r]?.get(nodeName);
      return v != null ? `${r} ${v.toFixed(2)}` : `${r} —`;
    });
    // 涨幅%：compare vs base（base = roles[0], 后续 role 依次算）
    const baseRole = roles[0];
    const baseVal = triadPerFrame[baseRole]?.get(nodeName);
    const deltas: string[] = [];
    for (let i = 1; i < roles.length; i++) {
      const cmpRole = roles[i];
      const cmpVal = triadPerFrame[cmpRole]?.get(nodeName);
      if (baseVal != null && cmpVal != null && baseVal > 0) {
        const pct = ((cmpVal - baseVal) / baseVal) * 100;
        if (pct > 50) deltas.push(`+${Math.round(pct)}%`);
      }
    }
    const deltaStr = deltas.length > 0 ? ` ${deltas.join(' / ')}` : '';
    return ` [${parts.join(' / ')}]${deltaStr}`;
  };

  const walk = (
    n: ReportTreeNode,
    depth: number,
    prefix: string,
    isLast: boolean,
    isRoot: boolean,
  ) => {
    if (depth > maxDepth) return;
    const branch = isRoot ? '' : isLast ? '└─ ' : '├─ ';
    const childPrefix = isRoot ? '' : isLast ? '   ' : '│  ';
    const ms = formatPerFrame(n.name);
    const mark = sevMark(severityOf(n.name));
    lines.push(`${prefix}${branch}${n.name}${ms}${mark}`);
    if (n.children) {
      for (let i = 0; i < n.children.length; i++) {
        const last = i === n.children.length - 1;
        walk(n.children[i], depth + 1, prefix + childPrefix, last, false);
      }
    }
  };
  walk(root, 0, '', true, true);
  return lines.join('\n');
}

/**
 * 树状下钻渲染 + 按贡献度排序（v5.3 §0②）。
 *
 * v5.3 标杆写法（§0② Core.Update 下钻）：
 * ```
 * Core.Update  base 1.73 / cur 7.32 / throttle 8.05 ms/帧 (📈 ×4.2 → ×4.7)
 * ├─ CS:AOE.LuaMgr  base 1.00 / cur 3.80 / throttle 3.47 ms/帧 (📈 ×3.8)
 * │  └─ LuaMgr.OnTick&UpdateSchedule  ...
 * ```
 *
 * 数据源无关：接收通用 ReportTreeNode + 三态 perFrameMs 映射。
 * 按贡献度排序：子节点按 compareRole 的 perFrameMs 降序（贡献大的在前）。
 *
 * @param root 下钻起始节点（从该节点往下渲染）
 * @param triadPerFrame 三态 perFrameMs 映射
 * @param severityOf 严重程度回调
 * @param maxDepth 最大深度
 * @param compareRole 用于排序的 role（多态默认 cur，单态默认唯一 role）
 */
export function renderSubtreeDrilldown(
  root: ReportTreeNode | undefined,
  triadPerFrame: Record<string, Map<string, number | null>>,
  severityOf: (name: string) => 'critical' | 'warning' | 'info' | 'wrapper' | 'wait' | null,
  maxDepth: number,
  compareRole?: string,
): string {
  if (!root) return '';
  const roles = Object.keys(triadPerFrame);
  const sortRole = compareRole ?? (roles.length >= 2 ? roles[1] : roles[0]);

  // 按贡献度排序子节点（compareRole perFrameMs 降序，null 排后）
  const sortChildren = (children: ReportTreeNode[]): ReportTreeNode[] => {
    return [...children].sort((a, b) => {
      const av = triadPerFrame[sortRole]?.get(a.name);
      const bv = triadPerFrame[sortRole]?.get(b.name);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    });
  };

  const isMulti = roles.length >= 2;
  const lines: string[] = [];

  const sevMark = (s: 'critical' | 'warning' | 'info' | 'wrapper' | 'wait' | null): string => {
    if (s === 'critical') return ' 🔴';
    if (s === 'warning') return ' 🟡';
    if (s === 'info') return ' 🟢';
    if (s === 'wrapper') return ' [wrapper]';
    if (s === 'wait') return ' 🔵';
    return '';
  };

  const formatPerFrame = (nodeName: string): string => {
    if (!isMulti) {
      const role = roles[0];
      const v = triadPerFrame[role]?.get(nodeName);
      if (v == null) return '';
      return ` ${role} ${v.toFixed(2)} ms/帧`;
    }
    const parts = roles.map((r) => {
      const v = triadPerFrame[r]?.get(nodeName);
      return v != null ? `${r} ${v.toFixed(2)}` : `${r} —`;
    });
    // foldChange 标注（v5.3 §0② "📈 ×4.2 → ×4.7"）
    const baseRole = roles[0];
    const baseVal = triadPerFrame[baseRole]?.get(nodeName);
    const fcs: string[] = [];
    for (let i = 1; i < roles.length; i++) {
      const cmpRole = roles[i];
      const cmpVal = triadPerFrame[cmpRole]?.get(nodeName);
      if (baseVal != null && cmpVal != null && baseVal > 0) {
        const fc = cmpVal / baseVal;
        if (fc > 1.5) fcs.push(`×${fc.toFixed(1)}`);
      }
    }
    const fcStr = fcs.length > 0 ? ` (📈 ${fcs.join(' → ')})` : '';
    return ` ${parts.join(' / ')} ms/帧${fcStr}`;
  };

  const walk = (
    n: ReportTreeNode,
    depth: number,
    prefix: string,
    isLast: boolean,
    isRoot: boolean,
  ) => {
    if (depth > maxDepth) return;
    const branch = isRoot ? '' : isLast ? '└─ ' : '├─ ';
    const childPrefix = isRoot ? '' : isLast ? '   ' : '│  ';
    const ms = formatPerFrame(n.name);
    const mark = sevMark(severityOf(n.name));
    lines.push(`${prefix}${branch}${n.name}${ms}${mark}`);
    if (n.children && n.children.length > 0) {
      const sorted = sortChildren(n.children);
      for (let i = 0; i < sorted.length; i++) {
        const last = i === sorted.length - 1;
        walk(sorted[i], depth + 1, prefix + childPrefix, last, false);
      }
    }
  };
  walk(root, 0, '', true, true);
  return lines.join('\n');
}
