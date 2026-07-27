/**
 * build-counters-index.ts — ingest Unity per-frame counters sidecar JSON
 *
 * Usage (from web/ directory):
 *   node --import tsx server/prism/build-counters-index.ts --input <path/to/X.counters.json> [--run-id <id>] [--db <path>]
 *
 * The counters JSON shape:
 *   { schemaVersion, frameIndexOffset: number, counters: string[], frames: [{frameIndex, values}...], frameCount }
 *
 * Frame index alignment: counters.frameIndex is 0-based; prism frame_index is 1-based display.
 *   prism_frame_index = counters.frameIndex + 1 + frameIndexOffset
 *
 * Prints a JSON summary on completion.
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { resolveDbPath } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CLI args
const argv = process.argv.slice(2);
function getArg(flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

const inputPath = getArg('--input');
if (!inputPath) {
  console.error('Usage: node --import tsx build-counters-index.ts --input <counters.json> [--run-id <id>] [--db <path>]');
  process.exit(1);
}

const resolvedInput = path.resolve(inputPath);
const basename = path.basename(resolvedInput); // e.g. foo.counters.json
const defaultRunId = basename.replace(/\.counters\.json$/, '');
const runId = getArg('--run-id') ?? defaultRunId;
const dbPath = getArg('--db') ?? resolveDbPath();

// Column name mapping: counters JSON field → SQL column
const FIELD_TO_COL: Record<string, string> = {
  drawCalls:            'draw_calls',
  batches:              'batches',
  setPassCalls:         'set_pass_calls',
  triangles:            'triangles',
  vertices:             'vertices',
  usedTexturesBytes:    'used_textures_bytes',
  usedTexturesCount:    'used_textures_count',
  totalReservedMemory:  'total_reserved_memory',
  totalUsedMemory:      'total_used_memory',
  gcAllocatedInFrame:   'gc_allocated_in_frame',
  gcReservedMemory:     'gc_reserved_memory',
  systemUsedMemory:     'system_used_memory',
  particleMemory:       'particle_memory',
  meshMemory:           'mesh_memory',
  materialCount:        'material_count',
  objectCount:          'object_count',
};

const ALL_COLS = [
  'draw_calls', 'batches', 'set_pass_calls', 'triangles', 'vertices',
  'used_textures_bytes', 'used_textures_count', 'total_reserved_memory',
  'total_used_memory', 'gc_allocated_in_frame', 'gc_reserved_memory',
  'system_used_memory', 'particle_memory', 'mesh_memory',
  'material_count', 'object_count',
] as const;

// Load counters JSON
console.error(`Reading ${resolvedInput} ...`);
const raw = fs.readFileSync(resolvedInput, 'utf8');
const countersData = JSON.parse(raw) as {
  schemaVersion: number;
  frameIndexOffset: number;
  counters: string[];
  frames: Array<{ frameIndex: number; values: Array<number | null> }>;
  frameCount: number;
};

const { frameIndexOffset = 0, counters: fieldNames, frames } = countersData;

// Open DB in write mode
const db = new Database(dbPath, { readonly: false });
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 30000');

// Create table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS prism_frame_counters (
    run_id                TEXT    NOT NULL,
    frame_index           INTEGER NOT NULL,
    draw_calls            INTEGER,
    batches               INTEGER,
    set_pass_calls        INTEGER,
    triangles             INTEGER,
    vertices              INTEGER,
    used_textures_bytes   INTEGER,
    used_textures_count   INTEGER,
    total_reserved_memory INTEGER,
    total_used_memory     INTEGER,
    gc_allocated_in_frame INTEGER,
    gc_reserved_memory    INTEGER,
    system_used_memory    INTEGER,
    particle_memory       INTEGER,
    mesh_memory           INTEGER,
    material_count        INTEGER,
    object_count          INTEGER,
    PRIMARY KEY (run_id, frame_index)
  )
`);

// Delete existing rows for this run_id
const deleted = db.prepare('DELETE FROM prism_frame_counters WHERE run_id = ?').run(runId);
console.error(`Deleted ${deleted.changes} existing rows for run_id="${runId}"`);

// Build insert statement
const colList = ALL_COLS.join(', ');
const placeholders = ALL_COLS.map(() => '?').join(', ');
const insertSql = `
  INSERT INTO prism_frame_counters (run_id, frame_index, ${colList})
  VALUES (?, ?, ${placeholders})
`;
const insertStmt = db.prepare(insertSql);

// Compute positional index for each SQL column
const colPositions: number[] = ALL_COLS.map(col => {
  // find the JSON fieldName that maps to this col
  const jsonField = Object.entries(FIELD_TO_COL).find(([, v]) => v === col)?.[0];
  if (!jsonField) return -1;
  return fieldNames.indexOf(jsonField);
});

// Ingest in a single transaction
let rowsInserted = 0;
const insertMany = db.transaction(() => {
  for (const frame of frames) {
    const prismFrameIndex = frame.frameIndex + 1 + frameIndexOffset;
    const vals: Array<number | null> = colPositions.map(pos =>
      pos === -1 ? null : (frame.values[pos] ?? null)
    );
    insertStmt.run(runId, prismFrameIndex, ...vals);
    rowsInserted++;
  }
});

insertMany();
db.close();

// Compute summary stats
const gcIdx = fieldNames.indexOf('gcAllocatedInFrame');
const triIdx = fieldNames.indexOf('triangles');

const gcVals = frames.map(f => f.values[gcIdx]).filter((v): v is number => v != null);
const triVals = frames.map(f => f.values[triIdx]).filter((v): v is number => v != null);

const gcMean = gcVals.length > 0 ? gcVals.reduce((a, b) => a + b, 0) / gcVals.length : null;
const gcMax = gcVals.length > 0 ? Math.max(...gcVals) : null;
const gcMaxRaw = frames.find(f => f.values[gcIdx] === gcMax);
const gcMaxFrame = gcMaxRaw ? gcMaxRaw.frameIndex + 1 + frameIndexOffset : null;
const triMean = triVals.length > 0 ? triVals.reduce((a, b) => a + b, 0) / triVals.length : null;

// Find non-null fields
const nonNullFields = ALL_COLS.filter((col, i) => {
  const pos = colPositions[i];
  if (pos === -1) return false;
  return frames.some(f => f.values[pos] != null);
});

const summary = {
  runId,
  rowsInserted,
  nonNullFields,
  gcAllocMeanKB: gcMean != null ? +(gcMean / 1024).toFixed(2) : null,
  gcAllocMaxKB:  gcMax  != null ? +(gcMax  / 1024).toFixed(2) : null,
  gcAllocMaxFrame: gcMaxFrame,
  trianglesMean: triMean != null ? +triMean.toFixed(0) : null,
};

console.log(JSON.stringify(summary, null, 2));
