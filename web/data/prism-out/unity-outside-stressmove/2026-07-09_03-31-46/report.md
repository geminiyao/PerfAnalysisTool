# 性能分析报告 · 2026-07-09_03-31-46

## 总判定：🔴 不合格

> 这次采集全程600帧全部超过16.67ms(60fps)预算，中位帧都要41.9ms(约合24fps)，最慢一帧飙到113.6ms；这不是偶尔掉帧，是从头到尾都在拖。系统性拖累主要来自两处每帧都在吃的常驻成本——地图行军线和UI布局模块合计每帧稳定多花4.4ms，叠加相机一移动就单帧多卡43~53ms(19次移动全部命中慢帧，无一例外)；此外还有一次孤立的同步GC炸出70ms把frame 519送上全场最慢，但这只是单次极端事件、不代表普遍问题。

| 指标 | 数值 |
|------|------|
| 目标帧预算 | 16.7ms / 60fps |
| 实测中位（P50） | 41.9ms |
| P95 | —ms |
| P99 | 95.5ms |
| 最差帧 | —ms |
| 超预算帧占比 | 100.0% |

---

## §0 结论先行

**1. 相机一移动镜头，画面就要卡一下：全场19次相机移动，每次平均多花43毫秒、最慢一次53毫秒，几乎单独吃掉一整帧的预算，而且19次无一例外全部落在最慢的那批帧里**


   _依据：camera.oncameramove.spike_

**2. 地图上画军队行军线的模块，不管发生什么，每一帧都要稳定吃掉2.3毫秒，600帧下来累计1.38秒——这是个'不声不响但从不缺席'的基础开销，比任何单次尖峰加起来都更能拖累整体帧率**


   _依据：steady.armylinemgr.selfcost_

**3. UI布局/网格管理模块也是每帧稳定烧2.1毫秒，600帧累计1.25秒，和上面那个行军线模块加起来，光这两个'常驻后台'就吃掉每帧4.4毫秒——已经是预算(16.67ms)的四分之一还多**


   _依据：steady.meshuimanager.selfcost_

---

## §1 详细发现（6 条）

### 🔴 发现1：相机一移动镜头，画面就要卡一下：全场19次相机移动，每次平均

<sub>严重度：**严重** ｜ 置信度：**高置信**</sub>

相机一移动镜头，画面就要卡一下：全场19次相机移动，每次平均多花43毫秒、最慢一次53毫秒，几乎单独吃掉一整帧的预算，而且19次无一例外全部落在最慢的那批帧里。

**优化建议**

OnCameraMove挂在InfiniteZoomMgr.PostCameraMoveScale之下，已读取InfiniteZoomMgr:OnOutsideCameraMove的Lua源码(Assets/Scripts/.Lua/Module/InfiniteZoom/InfiniteZoomMgr.lua:396-438)，代码里已有CanWork()早退检查和状态机(curState==InfiniteZoomState.None)判断，说明这条路径本身已做过一轮优化。但OnCameraMove这个marker本身在profiler里是叶子节点、无法再往下看它内部具体在算什么(可能是相机移动触发的地图/UI大范围重新计算或资源刷新)，需要看OnCameraMove对应的真实C#/Lua函数体（getSourceForSymbol对'OnCameraMove'匹配到5个不相关的同名Lua空函数，未能定位真实实现）才能给出具体可落地的优化点，已记入DataRequest。

_标签：spike · camera · tail-latency_

---

### 🟠 发现2：地图上画军队行军线的模块，不管发生什么，每一帧都要稳定吃掉2

<sub>严重度：**高** ｜ 置信度：**高置信**</sub>

地图上画军队行军线的模块，不管发生什么，每一帧都要稳定吃掉2.3毫秒，600帧下来累计1.38秒——这是个'不声不响但从不缺席'的基础开销，比任何单次尖峰加起来都更能拖累整体帧率。

**优化建议**

已尝试用getSourceForSymbol获取OutSideViewArmyLineMgr.OnUpdate的真实逐帧代码，但'OnUpdate'字符串在codegraph里匹配到466个同名节点，工具只能返回其中一个不相关的接口声明(Assets/Framework/Core/ILauncherExtension.cs:7的`void OnUpdate(float deltaTime)`空签名)。改用类名'OutSideViewArmyLineMgr'直接查询也未命中(resolvedVia=none)。只拿到该类的字段声明(Assets/Scripts/CS/Outside/View/OutSideViewArmyLineMgr.cs:23-65)，其中注释已写明'复用列表，避免每帧GC'和'OnUpdateChaserLine优化，每帧只更新一个army的追击线'——说明该代码已经过一轮性能优化，不能再建议'加缓存'这类套话。没有看到真实Update方法体，无法给出更具体的代码级建议，已记入DataRequest。

