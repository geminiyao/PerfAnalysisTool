# Unity Profiler CPU 性能分析报告

> 分析时间：2026/5/9 23:16:38

## 一、概览

| 指标 | 数值 |
|------|------|
| 总帧数 | 599 |
| 目标帧率 | 30 FPS |
| 实际平均帧率 | 35.3 FPS |
| 帧预算 | 33.33 ms |
| 判定结果 | ✅ 达标 |
| 平均帧耗时 | 28.35 ms |
| 中位帧耗时 | 22.33 ms |
| 最小帧耗时 | 13.76 ms（第 #6 帧） |
| 最大帧耗时 | 598.43 ms（第 #431 帧） |
| Q1/Q3 | 19.07 ms / 31.85 ms |
| 卡顿帧数 | 20 帧（阈值 51.02 ms） |
| Marker 种类 | 3002 |
| 最大 Marker 深度 | 26 |

**性能等级：🟢 Normal**

> ⚠️ 最差帧耗时是中位帧的 26.8 倍，存在极端卡顿帧，需重点排查。

## 二、Top Markers 分析（按中位耗时排序）

| # | Marker 名称 | 中位(ms) | 均值(ms) | 最大(ms) | 占帧% | 出现帧数 | 线程 |
|---|-------------|---------|---------|---------|-------|---------|------|
| 1 | `Semaphore.WaitForSignal` | 111.68 | 149.03 | 3570.57 | 525.7% | 599 | Main Thread |
| 2 | `Idle` | 77.95 | 102.06 | 2388.74 | 360.0% | 599 | Job.Worker |
| 3 | `Gfx.RenderSlaver.ThreadRun` | 22.56 | 28.33 | 615.02 | 99.9% | 599 | Render Thread |
| 4 | `PlayerLoop` | 22.31 | 28.33 | 598.42 | 99.9% | 599 | Main Thread |
| 5 | `Gfx.WaitForGfxCommandsFromMainThread` | 7.20 | 14.06 | 582.43 | 49.6% | 567 | Submit Thread |
| 6 | `RenderLoop.Draw` | 7.30 | 7.57 | 20.48 | 26.7% | 599 | Submit Thread |
| 7 | `PreLateUpdate.ScriptRunBehaviourLateUpdate` | 5.17 | 4.79 | 37.16 | 16.9% | 599 | Main Thread |
| 8 | `LateBehaviourUpdate` | 5.17 | 4.79 | 37.16 | 16.9% | 599 | Main Thread |
| 9 | `OpaquePass` | 4.39 | 4.58 | 14.17 | 16.2% | 599 | Submit Thread |
| 10 | `AOE.dll!AOE::GameLauncher.LateUpdate()` | 4.74 | 4.06 | 34.87 | 14.3% | 599 | Main Thread |
| 11 | `CS:AOE.RenderManager` | 3.43 | 2.33 | 21.09 | 8.2% | 599 | Main Thread |
| 12 | `RenderManager_Shadow` | 4.02 | 4.25 | 21.06 | 15.0% | 323 | Main Thread |
| 13 | `PostLateUpdate.FinishFrameRendering` | 4.95 | 5.83 | 43.61 | 20.6% | 599 | Main Thread |
| 14 | `Update.ScriptRunBehaviourUpdate` | 3.40 | 8.25 | 579.89 | 29.1% | 599 | Main Thread |
| 15 | `BehaviourUpdate` | 3.40 | 8.25 | 579.89 | 29.1% | 599 | Main Thread |
| 16 | `UnityEngine.CoreModule.dll!UnityEngine.Rendering::RenderP...` | 4.63 | 5.53 | 43.28 | 19.5% | 599 | Main Thread |
| 17 | `AOE.dll!AOE::GameLauncher.Update()` | 3.02 | 7.88 | 579.53 | 27.8% | 599 | Main Thread |
| 18 | `Core.Update` | 2.96 | 7.84 | 579.52 | 27.7% | 599 | Main Thread |
| 19 | `URP.Render` | 4.05 | 4.97 | 42.75 | 17.5% | 599 | Main Thread |
| 20 | `URP.RenderCameraStack` | 3.97 | 4.89 | 42.67 | 17.3% | 599 | Main Thread |

### 瓶颈类型分析

- ✅ 未检测到明显的单一瓶颈类型，性能较为均衡

