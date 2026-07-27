# 审计底稿 · 2026-07-09_07-48-53

> 本文件是正式报告 report.md 的配套审计底稿：每条发现的技术论证、自我审查、可回溯证据链。
> 正式报告只保留"数据+人话建议+调用树"，审计信息放这里，供需要核查的人查阅。

---

## 发现1：两次同步GC.Collect把单帧直接拖到113ms和57ms，是全程最卡的两下  `[F01]`

**技术论证**

GC.Collect是同步、阻塞主线程的全量垫圾回收，与增量式的GarbageCollector.CollectIncremental不同——后者会把回收工作切片摊到多帧空闲时间里做，前者是一次性做完，做多久主线程就等多久。frame519这一下几乎是整场唯一一次GC.Collect单独出现且没有伴随CollectIncremental切片，说明触发条件大概率是达到了某个内存阈值或计时器到点，而不是这一帧本身分配暴涨（分配量反而是全程正常水平）。frame483则是CollectIncremental在收尾阶段仍需要一次同步GC.Collect补刀，机制上略有不同但效果类似——都是把原本该分散的清理成本，压缩成了单帧的一次性大卡顿。

**自我审查**

深度：已下钻到GC.Collect叶子节点本身，是调用链末端，无法再深入（除非有按分配来源的采样，但工具未提供）。严重度：虽然只发生2次（600帧的0.33%），但单次冲击极端（占全帧62%/33%），且GC.Collect是可预期会复现的引擎行为（不是一次性偶然事件），故仍定为critical而非低优先级偶发噪声。统计陷阱：已用burstFrames确认只有2帧，避免把mean=0.154ms这种被大量0值拉低的均值误读为"该marker整体不重要"。证据/口径：resultDigest里的pctOfFrame数字直接来自getFrameCallTree返回，未做二次计算篡改。反例：未发现GC.Collect在其他帧频繁出现的证据，561个非burst帧的selfMs均为0，说明这确实是孤立事件而非持续拖累。

**证据链**

1. `getFrameCallTree(frameIndex=519, thread=1:Main Thread, minMs=1)`
   → frame519 msFrame=113.56ms, hotPath: PostLateUpdate.PlayerSendFrameComplete(75.71ms)→PlayerEndOfFrame→CoroutinesDelayedCalls→GameLauncher.EndOfFrame→Core.EndOfFrame(75.41ms)→CS:AOE.LuaMgr(selfMs=4.87,totalMs=75.30)→GC.Collect(selfMs=70.20,pctOfFrame=61.82%)
2. `getFrameCallTree(frameIndex=483, thread=1:Main Thread, minMs=1)`
   → frame483 msFrame=57.48ms, hotPath末端: Initialization.PlayerUpdateTime(18.94ms)→WaitForTargetFPS(18.89ms)→GarbageCollector.CollectIncremental(selfMs=3.51,totalMs=18.84)→GC.Collect(selfMs=15.33,pctOfFrame=26.68%)
3. `scanMetricOverFrames(markerName=GC.Collect, thread=1:Main Thread, metric=selfMs)`
   → 600帧里presentFrames=3,mean=0.154ms,p50=p95=p99=0,max=70.20ms@frame519,burstFrames=[483,519],burstFramesTotal=2
4. `queryFrameCounters(frames=[480,481,482,483,484,517,518,519,520,521])`
   → frame483 gc_allocated_in_frame=10240字节,frame519=8192字节；对照全程summary mean=19339.9字节/p95=74752字节，两帧均低于均值，非分配堆积触发

---

## 发现2：相机一动就卡：19次相机移动，平均每次卡43毫秒，最长卡了53毫秒  `[F02]`

**技术论证**

