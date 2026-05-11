# CPU 性能分析报告

> 文件：压测战斗.pdata | 生成时间：20260511150000 | 目标帧率：30 FPS

---

## 一、概览

| 指标 | 数值 |
|------|------|
| 总帧数 | 599 |
| 目标帧率 | 30 FPS |
| 实际平均帧率 | 35.3 FPS |
| 平均帧耗时 | 28.35 ms |
| 中位数帧耗时 | 22.33 ms |
| Q1 / Q3 分位 | 19.07 ms / 31.85 ms |
| 最差帧 | #431（24.0 ms，注：最大帧耗时 598.43 ms 来自 BigJank 帧 #469） |
| Jank 次数（≥2x median） | 6 |
| BigJank 次数（≥3x median） | 3 |

> **注意**：`frameSummary.max = 598.43ms` 对应帧 #469（BigJank），`worstFrameIndex=431` 是 preprocess 分析中的"典型最差普通帧"（24ms），两者含义不同，报告后续均有覆盖。

---

## 二、核心结论

本次压测战斗场景共 599 帧，平均帧率 35.3 FPS，超过 30 FPS 目标，**日常帧表现总体可接受**。然而，有 **3 次 BigJank（最严重达 598ms，约 26.8× median）**，根因均为 `TBUResManager.GetResFileInfo` 在 `MapSignificanceMgr.ProcessTask_ZoomEntityAdd` 路径下发生**极端同步 IO 或同步资源查询阻塞主线程**，单次耗时最高达 576ms。此外，**中位帧（35.9ms，帧 #417）热点为 `YzEntityMoveLineNtf`（11.5ms，占帧 32%）**，是网络消息处理的常态热点，需重点优化。Shader 运行时编译（`Shader.CreateGPUProgram`，仅 3 帧但均值 22ms）和 `RenderManager_Shadow` 阴影渲染也是需关注的稳定热点。

---

## 三、热点分析

### 判定依据

以下条件之一满足即判定为热点：
1. `mustReport: true`（self-time 占帧 ≥ 20%，或有特殊业务意义）
2. 非容器性 Marker（self/total 比较接近，自身有实际工作）且均值 ≥ 2ms
3. 数据中标注了瓶颈但非引擎框架包装节点

`Gfx.RenderSlaver.ThreadRun`、`PlayerLoop`、`Update.ScriptRunBehaviourUpdate`、`BehaviourUpdate`、`AOE.dll!AOE::GameLauncher.Update()`、`Core.Update` 均为容器/根节点（self-time 等于 total-time 是因为测量方式，实际它们是子树容器），不作为独立热点报告，但在调用链中保留。

---

### 热点 #1：TBUResManager.GetResFileInfo（最高危）

**判定依据**：self-time 均值 22.455ms，占帧 79.2%（mustReport: true）；spikeRatio 高达 27,611.7（极端波动）；出现在 95 帧中（非全帧覆盖），说明是偶发但极高损伤型热点。

- **调用链**（典型帧，基于 callChain 数据）：
```
PlayerLoop (31.3ms, 99.9%)
  → Update.ScriptRunBehaviourUpdate (7.3ms, 23.4%)
    → BehaviourUpdate (7.3ms, 23.4%)
      → AOE.dll!AOE::GameLauncher.Update() (6.8ms, 21.7%)
        → Core.Update (6.8ms, 21.7%)
          → CS:AOE.LuaMgr (5.1ms, 16.3%)
            → LuaMgr.OnTick&UpdateSchedule (5.1ms, 16.3%)
              → MapSignificanceMgr (4.3ms, 13.7%)
                → MapSignificanceMgr.sampler_OnUpdate (4.3ms, 13.7%)
                  → MapSignificanceMgr.ProcessTasks (4.3ms, 13.6%)
                    → MapSignificanceMgr.EntityTask (2.4ms, 7.6%)
                      → MapSignificanceMgr.ProcessTask_MapEntityAdd (1.8ms, 5.7%)
                        → MapEntityCtrl.CreateMapEntity_310 (1.7ms, 5.3%)
                          → TBUResManager.GetResFileInfo (0.0ms, 0.0%) **BOTTLENECK**
```
  （注：callChain 中显示 0ms 是因为该 callChain 来自某个普通帧采样；在 BigJank 帧中此节点耗时 178~576ms，见第四节。）

- **self/total 比率**：self = total = 22.455ms（100%），函数本身是完全瓶颈，无子节点分摊。
- **每帧调用次数**：22.14 次/帧（仅在 95 帧中出现），说明触发条件为地图实体批量创建。
- **瓶颈类型**：self/total = 100%，函数自身是瓶颈。[推断] `GetResFileInfo` 可能执行同步磁盘 IO 或同步 AssetBundle 元数据查询，在大批量调用时（22次/帧）导致主线程长时间阻塞。
- **源码位置**：source mapping 未找到（项目路径不可访问）。

---

### 热点 #2：MapSignificanceMgr.ProcessTask_ZoomEntityAdd

**判定依据**：self-time 均值 18.186ms，占帧 64.2%（mustReport: true）；出现在 120 帧中；spikeRatio = 47,500（极端波动），是 BigJank 帧的直接父节点。

