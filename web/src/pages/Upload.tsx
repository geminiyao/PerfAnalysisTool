import React, { useState, useRef, useEffect } from 'react';
import {
  Card, Upload as AntUpload, Form, Input, InputNumber, Button, Progress, Steps, message, Space, Alert, Select, Tooltip, Collapse, Tabs,
} from 'antd';
import { InboxOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { uploadFile, startAnalysis, subscribeProgress, type AnalysisParams } from '../services/api';
import { CLI_PROVIDERS, type ProgressEvent, type CliProvider } from '../../shared/types';

const { Dragger } = AntUpload;
const { Step } = Steps;
const DEFAULT_SIMPLEPERF_BINARY_CACHE_PATH = 'k:/AI/PerfAnalysisTool_Codebuddy/simpleperf/symbols/binary_cache';

const Upload: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cliProvider, setCliProvider] = useState<CliProvider>('codebuddy');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [activeTab, setActiveTab] = useState('profiler');
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [simpleperfPerfData, setSimpleperfPerfData] = useState<File | null>(null);
  const [simpleperfBinaryFiles, setSimpleperfBinaryFiles] = useState<File[]>([]);
  const [simpleperfUploading, setSimpleperfUploading] = useState(false);
  const [simpleperfStep, setSimpleperfStep] = useState(0);
  const [simpleperfStageText, setSimpleperfStageText] = useState('等待选择 perf.data');
  const [simpleperfLogs, setSimpleperfLogs] = useState<string[]>([]);
  const unsubRef = useRef<(() => void) | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSimpleperfUpload = async () => {
    if (!simpleperfPerfData) {
      message.warning('请先选择 perf.data 文件');
      return;
    }
    try {
      setSimpleperfUploading(true);
      setSimpleperfStep(1);
      setSimpleperfStageText('正在上传 perf.data');
      setSimpleperfLogs(['正在上传 perf.data']);
      const meta = form.getFieldsValue();
      const formData = new FormData();
      formData.append('perfData', simpleperfPerfData);
      const localBinaryCachePath = String(meta.binaryCacheLocalPath || DEFAULT_SIMPLEPERF_BINARY_CACHE_PATH).trim();
      setSimpleperfStep(2);
      setSimpleperfStageText(`使用服务端本地 binary_cache：${localBinaryCachePath}`);
      setSimpleperfLogs(prev => [...prev, `使用服务端本地 binary_cache：${localBinaryCachePath}`]);
      meta.binaryCacheLocalPath = localBinaryCachePath;
      ['projectName', 'version', 'branch', 'buildId', 'device', 'scene', 'notes', 'runId', 'binaryCacheLocalPath'].forEach(k => {
        const value = meta[k];
        if (value !== undefined && value !== null) formData.append(k, String(value));
      });

      const uploadRes = await fetch('/cpu/api/simpleperf/upload', { method: 'POST', body: formData });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({ error: 'simpleperf 上传失败' }));
        throw new Error(err.error);
      }
      const uploadResult = await uploadRes.json();
      setSimpleperfStep(3);
      setSimpleperfStageText('上传完成，正在启动 simpleperf 分析');
      setSimpleperfLogs(prev => [...prev, '上传完成', '正在启动 simpleperf 分析']);
      const analyzeRes = await fetch(`/cpu/api/simpleperf/sessions/${uploadResult.id}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topN: meta.simpleperfTopN || 60,
          flamegraphThread: meta.flamegraphThread || '__ALL__',
          aiModel: meta.simpleperfAiModel || 'mock',
        }),
      });
      if (!analyzeRes.ok) {
        const err = await analyzeRes.json().catch(() => ({ error: 'simpleperf 分析启动失败' }));
        throw new Error(err.error);
      }
      setSimpleperfStep(4);
      setSimpleperfStageText('分析已启动，正在跳转报告页查看实时进度');
      setSimpleperfLogs(prev => [...prev, '分析已启动，正在跳转报告页查看实时进度']);
      message.success('simpleperf 已上传并开始分析');
      setTimeout(() => navigate(`/simpleperf/report/${uploadResult.id}`), 800);
    } catch (err: any) {
      const errMsg = err.message || 'simpleperf 上传失败';
      setSimpleperfStageText(errMsg);
      setSimpleperfLogs(prev => [...prev, `失败：${errMsg}`]);
      message.error(errMsg);
    } finally {
      setSimpleperfUploading(false);
    }
  };

  const handleUploadAndAnalyze = async () => {
    const isMock = cliProvider === 'mock';

    if (!isMock && !file) {
      message.warning('请先选择 .pdata 文件');
      return;
    }

    // 前端文件格式校验
    if (!isMock && file) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (ext !== 'pdata') {
        message.error(`不支持 ".${ext}" 格式文件，仅支持 Unity Profile Analyzer 导出的 .pdata 文件`);
        return;
      }
      // 文件大小校验 (200MB)
      const maxSize = 200 * 1024 * 1024;
      if (file.size > maxSize) {
        message.error(`文件过大（${(file.size / 1024 / 1024).toFixed(1)}MB），最大支持 200MB`);
        return;
      }
    }

    try {
      setUploading(true);
      setError(null);
      setLogs([]);
      setCurrentStep(1);

      const meta = form.getFieldsValue();
      let resultId: string;

      if (isMock) {
        const mockBlob = new File([new ArrayBuffer(0)], 'mock-data.pdata', { type: 'application/octet-stream' });
        const result = await uploadFile(mockBlob, { ...meta, projectName: meta.projectName || 'MockProject' });
        resultId = result.id;
        message.success('Mock 会话已创建');
      } else {
        const result = await uploadFile(file!, meta);
        resultId = result.id;
        message.success('文件上传成功');
      }

      setSessionId(resultId);
      setCurrentStep(2);

      const analysisParams: AnalysisParams = {
        targetFps: meta.targetFps || 30,
        jankMultiplier: meta.jankMultiplier || 2,
        bigJankMultiplier: meta.bigJankMultiplier || 3,
        budgetRatio: meta.budgetRatio || 0.3,
      };
      await startAnalysis(resultId, cliProvider, analysisParams);
      setCurrentStep(3);

      const unsub = subscribeProgress(resultId, (event: ProgressEvent) => {
        setProgress(event);

        if (event.log) {
          setLogs(prev => [...prev.slice(-200), event.log!]);
        }

        if (event.stage === 'completed') {
          setCurrentStep(4);
          message.success('分析完成!');
          unsub();

          let retries = 0;
          const checkAndNavigate = async () => {
            try {
              const res = await fetch(`/cpu/api/report/${resultId}/content`);
              if (res.ok) {
                const text = await res.text();
                if (text && text.length > 0) {
                  navigate(`/report/${resultId}`);
                  return;
                }
              }
            } catch { /* ignore */ }

            retries++;
            if (retries < 3) {
              setTimeout(checkAndNavigate, 1000);
            } else {
              message.warning('报告可能尚未就绪，正在跳转...');
              navigate(`/report/${resultId}`);
            }
          };
          setTimeout(checkAndNavigate, 500);
        } else if (event.stage === 'failed') {
          setError(event.message);
          setUploading(false);
          unsub();
        }
      });

      unsubRef.current = unsub;
    } catch (err: any) {
      const errMsg = err.message || '未知错误';
      const displayMsg = errMsg === 'Failed to fetch'
        ? '网络连接失败，请检查服务是否正常运行'
        : errMsg;
      setError(displayMsg);
      message.error(displayMsg);
      setCurrentStep(0);
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <h1 style={{ color: 'var(--text-primary)', marginBottom: 16, fontSize: 16, fontWeight: 600 }}>采集上传</h1>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{ marginBottom: 12 }}
        items={[
          { key: 'profiler', label: 'Profiler .pdata', children: null },
          { key: 'simpleperf', label: 'simpleperf perf.data', children: <SimpleperfUploadPanel
            form={form}
            perfData={simpleperfPerfData}
            binaryFiles={simpleperfBinaryFiles}
            uploading={simpleperfUploading}
            onPerfDataChange={setSimpleperfPerfData}
            onBinaryFilesChange={setSimpleperfBinaryFiles}
            onSubmit={handleSimpleperfUpload}
            step={simpleperfStep}
            stageText={simpleperfStageText}
            logs={simpleperfLogs}
          /> },
          { key: 'perfetto', label: 'Perfetto 预留', children: <Alert type="info" showIcon message="Perfetto 数据源已预留" description="后续支持上传 .pftrace/.perfetto-trace 并接入 trace_processor 分析。" /> },
        ]}
      />

      {activeTab === 'profiler' && (
      <>
      {/* 进度步骤 */}
      <Steps current={currentStep} style={{ marginBottom: 20 }} size="small">
        <Step title="选择文件" />
        <Step title="上传" />
        <Step title="排队" />
        <Step title="分析中" />
        <Step title="完成" />
      </Steps>

      {/* 文件上传区域 */}
      <Card style={{ marginBottom: 12 }}>
        <Dragger
          accept=".pdata"
          multiple={false}
          maxCount={1}
          beforeUpload={(f) => {
            setFile(f);
            return false;
          }}
          onRemove={() => setFile(null)}
          disabled={uploading}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>点击或拖拽 .pdata 文件到此区域</p>
          <p className="ant-upload-hint" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>支持 Unity Profile Analyzer 导出的 .pdata 格式，单文件最大 200MB</p>
        </Dragger>
      </Card>

      {/* 元数据表单 */}
      <Card title={<span style={{ fontSize: 13 }}>分析信息</span>} style={{ marginBottom: 12 }}>
        <Form form={form} layout="vertical" disabled={uploading}>
          <Form.Item
            label={
              <Space>
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>AI 分析工具</span>
                <Tooltip title="选择用于执行分析的 AI CLI 工具。不同工具可能使用不同的模型和分析策略。">
                  <QuestionCircleOutlined style={{ color: 'var(--text-tertiary)' }} />
                </Tooltip>
              </Space>
            }
          >
            <Select
              value={cliProvider}
              onChange={setCliProvider}
              disabled={uploading}
              options={CLI_PROVIDERS.map(p => ({
                value: p.value,
                label: (
                  <Space>
                    <span>{p.label}</span>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{p.description}</span>
                  </Space>
                ),
              }))}
            />
          </Form.Item>

          <Form.Item label="项目名称" name="projectName" rules={[{ required: true, message: '请输入项目名' }]}>
            <Input placeholder="如 AOE3D, MyGame" />
          </Form.Item>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item label="版本号" name="version" style={{ flex: 1 }}>
              <Input placeholder="如 v1.2.3 或 build_1234" />
            </Form.Item>
            <Form.Item label="提交人" name="createdBy" style={{ flex: 1 }}>
              <Input placeholder="你的名字" />
            </Form.Item>
          </Space>
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item label="设备" name="device" style={{ flex: 1 }}>
              <Input placeholder="如 Xiaomi 14, iPhone 15 Pro" />
            </Form.Item>
            <Form.Item label="测试场景" name="scene" style={{ flex: 1 }}>
              <Input placeholder="如 主城、战斗、Loading" />
            </Form.Item>
          </Space>
          <Form.Item label="备注" name="notes">
            <Input.TextArea rows={2} placeholder="任何补充说明..." />
          </Form.Item>

          <Collapse
            size="small"
            style={{ marginBottom: 0 }}
            items={[{
              key: 'params',
              label: <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>分析参数 (可选调整)</span>,
              children: (
                <div>
                  <Space style={{ width: '100%' }} size={16}>
                    <Form.Item label="目标帧率" name="targetFps" initialValue={30} style={{ flex: 1 }}>
                      <InputNumber min={15} max={120} addonAfter="FPS" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      label={
                        <Space>
                          帧预算
                          <Tooltip title="= 1000 / 目标帧率，自动计算">
                            <QuestionCircleOutlined style={{ color: 'var(--text-tertiary)' }} />
                          </Tooltip>
                        </Space>
                      }
                      style={{ flex: 1 }}
                    >
                      <Input
                        disabled
                        value={`${(1000 / (form.getFieldValue('targetFps') || 30)).toFixed(1)} ms`}
                        style={{ color: 'var(--text-secondary)' }}
                      />
                    </Form.Item>
                  </Space>
                  <Space style={{ width: '100%' }} size={16}>
                    <Form.Item
                      label={<Tooltip title="帧耗时 ≥ 中位帧 × 此倍数 → 判定为 Jank"><span>Jank 倍数</span></Tooltip>}
                      name="jankMultiplier"
                      initialValue={2}
                      style={{ flex: 1 }}
                    >
                      <InputNumber min={1.5} max={5} step={0.5} addonAfter="x" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      label={<Tooltip title="帧耗时 ≥ 中位帧 × 此倍数 → 判定为 BigJank"><span>BigJank 倍数</span></Tooltip>}
                      name="bigJankMultiplier"
                      initialValue={3}
                      style={{ flex: 1 }}
                    >
                      <InputNumber min={2} max={10} step={0.5} addonAfter="x" style={{ width: '100%' }} />
                    </Form.Item>
                  </Space>
                  <Form.Item
                    label={<Tooltip title="self-time > 帧预算 × 此比例 → 标记为必须报告的热点"><span>mustReport 阈值</span></Tooltip>}
                    name="budgetRatio"
                    initialValue={0.3}
                  >
                    <InputNumber min={0.1} max={1} step={0.05} addonAfter="× 帧预算" style={{ width: 200 }} />
                  </Form.Item>
                </div>
              ),
            }]}
          />
        </Form>
      </Card>

      {/* 进度展示 */}
      {progress && currentStep >= 3 && (
        <Card style={{ marginBottom: 12 }}>
          <Progress
            percent={progress.progress}
            status={progress.stage === 'failed' ? 'exception' : progress.stage === 'completed' ? 'success' : 'active'}
            strokeColor={{ '0%': 'var(--color-primary)', '100%': 'var(--color-success)' }}
          />
          <p style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 12 }}>{progress.message}</p>
        </Card>
      )}

      {/* CLI 实时日志 */}
      {logs.length > 0 && currentStep >= 3 && (
        <Card
          title={<span style={{ fontSize: 13 }}>CLI 实时输出</span>}
          size="small"
          style={{ marginBottom: 12 }}
          extra={<span style={{ color: 'var(--text-tertiary)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>{logs.length} 行</span>}
        >
          <div
            style={{
              background: 'var(--bg-root)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border-primary)',
              padding: '10px 14px',
              maxHeight: 280,
              overflowY: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {logs.map((line, i) => (
              <div
                key={i}
                style={{
                  color: line.startsWith('[stderr]') ? 'var(--color-error)' : 'var(--text-secondary)',
                  borderBottom: '1px solid var(--border-primary)',
                  paddingBottom: 1,
                  marginBottom: 1,
                }}
              >
                {line}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </Card>
      )}

      {/* 错误提示 */}
      {error && (
        <Alert type="error" message={currentStep <= 1 ? "上传失败" : "分析失败"} description={error} showIcon style={{ marginBottom: 12 }} />
      )}

      {/* 提交按钮 */}
      <Button
        type="primary"
        size="large"
        block
        onClick={handleUploadAndAnalyze}
        loading={uploading}
        disabled={(cliProvider !== 'mock' && !file) || currentStep >= 4}
      >
        {uploading ? '分析进行中...' : cliProvider === 'mock' ? '开始 Mock 分析' : '开始分析'}
      </Button>
      </>
      )}
    </div>
  );
};

interface SimpleperfUploadPanelProps {
  form: any;
  perfData: File | null;
  binaryFiles: File[];
  uploading: boolean;
  onPerfDataChange: (file: File | null) => void;
  onBinaryFilesChange: (files: File[]) => void;
  onSubmit: () => void;
  step: number;
  stageText: string;
  logs: string[];
}

const SimpleperfUploadPanel: React.FC<SimpleperfUploadPanelProps> = ({ form, perfData, binaryFiles, uploading, onPerfDataChange, onBinaryFilesChange, onSubmit, step, stageText, logs }) => (
  <Card size="small" style={{ marginBottom: 12 }}>
    <Alert
      type="info"
      showIcon
      style={{ marginBottom: 12 }}
      message="simpleperf 单次分析"
      description="上传 perf.data 与可选 binary_cache 文件集合，服务端会调用 simpleperf/scripts/analyze.py 生成 JSON/TXT/folded stack。"
    />
    <Form form={form} layout="vertical" disabled={uploading}>
      <Space style={{ width: '100%' }} size={16}>
        <Form.Item label="项目名称" name="projectName" style={{ flex: 1 }}>
          <Input placeholder="如 AOE3D" />
        </Form.Item>
        <Form.Item label="版本号" name="version" style={{ flex: 1 }}>
          <Input placeholder="如 build_1234" />
        </Form.Item>
      </Space>
      <Space style={{ width: '100%' }} size={16}>
        <Form.Item label="分支" name="branch" style={{ flex: 1 }}>
          <Input placeholder="trunk / release" />
        </Form.Item>
        <Form.Item label="Build ID" name="buildId" style={{ flex: 1 }}>
          <Input placeholder="CI 构建号" />
        </Form.Item>
      </Space>
      <Space style={{ width: '100%' }} size={16}>
        <Form.Item label="设备" name="device" style={{ flex: 1 }}>
          <Input placeholder="如 Xiaomi 14" />
        </Form.Item>
        <Form.Item label="场景" name="scene" style={{ flex: 1 }}>
          <Input placeholder="如 主城/战斗" />
        </Form.Item>
      </Space>
      <Space style={{ width: '100%' }} size={16}>
        <Form.Item label="runId（可选）" name="runId" style={{ flex: 1 }}>
          <Input placeholder="同一次运行的多源关联 ID" />
        </Form.Item>
        <Form.Item label="Top N" name="simpleperfTopN" initialValue={60} style={{ flex: 1 }}>
          <InputNumber min={20} max={200} style={{ width: '100%' }} />
        </Form.Item>
      </Space>
      <Form.Item label="AI 分析模型" name="simpleperfAiModel" initialValue="mock">
        <Select
          options={[
            { value: 'mock', label: '规则版（快速，不消耗 token）' },
            { value: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6（生成 AI 业务分析）' },
            { value: 'claude-opus-4.6', label: 'Claude Opus 4.6（更强推理）' },
          ]}
        />
      </Form.Item>
      <Form.Item label="火焰图线程过滤（可选）" name="flamegraphThread">
        <Input placeholder="如 UnityMain；留空则生成全量 folded stack" />
      </Form.Item>
      <Form.Item
        label="服务端本地 binary_cache 路径（测试环境推荐）"
        name="binaryCacheLocalPath"
        initialValue={DEFAULT_SIMPLEPERF_BINARY_CACHE_PATH}
        extra="如果 perf.data 旁边已有 binary_cache，或服务端能直接访问符号目录，建议填这里；填写后不会上传下方 binary_cache 目录。"
      >
        <Input placeholder="如 k:/AI/PerfAnalysisTool_Codebuddy/simpleperf/symbols/binary_cache" />
      </Form.Item>
    </Form>

    <Alert
      type="warning"
      showIcon
      style={{ marginBottom: 12 }}
      message="避免上传超大符号目录"
      description="app_profiler.py 默认会在采集后通过 binary_cache_builder.py 生成 binary_cache。若当前 Web 服务能访问该目录，直接填写本地路径即可，不需要把 1GB+ 符号文件通过浏览器上传。"
    />

    <Card size="small" style={{ marginBottom: 12 }}>
      <AntUpload.Dragger
        accept=".data"
        multiple={false}
        maxCount={1}
        beforeUpload={(f) => { onPerfDataChange(f); return false; }}
        onRemove={() => onPerfDataChange(null)}
        disabled={uploading}
      >
        <p className="ant-upload-drag-icon"><InboxOutlined /></p>
        <p className="ant-upload-text" style={{ color: 'var(--text-secondary)', fontSize: 13 }}>点击或拖拽 perf.data</p>
        <p className="ant-upload-hint" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>{perfData ? perfData.name : 'simpleperf record 输出文件'}</p>
      </AntUpload.Dragger>
    </Card>

    <Card size="small" style={{ marginBottom: 12 }}>
      <Alert
        type="info"
        showIcon
        message="当前默认不通过浏览器上传 binary_cache"
        description="测试阶段请使用上方服务端本地路径。避免把 1GB+ 符号目录加入请求导致 Payload Too Large。"
      />
    </Card>

    {(uploading || logs.length > 0) && (
      <Card size="small" title="simpleperf 上传/启动阶段" style={{ marginBottom: 12 }}>
        <Steps current={step} size="small" items={[
          { title: '选择文件' },
          { title: '上传 perf.data' },
          { title: '上传符号' },
          { title: '启动分析' },
          { title: '报告页' },
        ]} />
        <Progress percent={Math.min(step * 25, 100)} status={uploading ? 'active' : step >= 4 ? 'success' : 'normal'} style={{ marginTop: 12 }} />
        <Alert type="info" showIcon message={stageText} style={{ marginTop: 12 }} />
        {logs.length > 0 && (
          <div style={{ marginTop: 10, padding: 10, background: 'var(--bg-root)', border: '1px solid var(--border-primary)', borderRadius: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            {logs.map((line, idx) => <div key={idx}>{line}</div>)}
          </div>
        )}
      </Card>
    )}

    <Button type="primary" size="large" block loading={uploading} disabled={!perfData} onClick={onSubmit}>
      上传并开始 simpleperf 分析
    </Button>
  </Card>
);

export default Upload;
