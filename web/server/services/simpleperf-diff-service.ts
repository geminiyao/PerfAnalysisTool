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
    // Prompt is now piped via stdin (see runCliDiffEnrich) — `-p` without
    // arg tells codebuddy to read from stdin. Windows .cmd wrappers can't
    // handle multi-line prompts as positional args (newlines truncate the
    // command line); stdin avoids that trap.
    buildArgs: (_prompt: string) => [
      '-p',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '-y',
      '--dangerously-skip-permissions',
      '--allowedTools', 'Bash,Read,Write,Glob,Grep,Edit',
    ],
  },
  claude: {
    label: 'Claude Code',
    buildArgs: (_prompt: string) => [
      '-p',
      '--output-format', 'stream-json',
      '--allowedTools', 'Bash,Read,Write,Glob,Grep,Edit',
    ],
  },
  mock: { label: 'Mock', buildArgs: () => [] },
};

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80);
}

/**
 * Scan for any project pack's identify.selfDeveloperSoNames and set
 * PERFTOOL_PROJECT env var so the Python pipeline activates the matching
 * pack. Mirrors detect_project_from_libs() in
 * simpleperf_analyzer/project_pack.py.
 *
 * Two-phase detection:
 *   1. Pre-Provider: scan binary_cache .so files (so the Provider build
 *      itself uses the right pack — modules / probes / annotations).
 *   2. Post-Provider: scan diff JSON libs (catches projects whose .so
 *      isn't in binary_cache; idempotent if step 1 already matched).
 */
function detectAndSetProjectPackFromBcache(binaryCachePath: string | undefined, onLog?: (line: string) => void): void {
  onLog?.(`[diff] [detect-bcache] 进入函数 bcache=${binaryCachePath}`);
  if (process.env.PERFTOOL_PROJECT) {
    onLog?.(`[diff] PERFTOOL_PROJECT 已显式设置=${process.env.PERFTOOL_PROJECT}，跳过 binary_cache 检测`);
    return;
  }
  if (!binaryCachePath || !fs.existsSync(binaryCachePath)) {
    onLog?.(`[diff] [detect-bcache] bcache 不存在或为空，跳过`);
    return;
  }
  const config = getConfig();
  const projectsDir = path.join(config.skillProjectPath, 'projects');
  onLog?.(`[diff] [detect-bcache] projectsDir=${projectsDir}`);
  if (!fs.existsSync(projectsDir)) {
    onLog?.(`[diff] [detect-bcache] projectsDir 不存在`);
    return;
  }

  // Walk binary_cache and collect:
  //   - .so basenames (for selfDeveloperSoNames matching)
  //   - directory names (for androidPackages matching, e.g. "com.tencent.aoeyz" appears as a path segment)
  const soNames: string[] = [];
  const dirNames: string[] = [];
  const walk = (dir: string, depth = 0) => {
    if (depth > 12) return;
    let entries: fs.Dirent[] = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        dirNames.push(e.name);
        walk(full, depth + 1);
      } else if (e.name.endsWith('.so')) {
        soNames.push(e.name);
      }
    }
  };
  walk(binaryCachePath);

  const dirEntries = fs.readdirSync(projectsDir, { withFileTypes: true });
  for (const entry of dirEntries) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || entry.name.startsWith('.')) continue;
    const packYaml = path.join(projectsDir, entry.name, 'pack.yaml');
    if (!fs.existsSync(packYaml)) continue;
    const text = fs.readFileSync(packYaml, 'utf8');
    const soMarkers = extractListField(text, 'selfDeveloperSoNames');
    const pkgMarkers = extractListField(text, 'androidPackages');

    let hit = '';
    for (const m of soMarkers) {
      if (soNames.some(so => so.includes(m))) { hit = `so=${m}`; break; }
    }
    if (!hit) {
      for (const m of pkgMarkers) {
        if (dirNames.some(d => d.includes(m))) { hit = `pkg=${m}`; break; }
      }
    }
    if (hit) {
      process.env.PERFTOOL_PROJECT = entry.name;
      onLog?.(`[diff] 自动检测项目包 (binary_cache): ${entry.name}（命中 ${hit}）`);
      return;
    }
  }
  onLog?.('[diff] binary_cache 未匹配项目包，等 diff JSON 检测');
}

