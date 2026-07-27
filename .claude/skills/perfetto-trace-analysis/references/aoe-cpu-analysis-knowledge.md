为了更好分析AOEYZ项目CPU性能，我做成一些相关说明：

1.MainThread中的PlayerLoop是游戏主循环，一些压测常出现的性能热点有网络消息收发、



2.网络消息收发调用栈：PlayerLoop -> Update.ScriptRunBehaviourUpdate -> BehaviourUpdate -> GameLauncher.Update -> Core.Update -> CS:AOE.TServerManager。这个栈下面会有TServer.RecvMessages, Tserver.DecodeMessages, TServer.HandleMessages。



3.我们游戏比较重度使用Lua脚本，所以Lua的一些主循环调用也特别值得关注。其中PlayerLoop -> Update.ScriptRunBehaviourUpdate -> BehaviourUpdate -> GameLauncher.Update() -> Core.Update -> CS:AOE.LuaMgr -> LuaMgr.OnTick&UpdateSchedule下各个Lua主要管理器的调用。在压测场景中可能出现的有MapSignificanceMgr(重要度管理器) 、BattleHeadMgr(头像管理器)。特别是重要度任务管理器，从网络消息接收到对应服务器数据后，会驱动这个管理器增删改游戏内实体对象(各种类型的MapEntity)，然后驱动后续各种资源数据的加载卸载。当前会预留给这个管理器最多3ms的每帧耗时，以防出现卡顿，但如果任务太多，会造成这个管理器一直处于3ms的顶格消耗，所以这个管理器的性能指标某种程度上反应了当前游戏的整体负载状况，这个管理器值得作为每次性能分析的重点考察对象。除此之外，LuaMgr下可能还会出现其它管理器或者主界面(Hud_Common)等的tick消耗，虽然耗时补偿，但每隔数帧如果有1~2ms的消耗也会显得不合理。



4.C#的负载消耗: PlayerLoop -> Update.ScriptRunBehaviourUpdate -> BehaviourUpdate -> GameLauncher.Update -> Core.Update -> CS:AOE.Outside.MapManager。其下有 CS:AOE.Battle.BattleUIManager, CS:AOE.Outside.OutSideViewArmyLineMgr等几个主要管理器，其中BattleUIManager往往会跟上述Lua中的、BattleHeadMgr热点呈现一致的状态。OutSideViewArmyLineMgr则主要是场景中行军线的刷新负载，在压测场景中往往也表现出高负载。



5.以上第3点和第4点中细说了主循环 Core.Update 中Lua和C#的主要负责，其实在 LateUpdate (PlayerLoop -> Update.ScriptRunBehaviourLateUpdate -> LateBehaviourUpdate -> GameLauncher.LateUpdate() -> Core.LateUpdate) 中也有对应的一组消耗 CS:AOE.LuaMgr、CS:AOE.Outside.MapManager，其中这里 LuaMgr 下经常会出现 MapCameraCtrl 的高负载，因为这里是滑动摄像机后视野更新的入口，所以经常在拖动视野、无极缩放等场景下出现高负载。 C#则主要是 CS:AOE.Outside.MapManager 下的各个自管理器，以及跟CS:AOE.Outside.MapManager平行的 CS:AOE.MeshUIManager，这个是MeshUI的C#管理器，往往在压测场景下，悬浮UI（使用MeshUI制作方案）等较多的情况下，这个管理器负载会上升。



6.PlayerLoop -> PreLateUpdate.LeagcyAnimationUpdate 反映的游戏内 GameObject身上动画数量的整体负载，也就是如果这个消耗高，表明当前的 animation 组件过多（变相说明带Animation组件的GameObject数量过多）。同理，PlayerLoop - > PreLateUpdate.ParticleSystemBeginUpdateAll 和 PlayerLoop -> PostLateUpdate.ParticleSystemEndUpdateAll 消耗高表明游戏内的例子特效过多。



7.PlayerLoop -> PostLateUpdate.PlayerUpdateCanvases 是UGUI的消耗，但目前游戏内压测场景或者主要热点场景下的消耗大的UI（比如头顶字、伤害跳字等悬浮UI）已经全部改为上面第5点介绍的MeshUI方案，这个消耗不应该大，如果每帧都出现1ms的消耗是极不合理的。



8.关于ECS，这是我们游戏处理大量部队士兵逻辑的重点模块，但我们之前已经做了很好的并行化处理，将所有的负载都放在了JobWorker上，主线程上的两个主力调用栈 PlayerLoop -> InitializationSystemGroup -> UpdateFunction.Invoke() -> Default World Unity.Entities.InitializationSystemGroup, PlayerLoop -> SimulationSystemGroup -> UpdateFunction.Invoke() -> Default World Unity.Entities.SimulationSystemGroup 和 PlayerLoop -> PresentationSystemGroup -> UpdateFunction.Invoke() -> Default World Unity.Entities.PresentationSystemGroup 只负责分发调度job，并不参与实际run job的工作。 所以变相的，如果这两个时间片消耗大于1ms，或者其下叶子节点有等待job完成的时间片（我记得是叫Complete.Job之类的名字，我现在有点不确定），则都不是合理状况。另外 K:\AOEYZ_Trunk\AOE3D\Assets\Editor\AoE\Tools\ECSDependencyVisualizer是之前写的检测ECS依赖关系的离线工具，你可以参考这个依赖工具了解这块机制，目的就是让job无阻塞的并发，不会在Main Thread以及Job Worker线程上出现job互相等的情况。



9.主线程渲染相关时间片， PlayerLoop -> PostLateUpdate.FinishFrameRendering -> RenderPipelineManager.DoRenderLoop_Internal() -> URP.Render -> URP.RenderCameraStack 这是我们游戏主线程跑URP渲染管线的负载，不负责真实的GPU渲染，但其中也有很多能反映出当前渲染压力的时间片，比如其下的 URP.RenderSingleCamera -> URP.AfterRendering -> URP.Submit -> URP.WaitForPresent -> Gfx.WaitForPresentOnGfxThread，如果这个时间片出现，说明当前游戏内的渲染负载很高，一直在等前一帧的GPU渲染工作完毕，才提交本帧的渲染任务。



10.资源加载，比如在上面提到的压测或者滑动视野场景中，游戏内实体对象发生大量增删的情况，伴随着经常会出现大量的资源加载，这块负载在主线程的时间片是在 PlayerLoop -> PostLateUpdate.PlayerSendFrameComplete -> PlayerEndOfFrame -> CoroutinesDelayedCalls -> GameLauncher.EndOfFrame() -> Core.PostEndOfFrame -> CS.AOE:ResManager -> LoaderManagerdOnFrameEnd 下。



11.Lua多线程GC，主线程时间片 PlayerLoop -> LuaMultiThreadGC -> UpdateFunction.Invoke -> LuaMtGc.WaitGCThread，对应的线程 Lua -> GC线程。 往往发生的次数不多，但如果一次消耗很高比如 3~10ms或以上，都表明当前lua的gc压力很大。

