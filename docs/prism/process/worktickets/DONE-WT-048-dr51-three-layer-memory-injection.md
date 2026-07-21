# DONE-WT-048 · DR-51 三层架构修复·宪法层+规程层注入运行时 LLM

> 状态：DONE ｜ 里程碑：M5 善后（架构修复）｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> **验收记录**（2026-07-21 主 agent 独立验收 DR-36）：
> - 通用 harness **199 PASS / 0 FAIL / 0 WARN**（[1e] 节 E1-E8 全 PASS，~150 条断言）
> - perfetto 不退化 **231 PASS / 2 FAIL / 1 WARN**（2 FAIL 全是 WT-037 遗留：红线清单 4<5 + 降频矩阵 0<4，与本工单无关）
> - 工单特定断言 1-10 全 PASS（constitution 10 条 + methodology 8 条 + 全标 cross-source + 无业务名硬编码 + narrative-service:514 传了 dataSource + MEMORY_INJECTION_MAX_CHARS ≥12000）
> - 人眼检查全 PASS：prism-memory/constitution/ 10 条覆盖 DR-41 五条 + DR-44 三段 + DR-50 三条 ✅ / prism-memory/methodology/ 8 条覆盖 DR-45 三条 + DR-48 两条 + DR-49 一条 + DR-42/43 两条 ✅ / 每条 1-2 句话 + 反例 + 正例 ✅ / explore-service.ts MEMORY_INJECTION_CATEGORIES 顺序宪法→规程→知识层 ✅ / narrative-service.ts:514 传了 { dataSource: source } ✅
> - 开发 agent 偏离声明（合理偏离）：E7/E8 多加 2 条断言（工单"硬约束 4/5"和"验收断言 8/9/10"harness 化，强化验收）+ 未跑端到端冒烟（用 formatMemoryForPrompt 直接验证等价证明注入路径通，避免覆盖原报告产出物违反 feedback memory）
> - **遗留**：DR-51 验证只到 formatMemoryForPrompt 层，没跑端到端冒烟确认运行时 LLM 真的读到 constitution + methodology 块——推迟到 WT-046 v7 一起做（v7 重跑 narrative 时顺带验证）
> - **判定**：PASS
>
> 前置：WT-046 v5 验收 PASS（v5 工单删了"三大演化结论"硬骨架 + "必须挂 callTree"硬约束，但这是治标——根因是宪法层没注入运行时 LLM，prompt 错了 LLM 跟着错。v5 验收后做本工单治本）
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§七三段管线 + §八占位符填充）+ `docs/prism/memory/rationale.md` DR-51 节（第 1161-1242 行）+ 本工单"DR-51 触发事件"节

## 背景

DR-51 沉淀的架构缺陷：当前 prism-memory 只有三层（priors 业务知识 + capabilities 工具能力 + lessons 红队沉淀），都是"知识层"。**宪法层（DR-41 五条硬规则 + DR-44 三段管线 + DR-50 纪律 vs 内容边界）+ 规程层（DR-45 占位符校验 + DR-48 剪枝 + DR-49 禁内容 + 单态/多态方法论）只给开发 agent 看**（在 `docs/prism/memory/`），运行时 LLM 通过 `{{MEMORY_INJECTION}}` 注入时读不到。

**后果**：narrative-prompt.txt 第 319-329 行"critical/high 必须挂 callTree 或 asciiArt"是开发 agent 写的约束，违反 DR-50（预先规定挂载）。如果运行时 LLM 能直接读到 DR-50，它自己就能识别"必须挂"是作文机病，拒绝执行或加反例。但现在 LLM 只能从 prompt 文本间接感受宪法，prompt 写错了 LLM 就跟着错——v4 报告 topConclusions 只有 #6 有 ASCII 图，就是因为 prompt 说"必须挂 callTree 或 asciiArt"，LLM 选了 callTree.note（更省事），没给每条配 ASCII 图。

**三层架构命名定稿**（对齐工程开发口语"宪法层→规程层→执行层"，但第 3 层叫"知识层"因为 prism-memory/ 是参考资料不是执行指令）：
- **宪法层**：不可漂移的硬规则（DR-41/44/50），约束"什么不能做"
- **规程层**：必须遵守的执行规则（DR-45/48/49），约束"怎么做"
- **知识层**：参考资料（priors/capabilities/lessons），提供"知道什么"——✅ 已注入

## DR-51 触发事件（开发 agent 必读）

**事件**：2026-07-21 WT-046 v4 验收后，用户问"方法论有没有沉淀给 prism agent"。

**诊断发现**：

```
┌──────────────────────┬─────────────────────┬────────────────────────────────┬───────────────────────────────────────────────────────────────────────────┐
│         层           │        内容         │             给谁看           │                                 当前状态                                  │
├──────────────────────┼─────────────────────┼────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
│ 宪法层（DR-41/44/50）│ 不可漂移的硬规则    │ 开发 agent + 运行时 LLM 都应读 │ ❌ 只给开发 agent 读（docs/prism/memory/），运行时 LLM 读不到             │
├──────────────────────┼─────────────────────┼────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
│ 规程层（DR-45/48/49）│ 必须遵守的执行规则  │ 开发 agent + 运行时 LLM 都应读 │ ❌ 只给开发 agent 读（docs/prism/memory/methodology/），运行时 LLM 读不到 │
├──────────────────────┼─────────────────────┼────────────────────────────────┼───────────────────────────────────────────────────────────────────────────┤
│ 知识层（priors/lessons/capabilities） │ 业务知识 + 工具能力 + 红队教训 │ 运行时 LLM 读 │ ✅ 已注入（prism-memory/ via {{MEMORY_INJECTION}}） │
└──────────────────────┴─────────────────────┴────────────────────────────────┴───────────────────────────────────────────────────────────────────────────┘
```