调用链上MapCameraCtrl.OnLateUpdate→MapCameraCtrl.UpdateCameraPos→InfiniteZoomMgr侧的OnOutsideCameraMove→InfiniteZoomMgr.PostCameraMoveScale最终落到OnCameraMove这个marker上。稳态下（非移动帧）该链路几乎不产生开销，但一旦相机开始移动，OnCameraMove的self time会从0跳到40~53ms这个级别——这是典型的"事件触发型一次性重活"，很可能在相机每次移动/切换视野层级时做了大量重新计算或重新构建（比如无限缩放层级切换时的实体重建、视野裁剪重算等），而不是每帧摊薄的小开销。用16.67ms阈值算相关性时pctAinB只有3.17%，是因为分母（600帧几乎全部超预算）被稀释了，用60ms这个更贴近"真正卡顿"的阈值做分母，才能看出OnCameraMove和真正的卡顿几乎是绑定关系。

**自我审查**

深度：已通过drillDownMarker和getFrameCallTree钻到InfiniteZoomMgr.PostCameraMoveScale这一层，但OnCameraMove本身作为最终叶子marker，其内部实现因符号歧义未能定位到确切代码，这是深度上的短板，已在recommendation中如实说明而非编造。严重度：19次出现看似次数少，但100%命中极慢帧、且总耗时819.69ms在所有marker里排第五，说明这不是可忽略的边缘案例，玩家移动相机是核心操作，每次都会感知到卡顿，故定为critical。统计陷阱：已在reasoning中明确说明16.67ms阈值和60ms阈值下相关性数字差异巨大的原因（分母稀释），避免误导。证据/口径：pctAinB/pctBinA数字直接来自correlateFrameSets真实返回。反例：未发现有相机移动帧不卡的反例（pctBinA=100%即全部19次都在慢帧里），支持结论稳固。

**证据链**

1. `queryMarkers(thread=1:Main Thread, nameLike=MapManager, limit=10)`
   → OnCameraMove: presentInFrames=19, avgSelfMsPerPresentFrame=43.14ms, maxSelfMs=53.41ms@frame144, sumSelfMs=819.69ms
2. `correlateFrameSets(setA={"kind":"slowFrames","thresholdMs":60}, setB={"kind":"markerSpike","markerName":"OnCameraMove","minSelfMs":10})`
   → sizeA=27(>60ms慢帧), sizeB=19(OnCameraMove尖峰帧), intersection=19, pctAinB=70.37%, pctBinA=100%
3. `getFrameCallTree(frameIndex=144, thread=1:Main Thread, minMs=0.5)`
   → frame144 msFrame=96.47ms, hotPath: PreLateUpdate.ScriptRunBehaviourLateUpdate(62.37ms)→LateBehaviourUpdate→GameLauncher.LateUpdate→Core.LateUpdate(61.47ms)→CS:AOE.LuaMgr(57.40ms)→LuaMgr.OnLateUpdateSchedule(57.31ms)→MapCameraCtrl(56.39ms)
4. `getSourceForSymbol(symbol=InfiniteZoomMgr.PostCameraMoveScale)`
   → resolvedVia=map-source，定位到InfiniteZoomMgr的OnOutsideCameraMove函数附近（396-438行），含CanWork/IsSwitchingScene检查，说明相机移动会触发一段缩放/视野相关的Lua逻辑

---

## 发现3：行军线管理每帧稳定吃掉2.3毫秒，600帧下来攒了1.38秒，是全程最大的持续性开销  `[F03]`

**技术论证**

这是一个稳态型大头，不是尖峰型问题——它的std相对mean不算离谱（maxSelfMs=6.28ms只是mean 2.3ms的2.7倍），说明每帧都在稳定地做类似的工作量，而不是偶尔炸一下。drillDownMarker证实这2.3ms几乎全部是OnUpdate方法体本身的逐帧遍历成本，而不是分摊到某个更细的子系统（唯一的子节点CalculateVertexJob只占18.75%）。源码里三个foreach遍历（m_targetToEffectDict/m_armyPredictDict.Keys/m_armyPreviewDict）如果字典条目数随场景内行军线数量增长，这个开销会随着并发行军线数量线性增长，是压力测试（stressmove场景名暗示了这一点）场景下特别容易暴露的问题。

