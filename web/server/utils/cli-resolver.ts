// 解析 CodeBuddy / Claude CLI 可执行路径 (Windows 下 npm 全局 bin 常不在 Node 服务 PATH 中)

import fs from 'fs';
import path from 'path';
import { execSync, spawn, type ChildProcess, type SpawnOptions } from 'child_process';
import type { CliProvider } from '../../shared/types.js';

function existsFile(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/** Windows: %APPDATA%\\npm\\codebuddy.cmd */
function npmGlobalCmd(name: string): string | undefined {
  const appData = process.env.APPDATA;
  if (!appData) return undefined;
  const cmd = path.join(appData, 'npm', `${name}.cmd`);
  return existsFile(cmd) ? cmd : undefined;
}

function whereOnPath(name: string): string | undefined {
  try {
    const cmd = process.platform === 'win32' ? 'where.exe' : 'which';
    const out = execSync(`${cmd} ${name}`, { encoding: 'utf-8', windowsHide: true, timeout: 5000 }).trim();
    const line = out.split(/\r?\n/).find(l => l.trim())?.trim();
    return line && existsFile(line) ? line : undefined;
  } catch {
    return undefined;
  }
}

export function detectCliExecutable(provider: CliProvider): string | undefined {
  if (provider === 'mock') return undefined;

  const candidates: string[] = [];

  if (provider === 'codebuddy') {
    const npm = npmGlobalCmd('codebuddy');
    if (npm) candidates.push(npm);
    candidates.push('codebuddy');
  } else if (provider === 'claude') {
    const npm = npmGlobalCmd('claude');
    if (npm) candidates.push(npm);
    candidates.push('claude');
  }

  const found = whereOnPath(provider);
  if (found) candidates.unshift(found);

  for (const c of candidates) {
    if (c.includes('/') || c.includes('\\')) {
      if (existsFile(c)) return c;
    } else {
      const w = whereOnPath(c);
      if (w) return w;
    }
  }
  return undefined;
}

/** 配置路径 > 自动探测 > 命令名 (可能失败) */
export function resolveCliExecutable(
  provider: CliProvider,
  configuredPath?: string,
): { command: string; resolved: boolean } {
  if (provider === 'mock') return { command: 'mock', resolved: true };

  if (configuredPath && existsFile(configuredPath)) {
    return { command: configuredPath, resolved: true };
  }

  const detected = detectCliExecutable(provider);
  if (detected) return { command: detected, resolved: true };

  return { command: provider, resolved: false };
}

export function isCliAvailable(provider: CliProvider, configuredPath?: string): boolean {
  if (provider === 'mock') return true;
  return resolveCliExecutable(provider, configuredPath).resolved;
}

/** 上传/skill 默认 provider: 有 CodeBuddy 用 codebuddy，否则 mock */
export function defaultCliProvider(cliPaths?: Partial<Record<CliProvider, string>>): CliProvider {
  if (isCliAvailable('codebuddy', cliPaths?.codebuddy)) return 'codebuddy';
  if (isCliAvailable('claude', cliPaths?.claude)) return 'claude';
  return 'mock';
}

export function cliUnavailableHint(provider: CliProvider): string {
  if (provider === 'codebuddy') {
    return '未找到 CodeBuddy CLI。请在「设置」填写 codebuddy 路径（如 %APPDATA%\\npm\\codebuddy.cmd），或上传时选 Mock 模式。';
  }
  if (provider === 'claude') {
    return '未找到 Claude CLI。请在「设置」填写 claude 路径，或选 Mock 模式。';
  }
  return 'CLI 不可用';
}

/**
 * Windows: Node 服务进程 PATH 常缺 System32/Wbem，CodeBuddy 内部会调 reg/wmic 导致 skill 失败。
 * 合并 System32、Wbem、npm 全局 bin 与当前 PATH。
 */
export function buildCliSpawnEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...base };
  if (process.platform !== 'win32') return env;

  const systemRoot = env.SystemRoot || env.WINDIR || 'C:\\Windows';
  const prepend = [
    path.join(systemRoot, 'System32'),
    path.join(systemRoot, 'System32', 'Wbem'),
    path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0'),
    env.APPDATA ? path.join(env.APPDATA, 'npm') : '',
    systemRoot,
  ].filter(p => p && existsFile(p));

  const seen = new Set<string>();
  const merged: string[] = [];
  for (const p of [...prepend, ...(env.PATH || env.Path || '').split(';')]) {
    const t = p.trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    merged.push(t);
  }

  const pathStr = merged.join(';');
  env.PATH = pathStr;
  env.Path = pathStr;
  env.SystemRoot = systemRoot;
  env.WINDIR = systemRoot;
  const comspec = path.join(systemRoot, 'System32', 'cmd.exe');
  if (existsFile(comspec)) {
    env.COMSPEC = comspec;
  }
  return env;
}

/** Windows: 启动 CLI 并注入完整 PATH (System32 / PowerShell / npm) */
export function spawnCliProcess(
  cliCommand: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; windowsHide?: boolean; stdio?: SpawnOptions['stdio'] },
): ChildProcess {
  const env = buildCliSpawnEnv(options.env ?? process.env);
  return spawn(cliCommand, args, {
    cwd: options.cwd,
    env,
    windowsHide: options.windowsHide ?? true,
    stdio: options.stdio ?? 'pipe',
    shell: true,
  });
}