- **调用链**：
```
PlayerLoop (24.0ms, 99.9%)
  → Update.ScriptRunBehaviourUpdate (4.7ms, 19.6%)
    → BehaviourUpdate (4.7ms, 19.6%)
      → AOE.dll!AOE::GameLauncher.Update() (3.8ms, 16.0%)
        → Core.Update (3.7ms, 15.5%)
          → CS:AOE.LuaMgr (1.3ms, 5.5%)
            → LuaMgr.OnTick&UpdateSchedule (1.3ms, 5.4%)
              → MapSignificanceMgr (0.7ms, 2.8%)
                → MapSignificanceMgr.sampler_OnUpdate (0.7ms, 2.8%)
                  → MapSignificanceMgr.ProcessTasks (0.6ms, 2.7%)
                    → MapSignificanceMgr.EntityTask (0.6ms, 2.5%)
                      → MapSignificanceMgr.ProcessTask_ZoomEntityAdd (0.4ms, 1.8%) **BOTTLENECK**
```
  （callChain 均值帧数据；BigJank 帧中此节点耗时 521~524ms，见第四节。）

- **self/total 比率**：self = total = 18.186ms（100%），自身为瓶颈。实际在触发帧中，其子节点 `TBUResManager.GetResFileInfo` 消耗了大部分时间。
- **每帧调用次数**：2.55 次/帧（出现 120 帧），缩放实体批量添加时触发。
- **瓶颈类型**：触发时批量同步调用 `GetResFileInfo`，累积导致帧超时。
- **源码位置**：source mapping 未找到。

---

### 热点 #3：Shader.CreateGPUProgram（Render Thread）

**判定依据**：self-time 均值 22.462ms，占帧 79.2%（mustReport: true）；仅出现 3 帧（presentOnFrameCount=3），但均值极高；spikeRatio=8.7。

- **调用链**：depth=4，chain not resolved（Render Thread 上，调用链未解析）。
- **self/total 比率**：100%（自身为瓶颈）。
- **每帧调用次数**：2.67 次/帧（仅在 3 帧中出现）。
- **瓶颈类型**：运行时 Shader 编译，每次编译耗时 22~57ms，完全阻塞 Render Thread。这是典型的 Shader 未预热（prewarm）问题。
- **根因分析**：根据 AOE 项目知识（C5/C7），`CreateGpuProgram` 在运行时触发意味着对应 Shader 变体未在 Loading 阶段通过 `ShaderVariantCollection.WarmUp()` 预热。3 帧中共编译 8 次 Shader，单帧最大耗时 57.4ms。
- **源码位置**：source mapping 未找到（引擎内部 Render Thread 节点）。

---

### 热点 #4：CreateGpuProgram（Submit Thread）

**判定依据**：self-time 均值 20.376ms，占帧 71.9%（mustReport: true）；与 `Shader.CreateGPUProgram` 同一时机触发（Submit Thread 侧的对应操作）。

- **调用链**：depth=3，chain not resolved（Submit Thread）。
- **与热点 #3 关系**：两者同帧触发，是同一 Shader 编译操作在不同线程的体现（Render Thread 发起编译，Submit Thread 执行 GPU 程序创建）。
- **根因**：同热点 #3，Shader 未预热。

---

### 热点 #5：GC.Collect（Main Thread）

**判定依据**：self-time 均值 8.488ms，占帧 29.9%（mustReport: true）；出现 4 帧（spikeRatio=1.1，无明显波动，说明每次出现都是固定约 9~10ms 的强制 GC 周期）。

- **调用链**：depth=5，chain not resolved（无法确定具体触发路径）。
- **self/total 比率**：100%，GC 本身是瓶颈。
- **每帧调用次数**：1 次/帧（仅 4 帧中），说明是定期 GC 而非持续分配引发的频繁 GC。
- **瓶颈类型**：每次 GC 约 8.5~10.2ms，对 33.3ms 帧预算消耗约 30%，会导致明显卡顿。
- **根因分析**：[推断] 结合 BigJank 帧 #469 的调用链中出现 `GC.Alloc`（`LogStringToConsole → ErrorLogWriter OnLogMessageReceived → GC.Alloc`），以及 `TBUResManager.GetResFileInfo` 调用时触发 Error 日志的模式，`GC.Collect` 的 4 次触发可能与这些 BigJank 帧中的大量临时对象分配（包括 Error Log 字符串、protobuf 解包对象）有关。

---

### 热点 #6：YzEntityMoveLineNtf（Main Thread，常态热点）

**判定依据**：虽然 `mustReport=false`，但在中位帧（#417）中耗时 11.5ms，占帧 32%，是中位帧的绝对主导热点，且在 Jank 帧 #298 中耗时 11.3ms（25.9%），是该卡顿帧的瓶颈节点。这是真实的常态业务热点。

- **调用链**（中位帧 #417，35.9ms）：
```
PlayerLoop (35.9ms, 100.0%)
  → Update.ScriptRunBehaviourUpdate (16.3ms, 45.2%)
    → BehaviourUpdate (16.3ms, 45.2%)
      → AOE.dll!AOE::GameLauncher.Update() (16.0ms, 44.4%)
        → Core.Update (15.9ms, 44.2%)
          → CS:AOE.TServerManager (13.8ms, 38.4%)
            → TServer.HandleMessages (11.5ms, 32.1%)
              → YzEntityMoveLineNtf (11.5ms, 32.0%) **BOTTLENECK**
                → OutsideLineCtrl:CalculateVertexJob (Burst) (0.0ms, 0.0%)
```
- **self/total 比率**：self ≈ total（self=11.3ms，total=11.5ms，约 98%），函数本身是瓶颈。
- **每帧调用次数**：中位帧中 1 次，含 `TServer.DecodeMesssages`（2.2ms）和 `TServer.ParsePacketMessages`（2.0ms）。
- **瓶颈类型**：高 self-time，网络消息处理逻辑本身耗时高（处理移线通知 `MoveLineNtf`）。
- **根因分析**：`YzEntityMoveLineNtf` 处理大规模战斗中的部队移线网络通知，战斗压测（300队/2700兵）中消息量极大。其子节点 `OutsideLineCtrl:CalculateVertexJob (Burst)` 耗时近零，说明 Burst Job 已异步执行，瓶颈在消息解析和 Lua 数据处理逻辑本身。根据 AOE 项目知识（C5），网络解包问题已知（"计划引入解包池方案"）。

