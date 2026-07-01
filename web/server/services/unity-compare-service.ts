// unity-compare-service.ts — Unity Profiler 双版本对比 Service（hybrid v1）
//
// 与 simpleperf-diff-service.ts 同构：
//   1) 调用 unity-diff-builder.ts (Provider 端) 生成 unity-diff-summary.json + 骨架 markdown
//   2) AI-authored 路径：spawnCli → 让 AI 在骨架基础上润色业务叙事（数字保护）
//   3) 自评门：grep 必备章节 + 行数比例 → PASS=AI 版 / FAIL=骨架版
//   4) 入库 analyses + analysis_reports（mode='compare'）
//
// CLI / Web 共用入口。

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { v4 as uuid } from 'uuid';
import { saveAnalysisWithReport } from './analysis-store.js';
import { saveReportMarkdown } from './report-export.js';
import { getConfig } from '../utils/config.js';
import { defaultCliProvider, isCliAvailable, spawnCliProcess, resolveCliExecutable } from '../utils/cli-resolver.js';
import { runUnityPreprocessScript } from './unity-preprocess-runner.js';
import type { CliProvider } from '../../shared/types.js';

export interface UnityCompareInput {
  basePdataPath: string;
  curPdataPath: string;
  baseLabel?: string;
  curLabel?: string;
  device?: string;
  scene?: string;
  targetFps?: number;
}

export interface UnityCompareOptions {
  cliProvider?: CliProvider;
  skipAiEnrich?: boolean;
  onLog?: (line: string) => void;
}

export interface UnityCompareResult {
  diffId: string;
  outputDir: string;
  reportPath: string;
  summaryPath: string;
  skeletonPath: string;
  enrichedPath: string;
  markdown: string;
  usedAi: boolean;
  deliverSource: 'ai-authored' | 'enriched' | 'skeleton';
}

