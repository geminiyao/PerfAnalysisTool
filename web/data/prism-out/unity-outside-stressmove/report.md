# 性能分析报告 · unity-outside-stressmove

## 总判定：🔴 不合格

> Every one of 600 frames misses the 16.67ms (60fps) budget; median frame (41.90ms) is 2.5x over budget, driven by a high continuous baseline (URP render pipeline + script Update spread-cost) plus severe periodic GC.Collect stalls (up to 70.20ms, 61.82% of a single frame) and camera-move spikes (up to 53.41ms).

| 指标 | 数值 |
|------|------|
| 目标帧预算 | 16.7ms / 60fps |
| 实测中位（P50） | 41.9ms |
| P95 | 59.3ms |
| P99 | 95.5ms |
| 最差帧 | 113.3ms（帧 #519） |
| 超预算帧占比 | 100.0%（其中超 2× 预算：100.0%） |

---

## §0 结论先行

**1. Continuous baseline cost (spread across render pipeline + script Update, no single hotspot)**

   Accounts for the ~41-55ms floor seen on ordinary, non-burst frames (e.g. frames 20/40/60/100/234 = 48.64/45.86/54.88/41.40/46.91ms).

   _依据：aggregateSubtree(Core.Update)；aggregateSubtree(URP.RenderSingleCamera)_

**2. Synchronous GC.Collect stalls**

   Single-frame spikes up to 70.20ms (61.82% of frame 519) and 15.33ms (26.68% of frame 483); rare (3/600 frames) but catastrophic when they occur.

   _依据：scanMetricOverFrames(GC.Collect)；getFrameCallTree(519)；getFrameCallTree(483)_

**3. Periodic incremental GC pressure**

   Strong autocorrelation (coefficient=0.68 at lag=2) with a 20-frame burst window (462-481), preceding the frame-483 GC.Collect spike -- indicates a recurring GC cycle, not a one-off.

   _依据：scanMetricOverFrames(GarbageCollector.CollectIncremental)_

**4. Camera-move stalls (OnCameraMove / MapCameraCtrl.UpdateCameraPos)**

   19 frames affected, avg 43.14ms/frame when present, peak 53.41ms @ frame144 (58.38% of that frame). 100% of these spike frames fall inside the slow-frame set, but they only explain ~3% of all slow frames.

   _依据：queryMarkers(OnCameraMove)；scanMetricOverFrames(OnCameraMove)；correlateFrameSets(slowFrames vs OnCameraMove spikes)_

