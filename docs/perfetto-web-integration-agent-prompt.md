# 交付 Agent · Perfetto v5.2 Web 接入 M1 收尾

> 直接复制下面 `## Prompt` 整段粘贴给下一个 agent。
> 任务范围:Story 1 + 2 + 4(M1 里程碑收尾)。Story 3 已在前一轮手工完成实测通过,本任务不重做。

---

## Prompt

# 任务:perfetto v5.2 Web 接入 M1 收尾(Story 1 + 2 + 4)

## 背景

你正在接手 perfetto-trace-analysis skill 接入 web 平台的工程开发。**M1 里程碑前置工作(Story 3 报告生成)已在前一轮手工完成并实测通过**,本任务做剩余 Story 1 / 2 / 4,让用户能在 web UI 上传三份 perfetto 采集数据,自动产出 v5.2 三态对比报告。

项目根:`K:\AI\PerfAnalysisTool_Codebuddy`

## 前置工作摘要(已完成,不要重做)

1. perfetto Provider (`scripts/perfetto_provider.py`) 已支持 v5.2 富化 summary(threadsSchedList / aoeHotSlices.selfMs / throttling.thermal / binderPeers.byServerProcess / gcAllocByModule / offCpuAttribution)
2. perfetto sediment 已沉淀进 `.claude/skills/perfetto-trace-analysis/`,含 SKILL.md(M1-M4 方法论) + references/perfetto-report-template.md(v5.2 报告模板) + aoe-watch-spec.yaml(阈值表)
3. SKILL.md `Output Format` 段落已改为指引 CLI Read template 一次按其骨架产出
4. `web/server/services/run-analysis-service.ts` line 153-155 的 perfetto/simpleperf 早期 return 已移除,让其与 unity_profiler 一样走 executeCli
5. CLI 实测:手工跑 `codebuddy.cmd -p "<buildSkillPrompt 生成的 prompt>"`,7m41s 产出 v5.2 格式报告(10 章节齐 / 5 处 ASCII 资产齐 / 关键数字 100% 准确)。验证产物已清理

## 必读文档(按顺序)

1. `K:\AI\PerfAnalysisTool_Codebuddy\docs\perfetto-skill-web-integration-spec.md` — 完整工程交付包(注意:Story 3 已完成,不要再做;其他 Story 仍有效但工时需基于本任务重新估)
2. `K:\AI\PerfAnalysisTool_Codebuddy\.claude\skills\perfetto-trace-analysis\SKILL.md` — sediment 入口
3. `K:\AI\PerfAnalysisTool_Codebuddy\.claude\skills\perfetto-trace-analysis\references\perfetto-report-template.md` — 报告骨架(v5.2 标准)
4. `K:\AI\PerfAnalysisTool_Codebuddy\docs\report\performance-report_perfetto_ULTIMATE_v5.2.md` — v5.2 黄金样本(验收对照用)
5. `K:\AI\PerfAnalysisTool_Codebuddy\.claude\skills\perfetto-trace-analysis\references\collection-config-rationale.md` — 采集脚本设计 + 旁路文件契约(Story 2 必读)
6. `K:\AI\PerfAnalysisTool_Codebuddy\web\shared\perf-model.ts` — 当前 TS schema(Story 1 要扩展)
7. `K:\AI\PerfAnalysisTool_Codebuddy\web\server\services\run-ingest-service.ts` — 现有 ingest 入口(Story 2 要扩展)
8. `K:\AI\PerfAnalysisTool_Codebuddy\web\server\services\run-analysis-service.ts` — 已修过的 CLI 编排
9. `K:\AI\PerfAnalysisTool_Codebuddy\web\src\pages\Upload.tsx` / `RunComparePage.tsx` — 现有前端入口(Story 4 要参考)
10. `K:\AI\PerfAnalysisTool_Codebuddy\web\server\utils\config.ts` — config 读取 + Linux/Windows 路径自动 fallback(已就位,不要改)

## 调研先行(写代码前必做)

给我一份 < 500 字的调研报告,回答:

