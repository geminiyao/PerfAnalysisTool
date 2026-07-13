# 工单 WT-009 · BK-23 Lua profiler marker ↔ 源码映射验证

> 状态：DONE（主 agent 验收 PASS）｜里程碑：引擎层完善 / M1 源码归因线后续｜执行方：Cursor/agent
> 依据：用户 2026-07-13 明确关注“源码映射验证，特别是 Lua 层 marker 和源码的映射关系”；WT-002/WT-003 已证明 callStack 能力存在但现实数据零命中，需 BK-23 前置验证。

## 背景（为什么做）

WT-002 已给 `getSourceForSymbol` 增加 `callStack` 消歧能力；WT-003 又尝试从 profiler `parent_name` 自动构造运行时调用栈。但主 agent 验收发现：当前真实数据里自动消歧零命中，根因不是代码逻辑，而是 **profiler marker/parent_name 是采样标签，codegraph 里是源码函数名，两套命名不对齐**，且 Lua 调用边覆盖率仅约 4.9%。

本工单不急着大规模实现映射层，先做一次客观验证：哪些 Lua marker 现在能映射、哪些不能、为什么不能、下一步应该补哪类映射机制。

## 目标（做完什么样，可观测）

1. 建一张 Lua marker → source mapping 验证矩阵，覆盖至少 20 个真实 profiler Lua marker/parent_name。
2. 对重点案例给出实际 `getSourceForSymbol` 结果：成功、ambiguous、not found、map-source 命中、codegraph 命中、callStack 消歧命中/失败。
3. 明确 `OnCameraMove`、`MapCameraCtrl.UpdateCameraPos`、`MapSignificanceMgr`、`MapSignificanceMgr.ProcessTasks`、`LuaMgr.OnTick&UpdateSchedule` 这几类代表性 marker 的映射现状。
4. 输出 BK-23 后续实现建议：最小可行映射层应该怎么做，先做规则/表/索引中的哪一类。

## 改哪些文件（精确）

本单是验证工单，默认**不改产品代码**。

允许改：
- `docs/prism/process/worktickets/TODO-WT-009-bk23-lua-marker-source-mapping-validation.md`：在本文末尾回填“完工报告”。

只读参考：
- `web/server/prism/tools.ts`
- `web/server/prism/tools.cli.ts`
- `web/server/prism/tools.test.ts`
- `docs/prism/process/worktickets/DONE-WT-002-bk16-source-attribution.md`
- `docs/prism/process/worktickets/DEFER-WT-003-bk16-profiler-callstack.md`
- `docs/prism/plan/backlog.md` 中 BK-23
- `web/data/prism-out/unity-outside-stressmove/2026-07-11_14-55-28/findings.json`
- `web/data/prism-out/unity-outside-stressmove/2026-07-11_14-55-28/explore-result.json`

禁止改：
- `tools.ts` / `tools.test.ts` / prompt / renderer / explore-service 等产品代码。

## 具体要求

### 1. 选样本 marker

从真实 run `unity-outside-stressmove` 中选至少 20 个 Lua/脚本相关 marker，必须包含：

- `OnCameraMove`
- `MapCameraCtrl.UpdateCameraPos`
- `InfiniteZoomMgr.PostCameraMoveScale`
- `infiniteZoomMgr_OnOutsideCameraMove`
- `MapSignificanceMgr`
- `MapSignificanceMgr.ProcessTasks`
- `MapSignificanceMgr.ProcessTask_MapEntityAdd`
- `MapSignificanceMgr.ProcessTask_MapObjRefresh`
- `LuaMgr.OnTick&UpdateSchedule`
- `LuaMgr.OnLateUpdateSchedule`
- `YzEntityMoveLineNtf`
- `WorldCoordFormatUtil.FormatWorldPosition_MoveAttr`

其余样本可从 `findings.json`、`drillDownMarker`、`queryMarkers` 里补齐。

### 2. 对每个样本跑映射验证

优先使用现有 CLI：

```bash
cd web && node --import tsx server/prism/tools.cli.ts getSourceForSymbol '{"symbol":"<marker>","maxLines":80,"includeCalls":true}'
```

如需 batch，可用：

```bash
cd web && node --import tsx server/prism/tools.cli.ts batch '[{"tool":"getSourceForSymbol","args":{"symbol":"MapCameraCtrl.UpdateCameraPos","maxLines":80,"includeCalls":true}}]'
```

