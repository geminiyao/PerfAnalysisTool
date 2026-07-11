# 工单 WT-008 · M3-C 收尾沉淀：run 产出 → 持久大脑（最小可用·先沉淀 DataRequest）

> 状态：TODO（待施工）｜里程碑：M3 持久大脑通电（第4单）｜执行方：Cursor
> 依据：`docs/prism/plan/roadmap.md` M3 拆解（M3-C）+ WT-005/006/007 已建好大脑+摄入+注入

## 背景（为什么做）

M3 已通到"加载端"：大脑能存(A)、能摄入知识(摄入层)、能开局注入(B)。但**写回端还没有**——run 跑完学到的东西没有沉淀进大脑，下次还是只有先验知识、用不上历次积累。这就是"越用越强"缺的最后一环。

本单做**收尾沉淀**的最小可用版：run 结束时，把本次产出的 **DataRequest**（"想查但当前查不到的数据/能力需求"）沉淀进持久大脑的 `capabilities/` 分类。

**为什么先只做 DataRequest**（不做 findings 知识沉淀）：
- DataRequest 是**客观的能力缺口**（"我想要 per-marker GC 分配但没有"），不涉及"归因对不对"的质量判断——最容易安全闭环。
- findings 的业务归因沉淀涉及"LLM 可能归因错→污染大脑"，需要人点头/质量门（用户已定"先全存事后人工删错"，但知识沉淀仍建议留到后续单谨慎做）。
- 符合项目节奏：先让"写回"这条神经通起来（哪怕先只沉淀一类），M3-D 就能验证闭环。

## 增量沉淀的铁律（★与先验知识摄入不同，务必遵守）

先验知识摄入(WT-006)用 `--replace-source` **整篇覆盖**。但**收尾沉淀是累加的，绝不能清空**——run1 沉淀的、run2 必须保留，这才是"越用越强"。所以：
- **绝不调用 clearBySource / 不清空** capabilities。
- id 必须**由数据本身稳定派生**（不让 LLM 现编 slug）——用 DataRequest 的语义内容做稳定 id（如内容归一化后的 hash，或 DataRequest 已有的稳定标识）。这样：同一个 DataRequest 反复出现 → 同 id → `appendMemory` 覆盖（不堆积）；不同的 DataRequest → 不同 id → 追加（积累）。
- 这正是之前讨论定的"增量沉淀用数据自带 id"策略。

## 现状（施工方必读）

- **沉淀插入点**：`explore-service.ts` 约 740-770 行。findings/dataRequests 已读出(707-727行)、result 已组装(740行)、758行写 explore-result.json、**762行已有 BK-3 的 DataRequest 汇总(fire-and-forget 调 collect-datarequests.ts)**。本单在这附近加"沉淀到持久大脑"，与 BK-3 互补(BK-3 汇总到 pool.json 供人看；本单沉淀进大脑供下次注入)。
- **DataRequest 类型**：见 `types.ts`。字段含（施工方读 types.ts 确认）：描述"想要什么数据/能力"的结构。用其语义字段派生稳定 id。
- **appendMemory 接口**(prism-memory.ts)：`appendMemory(category, {id, content, source?, ...}, {root?})`。同 id 覆盖。
- **capabilities 分类**已在 MEMORY_CATEGORIES 注册（WT-005）。
- **注意**：M3-B 的注入 `MEMORY_INJECTION_CATEGORIES = ['priors','knowledge','lessons']` **当前没含 capabilities**——本单沉淀到 capabilities 后，是否把 capabilities 也加进注入类，由工单决定(见具体要求4)。

## 目标（做完什么样，可观测）

1. run 收尾时，把本次 dataRequests 每条经"数据自带稳定 id"沉淀进 `prism-memory/capabilities/`（`appendMemory`，纯追加/同id覆盖，不清空）。
2. 沉淀是 **fire-and-forget**：失败不能让 explore 整体失败（与 BK-3 汇总同款容错）。
3. 同一 run 重复沉淀、或跨 run 沉淀同一 DataRequest → 同 id 覆盖，不重复堆积。
4. 可开关：沉淀行为可通过一个选项/常量启停（默认开），便于测试与回退。

## 改哪些文件（精确；本单只允许动这些）

- `web/server/prism/explore-service.ts`（收尾处加沉淀调用 + 一个 `persistDataRequestsToMemory()` 函数）
- `web/server/prism/explore-service.test.ts`（加沉淀逻辑的单测，复用现有测试文件）

> ⚠️ 只读复用：`prism-memory.ts` 的 `appendMemory`（不改）、`types.ts` 的 DataRequest（只读）。
> ⚠️ 不碰：tools / render / ingest / prompt / collect-datarequests.ts（BK-3 那条独立保留）。
> ⚠️ **绝不 clearBySource / 不清空 capabilities**（增量沉淀铁律）。

## 具体要求

