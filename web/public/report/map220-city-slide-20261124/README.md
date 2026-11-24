# 固定高度滑动 · 大地图 CPU 分析

高度 220 的四份录制与高度 110 的实体进出分别统计。两份 MeshUI 录制均出现尖刺，名城加载的持续压力最高。

2,930 个有效帧，2930 帧可打开原始 Timeline。

- [阅读报告](report.html)
- [实体创建与移除](report.html#entities)
- [资源加载来源](report.html#resources)
- [逐帧调用树](report.html#tree)
- [CPU Timeline](report.html#timeline)
- [CSV 与采样索引](evidence.zip)

网站按需读取同目录的 capture-*.js。各帧 Timeline 位于 timeline/。离线分享请解压 HTML 与配套文件。
