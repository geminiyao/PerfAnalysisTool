# TODO-WT-046 · prompt + 模板层可读性修复（callTreeAnnotations + 人话化 + 章节职责分工）

> 状态：TODO ｜ 里程碑：M5 善后（报告可读性收尾）｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：WT-044 ✅（unity 多态主线验收）+ WT-045 ✅（callTree 剪枝修复）
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§六严禁硬编码 + §七三段管线 + §八占位符填充）+ `web/server/prism/prompts/perfetto-explore-prompt.txt:219-232`（callTreeAnnotations 引导段，unity 版要对齐）+ `web/server/prism/prompts/report-templates/perfetto-multi-state.txt`（perfetto 模板章节职责分工，unity 版要对齐）

## 背景

WT-044/045 验收通过，但人眼看 report.html 发现 3 个可读性问题：

1. **callTree 节点没有 🔴/📈 标注**：unity 报告的 callTree 全是绿色，看不出哪些是红线节点。根因：`unity-explore-prompt.txt` 缺 callTreeAnnotations 引导段（perfetto-explore-prompt.txt:219-232 有，unity 版没有），所以 explore LLM 没产 callTreeAnnotations 字段，render 层拿不到标注。

2. **措辞不适合人阅读**：如"GC 归因：GcAllocCount 10.8 倍增长与 foldChange 10.5 吻合"——技术数字+字段名+"吻合"风，不是人话。根因：narrative-prompt.txt 的人话化引导不够强，缺反例。

3. **章节重复**：OnCameraMove 在 topConclusions / §0 三大演化结论 / §3 红线清单 / §3 下钻 ① 四个地方都详细展开，其它条目同样重复。根因：unity-multi-state.txt 模板的章节职责分工约束不够强（§3 把 perfetto 的 §3 概览+§5 下钻合一了，且没约束 §0 只给结论+引用不写 callTree 子树描述）。

**本工单是 prompt + 模板层修复**，不改 render 代码（除了可能微调 callTreeAnnotations 的读取逻辑）。修完要重跑 explore（需求 A 要重产 callTreeAnnotations）+ narrative + render。

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §六严禁硬编码 + §七三段管线 + §八占位符填充
- `web/server/prism/prompts/perfetto-explore-prompt.txt:219-232` — callTreeAnnotations 引导段（unity 版要对齐）
- `web/server/prism/prompts/report-templates/perfetto-multi-state.txt` — perfetto 模板章节职责分工（unity 版要对齐）
- `web/server/prism/prompts/unity-explore-prompt.txt` — 需求 A 改动目标
- `web/server/prism/prompts/narrative-prompt.txt` — 需求 B 改动目标
- `web/server/prism/prompts/report-templates/unity-multi-state.txt` — 需求 C 改动目标

## 任务

### 需求 A：unity-explore-prompt.txt 补 callTreeAnnotations 引导段

**文件**：`web/server/prism/prompts/unity-explore-prompt.txt`

**参考**：`perfetto-explore-prompt.txt:219-232`（perfetto 版的 callTreeAnnotations 引导）

**要做**：在 unity-explore-prompt.txt 加一段引导，让 explore LLM 在 finding 的 evidence.resultDigest 里产 `callTreeAnnotations` 数组，给每个关键节点标：
- `nodeName`：节点名（对应 callTree 里的 name）
- `redlineFlag`：触红线描述（如"foldChange 10.5 + 占 p50 30.7%"，相对倍数/相对占比，不硬编码绝对阈值）；无则 null
- `foldChange`：涨幅（如"×10.5"）；无则 null
- `severityTag`：严重程度（critical/high/medium/low）

**关键**：
- unity 多态的红线判定用 foldChange ≥ 2 + 绝对增量 ≥ p50 的 1% + 占 p50 ≥ 5%（DR-43 扩展），不是 perfetto 的"单次 avg vs vsync"
- callTreeAnnotations 要覆盖 callTree 相关 finding 的所有关键节点（不只是 rootMarker，还要包括子树里的大头/红线节点）
- 不硬编码业务名，引导里用占位符 `<节点名>` / `<大头子节点A1>`

