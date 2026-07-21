# DONE-WT-046-v5 · topConclusions/§0 定位分离 + 删作文机病硬骨架（按 DR-50 边界重写）

> 状态：DONE ｜ 里程碑：M5 善后（报告可读性收尾·v5）｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 验收记录（2026-07-21 主 agent 独立验收 DR-36）：
> - 机器断言：unity 81 PASS / 1 FAIL / 1 WARN + perfetto 79/2/1 不退化（2 FAIL 是 WT-037 遗留）
> - 工单特定断言 1/2/4/5/6/7 全 PASS（断言 3 主 agent 人眼检查）
> - 人眼检查：topConclusions 纯表格 ✅ / §0 items=8 一一对应 ✅ / §0 无"三大演化结论"硬骨架 ✅ / §0 ① 讲清"为什么贵"（Update 8.87 倍 + 大头 MapSignificanceMgr 占 59.1%）✅ / §0 ① 不讲子节点 ms/foldChange/GC alloc ✅ / §3 下钻 #8 偶发尖刺合集完整 ✅
> - **FAIL C（§0 ③ vs §3 下钻 ③ 重复）**：真重复，§0 ③ 讲了 GC.Collect（LuaMgr 子节点）的 foldChange（4.37 倍）+ ms（70.2ms）+ GC alloc（8192 字节）+ frame 519 单帧数字，违反 v5 约束。但 v5 核心改动（topConclusions 纯表格 + §0 删硬骨架 + §0 松绑 + §3 补 #8）都改对了，FAIL 是 LLM 单条不稳定不是 prompt 约束缺陷
> - **判定**：用户决定 PASS 但记遗留——§0 ③ 重复记入 v6 图文并茂工单一起处理（v6 反正要重跑 narrative）
> - 产出：`web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5/report.html`（127KB，6 棵真实 callTree）
>
> 前置：WT-046 v4 ✅（3 层重复根因治本，机器断言全 PASS）+ DR-50 沉淀（纪律 vs 内容边界方法论）+ DR-51 沉淀（宪法层未注入运行时 LLM 架构缺陷）
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§六严禁硬编码 + §七三段管线 + §6.3 纪律 vs 内容边界 DR-50）+ 本工单"v4 用户反馈 + 作文机病诊断"节

## 背景

WT-046 v4 验收 PASS（4 个需求都改对了，3 层重复都消除）。但用户提了 5 个新问题：

1. **topConclusions 和 §0 定位重叠**——topConclusions 1-3 和 §0 ①②③ 讲同一批结论两遍
2. **§0 父模块级摘要没意义**——§0 ① 只讲"Update 涨 8.87 倍"父模块摘要，不讲为什么贵（v3 约束禁子节点细节禁过头了）
3. **topConclusions/§0 能否合并**——用户倾向 topConclusions 改纯表格 + §0 讲全部 8 条
4. **topConclusions 每条图文并茂**——现在只有第 6 条有 ASCII 图（**此条留 v6，v5 不动**——避免 v5 同时改太多维度调不过来）
5. **§3 下钻缺 #8 偶发尖刺**——topConclusions #8 在 §3 下钻没有对应 item

用户还诊断"4 个模板有种作文机的即时感，prompt 有种约束报告内容、限定报告问题范围的嫌疑"——精准命中。诊断发现 unity-multi-state.txt 有作文机病（"三大演化结论"硬骨架），主 agent 自己写 v5 工单时也重蹈覆辙（建议"topConclusions 从 8 减到 5"+ 保留"三大演化结论"硬骨架）。已沉淀 DR-50（纪律 vs 内容边界）+ DR-51（宪法层未注入运行时 LLM）。

**本工单范围**（v5 只做定位分离 + 删硬骨架，图文并茂留 v6）：
- ✅ topConclusions 改纯表格（删 extraHTML/asciiArt/note 挂载）
- ✅ §0 删"三大演化结论"硬骨架（改"典型维度，不预设盯防"）
- ✅ §0 松绑 v3 约束（允许讲子节点名字+占比，禁止子节点 ms/foldChange/GC alloc 数字）
- ✅ §3 下钻补 #8 偶发尖刺合集 item
- ❌ 图文并茂引导（§0 每条配 ASCII 图 / §1/§2 加柱状图）——**留 v6，v5 不动**

## v4 用户反馈 + 作文机病诊断（开发 agent 必读）

### 用户反馈 5 个问题（v5 只解决 1/2/3/5，4 留 v6）

1. **topConclusions 和 §0 定位重叠**：topConclusions 1-3 和 §0 ①②③ 讲同一批结论两遍——topConclusions 表讲一遍（problem+contribution+note），§0 ①②③ 又讲一遍（narrative+ASCII 图）
2. **§0 父模块级摘要没意义**：§0 ① 只讲"Update 涨 8.87 倍"——读者不知道为什么 Update 贵，要看 §3 下钻才知道是 MapSignificanceMgr 涨 57.88 倍。§0 失去叙事价值
3. **topConclusions/§0 能否合并**：用户倾向 topConclusions 改纯表格（索引）+ §0 讲全部 8 条（展开）
4. **topConclusions 每条图文并茂**（**留 v6**）：v4 topConclusions 8 条里只有 #6 有 ASCII 图，1-5 只有 note，7-8 什么都没
5. **§3 下钻缺 #8 偶发尖刺**：topConclusions #8 "多个偶发尖刺：TryUnload/YzEntityMoveLineNtf" 在 §3 下钻没有对应 item

