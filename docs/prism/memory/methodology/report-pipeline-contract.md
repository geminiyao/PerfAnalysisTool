# DR-44 · 报告生成可插拔框架契约（三段管线 + 报告层三层沉淀）

> **触发事件**：2026-07-15 用户对比 Prism perfetto 报告与 v5.3 标杆，发现质量差距巨大。诊断发现 perfetto 阶段**完全跳过了 philosophy.md 定义的三段管线**——explore 是脚本（`perfetto-explore-mvp.ts:5` 明写 "No LLM"），narrative 也是脚本拼（`perfetto-report-mvp.ts` 的 `buildNarrative()`），全程无 LLM。Unity 阶段（`web/server/prism/`）正确走了三段管线，但 perfetto 阶段在 `web/server/scripts/` 下另起炉灶用纯脚本实现，退化成作文机，浪费 3 天。
>
> **根因**：philosophy.md 是"设计文档"不是"可执行契约"——没有框架层强制数据源接入时必须走三段管线。charter.md:83-90 沉淀了"探索内核可插拔"（工具/源/Finding/报告结构四个可插拔），但**没把"报告生成三段管线"上升到可插拔框架契约的高度**。
>
> **本 DR 补这个缺口**：把三段管线从"设计文档里的描述"升级为"可执行框架契约"，并定义报告层的三层沉淀结构。
>
> **关联**：philosophy.md（三段管线设计）+ charter.md（四个可插拔）+ DR-41（报告层五条硬规则）+ DR-42/43（单态/多态方法论）+ dev-conventions.md（开发纪律）

---

## 一、事实认定（诊断结论）

### 1.1 Unity 阶段（正确实现，作为参照）

`web/server/prism/` 下的 unity 分析走了完整三段管线：

```
explore-service.ts → spawn CLI ← explore-prompt.txt
                   → LLM 写 findings.json（含 conclusion/reasoning/recommendation/selfCritique）
第二段 spawn CLI ← narrative-prompt.txt
                   → LLM 写 narrative.json（含 overview/topConclusions/sections/prioritySummary，无审计字段）
render-html.ts（纯代码无 LLM）
                   → 读 narrative.json → 渲染 report.html
```

**证据**：`web/data/prism-out/unity-outside-stressmove/2026-07-11_14-55-28/narrative.json` 结构完整，无 `evidenceIds`/`findingIds` 审计字段，是 LLM 按 narrative-prompt 契约写的。

### 1.2 perfetto 阶段（偏离实现，需要修正）

`web/server/scripts/` 下的 perfetto 分析**三段管线一段都没走**：

- `perfetto-explore-mvp.ts:5` 明写 "Deterministic scripted loop. No LLM." —— explore 是脚本
- `perfetto-report-mvp.ts:611-657` 的 `buildRoiOptimizations` 不管什么模块套同一句"建议单次任务削峰/增量化/分帧"
- `perfetto-report-mvp.ts:487-590` 的 `humanizeFinding` 是 11 个正则匹配 + 句式填充
- `bk26b-perfetto-report-mvp/narrative.json` 含 `evidenceIds`/`findingIds` 审计字段，是脚本拼的不是 LLM 写的

### 1.3 偏离的结构性原因

1. **philosophy.md 是设计文档不是可执行契约**：画了三段管线，但没有 `ReportPipeline` 接口强制数据源接入时必须实现三段
2. **perfetto 阶段另起炉灶**：没复用 `web/server/prism/` 的 explore-service + narrative-prompt + render-html，在 `web/server/scripts/` 下重写了一套纯脚本
3. **narrative.json 没有 provenance 校验**：脚本拼的和 LLM 写的没有机制区分，框架无法拦截脚本绕过 LLM
4. **数据源特定逻辑混入报告层**：wait slice 重叠法/降频矩阵/GPU-bound 判定等本该是 LLM 推理产出，却硬编码在报告脚本里
5. **开发 agent 开工前没读 philosophy.md**：三段管线白纸黑字写在 philosophy.md:25-32，但开发 agent 没对照

---

## 二、框架层：三段管线可插拔架构（核心修正）

### 2.1 架构图

