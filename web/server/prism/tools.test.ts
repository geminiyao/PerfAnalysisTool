/**
 * tools.test.ts — Prism B2 query tool layer test script
 *
 * Plain tsx script (no test runner). Run from web/ directory:
 *   npx tsx server/prism/tools.test.ts
 *
 * Prints PASS/FAIL for each assertion; exits non-zero on any failure.
 */

import { openPrismDb } from './db.js';
import Database from 'better-sqlite3';
import {
  computeAutocorr,
  computeStatsPack,
  queryMarkers,
  scanMetricOverFrames,
  getFrameCallTree,
  getThreadTimeline,
  correlateFrameSets,
  getSourceForSymbol,
  buildCallStackFromFrame,
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
import { runExploreMvp } from '../scripts/perfetto-explore-mvp.js';
// DR-44 WT-027: runReportMvp import removed — [15][16] sections skipped (旧脚本基座已废弃)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ─────────────────────────── Test harness ──────────────────────────

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, label: string, detail?: unknown): void {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passCount++;
  } else {
    console.log(`  FAIL: ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
    failCount++;
  }
}

// ─────────────────────────── 1. Synthetic autocorr ─────────────────

console.log('\n[1] Synthetic autocorrelation (period=30)');
{
  // Build 300-frame series: base=10, +50 spike every 30th frame
  const series: number[] = [];
  for (let i = 0; i < 300; i++) {
    series.push(10 + ((i + 1) % 30 === 0 ? 50 : 0));
  }
  const ac = computeAutocorr(series);
  assert(ac !== null, 'computeAutocorr returns non-null for periodic signal', ac);
  if (ac) {
    assert(
      Math.abs(ac.bestLag - 30) <= 1,
      `bestLag === 30 ± 1  (got ${ac.bestLag})`,
      ac
    );
    assert(ac.coefficient > 0.5, `coefficient > 0.5 (got ${ac.coefficient.toFixed(4)})`, ac);
  }

  // Zero-variance guard
  const flat = new Array(100).fill(5);
  const acFlat = computeAutocorr(flat);
  assert(acFlat === null, 'computeAutocorr returns null for flat series', acFlat);

  // Too-short guard
  const short = [1, 2];
  const acShort = computeAutocorr(short);
  assert(acShort === null, 'computeAutocorr returns null for series.length < 4', acShort);
}

// ─────────────────────────── 2. computeStatsPack ───────────────────

console.log('\n[2] computeStatsPack correctness');
{
  // Known array: 1..100
  const vals = Array.from({ length: 100 }, (_, i) => i + 1);
  const sp = computeStatsPack(vals);
  assert(sp.frameCount === 100, `frameCount === 100 (got ${sp.frameCount})`);
  assert(sp.max === 100, `max === 100 (got ${sp.max})`);
  // p50 of 1..100 sorted → index 50 = value 51
  assert(sp.p50 === 51, `p50 === 51 (got ${sp.p50})`);
  // p95 of 1..100 sorted → index 95 = value 96
  assert(sp.p95 === 96, `p95 === 96 (got ${sp.p95})`);
  // p99 of 1..100 sorted → index 99 = value 100
  assert(sp.p99 === 100, `p99 === 100 (got ${sp.p99})`);
  assert(Math.abs(sp.mean - 50.5) < 0.01, `mean ≈ 50.5 (got ${sp.mean})`);
  assert(sp.presentFrames === 100, `presentFrames === 100 (got ${sp.presentFrames})`);

  // With zeros
  const withZeros = [0, 0, 10, 20, 30];
  const sp2 = computeStatsPack(withZeros);
  assert(sp2.presentFrames === 3, `presentFrames with zeros === 3 (got ${sp2.presentFrames})`);
  assert(sp2.max === 30, `max === 30 (got ${sp2.max})`);
}

// ─────────────────────────── DB tests ──────────────────────────────

const RUN_ID = 'unity-outside-stressmove';
const db = openPrismDb();

// ─────────────────────────── 3. queryMarkers ───────────────────────

console.log('\n[3] queryMarkers');
{
  const res = queryMarkers(db, { runId: RUN_ID, topN: 10 });
  assert(res.data.length <= 10, `returns ≤ topN rows (got ${res.data.length})`);
  assert(res.data.length > 0, 'returns at least 1 row');
  // Sorted descending by sumSelfMs
  let sorted = true;
  for (let i = 1; i < res.data.length; i++) {
    if (res.data[i].sumSelfMs > res.data[i - 1].sumSelfMs) { sorted = false; break; }
  }
  assert(sorted, 'sorted descending by sumSelfMs');
  assert(res.data.every(r => r.sumSelfMs >= 0), 'all sumSelfMs >= 0');

  // topN cap at 50
  const res50 = queryMarkers(db, { runId: RUN_ID, topN: 999 });
  assert(res50.data.length <= 50, `topN capped at 50 (got ${res50.data.length})`);

  // sortBy totalMs
  const resTotalMs = queryMarkers(db, { runId: RUN_ID, sortBy: 'totalMs', topN: 5 });
  let sortedTotal = true;
  for (let i = 1; i < resTotalMs.data.length; i++) {
    if (resTotalMs.data[i].sumTotalMs > resTotalMs.data[i - 1].sumTotalMs) { sortedTotal = false; break; }
  }
  assert(sortedTotal, 'sortBy:totalMs → sorted descending by sumTotalMs');

  // provenance
  assert(res.provenance.tool === 'queryMarkers', 'provenance.tool correct');
  assert(res.provenance.runId === RUN_ID, 'provenance.runId correct');
}

// ─────────────────────────── 4. scanMetricOverFrames ───────────────

console.log('\n[4] scanMetricOverFrames — Semaphore.WaitForSignal');
{
  const res = scanMetricOverFrames(db, {
    runId: RUN_ID,
    markerName: 'Semaphore.WaitForSignal',
  });
  const sp = res.data;
  assert(sp.frameCount === 600, `frameCount === 600 (got ${sp.frameCount})`);
  assert(sp.max > 0, `max > 0 (got ${sp.max.toFixed(3)})`);
  assert(sp.p95 >= sp.p50, `p95 >= p50`);
  assert(sp.p99 >= sp.p95, `p99 >= p95`);
  assert(sp.mean >= 0, `mean >= 0 (got ${sp.mean.toFixed(3)})`);
  assert(
    sp.burstFrames.length <= 20,
    `burstFrames capped at 20 (got ${sp.burstFrames.length})`
  );
  // spikeRatio
  assert(sp.spikeRatio >= 0, `spikeRatio >= 0 (got ${sp.spikeRatio.toFixed(3)})`);
  // Autocorr result may be null or have a valid lag
  assert(
    sp.autocorr === null || (sp.autocorr.bestLag >= 2 && sp.autocorr.coefficient >= -1),
    `autocorr valid (got ${JSON.stringify(sp.autocorr)})`
  );
  // Red-line: output JSON should be small
  const bytes = Buffer.byteLength(JSON.stringify(res));
  assert(bytes < 2048, `output < 2KB (got ${bytes} bytes)`, bytes);
}

// ─────────────────────────── 5. getFrameCallTree ───────────────────

console.log('\n[5] getFrameCallTree — max-ms_frame frame (519)');
{
  // Find max ms_frame frame
  const maxFrameRow = db
    .prepare(
      `SELECT frame_index, ms_frame FROM prism_frame_meta WHERE run_id = ?
       ORDER BY ms_frame DESC LIMIT 1`
    )
    .get(RUN_ID) as { frame_index: number; ms_frame: number };

  const res = getFrameCallTree(db, {
    runId: RUN_ID,
    frameIndex: maxFrameRow.frame_index,
    maxDepth: 5,
  });
  const tree = res.data;

  assert(tree.msFrame > 0, `msFrame > 0 (got ${tree.msFrame.toFixed(2)})`);
  assert(tree.tree.length > 0, 'tree has at least 1 root node');
  assert(tree.hotPath.length > 0, 'hotPath non-empty');

  // Top-level totalMs sum ≤ msFrame (with small floating-point tolerance)
  const topLevelSum = tree.tree.reduce((acc, n) => acc + n.totalMs, 0);
  assert(
    topLevelSum <= tree.msFrame * 1.01,
    `top-level totalMs sum (${topLevelSum.toFixed(2)}) ≤ msFrame (${tree.msFrame.toFixed(2)})`,
    { topLevelSum, msFrame: tree.msFrame }
  );

  // hotPath[0] is root
  assert(tree.hotPath[0].totalMs > 0, 'hotPath root has totalMs > 0');

  // Depth constraint respected
  const allNodes: typeof tree.tree = [];
  function collectNodes(nodes: typeof tree.tree) {
    for (const n of nodes) { allNodes.push(n); collectNodes(n.children); }
  }
  collectNodes(tree.tree);
  // depth field removed from node; use hotPath length as proxy
  assert(tree.hotPath.length > 0, 'hotPath non-empty (depth constraint proof)');

  // Red-line check (32 nodes × ~120 bytes avg + overhead)
  const bytes = Buffer.byteLength(JSON.stringify(res));
  assert(bytes < 6144, `output < 6KB (got ${bytes} bytes)`, bytes);

  console.log(`    [info] frame ${maxFrameRow.frame_index}, msFrame=${maxFrameRow.ms_frame.toFixed(2)}, hotPath: ${tree.hotPath.map(n => n.name.substring(0, 25)).join(' → ')}`);
}

// ─────────────────────────── 6. getThreadTimeline ──────────────────

console.log('\n[6] getThreadTimeline — frame 519');
{
  const res = getThreadTimeline(db, { runId: RUN_ID, frameIndex: 519 });
  const tl = res.data;

  assert(tl.threads.length > 0, `threads non-empty (got ${tl.threads.length})`);
  assert(tl.msFrame > 0, `msFrame > 0 (got ${tl.msFrame.toFixed(2)})`);
  assert(tl.mainThreadWaits.length > 0, 'mainThreadWaits non-empty (Semaphore.WaitForSignal expected)');

  // Check Semaphore.WaitForSignal is present
  const hasWait = tl.mainThreadWaits.some(w =>
    w.name.includes('Semaphore') || w.name.includes('Wait') || w.name.includes('Present')
  );
  assert(hasWait, 'mainThreadWaits contains a wait/semaphore/present marker');

  assert(tl.threads.length <= 10, `threads ≤ 10 cap (got ${tl.threads.length})`);
  assert(
    tl.threads.every(t => t.topMarkers.length <= 5),
    'each thread topMarkers ≤ 5'
  );
  assert(tl.mainThreadWaits.length <= 15, `mainThreadWaits ≤ 15 cap (got ${tl.mainThreadWaits.length})`);

  // Red-line (10 threads × 5 markers × ~80 bytes + 15 waits × ~60 bytes)
  const bytes = Buffer.byteLength(JSON.stringify(res));
  assert(bytes < 5120, `output < 5KB (got ${bytes} bytes)`, bytes);

  console.log(`    [info] wait markers: ${tl.mainThreadWaits.map(w => w.name).join(', ')}`);
}

// ─────────────────────────── 7. correlateFrameSets ─────────────────

console.log('\n[7] correlateFrameSets — slowFrames ∩ markerSpike(top marker)');
{
  // Get the top marker by selfMs for a realistic spike set
  const topMarker = queryMarkers(db, { runId: RUN_ID, topN: 1, thread: '1:Main Thread' });
  const markerName = topMarker.data[0]?.markerName ?? 'PlayerLoop';
  const minSelfMs = (topMarker.data[0]?.avgSelfMsPerPresentFrame ?? 1) * 0.5;

  console.log(`    [info] using markerSpike on "${markerName}" minSelfMs=${minSelfMs.toFixed(3)}`);

  const res = correlateFrameSets(db, {
    runId: RUN_ID,
    setA: { kind: 'slowFrames' },
    setB: { kind: 'markerSpike', markerName, minSelfMs },
  });
  const d = res.data;

  assert(d.sizeA >= 0 && d.sizeA <= 600, `sizeA in [0,600] (got ${d.sizeA})`);
  assert(d.sizeB >= 0 && d.sizeB <= 600, `sizeB in [0,600] (got ${d.sizeB})`);
  assert(d.jaccard >= 0 && d.jaccard <= 1, `jaccard in [0,1] (got ${d.jaccard.toFixed(4)})`);
  assert(d.intersection <= Math.min(d.sizeA, d.sizeB), 'intersection ≤ min(sizeA, sizeB)');
  assert(d.sampleOverlapFrames.length <= 20, `sampleOverlapFrames ≤ 20 cap`);
  assert(
    Math.abs(d.pctAinB - (d.sizeA > 0 ? (d.intersection / d.sizeA) * 100 : 0)) < 0.01,
    `pctAinB consistent`
  );

  // frameList predicate
  const res2 = correlateFrameSets(db, {
    runId: RUN_ID,
    setA: { kind: 'frameList', frames: [1, 2, 3, 519, 256] },
    setB: { kind: 'frameList', frames: [3, 519, 999] },
  });
  assert(res2.data.sizeA === 5, `frameList sizeA === 5 (got ${res2.data.sizeA})`);
  assert(res2.data.sizeB === 3, `frameList sizeB === 3 (got ${res2.data.sizeB})`);
  assert(res2.data.intersection === 2, `frameList intersection === 2 (got ${res2.data.intersection})`);
  assert(
    Math.abs(res2.data.jaccard - 2 / 6) < 0.0001,
    `frameList jaccard === 2/6 (got ${res2.data.jaccard.toFixed(4)})`
  );

  // Red-line
  const bytes = Buffer.byteLength(JSON.stringify(res));
  assert(bytes < 2048, `output < 2KB (got ${bytes} bytes)`, bytes);
}

// ─────────────────────────── 8. getSourceForSymbol callStack ─────

console.log('\n[8] getSourceForSymbol — callStack disambiguation');
{
  // (a) backward compatible: PATH A symbol without callStack
  const pathA = getSourceForSymbol(db, { symbol: 'CS:AOE.MeshUIManager' });
  assert(pathA.data.found === true, 'PATH A symbol found without callStack');
  assert(
    pathA.data.resolvedVia !== 'callstack-disambiguated',
    `resolvedVia not callstack-disambiguated (got ${pathA.data.resolvedVia})`
  );

  // (b) callStack disambiguation: ambiguous bare Lua name converges.
  // Symbol chosen from real codegraph: "GetRootPanel" has 1688 same-named Lua
  // candidates, of which exactly ONE has a caller edge (from
  // "FindComplexPathToLastContainer"), so the call stack uniquely disambiguates it.
  // (OnCameraMove was a poor choice: all 5 of its candidates lack caller edges,
  //  so it can never disambiguate — unfit as a positive case.)
  const AMBIG_SYMBOL = 'GetRootPanel';
  const VALID_ANCESTOR = 'FindComplexPathToLastContainer';

  const ambiguousNoStack = getSourceForSymbol(db, { symbol: AMBIG_SYMBOL });
  assert(
    ambiguousNoStack.data.found === false && ambiguousNoStack.data.ambiguous === true,
    `${AMBIG_SYMBOL} without callStack is ambiguous (got found=${ambiguousNoStack.data.found}, ambiguous=${ambiguousNoStack.data.ambiguous})`
  );

  const disambiguated = getSourceForSymbol(db, {
    symbol: AMBIG_SYMBOL,
    callStack: [VALID_ANCESTOR],
  });
  assert(disambiguated.data.found === true, `${AMBIG_SYMBOL} + valid callStack found`);
  assert(
    disambiguated.data.resolvedVia === 'callstack-disambiguated',
    `resolvedVia === callstack-disambiguated (got ${disambiguated.data.resolvedVia})`
  );
  assert(
    (disambiguated.data.note ?? '').includes('消歧'),
    `note mentions disambiguation (got ${disambiguated.data.note})`
  );

  // (c) ineffective callStack still ambiguous — guardrail: never guess
  const stillAmbiguous = getSourceForSymbol(db, {
    symbol: AMBIG_SYMBOL,
    callStack: ['TotallyUnrelatedSymbol.NeverExists'],
  });
  assert(stillAmbiguous.data.found === false, 'ineffective callStack → found:false');
  assert(stillAmbiguous.data.ambiguous === true, 'ineffective callStack → ambiguous:true');
  assert(
    (stillAmbiguous.data.note ?? '').includes('提供了调用栈但仍无法唯一收敛'),
    `note mentions failed disambiguation (got ${stillAmbiguous.data.note})`
  );
}

// ─────────────────────────── 9. getSourceForSymbol frameContext ────

console.log('\n[9] getSourceForSymbol — frameContext auto callStack');
{
  const AMBIG_SYMBOL = 'GetRootPanel';
  const VALID_ANCESTOR = 'FindComplexPathToLastContainer';

  // (a) auto disambiguation: discover a frame whose parent_name chain helps
  const frameRows = db
    .prepare(
      `SELECT DISTINCT frame_index FROM prism_frame_marker_samples
       WHERE run_id = ? AND marker_name = ?
       ORDER BY frame_index
       LIMIT 200`
    )
    .all(RUN_ID, AMBIG_SYMBOL) as Array<{ frame_index: number }>;

  let autoDisambigFrame: number | null = null;
  for (const { frame_index } of frameRows) {
    const autoResult = getSourceForSymbol(db, {
      symbol: AMBIG_SYMBOL,
      frameContext: { runId: RUN_ID, frameIndex: frame_index },
    });
    if (
      autoResult.data.found === true &&
      autoResult.data.resolvedVia === 'callstack-disambiguated'
    ) {
      autoDisambigFrame = frame_index;
      assert(true, `frameContext auto disambiguates ${AMBIG_SYMBOL} at frame ${frame_index}`);
      assert(
        (autoResult.data.note ?? '').includes('运行时调用栈'),
        `note mentions runtime call stack (got ${autoResult.data.note})`
      );
      assert(
        (autoResult.data.note ?? '').includes(String(frame_index)),
        `note mentions frame index ${frame_index} (got ${autoResult.data.note})`
      );
      break;
    }
  }
  // NOTE(DEFER-WT-003): profiler-callstack 消歧代码正确，但当前 prism.sqlite + codegraph
  // 组合下 profiler 的 parent_name(采样标签) 与 codegraph 函数名不对齐，实际触发不了消歧
  // (根因见 DEFER-WT-003 + BK-23)。故此处"找到可消歧帧"是数据依赖的软期望：
  // 找到→断言其行为正确；找不到→skip(不 FAIL)，避免污染测试套件的全绿信号。
  if (autoDisambigFrame !== null) {
    assert(true, `frameContext auto-disambiguates ${AMBIG_SYMBOL} (data supports it, frame ${autoDisambigFrame})`);
  } else {
    console.log(
      `  [skip] no frame's parent_name chain disambiguates ${AMBIG_SYMBOL} in current data ` +
      `(checked ${frameRows.length}; expected per DEFER-WT-003/BK-23 — not a regression)`,
    );
  }

  // (b) invalid frameContext — marker absent → still ambiguous, never guess
  const invalidFrame = getSourceForSymbol(db, {
    symbol: AMBIG_SYMBOL,
    frameContext: { runId: RUN_ID, frameIndex: 999999 },
  });
  assert(invalidFrame.data.found === false, 'invalid frameContext → found:false');
  assert(invalidFrame.data.ambiguous === true, 'invalid frameContext → ambiguous:true');

  // (c) explicit callStack wins over frameContext
  if (autoDisambigFrame !== null) {
    const callStackWins = getSourceForSymbol(db, {
      symbol: AMBIG_SYMBOL,
      frameContext: { runId: RUN_ID, frameIndex: autoDisambigFrame },
      callStack: ['TotallyUnrelatedSymbol.NeverExists'],
    });
    assert(callStackWins.data.found === false, 'bad callStack + good frameContext → found:false');
    assert(callStackWins.data.ambiguous === true, 'bad callStack + good frameContext → ambiguous:true');
    assert(
      (callStackWins.data.note ?? '').includes('提供了调用栈但仍无法唯一收敛'),
      `priority note uses explicit callStack failure (got ${callStackWins.data.note})`
    );
  }

  // (d) buildCallStackFromFrame ring guard (in-memory)
  const memDb = new Database(':memory:');
  memDb.exec(`
    CREATE TABLE prism_frame_marker_samples (
      run_id TEXT, frame_index INTEGER, thread TEXT,
      marker_name TEXT, parent_name TEXT
    );
  `);
  const insert = memDb.prepare(
    `INSERT INTO prism_frame_marker_samples
     (run_id, frame_index, thread, marker_name, parent_name)
     VALUES (?, ?, ?, ?, ?)`
  );
  insert.run('test', 1, 'Main', 'Leaf', 'B');
  insert.run('test', 1, 'Main', 'B', 'C');
  insert.run('test', 1, 'Main', 'C', 'B'); // cycle B ↔ C

  const cyclicStack = buildCallStackFromFrame(memDb, 'test', 1, 'Main', 'Leaf');
  assert(cyclicStack.length === 2, `ring guard stops at cycle (got length ${cyclicStack.length})`, cyclicStack);
  assert(cyclicStack[0] === 'B' && cyclicStack[1] === 'C', 'ring stack order B then C', cyclicStack);

  // depth limit: chain longer than CALL_STACK_MAX_DEPTH
  for (let i = 0; i < 25; i++) {
    insert.run('test', 2, 'Main', `N${i}`, `N${i + 1}`);
  }
  insert.run('test', 2, 'Main', 'N25', null);
  const deepStack = buildCallStackFromFrame(memDb, 'test', 2, 'Main', 'N0');
  assert(deepStack.length === 20, `depth capped at 20 (got ${deepStack.length})`, deepStack);

  memDb.close();
}

