/**
 * Unity Profiler .pdata parser for web server analysis.
 */
import fs from 'fs';

export interface ProfileMarker {
  nameIndex: number;
  msMarkerTotal: number;
  depth: number;
  msChildren: number;
}

export interface ProfileThread {
  threadIndex: number;
  markers: ProfileMarker[];
}

export interface ProfileFrame {
  msStartTime: number;
  msFrame: number;
  threads: ProfileThread[];
}

export interface ProfileData {
  version: number;
  frameIndexOffset: number;
  frames: ProfileFrame[];
  markerNames: string[];
  threadNames: string[];
  filePath: string;
}

const LATEST_VERSION = 7;

class BinaryReader {
  private offset = 0;

  constructor(private readonly buffer: Buffer) {}

  readInt32(): number {
    if (this.offset + 4 > this.buffer.length) {
      throw new RangeError(`BinaryReader: readInt32 at offset ${this.offset} exceeds buffer length ${this.buffer.length}`);
    }
    const value = this.buffer.readInt32LE(this.offset);
    this.offset += 4;
    return value;
  }

  readFloat(): number {
    if (this.offset + 4 > this.buffer.length) {
      throw new RangeError(`BinaryReader: readFloat at offset ${this.offset} exceeds buffer length ${this.buffer.length}`);
    }
    const value = this.buffer.readFloatLE(this.offset);
    this.offset += 4;
    return value;
  }

  readDouble(): number {
    if (this.offset + 8 > this.buffer.length) {
      throw new RangeError(`BinaryReader: readDouble at offset ${this.offset} exceeds buffer length ${this.buffer.length}`);
    }
    const value = this.buffer.readDoubleLE(this.offset);
    this.offset += 8;
    return value;
  }

  readString(): string {
    const byteLength = this.read7BitEncodedInt();
    if (this.offset + byteLength > this.buffer.length) {
      throw new RangeError(`BinaryReader: readString(len=${byteLength}) at offset ${this.offset} exceeds buffer length ${this.buffer.length}`);
    }
    const value = this.buffer.toString('utf8', this.offset, this.offset + byteLength);
    this.offset += byteLength;
    return value;
  }

  private read7BitEncodedInt(): number {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (this.offset >= this.buffer.length) {
        throw new RangeError('BinaryReader: read7BitEncodedInt unexpected end of buffer');
      }
      byte = this.buffer[this.offset++];
      result |= (byte & 0x7f) << shift;
      shift += 7;
    } while (byte & 0x80);
    return result;
  }
}

function correctThreadName(threadNameWithIndex: string): string {
  const info = threadNameWithIndex.split(':');
  if (info.length >= 2) {
    const threadGroupIndexStr = info[0];
    const threadName = info[1];

    if (threadName.trim() === '') {
      threadNameWithIndex = `${threadGroupIndexStr}:[Unknown]`;
    } else {
      const trailingDigit = /^(.*[^\s])\s+([\d]+)$/.exec(threadName);
      if (trailingDigit) {
        const threadNamePrefix = trailingDigit[1];
        const threadGroupIndex = 1 + parseInt(trailingDigit[2], 10);
        threadNameWithIndex = `${threadGroupIndex}:${threadNamePrefix}`;
      }
    }
  }
  return threadNameWithIndex.trim();
}

function readMarker(reader: BinaryReader, fileVersion: number): ProfileMarker {
  const nameIndex = reader.readInt32();
  const msMarkerTotal = reader.readFloat();
  const depth = reader.readInt32();
  let msChildren = 0;
  if (fileVersion === 3) {
    msChildren = reader.readFloat();
  }
  return { nameIndex, msMarkerTotal, depth, msChildren };
}

function readThread(reader: BinaryReader, fileVersion: number): ProfileThread {
  const threadIndex = reader.readInt32();
  const markerCount = reader.readInt32();
  const markers: ProfileMarker[] = [];
  for (let m = 0; m < markerCount; m++) {
    markers.push(readMarker(reader, fileVersion));
  }
  return { threadIndex, markers };
}

function readFrame(reader: BinaryReader, fileVersion: number): ProfileFrame {
  let msStartTime = 0;
  if (fileVersion > 1) {
    if (fileVersion >= 6) {
      msStartTime = reader.readDouble();
    } else {
      msStartTime = reader.readDouble() * 1000;
    }
  }
  const msFrame = reader.readFloat();
  const threadCount = reader.readInt32();
  const threads: ProfileThread[] = [];
  for (let t = 0; t < threadCount; t++) {
    threads.push(readThread(reader, fileVersion));
  }
  return { msStartTime, msFrame, threads };
}

function popAndRecordTime(stack: ProfileMarker[]): ProfileMarker | null {
  if (stack.length === 0) return null;
  const child = stack.pop()!;
  if (stack.length > 0) {
    stack[stack.length - 1].msChildren += child.msMarkerTotal;
  }
  return child;
}

function calculateMarkerChildTimes(data: ProfileData): void {
  for (const frameData of data.frames) {
    if (!frameData) continue;
    for (const threadData of frameData.threads) {
      for (const marker of threadData.markers) {
        marker.msChildren = 0;
      }

      const markerStack: ProfileMarker[] = [];
      for (const marker of threadData.markers) {
        const depth = marker.depth;
        if (depth >= markerStack.length) {
          if (depth === markerStack.length) {
            popAndRecordTime(markerStack);
          }
        } else {
          while (markerStack.length >= depth) {
            popAndRecordTime(markerStack);
          }
        }
        markerStack.push(marker);
      }
    }
  }
}

export function parsePdataFile(filePath: string): ProfileData {
  const fileBuffer = fs.readFileSync(filePath);
  const reader = new BinaryReader(fileBuffer);

  const version = reader.readInt32();
  if (version < 0 || version > LATEST_VERSION) {
    throw new Error(`Unsupported .pdata version: ${version} (expected 1~${LATEST_VERSION}). File: ${filePath}`);
  }

  const frameIndexOffset = reader.readInt32();
  const frameCount = reader.readInt32();
  const frames: ProfileFrame[] = [];
  for (let f = 0; f < frameCount; f++) {
    frames.push(readFrame(reader, version));
  }

  const markerNameCount = reader.readInt32();
  const markerNames: string[] = [];
  for (let m = 0; m < markerNameCount; m++) {
    markerNames.push(reader.readString());
  }

  const threadNameCount = reader.readInt32();
  const threadNames: string[] = [];
  for (let t = 0; t < threadNameCount; t++) {
    threadNames.push(correctThreadName(reader.readString()));
  }

  const data: ProfileData = { version, frameIndexOffset, frames, markerNames, threadNames, filePath };
  calculateMarkerChildTimes(data);
  return data;
}
