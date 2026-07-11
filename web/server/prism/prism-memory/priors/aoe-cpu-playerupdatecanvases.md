---
id: aoe-cpu-playerupdatecanvases
category: priors
createdAt: 2026-07-11T06:29:27.583Z
source: aoe-cpu
title: "PlayerUpdateCanvases 是 UGUI 消耗，不应过高"
tags: ["UGUI","PlayerUpdateCanvases","MeshUI"]
---

`PlayerLoop -> PostLateUpdate.PlayerUpdateCanvases` 是 UGUI 的消耗。目前游戏内压测场景或主要热点场景下消耗大的 UI（如头顶字、伤害跳字等悬浮 UI）已全部改为 MeshUI 方案，因此该消耗不应大。若每帧都出现 1ms 消耗则极不合理。