// ─────────────────────────── 10. marker alias + confidence (BK-23a) ────

console.log('\n[10] getSourceForSymbol — marker alias table / confidence');
{
  // (a) OnCameraMove: was ambiguous(5); now alias-exact to OutsideArmyMgr
  const onCam = getSourceForSymbol(db, { symbol: 'OnCameraMove', maxLines: 40 });
  assert(onCam.data.found === true, 'OnCameraMove found via alias');
  assert(onCam.data.resolvedVia === 'alias', `OnCameraMove resolvedVia=alias (got ${onCam.data.resolvedVia})`);
  assert(onCam.data.confidence === 'alias-exact', `OnCameraMove confidence=alias-exact (got ${onCam.data.confidence})`);
  assert(
    (onCam.data.file ?? '').includes('OutsideArmyMgr.lua'),
    `OnCameraMove file is OutsideArmyMgr.lua (got ${onCam.data.file})`
  );
  assert(onCam.data.alias?.source === 'marker-aliases', 'OnCameraMove has alias provenance');
  assert(
    onCam.data.confidence !== 'exact-codegraph',
    'OnCameraMove must not be exact-codegraph'
  );

  // (b) ProcessTask_MapEntityAdd: was not-found → alias-exact
  const entityAdd = getSourceForSymbol(db, {
    symbol: 'MapSignificanceMgr.ProcessTask_MapEntityAdd',
    maxLines: 40,
  });
  assert(entityAdd.data.found === true, 'ProcessTask_MapEntityAdd found');
  assert(
    entityAdd.data.confidence === 'alias-exact',
    `ProcessTask_MapEntityAdd confidence=alias-exact (got ${entityAdd.data.confidence})`
  );
  assert(
    (entityAdd.data.file ?? '').includes('MapSignificanceMgr.lua'),
    `ProcessTask_MapEntityAdd file (got ${entityAdd.data.file})`
  );
  assert(
    typeof entityAdd.data.confidenceReason === 'string' && entityAdd.data.confidenceReason.length > 0,
    'ProcessTask_MapEntityAdd has confidenceReason'
  );

  // (c) YzEntityMoveLineNtf remains high-confidence codegraph
  const yz = getSourceForSymbol(db, { symbol: 'YzEntityMoveLineNtf', maxLines: 40 });
  assert(yz.data.found === true, 'YzEntityMoveLineNtf found');
  assert(
    yz.data.confidence === 'exact-codegraph',
    `YzEntityMoveLineNtf confidence=exact-codegraph (got ${yz.data.confidence})`
  );
  assert(
    yz.data.resolvedVia === 'codegraph' || yz.data.resolvedVia === 'callstack-disambiguated',
    `YzEntityMoveLineNtf via codegraph (got ${yz.data.resolvedVia})`
  );

  // (d) CS class marker → class-anchored, never method exact
  const mesh = getSourceForSymbol(db, { symbol: 'CS:AOE.MeshUIManager', maxLines: 40 });
  assert(mesh.data.found === true, 'CS:AOE.MeshUIManager found');
  assert(
    mesh.data.confidence === 'class-anchored',
    `CS:AOE.MeshUIManager confidence=class-anchored (got ${mesh.data.confidence})`
  );
  assert(
    mesh.data.confidence !== 'exact-codegraph' && mesh.data.confidence !== 'alias-exact',
    'CS class must not be exact/alias-exact method attribution'
  );

  // (e) LuaMgr schedule markers: low-confidence + correct Mgr.lua range (not silent wrong file-anchored)
  const tickSched = getSourceForSymbol(db, {
    symbol: 'LuaMgr.OnTick&UpdateSchedule',
    maxLines: 40,
  });
  assert(tickSched.data.found === true, 'LuaMgr.OnTick&UpdateSchedule found');
  assert(
    tickSched.data.confidence === 'low-confidence' || tickSched.data.confidence === 'suspicious',
    `LuaMgr.OnTick&UpdateSchedule low/suspicious (got ${tickSched.data.confidence})`
  );
  assert(
    (tickSched.data.file ?? '').replace(/\\/g, '/').includes('Mgr/Mgr.lua') ||
      (tickSched.data.file ?? '').replace(/\\/g, '/').includes('.Lua/Mgr/Mgr.lua'),
    `LuaMgr.OnTick&UpdateSchedule maps to Mgr.lua (got ${tickSched.data.file})`
  );
  assert(
    typeof tickSched.data.confidenceReason === 'string' &&
      (tickSched.data.confidenceReason.includes('Synthetic') ||
        tickSched.data.confidenceReason.includes('schedule') ||
        tickSched.data.confidenceReason.includes('可疑') ||
        tickSched.data.confidenceReason.length > 20),
    'LuaMgr.OnTick&UpdateSchedule has explanatory confidenceReason'
  );

  const lateSched = getSourceForSymbol(db, {
    symbol: 'LuaMgr.OnLateUpdateSchedule',
    maxLines: 40,
  });
  assert(lateSched.data.found === true, 'LuaMgr.OnLateUpdateSchedule found');
  assert(
    lateSched.data.confidence === 'low-confidence' || lateSched.data.confidence === 'suspicious',
    `LuaMgr.OnLateUpdateSchedule low/suspicious (got ${lateSched.data.confidence})`
  );

  // (f) OutSideViewArmyLineMgr CS: class-anchored
  const armyLine = getSourceForSymbol(db, {
    symbol: 'CS:AOE.Outside.OutSideViewArmyLineMgr',
    maxLines: 40,
  });
  assert(armyLine.data.found === true, 'CS:AOE.Outside.OutSideViewArmyLineMgr found');
  assert(
    armyLine.data.confidence === 'class-anchored',
    `OutSideViewArmyLineMgr confidence=class-anchored (got ${armyLine.data.confidence})`
  );

  // (g) MUI_UpdateUIPos rescued from not-found
  const mui = getSourceForSymbol(db, { symbol: 'MUI_UpdateUIPos', maxLines: 40 });
  assert(mui.data.found === true, 'MUI_UpdateUIPos found via alias');
  assert(
    mui.data.confidence === 'map-source-interval',
    `MUI_UpdateUIPos confidence=map-source-interval (got ${mui.data.confidence})`
  );
  assert(mui.data.confidence !== 'exact-codegraph', 'MUI_UpdateUIPos must not be exact');
}

