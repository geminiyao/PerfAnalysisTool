/**
 * 入库 p1-refresh 单源 profile + 生成加厚 Markdown 报告（Web 可见）
 *
 * 用法 (web/):
 *   npx tsx server/scripts/publish-thickened-reports.ts
 */
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { assetService } from '../services/asset-service.js';
import { saveRun, getRunMetrics } from '../services/run-store.js';
import { saveAnalysisWithReport } from '../services/analysis-store.js';
import { saveReportMarkdown } from '../services/report-export.js';
import { buildBuiltinSingleSourceMarkdown } from '../services/single-source-report-builder.js';
import type { PerfProfile, SourceId } from '../../shared/perf-model.js';
import type { SkillKind } from '../services/skill-config.js';
import { getSkillConfig } from '../services/skill-config.js';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const REFRESH = path.join(ROOT, 'output', 'p1-refresh');

async function ingestProfile(profilePath: string, label: string, scene: string, device: string): Promise<string> {
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8')) as PerfProfile & { meta?: Record<string, unknown> };
  for (const ref of profile.raw ?? []) {
    if (ref.assetId || !ref.localPath) continue;
    const rawPath = path.resolve(ref.localPath);
    if (!fs.existsSync(rawPath)) continue;
    const asset = await assetService.registerExistingFile({
      filePath: rawPath,
      assetType: 'raw',
      source: ref.source,
      metadata: { role: ref.role },
    });
    ref.assetId = asset.id;
    ref.sha256 = asset.sha256;
    ref.localPath = asset.localPath ?? rawPath;
  }
  const sources = Object.keys(profile.detail ?? {}) as SourceId[];
  const runId = `run_thick_${Date.now()}_${uuid().slice(0, 6)}`;
  const now = Date.now();
  saveRun({
    id: runId,
    label,
    sources: sources.length ? sources : ['unity_profiler'],
    status: 'ready',
    meta: { device, scene, frameCount: undefined },
    profile,
    createdAt: now,
    completedAt: now,
  });
  console.error(`[publish] ingested ${runId} sources=${sources.join(',')} metrics=${getRunMetrics(runId).length}`);
  return runId;
}

function publishReport(kind: SkillKind, runId: string, summaryPath: string): string {
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as Record<string, unknown>;
  const { headline, markdown } = buildBuiltinSingleSourceMarkdown(kind, summary);
  const cfg = getSkillConfig(kind);

  const exported = saveReportMarkdown(cfg.mockOutputSubdirs[0], `performance-report_${runId}`, markdown);
  const outDir = path.join(ROOT, 'web', 'data', 'results', runId);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'performance-report.md'), markdown, 'utf-8');
  fs.copyFileSync(summaryPath, path.join(outDir, cfg.profileSummaryFile));

  saveAnalysisWithReport(
    {
      id: `analysis_${runId}_${kind}`,
      mode: 'single',
      runIds: [runId],
      status: 'completed',
      skill: cfg.kind,
    },
    { headline, markdown, insights: [] },
    { analysisId: `analysis_${runId}_${kind}`, skill: cfg.kind },
  );

  console.error(`[publish] ${kind} report → ${exported}`);
  return exported;
}

async function main(): Promise<void> {
  const pairs: Array<{ kind: SkillKind; profile: string; summary: string; label: string }> = [
    {
      kind: 'perfetto',
      profile: path.join(REFRESH, 'perfetto', 'perfetto-profile.json'),
      summary: path.join(REFRESH, 'perfetto', 'perfetto-profile-summary.json'),
      label: 'p1_refresh_perfetto_thick',
    },
    {
      kind: 'simpleperf',
      profile: path.join(REFRESH, 'simpleperf', 'simpleperf-profile.json'),
      summary: path.join(REFRESH, 'simpleperf', 'simpleperf-profile-summary.json'),
      label: 'p1_refresh_simpleperf_battle',
    },
  ];

  const out: Record<string, string> = {};
  for (const p of pairs) {
    if (!fs.existsSync(p.profile)) {
      console.error(`[publish] skip ${p.kind}: missing ${p.profile}`);
      continue;
    }
    const runId = await ingestProfile(p.profile, p.label, 'StressTestBattleSimpleMode', 'PAL-AL00');
    const reportPath = publishReport(p.kind, runId, p.summary);
    out[p.kind] = runId;
    out[`${p.kind}_report`] = reportPath;
    out[`${p.kind}_url`] = `/cpu/runs/${runId}`;
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
