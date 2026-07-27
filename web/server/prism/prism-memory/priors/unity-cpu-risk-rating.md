---
id: unity-cpu-risk-rating
category: priors
createdAt: 2026-07-11T06:26:05.071Z
source: unity-cpu
title: "性能风险评级标准"
tags: ["风险评级","critical","warning","info"]
dataSource: unity
---

| 级别 | 条件 | 说明 |
|------|------|------|
| Critical | 帧率 < 20 FPS 或 spike > 10x median | 立即需要修复 |
| Warning | 帧率 < 目标帧率 或 spike > 5x median | 建议优化 |
| Info | 有优化空间但不影响体验 | 可选优化 |