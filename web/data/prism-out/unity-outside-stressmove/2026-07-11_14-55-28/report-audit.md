# 审计底稿 · 2026-07-11_14-55-28

> 本文件是正式报告 report.md 的配套审计底稿：每条发现的技术论证、自我审查、可回溯证据链。
> 正式报告只保留"数据+人话建议+调用树"，审计信息放这里，供需要核查的人查阅。

---

## 发现1：全程基线超预算  `[baseline.main.overbudget]`

**技术论证**

60fps 预算是 16.67ms，但 PlayerLoop 的 p50 为 41.89875030517578ms、p99 为 95.44776153564453ms；correlateFrameSets 显示 600/600 帧超过 16.67ms，且 600/600 帧也超过 33.33ms。aggregateSubtree 进一步说明它不是单点等待造成的，而是 Core.Update 12.879ms/帧、URP.RenderSingleCamera 10.64ms/帧、Core.LateUpdate 6.857ms/帧、Lua 调度和地图管理共同构成稳定高基线。

**自我审查**

已按广度扫描得到候选，再对进入主因的 Core/Lua/MapManager/URP/MeshUI 做 drillDown。严重度按 600/600 帧超 16.67ms 和 600/600 帧超 33.33ms 判为 critical，不用单个尖峰放大结论。

**证据链**

1. `scanMetricOverFrames(markerName=PlayerLoop, thread=1:Main Thread, metric=totalMs)`
   → frameCount: 600.00 · presentFrames: 600.00 · mean: 44.53 · p50: 41.90 · p95: 59.31 · p99: 95.45 · max: 113.29 · maxFrameIndex: 519.00
2. `correlateFrameSets(setA={"kind":"slowFrames","thresholdMs":16.67}, setB={"kind":"slowFrames","thresholdMs":16.67})`
   → sizeA: 600.00 · sizeB: 600.00 · intersection: 600.00 · pctAinB: 100.00 · pctBinA: 100.00
3. `correlateFrameSets(setA={"kind":"slowFrames","thresholdMs":33.33}, setB={"kind":"slowFrames","thresholdMs":33.33})`
   → sizeA: 600.00 · sizeB: 600.00 · intersection: 600.00 · pctAinB: 100.00 · pctBinA: 100.00
4. `aggregateSubtree(thread=1:Main Thread, topN=10, fanoutThreshold=0.6, minTotalMsPerFrame=2)`
   → Core.Update.subtreeMsPerFrame: 12.88 · URP.RenderSingleCamera.subtreeMsPerFrame: 10.64 · Core.LateUpdate.subtreeMsPerFrame: 6.86 · LuaMgr.OnTick&UpdateSchedule.subtreeMsPerFrame: 6.75 · CS:AOE.Outside.MapManager.subtreeMsPerFrame: 6.14

---

## 发现2：重要性任务常驻重  `[lua.mapsignificance.entitytask]`

**技术论证**

LuaMgr drillDown 证明 MapSignificanceMgr 不是父级包装：EntityTask 平均 3.5737ms/帧，其中 MapEntityAdd 1.5462ms/帧、MapObjRefresh 1.1977ms/帧、MapObjCleanUp 0.4696ms/帧。frame321 反例检查显示它确实能单帧放大到 22.48979377746582ms，占帧 37.41544211944121%。

**自我审查**

按深度要求从 LuaMgr 钻到 MapSignificanceMgr.EntityTask 的叶子级任务；严重度按 600 帧常驻均值 3.993798855319619ms 和 frame321 的 22.48979377746582ms 双重贡献判 high。源码是 interval-marker 附近代码，因此建议限定在任务预算/队列策略，不臆测具体业务循环。

**证据链**

