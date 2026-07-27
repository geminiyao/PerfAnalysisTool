---
id: aoe-cpu-meshuimanager
category: priors
createdAt: 2026-07-11T06:29:27.495Z
source: aoe-cpu
title: "LateUpdate 中 MeshUIManager 的负载与悬浮 UI 相关"
tags: ["LateUpdate","MeshUIManager","MeshUI","悬浮UI"]
dataSource: unity
---

在 LateUpdate 中，与 `CS:AOE.Outside.MapManager` 平行的还有 `CS:AOE.MeshUIManager`，这是 MeshUI 的 C# 管理器。压测场景下，当悬浮 UI（使用 MeshUI 方案制作）较多时，该管理器负载会上升。