import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Form, Input, InputNumber, Progress, Radio, Select, Space, Spin, Tabs, Tag, Typography, Upload as AntUpload, message } from 'antd';
import { DownloadOutlined, EyeOutlined, FolderOpenOutlined, InboxOutlined } from '@ant-design/icons';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useNavigate } from 'react-router-dom';

import { BlobReader, BlobWriter, ZipReader } from '@zip.js/zip.js';
import { CLI_PROVIDERS, type CliProvider, type IngestJobEvent } from '../../shared/types';
import { getRunDetail, ingestPerfettoTriadLocalRun, ingestPerfettoTriadRun } from '../services/api';
import { downloadTextFile } from '../utils/download';

const { Dragger } = AntUpload;
const { Text, Title } = Typography;

type Role = 'base' | 'cur' | 'throttle';
type InputMode = 'local' | 'upload';

type RoleFiles = Record<Role, File[]>;
type RolePaths = Record<Role, string>;

interface WebkitFileEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file: (success: (file: File) => void, error?: (err: unknown) => void) => void;
  createReader?: () => { readEntries: (success: (entries: WebkitFileEntry[]) => void, error?: (err: unknown) => void) => void };
}

interface DataTransferItemWithEntry {
  webkitGetAsEntry?: () => WebkitFileEntry | null;
}

const ROLE_LABEL: Record<Role, string> = {
  base: 'base 基准',
  cur: 'cur 当前',
  throttle: 'throttle 降频',
};

const emptyFiles = (): RoleFiles => ({ base: [], cur: [], throttle: [] });
const defaultPaths = (): RolePaths => ({
  base: 'G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_base_20260624_104944',
  cur: 'G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_cur_20260624_105041',
  throttle: 'G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_throttle_20260624_105539',
});

function fileKey(f: File): string {
  const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
  return `${rel}:${f.size}`;
}

function classify(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pftrace') || lower.endsWith('.perfetto-trace') || lower.endsWith('.trace')) return 'trace';
  if (['collection-manifest.json', 'thermal_before.txt', 'thermal_after.txt', 'cpuinfo_max_freq.txt', 'meta.json'].includes(lower.split('/').pop() ?? lower)) return 'sidecar';
  if (lower.endsWith('.zip')) return 'zip';
  return 'extra';
}

function setRelativePath(file: File, path: string): File {
  Object.defineProperty(file, 'webkitRelativePath', { value: path.replace(/^\/+/, ''), configurable: true });
  return file;
}

function readEntryFile(entry: WebkitFileEntry, pathPrefix = ''): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(file => resolve(setRelativePath(file, `${pathPrefix}${entry.name}`)), reject);
  });
}

async function readDirectoryEntries(entry: WebkitFileEntry): Promise<WebkitFileEntry[]> {
  const reader = entry.createReader?.();
  if (!reader) return [];
  const out: WebkitFileEntry[] = [];
  while (true) {
    const batch = await new Promise<WebkitFileEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    out.push(...batch);
  }
  return out;
}

async function collectEntryFiles(entry: WebkitFileEntry, pathPrefix = ''): Promise<File[]> {
  if (entry.isFile) return [await readEntryFile(entry, pathPrefix)];
  if (!entry.isDirectory) return [];
  const children = await readDirectoryEntries(entry);
  const nextPrefix = `${pathPrefix}${entry.name}/`;
  const nested = await Promise.all(children.map(child => collectEntryFiles(child, nextPrefix)));
  return nested.flat();
}

async function filesFromDataTransferItems(items?: DataTransferItemList | null): Promise<File[]> {
  if (!items) return [];
  const entries = Array.from(items)
    .map(item => (item as DataTransferItemWithEntry).webkitGetAsEntry?.())
    .filter((entry): entry is WebkitFileEntry => Boolean(entry));
  if (!entries.length) return [];
  const nested = await Promise.all(entries.map(entry => collectEntryFiles(entry)));
  return nested.flat();
}

