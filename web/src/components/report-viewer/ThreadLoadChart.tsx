import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { ThreadLoadItem } from '@shared/report-bundle';

interface ThreadLoadChartProps {
  items: ThreadLoadItem[];
  frameBudgetMs: number;
}

const ThreadLoadChart: React.FC<ThreadLoadChartProps> = ({ items, frameBudgetMs }) => {
  const topItems = useMemo(() => {
    const merged = new Map<string, ThreadLoadItem>();
    for (const item of items) {
      const existing = merged.get(item.name);
      if (!existing || item.msMedian > existing.msMedian) {
        merged.set(item.name, item);
      }
    }
    return Array.from(merged.values())
      .sort((a, b) => b.msMedian - a.msMedian)
      .slice(0, 8);
  }, [items]);

  const option = useMemo(() => ({
    grid: { left: 120, right: 24, top: 16, bottom: 24 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any[]) => {
        const median = params.find(p => p.seriesName === '中位 ms')?.value;
        const max = params.find(p => p.seriesName === '最大 ms')?.value;
        return `${params[0]?.name}<br/>中位 ${median}ms<br/>最大 ${max}ms`;
      },
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: '#8b949e' },
      splitLine: { lineStyle: { color: '#1f2328' } },
    },
    yAxis: {
      type: 'category',
      data: topItems.map(item => item.name).reverse(),
      axisLabel: { color: '#8b949e', width: 110, overflow: 'truncate' },
    },
    series: [
      {
        name: '中位 ms',
        type: 'bar',
        data: topItems.map(item => item.msMedian).reverse(),
        itemStyle: { color: '#388bfd', borderRadius: [0, 3, 3, 0] },
        markLine: {
          symbol: 'none',
          label: { formatter: `预算 ${frameBudgetMs.toFixed(1)}ms`, color: '#d29922' },
          lineStyle: { color: '#d29922', type: 'dashed' },
          data: [{ xAxis: frameBudgetMs }],
        },
      },
      {
        name: '最大 ms',
        type: 'bar',
        data: topItems.map(item => item.msMax).reverse(),
        itemStyle: { color: 'rgba(248,81,73,0.55)', borderRadius: [0, 3, 3, 0] },
        barGap: '-100%',
        z: 1,
      },
    ],
  }), [topItems, frameBudgetMs]);

  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)', borderRadius: 10, padding: 12 }}>
      <ReactECharts option={option} style={{ height: 280 }} notMerge lazyUpdate />
    </div>
  );
};

export default ThreadLoadChart;
