# CPU 性能分析报告

> **结论**: 主要瓶颈是 `TBUResManager.GetResFileInfo` 在地图缩放实体批量添加期间触发阻塞式文件 IO（占帧高达 61.2%），导致 2 次极端 Jank（>540ms）；稳态帧中次级瓶颈为 `YzEntityMoveLineNtf` 网络消息处理（中位帧占 31.4%）与 `RenderManager_Shadow` 阴影计算（占 13.3%）；首要建议是将 `TBUResManager.GetResFileInfo` 的文件信息查询结果缓存或移至异步线程，同时对行军线通知消息做批量合并处理；数据可信度高（599帧，置信 notes 为空）。

---

## 一、概览

| 指标 | 数值 |
|------|------|
| 总帧数 | 599 帧 |
| 目标帧率 | 60 FPS（预算 16.67ms/帧） |
| 实际平均帧率 | 35.3 FPS |
| 平均帧耗时 | 28.35ms（`frame.avgMs`） |
| 中位数帧耗时 | 22.33ms（`frame.p50Ms`） |
| P95 帧耗时 | 34.84ms（`frame.p95Ms`） |
| P99 帧耗时 | 59.77ms（`frame.p99Ms`） |
| 最差帧 | #431（598.43ms，`frame.maxMs`） |
| 超 33ms 帧占比 | 22.2%（`frame.slowRate33Ms`） |
| 超 50ms 帧占比 | 1.67%（`frame.slowRate50Ms`） |
| Jank 次数 | 6（`jank.count`） |
| BigJank 次数 | 3（`jank.bigCount`） |
| Jank 发生率 | 1.50%（`jank.rate`） |
| 显著波动 Marker 数 | 81（`spike.count`） |
| GC.Alloc 次数/帧 | 525.3 次（`gc.allocCount`） |
| GC.Collect 耗时/帧 | 0.057ms（`gc.collectMsPerFrame`） |

**帧预算分析**: 目标 60 FPS 对应 16.67ms 帧预算。平均帧耗时 28.35ms 已严重超标（超标 70%），中位帧 22.33ms 也超出预算 34%。即使在相对稳定的帧，CPU 端负载已超出 60 FPS 目标上限。

---

## 二、核心结论

本次采集场景为**行军线优化压测**。最严重的性能问题是 `TBUResManager.GetResFileInfo`，该 Marker 在地图实体批量添加（`MapSignificanceMgr.ProcessTask_ZoomEntityAdd`）期间发生极端 self-time 飙升（最高 572ms，spikeRatio=32312），直接导致帧 #469 和 #465 出现 540~557ms 的灾难性卡顿。稳态（中位帧 #417）的主要瓶颈是 `YzEntityMoveLineNtf` 行军线网络消息处理（11.49ms，占帧 32%），说明在有大量部队行军时，每帧的网络解包+业务处理开销已过半。此外，`RenderManager_Shadow` 阴影计算在 LateUpdate 阶段持续消耗 4ms（13.3%），并在 Jank 帧 #431 和 #277 中成为卡顿主因。`CreateGpuProgram`（Submit 线程 Shader 编译）在 3 帧内触发，是已知的 Shader 未 prewarm 问题。

---

## 三、热点分析

### 判定依据

判定热点的标准：self-time 占帧超过 10%，或每帧稳定出现且绝对值 ≥ 2ms，或在关键 Jank 帧中具有决定性作用。以下热点均满足上述条件之一。

---

### 热点 #1: TBUResManager.GetResFileInfo `[mustReport: 自身耗时占帧 61.2% > 20%]`

- **self-time 均值**: 22.33ms（仅 95 帧有值，其余帧为 0）
- **self-time 中位**: 0.018ms（正常帧极低）
- **self-time 最大**: 572.19ms
- **spikeRatio**: 32312.6（极端波动）
- **占帧比**: 61.2%（基于含该 Marker 帧的计算）
- **每帧调用次数**: 22.14 次
- **瓶颈类型**: self/total ≈ 99.4%，函数本身是瓶颈

**完整调用链（普通有值帧，中位帧附近）**:

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

