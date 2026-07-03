// 跨源分析生成服务 — 供 CLI 与 Web API 共用。
//
// 双路径：
//   1) AI-authored（Phase B 接通）：spawnCli claude/codebuddy 让 AI 在 digest + skeleton 基础上写完整报告
//   2) Fallback：buildCrossSourceMarkdown 程序拼装（密度低但永远能交付）
//
// 自评门：grep 必备章节 (§0-§9) + 行数比例 → PASS=AI 版 / FAIL=fallback
//
// 注：自评失败的检测是宽松的——只在严重缺失时回退，否则保留 AI 输出（毕竟 fallback 已经达 ULTIMATE 60% 密度）。

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { buildCrossSourceDigest } from './cross-source-digest.js';
import { generateCrossSourceInsights } from './cross-source-insights.js';
import { buildCrossSourceMarkdown } from './cross-source-report-builder.js';
import { saveCrossDigestJson, saveCrossReportMarkdown } from './report-export.js';
import { saveAnalysisWithReport, getAnalysisReportByRunId } from './analysis-store.js';
import { getRun } from './run-store.js';
import { getConfig } from '../utils/config.js';
import { defaultCliProvider, isCliAvailable, spawnCliProcess, resolveCliExecutable } from '../utils/cli-resolver.js';
import type { CliProvider } from '../../shared/types.js';

export interface GenerateCrossSourceOptions {
  analysisId?: string;
  /** AI 已经在外部写完 markdown 的话，直接读取（最快路径）*/
  markdownPath?: string;
  digestOut?: string;
  /** Phase B: 让 service 自己 spawnCli 调起 AI（默认开）*/
  cliProvider?: CliProvider;
  /** 显式禁用 AI（CI/test 用）*/
  skipAiEnrich?: boolean;
  onLog?: (line: string) => void;
}

interface QualityResult {
  pass: boolean;
  errors: string[];
  warnings: string[];
  lineCount: number;
  sectionCount: number;
}

/** 自评门：cross-source 报告章节 + 必引证据。 */
function validateCrossSourceQuality(markdown: string, opts: { goldenLines?: number; minRatio?: number } = {}): QualityResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const lines = markdown.split(/\r?\n/);
  const lineCount = lines.length;
  const sections = lines.filter(l => /^##\s+§/.test(l.trim()));
  const sectionCount = sections.length;

  // 必备章节 §0-§9（允许 §8 拆 §8.1/§8.2/§8.3）
  const required = ['§0', '§1', '§2', '§3', '§4', '§7', '§9'];
  for (const sec of required) {
    if (!markdown.includes(`## ${sec}`) && !markdown.includes(`## ${sec}.`)) {
      errors.push(`缺章节 ${sec}`);
    }
  }

  // 必引证据
  if (!markdown.match(/Running\s*\d+/) && !markdown.match(/Running.*\d+%/)) errors.push('缺主线程 Running% 数据');
  if (!markdown.match(/[├└]─/)) errors.push('缺缩进树形态（§3 应有）');
  if (!markdown.match(/playerloop|choreographer/i)) warnings.push('未提到帧口径警告');

  if (opts.goldenLines && opts.goldenLines > 0) {
    const minLines = Math.floor(opts.goldenLines * (opts.minRatio ?? 0.5));
    if (lineCount < minLines) errors.push(`报告厚度不足: ${lineCount} 行 < ${minLines}`);
  }

  return { pass: errors.length === 0, errors, warnings, lineCount, sectionCount };
}

