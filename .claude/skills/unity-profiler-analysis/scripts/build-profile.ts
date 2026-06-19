/**
 * build-profile.ts — 用 UnityProfilerProvider 把 .pdata 解析成统一 PerfProfile。
 *
 * 这是 P1 "unity 纵向切片" 的出数据入口 (替代直接读 preprocess-result.json):
 *   解析 .pdata → PerfProfile(core+detail) → 落盘:
 *     - unity-profile.json          (完整 PerfProfile, web ingest 入库 / 对比深层联合回读)
 *     - unity-profile-summary.json  (精简摘要, 供 AI/skill 读, ~15-30KB)
 *
 * 用法:
 *   npx tsx build-profile.ts --input <file.pdata|parsed-data.json> [--target-fps 30] [--out-dir ./output]
 *
 * 依据: docs/report-spec-and-data-contract.md §2/§7, docs/refactor-progress.md §3 P1。
 */
import * as fs from 'fs'
import * as path from 'path'
import { buildUnityProfile } from './providers/unity-profiler-provider'

function parseArgs(): { input: string; targetFps?: number; outDir: string } {
  const args = process.argv.slice(2)
  let input = ''
  let targetFps: number | undefined
  let outDir = ''
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) input = args[++i]
    else if (args[i] === '--target-fps' && args[i + 1]) targetFps = parseFloat(args[++i])
    else if (args[i] === '--out-dir' && args[i + 1]) outDir = args[++i]
  }
  if (!input) {
    console.error('Usage: npx tsx build-profile.ts --input <file.pdata|parsed-data.json> [--target-fps 30] [--out-dir ./output]')
    process.exit(1)
  }
  return { input, targetFps, outDir }
}

function main(): void {
  const { input, targetFps, outDir: cliOutDir } = parseArgs()
  const outDir = path.resolve(cliOutDir || './output')
  fs.mkdirSync(outDir, { recursive: true })

  const { profile, summary, preprocess } = buildUnityProfile({
    input: path.resolve(input),
    targetFps,
    parseCacheDir: outDir,
  })

  // 向后兼容: web cli-executor 以 preprocess-result.json 判成功; query-frame 也可用。
  const preprocessPath = path.join(outDir, 'preprocess-result.json')
  fs.writeFileSync(preprocessPath, JSON.stringify(preprocess, null, 2), 'utf-8')
  console.error(`[build-profile] (compat) preprocess-result.json saved: ${preprocessPath}`)

  const profilePath = path.join(outDir, 'unity-profile.json')
  const profileJson = JSON.stringify(profile, null, 2)
  fs.writeFileSync(profilePath, profileJson, 'utf-8')
  console.error(`[build-profile] PerfProfile saved: ${profilePath} (${(profileJson.length / 1024).toFixed(0)}KB)`)

  const summaryPath = path.join(outDir, 'unity-profile-summary.json')
  const summaryJson = JSON.stringify(summary, null, 2)
  fs.writeFileSync(summaryPath, summaryJson, 'utf-8')
  console.error(`[build-profile] Summary saved: ${summaryPath} (${(summaryJson.length / 1024).toFixed(0)}KB)`)
  console.error(`[build-profile] metrics=${profile.core.metrics.length} keys, callTrees=${(profile.detail.unity_profiler as any)?.callTrees?.length ?? 0}`)

  // 摘要打到 stdout 供调用方消费
  console.log(summaryJson)
}

main()