```
┌─ 框架层（数据源无关，唯一一份）─────────────────────────────┐
│  ReportPipeline 契约（report-pipeline.ts）                 │
│  - explore-service.ts（spawn CLI 通用骨架）                │
│  - narrative-prompt.txt（数据源无关骨架 + {{REPORT_TEMPLATE}}）│
│  - render-html.ts（数据源无关渲染器）                       │
│  - narrative-types.ts（NarrativeReport 契约）              │
│  - report-utils.ts（数据源无关渲染工具）                    │
│  - render-html.ts 的 provenance 校验（非 LLM 拒绝渲染）     │
└────────────────────────────────────────────────────────────┘
        ▲
        │ 实现（每个数据源只写这两样）
┌───────┴────────┬────────────────┬────────────────┐
│ Unity 适配器   │ perfetto 适配器│ simpleperf 适配器│
│ - explore-prompt│ - explore-prompt│ - explore-prompt│
│   .txt (unity) │   .txt (perfetto)│   .txt (simpleperf)│
│ - 工具集(unity)│ - 工具集(perfetto)│ - 工具集(simpleperf)│
│ - 报告模板(unity)│ - 报告模板(perfetto)│ - 报告模板(simpleperf)│
│                │                │                │
│ narrative 不写 │ narrative 不写 │ narrative 不写 │
│ render 不写    │ render 不写    │ render 不写    │
└────────────────┴────────────────┴────────────────┘
```

**核心原则**（对齐 charter.md:83-90 四个可插拔）：
- **narrative-prompt 和 render-html 是数据源无关的，所有数据源共用**
- **每个数据源只写三样东西**：explore-prompt.txt + 工具集注册 + 报告章节模板
- **不存在"perfetto 三段管线""unity 三段管线"——三段管线只有一份，是框架层**

### 2.2 ReportPipeline 契约（需求 A）

**文件**：`web/server/prism/report-pipeline.ts`（新建）

```ts
interface ReportPipeline {
  // 数据源特定：explore 阶段
  explorePromptPath: string;          // prompts/<source>-explore-prompt.txt
  exploreTools: ToolRegistry;         // 数据源特定工具集

  // 数据源特定：报告章节模板（注入 narrative-prompt）
  reportTemplatePath: string;         // prompts/report-templates/<source>-<state-mode>.txt

  // 数据源无关：narrative 阶段（框架提供，数据源不写）
  // narrativePromptPath 固定为 prompts/narrative-prompt.txt

  // 数据源无关：渲染阶段（框架提供，数据源不写）
  // renderHtml 固定为 render-html.ts
}
```

**验收**：接口定义清晰；narrativePrompt 和 renderHtml 数据源无关；数据源适配器只实现 explore 侧。

### 2.3 narrative.json provenance 强制校验（需求 A2）

**文件**：`web/server/prism/render-html.ts`（修改）

narrative.json 必须含 provenance 标记：
```json
{
  "narrativeProvenance": {
    "stage": "narrative-llm",
    "promptVersion": "narrative-prompt.txt@v1",
    "generatedBy": "LLM"
  }
}
```

`render-html.ts` 检查 `generatedBy` 字段——非 `"LLM"` 拒绝渲染，强制走 narrative LLM 阶段。

**验收**：脚本拼的 narrative.json 被拦截；LLM 写的 narrative.json 正常渲染。

### 2.4 数据源特定逻辑移出报告层（需求 A3）

wait slice 重叠法 / 降频矩阵 / GPU-bound 判定等推理逻辑，从 `perfetto-report-mvp.ts` 移到 perfetto explore-prompt，作为 LLM 推理任务。

**报告脚本里不允许有数据源特定判定逻辑**，只有数据源无关渲染逻辑（画调用树/表格/ASCII/数据换算）。

**验收**：报告脚本里无 `wait slice` / `降频` / `GPU-bound` 等数据源特定判定逻辑。

---

## 三、报告层三层沉淀（通用 vs 定制化）

报告层**不做"第四大回路"**（回路是"跨 run 螺旋上升"，报告模板是"对标标杆一次性沉淀"）。改为三层沉淀：

### 3.1 第 1 层：数据源无关渲染能力（`report-utils.ts`）

所有数据源共用的通用渲染工具，和业务无关：

| 能力 | 用途 | v5.3 对标 |
|---|---|---|
| 树状下钻渲染 | 主入口→子树→叶子三层树 | §0② 树状下钻图 |
| callTree ├─/└─ 缩进 + 涨幅% + 标注 | callTree 可读渲染 | §5.2 callTree 格式 |
| GC 归因换算 | 子树 N 次 → N 次/帧 | §6.3 GC 归因 |
| 三态 ASCII 可视化 | 柱状图/状态分布图 | §4.4 ASCII 状态分布 |
| 四段式块渲染 | 引用块+加粗+ASCII+数字解读 | §0 四段式 |
| 子树归并算法 | top 列表 child 不重复 | DR-41 规则 2 |

**沉淀位置**：`web/server/prism/report-utils.ts`（已存在，需补能力）
**验收**：perfetto/simpleperf/unity 报告都能用

### 3.2 第 2 层：数据源特定报告章节模板（注入 narrative-prompt）

不同数据源能力边界不同，报告结构不同。**不是硬编码在脚本里，是注入到 narrative-prompt 让 LLM 遵循**：

