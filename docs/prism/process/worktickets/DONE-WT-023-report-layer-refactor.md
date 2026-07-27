# WT-023 · 报告层重构：审计剥离 + 模块归并 + 图文穿插 + 结构重排

> 状态：**DONE** ✅ ｜ 里程碑：M5 Perfetto agent 化 ｜ 执行方：主 agent 自己（不派 Cursor，因为差距在叙事结构）
>
> 完成时间：2026-07-14 ｜ 验收：199 PASS / 0 FAIL ｜ DR-41 五条硬规则逐项核通过
>
> 前置：读 `docs/prism/memory/dr-41-report-layer-methodology.md`（报告层五条硬规则）+ `docs/report/performance-report_perfetto_ULTIMATE_v5.3.md`（标杆）。

## 背景

WT-021 返工一次后用户再次打回。返工加了 v5.3 对齐字段，但报告仍不可读：
1. 审计证据入口（evidence id/tool/runId 表）还在 report.html 里——DR-39 早就说剥离
2. 顶部结论 #3/#4 是同一模块（URP.Render vs URP.RenderCameraStack）
3. 红线矩阵 top 8 里 6 行是 URP 子树不同层（Render/CameraStack/SingleCamera/AfterRendering/Submit/WaitForPresent）
4. §4 off-CPU 和 §7 GPU-bound 重复讲 GPU
5. 文字一大段掺杂数据（"三态主趋势：UnityMain runningPct 86.94→77.82→56.99; avgMhz..."）

根因：报告层缺方法论沉淀。DR-41 已补。本工单执行 DR-41 五条硬规则。

## 返工范围

只改 `web/server/scripts/perfetto-report-mvp.ts`（renderHtml + buildNarrative 的叙事组织部分）。不改 explore/provider/query。不改数据层。

## 四个需求（可拆成 4 个新对话独立开发）

### 需求 1：审计剥离（DR-41 规则 1）

- report.html 删除"审计 / 证据入口"整个 section
- report.html 删除所有 `evidence id` / `tool` / `runId` / `evidenceIds` 显示
- report.html 删除 finding card 里的"证据：ev-xxx"行
- narrative.json 保留 `evidenceSummary`（供 audit.json 核查），但 report.html 不渲染
- finding card 的 `claim` 字段折叠或不显示（只显示 `humanNarrative`）

### 需求 2：热点模块归并（DR-41 规则 2，填补空白）

- 红线矩阵/顶部结论/ROI 做**子树归并**：若模块 A 的 parentChain 包含模块 B（A 是 B 的后代），且 B 已在列表里，A 不单独成行
- 归并后输出格式：`URP.Render（含 RenderCameraStack/SingleCamera/AfterRendering/Submit/WaitForPresent）` 一行
- 实现方向：从 callTree 的 parentChain 动态构建父子关系图，top 列表按 perFrameMs 排序后从大到小遍历，祖先已在列表则跳过 child
- **不硬编码**：归并规则用 parentChain 包含关系，不用预设"URP 是一棵树"这种业务知识

### 需求 3：图文穿插四段式（DR-41 规则 4）

- §0 结论先行：三大独立结论，每个用"引用块 + 加粗一句话 + ASCII 图 + 关键数字解读"四段式（对照 v5.3 §0）
- 每个数字配解读（"5.38% ← 双缓冲健康"不是"5.38%"）
- 形态演化用一句话独立成段加粗
- 禁止超过 3 行的文字段落（超过拆成"结论句 + 图表 + 解读"）
- overview 字段不用 verdict.summary（那是 log 风），改成三段引用块

### 需求 4：结构重排 + 去重（DR-41 规则 3）

- 章节顺序改为：§0 结论先行 → §1 采集元信息 → §2 多线程宏观 → §3 主线程 off-CPU 归因 → §4 降频时序 → §5 主线程一帧时间去向（callTree+红线矩阵）→ §6 ROI 优化方向
- §7 GPU-bound 判定矩阵**合并进 §3**（GPU-bound 是 off-CPU 归因的结论，不是独立章节）
- 删除"按 finding kind 罗列 7 个 section"（业务红线/GPU-bound/降频/GC/off-CPU/PlayerLoop/thermal-only）——findings 是素材不是结构
- findings 的详细内容折叠到"下钻详情"里（按归并后的 top 模块组织，不按 kind）

## 验收命令

```bash
cd web && node --import tsx server/scripts/perfetto-report-mvp.ts  # 重建产物
cd web && node --import tsx server/prism/tools.test.ts  # 应 ≥199 PASS
```