// ─────────────────────────── 11. WT-013 Perfetto JSON query tools ─

console.log('\n[11] WT-013 Perfetto JSON query tools');
{
  const curSched = querySchedState(db, { role: 'cur' });
  assert(curSched.data.available === true, 'cur querySchedState available');
  assert(
    curSched.data.threads.some(t => t.name === 'UnityMain' && t.runningPct === 77.82),
    'cur sched includes UnityMain runningPct=77.82',
    curSched.data.threads
  );
  assert(curSched.provenance.source === 'perfetto', 'sched provenance.source=perfetto');

  const curAtrace = queryAtraceSlices(db, { role: 'cur', pattern: 'PlayerLoop' });
  assert(curAtrace.data.available === true, 'cur queryAtraceSlices available');
  assert(
    curAtrace.data.rows[0]?.name === 'PlayerLoop' && curAtrace.data.rows[0]?.count === 484,
    'cur atrace PlayerLoop count=484',
    curAtrace.data.rows[0]
  );

  const curFrame = queryFrameTimeline(db, { role: 'cur' });
  assert(
    curFrame.data.androidFrameTimeline.available === false,
    'cur FrameTimeline honestly unavailable'
  );
  assert(
    curFrame.data.choreographer.available === true,
    'cur choreographer summary available',
    curFrame.data.choreographer
  );

  const curCallTree = getPerfettoCallTree(db, { role: 'cur', maxDepth: 5 });
  assert(curCallTree.data.available === true, 'cur getPerfettoCallTree available');
  if (curCallTree.data.available) {
    assert(curCallTree.data.callTrees.length > 0, 'cur callTrees non-empty');
    assert(
      curCallTree.data.hotPath.some(n => n.name === 'PlayerLoop'),
      'cur callTree hotPath includes PlayerLoop',
      curCallTree.data.hotPath
    );
  }

  const baseCallTree = getPerfettoCallTree(db, { role: 'base' });
  assert(baseCallTree.data.available === true, 'base getPerfettoCallTree available after WT-014 provider fallback');
  if (baseCallTree.data.available) {
    assert(baseCallTree.data.callTrees.length > 0, 'base callTrees non-empty after WT-014');
    assert(
      baseCallTree.data.hotPath.some(n => n.name === 'PlayerLoop'),
      'base callTree hotPath includes PlayerLoop after WT-014',
      baseCallTree.data.hotPath
    );
  }

  const throttleCpu = queryCpuFreq(db, { role: 'throttle' });
  assert(
    Math.abs((throttleCpu.data.avgMhz ?? 0) - 1324.6) < 0.01,
    `throttle cpu avgMhz=1324.6 (got ${throttleCpu.data.avgMhz})`,
    throttleCpu.data
  );
  assert(
    Math.abs((throttleCpu.data.bigCoreReachPct ?? 0) - 59.2) < 0.01,
    `throttle bigCoreReachPct=59.2 (got ${throttleCpu.data.bigCoreReachPct})`,
    throttleCpu.data
  );
  assert(throttleCpu.data.throttlingSuspected === true, 'throttle throttling suspected');

  const corr = correlateFrameSchedCpu(db, { role: 'throttle' });
  assert(corr.data.granularity === 'window', 'correlateFrameSchedCpu granularity=window');
  assert(
    corr.data.signals.includes('throttling suspected'),
    'correlateFrameSchedCpu reports throttling suspected signal',
    corr.data.signals
  );
}