| 数据源 | 章节模板 | 来源 |
|---|---|---|
| perfetto 多态 | §0 结论 → §1 元信息 → §2 多线程 → §3 off-CPU+GPU → §4 降频 → §5 callTree+红线 → §6 ROI | v5.3 标杆 |
| perfetto 单态 | §0 结论 → §1 元信息 → §2 多线程 → §3 off-CPU+GPU → §5 callTree+红线 → §6 ROI | v5.3 裁剪 |
| simpleperf | §0 结论 → §1 元信息+质量门 → §2 库维度 → §3 线程 → §4 Top-N → §5 主线程 → §6 渲染 → §7 ECS... | v4 标杆 |
| unity 单态 | §0 结论 → §1 元信息 → §2 热点 → §3 Jank → §4 波动 → §5 ROI | v1 标杆 |

**沉淀位置**：`web/server/prism/prompts/report-templates/` 目录，每个数据源+态数一个模板文件
**注入方式**：narrative-prompt.txt 的 `{{REPORT_TEMPLATE}}` 占位符按数据源+态数注入
**和作文机的区别**：作文机是"模板+填空"，Prism 是"模板骨架+LLM 写内容"

### 3.3 第 3 层：数据源无关质量底线（`tools.test.ts` [16] 节）

DR-41 五条硬规则自动检查，所有数据源同一套：
- 审计剥离 / 子树归并 / 结构层次 / 图文穿插 / 人话先行

**沉淀位置**：`web/server/prism/tools.test.ts`（已存在）
**验收**：任何数据源报告生成后都过这五条检查

### 3.4 通用 vs 定制化分界

| 能力 | 通用（数据源无关）| 定制化（数据源特定）|
|---|---|---|
| 渲染工具 | ✅ 树状下钻/├─/└─/GC 换算/ASCII | ❌ |
| 质量底线 | ✅ DR-41 五条硬规则 | ❌ |
| 报告章节结构 | ❌ | ✅ perfetto §0-§6 / simpleperf §0-§10 |
| 判定逻辑 | ❌ | ✅ perfetto wait slice 重叠 / simpleperf 符号反查 |
| explore 工具集 | ❌ | ✅ querySchedState / queryMarkers |
| narrative prompt | ✅ 数据源无关骨架 | 🟡 `{{REPORT_TEMPLATE}}` 按数据源注入 |

**分界原则**：渲染能力向上沉淀（通用），判定逻辑向下沉淀（数据源特定 explore prompt），章节模板横向沉淀（数据源特定模板文件）。

---

## 四、反向沉淀 v5.3 打磨层加速进化

**正常进化路径**（慢）：Prism 跑一次 → 看报告哪里不行 → 改 prompt/渲染器 → 再跑 → 再改……迭代 N 次达到标杆质量。

**加速路径**（本次采用）：拿 v5.3 标杆当参照物 → 一次性把 v5.3 的渲染选择/叙事选择/优化方向深度沉淀成"渲染能力 + prompt 纪律 + few-shot 示例" → Prism 一次产出接近 v5.3。

**v5.3 打磨层拆解**：

| v5.3 打磨点 | 沉淀成什么 | 注入位置 | 性质 |
|---|---|---|---|
| §0② 树状下钻图 | 树状下钻渲染 + 按贡献度排序规则 | 第 1 层渲染能力 + 第 2 层模板 | 渲染能力 |
| §5.2 callTree ├─/└─ + 涨幅% + 标注 | callTree 渲染能力 | 第 1 层渲染能力 | 渲染格式 |
| §5.5 每个红线模块 3-4 条具体优化方向 | "优化方向要具体"prompt 纪律 + v5.3 范例 | narrative-prompt few-shot | prompt 示例 |
| §6.3 GC 归因"子树 N 次 → N 次/帧" | GC 归因换算 | 第 1 层渲染能力 | 数据换算 |
| §0① 形态演化叙事 | 形态演化叙事模板 | 第 2 层模板 + narrative-prompt 示例 | 叙事范例 |

**关键约束**：沉淀的是"渲染能力 + prompt 纪律 + few-shot 示例"，**不是硬编码业务名/绝对阈值/死模板**（DR-41 已钉死）。

**泛化到 simpleperf**：simpleperf 接入时走修复后的通用三段管线，反向沉淀 simpleperf v4 标杆的打磨层（库维度对比/线程身份识别/符号反查等），一次注入。**不需要重新关注报告叙事问题**——框架强制走 narrative LLM。

---

## 五、需求清单

### 5.1 作废的错误需求