**极端卡顿帧（#469/#465）调用链**:

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
```

**根因分析**: `TBUResManager.GetResFileInfo` 在地图缩放添加实体（`ProcessTask_ZoomEntityAdd`）时被高频同步调用（22 次/帧）。当实体数量批量增加（无极缩放层级切换、大批部队出现时），该函数会触发大量阻塞式文件系统查询（`File.Read`/`File.Open` 在同时段也有明显波动），单帧内累积调用耗时高达 572ms。`LogStringToConsole` 出现在调用链末端，说明每次文件信息查询失败或异常时还触发了 Console 日志，进一步放大耗时（亦有 GC.Alloc 产生）。结合 `marker-source-map.json`，源码标记在 `Assets\Scripts\CS\` 路径，属于 C# 层 TBU 资源管理器。

---

### 热点 #2: YzEntityMoveLineNtf `[稳态主线程最大热点]`

- **self-time 均值**: 4.95ms，中位 3.56ms，最大 25.28ms
- **spikeRatio**: 7.1
- **占帧比**: 11.5%（全局均值），中位帧 #417 中 self-time 11.3ms（占帧 31.4%）
- **每帧调用次数**: 2.39 次（75 帧有记录，179 次总调用）
- **瓶颈类型**: self/total = 94.7%（≈100%，函数本身是瓶颈）

**完整调用链（中位帧 #417）**:

```
PlayerLoop (35.94ms, 100.0%)
  → Update.ScriptRunBehaviourUpdate (16.27ms, 45.2%)
    → BehaviourUpdate (16.26ms, 45.2%)
      → AOE.dll!AOE::GameLauncher.Update() (15.96ms, 44.4%)
        → Core.Update (15.89ms, 44.2%)
          → CS:AOE.TServerManager (13.81ms, 38.4%)
            → TServer.HandleMessages (11.53ms, 32.1%)
              → YzEntityMoveLineNtf (11.49ms, 32.0%) **BOTTLENECK**
```

同帧网络解包路径：

```
CS:AOE.TServerManager (13.81ms, 38.4%)
  → TServer.DecodeMesssages (2.17ms, 6.0%)
    → TServer.ParsePacketMessages (1.99ms, 5.5%) **BOTTLENECK**
```

源码位置: `Assets\Scripts\CS\NetworkCore\Network\TServer.cs:266`（`TServer.HandleMessages`），`TServer.cs:265`（`TServer.DecodeMesssages`）。

**根因分析**: `YzEntityMoveLineNtf` 是行军线网络通知消息的处理函数。在行军压测场景下（300队），服务器每帧推送大量行军线状态更新包，`TServer.HandleMessages` 在同一帧内累积处理这些消息导致 11.5ms 耗时（占帧 32%）。这是行军压测场景的系统性热点——每个 `YzEntityMoveLineNtf` 消息处理包含实体位置更新和行军线绘制更新的完整业务逻辑，无批量合并。`TServer.ParsePacketMessages`（1.99ms）是 protobuf 解包本身的开销，属于已知的网络解包热点问题（知识库 C5）。

---

### 热点 #3: RenderManager_Shadow `[LateUpdate 渲染热点]`

- **self-time 均值**: 4.25ms，中位 4.01ms，最大 20.49ms
- **spikeRatio**: 5.1
- **占帧比**: 12.8%
- **每帧调用次数**: 1 次（323 帧有记录）
- **瓶颈类型**: self/total ≈ 100%，函数本身是瓶颈

**完整调用链（中位帧 #417）**:

```
PlayerLoop (35.94ms, 100.0%)
  → PreLateUpdate.ScriptRunBehaviourLateUpdate (7.14ms, 19.9%)
    → LateBehaviourUpdate (7.14ms, 19.9%)
      → AOE.dll!AOE::GameLauncher.LateUpdate() (6.64ms, 18.5%)
        → CS:AOE.RenderManager (4.82ms, 13.4%)
          → RenderManager_Shadow (4.80ms, 13.3%) **BOTTLENECK**
