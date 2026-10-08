# 远端更新部署提示词

请同步PerfAnalysisTool仓库的最新master，在现有`/cpu/`站点部署本次新增的名城压测报告，不改已有报告和分析服务配置。

1. 先确认远端工作区状态；有未提交改动时保留，不强制reset。正常同步仓库最新master。
2. 按现有流程构建和部署前端。报告来源为`web/public/report/march-dual-hotspots-20260910/`，构建后位于`web/dist/client/report/march-dual-hotspots-20260910/`。同时发布上一级`catalog.json`，保留抢渡口报告及内城GPU对比报告。
3. 报告目录必须完整复制，包含images、data、trees、scopes、source、source-deep、analysis、vendor及相关JS。`.json.gz`是已压缩文件：页面脚本或下载者负责解压，不要配置成仅返回解压后的JSON，也不要额外给它加`Content-Encoding: gzip`导致页面二次解压。
4. 验证`https://aoeyz-perf.devcloud.woa.com/cpu/performance-reports`出现“名城压测性能采集分析 · 2026-09-10”卡片；点击打开`/cpu/report/march-dual-hotspots-20260910/report.html`。
5. 验证静止、移动、缩放三个用例可切换；Marker搜索有数据；图表及现场截图可见；点击模块热点的完整调用树、源码证据链接，均能打开。JSON明细下载为gzip压缩数据；raw/pdata及采集目录是明确标注的采集机本地原件，不要求远端存在。
6. 若静态部署有缓存，刷新catalog.json、report.html和新增报告资源的缓存。汇报实际访问结果和失败链接。

本次无需同步output下原始采样目录，不部署单HTML试制版，不修改数据库。
