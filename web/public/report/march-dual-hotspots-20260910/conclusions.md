# 模块总账 → 内部热点 → 优化方案

报告入口：report.html。此次修订保留原来的整帧互斥分布，原始 raw/pdata 和测量数值不变。

- 图1的重模块都有对应的问题条目，包含内部工作、源码依据、处理方式或观测缺口。
- Self 表折叠为原始证据附录，不再用它给问题排优先级。
- MapSignificanceMgr 的任务总表直接放在本模块问题条目中；0.806 + 0.353 ms 属于缩放 MapObjInit 的类型归属，合计 1.159 ms，不是另一份任务总表。
- 内部工作范围只列一张表，并列全帧、出现帧、单次均值，可切换排序；不再重复两遍相同调用栈。
- 参考 prism 的分叉点规则：至少三个直接子项，最大子项占父项不足 60%，保留分叉父项。原始路径保留在证据树。
- MapEntityAdd、MapObjCleanUp、MapObjInit 等出现帧重任务保留为明确业务任务，不因全帧均值较小而从问题列表消失。

## 三个用例的模块问题覆盖

### new_static · 整帧 33.469 ms

|模块|全帧平均 ms|对应处理|
|---|---:|---|
|`Other main-thread Self`|10.345|未完全归类：保留 100% 总账，不称为单个可优化模块|
|`URP.Render`|5.455|分摊型：保留 URP.Render 整体，阶段碎项不再占满问题列表|
|`WaitForTargetFPS`|5.444|预算/观测项，不列为业务优化收益|
|`ECS: Initialization + Simulation + Presentation`|4.140|分摊型：多个 ECS 系统共同组成持续成本|
|`BattleHeadMgr`|1.853|倒计时持续更新与头像创建事件分别处理|
|`MapSignificanceMgr`|1.646|创建 / 刷新 / 初始化 / 清理 / 预处理分别列出|
|`CS:AOE.MeshUIManager`|1.174|保留模块成本；未细分 Self 不伪装成已知子模块|
|`CS:AOE.Outside.OutSideViewArmyLineMgr`|0.911|常驻行军线更新与终点创建分开归属|
|`UGUI.Rendering.UpdateBatches`|0.693|持续 Canvas 批次重建，检查变脏来源|
|`Profiler / UP instrumentation`|0.658|预算/观测项，不列为业务优化收益|
|`PreLateUpdate.LegacyAnimationUpdate`|0.321|材质动画更新与首次绑定事件|
|`CS:AOE.TServerManager`|0.308|包解析与消息消费分开；检查单消息峰值|
|`GC.Collect + LuaMultiThreadGC`|0.136|低频长停顿；均值不代表事件影响|
|`TerrainVT.LateUpdate + WorldTileStreaming.LateUpdate`|0.125|视野更新、VT 与 tile 刷新共同组成成本|
|`LoaderManagerOnFrameEnd`|0.114|帧尾资源实例化 / 集成事件|
|`MapCameraCtrl.OnLateUpdate`|0.092|平移回调、名城图标刷新、切层分别处理|
|`Frame duration − PlayerLoop`|0.045|预算/观测项，不列为业务优化收益|
|`GridPreviewMgr`|0.011|预算/观测项，不列为业务优化收益|

### new_pan · 整帧 37.482 ms

|模块|全帧平均 ms|对应处理|
|---|---:|---|
|`Other main-thread Self`|11.114|未完全归类：保留 100% 总账，不称为单个可优化模块|
|`URP.Render`|7.450|分摊型：保留 URP.Render 整体，阶段碎项不再占满问题列表|
|`ECS: Initialization + Simulation + Presentation`|4.411|分摊型：多个 ECS 系统共同组成持续成本|
|`MapSignificanceMgr`|3.473|创建 / 刷新 / 初始化 / 清理 / 预处理分别列出|
|`BattleHeadMgr`|2.103|倒计时持续更新与头像创建事件分别处理|
|`MapCameraCtrl.OnLateUpdate`|1.454|平移回调、名城图标刷新、切层分别处理|
|`CS:AOE.MeshUIManager`|1.307|保留模块成本；未细分 Self 不伪装成已知子模块|
|`CS:AOE.Outside.OutSideViewArmyLineMgr`|1.052|常驻行军线更新与终点创建分开归属|
|`UGUI.Rendering.UpdateBatches`|0.949|持续 Canvas 批次重建，检查变脏来源|
|`TerrainVT.LateUpdate + WorldTileStreaming.LateUpdate`|0.884|视野更新、VT 与 tile 刷新共同组成成本|
|`WaitForTargetFPS`|0.694|预算/观测项，不列为业务优化收益|
|`CS:AOE.TServerManager`|0.651|包解析与消息消费分开；检查单消息峰值|
|`Profiler / UP instrumentation`|0.590|预算/观测项，不列为业务优化收益|
|`LoaderManagerOnFrameEnd`|0.576|帧尾资源实例化 / 集成事件|
|`PreLateUpdate.LegacyAnimationUpdate`|0.499|材质动画更新与首次绑定事件|
|`GC.Collect + LuaMultiThreadGC`|0.217|低频长停顿；均值不代表事件影响|
|`Frame duration − PlayerLoop`|0.043|预算/观测项，不列为业务优化收益|
|`GridPreviewMgr`|0.015|预算/观测项，不列为业务优化收益|

