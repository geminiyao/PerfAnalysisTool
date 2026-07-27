# 审计底稿 · 2026-07-09_03-31-46

> 本文件是正式报告 report.md 的配套审计底稿：每条发现的技术论证、自我审查、可回溯证据链。
> 正式报告只保留"数据+人话建议+调用树"，审计信息放这里，供需要核查的人查阅。

---

## 发现1：相机一移动镜头，画面就要卡一下：全场19次相机移动，每次平均  `[camera.oncameramove.spike]`

**技术论证**

scanMetricOverFrames显示OnCameraMove只在19/600帧出现(presentFrames=19)，均值被大量0值稀释到1.37ms，但avgWhenPresent高达43.14ms，说明这是'稀有但剧烈'型问题，不能用全局均值衡量。correlateFrameSets双向验证：pctAinB=100%(19次移动全部落入p95慢帧集合)，pctBinA=65.5%(全场29个最慢帧里65.5%由相机移动解释)——这是強因果关联，且反向验证成立(无相机移动介入的10个慢帧另有独立成因如TryUnloadPending，详见对应finding)。frame144的callTree确认53.4ms全部落在OnCameraMove这一个marker自身(selfMs=53.41=该节点几乎全部totalMs)，且drillDownMarker证实OnCameraMove在调用链里就是叶子节点(无子节点)——已钻到profiler采样粒度极限，这是数据侧的深度上限，不是分析没钻透。

**自我审查**

通过深度审查：drillDownMarker确认OnCameraMove是叶子marker，已到数据极限。通过严重度审查：19次事件虽presentFrames少，但用avgWhenPresent(43ms)+pctBinA(65.5%)而非全局均值衡量，排入critical。通过统计分母审查：pctAinB用的分母是相机移动自身次数(19)而非慢帧总数，未被稀释。通过证据审查：getSourceForSymbol对'OnCameraMove'确认无法精确定位真实实现(5处ambiguous匹配)，已如实记入recommendation和DataRequest，未强行给套话建议。通过反例审查：慢帧集合中还有10帧不含OnCameraMove(29-19=10)，已在TryUnloadPending finding中验证这10帧另有独立成因(frame80由TryUnloadPending主导)，不是漏检。

**证据链**

1. `scanMetricOverFrames(markerName=OnCameraMove, metric=selfMs)`
   → presentFrames: 19.00 · mean: 1.37 · avgWhenPresentApprox: 43.14 · max: 53.41 · maxFrameIndex: 144.00 · burstFramesTotal: 18.00
2. `correlateFrameSets(setA={"kind":"markerSpike","markerName":"OnCameraMove","minSelfMs":1}, setB={"kind":"slowFrames"})`
   → sizeA: 19.00 · sizeB: 29.00 · intersection: 19.00 · pctAinB: 100.00 · pctBinA: 65.52
3. `getFrameCallTree(frameIndex=144, maxDepth=15)`
   → msFrame: 96.47 · leafSelfMs: 53.41 · pctOfFrame: 57.07
4. `drillDownMarker(rootMarker=MapCameraCtrl.UpdateCameraPos, maxDepth=6)`
   → rootTotalMsPerFrame: 2.67

---

## 发现2：地图上画军队行军线的模块，不管发生什么，每一帧都要稳定吃掉2  `[steady.armylinemgr.selfcost]`

**技术论证**

presentInFrames=600说明这不是偶发，是每一帧都在的稳态成本；p50(2.28)和p95(2.76)、spikeRatio仅2.75(远低于OnCameraMove的量级)说明波动很小、是持续性的基础盘子而非尖峰。drillDownMarker显示rootSelfMsPerFrame占rootTotalMsPerFrame的81%，唯一子节点CalculateVertexJob只占0.53ms——说明这2.3ms绝大部分是该marker自身的逐帧遍历/计算逻辑，不是调用了什么昂贵的子系统，已钻到该marker能给出的最深处(它自身selfMs主导，子节点已是Burst Job级别的实现细节)。累计1381ms(across 600帧)在四个候选驱动里总量最大，按'绝对影响'原则应排在OnCameraMove(sumSelfMs=819.7ms)之前，但OnCameraMove单次冲击对玩家的'顿卡感'更强烈，两者是不同性质的问题(持续拖底 vs 突发卡顿)，因此定为high而非把它排到相机问题之上——玩家主观感知上，突发50ms卡顿比分散在600帧里的2.3ms更容易被察觉，但从'省下多少总时间'的角度这个稳态大头潜力更大。

