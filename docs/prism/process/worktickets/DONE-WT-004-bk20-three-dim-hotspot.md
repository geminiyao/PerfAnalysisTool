# 工单 WT-004 · BK-20 单源三维热点判定 + 诚实标注"能判/判不了"

> 状态：REVIEW（待验收）｜里程碑：M1 单次质量收尾（收官单）｜执行方：Cursor
> 依据：`docs/prism/plan/backlog.md` BK-20 + `docs/prism/state/m1-gap-analysis.md`（BK-20 内核已隐式用、缺显式化）

## 背景（为什么做）

Prism 报告现在已按"贡献度"给热点排序、也有辨伪（"这几项查证后不用管"），但**三维判定是隐式的**：报告没有显式说清每个热点"是绝对量大、还是占比高、还是离群严重"，也没有诚实声明"哪些结论单源能判、哪些判不了"。

这一单把已有的隐式判断**显式化 + 诚实化**，是 M1 单次质量的收官提升。**纯写作层/结构层改动，不碰查询工具、不碰源码归因逻辑。**

三维定义（backlog BK-20）：
- **绝对量**：占帧预算多少（如 2.3ms 占 16.6ms 预算的 14%）——能判整体达标与否的硬指标。
- **占比/贡献度**：占总 CPU / 累计总量（如"每帧2.3ms×600帧=1381ms，全场self最高"）——已在用。
- **离群度**：自己跟自己比的内生 baseline（spikeRatio、p99/mean）——发现"偶发炸"。

诚实标注（关键，这是超越作文机的"知道自己边界"）：
- **能判的**：整体是否超帧预算（有绝对基线 16.6ms/60fps）、某项在本次采集内的相对大小/离群程度（内生可比）。
- **判不了的**：单个 marker"这笔开销该不该管/正不正常"——**单源结构上判不了**，需要历史基线（diff）或业务知识（知识回路）。报告要**诚实说出来**，而不是假装能判。

## 目标（做完什么样，可观测）

1. `topConclusions` 每个热点显式带**三维定性标注**：它主要是"绝对量大 / 占比高 / 离群严重"中的哪一类（可多标），而不只是一句 contribution。
2. 报告显式出现**"判定边界"声明**：哪些结论是单源能确定的（超没超预算、相对大小），哪些是单源判不了、需要基线/业务知识的（某项该不该管）。
3. 热点判定遵循**可插拔降级链**（backlog 护栏）：有业务知识用知识判 → 没有 fallback 时间基线 → 再没有 fallback 通用三维，**绝不"缺参照就瘫痪"**。当前单源无历史基线/知识回路，所以实际走"通用三维 + 诚实标注判不了"这一档——prompt 要让分析师明白这个降级逻辑并如实呈现。

## 改哪些文件（精确；本单只允许动这两个）

- `web/server/prism/prompts/narrative-prompt.txt`（叙事写作纪律：加三维显式标注 + 判定边界声明的要求和示例）
- `web/server/prism/narrative-types.ts`（给 `TopConclusionRow` 加承载三维标注的可选字段；若需要，加一个承载"判定边界声明"的可选顶层字段）

> ⚠️ 只读不改：`tools.ts` / `explore-prompt.txt` / `explore-service.ts` / renderer（`render-html.ts`/`render-report.ts`）。
> ⚠️ **renderer 暂不改**：本单只改"分析师写什么"（prompt）和"数据结构能装什么"（types）。渲染新字段是可选的后续小单，本单不做，避免与 renderer 冲突、也避免过度。新加字段设为**可选**，renderer 不读它也不报错。

## 现状（施工方必读）

- `narrative-prompt.txt`：叙事阶段 prompt。第 19-22 行已讲"按对整体贡献排序"；第 52-55 行 topConclusions 结构示例里已有 `contribution` 字段（形如"19次移动100%命中极慢帧,占极慢帧70%"）。**本单在此基础上加三维显式化 + 判定边界，不是推翻重写。**
- `narrative-types.ts`：`TopConclusionRow`（第 47-53 行）现有 `rank/problem/kind/contribution/severity`。`NarrativeReport`（第 55-69 行）顶层有 overview/topConclusions/ruledOut/sections/prioritySummary。
- 帧预算基线：60fps=16.6ms/帧（explore 侧 F8 帧预算判定已在用，narrative 可直接引用这个绝对基线）。

## 具体要求