## 验收点（对照 DR-41 五条硬规则逐项核）

1. report.html 无 evidence id / tool / runId / 证据字样（规则 1）
2. 红线矩阵同一子树不超过 1 行（规则 2）
3. 章节顺序是宏观→各线程→下钻，无重复结论（规则 3）
4. §0 是三大独立结论引用块+ASCII，不是一大段 overview（规则 4）
5. 正文无字段名（byState.S.totalMs / coveragePct / foldChange=9999）（规则 5）

## 约束

- 不硬编码业务名清单/绝对阈值/§0-§9 死模板
- ROI name 从 finding 动态取
- 判定用 relativeBaseline 相对倍数
- 不改 explore/provider/query

## 完成总结（2026-07-14）

### 改动文件
- `web/server/scripts/perfetto-report-mvp.ts`（唯一改动文件）

### 实现要点

**规则 1 审计剥离**：
- 删除"审计 / 证据入口"整个 section
- 删除 finding card 的 `原始 claim` / `证据：ev-xxx` / `boundary` / `relativeBaselineNarrative` / `causalNarrative` 行
- finding card 只渲染 `humanNarrative`（人话结论）
- ROI card 的 rationale 用 `humanizeRelativeJudgment` / `humanizeCausalInference` 转人话，去掉字段名
- 审计信息全部沉入 narrative.json 的 `findings[]` + `evidenceSummary`（供 audit.json 核查）

**规则 2 热点模块归并**：
- 新增 `buildNameParentChains`：从 callTree 动态构建 name → parentChain 映射
- 新增 `mergeBySubtree`：top 列表按贡献降序遍历，若祖先已在列表则 child 归并到祖先的 `mergedChildren`
- redlineMatrix 从 8 行（6 行 URP 子树）压缩到 3 行（URP.Render 含 6 个 children / Core.Update 含 3 个 children / Core.LateUpdate）
- topConclusionBlocks 的业务热点结论也做子树归并（取归并后 top 1）

**规则 3 结构重排**：
- §0 结论先行 → §1 采集元信息 → §2 多线程宏观 → §3 off-CPU + GPU-bound → §4 降频 → §5 callTree+红线+下钻 → §6 ROI
- §7 GPU-bound 判定矩阵合并进 §3.5（GPU-bound 是 off-CPU 归因的结论）
- 删除"按 finding kind 罗列 7 个 section"（业务红线/GPU-bound/降频/GC/off-CPU/PlayerLoop/thermal-only）
- 删除"三态对照表"独立 section（沉入 §1 采集元信息）
- findings 按"归并后的 top 模块"组织到 §5.5 下钻，不按 kind

**规则 4 图文穿插四段式**：
- 新增 `TopConclusionBlock` 类型 + `buildTopConclusionBlocks` 函数
- §0 三大独立结论（GPU-bound / 业务热点 / 降频），每块 = 引用块（blockquote + 加粗一句话）+ ASCII 图 + 关键数字解读 + 详见 §X
- 新增 `buildAsciiBar` 辅助函数生成柱状图
- 新增 CSS `.conclusion-block` / `.one-liner` / `.key-numbers` / `.see-also` 样式

**规则 5 人话先行**：
- 新增 `humanizeRelativeJudgment`：把 `foldChange=9999 sentinel` 转成"仅在 cur 出现"
- 新增 `humanizeCausalInference`：把 `effectiveCoveragePct≈99.24% (maxWait/sleepingMs)` 转成"主线程睡的时候约 99.24% 在等该 wait slice"
- ROI rationale 不再含字段名

### 验收结果

```
cd web && node --import tsx server/scripts/perfetto-report-mvp.ts  # 重建产物 ✅
cd web && node --import tsx server/prism/tools.test.ts  # 199 PASS / 0 FAIL ✅
```

DR-41 五条硬规则逐项核：
1. ✅ report.html 无 evidence id / tool / runId / 证据字样 / 审计 section
2. ✅ 红线矩阵 URP 子树从 6 行压缩到 1 行（含 6 个 mergedChildren）
3. ✅ 章节顺序 §0→§1→§2→§3→§4→§5→§6，无 §7，无按 kind 罗列 section
4. ✅ §0 三大独立结论引用块+ASCII+数字解读四段式（3 个 TopConclusionBlock）
5. ✅ 正文无 byState.S.totalMs / coveragePct / foldChange=9999 / effectiveCoveragePct / parentChain= 字段名
