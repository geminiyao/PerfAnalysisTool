import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Empty, Input, Segmented, Space, Spin, Table } from 'antd';
import { getRunDetail } from '../services/api';
import { canonicalSource, sourceNames, sourcesOf } from '../../shared/hotspot-report';
import type { Run } from '../../shared/perf-model';

const drilldown: Record<string,string> = {unity_profiler:'/unity-compare', simpleperf:'/simpleperf-diff', perfetto:'/perfetto-triad'};

export default function SourceCompare() {
  const [params] = useSearchParams();
  const base = params.get('base'), current = params.get('current');
  const [runs,setRuns] = useState<Run[]>([]);
  const [error,setError] = useState('');
  const [picked,setPicked] = useState('');
  const [query,setQuery] = useState('');
  useEffect(() => {
    let active = true;
    setRuns([]); setError('');
    if (base && current && base !== current) Promise.all([getRunDetail(base),getRunDetail(current)])
      .then(items => {if (active) setRuns(items.map(i=>i.run));}).catch(e=>{if(active)setError(e.message);});
    return () => {active=false;};
  },[base,current]);
  const common = runs.length ? sourcesOf(runs[0]).filter(s => sourcesOf(runs[1]).includes(s)) : [];
  const source = common.includes(picked) ? picked : common[0];
  const rows = useMemo(() => {
    const values = new Map<string,{key:string;name:string;unit:string;before?:number;after?:number}>();
    runs.forEach((r,i) => {
      for(const m of r.profile.core.metrics.filter(m => canonicalSource(m.source) === source && Number.isFinite(m.value))) {
        const key = JSON.stringify([m.key,m.unit]);
        const v = values.get(key) ?? {key,name:m.key,unit:m.unit};
        v[i === 0 ? 'before' : 'after'] = m.value; values.set(key,v);
      }
    });
    return [...values.values()].filter(v=>v.name.toLowerCase().includes(query.toLowerCase()));
  },[runs,source,query]);
  const mismatch = runs.length && ['device','scene','projectName'].some(k=>{
    const key=k as keyof Run['meta']; return !runs[0].meta[key] || runs[0].meta[key] !== runs[1].meta[key];
  });
  const fmt = (v?:number) => v == null ? '—' : Number(v.toFixed(3)).toLocaleString('zh-CN',{maximumFractionDigits:3});
  return <div className="workspace-page"><div className="page-heading"><h1>同源对比</h1><Link to="/runs">选择采集记录</Link></div>
    {error ? <Alert type="error" message={error} /> : !base || !current || base === current ? <Empty description="请在采集记录中选择两轮不同的采集"><Link to="/runs">选择记录</Link></Empty> :
    !runs.length ? <Spin /> : <><section className="surface"><header><h3>对比条件</h3></header>{runs.map((r,i)=><p key={r.id}>{i?'当前':'基准'}　<Link to={'/runs/'+encodeURIComponent(r.id)}>{r.label || r.id}</Link>　{[r.meta.projectName,r.meta.version,r.meta.device,r.meta.scene].filter(Boolean).join(' / ')}</p>)}
      {!!mismatch && <Alert type="warning" message="项目、设备或场景不一致或缺失，请核对采样条件。" />}
      </section>{common.length ? <><div className="section-title"><h2>指标变化</h2><Segmented value={source} options={common.map(s=>({value:s,label:sourceNames[s]??s}))} onChange={v=>setPicked(String(v))}/></div>
      <section className="surface"><header><Input value={query} aria-label="筛选指标" onChange={e=>setQuery(e.target.value)} placeholder="筛选指标名称" style={{maxWidth:280}} />
        {drilldown[source] && <Link to={drilldown[source]}>用原始文件做专项对比</Link>}</header><Table rowKey="key" size="small" scroll={{x:540}} dataSource={rows} columns={[
        {title:'指标',dataIndex:'name',ellipsis:true},{title:'单位',dataIndex:'unit',width:75},{title:'基准',dataIndex:'before',render:fmt,width:90},
        {title:'当前',dataIndex:'after',render:fmt,width:90},{title:'变化量',width:110,render:(_,r)=>r.before==null || r.after==null ? '—' : fmt(r.after-r.before)+(r.unit==='%'?' pp':'')},
      ]} /></section></> : <Empty description="这两条记录没有共同的数据源" />}</>}
    <div className="section-title"><h2>专项对比</h2></div><Space wrap>{Object.entries(drilldown).map(([s,path])=><Link key={s} to={path}>{sourceNames[s]}</Link>)}</Space>
  </div>;
}
