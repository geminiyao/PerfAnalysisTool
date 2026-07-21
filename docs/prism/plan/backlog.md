# PRISM — 总待办表（BACKLOG）· 唯一需求真相源

> **这是 Prism 所有需求的唯一总表。** 任何新需求（用户提的、Claude 发现的、搁置捡回的）**立即入表**，不靠谁的脑子记。
> Claude 每次找用户前，**先报本表全貌**（做了啥/在做啥/还剩啥），再谈当前这步。用户从"盯需求的监工"变成"看总表拍板方向的人"。
>
> 配套文件：[北极星与锚定Feature](../memory/charter.md)｜[决策推演录](../memory/rationale.md)｜[数据需求池](../plan/datarequests.md)
> 状态图例：✅完成　🔄进行中　⬜待办　⏸暂缓（在册不丢，时机未到）
> 最后更新：2026-07-07（自我批判回合验证成功后）

---

## 🌟 北极星（不变）
造一个越用越懂这款游戏的性能分析师：自己找问题、查数据验证、锚着源码给建议，每断言可回溯，越用越准/越会查/越懂业务。
八条锚定 Feature F1–F8 见 CHARTER。**当前处于阶段一（unity single 榨干），核心闭环已跑通并证明"分析师>作文机"方向成立。**

---

## ✅ 已完成（阶段一主体 + 一轮能力升级 + 自省层）
- 数据层：`.pdata`→300万行逐帧×线程×marker 明细库（prism.sqlite）
- 8 个按数据轴推导的查询工具（queryMarkers/scanMetricOverFrames/getFrameCallTree/getThreadTimeline/correlateFrameSets/scanPeakMarkers/aggregateSubtree/queryFrameCounters）+ batch 提速
- 接入 counters.json（逐帧 GC分配/面数/批次/内存）
- Phase A 自由探索内核（方案B：CLI+账本核对，F1 provenance 生效，0 编造）
- Finding/DataRequest 类型、F8 帧预算判定、中文报告 renderer、按时间戳归档
- **自我批判回合**（DR-24/27）：agent 自审出 severity排序/present统计/中文/下钻 等缺陷，无需用户指出 → **"自省自驱"立住**

---

## 🔥 P0 · 当前最该做（本轮 review 暴露，方向已明）

| ID | 需求 | 来源 | 状态 |
|----|------|------|------|
| **BK-1 下钻到底** | 强化下钻纪律：主因子树钻到叶子 marker（pdata 里 MapSignificanceMgr 下明明有 ProcessTask_MapEntityAdd 3.6ms/MapObjRefresh 2.49ms 等，这轮没钻到）。**不需新数据，立竿见影** | DR-23①/本轮Q2 | ✅ |
| **BK-2 报告说人话** | renderer 加"改写成生动易懂中文"环节，把 pctBinA/maxChildRatio 黑话翻成人话，可读性追上作文机 | DR-23/本轮Q3 | ✅ |
| **BK-3 回路自动化** | data-requests.json 自动汇总进 PRISM-DATAREQUESTS.md（现在靠 Claude 手搬）。**这是"能力回路没自动转"的直接证据，也是需求会飘走的根源之一** | 本轮Q5/第4点 | ✅ |

---

## 🏛️ 框架级 · F4 跨run螺旋 = 把"一次性程序"变"agent loop"（用户核心愿景，最根本）

> 用户诊断（准确）：当前每次 run 是**孤立无记忆的进程**——空白大脑开局、产出写盘、进程死掉。所谓三大回路目前只有
> "收集端"（datarequest 自动汇总 BK-3），**"回流端"完全没搭**：池子里的东西不会反哺下一次 run，更没有跨run进化。
> 所以"像一次性应用程序,不是 agent loop"。这正是 Charter **F4 至今没真正开始转**的证据。
>
> 用户愿景：Prism 是个 **agent loop**，人只是 loop 的**一个**输入源（提意见/标对错/拍方向），agent 自己也持续
> 往三大回路灌语料。人退场 loop 也转，人在场转得更准。**先确认单次报告质量→再搭此框架→再深挖细节。**

| ID | 需求 | 状态 |
|----|------|------|
| **BK-LOOP 跨run螺旋骨架** | 建"持久大脑"(prism-memory/)存三回路产物；run开局自动注入(已知业务知识/别再犯的教训/可用工具)；run收尾沉淀(本次新知识/新教训/新需求写回);人工注入口(随时加条目下次生效)。**从"每次重新投胎"变"站在上次肩膀上"**。**设计参考(2026-07-10)：借鉴 LangGraph 的 state+checkpointer 模型。详见 PRISM-PHILOSOPHY.md 第八节。拆解见 roadmap M3 章节(M3-A/B/C/D)** | 🔄 进行中（M3-A✅存取骨架 / M3-B开局注入待做 / M3-C沉淀 / M3-D验证） |
| ├ M3-A 持久大脑结构+存取接口 | ✅ **DONE（WT-005，2026-07-11）**：`web/server/prism/prism-memory/`(4类:priors/knowledge/capabilities/lessons)+`prism-memory.ts`(loadMemory/appendMemory，配置驱动注册表→可扩展，按分类筛选→可插拔，md+frontmatter存储可手改)。22测试PASS。纯新增未接管线。 | ✅ |
| ├ 更新Charter F4 | 把"跨run螺旋+人是loop一个输入源+开局注入/收尾沉淀"的落地路径写进 Charter F4（现F4只有目标态没路径）。**待用户确认报告质量后再改，现在改属过早固化** | ⏸ 待报告确认 |
| ├ 知识回路·回流 | 确认的业务归因(如"MapSignificanceMgr是镜头平移触发批量增删")沉淀成知识→下次run开局注入 | ⬜ |
| ├ 能力回路·回流 | datarequest池高频项(BK-3已收集)→触发固化为新工具/新源→下次run多一把感官 | ⬜（收集端✅回流端⬜） |
| ├ 质量回路·回流 | 人/自审标finding对错漏→金标(BK-4)→下次run前回归+教训注入prompt(如"present别用占比判") | ⬜（依赖BK-4） |
| └ 当前run内自举 | 自我批判回合(已做)是run内即时自省，但不产生跨run沉淀。人可run内打断提意见→agent立即补查+沉淀 | 🔄 部分（自审✅） |

