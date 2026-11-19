import type { Run } from './perf-model.js';

export const sourceNames: Record<string, string> = { unity_profiler: 'Unity Profiler', simpleperf: 'simpleperf', perfetto: 'Perfetto' };
export function canonicalSource(s: string) { return s === 'unity-profiler' ? 'unity_profiler' : s; }
export function sourcesOf(run: Run) { return [...new Set(run.sources.map(canonicalSource))]; }
export interface Hotspot { key: string; name: string; value: number; measure: string; location: string }
export interface CaptureImage { id: string; source: string; key: string; caption: string; url: string }
export interface ReportEntry { id: string; runId: string; source: string; title: string; createdAt: number }

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

// Rank observations within one measurement and keep spikes distinct from steady cost.
export function hotspots(run: Run, source: string): Hotspot[] {
  const detail = record(run.profile.detail[source] ?? run.profile.detail[run.sources.find(s => canonicalSource(s) === source) ?? '']);
  const entries: Hotspot[] = [];
  function add(key: string, name: unknown, value: unknown, measure: string, location: string) {
    if (typeof name === 'string' && name && typeof value === 'number' && Number.isFinite(value) && value > 0) {
      entries.push({ key, name, value, measure, location });
    }
  }
  const metrics = run.profile.core.metrics.filter(m => canonicalSource(m.source) === source);
  if (source === 'unity_profiler') {
    for (const row of Array.isArray(detail.markers) ? detail.markers : []) {
      const marker = record(row);
      const name = marker.name;
      const thread = String(marker.thread ?? '线程未记录');
      add('marker:'+thread+':'+name, name, marker.msSelfMean, 'ms · Self 均值', thread);
    }
    if (!entries.length) {
      for (const m of metrics) if (m.key.startsWith('marker.') && m.key.endsWith('.msPerFrame') && m.key !== 'marker.PlayerLoop.msPerFrame') {
        add(m.key, m.key.slice(7,-11), m.value, 'ms / 帧', 'Marker 汇总');
      }
    }
  } else if (source === 'simpleperf') {
    const symbolsFailed = record(detail.symbolCheck).status === 'FAIL';
    for (const m of metrics) if (!symbolsFailed && m.key.startsWith('cpu.func.') && m.key.endsWith('.selfPct')) {
      add(m.key, m.key.slice(9,-8), m.value, '% · 自身采样占比', String(detail.event ?? '函数采样'));
    }
    if (!entries.length) for (const m of metrics) if (m.key.startsWith('cpu.lib.') && m.key.endsWith('.pct')) {
      add(m.key, m.key.slice(8,-4), m.value, '% · 库采样占比', symbolsFailed ? '符号校验失败，按库统计' : '动态库汇总');
    }
  } else if (source === 'perfetto') {
    const window = record(detail.profileWindow);
    const loc = window.startNs != null && window.endNs != null ? window.startNs+'–'+window.endNs+' ns' : '采样区间';
    const slices = Array.isArray(detail.aoeHotSlices) ? detail.aoeHotSlices.map(record).map(row => [row.label ?? row.pattern, row]) : [];
    for (const [name, value] of (slices.length ? slices : Object.entries(record(detail.atraceSlices)))) {
      if (name === 'PlayerLoop') continue;
      const row = record(value);
      add('slice:'+name, name, row.totalMs, 'ms · Slice 累计时长', loc);
    }
    if (!entries.length) for (const m of metrics) if (m.key.startsWith('thread.') && m.key.endsWith('.runningPct')) {
      add(m.key, m.key.slice(7,-11), m.value, '% · 线程 Running 占比', loc);
    }
  }
  const ranked = [...new Map(entries.sort((a,b) => a.value-b.value).map(h => [h.key,h])).values()].sort((a,b) => b.value-a.value).slice(0,5);
  if (source === 'unity_profiler' && Array.isArray(detail.markerSpikes)) {
    const peak = detail.markerSpikes.filter(row => typeof row?.name === 'string' && Number.isFinite(row.msSelfMax) && row.msSelfMax > 0)
      .sort((a,b) => b.msSelfMax-a.msSelfMax)[0];
    if (peak) ranked.push({ key:'spike:'+peak.name, name:peak.name, value:peak.msSelfMax, measure:'ms · Self 峰值',
      location:Array.isArray(peak.spikeFrameIndices) && peak.spikeFrameIndices.length ? '尖刺帧 '+peak.spikeFrameIndices.slice(0,6).join('、') : '尖刺帧统计' });
  }
  return ranked;
}
