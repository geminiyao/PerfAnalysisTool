// 新模型 Run 入库：Provider 构建 + ingest（Web 采集上传 Tab 使用）

import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { v4 as uuid } from 'uuid';
import { fileURLToPath } from 'url';
import { assetService } from './asset-service.js';
import { saveRun, getRun } from './run-store.js';
import { getConfig } from '../utils/config.js';
import type { DeviceTier, FrameStat, Metric, PerfProfile, Run, SourceId, SystemStat, ThreadStat } from '../../shared/perf-model.js';
import { DEFAULT_TARGET_FPS } from './unity-preprocess-runner.js';

const __filename_ingest = fileURLToPath(import.meta.url);
const __dirname_ingest = path.dirname(__filename_ingest);

export interface IngestMeta {
  runId?: string;
  label?: string;
  device?: string;
  scene?: string;
  projectName?: string;
  version?: string;
  notes?: string;
  targetFps?: number;
}

/** Perfetto Provider 剪枝 / 窗口参数（Web Perfetto Tab 暴露） */
export interface PerfettoIngestOptions {
  profileName?: string;
  sliceTreeMinPct?: number;
  sliceTreeMaxDepth?: number;
  summaryMinPct?: number;
  summaryMaxDepth?: number;
}

type ProfileWithMeta = PerfProfile & { meta?: Record<string, unknown> };

const DEFAULT_SIMPLEPERF_BINARY_CACHE = 'k:/AI/PerfAnalysisTool_Codebuddy/simpleperf/symbols/binary_cache';

function resolvePythonBin(): string {
  if (process.env.PYTHON) return process.env.PYTHON;
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\Python313\\python.exe',
      'C:\\Program Files\\Python312\\python.exe',
      'C:\\Program Files\\Python311\\python.exe',
      'C:\\Program Files\\Python310\\python.exe',
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }
    try {
      const found = execSync('where python', { encoding: 'utf-8', windowsHide: true })
        .trim()
        .split(/\r?\n/)
        .find(line => line.trim().endsWith('.exe'));
      if (found?.trim()) return found.trim();
    } catch { /* PATH 中无 python */ }
    return 'py -3';
  }
  return 'python';
}

function deriveFrameCount(profile: PerfProfile): number | undefined {
  for (const src of Object.keys(profile.detail ?? {})) {
    const fa = (profile.detail as Record<string, { frameAnalysis?: { summary?: { count?: number } } }>)[src]?.frameAnalysis;
    if (fa?.summary?.count) return fa.summary.count;
  }
  const unity = profile.detail?.unity_profiler as { frameSummary?: { count?: number } } | undefined;
  return unity?.frameSummary?.count;
}

