# Prism 开发需求 · perfetto 模板注入断链修复（DR-45 修复工单）

> **用途**：切新会话时，把本文件 + DR-45 + dev-conventions.md §八 作为提示词喂给开发 agent。
>
> **背景**：DR-45 诊断发现 perfetto 报告模板注入被 `return ''` 短路，narrative LLM 拿到裸骨架交了 5 个分群卡片，报告与 v5.3 标杆差距大。harness 已建好（`web/server/prism/harness.ts`），能秒级抓到全部 4 个断点。
>
> **完整设计**：`docs/prism/memory/rationale.md` DR-45 + `docs/prism/memory/philosophy.md` §一补充

---

## 给开发 agent 的提示词（新会话用）

```
你是 Prism 项目的开发 agent。Prism 是一个性能分析 agent，用三段管线（explore LLM → narrative LLM → render 纯代码）生成性能报告。

【开工必读 · 强制】
1. 读 `CODEBUDDY.md`（项目根目录）
2. 读 `docs/prism/memory/dev-conventions.md`（开发协作约定，特别注意 §八 harness 纪律）
3. 读 `docs/prism/memory/rationale.md` DR-45（本次需求根因 + harness 设计）
4. 读 `docs/prism/memory/philosophy.md` §一补充（5 维度对照表，理解作文机 vs 分析师的运行时分野）

【背景】
DR-45 诊断发现 perfetto 报告三段管线在 narrative 阶段断链：
- `narrative-service.ts:95-103` 的 `resolveReportTemplate` 硬编码 `return ''`，模板文件 `perfetto-multi-state.txt` 存在但没被读取
- `report-pipeline.ts:158` 注册 perfetto pipeline 时 `reportTemplatePath: null` 没填
- `narrative-types.ts` + `render-html.ts` 缺模板要求的视觉资产字段/渲染器（红线矩阵/降频矩阵/多线程宏观表/ASCII 图）

结果：narrative LLM 拿到裸骨架（只有 few-shot 范例 + "按主题分群"自由指令），交了 5 个分群卡片，不是模板要求的 §0-§7 八章。

机制是对的（三段管线 + LLM 推理 + 纯代码渲染），不是作文机。修复方向是接上模板注入 + 扩 schema/render 配套视觉资产，**不是**把 v5.3 章节结构硬编码进 render-html（那才是真退化成作文机）。

【harness 已建好】
`web/server/prism/harness.ts` 是通用 harness（DR-45 §三），开发完成前必跑：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-15_10-36-27
```
当前状态：30 PASS / 4 FAIL。4 个 FAIL 就是你要修的：
1. `resolveReportTemplate` 的 `return ""` 短路
2. `resolveReportTemplate` 没真 readFileSync 读模板文件
3. `report-pipeline.ts` perfetto 注册的 `reportTemplatePath: null`
4. `report.html` 调用树全 fallback（0 棵真实重查，3 棵 fallback）

修完后 harness 必须全 PASS（或 FAIL=0，WARN 可接受）。

【本次需求】

需求 A：接上模板注入（P0，修 harness FAIL 1/2/3）
- A1: 修 `narrative-service.ts:resolveReportTemplate`——`return ''` 改成真的读 `prompts/report-templates/<source>-multi-state.txt`。注意：单态模式读 `<source>-single-state.txt`，多态读 `<source>-multi-state.txt`。当前先支持多态（perfetto triad），单态可后续补。
- A2: 修 `report-pipeline.ts` perfetto 注册——`reportTemplatePath: null` 改成 `'prompts/report-templates/perfetto-multi-state.txt'`。
- A3: （可选）`resolveReportTemplate` 改成从 pipeline registry 取 `reportTemplatePath`，而不是自己硬编码路径。这样数据源切换时不用改 narrative-service。

需求 B：扩 schema + render 视觉资产（P0，修 harness FAIL 4 + 对齐 v5.3 结构）
- B1: `narrative-types.ts` 补字段——模板要求的视觉资产要有结构化字段：
  - `threadOverview`：多线程宏观表（每线程 run/sleep/runnable 三态 + 一句话定位）
  - `throttlingMatrix`：降频判定矩阵（confirmed/likely/suspected 三档 + per-CPU reach%）
  - `redlineMatrix`：红线触发清单（模块/单次 ms/帧/红线类型/子函数热点）
  - `asciiArt`：ASCII 图（状态分布柱状图 + 因果链）——narrative LLM 产出文本，render 原样渲染
  - `metaInfo`：采集元信息（帧数/fps/p50/p95/p99/温度/binder）
  - 注意：这些字段是**可选**的（narrative LLM 按模板填，没填不阻塞渲染），但 render 层要支持
- B2: `render-html.ts` 补渲染器——为 B1 的新字段加渲染逻辑：
  - `threadOverview` → 表格（每线程一行）
  - `throttlingMatrix` → 表格（三档判定 + per-CPU）
  - `redlineMatrix` → 表格（按 ms/帧排序）
  - `asciiArt` → `<pre>` 块原样渲染
  - `metaInfo` → 表格或 metric strip 扩展
  - **关键**：render 层只做呈现，不做判定。判定逻辑（GPU-bound critical / 降频 likely 档）在 explore LLM，narrative LLM 把判定结果填进结构化字段，render 层画成表格/图。