1. `drillDownMarker(rootMarker=CS:AOE.LuaMgr, thread=1:Main Thread, maxDepth=6, minMsPerFrame=0.3, topPerLevel=6)`
   → rootTotalMsPerFrame: 10.69 · LuaMgr.OnTick&UpdateSchedule.totalMsPerFrame: 6.75 · MapSignificanceMgr.totalMsPerFrame: 3.99 · MapSignificanceMgr.EntityTask.totalMsPerFrame: 3.57 · MapSignificanceMgr.ProcessTask_MapEntityAdd.totalMsPerFrame: 1.55 · MapSignificanceMgr.ProcessTask_MapObjRefresh.totalMsPerFrame: 1.20 · MapSignificanceMgr.ProcessTask_MapObjCleanUp.totalMsPerFrame: 0.47
2. `scanMetricOverFrames(markerName=MapSignificanceMgr, thread=1:Main Thread, metric=totalMs)`
   → presentFrames: 600.00 · mean: 3.99 · p50: 3.69 · p95: 6.18 · p99: 9.01 · max: 22.49 · maxFrameIndex: 321.00 · burstFramesTotal: 9.00
3. `getFrameCallTree(frameIndex=321, thread=1:Main Thread, maxDepth=10, minPct=5)`
   → msFrame: 59.40 · Core.Update.totalMs: 29.20 · CS:AOE.LuaMgr.totalMs: 25.41 · MapSignificanceMgr.totalMs: 22.49 · MapSignificanceMgr.ProcessTasks.totalMs: 22.23 · MapSignificanceMgr.ProcessTasks.pctOfFrame: 37.42
4. `getSourceForSymbol(symbol=MapSignificanceMgr.ProcessTasks, maxLines=120, includeCalls=true)`
   → resolvedVia: map-source · file: Assets/Scripts/.Lua/Outside/Map/Core/MapSignificanceMgr.lua · startLine: 1206.00 · endLine: 1248.00

---

## 发现3：URP主线程过重  `[urp.rendergraph.baseline]`

**技术论证**

URP.RenderSingleCamera 的 p50 为 9.609062194824219ms、p95 为 16.739896923303604ms，说明它本身经常接近或超过整帧预算。drillDown 显示最大子项为 MainRenderingTransparent 2.9763ms/帧、AfterRendering 2.5925ms/帧、RendererSetup 2.3372ms/帧、BeforeRendering 1.8495ms/帧，RenderGraphSetup self 2.2525ms/帧是稳定成本。queryFrameCounters 提供渲染负载背景，但不能单独证明全部 URP CPU 成本来自 batches 或 triangles。

**自我审查**

深度审查已 drillDown 到 URP 子 pass 和叶子 marker；统计审查没有把 frame22 的最坏值当成常态，而以 p50/p95 和每帧 presentFrames=600 判定稳定高成本。源码缺失已在建议中明说。

**证据链**

1. `scanMetricOverFrames(markerName=URP.RenderSingleCamera, thread=1:Main Thread, metric=totalMs)`
   → presentFrames: 600.00 · mean: 10.64 · p50: 9.61 · p95: 16.74 · p99: 23.41 · max: 29.77 · maxFrameIndex: 22.00 · autocorr.bestLag: 7.00 · autocorr.coefficient: 0.35
2. `drillDownMarker(rootMarker=URP.RenderSingleCamera, thread=1:Main Thread, maxDepth=6, minMsPerFrame=0.3, topPerLevel=6)`
   → rootTotalMsPerFrame: 10.64 · URP.MainRenderingTransparent.totalMsPerFrame: 2.98 · URP.AfterRendering.totalMsPerFrame: 2.59 · URP.RendererSetup.totalMsPerFrame: 2.34 · URP.BeforeRendering.totalMsPerFrame: 1.85 · URP.RenderGraphSetup.selfMsPerFrame: 2.25 · Semaphore.WaitForSignal.selfMsPerFrame: 0.93
3. `scanMetricOverFrames(markerName=URP.RenderGraphSetup, thread=1:Main Thread, metric=selfMs)`
   → presentFrames: 600.00 · mean: 2.25 · p50: 2.20 · p95: 2.61 · p99: 3.58 · max: 3.88 · maxFrameIndex: 538.00
