import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, List, Tag, Button, Space, Empty } from 'antd';
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  UploadOutlined,
  DatabaseOutlined,
  FireOutlined,
  FileSearchOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getHistory, getHistoryStats, getQueueStatus } from '../services/api';
import type { Session } from '../../shared/types';
import dayjs from 'dayjs';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [queue, setQueue] = useState<any>(null);
  const [simpleperfSessions, setSimpleperfSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [historyRes, statsRes, queueRes, simpleperfRes] = await Promise.all([
        getHistory({ limit: 5 }),
        getHistoryStats(),
        getQueueStatus(),
        fetch('/cpu/api/simpleperf/sessions?limit=5').then(res => res.json()).catch(() => ({ items: [] })),
      ]);
      setRecentSessions(historyRes.items);
      setStats(statsRes);
      setQueue(queueRes);
      setSimpleperfSessions(simpleperfRes.items || []);
    } catch (err) {
      console.error('加载数据失败:', err);
    } finally {
      setLoading(false);
    }
  }

  const statusTagMap: Record<string, { color: string; icon: React.ReactNode }> = {
    completed: { color: 'success', icon: <CheckCircleOutlined /> },
    running: { color: 'processing', icon: <PlayCircleOutlined /> },
    queued: { color: 'warning', icon: <ClockCircleOutlined /> },
    pending: { color: 'default', icon: <ClockCircleOutlined /> },
    failed: { color: 'error', icon: <CloseCircleOutlined /> },
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{
          margin: 0,
          color: 'var(--text-primary)',
          fontSize: 16,
          fontWeight: 600,
        }}>
          Performance Dashboard
        </h1>
        <Button type="primary" icon={<UploadOutlined />} onClick={() => navigate('/upload')}>
          上传分析
        </Button>
      </div>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={8}>
          <Card size="small" title="数据源状态">
            <Space wrap>
              <Tag color="blue" icon={<FileSearchOutlined />}>Profiler 已接入</Tag>
              <Tag color="purple" icon={<FireOutlined />}>simpleperf P3</Tag>
              <Tag icon={<DatabaseOutlined />}>Perfetto 预留</Tag>
            </Space>
          </Card>
        </Col>
        <Col xs={24} md={16}>
          <Card size="small" title="快速入口">
            <Space wrap>
              <Button icon={<UploadOutlined />} onClick={() => navigate('/upload')}>上传 .pdata</Button>
              <Button icon={<FireOutlined />} onClick={() => navigate('/upload')}>上传 perf.data</Button>
              <Button onClick={() => navigate('/runs')}>创建/查看 Run</Button>
              <Button onClick={() => navigate('/ai')}>AI 综合分析</Button>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 统计卡片 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="总分析次数" value={stats?.total || 0} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="成功" value={stats?.completed || 0} valueStyle={{ color: 'var(--color-success)' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="失败" value={stats?.failed || 0} valueStyle={{ color: 'var(--color-error)' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic
              title="平均耗时"
              value={stats?.avgDuration ? Math.round(stats.avgDuration / 1000) : 0}
              suffix="秒"
            />
          </Card>
        </Col>
      </Row>

      {/* 队列状态 */}
      {queue && (queue.running || queue.queued.length > 0) && (
        <Card title="分析队列" style={{ marginBottom: 16 }} size="small">
          {queue.running && (
            <Tag color="processing" icon={<PlayCircleOutlined />}>
              正在分析: {queue.running.slice(0, 8)}...
            </Tag>
          )}
          {queue.queued.length > 0 && (
            <Tag color="warning">等待中: {queue.queued.length} 个</Tag>
          )}
        </Card>
      )}

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card size="small" title="最近 simpleperf">
            {simpleperfSessions.length === 0 ? <Empty description="暂无 simpleperf 记录" /> : (
              <List
                size="small"
                dataSource={simpleperfSessions}
                renderItem={(item) => (
                  <List.Item actions={[item.status === 'completed' ? <a key="view" onClick={() => navigate(`/simpleperf/report/${item.id}`)}>查看</a> : null].filter(Boolean)}>
                    <List.Item.Meta
                      title={<Space><span>{item.fileName}</span><Tag color={statusTagMap[item.status]?.color || 'default'}>{item.status}</Tag></Space>}
                      description={<span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{item.projectName || '未填项目'} · {dayjs(item.createdAt).format('MM-DD HH:mm')}</span>}
                    />
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title="高风险问题">
            <Space direction="vertical" size={8}>
              <Tag color="red">BigJank / 长帧 Spike</Tag>
              <Tag color="orange">Native CPU 热点上升</Tag>
              <Tag color="purple">符号解析缺失需确认</Tag>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 最近分析 */}
      <Card
        title={<span style={{ fontSize: 13, fontWeight: 500 }}>最近分析</span>}
        extra={
          <a
            onClick={() => navigate('/history')}
            style={{ fontSize: 12, color: 'var(--text-link)' }}
          >
            查看全部
          </a>
        }
      >
        {recentSessions.length === 0 && !loading ? (
          <Empty description="暂无分析记录" />
        ) : (
          <List
            loading={loading}
            dataSource={recentSessions}
            renderItem={(session) => {
              const tag = statusTagMap[session.status] || statusTagMap.pending;
              return (
                <List.Item
                  style={{ borderBottom: '1px solid var(--border-primary)', padding: '10px 0' }}
                  actions={[
                    session.status === 'completed' && (
                      <a
                        key="view"
                        onClick={() => navigate(`/report/${session.id}`)}
                        style={{ fontSize: 12, color: 'var(--text-link)' }}
                      >
                        查看报告
                      </a>
                    ),
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    title={
                      <Space size={8}>
                        <span style={{ color: 'var(--text-primary)', fontSize: 13 }}>{session.fileName}</span>
                        <Tag color={tag.color} icon={tag.icon} style={{ fontSize: 11, lineHeight: '18px' }}>
                          {session.status}
                        </Tag>
                      </Space>
                    }
                    description={
                      <Space split={<span style={{ color: 'var(--text-tertiary)' }}>·</span>} size={6}>
                        {session.projectName && <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{session.projectName}</span>}
                        {session.version && <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{session.version}</span>}
                        <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{dayjs(session.createdAt).format('MM-DD HH:mm')}</span>
                        {session.createdBy && <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{session.createdBy}</span>}
                      </Space>
                    }
                  />
                </List.Item>
              );
            }}
          />
        )}
      </Card>
    </div>
  );
};

export default Dashboard;
