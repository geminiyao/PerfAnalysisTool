# 帝国1 vs 帝国2：内城全盛·精致 GPU对比

采集日期：2026-10-02。报告更新日期：2026-10-08。

网站“性能报告”页签：`/cpu/performance-reports`。
报告入口：`/cpu/report/city-gpu-compare-20261002/report.html`。

## 资源与统计

- `report.html`：离线可查看的交互报告，检索数据和样式已嵌入，无后端API依赖。
- `empire1/`、`empire2/`：捕获预览、实际Metal shader及编译/命令/资源证据。
- `summary_screenshots/`：两份Xcode Summary原图。
- `source_snapshots/`：当前工程源码及带行号的查看页面。
- 根目录CSV、JSON：面数、资源容量、shader配对等完整明细。
- `manifest.json`：发布文件大小和SHA256。
- `publication_validation.json`：发布资源关联验证；`http_validation.json`：本机HTTP子路径及性能报告页签验证。

GPU Time为11.94/17.15 ms，Summary Memory为257.66/343.38 MiB。红色重点突出片元shader总指令、ALU、FP32的静态复杂度增长；增长倍数不是耗时倍数。当前源码不保证与捕获构建同一提交。具体手机型号和游戏构建版本未在本报告证据中核定，目录卡片不补猜测值。

## 部署

完整发布本目录及上一级`catalog.json`，保留其它报告。所有链接采用相对路径，应保留目录结构。Vite public资源会原样复制到客户端构建目录，无需安装报告专用依赖或修改数据库。

远端操作说明见`DEPLOYMENT_PROMPT.md`。本次只准备资源并进行本机验证，没有部署远端服务器。

复建发布资源：在保有分析产物的工作区运行`python scripts/reports/publish_city_gpu_report.py`。服务器运行报告不需要原始gputrace、离线zip、分析/构建脚本。
