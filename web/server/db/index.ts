import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { getConfig } from '../utils/config.js';
import path from 'path';
import fs from 'fs';

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let sqlite: Database.Database | null = null;

export function getDb() {
  if (!db) {
    const config = getConfig();
    const dbPath = path.join(config.dataDir, 'db.sqlite');

    // 确保数据目录存在
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    sqlite = new Database(dbPath);

    // 开启 WAL 模式提升并发性能
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    db = drizzle(sqlite, { schema });

    // 自动建表
    initTables(sqlite);
  }
  return db;
}

function initTables(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      file_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT NOT NULL DEFAULT '',
      project_name TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '',
      branch TEXT,
      device TEXT,
      scene TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      duration INTEGER,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS metrics (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      total_frames INTEGER NOT NULL DEFAULT 0,
      avg_frame_ms REAL NOT NULL DEFAULT 0,
      max_frame_ms REAL NOT NULL DEFAULT 0,
      median_frame_ms REAL NOT NULL DEFAULT 0,
      p95_frame_ms REAL NOT NULL DEFAULT 0,
      fps REAL NOT NULL DEFAULT 0,
      jank_count INTEGER NOT NULL DEFAULT 0,
      jank_rate REAL NOT NULL DEFAULT 0,
      big_jank_count INTEGER NOT NULL DEFAULT 0,
      top_marker_count INTEGER NOT NULL DEFAULT 0,
      top_marker_total_ms REAL NOT NULL DEFAULT 0,
      spike_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      content TEXT,
      score REAL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_name);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
    CREATE INDEX IF NOT EXISTS idx_metrics_session_id ON metrics(session_id);
    CREATE INDEX IF NOT EXISTS idx_tags_session_id ON tags(session_id);
    CREATE INDEX IF NOT EXISTS idx_reports_session_id ON reports(session_id);

    CREATE TABLE IF NOT EXISTS optimize_results (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      issue_key TEXT NOT NULL,
      issue_type TEXT NOT NULL,
      result TEXT,
      source_files TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(session_id, issue_key)
    );

    CREATE INDEX IF NOT EXISTS idx_optimize_results_session_id ON optimize_results(session_id);
  `);
}

export function closeDb() {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}