## 三、关键帧调用树分析

### 最差帧 #431（598.43ms，26.8x median）

**Hot Path**: PlayerLoop (598.4ms, 100.0%) -> Update.ScriptRunBehaviourUpdate (579.9ms, 96.9%) -> BehaviourUpdate (579.9ms, 96.9%) -> AOE.dll!AOE::GameLauncher.Update() (579.5ms, 96.8%) -> Core.Update (579.5ms, 96.8%) -> CS:AOE.LuaMgr (577.6ms, 96.5%) -> LuaMgr.OnTick&UpdateSchedule (577.6ms, 96.5%) -> MapSignificanceMgr (576.9ms, 96.4%) -> MapSignificanceMgr.sampler_OnUpdate (576.9ms, 96.4%) -> MapSignificanceMgr.ProcessTasks (576.8ms, 96.4%) -> MapSignificanceMgr.EntityTask (576.8ms, 96.4%) -> MapSignificanceMgr.ProcessTask_ZoomEntityAdd (576.1ms, 96.3%) -> TBUResManager.GetResFileInfo (205.0ms, 34.3%) **BOTTLENECK** -> LogStringToConsole (1.0ms, 0.2%) **BOTTLENECK** -> UnityEngine.CoreModule.dll!UnityEngine::Application.CallLogCallback() (0.3ms, 0.1%) **BOTTLENECK** -> ErrorLogWriter OnLogMessageReceived (0.1ms, 0.0%) **BOTTLENECK** -> GC.Alloc (0.0ms, 0.0%) **BOTTLENECK**

**调用树**（仅显示 ≥ 1ms 节点）：
```
PlayerLoop: 598.4ms (100.0%) [self=0.3ms]
  Update.ScriptRunBehaviourUpdate: 579.9ms (96.9%)
    BehaviourUpdate: 579.9ms (96.9%)
      AOE.dll!AOE::GameLauncher.Update(): 579.5ms (96.8%)
        Core.Update: 579.5ms (96.8%)
          CS:AOE.LuaMgr: 577.6ms (96.5%)
            LuaMgr.OnTick&UpdateSchedule: 577.6ms (96.5%)
          CS:AOE.Outside.MapManager: 1.3ms (0.2%)
            CS:AOE.Outside.OutSideViewArmyLineMgr: 1.1ms (0.2%) [self=0.8ms]
  PreLateUpdate.ScriptRunBehaviourLateUpdate: 7.0ms (1.2%)
    LateBehaviourUpdate: 7.0ms (1.2%)
      AOE.dll!AOE::GameLauncher.LateUpdate(): 6.1ms (1.0%)
        CS:AOE.RenderManager: 4.5ms (0.8%)
          RenderManager_Shadow: 4.5ms (0.8%) [self=4.5ms]
        Core.LateUpdate: 1.4ms (0.2%)
  PostLateUpdate.FinishFrameRendering: 4.5ms (0.8%) [self=0.1ms]
    UnityEngine.CoreModule.dll!UnityEngine.Rendering::RenderPipelineManager.DoRenderLoop_Internal(): 4.3ms (0.7%)
      URP.Render: 3.8ms (0.6%)
        URP.RenderCameraStack: 3.5ms (0.6%)
          URP.RenderSingleCamera: 3.5ms (0.6%) [self=0.1ms]
            URP.MainRenderingTransparent: 1.4ms (0.2%) [self=0.3ms]
  PostLateUpdate.PlayerSendFrameComplete: 1.5ms (0.3%)
    PlayerEndOfFrame: 1.5ms (0.3%)
      CoroutinesDelayedCalls: 1.5ms (0.3%)
        AOE.dll!AOE::GameLauncher.EndOfFrame() [Coroutine: MoveNext]: 1.5ms (0.3%)
          Core.PostEndOfFrame: 1.4ms (0.2%)
            CS:AOE.ResManager: 1.3ms (0.2%)
```

### 中位帧 #417（22.33ms）

**Hot Path**: PlayerLoop (22.3ms, 99.9%) -> PreLateUpdate.ScriptRunBehaviourLateUpdate (6.6ms, 29.5%) -> LateBehaviourUpdate (6.6ms, 29.5%) -> AOE.dll!AOE::GameLauncher.LateUpdate() (5.2ms, 23.3%) -> CS:AOE.RenderManager (3.8ms, 17.0%) -> RenderManager_Shadow (3.8ms, 16.9%) **BOTTLENECK**

