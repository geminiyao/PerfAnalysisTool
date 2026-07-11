# 工单 WT-007 · M3-B 开局注入：先验知识 → explore-prompt

> 状态：REVIEW（待验收）｜里程碑：M3 持久大脑通电（第3单）｜执行方：Cursor
> 依据：`docs/prism/plan/roadmap.md` M3 拆解（M3-B）+ WT-005/WT-006 已建好持久大脑+摄入(priors 79条已入库)

## 背景（为什么做）

M3-A 建了持久大脑 `prism-memory/`，M3-摄入(WT-006)把先验知识清洗成 79 条条目存进 `priors/`。但这些知识现在**只是躺在库里，分析流程根本没读它**——Prism 每次 explore 仍是"空脑"开局，不知道"MapSignificanceMgr 该重点看""MapCameraCtrl 是拖视野卡顿入口"这些早已入库的业务知识。

本单做**开局注入**：explore 启动前，从持久大脑加载知识，格式化后注入 explore-prompt。这是 BK-LOOP"通电"的加载端——**做完后 Prism 分析开局就带着已知业务知识**。

## 目标（做完什么样，可观测）

1. explore-prompt.txt 模板加 `{{MEMORY_INJECTION}}` 占位。
2. explore-service.ts 在组装 prompt 时（现有 514-523 行的 replace 链附近），调 `loadMemory()` 把知识格式化成一段文本，替换该占位。
3. **大脑空/无知识时注入空串**——行为与现在完全一致（向后兼容，不破坏现有 explore）。
4. 注入的知识在最终 prompt 里真实出现（可核对）。

## 关键约束（★守 F2 自由发现原则，别把知识变成"预设盯防清单"）

Prism 的立身之本是 **F2 自由发现**（DR-2 废白名单）：热点从数据里自然浮现，不套预设清单。注入先验知识**不能破坏这一点**。所以：
- 注入的知识块要明确定性为 **"参考线索/背景知识"**，不是"必须盯这些"的检查清单。
- prompt 里要有一句话向 LLM 说清：**这些是已知的先验参考，帮你更快理解数据；但仍以数据为准、自由发现，不要因为清单里有就硬报、清单里没有就不报**。
- 不改变"零编造/可回溯"铁律——先验知识是背景，不能当证据；结论仍须来自本次真实查询。

## 改哪些文件（精确；本单只允许动这些）

- `web/server/prism/explore-service.ts`（加载 memory + 格式化 + 替换占位）
- `web/server/prism/prompts/explore-prompt.txt`（加 `{{MEMORY_INJECTION}}` 占位 + F2 说明文字）
- 可新增 `web/server/prism/explore-service.test.ts` 或复用现有测试放置（若无则新增，纯 tsx 脚本）——测"注入格式化"逻辑

> ⚠️ 只读复用：`prism-memory.ts` 的 `loadMemory`（不改它）。
> ⚠️ 不碰：tools.ts / render-*.ts / ingest-memory.ts / narrative-*。
> ⚠️ 本单只做"加载端(注入)"，不做"写回端(沉淀)"——那是 M3-C。

## 现状（施工方必读）

- **注入点**：`explore-service.ts` 约 514-523 行，现有 replace 链：
  ```ts
  let promptText = fs.readFileSync(promptTemplatePath, 'utf-8');
  promptText = promptText.replace(/\{\{RUN_ID\}\}/g, runId);
  promptText = promptText.replace(/\{\{OUTPUT_DIR\}\}/g, outputDirPosix);
  promptText = promptText.replace(/\{\{FRAME_BUDGET_MS\}\}/g, String(frameBudgetMs));
  promptText = promptText.replace(/\{\{TARGET_FPS\}\}/g, String(targetFps));
  ```
  在此链里加一行 `promptText = promptText.replace(/\{\{MEMORY_INJECTION\}\}/g, memoryBlock);`。
