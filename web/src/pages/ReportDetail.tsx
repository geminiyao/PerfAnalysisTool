import React, { useEffect, useState, useRef, useCallback, createContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, Row, Col, Statistic, Spin, Button, Tag, Tabs, message } from 'antd';
import {
  ArrowLeftOutlined, ProjectOutlined, MobileOutlined,
  EnvironmentOutlined, UserOutlined, CalendarOutlined,
  ClockCircleOutlined, BranchesOutlined, BulbOutlined,
  TagOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getAnalysis, getOptimizeResults, triggerMapSource, getSourcePathConfig, requestOptimizeSuggest } from '../services/api';
import type { Session, OptimizeSuggestRequest, OptimizeSuggestEvent } from '../../shared/types';
import dayjs from 'dayjs';
import FrameDistChart from '../components/FrameDistChart';
import IssueList, { type Issue } from '../components/IssueList';
import IssueDetail from '../components/IssueDetail';

// ============================================================
// Per-issue optimize state (lifted to ReportDetail)
// ============================================================

export interface OptimizeIssueState {
  result: string;
  loading: boolean;
  mapping: boolean;
  logs: string[];
  error: string;
  sourceFiles: { path: string; line: number }[];
}

export interface OptimizeContextValue {
  getState: (issueKey: string) => OptimizeIssueState;
  startOptimize: (issueKey: string, params: OptimizeSuggestRequest) => void;
  cancelOptimize: (issueKey: string) => void;
  showSetting: boolean;
  setShowSetting: (v: boolean) => void;
}

const defaultIssueState: OptimizeIssueState = {
  result: '', loading: false, mapping: false, logs: [], error: '', sourceFiles: [],
};

export const OptimizeContext = createContext<OptimizeContextValue>({
  getState: () => defaultIssueState,
  startOptimize: () => {},
  cancelOptimize: () => {},
  showSetting: false,
  setShowSetting: () => {},
});

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

const metaItemStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11,
};

