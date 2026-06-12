import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import type { AssetStat, AssetStorage, StoreAssetInput, StoredAssetFile } from './types.js';

export class LocalAssetStorage implements AssetStorage {
  constructor(private readonly rootDir: string) {}

  async put(input: StoreAssetInput): Promise<StoredAssetFile> {
    const targetDir = path.join(this.rootDir, this.resolveSubDir(input.assetType));
    fs.mkdirSync(targetDir, { recursive: true });

    const safeName = sanitizeFileName(input.fileName);
    const assetId = crypto.randomUUID();
    const localPath = path.join(targetDir, `${assetId}_${safeName}`);
    const hash = crypto.createHash('sha256');
    let fileSize = 0;

    const hashStream = new Transform({
      transform(chunk, _encoding, callback) {
        fileSize += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    await pipeline(input.stream, hashStream, fs.createWriteStream(localPath));

    return {
      fileSize,
      sha256: hash.digest('hex'),
      localPath,
      storageBackend: 'local',
    };
  }

  async resolveLocalPath(localPath: string): Promise<string> {
    return localPath;
  }

  async delete(localPath: string): Promise<void> {
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
  }

  async stat(localPath: string): Promise<AssetStat> {
    if (!fs.existsSync(localPath)) {
      return { exists: false, fileSize: 0 };
    }
    const stat = fs.statSync(localPath);
    return { exists: true, fileSize: stat.size, localPath };
  }

  private resolveSubDir(assetType: string): string {
    switch (assetType) {
      case 'pdata':
        return path.join('raw', 'pdata');
      case 'perf_data':
      case 'binary_cache':
        return path.join('raw', 'simpleperf');
      case 'perfetto_trace':
        return path.join('raw', 'perfetto');
      case 'report_json':
      case 'report_md':
        return path.join('generated', 'reports');
      case 'flamegraph_svg':
        return path.join('generated', 'flamegraphs');
      case 'folded_stack':
      case 'summary_json':
        return path.join('generated', 'summaries');
      default:
        return path.join('raw', 'misc');
    }
  }
}

export function sanitizeFileName(fileName: string): string {
  const baseName = path.basename(fileName || 'asset.bin');
  return baseName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
}