**自我审查**

通过深度审查：drillDownMarker确认该marker selfMs占比81%、非分摊到子节点，已钻到能钻的最深处(子节点是Burst Job粒度)。通过严重度审查：用presentInFrames=600(全勤)+累计sumSelfMs=1381ms(四个候选里最大)重新论证，而非只看单帧avgSelfMs(2.3ms看起来不吓人)，避免'数字小看似不重要'的陷阱；同时承认它与OnCameraMove是不同性质问题，未强行排序压过相机问题。通过证据审查：getSourceForSymbol两种检索方式均未取到真实Update方法体，如实记录局限而非编造优化建议。

**证据链**

1. `queryMarkers(thread=1:Main Thread, sortBy=selfMs, topN=20)`
   → markerName: CS:AOE.Outside.OutSideViewArmyLineMgr · sumSelfMs: 1381.05 · presentInFrames: 600.00 · avgSelfMsPerPresentFrame: 2.30 · maxSelfMs: 6.28
2. `scanMetricOverFrames(markerName=CS:AOE.Outside.OutSideViewArmyLineMgr, metric=selfMs)`
   → presentFrames: 600.00 · mean: 2.30 · p50: 2.28 · p95: 2.76 · max: 6.28 · spikeRatio: 2.75
3. `aggregateSubtree(rootMarker=CS:AOE.Outside.MapManager)`
   → subtreeMsPerFrame: 6.14 · maxChildRatio: 0.46 · biggestChild: OutSideViewArmyLineMgr(2.839ms total)
4. `drillDownMarker(rootMarker=CS:AOE.Outside.OutSideViewArmyLineMgr, maxDepth=6)`
   → rootSelfMsPerFrame: 2.30 · rootTotalMsPerFrame: 2.84 · selfPctOfTotal: 81.00 · onlyChild: OutsideLineCtrl:CalculateVertexJob (Burst) 0.532ms

---

## 发现3：UI布局/网格管理模块也是每帧稳定烧2.1毫秒，600帧累计  `[steady.meshuimanager.selfcost]`

**技术论证**

drillDownMarker证实CS:AOE.MeshUIManager是100%纯叶子marker(totalMs=selfMs，children为空数组)——这是profiler采样粒度的绝对极限，没有更深的子树可钻，已到数据极限。另一个同类稳态marker MUI_UpdateUIPos(686.85ms累计，presentInFrames=600)同样是纯叶子，两者性质一致，一并归入此finding而非拆成两条防止碎片化。presentFrames=600(全勤)+spikeRatio仅2.38(低波动)确认这是稳态基础成本而非尖峰。

**自我审查**

通过深度审查：两次drillDownMarker均确认是纯叶子(children=[])，已到marker粒度极限，如实标注而非强行说'还能再钻'。通过严重度审查：用presentInFrames=600的全勤稳态特征+两个同类marker合计4.4ms(占16.67ms预算26%)论证high级别，而非被单帧2ms的'不起眼'数字误导为low。通过证据审查：getSourceForSymbol两次尝试(类名+方法名)均未取到Update方法体，如实记录为'看不到源码、给不了具体建议'而非编造。

**证据链**

1. `queryMarkers(thread=1:Main Thread, sortBy=selfMs, topN=20)`
   → markerName: CS:AOE.MeshUIManager · sumSelfMs: 1245.70 · presentInFrames: 600.00 · avgSelfMsPerPresentFrame: 2.08 · maxSelfMs: 4.72
2. `scanMetricOverFrames(markerName=CS:AOE.MeshUIManager, metric=selfMs)`
   → presentFrames: 600.00 · mean: 2.08 · p50: 2.00 · p95: 3.33 · max: 4.78 · spikeRatio: 2.38
3. `drillDownMarker(rootMarker=CS:AOE.MeshUIManager, maxDepth=6, minMsPerFrame=0.01)`
   → rootSelfMsPerFrame: 2.08 · rootTotalMsPerFrame: 2.08
4. `drillDownMarker(rootMarker=MUI_UpdateUIPos, maxDepth=6, minMsPerFrame=0.01)`
   → rootSelfMsPerFrame: 1.14 · presentFrames: 600.00

---

