/**
 * explore-service.ts — Prism Phase-A exploration pipeline (task B4)
 *
 * Spawns the LLM CLI with the explore-prompt, records a ledger of every
 * tool_use / tool_result seen in the stream-json output, then verifies
 * each Finding's evidence against the real calls in that ledger.
 *
 * Key principle (F1): every number in a Finding must trace back to a
 * real tool call; verifyFindings detects fabricated evidence.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { resolveCliExecutable, spawnCliProcess, cliUnavailableHint } from '../utils/cli-resolver.js';
import { getConfig } from '../utils/config.js';
import { appendMemory, loadMemory, type MemoryCategory, type MemoryEntry } from './prism-memory.js';
import type { Finding, DataRequest, ExploreResult } from './types.js';

/** Categories injected at explore startup (M3-B). Adjust here, not inline in formatters. */
export const MEMORY_INJECTION_CATEGORIES: MemoryCategory[] = [
  'constitution',   // DR-51 宪法层（DR-41/44/50）
  'methodology',    // DR-51 规程层（DR-45/48/49）
  'priors',
  'knowledge',
  'lessons',
  'capabilities',
];

/** M3-C: persist run DataRequests into capabilities/ at explore end (default on). */
export const DATA_REQUEST_MEMORY_PERSIST_ENABLED = true;

/**
 * Max characters for the {{MEMORY_INJECTION}} block.
 * DR-51: 从 7000 调到 12000，容纳 constitution (~3000) + methodology (~2400) + 知识层 (~6600)。
 */
export const MEMORY_INJECTION_MAX_CHARS = 12000;

// ─────────────────────────────────────────────
// M3-B: memory injection for explore prompt
// ─────────────────────────────────────────────

export interface FormatMemoryForPromptOptions {
  /** Override memory root (tests). */
  root?: string;
  /**
   * 数据源筛选（WT-040 / DR-45 §二）：给定后只注入该数据源 + cross-source + 无 dataSource 字段的旧条目。
   * 未给定 → 注入全部（兼容现有行为）。
   */
  dataSource?: 'unity' | 'perfetto' | 'simpleperf';
}

/**
 * Load persistent brain entries and format as compact reference text for the explore prompt.
 *
 * WT-040: 当 opts.dataSource 给定时，按数据源筛选——只保留该数据源条目 + cross-source 通用条目
 * + 无 dataSource 字段的旧条目（兼容期，避免老条目被过滤导致 explore 退化）。
 */
export function formatMemoryForPrompt(opts?: FormatMemoryForPromptOptions): string {
  const { byCategory } = loadMemory({
    categories: MEMORY_INJECTION_CATEGORIES,
    root: opts?.root,
  });

  const dataSource = opts?.dataSource;
  const filterByDataSource = (entries: MemoryEntry[]): MemoryEntry[] => {
    if (!dataSource) return entries;
    return entries.filter((e) => {
      // 旧条目无 dataSource 字段 → 包含（兼容期，不排除）
      if (e.dataSource === undefined) return true;
      // 该数据源条目 → 包含
      if (e.dataSource === dataSource) return true;
      // 跨源通用条目 → 包含
      if (e.dataSource === 'cross-source') return true;
      // 其它数据源 → 排除
      return false;
    });
  };

  // Per-category budget so a large category (e.g. 79 priors) can't starve
  // later categories (e.g. freshly-sedimented capabilities). Split the total
  // budget across categories that actually have entries.
  // WT-040: 先按 dataSource 筛选，再算 activeCats（避免某分类筛完后为空仍占预算）
  const byCategoryFiltered: Record<string, MemoryEntry[]> = {};
  for (const cat of MEMORY_INJECTION_CATEGORIES) {
    byCategoryFiltered[cat] = filterByDataSource(byCategory[cat] ?? []);
  }
  const activeCats = MEMORY_INJECTION_CATEGORIES.filter((c) => byCategoryFiltered[c]?.length);
  if (activeCats.length === 0) return '';
  const perCatBudget = Math.floor(MEMORY_INJECTION_MAX_CHARS / activeCats.length);

  const blocks: string[] = [];

  for (const cat of activeCats) {
    const catEntries = byCategoryFiltered[cat]!;
    const catLines: string[] = [`## ${cat} (${catEntries.length})`];
    let catChars = catLines[0].length + 1;
    let catTruncated = false;
    let shown = 0;

    for (const entry of catEntries) {
      const title = entry.title ? String(entry.title) : entry.id;
      const compact = entry.content.replace(/\s+/g, ' ').trim();
      const summary = compact.length > 280 ? `${compact.slice(0, 277)}...` : compact;
      const line = `- [${title}] ${summary}`;

      if (catChars + line.length + 1 > perCatBudget) {
        catTruncated = true;
        break;
      }
      catLines.push(line);
      catChars += line.length + 1;
      shown++;
    }

    if (catTruncated) {
      catLines.push(`...(${cat}: showing ${shown}/${catEntries.length}, budget-capped)`);
    }
    blocks.push(catLines.join('\n'));
  }

  return blocks.join('\n\n').trimEnd();
}

// ─────────────────────────────────────────────
// M3-C: run-end DataRequest sedimentation
// ─────────────────────────────────────────────

