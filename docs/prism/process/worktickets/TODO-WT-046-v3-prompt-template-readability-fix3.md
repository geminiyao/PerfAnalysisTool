# TODO-WT-046-v3 · prompt + 模板层可读性修复 v3（从"禁形式"升级到"禁内容"）

> 状态：TODO ｜ 里程碑：M5 善后（报告可读性收尾·v3）｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：WT-046 ✅（机器断言 PASS，人眼验收 §0/§3 重复未解决）+ WT-046-v2 ✅（机器断言 PASS，人眼验收 §0/§3 重复仍未解决——v2 只禁了"形式"没禁"内容"，LLM 换个形式绕过）+ WT-047 ✅（ASCII 图铺满）
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§六严禁硬编码 + §七三段管线 + §八占位符填充）+ 本工单"根因分析"节 + v2 工单 `TODO-WT-046-v2-prompt-template-readability-fix2.md` 的失败教训

## 背景

WT-046-v2 机器断言全 PASS（82/0/0 + perfetto 不退化 79/2/1），工单特定断言 1-6 全 PASS（含"§0 ASCII 图不含 ├─/└─ 缩进"），但**人眼验收仍然不通过**——§0 ①②③ 和 §3 下钻 ①②③ 内容仍然重复，只是换了形式（├─/└─ 缩进树 → 柱状图/narrative 文字）。

用户反馈："v2 只禁了形式没禁内容，LLM 换个形式就绕过了约束"——DR-36 验证纪律再次生效：机器断言抓不到的"叙事内容重复"必须人眼验收。

## 证据（v2 report.html 行号，对照 §0 ① 和 §3 下钻 ①）

"MapSignificanceMgr 涨 57.88 倍 + 0.069→3.994ms + GC alloc 0→14043" 这组 **callTree 子树细节** 在 v2 report.html 里出现 **6 次**：

| 位置 | 行号 | 形式 |
|---|---|---|
| §0 ① narrative | 2150 | "下钻到 MapSignificanceMgr 涨 57.88 倍（每帧 0.069ms → 3.994ms），GC alloc 0 → 14043" |
| §0 ① ASCII 图 | 2158-2160 | "下钻 MapSignificanceMgr: 基线 ▏ 0.069ms/帧 / 当前 █████████ 3.994ms/帧 (×57.88, GC alloc 0→14043)" |
| §0 ① caption | 2161 | "Lua Update 涨 8.87 倍，大头是 MapSignificanceMgr 涨 57.88 倍" |
| §3 红线清单 | 2336 | 表格行 |
| §3 下钻 ① narrative | 2350 | "基线 0.069ms → 当前 3.994ms/帧（涨 57.88 倍），GC alloc 0 → 14043" |
| §3 下钻 ① callTree | 2353 | "├─ MapSignificanceMgr cur 3.99ms (59.1%, 大头拆出) 📈 ×57.88" |
| §3 下钻 ① 红线判定 | 2362 | "foldChange ×57.88 + 占当前 p50 9.5% → 触红线。GC alloc 0 → 14043" |
| §4 ROI 散点图 | 3401 | "MapSignificanceMgr: ×57.88 × 9.5% ████████████ P0 (Lua Update 大头, GC alloc 0→14043)" |
| §4 P0-1 | 3423-3424 | "MapSignificanceMgr 涨 57.88 倍...GC alloc 14043" |

§0 ② 同样——"19 次每次 43ms + 100% 命中慢帧 + MapCameraCtrl 子树炸到 56.4ms + spikeRatio 47.4" 在 §0 ②、§3 红线清单、§3 下钻 ②、§4 ROI 散点图、§4 P0-2 都出现。

## 根因分析（关键，开发 agent 必读）

**v2 的失败原因：只禁了"形式"（├─/└─ 缩进树），没禁"内容"（子节点 ms/占比/foldChange/GC alloc 等具体数字）。LLM 换个形式（柱状图/narrative 文字）就绕过了约束。**

### 证据 1：unity-multi-state.txt 第 67 行的语法结构有歧义

当前第 67 行：
```
**不许写 callTree 子树描述**（任何形式的 ├─/└─ 缩进 + 每个节点的 ms/占比/标注，无论"摘要级"还是"完整"）——那是 §3 下钻的职责。§0 的 ASCII 图只用柱状图/因果链/演化对照，不用缩进树。
```

