# 工单 WT-001 · BK-17 HTML 报告结构美化 + §0 空正文修复

> 状态：TODO（待施工）｜里程碑：M1 单次质量收尾｜执行方：Cursor
> 依据：`docs/prism/state/m1-gap-analysis.md`（BK-17 缺目录导航；B-A md版§0空正文）

## 背景

Prism 单次分析报告有两个 renderer：`render-html.ts`（HTML 彩色版，主力）和 `render-report.ts`（md 版）。当前 HTML 版已有分群标题、彩色火焰条调用树、多级字号，但**缺章节目录导航**（长报告无法快速跳转）；md 版 §0"结论先行"渲染出**空正文**（只有标题）。本工单修这两处呈现问题。**不碰分析逻辑、不碰查询工具、不碰 prompt。**

## 目标（做完什么样，可观测）

1. HTML 报告顶部有**目录导航**，点击可跳到对应章节（核心结论/主题分群各群/优化优先级）。
2. HTML 报告**主题分群的每个群标题（heading）有区分色**（不同群不同色带/底色），视觉层次更清晰。
3. md 版 §0"结论先行"**不再是空标题**——每条主因下有实际描述文字。

## 改哪些文件（精确；本工单只允许动这三个）

- `web/server/prism/render-html.ts`（目录导航 + 主题群上色）
- `web/server/prism/render-report.ts`（§0 空正文修复）
- 如需类型辅助可读 `web/server/prism/narrative-types.ts`（**只读不改**，除非确需加可选字段）

> ⚠️ 禁止改：`tools.ts` / `explore-service.ts` / `prompts/*.txt` / 任何分析逻辑。这些属别的工单，改了会与并行工单冲突。

## 具体要求

### 任务1：HTML 目录导航（render-html.ts）
- 在报告顶部（overview-block 之后、核心结论之前）加一个**目录区块**：列出本报告所有章节 —— "核心结论"、"主题分群"下的**每个 section.heading**、"优化优先级"。
- 每个目录项是**锚点链接**（`<a href="#xxx">`），点击平滑跳到对应章节。
- 对应地，给各 `section-title` 和每个主题群标题加 `id` 锚点。
- 目录样式简洁：不要花哨，一个竖排列表或紧凑横排即可，能跳转就行。

### 任务2：主题群上色（render-html.ts）
- 当前 `renderHTML` 里第 733 行附近渲染"主题分群"，每个 `NarrativeSection` 有 `heading`。给**每个群的 heading 加一条区分色的左边框或底色带**（颜色可按群序号循环取一组预设色，如稳态群蓝/尖峰群橙/线程群紫/已排除群灰——但**不要硬编码群名判断**，按序号或已有的分类线索取色即可）。
- 目的：让读者一眼看出"这是第几组、组和组的边界在哪"。字号分级已有，不用动。

### 任务3：md 版 §0 空正文修复（render-report.ts）
- 现象：`render-report.ts` 第 340 行起的 §0"结论先行"，用 `verdict.primaryDrivers` 渲染，当 driver 的 `impact` 为空时，标题下就没内容了（见 report.md 第 20-31 行 4 条标题全空）。
- 修法：§0 每条主因，**除了 driver 名，还要渲染出它的贡献/影响描述**。数据源优先用 `narrative.topConclusions`（它有 `problem` + `kind` + `contribution` 字段，内容完整），回退到 verdict.primaryDrivers。让 §0 每条都有"问题名 + 类型 + 对整体的贡献"这样一句实在的描述。
- 参考：`narrative.topConclusions[].contribution` 形如"19次相机移动100%命中极慢帧，占全部27个极慢帧70%"——把这种话渲染到 §0。

## 禁止事项

- 不改任何分析/查询/探索逻辑，不动 prompt。
- 不重构 renderer 整体结构，只做上述三处增量。
- 不引入新的第三方依赖（保持单文件内联 CSS/JS 的现状）。
- 不过度设计：目录不要做成可折叠树、不要加搜索框等，能跳转即可。

## 验收标准（主 agent 照此逐条核，客观可验）

1. 重新渲染报告：`cd web && node --import tsx server/prism/render-html.ts --dir web/data/prism-out/unity-outside-stressmove/2026-07-09_07-48-53`（或最新 run 目录），生成的 report.html：
   - [ ] 顶部有目录，`grep -c 'href="#"' report.html` > 0
   - [ ] 点击目录项能跳转（锚点 id 与 href 对应，人工开浏览器验一次）
   - [ ] 每个主题群标题有区分色（视觉核）
2. 重新渲染 md：对应命令生成 report.md：
   - [ ] §0 结论先行每条主因下有非空描述文字（`grep -A1 '结论先行'` 后各条有内容）
3. `cd web && npx tsc --noEmit`（或项目既有的类型检查命令）不新增类型错误。
4. 原有功能不回归：火焰条调用树、核心结论表、已排除项 strip 仍正常渲染。

## 完工报告（施工方 Cursor 填）

<!-- 改了哪些文件、每处改动做了什么、怎么自测的（跑了什么命令、看了什么）、有无偏离规格 -->

## 验收结论（主 agent 填）

<!-- PASS / 打回+具体原因 -->
