import fs from 'fs';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { v4 as uuid } from 'uuid';
import type { CliProvider } from '../../shared/types.js';
import {
  buildSimpleperfDiffProfile,
  ingestProfile,
  runProjectPython,
  type IngestMeta,
} from './run-ingest-service.js';
import { saveAnalysisWithReport } from './analysis-store.js';
import { saveReportMarkdown } from './report-export.js';
import { getConfig } from '../utils/config.js';
import { defaultCliProvider, isCliAvailable, cliUnavailableHint, resolveCliExecutable, spawnCliProcess } from '../utils/cli-resolver.js';

export interface SimpleperfDiffInput {
  basePerfPath: string;
  curPerfPath: string;
  binaryCachePath?: string;
  sceneBase?: string;
  sceneCur?: string;
}

export interface SimpleperfDiffBundleInput {
  reportMarkdown: string;
  diffJsonPath?: string;
  providerReportPath?: string;
}

export interface SimpleperfDiffOptions {
  meta?: IngestMeta;
  binaryCachePath?: string;
  sceneBase?: string;
  sceneCur?: string;
  cliProvider?: CliProvider;
  skipAiEnrich?: boolean;
  /** @deprecated use skipAiEnrich — only skips optional CLI boost; Python enrich always runs */
  skipCliBoost?: boolean;
  onLog?: (line: string) => void;
}

export interface SimpleperfDiffResult {
  diffId: string;
  runId: string;
  reportPath: string;
  outputDir: string;
  markdown: string;
  usedAi: boolean;
}

interface CliProviderConfig {
  label: string;
  buildArgs: (prompt: string) => string[];
}

const CLI_PROVIDERS: Record<CliProvider, CliProviderConfig> = {
  codebuddy: {
    label: 'CodeBuddy',
    buildArgs: (prompt: string) => [
      '-p', prompt,
      '--output-format', 'stream-json',
      '-y',
      '--dangerously-skip-permissions',
      '--allowedTools', 'Read,Write,Glob,Grep',
    ],
  },
  claude: {
    label: 'Claude Code',
    buildArgs: (prompt: string) => [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--allowedTools', 'Read,Write,Glob,Grep',
    ],
  },
  mock: { label: 'Mock', buildArgs: () => [] },
};

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80);
}

/**
 * Scan diff JSON libs for any project pack's identify.selfDeveloperSoNames
 * and set PERFTOOL_PROJECT env var so the Python pipeline activates the
 * matching pack. Mirrors detect_project_from_libs() in
 * simpleperf_analyzer/project_pack.py.
 */
function detectAndSetProjectPack(workDir: string, onLog?: (line: string) => void): void {
  // Allow explicit overrides (env var, /etc) to win.
  if (process.env.PERFTOOL_PROJECT) {
    onLog?.(`[diff] PERFTOOL_PROJECT 已显式设置=${process.env.PERFTOOL_PROJECT}，跳过自动检测`);
    return;
  }
  try {
    const diffPath = path.join(workDir, 'diff', 'simpleperf-diff.json');
    if (!fs.existsSync(diffPath)) return;
    const diff = JSON.parse(fs.readFileSync(diffPath, 'utf8'));
    const libNames: string[] = (diff.libs ?? [])
      .map((l: { lib?: string; name?: string }) => l.lib || l.name || '')
      .filter(Boolean);

    const config = getConfig();
    const projectsDir = path.join(config.skillProjectPath, 'projects');
    if (!fs.existsSync(projectsDir)) return;
    const dirEntries = fs.readdirSync(projectsDir, { withFileTypes: true });

    for (const entry of dirEntries) {
      if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
      const packYaml = path.join(projectsDir, entry.name, 'pack.yaml');
      if (!fs.existsSync(packYaml)) continue;
      // Cheap parse: scan the lines under selfDeveloperSoNames: for `- foo`.
      const text = fs.readFileSync(packYaml, 'utf8');
      const markers = extractSelfDevSoNames(text);
      if (markers.length === 0) continue;
      const hit = markers.some(m => libNames.some(lib => lib.includes(m)));
      if (hit) {
        process.env.PERFTOOL_PROJECT = entry.name;
        onLog?.(`[diff] 自动检测项目包: ${entry.name}（命中 ${markers.find(m => libNames.some(l => l.includes(m)))}）`);
        return;
      }
    }
    onLog?.('[diff] 未匹配项目包，回退 _generic');
  } catch (err) {
    onLog?.(`[diff] 项目包检测失败: ${(err as Error).message}`);
  }
}