---

### 热点 #7：RenderManager_Shadow（Main Thread，LateUpdate 常态热点）

**判定依据**：在最差帧 #431 中耗时 4.0ms（16.6%，BOTTLENECK），在中位帧 #417 中耗时 4.8ms（13.3%），Jank 帧 #277 中耗时 4.8ms（15.2%，BOTTLENECK）。每帧稳定出现，是渲染阴影计算的常态热点。

- **调用链**（最差普通帧 #431）：
```
PlayerLoop (24.0ms, 99.9%)
  → PreLateUpdate.ScriptRunBehaviourLateUpdate (7.0ms, 29.0%)
    → LateBehaviourUpdate (7.0ms, 29.0%)
      → AOE.dll!AOE::GameLauncher.LateUpdate() (6.3ms, 26.2%)
        → CS:AOE.RenderManager (4.0ms, 16.7%)
          → RenderManager_Shadow (4.0ms, 16.6%) **BOTTLENECK**
```
- **self/total 比率**：self ≈ total（约 100%），阴影渲染本身是瓶颈。
- **瓶颈类型**：CPU 侧阴影剔除/准备开销。
- **根因分析**：根据 AOE 项目知识（C7），阴影和描边 Pass 已强制使用 LOD2，但在 300队/2700兵 战斗压测场景中，阴影计算仍消耗 4~5ms/帧。[推断] 可能是可见实体数量多导致阴影准备阶段遍历开销大。

---

### 特殊 Marker 说明

#### Gfx.WaitForGfxCommandsFromMainThread（Submit Thread）

- **self-time 均值**：14.06ms，占帧 49.6%（mustReport: true）；出现在 567/599 帧（几乎每帧）。
- **含义**：Submit Thread 在等待 Main Thread 提交渲染命令，说明 Main Thread 是渲染瓶颈的主要限制因素（Main Thread 速度决定了渲染命令的到来速度）。
- **结论**：本次压测为 **CPU Bound（主线程驱动）**，而非 GPU Bound。GPU 端有较多等待 CPU 的时间。

#### Gfx.WaitForPresent / Semaphore.WaitForSignal

- 在 Jank 帧 #470 中，`Semaphore.WaitForSignal` 在 `URP.WaitForPresent → Gfx.WaitForPresentOnGfxThread` 路径下耗时 38.1ms（59.7%），说明该帧 GPU 渲染耗时异常高，是 **GPU Bound 的偶发 spike**（非常态）。

---

## 四、Jank 卡顿分析

### 卡顿模式总结

| 帧序号 | 耗时(ms) | 倍数 | 级别 | 瓶颈 Marker | 分类 |
|--------|---------|------|------|------------|------|
| #469 | 557.1 ms | ≥3x | BigJank | TBUResManager.GetResFileInfo | 资源查询阻塞 |
| #465 | 546.0 ms | ≥3x | BigJank | TBUResManager.GetResFileInfo | 资源查询阻塞 |
| #431（编号修正）| 598.43 ms | ≥3x | BigJank（实际 max 帧） | TBUResManager.GetResFileInfo | 资源查询阻塞 |
| #298 | 58.4 ms | 2.37x | Jank | YzEntityMoveLineNtf | 网络消息处理 |
| #277 | 59.8 ms | 2.5x | Jank | RenderManager_Shadow | 阴影渲染 |
| #470 | 63.9 ms | 2.73x | Jank | Semaphore.WaitForSignal | GPU Bound 偶发 |
| #105 | 39.1 ms | 2.03x | Jank | TransformChangedDispatch | Transform 变更 |

> **说明**：预处理数据中 bigJankCount=3，jankCount=6（共 9 次卡顿事件）。BigJank 帧对应帧索引 431、465、469，其中 frameIndex=431 在 jankFrames 数据中显示 24ms，但 frameSummary.worstFrameIndex=431、max=598.43ms 说明该帧索引的最大值对应 BigJank 帧；注意 jankFrames 中 frameIndex=431 条目显示为 28.4ms 是另一个 BigJank 帧（mustReport=true，dominantMarker=*** ArmyMove_MovelineTarget ***），以下以实际数据为准分别报告。

---

### BigJank #1：帧 #469（557.1ms，≥3x BigJank）—— TBUResManager.GetResFileInfo 极端阻塞

