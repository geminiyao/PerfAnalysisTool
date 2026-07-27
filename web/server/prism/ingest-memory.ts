/**
 * ingest-memory.ts — M3 知识摄入管线（脚本 + LLM）
 *
 * 读源文本 → LLM 清洗切条 → appendMemory 入库。
 * 通用设计：sourcePath + category 参数化，本单先验知识，未来 findings 等复用同入口。
 */
import * as fs from 'fs';
import * as path from 'path';
import type { ChildProcess } from 'child_process';
import { getConfig } from '../utils/config.js';
import {
  defaultCliProvider,
  resolveCliExecutable,
  spawnCliProcess,
  cliUnavailableHint,
} from '../utils/cli-resolver.js';
import type { CliProvider } from '../../shared/types.js';
import { appendMemory, clearBySource, loadMemory, type MemoryEntry, type MemoryDataSource, isValidDataSource } from './prism-memory.js';

/** LLM 清洗后单条知识 */
export interface IngestKnowledgeItem {
  id: string;
  title: string;
  content: string;
  tags?: string[];
}

export type LlmRunner = (prompt: string) => Promise<string>;

export interface IngestSourceOptions {
  sourcePath: string;
  category: string;
  /** 稳定 id 前缀与 source 字段；默认取源文件名（无扩展名） */
  sourceLabel?: string;
  /** 可选额外提示（如强调某段业务上下文） */
  hints?: string;
  /** 注入 mock / 真实 LLM；缺省走 CLI */
  llmRunner?: LlmRunner;
  /** 覆盖 prism-memory 根目录（单测用） */
  root?: string;
  cliProvider?: CliProvider;
  /** 整篇重摄入：写入前先清除该 source 的旧条目（防 LLM 切分 id 不稳定导致重复堆积）。仅用于整源覆盖场景（如先验知识 md），三回路增量沉淀绝不可用。 */
  replaceSource?: boolean;
  /**
   * 数据源标识（WT-040）：写入条目的 dataSource frontmatter。
   * 取值：perfetto / unity / simpleperf / cross-source。
   * 缺省不写 dataSource 字段（兼容期旧条目，所有数据源都注入）。
   */
  dataSource?: MemoryDataSource;
}

export interface IngestSourceResult {
  success: boolean;
  count: number;
  entries: MemoryEntry[];
  error?: string;
}

const INGEST_CLI_ARGS: Record<string, string[]> = {
  codebuddy: ['-p', '--output-format', 'stream-json', '-y'],
  claude: ['-p', '--output-format', 'stream-json'],
};

/** 构造清洗 prompt：切条、剔冗余、严格 JSON 输出 */
export function buildIngestPrompt(
  sourceText: string,
  sourceLabel: string,
  hints?: string,
): string {
  const hintBlock = hints ? `\n额外提示：${hints}\n` : '';
  return `你是 Prism 持久大脑的知识清洗助手。请阅读以下原始文档，将其整理为一条条独立、自包含的知识点。

要求：
1. 每条知识点只讲一个点，能单独被检索和注入 prompt。
2. 剔除客套话、过渡句和重复表述；保留技术事实与业务规律。
3. 不要杜撰原文没有的内容；忠于原文，不做自由发挥或补充新结论。
4. 每条 id 必须稳定可复现：格式为 "${sourceLabel}-<语义slug>" 或 "${sourceLabel}-<序号>"（如 ${sourceLabel}-playerloop-tree）。
5. title 为一句话标题；content 为正文（可含 markdown 列表/代码块，但每条自包含）。
6. tags 可选，字符串数组。

${hintBlock}
源标签（sourceLabel）：${sourceLabel}

原始文档：
---
${sourceText}
---

请只输出一个 JSON 数组，不要任何解释或 markdown 围栏外文字。格式：
[
  { "id": "${sourceLabel}-example-slug", "title": "...", "content": "...", "tags": ["..."] }
]`;
}