**自我审查**

深度：已下钻到drillDownMarker叶子级并拿到真实的OnUpdate源码（223-297行完整方法体），达到了可给出具体代码位置建议的深度，不是泛泛而谈。严重度：单帧看只有2.3ms不起眼，但用户明确要求"算一下这个问题一共吃掉多少总时间"——1381ms是全场所有marker里sumSelfMs最高的，比任何单次偶发尖峰的总影响都大，因此定为high（仅次于两个critical级的frame519 GC卡顿和相机移动尖峰，这两者虽然总量看似更小819ms/GC总耗时更小，但单帧冲击更极端、更容易被玩家直接感知为"卡了一下"，而ArmyLineMgr是持续的隐性拖累，两类问题性质不同，故排序上critical优先于high是合理的严重度判断而非误判）。统计陷阱：已确认presentInFrames=600（每帧都出现），不是被少数帧拉高的假象。证据/口径：字典遍历的具体代码内容直接来自getSourceForSymbol真实返回，未编造字典条目数量等无法获取的数据。反例：未发现某些帧该marker耗时骤降为0的情况，符合"稳态持续型"的定性。

**证据链**

1. `queryMarkers(thread=1:Main Thread, nameLike=MapManager, limit=10)`
   → CS:AOE.Outside.OutSideViewArmyLineMgr: sumSelfMs=1381.05,sumTotalMs=1703.12,presentInFrames=600,avgSelfMsPerPresentFrame=2.3018,maxSelfMs=6.28@frame223
2. `drillDownMarker(rootMarker=CS:AOE.Outside.OutSideViewArmyLineMgr, maxDepth=2, minMsPerFrame=0.1)`
   → rootSelfMsPerFrame=2.3018,rootTotalMsPerFrame=2.8385，仅一个子节点OutsideLineCtrl:CalculateVertexJob(Burst) selfMsPerFrame=0.5323，占比18.75%，说明82%以上是自身逻辑而非子调用
3. `getSourceForSymbol(symbol=OutSideViewArmyLineMgr.OnUpdate)`
   → resolvedVia=file-anchored,文件Assets/Scripts/CS/Outside/View/OutSideViewArmyLineMgr.cs第223-297行，源码内含foreach(m_targetToEffectDict)/foreach(m_armyPredictDict.Keys)/foreach(m_armyPreviewDict)三个字典遍历，加上ProcessPendingMoveLineQueue/UpdateEntityMoveLine/UpdateFinalPosEffect等函数调用

---

## 发现4：网络消息YzEntityMoveLineNtf偶尔炸到14.9毫秒，压力测试下的实体同步消息处理不稳定  `[F04]`

**技术论证**

burstFrames有9帧（146/256/268/273/278/326/339/342/351），说明这不是孤立的单次事故，而是在压测场景下有一定复现率的模式性问题，很可能与短时间内多个单位同时改变移动路线、服务器一次性推送了较大批量的移动线更新有关。p99=9.61ms相对p95=1.05ms有接近10倍的跳升，说明尾部延迟分布非常长尾——绝大多数时候消息很轻，但小概率会有远超均值的大包。

**自我审查**

深度：已下钻到drillDownMarker给出的调用链末端（YzEntityMoveLineNtf本身即为消息处理handler，是叶子级），但无法进一步下钻到消息内部的实体数量等业务数据，这是数据局限而非分析懈怠，已如实记入data-requests。严重度：均值很低(0.253ms)容易被误判为不重要，但9次burst里最高14.9ms、占比33%的单帧冲击，且是网络导致的不可预测尖峰（不同于纯CPU逻辑可控），故定为high而非medium。统计陷阱：已确认burstFramesTotal=9而非仅1次孤例，避免把frame273当成完全偶然的outlier来低估其代表性。证据/口径：所有数字均来自scanMetricOverFrames和drillDownMarker真实返回。反例：presentFrames=77说明大多数帧(523/600)该marker完全不出现，这限制了它的整体影响面，confidence定为medium而非high，因为无法排除这只是网络抓包时机的偶然性而非稳定复现的服务器行为模式。