function resolveDeviceTierFromProfile(profile: ProfileWithMeta, meta: IngestMeta): DeviceTier | undefined {
  const fromProfile = profile.meta?.deviceTier as DeviceTier | undefined;
  if (fromProfile) return fromProfile;
  const device = meta.device ?? (profile.meta?.device as string | undefined);
  if (!device) return undefined;
  const mapPath = path.join(getConfig().skillProjectPath, 'docs', 'device-tier-map.json');
  if (!fs.existsSync(mapPath)) return undefined;
  try {
    const map = JSON.parse(fs.readFileSync(mapPath, 'utf-8')) as {
      defaultTier?: DeviceTier;
      tiers?: Record<string, { devices?: string[]; patterns?: string[] }>;
    };
    for (const tier of ['high', 'mid', 'low'] as DeviceTier[]) {
      const cfg = map.tiers?.[tier];
      if (!cfg) continue;
      if (cfg.devices?.includes(device)) return tier;
      for (const pat of cfg.patterns ?? []) {
        const re = new RegExp('^' + pat.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        if (re.test(device)) return tier;
      }
    }
    return map.defaultTier ?? 'unknown';
  } catch {
    return undefined;
  }
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = 600_000,
  onLog?: (line: string) => void,
): Promise<{ code: number | null; output: string }> {
  const useShell = !/[\\/]/.test(command);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: useShell,
      windowsHide: true,
      env: { ...process.env },
    });
    let output = '';
    let pending = '';
    const flushLines = (chunk: string) => {
      output += chunk;
      if (!onLog) return;
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) onLog(line);
    };
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`命令超时 (${timeoutMs / 1000}s): ${command} ${args.join(' ')}`));
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => { flushLines(d.toString()); });
    child.stderr.on('data', (d: Buffer) => { flushLines(d.toString()); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (onLog && pending.trim()) onLog(pending.trim());
      resolve({ code, output });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function jobWorkDir(jobId: string): string {
  const dir = path.join(getConfig().dataDir, 'uploads', 'ingest', jobId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function seedProfileArtifacts(
  workDir: string,
  runId: string,
  kind: 'unity_profiler' | 'perfetto' | 'simpleperf',
): void {
  const destDir = path.join(getConfig().dataDir, 'results', runId);
  fs.mkdirSync(destDir, { recursive: true });
  const byKind: Record<'unity_profiler' | 'perfetto' | 'simpleperf', string[]> = {
    unity_profiler: ['preprocess-result.json', 'unity-profile-summary.json'],
    perfetto: ['perfetto-profile-summary.json'],
    simpleperf: ['simpleperf-profile-summary.json'],
  };
  for (const name of byKind[kind]) {
    const src = path.join(workDir, name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(destDir, name));
  }
}

/** @deprecated 使用 seedProfileArtifacts */
function seedPreprocessArtifacts(workDir: string, runId: string): void {
  seedProfileArtifacts(workDir, runId, 'unity_profiler');
}

/**
 * 构建 Prism 索引 (帧索引 + 计数器索引)。
 * 入库时调用, 让 explore 阶段的工具能直接查 prism.sqlite。
 *
 * - build-frame-index: .pdata → prism_frame_marker_samples (全量 marker, 无过滤)
 * - build-counters-index: .counters.json → prism_frame_counters (draw calls/GC alloc/内存等)
 *
 * 失败不阻断入库 (Run 仍然可用, 只是 Prism 分析时需手动补建)。
 */
function buildPrismIndexes(runId: string, pdataPath: string, onLog?: (line: string) => void): void {
  const prismDir = path.join(__dirname_ingest, '..', 'prism');
  const webDir = path.join(__dirname_ingest, '..', '..');

  // 0. 清空 prism.sqlite（防止旧 run 的残留数据污染当前分析）
  //    prism.sqlite 是单次分析用的共享数据库，每次索引只应包含当前 run 的数据
  const dbPath = path.join(webDir, 'data', 'prism.sqlite');
  try {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      // 同时删除 WAL 和 SHM 文件
      for (const suffix of ['-wal', '-shm']) {
        const walPath = dbPath + suffix;
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      }
      onLog?.(`[prism-index] 已清空旧的 prism.sqlite`);
    }
  } catch (e: any) {
    onLog?.(`[prism-index] 清空 prism.sqlite 失败 (继续): ${e.message?.slice(0, 100)}`);
  }

  // 1. build-frame-index
  onLog?.(`[prism-index] 构建帧索引 (runId=${runId}, 可能需要数分钟)...`);
  const frameIndexScript = path.join(prismDir, 'build-frame-index.ts');
  try {
    const stdout = execSync(`npx tsx "${frameIndexScript}" --input "${pdataPath}" --run-id "${runId}"`, {
      cwd: webDir,
      timeout: 20 * 60 * 1000,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // 脚本 stdout 输出 JSON summary
    try {
      const summary = JSON.parse(stdout.trim().split('\n').pop() || '{}');
      onLog?.(`[prism-index] 帧索引完成: ${summary.frameCount ?? '?'} 帧, ${summary.sampleRows ?? '?'} 行 marker`);
    } catch {
      onLog?.(`[prism-index] 帧索引完成`);
    }
  } catch (e: any) {
    onLog?.(`[prism-index] 帧索引构建失败 (不阻断入库): ${e.message?.slice(0, 200)}`);
  }

  // 2. build-counters-index (如果 .counters.json 存在)
  const countersPath = pdataPath.replace(/\.pdata$/i, '.counters.json');
  if (fs.existsSync(countersPath)) {
    onLog?.(`[prism-index] 构建计数器索引...`);
    const countersScript = path.join(prismDir, 'build-counters-index.ts');
    try {
      const stdout = execSync(`npx tsx "${countersScript}" --input "${countersPath}" --run-id "${runId}"`, {
        cwd: webDir,
        timeout: 5 * 60 * 1000,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      try {
        const summary = JSON.parse(stdout.trim().split('\n').pop() || '{}');
        onLog?.(`[prism-index] 计数器索引完成: ${summary.rowsInserted ?? '?'} 帧, 字段: ${(summary.nonNullFields ?? []).join(', ')}`);
      } catch {
        onLog?.(`[prism-index] 计数器索引完成`);
      }
    } catch (e: any) {
      onLog?.(`[prism-index] 计数器索引构建失败 (不阻断入库): ${e.message?.slice(0, 200)}`);
    }
  } else {
    onLog?.(`[prism-index] 未找到 .counters.json, 跳过计数器索引`);
  }
}

function readProfileJson(profilePath: string): ProfileWithMeta {
  if (!fs.existsSync(profilePath)) {
    throw new Error(`未生成 profile: ${profilePath}`);
  }
  return JSON.parse(fs.readFileSync(profilePath, 'utf-8')) as ProfileWithMeta;
}

/** 登记 raw + 写入 runs / run_metrics。 */
export async function ingestProfile(profile: ProfileWithMeta, meta: IngestMeta = {}): Promise<Run> {
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

  const sources = (Object.keys(profile.detail ?? {}) as SourceId[]);
  const runId = meta.runId || `run_${Date.now()}_${uuid().slice(0, 8)}`;
  const now = Date.now();
  const deviceTier = resolveDeviceTierFromProfile(profile, meta);
  const run: Run = {
    id: runId,
    label: meta.label ?? meta.scene ?? profile.raw?.[0]?.fileName ?? runId,
    sources: sources.length ? sources : ['unity_profiler'],
    status: 'ready',
    meta: {
      device: meta.device ?? (profile.meta?.device as string | undefined),
      scene: meta.scene ?? (profile.meta?.scene as string | undefined),
      projectName: meta.projectName,
      version: meta.version,
      notes: meta.notes,
      frameCount: deriveFrameCount(profile),
      targetFps: meta.targetFps,
      deviceTier,
    },
    profile,
    createdAt: now,
    completedAt: now,
  };
  saveRun(run);
  return run;
}

export function mergeProfiles(profiles: ProfileWithMeta[]): ProfileWithMeta {
  if (profiles.length < 2) throw new Error('合并至少需要 2 份 profile');

  const raw = profiles.flatMap(p => p.raw ?? []);
  const metrics: Metric[] = profiles.flatMap(p => p.core?.metrics ?? []);
  const frame: FrameStat[] = profiles.flatMap(p => p.core?.frame ?? []);
  const threads: ThreadStat[] = profiles.flatMap(p => p.core?.threads ?? []);
  const system: SystemStat = {};
  for (const p of profiles) Object.assign(system, p.core?.system ?? {});

  const detail: Record<string, unknown> = {};
  for (const p of profiles) Object.assign(detail, p.detail ?? {});

  const notes: string[] = [];
  let alignmentOk = true;
  for (const p of profiles) {
    const c = p.core?.confidence;
    if (c?.notes) notes.push(...c.notes);
    if (c && c.perFrameAlignmentOk === false) alignmentOk = false;
  }
  const frameDefs = [...new Set(frame.map(f => f.frameDefinition))];
  if (frameDefs.length > 1) {
    notes.push(`跨源帧口径并存 (${frameDefs.join(' / ')}); 不同口径帧时长禁直比, 仅同口径可比。`);
  }

  const topMeta: Record<string, unknown> = {};
  for (const p of profiles) Object.assign(topMeta, p.meta ?? {});

  const schemaVersion = Math.max(1, ...profiles.map(p => p.core?.schemaVersion ?? 1));

  return {
    raw,
    core: {
      schemaVersion,
      metrics,
      frame,
      threads,
      system,
      confidence: { perFrameAlignmentOk: alignmentOk, notes },
    },
    detail,
    meta: topMeta,
  };
}

export async function mergeRunsByIds(runIds: string[], meta: IngestMeta = {}): Promise<Run> {
  const profiles: ProfileWithMeta[] = [];
  for (const id of runIds) {
    const run = getRun(id);
    if (!run) throw new Error(`Run 不存在: ${id}`);
    profiles.push({ ...run.profile, meta: { ...run.meta } as unknown as Record<string, unknown> });
  }
  const merged = mergeProfiles(profiles);
  return ingestProfile(merged, {
    ...meta,
    label: meta.label ?? `cross_${runIds.map(i => i.replace(/^run_/, '').slice(0, 12)).join('_')}`,
  });
}

export async function buildUnityProfile(
  pdataPath: string,
  meta: IngestMeta = {},
  workDir?: string,
  onLog?: (line: string) => void,
): Promise<ProfileWithMeta> {
  const config = getConfig();
  const dir = workDir ?? jobWorkDir(uuid());
  const script = path.join(
    config.skillProjectPath,
    '.claude/skills/unity-profiler-analysis/scripts/build-profile.ts',
  );
  const args = ['tsx', script, '--input', pdataPath, '--out-dir', dir];
  const fps = meta.targetFps ?? DEFAULT_TARGET_FPS;
  args.push('--target-fps', String(fps));
  if (meta.device) args.push('--device', meta.device);
  if (meta.scene) args.push('--scene', meta.scene);

  const result = await runCommand('npx', args, config.skillProjectPath, 600_000, onLog);
  if (result.code !== 0) {
    throw new Error(result.output.slice(-1500) || `unity build-profile 失败 (code ${result.code})`);
  }
  return readProfileJson(path.join(dir, 'unity-profile.json'));
}

export async function buildSimpleperfProfile(
  perfPath: string,
  meta: IngestMeta & { binaryCachePath?: string },
  workDir?: string,
  onLog?: (line: string) => void,
): Promise<ProfileWithMeta> {
  const config = getConfig();
  const dir = workDir ?? jobWorkDir(uuid());
  const script = path.join(config.skillProjectPath, 'simpleperf/build_simpleperf_profile.py');
  const bcache = meta.binaryCachePath || DEFAULT_SIMPLEPERF_BINARY_CACHE;
  const python = resolvePythonBin();
  const args = [script, '--perf', perfPath, '--out', dir];
  if (bcache && fs.existsSync(bcache)) args.push('--binary-cache', bcache);
  if (meta.label) args.push('--label', meta.label);
  if (meta.device) args.push('--device', meta.device);
  if (meta.scene) args.push('--scene-cur', meta.scene);

  if (!fs.existsSync(script)) {
    throw new Error(`simpleperf 构建脚本不存在: ${script}`);
  }

  const result = await runCommand(python, args, config.skillProjectPath, 900_000, onLog);
  if (result.code !== 0) {
    throw new Error(result.output.slice(-1500) || `simpleperf build 失败 (code ${result.code})`);
  }
  return readProfileJson(path.join(dir, 'simpleperf-profile.json'));
}

/** 运行项目内 Python 脚本（相对 skillProjectPath） */
export async function runProjectPython(
  scriptRelative: string,
  args: string[] = [],
  onLog?: (line: string) => void,
  timeoutMs = 600_000,
): Promise<void> {
  const config = getConfig();
  const script = path.join(config.skillProjectPath, scriptRelative);
  if (!fs.existsSync(script)) {
    throw new Error(`脚本不存在: ${script}`);
  }
  const python = resolvePythonBin();
  const result = await runCommand(python, [script, ...args], config.skillProjectPath, timeoutMs, onLog);
  if (result.code !== 0) {
    throw new Error(result.output.slice(-2000) || `${scriptRelative} 失败 (code ${result.code})`);
  }
}

/** 双采集 base+cur：产出 base/cur profile、diff JSON、v4 报告 markdown */
export async function buildSimpleperfDiffProfile(
  basePerfPath: string,
  curPerfPath: string,
  meta: IngestMeta & { binaryCachePath?: string; sceneBase?: string; sceneCur?: string; subjectiveFps?: string },
  workDir?: string,
  onLog?: (line: string) => void,
): Promise<{
  profile: ProfileWithMeta;
  diffPath: string;
  reportPath: string;
  workDir: string;
}> {
  const config = getConfig();
  const dir = workDir ?? jobWorkDir(uuid());
  const script = path.join(config.skillProjectPath, 'simpleperf/build_simpleperf_profile.py');
  const bcache = meta.binaryCachePath || DEFAULT_SIMPLEPERF_BINARY_CACHE;
  const python = resolvePythonBin();
  const args = [script, '--base', basePerfPath, '--perf', curPerfPath, '--out', dir];
  if (bcache && fs.existsSync(bcache)) args.push('--binary-cache', bcache);
  if (meta.sceneBase) args.push('--scene-base', meta.sceneBase);
  if (meta.sceneCur) args.push('--scene-cur', meta.sceneCur);
  if (meta.device) args.push('--device', meta.device);
  if (meta.subjectiveFps) args.push('--subjective-fps', meta.subjectiveFps);

  if (!fs.existsSync(script)) {
    throw new Error(`simpleperf 构建脚本不存在: ${script}`);
  }

  const result = await runCommand(python, args, config.skillProjectPath, 900_000, onLog);
  if (result.code !== 0) {
    throw new Error(result.output.slice(-1500) || `simpleperf diff build 失败 (code ${result.code})`);
  }
  const profile = readProfileJson(path.join(dir, 'cur', 'simpleperf-profile.json'));
  return {
    profile,
    diffPath: path.join(dir, 'diff', 'simpleperf-diff.json'),
    reportPath: path.join(dir, 'report', 'performance-report_simpleperf_v4.md'),
    workDir: dir,
  };
}

export async function buildPerfettoProfile(
  tracePath: string,
  meta: IngestMeta = {},
  options: PerfettoIngestOptions = {},
  workDir?: string,
  onLog?: (line: string) => void,
): Promise<ProfileWithMeta> {
  const config = getConfig();
  const dir = workDir ?? jobWorkDir(uuid());
  const script = path.join(config.skillProjectPath, 'scripts/build_perfetto_profile.py');
  const python = resolvePythonBin();
  const metaPath = path.join(path.dirname(tracePath), 'meta.json');
  const args = [script, '--trace', tracePath, '--out', dir];
  if (fs.existsSync(metaPath)) args.push('--meta', metaPath);

  const profileName = options.profileName || 'CombinedProfile';
  args.push('--profile-name', profileName);
  if (options.sliceTreeMinPct !== undefined) args.push('--slice-min-pct', String(options.sliceTreeMinPct));
  if (options.sliceTreeMaxDepth !== undefined) args.push('--slice-max-depth', String(options.sliceTreeMaxDepth));
  if (options.summaryMinPct !== undefined) args.push('--summary-min-pct', String(options.summaryMinPct));
  if (options.summaryMaxDepth !== undefined) args.push('--summary-max-depth', String(options.summaryMaxDepth));

  const result = await runCommand(python, args, config.skillProjectPath, 900_000, onLog);
  if (result.code !== 0) {
    throw new Error(result.output.slice(-1500) || `perfetto build 失败 (code ${result.code})`);
  }
  return readProfileJson(path.join(dir, 'perfetto-profile.json'));
}

export interface UnifiedIngestOptions {
  meta?: IngestMeta;
  binaryCachePath?: string;
  perfetto?: PerfettoIngestOptions;
  /** 合并 meta.json 字段到 IngestMeta */
  metaJsonPath?: string;
}

function mergeMetaFromJson(meta: IngestMeta, metaJsonPath?: string): IngestMeta {
  if (!metaJsonPath || !fs.existsSync(metaJsonPath)) return meta;
  try {
    const j = JSON.parse(fs.readFileSync(metaJsonPath, 'utf-8')) as Record<string, unknown>;
    return {
      ...meta,
      label: meta.label ?? (j.run_label as string) ?? (j.label as string),
      device: meta.device ?? (j.device as string),
      scene: meta.scene ?? (j.scene as string),
      notes: meta.notes ?? (j.profile_name as string),
    };
  } catch {
    return meta;
  }
}

/** 统一拖放: 识别多源 → 构建 → 合并 → 单次入库。 */
export async function ingestUnifiedFiles(
  detected: { unity?: string; simpleperf?: string; perfetto?: string; metaJson?: string },
  opts: UnifiedIngestOptions = {},
  onLog?: (line: string) => void,
): Promise<Run> {
  const ids = [
    detected.unity && 'unity_profiler',
    detected.simpleperf && 'simpleperf',
    detected.perfetto && 'perfetto',
  ].filter(Boolean);
  if (ids.length === 0) {
    throw new Error('未识别到有效数据源 (.pdata / perf.data / .pftrace)');
  }

  let meta = mergeMetaFromJson(opts.meta ?? {}, detected.metaJson ?? opts.metaJsonPath);
  const runId = meta.runId || `run_${Date.now()}_${uuid().slice(0, 8)}`;
  meta = { ...meta, runId, targetFps: meta.targetFps ?? DEFAULT_TARGET_FPS };
  const workRoot = jobWorkDir(runId);
  const profiles: ProfileWithMeta[] = [];

  if (detected.unity) {
    onLog?.('[unified] 构建 unity_profiler…');
    const unityDir = path.join(workRoot, 'unity');
    profiles.push(await buildUnityProfile(detected.unity, meta, unityDir, onLog));
    seedProfileArtifacts(unityDir, runId, 'unity_profiler');
    // ★ 构建 Prism 索引 (帧索引 + 计数器索引)
    buildPrismIndexes(runId, detected.unity, onLog);
  }
  if (detected.simpleperf) {
    onLog?.('[unified] 构建 simpleperf…');
    const spDir = path.join(workRoot, 'simpleperf');
    profiles.push(await buildSimpleperfProfile(
      detected.simpleperf,
      { ...meta, binaryCachePath: opts.binaryCachePath },
      spDir,
      onLog,
    ));
    seedProfileArtifacts(spDir, runId, 'simpleperf');
  }
  if (detected.perfetto) {
    onLog?.('[unified] 构建 perfetto…');
    const pfDir = path.join(workRoot, 'perfetto');
    profiles.push(await buildPerfettoProfile(
      detected.perfetto,
      meta,
      opts.perfetto ?? {},
      pfDir,
      onLog,
    ));
    seedProfileArtifacts(pfDir, runId, 'perfetto');
  }

  const merged = profiles.length === 1 ? profiles[0] : mergeProfiles(profiles);
  if (!meta.label && ids.length > 1) {
    meta = { ...meta, label: `unified_${ids.join('_')}` };
  }
  return ingestProfile(merged, meta);
}

export async function buildAndIngestUnity(
  pdataPath: string,
  meta: IngestMeta = {},
  onLog?: (line: string) => void,
): Promise<Run> {
  const runId = meta.runId || `run_${Date.now()}_${uuid().slice(0, 8)}`;
  const workDir = jobWorkDir(runId);
  const ingestMeta = { ...meta, runId, targetFps: meta.targetFps ?? DEFAULT_TARGET_FPS };
  const profile = await buildUnityProfile(pdataPath, ingestMeta, workDir, onLog);
  seedPreprocessArtifacts(workDir, runId);
  // ★ 构建 Prism 索引 (帧索引 + 计数器索引), 让 explore 工具能直接查 prism.sqlite
  buildPrismIndexes(runId, pdataPath, onLog);
  return ingestProfile(profile, { ...ingestMeta, scene: ingestMeta.scene ?? (profile.meta?.scene as string | undefined) });
}

export async function buildAndIngestSimpleperf(
  perfPath: string,
  meta: IngestMeta & { binaryCachePath?: string },
  onLog?: (line: string) => void,
): Promise<Run> {
  const profile = await buildSimpleperfProfile(perfPath, meta, undefined, onLog);
  return ingestProfile(profile, meta);
}

export async function ingestPerfettoSampleDir(
  sampleDir: string,
  meta: IngestMeta = {},
  options: PerfettoIngestOptions = {},
  onLog?: (line: string) => void,
): Promise<Run> {
  const trace = fs.readdirSync(sampleDir)
    .map(name => path.join(sampleDir, name))
    .find(fp => fs.statSync(fp).isFile() && ['.pftrace', '.perfetto-trace', '.trace'].includes(path.extname(fp).toLowerCase()));
  if (!trace) throw new Error(`sample 目录未找到 perfetto trace: ${sampleDir}`);
  const runId = meta.runId || `run_${Date.now()}_${uuid().slice(0, 8)}`;
  const workDir = jobWorkDir(runId);
  const stagedDir = path.join(workDir, path.basename(sampleDir));
  fs.cpSync(sampleDir, stagedDir, { recursive: true });
  const stagedTrace = path.join(stagedDir, path.basename(trace));
  const ingestMeta = { ...meta, runId };
  const profile = await buildPerfettoProfile(stagedTrace, ingestMeta, options, path.join(workDir, 'perfetto'), onLog);
  seedProfileArtifacts(path.join(workDir, 'perfetto'), runId, 'perfetto');
  return ingestProfile(profile, ingestMeta);
}

export async function buildAndIngestPerfetto(
  tracePath: string,
  meta: IngestMeta = {},
  options: PerfettoIngestOptions = {},
  onLog?: (line: string) => void,
): Promise<Run> {
  const profile = await buildPerfettoProfile(tracePath, meta, options, undefined, onLog);
  return ingestProfile(profile, meta);
}
