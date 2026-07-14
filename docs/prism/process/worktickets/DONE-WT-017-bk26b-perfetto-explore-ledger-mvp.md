# 工单 WT-017 · BK-26b-explore Perfetto explore + ledger 薄接入 MVP

> 状态：DONE（主 agent 验收 PASS）｜里程碑：M5 多源扩展 / Perfetto agent 同构｜执行方：Cursor Agent + 主 agent 直播复跑验收
> 依据：DONE-WT-013 已实现 6 个 Perfetto query，但尚未接入 Prism explore / ledger。用户明确希望把 "未实现 explore / narrative / report" 前移；本单先做 explore + evidence ledger，证明 Perfetto 不再是读 summary 写作文。

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

## 接续说明（主 agent，2026-07-14，派发前加）

本单首次派发。为避免 CodeBuddy/Cursor 在 headless 模式下重复诊断导致外层 10 分钟超时（WT-014 已踩过 3 次），施工方必须遵守以下约束：

### 已确认的前置状态（不要重新验证，直接信）

- WT-013 6 个 query 已在 `web/server/prism/tools.ts` 实现，CLI 已在 `tools.cli.ts` 注册，支持 `single`/`batch`，provenance 含 `source:'perfetto'/role`。
- WT-014 已修复：三组 triad profile 已重新 build，base callTrees 经 PlayerLoop anchor fallback 已非空（1 棵含 PlayerLoop hotPath），cur/throttle 各 1 棵未退化；sidecar（thermal/manifest/cpuinfo）已入 `detail.perfetto.throttling`。
- 测试基线：`cd web && node --import tsx server/prism/tools.test.ts` → 116 PASS。
- triad 数据路径：`web/data/prism-out/bk26b-perfetto-triad/{base,cur,throttle}/perfetto-profile.json` + `perfetto-profile-summary.json`，均存在且可用。

### 实现路径（建议，非强制，但偏离需在完工报告说明）

1. **新增一个 deterministic scripted 脚本**，不要接 LLM explore（MVP 不要求 LLM，scripted loop 更稳、更省时）。
   - 建议路径：`web/server/scripts/perfetto-explore-mvp.ts`（一次性脚本，半正式）。
   - 或：`web/server/prism/perfetto-explore-mvp.ts`（若更贴合现有 prism 模块组织）。
2. **脚本逻辑**：
   - 对 `base`/`cur`/`throttle` 三个 role，依次调用 6 个 query（`correlateFrameSchedCpu` 只需 cur/throttle）。
   - 每次 query 调用记录一条 evidence 进 ledger（结构见下）。
   - 跑完所有 query 后，从 ledger evidence 派生 findings/verdict（deterministic 规则，不接 LLM）。
3. **ledger evidence 结构**（每条 query 调用一条）：
   ```ts
   { id, tool, role, args, provenance, summary, dataRefs? }
   ```
   - `id` 建议格式 `ev-<role>-<tool>-<idx>` 或 `ev-<seq>`。
   - `summary` 一句话写关键数字（如 `cur UnityMain runningPct=77.82`）。
   - `provenance` 直接来自 query 返回的 provenance。
4. **findings 结构**（至少 3-5 条，覆盖 base/cur/throttle）：
   ```ts
   { id, title, severity, evidenceIds: string[], claim, boundary }
   ```
   - 每条 finding 必须引用 ledger 中已存在的 evidenceIds。
   - `boundary` 字段必须诚实写（如 `window-only correlation`、`FrameTimeline unavailable`、`base callTree via fallback`）。
5. **verdict 结构**：顶层三态主要结论，参考工单目标第 3 节示例。
6. **三个边界必须显式记录**（写进 ledger 或 findings.boundary）：
   - base callTree 非空但是 fallback 来的（WT-014 parseNotes 有说明）→ finding 里注明 `via PlayerLoop anchor fallback`。
   - FrameTimeline 缺失 → `available:false`，不写 jank finding。
   - `correlateFrameSchedCpu` → `granularity:'window'`，不声称逐帧。