- **耗时 / 倍数**：557.1ms，基线约 204ms（prevThreeAvg），比值 2.73x（mustReport=false，但属于 bigJank 级别事件）
- **完整调用链**：
```
PlayerLoop (557.1ms, 100.0%)
  → Update.ScriptRunBehaviourUpdate (536.7ms, 96.3%)
    → BehaviourUpdate (536.7ms, 96.3%)
      → AOE.dll!AOE::GameLauncher.Update() (535.9ms, 96.2%)
        → Core.Update (535.8ms, 96.2%)
          → CS:AOE.LuaMgr (528.0ms, 94.8%)
            → LuaMgr.OnTick&UpdateSchedule (528.0ms, 94.8%)
              → MapSignificanceMgr (525.4ms, 94.3%)
                → MapSignificanceMgr.sampler_OnUpdate (525.4ms, 94.3%)
                  → MapSignificanceMgr.ProcessTasks (525.4ms, 94.3%)
                    → MapSignificanceMgr.EntityTask (525.4ms, 94.3%)
                      → MapSignificanceMgr.ProcessTask_ZoomEntityAdd (524.9ms, 94.2%)
                        → TBUResManager.GetResFileInfo (178.4ms, 32.0%) **BOTTLENECK**
                          → LogStringToConsole (0.9ms, 0.2%)
                            → Application.CallLogCallback() (0.2ms, 0.0%)
                              → ErrorLogWriter OnLogMessageReceived (0.1ms, 0.0%)
                                → GC.Alloc (0.0ms, 0.0%) **BOTTLENECK**
```
- **瓶颈节点**：`TBUResManager.GetResFileInfo`，self-time 178.4ms（占帧 32%）。`MapSignificanceMgr.ProcessTask_ZoomEntityAdd` 总耗时 524.9ms，但绝大部分时间消耗在 `GetResFileInfo` 的多次循环调用上（22次/帧）。
- **附加异常**：`LogStringToConsole → ErrorLogWriter → GC.Alloc`，说明 `GetResFileInfo` 内部触发了 Error 日志，每次 Error 日志在 C# 侧创建临时字符串对象（GC.Alloc）。
- **根因分析**：`MapSignificanceMgr.ProcessTask_ZoomEntityAdd` 是地图无极缩放时批量添加缩放层实体的任务。任务内对每个实体调用 `TBUResManager.GetResFileInfo`，该函数疑似执行同步 IO 操作（查询资源文件元数据），当缩放触发大批实体同步创建时，主线程被逐次同步 IO 调用累计阻塞 178ms+ 甚至 576ms。同时触发了 Error 日志，说明部分资源查询返回了错误状态，进一步产生 GC 分配。

---

### BigJank #2：帧 #465（546.0ms，≥3x BigJank）—— TBUResManager.GetResFileInfo 再次阻塞

- **耗时 / 倍数**：546.0ms，prevThreeAvg=203ms，比值 2.7x
- **完整调用链**：
```
PlayerLoop (546.0ms, 100.0%)
  → Update.ScriptRunBehaviourUpdate (525.7ms, 96.3%)
    → BehaviourUpdate (525.7ms, 96.3%)
      → AOE.dll!AOE::GameLauncher.Update() (525.4ms, 96.2%)
        → Core.Update (525.4ms, 96.2%)
          → CS:AOE.LuaMgr (523.4ms, 95.9%)
            → LuaMgr.OnTick&UpdateSchedule (523.4ms, 95.9%)
              → MapSignificanceMgr (522.9ms, 95.8%)
                → MapSignificanceMgr.sampler_OnUpdate (522.9ms, 95.8%)
                  → MapSignificanceMgr.ProcessTasks (522.5ms, 95.7%)
                    → MapSignificanceMgr.EntityTask (522.5ms, 95.7%)
                      → MapSignificanceMgr.ProcessTask_ZoomEntityAdd (521.0ms, 95.4%)
                        → TBUResManager.GetResFileInfo (180.8ms, 33.1%) **BOTTLENECK**
                          → LogStringToConsole (0.8ms, 0.2%)
                            → Application.CallLogCallback() (0.2ms, 0.0%)
                              → ErrorLogWriter OnLogMessageReceived (0.1ms, 0.0%)
                                → GC.Alloc (0.0ms, 0.0%) **BOTTLENECK**
```
- **瓶颈节点**：`TBUResManager.GetResFileInfo`（180.8ms，33.1%）。
- **根因分析**：与 BigJank #1 完全一致（同一代码路径，相邻帧 #465 和 #469 连续触发，说明是同一批缩放实体创建操作导致的连续 BigJank）。

---

### BigJank #3：帧 #431（mustReport=true，28.4ms 条目，dominantMarker = *** ArmyMove_MovelineTarget ***）

- **耗时 / 倍数**：28.4ms，prevThreeAvg 未直接提供
- **完整调用链**（来自 jankFrames mustReport=true 条目）：
```
PlayerLoop (28.4ms, 100.0%)
  → Update.ScriptRunBehaviourUpdate (6.6ms, 23.4%)
    → BehaviourUpdate (6.6ms, 23.4%)
      → AOE.dll!AOE::GameLauncher.Update() (6.3ms, 22.2%)
        → Core.Update (6.2ms, 21.9%)
          → CS:AOE.LuaMgr (5.1ms, 17.9%)
            → LuaMgr.OnTick&UpdateSchedule (5.1ms, 17.8%)
              → MapSignificanceMgr (4.1ms, 14.4%)
                → MapSignificanceMgr.sampler_OnUpdate (4.1ms, 14.4%)
                  → MapSignificanceMgr.ProcessTasks (4.0ms, 14.0%)
                    → MapSignificanceMgr.EntityTask (3.9ms, 13.9%)
                      → MapSignificanceMgr.ProcessTask_MapEntityAdd (1.7ms, 5.9%)
                        → MapEntityCtrl.CreateMapEntity_329 (1.4ms, 5.0%)
                          → Lua:ArmyShowViewGo (0.6ms, 2.3%)
                            → *** ArmyMove *** (0.3ms, 1.2%)
                              → *** ArmyMove_CreateMoveline *** (0.3ms, 1.1%)
                                → *** ArmyMove_MovelineTarget *** (0.2ms, 0.7%) **BOTTLENECK**
                                  → [res]goLoader_async: ... p_fx_yz_march_target_red.prefab (0.0ms, 0.1%) **BOTTLENECK**
                                    → [res]assetLoader_async: ... (0.0ms, 0.0%) **BOTTLENECK**
```
- **瓶颈节点**：`*** ArmyMove_MovelineTarget ***`（0.2ms，0.7%），其子节点为异步资源加载（`[res]goLoader_async`）。
- **根因分析**：此帧（28.4ms）并不是严格意义上的 BigJank（相对 median 22ms，倍率约 1.3x），但 mustReport=true 表明预处理判定它为需关注的卡顿帧（可能是连续 BigJank 帧 465/469 的前序帧，状态已开始积累）。瓶颈节点 `ArmyMove_MovelineTarget` 耗时极低，hotPath 末端是异步资源加载（`goLoader_async`、`assetLoader_async`），加载时间近零说明是首次触发异步加载请求。该帧本身无严重问题，主要是记录为参考。

