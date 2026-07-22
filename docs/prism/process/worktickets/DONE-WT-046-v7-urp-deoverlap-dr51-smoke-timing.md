# TODO-WT-046-v7 · §0 ② URP 重复修复 + DR-51 端到端冒烟 + 真实 timing 验证

> 状态：TODO ｜ 里程碑：M5 善后（报告可读性收尾·v7）｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：
> - WT-049 ✅（narrative JSON 修复回路 + timing log 验收 PASS，2026-07-22）。v7 重跑 narrative 时 JSON 修复回路兜底，不再"6 次才成功 1 次"——LLM 产出非法 JSON 时自动提取错误位置 + 反馈给 LLM 重试最多 2 次
> - WT-046 v6 部分 PASS（FAIL C 平移到 §0 ② URP，记遗留 v7）。v6 §0 ② URP 讲了子节点 ms 数字 + 具体帧单帧数字，与 §3 下钻 ② URP 重复
> - WT-048 DR-51 三层架构修复验收 PASS，但遗留"DR-51 验证只到 formatMemoryForPrompt 层，没跑端到端冒烟确认运行时 LLM 真的读到 constitution + methodology 块"——v7 顺带验证
>
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§六严禁硬编码 + §6.2 禁内容不只禁形式 DR-49 + §6.3 纪律 vs 内容边界 DR-50 + §七三段管线 + §八占位符填充）+ 本工单"v6 FAIL C 根因分析"节 + 本工单"v7 修复策略"节

## 背景

WT-046 v6 验收部分 PASS，核心改动（图文并茂引导 + §3 下钻讲更深 + DR-50 合规）都对了，但 FAIL C 从 v5 的 §0 ③ GC.Collect 平移到 v6 的 §0 ② URP——每次重跑 FAIL 在不同条之间波动，是 LLM 单条不稳定问题，不是 prompt 约束缺陷。

**v6 的 2 个 FAIL**：
1. **[2b]** topConclusions #2 URP problem 与 §0 ② title sim=1.0（title 复述 problem，违反 v5"§0 是结论先行的叙事展开，不是 topConclusions 的复述"约束）
2. **[2c]** §0 ② URP 与 §3 下钻 ② URP 共享 5.96ms/13.08ms（§0 讲子节点 ms 数字 + frame 453 单帧数字，违反 v5"§0 不许讲子节点 ms/foldChange/GC alloc 数字 + 具体帧单帧数字"约束）

**v6 §0 ② URP narrative 讲了**：
- "URP.Render 90%" / "URP.MainRenderingTransparent 28%" 子节点占比（这个 OK——§0 允许讲子节点名字+占比）
- "每帧从 6.56ms 涨到 12.52ms（涨 1.91 倍）"——**违规**：这是子节点 ms 数字（URP.RenderSingleCamera 的 ms），§0 只允许讲父模块自身的 ms
- "ForwardRenderPass 单帧尖峰 13.08ms @ frame 453"——**违规**：具体帧单帧数字，§0 只允许讲聚合统计（p50/p99/foldChange/占 p50%）

**v6 §3 下钻 ② URP 重复了同样的数字**：5.96ms/13.08ms/frame 453/28% 等。但 §3 下钻 ② 也讲了更深的东西（callTree 路径、源码归因、frame 453 是 CPU bound 还是 GPU bound、优化方向）——v6 需求 E 方向 2 已实现，问题是 §0 ② 也讲了子节点 ms 数字 + 具体帧单帧数字。

## v6 FAIL C 根因分析（开发 agent 必读）

**根因 1：LLM 单条不稳定，不是 prompt 约束缺陷**
- unity-multi-state.txt §0 约束已明确（第 77-91 行）："§0 允许讲父模块自身 foldChange + ms/帧 + 占 p50% + 绝对增量 + 子节点名字+占比+定性；§0 不许讲子节点 ms/帧数字 + 子节点 foldChange 数字 + 子节点 GC alloc 数字 + 具体帧单帧数字"
- 反例已加（第 42-47 行）："§0 ② 的 narrative 写'下钻到 <大头子节点> 涨 X 倍（0.069→3.994ms），GC alloc 0→14043'——违规"
- 但 LLM 在 §0 ② URP 这条没严格遵守——LLM 把"URP.RenderSingleCamera 每帧 6.56→12.52ms"当成了"父模块自身的 ms"，实际上 URP.RenderSingleCamera 是 URP 渲染管线的子节点，不是顶层父模块
- v5 是 §0 ③ GC.Collect 违规，v6 是 §0 ② URP 违规——每次 FAIL 在不同条之间波动，是 LLM 产出概率问题