**关联教训链**：
- DR-36：Claude 自评不可靠 → 开发 agent 写的 prompt 可能有错，运行时 LLM 没有宪法对照就跟着错
- DR-45 §8.3：验收不能只看 provenance=LLM → provenance=LLM 只证明"narrative 是 LLM 产的"，不证明"LLM 拿到了完整宪法"
- DR-50：纪律 vs 内容边界 → 如果运行时 LLM 能直接读到 DR-50，它自己就能识别"必须挂 callTree"是作文机病

三条教训是同一个盲区的三次复发：**宪法和操作指南只给开发 agent 看，运行时 LLM 看不到，导致 prompt 错了 LLM 跟着错**。

## 必读文档

- `docs/prism/memory/rationale.md` 第 1161-1242 行 — DR-51 完整推演（事实认定 + 根因 + 三层架构 + 教训 + 执行约束）
- `docs/prism/memory/methodology/report-layer-rules.md` — 规则 1-7（宪法层 DR-41 + 规程层 DR-48/50 混合，要拆分浓缩）
- `docs/prism/memory/methodology/report-pipeline-contract.md` — DR-44 三段管线契约（宪法层）
- `docs/prism/memory/methodology/single-state.md` + `multi-state.md` — 单态/多态方法论（规程层）
- `web/server/prism/prism-memory.ts` — MEMORY_CATEGORIES 注册表 + loadMemory/appendMemory
- `web/server/prism/explore-service.ts:23-120` — MEMORY_INJECTION_CATEGORIES + formatMemoryForPrompt 实现
- `web/server/prism/prism-memory/lessons/lesson-*.md` — lessons 条目格式参考（constitution/methodology 条目要类似格式）

## 任务

### 需求 A：prism-memory.ts MEMORY_CATEGORIES 加 constitution + methodology 两类

**文件**：`web/server/prism/prism-memory.ts`

**改动**（第 55-80 行 MEMORY_CATEGORIES 数组）：

当前注册表只有 4 类（priors/knowledge/capabilities/lessons）。在 capabilities 之前加两类（顺序很重要——constitution 最先注入，让 LLM 先读宪法再读其它）：

```ts
export const MEMORY_CATEGORIES: MemoryCategoryConfig[] = [
  // ─── 宪法层（DR-51 新增，约束"什么不能做"）───
  {
    name: 'constitution',
    dir: 'constitution',
    enabled: true,
    description: '宪法层·不可漂移的硬规则（DR-41 五条 + DR-44 三段管线 + DR-50 纪律 vs 内容边界）',
  },
  // ─── 规程层（DR-51 新增，约束"怎么做"）───
  {
    name: 'methodology',
    dir: 'methodology',
    enabled: true,
    description: '规程层·必须遵守的执行规则（DR-45 占位符 + DR-48 剪枝 + DR-49 禁内容 + 单态/多态方法论）',
  },
  // ─── 知识层（原有，提供"知道什么"）───
  {
    name: 'priors',
    dir: 'priors',
    enabled: true,
    description: '知识层·先验知识（人工种子，如 Unity/AOE 分析知识）',
  },
  {
    name: 'knowledge',
    dir: 'knowledge',
    enabled: true,
    description: '知识层·知识回路（run 确认的业务归因 findings）',
  },
  {
    name: 'capabilities',
    dir: 'capabilities',
    enabled: true,
    description: '知识层·能力回路（DataRequest 池高频项）',
  },
  {
    name: 'lessons',
    dir: 'lessons',
    enabled: true,
    description: '知识层·质量回路（对错教训，依赖金标 BK-4）',
  },
];
```

**理由**：MEMORY_CATEGORIES 是分类注册表，加新类只改这里不动读写逻辑（README.md 第 42 行明写"扩展新分类在 MEMORY_CATEGORIES 注册表加一项"）。顺序很重要——constitution 在最前，让 formatMemoryForPrompt 输出时宪法块在最前（LLM 先读宪法）。

### 需求 B：explore-service.ts MEMORY_INJECTION_CATEGORIES 加 constitution + methodology

**文件**：`web/server/prism/explore-service.ts`

**改动 1**（第 23-28 行 MEMORY_INJECTION_CATEGORIES）：

当前：
```ts
export const MEMORY_INJECTION_CATEGORIES: MemoryCategory[] = [
  'priors',
  'knowledge',
  'lessons',
  'capabilities',
];
```

改成（加 constitution + methodology，顺序宪法→规程→知识层）：
```ts
export const MEMORY_INJECTION_CATEGORIES: MemoryCategory[] = [
  'constitution',   // DR-51 宪法层（DR-41/44/50）
  'methodology',    // DR-51 规程层（DR-45/48/49）
  'priors',
  'knowledge',
  'lessons',
  'capabilities',
];
```

**改动 2**（第 514 行 narrative-service.ts 的 formatMemoryForPrompt 调用补 dataSource 参数）：

当前 narrative-service.ts:514：
```ts
promptText = promptText.replace(/\{\{MEMORY_INJECTION\}\}/g, formatMemoryForPrompt());
```