4. `queryFrameCounters()`
   → batches.mean: 175.50 · batches.p95: 212.00 · batches.max: 248.00 · set_pass_calls.mean: 145.60 · set_pass_calls.p95: 172.00 · triangles.mean: 1387902.30 · triangles.p95: 1846272.00 · triangles.max: 1995776.00
5. `getSourceForSymbol(symbol=URP.RenderGraphSetup, maxLines=120, includeCalls=true)`
   → resolvedVia: none · reason: symbol not in codegraph nor map-source

---

## 发现4：相机移动巨型尖峰  `[camera.move.spike]`

**技术论证**

OnCameraMove 的总量并不覆盖所有慢帧，但它是强交互尖峰：presentInFrames 只有 19，却累计 self 819.6865473735088ms；frame144 的 hot path 显示卡顿落在 LateUpdate→LuaMgr→MapCameraCtrl.UpdateCameraPos，UpdateCameraPos total 56.320674896240234ms，占该帧 58.37972815779062%。drillDown 到 MapCameraCtrl.UpdateCameraPos 后，OnCameraMove 是可见叶子，说明当前 marker 粒度已经到数据极限。

**自我审查**

反例审查显示 19 个 OnCameraMove 尖峰全部在慢帧内，但慢帧有 600 帧，因此它不是全局基线主因；严重度从 critical 下调为 high。深度审查已 drillDown 到 MapCameraCtrl.UpdateCameraPos 和 OnCameraMove 叶子，源码也验证了触发路径。

**证据链**

1. `queryMarkers(thread=1:Main Thread, sortBy=selfMs, topN=20)`
   → markerName: OnCameraMove · sumSelfMs: 819.69 · presentInFrames: 19.00 · avgSelfMsPerPresentFrame: 43.14 · maxSelfMs: 53.41 · maxSelfFrameIndex: 144.00
2. `scanMetricOverFrames(markerName=OnCameraMove, thread=1:Main Thread, metric=selfMs)`
   → presentFrames: 19.00 · p99: 49.87 · max: 53.41 · maxFrameIndex: 144.00 · burstFramesTotal: 18.00
3. `getFrameCallTree(frameIndex=144, thread=1:Main Thread, maxDepth=10, minPct=1)`
   → msFrame: 96.47 · MapCameraCtrl.UpdateCameraPos.totalMs: 56.32 · MapCameraCtrl.UpdateCameraPos.pctOfFrame: 58.38 · Core.LateUpdate.totalMs: 61.47
4. `drillDownMarker(rootMarker=MapCameraCtrl.UpdateCameraPos, thread=1:Main Thread, maxDepth=8, minMsPerFrame=0.3, topPerLevel=8)`
   → rootTotalMsPerFrame: 2.67 · infiniteZoomMgr_OnOutsideCameraMove.totalMsPerFrame: 2.00 · InfiniteZoomMgr.PostCameraMoveScale.totalMsPerFrame: 1.75 · OnCameraMove.selfMsPerFrame: 1.37 · OnCameraMove.presentFrames: 19.00
5. `getSourceForSymbol(symbol=MapCameraCtrl.UpdateCameraPos, maxLines=120, includeCalls=true)`
   → file: Assets/Scripts/.Lua/Outside/Map/Visual/MapCameraCtrl.lua · startLine: 623.00 · endLine: 666.00

---

## 发现5：同步GC炸帧  `[gc.sync.collect]`

**技术论证**

GC.Collect 只出现 3 帧，但 frame519 单次 self 70.20452880859375ms，直接解释最差帧的主体；frame483 也有 GC.Collect 15.33395767211914ms。queryFrameCounters 显示 frame519 当帧 gc_allocated_in_frame 为 8192 bytes、frame483 为 10240 bytes，低于全程 p95 74752 bytes，因此不能把结论写成“当帧分配尖峰导致 GC”。

**自我审查**

证据审查补了 frame483/frame519 的调用树和计数器，没有用全程分配峰值 frame256 去解释 GC 帧。严重度按单帧实际贡献为 high，但因只确认少数帧出现，没有排到稳定基线之前。

