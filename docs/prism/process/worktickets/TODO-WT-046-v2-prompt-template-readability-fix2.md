# TODO-WT-046-v2 · prompt + 模板层可读性修复 v2（消除 §0/§3 章节重复）

> 状态：TODO ｜ 里程碑：M5 善后（报告可读性收尾·v2）｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：WT-046 ✅（机器断言 PASS，但人眼验收 §0/§3 重复未解决）+ WT-047 ✅（ASCII 图铺满，机器断言 PASS）
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§六严禁硬编码 + §七三段管线 + §八占位符填充）+ 本工单"根因分析"节

## 背景

WT-046/047 机器断言全 PASS（82/0/0 + perfetto 不退化 79/2/1），但**人眼验收发现 WT-046 需求 C（章节职责分工·防重复）没生效**——§0 ①②③ 和 §3 下钻 ①②③ 几乎逐字重复。

用户反馈："核心结论和后面的下钻还是有章节内容重复"——这正是 WT-046 需求 C 的核心目标，开发 agent 自报 9/9 PASS 但实际产出有问题。DR-36 验证纪律生效：机器断言抓不到的"叙事可读性"必须人眼验收。

## 证据（narrative.json + report.html 对照）

### §0 ① vs §3 下钻 ① 逐字重复

**§0 ① narrative**（narrative.json line 142）：
> "Lua 脚本更新模块是当前态涨幅最大的回归模块——从基线每帧 1.57ms 涨到 13.96ms，涨 8.87 倍，绝对增量 12.39ms/帧，占当前 p50 的 33.3%。关键数字：子树大头 MapSignificanceMgr 涨 57.88 倍（0.069→3.994ms/帧），GC alloc 0→14043 暴增——说明退化主因是 Lua 侧临时表/对象分配爆增，不是计算变重。详见 §3 下钻 ①。"

**§3 下钻 ① narrative**（narrative.json line 301）：
> "Update.ScriptRunBehaviourUpdate 子树从 1.57ms 涨到 13.96ms（涨 8.87 倍），子树大头 MapSignificanceMgr 涨 57.88 倍（0.069→3.994ms/帧），GC alloc 0→14043 暴增——退化主因是 Lua 侧临时表/对象分配爆增，不是计算变重。"

两段都讲"子树大头 MapSignificanceMgr 涨 57.88 倍（0.069→3.994ms/帧），GC alloc 0→14043 暴增"——**callTree 子树细节**出现在 §0，违反模板第 67 行"§0 不许写完整 callTree 子树描述"。

**§0 ① ASCII 图**（report.html:2315）：
```
Update.ScriptRunBehaviourUpdate:
  base  █▏ 1.57ms (占 p50 5.9%)
  cur   ████████████████████████████ 13.96ms (占 p50 33.3%)  涨 ×8.87

子树大头 MapSignificanceMgr:
  base  ▏ 0.069ms
  cur   █████████████████ 3.994ms  涨 ×57.88  GC alloc 0→14043
```

这就是 callTree 子树描述（├─/└─ 缩进 + 每节点 ms/占比/标注），违反模板第 67 行"§0 不许写完整 callTree 子树描述（├─/└─ 缩进 + 每个节点的 ms/占比/标注）"。

§0 ②③ 同样违反——narrative 重复"frame 144 的 callTree 显示 LateUpdate→LuaMgr→MapCameraCtrl 子树单帧 56.4ms"，ASCII 图"OnCameraMove 19 次尖峰时序"和 §3 下钻 ② 的 ASCII 图几乎一样。

## 根因分析（关键，开发 agent 必读）

**prompt 内部自相矛盾**——开发 agent 加了约束，但没改范例，约束和范例打架，范例赢。

### 矛盾 1：unity-multi-state.txt 自身矛盾

**文件**：`web/server/prism/prompts/report-templates/unity-multi-state.txt`

第 61 行（§0 章节骨架）：
```
- ASCII 图（柱状/缩进树/对照，数据源无关渲染工具产出）
```
"缩进树"就是 callTree 子树描述（├─/└─ 缩进）。