function normalizeForStableId(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Extract semantic fields from a DataRequest, tolerant to schema drift.
 * The typed shape is want/rationale/..., but real LLM-written data-requests.json
 * uses id/topic/description/reasonMissing/impactOnFindings. Support both.
 */
function extractDataRequestFields(dr: DataRequest): {
  title: string;
  body: string;
  idParts: string[];
} {
  const r = dr as unknown as Record<string, unknown>;
  const s = (v: unknown): string => (typeof v === 'string' ? v : '');

  // Title: prefer real-schema topic, fallback typed want, then id.
  const title = s(r.topic) || s(r.want) || s(r.id) || '(untitled data request)';

  // Body lines: include whichever fields are present (both schemas).
  const lines: string[] = [];
  const push = (label: string, v: unknown) => {
    const val = s(v);
    if (val) lines.push(`${label}: ${val}`);
  };
  push('Topic', r.topic);
  push('Want', r.want);
  push('Description', r.description);
  push('Rationale', r.rationale);
  push('ReasonMissing', r.reasonMissing);
  push('ImpactOnFindings', r.impactOnFindings);
  push('Axis', r.suspectedAxis);
  push('ClosestTool', r.closestExistingTool);
  const body = lines.length > 0 ? lines.join('\n') : title;

  // Stable-id parts: semantic content across both schemas (never the volatile LLM id).
  const idParts = [
    s(r.topic),
    s(r.want),
    s(r.description),
    s(r.rationale),
    s(r.reasonMissing),
    s(r.suspectedAxis),
    s(r.closestExistingTool),
  ];
  return { title, body, idParts };
}

/** Derive stable id from semantic fields (not LLM-provided id). Same content → same id → overwrite. */
export function deriveDataRequestStableId(dr: DataRequest): string {
  const { idParts } = extractDataRequestFields(dr);
  const payload = idParts.map(normalizeForStableId).join('|');
  const hash = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
  return `dr-${hash}`;
}

function formatDataRequestContent(dr: DataRequest): string {
  return extractDataRequestFields(dr).body;
}

/** Append run DataRequests to capabilities/ (incremental; same id overwrites, never clears). */
export function persistDataRequestsToMemory(
  dataRequests: DataRequest[],
  opts?: { runId?: string; root?: string; enabled?: boolean; dataSource?: 'unity' | 'perfetto' | 'simpleperf' },
): number {
  const enabled = opts?.enabled ?? DATA_REQUEST_MEMORY_PERSIST_ENABLED;
  if (!enabled || dataRequests.length === 0) {
    return 0;
  }

  const source = opts?.runId ?? 'explore-datarequest';
  let count = 0;

  for (const dr of dataRequests) {
    const { title } = extractDataRequestFields(dr);
    try {
      const id = deriveDataRequestStableId(dr);
      appendMemory(
        'capabilities',
        {
          id,
          title,
          content: formatDataRequestContent(dr),
          source,
          // WT-040: 沉淀时带上数据源，避免跨源噪音（unity explore 不再注入 perfetto 的 capabilities）
          ...(opts?.dataSource ? { dataSource: opts.dataSource } : {}),
        },
        { root: opts?.root },
      );
      count++;
    } catch (e) {
      console.warn(
        `[explore] persist DataRequest failed (${title.slice(0, 80)}): ${(e as Error).message}`,
      );
    }
  }

  return count;
}

// ─────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────

/** One entry in the recorded ledger of tool_use / tool_result pairs. */
export interface LedgerEntry {
  /** 1-based sequence number across all tool_use events */
  seq: number;
  /** Tool name from the LLM stream-json (e.g. 'Bash', 'Read', 'Write') */
  name: string;
  /** Raw tool input block as emitted by the CLI */
  input: Record<string, unknown>;
  /** Text output from the matching tool_result content block (or '' if unmatched yet) */
  resultText: string;
  /** Timestamp (ms epoch) when the LLM emitted this tool_use */
  ts: number;
  /** Timestamp (ms epoch) when the tool_result was received */
  resultTs?: number;
}

/** One evidence item annotated with verification outcome */
export interface AnnotatedEvidence {
  tool: string;
  args: Record<string, unknown>;
  resultDigest: unknown;
  runId?: string;
  // Verification annotations (added by verifyFindings)
  verified: boolean;
  /** Which ledger seq matched (for audit trail) */
  matchedLedgerSeq?: number;
  /** Whether the digest numbers were spot-checked against real result */
  digestChecked: boolean;
  /** Reason if not verified */
  notVerifiedReason?: string;
}

export interface VerificationSummary {
  totalFindings: number;
  totalEvidence: number;
  verifiedEvidence: number;
  unverifiedEvidence: number;
  findingsWithAllEvidenceVerified: number;
  /** Findings where NO evidence matched the ledger — likely fabrication. */
  suspects: Array<{ findingId: string; reason: string }>;
  /** Findings with SOME evidence verified but some unmatched — partial gap, not fabrication (DR-21). */
  partiallyVerified?: Array<{ findingId: string; reason: string }>;
}

/** Finding with evidence items annotated by verifyFindings */
export type AnnotatedFinding = Omit<Finding, 'evidence'> & { evidence: AnnotatedEvidence[] };

export interface ExploreRunResult extends ExploreResult {
  success: boolean;
  error?: string;
  ledgerPath: string;
  findingsPath: string;
  verification: VerificationSummary;
  annotatedFindings?: AnnotatedFinding[];
  /** F8 overall verdict (from verdict.json), or null if not written. */
  verdict?: Record<string, unknown> | null;
}

/** Options for runPrismExplore */
export interface RunPrismExploreOpts {
  runId?: string;
  outputDir?: string;
  cliProvider?: 'codebuddy' | 'claude';
  timeoutMs?: number;
  /** F8 判定基准：帧预算 ms/帧。默认取 aoe-watch-spec deviceTier 默认 16.67 (60fps)。 */
  frameBudgetMs?: number;
  /** unity 多态目录（含 base/cur/throttle 子目录）。可选；不传则单态分析。 */
  multiStateDir?: string;
  /**
   * 数据源标识（DR-44 B1）：决定加载哪个 explore-prompt。
   * - 'unity'（默认）：prompts/unity-explore-prompt.txt（Unity marker 工具集）
   * - 'perfetto'：prompts/perfetto-explore-prompt.txt（Perfetto JSON 工具集）
   * 路由到不同 prompt，但复用同一份 spawn CLI + ledger + verify 逻辑。
   */
  source?: 'unity' | 'perfetto';
  /** 实时进度回调: CLI 输出时触发, 推送日志行给 SSE */
  onProgress?: (message: string) => void;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** ESM-safe __dirname equivalent */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Convert Windows backslash path to POSIX forward-slash path */
function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

// NOTE: prompt is piped via stdin (see spawn below), NOT passed as `-p` arg.
// Windows .cmd wrappers truncate long multi-line prompts passed as positional
// args; `-p` with no value tells codebuddy/claude to read the prompt from stdin.
//
// 工具控制说明（A4 修复）：
// - `--allowedTools` 只是"无需提示用户即可允许"的白名单，不是排他——加 `-y` 后其它工具也能用，
//   所以 LLM 之前能用 Edit/TaskCreate/TaskUpdate/PowerShell 改源码、做任务管理、跑偏 explore。
// - `--disallowedTools` 是真正的黑名单，显式禁止 explore 阶段不该用的工具。
//   被 ban 的：Edit（改源码）、Task*（任务管理，会花 2+ 分钟做计划而不查询）、
//   PowerShell（Windows 专用，explore 不需要）、Agent/SendMessage/Team*（spawn 子 agent）、
//   WebFetch/WebSearch（explore 阶段不需要上网，数据全在本地）。
//   保留的：Bash（调 tools.cli.ts）、Read/Glob/Grep（辅助探索）、Write（写 findings/verdict/data-requests）。
const EXPLORE_DISALLOWED_TOOLS = [
  'Edit',
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskOutput', 'TaskStop',
  'PowerShell',
  'Agent', 'SendMessage', 'TeamCreate', 'TeamDelete',
  'WebFetch', 'WebSearch',
].join(',');

const CLI_PROVIDERS: Record<string, (prompt: string) => string[]> = {
  codebuddy: (_prompt) => [
    '-p',
    '--output-format', 'stream-json',
    '-y',
    // ★ --tools 是排他性限制：只加载这 5 个工具定义（省 ~24KB 上下文/轮）
    '--tools', 'Bash,Read,Write,Glob,Grep',
    // ★ 禁用所有 MCP 服务器（crashsight/garyUnity/garyUnreal/km/tapd 等 126 个 MCP 工具与 explore 无关）
    '--mcp-config', '{}',
    '--strict-mcp-config',
    '--disallowedTools', EXPLORE_DISALLOWED_TOOLS,
  ],
  claude: (_prompt) => [
    '-p',
    '--output-format', 'stream-json',
    '--tools', 'Bash,Read,Write,Glob,Grep',
    '--mcp-config', '{}',
    '--strict-mcp-config',
    '--disallowedTools', EXPLORE_DISALLOWED_TOOLS,
  ],
};

/**
 * Parse the command string inside a Bash tool_use input to extract
 * a Prism tools.cli.ts invocation, returning { toolName, argsJson }.
 * Returns null if this Bash call is not a tools.cli.ts invocation.
 */
function parseToolsCliCall(bashCommand: string): { toolName: string; argsJson: string } | null {
  // Matches: ... tools.cli.ts <toolName> '<jsonArgs>'
  // The JSON args may use single-quotes (shell) or be absent
  const re = /tools\.cli\.ts\s+(\w+)\s+'([^']+)'/;
  const m = bashCommand.match(re);
  if (m) return { toolName: m[1], argsJson: m[2] };

  // Also handle: tools.cli.ts <toolName> '<jsonArgs>' with double-quotes
  const re2 = /tools\.cli\.ts\s+(\w+)\s+"([^"]+)"/;
  const m2 = bashCommand.match(re2);
  if (m2) return { toolName: m2[1], argsJson: m2[2] };

  // Or no args: tools.cli.ts <toolName>
  const re3 = /tools\.cli\.ts\s+(\w+)\s*$/;
  const m3 = bashCommand.match(re3);
  if (m3) return { toolName: m3[1], argsJson: '{}' };

  return null;
}