---

## 🟡 P1 · 阶段一收尾必做

| ID | 需求 | 来源 | 状态 |
|----|------|------|------|
| **BK-4 金标集+人确认(B6)** | 质量回路的"另半截"：人拍板 finding 对/错/漏 → 存成金标集 → 每次改进跑金标量召回/误报。没这个只能凭感觉说"好像好点了" | Charter F4/task#6 | ⬜ |
| **BK-5 成本贡献度工具(B8)** | 算某问题占总CPU%/抹掉它中位数变化，帮 severity 判定（自我批判已部分用绝对量替代，此工具让它更稳）。**并入 BK-20 三维热点判定的"占比维度"** | task#13 | ⏸（并入BK-20） |
| **BK-6 等待链反查(B9)** | traceWaitChain：主线程等谁→那根线程此刻在忙什么，深化 F7 | task#14 | ⏸ |
| **BK-7 探索成本治理** | 自省+下钻让单次 103 次调用/约40分钟，更强但更慢更贵。要不要治、怎么治 | 本轮观察 | ⬜ |

---

## 🟢 P2 · 阶段二/三（跨源、源码、进化回路）

| ID | 需求 | 来源 | 状态 |
|----|------|------|------|
| **BK-8 源码映射(F5)** | 给 marker 配源码位置+函数语义，解释"为什么贵"。**护栏：只在 marker 已指到够小函数时用源码，marker粗则禁止关联(防脑补)** | Charter F5/本轮Q2 | ⏸ |
| **BK-9 跨源复用抽象** | unity/simpleperf/perfetto 数据轴同构，抽象成通用工具集+adapter，接新源=写adapter非重走流程。**治用户"每源重来一遍"的头大** | DR-24③/第4点 | ⏸ |
| **BK-10 知识回路** | 自我批判审出的方法论教训（如"占比会被分母稀释""GC先查gcAlloc证伪")沉淀成"分析清单"注入下次 prompt，越用越会分析 | DR-25/Charter F4 | ⏸ |
| **BK-24 记忆质量治理（语义去重/防臃肿）** | M3 摄入/沉淀暴露的深水区(WT-006验证)：结构性重复(同id)已靠覆盖解决，但**语义重复防不了**——run1与run5学到同一结论但finding_id不同→存成两条讲同一事的条目。"越用越强"与"越用越臃肿"一线之隔。需上层机制：语义去重/合并、或"同结论反复出现则加权增强而非堆条"。**属M3通电后的质量优化，不阻塞通电**；先验知识侧已用 replaceSource 按源覆盖绕过。 | WT-006验证(2026-07-11) | ⏸（M4，通电后开单） |
| **BK-11 diff/cross 推广** | 单源榨干后推广到对比/三源综合分析 | Charter 阶段三 | ⏸ |
| **BK-18 自动采集流程** | 打通"采集→ingest→分析触发"的自动入口（当前 pdata 靠手工放置+手工灌库+手工敲探索命令）。是 BK-LOOP agent loop 的**数据入口**：loop 要自转，数据得能自动进来。来源：用户手记脑图「待做需求·自动采集流程」，此前 BACKLOG 缺失 | 手记.smm | ⬜（依赖 BK-LOOP 前不急，先在册） |
| **BK-23 profiler标签名↔源码函数名映射** | ✅ **WT-009/WT-012 验收 PASS（2026-07-13）**：WT-009 证明 Lua/C# marker-source 灰区真实存在；WT-012 已落地 marker alias table（20 条）+ confidence 分级，`getSourceForSymbol` 可区分 `exact-codegraph` / `method-anchored` / `class-anchored` / `map-source-interval` / `low-confidence`。OnCameraMove、ProcessTask_*、MUI_UpdateUIPos、LuaMgr schedule 等灰区已变成可审计映射；仍需注意 class/interval/low 不可作为强行级源码建议。后续可选：BK-23b 自动扫描 CustomSampler/Create 串；报告层按 confidence 控制源码建议强度。 | WT-003/WT-009/WT-012验证(2026-07-13) | ✅ 最小闭环完成，转自动化/报告消费 |
| **BK-19 能力回路·run内实时自举** | 能力回路最强版：本次 run 内 LLM 发出 DataRequest 后，**当场**把它变成可执行新查询/新感官、立即用来挖当下想要的数据，而非写盘等下次 run。是"run内即时补感官" vs 现有"跨run离线固化"的升级。**优先级不高**（用户判断：新源可先多跑几次把 DataRequest 跑出来、离线把感官建好，~90% 感官能这样提前建好，不必都实时）。难度高（需 run 内安全动态生成+执行新查询）。排在 BK-LOOP 之后 | 用户疑问2（本轮） | ⏸（在册不丢，BK-LOOP 后） |
| **BK-26 三源同构试点验证** | ✅ **WT-010/WT-011/WT-013/WT-014/WT-017/WT-018/WT-019/WT-022 验收 PASS（2026-07-14）**：WT-010 数据层最小闭环；WT-011 Perfetto triad 主样本；WT-013 6 个 query；WT-014 provider sidecar+base callTrees 修复；WT-017 explore+ledger MVP（17 evidence+6 findings+verdict）；WT-018 narrative.json+report.html MVP（报告章节齐全，每个结论回链 evidence）；WT-019 query 层内容扩展（新增 queryCallTreeSubtree/querySliceDeltas/queryOffCpuAttribution + 增强 queryFrameTimeline/queryCpuFreq，覆盖作文机 v5 约 80% 核心数据需求，无硬编码——agent 能"发现"问题而非被"告诉"盯谁）；WT-022 provider 层 PlayerLoop 分位数 + GC.Alloc 业务子树归因（全 callTree 遍历，不预设模块名清单）+ offCpuAttribution byState——agent 现在能拿到作文机 v5 §6.1/§6.3/§4.1 的核心数据，覆盖度约 95%。**Perfetto 已走通完整 "query→ledger→findings/verdict→narrative+html" 交付链路，数据层完全追上作文机 v5。** 剩余缺口：sched_blocked_reason ftrace 缺失导致的 byReason 细分（需采集端补，非 provider 层能解）；explore 推理层（WT-020）；报告叙事层中文+解读+ROI（WT-021）。 | 用户 2026-07-13 关注三源其它两源能否复用当前 agent 设计 | 🔄 Perfetto agent 化进行中（query+provider+交付链路已通，待推理层+叙事层） |

