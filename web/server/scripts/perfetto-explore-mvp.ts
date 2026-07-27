/**
 * WT-017 / WT-020 · Perfetto explore + evidence ledger MVP
 *
 * Deterministic scripted loop over Perfetto JSON query tools.
 * No LLM. WT-020 upgrades finding derivation to data-driven relative-baseline
 * + cross-state discovery + causal inference (no hardcoded business targets).
 *
 * Usage (from web/):
 *   node --import tsx server/scripts/perfetto-explore-mvp.ts
 *
 * Outputs → web/data/prism-out/bk26b-perfetto-explore-mvp/
 *   ledger.json | findings.json | verdict.json | run.log
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  querySchedState,
  queryAtraceSlices,
  queryFrameTimeline,
  queryCpuFreq,
  getPerfettoCallTree,
  correlateFrameSchedCpu,
  queryCallTreeSubtree,
  querySliceDeltas,
  queryGcAllocByModule,
  queryOffCpuAttribution,
} from '../prism/tools.js';

type Role = 'base' | 'cur' | 'throttle';

interface PerfettoEvidenceItem {
  id: string;
  tool: string;
  role: Role | 'delta';
  args: Record<string, unknown>;
  provenance: Record<string, unknown>;
  summary: string;
  dataRefs?: string[];
  facts: Record<string, unknown>;
}

interface RelativeBaseline {
  baselineRole: 'base' | 'cur';
  compareRole: 'cur' | 'throttle';
  absoluteValue: string;
  baselineValue: string;
  foldChange: number | null;
  deltaPct: number | null;
  relativeJudgment: string;
}

interface CausalChain {
  premise: string;
  inference: string;
  conclusion: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface Finding {
  id: string;
  title: string;
  severity: 'info' | 'warning' | 'critical';
  evidenceIds: string[];
  claim: string;
  boundary: string;
  relativeBaseline?: RelativeBaseline;
  causalChain?: CausalChain;
  kind?:
    | 'top-business-module'
    | 'fold-change-module'
    | 'gc-pressure-module'
    | 'thermal-only-path'
    | 'offcpu-bystate'
    | 'gpu-bound-causal'
    | 'playerloop-percentiles'
    | 'freq-morphology'
    | 'boundary'
    | 'sched-relative';
}

export interface Verdict {
  source: 'perfetto';
  sampleSet: 'bk26b-perfetto-triad';
  summary: string;
  conclusions: string[];
  boundaries: string[];
  findingIds: string[];
  triadTrend?: string;
  topBusinessHotspot?: string;
  gpuBoundJudgment?: string;
  freqMorphologyJudgment?: string;
}

const ROLES: Role[] = ['base', 'cur', 'throttle'];
const SAMPLE_SET = 'bk26b-perfetto-triad';

/** Relative-discipline thresholds (not absolute metric cutoffs). */
const FOLD_RISE = 2;
const FOLD_DROP = 0.7;
const COVERAGE_STRONG = 80;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
export const EXPLORE_OUT_DIR = path.join(WEB_ROOT, 'data/prism-out/bk26b-perfetto-explore-mvp');

const logLines: string[] = [];

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logLines.push(line);
  console.log(msg);
}