### 1. persistDataRequestsToMemory 函数
- 签名建议：`persistDataRequestsToMemory(dataRequests: DataRequest[], opts?: { runId?: string; root?: string }): number`（返回沉淀条数）。
- 每条 DataRequest → 派生**稳定 id**（基于其语义内容，如 `dr-<hash>`；hash 用内容归一化后计算，node 内置 crypto 即可）。
- `content` = DataRequest 的可读描述；`source` = 标记来自哪个 run（如 runId）或统一标 `explore-datarequest`。
- 调 `appendMemory('capabilities', {...}, {root})`。同 id 自动覆盖。
- 空 dataRequests → 沉淀 0 条、不报错。

### 2. 接入收尾
- 在 explore-service.ts 收尾处（BK-3 汇总附近，约 762 行）调用，**fire-and-forget / try-catch 包裹**：沉淀失败只 console.warn，不影响 result 返回。

### 3. 稳定 id（防堆积核心）
- 同一 DataRequest（语义相同）两次 → 同 id → 覆盖。用内容归一化(去空白/小写等)后 hash。
- 单测要证明：同一条 DataRequest 沉淀两次，capabilities 只有 1 条。

### 4. capabilities 是否纳入注入
- 本单**把 capabilities 也加进 M3-B 的 `MEMORY_INJECTION_CATEGORIES`**（改成 `['priors','knowledge','lessons','capabilities']`），让沉淀的能力缺口下次开局也能提醒 LLM。**这是本单允许的对 explore-service.ts 常量的小改**。
  - 若担心 capabilities 噪声大，可不注入——但工单倾向纳入(能力缺口对下次分析有提示价值)。施工方按纳入做，验收时评估。

### 5. 正例/反例
- ✅ 正例：run 产出 3 条 DataRequest → capabilities/ 出现 3 条、id 稳定；重跑同 run → 仍 3 条(覆盖)。
- ❌ 反例：用 clearBySource 清空 capabilities 再写——**禁止**(会丢历史沉淀)。
- ❌ 反例：让 LLM 现编 id / 用随机 id / 时间戳 id——会导致同一 DataRequest 重复堆积。

## 禁止事项

- 不清空 capabilities（增量沉淀铁律）。
- 不做 findings 业务归因沉淀（本单只沉淀 DataRequest；知识沉淀留后续单，避免污染大脑）。
- 沉淀失败不许让 explore 失败（fire-and-forget）。
- 不引第三方依赖(crypto 用 node 内置)。不过度设计：不做语义去重/合并(那是 BK-24/M4)，只做"同内容→同id→覆盖"的确定性去重。

## 验收标准（主 agent 照此逐条核，客观可验）

1. **tsc**：`cd web && npx tsc -p tsconfig.server.json --noEmit`，改动文件零新增错误。
2. **沉淀生效**：单测——构造几条 DataRequest 调 `persistDataRequestsToMemory`（用临时 root），capabilities/ 出现对应条目、内容正确。
3. **稳定 id 防堆积**：同一批 DataRequest 沉淀两次，capabilities 条目数不翻倍（同 id 覆盖）。单测验证。
4. **空/容错**：空 dataRequests → 沉淀 0 条不报错；沉淀异常被 try-catch 兜住不抛。
5. **不清空**：代码 review 确认沉淀路径没有 clearBySource / 目录清空。
6. **capabilities 纳入注入**：`MEMORY_INJECTION_CATEGORIES` 含 'capabilities'；formatMemoryForPrompt 能带出 capabilities（若有条目）。
7. **向后兼容**：不改变 explore 主流程成功/失败语义；沉淀是旁路。
8. **不越界**：只改 explore-service.ts + explore-service.test.ts。

> 说明：本单不跑真实 40min explore。验收核"沉淀函数正确 + 稳定id防堆积 + 容错 + 不清空"。真实端到端沉淀→下次注入的闭环，留 M3-D 连跑验证。

## 完工报告（施工方填：改了什么、怎么自测的、有无偏离）

> ⚠️ 派发进程 2 分钟超时中断（Cursor 施工机 shell 僵尸终端故障，命令全空返回、无法自测）。代码写完未走收尾，以下由主 agent 读 diff 代填。

- **explore-service.ts**（+157行）：
  - `deriveDataRequestStableId(dr)`：用语义字段(want/rationale/suspectedAxis/closestExistingTool 归一化后 sha256 取16位)派生稳定 id `dr-<hash>`——不用 LLM 编的 id，同内容→同id→覆盖。
  - `persistDataRequestsToMemory(dataRequests, {runId,root,enabled})`：逐条 `appendMemory('capabilities', {id,title,content,source})`；per-entry try-catch 容错；空/禁用返回0；**从不 clearBySource**（增量沉淀铁律）。
  - `DATA_REQUEST_MEMORY_PERSIST_ENABLED` 开关(默认on)。
  - `MEMORY_INJECTION_CATEGORIES` 加入 'capabilities'——沉淀的能力缺口下次开局也注入。
  - 收尾处(约842行)fire-and-forget 调 persist，失败只 warn 不影响 result。
- **explore-service.test.ts**：加 M3-C 沉淀测试(沉淀生效/稳定id防堆积/空/禁用/append失败不抛/capabilities纳入注入)。

## 验收结论（主 agent 填：PASS / 打回+原因）