function extractSelfDevSoNames(yamlText: string): string[] {
  const out: string[] = [];
  const lines = yamlText.split(/\r?\n/);
  let inBlock = false;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (/^\s*selfDeveloperSoNames\s*:/.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      const m = /^\s+-\s+(\S+)/.exec(line);
      if (m) {
        out.push(m[1].replace(/['"]/g, ''));
        continue;
      }
      // End of block when we hit a non-list non-indented line.
      if (line.trim() && !/^\s+-/.test(line) && !/^\s+#/.test(line)) {
        inBlock = false;
      }
    }
  }
  return out;
}

function goldenReportPath(projectRoot: string): string {
  return path.join(projectRoot, 'docs', 'report', 'performance-report_simpleperf_ULTIMATE_v4.md');
}

function reportHeadline(markdown: string): string {
  const line = markdown.split('\n').find(l => l.startsWith('#') || l.startsWith('## §0'));
  if (!line) return 'simpleperf v4 差分报告';
  return line.replace(/^#+\s*/, '').trim().slice(0, 120);
}

function subjectiveFpsLabel(meta?: IngestMeta): string | undefined {
  if (!meta?.targetFps) return undefined;
  return `~${meta.targetFps} fps`;
}

async function runPostProviderPipeline(workDir: string, onLog?: (line: string) => void): Promise<void> {
  onLog?.('[diff] build_simpleperf_diff_summary…');
  await runProjectPython('scripts/build_simpleperf_diff_summary.py', [workDir], onLog, 120_000);
  onLog?.('[diff] validate_v4_report…');
  await runProjectPython('scripts/validate_v4_report.py', [workDir], onLog, 120_000);
  const providerReport = path.join(workDir, 'report', 'performance-report_simpleperf_v4.md');
  onLog?.('[diff] compare_v4_report_quality (Provider)…');
  await runProjectPython(
    'scripts/compare_v4_report_quality.py',
    [providerReport, '--min-length-ratio=0.82'],
    onLog,
    60_000,
  );
}

async function runQualityGate(reportPath: string, minRatio: number, onLog?: (line: string) => void): Promise<boolean> {
  try {
    await runProjectPython(
      'scripts/compare_v4_report_quality.py',
      [reportPath, `--min-length-ratio=${minRatio}`],
      onLog,
      60_000,
    );
    return true;
  } catch (e: any) {
    onLog?.(`[quality] FAIL: ${e.message || e}`);
    return false;
  }
}

function buildDiffEnrichPrompt(workDir: string): string {
  const config = getConfig();
  const skillDir = path.join(config.skillProjectPath, '.claude', 'skills', 'simpleperf-diff-analysis').replace(/\\/g, '/');
  const providerReport = path.join(workDir, 'report', 'performance-report_simpleperf_v4.md').replace(/\\/g, '/');
  const aiReport = path.join(workDir, 'report', 'performance-report_simpleperf_AI_v4.md').replace(/\\/g, '/');
  const summary = path.join(workDir, 'simpleperf-diff-summary.json').replace(/\\/g, '/');
  const diffJson = path.join(workDir, 'diff', 'simpleperf-diff.json').replace(/\\/g, '/');
  const golden = goldenReportPath(config.skillProjectPath).replace(/\\/g, '/');
  const knowledge = path.join(config.skillProjectPath, 'docs', 'aoe-cpu-analysis-knowledge.md').replace(/\\/g, '/');
  const finalPath = path.join(workDir, 'performance-report.md').replace(/\\/g, '/');
  return [
    'You are a Unity Android CPU performance analyst. HYBRID enrich mode:',
    'Provider已经渲染好骨架（数据/表/树/Mermaid 100% 准确，禁止改）；你只补叙事段落让报告达到金标准厚度。',
    '',
    `[SKILL] ${skillDir}/SKILL.md`,
    `[KNOWLEDGE] ${knowledge}`,
    `[GOLD REFERENCE] ${golden}`,
    '',
    '## Inputs (READ FIRST in order)',
    `1. Provider skeleton (the report you'll edit): ${aiReport}`,
    `2. Structured diff JSON (numbers source of truth): ${diffJson}`,
    `3. Summary JSON: ${summary}`,
    '4. Knowledge base for business semantics & optimization recipes',
    '5. Gold reference for narrative tone/depth — DO NOT copy content; emulate style.',
    '',
    '## Hard Rules',
    '- 禁改：所有表格、Mermaid 块、调用树（```...```）、章节标题、§0.2 红线告警卡片、§3.x 表、§4.1/§4.2 Top-N 表、§5.1/§5.3 表、§7.1/§7.3 表、§10.x 反查表',
    '- 禁造数字：所有数值必须来自 diff JSON / Provider 报告',
    '- 禁动 .provider/ 目录',
    '- Mermaid 行 (xychart-beta...) 必须保留',
    '',
    '## Tasks (enrich these narrative sections)',
    '### §0 结论先行',
    '- 在表格之外加 1 段 80-120 字的"普通话总览"（综合 systemPressure + 红线 probe + Top-N #1-#3 业务模块）',
    '- 在已有"按 ROI 排序的优化方向"4 条之后，补每条 1-2 句话的具体动作建议（基于知识库相关章节）',
    '',
    '### §4.3 Wwise / §4.4 MeshUI / §4.5 行军线 / §4.6 ECS Burst',
    '- 每节补"业务含义"段落（base→cur 数字变化的业务化解读，60-120 字）',
    '- 每节补"调用入口"段落（基于已有调用树关键节点串成 1 句话）',
    '- 每节补"优化方向"3-5 条要点（参考知识库对应章节，针对该模块当次实测的具体建议）',
    '',
    '### §6.2 RHI 线程下钻',
    '- 在调用树代码块之后加"关键变化"段落，针对 ConstantBuffersGLES.UpdateBuffers / DrawBuffers / WaitForJobGroupID 各列 1 条 base→cur 数字与业务解读',
    '',
    '### §9 Lua GC 工作线程',
    '- 补"业务解读"段落：当次 absDelta 含义；为何 Lua GC 通常 simpleperf 看不到（线程同名陷阱）',
    '- 补"建议"1-2 条（参考知识库 §6.10）',
    '',
    '## Output',
    `1. Overwrite: ${aiReport}`,
    `2. Mirror to: ${finalPath}`,
    '3. Print final line: <<ENRICH_DONE lines=N bytes=M>>',
    '',
    '## 品控自检',
    '- 完成后用 `wc -l` 检查 ${aiReport}；目标行数 ≥ 645 行（金标 663 × 0.97）',
    '- 若 §4.3-§4.6 任一节字数 < 金标的 70%，再加深一遍',
  ].join('\n');
}

async function runCliDiffEnrich(
  workDir: string,
  provider: CliProvider,
  onLog?: (line: string) => void,
): Promise<string | null> {
  const dest = path.join(workDir, 'performance-report.md');
  const aiReport = path.join(workDir, 'report', 'performance-report_simpleperf_AI_v4.md');
  const providerReport = path.join(workDir, 'report', 'performance-report_simpleperf_v4.md');

  if (provider === 'mock') {
    onLog?.('[diff] Mock: 跳过 AI 润色，使用 Provider 报告');
    return null;
  }

  const cfg = getConfig();
  const providerCfg = CLI_PROVIDERS[provider] ?? CLI_PROVIDERS.codebuddy;
  const { command, resolved } = resolveCliExecutable(provider, cfg.cliPaths?.[provider]);
  if (!resolved) throw new Error(cliUnavailableHint(provider));

  const prompt = buildDiffEnrichPrompt(workDir);
  fs.writeFileSync(path.join(workDir, 'diff-cli-prompt.txt'), prompt, 'utf-8');
  const args = providerCfg.buildArgs(prompt);
  const logs: string[] = [];
  onLog?.(`[diff] ${providerCfg.label} CLI 润色…`);

  await new Promise<void>((resolve, reject) => {
    const child: ChildProcess = spawnCliProcess(command, args, {
      cwd: cfg.skillProjectPath,
      env: process.env,
      windowsHide: true,
      stdio: 'pipe',
    });
    let jsonBuffer = '';
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      fs.writeFileSync(path.join(workDir, 'diff-cli.log'), logs.join('\n'), 'utf-8');
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
        logs.push(trimmed.slice(0, 600));
        onLog?.(`[cli] ${trimmed.slice(0, 400)}`);
      }
    });
    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        logs.push(`[stderr] ${text}`);
        onLog?.(`[stderr] ${text.slice(0, 400)}`);
      }
    });
    child.on('error', err => finish(err));
    child.on('close', code => {
      if (code !== 0) {
        finish(new Error(`CLI 退出码: ${code}`));
        return;
      }
      finish();
    });
    setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        finish(new Error('simpleperf diff AI 润色超时'));
      }
    }, 12 * 60 * 1000);
  });

  if (fs.existsSync(aiReport)) return aiReport;
  if (fs.existsSync(dest)) return dest;
  return null;
}

