/**
 * tools.cli.ts — thin CLI dispatcher for Prism query tools
 *
 * Usage (from web/ directory):
 *   node --import tsx server/prism/tools.cli.ts <toolName> '<jsonArgs>'
 *
 * toolName: queryMarkers | scanMetricOverFrames | getFrameCallTree |
 *           getThreadTimeline | correlateFrameSets |
 *           scanPeakMarkers | queryFrameCounters | aggregateSubtree |
 *           drillDownMarker | getSourceForSymbol |
 *           querySchedState | queryAtraceSlices | queryFrameTimeline |
 *           queryCpuFreq | getPerfettoCallTree | correlateFrameSchedCpu |
 *           queryCallTreeSubtree | querySliceDeltas | queryOffCpuAttribution |
 *           queryGcAllocByModule
 *
 * SINGLE mode:
 *   node --import tsx server/prism/tools.cli.ts single '{"tool":"querySchedState","args":{"role":"cur"}}'
 *
 * BATCH mode (amortizes tsx cold-start across many queries — MUCH faster):
 *   node --import tsx server/prism/tools.cli.ts batch '[{"tool":"queryMarkers","args":{...}}, ...]'
 *   → returns a JSON array of { tool, args, ok, data|error } in the same order.
 *
 * runId defaults to 'unity-outside-stressmove' if not provided in jsonArgs.
 */

import { openPrismDb } from './db.js';
import {
  queryMarkers,
  scanMetricOverFrames,
  getFrameCallTree,
  getThreadTimeline,
  correlateFrameSets,
  scanPeakMarkers,
  queryFrameCounters,
  aggregateSubtree,
  drillDownMarker,
  getSourceForSymbol,
  querySchedState,
  queryAtraceSlices,
  queryFrameTimeline,
  queryCpuFreq,
  getPerfettoCallTree,
  correlateFrameSchedCpu,
  queryCallTreeSubtree,
  querySliceDeltas,
  queryOffCpuAttribution,
  queryGcAllocByModule,
} from './tools.js';
import type Database from 'better-sqlite3';

const DEFAULT_RUN_ID = 'unity-outside-stressmove';

const PERFETTO_JSON_TOOL_NAMES = new Set([
  'querySchedState',
  'queryAtraceSlices',
  'queryFrameTimeline',
  'queryCpuFreq',
  'getPerfettoCallTree',
  'correlateFrameSchedCpu',
  'queryCallTreeSubtree',
  'querySliceDeltas',
  'queryOffCpuAttribution',
  'queryGcAllocByModule',
]);

type ToolRunner = (db: Database.Database | null, args: Record<string, unknown>) => unknown;

const TOOLS: Record<string, ToolRunner> = {
  queryMarkers:          (db, a) => queryMarkers(db!, a as unknown as Parameters<typeof queryMarkers>[1]),
  scanMetricOverFrames:  (db, a) => scanMetricOverFrames(db!, a as unknown as Parameters<typeof scanMetricOverFrames>[1]),
  getFrameCallTree:      (db, a) => getFrameCallTree(db!, a as unknown as Parameters<typeof getFrameCallTree>[1]),
  getThreadTimeline:     (db, a) => getThreadTimeline(db!, a as unknown as Parameters<typeof getThreadTimeline>[1]),
  correlateFrameSets:    (db, a) => correlateFrameSets(db!, a as unknown as Parameters<typeof correlateFrameSets>[1]),
  scanPeakMarkers:       (db, a) => scanPeakMarkers(db!, a as unknown as Parameters<typeof scanPeakMarkers>[1]),
  queryFrameCounters:    (db, a) => queryFrameCounters(db!, a as unknown as Parameters<typeof queryFrameCounters>[1]),
  aggregateSubtree:      (db, a) => aggregateSubtree(db!, a as unknown as Parameters<typeof aggregateSubtree>[1]),
  drillDownMarker:       (db, a) => drillDownMarker(db!, a as unknown as Parameters<typeof drillDownMarker>[1]),
  getSourceForSymbol:    (db, a) => getSourceForSymbol(db!, a as unknown as Parameters<typeof getSourceForSymbol>[1]),
  querySchedState:       (db, a) => querySchedState(db, a as unknown as Parameters<typeof querySchedState>[1]),
  queryAtraceSlices:     (db, a) => queryAtraceSlices(db, a as unknown as Parameters<typeof queryAtraceSlices>[1]),
  queryFrameTimeline:    (db, a) => queryFrameTimeline(db, a as unknown as Parameters<typeof queryFrameTimeline>[1]),
  queryCpuFreq:          (db, a) => queryCpuFreq(db, a as unknown as Parameters<typeof queryCpuFreq>[1]),
  getPerfettoCallTree:   (db, a) => getPerfettoCallTree(db, a as unknown as Parameters<typeof getPerfettoCallTree>[1]),
  correlateFrameSchedCpu:(db, a) => correlateFrameSchedCpu(db, a as unknown as Parameters<typeof correlateFrameSchedCpu>[1]),
  queryCallTreeSubtree:  (db, a) => queryCallTreeSubtree(db, a as unknown as Parameters<typeof queryCallTreeSubtree>[1]),
  querySliceDeltas:      (db, a) => querySliceDeltas(db, a as unknown as Parameters<typeof querySliceDeltas>[1]),
  queryOffCpuAttribution:(db, a) => queryOffCpuAttribution(db, a as unknown as Parameters<typeof queryOffCpuAttribution>[1]),
  queryGcAllocByModule:  (db, a) => queryGcAllocByModule(db, a as unknown as Parameters<typeof queryGcAllocByModule>[1]),
};

