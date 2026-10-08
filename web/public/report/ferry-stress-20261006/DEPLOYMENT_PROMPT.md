请在远端部署“抢渡口压测性能采集报告”，仓库为 https://github.com/geminiyao/PerfAnalysisTool 。报告资源目录是 `web/public/report/ferry-stress-20261006/`，最终访问地址应为：

https://aoeyz-perf.devcloud.woa.com/cpu/report/ferry-stress-20261006/report.html

按以下步骤操作：

1. 找到该仓库的现有部署目录和服务配置，确认当前 `/cpu/` 的静态文件根目录。现有Fastify配置从clientDist提供 `/cpu/` 静态资源；检查实际构建产物及Nginx映射，避免凭空猜路径。
2. 拉取 `origin/master` 最新提交。如果部署工作区有本地修改，保留这些修改；不要执行reset或清理命令。必要时在临时目录提取远端提交中的 `web/public/report/ferry-stress-20261006/`，只发布这一份报告。
3. 把报告目录完整复制到现有静态根目录的 `report/ferry-stress-20261006/`。保留其它报告、应用配置和已有业务文件。优先直接发布静态资源；如果使用现有Vite构建流程，public中的报告目录也会原样复制。该报告不依赖应用API，通常无需重启服务。
4. 根据 `manifest.json` 核验所有资源的大小与SHA256。检查入口、JS、CSS、`index.json.gz`、默认用例、证据和图片均返回HTTP 200；`.gz`请求必须返回对应文件，不能被SPA回退规则替换成首页。加载器兼容原始gzip字节及HTTP自动解压后的文本，不需要另加接口。
5. 打开最终URL，确认标题、机型24072PX77C、游戏版本0.0.999.1020和精致画质。切换A/B岸用例，展开一条调用树，点击方案卡片返回证据，切换曲线指标，并检查候选搜索/排序/分页。第3章应显示14张方案卡片，末尾的GridPreviewMgr及奇观2张卡明确为待造例复测；第4章相关覆盖行可跳转造例建议。确认浏览器没有资源404或gzip解码错误。
6. 汇报最终地址、部署提交、静态根目录、资源核验和页面检查结果；未执行的检查明确注明。

本次第3章新增五条具体路径的源码核查及优化任务下载。确认 `optimization-goals.md` 和六份 `goal-*.md` 均返回文件；“先完善五条路径，再验证是否需要共用每帧剩余时间”卡片应按模块列出已有控制和具体缺口。相关任务仅为后续实施输入，部署时不要执行任务或改变游戏源码。

本次还需要网站左侧的“性能报告”入口，因此一并发布这次提交中的前端导航和报告目录页面：按现有部署流程单独构建前端（例如在web目录执行 `npm exec vite build`），保留既有后端服务；将新的客户端构建产物发布到 `/cpu/` 静态根目录，同时保留其它报告目录。确认 `https://aoeyz-perf.devcloud.woa.com/cpu/performance-reports` 可以列出本报告，并在新页打开报告；`/cpu/report/catalog.json` 必须返回JSON文件，不能回退为SPA首页。仅复制本报告目录不会更新网站菜单。

报告发布只需专属报告目录和 `web/public/report/catalog.json`；导航入口需要上述前端更新。原采集工作目录、raw/pdata、系统trace、符号文件和旧离线报告均不需要上传。不要修改报告中的测量数据、重采手机数据或顺带发布其它功能。
