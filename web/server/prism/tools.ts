/**
 * tools.ts — Prism B2 query tool layer
 *
 * 8 pure functions, each takes (db, args) and returns { data, provenance }.
 * All aggregation happens in SQL or compact JS over query results.
 * Token red-line: every tool returns ≤ ~50 rows / ≤ 2 KB.
 *
 * Exported pure helpers (for testing):
 *   computeAutocorr(series: number[])  → { bestLag, coefficient } | null
 *   computeStatsPack(values: number[], frameIndices?: number[])
 */

import type Database from 'better-sqlite3';
import BetterSqlite3 from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ─────────────────────────── Provenance ────────────────────────────

export interface Provenance {
  runId: string;
  tool: string;
  args: Record<string, unknown>;
  source?: string;
  role?: string;
}

// ─────────────────────────── Pure Math Helpers ─────────────────────

/**
 * Compute normalized autocorrelation for lags 1..min(120, floor(n/2)).
 * r(k) = Σ (x[i] - μ)(x[i+k] - μ)  /  Σ (x[i] - μ)²
 * Returns { bestLag, coefficient } for the lag ≥ 2 with the highest r(k).
 * Returns null if variance is zero or series is too short.
 */
export function computeAutocorr(
  series: number[]
): { bestLag: number; coefficient: number } | null {
  const n = series.length;
  if (n < 4) return null;

  const mean = series.reduce((a, b) => a + b, 0) / n;
  const centered = series.map(v => v - mean);
  const denom = centered.reduce((a, b) => a + b * b, 0);
  if (denom === 0) return null;

  const maxLag = Math.min(120, Math.floor(n / 2));
  let bestLag = 2;
  let bestCoeff = -Infinity;

  for (let k = 1; k <= maxLag; k++) {
    let num = 0;
    for (let i = 0; i < n - k; i++) {
      num += centered[i] * centered[i + k];
    }
    const r = num / denom;
    if (k >= 2 && r > bestCoeff) {
      bestCoeff = r;
      bestLag = k;
    }
  }

  return { bestLag, coefficient: bestCoeff };
}

/**
 * Compute a statistics pack from a numeric array.
 * frameIndices: parallel array of frame indices (same length as values).
 * values may contain zeros (frames where metric was absent).
 */
export interface StatsPack {
  frameCount: number;
  presentFrames: number;
  mean: number;
  std: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  maxFrameIndex: number;
  spikeRatio: number;
  burstFrames: number[];
  burstFramesTotal: number;
  autocorr: { bestLag: number; coefficient: number } | null;
}

