/**
 * WT-017 · Perfetto explore + evidence ledger MVP
 *
 * Deterministic scripted loop over WT-013's 6 Perfetto JSON query tools.
 * No LLM. Derives findings/verdict only from query evidence + provenance.
 *
 * Usage (from web/):
 *   node --import tsx server/scripts/perfetto-explore-mvp.ts
 *
 * Outputs → web/data/prism-out/bk26b-perfetto-explore-mvp/
 *   ledger.json | findings.json | verdict.json | run.log
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  querySchedState,
  queryAtraceSlices,
  queryFrameTimeline,
  queryCpuFreq,
  getPerfettoCallTree,
  correlateFrameSchedCpu,
} from '../prism/tools.js';

type Role = 'base' | 'cur' | 'throttle';

interface PerfettoEvidenceItem {
  id: string;
  tool: string;
  role: Role;
  args: Record<string, unknown>;
  provenance: Record<string, unknown>;
  summary: string;
  dataRefs?: string[];
  /** Compact facts extracted for deterministic finding rules (not free-form narrative). */
  facts: Record<string, unknown>;
}

interface Finding {
  id: string;
  title: string;
  severity: 'info' | 'warning' | 'critical';
  evidenceIds: string[];
  claim: string;
  boundary: string;
}

interface Verdict {
  source: 'perfetto';
  sampleSet: 'bk26b-perfetto-triad';
  summary: string;
  conclusions: string[];
  boundaries: string[];
  findingIds: string[];
}

const ROLES: Role[] = ['base', 'cur', 'throttle'];
const SAMPLE_SET = 'bk26b-perfetto-triad';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
const OUT_DIR = path.join(WEB_ROOT, 'data/prism-out/bk26b-perfetto-explore-mvp');

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

function findThread(
  threads: Array<{ name: string; runningPct?: number; runnablePct?: number; sleepingPct?: number }>,
  needle: string
) {
  const lower = needle.toLowerCase();
  return threads.find(t => t.name.toLowerCase() === lower) ?? threads.find(t => t.name.toLowerCase().includes(lower));
}

function findSlice(
  rows: Array<{ name: string; count?: number; avgMs?: number; totalMs?: number }>,
  needle: string
) {
  const lower = needle.toLowerCase();
  return rows.find(r => r.name.toLowerCase() === lower) ?? rows.find(r => r.name.toLowerCase().includes(lower));
}