- B3: 修 callTree fallback 问题——当前 3 棵树全 fallback 是因为 `drillDownMarker` 的 marker 名匹配问题（Gfx.WaitForPresentOnGfxThread / Core.Update / URP.BeforeRendering 没匹配到 DB 里的数据）。排查 `tools.ts:drillDownMarker` 的 marker 名匹配逻辑，可能是大小写/路径前缀问题。

需求 C：验收
- C1: 跑 harness 全 PASS（`npx tsx server/prism/harness.ts --source perfetto --dir <run-dir>`）
- C2: 跑端到端管线（`npx tsx server/prism/run-perfetto-pipeline.ts --skip-explore --out <run-dir>`），重跑 narrative + render
- C3: 对照 v5.3 标杆（`docs/report/performance-report_perfetto_ULTIMATE_v5.3.md`）逐项核报告结构：
  - §0 结论先行（3 条独立结论 + ASCII 图）
  - §1 采集元信息表
  - §2 多线程宏观表
  - §3 off-CPU 归因（byState + wait slice 重叠 + ASCII 状态分布 + ASCII 因果链）
  - §4 降频时序（per-CPU + 形态 ASCII + 判定矩阵）
  - §5 callTree 缩进树 + 红线矩阵 + Top 模块下钻
  - §6 GPU-bound 判定矩阵
  - §7 ROI 优化方向
- C4: harness 的 [2] 节（narrative.json 结构契约）全 PASS，特别是 sections 数量 >= 5（模板要求八章，软约束 warning）

【硬约束】
1. 三段管线硬契约：explore LLM → narrative LLM → render 纯代码，不允许脚本拼 narrative
2. render 层只做呈现，不写判定逻辑（判定在 explore LLM，narrative LLM 把结果填进结构化字段）
3. 不硬编码业务名/绝对阈值/死模板（DR-41 + dev-conventions.md §六）
4. 新增的视觉资产字段是**可选**的——narrative LLM 按模板填，没填不阻塞渲染，但 render 层要支持
5. 修完后 harness 必须全 PASS（FAIL=0）

【验收 harness（必填，开发 agent 完成前跑，主 agent 验收时独立跑）】
快速检查：cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-15_10-36-27
工单特定断言：
- harness [1] 节全 PASS（占位符填充无断链）
- harness [3] 节 "report.html 有真实调用树渲染" PASS（realTrees >= 1）
- narrative.json 的 sections 数量 >= 5（模板要求八章，软约束）
慢速冒烟（主 agent 验收时跑）：cd web && npx tsx server/prism/run-perfetto-pipeline.ts --skip-explore

先读必读文档，然后给出你的实施计划（先做哪个需求，怎么拆分），等我确认后再开发。
```

---

## 开发需求顺序（供主 agent 跟进）

### 阶段 1：接上模板注入（需求 A）— P0，修 harness FAIL 1/2/3

| 需求 | 文件 | 验收 |
|---|---|---|
| A1 修 resolveReportTemplate | `web/server/prism/narrative-service.ts` | harness [1] "return '' 短路" PASS + "readFileSync 读模板" PASS |
| A2 修 reportTemplatePath 注册 | `web/server/prism/report-pipeline.ts` | harness [1] "reportTemplatePath 不是 null" PASS |
| A3 （可选）从 registry 取路径 | `web/server/prism/narrative-service.ts` | A1 的优雅实现，非必须 |

### 阶段 2：扩 schema + render 视觉资产（需求 B）— P0，修 harness FAIL 4 + 对齐 v5.3

| 需求 | 文件 | 验收 |
|---|---|---|
| B1 narrative-types 补字段 | `web/server/prism/narrative-types.ts` | threadOverview/throttlingMatrix/redlineMatrix/asciiArt/metaInfo 字段定义 |
| B2 render-html 补渲染器 | `web/server/prism/render-html.ts` | 新字段有渲染逻辑，report.html 含视觉资产 |
| B3 修 callTree fallback | `web/server/prism/tools.ts` | harness [3] "真实调用树渲染" PASS（realTrees >= 1） |

### 阶段 3：验收（需求 C）

- C1 harness 全 PASS
- C2 端到端重跑 narrative + render
- C3 对照 v5.3 逐项核结构
- C4 narrative.json sections >= 5

---

## 注意事项

1. **B3 callTree fallback 可能不是 marker 名问题**——`drillDownMarker` 在 DB 里查不到数据，可能是 run 目录的 DB 路径没传对，或者 marker 名在 DB 里确实没有。开发 agent 要先排查 `render-html.ts:requeryTrees` 的 dbPath 传参，再看 `drillDownMarker` 的 marker 名匹配逻辑。

2. **B1/B2 视觉资产字段是可选的**——narrative LLM 按模板填，没填不阻塞渲染。但 render 层要支持。这样即使 LLM 没填某个字段，报告也不会崩，只是缺那一块。

3. **不要在 render 层写判定逻辑**——红线矩阵的"超红线 2ms"判定、降频矩阵的"likely 档"判定，都是 explore LLM 的推理结果，narrative LLM 把结果填进结构化字段，render 层只画表格。在 render 层写 if-else 判定 = 退化成作文机。

4. **harness 是底线不是上限**——harness 全 PASS 不等于报告质量达标。主 agent 验收时还要对照 v5.3 核叙事可读性（人话先行/图文穿插/调用树有焦点），这是 harness 机器检查不到的。