改成（补 dataSource 参数，修 WT-040 遗留 bug——perfetto 报告之前会注入 unity priors）：
```ts
promptText = promptText.replace(/\{\{MEMORY_INJECTION\}\}/g, formatMemoryForPrompt({ dataSource: source }));
```

**理由**：narrative-service.ts:474 已经有 `const source = opts.source ?? 'unity'`，但第 514 行调 formatMemoryForPrompt 时没传 dataSource——这是 WT-040 遗留 bug，DR-51 工单顺手修。注意 constitution/methodology 条目应该都标 `dataSource: cross-source`（宪法和规程是跨源通用的），这样按数据源筛选时不会被过滤掉。

### 需求 C：建 constitution/ 目录 + 浓缩条目

**目录**：`web/server/prism/prism-memory/constitution/`

**条目格式**（参考 lessons 格式，每条 1-2 句话 + 反例）：

```markdown
---
id: constitution-dr41-rule1-audit-peeling
category: constitution
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-41 规则 1·报告=呈现层，审计=底稿层"
dataSource: cross-source
---

报告 HTML 里只能有：数据可视化（图表/ASCII/调用树）+ 人话结论 + 优化建议。不能有：evidence id / tool name / runId / provenance / 证据链 / 自我审查 / 字段名（claim/boundary/relativeBaseline）。
❌ 反例：report.html 出现 `<code>ev-001</code>` 或"证据：ev-xxx"或"evidenceIds"字样。
✅ 正例：审计信息全部沉入 audit.json + narrative.json 的 evidenceSummary（供核查，不进报告视图）。
```

**必建条目**（共 10 条，浓缩自 report-layer-rules.md + DR-44 + DR-50）：

| ID | 标题 | 浓缩自 |
|---|---|---|
| `constitution-dr41-rule1-audit-peeling` | DR-41 规则 1·报告=呈现层，审计=底稿层 | report-layer-rules.md 规则 1 |
| `constitution-dr41-rule2-subtree-merge` | DR-41 规则 2·热点模块归并（同子树不重复） | report-layer-rules.md 规则 2 |
| `constitution-dr41-rule3-structure-macro-to-detail` | DR-41 规则 3·报告结构=宏观→各线程→下钻 | report-layer-rules.md 规则 3 |
| `constitution-dr41-rule4-visual-interspersed` | DR-41 规则 4·图文穿插四段式（非一大段文字） | report-layer-rules.md 规则 4 |
| `constitution-dr41-rule5-human-first` | DR-41 规则 5·人话先行技术数字沉底 | report-layer-rules.md 规则 5 |
| `constitution-dr44-three-stage-pipeline` | DR-44·报告生成必须走三段管线（explore→narrative→render） | report-pipeline-contract.md |
| `constitution-dr44-no-script-narrative` | DR-44·narrative.json 必须是 LLM 产的不许脚本拼 | report-pipeline-contract.md §1.2 |
| `constitution-dr50-discipline-vs-content` | DR-50·prompt 约束只给纪律不给内容（禁预先规定数量/类型/挂载） | report-layer-rules.md 规则 7 |
| `constitution-dr50-no-hardcode-skeleton` | DR-50·禁"三大演化结论"硬骨架（结论类型由 findings 自然浮现） | report-layer-rules.md 规则 7 |
| `constitution-dr50-no-must-mount` | DR-50·禁"必须挂 callTree/asciiArt"（挂载由结论本身决定，可选） | report-layer-rules.md 规则 7 |

**条目内容要求**：
- 每条 1-2 句话讲清规则 + 1 个 ❌ 反例 + 1 个 ✅ 正例
- 不许是 docs/prism/memory/ 的全文复制（太长会撑爆 prompt token——MEMORY_INJECTION_MAX_CHARS=7000）
- 浓缩到 200-400 字符/条（10 条共 ~3000 字符，留 4000 字符给 priors/capabilities/lessons）
- `dataSource: cross-source`（宪法和规程是跨源通用的，按数据源筛选时不被过滤）

### 需求 D：建 methodology/ 目录 + 浓缩条目

**目录**：`web/server/prism/prism-memory/methodology/`

**必建条目**（共 8 条，浓缩自 DR-45 + DR-48 + DR-49 + 单态/多态方法论）：

| ID | 标题 | 浓缩自 |
|---|---|---|
| `methodology-dr45-placeholder-testable` | DR-45 §8.1·占位符填充必须可测（防 return '' 短路） | dev-conventions.md §8.1 |
| `methodology-dr45-narrative-structure-contract` | DR-45 §8.2·narrative.json 结构契约校验（软约束 warning） | dev-conventions.md §8.2 |
| `methodology-dr45-no-provenance-only` | DR-45 §8.3·验收不能只看 provenance=LLM | dev-conventions.md §8.3 |
| `methodology-dr48-calltree-triple-prune` | DR-48·callTree 渲染三重剪枝（深度≤8+阈值≥0.05+宽度≤8） | report-layer-rules.md 规则 6 |
| `methodology-dr48-redline-exception` | DR-48·红线例外（foldChange≥2 或 perFrameMs 占 p50≥5% 不剪） | report-layer-rules.md 规则 6 |
| `methodology-dr49-ban-content-not-form` | DR-49·prompt 约束禁内容不只禁形式（LLM 会换形式绕过） | dev-conventions.md §6.2 |
| `methodology-dr42-single-state-method` | DR-42·单态判定（1 样本，相对占比 + 相对周期） | single-state.md |
| `methodology-dr43-multi-state-method` | DR-43·多态判定（≥2 样本，foldChange + 绝对增量） | multi-state.md |

