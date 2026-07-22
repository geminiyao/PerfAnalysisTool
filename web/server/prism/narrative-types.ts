/**
 * narrative-types.ts — Prism 叙事报告结构（路B / DR-39）
 *
 * 分析师探索出 findings 后，"叙事阶段"让 LLM 读自己的 findings，写出这份 NarrativeReport——
 * 只含给人阅读的内容（概览/问题先行/主题分群/线程/优先级），**审计信息(证据链/自审/技术论证)
 * 完全不进这里**，它们留在 findings.json 供核查。renderer 只渲染 NarrativeReport + 调用树可视化。
 *
 * 对标 narrative_sample.md 的叙事结构，让报告"不弱于、强于作文机"。
 */

/** 一棵调用树节点（渲染时由 renderer 重查 drillDownMarker 填充真实数据；叙事阶段只需给出 rootMarker） */
export interface CallTreeRef {
  /** 要展示调用树的根 marker（renderer 会重查它拿结构化树 + 上色渲染） */
  rootMarker: string;
  /** 可选：叙事作者对这棵树想强调的一句话（如"82%是自身逻辑，子节点只占18%"） */
  note?: string;
}

/** 一个"问题项"——可以是一条发现，也可以是几条发现合起来讲的一个主题 */
export interface NarrativeItem {
  /** 关联的 finding id（一个或多个——多个=把几条发现合并成一个主题叙事） */
  findingIds: string[];
  /** 小节标题（人话，如"行军线管理：每帧2.3ms的常驻税"） */
  title: string;
  /** 叙事正文（人话，讲清什么问题/多严重/为什么/对玩家啥影响。可跨 finding 串联） */
  narrative: string;
  /** 可选：调用树可视化（renderer 重查渲染） */
  callTree?: CallTreeRef;
  /** 可选：源码归因（读到真实代码时，讲代码里的具体问题——如"三个每帧全量foreach"） */
  sourceInsight?: string;
  /** 优化建议（编号列表，每条可落地） */
  recommendations: string[];
  /** 严重度（叙事作者按"对整体帧率的贡献"判定，不按单帧峰值） */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /**
   * 可选：视觉资产（表格/ASCII 图/矩阵），LLM 按 {{REPORT_TEMPLATE}} 注入的模板填。
   * render 按类型渲染：table→<table>、ascii→<pre>、matrix→<table> 按 levelColumn 上色。
   * 这是通用的（不硬编码 perfetto 特有概念），任何数据源的模板都能用。
   */
  visualAsset?: VisualAsset;
}

/**
 * 视觉资产（WT-036：从顶层字段移到 section item 里，去 perfetto 特有字段污染通用 schema）。
 * LLM 按 {{REPORT_TEMPLATE}} 注入的模板填，render 按 type 渲染。
 * 通用类型：table（表格）/ ascii（ASCII 图）/ matrix（矩阵，按 levelColumn 上色）。
 */
export interface VisualAsset {
  /** 资产类型：table（表格）/ ascii（ASCII 图）/ matrix（矩阵） */
  type: 'table' | 'ascii' | 'matrix';
  /** 资产标题（如"采集元信息"/"多线程宏观"/"降频判定矩阵"） */
  title: string;
  /** 表格数据（type=table 或 type=matrix 时填） */
  table?: {
    headers: string[];      // 表头
    rows: string[][];       // 数据行
  };
  /** ASCII 图内容（type=ascii 时填） */
  ascii?: {
    content: string;         // ASCII 图文本
    caption?: string;        // 图下方解读
  };
  /**
   * 矩阵的判定档列名（type=matrix 时可选）。
   * 指向 table.headers 里某一列的列名，该列的值是 confirmed/likely/suspected（或类似三档），
   * render 按值上色。如 perfetto 降频矩阵的 levelColumn="判定档"。
   */
  levelColumn?: string;
}

/** 一个主题群（如"稳态开销群"/"偶发尖峰群"/"工作线程"/"已排除"） */
export interface NarrativeSection {
  /** 群标题（如"稳态开销：决定帧率天花板的常驻税"） */
  heading: string;
  /** 群导语（一段话，讲这一组问题的共性——如"这三项每帧都在，合计6.6ms/帧"） */
  intro?: string;
  items: NarrativeItem[];
}

/**
 * narrative.json 产出溯源（DR-44 A2）。
 * render-html 校验 generatedBy==='LLM'，非 LLM 拒绝渲染——
 * 机制上拦截脚本拼的 narrative.json 绕过 narrative LLM 阶段。
 */
