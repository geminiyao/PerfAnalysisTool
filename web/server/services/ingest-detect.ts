// 识别上传文件 → 数据源类型 (统一拖放入口)

import path from 'path';

export type DetectedSource = 'unity_profiler' | 'simpleperf' | 'perfetto';

export interface DetectedFiles {
  unity?: string;
  simpleperf?: string;
  perfetto?: string;
  metaJson?: string;
  /** 同目录其它文件 (日志/旁路) */
  extras: string[];
}

const UNITY_EXT = new Set(['.pdata']);
const SIMPLEPERF_EXT = new Set(['.data']);
const PERFETTO_EXT = new Set(['.pftrace', '.perfetto-trace', '.trace']);

function classify(filePath: string): DetectedSource | 'meta' | 'extra' {
  const base = path.basename(filePath).toLowerCase();
  const ext = path.extname(base);
  if (base === 'meta.json') return 'meta';
  if (UNITY_EXT.has(ext)) return 'unity_profiler';
  if (SIMPLEPERF_EXT.has(ext) || base === 'perf.data') return 'simpleperf';
  if (PERFETTO_EXT.has(ext)) return 'perfetto';
  return 'extra';
}

/** 从已落盘文件路径列表识别三源 (每源取第一个匹配)。 */
export function detectSourcesFromPaths(filePaths: string[]): DetectedFiles {
  const out: DetectedFiles = { extras: [] };
  for (const fp of filePaths) {
    const kind = classify(fp);
    switch (kind) {
      case 'unity_profiler':
        if (!out.unity) out.unity = fp;
        else out.extras.push(fp);
        break;
      case 'simpleperf':
        if (!out.simpleperf) out.simpleperf = fp;
        else out.extras.push(fp);
        break;
      case 'perfetto':
        if (!out.perfetto) out.perfetto = fp;
        else out.extras.push(fp);
        break;
      case 'meta':
        if (!out.metaJson) out.metaJson = fp;
        else out.extras.push(fp);
        break;
      default:
        out.extras.push(fp);
    }
  }
  return out;
}

export function detectedSourceIds(d: DetectedFiles): DetectedSource[] {
  const ids: DetectedSource[] = [];
  if (d.unity) ids.push('unity_profiler');
  if (d.simpleperf) ids.push('simpleperf');
  if (d.perfetto) ids.push('perfetto');
  return ids;
}
