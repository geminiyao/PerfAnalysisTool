# 性能分析报告 · unity-outside-stressmove

## 总判定：🔴 不合格

> Every one of 600 frames misses the 16.67ms (60fps) budget; median frame (41.90ms) is 2.5x over budget, driven by a high continuous baseline (URP render pipeline + script Update spread-cost) plus severe periodic GC.Collect stalls (up to 70.20ms, 61.82% of a single frame) and camera-move spikes (up to 53.41ms).

**目标**：16.67ms/帧（60fps）　**实测**：中位 41.9ms、p95 59.3ms、p99 95.5ms、最差 113.3ms@帧519

**超预算帧占比**：100.0%（其中超 2 倍预算：100.0%）

## 🎯 主要成因（按影响排序）

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

## 详细发现（9 条）

### 🔴 [F1] CRITICAL　置信度：高

Every frame in the capture (600/600) exceeds the 16.67ms (60fps) frame budget; median frame time is 41.90ms (2.51x over budget), p95=59.31ms, p99=95.45ms, max=113.29ms. This is not an occasional dip -- it is a permanent, whole-run failure to hit 60fps.

**推理**：Both thresholded queries against the full 600-frame timeline return sizeA=600, i.e. no frame in the run ever hits the 16.67ms budget, and none even hit half that rate (33.34ms/30fps). Combined with p50=41.90ms being already 2.5x the budget, this establishes the run's baseline performance is fundamentally below 30fps for its entire duration, not a targeted fps drop during specific events.

**建议**：Treat this as a systemic capacity problem, not a bug hunt for a single spike. Profile and reduce the continuous baseline cost (see F7/F8) before chasing individual spikes, since removing every spike in this run would still leave frames at ~40ms.

_标签：overall-verdict / frame-budget_

<details><summary>证据链（点开）</summary>

  - `scanMetricOverFrames(thread=1:Main Thread, markerName=PlayerLoop, metric=totalMs)` → frameCount=600, presentFrames=600, mean=44.53, p50=41.90, p95=59.31, p99=95.45, max=113.29 @frame519
  - `correlateFrameSets(setA={"kind":"slowFrames","thresholdMs":16.67}, setB={"kind":"slowFrames","thresholdMs":33.34})` → sizeA=600, sizeB=600, intersection=600 -- all 600 frames exceed both 1x and 2x the budget

</details>

### 🔴 [F2] CRITICAL　置信度：高

A synchronous, blocking GC.Collect call consumed 61.82% of the single worst frame in the run (frame 519, 113.56ms total, 70.20ms in GC.Collect). A second, smaller GC.Collect occurred at frame 483 (15.33ms, 26.68% of that frame). Frame-level counters show frame 519's gc_allocated_in_frame was only 8192 bytes (normal), proving this was NOT an allocation-triggered GC -- it is a deliberate/scheduled full collection whose cost is disproportionate to any allocation pressure at that moment.

**推理**：The GC.Collect marker only appears in 3 of 600 frames, so it is rare, but its cost when it fires is the single largest contributor to the worst frame in the entire run. Since the allocation counter at frame 519 was normal, the trigger is not a burst of garbage -- it points to a scheduled/forced collection (possibly originating from the Lua GC bridge, given it nests under CS:AOE.LuaMgr), independent of actual memory pressure at that instant.

**建议**：Investigate what triggers this synchronous GC.Collect call under CS:AOE.LuaMgr -- likely a Lua-side forced/full collection call bridged into C#. If it is on a timer or triggered by a Lua-side heuristic rather than real memory pressure, either switch to fully incremental GC or throttle/stagger the trigger so it never lands as a single 70ms blocking spike.

_标签：gc / spike / blocking_

<details><summary>证据链（点开）</summary>

  - `scanMetricOverFrames(thread=1:Main Thread, markerName=GC.Collect, metric=selfMs)` → presentFrames=3, max=70.20ms @frame519, burstFrames=[483,519]
  - `getFrameCallTree(frameIndex=519, thread=Main Thread)` → hotPath: PlayerLoop -> PostLateUpdate.PlayerSendFrameComplete(66.67%) -> ... -> CS:AOE.LuaMgr(66.31%, selfMs=4.87) -> GC.Collect(selfMs=70.20, pctOfFrame=61.82%)
  - `queryFrameCounters(frameRange=[515,520])` → gc_allocated_in_frame at frame519 = 8192 bytes (low, not an allocation spike)
  - `getFrameCallTree(frameIndex=483, thread=Main Thread)` → hotPath: Initialization.PlayerUpdateTime(32.96%) -> WaitForTargetFPS -> GarbageCollector.CollectIncremental(selfMs=3.51, totalMs=18.84) -> GC.Collect(selfMs=15.33, pctOfFrame=26.68%)

