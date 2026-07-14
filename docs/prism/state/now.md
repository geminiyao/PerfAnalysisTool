# 当前战线（NOW）— 此刻在哪、下一步干嘛

> **新会话第一个读这个。** 永远保持最新。主 agent 每做完一件事 / 快切会话前必更新本文。
> 坐标系见 `../plan/roadmap.md`（里程碑）和 `../plan/backlog.md`（需求）。
> 最后更新：2026-07-14（WT-022 Perfetto provider 层验收PASS，commit 8b69524 已 push origin/master；provider 层缺口补全，数据层覆盖度约 95%；WT-020 工单已起草待派发）

---

## 🎯 当前阶段目标（不变，持续到追上甚至超过作文机）

**把 Perfetto 报告质量追上并超过作文机 v5（`docs/report/performance-report_perfetto_ULTIMATE_v5.md`）。**

作文机 v5 的质量来自三件事：①数据全（provider 落了 off-CPU 归因/GC.Alloc/分位数/wait slice）②人工阈值判定（硬编码"单次>1-2ms 不合理""Gfx.WaitForPresent>vsync=GPU-bound""bigCoreReach<65% 可疑"）③叙事模板（§0-§9 章节骨架+每个数字配解读+优化方向按 ROI 排序）。

这三件事里：① Prism 已补到 95%（WT-019 query 层 + WT-022 provider 层），②③ 恰恰是作文机最脆弱的地方——阈值和叙事模板是硬编码的，换游戏/场景就失效。Prism 的 agent 架构有作文机根本不具备的两个优势：evidence ledger + provenance（每个结论可回链）+ LLM 推理 + 知识回路（阈值可由 agent 根据基线动态判定，叙事可由 LLM 根据数据生成）。**追上是最低目标，超过才是 Prism 该有的定位。**

剩余路径：
1. **WT-020 explore 推理层**（工单已起草，待派发）：相对基线判定 + 跨态对比发现 + 因果推理规则。阈值由 agent 推理（"cur 比 base 涨 ×4.2" 比 "绝对值 > 5ms" 更通用），不写死绝对阈值。prompt 只给纪律（按跨态变化倍数+占比排名判定红线），不给业务词。
2. **WT-021 报告叙事层**（未起草）：LLM 驱动中文叙事 + 每个数字配解读 + 优化方向按 ROI 排序。不套固定模板（§0-§9 是作文机硬伤），prompt 只给纪律不给业务词。

## 当前里程碑

**M1 单次质量收尾 ✅ 基本收官** → **M3 持久大脑通电（BK-LOOP）✅ 重量层已验收** + M2 开发OS（已搭完·持续用）+ **M5 多源扩展 / Perfetto agent 化（进行中）**

## 🚀 下一步具体动作（新会话直接执行）

1. **派发 WT-020**（工单已起草：`docs/prism/process/worktickets/TODO-WT-020-bk26b-perfetto-explore-reasoning-layer.md`）：
   ```bash
   powershell -NoProfile -Command "chcp 65001 > \$null; [Console]::OutputEncoding=[System.Text.Encoding]::UTF8; & 'docs/prism/process/scripts/dispatch-ticket.ps1' -Ticket 'TODO-WT-020-bk26b-perfetto-explore-reasoning-layer.md'"
   ```
   预计 5-10 分钟（Cursor headless shell 不可用，但代码会写完；主 agent 直播跑验收）。
2. **主 agent 验收 WT-020**（DR-36 直播跑）：
   ```bash
   cd web && node --import tsx server/scripts/perfetto-explore-mvp.ts  # 覆盖 explore 产物
   cd web && node --import tsx server/prism/tools.test.ts  # 应 ≥158 PASS
   ```
   验收点：findings ≥10；≥5 个含 `relativeBaseline`；≥1 个含 `causalChain`（GPU-bound）；≥1 个 top 业务模块 finding；≥1 个涨幅最大模块 finding；≥1 个 GC 压力最大模块 finding；无硬编码业务名/绝对阈值/叙事模板。
3. **WT-020 PASS 后起草 WT-021**（报告叙事层：LLM 驱动中文叙事 + 数据解读 + ROI 优化方向，不套固定模板）。
4. **WT-021 PASS 后跑 WT-018 报告脚本重建 report.html**，对照作文机 v5 做最终质量评估。

## 刚做完什么（本次会话）