**调用树**（仅显示 ≥ 0.5ms 节点）：
```
PlayerLoop: 22.3ms (99.9%) [self=0.2ms]
  PreLateUpdate.ScriptRunBehaviourLateUpdate: 6.6ms (29.5%)
    LateBehaviourUpdate: 6.6ms (29.5%)
      AOE.dll!AOE::GameLauncher.LateUpdate(): 5.2ms (23.3%)
        CS:AOE.RenderManager: 3.8ms (17.0%)
          RenderManager_Shadow: 3.8ms (16.9%) [self=3.8ms]
        Core.LateUpdate: 1.3ms (6.0%)
          CS:AOE.LuaMgr: 0.8ms (3.8%)
      AOE.dll!::WorldTileStreaming.LateUpdate(): 0.8ms (3.7%)
        [VG] Refresh.RefreshTiles: 0.7ms (3.2%)
  PostLateUpdate.FinishFrameRendering: 3.7ms (16.6%) [self=0.1ms]
    UnityEngine.CoreModule.dll!UnityEngine.Rendering::RenderPipelineManager.DoRenderLoop_Internal(): 3.5ms (15.5%)
      URP.Render: 3.0ms (13.2%)
        URP.RenderCameraStack: 2.6ms (11.8%)
          URP.RenderSingleCamera: 2.6ms (11.6%) [self=0.1ms]
  Update.ScriptRunBehaviourUpdate: 3.6ms (15.9%)
    BehaviourUpdate: 3.6ms (15.9%)
      AOE.dll!AOE::GameLauncher.Update(): 3.2ms (14.3%)
        Core.Update: 3.2ms (14.3%)
          CS:AOE.Outside.MapManager: 1.3ms (6.0%)
          CS:AOE.TServerManager: 1.0ms (4.6%)
          CS:AOE.LuaMgr: 0.7ms (3.2%)
  PostLateUpdate.PlayerSendFrameComplete: 2.5ms (11.4%)
    PlayerEndOfFrame: 2.5ms (11.4%)
      CoroutinesDelayedCalls: 2.5ms (11.4%)
        AOE.dll!AOE::GameLauncher.EndOfFrame() [Coroutine: MoveNext]: 2.5ms (11.3%)
          Core.PostEndOfFrame: 2.4ms (10.7%)
  PreLateUpdate.LegacyAnimationUpdate: 1.6ms (7.0%)
  PostLateUpdate.PlayerUpdateCanvases: 0.9ms (3.9%)
    UIEvents.WillRenderCanvases: 0.9ms (3.9%)
      UGUI.Rendering.UpdateBatches: 0.9ms (3.9%)
        UnityEngine.UIModule.dll!UnityEngine::Canvas.SendWillRenderCanvases(): 0.7ms (3.0%)
```

## 四、卡顿帧分析

共检测到 **20** 个卡顿帧（阈值：51.02ms，占总帧数 3.3%）

**卡顿原因分类：**
- 未知: 9 帧
- 渲染: 7 帧
- 脚本: 4 帧

**Top 10 最严重卡顿帧：**

| 帧号 | 耗时(ms) | 中位倍数 | 类型 | 主要 Marker |
|------|---------|---------|------|------------|
| #431 | 3570.57 | 32.0x | 未知 | `Semaphore.WaitForSignal` |
| #470 | 3387.07 | 30.3x | 未知 | `Semaphore.WaitForSignal` |
| #466 | 3258.54 | 29.2x | 未知 | `Semaphore.WaitForSignal` |
| #469 | 3226.01 | 28.9x | 未知 | `Semaphore.WaitForSignal` |
| #472 | 349.96 | 3.1x | 未知 | `Semaphore.WaitForSignal` |
| #277 | 330.27 | 3.0x | 未知 | `Semaphore.WaitForSignal` |
| #205 | 323.15 | 2.9x | 未知 | `Semaphore.WaitForSignal` |
| #298 | 320.67 | 2.9x | 未知 | `Semaphore.WaitForSignal` |
| #471 | 237.28 | 3.0x | 未知 | `Idle` |
| #468 | 47.03 | 275.4x | 渲染 | `Gfx.UploadTexture` |

