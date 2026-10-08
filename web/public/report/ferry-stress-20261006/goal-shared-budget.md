# 五条路径拆清后，再判断是否需要共用每帧剩余执行时间

这是完成模块内优化后才考虑的验证任务；没有独立收益实测。复制以下正文到新会话，按需要加 /goal。

```text
请先验证是否确有跨模块同帧执行叠加问题，再决定是否实现统一累计计时。

采样条件：抢渡口，24072PX77C，游戏版本0.0.999.1020，精致画质。报告部署地址：https://aoeyz-perf.devcloud.woa.com/cpu/report/ferry-stress-20261006/report.html 。本地报告目录：K:/AI/PerfAnalysisTool_Codebuddy/web/public/report/ferry-stress-20261006/。

证据状态：工作区源码核查与后续实施任务；未修改游戏、未新增采样、未验证优化收益。工作区源码与采样包逐行一致性尚未证实。

共同要求：
1. 先检查当前工作区改动、代码版本、手机包版本及相关开关；保留已有实现与他人改动。旧采样只能说明当时的成本，不能证明当前代码仍走同一路径。
2. 目标是减少必要工作之外的重复CPU，并降低集中执行造成的慢帧；不得通过丢任务、漏显示、无限延迟或改变结算结果取得好帧率。
3. 先读源码和已有pdata定位具体子项，形成局部改动，再完成有意义的正确性验证。只有确认需要实机验证时才执行该任务明确涉及的采集；相同画质、负载和轨迹分别比较基线与改后，至少3轮，未达到统计覆盖则说明局限。
4. 分别记录全程均、真实业务发生帧均、逐帧累计P95/max、调用次数、必要工作完成数及总CPU。父子耗时不能相加，最大单次与最大帧累计分别列出。
5. 为等待执行的工作记录提交时间、开始时间、实际完成时间，以及用户可见的对象何时完成显示。按业务定义允许延迟，再设验收值；报告原先的100/250ms没有体验或实测依据，不作为验收标准。
6. 完成条件：交付可审阅代码差异、正确性验证、对照证据和收益边界。不能实施或缺少包/负载时，给出具体阻塞条件与已完成结果，不宣称优化已完成。

前置任务：
- 读取并确认 goal-prepare.md 的当前实现和验证结果：MapSignificanceMgr：先减少重复增删改，再拆预处理整批与单实体重操作
- 读取并确认 goal-layer-scan.md 的当前实现和验证结果：MapCoreMgr：核对延后扫描是否生效，优化实体ID准备与单实体切层处理
- 读取并确认 goal-view.md 的当前实现和验证结果：资源田视图：拆清可见回调、树模型创建与等级显示，管理未完成批次
- 读取并确认 goal-frame-end.md 的当前实现和验证结果：LoaderManager：定位具体资源与完成回调，完善已有帧末时间片
- 读取并确认 goal-bigcity.md 的当前实现和验证结果：名城图标：减少重复显示判定，保留未完成队列并验证差分收益

源码输入：
- G:/AOEYZ_Trunk/AOE3D/Assets/Scripts/.Lua/Outside/Map/Core/MapSignificanceMgr.lua:550
  - 函数：OnUpdate:550、UpdatePrepareTask:684、ReadyForProcessTask:1445、CanProcessTask:1508、ProcessSignificanceTasks:1583、ConsumeTasks_MapEntity:1745
  - 本次核查SHA256：50d0a310f47c7483bff3d02117c4588965ed41c2de607c4e6976f7d1fedbb987
- G:/AOEYZ_Trunk/AOE3D/Assets/Scripts/.Lua/Outside/Map/Core/MapCoreMgr.lua:773
  - 函数：OnUpdate:199、ScheduleInfiniteLayerEntityScan:694、ProcessInfiniteLayerEntity:722、ProcessInfiniteLayerEntityScanTask:773、OnInfiniteLayerLevelChange:849
  - 本次核查SHA256：c812e98c1398c8052aeea30b0d8683fb1670dbcab2e9c049c225e4d2d639d878
- G:/AOEYZ_Trunk/AOE3D/Assets/Scripts/.Lua/Outside/Map/Logic/ResLandViewPipeline.lua:173
  - 函数：OnNewlyVisible:173、同步批量调用:246、OnNewlyVisibleAsync:253（需验证实际调用方）
  - 本次核查SHA256：22edd0f736e7a3e335f123673ed84d586e06ee5f9e3d565a552124fa140dcba8
- G:/AOEYZ_Trunk/AOE3D/Assets/Scripts/CS/Outside/View/OutsideViewGridLine.cs:369
  - 函数：CreateResourceLandAndLevelBatch:369、InitForestTreeBatch、AddResLevelBatch
  - 本次核查SHA256：f2eb182f712043362f5d1680a12cf51c58fd8d3bf6ebd2a35682501f9ce3e6e0
- G:/AOEYZ_Trunk/AOE3D/Assets/Framework/com.tencent.timitbu.res/Runtime/V3/Core/LoaderManager.cs:844
  - 函数：OnFrameEnd:830、TickLoadOnFrameEnd:844、loader.OnFrameEnd:876、时间片检查:898
  - 本次核查SHA256：ddbc8fac72b0bc2488bfe60735d6d1a3a632a6de49ba60800591be34d1a62bb1
- G:/AOEYZ_Trunk/AOE3D/Assets/Framework/com.tencent.timitbu.res/Runtime/V3/Core/Loader/GameObjectLoader.cs:109
  - 函数：OnFrameEnd:109、InstantiateAndFinish:142
  - 本次核查SHA256：5c22e31934d94912cc679c9ba019584426f323f68cd4839be98e91fa5aa0c31c
- G:/AOEYZ_Trunk/AOE3D/Assets/Scripts/.Lua/Module/InfiniteZoom/Ctrl/InfiniteZoomMapGoEffectCtrl.lua:1386
  - 函数：OnOutsideCameraMove:335、RefreshBigCityIcon:1305、Legacy:1322、ScheduleBigCityIconRefreshTasks:1386、ProcessBigCityIconRefreshTasks:1412
  - 本次核查SHA256：edf0d06b0ade1a74c6bc7d54da2ac594c30a160d939fda5f24bd65914931ea02

实施与验收步骤：
1. 先完成上面五条任务中实际有收益且可暂停的改动；确认MapSignificance预处理＋消费、MapCore扫描、资源田创建、帧末资源集成及名城图标的真实执行阶段。
2. 按Unity frameCount记录各路径在同一帧的互斥执行时间、开始/结束及剩余任务；重点检查它们一起执行的慢帧。按实际调用范围归账：资源创建若在重要度消费或Loader回调内，不能再从父路径重复扣除。
3. 只有独立模块时间片叠加确实导致慢帧时，才设计同一帧的累计计时记录：Update/LateUpdate/帧末读同一frameCount记录，不拿Core.Update包围所有阶段。每个可暂停批次开始前查余量，完成后扣实际耗时，下一批留到后续帧。
4. 需要先由业务确认哪些状态必须当帧完成，哪些可稍后显示；持续输入下记录每个实体/资源已等多久，沿模块现有顺序和超时处理选择待办，不随意推迟一致性删除、网络消息或结算。
5. 同负载对照独立时间片与统一累计计时：慢帧下降、必要完成量一致、用户可见完成延迟合格、队列内存不持续增长。若没有额外收益，就保留各模块已有时间片，不增加通用调度器。

不默认纳入的范围：URP.Render提交、ECS三组的结算/同步、TServer.DecodeMessages消息顺序、GC回收与锁等待不默认纳入可延后队列。GridPreviewMgr、联盟奇观先按造例清单复现重负载，再决定改法。

完成条件：交付同帧成本证据、是否有必要统一的结论；若有必要，交付局部实现、正确性和同负载对照。若没有额外收益，明确说明保留原模块时间片，不为完成目标强行增加通用调度器。
```
