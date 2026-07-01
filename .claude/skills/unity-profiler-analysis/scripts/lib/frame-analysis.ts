/**
 * frame-analysis.ts — Unity L1–L3 帧分析 (与 scripts/frame_analysis.py 契约对齐)
 */
import * as fs from 'fs'
import * as path from 'path'
import type { ProfileData } from '../lib/profiler/types'
import type {
  CallTree,
  CallTreeNode,
  DeviceTier,
  FrameAnalysis,
  FlaggedFrame,
  MarkerFrameSeries,
  FrameContext,
} from '../../../../../web/shared/perf-model'
import { getFrameCallTree, type CallTreeNode as LibCallTreeNode } from '../lib/profiler/call-tree'

const ROOT = path.resolve(__dirname, '../../../../..')
const SPEC_JSON = path.join(ROOT, 'docs', 'aoe-watch-spec.json')
const DEVICE_MAP_JSON = path.join(ROOT, 'docs', 'device-tier-map.json')

let specCache: Record<string, unknown> | null = null

function round(n: number, d = 2): number {
  if (!Number.isFinite(n)) return 0
  const f = 10 ** d
  return Math.round(n * f) / f
}

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.floor(((sorted.length - 1) * pct) / 100)
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]
}

function loadWatchSpec(): Record<string, unknown> {
  if (specCache) return specCache
  specCache = JSON.parse(fs.readFileSync(SPEC_JSON, 'utf-8')) as Record<string, unknown>
  return specCache
}

function fnmatch(value: string, pattern: string): boolean {
  const re = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$')
  return re.test(value)
}

export function resolveDeviceTier(device?: string, targetFps = 60): { tier: DeviceTier; frameBudgetMs: number } {
  let map: { defaultTier?: DeviceTier; tiers?: Record<string, { devices?: string[]; patterns?: string[]; frameBudgetMs?: number }> } = {}
  if (fs.existsSync(DEVICE_MAP_JSON)) {
    map = JSON.parse(fs.readFileSync(DEVICE_MAP_JSON, 'utf-8'))
  }
  const defaultTier = (map.defaultTier ?? 'unknown') as DeviceTier
  const budgetDefault = 1000 / targetFps
  if (!device) return { tier: defaultTier, frameBudgetMs: budgetDefault }
  for (const tier of ['high', 'mid', 'low'] as DeviceTier[]) {
    const cfg = map.tiers?.[tier]
    if (!cfg) continue
    if (cfg.devices?.includes(device)) {
      return { tier, frameBudgetMs: cfg.frameBudgetMs ?? budgetDefault }
    }
    for (const pat of cfg.patterns ?? []) {
      if (fnmatch(device, pat)) {
        return { tier, frameBudgetMs: cfg.frameBudgetMs ?? budgetDefault }
      }
    }
  }
  const spec = loadWatchSpec()
  const unk = (spec.deviceTiers as Record<string, { frameBudgetMs?: number }>)?.unknown
  return { tier: defaultTier, frameBudgetMs: unk?.frameBudgetMs ?? budgetDefault }
}

function resolvePreset(scene?: string): string {
  const spec = loadWatchSpec()
  const presets = spec.presets as Record<string, { matchScenePatterns?: string[] }>
  for (const [name, preset] of Object.entries(presets)) {
    if (name === 'default') continue
    for (const pat of preset.matchScenePatterns ?? []) {
      if (fnmatch(scene ?? '', pat)) return name
    }
  }
  return 'default'
}

function markerMsPerFrameIndex(data: ProfileData, patterns: string[]): (number | null)[] {
  return data.frames.map(frame => {
    if (!frame) return null
    let sum = 0
    let found = false
    for (const thread of frame.threads) {
      for (const m of thread.markers) {
        const name = data.markerNames[m.nameIndex] ?? ''
        if (patterns.some(p => name.includes(p))) {
          sum += m.msMarkerTotal
          found = true
        }
      }
    }
    return found ? round(sum, 3) : null
  })
}

function markerPresentInFrame(data: ProfileData, frameIndex: number, patterns: string[]): boolean {
  const frame = data.frames[frameIndex]
  if (!frame) return false
  for (const thread of frame.threads) {
    for (const m of thread.markers) {
      const name = data.markerNames[m.nameIndex] ?? ''
      if (patterns.some(p => name.includes(p))) return true
    }
  }
  return false
}

