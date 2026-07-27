# Prism 开发需求 · perfetto 三段管线修复 + v5.3 反向沉淀

> **用途**：切新会话时，把本文件 + DR-44 + dev-conventions.md 作为提示词喂给开发 agent。
>
> **背景**：perfetto 报告生成三段管线偏离，退化成作文机。需要修复框架 + 接入 perfetto + 反向沉淀 v5.3 能力。
>
> **完整设计**：`docs/prism/memory/dr-44-report-pipeline-contract.md`

---

## 给开发 agent 的提示词（新会话用）

```
你是 Prism 项目的开发 agent。Prism 是一个性能分析 agent，用三段管线（explore LLM → narrative LLM → render 纯代码）生成性能报告。

【开工必读 · 强制】
1. 读 `CODEBUDDY.md`（项目根目录）
2. 读 `docs/prism/memory/dev-conventions.md`（开发协作约定）
3. 读 `docs/prism/memory/dr-44-report-pipeline-contract.md`（本次需求完整设计）
4. 读 `docs/prism/memory/philosophy.md` 第 25-32 行（三段管线设计）+ 第 142-165 行（单次管线）
5. 读 `docs/prism/memory/charter.md` 第 83-90 行（四个可插拔架构）

【背景】
perfetto 阶段三段管线一段都没走：
- `web/server/scripts/perfetto-explore-mvp.ts:5` 明写 "No LLM"，explore 是脚本
- `web/server/scripts/perfetto-report-mvp.ts` 用 buildNarrative() 脚本拼 narrative + humanizeFinding() 11 个 if-else 套句式
- 报告质量与 v5.3 标杆（`docs/report/performance-report_perfetto_ULTIMATE_v5.md`）差距巨大

Unity 阶段（`web/server/prism/`）正确走了三段管线，是参照实现：
- explore-service.ts spawn CLI ← explore-prompt.txt → LLM 写 findings.json
- 第二段 spawn CLI ← narrative-prompt.txt → LLM 写 narrative.json
- render-html.ts 纯代码读 narrative.json → 渲染 report.html

【本次需求】
按 DR-44 第三章需求清单执行，顺序：

需求 A：框架契约层（数据源无关，最高优先级）
- A1: 定义 ReportPipeline 抽象接口（web/server/prism/report-pipeline.ts）
- A2: narrative.json provenance 强制校验（render-html.ts 检查 generatedBy: "LLM"）
- A3: 数据源特定逻辑移出报告层

需求 B：perfetto 接入框架三段管线
- B1: perfetto explore 改用 LLM（复用 explore-service.ts 模式 + 新建 perfetto-explore-prompt.txt）
- B2: perfetto 复用框架 narrative 阶段（不写自己的 narrative-prompt）
- B3: perfetto 渲染层复用 render-html.ts（废弃 perfetto-report-mvp.ts 的 renderHtml）

需求 C：反向沉淀 v5.3 能力（加速进化）
- C1: 渲染层能力沉淀到 report-utils.ts（树状下钻/├─/└─/GC 换算/三态 ASCII）
- C2: perfetto 报告章节模板沉淀到 prompts/report-templates/perfetto-multi-state.txt
- C3: narrative-prompt 加 {{REPORT_TEMPLATE}} 占位符 + v5.3 few-shot 示例
- C4: perfetto explore-prompt 适配（基于 unity explore-prompt 适配 perfetto 工具集 + 多态判定 DR-43）

【硬约束】
1. 三段管线硬契约：explore LLM → narrative LLM → render 纯代码，不允许脚本拼 narrative
2. 报告脚本只做渲染，不写内容（不写人话结论/优化建议/因果推理）
3. 数据源特定逻辑只在 explore 阶段（wait slice/降频/GPU-bound 判定是 LLM 推理任务）
4. 复用 web/server/prism/ 框架层，不在 web/server/scripts/ 另起炉灶
5. 严禁硬编码业务名/绝对阈值/死模板

【验收标准】
1. findings.json 的 conclusion 是人话不是 log 风
2. narrative.json 无 evidenceIds/findingIds 审计字段，含 generatedBy: "LLM"
3. 报告脚本无"建议单次任务削峰"这种万能套话
4. 报告脚本无数据源特定判定逻辑
5. 三段都走了
6. 对照 v5.3 标杆逐项核报告结构 + 叙事可读性（不能只看字段存在/测试 PASS）
7. DR-41 五条硬规则自动检查（tools.test.ts [16] 节）全 PASS

【参照实现】
- Unity 三段管线：web/server/prism/explore-service.ts + prompts/explore-prompt.txt + prompts/narrative-prompt.txt + render-html.ts
- Unity 产出样例：web/data/prism-out/unity-outside-stressmove/2026-07-11_14-55-28/（findings.json + narrative.json + report.html）
- v5.3 标杆报告：docs/report/performance-report_perfetto_ULTIMATE_v5.md

【提示词固定部分沉淀】
explore-prompt.txt 的 {{MEMORY_INJECTION}} 占位符已经从 web/server/prism/prism-memory/priors 注入业务先验知识。
narrative-prompt.txt 的 {{REPORT_TEMPLATE}} 占位符（本次新增）从 prompts/report-templates/ 注入数据源特定章节模板。
这两个占位符是"固定部分沉淀到 prism-memory / 模板文件"的机制——业务知识不写进 prompt 正文，走注入。

先读必读文档，然后给出你的实施计划（先做哪个需求，怎么拆分），等我确认后再开发。
```