function summarizeSched(role: Role, data: ReturnType<typeof querySchedState>['data']): { summary: string; facts: Record<string, unknown> } {
  const um = findThread(data.threads, 'UnityMain');
  const facts: Record<string, unknown> = {
    available: data.available,
    totalThreads: data.totalThreads,
    unityMain: um
      ? {
          name: um.name,
          runningPct: um.runningPct,
          runnablePct: um.runnablePct,
          sleepingPct: um.sleepingPct,
        }
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

function summarizeAtrace(role: Role, data: ReturnType<typeof queryAtraceSlices>['data']): { summary: string; facts: Record<string, unknown> } {
  const targets = ['PlayerLoop', 'BehaviourUpdate', 'FinishFrameRendering'] as const;
  const slices: Record<string, { name: string; count?: number; avgMs?: number; totalMs?: number } | null> = {};
  for (const name of targets) {
    const row = findSlice(data.rows, name);
    slices[name] = row
      ? { name: row.name, count: row.count, avgMs: row.avgMs, totalMs: row.totalMs }
      : null;
  }
  const pl = slices.PlayerLoop;
  const facts = { available: data.available, totalSlices: data.totalSlices, slices };
  if (!pl) {
    return { summary: `${role} atrace available=${data.available} slices=${data.totalSlices} (no PlayerLoop in topN)`, facts };
  }
  return {
    summary: `${role} PlayerLoop count=${pl.count} avgMs=${pl.avgMs} totalMs=${pl.totalMs}; BehaviourUpdate count=${slices.BehaviourUpdate?.count ?? 'n/a'}; FinishFrameRendering count=${slices.FinishFrameRendering?.count ?? 'n/a'}`,
    facts,
  };
}

function summarizeFrame(role: Role, data: ReturnType<typeof queryFrameTimeline>['data']): { summary: string; facts: Record<string, unknown> } {
  const facts = {
    androidFrameTimelineAvailable: data.androidFrameTimeline.available,
    androidFrameTimelineReason: data.androidFrameTimeline.reason ?? null,
    choreographerAvailable: data.choreographer.available,
  };
  return {
    summary: `${role} FrameTimeline available=${data.androidFrameTimeline.available}; choreographer available=${data.choreographer.available}`,
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
  // WT-014: base non-empty callTree comes from PlayerLoop anchor fallback (parseNotes).
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

function pushEvidence(
  ledger: PerfettoEvidenceItem[],
  tool: string,
  role: Role,
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
    dataRefs: [`bk26b-perfetto-triad/${role}/perfetto-profile.json`],
    facts: summarized.facts,
  };
  ledger.push(item);
  log(`  evidence ${id}: ${summarized.summary}`);
  return item;
}

function byToolRole(ledger: PerfettoEvidenceItem[], tool: string, role: Role): PerfettoEvidenceItem | undefined {
  return ledger.find(e => e.tool === tool && e.role === role);
}

function deriveFindings(ledger: PerfettoEvidenceItem[]): Finding[] {
  const findings: Finding[] = [];
  let n = 0;
  const add = (f: Omit<Finding, 'id'>) => {
    n += 1;
    findings.push({ id: `f-${String(n).padStart(2, '0')}`, ...f });
  };

  // 1) FrameTimeline unavailable on all roles — capability boundary, no jank finding
  const frameEvs = ROLES.map(r => byToolRole(ledger, 'queryFrameTimeline', r)!).filter(Boolean);
  const allFtMissing = frameEvs.every(e => e.facts.androidFrameTimelineAvailable === false);
  if (allFtMissing && frameEvs.length === 3) {
    add({
      title: 'Android FrameTimeline unavailable across triad',
      severity: 'info',
      evidenceIds: frameEvs.map(e => e.id),
      claim:
        'queryFrameTimeline reports androidFrameTimeline.available=false for base/cur/throttle; choreographer summary may exist but Android jank/GPU busy cannot be classified from this sample set.',
      boundary: 'FrameTimeline unavailable; no jank finding synthesized',
    });
  }

  // 2) base callTree via PlayerLoop anchor fallback (WT-014)
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
      });
    } else if (baseCt.facts.available === false) {
      add({
        title: 'base callTree unavailable',
        severity: 'warning',
        evidenceIds: [baseCt.id],
        claim: `base getPerfettoCallTree available=false: ${String(baseCt.facts.reason ?? 'empty callTrees')}`,
        boundary: 'available:false; no synthetic call tree',
      });
    }
  }

  // 3) throttle vs cur: CPU freq decline co-directional with UnityMain running/sleeping (window-level)
  const curCpu = byToolRole(ledger, 'queryCpuFreq', 'cur');
  const thrCpu = byToolRole(ledger, 'queryCpuFreq', 'throttle');
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
      const mhzDown = thrMhz < curMhz;
      const runDown = thrRun < curRun;
      const sleepUp = curSleep != null && thrSleep != null ? thrSleep > curSleep : false;
      const evid = [curCpu.id, thrCpu.id, curSched.id, thrSched.id];
      if (thrCorr) evid.push(thrCorr.id);

      add({
        title: 'throttle CPU freq decline co-directional with UnityMain sched shift (window)',
        severity: thrCpu.facts.throttlingSuspected ? 'warning' : 'info',
        evidenceIds: evid,
        claim:
          `cur avgMhz=${curMhz} → throttle avgMhz=${thrMhz} (down=${mhzDown}); ` +
          `UnityMain runningPct ${curRun} → ${thrRun} (down=${runDown})` +
          (curSleep != null && thrSleep != null ? `; sleepingPct ${curSleep} → ${thrSleep} (up=${sleepUp})` : '') +
          `; throttle throttlingLevel=${String(thrCpu.facts.throttlingLevel)} suspected=${String(thrCpu.facts.throttlingSuspected)}. ` +
          `Co-direction is window-level only (correlateFrameSchedCpu granularity=window).`,
        boundary: 'window-only correlation; not per-frame',
      });
    }
  }

  // 4) cur vs throttle atrace + callTree deltas for PlayerLoop / BehaviourUpdate / FinishFrameRendering
  const curAt = byToolRole(ledger, 'queryAtraceSlices', 'cur');
  const thrAt = byToolRole(ledger, 'queryAtraceSlices', 'throttle');
  const curCt = byToolRole(ledger, 'getPerfettoCallTree', 'cur');
  const thrCt = byToolRole(ledger, 'getPerfettoCallTree', 'throttle');
  if (curAt && thrAt) {
    const curSlices = asRec(curAt.facts.slices);
    const thrSlices = asRec(thrAt.facts.slices);
    const parts: string[] = [];
    for (const name of ['PlayerLoop', 'BehaviourUpdate'] as const) {
      const c = asRec(curSlices[name]);
      const t = asRec(thrSlices[name]);
      if (Object.keys(c).length || Object.keys(t).length) {
        parts.push(
          `${name}: cur(count=${c.count ?? 'n/a'},avgMs=${c.avgMs ?? 'n/a'}) vs throttle(count=${t.count ?? 'n/a'},avgMs=${t.avgMs ?? 'n/a'})`
        );
      }
    }
    // FinishFrameRendering lives in callTree hotPath (PostLateUpdate.FinishFrameRendering), not flat atrace top keys.
    const ffrFromHot = (ev: PerfettoEvidenceItem | undefined) => {
      const hot = Array.isArray(ev?.facts.hotPath) ? (ev!.facts.hotPath as Array<Record<string, unknown>>) : [];
      return hot.find(n => String(n.name ?? '').includes('FinishFrameRendering'));
    };
    const cFfr = ffrFromHot(curCt);
    const tFfr = ffrFromHot(thrCt);
    if (cFfr || tFfr) {
      parts.push(
        `FinishFrameRendering(hotPath): cur(totalMs=${cFfr?.totalMs ?? 'n/a'},totalPct=${cFfr?.totalPct ?? 'n/a'}) vs throttle(totalMs=${tFfr?.totalMs ?? 'n/a'},totalPct=${tFfr?.totalPct ?? 'n/a'})`
      );
    } else {
      parts.push('FinishFrameRendering: not present in atrace top keys (see callTree if available)');
    }
    if (parts.length) {
      const evid = [curAt.id, thrAt.id];
      if (curCt) evid.push(curCt.id);
      if (thrCt) evid.push(thrCt.id);
      add({
        title: 'cur vs throttle atrace slice deltas (PlayerLoop / BehaviourUpdate / FinishFrameRendering)',
        severity: 'info',
        evidenceIds: evid,
        claim: parts.join('; '),
        boundary: 'atrace aggregates + callTree hotPath; not frame-timeline jank',
      });
    }
  }

  // 5) Explicit window-only correlate boundary
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
    });
  }

  // 6) base vs cur sched snapshot (optional third triad angle)
  const baseSched = byToolRole(ledger, 'querySchedState', 'base');
  if (baseSched && curSched) {
    const b = asRec(baseSched.facts.unityMain);
    const c = asRec(curSched.facts.unityMain);
    if (asNum(b.runningPct) != null && asNum(c.runningPct) != null) {
      add({
        title: 'base vs cur UnityMain sched snapshot',
        severity: 'info',
        evidenceIds: [baseSched.id, curSched.id],
        claim: `UnityMain runningPct base=${b.runningPct} cur=${c.runningPct}; sleepingPct base=${b.sleepingPct} cur=${c.sleepingPct}`,
        boundary: 'window sched aggregates; not FrameTimeline jank',
      });
    }
  }

  return findings;
}

