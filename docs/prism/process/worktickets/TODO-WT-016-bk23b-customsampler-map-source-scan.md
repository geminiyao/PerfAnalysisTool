# 工单 WT-016 · BK-23b 自动扫描 CustomSampler/Create 串扩展 map-source

> 状态：TODO（待施工）｜里程碑：源码归因自动化｜执行方：Cursor/agent
> 依据：WT-012 用手工/半自动 alias table 覆盖热点 20 条；下一步可自动扫描采样字符串，降低 alias 表维护成本。

## 背景

许多 profiler marker 来源于源码里的 `CustomSampler.Create("...")`、`ProfilerMarker("...")`、`BeginSample("...")` 等字符串。WT-012 先用 alias table 救热点，但长期不能靠人工维护所有 marker。

## 目标

扩展 map-source 构建逻辑，自动扫描 Lua/C# 源码中的采样字符串，生成 marker → file/line/range 的候选索引。

## 参考文件

- `docs/prism/process/worktickets/DONE-WT-012-bk23a-marker-alias-table-mvp.md`
- `.claude/skills/unity-profiler-analysis/marker-source-map.json`
- `web/server/prism/tools.ts`
- 现有 map-source 生成脚本/逻辑（施工方自行定位）
- 外部源码目录：`G:/AOEYZ_Trunk/AOE3D/Assets/Scripts/`

## 要求

1. 扫描至少以下形式：
   - `CustomSampler.Create("...")`
   - `ProfilerMarker("...")`
   - `BeginSample("...")`
   - 项目内 Lua/C# profiler wrapper 的等价写法
2. 输出 marker-source-map 扩展条目，至少包含 marker/file/line/context/confidence。
3. 对自动扫描命中统一标 `map-source-interval` 或等价中置信，不冒充函数体。
4. 验证 WT-012 中至少 3 个原 alias marker 可由自动扫描找到采样字符串。
5. 不能覆盖人工 alias 的高置信判断；自动扫描作为候选或补充。

## 验收标准

1. 生成/更新 map-source 索引的命令可复现。
2. 至少 3 个此前缺 map-source 键的 marker 被自动扫描覆盖。
3. `getSourceForSymbol` 可使用这些自动条目或在完工报告说明如何接入。
4. 测试或样例输出通过。

## 完工报告（施工方填）

待填写。

## 验收结论（主 agent 填）

待验收。
