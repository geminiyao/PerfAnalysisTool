# 工单 WT-005 · M3-A 持久大脑结构 + 存取接口（BK-LOOP 起手）

> 状态：TODO（待施工）｜里程碑：M3 持久大脑通电（转折点·第1单）｜执行方：Cursor
> 依据：`docs/prism/plan/roadmap.md` M3 章节 + `memory/philosophy.md` 第三节(坟场vs活系统)/第八节(checkpointer)

## 背景（为什么做）

Prism 现在每次分析都是"空白大脑投胎→分析→写盘→进程死掉"，跨 run 无记忆（PHILOSOPHY 第三节）。M3 要给这条死链通电：建**持久大脑** `prism-memory/`，run 开局从它加载注入 prompt、run 收尾往它写回。本单是 M3 起手第一步——**只建"大脑"的存储结构 + 读写接口**，不接管线（注入/沉淀是后续 M3-B/M3-C）。

**已探明的现状（施工方参考，不用重查）**：
- 一次 run 产物在 `web/data/prism-out/<scene>/<timestamp>/`：`findings.json`(结构化发现，知识回路原料)、`data-requests.json`(能力回路原料，已自动汇总进 `web/data/prism-datarequests-pool.json`，现 18 条)。
- 现成先验知识文件（人工种的种子，非 run 产出）：`src/main/ai/unity-cpu-knowledge.md`(337行，Part A 通用Unity + AOE专属)、`docs/aoe-cpu-analysis-knowledge.md`(AOE业务专属)。**这些当前没被 Prism 的 explore-prompt 注入**（已核实）。
- explore-service.ts 用 `{{占位符}}` replace 组装 prompt（约 509-523 行），后续 M3-B 会在此加 `{{MEMORY_INJECTION}}`——**本单不改它**，仅为让施工方理解全局。

## 大脑的内容分类（4类，本单建结构时都要留位）

| 分类 | 目录 | 来源 | 本单是否填内容 |
|---|---|---|---|
| **先验知识 priors** | `prism-memory/priors/` | 人工种的种子（unity/aoe knowledge md） | 只建目录+可放引用，不搬运内容（搬运属 M3-B 决策） |
| **知识回路 knowledge** | `prism-memory/knowledge/` | run 确认的业务归因（findings） | 否，只建空结构 |
| **能力回路 capabilities** | `prism-memory/capabilities/` | DataRequest 池高频项 | 否，只建空结构 |
| **质量回路 lessons** | `prism-memory/lessons/` | 对错教训（依赖金标BK-4） | 否，只建空结构 |

## 目标（做完什么样，可观测）

1. 建 `web/server/prism/prism-memory/` 目录骨架（上表 4 个子区 + 一个 index 清单文件）。
2. 写一个 TS 存取模块 `prism-memory.ts`，提供**可扩展可插拔**的读写接口：
   - `loadMemory(options?)`：读取大脑全部（或按分类筛选）条目，返回结构化对象。
   - `appendMemory(category, entry)`：往某分类追加一条，持久化到盘。
   - **可插拔**：每个分类是独立可加载单元，注入方能选择加载哪些分类（如"只加载 priors + knowledge"）；新增一个分类不需要改核心逻辑（配置驱动，不写死 4 个）。
3. 有单测证明：append 后 load 能读回；空目录/缺分类不报错；按分类筛选生效。

## 可扩展可插拔（★用户明确要求，核心设计约束）

- **可扩展**：分类不许硬编码成固定 4 个 if-else。用一个"分类注册表/配置"驱动——加第 5 类（比如以后的"跨源知识"）只需在注册表加一项，不动读写核心。
- **可插拔**：`loadMemory` 支持按分类选择性加载（如 `loadMemory({categories:['priors','knowledge']})`）；每类可独立启用/禁用。注入时能开关某一类，不是全有或全无。
- 存储格式用 md 或 json（施工方选，倾向 md：人可读可手改，符合"先全存、事后人工删错"的策略——用户已定）。每条目带最小元信息（来源 run/时间戳/分类），便于日后人工审阅删错。

