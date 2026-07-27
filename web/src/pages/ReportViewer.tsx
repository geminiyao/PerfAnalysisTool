import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Collapse, Segmented, Spin, Typography } from 'antd';
import type { ReportBundle } from '@shared/report-bundle';
import { fetchReportBundle } from '@/services/api';
import ExecutiveStrip from '@/components/report-viewer/ExecutiveStrip';
import EnhancedReportDocument from '@/components/report-viewer/EnhancedReportDocument';
import ReportToc from '@/components/report-viewer/ReportToc';
import ReportInsightRail from '@/components/report-viewer/ReportInsightRail';
import { useReportScrollSpy } from '@/components/report-viewer/useReportScrollSpy';
import FlameTree from '@/components/report-viewer/FlameTree';
import ThreadLoadChart from '@/components/report-viewer/ThreadLoadChart';
import FrameDistChart from '@/components/FrameDistChart';
import '@/styles/report-document.less';

const { Text } = Typography;

interface ReportViewerPageProps {
  sampleKey?: string;
}

const ReportViewerPage: React.FC<ReportViewerPageProps> = ({ sampleKey: sampleKeyProp }) => {
  const params = useParams();
  const sampleKey = sampleKeyProp ?? params.sampleKey ?? 'unity-single';
  const contentRef = useRef<HTMLDivElement>(null);
  const [bundle, setBundle] = useState<ReportBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTreeId, setActiveTreeId] = useState<string>();
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setScrollRoot(contentRef.current);
  }, [bundle]);

  useEffect(() => {
    const content = document.querySelector('.ant-layout-content') as HTMLElement | null;
    if (!content) return;
    const prevOverflow = content.style.overflow;
    content.style.overflow = 'hidden';
    return () => {
      content.style.overflow = prevOverflow;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchReportBundle(sampleKey)
      .then(data => {
        if (!cancelled) {
          setBundle(data);
          setActiveTreeId(data.trees[0]?.id);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sampleKey]);

  const activeTree = useMemo(
    () => bundle?.trees.find(tree => tree.id === activeTreeId) ?? bundle?.trees[0],
    [bundle, activeTreeId],
  );

  const { activeId, activeItem, scrollTo } = useReportScrollSpy(
    bundle?.outline ?? [],
    scrollRoot,
  );

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
        <Spin size="large" tip="加载报告…" />
      </div>
    );
  }

  if (error || !bundle) {
    return <Alert type="error" showIcon message="报告加载失败" description={error ?? '无数据'} />;
  }

  return (
    <div className="report-viewer-page">
      <div className="report-viewer-top">
        <Text type="secondary">{bundle.meta.title} · 文档阅读模式</Text>
        <ExecutiveStrip bundle={bundle} />
      </div>

      <div className="report-viewer-body">
        <ReportToc
          outline={bundle.outline}
          activeId={activeId}
          onNavigate={scrollTo}
        />

        <div ref={contentRef} className="report-viewer-content">
          <EnhancedReportDocument bundle={bundle} />

          <section id="appendix" className="report-appendix">
            <div className="report-appendix-title">交互附录 · 图表与全量调用树（不影响正文阅读）</div>
            <Collapse
              ghost
              defaultActiveKey={[]}
              items={[
                {
                  key: 'charts',
                  label: '帧分布 & 线程负载',
                  children: (
                    <div style={{ display: 'grid', gap: 16 }}>
                      <FrameDistChart
                        frameSummary={bundle.frameSummary}
                        config={{ frameBudgetMs: bundle.meta.frameBudgetMs }}
                      />
                      <ThreadLoadChart
                        items={bundle.threadLoad}
                        frameBudgetMs={bundle.meta.frameBudgetMs}
                      />
                    </div>
                  ),
                },
                {
                  key: 'trees',
                  label: '全量调用树探索',
                  children: (
                    <div>
                      {bundle.trees.length > 1 && (
                        <div style={{ marginBottom: 12 }}>
                          <Segmented
                            value={activeTreeId}
                            onChange={value => setActiveTreeId(String(value))}
                            options={bundle.trees.map(tree => ({ label: tree.label, value: tree.id }))}
                          />
                        </div>
                      )}
                      {activeTree && (
                        <>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
                            {activeTree.thread} · {activeTree.label}
                          </div>
                          <FlameTree root={activeTree.root} defaultExpandDepth={5} />
                        </>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </section>
        </div>

        <ReportInsightRail bundle={bundle} activeId={activeId} activeItem={activeItem} />
      </div>
    </div>
  );
};

export default ReportViewerPage;
