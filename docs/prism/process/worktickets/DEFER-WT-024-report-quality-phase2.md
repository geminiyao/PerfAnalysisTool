# DEFER-WT-024 · 报告层质量二期：三态对照 + 下钻深度 + callTree 可读性

> ⚠️ **本工单方向已作废 — 新方向见 DR-44**
>
> 本工单基于"在 `web/server/scripts/perfetto-report-mvp.ts` 脚本基座上做二期质量提升"，
> 但 2026-07-15 诊断发现 perfetto 报告生成**三段管线一段都没走**（explore 是脚本 No LLM、
> narrative 是脚本拼 buildNarrative + humanizeFinding），退化成作文机。详见
> `docs/prism/memory/methodology/report-pipeline-contract.md`（DR-44）。
>
> DR-44 §5.1 已明确作废 WT-020/023/**WT-024**/WT-025（部分）——在错误基座上做二期 = 加固错误。
>
> **新方向**：走 DR-44 三段管线修复（A 框架契约 → B perfetto 接入 → C 反向沉淀 v5.3），
> 对应新工单 WT-026 / WT-027 / WT-028。本工单保留仅作历史轨迹，**不要再按本工单施工**。
>
> 其中本工单的"三态对照 / 下钻深度 / callTree 标注 / 单态模式支持"等**需求内容本身仍有效**，
> 会在 WT-028（反向沉淀 v5.3）阶段以"narrative-prompt 模板 + report-utils 渲染能力"形式重新落地，
> 而不是以"改 perfetto-report-mvp.ts 脚本"形式落地。

---

# 原工单内容（已作废，仅留历史）

> 状态：DEFER ｜ 里程碑：M5 Perfetto agent 化 ｜ 执行方：主 agent 自己或 Cursor
>
> 前置：WT-023 已完成（DR-41 五条硬规则已执行，199 PASS）。本工单是 WT-023 PASS 后对照 v5.3 发现的剩余质量问题。
>
> 标杆：`docs/report/performance-report_perfetto_ULTIMATE_v5.3.md`（§0②/§3/§4/§6.2/§6.3）
> 参照：`docs/report/performance-report_simpleperf_ULTIMATE_v4.md`（§5.2 调用树标注图例）

## 背景

WT-023 执行了 DR-41 五条硬规则，报告结构 / 审计剥离 / 子树归并 / 图文穿插 / 人话先行已解决。但对照 v5.3 标杆后，发现 6 个剩余质量问题：

1. **§0② 业务侧涨幅只取 top 1**：只给了 OutSideViewArmyLineMgr，丢了 Core.Update 主入口涨幅 + LuaMgr/MapManager 两条子树 + MeshUIManager。根因：只用了 fold-change-module findings，没用 top-business-module findings。
2. **§2 多线程宏观没有三态对照**：每个线程只显示 throttle 单态，看不到 base→cur→throttle 演化趋势。根因：ThreadMacroRow 类型只有单值字段。
3. **§3 byState 的 S/R/R+/D 没解释**：没有 plainLanguage 概念说明。
4. **§3 层次混乱**：前 4 个 h4 + §3.5 一个 h3，没有逻辑递进。
5. **§5.2 callTree 缩进树信息密度低**：节点太多 + 没有严重程度标注（🔴/🟡/🟢）+ 没有三态对照 + 没有剪枝。
6. **§5.5 下钻内容没组织好**：finding card 只有一句话，没有三态 perFrame 对照 / 子热点 / GC.Alloc 归因 / 优化方向。

## 7 个需求（可拆成多个新对话独立开发）

### 需求 1：§0② 业务侧涨幅全貌（合并 fold-change + top-business）

- 合并 `fold-change-module`（新增路径）+ `top-business-module`（现存大头）两类 findings
- 按子树归并后，取 top 2-3 条独立子树作为 §0② 的内容（不是 top 1）
- 每条子树显示：模块名 + 三态 perFrameMs + 涨幅倍数 + 子热点（红线模块）
- 对照 v5.3 §0②："Core.Update 涨幅集中在 LuaMgr 与 Outside.MapManager 两条子树"

### 需求 2：§2 多线程宏观三态对照

- `ThreadMacroRow` 类型改为三态结构：`base: {run, sleep, runnable} / cur: {...} / throttle: {...}`
- `buildMultiThreadMacro` 收集三态数据，不再"取最新可用"
- 渲染表格：每行一个线程，列 = base run/sleep | cur run/sleep | throttle run/sleep | 一句话定位（基于演化趋势）
- 对照 v5.3 §3.1："UnityMain Run 86.94→77.82→56.99 / Sleep 12.04→20.40→38.99"

### 需求 3：§3 byState 概念解释 + 层次重排