</details>

### 🟠 [F3] HIGH　置信度：高

GarbageCollector.CollectIncremental shows strong periodicity (autocorrelation coefficient=0.68 at lag=2) with an unusually dense 20-frame burst window (frames 462-481) that immediately precedes and feeds into the frame-483 GC.Collect spike (F2). This indicates a recurring incremental-GC cycle building up pressure that occasionally resolves in an expensive synchronous collection, rather than isolated independent events.

**推理**：presentFrames=600 means this marker fires on essentially every frame with a tiny baseline cost, but the autocorrelation signal (0.68 at lag 2) is unusually strong for a profiler metric and the burst window is a contiguous 20-frame run right before the frame-483 GC.Collect event (F2). This is consistent with Unity's incremental GC accumulating unswept garbage over a window and eventually triggering (or being followed by) a full synchronous collect.

**建议**：Correlate this periodic buildup with the game's allocation pattern in that time window (see DataRequest D1) to identify what is allocating steadily during frames 462-481. Reducing steady-state allocation in that window would reduce both the incremental GC overhead and the odds of the downstream full GC.Collect stall.

_标签：gc / periodicity_

<details><summary>证据链（点开）</summary>

  - `scanMetricOverFrames(thread=1:Main Thread, markerName=GarbageCollector.CollectIncremental, metric=selfMs)` → presentFrames=600, p99=1.068ms, max=3.51ms@483, spikeRatio=1142.19, autocorr={bestLag:2, coefficient:0.68}, burstFrames=[462..481] (20 consecutive frames)

</details>

### 🟠 [F4] HIGH　置信度：高