**根因 2：v6 重跑 6 次才成功 1 次，成本不可控**
- v6 开发 agent 重跑 6 次 narrative，前 5 次失败（超时 / 非法 JSON），第 6 次成功
- 每次 10-30 分钟，总共 1-3 小时
- **WT-049 已修复**：narrative-service.ts 加了 JSON 修复回路（最多 2 次重跑 LLM）+ timing log。v7 重跑 narrative 时 JSON 修复回路兜底，不再"6 次才成功 1 次"

**根因 3：LLM 对"父模块 vs 子节点"边界判定有歧义**
- §0 ② 的父模块是 "PostLateUpdate.FinishFrameRendering"（红线清单条目），URP.RenderSingleCamera 是它的子节点
- 但 LLM 可能把 "URP 渲染管线" 当成父模块，把 URP.RenderSingleCamera 当成"父模块自身的 ms"
- v7 需要加更明确的反例：§0 ② 的父模块是红线清单条目（PostLateUpdate.FinishFrameRendering），子节点 ms 数字（URP.RenderSingleCamera 的 ms）不许讲

## v7 修复策略（开发 agent 必读）

**v7 不靠"重跑 narrative 碰运气"**——v6 重跑 6 次才成功 1 次，v7 用 WT-049 JSON 修复回路兜底 + 更精准的反例 + DR-51 端到端冒烟 + 真实 timing 验证。

**三个任务一起做**：

1. **§0 ② URP 重复修复**（需求 A）：加更精准的反例——§0 ② 的父模块是红线清单条目，子节点 ms 数字不许讲。但**不加更强约束**（v6 教训：加更强约束会触发更多非法 JSON）
2. **DR-51 端到端冒烟验证**（需求 B）：v7 重跑 narrative 时顺带验证 narrative prompt 真的含 ## constitution + ## methodology 块——WT-048 遗留
3. **真实 timing 验证**（需求 C）：v7 重跑 narrative 时顺带看真实 timing——WT-049 遗留，确认 llm_call 是否占 80%+

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §六严禁硬编码 + §6.2 禁内容不只禁形式 DR-49 + §6.3 纪律 vs 内容边界 DR-50 + §七三段管线 + §八占位符填充
- `web/server/prism/prompts/report-templates/unity-multi-state.txt` — §0/§3 章节骨架（v6 改完的，第 77-91 行 §0 约束 + 第 42-47 行反例）
- `web/server/prism/narrative-service.ts` — WT-049 加的 timing log + JSON 修复回路（runPrismNarrative 主入口 :650-861 + attemptJsonRepair :606-648 + extractErrorContext :498-524 + buildRepairPrompt :531-544）
- `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/narrative.json` — v6 产出（看 §0 ② URP 和 §3 下钻 ② URP 重复）
- `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/report.html` — v6 报告（154.7 KB）

## 任务

### 需求 A：§0 ② URP 重复修复——加更精准的反例

**文件**：`web/server/prism/prompts/report-templates/unity-multi-state.txt`

**当前 §0 约束**（第 77-91 行）已明确：
- §0 允许讲：父模块自身的 foldChange + ms/帧 + 占 p50% + 绝对增量 + 子节点名字+占比+定性
- §0 不许讲：子节点 ms/帧数字 + 子节点 foldChange 数字 + 子节点 GC alloc 数字 + 具体帧单帧数字

**问题**：LLM 在 §0 ② URP 这条把 "URP.RenderSingleCamera 每帧 6.56→12.52ms" 当成了"父模块自身的 ms"，实际上 URP.RenderSingleCamera 是 PostLateUpdate.FinishFrameRendering 的子节点。

**改动**：在 §0 约束段（第 85-91 行附近）加 1 个更精准的反例，明确"父模块 = 红线清单条目，子节点 ms 数字不许讲"：

```
★【§0 父模块 vs 子节点边界·红线清单条目是父模块】
§0 的"父模块"= 红线清单条目（如 PostLateUpdate.FinishFrameRendering）。红线清单条目下的子节点 ms 数字不许讲——即使子节点是"渲染管线"这种看起来像父模块的节点。
- ❌ 反例（v6 §0 ② URP 违规）：§0 ② narrative 写"每帧从 6.56ms 涨到 12.52ms（涨 1.91 倍），绝对增量 +5.96ms/帧"——这是 URP.RenderSingleCamera（子节点）的 ms 数字，不是父模块 PostLateUpdate.FinishFrameRendering 的 ms。§0 只许讲父模块自身的"涨 X 倍 + 占 p50 Y%"
- ❌ 反例（v6 §0 ② URP 违规）：§0 ② narrative 写"ForwardRenderPass 单帧尖峰 13.08ms @ frame 453（spikeRatio 5.13）"——这是子节点的具体帧单帧数字，§0 不许讲具体帧单帧数字
- ✅ 正例：§0 ② narrative 写"PostLateUpdate.FinishFrameRendering 涨 1.91 倍（临近红线），占当前 p50 29.9%，是稳态第二大成本——大头是子节点 URP.RenderSingleCamera（占父模块 90%），分摊型大头（10 个子 pass，maxChildRatio 0.28）统筹在父级"——讲父模块自身的 foldChange + 占 p50% + 子节点名字+占比+定性，不讲子节点 ms 数字
```

