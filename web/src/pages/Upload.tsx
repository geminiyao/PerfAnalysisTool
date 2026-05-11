import React, { useState, useRef, useEffect } from 'react';
import {
  Card, Upload as AntUpload, Form, Input, InputNumber, Button, Progress, Steps, message, Space, Alert, Select, Tooltip, Collapse,
} from 'antd';
import { InboxOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { uploadFile, startAnalysis, subscribeProgress, type AnalysisParams } from '../services/api';
import { CLI_PROVIDERS, type ProgressEvent, type CliProvider } from '../../shared/types';

const { Dragger } = AntUpload;
const { Step } = Steps;

const Upload: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cliProvider, setCliProvider] = useState<CliProvider>('codebuddy');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const unsubRef = useRef<(() => void) | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  // 日志自动滚动到底部
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleUploadAndAnalyze = async () => {
    const isMock = cliProvider === 'mock';

    if (!isMock && !file) {
      message.warning('请先选择 .pdata 文件');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      setLogs([]);
      setCurrentStep(1);

      const meta = form.getFieldsValue();
      let resultId: string;

      if (isMock) {
        // Mock 模式：用占位文件名上传一个空壳记录
        const mockBlob = new File([new ArrayBuffer(0)], 'mock-data.pdata', { type: 'application/octet-stream' });
        const result = await uploadFile(mockBlob, { ...meta, projectName: meta.projectName || 'MockProject' });
        resultId = result.id;
        message.success('Mock 会话已创建');
      } else {
        // 正常上传
        const result = await uploadFile(file!, meta);
        resultId = result.id;
        message.success('文件上传成功');
      }

      setSessionId(resultId);
      setCurrentStep(2);

      // 触发分析（带分析参数）
      const analysisParams: AnalysisParams = {
        targetFps: meta.targetFps || 30,
        jankMultiplier: meta.jankMultiplier || 2,
        bigJankMultiplier: meta.bigJankMultiplier || 3,
        budgetRatio: meta.budgetRatio || 0.3,
      };
      await startAnalysis(resultId, cliProvider, analysisParams);
      setCurrentStep(3);

      // 监听进度
      const unsub = subscribeProgress(resultId, (event: ProgressEvent) => {
        setProgress(event);

        // 收集日志
        if (event.log) {
          setLogs(prev => [...prev.slice(-200), event.log!]); // 保留最近 200 行
        }

        if (event.stage === 'completed') {
          setCurrentStep(4);
          message.success('分析完成!');
          unsub();

          // 轮询确认报告已写入 DB 再跳转（最多 3 次，间隔 1 秒）
          let retries = 0;
          const checkAndNavigate = async () => {
            try {
              const res = await fetch(`/api/report/${resultId}/content`);
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
          // 失败时停留在当前页面，不跳转
        }
      });

      unsubRef.current = unsub;
    } catch (err: any) {
      setError(err.message);
      message.error(err.message);
      setUploading(false);
    }
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <h1 style={{ color: '#fff', marginBottom: 24 }}>上传 & 分析</h1>

      {/* 进度步骤 */}
      <Steps current={currentStep} style={{ marginBottom: 32 }} size="small">
        <Step title="选择文件" />
        <Step title="上传" />
        <Step title="排队" />
        <Step title="分析中" />
        <Step title="完成" />
      </Steps>

      {/* 文件上传区域 */}
      <Card style={{ marginBottom: 16 }}>
        <Dragger
          accept=".pdata"
          multiple={false}
          maxCount={1}
          beforeUpload={(f) => {
            setFile(f);
            return false; // 阻止自动上传
          }}
          onRemove={() => setFile(null)}
          disabled={uploading}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽 .pdata 文件到此区域</p>
          <p className="ant-upload-hint">支持 Unity Profile Analyzer 导出的 .pdata 格式，单文件最大 200MB</p>
        </Dragger>
      </Card>

      {/* 元数据表单 */}
      <Card title="分析信息" style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical" disabled={uploading}>
          {/* AI 工具选择 */}
          <Form.Item
            label={
              <Space>
                AI 分析工具
                <Tooltip title="选择用于执行分析的 AI CLI 工具。不同工具可能使用不同的模型和分析策略。">
                  <QuestionCircleOutlined style={{ color: '#888' }} />
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
                    <span style={{ color: '#888', fontSize: 12 }}>{p.description}</span>
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

          {/* 分析参数 */}
          <Collapse
            size="small"
            style={{ marginBottom: 0 }}
            items={[{
              key: 'params',
              label: <span style={{ color: '#888', fontSize: 13 }}>分析参数 (可选调整)</span>,
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
                            <QuestionCircleOutlined style={{ color: '#888' }} />
                          </Tooltip>
                        </Space>
                      }
                      style={{ flex: 1 }}
                    >
                      <Input
                        disabled
                        value={`${(1000 / (form.getFieldValue('targetFps') || 30)).toFixed(1)} ms`}
                        style={{ color: '#aaa' }}
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
        <Card style={{ marginBottom: 16 }}>
          <Progress
            percent={progress.progress}
            status={progress.stage === 'failed' ? 'exception' : progress.stage === 'completed' ? 'success' : 'active'}
            strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
          />
          <p style={{ marginTop: 8, color: '#aaa' }}>{progress.message}</p>
        </Card>
      )}

      {/* CLI 实时日志 */}
      {logs.length > 0 && currentStep >= 3 && (
        <Card
          title="CLI 实时输出"
          size="small"
          style={{ marginBottom: 16 }}
          extra={<span style={{ color: '#888', fontSize: 12 }}>{logs.length} 行</span>}
        >
          <div
            style={{
              background: '#0a0a1a',
              borderRadius: 6,
              padding: '12px 16px',
              maxHeight: 300,
              overflowY: 'auto',
              fontFamily: 'Consolas, Monaco, "Courier New", monospace',
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {logs.map((line, i) => (
              <div
                key={i}
                style={{
                  color: line.startsWith('[stderr]') ? '#ff7875' : '#b5b5b5',
                  borderBottom: '1px solid #1a1a2e',
                  paddingBottom: 2,
                  marginBottom: 2,
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
        <Alert type="error" message="分析失败" description={error} showIcon style={{ marginBottom: 16 }} />
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
    </div>
  );
};

export default Upload;
