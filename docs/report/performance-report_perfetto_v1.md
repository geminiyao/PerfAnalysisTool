# 系统调度性能分析报告 · perfetto 单源

> **结论**: 本次系统级 trace(机型 PAL-AL00,场景 `StressTestBattleSimpleMode`,~2.4s 窗口)给出了前两源都给不出的关键定性:**主线程 UnityMain 有 92.55% 的时间在 Running(实际占用 CPU 执行),只有 6.19% 在睡** —— **瓶颈是主线程的真实 CPU 计算量,不是 GPU 等待、锁竞争或 vsync 空转。** 进一步拆开主线程一帧(atrace PlayerLoop 子树):**脚本 Update 28.6% + LateUpdate 11.4%(脚本合计约 40%)、FinishFrameRendering 26.7%、UI Canvas 更新 5.8%**。渲染线程 UnityGfxRenderS 仅 15.88% Running(77.5% 在睡)→ **渲染线程不是瓶颈**,印证瓶颈在主线程逻辑侧。
>
> 降频:**未发现明确降频(level=none,[推测]级)** —— 大核平均频率达观测峰值的 82.5%(2.43/2.84 GHz)。但**确认级降频判定需 sysfs 旁路(`scaling_max_freq` vs `cpuinfo_max_freq`/cooling),本样本无 `thermal_*.txt`,故只能给推测级**。
>
> 数据源:仅 `perfetto`(系统调度视角,回答"线程在算还是在等、系统有无干扰")。**帧口径是 Choreographer(显示 60Hz 节拍 16.66ms),≠ PlayerLoop 26ms,禁止直比**(契约硬规则)。局限:未做战斗窗裁剪(全 trace 区间)、设备无 GPU 频率计数器、无 FrameTimeline → 显示链路掉帧无法量化。相关处均已标注。

---

## 一、概览

| 维度 | 数值 | 证据 key / 出处 |
|------|------|----------------|
| 场景 / 时长 | StressTestBattleSimpleMode / ~2.4s 窗口 | `meta` + `detail.perfetto.profileWindow` |
| **主线程 Running** | **92.55%** | `thread.UnityMain.runningPct` |
| 主线程 Runnable / Sleeping | 1.18% / 6.19% | `thread.UnityMain.runnablePct` / `sleepingPct` |
| 渲染线程 Running | 15.88%(睡 77.5%) | `thread.UnityGfxRenderS.runningPct` |
| CPU 频率均值 | 1560.2 MHz | `system.cpuFreqAvgMhz` |
| 大核频率可达率 | 82.5%(2.43/2.84 GHz) | `detail.perfetto.throttling.bigCoreReachPct` |
| 降频判定 | none（[推测]级；确认级缺 sysfs） | `detail.perfetto.throttling` |
| 帧节拍(Choreographer) | p50 16.66ms / fps 60.1 | `frame[perfetto] (frameDefinition=choreographer)` |
| Binder / PSS | 2 次 / 19.6MB | `system.binder.count` / `system.pssMb` |
| 解析状态 | partial（见局限） | `detail.perfetto.parseStatus` |

---

## 二、核心结论（问题先行）

**这份报告解决了前两源悬而未决的那个问题：主线程到底是在算，还是在等？答案是——在算。**

- unity_profiler 看到"帧 26ms、主线程被脚本+渲染占满"，但它**无法区分主线程是 CPU 忙还是在等 GPU/锁**。
- simpleperf 看到"UnityMain 占 CPU 41.8%"，但它是**采样占比，也答不了"在算 vs 在等"**，且 anchor 子树分析在该样本失败（栈未回溯到引擎入口）。
- **perfetto 用线程调度状态一锤定音：UnityMain 92.55% Running → 主线程是 CPU-bound（计算受限），优化主线程计算量就是正确方向。**

且 perfetto 的 atrace slice 树**恰好补上了 simpleperf anchor 失败的那块**——主循环各阶段的子树占比（见 §三）。

---

## 三、主线程一帧时间都去哪了（atrace PlayerLoop 子树）

> 判定依据：`detail.perfetto.callTrees[UnityMain]`，按 PlayerLoop 子树各阶段 totalPct（占主线程总时间）。这是"主循环各阶段子树占比"，正是 simpleperf anchor 想给但没给成的维度。

