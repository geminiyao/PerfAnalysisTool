# TODO-WT-045 · callTree 渲染剪枝修复 + DR-48 沉淀

> 状态：TODO ｜ 里程碑：M5 善后（callTree 可读性收尾）｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：WT-044 ✅（unity 多态主线验收通过，但暴露 callTree 巨长问题）
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§六严禁硬编码 + §八占位符填充）+ `docs/prism/process/worktickets/DEFER-WT-024-report-quality-phase2.md`（§5.2 早就识别剪枝需求但延后）+ CODEBUDDY.md（严禁硬编码 + 三段管线硬契约）

## 背景

WT-044 验收通过，但人眼看 report.html 发现 callTree 巨长无比——10 棵 callTree 共 **4695 个 tree-row**，平均每棵 470 行，完全无可读性。

**根因三层**（已定位，开发 agent 不用重新诊断）：

1. **数据层差异（主因）**：
   - **perfetto**：`perfetto-profile-summary.json` 的 `callTrees` 字段在预处理时**已剪枝**（`_meta.note` 明确写："此处剪枝 totalPct>=1.0%, depth<=8"）。render 拿到几十个节点的精简树。
   - **unity**：`preprocess-result.json` 的 `aggregatedCallTrees` 字段**未剪枝**，是完整聚合树。实测主线程树 **3794 个节点**。render 拿到全量树。
   - 所以 perfetto 报告的 callTree 不长，unity 报告的 callTree 巨长——不是 render 逻辑差异，是数据层差异。

2. **render 层无剪枝（次因）**：
   - `unityAggNodeToDrillDown`（render-html.ts:1330）和 `renderTreeHTML`（render-html.ts:329-331）都是 `(node.children ?? []).map(c => ...)` 全展开递归，**无 maxDepth / minMsPerFrame / topPerLevel**
   - `perfettoNodeToDrillDown`（render-html.ts:1597）同样无剪枝，但 perfetto 数据已剪枝所以看不出来
   - unity 单态路径用 `drillDownMarker`（sqlite 查询带 `maxDepth:6 / minMsPerFrame:0.05 / topPerLevel:8`），所以单态报告也不长

3. **早就识别但一直延后**：
   - **WT-024 工单（DEFER 状态）§5.2 早就写了**："节点太多 + 没有剪枝。剪枝方案：perFrameMs < 0.1ms（多态）或占 p50 < 0.5%（单态）且无红线的节点折叠或省略"
   - WT-024 是 DEFER（延后），WT-036 加了红线标注但没加剪枝，WT-044 unity 多态接入时数据层差异把问题彻底暴露
   - 所以"改不掉"不是没人发现，是**早就识别了但一直延后**，每次新数据源接入都重新踩坑

**本工单要做的**：render 层加剪枝（止血）+ harness 加 callTree 节点数上限断言（防退化）+ DR-48 沉淀（防再踩）。数据层剪枝（preprocess 阶段对齐 perfetto）留后续工单，本工单不动 preprocess。

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §六严禁硬编码 + §八占位符填充纪律
- `docs/prism/process/worktickets/DEFER-WT-024-report-quality-phase2.md` — §5.2 剪枝需求（早就识别的剪枝方案）
- `web/server/prism/render-html.ts` — 改动目标文件（unityAggNodeToDrillDown / perfettoNodeToDrillDown / renderTreeHTML）
- `web/server/prism/harness.ts` — 加 callTree 节点数断言

## 任务

### 需求 A：render 层加 callTree 剪枝（止血，所有数据源通用）

**文件**：`web/server/prism/render-html.ts`

在 `unityAggNodeToDrillDown`（约 1313-1335 行）和 `perfettoNodeToDrillDown`（约 1578-1600 行）加剪枝参数，仿照 `drillDownMarker` 的 `maxDepth:6 / minMsPerFrame:0.05 / topPerLevel:8` 三重剪枝。

**剪枝规则**（来自 WT-024 §5.2，所有数据源通用）：
- **maxDepth ≤ 8**：递归深度超过 8 层不再展开 children
- **minMsPerFrame ≥ 0.05ms**：子节点 perFrameMs < 0.05ms 且无红线标注的，不渲染（折叠或省略）
- **topPerLevel ≤ 8**：每层只取 perFrameMs top 8 个子节点（红线标注的例外，必保留）
- **红线条目例外**：节点有 `redlineFlag` / `foldChange` / `severityTag` 标注的，必保留不剪枝（即使 perFrameMs 低）