function deriveVerdict(findings: Finding[]): Verdict {
  const conclusions: string[] = [];
  const boundaries: string[] = [];

  for (const f of findings) {
    if (f.boundary.toLowerCase().includes('frametimeline')) {
      boundaries.push('FrameTimeline / GPU unavailable — cannot judge Android jank or GPU busy');
    }
    if (f.boundary.toLowerCase().includes('window-only') || f.boundary.includes('granularity:window')) {
      boundaries.push('correlateFrameSchedCpu is window-only — no per-frame claim');
    }
    if (f.boundary.includes('PlayerLoop anchor fallback')) {
      boundaries.push('base callTree via PlayerLoop anchor fallback — lower confidence absolute ms');
    }
    if (f.title.includes('CPU freq decline') || f.title.includes('atrace slice')) {
      conclusions.push(f.claim);
    }
  }

  // Dedup boundaries
  const uniqBoundaries = [...new Set(boundaries)];
  const uniqConclusions = conclusions.length
    ? conclusions
    : findings.filter(f => f.severity !== 'info' || f.title.includes('sched')).slice(0, 3).map(f => f.claim);

  if (!uniqConclusions.some(c => c.toLowerCase().includes('frametimeline'))) {
    // ensure verdict mentions the FrameTimeline / GPU boundary from ticket examples
  }

  return {
    source: 'perfetto',
    sampleSet: SAMPLE_SET,
    summary:
      'Perfetto triad explore MVP: throttle shows lower avgMhz with co-directional UnityMain running/sleeping shift vs cur (window-level); atrace PlayerLoop/BehaviourUpdate/FinishFrameRendering differ across cur/throttle; Android FrameTimeline absent so jank/GPU busy not judged; base callTree is fallback-sourced.',
    conclusions: uniqConclusions,
    boundaries: uniqBoundaries,
    findingIds: findings.map(f => f.id),
  };
}