---

## 📌 认识论落地：单源热点判定 + 回归哨兵（2026-07-10 设计哲学讨论）

> 本轮把用户困扰"单源没baseline怎么判热点/达标"拆成**两个问题**：A哪里花钱最多(定位,单源能解)、B这笔花费该不该管(价值判定,单源结构上解不了,需参照系)。详见 [../memory/philosophy.md](../memory/philosophy.md) 第四/五/六节。

| ID | 需求 | 来源 | 状态 |
|----|------|------|------|
| **BK-20 单源三维热点判定 + 诚实标注能判/判不了** | ✅ **DONE（WT-004，2026-07-11 验收PASS）**：narrative-types 加可选 `dimensions`(absoluteCost/shareHigh/outlier)+`judgability`(judgable/needsBaseline/needsDomainKnowledge)+顶层 `judgmentBoundary`(canJudge/cannotJudge)；narrative-prompt 加三维显式标注写作纪律+判定边界诚实声明+降级链逻辑(有知识用知识→有基线用基线→通用三维+诚实标注判不了)。renderer 向后兼容(新字段可选)。**内核隐式三维→显式化+诚实边界完成。** 真实报告效果待整体重跑探索验证。原描述：把单源"热点判定"从单靠耗时排序升级为三维定位并诚实标注 | 用户困扰拆解(本轮)/Charter F8 | ✅ DONE |
| **BK-21 回归哨兵(单源自动对标历史基线)** | 把"哪里烫"升级成"哪里**开始**烫了"。用户**早已在diff模式手动做**(报告里"ArmyLineMgr 0.02→2.84ms +16594%🔴"就是雏形)。回归哨兵=每次分析自动跟该场景历史基线比、自动报变化,**单源模式也能有**。"涨3倍"可采纳性极高(不需业务知识就成立的强信号)。天然依赖跨run记忆(BK-LOOP),是"agent loop>作文机"最有说服力的证明 | 用户Q3(本轮)/回归哨兵讨论 | ⬜（依赖BK-LOOP,框架后做） |
| **BK-22 清理prompt业务词·提升F2纯度** | explore-prompt 里混入了游戏专属业务词作举例：第241行 finding title 示范用了`'行军线模块每帧常驻开销'`(AOEYZ专属)，第119行候选清单举例含"相机"等。虽是**举例/示范非硬编码逻辑**(发现机制仍数据驱动:ArmyLine/YzEntity 都是从榜单扫出来的,非名字命中),但业务专属词写进prompt降低了F2「自由发现·不预设盯防名单」的纯度(违反DR-2废白名单精神)。**修:业务专属词(尤其"行军线")换成纯通用类别或占位符;通用引擎概念(GC/渲染/UI)可保留因任何游戏都有**。低成本、纯prompt改动 | 用户本轮追问(相机/行军线是否写死) | ⬜ P1候选 |
| **BK-25 报告图文流 + 调用树聚焦** | 当前 HTML 已有 narrative+调用树，但体验仍像"大段文字 + 一棵原始调用树"。调用树即使不截字，也存在**信息冗余、重点不明**：例如 `600帧全超预算` 下展示 PlayerLoop 大树，读者看不出重点在哪里。需求：报告从"文字后贴树"升级为**图文流**：按结论选择合适可视化（总账用贡献拆分/小型瀑布或Top contributors，不贴完整 PlayerLoop；单热点用聚焦 hot path；低价值分支折叠/弱化；每棵树有"为什么看这棵树/看哪几行"的标注）。验收：用户不用读完整树，也能在第一眼知道关键路径、贡献比例、下一步动作。**2026-07-14 升级为 P0**：WT-021 返工二次打回，用户指出"文字一大段、信息难分辨、缺图文穿插"。DR-41 已沉淀报告层五条硬规则，BK-25 对应规则 4（图文穿插四段式）。拆入 WT-023 执行。 | 用户 2026-07-13/07-14 report.html review | 🔴 P0（升级） |
| **BK-26 热点模块归并（top 列表 child 不重复）** | **2026-07-14 新增**：WT-021 返工红线矩阵 top 8 里 6 行是 URP 子树不同层（Render/CameraStack/SingleCamera/AfterRendering/Submit/WaitForPresent），顶部结论 #3/#4 也是同一模块。之前只沉淀了"剥洋葱防重复计数"（lessons-learned #1/#2），没沉淀"top 列表 child 归并"。DR-41 规则 2 补上：top 列表（红线矩阵/顶部结论/ROI）必须做子树归并——若模块 A 的 parentChain 包含模块 B，且 B 已在列表，A 不单独成行。归并用 parentChain 包含关系，不硬编码业务知识。拆入 WT-023 执行。 | 用户 2026-07-14 WT-021 返工二次打回 | 🔴 P0（新增） |