**证据链**

1. `scanMetricOverFrames(markerName=GC.Collect, thread=1:Main Thread, metric=selfMs)`
   → presentFrames: 3.00 · max: 70.20 · maxFrameIndex: 519.00 · burstFramesTotal: 2.00
2. `getFrameCallTree(frameIndex=519, thread=1:Main Thread, maxDepth=10, minPct=1)`
   → msFrame: 113.56 · Core.EndOfFrame.totalMs: 75.41 · CS:AOE.LuaMgr.totalMs: 75.30 · GC.Collect.selfMs: 70.20 · GC.Collect.pctOfFrame: 61.82
3. `getFrameCallTree(frameIndex=483, thread=1:Main Thread, maxDepth=10, minPct=5)`
   → msFrame: 57.48 · GarbageCollector.CollectIncremental.totalMs: 18.84 · GarbageCollector.CollectIncremental.selfMs: 3.51 · GC.Collect.selfMs: 15.33 · GC.Collect.pctOfFrame: 26.68
4. `queryFrameCounters(frames=[480,481,482,483,484,518,519,520,144,273,80,22])`
   → frame483.gc_allocated_in_frame: 10240.00 · frame519.gc_allocated_in_frame: 8192.00 · frame519.total_used_memory: 716310528.00 · frame519.gc_reserved_memory: 105066496.00
5. `queryFrameCounters()`
   → gc_allocated_in_frame.mean: 19339.90 · gc_allocated_in_frame.p95: 74752.00 · gc_allocated_in_frame.max: 265216.00 · gc_allocated_in_frame.maxFrame: 256.00

---

## 发现6：移动线消息尖峰  `[network.move-line.ntf]`

**技术论证**

scanPeakMarkers 把 YzEntityMoveLineNtf 排在非等待尖峰第一位；frame273 调用树确认它在 TServer.HandleMessages 下，单帧 total 14.156198501586914ms，占帧 21.233236673734947%。源码显示 handler 对 msg.fullUpdateLine 全量 pairs 遍历，并对 pathPoint 调 FormatWorldPosition_MoveAttr；后者会 FormatWorldPositionArray，并 Clone xArray/yArray。

**自我审查**

深度审查已从 TServerManager 钻到具体消息 handler 和坐标格式化函数；严重度按 frame273 的 21.233236673734947% 帧贡献定为 high。统计审查注意到它只有 77 个 presentFrames，因此没有把它写成全局基线主因。

**证据链**

1. `scanPeakMarkers(thread=1:Main Thread, topN=25, minSpikeRatio=3, excludeWaits=true)`
   → markerName: YzEntityMoveLineNtf · peakFrameSelf: 14.90 · peakFrame: 273.00 · avgWhenPresent: 1.97 · presentFrames: 77.00 · spikeRatio: 7.56
2. `scanMetricOverFrames(markerName=YzEntityMoveLineNtf, thread=1:Main Thread, metric=selfMs)`
   → presentFrames: 77.00 · p95: 1.05 · p99: 9.61 · max: 14.90 · maxFrameIndex: 273.00 · burstFramesTotal: 9.00 · autocorr.bestLag: 5.00 · autocorr.coefficient: 0.32
3. `getFrameCallTree(frameIndex=273, thread=1:Main Thread, maxDepth=10, minPct=2)`
   → msFrame: 66.67 · CS:AOE.TServerManager.totalMs: 22.31 · TServer.HandleMessages.totalMs: 16.97 · YzEntityMoveLineNtf.selfMs: 13.26 · YzEntityMoveLineNtf.totalMs: 14.16 · YzEntityMoveLineNtf.pctOfFrame: 21.23
4. `getSourceForSymbol(symbol=YzEntityMoveLineNtf, maxLines=120, includeCalls=true)`
   → file: Assets/Scripts/.Lua/Outside/Map/Util/NetMsgPostProcesser.lua · startLine: 122.00 · endLine: 133.00
