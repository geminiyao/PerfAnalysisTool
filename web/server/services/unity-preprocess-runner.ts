// 对当前 .pdata 运行 preprocess.ts → results/<runId>/preprocess-result.json

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { getConfig } from '../utils/config.js';

const DEFAULT_TARGET_FPS = 60;

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = 600_000,
  onLog?: (line: string) => void,
): Promise<{ code: number | null; output: string }> {
  const useShell = !/[\\/]/.test(command);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: useShell, windowsHide: true, env: { ...process.env } });
    let output = '';
    let pending = '';
    const flush = (chunk: string) => {
      output += chunk;
      if (!onLog) return;
      pending += chunk;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() ?? '';
      for (const line of lines) onLog(line);
    };
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`preprocess 超时 (${timeoutMs / 1000}s)`));
    }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => flush(d.toString()));
    child.stderr.on('data', (d: Buffer) => flush(d.toString()));
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

export function resolveUnityTargetFps(explicit?: number, runMeta?: { targetFps?: number }): number {
  return explicit ?? runMeta?.targetFps ?? DEFAULT_TARGET_FPS;
}

/** 用当前 pdata + targetFps 重建 preprocess-result.json (问题列表 / 指标的唯一数据源)。 */
export async function runUnityPreprocessScript(
  pdataPath: string,
  outputDir: string,
  targetFps: number,
  onLog?: (line: string) => void,
): Promise<void> {
  const config = getConfig();
  const script = path.join(config.skillProjectPath, '.claude/skills/unity-profiler-analysis/scripts/preprocess.ts');
  if (!fs.existsSync(script)) throw new Error(`preprocess.ts 不存在: ${script}`);
  if (!fs.existsSync(pdataPath)) throw new Error(`pdata 不存在: ${pdataPath}`);

  fs.mkdirSync(outputDir, { recursive: true });
  const args = ['tsx', script, '--input', pdataPath, '--output-dir', outputDir, '--target-fps', String(targetFps)];
  onLog?.(`[preprocess] targetFps=${targetFps} → ${outputDir}`);

  const result = await runCommand('npx', args, config.skillProjectPath, 600_000, onLog);
  if (result.code !== 0) {
    throw new Error(result.output.slice(-1500) || `preprocess.ts 失败 (code ${result.code})`);
  }

  const out = path.join(outputDir, 'preprocess-result.json');
  if (!fs.existsSync(out)) throw new Error('preprocess 未产出 preprocess-result.json');
}

export function frameCountFromMarkdown(md: string): number | null {
  const m = md.match(/总帧数\s*\|\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** Mock / 落盘报告选择与 preprocess 帧数一致的文件。 */
export function findMatchingPerformanceReport(
  frameCount: number,
  searchDirs: string[],
): string | null {
  const candidates: { path: string; mtime: number }[] = [];
  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith('performance-report') || !name.endsWith('.md')) continue;
      const fp = path.join(dir, name);
      try {
        const md = fs.readFileSync(fp, 'utf-8');
        const fc = frameCountFromMarkdown(md);
        if (fc === frameCount) candidates.push({ path: fp, mtime: fs.statSync(fp).mtimeMs });
      } catch { /* skip */ }
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].path;
}

export { DEFAULT_TARGET_FPS };
