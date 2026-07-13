# 工单 WT-015 · BK-23-report-confidence 报告层消费 source confidence

> 状态：TODO（待施工）｜里程碑：报告可信度 / 源码归因消费｜执行方：Cursor/agent
> 依据：DONE-WT-012 已让 `getSourceForSymbol` 返回 confidence，但报告层尚未按 confidence 控制源码建议强度。

## 背景

WT-012 解决了 marker/source mapping 的最小闭环：`exact-codegraph`、`method-anchored`、`alias-exact` 可作为较强源码归因；`class-anchored`、`map-source-interval`、`low-confidence` 只能弱提示。报告层如果仍只看 `found=true`，会把低置信定位误写成强行级优化建议。

## 目标

报告/叙事阶段消费 source confidence，避免低置信源码映射被当成 exact 建议。

## 参考文件

- `docs/prism/process/worktickets/DONE-WT-012-bk23a-marker-alias-table-mvp.md`
- `web/server/prism/tools.ts`
- `web/server/prism/render-html.ts`
- `web/server/prism/prompts/narrative-prompt.txt`
- `web/server/prism/render-report.ts`
- 真实报告产物 `web/data/prism-out/unity-outside-stressmove/2026-07-11_14-55-28/`

## 要求

1. 定义报告层使用规则：
   - `exact-codegraph` / `method-anchored` / `alias-exact`：可给较强源码建议。
   - `file-anchored`：可给文件/局部范围提示，但不能断言具体函数。
   - `class-anchored`：只能类级提示。
   - `map-source-interval`：只能说采样点附近，不等于函数体。
   - `low-confidence` / `suspicious`：只能标注风险，不给强修复建议。
2. narrative prompt 或 rendering 中要展示/保留 confidence 信息。
3. 不要扩大重写报告系统；只做最小消费链路。
4. 选择 2–3 个真实 marker 验证输出差异，例如 OnCameraMove、MUI_UpdateUIPos、CS:AOE.MeshUIManager。

## 验收标准

1. 报告不会把 `class-anchored` / `map-source-interval` / `low-confidence` 写成精确函数级建议。
2. 高置信 marker 仍可输出源码建议。
3. 有测试或黄金片段对比。
4. 完工报告说明实际影响。

## 完工报告（施工方填）

待填写。

## 验收结论（主 agent 填）

待验收。