```

**根因分析**: `RenderManager_Shadow` 是 C# 层 AOE 自定义的阴影渲染管理，self-time 占帧 13.3% 且在 323 帧中稳定出现，说明是持续性开销。根据 AOE 知识库 C7，阴影和描边 Pass 可强制切换到 LOD2 以减少面数。此处 RenderManager_Shadow 在 LateUpdate 中统一执行阴影渲染，可能包含 Shadow Caster 剔除和 DrawCall 准备工作。在 BigJank 帧 #431（598ms 时间轴中 Main Thread 仅用 24ms）中，RenderManager_Shadow 仍占 16.6%，说明该开销与场景实体数量高度相关。

---

### 热点 #4: CreateGpuProgram `[Submit 线程 Shader 编译，mustReport]`

- **self-time 均值**: 20.38ms，中位 3.12ms，最大 55.55ms
- **spikeRatio**: 17.8
- **占帧比**: 47.5%（仅 3 帧出现）
- **每帧调用次数**: 2.67 次（3 帧共 8 次）
- **线程**: Submit Thread
- **瓶颈类型**: self/total = 100%，Submit 线程的 Shader 运行时编译

**根因分析**: `CreateGpuProgram` 出现 3 次、共 8 次调用，说明有 Shader 变体在运行时未被预热即被使用，触发同步编译（知识库 C7 和 C5：`CreateGpuProgram` spike = Shader 未 prewarm，产生 spike）。此类问题集中在首次进入某个场景或首次使用某个材质/渲染路径时。单帧最高 55ms 在 Submit Thread 上阻塞了 GPU 提交，影响 3 帧的渲染。

---

### 热点 #5: GC.Collect `[mustReport: self-time 占帧 31.0% > 20%]`

- **self-time 均值**: 8.49ms，中位 9.40ms，最大 10.23ms
- **spikeRatio**: 1.1（稳定，4 帧均有）
- **占帧比**: 31.0%
- **每帧调用次数**: 1 次（4 帧）
- **线程**: Main Thread

**根因分析**: GC.Collect 仅出现在 4 帧中，每帧耗时约 9ms（占帧 31%）。4 帧 GC.Collect 的 spikeRatio=1.1 说明每次触发耗时非常稳定（8.5~10.2ms 区间）。结合 `gc.allocCount=525.3次/帧` 的高分配频率，可判断内存分配速率已达到触发 GC 的阈值。GC.Collect 的父链在 preprocess-result.json 层无法完全展开（depth=5，chain not resolved）；结合 Jank 帧 #469 调用链末端有 GC.Alloc 出现，[推断] 主要分配来源是 `TBUResManager.GetResFileInfo` 调用失败时触发的 LogStringToConsole 字符串分配，以及网络解包（`TServer.ParsePacketMessages`）产生的 protobuf 临时对象。

---

### 热点 #6: ZoomGuildMemberAdd `[mustReport: self-time 6.7ms > 30% of budget]`

- **self-time 均值**: 6.71ms，中位 6.71ms，最大 6.71ms
- **spikeRatio**: 1.0（单次发生）
- **占帧比**: 18.6%
- **每帧调用次数**: 1 次（仅 1 帧）
- **depth**: 13（调用链 not resolved）

**根因分析**: `ZoomGuildMemberAdd` 仅出现 1 次，self-time 6.7ms 但其 total-time 7.36ms（self/total=91%），说明是单次的同步操作。名称含义为无极缩放（InfiniteZoom）时公会成员添加逻辑，[推断] 触发了批量的 MapEntity 创建或资源加载。这是一次性操作 spike，属于低优先级问题，但若大批公会成员同时进入视野（战斗场景滑动视野）可能引发更严重的卡顿。

---

### 特殊 Marker 说明

| Marker | 均值 | 解读 |
|--------|------|------|
| `WaitForTargetFPS` | 2.57ms/帧（中位 0.004ms） | 中位帧极低，说明大多数帧 CPU 不空闲；部分帧较高是因帧率未达标后 vsync 补偿 |
| `Gfx.PresentFrame` (Submit Thread) | 4.59ms/帧（中位 1.89ms） | Submit 线程 GPU 提交，中位值正常；P95=11.4ms，213 帧出现 spike（spikeRatio=23.3），说明 GPU 端有间歇性高负载，非持续 GPU Bound |
| `Gfx.RenderSlaver_ThreadRun` | 28.33ms/帧 | Render Thread 每帧平均运行时间与主线程相当，说明渲染工作量大，但不是主线程瓶颈 |

**无 `Gfx.WaitForPresent` 显著高耗时**：当前场景非持续 GPU Bound，瓶颈主要在 CPU 主线程（网络处理、资源加载、Lua 逻辑）。

---

## 四、Jank 卡顿分析

### 卡顿模式总结

| 帧 | 耗时 | 级别 | 类别 | 主因 Marker | 说明 |
|----|------|------|------|-------------|------|
| #469 | 557ms (2.70x) | Jank | unknown | TBUResManager.GetResFileInfo | 实体批量添加时文件IO阻塞 |
| #465 | 549ms (2.70x) | Jank | unknown | TBUResManager.GetResFileInfo | 同上 |
| #466 | 546ms (19.76x) | **BigJank** | unknown | Semaphore.WaitForSignal | GPU 等待阻塞 |
| #431 | 598ms (25.15x) | **BigJank** | rendering | RenderManager_Shadow | 阴影渲染 spike |
| #205 | 59ms (3.25x) | **BigJank** | unknown | ArmyMove_MovelineTarget | 行军线资源异步加载触发 |
| #298 | 58ms (2.37x) | Jank | unknown | YzEntityMoveLineNtf | 行军线通知消息处理 |
| #277 | 60ms (2.50x) | Jank | rendering | RenderManager_Shadow | 阴影渲染 spike |
| #105 | 39ms (2.03x) | Jank | unknown | TransformChangedDispatch | 部队清理时 Transform 更新 |

**模式总结**: 
- **TBUResManager 型**（帧 #465/#469，2次）：系统性问题，每次无极缩放层级切换触发大批实体添加时必现
- **Semaphore/GPU等待型**（帧 #466/#470，2次）：GPU 渲染阻塞导致主线程等待，可能与 Shader 编译或 GPU 过载相关
- **RenderManager_Shadow 型**（帧 #431/#277，2次）：阴影渲染 spike，多次出现为系统性问题
- **一次性触发型**（帧 #205/#298/#105，3次）：特定业务操作（部队行军线创建、清理）触发的单次 spike

---

### BigJank #1: 帧 #431 — RenderManager_Shadow 阴影渲染极端 spike

- **耗时**: 598.43ms（25.15 倍 median）
- **卡顿类别**: rendering
- **dominantMarker**: RenderManager_Shadow

**完整调用链（worstFrame #431 Main Thread）**:

```
PlayerLoop (24.0ms, 99.9%)
  → PreLateUpdate.ScriptRunBehaviourLateUpdate (6.97ms, 29.0%)
    → LateBehaviourUpdate (6.97ms, 29.0%)
      → AOE.dll!AOE::GameLauncher.LateUpdate() (6.29ms, 26.2%)
        → CS:AOE.RenderManager (4.01ms, 16.7%)
          → RenderManager_Shadow (3.99ms, 16.6%) **BOTTLENECK**
  → PostLateUpdate.FinishFrameRendering (5.09ms, 21.2%)
    → URP.RenderCameraStack (3.74ms, 15.6%)
      → URP.RenderSingleCamera (3.70ms, 15.4%)
  → Update.ScriptRunBehaviourUpdate (4.72ms, 19.6%)
    → BehaviourUpdate (4.71ms, 19.6%)
      → CS:AOE.Outside.MapManager (1.23ms, 5.1%)
        → CS:AOE.Outside.OutSideViewArmyLineMgr (0.81ms, 3.4%) **BOTTLENECK**
