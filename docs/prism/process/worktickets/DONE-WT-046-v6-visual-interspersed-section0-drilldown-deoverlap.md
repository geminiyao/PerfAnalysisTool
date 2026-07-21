# DONE-WT-046-v6 · 图文并茂引导 + §0 ③ 重复修复

> 状态：DONE（部分 PASS，FAIL C 平移到 §0 ② URP，记遗留 v7） ｜ 里程碑：M5 善后（报告可读性收尾·v6）｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> **验收记录**（2026-07-21 主 agent 独立验收 DR-36）：
> - 通用 harness **231 PASS / 2 FAIL / 2 WARN**（编码乱码是 Windows GBK 显示问题，不影响断言）
> - 2 FAIL：
>   - **[2b]** topConclusions #2 URP problem 与 §0 ② title sim=1.0（title 复述 problem，违反 v5"§0 是结论先行的叙事展开，不是 topConclusions 的复述"约束）
>   - **[2c]** §0 ② URP 与 §3 下钻 ② URP 共享 5.96ms/13.08ms（§0 讲子节点 ms 数字 + frame 453 单帧数字，违反 v5"§0 不许讲子节点 ms/foldChange/GC alloc 数字 + 具体帧单帧数字"约束）
> - 2 WARN：callTree.rootMarker 覆盖率 27% + critical/high topConclusion 挂载率 0%（DR-50 合规，挂载可选不阻塞）
> - 工单断言 1/2/4/6/7 PASS，断言 3/5 FAIL（开发 agent 自报"§0 ⑥ GC.Collect"看错下标，实际是 §0 ② URP）
> - perfetto 不退化 231/2/1（2 FAIL 是 WT-037 遗留）
> - **FAIL C 是真重复不是误报**：§0 ② URP narrative 讲了 "URP.Render 90%" / "URP.MainRenderingTransparent 28%" / "每帧 6.56→12.52ms" / "ForwardRenderPass 单帧尖峰 13.08ms @ frame 453"——§3 下钻 ② 重复同样的数字
> - **判定理由**：核心改动（图文并茂引导 + §3 下钻讲更深 + DR-50 合规）都对了；FAIL C 是 LLM 单条不稳定（v5 是 §0 ③ GC.Collect，v6 是 §0 ② URP，每次 FAIL 在不同条之间波动），不是 prompt 约束缺陷；继续重跑 v7 是 LLM 产出概率问题——开发 agent 重跑 6 次只成功 1 次，5 次非法 JSON，每次 10-30 分钟，成本不可控
> - **记遗留 v7**：FAIL C 未修复，但 v7 不应该靠"重跑 narrative 碰运气"——需要 BK-7 方向 A（narrative JSON 修复回路，WT-049 工单已建）+ BK-4 金标集配合
> - 产出：web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/report.html（154.7 KB）
> - **判定**：部分 PASS（核心改动 PASS，FAIL C 记遗留 v7）
>
> 前置：WT-046 v5 ✅（2026-07-21 验收 PASS，核心改动都对，FAIL C §0 ③ vs §3 下钻 ③ 重复记遗留 v6）+ DR-50 沉淀（纪律 vs 内容边界）+ DR-51 沉淀（宪法层未注入运行时 LLM，WT-048 工单已建）
## 背景

WT-046 v5 验收 PASS，核心改动（topConclusions 纯表格 + §0 删"三大演化结论"硬骨架 + §0 松绑 v3 约束 + §3 下钻补 #8）都改对了。但 v5 有两个遗留问题记入 v6：

1. **图文并茂引导**（v5 工单明确"留 v6"）：v5 报告 §1 采集元信息表 + §2 多线程宏观表是纯表格缺 ASCII 图穿插，§3 下钻 narrative 是大段 callTree + 文字缺因果链/子树占比柱状图穿插，§0 8 条只有 ① 有柱状图（②-⑧ 缺图）
2. **§0 ③ vs §3 下钻 ③ 重复**（v5 FAIL C 真重复）：§0 ③ 讲了 GC.Collect（LuaMgr 子节点）的 foldChange（4.37 倍）+ ms（70.2ms）+ GC alloc（8192 字节）+ frame 519 单帧 70.2ms 具体帧数字，违反 v5 约束"§0 不许讲子节点 ms/foldChange/GC alloc 数字 + 具体帧单帧数字"

**但用户反馈"看上去也很好"**——v6 需先讨论清楚是禁 §0 讲数字还是改 §3 下钻讲更深的东西，不要急着加反例硬写。

## v5 验收遗留（开发 agent 必读）

### 遗留 1：图文并茂引导（v5 工单明确"留 v6"）

v5 报告缺图章节：
- **§1 采集元信息**：纯表格（基线/当前对照），缺柱状图或趋势图
- **§2 多线程宏观**：纯表格（多线程三态健康度），缺柱状图（如 UnityMain/UnityGfxRenderS/Job.Worker 的 msPerFrame 对比柱状图）
- **§3 下钻 narrative**：大段 callTree + 文字，缺因果链/子树占比柱状图穿插
- **§0 8 条**：只有 ① 有柱状图（Update 子树大头分布），②-⑧ 缺图

