// cross-source-correlate.ts — 跨源综合分析的【确定性关联层】(framework §6 的 ②: 算指标在代码)。
//
// 读一个【多源 Run】(runs + run_metrics + detailJson), 把三源关键数按主题汇成一份
// "证据 digest" JSON, 供 cross-source-analysis skill (③ 解读) 写综合报告时引用——
// 避免让 AI 重新从原始结构里翻数 / 编造。本脚本只【汇集与对齐】, 不下结论。
//
// 用法: tsx server/scripts/cross-source-correlate.ts --run-id <id> [--out <digest.json>]
//
// 依据: docs/analysis-framework-design.md §2.1/§6, docs/report-spec-and-data-contract.md §0/§5.4。

import fs from 'fs';
import path from 'path';
import { buildCrossSourceDigest } from '../services/cross-source-digest.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined;
}

function main(): void {
  const runId = arg('run-id');
  if (!runId) { console.error('Usage: tsx cross-source-correlate.ts --run-id <id> [--out <digest.json>]'); process.exit(1); }

  let digest;
  try {
    digest = buildCrossSourceDigest(runId);
  } catch (e: any) {
    console.error(e.message);
    process.exit(1);
  }

  const outPath = arg('out') ?? path.resolve('../output/p1-cross/cross-source-evidence.json');
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outPath), JSON.stringify(digest, null, 2), 'utf-8');
  console.error(`[correlate] digest → ${path.resolve(outPath)}`);
  console.log(JSON.stringify(digest, null, 2));
}

main();
