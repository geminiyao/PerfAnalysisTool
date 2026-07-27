# DR-41 · 报告层方法论沉淀（WT-021 返工二次打回的根因）

> **触发事件**：2026-07-14 WT-021 返工一次后用户再次打回。返工加了多线程宏观/调用树下钻/ASCII/红线矩阵/降频矩阵，但报告仍不可读：①审计证据入口还在报告里；②顶部结论 #3/#4 是同一模块（URP.Render 和 URP.RenderCameraStack）；③红线矩阵一堆 URP（Render/CameraStack/SingleCamera 是同一棵树的不同层）；④§7 GPU-bound 和 §4 off-CPU 重复讲 GPU；⑤文字一大段掺杂数据，信息难分辨。
>
> **根因**：不是数据不全（数据层已 95%），不是结构字段缺失（v5.3 对齐字段都有了），是**报告层的叙事方法论没沉淀成可执行的纪律**——DR-29/39/40 早就钉死了"人话先行/审计剥离/按主题叙事非发现序号"，但报告脚本写的时候没人对照。**每次到"数据→报告"这一步就退化成乱码**，是因为这一层缺一个"报告层宪法"，把散落的方法论收拢成硬规则。

---

## 一、报告层五条硬规则（不可违反）

### 规则 1：报告 = 呈现层，审计 = 底稿层（DR-39/BK-13 重申）

**报告里只能有**：数据可视化（图表/ASCII/调用树）+ 人话结论 + 优化建议。
**报告里不能有**：evidence id / tool name / runId / provenance / 证据链 / 自我审查 / 技术论证 / 字段名（claim/boundary/relativeBaseline）。

**验收**：report.html 里出现 `<code>ev-001</code>` 或"证据：ev-xxx"或"evidenceIds"字样 = 不通过。
**归属**：审计信息全部沉入 `audit.json` + `narrative.json` 的 `evidenceSummary`（供核查，不进报告视图）。

### 规则 2：热点模块归并——同一子树的节点不重复出现在 top 列表（本次新增，填补空白）

**问题**：红线矩阵 top 8 里 URP.Render / URP.RenderCameraStack / URP.RenderSingleCamera / URP.AfterRendering / URP.Submit / URP.WaitForPresent 占了 6 行——它们是**同一棵渲染子树的不同层**，不是 6 个独立问题。顶部结论 #3/#4 同理。

**规则**：top 列表（红线矩阵/顶部结论/ROI）必须做**子树归并**——如果模块 A 是模块 B 的祖先（A 的 parentChain 包含 B），只保留贡献最大那个，child 归并到 parent 下展示。

**归并判定依据 = 分布形态 + 语义独立性**（WT-039 修订，替代旧的"top-2 比例"判定）：

1. **分布形态**（先判这一步）：
   - 所有子节点占比都比较小且接近（无明显大头，如某渲染节点下 6 个子 Pass 各占 ~5%）→ **统筹在父模块**，hotspot 列列前 2 个子节点，子节点不单独列
   - 有明确大头子节点（top-N 占绝大部分，其它都是小头）→ **拆出大头**，进入第 2 步判语义独立性
2. **语义独立性**（有大头时再判，由 LLM 判不是机器判）：
   - 大头之间语义不同（不同业务模块，如战斗头管理 vs 地图显著性管理）→ **每个大头独立拆出**，不列父模块
   - 大头之间语义相同（同一模块的不同阶段，如同一渲染管线的不同 Pass）→ **可统筹在父模块**，hotspot 列列前 2 个大头
3. **递归**：拆分出来的大头子节点，如果它下面还有明确大头子节点，继续按"分布形态 + 语义独立性"判定；如果它下面子节点都比较小且接近（无明显大头），就统筹在它

**关键**：判定依据**不是 top-2 比例**——占比接近但语义不同的两个大头（如 4.92% + 3.99% 是两个不同业务模块），必须独立拆出（统筹会掩盖两个独立模块各自的特性）。占比接近且语义相同的两个大头（如同一渲染管线的两个 Pass），才统筹在父模块。