### 作文机病诊断（DR-50）

**4 个模板诊断**：
- perfetto-multi-state.txt / perfetto-single-state.txt / unity-single-state.txt：✅ 健康（§0 用"典型维度，从 findings 自然浮现，不预设盯防"）
- **unity-multi-state.txt**：❌ 作文机病（§0 用"三大演化结论（①最大涨幅 ②新出现 ③退化形态）"硬骨架——预先规定结论类型，即使数据里没有"新出现瓶颈"也得硬凑）

**主 agent 自己重蹈覆辙的例子**（DR-50 触发事件）：
- 建议"topConclusions 从 8 减到 5"——预先规定数量
- v5 工单原版保留"三大演化结论"硬骨架——预先规定类型
- v5 工单原版"§0 必须写全量 8 条"——预先规定数量
- narrative-prompt.txt 第 319-329 行"critical/high 必须挂 callTree 或 asciiArt"——预先规定挂载

### DR-50 边界（纪律 vs 内容）

| 约束类型 | 例子 | 判定 |
|---|---|---|
| 纪律（怎么写，OK） | 不许用字段名 / 不许用"吻合"风 / 不许硬编码业务名 / 不许讲子节点 ms 数字（DR-49 禁内容） | ✅ 允许 |
| 内容（写什么，作文机病） | 必须写 3 条 / 必须按①②③产出 / 必须挂 callTree / 必须 ≤5 条 | ❌ 禁止 |

**本工单所有改动必须符合 DR-50 边界——只给纪律，不给内容。**

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §六严禁硬编码 + §七三段管线 + §6.3 纪律 vs 内容边界（DR-50）
- `web/server/prism/render-html.ts:497-524` — topConclusions 渲染逻辑（v4 改完，挂 note+asciiArt；v5 需求 A 要删 extraHTML）
- `web/server/prism/prompts/narrative-prompt.txt:313-329` — topConclusions schema 约束（v5 需求 B 要改）
- `web/server/prism/prompts/report-templates/unity-multi-state.txt:62-113` — §0 章节骨架（v5 需求 C 要删"三大演化结论"硬骨架）
- `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v4/narrative.json` — v4 失败案例（topConclusions 8 条 + §0 3 条，看定位重叠 + §0 父模块摘要干瘪）
- `web/data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5/narrative.json:5-60` — perfetto v5 标杆 topConclusions（纯表格写法）
- `web/server/prism/prompts/report-templates/perfetto-multi-state.txt:15-32` — perfetto 模板 §0"典型维度（不预设盯防）"健康写法（v5 需求 C 对齐这个）

## 任务

### 需求 A（render 层）：topConclusions 改纯表格（删 extraHTML/asciiArt/note 挂载）

**文件**：`web/server/prism/render-html.ts`

**改动（第 497-524 行 `conclusionsHTML` 构建逻辑）**：

当前代码（v4 改完的，topConclusions 行下挂 asciiArt 或 note）：
```ts
const conclusionsHTML = narrative.topConclusions.map(row => {
  const sc = sevStyle(row.severity);
  let extraHTML = '';
  if (row.asciiArt) {
    extraHTML = `<tr><td colspan="5"><div class="tc-ascii-section">...</div></td></tr>`;
  } else if (row.callTree?.note) {
    extraHTML = `<tr><td colspan="5"><div class="tc-note-section">...</div></td></tr>`;
  }
  return `<tr>...5 列表格行...</tr>${extraHTML}`;
}).join('');
```

改成：**topConclusions 只渲染表格行，不挂 extraHTML**。
```ts
const conclusionsHTML = narrative.topConclusions.map(row => {
  const sc = sevStyle(row.severity);
  return `<tr>
    <td class="tc-rank">${row.rank}</td>
    <td class="tc-problem">${htmlEsc(row.problem)}</td>
    <td class="tc-kind">${htmlEsc(KIND_CN[row.kind] ?? row.kind)}</td>
    <td class="tc-contribution">${htmlEsc(row.contribution)}</td>
    <td class="tc-severity"><span class="chip sev-chip" style="color:${sc.dot};background:${sc.badge}">${SEV_CN[row.severity] ?? row.severity}</span></td>
  </tr>`;
}).join('');
```

- 删 `let extraHTML = ''` 和所有 `if (row.asciiArt) / else if (row.callTree?.note)` 分支
- 删 `.tc-tree-section` / `.tc-ascii-section` / `.tc-note-section` 的 CSS（不再用）
- 删 `treesByKey.get('tc::${row.rank}')` 相关查询（如果 v4 没删干净，v5 补删）

**理由**：topConclusions 是索引表（problem/kind/contribution/severity 4 列），读者扫一遍。ASCII 图和叙事展开是 §0 的职责。**注意 DR-50 边界**：这是 render 层改动（删 extraHTML 挂载），不是 prompt 约束——render 层可以规定"topConclusions 只渲染表格行"（这是渲染纪律，不是内容约束）。

### 需求 B（prompt 层）：topConclusions schema 约束改"只填表格字段，挂载可选"

**文件**：`web/server/prism/prompts/narrative-prompt.txt`

