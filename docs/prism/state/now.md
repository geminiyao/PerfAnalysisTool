# 当前战线（NOW）— 此刻在哪、下一步干嘛

> **新会话第一个读这个。** 永远保持最新。主 agent 每做完一件事 / 快切会话前必更新本文。
> 坐标系见 `../plan/roadmap.md`（里程碑）和 `../plan/backlog.md`（需求）。
> 最后更新：2026-07-17（**WT-036 红线归并修复 DONE** ✅ + **M5 unity 多态接入开工**：7 张工单 WT-038~044 入表，概念对齐"diff=2 态多态，multi=≥3 态多态，统一叫多态"）

---

## 🎯 当前阶段目标（M5 多源扩展 · unity 多态接入）

**用 VG 的 unity profiler 数据（baseline vs current）跑出高质量多态报告，验证 DR-43 扩展后的 2 态多态方法论。**

概念对齐（2026-07-17 用户确认）：
- 单态（DR-42）：1 个样本，相对占比判定
- 多态（DR-43 扩展）：≥2 个样本，相对倍数 + 绝对增量判定。2 态是 N=2 的多态，≥3 态是 N≥3 的多态
- **不区分 diff/multi**——统一叫多态，模板用一个 unity-multi-state.txt 覆盖所有 N≥2
- **不新建 DR-46 diff 方法论**——DR-43 扩展覆盖 2 态即可

剩余路径：
1. **通用前置（并行）**：WT-038 数据源无关化 + WT-039 红线归并规则 + WT-040 dataSource 字段
2. **unity 多态前置**：WT-041 DR-43 扩展 + WT-042 unity-multi-state 模板 + WT-043 unity-explore 多态引导
3. **unity 多态主线**：WT-044 跑 VG 数据产出多态报告
4. **perfetto 善后**：WT-037 harness 防呆 + DR-43 定稿 + DR-42 定稿

## 当前里程碑

**M1 单次质量收尾 ✅ 基本收官** → **M3 持久大脑通电（BK-LOOP）✅ 重量层已验收** + M2 开发OS（已搭完·持续用）+ **M5 多源扩展 / Perfetto agent 化（已通）+ unity 多态接入（进行中）**

## 🚀 下一步具体动作（新会话直接执行）

1. **通用前置（并行，无依赖）**：
   - WT-038 narrative-prompt + 模板数据源无关化（清业务词 + 清 perfetto 特定词 + explore-prompt 重命名）
   - WT-039 红线归并规则调整（分布形态 + 语义独立性）
   - WT-040 prism-memory 加 dataSource 字段 + 按数据源筛选注入
2. **unity 多态前置**：
   - WT-041 DR-43 扩展覆盖 2 态（纯方法论，无依赖）
   - WT-042 unity-multi-state.txt 模板（依赖 038/039/041）
   - WT-043 unity-explore-prompt 加多态引导（依赖 038/040/041）
3. **unity 多态主线**：
   - WT-044 跑 VG unity profiler 数据产出多态报告（依赖 038/039/040/041/042/043 全部完成）
4. **perfetto 善后**：
   - WT-037 harness 防呆（无依赖，立刻可做）
   - DR-43 定稿（依赖 039/041）
   - DR-42 定稿（依赖 044/041）

## 刚做完什么（本次会话）

- ✅ **WT-036 红线归并修复 DONE**：5 轮迭代最终方案"prompt 引导 + 机器兜底（红队回路自动修复父子同列）"。commit `e91e7db` 已 push。
  - narrative-types.ts schema 重构（删顶层 perfetto 字段，加 VisualAsset 到 NarrativeItem）
  - render-html.ts renderVisualAsset 函数 + 表格超框 CSS 修复
  - perfetto-multi-state.txt visualAsset 填法指引 + 红线归并示例
  - narrative-prompt.txt VisualAsset schema + 递归归并规则 + 统筹与拆出互斥
  - harness.ts + narrative-service.ts 红队回路扫 item.visualAsset + callTree 真实父子检测 + 自动修复
  - v5 报告：web/data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5/report.html (94.0 KB, 36 PASS / 0 FAIL / 1 WARN)