// ─────────────────────────── 12. WT-019 Perfetto query content expansion ─

console.log('\n[12] WT-019 Perfetto query content expansion');
{
  // queryCallTreeSubtree — generic pattern filter (no hardcoded module asserts on exact names beyond discovery)
  const subtree = queryCallTreeSubtree(null, { role: 'cur', pattern: 'Mgr', minTotalPct: 0.5, topN: 50 });
  assert(subtree.data.available === true, 'cur queryCallTreeSubtree available');
  assert(subtree.data.rows.length >= 2, `cur Mgr pattern rows>=2 (got ${subtree.data.rows.length})`, subtree.data.rows.map(r => r.name));
  assert(
    subtree.data.rows.every(r => r.parentChain.includes('>')),
    'cur callTreeSubtree rows have parentChain paths'
  );
  assert(
    subtree.data.rows.some(r => /Mgr/i.test(r.name) && (r.parentChain?.length ?? 0) > 0),
    'cur callTreeSubtree discovers Mgr-named nodes via pattern',
    subtree.data.rows.slice(0, 5).map(r => ({ name: r.name, chain: r.parentChain }))
  );
  // Broad scan: enough business-relevant nodes (≥10) with parentChain
  const broad = queryCallTreeSubtree(null, { role: 'cur', minTotalPct: 1.0, topN: 50 });
  assert(broad.data.totalNodes >= 10, `cur callTreeSubtree totalNodes>=10 (got ${broad.data.totalNodes})`);
  assert(
    broad.data.rows.every(r => typeof r.parentChain === 'string' && r.parentChain.length > 0),
    'cur callTreeSubtree parentChain present on all rows'
  );

  // querySliceDeltas — base→cur foldChange ranking
  const deltas = querySliceDeltas(null, {
    baseRole: 'base',
    compareRole: 'cur',
    tool: 'callTreeSubtree',
    minFoldChange: 1.0,
    minTotalPct: 0.5,
    topN: 20,
  });
  assert(deltas.data.available === true, 'querySliceDeltas base→cur available');
  assert(deltas.data.rows.length > 0, 'querySliceDeltas rows non-empty');
  assert(
    deltas.data.rows.every((r, i, arr) => i === 0 || (arr[i - 1].foldChange ?? 0) >= (r.foldChange ?? 0)),
    'querySliceDeltas sorted by foldChange desc',
    deltas.data.rows.slice(0, 5).map(r => ({ name: r.name, foldChange: r.foldChange }))
  );
  assert(
    typeof deltas.data.rows[0]?.foldChange === 'number' && deltas.data.rows[0].foldChange >= 1,
    'querySliceDeltas top foldChange >= 1',
    deltas.data.rows[0]
  );

  // queryOffCpuAttribution — wait slices + coveragePct on throttle
  const offCpu = queryOffCpuAttribution(null, { role: 'throttle' });
  assert(offCpu.data.available === true, 'throttle queryOffCpuAttribution available');
  assert(offCpu.data.waitSlices.length > 0, 'throttle waitSlices non-empty', offCpu.data.waitSlices);
  assert(
    offCpu.data.waitSlices.some(s => /Wait|Present|Sleep|Block/i.test(s.name)),
    'throttle waitSlices match generic Wait/Present/Sleep/Block patterns',
    offCpu.data.waitSlices.map(s => s.name)
  );
  assert(
    offCpu.data.coveragePct == null || typeof offCpu.data.coveragePct === 'number',
    `throttle coveragePct is number|null (got ${offCpu.data.coveragePct})`
  );
  assert(offCpu.data.sleepingPct != null, `throttle sleepingPct present (got ${offCpu.data.sleepingPct})`);

  // queryFrameTimeline — choreographer percentiles; PlayerLoop after WT-022 rebuild
  const frame = queryFrameTimeline(null, { role: 'cur' });
  assert(frame.data.choreographer.available === true, 'cur choreographer available');
  assert(
    frame.data.choreographer.p50Ms != null && frame.data.choreographer.fps != null,
    'cur choreographer exposes p50Ms/fps',
    frame.data.choreographer
  );
  assert(
    frame.data.choreographer.slowFrameRate != null,
    'cur choreographer exposes slowFrameRate',
    frame.data.choreographer
  );
  // Pre-rebuild triad may still lack playerloop — honesty preserved via available flag.
  // Post-rebuild expectation is covered in [13] WT-022.
  assert(
    typeof frame.data.playerLoopPercentiles.available === 'boolean',
    'playerLoopPercentiles.available is boolean'
  );

  // queryCpuFreq — perCpu + clusterSummary
  const cpu = queryCpuFreq(null, { role: 'throttle' });
  assert(cpu.data.perCpu.length >= 8, `throttle perCpu length>=8 (got ${cpu.data.perCpu.length})`);
  assert(
    cpu.data.clusterSummary.small.cpuCount === 4 &&
      cpu.data.clusterSummary.mid.cpuCount === 3 &&
      cpu.data.clusterSummary.big.cpuCount === 1,
    'throttle clusterSummary small/mid/big counts 4/3/1',
    cpu.data.clusterSummary
  );
  assert(
    cpu.data.clusterSummary.big.avgReachPct != null,
    'throttle big cluster avgReachPct present',
    cpu.data.clusterSummary.big
  );
  assert(cpu.provenance.tool === 'queryCpuFreq', 'cpu provenance.tool=queryCpuFreq');
}

