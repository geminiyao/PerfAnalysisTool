// 三源 CLI skill 配置（Unity / Perfetto / Simpleperf）

import fs from 'fs';
import path from 'path';
import type { SourceId } from '../../shared/perf-model.js';

export type SkillKind = Extract<SourceId, 'unity_profiler' | 'perfetto' | 'simpleperf'>;

export interface SkillConfig {
  kind: SkillKind;
  skillDirParts: string[];
  skillMdCandidates: string[];
  /** 入库后预构建产物（CLI 成功前应存在） */
  profileSummaryFile: string;
  /** Unity 专用；其它源为 null */
  legacyPreprocessFile: string | null;
  mockOutputSubdirs: string[];
  inputLabel: string;
  reportTitleFallback: string;
}

const SKILL_CONFIGS: Record<SkillKind, SkillConfig> = {
  unity_profiler: {
    kind: 'unity_profiler',
    skillDirParts: ['.claude', 'skills', 'unity-profiler-analysis'],
    skillMdCandidates: ['SKILL.md'],
    profileSummaryFile: 'unity-profile-summary.json',
    legacyPreprocessFile: 'preprocess-result.json',
    mockOutputSubdirs: ['p1-unity', 'p-web-unity'],
    inputLabel: 'Unity Profiler pdata 文件',
    reportTitleFallback: 'Unity Profiler 分析报告',
  },
  perfetto: {
    kind: 'perfetto',
    skillDirParts: ['.claude', 'skills', 'perfetto-trace-analysis'],
    skillMdCandidates: ['SKILL.md', 'skill.md'],
    profileSummaryFile: 'perfetto-profile-summary.json',
    legacyPreprocessFile: null,
    mockOutputSubdirs: ['p1-perfetto', 'p-web-perfetto'],
    inputLabel: 'Perfetto .pftrace 文件',
    reportTitleFallback: 'Perfetto 系统级性能分析报告',
  },
  simpleperf: {
    kind: 'simpleperf',
    skillDirParts: ['.claude', 'skills', 'simpleperf-native-analysis'],
    skillMdCandidates: ['SKILL.md'],
    profileSummaryFile: 'simpleperf-profile-summary.json',
    legacyPreprocessFile: null,
    mockOutputSubdirs: ['p1-simpleperf', 'p-web-simpleperf'],
    inputLabel: 'simpleperf perf.data 文件',
    reportTitleFallback: 'Simpleperf CPU 性能分析报告',
  },
};

export function getSkillConfig(kind: SkillKind): SkillConfig {
  return SKILL_CONFIGS[kind];
}

export function resolveSkillDir(skillProjectPath: string, kind: SkillKind): string {
  return path.join(skillProjectPath, ...SKILL_CONFIGS[kind].skillDirParts);
}

export function resolveSkillMd(skillProjectPath: string, kind: SkillKind): string | null {
  const dir = resolveSkillDir(skillProjectPath, kind);
  for (const name of SKILL_CONFIGS[kind].skillMdCandidates) {
    const fp = path.join(dir, name);
    if (fs.existsSync(fp)) return fp;
  }
  return null;
}

export function missingSkillFiles(skillProjectPath: string, kind: SkillKind): string[] {
  const cfg = SKILL_CONFIGS[kind];
  const dir = resolveSkillDir(skillProjectPath, kind);
  const missing: string[] = [];
  if (!fs.existsSync(dir)) missing.push(dir);
  if (!resolveSkillMd(skillProjectPath, kind)) {
    missing.push(path.join(dir, cfg.skillMdCandidates[0]));
  }
  if (kind === 'unity_profiler') {
    const pre = path.join(dir, 'scripts', 'preprocess.ts');
    if (!fs.existsSync(pre)) missing.push(pre);
  }
  return missing;
}

export function buildSkillPrompt(
  kind: SkillKind,
  skillProjectPath: string,
  inputPath: string,
  outputDir: string,
  extra?: { targetFps?: number },
): string {
  const cfg = SKILL_CONFIGS[kind];
  const skillDir = resolveSkillDir(skillProjectPath, kind).replace(/\\/g, '/');
  const normalizedInput = path.resolve(inputPath).replace(/\\/g, '/');
  const normalizedOutput = path.resolve(outputDir).replace(/\\/g, '/');

  const lines = [
    `请使用 ${skillDir} skill 分析 ${cfg.inputLabel}: ${normalizedInput}。`,
    `输出目录: ${normalizedOutput}。`,
    `请按照该 skill 的原有流程执行（若 profile 已存在于输出目录可跳过 Step 1 出数据，直接读 summary 写报告）。`,
    `请将 performance-report.md 保存到输出目录（若 skill 规范要求带时间戳文件名，同时复制或另存为 performance-report.md），报告用中文。`,
  ];

  if (kind === 'unity_profiler') {
    lines.splice(1, 0, `目标帧率: ${extra?.targetFps ?? 60} FPS。`);
    lines.push('请将 preprocess-result.json 也保存到输出目录。');
  }

  return lines.join(' ');
}

export function normalizeReportInOutputDir(outputDir: string): string | null {
  const direct = path.join(outputDir, 'performance-report.md');
  if (fs.existsSync(direct)) return direct;

  const stamped = fs.readdirSync(outputDir)
    .filter(f => f.startsWith('performance-report') && f.endsWith('.md'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(outputDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  if (!stamped.length) return null;

  const src = path.join(outputDir, stamped[0].name);
  if (stamped[0].name !== 'performance-report.md') {
    fs.copyFileSync(src, direct);
  }
  return direct;
}

export function checkSkillOutput(outputDir: string, kind: SkillKind): {
  ok: boolean;
  hasReport: boolean;
  hasProfile: boolean;
  status: string;
} {
  const cfg = SKILL_CONFIGS[kind];
  let files: string[] = [];
  try {
    files = fs.readdirSync(outputDir);
  } catch {
    files = [];
  }

  const hasReport = files.some(f => f === 'performance-report.md' || (f.startsWith('performance-report') && f.endsWith('.md')));
  const hasSummary = files.includes(cfg.profileSummaryFile);
  const hasLegacy = cfg.legacyPreprocessFile ? files.includes(cfg.legacyPreprocessFile) : false;
  const hasProfile = kind === 'unity_profiler' ? (hasSummary || hasLegacy) : hasSummary;

  const ok = hasReport && hasProfile;
  const status = [
    `profile: ${hasProfile ? '✅' : '❌'}`,
    cfg.legacyPreprocessFile && kind === 'unity_profiler'
      ? `preprocess: ${hasLegacy ? '✅' : '❌'}`
      : null,
    `report: ${hasReport ? '✅' : '❌'}`,
  ].filter(Boolean).join(', ');

  return { ok, hasReport, hasProfile, status };
}
