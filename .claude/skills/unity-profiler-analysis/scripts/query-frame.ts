/**
 * query-frame.ts - Query detailed call tree for a specific frame.
 *
 * Usage:
 *   npx tsx query-frame.ts --input ./recording.pdata --frame 523 --depth 10
 *   npx tsx query-frame.ts --input ./parsed-data.json --frame 523
 */
import * as fs from 'fs'
import * as path from 'path'
import { parsePdataFile } from './lib/profiler/pdata-parser'
import { ProfileData } from './lib/profiler/types'
import {
  getFrameCallTree,
  formatCallTree,
  formatHotPath
} from './lib/profiler/call-tree'

// ============ CLI Argument Parsing ============

function parseArgs(): { input: string; frame: number; depth: number; thread?: string } {
  const args = process.argv.slice(2)
  let input = ''
  let frame = -1
  let depth = 8
  let thread: string | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input' && args[i + 1]) {
      input = args[++i]
    } else if (args[i] === '--frame' && args[i + 1]) {
      frame = parseInt(args[++i], 10)
    } else if (args[i] === '--depth' && args[i + 1]) {
      depth = parseInt(args[++i], 10)
    } else if (args[i] === '--thread' && args[i + 1]) {
      thread = args[++i]
    }
  }

  if (!input || frame < 0) {
    console.error('Usage: npx tsx query-frame.ts --input <file.pdata|file.json> --frame <index> [--depth 8] [--thread "Main Thread"]')
    process.exit(1)
  }

  return { input, frame, depth, thread }
}

// ============ Load Profile Data ============

function loadProfileData(inputPath: string): ProfileData {
  const ext = path.extname(inputPath).toLowerCase()

  if (ext === '.pdata') {
    return parsePdataFile(inputPath)
  } else if (ext === '.json') {
    const raw = fs.readFileSync(inputPath, 'utf-8')
    return JSON.parse(raw) as ProfileData
  } else {
    console.error(`Error: unsupported file extension "${ext}". Use .pdata or .json`)
    process.exit(1)
  }
}

// ============ Main ============

function main(): void {
  const { input, frame, depth, thread } = parseArgs()

  const profileData = loadProfileData(path.resolve(input))

  const result = getFrameCallTree(profileData, frame, thread)

  if (!result) {
    console.error(`Error: Frame ${frame} not found in data (available: ${profileData.frameIndexOffset + 1} to ${profileData.frameIndexOffset + profileData.frames.length})`)
    process.exit(1)
  }

  const output = {
    frameIndex: result.frameIndex,
    msFrame: parseFloat(result.msFrame.toFixed(2)),
    threadName: result.threadName,
    hotPath: result.hotPath.map(p => ({
      name: p.name,
      msTotal: parseFloat(p.msTotal.toFixed(2)),
      msSelf: parseFloat(p.msSelf.toFixed(2)),
      percentOfFrame: parseFloat(p.percentOfFrame.toFixed(1)),
      isBottleneck: p.isBottleneck
    })),
    hotPathText: formatHotPath(result.hotPath),
    callTree: formatCallTree(result.tree, 0, 0.1, depth)
  }

  console.log(JSON.stringify(output, null, 2))
}

main()
