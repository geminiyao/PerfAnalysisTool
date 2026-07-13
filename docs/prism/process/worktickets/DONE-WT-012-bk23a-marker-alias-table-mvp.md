# 工单 WT-012 · BK-23a marker alias table 最小闭环

> 状态：REVIEW（待主 agent 验收）｜里程碑：引擎层完善 / 源码归因线｜执行方：Cursor/agent
> 原编号冲突说明：本工单曾误用 WT-011；**WT-011 已归属 BK-26b**（`DONE-WT-011-bk26b-perfetto-triad-query-spike.md`）。本工单正式编号为 **WT-012**，完工文件为 `REVIEW-WT-012-bk23a-marker-alias-table-mvp.md`。**未修改** BK-26b / WT-011 任何文件。
> 依据：WT-009 已按 DR-36 验收 PASS，证明 Lua/C# profiler marker ↔ source mapping 的主要缺口不是单纯 codegraph，而是 profiler label 与源码函数名不对齐、map-source 缺键、found 置信度不分级。

## 背景（为什么做）

WT-009 验证了 24 个真实 marker 与 3 个 frameContext 案例：

- `Class.Method` 与源码函数名对齐时可走 `codegraph`，例如 `YzEntityMoveLineNtf`、`WorldCoordFormatUtil.FormatWorldPosition_MoveAttr`。
- map 有精确键时可走 `file-anchored` / `map-source`，例如 `MapCameraCtrl.UpdateCameraPos`、`MapSignificanceMgr.ProcessTasks`。
- 但大量 profiler marker 是采样标签/别名/合成名，不等于源码函数名，例如 `OnCameraMove`、`infiniteZoomMgr_OnOutsideCameraMove`、`ProcessTask_MapEntityAdd`、`MUI_UpdateUIPos`。
- `OnCameraMove@frame144` 即使带 frameContext 仍 5 候选歧义，说明 parent chain 里也是 profiler label，无法直接与 codegraph caller/callee 对齐。
- 某些 `found=true` 也可能是低置信，例如 `LuaMgr.OnTick&UpdateSchedule` / `LuaMgr.OnLateUpdateSchedule` 当前会 file-anchored 到可疑位置，不能把 found 当成高置信源码归因。

本工单做 **BK-23a 最小闭环**：建立 marker alias table 与 confidence 分级，让最关键的 15–30 个热点 marker 从 ambiguous/not found/低置信变成可解释、可审计的 source mapping。

## 目标（做完什么样，可观测）

1. 新增或扩展一个 marker alias table 机制，表达：
   `profiler marker → source file → function/range → confidence → rationale`。
2. 首批覆盖 WT-009 中失败/低置信的 Top marker，至少 15 条，必须包含本文“必含 marker”。
3. `getSourceForSymbol` 返回结果中能区分置信度，不再只有 `found=true/false`。
4. 报告/调用方可以识别高/中/低置信，避免把 class-level、interval-marker、alias 推断当成 exact source attribution。
5. 验证 `OnCameraMove`、`ProcessTask_MapEntityAdd`、`infiniteZoomMgr_OnOutsideCameraMove`、`MUI_UpdateUIPos` 等灰区的映射状态明显改善。

## 改哪些文件（精确）

允许改：

- `web/server/prism/tools.ts`：读取 alias table、合并 source lookup、返回 confidence 字段。
- `web/server/prism/tools.test.ts`：新增/更新 alias/confidence 测试。
- `web/server/prism/tools.cli.ts`：如 CLI 输出无需变更可不改；如类型需要透出 confidence 可最小修改。
- `web/server/prism/marker-source-map.ts` 或相关 map-source 读取逻辑：仅当 alias table 接入需要。
- 新增一个 alias 数据文件，优先放在 Prism 可运行数据/配置目录，例如：
  - `web/server/prism/marker-aliases.json`，或
  - `web/server/prism/prism-memory/marker-aliases.json`，或
  - 施工方认为更合适的现有 Prism 配置目录。