- ✅ **M5 unity 多态接入开工**：7 张工单入表 backlog.md
  - 概念对齐：diff = 2 态多态，multi = ≥3 态多态，统一叫多态，不区分 diff/multi
  - 诊断：narrative-prompt/explore-prompt/模板硬写 perfetto+AOE 业务词，需要数据源无关化
  - 7 张工单：WT-038（数据源无关化）+ WT-039（红线归并规则）+ WT-040（dataSource 字段）+ WT-041（DR-43 扩展）+ WT-042（unity-multi-state 模板）+ WT-043（unity-explore 多态引导）+ WT-044（跑 VG 数据）

- ✅ **WT-025 全部完成**：报告产出系统沉淀三位一体落地，227 PASS / 0 FAIL。
  - **需求 1 方法论统一索引**：新建 `docs/prism/memory/report-methodology-index.md`，收拢 DR-41（五条硬规则宪法）+ DR-42 draft（单态）+ DR-43 draft（多态）+ 标杆对照表（v5.3 perfetto / v4 simpleperf / unity v1）+ 报告脚本对照检查清单 + report-utils 工具速查 + tools.test 自动检查速查。每个数据源报告脚本开发前必读。
  - **需求 2 report-utils.ts**：新建 `web/server/prism/report-utils.ts`，5 类工具（子树归并/人话化/判定/叙事/渲染），数据源无关。perfetto-report-mvp.ts import report-utils，删除重复实现。
  - **需求 3 DR-41 自动检查**：tools.test.ts 新增 [16] 节，28 个 assert，覆盖五条硬规则。防返工。

- ✅ **WT-025 需求 2 DONE**：report-utils.ts 抽取。新建 `web/server/prism/report-utils.ts`，把 `perfetto-report-mvp.ts` 里的报告层通用函数抽成数据源无关的可复用工具，227 PASS / 0 FAIL（不变）。
  - **5 类工具**：
    - 子树归并：`buildNameParentChains`（接收通用 ReportTreeNode）/ `isAncestorOf` / `mergeBySubtree`
    - 人话化：`humanizeRelativeJudgment` / `humanizeCausalInference` / `humanizeFoldChange`（新增）
    - 判定（多态+单态统一）：`detectStateMode` / `judgeByFoldChange`（多态）/ `judgeByP50Ratio` / `judgeByVsync`（单态，标注 draft pending DR-42）
    - 叙事：`buildTopConclusionBlock`（单块构建器）/ `buildAsciiBar` / `buildSubtreeDrilldown`（子树下钻结构）
    - 渲染：`renderFourPartBlock`（四段式块 HTML）/ `renderDrilldownCard` / `renderCallTreeWithSeverity`（带🔴🟡🟢标注的 callTree）/ `htmlEsc`
  - **perfetto-report-mvp.ts 改造**：import report-utils，删除重复实现（htmlEsc/humanizeRelativeJudgment/humanizeCausalInference/isAncestorOf/mergeBySubtree/buildAsciiBar 本地定义 + NameParentChain/TopConclusionBlock 本地 interface + 内联 conclusionBlockHtml 渲染）。`buildNameParentChains` 保留为 Perfetto 适配器（选主参考 callTree + frameCount，调用通用版本）。
  - **设计要点**：数据源无关（通用 ReportTreeNode 接口，perfetto/simpleperf/unity 都能适配）；不硬编码业务名/阈值；单态判定函数标注 `// draft, pending DR-42 validation`；为 M5 多源报告做准备

