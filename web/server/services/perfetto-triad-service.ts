import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { v4 as uuid } from 'uuid';
import type { CliProvider } from '../../shared/types.js';
import type { IngestMeta, PerfettoIngestOptions } from './run-ingest-service.js';
import { buildPerfettoProfile, ingestProfile } from './run-ingest-service.js';
import { saveRun } from './run-store.js';
import { saveAnalysisWithReport } from './analysis-store.js';
import { PERF_PROFILE_SCHEMA_VERSION, type Run } from '../../shared/perf-model.js';

import { saveReportMarkdown } from './report-export.js';
import { getConfig } from '../utils/config.js';
import { defaultCliProvider, isCliAvailable, cliUnavailableHint, resolveCliExecutable, spawnCliProcess } from '../utils/cli-resolver.js';
import { normalizeReportInOutputDir, resolveSkillDir } from './skill-config.js';
import { findMatchingSkillReport } from './source-profile-runner.js';

export type PerfettoTriadRole = 'base' | 'cur' | 'throttle';

export interface PerfettoTriadInput {
  role: PerfettoTriadRole;
  tracePath: string;
  sampleDir?: string;
  label?: string;
}

export interface PerfettoTriadOptions {
  meta?: IngestMeta;
  perfetto?: PerfettoIngestOptions;
  cliProvider?: CliProvider;
  onLog?: (line: string) => void;
}

export interface PerfettoTriadResult {
  triadId: string;
  runIds: string[];
  reportPath: string;
  outputDir: string;
  markdown: string;
}

interface CliProviderConfig {
  label: string;
  buildArgs: () => string[];
}

interface TriadReportQuality {
  ok: boolean;
  errors: string[];
  warnings: string[];
  lineCount: number;
  goldenLineCount: number;
}

// NOTE: prompt is piped via stdin to avoid Windows .cmd long-prompt truncation
// (see simpleperf v4 §8.2 Bug 3 + R1 spike validation 2026-06-30).
// buildArgs no longer takes the prompt — runCliTriad writes it to child.stdin.
const CLI_PROVIDERS: Record<CliProvider, CliProviderConfig> = {
  codebuddy: {
    label: 'CodeBuddy',
    buildArgs: () => [
      '-p',
      '--output-format', 'stream-json',
      '-y',
      '--dangerously-skip-permissions',
      '--allowedTools', 'Bash,Read,Write,Glob,Grep',
    ],
  },
  claude: {
    label: 'Claude Code',
    buildArgs: () => [
      '-p',
      '--output-format', 'stream-json',
      '--allowedTools', 'Bash,Read,Write,Glob,Grep',
    ],
  },
  mock: {
    label: 'Mock',
    buildArgs: () => [],
  },
};

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80);
}

function sampleName(input: PerfettoTriadInput): string {
  return path.basename(input.sampleDir || path.dirname(input.tracePath));
}

function summaryPath(outputDir: string, role: PerfettoTriadRole): string {
  return path.join(outputDir, role, 'perfetto-profile-summary.json');
}

function reportHeadline(markdown: string): string {
  const line = markdown.split('\n').find(l => l.startsWith('#') || l.startsWith('> **结论**'));
  if (!line) return 'Perfetto 三态对比报告';
  return line.replace(/^#+\s*/, '').replace(/^>\s*\*\*结论\*\*:?\s*/, '').replace(/\*\*/g, '').trim().slice(0, 120);
}

function readSummary(outputDir: string, role: PerfettoTriadRole): any {
  return JSON.parse(fs.readFileSync(summaryPath(outputDir, role), 'utf-8'));
}

function frameOf(summary: any, name: string): any {
  return Array.isArray(summary?.frame) ? summary.frame.find((f: any) => f.frameDefinition === name) : null;
}

function playerFrame(summary: any): any {
  const f = frameOf(summary, 'playerloop') || {};
  const fa = summary?.frameAnalysis?.summary || {};
  return { ...fa, ...f, count: f.count ?? fa.count };
}

function fmtToken(value: unknown, digits = 1): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : null;
}

