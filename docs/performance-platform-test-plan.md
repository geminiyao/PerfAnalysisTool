# 性能分析管理平台测试文档

> 本文档定义性能分析管理平台的黑盒测试用例清单与验收标准。测试目标是保证每个关键节点都能自测、验证并交付。本文档不展开完整单元测试、接口自动化或 E2E 自动化体系。

## 1. 测试范围

覆盖阶段：

- P0：需求/测试文档确认。
- P1：整体架构与 Asset 抽象。
- P2：UX 整体重构。
- P3：simpleperf 采集分析与可视化。
- P4：Profiler + simpleperf 同步采集、关联与 AI 综合分析。
- P5：Perfetto 正式未来数据源接入。
- P6：Executor Registry 重构。

覆盖用户入口：

- Web 手工上传。
- Electron/脚本自动上传。
- 单源分析。
- A/B 对比。
- 多版本趋势。
- Run 多源关联。
- AI 综合分析。
- Asset 管理。
- Settings 配置。

## 2. 测试数据准备

### 2.1 Profiler 数据

准备：

- 至少 2 份可正常解析的 `.pdata` 文件。
- 至少 1 份异常或不支持格式文件，如 `.txt`，用于验证上传校验。
- 至少 2 份同项目不同版本/场景的 `.pdata`，用于历史筛选、对比、趋势。

### 2.2 simpleperf 数据

准备：

- 单次分析数据：`perf.data` + 对应 `binary_cache/`。
- A/B 对比数据：baseline `perf.data`、current `perf.data`、对应 `binary_cache/`。
- 多版本趋势数据：多个版本的 `perf.data` 集合。
- 异常数据：缺失 `binary_cache`、错误 `binary_cache`、损坏 `perf.data`。

### 2.3 native 符号校验数据

为验证 simpleperf 函数名、火焰图和源码定位可靠性，准备：

- APK 内发布版 stripped `.so`。
- 本地发布包 stripped `.so`。
- 对应 NoStrip/unstripped `.so`。
- Android NDK 路径或 `llvm-readelf` / `llvm-strip` 可执行文件。

校验依据：

- APK 内 `.so` 与本地 stripped `.so` 的 SHA256 一致。
- APK 内 `.so` 与 NoStrip `.so` 的 Build ID 一致。
- `strip(NoStrip SO)` 后与 APK 内 `.so` 字节一致或得到可接受警告。
- NoStrip `.so` 包含 `.symtab`。
- `.debug_info` / `.debug_line` 存在时可支持更完整源码行号映射。

### 2.4 Perfetto 数据

准备：

- 至少 1 份 `.pftrace` 或 `.perfetto-trace`。
- 至少 1 份示例 Perfetto 报告 Markdown/JSON。
- 至少 1 份错误格式文件。

### 2.5 Run 关联数据

准备三组数据：

1. 同一 `runId` 的 `.pdata` + `perf.data`。
2. 无 `runId` 但项目、版本、设备、场景、时间接近的数据。
3. 元数据相似但实际不同运行的数据，用于验证不会自动误关联。

## 3. P0 文档验收

### T0-1 需求文档完整性

操作：打开 `docs/performance-platform-requirements.md`。

预期：

- 包含平台目标、当前能力、待建设能力。
- 包含 UX、simpleperf、Asset/CDN、Run 关联、AI 综合分析、Perfetto。
- 明确区分“已有能力”和“待实现能力”。
- 明确分阶段交付路径。

验收：文档可作为后续实现计划输入，无明显遗漏。

### T0-2 测试文档完整性

操作：打开 `docs/performance-platform-test-plan.md`。

预期：

- 每个阶段都有测试用例和验收标准。
- 每个关键节点可独立自测。
- simpleperf 包含 native 符号校验项。

验收：团队可按文档执行手工验收。

## 4. P1 Asset 抽象测试

### T1-1 `.pdata` 上传创建 Asset

前置：Web 服务可用。

操作：通过 Web 上传合法 `.pdata`。

预期：

- 上传成功。
- 创建 profiler session。
- 创建 `pdata` 类型 Asset。
- session 与 Asset 建立关联。
- 文件落入本地存储目录。

验收：历史页能看到记录，Asset 信息包含文件名、大小、哈希、存储后端。

### T1-2 非法文件类型拒绝

操作：在 `.pdata` 上传入口上传 `.txt`。

预期：

- 上传失败。
- 显示明确错误。
- 不创建 session 和 Asset。

验收：数据库和历史页无脏数据。

### T1-3 Asset 去重与哈希

操作：重复上传同一文件。

预期：

- 系统能记录相同 SHA256。
- 根据产品策略选择复用 Asset 或提示重复。
- 不影响用户创建新的 session。

验收：Asset 哈希可追踪，session 关系正确。

