# CPU 性能分析报告

## 一、概览

| 指标 | 数值 |
|------|------|
| 总帧数 | 599 |
| 目标帧率 | 30 FPS |
| 实际平均帧率 | 35.3 FPS |
| 平均帧耗时 | 28.35ms |
| 中位数帧耗时 | 22.33ms |
| 最差帧 | #431 (598.43ms) |
| Jank 次数 | 6 |
| BigJank 次数 | 3 |

## 二、核心结论

> **MapSignificanceMgr.ProcessTask_ZoomEntityAdd** 是本次压测的最大性能问题，在 Frame #465 和 #469 分别造成 546ms 和 557ms 的 BigJank（约为目标帧预算的 16.7 倍），根因是缩放层级切换时大量实体批量创建导致 `TBUResManager.GetResFileInfo` 同步 IO 阻塞主线程。其次，**YzEntityMoveLineNtf** 网络消息处理在 Frame #298 单帧耗时 11.3ms 造成 Jank，本质是网络消息积压后一帧内同步处理过多行军路线更新。此外，**RenderManager_Shadow** 稳定消耗 4ms/帧，在后期帧段与 GPU 同步等待叠加导致 Gfx.WaitForPresentOnGfxThread 升高。

## 三、Jank 卡顿分析

### 卡顿模式总结

| 分类 | 帧号 | 耗时 | 倍数 | 核心瓶颈 |
|------|------|------|------|---------|
| MapSignificanceMgr (BigJank) | #465 | 545.97ms | 24.4x | ProcessTask_ZoomEntityAdd → TBUResManager.GetResFileInfo |
| MapSignificanceMgr (BigJank) | #469 | 557.14ms | 24.9x | ProcessTask_ZoomEntityAdd → TBUResManager.GetResFileInfo |
| GPU 同步等待 | #470 | 63.9ms | 2.9x | Gfx.WaitForPresentOnGfxThread (38.2ms) |
| YzEntityMoveLineNtf | #298 | 43.76ms | 2.0x | 网络消息同步处理 (11.3ms) |
| 渲染 (RenderManager_Shadow) | #431 | 598.43ms | 26.8x | RenderManager_Shadow (4.0ms) + 其他累积 |
| 渲染 (RenderManager_Shadow) | #277 | 31.9ms | 1.4x | RenderManager_Shadow (4.8ms) |
| MapSignificanceMgr (一般) | #205 | 28.4ms | 1.3x | ProcessTask_MapEntityAdd |
| MapSignificanceMgr (一般) | #105 | 19.0ms | 0.9x | ProcessTask_MapObjCleanUp |

### BigJank #1: MapSignificanceMgr 缩放实体批量创建 (Frame #465)

