// Unity Profiler 报告产物读取 (runs 模型: 按 runId 读 results/ 目录, 不依赖 sessions 表)

import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { getConfig } from '../utils/config.js';
import { getDb } from '../db/index.js';
import { metrics as metricsTable, reports as reportsTable } from '../db/schema.js';
import { getAnalysisReportByRunId } from './analysis-store.js';

export interface LegacyMetricsPayload {
  totalFrames: number;
  avgFrameMs: number;
  maxFrameMs: number;
  medianFrameMs: number;
  p95FrameMs: number;
  fps: number;
  jankCount: number;
  jankRate: number;
  bigJankCount: number;
  topMarkerCount: number;
  topMarkerTotalMs: number;
  spikeCount: number;
}

function resultDir(id: string): string {
  return path.join(getConfig().dataDir, 'results', id);
}

export function readReportMarkdown(id: string): string | null {
  const ar = getAnalysisReportByRunId(id);
  if (ar?.report?.markdown) return ar.report.markdown;

  const filePath = path.join(resultDir(id), 'performance-report.md');
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8');
  }

  const db = getDb();
  const legacy = db.select().from(reportsTable).where(eq(reportsTable.sessionId, id)).get();
  if (legacy?.content) return legacy.content;

  return null;
}

export function readPreprocessJson(id: string): Record<string, unknown> | null {
  const filePath = path.join(resultDir(id), 'preprocess-result.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function metricsFromPreprocess(data: Record<string, unknown>): LegacyMetricsPayload {
  const summary = (data.frameSummary ?? {}) as Record<string, number>;
  const markers = (data.markers ?? []) as { msSelfMean?: number }[];
  const spikes = (data.markerSpikes ?? []) as unknown[];
  const jankFrames = (data.jankFrames ?? []) as { jankLevel?: string; ratio?: number }[];

  const totalFrames = summary.count || summary.totalFrames || summary.frameCount || 0;
  const avgFrameMs = summary.mean || summary.avgFrameMs || summary.meanFrameMs || 0;
  const maxFrameMs = summary.max || summary.maxFrameMs || 0;
  const medianFrameMs = summary.median || summary.medianFrameMs || 0;
  const fps = summary.actualFps || summary.fps || (avgFrameMs > 0 ? 1000 / avgFrameMs : 0);
  const jankCount = summary.jankCount ?? jankFrames.length ?? 0;
  const bigJankCount = summary.bigJankCount
    ?? jankFrames.filter(f => f.jankLevel === 'bigJank' || (f.ratio ?? 0) >= 3).length;

  return {
    totalFrames,
    avgFrameMs,
    maxFrameMs,
    medianFrameMs,
    p95FrameMs: summary.p95FrameMs || summary.percentile95 || summary.q3 || 0,
    fps,
    jankCount,
    jankRate: totalFrames > 0 ? (jankCount / totalFrames) * 100 : 0,
    bigJankCount,
    topMarkerCount: markers.length,
    topMarkerTotalMs: markers.reduce((s, m) => s + (m.msSelfMean || 0), 0),
    spikeCount: spikes.length,
  };
}

export function readReportMetrics(id: string): LegacyMetricsPayload | null {
  const db = getDb();
  const legacy = db.select().from(metricsTable).where(eq(metricsTable.sessionId, id)).get();
  if (legacy) {
    return {
      totalFrames: legacy.totalFrames,
      avgFrameMs: legacy.avgFrameMs,
      maxFrameMs: legacy.maxFrameMs,
      medianFrameMs: legacy.medianFrameMs,
      p95FrameMs: legacy.p95FrameMs,
      fps: legacy.fps,
      jankCount: legacy.jankCount,
      jankRate: legacy.jankRate,
      bigJankCount: legacy.bigJankCount,
      topMarkerCount: legacy.topMarkerCount,
      topMarkerTotalMs: legacy.topMarkerTotalMs,
      spikeCount: legacy.spikeCount,
    };
  }

  const preprocess = readPreprocessJson(id);
  if (preprocess) return metricsFromPreprocess(preprocess);
  return null;
}

export function readAnalysisLogs(id: string): string | null {
  const logPath = path.join(resultDir(id), 'analysis.log');
  if (!fs.existsSync(logPath)) return null;
  return fs.readFileSync(logPath, 'utf-8');
}

export function saveAnalysisLogs(id: string, lines: string[]): void {
  if (!lines.length) return;
  const dir = resultDir(id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'analysis.log'), lines.join('\n'), 'utf-8');
}

export function hasUnityReportArtifacts(id: string): boolean {
  return !!readPreprocessJson(id) || !!readReportMarkdown(id);
}
