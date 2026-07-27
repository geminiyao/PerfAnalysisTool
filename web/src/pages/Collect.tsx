import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Badge, Button, Card, Checkbox, Col, Empty, Input, InputNumber, Row, Select, Space, Spin, Steps,
  Switch, Tag, Typography, message,
} from 'antd';
import {
  ThunderboltOutlined, ReloadOutlined, MobileOutlined, VideoCameraOutlined,
  AimOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined,
  PlayCircleOutlined, StopOutlined, DatabaseOutlined, ArrowRightOutlined,
  EnvironmentOutlined, AppstoreOutlined, ExperimentOutlined,
} from '@ant-design/icons';
import {
  listCollectConfigs, getCollectConfigDetail, checkCollectDevice, startCollect, getCollectJob,
  stopCollectJob, ingestCollectJob, subscribeCollectLogs, listCollectHistory, ingestCollectDir,
  type CollectConfigSummary, type CollectConfigDetail, type CollectDevice,
  type CollectJobInfo, type CollectLogEvent, type CollectHistoryItem,
} from '../services/api';

const { Text, Paragraph } = Typography;

// ---------------------------------------------------------------------------
// Primitive 图标 / 标签
// ---------------------------------------------------------------------------
const PRIMITIVE_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  enter_scene: { icon: <EnvironmentOutlined />, label: '进入场景', color: '#1677ff' },
  camera_sweep: { icon: <VideoCameraOutlined />, label: '相机移动', color: '#722ed1' },
  wait_duration: { icon: <LoadingOutlined />, label: '等待', color: '#8b949e' },
  stress_test: { icon: <AimOutlined />, label: '压测', color: '#fa541c' },
};