**卡顿帧调用树（Top 3）：**

#### 卡顿帧 #431（3570.57ms，32.0x median，类型：未知）
**Hot Path**: PlayerLoop (598.4ms, 100.0%) -> Update.ScriptRunBehaviourUpdate (579.9ms, 96.9%) -> BehaviourUpdate (579.9ms, 96.9%) -> AOE.dll!AOE::GameLauncher.Update() (579.5ms, 96.8%) -> Core.Update (579.5ms, 96.8%) -> CS:AOE.LuaMgr (577.6ms, 96.5%) -> LuaMgr.OnTick&UpdateSchedule (577.6ms, 96.5%) -> MapSignificanceMgr (576.9ms, 96.4%) -> MapSignificanceMgr.sampler_OnUpdate (576.9ms, 96.4%) -> MapSignificanceMgr.ProcessTasks (576.8ms, 96.4%) -> MapSignificanceMgr.EntityTask (576.8ms, 96.4%) -> MapSignificanceMgr.ProcessTask_ZoomEntityAdd (576.1ms, 96.3%) -> TBUResManager.GetResFileInfo (205.0ms, 34.3%) **BOTTLENECK** -> LogStringToConsole (1.0ms, 0.2%) **BOTTLENECK** -> UnityEngine.CoreModule.dll!UnityEngine::Application.CallLogCallback() (0.3ms, 0.1%) **BOTTLENECK** -> ErrorLogWriter OnLogMessageReceived (0.1ms, 0.0%) **BOTTLENECK** -> GC.Alloc (0.0ms, 0.0%) **BOTTLENECK**
```
PlayerLoop: 598.4ms (100.0%) [self=0.3ms]
  Update.ScriptRunBehaviourUpdate: 579.9ms (96.9%)
    BehaviourUpdate: 579.9ms (96.9%)
      AOE.dll!AOE::GameLauncher.Update(): 579.5ms (96.8%)
        Core.Update: 579.5ms (96.8%)
          CS:AOE.LuaMgr: 577.6ms (96.5%)
          CS:AOE.Outside.MapManager: 1.3ms (0.2%)
  PreLateUpdate.ScriptRunBehaviourLateUpdate: 7.0ms (1.2%)
    LateBehaviourUpdate: 7.0ms (1.2%)
      AOE.dll!AOE::GameLauncher.LateUpdate(): 6.1ms (1.0%)
        CS:AOE.RenderManager: 4.5ms (0.8%)
          RenderManager_Shadow: 4.5ms (0.8%) [self=4.5ms]
        Core.LateUpdate: 1.4ms (0.2%)
  PostLateUpdate.FinishFrameRendering: 4.5ms (0.8%) [self=0.1ms]
    UnityEngine.CoreModule.dll!UnityEngine.Rendering::RenderPipelineManager.DoRenderLoop_Internal(): 4.3ms (0.7%)
      URP.Render: 3.8ms (0.6%)
        URP.RenderCameraStack: 3.5ms (0.6%)
          URP.RenderSingleCamera: 3.5ms (0.6%) [self=0.1ms]
  PostLateUpdate.PlayerSendFrameComplete: 1.5ms (0.3%)
    PlayerEndOfFrame: 1.5ms (0.3%)
      CoroutinesDelayedCalls: 1.5ms (0.3%)
        AOE.dll!AOE::GameLauncher.EndOfFrame() [Coroutine: MoveNext]: 1.5ms (0.3%)
          Core.PostEndOfFrame: 1.4ms (0.2%)
```