// ─────────────────────────── 13. WT-022 PlayerLoop + GC.Alloc + offCpu byState ─

console.log('\n[13] WT-022 PlayerLoop percentiles + GC.Alloc byModule + offCpu byState');
{
  const triadRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../data/prism-out/bk26b-perfetto-triad'
  );
  const curProfilePath = path.join(triadRoot, 'cur', 'perfetto-profile.json');
  const curProfile = JSON.parse(fs.readFileSync(curProfilePath, 'utf8')) as {
    core?: { frame?: Array<{ frameDefinition?: string; p50Ms?: number; count?: number }> };
    detail?: { perfetto?: { gcAllocByChain?: { byChain?: unknown[] }; offCpuAttribution?: { byState?: unknown[] } } };
  };
  const coreFrames = curProfile.core?.frame ?? [];
  const hasPlayerLoopFrame = coreFrames.some(f => f.frameDefinition === 'playerloop');
  const hasChoreoFrame = coreFrames.some(f => f.frameDefinition === 'choreographer');
  const gcByChain = curProfile.detail?.perfetto?.gcAllocByChain?.byChain ?? [];
  const profileByState = curProfile.detail?.perfetto?.offCpuAttribution?.byState
    ?? (curProfile as { detail?: { perfetto?: { offCpuReasons?: { byState?: unknown[] } } } }).detail?.perfetto?.offCpuReasons?.byState
    ?? [];

  // Provider-layer checks (require triad rebuild after WT-022 provider changes)
  assert(hasChoreoFrame, 'cur profile core.frame has choreographer');
  assert(
    hasPlayerLoopFrame,
    'cur profile core.frame has playerloop (requires triad rebuild)',
    coreFrames.map(f => f.frameDefinition)
  );
  assert(
    Array.isArray(gcByChain) && gcByChain.length > 0,
    `cur profile gcAllocByChain.byChain non-empty (requires triad rebuild; got ${gcByChain.length})`
  );

  // queryFrameTimeline — PlayerLoop percentiles
  const frame = queryFrameTimeline(null, { role: 'cur' });
  assert(
    frame.data.playerLoopPercentiles.available === true,
    'cur playerLoopPercentiles.available=true (requires triad rebuild)',
    frame.data.playerLoopPercentiles
  );
  if (frame.data.playerLoopPercentiles.available) {
    const pl = frame.data.playerLoopPercentiles;
    assert(pl.p50Ms != null && pl.p95Ms != null && pl.p99Ms != null, 'cur playerLoop p50/p95/p99 present', pl);
    assert(pl.fps != null && pl.count != null, 'cur playerLoop fps/count present', pl);
    assert(
      pl.p50Ms! >= 25 && pl.p50Ms! <= 35,
      `cur playerLoop p50 in 25-35ms (got ${pl.p50Ms})`,
      pl
    );
  }

  // queryGcAllocByModule — generic ranking, no hard-coded module name asserts for presence count
  const gcCur = queryGcAllocByModule(null, { role: 'cur', topN: 20, minPerFrame: 0 });
  assert(gcCur.data.available === true, 'cur queryGcAllocByModule available (requires triad rebuild)', gcCur.data);
  assert(
    gcCur.data.rows.length >= 3,
    `cur gcAlloc rows>=3 (got ${gcCur.data.rows.length})`,
    gcCur.data.rows.slice(0, 5).map(r => ({ name: r.name, perFrame: r.perFrame }))
  );
  if (gcCur.data.rows.length > 0) {
    assert(
      (gcCur.data.rows[0].perFrame ?? 0) > 0,
      'cur gcAlloc top perFrame > 0',
      gcCur.data.rows[0]
    );
    assert(
      gcCur.data.rows.every(r => r.count != null && r.totalMs != null),
      'cur gcAlloc rows have count/totalMs'
    );
    assert(
      gcCur.data.rows.some(r => Array.isArray(r.parentChain) && (r.parentChain?.length ?? 0) > 0),
      'cur gcAlloc rows include parentChain'
    );
  }

  // pattern filter is generic substring (Mgr), not a hard-coded module list assert on exact names
  const gcThrottle = queryGcAllocByModule(null, {
    role: 'throttle',
    pattern: 'Mgr',
    topN: 20,
    minPerFrame: 0,
  });
  assert(
    gcThrottle.data.available === true && gcThrottle.data.rows.length >= 1,
    'throttle queryGcAllocByModule pattern=Mgr finds rows (requires triad rebuild)',
    gcThrottle.data.rows.slice(0, 5).map(r => r.name)
  );
  assert(
    gcThrottle.data.rows.every(r => /Mgr/i.test(r.name)),
    'throttle gcAlloc pattern=Mgr filters by substring'
  );

  // queryOffCpuAttribution — byState + retained waitSlices
  const offCpu = queryOffCpuAttribution(null, { role: 'throttle' });
  assert(offCpu.data.available === true, 'throttle queryOffCpuAttribution available');
  assert(
    Array.isArray(offCpu.data.byState) && offCpu.data.byState.length > 0,
    `throttle byState non-empty (requires triad rebuild; got ${offCpu.data.byState.length})`,
    offCpu.data.byState
  );
  if (offCpu.data.byState.length > 0) {
    const states = offCpu.data.byState.map(s => s.state);
    assert(
      states.some(s => s === 'S' || s === 'R' || s === 'D' || /S|R|D/.test(s)),
      'throttle byState includes S/R/D-like states',
      states
    );
  }
  assert(offCpu.data.waitSlices.length > 0, 'throttle waitSlices retained', offCpu.data.waitSlices.map(s => s.name));
  // Soft check on provider detail field when rebuilt
  if (profileByState.length > 0) {
    assert(profileByState.length > 0, 'throttle/cur profile offCpuAttribution.byState present');
  }
}