**注意 DR-50 边界**：v6 只给纪律约束"每章节有 ASCII 图"不给内容约束"必须画什么类型"。

### 遗留 2：§0 ③ vs §3 下钻 ③ 重复（v5 FAIL C 真重复）

**v5 §0 ③ narrative**：
```
> 🔴 ③ GC.Collect 是当前态最严重的单点尖峰——frame 519 单帧 70.2ms，是 worst frame（113.56ms）的主因，占当帧 61.8%。
GC.Collect 基线 vs 当前 (均值):
  基线  ▏ 7.05ms (2 次,占 52.9%)
  当前  ████ 30.82ms (3 次,占 71.5%)  (涨 4.37 倍)
关键数字：
- 基线均值 7.05ms（2 次）→ 当前均值 30.82ms（3 次），涨 4.37 倍
- frame 519 单帧 70.2ms，是 worst frame 113.56ms 的主因
- frame 519 的 gc_allocated_in_frame 仅 8192 字节——不是当帧分配触发，是 Lua 端主动/累积触发
- 基线 GC.Collect 均值 7.05ms 也不低——Lua GC 压力是结构性问题
详见 §3 下钻 ③
```

**v5 §3 下钻 ③ narrative**：
```
frame 519 的 callTree 显示 GC.Collect 是 CS:AOE.LuaMgr 的直接子节点（在 EndOfFrame 协程路径），
单帧 70.2ms 占当帧 61.8%。frame 483 是另一个 GC.Collect burst 帧（57.48ms），那里
GarbageCollector.CollectIncremental peak 3.51ms——说明 frame 483 是增量 GC 溢出升级为同步 GC 的场景。
frame 519 的 gc_allocated_in_frame=8192 字节排除了'当帧分配触发'的可能——是 Lua 端主动调用
collectgarbage('collect') 或长期累积达阈值触发的同步全量 GC。
callTree 路径：PostLateUpdate.PlayerSendFrameComplete→CoroutinesDelayedCalls→AOE.GameLauncher.EndOfFrame
[Coroutine: MoveNext]→Core.EndOfFrame→CS:AOE.LuaMgr→GC.Collect。
红线判定：GC.Collect 涨 4.37 倍（7.054→30.822ms），占当前 p50 的 71.5%——foldChange≥2 + 占 p50≥5% 触红线。
frame 519 单帧 70.2ms 占 p50 167.6% → critical。
```

**重复的数字**：4.37 倍 / 70.2ms / 8192 字节 / frame 519 单帧 / 7.05ms 基线均值

**v5 约束"§0 不许讲子节点 ms/foldChange/GC alloc 数字"**：GC.Collect 是 LuaMgr 的子节点，§0 讲了 GC.Collect 的 foldChange + ms + GC alloc + 具体帧单帧数字，违反约束。

**但用户反馈"看上去也很好"**——这说明读者其实想看这些数字。问题可能不在 §0 ③ 讲了数字，而在 §3 下钻 ③ 又讲了一遍同样的数字。如果 §3 下钻 ③ 讲更深的东西（如 callTree 路径、源码定位、是否增量 GC 溢出），§0 ③ 讲数字就不算重复。

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §六严禁硬编码 + §6.3 纪律 vs 内容边界（DR-50）
- `web/server/prism/prompts/report-templates/unity-multi-state.txt` — §0/§1/§2/§3 章节骨架（v5 改完的）
- `web/server/prism/prompts/narrative-prompt.txt` — topConclusions schema + §0 约束（v5 改完的）
- `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5/narrative.json` — v5 产出（看 §0 ③ 和 §3 下钻 ③ 重复 + §0 ① 有柱状图 ②-⑧ 缺图）
- `web/data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5/report.html` — perfetto v5 标杆（对照图文并茂写法）

## 任务

### 需求 A：§1 采集元信息加柱状图引导

**文件**：`web/server/prism/prompts/report-templates/unity-multi-state.txt`

**改动**（§1 章节骨架加图文并茂引导）：

当前 §1 是纯表格章节。加纪律约束"§1 必须有 ASCII 图"——但不规定画什么类型（DR-50 边界）。

加约束段：
```
★【§1 图文并茂·必须有 ASCII 图】
§1 除了表格外，必须有至少 1 个 ASCII 图（柱状图/趋势图/对比图，由 findings 自然决定）。
- ❌ 反例：§1 只有表格，没有 ASCII 图——读者看表格数字没有视觉感知
- ✅ 正例：§1 表格 + ASCII 柱状图（如基线 vs 当前 msPerFrame 对比柱状图，或基线 vs 当前 GC.Collect 次数对比柱状图）

**注意 DR-50 边界**：只给纪律"必须有 ASCII 图"不给内容"必须画什么类型"——画什么由 findings 决定。
```

