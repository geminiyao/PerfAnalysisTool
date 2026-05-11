import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Row, Col, Statistic, Spin, Button, Tag, Descriptions, Collapse, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAnalysis } from '../services/api';
import type { Session } from '../../shared/types';
import dayjs from 'dayjs';

const ReportDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [report, setReport] = useState<string>('');
  const [metrics, setMetrics] = useState<any>(null);
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) loadReport(id);
  }, [id]);

  async function loadReport(sessionId: string) {
    setLoading(true);
    try {
      const sessionData = await getAnalysis(sessionId);
      setSession(sessionData);

      // 加载报告内容、指标和日志
      const [reportRes, metricsRes, logsRes] = await Promise.all([
        fetch(`/api/report/${sessionId}/content`).then(r => r.ok ? r.text() : ''),
        fetch(`/api/report/${sessionId}/metrics`).then(r => r.ok ? r.json() : null),
        fetch(`/api/report/${sessionId}/logs`).then(r => r.ok ? r.text() : ''),
      ]);
      setReport(reportRes);
      setMetrics(metricsRes);
      setLogs(logsRes);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  if (!session) {
    return <div>分析会话不存在</div>;
  }

  return (
    <div>
      {/* 顶部导航 */}
      <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
        <h1 style={{ color: '#fff', margin: 0, flex: 1 }}>{session.fileName}</h1>
        <Tag color={session.status === 'completed' ? 'success' : 'error'}>{session.status}</Tag>
      </div>

      {/* 元信息 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Descriptions size="small" column={4}>
          <Descriptions.Item label="项目">{session.projectName || '-'}</Descriptions.Item>
          <Descriptions.Item label="版本">{session.version || '-'}</Descriptions.Item>
          <Descriptions.Item label="设备">{session.device || '-'}</Descriptions.Item>
          <Descriptions.Item label="场景">{session.scene || '-'}</Descriptions.Item>
          <Descriptions.Item label="提交人">{session.createdBy || '-'}</Descriptions.Item>
          <Descriptions.Item label="时间">{dayjs(session.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Descriptions.Item>
          <Descriptions.Item label="耗时">{session.duration ? `${Math.round(session.duration / 1000)}s` : '-'}</Descriptions.Item>
          <Descriptions.Item label="备注">{session.notes || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 关键指标卡片 */}
      {metrics && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="平均 FPS" value={metrics.fps?.toFixed(1)} suffix="fps" />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="平均帧时间" value={metrics.avgFrameMs?.toFixed(1)} suffix="ms" />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic
                title="Jank 率"
                value={metrics.jankRate?.toFixed(1)}
                suffix="%"
                valueStyle={{ color: metrics.jankRate > 10 ? '#ff4d4f' : '#52c41a' }}
              />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small">
              <Statistic title="总帧数" value={metrics.totalFrames} />
            </Card>
          </Col>
        </Row>
      )}

      {/* AI 分析报告 */}
      <Card title="AI 分析报告" style={{ marginBottom: 16 }}>
        {report ? (
          <div className="markdown-body" style={{ color: '#d4d4d4' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
          </div>
        ) : (
          <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>
            暂无报告内容
          </div>
        )}
      </Card>

      {/* 分析日志 */}
      {logs && (
        <Collapse
          style={{ marginBottom: 16 }}
          items={[{
            key: 'logs',
            label: <span style={{ color: '#d4d4d4' }}>分析日志</span>,
            children: (
              <div
                style={{
                  background: '#0a0a1a',
                  borderRadius: 6,
                  padding: '12px 16px',
                  maxHeight: 400,
                  overflowY: 'auto',
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  fontSize: 12,
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {logs.split('\n').map((line, i) => (
                  <div
                    key={i}
                    style={{
                      color: line.startsWith('[stderr]') || line.startsWith('[错误]') || line.startsWith('[工具错误]')
                        ? '#ff7875'
                        : line.startsWith('[完成]')
                          ? '#52c41a'
                          : '#b5b5b5',
                      borderBottom: '1px solid #1a1a2e',
                      paddingBottom: 2,
                      marginBottom: 2,
                    }}
                  >
                    {line}
                  </div>
                ))}
              </div>
            ),
          }]}
        />
      )}
    </div>
  );
};

export default ReportDetail;
