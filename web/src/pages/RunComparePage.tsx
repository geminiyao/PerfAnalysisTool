import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Alert, Button, Card, Col, Row, Select, Spin, Table, Tag, Typography, Collapse, Space, Tabs,
} from 'antd';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SwapOutlined, DownloadOutlined } from '@ant-design/icons';
import type { RunCompareResult, MetricDelta, CallTreeNodeDelta } from '@shared/run-compare-types';
import type { RunListItem } from '../services/api';
import { listRuns, compareRuns, compareFlamegraphUrl } from '../services/api';
import { downloadTextFile } from '../utils/download';

const { Text, Title } = Typography;

const SOURCE_LABELS: Record<string, string> = {
  unity_profiler: 'Unity Profiler',
  simpleperf: 'simpleperf',
  perfetto: 'Perfetto',
};

const VERDICT_COLOR: Record<string, string> = {
  effective: 'success',
  ineffective: 'default',
  regression: 'error',
  inconclusive: 'warning',
};

const VERDICT_TEXT: Record<string, string> = {
  effective: '优化有效',
  ineffective: '效果不明显',
  regression: '有回归',
  inconclusive: '无法结论',
};

const COMP_LEVEL: Record<string, { color: string; text: string }> = {
  ok: { color: 'success', text: '可比' },
  acceptable: { color: 'warning', text: '偏差可接受' },
  not_comparable: { color: 'error', text: '不可比' },
};

const maskTag = (mask: string) => {
  if (mask === 'A') return <Tag color="blue">新增</Tag>;
  if (mask === 'D') return <Tag>删除</Tag>;
  return <Tag color="processing">变化</Tag>;
};

const deltaStyle = (improved: boolean, delta: number) => ({
  color: delta === 0 ? 'var(--text-tertiary)' : improved ? 'var(--color-success)' : 'var(--color-error)',
  fontFamily: 'var(--font-mono)' as const,
  fontSize: 12,
});

function MetricDeltaTable({ data }: { data: MetricDelta[] }) {
  const cols = [
    { title: '指标', dataIndex: 'label', key: 'label', ellipsis: true },
    { title: '基准', key: 'b', width: 90, render: (_: unknown, r: MetricDelta) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.baseline.toFixed(2)}</span> },
    { title: '当前', key: 'c', width: 90, render: (_: unknown, r: MetricDelta) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.current.toFixed(2)}</span> },
    {
      title: '变化', key: 'd', width: 120,
      render: (_: unknown, r: MetricDelta) => (
        <span style={deltaStyle(r.improved, r.delta)}>
          {r.delta > 0 ? '+' : ''}{r.delta.toFixed(2)}
          {r.deltaPct != null ? ` (${r.deltaPct > 0 ? '+' : ''}${r.deltaPct}%)` : ''}
        </span>
      ),
    },
    {
      title: '趋势', key: 't', width: 70,
      render: (_: unknown, r: MetricDelta) => (
        r.delta === 0 ? <Tag>持平</Tag>
          : r.improved ? <Tag color="success">改善</Tag> : <Tag color="error">恶化</Tag>
      ),
    },
  ];
  return <Table rowKey="key" columns={cols} dataSource={data} pagination={false} size="small" />;
}

function NodeDeltaTable({ data }: { data: CallTreeNodeDelta[] }) {
  const cols = [
    { title: '状态', key: 'mask', width: 70, render: (_: unknown, r: CallTreeNodeDelta) => maskTag(r.mask) },
    { title: '节点', dataIndex: 'name', key: 'name', ellipsis: true },
    {
      title: '变化', key: 'delta', width: 140,
      render: (_: unknown, r: CallTreeNodeDelta) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          {r.deltaPct != null ? `${r.deltaPct > 0 ? '+' : ''}${r.deltaPct}%` : ''}
          {r.deltaMs != null ? ` / ${r.deltaMs > 0 ? '+' : ''}${r.deltaMs}ms` : ''}
          {r.maybeInlined && <Tag color="warning" style={{ marginLeft: 4 }}>疑似内联</Tag>}
        </span>
      ),
    },
  ];
  return <Table rowKey={(r, i) => `${r.name}-${i}`} columns={cols} dataSource={data} pagination={{ pageSize: 10 }} size="small" />;
}

const RunComparePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [baseId, setBaseId] = useState(searchParams.get('base') ?? '');
  const [currentId, setCurrentId] = useState(searchParams.get('current') ?? '');
  const [result, setResult] = useState<RunCompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState('');
  const [flameError, setFlameError] = useState('');
  const [flameLoading, setFlameLoading] = useState(false);

  const hasOptRun = runs.some(r => {
    const tag = `${r.label ?? ''} ${r.version ?? ''} ${r.id}`.toLowerCase();
    return tag.includes('opt');
  });

  useEffect(() => {
    listRuns(100).then(res => setRuns(res.items)).finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    const b = searchParams.get('base');
    const c = searchParams.get('current');
    if (b && c) {
      setBaseId(b);
      setCurrentId(c);
      doCompare(b, c);
    }
  }, []);

  async function doCompare(base: string, current: string) {
    if (!base || !current) return;
    setLoading(true);
    setError('');
    try {
      const res = await compareRuns(base, current);
      setResult(res);
      setSearchParams({ base, current });
    } catch (e: any) {
      setResult(null);
      setError(e.message || '对比失败');
    } finally {
      setLoading(false);
    }
  }

  const sharedHasSimpleperf = result
    ? result.diffTrees.some(t => t.source === 'simpleperf')
    : false;

  const flameSrc = baseId && currentId && result && sharedHasSimpleperf
    ? compareFlamegraphUrl(baseId, currentId)
    : '';

  useEffect(() => {
    if (!flameSrc) {
      setFlameError('');
      setFlameLoading(false);
      return;
    }
    setFlameLoading(true);
    setFlameError('');
    fetch(flameSrc, { method: 'GET' })
      .then(res => {
        if (!res.ok) return res.json().then(j => { throw new Error(j.error || '火焰图生成失败'); });
      })
      .catch(e => setFlameError(e.message))
      .finally(() => setFlameLoading(false));
  }, [flameSrc]);

  const runOptions = runs.map(r => ({
    label: `${r.label || r.id} [${r.sources.join('+')}] ${r.device || ''}`,
    value: r.id,
  }));

  return (
    <div>
      <Title level={5} style={{ marginBottom: 16 }}>对比分析</Title>

      {!listLoading && !hasOptRun && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="缺少第二份采集数据 (opt)"
          description={
            <div>
              当前库内仅有 <b>base</b> 同次采集 ({runs.length} 个 Run: 三源合并 + 各单源切片), 没有优化后的 <b>opt</b> Run。
               meaningful 的 base vs opt 对比需要先采集: 同设备、同场景、优化后版本的三源数据 → ingest → merge 为 <code>run_opt_cross</code>。
              下方可选择任意两 Run 预览 UI/差分引擎, 但结论会标为「演示/不可比」。
            </div>
          }
        />
      )}

      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Select
            placeholder="基准 Run (base)"
            value={baseId || undefined}
            onChange={setBaseId}
            options={runOptions}
            style={{ minWidth: 280, flex: 1 }}
            showSearch
            optionFilterProp="label"
          />
          <SwapOutlined style={{ color: 'var(--text-tertiary)' }} />
          <Select
            placeholder="对比 Run (current/opt)"
            value={currentId || undefined}
            onChange={setCurrentId}
            options={runOptions}
            style={{ minWidth: 280, flex: 1 }}
            showSearch
            optionFilterProp="label"
          />
          <Button
            type="primary"
            disabled={!baseId || !currentId || baseId === currentId}
            loading={loading}
            onClick={() => doCompare(baseId, currentId)}
          >
            开始对比
          </Button>
          <Button type="link" onClick={() => navigate('/runs')}>Runs 列表</Button>
        </div>
      </Card>

      {loading && <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>}

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}

      {result && !loading && (
        <>
          {/* Step 1: 普通话结论 */}
          <Card size="small" style={{ marginBottom: 16, borderLeft: '4px solid var(--color-primary)' }}>
            <Space wrap>
              <Tag color={VERDICT_COLOR[result.verdict]}>{VERDICT_TEXT[result.verdict]}</Tag>
              <Tag>{result.confidence} 置信度</Tag>
            </Space>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>{result.headline}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>{result.verdictReason}</Text>
          </Card>

          {/* Step 2: 可比性校验 */}
          <Card size="small" title="② 可比性校验" style={{ marginBottom: 16 }}>
            <Tag color={COMP_LEVEL[result.comparability.level].color}>
              {COMP_LEVEL[result.comparability.level].text}
            </Tag>
            <Table
              rowKey="name"
              size="small"
              pagination={false}
              style={{ marginTop: 12 }}
              dataSource={result.comparability.checks}
              columns={[
                { title: '检查项', dataIndex: 'name', width: 120 },
                { title: '通过', key: 'ok', width: 70, render: (_: unknown, r: { ok: boolean }) => r.ok ? <Tag color="success">✓</Tag> : <Tag color="error">✗</Tag> },
                { title: '详情', dataIndex: 'detail' },
              ]}
            />
            {result.comparability.warnings.map((w, i) => (
              <Alert key={i} type="warning" showIcon message={w} style={{ marginTop: 8 }} />
            ))}
            {result.comparability.level === 'not_comparable' && (
              <Alert type="error" showIcon style={{ marginTop: 8 }} message="不可比时不给出优化结论" />
            )}
          </Card>

          {/* Step 3: 三张差分树 */}
          <Card size="small" title="③ 差分树 (宏观 + 大 delta 节点)" style={{ marginBottom: 16 }}>
            <Collapse
              items={result.diffTrees.map(tree => ({
                key: tree.source,
                label: (
                  <span>
                    {SOURCE_LABELS[tree.source] ?? tree.source}
                    <Tag style={{ marginLeft: 8 }}>{tree.topNodes.length} 节点变化</Tag>
                  </span>
                ),
                children: (
                  <div>
                    {tree.note && <Alert type="info" showIcon message={tree.note} style={{ marginBottom: 12 }} />}
                    <Text type="secondary" style={{ fontSize: 12 }}>宏观对比</Text>
                    <MetricDeltaTable data={tree.macro} />
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 16 }}>大 delta 节点</Text>
                    {tree.topNodes.length > 0
                      ? <NodeDeltaTable data={tree.topNodes} />
                      : <Text type="secondary">无显著节点变化 (或缺 callTrees)</Text>}
                  </div>
                ),
              }))}
            />
          </Card>

          {/* simpleperf 差分火焰图 */}
          {sharedHasSimpleperf && (
            <Card
              size="small"
              title="simpleperf 差分火焰图"
              style={{ marginBottom: 16 }}
              extra={flameSrc && !flameError ? (
                <Button size="small" type="link" href={flameSrc} target="_blank" rel="noreferrer">新窗口打开</Button>
              ) : null}
            >
              {flameLoading && (
                <div style={{ textAlign: 'center', padding: 24 }}>
                  <Spin /><Text type="secondary" style={{ display: 'block', marginTop: 8 }}>正在生成差分火焰图 (约 1–2 分钟)…</Text>
                </div>
              )}
              {flameError && <Alert type="warning" showIcon message={flameError} />}
              {flameSrc && !flameError && !flameLoading && (
                <iframe
                  title="diff-flamegraph"
                  src={flameSrc}
                  style={{ width: '100%', height: '72vh', border: '1px solid var(--border-primary)', borderRadius: 8 }}
                />
              )}
            </Card>
          )}

          {/* Step 4: 各源独有对比 */}
          <Card size="small" title="④ 各源独有对比" style={{ marginBottom: 16 }}>
            <Collapse
              items={[
                result.unique.unity_profiler ? {
                  key: 'unity',
                  label: 'Unity — Jank / Marker',
                  children: (
                    <div>
                      <Row gutter={12} style={{ marginBottom: 12 }}>
                        {(['count', 'bigCount', 'rate'] as const).map(k => (
                          <Col key={k} span={8}>
                            <Card size="small">
                              <Text type="secondary">Jank {k}</Text>
                              <div style={{ fontFamily: 'var(--font-mono)' }}>
                                {result.unique.unity_profiler!.jank.baseline[k as 'count' | 'bigCount' | 'rate']}
                                {' → '}
                                {result.unique.unity_profiler!.jank.current[k as 'count' | 'bigCount' | 'rate']}
                                <Tag style={{ marginLeft: 8 }}>
                                  {result.unique.unity_profiler!.jank.delta[k as 'count' | 'bigCount' | 'rate'] > 0 ? '+' : ''}
                                  {result.unique.unity_profiler!.jank.delta[k as 'count' | 'bigCount' | 'rate']}
                                </Tag>
                              </div>
                            </Card>
                          </Col>
                        ))}
                      </Row>
                      <MetricDeltaTable data={result.unique.unity_profiler.topMarkerDeltas} />
                    </div>
                  ),
                } : null,
                result.unique.simpleperf ? {
                  key: 'sp',
                  label: 'simpleperf — SO / Anchor',
                  children: (
                    <>
                      <Text type="secondary" style={{ fontSize: 12 }}>SO 占比变化 (人话: 某代码库占 CPU 时间, 下降=更省)</Text>
                      <MetricDeltaTable data={result.unique.simpleperf.soDeltas} />
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>Anchor 子树 (人话: 从入口函数往下整条调用链的总耗时)</Text>
                      <MetricDeltaTable data={result.unique.simpleperf.anchorDeltas} />
                    </>
                  ),
                } : null,
                result.unique.perfetto ? {
                  key: 'pf',
                  label: 'Perfetto — 调度 / 频率',
                  children: (
                    <>
                      {result.unique.perfetto.throttleNote && (
                        <Alert type="warning" showIcon message={result.unique.perfetto.throttleNote} style={{ marginBottom: 12 }} />
                      )}
                      <MetricDeltaTable data={[...result.unique.perfetto.threadDeltas, ...result.unique.perfetto.systemDeltas]} />
                    </>
                  ),
                } : null,
              ].filter(Boolean) as { key: string; label: string; children: React.ReactNode }[]}
            />
          </Card>

          {/* Step 5: 综合 */}
          <Card size="small" title="⑤ 综合结论 (共性 / 独有)" style={{ marginBottom: 16 }}>
            {result.synthesis.length === 0 ? (
              <Text type="secondary">无可比结论或未检测到多源同向变化</Text>
            ) : (
              <Table
                rowKey={(_, i) => String(i)}
                size="small"
                pagination={false}
                dataSource={result.synthesis}
                columns={[
                  { title: '类型', key: 'kind', width: 80, render: (_: unknown, r: { kind: string }) => r.kind === 'common' ? <Tag color="green">共性</Tag> : <Tag color="blue">独有</Tag> },
                  { title: '源', key: 'src', width: 140, render: (_: unknown, r: { sources: string[] }) => r.sources.join('+') },
                  { title: '结论', dataIndex: 'conclusion', ellipsis: true },
                  { title: '证据', dataIndex: 'evidence', ellipsis: true },
                ]}
              />
            )}
          </Card>

          {result.markdown && (
            <Card
              size="small"
              title="完整对比报告 (Markdown)"
              style={{ marginBottom: 16 }}
              extra={(
                <Space>
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    onClick={() => downloadTextFile(
                      `compare_${baseId}_vs_${currentId}.md`,
                      result.markdown,
                    )}
                  >
                    下载
                  </Button>
                </Space>
              )}
            >
              {result.markdownPath && (
                <Text type="secondary" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 8 }}>
                  已落盘: {result.markdownPath}
                </Text>
              )}
              <Tabs
                items={[
                  {
                    key: 'md',
                    label: '渲染',
                    children: (
                      <div style={{ lineHeight: 1.75, maxHeight: '70vh', overflow: 'auto' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.markdown}</ReactMarkdown>
                      </div>
                    ),
                  },
                  {
                    key: 'raw',
                    label: '原文',
                    children: (
                      <pre style={{ fontSize: 11, maxHeight: '70vh', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                        {result.markdown}
                      </pre>
                    ),
                  },
                ]}
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
};

export default RunComparePage;
