/**
 * harness.ts — Prism 报告管线通用 harness（DR-45 §三）
 *
 * 作用：开发 agent 标记工单 ✅ 前必跑 + 主 agent 验收时独立跑。
 *       验"产出物结构完整性"，不只验"合规性标记"。
 *
 * 三档检查：
 *   1. 占位符填充非空（防 return '' 短路）—— 秒级，不依赖 LLM
 *   2. narrative.json schema + 结构契约（防 LLM 拿到残缺 prompt 交差）—— 秒级，需 --dir
 *   3. DR-41 五条硬规则（审计剥离/子树归并/结构层次/图文穿插/人话先行）—— 秒级，需 --dir
 *
 * 不含：端到端跑 explore→narrative→render（太慢，主 agent 验收时用 run-perfetto-pipeline.ts）
 *
 * Usage (from web/):
 *   npx tsx server/prism/harness.ts                              # 只跑占位符检查（无需 --dir）
 *   npx tsx server/prism/harness.ts --dir data/prism-out/<run>   # 跑全部三档
 *   npx tsx server/prism/harness.ts --source perfetto            # 指定数据源（默认 perfetto）
 *
 * Exit code: 0=全 PASS, 1=有 FAIL
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NarrativeReport, VisualAsset } from './narrative-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────── Test harness ───────────────────────

let passCount = 0;
let failCount = 0;
const warnings: string[] = [];

function assert(condition: boolean, label: string, detail?: unknown): void {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passCount++;
  } else {
    console.log(`  FAIL: ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
    failCount++;
  }
}

function warn(label: string, detail?: unknown): void {
  const msg = `  WARN: ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`;
  console.log(msg);
  warnings.push(msg);
}

// ─────────────────────── CLI args ───────────────────────

const argv = process.argv.slice(2);
function getFlag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
}
function hasFlag(name: string): boolean {
  return argv.includes(name);
}

const source = getFlag('--source') ?? 'perfetto';
const dirArg = getFlag('--dir');

if (hasFlag('--help') || hasFlag('-h')) {
  console.log(
    'Usage: npx tsx server/prism/harness.ts [--dir <run-output-dir>] [--source perfetto|unity]\n' +
      '\n' +
      '  --dir     Run output dir (含 narrative.json/report.html). 不传则只跑占位符检查。\n' +
      '  --source  Data source (default: perfetto)\n',
  );
  process.exit(0);
}

// ─────────────────────── WT-037 辅助函数 ───────────────────────
// 视觉资产 schema 兼容期：WT-036 后视觉资产在 sections[].items[].visualAsset，
// 但历史 narrative.json（v1/v4 标杆）仍是旧 schema（顶层 metaInfo/threadOverview/throttlingMatrix/redlineMatrix/asciiArt）。
// 辅助函数同时扫新 schema (item.visualAsset) 和旧 schema (顶层字段)，兼容期双向都扫。

/**
 * 在 sections[].items[].visualAsset 里按 title 正则找视觉资产（新 schema）。
 * 旧 schema 没有这个字段，返回 undefined（由调用方回退到顶层字段）。
 */
function findVisualAssetByTitle(narrative: NarrativeReport, titleRe: RegExp): VisualAsset | undefined {
  for (const sec of narrative.sections) {
    for (const item of sec.items) {
      if (item.visualAsset && titleRe.test(item.visualAsset.title)) {
        return item.visualAsset;
      }
    }
  }
  return undefined;
}

/**
 * 按统计视觉资产数量（新 schema：扫 sections[].items[].visualAsset.type）。
 * 旧 schema 没有 type 字段，扫不到（由调用方回退到顶层字段）。
 */
function countVisualAssetsByType(narrative: NarrativeReport, type: 'table' | 'ascii' | 'matrix'): number {
  let n = 0;
  for (const sec of narrative.sections) {
    for (const item of sec.items) {
      if (item.visualAsset?.type === type) n++;
    }
  }
  return n;
}

/**
 * 简单文本相似度（Jaccard on tokens），不引外部库。
 * 用于 D1 检查 topConclusions.problem 与 §0 item.title 是否高度重复。
 */
function textSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(/[\s,，。；;:：()（）/\\]+/).filter(t => t.length > 1));
  const tokensB = new Set(b.split(/[\s,，。；;:：()（）/\\]+/).filter(t => t.length > 1));
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * 旧 schema 兼容：从顶层字段读视觉资产行数。
 * WT-036 前视觉资产在顶层 metaInfo/threadOverview/throttlingMatrix/redlineMatrix/asciiArt。
 * 新 schema 这些字段不在 NarrativeReport 类型里，用 any 取。
 */
function getLegacyTopLevelField(narrative: NarrativeReport, field: string): unknown {
  return (narrative as unknown as Record<string, unknown>)[field];
}

/**
 * 兼容期统一取"ASCII 图数量"——先扫新 schema (item.visualAsset.type==='ascii')，
 * 回退到旧 schema 顶层 asciiArt 数组 + topConclusions[].asciiArt。
 */
function countAsciiArtCompat(narrative: NarrativeReport): { count: number; source: 'new-schema' | 'legacy' | 'missing' } {
  // 新 schema
  const n = countVisualAssetsByType(narrative, 'ascii');
  if (n > 0) return { count: n, source: 'new-schema' };
  // 旧 schema：顶层 asciiArt 数组 + topConclusions 挂的 asciiArt
  const legacy = getLegacyTopLevelField(narrative, 'asciiArt');
  let count = 0;
  if (Array.isArray(legacy)) count += legacy.length;
  for (const tc of narrative.topConclusions ?? []) {
    if (tc.asciiArt) count++;
  }
  return count > 0 ? { count, source: 'legacy' } : { count: 0, source: 'missing' };
}

// ─────────────────────── 1. 占位符填充检查 ───────────────────────
// DR-45 §3.1：任何 {{XXX}} 占位符的填充函数必须返回非空且含关键内容。
// 防 resolveReportTemplate 的 return '' 短路。

console.log('\n[1] 占位符填充检查（防 return "" 短路）');

