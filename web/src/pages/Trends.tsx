import React, { useEffect, useState } from 'react';
import { Card, Select, Space, Empty, Spin } from 'antd';
import ReactECharts from 'echarts-for-react';
import { getTrends, getTrendMetrics, getProjects } from '../services/api';
import type { TrendPoint } from '../../shared/types';
import dayjs from 'dayjs';

const Trends: React.FC = () => {
  const [projects, setProjects] = useState<string[]>([]);
  const [metricsOptions, setMetricsOptions] = useState<{ key: string; label: string; unit: string; lowerIsBetter: boolean }[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedMetric, setSelectedMetric] = useState<string>('fps');
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadInitial();
  }, []);

  useEffect(() => {
    if (selectedProject && selectedMetric) {
      loadTrends();
    }
  }, [selectedProject, selectedMetric]);

  async function loadInitial() {
    const [projectList, metricList] = await Promise.all([
      getProjects(),
      getTrendMetrics(),
    ]);
    setProjects(projectList);
    setMetricsOptions(metricList);
    if (projectList.length > 0) {
      setSelectedProject(projectList[0]);
    }
  }

  async function loadTrends() {
    setLoading(true);
    try {
      const res = await getTrends(selectedProject, selectedMetric);
      setPoints(res.points);
    } catch {
      setPoints([]);
    } finally {
      setLoading(false);
    }
  }

  const currentMetric = metricsOptions.find(m => m.key === selectedMetric);

  const chartOption = {
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'var(--bg-card)',
      borderColor: 'var(--border-primary)',
      textStyle: { color: 'var(--text-primary)' },
      formatter: (params: any) => {
        const p = params[0];
        const point = points[p.dataIndex];
        return `
          <strong>${point.version || dayjs(point.date).format('MM-DD HH:mm')}</strong><br/>
          ${currentMetric?.label}: ${p.value?.toFixed(2)} ${currentMetric?.unit || ''}
        `;
      },
    },
    xAxis: {
      type: 'category',
      data: points.map(p => p.version || dayjs(p.date).format('MM-DD')),
      axisLabel: { rotate: 30, color: '#8b949e' },
    },
    yAxis: {
      type: 'value',
      name: currentMetric?.label || '',
      nameTextStyle: { color: '#8b949e' },
      axisLabel: { color: '#8b949e' },
      splitLine: { lineStyle: { color: '#1f2328' } },
    },
    series: [
      {
        type: 'line',
        data: points.map(p => p.value),
        smooth: true,
        symbolSize: 8,
        itemStyle: { color: '#1677ff' },
        lineStyle: { width: 2, color: '#1677ff' },
        areaStyle: { opacity: 0.08, color: '#1677ff' },
        markLine: currentMetric?.lowerIsBetter ? {
          silent: true,
          data: [{ type: 'average', name: '平均值' }],
          lineStyle: { color: '#d29922', type: 'dashed' },
        } : undefined,
      },
    ],
    grid: { left: 60, right: 30, bottom: 60, top: 40 },
    backgroundColor: 'transparent',
  };

  return (
    <div>
      <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 24 }}>性能趋势</h1>

      {/* 控制栏 */}
      <Card
        size="small"
        style={{
          marginBottom: 16,
          background: 'var(--bg-card)',
          borderColor: 'var(--border-primary)',
        }}
      >
        <Space size={16}>
          <Select
            placeholder="选择项目"
            value={selectedProject || undefined}
            onChange={setSelectedProject}
            style={{ width: 200 }}
            options={projects.map(p => ({ label: p, value: p }))}
          />
          <Select
            placeholder="选择指标"
            value={selectedMetric}
            onChange={setSelectedMetric}
            style={{ width: 200 }}
            options={metricsOptions.map(m => ({ label: m.label, value: m.key }))}
          />
        </Space>
      </Card>

      {/* 趋势图 */}
      <Card
        style={{
          background: 'var(--bg-card)',
          borderColor: 'var(--border-primary)',
        }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80 }}><Spin /></div>
        ) : points.length === 0 ? (
          <Empty description="暂无趋势数据，请先完成一些分析" />
        ) : (
          <ReactECharts
            option={chartOption}
            style={{ height: 400 }}
            theme="dark"
          />
        )}
      </Card>
    </div>
  );
};

export default Trends;