function usage(): never {
  console.error(
    'Usage: node --import tsx server/prism/tools.cli.ts <toolName> \'<jsonArgs>\'\n' +
    'Tools: ' + Object.keys(TOOLS).join(', ') + '\n' +
    'runId defaults to "' + DEFAULT_RUN_ID + '" if not specified in args.'
  );
  process.exit(1);
}

const [, , toolName, rawArgs] = process.argv;

if (!toolName || (toolName !== 'single' && toolName !== 'batch' && !TOOLS[toolName])) {
  console.error(`Unknown tool: ${toolName ?? '(none)'}`);
  usage();
}

function toolNeedsDb(name: string): boolean {
  return !PERFETTO_JSON_TOOL_NAMES.has(name);
}

function injectDefaultRunId(name: string, args: Record<string, unknown>): void {
  if (toolNeedsDb(name) && !args.runId) args.runId = DEFAULT_RUN_ID;
}

// ── SINGLE mode: JSON envelope { tool, args } ───────────────────────
if (toolName === 'single') {
  let item: { tool?: string; args?: Record<string, unknown> };
  try {
    item = rawArgs ? JSON.parse(rawArgs) : {};
  } catch {
    console.error('Failed to parse single args as JSON object:', rawArgs);
    process.exit(1);
  }
  const t = item.tool;
  const a: Record<string, unknown> = { ...(item.args ?? {}) };
  if (!t || !TOOLS[t]) {
    console.error(`Unknown tool: ${t ?? '(none)'}`);
    process.exit(1);
  }
  injectDefaultRunId(t, a);
  const db = toolNeedsDb(t) ? openPrismDb() : null;
  try {
    const result = TOOLS[t](db, a);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Tool error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    db?.close();
  }
  process.exit(0);
}

// ── BATCH mode: run many queries in one process (amortize tsx cold-start) ──
if (toolName === 'batch') {
  let batch: Array<{ tool: string; args?: Record<string, unknown> }>;
  try {
    batch = rawArgs ? JSON.parse(rawArgs) : [];
  } catch {
    console.error('Failed to parse batch args as JSON array:', rawArgs);
    process.exit(1);
  }
  if (!Array.isArray(batch)) {
    console.error('batch expects a JSON array of { tool, args }');
    process.exit(1);
  }
  const needsDb = batch.some(item => item?.tool && TOOLS[item.tool] && toolNeedsDb(item.tool));
  const db = needsDb ? openPrismDb() : null;
  const results: unknown[] = [];
  try {
    for (const item of batch) {
      const t = item?.tool;
      const a: Record<string, unknown> = { ...(item?.args ?? {}) };
      if (!t || !TOOLS[t]) {
        results.push({ tool: t ?? '(none)', args: a, ok: false, error: `Unknown tool: ${t ?? '(none)'}` });
        continue;
      }
      injectDefaultRunId(t, a);
      try {
        const out = TOOLS[t](toolNeedsDb(t) ? db : null, a) as { data?: unknown };
        // tools return { data, provenance }; surface data + keep provenance
        results.push({ tool: t, args: a, ok: true, result: out });
      } catch (err) {
        results.push({ tool: t, args: a, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    console.log(JSON.stringify(results, null, 2));
  } finally {
    db?.close();
  }
  process.exit(0);
}

let args: Record<string, unknown>;
try {
  args = rawArgs ? JSON.parse(rawArgs) : {};
} catch {
  console.error('Failed to parse args as JSON:', rawArgs);
  process.exit(1);
}

injectDefaultRunId(toolName, args);

const db = toolNeedsDb(toolName) ? openPrismDb() : null;
try {
  const result = TOOLS[toolName](db, args);
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error('Tool error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
} finally {
  db?.close();
}
