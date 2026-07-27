import type { CallTreeNode } from './perf-model';

export type ReportType =
  | 'unity-single'
  | 'unity-diff'
  | 'perfetto-single'
  | 'perfetto-diff'
  | 'simpleperf-single'
  | 'simpleperf-diff'
  | 'cross-single'
  | 'cross-diff';

export type VerdictGrade = 'excellent' | 'pass' | 'weak' | 'fail';

export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface ReportSourceMeta {
  role: string;
  label: string;
  frameCount?: number;
}

export interface MetricCard {
  key: string;
  label: string;
  value: number;
  unit: string;
  budget?: number;
  status?: 'ok' | 'warn' | 'bad';
  hint?: string;
}

export interface ReportFinding {
  id: string;
  severity: FindingSeverity;
  title: string;
  markerName?: string;
  thread?: string;
  selfMsMean?: number;
  selfMsMax?: number;
  pctOfFrame?: number;
  presentFrames?: string;
  sourceLocation?: string;
  bottleneckType?: string;
  callTreeRef?: string;
  narrative?: string;
  evidenceKeys: string[];
  mustReport?: boolean;
}

export interface ReportCallTree {
  id: string;
  label: string;
  thread: string;
  frameIndex?: number;
  root: CallTreeNode;
}

export interface ReportSection {
  id: string;
  title: string;
  level: number;
}

export interface ThreadLoadItem {
  name: string;
  msMedian: number;
  msMax: number;
}

export interface ReportOutlineItem {
  id: string;
  title: string;
  level: number;
}

export interface NarrativeBlock {
  id: string;
  title: string;
  content: string;
}

export interface ReportBundle {
  meta: {
    reportType: ReportType;
    title: string;
    generatedAt: string;
    sources: ReportSourceMeta[];
    targetFps: number;
    frameBudgetMs: number;
    frameCount: number;
    frameDefinition?: string;
    dataSources?: {
      summary: string;
      narrative: string;
    };
  };
  verdict: {
    grade: VerdictGrade;
    headline: string;
    summaryBullets: string[];
    caveats?: string[];
  };
  kpis: MetricCard[];
  findings: ReportFinding[];
  sections: ReportSection[];
  trees: ReportCallTree[];
  threadLoad: ThreadLoadItem[];
  frameSummary: {
    count: number;
    mean: number;
    median: number;
    min: number;
    max: number;
    q1: number;
    q3: number;
    worstFrameIndex: number;
    medianFrameIndex: number;
    jankCount: number;
    bigJankCount: number;
    actualFps: number;
    slowRate33Ms?: number;
    slowRate50Ms?: number;
    gcAllocPerFrame?: number;
    spikeCount?: number;
  };
  narrative: NarrativeBlock[];
  provenance: Record<string, { label: string; value: string | number }>;
  /** 完整报告正文 — 阅读主路径 */
  markdown: string;
  /** 从 markdown 标题解析的目录 */
  outline: ReportOutlineItem[];
}