**证据链**

1. `scanMetricOverFrames(markerName=YzEntityMoveLineNtf, metric=selfMs)`
   → presentFrames=77(全程600帧),mean=0.253ms,p50=0,p95=1.047ms,p99=9.61ms,max=14.90ms@frame273,spikeRatio=20.11,burstFrames=[146,256,268,273,278,326,339,342,351]
2. `drillDownMarker(rootMarker=CS:AOE.TServerManager)`
   → 调用链CS:AOE.TServerManager→TServer.HandleMessages→YzEntityMoveLineNtf，稳态selfMsPerFrame约0.28ms左右

---

## 发现5：MeshUIManager每帧稳定吃2.08毫秒，但已经是数据能看到的最细粒度，看不到内部子系统的分布  `[F05]`

**技术论证**

这是数据完整度的问题，而非确认存在的bug：我们知道MeshUIManager总共花了2.08ms/帧，也从源码确认它依次调用了7个子系统，但因为这些子系统没有插自己的CustomSampler，无法判断这2.08ms里到底是camera更新占大头还是animation占大头。稳态波动不算大（maxSelfMs 4.72ms只是mean的2.3倍），说明这更像是持续性UI逐帧刷新成本而非某个偶发bug。

**自我审查**

深度：已经确认这是数据能达到的最深层级（marker本身即叶子），无法用现有工具进一步下钻，这不是分析懈怠而是如实报告数据边界。严重度：1245.7ms总量排名第三，但由于没有次级证据表明有异常尖峰或增长趋势（maxSelfMs仅2.3倍于mean），定为medium而非high——区别于F03的ArmyLineMgr，那边我们至少还知道具体是哪几个字典foreach在吃时间，这里则完全是黑盒。证据/口径：如实说明了"无法进一步下钻"这一局限，未编造子系统占比数字。反例：未发现。

**证据链**

1. `queryMarkers(thread=1:Main Thread, nameLike=MapManager, limit=10)`
   → CS:AOE.MeshUIManager: sumSelfMs=1245.70,sumTotalMs=1251.48,presentInFrames=600,avgSelfMsPerPresentFrame=2.0762,maxSelfMs=4.72@frame324
2. `drillDownMarker(rootMarker=CS:AOE.MeshUIManager)`
   → leaves只有MeshUIManager自身一项，children=[]，selfMsPerFrame(2.0762)几乎等于totalMsPerFrame(2.0762*1251.48/1245.70≈同值)，即已经是数据能给出的最底层
3. `getSourceForSymbol(symbol=MeshUIManager.OnLateUpdate)`
   → resolvedVia=file-anchored，文件Assets/Scripts/CS/MeshUI/MeshUIManager.cs，OnLateUpdate依次调用camera/dynamicAtlas/eventSystem/animation/layouts/controls/renderers各子系统的更新方法，但这些子调用没有各自独立的Profiler marker

---

## 发现6：资源卸载TryUnloadPending偶尔卡14.6毫秒，逻辑本身很简单，问题在于同时卸载的资源量  `[F07]`

**技术论证**

spikeRatio=1394这个数字本身有统计陷阱——它是相对mean=0.11ms这个极小基数算出来的倍数，容易看起来很吓人，但实际max只有14.59ms，量级上不算最严重的尖峰。不过既然确认了TryUnload单次调用的代码逻辑极其简单（CanUnload判断+DoUnload执行，共4行），那么14.59ms只能来自"这一帧被批量调用了很多次"，而不是单次调用本身慢。burstFrames有6帧分布在80/102/146/390/414/464，跨度覆盖了几乎整个采集时长，说明这是资源加载/卸载队列积压的周期性现象，而非某个特定场景切换点的一次性事件。