1. `web/shared/perf-model.ts` 现有 PerfettoDetail 接口缺哪些 v5.2 字段?给出"现状 vs 期望"的字段清单
2. `run-ingest-service.ts` 当前 perfetto ingest 入口接受什么形态?(单个 .pftrace 文件 / ZIP / 目录?)旁路文件(thermal_before/after.txt / collection-manifest.json / cpuinfo_max_freq.txt)现在会被忽略还是不传?看 `buildPerfettoProfile` 函数和 Provider 的 `_load_sysfs_sidecars` 函数怎么对接
3. `Upload.tsx` 现有上传 UI 长什么样?支持单文件、多文件、ZIP 包、目录拖拽中的哪些?
4. 现有 `RunComparePage.tsx` 的对比逻辑能不能直接复用做 perfetto 三态对比,还是需要新建 `PerfettoTriad.tsx`?
5. mock 模式下用户上传 perfetto 三份数据但 CodeBuddy CLI 不可用时,整条链路会怎么 fallback?是失败还是出占位 stub?

## 实施清单

### Story 1: Schema 扩展(P0,~2-3 小时)

修改 `web/shared/perf-model.ts` 给 PerfettoDetail 加 v5.2 新字段,全部用 optional `?:` 保证向后兼容老 trace 解析不崩。具体字段从 `K:\AI\PerfAnalysisTool_Codebuddy\output\p1-base24\perfetto-profile.json` 实测数据反推(这是 Provider 当前真实输出)。

验收:
- `cd web && npx tsc --noEmit -p tsconfig.server.json` 无 NEW 错误(baseUrl deprecation 是已有错误,可忽略)
- 旧 perfetto-profile.json(v5.2 之前 Provider 产出的)仍能被解析

### Story 2: Sample 目录上传 + 旁路文件传递(P0,~4-6 小时)

用户上传形态:sample_<stamp>/ 整个目录(含 .pftrace + collection-manifest.json + thermal_before.txt + thermal_after.txt + cpuinfo_max_freq.txt)。后端要把整个目录拷到 jobWorkDir,让 Provider 的 `_load_sysfs_sidecars` 能找到旁路文件(这函数读 trace 同目录的旁路文件)。

实施:
- 后端:`run-ingest-service.ts` 加 `ingestPerfettoSampleDir(dir)` 函数,识别目录下 `*.pftrace` 主文件 + 旁路文件,整体拷到 jobWorkDir 而不是只拷 .pftrace
- 前端 ZIP 上传支持(用户可以打成 ZIP 上传,后端解压;或浏览器 `webkitdirectory` 拖整个目录)
- 三态对比模式:让用户依次上传 base/cur/throttle 三份,后端 ingest 三个 runId,再调 `cross-source-report-builder.ts` 或新建 perfetto-triad-report-builder.ts 让 CLI 套模板生成对比报告(注意 buildSkillPrompt 现在只接受单输入,可能需要扩展支持多输入 sample)

验收:
- 上传单份 sample_base_20260624_104944/ 目录 → ingest 后 perfetto-profile-summary.json 含 throttling.thermal 字段(before/after/deltaC 三个值)
- 上传不含旁路文件的纯 .pftrace 也能 ingest(throttling.thermal=null,向后兼容)
- 上传三份 → 自动出三态对比报告(章节结构与 v5.2 黄金样本对齐)

### Story 4: 前端三态对比 UI(P1,~6-8 小时)

在 `web/src/pages/` 新建 `PerfettoTriad.tsx`(或扩展 `RunComparePage.tsx`):
- 三个上传区(base / cur / throttle 标签清晰)
- 提交后 polling 后端 ingest 进度(CLI 跑一次 ~5-8 分钟)
- 完成后 render 报告 markdown,**ASCII 缩进树必须用 monospace 字体**(react-markdown 的 `<pre><code>` 块默认就是,但要确认 §6.2 缩进树没被 wrap)
- 路由:`/perfetto-triad`,加到主导航

## 关键约束(MUST NOT VIOLATE)