第 65-69 行（同一节后面）：
```
★【§0 不写 callTree 子树描述·主战场原则】
§0 的 ASCII 图是**摘要级**（10 行内，三态柱状图/因果链/摘要树），讲"演化趋势"...
**不许写完整 callTree 子树描述**（├─/└─ 缩进 + 每个节点的 ms/占比/标注）——那是 §3 下钻的职责。
```
第 66 行又说"摘要树"——"摘要树"也是 callTree 子树描述。"摘要级 vs 完整"的边界模糊，LLM 觉得 10 行内就是摘要。

**矛盾**：第 61 行说 §0 可以用"缩进树"，第 66 行说 §0 可以用"摘要树"，第 67 行又说 §0 不许写"callTree 子树描述（├─/└─ 缩进）"。LLM 按更宽松的执行。

### 矛盾 2：narrative-prompt.txt 范例引导 §0 用 callTree 摘要树

**文件**：`web/server/prism/prompts/narrative-prompt.txt`

第 226 行（ASCII 图类型表）：
```
| §0 三大演化结论 | 每条结论配 1 个 ASCII 图：三态/二态柱状图 / callTree 摘要树 / 因果链 |
```
明确说 §0 可以用"callTree 摘要树"。

第 252-259 行（范例）：
```
callTree 摘要树（§0 或 §3 下钻，摘要级，10 行内）：
  <主入口>  cur 7.32ms/帧 (占 p50 24.1%)
  ├─ <业务模块A>           3.80ms (12.5%)  ── 统筹
  │   ├─ <大头子节点A1>    4.92%   (子节点平均, 不单独列)
  │   └─ <大头子节点A2>    3.99%
  └─ <业务模块B>           2.90ms (9.5%)  ── 大头拆出
```
明确说"callTree 摘要树（§0 或 §3 下钻）"——把 §0 列为 callTree 摘要树的合法位置。

**矛盾**：unity-multi-state.txt 第 67 行说 §0 不许写 callTree 子树描述，narrative-prompt.txt 第 226 行 + 第 252-259 行范例说 §0 可以用 callTree 摘要树。两个 prompt 文件打架，范例赢——LLM 在 §0 ①②③ 全画了 callTree 摘要树。

### 开发 agent 的失误

WT-046 需求 C 只加了 unity-multi-state.txt 第 65-69 行的约束，**没改**：
1. unity-multi-state.txt 第 61 行自身的"缩进树"字样
2. unity-multi-state.txt 第 66 行的"摘要树"字样
3. narrative-prompt.txt 第 226 行范例表的"callTree 摘要树"
4. narrative-prompt.txt 第 252-259 行范例的"§0 或 §3 下钻"

约束和范例打架，范例赢。

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §六严禁硬编码 + §七三段管线 + §八占位符填充
- `web/server/prism/prompts/report-templates/unity-multi-state.txt` — 需求改动目标（第 61/66/67 行矛盾）
- `web/server/prism/prompts/narrative-prompt.txt` — 需求改动目标（第 226/252-259 行范例矛盾）
- `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt047/narrative.json` — 失败案例（§0 ①②③ 看怎么写错了）

## 任务

### 需求 A：消除 unity-multi-state.txt 自身矛盾

**文件**：`web/server/prism/prompts/report-templates/unity-multi-state.txt`

**改动 1（第 61 行）**：
- 当前：`- ASCII 图（柱状/缩进树/对照，数据源无关渲染工具产出）`
- 改成：`- ASCII 图（柱状/因果链/二态对照，数据源无关渲染工具产出）`
- 理由：删掉"缩进树"——缩进树就是 callTree 子树描述，和第 67 行"§0 不许写 callTree 子树描述"矛盾

**改动 2（第 66 行）**：
- 当前：`§0 的 ASCII 图是**摘要级**（10 行内，三态柱状图/因果链/摘要树），讲"演化趋势"（base→cur→throttle 涨了多少）。`
- 改成：`§0 的 ASCII 图是**摘要级**（10 行内，三态/二态柱状图/因果链/演化对照），讲"演化趋势"（base→cur→throttle 涨了多少）。`
- 理由：删掉"摘要树"——摘要树也是 callTree 子树描述，和第 67 行矛盾