这句话的语法结构是"任何形式的 ├─/└─ 缩进 + 每个节点的 ms/占比/标注"——LLM 理解成"禁的是 ├─/└─ 缩进这种**形式**，只要不用 ├─/└─ 缩进，讲子节点 ms/占比/标注 是允许的"。所以 LLM 把 ├─/└─ 缩进树换成了柱状图（柱状图里仍然讲 MapSignificanceMgr 0.069→3.994ms + GC alloc 0→14043），钻了空子。

### 证据 2：narrative-prompt.txt 第 226 行范例仍在引导 LLM 在 §0 讲子节点细节

当前第 226 行：
```
| §0 三大演化结论 | 每条结论配 1 个 ASCII 图：三态/二态柱状图 / 因果链 / 演化对照（**不许 callTree 缩进树**） | `base ████████ / cur ██████ ░░░░ Run 86% / Sleep 12%` + `主线程 → <渲染管线节点> → <等待 slice> 17.8ms (超 vsync)` |
```

范例里"主线程 → <渲染管线节点> → <等待 slice> 17.8ms"——这就是**子节点细节**（带 ms/占比）。LLM 看到这个范例，自然在 §0 ① 写"下钻到 MapSignificanceMgr 涨 57.88 倍（0.069→3.994ms），GC alloc 0→14043"。

### 核心问题

prompt 一直在禁"**形式**"（缩进树），没禁"**内容**"（子节点细节）。真正的修复必须是**禁内容**：

- §0 不许讲子节点的 ms/占比/foldChange/GC alloc 等具体数字
- §0 只许讲父模块的"涨 X 倍 + 占 p50 Y%"级摘要
- 子节点细节（如 MapSignificanceMgr 0.069→3.994ms + GC alloc 0→14043）全部放 §3 下钻

### v2 的失败教训（DR-49 候选）

"prompt 约束如果只禁形式不禁内容，LLM 会换形式绕过"——和 v1 的"约束和范例打架范例赢"是同类问题：prompt 写得不够精确，LLM 会按更宽松的理解执行。这次必须把约束写到**无歧义**——明确列出 §0 不许出现的具体内容（子节点 ms/占比/foldChange/GC alloc 数字）。

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §六严禁硬编码 + §七三段管线 + §八占位符填充
- `web/server/prism/prompts/report-templates/unity-multi-state.txt` — 需求改动目标（第 42/67 行）
- `web/server/prism/prompts/narrative-prompt.txt` — 需求改动目标（第 226/252-259 行范例）
- `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v2/report.html` — v2 失败案例（§0 ①②③ 看怎么换形式绕过的）
- `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v2/narrative.json` — v2 失败案例（§0 item.narrative 看怎么讲子节点细节的）

## 任务

### 需求 A：unity-multi-state.txt 第 67 行——从"禁形式"升级到"禁内容"

**文件**：`web/server/prism/prompts/report-templates/unity-multi-state.txt`

**改动（第 67 行）**：
- 当前：`**不许写 callTree 子树描述**（任何形式的 ├─/└─ 缩进 + 每个节点的 ms/占比/标注，无论"摘要级"还是"完整"）——那是 §3 下钻的职责。§0 的 ASCII 图只用柱状图/因果链/演化对照，不用缩进树。`
- 改成：`**§0 不许讲子节点细节**——不许出现子节点的 ms/占比/foldChange/GC alloc 等具体数字（无论用 narrative 文字、柱状图、因果链、还是任何其它形式）。§0 只许讲父模块的"涨 X 倍 + 占 p50 Y%"级摘要。子节点细节（如 <大头子节点A1> 0.069→3.994ms + GC alloc 0→14043）全部放 §3 下钻。§0 的 ASCII 图只画父模块 base vs cur 柱状对比，不画子节点。`

**理由**：消除"禁形式还是禁内容"的歧义——明确禁的是"子节点的 ms/占比/foldChange/GC alloc 等具体数字"，不是"├─/└─ 缩进树这种形式"。LLM 不能再换形式绕过。

### 需求 B：unity-multi-state.txt 第 42 行"不许"反例——加"§0 讲子节点细节"反例

**文件**：`web/server/prism/prompts/report-templates/unity-multi-state.txt`

