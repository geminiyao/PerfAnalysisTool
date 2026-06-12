import type { Readable } from 'stream';

export type AssetStorageBackend = 'local' | 'cdn' | 'cos';

export interface StoreAssetInput {
  stream: Readable;
  fileName: string;
  assetType: string;
}

export interface StoredAssetFile {
  fileSize: number;
  sha256: string;
  localPath: string;
  storageBackend: AssetStorageBackend;
}

export interface AssetStat {
  exists: boolean;
  fileSize: number;
  localPath?: string;
}

export interface AssetStorage {
  put(input: StoreAssetInput): Promise<StoredAssetFile>;
  resolveLocalPath(localPath: string): Promise<string>;
  delete(localPath: string): Promise<void>;
  stat(localPath: string): Promise<AssetStat>;
}
