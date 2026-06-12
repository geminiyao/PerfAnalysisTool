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

    CREATE TABLE IF NOT EXISTS simpleperf_sessions (
      id TEXT PRIMARY KEY,
      run_id TEXT,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      perf_data_path TEXT NOT NULL,
      binary_cache_path TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      project_name TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '',
      branch TEXT,
      build_id TEXT,
      device TEXT,
      scene TEXT,
      notes TEXT,
      result_json_path TEXT,
      result_text_path TEXT,
      folded_path TEXT,
      flamegraph_path TEXT,
      ai_report_path TEXT,
      error TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      duration INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_simpleperf_sessions_status ON simpleperf_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_simpleperf_sessions_created_at ON simpleperf_sessions(created_at);
    CREATE INDEX IF NOT EXISTS idx_simpleperf_sessions_run_id ON simpleperf_sessions(run_id);

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      asset_type TEXT NOT NULL,
      source TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      sha256 TEXT NOT NULL,
      storage_backend TEXT NOT NULL DEFAULT 'local',
      local_path TEXT,
      remote_key TEXT,
      mime_type TEXT,
      metadata_json TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_assets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      session_type TEXT NOT NULL,
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_assets_sha256 ON assets(sha256);
    CREATE INDEX IF NOT EXISTS idx_assets_asset_type ON assets(asset_type);
    CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at);
    CREATE INDEX IF NOT EXISTS idx_session_assets_session ON session_assets(session_id, session_type);
    CREATE INDEX IF NOT EXISTS idx_session_assets_asset_id ON session_assets(asset_id);

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

  ensureColumn(sqlite, 'simpleperf_sessions', 'ai_report_path', 'TEXT');

  // Maple ILOpt 同步采样专用表
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS maple_runs (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      device TEXT NOT NULL DEFAULT '',
      scene TEXT NOT NULL DEFAULT '',
      duration_sec INTEGER NOT NULL DEFAULT 0,
      frame_count INTEGER,
      mono_ns_start TEXT,
      mono_ns_end TEXT,
      perf_data_path TEXT,
      ptrace_path TEXT,
      pdata_paths TEXT,
      meta_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_maple_runs_label ON maple_runs(label);
    CREATE INDEX IF NOT EXISTS idx_maple_runs_status ON maple_runs(status);
    CREATE INDEX IF NOT EXISTS idx_maple_runs_created_at ON maple_runs(created_at);

    CREATE TABLE IF NOT EXISTS maple_pdata_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES maple_runs(id) ON DELETE CASCADE,
      total_frames INTEGER NOT NULL DEFAULT 0,
      avg_frame_ms REAL NOT NULL DEFAULT 0,
      p50_frame_ms REAL NOT NULL DEFAULT 0,
      p95_frame_ms REAL NOT NULL DEFAULT 0,
      p99_frame_ms REAL NOT NULL DEFAULT 0,
      max_frame_ms REAL NOT NULL DEFAULT 0,
      scripting_ms REAL NOT NULL DEFAULT 0,
      wait_for_target_fps_ms REAL NOT NULL DEFAULT 0,
      rendering_ms REAL NOT NULL DEFAULT 0,
      physics_ms REAL NOT NULL DEFAULT 0,
      gc_alloc_count REAL NOT NULL DEFAULT 0,
      gc_alloc_bytes REAL NOT NULL DEFAULT 0,
      slow_frames_33_count INTEGER NOT NULL DEFAULT 0,
      slow_frames_50_count INTEGER NOT NULL DEFAULT 0,
      slow_frames_33_rate REAL NOT NULL DEFAULT 0,
      frame_dist_json TEXT,
      top_markers_json TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_maple_pdata_run_id ON maple_pdata_results(run_id);

    CREATE TABLE IF NOT EXISTS maple_perfetto_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL REFERENCES maple_runs(id) ON DELETE CASCADE,
      profile_window_start_ns TEXT,
      profile_window_end_ns TEXT,
      profile_window_dur_ms REAL,
      main_thread_running_pct REAL,
      main_thread_runnable_pct REAL,
      main_thread_sleeping_pct REAL,
      cpu_freq_avg_mhz REAL,
      gpu_freq_avg_mhz REAL,
      gpu_utilization_pct REAL,
      frame_p50_ms REAL,
      frame_p95_ms REAL,
      frame_p99_ms REAL,
      frame_avg_ms REAL,
      binder_call_count INTEGER,
      binder_avg_dur_ms REAL,
      pss_mb REAL,
      parse_status TEXT NOT NULL DEFAULT 'ok',
      parse_notes TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_maple_perfetto_run_id ON maple_perfetto_results(run_id);

    CREATE TABLE IF NOT EXISTS maple_compare_reports (
      id TEXT PRIMARY KEY,
      base_run_id TEXT NOT NULL REFERENCES maple_runs(id),
      opt_run_id TEXT NOT NULL REFERENCES maple_runs(id),
      simpleperf_json_path TEXT,
      il2cpp_base_pct REAL,
      il2cpp_opt_pct REAL,
      il2cpp_delta_pp REAL,
      il2cpp_base_ms REAL,
      il2cpp_opt_ms REAL,
      il2cpp_delta_pct REAL,
      scripting_base_ms_per_frame REAL,
      scripting_opt_ms_per_frame REAL,
      scripting_delta_pct REAL,
      slow_frames_base_pct REAL,
      slow_frames_opt_pct REAL,
      main_running_base_pct REAL,
      main_running_opt_pct REAL,
      frame_p95_base_ms REAL,
      frame_p95_opt_ms REAL,
      conclusion_json TEXT,
      report_text TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_maple_compare_base ON maple_compare_reports(base_run_id);
    CREATE INDEX IF NOT EXISTS idx_maple_compare_opt ON maple_compare_reports(opt_run_id);
  `);
}

function ensureColumn(sqlite: Database.Database, table: string, column: string, type: string) {
  const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!rows.some(row => row.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function closeDb() {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}