async function finalizeDeliverable(
  workDir: string,
  providerReport: string,
  cliProvider: CliProvider,
  skipCliBoost: boolean,
  onLog?: (line: string) => void,
): Promise<{ markdown: string; usedAi: boolean }> {
  const dest = path.join(workDir, 'performance-report.md');
  const enrichedReport = path.join(workDir, 'report', 'performance-report_simpleperf_AI_v4.md');

  // Detect the project pack from the diff JSON's libs (matches the rule
  // used by enrich_v4_report.py auto-detect). Setting PERFTOOL_PROJECT
  // makes the Python pipeline pick the right yaml pack instead of falling
  // back to _generic.
  detectAndSetProjectPack(workDir, onLog);

  onLog?.('[diff] enrich_v4_report（叙事润色）…');
  await runProjectPython('scripts/enrich_v4_report.py', [workDir], onLog, 120_000);
  onLog?.('[diff] validate_v4_report（润色后）…');
  await runProjectPython('scripts/validate_v4_report.py', [workDir], onLog, 120_000);

  let deliverPath = enrichedReport;
  let usedAi = true;

  if (await runQualityGate(enrichedReport, 0.95, onLog)) {
    onLog?.('[diff] 润色报告达到金标准厚度 (≥0.95×)');
  } else if (await runQualityGate(enrichedReport, 0.92, onLog)) {
    onLog?.('[diff] 润色报告达到交付厚度 (≥0.92× 金标准)');
  } else if (await runQualityGate(enrichedReport, 0.82, onLog)) {
    onLog?.('[diff] 润色报告通过基础质量门');
  } else {
    onLog?.('[diff] 润色报告未过质量门，回退 Provider');
    deliverPath = providerReport;
    usedAi = false;
  }

  if (
    !skipCliBoost
    && cliProvider !== 'mock'
    && isCliAvailable(cliProvider, getConfig().cliPaths?.[cliProvider])
  ) {
    try {
      const cliPath = await runCliDiffEnrich(workDir, cliProvider, onLog);
      if (cliPath && await runQualityGate(cliPath, 0.95, onLog)) {
        deliverPath = cliPath;
        usedAi = true;
        onLog?.('[diff] CLI 润色超越金标准质量门');
      } else if (cliPath && await runQualityGate(cliPath, 0.82, onLog)) {
        const cliMd = fs.readFileSync(cliPath, 'utf-8');
        const curMd = fs.readFileSync(deliverPath, 'utf-8');
        if (cliMd.split('\n').length > curMd.split('\n').length) {
          deliverPath = cliPath;
          usedAi = true;
          onLog?.('[diff] CLI 润色更厚，采用 CLI 版本');
        }
      }
    } catch (e: any) {
      onLog?.(`[diff] CLI 润色跳过: ${e.message || e}`);
    }
  }

  if (!fs.existsSync(deliverPath)) {
    if (!fs.existsSync(providerReport)) {
      throw new Error(`报告不存在: ${deliverPath}`);
    }
    deliverPath = providerReport;
    usedAi = false;
  }

  const markdown = fs.readFileSync(deliverPath, 'utf-8');
  fs.writeFileSync(dest, markdown, 'utf-8');
  fs.writeFileSync(
    path.join(workDir, 'diff-report-quality.json'),
    JSON.stringify({ usedAi, deliverPath, providerReport, enrichedReport }, null, 2),
    'utf-8',
  );
  return { markdown, usedAi };
}