1. ❌ **不要在 TS 里硬编码 v5.2 报告生成器** — 报告由 CodeBuddy CLI 套 `references/perfetto-report-template.md` 生成,不要在 TS 里重复实现章节字符串模板。这条已在 Story 3 跑通验证
2. ❌ **不要新建 `perfetto-v52-report-builder.ts`** — sediment 已经能让 CLI 直接出 v5.2 报告
3. ❌ **不要破坏单份上传向后兼容** — 现有用户上传单份 .pftrace 仍能跑通(走原 buildPerfettoProfile 路径)
4. ❌ **不要改 web/config.json** — 它的 Linux 路径在 Windows 上有 resolveSkillProjectPath fallback 自动处理
5. ❌ **不要改 SKILL.md / references/ 任何文件** — sediment 已经稳定,此次任务不沉淀新内容
6. ❌ **不要为 mock 模式额外做 v3 报告 fallback** — mock 现有占位 stub 行为足够,CodeBuddy CLI 不可用时用户应当切到 CLI 模式

## 实施节奏(只有一个验收断点 · 端到端)

> 调研报告 + Story 1/2/4 由你自主推进,中间技术细节(schema 字段/SQL/路由命名)自己定。**不需要中途暂停给我审**(我审不动技术细节,会浪费双方时间)。

唯一暂停点 = M1 完整验收:

1. 自主完成调研 + Story 1 + Story 2 + Story 4
2. 中途遇到**架构级**疑问(如:三态对比接口要不要走新路由还是复用 cross-source-builder?触发耗时 15min 的任务用 polling 还是 SSE?这种我能给方向的)→ 用一句话问我决策,不要纠结
3. 全部跑通后,把下面"验收脚本"的实测产物给我看(浏览器截图 + 报告 markdown 文件路径 + curl 输出)

如果中间 4 小时没新进度 / 卡住了 → 暂停告诉我哪里卡。不要默默憋大招。

## 验收脚本(唯一验收点)

```bash
cd K:\AI\PerfAnalysisTool_Codebuddy\web

# 1. TS 编译
npx tsc --noEmit -p tsconfig.server.json
# 期望:仅 baseUrl deprecation 已有错误,无新错误

# 2. 启动 web 服务
npm run dev

# 3. 上传单份 sample 验证(用浏览器或 curl)
# 期望:返回 runId,5-8 分钟后能拿到 v5.2 格式 markdown 报告

# 4. 上传三份 sample 验证(base/cur/throttle)
# 期望:返回 triadId,10-15 分钟后能拿到三态对比报告,与 v5.2 黄金样本结构对齐

# 5. 前端访问 /perfetto-triad
# 期望:UI 渲染正确,报告 markdown 中 §6.2 callTrees 缩进树用 monospace 字体显示
```

三态对比的"黄金样本"在 `docs/report/performance-report_perfetto_ULTIMATE_v5.2.md`,**完成后必须 diff** 章节结构 100% 对齐 + 关键数字误差 < 1% + 5 处 ASCII 资产齐。

## 工时预算

Story 1 + 2 + 4 ≈ **12-17 小时(2 工作日)**。如发现实际比这多,先暂停告诉我。

## 测试数据(可用)

以下三份富化 summary 已就位,Story 2 三态对比可直接拿来测:
- `K:\AI\PerfAnalysisTool_Codebuddy\output\p1-base24\perfetto-profile-summary.json`
- `K:\AI\PerfAnalysisTool_Codebuddy\output\p1-cur24\perfetto-profile-summary.json`
- `K:\AI\PerfAnalysisTool_Codebuddy\output\p1-throttle24\perfetto-profile-summary.json`

原始 sample 目录在:
- `G:\AOEYZ_Trunk\Tools\AndroidPerfettoScripts\sample_base_20260624_104944\`
- `G:\AOEYZ_Trunk\Tools\AndroidPerfettoScripts\sample_cur_20260624_105041\`
- `G:\AOEYZ_Trunk\Tools\AndroidPerfettoScripts\sample_throttle_20260624_105539\`

## 开始

先用 Glob/Grep/Read 调研 web/server/services/ 和 web/src/pages/ 现有结构,**给我调研报告再开始写代码**。