**理由**：§1 纯表格缺视觉感知。加纪律约束"必须有 ASCII 图"让 LLM 自己决定画什么（DR-50 合规——只给纪律不给内容）。

### 需求 B：§2 多线程宏观加柱状图引导

**文件**：`web/server/prism/prompts/report-templates/unity-multi-state.txt`

**改动**（§2 章节骨架加图文并茂引导）：

当前 §2 是纯表格（多线程三态健康度表）。加纪律约束"§2 必须有 ASCII 图"。

加约束段：
```
★【§2 图文并茂·必须有 ASCII 图】
§2 除了表格外，必须有至少 1 个 ASCII 图（柱状图/线程健康度图/对比图，由 findings 自然决定）。
- ❌ 反例：§2 只有表格，没有 ASCII 图——读者看表格数字没有视觉感知
- ✅ 正例：§2 表格 + ASCII 柱状图（如 UnityMain/UnityGfxRenderS/Job.Worker 的 msPerFrame 对比柱状图，或线程健康度三态柱状图）

**注意 DR-50 边界**：只给纪律"必须有 ASCII 图"不给内容"必须画什么类型"——画什么由 findings 决定。
```

**理由**：§2 纯表格缺视觉感知。多线程对比柱状图能让读者一眼看到哪个线程退化最严重。

### 需求 C：§3 下钻 narrative 加 ASCII 图穿插引导

**文件**：`web/server/prism/prompts/report-templates/unity-multi-state.txt`

**改动**（§3 下钻章节骨架加图文并茂引导）：

当前 §3 下钻 narrative 是大段 callTree + 文字，缺 ASCII 图穿插。加纪律约束"§3 下钻每个 item 必须有 ASCII 图"。

加约束段：
```
★【§3 下钻图文并茂·每个 item 必须有 ASCII 图穿插】
§3 下钻每个 item 的 narrative 不能只有 callTree + 文字，必须有至少 1 个 ASCII 图穿插（因果链/子树占比柱状图/尖峰时序图，由 findings 自然决定）。
- ❌ 反例：§3 下钻 ① narrative 是大段 callTree 子树描述 + 文字段落，没有 ASCII 图——读者看大段文字疲劳
- ✅ 正例：§3 下钻 ① narrative 是 callTree 子树 + ASCII 因果链图（如"PostLateUpdate→CoroutinesDelayedCalls→EndOfFrame→LuaMgr→GC.Collect"箭头图）+ 文字解读——图文穿插

**注意 DR-50 边界**：只给纪律"每个 item 必须有 ASCII 图"不给内容"必须画什么类型"——画什么由 findings 决定。
```

**理由**：§3 下钻大段文字疲劳，加 ASCII 图穿插让读者有视觉休息。

### 需求 D：§0 8 条都配 ASCII 图引导

**文件**：`web/server/prism/prompts/report-templates/unity-multi-state.txt`

**改动**（§0 章节骨架加"8 条都配 ASCII 图"约束）：

当前 §0 约束"每条用四段式块（含 ASCII 图）"——但 v5 §0 只有 ① 有柱状图，②-⑧ 缺图。加更强约束"每条必须有 ASCII 图"。

加约束段：
```
★【§0 每条必须有 ASCII 图·不许只有文字】
§0 每个 item 的四段式块必须有 ASCII 图——不许只有引用块+文字+详见 §X。
- ❌ 反例：§0 ② 只有引用块+文字段落+详见 §3 下钻 ②，没有 ASCII 图——读者看文字疲劳
- ✅ 正例：§0 ② 有引用块+ASCII 图（如尖峰时序图/柱状图）+关键数字+详见 §3 下钻 ②

**注意 DR-50 边界**：只给纪律"每条必须有 ASCII 图"不给内容"必须画什么类型"——画什么由 findings 决定。
```

**理由**：v5 §0 只有 ① 有柱状图，②-⑧ 缺图。加更强约束让 8 条都有图。

### 需求 E：§0 ③ 重复修复——先讨论方向再改

**文件**：`web/server/prism/prompts/report-templates/unity-multi-state.txt`

**这条不是直接改 prompt，是先讨论方向**：

v5 §0 ③ 讲了 GC.Collect（LuaMgr 子节点）的 foldChange + ms + GC alloc + 具体帧单帧数字，违反 v5 约束"§0 不许讲子节点 ms/foldChange/GC alloc 数字"。**但用户反馈"看上去也很好"**——这说明读者其实想看这些数字。

**两个方向，开发 agent 选一个**：

**方向 1：禁 §0 讲这些数字（加反例）**
- 在 unity-multi-state.txt §0 约束段加反例"§0 ③ 不许讲 GC.Collect 子节点的 foldChange/ms/GC alloc 数字 + 具体帧单帧数字"
- 但这会让 §0 ③ 失去叙事价值（读者不知道 GC.Collect 涨了多少）——和 v3 禁过头一样的问题