---

## 📥 数据需求池（DataRequest，采集/数据层需求，详见 PRISM-DATAREQUESTS.md）

| ID | 需求 | 优先级 | 状态 |
|----|------|--------|------|
| **DR-POOL-1 per-marker GC分配** | 从 .data 抽每个 marker 的 GcAllocBytes（定位"哪个函数造垃圾"），需改 Unity 导出器 C# + 扩 pdata schema。**用户明确担心会被遗忘——已在册,不会丢** | 中 | ⏸ |
| DR-POOL-2 marker 调用者/负载分布 | YzEntity 单次消息实体数等 | 中 | ⏸ |
| DR-POOL-3 逐帧 drawCall | 有 batches 替代 | 低 | ❌wontfix |
| DR-POOL-新 | Lua 函数级耗时(D5)、待卸载队列深度(D2)、GPU侧时间(D4)——本轮探索新产出，**已由 BK-3 自动汇总入池**(web/data/prism-datarequests-pool.json + ../../web/data/prism-datarequests-auto.md，5条复现2次) | 中 | ✅自动 |

---

## 🧭 硬边界与已知天花板（不是待办，是常识，防重复踩）
- **单 Unity 深度天花板**：pdata 无埋点处（如 OutSideViewArmyLineMgr 只到 CalculateVertexJob）单源到头，需 simpleperf 补 native 级（RefreshLine/ToNativeList 那种）。非分析能力问题。
- **源码不能替代缺失耗时数据**：源码只解释"为什么"，不能凭空造出 pdata 没有的耗时；marker 粗+源码细=脑补风险。
- **成本**：自省+下钻更强但更慢更贵（BK-7）。

---

## 📌 新增需求（本轮用户 review P0 demo 报告）

| ID | 需求 | 来源 | 状态 |
|----|------|------|------|
| **BK-12 建议可采纳性(接源码F5)** | **当前最本质短板**：建议多是"降频/缓存/批量"套话，因为 Prism 只有perf数据没代码。热点已能钻到符号(PostCameraMoveScale/OnDirtyCallback)→拿符号检索真实函数体→建议从"考虑降频"变"这函数第X行每帧遍历全部单位、缩放没变时结果不变、可缓存"。护栏(DR-25)：只在marker锚定到够小符号+源码已检索时才准对代码发言,防脑补。**让建议从猜测变"指着代码说",最高杠杆** | 用户Q2/CharterF5 | ⬜ P0候选 |
| **BK-13 正式报告网页化** | 正式报告=网页,只显示"数据本身(调用树/帧分布等可视化)+优化建议",藏起技术论证/证据链(那是审计底稿)。参考旧作文机的高可读展示(ASCII调用树/表格/颜色)。属F6呈现层打磨,核心方向确认后做 | 用户Q1/CharterF6 | ⬜ |
| **BK-14 建议实化的其它杠杆** | ②跨源补盲区(simpleperf拆ArmyLine的RefreshLine等native细节,F7) ③历史diff给基准("比上版涨3倍=回归,查最近改动"可采纳性极高) ④场景知识库(判断批量增删在压测是正常还是bug) | 用户Q2 | ⏸ |

**清醒边界**：接源码后建议会具体得多，但 Prism 仍是"基于perf证据+代码阅读的高质量假设"，非"编译验证过的确定方案"。
达到"资深工程师看着profiler+代码给建议"水平，做不到"帮你改好并验证"。预期要摆正。

---

## 📌 BK-12 状态更新 + follow-up（本轮）

- **BK-12 接源码 getSourceForSymbol** → ✅ 完成并验证：建议从套话变"读过代码的判断"（"不建议改，已有三层节流"），
  且 LLM 会诚实识别工具给的错源码、拒绝脑补。codegraph(918MB图谱)+map-source 双路。prompt工具⑩+建议纪律已接入。
- **BK-12b 修同名歧义** ⬜：getSourceForSymbol "多个同名挑最小函数"兜底策略错误（Lua裸名OnCameraMove命中5个、
  解析到空函数）。改为 map-source消歧失败时返回 ambiguous+候选列表，不硬选。低成本修，优先级中。
- **观察**：Lua profiler 按裸函数名采样(不带类名/文件)，导致部分符号无法唯一定位真实调用者——
  需调用栈/线程时间线工具(BK-6 traceWaitChain 或新工具)配合。这是数据侧特性，非纯工具bug。

---

## 📌 三工序修复（回应用户严判 DR-35/36，报告仍不如作文机）

- **根因三·源码定位(BK-12b)** ✅：getSourceForSymbol 改文件路径锁定。验证 OnUpdate 从466碰撞垃圾→精确定位真实方法体(223-297)。命门通了。
- **根因一·覆盖广度** ✅prompt：加"第0步系统扫描建候选清单 + 第6步收尾回扫强制检查"，防"钻深一条漏掉一片"(TServer/Lua三Mgr/波动之前全丢)。
- **根因二·报告文案分离** ✅renderer：①finding加title字段(独立短标题，不再截断结论)②技术论证/自审/证据链移出report.md到report-audit.md③正式报告只留 数据+人话建议+调用树。
- **待验证**：三工序修完的完整报告(run bg1masgz4)。**Claude不再自评超没超，逐条并排作文机给用户判(DR-36)。**
- **仍欠**：BK-7探索慢(几十分钟vs作文机几分钟)；BK-4客观质量清单/金标(治报告质量+治Claude判断不可靠，双重作用)。