export async function buildSimpleperfDiffReport(
  input: SimpleperfDiffInput,
  opts: SimpleperfDiffOptions = {},
): Promise<SimpleperfDiffResult> {
  const config = getConfig();
  const diffId = opts.meta?.runId || `spdiff_${Date.now()}_${uuid().slice(0, 8)}`;
  const outputDir = path.join(config.dataDir, 'results', diffId);
  fs.mkdirSync(outputDir, { recursive: true });

  const meta: IngestMeta & { binaryCachePath?: string; sceneBase?: string; sceneCur?: string; subjectiveFps?: string } = {
    ...opts.meta,
    runId: diffId,
    label: opts.meta?.label ?? diffId,
    sceneBase: input.sceneBase ?? opts.sceneBase ?? 'base',
    sceneCur: input.sceneCur ?? opts.sceneCur ?? opts.meta?.scene ?? 'cur',
    subjectiveFps: subjectiveFpsLabel(opts.meta),
  };
  const bcache = input.binaryCachePath ?? opts.binaryCachePath;

  opts.onLog?.('[diff] Provider build_simpleperf_profile (base+cur)…');
  const built = await buildSimpleperfDiffProfile(
    input.basePerfPath,
    input.curPerfPath,
    {
      ...meta,
      binaryCachePath: bcache,
      sceneBase: meta.sceneBase,
      sceneCur: meta.sceneCur,
      subjectiveFps: meta.subjectiveFps,
    },
    outputDir,
    opts.onLog,
  );

  await runPostProviderPipeline(built.workDir, opts.onLog);

  const cliProvider = opts.cliProvider ?? defaultCliProvider(config.cliPaths);
  const { markdown, usedAi } = await finalizeDeliverable(
    built.workDir,
    built.reportPath,
    cliProvider,
    Boolean(opts.skipAiEnrich),
    opts.onLog,
  );

  const runId = `${diffId}_cur`;
  opts.onLog?.('[diff] 入库 cur profile…');
  await ingestProfile(built.profile, { ...meta, runId, label: meta.sceneCur });

  const exported = saveReportMarkdown('p-web-simpleperf-diff', `performance-report_${sanitizeId(diffId)}`, markdown);
  saveAnalysisWithReport(
    {
      id: `analysis_${diffId}_simpleperf_diff`,
      mode: 'compare',
      runIds: [runId],
      status: 'completed',
      skill: 'simpleperf-diff-analysis',
    },
    { headline: reportHeadline(markdown), markdown, insights: [] },
    { analysisId: `analysis_${diffId}_simpleperf_diff`, skill: 'simpleperf-diff-analysis' },
  );

  if (built.diffPath && fs.existsSync(built.diffPath)) {
    fs.copyFileSync(built.diffPath, path.join(outputDir, 'simpleperf-diff.json'));
  }

  return {
    diffId,
    runId,
    reportPath: exported,
    outputDir: built.workDir,
    markdown,
    usedAi,
  };
}