/** 从 LLM 原始文本中提取 JSON 数组；失败返回 null */
export function parseKnowledgeJson(raw: string): IngestKnowledgeItem[] | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const attempts: string[] = [trimmed];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push(fenced[1].trim());

  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start >= 0 && end > start) {
    attempts.push(trimmed.slice(start, end + 1));
  }

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (!Array.isArray(parsed)) continue;
      const items: IngestKnowledgeItem[] = [];
      for (const row of parsed) {
        if (!row || typeof row !== 'object') continue;
        const r = row as Record<string, unknown>;
        const id = String(r.id ?? '').trim();
        const title = String(r.title ?? '').trim();
        const content = String(r.content ?? '').trim();
        if (!id || !content) continue;
        const item: IngestKnowledgeItem = { id, title: title || id, content };
        if (Array.isArray(r.tags)) {
          item.tags = r.tags.map((t) => String(t));
        }
        items.push(item);
      }
      if (items.length > 0) return items;
    } catch {
      // try next candidate
    }
  }
  return null;
}

/** 从 stream-json stdout 拼出 assistant 文本 */
export function extractTextFromStreamJson(stdout: string): string {
  let text = '';
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      text += trimmed + '\n';
      continue;
    }
    if (event.type === 'assistant') {
      const content = (event.message as Record<string, unknown> | undefined)?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          const b = block as Record<string, unknown>;
          if (b.type === 'text' && typeof b.text === 'string') {
            text += b.text;
          }
        }
      }
    }
    if (event.type === 'result' && event.subtype === 'success' && typeof event.result === 'string') {
      if (!text) text = event.result;
    }
  }
  return text.trim();
}

function normalizeItemId(id: string, sourceLabel: string, index: number): string {
  const slug = id.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (slug.startsWith(`${sourceLabel}-`) || slug.startsWith(`${sourceLabel}_`)) {
    return slug;
  }
  if (slug.startsWith(sourceLabel)) {
    return slug;
  }
  return `${sourceLabel}-${slug || String(index + 1).padStart(3, '0')}`;
}

function deriveSourceLabel(sourcePath: string, explicit?: string): string {
  if (explicit) return explicit;
  return path.basename(sourcePath, path.extname(sourcePath));
}

