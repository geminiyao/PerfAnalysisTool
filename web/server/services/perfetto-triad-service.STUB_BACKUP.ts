// Stub service — perfetto triad pipeline is not yet checked into master
// but is referenced by ingest-job-service.ts / run-ingest.ts. This stub keeps
// the web server bootable; calling buildPerfettoTriadReport throws.
//
// Restore the full implementation when the perfetto triad workstream lands.

export interface PerfettoTriadInput {
  role: string;
  perfettoPath: string;
  unityProfilePath?: string;
  simpleperfDataPath?: string;
  binaryCachePath?: string;
  meta?: Record<string, unknown>;
}

export type PerfettoTriadRole = 'base' | 'cur' | 'reference' | string;

export interface PerfettoTriadOptions {
  cliProvider?: string;
  skipAiEnrich?: boolean;
  onLog?: (line: string) => void;
}

export interface PerfettoTriadResult {
  reportPath: string;
  outputDir: string;
  markdown: string;
  usedAi: boolean;
}

export async function buildPerfettoTriadReport(
  _samples: PerfettoTriadInput[],
  _options: PerfettoTriadOptions = {},
): Promise<PerfettoTriadResult> {
  throw new Error(
    'perfetto-triad-service is not implemented in this commit. '
    + 'The simpleperf-diff pipeline is unaffected. '
    + 'Restore web/server/services/perfetto-triad-service.ts from the perfetto branch to enable.',
  );
}