- 本工单文件：回填完工报告。

禁止改：

- 不许重构整个 Prism query 架构。
- 不许改报告 renderer 来掩盖 mapping 不准。
- 不许修改 Unity profiler 数据或伪造 marker。
- 不许把 ambiguous 当成功。
- **不许修改 `DONE-WT-011-bk26b-perfetto-triad-query-spike.md` / 任何 BK-26b WT-011 产物。**

## 完工报告（施工方填）

### 最终 schema

`getSourceForSymbol` 返回 `data` 新增：

```ts
confidence?:
  | 'exact-codegraph'
  | 'method-anchored'
  | 'alias-exact'
  | 'file-anchored'
  | 'class-anchored'
  | 'map-source-interval'
  | 'ambiguous'
  | 'not-found'
  | 'low-confidence'
  | 'suspicious'

confidenceReason?: string

alias?: {
  source: 'marker-aliases'
  targetSymbol?: string
  file?: string
  startLine?: number
  endLine?: number
  rationale?: string
  confidence?: SourceConfidence
}

resolvedVia: ... | 'alias'  // 新增
```

### 查询顺序（落地）

1. **alias `prefer=true`** → 直接按 alias 文件/行范围读源码（覆盖 OnCameraMove / ProcessTask_* / LuaMgr schedule 等）
2. **PATH A file-anchored**（map-source + codegraph 文件内名匹配）→ 按 pickMode 打 confidence（method / class / line-containment→low-confidence）
3. **PATH B codegraph** → `exact-codegraph`（或多候选 `ambiguous` / `low-confidence`）
4. **非 prefer alias 兜底** / **not-found**

规则：codegraph exact 仍优先于非 prefer alias；class / interval / low-confidence **绝不**标成 exact。

### 修改文件列表

| 文件 | 变更 |
|------|------|
| `web/server/prism/marker-aliases.json` | **新增** 20 条 alias |
| `web/server/prism/tools.ts` | 加载 alias、`confidence`/`alias` 字段、prefer 路径、PATH A/B/C 置信度标注 |
| `web/server/prism/tools.test.ts` | 新增 `[10] marker alias + confidence` |
| `docs/prism/process/worktickets/REVIEW-WT-012-bk23a-marker-alias-table-mvp.md` | 本完工报告（由 WIP-WT-011 重命名） |

未改：报告 renderer、BK-26b WT-011、Unity 源码、`tools.cli.ts`（CLI 原样透出 JSON，confidence 字段自动可见）。

### 测试

```text
cd web
"C:\Program Files\nodejs\node.exe" --import tsx server/prism/tools.test.ts
→ Results: 98 PASS, 0 FAIL  OVERALL: PASS
```

（需 Node 20；系统默认 Node 22 与 better-sqlite3 二进制不匹配。）

### Alias table 覆盖 marker（20）

1. OnCameraMove
2. infiniteZoomMgr_OnOutsideCameraMove
3. InfiniteZoomMgr.PostCameraMoveScale
4. MapCameraCtrl.UpdateCameraPos
5. MapCameraCtrl.OnCameraPosChanged
6. MapSignificanceMgr
7. MapSignificanceMgr.ProcessTasks
8. MapSignificanceMgr.ProcessTask_MapEntityAdd
9. MapSignificanceMgr.ProcessTask_MapObjRefresh
10. MapSignificanceMgr.ProcessTask_MapObjCleanUp
11. MapSignificanceMgr.EntityTask
12. MUI_UpdateUIPos
13. LuaMgr.OnTick&UpdateSchedule
14. LuaMgr.OnLateUpdateSchedule
15. OutSideViewArmyLineMgr
16. CS:AOE.Outside.OutSideViewArmyLineMgr
17. CS:AOE.MeshUIManager
18. TServer.HandleMessages
19. YzEntityMoveLineNtf
20. WorldCoordFormatUtil.FormatWorldPosition_MoveAttr

### Before / After（必含 20）