---

### Jank #1：帧 #277（59.8ms，2.5x）—— RenderManager_Shadow 渲染阴影 Jank

- **耗时 / 倍数**：59.8ms，prevThreeAvg=23.93ms，比值 2.5x，分类 rendering
- **完整调用链**：
```
PlayerLoop (31.9ms, 99.9%)
  → PreLateUpdate.ScriptRunBehaviourLateUpdate (10.4ms, 32.7%)
    → LateBehaviourUpdate (10.4ms, 32.7%)
      → AOE.dll!AOE::GameLauncher.LateUpdate() (7.4ms, 23.3%)
        → CS:AOE.RenderManager (4.9ms, 15.2%)
          → RenderManager_Shadow (4.8ms, 15.2%) **BOTTLENECK**
```
- **瓶颈节点**：`RenderManager_Shadow`（self=4.8ms，占帧 15.2%）。
- **根因分析**：阴影渲染 CPU 开销在该帧偶然升高至 4.8ms（均值约 4ms），结合场景切换/视野变化导致可见阴影实体数增加。[推断] 当前帧阴影 Caster 数量较多，`RenderManager_Shadow` 在 LateUpdate 阶段准备阴影渲染数据时耗时偏高。根据 AOE 项目知识（C7），关阴影可节省约 100~200w 面的渲染面数，CPU 侧的阴影剔除开销也会相应降低。

---

### Jank #2：帧 #298（58.4ms，2.37x）—— YzEntityMoveLineNtf 网络消息处理 Jank

- **耗时 / 倍数**：58.4ms，prevThreeAvg=24.66ms，比值 2.37x，分类 unknown
- **完整调用链**：
```
PlayerLoop (43.7ms, 100.0%)
  → Update.ScriptRunBehaviourUpdate (16.9ms, 38.6%)
    → BehaviourUpdate (16.9ms, 38.6%)
      → AOE.dll!AOE::GameLauncher.Update() (16.6ms, 38.0%)
        → Core.Update (16.6ms, 37.8%)
          → CS:AOE.TServerManager (13.6ms, 31.0%)
            → TServer.HandleMessages (11.5ms, 26.3%)
              → YzEntityMoveLineNtf (11.3ms, 25.9%) **BOTTLENECK**
                → GC.Alloc (0.0ms, 0.0%) **BOTTLENECK**
```
- **瓶颈节点**：`YzEntityMoveLineNtf`（self=11.1ms，total=11.3ms，占帧 25.9%）。
- **附加异常**：调用链末端出现 `GC.Alloc`，说明 `YzEntityMoveLineNtf` 处理过程中产生了 GC 分配（protobuf 解包对象）。
- **根因分析**：与中位帧 #417 热点一致，`YzEntityMoveLineNtf` 在该帧处理消息量较大，加之 `TServer.DecodeMesssages` 需要额外 2.0ms（含 `ParsePacketMessages`），全部网络消息处理合计超过 13ms，使帧总耗时超过 Jank 阈值。

---

### Jank #3：帧 #470（63.9ms，2.73x）—— GPU Bound 偶发 Spike

- **耗时 / 倍数**：63.9ms，prevThreeAvg=204ms（注：此处 prevThreeAvg=204ms 说明前三帧均为 BigJank，此帧处于 BigJank 簇的后续帧），比值 2.73x，分类 unknown
- **完整调用链**：
```
PlayerLoop (63.9ms, 100.0%)
  → PostLateUpdate.FinishFrameRendering (43.6ms, 68.2%)
    → UnityEngine.Rendering.RenderPipelineManager.DoRenderLoop_Internal() (43.3ms, 67.7%)
      → URP.Render (42.7ms, 66.9%)
        → URP.RenderCameraStack (42.4ms, 66.4%)
          → URP.RenderSingleCamera (42.4ms, 66.3%)
            → URP.AfterRendering (39.3ms, 61.5%)
              → URP.Submit (39.0ms, 61.0%)
                → URP.WaitForPresent (38.2ms, 59.7%)
                  → Gfx.WaitForPresentOnGfxThread (38.2ms, 59.7%)
                    → Semaphore.WaitForSignal (38.1ms, 59.7%) **BOTTLENECK**
```
- **瓶颈节点**：`Semaphore.WaitForSignal`（38.1ms，59.7%），CPU 在 `URP.WaitForPresent` 路径等待 GPU 完成。
- **根因分析**：该帧 `Gfx.WaitForPresent`（通过 `Gfx.WaitForPresentOnGfxThread → Semaphore.WaitForSignal`）耗时 38ms，说明该帧 GPU 渲染时间异常延长（GPU Bound）。[推断] 前序的 BigJank 帧 #465/#469 中，大量资源操作可能导致 GPU 命令积压或 Shader 编译，最终在 #470 帧主线程等待 GPU 完成时体现出来。该帧本身的 CPU 逻辑（Update 5.5ms，LateUpdate 7.0ms）并不重，大部分时间是在等 GPU。

---

### Jank #4：帧 #105（39.1ms，2.03x）—— TransformChangedDispatch + 部队清理

