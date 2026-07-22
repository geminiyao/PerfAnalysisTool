# 当前战线（NOW）— 此刻在哪、下一步干嘛

> **新会话第一个读这个。** 永远保持最新。主 agent 每做完一件事 / 快切会话前必更新本文。
> 坐标系见 `../plan/roadmap.md`（里程碑）和 `../plan/backlog.md`（需求）。
> 最后更新：2026-07-22（**WT-049 验收 PASS + WT-046 v6 部分 PASS（FAIL C 平移到 §0 ② URP，记遗留 v7）+ 下一步派 WT-046 v7**）。
>
> **WT-049 BK-7 方向 A·narrative 耗时治理 + JSON 修复回路·验收 PASS**（2026-07-22 主 agent 独立验收 DR-36）：
> - 通用 harness **207 PASS / 0 FAIL / 0 WARN**（原 199 + [2d] 节 8 条新 PASS，与自报一致）
> - perfetto 不退化 **239 PASS / 2 FAIL / 1 WARN**（2 FAIL 是 WT-037 遗留：红线清单 4<5 + 降频矩阵 0<4，与本工单无关）
> - 工单特定断言 1-8 全 PASS（timing/measure/mark=40 / attemptJsonRepair=2 / MAX_RETRIES=2 / spawnCliProcess|runLlmOnce=6 / timing|repairCount=2 / repairCount=15 / prov.timing=1 / 单元测试 34 PASS）
> - 单元测试 **34 PASS / 0 FAIL**（5 用例：正常路径 + 1 次修复 + 2 次失败 + 修复 prompt 内容 + timing 完整）
> - 人眼检查：attemptJsonRepair 函数存在（narrative-service.ts:606）+ MAX_RETRIES=2（:616）+ 修复回路调 runLlmOnce（重跑 LLM 不是脚本修复——DR-44）+ 修复 prompt 含原 prompt+错误信息+raw 片段+"完整可解析 JSON"要求 + extractErrorContext 提取 position/line:column 截取前 200+后 200 字符 + prov.timing/prov.repairCount 写入（:799-800）+ 红队回路在修复成功后继续跑（不跳过）+ narrative-types.ts timing?/repairCount? 可选字段（:98,:104）
> - 开发 agent 偏离：[2d] 节 8 条断言（工单说 7 条，2d-5 拆 2 个 assert）——合理偏离更严格 + red-team 内 fs.writeFileSync 移除统一到环节 9——合理重构 + 未真跑 narrative 验证 timing（工单说可选）——合理
> - **Timing 判断**：开发 agent 贴的 timing 是 mock LLM 数据（llm_call=1ms），不反映真实比例——工单设计局限（单元测试用 mock LLM）。timing 机制本身工作正常（10 环节字段全有值，修复时 json_repair_retry_* 出现）。**真跑 LLM 验证 timing 留 v7**——v7 重跑 narrative 时顺带看 llm_call 是否占 80%+
> - **发现 1 个非阻塞性问题（已处理）**：单元测试 red-team 回路调真实 appendMemory 污染 prism-memory/lessons/ 40+ 个 lesson-test-* 文件。已清理（真实 narrative 跑的 lessons 未受影响）。测试设计可改进点（留未来）：mock appendMemory 或让 red-team 测试模式跳过沉淀
> - 产出：narrative-types.ts（timing?/repairCount? 字段）+ narrative-service.ts（9 环节 timing log + extractErrorContext/buildRepairPrompt/attemptJsonRepair/runLlmOnce + prov 写入）+ harness.ts（[2d] 节 8 条断言）+ narrative-service.test.ts（5 用例 34 断言）
> - **遗留 v7**：真跑 LLM 验证 timing 比例 + v7 重跑 narrative 时 JSON 修复回路兜底不再"6 次才成功 1 次"
>
> **WT-048 DR-51 三层架构修复·验收 PASS**（2026-07-21 主 agent 独立验收 DR-36）：
> - 通用 harness **199 PASS / 0 FAIL / 0 WARN**（[1e] 节 E1-E8 全 PASS，~150 条断言）
> - perfetto 不退化 **231 PASS / 2 FAIL / 1 WARN**（2 FAIL 全是 WT-037 遗留：红线清单 4<5 + 降频矩阵 0<4，与本工单无关）
> - 工单特定断言 1-10 全 PASS（constitution 10 条 + methodology 8 条 + 全标 cross-source + 无业务名硬编码 + narrative-service:514 传了 dataSource + MEMORY_INJECTION_MAX_CHARS ≥12000）
> - 人眼检查：prism-memory/constitution/ 10 条覆盖 DR-41 五条 + DR-44 三段 + DR-50 三条 ✅ / prism-memory/methodology/ 8 条覆盖 DR-45 三条 + DR-48 两条 + DR-49 一条 + DR-42/43 两条 ✅ / 每条 1-2 句话 + 反例 + 正例 ✅ / explore-service.ts MEMORY_INJECTION_CATEGORIES 顺序宪法→规程→知识层 ✅ / narrative-service.ts:514 传了 { dataSource: source } ✅
> - 开发 agent 偏离声明：E7/E8 多加 2 条断言（工单"硬约束 4/5"和"验收断言 8/9/10"harness 化，强化验收）+ 未跑端到端冒烟（用 formatMemoryForPrompt 直接验证等价证明注入路径通，避免覆盖原报告产出物违反 feedback memory）——合理偏离，不算偏离
> - 产出：prism-memory/constitution/ × 10 + prism-memory/methodology/ × 8 + prism-memory.ts + explore-service.ts + narrative-service.ts + harness.ts + README.md + index.json
> - **遗留**：DR-51 验证只到 formatMemoryForPrompt 层，没跑端到端冒烟确认运行时 LLM 真的读到 constitution + methodology 块——可推迟到 v7 一起做（v7 重跑 narrative 时顺带验证）
>
> **WT-046 v6 图文并茂 + §0 ③ 重复修复·部分 PASS（FAIL C 平移到 §0 ② URP，记遗留 v7）**（2026-07-21 主 agent 独立验收 DR-36）：
> - 通用 harness **231 PASS / 2 FAIL / 2 WARN**（编码乱码是 Windows GBK 显示问题，不影响断言）
> - 2 FAIL：
>   - **[2b]** topConclusions #2 URP problem 与 §0 ② title sim=1.0（title 复述 problem，违反 v5"§0 是结论先行的叙事展开，不是 topConclusions 的复述"约束）
>   - **[2c]** §0 ② URP 与 §3 下钻 ② URP 共享 5.96ms/13.08ms（§0 讲子节点 ms 数字 + frame 453 单帧数字，违反 v5"§0 不许讲子节点 ms/foldChange/GC alloc 数字 + 具体帧单帧数字"约束）
> - 2 WARN：callTree.rootMarker 覆盖率 27% + critical/high topConclusion 挂载率 0%（DR-50 合规，挂载可选不阻塞）
> - 工单断言 1/2/4/6/7 PASS，断言 3/5 FAIL（开发 agent 自报"§0 ⑥ GC.Collect"看错下标，实际是 §0 ② URP）
> - perfetto 不退化 231/2/1（2 FAIL 是 WT-037 遗留）
> - **FAIL C 是真重复不是误报**：§0 ② URP narrative 讲了 "URP.Render 90%" / "URP.MainRenderingTransparent 28%" / "每帧 6.56→12.52ms" / "ForwardRenderPass 单帧尖峰 13.08ms @ frame 453"——§3 下钻 ② 重复同样的数字
> - **判定理由**：核心改动（图文并茂引导 + §3 下钻讲更深 + DR-50 合规）都对了；FAIL C 是 LLM 单条不稳定（v5 是 §0 ③ GC.Collect，v6 是 §0 ② URP，每次 FAIL 在不同条之间波动），不是 prompt 约束缺陷；继续重跑 v7 不是工程问题而是 LLM 产出概率问题——开发 agent 重跑 6 次只成功 1 次，5 次非法 JSON，每次 10-30 分钟，成本不可控
> - **记遗留 v7**：FAIL C 未修复，但 v7 不应该靠"重跑 narrative 碰运气"——需要 BK-7 方向 A（narrative JSON 修复回路）+ BK-4 金标集配合
> - 产出：`web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/report.html`（154.7 KB）
>
> **BK-7 方向 A 工单已建待派发**（narrative JSON 修复回路，v7 前置）：narrative-service 加 JSON 修复回路——LLM 产出非法 JSON 时，自动提取错误位置 + 反馈给 LLM 重试（最多 2 次），不是"重跑整个 narrative"。解 v6 重跑 6 次只成功 1 次的痛。1-2 天工单。用户手动派发。

