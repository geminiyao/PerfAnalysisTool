# 当前战线（NOW）— 此刻在哪、下一步干嘛

> **新会话第一个读这个。** 永远保持最新。主 agent 每做完一件事 / 快切会话前必更新本文。
> 坐标系见 `../plan/roadmap.md`（里程碑）和 `../plan/backlog.md`（需求）。
> 最后更新：2026-07-14（WT-022 Perfetto provider 层 PlayerLoop 分位数 + GC.Alloc 业务子树归因 + offCpuAttribution byState 验收PASS：agent 现在能拿到作文机 v5 §6.1/§6.3/§4.1 的核心数据，GC.Alloc 归因全 callTree 遍历不预设模块名清单，比作文机 v5 §9.2 工程化建议第 8 条更彻底）

---

## 当前里程碑

**M1 单次质量收尾 ✅ 基本收官** → **M3 持久大脑通电（BK-LOOP）✅ 重量层已验收** + M2 开发OS（已搭完·持续用）

## 刚做完什么（本次会话）

- ✅ **WT-022 = BK-26b-provider Perfetto provider 层 PlayerLoop 分位数 + GC.Alloc 业务子树归因 + offCpuAttribution byState（验收PASS）**：provider 新增 PlayerLoop 分位数 SQL（落 `core.frame` 与 choreographer 并列，`frameDefinition='playerloop'`）+ `_gc_alloc_by_chain` 函数（遍历整个 callTree，对每个 GC.Alloc slice 沿 parent_id 向上找第一个出现在 callTree 节点集合里的 name，**不预设业务模块名清单**）+ offCpuAttribution byState（thread_state 分组求和，S/R/D/R+ 各态 + totalOffCpuMs）。query 层消费：`queryFrameTimeline` 改 `playerLoopPercentiles.available=true` 读真实分位数；新增 `queryGcAllocByModule`（通用 pattern/perFrame/count 筛选）；`queryOffCpuAttribution` 增强 byState + 保留 waitSlices。主 agent 独立验收（DR-36 亲自跑）：`tools.test.ts` **158 PASS/0 FAIL**（原 139 + 新增 19）；直播 build triad 三份全部成功，cur PlayerLoop p50=30.15/p95=35.22/p99=42.54/fps=33.1/slowFrameRate=11.18，throttle p50=45.94/p95=55.62/p99=66.32/fps=21.4/slowFrameRate=98.83（对照作文机 v5 §6.1 形态一致）；cur gcAllocByChain 27 项含 URP.BeforeRendering(130.54/帧)/Inl_OpaquePass(129.53/帧)/CS:AOE.MeshUIManager(61.33/帧)/TimeText.7(24.43/帧)/BattleHeadMgr.OnUpdate(20.74/帧)；throttle byState S(7666.5ms,89.34%)/R(564.5ms,6.58%)/R+(238.6ms,2.78%)/D(111.4ms,1.3%) + totalOffCpuMs=8581（对照作文机 v5 §4.1 thermal3 形态一致）。**无硬编码**：grep 确认 `_gc_alloc_by_chain` 用通用 `startswith("GC.Alloc")` + 遍历整个 callTree，无固定业务模块数组；query 层无绝对阈值判定。工单 `DONE-`。
  - 🔑 **覆盖度提升**：WT-019 补全 query 层到 80%，WT-022 补全 provider 层缺口到约 95%（剩余 5% 是 sched_blocked_reason ftrace 缺失导致的 byReason 细分，需采集端补，非 provider 层能解）。**Prism 现在在数据层完全追上作文机 v5**，且 GC.Alloc 归因是全 callTree 遍历（不预设 17 个 AOE 模块清单），比作文机 v5 §9.2 工程化建议第 8 条"应当扩展到所有主线程 root slice"更彻底——这是超越作文机的关键一步。
  - ⚠️ **派发进程 5m27s 完成（无超时）**：Cursor shell 仍不可用（施工方无法自测），但代码写完。主 agent 直播跑 build + 测试 + CLI 全过。
