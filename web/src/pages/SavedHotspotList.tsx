import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Spin } from 'antd';
import { sourceNames, type ReportEntry } from '../../shared/hotspot-report';
import { listHotspotReports } from '../services/api';
import { monthlyReports, monthLabel, savedReportTime } from './report-dates';
import type { ReportFilters } from './PerformanceReports';

export default function SavedHotspotList({ query, bounds }: ReportFilters) {
  const [entries, setEntries] = useState<ReportEntry[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState('loading');
    listHotspotReports().then(rows => {
      if (active) { setEntries(rows); setState('ready'); }
    }).catch(() => { if (active) setState('failed'); });
    return () => { active = false; };
  }, [attempt]);

  const term = query.trim().toLowerCase();
  const matches = entries.filter(r => [r.title, r.runId, r.source, sourceNames[r.source]].join(' ').toLowerCase().includes(term));
  const reports = monthlyReports(matches, r => r.createdAt, bounds);
  return <>
    <div className="section-title"><h2>热点报告</h2>{state === 'ready' && <span className="muted">按保存日 · {reports.count} 份报告</span>}</div>
    {state === 'loading' && <Spin />}
    {state === 'failed' && <Alert showIcon type="warning" message="热点报告目录加载失败" action={<Button onClick={() => setAttempt(v => v + 1)}>重试</Button>} />}
    {state === 'ready' && reports.groups.map(([month, rows]) => <section key={month}>
      <h3 className="report-month">{monthLabel(month)}</h3>
      <div className="surface sample-list">{rows.map(r =>
        <Link key={r.id} to={'/performance-reports/' + r.id}><span><strong>{r.title}</strong><br/><small>{r.runId}</small></span>
          <span>{sourceNames[r.source] ?? r.source} · {savedReportTime(r.createdAt) || '日期未记录'}</span></Link>)}</div>
    </section>)}
    {state === 'ready' && !reports.count && <div className="surface">
      <Empty description={term || bounds ? '没有匹配的热点报告' : '暂无已保存的热点报告'}><Link to="/runs">查看采集记录</Link></Empty>
    </div>}
  </>;
}
