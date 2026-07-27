/**
 * quality-verify.ts — 验证高风险优化点对 findings 质量的影响
 *
 * 原理：用 baseline 的 findings.json 作为"高质量基线"，
 * 检查如果 thinking 被约束（模拟），哪些质量维度会退化。
 *
 * 不真跑 LLM（太慢），而是：
 *   1. 测量 baseline findings 的质量指标（evidence 覆盖率/selfCritique 完整性/reasoning 深度）
 *   2. 模拟 thinking 约束后可能丢的内容（reasoning 缩短、selfCritique 省略）
 *   3. 用 harness 校验 narrative.json 结构契约不退化
 *
 * Usage (from web/):
 *   npx tsx server/prism/quality-verify.ts
 *   npx tsx server/prism/quality-verify.ts --dir data/prism-out/<run>
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, label: string, detail?: unknown): void {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passCount++;
  } else {
    console.log(`  FAIL: ${label}${detail !== undefined ? ' — ' + JSON.stringify(detail) : ''}`);
    failCount++;
  }
}

function measure(label: string, value: string | number, detail?: string): void {
  console.log(`  📊 ${label}: ${value}${detail ? ' (' + detail + ')' : ''}`);
}

// ─────────────────────────── baseline findings 质量分析 ───────────────────────────

const argv = process.argv.slice(2);
function getFlag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
}

const dirArg = getFlag('--dir') ?? path.join(
  __dirname, '..', '..', 'data', 'prism-out',
  'camera_ab_24072PX77C_20260723_194703', '2026-07-24_11-56-38',
);

console.log(`\n[1] Baseline findings 质量分析 (${dirArg})`);

const findingsPath = path.join(dirArg, 'findings.json');
const narrativePath = path.join(dirArg, 'narrative.json');

if (!fs.existsSync(findingsPath)) {
  console.log('  (findings.json 不存在，跳过)');
  process.exit(1);
}

const findings = JSON.parse(fs.readFileSync(findingsPath, 'utf-8'));
const findingsArr = Array.isArray(findings) ? findings : (findings.findings ?? []);

measure('findings 数量', findingsArr.length);

// 质量维度 1: evidence 覆盖率
let totalEvidence = 0;
let findingsWithEvidence = 0;
for (const f of findingsArr) {
  const evCount = f.evidence?.length ?? 0;
  totalEvidence += evCount;
  if (evCount > 0) findingsWithEvidence++;
}
measure('总 evidence 数', totalEvidence);
measure('有 evidence 的 findings', findingsWithEvidence);
measure('evidence 覆盖率', Math.round(findingsWithEvidence / findingsArr.length * 100) + '%');
measure('平均每条 evidence 数', Math.round(totalEvidence / findingsArr.length * 10) / 10);

// 质量维度 2: reasoning 深度
let totalReasoningChars = 0;
let findingsWithReasoning = 0;
for (const f of findingsArr) {
  const rLen = f.reasoning?.length ?? 0;
  totalReasoningChars += rLen;
  if (rLen > 100) findingsWithReasoning++;
}
measure('总 reasoning chars', totalReasoningChars);
measure('有 reasoning 的 findings', findingsWithReasoning);
measure('平均 reasoning chars', Math.round(totalReasoningChars / findingsArr.length));

// 质量维度 3: selfCritique 完整性
let totalSelfCritiqueChars = 0;
let findingsWithSelfCritique = 0;
for (const f of findingsArr) {
  const scLen = f.selfCritique?.length ?? 0;
  totalSelfCritiqueChars += scLen;
  if (scLen > 50) findingsWithSelfCritique++;
}
measure('总 selfCritique chars', totalSelfCritiqueChars);
measure('有 selfCritique 的 findings', findingsWithSelfCritique);
measure('selfCritique 覆盖率', Math.round(findingsWithSelfCritique / findingsArr.length * 100) + '%');

// 质量维度 4: recommendation 具体性
let totalRecChars = 0;
for (const f of findingsArr) {
  totalRecChars += f.recommendation?.length ?? 0;
}
measure('总 recommendation chars', totalRecChars);
measure('平均 recommendation chars', Math.round(totalRecChars / findingsArr.length));

// 质量维度 5: symbols 标注
let totalSymbols = 0;
for (const f of findingsArr) {
  totalSymbols += f.symbols?.length ?? 0;
}
measure('总 symbols 数', totalSymbols);

// 质量维度 6: tags 标注
let totalTags = 0;
for (const f of findingsArr) {
  totalTags += f.tags?.length ?? 0;
}
measure('总 tags 数', totalTags);

// ─────────────────────────── 模拟 thinking 约束后的退化 ───────────────────────────

console.log('\n[2] 模拟 thinking 约束后的质量退化');

// thinking 约束影响的是 LLM 的推理深度。
// baseline thinking 144K chars → 约束到每块 2000 chars → 总 42K chars（省 102K）
// reasoning 和 selfCritique 是 thinking 的"沉淀产物"，会同步缩短

const thinkingReductionRatio = 102 / 144; // 约束后 thinking 减少 71%
measure('thinking 减少比例', Math.round(thinkingReductionRatio * 100) + '%');

// 模拟：reasoning 缩短到原来的 50%（thinking 短了，reasoning 也会短，但有 prompt 约束保底）
const simulatedReasoningChars = Math.round(totalReasoningChars * 0.5);
measure('模拟 reasoning chars', simulatedReasoningChars, '缩短 50%');
measure('模拟 reasoning 退化 chars', totalReasoningChars - simulatedReasoningChars);

// 模拟：selfCritique 可能被省略（因为它不是 prompt 强制要求的"硬产出"）
const simulatedSelfCritiqueCoverage = Math.round(findingsWithSelfCritique * 0.5);
measure('模拟 selfCritique 覆盖 findings', simulatedSelfCritiqueCoverage, '可能减半');
measure('模拟 selfCritique 退化', findingsWithSelfCritique - simulatedSelfCritiqueCoverage + ' 条丢失');

// 模拟：evidence 数量不会变（evidence 是工具调用结果，和 thinking 无关）
measure('evidence 数量影响', 0, 'evidence 来自工具调用，不受 thinking 影响');

// 模拟：recommendation 可能变套话（没有深度推理，建议会变泛）
const genericRecCount = Math.round(findingsArr.length * 0.3); // 30% 可能变套话
measure('模拟 recommendation 变套话', genericRecCount + ' 条', '风险');

// ─────────────────────────── narrative 结构契约验证 ───────────────────────────

console.log('\n[3] Narrative 结构契约验证（harness 子集）');

if (fs.existsSync(narrativePath)) {
  const narrative = JSON.parse(fs.readFileSync(narrativePath, 'utf-8'));

  // 结构契约
  assert(narrative.overview?.length > 50, 'overview 非空且 >50 chars', { len: narrative.overview?.length });
  assert(narrative.rating !== undefined, 'rating 存在', { rating: narrative.rating });
  assert(Array.isArray(narrative.topConclusions), 'topConclusions 是数组');
  assert(narrative.topConclusions?.length >= 3, 'topConclusions >=3 条', { count: narrative.topConclusions?.length });
  assert(Array.isArray(narrative.sections), 'sections 是数组');

  measure('overview chars', narrative.overview?.length ?? 0);
  measure('topConclusions 数', narrative.topConclusions?.length ?? 0);
  measure('sections 数', narrative.sections?.length ?? 0);

  // 检查每个 section 的 items
  let totalItems = 0;
  let sectionsWithItems = 0;
  for (const s of (narrative.sections ?? [])) {
    const itemCount = s.items?.length ?? 0;
    totalItems += itemCount;
    if (itemCount > 0) sectionsWithItems++;
  }
  measure('总 items 数', totalItems);
  measure('有 items 的 sections', sectionsWithItems);
  measure('平均 items/section', Math.round(totalItems / (narrative.sections?.length ?? 1) * 10) / 10);

  // 检查 generatedBy（DR-44 宪法）
  assert(
    narrative.generatedBy === 'LLM' || narrative.provenance?.generatedBy === 'LLM',
    'generatedBy=LLM（DR-44 宪法）',
    { generatedBy: narrative.generatedBy ?? narrative.provenance?.generatedBy },
  );

  // 检查无审计字段（DR-41 规则 1）
  const auditFields = ['evidenceIds', 'findingIds', 'evidenceId'];
  let auditFieldFound = 0;
  const narrativeStr = JSON.stringify(narrative);
  for (const af of auditFields) {
    if (narrativeStr.includes(af)) auditFieldFound++;
  }
  assert(auditFieldFound === 0, 'narrative.json 无审计字段（DR-41 规则 1）', { found: auditFieldFound });

  // 检查 topConclusions 排序（severity 降序）
  const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const concls = narrative.topConclusions ?? [];
  let sortedOk = true;
  for (let i = 1; i < concls.length; i++) {
    const prev = sevOrder[concls[i - 1].severity] ?? 99;
    const curr = sevOrder[concls[i].severity] ?? 99;
    if (prev > curr) { sortedOk = false; break; }
  }
  assert(sortedOk, 'topConclusions 按 severity 降序');
} else {
  console.log('  (narrative.json 不存在，跳过)');
}

// ─────────────────────────── 各优化点质量影响汇总 ───────────────────────────

console.log('\n' + '═'.repeat(70));
console.log('各优化点对质量的影响（基于 baseline 实测）');
console.log('═'.repeat(70));
console.log('');
console.log('优化点                          | output 影响        | 质量风险');
console.log('────────────────────────────────|───────────────────|──────────────────────────');
console.log('A. --tools 排他                 | 无                 | 无损');
console.log('B. 禁止写完 findings 后验证      | -8K tokens         | 无损（砍的是强迫症行为）');
console.log('C. skipExplore 复用 findings    | 无（跳过 explore） | 无损（findings 不变）');
console.log('D. thinking 约束到 2000 chars   | -34K tokens        | 高风险：reasoning 可能浅化');
console.log(`   → baseline reasoning ${totalReasoningChars} chars → 模拟 ${simulatedReasoningChars} chars`);
console.log(`   → selfCritique 覆盖 ${findingsWithSelfCritique}/${findingsArr.length} → 模拟 ${simulatedSelfCritiqueCoverage}`);
console.log(`   → ${genericRecCount} 条 recommendation 可能变套话`);
console.log('E. narrative thinking 砍半      | -6.6K tokens       | 中风险：narrative 组织可能变粗');
console.log('F. tool_result 摘要             | 无                 | 中风险：LLM 可能丢细节');
console.log('G. narrative 结构骨架预置       | -4K tokens         | 中风险：可能限制叙事自由');
console.log('H. explore prompt 精简          | 无                 | 低风险：精简护栏可能放松约束');
console.log('');
console.log('结论：');
console.log('  - A/B/C 是无损或低风险，可立即做');
console.log('  - D 风险最高：thinking 约束会直接影响 reasoning/selfCritique 深度');
console.log(`    baseline 的 selfCritique 覆盖率 ${Math.round(findingsWithSelfCritique / findingsArr.length * 100)}% 是质量护城河`);
console.log('    DR-27 实测显示正是靠长 thinking agent 才能自审出"分母陷阱"等错误');
console.log('  - D 必须用 A/B test 验证：同数据跑两次（有/无 thinking 约束），对比 findings 质量');

console.log('');
process.exit(failCount > 0 ? 1 : 0);
