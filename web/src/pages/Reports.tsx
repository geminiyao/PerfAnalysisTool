import React, { useEffect, useState } from 'react';
import { Card, List, Space, Tag, Typography } from 'antd';
import { Link } from 'react-router-dom';
import dayjs from 'dayjs';

const BASE_URL = '/cpu/api';
const { Text } = Typography;

const Reports: React.FC = () => {
  const [simpleperf, setSimpleperf] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE_URL}/simpleperf/sessions?limit=50`)
      .then(res => res.json())
      .then(data => setSimpleperf(data.items || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 style={{ color: 'var(--text-primary)', marginBottom: 16, fontSize: 16, fontWeight: 600 }}>Reports</h1>
      <Card size="small" title="simpleperf 报告" extra={<Text type="secondary">P3 单次分析产物</Text>}>
        <List
          loading={loading}
          dataSource={simpleperf}
          locale={{ emptyText: '暂无 simpleperf 报告，请先在采集上传页上传 perf.data' }}
          renderItem={(item) => (
            <List.Item actions={[item.status === 'completed' ? <Link key="view" to={`/simpleperf/report/${item.id}`}>查看报告</Link> : null].filter(Boolean)}>
              <List.Item.Meta
                title={<Space><span>{item.fileName}</span><Tag color={statusColor(item.status)}>{item.status}</Tag></Space>}
                description={<Space split="·" size={6}><span>{item.projectName || '未填项目'}</span><span>{item.version || '未填版本'}</span><span>{dayjs(item.createdAt).format('MM-DD HH:mm')}</span></Space>}
              />
            </List.Item>
          )}
        />
      </Card>
    </div>
  );
};

function statusColor(status: string) {
  if (status === 'completed') return 'success';
  if (status === 'running') return 'processing';
  if (status === 'failed') return 'error';
  return 'default';
}

export default Reports;
