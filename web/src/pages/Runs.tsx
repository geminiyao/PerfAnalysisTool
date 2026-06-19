import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Card, Table, Tag, Button, Typography, message } from 'antd';
import { EyeOutlined, SwapOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { listRuns, type RunListItem } from '../services/api';

const { Text } = Typography;

const SOURCE_COLORS: Record<string, string> = {
  unity_profiler: 'green',
  simpleperf: 'blue',
  perfetto: 'purple',
};

const Runs: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<RunListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => {
    listRuns()
      .then(res => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function onCompareSelectChange(keys: React.Key[]) {
    const ids = keys as string[];
    if (ids.length <= 2) {
      setCompareIds(ids);
      return;
    }
    setCompareIds(ids.slice(-2));
    message.info('最多选择 2 个 Run 进行对比，已保留最新勾选的两项');
  }

  function goCompare() {
    if (compareIds.length !== 2) {
      message.warning('请勾选 2 个 Run');
      return;
    }
    navigate(`/compare?base=${compareIds[0]}&current=${compareIds[1]}`);
  }

  const columns = [
    {
      title: 'Run ID',
      dataIndex: 'id',
      key: 'id',
      render: (id: string, row: RunListItem) => (
        <div>
          <Text strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{id}</Text>
          {row.label && <div><Text type="secondary" style={{ fontSize: 11 }}>{row.label}</Text></div>}
        </div>
      ),
    },
    {
      title: '源',
      dataIndex: 'sources',
      key: 'sources',
      render: (sources: string[]) => sources.map(s => (
        <Tag key={s} color={SOURCE_COLORS[s] ?? 'default'} style={{ fontSize: 11 }}>{s}</Tag>
      )),
    },
    {
      title: '项目 / 场景',
      key: 'meta',
      render: (_: unknown, row: RunListItem) => (
        <span style={{ fontSize: 12 }}>
          {row.projectName || '—'} / {row.scene || '—'}
        </span>
      ),
    },
    {
      title: '设备',
      dataIndex: 'device',
      key: 'device',
      render: (v: string) => <span style={{ fontSize: 12 }}>{v || '—'}</span>,
    },
    {
      title: '帧数',
      dataIndex: 'frameCount',
      key: 'frameCount',
      width: 80,
      render: (v?: number) => v ?? '—',
    },
    {
      title: '指标',
      dataIndex: 'metricCount',
      key: 'metricCount',
      width: 70,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (s: string) => <Tag color={s === 'ready' ? 'success' : 'default'}>{s}</Tag>,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (t: number) => <span style={{ fontSize: 11 }}>{dayjs(t).format('MM-DD HH:mm')}</span>,
    },
    {
      title: '',
      key: 'action',
      width: 80,
      render: (_: unknown, row: RunListItem) => (
        <Button
          type="link"
          size="small"
          icon={<EyeOutlined />}
          onClick={(e) => { e.stopPropagation(); navigate(`/runs/${row.id}`); }}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ color: 'var(--text-primary)', margin: 0, fontSize: 16, fontWeight: 600 }}>
          Runs
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 400, marginLeft: 8 }}>({total})</Text>
        </h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            type="primary"
            icon={<SwapOutlined />}
            disabled={compareIds.length !== 2}
            onClick={goCompare}
          >
            去对比 ({compareIds.length}/2)
          </Button>
          <Button icon={<SwapOutlined />} onClick={() => navigate('/compare')}>对比页</Button>
        </div>
      </div>
      <Alert
        showIcon
        type="info"
        style={{ marginBottom: 16 }}
        message="单次分析入口"
        description="点击 Run 进入详情。勾选 2 个 Run 后点「去对比」跳转 /compare（带 base/current 参数）。"
      />
      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Card size="small">
        <Table
          rowKey="id"
          size="small"
          loading={loading}
          columns={columns}
          dataSource={items}
          rowSelection={{
            selectedRowKeys: compareIds,
            onChange: onCompareSelectChange,
            preserveSelectedRowKeys: true,
          }}
          pagination={{ pageSize: 20, total, showTotal: t => `共 ${t} 条` }}
          onRow={row => ({
            onClick: () => navigate(`/runs/${row.id}`),
            style: { cursor: 'pointer' },
          })}
        />
      </Card>
    </div>
  );
};

export default Runs;