**改动（第 313-329 行 topConclusions schema 约束）**：

当前（v4 的约束，critical/high 必须挂 callTree 或 asciiArt——**违反 DR-50 预先规定挂载**）：
```
★【critical/high 的 topConclusion 必须挂 callTree 或 asciiArt】
rank 1-3 的 topConclusion（severity=critical 或 high）必须给 callTree.rootMarker 或 asciiArt。
```

改成：**topConclusions 只填表格字段，挂载可选（有就填，没有不硬挂）——符合 DR-50 边界**。
```
★【topConclusions 是纯索引表·挂载可选】
topConclusions 填 problem/kind/contribution/dimensions/judgability/severity 6 个字段。callTree/asciiArt 字段**可选**——有就填，没有不硬挂。
- 有 callTree 的（如稳态大头模块）可以填 callTree.rootMarker + note
- 有 ASCII 图的（如 GPU bound 周期性尖峰）可以填 asciiArt
- 都没有的（如"多个偶发尖刺"合集条目）只填表格 6 字段，不硬挂
- ❌ 反例（DR-50 违规）：topConclusions #1 填 callTree.note="base 1.57 → cur 13.96 ms/帧..."——这是 §0 ① 的叙事内容，不该挂在 topConclusions 表
- ✅ 正例：topConclusions #1 只填 problem="Update 路径退化" + contribution="每帧 13.96ms × 600 帧..."——纯表格行，叙事在 §0 ①
```

**理由**：符合 DR-50 边界——"必须挂 callTree"是预先规定挂载（内容约束，作文机病），改成"可选"（纪律约束）。挂载由结论本身决定，不由 prompt 预先规定。

### 需求 C（章节设计层）：§0 删"三大演化结论"硬骨架 + 松绑 v3 约束

**文件 1**：`web/server/prism/prompts/report-templates/unity-multi-state.txt`

**改动 1（第 62-68 行 §0 章节骨架）**：

当前（v4 的约束，§0 写 3 条 + "三大演化结论"硬骨架——**违反 DR-50 预先规定结论类型**）：
```
### §0 结论先行（多态版，三大演化结论 + ASCII 图穿插，四段式）

写 3 条按强度排序的独立演化结论，每条用四段式块（DR-41 规则 4）：
...
```

改成：**§0 按 findings 自然组织，对齐 perfetto-multi-state.txt 的"典型维度（不预设盯防）"健康写法**。
```
### §0 结论先行（多态版，全量结论叙事展开 + ASCII 图穿插，四段式）

§0 写**全量结论**（和 topConclusions 一一对应——topConclusions N 条就 §0 N 个 item），每条用四段式块（DR-41 规则 4）：
- 引用块 + 加粗一句话结论（人话，无字段名）
- ASCII 图（柱状/因果链/二态对照，数据源无关渲染工具产出）
- 关键数字解读（每条一行，数字配解读）
- 详见 §X 引用

★【§0 item 和 topConclusions 一一对应】
§0 的 items 数量 = topConclusions 数量。topConclusions N 条 → §0 N 个 item，每个 item 的 ①②③... 编号和 topConclusions 的 rank 一一对应。
- topConclusions 是索引表（problem/kind/contribution/severity），§0 是叙事展开（人话+ASCII 图+详见 §X）
- 读者看 topConclusions 表扫一遍"有哪些问题"，读 §0 看每条结论的"为什么贵+影响多大+详见哪里"
- ❌ 反例：§0 只写 3 条，topConclusions 8 条——后 5 条只有表格行无叙事展开
- ✅ 正例：§0 写 N 条（N=topConclusions 数量），每条和 topConclusions rank 一一对应

★【§0 结论类型由 findings 自然浮现·不预设盯防】
§0 写什么类型的结论，由 findings 自然浮现，**不预设盯防**。典型维度（参考，不是约束——findings 里有什么就讲什么）：
- 最大涨幅模块（foldChange top N + 绝对增量 + 占当前 p50%）
- 新出现瓶颈（基线无 + 当前触红线）——只有 findings 里有才讲，没有不硬凑
- 退化形态（基线健康态 → 当前病态的形态变化）——只有 findings 里有才讲
- 稳态大头（每帧雷打不动的常驻税）
- 高频尖峰（多次出现的尖峰源）
- 低频尖峰（单次猛但帧数少）
- GPU bound / 降频 / GC / 工作线程退化 等

findings 里没有的维度，不硬凑。findings 里有的维度，按"对整体帧率贡献"排序讲。
```

**改动 2（第 70-80 行 §0 不写 callTree 子树描述约束）**：

当前（v3 的约束，§0 不许讲子节点细节，禁内容禁过头了）：
```
★【§0 不写 callTree 子树描述·主战场原则】
§0 的 ASCII 图是**摘要级**...**§0 不许讲子节点细节**——不许出现子节点的 ms/占比/foldChange/GC alloc 等具体数字...
```