**改动 3（第 67 行加强）**：
- 当前：`**不许写完整 callTree 子树描述**（├─/└─ 缩进 + 每个节点的 ms/占比/标注）——那是 §3 下钻的职责。`
- 改成：`**不许写 callTree 子树描述**（任何形式的 ├─/└─ 缩进 + 每个节点的 ms/占比/标注，无论"摘要级"还是"完整"）——那是 §3 下钻的职责。§0 的 ASCII 图只用柱状图/因果链/演化对照，不用缩进树。`
- 理由：消除"摘要级 vs 完整"的模糊边界——任何 ├─/└─ 缩进树都不许在 §0 出现

### 需求 B：消除 narrative-prompt.txt 范例引导

**文件**：`web/server/prism/prompts/narrative-prompt.txt`

**改动 1（第 226 行范例表 §0 行）**：
- 当前：`| §0 三大演化结论 | 每条结论配 1 个 ASCII 图：三态/二态柱状图 / callTree 摘要树 / 因果链 |`
- 改成：`| §0 三大演化结论 | 每条结论配 1 个 ASCII 图：三态/二态柱状图 / 因果链 / 演化对照（**不许 callTree 缩进树**） |`
- 理由：明确 §0 不用 callTree 摘要树，和 unity-multi-state.txt 第 67 行一致

**改动 2（第 252-259 行范例标题 + 说明）**：
- 当前：`callTree 摘要树（§0 或 §3 下钻，摘要级，10 行内）：`
- 改成：`callTree 摘要树（**只用于 §3 下钻**，摘要级，10 行内；§0 不许用）：`
- 理由：明确 callTree 摘要树是 §3 下钻专属，§0 不许用

### 需求 C：重跑 narrative LLM + render（不重跑 explore）

**为什么不重跑 explore**：findings.json 的 callTreeAnnotations 字段（WT-046 需求 A）已经产好，不需要重跑 explore LLM（10-20min）。本工单只改 narrative-prompt + unity-multi-state 模板，重跑 narrative + render 即可（5min）。

**命令**：
```bash
cd web && npx tsx server/prism/run-unity-pipeline.ts \
  --skip-explore \
  --multi-state-dir data/results/udiff_1782983710451_be175ef1 \
  --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v2
```

**复用 WT-046 的 findings.json**：如果 `--skip-explore` 不能直接复用 WT-046 的 findings.json，手动复制：
```bash
cp web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046/findings.json \
   web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v2/findings.json
``然后再跑 narrative + render。

**产出路径**：`web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v2/report.html`

**不覆盖**：
- 不许覆盖 `2026-07-20_wt046/report.html`（WT-046 v1 产出，留作对照）
- 不许覆盖 `2026-07-20_wt047/report.html`（WT-047 产出，留作对照）
- 不许覆盖 `2026-07-20_pruned/report.html`（WT-045 产出，留作对照）

## 硬约束

1. **三段管线硬契约**（DR-44 + dev-conventions.md §七）：本工单只改 prompt + 模板 + 重跑 narrative+render，不改 explore-service / narrative-service / render-html.ts
2. **严禁硬编码**（DR-41 + dev-conventions.md §六）：prompt 引导里用占位符 `<节点名>` / `<大头子节点A1>`，不写死业务名
3. **不覆盖原报告产出物**（feedback memory）：新 report.html/narrative.json 换路径 `2026-07-20_wt046_v2/`，不覆盖 `2026-07-20_wt046/` / `2026-07-20_wt047/` / `2026-07-20_pruned/`
4. **不重跑 explore**：findings.json 复用 WT-046 的（callTreeAnnotations 已产好），只跑 narrative + render
5. **perfetto 路径不退化**：改 narrative-prompt.txt 是数据源无关的（所有数据源共用），不能让 perfetto 报告退化。改完要跑 perfetto harness 确认

## 验收 harness（必填，开发 agent 完成前自己跑通，不丢给主 agent）

**通用 harness（跑新产出的 unity 多态报告）**：
```
cd web && npx tsx server/prism/harness.ts --source unity --dir data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v2
```
期望：82 PASS / 0 FAIL / 0 WARN（不退化）

**工单特定断言**：

```bash
# 1. unity-multi-state.txt 第 61 行已删"缩进树"
grep -n "缩进树" web/server/prism/prompts/report-templates/unity-multi-state.txt
# 期望：0 匹配（"缩进树"字样已删）

