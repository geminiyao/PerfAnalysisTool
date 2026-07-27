import type {
  MetricCard,
  ReportBundle,
  ReportCallTree,
  ReportFinding,
  ReportSection,
  VerdictGrade,
} from '../../shared/report-bundle.js';
import type { CallTreeNode } from '../../shared/perf-model.js';
import { parseUnitySingleNarrative, parseMarkdownOutline } from './md-narrative-parser.js';

type UnityProfileSummary = {
  source: string;
  schemaVersion: number;
  config?: { targetFps?: number };
  metrics: { key: string; value: number; unit: string }[];
  frameSummary: ReportBundle['frameSummary'] & {
    slowRate33Ms?: number;
    slowRate50Ms?: number;
  };
  markers: Array<{
    name: string;
    msSelfMean: number;
    msSelfMedian?: number;
    msSelfMax?: number;
    percentOfFrame: number;
    presentOnFrameCount?: number;
    callsPerFrame?: number;
    thread?: string;
    mustReport?: boolean;
    mustReportReason?: string;
  }>;
  callTrees: Array<{
    thread: string;
    label: string;
    root: CallTreeNode;
  }>;
  threadSummary: Array<{ name: string; msMedian: number; msMax: number }>;
  _meta?: { totalSpikeCount?: number };
};

function metricValue(metrics: UnityProfileSummary['metrics'], key: string): number | undefined {
  return metrics.find(m => m.key === key)?.value;
}

function gradeFromFrame(p50Ms: number, budgetMs: number, jankCount: number): VerdictGrade {
  if (jankCount > 5 || p50Ms > budgetMs * 1.2) return 'fail';
  if (p50Ms > budgetMs) return 'weak';
  if (p50Ms > budgetMs * 0.75) return 'pass';
  return 'excellent';
}

function severityFromMarker(marker: UnityProfileSummary['markers'][number]): ReportFinding['severity'] {
  if (marker.name === 'GC.Collect') return 'critical';
  if (marker.mustReport && marker.percentOfFrame >= 20) return 'high';
  if (marker.percentOfFrame >= 5 || marker.msSelfMean >= 1.5) return 'medium';
  return 'low';
}

function statusFromValue(value: number, budget?: number): MetricCard['status'] {
  if (budget === undefined) return undefined;
  if (value <= budget * 0.85) return 'ok';
  if (value <= budget) return 'warn';
  return 'bad';
}

function parseSourceLocation(narrative?: string): string | undefined {
  if (!narrative) return undefined;
  const match = narrative.match(/\*\*源码位置\*\*[：:]\s*`([^`]+)`/);
  if (match) return match[1];
  const match2 = narrative.match(/`([^`]+\.(cs|lua):\d+)`/);
  return match2?.[1];
}

function parseBottleneckType(narrative?: string): string | undefined {
  if (!narrative) return undefined;
  const match = narrative.match(/\*\*瓶颈类型\*\*[：:]\s*([^\n]+)/);
  return match?.[1]?.trim();
}

function extractRootCause(narrative?: string): string | undefined {
  if (!narrative) return undefined;
  const match = narrative.match(/\*\*根因\*\*[：:]\s*([^\n]+)/);
  return match?.[1]?.trim();
}