const metricPillStyle: React.CSSProperties = {
  background: 'var(--bg-card-inner)',
  border: '1px solid var(--border-primary)',
  borderRadius: 4,
  padding: '2px 8px',
  fontSize: 12,
  fontFamily: 'var(--font-mono)',
  color: 'var(--text-primary)',
};

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

  // Per-issue optimize state management
  const [optimizeStates, setOptimizeStates] = useState<Record<string, OptimizeIssueState>>({});
  const [showSetting, setShowSetting] = useState(false);
  const cancelRefs = useRef<Record<string, (() => void)>>({});

  const getState = useCallback((issueKey: string): OptimizeIssueState => {
    return optimizeStates[issueKey] || defaultIssueState;
  }, [optimizeStates]);

  const updateIssueState = useCallback((issueKey: string, patch: Partial<OptimizeIssueState>) => {
    setOptimizeStates(prev => ({
      ...prev,
      [issueKey]: { ...(prev[issueKey] || defaultIssueState), ...patch },
    }));
  }, []);

  const startOptimize = useCallback(async (issueKey: string, params: OptimizeSuggestRequest) => {
    updateIssueState(issueKey, { error: '', result: '', sourceFiles: [], logs: [], mapping: true });

    let config;
    try {
      config = await getSourcePathConfig();
    } catch (e: any) {
      updateIssueState(issueKey, { error: e.message, mapping: false });
      return;
    }

    if (!config.configured) {
      updateIssueState(issueKey, { mapping: false });
      setShowSetting(true);
      return;
    }

    try {
      await triggerMapSource(params.sessionId);
    } catch { /* proceed without map */ }

    updateIssueState(issueKey, { mapping: false, loading: true });

    const cancel = requestOptimizeSuggest(
      { ...params, issueKey },
      (event: OptimizeSuggestEvent) => {
        setOptimizeStates(prev => {
          const cur = prev[issueKey] || defaultIssueState;
          const next = { ...cur };
          if (event.type === 'source_found' && event.sourceFiles) {
            next.sourceFiles = event.sourceFiles;
          } else if (event.type === 'chunk' && event.text) {
            next.result = cur.result + event.text;
          } else if (event.type === 'log' && event.log) {
            next.logs = [...cur.logs.slice(-200), event.log];
          } else if (event.type === 'error') {
            next.error = event.error || '未知错误';
          }
          return { ...prev, [issueKey]: next };
        });
      },
      () => {
        updateIssueState(issueKey, { loading: false });
        delete cancelRefs.current[issueKey];
      },
      (err) => {
        updateIssueState(issueKey, { error: err, loading: false });
        delete cancelRefs.current[issueKey];
      },
    );

    cancelRefs.current[issueKey] = cancel;
  }, [updateIssueState]);

  const cancelOptimize = useCallback((issueKey: string) => {
    cancelRefs.current[issueKey]?.();
    delete cancelRefs.current[issueKey];
    updateIssueState(issueKey, { loading: false });
  }, [updateIssueState]);

  useEffect(() => {
    if (id) loadReport(id);
  }, [id]);

  async function loadReport(sessionId: string) {
    setLoading(true);
    try {
      const sessionData = await getAnalysis(sessionId);
      setSession(sessionData);

      const [reportRes, metricsRes, preprocessRes, logsRes, optimizeRes] = await Promise.all([
        fetch(`/api/report/${sessionId}/content`).then(r => r.ok ? r.text() : ''),
        fetch(`/api/report/${sessionId}/metrics`).then(r => r.ok ? r.json() : null),
        fetch(`/api/report/${sessionId}/preprocess`).then(r => r.ok ? r.json() : null),
        fetch(`/api/report/${sessionId}/logs`).then(r => r.ok ? r.text() : ''),
        getOptimizeResults(sessionId).catch(() => ({})),
      ]);
      setReport(reportRes);
      setMetrics(metricsRes);
      setPreprocess(preprocessRes);
      setLogs(logsRes);

      // Initialize per-issue states from DB
      const initial: Record<string, OptimizeIssueState> = {};
      for (const [key, val] of Object.entries(optimizeRes as Record<string, any>)) {
        initial[key] = {
          ...defaultIssueState,
          result: val.result || '',
          sourceFiles: val.sourceFiles || [],
        };
      }
      setOptimizeStates(initial);
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
    return <div style={{ color: 'var(--text-secondary)' }}>分析会话不存在</div>;
  }

  const fs = preprocess?.frameSummary;

  const coreSummary = extractCoreSummary(report);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', overflow: 'hidden' }}>
      {/* 顶部栏 */}
      <div style={{ flexShrink: 0, padding: '6px 0', borderBottom: '1px solid var(--border-primary)' }}>
        {/* 第一行：标题 + 结构化元信息 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <Button
            size="small"
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(-1)}
            style={{ color: 'var(--text-tertiary)' }}
          />
          <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{session.fileName}</h2>
          <Tag
            color={session.status === 'completed' ? 'success' : 'error'}
            style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}
          >
            {session.status === 'completed' ? '完成' : session.status}
          </Tag>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {session.projectName && (
              <span style={metaItemStyle}>
                <ProjectOutlined style={{ color: 'var(--text-tertiary)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>{session.projectName}</span>
              </span>
            )}
            {session.device && (
              <span style={metaItemStyle}>
                <MobileOutlined style={{ color: 'var(--text-tertiary)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>{session.device}</span>
              </span>
            )}
            {session.scene && (
              <span style={metaItemStyle}>
                <EnvironmentOutlined style={{ color: 'var(--text-tertiary)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>{session.scene}</span>
              </span>
            )}
            {session.version && (
              <span style={metaItemStyle}>
                <TagOutlined style={{ color: 'var(--text-tertiary)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>{session.version}</span>
              </span>
            )}
            {session.branch && (
              <span style={metaItemStyle}>
                <BranchesOutlined style={{ color: 'var(--text-tertiary)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>{session.branch}</span>
              </span>
            )}
            {session.createdBy && (
              <span style={metaItemStyle}>
                <UserOutlined style={{ color: 'var(--text-tertiary)' }} />
                <span style={{ color: 'var(--text-secondary)' }}>{session.createdBy}</span>
              </span>
            )}
            <span style={metaItemStyle}>
              <CalendarOutlined style={{ color: 'var(--text-tertiary)' }} />
              <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{dayjs(session.createdAt).format('MM-DD HH:mm')}</span>
            </span>
            {session.duration && (
              <span style={metaItemStyle}>
                <ClockCircleOutlined style={{ color: 'var(--text-tertiary)' }} />
                <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{Math.round(session.duration / 1000)}s</span>
              </span>
            )}
          </div>
        </div>

        {/* 第二行：指标胶囊 + 分析参数 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: coreSummary ? 4 : 0 }}>
          {metrics && (
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <span style={metricPillStyle}>
                <span style={{ color: 'var(--text-tertiary)', marginRight: 3, fontFamily: 'var(--font-body)' }}>FPS</span><b>{metrics.fps?.toFixed(1)}</b>
              </span>
              <span style={metricPillStyle}>
                <span style={{ color: 'var(--text-tertiary)', marginRight: 3, fontFamily: 'var(--font-body)' }}>帧均值</span><b>{metrics.avgFrameMs?.toFixed(1)}ms</b>
              </span>
              <span style={{
                ...metricPillStyle,
                background: metrics.jankRate > 5 ? 'var(--color-error-bg)' : 'var(--color-success-bg)',
                borderColor: metrics.jankRate > 5 ? 'rgba(218,54,51,0.2)' : 'rgba(46,160,67,0.2)',
                color: metrics.jankRate > 10 ? 'var(--color-error)' : metrics.jankRate > 5 ? 'var(--color-warning)' : 'var(--color-success)',
              }}>
                <span style={{ color: 'var(--text-tertiary)', marginRight: 3, fontFamily: 'var(--font-body)' }}>Jank率</span><b>{metrics.jankRate?.toFixed(1)}%</b>
              </span>
              <span style={metricPillStyle}>
                <span style={{ color: 'var(--text-tertiary)', marginRight: 3, fontFamily: 'var(--font-body)' }}>帧数</span><b>{metrics.totalFrames}</b>
              </span>
              {fs && (
                <>
                  <span style={{
                    ...metricPillStyle,
                    background: fs.bigJankCount > 0 ? 'var(--color-error-bg)' : 'var(--color-success-bg)',
                    borderColor: fs.bigJankCount > 0 ? 'rgba(218,54,51,0.2)' : 'rgba(46,160,67,0.2)',
                    color: fs.bigJankCount > 0 ? 'var(--color-error)' : 'var(--color-success)',
                  }}>
                    <span style={{ color: 'var(--text-tertiary)', marginRight: 3, fontFamily: 'var(--font-body)' }}>BigJank</span><b>{fs.bigJankCount}</b>
                  </span>
                  <span style={metricPillStyle}>
                    <span style={{ color: 'var(--text-tertiary)', marginRight: 3, fontFamily: 'var(--font-body)' }}>中位帧</span><b>{fs.median?.toFixed(1)}ms</b>
                  </span>
                </>
              )}
            </div>
          )}
          {preprocess?.config && (
            <>
              <div style={{ width: 1, height: 12, background: 'var(--border-secondary)', flexShrink: 0, marginLeft: 2 }} />
              <span style={{ color: 'var(--text-tertiary)', fontSize: 11, flexShrink: 0 }}>
                目标 <b style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{preprocess.config.targetFps}FPS</b>
                <span style={{ margin: '0 4px', color: 'var(--border-secondary)' }}>|</span>
                帧预算 <b style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{preprocess.config.frameBudgetMs?.toFixed(1)}ms</b>
              </span>
            </>
          )}
        </div>

        {/* 第三行：核心结论 */}
        {coreSummary && (
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: 'var(--text-secondary)', fontSize: 11, cursor: 'help',
            }}
            title={coreSummary}
          >
            <BulbOutlined style={{ color: 'var(--color-warning)', fontSize: 11, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {coreSummary.slice(0, 150)}{coreSummary.length > 150 ? '...' : ''}
            </span>
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
                <Card size="small" title={<span style={{ fontSize: 13 }}>帧耗时分布</span>} style={{ marginBottom: 12 }}>
                  <FrameDistChart
                    frameSummary={fs}
                    config={preprocess?.config}
                    frameTimings={preprocess?.frameTimings}
                    jankFrames={preprocess?.jankFrames}
                  />
                </Card>

                <Row gutter={[10, 10]}>
                  <Col xs={12} sm={6}>
                    <Card size="small">
                      <Statistic title="中位帧时间" value={fs.median?.toFixed(1)} suffix="ms" />
                    </Card>
                  </Col>
                  <Col xs={12} sm={6}>
                    <Card size="small">
                      <Statistic title="最大帧时间" value={fs.max?.toFixed(1)} suffix="ms" valueStyle={{ color: fs.max > 100 ? 'var(--color-error)' : undefined }} />
                    </Card>
                  </Col>
                  <Col xs={12} sm={6}>
                    <Card size="small">
                      <Statistic title="BigJank 次数" value={fs.bigJankCount} valueStyle={{ color: fs.bigJankCount > 0 ? 'var(--color-error)' : 'var(--color-success)' }} />
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
                    width: 320,
                    flexShrink: 0,
                    borderRight: '1px solid var(--border-primary)',
                    background: 'var(--bg-root)',
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
                    padding: 14,
                    overflowY: 'auto',
                    background: 'var(--bg-layout)',
                  }}
                >
                  <OptimizeContext.Provider value={{ getState, startOptimize, cancelOptimize, showSetting, setShowSetting }}>
                    <IssueDetail issue={selectedIssue} reportMarkdown={report} sessionId={id!} />
                  </OptimizeContext.Provider>
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
                    <div className="markdown-body" style={{ color: 'var(--text-secondary)' }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 40, fontSize: 13 }}>
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
                      background: 'var(--bg-root)',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border-primary)',
                      padding: '10px 14px',
                      maxHeight: 600,
                      overflowY: 'auto',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
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
                            ? 'var(--color-error)'
                            : line.startsWith('[完成]')
                              ? 'var(--color-success)'
                              : 'var(--text-secondary)',
                          borderBottom: '1px solid var(--border-primary)',
                          paddingBottom: 1,
                          marginBottom: 1,
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
      if (trimmed && trimmed !== '>' && trimmed !== '---') {
        result.push(trimmed.replace(/^>\s*/, ''));
      }
    }
  }

  return result.join(' ').trim();
}

export default ReportDetail;
