# TODO-WT-042 · unity-multi-state.txt 报告模板

> 状态：TODO ｜ 里程碑：M5 多源扩展 ｜ 执行方：开发 agent（施工）+ 主 agent（验收）
>
> 前置：WT-038（数据源无关化）+ WT-039（红线归并规则）+ WT-041（DR-43 扩展覆盖 2 态）
> 开工前必读：`docs/prism/memory/methodology/multi-state.md`（DR-43 扩展后）+ `docs/prism/memory/dev/conventions.md`（§六严禁硬编码）+ perfetto-multi-state.txt（参考结构）

## 背景

概念对齐：不区分 diff 和 multi，统一叫多态。2 态是 N=2 的多态，≥3 态是 N≥3 的多态。模板用一个 unity-multi-state.txt 覆盖所有 N≥2 的情况。

unity-profiler 数据源特性（和 perfetto 不同）：
- **没有 CPU 频率/温度概念**（那是 perfetto 的）——不写降频章节
- **没有 Choreographer/Android FrameTimeline**——用 PlayerLoop 分位数
- **线程模型不同**：UnityMain / UnityGfxRenderS / Job.Worker（ECS）等，没有 AudioTrack/AAudio
- **GC 概念不同**：unity 有 GC.Alloc/GC.Collect，但没有 perfetto 的 gcAllocByModule（per-marker GC 分配需 DR-POOL-1 补）

## 必读文档

- `docs/prism/memory/methodology/multi-state.md` — DR-43 扩展后（WT-041 完成）
- `docs/prism/memory/dev/conventions.md` — §六严禁硬编码
- `web/server/prism/prompts/report-templates/perfetto-multi-state.txt` — 参考结构（WT-038 数据源无关化后）

## 任务

### 需求 A：新建 unity-multi-state.txt 模板

**文件**：`web/server/prism/prompts/report-templates/unity-multi-state.txt`（新建）

基于 DR-43 多态方法论（WT-041 扩展后），写 unity-profiler 多态报告章节模板。

章节结构（unity 多态，2 态或 ≥3 态通用）：

```
§0 结论先行（多态版，三大演化结论，四段式块）
  ① 最大涨幅模块: foldChange top 1 + 绝对增量 + 占当前 p50%
  ② 新出现瓶颈: 基线无 + 当前触红线
  ③ 退化形态: 基线健康态 → 当前病态的形态变化

§1 采集元信息（多态: 基线/当前 fps/p50/帧数对照表）
  item.visualAsset: type="table", title="采集元信息"
  表头: ["指标", "基线", "当前"]（2 态）或 ["指标", "base", "cur", "throttle"]（≥3 态）
  行: 帧数/fps/p50/p99/slowFrameRate/帧预算

§2 多线程宏观（多态: 基线/当前 run/sleep 对照 + 涨幅）
  item.visualAsset: type="table", title="多线程宏观"
  表头: ["线程", "基线 Run%", "当前 Run%", "涨幅", "关键特征", "定位"]
  行: UnityMain / UnityGfxRenderS / Job.Worker（如有）等 unity 线程
  不写 AudioTrack/AAudio（perfetto 特有）

§3 主线程一帧时间去向（多态: callTree 对照 + 红线矩阵 foldChange 列 + 下钻）
  - PlayerLoop 帧分位数对比表（基线/当前 p50/p99/slowFrameRate）
  - 主线程 callTree 缩进树（├─/└─ + 基线/当前 ms/帧 + 涨幅% + 严重程度标注）
  - 红线触发清单（按 foldChange 排序，含模块/单次/红线类型/子函数热点）
    item.visualAsset: type="table", title="红线触发清单"
  - Top 红线热点子函数下钻（每个红线模块一张卡片：单次 avg + 红线判定 + GC 归因 + 优化方向）
  - 每个红线条目都要下钻（不只 Top 1）

§4 ROI 优化方向（多态: 按 foldChange × 占 p50% 排序，优先治涨幅最大的回归）
  每条: 具体模块 + 问题 + 优化建议（基于代码/数据推理，不许套话）
```

