import React, { useEffect, useState, useCallback } from 'react';

import { useParams, useNavigate, useLocation } from 'react-router-dom';

import {

  Alert, Button, Card, Col, Row, Spin, Statistic, Tag, Typography, Space, Tabs, message,

} from 'antd';

import {

  ArrowLeftOutlined, MobileOutlined, EnvironmentOutlined,

  ProjectOutlined, BranchesOutlined, CalendarOutlined, ReloadOutlined, FileTextOutlined, DownloadOutlined,

} from '@ant-design/icons';

import dayjs from 'dayjs';

import ReactMarkdown from 'react-markdown';

import remarkGfm from 'remark-gfm';

import type { Run, Analysis, Report, SourceId } from '@shared/perf-model';

import { KNOWN_SOURCE_IDS } from '@shared/perf-model';

import { getRunDetail, generateRunAnalysis } from '../services/api';

import CrossInsightsCard from '../components/CrossInsightsCard';

import SourceDetailPanel from '../components/SourceDetailPanel';
import UnityProfilerReportView from '../components/UnityProfilerReportView';
import { downloadTextFile } from '../utils/download';



const { Text } = Typography;



const SOURCE_COLORS: Record<string, string> = {

  unity_profiler: 'green',

  simpleperf: 'blue',

  perfetto: 'purple',

};



