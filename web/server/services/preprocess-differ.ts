import path from 'path';
import fs from 'fs';
import { getConfig } from '../utils/config.js';
import type { MarkerDiff, JankComparison, FrameSummaryDiff, DiffResult } from '../../shared/types.js';

interface PreprocessData {
  config: { targetFps: number; frameBudgetMs: number };
  frameSummary: Record<string, number>;
  markers: MarkerRaw[];
  jankFrames: { frameIndex: number; msFrame: number; jankLevel: string }[];
}

interface MarkerRaw {
  name: string;
  msSelfMean: number;
  msSelfMax: number;
  percentOfFrame: number;
  callsPerFrame: number;
  thread: string;
  mustReport: boolean;
}

/** 从 data/results/{sessionId}/preprocess-result.json 读取 */
function loadPreprocess(sessionId: string): PreprocessData | null {
  const config = getConfig();
  const filePath = path.join(config.dataDir, 'results', sessionId, 'preprocess-result.json');
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/** 帧汇总指标对比 */
const SUMMARY_METRICS: { key: string; label: string; lowerIsBetter: boolean }[] = [
  { key: 'actualFps', label: '平均 FPS', lowerIsBetter: false },
  { key: 'mean', label: '平均帧时间 (ms)', lowerIsBetter: true },
  { key: 'median', label: '中位帧时间 (ms)', lowerIsBetter: true },
  { key: 'max', label: '最大帧时间 (ms)', lowerIsBetter: true },
  { key: 'q1', label: 'Q1 帧时间 (ms)', lowerIsBetter: true },
  { key: 'q3', label: 'Q3 帧时间 (ms)', lowerIsBetter: true },
  { key: 'jankCount', label: 'Jank 次数', lowerIsBetter: true },
  { key: 'bigJankCount', label: 'BigJank 次数', lowerIsBetter: true },
  { key: 'count', label: '总帧数', lowerIsBetter: false },
];

function diffFrameSummary(baseline: Record<string, number>, current: Record<string, number>): FrameSummaryDiff[] {
  return SUMMARY_METRICS.map(({ key, label, lowerIsBetter }) => {
    const b = baseline[key] ?? 0;
    const c = current[key] ?? 0;
    const delta = c - b;
    const deltaPercent = b !== 0 ? Math.round((delta / b) * 10000) / 100 : 0;
    const improved = lowerIsBetter ? delta < 0 : delta > 0;
    return { metric: key, label, baseline: b, current: c, delta, deltaPercent, improved };
  });
}

/** Marker 级 diff：按 name + thread 匹配 */
function diffMarkers(baselineMarkers: MarkerRaw[], currentMarkers: MarkerRaw[]): MarkerDiff[] {
  // 建索引
  const baseMap = new Map<string, MarkerRaw>();
  for (const m of baselineMarkers) {
    baseMap.set(`${m.name}||${m.thread}`, m);
  }

  const curMap = new Map<string, MarkerRaw>();
  for (const m of currentMarkers) {
    curMap.set(`${m.name}||${m.thread}`, m);
  }

  const allKeys = new Set([...baseMap.keys(), ...curMap.keys()]);
  const results: MarkerDiff[] = [];

  for (const key of allKeys) {
    const b = baseMap.get(key) || null;
    const c = curMap.get(key) || null;

    const bData = b ? { selfMean: b.msSelfMean, selfMax: b.msSelfMax, percentOfFrame: b.percentOfFrame, callsPerFrame: b.callsPerFrame } : null;
    const cData = c ? { selfMean: c.msSelfMean, selfMax: c.msSelfMax, percentOfFrame: c.percentOfFrame, callsPerFrame: c.callsPerFrame } : null;

    const deltaSelfMean = (cData?.selfMean ?? 0) - (bData?.selfMean ?? 0);
    const deltaSelfMax = (cData?.selfMax ?? 0) - (bData?.selfMax ?? 0);
    const deltaPercent = (cData?.percentOfFrame ?? 0) - (bData?.percentOfFrame ?? 0);

    const baseSelfMean = bData?.selfMean ?? 0;
    const deltaPercentSelfMean = baseSelfMean !== 0 ? Math.round((deltaSelfMean / baseSelfMean) * 10000) / 100 : 0;
    const basePercentOfFrame = bData?.percentOfFrame ?? 0;
    const deltaPercentPOF = basePercentOfFrame !== 0 ? Math.round((deltaPercent / basePercentOfFrame) * 10000) / 100 : 0;

    // 判断状态
    let status: MarkerDiff['status'];
    if (!b) {
      status = 'new';
    } else if (!c) {
      status = 'removed';
    } else {
      const changeRatio = baseSelfMean > 0 ? Math.abs(deltaSelfMean / baseSelfMean) : 0;
      if (changeRatio < 0.1 && Math.abs(deltaSelfMean) < 0.5) {
        status = 'unchanged';
      } else if (deltaSelfMean < 0) {
        status = 'improved';
      } else {
        status = 'degraded';
      }
    }

    const mustReport = (b?.mustReport ?? false) || (c?.mustReport ?? false);

    // 过滤掉两边都很小的 marker（减少噪音）
    const maxSelfMean = Math.max(bData?.selfMean ?? 0, cData?.selfMean ?? 0);
    if (maxSelfMean < 0.1 && status === 'unchanged') continue;

    const [name, thread] = key.split('||');
    results.push({
      name,
      thread,
      baseline: bData,
      current: cData,
      delta: {
        selfMean: Math.round(deltaSelfMean * 1000) / 1000,
        selfMax: Math.round(deltaSelfMax * 1000) / 1000,
        percentOfFrame: Math.round(deltaPercent * 100) / 100,
      },
      deltaPercent: {
        selfMean: deltaPercentSelfMean,
        percentOfFrame: deltaPercentPOF,
      },
      status,
      mustReport,
    });
  }

  // 排序：恶化的排前面，然后按 |deltaSelfMean| 降序
  results.sort((a, b) => {
    const statusOrder: Record<string, number> = { degraded: 0, new: 1, improved: 2, removed: 3, unchanged: 4 };
    const orderDiff = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
    if (orderDiff !== 0) return orderDiff;
    return Math.abs(b.delta.selfMean) - Math.abs(a.delta.selfMean);
  });

  return results;
}

/** Jank 对比 */
function diffJank(baseline: PreprocessData, current: PreprocessData): JankComparison {
  return {
    baseline: {
      count: baseline.frameSummary.jankCount ?? 0,
      bigJankCount: baseline.frameSummary.bigJankCount ?? 0,
      totalFrames: baseline.frameSummary.count ?? 0,
    },
    current: {
      count: current.frameSummary.jankCount ?? 0,
      bigJankCount: current.frameSummary.bigJankCount ?? 0,
      totalFrames: current.frameSummary.count ?? 0,
    },
  };
}

/** 主入口：对比两次分析的 preprocess 数据 */
export function diffPreprocess(baselineId: string, currentId: string): DiffResult {
  const baseline = loadPreprocess(baselineId);
  const current = loadPreprocess(currentId);

  if (!baseline) throw new Error(`基准数据不存在: ${baselineId}`);
  if (!current) throw new Error(`对比数据不存在: ${currentId}`);

  return {
    frameSummaryDiffs: diffFrameSummary(baseline.frameSummary, current.frameSummary),
    markerDiffs: diffMarkers(baseline.markers, current.markers),
    jankComparison: diffJank(baseline, current),
  };
}