export function computeStatsPack(
  values: number[],
  frameIndices?: number[]
): StatsPack {
  const n = values.length;
  const indices = frameIndices ?? values.map((_, i) => i + 1);

  const sum = values.reduce((a, b) => a + b, 0);
  const mean = n > 0 ? sum / n : 0;

  const variance =
    n > 0 ? values.reduce((a, v) => a + (v - mean) ** 2, 0) / n : 0;
  const std = Math.sqrt(variance);

  // Sort for percentiles
  const sorted = [...values].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(n * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(n * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(n * 0.99)] ?? 0;

  // Max + its frame index
  let max = 0;
  let maxFrameIndex = indices[0] ?? 1;
  for (let i = 0; i < n; i++) {
    if (values[i] > max) {
      max = values[i];
      maxFrameIndex = indices[i];
    }
  }

  const presentFrames = values.filter(v => v > 0).length;

  // Spike ratio = max / median(nonzero values)
  const nonzero = values.filter(v => v > 0).sort((a, b) => a - b);
  const medianNonzero =
    nonzero.length > 0
      ? nonzero[Math.floor(nonzero.length / 2)]
      : 0;
  const spikeRatio = medianNonzero > 0 ? max / medianNonzero : 0;

  // Burst frames: value > mean + 3*std
  const threshold = mean + 3 * std;
  const burst: number[] = [];
  for (let i = 0; i < n; i++) {
    if (values[i] > threshold) burst.push(indices[i]);
  }
  const burstFramesTotal = burst.length;
  const burstFrames = burst.slice(0, 20);

  // Autocorrelation
  const autocorr = computeAutocorr(values);

  return {
    frameCount: n,
    presentFrames,
    mean,
    std,
    p50,
    p95,
    p99,
    max,
    maxFrameIndex,
    spikeRatio,
    burstFrames,
    burstFramesTotal,
    autocorr,
  };
}

// ─────────────────────────── Tool 1: queryMarkers ──────────────────

export interface QueryMarkersArgs {
  runId: string;
  thread?: string;
  sortBy?: 'selfMs' | 'totalMs' | 'count';
  topN?: number;
}

export interface MarkerRow {
  markerName: string;
  thread: string;
  sumSelfMs: number;
  sumTotalMs: number;
  sampleCount: number;
  presentInFrames: number;
  avgSelfMsPerPresentFrame: number;
  maxSelfMs: number;
  maxSelfFrameIndex: number;
}

export interface QueryMarkersResult {
  data: MarkerRow[];
  provenance: Provenance;
}

export function queryMarkers(
  db: Database.Database,
  args: QueryMarkersArgs
): QueryMarkersResult {
  const { runId, thread, sortBy = 'selfMs', topN = 20 } = args;
  const effectiveTopN = Math.min(topN, 50);

  const orderCol =
    sortBy === 'totalMs'
      ? 'sum_total_ms'
      : sortBy === 'count'
      ? 'sample_count'
      : 'sum_self_ms';

  // Optimized: avoid correlated subquery by using a window function to find
  // the frame_index corresponding to max self_ms per (marker_name, thread).
  // idx_pfms_run_marker_thread_self covers (run_id, marker_name, thread, self_ms DESC, frame_index),
  // allowing the GROUP BY to run without a temp B-tree sort and the
  // FIRST_VALUE window to pick the top-self_ms frame_index in a single pass.
  let sql: string;
  const params: unknown[] = [runId];

  if (thread) {
    params.push(thread);
    sql = `
      SELECT
        marker_name,
        thread,
        SUM(self_ms)                               AS sum_self_ms,
        SUM(total_ms)                              AS sum_total_ms,
        COUNT(*)                                   AS sample_count,
        COUNT(DISTINCT frame_index)                AS present_in_frames,
        SUM(self_ms) / COUNT(DISTINCT frame_index) AS avg_self_ms_per_frame,
        MAX(self_ms)                               AS max_self_ms,
        FIRST_VALUE(frame_index) OVER (
          PARTITION BY marker_name, thread
          ORDER BY self_ms DESC
          ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
        )                                          AS max_self_frame_index
      FROM prism_frame_marker_samples
      WHERE run_id = ? AND thread = ?
      GROUP BY marker_name, thread
      ORDER BY ${orderCol} DESC
      LIMIT ?
    `;
  } else {
    sql = `
      SELECT
        marker_name,
        thread,
        SUM(self_ms)                               AS sum_self_ms,
        SUM(total_ms)                              AS sum_total_ms,
        COUNT(*)                                   AS sample_count,
        COUNT(DISTINCT frame_index)                AS present_in_frames,
        SUM(self_ms) / COUNT(DISTINCT frame_index) AS avg_self_ms_per_frame,
        MAX(self_ms)                               AS max_self_ms,
        FIRST_VALUE(frame_index) OVER (
          PARTITION BY marker_name, thread
          ORDER BY self_ms DESC
          ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
        )                                          AS max_self_frame_index
      FROM prism_frame_marker_samples
      WHERE run_id = ?
      GROUP BY marker_name, thread
      ORDER BY ${orderCol} DESC
      LIMIT ?
    `;
  }
  params.push(effectiveTopN);

  const rows = db.prepare(sql).all(...params) as Array<{
    marker_name: string;
    thread: string;
    sum_self_ms: number;
    sum_total_ms: number;
    sample_count: number;
    present_in_frames: number;
    avg_self_ms_per_frame: number;
    max_self_ms: number;
    max_self_frame_index: number;
  }>;

  const data: MarkerRow[] = rows.map(r => ({
    markerName: r.marker_name,
    thread: r.thread,
    sumSelfMs: r.sum_self_ms,
    sumTotalMs: r.sum_total_ms,
    sampleCount: r.sample_count,
    presentInFrames: r.present_in_frames,
    avgSelfMsPerPresentFrame: r.avg_self_ms_per_frame,
    maxSelfMs: r.max_self_ms,
    maxSelfFrameIndex: r.max_self_frame_index,
  }));

  return {
    data,
    provenance: { runId, tool: 'queryMarkers', args: args as Record<string, unknown> },
  };
}

// ─────────────────────────── Tool 2: scanMetricOverFrames ──────────

export interface ScanMetricOverFramesArgs {
  runId: string;
  markerName: string;
  thread?: string;
  metric?: 'selfMs' | 'totalMs';
}

export interface ScanMetricOverFramesResult {
  data: StatsPack;
  provenance: Provenance;
}

export function scanMetricOverFrames(
  db: Database.Database,
  args: ScanMetricOverFramesArgs
): ScanMetricOverFramesResult {
  const { runId, markerName, thread, metric = 'selfMs' } = args;
  const col = metric === 'totalMs' ? 'total_ms' : 'self_ms';

  // Get all frame indices for this run (the full time axis)
  const allFrames = db
    .prepare(
      'SELECT frame_index FROM prism_frame_meta WHERE run_id = ? ORDER BY frame_index'
    )
    .all(runId) as Array<{ frame_index: number }>;

  // Get per-frame sums where the marker is present
  let markerSql = `
    SELECT frame_index, SUM(${col}) AS v
    FROM prism_frame_marker_samples
    WHERE run_id = ? AND marker_name = ?
  `;
  const params: unknown[] = [runId, markerName];
  if (thread) {
    markerSql += ' AND thread = ?';
    params.push(thread);
  }
  markerSql += ' GROUP BY frame_index';

  const markerRows = db.prepare(markerSql).all(...params) as Array<{
    frame_index: number;
    v: number;
  }>;

  // Build dense series aligned to allFrames (zero for absent frames)
  const markerMap = new Map<number, number>();
  for (const r of markerRows) markerMap.set(r.frame_index, r.v);

  const values: number[] = [];
  const frameIndices: number[] = [];
  for (const { frame_index } of allFrames) {
    values.push(markerMap.get(frame_index) ?? 0);
    frameIndices.push(frame_index);
  }

  const stats = computeStatsPack(values, frameIndices);

  return {
    data: stats,
    provenance: {
      runId,
      tool: 'scanMetricOverFrames',
      args: args as Record<string, unknown>,
    },
  };
}

// ─────────────────────────── Tool 3: getFrameCallTree ──────────────

export interface GetFrameCallTreeArgs {
  runId: string;
  frameIndex: number;
  thread?: string;
  maxDepth?: number;
  minPct?: number;
}

export interface CallTreeNode {
  name: string;
  selfMs: number;
  totalMs: number;
  pctOfFrame: number;
  children: CallTreeNode[];
}

export interface GetFrameCallTreeResult {
  data: {
    frameIndex: number;
    msFrame: number;
    thread: string;
    tree: CallTreeNode[];
    hotPath: Array<{ name: string; selfMs: number; totalMs: number; pctOfFrame: number }>;
  };
  provenance: Provenance;
}

export function getFrameCallTree(
  db: Database.Database,
  args: GetFrameCallTreeArgs
): GetFrameCallTreeResult {
  const { runId, frameIndex, maxDepth = 8, minPct = 0.5 } = args;

  // Resolve thread
  let thread = args.thread;
  if (!thread) {
    const row = db
      .prepare(
        `SELECT DISTINCT thread FROM prism_frame_marker_samples
         WHERE run_id = ? AND frame_index = ? AND thread LIKE '%Main Thread%'
         LIMIT 1`
      )
      .get(runId, frameIndex) as { thread: string } | undefined;
    if (!row) {
      throw new Error(
        `No Main Thread found for run ${runId} frame ${frameIndex}. Please provide thread explicitly.`
      );
    }
    thread = row.thread;
  }

  // Get msFrame
  const meta = db
    .prepare(
      'SELECT ms_frame FROM prism_frame_meta WHERE run_id = ? AND frame_index = ?'
    )
    .get(runId, frameIndex) as { ms_frame: number } | undefined;

  const msFrame = meta?.ms_frame ?? 0;

  // Get all samples for this frame+thread ordered by DFS traversal
  const samples = db
    .prepare(
      `SELECT marker_name, depth, self_ms, total_ms, parent_name, order_in_frame
       FROM prism_frame_marker_samples
       WHERE run_id = ? AND frame_index = ? AND thread = ?
       ORDER BY order_in_frame`
    )
    .all(runId, frameIndex, thread) as Array<{
    marker_name: string;
    depth: number;
    self_ms: number;
    total_ms: number;
    parent_name: string | null;
    order_in_frame: number;
  }>;

  // Build tree using a depth-stack approach (DFS order from data)
  const rootNodes: CallTreeNode[] = [];
  const stack: CallTreeNode[] = []; // stack[i] is the node at depth i+1

  for (const s of samples) {
    if (s.depth > maxDepth) continue;

    const pctOfFrame = msFrame > 0 ? (s.total_ms / msFrame) * 100 : 0;
    if (pctOfFrame < minPct && s.depth > 1) continue;

    const node: CallTreeNode = {
      name: s.marker_name.length > 64 ? s.marker_name.slice(0, 61) + '...' : s.marker_name,
      selfMs: s.self_ms,
      totalMs: s.total_ms,
      pctOfFrame,
      children: [],
    };

    // Pop stack back to parent depth
    while (stack.length >= s.depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      rootNodes.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  // Compute hot path: follow max-totalMs child from root
  const hotPath: Array<{
    name: string;
    selfMs: number;
    totalMs: number;
    pctOfFrame: number;
  }> = [];

  let cur: CallTreeNode | undefined = rootNodes.reduce(
    (best, n) => (!best || n.totalMs > best.totalMs ? n : best),
    undefined as CallTreeNode | undefined
  );

  while (cur) {
    hotPath.push({
      name: cur.name,
      selfMs: cur.selfMs,
      totalMs: cur.totalMs,
      pctOfFrame: cur.pctOfFrame,
    });
    cur = cur.children.reduce(
      (best, n) => (!best || n.totalMs > best.totalMs ? n : best),
      undefined as CallTreeNode | undefined
    );
  }

  return {
    data: {
      frameIndex,
      msFrame,
      thread,
      tree: rootNodes,
      hotPath,
    },
    provenance: {
      runId,
      tool: 'getFrameCallTree',
      args: args as Record<string, unknown>,
    },
  };
}

// ─────────────────────────── Tool 4: getThreadTimeline ─────────────

export interface GetThreadTimelineArgs {
  runId: string;
  frameIndex: number;
}

export interface ThreadEntry {
  thread: string;
  topLevelMs: number;
  topMarkers: Array<{ name: string; totalMs: number }>;
}

export interface GetThreadTimelineResult {
  data: {
    frameIndex: number;
    msFrame: number;
    threads: ThreadEntry[];
    mainThreadWaits: Array<{ name: string; totalMs: number }>;
  };
  provenance: Provenance;
}

export function getThreadTimeline(
  db: Database.Database,
  args: GetThreadTimelineArgs
): GetThreadTimelineResult {
  const { runId, frameIndex } = args;

  const meta = db
    .prepare(
      'SELECT ms_frame FROM prism_frame_meta WHERE run_id = ? AND frame_index = ?'
    )
    .get(runId, frameIndex) as { ms_frame: number } | undefined;
  const msFrame = meta?.ms_frame ?? 0;

  // Optimized: single query for all depth=1 rows in this frame.
  // idx_pfms_run_frame_depth_thread covers (run_id, frame_index, depth, thread, marker_name, total_ms)
  // so the WHERE run_id=? AND frame_index=? AND depth=1 is a pure SEARCH with no temp scan.
  const allDepth1 = db
    .prepare(
      `SELECT thread, marker_name, total_ms
       FROM prism_frame_marker_samples
       WHERE run_id = ? AND frame_index = ? AND depth = 1`
    )
    .all(runId, frameIndex) as Array<{
    thread: string;
    marker_name: string;
    total_ms: number;
  }>;

  // Aggregate per-thread in JS: topLevelMs + per-marker sums
  const threadMap = new Map<string, { total: number; markers: Map<string, number> }>();
  for (const row of allDepth1) {
    let entry = threadMap.get(row.thread);
    if (!entry) {
      entry = { total: 0, markers: new Map() };
      threadMap.set(row.thread, entry);
    }
    entry.total += row.total_ms;
    entry.markers.set(row.marker_name, (entry.markers.get(row.marker_name) ?? 0) + row.total_ms);
  }

  // Sort threads by total descending, take top 10
  const sortedThreads = [...threadMap.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 10);

  const threads: ThreadEntry[] = sortedThreads.map(([threadName, entry]) => {
    // Top 5 markers for this thread
    const topMarkers = [...entry.markers.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, totalMs]) => ({
        name: name.length > 64 ? name.slice(0, 61) + '...' : name,
        totalMs,
      }));

    return {
      thread: threadName,
      topLevelMs: entry.total,
      topMarkers,
    };
  });

  // Main-thread wait markers: filter from allDepth1 rows for matching thread + name patterns
  // Use the already-fetched data for main-thread rows, filtered by wait marker names.
  // (We also need to check rows from all depths for the waits query — the original used no depth filter.)
  // Re-query for waits separately since the original had no depth filter — one indexed pass.
  const waits = db
    .prepare(
      `SELECT marker_name, SUM(total_ms) AS total_ms
       FROM prism_frame_marker_samples
       WHERE run_id = ?
         AND frame_index = ?
         AND thread LIKE '%Main Thread%'
         AND (  marker_name LIKE '%Wait%'
             OR marker_name LIKE '%Semaphore%'
             OR marker_name LIKE '%Idle%'
             OR marker_name LIKE '%Sync%'
             OR marker_name LIKE '%Present%')
       GROUP BY marker_name
       ORDER BY total_ms DESC
       LIMIT 15`
    )
    .all(runId, frameIndex) as Array<{
    marker_name: string;
    total_ms: number;
  }>;

  return {
    data: {
      frameIndex,
      msFrame,
      threads,
      mainThreadWaits: waits.map(w => ({
        name: w.marker_name.length > 64 ? w.marker_name.slice(0, 61) + '...' : w.marker_name,
        totalMs: w.total_ms,
      })),
    },
    provenance: {
      runId,
      tool: 'getThreadTimeline',
      args: args as Record<string, unknown>,
    },
  };
}

// ─────────────────────────── Tool 5: correlateFrameSets ────────────

export type FramePredicate =
  | { kind: 'slowFrames'; thresholdMs?: number }
  | { kind: 'markerSpike'; markerName: string; thread?: string; minSelfMs: number }
  | { kind: 'frameList'; frames: number[] };

export interface CorrelateFrameSetsArgs {
  runId: string;
  setA: FramePredicate;
  setB: FramePredicate;
}

export interface CorrelateFrameSetsResult {
  data: {
    sizeA: number;
    sizeB: number;
    intersection: number;
    union: number;
    jaccard: number;
    pctAinB: number;
    pctBinA: number;
    sampleOverlapFrames: number[];
  };
  provenance: Provenance;
}

function resolvePredicate(
  db: Database.Database,
  runId: string,
  pred: FramePredicate
): Set<number> {
  if (pred.kind === 'frameList') {
    return new Set(pred.frames);
  }

  if (pred.kind === 'slowFrames') {
    // Compute threshold = p95 of ms_frame if not provided
    const metas = db
      .prepare(
        'SELECT ms_frame FROM prism_frame_meta WHERE run_id = ? ORDER BY ms_frame'
      )
      .all(runId) as Array<{ ms_frame: number }>;

    const threshold =
      pred.thresholdMs ??
      metas[Math.floor(metas.length * 0.95)]?.ms_frame ??
      0;

    const slow = db
      .prepare(
        'SELECT frame_index FROM prism_frame_meta WHERE run_id = ? AND ms_frame > ?'
      )
      .all(runId, threshold) as Array<{ frame_index: number }>;

    return new Set(slow.map(r => r.frame_index));
  }

  // markerSpike
  let sql = `
    SELECT frame_index, SUM(self_ms) AS v
    FROM prism_frame_marker_samples
    WHERE run_id = ? AND marker_name = ?
  `;
  const params: unknown[] = [runId, pred.markerName];
  if (pred.thread) {
    sql += ' AND thread = ?';
    params.push(pred.thread);
  }
  sql += ' GROUP BY frame_index HAVING v > ?';
  params.push(pred.minSelfMs);

  const rows = db.prepare(sql).all(...params) as Array<{
    frame_index: number;
    v: number;
  }>;
  return new Set(rows.map(r => r.frame_index));
}

export function correlateFrameSets(
  db: Database.Database,
  args: CorrelateFrameSetsArgs
): CorrelateFrameSetsResult {
  const { runId, setA, setB } = args;

  const frameSetA = resolvePredicate(db, runId, setA);
  const frameSetB = resolvePredicate(db, runId, setB);

  const intersection: number[] = [];
  for (const f of frameSetA) {
    if (frameSetB.has(f)) intersection.push(f);
  }
  intersection.sort((a, b) => a - b);

  const unionSize = frameSetA.size + frameSetB.size - intersection.length;
  const jaccard = unionSize > 0 ? intersection.length / unionSize : 0;
  const pctAinB =
    frameSetA.size > 0 ? (intersection.length / frameSetA.size) * 100 : 0;
  const pctBinA =
    frameSetB.size > 0 ? (intersection.length / frameSetB.size) * 100 : 0;

  return {
    data: {
      sizeA: frameSetA.size,
      sizeB: frameSetB.size,
      intersection: intersection.length,
      union: unionSize,
      jaccard,
      pctAinB,
      pctBinA,
      sampleOverlapFrames: intersection.slice(0, 20),
    },
    provenance: {
      runId,
      tool: 'correlateFrameSets',
      args: args as Record<string, unknown>,
    },
  };
}

// ─────────────────────────── Tool 6: scanPeakMarkers ───────────────

export interface ScanPeakMarkersArgs {
  runId: string;
  thread?: string;
  topN?: number;
  minSpikeRatio?: number;
  excludeWaits?: boolean;
}

export interface PeakMarkerRow {
  markerName: string;
  thread: string;
  peakFrameSelf: number;
  peakFrame: number;
  avgWhenPresent: number;
  presentFrames: number;
  spikeRatio: number;
}

export interface ScanPeakMarkersResult {
  data: PeakMarkerRow[];
  provenance: Provenance;
}

export function scanPeakMarkers(
  db: Database.Database,
  args: ScanPeakMarkersArgs
): ScanPeakMarkersResult {
  const {
    runId,
    thread,
    topN = 25,
    minSpikeRatio = 3,
    excludeWaits = true,
  } = args;
  const effectiveTopN = Math.min(topN, 50);

  const waitMarkers = ['Semaphore.WaitForSignal', 'Idle', 'WaitForTargetFPS'];

  // Single-pass window function: for each (marker_name, thread, frame_index)
  // we get the aggregate fs, and use FIRST_VALUE to find peakFrame.
  // The per_frame CTE does the per-frame sum; outer query aggregates and finds
  // the peak frame using a window function over the CTE results.
  let threadFilter = thread ? 'AND thread = ?' : '';
  let waitFilter = excludeWaits
    ? `AND marker_name NOT IN (${waitMarkers.map(() => '?').join(',')})`
    : '';

  const sql = `
    WITH per_frame AS (
      SELECT
        marker_name,
        thread,
        frame_index,
        SUM(self_ms) AS fs
      FROM prism_frame_marker_samples
      WHERE run_id = ?
        ${threadFilter}
        ${waitFilter}
      GROUP BY marker_name, thread, frame_index
    ),
    windowed AS (
      SELECT
        marker_name,
        thread,
        frame_index,
        fs,
        FIRST_VALUE(frame_index) OVER (
          PARTITION BY marker_name, thread
          ORDER BY fs DESC
          ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
        ) AS peak_frame,
        MAX(fs) OVER (PARTITION BY marker_name, thread) AS peak_fs
      FROM per_frame
    )
    SELECT
      marker_name,
      thread,
      MAX(fs)      AS peak_frame_self,
      AVG(fs)      AS avg_when_present,
      COUNT(*)     AS present_frames,
      MIN(peak_frame) AS peak_frame
    FROM windowed
    GROUP BY marker_name, thread
    ORDER BY peak_frame_self DESC
    LIMIT ?
  `;

  const params: unknown[] = [runId];
  if (thread) params.push(thread);
  if (excludeWaits) params.push(...waitMarkers);
  params.push(effectiveTopN * 4); // pull extra rows to filter by spikeRatio below

  const rows = db.prepare(sql).all(...params) as Array<{
    marker_name: string;
    thread: string;
    peak_frame_self: number;
    avg_when_present: number;
    present_frames: number;
    peak_frame: number;
  }>;

  // Compute spikeRatio and filter
  const filtered: PeakMarkerRow[] = rows
    .map(r => {
      const avg = Math.max(r.avg_when_present, 0.01);
      const spikeRatio = r.peak_frame_self / avg;
      return {
        markerName: r.marker_name,
        thread: r.thread,
        peakFrameSelf: +r.peak_frame_self.toFixed(4),
        peakFrame: r.peak_frame,
        avgWhenPresent: +r.avg_when_present.toFixed(4),
        presentFrames: r.present_frames,
        spikeRatio: +spikeRatio.toFixed(2),
      };
    })
    .filter(r => r.spikeRatio >= minSpikeRatio)
    .slice(0, effectiveTopN);

  return {
    data: filtered,
    provenance: { runId, tool: 'scanPeakMarkers', args: args as Record<string, unknown> },
  };
}

// ─────────────────────────── Tool 7: queryFrameCounters ────────────

export interface QueryFrameCountersArgs {
  runId: string;
  frames?: number[];
  metric?: string;
  agg?: string;
}

export interface CounterStats {
  mean: number;
  max: number;
  maxFrame: number;
  min: number;
  p95: number;
}

export interface QueryFrameCountersResult {
  data:
    | { mode: 'rows'; rows: Record<string, unknown>[] }
    | { mode: 'summary'; stats: Record<string, CounterStats> };
  provenance: Provenance;
}

const COUNTER_COLS = [
  'draw_calls', 'batches', 'set_pass_calls', 'triangles', 'vertices',
  'used_textures_bytes', 'used_textures_count', 'total_reserved_memory',
  'total_used_memory', 'gc_allocated_in_frame', 'gc_reserved_memory',
  'system_used_memory', 'particle_memory', 'mesh_memory',
  'material_count', 'object_count',
] as const;

export function queryFrameCounters(
  db: Database.Database,
  args: QueryFrameCountersArgs
): QueryFrameCountersResult {
  const { runId, frames } = args;

  if (frames && frames.length > 0) {
    // Return specific frames (cap 50)
    const capped = frames.slice(0, 50);
    const placeholders = capped.map(() => '?').join(',');
    const sql = `
      SELECT frame_index, ${COUNTER_COLS.join(', ')}
      FROM prism_frame_counters
      WHERE run_id = ? AND frame_index IN (${placeholders})
      ORDER BY frame_index
    `;
    const rows = db.prepare(sql).all(runId, ...capped) as Record<string, unknown>[];
    return {
      data: { mode: 'rows', rows },
      provenance: { runId, tool: 'queryFrameCounters', args: args as Record<string, unknown> },
    };
  }

  // Summary mode: stats across all frames for non-null metrics
  const allSql = `
    SELECT frame_index, ${COUNTER_COLS.join(', ')}
    FROM prism_frame_counters
    WHERE run_id = ?
    ORDER BY frame_index
  `;
  const allRows = db.prepare(allSql).all(runId) as Array<Record<string, number | null> & { frame_index: number }>;

  const stats: Record<string, CounterStats> = {};

  for (const col of COUNTER_COLS) {
    const pairs = allRows
      .map(r => ({ v: r[col], fi: r.frame_index }))
      .filter(p => p.v != null) as Array<{ v: number; fi: number }>;

    if (pairs.length === 0) continue;

    const sorted = [...pairs].sort((a, b) => a.v - b.v);
    const values = sorted.map(p => p.v);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / values.length;
    const max = values[values.length - 1];
    const min = values[0];
    const p95 = values[Math.floor(values.length * 0.95)];
    const maxFrame = pairs.find(p => p.v === max)!.fi;

    stats[col] = { mean: +mean.toFixed(1), max, maxFrame, min, p95 };
  }

  return {
    data: { mode: 'summary', stats },
    provenance: { runId, tool: 'queryFrameCounters', args: args as Record<string, unknown> },
  };
}

// ─────────────────────────── Tool 9: drillDownMarker ───────────────

export interface DrillDownMarkerArgs {
  runId: string;
  rootMarker: string;
  thread?: string;
  maxDepth?: number;
  minMsPerFrame?: number;
  topPerLevel?: number;
}

export interface DrillDownNode {
  name: string;
  thread: string;
  totalMsPerFrame: number;
  selfMsPerFrame: number;
  pctOfRoot: number;
  presentFrames: number;
  children: DrillDownNode[];
}

export interface DrillDownLeaf {
  name: string;
  thread: string;
  selfMsPerFrame: number;
  totalMsPerFrame: number;
  pctOfRoot: number;
}

export interface DrillDownMarkerResult {
  data: {
    rootMarker: string;
    thread: string;
    rootTotalMsPerFrame: number;
    rootSelfMsPerFrame: number;
    frameCount: number;
    tree: DrillDownNode;
    leaves: DrillDownLeaf[];
    bytesEstimate: number;
    note?: string;
  };
  provenance: Provenance;
}

export function drillDownMarker(
  db: Database.Database,
  args: DrillDownMarkerArgs
): DrillDownMarkerResult {
  const {
    runId,
    rootMarker,
    thread: threadArg,
    maxDepth = 6,
    minMsPerFrame = 0.3,
    topPerLevel = 6,
  } = args;

  // ── Step 1: frame count ──────────────────────────────────────────
  const metaRow = db
    .prepare('SELECT COUNT(*) AS cnt FROM prism_frame_meta WHERE run_id = ?')
    .get(runId) as { cnt: number };
  const frameCount = Math.max(metaRow.cnt, 1);

  // ── Step 2: resolve thread ───────────────────────────────────────
  // If no thread given, pick the one with highest SUM(total_ms) for rootMarker
  let resolvedThread = threadArg;
  let threadNote: string | undefined;

  if (!resolvedThread) {
    const threadRow = db
      .prepare(
        `SELECT thread, SUM(total_ms) AS tot
         FROM prism_frame_marker_samples
         WHERE run_id = ? AND marker_name = ?
         GROUP BY thread
         ORDER BY tot DESC
         LIMIT 1`
      )
      .get(runId, rootMarker) as { thread: string; tot: number } | undefined;

    if (!threadRow) {
      throw new Error(`Marker "${rootMarker}" not found in run "${runId}".`);
    }
    resolvedThread = threadRow.thread;
    threadNote = `Auto-selected thread "${resolvedThread}" (highest total_ms for root).`;
  }

  // ── Step 3: ONE bulk query — all (parent_name, marker_name) edges for this run+thread ──
  // This gives us the full weighted edge list. We'll build the tree in JS.
  const edgeRows = db
    .prepare(
      `SELECT
         parent_name,
         marker_name,
         SUM(total_ms)              AS sum_total_ms,
         SUM(self_ms)               AS sum_self_ms,
         COUNT(DISTINCT frame_index) AS present_frames
       FROM prism_frame_marker_samples
       WHERE run_id = ? AND thread = ? AND parent_name IS NOT NULL
       GROUP BY parent_name, marker_name`
    )
    .all(runId, resolvedThread) as Array<{
      parent_name: string;
      marker_name: string;
      sum_total_ms: number;
      sum_self_ms: number;
      present_frames: number;
    }>;

  // Also get root node's own aggregates (it might be at any depth)
  const rootRow = db
    .prepare(
      `SELECT
         SUM(total_ms)              AS sum_total_ms,
         SUM(self_ms)               AS sum_self_ms,
         COUNT(DISTINCT frame_index) AS present_frames
       FROM prism_frame_marker_samples
       WHERE run_id = ? AND thread = ? AND marker_name = ?`
    )
    .get(runId, resolvedThread, rootMarker) as
    | { sum_total_ms: number; sum_self_ms: number; present_frames: number }
    | undefined;

  if (!rootRow || rootRow.sum_total_ms == null) {
    throw new Error(
      `Marker "${rootMarker}" not found on thread "${resolvedThread}" in run "${runId}".`
    );
  }

  const rootTotalMsPerFrame = rootRow.sum_total_ms / frameCount;
  const rootSelfMsPerFrame  = rootRow.sum_self_ms  / frameCount;

  // ── Step 4: Build JS child map: parentName → sorted children ────
  // Map<parentName, [{marker_name, sum_total_ms, sum_self_ms, present_frames}]>
  type EdgeEntry = {
    marker_name: string;
    sum_total_ms: number;
    sum_self_ms: number;
    present_frames: number;
  };
  const childMap = new Map<string, EdgeEntry[]>();

  for (const e of edgeRows) {
    let arr = childMap.get(e.parent_name);
    if (!arr) {
      arr = [];
      childMap.set(e.parent_name, arr);
    }
    arr.push({
      marker_name:    e.marker_name,
      sum_total_ms:   e.sum_total_ms,
      sum_self_ms:    e.sum_self_ms,
      present_frames: e.present_frames,
    });
  }

  // Pre-sort each child list by sum_total_ms DESC (for topPerLevel slicing)
  for (const arr of childMap.values()) {
    arr.sort((a, b) => b.sum_total_ms - a.sum_total_ms);
  }

  // ── Step 5: Recursive DFS tree-builder ──────────────────────────
  const leaves: DrillDownLeaf[] = [];

  function buildNode(
    name: string,
    sumTotal: number,
    sumSelf: number,
    presentFr: number,
    depth: number,
    visited: Set<string>
  ): DrillDownNode {
    const totalPerFrame = sumTotal / frameCount;
    const selfPerFrame  = sumSelf  / frameCount;
    const pctOfRoot     = rootTotalMsPerFrame > 0 ? totalPerFrame / rootTotalMsPerFrame : 0;

    const node: DrillDownNode = {
      name,
      thread: resolvedThread!,
      totalMsPerFrame: +totalPerFrame.toFixed(4),
      selfMsPerFrame:  +selfPerFrame.toFixed(4),
      pctOfRoot:       +pctOfRoot.toFixed(4),
      presentFrames:   presentFr,
      children:        [],
    };

    if (depth >= maxDepth) {
      leaves.push({ name, thread: resolvedThread!, selfMsPerFrame: +selfPerFrame.toFixed(4), totalMsPerFrame: +totalPerFrame.toFixed(4), pctOfRoot: +pctOfRoot.toFixed(4) });
      return node;
    }

    const childEntries = childMap.get(name);
    if (!childEntries || childEntries.length === 0) {
      // Leaf node
      leaves.push({ name, thread: resolvedThread!, selfMsPerFrame: +selfPerFrame.toFixed(4), totalMsPerFrame: +totalPerFrame.toFixed(4), pctOfRoot: +pctOfRoot.toFixed(4) });
      return node;
    }

    // Cycle guard: track names on current DFS path
    const newVisited = new Set(visited);
    newVisited.add(name);

    let addedChildren = 0;
    for (const child of childEntries) {
      if (addedChildren >= topPerLevel) break;

      const childPerFrame = child.sum_total_ms / frameCount;
      if (childPerFrame < minMsPerFrame) break; // list is sorted by total desc, so all remaining are also cheap

      if (newVisited.has(child.marker_name)) continue; // cycle guard

      const childNode = buildNode(
        child.marker_name,
        child.sum_total_ms,
        child.sum_self_ms,
        child.present_frames,
        depth + 1,
        newVisited
      );
      node.children.push(childNode);
      addedChildren++;
    }

    // If no children passed the filter, this is effectively a leaf
    if (node.children.length === 0) {
      leaves.push({ name, thread: resolvedThread!, selfMsPerFrame: +selfPerFrame.toFixed(4), totalMsPerFrame: +totalPerFrame.toFixed(4), pctOfRoot: +pctOfRoot.toFixed(4) });
    }

    return node;
  }

  const tree = buildNode(
    rootMarker,
    rootRow.sum_total_ms,
    rootRow.sum_self_ms,
    rootRow.present_frames,
    0,
    new Set<string>()
  );

  // ── Step 6: Top-15 leaves by selfMsPerFrame ──────────────────────
  const topLeaves = leaves
    .sort((a, b) => b.selfMsPerFrame - a.selfMsPerFrame)
    .slice(0, 15);

  // ── Step 7: Estimate output byte size ───────────────────────────
  const serialized = JSON.stringify({ tree, leaves: topLeaves });
  const bytesEstimate = Buffer.byteLength(serialized, 'utf8');

  const result: DrillDownMarkerResult = {
    data: {
      rootMarker,
      thread:              resolvedThread!,
      rootTotalMsPerFrame: +rootTotalMsPerFrame.toFixed(4),
      rootSelfMsPerFrame:  +rootSelfMsPerFrame.toFixed(4),
      frameCount,
      tree,
      leaves:              topLeaves,
      bytesEstimate,
      ...(threadNote ? { note: threadNote } : {}),
    },
    provenance: {
      runId,
      tool: 'drillDownMarker',
      args: args as Record<string, unknown>,
    },
  };

  return result;
}

// ─────────────────────────── Tool 10: getSourceForSymbol ──────────────

const CODEGRAPH_DB_PATH = 'G:/AOEYZ_Trunk/AOE3D/.codegraph/codegraph.db';
const CODEBASE_ROOT = 'G:/AOEYZ_Trunk/AOE3D';
// Absolute path to the marker-source-map — lives in the project root (parent of web/)
const MARKER_SOURCE_MAP_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../.claude/skills/unity-profiler-analysis/marker-source-map.json'
);
const MARKER_ALIASES_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'marker-aliases.json'
);
const PROFILER_NOISE_RE = /Sampler(?:Begin|End)|BeginSample|EndSample|ProfilerUtil|CustomSampler/;

