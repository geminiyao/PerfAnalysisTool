---
id: unity-cpu-pattern-script-heavy
category: priors
createdAt: 2026-07-11T06:26:04.229Z
source: unity-cpu
title: "性能问题模式：Script Heavy"
tags: ["unity","script","性能模式"]
---

**关键指标**：`ScriptRunBehaviourUpdate` > 5ms。
**根因**：Update() 逻辑过重 / MonoBehaviour 过多。
**优化方向**：减少 Update 调用、用事件驱动替代轮询。