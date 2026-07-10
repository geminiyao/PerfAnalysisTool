-- Prism per-frame detail store schema
-- Database: web/data/prism.sqlite (SEPARATE from web/data/db.sqlite)

CREATE TABLE IF NOT EXISTS prism_runs (
  run_id              TEXT    PRIMARY KEY,
  source              TEXT    NOT NULL,
  pdata_path          TEXT    NOT NULL,
  frame_count         INTEGER NOT NULL,
  frame_index_offset  INTEGER NOT NULL,
  created_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prism_frame_meta (
  run_id       TEXT    NOT NULL,
  frame_index  INTEGER NOT NULL,   -- DISPLAY frame index (via offsetToDisplayFrame)
  ms_start     REAL    NOT NULL,
  ms_frame     REAL    NOT NULL,
  PRIMARY KEY (run_id, frame_index)
);

CREATE TABLE IF NOT EXISTS prism_frame_marker_samples (
  run_id         TEXT    NOT NULL,
  frame_index    INTEGER NOT NULL,   -- DISPLAY frame index
  thread         TEXT    NOT NULL,   -- thread name from threadNames[threadIndex]
  marker_name    TEXT    NOT NULL,
  self_ms        REAL    NOT NULL,   -- msMarkerTotal - msChildren
  total_ms       REAL    NOT NULL,   -- msMarkerTotal
  depth          INTEGER NOT NULL,
  parent_name    TEXT,               -- nullable
  order_in_frame INTEGER NOT NULL    -- 0-based index within (frame, thread)
);

CREATE INDEX IF NOT EXISTS idx_pfms_run_marker
  ON prism_frame_marker_samples (run_id, marker_name);

CREATE INDEX IF NOT EXISTS idx_pfms_run_frame
  ON prism_frame_marker_samples (run_id, frame_index);

CREATE INDEX IF NOT EXISTS idx_pfms_run_thread
  ON prism_frame_marker_samples (run_id, thread);

-- Covering index for queryMarkers: supports GROUP BY (marker_name, thread) with a fully
-- covering scan — includes all aggregated columns (self_ms, frame_index, total_ms) so
-- SQLite never needs to touch the base table rows for SUM(self_ms/total_ms), MAX(self_ms),
-- or the FIRST_VALUE(frame_index) window function.
CREATE INDEX IF NOT EXISTS idx_pfms_run_marker_thread_self
  ON prism_frame_marker_samples (run_id, marker_name, thread, self_ms DESC, frame_index, total_ms);

-- Covering index for getThreadTimeline: enables direct SEARCH on (run_id, frame_index, depth)
-- so single-frame depth=1 lookups don't scan all 3M rows.
CREATE INDEX IF NOT EXISTS idx_pfms_run_frame_depth_thread
  ON prism_frame_marker_samples (run_id, frame_index, depth, thread, marker_name, total_ms);

-- ─────────────────────────────────────────────────────────────────────────────
-- Per-frame rendering/memory counters sidecar (from .counters.json sidecar)
-- frame_index is 1-based display index, aligned to prism_frame_meta.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prism_frame_counters (
  run_id                TEXT    NOT NULL,
  frame_index           INTEGER NOT NULL,   -- 1-based display index, matches prism_frame_meta
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
);