5. `getSourceForSymbol(symbol=WorldCoordFormatUtil.FormatWorldPosition_MoveAttr, maxLines=120, includeCalls=true)`
   → file: Assets/Scripts/.Lua/Outside/Map/Util/WorldCoordFormatUtil.lua · startLine: 156.00 · endLine: 194.00

---

## 发现7：行军线和MeshUI常驻  `[map.armyline.meshui.baseline]`

**技术论证**

OutSideViewArmyLineMgr 和 MeshUIManager 都 presentInFrames=600，属于稳定预算占用。MapManager drillDown 显示行军线 total 2.8385ms/帧，其中 own self 2.3018ms/帧，另有 CalculateVertexJob 0.5323ms/帧；BattleUIUpdate 下的 MUI_UpdateUIPos 也有 1.1448ms/帧。MeshUIManager drillDown 无法继续拆分，所有 2.0762ms/帧都落在自身 marker。

**自我审查**

深度审查已对 MapManager 和 MeshUIManager 下钻；MeshUI 到叶子仍是自身，是现有采样粒度限制，已转成 DataRequest 而不是臆测内部子系统。严重度按常驻 2ms 级成本定 medium。

**证据链**

1. `scanMetricOverFrames(markerName=CS:AOE.Outside.OutSideViewArmyLineMgr, thread=1:Main Thread, metric=selfMs)`
   → presentFrames: 600.00 · mean: 2.30 · p50: 2.28 · p95: 2.76 · p99: 3.34 · max: 6.28 · maxFrameIndex: 223.00
2. `scanMetricOverFrames(markerName=CS:AOE.MeshUIManager, thread=1:Main Thread, metric=selfMs)`
   → presentFrames: 600.00 · mean: 2.08 · p50: 2.00 · p95: 3.33 · p99: 3.99 · max: 4.78 · maxFrameIndex: 324.00 · autocorr.coefficient: 0.59
3. `drillDownMarker(rootMarker=CS:AOE.Outside.MapManager, thread=1:Main Thread, maxDepth=6, minMsPerFrame=0.3, topPerLevel=6)`
   → rootTotalMsPerFrame: 6.14 · CS:AOE.Outside.OutSideViewArmyLineMgr.totalMsPerFrame: 2.84 · CS:AOE.Outside.OutSideViewArmyLineMgr.selfMsPerFrame: 2.30 · MUI_UpdateUIPos.selfMsPerFrame: 1.14 · OutsideLineCtrl:CalculateVertexJob (Burst).selfMsPerFrame: 0.53 · CS:AOE.Outside.WorldEnvironmentMeshItemMgr.selfMsPerFrame: 0.31
4. `drillDownMarker(rootMarker=CS:AOE.MeshUIManager, thread=1:Main Thread, maxDepth=6, minMsPerFrame=0.3, topPerLevel=6)`
   → rootTotalMsPerFrame: 2.09 · rootSelfMsPerFrame: 2.08
5. `getSourceForSymbol(symbol=CS:AOE.MeshUIManager, maxLines=120, includeCalls=true)`
   → file: Assets/Scripts/CS/MeshUI/MeshUIManager.cs
6. `getSourceForSymbol(symbol=CS:AOE.Outside.OutSideViewArmyLineMgr, maxLines=120, includeCalls=true)`
   → file: Assets/Scripts/CS/Outside/View/OutSideViewArmyLineMgr.cs

---

## 发现8：资源卸载单帧尖峰  `[resource.unload.spike]`

**技术论证**

TryUnloadPending.TryUnload 的 p50 只有 0.010468999855220318ms，说明它不是稳定成本；但 frame80 的 LoaderManagerTryUnloadPending total 21.341665267944336ms，占帧 30.450248806855928%，并且 scanPeakMarkers 给出 spikeRatio 132.63。源码显示 TryUnload 本体只做 CanUnload 和 DoUnload，因此峰值更可能来自当帧处理了较多待卸载对象或 DoUnload 内部成本。

**自我审查**

