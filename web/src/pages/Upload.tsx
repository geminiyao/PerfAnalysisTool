import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Button, Card, Form, Input, InputNumber, Upload as AntUpload, message, Spin, Space, Typography, Progress, Select,
} from 'antd';
import { InboxOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { ingestUnifiedRun } from '../services/api';
import { CLI_PROVIDERS, type CliProvider, type IngestJobEvent } from '../../shared/types';

const { Dragger } = AntUpload;
const { Text } = Typography;
const DEFAULT_BINARY_CACHE = 'k:/AI/PerfAnalysisTool_Codebuddy/simpleperf/symbols/binary_cache';

function classifyFile(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdata')) return 'unity_profiler';
  if (lower === 'perf.data' || lower.endsWith('.data')) return 'simpleperf';
  if (lower.endsWith('.pftrace') || lower.endsWith('.perfetto-trace') || lower.endsWith('.trace')) return 'perfetto';
  if (lower === 'meta.json') return 'meta';
  return 'extra';
}

const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [cliHint, setCliHint] = useState('');
  const dirInputRef = useRef<HTMLInputElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/cpu/api/settings')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json) return;
        const def = (json.defaultCliProvider as CliProvider) || 'codebuddy';
        form.setFieldsValue({ cliProvider: def });
        if (!json.cliAvailability?.codebuddy && def === 'mock') {
          setCliHint('未检测到 CodeBuddy CLI，已默认 Mock（仅匹配帧数一致的旧报告）。完整 AI 报告请在「设置」填写 codebuddy 路径后选 CodeBuddy。');
        } else if (json.cliPaths?.codebuddy) {
          setCliHint(`CodeBuddy: ${json.cliPaths.codebuddy}`);
        }
      })
      .catch(() => {});
  }, [form]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  function metaValues(): Record<string, string> {
    const v = form.getFieldsValue();
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
      if (val !== undefined && val !== null && val !== '') out[k] = String(val);
    }
    return out;
  }

  function onIngestEvent(event: IngestJobEvent) {
    if (event.message) setStage(event.message);
    if (typeof event.progress === 'number') setProgress(event.progress);
    if (event.type === 'log' && event.logLine) {
      setLogs(prev => [...prev.slice(-200), event.logLine!]);
    }
  }

  function resetProgress() {
    setStage('');
    setProgress(0);
    setLogs([]);
  }

  function addFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    setPendingFiles(prev => {
      const map = new Map(prev.map(f => [`${f.name}:${f.size}`, f]));
      for (const f of arr) map.set(`${f.name}:${f.size}`, f);
      return Array.from(map.values());
    });
  }

  function clearFiles() {
    setPendingFiles([]);
  }

  const detectedSources = [...new Set(pendingFiles.map(f => classifyFile(f.name)).filter(s => s !== 'extra' && s !== 'meta'))];

  async function handleUnifiedIngest() {
    if (pendingFiles.length === 0) {
      message.warning('请先拖入或选择采集文件');
      return;
    }
    setLoading(true);
    resetProgress();
    setStage('上传并识别数据源…');
    try {
      const meta = metaValues();
      const cliProvider = (form.getFieldValue('cliProvider') as CliProvider) || 'codebuddy';
      const res = await ingestUnifiedRun(pendingFiles, { ...meta, cliProvider }, onIngestEvent);
      const multi = (res.sources?.length ?? 0) >= 2;
      message.success(multi ? `多源 Run 入库 + 交叉分析完成: ${res.label || res.runId}` : `入库 + Unity skill 分析完成: ${res.label || res.runId}`);
      navigate(`/runs/${res.runId}`, { state: { openReportTab: true } });
    } catch (e: any) {
      message.error(e.message || '失败');
    } finally {
      setLoading(false);
    }
  }

  const metaForm = (
    <Card size="small" title="元数据 (可选)" style={{ marginBottom: 12 }}>
      <Form form={form} layout="vertical" disabled={loading} initialValues={{ targetFps: 60 }}>
        <Space style={{ width: '100%' }} wrap>
          <Form.Item label="Run ID" name="runId"><Input placeholder="留空自动生成" style={{ width: 180 }} /></Form.Item>
          <Form.Item label="标签" name="label"><Input placeholder="如 base_001" style={{ width: 140 }} /></Form.Item>
          <Form.Item label="项目" name="projectName"><Input placeholder="AOE3D" style={{ width: 120 }} /></Form.Item>
          <Form.Item label="版本" name="version"><Input style={{ width: 100 }} /></Form.Item>
          <Form.Item label="设备" name="device"><Input style={{ width: 120 }} /></Form.Item>
          <Form.Item label="场景" name="scene"><Input style={{ width: 120 }} /></Form.Item>
          <Form.Item label="目标 FPS" name="targetFps" initialValue={60} tooltip="AOE 压测默认 60；与 preprocess / mustReport 阈值 / AI 报告口径一致">
            <InputNumber min={15} max={120} style={{ width: 90 }} />
          </Form.Item>
          <Form.Item label="CLI 分析" name="cliProvider" tooltip="Unity 单源走 unity-profiler-analysis skill；多源走 cross builder">
            <Select style={{ width: 140 }} options={CLI_PROVIDERS.map(p => ({ value: p.value, label: p.label }))} />
          </Form.Item>
          <Form.Item label="binary_cache" name="binaryCacheLocalPath" initialValue={DEFAULT_BINARY_CACHE}>
            <Input style={{ width: 360 }} placeholder="simpleperf 符号路径" />
          </Form.Item>
        </Space>
      </Form>
    </Card>
  );

  const perfettoOptionsForm = (
    <Card size="small" title="Perfetto 剪枝 (含 .pftrace 时生效)" style={{ marginBottom: 12 }}>
      <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
        阈值按全 trace 时间窗占比。LuaMgr 下子节点 &lt;0.5% 会被剪掉，可降至 0.1。
      </Text>
      <Form form={form} layout="vertical" disabled={loading}>
        <Space wrap>
          <Form.Item label="Profile 色块" name="profileName" initialValue="CombinedProfile">
            <Input style={{ width: 160 }} />
          </Form.Item>
          <Form.Item label="callTree 最小 %" name="sliceTreeMinPct" initialValue={0.5}>
            <InputNumber min={0.01} max={20} step={0.05} style={{ width: 90 }} />
          </Form.Item>
          <Form.Item label="callTree 深度" name="sliceTreeMaxDepth" initialValue={12}>
            <InputNumber min={4} max={24} style={{ width: 80 }} />
          </Form.Item>
          <Form.Item label="summary 最小 %" name="summaryMinPct" initialValue={1.0}>
            <InputNumber min={0.01} max={20} step={0.1} style={{ width: 90 }} />
          </Form.Item>
          <Form.Item label="summary 深度" name="summaryMaxDepth" initialValue={8}>
            <InputNumber min={4} max={24} style={{ width: 80 }} />
          </Form.Item>
        </Space>
      </Form>
    </Card>
  );

  const loadingBlock = loading && (
    <Card size="small" style={{ marginTop: 12 }} title="入库 + 分析进度">
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <div><Spin size="small" style={{ marginRight: 8 }} />{stage || '处理中…'}</div>
        <Progress percent={progress} size="small" status="active" />
        {logs.length > 0 ? (
          <div style={{
            maxHeight: 260, overflow: 'auto', background: 'var(--color-bg-elevated, #1a1a1a)',
            borderRadius: 6, padding: '8px 10px', fontFamily: 'var(--font-mono, monospace)', fontSize: 11, lineHeight: 1.5,
          }}>
            {logs.map((line, i) => (
              <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>等待后端日志…</Text>
        )}
      </Space>
    </Card>
  );

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <h1 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>采集上传</h1>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="统一入口：拖入采集文件 → 自动识别 → 入库 → skill 分析"
        description="单 .pdata → Unity skill 报告（与 CLI 同流程）；拖齐三源 → 多源 Run + 交叉报告。对比分析请用侧栏「对比分析」。"
      />

      {cliHint && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="CLI 分析" description={cliHint} />
      )}

      {metaForm}
      {perfettoOptionsForm}

      <Card size="small">
        <Dragger
          multiple
          directory={false}
          showUploadList={false}
          disabled={loading}
          beforeUpload={(file, fileList) => {
            addFiles(fileList.length ? fileList : [file]);
            return false;
          }}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text" style={{ fontSize: 13 }}>拖入或选择 .pdata / perf.data / .pftrace / meta.json</p>
          <p className="ant-upload-hint" style={{ fontSize: 12 }}>可一次拖多个文件；识别到几种源就建几种分区</p>
        </Dragger>

        <input
          ref={dirInputRef}
          type="file"
          // @ts-expect-error webkitdirectory
          webkitdirectory=""
          directory=""
          multiple
          style={{ display: 'none' }}
          onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
        />
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button icon={<FolderOpenOutlined />} disabled={loading} onClick={() => dirInputRef.current?.click()}>
            选择整个采集目录
          </Button>
          {pendingFiles.length > 0 && (
            <>
              <Text type="secondary" style={{ fontSize: 12 }}>
                已选 {pendingFiles.length} 个文件
                {detectedSources.length > 0 && ` · 识别: ${detectedSources.join(' + ')}`}
              </Text>
              <Button size="small" disabled={loading} onClick={clearFiles}>清除</Button>
            </>
          )}
        </div>

        {pendingFiles.length > 0 && (
          <div style={{ marginTop: 10, maxHeight: 120, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            {pendingFiles.map(f => (
              <div key={`${f.name}:${f.size}`}>{f.name} ({(f.size / 1024 / 1024).toFixed(1)} MB)</div>
            ))}
          </div>
        )}

        <Button
          type="primary"
          style={{ marginTop: 16 }}
          loading={loading}
          disabled={!pendingFiles.length || loading}
          onClick={handleUnifiedIngest}
        >
          开始解析、入库并分析
        </Button>
      </Card>

      {loadingBlock}
    </div>
  );
};

export default UploadPage;