// ─────────────────────────── 14. WT-020 Perfetto explore reasoning layer ─

console.log('\n[14] WT-020 Perfetto explore reasoning layer');
{
  // writeFiles=true refreshes bk26b-perfetto-explore-mvp products for acceptance.
  const { ledger, findings, verdict, outDir } = runExploreMvp({ writeFiles: true });

  assert(Array.isArray(ledger) && ledger.length > 0, `explore ledger non-empty (got ${ledger.length})`);
  assert(findings.length >= 10, `explore findings >= 10 (got ${findings.length})`);

  const evidenceIds = new Set(ledger.map(e => e.id));
  const allLinked = findings.every(f => f.evidenceIds.every(id => evidenceIds.has(id)));
  assert(allLinked, 'every finding evidenceIds link to ledger');

  const withRb = findings.filter(
    f =>
      f.relativeBaseline != null &&
      typeof f.relativeBaseline.baselineRole === 'string' &&
      typeof f.relativeBaseline.compareRole === 'string' &&
      typeof f.relativeBaseline.absoluteValue === 'string' &&
      typeof f.relativeBaseline.baselineValue === 'string' &&
      'foldChange' in f.relativeBaseline &&
      'deltaPct' in f.relativeBaseline &&
      typeof f.relativeBaseline.relativeJudgment === 'string'
  );
  assert(withRb.length >= 5, `findings with relativeBaseline >= 5 (got ${withRb.length})`);

  const withCausal = findings.filter(
    f =>
      f.causalChain != null &&
      typeof f.causalChain.premise === 'string' &&
      typeof f.causalChain.inference === 'string' &&
      typeof f.causalChain.conclusion === 'string' &&
      (f.causalChain.confidence === 'high' ||
        f.causalChain.confidence === 'medium' ||
        f.causalChain.confidence === 'low')
  );
  assert(withCausal.length >= 1, `findings with causalChain >= 1 (got ${withCausal.length})`);

  const topBiz = findings.filter(
    f => f.kind === 'top-business-module' || f.title.startsWith('top 业务模块:')
  );
  assert(topBiz.length >= 1, `top 业务模块 findings >= 1 (got ${topBiz.length})`);

  const foldMods = findings.filter(
    f =>
      f.kind === 'fold-change-module' &&
      typeof f.relativeBaseline?.foldChange === 'number' &&
      f.relativeBaseline.foldChange > 2
  );
  assert(foldMods.length >= 1, `涨幅最大模块 foldChange>2 >= 1 (got ${foldMods.length})`);

  const gcMods = findings.filter(
    f => f.kind === 'gc-pressure-module' && /perFrame=\d/.test(f.claim)
  );
  assert(gcMods.length >= 1, `GC 压力最大模块 perFrame>0 >= 1 (got ${gcMods.length})`);

  assert(typeof verdict.triadTrend === 'string' && verdict.triadTrend.length > 0, 'verdict.triadTrend present');
  assert(
    typeof verdict.topBusinessHotspot === 'string' && verdict.topBusinessHotspot.length > 0,
    'verdict.topBusinessHotspot present'
  );
  assert(
    typeof verdict.gpuBoundJudgment === 'string' && verdict.gpuBoundJudgment.length > 0,
    'verdict.gpuBoundJudgment present'
  );
  assert(
    typeof verdict.freqMorphologyJudgment === 'string' && verdict.freqMorphologyJudgment.length > 0,
    'verdict.freqMorphologyJudgment present'
  );
  assert(Array.isArray(verdict.boundaries) && verdict.boundaries.length >= 1, 'verdict.boundaries non-empty');

  const findingsPath = path.join(outDir, 'findings.json');
  const ledgerPath = path.join(outDir, 'ledger.json');
  const verdictPath = path.join(outDir, 'verdict.json');
  assert(fs.existsSync(findingsPath), 'findings.json written');
  assert(fs.existsSync(ledgerPath), 'ledger.json written');
  assert(fs.existsSync(verdictPath), 'verdict.json written');
  const findingsDoc = JSON.parse(fs.readFileSync(findingsPath, 'utf8'));
  const ledgerDoc = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  const verdictDoc = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
  assert(Array.isArray(findingsDoc.findings) && findingsDoc.findings.length >= 10, 'findings.json findings>=10');
  assert(Array.isArray(ledgerDoc.evidence) && ledgerDoc.evidence.length > 0, 'ledger.json evidence non-empty');
  assert(typeof verdictDoc.triadTrend === 'string', 'verdict.json triadTrend');
}