async function expandZip(file: File): Promise<File[]> {
  const reader = new ZipReader(new BlobReader(file));
  try {
    const entries = await reader.getEntries();
    const out: File[] = [];
    for (const entry of entries) {
      if (entry.directory || !entry.getData) continue;
      const blob = await entry.getData(new BlobWriter());
      const name = entry.filename.split('/').pop() || 'file.bin';
      out.push(setRelativePath(new File([blob], name), entry.filename));
    }
    return out;
  } finally {
    await reader.close();
  }
}

const PerfettoTriad: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();

  const [files, setFiles] = useState<RoleFiles>(emptyFiles);
  const [paths, setPaths] = useState<RolePaths>(defaultPaths);
  const [inputMode, setInputMode] = useState<InputMode>('local');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [markdown, setMarkdown] = useState('');
  const [reportPath, setReportPath] = useState('');
  const [triadId, setTriadId] = useState('');
  const [runIds, setRunIds] = useState<string[]>([]);
  const dirInputs = useRef<Record<Role, HTMLInputElement | null>>({ base: null, cur: null, throttle: null });
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apiBase = window.location.port === '5173' ? 'http://localhost:3000/cpu/api' : '/cpu/api';
    fetch(`${apiBase}/settings`)
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!json) return;
        form.setFieldsValue({ cliProvider: (json.defaultCliProvider as CliProvider) || 'codebuddy' });
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

  async function addFiles(role: Role, incoming: FileList | File[]) {
    const expanded: File[] = [];
    for (const f of Array.from(incoming)) {
      if (classify(f.name) === 'zip') expanded.push(...await expandZip(f));
      else expanded.push(f);
    }
    setFiles(prev => {
      const map = new Map(prev[role].map(f => [fileKey(f), f]));
      for (const f of expanded) map.set(fileKey(f), f);
      return { ...prev, [role]: Array.from(map.values()) };
    });
  }

  function clearRole(role: Role) {
    setFiles(prev => ({ ...prev, [role]: [] }));
  }

  function onIngestEvent(event: IngestJobEvent) {
    if (event.message) setStage(event.message);
    if (typeof event.progress === 'number') setProgress(event.progress);
    if (event.type === 'log' && event.logLine) setLogs(prev => [...prev.slice(-300), event.logLine!]);
    if (event.type === 'done') {
      if (event.reportPath) setReportPath(event.reportPath);
      if (event.triadId) setTriadId(event.triadId);
      if (event.runIds) setRunIds(event.runIds);
    }
  }

  async function handleSubmit() {
    if (inputMode === 'local') {
      for (const role of ['base', 'cur', 'throttle'] as Role[]) {
        if (!paths[role].trim()) {
          message.warning(`请填写 ${ROLE_LABEL[role]} sample 目录路径`);
          return;
        }
      }
    } else {
      for (const role of ['base', 'cur', 'throttle'] as Role[]) {
        if (!files[role].length) {
          message.warning(`请上传 ${ROLE_LABEL[role]} sample`);
          return;
        }
        if (!files[role].some(f => classify(f.name) === 'trace')) {
          message.warning(`${ROLE_LABEL[role]} 未找到 .pftrace / .trace`);
          return;
        }
      }
    }

    setLoading(true);
    setStage(inputMode === 'local' ? '提交本地 sample 路径…' : '上传三份 sample…');
    setProgress(0);
    setLogs([]);
    setMarkdown('');
    setReportPath('');
    setTriadId('');
    setRunIds([]);
    try {
      const cliProvider = (form.getFieldValue('cliProvider') as CliProvider) || 'codebuddy';
      const meta = { ...metaValues(), cliProvider };
      const res = inputMode === 'local'
        ? await ingestPerfettoTriadLocalRun(paths, meta, onIngestEvent)
        : await ingestPerfettoTriadRun(files, meta, onIngestEvent);
      const nextTriadId = res.triadId || res.runId;
      setTriadId(nextTriadId);
      setRunIds(res.runIds || []);
      if (res.reportPath) setReportPath(res.reportPath);
      if (res.reportMarkdown) {
        setMarkdown(res.reportMarkdown);
      } else if (nextTriadId) {
        const detail = await getRunDetail(nextTriadId);
        if (detail.analysis?.report.markdown) setMarkdown(detail.analysis.report.markdown);
      }

      message.success(`三态报告已完成: ${res.triadId || res.runId}`);
    } catch (e: any) {
      message.error(e.message || '三态报告生成失败');
    } finally {
      setLoading(false);
    }
  }

  const uploadCard = (role: Role) => {
    const roleFiles = files[role];
    const traceCount = roleFiles.filter(f => classify(f.name) === 'trace').length;
    const sidecarCount = roleFiles.filter(f => classify(f.name) === 'sidecar').length;
    return (
      <Card size="small" title={ROLE_LABEL[role]} extra={roleFiles.length ? <Button size="small" onClick={() => clearRole(role)}>清空</Button> : null}>
        <Dragger
          multiple
          directory={false}
          showUploadList={false}
          disabled={loading}
          beforeUpload={(file, fileList) => {
            void addFiles(role, fileList.length ? fileList : [file]);
            return false;
          }}
          onDrop={e => {
            void filesFromDataTransferItems(e.dataTransfer.items).then(dropped => {
              if (dropped.length) void addFiles(role, dropped);
            });
          }}
        >
          <p className="ant-upload-drag-icon"><InboxOutlined /></p>
          <p className="ant-upload-text" style={{ fontSize: 13 }}>拖入 ZIP / .pftrace / 旁路文件</p>
          <p className="ant-upload-hint" style={{ fontSize: 12 }}>推荐选择 sample_* 整个目录或 ZIP 包</p>
        </Dragger>
        <input
          ref={el => { dirInputs.current[role] = el; }}
          type="file"
          // @ts-expect-error webkitdirectory
          webkitdirectory=""
          directory=""
          multiple
          style={{ display: 'none' }}
          onChange={e => { if (e.target.files) void addFiles(role, e.target.files); e.target.value = ''; }}
        />
        <Space style={{ marginTop: 10 }} wrap>
          <Button size="small" icon={<FolderOpenOutlined />} disabled={loading} onClick={() => dirInputs.current[role]?.click()}>
            选择目录
          </Button>
          <Tag color={traceCount ? 'green' : 'red'}>trace {traceCount}</Tag>
          <Tag color={sidecarCount >= 3 ? 'green' : 'orange'}>旁路 {sidecarCount}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>共 {roleFiles.length} 文件</Text>
        </Space>
        {roleFiles.length > 0 && (
          <div style={{ marginTop: 8, maxHeight: 96, overflow: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            {roleFiles.slice(0, 20).map(f => (
              <div key={fileKey(f)}>{(f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name}</div>
            ))}
            {roleFiles.length > 20 && <div>…</div>}
          </div>
        )}
      </Card>
    );
  };

  return (
    <div style={{ maxWidth: 1180, margin: '0 auto' }}>
      <Title level={5} style={{ marginBottom: 12 }}>Perfetto 三态对比</Title>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="base / cur / throttle 三份 perfetto sample，生成 v5.2 三态对比报告"
        description="本地验收推荐使用“本地路径”模式：只提交 sample 目录路径，后端直接读取本机文件，不上传数百 MB 的 .pftrace。"
      />

      <Card size="small" title="输入方式" style={{ marginBottom: 12 }}>
        <Radio.Group value={inputMode} onChange={e => setInputMode(e.target.value)} disabled={loading}>
          <Radio.Button value="local">本地路径（推荐）</Radio.Button>
          <Radio.Button value="upload">浏览器上传</Radio.Button>
        </Radio.Group>
      </Card>

      <Card size="small" title="元数据与参数" style={{ marginBottom: 12 }}>
        <Form form={form} layout="vertical" disabled={loading} initialValues={{ targetFps: 60, profileName: 'CombinedProfile', sliceTreeMinPct: 0.5, sliceTreeMaxDepth: 12, summaryMinPct: 1, summaryMaxDepth: 8 }}>
          <Space wrap>
            <Form.Item label="Triad ID" name="runId"><Input placeholder="留空自动生成" style={{ width: 180 }} /></Form.Item>
            <Form.Item label="标签" name="label"><Input placeholder="AOE perfetto triad" style={{ width: 180 }} /></Form.Item>
            <Form.Item label="项目" name="projectName"><Input style={{ width: 120 }} /></Form.Item>
            <Form.Item label="设备" name="device"><Input style={{ width: 120 }} /></Form.Item>
            <Form.Item label="场景" name="scene"><Input style={{ width: 120 }} /></Form.Item>
            <Form.Item label="CLI" name="cliProvider"><Select style={{ width: 140 }} options={CLI_PROVIDERS.map(p => ({ value: p.value, label: p.label }))} /></Form.Item>
            <Form.Item label="Profile 色块" name="profileName"><Input style={{ width: 150 }} /></Form.Item>
            <Form.Item label="callTree 最小 %" name="sliceTreeMinPct"><InputNumber min={0.01} max={20} step={0.05} style={{ width: 90 }} /></Form.Item>
            <Form.Item label="callTree 深度" name="sliceTreeMaxDepth"><InputNumber min={4} max={24} style={{ width: 80 }} /></Form.Item>
            <Form.Item label="summary 最小 %" name="summaryMinPct"><InputNumber min={0.01} max={20} step={0.1} style={{ width: 90 }} /></Form.Item>
            <Form.Item label="summary 深度" name="summaryMaxDepth"><InputNumber min={4} max={24} style={{ width: 80 }} /></Form.Item>
          </Space>
        </Form>
      </Card>

      {inputMode === 'local' ? (
        <Card size="small" title="本地 sample 目录路径" style={{ marginBottom: 12 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            {(['base', 'cur', 'throttle'] as Role[]).map(role => (
              <Input
                key={role}
                addonBefore={ROLE_LABEL[role]}
                value={paths[role]}
                disabled={loading}
                onChange={e => setPaths(prev => ({ ...prev, [role]: e.target.value }))}
                placeholder="例如 G:/.../sample_base_xxx"
              />
            ))}
          </Space>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
          {(['base', 'cur', 'throttle'] as Role[]).map(uploadCard)}
        </div>
      )}

      <Card size="small" style={{ marginTop: 12 }}>
        <Space wrap>
          <Button type="primary" loading={loading} disabled={loading} onClick={handleSubmit}>生成三态对比报告</Button>
          {triadId && <Tag color="purple">{triadId}</Tag>}
          {triadId && (
            <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/runs/${triadId}`, { state: { openReportTab: true } })}>
              打开持久化报告
            </Button>
          )}
          {runIds.filter(id => id !== triadId).map(id => <Tag key={id}>{id}</Tag>)}
          {reportPath && <Text type="secondary" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>报告: {reportPath}</Text>}

        </Space>
      </Card>

      {(loading || logs.length > 0 || stage) && (
        <Card size="small" title="上传 / 构建 / CLI 进度" style={{ marginTop: 12 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <div>{loading && <Spin size="small" style={{ marginRight: 8 }} />}{stage || '处理中…'}</div>
            <Progress percent={progress} size="small" status={loading ? 'active' : progress >= 100 ? 'success' : 'normal'} />
            <div style={{ maxHeight: 260, overflow: 'auto', background: 'var(--bg-root)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: 10, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {logs.length ? logs.map((line, i) => <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</div>) : <Text type="secondary">等待后端日志…</Text>}
              <div ref={logEndRef} />
            </div>
          </Space>
        </Card>
      )}

      {(markdown || reportPath) && (
        <Card
          size="small"
          title="三态报告"
          style={{ marginTop: 12 }}
          extra={markdown ? <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadTextFile(`perfetto-triad_${triadId || 'report'}.md`, markdown)}>下载</Button> : null}
        >
          {reportPath && <Text type="secondary" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', display: 'block', marginBottom: 8 }}>已落盘: {reportPath}</Text>}
          {markdown ? (
            <Tabs items={[
              { key: 'render', label: '渲染', children: <div className="markdown-body perfetto-triad-report" style={{ maxHeight: '72vh', overflow: 'auto' }}><ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown></div> },
              { key: 'raw', label: '原文', children: <pre style={{ maxHeight: '72vh', overflow: 'auto', whiteSpace: 'pre', fontFamily: 'var(--font-mono)', fontSize: 11 }}>{markdown}</pre> },
            ]} />
          ) : <Alert type="success" showIcon message="报告已生成" description="刷新首个子 Run 详情可查看入库报告，或直接打开上方落盘路径。" />}
        </Card>
      )}
    </div>
  );
};

export default PerfettoTriad;
