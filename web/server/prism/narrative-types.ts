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
}

/** 一个主题群（如"稳态开销群"/"偶发尖峰群"/"工作线程"/"已排除"） */
export interface NarrativeSection {
  /** 群标题（如"稳态开销：决定帧率天花板的常驻税"） */
  heading: string;
  /** 群导语（一段话，讲这一组问题的共性——如"这三项每帧都在，合计6.6ms/帧"） */
  intro?: string;
  items: NarrativeItem[];
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
}
