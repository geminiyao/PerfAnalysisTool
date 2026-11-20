# 无极缩放层滑动 CPU 热点 · 初次采样

原报告位于 `artifacts/zoom_cpu_261119/无极缩放热点.html`。对应的证据包为 `无极缩放分析与证据.zip`。

网站入口为 `/cpu/report/zoom-slide-cpu-20261119/report.html`。本目录保留原 HTML 和证据包中的配套附件，文件大小与 SHA-256 见 `manifest.json`。

测试设备为 Xiaomi MIX Fold 4。CPU Timeline 收录三份采样的 165 个选定帧，可在报告内切换帧和线程、查看单次 marker 耗时并导出 PNG。

- [A · F375 · BatchViewMgr.OnUpdate](report.html#timeline-A-375) · [PNG](Timeline_A_F375_BatchViewMgr.png)
- [A · F391 · BatchViewMgr.OnUpdate](report.html#timeline-A-391) · [PNG](Timeline_A_F391_BatchViewMgr.png)
- [C · F513 · Hud_Top](report.html#timeline-C-513) · [PNG](Timeline_C_F513_Hud_Top.png)
- [TimeWheel 下 Hud_Top 的出现间隔与逐帧调用树](report.html#hudtick-308) · [F308 的 C#Invoke](report.html#hudtick-308?marker=C%23Invoke) · [间隔图 PNG](TimeWheel_Hud_Top出现间隔.png)