**引导段示例**（参考 perfetto 版改写，开发 agent 根据unity特性调整）：
```
★【callTree 相关 finding 必须给每关键节点标 redlineFlag/foldChange/severityTag】
当你用 queryMarkers / aggregateSubtree / getFrameCallTree / drillDownMarker 查调用树并形成 finding 时，在 finding 的 evidence.resultDigest 里产一个 `callTreeAnnotations` 数组，给每个关键节点标：

"callTreeAnnotations": [
  {
    "nodeName": "<节点名>",
    "redlineFlag": "foldChange 10.5 + 占 p50 30.7%",   // 触红线描述（相对倍数/相对占比，不硬编码绝对阈值）；无则 null
    "foldChange": "×10.5",                              // 涨幅；无则 null
    "severityTag": "critical"                           // critical/high/medium/low
  },
  ...
]

关键节点 = rootMarker + 子树里的大头子节点 + 触红线的节点。
不要给每个节点都标——只标有故事的节点（大头/红线/涨幅显著）。
```

### 需求 B：narrative-prompt.txt 加强人话化引导 + 反例

**文件**：`web/server/prism/prompts/narrative-prompt.txt`

**问题**：当前 narrative-prompt 的人话化引导不够强，LLM 产出"GC 归因：GcAllocCount 10.8 倍增长与 foldChange 10.5 吻合"这种技术数字+字段名+"吻合"风。

**要做**：在 narrative-prompt.txt 加一段"人话化硬规则"，含正反例：

```
★【人话化硬规则·不许技术数字+字段名+"吻合"风】
报告正文（narrative 字段）必须是人话，不是技术报告。规则：

1. 不许用字段名：foldChange / GcAllocCount / perFrameMs / pctOfRoot / spikeRatio 等字段名不许出现在正文，用人话替代
   - ❌ "foldChange 10.5" → ✅ "涨 10.5 倍"
   - ❌ "GcAllocCount 10.8 倍增长" → ✅ "GC 分配暴增 10.8 倍（4777→51365）"
   - ❌ "perFrameMs 12.88ms" → ✅ "每帧 12.88ms"
   - ❌ "spikeRatio ∞" → ✅ "尖峰/平峰比无穷大（平峰接近 0）"

2. 不许用"吻合/一致/佐证"风：要说原因，不说"吻合"
   - ❌ "GcAllocCount 10.8 倍增长与 foldChange 10.5 吻合" → ✅ "GC 分配暴增 10.8 倍，和 Core.Update 涨 10.5 倍同步发生——说明退化主因是 Lua 侧临时表/字符串分配爆增，不是计算变重"
   - ❌ "correlateFrameSets 验证 100% 落在慢帧集合" → ✅ "19 次尖峰全部落在慢帧里（>33ms 的帧），100% 命中——是确定性卡顿源"

3. 不许用"详见 §X"代替叙事：详见 §X 是引用，不是替代
   - ❌ "详见 §3 下钻" → ✅ "详见 §3 下钻 ①"（要给具体编号）+ 本处仍要给一句话结论

4. 技术数字沉底：字段名/绝对阈值/调用工具名留在 findings.json，正文只有人话+关键数字
```

### 需求 C：unity-multi-state.txt 模板约束章节职责分工（防重复）

**文件**：`web/server/prism/prompts/report-templates/unity-multi-state.txt`

**问题**：当前模板 §3 把 perfetto 的 §3 概览+§5 下钻合一了，且没约束 §0 只给结论+引用不写 callTree 子树描述，导致同一 finding 在 topConclusions/§0/§3 红线清单/§3 下钻 四个地方都详细展开。

**要做**：在 unity-multi-state.txt 加"章节职责分工"硬约束，明确每个 finding 的"主战场"——只在 一个地方详细展开，其它地方只引用。

