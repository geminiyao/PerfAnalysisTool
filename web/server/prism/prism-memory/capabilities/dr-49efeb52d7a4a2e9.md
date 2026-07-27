---
id: dr-49efeb52d7a4a2e9
category: capabilities
createdAt: 2026-07-20T08:41:45.284Z
source: udiff_1782983710451_be175ef1
title: "Lua 端 marker（如 OnCameraMove、MapCameraCtrl、MapSignificanceMgr）的 Lua 函数体源码定位"
dataSource: "unity"
---

Want: Lua 端 marker（如 OnCameraMove、MapCameraCtrl、MapSignificanceMgr）的 Lua 函数体源码定位
Rationale: getSourceForSymbol 对 MapCameraCtrl 返回 not-found（symbol not in codegraph nor map-source），无法看 Lua 实现就给不了具体优化建议。OnCameraMove 在 frame 144 炸 53ms self，但不知道它内部在 Lua 端执行了什么逻辑导致这么慢。
Axis: code
ClosestTool: getSourceForSymbol（只能查 C# codegraph，Lua 端 marker 查不到）