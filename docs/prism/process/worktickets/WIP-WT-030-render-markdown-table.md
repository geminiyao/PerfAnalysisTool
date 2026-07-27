# TODO-WT-030 · render 层 markdown 表格渲染 bug（DR-45 差距1）

> 状态：TODO ｜ 里程碑：M5 Perfetto agent 化 ｜ 执行方：Cursor（施工）+ 主 agent（验收）
>
> 前置：**WT-029 验收通过**（DR-45 三处断链已修，harness 35 PASS/0 FAIL，端到端可渲染 7 sections / 6 callTree / 65.7KB）。
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§三对照标杆验收 + §八 harness 纪律）+ 项目根 `CODEBUDDY.md`（三段管线硬契约）+ `docs/prism/memory/rationale.md` DR-45（差距1）。

## 背景

对照 v5.3 标杆（`docs/report/performance-report_perfetto_ULTIMATE_v5.3.md`）review 后发现"报告框架有了但内容厚度差一截"。诊断出 4 个差距 + 2 个机制缺口，已开成 WT-030~035。**WT-030 是差距1**：render 层 markdown 表格渲染 bug，立刻见效，无依赖，第一个做。

**问题**：`web/server/prism/render-html.ts` 的 `section.intro` 当纯文本 `htmlEsc(intro).replace(/\n/g, '<br>')` 处理，LLM 写在 intro 里的 markdown 表格（`| 指标 | base | cur | throttle |`）显示成原始文本，不渲染成 HTML 表格。v5.3 §1 采集元信息、§3 多线程三态表都是表格——不修这个 bug，narrative LLM 即使按模板写表格，HTML 报告也显示成 raw markdown 文本。

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §三对照标杆验收 + §八 harness 纪律（DR-45 教训）
- `CODEBUDDY.md`（项目根）— 三段管线硬契约 + 严禁硬编码
- `docs/prism/memory/rationale.md` DR-45 §1.3 — 渲染层视觉资产缺口（WT-030 是其中一环）

## 任务

### 需求 A：新增 `renderMarkdownLite` 最小 markdown 解析器

**文件**：`web/server/prism/render-html.ts`

在 `htmlEsc` 函数附近（约 line 50 后）新增 `renderMarkdownLite(md: string): string`：

**支持的 5 类 token**（用户确认简单处理，不追求完整 GFM）：
1. **GFM 表格**：`| a | b |` 行（含分隔行 `|---|---|`）→ `<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody>...</tbody></table>`
2. **代码围栏**：``` ``` 代码块 → `<pre><code>...</code></pre>`（保留原样，不做 markdown 解析内部）
3. **粗体**：`**x**` → `<strong>x</strong>`
4. **行内代码**：`` `x` `` → `<code>x</code>`
5. **换行**：`\n` → `<br>`

**实现要求**：
- **先 htmlEsc 再解析 markdown token**，避免 XSS（用户内容不可信）
- **不引入 markdown 库**（marked/markdown-it 等都不许引）——手写最小解析器
- **复杂 markdown 降级为纯文本**：不支持的 token（如标题 `#`、列表 `-`、链接 `[]()`、图片 `![]()`）原样显示为纯文本，不报错
- **表格嵌代码块**边界情况：表格行内的 `` ` `` 不解析为代码（表格优先），代码围栏内的 `|` 不解析为表格（代码优先）。简单处理：先切代码围栏（最高优先级），再在非代码段切表格，最后行内 token

### 需求 B：替换 3 处调用点

**文件**：`web/server/prism/render-html.ts`

把以下 3 处 `htmlEsc(x).replace(/\n/g, '<br>')` 改成 `renderMarkdownLite(x)`：

1. **`section.intro`**（line 373）：
   - 当前：`<p class="section-intro">${htmlEsc(sec.intro).replace(/\n/g, '<br>')}</p>`
   - 改为：`<p class="section-intro">${renderMarkdownLite(sec.intro)}</p>`

2. **`item.narrative`**（line 199）：
   - 当前：`<p class="narrative-text">${htmlEsc(item.narrative).replace(/\n/g, '<br>')}</p>`
   - 改为：`<p class="narrative-text">${renderMarkdownLite(item.narrative)}</p>`

3. **`overview`**（line 968）：
   - 当前：`<div class="overview-block">${htmlEsc(narrative.overview).replace(/\n/g, '<br>')}</div>`
   - 改为：`<div class="overview-block">${renderMarkdownLite(narrative.overview)}</div>`

**保持不变**：
- `sourceInsight`（line 180）保持 `htmlEsc + <br>`——它是代码片段，不需要表格
- `recommendations` 列表项保持 `htmlEsc`——它是 `<li>` 内文本，不需要表格
- `item.title` / `section.heading` 等标题保持 `htmlEsc`——标题不该有表格

### 需求 C：加单测

**文件**：`web/server/prism/render-html.test.ts`（若不存在则新建）

覆盖以下 case：
1. 纯表格：`| a | b |\n|---|---|\n| 1 | 2 |` → 含 `<table>` / `<th>a</th>` / `<th>b</th>` / `<td>1</td>` / `<td>2</td>`
2. 表格 + 前后文本：`导语\n\n| a | b |\n|---|---|\n| 1 | 2 |` → 含 `<br>` + `<table>`
3. 代码围栏：`` ```js\nvar x = 1;\n``` `` → 含 `<pre><code>` + `var x = 1;` + 不含 `<table>`
4. 粗体：`**重点**` → 含 `<strong>重点</strong>`
5. 行内代码：`` `foo` `` → 含 `<code>foo</code>`
6. 混合：表格 + 粗体 + 行内代码 → 各 token 都正确渲染
7. XSS 防护：`<script>alert(1)</script>` → 转义为 `&lt;script&gt;` 不执行
8. 复杂降级：`# 标题` 原样显示为 `# 标题`（不支持标题 token，不报错）

