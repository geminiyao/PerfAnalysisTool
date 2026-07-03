import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Card, Form, Input, InputNumber, Progress, Radio, Space, Spin, Tabs, Tag, Typography, Upload as AntUpload, message,
} from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type IngestJobEvent } from '../../shared/types';
import { ingestUnityCompareLocalRun, ingestUnityCompareRun } from '../services/api';
import { downloadTextFile } from '../utils/download';

const { Dragger } = AntUpload;
const { Text, Title } = Typography;

type InputMode = 'upload' | 'local';

function classifyPdata(name: string): 'base' | 'cur' | 'unknown' {
  const lower = name.toLowerCase();
  if (lower.includes('base') || lower.includes('baseline')) return 'base';
  if (lower.includes('stress') || lower.includes('cur') || lower.includes('move')) return 'cur';
  return 'unknown';
}

function assignRoles(files: File[]): { base: File | null; cur: File | null } {
  let base: File | null = null;
  let cur: File | null = null;
  for (const f of files) {
    const role = classifyPdata(f.name);
    if (role === 'base' && !base) base = f;
    else if (role === 'cur' && !cur) cur = f;
  }
  if (files.length === 2 && (!base || !cur)) {
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
    base = base ?? sorted[0];
    cur = cur ?? sorted[1];
  }
  return { base, cur };
}

