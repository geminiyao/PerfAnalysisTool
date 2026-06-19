// P3: 两 Run simpleperf 差分火焰图 — 复用 scripts/diff_flamegraph.py

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import type { Run } from '../../shared/perf-model.js';
import { getRun } from './run-store.js';
import { getConfig } from '../utils/config.js';

/** 从 Run.raw 解析 simpleperf 采样目录 (含 perf.data 的目录)。 */
export function resolveSimpleperfCaptureDir(run: Run): string | null {
  for (const ref of run.profile.raw ?? []) {
    if (ref.source !== 'simpleperf') continue;
    const roleOk = ref.role === 'perf_data' || ref.fileName === 'perf.data';
    if (!roleOk && ref.localPath && !ref.localPath.includes('perf.data')) continue;
    if (!ref.localPath) continue;
    const p = path.resolve(ref.localPath);
    if (fs.existsSync(p)) {
      if (fs.statSync(p).isFile()) return path.dirname(p);
      if (fs.existsSync(path.join(p, 'perf.data'))) return p;
    }
  }
  return null;
}

function flameCachePath(baseRunId: string, currentRunId: string): string {
  const config = getConfig();
  const dir = path.join(config.dataDir, 'generated', 'flamegraphs', 'compare');
  fs.mkdirSync(dir, { recursive: true });
  const safe = `${baseRunId}__${currentRunId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(dir, `${safe}.html`);
}

export async function ensureCompareFlamegraph(
  baseRunId: string,
  currentRunId: string,
): Promise<{ filePath: string; generated: boolean }> {
  const outPath = flameCachePath(baseRunId, currentRunId);
  if (fs.existsSync(outPath)) {
    return { filePath: outPath, generated: false };
  }

  const base = getRun(baseRunId);
  const current = getRun(currentRunId);
  if (!base || !current) throw new Error('Run 不存在');

  const baseDir = resolveSimpleperfCaptureDir(base);
  const optDir = resolveSimpleperfCaptureDir(current);
  if (!baseDir || !optDir) {
    throw new Error('两 Run 均需含 simpleperf perf.data 才能生成差分火焰图');
  }

  const config = getConfig();
  const python = process.env.PYTHON || 'python';
  const script = path.join(config.skillProjectPath, 'scripts', 'diff_flamegraph.py');
  const args = ['--base', baseDir, '--opt', optDir, '--out', outPath];

  const result = await new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(python, [script, ...args], {
      cwd: config.skillProjectPath,
      shell: true,
      windowsHide: true,
      env: { ...process.env },
    });
    let output = '';
    child.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { output += d.toString(); });
    child.on('close', (code) => resolve({ code, output }));
    child.on('error', (err: Error) => resolve({ code: -1, output: err.message }));
  });

  if (result.code !== 0 || !fs.existsSync(outPath)) {
    throw new Error(result.output ? result.output.slice(-800) : `diff_flamegraph 退出码 ${result.code}`);
  }
  return { filePath: outPath, generated: true };
}

export function compareFlamegraphCacheKey(baseRunId: string, currentRunId: string): string {
  return `${baseRunId}__${currentRunId}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function getCachedFlamegraphPath(baseRunId: string, currentRunId: string): string | null {
  const p = flameCachePath(baseRunId, currentRunId);
  return fs.existsSync(p) ? p : null;
}
