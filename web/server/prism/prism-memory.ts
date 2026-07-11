/**
 * prism-memory.ts — M3-A 持久大脑存取接口
 *
 * 配置驱动的分类注册表 + 文件系统持久化（md 条目，人可读可手改）。
 * 注入(M3-B) / 沉淀(M3-C) 不在本模块，仅提供 load / append 原语。
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export type MemoryCategory = string;

export interface MemoryEntry {
  id: string;
  category: MemoryCategory;
  content: string;
  source?: string;
  createdAt: string;
  [k: string]: unknown;
}

export interface MemoryCategoryConfig {
  name: MemoryCategory;
  dir: string;
  enabled: boolean;
  description: string;
}

/** 分类注册表：加新类只改这里，不动读写逻辑 */
export const MEMORY_CATEGORIES: MemoryCategoryConfig[] = [
  {
    name: 'priors',
    dir: 'priors',
    enabled: true,
    description: '先验知识（人工种子，如 Unity/AOE 分析知识）',
  },
  {
    name: 'knowledge',
    dir: 'knowledge',
    enabled: true,
    description: '知识回路（run 确认的业务归因 findings）',
  },
  {
    name: 'capabilities',
    dir: 'capabilities',
    enabled: true,
    description: '能力回路（DataRequest 池高频项）',
  },
  {
    name: 'lessons',
    dir: 'lessons',
    enabled: true,
    description: '质量回路（对错教训，依赖金标 BK-4）',
  },
];

export interface LoadMemoryOptions {
  /** 只加载指定分类；未指定时加载所有 enabled 分类 */
  categories?: MemoryCategory[];
  /** 覆盖默认存储根目录（单测用） */
  root?: string;
}

export interface AppendMemoryOptions {
  /** 覆盖默认存储根目录（单测用） */
  root?: string;
}

interface MemoryIndex {
  version: number;
  updatedAt: string;
  categories: Record<string, { count: number; lastUpdated: string | null }>;
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MEMORY_ROOT = path.join(MODULE_DIR, 'prism-memory');

function getMemoryRoot(opts?: { root?: string }): string {
  return opts?.root ?? DEFAULT_MEMORY_ROOT;
}

function getCategoryConfig(name: MemoryCategory): MemoryCategoryConfig | undefined {
  return MEMORY_CATEGORIES.find((c) => c.name === name);
}

function categoryDir(root: string, config: MemoryCategoryConfig): string {
  return path.join(root, config.dir);
}

function ensureCategoryDir(root: string, config: MemoryCategoryConfig): void {
  const dir = categoryDir(root, config);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function parseFrontmatter(raw: string): { meta: Record<string, unknown>; content: string } {
  const trimmed = raw.replace(/^\uFEFF/, '').trimStart();
  if (!trimmed.startsWith('---')) {
    return { meta: {}, content: trimmed };
  }
  const end = trimmed.indexOf('---', 3);
  if (end === -1) {
    return { meta: {}, content: trimmed };
  }
  const header = trimmed.slice(3, end).trim();
  const content = trimmed.slice(end + 3).trimStart();
  const meta: Record<string, unknown> = {};
  for (const line of header.split('\n')) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value: unknown = line.slice(colon + 1).trim();
    if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, content };
}

function serializeEntry(entry: MemoryEntry): string {
  const lines = [
    '---',
    `id: ${entry.id}`,
    `category: ${entry.category}`,
    `createdAt: ${entry.createdAt}`,
  ];
  if (entry.source) {
    lines.push(`source: ${entry.source}`);
  }
  for (const [key, value] of Object.entries(entry)) {
    if (['id', 'category', 'content', 'createdAt', 'source'].includes(key)) continue;
    if (value === undefined) continue;
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push('---', '', entry.content);
  return lines.join('\n');
}

function entryFromFile(category: MemoryCategory, filePath: string): MemoryEntry | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const { meta, content } = parseFrontmatter(raw);
    const id = String(meta.id ?? path.basename(filePath, '.md'));
    const createdAt = String(meta.createdAt ?? new Date(0).toISOString());
    const source = meta.source !== undefined ? String(meta.source) : undefined;
    const entry: MemoryEntry = {
      id,
      category: String(meta.category ?? category),
      content,
      createdAt,
    };
    if (source) entry.source = source;
    for (const [key, value] of Object.entries(meta)) {
      if (['id', 'category', 'createdAt', 'source'].includes(key)) continue;
      entry[key] = value;
    }
    return entry;
  } catch {
    return null;
  }
}