// 1a. narrative-service 的 {{REPORT_TEMPLATE}} 填充
//     直接复刻 narrative-service.ts:resolveReportTemplate 的逻辑，断言它真的读到了模板文件。
{
  const templateDir = path.join(__dirname, 'prompts', 'report-templates');
  const templatePath = path.join(templateDir, `${source}-multi-state.txt`);
  const templateExists = fs.existsSync(templatePath);
  assert(templateExists, `${source}-multi-state.txt 模板文件存在`, { path: templatePath });

  if (templateExists) {
    const tpl = fs.readFileSync(templatePath, 'utf-8');
    assert(tpl.length > 100, `${source}-multi-state.txt 内容非空 (>100 chars)`, { len: tpl.length });
    assert(tpl.includes('§0'), '模板含 §0 章节（结论先行）');
    // WT-044: unity 多态模板只有 §0-§4（没有 perfetto 的降频 §4/GPU-bound §3 等），
    // 不强制 §5/§6，但至少要有 §1（采集元信息）+ §3（主线程 callTree）
    if (source === 'unity') {
      assert(tpl.includes('§1'), 'unity 模板含 §1 章节（采集元信息）');
      assert(tpl.includes('§3'), 'unity 模板含 §3 章节（主线程 callTree）');
    } else {
      assert(tpl.includes('§5') || tpl.includes('§6'), '模板含 §5/§6 章节（callTree/判定）');
    }

    // 关键：检查 narrative-service.ts 的 resolveReportTemplate 是否真的会读这个文件
    // 而不是硬编码 return ''。读源码静态检查。
    const narrativeServiceSrc = fs.readFileSync(
      path.join(__dirname, 'narrative-service.ts'),
      'utf-8',
    );

    // 提取 resolveReportTemplate 函数体（到下一个 function 或文件尾）
    const funcMatch = narrativeServiceSrc.match(
      /function resolveReportTemplate[\s\S]*?\n\}/,
    );
    const funcBody = funcMatch ? funcMatch[0] : '';

    // 去掉 // 注释行，防止注释里的 readFileSync 误判
    const funcBodyNoComments = funcBody
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');

    const hasReturnEmpty = /return\s+''/.test(funcBodyNoComments);
    assert(!hasReturnEmpty, 'narrative-service.ts 的 resolveReportTemplate 没有 return "" 短路', {
      hint: 'DR-45 断链 1：函数硬编码返回空字符串，模板文件存在但没被读取',
    });

    // 检查是否真的有 readFileSync 调用读模板（去掉注释后检查）
    const readsTemplate = /readFileSync\s*\(/.test(funcBodyNoComments);
    assert(readsTemplate, 'resolveReportTemplate 真的 readFileSync 读模板文件（非注释）', {
      hint: '不是 return ""，但也没真读文件 = 另一种断链',
    });
  } else {
    // 模板不存在时，检查 narrative-service 是否优雅降级（打 warning 而非静默返回空）
    console.log(`  SKIP: ${source}-multi-state.txt 不存在，跳过填充检查（单态模式可能用 single-state.txt）`);
  }
}

// 1b. report-pipeline.ts 的 reportTemplatePath 注册
//     DR-45 断链 2：注册时 reportTemplatePath: null 没填。
{
  const pipelineSrc = fs.readFileSync(path.join(__dirname, 'report-pipeline.ts'), 'utf-8');
  // 找 perfetto 注册块：从 "source: 'perfetto'" 往前找最近的 registry.register({，
  // 往后匹配到 })。避免非贪婪正则把 unity 块的 reportTemplatePath: null 误包进来。
  const perfettoIdx = pipelineSrc.indexOf("source: 'perfetto'");
  if (perfettoIdx < 0) {
    console.log('  SKIP: 没找到 perfetto registry.register 块（可能重构了）');
  } else {
    // 往前找最近的 registry.register({
    const registerStart = pipelineSrc.lastIndexOf('registry.register({', perfettoIdx);
    // 往后找最近的 }) 作为块尾
    const blockEnd = pipelineSrc.indexOf('})', perfettoIdx);
    if (registerStart < 0 || blockEnd < 0) {
      console.log('  SKIP: perfetto registry.register 块边界没找到（可能重构了）');
    } else {
      const block = pipelineSrc.slice(registerStart, blockEnd + 2);
      const hasNull = /reportTemplatePath:\s*null/.test(block);
      assert(!hasNull, "report-pipeline.ts perfetto 注册的 reportTemplatePath 不是 null", {
        hint: 'DR-45 断链 2：reportTemplatePath: null 没填，narrative 拿不到模板路径',
      });

      // 如果不是 null，检查路径指向真实存在的文件
      const pathMatch = block.match(/reportTemplatePath:\s*['"]([^'"]+)['"]/);
      if (pathMatch) {
        // 路径形如 'prompts/report-templates/perfetto-multi-state.txt'，相对 web/server/prism/
        const tplPath = path.join(__dirname, pathMatch[1]);
        assert(fs.existsSync(tplPath), `reportTemplatePath 指向的文件存在: ${pathMatch[1]}`);
      }
    }
  }
}

// 1c. explore-service 的 {{MEMORY_INJECTION}} 填充
//     这个已经实现了（explore-service.ts:711），检查不退化。
{
  const exploreSrc = fs.readFileSync(path.join(__dirname, 'explore-service.ts'), 'utf-8');
  const hasMemoryInjection = /\{\{MEMORY_INJECTION\}\}/.test(exploreSrc) &&
    /formatMemoryForPrompt/.test(exploreSrc);
  assert(hasMemoryInjection, 'explore-service.ts 的 {{MEMORY_INJECTION}} 填充未退化', {
    hint: 'explore-prompt 的业务知识注入，断链 = LLM 拿不到业务先验',
  });
}

