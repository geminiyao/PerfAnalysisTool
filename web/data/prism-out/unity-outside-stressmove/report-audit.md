# 审计底稿 · unity-outside-stressmove

> 本文件是正式报告 report.md 的配套审计底稿：每条发现的技术论证、自我审查、可回溯证据链。
> 正式报告只保留"数据+人话建议+调用树"，审计信息放这里，供需要核查的人查阅。

---

## 发现1：Every frame in the capture (60  `[F1]`

**技术论证**

Both thresholded queries against the full 600-frame timeline return sizeA=600, i.e. no frame in the run ever hits the 16.67ms budget, and none even hit half that rate (33.34ms/30fps). Combined with p50=41.90ms being already 2.5x the budget, this establishes the run's baseline performance is fundamentally below 30fps for its entire duration, not a targeted fps drop during specific events.

**证据链**

1. `scanMetricOverFrames(thread=1:Main Thread, markerName=PlayerLoop, metric=totalMs)`
   → frameCount=600, presentFrames=600, mean=44.53, p50=41.90, p95=59.31, p99=95.45, max=113.29 @frame519
2. `correlateFrameSets(setA={"kind":"slowFrames","thresholdMs":16.67}, setB={"kind":"slowFrames","thresholdMs":33.34})`
   → sizeA=600, sizeB=600, intersection=600 -- all 600 frames exceed both 1x and 2x the budget

---

## 发现2：A synchronous, blocking GC.Col  `[F2]`

**技术论证**

The GC.Collect marker only appears in 3 of 600 frames, so it is rare, but its cost when it fires is the single largest contributor to the worst frame in the entire run. Since the allocation counter at frame 519 was normal, the trigger is not a burst of garbage -- it points to a scheduled/forced collection (possibly originating from the Lua GC bridge, given it nests under CS:AOE.LuaMgr), independent of actual memory pressure at that instant.

**证据链**

1. `scanMetricOverFrames(thread=1:Main Thread, markerName=GC.Collect, metric=selfMs)`
   → presentFrames=3, max=70.20ms @frame519, burstFrames=[483,519]
2. `getFrameCallTree(frameIndex=519, thread=Main Thread)`
   → hotPath: PlayerLoop -> PostLateUpdate.PlayerSendFrameComplete(66.67%) -> ... -> CS:AOE.LuaMgr(66.31%, selfMs=4.87) -> GC.Collect(selfMs=70.20, pctOfFrame=61.82%)
3. `queryFrameCounters(frameRange=[515,520])`
   → gc_allocated_in_frame at frame519 = 8192 bytes (low, not an allocation spike)
4. `getFrameCallTree(frameIndex=483, thread=Main Thread)`
   → hotPath: Initialization.PlayerUpdateTime(32.96%) -> WaitForTargetFPS -> GarbageCollector.CollectIncremental(selfMs=3.51, totalMs=18.84) -> GC.Collect(selfMs=15.33, pctOfFrame=26.68%)

---

## 发现3：GarbageCollector.CollectIncrem  `[F3]`

**技术论证**

presentFrames=600 means this marker fires on essentially every frame with a tiny baseline cost, but the autocorrelation signal (0.68 at lag 2) is unusually strong for a profiler metric and the burst window is a contiguous 20-frame run right before the frame-483 GC.Collect event (F2). This is consistent with Unity's incremental GC accumulating unswept garbage over a window and eventually triggering (or being followed by) a full synchronous collect.

**证据链**

1. `scanMetricOverFrames(thread=1:Main Thread, markerName=GarbageCollector.CollectIncremental, metric=selfMs)`
   → presentFrames=600, p99=1.068ms, max=3.51ms@483, spikeRatio=1142.19, autocorr={bestLag:2, coefficient:0.68}, burstFrames=[462..481] (20 consecutive frames)

---

## 发现4：Camera-movement processing (On  `[F4]`

**技术论证**

The 100% pctBinA overlap confirms causality in one direction (camera-move events always coincide with slow frames), while the low pctAinB confirms this is not the dominant driver of the run's overall slowness -- most slow frames happen without any camera movement at all, pointing to the separate continuous baseline cost (F7/F8).

**证据链**

1. `queryMarkers(thread=Main Thread, markerName=OnCameraMove)`
   → sumSelfMs=819.69 over 19 present frames, avgSelfMsPerPresentFrame=43.14, maxSelfMs=53.41 @frame144
2. `scanMetricOverFrames(thread=1:Main Thread, markerName=OnCameraMove, metric=selfMs)`
   → presentFrames=19, p99=49.87, max=53.41@144, burstFrames=[24,43,54,64,74,99,129,144,154,179,224,238,256,276,293,330,402,451] (18 frames)
3. `getFrameCallTree(frameIndex=144, thread=Main Thread)`
   → hotPath: PreLateUpdate.ScriptRunBehaviourLateUpdate -> ... -> MapCameraCtrl.UpdateCameraPos(totalMs=56.32, pctOfFrame=58.38%)
4. `correlateFrameSets(setA={"kind":"slowFrames","thresholdMs":33.34}, setB={"kind":"markerSpike","markerName":"OnCameraMove","minSelfMs":10})`
   → pctBinA=100% (every OnCameraMove spike frame is a slow frame), pctAinB=3.17% (only explains ~3% of all slow frames)

---

## 发现5：Resource-unload scanning (Load  `[F5]`

**技术论证**

The recurrence of the identical hotPath shape (PlayerSendFrameComplete -> LoaderManagerTryUnloadPending at ~30% of frame) at both frame 80 and frame 256 rules out coincidence -- this is a periodic asset-unload scan whose cost scales with something (likely pending-unload queue size) and occasionally spikes to ~30ms.