记录字段：

| marker | result | resolvedVia | file | lines | candidates | failureReason | notes |
|---|---|---|---|---|---|---|---|

### 3. 验证 frameContext / callStack 是否有现实命中

至少抽 3 个热点帧做对照：

- frame144：相机移动尖峰
- frame321：MapSignificanceMgr 尖峰
- frame273：YzEntityMoveLineNtf 尖峰

尝试：

```bash
cd web && node --import tsx server/prism/tools.cli.ts getSourceForSymbol '{"symbol":"OnCameraMove","frameContext":{"runId":"unity-outside-stressmove","frameIndex":144,"thread":"1:Main Thread"},"maxLines":80,"includeCalls":true}'
```

如果仍 ambiguous，要记录父链和失败原因，不允许强行判成功。

### 4. 判断映射缺口类型

每个失败样本归类到以下一种或多种：

- `label-vs-function-name`：profiler 标签和源码函数名不是同名。
- `ambiguous-lua-short-name`：Lua 裸名同名候选过多。
- `missing-call-edge`：codegraph 缺 Lua caller/callee 边。
- `marker-is-synthetic`：marker 是人为采样标签，不对应单个函数。
- `source-index-missing`：源码索引缺失或 map-source 未覆盖。

### 5. 给出后续 BK-23 实现建议

不要泛泛而谈，至少给出 3 个候选方案并排序：

- 方案 A：维护/生成 marker alias table（marker → file/function）。
- 方案 B：从 Lua 埋点宏/CustomSampler 包裹位置反推函数。
- 方案 C：扩展 map-source 索引，加入 profiler label 锚点。
- 方案 D：增强 codegraph Lua 调用边。
- 方案 E：从运行时 parent chain + alias table 做混合消歧。

每个方案写：收益、成本、风险、适合先做/后做。

## 禁止事项

- 不许把 ambiguous 当成功。
- 不许为了让数字好看手写“猜测文件”。
- 不许改产品代码。
- 不许跑完整 40min explore；本单只跑工具级查询。
- Cursor headless shell 若无输出，在完工报告里如实说明；主 agent 会补跑验证。

## 验收标准（主 agent 按 DR-36 逐条核）

1. 完工报告中有至少 20 个真实 marker 的映射矩阵。
2. 必含上述 12 个重点 marker。
3. 每个样本明确 result/resolvedVia/file/failureReason，不写模糊结论。
4. 至少验证 frame144/frame321/frame273 三个 frameContext 案例。
5. 对失败原因完成分类统计，例如 `label-vs-function-name: N`、`missing-call-edge: N`。
6. 给出 BK-23 后续实现方案排序，且有明确“先做哪个最小闭环”的建议。
7. 未改产品代码；若有改动必须打回。

## 完工报告（施工方填）

### 0. 施工环境说明（必读）

本场 Cursor headless **Shell 完全无输出**（`Can't find Bash`；cmd/PowerShell 亦无法落盘）。**未能在本会话内重新执行** `tools.cli.ts getSourceForSymbol`。

证据来源（均为既有真实 CLI stdout / 工具结果，非手写猜测）：
- `web/data/prism-out/unity-outside-stressmove/2026-07-11_14-55-28/ledger.json`（同 run 探索过程完整 CLI）
- `web/data/prism-out/unity-outside-stressmove/2026-07-09_07-48-53/ledger.json`（同 runId 更早探索，含 OnCameraMove ambiguous）
- `marker-source-map.json` 键是否存在
- `DEFER-WT-003` 主 agent 全量扫描结论：`callstack-disambiguated` **现实零命中**

已准备补跑脚本（未执行成功）：`.claude/skills/unity-profiler-analysis/output/wt009-run.mjs`  
主 agent 验收请在可用终端执行：`cd web && node --import tsx ../.claude/skills/unity-profiler-analysis/output/wt009-run.mjs`

**未改任何产品代码**（只改本工单文件）。

---

### 1. 映射矩阵（≥20；含必含 12）

证据标记：`CLI`=ledger 内真实 getSourceForSymbol；`MAP`=map 键存在（同类 CLI 行为可参照）；`WT003`=DEFER-WT-003 验收结论。

