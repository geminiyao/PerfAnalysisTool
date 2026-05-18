import { FastifyInstance } from 'fastify';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import { getConfig } from '../utils/config.js';
import { getDb } from '../db/index.js';
import { sessions } from '../db/schema.js';

export async function uploadRoutes(app: FastifyInstance) {
  /**
   * POST /api/upload
   * 上传 .pdata 文件 + 元数据
   * multipart/form-data: file + projectName + version + createdBy + ...
   */
  app.post('/upload', async (request, reply) => {
    const config = getConfig();
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
    const uploadDir = path.join(config.dataDir, 'uploads');
    // 保留原始文件名（去掉路径中不安全字符），便于 CLI 识别
    const safeName = data.filename.replace(/[<>:"|?*]/g, '_');
    const filePath = path.join(uploadDir, `${sessionId}_${safeName}`);

    // 保存文件到磁盘
    await pipeline(data.file, fs.createWriteStream(filePath));

    // 获取文件大小
    const stat = fs.statSync(filePath);

    // 解析表单中的元数据字段
    const fields = data.fields as Record<string, any>;
    const getMeta = (key: string) => {
      const field = fields[key];
      if (!field) return '';
      if (typeof field === 'object' && 'value' in field) return field.value || '';
      return String(field || '');
    };

    // 写入数据库
    const db = getDb();
    await db.insert(sessions).values({
      id: sessionId,
      fileName: data.filename,
      fileSize: stat.size,
      filePath: filePath,
      status: 'pending',
      createdBy: getMeta('createdBy'),
      projectName: getMeta('projectName'),
      version: getMeta('version'),
      branch: getMeta('branch') || null,
      device: getMeta('device') || null,
      scene: getMeta('scene') || null,
      notes: getMeta('notes') || null,
      createdAt: Date.now(),
    });

    return reply.status(201).send({
      id: sessionId,
      fileName: data.filename,
      fileSize: stat.size,
      status: 'pending',
    });
  });
}
