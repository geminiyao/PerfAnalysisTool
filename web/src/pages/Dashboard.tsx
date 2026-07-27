import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Col,
  Drawer,
  Dropdown,
  Empty,
  Modal,
  Popover,
  Progress,
  Table,
  Tooltip,
  Typography,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  message,
} from 'antd';
import type { MenuProps } from 'antd';
import {
  ReloadOutlined,
  LineChartOutlined,
  AreaChartOutlined,
  BarsOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  DownOutlined,
  CheckCircleOutlined,
  FileTextOutlined,
  ExperimentOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import {
  fetchTriadTrends,
  fetchRunsByVersion,
  generateRunAnalysisWithSources,
  generatePrismAnalysis,
  subscribeProgress,
  listRuns,
  fetchPrismTiming,
  type TriadTrendsData,
  type VersionRunItem,
  type PipelineTiming,
} from '@/services/api';

const { Text, Title } = Typography;

/** 三图 dataZoom 联动用的 group 名 */
const TRIAD_GROUP = 'triad-trends';
// 注册联动 (幂等, echarts 内部去重)
echarts.connect(TRIAD_GROUP);

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<TriadTrendsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | undefined>(undefined);
  const [device, setDevice] = useState<string | undefined>(undefined);
  const [scene, setScene] = useState<string | undefined>(undefined);

  // 抽屉状态: 点击版本点 → 展开该版本的 Run 列表
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerVersion, setDrawerVersion] = useState('');
  const [drawerItems, setDrawerItems] = useState<VersionRunItem[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null); // 正在分析的 runId

  // Prism 分析状态 (WT-051b)
  // prismAnalyzing: 正在跑 Prism 的 runId (与 analyzing 区分, 互不阻塞)
  // prismProgress: runId → { stage, progress, message, sessionId?, done? }
  const [prismAnalyzing, setPrismAnalyzing] = useState<string | null>(null);
  const [prismProgress, setPrismProgress] = useState<Record<string, {
    stage: string;
    progress: number;
    message: string;
    sessionId?: string;
    done?: boolean;
    startTime?: number;
    endTime?: number;
    logs?: string[];
  }>>({});
  // 每秒 tick 驱动已用时间更新
  const [, setPrismTick] = useState(0);
  useEffect(() => {
    if (!prismAnalyzing) return;
    const timer = setInterval(() => setPrismTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [prismAnalyzing]);

  // 筛选器选项: 从 runs 列表提取去重
  const [projectOptions, setProjectOptions] = useState<{ label: string; value: string }[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<{ label: string; value: string }[]>([]);
  const [sceneOptions, setSceneOptions] = useState<{ label: string; value: string }[]>([]);
  const [timingData, setTimingData] = useState<PipelineTiming | null>(null);
  const [timingOpen, setTimingOpen] = useState(false);
  const [timingAnalysisList, setTimingAnalysisList] = useState<Array<{ id: string; label: string }>>([]);
  const [timingSelectedId, setTimingSelectedId] = useState<string>('');

  useEffect(() => {
    listRuns(200, 0).then(res => {
      const projects = new Map<string, number>();
      const devices = new Map<string, number>();
      const scenes = new Map<string, number>();
      for (const item of res.items) {
        if (item.projectName) projects.set(item.projectName, (projects.get(item.projectName) ?? 0) + 1);
        if (item.device) devices.set(item.device, (devices.get(item.device) ?? 0) + 1);
        if (item.scene) scenes.set(item.scene, (scenes.get(item.scene) ?? 0) + 1);
      }
      setProjectOptions([...projects.keys()].map(v => ({ label: v, value: v })));
      setDeviceOptions([...devices.keys()].map(v => ({ label: v, value: v })));
      setSceneOptions([...scenes.keys()].map(v => ({ label: v, value: v })));
    }).catch(() => { /* 静默 */ });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchTriadTrends({ projectName, device, scene });
      setData(res);
    } catch (e: any) {
      setError(e.message ?? '加载失败');
    } finally {
      setLoading(false);
    }
  }, [projectName, device, scene]);

  useEffect(() => {
    load();
  }, [load]);

  const versions = data?.versions ?? [];
  const versionLabels = useMemo(() => versions.map(v => v.version), [versions]);

  // 点击图表上的版本点 → 打开抽屉
  const onChartClick = useCallback(async (params: any) => {
    if (!params || params.componentType !== 'series' && params.componentType !== 'xAxis') return;
    const version = params.name ?? params.value;
    if (!version) return;
    setDrawerVersion(version);
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerItems([]);
    try {
      const res = await fetchRunsByVersion(version);
      setDrawerItems(res.items);
    } catch (e: any) {
      message.error(`加载版本 Run 列表失败: ${e.message}`);
    } finally {
      setDrawerLoading(false);
    }
  }, []);

  // 触发分析 (指定源子集)
  const handleAnalyze = useCallback(async (runId: string, sources: string[]) => {
    setAnalyzing(runId);
    try {
      await generateRunAnalysisWithSources(runId, { sources });
      message.success('分析完成');
      // 刷新抽屉数据
      const res = await fetchRunsByVersion(drawerVersion);
      setDrawerItems(res.items);
    } catch (e: any) {
      message.error(`分析失败: ${e.message}`);
    } finally {
      setAnalyzing(null);
    }
  }, [drawerVersion]);

  // 触发 Prism 三段管线分析 (WT-051b)
  // 进度阶段映射 (后端 progress 是 0-100, 这里按 message 关键字判定当前三段中的哪一段):
  //   explore   → 10-30%
  //   narrative → 40-80%
  //   render    → 85-100%
  const handlePrismAnalyze = useCallback(async (runId: string) => {
    setPrismAnalyzing(runId);
    setPrismProgress(prev => ({ ...prev, [runId]: { stage: 'queued', progress: 0, message: '提交中...', startTime: Date.now(), logs: [] } }));
    let sessionId: string | null = null;
    let unsub: (() => void) | null = null;
    try {
      const res = await generatePrismAnalysis(runId, { source: 'unity' });
      sessionId = res.sessionId;
      setPrismProgress(prev => ({ ...prev, [runId]: { stage: 'queued', progress: 5, message: `已入队 (位置 ${res.position})`, sessionId } }));

      // 订阅 SSE 进度
      unsub = subscribeProgress(sessionId, (evt) => {
        if (!evt || evt.type === 'connected') return;
        const rawStage = typeof evt.stage === 'string' ? evt.stage : '';
        const rawMsg = typeof evt.message === 'string' ? evt.message : '';
        const rawProgress = typeof evt.progress === 'number' ? evt.progress : 0;
        const msgLower = rawMsg.toLowerCase();

        // 三段判定: 优先看 message 关键字, 其次看后端 stage
        let stage = 'explore';
        let progress = rawProgress;
        if (msgLower.includes('narrative') || rawStage === 'narrative') {
          stage = 'narrative';
          progress = Math.max(rawProgress, 40);
        } else if (msgLower.includes('render') || rawStage === 'render') {
          stage = 'render';
          progress = Math.max(rawProgress, 85);
        } else if (msgLower.includes('explore') || rawStage === 'explore') {
          stage = 'explore';
          progress = Math.max(rawProgress, 10);
        } else if (rawStage === 'completed') {
          stage = 'done';
          progress = 100;
        } else if (rawStage === 'failed') {
          stage = 'failed';
        }

        setPrismProgress(prev => ({
          ...prev,
          [runId]: {
            ...prev[runId],
            stage, progress,
            message: rawMsg || stage,
            sessionId: sessionId ?? undefined,
            logs: [...(prev[runId]?.logs ?? []), rawMsg].filter(Boolean).slice(-12),
          },
        }));

        if (rawStage === 'completed') {
          setPrismProgress(prev => ({
            ...prev,
            [runId]: { ...prev[runId], stage: 'done', progress: 100, message: '报告已生成', sessionId: sessionId ?? undefined, done: true, endTime: Date.now() },
          }));
          setPrismAnalyzing(null);
          unsub?.();
          unsub = null;
        } else if (rawStage === 'failed') {
          message.error(`Prism 分析失败: ${rawMsg}`);
          setPrismAnalyzing(null);
          unsub?.();
          unsub = null;
        }
      });
    } catch (e: any) {
      message.error(`Prism 分析启动失败: ${e.message}`);
      setPrismAnalyzing(null);
    }
  }, []);

  if (loading && !data) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Spin size="large" tip="加载三源趋势数据..." />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <Alert
          type="error"
          showIcon
          message="趋势数据加载失败"
          description={error}
          action={<Button onClick={load} icon={<ReloadOutlined />}>重试</Button>}
        />
      </Card>
    );
  }

  const hasData = versions.length > 0;

  return (
    <div style={{ maxWidth: 1680, margin: '0 auto' }}>
      {/* 顶部: 标题 + 筛选器 */}
      <Card style={{ marginBottom: 14 }} bodyStyle={{ padding: '16px 20px' }}>
        <Row justify="space-between" align="middle" gutter={[12, 12]}>
          <Col>
            <Space direction="vertical" size={2}>
              <Title level={4} style={{ margin: 0 }}>
                性能趋势总览
              </Title>
              <Text type="secondary" style={{ fontSize: 12 }}>
                三源 (Unity / simpleperf / Perfetto) 按版本号聚合, 同版本多 Run 取中位数。横轴为版本号。
              </Text>
            </Space>
          </Col>
          <Col>
            <Space wrap>
              <Select
                allowClear
                showSearch
                placeholder="项目"
                style={{ width: 160 }}
                value={projectName}
                onChange={v => setProjectName(v ?? undefined)}
                options={projectOptions}
              />
              <Select
                allowClear
                showSearch
                placeholder="设备"
                style={{ width: 160 }}
                value={device}
                onChange={v => setDevice(v ?? undefined)}
                options={deviceOptions}
              />
              <Select
                allowClear
                showSearch
                placeholder="场景"
                style={{ width: 160 }}
                value={scene}
                onChange={v => setScene(v ?? undefined)}
                options={sceneOptions}
              />
              <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
                刷新
              </Button>
            </Space>
          </Col>
        </Row>
        {hasData && (
          <div style={{ marginTop: 10 }}>
            <Space wrap>
              <Tag color="blue">{versions.length} 个版本</Tag>
              <Tag color="green">{versions.reduce((s, v) => s + v.runCount, 0)} 个 Run</Tag>
              {data?.filters.projectName && <Tag color="purple">项目: {data.filters.projectName}</Tag>}
            </Space>
          </div>
        )}
      </Card>

      {!hasData ? (
        <Card>
          <Empty description="暂无 ready 状态的 Run 数据, 请先采集并入库" />
        </Card>
      ) : (
        <>
          {/* 1. Unity — FPS + P95 趋势 */}
          <ChartCard
            icon={<LineChartOutlined />}
            title="Unity Profiler · 帧率趋势"
            desc="实线 = FPS (左轴), 虚线 = P95 帧时间 (右轴, ms)"
          >
            <ReactECharts
              option={unityOption(versionLabels, data!)}
              style={{ height: 320 }}
              notMerge
              group={TRIAD_GROUP}
              onEvents={{ click: onChartClick }}
              opts={{ renderer: 'canvas' }}
            />
          </ChartCard>

          {/* 2. simpleperf — so 占比堆叠面积 */}
          <ChartCard
            icon={<AreaChartOutlined />}
            title="simpleperf · so CPU 占比趋势"
            desc="各 so 库 CPU 采样占比 (%)。每条线一个 so, 斜率=涨跌方向。默认显示 Top 5, 点击图例可展开其余。"
          >
            <ReactECharts
              option={simpleperfOption(versionLabels, data!)}
              style={{ height: 320 }}
              notMerge
              group={TRIAD_GROUP}
              onEvents={{ click: onChartClick }}
              opts={{ renderer: 'canvas' }}
            />
          </ChartCard>

          {/* 3. Perfetto — 线程 running/sleeping 趋势 */}
          <ChartCard
            icon={<BarsOutlined />}
            title="Perfetto · 关键线程 Running 率趋势"
            desc="主线程 / 渲染线程 / 提交线程 的 Running 占比 (%)。Running 高 = CPU-bound"
          >
            <ReactECharts
              option={perfettoOption(versionLabels, data!)}
              style={{ height: 320 }}
              notMerge
              group={TRIAD_GROUP}
              onEvents={{ click: onChartClick }}
              opts={{ renderer: 'canvas' }}
            />
          </ChartCard>

          {/* 联动说明 */}
          <Card size="small" style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              提示: 点击任意图的版本点可下钻到该版本的 Run 列表。拖拽缩放条可三图联动, 对照"FPS 下降的版本, simpleperf 哪个 so 涨了、Perfetto 哪个线程 Running 变高"。
            </Text>
          </Card>
        </>
      )}

      {/* 版本下钻抽屉 */}
      <Drawer
        title={`版本 ${drawerVersion} · Run 列表`}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={620}
      >
        <VersionRunDrawer
          items={drawerItems}
          loading={drawerLoading}
          analyzing={analyzing}
          onAnalyze={handleAnalyze}
          onViewRun={(runId) => { setDrawerOpen(false); navigate(`/runs/${runId}`); }}
          prismAnalyzing={prismAnalyzing}
          prismProgress={prismProgress}
          onPrismAnalyze={handlePrismAnalyze}
        />
      </Drawer>

      {/* 流水计时 Modal (zIndex 高于 Drawer 避免被遮住) */}
      <Modal
        title="Prism 三阶段流水计时"
        open={timingOpen}
        onCancel={() => setTimingOpen(false)}
        footer={null}
        width={800}
        zIndex={2000}
      >
        {timingAnalysisList.length > 1 && (
          <div style={{ marginBottom: 12 }}>
            <Select
              size="small"
              style={{ width: '100%' }}
              value={timingSelectedId}
              onChange={async (val: string) => {
                setTimingSelectedId(val);
                setTimingData(null);
                const t = await fetchPrismTiming(val);
                if (t) setTimingData(t);
                else message.warning('该分析暂无计时数据');
              }}
              options={timingAnalysisList.map(a => ({ value: a.id, label: a.label }))}
            />
          </div>
        )}
        {timingData && (
          <div>
            {/* 总览 */}
            <div style={{ marginBottom: 16, padding: 12, background: '#fafafa', borderRadius: 8 }}>
              <Text strong>总耗时: </Text>
              <Text>{timingData.total.end ? ((timingData.total.end - timingData.total.start) / 1000).toFixed(1) : '?'}s</Text>
              {timingData.explore && (
                <div style={{ marginTop: 8 }}>
                  <Tag color="blue">Explore: {((timingData.explore.end - timingData.explore.start) / 1000).toFixed(1)}s</Tag>
                  <Tag color="purple">Narrative: {timingData.narrative ? ((timingData.narrative.end - timingData.narrative.start) / 1000).toFixed(1) : '?'}s</Tag>
                  <Tag color="green">Render: {timingData.render ? ((timingData.render.end - timingData.render.start) / 1000).toFixed(1) : '?'}s</Tag>
                </div>
              )}
            </div>

            {/* Explore per-tool-call */}
            {timingData.explore?.toolCalls && timingData.explore.toolCalls.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text strong>Stage 1 — Explore 明细 ({timingData.explore.toolCalls.length} tool calls)</Text>
                <Table
                  size="small"
                  pagination={false}
                  dataSource={timingData.explore.toolCalls.map((tc, i) => ({ ...tc, key: i }))}
                  columns={[
                    { title: '#', dataIndex: 'seq', width: 40 },
                    { title: '工具', dataIndex: 'toolNames', width: 200, ellipsis: true },
                    {
                      title: '执行',
                      dataIndex: 'toolMs',
                      width: 70,
                      render: (v: number | null) => v != null ? `${v}ms` : '—',
                    },
                    {
                      title: 'LLM 间隔',
                      width: 80,
                      render: (_: any, record: any, idx: number) => {
                        if (idx === 0) return '—';
                        const prev = timingData.explore!.toolCalls[idx - 1];
                        const prevEnd = prev.resultTs || prev.ts;
                        const curStart = record.ts;
                        const gap = curStart - prevEnd;
                        return gap > 0 ? (
                          <Text style={{ color: gap > 60000 ? '#ff4d4f' : gap > 30000 ? '#faad14' : '#52c41a' }}>
                            {(gap / 1000).toFixed(1)}s
                          </Text>
                        ) : '—';
                      },
                    },
                    {
                      title: '结果大小',
                      dataIndex: 'resultLen',
                      width: 80,
                      render: (v: number) => v > 0 ? `${(v / 1024).toFixed(1)}KB` : '—',
                    },
                  ]}
                />
              </div>
            )}

            {/* Narrative sub-stages */}
            {timingData.narrative?.subStages && (
              <div style={{ marginBottom: 16 }}>
                <Text strong>Stage 2 — Narrative 子阶段</Text>
                <Table
                  size="small"
                  pagination={false}
                  dataSource={Object.entries(timingData.narrative.subStages).map(([k, v]) => ({ key: k, stage: k, ms: v }))}
                  columns={[
                    { title: '子阶段', dataIndex: 'stage', width: 150 },
                    {
                      title: '耗时',
                      dataIndex: 'ms',
                      width: 120,
                      render: (v: number) => (
                        <Text style={{ color: v > 60000 ? '#ff4d4f' : v > 10000 ? '#faad14' : '#52c41a' }}>
                          {v > 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`}
                        </Text>
                      ),
                    },
                    {
                      title: '占比',
                      render: (_: any, record: any) => {
                        const total = Object.values(timingData.narrative!.subStages!).reduce((a: number, b: any) => a + b, 0);
                        return total > 0 ? `${((record.ms / total) * 100).toFixed(1)}%` : '—';
                      },
                    },
                  ]}
                />
              </div>
            )}

            {/* Render */}
            {timingData.render && (
              <div>
                <Text strong>Stage 3 — Render: </Text>
                <Text>{((timingData.render.end - timingData.render.start) / 1000).toFixed(1)}s</Text>
                <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>(纯代码，无 LLM)</Text>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

// ============================================================
// 源组合 → 分析选项生成
// ============================================================

const SOURCE_LABELS: Record<string, string> = {
  unity_profiler: 'Unity',
  simpleperf: 'simpleperf',
  perfetto: 'Perfetto',
};

const SOURCE_COLORS: Record<string, string> = {
  unity_profiler: 'green',
  simpleperf: 'blue',
  perfetto: 'purple',
};

/** 根据 Run 的 sources 生成可分析选项 (单源 + 多源组合)。 */
function buildAnalysisOptions(sources: string[]): { label: string; sources: string[] }[] {
  const opts: { label: string; sources: string[] }[] = [];
  // 单源
  for (const s of sources) {
    opts.push({ label: `${SOURCE_LABELS[s] ?? s} 单源`, sources: [s] });
  }
  // 全源交叉
  if (sources.length >= 2) {
    opts.push({
      label: sources.length === 2 ? '双源交叉' : sources.length === 3 ? '三源交叉' : `${sources.length} 源交叉`,
      sources,
    });
  }
  return opts;
}

/** 抽屉内的 Run 列表 */
function VersionRunDrawer({
  items,
  loading,
  analyzing,
  onAnalyze,
  onViewRun,
  prismAnalyzing,
  prismProgress,
  onPrismAnalyze,
}: {
  items: VersionRunItem[];
  loading: boolean;
  analyzing: string | null;
  onAnalyze: (runId: string, sources: string[]) => void;
  onViewRun: (runId: string) => void;
  prismAnalyzing: string | null;
  prismProgress: Record<string, {
    stage: string;
    progress: number;
    message: string;
    sessionId?: string;
    done?: boolean;
  }>;
  onPrismAnalyze: (runId: string) => void;
}) {
  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin tip="加载 Run 列表..." /></div>;
  }
  if (items.length === 0) {
    return <Empty description="该版本暂无 Run" />;
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      {items.map(run => {
        const analysisOptions = buildAnalysisOptions(run.sources);
        const menuItems: MenuProps['items'] = analysisOptions.map(opt => ({
          key: opt.sources.join('+'),
          label: opt.label,
          onClick: () => onAnalyze(run.id, opt.sources),
        }));

        const prismState = prismProgress[run.id];
        const isPrismRunning = prismAnalyzing === run.id;
        const prismDone = prismState?.done && prismState?.sessionId;
        const prismStageLabel = prismState?.stage === 'explore' ? '① 探索'
          : prismState?.stage === 'narrative' ? '② 叙事'
          : prismState?.stage === 'render' ? '③ 渲染'
          : prismState?.stage === 'done' ? '完成'
          : prismState?.stage === 'failed' ? '失败'
          : prismState?.stage === 'queued' ? '排队'
          : prismState?.stage || '准备中';

        return (
          <Card key={run.id} size="small" bodyStyle={{ padding: 12 }}>
            {/* 第一行: 源标签 + 设备/场景 */}
            <Space wrap size={[6, 6]}>
              {run.sources.map(s => (
                <Tag key={s} color={SOURCE_COLORS[s] ?? 'default'} style={{ fontSize: 11 }}>
                  {SOURCE_LABELS[s] ?? s}
                </Tag>
              ))}
              <Text style={{ fontSize: 12 }}>{run.device || '—'} / {run.scene || '—'}</Text>
            </Space>

            {/* 第二行: 时间 + label */}
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                {dayjs(run.createdAt).format('MM-DD HH:mm')}
                {run.label ? ` · ${run.label}` : ''}
              </Text>
            </div>

            {/* 第三行: 已有分析（最多展示 4 个，多了折叠成 +N） */}
            {run.analyses.length > 0 && (() => {
              const MAX_VISIBLE = 4;
              const visible = run.analyses.slice(0, MAX_VISIBLE);
              const hidden = run.analyses.slice(MAX_VISIBLE);
              return (
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>已有 AI 分析:</Text>
                  <Space wrap size={[4, 4]} style={{ marginTop: 4 }}>
                    {visible.map(a => (
                      <Tag
                        key={a.id}
                        icon={a.hasReport ? <CheckCircleOutlined /> : undefined}
                        color={a.hasReport ? 'success' : 'default'}
                        style={{ fontSize: 11, cursor: 'pointer' }}
                        onClick={() => {
                          if (a.skill === 'prism-pipeline' && a.hasReport) {
                            window.open(`/cpu/prism-report/${a.id}`, '_blank');
                          } else {
                            onViewRun(run.id);
                          }
                        }}
                      >
                        {a.typeLabel}
                      </Tag>
                    ))}
                    {hidden.length > 0 && (
                      <Popover
                        trigger="click"
                        placement="bottom"
                        content={
                          <Space direction="vertical" size={4} style={{ maxWidth: 320 }}>
                            {hidden.map(a => (
                              <Tag
                                key={a.id}
                                icon={a.hasReport ? <CheckCircleOutlined /> : undefined}
                                color={a.hasReport ? 'success' : 'default'}
                                style={{ fontSize: 11, cursor: 'pointer' }}
                                onClick={() => {
                                  if (a.skill === 'prism-pipeline' && a.hasReport) {
                                    window.open(`/cpu/prism-report/${a.id}`, '_blank');
                                  } else {
                                    onViewRun(run.id);
                                  }
                                }}
                              >
                                {a.typeLabel}
                              </Tag>
                            ))}
                          </Space>
                        }
                      >
                        <Tag style={{ fontSize: 11, cursor: 'pointer' }}>+{hidden.length} 更多</Tag>
                      </Popover>
                    )}
                    {run.analyses.some(a => a.skill === 'prism-pipeline') && (
                      <Tooltip title="查看三阶段流水计时">
                        <Button
                          size="small"
                          type="text"
                          icon={<ClockCircleOutlined />}
                          style={{ fontSize: 11, padding: '0 4px', height: 20 }}
                          onClick={async () => {
                            // 列出所有 prism 分析，按时间从旧到新
                            const prismAll = run.analyses.filter(a => a.skill === 'prism-pipeline');
                            const prismWithReport = prismAll.filter(a => a.hasReport);
                            const prismAnalysis = prismWithReport[prismWithReport.length - 1]
                              ?? prismAll[prismAll.length - 1];
                            if (!prismAnalysis) return;
                            // 填充下拉列表
                            setTimingAnalysisList(prismAll.map((a, i) => ({
                              id: a.id,
                              label: `#${prismAll.length - i} ${a.hasReport ? '✓' : '✗'} ${new Date(a.createdAt || 0).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}`,
                            })).reverse()); // 最新在最前
                            setTimingSelectedId(prismAnalysis.id);
                            const t = await fetchPrismTiming(prismAnalysis.id);
                            if (t) {
                              setTimingData(t);
                              setTimingOpen(true);
                            } else {
                              message.warning('暂无流水计时数据（流水计时仅在分析成功后生成）');
                            }
                          }}
                        />
                      </Tooltip>
                    )}
                  </Space>
                </div>
              );
            })()}

            {/* 第四行: 操作按钮 */}
            <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => onViewRun(run.id)}
              >
                查看详情
              </Button>
              <Dropdown menu={{ items: menuItems }}>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<ThunderboltOutlined />}
                  loading={analyzing === run.id}
                >
                  新建分析 <DownOutlined />
                </Button>
              </Dropdown>
              <Button
                size="small"
                icon={<ExperimentOutlined />}
                loading={isPrismRunning}
                onClick={() => onPrismAnalyze(run.id)}
              >
                Prism 分析
              </Button>
              {prismDone && (
                <>
                  <Button
                    size="small"
                    type="link"
                    icon={<FileTextOutlined />}
                    onClick={() => {
                      const url = `/cpu/prism-report/${prismState!.sessionId}`;
                      window.open(url, '_blank');
                    }}
                  >
                    打开报告
                  </Button>
                  <Tooltip title="查看三阶段流水计时">
                    <Button
                      size="small"
                      type="text"
                      icon={<ClockCircleOutlined />}
                      onClick={async () => {
                        if (!prismState?.sessionId) return;
                        const t = await fetchPrismTiming(prismState.sessionId);
                        if (t) {
                          setTimingData(t);
                          setTimingOpen(true);
                        } else {
                          message.warning('暂无流水计时数据');
                        }
                      }}
                    />
                  </Tooltip>
                </>
              )}
            </div>

            {/* Prism 进度条 (运行中或已有状态时展示) */}
            {(isPrismRunning || prismState) && prismState && (
              <div style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    Prism · {prismStageLabel}
                    {prismState.startTime && (
                      <span style={{ marginLeft: 6, color: 'var(--color-warning)' }}>
                        ⏱ {formatElapsed((prismState.endTime ?? Date.now()) - prismState.startTime)}
                      </span>
                    )}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11, maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {prismState.message}
                  </Text>
                </div>
                <Progress
                  percent={prismState.progress}
                  size="small"
                  status={
                    prismState.stage === 'failed' ? 'exception'
                      : prismState.stage === 'done' ? 'success'
                      : 'active'
                  }
                />
                {/* 实时日志区: 最近 6 条, 倒序 */}
                {prismState.logs && prismState.logs.length > 0 && prismState.stage !== 'done' && (
                  <div style={{
                    marginTop: 6, maxHeight: 80, overflowY: 'auto',
                    background: 'var(--color-fill-quaternary)', borderRadius: 4, padding: '4px 8px',
                    fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'monospace',
                  }}>
                    {prismState.logs.slice(-6).reverse().map((log, i) => (
                      <div key={i} style={{ opacity: 1 - i * 0.15, lineHeight: 1.5 }}>{log}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </Space>
  );
}
/** 格式化已用时间: ms → "1m30s" / "45s" */
function formatElapsed(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  return `${min}m${sec % 60}s`;
}

function ChartCard({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <Card style={{ marginBottom: 14 }} bodyStyle={{ padding: '12px 16px' }}>
      <Space style={{ marginBottom: 8 }}>
        <span style={{ color: 'var(--color-primary)' }}>{icon}</span>
        <Text strong>{title}</Text>
      </Space>
      <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginBottom: 8 }}>{desc}</div>
      {children}
    </Card>
  );
}

// ============================================================
// ECharts option 构造
// ============================================================

function chartBase() {
  return {
    backgroundColor: 'transparent',
    textStyle: { color: '#8b949e' },
    grid: { left: 52, right: 52, top: 40, bottom: 56 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#141619',
      borderColor: '#2a2e33',
      textStyle: { color: '#e6eaf0' },
    },
    dataZoom: [
      { type: 'inside', filterMode: 'none' },
      { type: 'slider', height: 18, bottom: 12, filterMode: 'none' },
    ],
  };
}

function unityOption(versionLabels: string[], data: TriadTrendsData) {
  return {
    ...chartBase(),
    legend: { top: 0, textStyle: { color: '#8b949e' }, data: ['FPS', 'P95 帧时间'] },
    xAxis: {
      type: 'category',
      data: versionLabels,
      axisLabel: { rotate: versionLabels.length > 6 ? 30 : 0 },
      axisLine: { lineStyle: { color: '#2a2e33' } },
    },
    yAxis: [
      { type: 'value', name: 'FPS', min: 0, splitLine: { lineStyle: { color: '#1f2328' } } },
      { type: 'value', name: 'P95 ms', splitLine: { show: false } },
    ],
    series: [
      {
        name: 'FPS',
        type: 'line',
        smooth: true,
        symbolSize: 8,
        connectNulls: true,
        data: data.unity.fps,
        lineStyle: { width: 3, color: '#52c41a' },
        areaStyle: { color: 'rgba(82,196,26,.12)' },
        itemStyle: { color: '#52c41a' },
        markLine: {
          symbol: 'none',
          label: { color: '#8b949e' },
          data: [{ yAxis: 60, name: '60fps' }, { yAxis: 30, name: '30fps' }],
        },
      },
      {
        name: 'P95 帧时间',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 8,
        connectNulls: true,
        data: data.unity.p95Ms,
        lineStyle: { width: 2, color: '#ff4d4f', type: 'dashed' },
        itemStyle: { color: '#ff4d4f' },
      },
    ],
  };
}

const SO_COLORS = [
  '#ff4d4f', '#ff7a45', '#faad14', '#52c41a',
  '#1677ff', '#722ed1', '#13c2c2', '#eb2f96', '#8b949e',
];

/** so 库名 → 中文友好名 (看趋势时不用猜缩写) */
const SO_LABELS: Record<string, string> = {
  kernel_kallsyms: '内核 (kernel)',
  libunity: 'Unity 引擎',
  libil2cpp: 'C# 业务 (il2cpp)',
  libc: 'C 标准库',
  libGLESv2_adreno: 'GPU 驱动',
  libAkSoundEngine: 'Wwise 音频',
  libxlua: 'Lua (xlua)',
  lib_burst_generated: 'Burst 作业',
  libm: '数学库 (libm)',
  libart: 'ART 运行时',
  linker64: '动态链接器',
  libcutils: 'cutils',
  其他: '其他',
};

function soLabel(name: string): string {
  return SO_LABELS[name] ?? name;
}

function simpleperfOption(versionLabels: string[], data: TriadTrendsData) {
  const soNames = data.simpleperf.soNames;
  const labels = soNames.map(soLabel);
  return {
    ...chartBase(),
    legend: {
      top: 0,
      type: 'scroll',
      textStyle: { color: '#8b949e' },
      data: labels,
      // 默认只显示 Top 5, 其余可点击展开 (避免线太多)
      selected: labels.reduce((acc, label, i) => {
        acc[label] = i < 5;
        return acc;
      }, {} as Record<string, boolean>),
    },
    xAxis: {
      type: 'category',
      data: versionLabels,
      axisLabel: { rotate: versionLabels.length > 6 ? 30 : 0 },
      axisLine: { lineStyle: { color: '#2a2e33' } },
    },
    yAxis: {
      type: 'value',
      name: 'CPU 占比 %',
      max: 100,
      splitLine: { lineStyle: { color: '#1f2328' } },
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#141619',
      borderColor: '#2a2e33',
      textStyle: { color: '#e6eaf0' },
      formatter: (params: any[]) => {
        const v = params[0]?.axisValue ?? '';
        const lines = params
          .filter((p: any) => p.value != null)
          .sort((a: any, b: any) => b.value - a.value)
          .map((p: any) => {
            const origName = soNames[labels.indexOf(p.seriesName)] ?? p.seriesName;
            return `${p.marker} ${p.seriesName}: <b>${p.value}%</b> <span style="color:#6e7681">(${origName})</span>`;
          });
        return `<b>${v}</b><br/>${lines.join('<br/>')}`;
      },
    },
    series: soNames.map((soName, i) => ({
      name: labels[i],
      type: 'line',
      smooth: true,
      symbol: 'circle',
      symbolSize: 7,
      connectNulls: true,
      data: data.simpleperf.soPct[soName] ?? [],
      lineStyle: { width: 2.5, color: SO_COLORS[i % SO_COLORS.length] },
      itemStyle: { color: SO_COLORS[i % SO_COLORS.length] },
      emphasis: { focus: 'series' },
    })),
  };
}

const THREAD_COLORS: Record<string, string> = {
  主线程: '#ff4d4f',
  渲染线程: '#1677ff',
  提交线程: '#722ed1',
};

function perfettoOption(versionLabels: string[], data: TriadTrendsData) {
  const threadLabels = data.perfetto.threadLabels;
  return {
    ...chartBase(),
    legend: {
      top: 0,
      textStyle: { color: '#8b949e' },
      data: threadLabels.map(t => `${t} Running`),
    },
    xAxis: {
      type: 'category',
      data: versionLabels,
      axisLabel: { rotate: versionLabels.length > 6 ? 30 : 0 },
      axisLine: { lineStyle: { color: '#2a2e33' } },
    },
    yAxis: {
      type: 'value',
      name: 'Running %',
      max: 100,
      min: 0,
      splitLine: { lineStyle: { color: '#1f2328' } },
    },
    series: threadLabels.map(label => ({
      name: `${label} Running`,
      type: 'line',
      smooth: true,
      symbolSize: 8,
      connectNulls: true,
      data: data.perfetto.running[label] ?? [],
      lineStyle: { width: 3, color: THREAD_COLORS[label] ?? '#8b949e' },
      itemStyle: { color: THREAD_COLORS[label] ?? '#8b949e' },
      areaStyle: { color: (THREAD_COLORS[label] ?? '#8b949e') + '1a' },
      markLine: {
        symbol: 'none',
        label: { color: '#8b949e' },
        data: [{ yAxis: 80, name: 'CPU-bound 阈值' }],
      },
    })),
  };
}

export default Dashboard;