#### 卡顿帧 #470（3387.07ms，30.3x median，类型：未知）
**Hot Path**: PlayerLoop (557.1ms, 100.0%) -> Update.ScriptRunBehaviourUpdate (536.7ms, 96.3%) -> BehaviourUpdate (536.7ms, 96.3%) -> AOE.dll!AOE::GameLauncher.Update() (535.9ms, 96.2%) -> Core.Update (535.8ms, 96.2%) -> CS:AOE.LuaMgr (528.0ms, 94.8%) -> LuaMgr.OnTick&UpdateSchedule (528.0ms, 94.8%) -> MapSignificanceMgr (525.4ms, 94.3%) -> MapSignificanceMgr.sampler_OnUpdate (525.4ms, 94.3%) -> MapSignificanceMgr.ProcessTasks (525.4ms, 94.3%) -> MapSignificanceMgr.EntityTask (525.4ms, 94.3%) -> MapSignificanceMgr.ProcessTask_ZoomEntityAdd (524.9ms, 94.2%) -> TBUResManager.GetResFileInfo (178.4ms, 32.0%) **BOTTLENECK** -> LogStringToConsole (0.9ms, 0.2%) **BOTTLENECK** -> UnityEngine.CoreModule.dll!UnityEngine::Application.CallLogCallback() (0.2ms, 0.0%) **BOTTLENECK** -> ErrorLogWriter OnLogMessageReceived (0.1ms, 0.0%) **BOTTLENECK** -> GC.Alloc (0.0ms, 0.0%) **BOTTLENECK**
```
PlayerLoop: 557.1ms (100.0%) [self=0.3ms]
  Update.ScriptRunBehaviourUpdate: 536.7ms (96.3%)
    BehaviourUpdate: 536.7ms (96.3%)
      AOE.dll!AOE::GameLauncher.Update(): 535.9ms (96.2%)
        Core.Update: 535.8ms (96.2%)
          CS:AOE.LuaMgr: 528.0ms (94.8%)
          CS:AOE.TServerManager: 6.1ms (1.1%)
          CS:AOE.Outside.MapManager: 1.3ms (0.2%)
  PreLateUpdate.ScriptRunBehaviourLateUpdate: 5.6ms (1.0%)
    LateBehaviourUpdate: 5.6ms (1.0%)
      AOE.dll!AOE::GameLauncher.LateUpdate(): 5.1ms (0.9%)
        CS:AOE.RenderManager: 4.2ms (0.7%)
          RenderManager_Shadow: 4.1ms (0.7%) [self=4.1ms]
  PostLateUpdate.FinishFrameRendering: 4.9ms (0.9%) [self=0.1ms]
    UnityEngine.CoreModule.dll!UnityEngine.Rendering::RenderPipelineManager.DoRenderLoop_Internal(): 4.7ms (0.8%)
      URP.Render: 4.2ms (0.8%)
        URP.RenderCameraStack: 3.9ms (0.7%)
          URP.RenderSingleCamera: 3.9ms (0.7%) [self=0.1ms]
  PostLateUpdate.PlayerSendFrameComplete: 3.5ms (0.6%)
    PlayerEndOfFrame: 3.5ms (0.6%)
      CoroutinesDelayedCalls: 3.5ms (0.6%)
        AOE.dll!AOE::GameLauncher.EndOfFrame() [Coroutine: MoveNext]: 3.5ms (0.6%)
          Core.PostEndOfFrame: 3.3ms (0.6%)
```

