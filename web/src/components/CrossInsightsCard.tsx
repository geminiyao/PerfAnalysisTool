import React, { useState } from 'react';
import { Card, Tag, Typography, Collapse, Space } from 'antd';
import { BulbOutlined } from '@ant-design/icons';
import type { Insight, InsightSeverity } from '@shared/perf-model';

const { Text, Paragraph } = Typography;

const SEVERITY_COLORS: Record<InsightSeverity, string> = {
  critical: 'red',
  high: 'orange',
  medium: 'gold',
  low: 'blue',
  info: 'default',
};

interface CrossInsightsCardProps {
  headline?: string;
  insights: Insight[];
}

/** P2 交叉结论卡 — 读 analysis_reports.insights_json */
const CrossInsightsCard: React.FC<CrossInsightsCardProps> = ({ headline, insights }) => {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...insights].sort((a, b) => {
    const order: InsightSeverity[] = ['critical', 'high', 'medium', 'low', 'info'];
    return order.indexOf(a.severity) - order.indexOf(b.severity);
  });
  const visible = showAll ? sorted : sorted.slice(0, 6);

  if (!headline && insights.length === 0) return null;

  return (
    <Card
      size="small"
      title={
        <Space>
          <BulbOutlined style={{ color: 'var(--color-primary)' }} />
          <span>交叉分析结论</span>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      {headline && (
        <Paragraph
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 12,
            borderLeft: '3px solid var(--color-primary)',
            paddingLeft: 12,
          }}
        >
          {headline}
        </Paragraph>
      )}
      {visible.map(insight => (
        <div
          key={insight.id}
          style={{
            marginBottom: 10,
            padding: '8px 12px',
            background: 'var(--bg-card-inner)',
            borderRadius: 6,
            border: '1px solid var(--border-primary)',
          }}
        >
          <Space wrap size={4} style={{ marginBottom: 4 }}>
            <Tag color={SEVERITY_COLORS[insight.severity]}>{insight.severity}</Tag>
            <Tag>{insight.confidence}</Tag>
            {insight.sources.map(s => (
              <Tag key={s} color="purple">{s}</Tag>
            ))}
          </Space>
          <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>{insight.conclusion}</div>
          {insight.recommendation && (
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 4 }}>
              建议: {insight.recommendation}
            </Text>
          )}
          {insight.evidence && insight.evidence.length > 0 && (
            <Collapse
              ghost
              size="small"
              style={{ marginTop: 4 }}
              items={[{
                key: 'ev',
                label: <Text type="secondary" style={{ fontSize: 11 }}>证据 ({insight.evidence.length})</Text>,
                children: (
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: '#8b949e' }}>
                    {insight.evidence.map((e, i) => (
                      <li key={i}><Tag style={{ fontSize: 10 }}>{e.source}</Tag> {e.detail}</li>
                    ))}
                  </ul>
                ),
              }]}
            />
          )}
        </div>
      ))}
      {sorted.length > 6 && (
        <a onClick={() => setShowAll(!showAll)} style={{ fontSize: 12 }}>
          {showAll ? '收起' : `展开全部 ${sorted.length} 条`}
        </a>
      )}
    </Card>
  );
};

export default CrossInsightsCard;