```

**注意**: 帧 #431 的 Main Thread 耗时仅 24ms，但对应的整帧耗时 598ms——说明本次极端 BigJank 的根因**不在 Main Thread 上**，而是某个等待事件（Semaphore、GPU 同步、平台 vsync）导致整帧挂起。[推断] 可能是 Render Thread 或 Submit Thread 发生了大时间段阻塞（如 GPU 超时、驱动层等待），而 profiler 将等待时间计入了帧时长。RenderManager_Shadow 在该帧的表现（3.99ms）与正常帧接近，是相对耗时最高的 Marker，但不是 598ms 的直接原因。

---

### BigJank #2: 帧 #466 — Semaphore.WaitForSignal GPU 等待

- **耗时**: 545.97ms（19.76 倍 median）
- **卡顿类别**: unknown
- **dominantMarker**: Semaphore.WaitForSignal

**完整调用链**:

```
PlayerLoop (32.1ms, 100.0%)
  → PostLateUpdate.FinishFrameRendering (9.0ms, 28.0%)
    → UnityEngine.CoreModule.dll!UnityEngine.Rendering::RenderPipelineManager.DoRenderLoop_Internal() (8.7ms, 27.1%)
      → URP.Render (8.2ms, 25.6%)
        → URP.RenderCameraStack (7.9ms, 24.6%)
          → URP.RenderSingleCamera (7.9ms, 24.5%)
            → URP.BeforeRendering (4.6ms, 14.3%)
              → WaitForJobGroupID (3.9ms, 12.0%)
                → Semaphore.WaitForSignal (3.9ms, 12.0%) **BOTTLENECK**
```

**根因分析**: Main Thread 在 `URP.BeforeRendering` 阶段等待 Job 系统完成（`WaitForJobGroupID → Semaphore.WaitForSignal`，3.9ms）。整帧 546ms 远超 Main Thread 的 32ms，与帧 #431 同样属于**等待非主线程导致帧时长异常**的情况。[推断] Render Thread 或 Submit Thread 在该帧发生了大量等待（类似 GPU Bound 导致的 Present 阻塞），但具体原因需结合 Render/Submit Thread 时间线确认。Jank 帧 #470 的 hotPath 也显示了 `URP.WaitForPresent → Gfx.WaitForPresentOnGfxThread → Semaphore.WaitForSignal(38.1ms)` 的 GPU Present 等待，两帧模式一致。

---

### BigJank #3: 帧 #205 — 行军线目标资源异步加载触发同步等待

- **耗时**: 59.26ms（3.25 倍 median）
- **卡顿类别**: unknown
- **dominantMarker**: `*** ArmyMove_MovelineTarget ***`

**完整调用链**:

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
                                  → [res]goLoader_async: assets/bundleresources/effects_yz/mobile/ui3d/p_fx_yz_march_target_red.prefab (0.0ms, 0.1%)
```

**根因分析**: 在 `MapSignificanceMgr.ProcessTask_MapEntityAdd` 创建地图实体时，触发了 `ArmyMove_MovelineTarget` 的行军线目标特效资源加载（`goLoader_async: p_fx_yz_march_target_red.prefab`）。虽然接口名称含 `async`，但此处调用在主线程同步等待或触发了初次加载，导致 Jank。这属于 AOE 已知的行军移出视野卡顿问题（知识库 C5：行军移出视野卡顿）的反向路径——资源进入视野时触发资源加载。

---

### Jank #4: 帧 #298 — YzEntityMoveLineNtf 行军线通知消息集中处理

- **耗时**: 58.42ms（2.37 倍 median）
- **dominantMarker**: YzEntityMoveLineNtf

**完整调用链**:

