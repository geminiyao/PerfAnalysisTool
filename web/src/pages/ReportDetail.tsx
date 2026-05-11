import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Row, Col, Statistic, Spin, Button, Tag, Descriptions, Tabs, Collapse, Alert, message } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAnalysis } from '../services/api';
import type { Session } from '../../shared/types';
import dayjs from 'dayjs';
import FrameDistChart from '../components/FrameDistChart';
import IssueList, { type Issue } from '../components/IssueList';
import IssueDetail from '../components/IssueDetail';

interface PreprocessData {
  config: { targetFps: number; frameBudgetMs: number };
  frameSummary: any;
  markers: any[];
  markerSpikes: any[];
  jankFrames: any[];
  frameTrees: any[];
  frameTimings?: number[];
  threads: any[];
}

const ReportDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [report, setReport] = useState<string>('');
  const [metrics, setMetrics] = useState<any>(null);
  const [preprocess, setPreprocess] = useState<PreprocessData | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);

  useEffect(() => {
    if (id) loadReport(id);
  }, [id]);

  async function loadReport(sessionId: string) {
    setLoading(true);
    try {
      const sessionData = await getAnalysis(sessionId);
      setSession(sessionData);

      // 并行加载所有数据
      const [reportRes, metricsRes, preprocessRes, logsRes] = await Promise.all([
        fetch(`/api/report/${sessionId}/content`).then(r => r.ok ? r.text() : ''),
        fetch(`/api/report/${sessionId}/metrics`).then(r => r.ok ? r.json() : null),
        fetch(`/api/report/${sessionId}/preprocess`).then(r => r.ok ? r.json() : null),
        fetch(`/api/report/${sessionId}/logs`).then(r => r.ok ? r.text() : ''),
      ]);
      setReport(reportRes);
      setMetrics(metricsRes);
      setPreprocess(preprocessRes);
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

  const fs = preprocess?.frameSummary;

  // 核心结论摘要（从报告中提取"核心结论"段落）
  const coreSummary = extractCoreSummary(report);

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

      {/* 顶部摘要区 */}
      {coreSummary && (
        <Alert
          type="info"
          showIcon={false}
          style={{ marginBottom: 16, background: '#111827', border: '1px solid #1a1a2e' }}
          message={<span style={{ color: '#d4d4d4', fontWeight: 600 }}>核心结论</span>}
          description={<span style={{ color: '#b5b5b5', fontSize: 13, lineHeight: 1.6 }}>{coreSummary}</span>}
        />
      )}

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

      {/* Tab 面板 */}
      <Tabs
        defaultActiveKey={preprocess ? 'issues' : 'report'}
        items={[
          // 概览 Tab
          fs ? {
            key: 'overview',
            label: '概览',
            children: (
              <div>
                {/* 帧时间线 / 分布图 */}
                <Card size="small" title="帧耗时分布" style={{ marginBottom: 16 }}>
                  <FrameDistChart
                    frameSummary={fs}
                    config={preprocess?.config}
                    frameTimings={preprocess?.frameTimings}
                    jankFrames={preprocess?.jankFrames}
                  />
                </Card>

                {/* 额外指标 */}
                <Row gutter={[12, 12]}>
                  <Col xs={12} sm={6}>
                    <Card size="small">
                      <Statistic title="中位帧时间" value={fs.median?.toFixed(1)} suffix="ms" />
                    </Card>
                  </Col>
                  <Col xs={12} sm={6}>
                    <Card size="small">
                      <Statistic title="最大帧时间" value={fs.max?.toFixed(1)} suffix="ms" valueStyle={{ color: fs.max > 100 ? '#ff4d4f' : undefined }} />
                    </Card>
                  </Col>
                  <Col xs={12} sm={6}>
                    <Card size="small">
                      <Statistic title="BigJank 次数" value={fs.bigJankCount} valueStyle={{ color: fs.bigJankCount > 0 ? '#ff4d4f' : '#52c41a' }} />
                    </Card>
                  </Col>
                  <Col xs={12} sm={6}>
                    <Card size="small">
                      <Statistic title="目标帧预算" value={preprocess?.config?.frameBudgetMs?.toFixed(1)} suffix="ms" />
                    </Card>
                  </Col>
                </Row>
              </div>
            ),
          } : null,

          // 问题列表 Tab
          preprocess ? {
            key: 'issues',
            label: `问题列表 (${preprocess.markers.filter(m => m.mustReport).length + preprocess.jankFrames.length})`,
            children: (
              <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 420px)', minHeight: 500 }}>
                {/* 左侧问题列表 */}
                <div
                  style={{
                    width: 360,
                    flexShrink: 0,
                    borderRight: '1px solid #1a1a2e',
                    background: '#0d1117',
                    borderRadius: '6px 0 0 6px',
                    overflow: 'hidden',
                  }}
                >
                  <IssueList
                    markers={preprocess.markers}
                    jankFrames={preprocess.jankFrames}
                    markerSpikes={preprocess.markerSpikes}
                    selectedIssue={selectedIssue}
                    onSelect={setSelectedIssue}
                  />
                </div>
                {/* 右侧详情面板 */}
                <div
                  style={{
                    flex: 1,
                    padding: 16,
                    overflowY: 'auto',
                    background: '#0a0a1a',
                    borderRadius: '0 6px 6px 0',
                  }}
                >
                  <IssueDetail issue={selectedIssue} reportMarkdown={report} />
                </div>
              </div>
            ),
          } : null,

          // AI 报告 Tab
          {
            key: 'report',
            label: 'AI 报告',
            children: (
              <Card>
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
            ),
          },

          // 日志 Tab
          logs ? {
            key: 'logs',
            label: '分析日志',
            children: (
              <Card>
                <div
                  style={{
                    background: '#0a0a1a',
                    borderRadius: 6,
                    padding: '12px 16px',
                    maxHeight: 500,
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
              </Card>
            ),
          } : null,
        ].filter(Boolean) as any[]}
      />
    </div>
  );
};

/**
 * 从报告 Markdown 中提取"核心结论"段落
 * 匹配 "## 二、核心结论" 到下一个 "##" 之间的内容
 */
function extractCoreSummary(markdown: string): string {
  if (!markdown) return '';

  const lines = markdown.split('\n');
  let capturing = false;
  const result: string[] = [];

  for (const line of lines) {
    if (line.match(/^##\s.*核心结论/)) {
      capturing = true;
      continue;
    }
    if (capturing && line.match(/^##\s/)) {
      break;
    }
    if (capturing) {
      const trimmed = line.trim();
      // 跳过引用前缀和空行
      if (trimmed && trimmed !== '>' && trimmed !== '---') {
        result.push(trimmed.replace(/^>\s*/, ''));
      }
    }
  }

  return result.join(' ').trim();
}

export default ReportDetail;
