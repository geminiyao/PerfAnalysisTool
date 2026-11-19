import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Segmented, Select, Spin } from 'antd';
import { ArrowRightOutlined, PlusOutlined, BranchesOutlined, DatabaseOutlined, LineChartOutlined, ClockCircleOutlined } from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { fetchTriadTrends, listRunCohorts, type RunCohort, type TriadTrendsData } from '../services/api';

const sources = ['Unity Profiler', 'simpleperf', 'Perfetto'] as const;
type Source = typeof sources[number];
const sourceIds = { 'Unity Profiler': 'unity_profiler', simpleperf: 'simpleperf', Perfetto: 'perfetto' };
const colors = ['#387cad', '#658a74', '#ce9656', '#56688a', '#8583ad', '#58a2a3', '#97796d', '#627378', '#a4afbd'];
const cohortLabel = (c: RunCohort) => [c.projectName, c.scene, c.label, c.device].join(' / ');

function seriesFor(data: TriadTrendsData, source: Source, morePercentiles = false) {
  if (source === 'Unity Profiler') return [
    { name: 'FPS', values: data.unity.fps },
    { name: '平均帧耗时', values: data.unity.avgMs ?? [] },
    { name: 'P95', values: data.unity.p95Ms },
    ...(morePercentiles ? [
      { name: 'P50', values: data.unity.p50Ms ?? [] },
      { name: 'P99', values: data.unity.p99Ms ?? [] },
    ] : []),
  ];
  const values = source === 'simpleperf' ? data.simpleperf.soPct : data.perfetto.running;
  return Object.entries(values).map(([name, values]) => ({ name, values }));
}

