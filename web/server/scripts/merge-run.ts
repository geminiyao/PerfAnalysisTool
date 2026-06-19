// merge-run.ts — 把多份"单源 PerfProfile"合并成一份"多源 PerfProfile"(P4 Run 多源关联的地基)。
//
// 背景: P1 三刀分别把 base 同一次采集的 unity_profiler / simpleperf / perfetto 各自入库成
// 3 个独立单源 Run。但领域模型 (perf-model.ts §168) 本意是【一个 Run = 一次采集, sources: SourceId[]】。
// 本脚本把 N 份单源 profile JSON 合并成一份带 detail.{三源} 的 PerfProfile JSON, 再交给
// 通用 ingest-run.ts 入库 → 得到 1 个多源 Run, 供 cross-source-analysis skill 消费。
//
// 纯合并 (不碰 DB): 读 JSON → 拼 raw/core/detail → 落盘。存储交给 ingest-run.ts (职责单一)。
//
// 用法:
//   tsx server/scripts/merge-run.ts --out <merged.json> --profile <a.json> --profile <b.json> [--profile <c.json> ...]
//
// 依据: docs/analysis-framework-design.md §5 (Run=raw+core+detail), perf-model.ts §168/§260,
//       docs/report-spec-and-data-contract.md §1。

import fs from 'fs';
import path from 'path';
import type { PerfProfile, Metric, FrameStat, ThreadStat, SystemStat } from '../../shared/perf-model.js';

type ProfileWithMeta = PerfProfile & { meta?: Record<string, unknown> };

function args(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < process.argv.length - 1; i++) {
    if (process.argv[i] === `--${name}`) out.push(process.argv[i + 1]);
  }
  return out;
}

function main(): void {
  const profilePaths = args('profile');
  const outPath = args('out')[0];
  if (profilePaths.length < 2 || !outPath) {
    console.error('Usage: tsx server/scripts/merge-run.ts --out <merged.json> --profile <a> --profile <b> [--profile <c>]');
    process.exit(1);
  }

  const profiles = profilePaths.map(p => {
    const abs = path.resolve(p);
    return { abs, j: JSON.parse(fs.readFileSync(abs, 'utf-8')) as ProfileWithMeta };
  });

  const raw = profiles.flatMap(({ j }) => j.raw ?? []);
  const metrics: Metric[] = profiles.flatMap(({ j }) => j.core?.metrics ?? []);
  const frame: FrameStat[] = profiles.flatMap(({ j }) => j.core?.frame ?? []);
  const threads: ThreadStat[] = profiles.flatMap(({ j }) => j.core?.threads ?? []);

  // system: 各源各贡献部分字段, 合并 (后者非空覆盖前者)。三源里仅 perfetto 产 system。
  const system: SystemStat = {};
  for (const { j } of profiles) Object.assign(system, j.core?.system ?? {});

  // detail: 各源原样并入 (键即 SourceId)。ingest-run.ts 据 detail 的 keys 推断 sources。
  const detail: Record<string, unknown> = {};
  for (const { j } of profiles) Object.assign(detail, j.detail ?? {});

  // confidence: 合并 notes; 跨源帧口径不同 (playerloop vs choreographer) 显式标注禁直比。
  const notes: string[] = [];
  let alignmentOk = true;
  for (const { j } of profiles) {
    const c = j.core?.confidence;
    if (c?.notes) notes.push(...c.notes);
    if (c && c.perFrameAlignmentOk === false) alignmentOk = false;
  }
  const frameDefs = [...new Set(frame.map(f => f.frameDefinition))];
  if (frameDefs.length > 1) {
    notes.push(`跨源帧口径并存 (${frameDefs.join(' / ')}); 不同口径帧时长禁直比, 仅同口径可比。`);
  }

  // 顶层 meta: 合并各源采集元信息 (device/scene/durationSec/recordTime/event/pid…)。
  const meta: Record<string, unknown> = {};
  for (const { j } of profiles) Object.assign(meta, j.meta ?? {});

  const schemaVersion = Math.max(1, ...profiles.map(({ j }) => j.core?.schemaVersion ?? 1));

  const merged: ProfileWithMeta = {
    raw,
    core: { schemaVersion, metrics, frame, threads, system, confidence: { perFrameAlignmentOk: alignmentOk, notes } },
    detail,
    meta,
  };

  const absOut = path.resolve(outPath);
  fs.mkdirSync(path.dirname(absOut), { recursive: true });
  fs.writeFileSync(absOut, JSON.stringify(merged, null, 2), 'utf-8');

  console.error(`[merge] 合并 ${profiles.length} 源 → ${absOut}`);
  console.error(`[merge]   sources(detail keys)= ${Object.keys(detail).join(', ')}`);
  console.error(`[merge]   raw=${raw.length}  metrics=${metrics.length}  frame=${frame.length}  threads=${threads.length}  system keys=${Object.keys(system).length}`);
  console.log(JSON.stringify({ out: absOut, sources: Object.keys(detail), metrics: metrics.length, frame: frame.length, threads: threads.length }, null, 2));
}

main();