---

## 🚀 下一步具体动作（新会话直接执行）

### 新会话开场指令（主 agent 进来后按这个顺序做）

1. **读完本节**：当前状态 = WT-049 验收 PASS + WT-046 v6 部分 PASS（FAIL C 平移到 §0 ② URP，记遗留 v7）+ 下一步派 WT-046 v7
2. **派 WT-046 v7 工单**（§0 ② URP 重复修复 + DR-51 端到端冒烟验证 + 顺带看真实 timing）：
   - 工单路径：`docs/prism/process/worktickets/TODO-WT-046-v7-urp-deoverlap-dr51-smoke-timing.md`
   - 派发命令：`docs/prism/process/scripts/dispatch-ticket-codebuddy.ps1 -Ticket TODO-WT-046-v7-urp-deoverlap-dr51-smoke-timing.md`
   - v7 重跑 narrative 时 JSON 修复回路（WT-049）兜底，不再"6 次才成功 1 次"
   - v7 顺带验证 DR-51 端到端冒烟——narrative prompt 真的含 ## constitution + ## methodology 块
   - v7 顺带看真实 timing——确认 llm_call 是否占 80%+（WT-049 遗留）
   - v7 不靠"重跑 narrative 碰运气"——FAIL C §0 ② URP 重复修复需要 BK-4 金标集配合，但 v7 先用 JSON 修复回路兜底稳定迭代
3. **v7 验收 PASS 后**：进入 M4 三回路填料里程碑（BK-4 金标集 + BK-21 回归哨兵 + BK-10 知识回路），见下方"M5 善后完成后后续必做需求"节

### 当前两张待派发工单详情

1. **WT-046 v6 图文并茂 + §0 ③ 重复修复**（P0，工单已建待派发）：v5 验收 PASS 但 §0 ③ 重复记遗留 v6。v6 两个方向一起做：①图文并茂引导（§1 采集元信息加柱状图 + §2 多线程宏观加柱状图 + §3 下钻 narrative 加 ASCII 图穿插 + §0 8 条都配 ASCII 图，注意 DR-50 边界——只给纪律"每章节有 ASCII 图"不给内容"必须画什么类型"）+ ②§0 ③ 重复修复（**选方向 2**：改 §3 下钻讲更深的东西如 callTree 路径/源码定位/增量 GC 溢出，不禁 §0 讲数字——用户反馈"看上去也很好"说明 §0 ③ 讲数字有价值，禁了会让 §0 失去叙事价值，v3 禁过头教训）。工单：`docs/prism/process/worktickets/TODO-WT-046-v6-visual-interspersed-section0-drilldown-deoverlap.md`
2. **WT-048 DR-51 三层架构修复**（P1，工单已建待派发，可与 v6 并行无依赖）：工单 `docs/prism/process/worktickets/TODO-WT-048-dr51-three-layer-memory-injection.md`。7 个需求——A: prism-memory.ts MEMORY_CATEGORIES 加 constitution + methodology 两类 + B: explore-service MEMORY_INJECTION_CATEGORIES 加两类 + narrative-service.ts:514 修 WT-040 遗留 bug（formatMemoryForPrompt 没传 dataSource）+ C: 建 constitution/ 10 条（DR-41 五条 + DR-44 三段 + DR-50 三条浓缩）+ D: 建 methodology/ 8 条（DR-45 三条 + DR-48 两条 + DR-49 一条 + DR-42/43 两条浓缩）+ E: harness.ts 加 E1-E6 注入路径断言 + F: README 更新四类→七类 + G: index.json 更新。MEMORY_INJECTION_MAX_CHARS 从 7000 调到 12000。**条目要浓缩**（每条 1-2 句话 + 反例，200-400 字符/条，不能是 docs/prism/memory/ 全文复制会撑爆 prompt token）
3. **WT-037 遗留 bug 小修**（不阻塞）：harness.ts `findVisualAssetByTitle(/降频/)` 正则歧义匹配"三态降频形态" ascii 图而非"降频判定矩阵" matrix。修法：正则改 `/降频判定矩阵/` 或匹配后检查 type===matrix
4. **perfetto 善后**：DR-42/43 已定稿✅，剩 WT-037 遗留 bug

---

## 🎯 M5 善后完成后后续必做需求（按 backlog 优先级）

> M5 善后（v6 + WT-048）做完后，**M4 三回路填料是下一个大里程碑**——BK-4 金标集 + BK-21 回归哨兵 + BK-10 知识回路。M3 持久大脑已通电✅，回路骨架已建，M4 是往通电的回路里灌内容让"越用越强"从口号变可观测。
>
> 完整 backlog 见 `docs/prism/plan/backlog.md`，完整 roadmap 见 `docs/prism/plan/roadmap.md`。

| 优先级 | 需求 | 说明 | 依赖 |
|---|---|---|---|
| **P0** | BK-4 金标集 + 人确认 | 质量回路"另半截"——人拍板 finding 对/错/漏 → 存金标集 → 每次改进跑金标量召回/误报。治"Claude 自评不可靠"（DR-36）。**M4 核心工单** | M3 通电✅ |
| **P0** | BK-21 回归哨兵 | "哪里烫"升级"哪里开始烫了"——自动对标历史基线报变化。**agent loop > 作文机最有说服力的证明**。天然依赖跨 run 记忆（BK-LOOP） | M3 通电✅ |
| **P1** | BK-10 知识回路 | 确认的业务归因（人点头）→ 沉淀 → 下次开局注入。老朋友直接定性省探索成本。**M4 核心工单** | M3 通电✅ |
| **P1** | BK-7 探索成本治理 | 自省+下钻让单次 103 次调用/40 分钟，更强但更慢更贵。v6 图文并茂后 LLM 产出会更慢，可能变 60 分钟，需要治理。**可能要先于 M4 做** | 无 |
| **P1** | BK-19 能力回路 run 内实时自举 | DataRequest 当场变成可执行新查询/新感官，立即挖当下数据。难度高（需 run 内安全动态生成+执行新查询），排 BK-LOOP 后 | M3 通电✅ |
| **P2** | BK-18 自动采集流程 | 打通"采集→ingest→分析触发"自动入口。是 agent loop 的数据入口。当前手工放 pdata 还能用，优先级不高 | BK-LOOP |
| **P2** | BK-9 跨源复用抽象 | unity/simpleperf/perfetto 数据轴同构，抽象成通用工具集+adapter，接新源=写 adapter 非重走流程。治用户"每源重来一遍"的头大 | M5 多源扩展 |
| **P2** | BK-24 记忆质量治理 | M3 摄入暴露的语义重复（同结论不同 finding_id 存两条）。"越用越强"与"越用越臃肿"一线之隔。属 M3 通电后质量优化，不阻塞 | M3 通电✅ |