- byState 表前加 plainLanguage 概念说明（S/R/R+/D 各是什么）
- §3 层次重排为：§3.1 概念 → §3.2 byState 三态 → §3.3 wait slice 重叠法 → §3.4 ASCII 状态分布 → §3.5 ASCII 因果链 → §3.6 GPU-bound 判定矩阵
- 每节加过渡句（"byState 给出三态分布，但不知道睡在等什么 → wait slice 重叠法旁路"）

### 需求 4：§5.2 callTree 缩进树可读性提升

- 每节点加严重程度标注（🔴/🟡/🟢/📈），判定逻辑区分多态/单态（参照 DR-43 + DR-42）：
  - **多态判定**（参照 DR-43）：
    - 🔴 高 self 真热点：perFrameMs ≥ 1.0ms 且 foldChange ≥ 2
    - 🟡 临近红线：perFrameMs ≥ 0.5ms 或 foldChange ≥ 1.5
    - 📈 新增压力源：foldChange=9999（仅在 cur/throttle 出现）
  - **单态判定**（参照 DR-42）：
    - 🔴 高 self 真热点：perFrameMs 占 p50 ≥ 5%
    - 🟡 临近红线：perFrameMs 占 p50 ≥ 2%
    - 📈 不适用（无 base 对比）
  - **通用**：
    - 🟢 健康：未触发任何阈值
    - `[wrapper]` 标注：自身 perFrameMs 接近 0 但子节点有大头
- 三态对照：每节点显示 `[base/cur/throttle ms/帧]`（参照 v5.3 §6.2）；单态时只显示 `[throttle ms/帧]`
- 剪枝：perFrameMs < 0.1ms（多态）或占 p50 < 0.5%（单态）且无红线的节点折叠或省略
- 参照 simpleperf v4 §5.2 的图例（🔴/🟡/🟢/📈/[wrapper]）+ HTML 用颜色/图标增强

### 需求 5：§5.5 下钻内容深化

- 每个 drilldown-card 不只显示 finding card，还要显示：
  - 三态 perFrameMs 对照（base/cur/throttle）
  - 子热点清单（callTree 子节点 top 3）
  - GC.Alloc 归因（如果有 gc-pressure-module finding 关联）
  - 优化方向（从 ROI 或 finding 的 humanNarrative 提取）
- 对照 v5.3 §6.3 每个红线模块的"优化方向"段落

### 需求 6：清理 buildAsciiCausalChain 硬编码

- `buildAsciiCausalChain`（line 1018-1020）把 `URP.Render → URP.RenderCameraStack → ...` 写死了
- 改为从 callTree 动态提取 `waitSliceOverlap.throttle.maxWaitSlice` 的 parentChain
- 不硬编码业务名

### 需求 7：单态模式支持（参照 DR-42）

- 报告脚本支持"自动检测态数"：若 triadSummaries 只有 1 个 role，切到单态模式
- 单态模式下：
  - §0 ② 业务热点改为"按占 p50 百分比排序"（不用 foldChange）
  - §0 ③ 降频改为"reach < 65% + 温度 ≥ 75°C 双信号"（不用三态演化）
  - §5 红线矩阵改为"占 p50% 一列"（不用 foldChange 两列）
  - §6 ROI 改为"按占 p50 百分比 + severity 排序"（不用 foldChange）
- 多态模式仍用当前逻辑（参照 DR-43）
- 此需求可延后到 M5 多源（simpleperf/unity）接入时做，但报告脚本结构要预留

## 验收命令

```bash
cd web && node --import tsx server/scripts/perfetto-report-mvp.ts  # 重建产物
cd web && node --import tsx server/prism/tools.test.ts  # 应 ≥199 PASS
```

## 验收点

1. §0② 给出 2-3 条独立子树（不是 top 1），含主入口→子树→红线模块三层下钻
2. §2 多线程宏观有三态对照（base/cur/throttle run/sleep）
3. §3 byState 有 S/R/R+/D 概念解释 + 层次清晰（§3.1-§3.6）
4. §5.2 callTree 有严重程度标注（🔴/🟡/🟢/📈/[wrapper]）+ 三态对照 + 剪枝
5. §5.5 下钻有三态 perFrame + 子热点 + GC 归因 + 优化方向
6. buildAsciiCausalChain 无硬编码业务名（从 callTree 动态提取 parentChain）
7. 报告脚本支持单态模式（DR-42：占 p50% 判定）+ 多态模式（DR-43：foldChange 判定）自动切换
8. 199 PASS / 0 FAIL

## 约束

- 不硬编码业务名清单/绝对阈值/§0-§9 死模板
- 不改 explore/provider/query（数据层已 95% 覆盖）
- 判定用 relativeBaseline 相对倍数
- 参照 v5.3 + simpleperf v4 的可读性，但不抄答案