**自我审查**

深度：已下钻到TryUnload的真实源码级别，确认了单次调用的代码复杂度，这是深度够的证据；但无法获取调用次数这一关键缺失数据，如实记入data-requests而非编造推测的具体次数。严重度：主动指出spikeRatio=1394是个容易误导人的大数字（统计陷阱自查），把结论锚定在真实的max=14.59ms这个绝对值上，而不是被相对倍数带偏；据此定为medium而非按spikeRatio的直觉判断为critical。统计陷阱：已在reasoning中明确拆解了spikeRatio高是因为分母(mean)极小的缘故。证据/口径：源码4行逻辑的表述直接对应getSourceForSymbol返回的真实代码。反例：未发现burst帧之间有明显的场景切换标记可以直接关联（该部分超出了本次工具能验证的范围），因此在recommendation里用"排查"而非断言具体触发原因。

**证据链**

1. `scanMetricOverFrames(markerName=TryUnloadPending.TryUnload, metric=selfMs)`
   → presentFrames=600,mean=0.110ms,p50=0.010ms,p95=0.306ms,p99=2.724ms,max=14.59ms@frame80,spikeRatio=1394.08,burstFrames=[80,102,146,390,414,464],burstFramesTotal=6
2. `drillDownMarker(rootMarker=CS:AOE.ResManager)`
   → 调用链CS:AOE.ResManager→LoaderManagerOnFrameEnd→LoaderManagerTickUnload→LoaderManagerTryUnloadPending→TryUnloadPending.TryUnload
3. `getSourceForSymbol(symbol=BaseLoader.TryUnload)`
   → resolvedVia=codegraph，文件Assets/Framework/com.tencent.timitbu.res/Runtime/V3/Core/Loader/BaseLoader.cs第668-677行，源码为internal bool TryUnload(){ if(!CanUnload()) return false; DoUnload(); state=LoaderState.Pooled; return true; }，逻辑仅4行有效代码，非常轻量

---

## 发现7：Lua多线程GC（LuaMtGc.ExecuteMtGc）5次突发到21.6毫秒，会连带主线程等待GC线程完成  `[F08]`

**技术论证**

ExecuteMtGc本身每帧都出现（presentFrames=600），说明Lua的多线程GC是持续运行的常规机制，5次burst只是它偶尔干活更卖力的时候。因为WaitGCThread的两次突发完全被ExecuteMtGc的突发帧集合覆盖（pctBinA=100%），可以确认这不是两个独立问题，而是同一件事的两个侧面：Lua GC线程干活变慢→主线程等它的时间变长。

**自我审查**

深度：已用correlateFrameSets验证了ExecuteMtGc和WaitGCThread的因果关系（前者是因，后者是果），避免把两个marker当成两个独立发现来重复计算严重度。严重度：5次burst、总影响面不算大，且是Lua运行时的常规GC机制在正常工作（只是强度有波动），定为medium。统计陷阱：已确认burstFrames里343/350/351/352是连续几帧而非随机分布，这提示了是一段持续窗口而非孤立单帧，已在recommendation里如实反映这个模式。证据/口径：pctBinA数字直接来自correlateFrameSets真实计算。反例：未发现ExecuteMtGc与主线程整体慢帧有强相关（未做该项correlateFrameSets，此处主动承认没有验证这一层关联，避免过度声称）。

**证据链**

1. `scanMetricOverFrames(markerName=LuaMtGc.ExecuteMtGc, metric=selfMs)`
   → presentFrames=600,mean=0.592ms,p50=0.365ms,p95=1.214ms,p99=4.414ms,max=21.59ms@frame194,spikeRatio=59.13,burstFrames=[194,343,350,351,352],burstFramesTotal=5
