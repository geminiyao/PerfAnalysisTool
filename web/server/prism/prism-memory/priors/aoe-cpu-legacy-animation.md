---
id: aoe-cpu-legacy-animation
category: priors
createdAt: 2026-07-11T06:29:27.525Z
source: aoe-cpu
title: "LeagcyAnimationUpdate 反映动画组件整体负载"
tags: ["动画","LeagcyAnimationUpdate","PreLateUpdate"]
dataSource: unity
---

`PlayerLoop -> PreLateUpdate.LeagcyAnimationUpdate` 反映游戏内 GameObject 上动画数量的整体负载。若该消耗高，表明当前 animation 组件过多，变相说明带 Animation 组件的 GameObject 数量过多。