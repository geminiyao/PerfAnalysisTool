# 新对话提示词 · perfetto 报告对标 v5.3（打通 narrative 回路 + 内容厚度工单）

> 给下一个开发 agent 的开工提示词。复制粘贴到新对话开头即可。

---

你是 Prism 项目的开发 agent。开工前先读这三个文档（必读，不读会踩坑）：

1. `K:\AI\PerfAnalysisTool_Codebuddy\CODEBUDDY.md`
2. `K:\AI\PerfAnalysisTool_Codebuddy\docs\prism\memory\dev\conventions.md`（特别注意 §八 harness 纪律 + §三对照标杆验收）
3. `K:\AI\PerfAnalysisTool_Codebuddy\docs\prism\memory\rationale.md` 的 DR-45（搜 "DR-45"）

## 背景

上一轮（WT-029）已修复 DR-45 三处断链（`resolveReportTemplate` return '' / `reportTemplatePath: null` / perfetto callTree 走错工具），并扩了 5 个可选视觉资产字段（metaInfo/threadOverview/throttlingMatrix/redlineMatrix/asciiArt）。harness 35 PASS/0 FAIL，端到端重渲染成功（7 sections / 6 callTree / 65.7KB）。

但用户对照 v5.3 标杆（`docs/report/performance-report_perfetto_ULTIMATE_v5.3.md`）review 后指出"报告框架有了但内容厚度差一截"。诊断出 4 个差距 + 2 个机制缺口，已开成工单写进 `docs/prism/plan/backlog.md`（WT-030 ~ WT-035）。

## 任务

按 backlog 建议的开工顺序，逐个完成 WT-030 ~ WT-035，**目标是对标甚至超越 v5.3 作文机报告**。

### WT-030 差距1·markdown 表格渲染（P0，render 层 bug，立刻见效）

**问题**：`render-html.ts` 的 `section.intro` 当纯文本 `htmlEsc`，LLM 写在 intro 里的 markdown 表格（`| 指标 | base | cur | throttle |`）显示成原始文本，不渲染成 HTML 表格。