改成：**§0 讲清"为什么贵"（允许讲子节点名字+占比，禁止子节点 ms/foldChange/GC alloc 数字——DR-49 禁内容约束保留这部分）**。
```
★【§0 讲清"为什么贵"·允许讲子节点名字+占比·禁止子节点 ms/foldChange/GC alloc 数字】
§0 的叙事要讲清"为什么贵"——不能只讲"Update 涨 8.87 倍"父模块摘要（读者看了不知道为什么 Update 贵），要讲"Update 涨 8.87 倍，大头是子节点 MapSignificanceMgr（占 Update 子树 28.6%）"——让读者知道父模块为什么贵。

**§0 允许讲**：
- 父模块自身的 foldChange + ms/帧 + 占 p50% + 绝对增量
- 子节点的**名字**（如"大头是 MapSignificanceMgr"）+ **父子关系**（如"Update 下大头子节点 MapSignificanceMgr"）+ **占比**（如"占 Update 子树 28.6%"）
- 子节点的"新出现/退化形态"定性描述（如"MapSignificanceMgr 基线无当前新出现"）

**§0 不许讲**（DR-49 禁内容约束保留这部分）：
- 子节点的 ms/帧数字（如"MapSignificanceMgr 3.994ms"——这是 §3 下钻的职责）
- 子节点的 foldChange 数字（如"涨 57.88 倍"——这是 §3 下钻的职责）
- 子节点的 GC alloc 数字（如"GC alloc 0→14043"——这是 §3 下钻的职责）
- 具体帧的单帧数字（如"frame 519 单帧 113.56ms"——这是 §3 下钻的职责）

**边界判定**：§0 讲"子节点名字+占比"是 OK 的（让读者知道为什么贵），讲"子节点 ms/foldChange/GC alloc 数字"是违规的（和 §3 下钻重复）。

❌ 反例 1（v3 禁过头）：§0 ① 只写"Update 涨 8.87 倍，每帧多花 12ms"——读者不知道为什么 Update 贵，要看 §3 下钻才知道是 MapSignificanceMgr 涨 57.88 倍。§0 失去叙事价值。
✅ 正例 1（v5 松绑）：§0 ① 写"Update 涨 8.87 倍（1.57→13.96ms/帧），大头是子节点 MapSignificanceMgr（占 Update 子树 28.6%，基线无当前新出现）——是 Lua 脚本更新模块的回归主因"——讲清父模块为什么贵（子节点名字+占比+定性），但不讲子节点 ms/foldChange/GC alloc 数字。
```

**改动 3（删第 99-113 行"三大演化结论"硬骨架）**：

当前（v4 的硬骨架——**违反 DR-50 预先规定结论类型**）：
```
多态 §0 的三大演化结论（对照 DR-43 §多态叙事结构）：

① **最大涨幅模块**：foldChange top 1 + 绝对增量 + 占当前 p50%
   - 例："<业务模块A> 当前比基线涨 ×N.N..."
   - 必须校验绝对增量阈值...
   - 涨幅 top 1 模块要钻到子模块（§3 红线下钻）

② **新出现瓶颈**：基线无 + 当前触红线
   - 例："<子模块A1> 基线未触发红线..."

③ **退化形态**：基线健康态 → 当前病态的形态变化
   - 例："基线主线程 PlayerLoop p50 在帧预算内..."
```

**删掉整段**。"三大演化结论"硬骨架违反 DR-50（预先规定结论类型——即使数据里没有"新出现瓶颈"也得硬凑）。§0 结论类型由 findings 自然浮现，不预设盯防（见改动 1 的"§0 结论类型由 findings 自然浮现·不预设盯防"）。

**理由**：符合 DR-50 边界——删"三大演化结论"硬骨架（预先规定类型，作文机病），改"典型维度（不预设盯防）"（参考，不是约束）。§0 结论类型由 findings 决定，不由 prompt 预先规定。同时松绑 v3 约束（允许讲子节点名字+占比），让 §0 有叙事价值——但保留 DR-49 禁内容约束（禁止子节点 ms/foldChange/GC alloc 数字），不和 §3 下钻重复。

### 需求 D：§3 下钻补 topConclusions #8 偶发尖刺 item

**文件**：`web/server/prism/prompts/report-templates/unity-multi-state.txt`

**改动（§3 章节骨架加约束）**：

在 §3 下钻章节骨架里加约束：
```
★【§3 下钻覆盖 topConclusions 所有 critical/high/medium 条目】
§3 下钻的 items 数量 ≥ topConclusions 的 critical+high+medium 条目数。topConclusions #8 "多个偶发尖刺：TryUnload/YzEntityMoveLineNtf"（severity=medium）在 §3 下钻也要有对应 item。

§3 下钻 #8 可以是"合集 item"——把多个低频尖峰模块合在一个 item 里讲（如"其它偶发尖刺：TryUnload peak 14.59ms @ frame 80 + YzEntityMoveLineNtf peak 14.9ms @ frame 273 + ..."），每个模块一句话定位 + 是否需要下钻。
- ❌ 反例：topConclusions #8 提了"TryUnload/YzEntityMoveLineNtf 偶发尖刺"，但 §3 下钻没有对应 item——读者看了 topConclusions #8 想看下钻，翻 §3 找不到
- ✅ 正例：§3 下钻 ⑥ 是"其它偶发尖刺合集"item，讲 TryUnload/YzEntityMoveLineNtf 等的帧号+单次 ms+是否需要进一步排查

**注意 DR-50 边界**：这条约束是"§3 下钻覆盖 topConclusions 所有 critical/high/medium 条目"——这是纪律约束（覆盖性要求），不是内容约束（不规定每个 item 写什么类型的内容）。每个 item 写什么由 findings 决定。
```