function asNum(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function asRec(v: unknown): Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function round(n: number, digits = 3): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function findThread(
  threads: Array<{ name: string; runningPct?: number; runnablePct?: number; sleepingPct?: number }>,
  needle: string
) {
  const lower = needle.toLowerCase();
  return threads.find(t => t.name.toLowerCase() === lower) ?? threads.find(t => t.name.toLowerCase().includes(lower));
}

function relativeBaselineOf(
  baselineRole: 'base' | 'cur',
  compareRole: 'cur' | 'throttle',
  metricLabel: string,
  abs: number,
  base: number,
  unit: 'pct' | 'ms' | 'mhz' | 'raw' = 'raw'
): RelativeBaseline {
  const foldChange = base !== 0 ? round(abs / base, 3) : null;
  const deltaPct = unit === 'pct' ? round(abs - base, 2) : null;
  const pctChange = foldChange != null ? round((foldChange - 1) * 100, 1) : null;
  let relativeJudgment: string;
  if (foldChange == null) {
    relativeJudgment = `${compareRole} ${metricLabel}=${abs} (no baseline)`;
  } else if (foldChange >= 1) {
    relativeJudgment =
      `${compareRole} 比 ${baselineRole} 涨 ${pctChange}%` +
      (deltaPct != null ? ` / +${deltaPct}pp` : ` (×${foldChange})`);
  } else {
    relativeJudgment =
      `${compareRole} 比 ${baselineRole} 降 ${Math.abs(pctChange!)}%` +
      (deltaPct != null ? ` / ${deltaPct}pp` : ` (×${foldChange})`);
  }
  return {
    baselineRole,
    compareRole,
    absoluteValue: `${compareRole} ${metricLabel}=${abs}`,
    baselineValue: `${baselineRole} ${metricLabel}=${base}`,
    foldChange,
    deltaPct,
    relativeJudgment,
  };
}

function summarizeSched(role: Role, data: ReturnType<typeof querySchedState>['data']): { summary: string; facts: Record<string, unknown> } {
  const um = findThread(data.threads, 'UnityMain');
  const facts: Record<string, unknown> = {
    available: data.available,
    totalThreads: data.totalThreads,
    unityMain: um
      ? { name: um.name, runningPct: um.runningPct, runnablePct: um.runnablePct, sleepingPct: um.sleepingPct }
      : null,
  };
  if (!um) {
    return { summary: `${role} sched available=${data.available} threads=${data.totalThreads} (no UnityMain)`, facts };
  }
  return {
    summary: `${role} UnityMain runningPct=${um.runningPct} runnablePct=${um.runnablePct} sleepingPct=${um.sleepingPct}`,
    facts,
  };
}

/** WT-020: top-by-totalMs discovery — no hardcoded slice-name list. */
function summarizeAtrace(role: Role, data: ReturnType<typeof queryAtraceSlices>['data']): { summary: string; facts: Record<string, unknown> } {
  const top = [...data.rows]
    .sort((a, b) => (b.totalMs ?? 0) - (a.totalMs ?? 0))
    .slice(0, 10)
    .map(r => ({ name: r.name, count: r.count, avgMs: r.avgMs, totalMs: r.totalMs }));
  const facts = { available: data.available, totalSlices: data.totalSlices, topByTotalMs: top };
  const tip = top[0];
  if (!tip) {
    return { summary: `${role} atrace available=${data.available} slices=${data.totalSlices} (empty top)`, facts };
  }
  return {
    summary: `${role} atrace topByTotalMs[0]=${tip.name} totalMs=${tip.totalMs} avgMs=${tip.avgMs}; topN=${top.length}`,
    facts,
  };
}

function summarizeFrame(role: Role, data: ReturnType<typeof queryFrameTimeline>['data']): { summary: string; facts: Record<string, unknown> } {
  const pl = data.playerLoopPercentiles;
  const facts = {
    androidFrameTimelineAvailable: data.androidFrameTimeline.available,
    androidFrameTimelineReason: data.androidFrameTimeline.reason ?? null,
    choreographerAvailable: data.choreographer.available,
    playerLoopPercentiles: pl.available
      ? {
          available: true as const,
          p50Ms: pl.p50Ms,
          p95Ms: pl.p95Ms,
          p99Ms: pl.p99Ms,
          fps: pl.fps,
          slowFrameRate: pl.slowFrameRate,
          count: pl.count,
        }
      : { available: false as const, reason: pl.reason },
  };
  const plSum = pl.available
    ? `playerLoop p50=${pl.p50Ms} fps=${pl.fps} slowFrameRate=${pl.slowFrameRate}`
    : `playerLoop available=false`;
  return {
    summary: `${role} FrameTimeline available=${data.androidFrameTimeline.available}; choreographer available=${data.choreographer.available}; ${plSum}`,
    facts,
  };
}

function summarizeCpu(role: Role, data: ReturnType<typeof queryCpuFreq>['data']): { summary: string; facts: Record<string, unknown> } {
  const facts = {
    available: data.available,
    avgMhz: data.avgMhz,
    bigCoreReachPct: data.bigCoreReachPct,
    throttlingLevel: data.throttlingLevel,
    throttlingSuspected: data.throttlingSuspected,
    cpuThrottled: data.cpuThrottled,
    clusterSummary: data.clusterSummary,
  };
  return {
    summary: `${role} cpu avgMhz=${data.avgMhz} bigCoreReachPct=${data.bigCoreReachPct} throttlingLevel=${data.throttlingLevel} suspected=${data.throttlingSuspected}`,
    facts,
  };
}

function summarizeCallTree(role: Role, data: ReturnType<typeof getPerfettoCallTree>['data']): { summary: string; facts: Record<string, unknown> } {
  if (!data.available) {
    const facts = { available: false as const, reason: data.reason, viaPlayerLoopAnchorFallback: false };
    return { summary: `${role} callTree available=false reason=${data.reason}`, facts };
  }
  const hotNames = data.hotPath.map(n => n.name);
  const hasPlayerLoop = hotNames.includes('PlayerLoop');
  const viaFallback = role === 'base';
  const facts = {
    available: true as const,
    treeCount: data.callTrees.length,
    hotPath: data.hotPath.slice(0, 8).map(n => ({ name: n.name, totalMs: n.totalMs, totalPct: n.totalPct })),
    hasPlayerLoop,
    viaPlayerLoopAnchorFallback: viaFallback,
  };
  const tip = data.hotPath[0];
  return {
    summary: `${role} callTree available=true trees=${data.callTrees.length} hotRoot=${tip?.name ?? '?'} hasPlayerLoop=${hasPlayerLoop}${viaFallback ? ' viaPlayerLoopAnchorFallback=true' : ''}`,
    facts,
  };
}

function summarizeCorr(role: Role, data: ReturnType<typeof correlateFrameSchedCpu>['data']): { summary: string; facts: Record<string, unknown> } {
  const facts = {
    granularity: data.granularity,
    signals: data.signals,
    cpu: data.cpu,
    sched: data.sched
      ? {
          name: data.sched.name,
          runningPct: data.sched.runningPct,
          runnablePct: data.sched.runnablePct,
          sleepingPct: data.sched.sleepingPct,
        }
      : null,
    note: data.note,
  };
  return {
    summary: `${role} correlate granularity=${data.granularity} signals=[${data.signals.join('; ')}]`,
    facts,
  };
}

function summarizeSubtree(role: Role, data: ReturnType<typeof queryCallTreeSubtree>['data']): { summary: string; facts: Record<string, unknown> } {
  const rows = data.rows.map(r => ({
    name: r.name,
    totalMs: r.totalMs,
    totalPct: r.totalPct,
    count: r.count,
    avgMs: r.avgMs,
    parentChain: r.parentChain,
    layer: r.layer,
  }));
  return {
    summary: `${role} callTreeSubtree available=${data.available} totalNodes=${data.totalNodes} top=${rows[0]?.name ?? 'n/a'} totalMs=${rows[0]?.totalMs ?? 'n/a'}`,
    facts: { available: data.available, totalNodes: data.totalNodes, rows },
  };
}

function summarizeDeltas(
  label: string,
  data: ReturnType<typeof querySliceDeltas>['data']
): { summary: string; facts: Record<string, unknown> } {
  const rows = data.rows.map(r => ({
    name: r.name,
    baseTotalMs: r.baseTotalMs,
    compareTotalMs: r.compareTotalMs,
    foldChange: r.foldChange,
    baseCount: r.baseCount,
    compareCount: r.compareCount,
    avgMsChange: r.avgMsChange,
    baseTotalPct: r.baseTotalPct,
    compareTotalPct: r.compareTotalPct,
  }));
  return {
    summary: `${label} sliceDeltas available=${data.available} rows=${rows.length} top=${rows[0]?.name ?? 'n/a'} foldChange=${rows[0]?.foldChange ?? 'n/a'}`,
    facts: { available: data.available, rows },
  };
}

function summarizeGc(role: Role, data: ReturnType<typeof queryGcAllocByModule>['data']): { summary: string; facts: Record<string, unknown> } {
  const rows = data.rows.map(r => ({
    name: r.name,
    count: r.count,
    totalMs: r.totalMs,
    perFrame: r.perFrame,
    parentChain: r.parentChain,
  }));
  return {
    summary: `${role} gcAllocByModule available=${data.available} rows=${rows.length} top=${rows[0]?.name ?? 'n/a'} perFrame=${rows[0]?.perFrame ?? 'n/a'}`,
    facts: {
      available: data.available,
      playerLoopFrameCount: data.playerLoopFrameCount,
      totalGcAllocSlices: data.totalGcAllocSlices,
      rows,
    },
  };
}

function summarizeOffCpu(role: Role, data: ReturnType<typeof queryOffCpuAttribution>['data']): { summary: string; facts: Record<string, unknown> } {
  const facts = {
    available: data.available,
    thread: data.thread,
    runningPct: data.runningPct,
    sleepingPct: data.sleepingPct,
    runnablePct: data.runnablePct,
    totalOffCpuMs: data.totalOffCpuMs,
    byState: data.byState,
    waitSlices: data.waitSlices,
    sleepingMs: data.sleepingMs,
    waitSliceTotalMs: data.waitSliceTotalMs,
    coveragePct: data.coveragePct,
    note: data.note,
  };
  const topWait = data.waitSlices[0];
  // byState 按 totalMs 降序找主导态（provider 落 byState 顺序不保证）
  const byStateSorted = (Array.isArray(data.byState) ? data.byState : []).slice()
    .sort((a, b) => (asNum(b.totalMs) ?? 0) - (asNum(a.totalMs) ?? 0));
  const topState = byStateSorted[0];
  // sleepingMs 优先用 byState.S.totalMs（thread_state 直接求和），fallback 到 data.sleepingMs
  const sleepingStateRow = byStateSorted.find(s => String(s.state) === 'S');
  const sleepingMsForSummary = sleepingStateRow ? asNum(sleepingStateRow.totalMs) : asNum(data.sleepingMs);
  return {
    summary:
      `${role} offCpu totalOffCpuMs=${data.totalOffCpuMs} sleepingMs=${sleepingMsForSummary} ` +
      `topState=${topState?.state ?? 'n/a'}(${topState?.pctOfOffCpu ?? 'n/a'}%) ` +
      `topWait=${topWait?.name ?? 'n/a'}(${topWait?.totalMs ?? 'n/a'}ms) coveragePct=${data.coveragePct}`,
    facts,
  };
}

function pushEvidence(
  ledger: PerfettoEvidenceItem[],
  tool: string,
  role: Role | 'delta',
  args: Record<string, unknown>,
  result: { data: unknown; provenance: Record<string, unknown> },
  summarized: { summary: string; facts: Record<string, unknown> }
): PerfettoEvidenceItem {
  const id = `ev-${String(ledger.length + 1).padStart(3, '0')}-${role}-${tool}`;
  const item: PerfettoEvidenceItem = {
    id,
    tool,
    role,
    args,
    provenance: result.provenance,
    summary: summarized.summary,
    dataRefs: role === 'delta' ? [`bk26b-perfetto-triad`] : [`bk26b-perfetto-triad/${role}/perfetto-profile.json`],
    facts: summarized.facts,
  };
  ledger.push(item);
  log(`  evidence ${id}: ${summarized.summary}`);
  return item;
}

function byToolRole(ledger: PerfettoEvidenceItem[], tool: string, role: Role | 'delta'): PerfettoEvidenceItem | undefined {
  return ledger.find(e => e.tool === tool && e.role === role);
}

function byToolArgsMatch(
  ledger: PerfettoEvidenceItem[],
  tool: string,
  pred: (args: Record<string, unknown>) => boolean
): PerfettoEvidenceItem | undefined {
  return ledger.find(e => e.tool === tool && pred(e.args));
}

/** Export for tools.test.ts — WT-020 finding derivation. */
export function deriveFindings(ledger: PerfettoEvidenceItem[]): Finding[] {
  const findings: Finding[] = [];
  let n = 0;
  const add = (f: Omit<Finding, 'id'>) => {
    n += 1;
    findings.push({ id: `f-${String(n).padStart(2, '0')}`, ...f });
  };

  // 1) FrameTimeline unavailable — no jank finding
  const frameEvs = ROLES.map(r => byToolRole(ledger, 'queryFrameTimeline', r)!).filter(Boolean);
  const allFtMissing = frameEvs.every(e => e.facts.androidFrameTimelineAvailable === false);
  if (allFtMissing && frameEvs.length === 3) {
    add({
      title: 'Android FrameTimeline unavailable across triad',
      severity: 'info',
      evidenceIds: frameEvs.map(e => e.id),
      claim:
        'queryFrameTimeline reports androidFrameTimeline.available=false for base/cur/throttle; choreographer/playerLoop percentiles may exist but Android jank/GPU busy cannot be classified from FrameTimeline.',
      boundary: 'FrameTimeline unavailable; no jank finding synthesized',
      kind: 'boundary',
    });
  }

  // 2) base callTree via PlayerLoop anchor fallback
  const baseCt = byToolRole(ledger, 'getPerfettoCallTree', 'base');
  if (baseCt) {
    if (baseCt.facts.available === true && baseCt.facts.viaPlayerLoopAnchorFallback === true) {
      add({
        title: 'base callTree available via PlayerLoop anchor fallback',
        severity: 'info',
        evidenceIds: [baseCt.id],
        claim:
          'base getPerfettoCallTree returns available=true with PlayerLoop on hotPath, but WT-014 parseNotes show root aggregation was empty and tree was built via PlayerLoop anchor fallback — treat absolute ms as lower-confidence vs cur/throttle native roots.',
        boundary: 'via PlayerLoop anchor fallback',
        kind: 'boundary',
      });
    } else if (baseCt.facts.available === false) {
      add({
        title: 'base callTree unavailable',
        severity: 'warning',
        evidenceIds: [baseCt.id],
        claim: `base getPerfettoCallTree available=false: ${String(baseCt.facts.reason ?? 'empty callTrees')}`,
        boundary: 'available:false; no synthetic call tree',
        kind: 'boundary',
      });
    }
  }

  // 3) throttle vs cur sched/freq relative baseline
  const curCpu = byToolRole(ledger, 'queryCpuFreq', 'cur');
  const thrCpu = byToolRole(ledger, 'queryCpuFreq', 'throttle');
  const baseCpu = byToolRole(ledger, 'queryCpuFreq', 'base');
  const curSched = byToolRole(ledger, 'querySchedState', 'cur');
  const thrSched = byToolRole(ledger, 'querySchedState', 'throttle');
  const thrCorr = byToolRole(ledger, 'correlateFrameSchedCpu', 'throttle');

  if (curCpu && thrCpu && curSched && thrSched) {
    const curMhz = asNum(curCpu.facts.avgMhz);
    const thrMhz = asNum(thrCpu.facts.avgMhz);
    const curRun = asNum(asRec(curSched.facts.unityMain).runningPct);
    const thrRun = asNum(asRec(thrSched.facts.unityMain).runningPct);
    const curSleep = asNum(asRec(curSched.facts.unityMain).sleepingPct);
    const thrSleep = asNum(asRec(thrSched.facts.unityMain).sleepingPct);

    if (curMhz != null && thrMhz != null && curRun != null && thrRun != null) {
      const rb = relativeBaselineOf('cur', 'throttle', 'UnityMain runningPct', thrRun, curRun, 'pct');
      const mhzFold = curMhz !== 0 ? round(thrMhz / curMhz, 3) : null;
      const severe =
        (rb.foldChange != null && rb.foldChange <= FOLD_DROP) ||
        (mhzFold != null && mhzFold <= FOLD_DROP);
      const evid = [curCpu.id, thrCpu.id, curSched.id, thrSched.id];
      if (thrCorr) evid.push(thrCorr.id);

      add({
        title: 'throttle vs cur sched/freq relative baseline (window)',
        severity: severe || thrCpu.facts.throttlingSuspected ? 'warning' : 'info',
        evidenceIds: evid,
        claim:
          `${rb.relativeJudgment}; avgMhz cur=${curMhz} → throttle=${thrMhz} (×${mhzFold ?? 'n/a'})` +
          (curSleep != null && thrSleep != null
            ? `; sleepingPct ${curSleep} → ${thrSleep} (Δ ${round(thrSleep - curSleep, 2)}pp)`
            : '') +
          `; throttle throttlingLevel=${String(thrCpu.facts.throttlingLevel)} suspected=${String(thrCpu.facts.throttlingSuspected)}. ` +
          `Co-direction is window-level only (correlateFrameSchedCpu granularity=window).`,
        boundary: 'window-only correlation; not per-frame',
        relativeBaseline: rb,
        kind: 'sched-relative',
      });
    }
  }

  // 4) window-only correlate boundary
  const corrEvs = (['cur', 'throttle'] as const)
    .map(r => byToolRole(ledger, 'correlateFrameSchedCpu', r))
    .filter((e): e is PerfettoEvidenceItem => e != null);
  if (corrEvs.length) {
    const allWindow = corrEvs.every(e => e.facts.granularity === 'window');
    add({
      title: 'correlateFrameSchedCpu is window-granularity only',
      severity: 'info',
      evidenceIds: corrEvs.map(e => e.id),
      claim:
        `correlateFrameSchedCpu on ${corrEvs.map(e => e.role).join('/')} reports granularity=window` +
        (allWindow ? '' : ' (unexpected non-window value present)') +
        '; must not claim per-frame frame↔sched↔cpu correlation.',
      boundary: 'granularity:window; no per-frame correlation claimed',
      kind: 'boundary',
    });
  }

  // 5) base vs cur sched relative baseline
  const baseSched = byToolRole(ledger, 'querySchedState', 'base');
  if (baseSched && curSched) {
    const b = asRec(baseSched.facts.unityMain);
    const c = asRec(curSched.facts.unityMain);
    const bRun = asNum(b.runningPct);
    const cRun = asNum(c.runningPct);
    if (bRun != null && cRun != null) {
      const rb = relativeBaselineOf('base', 'cur', 'UnityMain runningPct', cRun, bRun, 'pct');
      add({
        title: 'base vs cur UnityMain sched relative baseline',
        severity: 'info',
        evidenceIds: [baseSched.id, curSched.id],
        claim: `${rb.relativeJudgment}; sleepingPct base=${b.sleepingPct} cur=${c.sleepingPct}`,
        boundary: 'window sched aggregates; not FrameTimeline jank',
        relativeBaseline: rb,
        kind: 'sched-relative',
      });
    }
  }

  // top 业务模块 (cur top 5 by totalMs)
  const curSubtree = byToolRole(ledger, 'queryCallTreeSubtree', 'cur');
  const baseSubtree = byToolRole(ledger, 'queryCallTreeSubtree', 'base');
  if (curSubtree && Array.isArray(curSubtree.facts.rows)) {
    const curRows = curSubtree.facts.rows as Array<Record<string, unknown>>;
    const baseRows = Array.isArray(baseSubtree?.facts.rows)
      ? (baseSubtree!.facts.rows as Array<Record<string, unknown>>)
      : [];
    const baseByName = new Map(baseRows.map(r => [String(r.name), r]));
    for (const row of curRows.slice(0, 5)) {
      const name = String(row.name ?? '');
      const totalMs = asNum(row.totalMs) ?? 0;
      const totalPct = asNum(row.totalPct);
      const baseRow = baseByName.get(name);
      const baseMs = asNum(baseRow?.totalMs);
      const rb: RelativeBaseline =
        baseMs != null && baseMs > 0
          ? relativeBaselineOf('base', 'cur', `${name} totalMs`, totalMs, baseMs, 'ms')
          : {
              baselineRole: 'base',
              compareRole: 'cur',
              absoluteValue: `cur ${name} totalMs=${totalMs}`,
              baselineValue: `base ${name} totalMs=n/a`,
              foldChange: baseMs === 0 && totalMs > 0 ? 9999 : null,
              deltaPct: totalPct != null && asNum(baseRow?.totalPct) != null
                ? round(totalPct - (asNum(baseRow?.totalPct) as number), 2)
                : null,
              relativeJudgment:
                baseMs === 0 && totalMs > 0
                  ? `${name} 仅在 cur 有 totalMs（base 为 0 / 缺失）`
                  : `${name} cur totalMs=${totalMs}（base 无同名可比行）`,
            };
      add({
        title: `top 业务模块: ${name}`,
        severity: rb.foldChange != null && rb.foldChange >= FOLD_RISE ? 'warning' : 'info',
        evidenceIds: [curSubtree.id, ...(baseSubtree ? [baseSubtree.id] : [])],
        claim:
          `${name}: totalMs=${totalMs} totalPct=${totalPct ?? 'n/a'} count=${row.count ?? 'n/a'} avgMs=${row.avgMs ?? 'n/a'}` +
          `; parentChain=${row.parentChain ?? 'n/a'}; ${rb.relativeJudgment}`,
        boundary: 'callTreeSubtree ranking by totalMs; no hardcoded module list',
        relativeBaseline: rb,
        kind: 'top-business-module',
      });
    }
  }

  // 涨幅最大模块 base→cur
  const deltaBc = byToolArgsMatch(
    ledger,
    'querySliceDeltas',
    a => a.baseRole === 'base' && a.compareRole === 'cur'
  );
  if (deltaBc && Array.isArray(deltaBc.facts.rows)) {
    const rows = (deltaBc.facts.rows as Array<Record<string, unknown>>)
      .filter(r => (asNum(r.foldChange) ?? 0) >= FOLD_RISE)
      .slice(0, 5);
    for (const row of rows) {
      const name = String(row.name ?? '');
      const fold = asNum(row.foldChange) ?? 0;
      const baseMs = asNum(row.baseTotalMs) ?? 0;
      const curMs = asNum(row.compareTotalMs) ?? 0;
      const denom = baseMs > 0 ? baseMs : 1;
      const rb = relativeBaselineOf('base', 'cur', `${name} totalMs`, curMs, denom, 'ms');
      rb.foldChange = fold;
      rb.relativeJudgment =
        fold >= 9999
          ? `${name} 仅在 cur 出现 (foldChange=9999 sentinel)`
          : `cur 比 base 涨 ×${fold} (${baseMs}→${curMs} ms)`;
      add({
        title: `涨幅最大模块: ${name}`,
        severity: fold >= 4 || fold >= 9999 ? 'critical' : 'warning',
        evidenceIds: [deltaBc.id],
        claim:
          `${name}: baseTotalMs=${row.baseTotalMs} curTotalMs=${row.compareTotalMs} foldChange=${fold}` +
          `; baseCount=${row.baseCount} curCount=${row.compareCount} avgMsChange=${row.avgMsChange}`,
        boundary: 'querySliceDeltas foldChange ranking; relative threshold ≥2×',
        relativeBaseline: rb,
        kind: 'fold-change-module',
      });
    }
  }

  // thermal-only / 隐性路径 cur→throttle
  const deltaCt = byToolArgsMatch(
    ledger,
    'querySliceDeltas',
    a => a.baseRole === 'cur' && a.compareRole === 'throttle'
  );
  if (deltaCt && Array.isArray(deltaCt.facts.rows)) {
    const rows = (deltaCt.facts.rows as Array<Record<string, unknown>>)
      .filter(r => (asNum(r.foldChange) ?? 0) >= FOLD_RISE)
      .slice(0, 5);
    for (const row of rows) {
      const name = String(row.name ?? '');
      const fold = asNum(row.foldChange) ?? 0;
      const baseMs = asNum(row.baseTotalMs) ?? 0;
      const cmpMs = asNum(row.compareTotalMs) ?? 0;
      const rb = relativeBaselineOf('cur', 'throttle', `${name} totalMs`, cmpMs, baseMs > 0 ? baseMs : 1, 'ms');
      rb.foldChange = fold;
      rb.relativeJudgment =
        fold >= 9999
          ? `${name} 仅在 throttle 出现 (foldChange=9999 sentinel)`
          : `throttle 比 cur 涨 ×${fold} (${baseMs}→${cmpMs} ms)`;
      add({
        title: `thermal-only 隐性路径: ${name}`,
        severity: fold >= 9999 ? 'warning' : 'info',
        evidenceIds: [deltaCt.id],
        claim:
          `${name}: curTotalMs=${row.baseTotalMs} throttleTotalMs=${row.compareTotalMs} foldChange=${fold}` +
          `; curCount=${row.baseCount} throttleCount=${row.compareCount}`,
        boundary: 'querySliceDeltas cur→throttle; foldChange≥2 or sentinel 9999',
        relativeBaseline: rb,
        kind: 'thermal-only-path',
      });
    }
  }

  // GC 压力最大模块
  const gcCur = byToolRole(ledger, 'queryGcAllocByModule', 'cur');
  const gcThr = byToolRole(ledger, 'queryGcAllocByModule', 'throttle');
  if (gcCur && Array.isArray(gcCur.facts.rows)) {
    const thrByName = new Map(
      (Array.isArray(gcThr?.facts.rows) ? (gcThr!.facts.rows as Array<Record<string, unknown>>) : []).map(r => [
        String(r.name),
        r,
      ])
    );
    for (const row of (gcCur.facts.rows as Array<Record<string, unknown>>).slice(0, 5)) {
      const name = String(row.name ?? '');
      const perFrame = asNum(row.perFrame) ?? 0;
      if (perFrame <= 0) continue;
      const thrRow = thrByName.get(name);
      const thrPf = asNum(thrRow?.perFrame);
      let rb: RelativeBaseline;
      if (thrPf != null && thrPf > 0) {
        rb = {
          baselineRole: 'cur',
          compareRole: 'throttle',
          absoluteValue: `cur ${name} perFrame=${perFrame}`,
          baselineValue: `throttle ${name} perFrame=${thrPf}`,
          foldChange: round(thrPf / perFrame, 3),
          deltaPct: null,
          relativeJudgment: `throttle 比 cur perFrame ×${round(thrPf / perFrame, 3)} (${perFrame}→${thrPf})`,
        };
      } else {
        rb = {
          baselineRole: 'cur',
          compareRole: 'throttle',
          absoluteValue: `cur ${name} perFrame=${perFrame}`,
          baselineValue: `throttle ${name} perFrame=n/a`,
          foldChange: null,
          deltaPct: null,
          relativeJudgment: `${name} cur perFrame=${perFrame} (throttle 无同名行)`,
        };
      }
      add({
        title: `GC 压力最大模块: ${name}`,
        severity: 'warning',
        evidenceIds: [gcCur.id, ...(gcThr ? [gcThr.id] : [])],
        claim:
          `${name}: count=${row.count} totalMs=${row.totalMs} perFrame=${perFrame}` +
          `; parentChain=${Array.isArray(row.parentChain) ? (row.parentChain as string[]).join('>') : row.parentChain ?? 'n/a'}` +
          `; ${rb.relativeJudgment}`,
        boundary: 'queryGcAllocByModule ranking by perFrame; no hardcoded module list',
        relativeBaseline: rb,
        kind: 'gc-pressure-module',
      });
    }
  }

  // off-CPU byState 归因
  const offCpu = byToolRole(ledger, 'queryOffCpuAttribution', 'throttle');
  // byState 按 totalMs 降序找主导态（provider 落 byState 顺序不保证）
  const offCpuByState = (offCpu && Array.isArray(offCpu.facts.byState)
    ? (offCpu.facts.byState as Array<Record<string, unknown>>)
    : []).slice().sort((a, b) => (asNum(b.totalMs) ?? 0) - (asNum(a.totalMs) ?? 0));
  // sleepingMs 优先用 byState.S.totalMs（thread_state 表直接求和），fallback 到 offCpu.facts.sleepingMs
  const sleepingStateRow = offCpuByState.find(s => String(s.state) === 'S');
  const sleepingMsFromByState = sleepingStateRow ? asNum(sleepingStateRow.totalMs) : null;
  if (offCpu && offCpu.facts.available) {
    const byState = offCpuByState;
    const totalOff = asNum(offCpu.facts.totalOffCpuMs);
    const stateParts = byState.map(s => `${s.state}=${s.totalMs}ms(${s.pctOfOffCpu}%)`).join('/');
    const topState = byState[0];
    const topPct = asNum(topState?.pctOfOffCpu);
    add({
      title: 'off-CPU byState 归因 (throttle)',
      severity: 'info',
      evidenceIds: [offCpu.id],
      claim:
        `throttle totalOffCpuMs=${totalOff}, byState: ${stateParts}` +
        (topState ? ` → 主线程 off-CPU 以 state=${topState.state} 为主 (${topPct ?? 'n/a'}%)` : ''),
      boundary: 'offCpuAttribution.byState window aggregate',
      kind: 'offcpu-bystate',
    });
  }

  // GPU-bound 因果链 — max(waitSlice) vs sleepingMs (nested coverage fix)
  if (offCpu && offCpu.facts.available) {
    const waitSlices = Array.isArray(offCpu.facts.waitSlices)
      ? (offCpu.facts.waitSlices as Array<Record<string, unknown>>)
      : [];
    // sleepingMs 优先用 byState.S.totalMs（thread_state 直接求和，对照作文机 v5 §4.3 Sleeping 总时间）
    const sleepingMs = sleepingMsFromByState ?? asNum(offCpu.facts.sleepingMs);
    const maxWait = waitSlices.reduce((m, s) => Math.max(m, asNum(s.totalMs) ?? 0), 0);
    const maxWaitRow = waitSlices.find(s => (asNum(s.totalMs) ?? 0) === maxWait) ?? waitSlices[0];
    const effectiveCoverage =
      sleepingMs != null && sleepingMs > 0 && maxWait > 0 ? round((maxWait / sleepingMs) * 100, 2) : null;
    const nestedCoverage = asNum(offCpu.facts.coveragePct);

    if (maxWaitRow && sleepingMs != null && effectiveCoverage != null) {
      const confidence: CausalChain['confidence'] =
        effectiveCoverage >= COVERAGE_STRONG ? 'high' : effectiveCoverage >= 50 ? 'medium' : 'low';
      const premise =
        `throttle sleepingMs=${sleepingMs} (byState.S.totalMs), maxWaitSlice=${maxWaitRow.name}=${maxWait}ms` +
        (nestedCoverage != null ? ` (nested sum coveragePct=${nestedCoverage}% — use max not sum)` : '');
      const inference =
        `effectiveCoveragePct≈${effectiveCoverage}% (maxWait/sleepingMs)` +
        (effectiveCoverage >= COVERAGE_STRONG
          ? ' → 主线程睡的时候接近 100% 在等该 wait slice（多为 Present/GPU）'
          : ' → wait 覆盖不足，不宜断言强 GPU-bound');
      const conclusion =
        confidence === 'high'
          ? 'GPU-bound 信号强烈'
          : confidence === 'medium'
            ? 'GPU-bound 信号中等'
            : 'GPU-bound 信号弱 / 证据不足';
      add({
        title: 'GPU-bound 因果推理 (wait slice vs sleeping)',
        severity: confidence === 'high' ? 'critical' : confidence === 'medium' ? 'warning' : 'info',
        evidenceIds: [offCpu.id],
        claim: `${premise}; ${inference}; ${conclusion}`,
        boundary: 'nested waitSlices may inflate sum coveragePct; judgment uses max(waitSlice.totalMs)/sleepingMs (byState.S.totalMs preferred over sched sleepingPct×totalOffCpuMs)',
        causalChain: { premise, inference, conclusion, confidence },
        kind: 'gpu-bound-causal',
      });
    }
  }

  // PlayerLoop 分位数对比
  const curFrame = byToolRole(ledger, 'queryFrameTimeline', 'cur');
  const thrFrame = byToolRole(ledger, 'queryFrameTimeline', 'throttle');
  if (curFrame && thrFrame) {
    const curPl = asRec(curFrame.facts.playerLoopPercentiles);
    const thrPl = asRec(thrFrame.facts.playerLoopPercentiles);
    if (curPl.available === true && thrPl.available === true) {
      const curP50 = asNum(curPl.p50Ms);
      const thrP50 = asNum(thrPl.p50Ms);
      const curSlow = asNum(curPl.slowFrameRate);
      const thrSlow = asNum(thrPl.slowFrameRate);
      if (curP50 != null && thrP50 != null) {
        const rb = relativeBaselineOf('cur', 'throttle', 'playerLoop p50Ms', thrP50, curP50, 'ms');
        const slowFold =
          curSlow != null && curSlow > 0 && thrSlow != null ? round(thrSlow / curSlow, 2) : null;
        add({
          title: 'PlayerLoop 分位数对比 (cur vs throttle)',
          severity: rb.foldChange != null && rb.foldChange >= FOLD_RISE ? 'warning' : 'info',
          evidenceIds: [curFrame.id, thrFrame.id],
          claim:
            `cur p50=${curP50} p95=${curPl.p95Ms} fps=${curPl.fps} slowFrameRate=${curSlow} → ` +
            `throttle p50=${thrP50} p95=${thrPl.p95Ms} fps=${thrPl.fps} slowFrameRate=${thrSlow}` +
            `; ${rb.relativeJudgment}` +
            (slowFold != null ? `; slowFrameRate ×${slowFold}` : ''),
          boundary: 'playerLoopPercentiles from provider; not Android FrameTimeline jank',
          relativeBaseline: rb,
          kind: 'playerloop-percentiles',
        });
      }
    }
  }

  // 降频形态
  if (baseCpu && curCpu && thrCpu) {
    const bReach = asNum(baseCpu.facts.bigCoreReachPct);
    const cReach = asNum(curCpu.facts.bigCoreReachPct);
    const tReach = asNum(thrCpu.facts.bigCoreReachPct);
    const bAvg = asNum(baseCpu.facts.avgMhz);
    const cAvg = asNum(curCpu.facts.avgMhz);
    const tAvg = asNum(thrCpu.facts.avgMhz);
    const clusters = (
      [
        ['base', baseCpu],
        ['cur', curCpu],
        ['throttle', thrCpu],
      ] as const
    ).map(([role, ev]) => {
      const cs = asRec(ev.facts.clusterSummary);
      const big = asRec(cs.big);
      const mid = asRec(cs.mid);
      const small = asRec(cs.small);
      return `${role}: big.reach=${big.avgReachPct} mid.reach=${mid.avgReachPct} small.reach=${small.avgReachPct}`;
    });

    const thrCs = asRec(thrCpu.facts.clusterSummary);
    const curCs = asRec(curCpu.facts.clusterSummary);
    const thrBig = asNum(asRec(thrCs.big).avgReachPct);
    const thrMid = asNum(asRec(thrCs.mid).avgReachPct);
    const thrSmall = asNum(asRec(thrCs.small).avgReachPct);
    const curBig = asNum(asRec(curCs.big).avgReachPct);
    const curMid = asNum(asRec(curCs.mid).avgReachPct);
    const curSmall = asNum(asRec(curCs.small).avgReachPct);

    let morphology = '证据不足';
    if (
      thrBig != null &&
      thrMid != null &&
      thrSmall != null &&
      curBig != null &&
      curMid != null &&
      curSmall != null
    ) {
      const bigFold = curBig > 0 ? thrBig / curBig : 1;
      const midFold = curMid > 0 ? thrMid / curMid : 1;
      const smallFold = curSmall > 0 ? thrSmall / curSmall : 1;
      const allDown = bigFold < 1 && midFold < 1 && smallFold < 1;
      const bigOnlyHard = bigFold <= FOLD_DROP && midFold > FOLD_DROP && smallFold > FOLD_DROP;
      if (bigOnlyHard) morphology = '大核下线倾向（big reach 相对 mid/small 单独硬降）';
      else if (allDown) morphology = '全集群压频（big/mid/small reach 同向下降）';
      else morphology = '混合/局部压频（非单一形态）';
    }

    const rb =
      cReach != null && tReach != null
        ? relativeBaselineOf('cur', 'throttle', 'bigCoreReachPct', tReach, cReach, 'pct')
        : undefined;

    add({
      title: '降频形态判定 (三态 clusterSummary)',
      severity: morphology.includes('全集群') || morphology.includes('大核') ? 'warning' : 'info',
      evidenceIds: [baseCpu.id, curCpu.id, thrCpu.id],
      claim:
        `bigCoreReachPct base=${bReach}→cur=${cReach}→throttle=${tReach}; ` +
        `avgMhz ${bAvg}→${cAvg}→${tAvg}; clusters: ${clusters.join(' | ')}; 形态=${morphology}` +
        (rb ? `; ${rb.relativeJudgment}` : ''),
      boundary: 'cluster split by CPU index bands; no SoC-name hardcoding',
      relativeBaseline: rb,
      kind: 'freq-morphology',
    });
  }

  return findings;
}

/** Export for tools.test.ts */
export function deriveVerdict(findings: Finding[], ledger: PerfettoEvidenceItem[]): Verdict {
  const boundaries: string[] = [];

  for (const f of findings) {
    if (f.boundary.toLowerCase().includes('frametimeline') && f.kind === 'boundary') {
      boundaries.push('FrameTimeline / GPU unavailable — cannot judge Android jank or GPU busy');
    }
    if (f.boundary.toLowerCase().includes('window-only') || f.boundary.includes('granularity:window')) {
      boundaries.push('correlateFrameSchedCpu is window-only — no per-frame claim');
    }
    if (f.boundary.includes('PlayerLoop anchor fallback')) {
      boundaries.push('base callTree via PlayerLoop anchor fallback — lower confidence absolute ms');
    }
  }
  const uniqBoundaries = [...new Set(boundaries)];

  const runTrend = (role: Role) => {
    const s = byToolRole(ledger, 'querySchedState', role);
    return asNum(asRec(s?.facts.unityMain).runningPct);
  };
  const mhz = (role: Role) => asNum(byToolRole(ledger, 'queryCpuFreq', role)?.facts.avgMhz);
  const reach = (role: Role) => asNum(byToolRole(ledger, 'queryCpuFreq', role)?.facts.bigCoreReachPct);
  const p50 = (role: Role) => {
    const pl = asRec(byToolRole(ledger, 'queryFrameTimeline', role)?.facts.playerLoopPercentiles);
    return pl.available === true ? asNum(pl.p50Ms) : undefined;
  };

  const triadTrend =
    `UnityMain runningPct ${runTrend('base')}→${runTrend('cur')}→${runTrend('throttle')}; ` +
    `avgMhz ${mhz('base')}→${mhz('cur')}→${mhz('throttle')}; ` +
    `PlayerLoop p50 ${p50('base')}→${p50('cur')}→${p50('throttle')}; ` +
    `bigCoreReachPct ${reach('base')}→${reach('cur')}→${reach('throttle')}`;

  const topBiz = findings.find(f => f.kind === 'top-business-module');
  const topBusinessHotspot = topBiz
    ? topBiz.claim
    : '无 top 业务模块 finding（callTreeSubtree 无数据）';

  const gpu = findings.find(f => f.kind === 'gpu-bound-causal');
  const gpuBoundJudgment = gpu?.causalChain
    ? `${gpu.causalChain.conclusion} (${gpu.causalChain.inference})`
    : '无 GPU-bound 因果 finding';

  const freq = findings.find(f => f.kind === 'freq-morphology');
  const freqMorphologyJudgment = freq?.claim ?? '无降频形态 finding';

  const conclusions = [
    `三态主趋势: ${triadTrend}`,
    `头号业务红线: ${topBusinessHotspot}`,
    `GPU-bound 判定: ${gpuBoundJudgment}`,
    `降频形态判定: ${freqMorphologyJudgment}`,
  ];

  return {
    source: 'perfetto',
    sampleSet: SAMPLE_SET,
    summary:
      `Perfetto triad explore WT-020: 相对基线判定 + 跨态发现 + 因果推理。${triadTrend}. ` +
      `顶级业务热点与 GPU-bound/降频形态见 conclusions；能力边界保留 FrameTimeline/window-only/fallback。`,
    conclusions,
    boundaries: uniqBoundaries,
    findingIds: findings.map(f => f.id),
    triadTrend,
    topBusinessHotspot,
    gpuBoundJudgment,
    freqMorphologyJudgment,
  };
}

/** Collect ledger + findings + verdict. Exported for tests. */
export function runExploreMvp(options?: { writeFiles?: boolean }): {
  ledger: PerfettoEvidenceItem[];
  findings: Finding[];
  verdict: Verdict;
  outDir: string;
} {
  const writeFiles = options?.writeFiles !== false;
  if (writeFiles) {
    fs.mkdirSync(EXPLORE_OUT_DIR, { recursive: true });
    logLines.length = 0;
  }
  log(`WT-020 Perfetto explore MVP start → ${EXPLORE_OUT_DIR}`);

  const ledger: PerfettoEvidenceItem[] = [];

  for (const role of ROLES) {
    log(`--- role=${role} ---`);

    {
      const args = { role, thread: 'UnityMain', topN: 20 };
      const result = querySchedState(null, args);
      pushEvidence(
        ledger,
        'querySchedState',
        role,
        args,
        result as { data: unknown; provenance: Record<string, unknown> },
        summarizeSched(role, result.data)
      );
    }

    {
      const args = { role, topN: 30 };
      const result = queryAtraceSlices(null, args);
      pushEvidence(
        ledger,
        'queryAtraceSlices',
        role,
        args,
        result as { data: unknown; provenance: Record<string, unknown> },
        summarizeAtrace(role, result.data)
      );
    }

    {
      const args = { role };
      const result = queryFrameTimeline(null, args);
      pushEvidence(
        ledger,
        'queryFrameTimeline',
        role,
        args,
        result as { data: unknown; provenance: Record<string, unknown> },
        summarizeFrame(role, result.data)
      );
    }

    {
      const args = { role };
      const result = queryCpuFreq(null, args);
      pushEvidence(
        ledger,
        'queryCpuFreq',
        role,
        args,
        result as { data: unknown; provenance: Record<string, unknown> },
        summarizeCpu(role, result.data)
      );
    }

    {
      const args = { role, maxDepth: 6 };
      const result = getPerfettoCallTree(null, args);
      pushEvidence(
        ledger,
        'getPerfettoCallTree',
        role,
        args,
        result as { data: unknown; provenance: Record<string, unknown> },
        summarizeCallTree(role, result.data)
      );
    }
  }

  for (const role of ['cur', 'throttle'] as const) {
    log(`--- correlate role=${role} ---`);
    const args = { role, thread: 'UnityMain' };
    const result = correlateFrameSchedCpu(null, args);
    pushEvidence(
      ledger,
      'correlateFrameSchedCpu',
      role,
      args,
      result as { data: unknown; provenance: Record<string, unknown> },
      summarizeCorr(role, result.data)
    );
  }

  // WT-020 additional queries
  for (const role of ROLES) {
    const args = { role, topN: 20, minTotalPct: 0 };
    const result = queryCallTreeSubtree(null, args);
    pushEvidence(
      ledger,
      'queryCallTreeSubtree',
      role,
      args,
      result as { data: unknown; provenance: Record<string, unknown> },
      summarizeSubtree(role, result.data)
    );
  }

  {
    const args = {
      baseRole: 'base' as const,
      compareRole: 'cur' as const,
      tool: 'callTreeSubtree' as const,
      minFoldChange: FOLD_RISE,
      topN: 10,
      minTotalPct: 0,
    };
    const result = querySliceDeltas(null, args);
    pushEvidence(
      ledger,
      'querySliceDeltas',
      'delta',
      args,
      result as { data: unknown; provenance: Record<string, unknown> },
      summarizeDeltas('base→cur', result.data)
    );
  }

  {
    const args = {
      baseRole: 'cur' as const,
      compareRole: 'throttle' as const,
      tool: 'callTreeSubtree' as const,
      minFoldChange: FOLD_RISE,
      topN: 10,
      minTotalPct: 0,
    };
    const result = querySliceDeltas(null, args);
    pushEvidence(
      ledger,
      'querySliceDeltas',
      'delta',
      args,
      result as { data: unknown; provenance: Record<string, unknown> },
      summarizeDeltas('cur→throttle', result.data)
    );
  }

  for (const role of ['cur', 'throttle'] as const) {
    const args = { role, topN: 10, minPerFrame: 0 };
    const result = queryGcAllocByModule(null, args);
    pushEvidence(
      ledger,
      'queryGcAllocByModule',
      role,
      args,
      result as { data: unknown; provenance: Record<string, unknown> },
      summarizeGc(role, result.data)
    );
  }

  {
    const args = { role: 'throttle' as const, thread: 'UnityMain' };
    const result = queryOffCpuAttribution(null, args);
    pushEvidence(
      ledger,
      'queryOffCpuAttribution',
      'throttle',
      args,
      result as { data: unknown; provenance: Record<string, unknown> },
      summarizeOffCpu('throttle', result.data)
    );
  }

  const findings = deriveFindings(ledger);
  const verdict = deriveVerdict(findings, ledger);

  if (writeFiles) {
    const ledgerDoc = {
      source: 'perfetto' as const,
      sampleSet: SAMPLE_SET,
      generatedAt: new Date().toISOString(),
      evidenceCount: ledger.length,
      evidence: ledger,
    };
    const findingsDoc = {
      source: 'perfetto' as const,
      sampleSet: SAMPLE_SET,
      generatedAt: new Date().toISOString(),
      findings,
    };
    const verdictDoc = {
      ...verdict,
      generatedAt: new Date().toISOString(),
    };

    const ledgerPath = path.join(EXPLORE_OUT_DIR, 'ledger.json');
    const findingsPath = path.join(EXPLORE_OUT_DIR, 'findings.json');
    const verdictPath = path.join(EXPLORE_OUT_DIR, 'verdict.json');
    const runLogPath = path.join(EXPLORE_OUT_DIR, 'run.log');

    fs.writeFileSync(ledgerPath, JSON.stringify(ledgerDoc, null, 2), 'utf8');
    fs.writeFileSync(findingsPath, JSON.stringify(findingsDoc, null, 2), 'utf8');
    fs.writeFileSync(verdictPath, JSON.stringify(verdictDoc, null, 2), 'utf8');

    log(`wrote ${ledgerPath} (evidence=${ledger.length})`);
    log(`wrote ${findingsPath} (findings=${findings.length})`);
    log(`wrote ${verdictPath}`);
    for (const f of findings) {
      log(`  finding ${f.id} [${f.severity}] ${f.title}`);
    }
    log('WT-020 Perfetto explore MVP done');
    fs.writeFileSync(runLogPath, logLines.join('\n') + '\n', 'utf8');
    console.log(`wrote ${runLogPath}`);
  }

  return { ledger, findings, verdict, outDir: EXPLORE_OUT_DIR };
}

const isMain =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  runExploreMvp({ writeFiles: true });
}
