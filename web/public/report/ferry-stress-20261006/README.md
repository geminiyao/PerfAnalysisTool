# 抢渡口压测性能采集报告

- 测试机型：24072PX77C
- 游戏版本号：0.0.999.1020
- 画质：精致（本次正式复采，quality=3）
- 历史采样和开关对照按各自条件单列。
- 115份用例、42,978条候选、18条全程聚合范围沿用核验后的V9。

访问入口：`/cpu/report/ferry-stress-20261006/report.html`。

方案详情采用默认可见的卡片：成本指标、改法、验收和收益边界分区展示，详细判断与源码折叠保留，调用树返回第2章统一查看。GridPreviewMgr及奇观的历史重负载单列为“待造例复测”，包含4份后续测试设计与覆盖门槛；清单见 [followup-cases.md](followup-cases.md)。这些测试尚未执行，历史峰值不计入本次成本或优化收益。

2026-10-08补充了重要度预处理/消费、切层扫描、资源田创建、帧末资源集成、名城图标五条路径的源码核查。实施任务见 [optimization-goals.md](optimization-goals.md)：五份独立模块任务与一份有前置条件的跨模块验证任务，可以复制到其它会话。每份包含采样基线、完整源码路径、核查时文件SHA256、已有实现、具体步骤和完成条件。这些建议未实施；工作区源码与原采样包的一致性仍须核验。

“共享预算”不再作为已经证实的独立问题：MapSignificanceMgr已经合计预处理和消费时间，MapCore延后扫描在OnUpdate，资源田同步创建不自动受Loader时间片约束，Loader已有执行完成后的检查，名城差分已有队列。先修具体重步骤，再根据同帧证据决定是否统一计时；不采用未经业务确认的100/250ms延迟要求。

## 发布资源

入口HTML约13KB，默认用例及其全部图片的初始资源合计约343KB。全部用例和证据约46MB，具体大小与哈希见 `manifest.json`。这不是浏览器滚动耗时的实测结果。

- `report.html`、`styles.css`、`report.js`：页面和加载器。
- `index.json.gz`：用例目录和报告条件。
- `cases/`：每个用例的主要内容和预算。
- `evidence/`：折叠证据；展开时加载，不一次创建全部树节点。
- `candidates/`：完整候选，打开附录后支持搜索、排序和分页。
- `charts/`：切换曲线指标时加载的逐帧和旁路数据。
- `chapters/`：跨场景方案、历史覆盖及系统采样等章节。
- `images/`：去重后的原始插图，按需加载；未缩放或改写证据像素。
- `vendor/`：本地gzip解码兼容库及许可证，无CDN依赖。

`.gz`是应用显式请求、解码的静态文件。无需改服务器的动态压缩配置，但必须让这些路径返回文件，不能回退到应用首页。通过HTTP访问；双击本地HTML不能加载这些相对资源。

本地查看请双击同目录的 **start-preview.cmd**（需要Node.js；当前分析机已安装）。它会在后台启动仅监听本机的静态服务，并打开 `http://127.0.0.1:18106/report.html`。再次启动会复用这份报告的预览服务。服务器部署仍使用上面的 `/cpu/report/...` 地址，不需要运行本地预览脚本。

## 验证与复建

`validation.json`记录115用例HTML无损还原、逐帧/遥测数据一致性、候选计数、证据定位、静态HTTP子路径及两种gzip解码方式的检查。未进行远端部署或浏览器滚动性能实测。

生成和核验脚本：

```powershell
# 在保有原采样输出的分析机执行；服务器运行报告不需要这些原始输出。
node --max-old-space-size=8192 scripts/reports/build_ferry_report.cjs
node --max-old-space-size=8192 scripts/reports/verify_ferry_report.cjs
```

生成器保留V9用例与测量数据，方案卡片由 `ferry_plan_cards.cjs` 呈现，造例设计来自 `ferry_followup_cases.json`。复建时需已安装pako，或通过 `FERRY_PAKO_ROOT` 指向它的包目录。核验脚本需要Node.js 20及以上。无需连接手机。

模块实施建议来自 `ferry_optimization_tasks.json`，由 `ferry_optimization_tasks.cjs` 同时生成卡片源码核查内容和可下载任务，核验脚本检查任务基线与报告来源一致。服务器阅读这些任务不需要访问源码盘或采样盘。

部署操作提示词见 [DEPLOYMENT_PROMPT.md](DEPLOYMENT_PROMPT.md)。