**关键判断**：
- M5 善后（v6 + WT-048）做完后，**M4 三回路填料是下一个大里程碑**——BK-4 金标集 + BK-21 回归哨兵 + BK-10 知识回路
- BK-7 探索成本治理可能要先于 M4 做——v6 图文并茂后 LLM 产出会更慢，40 分钟可能变 60 分钟，需要治理
- BK-18 自动采集流程是 agent loop 的数据入口，但优先级不高——当前手工放 pdata 还能用
- BK-9 跨源复用抽象是 M5 多源扩展的深化，当前 unity/perfetto 两源已通，simpleperf 待接

**unity 管线特有缺失**（对照 perfetto 标杆）：
- unity 报告没有降频章节（unity 无 CPU 频率/温度概念，这是 unity 和 perfetto 模板最大结构差异，已确认不补）
- unity 报告 callTreeAnnotations 字段已加（WT-046 v1 修）
- unity 报告图文并茂 v6 修
- unity 报告 §0 ③ 重复 v6 修

**通用管线缺失**：
- DR-51 三层架构（WT-048 修）——宪法层未注入运行时 LLM
- WT-040 遗留 bug（narrative-service.ts:514 没传 dataSource）——WT-048 顺手修
- harness [2c] §0 vs §3 重复检查已加（v3 加的）
- harness DR-50 作文机病扫描已加（v5 加的）

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

1. **第二波（并行，无依赖）**：
   - WT-039 红线归并规则调整（分布形态 + 语义独立性）
   - WT-040 prism-memory 加 dataSource 字段 + 按数据源筛选注入
   - WT-037 harness 防呆（内容厚度回归 + 硬编码自举检查，perfetto 善后但无依赖）
2. **第三波（依赖第二波）**：
   - WT-042 unity-multi-state.txt 模板（依赖 038✅/039/041✅）
   - WT-043 unity-explore-prompt 加多态引导（依赖 038✅/040/041✅）
3. **第四波**：WT-044 跑 VG unity profiler 数据产出多态报告（依赖 038-043 全部完成）
4. **perfetto 善后**：DR-43 定稿（依赖 039/041✅）+ DR-42 定稿（依赖 044/041✅）+ DR-47 沉淀（开发 agent 根因分析，不阻塞）

## 刚做完什么（本次会话）

- ✅ **WT-046 v5 验收 PASS + WT-048 工单已建（DR-51 三层架构修复）**：v5 主 agent 独立验收 DR-36，核心改动都对，FAIL C §0 ③ 重复记遗留 v6。
  - **WT-046 v5 验收记录**（2026-07-21 主 agent 独立验收）：
    - **机器断言**：unity harness 81 PASS / 1 FAIL / 1 WARN + perfetto 79/2/1 不退化（2 FAIL 是 WT-037 遗留：红线清单 4<5 + 降频矩阵 0<4，与 v5 无关）
    - **工单特定断言 1/2/4/5/6/7 全 PASS**：1 topConclusions 纯表格（report.html 无 tc-tree-section/tc-ascii-section/tc-note-section 挂载，只在 CSS 注释里"已删"）/ 2 §0 items=8 = topConclusions=8 一一对应 / 4 §3 下钻 8 ≥ topConclusions crit/high/med 8 / 5 tree-section 10 ≤12 / 6 unity-multi-state.txt 无"三大演化结论"硬骨架（0 命中）/ 7 narrative-prompt.txt 无"必须挂 callTree"（0 命中 DR-50 合规）
    - **人眼检查全 PASS**：topConclusions 8 条全 callTree=NO + asciiArt=NO（纯索引表）/ §0 8 items 按 findings 自然浮现（① Update 退化 ② 相机尖峰 ③ GC.Collect ④ LateUpdate ⑤ URP ⑥ GPU bound ⑦ ECS Job ⑧ 偶发尖刺群）不是"三大演化结论"硬骨架 / §0 ① 讲清"为什么贵"（Update 涨 8.87 倍 + 大头子节点 MapSignificanceMgr 占 59.1% + 新出现）/ §0 ① 不讲子节点 ms/foldChange/GC alloc 数字（只讲占比+定性）/ §3 下钻 #8 偶发尖刺合集完整（TryUnload + YzEntityMoveLineNtf + MapSignificanceMgr.ProcessTask + BattleHeadMgr + LuaMtGc.WaitGCThread 5 个模块 + 帧号 + 单次 ms + 源码定位）
    - **FAIL C（§0 ③ vs §3 下钻 ③ 重复）真重复不是误报**：§0 ③ 讲了 GC.Collect（LuaMgr 子节点）的 foldChange（4.37 倍）+ ms（70.2ms）+ GC alloc（8192 字节）+ frame 519 单帧 70.2ms 具体帧数字，违反 v5 工单"§0 不许讲子节点 ms/foldChange/GC alloc 数字"+"具体帧的单帧数字是 §3 下钻的职责"约束。§3 下钻 ③ 也讲了同样的数字。但 v5 核心改动（topConclusions 纯表格 + §0 删硬骨架 + §0 松绑 + §3 补 #8）都改对了，FAIL 是 LLM 单条不稳定不是 prompt 约束缺陷——v5 prompt 约束已写但 LLM 在 GC.Collect 这条没遵守（GC.Collect 是单点尖峰不是稳态大头，LLM 可能觉得"父模块级摘要"就是讲 GC.Collect 自身的 foldChange）
    - **判定**：用户决定 PASS 但记遗留——§0 ③ 重复记入 v6 图文并茂工单一起处理（v6 反正要重跑 narrative）。v6 加反例"§0 不许讲 GC.Collect 子节点的 foldChange/ms/GC alloc 数字 + 具体帧单帧数字"
    - **产出**：`web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5/report.html`（127KB，6 棵真实 callTree）
    - **工单文件**：`docs/prism/process/worktickets/DONE-WT-046-v5-deoverlap-del-hardcode-skeleton.md`（已改名 TODO→DONE + 头部加验收记录）
  - **WT-048 工单已建**（DR-51 三层架构修复，TODO 状态未派发）：`docs/prism/process/worktickets/TODO-WT-048-dr51-three-layer-memory-injection.md`。7 个需求——A: prism-memory.ts MEMORY_CATEGORIES 加 constitution + methodology 两类（顺序宪法→规程→知识层）+ B: explore-service MEMORY_INJECTION_CATEGORIES 加两类 + narrative-service.ts:514 修 WT-040 遗留 bug（formatMemoryForPrompt 没传 dataSource，perfetto 报告会注入 unity priors）+ C: 建 prism-memory/constitution/ 10 条（DR-41 五条 + DR-44 三段 + DR-50 三条浓缩，每条 1-2 句话 + 反例 + 正例 200-400 字符）+ D: 建 prism-memory/methodology/ 8 条（DR-45 三条 + DR-48 两条 + DR-49 一条 + DR-42/43 两条浓缩）+ E: harness.ts 加 E1-E6 注入路径断言（constitution/methodology 目录非空 + MEMORY_CATEGORIES 注册 + MEMORY_INJECTION_CATEGORIES 包含 + narrative-service:514 传 dataSource + 条目都标 cross-source）+ F: README 更新四类→七类 + G: index.json 更新。MEMORY_INJECTION_MAX_CHARS 从 7000 调到 12000（容纳 18 条新条目）。**条目要浓缩**不能是 docs/prism/memory/ 全文复制（太长撑爆 prompt token）。所有条目标 `dataSource: cross-source`（宪法和规程跨源通用，按数据源筛选不被过滤）。v5 验收 PASS 后派发，可与 v6 并行无依赖。

