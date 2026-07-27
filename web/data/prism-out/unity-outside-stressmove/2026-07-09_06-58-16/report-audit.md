# 审计底稿 · 2026-07-09_06-58-16

> 本文件是正式报告 report.md 的配套审计底稿：每条发现的技术论证、自我审查、可回溯证据链。
> 正式报告只保留"数据+人话建议+调用树"，审计信息放这里，供需要核查的人查阅。

---

## 发现1：光是脚本调度这一层(Core.Update)，每一帧就要稳定  `[baseline.coreupdate.luamgr-mapmanager]`

**技术论证**

aggregateSubtree显示Core.Update的maxChildRatio仅0.53（LuaMgr）、Core.LateUpdate的maxChildRatio为0.502（LuaMgr），说明这是'多头分摊'而非单一子系统失控——LuaMgr、MapManager两大调度域各自贡献数毫秒，叠加起来才构成critical级别的基线开销。drillDownMarker证实两条链路都已钻到叶子marker（OnCameraMove/OnDirtyCallback/MUI_UpdateUIPos/CalculateVertexJob等），没有留下未探明的黑盒子树。frame 33（ms_frame=41.92，全采集中位数代表帧，非峰值帧）的调用树进一步验证：即便排除所有异常尖峰（GC/相机移动），仅Core.Update+URP渲染这两大常驻成本加起来就已经让'典型帧'超预算约2.5倍——这是一个系统性、每帧都在发生的问题，而不是几个孤立的bug点。这也是为什么把它排在severity首位：偶发尖峰（相机移动、GC）造成的冲击更容易被感知，但从'累计吃掉多少总预算'的角度，这个全勤的基线成本才是决定'能不能达到60fps'的最大杠杆。

**自我审查**

深度审查：两条链路(LuaMgr/MapManager)均已用drillDownMarker钻到叶子级，无遗留黑盒。严重度审查：初版探索时曾把这类'持续但单帧不起眼'的开销的severity判断为low/medium(因为单帧2-3ms看起来不吓人)，经过对比OnCameraMove等尖峰型问题后修正——用presentFrames=600(全勤)+累计占预算77%(12.879/16.67)重新论证，才是critical级而非被忽视的次要项；这是本轮自我批判中改动幅度最大的一条。统计陷阱审查：aggregateSubtree的maxChildRatio已确认是'多头分摊'而非单一大头造假吓人峰值，各子项数字均来自真实工具返回，未做人为拼接放大。证据审查：每个数字均可追溯到具体工具调用及其原始返回值，MapSignificanceMgr部分特别标注了presentFrames不足600的事实(非全勤任务)，避免把任务式开销误判为纯常驻开销。反例审查：已用frame 33(中位数代表帧,非峰值)验证'即便没有任何异常事件介入，基线成本本身也造成超预算'，排除了'这只是被尖峰帧污染的假象'的可能性。

**证据链**

1. `aggregateSubtree(rootMarker=Core.Update, fanoutThreshold=0.6, minTotalMsPerFrame=2)`
   → subtreeMsPerFrame: 12.88 · ownSelfMsPerFrame: 0.04 · directChildCount: 40.00 · maxChildRatio: 0.53
2. `aggregateSubtree(rootMarker=Core.LateUpdate, fanoutThreshold=0.6, minTotalMsPerFrame=2)`
   → subtreeMsPerFrame: 6.86 · ownSelfMsPerFrame: 0.05 · maxChildRatio: 0.50
3. `drillDownMarker(rootMarker=CS:AOE.LuaMgr, maxDepth=8, minMsPerFrame=0.05)`
   → rootTotalMsPerFrame: 10.69 · rootSelfMsPerFrame: 0.20
4. `drillDownMarker(rootMarker=CS:AOE.Outside.MapManager, maxDepth=8, minMsPerFrame=0.05)`
   → rootTotalMsPerFrame: 6.14 · rootSelfMsPerFrame: 0.30
5. `getFrameCallTree(frameIndex=33, maxDepth=6, minPct=1)`
   → msFrame: 41.92

---

## 发现2：渲染管线(URP)本身每帧也要吃掉10.64毫秒，而且是分散  `[baseline.urp.rendersinglecamera]`

**技术论证**