## 改哪些文件（精确；本单只允许动这些）

- 新增 `web/server/prism/prism-memory.ts`（存取模块）
- 新增 `web/server/prism/prism-memory/`（目录骨架 + index + 各分类占位说明 README，可含 .gitkeep）
- 新增 `web/server/prism/prism-memory.test.ts`（单测，纯 tsx 脚本，与 tools.test.ts 同款风格）

> ⚠️ **本单纯新增，不改任何现有文件**：不碰 explore-service.ts / explore-prompt.txt / tools.ts / renderer。注入(M3-B)、沉淀(M3-C)是后续单。
> ⚠️ 不搬运 unity/aoe knowledge 的实际内容进大脑——本单只建结构、priors 目录可先放一个"指向源文件路径的引用条目"占位，真正决定怎么纳入属 M3-B。

## 具体要求

### 1. 目录骨架
```
web/server/prism/prism-memory/
  index.json          # 大脑清单：记录有哪些分类、各分类条目数/最后更新（loadMemory 快速概览用）
  priors/             # 先验知识（可先放引用 unity-cpu-knowledge.md / aoe-cpu-analysis-knowledge.md 的条目）
  knowledge/          # 知识回路（空）
  capabilities/       # 能力回路（空）
  lessons/            # 质量回路（空）
  README.md           # 说明这是什么、4类分别装什么、怎么手工增删（因为"先全存事后人工删错"）
```

### 2. prism-memory.ts 接口（建议签名，施工方可微调命名但语义不变）
```ts
export type MemoryCategory = string; // 不写死枚举，配置驱动
export interface MemoryEntry { id: string; category: MemoryCategory; content: string; source?: string; createdAt: string; [k: string]: unknown; }
export interface MemoryCategoryConfig { name: MemoryCategory; dir: string; enabled: boolean; description: string; }

/** 分类注册表：加新类只改这里，不动读写逻辑 */
export const MEMORY_CATEGORIES: MemoryCategoryConfig[];

/** 读大脑；可按分类筛选、可只读启用的分类 */
export function loadMemory(opts?: { categories?: MemoryCategory[] }): { entries: MemoryEntry[]; byCategory: Record<string, MemoryEntry[]> };

/** 追加一条并持久化 */
export function appendMemory(category: MemoryCategory, entry: Omit<MemoryEntry,'category'|'createdAt'> & { createdAt?: string }): MemoryEntry;
```

### 3. 正例/反例
- ✅ 正例：`appendMemory('knowledge', {id:'k1', content:'GC.Collect 70ms 卡顿由 LuaMgr 帧尾触发'})` → 落盘 → `loadMemory({categories:['knowledge']}).byCategory.knowledge` 含这条。
- ✅ 正例：新增分类只需往 `MEMORY_CATEGORIES` 加一项，loadMemory/appendMemory 无需改。
- ❌ 反例：把 4 个分类写成 `if(cat==='priors'){...}else if(cat==='knowledge'){...}`——违反可扩展要求。
- ❌ 反例：loadMemory 强制全量加载、无法只取某类——违反可插拔要求。

## 禁止事项

- 不改任何现有文件（explore-service/prompt/tools/renderer 全不碰）。
- 不搬运 knowledge md 的正文内容进大脑（只留结构+引用占位）。
- 不引第三方依赖（用 node 内置 fs/path；沿用项目已有的 better-sqlite3 非必须，本单用文件系统即可）。
- 不做注入/沉淀逻辑（那是 M3-B/C）。不过度设计：不做加密、不做版本迁移、不做并发锁——单机顺序读写够用。

## 验收标准（主 agent 照此逐条核，客观可验）

