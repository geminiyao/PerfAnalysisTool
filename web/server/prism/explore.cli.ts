/**
 * explore.cli.ts — CLI wrapper for runPrismExplore
 *
 * Usage (from repo root):
 *   npx tsx web/server/prism/explore.cli.ts [--run-id <id>] [--provider codebuddy|claude] [--out <dir>]
 *
 * Prints a concise summary to stdout:
 *   - Number of findings and dataRequests
 *   - Tool call count
 *   - Verification summary (verified/unverified evidence, suspects)
 *
 * Exits 1 if success:false.
 */

import { runPrismExplore } from './explore-service.js';

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
    'Usage: npx tsx web/server/prism/explore.cli.ts [--run-id <id>] [--provider codebuddy|claude] [--out <dir>] [--timeout-ms <ms>]\n' +
    '\n' +
    '  --run-id      Run ID to explore (default: unity-outside-stressmove)\n' +
    '  --provider    CLI provider: codebuddy | claude (default: codebuddy)\n' +
    '  --out         Output directory (default: web/data/prism-out/<runId>)\n' +
    '  --timeout-ms  Timeout in milliseconds (default: 1200000 = 20 min)\n',
  );
  process.exit(0);
}

const runId = getFlag('--run-id');
const providerRaw = getFlag('--provider');
const outputDir = getFlag('--out');
const timeoutMsRaw = getFlag('--timeout-ms');

const provider = (providerRaw === 'claude' || providerRaw === 'codebuddy')
  ? providerRaw
  : undefined;

const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) : undefined;

// ─────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────

console.log('[explore.cli] Starting Prism Phase-A exploration...');

try {
  const result = await runPrismExplore({
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
