/**
 * narrative-service.ts — Prism 叙事阶段 service（DR-44 需求 B2）
 *
 * 数据源无关：unity / perfetto / simpleperf 共用同一份 narrative-prompt.txt。
 * 读 findings.json + verdict.json，spawn CLI 让 LLM 产出 narrative.json。
 *
 * 三段管线（DR-44）：
 *   explore LLM → findings.json  （explore-service.ts）
 *   narrative LLM → narrative.json（本文件）
 *   render 纯代码 → report.html  （render-html.ts）
 *
 * 参照 explore-service.ts 的 spawn CLI 模式，但更简单——narrative 阶段不需要
 * ledger/verify（LLM 只读 findings/verdict 写 narrative.json，不调工具）。
 *
 * Usage:
 *   import { runPrismNarrative } from './narrative-service.js';
 *   await runPrismNarrative({ source: 'perfetto', outputDir: '<run-dir>' });
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveCliExecutable, spawnCliProcess, cliUnavailableHint } from '../utils/cli-resolver.js';
import { getConfig } from '../utils/config.js';
import type { NarrativeReport, NarrativeProvenance } from './narrative-types.js';
import { appendMemory } from './prism-memory.js';
import { formatMemoryForPrompt } from './explore-service.js';

// ESM 兼容：__dirname 在 ESM 下未定义
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ──────────────────────────────── 类型 ────────────────────────────────

export interface RunPrismNarrativeOpts {
  /** 数据源标识。决定 {{REPORT_TEMPLATE}} 注入哪个模板（WT-028 填，本阶段先用空）。 */
  source?: 'unity' | 'perfetto';
  /** 运行 ID（默认按 source 推导）。 */
  runId?: string;
  /** 输出目录（含 findings.json + verdict.json，写 narrative.json）。必填或由 runId 推导。 */
  outputDir?: string;
  /** CLI 提供方。 */
  cliProvider?: 'codebuddy' | 'claude';
  /** 超时毫秒（默认 10 分钟）。 */
  timeoutMs?: number;
}

export interface NarrativeRunResult {
  success: boolean;
  runId: string;
  outputDir: string;
  narrativePath: string;
  narrative?: NarrativeReport;
  error?: string;
}

// ──────────────────────────────── CLI providers ────────────────────────────────

// 同 explore-service.ts：prompt 走 stdin，-p 无值让 CLI 读 stdin
const NARRATIVE_CLI_PROVIDERS: Record<string, (prompt: string) => string[]> = {
  codebuddy: (_prompt) => [
    '-p',
    '--output-format', 'stream-json',
    '-y',
    '--allowedTools', 'Read,Write',
  ],
  claude: (_prompt) => [
    '-p',
    '--output-format', 'stream-json',
    '--allowedTools', 'Read,Write',
  ],
};

// ──────────────────────────────── 工具函数 ────────────────────────────────

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

function makeNarrativeError(
  runId: string,
  outputDir: string,
  narrativePath: string,
  error: string,
): NarrativeRunResult {
  return { success: false, runId, outputDir, narrativePath, error };
}

// ──────────────────────────────── 占位符替换 ────────────────────────────────

/**
 * 注入数据源特定的报告章节模板（DR-44 §3.2 + DR-45 §三 断链 1 修复）。
 *
 * 按 source 选 prompts/report-templates/<source>-multi-state.txt。
 * 模板文件存在则读出全文注入 {{REPORT_TEMPLATE}}；不存在则注入降级提示
 * （narrative-prompt 看到提示就知道模板没注入，用默认骨架）。
 *
 * DR-45 §8.1：占位符填充必须可测。harness 会断言本函数不返回空字符串且含 readFileSync。
 * 严禁硬编码返回空字符串短路——占位符被短路 = 注入机制形同虚设，是隐蔽性最强的 bug。
 */