- ✅ **WT-025 需求 3 DONE**：DR-41 五条硬规则自动检查落地。在 `web/server/prism/tools.test.ts` 新增 [16] 节，共 28 个 assert，199→227 PASS / 0 FAIL。
  - **规则 1 审计剥离（9 assert）**：HTML 无 evidence id/evidenceIds/证据：/审计 section/runId/ev-001/ev-0/provenance.tool 字样；无"审计"section 标题
  - **规则 2 子树归并（4 assert）**：红线矩阵非空；mergedChildren 不与其它行 module 重复（不硬编码业务名，纯结构检查）；至少 1 行有 mergedChildren；mergedChildren 无自引用
  - **规则 3 结构层次（9 assert）**：HTML <h2> 含 §0-§6 全部 7 个；无 §7 h2 标题（GPU-bound 合并进 §3）；§0→§1→§2→§3→§4→§5→§6 顺序正确（按 h2 出现位置排序，避免"详见 §X"引用干扰）
  - **规则 4 图文穿插（4 assert）**：§0 至少 3 个独立结论块；每块含 oneLiner+asciiChart+keyNumbers+seeAlso 四段；HTML 含 ≥3 个 blockquote；含 ≥3 个 pre.ascii
  - **规则 5 人话先行（2 assert）**：HTML 正文无字段名泄漏（byState.S.totalMs/coveragePct/foldChange=9999/effectiveCoveragePct/parentChain=/relativeBaseline/causalChain/claim:/boundary:/nested sum/use max not sum）；每个结论块 oneLiner 含中文
  - **设计要点**：检查不硬编码业务名（用结构不变量：mergedChildren 一致性、h2 顺序、字段名缺失）；数据源无关（perfetto/simpleperf/unity 报告都能复用）；防返工（每次报告脚本改动后自动核五条硬规则）

## 上一批会话做完什么

- ✅ **WT-023 报告层重构 DONE**：执行 DR-41 五条硬规则，只改 `web/server/scripts/perfetto-report-mvp.ts`，不改 explore/provider/query。199 PASS / 0 FAIL。
  - **规则 1 审计剥离**：删除"审计 / 证据入口"section；finding card 只渲染 humanNarrative；ROI rationale 用 humanizeRelativeJudgment / humanizeCausalInference 转人话
  - **规则 2 热点模块归并**：新增 buildNameParentChains（从 callTree 动态构建 name→parentChain）+ mergeBySubtree（祖先已在列表则 child 归并到祖先的 mergedChildren）。红线矩阵 URP 子树从 6 行（Render/CameraStack/SingleCamera/AfterRendering/Submit/WaitForPresent）压缩到 1 行（URP.Render 含 6 个 mergedChildren）
  - **规则 3 结构重排**：§0→§1→§2→§3→§4→§5→§6 宏观→各线程→下钻；§7 GPU-bound 合并进 §3.5；删除按 finding kind 罗列的 7 个 section；删除三态对照表独立 section（沉入 §1）
  - **规则 4 图文穿插四段式**：新增 TopConclusionBlock 类型 + buildTopConclusionBlocks；§0 三大独立结论（GPU-bound / 业务热点 / 降频）每块=引用块+加粗一句话+ASCII 柱状图+关键数字解读+详见 §X
  - **规则 5 人话先行**：humanizeRelativeJudgment 把 foldChange=9999 sentinel 转成"仅在 cur 出现"；humanizeCausalInference 把 effectiveCoveragePct≈99.24% 转成"主线程睡的时候约 99.24% 在等该 wait slice"
  - **死代码清理**：删除 renderKindSection / renderHotPath / filterByKinds（不再使用）

## 上一批会话做完什么

- ⚠️ **WT-021 返工二次打回**：返工加了 v5.3 对齐字段（multiThreadMacro/callTreeDrilldown/offCpuAttribution/freqMatrix/redlineMatrix/gpuBoundMatrix/asciiVisuals + humanNarrative），199 PASS/0 FAIL。但用户对照 v5.3 后指出报告仍不可读：
  - ① **审计证据入口还在报告里**：report.html 有"审计 / 证据入口"section 渲染 evidence id/tool/runId 表——DR-39 早就说剥离
  - ② **顶部结论 #3/#4 是同一模块**：URP.Render 和 URP.RenderCameraStack 是父子关系，不是两个独立问题
  - ③ **红线矩阵 top 8 里 6 行是 URP 子树**：Render/CameraStack/SingleCamera/AfterRendering/Submit/WaitForPresent 是同一棵渲染子树不同层
  - ④ **§4 off-CPU 和 §7 GPU-bound 重复讲 GPU**：wait slice 重叠在 §4 讲了，§7 又讲一遍
  - ⑤ **文字一大段掺杂数据**："三态主趋势：UnityMain runningPct 86.94→77.82→56.99; avgMhz 1729.5→1576.3→1324.6..."——log 风不是人话
  - ⑥ **findings 按 kind 罗列 7 个 section**：业务红线/GPU-bound/降频/GC/off-CPU/PlayerLoop/thermal-only——按 finding 分类，不是按读者认知层次组织
  - **根因**：报告层缺方法论沉淀。DR-29/39/40 早就钉死"人话先行/审计剥离/按主题叙事非发现序号"，但报告脚本写的时候没人对照。每次到"数据→报告"这一步就退化成乱码，是因为这一层缺一个"报告层宪法"。
  - **以上 6 个问题 WT-023 已全部解决** ✅

