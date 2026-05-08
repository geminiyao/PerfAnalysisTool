/**
 * map-source.ts - Map Profiler markers to source code locations.
 *
 * Searches project source files (C#, Lua) for Profiler.BeginSample calls
 * matching marker names. Results are cached in marker-source-map.json.
 *
 * Usage:
 *   npx tsx map-source.ts --input ./output/preprocess-result.json --project /path/to/unity-project
 *   npx tsx map-source.ts --input ./output/preprocess-result.json --project /path/to/unity-project --output ./output/marker-source-map.json
 */
import * as fs from 'fs'
import * as path from 'path'
import { execSync } from 'child_process'

// ============ Types ============

interface SourceMapping {
  source: 'grep' | 'engine'
  files?: { path: string; line: number }[]
  snippet?: string
  note?: string
}

interface MarkerSourceMap {
  _meta: { lastUpdated: string; projectPath: string }
  [markerName: string]: SourceMapping | any
}

interface SourceMappingConfig {
  enginePrefixes: string[]
  whitelistPrefixes: string[]
}

interface Config {
  projectPath: string
  sourceMapping?: SourceMappingConfig
}

// ============ CLI Argument Parsing ============

function parseArgs(): { input: string; project: string; output: string } {
  const args = process.argv.slice(2)
  let input = ''
  let project = ''
  let output = ''

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      input = args[++i]
    } else if (args[i] === '--project' && args[i + 1]) {
      project = args[++i]
    } else if (args[i] === '--output' && args[i + 1]) {
      output = args[++i]
    }
  }

  if (!input) {
    console.error('Usage: npx tsx map-source.ts --input <preprocess-result.json> --project <unity-project-path> [--output <marker-source-map.json>]')
    process.exit(1)
  }

  // Load project path from config if not specified
  if (!project) {
    const config = loadConfig()
    project = config.projectPath
  }

  if (!project) {
    console.error('Error: --project not specified and config.json projectPath is empty')
    process.exit(1)
  }

  if (!output) {
    // Default: skill root directory (alongside config.json), not output/
    output = path.join(__dirname, '..', 'marker-source-map.json')
  }

  return { input, project: path.resolve(project), output }
}

// ============ Load Config ============

function loadConfig(): Config {
  const configPath = path.join(__dirname, '..', 'config.json')
  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(raw) as Config
  } catch {
    return { projectPath: '', sourceMapping: { enginePrefixes: [], whitelistPrefixes: [] } }
  }
}

// ============ Marker Filtering (Config-driven) ============

let _enginePrefixes: string[] = []
let _whitelistPrefixes: string[] = []

function initFilterConfig(): void {
  const config = loadConfig()
  _enginePrefixes = config.sourceMapping?.enginePrefixes || []
  _whitelistPrefixes = config.sourceMapping?.whitelistPrefixes || []
}

// ============ Load Existing Map (Cache) ============

function loadExistingMap(outputPath: string): MarkerSourceMap {
  try {
    if (fs.existsSync(outputPath)) {
      const raw = fs.readFileSync(outputPath, 'utf-8')
      const parsed = JSON.parse(raw) as MarkerSourceMap
      // Clean up legacy noise entries (engine/dynamic/not-in-whitelist)
      // Only keep _meta and entries with source='grep' or source='not_found'
      const cleaned: MarkerSourceMap = { _meta: parsed._meta || { lastUpdated: '', projectPath: '' } }
      for (const [key, val] of Object.entries(parsed)) {
        if (key === '_meta') continue
        if (val && (val.source === 'grep' || val.source === 'not_found')) {
          cleaned[key] = val
        }
      }
      return cleaned
    }
  } catch (e) {
    // ignore
  }
  return { _meta: { lastUpdated: '', projectPath: '' } }
}

// ============ Extract Marker Names from Preprocess Result ============

