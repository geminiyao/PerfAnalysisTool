---
id: aoe-cpu-network-callstack
category: priors
createdAt: 2026-07-11T06:29:27.252Z
source: aoe-cpu
title: "网络消息收发的调用栈及其子节点"
tags: ["网络","调用栈","TServerManager"]
---

网络消息收发调用栈：

`PlayerLoop -> Update.ScriptRunBehaviourUpdate -> BehaviourUpdate -> GameLauncher.Update -> Core.Update -> CS:AOE.TServerManager`

该栈下面会有：
- `TServer.RecvMessages`
- `TServer.DecodeMessages`
- `TServer.HandleMessages`