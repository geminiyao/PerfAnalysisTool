# 无极缩放层滑动 CPU 热点 · 关闭 VT 和名城

原报告位于 `artifacts/zoom_off_261119/关闭VT和名城_无极缩放CPU报告.html`。对应的证据包为 `关闭VT和名城_报告与证据.zip`。

网站入口为 `/cpu/report/zoom-slide-vt-city-off-20261119/report.html`。网站版在采样概览中内嵌 F143 的 Profiler 原图。点图后默认显示全图，选择「查看原尺寸」可滚动检查调用树细节，「显示全图」可返回。图注链接到该帧调用树。HTML 可单文件离线打开。

`manifest.json` 中的 `sourceReportSha256` 对应原报告，`files` 记录网站版 HTML 和配套附件的实际大小与 SHA-256。

测试设备为 Xiaomi MIX Fold 4。CPU Timeline 收录两份采样的 45 个选定帧。以下两帧可对照查看 `RefreshBigCityIconLegacy` 下创建和刷新图标的调用。

- [采样 -2 · F116](report.html#timeline/2/116) · [PNG](Timeline_off2_F116_RefreshBigCityIconLegacy.png)
- [采样 -2 · F280](report.html#timeline/2/280) · [PNG](Timeline_off2_F280_RefreshBigCityIconLegacy.png)