| # | Marker | Before (WT-009) | After (WT-012) | 改善? |
|---|--------|-----------------|----------------|-------|
| 1 | OnCameraMove | ambiguous / found=false（5 候选） | alias / alias-exact → OutsideArmyMgr.lua:945–986 | ✅ |
| 2 | infiniteZoomMgr_OnOutsideCameraMove | not found | alias / alias-exact → MapCameraCtrl.lua:660–665 | ✅ |
| 3 | InfiniteZoomMgr.PostCameraMoveScale | map/弱命中，无函数体 | alias / map-source-interval → InfiniteZoomMgr.lua:501–505 | ✅ |
| 4 | MapCameraCtrl.UpdateCameraPos | found file-anchored | file-anchored / **method-anchored** + alias provenance | ✅ 置信可审计 |
| 5 | MapCameraCtrl.OnCameraPosChanged | found（推断） | file-anchored / **method-anchored** | ✅ |
| 6 | MapSignificanceMgr | not found | alias / **class-anchored**（非 exact） | ✅ |
| 7 | MapSignificanceMgr.ProcessTasks | found（map Create 行） | alias / alias-exact → ProcessSignificanceTasks:1290–1372 | ✅ |
| 8 | ProcessTask_MapEntityAdd | not found | alias / alias-exact → ProcessSignificanceTask_MapEntityAdd:1714–1745 | ✅ |
| 9 | ProcessTask_MapObjRefresh | not found | alias / alias-exact → …Refresh:1706–1712 | ✅ |
| 10 | ProcessTask_MapObjCleanUp | not found | alias / alias-exact → …CleanUp:1679–1704 | ✅ |
| 11 | MapSignificanceMgr.EntityTask | 弱/缺 | alias / map-source-interval:1334–1340 | ✅ |
| 12 | MUI_UpdateUIPos | not found | alias / map-source-interval → BattleUIMgr.cs:1056–1098 | ✅ |
| 13 | LuaMgr.OnTick&UpdateSchedule | found 但可疑 file-anchored（错文件） | alias / **low-confidence** → Mgr.lua:384–399 + reason | ✅ 诚实降级 |
| 14 | LuaMgr.OnLateUpdateSchedule | 同上可疑 | alias / **low-confidence** → Mgr.lua:430–439 | ✅ |
| 15 | OutSideViewArmyLineMgr | not found | alias / class-anchored | ✅ |
| 16 | CS:AOE.Outside.OutSideViewArmyLineMgr | found class | file-anchored / **class-anchored**（非 exact） | ✅ 置信标注 |
| 17 | CS:AOE.MeshUIManager | found class | file-anchored / **class-anchored** | ✅ |
| 18 | TServer.HandleMessages | map→Create L266 | alias / method-anchored → HandleMessages:1367–1419 | ✅ |
| 19 | YzEntityMoveLineNtf | high codegraph | codegraph / **exact-codegraph** | ✅ 保持 |
| 20 | WorldCoordFormatUtil.FormatWorldPosition_MoveAttr | high codegraph | codegraph / **exact-codegraph** | ✅ 保持 |

**明确改善 ≥5（实际远超）**：#1,#2,#8,#9,#10,#12,#13,#14,#15 等。

### 仍无法高置信映射的 marker

以下 **found 但不应按 method exact 给行级优化建议**：

| Marker | confidence | 原因 |
|--------|------------|------|
| InfiniteZoomMgr.PostCameraMoveScale | map-source-interval | sampler 包住 evt:Post，无独立函数 |
| MapSignificanceMgr | class-anchored | 仅类/模块级 |
| MapSignificanceMgr.EntityTask | map-source-interval | ProcessTasks 内子 sampler 区间 |
| MUI_UpdateUIPos | map-source-interval | OnUpdate 内 Begin/End 区间，无同名方法 |
| LuaMgr.OnTick&UpdateSchedule | low-confidence | 合成 schedule 标签；包住 scheduler 批量回调 |
| LuaMgr.OnLateUpdateSchedule | low-confidence | 同上 |
| OutSideViewArmyLineMgr / CS:…OutSideViewArmyLineMgr | class-anchored | 类级自动采样 |
| CS:AOE.MeshUIManager | class-anchored | 类级自动采样 |

