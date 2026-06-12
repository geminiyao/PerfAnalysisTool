import React from 'react';
import { Alert, Card, Col, Row, Statistic, Steps, Tag, Typography } from 'antd';

const { Text } = Typography;

const Runs: React.FC = () => (
  <div>
    <h1 style={{ color: 'var(--text-primary)', marginBottom: 16, fontSize: 16, fontWeight: 600 }}>Runs</h1>
    <Alert
      showIcon
      type="info"
      style={{ marginBottom: 16 }}
      message="Run 是一次游戏运行的多源聚合容器"
      description="P2 先提供信息架构与关联入口占位；P4 会继续把 Profiler、simpleperf、Perfetto session 绑定到同一个 runId 下并生成综合分析。"
    />
    <Row gutter={[12, 12]}>
      <Col xs={24} md={8}><Card><Statistic title="Profiler" value="已接入" /></Card></Col>
      <Col xs={24} md={8}><Card><Statistic title="Simpleperf" value="P3 接入中" /></Card></Col>
      <Col xs={24} md={8}><Card><Statistic title="Perfetto" value="预留" /></Card></Col>
    </Row>
    <Card size="small" title="一次 Run 的推荐流程" style={{ marginTop: 16 }}>
      <Steps
        direction="vertical"
        size="small"
        items={[
          { title: '创建 Run', description: '填写项目、版本、设备、场景、expectedSources。' },
          { title: '上传/采集多源数据', description: '上传 .pdata、perf.data + binary_cache、Perfetto trace。' },
          { title: '生成单源报告', description: '分别生成 Profiler/simpleperf/Perfetto 报告。' },
          { title: '综合分析', description: '基于跨源证据链生成 AI 综合报告。' },
        ]}
      />
    </Card>
    <Card size="small" title="关联能力状态" style={{ marginTop: 16 }}>
      <Tag color="blue">手工关联入口：规划中</Tag>
      <Tag color="purple">runId 上传字段：simpleperf 已预留</Tag>
      <Tag>事后建议关联：P4</Tag>
      <div style={{ marginTop: 12 }}><Text type="secondary">当前可先在 simpleperf 上传时填写 runId，为后续多源关联做数据准备。</Text></div>
    </Card>
  </div>
);

export default Runs;
