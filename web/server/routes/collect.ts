// 自动采集路由 — 对接 scripts/auto_collector/collect.py
//
// 端点：
//   GET  /collect/configs               — 扫描 projects/ 下的 collect-*.yaml，返回摘要列表
//   GET  /collect/configs/:file         — 返回指定配置的完整解析 (parsed YAML + 摘要)
//   GET  /collect/device                — adb devices 设备探测
//   POST /collect/start                 — 启动 collect.py 子进程，返回 jobId
//   GET  /collect/jobs/:id              — 任务状态 + 历史事件
//   GET  /collect/jobs/:id/events       — SSE 实时日志
//   POST /collect/jobs/:id/stop         — 终止采集进程
//   POST /collect/jobs/:id/ingest       — 采集完成后入库预处理 (原始文件 → ready run)

import { FastifyInstance } from 'fastify';
import { spawn, execFileSync, ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import yaml from 'js-yaml';
import { ingestUnifiedFiles, buildAndIngestUnity, type IngestMeta } from '../services/run-ingest-service.js';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const COLLECTOR_PY = path.join(PROJECT_ROOT, 'scripts', 'auto_collector', 'collect.py');
const PROJECTS_DIR = path.join(PROJECT_ROOT, 'projects');

// Unity batchmode .raw → .pdata 转换配置
// 使用项目内置的独立 converter 项目, 不和 aoeyz 主项目冲突 (可以同时开 Unity Editor)
// UNITY_EXE 可通过环境变量覆盖, 便于移植到其它服务器
const UNITY_EXE = process.env.UNITY_EXE || 'G:\\AOEYZ_Trunk\\UnityEditorWin\\WindowsEditor\\Unity.exe';
const UNITY_PROJECT = process.env.UNITY_PROJECT || path.join(PROJECT_ROOT, 'unity-converter');

// ---------------------------------------------------------------------------
// 配置摘要 + 完整解析
// ---------------------------------------------------------------------------

export interface CollectConfigSummary {
  file: string;          // 相对 projects/ 的路径，如 aoeyz/collect-camera-ab.yaml
  name: string;          // 文件名（不含扩展名）
  project: string;       // project.name
  package: string;
  sceneLabel: string;    // scenes.default.label
  scene: string;         // scenes.default.scene
  tools: { simpleperf: boolean; perfetto: boolean; unity: boolean };
  steps: { primitive: string; duration?: number }[];
  defaultDuration: number;
  description: string;   // 文件头注释首行
}

function extractDescription(content: string): string {
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (t.startsWith('#') && t.length > 1) return t.replace(/^#\s*/, '');
  }
  return '';
}

function buildSummary(file: string, rawPath: string, parsed: any): CollectConfigSummary {
  const project = parsed?.project?.name ?? '';
  const pkg = parsed?.project?.package ?? '';
  const sceneLabel = parsed?.scenes?.default?.label ?? '';
  const scene = parsed?.scenes?.default?.scene ?? '';
  const simpleperfEnabled = parsed?.tools?.simpleperf?.enabled !== false;
  const perfettoEnabled = parsed?.tools?.perfetto?.enabled !== false;
  const unityEnabled = parsed?.tools?.unity?.enabled !== false;  // 默认 true (向后兼容)
  const defaultDuration = parsed?.action?.defaultDuration ?? 60;
  const steps = (parsed?.action?.steps ?? []).map((s: any) => ({
    primitive: s?.primitive ?? '?',
    duration: s?.params?.duration,
  }));

  return {
    file,
    name: path.basename(rawPath, '.yaml'),
    project,
    package: pkg,
    sceneLabel,
    scene,
    tools: { simpleperf: simpleperfEnabled, perfetto: perfettoEnabled, unity: unityEnabled },
    steps,
    defaultDuration,
    description: extractDescription(fs.readFileSync(rawPath, 'utf-8')),
  };
}

function scanCollectConfigs(): CollectConfigSummary[] {
  const results: CollectConfigSummary[] = [];
  if (!fs.existsSync(PROJECTS_DIR)) return results;
  for (const projDir of fs.readdirSync(PROJECTS_DIR)) {
    const fullProj = path.join(PROJECTS_DIR, projDir);
    if (!fs.statSync(fullProj).isDirectory() || projDir.startsWith('_')) continue;
    for (const file of fs.readdirSync(fullProj)) {
      if (!/^collect-.*\.ya?ml$/i.test(file)) continue;
      const rawPath = path.join(fullProj, file);
      try {
        const parsed = yaml.load(fs.readFileSync(rawPath, 'utf-8')) as any;
        const relPath = path.relative(PROJECTS_DIR, rawPath).replace(/\\/g, '/');
        results.push(buildSummary(relPath, rawPath, parsed));
      } catch { /* skip invalid yaml */ }
    }
  }
  return results;
}

function loadConfigDetail(relFile: string): { summary: CollectConfigSummary; yaml: any; rawText: string } | null {
  const abs = path.resolve(PROJECTS_DIR, relFile);
  if (!abs.startsWith(PROJECTS_DIR + path.sep) || !fs.existsSync(abs)) return null;
  const rawText = fs.readFileSync(abs, 'utf-8');
  const parsed = yaml.load(rawText) as any;
  return { summary: buildSummary(relFile, abs, parsed), yaml: parsed, rawText };
}

// ---------------------------------------------------------------------------
// adb 设备探测
// ---------------------------------------------------------------------------
export interface DeviceInfo {
  serial: string;
  state: string;       // device / offline / unauthorized
  model?: string;
  abi?: string;        // arm64-v8a 等
  androidVersion?: string;
  appVersion?: string;  // 游戏版本 (如果在运行)
  appPid?: string;      // 游戏进程 PID (如果在运行)
}

function adbShell(serial: string, cmd: string, timeoutMs = 5000): string {
  try {
    return execFileSync('adb', ['-s', serial, 'shell', cmd], {
      encoding: 'utf-8', timeout: timeoutMs, windowsHide: true,
    }).trim();
  } catch { return ''; }
}

function adbDevices(): DeviceInfo[] {
  try {
    const out = execFileSync('adb', ['devices'], { encoding: 'utf-8', timeout: 8000, windowsHide: true });
    const devices: DeviceInfo[] = [];
    for (const line of out.split('\n').slice(1)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length < 2) continue;
      const serial = parts[0];
      const state = parts[1];  // device / offline / unauthorized
      const info: DeviceInfo = { serial, state };
      if (state === 'device') {
        info.model = adbShell(serial, 'getprop ro.product.model') || undefined;
        info.abi = adbShell(serial, 'getprop ro.product.cpu.abi') || undefined;
        info.androidVersion = adbShell(serial, 'getprop ro.build.version.release') || undefined;
      }
      devices.push(info);
    }
    return devices;
  } catch {
    return [];
  }
}