1. **tsc**：`cd web && npx tsc --noEmit`，新增文件零新增类型错误。
2. **目录骨架就位**：`prism-memory/` 有 index.json + 4 个分类子目录 + README，README 说清 4 类装什么、怎么手工删错条目。
3. **接口可用（跑单测）**：`cd web && npx tsx server/prism/prism-memory.test.ts` 全绿——覆盖：(a) append 后 load 读回；(b) 按分类筛选只返回该类；(c) 空/缺分类不报错；(d) 可扩展性——注册表加一个测试分类后 append/load 正常。
4. **可插拔验证**：`loadMemory({categories:['priors']})` 只返回 priors、不含其它类（单测举证）。
5. **不越界**：`git status` 确认只新增了 prism-memory.ts / prism-memory.test.ts / prism-memory/ 目录，无任何现有文件被修改。

## 完工报告（施工方填：改了什么、怎么自测的、有无偏离）

> ⚠️ 派发进程 2 分钟超时被中断（Cursor 施工机 shell 故障，命令全空返回、无法自测），代码写完未走收尾。以下由主 agent 读 diff 代填。

- **新增 `web/server/prism/prism-memory.ts`**（282 行）：配置驱动的持久大脑存取模块。
  - `MEMORY_CATEGORIES` 注册表（priors/knowledge/capabilities/lessons，各带 enabled/description）——**加新类只改此表，读写逻辑不动**（满足可扩展）。
  - `loadMemory({categories?, root?})`：按分类筛选加载、未指定则加载所有 enabled 类（满足可插拔）；`appendMemory(category, entry, {root?})` 追加并落盘 + 重建 index；`loadMemoryIndex()` 读概览。
  - 存储 = md + frontmatter（人可读可手改，配合"先全存事后人工删错"）；safeId 防路径注入；缺文件/空目录不抛错；`root` 可覆盖供单测隔离。
- **新增 `web/server/prism/prism-memory/`** 骨架：index.json + README.md + priors/（含 unity-cpu-knowledge-ref.md、aoe-cpu-analysis-knowledge-ref.md 两条种子引用）+ knowledge/capabilities/lessons/（.gitkeep 占位）。
- **新增 `web/server/prism/prism-memory.test.ts`**：22 断言。
- 施工方发现并利用的现状：server 编译走 `tsconfig.server.json`（非 web 默认 tsconfig）——主 agent 验收据此跑 tsc。

## 验收结论（主 agent 填：PASS / 打回+原因）

**PASS（2026-07-11，主 agent 独立验收；施工方 shell 故障未自测，主 agent 补跑全部命令）**

逐条核对（DR-36 亲自 diff + 跑命令）：
1. ✅ **tsc**：`cd web && npx tsc -p tsconfig.server.json --noEmit` 仅 1 error（baseUrl deprecated 既有警告，无关），prism-memory **零新增类型错误**。
2. ✅ **目录骨架就位**：index.json + README + 4 分类目录齐全；README 说清 4 类装什么、怎么手工删错；priors 放了 2 条种子引用（未搬正文，符合"结构+引用占位"要求）。
3. ✅ **接口可用（跑单测）**：`cd web && npx tsx server/prism/prism-memory.test.ts` → **22 PASS, 0 FAIL, OVERALL PASS**。覆盖 append→load 读回、按分类筛选、空/缺分类不报错、可扩展性(注册表加新类后 append/load/index 均正常)。
4. ✅ **可插拔验证**：`loadMemory({categories:['priors']})` 只返回 priors、排除 knowledge/capabilities（单测 3 条断言明确验证）。
5. ✅ **可扩展验证**：单测临时往 MEMORY_CATEGORIES 加测试分类，append/load/index 追踪全正常——满足"加类不动核心逻辑"。
6. ✅ **不越界**：只新增 prism-memory.ts / prism-memory.test.ts / prism-memory/ 目录，无现有文件被改（工作区那 4 个 M 是 WT-002/004 已验收未提交的改动，非本单）。

**M3-A 完成——持久大脑"容器"造好，可扩展可插拔（用户明确要求）均满足。下一单 M3-B 可在此基础上做开局注入（优先接先验知识进 explore-prompt）。**