function metric(summary: any, name: string): unknown {
  return (summary?.metrics || []).find((m: any) => m.name === name)?.value;
}

function hotSliceName(slice: any): string | null {

  const name = slice?.label || slice?.pattern || slice?.name;
  return typeof name === 'string' && name.trim() ? name.trim() : null;
}

function hotSliceScore(slice: any): number {
  const values = [slice?.totalMs, slice?.durationMs, slice?.sumMs, slice?.avgMs, slice?.p95Ms, slice?.count, slice?.totalPct];
  return values.find(v => typeof v === 'number' && Number.isFinite(v)) ?? 0;
}

function collectExpectedHotMarkers(outputDir: string): string[] {
  const seen = new Set<string>();
  const markers: string[] = [];
  for (const role of ['base', 'cur', 'throttle'] as PerfettoTriadRole[]) {
    const summary = readSummary(outputDir, role);
    for (const slice of selectedHotSlices(summary).slice(0, 8)) {
      const name = hotSliceName(slice);
      if (!name || name.length < 3 || seen.has(name)) continue;
      seen.add(name);
      markers.push(name);
    }
  }
  return markers.slice(0, 12);
}

function extractSectionIds(markdown: string): string[] {

  return markdown
    .split(/\r?\n/)
    .map(line => line.trim().match(/^##\s+§(-?\d+)/)?.[1])
    .filter((id): id is string => Boolean(id));
}


function goldenReportPath(projectRoot: string): string {
  const v53 = path.join(projectRoot, 'docs', 'report', 'performance-report_perfetto_ULTIMATE_v5.3.md');
  if (fs.existsSync(v53)) return v53;
  return path.join(projectRoot, 'docs', 'report', 'performance-report_perfetto_ULTIMATE_v5.2.md');
}

function validateTriadReportQuality(markdown: string, outputDir: string, goldenPath: string): TriadReportQuality {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lineCount = markdown.split(/\r?\n/).length;
  const golden = fs.existsSync(goldenPath) ? fs.readFileSync(goldenPath, 'utf-8') : '';
  const goldenLineCount = golden ? golden.split(/\r?\n/).length : 0;
  const reportSections = new Set(extractSectionIds(markdown));
  const goldenSections = extractSectionIds(golden);


  if (!golden) errors.push(`缺少金标准报告: ${goldenPath}`);
  if (goldenLineCount && lineCount < Math.floor(goldenLineCount * 0.65)) {
    errors.push(`报告厚度不足: ${lineCount} 行 < 金标准 ${goldenLineCount} 行的 65%`);
  }

  for (const section of goldenSections) {
    if (!reportSections.has(section)) errors.push(`缺少一级章节编号: §${section}`);
  }


  const requiredMarkers = [
    '§-1 数据采集',
    '§3 多线程独立分析',
    '§4.5 因果链可视化',
    '§5.2 降频形态识别',
    '§5.4 降频判定矩阵',
    '§6.2 主线程 callTrees',
    '§6.3 Top 红线热点子函数下钻',
    '§7.3 GPU bound 判定矩阵',
    'Gfx.WaitForPresent',
    'GC.Alloc',
    'binder',
    'off-CPU',
    '```',
  ];
  for (const marker of requiredMarkers) {
    if (!markdown.includes(marker)) errors.push(`缺少关键资产/叙事: ${marker}`);
  }

  const expectedHotMarkers = collectExpectedHotMarkers(outputDir);
  const missingHotMarkers = expectedHotMarkers.filter(marker => !markdown.includes(marker));
  if (missingHotMarkers.length > Math.max(2, Math.floor(expectedHotMarkers.length * 0.35))) {
    errors.push(`当前样本 Top 热点覆盖不足: ${missingHotMarkers.join(', ')}`);
  } else if (missingHotMarkers.length) {
    warnings.push(`部分当前样本 Top 热点未显式出现: ${missingHotMarkers.join(', ')}`);
  }


  for (const role of ['base', 'cur', 'throttle'] as PerfettoTriadRole[]) {
    const summary = readSummary(outputDir, role);
    const player = playerFrame(summary);
    const count = typeof player.count === 'number' ? String(player.count) : null;
    const fps = fmtToken(player.fps, 1);
    const p95 = fmtToken(player.p95Ms, 2);
    if (count && !markdown.includes(count)) errors.push(`${role} PlayerLoop 帧数未出现在报告中: ${count}`);
    if (fps && !markdown.includes(fps)) warnings.push(`${role} FPS 未按 1 位小数出现在报告中: ${fps}`);
    if (p95 && !markdown.includes(p95)) warnings.push(`${role} p95 未按 2 位小数出现在报告中: ${p95}`);
  }

  if (/Web v5 结构化兜底版|Mock Perfetto 三态对比报告|兜底报告/.test(markdown)) {
    errors.push('报告仍是 Web/Mock 兜底产物，不是 CLI sediment 正式报告');
  }

  return { ok: errors.length === 0, errors, warnings, lineCount, goldenLineCount };
}

function writeQualityReport(outputDir: string, quality: TriadReportQuality): void {
  fs.writeFileSync(path.join(outputDir, 'triad-report-quality.json'), JSON.stringify(quality, null, 2), 'utf-8');
}

function simplifyTree(node: any, depth = 0, maxDepth = 7): any {
  if (!node || depth > maxDepth) return undefined;
  const semantic = /PlayerLoop|Update|LateUpdate|Render|Present|Wait|GC|Alloc|Lua|Manager|Mgr|System|Job|Binder|Semaphore|Sleep|Runnable|Running/i;
  const children = (node.children || [])
    .filter((c: any) => depth < 2 || semantic.test(String(c.name || '')) || (c.totalPct || 0) >= 0.25 || (c.totalMs || 0) >= 0.05)
    .sort((a: any, b: any) => (b.totalMs || b.totalPct || 0) - (a.totalMs || a.totalPct || 0))
    .slice(0, depth < 3 ? 14 : 8)
    .map((c: any) => simplifyTree(c, depth + 1, maxDepth))
    .filter(Boolean);
  return {
    name: node.name,
    totalMs: node.totalMs,
    selfMs: node.selfMs,
    totalPct: node.totalPct,
    count: node.count,
    avgMs: node.avgMs,
    children,
  };
}

function selectedThreads(summary: any): any {

  const names = ['UnityMain', 'UnityGfxRenderS', 'RHI', 'UnityChoreograp', 'AudioTrack', 'AAudio_1', 'Audio Mixer Thr', 'Lua MtGC', 'LuaMtGC'];
  const map = summary.threadsSched || {};
  const list = summary.threadsSchedList || [];
  const result: Record<string, any> = {};
  for (const name of names) {
    const t = map[name] || list.find((x: any) => x.name === name || x.commName === name || String(x.name || '').includes(name));
    if (t) result[name] = { name: t.name || t.commName, runningPct: t.runningPct, sleepingPct: t.sleepingPct, runnablePct: t.runnablePct, totalMs: t.totalMs, totalNs: t.totalNs };
  }
  result.top = list.slice(0, 16).map((t: any) => ({ name: t.name || t.commName, runningPct: t.runningPct, sleepingPct: t.sleepingPct, runnablePct: t.runnablePct }));
  return result;
}

function selectedHotSlices(summary: any): any[] {
  const hot = summary.aoeHotSlices || [];
  const semantic = /WaitForPresent|Present|WaitForTargetFPS|GC\.Alloc|PlayerUpdateCanvases|SimulationSystemGroup|Lua|Manager|Mgr|System|Job|Update|LateUpdate|Render/i;
  const ranked = hot
    .map((slice: any, index: number) => ({ slice, index, score: hotSliceScore(slice), name: hotSliceName(slice) || '' }))
    .filter((x: any) => x.name)
    .sort((a: any, b: any) => {
      const semanticDelta = Number(semantic.test(b.name)) - Number(semantic.test(a.name));
      if (semanticDelta) return semanticDelta;
      return b.score - a.score || a.index - b.index;
    })
    .map((x: any) => x.slice);
  return ranked.filter((v: any, i: number, arr: any[]) => arr.findIndex(x => hotSliceName(x) === hotSliceName(v)) === i).slice(0, 28);
}


function unityMainTree(summary: any): any {
  const tree = (summary.callTrees || []).find((x: any) => x.thread === 'UnityMain');
  return tree ? simplifyTree(tree.root) : null;
}

function writeTriadFacts(outputDir: string, inputs: PerfettoTriadInput[]): string {
  const roles: PerfettoTriadRole[] = ['base', 'cur', 'throttle'];
  const facts = {
    generatedAt: new Date().toISOString(),
    samples: Object.fromEntries(inputs.map(input => [input.role, {
      sampleDir: input.sampleDir,
      tracePath: input.tracePath,
      label: input.label,
    }])),
    roles: Object.fromEntries(roles.map(role => {
      const s = readSummary(outputDir, role);
      return [role, {
        meta: s.meta,
        frame: s.frame,
        frameAnalysis: s.frameAnalysis?.summary,
        confidence: s.confidence,
        keyMetrics: {
          cpuFreqAvgMhz: metric(s, 'system.cpuFreqAvgMhz'),
          unityMainRunningPct: metric(s, 'thread.UnityMain.runningPct'),
          unityMainSleepingPct: metric(s, 'thread.UnityMain.sleepingPct'),
          unityMainRunnablePct: metric(s, 'thread.UnityMain.runnablePct'),
        },
        threads: selectedThreads(s),
        machineState: s.machineState,
        throttling: s.throttling,
        offCpuReasons: s.offCpuReasons,
        offCpuAttribution: s.offCpuAttribution,
        binderPeers: { byServerProcess: (s.binderPeers?.byServerProcess || []).slice(0, 12) },
        gcAllocByModule: (s.gcAllocByModule || []).slice(0, 16),
        hotSlices: selectedHotSlices(s),
        unityMainTree: unityMainTree(s),
      }];
    })),
  };
  const factsPath = path.join(outputDir, 'triad-report-facts-compact.json');
  fs.writeFileSync(factsPath, JSON.stringify(facts, null, 2), 'utf-8');
  return factsPath;
}


function buildTriadPrompt(inputs: PerfettoTriadInput[], outputDir: string, factsPath: string): string {

  const config = getConfig();
  const skillDir = resolveSkillDir(config.skillProjectPath, 'perfetto').replace(/\\/g, '/');
  const templatePath = path.join(skillDir, 'references', 'perfetto-report-template.md').replace(/\\/g, '/');
  const goldenPath = goldenReportPath(config.skillProjectPath).replace(/\\/g, '/');
  const normalizedOutput = path.resolve(outputDir).replace(/\\/g, '/');
  const normalizedFacts = path.resolve(factsPath).replace(/\\/g, '/');
  const promptTemplatePath = path.join(skillDir, 'prompts', 'triad-prompt.txt');
  const template = fs.readFileSync(promptTemplatePath, 'utf-8');

  const sampleLines = inputs.map(input => {
    const roleDir = path.join(outputDir, input.role).replace(/\\/g, '/');
    const sampleDir = (input.sampleDir || path.dirname(input.tracePath)).replace(/\\/g, '/');
    return `- ${input.role}: sampleDir=${sampleDir}, trace=${path.resolve(input.tracePath).replace(/\\/g, '/')}, summary=${path.join(roleDir, 'perfetto-profile-summary.json').replace(/\\/g, '/')}`;
  }).join('\n');

  return template
    .replace(/\{\{SKILL_DIR\}\}/g, skillDir)
    .replace(/\{\{OUTPUT_DIR\}\}/g, normalizedOutput)
    .replace(/\{\{TEMPLATE_PATH\}\}/g, templatePath)
    .replace(/\{\{GOLDEN_PATH\}\}/g, goldenPath)
    .replace(/\{\{FACTS_PATH\}\}/g, normalizedFacts)
    .replace(/\{\{SAMPLE_LINES\}\}/g, sampleLines);
}

async function runCliTriad(
  triadId: string,
  inputs: PerfettoTriadInput[],
  outputDir: string,
  provider: CliProvider,
  onLog?: (line: string) => void,
): Promise<void> {
  const dest = path.join(outputDir, 'performance-report.md');
  if (provider === 'mock') {
    const matched = findMatchingSkillReport('perfetto', outputDir, {});
    if (!matched) throw new Error('Mock 模式未找到可复用 perfetto 金标准报告；三态正式报告必须切换到 CLI provider 生成');
    fs.copyFileSync(matched, dest);
    onLog?.(`[Mock] 已复制已有 perfetto 报告: ${matched}`);
    return;
  }

  const cfg = getConfig();
  const providerCfg = CLI_PROVIDERS[provider] ?? CLI_PROVIDERS.codebuddy;
  const { command, resolved } = resolveCliExecutable(provider, cfg.cliPaths?.[provider]);
  if (!resolved) throw new Error(cliUnavailableHint(provider));

  const factsPath = writeTriadFacts(outputDir, inputs);
  const prompt = buildTriadPrompt(inputs, outputDir, factsPath);
  fs.writeFileSync(path.join(outputDir, 'triad-cli-prompt.txt'), prompt, 'utf-8');

  const args = providerCfg.buildArgs();
  const logs: string[] = [];
  onLog?.(`[triad] ${providerCfg.label} CLI → ${outputDir}`);
  onLog?.(`[triad] cli: ${command.replace(/\\/g, '/')}`);

  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawnCliProcess(command, args, {
      cwd: cfg.skillProjectPath,
      env: process.env,
      windowsHide: true,
      stdio: 'pipe',
    });
    // Pipe prompt to stdin (avoids Windows .cmd long-prompt truncation).
    child.stdin?.write(prompt);
    child.stdin?.end();
    let jsonBuffer = '';
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      fs.writeFileSync(path.join(outputDir, 'triad-cli.log'), logs.join('\n'), 'utf-8');
      if (err) reject(err);
      else resolve();
    };

    child.stdout?.on('data', (data: Buffer) => {
      jsonBuffer += data.toString();
      const lines = jsonBuffer.split('\n');
      jsonBuffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          const msg = event.type === 'assistant'
            ? JSON.stringify(event.message?.content ?? []).slice(0, 600)
            : event.type === 'result'
              ? `result: ${event.subtype ?? ''} ${event.duration_ms ? Math.round(event.duration_ms / 1000) + 's' : ''}`
              : event.type;
          logs.push(msg);
          onLog?.(`[cli] ${msg}`);
        } catch {
          logs.push(trimmed);
          onLog?.(trimmed.slice(0, 600));
        }
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        logs.push(`[stderr] ${text}`);
        onLog?.(`[stderr] ${text.slice(0, 600)}`);
      }
    });

    child.on('error', err => finish(err));
    child.on('close', code => {
      normalizeReportInOutputDir(outputDir);
      if (code !== 0) {
        finish(new Error(`CLI 退出码: ${code}; ${logs.slice(-8).join('\n')}`));
        return;
      }
      if (!fs.existsSync(dest)) {
        finish(new Error(`CLI 未生成 ${dest}`));
        return;
      }
      finish();
    });

    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        finish(new Error('Perfetto 三态报告生成超时 (45分钟)'));
      }
    }, 45 * 60 * 1000);

  });
}

