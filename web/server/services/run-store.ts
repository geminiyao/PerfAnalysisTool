// 新领域模型 Run 的物化存储 (P1): 把 Provider 产出的 PerfProfile 写入 runs / run_metrics。
//
// 与只读适配器 (run-adapter.ts) 的关系: 适配器把【旧表】历史数据映射成 Run (过渡兜底);
// 本服务把【新 Provider】出的 Run 物化进新表, 是 P1 "Run 入库" 的落点。
// core 的 frame/threads/system/confidence 以 JSON 物化进 runs; 指标袋单独落 run_metrics (趋势/列表硬依赖)。
//
// 依据: docs/p0-domain-model-migration.md §1/§3, docs/report-spec-and-data-contract.md §7。

import { eq, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { runs, runMetrics } from '../db/schema.js';
import type { Run } from '../../shared/perf-model.js';

/** 写入 (覆盖) 一个 Run: upsert runs 行 + 重建其 run_metrics 指标袋。 */
export function saveRun(run: Run): void {
  const db = getDb();
  const now = Date.now();

  const row = {
    id: run.id,
    label: run.label ?? null,
    status: run.status,
    sources: JSON.stringify(run.sources ?? []),
    device: run.meta.device ?? '',
    scene: run.meta.scene ?? '',
    projectName: run.meta.projectName ?? '',
    version: run.meta.version ?? '',
    branch: run.meta.branch ?? null,
    createdBy: run.meta.createdBy ?? '',
    notes: run.meta.notes ?? null,
    durationSec: run.meta.durationSec ?? null,
    frameCount: run.meta.frameCount ?? null,
    monoNsStart: run.meta.monoNsStart ?? null,
    monoNsEnd: run.meta.monoNsEnd ?? null,
    schemaVersion: run.profile.core.schemaVersion,
    coreFrameJson: JSON.stringify(run.profile.core.frame ?? []),
    coreThreadsJson: JSON.stringify(run.profile.core.threads ?? []),
    coreSystemJson: JSON.stringify(run.profile.core.system ?? {}),
    coreConfidenceJson: JSON.stringify(run.profile.core.confidence ?? { perFrameAlignmentOk: true, notes: [] }),
    rawJson: JSON.stringify(run.profile.raw ?? []),
    detailJson: JSON.stringify(run.profile.detail ?? {}),
    error: run.error ?? null,
    createdAt: run.createdAt || now,
    completedAt: run.completedAt ?? (run.status === 'ready' ? now : null),
  };

  const exists = db.select({ id: runs.id }).from(runs).where(eq(runs.id, run.id)).get();
  if (exists) {
    const { id: _omit, ...update } = row;
    db.update(runs).set(update).where(eq(runs.id, run.id)).run();
    db.delete(runMetrics).where(eq(runMetrics.runId, run.id)).run();
  } else {
    db.insert(runs).values(row).run();
  }

  const metricRows = (run.profile.core.metrics ?? []).map(m => ({
    id: uuid(),
    runId: run.id,
    key: m.key,
    value: m.value,
    unit: m.unit,
    source: m.source,
    confidence: m.confidence ?? null,
  }));
  if (metricRows.length > 0) {
    db.insert(runMetrics).values(metricRows).run();
  }
}

/** 读取一个 Run 的指标袋 (供验收核对 / 趋势)。 */
export function getRunMetrics(runId: string) {
  const db = getDb();
  return db.select().from(runMetrics).where(eq(runMetrics.runId, runId)).all();
}

function rowToRun(row: typeof runs.$inferSelect, metrics: typeof runMetrics.$inferSelect[]): Run {
  return {
    id: row.id,
    label: row.label ?? undefined,
    sources: JSON.parse(row.sources ?? '[]') as Run['sources'],
    status: row.status as Run['status'],
    meta: {
      device: row.device || undefined,
      scene: row.scene || undefined,
      projectName: row.projectName || undefined,
      version: row.version || undefined,
      branch: row.branch ?? undefined,
      createdBy: row.createdBy || undefined,
      notes: row.notes ?? undefined,
      durationSec: row.durationSec ?? undefined,
      frameCount: row.frameCount ?? undefined,
      monoNsStart: row.monoNsStart ?? undefined,
      monoNsEnd: row.monoNsEnd ?? undefined,
    },
    profile: {
      raw: JSON.parse(row.rawJson ?? '[]'),
      core: {
        schemaVersion: row.schemaVersion,
        metrics: metrics.map(m => ({
          key: m.key,
          value: m.value,
          unit: m.unit as Run['profile']['core']['metrics'][0]['unit'],
          source: m.source as Run['profile']['core']['metrics'][0]['source'],
          confidence: (m.confidence as Run['profile']['core']['metrics'][0]['confidence']) ?? undefined,
        })),
        frame: JSON.parse(row.coreFrameJson ?? '[]'),
        threads: JSON.parse(row.coreThreadsJson ?? '[]'),
        system: JSON.parse(row.coreSystemJson ?? '{}'),
        confidence: JSON.parse(row.coreConfidenceJson ?? '{"perFrameAlignmentOk":true,"notes":[]}'),
      },
      detail: JSON.parse(row.detailJson ?? '{}'),
    },
    createdAt: row.createdAt,
    completedAt: row.completedAt ?? undefined,
    error: row.error ?? undefined,
  };
}

export interface RunListItem {
  id: string;
  label?: string;
  sources: Run['sources'];
  status: Run['status'];
  device: string;
  scene: string;
  projectName: string;
  version: string;
  frameCount?: number;
  metricCount: number;
  createdAt: number;
}

/** 列出 runs 表 (新模型, 不读旧表)。 */
export function listRuns(limit = 50, offset = 0): { items: RunListItem[]; total: number } {
  const db = getDb();
  const rows = db.select().from(runs).orderBy(desc(runs.createdAt)).limit(limit).offset(offset).all();
  const countRow = db.select({ id: runs.id }).from(runs).all();
  const total = countRow.length;

  const items: RunListItem[] = rows.map(row => {
    const metricCount = db
      .select({ c: runMetrics.id })
      .from(runMetrics)
      .where(eq(runMetrics.runId, row.id))
      .all().length;
    return {
      id: row.id,
      label: row.label ?? undefined,
      sources: JSON.parse(row.sources ?? '[]') as Run['sources'],
      status: row.status as Run['status'],
      device: row.device,
      scene: row.scene,
      projectName: row.projectName,
      version: row.version,
      frameCount: row.frameCount ?? undefined,
      metricCount,
      createdAt: row.createdAt,
    };
  });

  return { items, total };
}

/** 读取完整 Run (runs + run_metrics + detail)。 */
export function getRun(runId: string): Run | null {
  const db = getDb();
  const row = db.select().from(runs).where(eq(runs.id, runId)).get();
  if (!row) return null;
  const metrics = getRunMetrics(runId);
  return rowToRun(row, metrics);
}
