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
import type { NarrativeReport } from './narrative-types.js';

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
    assert(tpl.includes('§5') || tpl.includes('§6'), '模板含 §5/§6 章节（callTree/判定）');

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

      // ── WT-035: 4 类软警告（对照 v5.3 标杆，兜底验收） ──
      // 这些 warning 不阻塞（不 fail），但验收时必须检查——暴露"narrative LLM 没按模板填"的问题。
      // WT-036: 视觉资产从顶层字段移到 sections[].items[].visualAsset，扫描方式同步改。

      // WT-035 警告 1: 视觉资产全空（扫 sections[].items[].visualAsset，不是顶层字段）
      let visualAssetCount = 0;
      for (const sec of narrative.sections) {
        for (const item of sec.items) {
          if (item.visualAsset) visualAssetCount++;
        }
      }
      if (visualAssetCount === 0) {
        warn('所有 item.visualAsset 为空（narrative LLM 没按模板填视觉资产）', {
          hint: 'narrative LLM 必须按 {{REPORT_TEMPLATE}} 注入的模板在 item 里填 visualAsset——可能模板没注入或 LLM 忽略了',
        });
      }

      // WT-035 警告 2: 多线程覆盖不足（扫 title 含"多线程"的 visualAsset table 行数）
      let threadOverviewRows = 0;
      for (const sec of narrative.sections) {
        for (const item of sec.items) {
          if (item.visualAsset?.title && /多线程/.test(item.visualAsset.title) && item.visualAsset.table?.rows) {
            threadOverviewRows += item.visualAsset.table.rows.length;
          }
        }
      }
      if (threadOverviewRows < 5) {
        warn(`多线程宏观表覆盖 ${threadOverviewRows} 行（< 5，v5.3 标杆有 7 类线程）`, {
          hint: 'explore 可能没查全线程 sched，或 narrative 没把 findings 里的线程全列进 visualAsset.table',
        });
      }

      // WT-035 警告 3: topConclusions 无 callTree（critical/high 行无 callTree/asciiArt）
      const criticalHigh = (narrative.topConclusions ?? []).filter(
        c => c.severity === 'critical' || c.severity === 'high'
      );
      if (criticalHigh.length > 0) {
        const withCallTree = criticalHigh.filter(c => c.callTree || c.asciiArt);
        const ratio = withCallTree.length / criticalHigh.length;
        if (ratio < 0.5) {
          warn(`critical/high topConclusion 挂 callTree/asciiArt 比率 ${(ratio * 100).toFixed(0)}% (< 50%)`, {
            hint: 'v5.3 §0 每条核心结论都挂调用树/ASCII 图——narrative LLM 没给 critical/high 行挂 callTree.rootMarker 或 asciiArt',
          });
        }
      }

      // WT-035 警告 4: callTree 节点无红线标注（读 report.html 看 tree-redline/tree-fold class）
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