## 硬约束

1. **三段管线硬契约**：render 层只做呈现，不写判定逻辑（DR-41 + dev-conventions.md §六）
2. **不引入 markdown 库**——手写最小解析器（用户确认）
3. **不硬编码业务名/绝对阈值**——解析器数据源无关，不依赖任何业务字段
4. **修完 harness 必须 FAIL=0**——不许退化已有 35 PASS
5. **不覆盖原报告**——端到端冒烟用 `--out` 新目录，原 `2026-07-15_10-36-27/` 不动

## 验收 harness（必填，开发 agent 完成前自己跑通）

**通用 harness**：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-15_10-36-27
```
期望：35 PASS / 0 FAIL（不退化）。

**工单特定断言**：
```
cd web && npx tsx --test server/prism/render-html.test.ts
```
期望：8 个 case 全 PASS。

**端到端冒烟**（不覆盖原报告，用新目录）：
```
cd web && npx tsx server/prism/run-perfetto-pipeline.ts --skip-explore --out data/prism-out/bk26b-perfetto-triad/2026-07-16_wt030
```
期望：narrative.json + report.html 产出在新目录，原目录不动。

**人工核**：打开新 `report.html`，看 §1 采集元信息表（如果 narrative LLM 写了 markdown 表格）渲染为 HTML table，不再是 raw markdown 文本。如果当前 narrative.json 的 intro 里没表格，可手动改 narrative.json 加一个表格 intro 重渲染验证。

## 完成标准

1. 通用 harness FAIL=0（35 PASS 不退化）
2. 工单特定断言全 PASS（8 个单测 case）
3. 端到端冒烟成功，新 report.html 产出在 `2026-07-16_wt030/`
4. 原 `2026-07-15_10-36-27/` 全程不动
5. 把新 report.html 路径 + 改动清单告诉主 agent

harness 跑不通就继续改，改到 FAIL=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

开发 agent 说完成后，主 agent 独立做：

1. 独立跑一遍通用 harness + 工单特定断言
2. 打开新 report.html 看 §1 表格渲染（harness 验不了"表格视觉"，要人看）
3. 对照 v5.3 §1 采集元信息表结构核
4. 任一不通过 = 打回，不在错误基座上继续堆功能

## 注意事项

- **WT-030 是简单处理**：只支持 5 类 token，复杂 markdown 降级纯文本。长期阅读体验优化（完整 GFM/Mermaid/交互折叠等）已开 BK-阅读体验优化 backlog 项，不属 WT-030 范围。
- **不引入 markdown 库是硬约束**：marked/markdown-it 等都不许引。手写解析器是 Prism 报告层"数据源无关 + 无外部依赖"原则的体现。
- **XSS 防护**：narrative.json 是 LLM 产的，内容不可信——必须先 htmlEsc 再解析 markdown token。