function classifyContextsUnity(
  data: ProfileData,
  classifiers: Record<string, {
    anyPresent?: { unityMarkers?: string[] }
    not?: string
  }>,
): { contextByFrame: FrameContext[]; contextSummary: { byClassifier: Record<string, number> } } {
  const n = data.frames.length
  const byClassifier: Record<string, number> = {}
  const contextByFrame: FrameContext[] = []
  for (let fi = 0; fi < n; fi++) {
    const labels: Record<string, string> = {}
    const evidence: FrameContext['evidence'] = []
    for (const [cid, cfg] of Object.entries(classifiers)) {
      if (cfg.not) continue
      const markers = cfg.anyPresent?.unityMarkers ?? []
      if (markers.length && markerPresentInFrame(data, fi, markers)) {
        const domain = cid.includes('-') ? cid.split('-')[0] : cid
        const state = cid.includes('-') ? cid.split('-').slice(1).join('-') : 'active'
        labels[domain] = state
        byClassifier[cid] = (byClassifier[cid] ?? 0) + 1
        evidence!.push({ classifierId: cid, markers, confidence: 'high' })
      }
    }
    if (labels.camera !== 'dragging') labels.camera = 'idle'
    contextByFrame.push({ frameIndex: fi, labels, evidence: evidence?.length ? evidence : undefined })
  }
  return { contextByFrame, contextSummary: { byClassifier } }
}

function toUnifiedNode(n: LibCallTreeNode, msFrame: number): CallTreeNode {
  return {
    name: n.name,
    totalMs: round(n.msTotal, 2),
    selfMs: round(n.msSelf, 2),
    totalPct: round(n.percentOfFrame, 1),
    selfPct: msFrame > 0 ? round((n.msSelf / msFrame) * 100, 1) : undefined,
    children: n.children.map(c => toUnifiedNode(c, msFrame)),
  }
}

function frameCallTree(data: ProfileData, frameIndex: number, label: string): CallTree | null {
  const res = getFrameCallTree(data, frameIndex)
  if (!res) return null
  const children = res.tree.map(n => toUnifiedNode(n, res.msFrame))
  const childTotal = children.reduce((s, c) => s + (c.totalMs ?? 0), 0)
  return {
    thread: res.threadName,
    label,
    root: {
      name: res.threadName,
      totalMs: round(res.msFrame, 2),
      selfMs: round(Math.max(0, res.msFrame - childTotal), 2),
      totalPct: 100,
      children,
    },
  }
}

function evalWhen(
  when: string | undefined,
  ctx: FrameContext,
  frameMs: number,
  stats: { p50Ms: number; p95Ms: number },
): boolean {
  if (!when || when === 'always') return true
  if (when.startsWith('context.')) {
    const m = when.match(/context\.(\w+)\s*==\s*(\w+)/)
    if (m) return ctx.labels[m[1]] === m[2]
    return false
  }
  if (when.includes('frameMs < frameP50')) return frameMs < stats.p50Ms * 0.85
  if (when.includes('frameMs >= frameP95')) return frameMs >= stats.p95Ms * 0.9
  return true
}

function applyRule(
  ref: string,
  params: Record<string, number>,
  seriesMs: number,
  frameMs: number,
  frameBudgetMs: number,
  seriesMedian: number,
  stats: { p50Ms: number; p95Ms: number },
): boolean {
  if (ref === 'pct-of-budget') return seriesMs / frameBudgetMs > (params.maxPct ?? 0.12)
  if (ref === 'pct-of-frame') return frameMs > 0 && seriesMs / frameMs > (params.maxPct ?? 0.15)
  if (ref === 'spike-vs-median') {
    return seriesMs > (params.k ?? 2.5) * seriesMedian && seriesMs > (params.floorMs ?? 0.5)
  }
  if (ref === 'low-load-strict') {
    if (frameMs >= stats.p50Ms * (params.frameBelowP50Ratio ?? 0.85)) return false
    return seriesMs > (params.maxMs ?? 2)
  }
  if (ref === 'high-load-relaxed') {
    if (frameMs < stats.p95Ms * (params.frameAboveP95Ratio ?? 0.9)) return false
    return seriesMs > (params.maxMs ?? 3.5)
  }
  if (ref === 'hard-cap' || ref === 'ecs-dispatch-cap') return seriesMs > (params.maxMs ?? 10)
  return false
}

function evaluateFlags(
  timings: number[],
  seriesList: MarkerFrameSeries[],
  contextByFrame: FrameContext[],
  watchSpec: FrameAnalysis['watchSpec'],
  stats: FrameAnalysis['summary'],
  deviceTier: DeviceTier,
): FlaggedFrame[] {
  const spec = loadWatchSpec()
  const templates = spec.ruleTemplates as Record<string, { params?: Record<string, number>; when?: string }>
  const flags: FlaggedFrame[] = []
  const budget = watchSpec?.frameBudgetMs ?? 16.67
  for (const tgt of watchSpec?.targets ?? []) {
    const ser = seriesList.find(s => s.targetId === tgt.id)
    if (!ser) continue
    const present = ser.timings.filter((t): t is number => t != null)
    const med = percentile([...present].sort((a, b) => a - b), 50)
    for (const rule of tgt.rules) {
      const ref = rule.ref
      if (!ref) continue
      const tpl = templates[ref] ?? {}
      const params = { ...(tpl.params ?? {}), ...(rule.params ?? {}) }
      const when = rule.when ?? tpl.when ?? 'always'
      const sev = rule.severity ?? (ref === 'hard-cap' && (params.maxMs ?? 0) >= 10 ? 'critical' : 'warn')
      for (let fi = 0; fi < ser.timings.length; fi++) {
        const seriesMs = ser.timings[fi]
        if (seriesMs == null) continue
        const ctx = contextByFrame[fi] ?? { frameIndex: fi, labels: {} }
        if (!evalWhen(when, ctx, timings[fi], stats)) continue
        if (applyRule(ref, params, seriesMs, timings[fi], budget, med, stats)) {
          flags.push({
            frameIndex: fi,
            targetId: tgt.id,
            ruleId: ref,
            severity: sev as 'warn' | 'critical',
            actualMs: seriesMs,
            frameMs: timings[fi],
            context: ctx.labels,
            deviceTier,
            message: rule.message ?? `${tgt.id} ${seriesMs}ms 触发 ${ref} (帧 ${fi})`,
          })
        }
      }
    }
  }
  return flags
}

