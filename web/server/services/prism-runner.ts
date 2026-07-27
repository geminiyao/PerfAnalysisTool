/**
 * prism-runner.ts — Prism 三段管线可导入封装 (WT-051a 需求 A)
 *
 * 把 web/server/prism/run-unity-pipeline.ts 的三段串联逻辑抽成可导入函数，
 * 供 analysis-queue.ts 调用（不 spawn CLI 脚本，直接 import 调用）。
 *
 * 三段管线 (DR-44)：
 *   1. explore LLM  (runPrismExplore)  → findings.json + verdict.json
 *   2. narrative LLM (runPrismNarrative) → narrative.json
 *   3. render 纯代码 (spawn render-html.ts) → report.html
 *
 * onProgress 回调在三阶段开始/结束调用，供 queue 转 SSE。
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { runPrismExplore } from '../prism/explore-service.js';
import { runPrismNarrative } from '../prism/narrative-service.js';
import { registerBuiltinPipelines } from '../prism/report-pipeline.js';
import { saveAnalysisWithReport } from './analysis-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──────────────────────────────── 类型 ────────────────────────────────

export interface PrismPipelineOptions {
  source: 'unity' | 'perfetto';
  runId: string;
  /** unity 多态目录（含 base/cur 子目录）。unity 源必填。 */
  multiStateDir?: string;
  /** 输出目录（默认 web/data/prism-out/<runId>/<timestamp>） */
  outputDir?: string;
  /** 跳过 explore 阶段（复用已有 findings.json/verdict.json） */
  skipExplore?: boolean;
  /** 每阶段超时 ms（explore 默认 20min, narrative 默认 10min） */
  timeoutMs?: number;
  /** 进度回调，stage 开始/结束调用 */
  onProgress?: (stage: 'explore' | 'narrative' | 'render', progress: number, message: string) => void;
}

export interface PrismPipelineResult {
  success: boolean;
  error?: string;
  reportHtmlPath?: string;
  findingsPath?: string;
  narrativePath?: string;
  duration?: number;
}

// ──────────────────────────────── 主入口 ────────────────────────────────

/**
 * 运行 Prism 三段管线。
 *
 * 不 spawn CLI 脚本（run-unity-pipeline.ts / run-perfetto-pipeline.ts），
 * 直接 import 调用 runPrismExplore + runPrismNarrative，spawn render-html.ts。
 *
 * 参考 web/server/prism/run-unity-pipeline.ts:81-196 的串联逻辑。
 */
