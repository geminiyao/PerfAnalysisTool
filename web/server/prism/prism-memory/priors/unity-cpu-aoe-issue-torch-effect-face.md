---
id: unity-cpu-aoe-issue-torch-effect-face
category: priors
createdAt: 2026-07-11T06:26:04.620Z
source: unity-cpu
title: "AOE 已知问题：火把特效面数爆炸"
tags: ["aoe","已知问题","特效","面数","dots"]
---

**触发场景**：大规模战斗。
**现象**：特效 13w 面。
**根因**：每士兵一个火把（366 面）。
**状态**：上限控制（max=100）。