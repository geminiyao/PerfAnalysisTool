/**
 * collect-datarequests.ts — 能力回路自动化（BK-3 / DR-28）
 *
 * 扫描所有归档探索 run 的 data-requests.json，自动汇总进一个机器可读的需求池
 * （web/data/prism-datarequests-pool.json），并再生成人读的 markdown 视图
 * （web/data/prism-datarequests-auto.md，运行时产物，不进 docs/）。
 *
 * 治的病：此前 data-requests 靠 Claude 手搬进 docs/prism/plan/datarequests.md，
 * "能力回路没自动转"——高频复现的需求会飘走。现在自动累积 + 统计复现次数，
 * 高频的自然浮到顶部，成为"下一个该造什么工具/改什么采集"的数据驱动依据（Charter F4）。
 *
 * 用法：node --import tsx server/prism/collect-datarequests.ts [--run-root <dir>]
 * 每次探索结束后自动调用（见 explore-service），也可手动跑做全量重扫。
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

interface RawDataRequest {
  id?: string;
  // LLM 可能用不同字段名（DR-23 遗留），全兼容
  want?: string; request?: string;
  rationale?: string; reason?: string; hypothesisToTest?: string;
  suspectedAxis?: string; closestExistingTool?: string;
  [k: string]: unknown;
}

interface PoolEntry {
  key: string;              // 归一化去重键
  title: string;            // 代表性描述（首次见到的）
  rationale: string;
  suspectedAxis?: string;
  recurrence: number;       // 复现次数（跨 run）
  firstSeenRun: string;
  lastSeenRun: string;
  seenInRuns: string[];
  status: 'open' | 'in-progress' | 'done' | 'wontfix';
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function getFlag(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

/** 归一化标题为去重键：取中文/英文关键词，去数字/标点/空格，小写 */
function normalizeKey(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/frames?\s*\d+[-\d,\s]*/g, '')   // 去掉 "frames 462-481" 这类具体帧号
    .replace(/\d+(\.\d+)?(ms|kb|mb|%|字节)?/g, '') // 去掉数字+单位
    .replace(/[^一-龥a-z]/g, '')       // 只留中英文字
    .slice(0, 40);
}

function titleOf(r: RawDataRequest): string {
  return (r.want ?? r.request ?? '').trim() || '(无描述)';
}
function rationaleOf(r: RawDataRequest): string {
  return (r.rationale ?? r.reason ?? r.hypothesisToTest ?? '').trim();
}

function findAllDataRequests(runRoot: string): Array<{ run: string; reqs: RawDataRequest[] }> {
  const out: Array<{ run: string; reqs: RawDataRequest[] }> = [];
  if (!fs.existsSync(runRoot)) return out;
  // 递归找所有 data-requests.json
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name === 'data-requests.json') {
        try {
          const reqs = JSON.parse(fs.readFileSync(full, 'utf-8'));
          if (Array.isArray(reqs) && reqs.length) {
            // run 标识 = 相对 runRoot 的父目录路径
            const runLabel = path.relative(runRoot, path.dirname(full)) || path.basename(path.dirname(full));
            out.push({ run: runLabel, reqs });
          }
        } catch { /* skip malformed */ }
      }
    }
  };
  walk(runRoot);
  return out;
}

function main(): void {
  const runRoot = getFlag('--run-root') ?? path.join(repoRoot, 'web', 'data', 'prism-out');
  const poolPath = path.join(repoRoot, 'web', 'data', 'prism-datarequests-pool.json');
  const mdPath = path.join(repoRoot, 'web', 'data', 'prism-datarequests-auto.md');

  // 载入已有 pool（保留人工设的 status）
  let pool: Record<string, PoolEntry> = {};
  if (fs.existsSync(poolPath)) {
    try { pool = JSON.parse(fs.readFileSync(poolPath, 'utf-8')); } catch { pool = {}; }
  }

  const all = findAllDataRequests(runRoot);
  // 按 run 名排序，保证 firstSeen 稳定
  all.sort((a, b) => a.run.localeCompare(b.run));

  for (const { run, reqs } of all) {
    for (const r of reqs) {
      const title = titleOf(r);
      if (title === '(无描述)') continue;
      const key = normalizeKey(title);
      if (!key) continue;
      if (!pool[key]) {
        pool[key] = {
          key, title,
          rationale: rationaleOf(r),
          suspectedAxis: r.suspectedAxis,
          recurrence: 0,
          firstSeenRun: run,
          lastSeenRun: run,
          seenInRuns: [],
          status: 'open',
        };
      }
      const e = pool[key];
      if (!e.seenInRuns.includes(run)) {
        e.seenInRuns.push(run);
        e.recurrence = e.seenInRuns.length;
        e.lastSeenRun = run;
      }
    }
  }

  fs.writeFileSync(poolPath, JSON.stringify(pool, null, 2), 'utf-8');

  // 生成人读 markdown：按复现次数降序（高频 = 优先固化）
  const entries = Object.values(pool).sort((a, b) => b.recurrence - a.recurrence);
  const L: string[] = [];
  L.push('# Prism 数据需求池（自动汇总）');
  L.push('');
  L.push('> 由 `collect-datarequests.ts` 自动扫描所有探索 run 的 data-requests.json 生成（BK-3 能力回路自动化）。');
  L.push('> 按**跨 run 复现次数**降序——复现越多，越该优先固化为新工具/新采集字段（Charter F4）。');
  L.push('> 人工语义整理与实施路径见 `docs/prism/plan/datarequests.md`（本文件是原始自动汇总，不手改）。');
  L.push('');
  L.push(`共 ${entries.length} 条唯一需求，来自 ${all.length} 次探索。`);
  L.push('');
  L.push('| 复现 | 需求 | 轴 | 状态 | 首见 |');
  L.push('|---|---|---|---|---|');
  for (const e of entries) {
    const t = e.title.length > 60 ? e.title.slice(0, 60) + '…' : e.title;
    L.push(`| ${e.recurrence}× | ${t} | ${e.suspectedAxis ?? '-'} | ${e.status} | ${e.firstSeenRun} |`);
  }
  L.push('');
  fs.writeFileSync(mdPath, L.join('\n'), 'utf-8');

  console.log(`需求池已更新：${entries.length} 条唯一需求（来自 ${all.length} 次探索）`);
  console.log(`  机器可读：${poolPath}`);
  console.log(`  人读视图：${mdPath}`);
  const top = entries.filter(e => e.recurrence >= 2);
  if (top.length) {
    console.log(`  ⚠️ 高频复现（≥2次，建议优先固化）：`);
    top.forEach(e => console.log(`    ${e.recurrence}× ${e.title.slice(0, 55)}`));
  }
}

main();