---

## 📌 HTML报告 + 线程/URP根因(本轮 review 2026-07-09 HTML叙事版)

- **HTML叙事版报告** ✅：路B(分析师写narrative.json→renderer渲染)。叙事流+彩色火焰条调用树(7棵真查)+审计信息0泄漏。用户认可"核心内容ok"。
- **BK-15 收敛偏见修复(线程感/URP反复丢失的真因)** ⬜ 高优先：DR-40查实——探索查了线程(13次)和URP整树,但"写findings"环节系统性偏向主线程、把线程账/跨线程等待/URP父树当噪音丢了。这是结构性偏见,是用户反复提却没解决的根因。修:①finding允许线程级/子树级发现不只marker级 ②收尾回扫加"查过的线程/URP整树写进报告了吗" ③narrative工作线程分群必须落实探索所见。
- **BK-16 源码归因找不到(专项)** ✅ **DONE（WT-002，2026-07-10 验收PASS）**：给 `getSourceForSymbol` 加可选 `callStack` 入参——裸名符号在 codegraph 命中多个同名候选时，用调用栈祖先反查 `edges(kind='calls')` 调用者取交集，**恰好唯一才收敛**，否则诚实 ambiguous（护栏不破）。新增 `resolvedVia:'callstack-disambiguated'`。实测 `GetRootPanel`(1688候选) 靠祖先 `FindComplexPathToLastContainer` 精准定位。**遗留**：Lua 调用边覆盖率仅 4.9%（3323/67917），对大量无调用边的 Lua 裸名仍救不回——提升命中率需补 Lua 调用边数据/叠加运行时调用树，留里程碑节点议。BK-12b 文件路径锁定此前已修。
- **BK-17 HTML结构美化** ✅ **DONE（WT-001，2026-07-10 验收PASS）**：加目录/章节导航;主题群按序号循环上色;§0空正文修复(md版改用narrative.topConclusions)。用户明确提的HTML结构问题。
- **仍欠**：BK-7探索慢(41分钟);BK-4客观质量清单。

---

## 📌 脑图重整 + 并入手记.smm（2026-07-09 新会话交接）

- **PRISM-BACKLOG-MINDMAP.md 重整** ✅：改为**按能力域分类**（A单次质量/B呈现/C质量回路/D进化框架/E数据采集/F多源/G成本），不再按发现时间流水。加「优化思路溯源表」证明手记里那些零碎设计原则（写作文到分析师①②③④/金标体温计/非冗余20%/三层驱动…）**已全部固化进 CHARTER F1-F8 + RATIONALE DR-1~40**，是坐标系非待办，不占 backlog。
- **并入用户手记 `K:\AI\CPU性能数据分析平台.smm`**：逐条比对「优化思路·待做需求」「分析能力」节点，绝大多数已在册（报告质量→BK-1/2/15/16/17、源码→BK-12/16、网页→BK-13/17、per-marker GC→DR-POOL-1、agent loop→BK-LOOP）。**唯一真空缺 → 新增 BK-18 自动采集流程**（见 P2 表）。分析算法「洋葱剥离+同父类合并/真业务模块非泛阶段」判定已被 queryMarkers 全局同名聚合 + 分叉点检测(DR-19) 覆盖，标"待验证"不新增。

---

## 📌 M1 Gap 分析校准（2026-07-10，据 2026-07-09 报告实测）

> 详见 `../state/m1-gap-analysis.md`。**校准了 backlog 旧描述——避免照过时描述做重复功。**

- **BK-15 线程/URP** 🟡 **降级**：实测这版 HTML **已有**"工作线程分群+跨线程等待因果"（LuaMtGc拖累主线程100%重叠）。核心已兑现，残留=Job.Worker/Submit账复核 + 等待链深挖(并入BK-6)。**不再是P0命门，需先验证覆盖再决定小修。**
- **BK-16 源码归因** ❌ **实测最硬真缺，升为M1首要**：报告自己承认"OnCameraMove ambiguous 5候选无法给行级建议"。
- **BK-20 三维判定** 🟡：内核已隐式用(按贡献度排+辨伪)，缺显式标类+"能判/判不了"诚实声明。
- **BK-17 HTML美化** ✅ **DONE（WT-001）**：目录导航(6锚点一一对应)+主题群按序号上色+§0空正文修复，均已验收PASS。
- **bug B-A** ✅ **FIXED（WT-001）**：md版§0改用 narrative.topConclusions 渲染(problem+【kind】+contribution)，回退 verdict.primaryDrivers。每条主因下有实在正文。(B-B 误报已撤销。)
- **开工顺序校准**：原"BK-15打头"→改为**先BK-17+B-A修复(纯前端跑顺流程)✅，再BK-16(最硬真缺)**。WT-001 已 DONE，下一张 WT-002=BK-16。

---

## 📌 perfetto 报告对标 v5.3 · 模板注入断链修复 + 内容厚度差距（DR-45 · 2026-07-16）

> **触发**：2026-07-16 用户对比 Prism perfetto 报告与 v5.3 标杆（`docs/report/performance-report_perfetto_ULTIMATE_v5.3.md`），指出"报告框架有了但内容厚度差一截"。诊断见 DR-45（rationale.md）。
>
> **已完成（WT-029，本轮）**：DR-45 三处断链修复——`resolveReportTemplate` return '' 短路→真读模板；`report-pipeline.ts` perfetto `reportTemplatePath: null`→填路径；`render-html.ts` perfetto callTree 走错工具（drillDownMarker/sqlite）→改读 perfetto-profile-summary.json + 名字归一化模糊匹配；扩 `narrative-types.ts` + `render-html.ts` 5 个可选视觉资产字段（metaInfo/threadOverview/throttlingMatrix/redlineMatrix/asciiArt）。harness 35 PASS/0 FAIL。端到端重渲染成功（7 sections / 6 callTree / 65.7KB）。
>
> **但对照 v5.3 仍有 4 个内容厚度差距**（用户 review 后诊断）：