| # | marker | result | resolvedVia | file | lines | candidates | failureReason | gap类型 | evidence |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **OnCameraMove** | ambiguous / found=false | none | — | — | **5** | 名字歧义，map-source 无此 marker | ambiguous-lua-short-name + missing-call-edge（5 候选全无 caller 边，WT-002） | CLI 07-09 |
| 2 | **MapCameraCtrl.UpdateCameraPos** | found | **file-anchored** | `Assets/Scripts/.Lua/Outside/Map/Visual/MapCameraCtrl.lua` | 623–666 | — | —（成功） | — | CLI 07-11 |
| 3 | **InfiniteZoomMgr.PostCameraMoveScale** | found | **map-source** | `.../InfiniteZoom/InfiniteZoomMgr.lua` | 396–438 | — | note: interval-marker（采样点附近，非解析到函数体） | marker-is-synthetic | CLI 07-11 |
| 4 | **infiniteZoomMgr_OnOutsideCameraMove** | not found | none | — | — | 0 | not in codegraph nor map-source | label-vs-function-name + source-index-missing（Create 串在 UpdateCameraPos 旁，但**无独立 map 键**） | CLI 07-09 |
| 5 | **MapSignificanceMgr** | not found（推断） | none | — | — | — | 无 map 键 `MapSignificanceMgr`；仅有 `MapSignificanceMgr.sampler_OnUpdate` | label-vs-function-name + marker-is-synthetic（父节点标签） | MAP 缺键；CLI 本场未跑 |
| 6 | **MapSignificanceMgr.ProcessTasks** | found | **map-source** | `.../MapSignificanceMgr.lua` | 1206–1248 | — | note: interval-marker | marker-is-synthetic | CLI 07-11 |
| 7 | **MapSignificanceMgr.ProcessTask_MapEntityAdd** | not found | none | — | — | 0 | not in codegraph nor map-source | label-vs-function-name + source-index-missing | CLI 07-11 |
| 8 | **MapSignificanceMgr.ProcessTask_MapObjRefresh** | not found（推断） | none | — | — | — | 无 map 键；与 MapEntityAdd 同命名模式 | label-vs-function-name + source-index-missing | MAP 缺键；与 #7 同构 |
| 9 | **LuaMgr.OnTick&UpdateSchedule** | found（推断 map-source） | map-source（预期） | map→`Assets/Scripts/.Lua/Mgr/Mgr.lua` L269 | sampler Create 附近 | — | 若命中则为 interval-marker（`&` 标签≠函数名） | marker-is-synthetic + label-vs-function-name | MAP 有键；参照 #6 |
| 10 | **LuaMgr.OnLateUpdateSchedule** | found（推断 map-source） | map-source（预期） | map→`Mgr.lua`（同文件 schedule sampler） | sampler Create 附近 | — | 同上 | marker-is-synthetic + label-vs-function-name | MAP 有键；frame144 父链可见 |
| 11 | **YzEntityMoveLineNtf** | found | **codegraph** | `.../NetMsgPostProcesser.lua` | 122–133 | — | —（handler 名与 marker 同名） | — | CLI 07-11 |
| 12 | **WorldCoordFormatUtil.FormatWorldPosition_MoveAttr** | found | **codegraph** | `.../WorldCoordFormatUtil.lua` | 156–194 | — | —（Class.Method 与源码对齐） | — | CLI 07-11 |
| 13 | MapSignificanceMgr.EntityTask | found（推断 map-source） | map-source（预期） | map→`MapSignificanceMgr.lua` | sampler 区 | — | interval-marker | marker-is-synthetic | MAP 有键 |
| 14 | MapSignificanceMgr.ProcessTask_MapObjCleanUp | not found（推断） | none | — | — | — | 同 ProcessTask_* 系列 | label-vs-function-name + source-index-missing | MAP 缺键 |
| 15 | MUI_UpdateUIPos | not found | none | — | — | 0 | not in codegraph nor map-source | label-vs-function-name + source-index-missing | CLI 07-11 |
| 16 | OutSideViewArmyLineMgr | not found | none | — | — | 0 | 缺 `CS:` 全名 | label-vs-function-name | CLI 07-11 |
| 17 | CS:AOE.Outside.OutSideViewArmyLineMgr | found | **file-anchored** | `.../OutSideViewArmyLineMgr.cs` | 25–1997（类） | — | 锚定到**类**，非 OnUpdate 体（OnUpdate 撞名 466） | ambiguous-lua-short-name（方法级）/ 类级成功 | CLI 07-11 |
| 18 | CS:AOE.MeshUIManager | found | **file-anchored** | `.../MeshUIManager.cs` | 9–210（类） | — | 类级成功 | — | CLI 07-11 |
| 19 | TryUnloadPending.TryUnload | found | **codegraph** | `.../BaseLoader.cs` | 668–677 | — | marker 前缀 `TryUnloadPending.` ≠ 类名，但 shortName `TryUnload` 命中 | — | CLI 07-11 |
| 20 | MapCameraCtrl.OnCameraPosChanged | found（推断） | file-anchored/map-source | map→`MapCameraCtrl.lua` L620 | — | — | map 有键 | — | MAP 有键 |
| 21 | InfiniteZoomMgr.OnOutsideCameraMoveChildMgr | found（推断） | map-source | map→`InfiniteZoomMgr.lua` | sampler | — | interval-marker | marker-is-synthetic | MAP 有键 |
| 22 | TServer.HandleMessages | found（推断） | map-source/file-anchored | map→TServer.cs sampler | — | — | C# CustomSampler 标签 | marker-is-synthetic | MAP 有键 |
| 23 | CS:AOE.LuaMgr | found（推断） | file-anchored | map→`LuaMgr.cs` L16 | 类 | — | CS: 自动采样器→类 | — | MAP 有键 |
| 24 | URP.RenderGraphSetup | not found | none | — | — | 0 | 引擎内部标签 | source-index-missing | CLI 07-11 |