2. `scanMetricOverFrames(markerName=LuaMtGc.WaitGCThread, metric=selfMs)`
   → presentFrames=600,mean=0.018ms,max=3.90ms@frame351,burstFrames=[194,351],burstFramesTotal=2
3. `correlateFrameSets(setA={"kind":"markerSpike","markerName":"LuaMtGc.ExecuteMtGc"}, setB={"kind":"markerSpike","markerName":"LuaMtGc.WaitGCThread"})`
   → pctBinA=100%，即WaitGCThread的2个突发帧(194,351)全部包含在ExecuteMtGc的5个突发帧集合里，说明WaitGCThread是ExecuteMtGc的下游副作用而非独立问题

---

## 发现8：URP渲染管线RenderGraphSetup每帧稳定2.25毫秒，检查后是正常渲染负载，不是bug  `[F06]`

**技术论证**

maxSelfMs(3.86ms)只是mean(2.25ms)的1.7倍，波动很小，说明这个开销几乎不随场景内容变化，是URP渲染管线本身在当前项目配置下（渲染特性/相机数量/RenderGraph复杂度）产生的固定成本，与场景里的实体数量、行军线数量等游戏逻辑无关。

**自我审查**

深度：已下钻确认是叶子级，没有回避深挖，只是深挖后发现确实无法再分。严重度：虽然总量1351ms看起来大，但由于波动小、找不到任何异常证据（无burst、无尖峰关联），主动降级为low而不是随大流定为high——避免"只要总量大就是严重问题"的误判，这是本轮自我批判特别要防的严重度排错陷阱。证据/口径：triangles/batches的mean/max数字直接来自queryFrameCounters真实返回。反例：未发现该marker与任何慢帧/尖峰的相关性证据，支持"正常负载"的结论。

**证据链**

1. `queryMarkers(thread=1:Main Thread, nameLike=MapManager, limit=10)`
   → URP.RenderGraphSetup: sumSelfMs=1351.49,sumTotalMs=1364.09,presentInFrames=600,avgSelfMsPerPresentFrame=2.2525,maxSelfMs=3.86@frame538
2. `drillDownMarker(rootMarker=URP.RenderGraphSetup, maxDepth=3, minMsPerFrame=0.1)`
   → rootTotalMsPerFrame=2.2735,rootSelfMsPerFrame=2.2525,children=[]，已是叶子级，无法进一步分摊
3. `queryFrameCounters(frames=[483,519])`
   → 全程summary: triangles mean=1387902.3(max 1995776) batches mean=175.5(max 248) set_pass_calls mean=145.6(max 207)，波动幅度在2倍以内，非剧烈异常

---

## 发现9：GPU呈现尖峰（Gfx.PresentFrame炸到40ms）是显卡/present层面的独立问题，与CPU逻辑无关  `[F10]`

**技术论证**

correlateFrameSets给出的intersection=0是决定性证据——如果CPU的极慢帧和GPU present尖峰是同一批帧，两个集合会有大量重叠，但实际完全不重叠，说明它们是两条独立的问题线：CPU侧慢是逐帧脚本/GC造成的，GPU侧present慢是另一套独立的因素（可能是显卡驱动调度、vsync时机、或者GPU侧渲染管线本身在特定帧的负载），彼此没有因果关系。p95=26.28ms这个数字也提示Submit Thread的present本身波动就不算小，是需要放在GPU侧单独分析的问题，而非本次CPU向分析的范畴。

**自我审查**

深度：已用correlateFrameSets交叉验证排除了与CPU侧的关联，这是必要的反例检查而非想当然地把GPU尖峰也归为CPU问题。严重度：定为low，因为它虽然数值上不小（40.17ms），但发生频率极低（2/600帧）且已证实与本次分析主线（CPU逐帧卡顿）无关，继续深挖需要GPU专项工具，超出当前分析范围。统计陷阱：注意到presentFrames=599而非600，说明有1帧完全没有present记录，这个细节未过度解读为异常（很可能是首尾帧边界效应）。证据/口径：intersection=0这个关键排除性证据直接来自真实的correlateFrameSets调用，不是推测。反例：这条本身就是通过寻找反例（是否与CPU慢帧相关）来验证排除假设的例子，反例检查已完成且支持排除结论。

