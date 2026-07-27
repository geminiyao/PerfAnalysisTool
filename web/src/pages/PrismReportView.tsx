import React from 'react';
import { useParams } from 'react-router-dom';
import { Alert } from 'antd';
import { prismReportUrl } from '@/services/api';

/**
 * Prism 报告查看页 (WT-051b 需求 C)
 *
 * 用 iframe 直接加载后端 /api/prism-report/:sessionId 返回的 report.html。
 * 不重新渲染、不解析 narrative.json — iframe 够用就行 (工单明确禁止过度设计)。
 *
 * 路由: /prism-report/:sessionId
 * 入口: Dashboard 抽屉里 "Prism 分析" 完成后的 "打开报告" 按钮 (新窗口)。
 */
const PrismReportView: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();

  if (!sessionId) {
    return (
      <Alert
        type="error"
        showIcon
        message="缺少 sessionId"
        description="URL 需要包含 sessionId, 例如 /prism-report/prism-xxx-123-abc"
      />
    );
  }

  const url = prismReportUrl(sessionId);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
      {/* 加载态: iframe onLoad 前的兜底 (不强制, 浏览器自带) */}
      <iframe
        src={url}
        title={`Prism 报告 ${sessionId}`}
        style={{ width: '100%', height: '100%', border: 'none' }}
      />
    </div>
  );
};

export default PrismReportView;