**注意 DR-50 边界**：只给纪律"父模块 = 红线清单条目，子节点 ms 不许讲"不给内容"必须讲什么"——讲什么由 findings 决定。

**不加更强约束**（v6 教训）：v6 开发 agent 试过加"即使是父模块自身的具体帧单帧数字也不许讲"，结果 LLM 在 ASCII 图里用了更多 `"` 和换行，第 4-5 次失败。v7 只加 1 个精准反例，不加更强约束。

**理由**：v6 §0 ② URP 违规的根因是 LLM 把"URP.RenderSingleCamera"当成了父模块，实际上它是红线清单条目 PostLateUpdate.FinishFrameRendering 的子节点。加更精准的反例让 LLM 知道"父模块 = 红线清单条目"，不是"看起来像父模块的节点"。

### 需求 B：DR-51 端到端冒烟验证——narrative prompt 真的含 constitution + methodology 块

**文件**：不改代码，只验证

**背景**：WT-048 DR-51 三层架构修复验收 PASS，但遗留"DR-51 验证只到 formatMemoryForPrompt 层，没跑端到端冒烟确认运行时 LLM 真的读到 constitution + methodology 块"。v7 重跑 narrative 时顺带验证。

**验证方法**：
1. v7 重跑 narrative 前，在 `narrative-service.ts` 的 `runPrismNarrative` 函数里，prompt 注入完成后（环节 2 prompt_inject 之后），加一行临时 console.log 打印 promptText 的前 200 字符 + grep constitution/methodology 关键词
2. 重跑 narrative 后，看 console.log 输出确认 promptText 含 `## constitution` 或 `## 宪法` + `## methodology` 或 `## 规程` 关键词
3. 验证完成后，删掉临时 console.log（不许留在代码里）

**或者更简单的方法**（推荐）：在 `formatMemoryForPrompt` 函数里加临时 console.log 打印输出字符串的 constitution/methodology 关键词命中情况。重跑 narrative 后看输出。验证完成后删掉临时 log。

**验收**：开发 agent 在完工报告里贴 console.log 输出，证明 narrative prompt 真的含 constitution + methodology 块。

**注意**：这是临时验证，不许改 narrative-service.ts 或 explore-service.ts 的正式代码——只在本地临时加 console.log，验证完删掉。

### 需求 C：真实 timing 验证——确认 llm_call 是否占 80%+

**文件**：不改代码，只验证

**背景**：WT-049 验收时开发 agent 贴的 timing 是 mock LLM 数据（llm_call=1ms），不反映真实 LLM 耗时比例。v7 重跑 narrative 时顺带看真实 timing。

**验证方法**：
1. v7 重跑 narrative 后，看 narrative.json 的 `narrativeProvenance.timing` 字段
2. 贴 timing 数据到完工报告
3. 判断：llm_call 是否占 80%+？prompt_inject 占比多少？red_team 占比多少？

**验收**：开发 agent 在完工报告里贴真实 timing 数据 + 判断修复方案方向是否正确。

**如果 timing 显示 llm_call 不是大头**（< 50%）：
- 要质疑"为什么 LLM 调用不是大头"——可能 timing 实现有 bug
- 或者 LLM 调用真的不是大头——那 JSON 修复回路是治标不治本，要建议下一步治理那个环节

**如果 timing 显示 llm_call 是大头**（≥ 80%）：
- JSON 修复回路是正确方向——LLM 产出非法 JSON 时工程兜底
- 但也要看 prompt_inject 占比——如果 prompt_inject > 10%，说明 prompt 注入有优化空间

### 需求 D：重跑 narrative + render（不重跑 explore）

**命令**：
```bash
cd web && npx tsx server/prism/run-unity-pipeline.ts \
  --skip-explore \
  --multi-state-dir data/results/udiff_1782983710451_be175ef1 \
  --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-22_wt046_v7
```

**复用 WT-046 的 findings.json**：如果 `--skip-explore` 不能直接复用，手动复制：
```bash
cp web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/findings.json \
   web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-22_wt046_v7/findings.json
```
然后再跑 narrative + render。

**产出路径**：`web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-22_wt046_v7/report.html`