function resolveReportTemplate(source: string, _outputDir: string): string {
  const templateDir = path.join(__dirname, 'prompts', 'report-templates');
  const templatePath = path.join(templateDir, `${source}-multi-state.txt`);
  if (!fs.existsSync(templatePath)) {
    // 降级：模板文件不存在（如 single-state 模式或未建模板的数据源）
    // 不报错，但 harness [1] 节会标记 SKIP 并提示检查。
    // 注：返回降级提示而非空字符串，避免 {{REPORT_TEMPLATE}} 被静默短路（DR-45 §8.1）。
    console.warn(`[narrative] report template not found, using default skeleton: ${templatePath}`);
    return `[NOTE: report template for source="${source}" not found at ${templatePath}. Using default narrative skeleton.]\n`;
  }
  return fs.readFileSync(templatePath, 'utf-8');
}

// ──────────────────────────────── WT-034: narrative 红队回路 ────────────────────────────────

/** 红队复扫发现的写作缺口（对照 v5.3 标杆 4 维度 + 父子归并） */
interface NarrativeGap {
  /** 缺口类型：thread-coverage（多线程覆盖不足）/ visual-asset-empty（视觉资产全空）/ callTree-missing（topConclusions 无 callTree）/ redline-missing（callTree 无红线标注）/ redline-parent-child-dup（红线清单父子重复）/ section-layout-chaos（章节编排乱） */
  type: 'thread-coverage' | 'visual-asset-empty' | 'callTree-missing' | 'redline-missing' | 'redline-parent-child-dup' | 'section-layout-chaos';
  /** 对照标杆的引用（如 "v5.3 §3 多线程宏观 7 类线程"） */
  benchmarkRef?: string;
  /** 教训文本：哪个 run、哪个缺口、怎么改 prompt 让下次补上 */
  lessonText: string;
}

interface RedTeamResult {
  gaps: NarrativeGap[];
}

/**
 * WT-036: 从 perfetto-profile-summary.json 读 callTree，建 nodeName -> Set(所有祖先名) map。
 * 用于红队回路检测红线清单的父子关系（不只靠名字前缀——简写 module 名前缀匹配抓不住）。
 *
 * perfetto triad 数据目录：outputDir 是 .../<runBase>/<timestamp>，triad root = <runBase>，
 * cur/perfetto-profile-summary.json 在 <runBase>/cur/ 下（多态报告用 cur 态作主树）。
 */
function buildCallTreeAncestorMap(outputDir: string): Map<string, Set<string>> {
  const ancestorMap = new Map<string, Set<string>>();
  try {
    const triadRoot = path.dirname(outputDir);  // 去掉时间戳子目录
    const summaryPath = path.join(triadRoot, 'cur', 'perfetto-profile-summary.json');
    if (!fs.existsSync(summaryPath)) return ancestorMap;
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
    const callTrees = Array.isArray(summary.callTrees) ? summary.callTrees : [];
    if (callTrees.length === 0) return ancestorMap;
    const root = callTrees[0].root;
    if (!root) return ancestorMap;

    // 递归建祖先链：每个节点记录从 root 到自己的所有祖先名
    function buildAncestors(node: any, ancestors: string[]) {
      const name = String(node.name ?? '');
      if (name) ancestorMap.set(name, new Set(ancestors));
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          buildAncestors(child, [...ancestors, name]);
        }
      }
    }
    buildAncestors(root, []);
  } catch {
    // 读 callTree 失败 = 跳过 callTree 检测，只靠前缀匹配
  }
  return ancestorMap;
}

/**
 * WT-036: 检测 a 是否是 b 的父节点（b 是 a 的子节点）。
 * 三层检测：
 *   1. 前缀匹配：b 以 a + "." 或 a + ":" 开头（如 Core.Update 是 Core.Update.LuaMgr 的父节点）
 *   2. callTree 真实父子：在 ancestorMap 里找 b 的节点，检查 a 是否在 b 的祖先链里
 *   3. 模糊包含：a 是 b 的子串（如 "LuaMgr" 是 "CS:AOE.LuaMgr" 的子串）——但要排除无关节点同名
 */