## 发现4：全场最慢的一帧(113.6毫秒，是预算的近7倍)，罪魁祸首是  `[gc.collect.frame519.sync]`

**技术论证**

这条finding在自我批判中被重新核查并修正：此前印象里'GC.Collect与最慢帧强相关'的说法经correlateFrameSets验证是错误的——3次GC.Collect出现里只有1次(frame519)落入29帧的p95慢帧集合，pctBinA仅3.45%，是弱相关而非强相关。更关键的是：进一步用getFrameCallTree核查发现GC.Collect在不同帧走的是完全不同的调用路径——frame461/483走'WaitForTargetFPS→GarbageCollector.CollectIncremental'(Unity引擎在等垂直同步空闲时机做的增量GC步进，代价较小6.9~15.3ms，这是正常机制不是bug)，而frame519走的是'CS:AOE.LuaMgr→Core.EndOfFrame'路径(游戏逻辑主动触发的同步Full GC，代价70.2ms，是异常)。这是两种完全不同的机制，此前的分析没有区分开。queryFrameCounters显示frame519的gc_allocated_in_frame(8192字节)反而是相邻帧里最低值，排除了'分配暴涨触发GC'的假设，指向这是定时/主动触发的同步GC。由于只出现1次(600帧里)，且与整体'普遍偏慢'的趋势关联很弱，不适合列入primaryDrivers，但它单帧造成的绝对冲击(70ms)和導致了全场唯一一次超100ms的记录，值得作为独立事件记录，故severity定为medium而非critical。

**自我审查**

通过反例验证这一刀，本条是被最彻底修正的一条：最初粗看时误以为'GC.Collect都发生在最慢的几帧内、与慢帧强相关'，但严格执行correlateFrameSets(kind:markerSpike vs kind:slowFrames)后发现pctBinA只有3.45%，是弱相关，已改口径明确写'弱相关'并解释原因(两种不同GC路径混在一起看造成了错觉)。通过统计分母审查：3次GC事件中的33.33%(pctAinB)看起来低，但没有被这个数字误导为'不重要'——用绝对值(70.2ms单帧冲击)和事件性质(全场唯一同步Full GC)来定性，而不是用被稀释的相关性占比。通过深度审查：GC.Collect是运行时叶子marker，已用queryFrameCounters从另一个维度(内存分配计数器)交叉验证了机制区分(CollectIncremental的常规步进 vs LuaMgr路径的主动Full GC)，这是补充证据而非到此为止。通过严重度审查：因presentFrames=3且pctBinA低，未列入primaryDrivers，定为medium(不是critical)——避免被单次70ms的绝对数字吓到而高估其对整体verdict的贡献。

**证据链**

1. `scanMetricOverFrames(markerName=GC.Collect, metric=selfMs)`
   → presentFrames: 3.00 · mean: 0.15 · max: 70.20 · maxFrameIndex: 519.00
2. `getFrameCallTree(frameIndex=519, maxDepth=12)`
   → msFrame: 113.56 · path: PlayerLoop>PostLateUpdate.PlayerSendFrameComplete>...>CS:AOE.LuaMgr>GC.Collect · selfMs: 70.20 · pctOfFrame: 61.82
3. `getFrameCallTree(frameIndex=483, maxDepth=10)`
   → msFrame: 57.48 · selfMs: 15.33 · pctOfFrame: 26.68
4. `correlateFrameSets(setA={"kind":"markerSpike","markerName":"GC.Collect","minSelfMs":1}, setB={"kind":"slowFrames"})`
   → sizeA: 3.00 · sizeB: 29.00 · intersection: 1.00 · pctAinB: 33.33 · pctBinA: 3.45
5. `queryFrameCounters(frames=[517,518,519,520])`
   → gc_allocated_in_frame_519: 8192.00 · note: frame519分配量是相邻帧里最低的，不是分配尖峰触发的GC

---

## 发现5：资源卸载偶尔会炸一下：均值只有0.11毫秒的不起眼小操作，在  `[resource.tryunload.spike]`

**技术论证**

drillDownMarker证实这是分摊型成本：叶子列表里没有单一大头，14.59ms的self耗时分摊在多个具体资源包([res]ab_unload:bundle/environment/...等)的卸载操作和ResFsmLogMgr.Log日志调用上，是批量卸载操作本身的成本而非某个特定资源卡住。frame80的getFrameCallTree验证独立性：该帧总耗时70.09ms里TryUnloadPending占21.17ms(30.2%)，这帧不含OnCameraMove(验证了'慢帧不一定都是相机问题'的反例，本身即是对camera finding的反向验证)。correlateFrameSets显示pctBinA仅6.9%——这次没有被分母骗，因为8次事件本身样本量就小，6.9%的关联在样本量下是真实偏低，不是被稀释，判定为low级别、独立的偶发性问题。