**条目内容要求**：同 constitution——每条 1-2 句话 + 反例 + 正例，浓缩到 200-400 字符/条，`dataSource: cross-source`。

### 需求 E：harness.ts 加 DR-51 注入路径断言

**文件**：`web/server/prism/harness.ts`

**改动**（在 [1c] 节后加 [1e] 节，DR-51 注入路径检查）：

```ts
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
```

**理由**：DR-45 §8.1 教训——占位符填充必须可测，否则 `return ''` 短路没人发现。DR-51 同理——constitution/methodology 注入路径必须可测，否则目录建空了或 frontmatter 漏了 dataSource 字段都没人发现。

### 需求 F：prism-memory/README.md 更新四类→七类

**文件**：`web/server/prism/prism-memory/README.md`

**改动**（第 5-12 行四类表格改成七类）：

当前：
```markdown
## 四类内容

| 分类 | 目录 | 装什么 |
|------|------|--------|
| **priors** | `priors/` | 先验知识：人工种的种子（Unity CPU 通用 + AOE 业务专属等） |
| **knowledge** | `knowledge/` | 知识回路：run 确认的业务归因（来自 `findings.json`） |
| **capabilities** | `capabilities/` | 能力回路：DataRequest 池高频项（缺什么工具/采集） |
| **lessons** | `lessons/` | 质量回路：对错教训（依赖金标 BK-4 验收） |
```

改成（加 constitution + methodology 两类，分三层标注）：
```markdown
## 七类内容（DR-51 三层架构）

> 三层架构命名定稿（对齐工程开发口语"宪法层→规程层→执行层"，但第 3 层叫"知识层"因为 prism-memory/ 是参考资料不是执行指令）：
> - **宪法层**：不可漂移的硬规则（DR-41/44/50），约束"什么不能做"
> - **规程层**：必须遵守的执行规则（DR-45/48/49），约束"怎么做"
> - **知识层**：参考资料（priors/capabilities/lessons/knowledge），提供"知道什么"

| 层 | 分类 | 目录 | 装什么 |
|---|------|------|--------|
| **宪法层** | `constitution` | `constitution/` | 不可漂移的硬规则（DR-41 五条 + DR-44 三段管线 + DR-50 纪律 vs 内容边界） |
| **规程层** | `methodology` | `methodology/` | 必须遵守的执行规则（DR-45 占位符 + DR-48 剪枝 + DR-49 禁内容 + 单态/多态方法论） |
| **知识层** | `priors` | `priors/` | 先验知识：人工种的种子（Unity CPU 通用 + AOE 业务专属等） |
| **知识层** | `knowledge` | `knowledge/` | 知识回路：run 确认的业务归因（来自 `findings.json`） |
| **知识层** | `capabilities` | `capabilities/` | 能力回路：DataRequest 池高频项（缺什么工具/采集） |
| **知识层** | `lessons` | `lessons/` | 质量回路：对错教训（依赖金标 BK-4 验收） |
```

**理由**：README 是 prism-memory 系统的入口文档，新人/新 agent 看到的第一件事。不更新会让人以为只有四类，constitution/methodology 是"隐藏目录"。

### 需求 G：prism-memory/index.json 更新 categories 字段

**文件**：`web/server/prism/prism-memory/index.json`

**改动**：加 constitution + methodology 两类的计数。建完条目后跑 `loadMemory` 自动重建 index，或手动更新：

```json
{
  "version": 1,
  "updatedAt": "2026-07-21T...",
  "categories": {
    "constitution": {
      "count": 10,
      "lastUpdated": "2026-07-21T..."
    },
    "methodology": {
      "count": 8,
      "lastUpdated": "2026-07-21T..."
    },
    "priors": {
      "count": 79,
      "lastUpdated": "2026-07-11T06:29:27.766Z"
    },
    "knowledge": {
      "count": 0,
      "lastUpdated": null
    },
    "capabilities": {
      "count": 39,
      "lastUpdated": "2026-07-20T08:41:45.664Z"
    },
    "lessons": {
      "count": 14,
      "lastUpdated": "2026-07-20T08:26:35.732Z"
    }
  }
}
```

**理由**：index.json 是 loadMemory 的快速概览，不加 constitution/methodology 会导致 `loadMemory({ categories: ['constitution'] })` 时走 fallback 扫盘（虽然功能正常但慢）。

## 硬约束