**改动（第 42 行"不许"列表加一条）**：
- 在现有"❌ §0 ① 的 narrative 写'Core.Update 子树：├─ <大头子节点A1> 4.92% ├─ <大头子节点A2> 3.99%...'（完整 callTree 子树是 §3 下钻的职责，§0 只给 ASCII 摘要图 + 一句话结论 + 引用）"下面加一条：
- 加：`❌ §0 ① 的 narrative 写"下钻到 <大头子节点A1> 涨 57.88 倍（0.069→3.994ms），GC alloc 0→14043"（用任何形式讲子节点 ms/占比/foldChange/GC alloc，包括 narrative 文字/柱状图/因果链）——子节点细节是 §3 下钻的职责，§0 只给父模块"涨 X 倍 + 占 p50 Y%"级摘要`

**理由**：用反例明确告诉 LLM "§0 讲子节点 ms/占比/foldChange/GC alloc 数字"是违规的，无论用什么形式。反例比正面约束更有效——LLM 看到反例就知道这种写法不行。

### 需求 C：narrative-prompt.txt 第 226 行范例——§0 行范例改成只讲父模块摘要

**文件**：`web/server/prism/prompts/narrative-prompt.txt`

**改动（第 226 行 §0 行的范例）**：
- 当前：`| §0 三大演化结论 | 每条结论配 1 个 ASCII 图：三态/二态柱状图 / 因果链 / 演化对照（**不许 callTree 缩进树**） | \`base ████████ / cur ██████ ░░░░ Run 86% / Sleep 12%\` + \`主线程 → <渲染管线节点> → <等待 slice> 17.8ms (超 vsync)\` |`
- 改成：`| §0 三大演化结论 | 每条结论配 1 个 ASCII 图：三态/二态柱状图 / 演化对照（**不许 callTree 缩进树，也不许讲子节点 ms/占比/foldChange/GC alloc 数字**） | \`base ████ 1.57ms / cur ████████████████████████████ 13.96ms (×8.87, 占 p50 33.3%)\` |`
- 理由：范例里不许出现子节点 ms/占比（如"主线程 → <渲染管线节点> → <等待 slice> 17.8ms"这种带子节点 ms 的因果链）。范例只讲父模块 base vs cur 柱状对比 + 涨幅 + 占 p50%。LLM 看到这个范例，自然在 §0 ① 只写"涨 8.87 倍 + 占 p50 33.3%"级摘要。

### 需求 D：narrative-prompt.txt 第 252-259 行 callTree 摘要树范例——加"§0 不许讲范例里出现的子节点细节"

**文件**：`web/server/prism/prompts/narrative-prompt.txt`

**改动（第 252 行范例标题下加一句说明）**：
- 当前第 252 行：`callTree 摘要树（**只用于 §3 下钻**，摘要级，10 行内；§0 不许用）：`
- 改成：`callTree 摘要树（**只用于 §3 下钻**，摘要级，10 行内；§0 不许用——§0 也不许讲范例里出现的子节点 ms/占比/foldChange/GC alloc 等细节，如 <大头子节点A1> 4.92% / <大头子模块B1> 5.19% 📈 ×1.37——这些细节是 §3 下钻专属）：`
- 理由：明确 callTree 摘要树范例里出现的子节点 ms/占比/标注是 §3 下钻专属，§0 不许讲——即使不用缩进树形式，用 narrative 文字/柱状图讲这些细节也不行。

### 需求 E：重跑 narrative LLM + render（不重跑 explore）

**为什么不重跑 explore**：findings.json 的 callTreeAnnotations 字段（WT-046 需求 A）已经产好，不需要重跑 explore LLM（10-20min）。本工单只改 narrative-prompt + unity-multi-state 模板，重跑 narrative + render 即可（5min）。

**命令**：
```bash
cd web && npx tsx server/prism/run-unity-pipeline.ts \
  --skip-explore \
  --multi-state-dir data/results/udiff_1782983710451_be175ef1 \
  --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v3
```

**复用 WT-046 的 findings.json**：如果 `--skip-explore` 不能直接复用 WT-046 的 findings.json，手动复制：
```bash
cp web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046/findings.json \
   web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v3/findings.json
```
然后再跑 narrative + render。

**产出路径**：`web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v3/report.html`

**不覆盖**（feedback memory 硬约束）：
- 不许覆盖 `2026-07-20_wt046/report.html`（WT-046 v1 产出，留作对照）
- 不许覆盖 `2026-07-20_wt046_v2/report.html`（WT-046 v2 产出，留作对照）
- 不许覆盖 `2026-07-20_wt047/report.html`（WT-047 产出，留作对照）
- 不许覆盖 `2026-07-20_pruned/report.html`（WT-045 产出，留作对照）