### 产物路径（强制）

写到 `web/data/prism-out/bk26b-perfetto-explore-mvp/`：
- `ledger.json`
- `findings.json`
- `verdict.json`
- `run.log`（脚本 stdout 重定向即可）

### 复现命令（必须在完工报告列出）

脚本必须可一条命令跑出全部产物，例如：
```bash
cd web && node --import tsx server/scripts/perfetto-explore-mvp.ts
```

### 时间预算约束

- 施工方不要跑完整 LLM explore（会超时）。
- 不要重跑 provider build（WT-014 已跑过，profile 已就绪）。
- 不要重新诊断 WT-013/WT-014 是否正确——前置状态已确认，直接信。
- 脚本本身的 query 调用是同步读 JSON，秒级完成，不会超时。

### 自测要求

- 脚本跑通，4 个产物文件生成且 JSON 合法。
- `cd web && node --import tsx server/prism/tools.test.ts` 仍 116 PASS（不应退化）。
- 不要求新增测试，但若新增测试不得退化既有 116 PASS。

## 完工报告（施工方填）

> 施工时间：2026-07-14｜执行方：Cursor Agent｜范围：Perfetto explore + evidence ledger MVP（不含 narrative/report）

### 1. 改了什么

| 文件 | 变更 |
|---|---|
| `web/server/scripts/perfetto-explore-mvp.ts` | **新增** deterministic scripted explore loop：对 base/cur/throttle 调用 WT-013 六工具（`correlateFrameSchedCpu` 仅 cur/throttle），写 ledger → 派 findings/verdict；无 LLM。 |
| `web/data/prism-out/bk26b-perfetto-explore-mvp/ledger.json` | 17 条 evidence（每条含 id/tool/role/args/provenance/summary/facts）。 |
| `web/data/prism-out/bk26b-perfetto-explore-mvp/findings.json` | 6 条 findings，均回链 evidenceIds。 |
| `web/data/prism-out/bk26b-perfetto-explore-mvp/verdict.json` | 三态结论 + 三条边界。 |
| `web/data/prism-out/bk26b-perfetto-explore-mvp/run.log` | 运行日志。 |
| 本工单 | 回填完工报告并改 REVIEW-。 |

未改：`tools.ts` / `tools.cli.ts` / provider / narrative / plan/backlog / state/now。

### 2. 复现命令

```bash
cd web && node --import tsx server/scripts/perfetto-explore-mvp.ts
# → 覆盖写入 web/data/prism-out/bk26b-perfetto-explore-mvp/{ledger,findings,verdict}.json + run.log

cd web && node --import tsx server/prism/tools.test.ts
# 预期：116 PASS（本单未触碰 tools.ts / tools.test.ts）
```

### 3. findings 摘要

| id | severity | title | boundary |
|---|---|---|---|
| f-01 | info | Android FrameTimeline unavailable across triad | FrameTimeline unavailable; no jank finding |
| f-02 | info | base callTree via PlayerLoop anchor fallback | via PlayerLoop anchor fallback |
| f-03 | warning | throttle CPU freq ↓ 与 UnityMain running/sleeping 同向（window） | window-only correlation |
| f-04 | info | cur vs throttle PlayerLoop / BehaviourUpdate / FinishFrameRendering | atrace + callTree hotPath |
| f-05 | info | correlateFrameSchedCpu window-only | granularity:window |
| f-06 | info | base vs cur UnityMain sched snapshot | window sched |

关键数字（来自 triad profile / query 契约，与 tools.test fixtures 一致）：
- cur UnityMain runningPct=77.82；throttle=56.99；base=86.94
- cur avgMhz=1576.3 → throttle=1324.6；throttle bigCoreReachPct=59.2；throttlingLevel=suspected
- FrameTimeline `available=false`（三态）；不成 jank finding
- FinishFrameRendering 来自 callTree hotPath（atrace 顶层无该 key）

