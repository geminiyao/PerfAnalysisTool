// P3 对比分析结果类型 — 决策 9 五步结构 + report-spec §5/§6.3

import type { CallTreeNode, Confidence, InsightSeverity, SourceId } from './perf-model.js';

export type CompareVerdict = 'effective' | 'ineffective' | 'regression' | 'inconclusive';
export type ComparabilityLevel = 'ok' | 'acceptable' | 'not_comparable';
export type NodeDeltaMask = 'A' | 'M' | 'D';

export interface MetricDelta {
  key: string;
  label: string;
  unit: string;
  source: SourceId;
  baseline: number;
  current: number;
  delta: number;
  deltaPct: number | null;
  improved: boolean;
}

export interface CallTreeNodeDelta {
  name: string;
  mask: NodeDeltaMask;
  layer?: string;
  baseline?: { selfPct?: number; totalPct?: number; selfMs?: number; totalMs?: number };
  current?: { selfPct?: number; totalPct?: number; selfMs?: number; totalMs?: number };
  deltaPct?: number;
  deltaMs?: number;
  maybeInlined?: boolean;
}

export interface SourceDiffTree {
  source: SourceId;
  /** 宏观对比 */
  macro: MetricDelta[];
  /** 大 delta 节点 (按 |delta| 排序) */
  topNodes: CallTreeNodeDelta[];
  note?: string;
}

export interface UnityUniqueCompare {
  jank: {
    baseline: { count: number; bigCount: number; rate: number; slowRate33: number };
    current: { count: number; bigCount: number; rate: number; slowRate33: number };
    delta: { count: number; bigCount: number; rate: number; slowRate33: number };
  };
  topMarkerDeltas: MetricDelta[];
}

export interface SimpleperfUniqueCompare {
  soDeltas: MetricDelta[];
  anchorDeltas: MetricDelta[];
}

export interface PerfettoUniqueCompare {
  threadDeltas: MetricDelta[];
  systemDeltas: MetricDelta[];
  throttleNote?: string;
}

export interface CompareSynthesisItem {
  kind: 'common' | 'unique';
  sources: SourceId[];
  conclusion: string;
  evidence: string;
  severity: InsightSeverity;
}

export interface RunCompareResult {
  baseRunId: string;
  currentRunId: string;
  /** Step 1 */
  headline: string;
  verdict: CompareVerdict;
  confidence: Confidence;
  verdictReason: string;
  /** Step 2 */
  comparability: {
    level: ComparabilityLevel;
    checks: { name: string; ok: boolean; detail: string }[];
    warnings: string[];
  };
  /** Step 3 */
  diffTrees: SourceDiffTree[];
  /** Step 4 */
  unique: {
    unity_profiler?: UnityUniqueCompare;
    simpleperf?: SimpleperfUniqueCompare;
    perfetto?: PerfettoUniqueCompare;
  };
  /** Step 5 */
  synthesis: CompareSynthesisItem[];
  /** P3-2: 完整对比 Markdown (report-spec §5) */
  markdown: string;
  /** 落盘路径 (output/p3-compare/) */
  markdownPath?: string;
}