export async function buildPerfettoTriadReport(
  inputs: PerfettoTriadInput[],
  opts: PerfettoTriadOptions = {},
): Promise<PerfettoTriadResult> {
  const roles = new Set(inputs.map(i => i.role));
  for (const role of ['base', 'cur', 'throttle'] as PerfettoTriadRole[]) {
    if (!roles.has(role)) throw new Error(`缺少 ${role} perfetto sample`);
  }

  const config = getConfig();
  const triadId = opts.meta?.runId || `triad_${Date.now()}_${uuid().slice(0, 8)}`;
  const outputDir = path.join(config.dataDir, 'results', triadId);
  fs.mkdirSync(outputDir, { recursive: true });

  const ordered = (['base', 'cur', 'throttle'] as PerfettoTriadRole[]).map(role => inputs.find(i => i.role === role)!);
  const runIds: string[] = [];

  for (const input of ordered) {
    const runId = `${triadId}_${input.role}`;
    const roleDir = path.join(outputDir, input.role);
    fs.mkdirSync(roleDir, { recursive: true });
    opts.onLog?.(`[triad] 构建 ${input.role} perfetto profile…`);
    const profile = await buildPerfettoProfile(
      input.tracePath,
      { ...opts.meta, runId, label: input.label ?? `${input.role}_${sampleName(input)}` },
      opts.perfetto ?? {},
      roleDir,
      opts.onLog,
    );
    const run = await ingestProfile(profile, {
      ...opts.meta,
      runId,
      label: input.label ?? `${input.role}_${sampleName(input)}`,
      scene: opts.meta?.scene ?? input.role,
    });
    runIds.push(run.id);
  }

  for (const input of ordered) {
    const sp = summaryPath(outputDir, input.role);
    if (!fs.existsSync(sp)) throw new Error(`缺少 ${input.role} summary: ${sp}`);
  }

  const cliProvider = opts.cliProvider ?? defaultCliProvider(config.cliPaths);
  if (cliProvider !== 'mock' && !isCliAvailable(cliProvider, config.cliPaths?.[cliProvider])) {
    throw new Error(`${cliUnavailableHint(cliProvider)} Perfetto 三态正式报告不再回退 Web 兜底，请配置 CLI provider 后重试。`);
  }

  await runCliTriad(triadId, ordered, outputDir, cliProvider, opts.onLog);

  const reportFile = path.join(outputDir, 'performance-report.md');
  const markdown = fs.readFileSync(reportFile, 'utf-8');
  const quality = validateTriadReportQuality(markdown, outputDir, goldenReportPath(config.skillProjectPath));
  writeQualityReport(outputDir, quality);
  for (const warning of quality.warnings) opts.onLog?.(`[quality][warn] ${warning}`);
  if (!quality.ok) {
    throw new Error(`Perfetto 三态报告质量门禁失败：${quality.errors.join('; ')}。详见 ${path.join(outputDir, 'triad-report-quality.json')}`);
  }

  const exported = saveReportMarkdown('p-web-perfetto-triad', `performance-report_${sanitizeId(triadId)}`, markdown);
  const parentRun: Run = {
    id: triadId,
    label: opts.meta?.label ?? `Perfetto 三态对比 ${triadId}`,
    sources: ['perfetto_triad'],
    status: 'ready',
    meta: {
      device: opts.meta?.device,
      scene: opts.meta?.scene ?? 'perfetto_triad',
      projectName: opts.meta?.projectName,
      version: opts.meta?.version,
      notes: `base=${runIds[0]}; cur=${runIds[1]}; throttle=${runIds[2]}; report=${exported}`,
    },
    profile: {
      raw: [],
      core: {
        schemaVersion: PERF_PROFILE_SCHEMA_VERSION,
        metrics: [],
        frame: [],
        threads: [],
        system: {},
        confidence: { perFrameAlignmentOk: true, notes: ['Perfetto triad parent run; metrics live in child runs.'] },
      },
      detail: { perfetto_triad: { triadId, runIds, outputDir, reportPath: exported, quality } },
    },
    createdAt: Date.now(),
    completedAt: Date.now(),
  };
  saveRun(parentRun);
  saveAnalysisWithReport(
    {
      id: `analysis_${triadId}_perfetto_triad`,
      mode: 'compare',
      runIds: [triadId, ...runIds],
      status: 'completed',
      skill: 'perfetto-trace-analysis+triad',
    },

    { headline: reportHeadline(markdown), markdown, insights: [] },
    { analysisId: `analysis_${triadId}_perfetto_triad`, skill: 'perfetto-trace-analysis+triad' },
  );
  return { triadId, runIds, reportPath: exported, outputDir, markdown };
}
