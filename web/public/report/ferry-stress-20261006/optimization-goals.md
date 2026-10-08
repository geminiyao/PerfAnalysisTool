# 抢渡口压测 · 按源码入口执行的优化任务

采样条件：抢渡口，24072PX77C，游戏版本0.0.999.1020，精致画质。报告部署地址：https://aoeyz-perf.devcloud.woa.com/cpu/report/ferry-stress-20261006/report.html 。本地报告目录：K:/AI/PerfAnalysisTool_Codebuddy/web/public/report/ferry-stress-20261006/。

证据状态：工作区源码核查与后续实施任务；未修改游戏、未新增采样、未验证优化收益。工作区源码与采样包逐行一致性尚未证实。

共同要求：
1. 先检查当前工作区改动、代码版本、手机包版本及相关开关；保留已有实现与他人改动。旧采样只能说明当时的成本，不能证明当前代码仍走同一路径。
2. 目标是减少必要工作之外的重复CPU，并降低集中执行造成的慢帧；不得通过丢任务、漏显示、无限延迟或改变结算结果取得好帧率。
3. 先读源码和已有pdata定位具体子项，形成局部改动，再完成有意义的正确性验证。只有确认需要实机验证时才执行该任务明确涉及的采集；相同画质、负载和轨迹分别比较基线与改后，至少3轮，未达到统计覆盖则说明局限。
4. 分别记录全程均、真实业务发生帧均、逐帧累计P95/max、调用次数、必要工作完成数及总CPU。父子耗时不能相加，最大单次与最大帧累计分别列出。
5. 为等待执行的工作记录提交时间、开始时间、实际完成时间，以及用户可见的对象何时完成显示。按业务定义允许延迟，再设验收值；报告原先的100/250ms没有体验或实测依据，不作为验收标准。
6. 完成条件：交付可审阅代码差异、正确性验证、对照证据和收益边界。不能实施或缺少包/负载时，给出具体阻塞条件与已完成结果，不宣称优化已完成。

## 独立模块任务

- [MapSignificanceMgr：先减少重复增删改，再拆预处理整批与单实体重操作](goal-prepare.md)
  - 入口：Core.Update → MapSignificanceMgr.OnUpdate → UpdatePrepareTask / ProcessSignificanceTasks → ConsumeTasks_MapEntity
  - 先完善本模块已有预处理＋消费计时。是否与切层/帧末共用全帧额度，留到各模块可暂停且同帧证据成立之后。

- [MapCoreMgr：核对延后扫描是否生效，优化实体ID准备与单实体切层处理](goal-layer-scan.md)
  - 入口：OnInfiniteLayerLevelChange → ScheduleInfiniteLayerEntityScan → MapCoreMgr.OnUpdate → ProcessInfiniteLayerEntityScanTask → ProcessInfiniteLayerEntity
  - 只考虑本函数中可暂停的候选扫描。同步状态变更与必须当帧完成的切层结果需要先明确业务约束。

- [资源田视图：拆清可见回调、树模型创建与等级显示，管理未完成批次](goal-view.md)
  - 入口：视野差集回调 → ResLandViewPipeline.OnNewlyVisible → CreateResourceLandAndLevelBatch → OutsideViewGridLine.CreateResourceLandAndLevelBatch → CreateView / CreateLevel
  - 先把视野回调内的同步创建改到明确可暂停的阶段；只有异步加载完成的部分才归到LoaderManager，不能重复扣同一子调用的耗时。

- [LoaderManager：定位具体资源与完成回调，完善已有帧末时间片](goal-frame-end.md)
  - 入口：LoaderManager.OnFrameEnd → TickLoadOnFrameEnd → loader.OnFrameEnd → GameObjectLoader.InstantiateAndFinish → InvokeOnGameObjectLoaderFinished及业务回调
  - 只接入可延后的加载完成集成/业务初始化阶段；先验证已有帧末时间片，避免新增另一套相互抢额度的循环。

- [名城图标：减少重复显示判定，保留未完成队列并验证差分收益](goal-bigcity.md)
  - 入口：InfiniteZoomMapGoEffectCtrl.OnOutsideCameraMove / 切层 → RefreshBigCityIcon → Legacy 或 ScheduleBigCityIconRefreshTasks → ProcessBigCityIconRefreshTasks
  - 仅在差分刷新已证实有效后，考虑它的可暂停队列；不把现有开关等同于完成优化。

## 最后才考虑的跨模块验证

[五条路径拆清后，再判断是否需要共用每帧剩余执行时间](goal-shared-budget.md)

这是条件成立后才考虑的配套改动，当前没有独立热点或收益实测。不同帧的模块峰值不能相加来证明需要统一调度。

URP.Render提交、ECS三组的结算/同步、TServer.DecodeMessages消息顺序、GC回收与锁等待不默认纳入可延后队列。GridPreviewMgr、联盟奇观先按造例清单复现重负载，再决定改法。

历史GridPreviewMgr、联盟奇观造例：另见 [followup-cases.md](followup-cases.md)，本次没有执行。