/** BK-23a confidence grades for source attribution. */
export type SourceConfidence =
  | 'exact-codegraph'
  | 'method-anchored'
  | 'alias-exact'
  | 'file-anchored'
  | 'class-anchored'
  | 'map-source-interval'
  | 'ambiguous'
  | 'not-found'
  | 'low-confidence'
  | 'suspicious';

export interface MarkerAliasEntry {
  marker: string;
  targetSymbol?: string;
  file?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  confidence: SourceConfidence;
  prefer?: boolean;
  rationale?: string;
}

export interface SourceAliasProvenance {
  source: 'marker-aliases';
  targetSymbol?: string;
  file?: string;
  startLine?: number;
  endLine?: number;
  rationale?: string;
  confidence?: SourceConfidence;
}

export interface GetSourceForSymbolFrameContext {
  runId: string;
  frameIndex: number;
  thread?: string;
  markerName?: string;
}

export interface GetSourceForSymbolArgs {
  runId?: string;
  symbol: string;
  maxLines?: number;
  includeCalls?: boolean;
  /** Nearest parent to distant ancestor symbol names from the call tree. */
  callStack?: string[];
  /** When callStack is omitted, build it from profiler parent_name chain in this frame. */
  frameContext?: GetSourceForSymbolFrameContext;
}

export interface GetSourceForSymbolResult {
  data: {
    symbol: string;
    resolvedVia: 'codegraph' | 'map-source' | 'none' | 'file-anchored' | 'callstack-disambiguated' | 'alias';
    found: boolean;
    kind?: string;
    language?: string;
    file?: string;
    startLine?: number;
    endLine?: number;
    signature?: string;
    sourceCode?: string;
    truncated?: boolean;
    businessCalls?: string[];
    note?: string;
    reason?: string;
    ambiguous?: boolean;
    candidateCount?: number;
    /** BK-23a: graded confidence — never treat class/interval/low as exact. */
    confidence?: SourceConfidence;
    confidenceReason?: string;
    alias?: SourceAliasProvenance;
  };
  provenance: { runId?: string; tool: 'getSourceForSymbol'; args: Record<string, unknown> };
}

const HIGH_CONFIDENCE: ReadonlySet<SourceConfidence> = new Set([
  'exact-codegraph',
  'method-anchored',
  'alias-exact',
]);

let _aliasTableCache: Map<string, MarkerAliasEntry> | null = null;

function loadMarkerAliasTable(): Map<string, MarkerAliasEntry> {
  if (_aliasTableCache) return _aliasTableCache;
  const map = new Map<string, MarkerAliasEntry>();
  try {
    const raw = JSON.parse(fs.readFileSync(MARKER_ALIASES_PATH, 'utf8')) as {
      aliases?: MarkerAliasEntry[];
    };
    for (const entry of raw.aliases ?? []) {
      if (entry?.marker) map.set(entry.marker, entry);
    }
  } catch {
    /* alias table optional */
  }
  _aliasTableCache = map;
  return map;
}

/** Test helper: clear alias cache so tests can reload after fixture changes. */
export function clearMarkerAliasCache(): void {
  _aliasTableCache = null;
}

function aliasProvenance(entry: MarkerAliasEntry): SourceAliasProvenance {
  return {
    source: 'marker-aliases',
    targetSymbol: entry.targetSymbol,
    file: entry.file ?? undefined,
    startLine: entry.startLine ?? undefined,
    endLine: entry.endLine ?? undefined,
    rationale: entry.rationale,
    confidence: entry.confidence,
  };
}

function withConfidence(
  result: GetSourceForSymbolResult,
  confidence: SourceConfidence,
  confidenceReason: string,
  alias?: SourceAliasProvenance
): GetSourceForSymbolResult {
  return {
    ...result,
    data: {
      ...result.data,
      confidence,
      confidenceReason,
      ...(alias ? { alias } : {}),
    },
  };
}

function resolveViaAlias(
  symbol: string,
  entry: MarkerAliasEntry,
  provenance: GetSourceForSymbolResult['provenance'],
  maxLines: number
): GetSourceForSymbolResult | null {
  if (!entry.file || entry.startLine == null || entry.endLine == null) return null;
  const relPath = normalizeFilePath(entry.file);
  const absPath = path.join(CODEBASE_ROOT, relPath).replace(/\\/g, '/');
  let sourceLines: string[];
  let truncated = false;
  try {
    const content = fs.readFileSync(absPath, 'utf8');
    const allLines = content.split('\n');
    const startLine = Math.max(1, entry.startLine);
    const endLine = Math.min(allLines.length, entry.endLine);
    const raw = allLines.slice(startLine - 1, endLine);
    if (raw.length <= maxLines) {
      sourceLines = raw;
    } else {
      const dropped = raw.length - maxLines;
      sourceLines = [...raw.slice(0, maxLines), `...(truncated ${dropped} lines)`];
      truncated = true;
    }
    return {
      data: {
        symbol,
        resolvedVia: 'alias',
        found: true,
        file: relPath,
        startLine,
        endLine,
        signature: entry.targetSymbol,
        sourceCode: sourceLines.join('\n'),
        truncated,
        note: entry.rationale,
        confidence: entry.confidence,
        confidenceReason: entry.rationale ?? `alias table: ${entry.confidence}`,
        alias: aliasProvenance(entry),
      },
      provenance,
    };
  } catch (readErr) {
    return {
      data: {
        symbol,
        resolvedVia: 'alias',
        found: false,
        reason: `alias resolved to ${relPath} but could not read file: ${readErr instanceof Error ? readErr.message : String(readErr)}`,
        confidence: 'not-found',
        confidenceReason: 'alias file unreadable',
        alias: aliasProvenance(entry),
      },
      provenance,
    };
  }
}

function normalizeFilePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function symbolToShortName(sym: string): string {
  const stripped = sym.startsWith('CS:') ? sym.slice(3) : sym;
  const parts = stripped.split(/[.:]/);
  return parts[parts.length - 1] ?? stripped;
}

function readLines(absPath: string, startLine: number, endLine: number): string[] {
  const content = fs.readFileSync(absPath, 'utf8');
  const lines = content.split('\n');
  // start_line/end_line are 1-based inclusive
  return lines.slice(startLine - 1, endLine);
}

const CALL_STACK_MAX_DEPTH = 20;

function resolveFrameThread(
  db: Database.Database,
  runId: string,
  frameIndex: number,
  thread?: string
): string | null {
  if (thread) return thread;
  const row = db
    .prepare(
      `SELECT DISTINCT thread FROM prism_frame_marker_samples
       WHERE run_id = ? AND frame_index = ? AND thread LIKE '%Main Thread%'
       LIMIT 1`
    )
    .get(runId, frameIndex) as { thread: string } | undefined;
  return row?.thread ?? null;
}

/** Walk parent_name chain from startMarker; returns nearest-to-farthest ancestors (excludes startMarker). */
export function buildCallStackFromFrame(
  db: Database.Database,
  runId: string,
  frameIndex: number,
  thread: string,
  startMarker: string
): string[] {
  const stack: string[] = [];
  const visited = new Set<string>();
  let currentMarker = startMarker;

  const parentStmt = db.prepare(
    `SELECT parent_name FROM prism_frame_marker_samples
     WHERE run_id = ? AND frame_index = ? AND thread = ? AND marker_name = ?
     LIMIT 1`
  );

  for (let depth = 0; depth < CALL_STACK_MAX_DEPTH; depth++) {
    const row = parentStmt.get(runId, frameIndex, thread, currentMarker) as
      | { parent_name: string | null }
      | undefined;

    if (!row?.parent_name) break;

    const parent = row.parent_name;
    if (visited.has(parent)) break;
    visited.add(parent);

    stack.push(parent);
    currentMarker = parent;
  }

  return stack;
}

export function getSourceForSymbol(
  db: Database.Database,
  args: GetSourceForSymbolArgs
): GetSourceForSymbolResult {
  const { runId, symbol, maxLines = 120, includeCalls = true, callStack, frameContext } = args;
  const provenance = { runId, tool: 'getSourceForSymbol' as const, args: args as Record<string, unknown> };

  // ── Compute shortName ───────────────────────────────────────────
  // Strip CS: prefix (e.g. "CS:AOE.MeshUIManager" → "AOE.MeshUIManager")
  // then take last dot/colon segment (e.g. "OutSideViewArmyLineMgr.OnUpdate" → "OnUpdate",
  // "CS:AOE.MeshUIManager" → "MeshUIManager", "CS:AOE.Outside.OutSideViewArmyLineMgr" → "OutSideViewArmyLineMgr")
  const stripped = symbol.startsWith('CS:') ? symbol.slice(3) : symbol;
  const parts = stripped.split(/[.:]/);
  const shortName = parts[parts.length - 1] ?? stripped;

  // ── Load BK-23a marker alias table ──────────────────────────────
  const aliasTable = loadMarkerAliasTable();
  const aliasEntry = aliasTable.get(symbol) ?? null;
  const aliasProv = aliasEntry ? aliasProvenance(aliasEntry) : undefined;

  // Prefer alias when marked prefer (overrides bad map-source / ambiguous paths).
  // Never claim exact-codegraph via alias alone — only alias's declared confidence.
  if (aliasEntry?.prefer) {
    const viaAlias = resolveViaAlias(symbol, aliasEntry, provenance, maxLines);
    if (viaAlias) return viaAlias;
  }

  // ── Load marker-source-map once ─────────────────────────────────
  type MapEntry = { files?: Array<{ path: string; line: number }>; snippet?: string };
  let mapSource: Record<string, MapEntry> = {};
  try {
    mapSource = JSON.parse(fs.readFileSync(MARKER_SOURCE_MAP_PATH, 'utf8')) as typeof mapSource;
  } catch { /* map may not exist — handled below */ }

  // Look up symbol in map: try exact key, also try with/without CS: prefix,
  // and try the className.shortName form (e.g. for "OutSideViewArmyLineMgr.OnUpdate" not in map,
  // we also try the class-level key "CS:AOE.Outside.OutSideViewArmyLineMgr").
  // The map keys use both styles — match what we can.
  function findMapEntry(sym: string): { entry: MapEntry; matchedKey: string } | null {
    if (mapSource[sym]) return { entry: mapSource[sym], matchedKey: sym };
    const withCs = 'CS:' + sym;
    if (mapSource[withCs]) return { entry: mapSource[withCs], matchedKey: withCs };
    const withoutCs = sym.startsWith('CS:') ? sym.slice(3) : null;
    if (withoutCs && mapSource[withoutCs]) return { entry: mapSource[withoutCs], matchedKey: withoutCs };
    // Try stripping to class name: "OutSideViewArmyLineMgr.OnUpdate" → match class key containing "OutSideViewArmyLineMgr"
    const className = parts.length >= 2 ? parts[parts.length - 2] : null;
    if (className) {
      const classKey = Object.keys(mapSource).find(k =>
        k !== '_meta' && (k.endsWith('.' + className) || k.endsWith(':' + className) || k === className || k === 'CS:' + className)
      );
      if (classKey) return { entry: mapSource[classKey], matchedKey: classKey };
    }
    return null;
  }

  const mapMatch = findMapEntry(symbol);

  // ── Open codegraph DB ───────────────────────────────────────────
  let cgDb: InstanceType<typeof BetterSqlite3> | null = null;
  try {
    cgDb = new BetterSqlite3(CODEGRAPH_DB_PATH, { readonly: true });
  } catch (openErr) {
    // codegraph unavailable — fall through to pure map-source path
  }

  // Helper: read business calls for a node id
  function getBusinessCalls(nodeId: string): string[] {
    if (!cgDb || !includeCalls) return [];
    try {
      const callTargets = cgDb
        .prepare("SELECT DISTINCT target FROM edges WHERE source=? AND kind='calls'")
        .all(nodeId) as Array<{ target: string }>;
      if (callTargets.length === 0) return [];
      const targetIds = callTargets.map(e => e.target);
      const placeholders = targetIds.map(() => '?').join(',');
      const targetNodes = cgDb
        .prepare(`SELECT name,kind FROM nodes WHERE id IN (${placeholders})`)
        .all(...targetIds) as Array<{ name: string; kind: string }>;
      return targetNodes
        .filter(n => !PROFILER_NOISE_RE.test(n.name))
        .slice(0, 15)
        .map(n => `${n.name} (${n.kind})`);
    } catch { return []; }
  }

  // Helper: read and cap source lines
  function readCapped(absPath: string, startLine: number, endLine: number): { lines: string[]; truncated: boolean } {
    const raw = readLines(absPath, startLine, endLine);
    if (raw.length <= maxLines) return { lines: raw, truncated: false };
    const dropped = raw.length - maxLines;
    const lines = [...raw.slice(0, maxLines), `...(truncated ${dropped} lines)`];
    return { lines, truncated: true };
  }

  // ════════════════════════════════════════════════════════════════
  // PATH A — file-anchored (PRIMARY): symbol is in marker-source-map
  // ════════════════════════════════════════════════════════════════
  if (mapMatch && mapMatch.entry.files?.[0] && cgDb) {
    const fileEntry = mapMatch.entry.files[0];
    const rawPath = normalizeFilePath(fileEntry.path);
    const relPath = rawPath.startsWith('AOE3D/') ? rawPath.slice('AOE3D/'.length) : rawPath;
    const mapLine = fileEntry.line;

    // Build a LIKE pattern from basename (e.g. "%OutSideViewArmyLineMgr.cs")
    const basename = path.basename(relPath);
    const likePattern = '%' + basename;

    type CgNode = {
      id: string;
      kind: string;
      name: string;
      file_path: string;
      language: string;
      start_line: number;
      end_line: number;
      signature: string | null;
    };

    // Query all method/function/class nodes in this specific file
    const fileNodes = cgDb
      .prepare(
        "SELECT id,kind,name,file_path,language,start_line,end_line,signature FROM nodes WHERE file_path LIKE ? AND kind IN ('method','function','class')"
      )
      .all(likePattern) as CgNode[];

    if (fileNodes.length > 0) {
      // Determine target node: pick by name match first, then by line containment
      let picked: CgNode | undefined;
      let pickMode: 'method-name' | 'class-name' | 'line-containment' | undefined;

      // 1. Exact shortName match among methods/functions in this file
      const methodsInFile = fileNodes.filter(n => n.kind === 'method' || n.kind === 'function');
      picked = methodsInFile.find(n => n.name === shortName);
      if (picked) pickMode = 'method-name';

      // 2. If the marker IS the class itself (shortName matches class name) → pick class
      if (!picked) {
        const classNodes = fileNodes.filter(n => n.kind === 'class');
        picked = classNodes.find(n => n.name === shortName);
        if (picked) pickMode = 'class-name';
      }

      // 3. Fall back: find the method whose [start_line,end_line] contains mapLine
      if (!picked && mapLine > 0) {
        picked = methodsInFile.find(n => n.start_line <= mapLine && n.end_line >= mapLine);
        if (picked) pickMode = 'line-containment';
      }

      // 4. If still nothing, fall through to map-source window path
      if (picked) {
        const absPath = path.join(CODEBASE_ROOT, normalizeFilePath(picked.file_path)).replace(/\\/g, '/');
        let sourceLines: string[];
        let truncated: boolean;
        try {
          const { lines, truncated: t } = readCapped(absPath, picked.start_line, picked.end_line);
          sourceLines = lines;
          truncated = t;
        } catch (readErr) {
          // File unreadable — fall through to map-source window
          picked = undefined as unknown as CgNode;
          // (fall through to Path C below by leaving picked undefined and breaking early)
          cgDb.close();
          cgDb = null;
          return _fallbackMapSourceWindow(relPath, mapLine, symbol, provenance, maxLines, aliasProv);
        }

        const businessCalls = getBusinessCalls(picked.id);

        // Confidence: never promote class / Create()-line containment to exact.
        let confidence: SourceConfidence;
        let confidenceReason: string;
        if (pickMode === 'class-name') {
          confidence = aliasEntry?.confidence === 'class-anchored' ? 'class-anchored' : 'class-anchored';
          confidenceReason =
            aliasEntry?.rationale ??
            `file-anchored to class ${picked.name}; not a method-level attribution`;
        } else if (pickMode === 'line-containment') {
          confidence = 'low-confidence';
          confidenceReason =
            aliasEntry?.rationale ??
            `map-source line ${mapLine} fell inside ${picked.name} via containment — may be CustomSampler.Create site, not the true hot body`;
        } else if (aliasEntry && !HIGH_CONFIDENCE.has(aliasEntry.confidence) && aliasEntry.confidence !== 'method-anchored') {
          confidence = aliasEntry.confidence;
          confidenceReason = aliasEntry.rationale ?? `alias overrides file-anchored grade to ${aliasEntry.confidence}`;
        } else {
          confidence = aliasEntry?.confidence === 'method-anchored' ? 'method-anchored' : 'method-anchored';
          confidenceReason =
            aliasEntry?.rationale ??
            `file-anchored method name match for ${picked.name} in mapped file`;
        }

        cgDb.close();
        cgDb = null;
        return withConfidence(
          {
            data: {
              symbol,
              resolvedVia: 'file-anchored',
              found: true,
              kind: picked.kind,
              language: picked.language,
              file: normalizeFilePath(picked.file_path),
              startLine: picked.start_line,
              endLine: picked.end_line,
              signature: picked.signature ?? undefined,
              sourceCode: sourceLines.join('\n'),
              truncated,
              ...(businessCalls.length > 0 ? { businessCalls } : {}),
            },
            provenance,
          },
          confidence,
          confidenceReason,
          aliasProv
        );
      }
      // picked still undefined → fall through to Path C
    }

    // PATH C: in map-source but codegraph had nothing for this file → read window around line
    cgDb.close();
    cgDb = null;
    return _fallbackMapSourceWindow(relPath, mapLine, symbol, provenance, maxLines, aliasProv);
  }

  // If map-source matched but no codegraph → window fallback
  if (mapMatch && mapMatch.entry.files?.[0] && !cgDb) {
    const fileEntry = mapMatch.entry.files[0];
    const rawPath = normalizeFilePath(fileEntry.path);
    const relPath = rawPath.startsWith('AOE3D/') ? rawPath.slice('AOE3D/'.length) : rawPath;
    return _fallbackMapSourceWindow(relPath, fileEntry.line, symbol, provenance, maxLines, aliasProv);
  }

  // ════════════════════════════════════════════════════════════════
  // PATH B — codegraph name-only (FALLBACK): symbol NOT in map-source
  // ════════════════════════════════════════════════════════════════
  if (cgDb) {
    try {
      type CgNode = {
        id: string;
        kind: string;
        name: string;
        file_path: string;
        language: string;
        start_line: number;
        end_line: number;
        signature: string | null;
      };

      const rows = cgDb
        .prepare(
          "SELECT id,kind,name,file_path,language,start_line,end_line,signature FROM nodes WHERE name=? AND kind IN ('method','function')"
        )
        .all(shortName) as CgNode[];

      if (rows.length === 0) {
        cgDb.close();
        cgDb = null;
        // Non-prefer alias can still rescue not-found (e.g. supplemental entries with file).
        if (aliasEntry && !aliasEntry.prefer) {
          const viaAlias = resolveViaAlias(symbol, aliasEntry, provenance, maxLines);
          if (viaAlias) return viaAlias;
        }
        return withConfidence(
          {
            data: {
              symbol,
              resolvedVia: 'none',
              found: false,
              reason: 'symbol not in codegraph nor map-source; may need map-source.ts to grep it first',
            },
            provenance,
          },
          'not-found',
          'not in codegraph nor map-source',
          aliasProv
        );
      }

      type CgNodePick = CgNode;

      function buildPathBSuccess(
        picked: CgNodePick,
        resolvedVia: 'codegraph' | 'callstack-disambiguated',
        note?: string
      ): GetSourceForSymbolResult {
        const absPath = path.join(CODEBASE_ROOT, normalizeFilePath(picked.file_path)).replace(/\\/g, '/');
        let sourceLines: string[];
        let truncated = false;
        try {
          const { lines, truncated: t } = readCapped(absPath, picked.start_line, picked.end_line);
          sourceLines = lines;
          truncated = t;
        } catch (readErr) {
          return withConfidence(
            {
              data: {
                symbol,
                resolvedVia: 'codegraph',
                found: false,
                reason: `codegraph resolved to ${picked.file_path} but could not read file: ${readErr instanceof Error ? readErr.message : String(readErr)}`,
              },
              provenance,
            },
            'not-found',
            'codegraph file unreadable',
            aliasProv
          );
        }

        const businessCalls = getBusinessCalls(picked.id);
        const confidence: SourceConfidence =
          resolvedVia === 'callstack-disambiguated'
            ? 'exact-codegraph'
            : aliasEntry?.confidence === 'exact-codegraph'
              ? 'exact-codegraph'
              : 'exact-codegraph';
        const confidenceReason =
          resolvedVia === 'callstack-disambiguated'
            ? note ?? 'call-stack disambiguated to a unique codegraph node'
            : aliasEntry?.rationale ??
              `codegraph exact name match for ${picked.name}`;
        return withConfidence(
          {
            data: {
              symbol,
              resolvedVia,
              found: true,
              kind: picked.kind,
              language: picked.language,
              file: normalizeFilePath(picked.file_path),
              startLine: picked.start_line,
              endLine: picked.end_line,
              signature: picked.signature ?? undefined,
              sourceCode: sourceLines.join('\n'),
              truncated,
              ...(businessCalls.length > 0 ? { businessCalls } : {}),
              ...(note ? { note } : {}),
            },
            provenance,
          },
          confidence,
          confidenceReason,
          aliasProv
        );
      }

      function tryCallStackDisambiguation(
        candidates: CgNodePick[],
        stack: string[]
      ): { picked: CgNodePick; matchedAncestor: string } | null {
        const ancestorShortNames = new Set(
          stack.map(s => symbolToShortName(s)).filter(s => s.length > 0)
        );
        if (ancestorShortNames.size === 0) return null;

        const matching: Array<{ node: CgNodePick; matchedAncestors: string[] }> = [];

        for (const cand of candidates) {
          const callerSources = cgDb!
            .prepare("SELECT source FROM edges WHERE target=? AND kind='calls'")
            .all(cand.id) as Array<{ source: string }>;
          if (callerSources.length === 0) continue;

          const callerIds = callerSources.map(c => c.source);
          const placeholders = callerIds.map(() => '?').join(',');
          const callerNodes = cgDb!
            .prepare(`SELECT name FROM nodes WHERE id IN (${placeholders})`)
            .all(...callerIds) as Array<{ name: string }>;

          const callerShortNames = new Set(callerNodes.map(n => symbolToShortName(n.name)));
          const matchedAncestors = [...ancestorShortNames].filter(a => callerShortNames.has(a));
          if (matchedAncestors.length > 0) {
            matching.push({ node: cand, matchedAncestors });
          }
        }

        if (matching.length !== 1) return null;
        return { picked: matching[0].node, matchedAncestor: matching[0].matchedAncestors[0] };
      }

      const normalizedCallStack = (callStack ?? []).filter(s => s.length > 0);

      let autoCallStack: string[] = [];
      if (normalizedCallStack.length === 0 && frameContext) {
        const resolvedThread = resolveFrameThread(
          db,
          frameContext.runId,
          frameContext.frameIndex,
          frameContext.thread
        );
        if (resolvedThread) {
          const startMarker = frameContext.markerName ?? symbol;
          autoCallStack = buildCallStackFromFrame(
            db,
            frameContext.runId,
            frameContext.frameIndex,
            resolvedThread,
            startMarker
          );
        }
      }

      const effectiveStack =
        normalizedCallStack.length > 0 ? normalizedCallStack : autoCallStack;
      const fromFrameContext =
        normalizedCallStack.length === 0 && autoCallStack.length > 0;

      // Call-stack disambiguation when multiple name-only candidates exist
      if (rows.length > 1 && effectiveStack.length > 0) {
        const disambiguated = tryCallStackDisambiguation(rows, effectiveStack);
        if (disambiguated) {
          const note = fromFrameContext
            ? `由 profiler 帧 ${frameContext!.frameIndex} 的运行时调用栈自动消歧，祖先 ${disambiguated.matchedAncestor}`
            : `用调用栈祖先 ${disambiguated.matchedAncestor} 消歧，从 ${rows.length} 个候选中定位`;
          const result = buildPathBSuccess(
            disambiguated.picked,
            'callstack-disambiguated',
            note
          );
          cgDb.close();
          cgDb = null;
          return result;
        }

        cgDb.close();
        cgDb = null;
        // Prefer alias over unresolved ambiguous (e.g. OnCameraMove handled earlier via prefer;
        // this covers non-prefer aliases if any).
        if (aliasEntry) {
          const viaAlias = resolveViaAlias(symbol, aliasEntry, provenance, maxLines);
          if (viaAlias) return viaAlias;
        }
        const failNote = fromFrameContext
          ? `名字歧义，map-source无此marker的精确文件，无法可靠定位；建议先跑 map-source.ts 补映射。frameContext 回溯的运行时调用栈仍无法唯一收敛`
          : `名字歧义，map-source无此marker的精确文件，无法可靠定位；建议先跑 map-source.ts 补映射。提供了调用栈但仍无法唯一收敛`;
        return withConfidence(
          {
            data: {
              symbol,
              resolvedVia: 'none',
              found: false,
              ambiguous: true,
              candidateCount: rows.length,
              note: failNote,
            },
            provenance,
          },
          'ambiguous',
          failNote,
          aliasProv
        );
      }

      // If > 3 same-named results and no map-source file to anchor: refuse to guess
      if (rows.length > 3) {
        cgDb.close();
        cgDb = null;
        if (aliasEntry) {
          const viaAlias = resolveViaAlias(symbol, aliasEntry, provenance, maxLines);
          if (viaAlias) return viaAlias;
        }
        const ambNote = `名字歧义，map-source无此marker的精确文件，无法可靠定位；建议先跑 map-source.ts 补映射`;
        return withConfidence(
          {
            data: {
              symbol,
              resolvedVia: 'none',
              found: false,
              ambiguous: true,
              candidateCount: rows.length,
              note: ambNote,
            } as GetSourceForSymbolResult['data'],
            provenance,
          },
          'ambiguous',
          ambNote,
          aliasProv
        );
      }

      // ≤ 3 results: pick unambiguously or with low collision risk
      const picked = rows[0];
      const absPath = path.join(CODEBASE_ROOT, normalizeFilePath(picked.file_path)).replace(/\\/g, '/');
      let sourceLines: string[];
      let truncated = false;
      try {
        const { lines, truncated: t } = readCapped(absPath, picked.start_line, picked.end_line);
        sourceLines = lines;
        truncated = t;
      } catch (readErr) {
        cgDb.close();
        cgDb = null;
        return withConfidence(
          {
            data: {
              symbol,
              resolvedVia: 'codegraph',
              found: false,
              reason: `codegraph resolved to ${picked.file_path} but could not read file: ${readErr instanceof Error ? readErr.message : String(readErr)}`,
            },
            provenance,
          },
          'not-found',
          'codegraph file unreadable',
          aliasProv
        );
      }

      const businessCalls = getBusinessCalls(picked.id);

      const ambiguityNote =
        rows.length > 1
          ? `Ambiguous: ${rows.length} nodes matched "${shortName}"; picked first (${picked.file_path}:${picked.start_line}-${picked.end_line}).`
          : undefined;

      const confidence: SourceConfidence =
        rows.length > 1 ? 'low-confidence' : 'exact-codegraph';
      const confidenceReason =
        rows.length > 1
          ? ambiguityNote!
          : aliasEntry?.rationale ?? `codegraph exact name match for ${picked.name}`;

      cgDb.close();
      cgDb = null;
      return withConfidence(
        {
          data: {
            symbol,
            resolvedVia: 'codegraph',
            found: true,
            kind: picked.kind,
            language: picked.language,
            file: normalizeFilePath(picked.file_path),
            startLine: picked.start_line,
            endLine: picked.end_line,
            signature: picked.signature ?? undefined,
            sourceCode: sourceLines.join('\n'),
            truncated,
            ...(businessCalls.length > 0 ? { businessCalls } : {}),
            ...(ambiguityNote ? { note: ambiguityNote } : {}),
          },
          provenance,
        },
        confidence,
        confidenceReason,
        aliasProv
      );
    } catch (err) {
      if (cgDb) { try { cgDb.close(); } catch { /* ignore */ } cgDb = null; }
    } finally {
      if (cgDb) { try { cgDb.close(); } catch { /* ignore */ } cgDb = null; }
    }
  }

  if (aliasEntry) {
    const viaAlias = resolveViaAlias(symbol, aliasEntry, provenance, maxLines);
    if (viaAlias) return viaAlias;
  }

  return withConfidence(
    {
      data: {
        symbol,
        resolvedVia: 'none',
        found: false,
        reason: 'symbol not in codegraph nor map-source; may need map-source.ts to grep it first',
      },
      provenance,
    },
    'not-found',
    'symbol not in codegraph nor map-source',
    aliasProv
  );
}

