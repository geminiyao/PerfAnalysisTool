# TODO-WT-028 · 反向沉淀 v5.3 能力（DR-44 需求 C）

> 状态：TODO ｜ 里程碑：M5 Perfetto agent 化 ｜ 执行方：Cursor（C1-C3）+ 主 agent（C4 + 跑通）
>
> 前置：**WT-027 验收通过**（perfetto 已接入框架三段管线：`narrative-service.ts` 建好、`explore.cli.ts` 支持 `--source perfetto`、`run-perfetto-pipeline.ts` 串起三段、`perfetto-report-mvp.ts` 标记 @deprecated、tools.test.ts [15][16] skip）。
> 开工前必读：`docs/prism/memory/methodology/report-pipeline-contract.md`（DR-44 第四章"反向沉淀 v5.3"）+ `docs/prism/memory/methodology/report-layer-rules.md`（DR-41 五条硬规则）+ `docs/prism/memory/dev/conventions.md` + 项目根 `CODEBUDDY.md`。
>
> **分工**：
> - **Cursor 做 C1-C3**（代码工作：report-utils 渲染能力 + report-templates + narrative-prompt few-shot）
> - **主 agent 接手 C4 + 跑通三段管线**（C4 需要改 perfetto-explore-prompt，跑通需要调 LLM，Cursor 10 分钟超时不够）

## 背景

DR-44 §4 定义了"反向沉淀 v5.3 加速进化"路径：

> **正常进化路径**（慢）：Prism 跑一次 → 看报告哪里不行 → 改 prompt/渲染器 → 再跑 → 再改……迭代 N 次达到标杆质量。
>
> **加速路径**（本次采用）：拿 v5.3 标杆当参照物 → 一次性把 v5.3 的渲染选择/叙事选择/优化方向深度沉淀成"渲染能力 + prompt 纪律 + few-shot 示例" → Prism 一次产出接近 v5.3。

v5.3 标杆：`docs/report/performance-report_perfetto_ULTIMATE_v5.3.md`
simpleperf v4 标杆：`docs/report/performance-report_simpleperf_ULTIMATE_v4.md`

本工单把 v5.3 的打磨点拆解成"渲染能力 + prompt 纪律 + few-shot 示例"沉淀到框架层，**不是硬编码业务名/绝对阈值/死模板**（DR-41 已钉死）。

## 四个需求

### 需求 C1：渲染层能力沉淀到 report-utils.ts

**文件**：`web/server/prism/report-utils.ts`（已存在，补能力）

对照 v5.3 标杆拆解的渲染能力（DR-44 §4 表格）：

| v5.3 打磨点 | 沉淀成什么 | 验收对照 |
|---|---|---|
| §0② 树状下钻图 | 树状下钻渲染函数 + 按贡献度排序规则 | v5.3 §0② |
| §5.2 callTree ├─/└─ + 涨幅% + 标注 | callTree 可读渲染函数 | v5.3 §5.2 |
| §6.3 GC 归因"子树 N 次 → N 次/帧" | GC 归因换算函数 | v5.3 §6.3 |
| §4.4 ASCII 状态分布图 | 三态 ASCII 可视化函数 | v5.3 §4.4 |
| §0 四段式块 | 四段式块渲染函数（已存在 `renderFourPartBlock`，检查是否需补） | v5.3 §0 |
| DR-41 规则 2 子树归并 | 子树归并算法（已存在 `mergeBySubtree`，检查是否需补） | DR-41 |

**任务**：
1. 读 v5.3 标杆报告，逐项对照 `report-utils.ts` 现有函数
2. 缺的能力补上（树状下钻渲染 / callTree ├─/└─ 缩进 + 涨幅% + 标注 / GC 归因换算 / 三态 ASCII 可视化）
3. 现有函数不足的改进（如 `renderCallTreeWithSeverity` 是否支持三态对照 `[base/cur/throttle ms/帧]`）

**约束**：
- 渲染函数**数据源无关**（perfetto/simpleperf/unity 都能用）
- 不硬编码业务名（如不写死 "URP.Render"）
- 不硬编码绝对阈值（用相对倍数/占比参数化）

**验收**：
- `report-utils.ts` 含上述 6 项能力
- 渲染函数数据源无关（参数化，不依赖 Perfetto 专有类型）
- 对照 v5.3 §0②/§5.2/§6.3/§4.4，渲染输出结构对齐