### new_zoom · 整帧 49.938 ms

|模块|全帧平均 ms|对应处理|
|---|---:|---|
|`Other main-thread Self`|12.039|未完全归类：保留 100% 总账，不称为单个可优化模块|
|`URP.Render`|6.963|分摊型：保留 URP.Render 整体，阶段碎项不再占满问题列表|
|`MapSignificanceMgr`|6.430|创建 / 刷新 / 初始化 / 清理 / 预处理分别列出|
|`MapCameraCtrl.OnLateUpdate`|5.045|平移回调、名城图标刷新、切层分别处理|
|`ECS: Initialization + Simulation + Presentation`|3.943|分摊型：多个 ECS 系统共同组成持续成本|
|`LoaderManagerOnFrameEnd`|2.841|帧尾资源实例化 / 集成事件|
|`CS:AOE.TServerManager`|2.777|包解析与消息消费分开；检查单消息峰值|
|`PreLateUpdate.LegacyAnimationUpdate`|2.597|材质动画更新与首次绑定事件|
|`TerrainVT.LateUpdate + WorldTileStreaming.LateUpdate`|2.374|视野更新、VT 与 tile 刷新共同组成成本|
|`CS:AOE.Outside.OutSideViewArmyLineMgr`|1.769|常驻行军线更新与终点创建分开归属|
|`UGUI.Rendering.UpdateBatches`|1.326|持续 Canvas 批次重建，检查变脏来源|
|`Profiler / UP instrumentation`|0.563|预算/观测项，不列为业务优化收益|
|`GC.Collect + LuaMultiThreadGC`|0.494|低频长停顿；均值不代表事件影响|
|`CS:AOE.MeshUIManager`|0.352|保留模块成本；未细分 Self 不伪装成已知子模块|
|`BattleHeadMgr`|0.280|倒计时持续更新与头像创建事件分别处理|
|`WaitForTargetFPS`|0.083|预算/观测项，不列为业务优化收益|
|`Frame duration − PlayerLoop`|0.049|预算/观测项，不列为业务优化收益|
|`GridPreviewMgr`|0.013|预算/观测项，不列为业务优化收益|

## 数值与验证边界

所有方案是待实施验证的改动，尚未修改游戏代码或复测优化收益。Other main-thread Self 保留原成本与未完全归类状态；MeshUI 内部计时不足的部分明确标注，不能当成已定位的可删工作。

分母与逐帧父子闭合见 scope-validation.json；本次模块覆盖、分叉判定及无父子重复计入检查见 module-validation.json。用例切换与链接以当前 browser-validation.json 为准。原始采样背景、帧曲线、业务/温控数据继续保留在 report.html。


## 展示修订：具体问题默认可见

模块仍对应整帧成本归属。每个模块内，问题描述、原始 Marker、全帧/出现帧均值、发生帧数、峰值帧、原始文件入口和改法直接展示，热点问题没有折叠。模块统计可按需展开。尚未定位具体可优化原因的模块明确标为“需进一步定位”。本次没有改变采样或计算结果。

## Other main-thread 明细与锁帧口径

显示名称统一为 Other main-thread。静止、移动、缩放分别为 10.345、11.114、12.039 ms/帧。按调用路径越过调度包装，以具体工作入口聚合剩余 Self；已归属整帧其他模块的节点排除，各入口逐节点互斥、完整覆盖。原始 Marker 成员与调用路径保存在单文件 HTML 内，不需要 Wiki 上传关联文件。

调度包装自身也单列，缩放为 2.040 ms/帧；其余主要入口包括 ParticleSystem.Update、TextureStreamingManager.Update、LUA:TimeWheelMgr.OnTick、CS:AOE.Outside.WorldEnvironmentMeshItemMgr 等。这里的聚合只解释 Other 的剩余部分，不是全线程同名 Marker 的 Total，也不是已验证可优化收益。

静止实测 33.469 ms/帧、29.88 FPS。模块对账基准是 PlayerLoop 33.425 ms，其中 WaitForTargetFPS 为 5.444 ms，扣除后 27.981 ms，理论换算 35.74 FPS。理论值不是实测帧率，仍包含其他等待与采样开销。录制帧时长与 PlayerLoop 的 0.045 ms 差值只作备注。图中 WaitForTargetFPS 使用橙色，柱条缩细；标题与操作选择统一为静止、移动、缩放。

验证：原有三份整帧分布与三份模块统计和上一版逐字节一致；Other 每个正 Self 节点沿完整祖先路径独立复核，归属无交叠、无缺失，误差仅浮点舍入。见 other-validation.json。

## PlayerLoop 对账基准

模块合计只与原始 PlayerLoop Marker 的时间核对。录制帧时长减 PlayerLoop 的差值不作为模块项，不改变各模块实际耗时。模块占比统一以 PlayerLoop 为分母；实测 FPS 仍按录制帧时长计算。

|用例|模块合计 = PlayerLoop ms/帧|录制帧时长 ms/帧|帧外差值 ms（不计模块）|
|---|---:|---:|---:|
|静止|33.425|33.469|0.045|
|移动|37.439|37.482|0.043|
|缩放|49.889|49.938|0.049|
