import { buildPerfettoTriadReport } from '../services/perfetto-triad-service.js';

const samples = [
  {
    role: 'base',
    tracePath: 'G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_base_20260624_104944/2026-06-24_10-49-c1a652.pftrace',
    sampleDir: 'G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_base_20260624_104944',
    label: 'base24',
  },
  {
    role: 'cur',
    tracePath: 'G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_cur_20260624_105041/2026-06-24_10-50-efb338.pftrace',
    sampleDir: 'G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_cur_20260624_105041',
    label: 'cur24',
  },
  {
    role: 'throttle',
    tracePath: 'G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_throttle_20260624_105539/2026-06-24_10-55-2f0696.pftrace',
    sampleDir: 'G:/AOEYZ_Trunk/Tools/AndroidPerfettoScripts/sample_throttle_20260624_105539',
    label: 'throttle24',
  },
] as const;

const result = await buildPerfettoTriadReport(samples as any, {
  meta: { runId: 'triad_e2e_20260624', label: 'perfetto_v52_triad_e2e', projectName: 'AOEYZ' },
  cliProvider: 'codebuddy',
  onLog: line => console.log(line),
});

console.log('TRIAD_RESULT ' + JSON.stringify({
  triadId: result.triadId,
  runIds: result.runIds,
  reportPath: result.reportPath,
  outputDir: result.outputDir,
}));