| ID | 需求 | 来源 | 状态 |
|----|------|------|------|
| **WT-030 差距1·markdown 表格渲染** | render-html 的 `section.intro` 当纯文本 `htmlEsc`，LLM 写在 intro 里的 markdown 表格显示成原始文本 `\| 指标 \| base \| cur \|`。修：intro 里的 markdown 表格/代码块解析成 HTML 表格/`<pre>`，或引导 LLM 填结构化字段（metaInfo/threadOverview 等）而非写进 intro。**render 层 bug，立刻可修** | DR-45 差距1/用户review | ⬜ P0 |
| **WT-031 差距2·多线程覆盖不全** | v5.3 §3 有 7 类线程（UnityMain/Render/RHI/LuaMtGC/ECSWorker×4/Audio/Choreographer）独立三态数据表+判定；当前报告只有 2 个（UnityMain/UnityGfxRenderS）。RHI/LuaMtGC/ECSWorker/Audio 全缺。根因：narrative-prompt 没强制"多线程宏观必须覆盖所有识别线程"。修：narrative-prompt 加引导 + findings 侧确认所有线程 sched 数据已查 | DR-45 差距2/用户review | ⬜ P0 |
| **WT-032 差距3·核心结论缺配套调用树** | v5.3 §0 三大结论每条配 ASCII 调用树/柱状图穿插；当前 topConclusions 是纯文本表格无可视化。修：扩 TopConclusionRow 加可选 `callTree`/`asciiArt` 关联，render-html 核心结论表每行下挂调用树 | DR-45 差距3/用户review | ⬜ P1 |
| **WT-033 差距4·callTree 节点缺红线标注** | v5.3 §6.2 每节点有 `🔴 单次 1.50ms 触红线`/`🟡 临近红线`/`📈 ×4.2`/`🟢 健康` 标注；当前 render-html 调用树只显示 name/ms/pct。修：扩 DrillDownNode 加 `redlineFlag`/`foldChange`/`severityTag`，perfetto 节点的 `layer` 字段 + findings 里的红线判定传递到 render 层 | DR-45 差距4/用户review | ⬜ P1 |
| **WT-034 narrative 红队回扫 + lessons 回路** | **打通 F4 跨run螺旋的 narrative 侧**：narrative 产出后加"红队回扫"环节——对照标杆检查产出差距（多线程覆盖/视觉资产填充/结论配树），差距沉淀进 `prism-memory/lessons/`，下次注入 narrative-prompt。让 narrative-prompt 从静态变自举。**这是 narrative 报告质量的决定性瓶颈**：narrative-prompt 是死的，LLM 产出决定性受它影响，不接回路就永远靠人手改 prompt。设计参考 explore 阶段已有的自我批判回合（DR-24②/DR-27） | DR-45 §二/用户"打通回路"要求 | ⬜ P0（核心） |
| **WT-035 harness 内容质量软约束** | harness [2] 节加软约束 warning：可选视觉资产字段全空/多线程覆盖不足 2 个/核心结论无配调用树/callTree 节点无红线标注。不阻塞但暴露差距，防"验收只看合规性标记"（DR-45 §8.3 教训重演） | DR-45 §三/用户"补 harness"要求 | ⬜ P1 |

**开工顺序建议**：WT-030（render bug，立刻见效）→ WT-034（核心回路，决定性）→ WT-031（多线程，prompt 引导）→ WT-032/033（schema 扩展）→ WT-035（harness 兜底）。
**验收标准**：重跑端到端后 report.html 对照 v5.3 逐项核——7 类线程全覆盖 / 表格正常渲染 / 核心结论配调用树 / callTree 有红线标注。harness 全 PASS + 新软约束 warning 为 0。

---

## 📌 长期阅读体验优化（WT-030 派生，2026-07-16 用户指示另外开单）

| ID | 需求 | 来源 | 状态 |
|----|------|------|------|
| **BK-阅读体验优化** | WT-030 的简单 markdown 解析器只支持 5 类 token（表格/代码围栏/粗体/行内代码/换行），复杂 markdown 降级为纯文本。长期需要更完整的渲染体验：完整 GFM 支持、Mermaid/流程图、交互式折叠 callTree、主题切换等。属 F6 呈现层打磨，引擎层完善后做（dev-conventions.md §五优先级）。 | WT-030 派生/用户 2026-07-16 指示 | ⬜ P2（引擎层完善后做） |
| **BK-能力回路数据源区分** | `prism-memory/capabilities/` 当前不区分数据源——所有 DataRequest 进同一目录，frontmatter 只有 `source: <runId>`，没有 `dataSource: perfetto\|unity` 字段。perfetto 缺的工具（如 sched_blocked_reason ftrace）和 unity 缺的工具（如 per-marker GC 分配）完全不同，不区分数据源注入时 explore-prompt 会拿到无关数据源的缺口。修：appendMemory 时加 `dataSource` 字段，formatMemoryForPrompt 按 explore 的 source 筛选注入。**已拆为 WT-040 工单**。 | 用户 2026-07-16 追问/WT-034 派生 | 🔄 WT-040 已开工单 |

---

## 📌 M5 多源扩展 · unity 多态接入 + 通用前置（2026-07-17 用户对齐概念后入表）

