// merge-recovered-db.mjs
// 把当前 db.sqlite 里 4 条新 run + 关联记录合并进 db.sqlite.RECOVERED
import Database from 'better-sqlite3';
import fs from 'fs';

const RECOVERED = 'data/db.sqlite.RECOVERED';
const CURRENT = 'data/db.sqlite';
const OUT = 'data/db.sqlite.MERGED';

// 1. Copy recovered → out
fs.copyFileSync(RECOVERED, OUT);
console.log('[merge] copied recovered db to', OUT);

// Merge by attaching current and inserting only new rows.
const db = new Database(OUT);
db.pragma('journal_mode = WAL');
db.exec(`ATTACH DATABASE '${CURRENT.replace(/'/g, "''")}' AS cur`);

const tablesToMerge = ['runs', 'run_metrics', 'analyses', 'analysis_reports', 'reports'];
for (const t of tablesToMerge) {
  // Check if table exists in current
  const exists = db.prepare(`SELECT 1 FROM cur.sqlite_master WHERE type='table' AND name=?`).get(t);
  if (!exists) {
    console.log(`[merge] cur has no table ${t}, skip`);
    continue;
  }
  // Get cols
  const cols = db.prepare(`PRAGMA cur.table_info(${t})`).all().map(c => c.name);
  const colList = cols.map(c => `"${c}"`).join(', ');
  // INSERT OR IGNORE — by primary key
  const before = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  const sql = `INSERT OR IGNORE INTO ${t} (${colList}) SELECT ${colList} FROM cur.${t}`;
  const info = db.prepare(sql).run();
  const after = db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  console.log(`[merge] ${t}: ${before} → ${after} (+${after - before}, changed=${info.changes})`);
}

db.exec('DETACH DATABASE cur');
db.close();
console.log('[merge] done. Output:', OUT);