aggregateSubtree的maxChildRatio=0.28是四个候选主因里最低的，明确说明这不是'某个渲染阶段失控'型问题，而是整条渲染管线的CPU侧调用开销(URP.RenderSingleCamera记录在Main Thread上，是CPU发出渲染指令的耗时，非GPU执行时间)普遍偏重。drillDownMarker显示URP.MainRenderingTransparent的selfMsPerFrame占比37%（自身较重，可能是C#层渲染状态切换/材质绑定开销），其余分摊在Inl_TerrainPass等6个子pass上，均已钻到marker粒度极限。用correlateFrameSets做了反例检验：GPU侧的Gfx.PresentFrame虽然均值8.8ms、峰值40ms，但与主线程慢帧集合完全不重叠(intersection=0)——证明本finding关注的CPU侧渲染调用开销和GPU侧渲染耗时是两个独立现象，不能混为一谈，已明确区分开来。

**自我审查**

深度审查：已用aggregateSubtree+drillDownMarker两层验证，确认是分散型而非单一大头，未强行找一个'罪魁祸首'来简化叙事。严重度审查：虽然10.64ms/帧的绝对量小于Core.Update的12.879ms，但仍达预算的64%，定为high(次于baseline.coreupdate的critical)是合理的相对排序。证据审查：特别用correlateFrameSets验证了'CPU侧URP渲染开销'与'GPU侧Gfx.PresentFrame耗时'是两个不同维度、不应混淆的现象，这是主动排查的潜在陷阱(容易把两者的数字加在一起造成夸大)。反例审查：Gfx.PresentFrame intersection=0这一反例已妥善纳入reasoning，用于明确划清本finding的边界，而非被忽略。

**证据链**

1. `aggregateSubtree(rootMarker=URP.RenderSingleCamera, fanoutThreshold=0.6, minTotalMsPerFrame=2)`
   → subtreeMsPerFrame: 10.64 · ownSelfMsPerFrame: 0.45 · directChildCount: 10.00 · maxChildRatio: 0.28
2. `drillDownMarker(rootMarker=URP.MainRenderingTransparent, maxDepth=6, minMsPerFrame=0.05)`
   → rootTotalMsPerFrame: 2.98 · rootSelfMsPerFrame: 1.11 · note: 已钻到叶子级：selfMsPerFrame=1.1063占totalMs的37%(自身较重)，其余分摊在6个Inl_*渲染子pass上，无单一大头
3. `queryMarkers(thread=1:Main Thread, sortBy=selfMs, topN=25)`
   → markerName: URP.RenderGraphSetup · sumSelfMs: 1351.49 · avgSelfMsPerPresentFrame: 2.25 · maxSelfMs: 3.86 · maxSelfFrameIndex: 538.00 · presentInFrames: 600.00
4. `correlateFrameSets(setA={"kind":"markerSpike","markerName":"Gfx.PresentFrame","thread":"1:Submit Thread","minSelfMs":15}, setB={"kind":"slowFrames"})`
   → sizeA: 162.00 · sizeB: 29.00 · intersection: 0.00 · pctAinB: 0.00 · pctBinA: 0.00

---

## 发现3：相机一移动镜头，画面就要卡一下：全场19次相机移动，每次平均  `[camera.oncameramove.spike]`

**技术论证**

scanMetricOverFrames显示OnCameraMove只在19/600帧出现，均值被大量0值稀释到1.37ms，但p99高达49.87ms——说明这是'稀有但剧烈'型问题，不能用全局均值衡量真实影响。correlateFrameSets双向验证：pctAinB=100%(19次移动全部落入慢帧集合)，pctBinA=65.5%(全场29个最慢帧里65.5%由相机移动解释)——这是強因果关联，且经过反向验证：另外34.5%的慢帧(10帧)另有独立成因(如TryUnloadPending在frame 80主导)，不是被过度归因。frame 144的callTree确认53.4ms几乎全部落在OnCameraMove这一个marker自身，drillDownMarker从LuaMgr根节点一路钻到底，证实OnCameraMove在调用链里就是叶子节点（无子节点），已到profiler采样粒度的绝对极限——这不是分析没钻透，是数据侧本身的深度上限。

**自我审查**