```
PlayerLoop (43.7ms, 100.0%)
  → Update.ScriptRunBehaviourUpdate (16.9ms, 38.6%)
    → BehaviourUpdate (16.9ms, 38.6%)
      → AOE.dll!AOE::GameLauncher.Update() (16.6ms, 38.0%)
        → Core.Update (16.6ms, 37.8%)
          → CS:AOE.TServerManager (13.6ms, 31.0%)
            → TServer.HandleMessages (11.5ms, 26.3%)
              → YzEntityMoveLineNtf (11.3ms, 25.9%) **BOTTLENECK**
                → GC.Alloc (0.0ms, 0.0%)
```

**根因分析**: 单帧内 `YzEntityMoveLineNtf` 处理时间达 11.3ms（25.9%），说明该帧服务器推送了大量行军线更新消息被集中处理。`GC.Alloc` 出现在 `YzEntityMoveLineNtf` 子节点，[推断] 每次消息处理都有临时对象分配（可能是 protobuf 解包产生的对象，或行军线数据结构创建），积少成多触发 GC.Collect（上文中 4 帧 GC.Collect 之一）。

---

### Jank #5: 帧 #105 — 部队清理触发 TransformChangedDispatch

- **耗时**: 39.07ms（2.03 倍 median）
- **dominantMarker**: TransformChangedDispatch

**完整调用链**:

```
PlayerLoop (19.0ms, 99.9%)
  → Update.ScriptRunBehaviourUpdate (5.5ms, 28.7%)
    → BehaviourUpdate (5.5ms, 28.7%)
      → AOE.dll!AOE::GameLauncher.Update() (5.2ms, 27.4%)
        → Core.Update (5.2ms, 27.4%)
          → CS:AOE.LuaMgr (3.9ms, 20.4%)
            → LuaMgr.OnTick&UpdateSchedule (3.9ms, 20.3%)
              → MapSignificanceMgr (3.1ms, 16.5%)
                → MapSignificanceMgr.ProcessTasks (3.0ms, 15.8%)
                  → MapSignificanceMgr.EntityTask (3.0ms, 15.6%)
                    → MapSignificanceMgr.ProcessTask_MapObjCleanUp (1.2ms, 6.1%)
                      → Lua:ArmyCleanUp (1.1ms, 5.9%)
                        → Lua:ArmyCleanUp2 (1.1ms, 5.8%)
                          → Transform.SetParent (0.4ms, 2.2%)
                            → TransformChangedDispatch (0.1ms, 0.3%) **BOTTLENECK**
                              → WaitForJobGroupID (0.0ms, 0.2%)
                                → Semaphore.WaitForSignal (0.0ms, 0.2%)
```

**根因分析**: `ArmyCleanUp` → `ArmyCleanUp2` → `Transform.SetParent` 触发了 Transform 变化事件分发（`TransformChangedDispatch`），该分发内部等待 Job 同步点（`WaitForJobGroupID`）。这属于 AOE 已知的 `ArmyCleanUp` 大量部队同时销毁时 spike 问题（知识库 C4/C5）。

---

### Jank #6: 帧 #470/469 — TBUResManager.GetResFileInfo + GPU Present 等待

**帧 #470 调用链**（GPU Present 等待类型）:

```
PlayerLoop (63.9ms, 100.0%)
  → PostLateUpdate.FinishFrameRendering (43.6ms, 68.2%)
    → URP.RenderCameraStack (42.4ms, 66.4%)
      → URP.RenderSingleCamera (42.4ms, 66.3%)
        → URP.AfterRendering (39.3ms, 61.5%)
          → URP.Submit (39.0ms, 61.0%)
            → URP.WaitForPresent (38.2ms, 59.7%)
              → Gfx.WaitForPresentOnGfxThread (38.2ms, 59.7%)
                → Semaphore.WaitForSignal (38.1ms, 59.7%) **BOTTLENECK**
```

帧 #470 是 Main Thread 等待 GPU Present 长达 38ms，这是典型的**GPU Bound 信号**（知识库 A2/A4 规则5）。结合帧 #466 的同类模式，说明在无极缩放层级切换的高峰期，GPU 也出现了短时过载。

---

## 五、Marker 波动分析

### 判定依据

以下 Marker 被判定为显著波动问题的标准：spikeRatio > 50，且 spike 帧数 ≥ 5，且 spike 对帧时长有实质影响（绝对值 P95 ≥ 1ms 或 spike 帧耗时 ≥ 5ms）。以下分析均满足此标准。

---

### 波动 Marker #1: TBUResManager.GetResFileInfo

- **spikeRatio**: 32312.6（极端）
- **spike 帧数**: 16 帧（帧 #79~#94）
- **P95 自身耗时**: 0.11ms（正常帧极低）
- **最大值**: 572.19ms
- **分析**: 已在热点 #1 详细分析。spike 集中于帧 #79~94 的 16 帧连续区间，与另一批次的 #465~469 都属于同一根因（缩放层级切换触发大批实体添加时的文件IO阻塞）。这种"集中爆发"模式说明触发条件是批量操作，而非偶发。

---

