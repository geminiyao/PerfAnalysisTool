# Prism 开发协作约定（Dev Conventions）

> 本文件收拢"开发 agent 应该知道但容易漏"的协作约定，和 charter/philosophy/rationale（设计决策）不同维度——这里是**开发执行层的纪律**。
>
> 读者：任何接入 Prism 开发的 agent（CodeBuddy / Cursor / Claude Code 等）。**开工前必读**。
>
> 维护：用户确认的协作偏好 + 反复踩坑的教训。只增不改，新条目追加。

---

## 一、角色分工

主 agent（需求管理负责人）+ 开发 agent（施工）分工：

- **主 agent**：定义需求、验收标准、工单、验证计划；不直接写代码（除非小修复或用户许可）
- **开发 agent**：按工单施工，输出代码 + 测试
- **施工通道**：用户提供了 `docs/prism/process/scripts/dispatch-ticket-codebuddy.ps1`，可作为替代施工通道
- **验证**：开发 agent 产出后，主 agent 独立验证（对照标杆，不只看测试 PASS）

**Why**：用户明确"主 agent 是需求管理和规划负责人，不应亲自开发"。开发 agent 产出质量需独立验证（DR-36：Claude 自评不可靠）。

---

## 二、报告产出环节的时间纪律

报告产出（数据→findings→narrative→report.html）反复返工时间成本极高。**报告类工单不能只做点状修复，必须同时沉淀方法论（DR）+ 可复用工具（report-utils）+ 自动检查（test）**。

- 新数据源接入前，先确认报告层方法论是否覆盖（单态/多态/跨源对齐）
- 判定层用相对值（占 p50 百分比 / 单次 vs vsync 周期 / foldChange），不硬编码绝对阈值
- 叙事层区分"演化型"（多态）和"当前态型"（单态）两套模板，都沉淀
- 每次报告产出都要对照标杆报告逐项核结构 + 叙事可读性，不能只看"字段存在/测试 PASS"

**Why**：WT-021 返工两次、WT-023 报告层重构、WT-024 质量二期、perfetto 三段管线偏离——每次都在"报告怎么写"上花大量时间。根因是方法论散落 + 可复用工具没沉淀 + 验收只看机械指标。

---

## 三、报告验收标准

验收报告类工单时，**必须对照标杆报告逐项核**：

1. **报告结构完整性**：多线程宏观 / 调用树下钻 / ASCII 可视化 / 红线矩阵 / 降频矩阵等核心章节是否都有
2. **叙事可读性**：claim 是 log 风（"sleepingMs=7666.5 (byState.S.totalMs)..."）还是人话（"cur 上主线程 Sleeping 20.4% 中 94.5% 是等 GPU"）
3. **三段管线完整性**：findings.json（explore LLM）→ narrative.json（narrative LLM，无审计字段）→ report.html（render 纯代码）三段都走了
4. **无硬编码**：无业务名清单 / 绝对阈值 / 死模板写死在代码里
5. **自动检查通过**：DR-41 五条硬规则自动检查（tools.test.ts [16] 节）全 PASS

**Why**：WT-021 验收时主 agent 只检查"字段是否存在"（199 PASS/0 FAIL），就判定 PASS 并宣称"追上作文机 v5"。用户对照 v5.3 后指出报告差距大。验收失误导致返工。

---

## 四、报告可读性偏好

- 不要"一大段文字 + 一棵调用树"——要图文穿插的阅读流
- 调用树要**有焦点**：强调 hot path / top contributors，折叠低价值分支，标注"为什么展示这棵树"
- 不要 raw 全树 dump——用聚焦子树 + 摘要可视化
- 节点标签不要截断，子节点要完整呈现

**Why**：用户反馈报告"像一大块文字 + 一棵调用树，阅读流不顺畅"，调用树"太冗余，看不出重点"。

---

## 五、引擎层优先级

用户当前优先级：**引擎层完善程度 > 报告视觉打磨**。

- 提议下一步工作时，引擎能力排前面：三回路、回归基线/diff、工具/字段扩展、源/profiler 映射、成本治理、自动摄入
- 纯报告 UX 项（如 BK-25）放 backlog
- **但**：新数据源（如 perfetto）的 `explore → narrative.json → report.html` 全流程是**引擎回路验证**，不是纯打磨——它证明该源不再只是"summary 转 text"，可以提前