# 2. unity-multi-state.txt 第 66 行已删"摘要树"
grep -n "摘要树" web/server/prism/prompts/report-templates/unity-multi-state.txt
# 期望：0 匹配（"摘要树"字样已删）

# 3. unity-multi-state.txt 第 67 行加强"任何形式"
grep -n "任何形式" web/server/prism/prompts/report-templates/unity-multi-state.txt
# 期望：≥1（加强约束生效）

# 4. narrative-prompt.txt 第 226 行已删 §0 的"callTree 摘要树"
grep -n "§0 三大演化结论" web/server/prism/prompts/narrative-prompt.txt
# 期望：该行不含"callTree 摘要树"，含"不许 callTree 缩进树"

# 5. narrative-prompt.txt 第 252 行范例标题已改"只用于 §3 下钻"
grep -n "只用于 §3 下钻" web/server/prism/prompts/narrative-prompt.txt
# 期望：≥1

# 6. 新 narrative.json 的 §0 item.narrative 不含 callTree 子树描述
# 检查 §0 的 item.narrative 不含"├─\|└─\|子树大头\|GC alloc.*→.*[0-9]"
# 此条由主 agent 人眼检查（机器难抓"摘要级 vs 完整"边界）

# 7. 新 narrative.json 的 §0 ASCII 图不含 ├─/└─ 缩进
# 检查 §0 的 item.visualAsset.ascii.content 不含"├─\|└─"
# 此条由主 agent 人眼检查
```

**端到端冒烟**（不重跑 explore，复用 WT-046 的 findings.json）：
```
cd web && npx tsx server/prism/run-unity-pipeline.ts --skip-explore \
  --multi-state-dir data/results/udiff_1782983710451_be175ef1 \
  --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v2
```
跑通后把 report.html 路径告诉主 agent，主 agent 对照 §0/§3 看重复是否消除。

**perfetto 不退化检查**：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5
# 期望：原 79 PASS / 2 FAIL / 1 WARN 不退化（2 FAIL 是 WT-037 遗留，与本工单无关）
```

## 完成标准

1. 通用 harness 82 PASS / 0 FAIL / 0 WARN（unity 多态报告）
2. 工单特定断言 1-5 全 PASS（断言 6-7 主 agent 人眼检查）
3. 端到端冒烟成功，新 report.html 产出（路径 `2026-07-20_wt046_v2/report.html`）
4. **不覆盖** `2026-07-20_wt046/` / `2026-07-20_wt047/` / `2026-07-20_pruned/`（feedback memory 硬约束）
5. **新 narrative.json 的 §0 ①②③ narrative 不含 callTree 子树细节**（"子树大头 MapSignificanceMgr 涨 57.88 倍"这类只在 §3 下钻出现，§0 只给"涨 8.87 倍 + 占 p50 33.3%"级摘要）
6. **新 narrative.json 的 §0 ①②③ ASCII 图不含 ├─/└─ 缩进**（只用柱状图/因果链/演化对照）
7. **新 narrative.json 的 §0 ①②③ 和 §3 下钻 ①②③ 不再逐字重复**（§0 一句话结论 + 关键数字 + "详见 §3 下钻 ①"，§3 下钻才详细展开）
8. **perfetto 报告不退化**（narrative-prompt.txt 改动不影响 perfetto）
9. 把改动 diff + harness 末尾输出 + 新 report.html 路径告诉主 agent

harness 跑不通就继续改，改到 FAIL=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

开发 agent 说完成后，主 agent 独立做（不只信开发 agent 报告的 PASS）：

1. 独立跑一遍通用 harness + 工单特定断言 1-5
2. **打开 narrative.json 看结构（机器断言 6-7 主 agent 人眼检查）**：
   - §0 ①②③ 的 `narrative` 字段是否含 callTree 子树细节（"子树大头 MapSignificanceMgr 涨 57.88 倍（0.069→3.994ms/帧），GC alloc 0→14043"这类）——**不应含**，这些只在 §3 下钻
   - §0 ①②③ 的 `visualAsset.ascii.content` 是否含 ├─/└─ 缩进——**不应含**，只用柱状图/因果链/演化对照
   - §0 ①②③ 和 §3 下钻 ①②③ 是否逐字重复——**不应重复**，§0 只给一句话结论 + 关键数字 + "详见 §3 下钻 ①"