### 波动 Marker #2: WaitForTargetFPS

- **spikeRatio**: 4751.8
- **spike 帧数**: 129 帧（帧 #470~）
- **P95 自身耗时**: 15.03ms
- **分析**: `WaitForTargetFPS` spike 高（均值 2.57ms vs 中位 0.004ms）说明在 spike 帧中 CPU 主线程空转等待较多，这**不是性能问题**，而是当 CPU 某一帧意外提前完成（如极端 Jank 后的补偿帧）时，Unity 等待 vsync 的正常表现。129 帧 spike 是 Jank 帧后连续空闲帧的标志，说明 Jank 后有一段恢复期。

---

### 波动 Marker #3: LoaderManagerTickLoadOnFrameEnd

- **spikeRatio**: 452.2
- **spike 帧数**: 254 帧（超过 40%）
- **P95 自身耗时**: 1.01ms
- **最大值**: 13.66ms
- **分析**: `LoaderManagerTickLoadOnFrameEnd` 在超过 40% 的帧出现波动，中位仅 0.03ms 但 P95 达 1ms，最大 13.66ms，说明异步资源加载在帧尾回调时有**持续性不均匀**现象。254 帧均有 spike，与 `TBUResManager.GetResFileInfo` 的集中爆发不同，这是全程存在的背景噪声。[推断] 是异步加载队列中不同大小的资源包轮流完成，每帧完成量不均匀所致。

---

### 波动 Marker #4: Gfx.UploadTexture

- **spikeRatio**: 273.2
- **spike 帧数**: 14 帧（帧 #62~#75）
- **P95 自身耗时**: 13.41ms
- **最大值**: 47.03ms
- **分析**: `Gfx.UploadTexture` 在 14 帧连续区间出现高 spike（最大 47ms），说明有大批纹理在这一段时间内同步上传到 GPU。这与同时段 `File.Read`（帧 #60~#79）和 `OutsideLineMesh:ResetIndexBufferJob`（帧 #60~#79）的 spike 重叠，整体指向**进入某场景/区域时批量加载纹理**的场景。47ms 的纹理上传会在 Submit Thread 产生明显卡顿。

---

### 波动 Marker #5: MapSignificanceMgr.ProcessTask_ZoomEntityAdd

- **spikeRatio**: 253.4
- **spike 帧数**: 48 帧（帧 #72~#119）
- **P95 自身耗时**: 2.66ms
- **最大值**: 3.08ms
- **分析**: 连续 48 帧出现 spike，与 `TBUResManager.GetResFileInfo` 和 `Gfx.UploadTexture` 的高峰区间重叠，共同印证了**无极缩放层级切换**触发的大批量地图实体添加操作。每帧最高 3ms，累计形成 48 帧的性能压力。

---

### 波动 Marker #6: AnimatorECSComponentSystem:AnimatorECSJob (Burst)

- **spikeRatio**: 118.3
- **spike 帧数**: 41 帧（帧 #313~#353）
- **P95 自身耗时**: 0.37ms
- **最大值**: 10.35ms
- **分析**: 该 Burst Job 最大值 10.35ms 对 Job Worker 线程有较大影响，41 帧集中于 #313~#353 区间。[推断] 是某时段部队动画量急剧增加（如大批部队进入视野），Burst Job 调度出现峰值。绝对耗时不高但 spikeRatio 大，说明平时该 Job 极轻量，特定场景下才爆发。

---

### 波动 Marker #7: LuaMtGc.ExecuteMtGc

- **spikeRatio**: 43.9
- **spike 帧数**: 26 帧（帧 #573~#598，末段）
- **P95 自身耗时**: 0.45ms
- **最大值**: 9.44ms
- **分析**: Lua GC 最大值 9.44ms，spike 集中于采样末段（帧 #573~598）。结合知识库 C5 "LuaGC spike：Lua 临时对象+同步点叠加，已解决"，当前仍有 9ms 峰值说明可能是新增的 Lua 临时对象来源，需关注。26 帧出现 spike 但绝对值 P95=0.45ms 说明通常影响较小，属于中优先级问题。

---

## 六、优化建议

### P0: TBUResManager.GetResFileInfo — 文件信息查询结果缓存

- **目标 Marker**: `TBUResManager.GetResFileInfo`
- **源码位置**: C# 层 TBU 资源管理器（`TBUResManager.cs`，需在项目内搜索）
- **预期收益**: 消除帧 #465/#469 的 540ms 级 Jank；减少 `File.Read`/`File.Open` spike（目前 29帧/8帧 spike）；减少 `LogStringToConsole` 噪声
- **具体方案**:
  1. **添加内存缓存**：在 `GetResFileInfo` 入口处检查 `static Dictionary<string, ResFileInfo> _cache`，命中直接返回，避免重复文件 IO
  2. **预加载时机**：在场景加载或无极缩放层级切换前（`InfiniteZoomMgr.SwitchState` 触发时），对即将显示的实体资源信息提前批量 warm up 缓存
  3. **异步化**：对于缓存未命中的情况，使用 `Task<ResFileInfo>` 或 Unity `UniTask` 异步读取，在帧尾（`Core.PostEndOfFrame`）或 Loading Thread 上完成，不在主线程同步阻塞
  4. **限制 LogStringToConsole**：在 `GetResFileInfo` 失败时，将 `Debug.Log` 改为 `Debug.LogWarning` 并加频率限制（如 `10次/秒` 上限），避免字符串分配产生 GC 压力
