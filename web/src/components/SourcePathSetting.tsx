import React, { useEffect, useState } from 'react';
import { Modal, Input, Alert, Spin, Typography } from 'antd';
import { FolderOpenOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { getSourcePathConfig, setSourcePath } from '../services/api';
import type { SourcePathStatus } from '../../shared/types';

const { Text } = Typography;

interface Props {
  open: boolean;
  onClose: (configured: boolean) => void;
}

const SourcePathSetting: React.FC<Props> = ({ open, onClose }) => {
  const [status, setStatus] = useState<SourcePathStatus | null>(null);
  const [inputPath, setInputPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setLoading(true);
      setError('');
      getSourcePathConfig()
        .then((s) => {
          setStatus(s);
          if (s.path) setInputPath(s.path);
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }, [open]);

  async function handleSave() {
    if (!inputPath.trim()) {
      setError('请输入路径');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await setSourcePath(inputPath.trim());
      setStatus(result);
      onClose(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="关联 Unity 工程源码"
      open={open}
      onOk={handleSave}
      onCancel={() => onClose(status?.configured ?? false)}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      width={520}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Text style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
            请输入服务器上 Unity 工程的根目录绝对路径。AI 优化建议功能需要读取源码来生成具体的代码修改方案。
          </Text>

          <Input
            size="large"
            prefix={<FolderOpenOutlined style={{ color: 'var(--text-tertiary)' }} />}
            placeholder="例如: D:\Projects\MyGame 或 /home/user/MyGame"
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
            onPressEnter={handleSave}
          />

          {error && <Alert type="error" message={error} showIcon />}

          {status?.configured && (
            <Alert
              type={status.hasAssets ? 'success' : 'warning'}
              icon={status.hasAssets ? <CheckCircleOutlined /> : <WarningOutlined />}
              showIcon
              message={
                status.hasAssets
                  ? '已关联有效的 Unity 工程目录'
                  : '目录存在但未发现 Assets 子目录，可能不是 Unity 工程根目录'
              }
              description={<Text code style={{ fontSize: 12 }}>{status.path}</Text>}
            />
          )}
        </div>
      )}
    </Modal>
  );
};

export default SourcePathSetting;