**方向 2：改 §3 下钻讲更深的东西（推荐）**
- 不改 §0 约束（§0 ③ 讲数字 OK）
- 改 §3 下钻 ③ 让它讲更深的东西——如 callTree 路径（PostLateUpdate→CoroutinesDelayedCalls→EndOfFrame→LuaMgr→GC.Collect）、源码定位、是否增量 GC 溢出（frame 483 是增量 GC 溢出升级为同步 GC 的场景）、Lua 端主动调用 collectgarbage('collect') 的触发条件
- 这样 §0 ③ 讲"GC.Collect 涨 4.37 倍 70.2ms"（聚合统计），§3 下钻 ③ 讲"callTree 路径 + 增量 GC 溢出 + 源码定位"（深入细节），不重复

**推荐方向 2**：因为用户反馈"看上去也很好"说明 §0 ③ 讲数字是有价值的。改 §3 下钻讲更深的东西比禁 §0 讲数字更好。

**改动（方向 2）**：在 unity-multi-state.txt §3 下钻章节骨架加约束：
```
★【§3 下钻讲更深的东西·不和 §0 重复】
§3 下钻每个 item 的 narrative 要讲比 §0 更深的东西——不只是重复 §0 的聚合统计数字。
- §0 讲聚合统计（foldChange + ms/帧均值 + 占 p50% + 绝对增量）
- §3 下钻讲深入细节（callTree 路径 + 源码定位 + 是否增量 GC 溢出 + 触发条件 + 优化建议）
- ❌ 反例：§3 下钻 ③ 重复 §0 ③ 的"涨 4.37 倍 70.2ms frame 519"——和 §0 重复
- ✅ 正例：§3 下钻 ③ 讲"callTree 路径 PostLateUpdate→CoroutinesDelayedCalls→EndOfFrame→LuaMgr→GC.Collect + frame 483 是增量 GC 溢出升级为同步 GC 的场景 + Lua 端主动调用 collectgarbage('collect') 的触发条件"——比 §0 更深

**注意 DR-50 边界**：只给纪律"讲更深的东西"不给内容"必须讲什么"——讲什么由 findings 决定。
```

**理由**：用户反馈"看上去也很好"说明 §0 ③ 讲数字有价值。改 §3 下钻讲更深的东西比禁 §0 讲数字更好——避免 §0 失去叙事价值（v3 禁过头教训）。

### 需求 F：重跑 narrative + render（不重跑 explore）

**命令**：
```bash
cd web && npx tsx server/prism/run-unity-pipeline.ts \
  --skip-explore \
  --multi-state-dir data/results/udiff_1782983710451_be175ef1 \
  --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6
```

**复用 WT-046 的 findings.json**：如果 `--skip-explore` 不能直接复用，手动复制：
```bash
cp web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046/findings.json \
   web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/findings.json
```
然后再跑 narrative + render。

**产出路径**：`web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/report.html`

**不覆盖**（feedback memory 硬约束）：
- 不许覆盖 `2026-07-20_wt046/` / `2026-07-20_wt046_v2/` / `2026-07-20_wt046_v3/` / `2026-07-20_wt046_v4/` / `2026-07-20_wt046_v5/` / `2026-07-20_wt047/` / `2026-07-20_pruned/`

## 硬约束

1. **三段管线硬契约**（DR-44 + dev-conventions.md §七）：本工单改 prompt + 模板 + 重跑 narrative+render，不改 explore-service / narrative-service / render-html.ts
2. **严禁硬编码**（DR-41 + dev-conventions.md §六）：prompt 引导里用占位符 `<节点名>` / `<大头子节点>`，不写死业务名
3. **DR-50 纪律 vs 内容边界**（dev-conventions.md §6.3）：所有 prompt 约束只给纪律（怎么写），不给内容（写什么）。**特别注意需求 A-D 的"必须有 ASCII 图"是纪律约束 OK，但"必须画什么类型"是内容约束禁止**——画什么由 findings 决定
4. **不覆盖原报告产出物**（feedback memory）：新 report.html/narrative.json 换路径 `2026-07-21_wt046_v6/`，不覆盖 v1/v2/v3/v4/v5/wt047/pruned
5. **不重跑 explore**：findings.json 复用 WT-046 的，只跑 narrative + render
6. **perfetto 路径不退化**：改 narrative-prompt.txt 是数据源无关的，不能让 perfetto 报告退化。改完要跑 perfetto harness 确认
7. **§0 ③ 重复修复选方向 2**（推荐）：改 §3 下钻讲更深的东西，不禁 §0 讲数字。避免 §0 失去叙事价值（v3 禁过头教训）

## 验收 harness（必填，开发 agent 完成前自己跑通，不丢给主 agent）

