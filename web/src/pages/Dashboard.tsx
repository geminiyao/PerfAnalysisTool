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
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
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
} from '@ant-design/icons';
import dayjs from 'dayjs';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import {
  fetchTriadTrends,
  fetchRunsByVersion,
  generateRunAnalysisWithSources,
  listRuns,
  type TriadTrendsData,
  type VersionRunItem,
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

  // 筛选器选项: 从 runs 列表提取去重
  const [projectOptions, setProjectOptions] = useState<{ label: string; value: string }[]>([]);
  const [deviceOptions, setDeviceOptions] = useState<{ label: string; value: string }[]>([]);
  const [sceneOptions, setSceneOptions] = useState<{ label: string; value: string }[]>([]);

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
        />
      </Drawer>
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
}: {
  items: VersionRunItem[];
  loading: boolean;
  analyzing: string | null;
  onAnalyze: (runId: string, sources: string[]) => void;
  onViewRun: (runId: string) => void;
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

            {/* 第三行: 已有分析 */}
            {run.analyses.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 11 }}>已有 AI 分析:</Text>
                <Space wrap size={[4, 4]} style={{ marginTop: 4 }}>
                  {run.analyses.map(a => (
                    <Tag
                      key={a.id}
                      icon={a.hasReport ? <CheckCircleOutlined /> : undefined}
                      color={a.hasReport ? 'success' : 'default'}
                      style={{ fontSize: 11, cursor: 'pointer' }}
                      onClick={() => onViewRun(run.id)}
                    >
                      {a.typeLabel}
                    </Tag>
                  ))}
                </Space>
              </div>
            )}

            {/* 第四行: 操作按钮 */}
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
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
            </div>
          </Card>
        );
      })}
    </Space>
  );
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