| 编号 | 原需求 | 为什么错 | 处置 |
|---|---|---|---|
| WT-020 | perfetto explore 用脚本生成 findings（No LLM） | 违背 F1 分析师非作文机；findings 的 claim 是 log 风 | **作废**，改为 LLM explore |
| WT-023 | perfetto report 用脚本 buildNarrative + humanizeFinding | 违背三段管线；脚本套模板 = 作文机 | **作废**，改为 LLM narrative |
| WT-024 | 报告质量二期（在脚本基座上做） | 在错误基座上做二期 = 加固错误 | **暂停**，等三段管线修复后重做 |
| WT-025 | report-utils.ts（部分） | humanizeFinding 类"脚本写人话"反模式 | **部分保留**：子树归并/自动检查保留；humanizeFinding 作废 |

### 5.2 正确需求（新方向）

#### 需求 A：框架契约层（数据源无关，最高优先级）

- **A1**：定义 `ReportPipeline` 抽象接口（`web/server/prism/report-pipeline.ts`）
- **A2**：narrative.json provenance 强制校验（`render-html.ts` 检查 `generatedBy: "LLM"`）
- **A3**：数据源特定逻辑移出报告层（wait slice/降频/GPU-bound 判定移到 explore prompt）

#### 需求 B：perfetto 接入框架三段管线（数据源特定）

- **B1**：perfetto explore 改用 LLM（复用 explore-service.ts 模式 + perfetto-explore-prompt.txt）
- **B2**：perfetto 复用框架 narrative 阶段（不写自己的 narrative-prompt）
- **B3**：perfetto 渲染层复用 render-html.ts（废弃 perfetto-report-mvp.ts 的 renderHtml）

#### 需求 C：反向沉淀 v5.3 能力（加速进化）

- **C1**：渲染层能力沉淀到 report-utils.ts（树状下钻/├─/└─/GC 换算/三态 ASCII）
- **C2**：perfetto 报告章节模板沉淀到 `prompts/report-templates/perfetto-multi-state.txt`
- **C3**：narrative-prompt 加 `{{REPORT_TEMPLATE}}` 占位符 + v5.3 few-shot 示例
- **C4**：perfetto explore-prompt 适配（基于 unity explore-prompt 适配 perfetto 工具集 + 多态判定）

#### 需求 D：开发经验沉淀（已完成）

- **D1**：本 DR（DR-44）
- **D2**：`docs/prism/memory/dev-conventions.md`（开发协作约定）
- **D3**：项目根 `CODEBUDDY.md`（开工必读约束）

### 5.3 修复顺序

```
A 框架契约 ─┬─→ B perfetto 接入 ─┬─→ C 反向沉淀 v5.3
            │                    │
            └─ A1/A2 可并行      └─ C1/C2/C3/C4 可并行
```

- A 和 B 可以部分并行（A 是接口，B 是 perfetto 适配）
- C 必须在 B 之后（B 修复三段管线后，C 才能往 narrative-prompt 注入 v5.3 能力）
- D 已完成

---

## 六、给开发 agent 的硬规则

### 6.1 三段管线硬契约

```
explore LLM → findings.json
narrative LLM → narrative.json
render 纯代码 → report.html
```

**任何数据源接入都必须走这三段。不允许跳过 narrative LLM 用脚本拼 narrative.json。**

### 6.2 报告脚本只做渲染，不写内容

- ✅ 报告脚本可以做：HTML 渲染、ASCII 图、表格、调用树、数据换算（GC 子树次数→每帧次数）
- ❌ 报告脚本不可以做：写人话结论、写优化建议、写因果推理、把字段名翻译成中文句式

### 6.3 数据源特定逻辑只在 explore 阶段

- ✅ explore 阶段：数据源特定 prompt + 工具集
- ❌ 报告阶段：数据源特定判定逻辑（wait slice 重叠/降频矩阵等是 explore 阶段 LLM 推理任务）

### 6.4 复用框架层，不另起炉灶

- explore 阶段：复用 `explore-service.ts` 的 spawn CLI 模式
- narrative 阶段：复用 `narrative-prompt.txt`（数据源无关）
- 渲染阶段：复用 `render-html.ts`（数据源无关）
- **不允许在 `web/server/scripts/` 下另起炉灶写报告生成器**

### 6.5 验收自检

开发完报告生成后，自检：
1. findings.json 的 conclusion 是人话还是 log 风？
2. narrative.json 有没有 evidenceIds/findingIds 审计字段？
3. 报告脚本里有没有"建议单次任务削峰"这种万能套话？
4. 报告脚本里有没有数据源特定判定逻辑？
5. 三段管线是否都走了？narrative.json 的 `generatedBy` 是不是 `"LLM"`？

**任一不通过 = 方向错了，停下来诊断，不要在错误基座上继续堆功能。**

---

_本 DR 基于 2026-07-15 用户诊断"perfetto 报告三段管线偏离"的对话沉淀。核心修正：把三段管线从设计文档升级为可执行框架契约 + 报告层三层沉淀（通用渲染/数据源模板/质量底线）+ 反向沉淀 v5.3 加速进化。_