高置信仍可用：`OnCameraMove`（alias-exact）、`ProcessTask_*`（alias-exact）、`YzEntityMoveLineNtf` / `WorldCoordFormatUtil…`（exact-codegraph）、`MapCameraCtrl.UpdateCameraPos` / `OnCameraPosChanged` / `TServer.HandleMessages`（method-anchored）。

### 验收自检（施工方）

1. ✅ alias table ≥15（实际 20）
2. ✅ 输出含 confidence / confidenceReason / alias provenance
3. ✅ ≥5 个 WT-009 失败/低置信 marker 改善
4. ✅ 未把 class/interval/low 标成 exact
5. ✅ tools.test.ts 新增 section 10；98 PASS / 0 FAIL
6. ✅ 本 before/after 表
7. ✅ 未改报告 renderer；未改 BK-26b WT-011

## 验收结论（主 agent 填）

**验收结论：PASS（WT-012 / BK-23a marker alias table 最小闭环通过）。**

DR-36 核验摘要：

1. **编号归属已确认**：`WT-011` 已归属 BK-26b Perfetto triad；本 marker alias 工单正式编号为 `WT-012`。本文件为 `REVIEW-WT-012-bk23a-marker-alias-table-mvp.md`，未改动 `DONE-WT-011-bk26b-perfetto-triad-query-spike.md`。
2. **alias table 存在且覆盖达标**：`web/server/prism/marker-aliases.json` 新增 20 条 marker alias，覆盖工单要求的 20 个重点 marker，超过“至少 15 条”的验收线。
3. **`getSourceForSymbol` schema 达标**：`web/server/prism/tools.ts` 已新增 `SourceConfidence`、`confidence`、`confidenceReason`、`alias` provenance，并支持 `resolvedVia: 'alias'`。
4. **灰区改善成立**：`OnCameraMove`、`infiniteZoomMgr_OnOutsideCameraMove`、`ProcessTask_MapEntityAdd/Refresh/CleanUp`、`MUI_UpdateUIPos`、`LuaMgr.OnTick&UpdateSchedule`、`LuaMgr.OnLateUpdateSchedule` 等 WT-009 失败/低置信项已变成可审计的 alias 或低置信映射，改善数量超过 5 个。
5. **未把低置信当 exact**：`PostCameraMoveScale`、`EntityTask`、`MUI_UpdateUIPos` 标为 `map-source-interval`；`MapSignificanceMgr`、`OutSideViewArmyLineMgr`、`CS:AOE.MeshUIManager` 标为 `class-anchored`；LuaMgr schedule 标为 `low-confidence`。这符合“found 不等于高置信源码归因”的要求。
6. **高置信路径保持正确**：`YzEntityMoveLineNtf`、`WorldCoordFormatUtil.FormatWorldPosition_MoveAttr` 仍为 `exact-codegraph`；`MapCameraCtrl.UpdateCameraPos`、`MapCameraCtrl.OnCameraPosChanged`、`TServer.HandleMessages` 为 method 级或 alias/method 级可用映射。
7. **测试通过**：主 agent 已复跑 `node --import ./web/node_modules/tsx/dist/loader.mjs ./web/server/prism/tools.test.ts`，结果 `98 PASS, 0 FAIL, OVERALL: PASS`。
8. **产品边界**：本单仅改 alias table、`tools.ts`、`tools.test.ts` 与工单报告；未改报告 renderer，未改 BK-26b WT-011，未改 Unity/外部真实源码。

结论：WT-012 可标记 DONE。后续源码映射线的下一步不再是“验证能不能做”，而是决定是否继续开 `BK-23b map-source 自动扫描 CustomSampler/Create 串`，以及是否让报告层按 confidence 控制源码建议强度。