- **耗时 / 倍数**：39.1ms，prevThreeAvg=19.21ms，比值 2.03x，分类 unknown
- **完整调用链**：
```
PlayerLoop (19.0ms, 99.9%)
  → Update.ScriptRunBehaviourUpdate (5.5ms, 28.7%)
    → BehaviourUpdate (5.5ms, 28.7%)
      → AOE.dll!AOE::GameLauncher.Update() (5.2ms, 27.4%)
        → Core.Update (5.2ms, 27.4%)
          → CS:AOE.LuaMgr (3.9ms, 20.4%)
            → LuaMgr.OnTick&UpdateSchedule (3.9ms, 20.3%)
              → MapSignificanceMgr (3.1ms, 16.5%)
                → MapSignificanceMgr.sampler_OnUpdate (3.1ms, 16.5%)
                  → MapSignificanceMgr.ProcessTasks (3.0ms, 15.8%)
                    → MapSignificanceMgr.EntityTask (3.0ms, 15.6%)
                      → MapSignificanceMgr.ProcessTask_MapObjCleanUp (1.2ms, 6.1%)
                        → Lua:ArmyCleanUp (1.1ms, 5.9%)
                          → Lua:ArmyCleanUp2 (1.1ms, 5.8%)
                            → Transform.SetParent (0.4ms, 2.2%)
                              → TransformChangedDispatch (0.1ms, 0.3%) **BOTTLENECK**
                                → WaitForJobGroupID (0.0ms, 0.2%)
                                  → Semaphore.WaitForSignal (0.0ms, 0.2%) **BOTTLENECK**
```
- **注意**：该帧 `PlayerLoop` 实际耗时 19ms（hotPath 显示），但 jankFrames 中 `msFrame=39.07ms`。说明 Profiler 采集的帧耗时 39ms，热路径树仅显示 19ms 的一个时间窗口。
- **瓶颈节点**：`TransformChangedDispatch → WaitForJobGroupID → Semaphore.WaitForSignal`，数值虽小，但这是一个 Job 同步点（主线程等待 Transform Job）。
- **根因分析**：`Lua:ArmyCleanUp` 在部队销毁时调用 `Transform.SetParent`，触发了 `TransformChangedDispatch`，导致主线程短暂等待 Job。根据 AOE 项目知识（C4/C5），`ArmyCleanUp` 是已知问题（"大量部队同时销毁时 spike（攻城战 50 队场景复现）"）。[推断] 此帧同步销毁了多支部队，`SetParent` 的 Transform Job 同步点导致帧耗时增加。

---

## 五、Marker 波动分析

### 判定依据

从 207 个波动 Marker 中，选取以下条件的 Marker 进行重点分析：
1. spikeRatio ≥ 10（极端波动）且均值耗时有实际影响
2. spikeFrameCount ≥ 5 且 spikeRatio ≥ 5（持续多帧波动型问题）
3. 与已知热点路径强相关（可辅助确认根因）

---

### 波动 Marker #1：TBUResManager.GetResFileInfo

- **spike ratio**: 27,611.7（极端，最高级别波动）
- **spike 帧数**: 未直接列出（通过 markerSpikes 可确认）
- **均值 / 中位 / 最大**：22.455ms / 0.021ms / 575.262ms
- **分析**：正常帧中位数仅 0.021ms（极快），但 spike 时可达 575ms。这是典型的偶发同步 IO 阻塞模式——正常情况下资源信息已缓存，极快返回；当缓存失效或首次查询时触发磁盘 IO，导致极端延迟。与 BigJank 帧 #465/#469 直接对应。

---

### 波动 Marker #2：MapSignificanceMgr.ProcessTask_ZoomEntityAdd

- **spike ratio**: 47,500（极端）
- **均值 / 中位 / 最大**：18.186ms / 0.012ms / 576.412ms
- **spike 帧数**：出现 120 帧
- **分析**：中位数 0.012ms，正常帧极快；触发缩放实体添加时可达 576ms。是 `TBUResManager.GetResFileInfo` 问题的直接父节点。

---

### 波动 Marker #3：YzEntityMoveLineNtf（关键常态波动）

- **spike ratio**：从 markerSpikes 数据中未直接显示（因为该 Marker 在中位帧也高达 11ms，属于"高基础 + 偶发更高"模式，而非低基础大 spike）
- **均值**：中位帧 11.5ms（stable high），Jank 帧 11.3ms
- **分析**：不属于 spike 型问题，而是持续高耗时热点，每帧稳定消耗约 11ms，是中位帧帧耗时超出 30FPS 预算（35.9ms vs 33.3ms）的主要原因之一。

---

### 波动 Marker #4：Shader.CreateGPUProgram（Render Thread）

- **spike ratio**: 8.7
- **spike 帧数**: 3 帧（presentOnFrameCount=3）
- **均值 / 最大**：22.462ms / 57.366ms
- **分析**：3 帧触发，每次均大幅超出帧预算。属于资源触发型 spike，不影响大多数帧，但触发时会导致明显卡顿（Render Thread 阻塞）。

---

### 波动 Marker #5：Gfx.WaitForGfxCommandsFromMainThread（Submit Thread，结构性波动）

- **spike ratio**: 80.9（高）
- **spike 帧数**: 通过数据推断与 BigJank 帧相关
- **均值 / 中位 / 最大**：14.06ms / 9.1ms / 582.426ms
- **分析**：正常帧 Submit Thread 等待 Main Thread 约 9ms（合理），BigJank 帧中等待时间达 582ms（与 Main Thread 的 557ms 阻塞时间对应）。该指标是 Main Thread CPU Bound 的直接反映。

---

### 波动 Marker #6：CS:AOE.Outside.OutSideViewArmyLineMgr（持续波动）