严重度审查后没有因为 14.59459703558241ms 峰值把它排到高优先级：它 p95 只有 0.3064100008632522ms、burstFramesTotal 为 6，更像偶发尖峰。深度审查到源码后发现 TryUnload 本身很薄，因此没有编造内部根因。

**证据链**

1. `scanPeakMarkers(thread=1:Main Thread, topN=25, minSpikeRatio=3, excludeWaits=true)`
   → markerName: TryUnloadPending.TryUnload · peakFrameSelf: 14.59 · peakFrame: 80.00 · avgWhenPresent: 0.11 · presentFrames: 600.00 · spikeRatio: 132.63
2. `scanMetricOverFrames(markerName=TryUnloadPending.TryUnload, thread=1:Main Thread, metric=selfMs)`
   → presentFrames: 600.00 · mean: 0.11 · p50: 0.01 · p95: 0.31 · p99: 2.72 · max: 14.59 · maxFrameIndex: 80.00 · burstFramesTotal: 6.00
3. `getFrameCallTree(frameIndex=80, thread=1:Main Thread, maxDepth=10, minPct=5)`
   → msFrame: 70.09 · Core.PostEndOfFrame.totalMs: 21.52 · CS:AOE.ResManager.totalMs: 21.45 · LoaderManagerOnFrameEnd.totalMs: 21.41 · LoaderManagerTryUnloadPending.totalMs: 21.34 · LoaderManagerTryUnloadPending.pctOfFrame: 30.45
4. `getSourceForSymbol(symbol=TryUnloadPending.TryUnload, maxLines=120, includeCalls=true)`
   → file: Assets/Framework/com.tencent.timitbu.res/Runtime/V3/Core/Loader/BaseLoader.cs · startLine: 668.00 · endLine: 677.00

---

## 发现9：偶发Present等待  `[present.wait.occasional]`

**技术论证**

主线程 Semaphore.WaitForSignal p95 为 7.501302303629927ms，frame22 达到 20.679894776258152ms；getThreadTimeline 把同帧等待定位到 URP.WaitForPresent 19.842394357227022ms 和 Gfx.WaitForPresentOnGfxThread 19.835363388061523ms。frame22 的 gc_allocated_in_frame 只有 7168 bytes，因此这条等待不是由当帧 GC 分配尖峰解释。

**自我审查**

反例审查发现 frame519 最差帧 mainThreadWaits 只有 0.38791700841102283ms 的 Semaphore.WaitForSignal，因此等待不是全局最差帧主因；严重度定为 medium，作为 URP 基线的叠加风险处理。

**证据链**

1. `scanMetricOverFrames(markerName=Semaphore.WaitForSignal, thread=1:Main Thread, metric=selfMs)`
   → presentFrames: 600.00 · mean: 1.74 · p50: 0.77 · p95: 7.50 · p99: 13.65 · max: 20.68 · maxFrameIndex: 22.00 · burstFramesTotal: 17.00 · autocorr.bestLag: 2.00 · autocorr.coefficient: 0.35
2. `getThreadTimeline(frameIndex=22)`
   → msFrame: 59.36 · mainThreadWaits.Semaphore.WaitForSignal.totalMs: 20.68 · mainThreadWaits.URP.WaitForPresent.totalMs: 19.84 · mainThreadWaits.Gfx.WaitForPresentOnGfxThread.totalMs: 19.84 · RenderThread.topLevelMs: 57.77
3. `drillDownMarker(rootMarker=URP.RenderSingleCamera, thread=1:Main Thread, maxDepth=6, minMsPerFrame=0.3, topPerLevel=6)`
   → URP.WaitForPresent.totalMsPerFrame: 0.95 · Gfx.WaitForPresentOnGfxThread.totalMsPerFrame: 0.95 · Semaphore.WaitForSignal.selfMsPerFrame: 0.93
4. `queryFrameCounters(frames=[22])`
   → frame22.batches: 199.00 · frame22.set_pass_calls: 157.00 · frame22.triangles: 1856512.00 · frame22.vertices: 2370560.00 · frame22.gc_allocated_in_frame: 7168.00

---