**约束内容**（加在模板的"章节骨架"节之前）：
```
★【章节职责分工·防重复·每个 finding 只在一个地方详细展开】
同一个 finding 不许在多个章节重复详细展开。各章节职责：

- topConclusions：结构化表格（problem/kind/contribution/dimensions），不写 callTree 子树描述
- §0 三大演化结论：人话叙事 + ASCII 图 + 关键数字 + "详见 §3 下钻 ①"，**不写 callTree 子树描述**（callTree 子树是 §3 下钻的职责）
- §3 红线清单：只给表格（模块/基线 ms/当前 ms/foldChange/占 p50%/红线类型/子函数热点），narrative 一句话定位，**不详细展开**
- §3 下钻：才是详细展开的地方（callTree 子树 + 红线判定 + GC 归因 + 优化建议）

例：OnCameraMove finding
- topConclusions #1：表格行，problem="相机移动必卡：OnCameraMove 19 次尖峰 100% 命中慢帧"
- §0 ①：人话"相机移动必卡——19 次尖峰每次 43ms，100% 落在慢帧里" + ASCII 图 + "详见 §3 下钻 ①"
- §3 红线清单：表格行，OnCameraMove 0→43.14ms ×∞ 95.4% 新出现+占 p50≥5%
- §3 下钻 ①：详细展开（callTree 子树 frame 144 hotPath + 红线判定 + GC 归因 + 源码归因 + 优化建议）

**不许 §0 和 §3 下钻都写完整 callTree 子树描述**——那是重复。
**不许 §3 红线清单和 §3 下钻都详细展开**——红线清单只给表格，下钻才详细。
```

**同时**：参考 perfetto-multi-state.txt 的 §3（主线程入口概览）和 §5（下钻）分章结构，考虑 unity-multi-state.txt 是否要把 §3 拆成 §3 概览 + §3.5 下钻（或 §3 + §4 下钻，§4 ROI 顺延为 §5）。如果拆章改动太大，保留 §3 合一但加上述职责分工约束。

## 硬约束

1. **三段管线硬契约**（DR-44 + dev-conventions.md §七）：本工单改 prompt + 模板，不改 explore-service / narrative-service / render-html.ts（除非 callTreeAnnotations 读取逻辑需要微调）
2. **严禁硬编码**（DR-41 + dev-conventions.md §六）：prompt 引导里用占位符 `<节点名>` / `<大头子节点A1>`，不写死业务名
3. **不覆盖原报告产出物**（feedback memory）：重跑管线时新 report.html/narrative.json 不许覆盖 `2026-07-20_pruned/`，换路径或备份
4. **需求 A 要重跑 explore LLM**（callTreeAnnotations 是 explore 阶段产的，10-20min）；需求 B/C 只改 prompt+模板，重跑 narrative+render 即可（5min）
5. **perfetto 路径不退化**：改 narrative-prompt.txt 是数据源无关的（所有数据源共用），不能让 perfetto 报告退化。改完要跑 perfetto harness 确认

## 验收 harness（必填，开发 agent 完成前自己跑通，不丢给主 agent）

**通用 harness（跑新产出的 unity 多态报告）**：
```
cd web && npx tsx server/prism/harness.ts --source unity --dir <新产出目录>
```
期望：82 PASS / 0 FAIL / 0 WARN（WT-045 的断言不能退化）

**工单特定断言**：
```bash
# 1. unity-explore-prompt.txt 有 callTreeAnnotations 引导段
grep -c "callTreeAnnotations" web/server/prism/prompts/unity-explore-prompt.txt
# 期望 ≥3（引导段提到 callTreeAnnotations 多次）

# 2. narrative-prompt.txt 有人话化硬规则 + 反例
grep -c "吻合\|人话化硬规则\|不许用字段名" web/server/prism/prompts/narrative-prompt.txt
# 期望 ≥3

# 3. unity-multi-state.txt 有章节职责分工约束
grep -c "章节职责分工\|防重复\|主战场\|不写 callTree 子树描述" web/server/prism/prompts/report-templates/unity-multi-state.txt
# 期望 ≥3

# 4. 新 findings.json 有 callTreeAnnotations 字段（需求 A 生效）
grep -c "callTreeAnnotations" <新产出目录>/findings.json
# 期望 ≥1（explore LLM 产了 callTreeAnnotations）

# 5. 新 report.html 有 🔴/📈 标注（callTreeAnnotations 注入到 callTree 节点）
grep -c "tree-redline\|tree-fold" <新产出目录>/report.html
# 期望 ≥1（红线节点有标注，不再是全绿色）

# 6. 新 report.html 无"吻合/一致/佐证"风（人话化生效）
grep -c "吻合\|与.*一致\|佐证" <新产出目录>/report.html
# 期望 0 或极少（人话化引导生效，不再用"吻合"风）

# 7. 新 narrative.json 的 §0 item 不含 callTree 子树描述（章节职责分工生效）
# 检查 §0 的 item.narrative 不含"hotPath\|callTree 子树\|→.*→.*→"链式描述
# 此条由主 agent 人眼检查
```

