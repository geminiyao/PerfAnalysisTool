/**
 * build-frame-index.ts
 *
 * One-time offline indexer: parses a Unity .pdata file and inserts
 * per-frame × per-thread × per-marker rows into web/data/prism.sqlite.
 *
 * Usage (run from web/ as cwd so better-sqlite3 resolves):
 *   npx tsx server/prism/build-frame-index.ts \
 *     --input <path.pdata> [--run-id <id>] [--db <path>]
 *
 * Default db: web/data/prism.sqlite
 * Default run-id: basename of --input without extension
 */

import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import {
  parsePdataFile,
  offsetToDisplayFrame,
} from '../../../.claude/skills/unity-profiler-analysis/scripts/lib/profiler/pdata-parser.js'

// ---------------------------------------------------------------------------
// CLI arg helpers
// ---------------------------------------------------------------------------
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined
}

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------
const inputArg = arg('input')
if (!inputArg) {
  console.error('ERROR: --input <path.pdata> is required')
  process.exit(1)
}

const inputPath = path.resolve(inputArg)
if (!fs.existsSync(inputPath)) {
  console.error(`ERROR: input file not found: ${inputPath}`)
  process.exit(1)
}

const defaultRunId = path.basename(inputPath, path.extname(inputPath))
const runId = arg('run-id') ?? defaultRunId

// Resolve db path relative to repo root (this script is at web/server/prism/)
const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const repoRoot = path.resolve(scriptDir, '..', '..', '..')
const defaultDbPath = path.join(repoRoot, 'web', 'data', 'prism.sqlite')
const dbPath = arg('db') ? path.resolve(arg('db')!) : defaultDbPath

const schemaPath = path.join(scriptDir, 'schema.sql')

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const t0 = Date.now()

console.error(`[build-frame-index] parsing: ${inputPath}`)
const data = parsePdataFile(inputPath)
console.error(`[build-frame-index] parsed ${data.frames.length} frames, ${data.markerNames.length} markerNames, ${data.threadNames.length} threadNames`)

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')

// Apply schema
const schemaSql = fs.readFileSync(schemaPath, 'utf8')
db.exec(schemaSql)

// Delete existing rows for this run (idempotent re-run)
db.prepare('DELETE FROM prism_frame_marker_samples WHERE run_id = ?').run(runId)
db.prepare('DELETE FROM prism_frame_meta WHERE run_id = ?').run(runId)
db.prepare('DELETE FROM prism_runs WHERE run_id = ?').run(runId)

// Prepared statements
const insertSample = db.prepare(`
  INSERT INTO prism_frame_marker_samples
    (run_id, frame_index, thread, marker_name, self_ms, total_ms, depth, parent_name, order_in_frame)
  VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

const insertFrameMeta = db.prepare(`
  INSERT INTO prism_frame_meta (run_id, frame_index, ms_start, ms_frame)
  VALUES (?, ?, ?, ?)
`)

const insertRun = db.prepare(`
  INSERT INTO prism_runs (run_id, source, pdata_path, frame_count, frame_index_offset, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`)

// Tracking sets
const distinctThreads = new Set<string>()
const distinctMarkers = new Set<string>()
let sampleRows = 0

// Single transaction for all bulk inserts
const bulkInsert = db.transaction(() => {
  for (let frameOffset = 0; frameOffset < data.frames.length; frameOffset++) {
    const frame = data.frames[frameOffset]
    const frameIndex = offsetToDisplayFrame(data, frameOffset)

    insertFrameMeta.run(runId, frameIndex, frame.msStartTime, frame.msFrame)

    for (const thread of frame.threads) {
      const threadName = data.threadNames[thread.threadIndex] ?? `thread_${thread.threadIndex}`
      distinctThreads.add(threadName)

      // Build parent stack for depth-first parent reconstruction
      // stackByDepth[d] = markerName of the last marker seen at depth d
      const stackByDepth: (string | null)[] = []

      for (let orderInFrame = 0; orderInFrame < thread.markers.length; orderInFrame++) {
        const m = thread.markers[orderInFrame]
        const markerName = data.markerNames[m.nameIndex] ?? `marker_${m.nameIndex}`
        distinctMarkers.add(markerName)

        const depth = m.depth
        const parentName: string | null = depth > 0 ? (stackByDepth[depth - 1] ?? null) : null
        stackByDepth[depth] = markerName
        // Truncate any deeper entries (avoids stale parent references)
        stackByDepth.length = depth + 1

        const selfMs = m.msMarkerTotal - m.msChildren
        insertSample.run(
          runId,
          frameIndex,
          threadName,
          markerName,
          selfMs,
          m.msMarkerTotal,
          depth,
          parentName,
          orderInFrame,
        )
        sampleRows++
      }
    }
  }
})

bulkInsert()

// Insert run metadata after bulk insert
insertRun.run(
  runId,
  'unity',
  inputPath,
  data.frames.length,
  data.frameIndexOffset,
  Date.now(),
)

db.close()

const elapsedMs = Date.now() - t0

const summary = {
  runId,
  frameCount: data.frames.length,
  threadCount: data.threadNames.length,
  markerNameCount: data.markerNames.length,
  sampleRows,
  distinctMarkers: distinctMarkers.size,
  distinctThreads: distinctThreads.size,
  elapsedMs,
}

console.log(JSON.stringify(summary, null, 2))
