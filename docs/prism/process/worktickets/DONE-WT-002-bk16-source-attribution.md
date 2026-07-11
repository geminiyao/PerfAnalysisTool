# 工单 WT-002 · BK-16 源码归因：Lua 裸名消歧 + 调用栈辅助定位

> 状态：TODO（待施工）｜里程碑：M1 单次质量收尾｜执行方：Cursor
> 依据：`docs/prism/state/m1-gap-analysis.md`（BK-16 实测最硬真缺）+ `docs/prism/plan/backlog.md`（BK-12b/BK-16）

## 背景（为什么做）

Prism 分析报告当前最大短板：**很多热点符号定位不到真实源码，无法给"指着代码行"的建议**。报告自己承认："getSourceForSymbol 未能精确解析 OnCameraMove（返回 ambiguous，5个候选），无法给行级建议"。

根因（已查实，见下）：Lua profiler 按**裸函数名**采样（如 `OnCameraMove`，不带类名/文件路径）。`getSourceForSymbol` 的名字检索路径（PATH B）遇到 >3 个同名节点时，为防脑补直接返回 `ambiguous` 放弃——这条护栏是对的（DR-25 防脑补），但它**丢掉了一个现成的消歧线索：调用栈上下文**。

分析器在调用 `getSourceForSymbol` 时，这个符号几乎总是从某一帧的调用树里钻出来的——它的**父调用链**（谁调用了它）是已知的。用父链去 codegraph 里筛"这些同名候选中，哪个的调用者与实际父链吻合"，就能把 5 个候选收敛到 1 个，而不是直接放弃。这就是本工单要加的能力：**调用栈辅助消歧**。

## 目标（做完什么样，可观测）

给 `getSourceForSymbol` 增加一个**可选的调用栈上下文入参**，当符号名歧义（PATH B 命中 >1 个同名节点，尤其 >3 触发原 ambiguous 分支）时，用调用栈里的**父符号/祖先符号**去 codegraph 的 `edges`（`kind='calls'`）表反查，筛出"被调用栈中某个祖先调用过"的候选，从而：

1. 原本返回 `ambiguous`（放弃）的裸名 Lua 符号，在提供了调用栈上下文时，**能收敛到唯一候选并返回真实源码**（`found:true`）。
2. 若调用栈仍无法收敛到唯一（多个候选都被祖先调用 / 或祖先也不在 codegraph），**保持原有 ambiguous 诚实放弃行为，绝不瞎猜**（护栏不破）。
3. 不提供调用栈上下文时，**行为与现在完全一致**（向后兼容，纯增量）。

## 改哪些文件（精确；本工单只允许动这两个，其余只读）

- `web/server/prism/tools.ts`（给 `getSourceForSymbol` 加调用栈消歧逻辑 + 扩 Args 类型）
- `web/server/prism/tools.test.ts`（加对应单测）

> ⚠️ **只读不改**：`explore-prompt.txt`（属组B串行工单，本单不碰，避免与 prompt 类工单冲突）、`render-*.ts`、`explore-service.ts`、`narrative-*.ts`。
> ⚠️ 本单**不改工具调用协议之外的东西**：不动 `tools.cli.ts` 的分发逻辑（新入参走已有的 args JSON 透传即可，无需改分发器）。

## 现状代码（施工方必读，省得你翻）

`getSourceForSymbol` 在 `tools.ts` 第 1291-1599 行。关键结构：

- **入参** `GetSourceForSymbolArgs`（1251 行）：`{ runId?, symbol, maxLines?, includeCalls? }`。
- **shortName 计算**（1298-1304）：剥 `CS:` 前缀，取最后一个 `.`/`:` 段。Lua 裸名 `OnCameraMove` → shortName 就是 `OnCameraMove`。
- **PATH A**（1376-1470）：symbol 在 `marker-source-map.json` 里有文件锚点 → 用文件+codegraph 精确定位。裸名 Lua 通常**不在** map 里，走不到这。
- **PATH B**（1483-1588）：codegraph 按 `name=shortName AND kind IN('method','function')` 查（1496-1500）。
  - `rows.length === 0` → `found:false, resolvedVia:'none'`（1502-1514）。
  - **`rows.length > 3` → 直接返回 `ambiguous:true`（1517-1531）← 这就是 OnCameraMove 卡住的地方**。
  - `≤ 3` → 取 `rows[0]`（1534，"取第一个"其实也不可靠，带 ambiguityNote）。
- codegraph 的边表可用：`getBusinessCalls`（1345-1362）已示范查 `edges WHERE source=? AND kind='calls'`（**出边**：某节点调用了谁）。本工单消歧要用**入边方向**：给定候选节点，查"谁调用了它"——即 `edges WHERE target=<候选id> AND kind='calls'`，看 source 是否匹配调用栈里的祖先。

**codegraph schema（已确认可用）**：`nodes(id,name,file_path,language,start_line,end_line,signature,kind)`、`edges(source,target,kind)`，`kind='calls'` 表示 source 调用 target。