### 需求 C2：perfetto 报告章节模板沉淀

**文件**：
- `web/server/prism/prompts/report-templates/`（**新建目录**）
- `web/server/prism/prompts/report-templates/perfetto-multi-state.txt`（**新建**）
- `web/server/prism/prompts/report-templates/perfetto-single-state.txt`（**新建**）

**任务**：把 v5.3 的报告章节结构沉淀成模板文件，注入 narrative-prompt 让 LLM 遵循。

**perfetto 多态模板**（对照 v5.3 §0-§6）：
```
§0 结论先行（3 条独立结论 + ASCII 图穿插，四段式）
§1 采集元信息（帧数/fps/p50/温度/binder 一张表）
§2 多线程宏观（所有线程三态健康度表 + 一句话定位）
§3 主线程 off-CPU 归因（byState + wait slice 重叠 + ASCII 状态分布 + ASCII 因果链）
§4 降频时序（per-CPU + 形态 ASCII + 判定矩阵）
§5 主线程一帧时间去向（callTree 缩进树 + 红线矩阵 + Top 模块下钻）
§6 GPU-bound 判定（矩阵 + 结论，不与 §3 重复）
§7 ROI 优化方向（按 severity+贡献排序）
```

**perfetto 单态模板**（v5.3 裁剪，对照 DR-42）：
```
§0 结论先行
§1 采集元信息
§2 多线程宏观（单态，无三态对照）
§3 主线程 off-CPU 归因（单态，占 p50% 判定）
§5 主线程一帧时间去向（callTree + 红线矩阵，占 p50% 判定）
§6 ROI 优化方向
```

**和作文机的区别**（DR-44 §3.2）：作文机是"模板+填空"，Prism 是"模板骨架+LLM 写内容"。模板只定义章节结构，内容由 LLM 按 narrative-prompt 契约写。

**验收**：
- `prompts/report-templates/` 目录存在
- `perfetto-multi-state.txt` 含 §0-§7 章节骨架（对照 v5.3）
- `perfetto-single-state.txt` 含单态裁剪版（对照 DR-42）
- 模板里**无**硬编码业务名/绝对阈值（只有章节结构 + 写作纪律）

### 需求 C3：narrative-prompt 加 {{REPORT_TEMPLATE}} 占位符 + v5.3 few-shot

**文件**：`web/server/prism/prompts/narrative-prompt.txt`（修改）

**任务**：
1. 在 narrative-prompt.txt 加 `{{REPORT_TEMPLATE}}` 占位符，按数据源+态数注入对应模板
2. 加 v5.3 few-shot 示例（从 v5.3 标杆提取 2-3 段示范写法，如四段式块 / callTree 标注 / GC 归因换算）
3. 注入逻辑：narrative 阶段启动时，根据 `ReportPipeline.reportTemplatePath` + `detectStateMode()` 选模板，填入 `{{REPORT_TEMPLATE}}`

**v5.3 few-shot 示例选择标准**：
- 四段式块范例（引用块 + 加粗结论 + ASCII 图 + 关键数字 + 详见 §X）
- callTree ├─/└─ 缩进 + 涨幅% + 严重程度标注范例
- GC 归因换算范例（"子树 N 次 → N 次/帧"）
- 形态演化叙事范例（"从 base 的几乎全程在算到 throttle 的半睡型"）

**约束**：
- few-shot 是**范例不是模板**——LLM 学的是写法不是抄内容
- 范例里**无**硬编码业务名（用占位符或通用化处理）
- narrative-prompt 正文仍是数据源无关骨架，`{{REPORT_TEMPLATE}}` 是注入点

**验收**：
- `narrative-prompt.txt` 含 `{{REPORT_TEMPLATE}}` 占位符
- 含 2-3 段 v5.3 few-shot 示例（四段式 / callTree / GC 归因）
- 注入逻辑：perfetto 多态 → perfetto-multi-state.txt，perfetto 单态 → perfetto-single-state.txt
- narrative LLM 产出的报告章节结构对齐 v5.3 §0-§7

### 需求 C4：perfetto explore-prompt 适配（基于 unity 适配 perfetto 工具集 + 多态判定）

**文件**：`web/server/prism/prompts/perfetto-explore-prompt.txt`（WT-027 已建，本工单补 v5.3 反向沉淀的判定逻辑）