### 1. narrative-types.ts — 加可选字段
- `TopConclusionRow` 加**可选**字段承载三维定性，建议：
  ```ts
  /** 三维定性：这个热点主要属于哪一类（可多选）。absoluteCost=绝对量大/占帧预算显著；shareHigh=占总量/贡献度高；outlier=离群严重(spikeRatio/p99高) */
  dimensions?: Array<'absoluteCost' | 'shareHigh' | 'outlier'>;
  /** 单源可判性：这条结论单源能不能下定论。judgable=能判(有绝对基线/内生可比)；needsBaseline=该不该管需历史基线；needsDomainKnowledge=需业务知识 */
  judgability?: 'judgable' | 'needsBaseline' | 'needsDomainKnowledge';
  ```
- `NarrativeReport` 顶层加**可选**字段承载整体判定边界声明，建议：
  ```ts
  /** 判定边界诚实声明：单源这次能确定什么、判不了什么（超越作文机的"知道自己边界"）。可选。 */
  judgmentBoundary?: { canJudge: string[]; cannotJudge: string[] };
  ```
- 字段全部可选，不破坏现有结构、renderer 不读也不报错。加清晰注释。

### 2. narrative-prompt.txt — 加写作纪律 + 示例
- 在"问题先行+按贡献排序"那节（第 19-22 行附近）后，**增补三维显式化要求**：每个 topConclusion 除 contribution 文字外，标出 `dimensions`（绝对量大/占比高/离群严重，可多标）和 `judgability`（这条单源能不能下定论）。给正例。
- **增补"判定边界"写作要求**：报告要有一处诚实声明——单源这次能判什么（整体超没超 16.6ms 预算、各项相对大小/离群度）、判不了什么（单个 marker 该不该管，需历史基线 diff 或业务知识）。写进 `judgmentBoundary` 字段。给正例。
- **讲清降级链逻辑**：让分析师明白"热点该不该管"的判定是可插拔的——有业务知识用知识、没有用历史基线、再没有用通用三维+诚实标注判不了；当前单源无基线无知识，所以老实走"通用三维 + 声明判不了"，**不许假装能判、也不许因缺参照就不给任何判断**。
- 更新末尾 topConclusions 的 JSON 示例，带上 `dimensions`/`judgability`，并加一个 `judgmentBoundary` 示例。

### 3. 正例/反例
- ✅ 正例：`{"rank":1,"problem":"相机移动必卡","kind":"高频尖峰","contribution":"19次移动100%命中极慢帧,占极慢帧70%","dimensions":["outlier","shareHigh"],"judgability":"judgable","severity":"critical"}`
- ✅ 正例 judgmentBoundary：`{"canJudge":["整体帧时中位数X ms,超/未超16.6ms预算","相机移动是本次采集内离群最严重的尖峰源"],"cannotJudge":["行军线每帧2.3ms在本游戏压测下算不算正常——需历史基线或业务知识,单源判不了"]}`
- ❌ 反例：把"判不了该不该管"的项硬写成"这是问题必须优化"——违背诚实标注。
- ❌ 反例：因为"单源判不了该不该管"就对所有热点不给任何定性——降级链要求至少给通用三维。

## 禁止事项

- 不碰 tools.ts / explore-prompt.txt / explore-service / renderer。
- 不改 `TopConclusionRow` 现有字段，只**新增可选**字段。
- 不引第三方依赖。不过度设计：三维就三类、judgability 就三档，不再细分；不做打分/权重系统。
- 不为了显式化而堆砌——每个标注要有实际信息，不是贴标签凑数。

## 验收标准（主 agent 照此逐条核，客观可验）

1. **tsc**：`cd web && npx tsc --noEmit`，`narrative-types.ts` 零新增类型错误（新字段可选、不破坏引用它的 renderer/explore-service）。
2. **类型字段就位**：`narrative-types.ts` 的 `TopConclusionRow` 有可选 `dimensions` + `judgability`，`NarrativeReport` 有可选 `judgmentBoundary`，均带注释，均为可选。
3. **prompt 改动到位**（人工核 prompt 文本）：
   - narrative-prompt.txt 出现三维显式化要求（绝对量/占比/离群）+ 对应 JSON 示例带 `dimensions`/`judgability`；
   - 出现"判定边界"诚实声明的写作要求 + `judgmentBoundary` 示例；
   - 出现降级链逻辑说明（有知识用知识→有基线用基线→都没有用通用三维+诚实标注判不了）。
4. **向后兼容**：现有 renderer（render-html.ts/render-report.ts）不读新字段仍能正常渲染——`cd web` 跑一次 renderer（`node --import tsx server/prism/render-html.ts --dir web/data/prism-out/unity-outside-stressmove/2026-07-09_07-48-53`）不报错、输出正常。
5. **不越界**：只改 narrative-prompt.txt + narrative-types.ts。

