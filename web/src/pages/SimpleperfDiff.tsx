import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Card, Form, Input, InputNumber, Progress, Space, Spin, Tabs,
  Tag, Typography, Upload as AntUpload, message,
} from 'antd';
import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type IngestJobEvent } from '../../shared/types';
import { getRunDetail, ingestSimpleperfDiffRun } from '../services/api';
import { downloadTextFile } from '../utils/download';

const { Dragger } = AntUpload;
const { Text, Title } = Typography;

const DEFAULT_BINARY_CACHE = 'D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/binary_cache';

function classifyPerfFile(name: string): 'base' | 'cur' | 'unknown' {
  const lower = name.toLowerCase();
  if (lower.includes('base')) return 'base';
  if (lower.includes('stress') || lower.includes('cur') || lower.includes('move')) return 'cur';
  return 'unknown';
}

function assignRoles(files: File[]): { base: File | null; cur: File | null } {
  let base: File | null = null;
  let cur: File | null = null;
  for (const f of files) {
    const role = classifyPerfFile(f.name);
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

const SimpleperfDiff: React.FC = () => {
  const [form] = Form.useForm();
  const [perfFiles, setPerfFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [markdown, setMarkdown] = useState('');
  const [reportPath, setReportPath] = useState('');
  const [diffId, setDiffId] = useState('');
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  function onIngestEvent(event: IngestJobEvent) {
    if (event.message) setStage(event.message);
    if (typeof event.progress === 'number') setProgress(event.progress);
    if (event.type === 'log' && event.logLine) setLogs(prev => [...prev.slice(-300), event.logLine!]);
    if (event.type === 'done') {
      if (event.reportPath) setReportPath(event.reportPath);
      if (event.diffId) setDiffId(event.diffId);
      if (event.reportMarkdown) setMarkdown(event.reportMarkdown);
    }
  }

  async function handleSubmit() {
    const { base, cur } = assignRoles(perfFiles);
    if (!base || !cur) {
      message.warning('请拖入两份 perf.data（base + cur/stressmove）');
      return;
    }

    setLoading(true);
    setStage('上传并分析…');
    setProgress(0);
    setLogs([]);
    setMarkdown('');
    setReportPath('');
    setDiffId('');

    try {
      const v = form.getFieldsValue();
      const meta: Record<string, string> = {};
      if (v.label) meta.label = v.label;
      if (v.device) meta.device = v.device;
      if (v.sceneBase) meta.sceneBase = v.sceneBase;
      if (v.sceneCur) meta.sceneCur = v.sceneCur;
      if (v.targetFps) meta.targetFps = String(v.targetFps);
      if (v.binaryCachePath) meta.binaryCacheLocalPath = v.binaryCachePath;

      const res = await ingestSimpleperfDiffRun({ base, cur }, meta, onIngestEvent);
      setDiffId(res.diffId || res.runId);
      if (res.reportPath) setReportPath(res.reportPath);
      if (res.reportMarkdown) setMarkdown(res.reportMarkdown);
      else if (res.runIds?.[0]) {
        const detail = await getRunDetail(res.runIds[0]);
        if (detail.analysis?.report.markdown) setMarkdown(detail.analysis.report.markdown);
      }
      message.success(`v4 差分报告已完成: ${res.diffId || res.runId}`);
    } catch (e: any) {
      message.error(e.message || '差分报告生成失败');
    } finally {
      setLoading(false);
    }
  }

  const { base: pickedBase, cur: pickedCur } = assignRoles(perfFiles);

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <Title level={5} style={{ marginBottom: 12 }}>Simpleperf base / cur 差分</Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="拖入两份 perf.data，自动生成 v4 标准差分报告（Provider + 叙事润色）"
        description="文件名含 base / stress / cur 会自动识别角色；否则按文件名排序取前两个。"
      />

      <Card size="small" title="数据源" style={{ marginBottom: 12 }}>
        <Dragger
          multiple
          accept=".data,.perf"
          showUploadList={false}
          disabled={loading}
          beforeUpload={file => {
            setPerfFiles(prev => {
              const map = new Map(prev.map(f => [`${f.name}:${f.size}`, f]));
              map.set(`${file.name}:${file.size}`, file);
              return Array.from(map.values()).slice(-4);
            });
            return false;
          }}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text">拖入 base.data 与 stressmove.data（或点击选择）</p>
          <p className="ant-upload-hint">构建 + 润色约 1–3 分钟，完成后下方展示完整 §0–§11 报告</p>
        </Dragger>
        <Space style={{ marginTop: 12 }} wrap>
          <Tag color={pickedBase ? 'green' : 'default'}>base: {pickedBase?.name || '未选择'}</Tag>
          <Tag color={pickedCur ? 'green' : 'default'}>cur: {pickedCur?.name || '未选择'}</Tag>
          {perfFiles.length > 0 && (
            <Button size="small" disabled={loading} onClick={() => setPerfFiles([])}>清空</Button>
          )}
        </Space>
      </Card>

      <Card size="small" title="元数据（可选）" style={{ marginBottom: 12 }}>
        <Form
          form={form}
          layout="inline"
          disabled={loading}
          initialValues={{
            targetFps: 45,
            sceneBase: '野外空场景',
            sceneCur: 'stressmove 行军线压测（约 300 队）',
            device: 'MateXs2 (PAL-AL00, aarch64)',
            binaryCachePath: DEFAULT_BINARY_CACHE,
          }}
        >
          <Form.Item label="设备" name="device"><Input style={{ width: 200 }} /></Form.Item>
          <Form.Item label="base 场景" name="sceneBase"><Input style={{ width: 140 }} /></Form.Item>
          <Form.Item label="cur 场景" name="sceneCur"><Input style={{ width: 220 }} /></Form.Item>
          <Form.Item label="主观 FPS" name="targetFps"><InputNumber min={1} max={120} style={{ width: 80 }} /></Form.Item>
          <Form.Item label="symbols" name="binaryCachePath"><Input style={{ width: 320 }} /></Form.Item>
        </Form>
      </Card>

      <Card size="small">
        <Space wrap>
          <Button type="primary" loading={loading} disabled={!pickedBase || !pickedCur} onClick={handleSubmit}>
            生成 v4 差分报告
          </Button>
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
          title="v4 差分报告"
          style={{ marginTop: 12 }}
          extra={
            <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadTextFile(`simpleperf-diff_${diffId || 'report'}.md`, markdown)}>
              下载
            </Button>
          }
        >
          <Tabs items={[
            {
              key: 'render',
              label: '渲染',
              children: (
                <div className="markdown-body simpleperf-diff-report" style={{ maxHeight: '75vh', overflow: 'auto' }}>
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

export default SimpleperfDiff;