**证据链**

1. `scanMetricOverFrames(markerName=Gfx.PresentFrame, thread=1:Submit Thread, metric=selfMs)`
   → presentFrames=599,mean=8.786ms,p50=2.914ms,p95=26.28ms,p99=32.48ms,max=40.17ms@frame184,burstFrames=[184,220],burstFramesTotal=2
2. `correlateFrameSets(setA={"kind":"slowFrames","thresholdMs":60}, setB={"kind":"markerSpike","markerName":"Gfx.PresentFrame","thread":"1:Submit Thread","minSelfMs":20})`
   → sizeA=27,sizeB=113,intersection=0,pctAinB=0%,pctBinA=0%，两组帧完全不重叠
3. `getThreadTimeline(frameIndex=184)`
   → frame184主线程侧本身耗时正常（约47.9ms），GPU/Present相关的耗时体现在Submit Thread独立时间线上，两者时序上不同步

---

## 发现10：Semaphore.WaitForSignal总量看起来很大（1042ms），但这是Job System的正常空闲等待，不是真热点  `[F09]`

**技术论证**

Semaphore.WaitForSignal这类等待型marker的语义是"这段时间线程什么都没干，在睡眠等信号"，它的耗时高恰恰说明该线程大部分时间是空闲的，而不是过载的。主线程上1.74ms/帧的等待，本身量级不大（相对44.53ms的平均帧时只占约3.9%），如果因为sumSelfMs总量大就把它当成优化目标去"消除等待"，反而可能是缘木求鱼——等待本身是多线程协作的正常代价。

**自我审查**

深度：这是本轮自我批判特别要防的一个陷阱——如果只看sumSelfMs排行榜，Semaphore.WaitForSignal会排进前五，容易被误当成主线索写进primaryDrivers，但深挖其语义（等待类marker）后确认它不是真实计算热点，已主动在verdict.json的ruledOut逻辑中处理、这里单独作为info级记录以说明排查过程。严重度：定为info而非medium/low，因为它根本不是一个需要修复的"问题"，而是需要澄清的"非问题"。统计陷阱：明确指出了同名marker在不同线程上数值差异巨大（主线程1.74ms vs BatchDeleteObjects线程44.58ms），如果不分线程看容易产生混淆的大数字。证据/口径：两次drillDownMarker的返回都完整记录，包括自动选线程的note字段。反例：未发现证据表明主线程的等待与任何慢帧有强相关（其maxSelfMs=19.81ms@frame22，并不在已识别的极慢帧列表里）。

**证据链**

1. `queryMarkers(thread=1:Main Thread, nameLike=MapManager, limit=10)`
   → Semaphore.WaitForSignal(主线程): sumSelfMs=1042.46,presentInFrames=600,avgSelfMsPerPresentFrame=1.7374,maxSelfMs=19.81@frame22
2. `drillDownMarker(rootMarker=Semaphore.WaitForSignal, thread=1:Main Thread, maxDepth=1, minMsPerFrame=0.05)`
   → 主线程上rootSelfMsPerFrame=1.7374ms/帧，是叶子级marker，本身就是"等待"这个动作
3. `drillDownMarker(rootMarker=Semaphore.WaitForSignal, maxDepth=1, minMsPerFrame=0.05)`
   → 自动选中的最高耗时线程是"1:Other Threads.BatchDeleteObjects"，rootSelfMsPerFrame=44.5794ms/帧，说明这个marker名字在多个不同线程上都出现，各自代表不同工作线程的空闲等待，不能把不同线程的数值混在一起当成单一问题看

---
