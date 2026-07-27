import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { BarChartOutlined } from '@ant-design/icons';
import type { ReportBundle, ReportFinding, ReportOutlineItem } from '@shared/report-bundle';
import FlameTree from './FlameTree';

interface ReportInsightRailProps {
  bundle: ReportBundle;
  activeId: string;
  activeItem?: ReportOutlineItem;
}

function findingForOutline(bundle: ReportBundle, item?: ReportOutlineItem): ReportFinding | undefined {
  if (!item) return undefined;
  const hotspotMatch = item.title.match(/热点 #(\d+)/);
  if (hotspotMatch) {
    return bundle.findings[Number(hotspotMatch[1]) - 1];
  }
  return undefined;
}

function sectionKind(
  activeId: string,
  item?: ReportOutlineItem,
): 'overview' | 'conclusion' | 'hotspots' | 'hotspot' | 'other' | 'appendix' {
  if (activeId === 'appendix') return 'appendix';
  if (!item) return 'overview';
  const title = item.title;
  if (title.includes('概览')) return 'overview';
  if (title.includes('核心结论')) return 'conclusion';
  if (title.startsWith('热点 #')) return 'hotspot';
  if (title.includes('热点分析')) return 'hotspots';
  return 'other';
}

function shortenMarker(name: string): string {
  return name
    .replace(/^CS:AOE\./, '')
    .replace(/^CS:/, '')
    .slice(0, 18);
}

const FramePercentileChart: React.FC<{ bundle: ReportBundle }> = ({ bundle }) => {
  const budget = bundle.meta.frameBudgetMs;
  const items = [
    { name: 'P50', value: bundle.frameSummary.median },
    {
      name: 'P95',
      value: bundle.kpis.find(k => k.key === 'frame.p95Ms')?.value ?? bundle.frameSummary.q3,
    },
    { name: 'P99', value: bundle.kpis.find(k => k.key === 'frame.p99Ms')?.value ?? bundle.frameSummary.max },
    { name: 'Max', value: bundle.frameSummary.max },
  ];

  const option = useMemo(() => ({
    grid: { left: 42, right: 16, top: 8, bottom: 8 },
    xAxis: { type: 'value', max: Math.max(budget * 1.6, bundle.frameSummary.max * 1.05), show: false },
    yAxis: {
      type: 'category',
      data: items.map(item => item.name).reverse(),
      axisLabel: { color: '#8b949e', fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: items.map(item => ({
        value: item.value,
        itemStyle: {
          color: item.value > budget ? '#da3633' : item.value > budget * 0.85 ? '#d29922' : '#388bfd',
          borderRadius: [0, 4, 4, 0],
        },
      })).reverse(),
      barWidth: 14,
      markLine: {
        symbol: 'none',
        label: { formatter: `${budget.toFixed(0)}ms`, color: '#2ea043', fontSize: 10 },
        lineStyle: { color: '#2ea043', type: 'dashed' },
        data: [{ xAxis: budget }],
      },
    }],
    tooltip: {
      trigger: 'axis',
      formatter: (params: Array<{ name: string; value: number }>) => `${params[0]?.name}: ${params[0]?.value.toFixed(2)}ms`,
    },
  }), [items, budget, bundle.frameSummary.max]);

  return <ReactECharts option={option} style={{ height: 170 }} notMerge opts={{ renderer: 'canvas' }} />;
};

const MarkerTopChart: React.FC<{ findings: ReportFinding[] }> = ({ findings }) => {
  const top = findings.slice(0, 6);
  const option = useMemo(() => ({
    grid: { left: 8, right: 28, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      data: top.map(item => shortenMarker(item.title)).reverse(),
      axisLabel: { color: '#8b949e', fontSize: 10, width: 90, overflow: 'truncate' },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: top.map(item => item.selfMsMean ?? 0).reverse(),
      itemStyle: { color: '#f85149', borderRadius: [0, 4, 4, 0] },
      barWidth: 12,
      label: {
        show: true,
        position: 'right',
        formatter: (p: { value: number }) => `${p.value.toFixed(1)}ms`,
        color: '#8b949e',
        fontSize: 10,
      },
    }],
  }), [top]);

  return <ReactECharts option={option} style={{ height: 200 }} notMerge opts={{ renderer: 'canvas' }} />;
};

