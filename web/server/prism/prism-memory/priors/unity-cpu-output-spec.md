---
id: unity-cpu-output-spec
category: priors
createdAt: 2026-07-11T06:26:05.052Z
source: unity-cpu
title: "AI 性能分析输出要求"
tags: ["输出规范","分析","优化建议"]
---

1. **使用中文**回答。
2. 使用 **Markdown** 格式。
3. 聚焦**瓶颈定位**和**可操作的优化建议**。
4. 每条优化建议需要：精确到模块/函数级别；说明预期收益（减少 Xms / 降低 Y%）；标注优先级（Critical / Warning / Info）。
5. 对比 worst frame 和 median frame 时，明确指出差异原因。
6. 遇到 AOE 项目特有的 Marker 时，结合项目专属知识给出更具针对性的建议。