// 1d. WT-034: narrative-service 的 {{MEMORY_INJECTION}} 填充（对称 explore-service）
//     lessons 回路注入 narrative-prompt，让 LLM 吸收历史红队教训。
{
  const narrativeSrc = fs.readFileSync(path.join(__dirname, 'narrative-service.ts'), 'utf-8');
  const hasMemoryInjection = /\{\{MEMORY_INJECTION\}\}/.test(narrativeSrc) &&
    /formatMemoryForPrompt/.test(narrativeSrc);
  assert(hasMemoryInjection, 'narrative-service.ts 的 {{MEMORY_INJECTION}} 填充未退化（WT-034）', {
    hint: 'narrative-prompt 的 lessons 注入，断链 = LLM 拿不到历史写作教训',
  });

  // WT-034: 红队回路 + lessons 沉淀
  const hasRedTeam = /runNarrativeRedTeam/.test(narrativeSrc) &&
    /appendMemory\(['"]lessons['"]/.test(narrativeSrc);
  assert(hasRedTeam, 'narrative-service.ts 有红队回路 + lessons 沉淀（WT-034）', {
    hint: 'narrative 红队复扫对照 v5.3 标杆 4 维度，缺口沉淀 lessons 供下次注入',
  });
}

// ─────────────────────── 1c. prompt 文件硬编码扫描（WT-038 需求 G） ───────────────────────
// dev-conventions.md §6.1：prompt 范例不许用业务名，用占位符。
// 数据源无关骨架（narrative-prompt.txt）不许有数据源特定词。
// 数据源特定模板可保留该数据源概念，但不许有业务名。
// 这些断言是 assert（FAIL），不是 warn（warning）——prompt 里有业务名 = harness FAIL。

console.log('\n[1c] prompt 文件硬编码扫描（WT-038 需求 G）');

// G1. narrative-prompt.txt 不许有业务名
const narrativePromptSrc = fs.readFileSync(path.join(__dirname, 'prompts/narrative-prompt.txt'), 'utf-8');
const businessNames = [/行军线/, /ArmyLine/, /MapSignificance/, /BattleHead/, /LuaMgr/, /MapManager/, /OutSideView/];
for (const re of businessNames) {
  assert(!re.test(narrativePromptSrc), `narrative-prompt.txt 无业务名硬编码: ${re.source}`);
}

// G2. narrative-prompt.txt 不许有 perfetto 特定词（它是数据源无关骨架）
const perfettoSpecificTerms = [/Choreographer/, /AudioTrack/, /AAudio/, /bigCoreReach/, /Gfx\.WaitForPresent/];
for (const re of perfettoSpecificTerms) {
  assert(!re.test(narrativePromptSrc), `narrative-prompt.txt 无 perfetto 特定词: ${re.source}`);
}

// G3. perfetto-multi-state.txt 不许有业务名（perfetto 概念可保留）
const perfettoTemplateSrc = fs.readFileSync(path.join(__dirname, 'prompts/report-templates/perfetto-multi-state.txt'), 'utf-8');
for (const re of businessNames) {
  assert(!re.test(perfettoTemplateSrc), `perfetto-multi-state.txt 无业务名硬编码: ${re.source}`);
}

// G5. WT-044: unity-multi-state.txt 不许有 AOE 专属业务名（unity 概念可保留）
const unityMultiTemplatePath = path.join(__dirname, 'prompts/report-templates/unity-multi-state.txt');
if (fs.existsSync(unityMultiTemplatePath)) {
  const unityMultiTemplateSrc = fs.readFileSync(unityMultiTemplatePath, 'utf-8');
  for (const re of businessNames) {
    assert(!re.test(unityMultiTemplateSrc), `unity-multi-state.txt 无业务名硬编码: ${re.source}`);
  }
}

// G4. unity-explore-prompt.txt 不许有 AOE 专属业务名（unity 概念可保留）
const unityPromptPath = path.join(__dirname, 'prompts/unity-explore-prompt.txt');
if (fs.existsSync(unityPromptPath)) {
  const unityPromptSrc = fs.readFileSync(unityPromptPath, 'utf-8');
  for (const re of businessNames) {
    assert(!re.test(unityPromptSrc), `unity-explore-prompt.txt 无业务名硬编码: ${re.source}`);
  }
}

// ─────────────────────── 1d. render 层硬编码扫描（WT-037 需求 B） ───────────────────────
// WT-036 修完后视觉资产从顶层字段移到 item.visualAsset，render-html.ts 不该再硬编码引用
// perfetto 特有字段名（metaInfoMatched/threadOverviewMatched/throttlingMatrixMatched/redlineMatrixMatched）。
// narrative-types.ts 顶层 NarrativeReport 也不该有 perfetto 特有字段。
// 这些断言是 assert（FAIL），不是 warn——硬编码 = harness FAIL。

console.log('\n[1d] render 层硬编码扫描（WT-037 需求 B：通用层无 perfetto 特有字段名）');

// B1. render-html.ts 不许出现 perfetto 特有字段名（WT-036 后这些字段不在顶层，render 不该硬编码引用）
const renderHtmlSrc = fs.readFileSync(path.join(__dirname, 'render-html.ts'), 'utf-8');
const forbiddenFieldNames = [
  /metaInfoMatched/,
  /threadOverviewMatched/,
  /throttlingMatrixMatched/,
  /redlineMatrixMatched/,
  /visualAssetKey\s*===\s*['"]metaInfo['"]/,
  /visualAssetKey\s*===\s*['"]threadOverview['"]/,
  /visualAssetKey\s*===\s*['"]throttlingMatrix['"]/,
  /visualAssetKey\s*===\s*['"]redlineMatrix['"]/,
];
let forbiddenFound: string[] = [];
for (const re of forbiddenFieldNames) {
  if (re.test(renderHtmlSrc)) {
    forbiddenFound.push(re.source);
  }
}
assert(forbiddenFound.length === 0, 'render-html.ts 无硬编码字段名（WT-036 后通用层不许引用 perfetto 特有字段）', {
  forbiddenFound,
  hint: '这些字段已移到 item.visualAsset，render 应按 type 渲染，不该按字段名硬匹配',
});

// B2. narrative-types.ts 顶层 NarrativeReport 不许有 perfetto 特有字段
//     WT-036 后这些字段已删，本断言防回退。
const typesSrc = fs.readFileSync(path.join(__dirname, 'narrative-types.ts'), 'utf-8');
const reportIfaceMatch = typesSrc.match(/interface NarrativeReport \{[\s\S]*?\}/);
if (reportIfaceMatch) {
  const reportIface = reportIfaceMatch[0];
  const forbiddenTopLevel: string[] = [];
  if (/metaInfo\?:/.test(reportIface)) forbiddenTopLevel.push('metaInfo');
  if (/threadOverview\?:/.test(reportIface)) forbiddenTopLevel.push('threadOverview');
  if (/throttlingMatrix\?:/.test(reportIface)) forbiddenTopLevel.push('throttlingMatrix');
  if (/redlineMatrix\?:/.test(reportIface)) forbiddenTopLevel.push('redlineMatrix');
  if (/asciiArt\?:/.test(reportIface)) forbiddenTopLevel.push('asciiArt');
  assert(forbiddenTopLevel.length === 0, 'NarrativeReport 顶层无 perfetto 特有字段（WT-036 后视觉资产移到 item.visualAsset）', {
    forbiddenTopLevel,
  });
} else {
  console.log('  SKIP: NarrativeReport interface 没找到（可能重构了）');
}

// B3. harness.ts 自身不许硬编码 visualAssetKeys 数组扫顶层字段
//     WT-035 警告 1 的 visualAssetKeys = ['metaInfo', ...] 是过渡方案，WT-036 后应删
assert(!/visualAssetKeys\s*=\s*\[/.test(typesSrc), 'narrative-types.ts 无 visualAssetKeys 顶层字段数组（WT-036 后改为扫 item.visualAsset）');

// ─────────────────────── 1e. DR-51 三层架构注入路径检查 ───────────────────────
// DR-51：宪法层（constitution/）+ 规程层（methodology/）必须通过 {{MEMORY_INJECTION}} 注入运行时 LLM。
// 当前架构缺陷：宪法+规程只给开发 agent 看（docs/prism/memory/），运行时 LLM 读不到，
// 导致 prompt 错了 LLM 跟着错（DR-51 触发事件：narrative-prompt.txt"必须挂 callTree"违反 DR-50）。

console.log('\n[1e] DR-51 三层架构注入路径检查（constitution + methodology 注入运行时 LLM）');

// E1. prism-memory/constitution/ 目录存在且非空
const constitutionDir = path.join(__dirname, 'prism-memory', 'constitution');
if (fs.existsSync(constitutionDir)) {
  const constitutionFiles = fs.readdirSync(constitutionDir).filter(f => f.endsWith('.md') && f !== 'README.md');
  assert(constitutionFiles.length >= 10, `prism-memory/constitution/ 有 ≥10 条宪法条目（DR-41 五条 + DR-44 三段 + DR-50 三条）`, {
    count: constitutionFiles.length,
  });
} else {
  assert(false, 'prism-memory/constitution/ 目录存在（DR-51 宪法层注入路径）');
}

// E2. prism-memory/methodology/ 目录存在且非空
const methodologyDir = path.join(__dirname, 'prism-memory', 'methodology');
if (fs.existsSync(methodologyDir)) {
  const methodologyFiles = fs.readdirSync(methodologyDir).filter(f => f.endsWith('.md') && f !== 'README.md');
  assert(methodologyFiles.length >= 8, `prism-memory/methodology/ 有 ≥8 条规程条目（DR-45 三条 + DR-48 两条 + DR-49 一条 + DR-42/43 两条）`, {
    count: methodologyFiles.length,
  });
} else {
  assert(false, 'prism-memory/methodology/ 目录存在（DR-51 规程层注入路径）');
}

// E3. prism-memory.ts MEMORY_CATEGORIES 注册了 constitution + methodology
const prismMemorySrc = fs.readFileSync(path.join(__dirname, 'prism-memory.ts'), 'utf-8');
assert(/name:\s*['"]constitution['"]/.test(prismMemorySrc), 'prism-memory.ts MEMORY_CATEGORIES 注册了 constitution 类');
assert(/name:\s*['"]methodology['"]/.test(prismMemorySrc), 'prism-memory.ts MEMORY_CATEGORIES 注册了 methodology 类');

// E4. explore-service.ts MEMORY_INJECTION_CATEGORIES 包含 constitution + methodology
const exploreServiceSrc = fs.readFileSync(path.join(__dirname, 'explore-service.ts'), 'utf-8');
assert(/['"]constitution['"]/.test(exploreServiceSrc), 'explore-service.ts MEMORY_INJECTION_CATEGORIES 包含 constitution');
assert(/['"]methodology['"]/.test(exploreServiceSrc), 'explore-service.ts MEMORY_INJECTION_CATEGORIES 包含 methodology');

// E5. narrative-service.ts 的 formatMemoryForPrompt 调用传了 dataSource 参数（WT-040 遗留 bug 修复）
const narrativeServiceSrc = fs.readFileSync(path.join(__dirname, 'narrative-service.ts'), 'utf-8');
assert(/formatMemoryForPrompt\(\s*\{\s*dataSource:\s*source\s*\}\s*\)/.test(narrativeServiceSrc), 'narrative-service.ts:514 formatMemoryForPrompt 传了 dataSource 参数（WT-040 遗留 bug 修复）', {
  hint: 'DR-51 顺手修 WT-040 遗留 bug：narrative-service.ts:514 没传 dataSource，perfetto 报告会注入 unity priors',
});

// E6. constitution/methodology 条目都标 dataSource: cross-source（按数据源筛选时不被过滤）
if (fs.existsSync(constitutionDir)) {
  for (const f of fs.readdirSync(constitutionDir).filter(f => f.endsWith('.md') && f !== 'README.md')) {
    const content = fs.readFileSync(path.join(constitutionDir, f), 'utf-8');
    assert(/dataSource:\s*cross-source/.test(content), `constitution/${f} 标了 dataSource: cross-source（按数据源筛选时不被过滤）`);
  }
}
if (fs.existsSync(methodologyDir)) {
  for (const f of fs.readdirSync(methodologyDir).filter(f => f.endsWith('.md') && f !== 'README.md')) {
    const content = fs.readFileSync(path.join(methodologyDir, f), 'utf-8');
    assert(/dataSource:\s*cross-source/.test(content), `methodology/${f} 标了 dataSource: cross-source（按数据源筛选时不被过滤）`);
  }
}

// E7. MEMORY_INJECTION_MAX_CHARS 调到 ≥12000（容纳 18 条新条目）
assert(/MEMORY_INJECTION_MAX_CHARS\s*=\s*1[2-9]\d{3}/.test(exploreServiceSrc) || /MEMORY_INJECTION_MAX_CHARS\s*=\s*[2-9]\d{4}/.test(exploreServiceSrc), 'MEMORY_INJECTION_MAX_CHARS ≥ 12000（容纳 constitution + methodology + 知识层）', {
  hint: 'DR-51：从 7000 调到 12000，容纳 constitution (~3000) + methodology (~2400) + 知识层 (~6600)',
});

// E8. constitution/methodology 条目无业务名硬编码（DR-41 §六）
const businessNameRes = [/LuaMgr/, /MapSignificance/, /BattleHead/, /ArmyLine/, /行军线/, /MapManager/, /OutSideView/];
if (fs.existsSync(constitutionDir)) {
  for (const f of fs.readdirSync(constitutionDir).filter(f => f.endsWith('.md') && f !== 'README.md')) {
    const content = fs.readFileSync(path.join(constitutionDir, f), 'utf-8');
    for (const re of businessNameRes) {
      assert(!re.test(content), `constitution/${f} 无业务名硬编码: ${re.source}`);
    }
  }
}
if (fs.existsSync(methodologyDir)) {
  for (const f of fs.readdirSync(methodologyDir).filter(f => f.endsWith('.md') && f !== 'README.md')) {
    const content = fs.readFileSync(path.join(methodologyDir, f), 'utf-8');
    for (const re of businessNameRes) {
      assert(!re.test(content), `methodology/${f} 无业务名硬编码: ${re.source}`);
    }
  }
}

// ─────────────────────── 2. narrative.json 结构契约 ───────────────────────
// DR-45 §3.2：narrative LLM 产出后，校验 sections 结构是否符合模板章节骨架。
// 需 --dir 指向 run 输出目录。

if (dirArg) {
  // 相对路径相对于 cwd（通常 web/），绝对路径直接用
  const runDir = path.isAbsolute(dirArg) ? dirArg : path.resolve(process.cwd(), dirArg);
  const narrativePath = path.join(runDir, 'narrative.json');
  const reportHtmlPath = path.join(runDir, 'report.html');

  console.log('\n[2] narrative.json 结构契约（需 --dir）');

  if (!fs.existsSync(narrativePath)) {
    assert(false, 'narrative.json 存在', { path: narrativePath });
  } else {
    let narrative: NarrativeReport;
    try {
      narrative = JSON.parse(fs.readFileSync(narrativePath, 'utf-8')) as NarrativeReport;
    } catch (e) {
      assert(false, 'narrative.json 可解析为 JSON', (e as Error).message);
      narrative = undefined as unknown as NarrativeReport;
    }

    if (narrative) {
      // 2a. provenance 校验（DR-44 A2，同 render-html）
      assert(
        narrative.narrativeProvenance?.generatedBy === 'LLM',
        "narrativeProvenance.generatedBy === 'LLM'",
        { actual: narrative.narrativeProvenance?.generatedBy ?? 'missing' },
      );

      // 2b. 必填字段
      assert(typeof narrative.overview === 'string' && narrative.overview.length > 20, 'overview 非空 (>20 chars)');
      assert(['excellent', 'pass', 'weak', 'fail'].includes(narrative.rating), 'rating 合法', narrative.rating);
      assert(Array.isArray(narrative.topConclusions) && narrative.topConclusions.length >= 3, 'topConclusions >= 3 条', { count: narrative.topConclusions?.length });
      assert(Array.isArray(narrative.sections) && narrative.sections.length >= 3, 'sections >= 3 个', { count: narrative.sections?.length });
      assert(Array.isArray(narrative.prioritySummary) && narrative.prioritySummary.length >= 1, 'prioritySummary 非空');

      // 2c. judgmentBoundary 诚实声明（超越作文机的关键）
      assert(
        narrative.judgmentBoundary && Array.isArray(narrative.judgmentBoundary.canJudge) && narrative.judgmentBoundary.canJudge.length > 0,
        'judgmentBoundary.canJudge 非空（诚实声明能判什么）',
      );
      assert(
        narrative.judgmentBoundary && Array.isArray(narrative.judgmentBoundary.cannotJudge) && narrative.judgmentBoundary.cannotJudge.length > 0,
        'judgmentBoundary.cannotJudge 非空（诚实声明判不了什么）',
      );

      // 2d. topConclusions 三维标注 + judgability（narrative-prompt 要求每条必标）
      // info 级的 dimensions 可选（info 级是"信息性"结论，可能没有明确的三维定性）
      const conclusionsRequiringDims = narrative.topConclusions.filter(c => c.severity !== 'info');
      const conclusionsMissingDims = conclusionsRequiringDims.filter(c => !c.dimensions || c.dimensions.length === 0);
      assert(conclusionsMissingDims.length === 0, '每条 topConclusion（非 info 级）有 dimensions 三维标注', { missing: conclusionsMissingDims.length });
      const conclusionsMissingJudg = narrative.topConclusions.filter(c => !c.judgability);
      assert(conclusionsMissingJudg.length === 0, '每条 topConclusion 有 judgability', { missing: conclusionsMissingJudg.length });

      // 2e. 审计字段不进 narrative（DR-41 规则 1）
      const narrativeStr = JSON.stringify(narrative);
      assert(!narrativeStr.includes('evidenceIds'), 'narrative.json 无 evidenceIds 审计字段');
      assert(!narrativeStr.includes('findingIds') || narrative.sections.some(s => s.items.some(i => i.findingIds)), 'findingIds 只在 item 级别（关联 finding，非审计）');
      // 注：item.findingIds 是合法的（关联 finding 用），顶层 evidenceIds 才是禁止的

      // 2f. sections 结构契约：每个 section 有 heading + items
      const badSections = narrative.sections.filter(s => !s.heading || !Array.isArray(s.items) || s.items.length === 0);
      assert(badSections.length === 0, '每个 section 有 heading + 非空 items', { badCount: badSections.length });

      // 2g. callTree.rootMarker 覆盖率（防全 fallback 成 note）
      const itemsWithCallTree = narrative.sections.flatMap(s => s.items).filter(i => i.callTree?.rootMarker);
      const totalItems = narrative.sections.flatMap(s => s.items).length;
      const callTreeCoverage = totalItems > 0 ? itemsWithCallTree.length / totalItems : 0;
      if (callTreeCoverage < 0.3) {
        warn(`callTree.rootMarker 覆盖率偏低 (${(callTreeCoverage * 100).toFixed(0)}%)`, {
          hint: '大部分 item 没给 callTree.rootMarker，渲染时会全 fallback 成 note——可能 LLM 没按模板要求下钻',
        });
      } else {
        assert(true, `callTree.rootMarker 覆盖率 ${(callTreeCoverage * 100).toFixed(0)}% (>=30%)`);
      }

      // 2h. 章节骨架对照模板（软约束 warning，不 fail）
      //     perfetto-multi-state 模板要求 §0-§7 八章，narrative 的 sections 是自由分群，
      //     不强制 1:1 匹配，但数量太少 = 可能没按模板组织。
      if (source === 'perfetto' && narrative.sections.length < 5) {
        warn('perfetto 报告 sections < 5，模板要求 §0-§7 八章', {
          actual: narrative.sections.length,
          hint: '可能 narrative LLM 拿到的是裸 prompt（{{REPORT_TEMPLATE}} 没注入），按自由分群交差了',
        });
      }

      // 2i. 无万能套话（DR-41 规则 5 + dev-conventions §六）
      const boilerplate = ['建议单次任务削峰', '建议增量化', '建议分帧处理'];
      const foundBoilerplate = boilerplate.filter(phrase => narrativeStr.includes(phrase));
      assert(foundBoilerplate.length === 0, '无万能套话（"建议单次任务削峰"等）', { found: foundBoilerplate });

      // 2j. prioritySummary 有 P0
      const hasP0 = narrative.prioritySummary.some(p => p.priority === 'P0');
      assert(hasP0, 'prioritySummary 有 P0 项');

      // ── WT-035: 4 类软警告 → WT-037 升级 3 类为 assert（FAIL） ──
      // WT-035 教训：warning 不阻塞，开发 agent 交了带 warning 的 v4 退化产物。
      // WT-037 把其中 3 类升级为 assert（FAIL）：视觉资产全空 / 多线程覆盖不足 / topConclusions 无 callTree。
      // 保留 warning 的只有 callTree 节点无红线标注（explore 层问题，不是 narrative 层）。
      // WT-036: 视觉资产从顶层字段移到 sections[].items[].visualAsset，扫描方式同步改。
      // WT-037: 兼容期同时扫新 schema (item.visualAsset) 和旧 schema (顶层字段)，标杆 v1/v4 是旧 schema。

      // WT-035 警告 1 → WT-037 assert: 视觉资产全空（扫 item.visualAsset + 顶层字段）
      let visualAssetCount = 0;
      for (const sec of narrative.sections) {
        for (const item of sec.items) {
          if (item.visualAsset) visualAssetCount++;
        }
      }
      // 旧 schema 兼容：顶层字段有视觉资产也算
      const legacyVisualAssetFields = ['metaInfo', 'threadOverview', 'throttlingMatrix', 'redlineMatrix', 'asciiArt'];
      for (const field of legacyVisualAssetFields) {
        const legacyField = getLegacyTopLevelField(narrative, field);
        if (Array.isArray(legacyField) && legacyField.length > 0) visualAssetCount += legacyField.length;
      }
      // topConclusions 挂的 asciiArt 也算（新旧 schema 都可能有）
      for (const tc of narrative.topConclusions ?? []) {
        if (tc.asciiArt) visualAssetCount++;
      }
      assert(visualAssetCount >= 1, '至少 1 个视觉资产（item.visualAsset 或顶层字段，不许全空）', {
        visualAssetCount,
        hint: 'narrative LLM 必须按 {{REPORT_TEMPLATE}} 注入的模板填视觉资产——可能模板没注入或 LLM 忽略了',
      });

      // WT-035 警告 2 → WT-037 A1 覆盖（多线程宏观表 ≥5 行 = FAIL）：见下方 A1 断言

      // WT-035 警告 3 → WT-037 assert → WT-046 v5 降级为 WARN（DR-50: 挂载可选，不许预先规定挂载）
      // 工单 WT-046 v5 需求 B 把 prompt 从"必须挂 callTree/asciiArt"改成"可选"（DR-50 合规——
      // 预先规定挂载是内容约束/作文机病）。LLM 按 prompt 产出 0% 挂载是合规的，旧断言"≥50%"
      // 是 DR-50 违规的过时断言。降级为 WARN：挂载低不阻塞，但可能暴露 §0 叙事展开不充分。
      const criticalHigh = (narrative.topConclusions ?? []).filter(
        c => c.severity === 'critical' || c.severity === 'high'
      );
      if (criticalHigh.length > 0) {
        const withCallTree = criticalHigh.filter(c => c.callTree || c.asciiArt);
        const ratio = withCallTree.length / criticalHigh.length;
        if (ratio < 0.5) {
          warn('critical/high topConclusion 挂 callTree/asciiArt 比率 <50%（DR-50: 挂载可选，不阻塞）', {
            ratio: `${(ratio * 100).toFixed(0)}%`,
            withCallTree: withCallTree.length,
            total: criticalHigh.length,
            hint: 'WT-046 v5 后挂载可选（DR-50）——LLM 不硬挂是合规的。挂载低可能暴露 §0 叙事展开不充分，主 agent 人眼检查 §0 是否每条都有 ASCII 图/人话叙事',
          });
        }
      }

      // WT-035 警告 4: callTree 节点无红线标注（保留 warning——explore 层问题，不是 narrative 层）
      if (fs.existsSync(reportHtmlPath)) {
        const html = fs.readFileSync(reportHtmlPath, 'utf-8');
        const treeNodes = (html.match(/class="tree-bar"/g) || []).length;
        const redlineNodes = (html.match(/tree-redline/g) || []).length;
        const foldNodes = (html.match(/tree-fold/g) || []).length;
        if (treeNodes > 0 && redlineNodes === 0 && foldNodes === 0) {
          warn(`callTree 有 ${treeNodes} 个节点但无红线/涨幅标注`, {
            hint: 'explore 没给 callTreeAnnotations，或 render 没从 findings 注入——v5.3 §5 节点标 🔴/🟡/📈',
          });
        }
      }

      // ── WT-037 需求 A: 内容厚度回归断言（对标 v1 标杆，FAIL 不是 warning） ──
      // 防 narrative LLM 丢内容：v4 相比 v1 threadOverview 8→4 行、redlineMatrix 8→3 行、throttlingMatrix 5→4 行、asciiArt 4→3 个、metaInfo 12→10 行。
      // 断言是 assert（FAIL），不是 warn——行数 < 标杆 = harness FAIL = 开发 agent 不能交差。
      // 兼容期：扫新 schema (item.visualAsset) 回退到旧 schema 顶层字段。
      console.log('\n[2a] 内容厚度回归断言（WT-037 需求 A：对标 v1 标杆，FAIL 不是 warning）');

      // A1. 多线程宏观表 ≥5 行（v1 标杆 8 行，v4 退化到 4 行）
      //     扫 title 含"多线程"的 visualAsset table.rows.length，回退到顶层 threadOverview 数组
      const a1Asset = findVisualAssetByTitle(narrative, /多线程/);
      const a1Legacy = getLegacyTopLevelField(narrative, 'threadOverview');
      const a1Rows = a1Asset?.table?.rows?.length ?? (Array.isArray(a1Legacy) ? a1Legacy.length : 0);
      assert(a1Rows >= 5, '内容厚度回归 - 多线程宏观表 ≥5 行（v1 标杆 8 行，含 Audio 线程池，不许合并）', {
        actual: a1Rows,
        benchmark: 8,
        source: a1Asset ? 'new-schema' : (a1Legacy ? 'legacy' : 'missing'),
      });

      // A2. 红线触发清单 ≥5 行（v1 标杆 8 行细到子模块，v4 退化到 3 行只父级）
      //     扫 title 含"红线"的 visualAsset table.rows.length，回退到顶层 redlineMatrix 数组
      const a2Asset = findVisualAssetByTitle(narrative, /红线/);
      const a2Legacy = getLegacyTopLevelField(narrative, 'redlineMatrix');
      const a2Rows = a2Asset?.table?.rows?.length ?? (Array.isArray(a2Legacy) ? a2Legacy.length : 0);
      assert(a2Rows >= 5, '内容厚度回归 - 红线触发清单 ≥5 行（细到子模块，不许只到父）', {
        actual: a2Rows,
        benchmark: 8,
        source: a2Asset ? 'new-schema' : (a2Legacy ? 'legacy' : 'missing'),
      });

      // A3. 降频判定矩阵 ≥4 行（v1 标杆 5 行，v4 退化到 4 行）
      //     扫 title 含"降频"的 visualAsset table.rows.length，回退到顶层 throttlingMatrix 数组
      //     WT-044: unity 多态报告没有降频章节（unity 不暴露 CPU 频率，见 unity-multi-state.txt 模板），
      //     source=unity 时跳过此断言（不误杀）。
      if (source === 'unity') {
        console.log('  SKIP: A3 降频矩阵断言对 unity 不适用（unity 没有降频章节，WT-044）');
      } else {
        const a3Asset = findVisualAssetByTitle(narrative, /降频/);
        const a3Legacy = getLegacyTopLevelField(narrative, 'throttlingMatrix');
        const a3Rows = a3Asset?.table?.rows?.length ?? (Array.isArray(a3Legacy) ? a3Legacy.length : 0);
        assert(a3Rows >= 4, '内容厚度回归 - 降频判定矩阵 ≥4 行', {
          actual: a3Rows,
          benchmark: 5,
          source: a3Asset ? 'new-schema' : (a3Legacy ? 'legacy' : 'missing'),
        });
      }

      // A4. ASCII 图 ≥3 个（v1 标杆 4 个，v4 退化到 3 个）
      //     扫 item.visualAsset.type==='ascii'，回退到顶层 asciiArt 数组 + topConclusions[].asciiArt
      const a4Count = countAsciiArtCompat(narrative);
      assert(a4Count.count >= 3, '内容厚度回归 - ASCII 图 ≥3 个', {
        actual: a4Count.count,
        benchmark: 4,
        source: a4Count.source,
      });

      // A5. 采集元信息 ≥8 行（v1 标杆 12 行）
      //     扫 title 含"采集元信息"的 visualAsset table.rows.length，回退到顶层 metaInfo 数组
      const a5Asset = findVisualAssetByTitle(narrative, /采集元信息/);
      const a5Legacy = getLegacyTopLevelField(narrative, 'metaInfo');
      const a5Rows = a5Asset?.table?.rows?.length ?? (Array.isArray(a5Legacy) ? a5Legacy.length : 0);
      assert(a5Rows >= 8, '内容厚度回归 - 采集元信息 ≥8 行', {
        actual: a5Rows,
        benchmark: 12,
        source: a5Asset ? 'new-schema' : (a5Legacy ? 'legacy' : 'missing'),
      });

      // ── WT-037 需求 D: 核心结论与 §0 不重复检查 ──
      // v4 退化点：§0 ①②③ 与 topConclusions 1-3 内容重复。
      // §0 应是结论先行的叙事展开，不是 topConclusions 的复述——narrative LLM 没区分两层的语义角色就会重复。
      // 检查 topConclusions 的 problem 文本与 §0 section items 的 title 文本相似度。
      //
      // 阈值校准说明：工单原文写 0.7，但用 v1/v4 标杆实跑校准后，0.7 会误杀 v1 标杆
      // （v1 #1 sim=0.857，"throttle 态 GPU-bound：主线程 39% 时间在等 GPU" vs
      //  "① GPU-bound：throttle 主线程 39% 时间在等 GPU（第一主因）"——共享领域关键词
      //  GPU-bound/主线程/39%/等 GPU，但措辞不同，是合法的"结论先行复述要点"）。
      // v4 真正的退化是 §0 ③ title 与 topConclusions #3 problem 完全相同（sim=1.000）。
      // 阈值定 0.9：抓 sim=1.0 的完全重复，不误杀 v1 的 0.857 领域关键词重叠。
      console.log('\n[2b] 核心结论与 §0 不重复检查（WT-037 需求 D：防 narrative LLM 复述 topConclusions）');

      const section0 = narrative.sections.find(s => s.heading.includes('§0') || s.heading.includes('结论先行'));
      if (section0) {
        const section0Titles = section0.items.map(i => i.title);
        const topProblems = narrative.topConclusions.map(c => c.problem);
        let duplicateFound: { idx: number; problem: string; section0Title: string; sim: number } | null = null;
        for (let i = 0; i < topProblems.length; i++) {
          for (const title of section0Titles) {
            const sim = textSimilarity(topProblems[i], title);
            if (sim > 0.9) {
              duplicateFound = { idx: i + 1, problem: topProblems[i], section0Title: title, sim };
              break;
            }
          }
          if (duplicateFound) break;
        }
        assert(!duplicateFound, '核心结论与 §0 不重复（topConclusions.problem 与 §0 item.title 相似度 ≤0.9）', {
          ...(duplicateFound ?? {}),
          hint: '§0 应是结论先行的叙事展开，不是 topConclusions 的复述——narrative LLM 没区分两层的语义角色',
        });
      } else {
        console.log('  SKIP: 没找到 §0 / 结论先行 section');
      }

      // ── [2c] §0 vs §3 下钻 narrative 内容重复检查（DR-49 新增，2026-07-20） ──
      // WT-046 v1/v2 两次打回都靠人眼发现 §0 ①②③ narrative 和 §3 下钻 ①②③ narrative
      // 内容重复（"MapSignificanceMgr 涨 57.88 倍 + 0.069→3.994ms + GC alloc 0→14043" 在两处都出现），
      // 机器断言全 PASS 但人眼一看就发现重复——因为机器根本没在查这件事。
      //
      // 检测思路：§0 应是父模块级摘要（"涨 8.87 倍 + 占 p50 33.3%"），§3 下钻才讲子节点细节
      // （"MapSignificanceMgr 0.069→3.994ms + GC alloc 0→14043"）。子节点细节的特征是"具体数字"——
      // foldChange（57.88）/ ms（0.069, 3.994）/ GC alloc（14043）等。
      //
      // 如果 §0 ① narrative 和 §3 下钻 ① narrative 共享 ≥2 个"数字特征串"（数字完全相同），
      // 就是内容重复——§0 不该讲子节点的具体数字。
      //
      // 阈值校准：用 v2 失败案例（§0 ① "57.88 倍 + 0.069→3.994 + 14043" 和 §3 下钻 ① 共享 3 个数字）
      // 和 v1 标杆（§0 是父模块摘要，§3 下钻是子节点细节，共享 0-1 个数字）实跑校准。
      // 阈值定 ≥2：抓 v2 的 3 个数字重复，不误杀 v1 的 0-1 个数字巧合重叠。
      console.log('\n[2c] §0 vs §3 下钻 narrative 内容重复检查（DR-49：防 §0 讲子节点细节，§3 下钻重复）');

      const section0ForDr49 = narrative.sections.find(s => s.heading.includes('§0') || s.heading.includes('结论先行'));
      const section3 = narrative.sections.find(s => s.heading.includes('§3'));
      if (section0ForDr49 && section3) {
        // §3 下钻 items：title 含"下钻"或以 ①②③④⑤⑥ 开头
        const drilldownItems = section3.items.filter(it =>
          /下钻/.test(it.title) || /^[①②③④⑤⑥⑦⑧⑨⑩]/.test(it.title)
        );
        // 提取"数字特征串"：foldChange（如 57.88, 8.87）/ ms 数字（如 0.069, 3.994）/ GC alloc 数字（如 14043）/ 百分比（如 33.3%, 59.1%）
        // 用正则抓所有"数字.数字"或"数字→数字"或"数字→数字"模式，过滤掉太常见的（如 0, 1, 16.66 帧预算）
        const extractNumericFeatures = (text: string): Set<string> => {
          const features = new Set<string>();
          // foldChange 模式：×N.N 或 X.NN 倍
          const foldChangeMatches = text.match(/×\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*倍/g) || [];
          for (const m of foldChangeMatches) features.add(m);
          // ms 数字模式：N.NNms（含 0.069, 3.994 等）
          const msMatches = text.match(/\d+(?:\.\d+)?\s*ms/g) || [];
          for (const m of msMatches) features.add(m);
          // GC alloc 数字：N→N 或 N → N（含 14043 等）
          const gcMatches = text.match(/GC\s*alloc\s*\d+(?:\.\d+)?/gi) || [];
          for (const m of gcMatches) features.add(m.toLowerCase());
          // 箭头数字模式：N.NN→N.NN 或 N.NN → N.NN（含 0.069→3.994 等）
          const arrowMatches = text.match(/\d+(?:\.\d+)?\s*[→→]\s*\d+(?:\.\d+)?/g) || [];
          for (const m of arrowMatches) features.add(m.replace(/\s+/g, ''));
          // 过滤太常见的数字（帧预算 16.66/33.33，0/1 这种）
          for (const common of ['16.66ms', '33.33ms', '0ms', '1ms', '×0', '×1', '×2', '0倍', '1倍', '2倍']) {
            features.delete(common);
          }
          return features;
        };

        let dr49Violation: { section0Idx: number; drilldownIdx: number; sharedFeatures: string[]; section0Title: string; drilldownTitle: string } | null = null;
        for (let i = 0; i < section0ForDr49.items.length; i++) {
          const s0Item = section0ForDr49.items[i];
          const s0Text = `${s0Item.title} ${s0Item.narrative ?? ''} ${s0Item.visualAsset?.ascii?.content ?? ''}`;
          const s0Features = extractNumericFeatures(s0Text);
          if (s0Features.size === 0) continue; // §0 没数字特征，跳过（可能是纯文字结论）
          for (let j = 0; j < drilldownItems.length; j++) {
            const ddItem = drilldownItems[j];
            const ddText = `${ddItem.title} ${ddItem.narrative ?? ''}`;
            const ddFeatures = extractNumericFeatures(ddText);
            const shared = [...s0Features].filter(f => ddFeatures.has(f));
            // 阈值 ≥2：§0 和 §3 下钻共享 ≥2 个数字特征串 = 内容重复
            if (shared.length >= 2) {
              dr49Violation = {
                section0Idx: i + 1,
                drilldownIdx: j + 1,
                sharedFeatures: shared,
                section0Title: s0Item.title,
                drilldownTitle: ddItem.title,
              };
              break;
            }
          }
          if (dr49Violation) break;
        }
        assert(!dr49Violation, '§0 与 §3 下钻 narrative 内容不重复（共享数字特征串 <2）', {
          ...(dr49Violation ?? {}),
          hint: '§0 应是父模块级摘要（涨 X 倍 + 占 p50 Y%），§3 下钻才讲子节点细节（具体 ms/GC alloc 数字）。§0 讲子节点具体数字 = 和 §3 下钻内容重复——DR-49 教训：prompt 约束只禁形式不禁内容，LLM 换形式绕过',
        });
      } else {
        console.log('  SKIP: 没找到 §0 或 §3 section');
      }


      // ── 3. report.html 视觉资产检查 ──
      console.log('\n[3] report.html 视觉资产（DR-41 五条硬规则 + 模板要求）');

      if (!fs.existsSync(reportHtmlPath)) {
        assert(false, 'report.html 存在', { path: reportHtmlPath });
      } else {
        const html = fs.readFileSync(reportHtmlPath, 'utf-8');

        // 3a. 调用树渲染（不是全 fallback）
        const fallbackCount = (html.match(/tree-section fallback/g) || []).length;
        // 真实树 = 含 tree-section class 但不含 fallback 的 div
        const allTreeSections = (html.match(/class="tree-section[^"]*"/g) || []).length;
        const realTreeCount = allTreeSections - fallbackCount;
        assert(realTreeCount > 0, `report.html 有真实调用树渲染 (>=1 棵，非全 fallback)`, { realTrees: realTreeCount, fallbacks: fallbackCount });

        // 3b. 核心结论表
        assert(html.includes('top-conclusions'), 'report.html 含核心结论表');
        assert(html.includes('tc-rank'), '核心结论表有 rank 列');

        // 3c. 已排除项（ruledOut，超越作文机的辨伪能力）
        assert(html.includes('ruled-out'), 'report.html 含已排除项（ruledOut）');

        // 3d. 优化优先级表
        assert(html.includes('priority-table'), 'report.html 含优化优先级表');

        // 3e. 严重度标注
        assert(html.includes('sev-dot') || html.includes('sev-chip'), 'report.html 含严重度标注');

        // 3f. provenance 校验痕迹（render-html 的 DR-44 A2 校验通过了才会产出 html）
        assert(html.includes('Prism render-html') || html.includes('render-html'), 'report.html 由 render-html 产出');

        // 3g. 无审计字段泄漏到 HTML
        assert(!html.includes('evidenceIds'), 'report.html 无 evidenceIds 泄漏');
        assert(!html.includes('selfCritique'), 'report.html 无 selfCritique 泄漏');

        // 3h. 文件大小（太小说明内容单薄）
        const sizeKB = fs.statSync(reportHtmlPath).size / 1024;
        if (sizeKB < 20) {
          warn(`report.html 偏小 (${sizeKB.toFixed(1)} KB)`, {
            hint: 'v5.3 标杆报告内容充实，<20KB 可能内容单薄或缺视觉资产',
          });
        } else {
          assert(true, `report.html 大小合理 (${sizeKB.toFixed(1)} KB)`);
        }

        // 3i. WT-045: 每棵 callTree 的 tree-row 数 ≤ 200（防巨长调用树，剪枝生效检查）
        //   按 <div class="tree-section" 或 <div class="tc-tree-section" 分割成多棵 callTree，
        //   每棵内数 class="tree-row" 的数量，任一棵 > 200 = FAIL。
        //   阈值 200 是宽松阈值：perfetto 每棵约 30-50 节点，unity 剪枝后预期 50-100 节点。
        //   抓"完全没剪枝"的退化（如 4695 行那种）。
        const treeRowMatches = html.match(/class="tree-row[^"]*"/g) || [];
        const totalTreeRows = treeRowMatches.length;
        // 按 tree-section / tc-tree-section 分割（topConclusions 挂的 callTree 用 tc-tree-section）
        // 简化实现：用 indexOf 顺序扫，统计每棵树内的 tree-row 数
        const treeStartRegex = /<div class="(tree-section|tc-tree-section)[^"]*"/g;
        const treeRowsPerTree: number[] = [];
        let lastStartIdx = -1;
        let m: RegExpExecArray | null;
        while ((m = treeStartRegex.exec(html)) !== null) {
          if (lastStartIdx >= 0) {
            // 上一棵树的范围 = [lastStartIdx, m.index)，数其中的 tree-row 数
            const segment = html.slice(lastStartIdx, m.index);
            const cnt = (segment.match(/class="tree-row[^"]*"/g) || []).length;
            treeRowsPerTree.push(cnt);
          }
          lastStartIdx = m.index;
        }
        if (lastStartIdx >= 0) {
          // 最后一棵树到文件尾
          const segment = html.slice(lastStartIdx);
          const cnt = (segment.match(/class="tree-row[^"]*"/g) || []).length;
          treeRowsPerTree.push(cnt);
        }
        const maxTreeRows = treeRowsPerTree.length > 0 ? Math.max(...treeRowsPerTree) : 0;
        assert(
          maxTreeRows <= 200,
          `每棵 callTree 的 tree-row 数 ≤ 200（防巨长调用树，WT-045）`,
          { maxTreeRows, threshold: 200, trees: treeRowsPerTree.length, totalTreeRows },
        );
      }
    }
  }
} else {
  console.log('\n[2] narrative.json 结构契约 — SKIP（未传 --dir）');
  console.log('[3] report.html 视觉资产 — SKIP（未传 --dir）');
  console.log('    提示：加 --dir data/prism-out/<run> 跑完整检查');
}

// ─────────────────────── Summary ───────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passCount} PASS, ${failCount} FAIL, ${warnings.length} WARN`);
if (warnings.length > 0) {
  console.log('\n⚠️  Warnings（验收时必须检查，不阻塞但可能暴露问题）:');
  warnings.forEach(w => console.log(w));
}
if (failCount > 0) {
  console.log('\nOVERALL: FAIL');
  process.exit(1);
} else {
  console.log('\nOVERALL: PASS' + (warnings.length > 0 ? ' (有 warning，验收时检查)' : ''));
  process.exit(0);
}
