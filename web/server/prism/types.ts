/**
 * Prism 阶段一核心类型：Finding / DataRequest / ToolCall。
 *
 * 设计锚点（见 docs/prism/memory/charter.md）：
 * - F1 分析师非作文机：每个 Finding 的每条断言都回溯到一次可复现、带 provenance 的查询。
 *   evidence 不是自由文本，而是挂着真实 ToolCall（tool + args + 归约结果）。
 * - F4 能力回路：DataRequest 是"LLM 想查却查不到"的一等产物，喂给 provider 自举。
 * - 复用 web/shared/perf-model.ts 的 Insight 语义（severity/confidence/conclusion/recommendation），
 *   但 evidence 升级为可回溯的 ToolCall 引用，而非 {source, detail:string}。
 *
 * 通用性（架构第一原则·Finding 开放可扩展）：evidence 里不写任何单源硬编码字段，
 * 只有通用的 { tool, args, resultDigest }。加新源/新工具无需改本类型。
 */

export type PrismSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type PrismConfidence = 'high' | 'medium' | 'low';

/** 一次查询工具调用的可回溯记录。evidence 的原子单位。 */
export interface ToolCall {
  /** 工具名，如 'scanMetricOverFrames'。 */
  tool: string;
  /** 调用入参（原样，可复现）。 */
  args: Record<string, unknown>;
  /**
   * 该次调用返回的**归约结果摘要**（小对象，非原始逐帧数组，见 token 红线 DR-12）。
   * 直接内嵌，使 Finding 自包含、可离线审计——读 Finding 即见支撑数字，无需重跑。
   */
  resultDigest: unknown;
  /** 可选：产生该调用的 run。 */
  runId?: string;
}

/**
 * 一条 Prism 发现。由 Phase A 探索内核在自由探索中产出。
 * 铁律（F1）：没有 evidence（至少一条 ToolCall）就不允许存在——无证据不下结论。
 */
export interface Finding {
  /** 稳定 id，便于跨阶段引用/去重（如 'wait.main.semaphore'）。 */
  id: string;
  /** 普通话结论先行（F6 TL;DR 的原料）。 */
  conclusion: string;
  severity: PrismSeverity;
  confidence: PrismConfidence;
  /**
   * 可回溯证据链：支撑本结论的真实工具调用。至少一条。
   * 这是 F1 的落地——"点开看支撑它的查询和数字"。
   */
  evidence: ToolCall[];
  /**
   * 可选：AI 的推理链（为什么这些证据支撑这个结论）。
   * 与 evidence 分离：evidence 是事实，reasoning 是解释。
   */
  reasoning?: string;
  /** 自我批判回合（DR-24）对本 finding 的审查/补查/修改记录。 */
  selfCritique?: string;
  /** 可选：优化建议（阶段三源码锚定后才带 confidence 的代码建议；阶段一仅数据侧建议）。 */
  recommendation?: string;
  /**
   * 可选：本 finding 触及的符号/marker 名，供阶段三源码锚定（F5）预留挂点。
   * 阶段一可填 marker 名，不做源码检索。
   */
  symbols?: string[];
  /** 可选：AI 给的标签，便于 Phase B 分组（如 'thread-wait' / 'periodicity' / 'tail-latency'）。 */
  tags?: string[];
}

/**
 * 数据缺口请求（F4 能力回路的一等产物）。
 * 当 Phase A 里 LLM 想查某维度、现有工具给不出时产出。
 * 短期：人/通用执行器满足；长期：高频复现的固化成新工具/新 provider 字段。
 */
export interface DataRequest {
  /** 稳定 id，便于跨版本统计高频复现。 */
  id: string;
  /** 一句话：想要什么数据/什么查询能力。 */
  want: string;
  /** 为什么要——支撑哪个假设 H / 想验证什么。 */
  rationale: string;
  /** 可选：AI 猜测这属于哪个数据轴（marker/frame/thread/depth/set/新轴如 memory）。 */
  suspectedAxis?: string;
  /** 可选：现有哪个工具最接近但差在哪。 */
  closestExistingTool?: string;
}

/** Phase A 探索的完整产出。 */
export interface ExploreResult {
  runId: string;
  /** 结构化发现图（Phase B 的唯一输入）。 */
  findings: Finding[];
  /** 本轮探索撞到的数据缺口（喂 F4）。 */
  dataRequests: DataRequest[];
  /** 可选：探索过程的工具调用总数/轮次等元信息，便于成本审计。 */
  meta?: {
    toolCallCount?: number;
    rounds?: number;
    notes?: string[];
  };
}