### T1-4 存储后端占位

操作：查看 Settings 或配置。

预期：

- 当前显示 `local` 存储后端。
- CDN/对象存储配置有占位或规划入口。
- 不要求真实 CDN 可用。

验收：后续切换远端存储无需改业务流程。

## 5. P2 UX 重构测试

### T2-1 导航完整性

操作：打开 Web 平台，检查左侧导航。

预期：包含 Dashboard、Collect/Upload、Runs、Reports、Compare、Trends、Assets、Settings 等入口。

验收：主要功能入口清晰可达，无死链。

### T2-2 Dashboard 总览

操作：进入 Dashboard。

预期：展示：

- 最近 Run。
- 数据源状态。
- 分析队列。
- 高风险问题卡片。
- 快速上传/采集入口。

验收：用户无需进入细节页即可判断平台当前状态。

### T2-3 Collect/Upload 表单

操作：进入采集上传页。

预期：

- 可选择数据源类型。
- 可填写项目、版本、分支、buildId、设备、场景。
- 可填写或选择 `runId`。
- 可配置 `expectedSources`。
- 显示脚本/Electron 自动上传说明。

验收：手工上传和自动上传路径在同一页面被清晰表达。

### T2-4 Assets/History 手动关联入口

操作：进入历史/资产页，选择多个 session。

预期：出现“关联为同一次运行”操作。

验收：用户能理解并触发手动关联流程。

## 6. P3 simpleperf 测试

### T3-1 Web 手工上传 simpleperf 数据

操作：上传 `perf.data` + `binary_cache`，填写元数据。

预期：

- 上传成功。
- 创建 `simpleperf_session`。
- 创建 `perf_data` 和 `binary_cache` Asset。
- 状态为 `pending` 或 `queued`。

验收：历史页能按 simpleperf 数据源筛选到该记录。

### T3-2 Electron/脚本自动上传 simpleperf 数据

操作：使用脚本或 Electron 调用同一后端 API 上传 simpleperf 数据。

预期：

- 与 Web 手工上传生成相同结构的 session 和 Asset。
- 支持携带 `runId`。
- 返回 sessionId。

验收：两种上传路径共用同一套后端语义。

### T3-3 simpleperf 单次分析

操作：对已上传 simpleperf session 点击“开始分析”。

预期：

- 分析任务进入队列。
- 前端显示进度。
- 分析完成后生成 JSON/TXT/folded stack。
- 报告页展示 Top hotspots、线程分布、so 占比。

验收：用户能从页面判断 CPU 热点在哪里。

### T3-4 火焰图展示

操作：打开 simpleperf 单次报告的火焰图区域。

预期：

- 能看到当前 session 对应的火焰图 SVG/HTML 或等价展示。
- 火焰图与 Top 函数/线程一致。
- 若生成失败，页面显示明确原因和产物状态。

验收：单次采集具备可视化调用栈下钻能力。

### T3-5 A/B 对比分析

操作：选择 baseline 和 current 两个 simpleperf session，启动对比。

预期：

- 展示 Level 1 `.so` 占比变化。
- 展示 Level 2 anchor 子树变化。
- 展示 Level 3 函数 diff。
- `maybe_inlined` 被明确标识，不作为强结论。

验收：用户能判断 B 相比 A 是否改善，以及主要变化来自哪里。

### T3-6 多版本趋势

操作：选择多个版本 simpleperf session，生成趋势。

预期：

- 展示关键指标折线图。
- 展示均值/方差。
- 标记异常版本。

验收：用户能识别性能持续改善或劣化趋势。

### T3-7 缺失 binary_cache

操作：上传 `perf.data` 但不提供 `binary_cache`，启动分析。

预期：

- 系统允许进入受限分析或拒绝分析，具体按产品策略。
- 如果受限分析，报告明确标注“符号不完整”。
- 如果拒绝分析，提示需要上传符号文件。

验收：不会生成误导性函数级结论。

### T3-8 native 符号匹配校验

操作：使用 APK 内 `.so`、stripped `.so`、NoStrip `.so` 进行符号匹配校验。

预期：

- `PASS`：允许用于 simpleperf 符号解析。
- `PASS_WITH_WARNING`：允许继续但在报告中提示风险。
- `FAIL`：阻止或强提示不要用于函数级分析和火焰图结论。

验收：错误符号不会被静默用于生成错误函数名或错误火焰图。

## 7. P4 Run 关联与综合分析测试

### T4-1 协同采集 API

操作：调用创建 Run API，传入项目、版本、设备、场景、`expectedSources=['pdata','simpleperf']`。

预期：

- 返回 `runId`。
- Run 状态为 `collecting`。
- 后续上传 `.pdata` 与 simpleperf 数据时可携带该 `runId`。