- ✅ **WT-019 = BK-26b-query Perfetto query 层内容扩展（验收PASS）**：新增 3 个 query（`queryCallTreeSubtree` 业务下钻 / `querySliceDeltas` 跨态对比 foldChange / `queryOffCpuAttribution` off-CPU+wait 归因）+ 增强 2 个（`queryFrameTimeline` 暴露 choreographer 分位数 + PlayerLoop 诚实 unavailable；`queryCpuFreq` 暴露 perCpu + clusterSummary）。主 agent 独立验收（DR-36 亲自跑）：`tools.test.ts` 139 PASS/0 FAIL（原 116 + 新增 23）；CLI 5 个 query 全部 exit 0 返回正确结构。**关键**：query 层让 agent 能"发现"问题而非被"告诉"盯谁——`queryCallTreeSubtree` 按 totalMs 通用排序自动暴露 top 业务模块（cur 读出 58 节点含 MapSignificanceMgr/BattleHeadMgr/Core.Update 等，每个含 parentChain），`querySliceDeltas` 按 foldChange 排序自动发现"appeared in compare only"的模块（OutSideViewArmyLineMgr 等），`queryOffCpuAttribution` 用通用正则 `/Wait|Sleep|Block|Present/i` 提取 wait slice（throttle 读到 URP.WaitForPresent 7608ms + Gfx.WaitForPresentOnGfxThread + Semaphore.WaitForSignal）。**无硬编码**：grep 确认新增代码无固定业务模块数组、无绝对阈值判定。工单 `DONE-`。
- ✅ **WT-018 = BK-26b-report Perfetto narrative.json + report.html MVP（验收PASS）**：新增报告生成脚本 `web/server/scripts/perfetto-report-mvp.ts`（只读 WT-017 产物，不耦合 Unity render-html/narrative-types，新增薄 adapter）。产物落 `web/data/prism-out/bk26b-perfetto-report-mvp/{narrative.json,report.html,audit.json,run.log}`。主 agent 独立验收（DR-36 亲自跑）：`node --import tsx server/scripts/perfetto-report-mvp.ts` 直播 exit 0；`tools.test.ts` 116 PASS/0 FAIL 未退化。narrative.json 含 `source/sampleSet/overview/topConclusions(5)/findings(6)/evidenceSummary(17)/capabilityBoundaries(3)/triadComparison/callTrees/inputProvenance`。report.html 章节齐全：标题样本说明、概览、顶部结论 5 条、三态对照表（sched/atrace/cpu/frame）、Findings 卡（每条含证据回链）、CallTree/HotPath 聚焦（base fallback badge + lower-confidence note，cur/throttle native）、能力边界、审计证据入口（17 行 evidence 表）。三个边界全部诚实呈现。已提交 commit `4b66842` 并 push origin/master。
  - ⚠️ **与作文机 v5 对比暴露内容质量差距**：WT-018 报告只覆盖作文机 v5 约 20% 核心内容（缺业务红线/GPU bound 判定/off-CPU 归因/GC 归因/分位数/thermal-only 路径），全英文不可读，无数据解读和优化建议。根因是 WT-013 query 层太浅 + explore 没推理。WT-019 已补 query 层，下一步 WT-020/021 补推理层和叙事层。
- ✅ **WT-017 = BK-26b-explore Perfetto explore + evidence ledger MVP（验收PASS）**：新增 deterministic scripted loop `web/server/scripts/perfetto-explore-mvp.ts`（不接 LLM），对 base/cur/throttle 调用 WT-013 六工具（correlate 仅 cur/throttle）= 17 evidence，派生 6 findings + verdict。产物落 `web/data/prism-out/bk26b-perfetto-explore-mvp/{ledger,findings,verdict,run.log}`。已提交 commit `771735e` 并 push origin/master。
- ✅ **WT-002 = BK-16 源码归因·调用栈辅助消歧（验收PASS）**：给 `getSourceForSymbol`（tools.ts）加可选入参 `callStack`，当裸名符号在 codegraph 命中多个同名候选时，用调用栈祖先去 `edges(kind='calls')` 反查调用者、取交集，**恰好唯一候选才收敛**（否则保持 ambiguous 诚实放弃，护栏不破）。新增 `resolvedVia:'callstack-disambiguated'`。主 agent 独立验收（DR-36 亲自跑）：tsc 零新增错误；tools.cli 三场景实测——`GetRootPanel`(1688候选)无栈→ambiguous、给有效祖先`FindComplexPathToLastContainer`→唯一定位真实文件、给无效祖先→仍ambiguous；单测 66 PASS/0 FAIL。工单 `DONE-`。
  - ⚠️ **同款断线**：派发进程 2 分钟超时中断（Cursor 施工机 shell 故障、命令全空返回、无法自测），代码写完没走收尾。主 agent 读 diff 确认成果完整（Cursor 还自修了 cgDb 提前关闭 bug）后代填完工报告并验收。
  - ⚠️ **验收中主 agent 微调测试**：施工方原用 `OnCameraMove` 作消歧正例，但实测其 5 候选在 codegraph **全无调用边**、注定 FAIL。主 agent 查实后换成已验证可消歧的 `GetRootPanel`。仅换测试数据符号，未动产品逻辑。
  - 🔑 **暴露真缺口（待里程碑讨论）**：codegraph 的 **Lua 调用边覆盖率仅 4.9%**（67917 method 仅 3323 有 caller 边）。调用栈消歧功能成立，但对大量无调用边的 Lua 裸名实际救不回。要真正提升 BK-16 对 Lua 命中率，需补 Lua 调用边数据 或 叠加运行时调用树——方向问题，M1 收尾时定。