/**
 * Parse a `tools.cli.ts batch '[{tool,args},...]'` command into its item list.
 * Returns null if this is not a batch call.
 */
function parseBatchCall(bashCommand: string): Array<{ tool: string; args?: Record<string, unknown> }> | null {
  const re = /tools\.cli\.ts\s+batch\s+'([\s\S]+?)'(?:\s|$|>)/;
  const re2 = /tools\.cli\.ts\s+batch\s+"([\s\S]+?)"(?:\s|$|>)/;
  const m = bashCommand.match(re) ?? bashCommand.match(re2);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[1]);
    if (!Array.isArray(arr)) return null;
    return arr.map((x: { tool: string; args?: Record<string, unknown> }) => ({ tool: x.tool, args: x.args }));
  } catch {
    return null;
  }
}

/**
 * Extract the JSON array printed by a batch invocation from resultText.
 * The batch CLI prints `[{tool,args,ok,result},...]`. Returns the array or null.
 */
function extractBatchResults(text: string): unknown[] | null {
  if (!text) return null;
  const idx = text.indexOf('[');
  if (idx < 0) return null;
  let depth = 0, end = -1;
  for (let k = idx; k < text.length; k++) {
    if (text[k] === '[') depth++;
    else if (text[k] === ']') { depth--; if (depth === 0) { end = k + 1; break; } }
  }
  if (end < 0) return null;
  try {
    const arr = JSON.parse(text.slice(idx, end));
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

/**
 * Extract the JSON result from a resultText that may contain leading
 * log lines (e.g. "[warn] ...") before the actual JSON object.
 * Returns the parsed object or null on failure.
 */
function extractJsonFromResultText(text: string): Record<string, unknown> | null {
  // Find the first '{' that starts a JSON object
  const idx = text.indexOf('{');
  if (idx < 0) return null;
  try {
    return JSON.parse(text.slice(idx)) as Record<string, unknown>;
  } catch {
    // Try each line
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('{')) {
        try {
          return JSON.parse(trimmed) as Record<string, unknown>;
        } catch { /* continue */ }
      }
    }
    return null;
  }
}

