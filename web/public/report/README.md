# 性能报告发布目录

每份报告放在独立的、带采集日期的目录中。该目录属于 Vite 的 public 资源，构建时原样复制到静态目录；当前应用的访问前缀是 `/cpu/`。

| 报告 | 目录 | 部署后的相对地址 |
| --- | --- | --- |
| 抢渡口压测性能采集报告 | `ferry-stress-20261006/` | `/cpu/report/ferry-stress-20261006/report.html` |
| 帝国1 vs 帝国2：内城全盛·精致 GPU对比 | `city-gpu-compare-20261002/` | `/cpu/report/city-gpu-compare-20261002/report.html` |
| 名城压测性能采集分析 · 2026-09-10 | `march-dual-hotspots-20260910/` | `/cpu/report/march-dual-hotspots-20260910/report.html` |

每份报告的 `README.md` 说明资源结构，`manifest.json` 记录文件大小与哈希，`validation.json` 记录已完成的验证。原始采集文件、系统 trace、符号文件和离线报告备份保留在采集工作目录，不属于发布资源。

网站左侧“性能报告”入口为 `/cpu/performance-reports`，从本目录的 `catalog.json` 读取报告卡片。新增报告时，将资源放入独立目录并更新目录清单即可；清单中使用 `/cpu/report/...` 静态地址，不需要数据库或新增后端接口。
