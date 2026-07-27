import { FastifyInstance } from 'fastify';
import fs from 'fs/promises';
import path from 'path';
import { buildUnitySingleReportBundle } from '../services/unity-single-bundle-adapter.js';

type ReportViewerSample = {
  key: string;
  label: string;
  reportType: 'unity-single';
  summaryPath: string;
  markdownPath: string;
  description: string;
};

const projectRoot = path.resolve(process.cwd(), '..');

const samples: ReportViewerSample[] = [
  {
    key: 'unity-single',
    label: 'Unity Profiler 单次分析',
    reportType: 'unity-single',
    summaryPath: 'output/p1-unity/unity-profile-summary.json',
    markdownPath: 'output/samples/unity-single/performance-report.cli-sourcemap.md',
    description: 'JSON 驱动报告视图 · unity-single 样例',
  },
];

export async function reportViewerRoutes(app: FastifyInstance) {
  app.get('/report-view/samples', async (_request, reply) => {
    const items = await Promise.all(samples.map(async sample => ({
      key: sample.key,
      label: sample.label,
      reportType: sample.reportType,
      description: sample.description,
      available: await exists(resolveProjectPath(sample.summaryPath)),
    })));
    return reply.send({ items });
  });

  app.get('/report-view/bundle/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const sample = samples.find(item => item.key === key);
    if (!sample) {
      return reply.status(404).send({ error: '报告样例不存在' });
    }

    try {
      const summaryPath = resolveProjectPath(sample.summaryPath);
      const markdownPath = resolveProjectPath(sample.markdownPath);
      const [summaryRaw, markdown] = await Promise.all([
        fs.readFile(summaryPath, 'utf-8'),
        fs.readFile(markdownPath, 'utf-8'),
      ]);
      const summary = JSON.parse(summaryRaw);
      const bundle = buildUnitySingleReportBundle(summary, markdown, {
        title: sample.label,
        generatedAt: new Date().toISOString(),
        dataSources: {
          summary: sample.summaryPath,
          narrative: sample.markdownPath,
        },
      });
      return reply.send(bundle);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({ error: `构建 ReportBundle 失败: ${message}` });
    }
  });
}

function resolveProjectPath(relativePath: string): string {
  const resolved = path.resolve(projectRoot, relativePath);
  if (!resolved.startsWith(projectRoot)) {
    throw new Error('非法路径');
  }
  return resolved;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