/** 探测某设备上游戏包是否在运行 (返回 version + pid) */
function probeAppOnDevice(serial: string, packageName: string): { appVersion?: string; appPid?: string } {
  const result: { appVersion?: string; appPid?: string } = {};
  // PID
  const pidOut = adbShell(serial, `pidof ${packageName}`, 5000);
  if (pidOut) result.appPid = pidOut.split(/\s+/)[0];
  // version
  const dumpOut = adbShell(serial, `dumpsys package ${packageName}`, 8000);
  for (const line of dumpOut.split('\n')) {
    const t = line.trim();
    if (t.startsWith('versionName=')) {
      result.appVersion = t.split('=')[1]?.trim();
      break;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 采集任务 (job) 管理 — SSE 日志流
// ---------------------------------------------------------------------------
interface CollectJobRecord {
  id: string;
  config: string;
  status: 'processing' | 'done' | 'failed';
  runId?: string;
  outDir?: string;
  ingestStatus?: 'idle' | 'processing' | 'done' | 'failed';
  ingestRunId?: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
  exitCode?: number;
  tempConfigPath?: string;  // 临时 YAML 路径 (参数覆盖时生成, 完成后删除)
}

interface CollectLogEvent {
  jobId: string;
  type: 'log' | 'stage' | 'done' | 'failed';
  message: string;
  createdAt: number;
}

const collectJobs = new Map<string, CollectJobRecord>();
const collectEvents = new Map<string, CollectLogEvent[]>();
const collectClients = new Map<string, Set<NodeJS.WritableStream>>();
const collectProcesses = new Map<string, ChildProcessWithoutNullStreams>();

function emitCollect(jobId: string, type: CollectLogEvent['type'], message: string) {
  const event: CollectLogEvent = { jobId, type, message, createdAt: Date.now() };
  const list = collectEvents.get(jobId) ?? [];
  list.push(event);
  collectEvents.set(jobId, list.slice(-500));
  for (const client of collectClients.get(jobId) ?? []) {
    try { client.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* ignore */ }
  }
}

function subscribeCollect(jobId: string, client: NodeJS.WritableStream) {
  const set = collectClients.get(jobId) ?? new Set();
  set.add(client);
  collectClients.set(jobId, set);
  client.write(`data: ${JSON.stringify({ type: 'connected', jobId, createdAt: Date.now() })}\n\n`);
  for (const event of collectEvents.get(jobId) ?? []) {
    client.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function unsubscribeCollect(jobId: string, client: NodeJS.WritableStream) {
  collectClients.get(jobId)?.delete(client);
  if (collectClients.get(jobId)?.size === 0) collectClients.delete(jobId);
}

function startCollectProcess(jobId: string, configAbsPath: string, extraArgs: string[]) {
  const py = process.env.PYTHON || 'python';
  const args = [COLLECTOR_PY, '--config', configAbsPath, ...extraArgs];

  emitCollect(jobId, 'stage', `启动采集: ${path.basename(configAbsPath)}`);
  emitCollect(jobId, 'log', `$ ${py} ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);

  const proc = spawn(py, args, {
    cwd: PROJECT_ROOT,
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
  });

  collectProcesses.set(jobId, proc);

  const lineBuf: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };

  const flushLines = (chunk: string, stream: 'stdout' | 'stderr') => {
    lineBuf[stream] += chunk;
    const lines = lineBuf[stream].split('\n');
    lineBuf[stream] = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.replace(/\r$/, '');
      if (trimmed.trim()) emitCollect(jobId, 'log', trimmed);
    }
  };

  proc.stdout.on('data', (d: Buffer) => flushLines(d.toString('utf-8'), 'stdout'));
  proc.stderr.on('data', (d: Buffer) => flushLines(d.toString('utf-8'), 'stderr'));

  proc.on('close', (code: number | null) => {
    if (lineBuf.stdout.trim()) emitCollect(jobId, 'log', lineBuf.stdout);
    if (lineBuf.stderr.trim()) emitCollect(jobId, 'log', lineBuf.stderr);

    const job = collectJobs.get(jobId);
    if (!job) return;
    job.exitCode = code ?? -1;
    job.completedAt = Date.now();
    collectProcesses.delete(jobId);

    // 清理临时 YAML (参数覆盖生成的)
    if (job.tempConfigPath) {
      try { fs.unlinkSync(job.tempConfigPath); } catch { /* ignore */ }
      job.tempConfigPath = undefined;
    }

    if (code === 0) {
      // 从日志中提取 run_label / out_dir
      const events = collectEvents.get(jobId) ?? [];
      let runLabel = '';
      let outDir = '';
      for (const ev of [...events].reverse()) {
        if (!runLabel) {
          const m = ev.message.match(/开始采集 run \d+\/\d+:\s*(\S+)/);
          if (m) runLabel = m[1];
        }
        if (!outDir) {
          const m = ev.message.match(/输出目录:\s*(\S+)/);
          if (m) outDir = m[1];
        }
        if (runLabel && outDir) break;
      }
      job.status = 'done';
      job.runId = runLabel || undefined;
      job.outDir = outDir || undefined;
      job.ingestStatus = 'idle';
      emitCollect(jobId, 'done', `采集完成${runLabel ? ` · ${runLabel}` : ''}`);
    } else {
      job.status = 'failed';
      job.error = `进程退出码 ${code}`;
      emitCollect(jobId, 'failed', `采集失败 (exit ${code})`);
    }
  });

  proc.on('error', (err: Error) => {
    const job = collectJobs.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = err.message;
      job.completedAt = Date.now();
    }
    collectProcesses.delete(jobId);
    emitCollect(jobId, 'failed', `进程启动失败: ${err.message}`);
  });
}

// ---------------------------------------------------------------------------
// .raw → .pdata 转换 (Unity batchmode)
// ---------------------------------------------------------------------------
function convertRawToPdata(jobId: string, rawPath: string, onLog: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const outDir = path.dirname(rawPath);
    const baseName = path.basename(rawPath, path.extname(rawPath));
    const pdataPath = path.join(outDir, baseName + '.pdata');
    const logPath = path.join(outDir, baseName + '.convert.log');

    onLog(`[convert] Unity batchmode: ${rawPath} → ${pdataPath}`);

    const args = [
      '-batchmode', '-nographics',
      '-projectPath', UNITY_PROJECT,
      '-executeMethod', 'AOE.Editor.Performance.RawToPdataBatchmode.Convert',
      '-quit',
    ];

    const env = {
      ...process.env,
      RAW_TO_PDATA_INPUT: rawPath,
      RAW_TO_PDATA_OUTPUT: pdataPath,
      RAW_TO_PDATA_LOG: logPath,
    };

    const proc = spawn(UNITY_EXE, args, {
      cwd: PROJECT_ROOT,
      windowsHide: true,
      env,
      timeout: 300000,  // 5 分钟超时
    });

    let stderr = '';
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString('utf-8'); });

    proc.on('close', (code: number | null) => {
      if (code === 0 && fs.existsSync(pdataPath)) {
        onLog(`[convert] .pdata 生成成功: ${pdataPath} (${(fs.statSync(pdataPath).size / 1024 / 1024).toFixed(1)} MB)`);
        // 尝试读 convert log 的最后几行
        try {
          const log = fs.readFileSync(logPath, 'utf-8');
          const lines = log.split('\n').filter(l => l.trim()).slice(-3);
          for (const line of lines) onLog(`[convert] ${line}`);
        } catch { /* ignore */ }
        resolve(pdataPath);
      } else {
        onLog(`[convert] Unity batchmode 失败 (exit ${code})`);
        if (stderr) onLog(`[convert] stderr: ${stderr.slice(0, 500)}`);
        // 读 convert log
        try {
          const log = fs.readFileSync(logPath, 'utf-8');
          const lines = log.split('\n').filter(l => l.trim()).slice(-5);
          for (const line of lines) onLog(`[convert] ${line}`);
        } catch { /* ignore */ }
        reject(new Error(`Unity batchmode 转换失败 (exit ${code})`));
      }
    });

    proc.on('error', (err: Error) => {
      onLog(`[convert] Unity 进程启动失败: ${err.message}`);
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// 入库预处理 — 采集完成后, 把原始文件喂给 ingest 管线, run 变 ready
// ---------------------------------------------------------------------------
async function runIngestForJob(jobId: string) {
  const job = collectJobs.get(jobId);
  if (!job || !job.outDir) {
    emitCollect(jobId, 'failed', '入库失败: 未找到采集输出目录');
    return;
  }

  job.ingestStatus = 'processing';
  emitCollect(jobId, 'stage', '═══ 入库预处理 ═══');

  // 读 meta.json (collector 写的)
  const metaPath = path.join(job.outDir, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    emitCollect(jobId, 'failed', `入库失败: meta.json 不存在 (${metaPath})`);
    job.ingestStatus = 'failed';
    return;
  }

  const collectorMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  emitCollect(jobId, 'log', `[ingest] 读取 meta.json: project=${collectorMeta.project}, device=${collectorMeta.device}, scene=${collectorMeta.scene}, version=${collectorMeta.version ?? '—'}`);

  // 用 meta.json 的 file_paths 获取文件路径 (权威来源, 不靠扩展名猜)
  const filePaths = collectorMeta.file_paths ?? {};
  const pdataFiles: string[] = (filePaths.pdata ?? [])
    .filter((p: string) => p && fs.existsSync(p));
  const perfDataPath: string | undefined = filePaths.perf_data
    ? (fs.existsSync(filePaths.perf_data) ? filePaths.perf_data : undefined)
    : undefined;
  const pftracePath: string | undefined = filePaths.pftrace
    ? (fs.existsSync(filePaths.pftrace) ? filePaths.pftrace : undefined)
    : undefined;

  const hasUnity = pdataFiles.length > 0;
  const hasSimpleperf = !!perfDataPath;
  const hasPerfetto = !!pftracePath;

  emitCollect(jobId, 'log', `[ingest] 检测到数据源: unity=${hasUnity} (${pdataFiles.length} 个文件), simpleperf=${hasSimpleperf}, perfetto=${hasPerfetto}`);

  const onLog = (line: string) => emitCollect(jobId, 'log', line);

  // .raw 文件需要先通过 Unity batchmode 转换为 .pdata
  const pdataPathsForIngest: string[] = [];
  for (const f of pdataFiles) {
    if (f.toLowerCase().endsWith('.raw')) {
      emitCollect(jobId, 'stage', `转换 ${path.basename(f)} (.raw → .pdata)`);
      try {
        const converted = await convertRawToPdata(jobId, f, onLog);
        pdataPathsForIngest.push(converted);
      } catch (e: any) {
        emitCollect(jobId, 'failed', `.raw → .pdata 转换失败: ${e.message}`);
        job.ingestStatus = 'failed';
        return;
      }
    } else {
      pdataPathsForIngest.push(f);
    }
  }

  if (!hasUnity && !hasSimpleperf && !hasPerfetto) {
    emitCollect(jobId, 'failed', '入库失败: 未检测到任何数据源文件');
    job.ingestStatus = 'failed';
    return;
  }

  // 构建 IngestMeta — 用 collector 的 runId 做 upsert, 保证 run 行一致
  const ingestMeta: IngestMeta = {
    runId: job.runId,   // 复用 collector 写的 runId, ingestProfile 会 upsert
    label: collectorMeta.label,
    device: collectorMeta.device,
    scene: collectorMeta.scene,
    projectName: collectorMeta.project,
    version: collectorMeta.version || undefined,
  };

  try {
    let run;
    if ((hasUnity ? 1 : 0) + (hasSimpleperf ? 1 : 0) + (hasPerfetto ? 1 : 0) >= 2) {
      // 多源 → unified ingest
      emitCollect(jobId, 'log', '[ingest] 多源模式 → ingestUnifiedFiles');
      run = await ingestUnifiedFiles(
        {
          unity: hasUnity ? pdataPathsForIngest[0] : undefined,
          simpleperf: hasSimpleperf ? perfDataPath : undefined,
          perfetto: hasPerfetto ? pftracePath : undefined,
        },
        { meta: ingestMeta },
        onLog,
      );
    } else if (hasUnity) {
      // 单源 Unity
      emitCollect(jobId, 'log', '[ingest] Unity 单源 → buildAndIngestUnity');
      run = await buildAndIngestUnity(pdataPathsForIngest[0], ingestMeta, onLog);
    } else {
      // 单源 simpleperf 或 perfetto — 走 unified (它支持单源)
      emitCollect(jobId, 'log', '[ingest] 单源 (非 Unity) → ingestUnifiedFiles');
      run = await ingestUnifiedFiles(
        {
          simpleperf: hasSimpleperf ? perfDataPath : undefined,
          perfetto: hasPerfetto ? pftracePath : undefined,
        },
        { meta: ingestMeta },
        onLog,
      );
    }

    job.ingestStatus = 'done';
    job.ingestRunId = run.id;
    emitCollect(jobId, 'stage', `═══ 入库完成: run=${run.id} status=${run.status} ═══`);
    emitCollect(jobId, 'done', `入库预处理完成 · run ${run.id} 已 ready，可进行 AI 分析`);
  } catch (e: any) {
    job.ingestStatus = 'failed';
    emitCollect(jobId, 'failed', `入库预处理失败: ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// 路由注册
// ---------------------------------------------------------------------------
export async function collectRoutes(app: FastifyInstance) {

  /** 列出可用采集配置 */
  app.get('/collect/configs', async () => {
    return { configs: scanCollectConfigs() };
  });

  /** 获取指定配置的完整解析 */
  app.get('/collect/configs/:file', async (request, reply) => {
    const { file } = request.params as { file: string };
    const detail = loadConfigDetail(file);
    if (!detail) return reply.status(404).send({ error: '配置不存在' });
    return detail;
  });

  /** 探测 adb 设备 (可选 package 参数, 探测游戏是否在运行) */
  app.get('/collect/device', async (request) => {
    const query = request.query as { package?: string };
    const devices = adbDevices();
    // 如果传了 package, 额外探测游戏进程
    if (query.package) {
      for (const d of devices) {
        if (d.state !== 'device') continue;
        const appInfo = probeAppOnDevice(d.serial, query.package);
        d.appVersion = appInfo.appVersion;
        d.appPid = appInfo.appPid;
      }
    }
    return { devices, adbAvailable: devices.length > 0 };
  });

  /** 启动采集 */
  app.post('/collect/start', async (request, reply) => {
    const body = request.body as {
      config?: string;
      label?: string;
      runs?: number;
      device?: string;
      tools?: string[];          // ["unity", "simpleperf", "perfetto"]
      configOverrides?: {        // 深度合并到原始 YAML
        project?: { name?: string; package?: string };
        scenes?: { default?: { scene?: string; label?: string } };
        action?: { defaultDuration?: number; steps: { primitive: string; params: Record<string, any> }[] };
      };
    };

    if (!body?.config) {
      return reply.status(400).send({ error: '缺少 config 参数' });
    }

    const configAbs = path.resolve(PROJECTS_DIR, body.config);
    if (!configAbs.startsWith(PROJECTS_DIR + path.sep) || !fs.existsSync(configAbs)) {
      return reply.status(400).send({ error: `非法或不存在配置: ${body.config}` });
    }

    // 深度合并
    function deepMerge(base: any, overrides: any): any {
      const result = { ...base };
      for (const [key, val] of Object.entries(overrides)) {
        if (val && typeof val === 'object' && !Array.isArray(val) && base?.[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
          result[key] = deepMerge(base[key], val);
        } else {
          result[key] = val;
        }
      }
      return result;
    }

    // 如果有参数覆盖, 生成临时 YAML
    let effectiveConfigPath = configAbs;
    const jobId = uuid();
    if (body.configOverrides && Object.keys(body.configOverrides).length > 0) {
      try {
        const origYaml = yaml.load(fs.readFileSync(configAbs, 'utf-8')) as any;
        const merged = deepMerge(origYaml, body.configOverrides);
        const tmpDir = path.join(PROJECT_ROOT, 'output', 'collect', '.tmp');
        fs.mkdirSync(tmpDir, { recursive: true });
        const tmpPath = path.join(tmpDir, `${jobId}.yaml`);
        fs.writeFileSync(tmpPath, yaml.dump(merged, { lineWidth: 120 }), 'utf-8');
        effectiveConfigPath = tmpPath;
      } catch (e: any) {
        return reply.status(400).send({ error: `参数覆盖生成失败: ${e.message}` });
      }
    }

    const job: CollectJobRecord = {
      id: jobId,
      config: body.config,
      status: 'processing',
      createdAt: Date.now(),
      tempConfigPath: effectiveConfigPath !== configAbs ? effectiveConfigPath : undefined,
    };
    collectJobs.set(jobId, job);
    collectEvents.set(jobId, []);

    const extraArgs: string[] = [];
    if (body.label) extraArgs.push('--label', body.label);
    if (body.runs && body.runs > 1) extraArgs.push('--runs', String(body.runs));
    if (body.device) extraArgs.push('--device', body.device);
    // 工具选择: "unity" → "unity-profiler" (driver name)
    if (body.tools && body.tools.length > 0) {
      const driverTools = body.tools.map(t => t === 'unity' ? 'unity-profiler' : t);
      extraArgs.push('--tools', driverTools.join(','));
    }
    extraArgs.push('--web-api', 'none');

    setImmediate(() => startCollectProcess(jobId, effectiveConfigPath, extraArgs));

    return reply.status(202).send({ jobId, status: 'processing' });
  });

  /** 任务状态 */
  app.get('/collect/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = collectJobs.get(id);
    if (!job) return reply.status(404).send({ error: '采集任务不存在' });
    return { job, events: collectEvents.get(id) ?? [] };
  });

  /** SSE 实时日志 */
  app.get('/collect/jobs/:id/events', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = collectJobs.get(id);
    if (!job) return reply.status(404).send({ error: '采集任务不存在' });

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': request.headers.origin || '*',
      'Access-Control-Allow-Credentials': 'true',
    });

    const client = reply.raw as NodeJS.WritableStream;
    subscribeCollect(id, client);
    request.raw.on('close', () => unsubscribeCollect(id, client));
  });

  /** 中止采集 */
  app.post('/collect/jobs/:id/stop', async (request, reply) => {
    const { id } = request.params as { id: string };
    const proc = collectProcesses.get(id);
    if (proc) {
      proc.kill('SIGTERM');
      return { stopped: true };
    }
    return reply.status(404).send({ error: '进程不存在或已结束' });
  });

  /** 入库预处理 — 采集完成后, 把原始文件喂给 ingest 管线 */
  app.post('/collect/jobs/:id/ingest', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = collectJobs.get(id);
    if (!job) return reply.status(404).send({ error: '采集任务不存在' });
    if (job.status !== 'done') return reply.status(400).send({ error: '采集尚未完成' });
    if (job.ingestStatus === 'processing') return reply.status(409).send({ error: '入库正在进行中' });

    // 异步执行, 通过 SSE 流式输出进度
    setImmediate(() => runIngestForJob(id));
    return { jobId: id, ingestStarted: true };
  });

  /** 历史采集列表 — 扫描 output/collect/ 下所有含 meta.json 的目录 */
  app.get('/collect/history', async () => {
    const collectDir = path.join(PROJECT_ROOT, 'output', 'collect');
    const history: Array<{
      dir: string;
      runLabel: string;
      project: string;
      scene: string;
      device: string;
      version?: string;
      tools: string[];
      frameCount?: number;
      durationSec?: number;
      profileOk?: boolean;
      createdAt: number;
    }> = [];
    if (!fs.existsSync(collectDir)) return { history };
    for (const name of fs.readdirSync(collectDir)) {
      if (name.startsWith('.')) continue;
      const dirPath = path.join(collectDir, name);
      if (!fs.statSync(dirPath).isDirectory()) continue;
      const metaPath = path.join(dirPath, 'meta.json');
      if (!fs.existsSync(metaPath)) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        history.push({
          dir: name,
          runLabel: meta.run_label || name,
          project: meta.project || '',
          scene: meta.scene || '',
          device: meta.device || '',
          version: meta.version,
          tools: meta.tools || [],
          frameCount: meta.frame_count,
          durationSec: meta.duration_sec,
          profileOk: meta.game_profile_ok,
          createdAt: fs.statSync(dirPath).mtimeMs,
        });
      } catch { /* skip */ }
    }
    history.sort((a, b) => b.createdAt - a.createdAt);
    return { history };
  });

  /** 按目录入库 — 对已采集但未入库的历史目录执行入库预处理 */
  app.post('/collect/ingest-dir', async (request, reply) => {
    const body = request.body as { dir?: string };
    if (!body?.dir) return reply.status(400).send({ error: '缺少 dir 参数' });

    const dirPath = path.join(PROJECT_ROOT, 'output', 'collect', body.dir);
    if (!dirPath.startsWith(path.join(PROJECT_ROOT, 'output', 'collect') + path.sep) || !fs.existsSync(dirPath)) {
      return reply.status(400).send({ error: `非法或不存在目录: ${body.dir}` });
    }
    const metaPath = path.join(dirPath, 'meta.json');
    if (!fs.existsSync(metaPath)) {
      return reply.status(400).send({ error: '该目录没有 meta.json, 不是有效采集结果' });
    }

    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    const jobId = uuid();
    const job: CollectJobRecord = {
      id: jobId,
      config: '(history)',
      status: 'done',           // 采集已完成
      runId: meta.run_label || body.dir,
      outDir: dirPath,
      ingestStatus: 'idle',
      createdAt: Date.now(),
    };
    collectJobs.set(jobId, job);
    collectEvents.set(jobId, []);

    setImmediate(() => runIngestForJob(jobId));
    return { jobId, ingestStarted: true };
  });
}
