# TODO-WT-038 · narrative-prompt + 模板数据源无关化

> 状态：TODO ｜ 里程碑：M5 多源扩展 ｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：无（纯 prompt + 方法论改动，但 unity 多态接入前必须做）
> 开工前必读：`docs/prism/memory/dev/conventions.md`（§六严禁硬编码 + §七三段管线）+ `CODEBUDDY.md`（严禁硬编码）+ DR-44（报告层三层沉淀）

## 背景

用户指出：`explore-prompt.txt` 文件名没带 unity 前缀，但内容是 unity 专属（10 个工具是 unity 的 queryMarkers/scanMetricOverFrames 等，范例硬写"行军线"等业务词）。更严重的是 `narrative-prompt.txt` 号称"数据源无关骨架 + {{REPORT_TEMPLATE}} 注入"，但实际硬写了 perfetto + AOE 业务词（Gfx.WaitForPresent / bigCoreReach / LuaMgr / BattleHeadMgr / 行军线等）。`perfetto-multi-state.txt` 模板也硬写了 Choreographer / AudioTrack / AAudio 等 perfetto+Android 特有线程名。

根因：和 perfetto 阶段之前犯的错一样（DR-44 诊断的"perfetto 另起炉灶"）——当时为了对齐 v5.3 标杆，把 v5.3 的范例直接塞进了 narrative-prompt 和 perfetto-multi-state 模板，**没做数据源无关化处理**。

**影响**：unity 多态接入时，narrative-prompt 的 perfetto+AOE 范例会误导 LLM（如 bigCoreReach/中核 max-freq 对 unity 不适用，unity 没有 CPU 频率概念；行军线/LuaMgr 等业务名对其它游戏不适用）。

## 必读文档

- `docs/prism/memory/dev/conventions.md` — §六严禁硬编码 + §七三段管线 + §八占位符填充纪律
- `docs/prism/memory/methodology/report-pipeline-contract.md` — DR-44 报告层三层沉淀（通用渲染/数据源模板/质量底线）
- `CODEBUDDY.md`（项目根）— 严禁硬编码 + 三段管线硬契约

## 任务

### 需求 A：narrative-prompt.txt 数据源无关化

**文件**：`web/server/prism/prompts/narrative-prompt.txt`

当前硬写内容（必须改）：

| 行号 | 硬写内容 | 改成 |
|---|---|---|
| 83-95 | `Gfx.WaitForPresent` / `CS:AOE.LuaMgr` / `BattleHeadMgr` / `MapSignificanceMgr` / `CS:AOE.Outside.MapManager` 的范例 | 占位符 `<业务模块A>` / `<子模块A1>` / `<等待 slice>` |
| 102-105 | "GC.Alloc 业务归因（perfetto 独家，gcAllocByModule）" + `BattleHeadMgr 子树` | 改成通用"GC 归因换算（如数据源支持 gcAllocByModule）" + 占位符 `<模块名>` |
| 117 | "行军线+UI+渲染" | 占位符 `<业务模块1>` + `<业务模块2>` + `渲染` |
| 140, 190, 206, 207, 217, 219, 225, 226, 233 | "行军线" / `OutSideViewArmyLineMgr` / `MapSignificanceMgr` 在范例里反复出现 | 全部改占位符 |
| 249 | "bigCoreReach/中核 max-freq/R+ 被抢占/温度信号" | 删掉（这是 perfetto 特有，unity 没有 CPU 频率概念）或改成"降频/温度信号（如数据源支持）" |
| 262-264, 267, 275-280 | 红线归并规则用 `LuaMgr` / `BattleHeadMgr` / `MapSignificanceMgr` / `OutSideViewArmyLineMgr` / `MapManager` 当例子 | 改占位符 `<模块A>` / `<子模块A1>` / `<子模块A2>` / `<模块B>` / `<大头子模块B1>` |

**关键**：教的是"写法"（├─/└─ 缩进 + 三态对照 + 🔴/🟡 标注 + 大头拆出），不是"名字"。LLM 看占位符也能学会写法。

**范例改法示例**：

改前：
```
├─ CS:AOE.LuaMgr  base 1.00 / cur 3.80 / throttle 3.47 ms/帧 (📈 ×3.8)
│  └─ LuaMgr.OnTick&UpdateSchedule  base 0.95 / cur 3.74 / throttle 3.41
│     ├─ BattleHeadMgr  base ~0 / cur 1.51 / throttle 1.10 ms/帧 🔴
│     └─ MapSignificanceMgr  base 0.32 / cur 1.30 / throttle 1.07 ms/帧 🟡
└─ CS:AOE.Outside.MapManager  base 0.44 / cur 2.90 / throttle 3.99 ms/帧
```