_标签：spread-cost · steady-baseline_

---

### 🟠 发现3：UI布局/网格管理模块也是每帧稳定烧2.1毫秒，600帧累计

<sub>严重度：**高** ｜ 置信度：**高置信**</sub>

UI布局/网格管理模块也是每帧稳定烧2.1毫秒，600帧累计1.25秒，和上面那个行军线模块加起来，光这两个'常驻后台'就吃掉每帧4.4毫秒——已经是预算(16.67ms)的四分之一还多。

**优化建议**

已尝试getSourceForSymbol('MeshUIManager')，只拿到该类的静态基础设施声明(Assets/Scripts/CS/MeshUI/MeshUIManager.cs:7-49)，包含resource/renderers/controls/animation/layouts/dynamicAtlas/eventSystem等子系统字段和OnCreate初始化方法——这是接口层/组织结构代码，不是每帧调度的Update逻辑本体。尝试'MeshUIManager.OnUpdate'同样被'OnUpdate'的466个同名匹配污染，拿到不相关的接口声明。没有看到该marker对应的真实每帧调度代码，无法判断2.1ms具体花在UI重新布局/渲染批次合并/字体渲染等哪个子系统，已记入DataRequest，不给臆测性建议。

_标签：spread-cost · steady-baseline · ui_

---

### 🟡 发现4：全场最慢的一帧(113.6毫秒，是预算的近7倍)，罪魁祸首是

<sub>严重度：**中** ｜ 置信度：**高置信**</sub>

全场最慢的一帧(113.6毫秒，是预算的近7倍)，罪魁祸首是一次同步式的完整垃圾回收(GC.Collect)，单这一下就吃掉70.2毫秒，占了那一帧62%的时间；但这是个孤立事件，600帧里只炸了这一次，跟'画面卡不卡'的整体趋势没什么关系。

**优化建议**

GC.Collect是Unity运行时API级别的marker，属于引擎内置行为，没有可读的用户态源码可以getSourceForSymbol。根因排查方向应是找到frame519附近LuaMgr.EndOfFrame流程里是谁主动调用了System.GC.Collect(可能是资源卸载/场景切换/Lua侧的Full GC触发逻辑)，但这需要能定位'谁在frame519调用了GC.Collect'的调用者信息，现有drillDownMarker/getFrameCallTree只能看到GC.Collect本身是叶子、看不到是哪行业务代码触发的——已记入DataRequest。

_标签：gc · spike · one-off_

---

### 🟢 发现5：资源卸载偶尔会炸一下：均值只有0.11毫秒的不起眼小操作，在

<sub>严重度：**低** ｜ 置信度：**高置信**</sub>

资源卸载偶尔会炸一下：均值只有0.11毫秒的不起眼小操作，在frame 80突然飙到14.6毫秒(是均值的132倍)，那一帧因此多花了21.3毫秒在批量卸载各种没用的资源包上，但这种事600帧里只发生了8次，且集中在少数几帧。

**优化建议**

叶子列表显示耗时分摊在多个具体bundle文件的卸载([res]ab_unload:bundle/environment/world/building/...)和ResFsmLogMgr.Log日志记录上，没有单一可优化的大头。若要优化，方向是减少单帧内批量卸载的资源包数量(分散到多帧)或降低ResFsmLogMgr.Log的日志开销，但这是引擎资源管理层的行为，没有进一步的用户态源码可查(TryUnloadPending.TryUnload本身是资源管理系统的内部方法，非业务代码)。

_标签：spike · resource-unload · spread-cost_

---

### ℹ️ 发现6：GPU提交画面这一步(Gfx.PresentFrame)本身

<sub>严重度：**信息** ｜ 置信度：**中置信**</sub>

GPU提交画面这一步(Gfx.PresentFrame)本身平均要花8.8毫秒，最高能到40毫秒，几乎每帧都有一定负担，但这发生在独立的Submit线程上，跟主线程判定的'慢帧'集合完全没有重叠，更像是稳定的渲染管线/GPU负载基线，不是某个代码bug。

**优化建议**

不涉及具体代码热点，无需getSourceForSymbol；这是GPU渲染管线的稳态开销，若要优化需要从渲染复杂度(batches/triangles)角度切入，属于渲染优化范畴，非本次数据能给出具体代码级建议的对象。

_标签：gpu-present · cross-thread · no-impact-verified_

---

_Prism 探索：92 次查询　证据核对：24/24 通过　｜ 技术论证/证据链见 report-audit.md_