- ✅ **DR-41 报告层方法论沉淀**：新建 `docs/prism/memory/dr-41-report-layer-methodology.md`，把散落在 rationale.md/charter.md/backlog.md/lessons-learned/perfetto-report-template 的报告层方法论收拢成五条硬规则。

## 工单台账

- ✅ `DONE-WT-001` BK-17 HTML美化（M2试跑轨道）
- ✅ `DONE-WT-002` BK-16 源码归因·调用栈消歧
- ⏸ `DEFER-WT-003` BK-16续·profiler父链消歧——待 BK-23 激活
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
- ✅ `DONE-WT-020` BK-26b-explore-reasoning explore 推理层（29 findings/24 relativeBaseline/1 causalChain）
- ✅ `DONE-WT-021` BK-26b-narrative 报告叙事层（验收PASS 但质量评估打回——返工一次后二次打回，已由 WT-023 解决）
- ✅ `DONE-WT-023` 报告层重构：审计剥离 + 模块归并 + 图文穿插 + 结构重排（执行 DR-41 五条硬规则，199 PASS / 0 FAIL）
- ✅ `DONE-WT-024` 报告质量二期：6 个需求（§0②全貌 + §2三态 + §3概念/层次 + §5.2 callTree标注/三态/剪枝 + §5.5下钻深化 + 因果链去硬编码），227 PASS / 0 FAIL。需求 7 单态延后。
- ✅ `DONE-WT-025` 报告产出系统沉淀：需求 1（方法论索引）+ 需求 2（report-utils.ts）+ 需求 3（DR-41 自动检查）三位一体，227 PASS / 0 FAIL
- ✅ `DONE-WT-036` 红线清单归并修复 + schema 重构 + 红队回路自动修复（commit `e91e7db`，36 PASS / 0 FAIL / 1 WARN）
- ⬜ `TODO-WT-037` harness 防呆：内容厚度回归 + 硬编码自举检查（工单已建）
- ⬜ `TODO-WT-038` narrative-prompt + 模板数据源无关化（工单已建，unity 多态前置）
- ⬜ `TODO-WT-039` 红线归并规则调整：分布形态 + 语义独立性（工单已建，通用前置）
- ⬜ `TODO-WT-040` prism-memory 加 dataSource 字段（工单已建，通用前置）
- ⬜ `TODO-WT-041` DR-43 扩展覆盖 2 态（工单已建，unity 多态前置）
- ⬜ `TODO-WT-042` unity-multi-state.txt 报告模板（工单已建，unity 多态前置）
- ⬜ `TODO-WT-043` unity-explore-prompt 加多态引导（工单已建，unity 多态前置）
- ⬜ `TODO-WT-044` 跑 VG unity profiler 数据产出多态报告（工单未建，依赖 038-043 全部完成）
- ⬜ `DR-42 draft` 单态分析方法论：相对占比判定替代相对倍数判定，需 simpleperf/unity 单源验证后定稿（依赖 WT-044/041）
- ⬜ `DR-43 draft` 多态分析方法论：相对倍数+演化趋势判定，多态叙事结构（演化型），需 WT-039/041 完成后定稿

## 待用户拍板 / 进行中