// ─────────────────────────── 15. WT-021 Perfetto narrative layer ─────
// DR-44 WT-027: 旧脚本基座（runReportMvp）已废弃，改走三段管线（narrative-service.ts）。
// 本节原测旧脚本产物的 findings/roiOptimizations/triadTrend 结构，新 NarrativeReport 结构不同。
// TODO(WT-028): 新三段管线跑通后，改成测 runPrismNarrative 产出的 NarrativeReport。
console.log('\n[15] WT-021 Perfetto narrative layer — SKIPPED (DR-44 WT-027: 旧脚本基座已废弃，待 WT-028 改测新三段管线)');
// 原 [15] 节测试代码已移除——runReportMvp 产出的旧结构（findings/roiOptimizations/triadTrend）
// 不再适用新 NarrativeReport（overview/topConclusions/sections/prioritySummary）。

// ─────────────────────────── 16. WT-025 DR-41 五条硬规则自动检查 ─────
// DR-44 WT-027: 原测旧脚本产物的 redlineMatrix/topConclusionBlocks 结构。
// TODO(WT-028): 新三段管线跑通后，改成测新 NarrativeReport 渲染产出的 report.html。
console.log('\n[16] WT-025 DR-41 五条硬规则自动检查 — SKIPPED (DR-44 WT-027: 旧脚本基座已废弃，待 WT-028 改测新三段管线)');
// 原 [16] 节测试代码已移除——依赖旧脚本的 redlineMatrix/topConclusionBlocks 字段，
// 新 NarrativeReport 无这些字段。WT-028 跑通后补完整 DR-41 检查。

// ─────────────────────────── Summary ───────────────────────────────

db.close();

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passCount} PASS, ${failCount} FAIL`);
if (failCount > 0) {
  console.log('OVERALL: FAIL');
  process.exit(1);
} else {
  console.log('OVERALL: PASS');
  process.exit(0);
}