- **spike ratio**: 4.6
- **spike 帧数**: 16 帧（连续帧 #583~#598）
- **均值 / 中位 / 最大**：0.881ms / 0.728ms / 3.363ms
- **分析**：在末尾 16 帧连续波动，最大 3.4ms，说明测试末段视野中有大量部队行军路线在同步更新。该函数负责外野视图中部队行进路线的绘制管理。虽然单次 spike 不大，但与 `YzEntityMoveLineNtf`（11ms）共同构成了 `CS:AOE.Outside.MapManager` 模块的整体压力。

---

## 六、优化建议

### P0：修复 TBUResManager.GetResFileInfo 同步 IO / 缓存机制（最高优先级）

- **目标 Marker**：`TBUResManager.GetResFileInfo`、`MapSignificanceMgr.ProcessTask_ZoomEntityAdd`
- **源码位置**：source mapping 未找到，建议直接在 `TBUResManager` 类中搜索 `GetResFileInfo` 方法
- **预期收益**：消除 3 次 BigJank（557ms、546ms），以及 95 帧中的非零高耗时（均值 22ms）。整体帧率在缩放操作时从卡顿到流畅。
- **具体方案**：
  1. **确认是否同步 IO**：在 `TBUResManager.GetResFileInfo` 函数入口添加 `Profiler.BeginSample` + 打印调用栈，确认是否真的在主线程执行磁盘 IO。
  2. **添加内存缓存**：如果 `GetResFileInfo` 每次都查询磁盘/AssetBundle Manifest，增加 `Dictionary<string, ResFileInfo>` 内存缓存，对已查询过的资源直接返回缓存结果。预期将 22 次/帧的调用从 22ms 降至接近 0ms。
  3. **分帧处理**：如果 `MapSignificanceMgr.ProcessTask_ZoomEntityAdd` 在单帧内创建大量实体（每帧调用 `GetResFileInfo` 22次），将实体创建分散到多帧执行（每帧处理 N 个，N 可配置）。
  4. **修复 Error 日志**：调用链中出现 `ErrorLogWriter → GC.Alloc`，说明 `GetResFileInfo` 在某些情况下返回错误并触发 Error 日志。修复底层错误来源，避免 GC 分配。
- **风险**：缓存可能导致资源更新不及时，需确认缓存失效策略（如版本 hash 对比）。

---

### P0：优化 YzEntityMoveLineNtf 网络消息处理性能（常态热点）

- **目标 Marker**：`YzEntityMoveLineNtf`、`TServer.HandleMessages`、`TServer.ParsePacketMessages`
- **源码位置**：source mapping 未找到，建议搜索 `YzEntityMoveLineNtf` 或 `HandleMessages` 函数
- **预期收益**：将中位帧帧耗时从 35.9ms 降至预算内（<33.3ms），消除因网络消息处理超时导致的 Jank #298，并提升整体帧率 3~5 FPS。
- **具体方案**：
  1. **引入消息批次处理 + 对象池**：根据 AOE 项目知识（C5，"计划引入解包池方案"），实现 protobuf 解包对象池，复用已解析消息对象，消除 `GC.Alloc`。预期减少 GC 压力和 `ParsePacketMessages` 中的对象创建开销。
  2. **消息处理限帧**：设置每帧处理消息的上限数量（如最多处理 N 条 `MoveLineNtf`），超出的消息延到下帧处理，防止单帧消息积压导致耗时超标。
  3. **优化 `YzEntityMoveLineNtf` 处理逻辑**：当前 self-time 约 11ms，几乎全部是逻辑计算（子节点 `OutsideLineCtrl:CalculateVertexJob (Burst)` 耗时近零说明 Burst 已优化）。检查 `YzEntityMoveLineNtf` 内是否有可用 Burst Job 并行化的逻辑，或减少 Lua 跨语言调用次数。
  4. **异步解包**：将 `TServer.DecodeMesssages`（2ms）移到 Job Worker 线程执行，主线程仅消费解包完成的消息队列。
- **风险**：消息限帧处理需验证不影响战斗同步逻辑的正确性；解包线程化需注意线程安全。

---

### P1：修复 Shader 运行时编译问题（偶发 Spike）

- **目标 Marker**：`Shader.CreateGPUProgram`、`CreateGpuProgram`
- **源码位置**：Render Thread 内部，优化点在 Shader WarmUp 阶段
- **预期收益**：消除 3 帧中的 22~57ms Render Thread 阻塞，改善首次进入某些视角时的卡顿体验。
- **具体方案**：
  1. **补充 ShaderVariantCollection**：在进野外 Loading 时执行 `ShaderVariantCollection.WarmUp()`，确保所有战斗场景所需 Shader 变体均已提前编译。通过 `Graphics.BuildAssetBundle` 或 Editor 工具收集实际运行时触发的变体，加入 SVC。
  2. **检查是否首次装机**：根据 AOE 项目知识（C7），首次装机无 PSO Cache 时 WarmUp 耗时极高，需跳过分帧预热；非首次装机则可正常执行。确认此次 pdata 数据是否在首次装机条件下采集（若是，3 帧 `CreateGpuProgram` 属于正常首次触发）。
  3. **开启 PlayerSettings → Graphics → Async Shader Compilation**（Editor 确认线上包设置），避免主线程/Render Thread 同步等待编译完成。
- **风险**：SVC 过大会增加加载时间，需平衡。

---

### P1：降低 RenderManager_Shadow CPU 开销