- ✅ **WT-022 = BK-26b-provider Perfetto provider 层 PlayerLoop 分位数 + GC.Alloc 业务子树归因 + offCpuAttribution byState（验收PASS，commit 8b69524 已 push origin/master）**：provider 在 `core.frame` 数组追加 PlayerLoop 分位数（`frameDefinition='playerloop'`，与 choreographer 并列）；新增 `_gc_alloc_by_chain` 函数遍历整个 callTree 对每个 GC.Alloc slice 沿 parent_id 向上找最深业务节点归因（**不预设模块名清单**）；`off_cpu` 改为 byState 细分（S/R/D/R+ 各态 + totalOffCpuMs）。query 层：`queryFrameTimeline` 读 PlayerLoop 分位数（`available=true`）；新增 `queryGcAllocByModule`（通用 pattern/perFrame/count 筛选）；`queryOffCpuAttribution` 增强（优先读 byState + 保留 waitSlices）。主 agent 独立验收（DR-36 亲自跑）：三份 triad profile 重新 build 成功；cur PlayerLoop p50=30.15/p95=35.22/p99=42.54/fps=33.1/slowFrameRate=11.18（对照作文机 v5 §6.1 cur p50=28.07 形态一致）；throttle PlayerLoop p50=45.94/fps=21.4/slowFrameRate=98.83（对照作文机 v5 thermal3 p50=55.55 形态一致）；cur GC.Alloc byChain 27 项含 URP.BeforeRendering(130.54/帧)/Inl_OpaquePass(129.53/帧)/CS:AOE.MeshUIManager(61.33/帧)/TimeText.7(24.43/帧)/BattleHeadMgr.OnUpdate(20.74/帧)；throttle offCpuAttribution byState S=7666.5ms(89.34%)/R=564.5ms(6.58%)/R+=238.6ms(2.78%)/D=111.4ms(1.3%)。`tools.test.ts` **158 PASS/0 FAIL**（原 139 + 新增 19）。**无硬编码**：grep 确认 `_gc_alloc_by_chain` 用通用 `startswith("GC.Alloc")` + 遍历整个 callTree，无固定业务模块数组；query 层无绝对阈值判定。工单 `DONE-`。
  - 🔑 **数据层覆盖度提升到约 95%**：WT-019 query 层 + WT-022 provider 层补全后，Prism 数据层完全追上作文机 v5。剩余 5% 是 `sched_blocked_reason` ftrace 缺失导致的 byReason 细分（需采集端补，非 provider 层能解）。GC.Alloc 归因是**全 callTree 遍历**（不预设 17 个 AOE 模块清单），比作文机 v5 §9.2 工程化建议第 8 条"应当扩展到所有主线程 root slice"更彻底——这是超越作文机的关键一步。

## 上一批会话做完什么

- ✅ **WT-019 = BK-26b-query Perfetto query 层内容扩展（验收PASS，commit 76d4b4a）**：新增 3 个 query（`queryCallTreeSubtree` 业务下钻 / `querySliceDeltas` 跨态对比 foldChange / `queryOffCpuAttribution` off-CPU+wait 归因）+ 增强 2 个（`queryFrameTimeline` 暴露 choreographer 分位数 + PlayerLoop 诚实 unavailable；`queryCpuFreq` 暴露 perCpu + clusterSummary）。`tools.test.ts` 139 PASS/0 FAIL。**关键**：query 层让 agent 能"发现"问题而非被"告诉"盯谁——按 totalMs 通用排序自动暴露 top 业务模块，按 foldChange 排序自动发现涨幅最大的模块，用通用正则 `/Wait|Sleep|Block|Present/i` 提取 wait slice。**无硬编码**。
- ✅ **WT-018 = BK-26b-report Perfetto narrative.json + report.html MVP（验收PASS，commit 4b66842）**：新增报告生成脚本 `web/server/scripts/perfetto-report-mvp.ts`。产物落 `web/data/prism-out/bk26b-perfetto-report-mvp/{narrative.json,report.html,audit.json,run.log}`。narrative.json 含 `source/sampleSet/overview/topConclusions(5)/findings(6)/evidenceSummary(17)/capabilityBoundaries(3)/triadComparison/callTrees/inputProvenance`。report.html 章节齐全。已提交 commit `4b66842` 并 push origin/master。
  - ⚠️ **与作文机 v5 对比暴露内容质量差距**：WT-018 报告只覆盖作文机 v5 约 20% 核心内容（全英文不可读，无数据解读和优化建议）。WT-019/022 已补 query+provider 层，WT-020/021 补推理层和叙事层。
- ✅ **WT-017 = BK-26b-explore Perfetto explore + evidence ledger MVP（验收PASS，commit 771735e）**：新增 deterministic scripted loop `web/server/scripts/perfetto-explore-mvp.ts`（不接 LLM），对 base/cur/throttle 调用 WT-013 六工具 = 17 evidence，派生 6 findings + verdict。
- ✅ **WT-002 = BK-16 源码归因·调用栈辅助消歧（验收PASS）**
- ✅ **WT-001 = M2 试跑轨道，机制验通**