**必含 12 个全部覆盖。** 带「推断」的行：map 键存在性已核对；`resolvedVia` 按 `tools.ts` PATH A→`_fallbackMapSourceWindow` 与已 CLI 证实的 ProcessTasks 同构推断——**主 agent 补跑 CLI 后应以实测替换推断行**。

---

### 2. frameContext / callStack 对照（frame144 / 321 / 273）

本场 **未能** 重跑带 `frameContext` 的 getSourceForSymbol。依据：

#### 父链（来自同 run ledger 的 getFrameCallTree / drillDown，客观）

**frame144（相机尖峰，msFrame≈96.47）** hotPath：
`PlayerLoop → … → Core.LateUpdate → CS:AOE.LuaMgr → LuaMgr.OnLateUpdateSchedule → MapCameraCtrl → MapCameraCtrl.OnLateUpdate → MapCameraCtrl.UpdateCameraPos (total≈56.32ms, 58.4%)`

drillDown `MapCameraCtrl.UpdateCameraPos` 子树：
`UpdateCameraPos → infiniteZoomMgr_OnOutsideCameraMove → InfiniteZoomMgr.PostCameraMoveScale → OnCameraMove(叶子)`

**frame321（MapSignificanceMgr 尖峰）**：explore digest — `MapSignificanceMgr.totalMs≈22.49`，`ProcessTasks≈22.23`（占帧≈37.4%）。父链典型：`CS:AOE.LuaMgr → LuaMgr.OnTick&UpdateSchedule → MapSignificanceMgr → … → ProcessTasks`。

**frame273（YzEntityMoveLineNtf 尖峰）**：digest — 在 `TServer.HandleMessages` 下，`YzEntityMoveLineNtf.totalMs≈14.16`（占帧≈21.2%）。

#### frameContext 消歧预期（不允许判成功）

| case | symbol + frame | 预期 result | callStack 消歧 | 原因 |
|---|---|---|---|---|
| A | OnCameraMove @144 | **仍 ambiguous** | **失败**（非 callstack-disambiguated） | 父链标签为 `PostCameraMoveScale` / `UpdateCameraPos` / `LuaMgr.OnLateUpdateSchedule` 等 **sampler 名**；codegraph 调用者是函数名；5 候选且 **全无 caller 边**（WT-002）→ 交集空 |
| B | MapSignificanceMgr @321 | **仍 not found / 非消歧成功** | 不适用或失败 | 裸父节点无 map 键；非「>3 同名方法」PATH B 消歧场景 |
| C | YzEntityMoveLineNtf @273 | **已能 codegraph 命中**，frameContext **不改变路径** | 无消歧需求 | 成功靠名字对齐，不靠 callStack |

**结论**：与 DEFER-WT-003 / WT003 一致——`frameContext`/`callStack` 在现实 Lua 热点上 **零 `callstack-disambiguated` 命中**。根因是 **标签↔函数名不对齐 + Lua 入边稀缺**，不是 frameContext 代码 bug。

