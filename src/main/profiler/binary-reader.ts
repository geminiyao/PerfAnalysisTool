/**
 * BinaryReader - wraps Node.js Buffer for sequential binary reading.
 * Mirrors C# BinaryReader used by Unity Profile Analyzer.
 */
export class BinaryReader {
  private buffer: Buffer
  private offset: number

  constructor(buffer: Buffer) {
    this.buffer = buffer
    this.offset = 0
  }

  get position(): number {
    return this.offset
  }

  set position(value: number) {
    this.offset = value
  }

  get length(): number {
    return this.buffer.length
  }

  get remaining(): number {
    return this.buffer.length - this.offset
  }

  readInt32(): number {
    if (this.offset + 4 > this.buffer.length) {
      throw new RangeError(`BinaryReader: readInt32 at offset ${this.offset} exceeds buffer length ${this.buffer.length}`)
    }
    const value = this.buffer.readInt32LE(this.offset)
    this.offset += 4
    return value
  }

  readFloat(): number {
    if (this.offset + 4 > this.buffer.length) {
      throw new RangeError(`BinaryReader: readFloat at offset ${this.offset} exceeds buffer length ${this.buffer.length}`)
    }
    const value = this.buffer.readFloatLE(this.offset)
    this.offset += 4
    return value
  }

  readDouble(): number {
    if (this.offset + 8 > this.buffer.length) {
      throw new RangeError(`BinaryReader: readDouble at offset ${this.offset} exceeds buffer length ${this.buffer.length}`)
    }
    const value = this.buffer.readDoubleLE(this.offset)
    this.offset += 8
    return value
  }

  /**
   * Read a .NET BinaryWriter-style length-prefixed string.
   * The length is encoded as a 7-bit variable-length integer (LEB128).
   */
  readString(): string {
    const byteLength = this.read7BitEncodedInt()
    if (this.offset + byteLength > this.buffer.length) {
      throw new RangeError(`BinaryReader: readString(len=${byteLength}) at offset ${this.offset} exceeds buffer length ${this.buffer.length}`)
    }
    const value = this.buffer.toString('utf8', this.offset, this.offset + byteLength)
    this.offset += byteLength
    return value
  }

  /**
   * Read a 7-bit encoded integer (same as .NET BinaryReader.Read7BitEncodedInt).
   */
  private read7BitEncodedInt(): number {
    let result = 0
    let shift = 0
    let byte: number
    do {
      if (this.offset >= this.buffer.length) {
        throw new RangeError('BinaryReader: read7BitEncodedInt unexpected end of buffer')
      }
      byte = this.buffer[this.offset++]
      result |= (byte & 0x7f) << shift
      shift += 7
    } while (byte & 0x80)
    return result
  }
}