**自我审查**

通过深度审查：drillDownMarker已钻到具体资源包级别的叶子，确认是分摊型无单一大头，符合'钻到底'要求。通过严重度审查：8次事件、pctBinA仅6.9%，结合frame80单帧21.3ms的绝对冲击，权衡后定为low(不是medium)——因为其presentFrames=600(mean很低)且burstFramesTotal只有6，是真正的低频偶发，不像OnCameraMove那样次次必卡。通过反例验证：用frame80(无相机移动介入)证明了慢帧存在独立于相机问题的第二成因，这个反例同时支撑了本finding的独立性和camera finding里'该分母未被稀释'的判断。

**证据链**

1. `scanMetricOverFrames(markerName=TryUnloadPending.TryUnload, metric=selfMs)`
   → presentFrames: 600.00 · mean: 0.11 · p95: 0.31 · max: 14.59 · maxFrameIndex: 80.00 · spikeRatio: 1394.08 · burstFramesTotal: 6.00
2. `getFrameCallTree(frameIndex=80, maxDepth=12)`
   → msFrame: 70.09 · selfMs: 14.59 · totalMs: 21.17 · pctOfFrame: 30.21
3. `drillDownMarker(rootMarker=TryUnloadPending.TryUnload, maxDepth=6, minMsPerFrame=0.001)`
   → rootSelfMsPerFrame: 0.11
4. `correlateFrameSets(setA={"kind":"markerSpike","markerName":"TryUnloadPending.TryUnload","minSelfMs":1}, setB={"kind":"slowFrames"})`
   → sizeA: 8.00 · sizeB: 29.00 · intersection: 2.00 · pctAinB: 25.00 · pctBinA: 6.90

---

## 发现6：GPU提交画面这一步(Gfx.PresentFrame)本身  `[gfxpresent.submitthread.steady]`

**技术论证**

correlateFrameSets显示Gfx.PresentFrame高耗时帧集合(162帧, minSelfMs>15ms)与主线程慢帧集合(29帧)的intersection=0——完全不重叠，说明这个Submit线程上的耗时不会拖慢主线程判定的帧率(msFrame是按主线程PlayerLoop计算的)。同时主线程侧的Gfx.WaitForPresentOnGfxThread(主线程等待GPU present的耗时)均值仅0.0098ms，说明主线程并没有在显著等待这个环节。这是一个'看起来数字不小但实际不影响主线程帧率判定'的现象，因此不列为driver，只作为info记录，提醒后续如果verdict的判定口径改为'端到端呈现延迟'而非'主线程CPU耗时'，这里可能需要重新评估。

**自我审查**

通过反例验证：本条finding本身就是一次'反例检查'的产物——本以为Gfx.PresentFrame耗时高可能是隐藏的性能问题，但correlateFrameSets显示intersection=0，主动验证了它跟主线程慢帧无关，避免了误报。通过严重度审查：因为与慢帧判定完全脱钩，主动降级为info而非medium/low，不夸大其影响。通过证据审查：确认了这是Submit Thread(非Main Thread)的数据，跨线程比较时明确标注了线程来源，防止口径混淆。

**证据链**

1. `scanMetricOverFrames(markerName=Gfx.PresentFrame, thread=1:Submit Thread, metric=selfMs)`
   → presentFrames: 599.00 · mean: 8.79 · p50: 2.91 · p95: 26.28 · max: 40.17 · maxFrameIndex: 184.00 · spikeRatio: 13.78
2. `correlateFrameSets(setA={"kind":"markerSpike","markerName":"Gfx.PresentFrame","thread":"1:Submit Thread","minSelfMs":15}, setB={"kind":"slowFrames"})`
   → sizeA: 162.00 · sizeB: 29.00 · intersection: 0.00 · pctAinB: 0.00 · pctBinA: 0.00
3. `scanMetricOverFrames(markerName=Gfx.WaitForPresentOnGfxThread, metric=selfMs)`
   → mean: 0.01 · max: 0.21

---
