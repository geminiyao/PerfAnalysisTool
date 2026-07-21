---
id: constitution-dr50-no-must-mount
category: constitution
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-50·禁\"必须挂 callTree/asciiArt\"（挂载由结论本身决定，可选）"
dataSource: cross-source
---

prompt 不许写"critical/high 的 topConclusion 必须挂 callTree 或 asciiArt"。预先规定挂载是作文机病——LLM 被迫硬凑，即使结论不需要调用树也硬挂。挂载由结论本身决定：可以挂 callTree 或 asciiArt（有就挂，没有不硬挂）。LLM 看到反例（"必须挂"是违规）就能识别这种作文机病。

❌ 反例：prompt 写"critical/high 的 topConclusion 必须挂 callTree 或 asciiArt"——LLM 硬凑 callTree.note 占位。
✅ 正例：prompt 写"critical/high 的 topConclusion 可以挂 callTree 或 asciiArt（有就挂，没有不硬挂）"——LLM 按需挂载。