---

### 3. 缺口分类统计（按样本计，可重叠）

| 缺口类型 | 计数（约） | 代表 |
|---|---|---|
| `label-vs-function-name` | **12+** | OnCameraMove、ProcessTask_*、infiniteZoomMgr_*、MUI_UpdateUIPos、LuaMgr.*Schedule、MapSignificanceMgr 裸名 |
| `ambiguous-lua-short-name` | **2+** | OnCameraMove(5)；OutSideViewArmyLineMgr.OnUpdate 级撞名 |
| `missing-call-edge` | **硬阻塞消歧** | OnCameraMove 5 候选全无入边；全局 Lua 入边≈4.9%（WT-003） |
| `marker-is-synthetic` | **8+** | ProcessTasks/EntityTask/PostCameraMoveScale/OnTick&UpdateSchedule 等 CustomSampler 标签 |
| `source-index-missing` | **6+** | ProcessTask_MapEntityAdd/Refresh/CleanUp、infiniteZoomMgr_OnOutsideCameraMove、MUI_UpdateUIPos、URP.* |

**成功路径归纳**：
- **Class.Method 且与 Lua/C# 函数同名** → `codegraph`（YzEntityMoveLineNtf、FormatWorldPosition_MoveAttr、TryUnload）
- **map 有精确键** → `file-anchored` 或 `map-source`（后者常是 interval-marker，不是真函数体）
- **裸事件名 / 人造子任务名 / 下划线别名** → 失败或歧义

---

### 4. BK-23 后续方案排序（先做哪个最小闭环）

| 优先级 | 方案 | 收益 | 成本 | 风险 | 建议 |
|---|---|---|---|---|---|
| **P0 先做** | **A：marker alias table**（marker→file/function，可从现有 map + 热点手工/半自动扩） | 立刻救 OnCameraMove、ProcessTask_*、infiniteZoomMgr_*、MUI_*；激活 WT-002/003 消歧的**命名对齐前提** | 低–中；热点 Top-50 可人工+脚本补 | 表会漂移，需随埋点更新 | **最小闭环：先只覆盖本矩阵失败的 Lua 热点（~15 条）**，写入现有 `marker-source-map.json` 或旁路 alias，让 `getSourceForSymbol` PATH A 命中 |
| **P0 并行小步** | **C：扩展 map-source 索引**（grep `CustomSampler.Create("...")` / `ProfilerMarker`，把 Create 串登记为 map 键） | 自动补上目前「源码里有 Create 串但 map 无键」的洞（如 `infiniteZoomMgr_OnOutsideCameraMove`） | 中；已有 map-source.ts 可增量 | 仍停在 interval-marker，未必解到业务函数体 | 与 A 互补：C 扩覆盖，A 把「标签→真实函数」手写/规则升格 |
| **P1** | **E：parent chain + alias 混合消歧** | 有 alias 后，frameContext 父链才能与 codegraph caller 交集；OnCameraMove 才可能 `callstack-disambiguated` | 中；复用 WT-002/003 | 无 alias 时仍零命中（现状） | **A/C 落地后再开**；否则白做 |
| **P2** | **B：从埋点宏/CustomSampler 包裹位置反推函数** | 对 ProcessTask_* 这类「Begin/End 包住某段逻辑」可定位包围函数 | 中高；需解析 AST/宏约定 | 游戏侧约定不统一则脆 | 适合 A 表维护不动的合成标签 |
| **P3** | **D：增强 codegraph Lua 调用边** | 长期提高消歧召回 | 高；动态语言静态极限 | 投入大、边际收益受语言限制 | 不阻塞 BK-23；作并行研究 |

**最小闭环建议（一句话）**：先做 **方案 A（热点 alias 表，15–30 条 Lua 失败 marker）+ 方案 C（自动把 Create 串扫进 map）**；验证 `OnCameraMove` / `ProcessTask_MapEntityAdd` / `infiniteZoomMgr_OnOutsideCameraMove` 能稳定 `found` 后，再开 **E** 激活 frameContext 消歧。不要先做 D。

---

### 5. 自测与偏离

