---
id: unity-cpu-aoe-architecture
category: priors
createdAt: 2026-07-11T06:26:04.348Z
source: unity-cpu
title: "AOE3D 项目架构概述"
tags: ["aoe","架构","xlua","画质档位"]
dataSource: unity
---

AOE3D 是一款 3D SLG 手游，使用 Unity 2019 + xLua 的双层架构：
- **C# 层**：引擎集成、渲染、DOTS/ECS 部队模拟、平台 API。
- **Lua 层**：所有游戏逻辑（Manager/UI/网络/配置），通过 xLua 桥接。
- **帧生命周期**：C# 每帧调用 Lua 的 `OnUpdateByCS -> OnLateUpdateByCS -> OnFrameEndByCS`。
- **画质档位**：5 档（省电/流畅/标准/高清/精致），默认第 2 档。
- **渲染分辨率**：移动端 900P，GM 包默认 2K（会导致 GPU Bound）。