# 性能分析报告 · 2026-07-09_06-58-16

## 总判定：🔴 不合格

> 这次采集全程600帧，100%都超过16.67ms(60fps)预算，中位帧要41.95ms(约合24fps)，最慢一帧飙到113.56ms(约7倍预算)；这不是偶尔掉帧，而是从第一帧到最后一帧持续性地拖。根因是双重叠加：一是每帧都在燃烧的常驻基线成本(脚本调度Core.Update约12.9ms/帧+URP渲染管线约10.6ms/帧，二者合计已超预算本身)，二是叠加在基线之上的偶发尖峰(相机移动19次、单次代价43~53ms；一次孤立的同步Full GC炸出70.2ms破了全场最慢纪录)。即便挑一个'看起来正常'的中位数代表帧(frame 33，41.92ms)，也没有任何单一异常大头——超预算已经写进了每一帧的默认账本里。

| 指标 | 数值 |
|------|------|
| 目标帧预算 | 16.7ms / 60fps |
| 实测中位（P50） | 42.0ms |
| P95 | —ms |
| P99 | 95.5ms |
| 最差帧 | —ms |
| 超预算帧占比 | 100.0% |

---

## §0 结论先行

**1. 光是脚本调度这一层(Core.Update)，每一帧就要稳定烧掉12.88毫秒——这已经比60fps预算(16.67ms)的四分之三还多，而这不是某一次尖峰，是600帧全勤的常态账单**


   _依据：baseline.coreupdate.luamgr-mapmanager_

**2. 渲染管线(URP)本身每帧也要吃掉10.64毫秒，而且是分散型开销——没有单一渲染阶段占大头，四个主要pass(半透明渲染2.98ms、后处理2.59ms、渲染器设置2.34ms、渲染前处理1.85ms)几乎平均分摊，说明这是整条管线普遍偏重，而不是某一步卡住了**


   _依据：baseline.urp.rendersinglecamera_

**3. 相机一移动镜头，画面就要卡一下：全场19次相机移动，每次平均多花约43毫秒、最慢一次53.41毫秒，几乎单独吃掉一整帧的预算，而且19次相机移动100%全部落在最慢的那批帧里，无一例外**


   _依据：camera.oncameramove.spike_

**4. 全场最慢的一帧(113.56毫秒，约7倍预算)，罪魁祸首是一次同步式的完整垃圾回收(GC.Collect)，单这一下就吃掉70.2毫秒，占了那一帧61.82%的时间；这是个孤立事件，600帧里只以这种形态炸了这一次，且与'画面整体卡不卡'的趋势关联很弱(仅3.45%的最慢帧集合能被它解释)，但它单帧造成的绝对冲击是全场之最，值得作为独立主因记录**


   _依据：gc.collect.frame519.sync_

---

## §1 详细发现（7 条）

### 🔴 发现1：光是脚本调度这一层(Core.Update)，每一帧就要稳定

<sub>严重度：**严重** ｜ 置信度：**高置信**</sub>

光是脚本调度这一层(Core.Update)，每一帧就要稳定烧掉12.88毫秒——这已经比60fps预算(16.67ms)的四分之三还多，而这不是某一次尖峰，是600帧全勤的常态账单。其中LuaMgr调度占6.82ms、地图管理器(MapManager)占4.84ms，是两大头。

**优化建议**

MapSignificanceMgr.ProcessTask_MapEntityAdd/MapObjRefresh已知是presentFrames仅258/289（非每帧），说明这部分是任务式而非纯常�instant开销，若要优化应关注是否能把任务分摊到更多帧而非集中处理。MUI_UpdateUIPos(1.1448ms selfMs，600帧全勤)和OutSideViewArmyLineMgr(2.302ms selfMs，600帧全勤，81%自耗非分摊到子节点)是两个真正'每帧必开销'的纯自耗型marker，是更值得关注的优化对象——但getSourceForSymbol对'OutSideViewArmyLineMgr'和裸方法名'OnUpdate'均未能定位到真实逐帧代码体（OnUpdate在codegraph里有大量同名重载污染，直接查类名resolvedVia=none），因此无法给出具体的代码级修改建议，已记入DataRequest。

_标签：baseline · steady-cost · script-update · systemic_

---

### 🟠 发现2：渲染管线(URP)本身每帧也要吃掉10.64毫秒，而且是分散

<sub>严重度：**高** ｜ 置信度：**高置信**</sub>

渲染管线(URP)本身每帧也要吃掉10.64毫秒，而且是分散型开销——没有单一渲染阶段占大头，四个主要pass(半透明渲染2.98ms、后处理2.59ms、渲染器设置2.34ms、渲染前处理1.85ms)几乎平均分摊，说明这是整条管线普遍偏重，而不是某一步卡住了。

**优化建议**

四个渲染子阶段均无单一大头，若要优化应从降低整体渲染复杂度入手（如减少batches/set_pass_calls数量，需要结合queryFrameCounters的triangles/batches数据做进一步的渲染负载分析，但这已超出本次可用工具的marker级定位能力）。URP.RenderGraphSetup累计1351ms（600帧全勤，avg 2.25ms/帧）是渲染管线里排名前列的稳态开销，是引擎内置渐进式渲染图搭建逻辑，非业务代码，没有可读的用户态源码可查。

_标签：baseline · steady-cost · rendering · urp_

---

### 🔴 发现3：相机一移动镜头，画面就要卡一下：全场19次相机移动，每次平均

<sub>严重度：**严重** ｜ 置信度：**高置信**</sub>

