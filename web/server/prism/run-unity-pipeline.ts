/**
 * run-unity-pipeline.ts — Unity 多态三段管线串联入口（WT-044）
 *
 * 串起三段（DR-44）：
 *   1. explore LLM  (explore-service.ts --source unity) → findings.json + verdict.json
 *   2. narrative LLM (narrative-service.ts --source unity) → narrative.json
 *                  （detectStateMode 检测 base/cur 子目录 → 选 unity-multi-state.txt 模板）
 *   3. render 纯代码 (render-html.ts --dir <output>) → report.html
 *
 * Usage (from repo root or web/):
 *   npx tsx web/server/prism/run-unity-pipeline.ts --multi-state-dir <udiff_dir> [--out <dir>] [--skip-explore]
 *
 * --multi-state-dir: udiff 目录路径（含 base/ + cur/ 子目录，每个有 preprocess-result.json）
 * --out: 输出目录（默认 web/data/prism-out/<udiff_id>/<timestamp>）
 * --skip-explore: 跳过 explore 阶段（复用已有 findings.json/verdict.json），只跑 narrative + render。
 *                 用于反复调 narrative/render 不重跑 explore。
 *
 * 注意：本脚本会实际调用 LLM（explore + narrative），耗时较长（explore ~10-20min, narrative ~5min）。
 */

import { runPrismExplore } from './explore-service.js';
import { runPrismNarrative } from './narrative-service.js';
import { registerBuiltinPipelines } from './report-pipeline.js';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// ESM 兼容：__dirname 在 ESM 下未定义
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──────────────────────────────── CLI 参数 ────────────────────────────────

const argv = process.argv.slice(2);
function getFlag(flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx === -1 ? undefined : argv[idx + 1];
}
function hasFlag(flag: string): boolean {
  return argv.includes(flag);
}

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(
    'Usage: npx tsx web/server/prism/run-unity-pipeline.ts --multi-state-dir <udiff_dir> [--out <dir>] [--skip-explore] [--timeout-ms <ms>]\n' +
    '\n' +
    '  --multi-state-dir  udiff 目录路径（含 base/ + cur/ 子目录）\n' +
    '  --out              Output directory (default: web/data/prism-out/<udiff_id>/<timestamp>)\n' +
    '  --skip-explore     Skip explore stage (reuse existing findings.json/verdict.json)\n' +
    '  --timeout-ms       Per-stage timeout in ms (default: 1200000 = 20 min for explore, 600000 = 10 min for narrative)\n',
  );
  process.exit(0);
}

const multiStateDirArg = getFlag('--multi-state-dir');
const rawOutDir = getFlag('--out');
const skipExplore = hasFlag('--skip-explore');
const timeoutMs = getFlag('--timeout-ms') ? parseInt(getFlag('--timeout-ms')!, 10) : undefined;

if (!multiStateDirArg && !skipExplore) {
  console.error('[pipeline] --multi-state-dir is required (or use --skip-explore with --run-id)');
  process.exit(1);
}

// 解析 udiff 目录：相对路径相对于 cwd（通常 web/），绝对路径直接用
const multiStateDir = multiStateDirArg
  ? (path.isAbsolute(multiStateDirArg) ? multiStateDirArg : path.resolve(process.cwd(), multiStateDirArg))
  : undefined;

// runId = udiff 目录名（如 udiff_1782983710451_be175ef1）
const runId = multiStateDir ? path.basename(multiStateDir) : (getFlag('--run-id') ?? 'udiff_1782983710451_be175ef1');

// WT-031 需求 C：--out 相对于 cwd 解析
const outputDir = rawOutDir
  ? (path.isAbsolute(rawOutDir) ? rawOutDir : path.resolve(process.cwd(), rawOutDir))
  : undefined;

// ──────────────────────────────── 主流程 ────────────────────────────────