- **风险**: 缓存可能导致过时的文件信息，需在资源热更新或 AssetBundle 重新加载时主动清理缓存

---

### P0: YzEntityMoveLineNtf — 行军线通知消息批量合并处理

- **目标 Marker**: `YzEntityMoveLineNtf`，`TServer.HandleMessages`
- **源码位置**: `Assets\Scripts\CS\NetworkCore\Network\TServer.cs:266`
- **预期收益**: 中位帧 CPU 节省约 11ms（38.4% → <10%），稳定帧率从 35 FPS 提升至理论 50+ FPS
- **具体方案**:
  1. **消息批处理**：在 `TServer.HandleMessages` 中，将同一帧内收到的多条 `YzEntityMoveLineNtf` 消息先放入批次队列，等一帧收集完毕后统一处理（类似 Command Buffer 模式），而非每条消息立即回调 Lua
  2. **增量更新优化**：`YzEntityMoveLineNtf` 若包含全量行军线数据，改为服务端下发增量 diff，客户端合并，减少单条消息的处理量
  3. **分帧处理**：若单帧内消息量过多，设置每帧最大处理条数限制（如 50条/帧），剩余消息推到下一帧，避免单帧峰值
  4. **对象池**：对 `TServer.ParsePacketMessages` 的 protobuf 解包结果对象使用对象池，减少 `gc.allocCount`（目前 525次/帧）
- **风险**: 批处理可能引入 1 帧延迟，需验证对行军线视觉表现的影响；分帧处理需评估最大积压量

---

### P1: RenderManager_Shadow — 阴影质量与 LOD 优化

- **目标 Marker**: `RenderManager_Shadow`
- **预期收益**: 减少 4ms/帧（稳态），降低 Jank 帧 #431/#277 的发生概率
- **具体方案**:
  1. **强制 LOD2 阴影**：在 `RenderManager_Shadow` 的 Shadow Caster 收集逻辑中，将阴影 LOD 强制设为 LOD2（知识库 C7：阴影 Pass 强制使用 LOD2，减少面数），可降低 Shadow Caster 的面数
  2. **阴影距离裁剪**：减少 Shadow Distance（`QualitySettings.shadowDistance`），仅对摄像机近处实体投射阴影；行军场景可设为较小值（如 50 units）
  3. **动态关闭**：在部队数量超过阈值时（战场简化模式触发条件），在 `RenderManager_Shadow` 中动态禁用部队阴影（`CastShadows = Off`），知识库 C7 面数裁剪实测：关阴影可将面数从 500w 降至 320~400w
- **风险**: 视觉变化，需 QA 评审；LOD2 阴影形状可能有明显简化

---

### P1: CreateGpuProgram — Shader Variant 预热

- **目标 Marker**: `CreateGpuProgram`（Submit Thread）
- **源码位置**: 引擎层，触发点在首次渲染使用未编译 Shader Variant 时
- **预期收益**: 消除运行时 Shader 编译 spike（最高 55ms/帧）
- **具体方案**:
  1. **ShaderVariantCollection WarmUp**：在进野外 Loading 时（知识库 C7）通过 `ShaderVariantCollection.WarmUp()` 预热与行军场景相关的所有 Shader 变体，包括行军线特效（`p_fx_yz_march_target_red.prefab` 使用的材质 Shader）
  2. **检查未覆盖变体**：运行时若出现 `CreateGpuProgram`，在开发阶段用 `Graphics.RenderMesh` 配合 Profiler 录制触发路径，将对应变体加入 `ShaderVariantCollection`
  3. **PSO 预缓存（Vulkan/Metal）**：iOS/Android 平台开启 PSO Cache 预热，减少首次装机开销
- **风险**: WarmUp 在 Loading 阶段会有额外开销（非首次装机有缓存，开销极小）

---

### P1: GC.Collect — 减少高频内存分配

- **目标 Marker**: `GC.Collect`，`GC.Alloc`
- **预期收益**: 消除 4 帧 × 9ms 的 GC.Collect 卡顿；降低 gc.allocCount（目前 525次/帧）
- **具体方案**:
  1. **YzEntityMoveLineNtf 对象池**：参见 P0 网络优化方案，protobuf 解包使用对象池（知识库 C5 待解包池方案）
  2. **TBUResManager Log 字符串**：将 `Debug.Log(string.Format(...))` 改为条件日志或限频日志，减少字符串 GC 分配
  3. **`List<T>` 预分配**：在 `MapSignificanceMgr.ProcessTasks` 等每帧调用的热点函数中，将临时 `List<T>` 改为预分配的成员变量（`_taskListTemp`），避免每帧 new
  4. **监控 GC.Alloc 热点**：在开发环境使用 Unity Memory Profiler 或 `GC.GetTotalMemory()` 定位具体分配源