相机一移动镜头，画面就要卡一下：全场19次相机移动，每次平均多花约43毫秒、最慢一次53.41毫秒，几乎单独吃掉一整帧的预算，而且19次相机移动100%全部落在最慢的那批帧里，无一例外。

**优化建议**

OnCameraMove挂在InfiniteZoomMgr.PostCameraMoveScale之下，已读取InfiniteZoomMgr:OnOutsideCameraMove的Lua源码(Assets/Scripts/.Lua/Module/InfiniteZoom/InfiniteZoomMgr.lua:396-438)，代码里已有CanWork()早退检查和状态机(curState)判断，说明这条路径本身已做过一轮优化。但OnCameraMove这个marker本身在profiler里是叶子节点、无法再往下看它内部具体在算什么，需要看OnCameraMove对应的真实C#/Lua函数体才能给出具体可落地的优化点——getSourceForSymbol对'OnCameraMove'匹配到5个不相关的同名节点(ambiguous=true)，未能定位真实实现，已记入DataRequest。

_标签：spike · camera · tail-latency_

---

### 🔴 发现4：全场最慢的一帧(113.56毫秒，约7倍预算)，罪魁祸首是一

<sub>严重度：**严重** ｜ 置信度：**高置信**</sub>

全场最慢的一帧(113.56毫秒，约7倍预算)，罪魁祸首是一次同步式的完整垃圾回收(GC.Collect)，单这一下就吃掉70.2毫秒，占了那一帧61.82%的时间；这是个孤立事件，600帧里只以这种形态炸了这一次，且与'画面整体卡不卡'的趋势关联很弱(仅3.45%的最慢帧集合能被它解释)，但它单帧造成的绝对冲击是全场之最，值得作为独立主因记录。

**优化建议**

GC.Collect是Unity运行时API级别的marker，属于引擎内置行为，没有可读的用户态源码可以getSourceForSymbol查询。根因排查方向应是找到frame519附近LuaMgr.EndOfFrame流程里是谁主动调用了System.GC.Collect（可能是资源卸载/场景切换/Lua侧的Full GC触发逻辑），但现有drillDownMarker/getFrameCallTree只能看到GC.Collect本身是调用树的叶子、看不到是哪行业务代码触发的这次调用——已记入DataRequest。

_标签：gc · spike · tail-latency · one-off_

---

### 🟡 发现5：除了主线程那次70ms的同步GC，还有一套独立的Lua侧多线

<sub>严重度：**中** ｜ 置信度：**高置信**</sub>

除了主线程那次70ms的同步GC，还有一套独立的Lua侧多线程GC机制(LuaMtGc.ExecuteMtGc)也会偶发飙高：均值仅0.59ms，但在frame 194单次冲到21.59ms(是均值的36.5倍)，全场600帧里有5帧出现这种突刺；这是与主线程GC完全独立的第二套GC机制，且并不与全场最慢帧集合有强关联。

**优化建议**

该marker是Lua虚拟机多线程GC的C#层触发接口，真正的耗时发生在原生/Lua VM层内部，getSourceForSymbol只能看到转发调用，无法进一步下钻到具体是哪段Lua代码或哪类对象分配触发了这次GC放大。如果需要进一步定位，需要Lua侧的GC统计信息（如每次触发的对象数量/内存增量），这已超出现有工具的数据范围，已记入DataRequest。

_标签：gc · spike · lua · multithread_

---

### 🟢 发现6：资源卸载偶尔会炸一下：均值只有0.11毫秒的不起眼小操作，在

<sub>严重度：**低** ｜ 置信度：**高置信**</sub>

资源卸载偶尔会炸一下：均值只有0.11毫秒的不起眼小操作，在frame 80突然飙到14.59毫秒(是均值的132倍)，那一帧因此多花了21.34毫秒(占该帧30.45%)在批量卸载各种没用的资源包上，但这种事600帧里只发生了6次突刺，且与全场最慢帧集合的关联很弱。

**优化建议**

叶子列表显示耗时分摊在多个具体bundle文件的卸载([res]ab_unload:bundle/environment/world/building/...)和ResFsmLogMgr.Log日志记录上，没有单一可优化的大头。若要优化，方向是减少单帧内批量卸载的资源包数量（分散到多帧）或降低ResFsmLogMgr.Log的日志开销，但DoUnload()内部具体做了什么已无法通过getSourceForSymbol继续下钻（ambiguous，6个候选无法消歧），已记入DataRequest。

_标签：spike · resource-unload · spread-cost_

---

### ℹ️ 发现7：GPU提交画面这一步(Gfx.PresentFrame)本身

<sub>严重度：**信息** ｜ 置信度：**中置信**</sub>

GPU提交画面这一步(Gfx.PresentFrame)本身平均要花8.8毫秒，最高能到40.17毫秒，几乎每帧都有一定负担，但这发生在独立的Submit线程上，跟主线程判定的'慢帧'集合完全没有重叠(162个高耗时帧与29个慢帧交集为0)，更像是独立于主线程CPU耗时判定之外的渲染管线/GPU负载基线，不直接拖累本次verdict所用的帧时间口径。

**优化建议**

不涉及具体代码热点，无需getSourceForSymbol；这是GPU渲染管线的稳态开销，若要优化需要从渲染复杂度(batches/triangles等计数器)角度切入，属于渲染优化范畴，非本次数据能给出具体代码级建议的对象。

_标签：gpu-present · cross-thread · no-impact-verified_

---

_Prism 探索：— 次查询　证据核对：—　｜ 技术论证/证据链见 report-audit.md_
