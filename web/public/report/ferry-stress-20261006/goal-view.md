# 资源田视图：拆清可见回调、树模型创建与等级显示，管理未完成批次

在新会话中复制下面的任务正文；如要使用goal功能，可由你在正文前加 /goal。

```text
请完成以下局部优化，并用源码、正确性验证及对照结果验收。

目标：资源田视图：拆清可见回调、树模型创建与等级显示，管理未完成批次

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
- 用例：recheck_A_move_r3；原采样：K:/AI/PerfAnalysisTool_Codebuddy/output/map_recheck_20261006_213000/captures/recheck_A_move_r3.pdata
  - marker：MapViewChecker Update !!!
  - 全程均0.452ms/帧；出现帧均2.532ms；67/375帧；全程67次调用
  - 单次max 4.433ms/F42；最大帧累计4.433ms（它可能来自另一帧，不能沿用单次峰值帧号）
- 用例：recheck_A_zoom_r1；原采样：K:/AI/PerfAnalysisTool_Codebuddy/output/map_recheck_20261006_213000/captures/recheck_A_zoom_r1.pdata
  - marker：ResLandViewPipeline.OnNewlyVisible
  - 全程均0.101ms/帧；出现帧均0.766ms；71/538帧；全程101次调用
  - 单次max 11.613ms/F439；最大帧累计11.613ms（它可能来自另一帧，不能沿用单次峰值帧号）

源码输入：
- G:/AOEYZ_Trunk/AOE3D/Assets/Scripts/.Lua/Outside/Map/Logic/ResLandViewPipeline.lua:173
  - 函数：OnNewlyVisible:173、同步批量调用:246、OnNewlyVisibleAsync:253（需验证实际调用方）
  - 本次核查SHA256：22edd0f736e7a3e335f123673ed84d586e06ee5f9e3d565a552124fa140dcba8
- G:/AOEYZ_Trunk/AOE3D/Assets/Scripts/CS/Outside/View/OutsideViewGridLine.cs:369
  - 函数：CreateResourceLandAndLevelBatch:369、InitForestTreeBatch、AddResLevelBatch
  - 本次核查SHA256：f2eb182f712043362f5d1680a12cf51c58fd8d3bf6ebd2a35682501f9ce3e6e0

实际入口：视野差集回调 → ResLandViewPipeline.OnNewlyVisible → CreateResourceLandAndLevelBatch → OutsideViewGridLine.CreateResourceLandAndLevelBatch → CreateView / CreateLevel

已有实现：OnNewlyVisible 在同一次回调中整理 buffer 并调用C#批量创建；C#循环准备树数据，再调用 InitForestTreeBatch 与 AddResLevelBatch。它并非自动受 LoaderManager 帧末时间片约束。

要核查并解决的步骤：批量创建包含整批工作；Lua提早写 localResourceView，addResourceBuffer 会复用。直接把这段延后执行可能覆盖未处理数据，或把尚未创建对象误当成已存在。

实施步骤：
1. 先分开记录视野差集、派发、EnsureServerEntity、Lua准备、CreateView、InitForestTreeBatch、CreateLevel；区分服务器实体创建和本地简化资源显示，不能只给外层视野回调设额度。
2. 按 gridIndex 与数据/视野版本消除重复创建请求，复用已有显示；保持隐藏→重新出现、资源归属变更与等级变化的正确性。
3. 确需分批时复制或转移 buffer 所有权，保存处理位置；把 pending 与 ready 分开记录。创建成功后才提交可用状态，切层/离开视野后取消或更新过期批次。
4. 沿C#树创建和等级显示拆可恢复阶段，查明批次大小与成本的关系；共享静态列表 s_TreeCreationBatch / s_ResLevelDataList 不能被悬挂批次跨调用占用。

验收与完成条件：
1. 覆盖快速移入移出、切层、同格数据换版本、创建中取消；最终资源模型、等级文字和数量正确，没有永久缺块、重复树或错误归属。
2. 固定轨迹比较差集格数、创建数、各阶段总CPU、出现帧均及峰值；分别说明查询减量和创建分批的收益。
3. 检查视野生效到模型/等级显示就绪的延迟，并验证队列清理和buffer生命周期；父视野与子创建耗时按包含关系核算。

跨模块关系：先把视野回调内的同步创建改到明确可暂停的阶段；只有异步加载完成的部分才归到LoaderManager，不能重复扣同一子调用的耗时。

范围：只修改该路径已确认的业务步骤和必要计时，保持接口兼容；先保留现有预算与超时机制。报告提供的是方向，读取当前实现后选择具体改法，不能机械照抄过期行号。交付每个方案实际改变的工作量与等待时间，不把尚未实测的改善写成收益。
```
