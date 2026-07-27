import { FastifyInstance } from 'fastify';
import fs from 'fs/promises';
import path from 'path';

type ReportKind = 'unity' | 'simpleperf' | 'perfetto' | 'cross';
type ReportMode = 'single' | 'diff';

type ReportPreviewSample = {
  key: string;
  label: string;
  kind: ReportKind;
  mode: ReportMode;
  relativePath: string;
  description: string;
};

const samples: ReportPreviewSample[] = [
  {
    key: 'unity-single',
    label: 'Unity Profiler 单次分析',
    kind: 'unity',
    mode: 'single',
    relativePath: 'unity-single/performance-report.cli-sourcemap.md',
    description: '单份 Unity Profiler 数据的帧耗、Marker、源码映射与优化建议。',
  },
  {
    key: 'unity-diff',
    label: 'Unity Profiler 对比分析',
    kind: 'unity',
    mode: 'diff',
    relativePath: 'unity-diff/performance-report.ai-thickened.md',
    description: '两份 Unity Profiler 数据的帧耗回归、Marker Δ 与源码级归因。',
  },
  {
    key: 'simpleperf-single',
    label: 'simpleperf 单次分析',
    kind: 'simpleperf',
    mode: 'single',
    relativePath: 'simpleperf-single/performance-report.web-stressmove.md',
    description: '单份 simpleperf CPU 采样报告的线程、SO、函数热点与符号质量。',
  },
  {
    key: 'simpleperf-diff',
    label: 'simpleperf 对比分析',
    kind: 'simpleperf',
    mode: 'diff',
    relativePath: 'simpleperf-diff/performance-report.web-v4-diff.md',
    description: '两份 simpleperf 数据的 CPU 样本增量、热点回归与差分火焰图线索。',
  },
  {
    key: 'perfetto-single',
    label: 'Perfetto 单次分析',
    kind: 'perfetto',
    mode: 'single',
    relativePath: 'perfetto-single/performance-report.e2e-l3-filled.md',
    description: '单份 Perfetto trace 的线程状态、Wait、频率、热状态与调度解释。',
  },
  {
    key: 'perfetto-diff',
    label: 'Perfetto 对比分析',
    kind: 'perfetto',
    mode: 'diff',
    relativePath: 'perfetto-diff/performance-report.e2e-l3-triad.md',
    description: 'Perfetto 多态/三态对比中的 Running、Sleeping、Wait 与热状态变化。',
  },
  {
    key: 'cross-single',
    label: '三源综合单次分析',
    kind: 'cross',
    mode: 'single',
    relativePath: 'cross-single/performance-report.fallback-builder.md',
    description: 'Unity、simpleperf、Perfetto 三源综合的单次诊断证据链。',
  },
  {
    key: 'cross-diff',
    label: '三源综合对比分析',
    kind: 'cross',
    mode: 'diff',
    relativePath: 'cross-diff/README.md',
    description: '三源综合对比分析占位样例，保留原始说明内容。',
  },
];

const samplesRoot = path.resolve(process.cwd(), '../output/samples');

export async function reportPreviewRoutes(app: FastifyInstance) {
  app.get('/report-preview/samples', async (_request, reply) => {
    const items = await Promise.all(samples.map(async sample => ({
      ...sample,
      available: await exists(resolveSamplePath(sample.relativePath)),
    })));
    return reply.send({ items });
  });

  app.get('/report-preview/samples/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const sample = samples.find(item => item.key === key);
    if (!sample) {
      return reply.status(404).send({ error: '报告样例不存在' });
    }

    const filePath = resolveSamplePath(sample.relativePath);
    if (!filePath.startsWith(samplesRoot)) {
      return reply.status(400).send({ error: '非法报告路径' });
    }

    try {
      const markdown = await fs.readFile(filePath, 'utf-8');
      return reply.send({ ...sample, available: true, markdown });
    } catch {
      return reply.status(404).send({ error: '报告文件不存在', ...sample, available: false, markdown: '' });
    }
  });
}

function resolveSamplePath(relativePath: string): string {
  return path.resolve(samplesRoot, relativePath);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
