/**
 * verify-frame-index.ts
 *
 * Opens prism.sqlite and prints verification stats for a given run-id.
 *
 * Usage (run from web/ as cwd):
 *   npx tsx server/prism/verify-frame-index.ts [--run-id <id>] [--db <path>]
 *
 * Default run-id: "unity-outside-stressmove"
 * Default db: web/data/prism.sqlite
 */

import path from 'path'
import Database from 'better-sqlite3'

// ---------------------------------------------------------------------------
// CLI arg helpers
// ---------------------------------------------------------------------------
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined
}

// Resolve db path
const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const repoRoot = path.resolve(scriptDir, '..', '..', '..')
const defaultDbPath = path.join(repoRoot, 'web', 'data', 'prism.sqlite')
const dbPath = arg('db') ? path.resolve(arg('db')!) : defaultDbPath

const defaultRunId = 'unity-outside-stressmove'
const runId = arg('run-id') ?? defaultRunId

// ---------------------------------------------------------------------------
// Open DB
// ---------------------------------------------------------------------------
const db = new Database(dbPath, { readonly: true })

// ---------------------------------------------------------------------------
// 1. Basic counts
// ---------------------------------------------------------------------------
const totalRows = (db.prepare(
  'SELECT COUNT(*) AS n FROM prism_frame_marker_samples WHERE run_id = ?'
).get(runId) as { n: number }).n

const distinctMarkersRow = (db.prepare(
  'SELECT COUNT(DISTINCT marker_name) AS n FROM prism_frame_marker_samples WHERE run_id = ?'
).get(runId) as { n: number }).n

const distinctThreadsRow = (db.prepare(
  'SELECT COUNT(DISTINCT thread) AS n FROM prism_frame_marker_samples WHERE run_id = ?'
).get(runId) as { n: number }).n

const frameCountRow = (db.prepare(
  'SELECT COUNT(*) AS n FROM prism_frame_meta WHERE run_id = ?'
).get(runId) as { n: number }).n

console.log('=== Prism Frame Index Verification ===')
console.log(`run_id          : ${runId}`)
console.log(`db              : ${dbPath}`)
console.log('')
console.log('--- Basic counts ---')
console.log(`total sample rows    : ${totalRows.toLocaleString()}`)
console.log(`distinct markers     : ${distinctMarkersRow.toLocaleString()}`)
console.log(`distinct threads     : ${distinctThreadsRow.toLocaleString()}`)
console.log(`frame count (meta)   : ${frameCountRow.toLocaleString()}`)

// ---------------------------------------------------------------------------
// 2. Thread names
// ---------------------------------------------------------------------------
const threadRows = db.prepare(
  'SELECT DISTINCT thread FROM prism_frame_marker_samples WHERE run_id = ? ORDER BY thread'
).all(runId) as { thread: string }[]

console.log('')
console.log('--- Thread names ---')
for (const r of threadRows) {
  console.log(`  ${r.thread}`)
}

// ---------------------------------------------------------------------------
// 3. Top 10 markers by SUM(self_ms)
// ---------------------------------------------------------------------------
const topMarkers = db.prepare(`
  SELECT
    marker_name,
    SUM(self_ms)                     AS total_self_ms,
    COUNT(DISTINCT frame_index)      AS appears_in_frames,
    SUM(self_ms) / COUNT(DISTINCT frame_index) AS avg_self_ms_per_present_frame
  FROM prism_frame_marker_samples
  WHERE run_id = ?
  GROUP BY marker_name
  ORDER BY total_self_ms DESC
  LIMIT 10
`).all(runId) as {
  marker_name: string
  total_self_ms: number
  appears_in_frames: number
  avg_self_ms_per_present_frame: number
}[]

console.log('')
console.log('--- Top 10 markers by SUM(self_ms) ---')
console.log(
  `${'marker_name'.padEnd(50)} ${'total_self_ms'.padStart(14)} ${'appears_in_frames'.padStart(18)} ${'avg_self_ms/frame'.padStart(18)}`
)
console.log('-'.repeat(102))
for (const r of topMarkers) {
  console.log(
    `${r.marker_name.slice(0, 50).padEnd(50)} ${r.total_self_ms.toFixed(3).padStart(14)} ${String(r.appears_in_frames).padStart(18)} ${r.avg_self_ms_per_present_frame.toFixed(4).padStart(18)}`
  )
}

// ---------------------------------------------------------------------------
// 4. Frame-time sanity: p50/p95/p99/max of ms_frame
// ---------------------------------------------------------------------------
const frameTimes = (db.prepare(
  'SELECT ms_frame FROM prism_frame_meta WHERE run_id = ? ORDER BY ms_frame ASC'
).all(runId) as { ms_frame: number }[]).map(r => r.ms_frame)

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(Math.ceil((p / 100) * sorted.length) - 1, sorted.length - 1)
  return sorted[Math.max(0, idx)]
}

const p50 = percentile(frameTimes, 50)
const p95 = percentile(frameTimes, 95)
const p99 = percentile(frameTimes, 99)
const maxMs = frameTimes[frameTimes.length - 1] ?? 0

console.log('')
console.log('--- Frame-time percentiles (ms_frame) ---')
console.log(`  p50 : ${p50.toFixed(3)} ms`)
console.log(`  p95 : ${p95.toFixed(3)} ms`)
console.log(`  p99 : ${p99.toFixed(3)} ms`)
console.log(`  max : ${maxMs.toFixed(3)} ms`)

db.close()
