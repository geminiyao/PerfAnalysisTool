---
name: unity-profiler-compare
description: Hybrid v1 unity diff reports — Provider 算 ms/帧 Δ%, AI 增量润色业务叙事；与 simpleperf-diff-analysis 同构。
---

# Unity Profiler 双版本对比分析 (Hybrid v1)

参照 `simpleperf-diff-analysis` 的 v4 hybrid 模式：**Provider 出确定性 Δ 数字 + AI 增量润色业务叙事**。AI 不准动数字。

## 正式交付标准

任意一组 `base.pdata + cur.pdata` 输入，产出 `performance-report.md`：

1. **结构** ≥ 金标准 8 个章节（§0–§8）
2. **核心数字** 一律 Provider 计算（aggregatedCallTrees Δ + markersByThread Δ + frameSummary Δ + GC Δ）
3. **AI 润色** 仅在 §0 / §3-§7 业务叙事部分加上下文，**禁止改数字 / 表格 / mermaid / 章节顺序**
4. **正式验收** = enrich 成功 + CodeBuddy ai-thickened + `validateUnityDiffQuality` PASS；失败抛错，**不**交付 skeleton 兜底

## 与三个相关 skill 的关系

| Skill | 输入 | 角色 |
|------|------|------|
| unity-profiler-analysis | 单 .pdata | 单源单次（依赖 Phase X 加厚后的 preprocess.ts）|
| **unity-profiler-compare**（本 skill）| base + cur 两份 .pdata | **单源 diff（hybrid 模式）**|
| simpleperf-diff-analysis | base + cur 两份 .data | 同构姊妹 skill（参照对象）|
| cross-source-compare（待 Phase C）| 三源 × 2 版本 | 提炼层，吃本 skill 输出做共性/区别提炼 |

## When to Use

- 用户给两份 `.pdata` 文件（同设备、同场景，不同版本/不同优化阶段），问"哪些性能变好/变差了"
- 关键词：unity diff, profiler 对比, base vs cur, 版本性能回归

不要用于：
- 单次诊断 → `unity-profiler-analysis`
- 原始 native diff → `simpleperf-diff-analysis`
- 三源融合 → `cross-source-analysis`（单次）/ `cross-source-compare`（双版本）

## Execution Flow

### Step 1: Provider（必须）— 计算 Δ 骨架

`unity-diff-builder.ts` 输入两份 preprocess-result.json，输出：

```
unity-diff-summary.json     ← 所有 Δ 数字（AI 不准动）
performance-report_unity_diff_skeleton.md  ← Provider 骨架报告（§0-§8 全填，但叙事简短）
```

核心 diff 算法（本 skill 的硬要求）：

1. **frameSummary Δ**: mean / median / p90 / p95 / p99 / p999 / jankRate / actualFps 各项 Δ + Δ%
2. **aggregatedCallTrees 路径对位 Δ**：
   - key = (parent path + name)，对位 base/cur 同路径节点
   - 输出每节点 `{ msPerFrameTotal: { base, cur, delta, deltaPct }, msPerFrameSelf: ..., gcAllocCount: { base, cur, delta }, threadPct: ... }`
   - 标 `status`: `degraded`（cur > base 5%）/ `improved`（cur < base 5%）/ `stable` / `newly_added` / `removed`
3. **markersByThread Δ**：每条线程的 top markers selfMean Δ + 新增/消失
4. **GC Δ**：每帧 alloc 总数 Δ，业务子树 alloc Δ（参照 [[methodology_gc_alloc_attribution]]）
5. **spike Δ**：哪些 marker 新成 spike / 不再 spike，spikeRatio 变化

### Step 2: 质量门（Provider 骨架）

```bash
node compare_unity_diff_quality.py <out_dir>/performance-report_unity_diff_skeleton.md
```

通过门：≥8 个章节、每章必引证据齐全（如 §3 必须含 ms/帧 Δ + Δ% + 状态标签）。

### Step 3: AI 增量润色（默认开启，可 `-ProviderOnly` 跳过）

**必读**：Provider 骨架全文 + `unity-diff-summary.json` + 项目知识包（含业务模块说明） + 金标准 `docs/report/performance-report_unity_diff_GOLDEN.md`

**叙事密度硬要求**（参照 simpleperf-diff-analysis ULTIMATE v4 §4.3-§4.6 形态）：

每个 §8 的 Top 业务模块必须有完整 5 段：

```markdown
### P{N} — 削减 {ModuleName} (self +X.XXms/帧 回归)

**身份**：
- 路径：PlayerLoop▸...▸{ModuleName}
- 所在线程：1:Main Thread (或 Job.Worker / Submit Thread 等)
- 模块定位：(2-3 句业务含义，如"行军线渲染管理器，刷新视野内可见行军路径的顶点和材质")

**业务含义**（为什么从 base 到 cur 涨了）：
- (2-3 句结合压测场景的解释，如"base 野外空场景行军路径少；cur 行军压测 300 队部队，每条行军路径都需要刷新顶点 → 子树整体激增")

**本源边界**（Profile 数据能/不能告诉你什么）：
- ✅ unity profiler self/total ms 显示 self/total= XX% → 自身循环即瓶颈，外层调用者不是问题
- ⚠️ 不能区分 "顶点数过多" vs "材质 SetPass 频繁" → 需在 Frame Debugger / RenderDoc 复核

**优化方向**（按 ROI 给具体可操作项）：
1. 增量更新：只刷变化的行军线，缓存上帧顶点
2. 距离/可见性裁剪：屏幕外行军线 LOD 化或不刷
3. 合并 draw：把多条行军线合到一个 mesh

**模块内部细分**（如果有子节点 Δ）：
- {SubModule1} self {base→cur} ({Δ})
- {SubModule2} self {base→cur} ({Δ})
- ... 用 Provider 数据，不准编造
```