**Why**：用户明确"视觉流优先级不高，更关心引擎层完善程度"。

---

## 六、严禁硬编码（作文机硬伤）

- **query 层**：不许只查固定业务模块名清单，按数据轴通用筛选
- **阈值判定**：不许写死绝对阈值（"单次 > 1-2ms 不合理"），用相对基线（"cur 比 base 涨 ×N 倍"）
- **叙事层**：不许套固定模板，由 LLM 根据 findings 推理生成；prompt 只给纪律不给业务词
- **知识回路**：业务模块语义走 prism-memory 知识回路注入，不写进代码
- **验收时发现硬编码 = 打回**

**Why**：作文机 v5 的硬伤就是硬编码——业务红线名、阈值、章节模板全人工写死，换游戏换场景就失效。Prism 如果也搞硬编码就退化成"另一个作文机"。

### 6.1 prompt 文件硬编码（WT-038 新增，2026-07-17）

**背景**：WT-038 诊断发现 narrative-prompt.txt 号称"数据源无关骨架"，但 few-shot 范例里硬写了 perfetto+AOE 业务词（Gfx.WaitForPresent / bigCoreReach / LuaMgr / 行军线等）。根因是"反向沉淀 v5.3"时把 v5.3 范例直接塞进 narrative-prompt，业务名一起带进来，规约没要求"沉淀时替换占位符"，harness 也不检查 prompt 文件。规约的盲区：§六 只写代码层硬编码，没覆盖 prompt 文件层。

**规则**：

- **prompt 范例不许用业务名**：narrative-prompt.txt / explore-prompt.txt / 报告模板里的 few-shot 范例，用占位符（`<模块名>` / `<子模块>` / `<等待 slice>`），不许用 LuaMgr / 行军线 / Gfx.WaitForPresent 等业务名或数据源特定词
- **数据源无关骨架不许有数据源特定词**：narrative-prompt.txt 是数据源无关骨架，grep 不到 perfetto 特有词（Choreographer / bigCoreReach / AudioTrack / AAudio / Gfx.WaitForPresent 等）
- **数据源特定模板可保留该数据源概念**：perfetto-multi-state.txt 可保留 perfetto 概念（Choreographer / bigCoreReach），但不许有业务名（LuaMgr / 行军线）
- **数据源特定 explore-prompt 可保留该数据源概念**：unity-explore-prompt.txt 可保留 unity 概念（PlayerLoop / URP / MonoBehaviour），但不许有 AOE 专属业务名（行军线 / LuaMgr / MapSignificanceMgr 等）

**Why**：v5.3 反向沉淀时把范例直接塞进 narrative-prompt，业务名一起带进来。LLM 看范例会被业务名带偏（如 unity 数据源看到 Gfx.WaitForPresent 范例会困惑——unity 没有 CPU 频率概念）。教的是写法（├─/└─ 缩进 + 三态对照 + 🔴/🟡 标注 + 大头拆出），不是名字。LLM 看占位符也能学会写法。

**验收**：harness 加 prompt 文件硬编码扫描（grep 业务名 + 数据源特定词 = FAIL）。具体断言见 WT-038 工单。

---

## 七、报告生成必须走三段管线（DR-44 核心纪律）

**三段管线**（philosophy.md:25-32 + DR-44）：
1. explore LLM → findings.json（含 conclusion/reasoning/recommendation）
2. narrative LLM → narrative.json（含 overview/topConclusions/sections，无审计字段）
3. render 纯代码 → report.html

**任何数据源接入都必须走这三段。不允许脚本拼 narrative.json 或用 if-else 套模板写人话。**

验收自检：
1. findings conclusion 是人话还是 log 风？
2. narrative.json 有没有 evidenceIds/findingIds 审计字段？
3. 报告脚本有没有"建议单次任务削峰"这种万能套话？
4. 报告脚本有没有数据源特定判定逻辑？
5. 三段都走了？

**任一不通过 = 方向错了，停下来诊断，不要在错误基座上堆功能。**