**修法**：`render-html.ts` 的 `renderHTML` 函数里，`section-intro` 的渲染从 `htmlEsc(intro).replace(/\n/g, '<br>')` 改成轻量 markdown 解析——至少解析表格（`| ... |` 行）成 `<table>`，解析 ``` 代码块成 `<pre>`。不要引重型 markdown 库，手写最小解析器即可（表格/代码块/加粗/换行）。

**验收**：重渲染后 report.html 的 §1 采集元信息表格正常显示为 HTML 表格，不再是原始 markdown 文本。

### WT-034 narrative 红队回扫 + lessons 回路（P0，核心回路，决定性）

**问题**：narrative-prompt.txt 是静态的，LLM 产出决定性受它影响，但不接回路就永远靠人手改 prompt。narrative 阶段没有红队回扫（explore 阶段有，DR-24②/DR-27 验证过）。

**修法**：在 `narrative-service.ts` 的 `runPrismNarrative` 里，narrative.json 产出后加一个"红队回扫"环节：
1. 对照标杆检查产出差距（多线程覆盖够不够 / 视觉资产字段填没填 / 核心结论配没配调用树 / callTree 节点有没有红线标注）
2. 差距沉淀进 `web/server/prism/prism-memory/lessons/`（当前只有 .gitkeep，是空的）——每条 lesson 一个 md 文件，frontmatter 含 type/source/content
3. 下次 narrative run 开局，`explore-service.ts` 已有的 `{{MEMORY_INJECTION}}` 机制（explore-service.ts:711）会读 prism-memory 注入 prompt——narrative 侧也要接同样的注入，让 lessons 回流到下次 narrative-prompt

**设计参考**：explore 阶段已有的自我批判回合（explore-prompt.txt 里的"红队"指令 + explore-service.ts 的收尾回扫）。narrative 侧同构——narrative-prompt 加红队指令，narrative-service 加回扫 + lessons 沉淀。

**关键约束**：
- 红队回扫是**软约束**（产出有差距不阻塞，但必须沉淀 lesson）
- lessons 沉淀要**可回溯**（每条 lesson 记录是哪次 run、哪个差距、该怎么改 prompt）
- 不要硬编码"差距检测逻辑"——红队本身也是 LLM 调用（同 explore 的自我批判回合），让它自己对照标杆判断差距

**验收**：跑一次端到端后，`prism-memory/lessons/` 有 lesson 文件；第二次跑时 narrative-prompt 注入了 lessons；第二次产出的报告比第一次更接近 v5.3（多线程覆盖更全 / 视觉资产字段有填）。

### WT-031 差距2·多线程覆盖不全（P0，prompt 引导）

**问题**：v5.3 §3 有 7 类线程（UnityMain/Render/RHI/LuaMtGC/ECSWorker×4/Audio/Choreographer）独立三态数据表+判定；当前报告只有 2 个（UnityMain/UnityGfxRenderS）。

**根因**：narrative-prompt 没强制"多线程宏观必须覆盖所有识别线程"。findings 里有这些线程的 sched 数据（explore 阶段查过），narrative LLM 没拉。

**修法**：
1. 确认 findings 里有没有所有线程的 sched 数据（查 `data/prism-out/bk26b-perfetto-triad/2026-07-15_10-36-27/findings.json`，grep `RHI`/`LuaMtGC`/`ECSWorker`/`Audio`）。如果 explore 没查全，是 explore-prompt 问题；如果查了 narrative 没用，是 narrative-prompt 问题。
2. narrative-prompt.txt 加引导："多线程宏观章节（§2）必须覆盖 findings 里所有识别到的线程，每个线程给三态 run/sleep 数据表 + 一句话判定。不许只写主线程和渲染线程。"
3. 同时引导 LLM 填结构化字段 `threadOverview`（narrative-types.ts 已定义），不要只写进 intro。

**验收**：重跑后报告 §2 覆盖至少 5 类线程（UnityMain/Render/RHI/LuaMtGC/ECSWorker），每个有三态数据 + 判定。

### WT-032 差距3·核心结论缺配套调用树（P1，schema 扩展）

**问题**：v5.3 §0 三大结论每条配 ASCII 调用树/柱状图穿插；当前 topConclusions 是纯文本表格无可视化。

**修法**：
1. `narrative-types.ts` 的 `TopConclusionRow` 加可选字段 `callTree?: CallTreeRef` 和 `asciiArt?: AsciiArt`
2. `render-html.ts` 核心结论表每行下挂调用树（复用 `requeryTrees` 逻辑，按 `row.callTree.rootMarker` 重查）
3. narrative-prompt 引导 LLM 给每个 critical/high 结论配 callTree

**验收**：报告核心结论表每条 critical/high 结论下有配套调用树或 ASCII 图。

### WT-033 差距4·callTree 节点缺红线标注（P1，schema 扩展）

**问题**：v5.3 §6.2 每节点有 `🔴 单次 1.50ms 触红线`/`🟡 临近红线`/`📈 ×4.2`/`🟢 健康` 标注；当前 render-html 调用树只显示 name/ms/pct。

**修法**：
1. `tools.ts` 的 `DrillDownNode` 加可选字段 `redlineFlag?: string`（如 "🔴 单次 1.50ms 触红线 1ms"）、`foldChange?: string`（如 "×4.2"）、`severityTag?: 'critical'|'high'|'medium'|'low'|'healthy'`
2. perfetto 侧：`perfettoNodeToDrillDown`（render-html.ts）从 perfetto 节点的 `layer` 字段 + findings 里的红线判定传递这些标注
3. unity 侧：`drillDownMarker`（tools.ts）从 findings 里查该 marker 的红线判定注入
4. `render-html.ts` 的 `renderTreeHTML` 在节点后渲染这些标注

**关键约束**：红线判定逻辑在 explore LLM（findings 里有），render 层只做呈现——从 findings 查判定结果注入节点，不在 render 层写判定逻辑。

**验收**：报告调用树节点后有 🔴/🟡/🟢/📈 标注，和 v5.3 §6.2 一致。

### WT-035 harness 内容质量软约束（P1，兜底）

**问题**：harness 验机制完整性不验内容质量，差距 1/2/3 没被 harness 发现。

**修法**：`harness.ts` [2] 节加软约束 warning（不 FAIL，但暴露差距）：
- 可选视觉资产字段（metaInfo/threadOverview/throttlingMatrix/redlineMatrix/asciiArt）全为空 → warning
- threadOverview 覆盖线程数 < 5 → warning（"多线程覆盖不足，v5.3 标杆有 7 类"）
- topConclusions 里 critical/high 结论配 callTree 的比例 < 50% → warning
- callTree 节点无 redlineFlag/foldChange → warning

**验收**：harness 跑完有 warning 暴露当前差距，修完 WT-030~034 后 warning 为 0。

## 硬约束

1. 三段管线硬契约：explore LLM → narrative LLM → render 纯代码，不许脚本拼 narrative
2. render 层只做呈现，不写判定逻辑（判定在 explore LLM）
3. 不硬编码业务名/绝对阈值/死模板
4. 每个工单完成前跑 harness 确认不退化，全部完成后跑端到端

## 验收（自己跑通，不要丢给我验收）

1. harness 全 PASS：
   ```
   cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-15_10-36-27
   ```
2. 端到端重渲染（不重跑 explore，复用已有 findings）：
   ```
   cd web && npx tsx server/prism/run-perfetto-pipeline.ts --skip-explore
   ```
3. 打开新产出的 report.html，对照 v5.3 标杆（`docs/report/performance-report_perfetto_ULTIMATE_v5.3.md`）逐项核：
   - §2 多线程覆盖 7 类线程（不是 2 个）
   - 表格正常渲染成 HTML 表格（不是原始 markdown 文本）
   - 核心结论配调用树
   - callTree 节点有红线标注
4. 把最终 report.html 路径告诉我，说明做了哪些改动

harness 跑不通就继续改，改到 FAIL=0 + warning=0 为止。不要把 FAIL 状态丢给我。

## 关键文件

- `web/server/prism/narrative-service.ts` — narrative 阶段 service（WT-034 红队回扫加这里）
- `web/server/prism/render-html.ts` — HTML 渲染器（WT-030/032/033 改这里）
- `web/server/prism/narrative-types.ts` — narrative schema（WT-032/033 扩这里）
- `web/server/prism/prompts/narrative-prompt.txt` — narrative LLM 指令（WT-031/034 改这里，静态→自举）
- `web/server/prism/prompts/report-templates/perfetto-multi-state.txt` — perfetto 章节模板（已注入）
- `web/server/prism/prism-memory/lessons/` — lessons 沉淀目录（WT-034 新建文件）
- `web/server/prism/harness.ts` — harness（WT-035 加软约束）
- `web/server/prism/tools.ts` — DrillDownNode 定义（WT-033 扩这里）
- `docs/report/performance-report_perfetto_ULTIMATE_v5.3.md` — v5.3 标杆（对照基准）
- `docs/prism/plan/backlog.md` — 工单详情（WT-030~035）

先读必读文档，然后告诉我你的实施计划，等我确认后再动手。
