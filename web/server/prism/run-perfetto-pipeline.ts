/**
 * run-perfetto-pipeline.ts — Perfetto 三段管线串联入口（DR-44 WT-027 B4）
 *
 * 串起三段：
 *   1. explore LLM  (explore-service.ts --source perfetto) → findings.json + verdict.json
 *   2. narrative LLM (narrative-service.ts --source perfetto) → narrative.json
 *   3. render 纯代码 (render-html.ts --dir <output>) → report.html
 *
 * Usage (from repo root):
 *   npx tsx web/server/prism/run-perfetto-pipeline.ts [--run-id <id>] [--out <dir>] [--skip-explore]
 *
 * --skip-explore: 跳过 explore 阶段（复用已有 findings.json/verdict.json），只跑 narrative + render。
 *                 用于 WT-028 反复调 narrative/render 不重跑 explore。
 *
 * 注意：本脚本会实际调用 LLM（explore + narrative），耗时较长（explore ~10-20min, narrative ~5min）。
 * 纯 dry-run（不调 LLM）请用 --help 查看用法，或单独跑类型检查。
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
    'Usage: npx tsx web/server/prism/run-perfetto-pipeline.ts [--run-id <id>] [--out <dir>] [--skip-explore] [--timeout-ms <ms>]\n' +
    '\n' +
    '  --run-id      Run ID (default: bk26b-perfetto-triad)\n' +
    '  --out         Output directory (default: web/data/prism-out/<runId>/<timestamp>)\n' +
    '  --skip-explore  Skip explore stage (reuse existing findings.json/verdict.json)\n' +
    '  --timeout-ms  Per-stage timeout in ms (default: 1200000 = 20 min for explore, 600000 = 10 min for narrative)\n',
  );
  process.exit(0);
}

const runId = getFlag('--run-id') ?? 'bk26b-perfetto-triad';
const rawOutDir = getFlag('--out');
const skipExplore = hasFlag('--skip-explore');
const timeoutMs = getFlag('--timeout-ms') ? parseInt(getFlag('--timeout-ms')!, 10) : undefined;

// WT-031 需求 C：--out 相对于 cwd 解析（用户通常在 web/ 下跑，--out data/prism-out/... → web/data/prism-out/...）
// 这样 narrative-service 和 render-html 都能正确找到 perfetto triad 数据（在 runBase/cur/ 下）
// 绝对路径原样用，相对路径相对于 cwd（不是 repoRoot，避免 explore-service 的 path.resolve(repoRoot) 误解析）
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
    // 找含 findings.json 的最新时间戳子目录（过滤掉 base/cur/throttle 等 triad 数据目录）
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

    // WT-031 需求 C：--skip-explore 模式下支持 --out 新目录，不覆盖原报告
    if (outputDir) {
      // 用户显式指定 --out：narrative + render 写到新目录，原 exploreOutputDir 不动
      // 相对于 cwd 解析（用户通常在 web/ 下跑，--out data/prism-out/... → web/data/prism-out/...）
      // 这样 narrative-service 和 render-html 都能正确找到 perfetto triad 数据（在 runBase/cur/ 下）
      narrativeOutputDir = path.isAbsolute(outputDir)
        ? outputDir
        : path.resolve(process.cwd(), outputDir);
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
      // 未给 --out：保持原行为（写到 exploreOutputDir），但打 warning
      console.warn(`[pipeline] WARNING: --skip-explore without --out will overwrite existing narrative.json/report.html in ${exploreOutputDir}`);
      console.warn(`[pipeline] Suggestion: add --out data/prism-out/${runId}/<new-timestamp> to preserve original`);
      narrativeOutputDir = exploreOutputDir;
    }
  } else {
    console.log('[pipeline] Stage 1 (explore): starting...');
    const exploreResult = await runPrismExplore({
      source: 'perfetto',
      runId,
      outputDir,
      timeoutMs: timeoutMs ?? 20 * 60 * 1000,
    });
    if (!exploreResult.success) {
      console.error(`[pipeline] Stage 1 (explore) FAILED: ${exploreResult.error}`);
      process.exit(1);
    }
    exploreOutputDir = path.dirname(exploreResult.findingsPath);
    narrativeOutputDir = outputDir ? path.resolve(repoRoot, outputDir) : exploreOutputDir;
    console.log(`[pipeline] Stage 1 (explore): OK, ${exploreResult.findings.length} findings → ${exploreOutputDir}`);
  }

  // ── 阶段 2：narrative LLM ──
  console.log('[pipeline] Stage 2 (narrative): starting...');
  const narrativeResult = await runPrismNarrative({
    source: 'perfetto',
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
  console.log('  Perfetto 三段管线 — 完成');
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
