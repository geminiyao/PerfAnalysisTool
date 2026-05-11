import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Statistic, List, Tag, Button, Space, Empty } from 'antd';
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  UploadOutlined,
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [historyRes, statsRes, queueRes] = await Promise.all([
        getHistory({ limit: 5 }),
        getHistoryStats(),
        getQueueStatus(),
      ]);
      setRecentSessions(historyRes.items);
      setStats(statsRes);
      setQueue(queueRes);
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
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, color: '#fff' }}>Performance Dashboard</h1>
        <Button type="primary" icon={<UploadOutlined />} size="large" onClick={() => navigate('/upload')}>
          上传分析
        </Button>
      </div>

      {/* 统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="总分析次数" value={stats?.total || 0} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="成功" value={stats?.completed || 0} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card>
            <Statistic title="失败" value={stats?.failed || 0} valueStyle={{ color: '#ff4d4f' }} />
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
        <Card title="分析队列" style={{ marginBottom: 24 }} size="small">
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

      {/* 最近分析 */}
      <Card title="最近分析" extra={<a onClick={() => navigate('/history')}>查看全部</a>}>
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
                  actions={[
                    session.status === 'completed' && (
                      <a key="view" onClick={() => navigate(`/report/${session.id}`)}>查看报告</a>
                    ),
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <span>{session.fileName}</span>
                        <Tag color={tag.color} icon={tag.icon}>{session.status}</Tag>
                      </Space>
                    }
                    description={
                      <Space split="|" size={4}>
                        {session.projectName && <span>{session.projectName}</span>}
                        {session.version && <span>{session.version}</span>}
                        <span>{dayjs(session.createdAt).format('MM-DD HH:mm')}</span>
                        {session.createdBy && <span>{session.createdBy}</span>}
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