**实现方式**（推荐）：
- 在 `unityAggNodeToDrillDown` 和 `perfettoNodeToDrillDown` 的递归里，对 children 排序（按 totalMsPerFrame 降序），取 top 8，过滤掉 perFrameMs < 0.05ms 且无 annotation 的，递归深度 > 8 不再展开 children
- `renderTreeHTML` 不用改（它只是渲染，剪枝在数据转换层做）
- 剪枝参数不要硬编码业务名，是通用阈值（maxDepth/minMsPerFrame/topPerLevel）

**关键**：剪枝逻辑放在数据转换层（`unityAggNodeToDrillDown` / `perfettoNodeToDrillDown`），不放在 `renderTreeHTML`——因为 renderTreeHTML 是纯渲染，剪枝是数据层职责。这样 perfetto 路径也能受益（虽然 perfetto 数据已剪枝，但双保险）。

### 需求 B：harness 加 callTree 节点数上限断言（防退化）

**文件**：`web/server/prism/harness.ts`

在 `[3] report.html 视觉资产` 节加一条断言：每棵 callTree 的 tree-row 数 ≤ 200。

**实现方式**：
- 解析 report.html，按 `<div class="tree-section"` 和 `<div class="tc-tree-section"` 分割成多棵 callTree
- 每棵 callTree 内数 `class="tree-row"` 的数量
- 任一棵 > 200 = FAIL（说明剪枝没生效或数据层退化）

**断言文案**：
```ts
assert(maxTreeRows <= 200, `每棵 callTree 的 tree-row 数 ≤ 200（防巨长调用树，WT-045）`, { maxTreeRows, threshold: 200 });
```

**阈值校准**：200 是宽松阈值。perfetto 报告（数据已剪枝）每棵树约 30-50 节点。unity 报告剪枝后预期每棵树 50-100 节点。200 留余量，抓"完全没剪枝"的退化（如 4695 行那种）。

### 需求 C：DR-48 沉淀（防再踩，主 agent 完成）

**文件**：`docs/prism/memory/rationale.md`（加 DR-48）+ `docs/prism/memory/methodology/report-layer-rules.md`（加规则 6）

主 agent 自己写，不派开发 agent。DR-48 内容：

> **DR-48 callTree 渲染必须剪枝**：render 层转换数据源 callTree 节点时必须三重剪枝（maxDepth≤8 + minMsPerFrame≥0.05 + topPerLevel≤8），红线条目例外必保留。harness 自动检查每棵 callTree tree-row 数 ≤ 200。
>
> **Why**：WT-024 §5.2 早就识别"节点太多 + 没有剪枝"，但延后没做。WT-044 unity 多态接入时数据层差异（perfetto 预处理已剪枝 / unity 未剪枝）把问题彻底暴露——10 棵 callTree 共 4695 个 tree-row，完全无可读性。每次新数据源接入都重新踩坑。
>
> **How to apply**：①render 层数据转换函数（如 unityAggNodeToDrillDown）必须带剪枝参数，不能全展开 children。②harness 必须有 callTree 节点数上限断言（≤200），防退化。③新数据源接入时，preprocess 阶段最好也剪枝（对齐 perfetto 的 totalPct≥1.0% + depth≤8），但 render 层剪枝是底线，不能依赖数据层。

## 硬约束

1. **三段管线硬契约**（DR-44 + dev-conventions.md §七）：本工单只改 render 层（render-html.ts）和 harness（harness.ts），不动 explore-service / narrative-service / tools.ts / preprocess 脚本
2. **严禁硬编码**（DR-41 + dev-conventions.md §六）：剪枝参数（maxDepth/minMsPerFrame/topPerLevel）是通用阈值，不硬编码业务名。阈值写常量或参数，不写死在 if-else 里
3. **不覆盖原报告产出物**（feedback memory）：重跑 render 时新 report.html 不许覆盖 `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_rerender/report.html`，换路径或备份
4. **不重跑 LLM**：本工单只改 render 层，用 `--skip-explore` 复用已有 findings.json + narrative.json，不重跑 explore/narrative LLM（省 30min）
5. **红线条目例外**：剪枝不能剪掉有 `redlineFlag` / `foldChange` / `severityTag` 标注的节点——这些是 explore LLM 标的重点，即使 perFrameMs 低也要保留
6. **perfetto 路径不退化**：改完剪枝后 perfetto 报告的 callTree 也要能渲染（虽然 perfetto 数据已剪枝，双保险不能误伤）

## 验收 harness（必填，开发 agent 完成前自己跑通，不丢给主 agent）

**通用 harness（跑新剪枝后的 unity 多态报告）**：
```
cd web && npx tsx server/prism/harness.ts --source unity --dir <新产出目录>
```
期望：82 PASS / 0 FAIL / 0 WARN（原 81 PASS + 需求 B 新加 1 条 callTree 节点数断言 PASS）

