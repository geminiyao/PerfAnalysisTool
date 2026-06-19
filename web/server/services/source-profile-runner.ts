// 三源 profile 预构建 + Mock 报告匹配

import fs from 'fs';
import path from 'path';
import { getConfig } from '../utils/config.js';
import {
  buildPerfettoProfile,
  buildSimpleperfProfile,
  type PerfettoIngestOptions,
} from './run-ingest-service.js';
import { runUnityPreprocessScript } from './unity-preprocess-runner.js';
import type { SkillKind } from './skill-config.js';
import { getSkillConfig } from './skill-config.js';

const DEFAULT_SIMPLEPERF_BINARY_CACHE = 'k:/AI/PerfAnalysisTool_Codebuddy/simpleperf/symbols/binary_cache';

export function resolveSimpleperfBinaryCache(runRaw?: { role?: string; localPath?: string }[]): string {
  const fromRun = runRaw?.find(r => r.role?.includes('binary_cache') && r.localPath && fs.existsSync(r.localPath));
  if (fromRun?.localPath) return fromRun.localPath;
  if (fs.existsSync(DEFAULT_SIMPLEPERF_BINARY_CACHE)) return DEFAULT_SIMPLEPERF_BINARY_CACHE;
  return DEFAULT_SIMPLEPERF_BINARY_CACHE;
}

export async function runSourceProfileBuild(
  kind: SkillKind,
  inputPath: string,
  outputDir: string,
  opts: {
    targetFps?: number;
    perfetto?: PerfettoIngestOptions;
    binaryCachePath?: string;
    meta?: { label?: string; device?: string; scene?: string };
    onLog?: (line: string) => void;
  } = {},
): Promise<void> {
  fs.mkdirSync(outputDir, { recursive: true });
  const onLog = opts.onLog;
  const meta = opts.meta ?? {};

  if (kind === 'unity_profiler') {
    await runUnityPreprocessScript(inputPath, outputDir, opts.targetFps ?? 60, onLog);
    return;
  }

  if (kind === 'perfetto') {
    onLog?.(`[profile] perfetto build → ${outputDir}`);
    await buildPerfettoProfile(inputPath, meta, opts.perfetto ?? {}, outputDir, onLog);
    return;
  }

  if (kind === 'simpleperf') {
    onLog?.(`[profile] simpleperf build → ${outputDir}`);
    await buildSimpleperfProfile(
      inputPath,
      { ...meta, binaryCachePath: opts.binaryCachePath ?? DEFAULT_SIMPLEPERF_BINARY_CACHE },
      outputDir,
      onLog,
    );
  }
}

/** Mock：在 output/ 下找与当前 run 特征匹配的 performance-report*.md */
export function findMatchingSkillReport(
  kind: SkillKind,
  outputDir: string,
  hints: { frameCount?: number; scene?: string; device?: string },
): string | null {
  const cfg = getSkillConfig(kind);
  const config = getConfig();
  const searchDirs = [
    outputDir,
    path.join(config.skillProjectPath, 'output'),
    ...cfg.mockOutputSubdirs.map(d => path.join(config.skillProjectPath, 'output', d)),
  ];

  const candidates: { path: string; mtime: number; score: number }[] = [];

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith('performance-report') || !name.endsWith('.md')) continue;
      const fp = path.join(dir, name);
      try {
        const md = fs.readFileSync(fp, 'utf-8');
        let score = 0;
        if (kind === 'unity_profiler' && hints.frameCount != null) {
          const m = md.match(/总帧数\s*\|\s*(\d+)/);
          if (m && parseInt(m[1], 10) === hints.frameCount) score += 10;
          else continue;
        }
        if (hints.scene && md.includes(hints.scene)) score += 5;
        if (hints.device && md.includes(hints.device)) score += 3;
        if (score === 0 && kind !== 'unity_profiler') score = 1;
        if (score > 0) candidates.push({ path: fp, mtime: fs.statSync(fp).mtimeMs, score });
      } catch { /* skip */ }
    }
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || b.mtime - a.mtime);
  return candidates[0].path;
}

export function readProfileHints(outputDir: string, kind: SkillKind): {
  frameCount?: number;
  scene?: string;
  device?: string;
} {
  const cfg = getSkillConfig(kind);
  const hints: { frameCount?: number; scene?: string; device?: string } = {};

  if (kind === 'unity_profiler') {
    const prePath = path.join(outputDir, 'preprocess-result.json');
    if (fs.existsSync(prePath)) {
      try {
        const pre = JSON.parse(fs.readFileSync(prePath, 'utf-8')) as { frameSummary?: { count?: number } };
        hints.frameCount = pre.frameSummary?.count;
      } catch { /* ignore */ }
    }
  }

  const summaryPath = path.join(outputDir, cfg.profileSummaryFile);
  if (fs.existsSync(summaryPath)) {
    try {
      const s = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as {
        meta?: { scene?: string; device?: string };
      };
      hints.scene = s.meta?.scene;
      hints.device = s.meta?.device;
    } catch { /* ignore */ }
  }

  return hints;
}
