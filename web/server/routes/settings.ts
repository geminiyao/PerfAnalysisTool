import { FastifyInstance } from 'fastify';
import fs from 'fs';
import path from 'path';
import { getConfig, updateConfig } from '../utils/config.js';
import type { ServerConfig } from '../../shared/types.js';

export async function settingsRoutes(app: FastifyInstance) {

  // 获取完整配置（脱敏）
  app.get('/settings', async () => {
    const config = getConfig();
    return {
      sourceProjectPath: config.sourceProjectPath || '',
      skillProjectPath: config.skillProjectPath || '',
      dataDir: config.dataDir,
      maxUploadSize: config.maxUploadSize,
      retentionDays: config.retentionDays,
      port: config.port,
      cliPaths: config.cliPaths || {},
    };
  });

  // 更新配置
  app.put('/settings', async (request, reply) => {
    const body = request.body as Partial<ServerConfig>;

    // 只允许更新白名单字段
    const allowed: (keyof ServerConfig)[] = [
      'sourceProjectPath', 'skillProjectPath', 'maxUploadSize', 'retentionDays', 'cliPaths',
    ];

    const updates: Partial<ServerConfig> = {};
    for (const key of allowed) {
      if (key in body) {
        (updates as any)[key] = (body as any)[key];
      }
    }

    // 验证路径
    if (updates.sourceProjectPath) {
      const p = updates.sourceProjectPath;
      if (!fs.existsSync(p)) {
        return reply.status(400).send({ error: `源码路径不存在: ${p}` });
      }
    }

    if (updates.skillProjectPath) {
      const p = updates.skillProjectPath;
      if (!fs.existsSync(p)) {
        return reply.status(400).send({ error: `Skill 项目路径不存在: ${p}` });
      }
    }

    const newConfig = updateConfig(updates);

    // 同步更新 skill 配置中的 projectPath
    if (updates.sourceProjectPath) {
      syncSkillConfig(newConfig.skillProjectPath, updates.sourceProjectPath);
    }

    return {
      success: true,
      config: {
        sourceProjectPath: newConfig.sourceProjectPath || '',
        skillProjectPath: newConfig.skillProjectPath || '',
        dataDir: newConfig.dataDir,
        maxUploadSize: newConfig.maxUploadSize,
        retentionDays: newConfig.retentionDays,
        port: newConfig.port,
        cliPaths: newConfig.cliPaths || {},
      },
    };
  });
}

/**
 * 将源码路径同步写入 .claude/skills/unity-profiler-analysis/config.json
 */
function syncSkillConfig(skillProjectPath: string, sourceProjectPath: string) {
  const skillConfigPath = path.join(skillProjectPath, '.claude/skills/unity-profiler-analysis/config.json');
  if (!fs.existsSync(skillConfigPath)) return;

  try {
    const content = JSON.parse(fs.readFileSync(skillConfigPath, 'utf-8'));
    content.projectPath = sourceProjectPath;
    fs.writeFileSync(skillConfigPath, JSON.stringify(content, null, 2) + '\n', 'utf-8');
  } catch (e) {
    console.warn('Failed to sync skill config:', e);
  }
}