| 阶段 | 占主线程 | 层 | 说明 |
|------|---------|----|------|
| `Update.ScriptRunBehaviourUpdate` | **28.6%** | 业务 | C# 脚本 Update（与 unity BehaviourUpdate 8ms / simpleperf 主线程脚本印证） |
| `PostLateUpdate.FinishFrameRendering` | **26.7%** | 业务 | 帧渲染收尾（剔除/批处理/渲染提交在主线程的部分） |
| `PreLateUpdate.ScriptRunBehaviourLateUpdate` | **11.4%** | 业务 | C# 脚本 LateUpdate |
| `PostLateUpdate.PlayerUpdateCanvases` | **5.8%** | 业务 | UGUI Canvas 重建/更新 |
| `PostLateUpdate.PlayerSendFrameComplete` | 3.9% | 业务 | 帧提交完成 |

- **脚本合计约 40%（Update 28.6% + LateUpdate 11.4%）**：这是主线程头号开销，与 unity 报告的 `BehaviourUpdate` + simpleperf 的主线程业务热点（`MUIControlManager.OnLateUpdate`/Lua）三源一致。**建议**：优先削减每帧脚本计算（高频 Update 逻辑、3D 跟随 UI 布局）。
- **`FinishFrameRendering` 26.7%**：主线程花了约 1/4 帧在渲染收尾。[推断] 由于渲染线程仅 15.88% Running（大量在睡），这部分更可能是**主线程侧的剔除/批处理/命令构建 CPU 工作**，而非阻塞等渲染线程。需结合 `Camera.Render` 子段进一步定位。
- **`PlayerUpdateCanvases` 5.8%**：UGUI Canvas 更新开销，与 simpleperf 的 MUI/UI 热点同源 → UI 重建是确定的优化点。

---

## 四、降频分析（[推测]级；确认级数据缺失）

> 判定依据：`降频观测指南.md` 两级判定。**确认级**需 sysfs（`scaling_max_freq < cpuinfo_max_freq` 或 cooling state>0），来自采集旁路 `thermal_before/after.txt`；**本样本无该旁路文件,故只能出推测级**。perfetto 记的是 `scaling_cur_freq`(实际频率),不是限制上限。

| 核组 | 平均频率 | 观测峰值 | 可达率 |
|------|---------|---------|--------|
| 小核 cpu0-3 | 1353 MHz | 1805 MHz | 75.0% |
| 中核 cpu4-6 | 1583 MHz | 1997 MHz | 79.3% |
| 大核 cpu7 | 2436 MHz | 2842 MHz | 85.7% |

- **判定 level=none**：主线程虽 CPU-bound（Running 92.55%），但大核平均频率达观测峰值的 82.5%(≥80% 阈值)，未触发"负载-频率背离"或"持续低频"的推测信号。
- **诚实标注**：观测峰值 ≠ 硬件理论 max（无 `cpuinfo_max_freq`）。若该机大核理论 max 高于 2.84GHz，则存在被锁频可能，**当前数据无法确认**。要下确认级结论，需在采集时带 `record_tmaoe_thermal.bat` 抓 sysfs 旁路。
- 因 level=none，**本报告未对帧结论做降频折扣**。

---

## 五、帧口径说明（重要，防误读）

- 本源帧分布 = **Choreographer#doFrame 间隔**：p50 16.66ms ≈ 60Hz 显示节拍,fps 60.1。
- **这 ≠ 应用 PlayerLoop 帧耗时（26ms）**。Choreographer 是显示刷新信号；应用一帧实际 26ms（见 atrace `PlayerLoop` avg 26.04ms，与 unity 26.9ms 一致）。两者**禁止直比**（契约 §7 硬规则）。
- `slowFrameRate=0` 是 doFrame 间隔法的局限（间隔恒为节拍）；**真正的显示掉帧需 FrameTimeline（expected vs actual），本 trace 未含 `actual_frame_timeline_slice` → 无法量化 VSync miss**。

---

## 六、三源交叉印证（同一次 base 采集）