export interface NarrativeProvenance {
  /** 产出阶段标记，固定 'narrative-llm' */
  stage: 'narrative-llm';
  /** narrative-prompt 版本（如 'narrative-prompt.txt@v1'） */
  promptVersion: string;
  /** 产出方标记——必须是 'LLM'。脚本拼的 = 'script'，会被 render-html 拒绝渲染 */
  generatedBy: 'LLM' | 'script';
  /**
   * WT-049: 各环节耗时（ms）。
   * 键：precheck/prompt_inject/cli_resolve/llm_call/artifact_check/json_parse/
   *     provenance_check/red_team/file_io/total/json_repair_retry_1/json_repair_retry_2
   * 先定位耗时环节，再看修复方案方向是否正确。
   */
  timing?: Record<string, number>;
  /**
   * WT-049: JSON 修复回路重试次数。
   * 0 = 一次成功（LLM 一次产出合规 JSON）；1-2 = 修复过（LLM 第一次产出非法 JSON 被修复回路接住）。
   * 验收时看修复回路是否真的接住了非法 JSON。
   */
  repairCount?: number;
}

/** 三维定性维度：热点主要属于哪一类（可多选） */
export type HotspotDimension = 'absoluteCost' | 'shareHigh' | 'outlier';

/** 单源可判性：这条结论单源能不能下定论 */
export type HotspotJudgability = 'judgable' | 'needsBaseline' | 'needsDomainKnowledge';

/** 核心结论表的一行（问题先行，按整体贡献排序） */
export interface TopConclusionRow {
  rank: number;
  problem: string;       // 问题名
  kind: string;          // 类型：稳态大头 / 高频尖峰 / 低频尖峰
  contribution: string;  // 对整体的贡献（如"每帧2.3ms×600=1381ms，全场self最高"）
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** 三维定性：这个热点主要属于哪一类（可多选）。absoluteCost=绝对量大/占帧预算显著；shareHigh=占总量/贡献度高；outlier=离群严重(spikeRatio/p99高) */
  dimensions?: HotspotDimension[];
  /** 单源可判性：这条结论单源能不能下定论。judgable=能判(有绝对基线/内生可比)；needsBaseline=该不该管需历史基线；needsDomainKnowledge=需业务知识 */
  judgability?: HotspotJudgability;
  /** 可选：挂在这条结论下的调用树（render 重查渲染，复用 NarrativeItem.callTree 的 CallTreeRef 类型） */
  callTree?: CallTreeRef;
  /** 可选：挂在这条结论下的 ASCII 图（LLM 产文本，render 原样渲染在 <pre> 块，复用 AsciiArt 类型） */
  asciiArt?: AsciiArt;
}

// ─────────────────────── 视觉资产类型（WT-036：通用，不硬编码 perfetto 特有概念） ───────────────────────
// 视觉资产现在挂在 NarrativeItem.visualAsset 字段里（不再有顶层 metaInfo/threadOverview 等 perfetto 特有字段）。
// render 层只做呈现（画表格/原样渲染 ASCII），不写判定逻辑（判定在 explore LLM）。
// 详见上方 VisualAsset 接口。

/** ASCII 图资产（通用——任何数据源的核心结论/section item 都可能挂 ASCII 图） */
export interface AsciiArt {
  /** 图标题（如"主线程三态状态分布"） */
  title: string;
  /** ASCII 图文本（原样渲染在等宽 <pre> 块，不转义换行） */
  content: string;
  /** 可选：图下方的一句话解读 */
  caption?: string;
}

export interface NarrativeReport {
  runId: string;
  /** 一、概览：一句话讲清整体故事（如"稳态打底+尖峰捅刀"） */
  overview: string;
  /** 判定（沿用 verdict） */
  rating: 'excellent' | 'pass' | 'weak' | 'fail';
  /** 二、核心结论表（问题先行，按整体贡献排序） */
  topConclusions: TopConclusionRow[];
  /** 判定边界诚实声明：单源这次能确定什么、判不了什么（超越作文机的"知道自己边界"）。可选。 */
  judgmentBoundary?: { canJudge: string[]; cannotJudge: string[] };
  /** 已排除项（查证后确认不是问题的——作文机没有的"辨伪"能力） */
  ruledOut?: { name: string; why: string }[];
  /** 三~五、主题分群（稳态/尖峰/线程等，由叙事作者自己组织，不写死） */
  sections: NarrativeSection[];
  /** 六、优化优先级汇总（P0/P1/P2 + 补采需求） */
  prioritySummary: { priority: string; action: string; benefit: string }[];

  /** 产出溯源（DR-44 A2）：render-html 校验 generatedBy==='LLM'，非 LLM 拒绝渲染 */
  narrativeProvenance: NarrativeProvenance;
}