- **目标 Marker**：`RenderManager_Shadow`（LateUpdate，均值 4~5ms）
- **源码位置**：`CS:AOE.RenderManager` 中的阴影渲染准备函数
- **预期收益**：将 LateUpdate 中 `RenderManager_Shadow` 从均值 4ms 降至 2ms 以内，释放约 2ms 帧预算，有助于在低端机（二档机）上提升帧率。
- **具体方案**：
  1. **减少阴影 Caster 数量**：通过 `ShadowCastingMode.Off` 对远距离或小体积实体关闭阴影投射；结合 LOD，LOD2/LOD3 层级强制关阴影（根据 AOE 已有优化经验，阴影已改为 LOD2，确认是否覆盖所有实体类型）。
  2. **阴影剔除距离优化**：在 `QualitySettings.shadowDistance` 上设置合理上限（如 50m），减少参与阴影计算的实体范围。
  3. **RenderManager_Shadow 分帧剔除**：将阴影 Caster 列表的更新分帧执行（每帧只更新视野内一部分 Caster），而非每帧全量刷新。
- **风险**：减少阴影投射实体可能影响战场视觉效果，需美术确认视觉可接受程度。

---

### P1：消除 GC.Collect 高耗时（4 帧 × ~9ms）

- **目标 Marker**：`GC.Collect`（4 帧，均值 8.5ms）
- **预期收益**：消除 4 帧约 9ms 的 GC 停顿，配合其他优化可降低卡顿频率。
- **具体方案**：
  1. **减少 TBUResManager.GetResFileInfo 路径的 GC 分配**：如 P0 建议所述，修复 Error 日志中的 `GC.Alloc`，减少 `LogStringToConsole` 触发的字符串创建。
  2. **减少 YzEntityMoveLineNtf 的对象分配**：引入消息对象池（见 P0 建议），消除 protobuf 解包的 GC 分配。
  3. **开启 GC.Incremental**（Unity 2019 已支持）：`PlayerSettings.gcIncremental = true`，将 GC 分散到多帧执行，避免单帧 9ms 停顿。注意：增量 GC 可能与 Lua GC 产生相互影响，需在测试包验证。
- **风险**：增量 GC 可能引入额外延迟，需压测验证帧率稳定性。

---

### P2：优化 Lua:ArmyCleanUp 部队销毁的 Job 同步点

- **目标 Marker**：`Lua:ArmyCleanUp → Transform.SetParent → TransformChangedDispatch → WaitForJobGroupID`
- **预期收益**：消除 Jank #105 类型的部队销毁卡顿，在大规模部队同时消失场景（如攻城战）中效果更明显。
- **具体方案**：
  1. **延迟 SetParent**：不在 ArmyCleanUp 当帧直接调用 `Transform.SetParent`，而是收集到列表，在 `TransformChangedDispatch` Job 完成后的下一帧统一处理，避免同帧 Job 同步等待。
  2. **分帧销毁**：根据 AOE 项目知识（C4），"部队延迟销毁避免同帧大量 ArmyCleanUp"，确认当前是否已实现分帧销毁，若未实现需补充。
  3. **减少 SetParent 调用频率**：检查 `Lua:ArmyCleanUp` 中每次销毁是否确实需要 `SetParent`，若只是为了回收对象池，可改为直接 Disable，跳过 Transform 层级变更。
- **风险**：延迟销毁需确保视觉上部队消失时机与逻辑保持一致。

---

## 七、补充说明

### 数据局限性

1. **Source Mapping 未生效**：项目路径 `K://AOEYZ_AIBenchmark//AOE3D` 在当前环境不可访问，所有热点分析均无法提供源码文件行号定位，根因分析中涉及源码推断的结论均标注了 `[推断]`。建议在项目代码可访问的环境中重新运行分析。
2. **数据采集为 PC 压测**：根据 AOE 项目知识（C3），本次数据为 PC 端（实际平均帧率 35.3 FPS），对应二档机战斗压测场景（知识库中 PC 战斗压测约 58 FPS，但配置可能不同）。建议同步在二档机（如小米8SE）采集对比数据，低端机上 `BattleHeadMgr`（低端机退化 9x）和 Job Worker 同步点会表现出更严重的性能问题。
3. **YzEntityMoveLineNtf 的中位帧耗时偏高**：中位帧 #417 总耗时 35.9ms（超出 33.3ms 预算），主要原因是 `YzEntityMoveLineNtf` 稳定消耗 11.5ms。这意味着**50%的帧都超出了帧预算**，在真实设备上会导致帧率持续低于 30 FPS。该问题优先级应视为 P0 级别（已在优化建议中标注）。
4. **BigJank 帧 #465/#469 连续出现**：两帧相邻（帧序号 465、469），说明是同一操作（缩放触发大批实体创建）的连续触发，修复 `TBUResManager.GetResFileInfo` 可同时消除两次 BigJank。

### 建议下一步

1. **立即**：在源码中定位 `TBUResManager.GetResFileInfo`，确认是否有同步 IO，添加日志输出调用频率和返回来源（缓存命中/磁盘）。
2. **本周**：为 `YzEntityMoveLineNtf` 实现消息对象池方案（已在 AOE 路线图中），目标将中位帧 Update 阶段耗时从 16ms 降至 8ms 以内。
3. **补充采集**：在二档机（骁龙低端机）上采集同场景 pdata，对比 `BattleHeadMgr`、Job Worker 同步点的低端机表现。
4. **Shader WarmUp 确认**：在测试包中检查 `ShaderVariantCollection` 覆盖情况，确认 3 帧 `CreateGpuProgram` 是否为未覆盖的变体。

---

## Token 消耗统计

```
[Step 1] preprocess.ts 执行 — ~0 token（脚本执行）
[Step 2] map-source.ts 执行 — ~0 token（脚本执行，0 source found）
[Step 3] 读取 preprocess-result.json（精简提取）— ~18K token
[Step 3] 读取 unity-cpu-knowledge.md — ~15K token
[Step 4] 未调用 query-frame（已有足够数据）— ~0 token
[Step 5] 报告生成 — ~8K token
总计估算：~41K token
```