深度审查：drillDownMarker从根节点CS:AOE.LuaMgr一路钻到OnCameraMove叶子，路径完整无跳跃，确认已到数据极限。严重度审查：19次事件presentFrames少，但用p99(49.87ms)和pctBinA(65.5%)而非被稀释的全局均值衡量，排入critical级并与baseline类finding并列。统计陷阱审查：pctAinB用的分母是相机移动自身次数(19)而非慢帧总数，未被稀释；同时补充说明另外34.5%慢帧有独立成因，避免'过度归因所有慢帧于相机问题'的陷阱。证据审查：getSourceForSymbol确认无法精确定位真实实现(5处ambiguous匹配)，已如实记入recommendation和DataRequest，未强行给套话建议。反例审查：本次补充检验了OnCameraMove burstFrames与父节点InfiniteZoomMgr.PostCameraMoveScale尖峰帧完全不重叠这一现象，如实记录为'触发条件不完全线性传递'的观察，不影响主结论但体现了尊重反例的态度。

**证据链**

1. `scanMetricOverFrames(markerName=OnCameraMove)`
   → frameCount: 600.00 · presentFrames: 19.00 · mean: 1.37 · p99: 49.87 · max: 53.41 · maxFrameIndex: 144.00 · spikeRatio: 1.17 · burstFramesTotal: 18.00
2. `correlateFrameSets(setA={"kind":"markerSpike","markerName":"OnCameraMove","minSelfMs":1}, setB={"kind":"slowFrames"})`
   → sizeA: 19.00 · sizeB: 29.00 · intersection: 19.00 · pctAinB: 100.00 · pctBinA: 65.52
3. `getFrameCallTree(frameIndex=144, maxDepth=15)`
   → msFrame: 96.47