- **当前阶段目标**：M5 unity 多态接入——用 VG 数据跑出高质量多态报告，验证 DR-43 扩展后的 2 态多态方法论。
- **M3 阶段验收**：M3-D 重量层已通过，可找用户做 M3 阶段收口/决定进入 M4。
- **当前用户关注重心**：unity diff 报告产出（VG baseline vs current）+ perfetto 善后收尾 + 三大回路完整度。

## 重要边界（必须遵守）

- **严禁硬编码**：不许把业务模块名、判定阈值、叙事模板写死。DR-41 报告层五条硬规则是报告层的"宪法"，所有报告脚本必须对照执行。
- **报告层五条硬规则**（DR-41）：①审计剥离 ②热点模块归并 ③宏观→各线程→下钻分层 ④图文穿插四段式 ⑤人话先行技术数字沉底。验收报告类工单必须逐条对照。
- 不要再重做 WT-013/014/017/018/019/022/023。
- 无 FrameTimeline 时必须保持 available:false，不许编 jank。
- correlateFrameSchedCpu 仍只能是 window 粒度，不许声称逐帧相关。
- base callTree 现在应可用（WT-014 PlayerLoop anchor fallback 修复）。

## 开发方式

- 主 agent 是需求管理和验收方，复杂实现优先派给 Cursor 或 CodeBuddy CLI 施工。
- CodeBuddy/Cursor dispatch 脚本位置：`docs/prism/process/scripts/dispatch-ticket.ps1`
  但 Cursor headless 模式 shell 故障是已知限制，主 agent 必须按 DR-36 验收：直播跑脚本/测试复现，不信施工方自报。
- 派发大任务容易被外层 10 分钟超时打断，建议工单拆小或加接续说明约束施工方不重复诊断。
- 本地还有大量未提交的旧改动/未跟踪文件；新会话如果要提交，必须继续只挑当前工单相关文件，别 git add .。

## 最近关键决策（防重新拉锯）

- 开发协作模式：主agent出工单 → 用户搬 Cursor(免费)施工 → 主agent验收。迁移/文档整理是主agent自己的活，不走工单。
- 目录按四维度分（memory/plan/state/process），不按 00-99 编号平铺。
- docs/ 只放人/agent 读写文档；运行时产物一律进 web/data/。
- 三回路现状=经验坟场（沉淀是死的），BK-LOOP(M3)通电才活；BK-LOOP必要非充分，M4才填料。
- WT-021 返工由主 agent 自己重写报告脚本（不派 Cursor），因为差距在报告结构和叙事，主 agent 更理解 v5.3 的叙事意图。
- WT-023 报告层重构由主 agent 自己执行（不派 Cursor），因为差距在 DR-41 五条硬规则的执行，主 agent 更理解方法论。
- **DR-41 报告层方法论沉淀**：每次到"数据→报告"这一步就退化成乱码，是因为报告层缺宪法。DR-41 把散落的方法论收拢成五条硬规则，WT-023 已执行完毕。
- **2026-07-17 概念对齐**：diff = 2 态多态，multi = ≥3 态多态，统一叫多态，不区分 diff/multi。DR-43 扩展覆盖 2 态即可，不新建 DR-46 diff 方法论。模板用一个 unity-multi-state.txt 覆盖所有 N≥2。
- **2026-07-17 数据源无关化决策**：narrative-prompt/explore-prompt/模板硬写 perfetto+AOE 业务词，需要数据源无关化（WT-038）。narrative-prompt 是数据源无关骨架，范例用占位符；perfetto-multi-state 是 perfetto 特定模板，perfetto 概念可保留但业务名改占位符；explore-prompt.txt 重命名为 unity-explore-prompt.txt。
- **2026-07-17 红线归并规则纠正**：旧规则"55:45 平均→统筹"是错的。新规则：分布形态（有无明显大头）+ 语义独立性（大头是否不同模块）。URP.Render 下 6 个差不多→统筹；LuaMgr 下 BattleHeadMgr+MapSignificanceMgr 是明确大头 + 语义不同→拆出。适用所有数据源所有调用树层级。
