# 大地图重要度任务调度分析

[阅读报告](report.html) · [调度负载](report.html#task-rank) · [原始 marker 调用树](report.html#branches-MapObjInit) · [优化排期](report.html#schedule)

采样 A–H 来自 2026 年 11 月 24 日的 Xiaomi MIX Fold 4，测试版本 0.0.999.1153。专题于 11 月 25 日整理，覆盖固定高度滑图与来回缩放的 4,652 个有效帧。

网站入口为 `/cpu/performance-reports`。卡片从同级 `catalog.json` 读取。`report.html` 包含分析和命中帧索引，逐帧 Timeline 按需读取同级报告目录 `map220-city-slide-20261124`（A–E）和 `map-roundtrip-zoom-20261124`（F–H）。离线使用时将三个目录并列放置。

[专项证据](evidence.zip) 包含 7 张 CSV。[调度负载](scheduler-loads.csv) 可按录制与统计口径复查。源码位置列出相对于 AOE3D 工程的路径与行号。