**不覆盖**（feedback memory 硬约束）：
- 不许覆盖 `2026-07-20_wt046/` / `2026-07-20_wt046_v2/` / `2026-07-20_wt046_v3/` / `2026-07-20_wt046_v4/` / `2026-07-20_wt046_v5/` / `2026-07-21_wt046_v6/` / `2026-07-20_wt047/` / `2026-07-20_pruned/`

**v7 重跑 narrative 时 JSON 修复回路兜底**：如果 LLM 产出非法 JSON，narrative-service.ts 的 attemptJsonRepair 会自动提取错误位置 + 反馈给 LLM 重试最多 2 次。开发 agent 不需要手动重跑——JSON 修复回路会自动兜底。

**如果 JSON 修复回路 2 次重试都失败**（极端情况）：
- 看 narrative.json 的 `narrativeProvenance.repairCount` 字段——如果是 2，说明修复回路触发但失败
- 看console.log 的 `[narrative] JSON repair attempt 1/2` / `[narrative] JSON repair attempt 2/2` 输出
- 如果真的 2 次都失败，手动重跑一次（`--skip-explore` 复用 findings.json）

## 硬约束

1. **三段管线硬契约**（DR-44 + dev-conventions.md §七）：本工单改 unity-multi-state.txt 模板 + 重跑 narrative+render，不改 explore-service / narrative-service / render-html.ts / narrative-prompt.txt
2. **严禁硬编码**（DR-41 + dev-conventions.md §六）：prompt 反例里用占位符 `<父模块>` / `<子节点>` / `<大头子节点>`，不写死业务名
3. **DR-50 纪律 vs 内容边界**（dev-conventions.md §6.3）：需求 A 只给纪律"父模块 = 红线清单条目，子节点 ms 不许讲"不给内容"必须讲什么"
4. **不加更强约束**（v6 教训）：v6 加更强约束触发更多非法 JSON。v7 只加 1 个精准反例，不加更强约束
5. **不覆盖原报告产出物**（feedback memory）：新 report.html/narrative.json 换路径 `2026-07-22_wt046_v7/`，不覆盖 v1/v2/v3/v4/v5/v6/wt047/pruned
6. **不重跑 explore**：findings.json 复用 WT-046 v6 的，只跑 narrative + render
7. **perfetto 路径不退化**：改 unity-multi-state.txt 是 unity 特定模板，不影响 perfetto。但改完要跑 perfetto harness 确认
8. **DR-51 端到端冒烟验证用临时 console.log**：不许改 narrative-service.ts 或 explore-service.ts 的正式代码——只在本地临时加 console.log，验证完删掉
9. **v7 不靠"重跑 narrative 碰运气"**：v7 用 WT-049 JSON 修复回路兜底 + 更精准的反例。如果 LLM 产出非法 JSON，JSON 修复回路会自动兜底

## 验收 harness（必填，开发 agent 完成前自己跑通，不丢给主 agent）

**通用 harness**：
```
cd web && npx tsx server/prism/harness.ts --source unity --dir data/prism-out/udiff_1782983710451_be175ef1/2026-07-22_wt046_v7
```
期望：原 231 PASS / 0 FAIL / 0 WARN（v6 的 2 FAIL 修复后应 0 FAIL）

**工单特定断言**：