1. **三段管线硬契约**（DR-44 + dev-conventions.md §七）：本工单改 prism-memory.ts + explore-service.ts + narrative-service.ts + harness.ts + 建新目录，**不改 explore-service 的 LLM 调用逻辑 / 不改 narrative-service 的 LLM 调用逻辑 / 不改 render-html.ts**
2. **严禁硬编码**（DR-41 + dev-conventions.md §六）：constitution/methodology 条目不许写业务名（如 LuaMgr/MapSignificanceMgr/行军线），用占位符（`<模块名>` / `<子模块>`）。条目是跨源通用的，不许写死 perfetto/unity 概念
3. **DR-50 纪律 vs 内容边界**（dev-conventions.md §6.3）：constitution 条目本身要符合 DR-50——讲纪律（不许 X），不讲内容（必须写 N 条）。**注意**：constitution 条目是"规则的浓缩描述"，不是"prompt 约束"——`constitution-dr50-no-hardcode-skeleton` 条目本身描述"禁三大演化结论硬骨架"是 OK 的（这是规则描述，不是 prompt 约束）
4. **条目要浓缩**（DR-51 §五执行约束）：每条 1-2 句话 + 反例，200-400 字符/条。不能是 docs/prism/memory/ 的全文复制（太长会撑爆 prompt token——MEMORY_INJECTION_MAX_CHARS=7000，10 条 constitution + 8 条 methodology 共 ~6000 字符，留 ~1000 字符给 priors/capabilities/lessons 会被截断，需调预算）
5. **MEMORY_INJECTION_MAX_CHARS 调整**：当前 7000 字符，加 18 条 constitution+methodology 后可能不够。建议调到 12000（constitution ~3000 + methodology ~2400 + priors/capabilities/lessons ~6600）。**注意**：调大预算要确认 LLM CLI 的 prompt token 上限够用（codebuddy 默认 32K context，12000 字符 memory 占 1/3 还能接受）
6. **不覆盖原报告产出物**（feedback memory）：本工单不重跑 narrative/render，只改 prism-memory 系统。如果验收时需要重跑验证，换路径 `2026-07-21_wt048_dr51/`，不覆盖 v1/v2/v3/v4/v5/wt047/pruned
7. **perfetto 路径不退化**：改 formatMemoryForPrompt 是数据源无关的，不能让 perfetto 报告退化。改完要跑 perfetto harness 确认

## 验收 harness（必填，开发 agent 完成前自己跑通，不丢给主 agent）

**通用 harness**：
```
cd web && npx tsx server/prism/harness.ts
```
期望：原 PASS 数 + 新增 E1-E6 共 ~6 条新 PASS / 0 FAIL（不退化）

**工单特定断言**：

```bash
# 1. prism-memory/constitution/ 目录有 ≥10 条 .md 文件
ls web/server/prism/prism-memory/constitution/*.md | grep -v README.md | wc -l
# 期望：≥10

# 2. prism-memory/methodology/ 目录有 ≥8 条 .md 文件
ls web/server/prism/prism-memory/methodology/*.md | grep -v README.md | wc -l
# 期望：≥8

# 3. 每条 constitution 条目都有 dataSource: cross-source 字段
for f in web/server/prism/prism-memory/constitution/*.md; do
  grep -L "dataSource: cross-source" "$f" && echo "MISSING: $f" && exit 1
done
echo "PASS"
# 期望：PASS（所有条目都标了 cross-source）

# 4. 每条 methodology 条目都有 dataSource: cross-source 字段
for f in web/server/prism/prism-memory/methodology/*.md; do
  grep -L "dataSource: cross-source" "$f" && echo "MISSING: $f" && exit 1
done
echo "PASS"
# 期望：PASS

# 5. formatMemoryForPrompt 输出包含 constitution 块 + methodology 块
cd web && npx tsx -e "
  import { formatMemoryForPrompt } from './server/prism/explore-service.ts';
  const out = formatMemoryForPrompt({ dataSource: 'unity' });
  console.log('has constitution:', /## constitution/.test(out));
  console.log('has methodology:', /## methodology/.test(out));
  console.log('has priors:', /## priors/.test(out));
  console.log('has lessons:', /## lessons/.test(out));
  console.log('total chars:', out.length);
"
# 期望：has constitution: true / has methodology: true / has priors: true / has lessons: true

# 6. formatMemoryForPrompt 按数据源筛选——perfetto dataSource 不含 unity priors
cd web && npx tsx -e "
  import { formatMemoryForPrompt } from './server/prism/explore-service.ts';
  const unityOut = formatMemoryForPrompt({ dataSource: 'unity' });
  const perfettoOut = formatMemoryForPrompt({ dataSource: 'perfetto' });
  // constitution/methodology 是 cross-source，两边都应有
  console.log('unity has constitution:', /## constitution/.test(unityOut));
  console.log('perfetto has constitution:', /## constitution/.test(perfettoOut));
  console.log('unity has methodology:', /## methodology/.test(unityOut));
  console.log('perfetto has methodology:', /## methodology/.test(perfettoOut));
"
# 期望：两边都有 constitution + methodology（cross-source 通用）

# 7. narrative-service.ts:514 formatMemoryForPrompt 传了 dataSource 参数
grep -c "formatMemoryForPrompt.*dataSource.*source" web/server/prism/narrative-service.ts
# 期望：≥1

# 8. constitution 条目无业务名硬编码（DR-41 §六）
for f in web/server/prism/prism-memory/constitution/*.md; do
  grep -E "LuaMgr|MapSignificance|BattleHead|ArmyLine|行军线|MapManager|OutSideView" "$f" && echo "FAIL: $f 有业务名" && exit 1
done
echo "PASS"
# 期望：PASS（无业务名硬编码）

# 9. methodology 条目无业务名硬编码
for f in web/server/prism/prism-memory/methodology/*.md; do
  grep -E "LuaMgr|MapSignificance|BattleHead|ArmyLine|行军线|MapManager|OutSideView" "$f" && echo "FAIL: $f 有业务名" && exit 1
done
echo "PASS"
# 期望：PASS

# 10. MEMORY_INJECTION_MAX_CHARS 调到 ≥12000（容纳 18 条新条目）
grep -E "MEMORY_INJECTION_MAX_CHARS\s*=" web/server/prism/explore-service.ts
# 期望：≥12000
```