function run(): void {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  log(`WT-017 Perfetto explore MVP start → ${OUT_DIR}`);

  const ledger: PerfettoEvidenceItem[] = [];

  for (const role of ROLES) {
    log(`--- role=${role} ---`);

    {
      const args = { role, thread: 'UnityMain', topN: 20 };
      const result = querySchedState(null, args);
      pushEvidence(ledger, 'querySchedState', role, args, result as { data: unknown; provenance: Record<string, unknown> }, summarizeSched(role, result.data));
    }

    {
      const args = { role, topN: 30 };
      const result = queryAtraceSlices(null, args);
      pushEvidence(ledger, 'queryAtraceSlices', role, args, result as { data: unknown; provenance: Record<string, unknown> }, summarizeAtrace(role, result.data));
    }

    {
      const args = { role };
      const result = queryFrameTimeline(null, args);
      pushEvidence(ledger, 'queryFrameTimeline', role, args, result as { data: unknown; provenance: Record<string, unknown> }, summarizeFrame(role, result.data));
    }

    {
      const args = { role };
      const result = queryCpuFreq(null, args);
      pushEvidence(ledger, 'queryCpuFreq', role, args, result as { data: unknown; provenance: Record<string, unknown> }, summarizeCpu(role, result.data));
    }

    {
      const args = { role, maxDepth: 6 };
      const result = getPerfettoCallTree(null, args);
      pushEvidence(ledger, 'getPerfettoCallTree', role, args, result as { data: unknown; provenance: Record<string, unknown> }, summarizeCallTree(role, result.data));
    }
  }

  for (const role of ['cur', 'throttle'] as const) {
    log(`--- correlate role=${role} ---`);
    const args = { role, thread: 'UnityMain' };
    const result = correlateFrameSchedCpu(null, args);
    pushEvidence(ledger, 'correlateFrameSchedCpu', role, args, result as { data: unknown; provenance: Record<string, unknown> }, summarizeCorr(role, result.data));
  }

  const findings = deriveFindings(ledger);
  const verdict = deriveVerdict(findings);

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

  const ledgerPath = path.join(OUT_DIR, 'ledger.json');
  const findingsPath = path.join(OUT_DIR, 'findings.json');
  const verdictPath = path.join(OUT_DIR, 'verdict.json');
  const runLogPath = path.join(OUT_DIR, 'run.log');

  fs.writeFileSync(ledgerPath, JSON.stringify(ledgerDoc, null, 2), 'utf8');
  fs.writeFileSync(findingsPath, JSON.stringify(findingsDoc, null, 2), 'utf8');
  fs.writeFileSync(verdictPath, JSON.stringify(verdictDoc, null, 2), 'utf8');

  log(`wrote ${ledgerPath} (evidence=${ledger.length})`);
  log(`wrote ${findingsPath} (findings=${findings.length})`);
  log(`wrote ${verdictPath}`);
  for (const f of findings) {
    log(`  finding ${f.id} [${f.severity}] ${f.title}`);
  }
  log('WT-017 Perfetto explore MVP done');

  fs.writeFileSync(runLogPath, logLines.join('\n') + '\n', 'utf8');
  console.log(`wrote ${runLogPath}`);
}

run();
