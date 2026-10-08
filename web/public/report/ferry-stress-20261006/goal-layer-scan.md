# MapCoreMgr：核对延后扫描是否生效，优化实体ID准备与单实体切层处理

在新会话中复制下面的任务正文；如要使用goal功能，可由你在正文前加 /goal。

```text
请完成以下局部优化，并用源码、正确性验证及对照结果验收。

目标：MapCoreMgr：核对延后扫描是否生效，优化实体ID准备与单实体切层处理

采样条件：抢渡口，24072PX77C，游戏版本0.0.999.1020，精致画质。报告部署地址：https://aoeyz-perf.devcloud.woa.com/cpu/report/ferry-stress-20261006/report.html 。本地报告目录：K:/AI/PerfAnalysisTool_Codebuddy/web/public/report/ferry-stress-20261006/。

证据状态：工作区源码核查与后续实施任务；未修改游戏、未新增采样、未验证优化收益。工作区源码与采样包逐行一致性尚未证实。

共同要求：
1. 先检查当前工作区改动、代码版本、手机包版本及相关开关；保留已有实现与他人改动。旧采样只能说明当时的成本，不能证明当前代码仍走同一路径。
2. 目标是减少必要工作之外的重复CPU，并降低集中执行造成的慢帧；不得通过丢任务、漏显示、无限延迟或改变结算结果取得好帧率。
3. 先读源码和已有pdata定位具体子项，形成局部改动，再完成有意义的正确性验证。只有确认需要实机验证时才执行该任务明确涉及的采集；相同画质、负载和轨迹分别比较基线与改后，至少3轮，未达到统计覆盖则说明局限。
4. 分别记录全程均、真实业务发生帧均、逐帧累计P95/max、调用次数、必要工作完成数及总CPU。父子耗时不能相加，最大单次与最大帧累计分别列出。
5. 为等待执行的工作记录提交时间、开始时间、实际完成时间，以及用户可见的对象何时完成显示。按业务定义允许延迟，再设验收值；报告原先的100/250ms没有体验或实测依据，不作为验收标准。
6. 完成条件：交付可审阅代码差异、正确性验证、对照证据和收益边界。不能实施或缺少包/负载时，给出具体阻塞条件与已完成结果，不宣称优化已完成。

已有采样基线（定位依据，不是当前代码的保证）：
- 用例：recheck_A_zoom_r1；原采样：K:/AI/PerfAnalysisTool_Codebuddy/output/map_recheck_20261006_213000/captures/recheck_A_zoom_r1.pdata
  - marker：MapCoreMgr.OnInfiniteLayerLevelChange_MapEntity
  - 全程均1.435ms/帧；出现帧均27.574ms；28/538帧；全程28次调用
  - 单次max 41.924ms/F364；最大帧累计41.924ms（它可能来自另一帧，不能沿用单次峰值帧号）

源码输入：
- G:/AOEYZ_Trunk/AOE3D/Assets/Scripts/.Lua/Outside/Map/Core/MapCoreMgr.lua:773
  - 函数：OnUpdate:199、ScheduleInfiniteLayerEntityScan:694、ProcessInfiniteLayerEntity:722、ProcessInfiniteLayerEntityScanTask:773、OnInfiniteLayerLevelChange:849
  - 本次核查SHA256：c812e98c1398c8052aeea30b0d8683fb1670dbcab2e9c049c225e4d2d639d878

实际入口：OnInfiniteLayerLevelChange → ScheduleInfiniteLayerEntityScan → MapCoreMgr.OnUpdate → ProcessInfiniteLayerEntityScanTask → ProcessInfiniteLayerEntity

已有实现：当前工作区已有每帧1.5ms/128个实体的延后扫描，在 OnUpdate 执行；已有游标、revision 与 rescanRequired，切层重入时保留已扫描前缀的进度。旧报告写 LateUpdate 不准确。

要核查并解决的步骤：生成 entityIds 时仍可能一次遍历全表；每个实体的显示判断、请求创建/移除和切层回调仍是一次完成。1.5ms是在两个实体之间检查，不是强制打断执行。

实施步骤：
1. 首先确认手机包走延后路径还是 OnInfiniteLayerLevelChange 的同步全表分支；验证开关和 isSyncMode。已有延后实现不要重复改造。
2. 把生成 entityIds 的准备时间与处理实体的时间分开统计，按层级/空间筛选必要实体。若准备阶段确实重，评估维护实体ID索引或分步生成稳定快照；不得遍历过程中修改同一表而漏扫/重复。
3. 分别定位 IsMapEntityInView、CheckViewLayer、CanShowMapEntityGo、创建/移除请求和实体切层回调；先减少重复查询，再处理确实超过时间片的单实体步骤。
4. 保留 revision 校验、删除处理和 rescanRequired 语义；持续切层时不能每次将扫描进度清零，造成表尾对象永远没有被检查。

验收与完成条件：
1. 相同12秒/腿缩放轨迹3轮，记录候选实体数、准备CPU、处理CPU、一次最长实体操作及每帧峰值。旧路径成本与新路径重新采样分别列示。
2. 覆盖快速切回、扫描中删除/新增、连续改变层级；最终可见实体、图标和必要移除结果一致，表尾实体确实被处理。
3. 以现有1.5ms/128项设置为起点测实际越界与显示完成延迟；缩小候选集合必须降低总CPU，分帧只报削峰收益。

跨模块关系：只考虑本函数中可暂停的候选扫描。同步状态变更与必须当帧完成的切层结果需要先明确业务约束。

范围：只修改该路径已确认的业务步骤和必要计时，保持接口兼容；先保留现有预算与超时机制。报告提供的是方向，读取当前实现后选择具体改法，不能机械照抄过期行号。交付每个方案实际改变的工作量与等待时间，不把尚未实测的改善写成收益。
```