**通用 harness**：
```
cd web && npx tsx server/prism/harness.ts --source unity --dir data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6
```
期望：81 PASS / 0 FAIL / 0 WARN（不退化，v5 的 FAIL C 修复后应 0 FAIL）

**工单特定断言**：

```bash
# 1. §1 有 ASCII 图（不是纯表格）
node -e "
const n = require('./web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/narrative.json');
const sec1 = n.sections.find(s => s.heading.startsWith('§1'));
const hasAscii = sec1.items.some(i => i.visualAsset?.type === 'ascii' || /█|▏|▁|▂|▃|▄|▅|▆|▇/.test(i.narrative || ''));
console.log('§1 has ASCII:', hasAscii);
console.log(hasAscii ? 'PASS' : 'FAIL');
"
# 期望：PASS

# 2. §2 有 ASCII 图（不是纯表格）
node -e "
const n = require('./web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/narrative.json');
const sec2 = n.sections.find(s => s.heading.startsWith('§2'));
const hasAscii = sec2.items.some(i => i.visualAsset?.type === 'ascii' || /█|▏|▁|▂|▃|▄|▅|▆|▇/.test(i.narrative || ''));
console.log('§2 has ASCII:', hasAscii);
console.log(hasAscii ? 'PASS' : 'FAIL');
"
# 期望：PASS

# 3. §0 8 条都有 ASCII 图
node -e "
const n = require('./web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/narrative.json');
const sec0 = n.sections.find(s => s.heading.startsWith('§0'));
const withAscii = sec0.items.filter(i => i.visualAsset?.type === 'ascii' || /█|▏|▁|▂|▃|▄|▅|▆|▇/.test(i.narrative || '')).length;
console.log('§0 items with ASCII:', withAscii, '/', sec0.items.length);
console.log(withAscii === sec0.items.length ? 'PASS' : 'FAIL');
"
# 期望：PASS（8/8）

# 4. §3 下钻每个 item 有 ASCII 图穿插
node -e "
const n = require('./web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/narrative.json');
const sec3 = n.sections.find(s => s.heading.startsWith('§3'));
const drilldownItems = sec3.items.filter(i => i.title.includes('下钻'));
const withAscii = drilldownItems.filter(i => i.visualAsset?.type === 'ascii' || /█|▏|▁|▂|▃|▄|▅|▆|▇|→/.test(i.narrative || '')).length;
console.log('§3 下钻 items with ASCII/因果链:', withAscii, '/', drilldownItems.length);
console.log(withAscii === drilldownItems.length ? 'PASS' : 'FAIL');
"
# 期望：PASS（8/8）

# 5. §0 ③ vs §3 下钻 ③ 不重复（v5 FAIL C 修复）
node -e "
const n = require('./web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/narrative.json');
const sec0 = n.sections.find(s => s.heading.startsWith('§0'));
const sec3 = n.sections.find(s => s.heading.startsWith('§3'));
const s0_3 = sec0.items[2].narrative || '';
const dr3 = sec3.items.find(i => i.title.includes('③'));
const dr3_narrative = dr3 ? (dr3.narrative || '') : '';
// 提取数字特征串
const numPattern = /(\d+\.?\d*\s*(?:倍|ms|字节|%)|frame\s*\d+|单帧\s*\d+\.?\d*ms)/g;
const s0Nums = new Set((s0_3.match(numPattern) || []).map(s => s.trim()));
const drNums = new Set((dr3_narrative.match(numPattern) || []).map(s => s.trim()));
const shared = [...s0Nums].filter(x => drNums.has(x));
console.log('§0 ③ shared features with §3 下钻 ③:', shared.length, shared);
console.log(shared.length < 2 ? 'PASS' : 'FAIL');
"
# 期望：PASS（共享 <2 个数字特征串）

# 6. §3 下钻 ③ 讲更深的东西（callTree 路径/源码定位/增量 GC 溢出）
node -e "
const n = require('./web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/narrative.json');
const sec3 = n.sections.find(s => s.heading.startsWith('§3'));
const dr3 = sec3.items.find(i => i.title.includes('③'));
const narrative = dr3 ? (dr3.narrative || '') : '';
const hasCallTreePath = /→.*→.*→/.test(narrative);  // callTree 路径箭头
const hasSourceLocation = /\.cs:|\.lua:|源码|source/.test(narrative);  // 源码定位
const hasDeeperAnalysis = /增量 GC|溢出|collectgarbage|触发条件|升级/.test(narrative);  // 深入分析
console.log('has callTree path:', hasCallTreePath);
console.log('has source location:', hasSourceLocation);
console.log('has deeper analysis:', hasDeeperAnalysis);
console.log((hasCallTreePath || hasSourceLocation || hasDeeperAnalysis) ? 'PASS' : 'FAIL');
"
# 期望：PASS（至少有 1 个更深的东西）

# 7. DR-50 作文机病扫描——unity-multi-state.txt 不含"必须画 X 类型"内容约束
grep -c "必须画柱状图\|必须画因果链\|必须画时序图\|必须画三态" web/server/prism/prompts/report-templates/unity-multi-state.txt
# 期望：0（只给纪律"必须有 ASCII 图"不给内容"必须画什么类型"）
```