- ✅ **WT-046-v3 工单已建 + DR-47/48/49 沉淀 + DR-42/43 定稿 + harness 补 §0/§3 内容重复检查**：回答用户质问"harness 为什么找不出 §0/§3 内容重复"——harness 根本没有这个检查项，已补。
  - **WT-046-v3 工单已建**（P0，已派发开发 agent）：5 个需求——A: unity-multi-state.txt 第 67 行从"禁 ├─/└─ 缩进形式"升级到"禁子节点 ms/占比/foldChange/GC alloc 内容" + B: 第 42 行加"§0 讲子节点细节"反例 + C: narrative-prompt.txt 第 226 行范例改成父模块摘要（删"主线程 → <渲染管线节点> → <等待 slice> 17.8ms"子节点细节范例）+ D: 第 252 行加"§0 不许讲子节点细节" + E: 重跑 narrative+render 到 `2026-07-20_wt046_v3/`。工单：`docs/prism/process/worktickets/TODO-WT-046-v3-prompt-template-readability-fix3.md`
  - **harness 补 [2c] 节 §0 vs §3 下钻 narrative 内容重复检查**（治本）：
    - 根因：harness [2b] 节只检查 topConclusions.problem vs §0 item.title 的文本相似度（阈值 0.9），**没有检查 §0 narrative 正文 vs §3 下钻 narrative 正文的内容重复**。所以 v1/v2 三次都是机器断言全 PASS 但人眼一看就发现重复——机器根本没在查这件事。这是 DR-45 §2.1"验收只看合规性标记"的又一次复发。
    - 修复：harness.ts [2c] 节加"§0 vs §3 下钻 narrative 内容重复检查"——提取 §0 和 §3 下钻的"数字特征串"（foldChange/ms 数字/GC alloc 数字/箭头数字），共享 ≥2 个 = FAIL。比 Jaccard 文本相似度更敏感（Jaccard 被 §3 下钻长 narrative 稀释，§0 ① 和 §3 下钻 ① Jaccard ≈ 0.075 抓不到）。
    - 双向验证通过：v2 失败案例 FAIL（抓到 §0 ① 和 §3 下钻 ① 共享 6 个数字特征串："57.88 倍"/"×57.88"/"0.069ms"/"3.994ms"/"gc alloc 0"/"0→14043"）/ v1 标杆 PASS（不误杀，§0 是父模块摘要，§3 下钻是子节点细节，共享 <2 个数字）/ perfetto v5 PASS（不退化，2 FAIL 是 WT-037 遗留与本工单无关）
    - v1 标杆从 82 PASS 升级到 83 PASS（新增 [2c] 一条断言）
  - **DR-49 沉淀**（prompt 约束"禁形式 vs 禁内容"教训）：rationale.md 加 DR-49——WT-046 v1/v2 两次打回的根因是 prompt 约束只禁形式（├─/└─ 缩进）不禁内容（子节点 ms/占比/foldChange/GC alloc 数字），LLM 换形式（柱状图/narrative 文字）绕过。v3 必须从禁形式升级到禁内容。dev-conventions.md §6.2 加"prompt 约束必须禁内容不只禁形式"检查项 + 反例比正面约束有效 + 约束+范例+反例三处一致。
  - **DR-48 沉淀**（callTree 渲染三重剪枝）：rationale.md 加 DR-48 + report-layer-rules.md 加规则 6——render 层 callTree 必须三重剪枝（MAX_TREE_DEPTH≤8 + MIN_MS_PER_FRAME≥0.05 + TOP_PER_LEVEL≤8）+ 红线例外（foldChange≥2 或 perFrameMs 占 p50≥5% 不剪）+ harness 必须有 tree-row 上限断言（≤200/棵，WT-045 已加 [3i] 节）。
  - **DR-47 沉淀**（骨架硬写根因分析教训）：rationale.md 加 DR-47——开发 agent 在 WT-038 commit `a7ddf0d` 硬写"骨架硬写根因分析"5 条根因，但没引用具体证据（代码行/commit/工单验收记录）。教训：根因分析必须基于真实证据，主 agent 复核真实性，找不到根因如实说不硬写。
  - **DR-42/43 定稿**（单态/多态分析方法论）：multi-state.md + single-state.md 状态从 DRAFT 改成 DONE（2026-07-20 定稿）。依赖已全满足：WT-041✅（DR-43 扩展覆盖 2 态）+ WT-044✅（跑 VG unity 多态报告验证 2 态方法论有效）。验证记录加进文件头部。待沉淀节里"需 WT-024/044 验证后定稿"等字样已划掉。