**机器 vs LLM 分工**：
- 机器（红队回路）只检测 callTree 真实父子关系——即"模块 A 是模块 B 的祖先"这种结构关系
- 语义独立性（大头是否不同业务模块）由 LLM 在 narrative 阶段判断——这是 LLM 才能做的语义判断，机器做不了

**实现方向**（不硬编码）：
- 构建模块父子关系图（从 callTree 的 parentChain 动态推导）
- top 列表先按 perFrameMs 排序，然后从大到小遍历：若当前节点的祖先已在列表里，跳过（或合并到祖先的"子热点"里）
- 输出格式：`URP.Render（含 RenderCameraStack/RenderSingleCamera/AfterRendering/Submit/WaitForPresent）` 一行，而非 6 行

**验收**：红线矩阵里同一棵子树的节点不超过 1 行（child 放在"子热点"列或折叠详情里）。

### 规则 3：报告结构 = 宏观 → 各线程汇总 → 下钻详情（DR-39/DR-40 重申，非 findings 罗列）

**正确结构**（自顶向下，漏斗式）：
```
§0 结论先行（3 条独立结论 + ASCII 图穿插，不是一大段 overview）
§1 采集元信息（一张表：帧数/fps/p50/温度/binder）
§2 多线程宏观（所有线程三态健康度表 + 一句话定位）
§3 主线程 off-CPU 归因（byState + wait slice 重叠 + ASCII 状态分布 + ASCII 因果链）
§4 降频时序（per-CPU + 形态 ASCII + 判定矩阵）
§5 主线程一帧时间去向（callTree 缩进树 + 红线矩阵 + Top 模块下钻）
§6 GPU-bound 判定（矩阵 + 结论，不与 §3 重复）
§7 ROI 优化方向（按 severity+贡献排序）
```

**错误结构**（本次返工的问题）：
- §4 off-CPU 和 §7 GPU-bound 重复讲 GPU（wait slice 重叠在 §4 讲了，§7 又讲一遍）
- findings 按 kind 罗列成 7 个 section（业务红线/GPU-bound/降频/GC/off-CPU/PlayerLoop/thermal-only）——这是**按 finding 分类**，不是**按读者认知层次**组织

**规则**：报告章节按"读者认知层次"组织（宏观→细节），不按 finding 的 kind 字段组织。findings 是素材，不是结构。

**验收**：报告章节顺序必须是 宏观→各线程→下钻，且同一结论不在两个章节重复出现。

### 规则 4：叙事 = 图文穿插，不是一大段文字（DR-29/BK-2 重申 + v5.3 对齐）

**错误**（本次返工）：
```
<p>三态主趋势：UnityMain runningPct 86.94→77.82→56.99; avgMhz 1729.5→1576.3→1324.6; 
PlayerLoop p50 16.69→30.15→45.94; bigCoreReachPct 74.9→75.6→59.2. 顶级业务热点与 
GPU-bound/降频形态见 conclusions；能力边界保留 FrameTimeline/window-only/fallback。</p>
```
——一整段、数字和文字混杂、无视觉分层、像 log。

**正确**（v5.3 风格）：
```
> 🔴 ① 主线程瓶颈形态：从 base 的"几乎全程在算"到 throttle 的"半睡型"——核心增量是等 GPU。
>
> [ASCII 柱状图：三态 Run/Sleep 对比]
>
> 关键数字：Gfx.WaitForPresent 占整 trace base 5.4% → cur 19.3% → throttle 38.1%
> （Sleep 增量几乎 100% 是等 GPU）。详见 §3。
```
——引用块 + 加粗结论 + ASCII 图 + 关键数字 + 详见 §X。

**规则**：
- 每个结论用"引用块 + 加粗一句话 + ASCII 图/表格 + 关键数字解读"四段式
- 数字必须配解读（"5.38% ← 双缓冲健康"不是"5.38%"）
- 形态演化用一句话独立成段加粗
- 禁止一整段文字里掺杂 5 个以上数字（超过就拆成表格或列表）

**验收**：报告里没有超过 3 行的文字段落（超过就拆成"结论句 + 图表 + 解读"）。