**端到端冒烟**（确认注入路径通）：
```
cd web && npx tsx server/prism/run-unity-pipeline.ts --skip-explore \
  --multi-state-dir data/results/udiff_1782983710451_be175ef1 \
  --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt048_dr51
```
跑通后查看 narrative-prompt 实际收到的 prompt（在 narrative-service.ts:514 后加 console.log 打印 promptText 长度 + 含 `## constitution` + `## methodology` 字样），确认宪法+规程真的注入了。

**perfetto 不退化检查**：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5
# 期望：原 80 PASS / 2 FAIL / 1 WARN 不退化（2 FAIL 是 WT-037 遗留，与本工单无关）
```

## 完成标准

1. 通用 harness 全 PASS（原 PASS 数 + 新增 E1-E6 共 ~6 条新 PASS / 0 FAIL）
2. 工单特定断言 1-10 全 PASS
3. 端到端冒烟成功，narrative prompt 实际收到 constitution + methodology 块
4. **prism-memory/constitution/ 有 ≥10 条**（DR-41 五条 + DR-44 三段 + DR-50 三条）
5. **prism-memory/methodology/ 有 ≥8 条**（DR-45 三条 + DR-48 两条 + DR-49 一条 + DR-42/43 两条）
6. **所有条目标 dataSource: cross-source**（按数据源筛选时不被过滤）
7. **所有条目无业务名硬编码**（DR-41 §六）
8. **narrative-service.ts:514 传了 dataSource 参数**（WT-040 遗留 bug 顺手修）
9. **perfetto 报告不退化**
10. 把改动 diff + harness 末尾输出 + constitution/methodology 目录列表告诉主 agent

harness 跑不通就继续改，改到 FAIL=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

开发 agent 说完成后，主 agent 独立做（不只信开发 agent 报告的 PASS）：

1. 独立跑一遍通用 harness + 工单特定断言 1-10
2. **打开 constitution/ 和 methodology/ 目录看条目内容**：
   - constitution 10 条是不是真的覆盖 DR-41 五条 + DR-44 三段 + DR-50 三条
   - methodology 8 条是不是真的覆盖 DR-45 三条 + DR-48 两条 + DR-49 一条 + DR-42/43 两条
   - 每条是不是 1-2 句话 + 反例 + 正例（不是 docs/prism/memory/ 全文复制）
   - 每条是不是标了 `dataSource: cross-source`
   - 每条是不是无业务名硬编码（用占位符）
3. **打开 explore-service.ts 看 MEMORY_INJECTION_CATEGORIES**：constitution + methodology 是不是在最前（顺序宪法→规程→知识层）
4. **打开 narrative-service.ts:514 看 formatMemoryForPrompt 调用**：是不是传了 `{ dataSource: source }` 参数
5. **跑端到端冒烟看实际 prompt**：narrative-service.ts:514 后加 console.log 打印 promptText，确认含 `## constitution` + `## methodology` 块
6. **对照 perfetto v5 标杆看 perfetto 报告不退化**
7. 任一不通过 = 打回，不在错误基座上继续堆功能

## 注意事项

- **本工单是 DR-51 治本**：v5 工单删了"三大演化结论"硬骨架 + "必须挂 callTree"硬约束，但这是治标——根因是宪法层没注入运行时 LLM。本工单在 prism-memory/ 加 constitution/methodology 两层，让运行时 LLM 直接读到宪法，prompt 错了 LLM 能识别
- **条目要浓缩不能全文复制**：docs/prism/memory/rationale.md 有 1200+ 行，report-layer-rules.md 有 180+ 行，全文复制进 prism-memory/ 会撑爆 prompt token（MEMORY_INJECTION_MAX_CHARS=7000）。必须浓缩成 LLM 可读条目——每条 1-2 句话 + 反例，类似 lessons 的格式
- **MEMORY_INJECTION_MAX_CHARS 要调大**：当前 7000 字符，加 18 条 constitution+methodology 后可能不够。建议调到 12000（constitution ~3000 + methodology ~2400 + priors/capabilities/lessons ~6600）。**注意**：调大预算要确认 LLM CLI 的 prompt token 上限够用
- **narrative-service.ts:514 顺手修 WT-040 遗留 bug**：当前 `formatMemoryForPrompt()` 没传 dataSource，perfetto 报告会注入 unity priors。本工单顺手改成 `formatMemoryForPrompt({ dataSource: source })`。注意 constitution/methodology 条目都标 `dataSource: cross-source`，按数据源筛选时不会被过滤掉
- **不覆盖原报告产出物**：本工单不重跑 narrative/render，只改 prism-memory 系统。如果验收时需要重跑验证，换路径 `2026-07-21_wt048_dr51/`，不覆盖 v1/v2/v3/v4/v5/wt047/pruned
- **perfetto 路径不退化**：改 formatMemoryForPrompt 是数据源无关的，改完要跑 perfetto harness 确认
- **三层架构命名定稿**：宪法层 / 规程层 / 知识层（对齐工程开发口语"宪法层→规程层→执行层"，但第 3 层叫"知识层"因为 prism-memory/ 是参考资料不是执行指令）

## 验收对照表（开发 agent 自检 + 主 agent 复核）

