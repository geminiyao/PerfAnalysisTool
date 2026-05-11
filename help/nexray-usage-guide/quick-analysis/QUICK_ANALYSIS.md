---
name: nxr-quick-analysis
description: "常见内存分析场景的快速执行模板。提供单文件分析、diff 对比、泄漏检测、游戏引擎专项、OOM 风险评估等场景的标准化流程，帮助 Agent 快速选择正确的工具组合和分析顺序。"
match: 快速分析,分析模板,分析流程,怎么分析,如何分析,分析步骤
---

# 快速分析模板

根据用户问题自动匹配最佳分析流程。每个模板定义了工具调用顺序、关注指标和报告结构。

---

## 场景路由

根据输入条件自动选择分析模板：

| 输入特征 | 匹配场景 | 推荐模式 |
|---------|---------|---------|
| 单个 memgraph，无特定问题 | 全量分析 | fast |
| 单个 memgraph + 泄漏相关关键词 | 泄漏专项 | deep |
| 两个 memgraph（-m + -b） | Diff 对比 | fast |
| 多个 memgraph（3+） | 趋势/泄漏检测 | deep |
| 包含 UE/Unreal 关键词 | UE 引擎专项 | deep |
| 包含 Unity/Mono/IL2CPP 关键词 | Unity 引擎专项 | deep |
| 包含 OOM/Jetsam/崩溃 关键词 | OOM 风险评估 | deep |
| 包含碎片/fragment 关键词 | 碎片化专项 | fast |
| 包含 Texture/GPU/图形 关键词 | GPU 内存专项 | deep |
| 仅问题无文件（questionOnly） | 知识问答 | fast |

---

## 模板 1：全量分析（默认）

适用：拿到一个 memgraph，全面了解内存状况。

### 工具调用顺序

1. `upload_memgraph` → 获取 trace_id, memgraph_id
2. `analyze_stackless_composition` → 内存构成概览
3. `analyze_vmmap` → VMMap 分区多维分析
4. `analyze_custom_partition` → 业务模块内存分布
5. `get_full_calltree` → TOP N 堆栈（Malloc + VMRegion 双维度）
6. `analyze_region_fragmentation` → 碎片化评估（如碎片化指标异常）

### 报告结构

- Executive Summary（一句话结论 + 3 个关键指标）
- 内存构成分析（有栈/无栈分类 + 占比）
- VMMap 分区 TOP 10（按 Dirty+Swap 排序）
- 自定义分区分布（业务模块占比）
- 堆栈 TOP 5（Malloc + VMRegion 各取 TOP 5）
- 风险评估（🔴/🟡/🟢 分级）
- 优化建议（精确到模块/函数，附预期收益）

---

## 模板 2：Diff 对比分析

适用：两个 memgraph 快照对比，定位增长来源。

### 工具调用顺序

1. 上传两个 memgraph → 获取各自 trace_id, memgraph_id
2. `compare_diff` mode=footprint → 总量变化
3. `compare_diff` mode=composition → 构成变化
4. `compare_diff` mode=vmmap → 分区级增量
5. `compare_diff` mode=partition → 业务模块增量
6. `analyze_diff_calltree_enhanced` → 堆栈级精确归因

### 关键判定原则

- 增量 < 5 MB 视为噪音，不标记异常
- 需同时满足增长率和绝对增量阈值
- Footprint 整体下降时，不因小分区微增判异常
- 增长标红：`**<font color="#ef4444">+XX MB</font>**`

---

## 模板 3：泄漏检测

适用：多个时间点的 memgraph，检测持续增长。

### 工具调用顺序

1. 上传所有 memgraph（按时间顺序）
2. `detect_memory_leak` → 复合泄漏检测
3. 对相邻采样点执行 `compare_diff` → 逐段增量趋势
4. 对 TOP 增长区域 `analyze_partition_stack` → 泄漏堆栈定位
5. `analyze_memory_trend` → 时间线趋势图

### 泄漏判定

| 严重程度 | 条件 |
|---------|------|
| 🔴 Critical | 增长率 > 10 MB/min，或 30 分钟增长 > 100 MB |
| 🟠 High | 增长率 > 2 MB/min，或 30 分钟增长 > 30 MB |
| 🟡 Medium | 增长率 > 0.5 MB/min，持续 10 分钟以上 |
| 🔵 Low | 可见增长趋势但速率较慢 |

连续 3+ 采样点单调递增即判定为泄漏嫌疑。

---

## 模板 4：OOM 风险评估

适用：评估应用距离被系统杀掉（Jetsam）的距离。

### 工具调用顺序

1. `upload_memgraph` + `get_test_basic_info` → 设备信息和内存上限
2. `get_footprint_info` → Footprint 时间线
3. `analyze_stackless_composition` → 识别可优化空间
4. `analyze_region_swapped` → 压缩率分析
5. `analyze_vmmap` → 分区分布，定位最大消费者

### 关键指标

| 指标 | 安全 | 警告 | 危险 |
|------|------|------|------|
| Footprint / Jetsam 限制 | < 60% | 60%-80% | > 80% |
| Swap / (Dirty+Swap) | < 20% | 20%-40% | > 40% |
| 最大单区域占总量比 | < 25% | 25%-40% | > 40% |

---

## 模板 5：UE 引擎专项

适用：Unreal Engine 游戏的内存分析。

### 重点关注

- UObject 层级内存分布
- Texture Pool / Streaming Pool 使用率
- Level 卸载后的残留内存
- Shader/Material 编译缓存
- Audio / Physics 子系统内存

### 推荐工具组合

1. `analyze_stackless_composition` → 引擎模块占比
2. `analyze_custom_partition` → UE 自定义分区
3. `search_and_analyze_calltree` → 搜索 UObject/FMalloc 等关键函数
4. `analyze_plugin_memory` → 插件/模块级汇总

---

## 模板 6：Unity 引擎专项

适用：Unity 游戏的内存分析。

### 重点关注

- Mono 堆 / IL2CPP 堆分布
- AssetBundle 加载与卸载残留
- Texture/Mesh/Animation 资源内存
- GC 堆碎片化程度
- Native 插件内存泄漏

### 推荐工具组合

1. `analyze_stackless_composition` → Mono/IL2CPP vs Native 占比
2. `analyze_custom_partition` → Unity 自定义分区
3. `search_and_analyze_calltree` → 搜索 il2cpp_gc/mono_gc 等关键函数
4. `analyze_region_fragmentation` → GC 堆碎片化评估

---

## 模板 7：碎片化专项

适用：怀疑内存碎片化导致虚拟地址耗尽或分配效率低。

### 工具调用顺序

1. `analyze_vmmap` → 分区 Empty/Virtual 比率
2. `analyze_region_fragmentation` → 高碎片区域定位
3. `get_full_calltree` → 高频小分配的堆栈

### 碎片化判定

| 指标 | 正常 | 警告 | 严重 |
|------|------|------|------|
| Empty / Virtual | < 15% | 15%-30% | > 30% |
| Region Count（同类型） | < 200 | 200-500 | > 500 |
| MALLOC_LARGE Empty | < 50 MB | 50-200 MB | > 200 MB |

---

## 使用提示

- 复杂问题建议用 `--analysis-mode deep` 获得更精准的分析
- 多文件分析建议用 `--verbose` 观察进度
- 分析完成后用 `/harness` 将成功的分析流程保存为可复用技能
- 上下文过长时用 `/compact` 压缩，避免 token 溢出
- CI 环境中用 `--format json` 获取结构化结果，便于程序解析
