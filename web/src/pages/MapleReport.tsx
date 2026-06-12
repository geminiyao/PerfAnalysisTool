import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Card, Table, Tag, Empty, message, Select, Button, Tabs, Row, Col,
  Statistic, Space, Alert, Input, Switch, Tooltip, Spin, Upload,
  Typography, Divider,
} from 'antd';
import { InboxOutlined, ExperimentOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload';

const { Dragger } = Upload;
const { Text } = Typography;

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------
const API = '/api/maple';

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MapleRun {
  id: string;
  label: string;
  device: string;
  scene: string;
  durationSec: number;
  frameCount: number | null;
  status: string;
  error: string | null;
  createdAt: number;
}

interface PdataResult {
  totalFrames: number;
  avgFrameMs: number;
  p50FrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  maxFrameMs: number;
  scriptingMs: number;
  waitForTargetFpsMs: number;
  renderingMs: number;
  physicsMs: number;
  gcAllocCount: number;
  slowFrames33Count: number;
  slowFrames33Rate: number;
  topMarkersJson: string | null;
}

interface PerfettoResult {
  mainThreadRunningPct: number | null;
  mainThreadRunnablePct: number | null;
  mainThreadSleepingPct: number | null;
  cpuFreqAvgMhz: number | null;
  gpuFreqAvgMhz: number | null;
  frameP50Ms: number | null;
  frameP95Ms: number | null;
  frameP99Ms: number | null;
  frameAvgMs: number | null;
  binderCallCount: number | null;
  binderAvgDurMs: number | null;
  pssMb: number | null;
  parseStatus: string;
  parseNotes: string | null;
}

interface RunDetail {
  run: MapleRun;
  pdataResult: PdataResult | null;
  perfettoResult: PerfettoResult | null;
}

interface CompareReportData {
  report: {
    id: string;
    baseRunId: string;
    optRunId: string;
    scriptingDeltaPct: number | null;
    slowFramesBasePct: number | null;
    slowFramesOptPct: number | null;
    frameP95BaseMs: number | null;
    frameP95OptMs: number | null;
    conclusionJson: string | null;
    reportText: string | null;
  };
  base: RunDetail;
  opt: RunDetail;
}

// ---------------------------------------------------------------------------
// 数值格式化
// ---------------------------------------------------------------------------
const fmtMs = (v: number | null | undefined) => v != null ? v.toFixed(2) : 'N/A';
const fmtPct = (v: number | null | undefined) => v != null ? `${v.toFixed(1)}%` : 'N/A';
const deltaColor = (v: number | null | undefined, lowerBetter = true) => {
  if (v == null) return 'var(--text-tertiary)';
  if (Math.abs(v) < 0.1) return 'var(--text-tertiary)';
  const good = lowerBetter ? v < 0 : v > 0;
  return good ? 'var(--color-success)' : 'var(--color-error)';
};
const DeltaTag: React.FC<{ base?: number | null; opt?: number | null; lowerBetter?: boolean }> = ({
  base, opt, lowerBetter = true,
}) => {
  if (base == null || opt == null || base === 0) return <Tag>N/A</Tag>;
  const delta = (opt - base) / base * 100;
  const color = Math.abs(delta) < 0.5 ? 'default' : (lowerBetter ? delta < 0 : delta > 0) ? 'success' : 'error';
  return <Tag color={color}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</Tag>;
};

// ---------------------------------------------------------------------------
// 上传文件区域（支持单个版本的三类文件）
// ---------------------------------------------------------------------------
interface FilesState {
  perfData: File | null;
  ptrace: File | null;
  pdataFiles: File[];
}

const FileUploadArea: React.FC<{
  label: string;
  files: FilesState;
  onChange: (files: FilesState) => void;
  runInfo: { label: string; device: string; scene: string };
  onRunInfoChange: (info: { label: string; device: string; scene: string }) => void;
}> = ({ label, files, onChange, runInfo, onRunInfoChange }) => {
  return (
    <Card size="small" title={label} style={{ height: '100%' }}>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Row gutter={8}>
          <Col span={8}>
            <Text type="secondary" style={{ fontSize: 11 }}>标签</Text>
            <Input
              size="small" placeholder="如 maple_base" value={runInfo.label}
              onChange={e => onRunInfoChange({ ...runInfo, label: e.target.value })}
            />
          </Col>
          <Col span={8}>
            <Text type="secondary" style={{ fontSize: 11 }}>设备</Text>
            <Input size="small" placeholder="Pixel7" value={runInfo.device}
              onChange={e => onRunInfoChange({ ...runInfo, device: e.target.value })}
            />
          </Col>
          <Col span={8}>
            <Text type="secondary" style={{ fontSize: 11 }}>场景</Text>
            <Input size="small" placeholder="StressTestBattle" value={runInfo.scene}
              onChange={e => onRunInfoChange({ ...runInfo, scene: e.target.value })}
            />
          </Col>
        </Row>

        {/* perf.data */}
        <div>
          <Text type="secondary" style={{ fontSize: 11 }}>simpleperf perf.data（可选）</Text>
          <Upload
            accept=".data"
            maxCount={1}
            beforeUpload={f => { onChange({ ...files, perfData: f }); return false; }}
            onRemove={() => onChange({ ...files, perfData: null })}
            fileList={files.perfData ? [{ uid: '1', name: files.perfData.name, status: 'done' } as UploadFile] : []}
          >
            <Button size="small" style={{ width: '100%' }}>
              {files.perfData ? `✓ ${files.perfData.name}` : '选择 perf.data'}
            </Button>
          </Upload>
        </div>

        {/* .pdata */}
        <div>
          <Text type="secondary" style={{ fontSize: 11 }}>Unity Profiler .pdata（可选，可多选）</Text>
          <Upload
            accept=".pdata"
            multiple
            beforeUpload={(f, list) => {
              onChange({ ...files, pdataFiles: [...files.pdataFiles, ...list] });
              return false;
            }}
            onRemove={f => onChange({ ...files, pdataFiles: files.pdataFiles.filter(p => p.name !== f.name) })}
            fileList={files.pdataFiles.map((f, i) => ({ uid: String(i), name: f.name, status: 'done' } as UploadFile))}
          >
            <Button size="small" style={{ width: '100%' }}>
              {files.pdataFiles.length > 0 ? `✓ ${files.pdataFiles.length} 个 .pdata` : '选择 .pdata 文件'}
            </Button>
          </Upload>
        </div>

        {/* perfetto trace */}
        <div>
          <Text type="secondary" style={{ fontSize: 11 }}>perfetto .pftrace（可选）</Text>
          <Upload
            accept=".pftrace,.perfetto"
            maxCount={1}
            beforeUpload={f => { onChange({ ...files, ptrace: f }); return false; }}
            onRemove={() => onChange({ ...files, ptrace: null })}
            fileList={files.ptrace ? [{ uid: '1', name: files.ptrace.name, status: 'done' } as UploadFile] : []}
          >
            <Button size="small" style={{ width: '100%' }}>
              {files.ptrace ? `✓ ${files.ptrace.name}` : '选择 .pftrace 文件'}
            </Button>
          </Upload>
        </div>
      </Space>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// 已有 Run 选择区域
// ---------------------------------------------------------------------------
const ExistingRunSelector: React.FC<{
  label: string;
  runs: MapleRun[];
  value: string | null;
  onChange: (id: string) => void;
}> = ({ label, runs, value, onChange }) => (
  <Card size="small" title={label}>
    <Select
      style={{ width: '100%' }}
      placeholder="选择已有的采样 run"
      value={value}
      onChange={onChange}
      showSearch
      optionFilterProp="label"
      options={runs
        .filter(r => r.status === 'completed')
        .map(r => ({
          label: `${r.label}  ·  ${r.device}  ·  ${r.scene}  ·  ${new Date(r.createdAt).toLocaleString()}`,
          value: r.id,
        }))}
    />
  </Card>
);

// ---------------------------------------------------------------------------
// 对比结果：pdata Tab
// ---------------------------------------------------------------------------
const PdataCompareTab: React.FC<{ base: PdataResult | null; opt: PdataResult | null }> = ({ base, opt }) => {
  if (!base && !opt) return <Empty description="两个版本均无 .pdata 分析结果" />;

  const rows = [
    { key: 'totalFrames', label: '总帧数', b: base?.totalFrames, o: opt?.totalFrames, lb: false, fmt: (v: any) => String(v ?? 'N/A') },
    { key: 'avgFrameMs', label: '帧均耗时 (ms)', b: base?.avgFrameMs, o: opt?.avgFrameMs, lb: true, fmt: (v: any) => fmtMs(v) },
    { key: 'p50', label: 'P50 帧时间 (ms)', b: base?.p50FrameMs, o: opt?.p50FrameMs, lb: true, fmt: (v: any) => fmtMs(v) },
    { key: 'p95', label: 'P95 帧时间 (ms)', b: base?.p95FrameMs, o: opt?.p95FrameMs, lb: true, fmt: (v: any) => fmtMs(v) },
    { key: 'p99', label: 'P99 帧时间 (ms)', b: base?.p99FrameMs, o: opt?.p99FrameMs, lb: true, fmt: (v: any) => fmtMs(v) },
    { key: 'scripting', label: 'Scripting 帧均 (ms/frame)', b: base?.scriptingMs, o: opt?.scriptingMs, lb: true, fmt: (v: any) => fmtMs(v) },
    { key: 'wait', label: 'WaitForTargetFPS 帧均 (ms)', b: base?.waitForTargetFpsMs, o: opt?.waitForTargetFpsMs, lb: false, fmt: (v: any) => fmtMs(v) },
    { key: 'rendering', label: 'Rendering 帧均 (ms)', b: base?.renderingMs, o: opt?.renderingMs, lb: true, fmt: (v: any) => fmtMs(v) },
    { key: 'physics', label: 'Physics 帧均 (ms)', b: base?.physicsMs, o: opt?.physicsMs, lb: true, fmt: (v: any) => fmtMs(v) },
    { key: 'slow33', label: '慢帧(>33ms)占比', b: base ? base.slowFrames33Rate * 100 : null, o: opt ? opt.slowFrames33Rate * 100 : null, lb: true, fmt: fmtPct },
    { key: 'slow33c', label: '慢帧(>33ms)帧数', b: base?.slowFrames33Count, o: opt?.slowFrames33Count, lb: true, fmt: (v: any) => String(v ?? 'N/A') },
    { key: 'gc', label: 'GC.Alloc 帧均次数', b: base?.gcAllocCount, o: opt?.gcAllocCount, lb: true, fmt: (v: any) => fmtMs(v) },
  ];

  const cols: ColumnsType<typeof rows[0]> = [
    { title: '指标', dataIndex: 'label', width: '36%' },
    { title: 'Base', key: 'base', width: '20%', render: (_, r) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{r.fmt(r.b)}</span> },
    { title: 'Opt', key: 'opt', width: '20%', render: (_, r) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{r.fmt(r.o)}</span> },
    {
      title: '变化', key: 'delta', width: '24%',
      render: (_, r) => {
        if (r.b == null || r.o == null) return <Tag>N/A</Tag>;
        const bv = Number(r.b); const ov = Number(r.o);
        if (bv === 0) return <Tag>N/A</Tag>;
        const delta = (ov - bv) / bv * 100;
        const good = r.lb ? delta < 0 : delta > 0;
        const color = Math.abs(delta) < 0.5 ? 'default' : good ? 'success' : 'error';
        return (
          <span style={{ color: deltaColor(delta, r.lb), fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            <Tag color={color}>{delta > 0 ? '+' : ''}{delta.toFixed(1)}%</Tag>
          </span>
        );
      },
    },
  ];

  // Top markers 对比
  const baseMarkers: any[] = base?.topMarkersJson ? JSON.parse(base.topMarkersJson) : [];
  const optMarkers: any[] = opt?.topMarkersJson ? JSON.parse(opt.topMarkersJson) : [];
  const optMap = new Map(optMarkers.map(m => [m.name, m.avgMsPerFrame]));
  const markerRows = baseMarkers.slice(0, 15).map(m => ({
    name: m.name,
    base: m.avgMsPerFrame,
    opt: optMap.get(m.name) ?? null,
  }));

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Table dataSource={rows} columns={cols} rowKey="key" pagination={false} size="small" />
      {markerRows.length > 0 && (
        <Card size="small" title="Top Markers 帧均对比 (ms/frame)">
          <Table
            dataSource={markerRows}
            rowKey="name"
            size="small"
            pagination={false}
            columns={[
              { title: 'Marker', dataIndex: 'name', ellipsis: true },
              { title: 'Base', dataIndex: 'base', width: 90, render: v => <span style={{ fontFamily: 'var(--font-mono)' }}>{v.toFixed(3)}</span> },
              { title: 'Opt', dataIndex: 'opt', width: 90, render: v => v != null ? <span style={{ fontFamily: 'var(--font-mono)' }}>{v.toFixed(3)}</span> : '-' },
              {
                title: '变化', key: 'delta', width: 90,
                render: (_, r) => <DeltaTag base={r.base} opt={r.opt} lowerBetter />,
              },
            ]}
          />
        </Card>
      )}
    </Space>
  );
};

// ---------------------------------------------------------------------------
// 对比结果：perfetto Tab
// ---------------------------------------------------------------------------
const PerfettoCompareTab: React.FC<{ base: PerfettoResult | null; opt: PerfettoResult | null }> = ({ base, opt }) => {
  if (!base && !opt) return <Empty description="两个版本均无 perfetto 分析结果（perfetto_analyzer.py 未运行或解析失败）" />;
  if (base?.parseStatus === 'failed' && opt?.parseStatus === 'failed') {
    return <Alert type="error" message={`解析失败: base=${base.parseNotes ?? ''} | opt=${opt?.parseNotes ?? ''}`} />;
  }

  const rows = [
    { key: 'running', label: 'UnityMain Running 占比 (%)', b: base?.mainThreadRunningPct, o: opt?.mainThreadRunningPct, lb: true },
    { key: 'runnable', label: 'UnityMain Runnable 占比 (%)', b: base?.mainThreadRunnablePct, o: opt?.mainThreadRunnablePct, lb: true },
    { key: 'sleeping', label: 'UnityMain Sleeping 占比 (%)', b: base?.mainThreadSleepingPct, o: opt?.mainThreadSleepingPct, lb: false },
    { key: 'fp50', label: '帧时长 P50 (ms)', b: base?.frameP50Ms, o: opt?.frameP50Ms, lb: true },
    { key: 'fp95', label: '帧时长 P95 (ms)', b: base?.frameP95Ms, o: opt?.frameP95Ms, lb: true },
    { key: 'fp99', label: '帧时长 P99 (ms)', b: base?.frameP99Ms, o: opt?.frameP99Ms, lb: true },
    { key: 'favg', label: '帧时长均值 (ms)', b: base?.frameAvgMs, o: opt?.frameAvgMs, lb: true },
    { key: 'cpuFreq', label: 'CPU 频率均值 (MHz)', b: base?.cpuFreqAvgMhz, o: opt?.cpuFreqAvgMhz, lb: false },
    { key: 'gpuFreq', label: 'GPU 频率均值 (MHz)', b: base?.gpuFreqAvgMhz, o: opt?.gpuFreqAvgMhz, lb: false },
    { key: 'binder', label: 'Binder 均值延迟 (ms)', b: base?.binderAvgDurMs, o: opt?.binderAvgDurMs, lb: true },
    { key: 'binderCnt', label: 'Binder 调用次数', b: base?.binderCallCount, o: opt?.binderCallCount, lb: true },
    { key: 'pss', label: 'PSS 内存 (MB)', b: base?.pssMb, o: opt?.pssMb, lb: true },
  ];

  const cols: ColumnsType<typeof rows[0]> = [
    { title: '指标', dataIndex: 'label', width: '40%' },
    { title: 'Base', key: 'base', width: '18%', render: (_, r) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{r.b != null ? r.b.toFixed(2) : 'N/A'}</span> },
    { title: 'Opt', key: 'opt', width: '18%', render: (_, r) => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{r.o != null ? r.o.toFixed(2) : 'N/A'}</span> },
    {
      title: '变化', key: 'delta', width: '24%',
      render: (_, r) => <DeltaTag base={r.b} opt={r.o} lowerBetter={r.lb} />,
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {(base?.parseNotes || opt?.parseNotes) && (
        <Alert type="warning" message={`部分指标缺失：base: ${base?.parseNotes ?? 'ok'}  |  opt: ${opt?.parseNotes ?? 'ok'}`} />
      )}
      <Table dataSource={rows} columns={cols} rowKey="key" pagination={false} size="small" />
    </Space>
  );
};

// ---------------------------------------------------------------------------
// 自动结论
// ---------------------------------------------------------------------------
const ConclusionCard: React.FC<{ base: RunDetail; opt: RunDetail }> = ({ base, opt }) => {
  const bP = base.pdataResult;
  const oP = opt.pdataResult;
  const bF = base.perfettoResult;
  const oF = opt.perfettoResult;

  const conclusions: Array<{ type: 'success' | 'warning' | 'error' | 'info'; text: string }> = [];

  if (bP && oP && bP.scriptingMs > 0) {
    const d = (oP.scriptingMs - bP.scriptingMs) / bP.scriptingMs * 100;
    if (d < -2) conclusions.push({ type: 'success', text: `✓ Scripting 帧均下降 ${Math.abs(d).toFixed(1)}%，Unity Profiler 层面收益明显` });
    else if (d < 0) conclusions.push({ type: 'info', text: `~ Scripting 帧均下降 ${Math.abs(d).toFixed(1)}%，幅度较小` });
    else conclusions.push({ type: 'error', text: `✗ Scripting 帧均未见下降（${d.toFixed(1)}%）` });
  }

  if (bP && oP) {
    const slowImprove = bP.slowFrames33Rate - oP.slowFrames33Rate;
    if (slowImprove > 0.01) conclusions.push({ type: 'success', text: `✓ 慢帧率(>33ms)改善 ${(slowImprove * 100).toFixed(1)}pp (${(bP.slowFrames33Rate * 100).toFixed(1)}% → ${(oP.slowFrames33Rate * 100).toFixed(1)}%)` });
    const p95d = bP.p95FrameMs > 0 ? (oP.p95FrameMs - bP.p95FrameMs) / bP.p95FrameMs * 100 : null;
    if (p95d != null && p95d < -3) conclusions.push({ type: 'success', text: `✓ 帧时间 P95 下降 ${Math.abs(p95d).toFixed(1)}%（${fmtMs(bP.p95FrameMs)} → ${fmtMs(oP.p95FrameMs)}ms）` });
    if (oP.waitForTargetFpsMs > bP.waitForTargetFpsMs + 0.5) {
      conclusions.push({ type: 'info', text: `~ WaitForTargetFPS 增加 ${(oP.waitForTargetFpsMs - bP.waitForTargetFpsMs).toFixed(2)}ms，说明 CPU 更宽松` });
    }
  }

  if (bF && oF && bF.parseStatus !== 'failed' && oF.parseStatus !== 'failed') {
    if (bF.frameP95Ms != null && oF.frameP95Ms != null && bF.frameP95Ms > 0) {
      const d = (oF.frameP95Ms - bF.frameP95Ms) / bF.frameP95Ms * 100;
      if (d < -3) conclusions.push({ type: 'success', text: `✓ perfetto 帧时长 P95 下降 ${Math.abs(d).toFixed(1)}%（${fmtMs(bF.frameP95Ms)} → ${fmtMs(oF.frameP95Ms)}ms）` });
    }
    if (bF.mainThreadRunningPct != null && oF.mainThreadRunningPct != null) {
      const d = oF.mainThreadRunningPct - bF.mainThreadRunningPct;
      if (d < -2) conclusions.push({ type: 'success', text: `✓ UnityMain Running 占比降低 ${Math.abs(d).toFixed(1)}pp，CPU 利用率改善` });
    }
    if (bF.gpuFreqAvgMhz != null && bF.gpuFreqAvgMhz > 800) {
      conclusions.push({ type: 'warning', text: `! GPU 频率均值 ${bF.gpuFreqAvgMhz.toFixed(0)}MHz，GPU 可能是瓶颈，请确认 CPU 收益未被稀释` });
    }
  }

  if (conclusions.length === 0) {
    conclusions.push({ type: 'info', text: '暂无足够数据生成自动结论，请查看各 Tab 详细指标' });
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {conclusions.map((c, i) => (
        <Alert key={i} type={c.type} message={c.text} showIcon />
      ))}
    </Space>
  );
};

// ---------------------------------------------------------------------------
// 主页面
// ---------------------------------------------------------------------------
const MapleReport: React.FC = () => {
  const [runs, setRuns] = useState<MapleRun[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);

  // 选择模式：existing（已有 run）| upload（新上传）
  const [mode, setMode] = useState<'existing' | 'upload'>('existing');

  // 已有 run 选择
  const [baseRunId, setBaseRunId] = useState<string | null>(null);
  const [optRunId, setOptRunId] = useState<string | null>(null);

  // 上传文件
  const emptyFiles = (): FilesState => ({ perfData: null, ptrace: null, pdataFiles: [] });
  const [baseFiles, setBaseFiles] = useState<FilesState>(emptyFiles());
  const [optFiles, setOptFiles] = useState<FilesState>(emptyFiles());
  const [baseInfo, setBaseInfo] = useState({ label: 'maple_base', device: '', scene: '' });
  const [optInfo, setOptInfo] = useState({ label: 'maple_opt', device: '', scene: '' });

  // 对比结果
  const [result, setResult] = useState<CompareReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const data = await apiFetch<MapleRun[]>(`${API}/runs`);
      setRuns(data);
    } catch (e: any) { message.error('加载 runs 失败：' + e.message); }
    finally { setRunsLoading(false); }
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  // 上传单个版本的文件，返回 runId
  const uploadAndAnalyze = async (files: FilesState, info: typeof baseInfo): Promise<string> => {
    const formData = new FormData();
    const meta = {
      run_label: `${info.label}_${Date.now()}`,
      label: info.label,
      device: info.device,
      scene: info.scene,
      duration_sec: 0,
    };
    formData.append('meta', JSON.stringify(meta));
    if (files.perfData) formData.append('perf_data', files.perfData, files.perfData.name);
    if (files.ptrace) formData.append('ptrace', files.ptrace, files.ptrace.name);
    for (const pf of files.pdataFiles) {
      formData.append(`pdata_${pf.name}`, pf, pf.name);
    }

    const res = await fetch(`${API}/runs`, { method: 'POST', body: formData });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '上传失败');
    const { runId } = await res.json();

    // 触发分析
    await fetch(`${API}/runs/${runId}/analyze`, { method: 'POST' });

    // 轮询等待分析完成（最多 60s）
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const detail = await apiFetch<{ run: MapleRun }>(`${API}/runs/${runId}`);
      if (detail.run.status === 'completed') return runId;
      if (detail.run.status === 'failed') throw new Error(`分析失败: ${detail.run.error}`);
    }
    throw new Error('分析超时');
  };

  const doCompare = async () => {
    setLoading(true);
    setResult(null);
    try {
      let finalBaseId = baseRunId;
      let finalOptId = optRunId;

      if (mode === 'upload') {
        const hasBase = baseFiles.perfData || baseFiles.ptrace || baseFiles.pdataFiles.length > 0;
        const hasOpt = optFiles.perfData || optFiles.ptrace || optFiles.pdataFiles.length > 0;
        if (!hasBase || !hasOpt) throw new Error('请至少为每个版本选择一类数据文件');
        [finalBaseId, finalOptId] = await Promise.all([
          uploadAndAnalyze(baseFiles, baseInfo),
          uploadAndAnalyze(optFiles, optInfo),
        ]);
        await fetchRuns(); // 刷新列表
      } else {
        if (!finalBaseId || !finalOptId) throw new Error('请选择 base 和 opt 版本的 run');
      }

      // 生成对比报告
      const res = await apiFetch<{ reportId: string }>(`${API}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseRunId: finalBaseId, optRunId: finalOptId }),
      });
      const full = await apiFetch<CompareReportData>(`${API}/compare/${res.reportId}`);
      setResult(full);
    } catch (e: any) {
      message.error(e.message || '对比分析失败');
    } finally {
      setLoading(false);
    }
  };

  const canCompare = mode === 'existing'
    ? !!baseRunId && !!optRunId && baseRunId !== optRunId
    : (baseFiles.perfData || baseFiles.ptrace || baseFiles.pdataFiles.length > 0) &&
      (optFiles.perfData || optFiles.ptrace || optFiles.pdataFiles.length > 0);

  return (
    <div>
      <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 20 }}>
        <ExperimentOutlined style={{ marginRight: 8 }} />
        Maple ILOpt 性能对比分析
      </h1>

      {/* 选择区域 */}
      <Card
        size="small"
        title="选择对比数据"
        style={{ marginBottom: 16, background: 'var(--bg-card)', borderColor: 'var(--border-primary)', borderRadius: 'var(--radius)' }}
        extra={
          <Space>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>数据来源：</span>
            <Switch
              checkedChildren="已有 Run" unCheckedChildren="上传文件"
              checked={mode === 'existing'}
              onChange={v => setMode(v ? 'existing' : 'upload')}
            />
            <Button icon={<ReloadOutlined />} size="small" onClick={fetchRuns} loading={runsLoading}>刷新 Runs</Button>
          </Space>
        }
      >
        {mode === 'existing' ? (
          <Row gutter={16}>
            <Col span={11}>
              <ExistingRunSelector label="Base 版本（优化前）" runs={runs} value={baseRunId} onChange={setBaseRunId} />
            </Col>
            <Col span={2} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Text type="secondary" style={{ fontSize: 20 }}>VS</Text>
            </Col>
            <Col span={11}>
              <ExistingRunSelector label="Opt 版本（优化后）" runs={runs} value={optRunId} onChange={setOptRunId} />
            </Col>
          </Row>
        ) : (
          <Row gutter={16}>
            <Col span={11}>
              <FileUploadArea
                label="Base 版本（优化前）— 选择数据文件"
                files={baseFiles} onChange={setBaseFiles}
                runInfo={baseInfo} onRunInfoChange={setBaseInfo}
              />
            </Col>
            <Col span={2} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Text type="secondary" style={{ fontSize: 20 }}>VS</Text>
            </Col>
            <Col span={11}>
              <FileUploadArea
                label="Opt 版本（优化后）— 选择数据文件"
                files={optFiles} onChange={setOptFiles}
                runInfo={optInfo} onRunInfoChange={setOptInfo}
              />
            </Col>
          </Row>
        )}

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12, textAlign: 'left' }}
            message="三类数据可任意组合上传"
            description="perf.data 需配合 maple_compare.py 单独分析；.pdata 和 .pftrace 上传后自动解析并展示对比结果。"
          />
          <Button
            type="primary"
            size="large"
            disabled={!canCompare}
            loading={loading}
            onClick={doCompare}
            style={{ minWidth: 200 }}
          >
            {loading ? '分析中...' : '开始对比分析'}
          </Button>
        </div>
      </Card>

      {/* 结果区域 */}
      {result ? (
        <Card
          size="small"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', borderRadius: 'var(--radius)' }}
        >
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card size="small" title="Base 版本">
                <Text strong>{result.base.run.label}</Text>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4 }}>
                  {result.base.run.device} · {result.base.run.scene} · {result.base.run.frameCount ?? '—'} 帧
                </div>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title="Opt 版本">
                <Text strong>{result.opt.run.label}</Text>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4 }}>
                  {result.opt.run.device} · {result.opt.run.scene} · {result.opt.run.frameCount ?? '—'} 帧
                </div>
              </Card>
            </Col>
          </Row>

          <Tabs
            items={[
              {
                key: 'conclusion',
                label: '自动结论',
                children: <ConclusionCard base={result.base} opt={result.opt} />,
              },
              {
                key: 'pdata',
                label: `Unity Profiler 对比${!result.base.pdataResult && !result.opt.pdataResult ? ' (无数据)' : ''}`,
                children: <PdataCompareTab base={result.base.pdataResult} opt={result.opt.pdataResult} />,
              },
              {
                key: 'perfetto',
                label: `perfetto 对比${!result.base.perfettoResult && !result.opt.perfettoResult ? ' (无数据)' : ''}`,
                children: <PerfettoCompareTab base={result.base.perfettoResult} opt={result.opt.perfettoResult} />,
              },
              {
                key: 'simpleperf',
                label: 'simpleperf（见对比分析页）',
                children: (
                  <Alert
                    type="info"
                    showIcon
                    message="simpleperf perf.data 对比结果"
                    description={
                      <div>
                        simpleperf 三级对比（SO 占比 / Anchor 子树 / 函数级 Diff）请在
                        <Button type="link" href="/compare" target="_self" style={{ padding: '0 4px' }}>
                          对比分析页面
                        </Button>
                        中选择对应的 simpleperf session 进行分析。
                        {result.base.run.id && <div style={{ marginTop: 8, color: 'var(--text-tertiary)', fontSize: 12 }}>
                          base runId: {result.base.run.id} · opt runId: {result.opt.run.id}
                        </div>}
                      </div>
                    }
                  />
                ),
              },
              {
                key: 'rawtext',
                label: '完整报告文本',
                children: (
                  <pre style={{
                    background: 'var(--bg-code, #1a1a1a)', color: 'var(--text-code, #d4d4d4)',
                    padding: 16, borderRadius: 6, fontSize: 12, overflowX: 'auto', whiteSpace: 'pre-wrap',
                  }}>
                    {result.report.reportText ?? '（无文本报告）'}
                  </pre>
                ),
              },
            ]}
          />
        </Card>
      ) : !loading ? (
        <Card style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', borderRadius: 'var(--radius)' }}>
          <Empty description="选择 base 和 opt 的数据后点击「开始对比分析」" />
        </Card>
      ) : (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" tip="正在上传并分析数据..." />
        </Card>
      )}
    </div>
  );
};

export default MapleReport;