**任务**：
1. WT-027 已建 perfetto-explore-prompt.txt 的基础版（工具集 + DR-42/43 方法论）
2. 本工单补 v5.3 的判定逻辑作为 LLM 推理任务：
   - wait slice 重叠法（off-CPU 归因：byState 给分布，wait slice 重叠法旁路定位"睡在等什么"）
   - 降频矩阵判定（per-CPU 频率时序 + 形态 ASCII + 判定矩阵）
   - GPU-bound 判定（Gfx.WaitForPresent 占比 + vsync 对比 + 矩阵结论）
   - 红线模块识别（perFrameMs + foldChange/占 p50% 双判定，多态/单态自适应）
3. 这些判定逻辑在 WT-026 A3 识别清单里列过，本工单把它们从"脚本硬编码"改成"LLM 推理任务"

**约束**：
- 判定逻辑是**推理任务描述**，不是 if-else 代码
- 不硬编码业务名/绝对阈值（用相对倍数/占比参数化）
- 多态用 foldChange（DR-43），单态用占 p50%（DR-42），explore-prompt 要说明自适应规则

**验收**：
- `perfetto-explore-prompt.txt` 含 wait slice 重叠法 / 降频矩阵 / GPU-bound 判定 / 红线识别的推理任务描述
- 判定逻辑无硬编码业务名/绝对阈值
- 多态/单态自适应规则清晰

## 验收命令

```bash
# 跑一次完整 perfetto 三段管线（WT-027 已通，本工单验证 v5.3 沉淀效果）
cd web && node --import tsx server/prism/perfetto-explore-service.ts
cd web && node --import tsx server/prism/narrative-service.ts --source perfetto
cd web && node --import tsx server/prism/render-html.ts --dir <perfetto-run-dir>

# 对照 v5.3 标杆逐项核报告结构
# 人工对照 docs/report/performance-report_perfetto_ULTIMATE_v5.3.md §0-§7

# DR-41 五条硬规则自动检查
cd web && node --import tsx server/prism/tools.test.ts

# 验证 report-utils 新能力
cd web && node --import tsx -e "
import { renderCallTreeWithSeverity, buildAsciiBar } from './server/prism/report-utils.ts';
// 测试 callTree 渲染含 ├─/└─ + 涨幅% + 标注
// 测试 ASCII 柱状图
"
```

## 验收点

1. `report-utils.ts` 含 6 项渲染能力（树状下钻/├─/└─/GC 换算/三态 ASCII/四段式/子树归并）
2. `prompts/report-templates/perfetto-multi-state.txt` 存在，§0-§7 章节骨架对齐 v5.3
3. `prompts/report-templates/perfetto-single-state.txt` 存在，单态裁剪版对齐 DR-42
4. `narrative-prompt.txt` 含 `{{REPORT_TEMPLATE}}` 占位符 + 2-3 段 v5.3 few-shot
5. `perfetto-explore-prompt.txt` 含 wait slice/降频/GPU-bound/红线判定推理任务
6. 跑一次 perfetto 三段管线，报告章节结构对齐 v5.3 §0-§7
7. 报告叙事可读性对照 v5.3（四段式 / 图文穿插 / 人话先行 / 无字段名泄漏）
8. DR-41 五条硬规则自动检查全 PASS
9. 无硬编码业务名/绝对阈值/死模板
10. `tools.test.ts` 不回归

## 约束

- **三段管线硬契约**（DR-44 §6.1）：本工单不改三段管线，只往 prompt + report-utils 沉淀能力
- **严禁硬编码**业务名/绝对阈值/死模板（DR-41 + dev/conventions.md）
- **渲染能力向上沉淀**（report-utils.ts，数据源无关）
- **判定逻辑向下沉淀**（explore-prompt，数据源特定推理任务）
- **章节模板横向沉淀**（report-templates/，数据源特定结构）
- 先读 DR-44 §4 + DR-41 + v5.3 标杆再动手

## 派发说明

本工单派给 Cursor。**必须在 WT-027 验收通过后派发**（依赖 perfetto 已接入三段管线）。

派发命令：

```powershell
.\docs\prism\process\scripts\dispatch-ticket-codebuddy.ps1 -Ticket TODO-WT-028-v53-reverse-sediment.md
```