#### 卡顿帧 #466（3258.54ms，29.2x median，类型：未知）
**Hot Path**: PlayerLoop (546.0ms, 100.0%) -> Update.ScriptRunBehaviourUpdate (525.7ms, 96.3%) -> BehaviourUpdate (525.7ms, 96.3%) -> AOE.dll!AOE::GameLauncher.Update() (525.4ms, 96.2%) -> Core.Update (525.4ms, 96.2%) -> CS:AOE.LuaMgr (523.4ms, 95.9%) -> LuaMgr.OnTick&UpdateSchedule (523.4ms, 95.9%) -> MapSignificanceMgr (522.9ms, 95.8%) -> MapSignificanceMgr.sampler_OnUpdate (522.9ms, 95.8%) -> MapSignificanceMgr.ProcessTasks (522.5ms, 95.7%) -> MapSignificanceMgr.EntityTask (522.5ms, 95.7%) -> MapSignificanceMgr.ProcessTask_ZoomEntityAdd (521.0ms, 95.4%) -> TBUResManager.GetResFileInfo (180.8ms, 33.1%) **BOTTLENECK** -> LogStringToConsole (0.8ms, 0.2%) **BOTTLENECK** -> UnityEngine.CoreModule.dll!UnityEngine::Application.CallLogCallback() (0.2ms, 0.0%) **BOTTLENECK** -> ErrorLogWriter OnLogMessageReceived (0.1ms, 0.0%) **BOTTLENECK** -> GC.Alloc (0.0ms, 0.0%) **BOTTLENECK**
```
PlayerLoop: 546.0ms (100.0%) [self=0.3ms]
  Update.ScriptRunBehaviourUpdate: 525.7ms (96.3%)
    BehaviourUpdate: 525.7ms (96.3%)
      AOE.dll!AOE::GameLauncher.Update(): 525.4ms (96.2%)
        Core.Update: 525.4ms (96.2%)
          CS:AOE.LuaMgr: 523.4ms (95.9%)
          CS:AOE.Outside.MapManager: 1.1ms (0.2%)
  PreLateUpdate.ScriptRunBehaviourLateUpdate: 6.0ms (1.1%)
    LateBehaviourUpdate: 6.0ms (1.1%)
      AOE.dll!AOE::GameLauncher.LateUpdate(): 5.7ms (1.0%)
        CS:AOE.RenderManager: 3.9ms (0.7%)
          RenderManager_Shadow: 3.9ms (0.7%) [self=3.9ms]
        Core.LateUpdate: 1.7ms (0.3%)
  PostLateUpdate.FinishFrameRendering: 4.8ms (0.9%) [self=0.1ms]
    UnityEngine.CoreModule.dll!UnityEngine.Rendering::RenderPipelineManager.DoRenderLoop_Internal(): 4.6ms (0.8%) [self=0.1ms]
      URP.Render: 4.0ms (0.7%)
        URP.RenderCameraStack: 3.7ms (0.7%)
          URP.RenderSingleCamera: 3.7ms (0.7%) [self=0.1ms]
  PostLateUpdate.PlayerSendFrameComplete: 3.1ms (0.6%)
    PlayerEndOfFrame: 3.1ms (0.6%)
      CoroutinesDelayedCalls: 3.1ms (0.6%)
        AOE.dll!AOE::GameLauncher.EndOfFrame() [Coroutine: MoveNext]: 3.1ms (0.6%)
          Core.PostEndOfFrame: 3.0ms (0.5%)
  PreLateUpdate.LegacyAnimationUpdate: 1.4ms (0.3%)
```

## 五、线程分析

| 线程名称 | 中位(ms) | 均值(ms) | 最大(ms) | 最小(ms) |
|---------|---------|---------|---------|---------|
| Render Thread | 22.56 | - | 615.02 | 7.10 |
| Loading.AsyncRead | 22.33 | - | 598.43 | 13.76 |
| Loading.PreloadManager | 22.33 | - | 598.43 | 13.76 |
| Main Thread | 22.31 | - | 598.42 | 13.74 |
| Other Threads.BatchDeleteObjects | 22.29 | - | 598.43 | 13.70 |
| Submit Thread | 21.12 | - | 615.05 | 10.38 |
| Other Threads.UnitySocketWriter | 20.99 | - | 597.85 | 5.36 |
| Job.Worker | 1.81 | - | 12.93 | 0.38 |
| Job.Worker | 1.81 | - | 6.22 | 0.44 |
| Job.Worker | 1.77 | - | 12.87 | 0.52 |

## 六、优化建议

**1. [Critical] 🔴 优化 `Semaphore.WaitForSignal`**
   - 均值 149.03ms，占帧 525.7%，最大 3570.57ms

**2. [Critical] 🔴 优化 `Idle`**
   - 均值 102.06ms，占帧 360.0%，最大 2388.74ms

**3. [Critical] 🔴 优化 `Gfx.RenderSlaver.ThreadRun`**
   - 均值 28.33ms，占帧 99.9%，最大 615.02ms

**4. [Critical] 🔴 优化 `PlayerLoop`**
   - 均值 28.33ms，占帧 99.9%，最大 598.42ms

**5. [Critical] 🔴 优化 `Gfx.WaitForGfxCommandsFromMainThread`**
   - 均值 14.06ms，占帧 49.6%，最大 582.43ms

**6. [Warning] 卡顿帧处理**
   - 卡顿帧占比 3.3%（20/599 帧），超过 5% 会明显影响体验

## 七、总结

本次分析共 599 帧数据，平均帧率 35.3 FPS（目标 30 FPS）。

**主要瓶颈**：`Semaphore.WaitForSignal`（中位 111.68ms，占帧 525.7%）
**最严重卡顿**：第 #431 帧，耗时 3570.57ms（中位帧的 32.0 倍），触发 Marker：`Semaphore.WaitForSignal`

**优化优先级建议**：