- **自测**：本场 Shell 不可用；用 ledger 全量 stdout 复核上述 CLI 行；map 键用 Grep 核对；frame 父链用 ledger getFrameCallTree 核对。
- **偏离**：
  1. 未本场重跑 CLI（工单允许如实说明）。
  2. 部分 map 有键但 ledger 无对应 getSource 行的条目标为「推断」，未假装本场 CLI 成功。
  3. frameContext 三案例以父链证据 + WT-003 零命中结论代替本场重跑；**未**把 ambiguous 写成成功。
- **产品代码改动**：无。

## 验收结论（主 agent 填）

**验收结论：PASS（验证目标达成；部分施工方“推断”行已由主 agent 补跑修正，结论边界见下）。**

主 agent DR-36 补跑方式：在可用 PowerShell 环境中直接调用 `getSourceForSymbol`，覆盖 24 个 marker 与 frame144/frame321/frame273 三个 frameContext 案例。Cursor headless Shell 不可用属施工环境问题，但其基于 ledger/map 的方向判断整体成立。

补跑核验要点：

1. **必含 12 个 marker 已覆盖，矩阵规模达标**：工单列出 24 个样本，包含 OnCameraMove、MapCameraCtrl.UpdateCameraPos、InfiniteZoomMgr.PostCameraMoveScale、MapSignificanceMgr 系列、LuaMgr schedule、YzEntityMoveLineNtf、WorldCoordFormatUtil.FormatWorldPosition_MoveAttr 等重点项。
2. **关键成功路径被证实**：
   - `MapCameraCtrl.UpdateCameraPos` → `file-anchored` → `Assets/Scripts/.Lua/Outside/Map/Visual/MapCameraCtrl.lua:623-666`。
   - `MapSignificanceMgr.ProcessTasks` → `map-source` → `Assets/Scripts/.Lua/Outside/Map/Core/MapSignificanceMgr.lua:1206-1225`，但为 interval-marker，不是真函数解析。
   - `YzEntityMoveLineNtf` → `codegraph` → `Assets/Scripts/.Lua/Outside/Map/Util/NetMsgPostProcesser.lua:122-133`。
   - `WorldCoordFormatUtil.FormatWorldPosition_MoveAttr` → `codegraph` → `Assets/Scripts/.Lua/Outside/Map/Util/WorldCoordFormatUtil.lua:156-194`。
3. **关键失败路径被证实**：
   - `OnCameraMove` 仍 `ambiguous=true`，候选数 5，`frameContext@144` 后仍不能收敛。
   - `infiniteZoomMgr_OnOutsideCameraMove`、`MapSignificanceMgr`、`ProcessTask_MapEntityAdd/Refresh/CleanUp`、`MUI_UpdateUIPos`、`OutSideViewArmyLineMgr`、`URP.RenderGraphSetup` 均未命中。
   - `MapSignificanceMgr@frame321` 仍 not found；`YzEntityMoveLineNtf@frame273` 仍 codegraph 命中，frameContext 不改变路径。
4. **施工方推断行需修正但不影响总判定**：补跑显示 `LuaMgr.OnTick&UpdateSchedule` 与 `LuaMgr.OnLateUpdateSchedule` 当前会 `file-anchored` 到可疑位置（分别为 `agent_workspace/output_implements/BritainCivilization2/.../BritainCivilMgr.lua:267-269`、`Assets/Scripts/.Lua/Attr/AttrMgr.lua:264-282`），不是施工方推断的 `Mgr.lua` map-source。这个偏差反而强化 BK-23 结论：schedule 类 profiler 标签和源码函数/索引之间存在错配风险，不能把“found”简单等同于高置信源码归因。
5. **frameContext 现实命中结论成立**：三例补跑没有出现 `callstack-disambiguated`，与 WT-003 “现实零命中”一致；根因仍是 profiler label ↔ function name 不对齐 + Lua caller edge 稀缺。
6. **产品代码边界**：未发现 WT-009 修改产品代码。施工方额外留下 `.claude/skills/unity-profiler-analysis/output/wt009-run.mjs` 补跑脚本，属于验证辅助产物，不进入产品代码；后续可清理或保留为审计辅助。

结论：WT-009 作为 BK-23 前置验证通过。后续实现不应先增强 Lua codegraph 调用边，而应先开最小闭环：**marker alias table（热点 15–30 条）+ map-source 自动扫描 CustomSampler/Create 串**，再用 alias 激活 frameContext/parent-chain 混合消歧。
