import React from 'react';
import { Typography } from 'antd';

const { Text } = Typography;

export interface ThreadSchedEntry {
  name: string;
  count?: number;
  runningPct: number;
  runnablePct: number;
  sleepingPct: number;
}

export interface ThreadSchedView {
  primary?: ThreadSchedEntry[];
  jobWorkerPool?: ThreadSchedEntry | null;
  jobWorkers?: ThreadSchedEntry[];
  others?: ThreadSchedEntry[];
}

const BAR_H = 14;

function SchedBar({ entry, compact }: { entry: ThreadSchedEntry; compact?: boolean }) {
  const run = entry.runningPct ?? 0;
  const runn = entry.runnablePct ?? 0;
  const sleep = entry.sleepingPct ?? 0;
  const name = entry.name ?? 'unknown';
  const label = entry.count && entry.count > 1 ? `${name} ×${entry.count}` : name;

  return (
    <div style={{ marginBottom: compact ? 6 : 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <Text style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{label}</Text>
        {!compact && (
          <Text type="secondary" style={{ fontSize: 10 }}>
            Run {run}% · Runnable {runn}% · Sleep {sleep}%
          </Text>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          height: BAR_H,
          borderRadius: 3,
          overflow: 'hidden',
          background: 'var(--color-bg-muted, #f0f0f0)',
        }}
        title={`Running ${run}% · Runnable ${runn}% · Sleeping ${sleep}%`}
      >
        <div style={{ width: `${run}%`, background: '#52c41a' }} />
        <div style={{ width: `${runn}%`, background: '#faad14' }} />
        <div style={{ width: `${sleep}%`, background: '#bfbfbf' }} />
      </div>
    </div>
  );
}

/** Perfetto 线程调度条: Running(绿) / Runnable(黄) / Sleeping(灰) */
const ThreadSchedBars: React.FC<{ view?: ThreadSchedView; fallback?: Record<string, ThreadSchedEntry> }> = ({
  view,
  fallback,
}) => {
  const primary = view?.primary ?? [];
  const pool = view?.jobWorkerPool;
  const jobWorkers = view?.jobWorkers ?? [];
  const others = view?.others ?? [];

  const hasView = primary.length > 0 || jobWorkers.length > 0 || (others?.length ?? 0) > 0;

  if (!hasView && fallback) {
    const entries = Object.entries(fallback).map(([name, s]) => ({ ...s, name: s.name ?? name }));
    entries.sort((a, b) => {
      const pri = ['UnityMain', 'UnityGfxRenderS'];
      const ai = pri.indexOf(a.name);
      const bi = pri.indexOf(b.name);
      if (ai >= 0 || bi >= 0) return (ai >= 0 ? ai : 99) - (bi >= 0 ? bi : 99);
      return (b.runningPct ?? 0) - (a.runningPct ?? 0);
    });
    return (
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>线程调度 (Running / Runnable / Sleeping)</Text>
        <div style={{ marginTop: 8 }}>
          {entries.map(e => (
            <SchedBar key={e.name} entry={e} />
          ))}
        </div>
      </div>
    );
  }

  if (!hasView) return null;

  return (
    <div>
      <Text type="secondary" style={{ fontSize: 12 }}>线程调度 (Running / Runnable / Sleeping)</Text>
      <div style={{ marginTop: 8 }}>
        {primary.map(e => (
          <SchedBar key={e.name} entry={e} />
        ))}
        {pool && (
          <div style={{ marginTop: 4, marginBottom: 4 }}>
            <Text strong style={{ fontSize: 11 }}>JobWorker 池 ({pool.count ?? jobWorkers.length} 线程)</Text>
            <SchedBar entry={{ ...pool, name: pool.name ?? 'JobWorker (pool avg)' }} compact />
          </div>
        )}
        {jobWorkers.length > 0 && jobWorkers.length <= 8 && jobWorkers.map(e => (
          <SchedBar key={e.name} entry={e} compact />
        ))}
        {jobWorkers.length > 8 && (
          <Text type="secondary" style={{ fontSize: 10 }}>
            + {jobWorkers.length} 个 JobWorker 线程 (见池均值)
          </Text>
        )}
        {others && others.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>其它</Text>
            {others.slice(0, 4).map(e => (
              <SchedBar key={e.name} entry={e} compact />
            ))}
          </div>
        )}
      </div>
      <div style={{ marginTop: 6, display: 'flex', gap: 12, fontSize: 10 }}>
        <span><span style={{ color: '#52c41a' }}>■</span> Running</span>
        <span><span style={{ color: '#faad14' }}>■</span> Runnable</span>
        <span><span style={{ color: '#bfbfbf' }}>■</span> Sleeping</span>
      </div>
    </div>
  );
};

export default ThreadSchedBars;