export interface BuildUnityFrameAnalysisOpts {
  data: ProfileData
  timings: number[]
  worstFrameIndex: number
  medianFrameIndex: number
  device?: string
  scene?: string
  targetFps?: number
}

export function buildUnityFrameAnalysis(opts: BuildUnityFrameAnalysisOpts): FrameAnalysis {
  const { data, timings, worstFrameIndex, medianFrameIndex } = opts
  const targetFps = opts.targetFps ?? 60
  const spec = loadWatchSpec()
  const { tier: deviceTier, frameBudgetMs } = resolveDeviceTier(opts.device, targetFps)
  const sorted = [...timings].sort((a, b) => a - b)
  const n = timings.length
  const p50 = percentile(sorted, 50)
  const p95 = percentile(sorted, 95)
  const p99 = percentile(sorted, 99)
  const avg = n ? timings.reduce((a, b) => a + b, 0) / n : 0
  const p95FrameIndex = timings.reduce((best, ms, i) =>
    Math.abs(ms - p95) < Math.abs(timings[best] - p95) ? i : best, 0)

  const summary = {
    count: n,
    p50Ms: round(p50),
    p95Ms: round(p95),
    p99Ms: round(p99),
    fps: round(avg > 0 ? 1000 / avg : 0, 1),
    slowFrameRate33: round(n ? (timings.filter(ms => ms > 33).length / n) * 100 : 0),
    slowFrameRate50: round(n ? (timings.filter(ms => ms > 50).length / n) * 100 : 0),
    worstFrameIndex,
    medianFrameIndex,
    p95FrameIndex,
  }

  const classifiers = (spec.contextClassifiers ?? {}) as Record<string, { anyPresent?: { unityMarkers?: string[] }; not?: string }>
  const { contextByFrame, contextSummary } = classifyContextsUnity(data, classifiers)

  const series: MarkerFrameSeries[] = []
  for (const tgt of spec.watchTargets as Array<{ id: string; match?: { unity?: { patterns?: string[] } } }>) {
    const m = tgt.match?.unity
    if (!m) continue
    const tms = markerMsPerFrameIndex(data, m.patterns ?? [])
    const present = tms.filter((x): x is number => x != null)
    const ps = [...present].sort((a, b) => a - b)
    series.push({
      targetId: tgt.id,
      timings: tms,
      presentCount: present.length,
      summary: {
        medianMs: round(percentile(ps, 50)),
        p95Ms: round(percentile(ps, 95)),
        maxMs: round(present.length ? Math.max(...present) : 0),
      },
    })
  }

  const watchSpec = {
    version: (spec.version as number) ?? 1,
    schemaRef: (spec.schemaRef as string) ?? 'docs/frame-analysis-data-contract.md',
    preset: resolvePreset(opts.scene),
    deviceTier,
    frameBudgetMs: round(frameBudgetMs, 2),
    targets: spec.watchTargets as FrameAnalysis['watchSpec'] extends { targets: infer T } ? T : never,
    specPath: 'docs/aoe-watch-spec.json',
  }

  const flags = evaluateFlags(timings, series, contextByFrame, watchSpec, summary, deviceTier)

  const frameTrees: CallTree[] = []
  for (const [label, idx] of [
    ['worstFrame', worstFrameIndex],
    ['medianFrame', medianFrameIndex],
    ['p95Frame', p95FrameIndex],
  ] as const) {
    if (idx >= 0 && idx < n) {
      const t = frameCallTree(data, idx, `${label}#${idx}`)
      if (t) frameTrees.push(t)
    }
  }

  const slowFrames = [...timings.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([frameIndex, ms], rank) => ({ frameIndex, ms: round(ms), rank: rank + 1 }))

  return {
    frameDefinition: 'playerloop',
    thread: 'Main Thread',
    summary,
    timings,
    slowFrames,
    frameTrees,
    contextByFrame,
    contextSummary,
    watchSpec,
    series,
    flags: flags.length ? flags : undefined,
  }
}