/** Path C: map-source found a file+line but no codegraph node matched → read a window around line */
function _fallbackMapSourceWindow(
  relPath: string,
  lineNum: number,
  symbol: string,
  provenance: GetSourceForSymbolResult['provenance'],
  maxLines: number,
  alias?: SourceAliasProvenance
): GetSourceForSymbolResult {
  const absPath = path.join(CODEBASE_ROOT, relPath).replace(/\\/g, '/');
  let sourceLines: string[];
  let startLine: number;
  let endLine: number;
  try {
    const content = fs.readFileSync(absPath, 'utf8');
    const allLines = content.split('\n');
    const totalLines = allLines.length;
    startLine = Math.max(1, lineNum - 2);
    endLine = Math.min(totalLines, lineNum + 40);
    if (endLine - startLine + 1 > maxLines) {
      endLine = startLine + maxLines - 1;
    }
    sourceLines = allLines.slice(startLine - 1, endLine);
  } catch (readErr) {
    return withConfidence(
      {
        data: {
          symbol,
          resolvedVia: 'map-source',
          found: false,
          reason: `map-source found ${relPath} but could not read file: ${readErr instanceof Error ? readErr.message : String(readErr)}`,
        },
        provenance,
      },
      'not-found',
      'map-source file unreadable',
      alias
    );
  }
  return withConfidence(
    {
      data: {
        symbol,
        resolvedVia: 'map-source',
        found: true,
        file: relPath,
        startLine,
        endLine,
        sourceCode: sourceLines.join('\n'),
        truncated: false,
        note: 'interval-marker: showing code near sampler location (not a resolved function)',
      },
      provenance,
    },
    alias?.confidence && !HIGH_CONFIDENCE.has(alias.confidence)
      ? alias.confidence
      : 'map-source-interval',
    alias?.rationale ??
      'interval-marker: showing code near sampler Create/Begin site — not equivalent to a function body',
    alias
  );
}

// ─────────────────────────── Tool 8: aggregateSubtree ──────────────

export interface AggregateSubtreeArgs {
  runId: string;
  thread?: string;
  topN?: number;
  fanoutThreshold?: number;
  minTotalMsPerFrame?: number;
}

export interface SubtreeFanoutRow {
  markerName: string;
  thread: string;
  subtreeMsPerFrame: number;
  ownSelfMsPerFrame: number;
  directChildCount: number;
  maxChildRatio: number;
  topChildren: Array<{ name: string; msPerFrame: number }>;
}

export interface AggregateSubtreeResult {
  data: SubtreeFanoutRow[];
  provenance: Provenance;
}

export function aggregateSubtree(
  db: Database.Database,
  args: AggregateSubtreeArgs
): AggregateSubtreeResult {
  const {
    runId,
    thread,
    topN = 15,
    fanoutThreshold = 0.6,
    minTotalMsPerFrame = 2.0,
  } = args;
  const effectiveTopN = Math.min(topN, 30);

  // Step 1: Get frame count for this run
  const metaRow = db
    .prepare('SELECT COUNT(*) AS cnt FROM prism_frame_meta WHERE run_id = ?')
    .get(runId) as { cnt: number };
  const frameCount = metaRow.cnt || 1;

  // Step 2: Node totals for all (marker_name, thread)
  // Exclude root nodes (those that ONLY ever appear at depth=1 with no parent_name)
  // Root nodes like PlayerLoop are not useful fan-out hotspots for diagnosis.
  let threadFilter = thread ? 'AND thread = ?' : '';
  const nodeParams: unknown[] = [runId];
  if (thread) nodeParams.push(thread);

  const nodeSql = `
    SELECT
      marker_name,
      thread,
      SUM(total_ms) AS tot,
      SUM(self_ms)  AS slf,
      MIN(depth)    AS min_depth
    FROM prism_frame_marker_samples
    WHERE run_id = ?
      ${threadFilter}
    GROUP BY marker_name, thread
    HAVING (SUM(total_ms) / ?) >= ?
      AND NOT (MIN(depth) = 1 AND MAX(parent_name) IS NULL)
    ORDER BY tot DESC
    LIMIT 80
  `;
  nodeParams.push(frameCount, minTotalMsPerFrame);

  const nodeRows = db.prepare(nodeSql).all(...nodeParams) as Array<{
    marker_name: string;
    thread: string;
    tot: number;
    slf: number;
    min_depth: number;
  }>;

  // Step 3: Single query — aggregate all parent_name→child relationships at once
  // Uses idx_pfms_run_marker_thread_self (run_id, marker_name, thread, ...) for the run filter
  const childParams: unknown[] = [runId];
  if (thread) childParams.push(thread);

  const childSql = `
    SELECT
      parent_name,
      thread,
      marker_name AS child_name,
      SUM(total_ms) AS ctot
    FROM prism_frame_marker_samples
    WHERE run_id = ?
      ${threadFilter}
      AND parent_name IS NOT NULL
    GROUP BY parent_name, thread, marker_name
  `;

  const childRows = db.prepare(childSql).all(...childParams) as Array<{
    parent_name: string;
    thread: string;
    child_name: string;
    ctot: number;
  }>;

  // Build a map: (parent_name, thread) → [{child_name, ctot}]
  const childMap = new Map<string, Array<{ child_name: string; ctot: number }>>();
  for (const c of childRows) {
    const key = `${c.parent_name}\0${c.thread}`;
    let arr = childMap.get(key);
    if (!arr) {
      arr = [];
      childMap.set(key, arr);
    }
    arr.push({ child_name: c.child_name, ctot: c.ctot });
  }

  // Step 4: Evaluate fan-out for each candidate node
  const results: SubtreeFanoutRow[] = [];

  for (const node of nodeRows) {
    const key = `${node.marker_name}\0${node.thread}`;
    const children = childMap.get(key);

    if (!children || children.length < 3) continue; // must have >= 3 distinct direct children

    // Sort children by ctot desc
    children.sort((a, b) => b.ctot - a.ctot);

    const nodeTot = node.tot;
    const maxChildTotal = children[0]?.ctot ?? 0;
    const maxChildRatio = nodeTot > 0 ? maxChildTotal / nodeTot : 1;

    if (maxChildRatio >= fanoutThreshold) continue; // forwarding pipe, skip

    const subtreeMsPerFrame = nodeTot / frameCount;
    const ownSelfMsPerFrame = node.slf / frameCount;

    const topChildren = children.slice(0, 6).map(c => ({
      name: c.child_name,
      msPerFrame: +(c.ctot / frameCount).toFixed(3),
    }));

    results.push({
      markerName: node.marker_name,
      thread: node.thread,
      subtreeMsPerFrame: +subtreeMsPerFrame.toFixed(3),
      ownSelfMsPerFrame: +ownSelfMsPerFrame.toFixed(3),
      directChildCount: children.length,
      maxChildRatio: +maxChildRatio.toFixed(3),
      topChildren,
    });
  }

  // Sort by subtreeMsPerFrame desc, take topN
  results.sort((a, b) => b.subtreeMsPerFrame - a.subtreeMsPerFrame);
  const trimmed = results.slice(0, effectiveTopN);

  return {
    data: trimmed,
    provenance: { runId, tool: 'aggregateSubtree', args: args as Record<string, unknown> },
  };
}