```bash
# 1. §0 ② URP vs §3 下钻 ② URP 不重复（v6 FAIL C 修复）
node -e "
const n = require('./web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-22_wt046_v7/narrative.json');
const sec0 = n.sections.find(s => s.heading.startsWith('§0'));
const sec3 = n.sections.find(s => s.heading.startsWith('§3'));
const s0_2 = sec0.items[1].narrative || '';
const dr2 = sec3.items.find(i => i.title.includes('②') || i.title.includes('URP'));
const dr2_narrative = dr2 ? (dr2.narrative || '') : '';
// 提取数字特征串
const numPattern = /(\d+\.?\d*\s*(?:倍|ms|字节|%)|frame\s*\d+|单帧\s*\d+\.?\d*ms)/g;
const s0Nums = new Set((s0_2.match(numPattern) || []).map(s => s.trim()));
const drNums = new Set((dr2_narrative.match(numPattern) || []).map(s => s.trim()));
const shared = [...s0Nums].filter(x => drNums.has(x));
console.log('§0 ② shared features with §3 下钻 ②:', shared.length, shared);
console.log(shared.length < 2 ? 'PASS' : 'FAIL');
"
# 期望：PASS（共享 <2 个数字特征串）

# 2. §0 ② URP 不讲子节点 ms 数字 + 具体帧单帧数字
node -e "
const n = require('./web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-22_wt046_v7/narrative.json');
const sec0 = n.sections.find(s => s.heading.startsWith('§0'));
const s0_2 = sec0.items[1].narrative || '';
// 检查 §0 ② 是否含子节点 ms 数字（如 '6.56ms' '12.52ms'）或具体帧单帧数字（如 'frame 453' '13.08ms'）
const hasChildMs = /6\.56ms|12\.52ms|5\.96ms/.test(s0_2);  // v6 违规的子节点 ms 数字
const hasFrameSpike = /frame\s*453|13\.08ms/.test(s0_2);  // v6 违规的具体帧单帧数字
console.log('§0 ② has child ms:', hasChildMs);
console.log('§0 ② has frame spike:', hasFrameSpike);
console.log((!hasChildMs && !hasFrameSpike) ? 'PASS' : 'FAIL');
"
# 期望：PASS（§0 ② 不含子节点 ms 数字 + 具体帧单帧数字）

# 3. §0 ② title 不复述 topConclusions #2 problem（v6 FAIL [2b] 修复）
node -e "
const n = require('./web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-22_wt046_v7/narrative.json');
const tc2 = n.topConclusions[1].problem;
const s0_2_title = n.sections.find(s => s.heading.startsWith('§0')).items[1].title;
// 去掉 ①②③ 编号后算相似度
const normalize = s => s.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, '').trim();
const a = normalize(s0_2_title);
const b = normalize(tc2);
// 简单 Jaccard 相似度
const setA = new Set(a.split(/\s+|，|。|：/).filter(Boolean));
const setB = new Set(b.split(/\s+|，|。|：/).filter(Boolean));
const intersection = [...setA].filter(x => setB.has(x)).length;
const union = new Set([...setA, ...setB]).size;
const sim = union > 0 ? intersection / union : 0;
console.log('sim:', sim.toFixed(3), '(threshold 0.8)');
console.log('§0 ② title:', s0_2_title);
console.log('topConclusions #2:', tc2);
console.log(sim < 0.8 ? 'PASS' : 'FAIL');
"
# 期望：PASS（sim < 0.8，title 不复述 problem）

# 4. §0 ② URP 讲父模块自身的 foldChange + 占 p50% + 子节点名字+占比+定性
node -e "
const n = require('./web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-22_wt046_v7/narrative.json');
const sec0 = n.sections.find(s => s.heading.startsWith('§0'));
const s0_2 = sec0.items[1].narrative || '';
// §0 ② 应含：父模块 foldChange（如 '1.91 倍' 或 '×1.91'）+ 占 p50%（如 '29.9%'）+ 子节点名字+占比（如 'URP.Render' '90%'）
const hasFoldChange = /1\.91\s*倍|×1\.91|涨\s*1\.91/.test(s0_2);
const hasP50Share = /29\.9%|占.*p50/.test(s0_2);
const hasChildName = /URP\.Render|URP\.RenderSingleCamera/.test(s0_2);
console.log('has foldChange:', hasFoldChange);
console.log('has p50 share:', hasP50Share);
console.log('has child name:', hasChildName);
console.log((hasFoldChange && hasP50Share && hasChildName) ? 'PASS' : 'FAIL');
"
# 期望：PASS（§0 ② 讲父模块自身的 foldChange + 占 p50% + 子节点名字）

# 5. DR-51 端到端冒烟——narrative prompt 含 constitution + methodology 块
# 开发 agent 在完工报告里贴 console.log 输出，证明 promptText 含 constitution/methodology 关键词
# 主 agent 验收时看完工报告

# 6. 真实 timing——narrativeProvenance.timing 含各环节耗时
node -e "
const n = require('./web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-22_wt046_v7/narrative.json');
const timing = n.narrativeProvenance?.timing || {};
console.log('timing:', JSON.stringify(timing, null, 2));
const total = timing.total || 1;
const llmPct = ((timing.llm_call || 0) / total * 100).toFixed(1);
const promptPct = ((timing.prompt_inject || 0) / total * 100).toFixed(1);
const redTeamPct = ((timing.red_team || 0) / total * 100).toFixed(1);
console.log('llm_call:', llmPct + '%');
console.log('prompt_inject:', promptPct + '%');
console.log('red_team:', redTeamPct + '%');
console.log(timing.llm_call > 0 ? 'PASS' : 'FAIL');
"
# 期望：PASS（timing 各环节有值，开发 agent 在完工报告判断 llm_call 是否占 80%+）

# 7. repairCount——JSON 修复回路是否触发
node -e "
const n = require('./web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-22_wt046_v7/narrative.json');
const repairCount = n.narrativeProvenance?.repairCount;
console.log('repairCount:', repairCount);
console.log(repairCount !== undefined ? 'PASS' : 'FAIL');
"
# 期望：PASS（repairCount 字段存在，0 = 一次成功，1-2 = 修复过）

# 8. DR-50 合规——unity-multi-state.txt 不含"必须讲 X"内容约束
grep -c "必须讲.*ms\|必须讲.*foldChange\|必须讲.*占 p50" web/server/prism/prompts/report-templates/unity-multi-state.txt
# 期望：0（只给纪律"父模块 = 红线清单条目，子节点 ms 不许讲"不给内容"必须讲什么"）
```

