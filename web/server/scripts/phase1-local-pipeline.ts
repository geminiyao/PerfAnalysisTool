/**
 * phase1-local-pipeline.ts — 本地 ingest + cross 报告 + 可选单源 skill 报告
 *
 * 用法 (在 web/ 目录):
 *   npx tsx server/scripts/phase1-local-pipeline.ts --profile-dir ../output/p1-refresh
 *   npx tsx server/scripts/phase1-local-pipeline.ts --profile-dir ../output/p1-refresh --mock-reports
 */
import fs from 'fs';
import path from 'path';
import { generateCrossSourceAnalysisForRun } from '../services/cross-source-analysis-service.js';
import {
  runUnityProfilerSkillAnalysis,
  runPerfettoSkillAnalysis,
  runSimpleperfSkillAnalysis,
} from '../services/run-analysis-service.js';
import type { DeviceTier, PerfProfile, SourceId } from '../../shared/perf-model.js';
import { assetService } from '../services/asset-service.js';
import { saveRun, getRunMetrics } from '../services/run-store.js';
import { v4 as uuid } from 'uuid';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

function deriveFrameCount(profile: PerfProfile): number | undefined {
  for (const src of Object.keys(profile.detail ?? {})) {
    const fa = (profile.detail as Record<string, { frameAnalysis?: { summary?: { count?: number } } }>)[src]?.frameAnalysis;
    if (fa?.summary?.count) return fa.summary.count;
  }
  const unity = profile.detail?.unity_profiler as { frameSummary?: { count?: number } } | undefined;
  return unity?.frameSummary?.count;
}

async function ingestProfile(profilePath: string, meta: Record<string, unknown> = {}): Promise<string> {
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
  const runId = (meta.runId as string) || `run_${Date.now()}_${uuid().slice(0, 8)}`;
  const now = Date.now();
  saveRun({
    id: runId,
    label: (meta.label as string) ?? profile.raw?.[0]?.fileName ?? runId,
    sources: sources.length ? sources : ['unity_profiler'],
    status: 'ready',
    meta: {
      device: (meta.device as string) ?? profile.meta?.device as string | undefined,
      scene: (meta.scene as string) ?? profile.meta?.scene as string | undefined,
      frameCount: deriveFrameCount(profile),
      deviceTier: profile.meta?.deviceTier as DeviceTier | undefined,
    },
    profile,
    createdAt: now,
    completedAt: now,
  });
  const metrics = getRunMetrics(runId);
  console.error(`[pipeline] ingested ${runId} sources=${sources.join(',')} metrics=${metrics.length}`);
  return runId;
}

async function main(): Promise<void> {
  const profileDir = path.resolve(arg('profile-dir') ?? '../output/p1-refresh');
  const mockReports = process.argv.includes('--mock-reports');
  const crossPath = path.join(profileDir, 'cross-profile.json');
  if (!fs.existsSync(crossPath)) {
    console.error(`cross-profile.json not found in ${profileDir}; run scripts/rebuild-p1-samples.ps1 first`);
    process.exit(1);
  }

  const runId = await ingestProfile(crossPath, {
    label: 'p1_refresh_cross',
    device: 'PAL-AL00',
    scene: 'StressTestBattleSimpleMode',
    runId: `run_p1_refresh_${Date.now()}`,
  });

  const cross = await generateCrossSourceAnalysisForRun(runId);
  console.error(`[pipeline] cross report: ${cross.markdownPath}`);

  if (mockReports) {
    const runners: Record<string, (id: string, o: { cliProvider: 'mock'; onLog: (l: string) => void }) => Promise<{ markdownPath: string }>> = {
      unity_profiler: runUnityProfilerSkillAnalysis,
      perfetto: runPerfettoSkillAnalysis,
      simpleperf: runSimpleperfSkillAnalysis,
    };
    for (const src of ['unity_profiler', 'perfetto', 'simpleperf'] as const) {
      const sub = src === 'unity_profiler' ? 'unity' : src;
      const singlePath = path.join(profileDir, sub, `${sub === 'unity' ? 'unity' : src}-profile.json`);
      if (!fs.existsSync(singlePath)) continue;
      const singleRunId = await ingestProfile(singlePath, { label: `p1_refresh_${src}`, device: 'PAL-AL00', scene: 'StressTestBattleSimpleMode' });
      try {
        const res = await runners[src](singleRunId, { cliProvider: 'mock', onLog: l => console.error(l) });
        console.error(`[pipeline] ${src} mock report -> ${res.markdownPath}`);
      } catch (e) {
        console.error(`[pipeline] ${src} report failed:`, (e as Error).message);
      }
    }
  }

  console.log(JSON.stringify({ crossRunId: runId, crossMarkdown: cross.markdownPath }, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