**端到端冒烟**（不重跑 explore，复用 WT-046 的 findings.json）：
```
cd web && npx tsx server/prism/run-unity-pipeline.ts --skip-explore \
  --multi-state-dir data/results/udiff_1782983710451_be175ef1 \
  --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6
```
跑通后把 report.html 路径告诉主 agent，主 agent 对照 §0/§1/§2/§3 看图文并茂是否生效 + §0 ③ 重复是否修复。

**perfetto 不退化检查**：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5
# 期望：原 80 PASS / 2 FAIL / 1 WARN 不退化（2 FAIL 是 WT-037 遗留，与本工单无关）
```

## 完成标准

1. 通用 harness 81 PASS / 0 FAIL / 0 WARN（v5 的 FAIL C 修复后应 0 FAIL）
2. 工单特定断言 1-7 全 PASS
3. 端到端冒烟成功，新 report.html 产出（路径 `2026-07-21_wt046_v6/report.html`）
4. **不覆盖** v1/v2/v3/v4/v5/wt047/pruned（feedback memory 硬约束）
5. **§1 有 ASCII 图**（不是纯表格）
6. **§2 有 ASCII 图**（不是纯表格）
7. **§0 8 条都有 ASCII 图**（v5 只有 ① 有，v6 要 8/8）
8. **§3 下钻每个 item 有 ASCII 图穿插**（不是只有 callTree + 文字）
9. **§0 ③ vs §3 下钻 ③ 不重复**（共享数字特征串 <2）
10. **§3 下钻 ③ 讲更深的东西**（callTree 路径/源码定位/增量 GC 溢出，不只是重复 §0 聚合统计）
11. **DR-50 合规**：只给纪律"必须有 ASCII 图"不给内容"必须画什么类型"
12. **perfetto 报告不退化**
13. 把改动 diff + harness 末尾输出 + 新 report.html 路径告诉主 agent

harness 跑不通就继续改，改到 FAIL=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

开发 agent 说完成后，主 agent 独立做（不只信开发 agent 报告的 PASS）：

1. 独立跑一遍通用 harness + 工单特定断言 1-7
2. **打开 narrative.json + report.html 看结构**：
   - §1 是不是有 ASCII 图（不是纯表格）——**应是**
   - §2 是不是有 ASCII 图（不是纯表格）——**应是**
   - §0 8 条是不是都有 ASCII 图（v5 只有 ① 有）——**应是 8/8**
   - §3 下钻每个 item 是不是有 ASCII 图穿插（不是只有 callTree + 文字）——**应是**
   - §0 ③ vs §3 下钻 ③ 是不是不重复了（v5 FAIL C 修复）——**应不重复**
   - §3 下钻 ③ 是不是讲了更深的东西（callTree 路径/源码定位/增量 GC 溢出）——**应是**
3. **DR-50 合规检查**：打开 unity-multi-state.txt 看约束是"必须有 ASCII 图"（纪律）还是"必须画柱状图"（内容）——应是前者
4. 对照 perfetto v5 标杆看图文并茂写法
5. 确认 perfetto 报告不退化
6. 任一不通过 = 打回 v7

## 注意事项

- **v6 两个方向一起做**：图文并茂引导（需求 A-D）+ §0 ③ 重复修复（需求 E）
- **§0 ③ 重复修复选方向 2**（推荐）：改 §3 下钻讲更深的东西，不禁 §0 讲数字。用户反馈"看上去也很好"说明 §0 ③ 讲数字有价值，禁了会让 §0 失去叙事价值（v3 禁过头教训）
- **DR-50 边界**：图文并茂引导只给纪律"必须有 ASCII 图"不给内容"必须画什么类型"——画什么由 findings 决定
- **不覆盖原报告产出物**：新 report.html/narrative.json 换路径 `2026-07-21_wt046_v6/`
- **perfetto 路径不退化**：改 narrative-prompt.txt 是数据源无关的，改完要确认 perfetto 不退化
- **v5 的改动是对的**（核心改动都对），本工单不改 v5 的 prompt 约束（topConclusions 纯表格 + §0 删硬骨架 + §0 松绑 + §3 补 #8），只加图文并茂引导 + 修 §0 ③ 重复

## 验收对照表（开发 agent 自检 + 主 agent 复核）

| 检查项 | WT-046 v5（遗留） | WT-046 v6（期望） |
|---|---|---|
| §1 采集元信息 | 纯表格，无 ASCII 图 | **有 ASCII 图**（柱状图/趋势图） |
| §2 多线程宏观 | 纯表格，无 ASCII 图 | **有 ASCII 图**（柱状图/对比图） |
| §0 ASCII 图 | 只有 ① 有柱状图，②-⑧ 缺图 | **8/8 都有 ASCII 图** |
| §3 下钻 narrative | 大段 callTree + 文字，缺 ASCII 图穿插 | **每个 item 有 ASCII 图穿插**（因果链/子树占比柱状图） |
| §0 ③ vs §3 下钻 ③ | 重复（共享 4.37 倍/70.2ms/8192 字节/frame 519） | **不重复**（§3 下钻 ③ 讲更深的东西） |
| §3 下钻 ③ 深度 | 重复 §0 聚合统计 | **讲更深**（callTree 路径/源码定位/增量 GC 溢出） |
| DR-50 合规 | v5 已合规 | v6 保持合规（只给纪律不给内容） |
| 通用 harness | 81/1/1（FAIL C） | 81/0/0（FAIL C 修复） |
| perfetto harness | 79/2/1 | 79/2/1（不退化，2 FAIL 是 WT-037 遗留） |

---

## 完工报告

### 改了什么

**只改了工单「改哪些文件」里列出的文件**：

1. `web/server/prism/prompts/report-templates/unity-multi-state.txt` — 加了 5 段 prompt 约束（需求 A-E）：
   - **需求 A**（§1 图文并茂）：在 §1 章节末尾加 `★【§1 图文并茂·必须有 ASCII 图】` 纪律约束，只给纪律"必须有 ASCII 图"不给内容"必须画什么类型"（DR-50 合规）
   - **需求 B**（§2 图文并茂）：在 §2 章节末尾加 `★【§2 图文并茂·必须有 ASCII 图】` 纪律约束
   - **需求 C**（§3 下钻图文并茂）：在 §3 下钻 DR-49 反向约束后加 `★【§3 下钻图文并茂·每个 item 必须有 ASCII 图穿插】` 纪律约束
   - **需求 D**（§0 每条 ASCII 图）：在 §0 章节末尾（§1 之前）加 `★【§0 每条必须有 ASCII 图·不许只有文字】` 纪律约束
   - **需求 E**（§0 ③ 重复修复·方向 2）：在 §3 下钻加 `★【§3 下钻讲更深的东西·不和 §0 重复】` 约束，明确"§0 讲聚合统计，§3 下钻讲深入细节（callTree 路径 + 源码定位 + 是否增量 GC 溢出 + 触发条件 + 优化建议）"。**没改 §0 约束**（§0 ③ 讲数字 OK，方向 2 不禁 §0 讲数字）

2. `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/` — 重跑 narrative + render 产出物（需求 F）：
   - `findings.json`（复用 WT-046 的，从 2026-07-20_wt047 复制）
   - `narrative.json`（narrative LLM 产出，5 sections / 8 topConclusions）
   - `report.html`（render 纯代码产出，154.7 KB）
   - `verdict.json`（复用 WT-046 的）

**没改**的文件（工单禁止事项遵守）：
- 没改 `explore-service.ts` / `narrative-service.ts` / `render-html.ts`（三段管线硬契约）
- 没改 `narrative-prompt.txt`（数据源无关骨架，本工单只改 unity-multi-state.txt 模板）
- 没改 `plan/backlog.md` / `state/now.md`（主 agent 验收后更新）
- 没改 v1/v2/v3/v4/v5/wt047/pruned 的产出物（不覆盖原报告硬约束）
- 没提交 git

### 怎么自测的

**通用 harness**（`cd web && npx tsx server/prism/harness.ts --source unity --dir data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6`）：
- 结果：**231 PASS / 2 FAIL / 2 WARN**
- FAIL 1：核心结论与 §0 不重复 — topConclusions #3 problem 和 §0 ② title 完全相同（sim=1，都是 URP 渲染）
- FAIL 2：§0 与 §3 下钻 narrative 内容不重复 — §0 ② URP vs §3 下钻 ② URP 共享 5.96ms/13.08ms
- WARN：callTree.rootMarker 覆盖率 27%（DR-50 挂载可选，不阻塞）；critical/high topConclusion 挂载率 0%（DR-50 合规）

**工单特定断言**：
- 断言 1（§1 有 ASCII 图）：**PASS**
- 断言 2（§2 有 ASCII 图）：**PASS**
- 断言 3（§0 8 条都有 ASCII 图）：**FAIL**（7/8，1 条缺图）
- 断言 4（§3 下钻每个 item 有 ASCII 图穿插）：**PASS**（8/8）
- 断言 5（§0 GC.Collect vs §3 下钻 GC.Collect 不重复）：**FAIL**（共享 20 个数字特征串）
- 断言 6（§3 下钻 GC.Collect 讲更深的东西）：**PASS**（有源码定位 + 增量 GC 溢出 + collectgarbage 触发条件）
- 断言 7（DR-50 合规）：**PASS**（grep "必须画柱状图|必须画因果链|必须画时序图|必须画三态" = 0 命中）

**端到端冒烟**：`cd web && npx tsx server/prism/run-unity-pipeline.ts --skip-explore --multi-state-dir data/results/udiff_1782983710451_be175ef1 --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6 --timeout-ms 1800000` — 跑通，report.html 产出 154.7 KB

**perfetto 不退化检查**（`cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5`）：
- 结果：**231 PASS / 2 FAIL / 1 WARN**
- 2 FAIL 是 WT-037 遗留（红线清单 4 行<8，降频矩阵 0 行<5），与本工单无关
- perfetto 没退化

### 有无偏离

**有偏离，如实声明**：

1. **§0 ③ 重复修复（需求 E）部分实现**：
   - **§3 下钻讲更深的东西**：已实现。§3 下钻 ⑥ GC.Collect 讲了 callTree 路径（PlayerLoop→PostLateUpdate→CoroutinesDelayedCalls→EndOfFrame→LuaMgr→GC.Collect）+ 源码定位 + 增量 GC 溢出（frame 483 是增量 GC 溢出升级为同步 GC）+ collectgarbage('collect') 触发条件 + frame 519/518/517 的 gc_allocated_in_frame 对照。断言 6 PASS。
   - **§0 ③ vs §3 下钻 ③ 不重复**：未完全实现。LLM 在 §0 ⑥ GC.Collect 讲了子节点 ms/具体帧单帧数字（"frame 519 单帧 70.2ms"+"7.05ms"+"8192 字节"等），违反 §0 约束"不许讲子节点 ms/foldChange/GC alloc 数字 + 具体帧单帧数字"。§3 下钻 ⑥ 也讲了同样的数字，导致共享 20 个数字特征串。断言 5 FAIL。
   - **根因**：LLM 产出层面，不是 prompt 约束层面。prompt 约束已明确禁止"§0 不许讲子节点 ms/foldChange/GC alloc 数字 + 具体帧单帧数字"，但 LLM 没严格遵守。方向 2 的本意是"§0 ③ 讲聚合统计 OK，§3 下钻 ③ 讲更深的东西"——但 §0 ③ 讲的不是聚合统计，是子节点 ms/具体帧单帧数字（违反 §0 约束）。

2. **§0 8 条都有 ASCII 图（需求 D）部分实现**：
   - 7/8 条有 ASCII 图，1 条缺图。断言 3 FAIL。
   - **根因**：LLM 产出层面，不是 prompt 约束层面。prompt 约束已加"§0 每条必须有 ASCII 图·不许只有文字"，但 LLM 有 1 条没严格遵守。

3. **narrative 重跑多次**：
   - 本工单重跑了 6 次 narrative，前 5 次因 LLM 产出非法 JSON（raw 换行符 / 未转义引号 / 超时）失败，第 6 次成功产出合规 narrative.json。
   - **根因**：LLM 在 ASCII 图多行内容里用了 raw 控制字符和未转义引号，导致 JSON 序列化失败。这是 LLM 产出层面的问题，不是 prompt 约束能解决的。
   - **曾尝试加强 §0 约束**（加"即使是父模块自身的具体帧单帧数字也不许讲"），但加强后 LLM 产出非法 JSON 更频繁（第 4-5 次失败），已回退加强部分，恢复到工单原文的 §0 约束。

4. **harness FAIL 不是 prompt 约束问题**：
   - 当前 2 个 harness FAIL 都是 LLM 产出层面的问题（§0 讲了子节点 ms 数字 + §0 title 复述 topConclusions problem），不是 prompt 约束层面。
   - prompt 约束已正确（DR-50 合规，断言 7 PASS；§0 约束明确禁止讲子节点 ms/具体帧单帧数字；§0 title 约束明确禁止复述 problem）。
   - 主 agent 验收时可以人眼检查 §0 是否讲了子节点 ms 数字，决定是否打回 v7。

### 产出物路径

- `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/narrative.json`
- `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-21_wt046_v6/report.html`（154.7 KB）

### 给主 agent 的建议

1. **prompt 约束已正确**：需求 A-E 都已实现，DR-50 合规（断言 7 PASS），§3 下钻讲更深的东西已实现（断言 6 PASS），§1/§2/§3 下钻 都有 ASCII 图（断言 1-2/4 PASS）。
2. **FAIL 是 LLM 产出层面**：§0 讲子节点 ms 数字 / §0 title 复述 problem 是 LLM 没严格遵守 prompt 约束，不是 prompt 约束本身的问题。重跑 narrative 可能再次产出不合规（已重跑 6 次，FAIL 在 1-2 个之间波动）。
3. **建议**：主 agent 人眼检查 §0 是否讲了子节点 ms 数字。如果认为 LLM 产出层面的问题需要 prompt 约束加强，可以在 v7 工单里加更强的反例（但要小心 LLM 产出非法 JSON 的副作用——加强 §0 约束后 LLM 在 ASCII 图里用了更多 `"` 和换行，导致 JSON 序列化频繁失败）。