**端到端冒烟**（不重跑 explore，复用 WT-046 v6 的 findings.json）：
```
cd web && npx tsx server/prism/run-unity-pipeline.ts --skip-explore \
  --multi-state-dir data/results/udiff_1782983710451_be175ef1 \
  --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-22_wt046_v7
```
跑通后把 report.html 路径 + timing 数据 + DR-51 冒烟结果告诉主 agent。

**perfetto 不退化检查**：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5
# 期望：原 239 PASS / 2 FAIL / 1 WARN 不退化（2 FAIL 是 WT-037 遗留，与本工单无关）
```

## 完成标准

1. 通用 harness 231 PASS / 0 FAIL / 0 WARN（v6 的 2 FAIL 修复后应 0 FAIL）
2. 工单特定断言 1-8 全 PASS
3. 端到端冒烟成功，新 report.html 产出（路径 `2026-07-22_wt046_v7/report.html`）
4. **不覆盖** v1/v2/v3/v4/v5/v6/wt047/pruned（feedback memory 硬约束）
5. **§0 ② URP vs §3 下钻 ② URP 不重复**（共享数字特征串 <2）
6. **§0 ② URP 不讲子节点 ms 数字 + 具体帧单帧数字**（v6 违规的 6.56ms/12.52ms/5.96ms/frame 453/13.08ms 不再出现）
7. **§0 ② title 不复述 topConclusions #2 problem**（sim < 0.8）
8. **§0 ② URP 讲父模块自身的 foldChange + 占 p50% + 子节点名字+占比+定性**
9. **DR-51 端到端冒烟**：narrative prompt 真的含 constitution + methodology 块（完工报告贴 console.log 输出）
10. **真实 timing**：narrativeProvenance.timing 含各环节耗时（完工报告贴 timing 数据 + 判断 llm_call 是否占 80%+）
11. **repairCount**：narrativeProvenance.repairCount 字段存在（0 = 一次成功，1-2 = 修复过）
12. **DR-50 合规**：只给纪律"父模块 = 红线清单条目，子节点 ms 不许讲"不给内容"必须讲什么"
13. **perfetto 报告不退化**
14. 把改动 diff + harness 末尾输出 + 新 report.html 路径 + timing 数据 + DR-51 冒烟结果告诉主 agent

harness 跑不通就继续改，改到 FAIL=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

开发 agent 说完成后，主 agent 独立做（不只信开发 agent 报告的 PASS）：

1. 独立跑一遍通用 harness + 工单特定断言 1-8
2. **打开 narrative.json + report.html 看结构**：
   - §0 ② URP 是不是不讲子节点 ms 数字 + 具体帧单帧数字了（v6 FAIL C 修复）——**应不讲**
   - §0 ② URP vs §3 下钻 ② URP 是不是不重复了（v6 FAIL [2c] 修复）——**应不重复**
   - §0 ② title 是不是不复述 topConclusions #2 problem 了（v6 FAIL [2b] 修复）——**应不复述**
   - §0 ② URP 是不是讲了父模块自身的 foldChange + 占 p50% + 子节点名字+占比+定性——**应是**
3. **DR-51 端到端冒烟**：看开发 agent 完工报告贴的 console.log 输出，确认 narrative prompt 真的含 constitution + methodology 块
4. **真实 timing**：看开发 agent 完工报告贴的 timing 数据，判断 llm_call 是否占 80%+ + prompt_inject 占比 + red_team 占比
5. **repairCount**：看 narrativeProvenance.repairCount——如果是 1-2，说明 JSON 修复回路真的接住了非法 JSON（WT-049 价值证明）；如果是 0，说明 LLM 一次产出合规 JSON（也可能是运气好）
6. **DR-50 合规检查**：打开 unity-multi-state.txt 看需求 A 加的反例是"父模块 = 红线清单条目，子节点 ms 不许讲"（纪律）还是"必须讲父模块 foldChange"（内容）——应是前者
7. 对照 perfetto v5 标杆看 perfetto 不退化
8. 任一不通过 = 打回 v8

## 注意事项

- **v7 三个任务一起做**：§0 ② URP 重复修复（需求 A）+ DR-51 端到端冒烟（需求 B）+ 真实 timing 验证（需求 C）
- **v7 不靠"重跑 narrative 碰运气"**：v7 用 WT-049 JSON 修复回路兜底 + 更精准的反例。如果 LLM 产出非法 JSON，JSON 修复回路会自动兜底（最多 2 次重跑 LLM）
- **不加更强约束**（v6 教训）：v6 加更强约束触发更多非法 JSON。v7 只加 1 个精准反例，不加更强约束
- **DR-50 边界**：需求 A 只给纪律"父模块 = 红线清单条目，子节点 ms 不许讲"不给内容"必须讲什么"
- **不覆盖原报告产出物**：新 report.html/narrative.json 换路径 `2026-07-22_wt046_v7/`
- **DR-51 端到端冒烟用临时 console.log**：不许改 narrative-service.ts 或 explore-service.ts 的正式代码——只在本地临时加 console.log，验证完删掉
- **v6 的改动是对的**（核心改动都对），本工单不改 v6 的 prompt 约束（图文并茂引导 + §3 下钻讲更深 + DR-50 合规），只加 1 个精准反例 + 修 §0 ② URP 重复
- **如果 v7 仍然 FAIL C**（LLM 单条不稳定）：不要无限重跑。在完工报告里说明 FAIL C 是 LLM 产出概率问题，主 agent 验收时决定是否接受部分 PASS（FAIL C 平移到 v8）或打回。**v7 不靠"重跑碰运气"**——如果 JSON 修复回路兜底后仍然 FAIL C，说明 prompt 约束需要 BK-4 金标集配合（不是 v7 能解决的）

## 验收对照表（开发 agent 自检 + 主 agent 复核）

| 检查项 | WT-046 v6（遗留） | WT-046 v7（期望） |
|---|---|---|
| §0 ② URP vs §3 下钻 ② URP | 重复（共享 5.96ms/13.08ms/frame 453/28%） | **不重复**（共享 <2 个数字特征串） |
| §0 ② URP 子节点 ms 数字 | 讲了 6.56ms/12.52ms/5.96ms（违规） | **不讲**（v6 违规数字不再出现） |
| §0 ② URP 具体帧单帧数字 | 讲了 frame 453/13.08ms（违规） | **不讲**（v6 违规数字不再出现） |
| §0 ② title 复述 problem | sim=1.0（完全复述） | **sim < 0.8**（不复述） |
| §0 ② URP 父模块自身数字 | 没讲清父模块 foldChange + 占 p50% | **讲清**（foldChange + 占 p50% + 子节点名字+占比） |
| DR-51 端到端冒烟 | 未验证（WT-048 遗留） | **验证**（prompt 含 constitution + methodology 块） |
| 真实 timing | 未验证（WT-049 遗留，mock LLM） | **验证**（真实 LLM timing，llm_call 占比） |
| repairCount | N/A（WT-049 新增） | **有值**（0/1/2，看 JSON 修复回路是否触发） |
| DR-50 合规 | v6 已合规 | v7 保持合规（只给纪律不给内容） |
| 通用 harness | 231/2/2（FAIL [2b]+[2c]） | 231/0/0（FAIL C 修复） |
| perfetto harness | 239/2/1 | 239/2/1（不退化，2 FAIL 是 WT-037 遗留） |

---

## 完工报告

（开发 agent 填：改了什么、怎么自测的、有无偏离、timing 数据、DR-51 冒烟结果、repairCount、新 report.html 路径）

## 验收结论

（主 agent 填：PASS / 打回+原因 + **必看 timing 判断修复方案方向是否正确** + **必看 DR-51 冒烟结果**）

---

## 验收结论（2026-07-22 主 agent 独立验收 DR-36）

**判定：部分 PASS（FAIL C 平移到 搂0 鈶� OnCameraMove，接受部分 PASS，进入 M4）**

### 机器断言
- 通用 harness：**240 PASS / 1 FAIL / 2 WARN**（与自报一致）
  - FAIL [2c]：搂0 鈶� OnCameraMove 与 搂3 下钻 鈶� OnCameraMove 共享 ["19 ","43.14","58.5","43.14ms"] 鈮?2
  - WARN 1：callTree.rootMarker 覆盖率 26%（非阻塞）
  - WARN 2：critical/high topConclusion 挂载率 0%（DR-50 合规，挂载可选）
- perfetto 不退化：**239 PASS / 2 FAIL / 1 WARN**（2 FAIL 是 WT-037 遗留）鈭?

### 工单特定断言
| # | 断言 | 结果 |
|---|---|---|
| 1 | 搂0 鈶� URP vs 搂3 下钻 鈶� URP 不重复（共享 <2） | **PASS**（共享 0） |
| 2 | 搂0 鈶� URP 不含子节点 ms + 具体帧单帧 | false-positive FAIL（12.52ms 是父模块 PostLateUpdate.FinishFrameRendering 的 ms，findings.json 确认） |
| 3 | 搂0 鈶� title 不复述 topConclusions #2 problem（sim<0.8） | **PASS**（sim=0.371） |
| 4 | 搂0 鈶� URP 讲父模块 foldChange + 占 p50% + 子节点名+占比 | **PASS** |
| 5 | DR-51 冒烟（prompt 含 constitution+methodology） | **PASS** |
| 6 | 真实 timing（llm_call 占比） | **PASS**（99.97%） |
| 7 | repairCount 字段存在 | **PASS**（=0） |
| 8 | DR-50 合规（无"必须讲 X"内容约束） | **PASS** |

### 人眼检查
- v6 FAIL C 修复确认：搂0 鈶� URP 不再讲子节点 ms（10.64ms/2.98ms/2.59ms）+ 不再讲 frame 453/13.08ms 鈭?
- 搂0 鈶� URP 讲父模块自身 foldChange（脳1.91）+ 占 p50%（29.9%）+ 子节点名字+占比（MainRenderingTransparent 28% 等）+ 定性（分摊型大头）鈭?
- 搂0 鈶� OnCameraMove FAIL C 是真重复：搂0 鈶� 讲"19 次 脳 43.14ms + 100% 命中慢帧 + 占当帧 58.5%"，搂3 下钻 鈶� 也讲"43.14ms self + 56.4ms total + 58.5%"——但 OnCameraMove 是"事件型"finding（19 次尖峰），不是"父子模块"finding，v7 的精准反例（"父模块=红线清单条目，子节点 ms 不许讲"）对它不适用
- DR-51 冒烟：narrative prompt 真的含 ## constitution + ## methodology 块（count: 1 each, total 92730 chars）鈭?
- 真实 timing：llm_call 1,059,624ms (99.97%)，prompt_inject 133ms (0.0125%)，red_team 204ms (0.0192%) 鈭?
- repairCount = 0：LLM 一次产出合法 JSON，JSON 修复回路未触发（运气好，但兜底机制存在）鈭?
- DR-50 合规：需求 A 加的反例是纪律（"父模块=红线清单条目，子节点 ms 不许讲"），不是内容（没写"必须讲 X"）鈭?

### v7 三个任务目标全部达成
1. 需求 A（搂0 鈶� URP 重复修复）：v6 FAIL 在 搂0 鈶� URP，v7 搂0 鈶� URP 已修复 鈭?
2. 需求 B（DR-51 端到端冒烟）：prompt 真的含 constitution+methodology 块 鈭?
3. 需求 C（真实 timing）：llm_call 99.97%，JSON 修复回路方向正确 鈭?

### FAIL C 平移分析
- v6 FAIL 在 搂0 鈶� URP（父子模块型），v7 FAIL 在 搂0 鈶� OnCameraMove（事件型）
- v7 的精准反例对 URP 起作用了（搂0 鈶� URP 不再讲子节点 ms），但 OnCameraMove 不在这个反例覆盖范围内
- OnCameraMove 是"事件型"finding（19 次尖峰），搂0 鈶� 讲"19 次 脳 43.14ms"是聚合统计（搂0 允许），但 搂3 下钻 鈶� 也讲"43.14ms"就重复了——这是边界更模糊的案例
- **这不是 prompt 约束缺陷**（精准反例对 URP 起作用了），是 LLM 单条不稳定 + 事件型 finding 的 搂0/搂3 边界更模糊
- **继续加 prompt 反例不是方向**——OnCameraMove 案例需要 BK-4 金标集配合（不是单纯加 prompt 反例能解决的），或者接受这种"事件型 finding 在 搂0 和 搂3 都讲聚合统计"的轻微重复

### timing 细化建议（WT-050 新工单，M4 之后做）
当前 llm_call 测的是"spawn CLI 子进程到子进程退出"的总时间，包含 CLI 启动 + prompt 传输 + LLM 推理 + LLM 调 Write 工具 + CLI 清理。要细分 LLM 推理内部，需要把 explore-service.ts 的 stream-json 事件解析模式（handleExploreStreamEvent）移植到 narrative-service.ts 的 unLlmOnce，细分出 cli_init / llm_first_token / llm_stream / tool_call_write / cli_cleanup 五个环节。

### 产出
- web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-22_wt046_v7/report.html（154.6 KB）
- web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-22_wt046_v7/narrative.json（69.7 KB）
- web/server/prism/prompts/report-templates/unity-multi-state.txt（+8 行精准反例）

### 下一步
v7 验收 PASS 后进入 M4 三回路填料里程碑（BK-4 金标集 + BK-21 回归哨兵 + BK-10 知识回路）。BK-4 是 v6/v7 FAIL C 反复出现的根因之一——没有金标集，LLM 产出质量只能靠 prompt 约束。timing 细化（WT-050）放 M4 之后做。
