// Analysis + Report 物化存储 (P4): analyses / analysis_reports 入库。
//
// 依据: docs/p0-domain-model-migration.md §1/§3, docs/report-spec-and-data-contract.md §0。

import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { analyses, analysisReports } from '../db/schema.js';
import type { Analysis, Report } from '../../shared/perf-model.js';

export interface SaveAnalysisOptions {
  /** 固定 analysis id (复跑覆盖); 默认自动生成。 */
  analysisId?: string;
  skill?: string;
}

/** 写入 (覆盖) 一次分析任务 + 其报告产出。 */
export function saveAnalysisWithReport(
  analysis: Omit<Analysis, 'createdAt' | 'reportId'> & { createdAt?: number },
  report: Omit<Report, 'id' | 'analysisId' | 'createdAt'> & { id?: string; createdAt?: number },
  opts: SaveAnalysisOptions = {},
): { analysis: Analysis; report: Report } {
  const db = getDb();
  const now = Date.now();
  const analysisId = opts.analysisId ?? analysis.id ?? uuid();
  const reportId = report.id ?? uuid();
  const skill = opts.skill ?? analysis.skill ?? 'cross-source-analysis';

  const analysisRow = {
    id: analysisId,
    mode: analysis.mode,
    runIds: JSON.stringify(analysis.runIds),
    status: analysis.status,
    skill,
    reportId,
    error: analysis.error ?? null,
    createdAt: analysis.createdAt ?? now,
    completedAt: analysis.completedAt ?? (analysis.status === 'completed' ? now : null),
  };

  const exists = db.select({ id: analyses.id }).from(analyses).where(eq(analyses.id, analysisId)).get();
  if (exists) {
    const { id: _omit, ...update } = analysisRow;
    db.update(analyses).set(update).where(eq(analyses.id, analysisId)).run();
    db.delete(analysisReports).where(eq(analysisReports.analysisId, analysisId)).run();
  } else {
    db.insert(analyses).values(analysisRow).run();
  }

  const reportRow = {
    id: reportId,
    analysisId,
    headline: report.headline ?? null,
    markdown: report.markdown ?? '',
    insightsJson: JSON.stringify(report.insights ?? []),
    createdAt: report.createdAt ?? now,
  };
  db.insert(analysisReports).values(reportRow).run();

  return {
    analysis: {
      id: analysisId,
      mode: analysis.mode,
      runIds: analysis.runIds,
      status: analysis.status,
      skill,
      createdAt: analysisRow.createdAt,
      completedAt: analysisRow.completedAt ?? undefined,
      error: analysis.error,
      reportId,
    },
    report: {
      id: reportId,
      analysisId,
      headline: report.headline,
      markdown: report.markdown,
      insights: report.insights,
      createdAt: reportRow.createdAt,
    },
  };
}

/** 按 runId 查找关联的 cross-source 分析报告 (P2 详情页交叉结论卡)。 */
export function getAnalysisReportByRunId(runId: string): { analysis: Analysis; report: Report } | null {
  const db = getDb();
  const all = db.select().from(analyses).all();
  const match = all.find(a => {
    try {
      const ids = JSON.parse(a.runIds) as string[];
      return ids.includes(runId);
    } catch {
      return false;
    }
  });
  if (!match) return null;
  return getAnalysisReport(match.id);
}

/** 读取某 analysis 的报告 (验收 / API)。 */
export function getAnalysisReport(analysisId: string): { analysis: Analysis; report: Report } | null {
  const db = getDb();
  const a = db.select().from(analyses).where(eq(analyses.id, analysisId)).get();
  if (!a) return null;
  const r = db.select().from(analysisReports).where(eq(analysisReports.analysisId, analysisId)).get();
  if (!r) return null;

  return {
    analysis: {
      id: a.id,
      mode: a.mode as Analysis['mode'],
      runIds: JSON.parse(a.runIds) as string[],
      status: a.status as Analysis['status'],
      skill: a.skill ?? undefined,
      createdAt: a.createdAt,
      completedAt: a.completedAt ?? undefined,
      error: a.error ?? undefined,
      reportId: a.reportId ?? undefined,
    },
    report: {
      id: r.id,
      analysisId: r.analysisId,
      headline: r.headline ?? undefined,
      markdown: r.markdown ?? '',
      insights: JSON.parse(r.insightsJson ?? '[]'),
      createdAt: r.createdAt,
    },
  };
}
