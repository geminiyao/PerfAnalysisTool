# TODO-WT-039 · 红线归并规则调整：分布形态 + 语义独立性

> 状态：TODO ｜ 里程碑：M5 多源扩展 ｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：无（纯 prompt + 方法论改动，但所有数据源报告都要用）
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§六严禁硬编码）+ DR-41（报告层五条硬规则规则 2）+ WT-036 工单（红线归并历史）

## 背景

用户反馈：当前红线归并规则"55:45 平均→统筹"是错的。以 WT-036 v5 报告为例：

| 父模块 | 子节点 | 旧规则判定 | 用户纠正 |
|---|---|---|---|
| LuaMgr 12.5% | BattleHeadMgr 4.92% + MapSignificanceMgr 3.99%（55:45） | "平均→统筹" ❌ | **拆出** ✅ |
| MapManager 9.5% | OutSideViewArmyLineMgr 5.19% + BattleUIManager 2.38%（69:31） | "有大头→拆出" ✅ | 拆出 ✅ |

**用户纠正的规则**："平均"的判定不是看 top-2 之间的比例，而是看 **top-N vs 其它子节点的分布形态 + 语义独立性**：

- **URP.Render 下 6 个子节点**占比都差不多，无明显大头 → 这才是"平均" → 统筹
- **LuaMgr 下** BattleHeadMgr 4.92% + MapSignificanceMgr 3.99% 是两个明确大头（其它子模块都是小头），top-2 占了绝大部分 → 不是"平均" → 拆出
- 而且 **BattleHeadMgr 和 MapSignificanceMgr 语义明显不同**（战斗头管理 vs 地图显著性管理，不同业务模块），即使占比接近也不该统筹——统筹会掩盖两个独立模块各自的特性

**适用范围**：所有数据源的所有调用树层级分析（perfetto/unity/simpleperf 的红线清单/callTree 下钻/topConclusion）。

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §六严禁硬编码
- `docs/prism/memory/methodology/report-layer-rules.md` — DR-41 规则 2 子树归并
- `docs/prism/process/worktickets/TODO-WT-036-*.md` — 红线归并历史（5 轮迭代）

## 任务

### 需求 A：新规则表述

**新规则**（适用于所有调用树层级、所有数据源）：

```
父模块下的子节点分布判定：
1. 分布形态：
   - 所有子节点占比都比较小且接近（无明显大头，如 URP.Render 下 6 个差不多）→ 统筹在父模块
   - 有明确大头子节点（top-N 占绝大部分，其它都是小头）→ 拆出大头
2. 语义独立性（有大头时再判）：
   - 大头之间语义不同（不同业务模块，如 BattleHeadMgr vs MapSignificanceMgr）→ 每个大头独立拆出
   - 大头之间语义相同（同一模块不同阶段，如 URP.Render 的子 Pass）→ 可统筹在父模块
```

**关键**：判定依据是"分布形态"（有无明显大头）+ "语义独立性"（大头是否不同模块），不是 top-2 比例。

### 需求 B：narrative-prompt.txt 更新红线归并规则

**文件**：`web/server/prism/prompts/narrative-prompt.txt`（§253-289）

当前规则（必须改）：
```
- 如果父模块下的子节点都比较平均（没有绝对大头）→ 统筹在父模块
- 如果父模块下有明显大头子节点 → 拆分出大头子节点
```

改成：
```
- 分布形态：所有子节点占比都比较小且接近（无明显大头）→ 统筹在父模块
- 分布形态：有明确大头子节点（top-N 占绝大部分）→ 拆出大头
- 语义独立性：大头之间语义不同（不同业务模块）→ 每个大头独立拆出
- 语义独立性：大头之间语义相同（同模块不同阶段）→ 可统筹在父模块
```

**注意**：如果 WT-038 已完成（narrative-prompt 数据源无关化），范例已经是占位符；如果 WT-038 未完成，范例还是业务名，本工单要把范例也改成占位符。

### 需求 C：perfetto-multi-state.txt 更新红线归并规则

**文件**：`web/server/prism/prompts/report-templates/perfetto-multi-state.txt`（§158-162）

当前规则（必须改）：
```
**统筹与拆出互斥**：对同一个父模块，要么统筹（列父模块 + hotspot 列子节点），要么拆出（列大头子节点 + 不列父模块）
```

改成：
```
**统筹与拆出互斥**：对同一个父模块，要么统筹（列父模块 + hotspot 列子节点），要么拆出（列大头子节点 + 不列父模块）
判定依据：
- 分布形态：所有子节点占比都比较小且接近（无明显大头）→ 统筹
- 分布形态：有明确大头子节点（top-N 占绝大部分）→ 拆出大头
- 语义独立性：大头之间语义不同（不同业务模块）→ 每个大头独立拆出
- 语义独立性：大头之间语义相同（同模块不同阶段）→ 可统筹在父模块
```