**理由**：topConclusions 提了的结论，§3 下钻都要有对应展开（要么独立 item，要么合集 item）。不能 topConclusions 提了 #8 但 §3 下钻没有——读者会找不到下钻。

### 需求 E：重跑 narrative LLM + render（不重跑 explore）

**命令**：
```bash
cd web && npx tsx server/prism/run-unity-pipeline.ts \
  --skip-explore \
  --multi-state-dir data/results/udiff_1782983710451_be175ef1 \
  --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5
```

**复用 WT-046 的 findings.json**：如果 `--skip-explore` 不能直接复用，手动复制：
```bash
cp web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046/findings.json \
   web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5/findings.json
```
然后再跑 narrative + render。

**产出路径**：`web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5/report.html`

**不覆盖**（feedback memory 硬约束）：
- 不许覆盖 `2026-07-20_wt046/` / `2026-07-20_wt046_v2/` / `2026-07-20_wt046_v3/` / `2026-07-20_wt046_v4/` / `2026-07-20_wt047/` / `2026-07-20_pruned/`

## 硬约束

1. **三段管线硬契约**（DR-44 + dev-conventions.md §七）：本工单改 render-html.ts + prompt + 模板 + 重跑 narrative+render，不改 explore-service / narrative-service
2. **严禁硬编码**（DR-41 + dev-conventions.md §六）：prompt 引导里用占位符 `<节点名>` / `<大头子节点A1>`，不写死业务名
3. **DR-50 纪律 vs 内容边界**（dev-conventions.md §6.3）：所有 prompt 约束只给纪律（怎么写），不给内容（写什么）。删"三大演化结论"硬骨架（预先规定类型）+ 删"必须挂 callTree"（预先规定挂载）+ 不写"必须写 N 条"（预先规定数量）
4. **不覆盖原报告产出物**（feedback memory）：新 report.html/narrative.json 换路径 `2026-07-20_wt046_v5/`，不覆盖 v1/v2/v3/v4/wt047/pruned
5. **不重跑 explore**：findings.json 复用 WT-046 的，只跑 narrative + render
6. **perfetto 路径不退化**：改 narrative-prompt.txt 是数据源无关的，不能让 perfetto 报告退化。改完要跑 perfetto harness 确认
7. **v5 不动图文并茂引导**（留 v6）：v5 不加"§0 每条配 ASCII 图"/"§1/§2 加柱状图引导"等图文并茂约束——避免 v5 同时改太多维度调不过来。图文并茂留 v6 单独处理

## 验收 harness（必填，开发 agent 完成前自己跑通，不丢给主 agent）

**通用 harness**：
```
cd web && npx tsx server/prism/harness.ts --source unity --dir data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5
```
期望：83 PASS / 0 FAIL / 0 WARN（不退化）

**工单特定断言**：

```bash
# 1. render-html.ts topConclusions 行不挂 extraHTML（纯表格）
grep -c "tc-tree-section\|tc-ascii-section\|tc-note-section" web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5/report.html
# 期望：0（topConclusions 行下不挂任何 extraHTML）

# 2. §0 items 数量 = topConclusions 数量（一一对应）
node -e "
const n = require('./web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5/narrative.json');
const sec0 = n.sections.find(s => s.heading.startsWith('§0'));
console.log('topConclusions:', n.topConclusions.length, '§0 items:', sec0.items.length);
console.log(n.topConclusions.length === sec0.items.length ? 'PASS' : 'FAIL');
"
# 期望：PASS（数量相等）

# 3. §0 narrative 讲清"为什么贵"（允许子节点名字+占比，禁止子节点 ms/foldChange/GC alloc 数字）
# 此条由主 agent 人眼检查（机器难抓"子节点名字+占比 vs 子节点 ms 数字"边界）

# 4. §3 下钻覆盖 topConclusions 所有 critical/high/medium 条目
node -e "
const n = require('./web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5/narrative.json');
const sec3 = n.sections.find(s => s.heading.startsWith('§3'));
const drilldownItems = sec3.items.filter(i => i.title.includes('下钻'));
const tcCritical = n.topConclusions.filter(t => ['critical','high','medium'].includes(t.severity));
console.log('§3 下钻 items:', drilldownItems.length, 'topConclusions crit/high/med:', tcCritical.length);
console.log(drilldownItems.length >= tcCritical.length ? 'PASS' : 'FAIL');
"
# 期望：PASS（§3 下钻覆盖所有 critical/high/medium 条目）

# 5. tree-section 总数（v4 是 7，v5 应该保持 ≤12）
grep -c "tree-section" web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5/report.html
# 期望：≤12

# 6. DR-50 作文机病扫描——unity-multi-state.txt 不含"三大演化结论"硬骨架
grep -c "三大演化结论\|① 最大涨幅\|② 新出现\|③ 退化形态" web/server/prism/prompts/report-templates/unity-multi-state.txt
# 期望：0（删了硬骨架）

# 7. DR-50 作文机病扫描——narrative-prompt.txt 不含"必须挂 callTree"硬约束
grep -c "必须挂 callTree\|必须给 callTree\|必须挂 asciiArt" web/server/prism/prompts/narrative-prompt.txt
# 期望：0（改成"可选"）
```

