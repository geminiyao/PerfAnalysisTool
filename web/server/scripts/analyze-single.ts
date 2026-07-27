// analyze-single.ts — 三源综合分析正式入口（CLI / Web 共用 service）。
//
// 架构原则：
//   • 业务逻辑全在 web/server/services/，本脚本仅作 CLI 薄包装
//   • Web 端的"生成报告"按钮调同一个 generateCrossSourceAnalysisForRun()
//   • 不在脚本里塞业务，避免 simpleperf-diff 时代 cli/web 两条路径的旧坑
//
// 用法（已有三源 profile.json 模式，Phase 0 起步）:
//   tsx web/server/scripts/analyze-single.ts --profile-dir <dir>
//
//   <dir> 内需有：
//     - cross-profile.json（三源合一），或
//     - unity/unity-profile.json + perfetto/perfetto-profile.json + simpleperf/simpleperf-profile.json
//
// 用法（原始文件模式，Phase 4+ 实现）:
//   tsx web/server/scripts/analyze-single.ts \
//     --pdata <pdata> --pftrace <pftrace> --simpleperf <data> --binary-cache <dir> \
//     --device <name> --scene <name>
//
// 输出：
//   - cross-source-evidence.json  (digest, 由 cross-source-digest.ts 产)
//   - performance-report_<runId>_<ts>.md  (综合报告 markdown)
//   - 入库 analyses + analysis_reports
//
// 依据：.claude/skills/cross-source-analysis/SKILL.md

import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { generateCrossSourceAnalysisForRun } from '../services/cross-source-analysis-service.js';
import { assetService } from '../services/asset-service.js';
import { saveRun, getRunMetrics } from '../services/run-store.js';
import type { DeviceTier, PerfProfile, SourceId } from '../../shared/perf-model.js';

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

async function ingestProfile(
  profilePath: string,
  meta: { runId?: string; label?: string; device?: string; scene?: string } = {},
): Promise<string> {
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
  const runId = meta.runId || `run_${Date.now()}_${uuid().slice(0, 8)}`;
  const now = Date.now();
  saveRun({
    id: runId,
    label: meta.label ?? profile.raw?.[0]?.fileName ?? runId,
    sources: sources.length ? sources : ['unity_profiler'],
    status: 'ready',
    meta: {
      device: meta.device ?? (profile.meta?.device as string | undefined),
      scene: meta.scene ?? (profile.meta?.scene as string | undefined),
      frameCount: deriveFrameCount(profile),
      deviceTier: profile.meta?.deviceTier as DeviceTier | undefined,
    },
    profile,
    createdAt: now,
    completedAt: now,
  });
  const metrics = getRunMetrics(runId);
  console.error(`[analyze] ingested ${runId} sources=${sources.join(',')} metrics=${metrics.length}`);
  return runId;
}

interface ProfileDirInputs {
  crossProfile?: string;
  unity?: string;
  perfetto?: string;
  simpleperf?: string;
}

function detectProfileDir(profileDir: string): ProfileDirInputs {
  const out: ProfileDirInputs = {};
  const cross = path.join(profileDir, 'cross-profile.json');
  if (fs.existsSync(cross)) out.crossProfile = cross;
  for (const [src, sub, file] of [
    ['unity', 'unity', 'unity-profile.json'],
    ['perfetto', 'perfetto', 'perfetto-profile.json'],
    ['simpleperf', 'simpleperf', 'simpleperf-profile.json'],
  ] as const) {
    const p = path.join(profileDir, sub, file);
    if (fs.existsSync(p)) (out as Record<string, string>)[src] = p;
  }
  return out;
}

async function main(): Promise<void> {
  // —— 模式 A：原始文件输入（Phase 4+ 接入，目前明确报错并指引）——
  if (arg('pdata') || arg('pftrace') || arg('simpleperf')) {
    console.error(
      '[analyze] 原始文件输入模式（--pdata/--pftrace/--simpleperf）当前未实现\n' +
      '  Phase 4+ 接入；当前请先用各源 provider 产出 *-profile.json，再用 --profile-dir 模式：\n' +
      '    1) python build_perfetto_profile.py --trace x.pftrace --out <dir>/perfetto/\n' +
      '    2) python build_simpleperf_profile.py --perf x.data --out <dir>/simpleperf/ --binary-cache <bc>\n' +
      '    3) tsx unity-profiler-analysis/scripts/preprocess.ts --input x.pdata --output-dir <dir>/unity/\n' +
      '    4) tsx web/server/scripts/analyze-single.ts --profile-dir <dir>'
    );
    process.exit(2);
  }

  const profileDir = arg('profile-dir');
  if (!profileDir) {
    console.error(
      'Usage: tsx web/server/scripts/analyze-single.ts --profile-dir <dir> [--device <d>] [--scene <s>] [--label <l>]\n' +
      '\n' +
      '  <dir> 内需要：\n' +
      '    - cross-profile.json（三源合一），或\n' +
      '    - unity/unity-profile.json + perfetto/perfetto-profile.json + simpleperf/simpleperf-profile.json\n'
    );
    process.exit(1);
  }

  const dir = path.resolve(profileDir);
  const inputs = detectProfileDir(dir);
  const device = arg('device') ?? 'unknown';
  const scene = arg('scene') ?? 'unknown';
  const label = arg('label') ?? `cross_${path.basename(dir)}`;
  const runId = `run_cross_${Date.now()}_${uuid().slice(0, 6)}`;

  if (!inputs.crossProfile && !(inputs.unity && inputs.perfetto && inputs.simpleperf)) {
    console.error(
      `[analyze] ${dir} 下未发现 cross-profile.json，也未发现完整三源 *-profile.json\n` +
      `  期待结构（任一）：\n` +
      `    a) ${dir}/cross-profile.json\n` +
      `    b) ${dir}/{unity,perfetto,simpleperf}/*-profile.json`
    );
    process.exit(1);
  }

  // 优先用合一的 cross-profile.json（与 phase1-local-pipeline 一致）
  const profilePath = inputs.crossProfile
    ?? (() => {
      throw new Error('Phase 0 暂只支持 cross-profile.json 输入；三源单独 profile.json 合并入同一 runId 由 Phase 0+ 实现');
    })();

  console.error(`[analyze] profile=${profilePath} device=${device} scene=${scene}`);
  await ingestProfile(profilePath, { runId, label, device, scene });

  const result = await generateCrossSourceAnalysisForRun(runId);
  console.error(`[analyze] cross digest → ${result.digestPath}`);
  console.error(`[analyze] cross report → ${result.markdownPath}`);

  console.log(JSON.stringify({
    runId,
    digestPath: result.digestPath,
    markdownPath: result.markdownPath,
    headline: result.report.headline,
    insightCount: result.report.insights.length,
  }, null, 2));
}

main().catch(err => {
  console.error('[analyze] failed:', err.stack || err.message);
  process.exit(1);
});
