import React, { useEffect, useState, useRef, useCallback, createContext } from 'react';
import {
  Card, Row, Col, Statistic, Spin, Button, Tag, Tabs, message, Alert,
} from 'antd';
import {
  ArrowLeftOutlined, ProjectOutlined, MobileOutlined,
  EnvironmentOutlined, CalendarOutlined, BulbOutlined,
  TagOutlined, ReloadOutlined, DownloadOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import dayjs from 'dayjs';
import { downloadTextFile } from '../utils/download';
import type { Run } from '@shared/perf-model';
import { getOptimizeResults, triggerMapSource, getSourcePathConfig, requestOptimizeSuggest } from '../services/api';
import type { OptimizeSuggestRequest, OptimizeSuggestEvent } from '../../shared/types';
import FrameDistChart from './FrameDistChart';
import IssueList, { type Issue } from './IssueList';
import IssueDetail from './IssueDetail';

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

export { defaultIssueState };

export const OptimizeContext = createContext<OptimizeContextValue>({
  getState: () => defaultIssueState,
  startOptimize: () => {},
  cancelOptimize: () => {},
  showSetting: false,
  setShowSetting: () => {},
});

interface PreprocessData {
  config: { targetFps: number; frameBudgetMs: number };
  frameSummary: Record<string, number>;
  markers: Record<string, unknown>[];
  markerSpikes: Record<string, unknown>[];
  jankFrames: Record<string, unknown>[];
  frameTrees: Record<string, unknown>[];
  frameTimings?: number[];
  threads: Record<string, unknown>[];
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

export interface UnityProfilerReportViewProps {
  run: Run;
  onBack: () => void;
  onRegenerate?: () => void;
  generating?: boolean;
  defaultTab?: string;
}

const UnityProfilerReportView: React.FC<UnityProfilerReportViewProps> = ({
  run,
  onBack,
  onRegenerate,
  generating,
  defaultTab,
}) => {
  const reportId = run.id;
  const [report, setReport] = useState('');
  const [metrics, setMetrics] = useState<Record<string, number> | null>(null);
  const [preprocess, setPreprocess] = useState<PreprocessData | null>(null);
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [optimizeStates, setOptimizeStates] = useState<Record<string, OptimizeIssueState>>({});
  const [showSetting, setShowSetting] = useState(false);
  const cancelRefs = useRef<Record<string, (() => void)>>({});

  const fileName = run.profile.raw?.find(r => r.source === 'unity_profiler')?.fileName
    ?? run.label
    ?? run.id;

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
    } catch { /* proceed */ }
    updateIssueState(issueKey, { mapping: false, loading: true });
    const cancel = requestOptimizeSuggest(
      { ...params, issueKey },
      (event: OptimizeSuggestEvent) => {
        setOptimizeStates(prev => {
          const cur = prev[issueKey] || defaultIssueState;
          const next = { ...cur };
          if (event.type === 'source_found' && event.sourceFiles) next.sourceFiles = event.sourceFiles;
          else if (event.type === 'chunk' && event.text) next.result = cur.result + event.text;
          else if (event.type === 'log' && event.log) next.logs = [...cur.logs.slice(-200), event.log];
          else if (event.type === 'error') next.error = event.error || '未知错误';
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

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const [reportRes, metricsRes, preprocessRes, logsRes, optimizeRes] = await Promise.all([
        fetch(`/cpu/api/report/${reportId}/content`).then(r => r.ok ? r.text() : ''),
        fetch(`/cpu/api/report/${reportId}/metrics`).then(r => r.ok ? r.json() : null),
        fetch(`/cpu/api/report/${reportId}/preprocess`).then(r => r.ok ? r.json() : null),
        fetch(`/cpu/api/report/${reportId}/logs`).then(r => r.ok ? r.text() : ''),
        getOptimizeResults(reportId).catch(() => ({})),
      ]);
      setReport(reportRes);
      setMetrics(metricsRes);
      setPreprocess(preprocessRes);
      setLogs(logsRes);
      const initial: Record<string, OptimizeIssueState> = {};
      for (const [key, val] of Object.entries(optimizeRes as Record<string, { result?: string; sourceFiles?: { path: string; line: number }[] }>)) {
        initial[key] = { ...defaultIssueState, result: val.result || '', sourceFiles: val.sourceFiles || [] };
      }
      setOptimizeStates(initial);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { loadReport(); }, [loadReport]);

  useEffect(() => {
    if (!generating && !loading) loadReport();
  }, [generating]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  const fs = preprocess?.frameSummary;
  const coreSummary = extractCoreSummary(report);
  const { meta } = run;

  if (!preprocess && !report) {
    return (
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack}>Runs</Button>
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 16 }}
          message="Unity 数据已入库，尚未完成 skill 分析"
          description="请运行 Unity Profiler skill 以生成问题列表、堆栈图与 AI 报告。"
          action={onRegenerate && (
            <Button type="primary" loading={generating} onClick={onRegenerate}>运行 Unity skill</Button>
          )}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, padding: '6px 0', borderBottom: '1px solid var(--border-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
          <Button size="small" type="text" icon={<ArrowLeftOutlined />} onClick={onBack} style={{ color: 'var(--text-tertiary)' }} />
          <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{fileName}</h2>
          <Tag color={preprocess ? 'success' : 'default'} style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}>
            {preprocess ? '完成' : '待分析'}
          </Tag>
          {onRegenerate && (
            <Button size="small" icon={<ReloadOutlined />} loading={generating} onClick={onRegenerate}>
              重新分析
            </Button>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {meta.projectName && (
              <span style={metaItemStyle}><ProjectOutlined style={{ color: 'var(--text-tertiary)' }} /><span style={{ color: 'var(--text-secondary)' }}>{meta.projectName}</span></span>
            )}
            {meta.device && (
              <span style={metaItemStyle}><MobileOutlined style={{ color: 'var(--text-tertiary)' }} /><span style={{ color: 'var(--text-secondary)' }}>{meta.device}</span></span>
            )}
            {meta.scene && (
              <span style={metaItemStyle}><EnvironmentOutlined style={{ color: 'var(--text-tertiary)' }} /><span style={{ color: 'var(--text-secondary)' }}>{meta.scene}</span></span>
            )}
            {meta.version && (
              <span style={metaItemStyle}><TagOutlined style={{ color: 'var(--text-tertiary)' }} /><span style={{ color: 'var(--text-secondary)' }}>{meta.version}</span></span>
            )}
            <span style={metaItemStyle}>
              <CalendarOutlined style={{ color: 'var(--text-tertiary)' }} />
              <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{dayjs(run.createdAt).format('MM-DD HH:mm')}</span>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: coreSummary ? 4 : 0 }}>
          {metrics && (
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <span style={metricPillStyle}><span style={{ color: 'var(--text-tertiary)', marginRight: 3 }}>FPS</span><b>{metrics.fps?.toFixed(1)}</b></span>
              <span style={metricPillStyle}><span style={{ color: 'var(--text-tertiary)', marginRight: 3 }}>帧均值</span><b>{metrics.avgFrameMs?.toFixed(1)}ms</b></span>
              <span style={{
                ...metricPillStyle,
                background: (metrics.jankRate ?? 0) > 5 ? 'var(--color-error-bg)' : 'var(--color-success-bg)',
                borderColor: (metrics.jankRate ?? 0) > 5 ? 'rgba(218,54,51,0.2)' : 'rgba(46,160,67,0.2)',
                color: (metrics.jankRate ?? 0) > 10 ? 'var(--color-error)' : (metrics.jankRate ?? 0) > 5 ? 'var(--color-warning)' : 'var(--color-success)',
              }}>
                <span style={{ color: 'var(--text-tertiary)', marginRight: 3 }}>Jank率</span><b>{metrics.jankRate?.toFixed(1)}%</b>
              </span>
              <span style={metricPillStyle}><span style={{ color: 'var(--text-tertiary)', marginRight: 3 }}>帧数</span><b>{metrics.totalFrames}</b></span>
              {fs && (
                <>
                  <span style={{
                    ...metricPillStyle,
                    background: (fs.bigJankCount ?? 0) > 0 ? 'var(--color-error-bg)' : 'var(--color-success-bg)',
                    borderColor: (fs.bigJankCount ?? 0) > 0 ? 'rgba(218,54,51,0.2)' : 'rgba(46,160,67,0.2)',
                    color: (fs.bigJankCount ?? 0) > 0 ? 'var(--color-error)' : 'var(--color-success)',
                  }}>
                    <span style={{ color: 'var(--text-tertiary)', marginRight: 3 }}>BigJank</span><b>{fs.bigJankCount}</b>
                  </span>
                  <span style={metricPillStyle}><span style={{ color: 'var(--text-tertiary)', marginRight: 3 }}>中位帧</span><b>{fs.median?.toFixed(1)}ms</b></span>
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

        {coreSummary && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontSize: 11 }} title={coreSummary}>
            <BulbOutlined style={{ color: 'var(--color-warning)', fontSize: 11, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{coreSummary.slice(0, 150)}{coreSummary.length > 150 ? '...' : ''}</span>
          </div>
        )}
      </div>

      <Tabs
        defaultActiveKey={defaultTab ?? (preprocess ? 'issues' : 'report')}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        items={[
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
                  <Col xs={12} sm={6}><Card size="small"><Statistic title="中位帧时间" value={fs.median?.toFixed(1)} suffix="ms" /></Card></Col>
                  <Col xs={12} sm={6}><Card size="small"><Statistic title="最大帧时间" value={fs.max?.toFixed(1)} suffix="ms" valueStyle={{ color: (fs.max ?? 0) > 100 ? 'var(--color-error)' : undefined }} /></Card></Col>
                  <Col xs={12} sm={6}><Card size="small"><Statistic title="BigJank 次数" value={fs.bigJankCount} valueStyle={{ color: (fs.bigJankCount ?? 0) > 0 ? 'var(--color-error)' : 'var(--color-success)' }} /></Card></Col>
                  <Col xs={12} sm={6}><Card size="small"><Statistic title="目标帧预算" value={preprocess?.config?.frameBudgetMs?.toFixed(1)} suffix="ms" /></Card></Col>
                </Row>
              </div>
            ),
          } : null,
          preprocess ? {
            key: 'issues',
            label: `问题列表 (${(preprocess.markers as { mustReport?: boolean }[]).filter(m => m.mustReport).length + preprocess.jankFrames.length})`,
            children: (
              <div style={{ display: 'flex', gap: 0, flex: 1, overflow: 'hidden', minHeight: 480 }}>
                <div style={{ width: 320, flexShrink: 0, borderRight: '1px solid var(--border-primary)', background: 'var(--bg-root)', overflow: 'hidden' }}>
                  <IssueList
                    markers={preprocess.markers as never[]}
                    jankFrames={preprocess.jankFrames as never[]}
                    markerSpikes={preprocess.markerSpikes as never[]}
                    selectedIssue={selectedIssue}
                    onSelect={setSelectedIssue}
                  />
                </div>
                <div style={{ flex: 1, padding: 14, overflowY: 'auto', background: 'var(--bg-layout)' }}>
                  <OptimizeContext.Provider value={{ getState, startOptimize, cancelOptimize, showSetting, setShowSetting }}>
                    <IssueDetail issue={selectedIssue} reportMarkdown={report} sessionId={reportId} />
                  </OptimizeContext.Provider>
                </div>
              </div>
            ),
          } : null,
          {
            key: 'report',
            label: 'AI 报告',
            children: (
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 16px' }}>
                {report && (
                  <div style={{ marginBottom: 12 }}>
                    <Button
                      icon={<DownloadOutlined />}
                      onClick={() => downloadTextFile(`unity-report_${reportId}.md`, report)}
                    >
                      下载 Markdown
                    </Button>
                  </div>
                )}
                <Card>
                  {report ? (
                    <div className="markdown-body" style={{ color: 'var(--text-secondary)' }}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
                    </div>
                  ) : (
                    <div style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: 40, fontSize: 13 }}>暂无报告内容</div>
                  )}
                </Card>
              </div>
            ),
          },
          logs ? {
            key: 'logs',
            label: '分析日志',
            children: (
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 16px' }}>
                <Card>
                  <div style={{ background: 'var(--bg-root)', borderRadius: 'var(--radius)', border: '1px solid var(--border-primary)', padding: '10px 14px', maxHeight: 600, overflowY: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {logs.split('\n').map((line, i) => (
                      <div key={i} style={{ color: line.startsWith('[stderr]') || line.startsWith('[错误]') ? 'var(--color-error)' : line.startsWith('[完成]') ? 'var(--color-success)' : 'var(--text-secondary)', borderBottom: '1px solid var(--border-primary)', paddingBottom: 1, marginBottom: 1 }}>{line}</div>
                    ))}
                  </div>
                </Card>
              </div>
            ),
          } : null,
        ].filter(Boolean) as { key: string; label: string; children: React.ReactNode }[]}
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
    if (line.match(/^##\s.*核心结论/)) { capturing = true; continue; }
    if (capturing && line.match(/^##\s/)) break;
    if (capturing) {
      const trimmed = line.trim();
      if (trimmed && trimmed !== '>' && trimmed !== '---') result.push(trimmed.replace(/^>\s*/, ''));
    }
  }
  return result.join(' ').trim();
}

export default UnityProfilerReportView;
