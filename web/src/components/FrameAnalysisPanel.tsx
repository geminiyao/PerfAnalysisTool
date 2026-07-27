import React from 'react';
import { Col, Row, Statistic, Table, Tag, Typography } from 'antd';
import type { FrameAnalysis, FlaggedFrame, MarkerFrameSeries } from '@shared/perf-model';

const { Text } = Typography;

interface FrameAnalysisPanelProps {
  frameAnalysis: FrameAnalysis;
}

const FrameAnalysisPanel: React.FC<FrameAnalysisPanelProps> = ({ frameAnalysis: fa }) => {
  const ws = fa.watchSpec;
  const flags = (fa.flags ?? []).slice(0, 30);
  const series = fa.series ?? [];

  const flagColumns = [
    {
      title: '帧',
      dataIndex: 'frameIndex',
      key: 'frameIndex',
      width: 56,
    },
    {
      title: '目标',
      dataIndex: 'targetId',
      key: 'targetId',
      width: 120,
      render: (v: string) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{v}</span>,
    },
    {
      title: '规则',
      dataIndex: 'ruleId',
      key: 'ruleId',
      width: 110,
      render: (v: string) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{v}</span>,
    },
    {
      title: '级别',
      dataIndex: 'severity',
      key: 'severity',
      width: 72,
      render: (v: string) => (
        <Tag color={v === 'critical' ? 'red' : 'orange'}>{v}</Tag>
      ),
    },
    {
      title: '实际',
      key: 'actual',
      width: 90,
      render: (_: unknown, r: FlaggedFrame) => `${r.actualMs?.toFixed?.(2) ?? r.actualMs} ms`,
    },
    {
      title: 'context',
      key: 'context',
      render: (_: unknown, r: FlaggedFrame) => {
        const ctx = r.context ?? {};
        const parts = Object.entries(ctx).map(([k, v]) => `${k}=${v}`);
        return parts.length
          ? <span style={{ fontSize: 11 }}>{parts.join(', ')}</span>
          : '—';
      },
    },
    {
      title: '说明',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
    },
  ];

  const seriesColumns = [
    {
      title: '目标',
      dataIndex: 'targetId',
      key: 'targetId',
      render: (v: string) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{v}</span>,
    },
    {
      title: '出现帧',
      dataIndex: 'presentCount',
      key: 'presentCount',
      width: 72,
    },
    {
      title: '中位',
      key: 'median',
      width: 72,
      render: (_: unknown, r: MarkerFrameSeries) => `${r.summary?.medianMs?.toFixed?.(2) ?? '—'} ms`,
    },
    {
      title: 'P95',
      key: 'p95',
      width: 72,
      render: (_: unknown, r: MarkerFrameSeries) => `${r.summary?.p95Ms?.toFixed?.(2) ?? '—'} ms`,
    },
    {
      title: '最大',
      key: 'max',
      width: 72,
      render: (_: unknown, r: MarkerFrameSeries) => `${r.summary?.maxMs?.toFixed?.(2) ?? '—'} ms`,
    },
  ];

  const ctxSummary = fa.contextSummary?.byClassifier ?? {};

  return (
    <div style={{ marginBottom: 16 }}>
      <Text strong style={{ fontSize: 13 }}>帧分析 (PlayerLoop · L1–L3)</Text>
      <div style={{ marginTop: 4, marginBottom: 10 }}>
        {ws?.preset && <Tag>preset: {ws.preset}</Tag>}
        {ws?.deviceTier && <Tag>deviceTier: {ws.deviceTier}</Tag>}
        {ws?.frameBudgetMs != null && <Tag>budget: {ws.frameBudgetMs} ms</Tag>}
        {fa.frameDefinition && <Tag>{fa.frameDefinition}</Tag>}
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
        <Col xs={8} sm={6} md={4}>
          <Statistic title="帧数" value={fa.summary.count} />
        </Col>
        <Col xs={8} sm={6} md={4}>
          <Statistic title="P50" value={fa.summary.p50Ms} suffix="ms" valueStyle={{ fontSize: 18 }} />
        </Col>
        <Col xs={8} sm={6} md={4}>
          <Statistic title="P95" value={fa.summary.p95Ms} suffix="ms" valueStyle={{ fontSize: 18 }} />
        </Col>
        <Col xs={8} sm={6} md={4}>
          <Statistic title="FPS" value={fa.summary.fps} valueStyle={{ fontSize: 18 }} />
        </Col>
        <Col xs={8} sm={6} md={4}>
          <Statistic title="&gt;33ms" value={fa.summary.slowFrameRate33} suffix="%" valueStyle={{ fontSize: 18 }} />
        </Col>
        <Col xs={8} sm={6} md={4}>
          <Statistic title="规则命中" value={fa.flags?.length ?? 0} valueStyle={{ fontSize: 18 }} />
        </Col>
      </Row>

      {Object.keys(ctxSummary).length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Context 分布</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {Object.entries(ctxSummary).map(([k, v]) => (
              <Tag key={k} style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                {k}: {v} 帧
              </Tag>
            ))}
          </div>
        </div>
      )}

      {series.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Watch 目标序列 (L3)</Text>
          <Table
            size="small"
            pagination={false}
            style={{ marginTop: 6 }}
            rowKey="targetId"
            dataSource={series}
            columns={seriesColumns}
          />
        </div>
      )}

      {flags.length > 0 ? (
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            规则命中 (前 {flags.length}{(fa.flags?.length ?? 0) > flags.length ? ` / ${fa.flags!.length}` : ''})
          </Text>
          <Table
            size="small"
            pagination={false}
            style={{ marginTop: 6 }}
            rowKey={(r, i) => `${r.frameIndex}-${r.targetId}-${r.ruleId}-${i}`}
            dataSource={flags}
            columns={flagColumns}
            scroll={{ x: 720 }}
          />
        </div>
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>无 watch 规则命中</Text>
      )}
    </div>
  );
};

export default FrameAnalysisPanel;
