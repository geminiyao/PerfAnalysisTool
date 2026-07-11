---
id: aoe-cpu-resource-loading-callstack
category: priors
createdAt: 2026-07-11T06:29:27.738Z
source: aoe-cpu
title: "资源加载的主线程时间片调用栈"
tags: ["资源加载","调用栈","ResManager"]
---

压测或滑动视野场景中，游戏内实体对象大量增删时，常伴随大量资源加载。这块负载在主线程的时间片位于：

`PlayerLoop -> PostLateUpdate.PlayerSendFrameComplete -> PlayerEndOfFrame -> CoroutinesDelayedCalls -> GameLauncher.EndOfFrame() -> Core.PostEndOfFrame -> CS.AOE:ResManager -> LoaderManagerdOnFrameEnd`