# 来回缩放 · 大地图 CPU 分析

同坐标两份录制分别捕获到阴影重载与 LOD 网格加载；另一坐标的 SDF 读字形数据反复出现。三份最慢帧的来源分别核对。

1,722 个有效帧，1722 帧可打开原始 Timeline。

- [阅读报告](report.html)
- [实体创建与移除](report.html#entities)
- [资源加载来源](report.html#resources)
- [逐帧调用树](report.html#tree)
- [CPU Timeline](report.html#timeline)
- [CSV 与采样索引](evidence.zip)

网站按需读取同目录的 capture-*.js。各帧 Timeline 位于 timeline/。离线分享请解压 HTML 与配套文件。