每个 P{N} 的 5 段长度参考：身份 ≥3 行，业务含义 ≥2 句话，本源边界 ≥2 项，优化方向 ≥3 条具体动作，细分若有数据则列出。

**§0 一句话结论扩写**：除了 1 句 ms/帧 Δ + 头号回归，再加 1-2 句"压测场景背景 + 优化收益估算"，至少 3-4 句话不要 1 句话。

**§5 GC 业务归因扩写**：除了表格，每条 alloc 涨幅 ≥10000 的子树要解释"为什么 alloc 涨"（如"URP 子树 alloc 翻倍因为透明物体多了 → 每帧多调 RenderPipelineManager.DoRenderLoop 内部")，对照 [[methodology_gc_alloc_attribution]] 给"每帧 alloc>100 即 hot allocation"判定。

**§6 慢帧 spike 扩写**：每个新增 spike 要给 1 句业务解释（如 "TryUnloadPending.TryUnload spikeRatio 1394× → 表明 cur 出现资源回收尖刺，可能与 cur 业务大量动态创建/释放对象有关"）。

**允许修改的范围**：
- §0 一句话结论（扩到 3-4 句）
- §3 缩进树后加 1-2 段"关键观察要点"
- §4 各线程 Δ 表格后加业务解释
- §5 GC 归因表格后加 alloc 来源解释
- §6 spike 表格后加 spike 业务解释
- §7 新增/消失 marker 表格后加 1-2 句业务解读
- §8 P{N} 全部 5 段必填

**禁止修改**：
- 任何 ms/帧、Δ%、Δ 数字（一律来自 Provider）
- 状态 emoji（🔴/🟢/🆕/➖/⚪）
- mermaid 图
- §2 帧级表 / §3 缩进树 / §5 GC 表格 结构
- 章节顺序、章节编号

**目标产出**：≥500 行（接近金标准 ≥80%），段落数 ≥120（金标准 145 段的 80%+）

产出：`<out_dir>/performance-report_unity_diff_AI_v1.md`

### Step 4: 质量门（AI 版）+ 回退

```bash
node compare_unity_diff_quality.py <ai_report> --min-length-ratio=0.78
```

- PASS → `performance-report.md` = AI 版
- FAIL → `performance-report.md` = Provider 骨架版

## Output Format（章节骨架，对照金标准）

```markdown
# Unity Profiler 双版本对比报告 — <base label> vs <cur label>

> 设备 / 场景 / 采集时长 / 帧数 / target FPS

## §0 一句话结论
- "cur 比 base 主线程 +X.Xms/帧 (+Y.Y%)，头号回归 <ModuleName>，建议 P0 ..."

## §1 同源性校验
- 设备 / 场景 / target FPS 是否一致，trace 时长 / 帧数比例
- 不一致项 ⚠️ 标红

## §2 帧级 Δ
| 指标 | base | cur | Δ | Δ% |
| mean | ... | ... | ... | ... |
| p95 | ... | ... | ... | ... |
... (含 jankRate / actualFps)

## §3 主线程业务子树 Δ (aggregatedCallTrees)
缩进树形态，每节点 ms/帧 base→cur Δ + 状态标签：
```
└─ PlayerLoop (26.89→28.50 +1.61ms/帧, +6.0% 🔴 degraded)
  └─ Update.ScriptRunBehaviourUpdate (8.03→9.21 +1.18ms +14.7% 🔴)
    └─ Core.Update (...) ...
```

## §4 各线程 (per-thread) Δ
Render / Submit / Job Worker 等线程的 top markers selfMean Δ。

## §5 GC 压力 Δ
每帧 alloc 总数 Δ + 业务子树归因（哪些子树 alloc 涨）

## §6 慢帧 / 波动 Δ
P95/P99 来源对比，哪些 marker 新成 spike / 不再 spike

## §7 新增 / 消失 marker
cur 独有 / base 独有 marker 列表

## §8 可执行建议
按 ROI 排序，每条点名到具体业务模块
```

## 一键命令

```bash
# Web：上传 base/cur 两份 .pdata → /runs/ingest/unity-compare 入口
# CLI：
tsx web/server/scripts/analyze-single.ts \
  --mode compare-unity \
  --base <base.pdata> \
  --cur <cur.pdata> \
  --device <device> --scene <scene>
```

## 自评门

```bash
tsx web/server/scripts/unity-diff-self-eval.ts --report <md> --summary <unity-diff-summary.json>
```

检查：
1. 章节覆盖：grep `^## §[0-9]` ≥ 8（含 §0-§8）
2. 必引证据：
   - §2 行数 ≥ 6（base/cur/Δ/Δ% 表）
   - §3 必须含 `ms/帧` + Δ% + 状态 emoji（🔴/🟢）
   - §5 必须含"业务子树"或 "alloc/帧"
   - §8 必须含 P0/P1 标签
3. AI 改数字检测：抓 §2 / §3 表格里的数字与 unity-diff-summary.json 对照，AI 改过即视为 FAIL → 回退骨架版

## 阻塞 / 依赖

- **依赖** Phase X 完成（aggregatedCallTrees / markersByThread / gcAllocCount 已就位）✅
- 本 skill 的 diff 算法将被 Phase C 三源 diff 复用
