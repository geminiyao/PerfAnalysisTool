/**
 * maple-analyzer.ts
 *
 * Maple ILOpt 同步采样数据自动解析服务。
 * 调用链：maple_sample.py 上传文件 → POST /api/maple/runs → analyzeRun()
 *
 * 解析内容：
 *   1. Unity Profiler .pdata  — parsePdataFiles()  （本地 TS 实现）
 *   2. perfetto .pftrace      — analyzePerfetto()   （调 Python perfetto 库）
 *   3. simpleperf report JSON — simpleperfJson 由 maple_compare.py 生成，直接读入
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getDb } from '../db/index.js';
import {
  mapleRuns, maplePdataResults, maplePerfettoResults,
} from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { parsePdataFile } from '../../main/profiler/pdata-parser.js';
import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// pdata 解析
// ---------------------------------------------------------------------------

const SCRIPTING_MARKERS = [
  'BehaviourUpdate', 'FixedBehaviourUpdate', 'Coroutines',
  'PreLateUpdate.ScriptRunBehaviourLateUpdate',
  'Update.ScriptRunBehaviourUpdate',
];
const WAIT_FPS_MARKERS = ['WaitForTargetFPS'];
const GC_ALLOC_MARKER = 'GC.Alloc';
const RENDERING_MARKERS = ['Camera.Render', 'Render.Mesh', 'DrawMesh'];
const PHYSICS_MARKERS = ['Physics.Simulate', 'Physics2D.Simulate', 'PhysicsManager.FixedUpdate'];

function extractMarkerMsPerFrame(
  data: ReturnType<typeof parsePdataFile>,
  markerSubstrings: string[],
): number {
  let totalMs = 0;
  let frameCount = 0;
  for (const frame of data.frames) {
    if (!frame) continue;
    frameCount++;
    for (const thread of frame.threads) {
      for (const marker of thread.markers) {
        const name = data.markerNames[marker.nameIndex] ?? '';
        if (markerSubstrings.some(s => name.includes(s))) {
          totalMs += marker.msMarkerTotal;
        }
      }
    }
  }
  return frameCount > 0 ? totalMs / frameCount : 0;
}

function extractGcAllocPerFrame(data: ReturnType<typeof parsePdataFile>) {
  let totalCount = 0;
  let totalBytes = 0;
  let frameCount = 0;
  for (const frame of data.frames) {
    if (!frame) continue;
    frameCount++;
    for (const thread of frame.threads) {
      for (const marker of thread.markers) {
        const name = data.markerNames[marker.nameIndex] ?? '';
        if (name === GC_ALLOC_MARKER) {
          totalCount++;
          // msMarkerTotal for GC.Alloc is actually bytes in some Unity versions,
          // but it's generally unusable as bytes; count is more reliable
        }
      }
    }
  }
  return { countPerFrame: frameCount > 0 ? totalCount / frameCount : 0 };
}

function computeFrameDist(frameMsList: number[]) {
  if (frameMsList.length === 0) return { p50: 0, p95: 0, p99: 0, avg: 0, max: 0 };
  const sorted = [...frameMsList].sort((a, b) => a - b);
  const n = sorted.length;
  const p = (pct: number) => sorted[Math.floor(n * pct / 100)] ?? sorted[n - 1];
  const avg = sorted.reduce((a, b) => a + b, 0) / n;
  return { p50: p(50), p95: p(95), p99: p(99), avg, max: sorted[n - 1] };
}

function buildFrameDistHistogram(frameMsList: number[]) {
  // 分桶：0-8, 8-16, 16-33, 33-50, 50-100, 100+
  const buckets = [0, 8, 16, 33, 50, 100, Infinity];
  const labels = ['0-8ms', '8-16ms', '16-33ms', '33-50ms', '50-100ms', '100ms+'];
  const counts = new Array(labels.length).fill(0);
  for (const ms of frameMsList) {
    for (let i = 0; i < buckets.length - 1; i++) {
      if (ms >= buckets[i] && ms < buckets[i + 1]) {
        counts[i]++;
        break;
      }
    }
  }
  return labels.map((l, i) => ({ label: l, count: counts[i] }));
}

export async function parsePdataFiles(runId: string, pdataPaths: string[]): Promise<void> {
  const db = getDb();

  // 聚合所有 .pdata 的帧数据
  const allFrameMs: number[] = [];
  let totalScriptingMs = 0;
  let totalWaitFpsMs = 0;
  let totalRenderingMs = 0;
  let totalPhysicsMs = 0;
  let totalGcAllocCount = 0;
  let totalFrames = 0;
  const topMarkersAgg: Record<string, number> = {};

  for (const pdataPath of pdataPaths) {
    if (!fs.existsSync(pdataPath)) {
      console.warn(`[maple-analyzer] pdata not found: ${pdataPath}`);
      continue;
    }
    try {
      const data = parsePdataFile(pdataPath);
      for (const frame of data.frames) {
        if (!frame) continue;
        totalFrames++;
        allFrameMs.push(frame.msFrame);

        for (const thread of frame.threads) {
          for (const marker of thread.markers) {
            const name = data.markerNames[marker.nameIndex] ?? '';
            if (SCRIPTING_MARKERS.some(s => name.includes(s))) totalScriptingMs += marker.msMarkerTotal;
            if (WAIT_FPS_MARKERS.some(s => name.includes(s))) totalWaitFpsMs += marker.msMarkerTotal;
            if (RENDERING_MARKERS.some(s => name.includes(s))) totalRenderingMs += marker.msMarkerTotal;
            if (PHYSICS_MARKERS.some(s => name.includes(s))) totalPhysicsMs += marker.msMarkerTotal;
            if (name === GC_ALLOC_MARKER) totalGcAllocCount++;
            // top markers
            if (marker.depth <= 1) {
              topMarkersAgg[name] = (topMarkersAgg[name] ?? 0) + marker.msMarkerTotal;
            }
          }
        }
      }
    } catch (e) {
      console.error(`[maple-analyzer] pdata parse error: ${pdataPath}`, e);
    }
  }

  if (totalFrames === 0) {
    console.warn(`[maple-analyzer] No frames found in pdata files for run ${runId}`);
    return;
  }

  const dist = computeFrameDist(allFrameMs);
  const slow33 = allFrameMs.filter(ms => ms > 33).length;
  const slow50 = allFrameMs.filter(ms => ms > 50).length;

  const topMarkers = Object.entries(topMarkersAgg)
    .map(([name, totalMs]) => ({ name, avgMsPerFrame: totalMs / totalFrames }))
    .sort((a, b) => b.avgMsPerFrame - a.avgMsPerFrame)
    .slice(0, 20);

  await db.insert(maplePdataResults).values({
    id: randomUUID(),
    runId,
    totalFrames,
    avgFrameMs: dist.avg,
    p50FrameMs: dist.p50,
    p95FrameMs: dist.p95,
    p99FrameMs: dist.p99,
    maxFrameMs: dist.max,
    scriptingMs: totalFrames > 0 ? totalScriptingMs / totalFrames : 0,
    waitForTargetFpsMs: totalFrames > 0 ? totalWaitFpsMs / totalFrames : 0,
    renderingMs: totalFrames > 0 ? totalRenderingMs / totalFrames : 0,
    physicsMs: totalFrames > 0 ? totalPhysicsMs / totalFrames : 0,
    gcAllocCount: totalFrames > 0 ? totalGcAllocCount / totalFrames : 0,
    gcAllocBytes: 0,
    slowFrames33Count: slow33,
    slowFrames50Count: slow50,
    slowFrames33Rate: slow33 / totalFrames,
    frameDistJson: JSON.stringify(buildFrameDistHistogram(allFrameMs)),
    topMarkersJson: JSON.stringify(topMarkers),
    createdAt: Date.now(),
  });

  console.log(`[maple-analyzer] pdata parsed: ${totalFrames} frames, p95=${dist.p95.toFixed(1)}ms`);
}

// ---------------------------------------------------------------------------
// perfetto 解析（调 Python 脚本）
// ---------------------------------------------------------------------------

const PERFETTO_ANALYZER_PY = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '../../scripts/perfetto_analyzer.py',
).replace(/^\/([A-Z]:)/, '$1'); // Windows 路径修正

async function runPython(scriptPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const py = spawn('python', [scriptPath, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    py.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    py.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    py.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`perfetto_analyzer.py failed (exit ${code}): ${stderr.slice(0, 500)}`));
    });
  });
}

export async function analyzePerfetto(runId: string, ptracePath: string, profileName: string): Promise<void> {
  const db = getDb();

  if (!fs.existsSync(ptracePath)) {
    console.warn(`[maple-analyzer] pftrace not found: ${ptracePath}`);
    await db.insert(maplePerfettoResults).values({
      id: randomUUID(), runId,
      parseStatus: 'failed',
      parseNotes: `trace file not found: ${ptracePath}`,
      createdAt: Date.now(),
    });
    return;
  }

  try {
    const jsonStr = await runPython(PERFETTO_ANALYZER_PY, [ptracePath, '--profile-name', profileName]);
    const result = JSON.parse(jsonStr) as {
      profile_window_start_ns?: string;
      profile_window_end_ns?: string;
      profile_window_dur_ms?: number;
      main_thread_running_pct?: number;
      main_thread_runnable_pct?: number;
      main_thread_sleeping_pct?: number;
      cpu_freq_avg_mhz?: number;
      gpu_freq_avg_mhz?: number;
      gpu_utilization_pct?: number;
      frame_p50_ms?: number;
      frame_p95_ms?: number;
      frame_p99_ms?: number;
      frame_avg_ms?: number;
      binder_call_count?: number;
      binder_avg_dur_ms?: number;
      pss_mb?: number;
      parse_status?: string;
      parse_notes?: string;
    };

    await db.insert(maplePerfettoResults).values({
      id: randomUUID(),
      runId,
      profileWindowStartNs: result.profile_window_start_ns ?? null,
      profileWindowEndNs: result.profile_window_end_ns ?? null,
      profileWindowDurMs: result.profile_window_dur_ms ?? null,
      mainThreadRunningPct: result.main_thread_running_pct ?? null,
      mainThreadRunnablePct: result.main_thread_runnable_pct ?? null,
      mainThreadSleepingPct: result.main_thread_sleeping_pct ?? null,
      cpuFreqAvgMhz: result.cpu_freq_avg_mhz ?? null,
      gpuFreqAvgMhz: result.gpu_freq_avg_mhz ?? null,
      gpuUtilizationPct: result.gpu_utilization_pct ?? null,
      frameP50Ms: result.frame_p50_ms ?? null,
      frameP95Ms: result.frame_p95_ms ?? null,
      frameP99Ms: result.frame_p99_ms ?? null,
      frameAvgMs: result.frame_avg_ms ?? null,
      binderCallCount: result.binder_call_count ?? null,
      binderAvgDurMs: result.binder_avg_dur_ms ?? null,
      pssMb: result.pss_mb ?? null,
      parseStatus: result.parse_status ?? 'ok',
      parseNotes: result.parse_notes ?? null,
      createdAt: Date.now(),
    });

    console.log(`[maple-analyzer] perfetto parsed: running=${result.main_thread_running_pct?.toFixed(1)}% p95=${result.frame_p95_ms?.toFixed(1)}ms`);
  } catch (e: any) {
    console.error('[maple-analyzer] perfetto analysis failed:', e.message);
    await db.insert(maplePerfettoResults).values({
      id: randomUUID(), runId,
      parseStatus: 'failed',
      parseNotes: e.message?.slice(0, 500) ?? 'unknown error',
      createdAt: Date.now(),
    });
  }
}

// ---------------------------------------------------------------------------
// 主入口：分析一个 run
// ---------------------------------------------------------------------------
export async function analyzeRun(runId: string): Promise<void> {
  const db = getDb();
  const run = await db.select().from(mapleRuns).where(eq(mapleRuns.id, runId)).get();
  if (!run) throw new Error(`maple run not found: ${runId}`);

  await db.update(mapleRuns).set({ status: 'analyzing' }).where(eq(mapleRuns.id, runId));

  try {
    const pdataPaths: string[] = run.pdataPaths ? JSON.parse(run.pdataPaths) : [];
    const profileName = run.id; // run_label 即 profile name 前缀

    // 并行解析 pdata + perfetto
    await Promise.all([
      pdataPaths.length > 0
        ? parsePdataFiles(runId, pdataPaths)
        : Promise.resolve(),
      run.ptracePath
        ? analyzePerfetto(runId, run.ptracePath, profileName)
        : Promise.resolve(),
    ]);

    await db.update(mapleRuns).set({
      status: 'completed',
      completedAt: Date.now(),
    }).where(eq(mapleRuns.id, runId));

    console.log(`[maple-analyzer] run ${runId} analysis complete`);
  } catch (e: any) {
    await db.update(mapleRuns).set({
      status: 'failed',
      error: e.message?.slice(0, 500),
    }).where(eq(mapleRuns.id, runId));
    throw e;
  }
}