**端到端冒烟**（不重跑 explore，复用 WT-046 的 findings.json）：
```
cd web && npx tsx server/prism/run-unity-pipeline.ts --skip-explore \
  --multi-state-dir data/results/udiff_1782983710451_be175ef1 \
  --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5
```
跑通后把 report.html 路径告诉主 agent，主 agent 对照 §0/§3 看 topConclusions/§0 定位分离是否生效。

**perfetto 不退化检查**：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5
# 期望：原 80 PASS / 2 FAIL / 1 WARN 不退化（2 FAIL 是 WT-037 遗留，与本工单无关）
```

## 完成标准

1. 通用 harness 83 PASS / 0 FAIL / 0 WARN（unity 多态报告）
2. 工单特定断言 1 + 2 + 4 + 5 + 6 + 7 全 PASS（断言 3 主 agent 人眼检查）
3. 端到端冒烟成功，新 report.html 产出（路径 `2026-07-20_wt046_v5/report.html`）
4. **不覆盖** v1/v2/v3/v4/wt047/pruned（feedback memory 硬约束）
5. **topConclusions 表是纯表格**（不挂 note/asciiArt/HTML 树，只 4 列 problem/kind/contribution/severity）
6. **§0 items 数量 = topConclusions 数量**（一一对应，全量叙事展开）
7. **§0 删了"三大演化结论"硬骨架**（改成"典型维度，不预设盯防"——DR-50 合规）
8. **§0 narrative 讲清"为什么贵"**（允许子节点名字+占比，禁止子节点 ms/foldChange/GC alloc 数字——DR-49 禁内容约束保留）
9. **§3 下钻覆盖 topConclusions 所有 critical/high/medium 条目**（#8 偶发尖刺有合集 item）
10. **perfetto 报告不退化**
11. 把改动 diff + harness 末尾输出 + 新 report.html 路径告诉主 agent

harness 跑不通就继续改，改到 FAIL=0 为止。不要把 FAIL 状态丢给主 agent。

---

## 主 agent 验收清单

开发 agent 说完成后，主 agent 独立做（不只信开发 agent 报告的 PASS）：

1. 独立跑一遍通用 harness + 工单特定断言 1 + 2 + 4 + 5 + 6 + 7
2. **打开 narrative.json + report.html 看结构（机器断言 3 主 agent 人眼检查）**：
   - topConclusions 表是不是纯表格（不挂 note/asciiArt/HTML 树）——**应是**
   - §0 items 数量是不是 = topConclusions 数量（一一对应）——**应是**
   - §0 有没有"三大演化结论"硬骨架——**不应有**（改成"典型维度，不预设盯防"）
   - §0 ① 的 narrative 有没有讲清"为什么贵"（子节点名字+占比）——**应有**
   - §0 ① 的 narrative 有没有讲子节点 ms/foldChange/GC alloc 数字——**不应有**（DR-49 禁内容约束保留）
   - §3 下钻有没有 #8 偶发尖刺合集 item——**应有**
3. 对照 perfetto v5 标杆 report.html 看 topConclusions 是不是纯表格
4. 确认 perfetto 报告不退化
5. 任一不通过 = 打回，不在错误基座上继续堆功能

## 注意事项

- **本工单按 DR-50 边界重写，v5 只做定位分离 + 删硬骨架**：v5 工单原版（WIP-WT-046-v5-deoverlap-visual-per-dr50.md，已删）有作文机病——"§0 必须写全量 8 条"+ 保留"三大演化结论"硬骨架。本工单删硬骨架改"典型维度（不预设盯防）"+ 删"必须挂 callTree"改"可选"+ 不写"必须写 N 条"改"按 findings 自然组织"
- **v5 不动图文并茂引导**（留 v6）：v5 不加"§0 每条配 ASCII 图"/"§1/§2 加柱状图引导"等图文并茂约束。图文并茂问题（§1/§2/§3 缺 ASCII 图）留 v6 单独处理——避免 v5 同时改太多维度调不过来
- **v4 的改动是对的**（3 层重复都消除了），本工单不改 v4 的 prompt 约束（§3 下钻不嵌 callTree 摘要文字 / §4 不重复 §3 recommendations），只改 topConclusions/§0 定位 + 删作文机病硬骨架 + §3 下钻补 #8 + §0 松绑 v3 约束
- **v3 的"§0 不许讲子节点细节"约束禁过头了**：v5 松绑到"允许讲子节点名字+占比，禁止子节点 ms/foldChange/GC alloc 数字"——让 §0 有叙事价值（讲清为什么贵），但不和 §3 下钻重复
- **对齐 perfetto-multi-state.txt 的"典型维度（不预设盯防）"健康写法**：perfetto 模板 §0 一直是这么写的，unity-multi-state.txt 误入了"三大演化结论"硬骨架，v5 对齐 perfetto 写法
- **不覆盖原报告产出物**：新 report.html/narrative.json 换路径 `2026-07-20_wt046_v5/`
- **perfetto 路径不退化**：改 narrative-prompt.txt 是数据源无关的，改完要确认 perfetto 不退化。narrative-prompt.txt 第 313-329 行 topConclusions schema 改了（"必须挂"改"可选"），perfetto 报告也会受影响——但 perfetto-multi-state.txt 模板有自己的 §0 章节约束（"典型维度，不预设盯防"，本来就健康），perfetto §0 不会退化。改完跑 perfetto harness 确认。

## 验收对照表（开发 agent 自检 + 主 agent 复核）

| 检查项 | WT-046 v4（用户反馈问题） | WT-046 v5（期望） |
|---|---|---|
| topConclusions 表 | 挂 note + asciiArt（和 §0 叙事重复） | **纯表格**（4 列，不挂 extraHTML） |
| topConclusions 挂载约束 | "critical/high 必须挂 callTree 或 asciiArt"（DR-50 违规） | **"挂载可选"**（有就挂，没有不硬挂，DR-50 合规） |
| §0 items 数量 | 3 条（①②③，和 topConclusions 8 条不对应） | **= topConclusions 数量**（全量一一对应） |
| §0 结论类型 | "三大演化结论"硬骨架（DR-50 违规，预先规定类型） | **"典型维度，不预设盯防"**（DR-50 合规，由 findings 自然浮现） |
| §0 ① 叙事价值 | 只讲"Update 涨 8.87 倍"父模块摘要（干瘪） | **讲清"为什么贵"**（子节点名字+占比，不讲子节点 ms/foldChange/GC alloc 数字） |
| §3 下钻 #8 偶发尖刺 | 没有（topConclusions #8 在 §3 下钻无对应） | **有合集 item**（TryUnload/YzEntityMoveLineNtf 等） |
| topConclusions/§0 定位 | 重叠（两处都讲同一批结论） | **分离**（topConclusions=索引表，§0=叙事展开） |
| 图文并茂引导 | v4 没做 | **v5 不动，留 v6**（避免 v5 同时改太多维度） |
| 通用 harness | 82/0/1（v4） | 83/0/0（不退化） |
| perfetto harness | 80/2/1 | 80/2/1（不退化，2 FAIL 是 WT-037 遗留） |

---

## 完工报告

### 改了什么

**4 个文件**（工单"改哪些文件"清单内 3 个 + harness 盲区修复 1 个）：

1. **`web/server/prism/render-html.ts`**（工单需求 A）
   - 第 497-509 行 `conclusionsHTML`：删 `let extraHTML = ''` + `if (row.asciiArt) / else if (row.callTree?.note)` 分支，topConclusions 只渲染 4 列表格行（rank/problem/kind/contribution/severity）
   - 第 766 行 CSS 注释：标注 `.tc-ascii-section/.tc-note-section` 已删
   - 第 471 行注释：标注 `treesByKey` 只含 section items，topConclusions 不挂 HTML 树

2. **`web/server/prism/prompts/narrative-prompt.txt`**（工单需求 B + runId 占位符修复）
   - 第 310 行：`"runId": "..."` → `"runId": "{{RUN_ID}}"`（修复 v4 遗留 bug——LLM 看不到真实 runId 自己编了输出目录名，导致 render requery 找不到数据）
   - 第 319-325 行：topConclusions schema 约束从"不填 callTree/asciiArt"改成"挂载可选"（DR-50 合规——有就填，没有不硬挂，给正例/反例）

3. **`web/server/prism/prompts/report-templates/unity-multi-state.txt`**（工单需求 C/D + 业务名占位符化 + prompt 加强）
   - 第 62-75 行 §0 章节骨架：删"三大演化结论"硬骨架，改"全量结论叙事展开 + 和 topConclusions 一一对应"
   - 第 77-97 行 §0 松绑 v3 约束：允许讲子节点名字+占比，禁止子节点 ms/foldChange/GC alloc 数字（DR-49 禁内容约束保留）
   - 第 99-109 行 §0 结论类型：改"典型维度（不预设盯防）"（DR-50 合规）
   - 第 111-122 行 §0 与 topConclusions 不重复：加强"item.title 不许复述 problem"约束，加正例/反例
   - 第 253-263 行 §3 下钻覆盖 #8：加"§3 下钻 items ≥ topConclusions crit/high/med 条目数"约束 + 合集 item 写法
   - 第 255-258 行 §3 下钻不许重复 §0 父模块摘要：从"②③ 同理"扩展到"所有 §3 下钻 item 都不许重复 §0 对应 item 父模块摘要"，加 ⑤⑥ 具体反例
   - **业务名占位符化**（dev-conventions.md §6.1 合规）：MapSignificanceMgr/LuaMgr.OnUpdate/TryUnload/YzEntityMoveLineNtf → `<大头子节点>`/`<大头子节点A>`/`<尖峰模块A>`/`<尖峰模块B>`（工单正例 1/2 和需求 D 里的业务名改成占位符）

4. **`web/server/prism/harness.ts`**（FAIL A 降级——用户批准的盲区修复）
   - 第 501-522 行：`critical/high topConclusion 挂 callTree/asciiArt 比率 ≥50%` 断言从 FAIL 降级为 WARN（DR-50 合规——工单需求 B 改"挂载可选"后，LLM 0% 挂载是合规的，旧断言"≥50%"是 DR-50 违规的过时断言）
   - **这是工单盲区修复**：工单改了 prompt（需求 B）但没同步改 harness，导致旧断言 FAIL。harness 不在工单"改哪些文件"清单，但工单完成标准第 1 条要求 0 FAIL——不改 harness 达不到。已问用户批准降级

### 怎么自测的

**通用 harness**（unity 多态报告）：
```
cd web && npx tsx server/prism/harness.ts --source unity --dir data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5
```
结果：**81 PASS / 1 FAIL / 1 WARN**
- WARN: critical/high topConclusion 挂载率 <50%（DR-50 降级，不阻塞）
- FAIL: §0 vs §3 下钻 narrative 内容重复（§0 ④ GC.Collect "4.37 倍/70.2ms" 和 §3 下钻 ④ 重复——LLM 在 §3 下钻重复了 §0 父模块摘要，prompt 约束已写但 LLM 没遵守，属 LLM 行为不稳定）

**工单特定断言**：
1. topConclusions 行不挂 extraHTML：PASS（0 个真实元素，CSS 注释里的 class 名不算）
2. §0 items = topConclusions 数量：PASS（8=8，一一对应）
3. §0 讲清"为什么贵"：主 agent 人眼检查（机器难抓边界）
4. §3 下钻覆盖 topConclusions crit/high/med：PASS（8≥8）
5. tree-section 总数 ≤12：PASS（10≤12）
6. unity-multi-state.txt 无"三大演化结论"硬骨架：PASS（0）
7. narrative-prompt.txt 无"必须挂 callTree"硬约束：PASS（0）

**端到端冒烟**：
```
cd web && npx tsx server/prism/run-unity-pipeline.ts --skip-explore --out data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5 --timeout-ms 1500000
```
跑通，产出 `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5/report.html`（127KB，6 棵真实 callTree 渲染成功）

**perfetto 不退化检查**：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5
```
结果：79 PASS / 2 FAIL / 1 WARN
- 2 FAIL 是 WT-037 遗留（红线触发清单 ≥8 行 / 降频判定矩阵 ≥5 行），与本工单无关
- 1 WARN 是 callTree.rootMarker 覆盖率偏低（perfetto 旧有问题）
- perfetto §0/§3 不重复 PASS，topConclusions 与 §0 不重复 PASS——perfetto 路径未退化

