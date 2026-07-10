/**
 * tools.cli.ts — thin CLI dispatcher for Prism query tools
 *
 * Usage (from web/ directory):
 *   node --import tsx server/prism/tools.cli.ts <toolName> '<jsonArgs>'
 *
 * toolName: queryMarkers | scanMetricOverFrames | getFrameCallTree |
 *           getThreadTimeline | correlateFrameSets |
 *           scanPeakMarkers | queryFrameCounters | aggregateSubtree |
 *           drillDownMarker | getSourceForSymbol
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
} from './tools.js';
import type Database from 'better-sqlite3';

const DEFAULT_RUN_ID = 'unity-outside-stressmove';

const TOOLS: Record<string, (db: Database.Database, args: Record<string, unknown>) => unknown> = {
  queryMarkers:          (db, a) => queryMarkers(db, a as Parameters<typeof queryMarkers>[1]),
  scanMetricOverFrames:  (db, a) => scanMetricOverFrames(db, a as Parameters<typeof scanMetricOverFrames>[1]),
  getFrameCallTree:      (db, a) => getFrameCallTree(db, a as Parameters<typeof getFrameCallTree>[1]),
  getThreadTimeline:     (db, a) => getThreadTimeline(db, a as Parameters<typeof getThreadTimeline>[1]),
  correlateFrameSets:    (db, a) => correlateFrameSets(db, a as Parameters<typeof correlateFrameSets>[1]),
  scanPeakMarkers:       (db, a) => scanPeakMarkers(db, a as Parameters<typeof scanPeakMarkers>[1]),
  queryFrameCounters:    (db, a) => queryFrameCounters(db, a as Parameters<typeof queryFrameCounters>[1]),
  aggregateSubtree:      (db, a) => aggregateSubtree(db, a as Parameters<typeof aggregateSubtree>[1]),
  drillDownMarker:       (db, a) => drillDownMarker(db, a as Parameters<typeof drillDownMarker>[1]),
  getSourceForSymbol:    (db, a) => getSourceForSymbol(db, a as Parameters<typeof getSourceForSymbol>[1]),
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

if (!toolName || (toolName !== 'batch' && !TOOLS[toolName])) {
  console.error(`Unknown tool: ${toolName ?? '(none)'}`);
  usage();
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
  const db = openPrismDb();
  const results: unknown[] = [];
  try {
    for (const item of batch) {
      const t = item?.tool;
      const a: Record<string, unknown> = { ...(item?.args ?? {}) };
      if (!a.runId) a.runId = DEFAULT_RUN_ID;
      if (!t || !TOOLS[t]) {
        results.push({ tool: t ?? '(none)', args: a, ok: false, error: `Unknown tool: ${t ?? '(none)'}` });
        continue;
      }
      try {
        const out = TOOLS[t](db, a) as { data?: unknown };
        // tools return { data, provenance }; surface data + keep provenance
        results.push({ tool: t, args: a, ok: true, result: out });
      } catch (err) {
        results.push({ tool: t, args: a, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    console.log(JSON.stringify(results, null, 2));
  } finally {
    db.close();
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

// Inject default runId
if (!args.runId) args.runId = DEFAULT_RUN_ID;

const db = openPrismDb();
try {
  const result = TOOLS[toolName](db, args);
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error('Tool error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
} finally {
  db.close();
}