function primitiveMeta(name: string) {
  return PRIMITIVE_META[name] ?? { icon: <AppstoreOutlined />, label: name, color: '#5a6068' };
}

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------
const Collect: React.FC = () => {
  const navigate = useNavigate();

  const [configs, setConfigs] = useState<CollectConfigSummary[]>([]);
  const [configsLoading, setConfigsLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined);
  const [configDetail, setConfigDetail] = useState<CollectConfigDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [devices, setDevices] = useState<CollectDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<string | undefined>(undefined);

  // 可编辑参数 (默认值从 YAML 读)
  const [label, setLabel] = useState('');
  const [runs, setRuns] = useState(1);
  const [defaultDuration, setDefaultDuration] = useState(60);
  const [actionSteps, setActionSteps] = useState<{ primitive: string; params: Record<string, any> }[]>([]);
  const [selectedTools, setSelectedTools] = useState<string[]>(['unity']);
  const [projectName, setProjectName] = useState('');
  const [packageName, setPackageName] = useState('');
  const [sceneLabel, setSceneLabel] = useState('');
  const [sceneName, setSceneName] = useState('');

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<CollectJobInfo | null>(null);
  const [logs, setLogs] = useState<CollectLogEvent[]>([]);
  const [starting, setStarting] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [history, setHistory] = useState<CollectHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  // --- 加载配置列表 ---
  const loadConfigs = useCallback(async () => {
    setConfigsLoading(true);
    try {
      const res = await listCollectConfigs();
      setConfigs(res.configs);
      if (res.configs.length > 0) {
        setSelectedFile(res.configs[0].file);
      }
    } catch (e: any) {
      message.error(`加载采集配置失败: ${e.message}`);
    } finally {
      setConfigsLoading(false);
    }
  }, []);

  // --- 加载配置详情 (选中配置变化时) ---
  useEffect(() => {
    if (!selectedFile) { setConfigDetail(null); return; }
    setDetailLoading(true);
    getCollectConfigDetail(selectedFile)
      .then(detail => {
        setConfigDetail(detail);
        // 用 YAML 默认值填充表单
        setLabel(detail.summary.sceneLabel || '');
        setRuns(1);
        setProjectName(detail.yaml?.project?.name ?? '');
        setPackageName(detail.yaml?.project?.package ?? '');
        setSceneLabel(detail.yaml?.scenes?.default?.label ?? '');
        setSceneName(detail.yaml?.scenes?.default?.scene ?? '');
        // 从 YAML action 段提取可编辑参数
        const action = detail.yaml?.action ?? {};
        setDefaultDuration(action.defaultDuration ?? 60);
        // 从 YAML tools 段提取勾选状态
        const tools = detail.summary.tools;
        const initTools: string[] = [];
        if (tools.unity) initTools.push('unity');
        if (tools.simpleperf) initTools.push('simpleperf');
        if (tools.perfetto) initTools.push('perfetto');
        setSelectedTools(initTools.length > 0 ? initTools : ['unity']);
        setActionSteps(
          (action.steps ?? []).map((s: any) => ({
            primitive: s.primitive ?? '?',
            params: { ...(s.params ?? {}) },  // 深拷贝, 避免修改原始对象
          })),
        );
      })
      .catch(e => message.error(`加载配置详情失败: ${e.message}`))
      .finally(() => setDetailLoading(false));
  }, [selectedFile]);

  // --- 探测设备 ---
  const loadDevices = useCallback(async (pkg?: string) => {
    setDevicesLoading(true);
    try {
      // 如果有选中配置, 用其 package 探测游戏进程
      const targetPkg = pkg ?? configDetail?.summary.package;
      const res = await checkCollectDevice(targetPkg || undefined);
      setDevices(res.devices);
      // 如果之前选中的设备不在列表中了, 清空
      if (selectedDevice && !res.devices.find(d => d.serial === selectedDevice)) {
        setSelectedDevice(res.devices[0]?.serial);
      } else if (!selectedDevice && res.devices.length > 0) {
        setSelectedDevice(res.devices[0].serial);
      }
    } catch (e: any) {
      message.error(`设备探测失败: ${e.message}`);
    } finally {
      setDevicesLoading(false);
    }
  }, [selectedDevice, configDetail]);

  useEffect(() => { loadConfigs(); }, []);
  useEffect(() => { loadDevices(); }, []);

  // --- 派生状态 (必须在引用它的 useEffect 之前声明) ---
  const isCollecting = job?.status === 'processing';
  const isIngesting = job?.ingestStatus === 'processing';
  const collectDone = job?.status === 'done';
  const ingestDone = job?.ingestStatus === 'done';

  // --- 自动轮询设备状态 (每 10s, 仅在空闲时) ---
  useEffect(() => {
    if (isCollecting || isIngesting) return;
    const timer = setInterval(() => loadDevices(), 10000);
    return () => clearInterval(timer);
  }, [loadDevices, isCollecting, isIngesting]);

  // --- 配置切换后重新探测设备 (带 package) ---
  useEffect(() => {
    if (configDetail?.summary.package) {
      loadDevices(configDetail.summary.package);
    }
  }, [configDetail?.summary.package]);

  // --- 日志自动滚动 ---
  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [logs]);

  // --- SSE 订阅 ---
  const subscribe = useCallback((id: string) => {
    unsubRef.current?.();
    setLogs([]);
    unsubRef.current = subscribeCollectLogs(id, (evt) => {
      if (evt.type === 'connected') return;
      setLogs(prev => [...prev.slice(-400), evt]);
      if (evt.type === 'done' || evt.type === 'failed') {
        getCollectJob(id).then(res => setJob(res.job)).catch(() => {});
      }
    });
  }, []);

  useEffect(() => () => { unsubRef.current?.(); }, []);

  // --- 启动采集 ---
  const handleStart = async () => {
    if (!selectedFile) { message.warning('请先选择采集配置'); return; }
    if (devices.length === 0) { message.warning('未检测到设备'); return; }
    setStarting(true);
    setJob(null);
    try {
      const res = await startCollect({
        config: selectedFile,
        label: label || undefined,
        runs,
        device: selectedDevice,
        tools: selectedTools,
        configOverrides: {
          project: { name: projectName, package: packageName },
          scenes: { default: { scene: sceneName, label: sceneLabel } },
          action: actionSteps.length > 0
            ? { defaultDuration, steps: actionSteps }
            : undefined,
        },
      });
      setJobId(res.jobId);
      subscribe(res.jobId);
      const jobRes = await getCollectJob(res.jobId);
      setJob(jobRes.job);
      setLogs(jobRes.events);
    } catch (e: any) {
      message.error(`启动采集失败: ${e.message}`);
    } finally {
      setStarting(false);
    }
  };

  // --- 入库预处理 ---
  const handleIngest = async () => {
    if (!jobId) return;
    setIngesting(true);
    try {
      await ingestCollectJob(jobId);
      message.info('入库预处理已启动');
    } catch (e: any) {
      message.error(`入库启动失败: ${e.message}`);
    } finally {
      setIngesting(false);
    }
  };

  // --- 中止 ---
  const handleStop = async () => {
    if (!jobId) return;
    try { await stopCollectJob(jobId); message.info('已发送终止信号'); }
    catch (e: any) { message.error(`终止失败: ${e.message}`); }
  };

  // --- 历史采集列表 ---
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await listCollectHistory();
      setHistory(res.history);
    } catch (e: any) {
      message.error(`加载历史采集失败: ${e.message}`);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, []);

  // --- 历史目录入库 ---
  const handleIngestDir = async (dir: string) => {
    setIngesting(true);
    try {
      const res = await ingestCollectDir(dir);
      setJobId(res.jobId);
      setJob(null);
      subscribe(res.jobId);
      const jobRes = await getCollectJob(res.jobId);
      setJob(jobRes.job);
      setLogs(jobRes.events);
      message.info('入库预处理已启动');
    } catch (e: any) {
      message.error(`入库启动失败: ${e.message}`);
    } finally {
      setIngesting(false);
    }
  };

  // --- Steps 进度 ---
  const currentStep = useMemo(() => {
    if (!job) return -1;
    if (ingestDone) return 3;
    if (job.ingestStatus === 'processing') return 2;
    if (collectDone) return 1;
    if (isCollecting) return 0;
    if (job.status === 'failed') return -2;
    return -1;
  }, [job, isCollecting, collectDone, ingestDone]);

  const selectedSummary = configDetail?.summary;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* 页面标题 */}
      <div style={{ marginBottom: 16 }}>
        <Space align="center">
          <ThunderboltOutlined style={{ fontSize: 20, color: 'var(--color-primary)' }} />
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>
            自动采集
          </h1>
        </Space>
        <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
          选择采集用例 → 探测设备 → 一键采集 → 入库预处理 → AI 分析。采集结果自动写入 Runs，串联 Dashboard / 分析全流程。
        </Text>
      </div>

      {/* 流程管线 Steps */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Steps
          size="small"
          current={currentStep < 0 ? 0 : currentStep}
          status={job?.status === 'failed' || job?.ingestStatus === 'failed' ? 'error' : undefined}
          items={[
            { title: '采集', description: isCollecting ? 'ADB 采集中...' : collectDone ? '完成' : '选择配置并启动' },
            { title: '入库预处理', description: isIngesting ? '预处理中...' : ingestDone ? '完成' : collectDone ? '待执行' : '—' },
            { title: 'Run Ready', description: ingestDone ? job?.ingestRunId : '—' },
            { title: 'AI 分析', description: ingestDone ? '可执行' : '—' },
          ]}
        />
      </Card>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {/* ===== 1. 配置选择 + 参数 ===== */}
        <Card
          size="small"
          title={<Space><AppstoreOutlined style={{ color: 'var(--color-primary)' }} /><span>采集用例</span></Space>}
          extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadConfigs} loading={configsLoading}>刷新列表</Button>}
        >
          {configsLoading ? (
            <div style={{ textAlign: 'center', padding: 30 }}><Spin tip="扫描 projects/ ..." /></div>
          ) : configs.length === 0 ? (
            <Empty description={
              <span style={{ fontSize: 12 }}>
                未找到采集配置。请在 <code style={{ fontFamily: 'var(--font-mono)' }}>projects/&lt;项目&gt;/collect-*.yaml</code> 放置配置
              </span>
            } />
          ) : (
            <>
              {/* 下拉选择 */}
              <Select
                style={{ width: '100%', marginBottom: 12 }}
                size="large"
                value={selectedFile}
                onChange={setSelectedFile}
                disabled={isCollecting || isIngesting}
                loading={detailLoading}
                options={configs.map(c => ({
                  value: c.file,
                  label: (
                    <Space>
                      <Tag color={c.project} style={{ fontSize: 10, margin: 0 }}>{c.project}</Tag>
                      <span>{c.name}</span>
                      <Text type="secondary" style={{ fontSize: 11 }}>{c.sceneLabel}</Text>
                    </Space>
                  ),
                }))}
              />

              {/* 选中配置的参数展示 */}
              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: 20 }}><Spin size="small" /></div>
              ) : selectedSummary ? (
                <div style={{ background: 'var(--bg-card-inner)', borderRadius: 'var(--radius)', border: '1px solid var(--border-primary)', padding: 14 }}>
                  {/* 描述 */}
                  <Text style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 10 }}>
                    {selectedSummary.description}
                  </Text>

                  {/* 可编辑基础信息 */}
                  <Row gutter={[12, 8]} style={{ marginBottom: 10 }}>
                    <Col xs={24} sm={12} md={6}>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>项目名</Text>
                      <Input
                        size="small" value={projectName}
                        onChange={e => setProjectName(e.target.value)}
                        disabled={isCollecting || isIngesting}
                      />
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>包名</Text>
                      <Input
                        size="small" value={packageName}
                        onChange={e => setPackageName(e.target.value)}
                        disabled={isCollecting || isIngesting}
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
                      />
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>场景标签</Text>
                      <Input
                        size="small" value={sceneLabel}
                        onChange={e => setSceneLabel(e.target.value)}
                        disabled={isCollecting || isIngesting}
                      />
                    </Col>
                    <Col xs={24} sm={12} md={6}>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>场景名</Text>
                      <Input
                        size="small" value={sceneName}
                        onChange={e => setSceneName(e.target.value)}
                        disabled={isCollecting || isIngesting}
                        style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}
                      />
                    </Col>
                  </Row>

                  {/* 采集工具勾选 */}
                  <div style={{ marginBottom: 10 }}>
                    <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>采集数据类型</Text>
                    <Checkbox.Group
                      value={selectedTools}
                      onChange={(vals) => {
                        if ((vals as string[]).length === 0) {
                          message.warning('至少需要选择一个采集工具');
                          return;
                        }
                        setSelectedTools(vals as string[]);
                      }}
                      disabled={isCollecting || isIngesting}
                      options={[
                        { label: 'Unity Profiler', value: 'unity' },
                        { label: 'Simpleperf', value: 'simpleperf' },
                        { label: 'Perfetto', value: 'perfetto' },
                      ]}
                    />
                  </div>

                  {/* 通用可编辑参数 */}
                  <div style={{ borderTop: '1px solid var(--border-primary)', paddingTop: 12, marginTop: 4 }}>
                    <Space wrap size={[16, 8]}>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>采集标签</Text>
                        <Input
                          placeholder={selectedSummary.sceneLabel || '留空用默认'}
                          value={label}
                          onChange={e => setLabel(e.target.value)}
                          disabled={isCollecting || isIngesting}
                          size="small"
                          style={{ width: 180 }}
                        />
                      </div>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>采集次数</Text>
                        <InputNumber
                          min={1} max={10}
                          value={runs}
                          onChange={v => setRuns(v ?? 1)}
                          disabled={isCollecting || isIngesting}
                          size="small"
                          style={{ width: 100 }}
                        />
                      </div>
                      <div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>默认时长 (s)</Text>
                        <InputNumber
                          min={1} max={3600}
                          value={defaultDuration}
                          onChange={v => setDefaultDuration(v ?? 60)}
                          disabled={isCollecting || isIngesting}
                          size="small"
                          style={{ width: 100 }}
                        />
                      </div>
                    </Space>
                  </div>

                  {/* 各 Step 的可编辑参数 */}
                  {actionSteps.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>
                        动作步骤参数 (可直接编辑, 覆盖 YAML 默认值):
                      </Text>
                      {actionSteps.map((step, stepIdx) => {
                        const meta = primitiveMeta(step.primitive);
                        return (
                          <div
                            key={stepIdx}
                            style={{
                              marginBottom: 8,
                              borderRadius: 'var(--radius)',
                              border: `1px solid ${meta.color}40`,
                              background: 'var(--bg-card)',
                              padding: '10px 12px',
                            }}
                          >
                            {/* Step 标题 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                              <span style={{ color: meta.color, fontSize: 13 }}>{meta.icon}</span>
                              <Text strong style={{ fontSize: 12 }}>{meta.label}</Text>
                              <Tag style={{ fontSize: 10, margin: 0, color: meta.color, borderColor: meta.color }}>{step.primitive}</Tag>
                              {stepIdx < actionSteps.length - 1 && (
                                <ArrowRightOutlined style={{ fontSize: 10, color: 'var(--text-tertiary)', marginLeft: 'auto' }} />
                              )}
                            </div>
                            {/* 参数表单 */}
                            <Row gutter={[12, 8]}>
                              {Object.entries(step.params).map(([key, val]) => (
                                <ParamField
                                  key={key}
                                  paramKey={key}
                                  value={val}
                                  disabled={isCollecting || isIngesting}
                                  onChange={(newVal) => {
                                    setActionSteps(prev => {
                                      const copy = [...prev];
                                      copy[stepIdx] = { ...copy[stepIdx], params: { ...copy[stepIdx].params, [key]: newVal } };
                                      return copy;
                                    });
                                  }}
                                />
                              ))}
                            </Row>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </>
          )}
        </Card>

        {/* ===== 设备连接检测 ===== */}
        <Card
          size="small"
          title={
            <Space>
              <MobileOutlined style={{ color: 'var(--color-primary)' }} />
              <span>设备连接</span>
              {devices.length > 0 ? (
                <Badge count={devices.length} style={{ backgroundColor: 'var(--color-success)' }} />
              ) : null}
            </Space>
          }
          extra={
            <Space size={8}>
              {!isCollecting && !isIngesting && devices.length > 0 && (
                <Text type="secondary" style={{ fontSize: 11 }}>
                  <LoadingOutlined style={{ marginRight: 4, fontSize: 10 }} />
                  自动刷新中
                </Text>
              )}
              <Button size="small" icon={<ReloadOutlined />} onClick={() => loadDevices()} loading={devicesLoading}>刷新</Button>
            </Space>
          }
        >
          {devicesLoading && devices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Spin tip="正在检测已连接设备..." />
            </div>
          ) : devices.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={
              <span style={{ fontSize: 12 }}>
                未检测到设备。请 <code style={{ fontFamily: 'var(--font-mono)' }}>adb connect</code> 或连接 USB 后点击刷新
              </span>
            } />
          ) : (
            <Space direction="vertical" size={8} style={{ width: '100%' }}>
              {/* 连接状态横幅 */}
              <div style={{
                padding: '6px 12px',
                borderRadius: 'var(--radius)',
                background: 'var(--color-success-bg)',
                border: '1px solid rgba(46,160,67,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <Badge status="success" />
                <Text style={{ fontSize: 12, color: 'var(--color-success)' }}>
                  已连接 {devices.length} 台设备
                </Text>
              </div>

              {/* 设备列表 */}
              {devices.map(d => {
                const active = d.serial === selectedDevice;
                const gameRunning = !!d.appPid;
                return (
                  <div
                    key={d.serial}
                    onClick={() => !isCollecting && !isIngesting && d.state === 'device' && setSelectedDevice(d.serial)}
                    style={{
                      cursor: isCollecting || isIngesting ? 'not-allowed' : d.state === 'device' ? 'pointer' : 'not-allowed',
                      borderRadius: 'var(--radius)',
                      border: `1px solid ${active ? 'var(--border-active)' : 'var(--border-secondary)'}`,
                      background: active ? 'var(--color-primary-bg)' : 'var(--bg-card-inner)',
                      padding: '12px 14px',
                      transition: 'all 0.2s',
                      opacity: d.state === 'device' ? 1 : 0.5,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Space>
                        {active ? (
                          <CheckCircleOutlined style={{ color: 'var(--color-primary)', fontSize: 15 }} />
                        ) : (
                          <Badge status={d.state === 'device' ? 'success' : 'error'} />
                        )}
                        <Text strong style={{ fontSize: 13 }}>{d.model || 'Unknown Device'}</Text>
                      </Space>
                      <Space size={6}>
                        {gameRunning ? (
                          <Tag color="green" style={{ fontSize: 10, margin: 0 }}>游戏运行中</Tag>
                        ) : d.state === 'device' ? (
                          <Tag style={{ fontSize: 10, margin: 0 }}>游戏未启动</Tag>
                        ) : (
                          <Tag color="error" style={{ fontSize: 10, margin: 0 }}>{d.state}</Tag>
                        )}
                      </Space>
                    </div>
                    {/* 设备详情 */}
                    <div style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Serial: <Text style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{d.serial}</Text>
                      </Text>
                      {d.abi && (
                        <Text type="secondary" style={{ fontSize: 11 }}>ABI: {d.abi}</Text>
                      )}
                      {d.androidVersion && (
                        <Text type="secondary" style={{ fontSize: 11 }}>Android {d.androidVersion}</Text>
                      )}
                      {d.appVersion && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          版本: <Text style={{ fontSize: 11, color: 'var(--color-success)' }}>{d.appVersion}</Text>
                        </Text>
                      )}
                      {d.appPid && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          PID: <Text style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{d.appPid}</Text>
                        </Text>
                      )}
                    </div>
                  </div>
                );
              })}
            </Space>
          )}
        </Card>

        {/* ===== 3. 操作按钮 ===== */}
        <Card size="small">
          <Space wrap>
            {isCollecting ? (
              <Button danger icon={<StopOutlined />} onClick={handleStop}>终止采集</Button>
            ) : (
              <Button
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={handleStart}
                loading={starting}
                disabled={!selectedFile || devices.length === 0}
                size="large"
              >
                开始采集
              </Button>
            )}
            {collectDone && !ingestDone && !isIngesting && (
              <Button
                type="primary"
                ghost
                icon={<DatabaseOutlined />}
                onClick={handleIngest}
                loading={ingesting}
                size="large"
              >
                入库预处理
              </Button>
            )}
            {ingestDone && job?.ingestRunId && (
              <>
                <Button
                  type="primary"
                  icon={<ExperimentOutlined />}
                  onClick={() => navigate(`/runs/${job.ingestRunId}`)}
                  size="large"
                >
                  前往 AI 分析
                </Button>
                <Button onClick={() => navigate('/runs')}>Runs 列表</Button>
                <Button onClick={() => navigate('/')}>仪表盘</Button>
              </>
            )}
          </Space>
        </Card>

        {/* ===== 4. 采集 + 入库日志终端 ===== */}
        {(job || logs.length > 0) && (
          <Card
            size="small"
            title={
              <Space>
                {isCollecting && <LoadingOutlined style={{ color: 'var(--color-primary)' }} />}
                {ingestDone && <CheckCircleOutlined style={{ color: 'var(--color-success)' }} />}
                {job?.status === 'failed' || job?.ingestStatus === 'failed'
                  ? <CloseCircleOutlined style={{ color: 'var(--color-error)' }} />
                  : null}
                <span>执行日志</span>
              </Space>
            }
          >
            <div
              style={{
                maxHeight: 380,
                overflow: 'auto',
                background: 'var(--bg-root)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border-primary)',
                padding: '10px 12px',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              {logs.map((ev, i) => <LogLine key={i} event={ev} />)}
              <div ref={logEndRef} />
            </div>

            {/* 错误提示 */}
            {(job?.status === 'failed' || job?.ingestStatus === 'failed') && (
              <Alert
                type="error"
                showIcon
                style={{ marginTop: 12 }}
                message={job.ingestStatus === 'failed' ? '入库预处理失败' : `采集失败${job.exitCode != null ? ` (exit ${job.exitCode})` : ''}`}
                description={job.error}
              />
            )}
          </Card>
        )}

        {/* ===== 历史采集 ===== */}
        <Card
          size="small"
          title={
            <Space>
              <DatabaseOutlined style={{ color: 'var(--color-primary)' }} />
              <span>历史采集</span>
              {history.length > 0 && <Tag style={{ fontSize: 11 }}>{history.length}</Tag>}
            </Space>
          }
          extra={<Button size="small" icon={<ReloadOutlined />} onClick={loadHistory} loading={historyLoading}>刷新</Button>}
        >
          {historyLoading ? (
            <div style={{ textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
          ) : history.length === 0 ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span style={{ fontSize: 12 }}>暂无历史采集记录</span>} />
          ) : (
            <div style={{ maxHeight: 300, overflow: 'auto' }}>
              {history.map(item => (
                <div
                  key={item.dir}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderBottom: '1px solid var(--border-primary)',
                    gap: 8,
                  }}
                >
                  {/* 左侧: 信息 */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Text strong style={{ fontSize: 12 }}>{item.runLabel}</Text>
                      {item.profileOk && <Tag color="green" style={{ fontSize: 10, margin: 0 }}>profile OK</Tag>}
                    </div>
                    <div style={{ marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>{item.project}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{item.device}</Text>
                      {item.scene && <Text type="secondary" style={{ fontSize: 11 }}>{item.scene}</Text>}
                      {item.version && <Text type="secondary" style={{ fontSize: 11 }}>v{item.version}</Text>}
                      {item.frameCount != null && <Text type="secondary" style={{ fontSize: 11 }}>{item.frameCount} 帧</Text>}
                      {item.durationSec != null && <Text type="secondary" style={{ fontSize: 11 }}>{item.durationSec}s</Text>}
                      {item.tools.length > 0 && (
                        <Space size={2}>
                          {item.tools.map(t => <Tag key={t} style={{ fontSize: 9, margin: 0 }}>{t.replace('unity-profiler', 'unity')}</Tag>)}
                        </Space>
                      )}
                    </div>
                  </div>
                  {/* 右侧: 操作 */}
                  <Space size={6} shrink={0}>
                    <Text type="secondary" style={{ fontSize: 10 }}>
                      {new Date(item.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Button
                      size="small"
                      type="primary"
                      ghost
                      icon={<DatabaseOutlined />}
                      loading={ingesting}
                      disabled={isCollecting || isIngesting}
                      onClick={() => handleIngestDir(item.dir)}
                    >
                      入库
                    </Button>
                  </Space>
                </div>
              ))}
            </div>
          )}
        </Card>
      </Space>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 日志行渲染
// ---------------------------------------------------------------------------

function LogLine({ event }: { event: CollectLogEvent }) {
  const time = new Date(event.createdAt).toLocaleTimeString('zh-CN', { hour12: false });

  let color = 'var(--text-secondary)';
  let prefix = '';
  if (event.type === 'stage') { color = 'var(--color-primary)'; prefix = '▶ '; }
  else if (event.type === 'done') { color = 'var(--color-success)'; prefix = '✓ '; }
  else if (event.type === 'failed') { color = 'var(--color-error)'; prefix = '✗ '; }

  const msg = event.message;
  let rendered: React.ReactNode = msg;
  if (/\[INFO\]/.test(msg)) {
    rendered = <span style={{ color: 'var(--text-secondary)' }}>{msg}</span>;
  } else if (/\[WARN\]/.test(msg)) {
    rendered = <span style={{ color: 'var(--color-warning)' }}>{msg}</span>;
  } else if (/\[OK\]/.test(msg)) {
    rendered = <span style={{ color: 'var(--color-success)' }}>{msg}</span>;
  } else if (/\[ERROR\]|\berror\b|Traceback/i.test(msg)) {
    rendered = <span style={{ color: 'var(--color-error)' }}>{msg}</span>;
  } else if (/\[ingest\]/.test(msg)) {
    rendered = <span style={{ color: 'var(--color-primary-hover)' }}>{msg}</span>;
  } else if (event.type === 'stage' || event.type === 'done' || event.type === 'failed') {
    rendered = <span style={{ color, fontWeight: 600 }}>{prefix}{msg}</span>;
  }

  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
      <span style={{ color: 'var(--text-tertiary)', marginRight: 8 }}>{time}</span>
      {rendered}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 参数字段组件 — 根据 value 类型自动渲染对应控件
// ---------------------------------------------------------------------------

/** 参数 key 的中文标签映射 */
const PARAM_LABELS: Record<string, string> = {
  duration: '时长(s)',
  scene: '场景',
  coord: '坐标',
  pattern: '移动模式',
  from_grid: '起点网格',
  to_grid: '终点网格',
  center_grid: '中心网格',
  start_grid: '起点网格',
  end_grid: '终点网格',
  rounds: '来回轮数',
  enable: '启用移动',
  type: '压测类型',
  army_id: '军队ID',
  army_count: '部队数量',
  range_grid: '范围(格)',
  radius: '随机半径',
};

/** 已知的枚举选项 */
const ENUM_OPTIONS: Record<string, string[]> = {
  pattern: ['move_to_grid', 'back_forth'],
  type: ['battle', 'march'],
};

function paramLabel(key: string): string {
  return PARAM_LABELS[key] ?? key;
}

function ParamField({ paramKey, value, disabled, onChange }: {
  paramKey: string;
  value: any;
  disabled: boolean;
  onChange: (newVal: any) => void;
}) {
  const label = paramLabel(paramKey);
  const labelEl = <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 3 }}>{label}</Text>;

  // 数组 [x, y] → 两个 InputNumber
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number') {
    return (
      <Col xs={24} sm={12} md={8}>
        {labelEl}
        <Space size={4}>
          <InputNumber
            size="small" style={{ width: 80 }}
            value={value[0]} disabled={disabled}
            onChange={v => onChange([v ?? 0, value[1]])}
          />
          <Text type="secondary" style={{ fontSize: 11 }}>,</Text>
          <InputNumber
            size="small" style={{ width: 80 }}
            value={value[1]} disabled={disabled}
            onChange={v => onChange([value[0], v ?? 0])}
          />
        </Space>
      </Col>
    );
  }

  // 布尔 → Switch
  if (typeof value === 'boolean') {
    return (
      <Col xs={24} sm={12} md={8}>
        {labelEl}
        <Switch size="small" checked={value} disabled={disabled} onChange={checked => onChange(checked)} />
      </Col>
    );
  }

  // 数字 → InputNumber
  if (typeof value === 'number') {
    return (
      <Col xs={24} sm={12} md={8}>
        {labelEl}
        <InputNumber
          size="small" style={{ width: '100%' }}
          value={value} disabled={disabled}
          onChange={v => onChange(v ?? 0)}
        />
      </Col>
    );
  }

  // 枚举字符串 → Select
  if (typeof value === 'string' && ENUM_OPTIONS[paramKey]) {
    return (
      <Col xs={24} sm={12} md={8}>
        {labelEl}
        <Select
          size="small" style={{ width: '100%' }}
          value={value} disabled={disabled}
          onChange={v => onChange(v)}
          options={ENUM_OPTIONS[paramKey].map(opt => ({ value: opt, label: opt }))}
        />
      </Col>
    );
  }

  // 普通字符串 → Input
  return (
    <Col xs={24} sm={12} md={8}>
      {labelEl}
      <Input
        size="small" style={{ width: '100%' }}
        value={value} disabled={disabled}
        onChange={e => onChange(e.target.value)}
      />
    </Col>
  );
}

export default Collect;