// ─────────────────────────── WT-013: Perfetto JSON query tools ─────

export type PerfettoSampleRole = 'base' | 'cur' | 'throttle' | 'single';

export interface PerfettoJsonToolArgs {
  runId?: string;
  role?: PerfettoSampleRole;
  runDir?: string;
}

interface LoadedPerfettoRun {
  runId: string;
  role: PerfettoSampleRole;
  runDir: string;
  profilePath: string;
  summaryPath: string;
  profile: Record<string, unknown>;
  summary: Record<string, unknown>;
  core: Record<string, unknown>;
  perfetto: Record<string, unknown>;
}

const PERFETTO_TRIAD_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/prism-out/bk26b-perfetto-triad'
);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asRecord(v: unknown): Record<string, unknown> {
  return isRecord(v) ? v : {};
}

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function roundNumber(v: number | undefined, digits = 3): number | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  return +v.toFixed(digits);
}

function isNonEmptyObject(v: unknown): boolean {
  return Array.isArray(v) ? v.length > 0 : isRecord(v) && Object.keys(v).length > 0;
}

function normalizePerfettoRole(role: unknown): PerfettoSampleRole {
  return role === 'base' || role === 'cur' || role === 'throttle' || role === 'single'
    ? role
    : 'cur';
}

function resolvePerfettoRunDir(args: PerfettoJsonToolArgs): { role: PerfettoSampleRole; runDir: string } {
  const role = normalizePerfettoRole(args.role);
  if (args.runDir) {
    return { role, runDir: path.resolve(args.runDir) };
  }
  const dirRole = role === 'single' ? 'cur' : role;
  return { role, runDir: path.join(PERFETTO_TRIAD_ROOT, dirRole) };
}

function readJsonFile(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

function loadPerfettoRun(args: PerfettoJsonToolArgs): LoadedPerfettoRun {
  const { role, runDir } = resolvePerfettoRunDir(args);
  const profilePath = path.join(runDir, 'perfetto-profile.json');
  const summaryPath = path.join(runDir, 'perfetto-profile-summary.json');
  const profile = readJsonFile(profilePath);
  const summary = readJsonFile(summaryPath);
  const core = asRecord(profile.core ?? asRecord(profile.profile).core);
  const detail = asRecord(profile.detail ?? asRecord(profile.profile).detail);
  const perfetto = asRecord(detail.perfetto ?? profile.perfetto ?? summary);
  const runId = args.runId ?? `bk26b-perfetto-${role}`;

  return { runId, role, runDir, profilePath, summaryPath, profile, summary, core, perfetto };
}

function perfettoProvenance(
  tool: string,
  args: PerfettoJsonToolArgs,
  run: LoadedPerfettoRun
): Provenance {
  return {
    runId: run.runId,
    tool,
    args: args as Record<string, unknown>,
    source: 'perfetto',
    role: run.role,
  };
}

function getPerfettoProfileWindow(run: LoadedPerfettoRun): Record<string, unknown> | null {
  const window = run.perfetto.profileWindow;
  return isRecord(window) ? window : null;
}

export interface QuerySchedStateArgs extends PerfettoJsonToolArgs {
  thread?: string;
  topN?: number;
  sortBy?: 'runningPct' | 'runnablePct' | 'sleepingPct' | 'name';
}

export interface QuerySchedStateResult {
  data: {
    available: boolean;
    window: Record<string, unknown> | null;
    totalThreads: number;
    threads: Array<{
      name: string;
      count?: number;
      runningPct?: number;
      runnablePct?: number;
      sleepingPct?: number;
      totalNs?: number;
    }>;
  };
  provenance: Provenance;
}

export function querySchedState(
  _db: Database.Database | null | undefined,
  args: QuerySchedStateArgs
): QuerySchedStateResult {
  const run = loadPerfettoRun(args);
  const sched = asRecord(run.perfetto.threadsSched ?? run.summary.threadsSched);
  const needle = args.thread?.toLowerCase();
  const sortBy = args.sortBy ?? 'runningPct';
  const topN = Math.min(args.topN ?? 20, 50);

  let rows = Object.entries(sched).map(([name, raw]) => {
    const r = asRecord(raw);
    return {
      name,
      count: asNumber(r.count),
      runningPct: asNumber(r.runningPct),
      runnablePct: asNumber(r.runnablePct),
      sleepingPct: asNumber(r.sleepingPct),
      totalNs: asNumber(r.totalNs),
    };
  });

  if (needle) rows = rows.filter(r => r.name.toLowerCase().includes(needle));
  rows.sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    return (b[sortBy] ?? 0) - (a[sortBy] ?? 0);
  });

  return {
    data: {
      available: rows.length > 0,
      window: getPerfettoProfileWindow(run),
      totalThreads: rows.length,
      threads: rows.slice(0, topN),
    },
    provenance: perfettoProvenance('querySchedState', args, run),
  };
}

export interface QueryAtraceSlicesArgs extends PerfettoJsonToolArgs {
  pattern?: string;
  topN?: number;
  sortBy?: 'totalMs' | 'avgMs' | 'count';
}

export interface QueryAtraceSlicesResult {
  data: {
    available: boolean;
    totalSlices: number;
    rows: Array<{
      name: string;
      count?: number;
      avgMs?: number;
      totalMs?: number;
      totalPctOfWindow?: number;
    }>;
  };
  provenance: Provenance;
}

export function queryAtraceSlices(
  _db: Database.Database | null | undefined,
  args: QueryAtraceSlicesArgs
): QueryAtraceSlicesResult {
  const run = loadPerfettoRun(args);
  const slices = asRecord(run.perfetto.atraceSlices ?? run.summary.atraceSlices);
  const window = getPerfettoProfileWindow(run);
  const durMs = asNumber(window?.durMs);
  const pattern = args.pattern?.toLowerCase();
  const sortBy = args.sortBy ?? 'totalMs';
  const topN = Math.min(args.topN ?? 20, 50);

  let rows = Object.entries(slices).map(([name, raw]) => {
    const r = asRecord(raw);
    const totalMs = asNumber(r.totalMs);
    return {
      name,
      count: asNumber(r.count),
      avgMs: asNumber(r.avgMs),
      totalMs,
      totalPctOfWindow: durMs && totalMs != null ? roundNumber((totalMs / durMs) * 100, 2) : undefined,
    };
  });

  if (pattern) rows = rows.filter(r => r.name.toLowerCase().includes(pattern));
  rows.sort((a, b) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0));

  return {
    data: {
      available: rows.length > 0,
      totalSlices: rows.length,
      rows: rows.slice(0, topN),
    },
    provenance: perfettoProvenance('queryAtraceSlices', args, run),
  };
}

export interface QueryFrameTimelineArgs extends PerfettoJsonToolArgs {}

export interface QueryFrameTimelineResult {
  data: {
    androidFrameTimeline: {
      available: boolean;
      reason?: string;
      raw?: unknown;
    };
    choreographer: {
      available: boolean;
      p50Ms: number | null;
      p95Ms: number | null;
      p99Ms: number | null;
      fps: number | null;
      slowFrameRate: number | null;
    };
    playerLoopPercentiles:
      | {
          available: true;
          count: number | null;
          p50Ms: number | null;
          p95Ms: number | null;
          p99Ms: number | null;
          fps: number | null;
          slowFrameRate: number | null;
        }
      | {
          available: false;
          reason: string;
        };
  };
  provenance: Provenance;
}

function findChoreographerFrame(run: LoadedPerfettoRun): Record<string, unknown> | null {
  const coreFrames = Array.isArray(run.core.frame) ? run.core.frame : [];
  const fromCore = coreFrames.find(f => asRecord(f).frameDefinition === 'choreographer');
  if (fromCore) return asRecord(fromCore);
  const summaryFrames = Array.isArray(run.summary.frame) ? run.summary.frame : [];
  const fromSummary = summaryFrames.find(f => asRecord(f).frameDefinition === 'choreographer');
  if (fromSummary) return asRecord(fromSummary);
  const nested = asRecord(run.summary.frame).choreographer;
  return isRecord(nested) ? nested : null;
}

function findPlayerLoopFrame(run: LoadedPerfettoRun): Record<string, unknown> | null {
  const coreFrames = Array.isArray(run.core.frame) ? run.core.frame : [];
  const fromCore = coreFrames.find(f => asRecord(f).frameDefinition === 'playerloop');
  if (fromCore) return asRecord(fromCore);
  const summaryFrames = Array.isArray(run.summary.frame) ? run.summary.frame : [];
  const fromSummary = summaryFrames.find(f => asRecord(f).frameDefinition === 'playerloop');
  return fromSummary ? asRecord(fromSummary) : null;
}

export function queryFrameTimeline(
  _db: Database.Database | null | undefined,
  args: QueryFrameTimelineArgs
): QueryFrameTimelineResult {
  const run = loadPerfettoRun(args);
  const rawFrameTimeline = run.perfetto.frameTimeline ?? run.summary.frameTimeline;
  const choreographer = findChoreographerFrame(run);
  const plFrame = findPlayerLoopFrame(run);
  const androidAvailable = isNonEmptyObject(rawFrameTimeline);
  const hasChoreo =
    choreographer != null &&
    (asNumber(choreographer.p50Ms) != null ||
      asNumber(choreographer.fps) != null ||
      isNonEmptyObject(choreographer));
  const hasPlayerLoop =
    plFrame != null &&
    (asNumber(plFrame.p50Ms) != null || asNumber(plFrame.fps) != null || asNumber(plFrame.count) != null);

  return {
    data: {
      androidFrameTimeline: androidAvailable
        ? { available: true, raw: rawFrameTimeline }
        : {
            available: false,
            reason: 'Android FrameTimeline data is not present in perfetto-profile.json or summary; no jank classification synthesized.',
          },
      choreographer: {
        available: hasChoreo,
        p50Ms: asNumber(choreographer?.p50Ms) ?? null,
        p95Ms: asNumber(choreographer?.p95Ms) ?? null,
        p99Ms: asNumber(choreographer?.p99Ms) ?? null,
        fps: asNumber(choreographer?.fps) ?? null,
        slowFrameRate: asNumber(choreographer?.slowFrameRate) ?? null,
      },
      playerLoopPercentiles: hasPlayerLoop
        ? {
            available: true,
            count: asNumber(plFrame?.count) ?? null,
            p50Ms: asNumber(plFrame?.p50Ms) ?? null,
            p95Ms: asNumber(plFrame?.p95Ms) ?? null,
            p99Ms: asNumber(plFrame?.p99Ms) ?? null,
            fps: asNumber(plFrame?.fps) ?? null,
            slowFrameRate: asNumber(plFrame?.slowFrameRate) ?? null,
          }
        : {
            available: false,
            reason:
              'provider 未提取 PlayerLoop 分位数 (trace 无 PlayerLoop slice 或 provider 未跑该逻辑)',
          },
    },
    provenance: perfettoProvenance('queryFrameTimeline', args, run),
  };
}

export interface QueryCpuFreqArgs extends PerfettoJsonToolArgs {}

export interface QueryCpuFreqPerCpuRow {
  cpu: number;
  avgMhz: number | null;
  maxMhz: number | null;
  cpuinfoMaxMhz: number | null;
  reachPct: number | null;
  reachVsCpuinfoPct: number | null;
}

export interface QueryCpuFreqClusterStats {
  cpuCount: number;
  avgReachPct: number | null;
  avgMhz: number | null;
}

export interface QueryCpuFreqResult {
  data: {
    available: boolean;
    avgMhz?: number;
    cpuThrottled?: boolean;
    throttlingLevel?: string;
    throttlingSuspected: boolean;
    bigCoreReachPct?: number;
    perCpu: QueryCpuFreqPerCpuRow[];
    clusterSummary: {
      small: QueryCpuFreqClusterStats;
      mid: QueryCpuFreqClusterStats;
      big: QueryCpuFreqClusterStats;
    };
    evidence: string[];
  };
  provenance: Provenance;
}

function summarizeCpuCluster(rows: QueryCpuFreqPerCpuRow[]): QueryCpuFreqClusterStats {
  if (rows.length === 0) return { cpuCount: 0, avgReachPct: null, avgMhz: null };
  const reachVals = rows.map(r => r.reachPct).filter((v): v is number => v != null);
  const mhzVals = rows.map(r => r.avgMhz).filter((v): v is number => v != null);
  const avg = (vals: number[]) =>
    vals.length > 0 ? roundNumber(vals.reduce((a, b) => a + b, 0) / vals.length, 2) ?? null : null;
  return {
    cpuCount: rows.length,
    avgReachPct: avg(reachVals),
    avgMhz: avg(mhzVals),
  };
}