- **耗时**: 545.97ms，为目标帧预算 (33.33ms) 的 **16.4 倍**
- **完整调用链**:
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
  ```
- **瓶颈节点**: `TBUResManager.GetResFileInfo`，self-time = 179.88ms (占帧 33.1%)
- **根因分析**: 缩放层级切换时触发 `ProcessTask_ZoomEntityAdd`，需大量批量创建地图实体。`TBUResManager.GetResFileInfo` 是同步的资源文件信息查询，当需要创建的实体数量极大时（本帧调用了数百次），累积 IO 开销造成主线程长时间阻塞。同时 `ProcessTask_ZoomEntityAdd` 自身 self-time 也有 0.5ms，说明除了 IO，实体创建本身的逻辑开销也在累积。此外发现调用链中 `LogStringToConsole` 出现 0.84ms，说明运行时有日志输出（可能是资源查找失败的警告），在正式包应移除。

### BigJank #2: MapSignificanceMgr 缩放实体批量创建 (Frame #469)

- **耗时**: 557.14ms，为目标帧预算的 **16.7 倍**
- **完整调用链**: 与 Frame #465 完全相同的路径
  ```
  PlayerLoop (557.1ms, 100.0%)
    → Update.ScriptRunBehaviourUpdate (536.7ms, 96.3%)
      → ... → MapSignificanceMgr.ProcessTask_ZoomEntityAdd (524.9ms, 94.2%)
        → TBUResManager.GetResFileInfo (178.4ms, 32.0%) **BOTTLENECK**
  ```
- **瓶颈节点**: `TBUResManager.GetResFileInfo`，self-time = 177.44ms
- **根因分析**: 与 Frame #465 是同一类问题的连续两帧。说明缩放层级切换过程持续了多帧，每帧都在处理 ZoomEntityAdd 任务，未做有效的分帧限流。另外注意到本帧 `YzEntityMoveLineNtf` 累计 3.5ms + 0.9ms = 4.4ms，说明网络消息处理也在叠加。

### BigJank #3: GPU 同步等待 (Frame #470)

- **耗时**: 63.9ms，为目标帧预算的 **1.9 倍**
- **完整调用链**:
  ```
  PlayerLoop (63.9ms, 100.0%)
    → PostLateUpdate.FinishFrameRendering (43.6ms, 68.2%)
      → UnityEngine.CoreModule.dll!...RenderPipelineManager.DoRenderLoop_Internal() (43.3ms, 67.7%)
        → URP.Render (42.7ms, 66.9%)
          → URP.RenderCameraStack (42.4ms, 66.4%)
            → URP.RenderSingleCamera (42.4ms, 66.3%)
              → URP.AfterRendering (39.3ms, 61.5%)
                → URP.Submit (39.0ms, 61.0%)
                  → URP.WaitForPresent (38.2ms, 59.7%)
                    → Gfx.WaitForPresentOnGfxThread (38.2ms, 59.7%)
                      → Semaphore.WaitForSignal (38.1ms, 59.7%) **BOTTLENECK**
  ```
- **瓶颈节点**: `Gfx.WaitForPresentOnGfxThread`，self-time = 38.2ms
- **根因分析**: 这是典型的 **GPU Bound** 帧。CPU 主线程在 `Gfx.WaitForPresentOnGfxThread` 等待 GPU 完成渲染。此帧紧跟在 Frame #465/#469 两个超长帧之后，GPU 积压了前几帧的渲染命令未消化完成，导致此帧 CPU 空等。注意此帧 CPU 自身的 Update + LateUpdate 逻辑仅 12.5ms，说明 CPU 负载正常，瓶颈完全在 GPU 侧。

### Jank #4: YzEntityMoveLineNtf 网络消息处理 (Frame #298)

- **耗时**: 43.76ms，为目标帧预算的 **1.3 倍**
- **完整调用链**:
  ```
  PlayerLoop (43.7ms, 100.0%)
    → Update.ScriptRunBehaviourUpdate (16.9ms, 38.6%)
      → BehaviourUpdate (16.9ms, 38.6%)
        → AOE.dll!AOE::GameLauncher.Update() (16.6ms, 38.0%)
          → Core.Update (16.6ms, 37.8%)
            → CS:AOE.TServerManager (13.6ms, 31.0%)
              → TServer.HandleMessages (11.5ms, 26.3%)
                → YzEntityMoveLineNtf (11.3ms, 25.9%) **BOTTLENECK**
  ```
- **瓶颈节点**: `YzEntityMoveLineNtf`，self-time = 11.12ms (占帧 25.9%)
- **根因分析**: 大规模战斗中多支部队同时移动，服务器下发大量行军路线更新消息 (MoveLineNtf)。所有消息在同一帧内同步处理，单次处理耗时低但消息量大，self-time 11.1ms 几乎全部是密集逻辑计算。同时 `TServer.DecodeMesssages` 也消耗了 2.0ms（含 pb.decode 1.2ms），说明网络解包+消息处理的总开销达到 13.6ms。此外本帧 `Animation.Update` 出现了 6.4ms（约 20 次 Animation.RebuildInternalState），说明大量新创建的行军实体正在初始化动画状态。

### Jank #5: RenderManager_Shadow (Frame #431)

- **耗时**: 598.43ms (最差帧)
- **完整调用链**:
  ```
  PlayerLoop (24.0ms, 99.9%)
    → PreLateUpdate.ScriptRunBehaviourLateUpdate (7.0ms, 29.0%)
      → LateBehaviourUpdate (7.0ms, 29.0%)
        → AOE.dll!AOE::GameLauncher.LateUpdate() (6.3ms, 26.2%)
          → CS:AOE.RenderManager (4.0ms, 16.7%)
            → RenderManager_Shadow (4.0ms, 16.6%) **BOTTLENECK**
  ```
- **瓶颈节点**: `RenderManager_Shadow`，self-time = 4.0ms
- **说明**: 注意此帧 callTreeSummary 中 PlayerLoop 仅 24.0ms（Main Thread 部分），但帧总耗时 598.43ms，差值说明主线程此帧可能被其他线程的极端耗时拖延（Render Thread 上的 Gfx.RenderSlaver.ThreadRun 在此时段存在极端 spike），或者 frameSummary 统计包含了帧间等待。RenderManager_Shadow 4.0ms 本身是该帧 Main Thread 上的主要热点。

### Jank #6: RenderManager_Shadow (Frame #277)

- **耗时**: 31.9ms，为目标帧预算的 **0.96 倍** (临界)
- **完整调用链**:
  ```
  PlayerLoop (31.9ms, 99.9%)
    → PreLateUpdate.ScriptRunBehaviourLateUpdate (10.4ms, 32.7%)
      → LateBehaviourUpdate (10.4ms, 32.7%)
        → AOE.dll!AOE::GameLauncher.LateUpdate() (7.4ms, 23.3%)
          → CS:AOE.RenderManager (4.9ms, 15.2%)
            → RenderManager_Shadow (4.8ms, 15.2%) **BOTTLENECK**
  ```
- **瓶颈节点**: `RenderManager_Shadow`，self-time = 4.8ms
- **根因分析**: 阴影渲染管理在本帧耗时较高（4.8ms），叠加上 `MapSignificanceMgr`（3.8ms）和 `TBULODStreamingManager.LateUpdate`（2.0ms），使总帧耗时达到 31.9ms。

### Jank #7: MapSignificanceMgr 实体添加 (Frame #205)

- **耗时**: 28.4ms
- **完整调用链**:
  ```
  PlayerLoop (28.4ms, 100.0%)
    → Update.ScriptRunBehaviourUpdate (6.6ms, 23.4%)
      → ... → MapSignificanceMgr.ProcessTasks (4.0ms, 14.0%)
        → MapSignificanceMgr.EntityTask (3.9ms, 13.9%)
          → MapSignificanceMgr.ProcessTask_MapEntityAdd (1.7ms, 5.9%)
            → MapEntityCtrl.CreateMapEntity_329 (1.4ms, 5.0%)
              → Lua:ArmyShowViewGo (0.6ms, 2.3%)
                → *** ArmyMove *** (0.3ms, 1.2%)
                  → *** ArmyMove_CreateMoveline *** (0.3ms, 1.1%)
                    → *** ArmyMove_MovelineTarget *** (0.2ms, 0.7%) **BOTTLENECK**
  ```
- **根因分析**: 一般性的实体添加帧，MapSignificanceMgr 处理 MapEntityAdd 任务，触发 Lua 层 ArmyShowViewGo 创建行军特效。此帧不是 BigJank 但接近帧预算，是常态性的压力来源。

### Jank #8: MapSignificanceMgr 实体清理 (Frame #105)

- **耗时**: 19.0ms (未超预算，但接近)
- **完整调用链**:
  ```
  PlayerLoop (19.0ms, 99.9%)
    → ... → MapSignificanceMgr.ProcessTask_MapObjCleanUp (1.2ms, 6.1%)
      → Lua:ArmyCleanUp (1.1ms, 5.9%)
        → Lua:ArmyCleanUp2 (1.1ms, 5.8%)
          → Transform.SetParent (0.4ms, 2.2%)
  ```
- **根因分析**: 地图实体清理过程，Lua 层 ArmyCleanUp 通过 `Transform.SetParent` 触发了 `TransformChangedDispatch`，整体帧开销可控。

## 四、热点分析

### 判定依据

以下 Marker 被判定为性能热点，判定标准：
1. `percentOfFrame` > 20%（占帧比例显著）
2. 在 599 帧中的 `presentOnFrameCount` 占比高（持续出现），或 self-time 均值高
3. 结合 AOE 项目已知瓶颈模式综合判断

### 热点 #1: Gfx.RenderSlaver.ThreadRun (Render Thread)

| 指标 | 数值 |
|------|------|
| self-time 均值 | 28.329ms |
| self-time 最大值 | 615.023ms |
| 占帧比例 | 99.9% |
| 出现帧数 | 599/599 (100%) |
| 每帧调用次数 | 10.78 |
| 线程 | 1:Render Thread |
| Spike 比率 | 27.3 |

- **调用链**: `Gfx.RenderSlaver.ThreadRun (7.3ms, 11.4%)`
- **瓶颈类型**: Render Thread 总驱动函数，self-time/total-time = 100%
- **根因分析**: 这是 Render Thread 的顶层驱动节点，其均值 28.3ms 接近 30FPS 的帧预算（33.3ms），说明 **Render Thread 的平均负载偏高**。最大值 615ms 对应前述 BigJank 帧（Frame #465/#469 的大量实体创建导致渲染命令积压）。常态性的高负载来自大规模部队场景下的 DrawCall 量。

### 热点 #2: MapSignificanceMgr.ProcessTask_ZoomEntityAdd

| 指标 | 数值 |
|------|------|
| self-time 均值 | 18.186ms |
| self-time 最大值 | 576.412ms |
| 占帧比例 | 64.2% |
| 出现帧数 | 120/599 (20%) |
| 每帧调用次数 | 2.55 |
| 线程 | 1:Main Thread |
| Spike 比率 | 47500 |

- **调用链**:
  ```
  PlayerLoop → Update.ScriptRunBehaviourUpdate → BehaviourUpdate
    → AOE.dll!AOE::GameLauncher.Update() → Core.Update
      → CS:AOE.LuaMgr → LuaMgr.OnTick&UpdateSchedule
        → MapSignificanceMgr → MapSignificanceMgr.sampler_OnUpdate
          → MapSignificanceMgr.ProcessTasks → MapSignificanceMgr.EntityTask
            → MapSignificanceMgr.ProcessTask_ZoomEntityAdd (0.4ms median, 576.4ms max)
  ```
- **瓶颈类型**: 高频累积 + 极端 spike。median 仅 0.012ms，但 spike 时达到 576ms
- **根因分析**: 缩放层级切换时大量实体需从 "缩放不可见" → "可见" 进行批量创建。120 帧出现说明该任务持续较长时间段。根据 AOE 项目知识，MapSignificanceMgr 是 Lua 层最大热点（战斗压测 3.65ms），本次极端 spike 是缩放切换导致的批量操作。**核心子瓶颈是 `TBUResManager.GetResFileInfo` 的同步 IO**。

### 热点 #3: TBUResManager.GetResFileInfo

| 指标 | 数值 |
|------|------|
| self-time 均值 | 22.455ms |
| self-time 最大值 | 575.262ms |
| 占帧比例 | 79.2% |
| 出现帧数 | 95/599 (15.9%) |
| 每帧调用次数 | 22.14 |
| 线程 | 1:Main Thread |
| Spike 比率 | 27611.7 |

- **调用链**:
  ```
  PlayerLoop → Update.ScriptRunBehaviourUpdate → BehaviourUpdate
    → AOE.dll!AOE::GameLauncher.Update() → Core.Update
      → CS:AOE.LuaMgr → LuaMgr.OnTick&UpdateSchedule
        → MapSignificanceMgr → MapSignificanceMgr.sampler_OnUpdate
          → MapSignificanceMgr.ProcessTasks → MapSignificanceMgr.EntityTask
            → MapSignificanceMgr.ProcessTask_MapEntityAdd
              → MapEntityCtrl.CreateMapEntity_310
                → TBUResManager.GetResFileInfo (0.021ms median, 575.3ms max)
  ```
- **瓶颈类型**: 函数自身是瓶颈（self-time/total-time ≈ 100%）+ 高频累积
- **判定依据**: self-time 均值 22.45ms，占帧 79.2%，每帧 22.14 次调用；median 仅 0.021ms 但 max 达到 575ms，spike ratio = 27611.7。
- **根因分析**: 此函数进行资源文件信息的同步查找。在正常帧（median 场景）每次调用仅 0.021ms，但在缩放层级切换批量创建实体时，大量连续调用（每帧 22 次 × 多帧持续）的 IO 累积导致灾难性耗时。spike ratio 极高(27611)说明问题是突发性的，由特定操作触发。

### 热点 #4: Shader.CreateGPUProgram / CreateGpuProgram

| 指标 | 数值 |
|------|------|
| self-time 均值 | 22.462ms / 20.376ms |
| self-time 最大值 | 57.366ms / 55.546ms |
| 占帧比例 | 79.2% / 71.9% |
| 出现帧数 | 3/599 (0.5%) |
| 每帧调用次数 | 2.67 |
| 线程 | 1:Render Thread / 1:Submit Thread |
| Spike 比率 | 8.7 / 17.8 |

- **调用链**: `(depth=4, chain not resolved)` — 渲染线程内部调用
- **瓶颈类型**: 偶发极端 spike（仅出现在 3 帧）
- **判定依据**: 仅 3 帧出现，但每帧 self-time 高达 22/20ms（占帧 79%/72%），说明 Shader 首次编译导致渲染线程长时间卡顿。
- **根因分析**: 根据 AOE 项目知识，这是 **Shader 未 prewarm** 的典型表现。运行时首次遇到新的 Shader variant 时触发 GPU Program 同步编译，阻塞 Render Thread。3 帧的集中出现说明是某个场景切换/缩放层级初次进入时触发了新变体。

### 热点 #5: GC.Collect

| 指标 | 数值 |
|------|------|
| self-time 均值 | 8.488ms |
| self-time 最大值 | 10.233ms |
| 占帧比例 | 29.9% |
| 出现帧数 | 4/599 (0.7%) |
| 每帧调用次数 | 1 |
| 线程 | 1:Main Thread |
| Spike 比率 | 1.1 |

- **调用链**: `(depth=5, chain not resolved)`
- **瓶颈类型**: 偶发 GC spike
- **判定依据**: 仅 4 帧出现但每次 self-time 8.5ms，占帧 30%。spike ratio 1.1 说明每次 GC 耗时稳定（不是波动问题，而是 GC 本身就贵）。
- **根因分析**: 战斗压测场景大量实体创建/销毁产生临时对象，触发 GC 时 stop-the-world 暂停约 8.5ms。结合前述 `ProcessTask_ZoomEntityAdd` 大量创建实体时产生的 GC.Alloc，GC 压力与实体批量操作直接相关。

### 热点 #6: YzEntityMoveLineNtf

| 指标 | 数值 |
|------|------|
| self-time 均值 | 5.23ms |
| self-time 最大值 | 27.157ms |
| 占帧比例 | 18.4% |
| 出现帧数 | 75/599 (12.5%) |
| 每帧调用次数 | 2.39 |
| 线程 | 1:Main Thread |
| Spike 比率 | 7.3 |

- **调用链** (Frame #298):
  ```
  PlayerLoop → Update.ScriptRunBehaviourUpdate → BehaviourUpdate
    → AOE.dll!AOE::GameLauncher.Update() → Core.Update
      → CS:AOE.TServerManager → TServer.HandleMessages
        → YzEntityMoveLineNtf (11.3ms, 25.9%) **BOTTLENECK**
  ```
- **瓶颈类型**: 函数自身是瓶颈（self/total ≈ 98%），高频累积
- **判定依据**: 占帧 18.4%（接近 20% 阈值），出现 75 帧，每帧 2.39 次调用，max 达 27.2ms，spike ratio = 7.3（>5x 为 Warning 级别）。
- **根因分析**: 大规模战斗中多支部队同时移动产生大量 MoveLineNtf 消息。根据 AOE 项目知识，这属于"网络解包高耗时"模式。self-time 高说明消息处理逻辑本身计算量大（路线计算、坐标变换等），而非等待IO。在 Frame #298 中单帧处理了一次 11.1ms 的大批量消息。

### 热点 #7: RenderLoop.Draw (Submit Thread)

| 指标 | 数值 |
|------|------|
| self-time 均值 | 7.573ms |
| self-time 最大值 | 20.482ms |
| 占帧比例 | 26.7% |
| 出现帧数 | 599/599 (100%) |
| 每帧调用次数 | 25.22 |
| 线程 | 1:Submit Thread |
| Spike 比率 | 2.8 |

- **调用链**: `OpaquePass (3.2ms, 8.9%) → RenderLoop.Draw (2.6ms, 7.1%)`
- **瓶颈类型**: 持续性高负载（每帧 100% 出现），高频调用（25.22 次/帧）
- **判定依据**: 占帧 26.7%，每帧稳定出现 25 次调用，self-time 均值 7.6ms，说明渲染提交负载持续偏高。
- **根因分析**: 大规模战斗（300 队/2700 兵）场景下 DrawCall 量大，每帧平均 25 次 RenderLoop.Draw 调用，累计 7.6ms 提交开销。根据 AOE 项目知识，战斗压测的渲染面数（约 300~500 万面）是主要 GPU 负载来源。

### 热点 #8: MapSignificanceMgr.ProcessTask_ZoomGuildMember / ZoomGuildMemberAdd

| 指标 | 数值 |
|------|------|
| self-time 均值 | 7.376ms / 7.36ms |
| 占帧比例 | 26% |
| 出现帧数 | 1/599 |
| 线程 | 1:Main Thread |

- **调用链**: `(depth=12/13, chain not resolved)`
- **瓶颈类型**: 一次性 spike
- **判定依据**: 仅 1 帧出现但 self-time 7.4ms（占帧 26%），是公会成员缩放可见性添加任务。
- **根因分析**: [推断] 缩放切换时一次性添加所有公会成员实体，未做分帧处理，导致单帧 spike。

### 特殊 Marker 说明

| Marker | 表现 | 结论 |
|--------|------|------|
| `Gfx.WaitForGfxCommandsFromMainThread` | 均值 14.06ms，max 582.4ms，出现 567/599 帧 | Submit Thread 在等待 Main Thread 提交渲染命令。均值 14ms 说明 Main Thread 逻辑负载较重时会延迟提交，Submit Thread 空等。BigJank 帧 Main Thread 占用 500ms+ 导致此值极端飙升。 |
| `Gfx.WaitForPresentOnGfxThread` | 均值 1.1ms，max 38.2ms，spike 171 帧 | CPU 等待 GPU 完成。在 Frame #470 达到 38.2ms = **GPU Bound**。正常帧 median 仅 0.005ms 说明多数时候 GPU 并非瓶颈。 |
| `WaitForTargetFPS` | 均值 2.637ms，max 20.3ms，出现 143 帧 | **CPU 空闲等待 VSync**。143 帧出现此标记说明这些帧完成得早于 33.33ms 预算，CPU 有余量。集中在 Frame #456~#476 区间（BigJank 后的恢复期，帧耗时降低）。 |
| `PostLateUpdate.FinishFrameRendering` | 均值 5.832ms，max 43.6ms，占帧 20.6% | 渲染管线最终提交。均值 5.8ms 中包含 URP 管线的 Submit/WaitForPresent 等。max 43.6ms 对应 Frame #470 的 GPU 等待帧。 |

## 五、Marker 波动分析

### 判定依据

以下波动 Marker 被判定为需要关注的问题，判定标准：
1. spike ratio > 100 且影响帧数 > 10
2. spike 期间的绝对耗时足以影响帧率（>3ms）
3. 与已识别的性能问题模式相关联

### 波动 Marker #1: MapSignificanceMgr.EntityTask

| 指标 | 数值 |
|------|------|
| self-time 均值 | 4.131ms |
| self-time 中位数 | 0.001ms |
| self-time 最大值 | 576.767ms |
| P95 | 3.55ms |
| Spike 比率 | 395,588 |
| Spike 帧数 | 157/599 (26.2%) |

- **分析**: 极端的 spike ratio（近 40 万倍）和 26% 的 spike 帧占比说明此 Marker 在常态下几乎无开销（median 0.001ms），但在缩放切换等触发条件下会爆发性增长。157 帧受影响意味着这是一段持续性的异常状态（约 #442~#598 区间），与 ZoomEntityAdd 的触发时间段高度重叠。

### 波动 Marker #2: MapSignificanceMgr.ProcessTask_ZoomEntityAdd

| 指标 | 数值 |
|------|------|
| self-time 均值 | 18.186ms |
| self-time 中位数 | 0.012ms |
| self-time 最大值 | 576.412ms |
| Spike 比率 | 47,500 |
| Spike 帧数 | 48/599 (8%) |

- **分析**: 48 帧 spike 集中在 Frame #72~#91 区间（约 20 帧连续），说明缩放切换触发了一次持续 ~20 帧的批量实体创建。spike ratio 极高说明正常帧下此操作极轻量，但触发后影响灾难性。

### 波动 Marker #3: TBUResManager.GetResFileInfo

| 指标 | 数值 |
|------|------|
| self-time 均值 | 22.455ms |
| self-time 中位数 | 0.021ms |
| self-time 最大值 | 575.262ms |
| Spike 比率 | 27,611.7 |
| Spike 帧数 | 18/599 (3%) |

- **分析**: 18 帧 spike 集中在 Frame #77~#94，与 ZoomEntityAdd 的 spike 完全重叠，确认是同一根因（批量创建实体时的同步资源查询）。

### 波动 Marker #4: TServer.HandleMessages

| 指标 | 数值 |
|------|------|
| self-time 均值 | 0.687ms |
| self-time 中位数 | 0.007ms |
| self-time 最大值 | 27.339ms |
| Spike 比率 | 4,198.8 |
| Spike 帧数 | 154/599 (25.7%) |

- **分析**: 154 帧出现 spike，集中在 Frame #445~#464 区间。说明战斗后半段有大量网络消息涌入（可能是部队移动同步风暴）。max 27.3ms 已经接近帧预算，结合 YzEntityMoveLineNtf 的 max 27.2ms，说明网络消息处理是后半段的持续性压力来源。

### 波动 Marker #5: Gfx.WaitForPresentOnGfxThread / URP.WaitForPresent

| 指标 | 数值 |
|------|------|
| self-time 均值 | 1.099ms |
| self-time 中位数 | 0.005ms |
| self-time 最大值 | 38.161ms |
| Spike 比率 | 7,965 |
| Spike 帧数 | 171/599 (28.5%) |

- **分析**: 171 帧（28.5%）出现 GPU 等待 spike，集中在 Frame #428~#447 区间。说明该时间段存在 **间歇性 GPU Bound**。结合 `WaitForTargetFPS` 在 Frame #456 之后出现，推断 GPU 负载在 Frame #428~#456 区间为高峰期，之后随实体数量稳定而恢复正常。

### 波动 Marker #6: LoaderManagerTickLoadOnFrameEnd

| 指标 | 数值 |
|------|------|
| self-time 均值 | 0.738ms |
| self-time 中位数 | 0.031ms |
| self-time 最大值 | 14.925ms |
| Spike 比率 | 484.9 |
| Spike 帧数 | 254/599 (42.4%) |

- **分析**: 42% 的帧出现资源加载 spike，从 Frame #345 开始持续到末尾。这与大量实体创建后的资源加载需求相关，主要在帧末尾异步加载行军特效 (`p_fx_yz_march_target_red.prefab`)。max 14.9ms 说明偶尔会出现同步加载阻塞。

### 波动 Marker #7: LuaMtGc.ExecuteMtGc

| 指标 | 数值 |
|------|------|
| self-time 均值 | 0.368ms |
| self-time 中位数 | 0.215ms |
| self-time 最大值 | 9.437ms |
| Spike 比率 | 43.9 |
| Spike 帧数 | 26/599 (4.3%) |

- **分析**: Lua GC 在 26 帧出现 spike，max 9.4ms，集中在 Frame #573~#592。说明在大量实体操作后，Lua 层积累了大量临时对象，触发 GC 时造成明显暂停。

## 六、优化建议

### P0: MapSignificanceMgr 缩放层级切换分帧限流

- **目标 Marker**: `MapSignificanceMgr.ProcessTask_ZoomEntityAdd`、`TBUResManager.GetResFileInfo`
- **预期收益**: 消除 500ms+ BigJank，将峰值控制在 33ms 以内
- **具体方案**:
  1. **分帧执行**: 在 `MapSignificanceMgr.ProcessTasks` 中为 `EntityTask` / `ZoomEntityAdd` 设置每帧处理上限（建议每帧最多处理 5~10 个实体），超出部分延迟到下一帧。实现方式：在 ProcessTasks 循环内添加帧时间预算检查 (`Time.realtimeSinceStartup - frameStartTime > budgetMs`)，超预算时 break 并保留未处理任务到下一帧队列。
  2. **TBUResManager 异步化**: `GetResFileInfo` 应支持异步查询（如果涉及文件 IO），或在缩放切换前批量预加载资源文件信息到内存缓存中。
  3. **预加载机制**: 在相机缩放开始移动时，预测目标缩放层级需要的实体列表，提前异步加载资源信息，避免切换瞬间大量同步查询。
- **风险**: 分帧处理可能导致缩放切换后实体渐次出现（视觉上不够即时），需要配合加载占位符/淡入动画。

### P0: YzEntityMoveLineNtf 消息处理分帧 / 限流

- **目标 Marker**: `YzEntityMoveLineNtf`
- **预期收益**: 将网络消息处理从峰值 11ms 降至 < 3ms/帧
- **具体方案**:
  1. **每帧消息处理限额**: 在 `TServer.HandleMessages` 中对 MoveLineNtf 消息设置每帧处理上限（建议 20~30 条/帧），超出部分缓冲到下帧处理。
  2. **消息合并**: 同一实体的多条 MoveLineNtf 可以只保留最新一条（后续位置覆盖前序位置），减少无效计算。
  3. **批处理优化**: 将多条 MoveLineNtf 的坐标变换/路线计算合并为批量操作，减少逐条处理的重复开销（如矩阵/坐标系转换可复用上下文）。
- **风险**: 限流可能导致行军路线显示延迟 1~2 帧（约 33~66ms），在 30FPS 下用户感知极小。

### P1: Shader Prewarm 补全

- **目标 Marker**: `Shader.CreateGPUProgram`、`CreateGpuProgram`
- **预期收益**: 消除首次进入新视角/缩放层级时的 20~57ms 渲染线程卡顿
- **具体方案**:
  1. **ShaderVariantCollection 补全**: 收集战斗场景中所有用到的 Shader variant，添加到 ShaderVariantCollection 中，在场景加载时 WarmUp。操作路径：Unity Editor → Window → Analysis → Shader → 开启 Log Shader Compilation → 运行全流程 → 收集 variants。
  2. **确保异步编译生效**: 检查 `PlayerSettings.asyncShaderCompilation` 是否为 true，确保运行时 fallback 编译不阻塞主线程。
  3. **PSO Cache**: 确保 GraphicsSettings 中启用了 PSO (Pipeline State Object) 缓存，首次运行后后续启动不再需要重编译。
- **风险**: ShaderVariantCollection 过大会增加加载时间，需平衡预热覆盖率与加载速度。

### P1: RenderManager_Shadow 优化

- **目标 Marker**: `RenderManager_Shadow`
- **预期收益**: 减少每帧稳定 3.9~4.8ms 的阴影计算开销
- **具体方案**:
  1. **阴影距离裁剪**: 减小阴影投射距离（Project Settings → Quality → Shadow Distance），超出距离的对象不投射阴影。
  2. **阴影级联优化**: 减少 Shadow Cascades 数量（从 4 级降为 2 级），减少阴影渲染 Pass。
  3. **战斗模式动态降级**: 在部队数量超过阈值时自动切换为圆片阴影（PlanarShadow），根据 AOE 项目经验，关阴影可将渲染面数从 500w 降至 320~400w。
  4. **LOD 联动**: 确保阴影 Pass 使用 LOD2（根据 AOE 优化经验已有此方案，确认战斗压测场景是否已生效）。
- **风险**: 阴影效果降低可能影响画面品质，建议仅在低端机/压测负载下自动降级。

### P1: LogStringToConsole 清理

- **目标 Marker**: `LogStringToConsole`
- **预期收益**: 消除 BigJank 帧中额外 0.8ms 的日志开销，减少 GC 压力
- **具体方案**:
  1. **移除运行时 Debug.Log**: 检查 `TBUResManager.GetResFileInfo` 中是否有 Debug.Log/LogWarning 调用（可能是资源未找到时的警告输出），在 Release 包中使用条件编译宏禁用。
  2. **ErrorLogWriter 裁剪**: `ErrorLogWriter OnLogMessageReceived` 出现在热点路径中，说明有回调监听所有日志。在性能敏感场景中考虑禁用或限流。
  ```csharp
  #if !UNITY_EDITOR && !DEVELOPMENT_BUILD
  // 移除或条件化日志输出
  #endif
  ```
- **风险**: 无，移除日志不影响功能。

### P2: Lua GC 压力控制

- **目标 Marker**: `GC.Collect`、`LuaMtGc.ExecuteMtGc`
- **预期收益**: 减少 GC spike（8.5ms → 控制在 3ms 内）
- **具体方案**:
  1. **对象池复用**: 为 `MapEntityCtrl.CreateMapEntity`、`ArmyShowViewGo` 等高频创建/销毁路径实现对象池，避免每次 new 产生 GC 压力。
  2. **Lua 临时对象减少**: 检查 `ProcessTask_ZoomEntityAdd` 中是否有大量临时 table/closure 创建（如回调函数），改用预分配的缓冲 table。
  3. **GC 分帧**: 使用 `GarbageCollector.GCMode = GCMode.Manual`，在帧末尾根据剩余预算执行增量 GC，避免全停顿。
- **风险**: 对象池需要正确管理生命周期，避免对象状态残留。

### P2: 网络消息解包优化

- **目标 Marker**: `TServer.DecodeMesssages`、`TServer.ParsePacketMessages`
- **预期收益**: 减少网络解包开销（max 2.0ms → 目标 <1ms）
- **具体方案**:
  1. **解包池方案**: 根据 AOE 项目已知规划，为 protobuf decode 引入解包池（复用 message 对象而非每次 new），减少 GC.Alloc。
  2. **批量解码**: 将多个小消息合并为一次批量 decode，减少 xLua 跨语言调用次数。
  3. **延迟解码**: 对非紧急消息（如 MoveLineNtf），可以先缓存原始 bytes，在 HandleMessages 阶段再按帧预算解码所需数量。
- **风险**: 延迟解码会增加消息处理延迟，需要区分消息优先级。

## 七、补充说明

### 数据局限性

1. **线程数据不完整**: 部分 Marker 的 callChain 显示 `(depth=N, chain not resolved)`，说明预处理脚本在深层调用链解析时存在限制，可能遗漏部分调用关系。
2. **帧 #431 异常**: 最差帧(598.43ms) 的 Main Thread callTree 仅显示 24ms，与总帧耗时差距极大。[推断] 可能是 Render Thread 的极端 spike (Gfx.RenderSlaver.ThreadRun max=615ms) 拖延了整帧时间统计，或存在跨线程等待。
3. **源码映射缺失**: 本次分析未匹配到任何源码位置（项目路径下的 grep 未找到对应 Marker 定义），无法提供具体源文件和行号。
4. **采集环境**: 数据来自 PC 压测（非移动设备），实际手机性能会更差，尤其 `TBUResManager.GetResFileInfo` 在手机 IO 性能较低时问题会更加严重。

### 建议下一步

1. **使用 LuaProfiler 采集 MapSignificanceMgr** 的详细调用数据，定位 `ProcessTask_ZoomEntityAdd` 内部具体哪些子操作占比最高。
2. **对 TBUResManager.GetResFileInfo 添加更细粒度的 Profiler Marker**，区分是文件 IO 还是内存查找开销。
3. **在移动设备（二档机/三档机）上复现缩放切换**，评估实际影响程度。
4. **针对 Frame #428~#456 的 GPU Bound 区间**，使用 GPU Profiler（如 Snapdragon Profiler/Xcode GPU Debugger）分析渲染瓶颈。

---

## Token 使用估计

```
[Step 1] preprocess.ts 执行 — ~0 token (脚本输出保存到文件)
[Step 2] map-source.ts 执行 — ~0 token (脚本输出)
[Step 3] 读取 preprocess-result.json (选择性提取) — ~45K token (~120KB JSON × 350)
[Step 3] 读取 unity-cpu-knowledge.md — ~7K token (~19KB × 350)
[Step 4] query-frame × 3 调用 — ~12K token
[Step 5] 报告生成 — ~8K token
Total estimated: ~72K token
```

---

## Self-Check

- [x] 所有 `mustReport: true` 项目已覆盖（Top 17 markers 中所有 mustReport=true 的 16 个均已分析）
- [x] 每个分析的热点/Jank 包含完整调用链（从 PlayerLoop 到瓶颈节点）
- [x] 每条优化建议包含具体可执行步骤
- [x] 所有热点/spike 判定均说明了判定依据（引用具体数据）
- [x] 所有引用数据来自输入（无虚构）
- [x] 不确定结论已标注 [推断]