## 工单台账

- ✅ `DONE-WT-001` BK-17 HTML美化（M2试跑轨道）
- ✅ `DONE-WT-002` BK-16 源码归因·调用栈消歧
- ⏸ `DEFER-WT-003` BK-16续·profiler父链消歧——代码正确但当前数据零命中，待 **BK-23**（标签名↔函数名映射）激活
- ✅ `DONE-WT-004` BK-20 三维热点判定 + 诚实边界（M1 收官单）
- ✅ `DONE-WT-005` M3-A 持久大脑结构+存取接口
- ✅ `DONE-WT-006` M3-摄入层 脚本+LLM二合一
- ✅ `DONE-WT-007` M3-B 开局注入
- ✅ `DONE-WT-008` M3-C 收尾沉淀
- ✅ `DONE-WT-010` BK-26 数据层最小闭环
- ✅ `DONE-WT-011` BK-26b Perfetto triad 主样本
- ✅ `DONE-WT-012` BK-23a marker alias table + source confidence
- ✅ `DONE-WT-013` BK-26b-impl 6 个 Perfetto query
- ✅ `DONE-WT-014` BK-26b-fix provider sidecar + base callTrees 修复
- ✅ `DONE-WT-017` BK-26b-explore explore + ledger MVP（commit 771735e）
- ✅ `DONE-WT-018` BK-26b-report narrative.json + report.html MVP（commit 4b66842）
- ✅ `DONE-WT-019` BK-26b-query query 层内容扩展（commit 76d4b4a）
- ✅ `DONE-WT-022` BK-26b-provider provider 层 PlayerLoop 分位数 + GC.Alloc 归因 + offCpu byState（commit 8b69524）
- ⏸ `TODO-WT-020` BK-26b-explore-reasoning explore 推理层（工单已起草待派发）
- ⬜ `TODO-WT-021` BK-26b-narrative 报告叙事层（未起草）

## 待用户拍板 / 进行中

- **当前阶段目标**：把 Perfetto 报告质量追上并超过作文机 v5。数据层已补全（WT-019/022），下一步 WT-020 explore 推理层 + WT-021 报告叙事层。
- **M3 阶段验收**：M3-D 重量层已通过，可找用户做 M3 阶段收口/决定进入 M4。
- **当前用户关注重心**：引擎层完整度、三大回路完整度、三源其它两源能否按当前 agent 设计跑出高于作文机的报告。

## 重要边界（必须遵守）

- **严禁硬编码**：不许把业务模块名（MapSignificanceMgr/BattleHeadMgr 等）、判定阈值（"> 5ms 警戒""bigCoreReach < 65%"）、叙事模板（§0-§9 章节骨架）写死在代码或 prompt 里。这是作文机的硬伤，Prism 必须用数据驱动 + agent 推理替代。query 层按数据轴通用筛选（WT-019 已做到），阈值判定由 agent 推理（WT-020 要做到），叙事由 LLM 生成（WT-021 要做到）。
- 不要再重做 WT-013/014/017/018/019/022。
- 无 FrameTimeline 时必须保持 available:false，不许编 jank。
- correlateFrameSchedCpu 仍只能是 window 粒度，不许声称逐帧相关。
- base callTree 现在应可用（WT-014 PlayerLoop anchor fallback 修复）。

## 开发方式

- 主 agent 是需求管理和验收方，复杂实现优先派给 Cursor 或 CodeBuddy CLI 施工。
- CodeBuddy/Cursor dispatch 脚本位置：`docs/prism/process/scripts/dispatch-ticket.ps1`
  示例：`powershell -ExecutionPolicy Bypass -File docs/prism/process/scripts/dispatch-ticket.ps1 -Ticket TODO-WT-020-xxx.md`
  但 Cursor headless 模式 shell 故障是已知限制（WT-017/018/019/022 均踩过），施工方无法自测。主 agent 必须按 DR-36 验收：直播跑脚本/测试复现，不信施工方自报。
- 派发大任务容易被外层 10 分钟超时打断，建议工单拆小或加接续说明约束施工方不重复诊断。
- 本地还有大量未提交的旧改动/未跟踪文件；新会话如果要提交，必须继续只挑当前工单相关文件，别 git add .。

## 最近关键决策（防重新拉锯）

- 开发协作模式：主agent出工单 → 用户搬 Cursor(免费)施工 → 主agent验收。迁移/文档整理是主agent自己的活，不走工单。
- 目录按四维度分（memory/plan/state/process），不按 00-99 编号平铺。
- docs/ 只放人/agent 读写文档；运行时产物一律进 web/data/。
- 三回路现状=经验坟场（沉淀是死的），BK-LOOP(M3)通电才活；BK-LOOP必要非充分，M4才填料。
