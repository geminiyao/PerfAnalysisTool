import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Button, Spin } from 'antd';
import ReactMarkdown from 'react-markdown';
import type { Report } from '../../shared/perf-model';
import { getSavedHotspotReport } from '../services/api';
import { downloadTextFile } from '../utils/download';

export default function SavedHotspotReport() {
  const { id = '' } = useParams();
  const [saved,setSaved] = useState<{runId:string;source:string;report:Report}>();
  const [error,setError] = useState('');
  useEffect(() => {
    let active = true; setSaved(undefined);setError('');
    getSavedHotspotReport(id).then(v=>{if(active)setSaved(v);}).catch(e=>{if(active)setError(e.message);});
    return () => {active=false;};
  },[id]);
  if (error) return <Alert type="error" message={error} />;
  if (!saved) return <Spin />;
  return <div className="workspace-page"><div className="page-heading"><Link to="/performance-reports">返回性能报告</Link><Button onClick={()=>downloadTextFile(id+'.md',saved.report.markdown)}>下载 Markdown</Button></div>
    <article className="surface markdown-body saved-report"><ReactMarkdown>{saved.report.markdown}</ReactMarkdown></article>
    <p><Link to={'/runs/'+encodeURIComponent(saved.runId)+'?source='+encodeURIComponent(saved.source)}>查看采集记录与截图</Link></p></div>;
}
