import React from 'react';
import { Card, Col, Row, Statistic, Tag, Typography, Alert } from 'antd';
import type { CallTree, Metric, SourceId } from '@shared/perf-model';
import PerfCallTreeView from './PerfCallTreeView';

const { Text } = Typography;

const SOURCE_LABELS: Record<string, string> = {
  unity_profiler: 'Unity Profiler',
  simpleperf: 'simpleperf',
  perfetto: 'Perfetto',
};

function metricsForSource(metrics: Metric[], source: SourceId): Metric[] {
  return metrics.filter(m => m.source === source);
}

function topByKey(metrics: Metric[], prefix: string, n = 8): Metric[] {
  return metrics
    .filter(m => m.key.startsWith(prefix))
    .sort((a, b) => b.value - a.value)
    .slice(0, n);
}

interface SourceDetailPanelProps {
  source: SourceId;
  metrics: Metric[];
  detail?: Record<string, unknown>;
}

/** 各源分区: 关键指标 + detail + 调用树 */
const SourceDetailPanel: React.FC<SourceDetailPanelProps> = ({ source, metrics, detail }) => {
  const srcMetrics = metricsForSource(metrics, source);
  const callTrees = (detail?.callTrees as CallTree[] | undefined) ?? [];
  const symbolCheck = detail?.symbolCheck as { status?: string; message?: string } | undefined;
  const throttling = detail?.throttling as { level?: string; evidence?: string[] } | undefined;
  const parseOptions = detail?.parseOptions as Record<string, unknown> | undefined;

  const overviewStats = (() => {
    switch (source) {
      case 'unity_profiler': {
        const get = (k: string) => srcMetrics.find(m => m.key === k)?.value;
        return [
          { title: 'FPS', value: get('frame.fps'), suffix: '' },
          { title: '帧均', value: get('frame.avgMs'), suffix: 'ms' },
          { title: 'P95', value: get('frame.p95Ms'), suffix: 'ms' },
          { title: 'Jank率', value: get('jank.rate'), suffix: '%' },
          { title: 'GC.Alloc/帧', value: get('gc.allocCount'), suffix: '' },
        ];
      }
      case 'simpleperf': {
        const threads = topByKey(srcMetrics, 'cpu.thread.', 4);
        return threads.map(t => ({
          title: t.key.replace('cpu.thread.', '').replace('.pct', ''),
          value: t.value,
          suffix: '%',
        }));
      }
      case 'perfetto': {
        const get = (k: string) => srcMetrics.find(m => m.key === k)?.value;
        return [
          { title: 'UnityMain Running', value: get('thread.UnityMain.runningPct'), suffix: '%' },
          { title: 'UnityMain Sleeping', value: get('thread.UnityMain.sleepingPct'), suffix: '%' },
          { title: 'CPU 频率', value: get('system.cpuFreqAvgMhz'), suffix: 'MHz' },
          { title: 'GPU 忙', value: get('system.gpuBusyPct'), suffix: '%' },
        ];
      }
      default:
        return [];
    }
  })();

  const topMarkers = source === 'unity_profiler'
    ? topByKey(srcMetrics, 'marker.', 8).map(m => ({
        name: m.key.replace('marker.', '').replace('.msPerFrame', ''),
        value: m.value,
        unit: m.unit,
      }))
    : [];

  const topFuncs = source === 'simpleperf'
    ? topByKey(srcMetrics, 'cpu.func.', 8).map(m => ({
        name: m.key.replace('cpu.func.', '').replace('.selfPct', ''),
        value: m.value,
        unit: '%',
      }))
    : [];

  const topLibs = source === 'simpleperf'
    ? topByKey(srcMetrics, 'cpu.lib.', 6).map(m => ({
        name: m.key.replace('cpu.lib.', '').replace('.pct', ''),
        value: m.value,
        unit: '%',
      }))
    : [];

  return (
    <Card
      size="small"
      title={
        <span>
          {SOURCE_LABELS[source] ?? source}
          <Tag style={{ marginLeft: 8 }}>{srcMetrics.length} 指标</Tag>
        </span>
      }
      style={{ marginBottom: 16 }}
    >
      {symbolCheck && (
        <Alert
          type={symbolCheck.status === 'FAIL' ? 'error' : 'info'}
          showIcon
          style={{ marginBottom: 12 }}
          message={`符号校验: ${symbolCheck.status ?? 'unknown'}`}
          description={symbolCheck.message}
        />
      )}
      {throttling?.level && (
        <Alert
          type={throttling.level === 'confirmed' ? 'warning' : 'info'}
          showIcon
          style={{ marginBottom: 12 }}
          message={`降频判定: ${throttling.level}`}
          description={throttling.evidence?.join('; ')}
        />
      )}
      {source === 'perfetto' && parseOptions && Object.keys(parseOptions).length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="调用树剪枝参数 (入库时)"
          description={
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
              {Object.entries(parseOptions).map(([k, v]) => `${k}=${v}`).join(' · ')}
            </span>
          }
        />
      )}

      {overviewStats.length > 0 && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          {overviewStats.map(s => (
            <Col key={s.title} xs={12} sm={8} md={6} lg={4}>
              <Statistic
                title={s.title}
                value={s.value ?? '—'}
                suffix={s.suffix}
                valueStyle={{ fontSize: 18 }}
              />
            </Col>
          ))}
        </Row>
      )}

      {topMarkers.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>Top Markers (ms/帧)</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {topMarkers.map(m => (
              <Tag key={m.name} style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                {m.name}: {m.value.toFixed(2)}{m.unit}
              </Tag>
            ))}
          </div>
        </div>
      )}

      {topLibs.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>SO 占比</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {topLibs.map(m => (
              <Tag key={m.name} style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                {m.name}: {m.value.toFixed(1)}%
              </Tag>
            ))}
          </div>
        </div>
      )}

      {topFuncs.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>热点函数 (self%)</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {topFuncs.map(m => (
              <Tag key={m.name} style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                {m.name}: {m.value.toFixed(2)}%
              </Tag>
            ))}
          </div>
        </div>
      )}

      {callTrees.length > 0 ? (
        callTrees.map((tree, i) => (
          <div key={`${tree.thread}-${i}`} style={{ marginTop: 12 }}>
            <Text strong style={{ fontSize: 12 }}>
              调用树 · {tree.thread}
              {tree.label ? ` (${tree.label})` : ''}
            </Text>
            <div style={{ marginTop: 6 }}>
              <PerfCallTreeView root={tree.root} defaultExpandDepth={2} />
            </div>
          </div>
        ))
      ) : (
        <Text type="secondary" style={{ fontSize: 12 }}>无调用树数据</Text>
      )}
    </Card>
  );
};

export default SourceDetailPanel;
