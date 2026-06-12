import { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import path from 'path';
import { getDb } from '../db/index.js';
import { sessions } from '../db/schema.js';
import { assetService } from '../services/asset-service.js';

export async function uploadRoutes(app: FastifyInstance) {
  /**
   * POST /api/upload
   * 上传 .pdata 文件 + 元数据
   * multipart/form-data: file + projectName + version + createdBy + ...
   */
  app.post('/upload', async (request, reply) => {
    const data = await request.file();

    if (!data) {
      return reply.status(400).send({ error: '没有上传文件' });
    }

    // 验证文件类型
    const ext = path.extname(data.filename).toLowerCase();
    if (ext !== '.pdata') {
      return reply.status(400).send({ error: `不支持 "${ext}" 格式，仅支持 Unity Profile Analyzer 导出的 .pdata 文件` });
    }

    const sessionId = uuid();

    // 解析表单中的元数据字段
    const fields = data.fields as Record<string, any>;
    const getMeta = (key: string) => {
      const field = fields[key];
      if (!field) return '';
      if (typeof field === 'object' && 'value' in field) return field.value || '';
      return String(field || '');
    };

    const metadata = {
      projectName: getMeta('projectName'),
      version: getMeta('version'),
      branch: getMeta('branch'),
      device: getMeta('device'),
      scene: getMeta('scene'),
      notes: getMeta('notes'),
      createdBy: getMeta('createdBy'),
    };

    const asset = await assetService.createFromStream({
      stream: data.file,
      fileName: data.filename,
      assetType: 'pdata',
      source: 'web_upload',
      mimeType: data.mimetype,
      metadata,
    });

    // 写入数据库
    const db = getDb();
    await db.insert(sessions).values({
      id: sessionId,
      fileName: data.filename,
      fileSize: asset.fileSize,
      filePath: asset.localPath,
      status: 'pending',
      createdBy: metadata.createdBy,
      projectName: metadata.projectName,
      version: metadata.version,
      branch: metadata.branch || null,
      device: metadata.device || null,
      scene: metadata.scene || null,
      notes: metadata.notes || null,
      createdAt: Date.now(),
    });

    await assetService.linkSessionAsset({
      sessionId,
      sessionType: 'profiler',
      assetId: asset.id,
      role: 'input',
    });

    return reply.status(201).send({
      id: sessionId,
      fileName: data.filename,
      fileSize: asset.fileSize,
      status: 'pending',
      assetId: asset.id,
      sha256: asset.sha256,
      storageBackend: asset.storageBackend,
    });
  });
}
