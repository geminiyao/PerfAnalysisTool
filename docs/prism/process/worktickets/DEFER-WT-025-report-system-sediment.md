# DEFER-WT-025 · 报告产出系统沉淀：方法论 + 可复用工具 + 自动检查三位一体

> ⚠️ **本工单方向已作废 — 新方向见 DR-44**
>
> 本工单的"在 `perfetto-report-mvp.ts` 脚本基座上抽 report-utils.ts + 加 DR-41 自动检查"思路，
> 在 2026-07-15 诊断后发现**基座本身错了**——perfetto 报告三段管线一段都没走，是脚本拼的作文机。
> 详见 `docs/prism/memory/methodology/report-pipeline-contract.md`（DR-44）。
>
> DR-44 §5.1 已明确作废 WT-020/023/WT-024/**WT-025（部分）**：
> - `humanizeFinding` 类"脚本写人话"反模式 → 作废
> - 子树归并 / 自动检查 → 保留，但移到新框架层
>
> **新方向**：走 DR-44 三段管线修复（A 框架契约 → B perfetto 接入 → C 反向沉淀 v5.3），
> 对应新工单 WT-026 / WT-027 / WT-028。本工单保留仅作历史轨迹，**不要再按本工单施工**。
>
> 其中本工单的"report-utils.ts 工具沉淀 / DR-41 五条自动检查 / 方法论索引"**需求内容本身仍有效**，
> 会在 WT-026（框架契约）+ WT-028（反向沉淀）阶段以"数据源无关框架层"形式重新落地。

---

# 原工单内容（已作废，仅留历史）

> 状态：DEFER ｜ 里程碑：M5 Perfetto agent 化 / 跨源报告基建 ｜ 执行方：主 agent 自己
>
> 触发：用户反馈"每次在产出报告这一环花了非常非常多的时间，这个需要系统沉淀下"
>
> 前置：DR-41（报告层五条硬规则）+ DR-42（单态分析方法论 draft）+ WT-023（报告层重构 DONE）+ WT-024（报告质量二期 TODO）

## 背景

报告产出环节反复返工，时间成本极高：

- WT-018 MVP → WT-021 返工一次（加 v5.3 字段）→ WT-021 返工二次（结构不可读）→ WT-023 报告层重构（DR-41 五条硬规则）→ WT-024 质量二期（三态对照+下钻深度）
- 每次都在"报告怎么写"上花大量时间，根因是**方法论散落 + 可复用工具没沉淀 + 自动检查只看字段存在**

DR-41 解决了"宪法"层（五条硬规则），但"执行层"没沉淀：
1. **方法论散落**：DR-41（多态）+ DR-42 draft（单态）+ v5.3 标杆 + simpleperf v4 标杆，没有统一索引
2. **可复用工具缺失**：`buildNameParentChains` / `mergeBySubtree` / `humanizeRelativeJudgment` / `humanizeCausalInference` 等函数硬编码在 `perfetto-report-mvp.ts` 里，simpleperf/unity 报告要用得重写
3. **自动检查薄弱**：tools.test.ts 只断言"字段存在/中文/数量"，不检查 DR-41 五条硬规则（审计剥离/子树归并/图文穿插/人话先行/结构层次）

## 三个需求

### 需求 1：方法论统一索引（DR-41 + DR-42 + 标杆对照表）

- 定稿 DR-42 单态分析方法论（在 simpleperf 或 unity 单源上验证后）
- 新建 `docs/prism/memory/report-methodology-index.md`：统一索引 DR-41（多态宪法）+ DR-42（单态补充）+ 标杆报告对照表（v5.3 perfetto / v4 simpleperf / 未来 unity）+ 报告脚本对照检查清单
- 每个数据源的报告脚本开发前必读此索引

### 需求 2：报告层可复用工具 `report-utils.ts`

把 `perfetto-report-mvp.ts` 里的报告层通用函数抽成 `web/server/prism/report-utils.ts`：

**子树归并工具**：
- `buildNameParentChains(callTree)` → `Map<name, parentChain>`
- `mergeBySubtree(entries, parentChains, getName)` → 归并后的 entries
- `isAncestorOf(ancestor, child, parentChains)` → boolean

**人话化工具**：
- `humanizeRelativeJudgment(rb)` → 去字段名的人话
- `humanizeCausalInference(inference)` → 去字段名的人话
- `humanizeFoldChange(fc)` → "新增" / "×N" / "持平"

**判定工具（多态 + 单态统一）**：
- `detectStateMode(triadSummaries)` → 'single' | 'multi'
- `judgeByFoldChange(fc, threshold)` → 多态判定
- `judgeByP50Ratio(perFrameMs, p50Ms, threshold)` → 单态判定（占 p50 百分比）
- `judgeByVsync(avgMs, vsyncMs, ratio)` → GPU-bound 判定（单次 vs vsync 周期）

**叙事工具**：
- `buildTopConclusionBlock(rank, tag, severity, oneLiner, asciiChart, keyNumbers, seeAlso)` → TopConclusionBlock
- `buildAsciiBar(value, max, width)` → ASCII 柱状图
- `buildSubtreeDrilldown(module, callTree, findings, parentChains)` → 子树下钻结构（主入口→子树→红线模块三层）

**渲染工具**：
- `renderCallTreeWithSeverity(tree, mode)` → 带严重程度标注的 callTree（🔴/🟡/🟢/📈/[wrapper]）
- `renderFourPartBlock(block)` → 四段式块 HTML
- `renderDrilldownCard(module, perFrame, children, gcAlloc, optimization)` → 下钻卡片 HTML

### 需求 3：DR-41 五条硬规则自动检查

在 `tools.test.ts` 或新建 `report-rules.test.ts` 里加 DR-41 五条硬规则的自动化检查：

**规则 1 审计剥离检查**：
```ts
assert(!html.includes('evidence id') && !html.includes('证据：') && !html.includes('runId'), 'DR-41 规则1：无审计字样');
assert(!html.includes('审计 / 证据入口'), 'DR-41 规则1：无审计 section');
```

**规则 2 子树归并检查**：
```ts
// 红线矩阵同一子树不超过 1 行
const urpRows = narrative.redlineMatrix.rows.filter(r => /URP/.test(r.module));
assert(urpRows.length <= 1, 'DR-41 规则2：URP 子树归并到 1 行');
// 归并的 children 不为空
assert(urpRows[0].mergedChildren?.length > 0, 'DR-41 规则2：mergedChildren 非空');
```

**规则 3 结构层次检查**：
```ts
assert(html.includes('§0') && html.includes('§1') && html.includes('§6'), 'DR-41 规则3：章节顺序');
assert(!html.includes('§7'), 'DR-41 规则3：无 §7（GPU-bound 合并进 §3）');
```

**规则 4 图文穿插检查**：
```ts
assert(narrative.topConclusionBlocks.length >= 3, 'DR-41 规则4：§0 三大独立结论块');
assert(html.includes('blockquote'), 'DR-41 规则4：引用块');
assert(html.includes('pre.ascii'), 'DR-41 规则4：ASCII 图');
```

**规则 5 人话先行检查**：
```ts
const fieldNames = ['byState.S.totalMs', 'coveragePct', 'foldChange=9999', 'effectiveCoveragePct', 'parentChain='];
for (const fn of fieldNames) {
  assert(!html.includes(fn), `DR-41 规则5：正文无字段名 ${fn}`);
}
```

## 验收命令

```bash
cd web && node --import tsx server/scripts/perfetto-report-mvp.ts  # 重建产物
cd web && node --import tsx server/prism/tools.test.ts  # 应 ≥199 PASS（含新增 DR-41 规则检查）
```

## 验收点

1. `docs/prism/memory/report-methodology-index.md` 存在，含 DR-41 + DR-42 + 标杆对照表
2. `web/server/prism/report-utils.ts` 存在，含子树归并/人话化/判定/叙事/渲染 5 类工具函数
3. `perfetto-report-mvp.ts` import report-utils，无重复实现
4. tools.test.ts 含 DR-41 五条硬规则自动检查（≥10 个新 assert）
5. 199 PASS / 0 FAIL

## 约束

- 不硬编码业务名清单/绝对阈值/§0-§9 死模板
- 单态判定用相对占比（占 p50% / 占 vsync% / 占 cpuinfo%），不硬编码绝对 ms/温度
- 可复用工具必须数据源无关（perfetto/simpleperf/unity 都能用）
- DR-42 定稿前，report-utils 的单态判定函数先实现但标注 `// draft, pending DR-42 validation`

## 优先级

- **P0**：需求 3（DR-41 自动检查）—— 防止返工，每次报告脚本改动后自动核五条硬规则
- **P1**：需求 2（report-utils.ts）—— 为 M5 多源（simpleperf/unity）做准备
- **P1**：需求 1（方法论索引）—— 统一索引，避免方法论散落
- **P2**：DR-42 定稿 —— 需要 simpleperf 或 unity 单源验证后定稿