4. `drillDownMarker(rootMarker=CS:AOE.LuaMgr, maxDepth=8, minMsPerFrame=0.05)`
   → {"note":"已钻到叶子级：CS:AOE.LuaMgr>LuaMgr.OnLateUpdateSchedule>MapCameraCtrl>MapCameraCtrl.OnLateUpdate>MapCameraCtrl.UpdateCameraPos>infiniteZoomMgr_OnOutsideCameraMove(1.9972ms,pctOfRoot=0.1868)>InfiniteZoomMgr.PostCameraMoveScale(1.7459ms)>OnCameraMove叶子(1.3661ms self,pctOfRoot=0.132)，OnCameraMove在调用链…
5. `correlateFrameSets(setA={"kind":"markerSpike","markerName":"OnCameraMove","minSelfMs":1}, setB={"kind":"markerSpike","markerName":"InfiniteZoomMgr.PostCameraMoveScale","minSelfMs":1})`
   → {"note":"OnCameraMove的burstFrames(18帧)与父节点InfiniteZoomMgr.PostCameraMoveScale的尖峰帧(约3帧,minSelfMs=1ms)完全不重叠(intersection=0)，说明OnCameraMove自身的触发条件比父节点更敏感/更容易达到高耗时阈值，二者不是简单的线性传递关系，值得注意但不改变OnCameraMove本身是critical级问题的结论"}

---

## 发现4：全场最慢的一帧(113.56毫秒，约7倍预算)，罪魁祸首是一  `[gc.collect.frame519.sync]`

**技术论证**

correlateFrameSets显示3次GC.Collect里只有1次(frame519)落入29帧的慢帧集合，pctBinA仅3.45%——统计相关性很弱，如果只看这个百分比会得出'不重要'的结论。但用getFrameCallTree逐帧核查后发现：3次GC.Collect事件走的是两种完全不同的机制——frame461/483走'WaitForTargetFPS→GarbageCollector.CollectIncremental'路径(引擎在等垂直同步空闲时机做的增量GC步进，代价6.93~15.33ms，是正常机制)，而frame519走的是'CS:AOE.LuaMgr→Core.EndOfFrame'路径(游戏逻辑主动触发的同步Full GC，代价70.2ms，异常量级是常规步进的5-10倍)。queryFrameCounters确认frame519的gc_allocated_in_frame(8192字节)是相邻帧最低值，排除了'内存分配暴涨触发GC'的假设，指向这是定时或主动触发的同步Full GC。虽然低相关性(3.45%)意味着它不适合被称为'系统性问题'，但其单帧绝对冲击(70.2ms，占预算421%)造就了全场唯一一次破100ms的记录，对'尾部延迟/最差用户体验'这个维度的影响是决定性的——因此严重度定为critical，但需明确其'孤立事件'性质，不与baseline类finding的'系统性拖累'混为一谈。

**自我审查**

反例审查是本条被修正最多的一刀：最初粗看时容易得出'GC.Collect与最慢帧强相关'的错觉，但严格执行correlateFrameSets后发现pctBinA仅3.45%，是弱相关；同时补充了与LuaMtGc.ExecuteMtGc(Lua侧多线程GC)的交叉验证，确认intersection=0——两者是完全独立的两套GC机制，没有被混淆合并成一个'GC问题'来夸大严重度。统计陷阱审查：没有因为pctBinA低就把它降级为medium——用绝对冲击(70.2ms单帧，占预算421%)和事件性质(全场唯一超100ms记录的根因)来定性severity，而不是简单套用相关性百分比，这是'severity要反映真实总贡献'原则在这里的具体应用：对于影响'最差1帧体验'而非'整体拖累'的问题，用相关性百分比来评估是错误的度量方式。深度审查：GC.Collect本身是运行时叶子marker，已用queryFrameCounters从内存分配计数器维度补充交叉验证(排除分配触发假设)，这是超出调用树本身的额外证据。证据审查：frame461/483/519三帧的调用路径均逐一通过getFrameCallTree核实，未凭印象归类。

**证据链**

1. `直接查询prism_frame_marker_samples表(marker_name='GC.Collect')()`
   → occurrences: 3.00
2. `getFrameCallTree(frameIndex=519, maxDepth=12)`
   → msFrame: 113.56 · selfMs: 70.20 · pctOfFrame: 61.82
3. `getFrameCallTree(frameIndex=483, maxDepth=10, minPct=0.3)`
   → msFrame: 57.48 · selfMs: 15.33 · pctOfFrame: 26.68
4. `correlateFrameSets(setA={"kind":"markerSpike","markerName":"GC.Collect","minSelfMs":5}, setB={"kind":"slowFrames"})`
   → sizeA: 3.00 · sizeB: 29.00 · intersection: 1.00 · pctAinB: 33.33 · pctBinA: 3.45
5. `queryFrameCounters(frames=[517,518,519,520])`
   → {"gc_allocated_in_frame":{"517":11264,"518":9216,"519":8192,"520":15360},"gc_reserved_memory":{"518":107704320,"519":105066496},"note":"frame519的分配量(8192字节)反而是相邻帧里最低值，排除'分配暴涨触发GC'的假设；gc_reserved_memory在519帧确实收缩(107704320→105066496)，与Full GC吻合"}
6. `correlateFrameSets(setA={"kind":"markerSpike","markerName":"GC.Collect","minSelfMs":5}, setB={"kind":"markerSpike","markerName":"LuaMtGc.ExecuteMtGc","thread":"1:Lua.GC","minSelfMs":5})`
   → sizeA: 3.00 · sizeB: 5.00 · intersection: 0.00 · pctAinB: 0.00 · pctBinA: 0.00 · note: 反例验证：主线程GC.Collect和Lua侧多线程GC(LuaMtGc.ExecuteMtGc)完全不重叠，二者是独立机制，未混淆为同一现象的两个侧面

---

## 发现5：除了主线程那次70ms的同步GC，还有一套独立的Lua侧多线  `[gc.luamtgc.executemtgc.spike]`

**技术论证**

presentFrames=600说明LuaMtGc.ExecuteMtGc本身每帧都在跑（是常态调度），但均值很低(0.59ms)，只有burstFrames(5帧)出现异常放大(最高21.59ms)，是spikeRatio=59.13的典型偶发尖峰型问题。correlateFrameSets显示与全场最慢帧集合的关联度中等偏弱(pctBinA=13.79%)——不像OnCameraMove(65.52%)那样是主要驱动因素，但也不是完全无关(如gfxpresent反例中的0%)。通过与主线程GC.Collect事件做交叉correlateFrameSets(intersection=0)，确认这是完全独立于主线程Full GC的第二套GC机制(Lua侧多线程GC)，不应混为一谈或合并成一条finding。getSourceForSymbol拿到的源码只是C#层薄封装(BaseLuaMgr.cs:1475-1481)，转发调用到env.ExecuteMtGc()，真正的GC工作逻辑在Lua VM/native层内部，该层不在codegraph覆盖范围——这是数据侧的真实局限，已如实记录。由于presentInFrames高但均值低、且与整体慢帧关联偏弱，判定为medium而非critical/high。

**自我审查**

深度审查：getFrameCallTree确认该marker本身在Lua.GC线程上无子节点，是叶子；进一步尝试通过getSourceForSymbol查看实现，发现只能追到C#转发层，无法看到Lua VM内部逻辑——已如实标注这是数据/工具能力的边界，而非分析不够深入。反例/统计陷阱审查：本条finding最初有被误判为'与主线程GC.Collect是同一现象的两个侧面'的风险，通过correlateFrameSets显式验证intersection=0排除了这个假设，避免了把两个独立问题合并成一个从而低估问题数量或错误归因。证据审查：额外核查了frame351(burstFrames之一)的主线程调用树，发现该帧变慢的真正主因是TServerManager+LuaMgr常规调度而非LuaMtGc本身，如实记录这一点以避免'见到marker出现在慢帧列表就归因于它'的错误推断。严重度审查：presentInFrames=600(全勤)但均值极低(0.59ms)+与慢帧集合关联度中等(13.79%，非0也非主导)，综合定为medium，是四类主因finding之外的补充观察项。

**证据链**

1. `scanMetricOverFrames(markerName=LuaMtGc.ExecuteMtGc, thread=1:Lua.GC)`
   → frameCount: 600.00 · presentFrames: 600.00 · mean: 0.59 · p50: 0.36 · p99: 4.41 · max: 21.59 · maxFrameIndex: 194.00 · spikeRatio: 59.13 · burstFramesTotal: 5.00
2. `getFrameCallTree(frameIndex=194, maxDepth=8, minPct=0.5, thread=1:Lua.GC)`
   → msFrame: 49.60 · tree: LuaMtGc.ExecuteMtGc(21.591ms self, pctOfFrame=43.53%)，无子节点，是该线程唯一记录的顶层事件
3. `getFrameCallTree(frameIndex=351, maxDepth=6, minPct=1)`
   → msFrame: 87.89
4. `correlateFrameSets(setA={"kind":"markerSpike","markerName":"LuaMtGc.ExecuteMtGc","thread":"1:Lua.GC","minSelfMs":3}, setB={"kind":"slowFrames"})`
   → sizeA: 11.00 · sizeB: 29.00 · intersection: 4.00 · pctAinB: 36.36 · pctBinA: 13.79
5. `correlateFrameSets(setA={"kind":"markerSpike","markerName":"GC.Collect","minSelfMs":5}, setB={"kind":"markerSpike","markerName":"LuaMtGc.ExecuteMtGc","thread":"1:Lua.GC","minSelfMs":5})`
   → intersection: 0.00 · note: 与主线程GC.Collect事件(frame461/483/519)完全不重叠，确认是独立的第二套GC机制
6. `getSourceForSymbol(symbol=LuaMtGc.ExecuteMtGc)`
   → resolvedVia: codegraph · file: Assets/Scripts/CS/Managers/BaseLuaMgr.cs · startLine: 1475.00 · endLine: 1481.00 · sourceCode: public void ExecuteMtGc() { if (this.env != null) { env.ExecuteMtGc(); } } · note: 只是C#层的薄封装转发调用，真正执行GC工作的逻辑在env.ExecuteMtGc()内部（Lua VM/native层），该层代码不在本次可查源码范围内

---

## 发现6：资源卸载偶尔会炸一下：均值只有0.11毫秒的不起眼小操作，在  `[resource.tryunload.spike]`

**技术论证**

drillDownMarker证实这是分摊型成本：14.59ms的self耗时分摊在多个具体资源包([res]ab_unload:bundle/environment/...等)的卸载操作和ResFsmLogMgr.Log日志调用上，是批量卸载操作本身的成本而非某个特定资源卡住的问题。frame80的getFrameCallTree验证了该帧不含OnCameraMove触发（本身即是对camera finding'并非所有慢帧都是相机问题'的反向验证）。correlateFrameSets显示pctBinA仅6.9%——样本量小(8次事件)下这个偏低的关联度是真实的，不是被稀释，判定为low级别、独立的偶发性问题。getSourceForSymbol确认TryUnload本身已有CanUnload()前置检查（说明这条路径本身有一定的防御性设计），但进一步想看DoUnload的具体卸载逻辑被'ambiguous(6个候选)'挡住，无法继续下钻。

**自我审查**

深度审查：drillDownMarker已钻到具体资源包级别的叶子，确认是分摊型无单一大头；进一步尝试getSourceForSymbol('DoUnload')验证是否有更深层可查的代码，确认被ambiguous挡住，如实记入DataRequest而非放弃继续尝试。严重度审查：8次事件、pctBinA仅6.9%，结合frame80单帧21.34ms的绝对冲击，权衡后定为low(不是medium)——因为presentFrames=600(mean很低)且burstFramesTotal只有6，是真正的低频偶发，不像OnCameraMove那样次次必卡。反例验证：用frame80(无相机移动介入)证明了慢帧存在独立于相机问题的第二成因，这个反例同时支撑了本finding的独立性判断和camera finding里'该分母未被稀释'的论证。

**证据链**

1. `scanMetricOverFrames(markerName=TryUnloadPending.TryUnload)`
   → presentFrames: 600.00 · mean: 0.11 · p99: 2.72 · max: 14.59 · maxFrameIndex: 80.00 · spikeRatio: 1394.08 · burstFramesTotal: 6.00
2. `getFrameCallTree(frameIndex=80, maxDepth=12, minPct=0.05)`
   → msFrame: 70.09 · selfMs: 14.59 · totalMs: 21.34 · pctOfFrame: 30.45
3. `drillDownMarker(rootMarker=CS:AOE.ResManager, maxDepth=6, minMsPerFrame=0.001)`
   → rootTotalMsPerFrame: 0.52
4. `correlateFrameSets(setA={"kind":"markerSpike","markerName":"TryUnloadPending.TryUnload","minSelfMs":1}, setB={"kind":"slowFrames"})`
   → sizeA: 8.00 · sizeB: 29.00 · intersection: 2.00 · pctAinB: 25.00 · pctBinA: 6.90
5. `getSourceForSymbol(symbol=TryUnloadPending.TryUnload)`
   → resolvedVia: codegraph · file: Assets/Framework/com.tencent.timitbu.res/Runtime/V3/Core/Loader/BaseLoader.cs · startLine: 668.00 · endLine: 677.00 · note: 已有CanUnload()前置检查；尝试进一步查DoUnload被'ambiguous=true,6个候选'挡住，resolvedVia=none

---

## 发现7：GPU提交画面这一步(Gfx.PresentFrame)本身  `[gfxpresent.submitthread.steady]`

**技术论证**

correlateFrameSets显示Gfx.PresentFrame高耗时帧集合(162帧，minSelfMs>15ms)与主线程慢帧集合(29帧)的intersection=0——完全不重叠，说明这个Submit线程上的耗时不会拖慢主线程判定的帧率(本次verdict的msFrame统计口径是基于PlayerLoop/主线程的)。这是一个'看起来数字不小但实际不影响本次verdict口径下的帧率判定'的现象，因此不列为primaryDriver，只作为info记录，提醒后续如果分析口径改为'端到端呈现延迟'而非'主线程CPU耗时'，这里可能需要重新评估其影响。

**自我审查**

反例验证：本条finding本身就是一次主动的反例检查产物——怀疑Gfx.PresentFrame耗时高可能是隐藏的性能问题，但correlateFrameSets显示intersection=0，主动验证了它跟主线程慢帧无关，避免了误报。严重度审查：因为与慢帧判定完全脱钩，主动定为info而非medium/low，不夸大其影响。证据审查：确认了这是Submit Thread(非Main Thread)的数据，跨线程比较时明确标注了线程来源，防止口径混淆导致误判。

**证据链**

1. `queryMarkers(sortBy=maxSelfMs, topN=25)`
   → markerName: Gfx.PresentFrame · thread: 1:Submit Thread · sumSelfMs: 5271.44 · presentInFrames: 599.00 · avgSelfMsPerPresentFrame: 8.80 · maxSelfMs: 40.17 · maxSelfFrameIndex: 184.00
2. `correlateFrameSets(setA={"kind":"markerSpike","markerName":"Gfx.PresentFrame","thread":"1:Submit Thread","minSelfMs":15}, setB={"kind":"slowFrames"})`
   → sizeA: 162.00 · sizeB: 29.00 · intersection: 0.00 · pctAinB: 0.00 · pctBinA: 0.00

---