| 指标 | unity_profiler | simpleperf | perfetto |
|---|---|---|---|
| PlayerLoop 帧耗时 | 26.9ms | — | atrace **26.04ms** ✓ |
| 脚本 Update | BehaviourUpdate 8.02ms | 主线程业务热点 | atrace BehaviourUpdate **7.67ms** + 子树 28.6% ✓ |
| GC.Collect | 命中帧 ~8.1ms | `GC_end_stubborn_change` native | atrace GC.Collect 20 次 **avg 8.09ms** ✓ |
| 主线程性质 | 被脚本+渲染占满 | 占 CPU 41.8% | **Running 92.55% → CPU-bound**（独有定性）✓ |
| UI 开销 | MeshUIManager 等 | MUIControlManager/MUILayout | PlayerUpdateCanvases 5.8% ✓ |

三源在帧/脚本/GC/UI 上高度一致 → 结论高置信。perfetto 的独有贡献：**确认 CPU-bound + 给出主循环阶段占比**。

---

## 七、本源能力边界（单源局限）

| 想回答的问题 | perfetto 能否回答 | 备注 |
|------------|-----------------|------|
| 主线程在算还是在等 | ✅ 可（92.55% Running = 在算） | 本报告核心 |
| 主循环各阶段占比 | ✅ 可（atrace slice 树） | 补 simpleperf anchor 缺口 |
| 是否降频 | ⚠️ 仅推测级（none） | 确认级需 sysfs 旁路 `thermal_*.txt` |
| GPU 是否瓶颈 | ❌ 设备无 GPU 频率计数器；GpuQueue 也未采到 busy | 需带 GPU counter 重采 |
| 显示链路掉帧 / VSync miss | ❌ trace 无 FrameTimeline | 采集需开 `actual_frame_timeline` |
| 哪个 native 函数热 | ❌ 非函数级（那是 simpleperf） | — |

> **窗口偏差提醒**：未找到 `CombinedProfile` 色块，采用全 trace 区间（含进入战斗前的非稳态段）。战斗窗裁剪后数字会更准（已登记为增强项）。

---

## 八、优化建议汇总（结合三源，按 ROI）

1. **主线程脚本削减（~40%）** —— 三源一致指向的头号问题：高频 Update/LateUpdate、3D 跟随 UI 布局、Lua 热点。
2. **`FinishFrameRendering` 26.7% 定位** —— 主线程渲染收尾占比偏高，查剔除/批处理/SRP 命令构建。
3. **UGUI Canvas 更新（5.8%）** —— 减少 Canvas 重建（拆分动静 Canvas、避免每帧 dirty）。
4. **削减 GC 分配 + 关 atrace 埋点** —— 来自 unity/simpleperf 跨源结论。
5. **补采以解锁缺失维度** —— 带 sysfs 旁路（确认降频）+ GPU counter（GPU 瓶颈）+ FrameTimeline（显示掉帧）重采一次。

---

## 九、自检（质量门 §6）
- [x] 问题导向（主线：CPU-bound → 阶段拆解 → 建议）
- [x] 结论先行（顶部普通话结论）
- [x] 完整证据链（每条挂 `thread.*`/`system.*` key 或 `detail.perfetto.callTrees` 路径）
- [x] 判定依据透明（调度占比/频率可达率/子树占比均引数值）
- [x] 可执行建议（脚本削减/渲染收尾定位/Canvas/补采）
- [x] `[推断]` 标注（FinishFrameRendering 性质、理论 max 频率）
- [x] 不编造（所有数值来自 `perfetto-profile.json`）
- [x] 降频/可信度：降频显式标 [推测]级 + 缺确认级数据；帧口径显式标 ≠ playerloop；窗口未裁、GPU/FrameTimeline 缺失均已说明

---

> 数据产物：`output/p1-perfetto/perfetto-profile.json`(16 指标 + detail.callTrees/throttling/atraceSlices)、`perfetto-profile-summary.json`(AI 摘要)。入库:`runs` 1 行(sources=["perfetto"]) + `run_metrics` 16 行(thread.* 12 + system.* 4) + raw .pftrace(63.9MB) 登记为 Asset。**至此 base 同次采集三源(unity_profiler/simpleperf/perfetto)均已入库,为 P4 多源关联就绪。**