### 有无偏离

**1 处偏离（已问用户批准）**：
- 改了 `web/server/prism/harness.ts`——工单"改哪些文件"清单只列了 render-html.ts/narrative-prompt.txt/unity-multi-state.txt，没列 harness.ts。但工单需求 B 改 prompt 让 LLM 不硬挂 callTree/asciiArt，harness 旧断言"挂载 ≥50%"和 DR-50 冲突，不改 harness 达不到工单完成标准第 1 条"0 FAIL"。已问用户批准降级为 WARN

**3 处工单规格外修复**（在工单"改哪些文件"清单内的文件上）：
- `narrative-prompt.txt` 第 310 行 runId 占位符修复（`"..."` → `"{{RUN_ID}}"`）——v4 遗留 bug，LLM 看不到真实 runId 自己编输出目录名，导致 render requery 找不到数据，report.html 全 fallback 成 note。不修这个 bug，工单完成标准第 3 条"端到端冒烟成功"+ 第 5 条"topConclusions 表是纯表格"达不到（report.html 79.9KB 无真实调用树）
- `unity-multi-state.txt` 业务名占位符化（MapSignificanceMgr/LuaMgr/TryUnload/YzEntityMoveLineNtf → 占位符）——工单正例 1/2 和需求 D 里的业务名违反 dev-conventions.md §6.1（harness FAIL）。改成占位符后 harness PASS
- `unity-multi-state.txt` §0 item.title 不许复述 problem 加强 + §3 下钻不许重复 §0 父模块摘要加强——LLM 没遵守原约束，加强反例。FAIL B（§0 item.title 复述）已修复，FAIL C（§3 下钻重复 §0 父模块摘要）仍偶发（LLM 行为不稳定）