## 硬约束

1. **三段管线硬契约**（DR-44 + dev-conventions.md §七）：本工单只改 prompt + 模板 + 重跑 narrative+render，不改 explore-service / narrative-service / render-html.ts
2. **严禁硬编码**（DR-41 + dev-conventions.md §六）：prompt 引导里用占位符 `<节点名>` / `<大头子节点A1>`，不写死业务名
3. **不覆盖原报告产出物**（feedback memory）：新 report.html/narrative.json 换路径 `2026-07-20_wt046_v3/`，不覆盖 `2026-07-20_wt046/` / `2026-07-20_wt046_v2/` / `2026-07-20_wt047/` / `2026-07-20_pruned/`
4. **不重跑 explore**：findings.json 复用 WT-046 的（callTreeAnnotations 已产好），只跑 narrative + render
5. **perfetto 路径不退化**：改 narrative-prompt.txt 是数据源无关的（所有数据源共用），不能让 perfetto 报告退化。改完要跑 perfetto harness 确认
6. **本工单的核心是从禁形式升级到禁内容**：prompt 必须明确"§0 不许讲子节点 ms/占比/foldChange/GC alloc 等具体数字"，而不是只禁"├─/└─ 缩进树"这种形式

## 验收 harness（必填，开发 agent 完成前自己跑通，不丢给主 agent）

**通用 harness（跑新产出的 unity 多态报告）**：
```
cd web && npx tsx server/prism/harness.ts --source unity --dir data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v3
```
期望：82 PASS / 0 FAIL / 0 WARN（不退化）

**工单特定断言**：

```bash
# 1. unity-multi-state.txt 第 67 行已升级到"禁内容"
grep -n "不许讲子节点细节" web/server/prism/prompts/report-templates/unity-multi-state.txt
# 期望：≥1（"禁内容"约束生效）

# 2. unity-multi-state.txt 第 42 行反例加了"§0 讲子节点细节"
grep -n "用任何形式讲子节点 ms/占比/foldChange/GC alloc" web/server/prism/prompts/report-templates/unity-multi-state.txt
# 期望：≥1（反例生效）

# 3. narrative-prompt.txt 第 226 行范例已删子节点 ms/占比
grep -n "§0 三大演化结论" web/server/prism/prompts/narrative-prompt.txt
# 期望：该行不含"主线程 → <渲染管线节点> → <等待 slice> 17.8ms"这种子节点细节范例，
# 含"base ████ 1.57ms / cur ████████████████████████████ 13.96ms (×8.87, 占 p50 33.3%)"父模块摘要范例

# 4. narrative-prompt.txt 第 252 行范例加了"§0 不许讲子节点细节"
grep -n "§0 也不许讲范例里出现的子节点 ms/占比/foldChange/GC alloc 等细节" web/server/prism/prompts/narrative-prompt.txt
# 期望：≥1

# 5. 新 narrative.json 的 §0 item.narrative 不含子节点细节
# 检查 §0 的 item.narrative 不含"MapSignificanceMgr 涨 57.88 倍"/"0\.069.*3\.994"/"GC alloc 0→14043" 等子节点具体数字
# 此条由主 agent 人眼检查（机器难抓"父模块级摘要 vs 子节点细节"边界）

# 6. 新 narrative.json 的 §0 ASCII 图不含子节点 ms/占比
# 检查 §0 的 item.visualAsset.ascii.content 不含"0.069"/"3.994"/"14043" 等子节点数字
# 此条由主 agent 人眼检查

# 7. 新 narrative.json 的 §0 ①②③ 和 §3 下钻 ①②③ 不再逐字重复
# §0 只给"涨 X 倍 + 占 p50 Y%"级摘要 + "详见 §3 下钻 ①"
# §3 下钻才讲子节点细节（MapSignificanceMgr 0.069→3.994ms + GC alloc 0→14043 等）
# 此条由主 agent 人眼检查
```

**端到端冒烟**（不重跑 explore，复用 WT-046 的 findings.json）：
```
cd web && npx tsx server/prism/run-unity-pipeline.ts --skip-explore \
  --multi-state-dir data/results/udiff_1782983710451_be175ef1 \
  --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v3
```
跑通后把 report.html 路径告诉主 agent，主 agent 对照 §0/§3 看重复是否消除。

