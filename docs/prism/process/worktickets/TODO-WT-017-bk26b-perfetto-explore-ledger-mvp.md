# 工单 WT-017 · BK-26b-explore Perfetto explore + ledger 薄接入 MVP

> 状态：TODO（待施工）｜里程碑：M5 多源扩展 / Perfetto agent 同构｜执行方：Cursor/CodeBuddy agent
> 依据：DONE-WT-013 已实现 6 个 Perfetto query，但尚未接入 Prism explore / ledger。用户明确希望把 “未实现 explore / narrative / report” 前移；本单先做 explore + evidence ledger，证明 Perfetto 不再是读 summary 写作文。

## 背景

WT-010/011/013 已完成：

- Perfetto triad 数据层可进入 `PerfProfile`。
- 新版 triad 有 base / cur / throttle 三态差分。
- 6 个 Perfetto query 已可从 JSON profile 读真实数字，并保留 provenance。

但目前 Perfetto 仍缺 Prism agent 层：没有工具探索回合、没有 evidence ledger、没有 findings/verdict 结构化输出。若直接做报告，容易退化成“读 summary 写作文”。

本单目标是最小接入 explore + ledger，不追求漂亮报告。

## 目标

实现 Perfetto explore + evidence ledger MVP：

1. 基于 WT-013 的 6 个 query，跑一个 deterministic / scripted 的 Perfetto exploration loop。
2. 输出 evidence ledger，记录每个 query 调用、args、provenance、关键数字。
3. 输出最小 `findings.json` / `verdict.json` 或等价结构化产物。
4. 至少能比较 `cur` 与 `throttle`，并能诚实处理 `base` 空 callTree。
5. 不生成 `narrative.json` / `report.html`，那是 WT-018。

## 参考输入

- `docs/prism/process/worktickets/DONE-WT-013-bk26b-perfetto-query-tools-mvp.md`
- `docs/prism/process/worktickets/TODO-WT-014-bk26b-provider-sidecar-calltrees-fix.md`（若 WT-014 已完成，优先使用修复后的 profile）
- `web/server/prism/tools.ts`
- `web/server/prism/tools.cli.ts`
- `web/server/prism/explore-service.ts` / `explore-prompt` 相关现有 Prism explore 代码（只读后决定复用方式）
- `web/data/prism-out/bk26b-perfetto-triad/{base,cur,throttle}/perfetto-profile.json`
- `web/data/prism-out/bk26b-perfetto-triad/{base,cur,throttle}/perfetto-profile-summary.json`

## 建议产物路径

优先写到：

- `web/data/prism-out/bk26b-perfetto-explore-mvp/ledger.json`
- `web/data/prism-out/bk26b-perfetto-explore-mvp/findings.json`
- `web/data/prism-out/bk26b-perfetto-explore-mvp/verdict.json`
- `web/data/prism-out/bk26b-perfetto-explore-mvp/run.log`

如已有 Prism 结果目录规范更适合，可沿用，但完工报告必须写清楚。

## 具体要求

### 1. 工具调用集合

至少调用并进入 ledger：

- `querySchedState`：base / cur / throttle
- `queryAtraceSlices`：base / cur / throttle
- `queryFrameTimeline`：base / cur / throttle
- `queryCpuFreq`：base / cur / throttle
- `getPerfettoCallTree`：base / cur / throttle
- `correlateFrameSchedCpu`：cur / throttle

允许用 CLI batch 或直接调用 TS 函数；必须保留每次调用的 provenance。

### 2. evidence ledger

Ledger 每条 evidence 至少包含：

```ts
interface PerfettoEvidenceItem {
  id: string;
  tool: string;
  role: 'base' | 'cur' | 'throttle';
  args: Record<string, unknown>;
  provenance: Record<string, unknown>;
  summary: string;
  dataRefs?: string[];
}
```

要求：

- 不把没有 provenance 的数字写入 findings。
- base callTree 空树必须作为 ledger 事实记录：`available:false`，而不是失败或合成树。
- FrameTimeline 缺失必须作为能力边界记录：`available:false`，不得写 jank finding。

### 3. findings / verdict 最小结构

不要求复用完整 Unity narrative schema，但必须结构化、可供 WT-018 消费。

至少包含：

- `source: 'perfetto'`
- `sampleSet: 'bk26b-perfetto-triad'`
- `findings[]`：每条含 title / severity / evidenceIds / claim / boundary
- `verdict`：当前三态主要结论，例如：
  - throttle CPU 频率下降与 UnityMain running/sleeping 变化同向（窗口级）
  - cur/throttle PlayerLoop / BehaviourUpdate / FinishFrameRendering 差异
  - FrameTimeline / GPU 不可用，不能判断 Android jank/GPU busy

### 4. 探索纪律

- 必须从 query 结果推导，不许直接读 summary 后自由写结论。
- 可以是 deterministic scripted loop，不强制 LLM explore。
- 若使用 LLM，只能解释 ledger 已有 evidence，不得引入未查询数字。
- `correlateFrameSchedCpu` 只能写 window 级，不得声称逐帧相关。

## 允许修改文件

施工方可根据现有结构最小选择：

- `web/server/prism/tools.cli.ts`（如需 batch 输出适配）
- `web/server/prism/*perfetto*explore*.ts`（可新增最小脚本/服务）
- `web/server/scripts/*perfetto*explore*.ts`（可新增一次性/半正式脚本）
- `web/data/prism-out/bk26b-perfetto-explore-mvp/**`（产物）
- `web/server/prism/*.test.ts` 或新增相关测试
- 本工单文件（回填完工报告并改 REVIEW）

若需要改其它文件，必须在完工报告说明原因和范围。

## 禁止事项

- 不要实现 narrative/report/html；那是 WT-018。
- 不要修 provider sidecar/base callTrees；那是 WT-014。
- 不要伪造 FrameTimeline / GPU / thermal / callTree。
- 不要宣称逐帧相关。
- 不要把 markdown skeleton 当 Prism 标准报告。

## 验收标准

1. 产出 ledger + findings/verdict 结构化文件。
2. Ledger 覆盖三组 triad，且每个 finding 能回链到 evidenceIds/provenance。
3. base callTree 空树、FrameTimeline 缺失、window-only correlation 三个边界被明确记录。
4. 至少有一个命令可复现生成产物。
5. 测试或 smoke 命令通过。
6. 完工报告列出命令、产物路径、findings 摘要、边界。

## 完工报告（施工方填）

待填写。

## 验收结论（主 agent 填）

待验收。