### 需求 D：narrative-service.ts 红队回路自动修复逻辑

**文件**：`web/server/prism/narrative-service.ts`

当前红队回路检测父子同列自动修复（WT-036 v5 加的）。本工单**不改机器检测逻辑**——机器只检测父子关系（callTree 真实父子），语义独立性由 LLM 判（LLM 在 narrative 阶段判断大头是否不同模块）。

但要在 narrative-prompt.txt 的红线归并规则段加一句引导：
```
★【语义独立性由你（LLM）判】
机器只能检测父子关系（callTree 真实父子），语义独立性（大头是否不同业务模块）由你判：
- 如果两个大头是不同业务模块（如战斗管理 vs 地图管理）→ 每个独立拆出
- 如果两个大头是同一模块的不同阶段（如渲染管线的不同 Pass）→ 可统筹在父模块
```

### 需求 E：DR-41 规则 2 方法论沉淀更新

**文件**：`docs/prism/memory/methodology/report-layer-rules.md`

更新 DR-41 规则 2（子树归并）的方法论描述，加入"分布形态 + 语义独立性"判定依据。

## 硬约束

1. **新规则适用于所有数据源**：perfetto/unity/simpleperf 的红线清单都要用
2. **机器只检测父子关系**：narrative-service.ts 的红队回路只检测 callTree 真实父子，语义独立性由 LLM 判
3. **不破坏 WT-036 v5 报告**：改完重跑 perfetto 报告，红线清单归并正确（LuaMgr 拆出 BattleHeadMgr + MapSignificanceMgr，不是统筹）
4. **不硬编码业务名**：narrative-prompt.txt 的范例用占位符（如 WT-038 已完成）或改占位符

## 验收 harness（必填，开发 agent 完成前自己跑通）

**通用 harness**（重跑 perfetto 报告，确认归并不破坏）：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5
```
期望：36 PASS / 0 FAIL / 1 WARN（和 WT-036 v5 一致）

**工单特定断言**：
```bash
# 1. narrative-prompt.txt 含新规则关键词
grep -c "分布形态\|语义独立性" web/server/prism/prompts/narrative-prompt.txt
# 期望 ≥3

# 2. narrative-prompt.txt 不再有"55:45"或"比较平均"这种旧表述
grep -c "比较平均" web/server/prism/prompts/narrative-prompt.txt
# 期望 0（或改写成"无明显大头"）

# 3. perfetto-multi-state.txt 含新规则
grep -c "分布形态\|语义独立性" web/server/prism/prompts/report-templates/perfetto-multi-state.txt
# 期望 ≥1

# 4. DR-41 方法论文件含新规则
grep -c "分布形态\|语义独立性" docs/prism/memory/methodology/report-layer-rules.md
# 期望 ≥1
```

**端到端冒烟**（重跑 perfetto 报告，确认红线清单归并正确）：
```
cd web && npx tsx server/prism/run-perfetto-pipeline.ts --skip-explore --out data/prism-out/bk26b-perfetto-triad/wt039-verify
```
跑通后检查 narrative.json 的红线清单 visualAsset.table，确认：
- LuaMgr 拆出 BattleHeadMgr + MapSignificanceMgr（不是统筹）
- MapManager 拆出 OutSideViewArmyLineMgr（大头拆出）

## 完成标准

1. 通用 harness FAIL=0
2. 工单特定断言全 PASS
3. 端到端冒烟成功，红线清单归并正确（LuaMgr 拆出不是统筹）
4. 把 report.html 路径 + 改动清单告诉主 agent

---

## 主 agent 验收清单

1. 独立跑一遍通用 harness + 工单特定断言
2. 打开 perfetto report.html 看红线清单（LuaMgr 应拆出 BattleHeadMgr + MapSignificanceMgr，不是统筹）
3. 确认 narrative-prompt.txt 含"分布形态 + 语义独立性"新规则
4. 确认 DR-41 方法论文件更新
5. 任一不通过 = 打回

## 注意事项

- **本工单是 unity 多态接入的前置**：unity 多态报告的红线清单也要用这个新规则
- **WT-038 和 WT-039 可并行**：WT-038 改占位符，WT-039 改规则。如果 WT-038 先完成，WT-039 在占位符基础上改规则；如果 WT-039 先完成，WT-038 在业务名基础上改占位符。两者不冲突
- **语义独立性是 LLM 判不是机器判**：机器只能检测父子关系（callTree），语义独立性（大头是否不同业务模块）由 LLM 在 narrative 阶段判断
