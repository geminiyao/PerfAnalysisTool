import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Row, Space, Spin, Tag, Typography } from 'antd';
import { FileTextOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons';

interface PublishedReport {
  id: string;
  title: string;
  collectedAt: string;
  model: string;
  version: string;
  quality: string;
  href: string;
  summary: string;
  sources: string[];
}

const { Title, Paragraph, Text } = Typography;

const PerformanceReports: React.FC = () => {
  const [reports, setReports] = useState<PublishedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch('/cpu/report/catalog.json', { signal: controller.signal, cache: 'no-cache' })
      .then(async response => {
        if (!response.ok) throw new Error(`报告目录加载失败（${response.status}）`);
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error('报告目录格式不正确');
        return data as PublishedReport[];
      })
      .then(data => { if (!controller.signal.aborted) setReports(data); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '报告目录加载失败');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  return (
    <div>
      <Title level={3}><FileTextOutlined /> 性能报告</Title>
      <Paragraph type="secondary">查看已发布的性能采集与优化诊断报告。</Paragraph>
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }}
        action={<Button size="small" icon={<ReloadOutlined />} onClick={() => setAttempt(value => value + 1)}>重试</Button>} />}
      {loading ? <Spin tip="正在加载报告目录…"><div style={{ minHeight: 160 }} /></Spin> : (
        reports.length ? <Row gutter={[16, 16]}>
          {reports.map(report => (
            <Col key={report.id} xs={24} xl={12}>
              <Card title={report.title}>
                <Space wrap style={{ marginBottom: 12 }}>
                  <Tag>{report.collectedAt}</Tag>
                  {report.sources.map(source => <Tag key={source} color="blue">{source}</Tag>)}
                </Space>
                <Paragraph>{report.summary}</Paragraph>
                <Space direction="vertical" size={4} style={{ marginBottom: 20 }}>
                  <Text type="secondary">测试机型：{report.model}</Text>
                  <Text type="secondary">游戏版本：{report.version}</Text>
                  <Text type="secondary">画质：{report.quality}</Text>
                </Space>
                <div>
                  <Button type="primary" icon={<LinkOutlined />} href={report.href} target="_blank" rel="noopener noreferrer">打开报告</Button>
                </div>
              </Card>
            </Col>
          ))}
        </Row> : !error && <Empty description="暂无已发布的性能报告" />
      )}
    </div>
  );
};

export default PerformanceReports;
