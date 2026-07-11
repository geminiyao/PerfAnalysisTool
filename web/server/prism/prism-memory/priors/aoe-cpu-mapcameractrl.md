---
id: aoe-cpu-mapcameractrl
category: priors
createdAt: 2026-07-11T06:29:27.462Z
source: aoe-cpu
title: "LateUpdate 中 LuaMgr 下 MapCameraCtrl 的高负载来源"
tags: ["LateUpdate","MapCameraCtrl","视野","摄像机"]
---

LateUpdate 的 LuaMgr 下经常出现 MapCameraCtrl 的高负载，因为这里是滑动摄像机后视野更新的入口。常在拖动视野、无极缩放等场景下出现高负载。