### 4. 三个边界（已显式记录）

1. **base callTree fallback** — f-02 / ledger `viaPlayerLoopAnchorFallback:true`
2. **FrameTimeline 缺失** — f-01 / evidence facts `androidFrameTimelineAvailable:false`，无 jank finding
3. **window-only correlation** — f-03 / f-05 / correlate evidence `granularity:'window'`

### 5. 自测 / 偏离说明

**偏离（环境）**：本会话 Cursor Shell 无法启动 Bash（`Can't find Bash` / 无 exit status），因此 **未能在会话内直播跑** `node --import tsx …`。产物按 `perfetto-explore-mvp.ts` 的确定性规则、对照 triad JSON 与 WT-013 query 返回契约手写落地；`run.log` 末尾已注明。

**主 agent 验收请必跑**：上面两条复现命令，用直播脚本输出覆盖产物，并确认 `tools.test.ts` 仍 116 PASS。

**范围**：未接 LLM explore；未实现 narrative/report；未修 provider/callTrees；未宣称逐帧相关。

## 验收结论（主 agent 填）

**验收结论：PASS（WT-017 / BK-26b-explore Perfetto explore + evidence ledger MVP 通过）。**

DR-36 核验摘要（主 agent 2026-07-14 亲自跑）：

1. **脚本直播跑通**：`cd web && node --import tsx server/scripts/perfetto-explore-mvp.ts` exit 0，4 个产物文件全部生成（ledger.json / findings.json / verdict.json / run.log）。直播输出已覆盖施工方手写产物，最终交付的是脚本真实输出。
2. **Ledger 覆盖三组 triad**：17 evidence = base/cur/throttle 各 5（sched+atrace+frame+cpu+calltree）+ cur/throttle 各 1 correlate。每条 evidence 含 `id/tool/role/args/provenance/summary/facts/dataRefs`，provenance 含 `runId/tool/args/source:'perfetto'/role`。
3. **findings 回链 evidenceIds**：6 findings（f-01..f-06）全部引用 ledger 中已存在的 evidence id，无悬空引用。
4. **三个边界全部显式记录**：
   - base callTree `via PlayerLoop anchor fallback` → f-02 + ledger facts `viaPlayerLoopAnchorFallback:true`。
   - FrameTimeline 三态 `available:false` → f-01，未写 jank finding。
   - `correlateFrameSchedCpu granularity:window` → f-03/f-05，claim 明确 "not per-frame"。
5. **覆盖 base/cur/throttle**：f-02(base callTree)、f-06(base vs cur sched)、f-03/f-04(cur vs throttle)。
6. **关键数字真实可回溯**：base/cur/throttle UnityMain runningPct=86.94/77.82/56.99；avgMhz=1729.5/1576.3/1324.6；throttle bigCoreReachPct=59.2、throttlingLevel=suspected；PlayerLoop count=684/484/428。均来自 WT-013 query 返回，非脑补。
7. **测试未退化**：`cd web && node --import tsx server/prism/tools.test.ts` → 116 PASS, 0 FAIL。
8. **未越界**：git status 确认只新增脚本 + 产物目录 + 工单改名 + 派发日志；未碰 tools.ts/tools.cli.ts/provider/narrative/采集脚本。
9. **施工方偏离判定**：施工方诚实交代 Cursor shell 在 headless 模式不可用，无法自测脚本，改为按脚本逻辑对照 triad JSON 手写产物。主 agent 直播跑脚本后，输出与施工方手写产物关键数字完全一致——说明施工方确实按脚本规则手写、未造假。直播脚本输出已覆盖手写产物，最终交付的是脚本真实输出。偏离可接受。

结论：WT-017 可标记 DONE。机制验证成立——Perfetto 能走 "query 工具 → provenance → evidence ledger → findings/verdict"，不依赖读 summary 写作文。下一步建议进入 `WT-018`：基于 WT-017 产物生成 Prism 标准 `narrative.json + report.html`。