---

## 开发需求顺序（供主 agent 跟进）

### 阶段 1：框架契约（需求 A）— 最高优先级

| 需求 | 文件 | 验收 |
|---|---|---|
| A1 ReportPipeline 接口 | `web/server/prism/report-pipeline.ts`（新建）| 接口定义清晰，narrative/render 数据源无关 |
| A2 provenance 校验 | `web/server/prism/render-html.ts`（修改）| 脚本拼的 narrative.json 被拦截 |
| A3 数据源逻辑移出报告层 | 从 `perfetto-report-mvp.ts` 移到 explore prompt | 报告脚本无数据源特定判定 |

### 阶段 2：perfetto 接入（需求 B）— 依赖 A1/A2

| 需求 | 文件 | 验收 |
|---|---|---|
| B1 perfetto explore LLM | `web/server/prism/prompts/perfetto-explore-prompt.txt`（新建）+ 复用 explore-service.ts | findings conclusion 是人话 |
| B2 perfetto narrative 复用框架 | 复用 narrative-prompt.txt | narrative.json 无审计字段 |
| B3 perfetto 渲染复用框架 | 复用 render-html.ts，废弃 perfetto-report-mvp.ts | 渲染层无数据源特定逻辑 |

### 阶段 3：反向沉淀 v5.3（需求 C）— 依赖 B

| 需求 | 文件 | 验收 |
|---|---|---|
| C1 渲染能力沉淀 | `web/server/prism/report-utils.ts` | 对照 v5.3 §0②/§5.2/§5.5/§6.3/§4.4 |
| C2 perfetto 报告模板 | `web/server/prism/prompts/report-templates/perfetto-multi-state.txt` | 对照 v5.3 §0-§6 章节骨架 |
| C3 narrative-prompt 模板注入 | `web/server/prism/prompts/narrative-prompt.txt`（修改）| `{{REPORT_TEMPLATE}}` 占位符 + v5.3 few-shot |
| C4 perfetto explore-prompt | `web/server/prism/prompts/perfetto-explore-prompt.txt` | 基于 unity 适配 perfetto 工具集 + DR-43 多态判定 |

### 阶段 4：验收

- 对照 v5.3 标杆逐项核报告结构 + 叙事可读性
- DR-41 五条硬规则自动检查全 PASS
- 三段管线完整性自检（5 条）

---

## 提示词固定部分沉淀机制（回答用户问题）

**explore-prompt 的固定部分已经沉淀**：
- `{{MEMORY_INJECTION}}`（第 26 行）从 `web/server/prism/prism-memory/priors` 注入业务先验知识
- `{{FRAME_BUDGET_MS}}` / `{{TARGET_FPS}}` / `{{RUN_ID}}` / `{{OUTPUT_DIR}}` 按运行时参数注入

**narrative-prompt 本次新增沉淀**：
- `{{REPORT_TEMPLATE}}`（新增）从 `prompts/report-templates/<source>-<state-mode>.txt` 注入数据源特定章节模板

**机制本质**：prompt 正文写"纪律 + 工具说明 + 产出契约"（数据源无关），业务知识和章节模板走占位符注入（数据源特定）。这样：
- 换数据源 = 换 explore-prompt + 工具集 + 报告模板，narrative-prompt 和 render 不动
- 业务知识更新 = 改 prism-memory/priors，prompt 不动
- 章节模板更新 = 改 report-templates/<source>.txt，prompt 不动

**新会话提示词的固定部分**：上面那个提示词框里的内容，可以沉淀到 `docs/prism/memory/dev-conventions.md` 或单独的 `docs/prism/memory/dev-prompt-template.md`，每次切会话时引用。但提示词本身是给开发 agent 的，不是给 Prism 运行时 LLM 的，所以不放 prism-memory（那是运行时大脑），放 docs/prism/memory（那是开发文档）。
