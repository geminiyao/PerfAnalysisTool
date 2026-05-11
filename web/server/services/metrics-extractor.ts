import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { metrics, reports } from '../db/schema.js';

/**
 * 从分析结果文件中提取关键指标，存入 SQLite
 *
 * preprocess-result.json 实际结构:
 * - frameSummary: { count, actualFps, mean, median, min, max, q1, q3, jankCount, bigJankCount, ... }
 * - markers[]: { name, msSelfMean, msSelfMax, msTotalMean, percentOfFrame, count, ... }
 * - markerSpikes[]: [...]
 * - jankFrames[]: { frameIndex, msFrame, ratio, jankLevel, category, hotPath, ... }
 */
export async function extractMetrics(sessionId: string, resultDir: string): Promise<void> {
  const db = getDb();

  // 读取 preprocess-result.json（必须存在）
  const preprocessPath = path.join(resultDir, 'preprocess-result.json');
  if (!fs.existsSync(preprocessPath)) {
    throw new Error(`preprocess-result.json 不存在: ${preprocessPath}`);
  }

  try {
    const raw = fs.readFileSync(preprocessPath, 'utf-8');
    const data = JSON.parse(raw);

    const summary = data.frameSummary || {};
    const markers = data.markers || [];
    const spikes = data.markerSpikes || [];
    const jankFrames = data.jankFrames || [];

    // 映射实际字段名
    const totalFrames = summary.count || summary.totalFrames || summary.frameCount || 0;
    const avgFrameMs = summary.mean || summary.avgFrameMs || summary.meanFrameMs || 0;
    const maxFrameMs = summary.max || summary.maxFrameMs || 0;
    const medianFrameMs = summary.median || summary.medianFrameMs || 0;
    const fps = summary.actualFps || summary.fps || (avgFrameMs > 0 ? 1000 / avgFrameMs : 0);
    const jankCount = summary.jankCount ?? jankFrames.length ?? 0;
    const bigJankCount = summary.bigJankCount ?? jankFrames.filter((f: any) => (f.jankLevel === 'bigJank' || f.ratio >= 3)).length ?? 0;

    // P95: 没有直接字段，用 q3 近似，或从帧数据计算
    const p95FrameMs = summary.p95FrameMs || summary.percentile95 || summary.q3 || 0;

    await db.insert(metrics).values({
      id: uuid(),
      sessionId,
      totalFrames,
      avgFrameMs,
      maxFrameMs,
      medianFrameMs,
      p95FrameMs,
      fps,
      jankCount,
      jankRate: totalFrames > 0 ? (jankCount / totalFrames) * 100 : 0,
      bigJankCount,
      topMarkerCount: markers.length,
      topMarkerTotalMs: markers.reduce((sum: number, m: any) => sum + (m.msSelfMean || 0), 0),
      spikeCount: spikes.length,
    });
    console.log(`[extractMetrics] Metrics inserted for ${sessionId}`);
  } catch (err: any) {
    throw new Error(`提取指标失败: ${err.message}`);
  }

  // 读取并存储报告（必须存在）
  const reportPath = path.join(resultDir, 'performance-report.md');
  if (!fs.existsSync(reportPath)) {
    throw new Error(`performance-report.md 不存在: ${reportPath}`);
  }

  try {
    const content = fs.readFileSync(reportPath, 'utf-8');

    await db.insert(reports).values({
      id: uuid(),
      sessionId,
      content,
      createdAt: Date.now(),
    });
    console.log(`[extractMetrics] Report inserted for ${sessionId}`);
  } catch (err: any) {
    throw new Error(`存储报告失败: ${err.message}`);
  }
}