- ⚠️ **WT-046/047 验收打回 + WT-046-v2 工单已建**：WT-046/047 机器断言全 PASS 但人眼验收发现 §0/§3 章节重复未解决。
  - **WT-046/047 机器断言层全 PASS**：
    - 通用 harness unity 报告 82 PASS / 0 FAIL / 0 WARN ✅
    - perfetto 不退化 79 PASS / 2 FAIL / 1 WARN（2 FAIL 是 WT-037 遗留，与本次无关）✅
    - 需求 A（callTreeAnnotations）：unity-explore-prompt 5 处 / findings.json 5 处 / report.html 46 处 🔴/📈 标注 ✅
    - 需求 B（人话化）：narrative-prompt 5 处硬规则 / report.html 0 处"吻合"风 ✅
    - 需求 C（章节职责分工）：unity-multi-state.txt 6 处约束（机器断言 PASS，但人眼验收不通过）⚠️
    - WT-047 需求 A（ASCII 图铺满）：narrative.json 13 个 ASCII 图 / report.html 16 个 ascii-art-content ✅
  - **人眼验收层（DR-36 纪律）发现 WT-046 需求 C 没生效**：
    - §0 ①②③ 和 §3 下钻 ①②③ 几乎逐字重复——narrative 都含"子树大头 MapSignificanceMgr 涨 57.88 倍（0.069→3.994ms/帧），GC alloc 0→14043 暴增"这类 callTree 子树细节
    - §0 ①②③ 的 ASCII 图是 callTree 子树描述（├─/└─ 缩进 + 每节点 ms/占比/标注），违反模板第 67 行"§0 不许写完整 callTree 子树描述"
    - §0 ②③ 同样违反——narrative 重复"frame 144 的 callTree 显示 LateUpdate→LuaMgr→MapCameraCtrl 子树单帧 56.4ms"，ASCII 图和 §3 下钻 ② 几乎一样
  - **根因：prompt 内部矛盾**（开发 agent 加了约束但没改范例，约束和范例打架，范例赢）：
    - 矛盾 1：unity-multi-state.txt 第 61 行说 §0 可以用"缩进树"，第 66 行说 §0 可以用"摘要树"，第 67 行又说 §0 不许写"callTree 子树描述（├─/└─ 缩进）"——LLM 按更宽松的执行
    - 矛盾 2：narrative-prompt.txt 第 226 行范例表明确说 §0 可以用"callTree 摘要树"，第 252-259 行范例明确说"callTree 摘要树（§0 或 §3 下钻）"——把 §0 列为 callTree 摘要树的合法位置
    - "摘要级 vs 完整"边界模糊——LLM 觉得 10 行内就是摘要，结果 §0 ①②③ 全画了 callTree 摘要树
  - **WT-046-v2 工单已建**（消除 prompt 内部矛盾 + 重跑 narrative+render）：
    - 需求 A：消除 unity-multi-state.txt 自身矛盾（第 61 行删"缩进树"→"因果链" / 第 66 行删"摘要树"→"演化对照" / 第 67 行加"任何形式"消除模糊边界）
    - 需求 B：消除 narrative-prompt.txt 范例引导（第 226 行删 §0 的"callTree 摘要树"→"不许 callTree 缩进树" / 第 252 行改"只用于 §3 下钻，§0 不许用"）
    - 需求 C：重跑 narrative LLM + render（不重跑 explore，复用 WT-046 的 findings.json，5min）
    - 产出路径：`2026-07-20_wt046_v2/report.html`，不覆盖 `2026-07-20_wt046/` / `2026-07-20_wt047/` / `2026-07-20_pruned/`
    - 验收要点：§0 ①②③ narrative 不含 callTree 子树细节 / §0 ①②③ ASCII 图不含 ├─/└─ 缩进 / §0 和 §3 下钻不再逐字重复
  - **DR-49 沉淀价值**（主 agent 自己做）：WT-046 v1 的"prompt 内部矛盾"教训值得沉淀成 DR——"改 prompt 约束时必须同步改范例，约束和范例打架范例赢"。dev-conventions.md §6.1 加"prompt 约束+范例一致性"检查项
  - **DR-36 验证纪律再次生效**：开发 agent 自报 9/9 PASS 但机器断言抓不到"叙事可读性"，必须人眼验收。WT-046 需求 C 的"§0 不写 callTree 子树描述"是主 agent 人眼检查项（工单特定断言 7 明确写"由主 agent 人眼检查"），机器断言过不了这条，所以 9/9 PASS 是不完整的

- ✅ **WT-044 验收 DONE + WT-045 验收 DONE + WT-046/047 工单已建**：M5 主线验收达成，进入报告可读性收尾阶段。
  - **WT-044 跑 VG unity profiler 数据产出多态报告**（M5 主线验收）：
    - 三段管线完整跑通：explore LLM → findings.json (40KB) / narrative LLM → narrative.json (41KB, generatedBy=LLM) / render → report.html
    - 通用 harness 81 PASS / 0 FAIL / 0 WARN（首次验收 1 FAIL：render-html.ts:1376-1379 路径推算 bug，udiffRoot 用 path.dirname(dir) 错误，应为 UNITY_UDIFF_ROOT + runId）
    - 路径 bug 修复后重跑 render，10 棵 callTree 重查 → 9 OK + 1 NOT FOUND（LuaMtGc 不在主线程树，fallback 合理）
    - 独立验收通过：82 PASS / 0 FAIL / 0 WARN，§0-§4 章节齐全，narrative LLM 产出质量高（overview 人话、9 条 topConclusions 都挂 callTree、5 条 §3 下钻都有 callTree+红线+GC+源码+优化建议）
    - 产出路径：`web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_rerender/report.html`（2.1MB，callTree 全展开 4695 tree-row）
    - 遗留：WT-044 findings.json 没有 callTreeAnnotations 字段（unity-explore-prompt 缺引导，WT-046 修）
  - **WT-045 callTree 渲染剪枝修复**：
    - 根因三层：①数据层差异（perfetto 预处理已剪枝 / unity 未剪枝 3794 节点）②render 层无剪枝（unityAggNodeToDrillDown / perfettoNodeToDrillDown / renderTreeHTML 全展开递归）③WT-024 §5.2 早就识别"节点太多+没剪枝"但延后没做
    - 修复：render-html.ts 加 3 个剪枝常量（MAX_TREE_DEPTH=8 / MIN_MS_PER_FRAME=0.05 / TOP_PER_LEVEL=8）+ unityAggNodeToDrillDown / perfettoNodeToDrillDown 加三重剪枝（depth+filter+sort+topN+红线例外）
    - harness.ts 加 [3i] 断言：每棵 callTree tree-row 数 ≤ 200（防退化）
    - 通用 harness 82 PASS / 0 FAIL / 0 WARN（新断言 PASS）
    - 剪枝效果：10 棵 callTree 从 4695 tree-row 降到 317（-93%），MAX 51 行/棵（阈值 200），report.html 从 2.1MB 降到 202KB（-90%）
    - perfetto 报告不退化（WT-045 断言在 perfetto PASS，2 FAIL 是 WT-037 遗留与 WT-045 无关）
    - 产出路径：`web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_pruned/report.html`（202KB）
  - **WT-046 工单已建**（prompt+模板可读性修复，P0，待派发）：3 需求——A: unity-explore-prompt 补 callTreeAnnotations 引导段（对齐 perfetto-explore-prompt:219-232）+ B: narrative-prompt 加强人话化引导+反例（"吻合"风→人话）+ C: unity-multi-state 模板约束章节职责分工（§0 只给结论+引用 / §3 红线清单只给表格 / §3 下钻才详细展开，防重复）
  - **WT-047 工单已建**（图增强，P1，待派发）：2 需求——A: narrative-prompt 引导 LLM 在所有章节产 ASCII 图（Phase 1 必做，参考 perfetto v5 的 3 种类型：三态柱状图/callTree 摘要/因果链）+ B: render-html 加 SVG 火焰图替代 §3 的 HTML tree-row（Phase 2 stretch）
  - **用户反馈 4 个可读性问题**（WT-046/047 解决）：①callTree 节点无 🔴/📈 标注（WT-046 需求 A 修）②措辞不适合人阅读"吻合"风（WT-046 需求 B 修）③章节重复 OnCameraMove 在 4 处详细展开（WT-046 需求 C 修）④缺图大段文字不直观（WT-047 修）
  - **perfetto vs unity 模板对比**：perfetto 模板 §3+§5 分章（概览+下钻分开），unity 模板 §3 合一（概览+下钻挤一章）——unity 重复更严重的结构原因。WT-046 需求 C 加章节职责分工约束对齐 perfetto。

## 上一批会话做完什么