export function queryCpuFreq(
  _db: Database.Database | null | undefined,
  args: QueryCpuFreqArgs
): QueryCpuFreqResult {
  const run = loadPerfettoRun(args);
  const system = asRecord(run.core.system ?? run.summary.system);
  const throttling = asRecord(run.perfetto.throttling ?? run.summary.throttling);
  const perCpuRaw = Array.isArray(throttling.perCpu) ? throttling.perCpu.map(asRecord) : [];
  const perCpu: QueryCpuFreqPerCpuRow[] = perCpuRaw.map(r => ({
    cpu: asNumber(r.cpu) ?? -1,
    avgMhz: asNumber(r.avgMhz) ?? null,
    maxMhz: asNumber(r.maxMhz) ?? null,
    cpuinfoMaxMhz: asNumber(r.cpuinfoMaxMhz) ?? null,
    reachPct: asNumber(r.reachPct) ?? null,
    reachVsCpuinfoPct: asNumber(r.reachVsCpuinfoPct) ?? null,
  })).filter(r => r.cpu >= 0);
  const avgMhz = asNumber(system.cpuFreqAvgMhz);
  const level = typeof throttling.level === 'string' ? throttling.level : undefined;
  const cpuThrottled = typeof system.cpuThrottled === 'boolean' ? system.cpuThrottled : undefined;
  const evidence = Array.isArray(throttling.evidence)
    ? throttling.evidence.filter((v): v is string => typeof v === 'string')
    : [];

  // Generic cluster split by CPU index (0-3 / 4-6 / ≥7) — no SoC name hardcoding.
  const small = perCpu.filter(r => r.cpu <= 3);
  const mid = perCpu.filter(r => r.cpu >= 4 && r.cpu <= 6);
  const big = perCpu.filter(r => r.cpu >= 7);

  return {
    data: {
      available: avgMhz != null || perCpu.length > 0,
      avgMhz,
      cpuThrottled,
      throttlingLevel: level,
      throttlingSuspected: level === 'suspected' || cpuThrottled === true,
      bigCoreReachPct: asNumber(throttling.bigCoreReachPct),
      perCpu,
      clusterSummary: {
        small: summarizeCpuCluster(small),
        mid: summarizeCpuCluster(mid),
        big: summarizeCpuCluster(big),
      },
      evidence,
    },
    provenance: perfettoProvenance('queryCpuFreq', args, run),
  };
}

export interface GetPerfettoCallTreeArgs extends PerfettoJsonToolArgs {
  thread?: string;
  maxDepth?: number;
  topChildren?: number;
  minTotalPct?: number;
}

export interface PerfettoCallTreeQueryResult {
  data:
    | {
        available: false;
        reason: string;
        callTrees: [];
      }
    | {
        available: true;
        callTrees: unknown[];
        hotPath: Array<{ name: string; totalMs?: number; totalPct?: number; selfMs?: number; selfPct?: number }>;
      };
  provenance: Provenance;
}

function prunePerfettoCallTreeNode(
  node: Record<string, unknown>,
  depth: number,
  maxDepth: number,
  topChildren: number,
  minTotalPct: number
): Record<string, unknown> {
  const children = Array.isArray(node.children) ? node.children.map(asRecord) : [];
  const prunedChildren = depth >= maxDepth
    ? []
    : children
        .filter(child => (asNumber(child.totalPct) ?? 0) >= minTotalPct)
        .sort((a, b) => (asNumber(b.totalMs) ?? asNumber(b.totalPct) ?? 0) - (asNumber(a.totalMs) ?? asNumber(a.totalPct) ?? 0))
        .slice(0, topChildren)
        .map(child => prunePerfettoCallTreeNode(child, depth + 1, maxDepth, topChildren, minTotalPct));
  return { ...node, children: prunedChildren };
}

function buildPerfettoHotPath(root: Record<string, unknown>): Array<{ name: string; totalMs?: number; totalPct?: number; selfMs?: number; selfPct?: number }> {
  const pathRows: Array<{ name: string; totalMs?: number; totalPct?: number; selfMs?: number; selfPct?: number }> = [];
  let current: Record<string, unknown> | undefined = root;
  while (current) {
    pathRows.push({
      name: typeof current.name === 'string' ? current.name : '(unknown)',
      totalMs: asNumber(current.totalMs),
      totalPct: asNumber(current.totalPct),
      selfMs: asNumber(current.selfMs),
      selfPct: asNumber(current.selfPct),
    });
    const childNodes: Record<string, unknown>[] = Array.isArray(current.children)
      ? current.children.map(asRecord)
      : [];
    current = childNodes.reduce((best: Record<string, unknown> | undefined, child: Record<string, unknown>) => {
      const childScore = asNumber(child.totalMs) ?? asNumber(child.totalPct) ?? 0;
      const bestScore = best ? asNumber(best.totalMs) ?? asNumber(best.totalPct) ?? 0 : -Infinity;
      return childScore > bestScore ? child : best;
    }, undefined);
  }
  return pathRows;
}

export function getPerfettoCallTree(
  _db: Database.Database | null | undefined,
  args: GetPerfettoCallTreeArgs
): PerfettoCallTreeQueryResult {
  const run = loadPerfettoRun(args);
  const rawTrees = run.perfetto.callTrees ?? run.summary.callTrees;
  const callTrees = Array.isArray(rawTrees) ? rawTrees.map(asRecord) : [];

  if (callTrees.length === 0) {
    return {
      data: {
        available: false,
        reason: 'Perfetto callTrees is empty in the source profile; no synthetic call tree was created.',
        callTrees: [],
      },
      provenance: perfettoProvenance('getPerfettoCallTree', args, run),
    };
  }

  const selected = args.thread
    ? callTrees.filter(t => String(t.thread ?? '').toLowerCase().includes(args.thread!.toLowerCase()))
    : callTrees;

  if (selected.length === 0) {
    return {
      data: {
        available: false,
        reason: `Perfetto callTrees exists but no tree matched thread "${args.thread}"; no synthetic call tree was created.`,
        callTrees: [],
      },
      provenance: perfettoProvenance('getPerfettoCallTree', args, run),
    };
  }

  const maxDepth = Math.min(args.maxDepth ?? 8, 20);
  const topChildren = Math.min(args.topChildren ?? 8, 30);
  const minTotalPct = args.minTotalPct ?? 0;
  const prunedTrees = selected.map(tree => {
    const root = asRecord(tree.root);
    return {
      ...tree,
      root: prunePerfettoCallTreeNode(root, 0, maxDepth, topChildren, minTotalPct),
    };
  });

  return {
    data: {
      available: true,
      callTrees: prunedTrees,
      hotPath: buildPerfettoHotPath(asRecord(asRecord(prunedTrees[0]).root)),
    },
    provenance: perfettoProvenance('getPerfettoCallTree', args, run),
  };
}

export interface CorrelateFrameSchedCpuArgs extends PerfettoJsonToolArgs {
  thread?: string;
}

export interface CorrelateFrameSchedCpuResult {
  data: {
    granularity: 'window';
    frame: unknown;
    sched: Record<string, unknown> | null;
    cpu: {
      avgMhz?: number;
      bigCoreReachPct?: number;
      throttlingLevel?: string;
      throttlingSuspected: boolean;
    };
    signals: string[];
    note: string;
  };
  provenance: Provenance;
}

export function correlateFrameSchedCpu(
  _db: Database.Database | null | undefined,
  args: CorrelateFrameSchedCpuArgs
): CorrelateFrameSchedCpuResult {
  const run = loadPerfettoRun(args);
  const sched = asRecord(run.perfetto.threadsSched ?? run.summary.threadsSched);
  const threadName = args.thread ?? 'UnityMain';
  const schedEntry = asRecord(sched[threadName] ?? Object.entries(sched).find(([name]) => name.toLowerCase().includes(threadName.toLowerCase()))?.[1]);
  const coreFrames = Array.isArray(run.core.frame) ? run.core.frame : [];
  const frame = coreFrames.find(f => asRecord(f).frameDefinition === 'choreographer') ?? run.summary.frame ?? null;
  const system = asRecord(run.core.system ?? run.summary.system);
  const throttling = asRecord(run.perfetto.throttling ?? run.summary.throttling);
  const throttlingLevel = typeof throttling.level === 'string' ? throttling.level : undefined;
  const throttlingSuspected = throttlingLevel === 'suspected' || system.cpuThrottled === true;
  const runningPct = asNumber(schedEntry.runningPct);
  const runnablePct = asNumber(schedEntry.runnablePct);
  const signals: string[] = [];

  if (runningPct != null) signals.push(`${threadName} runningPct=${runningPct}`);
  if (runnablePct != null) signals.push(`${threadName} runnablePct=${runnablePct}`);
  if (asNumber(system.cpuFreqAvgMhz) != null) signals.push(`cpuFreqAvgMhz=${system.cpuFreqAvgMhz}`);
  if (asNumber(throttling.bigCoreReachPct) != null) signals.push(`bigCoreReachPct=${throttling.bigCoreReachPct}`);
  if (throttlingSuspected) signals.push('throttling suspected');

  return {
    data: {
      granularity: 'window',
      frame,
      sched: Object.keys(schedEntry).length > 0 ? { name: threadName, ...schedEntry } : null,
      cpu: {
        avgMhz: asNumber(system.cpuFreqAvgMhz),
        bigCoreReachPct: asNumber(throttling.bigCoreReachPct),
        throttlingLevel,
        throttlingSuspected,
      },
      signals,
      note: 'WT-013 MVP reports window-level correlation only; no per-frame sched/cpu correlation is claimed.',
    },
    provenance: perfettoProvenance('correlateFrameSchedCpu', args, run),
  };
}

// ─────────────────────────── WT-019: Perfetto query content expansion ─

export interface QueryCallTreeSubtreeArgs extends PerfettoJsonToolArgs {
  pattern?: string;
  minTotalPct?: number;
  topN?: number;
  businessOnly?: boolean;
  includeSubtree?: boolean;
}

export interface QueryCallTreeSubtreeRow {
  name: string;
  totalMs: number | null;
  totalPct: number | null;
  count: number | null;
  avgMs: number | null;
  layer: string | null;
  depth: number;
  parentChain: string;
  subtreeTotalMs?: number | null;
  subtreeTotalPct?: number | null;
}

export interface QueryCallTreeSubtreeResult {
  data: {
    available: boolean;
    totalNodes: number;
    rows: QueryCallTreeSubtreeRow[];
  };
  provenance: Provenance;
}

interface FlatCallTreeNode {
  name: string;
  totalMs: number | null;
  totalPct: number | null;
  count: number | null;
  avgMs: number | null;
  layer: string | null;
  depth: number;
  parentChain: string;
  subtreeTotalMs: number | null;
  subtreeTotalPct: number | null;
}

function flattenCallTreeNodes(
  node: Record<string, unknown>,
  depth: number,
  ancestors: string[]
): FlatCallTreeNode[] {
  const name = typeof node.name === 'string' ? node.name : '(unknown)';
  const totalMs = asNumber(node.totalMs) ?? null;
  const totalPct = asNumber(node.totalPct) ?? null;
  const count = asNumber(node.count) ?? null;
  const avgMs =
    asNumber(node.avgMs) ??
    (totalMs != null && count != null && count > 0 ? roundNumber(totalMs / count, 3) ?? null : null);
  const layer = typeof node.layer === 'string' ? node.layer : null;
  const chain = [...ancestors, name];
  const self: FlatCallTreeNode = {
    name,
    totalMs,
    totalPct,
    count,
    avgMs,
    layer,
    depth,
    parentChain: chain.join(' > '),
    // totalMs is inclusive of children in provider callTrees
    subtreeTotalMs: totalMs,
    subtreeTotalPct: totalPct,
  };
  const children = Array.isArray(node.children) ? node.children.map(asRecord) : [];
  const childRows = children.flatMap(child => flattenCallTreeNodes(child, depth + 1, chain));
  return [self, ...childRows];
}

function collectCallTreeFlatNodes(run: LoadedPerfettoRun): FlatCallTreeNode[] {
  const rawTrees = run.perfetto.callTrees ?? run.summary.callTrees;
  const callTrees = Array.isArray(rawTrees) ? rawTrees.map(asRecord) : [];
  const out: FlatCallTreeNode[] = [];
  for (const tree of callTrees) {
    const root = asRecord(tree.root);
    if (Object.keys(root).length === 0) continue;
    out.push(...flattenCallTreeNodes(root, 0, []));
  }
  return out;
}

export function queryCallTreeSubtree(
  _db: Database.Database | null | undefined,
  args: QueryCallTreeSubtreeArgs
): QueryCallTreeSubtreeResult {
  const run = loadPerfettoRun(args);
  const minTotalPct = args.minTotalPct ?? 1.0;
  const topN = Math.min(args.topN ?? 20, 200);
  const includeSubtree = args.includeSubtree !== false;
  const pattern = args.pattern?.toLowerCase();
  const businessOnly = args.businessOnly === true;

  let rows = collectCallTreeFlatNodes(run);
  if (pattern) rows = rows.filter(r => r.name.toLowerCase().includes(pattern));
  if (businessOnly) rows = rows.filter(r => r.layer === 'business');
  rows = rows.filter(r => (r.totalPct ?? 0) >= minTotalPct);
  rows.sort((a, b) => (b.totalMs ?? 0) - (a.totalMs ?? 0));
  const totalNodes = rows.length;
  const trimmed = rows.slice(0, topN).map(r => {
    const out: QueryCallTreeSubtreeRow = {
      name: r.name,
      totalMs: r.totalMs,
      totalPct: r.totalPct,
      count: r.count,
      avgMs: r.avgMs,
      layer: r.layer,
      depth: r.depth,
      parentChain: r.parentChain,
    };
    if (includeSubtree) {
      out.subtreeTotalMs = r.subtreeTotalMs;
      out.subtreeTotalPct = r.subtreeTotalPct;
    }
    return out;
  });

  return {
    data: {
      available: trimmed.length > 0,
      totalNodes,
      rows: trimmed,
    },
    provenance: perfettoProvenance('queryCallTreeSubtree', args, run),
  };
}

export interface QuerySliceDeltasArgs {
  baseRole: PerfettoSampleRole;
  compareRole: PerfettoSampleRole;
  tool: 'callTreeSubtree' | 'atraceSlices' | 'schedState';
  minFoldChange?: number;
  minTotalPct?: number;
  topN?: number;
  runDir?: string;
  runId?: string;
}

