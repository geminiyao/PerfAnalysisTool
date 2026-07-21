---
id: methodology-dr43-multi-state-method
category: methodology
createdAt: 2026-07-21T00:00:00.000Z
source: manual-sediment/dr-51-architecture-fix
title: "DR-43·多态判定（≥2 样本，foldChange + 绝对增量）"
dataSource: cross-source
---

多态报告（≥2 个样本，base/cur/throttle 对照）判定瓶颈用 foldChange + 绝对增量：(1) foldChange——cur 比 base 涨 X 倍（如 8.87 倍）；(2) 绝对增量——cur 比 base 涨了多少 ms（如 0.069→3.994ms）。两者结合判严重度：foldChange ≥2 且绝对增量显著 = critical/high。红线例外条件（DR-48）也适用。不许只看 foldChange 不看绝对增量——小基数放大倍数无意义。

❌ 反例：判定"foldChange=57.88 倍是 critical"——但 base 只有 0.069ms，绝对增量 3.9ms 不算 critical。
✅ 正例：判定"foldChange=57.88 倍 + 绝对增量 3.9ms + 占 p50 33.3% = critical"——三结合判严重度。