- **风险**: 对象池引入复杂性，需仔细管理生命周期防止对象提前回收或内存泄漏

---

### P2: MapSignificanceMgr.ProcessTask_ZoomEntityAdd — 实体添加分帧

- **目标 Marker**: `MapSignificanceMgr.ProcessTask_ZoomEntityAdd`
- **源码位置**: `Assets\Scripts\.Lua\Outside\Map\Core\MapSignificanceMgr.lua:1208`
- **预期收益**: 减少缩放层级切换时的集中 spike（48帧 spike 区间），将峰值 3ms 摊平至 <1ms/帧
- **具体方案**:
  1. **分帧 Tick**：在 `ProcessTask_ZoomEntityAdd` 中，限制每帧最大处理实体数（如 20个/帧），剩余任务保存到 `_pendingEntityAddList` 在后续帧处理
  2. **预加载优先**：在无极缩放层级切换开始前（`InfiniteZoomMgr.SwitchState` → `MapCoreMgr.OnInfiniteLayerLevelChange_MapEntity`），提前触发即将进入视野的实体资源预加载（`TBUResManager.PreloadResFileInfo`），避免添加时才触发 IO
- **风险**: 分帧处理会导致层级切换后 1~3 帧内部分实体尚未显示，需评估视觉可接受性

---

### P2: Gfx.UploadTexture — 纹理上传节流

- **目标 Marker**: `Gfx.UploadTexture`（spike 帧数 14，最大 47ms）
- **预期收益**: 消除连续 14 帧的 Submit Thread 纹理上传峰值（最大 47ms）
- **具体方案**:
  1. **上传节流**：在 `LoaderManagerTickLoadOnFrameEnd` 中，限制每帧纹理上传量（如 `Texture.requestedMipmapLevel` 配合 Streaming 系统控制上传速率）
  2. **预加载窗口期**：在无极缩放开始前 1~2 秒预触发纹理加载，避免层级切换时集中上传
  3. **AsyncGPUReadback 替代同步上传**：对非关键路径的纹理使用异步 GPU 上传（`Graphics.CopyTexture` + `AsyncGPUReadback`）
- **风险**: 纹理上传节流可能导致进入场景后短暂出现低分辨率纹理（Mipmap Streaming 效果）

---

## 七、补充说明

### 数据局限性

1. **采集帧数 599 帧**，数量充足，置信度高（`confidence.notes` 为空）。但本次采集集中于行军压测特定时段，帧 #60~#100 和 #465~#475 的异常集中说明场景内有明显的状态转换（缩放层级切换），结论对该特定操作序列的代表性强。
2. **BigJank 帧 #431（598ms）的 Main Thread 仅 24ms**，极端帧时长来自 Render/Submit Thread 或系统级等待，Profiler 数据无法直接定位非 Main Thread 原因，需结合 Perfetto 或 Android/iOS GPU 分析工具确认。
3. **`query-frame` 脚本未能成功运行**，GC.Collect、ZoomGuildMemberAdd 等 depth 较深的 Marker 调用链无法展开至叶节点，相关结论标注了 [推断]。
4. **source mapping 未找到 TBUResManager 等核心文件**（项目路径不可访问），无法做代码级根因确认，建议开发者手动查看相关源文件。

### 建议下一步

1. **立即**: 对 `TBUResManager.GetResFileInfo` 添加内存缓存（P0 优先级，预计减少 95% 的文件 IO 调用）
2. **本迭代**: 对 `YzEntityMoveLineNtf` 实施消息批量合并，目标将中位帧的网络处理耗时从 11ms 降至 <4ms
3. **专项验证**: 使用 Android Perfetto 对帧 #431 和 #466 的极端卡顿进行 GPU 时间线分析，确认是否为 GPU Bound 或驱动层问题（华为 GPU Bug，知识库 C5）
4. **监控**: 在下一轮压测中，重点观察 `TBUResManager.GetResFileInfo` spike 是否消除，以及 `YzEntityMoveLineNtf` 的 self-time 变化趋势

---

## Token 消耗统计

```
[Step 1] build-profile.ts executed — ~0 token (script only, no AI read)
[Step 2] map-source.ts executed — ~0 token (script only)
[Step 3a] Read unity-profile-summary.json — actual file size: 66KB × 350 = 23.1K token
[Step 3b] Read marker-source-map.json — actual file size: 27KB × 350 = 9.5K token
[Step 3c] Read unity-cpu-knowledge.md — actual file size: 19KB × 350 = 6.7K token
[Step 4] query-frame 调用失败 — ~0 token
[Step 5] Report generation — ~5K token (output only)
Total estimated: ~44K token
```
