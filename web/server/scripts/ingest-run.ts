// ingest-run.ts — 通用"入库"环节 (源无关), 取代 unity 专用 ingest-unity-run.ts 的硬编码。
//
// 读任意 Provider 产出的 PerfProfile JSON (unity-profile.json / simpleperf-profile.json / ...),
// 把 profile.raw[] 里有 localPath 的原始文件登记为 Asset (raw→指针), 组装 Run 入库 runs/run_metrics。
//
// 与 Provider 解耦: Provider (skill/python 侧) 只解析出 PerfProfile JSON 落盘, 不碰 DB;
// 本脚本 (web 侧) 只读该 JSON 做存储 + 资产登记 —— 两侧仅通过磁盘 JSON 契约耦合, 互不 import。
//
// 用法:
//   tsx server/scripts/ingest-run.ts --profile <perf-profile.json> \
//        [--run-id <id>] [--label <l>] [--device <d>] [--scene <s>] [--project <p>] [--version <v>] [--notes <n>]
//
// 依据: docs/performance-platform-requirements-v2.md §9 (Asset), docs/report-spec-and-data-contract.md §1/§7。

import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { assetService } from '../services/asset-service.js';
import { saveRun, getRunMetrics } from '../services/run-store.js';
import type { PerfProfile, Run, SourceId } from '../../shared/perf-model.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

/** 从 detail (优先) 或已知字段里尽力取帧数, 取不到返回 undefined。 */
function deriveFrameCount(profile: PerfProfile): number | undefined {
  const unity = profile.detail?.unity_profiler as { frameSummary?: { count?: number } } | undefined;
  return unity?.frameSummary?.count;
}

async function main(): Promise<void> {
  const profilePath = arg('profile');
  if (!profilePath) {
    console.error('Usage: tsx server/scripts/ingest-run.ts --profile <perf-profile.json> [...meta]');
    process.exit(1);
  }

  // Provider 产出的 JSON 可能带顶层 meta (采集设备/时间等, 非 PerfProfile 归一化字段)。
  const profile = JSON.parse(fs.readFileSync(path.resolve(profilePath), 'utf-8')) as PerfProfile & {
    meta?: { device?: string };
  };

  // 1) 登记所有有 localPath 的 raw 文件为 Asset (raw→指针), 回填 assetId/sha256。
  for (const ref of profile.raw ?? []) {
    if (ref.assetId || !ref.localPath) continue;
    const rawPath = path.resolve(ref.localPath);
    if (!fs.existsSync(rawPath)) {
      console.error(`[ingest] WARN: raw 文件不存在, 仅存路径指针: ${rawPath}`);
      continue;
    }
    const asset = await assetService.registerExistingFile({
      filePath: rawPath,
      assetType: 'raw',
      source: ref.source,
      metadata: { role: ref.role },
    });
    ref.assetId = asset.id;
    ref.sha256 = asset.sha256;
    ref.localPath = asset.localPath ?? rawPath;
    console.error(`[ingest] raw asset registered: ${asset.id} (${asset.fileName}, ${(asset.fileSize / 1024 / 1024).toFixed(1)}MB, role=${ref.role})`);
  }

  // 2) 组装 Run。sources 取自 detail 的 keys (= 该 Run 含哪些源)。
  const sources = (Object.keys(profile.detail ?? {}) as SourceId[]);
  const runId = arg('run-id') || `run_${Date.now()}_${uuid().slice(0, 8)}`;
  const now = Date.now();
  const run: Run = {
    id: runId,
    label: arg('label') ?? arg('scene') ?? profile.raw?.[0]?.fileName ?? runId,
    sources: sources.length ? sources : ['unity_profiler'],
    status: 'ready',
    meta: {
      device: arg('device') ?? profile.meta?.device,
      scene: arg('scene'),
      projectName: arg('project'),
      version: arg('version'),
      notes: arg('notes'),
      frameCount: deriveFrameCount(profile),
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