function isParentOf(a: string, b: string, ancestorMap: Map<string, Set<string>>): boolean {
  if (!a || !b || a === b) return false;

  // 1. 前缀匹配
  if (b.startsWith(a + '.') || b.startsWith(a + ':')) return true;

  // 2. callTree 真实父子：在 ancestorMap 里找匹配 b 的节点名，检查 a 是否在祖先链里
  if (ancestorMap.size > 0) {
    // 模糊匹配：narrative 里的 module 名可能是简写（如 "BattleHeadMgr.OnUpdate"），
    // callTree 里的节点名可能是全名（如 "BattleHeadMgr"）或反过来
    for (const [node_name, ancestors] of ancestorMap) {
      const bMatches = node_name === b || node_name.includes(b) || b.includes(node_name);
      if (!bMatches) continue;
      // 检查 a 是否在 b 的祖先链里（模糊匹配）
      for (const ancestor of ancestors) {
        if (ancestor === a || ancestor.includes(a) || a.includes(ancestor)) {
          // 排除无关节点同名（如 "Core.Update" 不能匹配 "Update"）
          if (a.length >= 4 || ancestor === a) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

/**
 * WT-036: 自动修复红线清单父子同列问题。
 * LLM 反复违反"统筹与拆出互斥"规则（列了父节点又列子节点），靠 prompt 引导不住。
 * 修复策略：检测到父子同列时，删除子节点行（保留父节点），因为父节点的 hotspot 列已包含子节点信息。
 *
 * 返回删除的行数。修复直接改 narrative 对象（调用方负责重写 narrative.json）。
 */
function fixRedlineParentChildDup(narrative: NarrativeReport, outputDir: string): number {
  const ancestorMap = buildCallTreeAncestorMap(outputDir);
  let removed = 0;

  for (const sec of narrative.sections) {
    for (const item of sec.items) {
      if (!item.visualAsset || item.visualAsset.type !== 'table' || !/红线/.test(item.visualAsset.title)) continue;
      const table = item.visualAsset.table;
      if (!table || !table.rows || table.rows.length < 2) continue;

      // 收集所有 module 名（第一列）
      const modules = table.rows.map(r => String(r[0] ?? '').trim()).filter(Boolean);
      if (modules.length < 2) continue;

      // 找出所有"是某个其它模块的子节点"的模块（要删除的）
      const childIndices = new Set<number>();
      for (let i = 0; i < modules.length; i++) {
        for (let j = 0; j < modules.length; j++) {
          if (i === j) continue;
          // modules[j] 是 modules[i] 的父节点 → 删 i（子节点）
          if (isParentOf(modules[j], modules[i], ancestorMap)) {
            childIndices.add(i);
            break;  // 一个模块只要是任何其它模块的子节点就删
          }
        }
      }

      if (childIndices.size === 0) continue;

      // 删除子节点行（从后往前删，避免索引错位）
      const sortedIndices = [...childIndices].sort((a, b) => b - a);
      for (const idx of sortedIndices) {
        const removedModule = table.rows[idx][0];
        table.rows.splice(idx, 1);
        removed++;
        console.log(`[narrative] fixRedlineParentChildDup: removed child row "${removedModule}"`);
      }
    }
  }
  return removed;
}

/**
 * 纯代码规则复扫 narrative.json，对照 v5.3 标杆 4 维度检查写作质量缺口。
 * 不调 LLM（规则检查秒级完成），发现的缺口沉淀为 lessons 供下次 narrative-prompt 注入。
 *
 * 4 维度检查（对照 v5.3 标杆）+ 父子归并 + 章节编排：
 *   1. 多线程覆盖：title 含"多线程"的 visualAsset table 行数 < 5 = 缺口（v5.3 §3 有 7 类线程）
 *   2. 视觉资产全空：所有 item.visualAsset 为空 = 缺口
 *   3. topConclusions 无 callTree：critical/high 行无 callTree/asciiArt = 缺口（v5.3 §0 每条配图）
 *   4. callTree 无红线标注：findings.json 无 callTreeAnnotations = 缺口（v5.3 §5 节点标 🔴/🟡）
 *   5. redlineMatrix 父子重复：红线清单 visualAsset.table 的 module 列父子节点同时出现 = 缺口（DR-41 规则 2）
 *   6. 章节编排乱：sections heading 不含 §X 章节号 = 缺口（v5.3 §0-§7 八章节）
 *
 * WT-036: 视觉资产从顶层字段移到 sections[].items[].visualAsset，扫描方式同步改。
 */
function runNarrativeRedTeam(
  narrative: NarrativeReport,
  outputDir: string,
  runId: string,
): RedTeamResult {
  const gaps: NarrativeGap[] = [];

  // WT-036 辅助：收集所有 item.visualAsset
  const allVisualAssets: { title: string; type: string; table?: { headers: string[]; rows: string[][] } }[] = [];
  for (const sec of narrative.sections) {
    for (const item of sec.items) {
      if (item.visualAsset) {
        allVisualAssets.push({
          title: item.visualAsset.title,
          type: item.visualAsset.type,
          table: item.visualAsset.table,
        });
      }
    }
  }

  // 1. 多线程覆盖检查（扫 title 含"多线程"的 visualAsset table 行数）
  let threadCount = 0;
  for (const asset of allVisualAssets) {
    if (/多线程/.test(asset.title) && asset.table?.rows) {
      threadCount += asset.table.rows.length;
    }
  }
  if (threadCount < 5) {
    gaps.push({
      type: 'thread-coverage',
      benchmarkRef: 'v5.3 §3 多线程宏观 7 类线程',
      lessonText: `runId=${runId} 的 narrative 多线程宏观表只覆盖 ${threadCount} 行（< 5，v5.3 标杆有 7 类：UnityMain/Render/RHI/LuaMtGC/ECSWorker/Audio/Choreographer）。修法：explore 阶段对 topN 榜里每个识别线程类型单独 querySchedState 查三态，narrative 的 §2 section item.visualAsset (title 含"多线程") 的 table.rows 必须覆盖 findings 里所有识别线程，Audio 线程池 5 个子线程各占一行不许合并。`,
    });
  }

  // 2. 视觉资产全空检查（扫 item.visualAsset，不是顶层字段）
  if (allVisualAssets.length === 0) {
    gaps.push({
      type: 'visual-asset-empty',
      benchmarkRef: 'v5.3 §0-§5 视觉资产',
      lessonText: `runId=${runId} 的 narrative 所有 item.visualAsset 为空。修法：narrative LLM 必须按 {{REPORT_TEMPLATE}} 注入的模板章节骨架在 item 里填 visualAsset（type=table/matrix/ascii）——可能 {{REPORT_TEMPLATE}} 没注入或 LLM 忽略了模板。检查 resolveReportTemplate 是否真的读到了 perfetto-multi-state.txt。`,
    });
  }

  // 3. topConclusions 无 callTree 检查
  const criticalHigh = (narrative.topConclusions ?? []).filter(
    c => c.severity === 'critical' || c.severity === 'high'
  );
  if (criticalHigh.length > 0) {
    const withCallTree = criticalHigh.filter(c => c.callTree || c.asciiArt);
    const ratio = withCallTree.length / criticalHigh.length;
    if (ratio < 0.5) {
      gaps.push({
        type: 'callTree-missing',
        benchmarkRef: 'v5.3 §0 三大结论配 ASCII 调用树',
        lessonText: `runId=${runId} 的 narrative critical/high topConclusion 挂 callTree/asciiArt 比率 ${(ratio * 100).toFixed(0)}% (< 50%，v5.3 §0 每条核心结论都配调用树/ASCII 图)。修法：rank 1-3 的 critical/high topConclusion 必须给 callTree.rootMarker 或 asciiArt——callTree.rootMarker 指向 findings 里查过的调用树根节点，render 会重查画彩色 flame-bar。`,
      });
    }
  }

  // 4. callTree 无红线标注检查（读 findings.json 看 callTreeAnnotations）
  const findingsPath = path.join(outputDir, 'findings.json');
  if (fs.existsSync(findingsPath)) {
    try {
      const findings = JSON.parse(fs.readFileSync(findingsPath, 'utf-8'));
      if (Array.isArray(findings)) {
        let annotationsCount = 0;
        for (const f of findings) {
          const evidence = f?.evidence;
          if (!evidence) continue;
          const evidenceList = Array.isArray(evidence) ? evidence : [evidence];
          for (const ev of evidenceList) {
            const anns = ev?.resultDigest?.callTreeAnnotations;
            if (Array.isArray(anns)) annotationsCount += anns.length;
          }
        }
        if (annotationsCount === 0) {
          gaps.push({
            type: 'redline-missing',
            benchmarkRef: 'v5.3 §5 callTree 节点 🔴/🟡 标注',
            lessonText: `runId=${runId} 的 findings.json 无 callTreeAnnotations 字段（v5.3 §5 callTree 节点标 🔴/🟡/🟢 严重程度）。修法：explore LLM 用 getPerfettoCallTree / queryCallTreeSubtree 查调用树时，在 finding 的 evidence.resultDigest.callTreeAnnotations 里给每个关键节点标 redlineFlag/foldChange/severityTag。render 层会从 findings 读这些标注注入 callTree 节点。`,
          });
        }
      }
    } catch {
      // findings.json 解析失败 = 跳过红线检查（容错）
    }
  }

  // 5. 红线清单父子重复检查（DR-41 规则 2 子树归并，递归）
  //    WT-036: 红线清单在 visualAsset.table 里（title 含"红线"），module 列是第一列
  //    用 callTree 真实父子关系检测（不只靠名字前缀——前缀匹配抓不住简写 module 名）
  const redlineModules: string[] = [];
  for (const asset of allVisualAssets) {
    if (/红线/.test(asset.title) && asset.table?.rows) {
      for (const row of asset.table.rows) {
        const module = String(row[0] ?? '').trim();  // module 列是第一列
        if (module) redlineModules.push(module);
      }
    }
  }
  if (redlineModules.length > 1) {
    // 建祖先链 map：nodeName -> Set(所有祖先名)，从 perfetto callTree 真实父子关系构建
    const ancestorMap = buildCallTreeAncestorMap(outputDir);
    const duplicates: string[] = [];
    for (let i = 0; i < redlineModules.length; i++) {
      for (let j = 0; j < redlineModules.length; j++) {
        if (i === j) continue;
        const a = redlineModules[i];
        const b = redlineModules[j];
        // 三层检测：前缀匹配 + callTree 真实父子 + 模糊包含
        const isParent = isParentOf(a, b, ancestorMap);
        if (isParent) {
          duplicates.push(`${a} → ${b}`);
        }
      }
    }
    if (duplicates.length > 0) {
      gaps.push({
        type: 'redline-parent-child-dup',
        benchmarkRef: 'DR-41 规则 2 子树归并（递归）+ v5.3 §5 红线清单',
        lessonText: `runId=${runId} 的红线清单 visualAsset.table 父子节点同时出现：${duplicates.join('; ')}。违反 DR-41 规则 2 子树归并——同一开销被计算两次。归并规则要递归应用每一层：Core.Update → LuaMgr（大头拆出）→ BattleHeadMgr/MapSignificanceMgr（LuaMgr 下子节点比较平均，统筹在 LuaMgr，hotspot 列子节点）。MapManager → OutSideViewArmyLineMgr（大头拆出，不列 MapManager）。修法：如果父模块下的子节点都比较平均 → 统筹在父模块，hotspot 列列前 2 个子节点；如果父模块下有明显大头子节点 → 拆分出大头子节点，不列父模块。递归应用——拆出来的大头子节点，如果它下面还有大头子节点，继续拆。`,
      });
    }
  }

  // 6. 章节编排检查：sections heading 应含 §X 章节号（对照 v5.3 §0-§7 八章节）
  const sectionsWithSectionNumber = (narrative.sections ?? []).filter(s =>
    /§[0-7]/.test(String(s.heading ?? '')) || /§/.test(String(s.heading ?? ''))
  );
  if ((narrative.sections ?? []).length > 0 && sectionsWithSectionNumber.length === 0) {
    gaps.push({
      type: 'section-layout-chaos',
      benchmarkRef: 'v5.3 §0-§7 八章节骨架',
      lessonText: `runId=${runId} 的 sections heading 都不含 §X 章节号（v5.3 标杆是 §0-§7 八章节）。修法：narrative LLM 按 {{REPORT_TEMPLATE}} 注入的模板章节骨架组织 sections，每个 section 的 heading 以 §X 开头（如 "§0 结论先行：..." / "§1 采集元信息：..."）。render 层会按 heading 模糊匹配合并视觉资产到对应 §X section。`,
    });
  }

  return { gaps };
}

// ──────────────────────────────── 主入口 ────────────────────────────────

export async function runPrismNarrative(
  opts: RunPrismNarrativeOpts = {},
): Promise<NarrativeRunResult> {
  const source = opts.source ?? 'unity';
  const runId = opts.runId ?? (source === 'perfetto' ? 'bk26b-perfetto-triad' : 'unity-outside-stressmove');
  const config = getConfig();

  // Resolve outputDir（含 findings.json + verdict.json）
  const repoRoot = path.resolve(__dirname, '../../..');
  const outputDir = opts.outputDir
    ? path.resolve(repoRoot, opts.outputDir)
    : path.join(repoRoot, 'web', 'data', 'prism-out', runId);

  const narrativePath = path.join(outputDir, 'narrative.json');
  const findingsPath = path.join(outputDir, 'findings.json');
  const verdictPath = path.join(outputDir, 'verdict.json');

  // 前置检查：findings.json + verdict.json 必须存在
  if (!fs.existsSync(findingsPath)) {
    return makeNarrativeError(runId, outputDir, narrativePath,
      `findings.json not found: ${findingsPath}. Run explore stage first (runPrismExplore).`);
  }
  if (!fs.existsSync(verdictPath)) {
    return makeNarrativeError(runId, outputDir, narrativePath,
      `verdict.json not found: ${verdictPath}. Run explore stage first (runPrismExplore).`);
  }

  // 加载并替换 narrative-prompt.txt（数据源无关）
  const promptTemplatePath = path.join(__dirname, 'prompts', 'narrative-prompt.txt');
  if (!fs.existsSync(promptTemplatePath)) {
    return makeNarrativeError(runId, outputDir, narrativePath,
      `narrative-prompt.txt not found: ${promptTemplatePath}`);
  }

  let promptText = fs.readFileSync(promptTemplatePath, 'utf-8');
  const outputDirPosix = toPosix(outputDir);
  promptText = promptText.replace(/\{\{OUTPUT_DIR\}\}/g, outputDirPosix);
  promptText = promptText.replace(/\{\{RUN_ID\}\}/g, runId);
  // DR-44 §3.2: {{REPORT_TEMPLATE}} 按数据源注入章节模板（WT-028 填，本阶段为空）
  const reportTemplate = resolveReportTemplate(source, outputDir);
  promptText = promptText.replace(/\{\{REPORT_TEMPLATE\}\}/g, reportTemplate);
  // WT-034: {{MEMORY_INJECTION}} 注入 lessons 回路（对称 explore-service.ts:711）
  // 沉淀历次 narrative 红队复扫的写作缺口教训，让本次写作吸收历史经验
  promptText = promptText.replace(/\{\{MEMORY_INJECTION\}\}/g, formatMemoryForPrompt());

  // Resolve CLI
  const provider = opts.cliProvider ?? 'codebuddy';
  const { command: cliCommand, resolved } = resolveCliExecutable(provider, config.cliPaths?.[provider]);

  if (!resolved) {
    return makeNarrativeError(runId, outputDir, narrativePath, cliUnavailableHint(provider));
  }

  const buildArgs = NARRATIVE_CLI_PROVIDERS[provider];
  if (!buildArgs) {
    return makeNarrativeError(runId, outputDir, narrativePath, `Unknown CLI provider: ${provider}`);
  }
  const args = buildArgs(promptText);

  console.log(`[narrative] Spawning ${provider} CLI (${cliCommand})...`);
  console.log(`[narrative] source=${source}, runId=${runId}, outputDir=${outputDirPosix}`);

  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;

  return new Promise<NarrativeRunResult>((resolve) => {
    let settled = false;
    let stdoutBuffer = '';

    const child = spawnCliProcess(cliCommand, args, {
      cwd: config.skillProjectPath,
      env: process.env,
      windowsHide: true,
      stdio: 'pipe',
    });

    // Pipe prompt via stdin（同 explore-service：避免 Windows .cmd 长参数截断）
    try {
      child.stdin?.write(promptText);
      child.stdin?.end();
    } catch (e: any) {
      console.error(`[narrative] stdin write failed: ${e?.message || e}`);
    }

    const doResolve = (result: NarrativeRunResult) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };

    const timeoutHandle = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
      }
      doResolve(makeNarrativeError(runId, outputDir, narrativePath,
        `Narrative stage timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout?.on('data', (data: Buffer) => {
      stdoutBuffer += data.toString();
    });

    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[narrative] stderr: ${data.toString()}`);
    });

    child.on('close', (exitCode: number | null) => {
      clearTimeout(timeoutHandle);

      if (exitCode !== 0 && exitCode !== null) {
        return doResolve(makeNarrativeError(runId, outputDir, narrativePath,
          `CLI exited with code ${exitCode}`));
      }

      // 检查 narrative.json 是否产出
      if (!fs.existsSync(narrativePath)) {
        return doResolve(makeNarrativeError(runId, outputDir, narrativePath,
          `narrative.json not written by LLM. stdout tail: ${stdoutBuffer.slice(-500)}`));
      }

      // 读并校验 narrative.json
      try {
        const raw = fs.readFileSync(narrativePath, 'utf-8');
        const narrative = JSON.parse(raw) as NarrativeReport;

        // DR-44 A2: provenance 强制校验（同 render-html.ts）
        const prov: NarrativeProvenance | undefined = narrative.narrativeProvenance;
        if (!prov || prov.generatedBy !== 'LLM') {
          const actual = prov?.generatedBy ?? 'missing';
          return doResolve(makeNarrativeError(runId, outputDir, narrativePath,
            `narrativeProvenance.generatedBy !== 'LLM' (got: ${actual}). ` +
            `Script-generated narrative.json rejected (DR-44 A2).`));
        }

        console.log(`[narrative] OK: ${narrativePath}`);
        console.log(`[narrative] overview: ${narrative.overview?.slice(0, 80) ?? '(empty)'}`);
        console.log(`[narrative] topConclusions: ${narrative.topConclusions?.length ?? 0}`);
        console.log(`[narrative] sections: ${narrative.sections?.length ?? 0}`);

        // WT-034: narrative 红队回路 + lessons 沉淀（软约束，不阻塞主产出）
        // 对照 v5.3 标杆 4 维度（多线程覆盖/视觉资产/callTree/红线标注）复扫 narrative.json，
        // 发现缺口 → 沉淀 lessons → 下次 narrative-prompt 注入让 LLM 吸收
        try {
          const redTeamResult = runNarrativeRedTeam(narrative, outputDir, runId);
          if (redTeamResult.gaps.length > 0) {
            console.log(`[narrative] red-team found ${redTeamResult.gaps.length} gaps, sedimenting lessons...`);
            for (const gap of redTeamResult.gaps) {
              const lessonId = `lesson-${runId}-${gap.type}-${Date.now()}`;
              appendMemory('lessons', {
                id: lessonId,
                title: `${gap.type}: ${gap.benchmarkRef ?? 'v5.3 标杆'}`,
                content: gap.lessonText,
                source: `narrative-redteam/${runId}`,
              });
            }
            console.log(`[narrative] sedimented ${redTeamResult.gaps.length} lessons to prism-memory/lessons/`);

            // WT-036: 红线清单父子同列自动修复（LLM 反复违反归并规则，靠 prompt 引导不住）
            // 检测到 redline-parent-child-dup gap 时，自动删除子节点行（保留父节点），
            // 因为父节点的 hotspot 列已包含子节点信息。修复后重写 narrative.json。
            if (redTeamResult.gaps.some(g => g.type === 'redline-parent-child-dup')) {
              const fixed = fixRedlineParentChildDup(narrative, outputDir);
              if (fixed > 0) {
                console.log(`[narrative] auto-fixed ${fixed} redline parent-child duplicates (removed child rows)`);
                fs.writeFileSync(narrativePath, JSON.stringify(narrative, null, 2), 'utf-8');
              }
            }
          } else {
            console.log('[narrative] red-team: no gaps found (narrative matches v5.3 benchmark)');
          }
        } catch (e: any) {
          // 红队失败/超时不阻塞主产出（软约束）
          console.warn(`[narrative] red-team loop failed (non-blocking): ${e?.message || e}`);
        }

        doResolve({
          success: true,
          runId,
          outputDir,
          narrativePath,
          narrative,
        });
      } catch (e: any) {
        return doResolve(makeNarrativeError(runId, outputDir, narrativePath,
          `Failed to parse/validate narrative.json: ${e?.message || e}`));
      }
    });

    child.on('error', (err: Error) => {
      clearTimeout(timeoutHandle);
      doResolve(makeNarrativeError(runId, outputDir, narrativePath,
        `CLI spawn error: ${err.message}`));
    });
  });
}

// ──────────────────────────────── CLI 入口 ────────────────────────────────

const isMainModule = (() => {
  try {
    return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isMainModule) {
  const argv = process.argv.slice(2);
  function getFlag(flag: string): string | undefined {
    const idx = argv.indexOf(flag);
    return idx === -1 ? undefined : argv[idx + 1];
  }

  const source = (getFlag('--source') as 'unity' | 'perfetto') ?? 'unity';
  const runId = getFlag('--run-id');
  const outputDir = getFlag('--out');
  const timeoutMs = getFlag('--timeout-ms') ? parseInt(getFlag('--timeout-ms')!, 10) : undefined;

  // --help / -h 是 boolean flag（getFlag 取值用，hasFlag 判断存在用）
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(
      'Usage: npx tsx web/server/prism/narrative-service.ts [--source unity|perfetto] [--run-id <id>] [--out <dir>] [--timeout-ms <ms>]\n' +
      '\n' +
      '  --source      Data source (default: unity)\n' +
      '  --run-id      Run ID (default: by source)\n' +
      '  --out         Output dir containing findings.json + verdict.json (default: web/data/prism-out/<runId>)\n' +
      '  --timeout-ms  Timeout in ms (default: 600000 = 10 min)\n',
    );
    process.exit(0);
  }

  runPrismNarrative({ source, runId, outputDir, timeoutMs }).then((result) => {
    if (result.success) {
      console.log('\n[narrative-service] SUCCESS');
      console.log(`  narrative.json: ${result.narrativePath}`);
      process.exit(0);
    } else {
      console.error('\n[narrative-service] FAILED:', result.error);
      process.exit(1);
    }
  });
}