改后：
```
├─ <业务模块A>  base 1.00 / cur 3.80 / throttle 3.47 ms/帧 (📈 ×3.8)
│  └─ <子调度层>  base 0.95 / cur 3.74 / throttle 3.41
│     ├─ <子模块A1>  base ~0 / cur 1.51 / throttle 1.10 ms/帧 🔴 单次触红线
│     └─ <子模块A2>  base 0.32 / cur 1.30 / throttle 1.07 ms/帧 🟡 临近红线
└─ <业务模块B>  base 0.44 / cur 2.90 / throttle 3.99 ms/帧
```

### 需求 B：perfetto-multi-state.txt 模板清业务词

**文件**：`web/server/prism/prompts/report-templates/perfetto-multi-state.txt`

当前硬写内容（必须改）：

| 行号 | 硬写内容 | 改成 |
|---|---|---|
| 52 | `["Choreographer fps", "60.1（三态稳定）"]` | 占位符 `<帧调度 fps>, <值>` |
| 70-71 | `AudioTrack/AAudio_1/Audio Mixer/Audio Stream/GVoiceRender` | 占位符 `<线程1>/<线程2>/...` |
| 82-86 | `UnityMain` / `UnityGfxRenderS` / `AudioTrack` 范例行 | 占位符 `<主线程>` / `<渲染线程>` / `<音频线程>` |
| 107 | `Gfx.WaitForPresentOnGfxThread 17.8ms/帧` | 占位符 `<等待 slice>` |
| 117 | `cpu7/cpu4-6/cpu0-3 reach%` | 保留（perfetto 数据源特定概念，模板就是 perfetto 的） |
| 131 | `bigCoreReach 59.2%` | 保留（perfetto 数据源特定） |
| 172-174 | `CS:AOE.LuaMgr` / `OutSideViewArmyLineMgr` / `URP.AfterRendering` | 占位符 `<模块A>` / `<大头子模块>` / `<渲染管线节点>` |

**注意**：perfetto-multi-state.txt 是 perfetto 数据源特定模板，perfetto 特有概念（Choreographer/bigCoreReach/CPU 频率）可以保留，但**业务名（LuaMgr/ArmyLine 等）必须改占位符**。

### 需求 C：explore-prompt.txt 重命名 + 清业务词

**文件**：
- 重命名 `web/server/prism/prompts/explore-prompt.txt` → `web/server/prism/prompts/unity-explore-prompt.txt`
- 修改 `web/server/prism/report-pipeline.ts` 的 unity explorePromptPath

当前 `explore-prompt.txt` 硬写内容（必须改）：

| 位置 | 硬写内容 | 改成 |
|---|---|---|
| 标题 | "探索一次 Unity 性能采集的数据" | 保留（unity 数据源特定，文件名已体现） |
| 工具范例 | `MapSignificanceMgr` / `LuaMgr` 等 | 占位符 `<模块名>` |
| 第0步候选清单 | "TServerManager 网络处理、LuaMgr 下的各 Mgr 调度、MeshUI" | 占位符 `<网络模块>` / `<脚本调度模块>` / `<UI模块>` |
| drillDownMarker 范例 | "MapSignificanceMgr→EntityTask→ProcessTask_MapEntityAdd→OnDirtyCallback" | 占位符 `<模块>→<子层>→<叶子>` |
| finding title 示范 | '行军线模块每帧常驻开销' | 占位符 `<业务模块>每帧常驻开销` |

**注意**：unity-explore-prompt.txt 是 unity 数据源特定 prompt，unity 特有概念（PlayerLoop/MonoBehaviour/URP）可以保留，但**游戏专属业务名（行军线/LuaMgr/MapSignificanceMgr 等 AOE 专属）必须改占位符**。

### 需求 D：report-pipeline.ts 更新路由

**文件**：`web/server/prism/report-pipeline.ts`

```ts
// 改前
if (!registry.get('unity')) {
  registry.register({
    source: 'unity',
    explorePromptPath: 'prompts/explore-prompt.txt',  // 旧名
    ...
  });
}

// 改后
if (!registry.get('unity')) {
  registry.register({
    source: 'unity',
    explorePromptPath: 'prompts/unity-explore-prompt.txt',  // 新名
    ...
  });
}
```

同时更新 `explore-service.ts` 的 prompt 路由逻辑（line 693 附近）。

### 需求 E：新建 unity-single-state.txt 模板

**文件**：`web/server/prism/prompts/report-templates/unity-single-state.txt`（新建）

基于 unity 已跑过的单态报告（`web/data/prism-out/unity-outside-stressmove/2026-07-11_14-55-28/narrative.json`）的结构，写 unity 单态报告章节模板。

参考 DR-42 单态方法论 + perfetto-single-state.txt draft。