function detectAndSetProjectPack(workDir: string, onLog?: (line: string) => void): void {
  if (process.env.PERFTOOL_PROJECT) {
    onLog?.(`[diff] PERFTOOL_PROJECT 已设置=${process.env.PERFTOOL_PROJECT}，跳过 diff JSON 检测`);
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
      const text = fs.readFileSync(packYaml, 'utf8');
      const markers = extractSelfDevSoNames(text);
      if (markers.length === 0) continue;
      const hit = markers.some(m => libNames.some(lib => lib.includes(m)));
      if (hit) {
        process.env.PERFTOOL_PROJECT = entry.name;
        onLog?.(`[diff] 自动检测项目包 (diff libs): ${entry.name}（命中 ${markers.find(m => libNames.some(l => l.includes(m)))}）`);
        return;
      }
    }
    onLog?.('[diff] 未匹配项目包，回退 _generic');
  } catch (err) {
    onLog?.(`[diff] 项目包检测失败: ${(err as Error).message}`);
  }
}

function extractSelfDevSoNames(yamlText: string): string[] {
  return extractListField(yamlText, 'selfDeveloperSoNames');
}

function extractListField(yamlText: string, key: string): string[] {
  const out: string[] = [];
  const lines = yamlText.split(/\r?\n/);
  let inBlock = false;
  let baseIndent = -1;
  const keyRe = new RegExp(`^(\\s*)${key}\\s*:\\s*$`);
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    const m = keyRe.exec(line);
    if (m) {
      inBlock = true;
      baseIndent = m[1].length;
      continue;
    }
    if (inBlock) {
      const itemRe = /^(\s+)-\s+(\S+)/.exec(line);
      if (itemRe && itemRe[1].length > baseIndent) {
        out.push(itemRe[2].replace(/['"]/g, ''));
        continue;
      }
      if (line.trim() === '' || /^\s*#/.test(line)) continue;
      // Non-empty non-list line at or before key's indent ends the block.
      const leading = line.match(/^\s*/)?.[0].length ?? 0;
      if (leading <= baseIndent) {
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
  const aiReport = path.join(workDir, 'report', 'performance-report_simpleperf_AI_v4.md').replace(/\\/g, '/');
  const summary = path.join(workDir, 'simpleperf-diff-summary.json').replace(/\\/g, '/');
  const diffJson = path.join(workDir, 'diff', 'simpleperf-diff.json').replace(/\\/g, '/');
  const knowledge = path.join(config.skillProjectPath, 'docs', 'aoe-cpu-analysis-knowledge.md').replace(/\\/g, '/');
  const golden = goldenReportPath(config.skillProjectPath).replace(/\\/g, '/');
  const finalPath = path.join(workDir, 'performance-report.md').replace(/\\/g, '/');
  const finalInReport = path.join(workDir, 'report', 'performance-report.md').replace(/\\/g, '/');

  // 新格式：占位符填空模式（与 scripts/cli_enrich_v4.py 一致）。Provider 渲染
  // 时已往骨架里塞了 18 个 <!-- LLM_FILL: ... --> 标记；LLM 必须把每一个替换
  // 成对应叙事，并彻底删除 HTML 注释。
  return [
    'TASK (non-interactive, execute immediately, do NOT ask back):',
    'Read the file at the absolute path below and replace every <!-- LLM_FILL... --> placeholder',
    'with project-aware Chinese narrative grounded in the structured diff JSON + knowledge base.',
    'All numbers, tables, mermaid charts, code blocks must be preserved verbatim.',
    '',
    `FILE TO EDIT: ${aiReport}`,
    `ALSO MIRROR FINAL CONTENT TO: ${finalPath}`,
    `ALSO MIRROR TO: ${finalInReport}`,
    '',
    'REFERENCE FILES (read-only, for facts/style):',
    `- Numbers source: ${diffJson}`,
    `- Summary metadata: ${summary}`,
    `- Knowledge base (for business semantics & optimization recipes): ${knowledge}`,
    `- Gold style reference (DO NOT copy verbatim — emulate tone/depth only): ${golden}`,
    `- Skill spec: ${skillDir}/SKILL.md`,
    '',
    '## How placeholders work',
    'Every <!-- LLM_FILL: <instruction> --> in the file marks a slot you must replace.',
    'The instruction tells you what kind of paragraph/list to write.',
    'After replacement, the comment marker should be GONE (HTML comments must not appear in final output).',
    'If a placeholder asks for a list, write proper Markdown bullets (- ...).',
    'If it asks for a paragraph, write 1-3 sentences in Chinese.',
    '',
    '## Hard rules',
    '- 禁改：所有 Markdown 表格、Mermaid 块、调用树代码块（```...```）、章节标题、§0.2 红线告警卡片、§3.x 表、§4.1/§4.2 Top-N 表、§5.1/§5.3 表、§7.1/§7.3 表、§10.x 反查表',
    '- 禁造数字：所有数值必须来自 diff JSON / Provider 报告中已存在的数字。如果你想加新数字，先查 diff JSON 确认。',
    '- 禁动 .provider/ 目录',
    '- 禁用项目特化死字符（项目独有词）：不要写"野外几乎无音效"、"300 队部队"、"行军压测"、"野外远景树木"、"两路汇流"、"群体音效" 等只对当前数据有意义的词；用 meta.sceneCur 实际场景描述代替',
    '- 不要保留 <!-- LLM_FILL: ... --> 占位符在最终输出中（必须替换为真正叙事）',
    '- 不要在已经是 LLM 填好的段落（**业务含义**：等）旁边再追加同名段落（避免出现 2 份业务含义）',
    '',
    '## Where placeholders live (high-level guide)',
    '- §0 结论先行：FPS 注解 + 普通话总览 + 4 项 ROI 优化方向（每条 80-150 字带知识库引用）',
    '- §4.3 / §4.4 / §4.5 / §4.6：每节 3-4 段（业务含义 / 调用入口 / 关联开销 / 优化方向）',
    '- §5.3 注脚：解释 wrapper 与真热点的下钻关系',
    '- §6.2 RHI 树之后：关键变化解读',
    '- §9 Lua GC：变化解读 + 建议',
    '- §10.1-§10.4：每节结论（基于反查表内的真实业务模块）',
    '',
    '## Output',
    `1. Overwrite: ${aiReport}`,
    `2. Mirror to: ${finalPath}`,
    `3. Mirror to: ${finalInReport}`,
    '4. Final line: <<ENRICH_DONE lines=N bytes=M placeholders_filled=K>>',
    '',
    '## Self-check',
    `- After all edits, run: grep -c LLM_FILL ${aiReport} — must return 0`,
    '- File should be >= 645 lines (gold reference is 663 lines)',
    '- Each of §4.3-§4.6 should be >= 18 lines',
    '- 不允许出现两个连续的 **业务含义**: 段落（这是重复 bug 的征兆，必须 De-dup）',
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
    // Write the prompt via stdin (Windows .cmd wrappers truncate multi-line
    // prompts when passed as a positional arg; stdin avoids that bug).
    // This matches scripts/cli_enrich_v4.py.
    try {
      child.stdin?.write(prompt);
      child.stdin?.end();
    } catch (e: any) {
      onLog?.(`[diff] stdin 写入失败: ${e.message || e}`);
    }
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

  // Detect project pack from binary_cache .so names BEFORE Provider runs,
  // so the Provider's business module discovery / probes / annotations
  // pull from the correct yaml pack instead of falling back to _generic.
  detectAndSetProjectPackFromBcache(bcache, opts.onLog);

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