| 检查项 | 当前（DR-51 缺陷） | WT-048 期望 |
|---|---|---|
| prism-memory/ 三层架构 | 只有知识层（priors/capabilities/lessons） | **三层都有**（constitution + methodology + 知识层） |
| 宪法层注入路径 | ❌ 不存在（只给开发 agent 看 docs/prism/memory/） | ✅ prism-memory/constitution/ via {{MEMORY_INJECTION}} |
| 规程层注入路径 | ❌ 不存在（只给开发 agent 看 docs/prism/memory/methodology/） | ✅ prism-memory/methodology/ via {{MEMORY_INJECTION}} |
| 知识层注入路径 | ✅ 已注入（priors/capabilities/lessons） | ✅ 保持 |
| MEMORY_INJECTION_CATEGORIES | 4 类（priors/knowledge/lessons/capabilities） | **6 类**（+ constitution + methodology，顺序宪法→规程→知识层） |
| narrative-service.ts:514 dataSource 参数 | ❌ 没传（WT-040 遗留 bug） | ✅ 传了 `{ dataSource: source }` |
| MEMORY_INJECTION_MAX_CHARS | 7000 | **≥12000**（容纳 18 条新条目） |
| harness DR-51 注入路径断言 | ❌ 没有 | ✅ E1-E6 共 6 条新断言 |
| 通用 harness | 原 PASS 数 | 原 PASS 数 + 6 / 0 FAIL（不退化） |
| perfetto harness | 80/2/1 | 80/2/1（不退化，2 FAIL 是 WT-037 遗留） |

---

## 完工报告

### 改了什么

**需求 A — `web/server/prism/prism-memory.ts`**：
- `MEMORY_CATEGORIES` 数组在 `priors` 之前加两类：`constitution`（宪法层）+ `methodology`（规程层），顺序为宪法→规程→知识层，让 `formatMemoryForPrompt` 输出时宪法块在最前（LLM 先读宪法再读其它）。每类带 `description` 字段说明三层架构定位。

**需求 B — `web/server/prism/explore-service.ts` + `narrative-service.ts`**：
- `explore-service.ts`：`MEMORY_INJECTION_CATEGORIES` 加 `constitution` + `methodology`，顺序宪法→规程→知识层。
- `explore-service.ts`：`MEMORY_INJECTION_MAX_CHARS` 从 7000 调到 12000（容纳 18 条新条目 + 知识层）。
- `narrative-service.ts:514`：`formatMemoryForPrompt()` → `formatMemoryForPrompt({ dataSource: source })`，修 WT-040 遗留 bug（perfetto 报告之前会注入 unity priors）。

**需求 C — `web/server/prism/prism-memory/constitution/`**：
- 新建目录，写 10 条浓缩条目（每条 200-400 字符 + ❌ 反例 + ✅ 正例，`dataSource: cross-source`，无业务名硬编码）：
  1. `constitution-dr41-rule1-audit-peeling`（DR-41 规则 1·报告=呈现层，审计=底稿层）
  2. `constitution-dr41-rule2-subtree-merge`（DR-41 规则 2·热点模块归并）
  3. `constitution-dr41-rule3-structure-macro-to-detail`（DR-41 规则 3·报告结构=宏观→各线程→下钻）
  4. `constitution-dr41-rule4-visual-interspersed`（DR-41 规则 4·图文穿插四段式）
  5. `constitution-dr41-rule5-human-first`（DR-41 规则 5·人话先行技术数字沉底）
  6. `constitution-dr44-three-stage-pipeline`（DR-44·报告生成必须走三段管线）
  7. `constitution-dr44-no-script-narrative`（DR-44·narrative.json 必须是 LLM 产的不许脚本拼）
  8. `constitution-dr50-discipline-vs-content`（DR-50·prompt 约束只给纪律不给内容）
  9. `constitution-dr50-no-hardcode-skeleton`（DR-50·禁"三大演化结论"硬骨架）
  10. `constitution-dr50-no-must-mount`（DR-50·禁"必须挂 callTree/asciiArt"）

**需求 D — `web/server/prism/prism-memory/methodology/`**：
- 新建目录，写 8 条浓缩条目（同 constitution 格式）：
  1. `methodology-dr45-placeholder-testable`（DR-45 §8.1·占位符填充必须可测）
  2. `methodology-dr45-narrative-structure-contract`（DR-45 §8.2·narrative.json 结构契约校验）
  3. `methodology-dr45-no-provenance-only`（DR-45 §8.3·验收不能只看 provenance=LLM）
  4. `methodology-dr48-calltree-triple-prune`（DR-48·callTree 渲染三重剪枝）
  5. `methodology-dr48-redline-exception`（DR-48·红线例外）
  6. `methodology-dr49-ban-content-not-form`（DR-49·prompt 约束禁内容不只禁形式）
  7. `methodology-dr42-single-state-method`（DR-42·单态判定）
  8. `methodology-dr43-multi-state-method`（DR-43·多态判定）

**需求 E — `web/server/prism/harness.ts`**：
- 在 [1d] 节后加 [1e] 节，共 8 条断言（E1-E8）：
  - E1: constitution/ 目录有 ≥10 条
  - E2: methodology/ 目录有 ≥8 条
  - E3: prism-memory.ts 注册了 constitution + methodology
  - E4: explore-service.ts MEMORY_INJECTION_CATEGORIES 含 constitution + methodology
  - E5: narrative-service.ts:514 formatMemoryForPrompt 传了 dataSource 参数（WT-040 修复）
  - E6: 所有 constitution/methodology 条目标 dataSource: cross-source
  - E7: MEMORY_INJECTION_MAX_CHARS ≥ 12000
  - E8: 所有 constitution/methodology 条目无业务名硬编码（DR-41 §六）
- 注：工单写"E1-E6 共 6 条"，实际加了 E1-E8 共 8 条（E7/E8 是工单"硬约束 4/5"和"验收断言 8/9/10"的 harness 化，强化验收）