const UnityProfilerCompare: React.FC = () => {
  const [form] = Form.useForm();
  const [inputMode, setInputMode] = useState<InputMode>('upload');
  const [pdataFiles, setPdataFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [markdown, setMarkdown] = useState('');
  const [reportPath, setReportPath] = useState('');
  const [diffId, setDiffId] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  function onIngestEvent(ev: IngestJobEvent) {
    if (ev.message) setStage(ev.message);
    if (typeof ev.progress === 'number') setProgress(ev.progress);
    if (ev.type === 'log' && ev.logLine) setLogs(prev => [...prev.slice(-300), ev.logLine!]);
    if (ev.type === 'done') {
      if (ev.reportPath) setReportPath(ev.reportPath);
      if (ev.diffId) setDiffId(ev.diffId);
      if (ev.reportMarkdown) setMarkdown(ev.reportMarkdown);
    }
  }

  function metaFromForm(): Record<string, string | number | boolean | undefined> {
    const v = form.getFieldsValue();
    const meta: Record<string, string | number | boolean | undefined> = {};
    if (v.baseLabel) meta.baseLabel = v.baseLabel;
    if (v.curLabel) meta.curLabel = v.curLabel;
    if (v.device) meta.device = v.device;
    if (v.scene) meta.scene = v.scene;
    if (v.targetFps) meta.targetFps = Number(v.targetFps);
    if (v.skipAiEnrich) meta.skipAiEnrich = true;
    return meta;
  }

  async function handleSubmit() {
    setLoading(true);
    setStage('启动 unity diff…');
    setProgress(0);
    setLogs([]);
    setMarkdown('');
    setReportPath('');
    setDiffId('');

    try {
      const meta = metaFromForm();
      let res;
      if (inputMode === 'upload') {
        const { base, cur } = assignRoles(pdataFiles);
        if (!base || !cur) {
          message.warning('请拖入两份 .pdata（base + cur/stressmove）');
          return;
        }
        res = await ingestUnityCompareRun({ base, cur }, meta, onIngestEvent);
      } else {
        const v = form.getFieldsValue();
        if (!v.basePath || !v.curPath) {
          message.warning('请填写 base / cur 两份 .pdata 路径');
          return;
        }
        res = await ingestUnityCompareLocalRun(
          { basePath: v.basePath, curPath: v.curPath },
          meta,
          onIngestEvent,
        );
      }
      setDiffId(res.diffId || res.runId || '');
      if (res.reportPath) setReportPath(res.reportPath);
      if (res.reportMarkdown) setMarkdown(res.reportMarkdown);
      message.success(`unity diff 报告已完成: ${res.diffId || res.runId}`);
    } catch (e: any) {
      message.error(e.message || 'unity diff 生成失败');
    } finally {
      setLoading(false);
    }
  }

  const { base: pickedBase, cur: pickedCur } = assignRoles(pdataFiles);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <Title level={5} style={{ marginBottom: 12 }}>Unity Profiler 双版本对比 (Hybrid v1)</Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="两份 .pdata（同设备、同场景、不同版本）→ unity diff 报告"
        description="可拖入上传或填写本地路径；Provider 算 ms/帧 Δ%，CLI 填 §3.x 分析槽；正式验收 deliverSource=ai-authored。"
      />

      <Card size="small" title="输入方式" style={{ marginBottom: 12 }}>
        <Radio.Group
          value={inputMode}
          onChange={e => setInputMode(e.target.value)}
          disabled={loading}
          style={{ marginBottom: 12 }}
        >
          <Radio.Button value="upload">拖入上传</Radio.Button>
          <Radio.Button value="local">本地路径</Radio.Button>
        </Radio.Group>

        {inputMode === 'upload' ? (
          <>
            <Dragger
              multiple
              accept=".pdata"
              showUploadList={false}
              disabled={loading}
              beforeUpload={file => {
                setPdataFiles(prev => {
                  const map = new Map(prev.map(f => [`${f.name}:${f.size}`, f]));
                  map.set(`${file.name}:${file.size}`, file);
                  return Array.from(map.values()).slice(-4);
                });
                return false;
              }}
            >
              <p className="ant-upload-drag-icon"><InboxOutlined /></p>
              <p className="ant-upload-text">拖入 base.pdata 与 cur/stressmove.pdata</p>
              <p className="ant-upload-hint">文件名含 base / stress / cur 会自动识别角色</p>
            </Dragger>
            <Space style={{ marginTop: 12 }} wrap>
              <Tag color={pickedBase ? 'green' : 'default'}>base: {pickedBase?.name || '未选择'}</Tag>
              <Tag color={pickedCur ? 'green' : 'default'}>cur: {pickedCur?.name || '未选择'}</Tag>
              {pdataFiles.length > 0 && (
                <Button size="small" disabled={loading} onClick={() => setPdataFiles([])}>清空</Button>
              )}
            </Space>
          </>
        ) : (
          <Form form={form} layout="vertical" disabled={loading}>
            <Form.Item label="Base .pdata 路径" name="basePath">
              <Input placeholder="K:/.../base.pdata" style={{ fontFamily: 'var(--font-mono)' }} />
            </Form.Item>
            <Form.Item label="Cur .pdata 路径" name="curPath">
              <Input placeholder="K:/.../cur.pdata" style={{ fontFamily: 'var(--font-mono)' }} />
            </Form.Item>
          </Form>
        )}
      </Card>

      <Card size="small" title="元数据（可选）" style={{ marginBottom: 12 }}>
        <Form
          form={form}
          layout="vertical"
          disabled={loading}
          initialValues={{ targetFps: 60, device: 'PAL-AL00', scene: '', skipAiEnrich: false }}
        >
          <Space wrap>
            <Form.Item label="base 标签" name="baseLabel"><Input style={{ width: 160 }} placeholder="可选" /></Form.Item>
            <Form.Item label="cur 标签" name="curLabel"><Input style={{ width: 160 }} placeholder="可选" /></Form.Item>
            <Form.Item label="设备" name="device"><Input style={{ width: 160 }} /></Form.Item>
            <Form.Item label="场景" name="scene"><Input style={{ width: 200 }} /></Form.Item>
            <Form.Item label="targetFps" name="targetFps"><InputNumber min={15} max={120} style={{ width: 90 }} /></Form.Item>
          </Space>
        </Form>
      </Card>

      <Card size="small">
        <Space wrap>
          <Button type="primary" loading={loading} onClick={handleSubmit}>生成 Unity Diff 报告</Button>
          {diffId && <Tag color="purple">{diffId}</Tag>}
          {reportPath && <Text type="secondary" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{reportPath}</Text>}
        </Space>
      </Card>

      {(loading || logs.length > 0) && (
        <Card size="small" title="进度" style={{ marginTop: 12 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>{loading && <Spin size="small" style={{ marginRight: 8 }} />}{stage || '处理中…'}</div>
            <Progress percent={progress} size="small" status={loading ? 'active' : progress >= 100 ? 'success' : 'normal'} />
            <div style={{ maxHeight: 260, overflow: 'auto', background: 'var(--bg-root)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {logs.map((line, i) => <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</div>)}
              <div ref={logEndRef} />
            </div>
          </Space>
        </Card>
      )}

      {markdown && (
        <Card
          size="small"
          title="Unity Diff 报告"
          style={{ marginTop: 12 }}
          extra={
            <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadTextFile(`unity-diff_${diffId || 'report'}.md`, markdown)}>下载</Button>
          }
        >
          <Tabs items={[
            {
              key: 'render',
              label: '渲染',
              children: (
                <div className="markdown-body" style={{ maxHeight: '75vh', overflow: 'auto' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
                </div>
              ),
            },
            {
              key: 'raw',
              label: '原文',
              children: <pre style={{ maxHeight: '75vh', overflow: 'auto', whiteSpace: 'pre', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{markdown}</pre>,
            },
          ]} />
        </Card>
      )}
    </div>
  );
};

export default UnityProfilerCompare;
