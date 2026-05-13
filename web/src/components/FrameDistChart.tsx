import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';

interface FrameDistChartProps {
  frameSummary: {
    count: number;
    mean: number;
    median: number;
    min: number;
    max: number;
    q1: number;
    q3: number;
  };
  config?: { frameBudgetMs: number };
  /** 逐帧耗时数组 (可选，有则画时间线) */
  frameTimings?: number[];
  /** Jank 帧列表，用于标红 */
  jankFrames?: { frameIndex: number; msFrame: number; jankLevel: string }[];
  /** 帧索引偏移 (pdata 第一帧的全局索引) */
  frameIndexOffset?: number;
}

const FrameDistChart: React.FC<FrameDistChartProps> = ({
  frameSummary,
  config,
  frameTimings,
  jankFrames = [],
  frameIndexOffset = 0,
}) => {
  const budgetMs = config?.frameBudgetMs ?? 33.33;

  // 帧时间线 option
  const timelineOption = useMemo(() => {
    if (!frameTimings || frameTimings.length === 0) return null;

    // 正常帧数据（限制 y 轴范围，超大帧会让正常帧看不清）
    const normalData: (number | null)[] = [];
    const jankData: (number | null)[] = [];

    const jankSet = new Set(jankFrames.map(j => j.frameIndex - frameIndexOffset));

    for (let i = 0; i < frameTimings.length; i++) {
      if (jankSet.has(i)) {
        normalData.push(null);
        jankData.push(frameTimings[i]);
      } else {
        normalData.push(frameTimings[i]);
        jankData.push(null);
      }
    }

    // 计算 y 轴上限（排除极端值，用 P95 * 1.5）
    const sorted = [...frameTimings].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    const yMax = Math.max(p95 * 1.5, budgetMs * 2);

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: '#141619',
        borderColor: '#1f2328',
        textStyle: { color: '#e6eaf0', fontSize: 12 },
        formatter: (params: any) => {
          const data = Array.isArray(params) ? params.find((p: any) => p.value != null) : params;
          if (!data) return '';
          const frameIdx = data.dataIndex + frameIndexOffset;
          const ms = data.value;
          const isJank = jankSet.has(data.dataIndex);
          return `帧 #${frameIdx}<br/>耗时: <b>${ms.toFixed(1)}ms</b>${isJank ? '<br/><span style="color:#da3633">⚠ Jank</span>' : ''}`;
        },
      },
      grid: { left: 50, right: 20, top: 30, bottom: 30 },
      xAxis: {
        type: 'category' as const,
        data: frameTimings.map((_, i) => i + frameIndexOffset),
        axisLabel: { color: '#8b949e', fontSize: 10 },
        axisLine: { lineStyle: { color: '#1f2328' } },
        name: '帧序号',
        nameTextStyle: { color: '#8b949e', fontSize: 11 },
      },
      yAxis: {
        type: 'value' as const,
        max: yMax,
        axisLabel: { color: '#8b949e', fontSize: 10, formatter: '{value}ms' },
        axisLine: { lineStyle: { color: '#1f2328' } },
        splitLine: { lineStyle: { color: '#1a1d21' } },
      },
      series: [
        {
          name: '正常帧',
          type: 'bar',
          data: normalData,
          itemStyle: { color: '#1677ff', borderRadius: [1, 1, 0, 0] },
          barMaxWidth: 4,
        },
        {
          name: 'Jank 帧',
          type: 'bar',
          data: jankData,
          itemStyle: { color: '#da3633', borderRadius: [1, 1, 0, 0] },
          barMaxWidth: 4,
        },
        {
          // 帧预算参考线
          type: 'line',
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#2ea043', type: 'dashed' as const, width: 1 },
            data: [{ yAxis: budgetMs, label: { formatter: `目标 ${budgetMs.toFixed(0)}ms`, color: '#2ea043', fontSize: 10 } }],
          },
          data: [],
        },
      ],
      dataZoom: [
        {
          type: 'inside' as const,
          xAxisIndex: 0,
          start: 0,
          end: 100,
        },
        {
          type: 'slider' as const,
          xAxisIndex: 0,
          height: 16,
          bottom: 5,
          borderColor: '#1f2328',
          backgroundColor: '#0b0e11',
          fillerColor: 'rgba(22,119,255,0.12)',
          textStyle: { color: '#8b949e', fontSize: 10 },
        },
      ],
    };
  }, [frameTimings, jankFrames, frameIndexOffset, budgetMs]);

  // 箱线图 option (备选：无 frameTimings 时使用)
  const boxPlotOption = useMemo(() => {
    const { min, q1, median, q3, max, mean } = frameSummary;
    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item' as const,
        backgroundColor: '#141619',
        borderColor: '#1f2328',
        textStyle: { color: '#e6eaf0', fontSize: 12 },
      },
      grid: { left: 60, right: 40, top: 20, bottom: 30 },
      xAxis: {
        type: 'category' as const,
        data: ['帧耗时分布'],
        axisLabel: { color: '#8b949e' },
        axisLine: { lineStyle: { color: '#1f2328' } },
      },
      yAxis: {
        type: 'value' as const,
        axisLabel: { color: '#8b949e', fontSize: 10, formatter: '{value}ms' },
        axisLine: { lineStyle: { color: '#1f2328' } },
        splitLine: { lineStyle: { color: '#1a1d21' } },
      },
      series: [
        {
          name: '帧耗时',
          type: 'boxplot',
          data: [[min, q1, median, q3, max]],
          itemStyle: { color: '#1677ff', borderColor: '#1677ff' },
        },
        {
          // 均值标记
          type: 'scatter',
          data: [[0, mean]],
          symbol: 'diamond',
          symbolSize: 10,
          itemStyle: { color: '#d29922' },
          tooltip: { formatter: () => `均值: ${mean.toFixed(1)}ms` },
        },
        {
          // 帧预算参考线
          type: 'line',
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#2ea043', type: 'dashed' as const },
            data: [{ yAxis: budgetMs, label: { formatter: `目标 ${budgetMs.toFixed(0)}ms`, color: '#2ea043', fontSize: 10 } }],
          },
          data: [],
        },
      ],
    };
  }, [frameSummary, budgetMs]);

  // 有 frameTimings 则显示时间线，否则显示箱线图
  if (timelineOption) {
    return (
      <ReactECharts
        option={timelineOption}
        style={{ height: 220 }}
        notMerge
        opts={{ renderer: 'canvas' }}
      />
    );
  }

  return (
    <ReactECharts
      option={boxPlotOption}
      style={{ height: 200 }}
      notMerge
      opts={{ renderer: 'canvas' }}
    />
  );
};

export default FrameDistChart;