const ThreadMiniChart: React.FC<{ bundle: ReportBundle }> = ({ bundle }) => {
  const items = useMemo(() => {
    const merged = new Map<string, { name: string; msMedian: number }>();
    for (const item of bundle.threadLoad) {
      const existing = merged.get(item.name);
      if (!existing || item.msMedian > existing.msMedian) {
        merged.set(item.name, { name: item.name, msMedian: item.msMedian });
      }
    }
    return Array.from(merged.values()).sort((a, b) => b.msMedian - a.msMedian).slice(0, 5);
  }, [bundle.threadLoad]);

  const option = useMemo(() => ({
    grid: { left: 8, right: 12, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', show: false, max: bundle.meta.frameBudgetMs * 1.2 },
    yAxis: {
      type: 'category',
      data: items.map(item => item.name.replace(' Thread', '').replace('Other Threads.', '')).reverse(),
      axisLabel: { color: '#8b949e', fontSize: 10 },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [{
      type: 'bar',
      data: items.map(item => item.msMedian).reverse(),
      itemStyle: { color: '#58a6ff', borderRadius: [0, 4, 4, 0] },
      barWidth: 10,
    }],
  }), [items, bundle.meta.frameBudgetMs]);

  return <ReactECharts option={option} style={{ height: 160 }} notMerge opts={{ renderer: 'canvas' }} />;
};

const ReportInsightRail: React.FC<ReportInsightRailProps> = ({ bundle, activeId, activeItem }) => {
  const kind = sectionKind(activeId, activeItem);
  const finding = findingForOutline(bundle, activeItem);
  const medianTree = bundle.trees.find(tree => tree.label.includes('median')) ?? bundle.trees[0];

  const contextTitle = useMemo(() => {
    if (kind === 'appendix') return '交互附录';
    if (kind === 'hotspot' && activeItem) return activeItem.title.replace(/^热点 #\d+：/, '');
    if (activeItem) return activeItem.title.replace(/^[^、]+、\s*/, '');
    return '报告概览';
  }, [kind, activeItem]);

  return (
    <aside className="report-insight-rail">
      <div className="report-insight-header">
        <BarChartOutlined />
        <span>本节图解</span>
      </div>

      <div className="report-insight-context">{contextTitle}</div>

      <div className="report-insight-body">
        {(kind === 'overview' || kind === 'other' || kind === 'appendix') && (
          <>
            <div className="report-insight-card">
              <div className="report-insight-card-title">帧耗时 vs 预算</div>
              <FramePercentileChart bundle={bundle} />
              <div className="report-insight-stats">
                <div><span>帧数</span><strong>{bundle.frameSummary.count}</strong></div>
                <div><span>目标</span><strong>{bundle.meta.targetFps} fps</strong></div>
                <div><span>慢帧率</span><strong>{bundle.frameSummary.slowRate33Ms?.toFixed(1) ?? '—'}%</strong></div>
              </div>
            </div>
            <div className="report-insight-card">
              <div className="report-insight-card-title">线程负载（中位 ms）</div>
              <ThreadMiniChart bundle={bundle} />
            </div>
          </>
        )}

        {kind === 'conclusion' && (
          <>
            <div className="report-insight-card">
              <div className="report-insight-card-title">核心判断</div>
              <ul className="report-insight-list">
                {bundle.verdict.summaryBullets.slice(0, 4).map((item, index) => (
                  <li key={index} dangerouslySetInnerHTML={{ __html: inlineMd(item) }} />
                ))}
              </ul>
            </div>
            <div className="report-insight-card">
              <div className="report-insight-card-title">帧耗时 vs 预算</div>
              <FramePercentileChart bundle={bundle} />
            </div>
          </>
        )}

        {(kind === 'hotspots' || kind === 'hotspot') && (
          <>
            {kind === 'hotspots' && (
              <div className="report-insight-card">
                <div className="report-insight-card-title">热点 self 排行</div>
                <MarkerTopChart findings={bundle.findings} />
              </div>
            )}

            {kind === 'hotspot' && finding && (
              <div className="report-insight-card">
                <div className="report-insight-card-title">当前热点</div>
                <div className="report-insight-metrics">
                  <div><span>self mean</span><strong>{finding.selfMsMean?.toFixed(2)}ms</strong></div>
                  <div><span>占帧</span><strong>{finding.pctOfFrame?.toFixed(1)}%</strong></div>
                  <div><span>max</span><strong>{finding.selfMsMax?.toFixed(2)}ms</strong></div>
                  <div><span>出现</span><strong>{finding.presentFrames ?? '—'}</strong></div>
                </div>
                {finding.sourceLocation && (
                  <div className="report-insight-source">{finding.sourceLocation}</div>
                )}
                {medianTree && (
                  <>
                    <div className="report-insight-card-subtitle">{medianTree.label}</div>
                    <FlameTree
                      root={medianTree.root}
                      defaultExpandDepth={4}
                      highlightName={finding.markerName}
                      compact
                    />
                  </>
                )}
              </div>
            )}
          </>
        )}

        {kind !== 'overview' && kind !== 'appendix' && (
          <div className="report-insight-card report-insight-card-muted">
            <div className="report-insight-card-title">线程概览</div>
            <ThreadMiniChart bundle={bundle} />
          </div>
        )}
      </div>

      <div className="report-insight-footer">
        <div className="report-insight-footer-label">数据来源（真实采集，非 mock）</div>
        {bundle.meta.dataSources?.summary && (
          <div className="report-insight-footer-path" title={bundle.meta.dataSources.summary}>
            {shortPath(bundle.meta.dataSources.summary)}
          </div>
        )}
      </div>
    </aside>
  );
};

function shortPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  return parts.slice(-3).join('/');
}

function inlineMd(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

export default ReportInsightRail;