function extractMarkerNames(inputPath: string): string[] {
  const raw = fs.readFileSync(inputPath, 'utf-8')
  const data = JSON.parse(raw)

  const names = new Set<string>()

  // From markers list
  if (data.markers) {
    for (const m of data.markers) {
      names.add(m.name)
    }
  }

  // From jank frames (dominant markers)
  if (data.jankFrames) {
    for (const j of data.jankFrames) {
      if (j.dominantMarker) names.add(j.dominantMarker)
    }
  }

  // From marker spikes
  if (data.markerSpikes) {
    for (const s of data.markerSpikes) {
      names.add(s.name)
    }
  }

  return Array.from(names)
}

// ============ Grep for Marker in Source Files ============

/**
 * Build a complete index of all profiler marker registrations in the project.
 * Scans all .cs and .lua files in ONE pass, then matches markers against the index.
 */
function buildMarkerIndex(projectPath: string): Map<string, { path: string; line: number; snippet: string }> {
  const index = new Map<string, { path: string; line: number; snippet: string }>()

  // Search in Assets/Scripts specifically (avoids Library/Temp/etc.)
  const searchPaths = [
    path.join(projectPath, 'Assets', 'Scripts'),
    path.join(projectPath, 'Assets', 'Plugins'),
  ].filter(p => fs.existsSync(p))
    .map(p => p.replace(/\\/g, '/')) // Normalize to forward slashes for grep compatibility

  if (searchPaths.length === 0) {
    // Fallback: search entire Assets directory
    const assetsPath = path.join(projectPath, 'Assets').replace(/\\/g, '/')
    if (fs.existsSync(assetsPath)) {
      searchPaths.push(assetsPath)
    } else {
      searchPaths.push(projectPath.replace(/\\/g, '/'))
    }
  }

  // One grep per search path to find all marker registration patterns
  let output = ''
  try {
    const patterns = ['BeginSample', 'CustomSampler', 'ProfilerMarker', 'ProfilerUtil']
    const results: string[] = []

    for (const searchPath of searchPaths) {
      for (const pattern of patterns) {
        try {
          const cmd = `grep -rn "${pattern}" --include="*.cs" --include="*.lua" "${searchPath}"`
          const result = execSync(cmd, { encoding: 'utf-8', timeout: 60000, maxBuffer: 50 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
          if (result && result.trim()) {
            console.error(`[map-source]   grep "${pattern}" in ${path.basename(searchPath)}: ${result.split('\n').length} lines`)
            results.push(result)
          }
        } catch (e: any) {
          // grep returns exit code 1 when no matches found - that's ok
          if (e.stdout && e.stdout.trim()) {
            console.error(`[map-source]   grep "${pattern}" in ${path.basename(searchPath)}: ${e.stdout.split('\n').length} lines`)
            results.push(e.stdout)
          }
          // Real errors (exit code 2) are ignored
        }
      }
    }

    output = results.join('\n')
  } catch (e: any) {
    console.error(`[map-source] grep failed: ${e.message}`)
    return index
  }

  if (!output.trim()) return index

  // Parse each line and extract marker name
  const lines = output.split('\n')
  for (const line of lines) {
    if (!line.trim()) continue

    // Format: filepath:linenum:content
    const match = line.match(/^(.+?):(\d+):(.*)$/)
    if (!match) continue

    const filePath = match[1]
    const lineNum = parseInt(match[2], 10)
    const content = match[3]

    // Extract marker name from various patterns
    const markerName = extractMarkerName(content)
    if (!markerName) continue

    // Only store first occurrence (avoid duplicates)
    if (index.has(markerName)) continue

    const relPath = path.relative(projectPath, filePath)
    const snippet = getSnippet(filePath, lineNum, 5)

    index.set(markerName, { path: relPath, line: lineNum, snippet: snippet || content.trim() })
  }

  return index
}

/**
 * Extract marker name from a source code line containing a profiler registration.
 */
function extractMarkerName(content: string): string | null {
  // Skip commented-out lines
  const trimmed = content.trim()
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return null
  // Skip Lua comments
  if (trimmed.startsWith('--')) return null

  // Match: CustomSampler.Create("Name")
  let m = content.match(/CustomSampler\.Create\s*\(\s*["']([^"']+)["']/)
  if (m) return m[1]

  // Match: new ProfilerMarker("Name") or ProfilerMarker("Name")
  m = content.match(/ProfilerMarker\s*\(\s*["']([^"']+)["']/)
  if (m) return m[1]

  // Match: Profiler.BeginSample("Name") or BeginSample('Name') (C#)
  m = content.match(/Profiler\.BeginSample\s*\(\s*["']([^"']+)["']/)
  if (m) return m[1]

  // Match: ProfilerUtil.BeginSample("Name") (Lua)
  m = content.match(/ProfilerUtil\.BeginSample\s*\(\s*["']([^"']+)["']/)
  if (m) return m[1]

  // Match: cls.BeginSample("Name") or self.BeginSample("Name") (Lua internal)
  m = content.match(/\.BeginSample\s*\(\s*["']([^"']+)["']/)
  if (m) return m[1]

  return null
}

function grepForMarker(markerName: string, projectPath: string): { path: string; line: number; snippet: string } | null {
  // Escape special regex characters in marker name
  const escaped = markerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  // Try C# files: Profiler.BeginSample("MarkerName")
  const csPatterns = [
    `BeginSample.*["']${escaped}["']`,
    `BeginSample.*${escaped}`
  ]

  for (const pattern of csPatterns) {
    const result = tryGrep(pattern, projectPath, '*.cs')
    if (result) return result
  }

  // Try Lua files
  const luaPatterns = [
    `BeginSample.*['"]${escaped}['"]`,
    `BeginSample.*${escaped}`
  ]

  for (const pattern of luaPatterns) {
    const result = tryGrep(pattern, projectPath, '*.lua')
    if (result) return result
  }

  // Try matching as ClassName.MethodName
  const dotIdx = markerName.lastIndexOf('.')
  if (dotIdx > 0) {
    const className = markerName.substring(0, dotIdx)
    const methodName = markerName.substring(dotIdx + 1)

    // Search for method definition in a file named like the class
    const classResult = tryGrep(
      `(void|IEnumerator|async)\\s+${methodName}\\s*\\(`,
      projectPath,
      `*${className}*.cs`
    )
    if (classResult) return classResult

    // Also try Lua function definition
    const luaResult = tryGrep(
      `function.*${methodName}`,
      projectPath,
      `*${className}*.lua`
    )
    if (luaResult) return luaResult
  }

  return null
}

function tryGrep(pattern: string, projectPath: string, fileGlob: string): { path: string; line: number; snippet: string } | null {
  try {
    // Use grep (cross-platform: works on Windows with Git Bash, macOS, Linux)
    const cmd = `grep -rn --include="${fileGlob}" -m 1 "${pattern}" "${projectPath}" 2>/dev/null || true`
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 10000 }).trim()

    if (!output) return null

    // Parse grep output: filepath:linenum:content
    const match = output.match(/^(.+?):(\d+):(.*)$/)
    if (!match) return null

    const filePath = path.relative(projectPath, match[1])
    const lineNum = parseInt(match[2], 10)
    const lineContent = match[3].trim()

    // Get surrounding context (5 lines before and after)
    const snippet = getSnippet(match[1], lineNum, 5)

    return { path: filePath, line: lineNum, snippet: snippet || lineContent }
  } catch (e) {
    return null
  }
}

function getSnippet(filePath: string, lineNum: number, contextLines: number): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const lines = content.split('\n')
    const start = Math.max(0, lineNum - 1 - contextLines)
    const end = Math.min(lines.length, lineNum + contextLines)
    return lines.slice(start, end).join('\n')
  } catch {
    return ''
  }
}

// ============ Known Engine Markers ============

const ENGINE_MARKERS = new Set([
  'PlayerLoop', 'Initialization', 'EarlyUpdate', 'FixedUpdate',
  'Update', 'PreLateUpdate', 'PostLateUpdate', 'Rendering',
  'Physics.Simulate', 'Physics.SyncColliderTransform', 'Physics.Broadphase',
  'Physics.Narrowphase', 'Physics.UpdateBodies',
  'ScriptRunBehaviourUpdate', 'ScriptRunDelayedDynamicFrameRate',
  'AI.NavMeshUpdate', 'Director.Update', 'ParticleSystem.Update',
  'UpdateAllRenderers', 'PlayerSendFrameComplete', 'FinishFrameRendering',
  'Camera.Render', 'Gfx.WaitForPresent', 'Gfx.WaitForGfxCommandsFromMainThread',
  'WaitForTargetFPS', 'Application.WaitForFrameCompletion',
  'GC.Collect', 'GC.Alloc',
  'Canvas.BuildBatch', 'Canvas.SendWillRenderCanvases',
  'UI.LayoutUpdate', 'UGUI.Canvas',
  'WaitForRenderThread', 'Gfx.PresentFrame',
  'ScriptRunBehaviourLateUpdate', 'BehaviourUpdate',
  'Semaphore.WaitForSignal', 'WaitForJobGroupID', 'Idle', 'EditorIdle'
])

function isEngineMarker(name: string): boolean {
  if (ENGINE_MARKERS.has(name)) return true
  // Check config-driven engine prefixes
  for (const prefix of _enginePrefixes) {
    if (name.startsWith(prefix)) return true
  }
  // Also match patterns like "Physics.*", "Gfx.*" etc
  const dotPrefix = name.split('.')[0]
  if (['Physics', 'Gfx', 'GC', 'UI', 'Canvas', 'UGUI'].includes(dotPrefix)) return true
  return false
}

/**
 * Check if a marker matches the whitelist (project-specific markers worth searching).
 * If whitelistPrefixes is configured, only markers matching at least one prefix pass.
 * If whitelistPrefixes is empty, all non-engine non-dynamic markers pass.
 */
function matchesWhitelist(name: string): boolean {
  if (_whitelistPrefixes.length === 0) return true
  for (const prefix of _whitelistPrefixes) {
    if (name.startsWith(prefix) || name.includes(prefix)) return true
  }
  return false
}

/**
 * Check if a marker name is dynamically generated (not worth searching in source).
 * These markers are created at runtime with paths/GUIDs/parameters baked into the name.
 */
function isDynamicMarker(name: string): boolean {
  // Resource loader markers: [res]goLoader_async: assets/...
  if (name.startsWith('[res]')) return true
  // Contains file paths (slashes)
  if (name.includes('/') || name.includes('\\')) return true
  // Contains GUIDs (long hex strings in parentheses)
  if (/\([0-9a-fA-F]{16,}\)/.test(name)) return true
  // Contains .prefab, .asset, .png, etc.
  if (/\.(prefab|asset|png|jpg|mat|shader|fbx|bundle|bytes)/.test(name)) return true
  // Wrapped in *** ... *** (dynamic debug markers)
  if (name.startsWith('***') && name.endsWith('***')) return true
  // Contains "assets/" path prefix
  if (name.toLowerCase().includes('assets/')) return true
  // Very long names (> 80 chars) are typically dynamic
  if (name.length > 80) return true
  return false
}

// ============ Main ============

function main(): void {
  const { input, project, output } = parseArgs()

  // Verify project path exists
  if (!fs.existsSync(project)) {
    console.error(`Error: project path does not exist: ${project}`)
    process.exit(1)
  }

  // Init filter config
  initFilterConfig()

  // Load existing cache
  const existingMap = loadExistingMap(output)

  // Extract marker names from preprocess result
  const markerNames = extractMarkerNames(input)
  console.error(`[map-source] Found ${markerNames.length} unique markers to map`)

  // Determine which markers need searching (black + white filtering)
  const needSearch: string[] = []
  let skippedEngine = 0
  let skippedDynamic = 0
  let skippedWhitelist = 0

  for (const name of markerNames) {
    if (existingMap[name]) continue // Already cached
    if (isEngineMarker(name)) {
      // Do NOT write to output — no analysis value
      skippedEngine++
      continue
    }
    if (isDynamicMarker(name)) {
      // Do NOT write to output — runtime paths/GUIDs are noise
      skippedDynamic++
      continue
    }
    if (!matchesWhitelist(name)) {
      // Do NOT write to output — likely engine/third-party
      skippedWhitelist++
      continue
    }
    needSearch.push(name)
  }

  console.error(`[map-source] Filtered: ${skippedEngine} engine, ${skippedDynamic} dynamic, ${skippedWhitelist} not-in-whitelist`)
  console.error(`[map-source] ${needSearch.length} markers need source search`)

  console.error(`[map-source] ${needSearch.length} markers need source search (${markerNames.length - needSearch.length} already cached/engine)`)

  if (needSearch.length === 0) {
    // Nothing to search, save and exit
    existingMap._meta = { lastUpdated: new Date().toISOString(), projectPath: project }
    fs.writeFileSync(output, JSON.stringify(existingMap, null, 2), 'utf-8')
    console.error(`[map-source] Saved to: ${output}`)
    console.log(JSON.stringify({ total: markerNames.length, searched: 0, found: 0, notFound: 0, cached: markerNames.length, outputPath: output }, null, 2))
    return
  }

  // Phase 1: Build index from ONE grep pass (fast)
  console.error(`[map-source] Phase 1: Building marker index from project source...`)
  const markerIndex = buildMarkerIndex(project)
  console.error(`[map-source] Index built: ${markerIndex.size} markers found in source`)

  // Phase 2: Match markers against index
  let found = 0
  let notFound = 0
  const unmatchedMarkers: string[] = []

  for (const name of needSearch) {
    const indexed = markerIndex.get(name)
    if (indexed) {
      existingMap[name] = {
        source: 'grep',
        files: [{ path: indexed.path, line: indexed.line }],
        snippet: indexed.snippet
      }
      found++
    } else {
      unmatchedMarkers.push(name)
    }
  }

  console.error(`[map-source] Phase 1 result: ${found} matched from index, ${unmatchedMarkers.length} unmatched`)

  // Phase 3: For unmatched markers, try ClassName.MethodName fallback (only for markers with dots)
  // Limit fallback grep to avoid timeout — only try markers that look like "Class.Method"
  const fallbackCandidates = unmatchedMarkers.filter(name => {
    const dotIdx = name.lastIndexOf('.')
    return dotIdx > 0 && dotIdx < name.length - 1 && !name.includes(' ') && !name.includes('!')
  }).slice(0, 20) // Limit to 20 to avoid timeout

  if (fallbackCandidates.length > 0) {
    console.error(`[map-source] Phase 2: Fallback grep for ${fallbackCandidates.length} Class.Method markers...`)
    for (const name of fallbackCandidates) {
      const result = grepForMarker(name, project)
      if (result) {
        existingMap[name] = {
          source: 'grep',
          files: [{ path: result.path, line: result.line }],
          snippet: result.snippet
        }
        found++
        // Remove from unmatched
        const idx = unmatchedMarkers.indexOf(name)
        if (idx >= 0) unmatchedMarkers.splice(idx, 1)
      }
    }
  }

  // Count remaining as not found, but do NOT write them to output (noise reduction)
  for (const name of unmatchedMarkers) {
    notFound++
  }

  console.error(`[map-source] Final: ${found} found, ${notFound} not found (marked as engine)`)

  // Update metadata
  existingMap._meta = {
    lastUpdated: new Date().toISOString(),
    projectPath: project
  }

  // Save
  fs.writeFileSync(output, JSON.stringify(existingMap, null, 2), 'utf-8')
  console.error(`[map-source] Saved to: ${output}`)

  // Print summary to stdout
  console.log(JSON.stringify({
    total: markerNames.length,
    searched: needSearch.length,
    found,
    notFound,
    cached: markerNames.length - needSearch.length,
    indexSize: markerIndex.size,
    outputPath: output
  }, null, 2))
}

main()
