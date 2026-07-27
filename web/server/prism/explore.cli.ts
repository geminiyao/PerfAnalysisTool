/**
 * explore.cli.ts — CLI wrapper for runPrismExplore
 *
 * Usage (from repo root):
 *   npx tsx web/server/prism/explore.cli.ts [--source unity|perfetto] [--run-id <id>] [--provider codebuddy|claude] [--out <dir>]
 *
 * Prints a concise summary to stdout:
 *   - Number of findings and dataRequests
 *   - Tool call count
 *   - Verification summary (verified/unverified evidence, suspects)
 *
 * Exits 1 if success:false.
 */

import { runPrismExplore } from './explore-service.js';
import * as path from 'node:path';

// ─────────────────────────────────────────────
// Parse CLI args
// ─────────────────────────────────────────────

const argv = process.argv.slice(2);

function getFlag(flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function hasFlag(flag: string): boolean {
  return argv.includes(flag);
}

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(
    'Usage: npx tsx web/server/prism/explore.cli.ts [--source unity|perfetto] [--run-id <id>] [--provider codebuddy|claude] [--out <dir>] [--timeout-ms <ms>]\n' +
    '\n' +
    '  --source      Data source: unity | perfetto (default: unity). Routes to different explore-prompt.\n' +
    '  --run-id      Run ID to explore (default: by source — unity: unity-outside-stressmove, perfetto: bk26b-perfetto-triad)\n' +
    '  --provider    CLI provider: codebuddy | claude (default: codebuddy)\n' +
    '  --out         Output directory (default: web/data/prism-out/<runId>)\n' +
    '  --timeout-ms  Timeout in milliseconds (default: 1200000 = 20 min)\n',
  );
  process.exit(0);
}

const sourceRaw = getFlag('--source');
const source = (sourceRaw === 'unity' || sourceRaw === 'perfetto')
  ? sourceRaw
  : undefined;
const runId = getFlag('--run-id');
const providerRaw = getFlag('--provider');
const outputDirRaw = getFlag('--out');
const timeoutMsRaw = getFlag('--timeout-ms');

const provider = (providerRaw === 'claude' || providerRaw === 'codebuddy')
  ? providerRaw
  : undefined;

const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : undefined;

// WT-031 需求 C / WT-044：--out 相对于 cwd 解析（用户通常在 web/ 下跑，--out data/prism-out/... → web/data/prism-out/...）
// 绝对路径原样用，相对路径相对于 cwd（不是 repoRoot，避免 explore-service 的 path.resolve(repoRoot) 误解析）
const outputDir = outputDirRaw
  ? (path.isAbsolute(outputDirRaw) ? outputDirRaw : path.resolve(process.cwd(), outputDirRaw))
  : undefined;

// ─────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────

console.log('[explore.cli] Starting Prism Phase-A exploration...');

try {
  const result = await runPrismExplore({
    source,
    runId,
    outputDir,
    cliProvider: provider,
    timeoutMs,
  });

  if (!result.success) {
    console.error(`\n[explore.cli] FAILED: ${result.error}`);
    process.exit(1);
  }

  const v = result.verification;

  console.log('\n════════════════════════════════════════');
  console.log('  Prism Phase-A Exploration — Summary');
  console.log('════════════════════════════════════════');
  console.log(`  Run ID        : ${result.runId}`);
  console.log(`  Findings      : ${result.findings.length}`);
  console.log(`  DataRequests  : ${result.dataRequests.length}`);
  console.log(`  Tool calls    : ${result.meta?.toolCallCount ?? 'n/a'}`);
  console.log('');
  console.log('  Verification:');
  console.log(`    Total evidence   : ${v.totalEvidence}`);
  console.log(`    Verified         : ${v.verifiedEvidence}`);
  console.log(`    Unverified       : ${v.unverifiedEvidence}`);
  console.log(`    All-verified Fnds: ${v.findingsWithAllEvidenceVerified} / ${v.totalFindings}`);
  console.log(`    Suspects         : ${v.suspects.length}`);

  if (v.suspects.length > 0) {
    console.log('');
    console.log('  Suspect findings (possible fabrication):');
    for (const s of v.suspects) {
      console.log(`    [${s.findingId}] ${s.reason.slice(0, 200)}`);
    }
  }

  console.log('');
  console.log(`  Ledger   : ${result.ledgerPath}`);
  console.log(`  Findings : ${result.findingsPath}`);
  console.log('════════════════════════════════════════');

} catch (err) {
  console.error('[explore.cli] Unexpected error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