- ✅ **WT-001 = M2 试跑轨道，机制验通**：BK-17 HTML目录导航+主题群上色 + md版§0空正文修复。产物只是网页样式微调、用户未正式验收，真价值是验证派发+验收闭环。工单已 `DONE-`。

## 上一批会话做完什么

- ✅ 设计哲学彻底对齐：建 `memory/philosophy.md`（含全景图/引擎内部循环图/作文机对比图/三回路形态/认识论两问题/热插拔降级链/LangGraph定位/坟场vs活系统）
- ✅ 脑图重构为三回路骨架 + 补全所有 BK + 带状态图标（`plan/backlog.smm`）
- ✅ 新增需求：BK-18(自动采集)/19(run内实时自举)/20(三维热点判定)/21(回归哨兵)/22(清prompt业务词)
- ✅ 建整体路线图 `plan/roadmap.md`（M1-M5）
- ✅ **docs/prism/ 四维度目录归位**（memory/plan/state/process/archive）+ 运行时产物 AUTO.md 挪进 web/data/ + 改 collect-datarequests.ts 路径 + 改交叉引用
- ✅ 建开发操作系统 `process/harness.md` + 本文 + README

## 下一步具体动作

1. **M3 加载端+写回端全通**：A(大脑)✅ 摄入✅ B(开局注入)✅ C(收尾沉淀)✅ D(重量层行为验证)✅。**大脑能存、能摄入、开局注入、收尾沉淀，且完整 explore 行为已被记忆改变。**
2. **M3-D 重量层验收通过(2026-07-11)**：主 agent 用 `stressmove.pdata` / `unity-outside-stressmove` 真跑完整 explore，产物目录 `web/data/prism-out/unity-outside-stressmove/2026-07-11_14-55-28`。结果：`findings=9`、`dataRequests=5`、`toolCalls=33`、`verifiedEvidence=42/42`、`suspects=0`，并沉淀 5 条 DataRequest 到 capabilities。与旧 run `2026-07-09_07-48-53` 对比，行为改变明确：新增全局 `baseline.main.overbudget` 总账；把 Lua `MapSignificanceMgr` 提升为 primary driver；URP 从单点 `RenderGraphSetup` 改为 `URP.RenderSingleCamera` 分摊视角；相机分析从“OnCameraMove 源码定位不到”推进到 `MapCameraCtrl.UpdateCameraPos`/`InfiniteZoomMgr` 路径；DataRequest 从旧 DR01-DR06 的自然语言缺口演化为稳定语义 id（`gc.per-marker-alloc`、`meshui.subsystem-markers`、`network.move-line-payload-size`、`resource.unload-count-per-frame`、`camera-move-listener-breakdown`）。**判定：M3-D 达标，M3 可阶段收口。**
3. **DataRequest schema 脱节**：types.ts 定义(want/rationale)与旧真实产物(topic/description/reasonMissing)不一致；新 run 已输出稳定语义 id + want/rationale 格式，但根上 types 与历史产物兼容/迁移仍可单独清理(可归BK-24附近)。
4. **已知深水区 BK-24**：记忆语义去重(跨run同需求措辞变化仍可能算不同id)——留 M4。
5. **环境·Cursor shell 故障根因修正(2026-07-11)**：此前误判为"僵尸终端 pid 25280 / 陈旧会话文件 805916.txt"。用户关 Cursor 后进程已清、主 agent 也删了陈旧 terminal 文件，**但探针重测 shell 仍空返回**（cmd/bash/写文件多法皆空、terminals 目录已空）。故根因**不是僵尸进程/文件**，而是 **Cursor Agent CLI 在 dispatch 脚本的 headless 非交互模式(`-p --output-format stream-json`)下，shell 工具子系统本身就不工作**——属该调用模式的固有限制，清进程/文件修不好。**结论：继续用"Cursor 写代码 + 主 agent 补跑验证"模式**(一直有效)；不再尝试修 Cursor shell。若要 Cursor 能自测，需换 Cursor 的启动方式(非本 harness 范畴)。