export function buildUnitySingleReportBundle(
  summary: UnityProfileSummary,
  markdown: string,
  options?: {
    title?: string;
    generatedAt?: string;
    dataSources?: { summary: string; narrative: string };
  },
): ReportBundle {
  const narrativeParsed = parseUnitySingleNarrative(markdown);
  const targetFps = summary.config?.targetFps ?? 30;
  const frameBudgetMs = 1000 / targetFps;
  const frameSummary = summary.frameSummary;
  const p50 = metricValue(summary.metrics, 'frame.p50Ms') ?? frameSummary.median;
  const p95 = metricValue(summary.metrics, 'frame.p95Ms') ?? frameSummary.q3;
  const p99 = metricValue(summary.metrics, 'frame.p99Ms');
  const fps = metricValue(summary.metrics, 'frame.fps') ?? frameSummary.actualFps;
  const gcAlloc = metricValue(summary.metrics, 'gc.allocCount');
  const slow33 = metricValue(summary.metrics, 'frame.slowRate33Ms') ?? frameSummary.slowRate33Ms;
  const slow50 = metricValue(summary.metrics, 'frame.slowRate50Ms') ?? frameSummary.slowRate50Ms;

  const kpis: MetricCard[] = [
    {
      key: 'frame.p50Ms',
      label: 'P50 帧耗时',
      value: p50,
      unit: 'ms',
      budget: frameBudgetMs,
      status: statusFromValue(p50, frameBudgetMs),
    },
    {
      key: 'frame.p95Ms',
      label: 'P95 帧耗时',
      value: p95,
      unit: 'ms',
      budget: frameBudgetMs,
      status: statusFromValue(p95, frameBudgetMs),
    },
    {
      key: 'frame.p99Ms',
      label: 'P99 帧耗时',
      value: p99 ?? p95,
      unit: 'ms',
      budget: frameBudgetMs,
      status: statusFromValue(p99 ?? p95, frameBudgetMs),
    },
    {
      key: 'frame.fps',
      label: '实测 FPS',
      value: fps,
      unit: 'fps',
      budget: targetFps,
      status: fps >= targetFps ? 'ok' : 'warn',
    },
    {
      key: 'jank.count',
      label: 'Jank',
      value: frameSummary.jankCount,
      unit: '次',
      status: frameSummary.jankCount === 0 ? 'ok' : 'bad',
    },
    {
      key: 'gc.allocCount',
      label: 'GC.Alloc / 帧',
      value: gcAlloc ?? 0,
      unit: '次',
      status: (gcAlloc ?? 0) > 80 ? 'bad' : (gcAlloc ?? 0) > 40 ? 'warn' : 'ok',
    },
    {
      key: 'frame.slowRate33Ms',
      label: '慢帧率 >33ms',
      value: slow33 ?? 0,
      unit: '%',
      status: (slow33 ?? 0) > 10 ? 'warn' : 'ok',
    },
    {
      key: 'spike.count',
      label: 'Marker 尖刺',
      value: summary._meta?.totalSpikeCount ?? 0,
      unit: '个',
    },
  ];

  const reportMarkers = summary.markers
    .filter(m => m.mustReport || m.percentOfFrame >= 5 || m.msSelfMean >= 1.5)
    .slice(0, 8);

  const findings: ReportFinding[] = reportMarkers.map((marker, index) => {
    const narrativeKey = `hotspot-${index + 1}`;
    const narrative = narrativeParsed.hotspotNarratives[narrativeKey]
      ?? narrativeParsed.hotspotNarratives[marker.name]
      ?? narrativeParsed.hotspotNarratives[marker.name.replace(/^CS:AOE\./, '')];
    const rootCause = extractRootCause(narrative);
    const frameCount = frameSummary.count;
    const present = marker.presentOnFrameCount ?? 0;

    return {
      id: `finding-${index + 1}`,
      severity: severityFromMarker(marker),
      title: marker.name,
      markerName: marker.name,
      thread: marker.thread,
      selfMsMean: marker.msSelfMean,
      selfMsMax: marker.msSelfMax,
      pctOfFrame: marker.percentOfFrame,
      presentFrames: present > 0 ? `${present}/${frameCount}` : undefined,
      sourceLocation: parseSourceLocation(narrative),
      bottleneckType: parseBottleneckType(narrative),
      narrative: rootCause ?? narrative?.split('\n').slice(0, 3).join(' ').slice(0, 280),
      evidenceKeys: [`markers[${marker.name}]`],
      mustReport: marker.mustReport,
    };
  });

  const trees: ReportCallTree[] = summary.callTrees.map(tree => ({
    id: `tree:${tree.label}`,
    label: tree.label,
    thread: tree.thread,
    frameIndex: parseFrameIndex(tree.label),
    root: tree.root,
  }));

  const sections: ReportSection[] = parseMarkdownOutline(markdown)
    .filter(item => item.level <= 2)
    .map(item => ({ id: item.id, title: item.title, level: item.level }));

  const provenance: ReportBundle['provenance'] = {};
  for (const kpi of kpis) {
    provenance[kpi.key] = { label: kpi.label, value: `${kpi.value}${kpi.unit === 'ms' ? 'ms' : kpi.unit}` };
  }

  return {
    meta: {
      reportType: 'unity-single',
      title: options?.title ?? 'Unity Profiler 单次分析',
      generatedAt: options?.generatedAt ?? new Date().toISOString(),
      sources: [{ role: 'unity_profiler', label: 'Unity Profiler', frameCount: frameSummary.count }],
      targetFps,
      frameBudgetMs,
      frameCount: frameSummary.count,
      frameDefinition: 'playerloop',
      dataSources: options?.dataSources,
    },
    verdict: {
      grade: gradeFromFrame(p50, frameBudgetMs, frameSummary.jankCount),
      headline: narrativeParsed.headline,
      summaryBullets: narrativeParsed.summaryBullets,
      caveats: narrativeParsed.caveats,
    },
    kpis,
    findings,
    sections,
    trees,
    threadLoad: summary.threadSummary,
    frameSummary: {
      ...frameSummary,
      actualFps: fps,
      slowRate33Ms: slow33,
      slowRate50Ms: slow50,
      gcAllocPerFrame: gcAlloc,
      spikeCount: summary._meta?.totalSpikeCount,
    },
    narrative: narrativeParsed.sections,
    provenance,
    markdown,
    outline: parseMarkdownOutline(markdown),
  };
}

function parseFrameIndex(label: string): number | undefined {
  const match = label.match(/#(\d+)/);
  return match ? Number(match[1]) : undefined;
}