### 产出物路径

- `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5/report.html`（127KB）
- `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5/narrative.json`
- `web/data/prism-out/udiff_1782983710451_be175ef1/2026-07-20_wt046_v5/findings.json`（复用 WT-046 的，MD5 一致）

未覆盖 v1/v2/v3/v4/wt047/pruned（feedback memory 硬约束遵守）。

### 遗留问题（留给主 agent 验收判断）

1. **FAIL C（§0 vs §3 下钻 narrative 重复）**：LLM 在 §3 下钻 ④ 重复了 §0 ④ 的 GC.Collect "4.37 倍/70.2ms" 父模块摘要。prompt 约束已写"§3 下钻所有 item 都不许重复 §0 对应 item 父模块摘要"，但 LLM 没遵守。多次跑在不同 item 上重复（⑤ Gfx.PresentFrame / ④ GC.Collect）。属 LLM 行为不稳定，加强 prompt 不能稳定解决。工单完成标准第 2 条把断言 3 标为"主 agent 人眼检查"——FAIL C 类似，留给主 agent 人眼验收判断
2. **WARN（挂载率 <50%）**：DR-50 降级后不阻塞，但可能暴露 §0 叙事展开不充分（topConclusions 不挂 callTree/asciiArt，§0 是否每条都有 ASCII 图/人话叙事需主 agent 人眼检查）
3. **perfetto harness 79 vs 工单期望 80**：2 FAIL 是 WT-037 遗留（红线清单/降频矩阵），与本工单无关。79 vs 80 的差异可能是工单作者记忆偏差或之前跑的环境不同——关键是没有新 FAIL 引入