### 需求 B：不硬写业务名

模板里所有范例用占位符：
- `<业务模块A>` / `<子模块A1>` / `<大头子模块B1>`
- `<等待 slice>` / `<线程名>`
- 不写 LuaMgr / BattleHeadMgr / 行军线 等 AOE 专属业务名

### 需求 C：不写 perfetto 特有概念

unity 模板里不写：
- Choreographer / Android FrameTimeline（perfetto+Android 特有）
- bigCoreReach / 降频矩阵 / CPU 频率（perfetto 特有，unity 没有）
- AudioTrack / AAudio（perfetto+Android 特有线程）

unity 模板里可写（unity 数据源特定）：
- PlayerLoop / MonoBehaviour / URP（unity 通用概念）
- UnityMain / UnityGfxRenderS / Job.Worker（unity 线程通用名）
- GC.Alloc / GC.Collect（unity 通用概念）

## 硬约束

1. **不硬编码业务名**：所有范例用占位符
2. **不写 perfetto 特有概念**：unity 没有 CPU 频率/温度/Choreographer，不写降频章节
3. **覆盖 2 态和 ≥3 态**：模板用一个 unity-multi-state.txt 覆盖所有 N≥2 的情况
4. **每个红线条目都要下钻**：不只 Top 1（WT-036 v4 退化教训）
5. **红线归并用新规则**：分布形态 + 语义独立性（WT-039 完成后）

## 验收 harness（必填，开发 agent 完成前自己跑通）

**工单特定断言**：
```bash
# 1. 模板文件存在
ls web/server/prism/prompts/report-templates/unity-multi-state.txt
# 期望文件存在

# 2. 无业务名硬编码
grep -c "行军线\|ArmyLine\|MapSignificance\|BattleHead\|LuaMgr\|MapManager\|OutSideView" web/server/prism/prompts/report-templates/unity-multi-state.txt
# 期望 0

# 3. 无 perfetto 特有概念
grep -c "Choreographer\|bigCoreReach\|AudioTrack\|AAudio\|降频判定矩阵" web/server/prism/prompts/report-templates/unity-multi-state.txt
# 期望 0

# 4. 含多态章节骨架
grep -c "§0\|§1\|§2\|§3\|§4" web/server/prism/prompts/report-templates/unity-multi-state.txt
# 期望 ≥5

# 5. 含红线归并新规则
grep -c "分布形态\|语义独立性" web/server/prism/prompts/report-templates/unity-multi-state.txt
# 期望 ≥1

# 6. 含占位符
grep -c "<模块\|<子模块\|<等待 slice\|<业务模块" web/server/prism/prompts/report-templates/unity-multi-state.txt
# 期望 ≥3
```

**端到端冒烟**：本工单只建模板文件，不跑报告。但要确认模板能被 narrative-prompt 的 {{REPORT_TEMPLATE}} 注入机制读到。

## 完成标准

1. 工单特定断言全 PASS
2. unity-multi-state.txt 模板存在，章节骨架完整（§0-§4）
3. 无业务名硬编码 + 无 perfetto 特有概念
4. 把改动清单告诉主 agent

---

## 主 agent 验收清单

1. 读 unity-multi-state.txt 确认章节骨架完整
2. grep 确认无业务名 + 无 perfetto 特有概念
3. 确认占位符使用合理
4. 确认红线归并用新规则（分布形态 + 语义独立性）
5. 任一不通过 = 打回

## 注意事项

- **依赖 WT-038/039/041**：数据源无关化 + 红线归并新规则 + DR-43 扩展覆盖 2 态，三个前置完成后再做本工单
- **不写降频章节**：unity 没有 CPU 频率/温度概念，不写 perfetto 的 §4 降频时序
- **2 态和 ≥3 态通用**：模板用一个文件覆盖，不区分 diff 还是 multi
