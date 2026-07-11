# 工单 WT-003 · BK-16 续：profiler 调用栈自动消歧（parent_name 链 → callStack）

> 状态：TODO（待施工）｜里程碑：M1 单次质量收尾｜执行方：Cursor
> 依据：WT-002 已给 `getSourceForSymbol` 加了 `callStack` 入参并验证消歧有效；本单让它能**自动**从 profiler 数据构造 callStack，不必调用方手工传。

## 背景（为什么做）

WT-002 给 `getSourceForSymbol` 加了 `callStack` 入参：裸名符号在 codegraph 命中多个同名候选时，用调用栈祖先反查调用者、恰好唯一才收敛。**功能已验证有效**，但有个前提——调用方得**手工提供** callStack。

真实痛点在 Lua：codegraph 对 Lua 的调用关系提取覆盖率很低（实测：Lua 方法只有 23.4% 有出边、**仅 4.9% 有入边**；对比 C# 出边 58%）。原因是 **Lua 是动态语言，静态分析推不出 `self.mgr:OnTick()` 里 `self.mgr` 的真实类型**，调用边大量丢失。这不是工具缺陷，是语言特性——换任何静态分析器都一样。

**突破口（本单核心）**：profiler 运行时数据里，`prism_frame_marker_samples` 表**每行自带 `parent_name` 字段**——这是程序实际跑出来的真实父子调用关系，**不受"静态推不出动态类型"限制**。把某帧里某个热点 marker 的 parent_name 一层层往上回溯，就得到一条**运行时调用栈**；把它翻译后喂给 WT-002 的 callStack 消歧逻辑，就能救回 codegraph 静态分析救不了的 Lua 裸名。

实测印证：241 个裸名 marker 中 20 个能对上 codegraph 同名 Lua 方法，其中 6 个是歧义候选（含 `OnCameraMove`）——正是本单目标客户。`OnCameraMove` 在 profiler 里父链能追到 `LuaMgr.OnTick`、`Core.Update` 等明确祖先。

## 目标（做完什么样，可观测）

给 `getSourceForSymbol` 增加一个**可选入参 `frameContext`**（`{ runId, frameIndex, thread?, markerName? }`）。当提供了它、且符号在 PATH B 命中多个同名候选（歧义）、且调用方**没有显式传 callStack** 时：

1. 自动从 `prism_frame_marker_samples` 里，以该 marker（默认用 `symbol` 对应的 marker_name，或显式 `markerName`）为起点，**沿 `parent_name` 逐层回溯**，构造出一条从近到远的祖先符号名数组（= 运行时调用栈）。
2. 把这条自动构造的 callStack 送进 WT-002 已有的调用栈消歧逻辑（`tryCallStackDisambiguation`），恰好唯一候选才收敛。
3. 消歧成功 → `resolvedVia:'callstack-disambiguated'`，note 里注明"由 profiler 帧 {frameIndex} 的运行时调用栈自动消歧"。
4. 若 frameContext 找不到该 marker、或回溯出的栈仍无法唯一收敛 → **保持 ambiguous 诚实放弃**（护栏不破，绝不瞎猜）。
5. **显式 callStack 优先级高于 frameContext**：若调用方同时传了 callStack，用 callStack，不覆盖。都不传时行为与现在完全一致（向后兼容）。

## 改哪些文件（精确；本单只允许动这两个）

- `web/server/prism/tools.ts`（给 `getSourceForSymbol` 加 `frameContext` 入参 + parent_name 回溯逻辑）
- `web/server/prism/tools.test.ts`（加对应单测）

> ⚠️ 只读不改：`explore-prompt.txt` / 任何 prompt（属组B串行工单）、renderer、explore-service。
> ⚠️ 不改 `tools.cli.ts` 分发逻辑（新入参走已有 args JSON 透传）。
> ⚠️ 不动 WT-002 已写好的 `tryCallStackDisambiguation` / `buildPathBSuccess` 的核心逻辑，只**复用**它们。

## 现状代码（施工方必读）

- `getSourceForSymbol` 在 `tools.ts` 约 1291 行起。WT-002 已加：
  - `GetSourceForSymbolArgs.callStack?: string[]`（约 1254 行）
  - PATH B 内（约 1571-1634 行）有 `tryCallStackDisambiguation(candidates, stack)`（恰好唯一命中才返回 picked，否则 null）+ `buildPathBSuccess(picked, resolvedVia, note)` + `symbolToShortName()`。
  - 消歧触发条件：`rows.length > 1 && normalizedCallStack.length > 0`（约 1607 行）。