**端到端冒烟（完整三段，因为需求 A 要重跑 explore）**：
```
cd web
npx tsx server/prism/run-unity-pipeline.ts --multi-state-dir data/results/udiff_1782983710451_be175ef1 --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046
```
跑通后把 report.html 路径告诉主 agent，主 agent 对照标杆核结构 + 叙事可读性。

**perfetto 不退化检查**：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5
# 期望：原 79 PASS / 2 FAIL / 1 WARN 不退化（2 FAIL 是 WT-037 遗留，与 WT-046 无关）
```

## 完成标准

1. 通用 harness 82 PASS / 0 FAIL / 0 WARN（unity 多态报告）
2. 工单特定断言全 PASS
3. 端到端冒烟成功，新 report.html 产出（路径 `2026-07-20_wt046/report.html`）
4. **不覆盖原 `2026-07-20_pruned/report.html`**（feedback memory 硬约束）
5. **新 findings.json 有 callTreeAnnotations 字段**（需求 A 生效）
6. **新 report.html 的 callTree 有 🔴/📈 标注**（不再是全绿色）
7. **新 report.html 无"吻合"风措辞**（需求 B 生效）
8. **新 narrative.json 的 §0 不写 callTree 子树描述**（需求 C 生效，章节职责分工）
9. **perfetto 报告不退化**（narrative-prompt.txt 改动不影响 perfetto）
10. 把改动 diff + harness 末尾输出 + 新 report.html 路径告诉主 agent

harness 跑不通就继续改，改到 FAIL=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

开发 agent 说完成后，主 agent 独立做（不只信开发 agent 报告的 PASS）：

1. 独立跑一遍通用 harness + 工单特定断言
2. 打开 report.html 看可读性（harness 验不了"叙事可读性"，要人看）：
   - callTree 节点是否有 🔴/📈 标注（不再是全绿色）
   - 措辞是否人话（无"吻合/一致/佐证"风）
   - §0 是否只给结论+引用（不写 callTree 子树描述）
   - 章节重复是否减少（同一 finding 不在 4 个地方详细展开）
3. 对照 WT-045 pruned 报告看可读性提升
4. 确认 perfetto 报告不退化
5. 任一不通过 = 打回，不在错误基座上继续堆功能

## 注意事项

- **本工单是 prompt + 模板层修复**：不改 render 代码（除非 callTreeAnnotations 读取逻辑需要微调）。render-html.ts 的 callTreeAnnotations 读取逻辑（loadCallTreeAnnotations 函数）已经存在（WT-033 加的），不用改。
- **需求 A 要重跑 explore LLM**：callTreeAnnotations 是 explore 阶段产的，改 unity-explore-prompt.txt 后要重跑 explore（10-20min）。建议用 run-unity-pipeline.ts 完整三段跑。
- **需求 B/C 改 narrative-prompt + 模板**：narrative-prompt.txt 是数据源无关的（所有数据源共用），改完要确认 perfetto 不退化。
- **章节职责分工是防重复的关键**：光靠 prompt 引导 LLM 容易跑偏，模板硬约束更可靠（perfetto 模板就是这么做的，unity 模板要对齐）。
- **不覆盖原报告产出物**：重跑管线时新 report.html/narrative.json 不许覆盖 `2026-07-20_pruned/`，换路径 `2026-07-20_wt046/`。
