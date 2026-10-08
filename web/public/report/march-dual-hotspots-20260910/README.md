# 名城压测性能采集分析 · 2026-09-10

原报告：`output/march_dual_hotspots_20260910_215916/report.html`。
正式采集时间：2026-09-10 22:04:44–22:09:10，北京时间。
测试机型：24072PX77C。版本：Development Build 0.0.999.977。
原报告未明确记录画质，采集期间自动简化实际状态为1，不补猜测值。

入口：`/cpu/report/march-dual-hotspots-20260910/report.html`。
网站左侧“性能报告”入口：`/cpu/performance-reports`。

## 发布内容

- `report.html`：保留三个用例的测量、PlayerLoop完整分解和模块方案卡片。
- `images/`：从原报告提取的13张图表和现场截图，图像文件字节不变。
- `data/rankdata.json.gz`：全部13,031条Marker及原有完整字段，gzip无损压缩；页面加载后解压，不需后端API。
- `trees/`、`scopes/`、`source/`、`source-deep/`：原报告引用的完整调用树、分支下钻和源码快照。
- `analysis/`和根目录明细：原报告实际引用的CSV、Markdown、验证数据；JSON使用`.json.gz`下载，解压后与原文件字节一致。
- `manifest.json`、`publication_validation.json`：发布文件哈希、大小、关联资源和无损核对记录。

原始raw、pdata、离线ZIP、缓存及未被网页引用的分析中间文件不发布。网页中的原始采样和采集目录入口已标注为采集机本地原件，保留路径但不提供远端下载。历史采样条件、单轮限制和热机现场结论不改写。

## 部署与复建

部署整个目录及上一级`catalog.json`，保留已有报告。此目录属于Vite public资源，会原样复制到`web/dist/client/report/`。
须通过HTTP/HTTPS访问，不能只上传一个HTML或双击入口文件。

在保有原始分析报告的工作区可复建：

```powershell
python -X utf8 scripts/reports/publish_march_hotspots.py
```

远端运行网页不需要原始采集文件或Python脚本。本次只准备并验证发布资源，没有操作远端部署。