const RunDetail: React.FC = () => {

  const { id } = useParams<{ id: string }>();

  const navigate = useNavigate();

  const location = useLocation();

  const [loading, setLoading] = useState(true);

  const [generating, setGenerating] = useState(false);

  const [run, setRun] = useState<Run | null>(null);

  const [analysis, setAnalysis] = useState<{ analysis: Analysis; report: Report } | null>(null);

  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState('overview');

  const [savedPaths, setSavedPaths] = useState<{ markdownPath?: string; digestPath?: string }>({});



  const loadRun = useCallback(async () => {

    if (!id) return;

    setLoading(true);

    setError('');

    try {

      const data = await getRunDetail(id);

      setRun(data.run);

      setAnalysis(data.analysis);

    } catch (e: any) {

      setError(e.message);

    } finally {

      setLoading(false);

    }

  }, [id]);



  useEffect(() => {

    loadRun();

  }, [loadRun]);

  useEffect(() => {
    const st = location.state as { promptGenerateReport?: boolean; openReportTab?: boolean } | null;
    if (st?.openReportTab) {
      setActiveTab('report');
      window.history.replaceState({}, document.title);
    } else if (st?.promptGenerateReport && run && run.sources.length >= 2 && !analysis) {
      message.info('多源 Run 已就绪，可查看「完整报告」', 6);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, run, analysis]);



  async function handleGenerateReport() {

    if (!id) return;

    setGenerating(true);

    try {

      const res = await generateRunAnalysis(id);

      setAnalysis(res);

      setSavedPaths({ markdownPath: res.markdownPath, digestPath: res.digestPath });

      message.success(res.markdownPath ? `报告已生成并落盘: ${res.markdownPath}` : '交叉分析报告已生成');

      setActiveTab('report');

    } catch (e: any) {

      message.error(e.message || '生成失败');

    } finally {

      setGenerating(false);

    }

  }



  if (loading) {

    return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;

  }



  if (error || !run) {

    return (

      <div>

        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/runs')}>返回</Button>

        <Alert type="error" message={error || 'Run 不存在'} style={{ marginTop: 16 }} />

      </div>

    );

  }



  const isUnityOnly = run.sources.length === 1 && run.sources[0] === 'unity_profiler';

  if (isUnityOnly) {
    const st = location.state as { openReportTab?: boolean } | null;
    return (
      <UnityProfilerReportView
        run={run}
        onBack={() => navigate('/runs')}
        onRegenerate={handleGenerateReport}
        generating={generating}
        defaultTab={st?.openReportTab ? 'report' : undefined}
      />
    );
  }



  const { profile, meta, sources } = run;

  const detail = profile.detail as Record<string, unknown>;

  const confidence = profile.core.confidence;

  const isMultiSource = sources.length > 1;



  const orderedSources = KNOWN_SOURCE_IDS.filter(s => sources.includes(s)) as SourceId[];

  const extraSources = sources.filter(s => !KNOWN_SOURCE_IDS.includes(s as typeof KNOWN_SOURCE_IDS[number]));



  const overviewHeader = (

    <Card size="small" style={{ marginBottom: 16 }}>

      <Row gutter={[16, 12]}>

        <Col xs={24} md={16}>

          <Space wrap size={[12, 8]}>

            {meta.projectName && <Text style={{ fontSize: 12 }}><ProjectOutlined /> {meta.projectName}</Text>}

            {meta.version && <Text style={{ fontSize: 12 }}><BranchesOutlined /> {meta.version}</Text>}

            {meta.device && <Text style={{ fontSize: 12 }}><MobileOutlined /> {meta.device}</Text>}

            {meta.scene && <Text style={{ fontSize: 12 }}><EnvironmentOutlined /> {meta.scene}</Text>}

            <Text style={{ fontSize: 12 }} type="secondary">

              <CalendarOutlined /> {dayjs(run.createdAt).format('YYYY-MM-DD HH:mm')}

            </Text>

          </Space>

          <div style={{ marginTop: 8 }}>

            {sources.map(s => (

              <Tag key={s} color={SOURCE_COLORS[s] ?? 'default'}>{s}</Tag>

            ))}

          </div>

        </Col>

        <Col xs={24} md={8}>

          <Row gutter={12}>

            <Col span={8}>

              <Statistic title="帧数" value={meta.frameCount ?? '—'} valueStyle={{ fontSize: 18 }} />

            </Col>

            <Col span={8}>

              <Statistic title="指标" value={profile.core.metrics.length} valueStyle={{ fontSize: 18 }} />

            </Col>

            <Col span={8}>

              <Statistic title="时长" value={meta.durationSec ?? '—'} suffix="s" valueStyle={{ fontSize: 18 }} />

            </Col>

          </Row>

        </Col>

      </Row>



      {profile.core.frame.length > 0 && (

        <div style={{ marginTop: 12 }}>

          <Text type="secondary" style={{ fontSize: 12 }}>帧口径 (各源独立, 禁直比)</Text>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>

            {profile.core.frame.map(f => (

              <Tag key={`${f.source}-${f.frameDefinition}`} style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>

                {f.source}/{f.frameDefinition}: P95={f.p95Ms.toFixed(1)}ms FPS={f.fps.toFixed(1)}

              </Tag>

            ))}

          </div>

        </div>

      )}



      {confidence.notes.length > 0 && (

        <Alert

          type={confidence.perFrameAlignmentOk ? 'info' : 'warning'}

          showIcon

          style={{ marginTop: 12 }}

          message="可信度备注"

          description={confidence.notes.join(' · ')}

        />

      )}

    </Card>

  );



  const overviewTab = (

    <>

      {analysis?.report && (

        <CrossInsightsCard

          headline={analysis.report.headline}

          insights={analysis.report.insights}

        />

      )}



      {!analysis && isMultiSource && (

        <Alert

          type="info"

          showIcon

          style={{ marginBottom: 16 }}

          message="暂无交叉分析报告"

          description="点击下方「生成报告」从已入库的三源数据生成 insights 与 Markdown。"

          action={

            <Button type="primary" size="small" loading={generating} onClick={handleGenerateReport}>

              生成报告

            </Button>

          }

        />

      )}



      {[...orderedSources, ...extraSources].map(source => (

        <SourceDetailPanel

          key={source}

          source={source}

          metrics={profile.core.metrics}

          detail={detail[source] as Record<string, unknown> | undefined}

        />

      ))}

    </>

  );



  const reportTab = (

    <div>

      {isMultiSource && (
        <div style={{ marginBottom: 12 }}>
          <Button
            type="primary"
            icon={<ReloadOutlined />}
            loading={generating}
            onClick={handleGenerateReport}
          >
            {analysis ? '重新生成交叉报告' : '生成交叉报告'}
          </Button>
          {analysis?.report?.markdown && (
            <Button
              icon={<DownloadOutlined />}
              onClick={() => downloadTextFile(
                `cross-report_${run.id}.md`,
                analysis.report.markdown,
              )}
            >
              下载 Markdown
            </Button>
          )}
          <Text type="secondary" style={{ marginLeft: 12, fontSize: 12 }}>
            交叉分析 builder; 落盘 output/p-web-cross/
          </Text>
          {savedPaths.markdownPath && (
            <div style={{ marginTop: 8 }}>
              <Text type="secondary" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                已保存: {savedPaths.markdownPath}
                {savedPaths.digestPath ? ` · digest: ${savedPaths.digestPath}` : ''}
              </Text>
            </div>
          )}
        </div>
      )}

      {!isMultiSource && (
        <Alert type="info" showIcon message="单源 Run (非 Unity)" description="数据已入库；单源厚报告 skill 将在下一阶段接入。请查看「分析概览」各源分区。" style={{ marginBottom: 16 }} />
      )}



      {analysis?.report?.markdown ? (

        <Card size="small" style={{ lineHeight: 1.75 }}>

          <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysis.report.markdown}</ReactMarkdown>

        </Card>

      ) : analysis?.report ? (

        <Alert type="warning" message="Markdown 为空" description="已有 insights, 可重新生成或运行 skill 写入完整报告。" />

      ) : (

        <Alert type="info" message="尚无报告" description={isMultiSource ? '点击「生成报告」开始。' : '—'} />

      )}

    </div>

  );



  return (

    <div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>

        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/runs')}>Runs</Button>

        <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>

          {run.label || run.id}

        </h1>

        <Tag color={run.status === 'ready' ? 'success' : 'default'}>{run.status}</Tag>

        {isMultiSource && (
          <Button
            size="small"
            icon={<FileTextOutlined />}
            onClick={() => setActiveTab('report')}
          >
            查看报告
          </Button>
        )}
        {analysis?.analysis?.skill && (
          <Tag style={{ fontSize: 11 }}>{analysis.analysis.skill}</Tag>
        )}

      </div>



      {overviewHeader}



      <Tabs

        activeKey={activeTab}

        onChange={setActiveTab}

        items={[

          { key: 'overview', label: '分析概览', children: overviewTab },

          { key: 'report', label: '完整报告', children: reportTab },

        ]}

      />

    </div>

  );

};



export default RunDetail;