async function main(): Promise<void> {
  // 注册内置 pipeline（unity + perfetto）
  registerBuiltinPipelines();
  console.log('[pipeline] Registered builtin pipelines: unity, perfetto');

  const repoRoot = path.resolve(__dirname, '../../..');
  let exploreOutputDir: string;  // explore 阶段的输出目录（findings.json/verdict.json 所在）
  let narrativeOutputDir: string;  // narrative + render 阶段的输出目录（narrative.json/report.html 所在）

  // ── 阶段 1：explore LLM ──
  if (skipExplore) {
    // 复用已有 findings.json/verdict.json：找最新的 run 目录
    const runBaseDir = path.join(repoRoot, 'web', 'data', 'prism-out', runId);
    if (!fs.existsSync(runBaseDir)) {
      console.error(`[pipeline] --skip-explore but run dir not found: ${runBaseDir}`);
      process.exit(1);
    }
    // 找含 findings.json 的最新时间戳子目录
    const subdirs = fs.readdirSync(runBaseDir)
      .filter(d => fs.statSync(path.join(runBaseDir, d)).isDirectory())
      .filter(d => fs.existsSync(path.join(runBaseDir, d, 'findings.json')))
      .sort()
      .reverse();
    exploreOutputDir = subdirs.length > 0
      ? path.join(runBaseDir, subdirs[0])
      : runBaseDir;
    if (!fs.existsSync(path.join(exploreOutputDir, 'findings.json'))) {
      console.error(`[pipeline] --skip-explore but findings.json not found in: ${exploreOutputDir}`);
      process.exit(1);
    }
    console.log(`[pipeline] Stage 1 (explore): SKIPPED, reusing ${exploreOutputDir}`);

    // --skip-explore 模式下支持 --out 新目录，不覆盖原报告
    if (outputDir) {
      narrativeOutputDir = path.isAbsolute(outputDir) ? outputDir : path.resolve(process.cwd(), outputDir);
      if (!fs.existsSync(narrativeOutputDir)) {
        fs.mkdirSync(narrativeOutputDir, { recursive: true });
        console.log(`[pipeline] Created new output dir: ${narrativeOutputDir}`);
      }
      // 复制 findings.json + verdict.json 到新目录（narrative-service 要读 findings.json）
      for (const fname of ['findings.json', 'verdict.json']) {
        const src = path.join(exploreOutputDir, fname);
        const dst = path.join(narrativeOutputDir, fname);
        if (fs.existsSync(src) && !fs.existsSync(dst)) {
          fs.copyFileSync(src, dst);
          console.log(`[pipeline] Copied ${fname} → ${narrativeOutputDir}`);
        }
      }
      console.log(`[pipeline] --skip-explore + --out: narrative/render will write to ${narrativeOutputDir} (original ${exploreOutputDir} untouched)`);
    } else {
      console.warn(`[pipeline] WARNING: --skip-explore without --out will overwrite existing narrative.json/report.html in ${exploreOutputDir}`);
      console.warn(`[pipeline] Suggestion: add --out data/prism-out/${runId}/<new-timestamp> to preserve original`);
      narrativeOutputDir = exploreOutputDir;
    }
  } else {
    console.log('[pipeline] Stage 1 (explore): starting...');
    const exploreResult = await runPrismExplore({
      source: 'unity',
      runId,
      outputDir,
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
    });
    if (!exploreResult.success) {
      console.error(`[pipeline] Stage 1 (explore) FAILED: ${exploreResult.error}`);
      process.exit(1);
    }
    exploreOutputDir = path.dirname(exploreResult.findingsPath);
    narrativeOutputDir = outputDir ? (path.isAbsolute(outputDir) ? outputDir : path.resolve(process.cwd(), outputDir)) : exploreOutputDir;
    console.log(`[pipeline] Stage 1 (explore): OK, ${exploreResult.findings.length} findings → ${exploreOutputDir}`);
  }

  // ── 阶段 2：narrative LLM ──
  console.log('[pipeline] Stage 2 (narrative): starting...');
  const narrativeResult = await runPrismNarrative({
    source: 'unity',
    runId,
    outputDir: narrativeOutputDir,
    timeoutMs: timeoutMs ?? 10 * 60 * 1000,
  });
  if (!narrativeResult.success) {
    console.error(`[pipeline] Stage 2 (narrative) FAILED: ${narrativeResult.error}`);
    process.exit(1);
  }
  console.log(`[pipeline] Stage 2 (narrative): OK → ${narrativeResult.narrativePath}`);

  // ── 阶段 3：render 纯代码 ──
  console.log('[pipeline] Stage 3 (render): starting...');
  const renderScript = path.join(__dirname, 'render-html.ts');
  const renderArgs = ['--import', 'tsx', renderScript, '--dir', narrativeOutputDir];
  const renderExitCode = await new Promise<number>((resolve) => {
    const child = spawn('node', renderArgs, {
      cwd: path.join(repoRoot, 'web'),
      stdio: 'inherit',
      shell: false,
    });
    child.on('close', resolve);
    child.on('error', (err) => {
      console.error(`[pipeline] Stage 3 (render) spawn error: ${err.message}`);
      resolve(1);
    });
  });
  if (renderExitCode !== 0) {
    console.error(`[pipeline] Stage 3 (render) FAILED: exit code ${renderExitCode}`);
    process.exit(1);
  }
  const reportHtmlPath = path.join(narrativeOutputDir, 'report.html');
  console.log(`[pipeline] Stage 3 (render): OK → ${reportHtmlPath}`);

  console.log('\n════════════════════════════════════════');
  console.log('  Unity 多态三段管线 — 完成');
  console.log('════════════════════════════════════════');
  console.log(`  findings.json  : ${path.join(narrativeOutputDir, 'findings.json')}`);
  console.log(`  narrative.json : ${narrativeResult.narrativePath}`);
  console.log(`  report.html    : ${reportHtmlPath}`);
  console.log('════════════════════════════════════════');
}

main().catch((err) => {
  console.error('[pipeline] Unexpected error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