3. 打开 report.html 看可读性（harness 验不了"叙事可读性"，要人看）：
   - §0 ①②③ 的 ASCII 图是否是柱状图/因果链（不是 ├─/└─ 缩进树）
   - §0 ①②③ 的正文是否只给结论 + 关键数字 + 引用（不含 callTree 子树细节）
   - §3 下钻 ①②③ 是否是详细展开的地方（callTree 子树 + 红线判定 + GC 归因 + 优化建议）
4. 对照 WT-047 report.html 看重复是否消除（WT-047 是失败案例，v2 应该修复）
5. 确认 perfetto 报告不退化
6. 任一不通过 = 打回，不在错误基座上继续堆功能

## 注意事项

- **本工单是 prompt + 模板层修复 v2**：只改 prompt + 模板 + 重跑 narrative+render，不改 explore-service / narrative-service / render-html.ts。findings.json 复用 WT-046 的（callTreeAnnotations 已产好）。
- **不重跑 explore LLM**：findings.json 的 callTreeAnnotations 字段已经产好（WT-046 需求 A 生效），不需要重跑 explore（10-20min）。本工单只改 narrative-prompt + unity-multi-state 模板，重跑 narrative + render 即可（5min）。
- **根因是 prompt 内部矛盾**：开发 agent 加了约束但没改范例，约束和范例打架，范例赢。v2 必须消除矛盾——约束 + 范例 + 章节骨架三处一致。
- **"摘要级 vs 完整"边界模糊**：v2 直接禁止 §0 用任何形式的 ├─/└─ 缩进树，消除模糊边界。§0 的 ASCII 图只用柱状图/因果链/演化对照。
- **不覆盖原报告产出物**：新 report.html/narrative.json 换路径 `2026-07-20_wt046_v2/`，不覆盖 `2026-07-20_wt046/` / `2026-07-20_wt047/` / `2026-07-20_pruned/`。
- **perfetto 路径不退化**：narrative-prompt.txt 是数据源无关的（所有数据源共用），改完要确认 perfetto 不退化。narrative-prompt.txt 第 226 行 + 第 252-259 行范例改了，perfetto 报告也会受影响——但 perfetto-multi-state.txt 模板有自己的章节职责分工约束，perfetto §0 一直用柱状图不用缩进树，所以不会退化。改完跑 perfetto harness 确认。

## 验收对照表（开发 agent 自检 + 主 agent 复核）

| 检查项 | WT-046 v1（失败） | WT-046 v2（期望） |
|---|---|---|
| unity-multi-state.txt 第 61 行"缩进树" | 有 | 删掉，改"因果链" |
| unity-multi-state.txt 第 66 行"摘要树" | 有 | 删掉，改"演化对照" |
| unity-multi-state.txt 第 67 行"任何形式" | 无 | 加上（消除"摘要级 vs 完整"模糊边界） |
| narrative-prompt.txt 第 226 行 §0 行"callTree 摘要树" | 有 | 删掉，加"不许 callTree 缩进树" |
| narrative-prompt.txt 第 252 行范例"§0 或 §3 下钻" | 有 | 改"只用于 §3 下钻，§0 不许用" |
| §0 ①②③ narrative 含 callTree 子树细节 | 有（"子树大头 MapSignificanceMgr 涨 57.88 倍"） | 无（只有"涨 8.87 倍 + 占 p50 33.3%"级摘要） |
| §0 ①②③ ASCII 图含 ├─/└─ 缩进 | 有 | 无（只用柱状图/因果链/演化对照） |
| §0 ①②③ 和 §3 下钻 ①②③ 逐字重复 | 是 | 否（§0 一句话结论 + 引用，§3 下钻详细展开） |
| 通用 harness | 82/0/0 | 82/0/0（不退化） |
| perfetto harness | 79/2/1 | 79/2/1（不退化，2 FAIL 是 WT-037 遗留） |