> **触发**：2026-07-17 用户提 unity diff（VG baseline vs current）需求，对齐概念后确认"diff = 2 态多态，multi = ≥3 态多态，统一叫多态，不区分 diff/multi"。同时指出 narrative-prompt/explore-prompt/模板硬写 perfetto+AOE 业务词，需要数据源无关化。
>
> **概念对齐**（重要）：
> - 单态（DR-42）：1 个样本，相对占比判定
> - 多态（DR-43 扩展）：≥2 个样本，相对倍数 + 绝对增量判定。2 态是 N=2 的多态，≥3 态是 N≥3 的多态，判定逻辑本质相同，只是 ≥3 态多了"演化趋势单调性"增强信号
> - **不新建 DR-46 diff 方法论**——DR-43 扩展覆盖 2 态即可
> - 模板文件名：`unity-multi-state.txt`（不区分 2 态还是 ≥3 态，统一一个多态模板）

| ID | 需求 | 来源 | 状态 |
|----|------|------|------|
| **WT-038 narrative-prompt + 模板数据源无关化** | narrative-prompt.txt 号称数据源无关骨架，但硬写了 perfetto+AOE 业务词（Gfx.WaitForPresent/bigCoreReach/LuaMgr/行军线等）。perfetto-multi-state.txt 硬写了 Choreographer/AudioTrack/AAudio。explore-prompt.txt 文件名没带 unity 前缀但内容是 unity 专属。修：narrative-prompt 范例改占位符 + perfetto-multi-state 清业务词 + explore-prompt.txt 重命名为 unity-explore-prompt.txt + 新建 unity-single-state.txt 模板。**unity 多态接入的前置**。 | 用户 2026-07-17 追问"unity 提示词为什么在通用 txt 里" | ⬜ P0（通用前置） |
| **WT-039 红线归并规则调整** | 当前规则"55:45 平均→统筹"是错的。新规则：判定依据改为"分布形态"（有无明显大头）+ "语义独立性"（大头是否不同模块）。URP.Render 下 6 个差不多→统筹；LuaMgr 下 BattleHeadMgr+MapSignificanceMgr 是明确大头 + 语义不同→拆出。适用所有数据源所有调用树层级。 | 用户 2026-07-17 纠正 WT-036 v5 归并判定 | ⬜ P0（通用前置） |
| **WT-040 prism-memory 加 dataSource 字段** | 当前 prism-memory frontmatter 没有 dataSource 字段，perfetto/unity/simpleperf 的 capabilities 混在一起注入。修：appendMemory 加 dataSource 参数 + formatMemoryForPrompt 按数据源筛选 + 批量给现有 79 priors+24 capabilities+10 lessons 补字段。**unity 多态接入的前置**。 | 用户 2026-07-17 追问/原 BK-能力回路数据源区分 | ⬜ P0（通用前置） |
| **WT-041 DR-43 扩展覆盖 2 态** | DR-43 当前只讲"三态演化"，补一段"2 态是 N=2 的特例"。2 态和 ≥3 态判定逻辑本质相同（foldChange + 绝对增量），只是 ≥3 态多了单调性。不新建 DR-46 diff 方法论。 | 用户 2026-07-17 对齐概念"diff 就是 2 multi 就是多" | ⬜ P0（unity 多态前置） |
| **WT-042 unity-multi-state.txt 模板** | 基于 DR-43 扩展后，写 unity 多态报告章节模板（§0-§4）。不硬写业务名 + 不写 perfetto 特有概念（降频/Choreographer/bigCoreReach）。2 态和 ≥3 态通用一个模板。 | 用户 2026-07-17 提 unity diff 需求 | ⬜ P0（unity 多态前置） |
| **WT-043 unity-explore-prompt 加多态引导** | 当前 unity-explore-prompt 是单态模式。加多态模式引导（≥2 样本对比 + foldChange + 绝对增量 + 回归判定）。2 态和 ≥3 态通用一段引导。 | 用户 2026-07-17 提 unity diff 需求 | ⬜ P0（unity 多态前置） |
| **WT-044 跑 VG unity profiler 多态报告** | 用 VG 的 unity profiler 数据（baseline vs current 2 态）跑完整三段管线，产出多态报告。依赖 WT-038/039/040/041/042/043 全部完成。 | 用户 2026-07-17 提 VG diff 需求 | ⬜ P0（unity 多态主线） |

**开工顺序建议**：
- **通用前置（并行，无依赖）**：WT-038（数据源无关化）+ WT-039（红线归并规则）+ WT-040（dataSource 字段）
- **unity 多态前置**：WT-041（DR-43 扩展，无依赖）→ WT-042（模板，依赖 038/039/041）+ WT-043（explore 多态引导，依赖 038/040/041）
- **unity 多态主线**：WT-044（跑 VG 数据，依赖 038/039/040/041/042/043 全部完成）
- **perfetto 善后**：WT-037（harness 防呆，无依赖）+ DR-43 定稿（依赖 039/041）+ DR-42 定稿（依赖 044/041）

---

## 📌 M5 善后 · 报告可读性收尾 + 架构修复（2026-07-21 WT-046 v4 验收后入表）

