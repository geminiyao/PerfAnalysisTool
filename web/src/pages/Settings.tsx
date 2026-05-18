import React, { useState, useEffect } from 'react';
import { Card, Form, Input, InputNumber, Button, message, Spin, Divider, Tag, Space, Alert } from 'antd';
import { SaveOutlined, FolderOpenOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';

const BASE_URL = '/cpu/api';

interface SettingsData {
  sourceProjectPath: string;
  skillProjectPath: string;
  dataDir: string;
  maxUploadSize: string;
  retentionDays: number;
  port: number;
  cliPaths: Record<string, string>;
}

const Settings: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<SettingsData | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/settings`);
      if (!res.ok) throw new Error('获取配置失败');
      const json = await res.json();
      setData(json);
      form.setFieldsValue({
        sourceProjectPath: json.sourceProjectPath,
        skillProjectPath: json.skillProjectPath,
        maxUploadSize: json.maxUploadSize,
        retentionDays: json.retentionDays,
        codebuddyPath: json.cliPaths?.codebuddy || '',
        claudePath: json.cliPaths?.claude || '',
      });
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const body: any = {
        sourceProjectPath: values.sourceProjectPath || '',
        skillProjectPath: values.skillProjectPath || '',
        maxUploadSize: values.maxUploadSize || '200mb',
        retentionDays: values.retentionDays ?? 0,
      };

      // CLI 路径
      const cliPaths: Record<string, string> = {};
      if (values.codebuddyPath) cliPaths.codebuddy = values.codebuddyPath;
      if (values.claudePath) cliPaths.claude = values.claudePath;
      if (Object.keys(cliPaths).length > 0) body.cliPaths = cliPaths;

      const res = await fetch(`${BASE_URL}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: '保存失败' }));
        throw new Error(err.error);
      }

      const result = await res.json();
      setData(result.config);
      message.success('配置已保存');
    } catch (err: any) {
      message.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>;
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <h1 style={{ color: 'var(--text-primary)', marginBottom: 16, fontSize: 16, fontWeight: 600 }}>系统设置</h1>

      <Form form={form} layout="vertical" onFinish={handleSave}>
        {/* 路径配置 */}
        <Card
          title={<span style={{ fontSize: 13 }}>路径配置</span>}
          style={{ marginBottom: 16 }}
          size="small"
        >
          <Form.Item
            label={
              <Space>
                <FolderOpenOutlined />
                <span>Unity 工程源码路径</span>
              </Space>
            }
            name="sourceProjectPath"
            help="用于源码定位、优化建议和 AI 分析时的代码上下文"
            rules={[{ required: true, message: '请输入 Unity 工程源码路径' }]}
          >
            <Input placeholder="/data/workspace/AOEYZ_trunk" />
          </Form.Item>

          <Form.Item
            label={
              <Space>
                <FolderOpenOutlined />
                <span>Skill 项目路径</span>
              </Space>
            }
            name="skillProjectPath"
            help="PerfAnalysisTool 项目根目录，用于定位 AI skill 脚本和执行分析"
          >
            <Input placeholder="/data/workspace/PerfAnalysisTool" />
          </Form.Item>
        </Card>

        {/* CLI 工具路径 */}
        <Card
          title={<span style={{ fontSize: 13 }}>CLI 工具路径</span>}
          style={{ marginBottom: 16 }}
          size="small"
        >
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="不填则使用系统 PATH 中的命令名"
          />

          <Form.Item
            label="CodeBuddy CLI 路径"
            name="codebuddyPath"
          >
            <Input placeholder="如 /usr/local/bin/codebuddy，留空则自动查找" />
          </Form.Item>

          <Form.Item
            label="Claude CLI 路径"
            name="claudePath"
          >
            <Input placeholder="如 /usr/local/bin/claude，留空则自动查找" />
          </Form.Item>
        </Card>

        {/* 存储配置 */}
        <Card
          title={<span style={{ fontSize: 13 }}>存储配置</span>}
          style={{ marginBottom: 16 }}
          size="small"
        >
          <Space style={{ width: '100%' }} size={16}>
            <Form.Item label="最大上传文件大小" name="maxUploadSize" style={{ flex: 1 }}>
              <Input placeholder="200mb" />
            </Form.Item>
            <Form.Item
              label="数据保留天数"
              name="retentionDays"
              help="0 = 永久保留"
              style={{ flex: 1 }}
            >
              <InputNumber min={0} max={365} style={{ width: '100%' }} />
            </Form.Item>
          </Space>

          {data && (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 4 }}>
              <span>数据目录: </span>
              <Tag style={{ fontSize: 11 }}>{data.dataDir}</Tag>
              <span style={{ marginLeft: 8 }}>端口: </span>
              <Tag style={{ fontSize: 11 }}>{data.port}</Tag>
            </div>
          )}
        </Card>

        {/* 保存按钮 */}
        <Button
          type="primary"
          htmlType="submit"
          icon={<SaveOutlined />}
          size="large"
          block
          loading={saving}
        >
          保存配置
        </Button>
      </Form>
    </div>
  );
};

export default Settings;