- ✅ **WT-042 + WT-043 验收 DONE**：M5 第三波完成，unity 多态模板 + explore 多态引导落地。
  - **WT-042 unity-multi-state.txt 模板**（新建）：
    - §0 结论先行（多态版三大演化结论：最大涨幅/新出现瓶颈/退化形态）
    - §1 采集元信息（基线/当前对照表，2 态/≥3 态兼容）
    - §2 多线程宏观（UnityMain/UnityGfxRenderS/Job.Worker，不写 AudioTrack/AAudio）
    - §3 主线程一帧时间去向（callTree 对照 + 红线矩阵 foldChange 列 + 每个红线条目下钻）
    - §4 ROI 优化方向（按 foldChange × 占 p50% 排序）
    - **不写降频章节**（unity 没有 CPU 频率/温度概念，这是 unity 和 perfetto 模板最大结构差异）
    - 红线归并用新规则（分布形态 + 语义独立性），绝对增量阈值防误判
    - 工单 6 条断言全 PASS（业务名=0 / perfetto 特有词=0 / §章节=17≥5 / 红线归并=7≥1 / 占位符=9≥3）
  - **WT-043 unity-explore-prompt 多态引导**：
    - 需求 A：加"多态 vs 单态 · 先识别态数再下判定"节（多态判定 foldChange ≥ 2 + 绝对增量 ≥ p50 的 1% 防误判；单态判定相对占比 + 相对周期）
    - 需求 B：加"多态模式·先建基线和当前两张全景地图"工具引导（对每个样本分别跑 queryMarkers/scanPeakMarkers/aggregateSubtree，对比 foldChange 找涨幅 top N）
    - 需求 C：report-pipeline.ts 加 detectStateMode(sampleCount) 导出函数；narrative-service.ts 加私有 detectStateMode(outputDir) 基于目录结构检测（base/cur/throttle 或 基线/当前 子目录 ≥2 个即多态）；resolveReportTemplate 按态数选 <source>-multi-state.txt 或 <source>-single-state.txt
    - perfetto 路径不退化（bk26b-perfetto-triad 含 base/cur/throttle → detectStateMode 返回 multi → 选 perfetto-multi-state.txt）
    - 工单 4 条断言全 PASS（多态/foldChange=15≥3 / 绝对增量=4≥1 / 业务名=0 / 路由=7≥1）
  - **WT-037 遗留 bug 发现**（不阻塞 WT-042/043，需小修）：harness.ts `findVisualAssetByTitle(/降频/)` 正则歧义匹配——wt036-v5 有两个含"降频"的 visualAsset："三态降频形态"（ascii 图）排在前面被匹配，而不是"降频判定矩阵"（matrix）。导致 A3 降频矩阵断言 actual=0 FAIL。修法：正则改更精确（如 `/降频判定矩阵/`）或匹配后检查 type===matrix。同时 A2 红线清单 wt036-v5 实际 4 行 < 阈值 5 行，是数据本身厚度问题（WT-036 v5 红线清单就 4 行），不是改动引入的

- ✅ **WT-037 harness 防呆 DONE**：双向验证通过，防呆机制有效。
  - harness.ts 加辅助函数 findVisualAssetByTitle/countVisualAssetsByType/textSimilarity/getLegacyTopLevelField/countAsciiArtCompat（兼容新+旧 schema）
  - 需求 A 内容厚度回归断言（[2a] 节，FAIL）：A1 多线程≥5 / A2 红线≥5 / A3 降频≥4 / A4 ASCII≥3 / A5 采集元信息≥8（对标 v1 标杆）
  - 需求 B 硬编码扫描断言（[1d] 节，FAIL）：B1 render-html.ts 无 perfetto 特有字段名 / B2 NarrativeReport 顶层无 perfetto 特有字段 / B3 无 visualAssetKeys 顶层字段数组
  - 需求 C WT-035 软警告升级：警告 1/2/3 升级为 assert（FAIL），警告 4（callTree 节点无红线标注）保留 warn（explore 层问题）
  - 需求 D 核心结论与 §0 不重复检查（[2b] 节，FAIL）：textSimilarity > 0.9 = FAIL。**阈值校准**：工单原文 0.7 会误杀 v1 标杆（v1 #1 sim=0.857 是领域关键词重叠），校准到 0.9 抓 v4 #3 sim=1.0 完全重复，不误杀 v1。代码注释写明校准理由
  - 需求 E（stretch）未做，留下次
  - 双向验证：v4 退化产物 70 PASS/3 FAIL/1 WARN（抓住 A1 多线程 4<5 + A2 红线 3<5 + D1 sim=1.0 重复）；v1 标杆 74 PASS/0 FAIL/0 WARN（不误杀）
  - 工单特定 4 条断言全 PASS（内容厚度=11≥3 / forbiddenFieldNames=3≥1 / findVisualAssetByTitle=1≥1 / textSimilarity=4≥1）

- ✅ **WT-040 prism-memory dataSource 字段 DONE**：113/113 条目全覆盖，筛选验证通过。
  - prism-memory.ts 加 MemoryDataSource 类型 + VALID_DATA_SOURCES + isValidDataSource + MemoryEntry.dataSource 字段
  - explore-service.ts formatMemoryForPrompt 加 filterByDataSource 筛选（无字段→包含 / ===dataSource→包含 / ===cross-source→包含 / 其它→排除）；runPrismExplore 传 dataSource；persistDataRequestsToMemory 加 dataSource 参数（新沉淀 capabilities 带数据源）
  - ingest-memory.ts 加 --data-source 命令行参数 + isValidDataSource 校验
  - 113 个条目批量补 dataSource：priors 79/79 全 unity / capabilities 24/24 按 source 字段判 / lessons 10/10 按 source+内容判（2 个报告渲染层 lessons 标 cross-source）
  - 端到端筛选验证：unity 注入 5964 字符含 PlayerLoop 不含 GPU busy/freq counter/visual-asset-empty；perfetto 注入 6074 字符含 GPU busy 不含 PlayerLoop；无 dataSource 返回全部 6888 字符（兼容）
  - prism-memory.test.ts 22 PASS / 0 FAIL

- ✅ **WT-039 红线归并规则调整 DONE**：新规则"分布形态 + 语义独立性"生效。
  - narrative-prompt.txt §257-295 红线归并规则改新规则四条；加"语义独立性由 LLM 判"引导段；范例纠正
  - perfetto-multi-state.txt §158-162 统筹与拆出互斥规则加新判定依据
  - narrative-service.ts §387 红队回路 lessonText 改新规则表述（检测逻辑不动，机器仍只检测父子关系）
  - report-layer-rules.md DR-41 规则 2 加"分布形态 + 语义独立性"+ 机器 vs LLM 分工说明
  - 端到端冒烟（wt039-verify）：红线清单 5 行正确拆出——OutSideViewArmyLineMgr 5.19% / BattleHeadMgr.OnUpdate 4.92% / MapSignificanceMgr.ProcessTasks 3.99% / BattleUIManager 2.38% / MapEntityEffectMgr 0.79%。LLM 在 narrative 里明确写"BattleHeadMgr 和 MapSignificanceMgr 语义不同，独立拆出"——语义独立性判定生效
  - 通用 harness：62 PASS / 0 FAIL / 1 WARN（不退化）
  - 工单特定断言 4 条全 PASS（分布形态|语义独立性=9≥3 / 比较平均=0 / perfetto-multi-state=7≥1 / report-layer-rules=6≥1）
  - 遗留：旧 lessons 沉淀文件仍含旧规则表述"比较平均→统筹"，但 narrative-service.ts lessonText 已改新规则，下次红队触发会沉淀新规则 lessons。不阻塞当前进度