## 具体要求

### 1. 扩入参：加可选 `callStack`
`GetSourceForSymbolArgs` 增加一个可选字段（命名建议 `callStack?: string[]`），语义 = **从最近的父到更远的祖先排列的符号名数组**（即调用树里该符号往上的调用链，如 `["MapCameraCtrl.Update", "Core.OnTick", "PlayerLoop"]`）。可以是裸名也可以带类名，施工方按 shortName 同款规则归一化后匹配。
- 不传 / 传空数组 → 走原逻辑，行为不变。

### 2. 调用栈消歧逻辑（核心）
在 PATH B 里，当 `rows.length > 1`（含 >3 的 ambiguous 分支），且 `callStack` 非空时，插入消歧步骤：
- 对每个候选节点 `cand`，查它的**调用者**：`SELECT source FROM edges WHERE target=? AND kind='calls'`，拿到 caller nodeId 集合；再查这些 caller 的 `name`。
- 把 caller 的 name（按 shortName 规则归一化）与 `callStack` 里的祖先名（同样归一化）取交集。
- **命中规则**：若**恰好有一个候选**的调用者集合与 callStack 有交集 → 选它，`found:true`，`resolvedVia` 用一个能表达"靠调用栈消歧"的值（建议扩成 `'file-anchored'|'codegraph'|'map-source'|'none'|'callstack-disambiguated'`），并在 `note` 里写明"用调用栈祖先 X 消歧，从 N 个候选中定位"。
- **仍不唯一**（0 个命中，或 ≥2 个候选都被祖先调用）→ **保持原 ambiguous 放弃**，note 里补一句"提供了调用栈但仍无法唯一收敛"。

### 3. 正例 / 反例
- ✅ 正例：`symbol="OnCameraMove"` 有 5 个同名候选，传 `callStack=["MapCameraCtrl.Update",...]`，其中只有位于 `MapCameraCtrl.cs` 的那个候选的调用者 name 含 `Update`/`MapCameraCtrl` → 返回该候选真实源码，`resolvedVia:'callstack-disambiguated'`。
- ❌ 反例（不许做）：candidate 有 5 个、callStack 帮不上（无交集）时，**不许**为了"给个结果"退回取 `rows[0]`——必须诚实 ambiguous。护栏 = 宁可不给，不可瞎给（DR-25）。
- ❌ 反例：不许把 `callStack` 当模糊搜索去 grep 代码库泛读。只用它在**已有的 codegraph 候选**里做筛选。

### 4. 类型与返回结构
- `resolvedVia` 联合类型加 `'callstack-disambiguated'`（`GetSourceForSymbolResult.data.resolvedVia`，1261 行）。
- 消歧成功时返回结构与 PATH B 成功分支（1565-1582）一致：`found/kind/language/file/startLine/endLine/signature/sourceCode/truncated/businessCalls/note`。

## 禁止事项

- 不碰 `explore-prompt.txt` / 任何 prompt（属别的串行工单）。
- 不改 PATH A（file-anchored）和 map-source 回退逻辑——它们没问题，只在 PATH B 加消歧。
- 不改 `getBusinessCalls` 的出边查询语义。
- 不引第三方依赖。不重构 `getSourceForSymbol` 整体结构，只做增量插入。
- 不过度设计：不做"调用栈模糊评分/权重排序"，只做"调用者 name 与祖先 name 有无交集"的**确定性布尔筛选**。恰好唯一才收敛，否则放弃。

## 验收标准（主 agent 照此逐条核，客观可验）

1. **类型/编译**：`cd web && npx tsc --noEmit`，本次改动的 `tools.ts` / `tools.test.ts` **零新增类型错误**（既有 src/ 前端类型债不算）。
2. **向后兼容**：不传 `callStack` 时，对一个已知能定位的符号（如 map 里有的 `MeshUIManager` 或任一 PATH A 符号）调用，结果与改动前一致（`found:true`，`resolvedVia` 不变为 callstack）。用命令核：
   `cd web && node --import tsx server/prism/tools.cli.ts getSourceForSymbol '{"symbol":"<选一个map里的符号>"}'`
3. **消歧生效**：构造/复用一个歧义裸名符号（PATH B 命中 >1），传 `callStack` 后能从 ambiguous 收敛到 `found:true` 且 `resolvedVia:'callstack-disambiguated'`。用命令核：
   `cd web && node --import tsx server/prism/tools.cli.ts getSourceForSymbol '{"symbol":"OnCameraMove","callStack":["MapCameraCtrl.Update"]}'`
   （若 OnCameraMove 在当前 codegraph 已非歧义或不存在，施工方在完工报告里注明实际用于验证的歧义符号名 + 该符号不带 callStack=ambiguous、带 callStack=收敛 的两次对比输出。）
