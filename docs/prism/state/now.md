# 当前战线（NOW）— 此刻在哪、下一步干嘛

> **新会话第一个读这个。** 永远保持最新。主 agent 每做完一件事 / 快切会话前必更新本文。
> 坐标系见 `../plan/roadmap.md`（里程碑）和 `../plan/backlog.md`（需求）。
> 最后更新：2026-07-14（WT-018 Perfetto narrative.json+report.html MVP 验收PASS：Perfetto 走通完整 "query→ledger→findings/verdict→narrative+html" 交付链路）

---

## 当前里程碑

**M1 单次质量收尾 ✅ 基本收官** → **M3 持久大脑通电（BK-LOOP）✅ 重量层已验收** + M2 开发OS（已搭完·持续用）

## 刚做完什么（本次会话）

- ✅ **WT-018 = BK-26b-report Perfetto narrative.json + report.html MVP（验收PASS）**：新增报告生成脚本 `web/server/scripts/perfetto-report-mvp.ts`（只读 WT-017 产物，不耦合 Unity render-html/narrative-types，新增薄 adapter）。产物落 `web/data/prism-out/bk26b-perfetto-report-mvp/{narrative.json,report.html,audit.json,run.log}`。主 agent 独立验收（DR-36 亲自跑）：`node --import tsx server/scripts/perfetto-report-mvp.ts` 直播 exit 0；`tools.test.ts` 116 PASS/0 FAIL 未退化。narrative.json 含 `source/sampleSet/overview/topConclusions(5)/findings(6)/evidenceSummary(17)/capabilityBoundaries(3)/triadComparison/callTrees/inputProvenance`。report.html 章节齐全：标题样本说明、概览、顶部结论 5 条、三态对照表（sched/atrace/cpu/frame）、Findings 卡（每条含证据回链）、CallTree/HotPath 聚焦（base fallback badge + lower-confidence note，cur/throttle native）、能力边界、审计证据入口（17 行 evidence 表）。三个边界全部诚实呈现：base callTree fallback(f-02)、FrameTimeline 三态 unavailable 不判断 jank(f-01)、correlate granularity:window 不声称逐帧(f-03/f-05)。工单 `REVIEW-` 待改 `DONE-`。
  - ⚠️ **同款 Cursor shell 故障**：派发进程 4m50s 完成（未超时），但 Cursor shell 仍不可用。施工方按 WT-017 模式诚实交代并手写产物。主 agent 直播跑脚本后输出与施工方手写产物一致，直播脚本输出已覆盖手写产物。
  - 🔑 **交付链路验证成立**：WT-018 证明 Perfetto 走通完整 "query 工具 → provenance → evidence ledger → findings/verdict → narrative.json + report.html" 链路，不依赖读 summary 写作文，报告里每个结论可回链 evidence。这是 Perfetto agent 同构交付层的关键一步。
- ✅ **WT-017 = BK-26b-explore Perfetto explore + evidence ledger MVP（验收PASS）**：新增 deterministic scripted loop `web/server/scripts/perfetto-explore-mvp.ts`（不接 LLM），对 base/cur/throttle 调用 WT-013 六工具（correlate 仅 cur/throttle）= 17 evidence，派生 6 findings + verdict。产物落 `web/data/prism-out/bk26b-perfetto-explore-mvp/{ledger,findings,verdict,run.log}`。主 agent 独立验收（DR-36 亲自跑）：`node --import tsx server/scripts/perfetto-explore-mvp.ts` 直播 exit 0；`tools.test.ts` 116 PASS/0 FAIL 未退化。三个边界全部显式记录：base callTree `via PlayerLoop anchor fallback`(f-02)、FrameTimeline 三态 `available:false` 不写 jank(f-01)、`correlateFrameSchedCpu granularity:window` 不声称逐帧(f-03/f-05)。关键数字：base/cur/throttle UnityMain runningPct=86.94/77.82/56.99，avgMhz=1729.5/1576.3/1324.6，throttle throttlingLevel=suspected。findings 覆盖 base(f-02/f-06)、cur vs throttle(f-03/f-04)、能力边界(f-01/f-05)。已提交 commit `771735e` 并 push origin/master。
  - ⚠️ **同款 Cursor shell 故障**：派发进程 9m53s 完成（未超时），但 Cursor shell 在 headless 模式仍不可用（`Can't find Bash`），施工方无法自测脚本。施工方诚实交代改为"按脚本逻辑对照 triad JSON 手写产物"。主 agent 直播跑脚本后，输出与施工方手写产物关键数字完全一致——说明施工方确实按脚本规则手写、未造假。直播脚本输出已覆盖手写产物，最终交付的是脚本真实输出。
  - 🔑 **机制验证成立**：WT-017 证明 Perfetto 能走 "query 工具 → provenance → evidence ledger → findings/verdict"，不依赖读 summary 写作文。ledger 每条 evidence 含 `id/tool/role/args/provenance/summary/facts`，findings 全部回链 evidenceIds。这是 Perfetto agent 同构的关键一步。
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
- **引擎层验证工单进展已收口并进入 Perfetto agent 化**：`WT-010 / BK-26` 已按 DR-36 验收 PASS：simpleperf 与 Perfetto/ptrace 数据层最小闭环成立。`WT-011 / BK-26b` 已按 DR-36 验收 PASS：新版 Perfetto triad（`sample_base_20260624_104944`、`sample_cur_20260624_105041`、`sample_throttle_20260624_105539`，由 `record_aoeyz.bat` 采集）比旧单 trace 更适合作 Perfetto agent 同构主样本。`WT-012 / BK-23a` 已按 DR-36 验收 PASS：marker alias table + confidence 已落地。`WT-013 / BK-26b-impl` 已按 DR-36 验收 PASS：6 个 Perfetto query 最小集已实现并可 CLI/batch 调用。`WT-014 / BK-26b-fix` 已按 DR-36 验收 PASS：provider 自动 ingest sidecar，evidence 不再错报无 thermal，base callTrees 已通过 PlayerLoop anchor fallback 修复，三组 triad 重新 build 后测试 116 PASS。`WT-017 / BK-26b-explore` 已按 DR-36 验收 PASS（2026-07-14，已提交 `771735e`）：Perfetto explore + evidence ledger MVP 成立，deterministic scripted loop 17 evidence + 6 findings + verdict，三个边界显式记录。`WT-018 / BK-26b-report` 已按 DR-36 验收 PASS（2026-07-14）：Perfetto narrative.json + report.html MVP 成立，报告章节齐全（标题/概览/顶部结论/三态对照表/Findings/HotPath 聚焦/能力边界/审计入口），每个结论回链 evidence，三个边界诚实呈现。**Perfetto 已走通完整 "query→ledger→findings/verdict→narrative+html" 交付链路。** 下一批 TODO：`WT-015` 报告层消费 source confidence、`WT-016` CustomSampler/Create 自动扫描扩展 map-source。

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