> **触发**：2026-07-21 WT-046 v4 验收 PASS（3 层重复根因治本），但用户提了 5 个新问题（topConclusions/§0 定位重叠 + §0 父模块摘要干瘪 + topConclusions/§0 能否合并 + topConclusions 每条图文并茂 + §3 下钻缺 #8）+ 诊断"4 个模板有作文机即时感，prompt 约束报告内容、限定问题范围"+ 问"方法论有没有沉淀给 prism agent"+ 指出"报告展示生涩文字缺图文并茂是反复陷入报告的另一个重要原因"。已沉淀 DR-50（纪律 vs 内容边界）+ DR-51（宪法层未注入运行时 LLM）。
>
> **三层架构命名定稿**（对齐工程开发口语"宪法层→规程层→执行层"，但第 3 层叫"知识层"因为 prism-memory/ 是参考资料不是执行指令）：
> - **宪法层**：不可漂移的硬规则（DR-41 五条硬规则 + DR-44 三段管线 + DR-50 纪律 vs 内容边界），约束"什么不能做"
> - **规程层**：必须遵守的执行规则（DR-45 占位符校验 + DR-48 剪枝 + DR-49 禁内容 + 单态/多态方法论），约束"怎么做"
> - **知识层**：参考资料（priors 业务模块 + capabilities 工具能力 + lessons 红队沉淀），提供"知道什么"

| ID | 需求 | 来源 | 状态 |
|----|------|------|------|
| **WT-046-v5 topConclusions/§0 定位分离 + 删作文机病硬骨架** | v4 验收后用户提 5 个新问题，核心是 topConclusions 和 §0 定位重叠 + unity-multi-state.txt 有"三大演化结论"硬骨架（作文机病）。修：A render-html.ts topConclusions 改纯表格（删 extraHTML/asciiArt/note 挂载）+ B narrative-prompt.txt topConclusions schema 改"挂载可选"（DR-50 合规，删"必须挂 callTree"）+ C unity-multi-state.txt §0 删"三大演化结论"硬骨架改"典型维度（不预设盯防）"+ §0 松绑 v3 约束（允许讲子节点名字+占比，禁止子节点 ms/foldChange/GC alloc 数字）+ D §3 下钻补 #8 偶发尖刺合集 item + E 重跑产出 v5。**图文并茂留 v6**（用户担心 v5 同时改太多维度调不过来）。 | 用户 2026-07-21 v4 验收后反馈 + DR-50 沉淀 | ✅ DONE（2026-07-21 验收 PASS，核心改动都对，FAIL C §0 ③ vs §3 下钻 ③ 重复记遗留 v6） |
| **WT-046-v6 图文并茂引导 + §0 ③ 重复修复** | v5 验收 PASS 但 §0 ③ 重复记遗留 v6。两个方向：①图文并茂引导——§1 采集元信息表加柱状图 + §2 多线程宏观表加柱状图（如 UnityMain/UnityGfxRenderS/Job.Worker msPerFrame 对比）+ §3 下钻 narrative 加因果链/子树占比柱状图穿插（不是整段文字）+ §0 8 条都配 ASCII 图（v5 §0 ① 有柱状图，要确认 8 条都有）。**注意 DR-50 边界**：只给纪律约束"每章节有 ASCII 图"不给内容约束"必须画什么类型"。②§0 ③ 重复修复——v5 §0 ③ 讲了 GC.Collect（LuaMgr 子节点）的 foldChange（4.37 倍）+ ms（70.2ms）+ GC alloc（8192 字节）+ frame 519 单帧数字，违反 v5 约束。**但用户反馈"看上去也很好"——v6 需先讨论清楚是禁 §0 讲数字还是改 §3 下钻讲更深的东西（如 callTree 路径/源码定位/是否增量 GC 溢出），避免和 §0 重复。不要急着加反例硬写**。 | 用户 2026-07-21 指出"报告展示生涩文字缺图文并茂是反复陷入报告的另一个重要原因" + v5 §0 ③ 重复遗留 | ⬜ P0（待派发） |
| **WT-048 DR-51 三层架构修复·宪法层+规程层注入运行时 LLM** | 当前架构缺陷：宪法层（DR-41/44/50）+ 规程层（DR-45/48/49）只给开发 agent 看（docs/prism/memory/），运行时 LLM 通过 `{{MEMORY_INJECTION}}` 只注入知识层（priors/capabilities/lessons）。导致 prompt 错了 LLM 跟着错（DR-51 触发事件：narrative-prompt.txt"必须挂 callTree"违反 DR-50，但运行时 LLM 没有宪法对照就跟着错）。修：在 `prism-memory/` 下加 `constitution/`（宪法层——DR-41/44/50 浓缩成 LLM 可读条目）+ `methodology/`（规程层——DR-45/48/49 浓缩成 LLM 可读条目）目录，formatMemoryForPrompt 加读 constitution/methodology，通过 `{{MEMORY_INJECTION}}` 注入运行时 LLM。**条目要浓缩**（每条 1-2 句话 + 反例，类似 lessons 格式），不能是 docs/prism/memory/ 全文复制（太长会撑爆 prompt token）。**顺手修**：narrative-service.ts:514 没传 dataSource（WT-040 遗留 bug，perfetto 报告会注入 unity priors）+ MEMORY_INJECTION_MAX_CHARS 7000→12000。工单已建：`docs/prism/process/worktickets/TODO-WT-048-dr51-three-layer-memory-injection.md`。 | DR-51 沉淀/用户 2026-07-21 问"方法论有没有沉淀给 prism agent" | ⬜ P1（工单已建，v5 验收后派发，可与 v6 并行无依赖） |

**开工顺序建议**：
- **v5 验收 DONE**（2026-07-21 PASS，FAIL C 记遗留 v6）
- **并行派发**（无依赖）：WT-046-v6（图文并茂 + §0 ③ 重复修复，P0）+ WT-048（DR-51 三层架构修复，P1）
- **WT-037 遗留 bug**（不阻塞）：harness.ts `findVisualAssetByTitle(/降频/)` 正则歧义

**验收标准**：WT-044 产出的 unity 多态报告对照标杆 diff 报告逐项核结构 + 叙事可读性，harness 全 PASS。