**5. Resource-unload scan spikes (LoaderManagerTryUnloadPending)**

   5 burst frames (80,102,146,414,464), max 29.31ms totalMs (30.45% of frame 80's 70.09ms total), all 5 fall within the slow-frame set (100% overlap) but are a small (0.83%) contributor overall.

   _依据：scanMetricOverFrames(LoaderManagerTryUnloadPending)；getFrameCallTree(80)；correlateFrameSets_

---

## §1 详细发现（9 条）

### 🔴 发现1：Every frame in the capture (60

<sub>严重度：**严重** ｜ 置信度：**高置信**</sub>

Every frame in the capture (600/600) exceeds the 16.67ms (60fps) frame budget; median frame time is 41.90ms (2.51x over budget), p95=59.31ms, p99=95.45ms, max=113.29ms. This is not an occasional dip -- it is a permanent, whole-run failure to hit 60fps.

**优化建议**

Treat this as a systemic capacity problem, not a bug hunt for a single spike. Profile and reduce the continuous baseline cost (see F7/F8) before chasing individual spikes, since removing every spike in this run would still leave frames at ~40ms.

_标签：overall-verdict · frame-budget_

---

### 🔴 发现2：A synchronous, blocking GC.Col

<sub>严重度：**严重** ｜ 置信度：**高置信**</sub>

A synchronous, blocking GC.Collect call consumed 61.82% of the single worst frame in the run (frame 519, 113.56ms total, 70.20ms in GC.Collect). A second, smaller GC.Collect occurred at frame 483 (15.33ms, 26.68% of that frame). Frame-level counters show frame 519's gc_allocated_in_frame was only 8192 bytes (normal), proving this was NOT an allocation-triggered GC -- it is a deliberate/scheduled full collection whose cost is disproportionate to any allocation pressure at that moment.

**优化建议**

Investigate what triggers this synchronous GC.Collect call under CS:AOE.LuaMgr -- likely a Lua-side forced/full collection call bridged into C#. If it is on a timer or triggered by a Lua-side heuristic rather than real memory pressure, either switch to fully incremental GC or throttle/stagger the trigger so it never lands as a single 70ms blocking spike.

_标签：gc · spike · blocking_

---

### 🟠 发现3：GarbageCollector.CollectIncrem

<sub>严重度：**高** ｜ 置信度：**高置信**</sub>

GarbageCollector.CollectIncremental shows strong periodicity (autocorrelation coefficient=0.68 at lag=2) with an unusually dense 20-frame burst window (frames 462-481) that immediately precedes and feeds into the frame-483 GC.Collect spike (F2). This indicates a recurring incremental-GC cycle building up pressure that occasionally resolves in an expensive synchronous collection, rather than isolated independent events.

**优化建议**

Correlate this periodic buildup with the game's allocation pattern in that time window (see DataRequest D1) to identify what is allocating steadily during frames 462-481. Reducing steady-state allocation in that window would reduce both the incremental GC overhead and the odds of the downstream full GC.Collect stall.

_标签：gc · periodicity_

---

### 🟠 发现4：Camera-movement processing (On

<sub>严重度：**高** ｜ 置信度：**高置信**</sub>

Camera-movement processing (OnCameraMove / MapCameraCtrl.UpdateCameraPos) is a sufficient-but-not-necessary cause of frame slowdowns: every one of its 18-19 spike frames overlaps 100% with the slow-frame set, and its peak cost (53.41ms self at frame 144, 58.38% of that frame's total) makes it the single largest contributor to the second-worst frame in the run. However it only explains a small fraction (~3%) of all slow frames overall, since it is rare (present in only 19/600 frames).

**优化建议**

Given this is a 'stressmove' scenario specifically designed to exercise camera movement, MapCameraCtrl.UpdateCameraPos and InfiniteZoomMgr.PostCameraMoveScale should be profiled for per-frame allocations or O(n) work scaling with visible entity count during camera pans; a 53ms single call is disproportionate for a per-frame camera update.

_标签：spike · camera-move_

---

### 🟡 发现5：Resource-unload scanning (Load

<sub>严重度：**中** ｜ 置信度：**高置信**</sub>

Resource-unload scanning (LoaderManagerTryUnloadPending, nested under PostLateUpdate.PlayerSendFrameComplete) produces rare but large single-frame spikes: 5 burst frames (80, 102, 146, 414, 464) with totalMs up to 29.31ms (30.45% of frame 80's total 70.09ms frame time). All 5 burst frames fall within the slow-frame set (100% overlap), confirming this pattern is a real, repeatable contributor to specific slow frames, not a one-off.

**优化建议**

Investigate the pending-unload queue growth pattern (see DataRequest D2) and consider spreading the unload scan across multiple frames (time-sliced budget) instead of processing it in one synchronous pass.

_标签：spike · resource-unload_

---

### 🟡 发现6：The Lua multithreaded GC bridg

<sub>严重度：**中** ｜ 置信度：**高置信**</sub>

The Lua multithreaded GC bridge (LuaMtGc.ExecuteMtGc, running on its own '1:Lua.GC' thread) produced an isolated spike of 21.59ms self time at frame 194 -- 43.53% of that thread's total time for the frame (frame msFrame=49.60ms) -- despite averaging only 0.59ms/frame across the rest of the run (spikeRatio=36.5). This is a distinct GC event source from the Main Thread's GC.Collect (F2) and CollectIncremental (F3).

**优化建议**

Since this runs on a dedicated thread, it does not directly block Main Thread unless something on Main Thread waits on it; verify (via DataRequest D3, since the 8 tools cannot show cross-thread wait dependency for this specific marker) whether frame 194's Main Thread was blocked waiting for this Lua GC pass to complete, or if it truly ran in parallel without stalling the frame.

_标签：gc · spike · lua_

---

### 🟡 发现7：The URP rendering pipeline con

<sub>严重度：**中** ｜ 置信度：**高置信**</sub>

The URP rendering pipeline contributes a large, distributed (non-spiky) continuous cost: URP.RenderSingleCamera averages 10.64ms/frame as a subtree, spread across MainRenderingTransparent (2.98ms), AfterRendering (2.59ms), RendererSetup (2.34ms), BeforeRendering (1.85ms) and other stages with no single child exceeding 28% of the subtree (maxChildRatio=0.28). This is a 'spread-cost' pattern -- there is no single rendering hotspot to optimize, the cost is inherent to the pipeline's stage count.

**调用树摘要**

```
subtreeMsPerFrame=10.64, maxChildRatio=0.28, topChildren: MainRenderingTransparent=2.976, AfterRendering=2.593, RendererSetup=2.337, BeforeRendering=1.849
```

**优化建议**

Since no single URP stage dominates, focus on reducing input to the whole pipeline (draw call count, active render features, transparent overdraw) rather than optimizing an individual stage. Cross-check against queryFrameCounters' batches/set_pass_calls/triangles trend (see DataRequest D4 if per-frame batch counts need deeper per-camera breakdown).

_标签：spread-cost · gpu-present · rendering_

---

### 🟡 发现8：Script Update logic under Core

<sub>严重度：**中** ｜ 置信度：**高置信**</sub>

Script Update logic under Core.Update contributes another large distributed continuous cost: 12.88ms/frame subtree, split across CS:AOE.LuaMgr (6.82ms), CS:AOE.Outside.MapManager (4.84ms), and CS:AOE.TServerManager (0.92ms), with no single child dominating (maxChildRatio=0.53). Combined with the URP rendering cost (F7), these two subtrees alone account for ~23.5ms/frame of the ~44.5ms average frame time -- roughly half the total frame budget overrun comes from just these two spread-cost subsystems.

**调用树摘要**

```
subtreeMsPerFrame=12.879, maxChildRatio=0.53, topChildren: CS:AOE.LuaMgr=6.822, CS:AOE.Outside.MapManager=4.837, CS:AOE.TServerManager=0.924
```

**优化建议**

CS:AOE.LuaMgr's Update tick is the single biggest of these three script subsystems (6.82ms/frame average); investigate what per-frame Lua-side work runs there (see DataRequest D5 for Lua-side function-level profiling, which the current 8 tools cannot break down further since Lua calls appear as opaque C# marker boundaries).

_标签：spread-cost · script-update_

---

### 🟢 发现9：GPU/Present-wait costs (Gfx.Wa

<sub>严重度：**低** ｜ 置信度：**高置信**</sub>

GPU/Present-wait costs (Gfx.WaitForPresentOnGfxThread, URP.WaitForPresent, Semaphore.WaitForSignal on Main Thread) are real but limited to a small set of 17 burst frames (totalMs up to 19.84ms, spikeRatio=1607) and do NOT correlate with the run's general slowness: correlating these 17 burst frames against the full slow-frame set (600 frames >16.67ms) gives pctAinB=2.83% -- i.e. present-wait bursts explain under 3% of all slow frames. In frame 22 specifically (59.36ms total), these three wait markers together account for ~60ms of mainThreadWaits time, but this is an isolated case, not the run-wide pattern.

**优化建议**

Deprioritize present-wait investigation relative to F2/F3/F7/F8; only worth revisiting if a future capture shows this pattern becoming the majority driver (e.g. after CPU-side costs are reduced and the game becomes GPU-bound).

_标签：gpu-present · thread-wait · low-impact_

---

_Prism 探索：60 次查询　证据核对：10/23 通过　｜ 技术论证/证据链见 report-audit.md_