/** 启动 AI CLI 在 digest + skeleton 基础上写报告。失败返回 null。 */
async function runAiEnrichment(
  workDir: string,
  digestPath: string,
  skeletonPath: string,
  cliProvider: CliProvider,
  onLog?: (line: string) => void,
): Promise<string | null> {
  const config = getConfig();
  const { command, resolved } = resolveCliExecutable(cliProvider, config.cliPaths?.[cliProvider]);
  if (!resolved) {
    onLog?.(`[cross-source] CLI '${cliProvider}' 不可用，跳过 AI 润色`);
    return null;
  }

  const skillDir = path.join(config.skillProjectPath, '.claude/skills/cross-source-analysis').replace(/\\/g, '/');
  const goldenPath = path.join(config.skillProjectPath, 'docs/report/performance-report_perfetto_ULTIMATE_v5.3.md').replace(/\\/g, '/');
  const aiOutPath = path.join(workDir, 'cross-source-report-AI.md');

  const prompt = [
    `请使用 ${skillDir} skill 撰写三源综合性能分析报告。`,
    `输入数据:`,
    `  - digest JSON: ${digestPath.replace(/\\/g, '/')}`,
    `  - 程序拼装骨架（含全部数据但叙事浅）: ${skeletonPath.replace(/\\/g, '/')}`,
    `  - 金标准（perfetto ULTIMATE v5.3，参考密度与口径）: ${goldenPath}`,
    `撰写规则（严格遵守）：`,
    `1. 数字一律来自 digest JSON / 骨架报告，禁止编造`,
    `2. 章节 §0–§9 完整覆盖（§8 可拆 §8.1/§8.2/§8.3）`,
    `3. 业务模块名直接出现在结论里（不写"Update.ScriptRunBehaviourUpdate"这种泛阶段，用 alignedHotNodes 里的具体模块名）`,
    `4. 跨源印证 ≥2 源同向才能下高置信结论；冲突显式标 ⚠️`,
    `5. §3 主轴用 unityCallTreeComposite 缩进树（含 ms/帧 + gcAllocCount）`,
    `6. §6 simpleperf 独家：so 分层 / threadCategory / nativeReverseCallStack 全用上`,
    `7. §7 perfetto 独家：offCpuAttribution / interThreadWait / throttlingEvidence 全用上`,
    `8. 缺数据标 "数据缺失" 或 "[推断]"，不臆断`,
    `9. 输出保存到: ${aiOutPath.replace(/\\/g, '/')}`,
    `10. 不要使用 Agent / 子任务 / conversation summary`,
  ].join('\n');
  fs.writeFileSync(path.join(workDir, 'cross-source-cli-prompt.txt'), prompt, 'utf-8');

  onLog?.(`[cross-source] AI 撰写: cli=${cliProvider}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawnCliProcess(command, [], { cwd: config.skillProjectPath, env: process.env });
    const logs: string[] = [];
    try { child.stdin?.write(prompt); child.stdin?.end(); } catch (e: any) { onLog?.(`[cross-source] stdin 失败: ${e.message}`); }
    child.stdout?.on('data', (d: Buffer) => { const t = d.toString().trim(); if (t) { logs.push(t); onLog?.(`[cli] ${t.slice(0, 300)}`); } });
    child.stderr?.on('data', (d: Buffer) => { const t = d.toString().trim(); if (t) onLog?.(`[stderr] ${t.slice(0, 300)}`); });
    child.on('error', reject);
    child.on('close', code => {
      fs.writeFileSync(path.join(workDir, 'cross-source-cli.log'), logs.join('\n'), 'utf-8');
      code === 0 ? resolve() : reject(new Error(`CLI exit ${code}`));
    });
    setTimeout(() => { if (child.exitCode === null) { child.kill('SIGTERM'); reject(new Error('AI 撰写超时')); } }, 12 * 60 * 1000);
  }).catch(err => { onLog?.(`[cross-source] AI 失败: ${err.message}`); });

  return fs.existsSync(aiOutPath) ? aiOutPath : null;
}

/** 为多源 Run 生成/更新 cross-source 分析并入库。 */
export async function generateCrossSourceAnalysisForRun(
  runId: string,
  opts: GenerateCrossSourceOptions = {},
) {
  const run = getRun(runId);
  if (!run) throw new Error(`Run 不存在: ${runId}`);
  if (run.sources.length < 2) {
    throw new Error('交叉分析需要至少 2 个数据源; 单源 Run 请查看各源分区');
  }

  const analysisId = opts.analysisId ?? `analysis_${runId}_cross`;
  const digest = buildCrossSourceDigest(runId);

  const digestPath = opts.digestOut
    ? (() => {
        const out = path.resolve(opts.digestOut);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(digest, null, 2), 'utf-8');
        return out;
      })()
    : saveCrossDigestJson(runId, digest);

  const { insights, headline } = generateCrossSourceInsights(digest);

  // Markdown 选取优先级：
  //   1) opts.markdownPath 已存在 → 直接读（外部 AI 写好的）
  //   2) AI-authored 路径（自动 spawnCli）→ 通过自评门则用，否则回退 fallback
  //   3) Fallback 程序拼装
  let markdown = '';
  let renderSource: 'ai-authored' | 'ai-failed-fallback' | 'fallback' | 'external' = 'fallback';

  // Fallback 总是先算（兜底 + AI 失败时回滚目标）
  const fallbackMd = buildCrossSourceMarkdown(digest, insights, headline);

  if (opts.markdownPath && fs.existsSync(path.resolve(opts.markdownPath))) {
    markdown = fs.readFileSync(path.resolve(opts.markdownPath), 'utf-8');
    renderSource = 'external';
  } else {
    const cliProvider = opts.cliProvider ?? defaultCliProvider(getConfig().cliPaths);
    const skipAi = opts.skipAiEnrich || cliProvider === 'mock' || !isCliAvailable(cliProvider, getConfig().cliPaths?.[cliProvider]);

    if (skipAi) {
      markdown = fallbackMd;
      renderSource = 'fallback';
    } else {
      // 写 fallback 作 skeleton，调 AI 改写
      const workDir = path.dirname(digestPath);
      const skeletonPath = path.join(workDir, `cross-source-skeleton_${runId}.md`);
      fs.writeFileSync(skeletonPath, fallbackMd, 'utf-8');
      const aiPath = await runAiEnrichment(workDir, digestPath, skeletonPath, cliProvider, opts.onLog);
      if (aiPath) {
        const aiMd = fs.readFileSync(aiPath, 'utf-8');
        const goldenLines = (() => {
          const p = path.join(getConfig().skillProjectPath, 'docs/report/performance-report_perfetto_ULTIMATE_v5.3.md');
          return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8').split('\n').length : 0;
        })();
        const quality = validateCrossSourceQuality(aiMd, { goldenLines, minRatio: 0.4 });
        if (quality.pass) {
          markdown = aiMd;
          renderSource = 'ai-authored';
          opts.onLog?.(`[cross-source] AI 通过质量门 (${quality.lineCount} 行 / ${quality.sectionCount} 章)`);
        } else {
          markdown = fallbackMd;
          renderSource = 'ai-failed-fallback';
          opts.onLog?.(`[cross-source] AI 未过质量门, 回退 fallback: ${quality.errors.join('; ')}`);
        }
      } else {
        markdown = fallbackMd;
        renderSource = 'ai-failed-fallback';
      }
    }
  }
  console.error(`[cross-source] render=${renderSource} runId=${runId} mdLen=${markdown.length}`);

  const markdownPath = saveCrossReportMarkdown(runId, markdown);

  const saved = saveAnalysisWithReport(
    {
      id: analysisId,
      mode: 'single',
      runIds: [runId],
      status: 'completed',
      skill: renderSource === 'ai-authored' ? 'cross-source-analysis+ai' : 'cross-source-analysis',
    },
    { headline, markdown, insights },
    { analysisId, skill: renderSource === 'ai-authored' ? 'cross-source-analysis+ai' : 'cross-source-analysis' },
  );

  return { ...saved, markdownPath, digestPath, renderSource };
}

export function getCrossSourceAnalysisForRun(runId: string) {
  return getAnalysisReportByRunId(runId);
}