export async function runPrismPipeline(opts: PrismPipelineOptions): Promise<PrismPipelineResult> {
  const startTime = Date.now();
  const { source, runId, skipExplore, timeoutMs, onProgress } = opts;

  // 注册内置 pipeline（unity + perfetto），让 render 阶段能找到 pipeline 注册
  try {
    registerBuiltinPipelines();
  } catch (e: any) {
    // 重复注册不报错（幂等）
  }

  const repoRoot = path.resolve(__dirname, '../../..');

  // 解析 outputDir（默认 web/data/prism-out/<runId>/<timestamp>）
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const outputDir = opts.outputDir
    ? (path.isAbsolute(opts.outputDir) ? opts.outputDir : path.resolve(repoRoot, opts.outputDir))
    : path.join(repoRoot, 'web', 'data', 'prism-out', runId, stamp);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let exploreOutputDir: string;   // findings.json/verdict.json 所在
  let narrativeOutputDir: string; // narrative.json/report.html 所在

  try {
    // ── 计时变量 ──
    const timing: {
      explore?: { start: number; end: number; toolCalls: any[] };
      narrative?: { start: number; end: number; subStages?: any };
      render?: { start: number; end: number };
      total: { start: number; end?: number };
    } = { total: { start: startTime } };

    // ── 阶段 1：explore LLM ──
    if (skipExplore) {
      // 复用已有 findings.json/verdict.json：找最新 run 目录
      const runBaseDir = path.join(repoRoot, 'web', 'data', 'prism-out', runId);
      if (!fs.existsSync(runBaseDir)) {
        return {
          success: false,
          error: `--skip-explore but run dir not found: ${runBaseDir}`,
          duration: Date.now() - startTime,
        };
      }
      const subdirs = fs.readdirSync(runBaseDir)
        .filter(d => fs.statSync(path.join(runBaseDir, d)).isDirectory())
        .filter(d => fs.existsSync(path.join(runBaseDir, d, 'findings.json')))
        .sort()
        .reverse();
      exploreOutputDir = subdirs.length > 0
        ? path.join(runBaseDir, subdirs[0])
        : runBaseDir;
      if (!fs.existsSync(path.join(exploreOutputDir, 'findings.json'))) {
        return {
          success: false,
          error: `--skip-explore but findings.json not found in: ${exploreOutputDir}`,
          duration: Date.now() - startTime,
        };
      }
      onProgress?.('explore', 100, `Stage 1 (explore): SKIPPED, reusing ${exploreOutputDir}`);

      // --skip-explore + outputDir：复制 findings/verdict 到新目录，不覆盖原报告
      narrativeOutputDir = outputDir;
      if (!fs.existsSync(narrativeOutputDir)) {
        fs.mkdirSync(narrativeOutputDir, { recursive: true });
      }
      for (const fname of ['findings.json', 'verdict.json']) {
        const src = path.join(exploreOutputDir, fname);
        const dst = path.join(narrativeOutputDir, fname);
        if (fs.existsSync(src) && !fs.existsSync(dst)) {
          fs.copyFileSync(src, dst);
        }
      }
    } else {
      onProgress?.('explore', 0, 'Stage 1 (explore): starting...');
      timing.explore = { start: Date.now(), toolCalls: [] };
      const exploreResult = await runPrismExplore({
        source,
        runId,
        outputDir,
        multiStateDir: opts.multiStateDir,
        timeoutMs: timeoutMs ?? 30 * 60 * 1000,
        onProgress: (msg) => onProgress?.('explore', -1, msg),
      });
      timing.explore.end = Date.now();
      if (!exploreResult.success) {
        return {
          success: false,
          error: `Stage 1 (explore) FAILED: ${exploreResult.error}`,
          duration: Date.now() - startTime,
        };
      }
      exploreOutputDir = path.dirname(exploreResult.findingsPath);
      onProgress?.('explore', 100, `Stage 1 (explore): OK, ${exploreResult.findings.length} findings → ${exploreOutputDir}`);
    }

    // 默认 narrative/render 写在 explore 输出目录（除非 --skip-explore 指定了新 outputDir）
    if (!skipExplore) {
      narrativeOutputDir = outputDir;
    }

    // ── 阶段 2：narrative LLM ──
    onProgress?.('narrative', 0, 'Stage 2 (narrative): starting...');
    timing.narrative = { start: Date.now() };
    const narrativeResult = await runPrismNarrative({
      source,
      runId,
      outputDir: narrativeOutputDir,
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
      onProgress: (msg) => onProgress?.('narrative', -1, msg),
    });
    timing.narrative.end = Date.now();
    if (!narrativeResult.success) {
      return {
        success: false,
        error: `Stage 2 (narrative) FAILED: ${narrativeResult.error}`,
        findingsPath: path.join(exploreOutputDir, 'findings.json'),
        duration: Date.now() - startTime,
      };
    }
    onProgress?.('narrative', 100, `Stage 2 (narrative): OK → ${narrativeResult.narrativePath}`);

    // ── 阶段 3：render 纯代码 ──
    onProgress?.('render', 0, 'Stage 3 (render): starting...');
    timing.render = { start: Date.now() };
    const renderScript = path.join(__dirname, '..', 'prism', 'render-html.ts');
    const renderArgs = ['--import', 'tsx', renderScript, '--dir', narrativeOutputDir];
    const renderExitCode = await new Promise<number>((resolve) => {
      const child = spawn('node', renderArgs, {
        cwd: path.join(repoRoot, 'web'),
        stdio: 'inherit',
        shell: false,
      });
      child.on('close', resolve);
      child.on('error', (err) => {
        console.error(`[prism-runner] Stage 3 (render) spawn error: ${err.message}`);
        resolve(1);
      });
    });
    if (renderExitCode !== 0) {
      return {
        success: false,
        error: `Stage 3 (render) FAILED: exit code ${renderExitCode}`,
        findingsPath: path.join(exploreOutputDir, 'findings.json'),
        narrativePath: narrativeResult.narrativePath,
        duration: Date.now() - startTime,
      };
    }
    const reportHtmlPath = path.join(narrativeOutputDir, 'report.html');
    onProgress?.('render', 100, `Stage 3 (render): OK → ${reportHtmlPath}`);
    timing.render.end = Date.now();

    // ── 写 pipeline-timing.json ──
    try {
      // 读 explore ledger 获取 per-tool-call 计时
      const ledgerPath = path.join(exploreOutputDir, 'ledger.json');
      if (fs.existsSync(ledgerPath)) {
        const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
        timing.explore!.toolCalls = ledger.map((e: any) => {
          const rawCmd = (e.input?.command || e.input?.filePath || e.input?.pattern || '') as string;
          // 解析出可读的工具名
          let toolNames = '';
          if (rawCmd.includes('tools.cli')) {
            const names = [...rawCmd.matchAll(/"tool"\s*:\s*"(\w+)"/g)].map(m => m[1]);
            if (names.length > 0) {
              toolNames = names.length <= 3 ? names.join('+') : `${names.slice(0, 2).join('+')}…+${names.length - 2}`;
            } else {
              const single = rawCmd.match(/tools\.cli\.\S+\s+(\w+)/);
              if (single) toolNames = single[1];
            }
          } else if (e.name === 'Write') {
            toolNames = `Write ${rawCmd.split('/').pop()}`;
          }
          return {
            seq: e.seq,
            name: e.name,
            toolNames: toolNames || e.name,
            cmd: rawCmd.slice(0, 120),
            ts: e.ts,
            resultTs: e.resultTs,
            toolMs: e.resultTs ? e.resultTs - e.ts : null,
            resultLen: e.resultText?.length || 0,
          };
        });
      }
      // 读 narrative timing
      const narrativeData2 = JSON.parse(fs.readFileSync(narrativeResult.narrativePath, 'utf-8'));
      timing.narrative!.subStages = narrativeData2.narrativeProvenance?.timing || null;
    } catch { /* best effort */ }
    timing.total.end = Date.now();
    try {
      fs.writeFileSync(
        path.join(narrativeOutputDir, 'pipeline-timing.json'),
        JSON.stringify(timing, null, 2),
        'utf-8',
      );
    } catch { /* best effort */ }

    // ── 保存 analysis 记录到 analyses 表 (让抽屉"已有分析"能看到) ──
    try {
      const narrativePath = narrativeResult.narrativePath || path.join(narrativeOutputDir, 'narrative.json');
      const narrativeData = JSON.parse(fs.readFileSync(narrativePath, 'utf-8'));
      const analysisId = `prism-${runId}-${stamp}`;
      const reportRelPath = `data/prism-out/${runId}/${stamp}/report.html`;
      saveAnalysisWithReport(
        {
          id: analysisId,
          mode: 'single',
          runIds: [runId],
          status: 'completed',
          skill: 'prism-pipeline',
          error: null,
          completedAt: Date.now(),
        },
        {
          headline: narrativeData.overview || 'Prism 分析报告',
          markdown: `__PRISM_REPORT__:${reportRelPath}`,
          insights: (narrativeData.topConclusions || []).map((c: any, i: number) => ({
            id: `prism-insight-${i}`,
            severity: (c.severity || 'info') as 'critical' | 'high' | 'medium' | 'low' | 'info',
            confidence: 'medium' as const,
            sources: [source],
            conclusion: c.problem || '',
            recommendation: (c.recommendations || []).join('; ') || undefined,
          })),
        },
        { skill: 'prism-pipeline' },
      );
      onProgress?.('render', 100, `Analysis record saved → ${analysisId}`);
    } catch (saveErr: any) {
      // 保存失败不阻断管线结果返回
      onProgress?.('render', 100, `Warning: failed to save analysis record: ${saveErr?.message}`);
    }

    return {
      success: true,
      reportHtmlPath,
      findingsPath: path.join(narrativeOutputDir, 'findings.json'),
      narrativePath: narrativeResult.narrativePath,
      duration: Date.now() - startTime,
    };
  } catch (e: any) {
    return {
      success: false,
      error: `Unexpected error: ${e?.message ?? String(e)}`,
      duration: Date.now() - startTime,
    };
  }
}