- ✅ **WT-038 + WT-041 验收 DONE**：M5 unity 多态接入第一波完成。
  - **WT-038 narrative-prompt + 模板数据源无关化**：
    - 需求 A-E：narrative-prompt.txt 清 AOE 业务词 + perfetto 特定词（30+ 处改占位符）；perfetto-multi-state.txt 清业务名（perfetto 概念保留）；explore-prompt.txt → unity-explore-prompt.txt 重命名 + 清 AOE 业务名；report-pipeline.ts + explore-service.ts 路由更新；unity-single-state.txt 模板新建
    - 需求 F：dev-conventions.md §6.1 "prompt 文件硬编码"小节（主 agent 完成，2026-07-17）
    - 需求 G：harness.ts [1c] 节加 prompt 文件硬编码扫描（G1-G4 共 26 条 assert，FAIL 不是 warning）。**第一次验收时开发 agent 漏做需求 G，打回补做后通过**——这正是 WT-028 教训的重演（开发 agent 自报 PASS 但断点没接），DR-36 验证纪律生效
    - 通用 harness：62 PASS / 0 FAIL / 1 WARN（perfetto 报告不退化，新增 26 条 G1-G4 全 PASS）
  - **WT-041 DR-43 扩展覆盖 2 态**：
    - multi-state.md 加 2 态小节（业务涨幅/红线触发/GPU-bound/降频/叙事 5 维度 ≥3 态 vs 2 态对照）+ 绝对增量阈值防误判 + 2 态叙事结构（§0-§4 基线→当前）+ 2 态措辞模板
    - README.md 索引更新（§3.1 态数检测 + §3.2 判定方法论对照 + §3.3 叙事结构对照 + §3.4 措辞模板）
    - 工单特定断言 3 条全 PASS（含 2 态=20≥3 / 绝对增量=8≥2 / 索引=11≥1）
  - **开发 agent 根因分析沉淀**（commit `a7ddf0d`）：5 条根因分析"为什么骨架文件被硬写反复发生"——①规约只覆盖代码层没覆盖 prompt 层 ②DR-44 写了数据源无关骨架但没给可执行检查标准 ③harness 只检查代码文件不检查 prompt 文件 ④反向沉淀 v5.3 时范例直接塞进 narrative-prompt 业务名一起带进来 ⑤规约是原则导向不是可执行检查。修复方案 = 需求 F（补规约 §6.1）+ 需求 G（harness 加扫描）。**值得沉淀成 DR-47**（不阻塞当前进度，等 WT-037 perfetto 善后批次一起做）

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
- ✅ `DONE-WT-038` narrative-prompt + 模板数据源无关化（清业务词 + 清 perfetto 特定词 + explore-prompt 重命名 + unity-single-state 模板 + 需求 G harness 加 prompt 文件硬编码扫描 26 条 assert。62 PASS / 0 FAIL / 1 WARN）
- ✅ `DONE-WT-037` harness 防呆：内容厚度回归 + 硬编码自举检查（A-D 必做 E stretch 留下次。双向验证通过：v4 退化产物 70 PASS/3 FAIL/1 WARN 抓住 A1 多线程 4<5 + A2 红线 3<5 + D1 sim=1.0 重复；v1 标杆 74 PASS/0 FAIL/0 WARN 不误杀。D1 阈值校准 0.7→0.9 合理）
- ✅ `DONE-WT-041` DR-43 扩展覆盖 2 态（纯方法论，multi-state.md 加 2 态判定/叙事/措辞 + README 索引更新）
- ✅ `DONE-WT-039` 红线归并规则调整：分布形态 + 语义独立性（narrative-prompt/perfetto-multi-state/report-layer-rules 改新规则，LLM 正确拆出 BattleHeadMgr + MapSignificanceMgr 不统筹。62 PASS / 0 FAIL / 1 WARN）
- ✅ `DONE-WT-040` prism-memory 加 dataSource 字段（MemoryEntry 加字段 + formatMemoryForPrompt 按数据源筛选 + ingest-memory 加 --data-source + 113/113 条目全覆盖。unity 注入 5964 字符不含 perfetto 条目，perfetto 注入 6074 字符不含 unity 条目。prism-memory.test 22 PASS / 0 FAIL）
- ✅ `DONE-WT-042` unity-multi-state.txt 报告模板（新建模板，§0-§4 章节骨架，不写降频章节/不写 perfetto 特有概念，2 态/≥3 态通用，红线归并用新规则。工单 6 条断言全 PASS：业务名=0/perfetto 特有词=0/§章节=17≥5/红线归并=7≥1/占位符=9≥3）
- ✅ `DONE-WT-043` unity-explore-prompt 加多态引导（多态 vs 单态判定节 + 多态模式工具引导 + report-pipeline.ts detectStateMode 路由 + narrative-service.ts resolveReportTemplate 按态数选模板。工单 4 条断言全 PASS：多态/foldChange=15≥3/绝对增量=4≥1/业务名=0/路由=7≥1。perfetto 路径不退化）
- ✅ `DONE-WT-044` 跑 VG unity profiler 数据产出多态报告（M5 主线验收。三段管线完整跑通，82 PASS / 0 FAIL / 0 WARN。路径 bug 修复后 10 棵 callTree 9 OK + 1 fallback。产出 `2026-07-20_rerender/report.html` 2.1MB。遗留：findings 无 callTreeAnnotations，WT-046 修）
- ✅ `DONE-WT-045` callTree 渲染剪枝修复（render-html.ts 加三重剪枝 maxDepth≤8+minMsPerFrame≥0.05+topPerLevel≤8 + harness 加 tree-row≤200 断言。4695→317 tree-row -93%，2.1MB→202KB -90%。82 PASS / 0 FAIL / 0 WARN。perfetto 不退化）
- ⚠️ `WT-046/047` 验收打回：机器断言全 PASS（82/0/0 + perfetto 不退化 79/2/1），但人眼验收发现 §0/§3 章节重复未解决（WT-046 需求 C 没生效）。根因：prompt 内部矛盾（unity-multi-state.txt 加了约束但没改范例，narrative-prompt.txt 范例还在引导 §0 用 callTree 摘要树）
- ⚠️ `WT-046-v2` 验收打回：机器断言全 PASS（82/0/0），但人眼验收发现 §0/§3 内容仍然重复——v2 只禁"形式"（├─/└─ 缩进）没禁"内容"（子节点 ms/占比/foldChange/GC alloc 数字），LLM 换柱状图绕过。同时发现 harness 没有 §0/§3 内容重复检查项（[2b] 只查 title 相似度，不查 narrative 正文）——已补 [2c] 节，双向验证通过（v2 FAIL 抓到共享 6 个数字特征串 / v1 标杆 PASS 不误杀）
- ⬜ `TODO-WT-046-v3` prompt+模板可读性修复 v3（5 需求：A 第 67 行从禁形式升级到禁内容 + B 第 42 行加反例 + C 第 226 行范例改父模块摘要 + D 第 252 行加"§0 不许讲子节点细节" + E 重跑 narrative+render 到 `2026-07-20_wt046_v3/`。工单 `TODO-WT-046-v3-prompt-template-readability-fix3.md`。已派发开发 agent）
- ✅ `DONE-WT-046` prompt+模板可读性修复 v1（机器断言 PASS，但人眼验收 §0/§3 重复未解决，打回 v2 重做）
- ✅ `DONE-WT-046-v2` prompt+模板可读性修复 v2（机器断言 PASS，但人眼验收 §0/§3 内容仍重复——只禁形式没禁内容，LLM 换柱状图绕过。打回 v3 重做）
- ✅ `DONE-WT-047` 报告图增强（2 需求：A narrative-prompt 引导 LLM 产 ASCII 图铺满所有章节 Phase 1 必做 + B render-html 加 SVG 火焰图 Phase 2 stretch SKIP。工单 `TODO-WT-047-report-visual-enhancement.md`。机器断言 PASS，但 §0/§3 重复问题随 WT-046-v3 一起修复）
- ✅ `DONE-DR-49 沉淀`：WT-046 v1/v2 的"prompt 约束只禁形式不禁内容，LLM 换形式绕过"教训 → rationale.md 加 DR-49 + dev-conventions.md §6.2 加"prompt 约束必须禁内容不只禁形式"检查项
- ✅ `DONE-DR-48 沉淀`：WT-045 callTree 剪枝修复 → rationale.md 加 DR-48 + report-layer-rules.md 加规则 6（三重剪枝 + 红线例外 + harness tree-row≤200 断言）
- ✅ `DONE-DR-47 沉淀`：开发 agent "骨架硬写根因分析"教训（commit `a7ddf0d`）→ rationale.md 加 DR-47
- ✅ `DONE-DR-42` 单态分析方法论定稿（multi-state.md + single-state.md 状态 DRAFT→DONE，依赖 WT-044✅/041✅ 全满足，验证记录加进文件头部）
- ✅ `DONE-DR-43` 多态分析方法论定稿（同上）
- ✅ `DONE-harness [2c]` §0 vs §3 下钻 narrative 内容重复检查（harness.ts 加 [2c] 节，提取数字特征串检测，共享 ≥2 = FAIL。双向验证：v2 FAIL / v1 PASS / perfetto v5 PASS 不退化）
- ✅ `DONE-WT-046-v5` topConclusions/§0 定位分离 + 删作文机病硬骨架（主 agent 独立验收 DR-36：unity 81/1/1 + perfetto 79/2/1 不退化。工单特定断言 1/2/4/5/6/7 全 PASS。人眼检查 topConclusions 纯表格 + §0 items=8 一一对应 + §0 无"三大演化结论"硬骨架 + §0 ① 讲清为什么贵 + §3 下钻 #8 完整。**FAIL C §0 ③ vs §3 下钻 ③ 重复**：§0 ③ 讲了 GC.Collect 子节点 foldChange/ms/GC alloc + frame 519 单帧数字违反 v5 约束，但核心改动都对 FAIL 是 LLM 单条不稳定——用户决定 PASS 但记遗留 v6 一起处理。产出 `2026-07-20_wt046_v5/report.html` 127KB）
- ✅ `DONE-WT-048` DR-51 三层架构修复·宪法层+规程层注入运行时 LLM（主 agent 独立验收 DR-36：通用 harness 199/0/0 + perfetto 不退化 231/2/1（2 FAIL 是 WT-037 遗留）。工单特定断言 1-10 全 PASS。人眼检查 constitution 10 条 + methodology 8 条 + 每条 1-2 句话+反例+正例 + 全标 cross-source + 无业务名硬编码 + explore-service MEMORY_INJECTION_CATEGORIES 顺序宪法→规程→知识层 + narrative-service:514 传了 dataSource。开发 agent 偏离：E7/E8 多加 2 条断言强化验收 + 未跑端到端冒烟用 formatMemoryForPrompt 直接验证等价证明注入路径通。**遗留**：DR-51 验证只到 formatMemoryForPrompt 层，没跑端到端冒烟确认运行时 LLM 真的读到 constitution+methodology——推迟到 v7 一起做。产出 prism-memory/constitution/ × 10 + prism-memory/methodology/ × 8 + 6 个代码文件）
- ⚠️ `REVIEW-WT-046-v6` 图文并茂 + §0 ③ 重复修复·部分 PASS（FAIL C 平移到 §0 ② URP，记遗留 v7）（主 agent 独立验收 DR-36：通用 harness 231/2/2 + perfetto 不退化 231/2/1。工单断言 1/2/4/6/7 PASS，断言 3/5 FAIL。**2 FAIL**：[2b] topConclusions #2 URP problem 与 §0 ② title sim=1.0（title 复述 problem）+ [2c] §0 ② URP 与 §3 下钻 ② URP 共享 5.96ms/13.08ms（§0 讲子节点 ms 数字 + frame 453 单帧数字）。**FAIL C 是真重复不是误报**：§0 ② URP narrative 讲了 URP.Render 90%/URP.MainRenderingTransparent 28%/每帧 6.56→12.52ms/ForwardRenderPass 单帧尖峰 13.08ms @ frame 453。**判定理由**：核心改动（图文并茂引导 + §3 下钻讲更深 + DR-50 合规）都对了；FAIL C 是 LLM 单条不稳定（v5 是 §0 ③ GC.Collect，v6 是 §0 ② URP，每次 FAIL 在不同条之间波动），不是 prompt 约束缺陷；继续重跑 v7 是 LLM 产出概率问题——开发 agent 重跑 6 次只成功 1 次，5 次非法 JSON，成本不可控。**记遗留 v7**：v7 不靠"重跑碰运气"，需 BK-7 方向 A（narrative JSON 修复回路）+ BK-4 金标集配合。产出 `2026-07-21_wt046_v6/report.html` 154.7KB）
- ✅ `DONE-WT-049` BK-7 方向 A·narrative 耗时治理 + JSON 修复回路（主 agent 独立验收 DR-36：通用 harness 207/0/0 + perfetto 不退化 239/2/1（2 FAIL 是 WT-037 遗留）。工单特定断言 1-8 全 PASS。单元测试 34 PASS / 0 FAIL。人眼检查：attemptJsonRepair:606 + MAX_RETRIES=2:616 + 修复回路调 runLlmOnce（重跑 LLM 不是脚本修复——DR-44）+ 修复 prompt 含原 prompt+错误+raw 片段+"完整可解析 JSON" + extractErrorContext 提取 position/line:column 截取前 200+后 200 + prov.timing/prov.repairCount 写入 + 红队不跳过 + narrative-types.ts timing?/repairCount? 可选字段。开发 agent 偏离：[2d] 8 条断言（工单说 7 条，2d-5 拆 2 个）——合理更严格 + red-team fs.writeFileSync 移到环节 9——合理重构 + 未真跑 narrative 验证 timing（工单说可选）——合理。**Timing 判断**：开发 agent 贴的是 mock LLM timing（llm_call=1ms），不反映真实比例——工单设计局限。timing 机制工作正常。真跑 LLM 验证 timing 留 v7。**发现 1 个非阻塞问题（已处理）**：单元测试 red-team 调真实 appendMemory 污染 prism-memory/lessons/ 40+ 个 lesson-test-* 文件，已清理。产出：narrative-types.ts + narrative-service.ts + harness.ts + narrative-service.test.ts）
- ⬜ `TODO-WT-046-v7` §0 ② URP 重复修复 + DR-51 端到端冒烟 + 真实 timing 验证（v6 FAIL C 平移到 §0 ② URP，v7 用 WT-049 JSON 修复回路兜底 + 更精准反例。3 任务：A §0 加"父模块=红线清单条目，子节点 ms 不许讲"反例 + B DR-51 端到端冒烟验证 prompt 含 constitution+methodology 块 + C 真实 timing 验证 llm_call 是否占 80%+。工单 `TODO-WT-046-v7-urp-deoverlap-dr51-smoke-timing.md`。用户手动派发）

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
