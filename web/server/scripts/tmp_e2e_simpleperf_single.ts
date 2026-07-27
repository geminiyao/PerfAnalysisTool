// 跑 simpleperf 单源端到端正式流程
// 模拟 web 上传 perf.data → ingest → buildSimpleperfProfile → executeCli (AI) → 报告

import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { spawn } from 'child_process';
import { getConfig } from '../utils/config.js';
import { buildSimpleperfProfile } from '../services/run-ingest-service.js';
import { saveRun, getRunMetrics } from '../services/run-store.js';
import { runSimpleperfSkillAnalysis } from '../services/run-analysis-service.js';

function ts() { return new Date().toISOString().slice(11, 19); }
function log(stage: string, msg: string) { console.error(`[${ts()}] [${stage}] ${msg}`); }

async function main() {
  const config = getConfig();
  const perfData = 'D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/perf_aoeyz_stressmove.data';
  const binaryCachePath = 'D:/Android/android-ndk-r21e-windows-x86_64/simpleperf/binary_cache';
  if (!fs.existsSync(perfData)) {
    log('init', `perf.data 不存在: ${perfData}`); process.exit(1);
  }

  log('init', `输入: ${perfData}`);
  log('init', `binary cache: ${binaryCachePath}`);

  // ==== Step 1: Provider buildSimpleperfProfile ====
  log('step1', '启动 buildSimpleperfProfile (Provider)...');
  const t1 = Date.now();
  const workDir = path.join(config.dataDir, 'results', `sp_single_${Date.now()}_${uuid().slice(0, 8)}`);
  const meta = {
    label: 'aoeyz-stressmove (单源测试)',
    device: 'PAL-AL00',
    scene: 'aoeyz-stressmove',
    binaryCachePath,
  };

  let profile;
  try {
    profile = await buildSimpleperfProfile(perfData, meta, workDir, (line) => log('provider', line.slice(0, 200)));
  } catch (e: any) {
    log('step1', `❌ Provider 失败: ${e.message}`);
    process.exit(1);
  }
  log('step1', `✅ Provider 完成 (${((Date.now() - t1) / 1000).toFixed(1)}s) workDir=${workDir}`);

  // ==== Step 2: 入库 saveRun ====
  log('step2', 'ingest 入 runs 表...');
  const runId = `run_sp_${Date.now()}_${uuid().slice(0, 6)}`;
  const now = Date.now();
  saveRun({
    id: runId,
    label: meta.label,
    sources: ['simpleperf'],
    status: 'ready',
    meta: { device: meta.device, scene: meta.scene, frameCount: undefined },
    profile,
    createdAt: now,
    completedAt: now,
  });
  const metrics = getRunMetrics(runId);
  log('step2', `✅ runId=${runId} metrics=${metrics.length}`);

  // ==== Step 3: 跑 SKILL（AI 调度） ====
  log('step3', '启动 runSimpleperfSkillAnalysis (simpleperf-native-analysis skill)...');
  const t3 = Date.now();
  let result;
  try {
    result = await runSimpleperfSkillAnalysis(runId, {
      cliProvider: 'codebuddy',
      onLog: (line) => log('skill', line.slice(0, 200)),
    });
  } catch (e: any) {
    log('step3', `❌ Skill 失败: ${e.message}`);
    process.exit(1);
  }
  log('step3', `✅ Skill 完成 (${((Date.now() - t3) / 1000).toFixed(1)}s)`);

  // ==== Step 4: 验证产出 ====
  if (fs.existsSync(result.markdownPath)) {
    const md = fs.readFileSync(result.markdownPath, 'utf-8');
    const lines = md.split('\n').length;
    const sections = md.split('\n').filter(l => /^##\s/.test(l.trim())).length;
    log('done', `✅ 报告: ${result.markdownPath}`);
    log('done', `   ${lines} 行, ${sections} 章节, ${md.length} bytes`);
    console.log(JSON.stringify({ runId, markdownPath: result.markdownPath, lines, sections, bytes: md.length }, null, 2));
  } else {
    log('done', `❌ 报告不存在: ${result.markdownPath}`);
    process.exit(1);
  }
}

main().catch(e => { log('FATAL', e.message); process.exit(1); });