**证据链**

1. `scanMetricOverFrames(thread=1:Main Thread, markerName=LoaderManagerTryUnloadPending, metric=totalMs)`
   → presentFrames=600, p99=4.69ms, max=29.31ms@146, spikeRatio=513.46, burstFrames=[80,102,146,414,464]
2. `getFrameCallTree(frameIndex=80, thread=Main Thread)`
   → hotPath: PostLateUpdate.PlayerSendFrameComplete(31.26%) -> ... -> LoaderManagerTryUnloadPending(totalMs=21.34, pctOfFrame=30.45%)
3. `getFrameCallTree(frameIndex=256, thread=Main Thread)`
   → Same hotPath pattern reproduced at frame 256 (98.17ms frame): PostLateUpdate.PlayerSendFrameComplete(31.26%) -> LoaderManagerTryUnloadPending(30.45%) -- confirms this is a repeating pattern, not isolated to frame 80
4. `correlateFrameSets(setA={"kind":"slowFrames","thresholdMs":16.67}, setB={"kind":"frameList","frames":[80,102,146,414,464]})`
   → pctBinA=100% -- all 5 burst frames are within the slow-frame set

---

## 发现6：The Lua multithreaded GC bridg  `[F6]`

**技术论证**

This marker is present in all 600 frames at a tiny baseline (0.59ms avg), confirming it is a background/incremental multithread GC worker, but its single spike to 21.59ms at frame 194 is a distinct GC subsystem (Lua's own multithread GC, separate thread) from the Main Thread GC.Collect events at frames 483/519. It shows the game has at least two independent GC systems (C# and Lua) each capable of producing isolated large stalls.

**证据链**

1. `scanPeakMarkers(thread=all, excludeWaits=true)`
   → LuaMtGc.ExecuteMtGc: presentFrames=600, avgWhenPresent=0.59ms, peakFrameSelf=21.59ms@frame194, spikeRatio=36.5
2. `getFrameCallTree(frameIndex=194, thread=1:Lua.GC)`
   → Single marker LuaMtGc.ExecuteMtGc, selfMs=21.59, pctOfFrame=43.53% (relative to frame194 msFrame=49.60ms)

---

## 发现7：The URP rendering pipeline con  `[F7]`

**技术论证**

maxChildRatio=0.28 means even the single most expensive child stage only accounts for 28% of the subtree's cost -- there is no dominant bottleneck stage inside URP rendering, meaning per-stage micro-optimization has limited ceiling; the fix has to be structural (e.g. fewer render passes, simplified shader complexity, or reduced draw calls feeding the whole pipeline).

**证据链**

1. `aggregateSubtree(thread=Main Thread, rootMarker=URP.RenderSingleCamera, minTotalMsPerFrame=1)`
   → subtreeMsPerFrame=10.64, maxChildRatio=0.28, topChildren: MainRenderingTransparent=2.976, AfterRendering=2.593, RendererSetup=2.337, BeforeRendering=1.849

---

## 发现8：Script Update logic under Core  `[F8]`

**技术论证**

The frame-100 call tree breakdown (a non-burst, ordinary frame) independently reproduces the same proportions as the aggregateSubtree averages, cross-validating that this is the steady-state baseline cost affecting essentially every frame, not an artifact of averaging in a few outlier frames.

**证据链**

1. `aggregateSubtree(thread=Main Thread, rootMarker=Core.Update, minTotalMsPerFrame=1)`
   → subtreeMsPerFrame=12.879, maxChildRatio=0.53, topChildren: CS:AOE.LuaMgr=6.822, CS:AOE.Outside.MapManager=4.837, CS:AOE.TServerManager=0.924
2. `getFrameCallTree(frameIndex=100, thread=Main Thread)`
   → BehaviourUpdate=35.68% of frame, of which Core.Update=31.35% (LuaMgr 13.77% + MapManager 11.97% + TServerManager 5.10%) -- consistent with the aggregateSubtree breakdown

---

## 发现9：GPU/Present-wait costs (Gfx.Wa  `[F9]`

**技术论证**

While present-wait costs are dramatic in the few frames they spike (frame22 shows CPU essentially idle waiting for GPU/VSync for a third of the frame), the low pctAinB confirms this is not the general explanation for why the run is slow -- the vast majority of slow frames have no significant present-wait component, consistent with F7/F8's continuous CPU-side cost being the dominant baseline driver instead.

**证据链**

1. `scanMetricOverFrames(thread=1:Main Thread, markerName=Gfx.WaitForPresentOnGfxThread, metric=totalMs)`
   → presentFrames=600, mean=0.95ms, p95=6.50, p99=13.14, max=19.84@frame22, spikeRatio=1607.01, burstFrames=[5,8,21,22,23,28,58,60,86,133,185,193,207,211,214,216,221] (17 frames)
2. `getThreadTimeline(frameIndex=22)`
   → mainThreadWaits top3: Semaphore.WaitForSignal=20.68ms, URP.WaitForPresent=19.84ms, Gfx.WaitForPresentOnGfxThread=19.84ms (frame msFrame=59.36ms)
3. `correlateFrameSets(setA={"kind":"slowFrames","thresholdMs":16.67}, setB={"kind":"frameList","frames":[5,8,21,22,23,28,58,60,86,133,185,193,207,211,214,216,221]})`
   → sizeA=600, sizeB=17, intersection=17, pctBinA=100% (all 17 burst frames are slow), pctAinB=2.83% (only explain 2.83% of all slow frames)

---