- **loadMemory 接口**（prism-memory.ts）：`loadMemory({categories?}) => {entries, byCategory}`。每条 entry 有 `id/category/content/source/title?/tags?`。
- **explore-prompt.txt 结构**：第 7-17 行"第一原则"，第 19-29 行"判定基准"。`{{MEMORY_INJECTION}}` 占位建议放在这两节之间（LLM 读完铁律、开工前看到先验参考）。
- priors 现有 79 条（unity-cpu 59 + aoe-cpu 20）。

## 具体要求

### 1. explore-prompt.txt 加占位 + F2 说明
在"第一原则"节后、"判定基准"节前，加一节，形如：
```
═══...═══
【已知先验参考 · 仅作线索，不是盯防清单】
═══...═══

以下是关于本引擎/本游戏的已知背景知识，帮你更快看懂数据、少走弯路。
⚠️ 但这些只是**参考线索**：仍以本次真实数据为准、自由发现——不要因为下面提到就硬报，也不要因为没提到就不报。先验知识不能当证据，结论仍须来自你本次的真实查询。

{{MEMORY_INJECTION}}
```
（措辞施工方可优化，但**必须保留 F2 免责声明的精神**）

### 2. explore-service.ts 加载 + 格式化
- 新增一个格式化函数（如 `formatMemoryForPrompt(): string`）：
  - 调 `loadMemory({categories:['priors','knowledge','lessons']})`（capabilities 是"想查的工具需求"，对分析开局帮助小，本单可先不注入——但**用配置数组控制注入哪些类、别写死**，方便日后调整）。
  - 把条目格式化成紧凑可读文本：按分类分组，每条一行或简短块（`- [title] content 摘要`）。
  - **控制长度**：79 条全量注入可能太长。要有上限保护（如按分类取、或总字符数上限，超了截断并注明）。施工方定一个合理策略（建议：先验知识优先、总长控制在合理范围如 ~6-8KB）。
  - **大脑空 → 返回空串**（此时占位替换成空，prompt 无该内容）。
- 在 replace 链加 `{{MEMORY_INJECTION}}` 替换。

### 3. 向后兼容
- memory 为空时，注入空串，explore 行为与改动前一致。
- 不改变 CLI provider、spawn、ledger 等其它逻辑。

## 禁止事项

- 不破坏 F2：注入必须带"参考非清单"的免责说明。
- 不把先验知识当证据源（仍守零编造/可回溯）。
- loadMemory 注入哪些分类要**配置化**，不硬编码。
- 不做沉淀写回(M3-C)。不引第三方依赖。不过度设计：不做向量检索/相关性排序(那是RAG，后续)，本单全量或按分类简单注入即可。

## 验收标准（主 agent 照此逐条核，客观可验）

1. **tsc**：`cd web && npx tsc -p tsconfig.server.json --noEmit`，改动文件零新增错误。
2. **占位替换生效**：单测或脚本验证——`formatMemoryForPrompt()` 对当前 priors(79条) 返回非空文本，且含某条已知知识关键词(如 "MapSignificanceMgr" 或 "MapCameraCtrl")。
3. **注入进 prompt**：验证最终 promptText 里 `{{MEMORY_INJECTION}}` 已被替换（不再有该占位字面量），且包含先验知识内容。
4. **向后兼容（空大脑）**：mock 一个空 memory（用 loadMemory 的 root 参数指向空临时目录），formatMemoryForPrompt 返回空串，prompt 无残留占位。
5. **F2 说明在位**：explore-prompt.txt 含"参考线索/不是盯防清单"及"仍以数据为准、不硬报不漏报"的免责文字。
6. **长度受控**：注入文本有上限保护，不会把 79 条无节制全量灌爆 prompt。
7. **不越界**：只改 explore-service.ts + explore-prompt.txt (+ 可选 test)。

> 说明：本单不跑真实 40min explore（成本高、且属 M3-D 端到端验证范畴）。验收只核"注入逻辑正确 + prompt 含知识 + 向后兼容 + F2 不破"。真实注入效果待 M3-D 连跑验证时看。

## 完工报告（施工方填：改了什么、怎么自测的、有无偏离）

### 改了什么

