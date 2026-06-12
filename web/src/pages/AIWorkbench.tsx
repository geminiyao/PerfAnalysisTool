import React, { useState } from 'react';
import { Alert, Card, Col, Input, Row, Segmented, Space, Tag, Typography } from 'antd';
import { ExperimentOutlined, FileSearchOutlined, RobotOutlined } from '@ant-design/icons';
import AIChatPanel from '../components/AIChatPanel';

const { Text } = Typography;

const simpleperfPrompt = `请作为 Android native simpleperf 性能分析助手，先说明我应该提供哪些输入文件和分析产物，然后给出一次 simpleperf 单次分析的验证步骤。`;

const AIWorkbench: React.FC = () => {
  const [contextType, setContextType] = useState<'simpleperf' | 'profiler' | 'general'>('simpleperf');
  const [prompt, setPrompt] = useState(simpleperfPrompt);

  return (
    <div style={{ height: 'calc(100vh - 32px)' }}>
      <Row gutter={16} style={{ height: '100%' }}>
        <Col span={7} style={{ height: '100%', overflowY: 'auto' }}>
          <h1 style={{ color: 'var(--text-primary)', marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
            AI 分析工作台
          </h1>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="P2 验证范围"
            description="此模块先作为独立 AI 对话工作台接入，优先用于 simpleperf 分析验证；暂不替换现有 .pdata 上传分析流程。"
          />

          <Card size="small" title={<Space><ExperimentOutlined />验证场景</Space>} style={{ marginBottom: 12 }}>
            <Segmented
              block
              value={contextType}
              onChange={(v) => setContextType(v as any)}
              options={[
                { label: 'simpleperf', value: 'simpleperf' },
                { label: 'Profiler', value: 'profiler' },
                { label: '通用', value: 'general' },
              ]}
            />
            <div style={{ marginTop: 12 }}>
              <Tag color="blue">当前优先验证 simpleperf</Tag>
              <Tag color="default">不影响 pdata</Tag>
            </div>
          </Card>

          <Card size="small" title={<Space><FileSearchOutlined />simpleperf 输入清单</Space>} style={{ marginBottom: 12 }}>
            <ul style={{ color: 'var(--text-secondary)', paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
              <li><code>perf.data</code> 或多次采集目录</li>
              <li><code>binary_cache/</code> 与符号文件</li>
              <li>单次分析 JSON / 文本摘要 / folded stack</li>
              <li>A/B 对比结果与采集元数据</li>
            </ul>
          </Card>

          <Card size="small" title={<Space><RobotOutlined />首轮提示词草稿</Space>}>
            <Input.TextArea
              rows={7}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              右侧发送前可直接复制，或使用快捷提示词验证模型/流式链路。
            </Text>
          </Card>
        </Col>

        <Col span={17} style={{ height: '100%' }}>
          <AIChatPanel contextType={contextType} initialPrompt={prompt} />
        </Col>
      </Row>
    </div>
  );
};

export default AIWorkbench;
