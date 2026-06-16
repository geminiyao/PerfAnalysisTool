import React, { useEffect, useState, useMemo } from 'react';
import { Card, Table, Tag, Empty, message, Select, Button, Tabs, Row, Col, Statistic, Switch, Space, Alert, Input, InputNumber, Tooltip } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useSearchParams } from 'react-router-dom';
import { compareAnalyses, compareDiff, getHistory } from '../services/api';
import type { CompareResult, MetricDiff, DiffResult, MarkerDiff, FrameSummaryDiff, Session } from '../../shared/types';

const shortLibName = (lib?: string) => (lib || '').split(/[\\/]/).pop() || '-';
const deltaColor = (v: number) => v > 0 ? 'var(--color-error)' : v < 0 ? 'var(--color-success)' : 'var(--text-tertiary)';
const flameColor = (v: number, mask?: string) => {
  if (mask === 'A') return '#4096ff';
  if (mask === 'D') return '#8c8c8c';
  if (v > 0) return '#cf1322';
  if (v < 0) return '#237804';
  return '#595959';
};
const maskTag = (mask?: string, deltaMs = 0) => {
  if (mask === 'A') return <Tag color="blue">新增</Tag>;
  if (mask === 'D') return <Tag>删除</Tag>;
  if (deltaMs > 0) return <Tag color="error">恶化</Tag>;
  if (deltaMs < 0) return <Tag color="success">改善</Tag>;
  return <Tag>持平</Tag>;
};
const formatEvent = (v: number) => {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(0);
};
const eventDeltaText = (v: number, pct?: number | null) => {
  const n = Number(v || 0);
  const prefix = n > 0 ? '+' : '';
  const pctText = pct == null ? '' : ` / ${prefix}${Number(pct || 0).toFixed(2)}%`;
  return `${prefix}${formatEvent(n)}${pctText}`;
};