- **数据表 `prism_frame_marker_samples`**（profiler 帧采样，`openPrismDb()` 打开的库）字段：
  `run_id, frame_index, thread, marker_name, self_ms, total_ms, depth, parent_name, order_in_frame`。
  - `parent_name` = 该 marker 在调用树里的父节点名（顶层为 null）。
  - 回溯方式：给定 marker_name，查它的 parent_name → 再以 parent_name 作为 marker_name 查它的 parent_name → …直到 parent_name 为 null 或达到深度上限（建议上限 20 层，防脏数据死循环）。
  - 注意同名 marker 在一帧里可能多行（不同 depth/order），回溯时按 `run_id + frame_index + thread` 限定，取第一条即可；**必须防环**（记录已访问名字，遇重复停止）。
- 现有 `getFrameCallTree`（约 379 行）已示范如何按 `run_id + frame_index + thread` 查这张表、如何解析默认 Main Thread，可参考其 thread 解析逻辑。

## 具体要求

### 1. 扩入参
`GetSourceForSymbolArgs` 加可选：
```ts
frameContext?: { runId: string; frameIndex: number; thread?: string; markerName?: string };
```
- `markerName` 不传时，默认用 `symbol` 本身作为起点 marker 名（因为 symbol 常就是 marker 名）。
- `thread` 不传时，复用 getFrameCallTree 同款默认 Main Thread 解析。

### 2. parent_name 回溯构造 callStack
- 新增一个辅助函数（建议 `buildCallStackFromFrame(db, runId, frameIndex, thread, startMarker): string[]`）：
  - 从 startMarker 起，循环查 `SELECT parent_name FROM prism_frame_marker_samples WHERE run_id=? AND frame_index=? AND thread=? AND marker_name=? LIMIT 1`。
  - 每拿到一个非空 parent_name，push 进结果数组，再以它为新的 marker_name 继续查。
  - 终止：parent_name 为 null/空、或已访问过（防环）、或超过 20 层。
  - 返回从近到远的祖先名数组（不含 startMarker 自己）。

### 3. 接入消歧
- 在 PATH B 的消歧触发点，计算最终 callStack：
  `const effectiveStack = normalizedCallStack.length > 0 ? normalizedCallStack : (frameContext ? buildCallStackFromFrame(...) : [])`
- 用 effectiveStack 走 `tryCallStackDisambiguation`。
- 消歧成功时 note 区分来源：显式 callStack → 原文案；来自 frameContext → "由 profiler 帧 N 运行时调用栈自动消歧，祖先 X"。

### 4. 正例 / 反例
- ✅ 正例：`{symbol:'OnCameraMove', frameContext:{runId:'...', frameIndex:519}}`，若该帧 OnCameraMove 的 parent_name 链含某候选的调用者 → 收敛到该候选。
- ❌ 反例：frameContext 指向的帧里没有该 marker、或父链祖先与任何候选调用者无交集 → **仍 ambiguous**，不退回 rows[0]。
- ❌ 不许用 frameContext 去"猜"——只用真实回溯出的父链做确定性交集筛选，逻辑同 WT-002。

## 禁止事项

- 不碰 prompt / renderer / explore-service / tools.cli.ts 分发逻辑。
- 不重写 WT-002 的消歧/成功构造函数，只复用。
- 不改 PATH A / map-source 回退。
- 不引第三方依赖。不做调用栈模糊评分/权重，只做确定性交集（恰好唯一才收敛）。
- 回溯必须防环 + 限深，不许可能死循环。

## 验收标准（主 agent 照此逐条核，客观可验）

1. **tsc**：`cd web && npx tsc --noEmit`，`tools.ts`/`tools.test.ts` 零新增类型错误。
2. **向后兼容**：既不传 callStack 也不传 frameContext 时，对已知符号结果与改动前一致。
3. **frameContext 自动消歧生效**：构造一个歧义 marker + 真实存在的 frameContext（施工方在完工报告注明用于验证的 run_id/frameIndex/marker），跑 `tools.cli.ts getSourceForSymbol '{"symbol":"...","frameContext":{"runId":"...","frameIndex":N}}'` → 从 ambiguous 收敛到 `found:true, resolvedVia:'callstack-disambiguated'`，note 提及"运行时调用栈"。
4. **护栏不破**：frameContext 指向不含该 marker 的帧（或父链无效）→ 仍 `ambiguous:true, found:false`，不瞎选。单测覆盖。
5. **优先级**：同时传 callStack 和 frameContext 时，用 callStack（单测或完工报告举证）。
6. **防环/限深**：单测或代码 review 确认回溯有 visited 去重 + 深度上限。
7. **单测**：`cd web && npx tsx server/prism/tools.test.ts`（本项目是纯 tsx 脚本，非 vitest）新增至少 3 用例（自动消歧成功 / 无效 frameContext 仍 ambiguous / callStack 优先于 frameContext），全绿（0 FAIL）。

