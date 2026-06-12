import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { eq, and, desc } from 'drizzle-orm';
import type { Readable } from 'stream';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db/index.js';
import { assets, sessionAssets } from '../db/schema.js';
import { getConfig } from '../utils/config.js';
import { LocalAssetStorage, sanitizeFileName } from './storage/local-asset-storage.js';

export interface CreateAssetFromStreamInput {
  stream: Readable;
  fileName: string;
  assetType: string;
  source: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface RegisterExistingAssetInput {
  filePath: string;
  fileName?: string;
  assetType: string;
  source: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface LinkSessionAssetInput {
  sessionId: string;
  sessionType: string;
  assetId: string;
  role: string;
}

export class AssetService {
  private readonly storage: LocalAssetStorage;

  constructor() {
    const config = getConfig();
    this.storage = new LocalAssetStorage(config.assetStorageDir || path.join(config.dataDir, 'assets'));
  }

  async createFromStream(input: CreateAssetFromStreamInput) {
    const stored = await this.storage.put({
      stream: input.stream,
      fileName: input.fileName,
      assetType: input.assetType,
    });

    const now = Date.now();
    const row = {
      id: uuid(),
      assetType: input.assetType,
      source: input.source,
      fileName: sanitizeFileName(input.fileName),
      fileSize: stored.fileSize,
      sha256: stored.sha256,
      storageBackend: stored.storageBackend,
      localPath: stored.localPath,
      remoteKey: null,
      mimeType: input.mimeType || null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: now,
    };

    const db = getDb();
    await db.insert(assets).values(row);
    return row;
  }

  async registerExistingFile(input: RegisterExistingAssetInput) {
    const stat = fs.statSync(input.filePath);
    const sha256 = await sha256File(input.filePath);
    const now = Date.now();
    const row = {
      id: uuid(),
      assetType: input.assetType,
      source: input.source,
      fileName: sanitizeFileName(input.fileName || path.basename(input.filePath)),
      fileSize: stat.size,
      sha256,
      storageBackend: 'local',
      localPath: input.filePath,
      remoteKey: null,
      mimeType: input.mimeType || null,
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      createdAt: now,
    };

    const db = getDb();
    await db.insert(assets).values(row);
    return row;
  }

  async linkSessionAsset(input: LinkSessionAssetInput) {
    const db = getDb();
    const existing = await db
      .select()
      .from(sessionAssets)
      .where(and(
        eq(sessionAssets.sessionId, input.sessionId),
        eq(sessionAssets.sessionType, input.sessionType),
        eq(sessionAssets.assetId, input.assetId),
        eq(sessionAssets.role, input.role),
      ))
      .get();

    if (existing) return existing;

    const row = {
      id: uuid(),
      sessionId: input.sessionId,
      sessionType: input.sessionType,
      assetId: input.assetId,
      role: input.role,
      createdAt: Date.now(),
    };
    await db.insert(sessionAssets).values(row);
    return row;
  }

  async listAssets(limit = 50, offset = 0) {
    const db = getDb();
    return db.select().from(assets).orderBy(desc(assets.createdAt)).limit(limit).offset(offset).all();
  }

  async getAsset(assetId: string) {
    const db = getDb();
    return db.select().from(assets).where(eq(assets.id, assetId)).get();
  }

  async getSessionAssets(sessionId: string, sessionType = 'profiler') {
    const db = getDb();
    const rows = await db
      .select({
        id: sessionAssets.id,
        sessionId: sessionAssets.sessionId,
        sessionType: sessionAssets.sessionType,
        role: sessionAssets.role,
        createdAt: sessionAssets.createdAt,
        asset: assets,
      })
      .from(sessionAssets)
      .innerJoin(assets, eq(sessionAssets.assetId, assets.id))
      .where(and(eq(sessionAssets.sessionId, sessionId), eq(sessionAssets.sessionType, sessionType)))
      .all();
    return rows;
  }

  async resolveLocalPath(assetId: string) {
    const asset = await this.getAsset(assetId);
    if (!asset?.localPath) {
      throw new Error(`Asset 不存在或无本地路径: ${assetId}`);
    }
    return this.storage.resolveLocalPath(asset.localPath);
  }
}

export const assetService = new AssetService();

async function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
