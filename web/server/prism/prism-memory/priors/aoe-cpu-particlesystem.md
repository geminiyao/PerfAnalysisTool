---
id: aoe-cpu-particlesystem
category: priors
createdAt: 2026-07-11T06:29:27.558Z
source: aoe-cpu
title: "ParticleSystem 时间片反映特效数量负载"
tags: ["粒子","特效","ParticleSystem"]
dataSource: unity
---

`PlayerLoop -> PreLateUpdate.ParticleSystemBeginUpdateAll` 和 `PlayerLoop -> PostLateUpdate.ParticleSystemEndUpdateAll` 消耗高，表明游戏内的粒子特效过多。