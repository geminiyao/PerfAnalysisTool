import React, { useEffect, useState } from 'react';
import { Card, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';

const BASE_URL = '/cpu/api';
const { Text } = Typography;

const Assets: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE_URL}/assets?limit=100`)
      .then(res => res.json())
      .then(data => setItems(data.items || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 style={{ color: 'var(--text-primary)', marginBottom: 16, fontSize: 16, fontWeight: 600 }}>Assets</h1>
      <Card size="small" title="统一资产列表" extra={<Text type="secondary">原始数据与分析产物</Text>}>
        <Table
          size="small"
          rowKey="id"
          loading={loading}
          dataSource={items}
          pagination={{ pageSize: 20 }}
          columns={[
            { title: '类型', dataIndex: 'assetType', width: 150, render: (v: string) => <Tag color={assetColor(v)}>{v}</Tag> },
            { title: '文件名', dataIndex: 'fileName', ellipsis: true },
            { title: '大小', dataIndex: 'fileSize', width: 100, render: formatBytes },
            { title: '来源', dataIndex: 'source', width: 120 },
            { title: '存储', dataIndex: 'storageBackend', width: 90, render: (v: string) => <Tag>{v || 'local'}</Tag> },
            { title: 'SHA256', dataIndex: 'sha256', width: 160, render: (v: string) => <Text code>{v?.slice(0, 12)}...</Text> },
            { title: '创建时间', dataIndex: 'createdAt', width: 140, render: (v: number) => dayjs(v).format('MM-DD HH:mm') },
          ]}
        />
      </Card>
    </div>
  );
};

function assetColor(type: string) {
  if (type?.includes('perf')) return 'purple';
  if (type?.includes('pdata')) return 'blue';
  if (type?.includes('report')) return 'green';
  if (type?.includes('folded')) return 'orange';
  return 'default';
}

function formatBytes(value: number) {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export default Assets;
