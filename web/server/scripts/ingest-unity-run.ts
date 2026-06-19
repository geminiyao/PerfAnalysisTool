// ingest-unity-run.ts — P1 unity 切片的"入库"环节。
//
// 读取 UnityProfilerProvider 产出的 unity-profile.json (PerfProfile), 把原始 .pdata 注册为 Asset
// (raw→指针, 本地起步; 后续可切 CDN), 组装成 Run 并物化进 runs / run_metrics。
//
// 与 Provider 的解耦: Provider (skill 侧, tsx) 只做解析出数据, 不碰 DB; 本脚本 (web 侧) 只读它产的
// PerfProfile JSON 做存储 + 资产登记 —— 两侧仅通过磁盘上的 PerfProfile JSON 契约耦合, 互不 import。
//
// 用法:
//   tsx server/scripts/ingest-unity-run.ts --profile <unity-profile.json> --pdata <file.pdata> \
//        [--run-id <id>] [--label <l>] [--device <d>] [--scene <s>] [--project <p>] [--version <v>] [--notes <n>]
//
// 依据: docs/performance-platform-requirements-v2.md §9 (Asset), docs/report-spec-and-data-contract.md §1/§7。

import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { assetService } from '../services/asset-service.js';
import { saveRun, getRunMetrics } from '../services/run-store.js';
import type { PerfProfile, Run, RawAssetRef } from '../../shared/perf-model.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const profilePath = arg('profile');
  const pdataPath = arg('pdata');
  if (!profilePath) {
    console.error('Usage: tsx server/scripts/ingest-unity-run.ts --profile <unity-profile.json> --pdata <file.pdata> [...meta]');
    process.exit(1);
  }

  const profile = JSON.parse(fs.readFileSync(path.resolve(profilePath), 'utf-8')) as PerfProfile;

  // 1) 原始 .pdata 注册为 Asset (raw→指针)。优先用 --pdata, 否则用 profile.raw 里的 localPath。
  const rawPath = pdataPath
    ? path.resolve(pdataPath)
    : profile.raw.find(r => r.role === 'unity_profiler_data')?.localPath;

  if (rawPath && fs.existsSync(rawPath)) {
    const asset = await assetService.registerExistingFile({
      filePath: rawPath,
      assetType: 'raw',
      source: 'unity_profiler',
      metadata: { role: 'unity_profiler_data' },
    });
    // 把 assetId 回填到 profile.raw 的 unity 原始指针上。
    const ref: RawAssetRef | undefined = profile.raw.find(r => r.role === 'unity_profiler_data');
    if (ref) {
      ref.assetId = asset.id;
      ref.sha256 = asset.sha256;
      ref.localPath = asset.localPath ?? rawPath;
    } else {
      profile.raw.push({
        source: 'unity_profiler', role: 'unity_profiler_data',
        assetId: asset.id, sha256: asset.sha256, localPath: asset.localPath ?? rawPath,
        fileName: path.basename(rawPath),
      });
    }
    console.error(`[ingest] raw asset registered: ${asset.id} (${asset.fileName}, ${(asset.fileSize / 1024 / 1024).toFixed(1)}MB)`);
  } else {
    console.error(`[ingest] WARN: raw .pdata not found, raw 仅存路径指针 (assetId 缺失)。`);
  }

  // 2) 组装 Run。
  const unityDetail = (profile.detail?.unity_profiler ?? {}) as { frameSummary?: { count?: number } };
  const runId = arg('run-id') || `run_${Date.now()}_${uuid().slice(0, 8)}`;
  const now = Date.now();
  const run: Run = {
    id: runId,
    label: arg('label') ?? arg('scene') ?? path.basename(rawPath ?? runId),
    sources: Object.keys(profile.detail ?? {}).length ? Object.keys(profile.detail!) : ['unity_profiler'],
    status: 'ready',
    meta: {
      device: arg('device'),
      scene: arg('scene'),
      projectName: arg('project'),
      version: arg('version'),
      notes: arg('notes'),
      frameCount: unityDetail.frameSummary?.count,
    },
    profile,
    createdAt: now,
    completedAt: now,
  };

  // 3) 入库 runs + run_metrics。
  saveRun(run);

  const stored = getRunMetrics(runId);
  console.error(`[ingest] Run 入库完成: id=${runId}, sources=${run.sources.join(',')}, run_metrics=${stored.length} 行`);
  console.log(JSON.stringify({
    runId,
    sources: run.sources,
    metricCount: stored.length,
    metricKeys: stored.map(m => m.key),
  }, null, 2));
}

main().catch(err => {
  console.error('[ingest] failed:', err?.message ?? err);
  process.exit(1);
});