> 说明：本单不产出"重跑探索后的新报告"（那要 40min 探索、且属另一层验证）。验收只核"分析师被要求这么写(prompt)"+"数据结构能装(types)"+"不破坏现有渲染"。真实报告里三维标注的效果，待后续整体重跑探索时随 M1 收尾一起看。

## 完工报告（施工方填：改了什么、怎么自测的、有无偏离）

### 改了什么

1. **`web/server/prism/narrative-types.ts`**
   - `TopConclusionRow` 新增可选字段 `dimensions?: HotspotDimension[]`、`judgability?: HotspotJudgability`，均带 JSDoc 注释。
   - 提取 `HotspotDimension` / `HotspotJudgability` 两个 type alias（便于复用，不改变语义）。
   - `NarrativeReport` 新增可选顶层字段 `judgmentBoundary?: { canJudge: string[]; cannotJudge: string[] }`，带注释。
   - 现有字段未改动。

2. **`web/server/prism/prompts/narrative-prompt.txt`**
   - 在「问题先行 + 按贡献排序」节后增补「三维显式标注」写作纪律（absoluteCost/shareHigh/outlier + judgability 三档）及正例。
   - 新增第 3 节「判定边界诚实声明」+ 降级链逻辑（知识→基线→通用三维+诚实标注判不了）+ 正反例。
   - 原第 3~5 节顺延为第 4~6 节。
   - 末尾 JSON 示例更新：`topConclusions` 带 `dimensions`/`judgability`，新增 `judgmentBoundary` 示例；要求列表同步补充。

### 怎么自测的

- **类型**：`read_lints` 对 `narrative-types.ts` 零诊断；新字段均为 optional，现有 `render-report.ts` 仅 import `TopConclusionRow` 读 `rank/problem/kind/contribution/severity`，不访问新字段，向后兼容。
- **prompt 文本**：人工核对三维显式化、判定边界、降级链、JSON 示例均已写入（grep 可核）。
- **tsc / renderer 命令**：施工环境 shell 当次不可用，未能实际执行 `npx tsc --noEmit` 与 `render-html.ts` 冒烟；请主 agent 验收时补跑验收标准 1、4。

### 有无偏离

- **轻微偏离**：types 侧额外提取了 `HotspotDimension` / `HotspotJudgability` 两个 type alias（工单建议 inline union，语义完全一致，未引入新类型档或打分系统）。
- **其余无偏离**：仅改工单声明的两个文件；未碰 tools/explore/renderer；未改 plan/backlog/now.md；未提交 git。

## 验收结论（主 agent 填：PASS / 打回+原因）

**PASS（2026-07-11，主 agent 独立验收；施工方 shell 故障未自测，主 agent 补跑全部命令）**

逐条核对（DR-36 不信自报，亲自 diff + 跑命令）：
1. ✅ **tsc**：`cd web && npx tsc --noEmit` 全项目仅 1 error（tsconfig baseUrl deprecated 警告，与本次无关），narrative 相关**零新增错误**。
2. ✅ **类型字段就位**：`TopConclusionRow` 有可选 `dimensions?: HotspotDimension[]` + `judgability?: HotspotJudgability`；`NarrativeReport` 有可选 `judgmentBoundary?: {canJudge,cannotJudge}`；均带注释、均可选。额外提取的两个 type alias 合理（提升可读性、语义不变），**不算越界**。
3. ✅ **prompt 改动到位**（读全 diff 核对）：三维显式化(absoluteCost/shareHigh/outlier)+judgability 三档+正例；判定边界 judgmentBoundary 写作要求+正例；降级链逻辑(知识→基线→通用三维+诚实标注判不了)；末尾 JSON 示例已更新带新字段；编号顺延 3→4→5→6 正确。
4. ✅ **向后兼容**：`cd web && node --import tsx server/prism/render-html.ts --dir data/prism-out/unity-outside-stressmove/2026-07-09_07-48-53` 正常跑通——report.html 重新生成(44.2KB，7棵调用树重查)，**无报错**，renderer 不读新可选字段仍正常。
5. ✅ **未越界**：只改 narrative-prompt.txt + narrative-types.ts。
6. ✅ **施工方诚实**：完工报告主动声明 shell 不可用未自测、并如实报告 type alias 轻微偏离——符合验收协议精神。

**说明**：本单只验"分析师被要求这么写(prompt)+数据结构能装(types)+不破坏现有渲染"，均通过。真实报告里三维标注的效果待 M1 收尾整体重跑探索时随之验证（工单已声明不在本单范围）。**BK-20 内核(隐式三维)→显式化+诚实边界，M1 单次质量收官提升完成。**