### 规则 5：人话先行，技术数字沉底（DR-29/BK-2 重申）

**反例**："throttle sleepingMs=7666.5 (byState.S.totalMs), maxWaitSlice=URP.WaitForPresent=7608.52ms (nested sum coveragePct=691.53% — use max not sum)"
**正例**："throttle 上主线程 Sleeping 39% 中约 99% 是等 GPU"

**规则**：
- 报告正文（HTML 可见部分）只用"人话 + 关键数字"
- 技术细节（字段名/计算口径/coveragePct 公式）沉入 `narrative.json` 的 `findings[].claim` + `boundary`（供审计）
- `humanNarrative` 字段必须渲染到 HTML 正文最显眼位置，`claim` 折叠或不显示

**验收**：report.html 正文里出现 "byState.S.totalMs" / "coveragePct" / "foldChange=9999" 这种字段名 = 不通过。

---

### 规则 6：callTree 渲染必须三重剪枝（DR-48 新增，2026-07-20）

**问题**：WT-044 跑 unity 多态报告，callTree 全展开 4695 tree-row，report.html 2.1MB，读者看不出重点。全树 dump 不是"图文穿插"——是"把所有细节塞给读者"，违反规则 4 的"聚焦"要求。

**规则**：render 层 callTree 必须三重剪枝：

| 剪枝维度 | 常量 | 作用 |
|---|---|---|
| 深度剪枝 | `MAX_TREE_DEPTH ≤ 8` | 超过 8 层的子树不展开（防深度爆炸） |
| 阈值剪枝 | `MIN_MS_PER_FRAME ≥ 0.05` | 单帧 < 0.05ms 的节点折叠（防小节点噪音） |
| 宽度剪枝 | `TOP_PER_LEVEL ≤ 8` | 每层只保留 top 8 节点，其余折叠成"其它 N 个节点"（防宽度爆炸） |

**红线例外**：触红线的节点（foldChange ≥ 2 或 perFrameMs 占 p50 ≥ 5%）即使不满足剪枝阈值也保留——剪枝不能剪掉重点。

**数据源无关**：perfetto/unity/simpleperf 都走同一套剪枝逻辑（在 `render-html.ts`，不在 provider 层）。不能假设数据源已剪枝——perfetto provider 层已剪枝，unity 没剪枝，render 层必须自己剪。

**验收**：
- harness 必须有 tree-row 上限断言（每棵 callTree tree-row ≤ 200）。WT-045 已加 [3i] 断言。
- report.html 里 callTree 区块不超过 200 行/棵——超过 = 剪枝没生效或数据源退化。

**Why**：render 层全展开 = 把所有细节塞给读者，读者看不出重点。WT-024 §5.2 早就识别"节点太多+没剪枝"但延后没做，因为没有 harness 断言逼着做。剪枝必须三重——只剪深度不够（宽度爆炸）、只剪宽度不够（深度爆炸）、只剪阈值不够（重要节点被剪掉）。三重剪枝 + 红线例外，才能既剪枝又保重点。

---

### 规则 7：prompt 约束只给纪律，不给内容——禁止预先规定结论数量/类型/挂载（DR-50 新增，2026-07-21）

**问题**：WT-046 v4 验收后用户诊断"4 个模板有种作文机的即时感，prompt 有种约束报告内容、限定报告问题范围的嫌疑"。诊断发现 4 个模板里 unity-multi-state.txt 有作文机病——"三大演化结论（①最大涨幅 ②新出现 ③退化形态）"硬骨架预先规定结论类型，LLM 即使数据里没有"新出现瓶颈"也得硬凑。主 agent 自己也重蹈覆辙——建议"topConclusions 从 8 减到 5"（预先规定数量）+ "critical/high 必须挂 callTree"（预先规定挂载）。

**规则**：prompt 约束只给"纪律"（怎么写），不给"内容"（写什么）：

