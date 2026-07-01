import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Card, Form, Input, InputNumber, Progress, Space, Spin, Tabs, Tag, Typography, message,
} from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { type IngestJobEvent } from '../../shared/types';
import { ingestUnityCompareLocalRun } from '../services/api';
import { downloadTextFile } from '../utils/download';

const { Text, Title } = Typography;

const UnityProfilerCompare: React.FC = () => {
  const [form] = Form.useForm();
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

  async function handleSubmit() {
    const v = form.getFieldsValue();
    if (!v.basePath || !v.curPath) {
      message.warning('请填写 base / cur 两份 .pdata 路径');
      return;
    }
    setLoading(true);
    setStage('启动 unity diff…');
    setProgress(0);
    setLogs([]);
    setMarkdown('');
    setReportPath('');
    setDiffId('');

    try {
      const meta: Record<string, string | number | boolean | undefined> = {};
      if (v.baseLabel) meta.baseLabel = v.baseLabel;
      if (v.curLabel) meta.curLabel = v.curLabel;
      if (v.device) meta.device = v.device;
      if (v.scene) meta.scene = v.scene;
      if (v.targetFps) meta.targetFps = Number(v.targetFps);
      if (v.skipAiEnrich) meta.skipAiEnrich = true;

      const res = await ingestUnityCompareLocalRun(
        { basePath: v.basePath, curPath: v.curPath },
        meta,
        onIngestEvent,
      );
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

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <Title level={5} style={{ marginBottom: 12 }}>Unity Profiler 双版本对比 (Hybrid v1)</Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="输入两份 .pdata 文件路径（同设备、同场景，不同版本），生成 unity diff 报告"
        description="Provider 算 ms/帧 Δ%（aggregatedCallTrees + GC 业务归因 + per-thread 加厚），AI 增量润色业务叙事；AI 失败回退 Provider 骨架版。"
      />

      <Card size="small" title="输入路径" style={{ marginBottom: 12 }}>
        <Form
          form={form}
          layout="vertical"
          disabled={loading}
          initialValues={{
            targetFps: 60,
            device: 'PAL-AL00',
            scene: '',
            skipAiEnrich: false,
          }}
        >
          <Form.Item label="Base .pdata 路径" name="basePath" rules={[{ required: true, message: '请填 base .pdata 路径' }]}>
            <Input placeholder="K:/.../base.pdata" style={{ fontFamily: 'var(--font-mono)' }} />
          </Form.Item>
          <Form.Item label="Cur .pdata 路径" name="curPath" rules={[{ required: true, message: '请填 cur .pdata 路径' }]}>
            <Input placeholder="K:/.../cur.pdata" style={{ fontFamily: 'var(--font-mono)' }} />
          </Form.Item>
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