## 工单台账

- ✅ `DONE-WT-001` BK-17 HTML美化（M2试跑轨道）
- ✅ `DONE-WT-002` BK-16 源码归因·调用栈消歧
- ⏸ `DEFER-WT-003` BK-16续·profiler父链消歧——代码正确但当前数据零命中，待 **BK-23**（标签名↔函数名映射）激活
- ✅ `DONE-WT-004` BK-20 三维热点判定 + 诚实边界（M1 收官单）
- ✅ `DONE-WT-005` M3-A 持久大脑结构+存取接口（可扩展可插拔，22测试PASS）
- ✅ `DONE-WT-006` M3-摄入层 脚本+LLM二合一（先验知识79条入库，--replace-source防堆积，20测试PASS）
- ✅ `DONE-WT-007` M3-B 开局注入（先验知识注入explore-prompt，守F2免责，10测试PASS）
- ✅ `DONE-WT-008` M3-C 收尾沉淀（DataRequest用稳定id沉淀capabilities，增量不清空，24测试PASS）

## 待用户拍板 / 进行中

- **M3 阶段验收**：M3-D 重量层已通过，下一步可找用户做 M3 阶段收口/决定进入 M4（记忆语义去重、更多可复用知识料、BK-24）。
- **当前用户关注重心**：报告图文流/调用树聚焦(BK-25)已入表但降为体验层低优先；当前更关注 **引擎层完整度、三大回路完整度、三源其它两源能否按当前 agent 设计跑出高于作文机的报告**。
- **引擎层验证工单进展已收口并进入 Perfetto agent 化**：`WT-010 / BK-26` 已按 DR-36 验收 PASS。`WT-011 / BK-26b` 已按 DR-36 验收 PASS。`WT-012 / BK-23a` 已按 DR-36 验收 PASS。`WT-013 / BK-26b-impl` 已按 DR-36 验收 PASS。`WT-014 / BK-26b-fix` 已按 DR-36 验收 PASS。`WT-017 / BK-26b-explore` 已按 DR-36 验收 PASS（已提交 `771735e`）。`WT-018 / BK-26b-report` 已按 DR-36 验收 PASS（已提交 `4b66842`）。`WT-019 / BK-26b-query` 已按 DR-36 验收 PASS（已提交 `76d4b4a`）：query 层内容扩展。`WT-022 / BK-26b-provider` 已按 DR-36 验收 PASS（2026-07-14）：provider 层 PlayerLoop 分位数 + GC.Alloc 业务子树归因 + offCpuAttribution byState——agent 现在能拿到作文机 v5 §6.1/§6.3/§4.1 的核心数据，GC.Alloc 归因全 callTree 遍历不预设模块名清单。**下一步**：WT-020 explore 推理层（相对基线判定 + 跨态对比发现 + 因果推理规则，阈值由 agent 推理不写死）→ WT-021 报告叙事层（LLM 驱动中文叙事 + 数据解读 + ROI 优化方向，不套固定模板）。provider 层缺口已补全（剩余 5% 是 sched_blocked_reason ftrace 缺失，需采集端补）。

## M1 Gap 分析关键结论（2026-07-10，详见 m1-gap-analysis.md）

- **报告实测比 backlog 旧描述好很多**，DR-39 八项已达标6项。
- **BK-15 降级**：线程/URP 分群已兑现，不再是P0命门。
- **BK-16 升为首要真缺**：报告自认"OnCameraMove定位不到无法给行级建议"。
- **开工顺序**：先 BK-17+bug修复(WT-001,跑顺流程) → 再 BK-16(WT-002,最硬)。

## 最近关键决策（防重新拉锯）

- 开发协作模式：主agent出工单 → 用户搬 Cursor(免费)施工 → 主agent验收。迁移/文档整理是主agent自己的活，不走工单。
- 目录按四维度分（memory/plan/state/process），不按 00-99 编号平铺（不同维度不该同串号）。
- docs/ 只放人/agent 读写文档；运行时产物一律进 web/data/。
- 三回路现状=经验坟场（沉淀是死的），BK-LOOP(M3)通电才活；BK-LOOP必要非充分，M4才填料。