| 约束类型 | 例子 | 判定 |
|---|---|---|
| 纪律（怎么写，OK） | 不许用字段名 / 不许用"吻合"风 / 不许硬编码业务名 / 不许用 ├─/└─ 缩进树 / 不许讲子节点 ms 数字 | ✅ 允许 |
| 内容（写什么，作文机病） | 必须写 3 条 / 必须按①②③产出 / 必须挂 callTree / 必须 ≤5 条 | ❌ 禁止 |

**具体禁止**：
- ❌ "写 3 条" / "必须 ≤5 条" / "必须 = topConclusions 数量"（预先规定数量）→ ✅ "按对整体贡献排序，每条必须带 dimensions + judgability"（纪律约束）
- ❌ "三大演化结论：①最大涨幅 ②新出现 ③退化形态"（预先规定结论类型）→ ✅ "典型维度（从 findings 自然浮现，不预设盯防）：主线程瓶颈形态 / 业务侧涨幅 / 降频形态"（参考，不是约束）
- ❌ "critical/high 必须挂 callTree 或 asciiArt"（预先规定挂载）→ ✅ "critical/high 可以挂 callTree 或 asciiArt（有就挂，没有不硬挂）"

**4 个模板诊断结果**：
- perfetto-multi-state.txt / perfetto-single-state.txt / unity-single-state.txt：✅ 健康（用"典型维度，不预设盯防"）
- unity-multi-state.txt：❌ 作文机病（用"三大演化结论"硬骨架）——必须改成"典型维度（不预设盯防）"

**Why**：prompt 约束的目的是让 LLM 产出高质量报告，但约束写过头就变成作文机。DR-25 沉淀过"作文机 v5 的硬伤是业务名+阈值+章节模板全人工写死"，Prism 的三段管线是真的（findings+narrative 都是 LLM 产的），但 prompt 约束层有作文机病残留——预先规定结论数量/类型/挂载，让 LLM 退化成"按模板填空"。unity 调试比 perfetto 调试花更长时间的根因之一就是 unity-multi-state.txt 有"三大演化结论"硬骨架。

**验收**：
- harness 加"prompt 作文机病扫描"断言——grep 模板文件里的"必须写 N 条" / "三大演化" / "必须挂 callTree" / "必须 ≤N 条"等硬约束，命中 = FAIL。
- 主 agent 人眼验收：打开模板文件看 §0 约束是"典型维度（不预设盯防）"还是"三大演化（硬骨架）"——前者健康，后者作文机病。

---

## 二、为什么反复踩坑（结构性原因）

1. **方法论散落**：DR-29/39/40 在 rationale.md，BK-13 在 backlog.md，lessons-learned 在 skill 目录，perfetto-report-template 在 skill 目录——**写报告脚本时没人对照**。
2. **F2 张力**：charter.md F2 说"报告结构跟着 findings 走，不套 §0-§9 模板"——被误读为"findings 罗列就是结构"。实际 F2 的本意是"热点从数据浮现不预设盯防名单"，不是"报告按 finding kind 分节"。
3. **验收只看字段存在**：tools.test.ts 只断言"narrative.json 有 overview 字段""findings >= 10"——不检查可读性/结构/归并。需要加"报告层五条硬规则"的自动化检查。
4. **数据→报告这一步缺中间层**：findings 是"一marker一finding"结构，但报告需要"跨线程/子树/主题"组织。缺一个"narrative 组织层"把 findings 重新按读者认知层次编排。

---

## 三、本次新增沉淀（填补空白）

- **规则 2（热点模块归并）**：之前只有"剥洋葱防重复计数"（lessons-learned #1/#2），没有"top 列表 child 不重复"。本次补上。
- **规则 4（图文穿插四段式）**：之前 DR-29 只说"人话先行"，没说"引用块+ASCII+数字+详见"四段式。本次从 v5.3 提炼。

---

## 四、执行约束

- 本 DR 是报告层的"宪法"，所有报告脚本（perfetto-report-mvp.ts / 未来 unity-report / simpleperf-report）必须对照执行。
- 验收报告类工单时，主 agent 必须逐条对照五条硬规则，不能只看字段存在。
- 写报告脚本前，先读本 DR + v5.3 标杆报告。