**Why**：perfetto 阶段三段管线一段都没走（explore 脚本 No LLM + narrative 脚本拼），退化成作文机，浪费 3 天。根因是 philosophy.md 是设计文档不是可执行契约。

---

## 八、占位符填充与 narrative 结构契约（DR-45 harness 纪律）

**2026-07-16 教训**：WT-028 标记 ✅ 完成，但 `resolveReportTemplate` 硬编码 `return ''`、`report-pipeline.ts` 注册 `reportTemplatePath: null`、`narrative-types.ts`/`render-html.ts` 视觉资产字段缺失——三处断点没接，工单却"验收 PASS"。narrative LLM 拿到裸骨架交了 5 个分群卡片，报告与 v5.3 标杆差距巨大。根因是验收标准只看合规性标记（provenance=LLM/无审计字段/无套话），没验"prompt 完不完整"和"narrative 结构符不符合模板"。

### 8.1 占位符填充必须可测

任何 `{{XXX}}` 占位符的填充函数（如 `resolveReportTemplate`），**必须有测试断言返回值非空且含关键内容**。

- ❌ 反模式：`return ''` 占位 + 注释 "WT-XXX 填"——占位符被短路，注入机制形同虚设，代码不报错、管线不崩、产出还合规，就是质量差。这是**隐蔽性最强的 bug**。
- ✅ 正模式：填充函数有单元测试，断言返回值包含模板文件的关键标记（如 `tpl.includes('§0')` / `tpl.includes('ASCII')`）。

**Why**：DR-45 断链 1。`resolveReportTemplate` 硬编码 `return ''` 没人发现，因为没测试。占位符填充是 prompt 注入机制的咽喉，咽喉断了 LLM 拿到的是残缺 prompt，产出必然残缺。

### 8.2 narrative.json 结构契约校验

narrative-service 产出 narrative.json 后，**校验 sections 结构是否符合模板章节骨架**（软约束 warning，不阻塞但必须验收时检查）。

- 不匹配时打 warning："narrative.json 有 N 个 section，模板要求 M 个章节 [§0...§7]，可能 LLM 没按模板组织"
- warning 写进 `narrativeProvenance` 字段供验收查看
- **warning 必须在验收时被检查**——不能打了 warning 没人看

**Why**：DR-45 断链 2。narrative LLM 拿到裸骨架后按自由指令交了 5 个分群卡片，没人校验符不符合模板。硬约束容易误杀（LLM 可能合理合并章节），软约束 + 诊断既不阻塞管线又能暴露问题。

### 8.3 验收不能只看 provenance=LLM

`generatedBy: "LLM"` 只证明"narrative 是 LLM 产的"，**不证明"narrative 拿到了完整 prompt"**。必须端到端对照标杆核结构。

- ✅ 验收要看：sections 覆盖模板章节 / items 有 callTree.rootMarker / topConclusions 按贡献排序 / judgmentBoundary 非空 / report.html 含关键视觉资产
- ❌ 验收不要只看：provenance=LLM / 无审计字段 / 无套话 / 测试 PASS

**Why**：DR-44 §6.5 的 5 条验收全过，但报告残缺。验收只看了"合规性标记"，没开箱看货。dev-conventions.md §三已写"对照标杆逐项核"，但没执行——纪律写了不执行 = 没纪律。

### 8.4 WT 工单"完成"必须有端到端验证

开发 agent 标记工单 ✅ 前，**必须跑一次端到端管线**（不是 `--skip-explore` 的局部测试），确认产出物结构完整。

- DR-36（Claude 自评不可靠）= 开发 agent 自评"完成"不可信，必须用产出物验证
- 端到端验证 = 从 explore 跑到底，检查 narrative.json 结构 + report.html 视觉资产，不是只跑单元测试

**Why**：WT-028 标记 ✅ 但三处断点没接。开发 agent 大概是"建了模板文件 + 加了占位符 + 写了 few-shot"就认为完成了，没回头跑一次端到端验证"模板内容真的进了 LLM 的 prompt 吗"。

---

_本文件随开发实践持续追加。新教训追加为新条目，不修改已有条目。_
