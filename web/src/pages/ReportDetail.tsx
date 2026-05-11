import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Row, Col, Statistic, Spin, Button, Tag, Tabs, message } from 'antd';
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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', overflow: 'hidden' }}>
      {/* 顶部栏：导航 + 元信息 + 指标，紧凑一行 */}
      <div style={{ flexShrink: 0, padding: '8px 0' }}>
        {/* 第一行：文件名 + 元信息 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>返回</Button>
          <h2 style={{ color: '#fff', margin: 0, fontSize: 16 }}>{session.fileName}</h2>
          <Tag color={session.status === 'completed' ? 'success' : 'error'} style={{ margin: 0 }}>{session.status}</Tag>
          <div style={{ flex: 1 }} />
          <span style={{ color: '#666', fontSize: 12 }}>
            {session.projectName || '-'} · {session.version || '-'} · {session.device || '-'} · {session.scene || '-'} · {session.createdBy || '-'} · {dayjs(session.createdAt).format('MM-DD HH:mm')} · {session.duration ? `${Math.round(session.duration / 1000)}s` : '-'}
          </span>
        </div>

        {/* 第二行：指标 inline + 分析参数 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
          {metrics && (
            <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
              <span style={{ color: '#d4d4d4', fontSize: 13 }}>
                <span style={{ color: '#888' }}>FPS</span> <b>{metrics.fps?.toFixed(1)}</b>
              </span>
              <span style={{ color: '#d4d4d4', fontSize: 13 }}>
                <span style={{ color: '#888' }}>帧时间</span> <b>{metrics.avgFrameMs?.toFixed(1)}ms</b>
              </span>
              <span style={{ color: metrics.jankRate > 10 ? '#ff4d4f' : '#52c41a', fontSize: 13 }}>
                <span style={{ color: '#888' }}>Jank率</span> <b>{metrics.jankRate?.toFixed(1)}%</b>
              </span>
              <span style={{ color: '#d4d4d4', fontSize: 13 }}>
                <span style={{ color: '#888' }}>帧数</span> <b>{metrics.totalFrames}</b>
              </span>
              {fs && (
                <>
                  <span style={{ color: fs.bigJankCount > 0 ? '#ff4d4f' : '#52c41a', fontSize: 13 }}>
                    <span style={{ color: '#888' }}>BigJank</span> <b>{fs.bigJankCount}</b>
                  </span>
                  <span style={{ color: '#d4d4d4', fontSize: 13 }}>
                    <span style={{ color: '#888' }}>中位帧</span> <b>{fs.median?.toFixed(1)}ms</b>
                  </span>
                </>
              )}
            </div>
          )}
          {/* 分析参数标签 */}
          {preprocess?.config && (
            <>
              <div style={{ width: 1, height: 14, background: '#333', flexShrink: 0 }} />
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <span style={{ color: '#666', fontSize: 11 }}>
                  目标 <b style={{ color: '#888' }}>{preprocess.config.targetFps}FPS</b>
                </span>
                <span style={{ color: '#666', fontSize: 11 }}>
                  帧预算 <b style={{ color: '#888' }}>{preprocess.config.frameBudgetMs?.toFixed(1)}ms</b>
                </span>
              </div>
            </>
          )}
        </div>

        {/* 第三行：核心结论 */}
        {coreSummary && (
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#999', fontSize: 12, cursor: 'help' }} title={coreSummary}>
            💡 {coreSummary.slice(0, 150)}{coreSummary.length > 150 ? '...' : ''}
          </div>
        )}
      </div>

      {/* Tab 面板：占满剩余空间 */}
      <Tabs
        defaultActiveKey={preprocess ? 'issues' : 'report'}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        items={[
          // 概览 Tab
          fs ? {
            key: 'overview',
            label: '概览',
            children: (
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 16px' }}>
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
              <div style={{ display: 'flex', gap: 0, flex: 1, overflow: 'hidden' }}>
                {/* 左侧问题列表 */}
                <div
                  style={{
                    width: 340,
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
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 16px' }}>
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
              </div>
            ),
          },

          // 日志 Tab
          logs ? {
            key: 'logs',
            label: '分析日志',
            children: (
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 16px' }}>
                <Card>
                  <div
                    style={{
                      background: '#0a0a1a',
                      borderRadius: 6,
                      padding: '12px 16px',
                      maxHeight: 600,
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
              </div>
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
