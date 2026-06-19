import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, List, Tag, Button, Space, Empty } from 'antd';
import {
  UploadOutlined,
  PartitionOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { listRuns, type RunListItem } from '../services/api';
import dayjs from 'dayjs';

const SOURCE_COLORS: Record<string, string> = {
  unity_profiler: 'green',
  simpleperf: 'blue',
  perfetto: 'purple',
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listRuns(8)
      .then(res => {
        setRuns(res.items);
        setTotal(res.total);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 16, fontWeight: 600 }}>
          性能分析
        </h1>
        <Space wrap>
          <Button type="primary" icon={<UploadOutlined />} onClick={() => navigate('/upload')}>采集上传</Button>
          <Button icon={<PartitionOutlined />} onClick={() => navigate('/runs')}>Runs 列表</Button>
          <Button icon={<SwapOutlined />} onClick={() => navigate('/compare')}>对比分析</Button>
        </Space>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="Run 总数" value={total} loading={loading} />
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small">
            <Statistic title="多源 Run" value={runs.filter(r => r.sources.length > 1).length} loading={loading} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" title="工作流" style={{ fontSize: 12 }}>
            <TextBlock />
          </Card>
        </Col>
      </Row>

      <Card
        size="small"
        title="最近 Runs"
        extra={<a onClick={() => navigate('/runs')} style={{ fontSize: 12 }}>查看全部</a>}
      >
        {runs.length === 0 && !loading ? (
          <Empty description="暂无 Run — 上传采集或运行 ingest" />
        ) : (
          <List
            loading={loading}
            dataSource={runs}
            renderItem={(row) => (
              <List.Item
                actions={[
                  <a key="detail" onClick={() => navigate(`/runs/${row.id}`)}>单次分析</a>,
                  <a key="compare" onClick={() => navigate(`/compare?base=${row.id}&current=`)}>选为基准</a>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space size={6} wrap>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{row.id}</span>
                      {row.label && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{row.label}</span>}
                      {row.sources.map(s => (
                        <Tag key={s} color={SOURCE_COLORS[s] ?? 'default'} style={{ fontSize: 10 }}>{s}</Tag>
                      ))}
                    </Space>
                  }
                  description={
                    <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                      {[row.projectName, row.scene, row.device].filter(Boolean).join(' · ') || '—'}
                      {' · '}{dayjs(row.createdAt).format('MM-DD HH:mm')}
                    </span>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  );
};

function TextBlock() {
  return (
    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
      <div>① 上传 / ingest → <b>Runs</b></div>
      <div>② 点 Run → <b>单次分析 + 报告</b></div>
      <div>③ 选两 Run → <b>对比分析 + 差分火焰图</b></div>
    </div>
  );
}

export default Dashboard;