function loadEntriesForCategory(
  root: string,
  config: MemoryCategoryConfig,
): MemoryEntry[] {
  const dir = categoryDir(root, config);
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries: MemoryEntry[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md') || name === 'README.md') continue;
    const filePath = path.join(dir, name);
    if (!fs.statSync(filePath).isFile()) continue;
    const entry = entryFromFile(config.name, filePath);
    if (entry) entries.push(entry);
  }
  entries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return entries;
}

function readIndex(root: string): MemoryIndex {
  const indexPath = path.join(root, 'index.json');
  if (!fs.existsSync(indexPath)) {
    return buildIndexFromDisk(root);
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as MemoryIndex;
    return parsed;
  } catch {
    return buildIndexFromDisk(root);
  }
}

function buildIndexFromDisk(root: string): MemoryIndex {
  const categories: MemoryIndex['categories'] = {};
  for (const config of MEMORY_CATEGORIES) {
    const entries = loadEntriesForCategory(root, config);
    const lastUpdated =
      entries.length > 0 ? entries[entries.length - 1]!.createdAt : null;
    categories[config.name] = { count: entries.length, lastUpdated };
  }
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    categories,
  };
}

function writeIndex(root: string): void {
  const index = buildIndexFromDisk(root);
  index.updatedAt = new Date().toISOString();
  const indexPath = path.join(root, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
}

function resolveCategoriesToLoad(opts?: LoadMemoryOptions): MemoryCategoryConfig[] {
  const requested = opts?.categories;
  if (requested && requested.length > 0) {
    return requested
      .map((name) => getCategoryConfig(name))
      .filter((c): c is MemoryCategoryConfig => c !== undefined);
  }
  return MEMORY_CATEGORIES.filter((c) => c.enabled);
}

/** 读大脑；可按分类筛选、可只读启用的分类 */
export function loadMemory(opts?: LoadMemoryOptions): {
  entries: MemoryEntry[];
  byCategory: Record<string, MemoryEntry[]>;
} {
  const root = getMemoryRoot(opts);
  const configs = resolveCategoriesToLoad(opts);
  const byCategory: Record<string, MemoryEntry[]> = {};
  const entries: MemoryEntry[] = [];

  for (const config of configs) {
    const catEntries = loadEntriesForCategory(root, config);
    byCategory[config.name] = catEntries;
    entries.push(...catEntries);
  }

  return { entries, byCategory };
}

/** 追加一条并持久化 */
export function appendMemory(
  category: MemoryCategory,
  entry: Omit<MemoryEntry, 'category' | 'createdAt'> & { createdAt?: string },
  opts?: AppendMemoryOptions,
): MemoryEntry {
  const config = getCategoryConfig(category);
  if (!config) {
    throw new Error(`Unknown memory category: ${category}`);
  }

  const root = getMemoryRoot(opts);
  ensureCategoryDir(root, config);

  const fullEntry: MemoryEntry = {
    ...entry,
    category,
    createdAt: entry.createdAt ?? new Date().toISOString(),
  };

  const safeId = fullEntry.id.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(categoryDir(root, config), `${safeId}.md`);
  fs.writeFileSync(filePath, serializeEntry(fullEntry), 'utf8');
  writeIndex(root);

  return fullEntry;
}

/** 读取 index.json 概览（缺文件时从磁盘重建，不抛错） */
export function loadMemoryIndex(opts?: { root?: string }): MemoryIndex {
  const root = getMemoryRoot(opts);
  return readIndex(root);
}

/**
 * 按 source 清除某分类下该来源的所有旧条目（返回删除条数）。
 * 用于"整篇重摄入"场景（如先验知识 md 重新清洗）——先清旧、再写新，避免 LLM 切分 id 不稳定导致的重复堆积。
 * ⚠️ 仅用于整源覆盖；三回路增量沉淀绝不能用此清空（会丢历史）。
 */
export function clearBySource(
  category: MemoryCategory,
  source: string,
  opts?: { root?: string },
): number {
  const config = getCategoryConfig(category);
  if (!config) throw new Error(`Unknown memory category: ${category}`);
  const root = getMemoryRoot(opts);
  const dir = categoryDir(root, config);
  if (!fs.existsSync(dir)) return 0;

  let removed = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.md') || name === 'README.md') continue;
    const filePath = path.join(dir, name);
    if (!fs.statSync(filePath).isFile()) continue;
    const entry = entryFromFile(config.name, filePath);
    if (entry && entry.source === source) {
      fs.unlinkSync(filePath);
      removed++;
    }
  }
  if (removed > 0) writeIndex(root);
  return removed;
}
