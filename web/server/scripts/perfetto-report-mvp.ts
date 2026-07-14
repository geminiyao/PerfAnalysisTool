/**
 * WT-018 · Perfetto narrative.json + report.html MVP
 *
 * Reads WT-017 explore products (ledger / findings / verdict) only.
 * Does NOT re-run explore, provider build, or LLM.
 * Does NOT invent numbers without provenance.
 *
 * Usage (from web/):
 *   node --import tsx server/scripts/perfetto-report-mvp.ts
 *
 * Outputs → web/data/prism-out/bk26b-perfetto-report-mvp/
 *   narrative.json | report.html | audit.json | run.log
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── types (mirror WT-017 shapes; thin local, no Unity NarrativeReport coupling) ──

type Role = 'base' | 'cur' | 'throttle';

interface LedgerEvidence {
  id: string;
  tool: string;
  role: Role;
  args: Record<string, unknown>;
  provenance: Record<string, unknown>;
  summary: string;
  dataRefs?: string[];
  facts: Record<string, unknown>;
}

interface LedgerFile {
  source: string;
  sampleSet: string;
  generatedAt: string;
  evidenceCount: number;
  evidence: LedgerEvidence[];
}

interface Finding {
  id: string;
  title: string;
  severity: string;
  evidenceIds: string[];
  claim: string;
  boundary: string;
}

interface FindingsFile {
  source: string;
  sampleSet: string;
  generatedAt: string;
  findings: Finding[];
}

interface VerdictFile {
  source: string;
  sampleSet: string;
  summary: string;
  conclusions: string[];
  boundaries: string[];
  findingIds: string[];
  generatedAt: string;
}

interface HotPathNode {
  name: string;
  totalMs?: number;
  totalPct?: number;
}

interface PerfettoNarrative {
  source: 'perfetto';
  sampleSet: 'bk26b-perfetto-triad';
  generatedAt: string;
  overview: string;
  topConclusions: Array<{
    rank: number;
    problem: string;
    kind: string;
    contribution: string;
    severity: string;
    evidenceIds: string[];
    findingIds: string[];
  }>;
  findings: Array<{
    id: string;
    title: string;
    severity: string;
    claim: string;
    boundary: string;
    evidenceIds: string[];
  }>;
  evidenceSummary: Array<{
    id: string;
    tool: string;
    role: string;
    summary: string;
    runId?: string;
  }>;
  capabilityBoundaries: string[];
  triadComparison: {
    sched: Record<Role, { runningPct: number | null; sleepingPct: number | null; evidenceId: string }>;
    atrace: Record<Role, { playerLoopAvgMs: number | null; playerLoopCount: number | null; behaviourAvgMs: number | null; evidenceId: string }>;
    cpu: Record<Role, { avgMhz: number | null; bigCoreReachPct: number | null; throttlingLevel: string | null; evidenceId: string }>;
    frame: Record<Role, { androidFrameTimelineAvailable: boolean | null; choreographerAvailable: boolean | null; evidenceId: string }>;
  };
  callTrees: Record<Role, {
    available: boolean;
    viaPlayerLoopAnchorFallback: boolean;
    note: string;
    hotPath: HotPathNode[];
    evidenceId: string;
  }>;
  inputProvenance: {
    exploreDir: string;
    ledgerGeneratedAt: string;
    findingsGeneratedAt: string;
    verdictGeneratedAt: string;
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '../..');
const EXPLORE_DIR = path.join(WEB_ROOT, 'data/prism-out/bk26b-perfetto-explore-mvp');
const OUT_DIR = path.join(WEB_ROOT, 'data/prism-out/bk26b-perfetto-report-mvp');
const ROLES: Role[] = ['base', 'cur', 'throttle'];

const logLines: string[] = [];

function log(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}`;
  logLines.push(line);
  console.log(msg);
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function asNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asRec(v: unknown): Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function htmlEsc(s: unknown): string {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

function evidenceByToolRole(ledger: LedgerFile, tool: string, role: Role): LedgerEvidence | undefined {
  return ledger.evidence.find((e) => e.tool === tool && e.role === role);
}

function buildNarrative(
  ledger: LedgerFile,
  findingsFile: FindingsFile,
  verdict: VerdictFile,
): PerfettoNarrative {
  const triadComparison: PerfettoNarrative['triadComparison'] = {
    sched: {} as PerfettoNarrative['triadComparison']['sched'],
    atrace: {} as PerfettoNarrative['triadComparison']['atrace'],
    cpu: {} as PerfettoNarrative['triadComparison']['cpu'],
    frame: {} as PerfettoNarrative['triadComparison']['frame'],
  };

  const callTrees = {} as PerfettoNarrative['callTrees'];

  for (const role of ROLES) {
    const schedEv = evidenceByToolRole(ledger, 'querySchedState', role);
    const um = asRec(asRec(schedEv?.facts).unityMain);
    triadComparison.sched[role] = {
      runningPct: asNum(um.runningPct),
      sleepingPct: asNum(um.sleepingPct),
      evidenceId: schedEv?.id ?? `missing-sched-${role}`,
    };

    const atraceEv = evidenceByToolRole(ledger, 'queryAtraceSlices', role);
    const slices = asRec(asRec(atraceEv?.facts).slices);
    const pl = asRec(slices.PlayerLoop);
    const bu = asRec(slices.BehaviourUpdate);
    triadComparison.atrace[role] = {
      playerLoopAvgMs: asNum(pl.avgMs),
      playerLoopCount: asNum(pl.count),
      behaviourAvgMs: asNum(bu.avgMs),
      evidenceId: atraceEv?.id ?? `missing-atrace-${role}`,
    };

    const cpuEv = evidenceByToolRole(ledger, 'queryCpuFreq', role);
    const cpuFacts = asRec(cpuEv?.facts);
    triadComparison.cpu[role] = {
      avgMhz: asNum(cpuFacts.avgMhz),
      bigCoreReachPct: asNum(cpuFacts.bigCoreReachPct),
      throttlingLevel: typeof cpuFacts.throttlingLevel === 'string' ? cpuFacts.throttlingLevel : null,
      evidenceId: cpuEv?.id ?? `missing-cpu-${role}`,
    };

    const frameEv = evidenceByToolRole(ledger, 'queryFrameTimeline', role);
    const frameFacts = asRec(frameEv?.facts);
    triadComparison.frame[role] = {
      androidFrameTimelineAvailable: typeof frameFacts.androidFrameTimelineAvailable === 'boolean'
        ? frameFacts.androidFrameTimelineAvailable
        : null,
      choreographerAvailable: typeof frameFacts.choreographerAvailable === 'boolean'
        ? frameFacts.choreographerAvailable
        : null,
      evidenceId: frameEv?.id ?? `missing-frame-${role}`,
    };

    const treeEv = evidenceByToolRole(ledger, 'getPerfettoCallTree', role);
    const treeFacts = asRec(treeEv?.facts);
    const available = treeFacts.available === true;
    const viaFallback = treeFacts.viaPlayerLoopAnchorFallback === true;
    const hotPathRaw = Array.isArray(treeFacts.hotPath) ? treeFacts.hotPath : [];
    const hotPath: HotPathNode[] = hotPathRaw.map((n) => {
      const node = asRec(n);
      return {
        name: String(node.name ?? '?'),
        totalMs: asNum(node.totalMs) ?? undefined,
        totalPct: asNum(node.totalPct) ?? undefined,
      };
    });

    let note = '';
    if (!available || hotPath.length === 0) {
      note = 'callTree unavailable';
    } else if (viaFallback) {
      note = 'via PlayerLoop anchor fallback — absolute ms lower-confidence vs cur/throttle native roots';
    } else {
      note = 'native callTree root';
    }

    callTrees[role] = {
      available: available && hotPath.length > 0,
      viaPlayerLoopAnchorFallback: viaFallback,
      note,
      hotPath,
      evidenceId: treeEv?.id ?? `missing-calltree-${role}`,
    };
  }

  // Top conclusions from verdict + finding ids (preserve evidence chain)
  const findingById = new Map(findingsFile.findings.map((f) => [f.id, f]));
  const topConclusions = verdict.conclusions.slice(0, 5).map((text, i) => {
    // Map verdict conclusion lines to primary findings by order in findingIds when possible
    const primaryFindingId = verdict.findingIds[i] ?? verdict.findingIds[0];
    const finding = findingById.get(primaryFindingId);
    // Prefer semantic match for the two known verdict conclusion lines
    let findingIds = finding ? [finding.id] : [];
    let evidenceIds = finding?.evidenceIds ?? [];
    let severity = finding?.severity ?? 'info';
    let kind = 'window triad';
    if (i === 0) {
      const f = findingById.get('f-03');
      if (f) {
        findingIds = [f.id, 'f-05'];
        evidenceIds = f.evidenceIds;
        severity = f.severity;
        kind = 'CPU + sched (window)';
      }
    } else if (i === 1) {
      const f = findingById.get('f-04');
      if (f) {
        findingIds = [f.id];
        evidenceIds = f.evidenceIds;
        severity = f.severity;
        kind = 'atrace + hotPath';
      }
    }
    return {
      rank: i + 1,
      problem: text.slice(0, 120) + (text.length > 120 ? '…' : ''),
      kind,
      contribution: text,
      severity,
      evidenceIds,
      findingIds,
    };
  });

  // Append boundary-aware conclusions so we hit 3–5 cards
  const extraFromFindings = ['f-01', 'f-02', 'f-06']
    .map((id) => findingById.get(id))
    .filter((f): f is Finding => !!f)
    .slice(0, Math.max(0, 5 - topConclusions.length));

  for (const f of extraFromFindings) {
    topConclusions.push({
      rank: topConclusions.length + 1,
      problem: f.title,
      kind: 'boundary / snapshot',
      contribution: f.claim,
      severity: f.severity,
      evidenceIds: f.evidenceIds,
      findingIds: [f.id],
    });
  }

  const evidenceSummary = ledger.evidence.map((e) => ({
    id: e.id,
    tool: e.tool,
    role: e.role,
    summary: e.summary,
    runId: typeof e.provenance.runId === 'string' ? e.provenance.runId : undefined,
  }));

  return {
    source: 'perfetto',
    sampleSet: 'bk26b-perfetto-triad',
    generatedAt: new Date().toISOString(),
    overview: verdict.summary,
    topConclusions: topConclusions.slice(0, 5),
    findings: findingsFile.findings.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      claim: f.claim,
      boundary: f.boundary,
      evidenceIds: f.evidenceIds,
    })),
    evidenceSummary,
    capabilityBoundaries: [...verdict.boundaries],
    triadComparison,
    callTrees,
    inputProvenance: {
      exploreDir: 'web/data/prism-out/bk26b-perfetto-explore-mvp',
      ledgerGeneratedAt: ledger.generatedAt,
      findingsGeneratedAt: findingsFile.generatedAt,
      verdictGeneratedAt: verdict.generatedAt,
    },
  };
}

function pctBar(pct: number | null, max = 100): string {
  if (pct == null || !Number.isFinite(pct)) return '';
  const w = Math.max(0, Math.min(100, (pct / max) * 100));
  return `<div class="bar"><div class="bar-fill" style="width:${w.toFixed(1)}%"></div><span>${fmtNum(pct, 1)}%</span></div>`;
}

function mhzBar(mhz: number | null, max = 2000): string {
  if (mhz == null || !Number.isFinite(mhz)) return '';
  const w = Math.max(0, Math.min(100, (mhz / max) * 100));
  return `<div class="bar"><div class="bar-fill mhz" style="width:${w.toFixed(1)}%"></div><span>${fmtNum(mhz, 1)}</span></div>`;
}

function sevClass(sev: string): string {
  if (sev === 'critical' || sev === 'warning') return sev;
  return 'info';
}

function renderHotPath(role: Role, tree: PerfettoNarrative['callTrees'][Role]): string {
  const badge = tree.viaPlayerLoopAnchorFallback
    ? '<span class="badge warn">fallback</span>'
    : tree.available
      ? '<span class="badge ok">native</span>'
      : '<span class="badge miss">unavailable</span>';

  if (!tree.available || tree.hotPath.length === 0) {
    return `
      <div class="card hotpath-card">
        <h3>${role} ${badge}</h3>
        <p class="muted"><strong>callTree unavailable</strong></p>
        <p class="ev">evidence: <code>${htmlEsc(tree.evidenceId)}</code></p>
      </div>`;
  }

  const rows = tree.hotPath.map((n, i) => {
    const indent = '&nbsp;'.repeat(i * 2);
    const pct = n.totalPct ?? 0;
    return `<tr>
      <td class="mono">${indent}${htmlEsc(n.name)}</td>
      <td class="num">${n.totalMs != null ? fmtNum(n.totalMs, 2) : '—'}</td>
      <td>${pctBar(n.totalPct)}</td>
    </tr>`;
  }).join('\n');

  // Top children = nodes after root on hot path (ledger has no separate topChildren)
  const topChildren = tree.hotPath.slice(1, 5);
  const childList = topChildren.map((n) =>
    `<li><code>${htmlEsc(n.name)}</code> — ${n.totalMs != null ? fmtNum(n.totalMs, 2) + ' ms' : '—'} (${fmtNum(n.totalPct, 1)}%)</li>`,
  ).join('\n');

  return `
    <div class="card hotpath-card">
      <h3>${role} ${badge}</h3>
      <p class="note">${htmlEsc(tree.note)}</p>
      <p class="ev">evidence: <code>${htmlEsc(tree.evidenceId)}</code></p>
      <h4>Hot path</h4>
      <table class="compact">
        <thead><tr><th>marker</th><th>totalMs</th><th>totalPct</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <h4>Top children (along hot path)</h4>
      <ul class="child-list">${childList}</ul>
    </div>`;
}

function renderHtml(n: PerfettoNarrative): string {
  const conclusionCards = n.topConclusions.map((c) => `
    <div class="card conclusion ${sevClass(c.severity)}">
      <div class="rank">#${c.rank}</div>
      <div class="body">
        <div class="meta"><span class="kind">${htmlEsc(c.kind)}</span> · <span class="sev">${htmlEsc(c.severity)}</span></div>
        <p>${htmlEsc(c.contribution)}</p>
        <div class="ev">
          findings: ${c.findingIds.map((id) => `<code>${htmlEsc(id)}</code>`).join(' ')}
          · evidence: ${c.evidenceIds.map((id) => `<code>${htmlEsc(id)}</code>`).join(' ')}
        </div>
      </div>
    </div>`).join('\n');

  const findingCards = n.findings.map((f) => `
    <div class="card finding ${sevClass(f.severity)}" id="${htmlEsc(f.id)}">
      <h3><code>${htmlEsc(f.id)}</code> ${htmlEsc(f.title)}</h3>
      <div class="meta"><span class="sev">${htmlEsc(f.severity)}</span></div>
      <p>${htmlEsc(f.claim)}</p>
      <p class="boundary">boundary: ${htmlEsc(f.boundary)}</p>
      <div class="ev">evidence: ${f.evidenceIds.map((id) => `<a href="#${htmlEsc(id)}"><code>${htmlEsc(id)}</code></a>`).join(' ')}</div>
    </div>`).join('\n');

  const tc = n.triadComparison;
  const triadRows = `
    <tr>
      <td>sched · UnityMain runningPct</td>
      ${ROLES.map((r) => `<td>${pctBar(tc.sched[r].runningPct)}<div class="ev-mini"><code>${htmlEsc(tc.sched[r].evidenceId)}</code></div></td>`).join('')}
    </tr>
    <tr>
      <td>sched · UnityMain sleepingPct</td>
      ${ROLES.map((r) => `<td>${pctBar(tc.sched[r].sleepingPct)}<div class="ev-mini"><code>${htmlEsc(tc.sched[r].evidenceId)}</code></div></td>`).join('')}
    </tr>
    <tr>
      <td>atrace · PlayerLoop avgMs (count)</td>
      ${ROLES.map((r) => `<td>${fmtNum(tc.atrace[r].playerLoopAvgMs, 3)} ms<br/><span class="muted">n=${fmtNum(tc.atrace[r].playerLoopCount, 0)}</span><div class="ev-mini"><code>${htmlEsc(tc.atrace[r].evidenceId)}</code></div></td>`).join('')}
    </tr>
    <tr>
      <td>atrace · BehaviourUpdate avgMs</td>
      ${ROLES.map((r) => `<td>${fmtNum(tc.atrace[r].behaviourAvgMs, 3)} ms<div class="ev-mini"><code>${htmlEsc(tc.atrace[r].evidenceId)}</code></div></td>`).join('')}
    </tr>
    <tr>
      <td>cpu · avgMhz</td>
      ${ROLES.map((r) => `<td>${mhzBar(tc.cpu[r].avgMhz)}<div class="ev-mini"><code>${htmlEsc(tc.cpu[r].evidenceId)}</code></div></td>`).join('')}
    </tr>
    <tr>
      <td>cpu · bigCoreReachPct / throttling</td>
      ${ROLES.map((r) => `<td>${fmtNum(tc.cpu[r].bigCoreReachPct, 1)}%<br/><span class="muted">${htmlEsc(tc.cpu[r].throttlingLevel ?? '—')}</span><div class="ev-mini"><code>${htmlEsc(tc.cpu[r].evidenceId)}</code></div></td>`).join('')}
    </tr>
    <tr>
      <td>frame · Android FrameTimeline</td>
      ${ROLES.map((r) => {
        const avail = tc.frame[r].androidFrameTimelineAvailable;
        const label = avail === true ? 'available' : avail === false ? 'unavailable' : '—';
        return `<td><span class="badge ${avail === false ? 'miss' : avail === true ? 'ok' : ''}">${label}</span><div class="ev-mini"><code>${htmlEsc(tc.frame[r].evidenceId)}</code></div></td>`;
      }).join('')}
    </tr>`;

  const hotPathBlocks = ROLES.map((r) => renderHotPath(r, n.callTrees[r])).join('\n');

  const boundaryList = n.capabilityBoundaries.map((b) => `<li>${htmlEsc(b)}</li>`).join('\n');

  const evidenceRows = n.evidenceSummary.map((e) => `
    <tr id="${htmlEsc(e.id)}">
      <td><code>${htmlEsc(e.id)}</code></td>
      <td><code>${htmlEsc(e.tool)}</code></td>
      <td>${htmlEsc(e.role)}</td>
      <td class="mono">${htmlEsc(e.runId ?? '—')}</td>
      <td>${htmlEsc(e.summary)}</td>
    </tr>`).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Perfetto Triad Report · bk26b-perfetto-triad</title>
<style>
  :root {
    --bg: #0f1419;
    --card: #1a2332;
    --border: #2a3a4a;
    --text: #e6edf3;
    --muted: #8b9cb3;
    --accent: #3d8bfd;
    --ok: #3fb950;
    --warn: #d29922;
    --miss: #f85149;
    --info: #58a6ff;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    background: linear-gradient(160deg, #0f1419 0%, #152030 50%, #0f1419 100%);
    color: var(--text); line-height: 1.55;
  }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 32px 20px 64px; }
  header.hero {
    margin-bottom: 28px; padding-bottom: 20px;
    border-bottom: 1px solid var(--border);
  }
  header.hero h1 { margin: 0 0 8px; font-size: 1.75rem; font-weight: 650; letter-spacing: -0.02em; }
  header.hero .sub { color: var(--muted); font-size: 0.95rem; }
  .pill {
    display: inline-block; padding: 2px 10px; border-radius: 4px;
    background: #213047; color: var(--accent); font-size: 0.8rem; margin-right: 6px;
  }
  section { margin: 28px 0; }
  section > h2 {
    font-size: 1.15rem; margin: 0 0 14px; padding-left: 10px;
    border-left: 3px solid var(--accent);
  }
  .card {
    background: var(--card); border: 1px solid var(--border);
    border-radius: 8px; padding: 14px 16px; margin-bottom: 12px;
  }
  .card.conclusion { display: flex; gap: 14px; }
  .card.conclusion .rank {
    flex: 0 0 40px; font-weight: 700; font-size: 1.1rem; color: var(--accent);
  }
  .card.warning { border-left: 3px solid var(--warn); }
  .card.critical { border-left: 3px solid var(--miss); }
  .card.info { border-left: 3px solid var(--info); }
  .meta { color: var(--muted); font-size: 0.82rem; margin-bottom: 6px; }
  .ev, .ev-mini { color: var(--muted); font-size: 0.78rem; margin-top: 8px; }
  .ev-mini { margin-top: 4px; }
  .boundary { color: var(--warn); font-size: 0.88rem; }
  .muted { color: var(--muted); }
  .note { font-size: 0.9rem; color: var(--muted); }
  code {
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: 0.82em; background: #0d1117; padding: 1px 5px; border-radius: 3px;
  }
  .mono { font-family: ui-monospace, Consolas, monospace; font-size: 0.88rem; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  table {
    width: 100%; border-collapse: collapse; background: var(--card);
    border: 1px solid var(--border); border-radius: 8px; overflow: hidden;
  }
  th, td { padding: 10px 12px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
  th { background: #213047; font-size: 0.85rem; color: var(--muted); font-weight: 600; }
  table.compact td, table.compact th { padding: 6px 10px; font-size: 0.88rem; }
  .bar {
    display: flex; align-items: center; gap: 8px; min-width: 120px;
  }
  .bar-fill {
    height: 8px; background: var(--accent); border-radius: 2px; min-width: 2px;
  }
  .bar-fill.mhz { background: #a371f7; }
  .badge {
    display: inline-block; padding: 1px 8px; border-radius: 3px; font-size: 0.75rem;
    background: #213047; color: var(--muted);
  }
  .badge.ok { color: var(--ok); background: #16331f; }
  .badge.warn { color: var(--warn); background: #3d2e0a; }
  .badge.miss { color: var(--miss); background: #3d1214; }
  .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
  .child-list { margin: 6px 0 0; padding-left: 18px; font-size: 0.88rem; }
  .overview { font-size: 0.98rem; color: var(--text); }
  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }
  footer { margin-top: 40px; color: var(--muted); font-size: 0.8rem; border-top: 1px solid var(--border); padding-top: 16px; }
</style>
</head>
<body>
<div class="wrap">
  <header class="hero">
    <h1>Perfetto Triad Report</h1>
    <p class="sub">
      <span class="pill">source: perfetto</span>
      <span class="pill">sampleSet: bk26b-perfetto-triad</span>
      <span class="pill">window-level</span>
    </p>
    <p class="sub">样本：base / cur / throttle · 窗口级 Perfetto 分析（非逐帧）。输入来自 WT-017 ledger / findings / verdict。</p>
  </header>

  <section>
    <h2>概览</h2>
    <div class="card"><p class="overview">${htmlEsc(n.overview)}</p></div>
  </section>

  <section>
    <h2>顶部结论</h2>
    ${conclusionCards}
  </section>

  <section>
    <h2>三态对照表 · sched / atrace / cpu / frame</h2>
    <table>
      <thead>
        <tr><th>metric</th><th>base</th><th>cur</th><th>throttle</th></tr>
      </thead>
      <tbody>
        ${triadRows}
      </tbody>
    </table>
  </section>

  <section>
    <h2>Findings</h2>
    ${findingCards}
  </section>

  <section>
    <h2>CallTree / Hot Path 聚焦</h2>
    <p class="muted">cur / throttle 显示 hot path 与沿路 Top children；base 若为 PlayerLoop anchor fallback，绝对 ms 按低置信处理。无树时标 callTree unavailable。</p>
    <div class="grid-3">
      ${hotPathBlocks}
    </div>
  </section>

  <section>
    <h2>能力边界</h2>
    <div class="card">
      <ul>
        ${boundaryList}
        <li>无 Android FrameTimeline → 不判断 jank。</li>
        <li>无 GPU 计数 → 不判断 GPU busy。</li>
        <li>thermal / 降频仍为 <strong>suspected</strong>（非 confirmed）。</li>
        <li>correlateFrameSchedCpu granularity=window → 不声称逐帧相关。</li>
      </ul>
    </div>
  </section>

  <section>
    <h2>审计 / 证据入口</h2>
    <p class="muted">evidence id · tool · role · runId · summary（全部来自 WT-017 ledger）</p>
    <table class="compact">
      <thead>
        <tr><th>id</th><th>tool</th><th>role</th><th>runId</th><th>summary</th></tr>
      </thead>
      <tbody>
        ${evidenceRows}
      </tbody>
    </table>
  </section>

  <footer>
    generatedAt: ${htmlEsc(n.generatedAt)} ·
    input: ${htmlEsc(n.inputProvenance.exploreDir)}
    (ledger ${htmlEsc(n.inputProvenance.ledgerGeneratedAt)}) ·
    WT-018 MVP · no FrameTimeline jank / no GPU busy / no per-frame claim
  </footer>
</div>
</body>
</html>`;
}

function main(): void {
  log('WT-018 Perfetto report MVP start');
  log(`explore dir: ${EXPLORE_DIR}`);
  log(`out dir: ${OUT_DIR}`);

  const ledgerPath = path.join(EXPLORE_DIR, 'ledger.json');
  const findingsPath = path.join(EXPLORE_DIR, 'findings.json');
  const verdictPath = path.join(EXPLORE_DIR, 'verdict.json');

  for (const p of [ledgerPath, findingsPath, verdictPath]) {
    if (!fs.existsSync(p)) {
      throw new Error(`Missing WT-017 input: ${p}`);
    }
  }

  const ledger = readJson<LedgerFile>(ledgerPath);
  const findingsFile = readJson<FindingsFile>(findingsPath);
  const verdict = readJson<VerdictFile>(verdictPath);

  log(`loaded ledger evidence=${ledger.evidenceCount} findings=${findingsFile.findings.length}`);

  if (ledger.source !== 'perfetto' || findingsFile.source !== 'perfetto' || verdict.source !== 'perfetto') {
    throw new Error('Input source must be perfetto');
  }

  const narrative = buildNarrative(ledger, findingsFile, verdict);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const narrativePath = path.join(OUT_DIR, 'narrative.json');
  const htmlPath = path.join(OUT_DIR, 'report.html');
  const auditPath = path.join(OUT_DIR, 'audit.json');

  fs.writeFileSync(narrativePath, JSON.stringify(narrative, null, 2), 'utf8');
  log(`wrote ${narrativePath}`);

  const html = renderHtml(narrative);
  fs.writeFileSync(htmlPath, html, 'utf8');
  log(`wrote ${htmlPath}`);

  const audit = {
    script: 'server/scripts/perfetto-report-mvp.ts',
    ticket: 'WT-018',
    generatedAt: narrative.generatedAt,
    inputs: {
      ledger: ledgerPath,
      findings: findingsPath,
      verdict: verdictPath,
      ledgerEvidenceCount: ledger.evidenceCount,
      findingCount: findingsFile.findings.length,
    },
    outputs: {
      narrative: narrativePath,
      reportHtml: htmlPath,
    },
    provenancePolicy: 'All narrative numbers/claims derive from WT-017 ledger/findings/verdict; no ungoverned summary rewrite.',
    capabilityBoundaries: narrative.capabilityBoundaries,
    callTreeNotes: Object.fromEntries(
      ROLES.map((r) => [r, {
        available: narrative.callTrees[r].available,
        viaPlayerLoopAnchorFallback: narrative.callTrees[r].viaPlayerLoopAnchorFallback,
        note: narrative.callTrees[r].note,
        evidenceId: narrative.callTrees[r].evidenceId,
      }]),
    ),
  };
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');
  log(`wrote ${auditPath}`);

  const runLogPath = path.join(OUT_DIR, 'run.log');
  fs.writeFileSync(runLogPath, logLines.join('\n') + '\n', 'utf8');
  log(`wrote ${runLogPath}`);
  log('done');
}

main();