章节结构（unity 单态）：
- §0 结论先行（单态版，三大当前态结论，四段式块）
- §1 采集元信息（单态: fps/p50/帧数/帧预算）
- §2 多线程宏观（单态: unity 线程如 UnityMain/UnityGfxRenderS 的 run/sleep 分布）
- §3 主线程一帧时间去向（单态: callTree + 红线矩阵按占 p50% 排序 + 下钻）
- §4 ROI 优化方向（单态: 按占 p50 百分比 + severity 排序）

**不硬写**业务名（用占位符）。**不硬写**perfetto 特有概念（如 bigCoreReach/降频——unity 没有 CPU 频率概念，不写降频章节）。

### 需求 F：补规约（dev-conventions.md §六.1）

**文件**：`docs/prism/memory/dev/conventions.md`

**已由主 agent 完成（2026-07-17）**：在 §六 末尾追加 §6.1 "prompt 文件硬编码"小节，明确：
- prompt 范例不许用业务名，用占位符
- 数据源无关骨架（narrative-prompt.txt）不许有数据源特定词
- 数据源特定模板可保留该数据源概念，但不许有业务名
- 验收靠 harness grep 扫描

开发 agent **不需要再改规约**，但要读 §6.1 确认理解，并按 §6.1 执行需求 A-E。

### 需求 G：harness 加 prompt 文件硬编码扫描

**文件**：`web/server/prism/harness.ts`

在 `[1] 占位符填充检查` 节后新增"prompt 文件硬编码扫描"断言组（FAIL 不是 warning）：

```ts
// G1. narrative-prompt.txt 不许有业务名
const narrativePromptSrc = fs.readFileSync(path.join(__dirname, 'prompts/narrative-prompt.txt'), 'utf-8');
const businessNames = [/行军线/, /ArmyLine/, /MapSignificance/, /BattleHead/, /LuaMgr/, /MapManager/, /OutSideView/];
for (const re of businessNames) {
  assert(!re.test(narrativePromptSrc), `narrative-prompt.txt 无业务名硬编码: ${re.source}`);
}

// G2. narrative-prompt.txt 不许有 perfetto 特定词（它是数据源无关骨架）
const perfettoSpecificTerms = [/Choreographer/, /AudioTrack/, /AAudio/, /bigCoreReach/, /Gfx\.WaitForPresent/];
for (const re of perfettoSpecificTerms) {
  assert(!re.test(narrativePromptSrc), `narrative-prompt.txt 无 perfetto 特定词: ${re.source}`);
}

// G3. perfetto-multi-state.txt 不许有业务名（perfetto 概念可保留）
const perfettoTemplateSrc = fs.readFileSync(path.join(__dirname, 'prompts/report-templates/perfetto-multi-state.txt'), 'utf-8');
for (const re of businessNames) {
  assert(!re.test(perfettoTemplateSrc), `perfetto-multi-state.txt 无业务名硬编码: ${re.source}`);
}

// G4. unity-explore-prompt.txt 不许有 AOE 专属业务名（unity 概念可保留）
const unityPromptPath = path.join(__dirname, 'prompts/unity-explore-prompt.txt');
if (fs.existsSync(unityPromptPath)) {
  const unityPromptSrc = fs.readFileSync(unityPromptPath, 'utf-8');
  for (const re of businessNames) {
    assert(!re.test(unityPromptSrc), `unity-explore-prompt.txt 无业务名硬编码: ${re.source}`);
  }
}
```

**关键**：这些断言是 `assert`（FAIL），不是 `warn`（warning）。prompt 文件里有业务名 = harness FAIL = 开发 agent 不能交差。

## 硬约束

1. **narrative-prompt.txt 必须数据源无关**：grep 不到"行军线|ArmyLine|MapSignificance|BattleHead|LuaMgr|MapManager|OutSideView"等业务词，grep 不到"Choreographer|AudioTrack|AAudio|bigCoreReach|Gfx.WaitForPresent"等数据源特定词（在 narrative-prompt 里）
2. **perfetto-multi-state.txt 保留 perfetto 章节骨架**：perfetto 特有概念（Choreographer/bigCoreReach/CPU 频率）可保留，但业务名必须改占位符
3. **unity-explore-prompt.txt 保留 unity 概念**：unity 特有概念（PlayerLoop/URP/MonoBehaviour）可保留，但 AOE 专属业务名必须改占位符
4. **不破坏现有 perfetto 报告产出**：改完重跑 perfetto 报告，harness 全 PASS，质量不退化
5. **占位符用尖括号**：`<模块名>` / `<子模块>` / `<等待 slice>`，不用方括号或其它
6. **harness 加 prompt 文件硬编码扫描**（需求 G）：grep 到业务名/数据源特定词 = FAIL，不是 warning

## 验收 harness（必填，开发 agent 完成前自己跑通）