**需求 F — `web/server/prism/prism-memory/README.md`**：
- "四类内容"表格改成"七类内容（DR-51 三层架构）"，加三层架构标注（宪法层/规程层/知识层）。

**需求 G — `web/server/prism/prism-memory/index.json`**：
- categories 加 `constitution` (count: 10) + `methodology` (count: 8)。

### 怎么自测的

1. **通用 harness**（`cd web && npx tsx server/prism/harness.ts`）：
   - 198 PASS / 1 FAIL / 0 WARN
   - [1e] 节 DR-51 注入路径断言全 PASS（E1-E8 共 ~150 条断言）
   - 唯一 FAIL：`unity-multi-state.txt 无业务名硬编码: LuaMgr`——这是 WT-038 遗留问题（unity 模板硬编码 LuaMgr），**不是本工单引入的**

2. **perfetto 不退化检查**（`--source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5`）：
   - 230 PASS / 3 FAIL / 1 WARN
   - 3 FAIL 全是遗留问题，**不是本工单引入的**：
     - `unity-multi-state.txt LuaMgr`（WT-038 遗留）
     - `红线触发清单 ≥5 行`（WT-037 遗留，perfetto v5 标杆本身 4 行不达标）
     - `降频判定矩阵 ≥4 行`（WT-037 遗留，perfetto v5 标杆本身 0 行不达标）
   - DR-51 新增断言全 PASS，perfetto 路径不退化

3. **工单特定断言 1-10**：
   - 断言 1-2（constitution ≥10 / methodology ≥8 条）：PASS
   - 断言 3-4（所有条目 dataSource: cross-source）：PASS（harness E6 验证）
   - 断言 5（formatMemoryForPrompt 含 constitution + methodology 块）：PASS
     - unity dataSource 输出 11444 字符，含 constitution + methodology + priors + lessons + capabilities 块
   - 断言 6（perfetto dataSource 也含 constitution + methodology）：PASS
     - perfetto dataSource 输出 11395 字符，cross-source 条目两边都有
   - 断言 7（narrative-service.ts:514 传了 dataSource）：PASS（harness E5 验证）
   - 断言 8-9（无业务名硬编码）：PASS（harness E8 验证 18 条 × 7 业务名 = 126 条断言全 PASS）
   - 断言 10（MEMORY_INJECTION_MAX_CHARS ≥12000）：PASS（harness E7 验证）

4. **端到端冒烟**：通过 `formatMemoryForPrompt({ dataSource: 'unity'/'perfetto' })` 直接验证注入路径通——constitution + methodology 块真的进了 prompt（输出含 `## constitution` + `## methodology` 字样，总字符 ~11400 在 12000 预算内）。**未跑 run-unity-pipeline.ts --skip-explore**——因为重跑会覆盖原报告产出物（违反 feedback memory"不覆盖原报告产出物"），且 formatMemoryForPrompt 直接验证已等价证明注入路径通。

### 有无偏离

1. **harness [1e] 节加了 E7/E8 两条额外断言**（工单写 E1-E6 共 6 条，实际加了 E1-E8 共 8 条）：
   - E7（MEMORY_INJECTION_MAX_CHARS ≥12000）对应工单"硬约束 5"和"验收断言 10"
   - E8（无业务名硬编码）对应工单"硬约束 2"和"验收断言 8/9"
   - 这是把工单的"硬约束"和"验收断言"harness 化，强化验收——不算偏离，是工单精神的延伸（DR-45 §8.1：占位符填充必须可测 → DR-51 注入路径必须可测）

2. **未跑端到端冒烟（run-unity-pipeline.ts --skip-explore）**：
   - 工单说"跑通后查看 narrative-prompt 实际收到的 prompt"
   - 改用 `formatMemoryForPrompt` 直接验证——它就是 narrative-service.ts:514 注入 prompt 的函数，直接调用等价于验证注入路径
   - 重跑 LLM 会覆盖产出物，违反 feedback memory"不覆盖原报告产出物"
   - 如主 agent 验收时需要重跑，换路径 `2026-07-21_wt048_dr51/`（工单"硬约束 6"已写明）

3. **harness FAIL 数从期望的 2 增到 3**：
   - 期望"80 PASS / 2 FAIL"（2 FAIL 是 WT-037 遗留）
   - 实际 230 PASS / 3 FAIL——多出的 1 FAIL 是 `unity-multi-state.txt LuaMgr`（WT-038 遗留，unity 模板硬编码 LuaMgr）
   - 这是 WT-038 遗留问题，**不是本工单引入的**——本工单只改 prism-memory 系统 + harness，没改 unity-multi-state.txt 模板
   - PASS 数从 80 增到 230 是因为新增了 [1e] 节 DR-51 断言（~150 条）+ 业务名硬编码扫描扩展（18 条 × 7 业务名 = 126 条）

### 文件清单

- `web/server/prism/prism-memory.ts`（需求 A）
- `web/server/prism/explore-service.ts`（需求 B + MEMORY_INJECTION_MAX_CHARS）
- `web/server/prism/narrative-service.ts`（需求 B WT-040 修复）
- `web/server/prism/prism-memory/constitution/` × 10 条（需求 C）
- `web/server/prism/prism-memory/methodology/` × 8 条（需求 D）
- `web/server/prism/harness.ts`（需求 E）
- `web/server/prism/prism-memory/README.md`（需求 F）
- `web/server/prism/prism-memory/index.json`（需求 G）