interface QualityResult {
  pass: boolean;
  errors: string[];
  warnings: string[];
  lineCount: number;
  sectionCount: number;
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/** 跑 unity-diff-builder.ts 生成 summary + skeleton。 */
async function runDiffBuilder(
  basePreprocessPath: string,
  curPreprocessPath: string,
  outDir: string,
  meta: { baseLabel: string; curLabel: string },
  onLog?: (line: string) => void,
): Promise<{ summaryPath: string; skeletonPath: string }> {
  const config = getConfig();
  const builderPath = path.join(config.skillProjectPath, '.claude/skills/unity-profiler-compare/scripts/unity-diff-builder.ts');
  if (!fs.existsSync(builderPath)) {
    throw new Error(`unity-diff-builder 不存在: ${builderPath}`);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const args = [
    'tsx', builderPath,
    '--base', basePreprocessPath,
    '--cur', curPreprocessPath,
    '--out', outDir,
    '--base-label', meta.baseLabel,
    '--cur-label', meta.curLabel,
  ];
  onLog?.(`[unity-diff] runDiffBuilder: ${args.slice(1).join(' ')}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', args, { cwd: config.skillProjectPath, shell: true, windowsHide: true });
    let stderr = '';
    child.stdout?.on('data', d => onLog?.(`[diff-builder] ${d.toString().trim().slice(0, 400)}`));
    child.stderr?.on('data', d => { stderr += d.toString(); onLog?.(`[diff-builder] ${d.toString().trim().slice(0, 400)}`); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`unity-diff-builder 退出码 ${code}: ${stderr.slice(-1000)}`)));
    setTimeout(() => { child.kill(); reject(new Error('unity-diff-builder 超时 5min')); }, 5 * 60 * 1000);
  });

  const summaryPath = path.join(outDir, 'unity-diff-summary.json');
  const skeletonPath = path.join(outDir, 'performance-report_unity_diff_skeleton.md');
  if (!fs.existsSync(summaryPath)) throw new Error(`unity-diff-summary.json 未产出: ${summaryPath}`);
  if (!fs.existsSync(skeletonPath)) throw new Error(`骨架报告未产出: ${skeletonPath}`);
  return { summaryPath, skeletonPath };
}

/** 启动 AI CLI 在 enriched 基础上润色（spawn claude/codebuddy）。 */
async function runAiEnrichment(
  workDir: string,
  enrichedPath: string,
  cliProvider: CliProvider,
  onLog?: (line: string) => void,
): Promise<string | null> {
  const config = getConfig();
  const { command, resolved } = resolveCliExecutable(cliProvider, config.cliPaths?.[cliProvider]);
  if (!resolved) {
    onLog?.(`[unity-diff] CLI '${cliProvider}' 不可用`);
    return null;
  }

  const skillDir = path.join(config.skillProjectPath, '.claude/skills/unity-profiler-compare').replace(/\\/g, '/');
  const enrichedRel = enrichedPath.replace(/\\/g, '/');
  const summaryRel = path.join(workDir, 'unity-diff-summary.json').replace(/\\/g, '/');
  const aiOutPath = path.join(workDir, 'performance-report_unity_diff_AI_v1.md');

  const prompt = [
    `请使用 ${skillDir} skill 在 **enriched 报告** 上增量加厚 unity diff 叙事（ai-thickened 交付）。`,
    `enriched 报告路径: ${enrichedRel}`,
    `Δ 数字 JSON: ${summaryRel}`,
    `润色规则（必须严格遵守）：`,
    `1. 数字一律来自 Δ JSON / enriched 表格，禁止改任何 ms/帧、Δ%、状态标签、emoji`,
    `2. §3 Top-N 热点表、§3/§4/§5 已有 enrich 要点可扩写但不可删表/删树`,
    `3. mermaid 图、章节顺序、§2 帧级表 / §3 缩进树 不准动`,
    `4. 业务叙事用 ≤2 句话，避免冗长；§8 P 块在 enrich 模板基础上加厚`,
    `5. 输出保存为: ${aiOutPath.replace(/\\/g, '/')}`,
    `6. 不要使用 Agent / 子任务 / conversation summary`,
  ].join(' ');
  fs.writeFileSync(path.join(workDir, 'unity-diff-cli-prompt.txt'), prompt, 'utf-8');

  onLog?.(`[unity-diff] AI 润色 (enriched→ai-thickened): cli=${cliProvider}`);

  const cliArgs = cliProvider === 'claude'
    ? ['-p', '--output-format', 'stream-json', '--allowedTools', 'Bash,Read,Write,Glob,Grep,Edit']
    : ['-p', '--output-format', 'stream-json', '--include-partial-messages', '-y', '--dangerously-skip-permissions', '--allowedTools', 'Bash,Read,Write,Glob,Grep,Edit'];

  await new Promise<void>((resolve, reject) => {
    const child = spawnCliProcess(command, cliArgs, { cwd: config.skillProjectPath, env: process.env });
    const logs: string[] = [];
    try { child.stdin?.write(prompt); child.stdin?.end(); } catch (e: any) { onLog?.(`[unity-diff] stdin 失败: ${e.message}`); }
    child.stdout?.on('data', (d: Buffer) => { const t = d.toString().trim(); if (t) { logs.push(t); onLog?.(`[cli] ${t.slice(0, 300)}`); } });
    child.stderr?.on('data', (d: Buffer) => { const t = d.toString().trim(); if (t) onLog?.(`[stderr] ${t.slice(0, 300)}`); });
    child.on('error', reject);
    child.on('close', code => { fs.writeFileSync(path.join(workDir, 'unity-diff-cli.log'), logs.join('\n'), 'utf-8'); code === 0 ? resolve() : reject(new Error(`CLI exit ${code}`)); });
    setTimeout(() => { if (child.exitCode === null) { child.kill('SIGTERM'); reject(new Error('AI 润色超时')); } }, 12 * 60 * 1000);
  });

  return fs.existsSync(aiOutPath) ? aiOutPath : null;
}

/** 自评门：检查必备章节 + 行数比例 + 数字保护（AI 不准改 §2 表格数字）。 */
function validateUnityDiffQuality(markdown: string, summaryJson: any, opts: { minLineRatio?: number; goldenLines?: number } = {}): QualityResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = markdown.split(/\r?\n/);
  const lineCount = lines.length;
  const sections = lines.filter(l => /^## §[0-9]/.test(l.trim()));
  const sectionCount = sections.length;

  // 1. 必备 9 章节 (§0-§8)
  const requiredSections = ['§0', '§1', '§2', '§3', '§5', '§8'];
  for (const sec of requiredSections) {
    if (!markdown.includes(`## ${sec}`)) errors.push(`缺章节 ${sec}`);
  }

  // 2. 必引证据
  if (!markdown.includes('ms/帧')) errors.push('缺 ms/帧 单位（§3 应有）');
  if (!markdown.match(/[+\-]?\d+\.\d+%/)) errors.push('缺 Δ% 数字');
  if (!markdown.match(/[🔴🟢🆕➖⚪]/u)) errors.push('缺状态 emoji');

  // 3. 数字保护：§2 帧级 mean Δ 必须与 summary 一致
  const meanFromSummary = summaryJson?.frameSummary?.mean?.delta;
  if (typeof meanFromSummary === 'number') {
    const expected = meanFromSummary >= 0 ? `+${meanFromSummary.toFixed(2)}` : meanFromSummary.toFixed(2);
    // 在 §2 表格附近找
    const sec2 = (markdown.match(/## §2[\s\S]*?(?=## §3|$)/) || [''])[0];
    if (!sec2.includes(`${expected}`)) {
      // 容忍小数位差异，再尝试整数对比
      const expectedInt = Math.round(meanFromSummary).toString();
      if (!sec2.includes(expectedInt)) warnings.push(`§2 mean Δ 数字 (${expected}) 在表格中未找到`);
    }
  }

  // 4. 行数门
  const minRatio = opts.minLineRatio ?? 0.78;
  const goldenLines = opts.goldenLines ?? 0;
  if (goldenLines > 0 && lineCount < goldenLines * minRatio) {
    errors.push(`报告厚度不足: ${lineCount} 行 < ${Math.floor(goldenLines * minRatio)} (= ${goldenLines} × ${minRatio})`);
  }

  // 5. ai-thickened 结构检查
  if (!markdown.includes('### Top-N 主线程热点')) warnings.push('§3 缺 Top-N 热点表');
  if (!markdown.includes('GC.Alloc 次数（全 trace）') && !markdown.includes('GC.Alloc 次数 base→cur（全 trace）')) {
    warnings.push('§5 缺 GC.Alloc 全 trace 口径表头');
  }
  const enrichLeft = (markdown.match(/ENRICH_FILL/g) ?? []).length;
  if (enrichLeft > 0) errors.push(`残留 ENRICH_FILL 占位 ${enrichLeft} 处`);

  return { pass: errors.length === 0, errors, warnings, lineCount, sectionCount };
}

/** Unity diff 主入口 */
export async function buildUnityCompareReport(
  input: UnityCompareInput,
  opts: UnityCompareOptions = {},
): Promise<UnityCompareResult> {
  const config = getConfig();
  const diffId = `udiff_${Date.now()}_${uuid().slice(0, 8)}`;
  const outputDir = path.join(config.dataDir, 'results', diffId);
  fs.mkdirSync(outputDir, { recursive: true });

  const targetFps = input.targetFps ?? 60;
  const baseLabel = input.baseLabel ?? path.basename(input.basePdataPath, '.pdata');
  const curLabel = input.curLabel ?? path.basename(input.curPdataPath, '.pdata');

  // Step 1: 各跑一次 preprocess.ts
  const baseDir = path.join(outputDir, 'base');
  const curDir = path.join(outputDir, 'cur');
  fs.mkdirSync(baseDir, { recursive: true });
  fs.mkdirSync(curDir, { recursive: true });

  opts.onLog?.(`[unity-diff] preprocess base: ${input.basePdataPath}`);
  await runUnityPreprocessScript(input.basePdataPath, baseDir, targetFps, opts.onLog);
  opts.onLog?.(`[unity-diff] preprocess cur: ${input.curPdataPath}`);
  await runUnityPreprocessScript(input.curPdataPath, curDir, targetFps, opts.onLog);

  const baseRes = path.join(baseDir, 'preprocess-result.json');
  const curRes = path.join(curDir, 'preprocess-result.json');

  // Step 2: 跑 diff-builder（Provider）
  const { summaryPath, skeletonPath } = await runDiffBuilder(baseRes, curRes, outputDir, { baseLabel, curLabel }, opts.onLog);
  const skeletonMd = fs.readFileSync(skeletonPath, 'utf-8');
  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

  // Step 2.5: 确定性叙事 enrich（必须成功，与 simpleperf enrich_v4 同构）
  const enrichedPath = path.join(outputDir, 'performance-report_unity_diff_enriched.md');
  const enrichScript = path.join(config.skillProjectPath, '.claude/skills/unity-profiler-compare/scripts/unity-diff-enrich.ts');
  await new Promise<void>((resolve, reject) => {
    const child = spawn('npx', ['tsx', enrichScript, '--skeleton', skeletonPath, '--summary', summaryPath, '--out', enrichedPath], {
      cwd: config.skillProjectPath, shell: true, windowsHide: true,
    });
    let stderr = '';
    child.stdout?.on('data', d => opts.onLog?.(`[enrich] ${d.toString().trim().slice(0, 200)}`));
    child.stderr?.on('data', d => { stderr += d.toString(); opts.onLog?.(`[enrich] ${d.toString().trim().slice(0, 200)}`); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`enrich exit ${code}: ${stderr.slice(-500)}`)));
    setTimeout(() => { child.kill(); reject(new Error('enrich 超时 60s')); }, 60_000);
  });
  if (!fs.existsSync(enrichedPath)) {
    throw new Error(`enriched 报告未产出: ${enrichedPath}`);
  }
  const enrichedMd = fs.readFileSync(enrichedPath, 'utf-8');
  const enrichLeft = (enrichedMd.match(/ENRICH_FILL/g) ?? []).length;
  if (enrichLeft > 0) {
    throw new Error(`enrich 未完成：残留 ENRICH_FILL ${enrichLeft} 处`);
  }
  opts.onLog?.(`[unity-diff] enrich ✅ ${enrichedMd.split('\n').length} 行`);

  // Step 3: AI 加厚（正式验收默认必须 ai-authored + quality PASS）
  const cliProvider = opts.cliProvider ?? defaultCliProvider(config.cliPaths);
  let usedAi = false;
  let deliverMd = enrichedMd;
  let deliverSource: UnityCompareResult['deliverSource'] = 'enriched';

  if (!opts.skipAiEnrich) {
    if (cliProvider === 'mock' || !isCliAvailable(cliProvider, config.cliPaths?.[cliProvider])) {
      throw new Error(`ai-thickened 验收需要 CLI (${cliProvider})，当前不可用`);
    }
    let aiPath: string | null = null;
    try {
      aiPath = await runAiEnrichment(outputDir, enrichedPath, cliProvider, opts.onLog);
    } catch (e: any) {
      throw new Error(`AI 润色失败: ${e.message}`);
    }
    if (!aiPath || !fs.existsSync(aiPath)) {
      throw new Error('AI 润色未产出 performance-report_unity_diff_AI_v1.md');
    }
    const aiMd = fs.readFileSync(aiPath, 'utf-8');
    const goldenPath = path.join(config.skillProjectPath, 'docs/report/performance-report_unity_diff_GOLDEN.md');
    const goldenLines = fs.existsSync(goldenPath) ? fs.readFileSync(goldenPath, 'utf-8').split('\n').length : 0;
    const quality = validateUnityDiffQuality(aiMd, summary, { goldenLines });
    if (!quality.pass) {
      throw new Error(`validateUnityDiffQuality FAIL: ${quality.errors.join('; ')}`);
    }
    deliverMd = aiMd;
    deliverSource = 'ai-authored';
    usedAi = true;
    opts.onLog?.(`[unity-diff] ai-thickened ✅ 质量门 PASS (${quality.lineCount} 行 / ${quality.sectionCount} 章)`);
    if (quality.warnings.length) {
      opts.onLog?.(`[unity-diff] 质量门 warnings: ${quality.warnings.join('; ')}`);
    }
  } else {
    opts.onLog?.('[unity-diff] skipAiEnrich=true，交付 enriched 层（非正式验收）');
  }

  // Step 4: 写 final report + 入库
  const finalPath = path.join(outputDir, 'performance-report.md');
  fs.writeFileSync(finalPath, deliverMd, 'utf-8');
  fs.writeFileSync(
    path.join(outputDir, 'unity-diff-quality.json'),
    JSON.stringify({ usedAi, deliverSource, summaryPath, skeletonPath }, null, 2),
    'utf-8',
  );

  const exported = saveReportMarkdown('p-web-unity-diff', `performance-report_${sanitizeId(diffId)}`, deliverMd);

  try {
    saveAnalysisWithReport(
      {
        id: `analysis_${diffId}_unity_compare`,
        mode: 'compare',
        runIds: [],
        status: 'completed',
        skill: 'unity-profiler-compare',
      },
      {
        headline: extractHeadline(deliverMd),
        markdown: deliverMd,
        insights: [],
      },
      { analysisId: `analysis_${diffId}_unity_compare`, skill: 'unity-profiler-compare' },
    );
  } catch (e: any) {
    opts.onLog?.(`[unity-diff] 入库失败 (报告已导出): ${e.message}`);
  }

  opts.onLog?.(`[unity-diff] 完成: ${exported} (${deliverSource})`);
  return {
    diffId,
    outputDir,
    reportPath: exported,
    summaryPath,
    skeletonPath,
    enrichedPath,
    markdown: deliverMd,
    usedAi,
    deliverSource,
  };
}

function extractHeadline(markdown: string): string {
  const m = markdown.match(/## §0[\s\S]*?\n\n\*\*([^*]+)\*\*/);
  if (m) return m[1].trim().slice(0, 200);
  // fallback: 第一行 # 标题
  const t = markdown.match(/^#\s+(.+)/);
  return t ? t[1].trim().slice(0, 200) : 'Unity Profiler 双版本对比';
}
