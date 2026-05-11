import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, Table, Tag, Empty, message, Select, Button } from 'antd';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { compareAnalyses, getHistory } from '../services/api';
import type { CompareResult, MetricDiff, Session } from '../../shared/types';

const Compare: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    // 从 URL 参数中获取 IDs
    const ids = searchParams.get('ids');
    if (ids) {
      const idList = ids.split(',');
      setSelectedIds(idList);
      loadCompare(idList);
    }
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const res = await getHistory({ status: 'completed', limit: 50 });
      setSessions(res.items);
    } catch {}
  }

  async function loadCompare(ids: string[]) {
    if (ids.length < 2) return;
    setLoading(true);
    try {
      const res = await compareAnalyses(ids);
      setResult(res);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  const columns = [
    {
      title: '指标',
      dataIndex: 'label',
      key: 'label',
      width: 160,
    },
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
        return (
          <span style={{ color }}>
            {prefix}{record.delta.toFixed(2)} ({prefix}{record.deltaPercent}%)
          </span>
        );
      },
    },
    {
      title: '趋势',
      key: 'trend',
      width: 80,
      render: (_: any, record: MetricDiff) => {
        if (record.delta === 0) return <Tag>持平</Tag>;
        return record.improved
          ? <Tag color="success">改善</Tag>
          : <Tag color="error">恶化</Tag>;
      },
    },
  ];

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
            onClick={() => loadCompare(selectedIds)}
            loading={loading}
          >
            开始对比
          </Button>
        </div>
      </Card>

      {/* 对比结果 */}
      {result ? (
        <Card>
          <Table
            rowKey="metric"
            columns={columns}
            dataSource={result.diffs}
            pagination={false}
            size="small"
          />
        </Card>
      ) : (
        <Card>
          <Empty description="选择至少两个分析结果进行对比" />
        </Card>
      )}
    </div>
  );
};

export default Compare;