**通用 harness**（重跑 perfetto 报告，确认不退化）：
```
cd web && npx tsx server/prism/harness.ts --source perfetto --dir data/prism-out/bk26b-perfetto-triad/2026-07-16_wt036-v5
```
期望：36 PASS / 0 FAIL / 1 WARN（和 WT-036 v5 一致，不退化）

**工单特定断言**：
```bash
# 1. narrative-prompt.txt 无业务词
grep -c "行军线\|ArmyLine\|MapSignificance\|BattleHead\|LuaMgr\|MapManager\|OutSideView" web/server/prism/prompts/narrative-prompt.txt
# 期望 0

# 2. narrative-prompt.txt 无 perfetto 特定词（Choreographer/bigCoreReach/Gfx.WaitForPresent 等）
grep -c "Choreographer\|AudioTrack\|AAudio\|bigCoreReach\|Gfx.WaitForPresent" web/server/prism/prompts/narrative-prompt.txt
# 期望 0

# 3. perfetto-multi-state.txt 无业务词（perfetto 特有概念可保留）
grep -c "行军线\|ArmyLine\|MapSignificance\|BattleHead\|LuaMgr\|MapManager\|OutSideView" web/server/prism/prompts/report-templates/perfetto-multi-state.txt
# 期望 0

# 4. unity-explore-prompt.txt 重命名成功
ls web/server/prism/prompts/unity-explore-prompt.txt
# 期望文件存在

# 5. report-pipeline.ts 路由更新
grep "unity-explore-prompt.txt" web/server/prism/report-pipeline.ts
# 期望匹配

# 6. unity-single-state.txt 模板存在
ls web/server/prism/prompts/report-templates/unity-single-state.txt
# 期望文件存在

# 7. 占位符使用（narrative-prompt.txt 含 <模块名> 或 <子模块> 等占位符）
grep -c "<模块\|<子模块\|<等待 slice\|<业务模块" web/server/prism/prompts/narrative-prompt.txt
# 期望 ≥3

# 8. harness 含 prompt 文件硬编码扫描（需求 G）
grep -c "narrative-prompt.txt 无业务名硬编码\|narrative-prompt.txt 无 perfetto 特定词\|prompt 文件硬编码" web/server/prism/harness.ts
# 期望 ≥1

# 9. dev-conventions.md 含 §6.1（需求 F，主 agent 已完成，开发 agent 确认存在即可）
grep -c "6.1 prompt 文件硬编码\|prompt 范例不许用业务名" docs/prism/memory/dev/conventions.md
# 期望 ≥1
```

**端到端冒烟**（重跑 perfetto 报告，确认数据源无关化不破坏 perfetto）：
```
cd web && npx tsx server/prism/run-perfetto-pipeline.ts --skip-explore --out data/prism-out/bk26b-perfetto-triad/wt038-verify
```
跑通后把 report.html 路径告诉主 agent，主 agent 对照 WT-036 v5 报告核结构不退化。

## 完成标准

1. 通用 harness FAIL=0（perfetto 报告不退化，且含需求 G 的 prompt 文件硬编码扫描）
2. 工单特定断言全 PASS
3. 端到端冒烟成功，perfetto report.html 产出且结构不退化
4. 把 report.html 路径 + 改动清单告诉主 agent

harness 跑不通就继续改，改到全 PASS 为止。

---

## 主 agent 验收清单

1. 独立跑一遍通用 harness + 工单特定断言
2. 打开 perfetto report.html 看结构（和 WT-036 v5 对比，不退化）
3. grep 确认 narrative-prompt.txt 无业务词 + 无 perfetto 特定词
4. 确认 unity-explore-prompt.txt 重命名 + report-pipeline.ts 路由更新
5. 确认 unity-single-state.txt 模板存在且无业务词
6. 确认 harness 含 prompt 文件硬编码扫描（需求 G）
7. 确认 dev-conventions.md §6.1 存在（需求 F，主 agent 已完成）
8. 任一不通过 = 打回

## 注意事项

- **本工单是 unity 多态接入的前置**：不修的话 narrative-prompt 的 perfetto+AOE 范例会误导 unity 多态 LLM
- **占位符不是偷懒**：教的是写法（├─/└─ 缩进 + 三态对照 + 🔴/🟡 标注 + 大头拆出），不是名字。LLM 看占位符也能学会写法
- **perfetto 特有概念在 perfetto 模板里可保留**：perfetto-multi-state.txt 是 perfetto 数据源特定模板，Choreographer/bigCoreReach 等可保留；但 narrative-prompt.txt 是数据源无关骨架，不能有这些
- **unity 特有概念在 unity prompt 里可保留**：unity-explore-prompt.txt 是 unity 数据源特定 prompt，PlayerLoop/URP 等可保留；但 AOE 专属业务名（行军线等）必须改