验收：两个 session 均归属同一 Run。

### T4-2 expectedSources 状态更新

操作：只上传 `.pdata`，不上传 simpleperf。

预期：

- Run 显示 profiler 已完成，simpleperf 缺失或等待中。
- 状态为 `collecting` 或 `partial`。

验收：页面清晰显示缺失数据源。

### T4-3 事后建议关联

操作：上传无 `runId` 的 `.pdata` 和 simpleperf 数据，元数据高度一致。

预期：

- 系统提示可能属于同一次运行。
- 用户确认后绑定到同一 Run。
- 用户拒绝后保持独立。

验收：平台只建议，不自动误绑定。

### T4-4 手动关联

操作：在历史页选择一个 profiler session 和一个 simpleperf session，点击关联为同一 Run。

预期：

- 弹出确认信息。
- 成功后两个 session 共享同一 `runId`。
- Run 页面显示两个数据源。

验收：历史数据可被补救性关联。

### T4-5 综合分析输入摘要

操作：对已完成的 Run 点击“生成综合分析”。

预期：

- 系统读取 profiler 和 simpleperf 的结构化摘要。
- 不直接把原始大文件输入 AI。
- Prompt 包含 Run 元数据、Profiler 摘要、simpleperf 摘要、分析要求。

验收：综合分析输入可审计、可复现、成本可控。

### T4-6 综合报告输出

操作：等待综合分析完成。

预期：

- 生成 Markdown 报告。
- 生成结构化 insights JSON。
- 每个 insight 包含严重程度、来源、证据、结论、建议。
- 页面以跨源证据卡展示。

验收：用户能看到 profiler marker 与 native 热点如何互相印证。

### T4-7 部分数据源缺失

操作：只有 `.pdata` 已完成，simpleperf 缺失时触发综合分析。

预期：

- 系统提示数据源缺失。
- 用户确认后可生成“单源/部分源”综合报告。
- 报告明确说明缺失限制。

验收：不会伪造缺失数据源的结论。

## 8. P5 Perfetto 测试

### T5-1 Perfetto trace 上传

操作：上传 `.pftrace` 或 `.perfetto-trace`。

预期：

- 创建 `perfetto_trace` Asset。
- 创建 perfetto session。
- 元数据可填写并关联 `runId`。

验收：Perfetto 作为正式数据源出现在历史和 Run 页面。

### T5-2 Perfetto one-shot 分析

操作：启动 Perfetto 分析。

预期：

- 调用 `trace_processor` 或等价执行器。
- 生成 report JSON/Markdown。
- 页面展示 CPU 调度、频率、线程状态、帧相关指标。

验收：能从报告中判断系统级瓶颈。

### T5-3 Perfetto 缺少工具链

操作：在未配置 `trace_processor` 的环境中启动分析。

预期：

- 分析失败但错误清晰。
- Settings 提供配置入口。

验收：用户知道如何修复环境问题。

### T5-4 Perfetto 纳入综合分析

操作：对包含 profiler、simpleperf、perfetto 的 Run 生成综合分析。

预期：

- Prompt 包含 Perfetto 摘要。
- insights 中可出现 `perfettoEvidence`。
- 页面显示三源证据链。

验收：系统侧调度/频率问题能与 Unity/native 问题关联展示。

## 9. P6 Executor Registry 测试

### T6-1 profiler 执行器不回退

操作：对 `.pdata` 启动分析。

预期：与重构前功能一致。

验收：历史功能无回退。

### T6-2 simpleperf 执行器统一进度

操作：对 simpleperf session 启动分析。

预期：进度事件格式与 profiler 一致或可被统一前端消费。

验收：队列、取消、失败处理一致。

### T6-3 perfetto 执行器统一接入

操作：对 perfetto session 启动分析。

预期：通过 registry 找到 perfetto executor。

验收：新增数据源无需修改核心队列逻辑。

## 10. 回归测试清单

每次关键阶段交付前执行：

- `.pdata` 上传仍可用。
- `.pdata` 分析仍可用。
- 历史页仍能查询旧 session。
- 对比页仍能选择已有 profiler session。
- Settings 不破坏现有配置。
- 新增 Asset 后旧数据兼容。
- simpleperf 分析失败不会影响 profiler 队列。
- Run 关联失败不会破坏原 session。

## 11. 交付验收标准

### 阶段交付必须包含

- 功能说明。
- 测试数据路径或样例。
- 实际操作步骤。
- 测试结果截图或日志摘要。
- 已知限制。
- 下一阶段风险。

### 阶段通过标准

- 阶段内所有 P0/P1/P2/P3/P4/P5/P6 对应用例通过。
- 阻塞问题为 0。
- 非阻塞问题有明确记录和规避方式。
- 用户能按文档独立复现核心流程。