Camera-movement processing (OnCameraMove / MapCameraCtrl.UpdateCameraPos) is a sufficient-but-not-necessary cause of frame slowdowns: every one of its 18-19 spike frames overlaps 100% with the slow-frame set, and its peak cost (53.41ms self at frame 144, 58.38% of that frame's total) makes it the single largest contributor to the second-worst frame in the run. However it only explains a small fraction (~3%) of all slow frames overall, since it is rare (present in only 19/600 frames).

**推理**：The 100% pctBinA overlap confirms causality in one direction (camera-move events always coincide with slow frames), while the low pctAinB confirms this is not the dominant driver of the run's overall slowness -- most slow frames happen without any camera movement at all, pointing to the separate continuous baseline cost (F7/F8).

**建议**：Given this is a 'stressmove' scenario specifically designed to exercise camera movement, MapCameraCtrl.UpdateCameraPos and InfiniteZoomMgr.PostCameraMoveScale should be profiled for per-frame allocations or O(n) work scaling with visible entity count during camera pans; a 53ms single call is disproportionate for a per-frame camera update.

_标签：spike / camera-move_

<details><summary>证据链（点开）</summary>

  - `queryMarkers(thread=Main Thread, markerName=OnCameraMove)` → sumSelfMs=819.69 over 19 present frames, avgSelfMsPerPresentFrame=43.14, maxSelfMs=53.41 @frame144
  - `scanMetricOverFrames(thread=1:Main Thread, markerName=OnCameraMove, metric=selfMs)` → presentFrames=19, p99=49.87, max=53.41@144, burstFrames=[24,43,54,64,74,99,129,144,154,179,224,238,256,276,293,330,402,451] (18 frames)
  - `getFrameCallTree(frameIndex=144, thread=Main Thread)` → hotPath: PreLateUpdate.ScriptRunBehaviourLateUpdate -> ... -> MapCameraCtrl.UpdateCameraPos(totalMs=56.32, pctOfFrame=58.38%)
  - `correlateFrameSets(setA={"kind":"slowFrames","thresholdMs":33.34}, setB={"kind":"markerSpike","markerName":"OnCameraMove","minSelfMs":10})` → pctBinA=100% (every OnCameraMove spike frame is a slow frame), pctAinB=3.17% (only explains ~3% of all slow frames)

</details>

### 🟡 [F5] MEDIUM　置信度：高

Resource-unload scanning (LoaderManagerTryUnloadPending, nested under PostLateUpdate.PlayerSendFrameComplete) produces rare but large single-frame spikes: 5 burst frames (80, 102, 146, 414, 464) with totalMs up to 29.31ms (30.45% of frame 80's total 70.09ms frame time). All 5 burst frames fall within the slow-frame set (100% overlap), confirming this pattern is a real, repeatable contributor to specific slow frames, not a one-off.

**推理**：The recurrence of the identical hotPath shape (PlayerSendFrameComplete -> LoaderManagerTryUnloadPending at ~30% of frame) at both frame 80 and frame 256 rules out coincidence -- this is a periodic asset-unload scan whose cost scales with something (likely pending-unload queue size) and occasionally spikes to ~30ms.

**建议**：Investigate the pending-unload queue growth pattern (see DataRequest D2) and consider spreading the unload scan across multiple frames (time-sliced budget) instead of processing it in one synchronous pass.

_标签：spike / resource-unload_

<details><summary>证据链（点开）</summary>

  - `scanMetricOverFrames(thread=1:Main Thread, markerName=LoaderManagerTryUnloadPending, metric=totalMs)` → presentFrames=600, p99=4.69ms, max=29.31ms@146, spikeRatio=513.46, burstFrames=[80,102,146,414,464]
  - `getFrameCallTree(frameIndex=80, thread=Main Thread)` → hotPath: PostLateUpdate.PlayerSendFrameComplete(31.26%) -> ... -> LoaderManagerTryUnloadPending(totalMs=21.34, pctOfFrame=30.45%)
  - `getFrameCallTree(frameIndex=256, thread=Main Thread)` → Same hotPath pattern reproduced at frame 256 (98.17ms frame): PostLateUpdate.PlayerSendFrameComplete(31.26%) -> LoaderManagerTryUnloadPending(30.45%) -- confirms this is a repeating pattern, not isolated to frame 80
  - `correlateFrameSets(setA={"kind":"slowFrames","thresholdMs":16.67}, setB={"kind":"frameList","frames":[80,102,146,414,464]})` → pctBinA=100% -- all 5 burst frames are within the slow-frame set

</details>

### 🟡 [F6] MEDIUM　置信度：高

The Lua multithreaded GC bridge (LuaMtGc.ExecuteMtGc, running on its own '1:Lua.GC' thread) produced an isolated spike of 21.59ms self time at frame 194 -- 43.53% of that thread's total time for the frame (frame msFrame=49.60ms) -- despite averaging only 0.59ms/frame across the rest of the run (spikeRatio=36.5). This is a distinct GC event source from the Main Thread's GC.Collect (F2) and CollectIncremental (F3).

**推理**：This marker is present in all 600 frames at a tiny baseline (0.59ms avg), confirming it is a background/incremental multithread GC worker, but its single spike to 21.59ms at frame 194 is a distinct GC subsystem (Lua's own multithread GC, separate thread) from the Main Thread GC.Collect events at frames 483/519. It shows the game has at least two independent GC systems (C# and Lua) each capable of producing isolated large stalls.

**建议**：Since this runs on a dedicated thread, it does not directly block Main Thread unless something on Main Thread waits on it; verify (via DataRequest D3, since the 8 tools cannot show cross-thread wait dependency for this specific marker) whether frame 194's Main Thread was blocked waiting for this Lua GC pass to complete, or if it truly ran in parallel without stalling the frame.

_标签：gc / spike / lua_

<details><summary>证据链（点开）</summary>

  - `scanPeakMarkers(thread=all, excludeWaits=true)` → LuaMtGc.ExecuteMtGc: presentFrames=600, avgWhenPresent=0.59ms, peakFrameSelf=21.59ms@frame194, spikeRatio=36.5
  - `getFrameCallTree(frameIndex=194, thread=1:Lua.GC)` → Single marker LuaMtGc.ExecuteMtGc, selfMs=21.59, pctOfFrame=43.53% (relative to frame194 msFrame=49.60ms)

</details>

### 🟡 [F7] MEDIUM　置信度：高

The URP rendering pipeline contributes a large, distributed (non-spiky) continuous cost: URP.RenderSingleCamera averages 10.64ms/frame as a subtree, spread across MainRenderingTransparent (2.98ms), AfterRendering (2.59ms), RendererSetup (2.34ms), BeforeRendering (1.85ms) and other stages with no single child exceeding 28% of the subtree (maxChildRatio=0.28). This is a 'spread-cost' pattern -- there is no single rendering hotspot to optimize, the cost is inherent to the pipeline's stage count.

**推理**：maxChildRatio=0.28 means even the single most expensive child stage only accounts for 28% of the subtree's cost -- there is no dominant bottleneck stage inside URP rendering, meaning per-stage micro-optimization has limited ceiling; the fix has to be structural (e.g. fewer render passes, simplified shader complexity, or reduced draw calls feeding the whole pipeline).

**建议**：Since no single URP stage dominates, focus on reducing input to the whole pipeline (draw call count, active render features, transparent overdraw) rather than optimizing an individual stage. Cross-check against queryFrameCounters' batches/set_pass_calls/triangles trend (see DataRequest D4 if per-frame batch counts need deeper per-camera breakdown).

_标签：spread-cost / gpu-present / rendering_

<details><summary>证据链（点开）</summary>

  - `aggregateSubtree(thread=Main Thread, rootMarker=URP.RenderSingleCamera, minTotalMsPerFrame=1)` → subtreeMsPerFrame=10.64, maxChildRatio=0.28, topChildren: MainRenderingTransparent=2.976, AfterRendering=2.593, RendererSetup=2.337, BeforeRendering=1.849

</details>

### 🟡 [F8] MEDIUM　置信度：高

Script Update logic under Core.Update contributes another large distributed continuous cost: 12.88ms/frame subtree, split across CS:AOE.LuaMgr (6.82ms), CS:AOE.Outside.MapManager (4.84ms), and CS:AOE.TServerManager (0.92ms), with no single child dominating (maxChildRatio=0.53). Combined with the URP rendering cost (F7), these two subtrees alone account for ~23.5ms/frame of the ~44.5ms average frame time -- roughly half the total frame budget overrun comes from just these two spread-cost subsystems.

**推理**：The frame-100 call tree breakdown (a non-burst, ordinary frame) independently reproduces the same proportions as the aggregateSubtree averages, cross-validating that this is the steady-state baseline cost affecting essentially every frame, not an artifact of averaging in a few outlier frames.

**建议**：CS:AOE.LuaMgr's Update tick is the single biggest of these three script subsystems (6.82ms/frame average); investigate what per-frame Lua-side work runs there (see DataRequest D5 for Lua-side function-level profiling, which the current 8 tools cannot break down further since Lua calls appear as opaque C# marker boundaries).

_标签：spread-cost / script-update_

<details><summary>证据链（点开）</summary>

  - `aggregateSubtree(thread=Main Thread, rootMarker=Core.Update, minTotalMsPerFrame=1)` → subtreeMsPerFrame=12.879, maxChildRatio=0.53, topChildren: CS:AOE.LuaMgr=6.822, CS:AOE.Outside.MapManager=4.837, CS:AOE.TServerManager=0.924
  - `getFrameCallTree(frameIndex=100, thread=Main Thread)` → BehaviourUpdate=35.68% of frame, of which Core.Update=31.35% (LuaMgr 13.77% + MapManager 11.97% + TServerManager 5.10%) -- consistent with the aggregateSubtree breakdown

</details>

### 🟢 [F9] LOW　置信度：高

GPU/Present-wait costs (Gfx.WaitForPresentOnGfxThread, URP.WaitForPresent, Semaphore.WaitForSignal on Main Thread) are real but limited to a small set of 17 burst frames (totalMs up to 19.84ms, spikeRatio=1607) and do NOT correlate with the run's general slowness: correlating these 17 burst frames against the full slow-frame set (600 frames >16.67ms) gives pctAinB=2.83% -- i.e. present-wait bursts explain under 3% of all slow frames. In frame 22 specifically (59.36ms total), these three wait markers together account for ~60ms of mainThreadWaits time, but this is an isolated case, not the run-wide pattern.

**推理**：While present-wait costs are dramatic in the few frames they spike (frame22 shows CPU essentially idle waiting for GPU/VSync for a third of the frame), the low pctAinB confirms this is not the general explanation for why the run is slow -- the vast majority of slow frames have no significant present-wait component, consistent with F7/F8's continuous CPU-side cost being the dominant baseline driver instead.

**建议**：Deprioritize present-wait investigation relative to F2/F3/F7/F8; only worth revisiting if a future capture shows this pattern becoming the majority driver (e.g. after CPU-side costs are reduced and the game becomes GPU-bound).

_标签：gpu-present / thread-wait / low-impact_

<details><summary>证据链（点开）</summary>

  - `scanMetricOverFrames(thread=1:Main Thread, markerName=Gfx.WaitForPresentOnGfxThread, metric=totalMs)` → presentFrames=600, mean=0.95ms, p95=6.50, p99=13.14, max=19.84@frame22, spikeRatio=1607.01, burstFrames=[5,8,21,22,23,28,58,60,86,133,185,193,207,211,214,216,221] (17 frames)
  - `getThreadTimeline(frameIndex=22)` → mainThreadWaits top3: Semaphore.WaitForSignal=20.68ms, URP.WaitForPresent=19.84ms, Gfx.WaitForPresentOnGfxThread=19.84ms (frame msFrame=59.36ms)
  - `correlateFrameSets(setA={"kind":"slowFrames","thresholdMs":16.67}, setB={"kind":"frameList","frames":[5,8,21,22,23,28,58,60,86,133,185,193,207,211,214,216,221]})` → sizeA=600, sizeB=17, intersection=17, pctBinA=100% (all 17 burst frames are slow), pctAinB=2.83% (only explain 2.83% of all slow frames)

</details>

---
_Prism 探索：60 次查询　证据核对：10/23 通过_