4. **护栏不破**：歧义符号传一个**帮不上忙的 callStack**（祖先与任何候选调用者都无交集）时，仍返回 `ambiguous:true / found:false`，不退回瞎选 rows[0]。单测覆盖此分支。
5. **单测**：`tools.test.ts` 新增至少 3 个用例——(a) 无 callStack 向后兼容、(b) callStack 成功消歧收敛、(c) callStack 无效仍诚实 ambiguous。`cd web && npx vitest run server/prism/tools.test.ts`（或项目既有测试命令）全绿。

## 完工报告（施工方填：改了什么、怎么自测的、有无偏离）

> ⚠️ 派发进程 2 分钟超时被中断（Cursor 施工机 shell 故障，所有 SHELL 命令空返回、无法自测），Cursor **代码写完但没走完收尾**（未改名 REVIEW-、未自填本报告）。以下由主 agent 验收时读 diff 代填。

- **tools.ts**（+122 行）：
  - `GetSourceForSymbolArgs` 增可选字段 `callStack?: string[]`（最近父→远祖的符号名数组）。
  - `resolvedVia` 联合类型加 `'callstack-disambiguated'`。
  - 新增模块级 `symbolToShortName()` 归一化辅助（剥 `CS:` 前缀取末段）。
  - PATH B 内新增 `buildPathBSuccess()`（统一构造成功返回）+ `tryCallStackDisambiguation()`（对每个候选查 `edges WHERE target=? AND kind='calls'` 拿调用者 name，与 callStack 祖先 shortName 取交集；**恰好一个候选命中才收敛**，否则返回 null）。
  - 消歧成功 → `resolvedVia:'callstack-disambiguated'` + note "用调用栈祖先 X 消歧，从 N 个候选中定位"；不唯一 → 保持 ambiguous 放弃。
  - Cursor 自查发现并修复一处 bug：`buildPathBSuccess` 内 `getBusinessCalls` 在 `cgDb.close()` 之后调用会失效 → 调整为先构造结果、再 close。
- **tools.test.ts**（+69 行 → 主 agent 微调）：新增 [8] 段 3 组用例（向后兼容 / 成功消歧 / 无效 callStack 仍 ambiguous）。
  - **主 agent 验收时微调**：施工方原用 `OnCameraMove` 作正例，但实测其 5 个同名候选在 codegraph 中**全无调用边**（无法消歧），正例注定 FAIL。主 agent 查实后换成已验证可消歧的 `GetRootPanel`（1688 候选，唯一一个有调用者 `FindComplexPathToLastContainer`）。仅换测试数据符号，未改产品逻辑。

## 验收结论（主 agent 填：PASS / 打回+原因）

**PASS（2026-07-10，主 agent 独立验收；测试数据符号由主 agent 微调后通过）**

逐条核对（DR-36 不信自报，亲自 diff + 跑命令核数字）：

1. ✅ **tsc 编译**：`cd web && npx tsc --noEmit` 全项目仅 1 个 error（`tsconfig.json` baseUrl deprecated 警告，与本次无关），改动的 `tools.ts`/`tools.test.ts` **零新增类型错误**。
2. ✅ **向后兼容**：`getSourceForSymbol({symbol:'CS:AOE.MeshUIManager'})` 不传 callStack → `found:true, resolvedVia:'file-anchored'`（未变为 callstack）。
3. ✅ **消歧生效（亲自跑 tools.cli 三场景实测）**：
   - `{"symbol":"GetRootPanel"}` → `found:false, ambiguous:true, candidateCount:1688`（正确放弃）
   - `{"symbol":"GetRootPanel","callStack":["FindComplexPathToLastContainer"]}` → `found:true, resolvedVia:'callstack-disambiguated'`，唯一定位到 `NewbieUtil_CopyUIElementPath.lua`，note "从 1688 个候选中定位" ✅
   - `{"symbol":"GetRootPanel","callStack":["ZZZNeverExistsXYZ"]}` → 仍 `found:false, ambiguous:true`（**护栏未破，不瞎猜**）
4. ✅ **护栏不破**：无效 callStack 分支单测覆盖并通过。
5. ✅ **单测**：`cd web && npx tsx server/prism/tools.test.ts`（该文件是纯 tsx 脚本非 vitest，工单命令笔误，以实际为准）→ **66 PASS, 0 FAIL, OVERALL PASS**；[8] 段 9 条断言全绿。
6. ✅ **未越界**：只改了工单允许的 `tools.ts` + `tools.test.ts`，未碰 prompt / renderer / explore-service。

**遗留（非阻塞，记入 backlog 供 M1 收尾讨论）**：codegraph 的 Lua 调用边覆盖率低（67917 个 Lua method 仅 3323 个 ≈4.9% 有 caller 边）。调用栈消歧功能本身成立，但对**大量无调用边的 Lua 裸名符号实际救不回**（如报告里的 OnCameraMove 5 候选全无边）。要提升 BK-16 对 Lua 的真实命中率，需补 Lua 调用边数据（codegraph 侧）或叠加运行时调用树线索——属方向问题，留待用户里程碑节点决策。
