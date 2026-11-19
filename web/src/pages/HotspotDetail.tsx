import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Alert, Button, Collapse, Empty, Input, Modal, Segmented, Select, Space, Spin, Tag, message } from 'antd';
import { CameraOutlined, FileDoneOutlined } from '@ant-design/icons';
import { getRunDetail, generateRunAnalysisWithSources, listHotspotImages, uploadHotspotImage } from '../services/api';
import { hotspots, sourcesOf, sourceNames, canonicalSource, type CaptureImage } from '../../shared/hotspot-report';
import type { Run } from '../../shared/perf-model';
import SourceDetailPanel from '../components/SourceDetailPanel';

export default function HotspotDetail() {
  const { id = '' } = useParams();
  return <RunPage key={id} id={id} />;
}

function RunPage({ id }: {id:string}) {
  const [params,setParams] = useSearchParams();
  const [run,setRun] = useState<Run>();
  const [images,setImages] = useState<CaptureImage[]>([]);
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const [attach,setAttach] = useState(false);
  const [key,setKey] = useState('');
  const [caption,setCaption] = useState('');
  const [file,setFile] = useState<File>();
  useEffect(() => {
    let active = true;
    Promise.all([getRunDetail(id),listHotspotImages(id)]).then(([detail,items]) => {
      if (active) {setRun(detail.run); setImages(items);}
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  },[id]);
  if (error) return <Alert type="error" showIcon message={error} />;
  if (!run) return <Spin />;
  const sources = sourcesOf(run);
  const source = sources.find(s => s === params.get('source')) ?? sources[0];
  const items = hotspots(run,source);
  const ready = source && run.status === 'ready';
  const meta = run.meta;
  const sourceImages = images.filter(i => i.source === source);
  const generalImages = sourceImages.filter(i => !items.some(h => h.key === i.key));
  const renderImage = (i:CaptureImage) => <figure key={i.id}><a href={i.url} target="_blank" rel="noreferrer"><img src={i.url} alt={i.caption} /></a><figcaption>{i.caption}</figcaption></figure>;
  async function save(image: boolean) {
    setBusy(true);
    try {
      if (image && file) {
        await uploadHotspotImage(id,source,key,caption,file);
        setImages(await listHotspotImages(id)); setAttach(false);
      } else await generateRunAnalysisWithSources(id,{sources:[source]});
      message.success('热点报告已保存到性能报告目录');
    } catch(e) { message.error(e instanceof Error ? e.message : '保存失败'); }
    finally {setBusy(false);}
  }
  return <div className="workspace-page"><div className="page-heading"><h1>{meta.scene || run.label || '采集详情'}</h1>
    <Space wrap><Link to="/runs">采集记录</Link><Button icon={<FileDoneOutlined />} type="primary" disabled={!ready} loading={busy} onClick={() => save(false)}>保存热点报告</Button></Space></div>
    <section className="surface"><header><h3>采集条件</h3><Tag>{run.status === 'ready' ? '已解析' : run.status === 'pending' ? '待解析' : run.status}</Tag></header>
      <Space size={[20,6]} wrap>{[['项目',meta.projectName],['版本',meta.version],['设备',meta.device],['用例',run.label]].map(([k,v]) => <div key={k}><span className="muted">{k}　</span>{v || '未记录'}</div>)}</Space>
      <p className="muted" style={{overflowWrap:'anywhere'}}>{run.id} · {new Date(run.createdAt).toLocaleString('zh-CN')}</p></section>
    <div className="section-title"><h2>关键热点</h2>{sources.length > 0 && <Segmented value={source} options={sources.map(value => ({value,label:sourceNames[value] ?? value}))} onChange={s => setParams({source:String(s)})} />}</div>
    <section className="surface evidence-list">{items.map(h => <article key={h.key}><h3>{h.name}</h3><p><strong>{h.value.toFixed(2)} {h.measure}</strong>　<span className="muted">{h.location}</span></p>
      {sourceImages.filter(i => i.key === h.key).map(renderImage)}</article>)}
      {!items.length && <Empty description={ready ? '当前数据没有可排序的热点' : '解析完成后可查看热点'} />}{generalImages.map(renderImage)}
      <div><Button icon={<CameraOutlined />} disabled={!ready || busy} onClick={() => {setKey(items[0]?.key ?? '');setCaption('');setFile(undefined);setAttach(true);}}>添加工具截图</Button></div></section>
    <div className="section-title"><h2>采集证据</h2><Link to={'/runs/'+encodeURIComponent(id)+'/original'}>原始分析视图</Link></div>
    <Collapse items={[{key:'data',label:'指标与原始文件',children:<><SourceDetailPanel source={source} metrics={run.profile.core.metrics} detail={run.profile.detail[source] as Record<string,unknown> | undefined} />
      {run.profile.raw.filter(r => canonicalSource(r.source) === source).map((r,i) => <p key={i} style={{overflowWrap:'anywhere'}}>{r.localPath || r.fileName || r.assetId}</p>)}</>}]} />
    <Modal title="添加原工具截图" open={attach} destroyOnClose onCancel={() => !busy && setAttach(false)} onOk={() => save(true)} confirmLoading={busy}
      okButtonProps={{disabled:!file || !caption.trim()}} okText="保存截图与报告">
      <div className="evidence-form"><label>关联热点<Select value={key} onChange={setKey} options={[{value:'',label:'整个采样区间'},...items.map(h => ({value:h.key,label:h.name+' · '+h.measure}))]} /></label>
        <label>截图位置<Input value={caption} onChange={e => setCaption(e.target.value)} maxLength={300} placeholder="帧号、时间段、线程或函数位置" /></label>
        <label>截图文件（PNG / JPEG，最大 12 MB）<input type="file" accept="image/png,image/jpeg" onChange={e => {const f=e.target.files?.[0];if(f && f.size>12*1024*1024){message.error('图片超过 12 MB');e.target.value='';setFile(undefined);}else setFile(f);}} /></label></div>
    </Modal>
  </div>;
}