/** 默认 LLM：spawn CLI，prompt 走 stdin */
export async function defaultLlmRunner(
  prompt: string,
  opts?: { cliProvider?: CliProvider; timeoutMs?: number },
): Promise<string> {
  const config = getConfig();
  const provider = opts?.cliProvider ?? defaultCliProvider(config.cliPaths);
  if (provider === 'mock') {
    throw new Error('CLI mock provider cannot run real ingestion; inject llmRunner for tests.');
  }

  const { command, resolved } = resolveCliExecutable(provider, config.cliPaths?.[provider]);
  if (!resolved) {
    throw new Error(cliUnavailableHint(provider));
  }

  const args = INGEST_CLI_ARGS[provider];
  if (!args) {
    throw new Error(`Unknown CLI provider: ${provider}`);
  }

  const timeoutMs = opts?.timeoutMs ?? 10 * 60 * 1000;

  return new Promise<string>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const child: ChildProcess = spawnCliProcess(command, args, {
      cwd: config.skillProjectPath,
      env: process.env,
      windowsHide: true,
      stdio: 'pipe',
    });

    try {
      child.stdin?.write(prompt);
      child.stdin?.end();
    } catch (e) {
      reject(e);
      return;
    }

    const finish = (err?: Error, result?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(result ?? '');
    };

    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGTERM');
      finish(new Error(`LLM ingestion timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err) => finish(err));
    child.on('close', (code) => {
      if (code !== 0) {
        finish(new Error(`CLI exit ${code}${stderr ? `: ${stderr.slice(0, 300)}` : ''}`));
        return;
      }
      finish(undefined, extractTextFromStreamJson(stdout) || stdout);
    });
  });
}

/** 读源 → LLM 清洗 → 逐条 appendMemory（同 id 覆盖） */
export async function ingestSource(opts: IngestSourceOptions): Promise<IngestSourceResult> {
  const sourcePath = path.resolve(opts.sourcePath);
  if (!fs.existsSync(sourcePath)) {
    return { success: false, count: 0, entries: [], error: `Source not found: ${sourcePath}` };
  }

  const sourceLabel = deriveSourceLabel(sourcePath, opts.sourceLabel);
  const sourceText = fs.readFileSync(sourcePath, 'utf8');
  const prompt = buildIngestPrompt(sourceText, sourceLabel, opts.hints);
  const runner = opts.llmRunner ?? ((p) => defaultLlmRunner(p, { cliProvider: opts.cliProvider }));

  let rawResponse: string;
  try {
    rawResponse = await runner(prompt);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, count: 0, entries: [], error: `LLM call failed: ${msg}` };
  }

  const items = parseKnowledgeJson(rawResponse);
  if (!items || items.length === 0) {
    return {
      success: false,
      count: 0,
      entries: [],
      error: 'LLM returned no parseable knowledge items (invalid or empty JSON)',
    };
  }

  const saved: MemoryEntry[] = [];
  // 整篇重摄入：先清该 source 旧条目，避免 LLM 切分 id 不稳定造成重复堆积
  if (opts.replaceSource) {
    clearBySource(opts.category, sourceLabel, { root: opts.root });
  }
  items.forEach((item, index) => {
    const id = normalizeItemId(item.id, sourceLabel, index);
    const entry = appendMemory(
      opts.category,
      {
        id,
        content: item.content,
        source: sourceLabel,
        title: item.title,
        ...(item.tags?.length ? { tags: item.tags } : {}),
        ...(opts.dataSource ? { dataSource: opts.dataSource } : {}),
      },
      { root: opts.root },
    );
    saved.push(entry);
  });

  return { success: true, count: saved.length, entries: saved };
}

/**
 * TODO(M3-feedback-loop): 人工反馈闭环接入点（WT-006 不实现）。
 * 未来从此函数接入：读取已有条目 + 人工建议 → LLM 消化 → appendMemory 更新同 id。
 */
export interface HumanFeedbackIngestHook {
  entryId: string;
  feedback: string;
  category: string;
}

export async function applyHumanFeedback(_hook: HumanFeedbackIngestHook): Promise<never> {
  throw new Error('Human feedback ingestion not implemented; see HumanFeedbackIngestHook TODO in ingest-memory.ts');
}

// ─── CLI ─────────────────────────────────────────────────────────

function parseCliArgs(argv: string[]): {
  source?: string;
  category?: string;
  label?: string;
  hints?: string;
  provider?: CliProvider;
  replaceSource?: boolean;
  dataSource?: MemoryDataSource;
} {
  const out: ReturnType<typeof parseCliArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--source' && next) {
      out.source = next;
      i++;
    } else if (a === '--category' && next) {
      out.category = next;
      i++;
    } else if (a === '--label' && next) {
      out.label = next;
      i++;
    } else if (a === '--hints' && next) {
      out.hints = next;
      i++;
    } else if (a === '--provider' && next) {
      out.provider = next as CliProvider;
      i++;
    } else if (a === '--replace-source') {
      out.replaceSource = true;
    } else if (a === '--data-source' && next) {
      if (!isValidDataSource(next)) {
        throw new Error(
          `Invalid --data-source value: ${next}. Must be one of: perfetto, unity, simpleperf, cross-source`,
        );
      }
      out.dataSource = next;
      i++;
    }
  }
  return out;
}

async function main(): Promise<void> {
  let args;
  try {
    args = parseCliArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`[ingest] ${(e as Error).message}`);
    process.exit(1);
  }
  if (!args.source || !args.category) {
    console.error('Usage: npx tsx server/prism/ingest-memory.ts --source <path> --category <cat> [--label <slug>] [--hints <text>] [--replace-source] [--data-source perfetto|unity|simpleperf|cross-source]');
    process.exit(1);
  }

  console.log(`[ingest] source=${args.source} category=${args.category} label=${args.label ?? '(auto)'} replaceSource=${args.replaceSource ?? false} dataSource=${args.dataSource ?? '(none)'}`);
  const result = await ingestSource({
    sourcePath: args.source,
    category: args.category,
    sourceLabel: args.label,
    hints: args.hints,
    replaceSource: args.replaceSource,
    cliProvider: args.provider,
    dataSource: args.dataSource,
  });

  if (!result.success) {
    console.error(`[ingest] FAILED: ${result.error}`);
    process.exit(1);
  }

  const loaded = loadMemory({ categories: [args.category] });
  console.log(`[ingest] OK: wrote ${result.count} entries; category total=${loaded.byCategory[args.category]?.length ?? 0}`);
  for (const e of result.entries) {
    console.log(`  - ${e.id}: ${String((e as Record<string, unknown>).title ?? e.content.slice(0, 60))}`);
  }
}

const entry = process.argv[1] ?? '';
const isDirectRun = /ingest-memory\.(ts|js)$/.test(entry);
if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