const Compare: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [result, setResult] = useState<CompareResult | null>(null);
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [diffLoading, setDiffLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [onlyMustReport, setOnlyMustReport] = useState(false);
  const [hideUnchanged, setHideUnchanged] = useState(true);
  const [simpleperfSessions, setSimpleperfSessions] = useState<any[]>([]);
  const [simpleperfPair, setSimpleperfPair] = useState<string[]>([]);
  const [simpleperfResult, setSimpleperfResult] = useState<any>(null);
  const [simpleperfLoading, setSimpleperfLoading] = useState(false);
  const [simpleperfFuncQuery, setSimpleperfFuncQuery] = useState('');
  const [simpleperfFuncLib, setSimpleperfFuncLib] = useState<string | undefined>();
  const [simpleperfFuncMask, setSimpleperfFuncMask] = useState<string | undefined>();
  const [simpleperfOnlyDegraded, setSimpleperfOnlyDegraded] = useState(false);
  const [simpleperfMinDelta, setSimpleperfMinDelta] = useState(1);

  useEffect(() => {
    const ids = searchParams.get('ids');
    if (ids) {
      const idList = ids.split(',');
      setSelectedIds(idList);
      doCompare(idList);
    }
    loadSessions();
    loadSimpleperfSessions();
  }, []);

  async function loadSessions() {
    try {
      const res = await getHistory({ status: 'completed', limit: 50 });
      setSessions(res.items);
    } catch {}
  }

  async function loadSimpleperfSessions() {
    try {
      const res = await fetch('/cpu/api/compare/simpleperf/sessions?limit=80');
      const data = await res.json();
      setSimpleperfSessions(data.items || []);
    } catch {}
  }

  async function doCompare(ids: string[]) {
    if (ids.length < 2) return;
    setLoading(true);
    setDiffLoading(true);
    try {
      // 并行发起汇总对比和 marker diff
      const [compareRes, diffRes] = await Promise.allSettled([
        compareAnalyses(ids),
        compareDiff(ids[0], ids[ids.length - 1]),
      ]);
      if (compareRes.status === 'fulfilled') setResult(compareRes.value);
      if (diffRes.status === 'fulfilled') setDiffResult(diffRes.value);
      else if (diffRes.status === 'rejected') message.warning('Marker 对比加载失败: ' + diffRes.reason?.message);
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
      setDiffLoading(false);
    }
  }

  async function doSimpleperfCompare(ids: string[]) {
    if (ids.length !== 2) return;
    setSimpleperfLoading(true);
    try {
      const res = await fetch('/cpu/api/compare/simpleperf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baselineId: ids[0], currentId: ids[1], levels: '123', aggregateByThreadName: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'simpleperf 对比失败' }));
        throw new Error(err.error);
      }
      setSimpleperfResult(await res.json());
    } catch (err: any) {
      message.error(err.message || 'simpleperf 对比失败');
    } finally {
      setSimpleperfLoading(false);
    }
  }

  // 汇总指标表格列
  const summaryColumns = [
    { title: '指标', dataIndex: 'label', key: 'label', width: 160 },
    ...((result?.sessions || []).map((s, idx) => ({
      title: `${s.version || s.fileName} (${idx === 0 ? '基准' : '对比'})`,
      key: `val_${idx}`,
      width: 120,
      render: (_: any, record: MetricDiff) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{record.values[idx]?.toFixed(2)}</span>
      ),
    }))),
    {
      title: '变化',
      key: 'delta',
      width: 120,
      render: (_: any, record: MetricDiff) => {
        const color = record.improved
          ? 'var(--color-success)'
          : record.delta === 0
            ? 'var(--text-tertiary)'
            : 'var(--color-error)';
        const prefix = record.delta > 0 ? '+' : '';
        return (
          <span style={{ color, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            {prefix}{record.delta.toFixed(2)} ({prefix}{record.deltaPercent}%)
          </span>
        );
      },
    },
    {
      title: '趋势',
      key: 'trend',
      width: 80,
      render: (_: any, record: MetricDiff) => {
        if (record.delta === 0) return <Tag>持平</Tag>;
        return record.improved ? <Tag color="success">改善</Tag> : <Tag color="error">恶化</Tag>;
      },
    },
  ];

  // Marker 对比：过滤
  const filteredMarkers = useMemo(() => {
    if (!diffResult) return [];
    let list = diffResult.markerDiffs;
    if (onlyMustReport) list = list.filter(m => m.mustReport);
    if (hideUnchanged) list = list.filter(m => m.status !== 'unchanged');
    return list;
  }, [diffResult, onlyMustReport, hideUnchanged]);

  // Marker 对比表格列
  const markerColumns = [
    {
      title: '状态',
      key: 'status',
      width: 70,
      filters: [
        { text: '恶化', value: 'degraded' },
        { text: '改善', value: 'improved' },
        { text: '新增', value: 'new' },
        { text: '消除', value: 'removed' },
        { text: '持平', value: 'unchanged' },
      ],
      onFilter: (value: any, record: MarkerDiff) => record.status === value,
      render: (_: any, record: MarkerDiff) => {
        const map: Record<string, { color: string; text: string }> = {
          degraded: { color: 'error', text: '恶化' },
          improved: { color: 'success', text: '改善' },
          new: { color: 'blue', text: '新增' },
          removed: { color: 'default', text: '消除' },
          unchanged: { color: 'default', text: '持平' },
        };
        const { color, text } = map[record.status] || { color: 'default', text: record.status };
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: 'Marker',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string, record: MarkerDiff) => (
        <div>
          <span style={{ color: record.mustReport ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: 13 }}>{name}</span>
          {record.mustReport && <Tag color="red" style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px' }}>关键</Tag>}
        </div>
      ),
    },
    {
      title: '线程',
      dataIndex: 'thread',
      key: 'thread',
      width: 120,
      ellipsis: true,
      render: (t: string) => <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{t}</span>,
    },
    {
      title: '基准 selfMean',
      key: 'baseSelf',
      width: 110,
      sorter: (a: MarkerDiff, b: MarkerDiff) => (a.baseline?.selfMean ?? 0) - (b.baseline?.selfMean ?? 0),
      render: (_: any, r: MarkerDiff) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          {r.baseline ? `${r.baseline.selfMean.toFixed(2)}ms` : '-'}
        </span>
      ),
    },
    {
      title: '当前 selfMean',
      key: 'curSelf',
      width: 110,
      sorter: (a: MarkerDiff, b: MarkerDiff) => (a.current?.selfMean ?? 0) - (b.current?.selfMean ?? 0),
      render: (_: any, r: MarkerDiff) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          {r.current ? `${r.current.selfMean.toFixed(2)}ms` : '-'}
        </span>
      ),
    },
    {
      title: '变化',
      key: 'delta',
      width: 130,
      defaultSortOrder: 'descend' as const,
      sorter: (a: MarkerDiff, b: MarkerDiff) => a.delta.selfMean - b.delta.selfMean,
      render: (_: any, r: MarkerDiff) => {
        const d = r.delta.selfMean;
        const dp = r.deltaPercent.selfMean;
        if (r.status === 'new' || r.status === 'removed') return <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
        const color = d < -0.1 ? 'var(--color-success)' : d > 0.1 ? 'var(--color-error)' : 'var(--text-tertiary)';
        const prefix = d > 0 ? '+' : '';
        return (
          <span style={{ color, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            {prefix}{d.toFixed(2)}ms ({prefix}{dp}%)
          </span>
        );
      },
    },
    {
      title: '基准占帧',
      key: 'basePOF',
      width: 90,
      render: (_: any, r: MarkerDiff) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          {r.baseline ? `${r.baseline.percentOfFrame.toFixed(1)}%` : '-'}
        </span>
      ),
    },
    {
      title: '当前占帧',
      key: 'curPOF',
      width: 90,
      render: (_: any, r: MarkerDiff) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          {r.current ? `${r.current.percentOfFrame.toFixed(1)}%` : '-'}
        </span>
      ),
    },
  ];

  // 帧汇总 diff 表格列
  const frameSummaryColumns = [
    { title: '指标', dataIndex: 'label', key: 'label', width: 160 },
    {
      title: '基准', key: 'baseline', width: 100,
      render: (_: any, r: FrameSummaryDiff) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{r.baseline.toFixed(2)}</span>
      ),
    },
    {
      title: '当前', key: 'current', width: 100,
      render: (_: any, r: FrameSummaryDiff) => (
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{r.current.toFixed(2)}</span>
      ),
    },
    {
      title: '变化',
      key: 'delta',
      width: 130,
      render: (_: any, r: FrameSummaryDiff) => {
        const color = r.improved
          ? 'var(--color-success)'
          : r.delta === 0
            ? 'var(--text-tertiary)'
            : 'var(--color-error)';
        const prefix = r.delta > 0 ? '+' : '';
        return (
          <span style={{ color, fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            {prefix}{r.delta.toFixed(2)} ({prefix}{r.deltaPercent}%)
          </span>
        );
      },
    },
    {
      title: '趋势',
      key: 'trend',
      width: 80,
      render: (_: any, r: FrameSummaryDiff) => {
        if (Math.abs(r.delta) < 0.01) return <Tag>持平</Tag>;
        return r.improved ? <Tag color="success">改善</Tag> : <Tag color="error">恶化</Tag>;
      },
    },
  ];

  const jc = diffResult?.jankComparison;

  const simpleperfFuncItems = simpleperfResult?.level3?.items || [];
  const simpleperfFuncLibOptions = useMemo(() => {
    const libs = new Set<string>();
    for (const item of simpleperfFuncItems) {
      for (const fn of item.functions || []) libs.add(shortLibName(fn.lib));
    }
    return Array.from(libs).filter(Boolean).sort().map(lib => ({ label: lib, value: lib }));
  }, [simpleperfFuncItems]);

  const filteredSimpleperfFuncItems = useMemo(() => {
    const query = simpleperfFuncQuery.trim().toLowerCase();
    return simpleperfFuncItems.map((item: any) => {
      const functions = (item.functions || []).filter((fn: any) => {
        const delta = Number(fn.delta_ms || 0);
        if (Math.abs(delta) < simpleperfMinDelta) return false;
        if (simpleperfOnlyDegraded && delta <= 0) return false;
        if (simpleperfFuncMask && fn.mask !== simpleperfFuncMask) return false;
        if (simpleperfFuncLib && shortLibName(fn.lib) !== simpleperfFuncLib) return false;
        if (query && !`${fn.func || ''} ${fn.lib || ''} ${item.thread_anchor || ''}`.toLowerCase().includes(query)) return false;
        return true;
      });
      return { ...item, functions, function_count: functions.length };
    }).filter((item: any) => item.functions.length > 0 || (!query && !simpleperfFuncLib && !simpleperfFuncMask && !simpleperfOnlyDegraded));
  }, [simpleperfFuncItems, simpleperfFuncQuery, simpleperfFuncLib, simpleperfFuncMask, simpleperfOnlyDegraded, simpleperfMinDelta]);

  const simpleperfFlatFunctions = useMemo(() => filteredSimpleperfFuncItems.flatMap((item: any) =>
    (item.functions || []).map((fn: any) => ({ ...fn, thread_anchor: item.thread_anchor }))
  ), [filteredSimpleperfFuncItems]);

  const simpleperfFlameOption = useMemo(() => {
    const children = filteredSimpleperfFuncItems.map((item: any) => ({
      name: item.thread_anchor,
      value: Math.max(Math.abs(Number(item.delta_ms || 0)), 0.001),
      itemStyle: { color: flameColor(Number(item.delta_ms || 0), item.mask) },
      raw: item,
      children: (item.functions || []).slice(0, 80).map((fn: any) => ({
        name: fn.func,
        value: Math.max(Math.abs(Number(fn.delta_ms || 0)), 0.001),
        itemStyle: { color: flameColor(Number(fn.delta_ms || 0), fn.mask) },
        raw: { ...fn, thread_anchor: item.thread_anchor },
      })),
    }));
    return {
      backgroundColor: 'transparent',
      tooltip: {
        formatter: (info: any) => {
          const r = info.data?.raw || {};
          const delta = Number(r.delta_ms || 0);
          const pct = r.delta_pct == null ? '-' : `${Number(r.delta_pct || 0).toFixed(2)}%`;
          const thread = r.thread_anchor ?? info.name;
          return `<div style="max-width:520px;white-space:normal"><b>${info.name}</b><br/>线程: ${thread}<br/>SO: ${shortLibName(r.lib)}<br/>变化: ${delta > 0 ? '+' : ''}${delta.toFixed(3)}ms<br/>占比: ${pct}<br/>状态: ${r.mask || '-'}</div>`;
        },
      },
      series: [{
        type: 'treemap',
        roam: false,
        nodeClick: 'zoomToNode',
        breadcrumb: { show: true, top: 0 },
        top: 28,
        left: 0,
        right: 0,
        bottom: 0,
        data: children,
        label: { show: true, formatter: '{b}', color: '#fff', overflow: 'truncate' },
        upperLabel: { show: true, height: 22, color: '#fff' },
        levels: [
          { itemStyle: { borderColor: 'rgba(255,255,255,0.18)', borderWidth: 2, gapWidth: 2 } },
          { itemStyle: { borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1, gapWidth: 1 } },
        ],
      }],
    };
  }, [filteredSimpleperfFuncItems]);

  const simpleperfThreadColumns = [
    { title: '线程', dataIndex: 'name', key: 'name', width: 180, ellipsis: true },
    { title: '最大 SO 占比变化', dataIndex: 'maxDelta', key: 'maxDelta', width: 140, render: (v: number) => <span style={{ fontFamily: 'var(--font-mono)' }}>{Number(v || 0).toFixed(2)}%</span> },
    { title: '主要恶化 SO', key: 'degraded', render: (_: any, r: any) => (r.topDegraded || []).map((l: any) => <Tag color="error" key={l.name}>{l.name} +{Number(l.delta_pct || 0).toFixed(2)}%</Tag>) },
    { title: '主要改善 SO', key: 'improved', render: (_: any, r: any) => (r.topImproved || []).map((l: any) => <Tag color="success" key={l.name}>{l.name} {Number(l.delta_pct || 0).toFixed(2)}%</Tag>) },
  ];

  const simpleperfLibColumns = [
    { title: 'SO', dataIndex: 'name', key: 'name', width: 220, ellipsis: true },
    { title: '基准占比', dataIndex: 'baseline_pct', key: 'baseline_pct', width: 100, render: (v: number) => `${Number(v || 0).toFixed(2)}%` },
    { title: '当前占比', dataIndex: 'current_pct', key: 'current_pct', width: 100, render: (v: number) => `${Number(v || 0).toFixed(2)}%` },
    { title: '占比变化', dataIndex: 'delta_pct', key: 'delta_pct', width: 100, defaultSortOrder: 'descend' as const, sorter: (a: any, b: any) => Number(a.delta_pct || 0) - Number(b.delta_pct || 0), render: (v: number) => <span style={{ color: Number(v) > 0 ? 'var(--color-error)' : Number(v) < 0 ? 'var(--color-success)' : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{Number(v || 0) > 0 ? '+' : ''}{Number(v || 0).toFixed(2)}%</span> },
    { title: '绝对 event 变化', dataIndex: 'delta_event', key: 'delta_event', width: 150, sorter: (a: any, b: any) => Math.abs(Number(a.delta_event || 0)) - Math.abs(Number(b.delta_event || 0)), render: (v: number, r: any) => <Tooltip title={`基准 ${formatEvent(r.baseline_event)} / 当前 ${formatEvent(r.current_event)}`}><span style={{ color: deltaColor(Number(v || 0)), fontFamily: 'var(--font-mono)' }}>{eventDeltaText(v, r.delta_event_pct)}</span></Tooltip> },
  ];

  const simpleperfSoColumns = [
    { title: 'SO', dataIndex: 'name', key: 'name', width: 220, ellipsis: true },
    { title: '基准全局占比', dataIndex: 'baseline_pct', key: 'baseline_pct', width: 120, render: (v: number) => `${Number(v || 0).toFixed(2)}%` },
    { title: '当前全局占比', dataIndex: 'current_pct', key: 'current_pct', width: 120, render: (v: number) => `${Number(v || 0).toFixed(2)}%` },
    { title: '全局占比变化', dataIndex: 'delta_pct', key: 'delta_pct', width: 120, defaultSortOrder: 'descend' as const, sorter: (a: any, b: any) => Math.abs(Number(a.delta_pct || 0)) - Math.abs(Number(b.delta_pct || 0)), render: (v: number) => <span style={{ color: Number(v) > 0 ? 'var(--color-error)' : Number(v) < 0 ? 'var(--color-success)' : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{Number(v || 0) > 0 ? '+' : ''}{Number(v || 0).toFixed(2)}%</span> },
    { title: '绝对 event 变化', dataIndex: 'delta_event', key: 'delta_event', width: 160, sorter: (a: any, b: any) => Math.abs(Number(a.delta_event || 0)) - Math.abs(Number(b.delta_event || 0)), render: (v: number, r: any) => <Tooltip title={`基准 ${formatEvent(r.baseline_event)} / 当前 ${formatEvent(r.current_event)}`}><span style={{ color: deltaColor(Number(v || 0)), fontFamily: 'var(--font-mono)' }}>{eventDeltaText(v, r.delta_event_pct)}</span></Tooltip> },
    { title: '涉及线程数', dataIndex: 'thread_count', key: 'thread_count', width: 100 },
    { title: '线程内占比变化 Top', key: 'topThreads', render: (_: any, r: any) => (r.topThreads || []).map((t: any) => <Tooltip key={`${r.name}-${t.name}`} title={`线程内占比: ${Number(t.baseline_pct || 0).toFixed(2)}% → ${Number(t.current_pct || 0).toFixed(2)}%；绝对 event: ${formatEvent(t.baseline_event)} → ${formatEvent(t.current_event)}，${eventDeltaText(t.delta_event, t.delta_event_pct)}`}><Tag color={Number(t.delta_pct) > 0 ? 'error' : Number(t.delta_pct) < 0 ? 'success' : 'default'}>{t.name} 线程内 {Number(t.delta_pct || 0) > 0 ? '+' : ''}{Number(t.delta_pct || 0).toFixed(2)}%</Tag></Tooltip>) },
  ];

  const simpleperfAnchorColumns = [
    { title: 'Anchor', dataIndex: 'name', key: 'name', ellipsis: true },
    { title: '基准 ms', dataIndex: 'baseline_ms', key: 'baseline_ms', width: 110, render: (v: number) => Number(v || 0).toFixed(2) },
    { title: '当前 ms', dataIndex: 'current_ms', key: 'current_ms', width: 110, render: (v: number) => Number(v || 0).toFixed(2) },
    { title: '变化', dataIndex: 'delta_pct', key: 'delta_pct', width: 110, render: (v: number) => <span style={{ color: Number(v) > 0 ? 'var(--color-error)' : Number(v) < 0 ? 'var(--color-success)' : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{Number(v || 0) > 0 ? '+' : ''}{Number(v || 0).toFixed(2)}%</span> },
  ];

  const simpleperfFuncThreadColumns = [
    { title: '线程 Anchor', dataIndex: 'thread_anchor', key: 'thread_anchor', ellipsis: true },
    { title: '状态', key: 'mask', width: 90, render: (_: any, r: any) => maskTag(r.mask, Number(r.delta_ms || 0)) },
    { title: '变化 ms', dataIndex: 'delta_ms', key: 'delta_ms', width: 120, defaultSortOrder: 'descend' as const, sorter: (a: any, b: any) => Math.abs(Number(a.delta_ms || 0)) - Math.abs(Number(b.delta_ms || 0)), render: (v: number) => <span style={{ color: deltaColor(Number(v || 0)), fontFamily: 'var(--font-mono)' }}>{Number(v || 0) > 0 ? '+' : ''}{Number(v || 0).toFixed(3)}</span> },
    { title: 'Anchor 总耗时 ms', dataIndex: 'abs_ms', key: 'abs_ms', width: 140, render: (v: number) => v == null ? '-' : <span style={{ fontFamily: 'var(--font-mono)' }}>{Number(v || 0).toFixed(3)}</span> },
    { title: '命中方法数', dataIndex: 'function_count', key: 'function_count', width: 110 },
  ];

  const simpleperfFuncColumns = [
    { title: '状态', key: 'mask', width: 90, render: (_: any, r: any) => maskTag(r.mask, Number(r.delta_ms || 0)) },
    { title: '方法/函数', dataIndex: 'func', key: 'func', ellipsis: true, render: (v: string, r: any) => <Space size={4}><Tooltip title={v}><span>{v}</span></Tooltip>{r.maybe_inlined && <Tag color="warning">疑似内联</Tag>}</Space> },
    { title: 'SO', dataIndex: 'lib', key: 'lib', width: 180, ellipsis: true, render: (v: string) => <Tooltip title={v}>{shortLibName(v)}</Tooltip> },
    { title: '变化 ms', dataIndex: 'delta_ms', key: 'delta_ms', width: 120, defaultSortOrder: 'descend' as const, sorter: (a: any, b: any) => Math.abs(Number(a.delta_ms || 0)) - Math.abs(Number(b.delta_ms || 0)), render: (v: number) => <span style={{ color: deltaColor(Number(v || 0)), fontFamily: 'var(--font-mono)' }}>{Number(v || 0) > 0 ? '+' : ''}{Number(v || 0).toFixed(3)}</span> },
    { title: '相对 Anchor', dataIndex: 'delta_pct', key: 'delta_pct', width: 120, sorter: (a: any, b: any) => Math.abs(Number(a.delta_pct || 0)) - Math.abs(Number(b.delta_pct || 0)), render: (v: number) => v == null ? '-' : <span style={{ color: deltaColor(Number(v || 0)), fontFamily: 'var(--font-mono)' }}>{Number(v || 0) > 0 ? '+' : ''}{Number(v || 0).toFixed(2)}%</span> },
  ];

  const simpleperfFuncFilters = (
    <div style={{ marginBottom: 12, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <Input.Search allowClear placeholder="搜索方法 / SO / 线程" value={simpleperfFuncQuery} onChange={(e) => setSimpleperfFuncQuery(e.target.value)} style={{ width: 260 }} />
      <Select allowClear placeholder="SO 过滤" value={simpleperfFuncLib} onChange={setSimpleperfFuncLib} options={simpleperfFuncLibOptions} style={{ width: 180 }} />
      <Select allowClear placeholder="状态" value={simpleperfFuncMask} onChange={setSimpleperfFuncMask} style={{ width: 120 }} options={[{ label: '新增', value: 'A' }, { label: '修改', value: 'M' }, { label: '删除', value: 'D' }]} />
      <Space>
        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>只看恶化</span>
        <Switch size="small" checked={simpleperfOnlyDegraded} onChange={setSimpleperfOnlyDegraded} />
      </Space>
      <Space>
        <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>最小变化 ms</span>
        <InputNumber min={0} max={1000} step={0.5} value={simpleperfMinDelta} onChange={(v) => setSimpleperfMinDelta(Number(v || 0))} style={{ width: 100 }} />
      </Space>
      <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>显示 {simpleperfFlatFunctions.length} 个方法</span>
    </div>
  );

  const monoValue: React.CSSProperties = { fontFamily: 'var(--font-mono)' };

  return (
    <div>
      <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 24 }}>对比分析</h1>

      <Card size="small" title="Native simpleperf A/B 对比（重点）" style={{ marginBottom: 16, background: 'var(--bg-card)', borderColor: 'var(--border-primary)', borderRadius: 'var(--radius)' }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="当前复用 simpleperf/scripts/compare.py 的三层对比结果"
          description="火焰图建议沿用 report_html.py / folded stack 产物，不在 P3 重新造火焰图算法；A/B 对比优先看 Level 1 线程内 SO 占比变化、Level 2 Anchor 子树耗时变化、Level 3 函数级差异。"
        />
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Select
            mode="multiple"
            placeholder="选择 2 个 completed simpleperf 结果：第一个为基准，第二个为当前"
            value={simpleperfPair}
            onChange={(ids) => setSimpleperfPair(ids.slice(-2))}
            style={{ flex: 1 }}
            maxCount={2}
            options={simpleperfSessions.map(s => ({
              label: `${s.fileName} - ${s.version || '无版本'} / ${s.scene || '无场景'} (${new Date(s.createdAt).toLocaleString()})`,
              value: s.id,
            }))}
          />
          <Button
            type="primary"
            disabled={simpleperfPair.length !== 2}
            onClick={() => doSimpleperfCompare(simpleperfPair)}
            loading={simpleperfLoading}
          >
            开始 simpleperf A/B 对比
          </Button>
        </div>
      </Card>

      {simpleperfResult && (
        <Card size="small" title="simpleperf A/B 对比结果" style={{ marginBottom: 16, background: 'var(--bg-card)', borderColor: 'var(--border-primary)', borderRadius: 'var(--radius)' }}>
          <Row gutter={[12, 12]} style={{ marginBottom: 12 }}>
            <Col span={12}>
              <Card size="small" title="Baseline">
                <div>{simpleperfResult.baseline?.fileName}</div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{simpleperfResult.baseline?.version || '-'} · {simpleperfResult.baseline?.scene || '-'}</div>
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title="Current">
                <div>{simpleperfResult.current?.fileName}</div>
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{simpleperfResult.current?.version || '-'} · {simpleperfResult.current?.scene || '-'}</div>
              </Card>
            </Col>
          </Row>
          <Tabs
            items={[
              {
                key: 'sp_so_summary',
                label: `SO 汇总对比 (${simpleperfResult.level1?.soSummary?.length || 0})`,
                children: <Table rowKey="full_path" columns={simpleperfSoColumns as any} dataSource={simpleperfResult.level1?.soSummary || []} pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'] }} size="small" />,
              },
              {
                key: 'sp_threads',
                label: `线程/SO 对比 (${simpleperfResult.level1?.threads?.length || 0})`,
                children: <Table rowKey="name" columns={simpleperfThreadColumns as any} dataSource={simpleperfResult.level1?.threads || []} expandable={{ expandedRowRender: (record: any) => <Table rowKey="full_path" columns={simpleperfLibColumns as any} dataSource={record.libs || []} pagination={false} size="small" /> }} pagination={{ pageSize: 10 }} size="small" />,
              },
              {
                key: 'sp_anchors',
                label: `Anchor 对比 (${simpleperfResult.level2?.anchors?.length || 0})`,
                children: <Table rowKey="name" columns={simpleperfAnchorColumns as any} dataSource={simpleperfResult.level2?.anchors || []} pagination={{ pageSize: 20 }} size="small" />,
              },
              {
                key: 'sp_funcs',
                label: `方法对比 (${simpleperfFlatFunctions.length})`,
                children: (
                  <Card size="small">
                    {simpleperfFuncFilters}
                    <Table
                      rowKey={(r: any) => r.thread_anchor}
                      columns={simpleperfFuncThreadColumns as any}
                      dataSource={filteredSimpleperfFuncItems}
                      expandable={{
                        expandedRowRender: (record: any) => (
                          <Table
                            rowKey={(r: any) => `${record.thread_anchor}-${r.func}-${r.lib}`}
                            columns={simpleperfFuncColumns as any}
                            dataSource={record.functions || []}
                            pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'] }}
                            size="small"
                          />
                        ),
                        rowExpandable: (record: any) => (record.functions || []).length > 0,
                      }}
                      pagination={{ pageSize: 10 }}
                      size="small"
                    />
                  </Card>
                ),
              },
              {
                key: 'sp_func_text',
                label: '缩进树原文',
                children: (
                  <Card size="small">
                    <Alert type="info" showIcon style={{ marginBottom: 12 }}
                      message="func_compare.py 原始缩进方法树"
                      description="格式：[A/M/D] 函数名 delta_ms (±pct%)，[maybe_inlined] 表示疑似内联消失。A=新增/M=变化/D=删除。" />
                    {simpleperfResult?.level3?.text ? (
                      <pre style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        lineHeight: 1.6,
                        background: 'var(--bg-code, #1a1a2e)',
                        color: 'var(--text-code, #e2e8f0)',
                        padding: '12px 16px',
                        borderRadius: 6,
                        overflowX: 'auto',
                        whiteSpace: 'pre',
                        maxHeight: 600,
                        overflowY: 'auto',
                      }}>
                        {simpleperfResult.level3.text}
                      </pre>
                    ) : <Empty description="无原始文本（level3.text 为空）" />}
                  </Card>
                ),
              },
              {
                key: 'sp_flame_diff',
                label: '火焰图对比',
                children: (
                  <Card size="small">
                    {simpleperfFuncFilters}
                    {simpleperfFlatFunctions.length > 0 ? (
                      <>
                        <Alert
                          type="info"
                          showIcon
                          style={{ marginBottom: 12 }}
                          message="当前为基于 level3_func_diff 的差异火焰图"
                          description="矩形面积表示绝对变化耗时，红色为恶化、绿色为改善、蓝色为新增、灰色为删除；点击块可下钻到线程 Anchor。"
                        />
                        <ReactECharts option={simpleperfFlameOption} style={{ height: 560 }} notMerge />
                      </>
                    ) : <Empty description="当前筛选条件下没有方法差异" />}
                  </Card>
                ),
              },
              {
                key: 'sp_summary',
                label: '结论摘要',
                children: (
                  <Card size="small">
                    {Object.keys(simpleperfResult.summary || {}).length > 0 ? Object.entries(simpleperfResult.summary).map(([k, v]) => (
                      <Tag key={k} color={Number(v) > 0 ? 'error' : Number(v) < 0 ? 'success' : 'default'} style={{ marginBottom: 8 }}>{k}: {String(v)}</Tag>
                    )) : <Empty description="compare.py 未生成摘要，可查看线程/SO 与 Anchor 对比" />}
                  </Card>
                ),
              },
            ]}
          />
        </Card>
      )}

      {/* Profiler 选择器 */}
      <Card size="small" title="Profiler .pdata 对比" style={{ marginBottom: 16, background: 'var(--bg-card)', borderColor: 'var(--border-primary)', borderRadius: 'var(--radius)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Select
            mode="multiple"
            placeholder="选择 2-4 个已完成的分析进行对比"
            value={selectedIds}
            onChange={setSelectedIds}
            style={{ flex: 1 }}
            maxCount={4}
            options={sessions.map(s => ({
              label: `${s.fileName} - ${s.version || '无版本'} (${new Date(s.createdAt).toLocaleDateString()})`,
              value: s.id,
            }))}
          />
          <Button
            type="primary"
            disabled={selectedIds.length < 2}
            onClick={() => doCompare(selectedIds)}
            loading={loading}
          >
            开始对比
          </Button>
        </div>
      </Card>

      {/* 结果区域 */}
      {(result || diffResult) ? (
        <Tabs
          defaultActiveKey="summary"
          items={[
            // 汇总指标 Tab
            result ? {
              key: 'summary',
              label: '汇总指标',
              children: (
                <Card style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', borderRadius: 'var(--radius)' }}>
                  <Table
                    rowKey="metric"
                    columns={summaryColumns}
                    dataSource={result.diffs}
                    pagination={false}
                    size="small"
                  />
                </Card>
              ),
            } : null,

            // Marker 对比 Tab
            diffResult ? {
              key: 'markers',
              label: `Marker 对比 (${filteredMarkers.length})`,
              children: (
                <Card style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', borderRadius: 'var(--radius)' }}>
                  {/* 筛选控件 */}
                  <div style={{ marginBottom: 12, display: 'flex', gap: 16, alignItems: 'center' }}>
                    <Space>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>只看关键 Marker</span>
                      <Switch size="small" checked={onlyMustReport} onChange={setOnlyMustReport} />
                    </Space>
                    <Space>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>隐藏持平</span>
                      <Switch size="small" checked={hideUnchanged} onChange={setHideUnchanged} />
                    </Space>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                      共 {diffResult.markerDiffs.length} 个 Marker，显示 {filteredMarkers.length} 个
                    </span>
                  </div>
                  <Table
                    rowKey={(r) => `${r.name}||${r.thread}`}
                    columns={markerColumns as any}
                    dataSource={filteredMarkers}
                    pagination={{ pageSize: 30, showSizeChanger: true, pageSizeOptions: ['20', '30', '50', '100'] }}
                    size="small"
                    scroll={{ x: 900 }}
                    rowClassName={(r) =>
                      r.status === 'degraded' ? 'row-degraded' : r.status === 'improved' ? 'row-improved' : ''
                    }
                  />
                </Card>
              ),
            } : null,

            // Jank 对比 Tab
            jc ? {
              key: 'jank',
              label: 'Jank 对比',
              children: (
                <div>
                  <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                    <Col span={8}>
                      <Card size="small" title="Jank 次数" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', borderRadius: 'var(--radius)' }}>
                        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                          <Statistic title="基准" value={jc.baseline.count} valueStyle={monoValue} />
                          <span style={{ fontSize: 20, color: 'var(--text-tertiary)' }}>→</span>
                          <Statistic
                            title="当前"
                            value={jc.current.count}
                            valueStyle={{
                              ...monoValue,
                              color: jc.current.count < jc.baseline.count
                                ? 'var(--color-success)'
                                : jc.current.count > jc.baseline.count
                                  ? 'var(--color-error)'
                                  : undefined,
                            }}
                          />
                          <Tag color={jc.current.count <= jc.baseline.count ? 'success' : 'error'}>
                            {jc.current.count - jc.baseline.count > 0 ? '+' : ''}{jc.current.count - jc.baseline.count}
                          </Tag>
                        </div>
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card size="small" title="BigJank 次数" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', borderRadius: 'var(--radius)' }}>
                        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                          <Statistic title="基准" value={jc.baseline.bigJankCount} valueStyle={monoValue} />
                          <span style={{ fontSize: 20, color: 'var(--text-tertiary)' }}>→</span>
                          <Statistic
                            title="当前"
                            value={jc.current.bigJankCount}
                            valueStyle={{
                              ...monoValue,
                              color: jc.current.bigJankCount < jc.baseline.bigJankCount
                                ? 'var(--color-success)'
                                : jc.current.bigJankCount > jc.baseline.bigJankCount
                                  ? 'var(--color-error)'
                                  : undefined,
                            }}
                          />
                          <Tag color={jc.current.bigJankCount <= jc.baseline.bigJankCount ? 'success' : 'error'}>
                            {jc.current.bigJankCount - jc.baseline.bigJankCount > 0 ? '+' : ''}{jc.current.bigJankCount - jc.baseline.bigJankCount}
                          </Tag>
                        </div>
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card size="small" title="总帧数" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', borderRadius: 'var(--radius)' }}>
                        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                          <Statistic title="基准" value={jc.baseline.totalFrames} valueStyle={monoValue} />
                          <span style={{ fontSize: 20, color: 'var(--text-tertiary)' }}>→</span>
                          <Statistic title="当前" value={jc.current.totalFrames} valueStyle={monoValue} />
                        </div>
                      </Card>
                    </Col>
                  </Row>

                  {/* 帧汇总 diff */}
                  {diffResult?.frameSummaryDiffs && (
                    <Card size="small" title="帧汇总指标对比" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', borderRadius: 'var(--radius)' }}>
                      <Table
                        rowKey="metric"
                        columns={frameSummaryColumns}
                        dataSource={diffResult.frameSummaryDiffs}
                        pagination={false}
                        size="small"
                      />
                    </Card>
                  )}
                </div>
              ),
            } : null,
          ].filter(Boolean) as any[]}
        />
      ) : (
        <Card style={{ background: 'var(--bg-card)', borderColor: 'var(--border-primary)', borderRadius: 'var(--radius)' }}>
          <Empty description="选择至少两个分析结果进行对比" />
        </Card>
      )}
    </div>
  );
};

export default Compare;