/**
 * Subset-match (RELAXED — see PRISM-RATIONALE DR-21): the goal is to catch
 * FABRICATION (no such call was ever made), not to punish the LLM for imprecise
 * argument recall (abbreviated thread names, slightly-off thresholds, extra keys).
 * Relaxations:
 *  - runId ignored (always default-injected).
 *  - thread names normalized: "1:Main Thread" ≈ "Main Thread" (strip leading "N:").
 *  - numeric values matched within 5% relative tolerance (or ±0.5 absolute).
 *  - a key present in evidence but ABSENT in the ledger args is NOT a hard fail
 *    (the LLM may over-specify an optional/default param) — it's tolerated.
 *  - core identity keys (markerName / rootMarker / frameIndex) must still match
 *    (loosely) when present in BOTH, else it's a different call.
 */
function normalizeThread(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  // "1:Main Thread" -> "main thread"; also collapse case/space
  return v.replace(/^\d+:/, '').trim().toLowerCase();
}

function looseValueMatch(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    const diff = Math.abs(a - b);
    if (diff <= 0.5) return true;
    const rel = diff / Math.max(Math.abs(a), Math.abs(b), 1e-9);
    return rel <= 0.05;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

function argsSubsetMatch(
  evidenceArgs: Record<string, unknown>,
  ledgerArgs: Record<string, unknown>,
): boolean {
  const IGNORE_KEYS = new Set(['runId', 'thread', 'topN', 'maxDepth', 'minPct', 'metric', 'sortBy', 'excludeWaits', 'minSpikeRatio', 'fanoutThreshold', 'minTotalMsPerFrame']);
  const THREAD_KEYS = new Set(['thread']);
  // Identity keys: if BOTH sides have them, they must match (loosely). These pin
  // the call to the same target so we don't match an unrelated call.
  const IDENTITY_KEYS = ['markerName', 'rootMarker', 'frameIndex'];

  for (const idk of IDENTITY_KEYS) {
    if (idk in evidenceArgs && idk in ledgerArgs) {
      let ev = evidenceArgs[idk], lv = ledgerArgs[idk];
      if (!looseValueMatch(ev, lv)) return false;
    }
  }
  for (const [k, v] of Object.entries(evidenceArgs)) {
    if (IGNORE_KEYS.has(k)) continue;
    if (IDENTITY_KEYS.includes(k)) continue; // already handled
    if (!(k in ledgerArgs)) continue;         // over-specified optional key — tolerate
    let ev: unknown = v, lv: unknown = ledgerArgs[k];
    if (THREAD_KEYS.has(k)) { ev = normalizeThread(ev); lv = normalizeThread(lv); }
    if (!looseValueMatch(ev, lv)) return false;
  }
  return true;
}

/**
 * Best-effort check that numeric values in resultDigest appear (approximately)
 * in the real result JSON.
 * "Approximately" = within 1% relative tolerance for floats ≥ 1.
 * Returns { checked: boolean; ok: boolean }.
 */
function spotCheckDigest(
  resultDigest: unknown,
  realResultJson: Record<string, unknown>,
): { checked: boolean; ok: boolean } {
  if (typeof resultDigest !== 'object' || resultDigest === null) {
    return { checked: false, ok: false };
  }
  const flatReal = flattenNumbers(realResultJson);
  const digestEntries = Object.entries(resultDigest as Record<string, unknown>)
    .filter(([, v]) => typeof v === 'number') as Array<[string, number]>;

  if (digestEntries.length === 0) return { checked: false, ok: false };

  let mismatches = 0;
  for (const [, dv] of digestEntries) {
    // Check whether dv appears in the flat real numbers (within 1% or exact)
    const found = flatReal.some(rv => {
      if (rv === dv) return true;
      if (Math.abs(dv) < 0.01 && Math.abs(rv) < 0.01) return true; // near-zero
      const rel = Math.abs(rv - dv) / Math.max(Math.abs(dv), 0.001);
      return rel < 0.02; // 2% tolerance
    });
    if (!found) mismatches++;
  }

  return {
    checked: true,
    ok: mismatches === 0,
  };
}

function flattenNumbers(obj: unknown, depth = 0): number[] {
  if (depth > 5) return [];
  if (typeof obj === 'number') return [obj];
  if (Array.isArray(obj)) return obj.flatMap(v => flattenNumbers(v, depth + 1));
  if (typeof obj === 'object' && obj !== null) {
    return Object.values(obj).flatMap(v => flattenNumbers(v, depth + 1));
  }
  return [];
}

// ─────────────────────────────────────────────
// verifyFindings — the core audit logic
// ─────────────────────────────────────────────

/**
 * For each Finding's evidence ToolCall, check whether the ledger
 * contains a matching real call (same prism tool name + matching args subset).
 * Annotates findings in place; returns a VerificationSummary.
 */
export function verifyFindings(
  findings: Finding[],
  ledger: LedgerEntry[],
): {
  annotated: AnnotatedFinding[];
  summary: VerificationSummary;
} {
  // Build a map from Prism tool name → ledger entries for quick lookup
  // Each ledger entry whose Bash command calls tools.cli.ts is indexed by toolName
  type PrismCall = {
    seq: number;
    toolName: string;
    parsedArgs: Record<string, unknown>;
    resultJson: Record<string, unknown> | null;
  };

  const prismCalls: PrismCall[] = [];
  for (const entry of ledger) {
    if (entry.name !== 'Bash') continue;
    const cmd = (entry.input as { command?: string }).command ?? '';

    // Case 1: batch call — tools.cli.ts batch '[{tool,args},...]'
    // Result is a JSON array [{tool,args,ok,result},...] in the same order.
    const batchItems = parseBatchCall(cmd);
    if (batchItems) {
      const batchResults = extractBatchResults(entry.resultText); // array or null
      batchItems.forEach((item, i) => {
        const sub = Array.isArray(batchResults) ? batchResults[i] : null;
        // sub.result is the tool's { data, provenance }; unwrap to match single-call shape
        const resultJson = (sub && typeof sub === 'object' && 'result' in sub)
          ? ((sub as { result?: unknown }).result as Record<string, unknown> | null)
          : null;
        prismCalls.push({
          seq: entry.seq,
          toolName: item.tool,
          parsedArgs: item.args ?? {},
          resultJson,
        });
      });
      continue;
    }

    // Case 2: single call — tools.cli.ts <toolName> '<jsonArgs>'
    const parsed = parseToolsCliCall(cmd);
    if (!parsed) continue;

    let parsedArgs: Record<string, unknown> = {};
    try {
      parsedArgs = JSON.parse(parsed.argsJson);
    } catch { /* leave empty */ }

    const resultJson = extractJsonFromResultText(entry.resultText);

    prismCalls.push({
      seq: entry.seq,
      toolName: parsed.toolName,
      parsedArgs,
      resultJson,
    });
  }

  const annotated: AnnotatedFinding[] = [];
  let totalEvidence = 0;
  let verifiedCount = 0;
  const suspects: Array<{ findingId: string; reason: string }> = [];
  const partiallyVerified: Array<{ findingId: string; reason: string }> = [];

  for (const finding of findings) {
    const annotatedEvidences: AnnotatedEvidence[] = [];
    let findingHasUnverified = false;

    for (const ev of finding.evidence) {
      totalEvidence++;
      // Find a matching prism call in the ledger
      const match = prismCalls.find(pc =>
        pc.toolName === ev.tool &&
        argsSubsetMatch(ev.args, pc.parsedArgs),
      );

      if (!match) {
        annotatedEvidences.push({
          ...ev,
          verified: false,
          digestChecked: false,
          notVerifiedReason: `No ledger call found for tool=${ev.tool} with matching args: ${JSON.stringify(ev.args)}`,
        });
        findingHasUnverified = true;
      } else {
        verifiedCount++;
        // Spot-check digest
        let digestChecked = false;
        let digestOk = false;
        if (match.resultJson) {
          const check = spotCheckDigest(ev.resultDigest, match.resultJson);
          digestChecked = check.checked;
          digestOk = check.ok;
        }

        annotatedEvidences.push({
          ...ev,
          verified: true,
          matchedLedgerSeq: match.seq,
          digestChecked,
          // Note: digest mismatch does NOT flip verified — human reviews suspects
          ...(digestChecked && !digestOk
            ? { notVerifiedReason: 'Digest numbers could not be matched in real result (possible rounding or fabrication — review manually)' }
            : {}),
        });
      }
    }

    // DR-21: only flag as SUSPECT (likely fabrication) when EVERY piece of
    // evidence fails to match the ledger. A finding with some verified evidence
    // stands on that evidence; a single unmatched auxiliary query (often an
    // imprecisely-recalled nested-arg call) is a partial gap, not fabrication.
    const verifiedInFinding = annotatedEvidences.filter(ae => ae.verified).length;
    const allUnverified = verifiedInFinding === 0 && annotatedEvidences.length > 0;
    if (allUnverified) {
      const unverifiedTools = annotatedEvidences
        .map(ae => `${ae.tool}(${JSON.stringify(ae.args)})`)
        .join(', ');
      suspects.push({
        findingId: finding.id,
        reason: `NO evidence matched the ledger (likely fabricated): ${unverifiedTools}`,
      });
    } else if (findingHasUnverified) {
      partiallyVerified.push({
        findingId: finding.id,
        reason: `${verifiedInFinding}/${annotatedEvidences.length} evidence verified; unmatched: ` +
          annotatedEvidences.filter(ae => !ae.verified).map(ae => ae.tool).join(', '),
      });
    }

    annotated.push({
      ...finding,
      evidence: annotatedEvidences,
    });
  }

  const unverifiedCount = totalEvidence - verifiedCount;
  const findingsWithAllEvidenceVerified = annotated.filter(
    f => f.evidence.every(ae => ae.verified),
  ).length;

  return {
    annotated,
    summary: {
      totalFindings: findings.length,
      totalEvidence,
      verifiedEvidence: verifiedCount,
      unverifiedEvidence: unverifiedCount,
      findingsWithAllEvidenceVerified,
      suspects,
      partiallyVerified,
    },
  };
}

// ─────────────────────────────────────────────
// runPrismExplore — main entry point
// ─────────────────────────────────────────────

export async function runPrismExplore(
  opts: RunPrismExploreOpts = {},
): Promise<ExploreRunResult> {
  const source = opts.source ?? 'unity';
  const runId = opts.runId ?? (source === 'perfetto' ? 'bk26b-perfetto-triad' : 'unity-outside-stressmove');
  const config = getConfig();

  // Resolve repo root robustly: this file is at web/server/prism/, so ../../.. from __dirname
  const repoRoot = path.resolve(__dirname, '../../..');

  // Resolve outputDir. Default: archive each run under a timestamped subdir so
  // history is preserved (never overwritten) — serves as corpus / gold-set seed (F4).
  // A stable `latest` copy is also maintained for convenience.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const outputDir = opts.outputDir
    ? path.resolve(repoRoot, opts.outputDir)
    : path.join(repoRoot, 'web', 'data', 'prism-out', runId, stamp);

  // Ensure outputDir exists
  fs.mkdirSync(outputDir, { recursive: true });

  // ★ 预编译 tools.cli.bundle.js（消除每次 tool call 的 tsx 编译开销，~5s/call → ~0.3s/call）
  const toolsCliSrc = path.join(__dirname, 'tools.cli.ts');
  const toolsCliBundle = path.join(__dirname, 'tools.cli.bundle.js');
  try {
    const needRebuild = !fs.existsSync(toolsCliBundle)
      || fs.statSync(toolsCliBundle).mtimeMs < fs.statSync(toolsCliSrc).mtimeMs;
    if (needRebuild) {
      const esbuild = await import('esbuild');
      await esbuild.build({
        entryPoints: [toolsCliSrc],
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: toolsCliBundle,
        external: ['better-sqlite3'],
        logLevel: 'silent',
      });
      console.log('[explore] Rebuilt tools.cli.bundle.js (eliminates tsx startup overhead)');
      opts.onProgress?.('工具预编译完成 (tools.cli.bundle.js)');
    }
  } catch (e: any) {
    console.warn(`[explore] Failed to build tools bundle: ${e.message}. Will fall back to tsx.`);
  }

  const ledgerPath = path.join(outputDir, 'ledger.json');
  const findingsPath = path.join(outputDir, 'findings.json');
  const dataRequestsPath = path.join(outputDir, 'data-requests.json');
  const verdictPath = path.join(outputDir, 'verdict.json');
  const exploreResultPath = path.join(outputDir, 'explore-result.json');

  // Read and substitute prompt template.
  // DR-44 B1: 按 source 路由到不同 explore-prompt（unity / perfetto），复用同一份 spawn+ledger+verify 逻辑。
  const promptFileName = source === 'perfetto'
    ? 'perfetto-explore-prompt.txt'
    : 'unity-explore-prompt.txt';
  const promptTemplatePath = path.join(__dirname, 'prompts', promptFileName);
  if (!fs.existsSync(promptTemplatePath)) {
    return makeError(runId, ledgerPath, findingsPath, `Prompt template not found: ${promptTemplatePath}`);
  }

  let promptText = fs.readFileSync(promptTemplatePath, 'utf-8');
  // Use POSIX (forward-slash) path for OUTPUT_DIR so the LLM's Write calls work cross-platform
  const outputDirPosix = toPosix(outputDir);
  promptText = promptText.replace(/\{\{RUN_ID\}\}/g, runId);
  promptText = promptText.replace(/\{\{OUTPUT_DIR\}\}/g, outputDirPosix);
  // F8: frame-budget verdict basis. Default 16.67ms (60fps) per aoe-watch-spec deviceTier default.
  const frameBudgetMs = opts.frameBudgetMs ?? 16.67;
  const targetFps = Math.round(1000 / frameBudgetMs);
  promptText = promptText.replace(/\{\{FRAME_BUDGET_MS\}\}/g, String(frameBudgetMs));
  promptText = promptText.replace(/\{\{TARGET_FPS\}\}/g, String(targetFps));
  promptText = promptText.replace(/\{\{MEMORY_INJECTION\}\}/g, formatMemoryForPrompt({ dataSource: source }));

  // Resolve CLI
  const provider = opts.cliProvider ?? 'codebuddy';
  const { command: cliCommand, resolved } = resolveCliExecutable(provider, config.cliPaths?.[provider]);

  if (!resolved) {
    return makeError(runId, ledgerPath, findingsPath, cliUnavailableHint(provider));
  }

  const buildArgs = CLI_PROVIDERS[provider];
  if (!buildArgs) {
    return makeError(runId, ledgerPath, findingsPath, `Unknown CLI provider: ${provider}`);
  }
  const args = buildArgs(promptText);

  console.log(`[explore] Spawning ${provider} CLI (${cliCommand})...`);
  console.log(`[explore] runId=${runId}, outputDir=${outputDirPosix}`);
  opts.onProgress?.(`CLI 启动: ${provider} (${cliCommand}), runId=${runId}`);

  const exploreStartTime = Date.now();

  const ledger: LedgerEntry[] = [];
  let toolCallSeq = 0;
  // Pending tool_use entries awaiting their tool_result (matched by position in stream order)
  const pendingToolUses: LedgerEntry[] = [];

  const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000;

  return new Promise<ExploreRunResult>((resolve) => {
    let settled = false;
    let jsonBuffer = '';
    let gracePollHandle: ReturnType<typeof setInterval> | null = null;

    const child = spawnCliProcess(cliCommand, args, {
      cwd: config.skillProjectPath,
      env: { ...process.env, PRISM_RUN_ID: runId },
      windowsHide: true,
      stdio: 'pipe',
    });

    // Pipe the prompt via stdin (Windows .cmd wrappers truncate long prompts
    // passed as positional args; stdin avoids that trap). `-p` with no value
    // makes the CLI read the prompt from stdin.
    child.stdin?.on('error', (e: Error) => {
      // Prevent unhandled 'error' event crash when CLI exits before stdin write completes
      console.error(`[explore] stdin error event: ${e.message}`);
    });
    try {
      child.stdin?.write(promptText);
      child.stdin?.end();
    } catch (e: any) {
      console.error(`[explore] stdin write failed: ${e?.message || e}`);
    }

    const doResolve = (result: ExploreRunResult) => {
      if (!settled) {
        settled = true;
        if (gracePollHandle) clearInterval(gracePollHandle);
        resolve(result);
      }
    };

    /**
     * Try to finalize the explore run from findings.json on disk.
     * Returns true if successfully resolved (findings.json exists and is valid).
     * Shared by the timeout handler (immediate check + grace polling).
     */
    const tryFinalizeFromFindings = (): boolean => {
      try {
        const findingsText = fs.readFileSync(findingsPath, 'utf-8');
        const findings = JSON.parse(findingsText) as Finding[];
        if (!Array.isArray(findings) || findings.length === 0) return false;

        const { annotated, summary } = verifyFindings(findings, ledger);
        let verdict: Record<string, unknown> | null = null;
        try { verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf-8')); } catch { /* optional */ }
        let dataRequests: DataRequest[] = [];
        try { dataRequests = JSON.parse(fs.readFileSync(dataRequestsPath, 'utf-8')); } catch { /* optional */ }
        const result: ExploreRunResult = {
          success: true,
          runId,
          findings,
          dataRequests,
          verdict,
          meta: {
            toolCallCount: toolCallSeq,
            rounds: undefined,
            notes: [`ledger has ${ledger.length} entries`],
          },
          ledgerPath,
          findingsPath,
          verification: summary,
          annotatedFindings: annotated,
        };
        fs.writeFileSync(exploreResultPath, JSON.stringify(result, null, 2), 'utf-8');
        console.log(`[explore] Finalized from findings.json (${findings.length} findings).`);
        doResolve(result);
        return true;
      } catch {
        return false;
      }
    };

    const timeoutHandle = setTimeout(() => {
      // Write whatever ledger we have so far
      writeLedger(ledgerPath, ledger);

      // ★ Immediate check: if findings.json was already written by the LLM,
      // treat as success even though the process hasn't exited yet.
      if (tryFinalizeFromFindings()) {
        console.log('[explore] Timeout fired but findings.json already written. Treating as success.');
        return;
      }

      // ★ Grace polling: the LLM may be seconds away from writing findings.json.
      // Observed: timeout fired at 20min, findings.json written 95s later.
      // Poll every 10s for up to 5 min before giving up. This catches the common
      // case where the LLM is in the final output phase (verdict.json already
      // written) but hasn't finished writing findings.json yet.
      console.log('[explore] Timeout fired, findings.json not yet written. Starting 5-min grace polling...');
      opts.onProgress?.('超时但 LLM 可能在收尾, 轮询等待 findings.json (最多5分钟)...');

      const graceMs = 5 * 60 * 1000;
      const pollMs = 10 * 1000;
      const graceStart = Date.now();

      gracePollHandle = setInterval(() => {
        if (tryFinalizeFromFindings()) {
          // Success — kill the lingering CLI process
          if (child.exitCode === null) {
            try { child.kill(); } catch { /* best effort */ }
          }
          return;
        }
        if (Date.now() - graceStart >= graceMs) {
          // Grace period expired — force-kill the process tree and return error
          if (child.exitCode === null) {
            try {
              if (process.platform === 'win32') {
                spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)]);
              } else {
                child.kill('SIGTERM');
              }
            } catch { /* best effort */ }
          }
          doResolve(makeError(runId, ledgerPath, findingsPath,
            `Exploration timed out after ${timeoutMs}ms (+5min grace polling, findings.json never appeared)`));
        }
      }, pollMs);
    }, timeoutMs);

    child.stdout?.on('data', (data: Buffer) => {
      jsonBuffer += data.toString();
      const lines = jsonBuffer.split('\n');
      jsonBuffer = lines.pop() || '';
      // ★ 存 raw stream 到文件（供离线 profile 调优）
      const rawStreamPath = path.join(outputDir, 'explore-raw-stream.jsonl');
      // ★ 实时推送: 检测 tool_use 事件，解析出具体 Prism 工具名
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try { fs.appendFileSync(rawStreamPath, trimmed + '\n'); } catch { /* best effort */ }
        try {
          const evt = JSON.parse(trimmed);
          if (evt.type === 'tool_use' && evt.name) {
            const elapsed = Math.round((Date.now() - exploreStartTime) / 1000);
            let toolDetail = evt.name;
            if (evt.name === 'Bash' && evt.input?.command) {
              const cmd = String(evt.input.command);
              // 从 batch 命令中提取 Prism 工具名
              const toolNames = [...cmd.matchAll(/"tool"\s*:\s*"(\w+)"/g)].map(m => m[1]);
              if (toolNames.length > 0) {
                toolDetail = toolNames.length <= 3
                  ? toolNames.join('+')
                  : `${toolNames.slice(0, 2).join('+')}…+${toolNames.length - 2}`;
              } else {
                const singleMatch = cmd.match(/tools\.cli\.ts\s+(\w+)/);
                if (singleMatch) toolDetail = singleMatch[1];
              }
            } else if (evt.name === 'Write') {
              const fp = String(evt.input?.file_path || evt.input?.filePath || '');
              toolDetail = `Write ${fp.split('/').pop()}`;
            }
            opts.onProgress?.(`#${ledger.length + 1} 调用 ${toolDetail} (${elapsed}s)`);
          }
        } catch { /* 非 JSON 行, 忽略 */ }
      }

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(trimmed);
        } catch {
          // Non-JSON line — log it but continue
          console.log(`[explore:raw] ${trimmed.slice(0, 200)}`);
          continue;
        }

        handleExploreStreamEvent(event, ledger, pendingToolUses, (seq, name, input) => {
          toolCallSeq = seq;
          console.log(`[explore:tool #${seq}] ${name}: ${JSON.stringify(input).slice(0, 180)}`);
        });
      }
    });

    child.stderr?.on('data', (data: Buffer) => {
      const text = data.toString().trim();
      if (text) {
        console.error(`[explore:stderr] ${text.slice(0, 300)}`);
        opts.onProgress?.(`[stderr] ${text.slice(0, 120)}`);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutHandle);
      writeLedger(ledgerPath, ledger);
      doResolve(makeError(runId, ledgerPath, findingsPath, `CLI spawn error: ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timeoutHandle);
      writeLedger(ledgerPath, ledger);

      if (code !== 0) {
        doResolve(makeError(runId, ledgerPath, findingsPath, `CLI exited with code ${code}`));
        return;
      }

      // Read findings.json and data-requests.json written by the LLM
      let findings: Finding[];
      let dataRequests: DataRequest[];

      try {
        const findingsText = fs.readFileSync(findingsPath, 'utf-8');
        findings = JSON.parse(findingsText) as Finding[];
      } catch (e) {
        doResolve(makeError(runId, ledgerPath, findingsPath,
          `Failed to read/parse findings.json: ${(e as Error).message}. ` +
          `The LLM may not have written the file or wrote invalid JSON.`));
        return;
      }

      try {
        const drText = fs.readFileSync(dataRequestsPath, 'utf-8');
        dataRequests = JSON.parse(drText) as DataRequest[];
      } catch {
        // data-requests.json is optional — default to empty
        dataRequests = [];
        console.warn('[explore] data-requests.json missing or invalid; defaulting to []');
      }

      // Read verdict.json (F8 overall verdict) — optional
      let verdict: Record<string, unknown> | null = null;
      try {
        verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf-8')) as Record<string, unknown>;
      } catch {
        console.warn('[explore] verdict.json missing or invalid; verdict = null');
      }

      // Verify evidence
      const { annotated, summary } = verifyFindings(findings, ledger);

      const result: ExploreRunResult = {
        success: true,
        runId,
        findings,
        dataRequests,
        verdict,
        meta: {
          toolCallCount: toolCallSeq,
          rounds: undefined,
          notes: [`ledger has ${ledger.length} entries`],
        },
        ledgerPath,
        findingsPath,
        verification: summary,
        annotatedFindings: annotated,
      };

      // Write explore-result.json for inspection
      fs.writeFileSync(exploreResultPath, JSON.stringify(result, null, 2), 'utf-8');
      console.log(`[explore] Done. findings=${findings.length} dataRequests=${dataRequests.length} toolCalls=${toolCallSeq}`);
      console.log(`[explore] Verification: verified=${summary.verifiedEvidence}/${summary.totalEvidence} suspects=${summary.suspects.length}`);

      // BK-3: auto-aggregate DataRequests into the pool (capability loop auto-turns).
      // Fire-and-forget; failure here must not fail the exploration.
      try {
        const collector = path.join(repoRoot, 'web', 'server', 'prism', 'collect-datarequests.ts');
        const child = spawn(process.execPath, ['--import', 'tsx', collector], {
          cwd: path.join(repoRoot, 'web'), stdio: 'ignore', windowsHide: true, detached: false,
        });
        child.on('error', () => { /* ignore */ });
      } catch { /* ignore */ }

      // M3-C: sediment DataRequests into persistent brain capabilities/ (incremental, never clear).
      try {
        const persisted = persistDataRequestsToMemory(dataRequests, { runId, dataSource: source });
        if (persisted > 0) {
          console.log(`[explore] Persisted ${persisted} DataRequest(s) to capabilities memory`);
        }
      } catch (e) {
        console.warn(`[explore] Failed to persist DataRequests to memory: ${(e as Error).message}`);
      }

      doResolve(result);
    });
  });
}

// ─────────────────────────────────────────────
// Stream-json event handler
// ─────────────────────────────────────────────

function handleExploreStreamEvent(
  event: Record<string, unknown>,
  ledger: LedgerEntry[],
  pendingToolUses: LedgerEntry[],
  onToolUse: (seq: number, name: string, input: Record<string, unknown>) => void,
): void {
  const type = event.type as string;

  if (type === 'assistant') {
    const content = (event.message as Record<string, unknown>)?.content as unknown[];
    if (!Array.isArray(content)) return;

    for (const block of content) {
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_use') {
        const seq = ledger.length + 1;
        const name = (b.name as string) ?? 'unknown';
        const input = (b.input as Record<string, unknown>) ?? {};

        const entry: LedgerEntry = { seq, name, input, resultText: '', ts: Date.now() };
        ledger.push(entry);
        pendingToolUses.push(entry);

        onToolUse(seq, name, input);
      }
    }
  }

  if (type === 'user') {
    const content = (event.message as Record<string, unknown>)?.content as unknown[];
    if (!Array.isArray(content)) return;

    for (const item of content) {
      const r = item as Record<string, unknown>;
      if (r.type === 'tool_result') {
        const textContent = (r.content as unknown[])?.[0] as Record<string, unknown> | undefined;
        const text = (textContent?.text as string) ?? '';
        // Attach to the oldest unresolved tool_use
        const pending = pendingToolUses.shift();
        if (pending) {
          pending.resultText = text;
          pending.resultTs = Date.now();
        }
      }
    }
  }
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function writeLedger(ledgerPath: string, ledger: LedgerEntry[]): void {
  try {
    fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), 'utf-8');
  } catch (e) {
    console.error(`[explore] Failed to write ledger: ${(e as Error).message}`);
  }
}

function makeError(
  runId: string,
  ledgerPath: string,
  findingsPath: string,
  error: string,
): ExploreRunResult {
  return {
    success: false,
    error,
    runId,
    findings: [],
    dataRequests: [],
    meta: { toolCallCount: 0 },
    ledgerPath,
    findingsPath,
    verification: {
      totalFindings: 0,
      totalEvidence: 0,
      verifiedEvidence: 0,
      unverifiedEvidence: 0,
      findingsWithAllEvidenceVerified: 0,
      suspects: [],
    },
  };
}