> 提示：可用于验证的歧义 marker——`OnCameraMove`（5 候选）。可先跑 `tools.cli.ts getFrameCallTree` 或直接查 `prism_frame_marker_samples` 找一个含 OnCameraMove 且其 parent_name 链有效的 run_id + frame_index。最新 run 目录见 `web/data/prism-out/unity-outside-stressmove/2026-07-09_07-48-53/`。

## 完工报告（施工方填：改了什么、怎么自测的、有无偏离）

> ⚠️ 派发进程 2 分钟超时被中断（Cursor 施工机 shell 故障，命令全空返回、无法自测），代码写完未走收尾。以下由主 agent 读 diff 代填。

- **tools.ts**（+218 行）：
  - 新增 `GetSourceForSymbolFrameContext` 接口 + `GetSourceForSymbolArgs.frameContext?` 字段。
  - `_db` 参数改为 `db`（接入 profiler 库查询）。
  - 新增 `resolveFrameThread()`（复用 getFrameCallTree 同款 Main Thread 解析）+ `buildCallStackFromFrame()`（导出；沿 parent_name 回溯，`CALL_STACK_MAX_DEPTH=20` 限深 + `visited` Set 防环）。
  - PATH B 消歧接入：`effectiveStack = 显式callStack || autoCallStack(来自frameContext)`；note 分来源（显式 vs "由 profiler 帧 N 运行时调用栈自动消歧"）；消歧失败保持 ambiguous。
- **tools.test.ts**（+158 行）：[9] 段 —— frameContext 自动消歧 / 无效 frameContext 仍 ambiguous / 显式 callStack 优先 / 内存库验证防环+限深。

## 验收结论（主 agent 填：PASS / 打回+原因）

**搁置（DEFERRED，2026-07-11）——代码正确但当前数据零命中，功能价值待 BK-23 前置条件成熟**

主 agent 独立核验（DR-36 亲自跑）：
1. ✅ **代码逻辑正确**：读全 diff，`buildCallStackFromFrame` 防环(visited)+限深(20)、`_db→db` 接入、显式 callStack 优先于 frameContext、消歧失败保持 ambiguous（护栏不破）——全部正确。
2. ✅ **单测 71 PASS**：护栏(无效 frameContext→ambiguous)、防环(遇环停在长度2)、限深(capped 20)、优先级 全绿。
3. ❌ **1 FAIL 且是硬现实非代码 bug**：case(a) 遍历 200 帧找"能靠 profiler 父链消歧 GetRootPanel"的帧，`checkedFrames` 后**一个都没找到**。
4. **主 agent 深挖定性（亲自跑全量扫描）**：遍历 profiler 全部裸名 marker × codegraph 候选，**当前 prism.sqlite + codegraph 组合下，能被 profiler 父链唯一消歧的真实案例 = 0**。根因两条：
   - Lua 调用边覆盖率仅 4.9%（WT-002 已知）；
   - **profiler 的 marker/parent_name 是采样标签**（`LuaMgr.OnTick&UpdateSchedule` / `Core.Update`），与 codegraph **函数名不是一套命名**，交集匹配天然落空。
5. **结论**：功能代码/护栏/接口均正确保留（不回退、不删），但对现实数据零命中。要真正见效，需先做 **BK-23（profiler 标签名↔源码函数名映射）**。本单标记搁置，代码留在树上（含 `callStack`/`frameContext` 接口，BK-23 做完即可复用激活）。
6. ✅ **未越界**：只改 tools.ts + tools.test.ts。
7. 施工残留 `web/_wt003-run-tests.mjs`（Cursor 临时测试脚本，未跑成）由主 agent 清理。

> 决策依据：用户 2026-07-11 确认"WT-003 先待 BK-23 搁置"。
