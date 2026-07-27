"""runs_writer.py - runs/runMetrics 表写入器（C2 CL-9）

Orchestrator 收尾时调用，把采集结果写入 web/data/db.sqlite 的 runs + run_metrics 表。
复用现有 schema.ts 的 Run/runMetrics 模型（web/server/db/schema.ts）。

设计：
  - 直接用 Python sqlite3 写入（不依赖 web server 运行）
  - WAL 模式，与 web server 并发安全
  - 表不存在则自动建（CREATE TABLE IF NOT EXISTS，与 db/index.ts 一致）
  - 写入失败不中断采集流程（打印警告，返回 None）
"""

import json
import os
import sqlite3
import time
import uuid
from typing import Dict, List, Optional


# runs / run_metrics 建表 SQL（与 web/server/db/index.ts 一致）
_CREATE_RUNS_SQL = """
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  sources TEXT,
  device TEXT NOT NULL DEFAULT '',
  scene TEXT NOT NULL DEFAULT '',
  project_name TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  branch TEXT,
  created_by TEXT NOT NULL DEFAULT '',
  notes TEXT,
  duration_sec INTEGER,
  frame_count INTEGER,
  mono_ns_start TEXT,
  mono_ns_end TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  core_frame_json TEXT,
  core_threads_json TEXT,
  core_system_json TEXT,
  core_confidence_json TEXT,
  raw_json TEXT,
  detail_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_name);
CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at);
"""

_CREATE_RUN_METRICS_SQL = """
CREATE TABLE IF NOT EXISTS run_metrics (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  confidence TEXT
);
CREATE INDEX IF NOT EXISTS idx_run_metrics_run_id ON run_metrics(run_id);
CREATE INDEX IF NOT EXISTS idx_run_metrics_key ON run_metrics(key);
"""


def _default_db_path() -> str:
    """默认 db.sqlite 路径：PROJECT_ROOT/web/data/db.sqlite"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(script_dir))
    return os.path.join(project_root, "web", "data", "db.sqlite")


class RunsWriter:
    """runs + run_metrics 表写入器。

    用法：
        writer = RunsWriter()
        run_id = writer.write_run(meta, file_paths, tools)
    """

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path or _default_db_path()

    def write_run(
        self,
        run_id: str,
        meta: Dict,
        file_paths: Dict[str, str],
        tools: List[str],
        version: str = "",
    ) -> Optional[str]:
        """写入 runs 行 + 初始 run_metrics 行。

        Args:
            run_id: Run ID（通常 = run_label）
            meta: meta.json 内容
            file_paths: {perf_data: path, pftrace: path, pdata: [paths]}
            tools: 使用的工具列表
            version: 游戏版本号

        Returns:
            run_id on success, None on failure
        """
        if not os.path.exists(os.path.dirname(self.db_path)):
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

        try:
            conn = sqlite3.connect(self.db_path, timeout=10)
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")

            # 确保表存在
            conn.executescript(_CREATE_RUNS_SQL)
            conn.executescript(_CREATE_RUN_METRICS_SQL)

            now_ms = int(time.time() * 1000)

            # ---- 写 runs 行（upsert）----
            sources_json = json.dumps(tools)
            raw_json = json.dumps({
                "perf_data": file_paths.get("perf_data"),
                "pftrace": file_paths.get("pftrace"),
                "pdata": file_paths.get("pdata", []),
            })

            status = "ready" if meta.get("game_profile_ok", False) else "pending"
            completed_at = now_ms if status == "ready" else None

            conn.execute(
                """INSERT INTO runs (
                    id, label, status, sources, device, scene, project_name,
                    version, created_by, notes, duration_sec, frame_count,
                    mono_ns_start, mono_ns_end, schema_version,
                    raw_json, created_at, completed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    label=excluded.label, status=excluded.status,
                    sources=excluded.sources, device=excluded.device,
                    scene=excluded.scene, project_name=excluded.project_name,
                    version=excluded.version, duration_sec=excluded.duration_sec,
                    frame_count=excluded.frame_count,
                    mono_ns_start=excluded.mono_ns_start,
                    mono_ns_end=excluded.mono_ns_end,
                    raw_json=excluded.raw_json,
                    completed_at=excluded.completed_at
                """,
                (
                    run_id,
                    meta.get("label", run_id),
                    status,
                    sources_json,
                    meta.get("device", ""),
                    meta.get("scene", ""),
                    meta.get("project", ""),
                    version,
                    "collector",
                    None,
                    meta.get("duration_sec"),
                    meta.get("frame_count"),
                    str(meta["mono_ns_start"]) if meta.get("mono_ns_start") is not None else None,
                    str(meta["mono_ns_end"]) if meta.get("mono_ns_end") is not None else None,
                    1,  # schema_version
                    raw_json,
                    now_ms,
                    completed_at,
                ),
            )

            # ---- 写 run_metrics 行（先删旧再插新，幂等）----
            conn.execute("DELETE FROM run_metrics WHERE run_id = ?", (run_id,))

            metrics_to_write = []

            # 采集时已知指标
            if meta.get("duration_sec") is not None:
                metrics_to_write.append(("collect.duration_sec", float(meta["duration_sec"]), "s", "collector", "high"))
            if meta.get("frame_count") is not None:
                metrics_to_write.append(("collect.frame_count", float(meta["frame_count"]), "frames", "collector", "high"))

            mono_start = meta.get("mono_ns_start")
            mono_end = meta.get("mono_ns_end")
            if mono_start is not None and mono_end is not None:
                duration_ns = int(mono_end) - int(mono_start)
                duration_sec_actual = duration_ns / 1e9
                metrics_to_write.append(("collect.duration_actual_sec", duration_sec_actual, "s", "collector", "high"))

            for key, value, unit, source, confidence in metrics_to_write:
                conn.execute(
                    """INSERT INTO run_metrics (id, run_id, key, value, unit, source, confidence)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (str(uuid.uuid4()), run_id, key, value, unit, source, confidence),
                )

            conn.commit()
            conn.close()

            print(f"[INFO] [runs_writer] runs 表写入成功: id={run_id} status={status} metrics={len(metrics_to_write)}")
            return run_id

        except Exception as e:
            print(f"[WARN] [runs_writer] 写入 runs 表失败（不影响本地数据）: {e}")
            try:
                conn.close()
            except Exception:
                pass
            return None
