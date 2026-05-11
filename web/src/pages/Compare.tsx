import React, { useEffect, useState, useMemo } from 'react';
import { Card, Table, Tag, Empty, message, Select, Button, Tabs, Row, Col, Statistic, Switch, Space } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { compareAnalyses, compareDiff, getHistory } from '../services/api';
import type { CompareResult, MetricDiff, DiffResult, MarkerDiff, FrameSummaryDiff, Session } from '../../shared/types';

const Compare: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState<CompareResult | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [onlyMustReport, setOnlyMustReport] = useState(false);
  const [hideUnchanged, setHideUnchanged] = useState(true);

  useEffect(() => {
    const ids = searchParams.get('ids');
    if (ids) {
      const idList = ids.split(',');
      setSelectedIds(idList);
      doCompare(idList);
    }
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const res = await getHistory({ status: 'completed', limit: 50 });
      setSessions(res.items);
    } catch {}
  }

  async function doCompare(ids: string[]) {
    if (ids.length < 2) return;
    setLoading(true);
    setDiffLoading(true);
    try {
      // 并行发起汇总对比和 marker diff
      const [compareRes, diffRes] = await Promise.allSettled([
        compareAnalyses(ids),
        compareDiff(ids[0], ids[ids.length - 1]),
      ]);
      if (compareRes.status === 'fulfilled') setResult(compareRes.value);
      if (diffRes.status === 'fulfilled') setDiffResult(diffRes.value);
      else if (diffRes.status === 'rejected') message.warning('Marker 对比加载失败: ' + diffRes.reason?.message);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
      setDiffLoading(false);
    }
  }

  // 汇总指标表格列
  const summaryColumns = [
    { title: '指标', dataIndex: 'label', key: 'label', width: 160 },
    ...((result?.sessions || []).map((s, idx) => ({
      title: `${s.version || s.fileName} (${idx === 0 ? '基准' : '对比'})`,
      key: `val_${idx}`,
      width: 120,
      render: (_: any, record: MetricDiff) => record.values[idx]?.toFixed(2),
    }))),
    {
      title: '变化',
      key: 'delta',
      width: 120,
      render: (_: any, record: MetricDiff) => {
        const color = record.improved ? '#52c41a' : record.delta === 0 ? '#888' : '#ff4d4f';
        const prefix = record.delta > 0 ? '+' : '';
        return <span style={{ color }}>{prefix}{record.delta.toFixed(2)} ({prefix}{record.deltaPercent}%)</span>;
      },
    },
    {
      title: '趋势',
      key: 'trend',
      width: 80,
      render: (_: any, record: MetricDiff) => {
        if (record.delta === 0) return <Tag>持平</Tag>;
        return record.improved ? <Tag color="success">改善</Tag> : <Tag color="error">恶化</Tag>;
      },
    },
  ];

  // Marker 对比：过滤
  const filteredMarkers = useMemo(() => {
    if (!diffResult) return [];
    let list = diffResult.markerDiffs;
    if (onlyMustReport) list = list.filter(m => m.mustReport);
    if (hideUnchanged) list = list.filter(m => m.status !== 'unchanged');
    return list;
  }, [diffResult, onlyMustReport, hideUnchanged]);

  // Marker 对比表格列
  const markerColumns = [
    {
      title: '状态',
      key: 'status',
      width: 70,
      filters: [
        { text: '恶化', value: 'degraded' },
        { text: '改善', value: 'improved' },
        { text: '新增', value: 'new' },
        { text: '消除', value: 'removed' },
        { text: '持平', value: 'unchanged' },
      ],
      onFilter: (value: any, record: MarkerDiff) => record.status === value,
      render: (_: any, record: MarkerDiff) => {
        const map: Record<string, { color: string; text: string }> = {
          degraded: { color: 'error', text: '恶化' },
          improved: { color: 'success', text: '改善' },
          new: { color: 'blue', text: '新增' },
          removed: { color: 'default', text: '消除' },
          unchanged: { color: 'default', text: '持平' },
        };
        const { color, text } = map[record.status] || { color: 'default', text: record.status };
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: 'Marker',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string, record: MarkerDiff) => (
        <div>
          <span style={{ color: record.mustReport ? '#d4d4d4' : '#888' }}>{name}</span>
          {record.mustReport && <Tag color="red" style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px' }}>关键</Tag>}
        </div>
      ),
    },
    {
      title: '线程',
      dataIndex: 'thread',
      key: 'thread',
      width: 120,
      ellipsis: true,
      render: (t: string) => <span style={{ color: '#888', fontSize: 12 }}>{t}</span>,
    },
    {
      title: '基准 selfMean',
      key: 'baseSelf',
      width: 110,
      sorter: (a: MarkerDiff, b: MarkerDiff) => (a.baseline?.selfMean ?? 0) - (b.baseline?.selfMean ?? 0),
      render: (_: any, r: MarkerDiff) => r.baseline ? `${r.baseline.selfMean.toFixed(2)}ms` : '-',
    },
    {
      title: '当前 selfMean',
      key: 'curSelf',
      width: 110,
      sorter: (a: MarkerDiff, b: MarkerDiff) => (a.current?.selfMean ?? 0) - (b.current?.selfMean ?? 0),
      render: (_: any, r: MarkerDiff) => r.current ? `${r.current.selfMean.toFixed(2)}ms` : '-',
    },
    {
      title: '变化',
      key: 'delta',
      width: 130,
      defaultSortOrder: 'descend' as const,
      sorter: (a: MarkerDiff, b: MarkerDiff) => a.delta.selfMean - b.delta.selfMean,
      render: (_: any, r: MarkerDiff) => {
        const d = r.delta.selfMean;
        const dp = r.deltaPercent.selfMean;
        if (r.status === 'new' || r.status === 'removed') return '-';
        const color = d < -0.1 ? '#52c41a' : d > 0.1 ? '#ff4d4f' : '#888';
        const prefix = d > 0 ? '+' : '';
        return <span style={{ color }}>{prefix}{d.toFixed(2)}ms ({prefix}{dp}%)</span>;
      },
    },
    {
      title: '基准占帧',
      key: 'basePOF',
      width: 90,
      render: (_: any, r: MarkerDiff) => r.baseline ? `${r.baseline.percentOfFrame.toFixed(1)}%` : '-',
    },
    {
      title: '当前占帧',
      key: 'curPOF',
      width: 90,
      render: (_: any, r: MarkerDiff) => r.current ? `${r.current.percentOfFrame.toFixed(1)}%` : '-',
    },
  ];

  // 帧汇总 diff 表格列
  const frameSummaryColumns = [
    { title: '指标', dataIndex: 'label', key: 'label', width: 160 },
    { title: '基准', key: 'baseline', width: 100, render: (_: any, r: FrameSummaryDiff) => r.baseline.toFixed(2) },
    { title: '当前', key: 'current', width: 100, render: (_: any, r: FrameSummaryDiff) => r.current.toFixed(2) },
    {
      title: '变化',
      key: 'delta',
      width: 130,
      render: (_: any, r: FrameSummaryDiff) => {
        const color = r.improved ? '#52c41a' : r.delta === 0 ? '#888' : '#ff4d4f';
        const prefix = r.delta > 0 ? '+' : '';
        return <span style={{ color }}>{prefix}{r.delta.toFixed(2)} ({prefix}{r.deltaPercent}%)</span>;
      },
    },
    {
      title: '趋势',
      key: 'trend',
      width: 80,
      render: (_: any, r: FrameSummaryDiff) => {
        if (Math.abs(r.delta) < 0.01) return <Tag>持平</Tag>;
        return r.improved ? <Tag color="success">改善</Tag> : <Tag color="error">恶化</Tag>;
      },
    },
  ];

  const jc = diffResult?.jankComparison;

  return (
    <div>
      <h1 style={{ color: '#fff', marginBottom: 24 }}>对比分析</h1>

      {/* 选择器 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Select
            mode="multiple"
            placeholder="选择 2-4 个已完成的分析进行对比"
            value={selectedIds}
            onChange={setSelectedIds}
            style={{ flex: 1 }}
            maxCount={4}
            options={sessions.map(s => ({
              label: `${s.fileName} - ${s.version || '无版本'} (${new Date(s.createdAt).toLocaleDateString()})`,
              value: s.id,
            }))}
          />
          <Button
            type="primary"
            disabled={selectedIds.length < 2}
            onClick={() => doCompare(selectedIds)}
            loading={loading}
          >
            开始对比
          </Button>
        </div>
      </Card>

      {/* 结果区域 */}
      {(result || diffResult) ? (
        <Tabs
          defaultActiveKey="summary"
          items={[
            // 汇总指标 Tab
            result ? {
              key: 'summary',
              label: '汇总指标',
              children: (
                <Card>
                  <Table
                    rowKey="metric"
                    columns={summaryColumns}
                    dataSource={result.diffs}
                    pagination={false}
                    size="small"
                  />
                </Card>
              ),
            } : null,

            // Marker 对比 Tab
            diffResult ? {
              key: 'markers',
              label: `Marker 对比 (${filteredMarkers.length})`,
              children: (
                <Card>
                  {/* 筛选控件 */}
                  <div style={{ marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
                    <Space>
                      <span style={{ color: '#888', fontSize: 12 }}>只看关键 Marker</span>
                      <Switch size="small" checked={onlyMustReport} onChange={setOnlyMustReport} />
                    </Space>
                    <Space>
                      <span style={{ color: '#888', fontSize: 12 }}>隐藏持平</span>
                      <Switch size="small" checked={hideUnchanged} onChange={setHideUnchanged} />
                    </Space>
                    <span style={{ color: '#555', fontSize: 12 }}>
                      共 {diffResult.markerDiffs.length} 个 Marker，显示 {filteredMarkers.length} 个
                    </span>
                  </div>
                  <Table
                    rowKey={(r) => `${r.name}||${r.thread}`}
                    columns={markerColumns as any}
                    dataSource={filteredMarkers}
                    pagination={{ pageSize: 30, showSizeChanger: true, pageSizeOptions: ['20', '30', '50', '100'] }}
                    size="small"
                    scroll={{ x: 900 }}
                    rowClassName={(r) =>
                      r.status === 'degraded' ? 'row-degraded' : r.status === 'improved' ? 'row-improved' : ''
                    }
                  />
                </Card>
              ),
            } : null,

            // Jank 对比 Tab
            jc ? {
              key: 'jank',
              label: 'Jank 对比',
              children: (
                <div>
                  <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                    <Col span={8}>
                      <Card size="small" title="Jank 次数">
                        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                          <Statistic title="基准" value={jc.baseline.count} />
                          <span style={{ fontSize: 20, color: '#555' }}>→</span>
                          <Statistic
                            title="当前"
                            value={jc.current.count}
                            valueStyle={{ color: jc.current.count < jc.baseline.count ? '#52c41a' : jc.current.count > jc.baseline.count ? '#ff4d4f' : undefined }}
                          />
                          <Tag color={jc.current.count <= jc.baseline.count ? 'success' : 'error'}>
                            {jc.current.count - jc.baseline.count > 0 ? '+' : ''}{jc.current.count - jc.baseline.count}
                          </Tag>
                        </div>
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card size="small" title="BigJank 次数">
                        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                          <Statistic title="基准" value={jc.baseline.bigJankCount} />
                          <span style={{ fontSize: 20, color: '#555' }}>→</span>
                          <Statistic
                            title="当前"
                            value={jc.current.bigJankCount}
                            valueStyle={{ color: jc.current.bigJankCount < jc.baseline.bigJankCount ? '#52c41a' : jc.current.bigJankCount > jc.baseline.bigJankCount ? '#ff4d4f' : undefined }}
                          />
                          <Tag color={jc.current.bigJankCount <= jc.baseline.bigJankCount ? 'success' : 'error'}>
                            {jc.current.bigJankCount - jc.baseline.bigJankCount > 0 ? '+' : ''}{jc.current.bigJankCount - jc.baseline.bigJankCount}
                          </Tag>
                        </div>
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card size="small" title="总帧数">
                        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                          <Statistic title="基准" value={jc.baseline.totalFrames} />
                          <span style={{ fontSize: 20, color: '#555' }}>→</span>
                          <Statistic title="当前" value={jc.current.totalFrames} />
                        </div>
                      </Card>
                    </Col>
                  </Row>

                  {/* 帧汇总 diff */}
                  {diffResult?.frameSummaryDiffs && (
                    <Card size="small" title="帧汇总指标对比">
                      <Table
                        rowKey="metric"
                        columns={frameSummaryColumns}
                        dataSource={diffResult.frameSummaryDiffs}
                        pagination={false}
                        size="small"
                      />
                    </Card>
                  )}
                </div>
              ),
            } : null,
          ].filter(Boolean) as any[]}
        />
      ) : (
        <Card>
          <Empty description="选择至少两个分析结果进行对比" />
        </Card>
      )}
    </div>
  );
};

export default Compare;