/** 客户端本地已分析：直接上传 markdown（+ 可选 diff JSON） */
export async function ingestSimpleperfDiffBundle(
  bundle: SimpleperfDiffBundleInput,
  opts: SimpleperfDiffOptions = {},
): Promise<SimpleperfDiffResult> {
  const config = getConfig();
  const diffId = opts.meta?.runId || `spdiff_bundle_${Date.now()}_${uuid().slice(0, 8)}`;
  const outputDir = path.join(config.dataDir, 'results', diffId);
  fs.mkdirSync(path.join(outputDir, 'report'), { recursive: true });

  const providerPath = path.join(outputDir, 'report', 'performance-report_simpleperf_v4.md');
  const src = bundle.providerReportPath && fs.existsSync(bundle.providerReportPath)
    ? bundle.providerReportPath
    : null;
  if (src) {
    fs.copyFileSync(src, providerPath);
  } else {
    fs.writeFileSync(providerPath, bundle.reportMarkdown, 'utf-8');
  }

  if (bundle.diffJsonPath && fs.existsSync(bundle.diffJsonPath)) {
    fs.mkdirSync(path.join(outputDir, 'diff'), { recursive: true });
    fs.copyFileSync(bundle.diffJsonPath, path.join(outputDir, 'diff', 'simpleperf-diff.json'));
  }

  opts.onLog?.('[diff] 校验上传报告质量…');
  const gateOk = await runQualityGate(providerPath, 0.78, opts.onLog);
  if (!gateOk) {
    opts.onLog?.('[diff] 警告: 上传报告未完全通过 v4 质量门，仍将展示上传内容');
  }

  const markdown = fs.readFileSync(providerPath, 'utf-8');
  fs.writeFileSync(path.join(outputDir, 'performance-report.md'), markdown, 'utf-8');

  const runId = `${diffId}_cur`;
  const exported = saveReportMarkdown('p-web-simpleperf-diff', `performance-report_${sanitizeId(diffId)}`, markdown);
  saveAnalysisWithReport(
    {
      id: `analysis_${diffId}_simpleperf_diff`,
      mode: 'compare',
      runIds: [runId],
      status: 'completed',
      skill: 'simpleperf-diff-analysis',
    },
    { headline: reportHeadline(markdown), markdown, insights: [] },
    { analysisId: `analysis_${diffId}_simpleperf_diff`, skill: 'simpleperf-diff-analysis' },
  );

  return {
    diffId,
    runId,
    reportPath: exported,
    outputDir,
    markdown,
    usedAi: false,
  };
}