export interface QuerySliceDeltasRow {
  name: string;
  baseTotalMs: number | null;
  compareTotalMs: number | null;
  foldChange: number | null;
  baseTotalPct: number | null;
  compareTotalPct: number | null;
  baseCount: number | null;
  compareCount: number | null;
  avgMsChange: number | null;
  evidenceBaseId: string;
  evidenceCompareId: string;
}

export interface QuerySliceDeltasResult {
  data: {
    available: boolean;
    rows: QuerySliceDeltasRow[];
  };
  provenance: Provenance;
}

interface SliceDeltaMetric {
  name: string;
  totalMs: number | null;
  totalPct: number | null;
  count: number | null;
  avgMs: number | null;
}

function metricsFromCallTreeSubtree(role: PerfettoSampleRole, minTotalPct: number): SliceDeltaMetric[] {
  const result = queryCallTreeSubtree(null, { role, minTotalPct: 0, topN: 200 });
  return result.data.rows
    .filter(r => (r.totalPct ?? 0) >= minTotalPct || minTotalPct <= 0)
    .map(r => ({
      name: r.name,
      totalMs: r.totalMs,
      totalPct: r.totalPct,
      count: r.count,
      avgMs: r.avgMs,
    }));
}

function metricsFromAtraceSlices(role: PerfettoSampleRole, minTotalPct: number): SliceDeltaMetric[] {
  const result = queryAtraceSlices(null, { role, topN: 50, sortBy: 'totalMs' });
  return result.data.rows
    .filter(r => (r.totalPctOfWindow ?? 0) >= minTotalPct || minTotalPct <= 0)
    .map(r => ({
      name: r.name,
      totalMs: r.totalMs ?? null,
      totalPct: r.totalPctOfWindow ?? null,
      count: r.count ?? null,
      avgMs: r.avgMs ?? null,
    }));
}

function metricsFromSchedState(role: PerfettoSampleRole, _minTotalPct: number): SliceDeltaMetric[] {
  const result = querySchedState(null, { role, topN: 50 });
  return result.data.threads.map(t => {
    const totalNs = t.totalNs;
    return {
      name: t.name,
      // Prefer absolute time; fall back to runningPct as comparable magnitude.
      totalMs: totalNs != null ? roundNumber(totalNs / 1e6, 3) ?? null : t.runningPct ?? null,
      totalPct: t.runningPct ?? null,
      count: t.count ?? null,
      avgMs: null,
    };
  });
}

function loadSliceDeltaMetrics(
  tool: QuerySliceDeltasArgs['tool'],
  role: PerfettoSampleRole,
  minTotalPct: number
): SliceDeltaMetric[] {
  if (tool === 'callTreeSubtree') return metricsFromCallTreeSubtree(role, minTotalPct);
  if (tool === 'atraceSlices') return metricsFromAtraceSlices(role, minTotalPct);
  return metricsFromSchedState(role, minTotalPct);
}

export function querySliceDeltas(
  _db: Database.Database | null | undefined,
  args: QuerySliceDeltasArgs
): QuerySliceDeltasResult {
  const minFoldChange = args.minFoldChange ?? 1.5;
  const minTotalPct = args.minTotalPct ?? 1.0;
  const topN = Math.min(args.topN ?? 20, 100);
  const baseRole = normalizePerfettoRole(args.baseRole);
  const compareRole = normalizePerfettoRole(args.compareRole);

  const baseMetrics = loadSliceDeltaMetrics(args.tool, baseRole, 0);
  const compareMetrics = loadSliceDeltaMetrics(args.tool, compareRole, 0);
  const baseByName = new Map(baseMetrics.map(m => [m.name, m]));
  const compareByName = new Map(compareMetrics.map(m => [m.name, m]));
  const names = new Set([...baseByName.keys(), ...compareByName.keys()]);

  const rows: QuerySliceDeltasRow[] = [];
  for (const name of names) {
    const base = baseByName.get(name);
    const compare = compareByName.get(name);
    const baseTotalMs = base?.totalMs ?? null;
    const compareTotalMs = compare?.totalMs ?? null;
    const baseTotalPct = base?.totalPct ?? null;
    const compareTotalPct = compare?.totalPct ?? null;
    // Keep rows that matter in either side by totalPct threshold.
    const pctOk =
      (baseTotalPct ?? 0) >= minTotalPct || (compareTotalPct ?? 0) >= minTotalPct;
    if (!pctOk) continue;

    let foldChange: number | null = null;
    if (baseTotalMs != null && baseTotalMs > 0 && compareTotalMs != null) {
      foldChange = roundNumber(compareTotalMs / baseTotalMs, 3) ?? null;
    } else if ((baseTotalMs == null || baseTotalMs === 0) && compareTotalMs != null && compareTotalMs > 0) {
      // Appeared in compare only — high sentinel (JSON-safe; Infinity becomes null).
      foldChange = 9999;
    } else if (baseTotalPct != null && baseTotalPct > 0 && compareTotalPct != null) {
      foldChange = roundNumber(compareTotalPct / baseTotalPct, 3) ?? null;
    }

    if (foldChange == null || foldChange < minFoldChange) continue;

    const baseAvg = base?.avgMs ?? null;
    const compareAvg = compare?.avgMs ?? null;
    rows.push({
      name,
      baseTotalMs,
      compareTotalMs,
      foldChange,
      baseTotalPct,
      compareTotalPct,
      baseCount: base?.count ?? null,
      compareCount: compare?.count ?? null,
      avgMsChange:
        baseAvg != null && compareAvg != null ? roundNumber(compareAvg - baseAvg, 3) ?? null : null,
      evidenceBaseId: `bk26b-perfetto-${baseRole}:${name}`,
      evidenceCompareId: `bk26b-perfetto-${compareRole}:${name}`,
    });
  }

  rows.sort((a, b) => (b.foldChange ?? 0) - (a.foldChange ?? 0));
  const trimmed = rows.slice(0, topN);
  const provenanceRun = loadPerfettoRun({ role: compareRole, runId: args.runId, runDir: args.runDir });

  return {
    data: {
      available: trimmed.length > 0,
      rows: trimmed,
    },
    provenance: {
      runId: args.runId ?? `bk26b-perfetto-delta-${baseRole}-vs-${compareRole}`,
      tool: 'querySliceDeltas',
      args: args as unknown as Record<string, unknown>,
      source: 'perfetto',
      role: provenanceRun.role,
    },
  };
}

export interface QueryOffCpuAttributionArgs extends PerfettoJsonToolArgs {
  thread?: string;
}

export interface QueryOffCpuAttributionResult {
  data: {
    available: boolean;
    thread: string;
    runningPct: number | null;
    sleepingPct: number | null;
    runnablePct: number | null;
    totalOffCpuMs: number | null;
    byState: Array<{
      state: string;
      totalMs: number | null;
      count: number | null;
      pctOfOffCpu: number | null;
    }>;
    waitSlices: Array<{
      name: string;
      totalMs: number | null;
      totalPct: number | null;
      count: number | null;
      avgMs: number | null;
      parentChain: string;
    }>;
    sleepingMs: number | null;
    waitSliceTotalMs: number | null;
    coveragePct: number | null;
    note: string;
  };
  provenance: Provenance;
}

function isWaitSliceName(name: string): boolean {
  // Generic name-axis patterns only — no hard-coded module list.
  return /Wait|Sleep|Block|Present/i.test(name);
}

export function queryOffCpuAttribution(
  _db: Database.Database | null | undefined,
  args: QueryOffCpuAttributionArgs
): QueryOffCpuAttributionResult {
  const run = loadPerfettoRun(args);
  const thread = args.thread ?? 'UnityMain';
  const sched = asRecord(run.perfetto.threadsSched ?? run.summary.threadsSched);
  const schedEntry = asRecord(
    sched[thread] ??
      Object.entries(sched).find(([name]) => name.toLowerCase().includes(thread.toLowerCase()))?.[1]
  );
  // Prefer expanded offCpuAttribution; fall back to offCpuReasons (same object after WT-022)
  const offCpu = asRecord(
    run.perfetto.offCpuAttribution ??
      run.summary.offCpuAttribution ??
      run.perfetto.offCpuReasons ??
      run.summary.offCpuReasons
  );
  const window = getPerfettoProfileWindow(run);
  const durMs = asNumber(window?.durMs);

  const sleepingPct =
    asNumber(offCpu.sleepingPct) ?? asNumber(schedEntry.sleepingPct) ?? null;
  const runnablePct =
    asNumber(offCpu.runnablePct) ?? asNumber(schedEntry.runnablePct) ?? null;
  const runningPct =
    asNumber(schedEntry.runningPct) ??
    (sleepingPct != null
      ? roundNumber(100 - sleepingPct - (runnablePct ?? 0), 2) ?? null
      : null);
  const totalOffCpuMs = asNumber(offCpu.totalOffCpuMs) ?? null;
  const rawByState = Array.isArray(offCpu.byState) ? offCpu.byState : [];
  const byState = rawByState.map(row => {
    const r = asRecord(row);
    return {
      state: typeof r.state === 'string' ? r.state : String(r.state ?? 'Unknown'),
      totalMs: asNumber(r.totalMs) ?? null,
      count: asNumber(r.count) ?? null,
      pctOfOffCpu: asNumber(r.pctOfOffCpu) ?? null,
    };
  });
  const note =
    (typeof offCpu.note === 'string' && offCpu.note) ||
    'offCpuReasons / wait-slice coverage derived from summary + callTree; no synthetic blocked-reason rows.';

  const flat = collectCallTreeFlatNodes(run);
  const waitSlices = flat
    .filter(n => isWaitSliceName(n.name))
    .sort((a, b) => (b.totalMs ?? 0) - (a.totalMs ?? 0))
    .map(n => ({
      name: n.name,
      totalMs: n.totalMs,
      totalPct: n.totalPct,
      count: n.count,
      avgMs: n.avgMs,
      parentChain: n.parentChain,
    }));

  const waitSliceTotalMs =
    waitSlices.length > 0
      ? roundNumber(
          waitSlices.reduce((sum, s) => sum + (s.totalMs ?? 0), 0),
          3
        ) ?? null
      : null;
  const sleepingMs =
    totalOffCpuMs != null && sleepingPct != null
      ? roundNumber((totalOffCpuMs * sleepingPct) / 100, 1) ?? null
      : durMs != null && sleepingPct != null
        ? roundNumber((durMs * sleepingPct) / 100, 3) ?? null
        : null;
  const coveragePct =
    sleepingMs != null && sleepingMs > 0 && waitSliceTotalMs != null
      ? roundNumber((waitSliceTotalMs / sleepingMs) * 100, 2) ?? null
      : null;

  return {
    data: {
      available: byState.length > 0 || sleepingPct != null || waitSlices.length > 0,
      thread,
      runningPct,
      sleepingPct,
      runnablePct,
      totalOffCpuMs,
      byState,
      waitSlices,
      sleepingMs,
      waitSliceTotalMs,
      coveragePct,
      note,
    },
    provenance: perfettoProvenance('queryOffCpuAttribution', args, run),
  };
}

// ─────────────────────────── WT-022: GC.Alloc by module ───────────

export interface QueryGcAllocByModuleArgs extends PerfettoJsonToolArgs {
  /** Filter by perFrame threshold (default 0.1) */
  minPerFrame?: number;
  /** Filter by count threshold (default 1) */
  minCount?: number;
  /** Generic substring match — not a hard-coded module list */
  pattern?: string;
  /** Top-N by perFrame desc (default 20) */
  topN?: number;
  /** Include parentChain (default true) */
  includeParentChain?: boolean;
}

export interface QueryGcAllocByModuleRow {
  name: string;
  count: number | null;
  totalMs: number | null;
  perFrame: number | null;
  depth: number | null;
  parentChain?: string[];
}

export interface QueryGcAllocByModuleResult {
  data: {
    available: boolean;
    playerLoopFrameCount: number | null;
    totalGcAllocSlices: number | null;
    rows: QueryGcAllocByModuleRow[];
  };
  provenance: Provenance;
}

export function queryGcAllocByModule(
  _db: Database.Database | null | undefined,
  args: QueryGcAllocByModuleArgs
): QueryGcAllocByModuleResult {
  const run = loadPerfettoRun(args);
  const minPerFrame = args.minPerFrame ?? 0.1;
  const minCount = args.minCount ?? 1;
  const topN = Math.min(args.topN ?? 20, 200);
  const includeParentChain = args.includeParentChain !== false;
  const pattern = args.pattern?.toLowerCase();

  const fromSummary = asRecord(run.summary.gcAllocByChain);
  const fromDetail = asRecord(run.perfetto.gcAllocByChain);
  const summaryChain = Array.isArray(fromSummary.byChain) ? fromSummary.byChain : [];
  const src = summaryChain.length > 0 ? fromSummary : fromDetail;
  const rawRows = Array.isArray(src.byChain) ? src.byChain : [];

  let rows: QueryGcAllocByModuleRow[] = rawRows.map(row => {
    const r = asRecord(row);
    const parentChain = Array.isArray(r.parentChain)
      ? r.parentChain.filter((x): x is string => typeof x === 'string')
      : typeof r.parentChain === 'string'
        ? r.parentChain.split(/\s*>\s*/).filter(Boolean)
        : undefined;
    const out: QueryGcAllocByModuleRow = {
      name: typeof r.name === 'string' ? r.name : String(r.name ?? ''),
      count: asNumber(r.count) ?? null,
      totalMs: asNumber(r.totalMs) ?? null,
      perFrame: asNumber(r.perFrame) ?? null,
      depth: asNumber(r.depth) ?? null,
    };
    if (includeParentChain && parentChain) out.parentChain = parentChain;
    return out;
  });

  if (pattern) rows = rows.filter(r => r.name.toLowerCase().includes(pattern));
  // AND thresholds: default minPerFrame=0.1 && minCount=1
  rows = rows.filter(
    r => (r.perFrame ?? 0) >= minPerFrame && (r.count ?? 0) >= minCount
  );
  // Prefer perFrame desc; fall back to count
  rows.sort((a, b) => {
    const pa = a.perFrame ?? -1;
    const pb = b.perFrame ?? -1;
    if (pb !== pa) return pb - pa;
    return (b.count ?? 0) - (a.count ?? 0);
  });
  rows = rows.slice(0, topN);

  const available =
    (src.available === true || rawRows.length > 0) && rows.length > 0;

  return {
    data: {
      available,
      playerLoopFrameCount: asNumber(src.playerLoopFrameCount) ?? null,
      totalGcAllocSlices: asNumber(src.totalGcAllocSlices) ?? null,
      rows,
    },
    provenance: perfettoProvenance('queryGcAllocByModule', args, run),
  };
}
