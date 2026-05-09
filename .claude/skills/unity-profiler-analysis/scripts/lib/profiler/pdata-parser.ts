/**
 * .pdata file parser - reads Unity Profiler binary data.
 * Strict port of ProfileData.cs Read() method from Unity Profile Analyzer.
 */
import * as fs from 'fs'
import { BinaryReader } from './binary-reader'
import { ProfileData, ProfileFrame, ProfileThread, ProfileMarker } from './types'

const LATEST_VERSION = 7

/**
 * Correct thread name format to match Unity Profile Analyzer conventions.
 * Handles trailing digit normalization: "1:Worker Thread 0" -> "1:Worker Thread"
 */
function correctThreadName(threadNameWithIndex: string): string {
  const info = threadNameWithIndex.split(':')
  if (info.length >= 2) {
    const threadGroupIndexStr = info[0]
    const threadName = info[1]

    if (threadName.trim() === '') {
      threadNameWithIndex = `${threadGroupIndexStr}:[Unknown]`
    } else {
      const trailingDigit = /^(.*[^\s])\s+([\d]+)$/.exec(threadName)
      if (trailingDigit) {
        const threadNamePrefix = trailingDigit[1]
        const threadGroupIndex = 1 + parseInt(trailingDigit[2], 10)
        threadNameWithIndex = `${threadGroupIndex}:${threadNamePrefix}`
      }
    }
  }
  return threadNameWithIndex.trim()
}

function readMarker(reader: BinaryReader, fileVersion: number): ProfileMarker {
  const nameIndex = reader.readInt32()
  const msMarkerTotal = reader.readFloat()
  const depth = reader.readInt32()
  let msChildren = 0
  if (fileVersion === 3) {
    msChildren = reader.readFloat()
  }
  return { nameIndex, msMarkerTotal, depth, msChildren }
}

function readThread(reader: BinaryReader, fileVersion: number): ProfileThread {
  const threadIndex = reader.readInt32()
  const markerCount = reader.readInt32()
  const markers: ProfileMarker[] = []
  for (let m = 0; m < markerCount; m++) {
    markers.push(readMarker(reader, fileVersion))
  }
  return { threadIndex, markers }
}

function readFrame(reader: BinaryReader, fileVersion: number): ProfileFrame {
  let msStartTime = 0
  if (fileVersion > 1) {
    if (fileVersion >= 6) {
      msStartTime = reader.readDouble()
    } else {
      const sStartTime = reader.readDouble()
      msStartTime = sStartTime * 1000.0
    }
  }
  const msFrame = reader.readFloat()
  const threadCount = reader.readInt32()
  const threads: ProfileThread[] = []
  for (let t = 0; t < threadCount; t++) {
    threads.push(readThread(reader, fileVersion))
  }
  return { msStartTime, msFrame, threads }
}

/**
 * Calculate child marker times (same as ProfileData.CalculateMarkerChildTimes).
 * Markers are in depth-first order; infer parent-child from depth values.
 */
function calculateMarkerChildTimes(data: ProfileData): void {
  for (let frameOffset = 0; frameOffset < data.frames.length; frameOffset++) {
    const frameData = data.frames[frameOffset]
    if (!frameData) continue

    for (let ti = 0; ti < frameData.threads.length; ti++) {
      const threadData = frameData.threads[ti]

      // Zero all msChildren first
      for (const marker of threadData.markers) {
        marker.msChildren = 0
      }

      // Update child times using a depth stack
      const markerStack: ProfileMarker[] = []

      for (const marker of threadData.markers) {
        const depth = marker.depth

        if (depth >= markerStack.length) {
          if (depth === markerStack.length) {
            popAndRecordTime(markerStack)
          }
        } else {
          while (markerStack.length >= depth) {
            popAndRecordTime(markerStack)
          }
        }

        markerStack.push(marker)
      }
    }
  }
}

function popAndRecordTime(stack: ProfileMarker[]): ProfileMarker | null {
  if (stack.length === 0) return null
  const child = stack.pop()!
  if (stack.length > 0) {
    const parent = stack[stack.length - 1]
    parent.msChildren += child.msMarkerTotal
  }
  return child
}

/**
 * Parse a .pdata binary file into ProfileData.
 */
export function parsePdataFile(filePath: string): ProfileData {
  const fileBuffer = fs.readFileSync(filePath)
  const reader = new BinaryReader(fileBuffer)

  const version = reader.readInt32()
  if (version < 0 || version > LATEST_VERSION) {
    throw new Error(`Unsupported .pdata version: ${version} (expected 1~${LATEST_VERSION}). File: ${filePath}`)
  }

  const frameIndexOffset = reader.readInt32()

  const frameCount = reader.readInt32()
  const frames: ProfileFrame[] = []
  for (let f = 0; f < frameCount; f++) {
    frames.push(readFrame(reader, version))
  }

  const markerNameCount = reader.readInt32()
  const markerNames: string[] = []
  for (let m = 0; m < markerNameCount; m++) {
    markerNames.push(reader.readString())
  }

  const threadNameCount = reader.readInt32()
  const threadNames: string[] = []
  for (let t = 0; t < threadNameCount; t++) {
    let name = reader.readString()
    name = correctThreadName(name)
    threadNames.push(name)
  }

  const data: ProfileData = {
    version,
    frameIndexOffset,
    frames,
    markerNames,
    threadNames,
    filePath
  }

  // Post-process: calculate child marker times
  calculateMarkerChildTimes(data)

  return data
}

/**
 * Utility: convert frame offset to display frame index.
 */
export function offsetToDisplayFrame(data: ProfileData, offset: number): number {
  return offset + (1 + data.frameIndexOffset)
}

/**
 * Utility: convert display frame index to offset.
 */
export function displayFrameToOffset(data: ProfileData, displayFrame: number): number {
  return displayFrame - (1 + data.frameIndexOffset)
}