**工单特定断言**：
```bash
# 1. unity 多态报告每棵 callTree tree-row 数 ≤ 200
# 用 PowerShell 或 bash 数：
# 按 <div class="tree-section" 或 <div class="tc-tree-section" 分割，每段数 class="tree-row"
# 期望 maxTreeRows ≤ 200

# 2. perfetto 报告不退化（跑 perfetto 标杆报告）
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/<最新timestamp>
# 期望：原 PASS 数不变（剪枝不能误伤 perfetto）

# 3. 红线条目不被剪枝
# 检查 report.html 含 redline 标注的 tree-row 数 ≥ 1
grep -c "tree-redline" <新产出目录>/report.html
# 期望 ≥1（红线节点保留）

# 4. 剪枝参数存在（render-html.ts 有 maxDepth/minMsPerFrame/topPerLevel）
grep -c "maxDepth\|minMsPerFrame\|topPerLevel" web/server/prism/render-html.ts
# 期望 ≥3（三个剪枝参数都加了）

# 5. render-html.ts 的 unityAggNodeToDrillDown 有剪枝逻辑（不是全展开 children）
grep -c "sort.*totalMsPerFrame\|slice.*8\|filter.*perFrame" web/server/prism/render-html.ts
# 期望 ≥1（有排序+取 top N+过滤的剪枝逻辑）
```

**端到端冒烟（只重跑 render，不重跑 LLM）**：
```
# 复用 WT-044 的 narrative.json，只重跑 render，换新目录（不覆盖原 report.html）
cd web
mkdir -p data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_pruned
cp data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_rerender/{narrative,verdict,findings}.json \
   data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_pruned/
npx tsx server/prism/render-html.ts --dir data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_pruned
```

跑完看日志，期望：
- `[render-html] unity multi-state tree OK: "MapCameraCtrl.UpdateCameraPos" → 2.67ms/frame`（4 个 OK + 1 NOT FOUND LuaMtGc，和 WT-044 一致）
- report.html 大小从 2.1MB 降到预期 ~100-200KB（剪枝后节点数大幅减少）

## 完成标准

1. 通用 harness 82 PASS / 0 FAIL / 0 WARN（含需求 B 新加的 callTree 节点数断言）
2. 工单特定断言全 PASS
3. 端到端冒烟成功，新 report.html 产出（路径 `2026-07-20_pruned/report.html`）
4. **不覆盖原 `2026-07-20_rerender/report.html`**（feedback memory 硬约束）
5. **每棵 callTree tree-row 数 ≤ 200**（剪枝生效）
6. **红线条目保留**（redlineFlag/foldChange/severityTag 标注的节点不剪枝）
7. **perfetto 报告不退化**（剪枝逻辑对 perfetto 路径无负面影响）
8. 把改动 diff + harness 末尾输出 + 新 report.html 路径 + 每棵 callTree tree-row 数告诉主 agent

harness 跑不通就继续改，改到 FAIL=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

开发 agent 说完成后，主 agent 独立做（不只信开发 agent 报告的 PASS）：

1. 独立跑一遍通用 harness + 工单特定断言
2. 打开 report.html 看调用树可读性（harness 验不了"调用树有焦点"，要人看）：
   - 每棵 callTree 是否聚焦重点（红线节点 + top N 大头）
   - 是否有"叶子节点一堆 0.0x ms 的占行"（剪枝没生效）
   - 红线节点是否被剪掉（不能剪）
3. 对照 WT-044 原报告（`2026-07-20_rerender/report.html` 4695 tree-row）看剪枝后是否大幅减少（预期每棵 ≤100）
4. 确认 perfetto 报告不退化（跑 perfetto 标杆报告 harness）
5. 写 DR-48 沉淀（rationale.md + report-layer-rules.md），加进 backlog 待主 agent 批次做
6. 任一不通过 = 打回，不在错误基座上继续堆功能

## 注意事项

- **本工单是 render 层止血**：数据层剪枝（preprocess 阶段对齐 perfetto 的 totalPct≥1.0% + depth≤8）留后续工单，本工单不动 preprocess。render 层剪枝是底线，不能依赖数据层。
- **WT-024 §5.2 的剪枝需求终于落地**：DEFER 状态的剪枝需求，WT-045 兑现。后续如果 WT-024 整体激活，§5.2 已完成。
- **DR-48 沉淀是防再踩的关键**：光改代码不够，要沉淀成 DR + harness 断言，否则下次新数据源接入还会踩。
- **不重跑 LLM**：本工单只改 render 层，用 `--skip-explore` 复用已有 findings.json + narrative.json。
- **剪枝参数是通用阈值不是硬编码**：maxDepth/minMsPerFrame/topPerLevel 是数据源无关的通用阈值，不违反"严禁硬编码业务名"。阈值写常量（如 `const MAX_TREE_DEPTH = 8`），不写死在 if-else 里。