export default function TrendOverview() {
  const [cohorts, setCohorts] = useState<RunCohort[]>([]);
  const [cohort, setCohort] = useState<RunCohort>();
  const [source, setSource] = useState<Source>('Unity Profiler');
  const [data, setData] = useState<TriadTrendsData>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState('');
  const [morePercentiles, setMorePercentiles] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    listRunCohorts().then(({items}) => {
      if (!active) return;
      setCohorts(items);
      setCohort(items.find(c => c.versionCount > 1) ?? items[0]);
      if (!items.length) setLoading(false);
    }).catch(e => { if (active) { setError(e.message); setLoading(false); } });
    return () => { active = false; };
  }, [retry]);
  useEffect(() => {
    if (!cohort) return;
    let active = true;
    setLoading(true); setData(undefined); setVersion(''); setError('');
    fetchTriadTrends(cohort).then(result => {
      if (!active) return;
      setData(result);
      setSource(prev => seriesFor(result, prev).some(s => s.values.some(v => v != null)) ? prev :
        sources.find(src => seriesFor(result, src).some(s => s.values.some(v => v != null))) ?? prev);
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cohort]);

  const versions = data?.versions ?? [];
  const series = data ? seriesFor(data, source, morePercentiles) : [];
  const populated = versions.filter((_, i) => series.some(s => s.values[i] != null));
  const selected = populated.find(v => v.version === version) ?? populated.at(-1);
  const index = versions.findIndex(v => v === selected);
  const peak = series.filter(s => s.name !== '其他' && s.values[index] != null).sort((a,b) => b.values[index]! - a.values[index]!)[0];
  const unity = source === 'Unity Profiler';
  const rows = selected?.sourceRunIds?.[sourceIds[source]] ?? [];
  const kpis = [
    { label: '有效版本', value: data ? populated.length : '—', icon: <BranchesOutlined />, unit: '个' },
    { label: '所选版本样本', value: selected ? rows.length : '—', icon: <DatabaseOutlined />, unit: '轮' },
    { label: unity ? '帧率中位数' : source === 'Perfetto' ? '最高线程 Running 占比' : '最高库采样占比',
      value: (unity ? data?.unity.fps[index] : peak?.values[index])?.toFixed(1) ?? '—', icon: <LineChartOutlined />, unit: unity ? 'FPS' : '%' },
    { label: unity ? '平均帧耗时' : '最高占比项', value: unity ? data?.unity.avgMs?.[index]?.toFixed(2) ?? '—' : peak?.name ?? '—',
      icon: <ClockCircleOutlined />, unit: unity ? 'ms' : '' },
  ];
  const single = populated.length === 1;
  const distribution = series.filter(s => !unity || s.name !== 'FPS').map(s => ({ name: s.name, value: s.values[index] }))
    .filter(row => row.value != null);
  if (!unity) distribution.sort((a,b) => b.value! - a.value!);
  const unit = unity ? 'ms' : '%';
  const singleVersionOption = {
    tooltip: { trigger: 'axis', renderMode: 'richText', valueFormatter: (v:number) => v.toFixed(2)+' '+unit },
    grid: { left: 12, right: 85, top: 26, bottom: 20, containLabel: true },
    xAxis: { type: 'value', name: unit, splitLine: { lineStyle: { type: 'dashed', color: '#e5ecf0' } } },
    yAxis: { type: 'category', inverse: true, data: distribution.map(d => d.name), axisTick: { show: false },
      axisLine: { show: false }, axisLabel: { color: '#4d6578', width: unity ? 70 : 104, overflow: 'truncate' } },
    series: [{ type: 'bar', barMaxWidth: 30, data: distribution.map((d,i) => ({
      value: d.value, itemStyle: { color: colors[i % colors.length], borderRadius: [0,5,5,0] },
    })), label: { show: true, position: 'right', color: '#355064', formatter: (p:{value:number}) => p.value.toFixed(2)+' '+unit } }],
  };
  const option = {
    color: colors, tooltip: { trigger: 'axis', renderMode: 'richText' }, legend: { bottom: 0, type: 'scroll', icon: 'circle' },
    grid: { left: 58, right: unity ? 56 : 28, top: 40, bottom: 70 },
    xAxis: { type: 'category', data: versions.map(v => v.version), boundaryGap: true, axisLabel: { color: '#637586', hideOverlap: true }, axisLine: { lineStyle: { color: '#dbe2e8' } } },
    yAxis: (unity ? ['FPS','ms'] : ['%']).map(name => ({ type: 'value', name, splitLine: { lineStyle: { color: '#e8edf1', type: 'dashed' } } })),
    series: series.map((s,i) => ({ type: 'line', name: s.name, data: s.values, showSymbol: true, symbolSize: 8, yAxisIndex: unity && s.name !== 'FPS' ? 1 : 0,
      lineStyle: { width: 2.5 }, areaStyle: i === 0 ? { opacity: .07 } : undefined })),
  };
  return <div className="workspace-page">
    <div className="page-heading"><h1>趋势总览</h1><Link to="/collect"><Button type="primary" icon={<PlusOutlined />}>新建采集</Button></Link></div>
    <div className="filter-strip"><label>采集条件</label><Select aria-label="采集条件" value={cohort ? cohorts.indexOf(cohort) : undefined}
      showSearch optionFilterProp="label" onChange={i => setCohort(cohorts[i])} placeholder="选择项目、场景与设备"
      options={cohorts.map((c,i) => ({ value:i, label:cohortLabel(c) }))} /></div>
    <div className="kpi-grid">{kpis.map((k,i) => <div key={i} className={'kpi kpi-'+i}><div>{k.label}{k.icon}</div>
      <strong className={typeof k.value === 'string' && k.value.length > 10 ? 'long-value' : ''}>{k.value}</strong><small>{k.unit}</small></div>)}</div>
    <div className="section-title"><h2>版本趋势</h2><Segmented aria-label="数据源" options={[...sources]} value={source} onChange={s => { setSource(s as Source); setVersion(''); }} /></div>
    <section className="surface"><header><h3>{unity ? (single ? '帧耗时' : '帧率与帧耗时') : source === 'Perfetto' ? '线程运行时间占比' : '动态库 CPU 采样占比'}</h3>
      {unity && populated.length > 0 && <Button size="small" aria-pressed={morePercentiles} onClick={() => setMorePercentiles(v => !v)}>
        {morePercentiles ? '收起 P50 / P99' : '展开 P50 / P99'}</Button>}
      <span>{single ? '当前仅一个有效版本，新增同条件版本后可查看变化' : '同条件 · 按版本取中位数'}</span></header>
      {error ? <Alert type="error" showIcon message={error} action={<Button onClick={() => setRetry(v => v+1)}>重试</Button>} /> :
       loading ? <div className="chart-empty"><Spin /></div> : populated.length ? <ReactECharts option={single ? singleVersionOption : option} notMerge style={{height:single && unity ? 240 : 320}} onEvents={single ? {} : { click: (p: { name: string }) => setVersion(p.name) }} /> :
       <Empty description="当前条件下暂无该数据源的有效指标" />}
      {unity && selected && <p className="muted">平均帧耗时按每轮所有帧计算，P95 是 95% 的帧耗时未超过的值。{morePercentiles && 'P50 是中位数，P99 用于观察最慢约 1% 的帧。'}
        {selected.runCount > 1 && '同版本有多轮采集时，每项取各轮结果的中位数。'}</p>}</section>
    {selected && <><div className="section-title"><h2>采集样本</h2><Select aria-label="查看版本样本" value={selected.version} onChange={setVersion}
      options={populated.map(v => ({value:v.version,label:v.version}))} /></div><section className="surface sample-list">{rows.map(id =>
        <Link key={id} to={'/runs/'+encodeURIComponent(id)+'?source='+sourceIds[source]}><span>{id}</span><ArrowRightOutlined /></Link>)}</section></>}
  </div>;
}