1. **`web/server/prism/prompts/explore-prompt.txt`**
   - 在「第一原则」与「判定基准」之间新增「已知先验参考 · 仅作线索，不是盯防清单」节，含 F2 免责声明与 `{{MEMORY_INJECTION}}` 占位。

2. **`web/server/prism/explore-service.ts`**
   - 新增配置常量 `MEMORY_INJECTION_CATEGORIES`（`priors` / `knowledge` / `lessons`）与 `MEMORY_INJECTION_MAX_CHARS`（7000）。
   - 新增并导出 `formatMemoryForPrompt(opts?)`：按分类分组格式化条目（`- [title] summary`），单条 content 超 280 字截断，总长约 7KB 上限，超出时追加 truncated 说明；无条目时返回空串。
   - 在 `runPrismExplore` 的 replace 链增加 `{{MEMORY_INJECTION}}` → `formatMemoryForPrompt()`。

3. **`web/server/prism/explore-service.test.ts`**（新增）
   - 5 项 tsx 单测：priors 非空且含 MapSignificanceMgr/MapCameraCtrl、prompt 占位替换、空 root 返回空串、F2 免责文字在位、长度受控。

### 怎么自测的

- IDE linter 对改动文件零报错。
- 主 agent 验收时请执行：
  ```bash
  cd web && npx tsc -p tsconfig.server.json --noEmit
  cd web && npx tsx server/prism/explore-service.test.ts
  ```
- 施工会话内 Shell 工具不可用，未能本地跑通上述命令；逻辑与现有 `prism-memory.test.ts` 同构，预期 PASS。

### 有无偏离

- **无功能偏离**。capabilities 分类按工单要求未注入；未改 prism-memory / tools / ingest / narrative。
- 空大脑时 F2 免责节仍保留（仅 `{{MEMORY_INJECTION}}` 内容为空），与工单「占位替换成空」一致；explore 行为不变。

## 验收结论（主 agent 填：PASS / 打回+原因）

**PASS（2026-07-11，主 agent 独立验收；施工方 shell 故障未自测，主 agent 补跑）**

逐条核对（DR-36 亲自跑）：
1. ✅ **tsc**：`npx tsc -p tsconfig.server.json --noEmit` 仅 baseUrl 既有警告，explore 相关零新增错误。
2. ✅ **占位替换生效**：`formatMemoryForPrompt()` 对当前 priors(79条) 返回非空、含 "MapSignificanceMgr"/"MapCameraCtrl" 关键词（单测验证）。
3. ✅ **注入进 prompt**：最终 promptText 无残留 `{{MEMORY_INJECTION}}` 字面量、含先验知识（单测"no leftover placeholder"+"final prompt contains prior knowledge"）。
4. ✅ **向后兼容（空大脑）**：空 root → 返回空串、占位仍被替换（不残留），explore 行为不变。
5. ✅ **F2 说明在位**：explore-prompt.txt 含"参考线索/不是盯防清单""仍以本次真实数据为准、自由发现、不硬报不漏报、先验知识不能当证据"。
6. ✅ **长度受控**：`MEMORY_INJECTION_MAX_CHARS=7000` 上限 + 超长截断注明（单测验证）。
7. ✅ **配置化**：`MEMORY_INJECTION_CATEGORIES` 数组控制注入哪些类，未硬编码。
8. ✅ **不越界**：只改 explore-service.ts + explore-prompt.txt + 新增 explore-service.test.ts。

**主 agent 微调**：施工方单测[4]的 F2 断言关键词写死为"不硬报/不要硬报"，但 prompt 实际文案是"不要因为下面提到就硬报"（语义一致、用词不同）→ 主 agent 把断言改为匹配"硬报"，语义不变。改后单测 **10 PASS/0 FAIL**。

**M3-B 完成——开局注入接通：Prism explore 启动时会把持久大脑的先验知识(现79条)注入 prompt，且守住 F2 自由发现(知识仅作线索非清单)。大脑↔眼睛的神经接通了。下一单 M3-C 收尾沉淀(大脑↔手)。**