**perfetto 不退化检查**：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5
# 期望：原 79 PASS / 2 FAIL / 1 WARN 不退化（2 FAIL 是 WT-037 遗留，与本工单无关）
```

## 完成标准

1. 通用 harness 82 PASS / 0 FAIL / 0 WARN（unity 多态报告）
2. 工单特定断言 1-4 全 PASS（断言 5-7 主 agent 人眼检查）
3. 端到端冒烟成功，新 report.html 产出（路径 `2026-07-20_wt046_v3/report.html`）
4. **不覆盖** `2026-07-20_wt046/` / `2026-07-20_wt046_v2/` / `2026-07-20_wt047/` / `2026-07-20_pruned/`（feedback memory 硬约束）
5. **新 narrative.json 的 §0 ①②③ narrative 不含子节点细节**（"MapSignificanceMgr 涨 57.88 倍" / "0.069→3.994ms" / "GC alloc 0→14043" 这些都不许出现，§0 只给"涨 8.87 倍 + 占 p50 33.3%"级摘要）
6. **新 narrative.json 的 §0 ①②③ ASCII 图不含子节点 ms/占比**（只画父模块 base vs cur 柱状对比，不画子节点 0.069/3.994/14043 等数字）
7. **新 narrative.json 的 §0 ①②③ 和 §3 下钻 ①②③ 不再逐字重复**（§0 一句话结论 + 父模块摘要 + "详见 §3 下钻 ①"，§3 下钻才详细展开子节点细节）
8. **perfetto 报告不退化**（narrative-prompt.txt 改动不影响 perfetto）
9. 把改动 diff + harness 末尾输出 + 新 report.html 路径告诉主 agent

harness 跑不通就继续改，改到 FAIL=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

开发 agent 说完成后，主 agent 独立做（不只信开发 agent 报告的 PASS）：

1. 独立跑一遍通用 harness + 工单特定断言 1-4
2. **打开 narrative.json 看结构（机器断言 5-7 主 agent 人眼检查）**：
   - §0 ①②③ 的 `narrative` 字段是否含子节点细节（"MapSignificanceMgr 涨 57.88 倍" / "0.069→3.994ms" / "GC alloc 0→14043" 这类）——**不应含**，这些只在 §3 下钻
   - §0 ①②③ 的 `visualAsset.ascii.content` 是否含子节点 ms/占比（"0.069"/"3.994"/"14043" 等）——**不应含**，只画父模块 base vs cur 柱状对比
   - §0 ①②③ 和 §3 下钻 ①②③ 是否逐字重复——**不应重复**，§0 只给一句话结论 + 父模块摘要 + "详见 §3 下钻 ①"
3. 打开 report.html 看可读性（harness 验不了"叙事可读性"，要人看）：
   - §0 ①②③ 的 ASCII 图是否是父模块 base vs cur 柱状图（不是子节点细节图）
   - §0 ①②③ 的正文是否只给结论 + 父模块摘要 + 引用（不含子节点 ms/占比/foldChange/GC alloc 数字）
   - §3 下钻 ①②③ 是否是详细展开的地方（callTree 子树 + 红线判定 + GC 归因 + 优化建议）
4. 对照 WT-046 v2 report.html 看重复是否消除（v2 是失败案例，v3 应该修复）：
   - v2 report.html:2150 "下钻到 MapSignificanceMgr 涨 57.88 倍（0.069→3.994ms），GC alloc 0→14043" 这种子节点细节在 v3 §0 ① 不应出现
   - v2 report.html:2158-2160 "下钻 MapSignificanceMgr: 基线 ▏ 0.069ms/帧 / 当前 █████████ 3.994ms/帧 (×57.88, GC alloc 0→14043)" 这种子节点柱状图在 v3 §0 ① 不应出现
5. 确认 perfetto 报告不退化
6. 任一不通过 = 打回，不在错误基座上继续堆功能

## 注意事项

- **本工单是 prompt + 模板层修复 v3**：只改 prompt + 模板 + 重跑 narrative+render，不改 explore-service / narrative-service / render-html.ts。findings.json 复用 WT-046 的（callTreeAnnotations 已产好）。
- **不重跑 explore LLM**：findings.json 的 callTreeAnnotations 字段已经产好（WT-046 需求 A 生效），不需要重跑 explore（10-20min）。本工单只改 narrative-prompt + unity-multi-state 模板，重跑 narrative + render 即可（5min）。
- **根因是 v2 只禁形式没禁内容**：v2 加了"任何形式的 ├─/└─ 缩进"约束，但 LLM 把它理解成"禁 ├─/└─ 缩进这种形式"，换成柱状图/narrative 文字讲子节点细节就绕过了。v3 必须禁内容——明确"§0 不许讲子节点 ms/占比/foldChange/GC alloc 等具体数字"，不是"不许用 ├─/└─ 缩进树这种形式"。
- **反例比正面约束有效**：v3 在 unity-multi-state.txt 第 42 行加反例"§0 ① 的 narrative 写'下钻到 <大头子节点A1> 涨 57.88 倍（0.069→3.994ms），GC alloc 0→14043'（用任何形式讲子节点 ms/占比/foldChange/GC alloc）——子节点细节是 §3 下钻的职责"——LLM 看到反例就知道这种写法不行。
- **范例必须同步改**：v3 必须改 narrative-prompt.txt 第 226 行范例——把"主线程 → <渲染管线节点> → <等待 slice> 17.8ms"这种带子节点 ms 的范例改成"base ████ 1.57ms / cur ████████████████████████████ 13.96ms (×8.87, 占 p50 33.3%)"父模块摘要范例。约束和范例必须一致（v1 教训：约束和范例打架范例赢）。
- **不覆盖原报告产出物**：新 report.html/narrative.json 换路径 `2026-07-20_wt046_v3/`，不覆盖 `2026-07-20_wt046/` / `2026-07-20_wt046_v2/` / `2026-07-20_wt047/` / `2026-07-20_pruned/`。
- **perfetto 路径不退化**：narrative-prompt.txt 是数据源无关的（所有数据源共用），改完要确认 perfetto 不退化。narrative-prompt.txt 第 226 行 + 第 252-259 行范例改了，perfetto 报告也会受影响——但 perfetto-multi-state.txt 模板有自己的章节职责分工约束，perfetto §0 一直用柱状图不用缩进树，所以不会退化。改完跑 perfetto harness 确认。

## 验收对照表（开发 agent 自检 + 主 agent 复核）

| 检查项 | WT-046 v1（失败） | WT-046 v2（失败） | WT-046 v3（期望） |
|---|---|---|---|
| unity-multi-state.txt 第 67 行约束 | 禁"├─/└─ 缩进"形式 | 禁"任何形式的 ├─/└─ 缩进"（仍禁形式） | **禁内容**："§0 不许讲子节点 ms/占比/foldChange/GC alloc 等具体数字" |
| unity-multi-state.txt 第 42 行反例 | 无 | 无 | 加"§0 讲子节点细节"反例（用任何形式讲都违规） |
| narrative-prompt.txt 第 226 行范例 | 引导 §0 用 callTree 摘要树 | 删 callTree 摘要树，但仍含"主线程 → <渲染管线节点> → <等待 slice> 17.8ms"子节点细节范例 | 改成父模块摘要范例"base ████ 1.57ms / cur ████████████████████████████ 13.96ms (×8.87, 占 p50 33.3%)" |
| narrative-prompt.txt 第 252 行范例 | "§0 或 §3 下钻" | "只用于 §3 下钻，§0 不许用" | 加"§0 也不许讲范例里出现的子节点 ms/占比/foldChange/GC alloc 等细节" |
| §0 ①②③ narrative 含子节点细节 | 有（"子树大头 MapSignificanceMgr 涨 57.88 倍"） | 有（"下钻到 MapSignificanceMgr 涨 57.88 倍（0.069→3.994ms），GC alloc 0→14043"） | **无**（只有"涨 8.87 倍 + 占 p50 33.3%"级摘要） |
| §0 ①②③ ASCII 图含子节点 ms/占比 | 有（├─/└─ 缩进树） | 有（柱状图里画"0.069/3.994/14043"子节点数字） | **无**（只画父模块 base vs cur 柱状对比） |
| §0 ①②③ 和 §3 下钻 ①②③ 逐字重复 | 是 | 是（换形式重复） | **否**（§0 父模块摘要 + 引用，§3 下钻子节点细节） |
| 通用 harness | 82/0/0 | 82/0/0 | 82/0/0（不退化） |
| perfetto harness | 79/2/1 | 79/2/1 | 79/2/1（不退化，2 FAIL 是 WT-037 遗留） |
