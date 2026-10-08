# 部署内城GPU对比报告

请沿用现有`/cpu/`网站的静态资源部署流程，发布以下内容：

1. `web/public/report/city-gpu-compare-20261002/`整个目录。
2. `web/public/report/catalog.json`，同时保留原有“抢渡口压测性能采集报告”条目。

先核实现有Fastify/Nginx对应的`/cpu/`静态根目录。若直接同步静态资源，将上述目录放到静态根目录下的`report/city-gpu-compare-20261002/`，将目录清单放到`report/catalog.json`。若使用Vite构建，public资源会原样进入`web/dist/client/report/`。

目标入口：

- `/cpu/performance-reports`：性能报告页签，显示原报告和新GPU对比报告，点击“打开报告”在新页访问。
- `/cpu/report/catalog.json`：返回JSON，不能被SPA首页回退替代。
- `/cpu/report/city-gpu-compare-20261002/report.html`：独立报告。

现有网页已经包含性能报告页签与目录加载器，新增条目只需要更新目录清单。若远端尚未发布该页签，应按既有流程更新前端客户端；无需为这份报告新增API或改数据库。

发布后按`manifest.json`检查资源大小及SHA256，并确认：

- 两张采集画面和两张Summary截图加载成功。
- “片元shader静态计算复杂度”显示2.13、2.32、2.98及1.65倍，并标注为静态复杂度。
- Draw、PSO及内存检索可切换；帝国2颜色目标筛选为401个draw。
- 点击shader及工程源码链接可查看行号；CSV链接返回实际明细文件。
- 原“抢渡口压测性能采集报告”仍可访问。

保留其它报告、配置、服务和未提交改动；不使用reset、清理或目录覆盖删除操作。不要上传原始gputrace、分析工作区、离线zip、符号文件或无关功能。最后汇报访问地址和验证结果。