**PASS（2026-07-11，主 agent 独立验收；施工方 shell 故障未自测，主 agent 补跑）**

逐条核对（DR-36 亲自跑）：
1. ✅ **tsc**：`npx tsc -p tsconfig.server.json --noEmit` 仅 baseUrl 既有警告，explore 零新增错误（证明 DataRequest 的 want/rationale/suspectedAxis/closestExistingTool 字段真实存在）。
2. ✅ **沉淀生效**：单测"persisted 2 entries"+"capabilities has 2 entries"+"content present"。
3. ✅ **稳定id防堆积**：单测"only 1 entry after duplicate persist"+"second persist overwrites"——同批沉淀两次不翻倍。
4. ✅ **空/容错**：单测"empty array returns 0"+"enabled:false returns 0"+"persist does not throw on append failure"。
5. ✅ **不清空**：读全 diff，沉淀路径只 appendMemory，无 clearBySource / 目录清空。
6. ✅ **capabilities 纳入注入**：`MEMORY_INJECTION_CATEGORIES` 含 'capabilities'；单测"capabilities in injection list"+"formatMemory includes capabilities section/content"。
7. ✅ **向后兼容**：沉淀是收尾旁路(fire-and-forget)，不改 explore 成功/失败语义。
8. ✅ **不越界**：只改 explore-service.ts + explore-service.test.ts。
9. ✅ **单测**：`explore-service.test.ts` **24 PASS/0 FAIL**（含 M3-B 10 + M3-C 14）。

**M3-C 完成——收尾沉淀接通：run 结束把 DataRequest 用数据自带稳定id沉淀进 capabilities/(增量、不清空)，且纳入下次注入。大脑↔手接通了。**

**M3 四步已完成 A/摄入/B/C——大脑能存、能摄入、开局注入、收尾沉淀全通。只剩 M3-D 连跑两次端到端验证(里程碑毕业考)。**

**遗留提示(留给M3-D/BK-24)**：稳定id基于DataRequest语义字段hash——若LLM跨run对同一需求措辞变化较大，仍可能算不同id(比WT-006的自由slug稳健，但非完美)。语义级去重属 BK-24(M4)。

---

## 返工记录（2026-07-11，M3-D 真实数据验证暴露 + 主 agent 修复）

**背景**：前述 PASS 基于 tsc + mock 单测。M3-D 轻量验证用**真实** `data-requests.json` 跑闭环时，暴露 2 个"单测过但真实数据崩"的缺陷——已由主 agent 修复并重验。

**Bug 1 · DataRequest 字段错位（严重·会崩）**：
- `persistDataRequestsToMemory` 按 `types.ts` 定义的 `want/rationale/suspectedAxis/closestExistingTool` 取字段，但**真实 LLM 产出的 data-requests.json 字段是 `id/topic/description/reasonMissing/impactOnFindings`**——完全不同。
- 后果：对真实数据 `dr.want` 为 undefined，`deriveDataRequestStableId` 崩；且 catch 里 `dr.want.slice()` 二次崩，容错失效。
- 根因：`types.ts` 的 DataRequest 定义与实际产物 schema 脱节（同 gap 分析 B-B 类问题）。mock 单测用了 typed 的 want 字段，所以假过。
- **修复**：新增 `extractDataRequestFields(dr)` 字段自适应——两套 schema 都认(真实 topic/description 优先、回退 typed want/rationale)，从语义内容派生稳定 id、格式化正文；error handler 改用安全提取的 title。

**Bug 2 · 注入份额被先验知识饿死**：
- `formatMemoryForPrompt` 原是全局 7KB 先到先得、超了 break。79 条 priors 吃满预算后，排在后面的 capabilities(刚沉淀的回路产物)**根本没注进 prompt**。
- **修复**：改为**每分类独立预算**(总预算 / 有内容的分类数)，各类在自己份额内截断、互不挤占。先验知识再多也挤不掉回路沉淀。

**重验结果**（真实 stressmove data-requests.json，6 条）：
- ✅ run1 沉淀 6 条真实 DataRequest → capabilities/ 6 条、标题正确(如"OnCameraMove精确源码位置")
- ✅ 重跑不堆积(稳定 id 覆盖)
- ✅ run2 开局注入块**同时含 priors + capabilities**(份额修复生效)、总长 5378 字符受控
- ✅ tsc 零错误、单测 24 PASS(字段自适应向后兼容 mock)

**这是"越用越强"的最小实证**：第二次开局用上了第一次沉淀的能力缺口。**M3 数据流闭环通过**；仅剩"注入是否改变分析行为"待真实 explore(M3-D 重量层)。

**教训（记入经验）**：**mock 单测全过 ≠ 真实数据能跑**。类型定义与 LLM 实际产物 schema 可能脱节；验收若只跑 mock 单测会漏掉字段错位这类问题。M3-D 用真实数据端到端跑才是硬验收——这也印证了"里程碑毕业考"不可省。（相关：DataRequest 的 types.ts 定义与产物对齐，可考虑单开清理单，归 BK-24 附近或新 BK。）
