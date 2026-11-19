import { useEffect, useState, type ComponentType } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Button, Empty, Input, Radio, Space, Spin, Tag } from 'antd';
import { ArrowUpOutlined, SearchOutlined } from '@ant-design/icons';
import { monthlyReports, monthLabel, periodBounds, periods, reportDay, type Period } from './report-dates';
import './PerformanceReports.css';

interface PublishedReport { id:string; title:string; collectedAt:string; model:string; version:string; quality:string; href:string; summary:string; sources:string[] }

export interface ReportFilters { query: string; bounds: ReturnType<typeof periodBounds> }

export default function PerformanceReports({ savedReports: SavedReports }: { savedReports?: ComponentType<ReportFilters> }) {
  const [catalog,setCatalog] = useState<PublishedReport[]>([]);
  const [loading,setLoading] = useState(true);
  const [query,setQuery] = useState('');
  const [attempt,setAttempt] = useState(0);
  const [failed,setFailed] = useState(false);
  const [params, setParams] = useSearchParams();
  const period = periods.find(p => p.value === params.get('period'))?.value ?? 'all';
  function selectPeriod(value: Period) {
    const next = new URLSearchParams(params);
    if (value === 'all') next.delete('period');
    else next.set('period', value);
    setParams(next);
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setFailed(false);
    fetch('/cpu/report/catalog.json', { cache: 'no-cache', signal: controller.signal })
      .then(async r => {
        if (!r.ok) throw Error('历史报告目录加载失败');
        const entries = await r.json();
        if (!Array.isArray(entries)) throw Error('目录格式无效');
        if (!controller.signal.aborted) setCatalog(entries);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[attempt]);
  const match = (v:string) => v.toLowerCase().includes(query.trim().toLowerCase());
  const bounds = periodBounds(period, reportDay(Date.now()));
  const published = monthlyReports(catalog.filter(r => match([r.title,r.model,r.version,...r.sources].join(' '))), r => r.collectedAt, bounds);
  return <div className="report-directory"><div className="page-heading"><h1>性能报告</h1><Input aria-label="搜索报告" prefix={<SearchOutlined />} placeholder="搜索报告、版本或数据源" allowClear value={query} onChange={e=>setQuery(e.target.value)} style={{maxWidth:300}} /></div>
    <Space wrap>
      <Radio.Group aria-label="报告日期" value={period} onChange={e => selectPeriod(e.target.value)}
        optionType="button" buttonStyle="solid" options={[...periods]} />
      {bounds && <span className="muted">{bounds.start === bounds.end ? bounds.start : bounds.start + ' 至 ' + bounds.end}</span>}
    </Space>
    {failed && <Alert showIcon type="warning" message="历史报告目录加载失败" action={<Button onClick={()=>setAttempt(v=>v+1)}>重试</Button>} />}
    {loading ? <Spin /> : <>
      <div className="section-title"><h2>历史专题</h2><span className="muted">按采集日 · {published.count} 份报告</span></div>
      {published.groups.map(([month, entries]) => <section key={month}>
        <h3 className="report-month">{monthLabel(month)}</h3>
        <div className="report-grid">{entries.map(r => <article key={r.id} className="surface report-tile">
          <time dateTime={reportDay(r.collectedAt) || undefined}>{r.collectedAt}</time><h3>{r.title}</h3><p>{r.summary}</p>
          <Space wrap>{r.sources.map(s => <Tag key={s}>{s}</Tag>)}</Space><p>{r.model} · {r.version} · {r.quality}</p>
          <footer><a className="open-report" href={r.href} target="_blank" rel="noopener noreferrer">打开报告 <ArrowUpOutlined rotate={45} /></a></footer>
        </article>)}</div>
      </section>)}
      {!published.count && !failed && <Empty description="没有匹配的历史报告" />}
    </>}
    {SavedReports && <SavedReports query={query} bounds={bounds} />}
  </div>;
}
