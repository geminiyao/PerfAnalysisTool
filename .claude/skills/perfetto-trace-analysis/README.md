# Perfetto Trace Analysis Skill

## 概述

分析 Android Unity 游戏的 Perfetto `.pftrace` 文件，产出系统级性能分析报告（中文 Markdown）。

主要诊断能力：
- CPU 调度问题（大小核分配、核迁移、唤醒延迟）
- 热降频检测（频率变化、throttle events）
- 线程协作问题（Main/Render 并行度、Job Worker 利用率）
- 系统级干扰（surfaceflinger/Binder/thermal 抢占）
- GPU 负载评估（频率/利用率/GPU-bound 判定）
- 性能趋势分析（热降频趋势/burst spike/warmup/持续慢帧）

---

## 分析维度总览

| 维度 | 核心问题 | 数据来源 |
|------|---------|---------|
| A. 帧率与帧稳定性 | 帧率是否达标、帧时序波动模式 | PlayerLoop slice duration |
| B. CPU 大小核调度 | 主/渲染线程是否在大核？频繁迁移？ | sched_slice + cpu_id |
| C. CPU 频率与降频 | 是否存在热降频/限频？哪个核在降？ | cpufreq counter |
| D. 线程调度效率 | Runnable 等待、唤醒延迟、被抢占次数 | thread_state / sched_waking |
| E. 多线程协作 | Main-Render 重叠、Job Worker 利用率 | 线程 slice 时序对比 |
| F. 系统干扰 | 被系统进程抢占情况 | 全系统 sched 数据 |
| G. GPU 负载（如有） | GPU 频率/利用率、GPU-bound 判定 | gpu_counter_track |
| H. 时间段分析 | 性能趋势（热降频/burst/warmup） | 帧数据分段聚合 |

---

## 各维度判定标准

### A. 帧率与帧稳定性

| 指标 | 正常 | 异常 |
|------|------|------|
| 实际 FPS vs 目标 FPS | actual ≥ target | actual < target |
| Jank | 当前帧 / 前3帧均值 < 2x | ≥ 2x (Jank) / ≥ 3x (BigJank) |
| 帧时分布 | Q3-Q1 < 5ms | IQR 大 → 帧时不稳定 |

### B. CPU 大小核调度

| 指标 | 正常 | 异常 |
|------|------|------|
| 大核占比 | > 80% | < 50% 调度不合理 |
| 核迁移频率 | < 5 次/秒 | > 20 次/秒频繁迁移 |
| 关键线程固定 | Main/Render 稳定在大核 | 频繁在大小核间切换 |

### C. CPU 频率与降频

**核心问题**: `频率下降 ≠ 热降频`。正常的 DVFS 省电降频与 Thermal Throttling 强制降频需要区分，否则会误判。

#### 频率下降的原因分类

| 原因 | 说明 | 影响 |
|------|------|------|
| Governor 正常 DVFS | 负载低时主动降频省电 | 无影响（正常行为） |
| Thermal 热限制 | 温度超阈值后强制压频 | 帧率下降（需要关注） |
| Power Budget 限制 | 功耗墙（如 PD_THROTTLE） | 与 thermal 类似 |
| 厂商定制策略 | 如 vivo 省电模式/cpufreq policy | 可能误伤性能 |

#### 四种科学判定方法

##### 方法 1: 负载-频率背离检测 (权重 +3)

**原理**: 正常 DVFS 中，负载低→频率降是合理的；如果负载高（CPU 忙碌）但频率仍在降→说明被外力限制=热降频

```
正常 DVFS: 负载↓ → 频率↓ (合理，省电)
热降频:    负载↑ → 频率↓ (背离，被 thermal 限制)
```

**实现方式**:
- 在每个降频事件时刻 ±50ms 窗口内，检查该核心的 `sched_slice` 占用率
- 占用率 > 70% 且频率在下降 → 负载-频率背离 → 热降频证据
- 占用率 < 30% 且频率下降 → 负载确实低 → 正常 DVFS

**数据来源**: `sched_slice` (CPU 占用) + `cpufreq counter` (频率)

##### 方法 2: 频率上限锁定检测 (权重 +2)

**原理**: 正常 DVFS 下频率会随负载上下波动，能恢复到 max；热降频会把频率"天花板"压低，即使负载高也上不去

```
正常:  [1800]→[1200]→[1800]→[1500]→[1800]  (max 始终可达)
热限:  [1800]→[1800]→[1400]→[1400]→[1400]  (天花板被压到 1400)
```

**实现方式**:
- 将 trace 时间线分为 5 个等宽窗口
- 计算每个窗口内频率的最大值 (window_max)
- 如果后续窗口的 window_max < 首个窗口的 85% → 频率天花板在下降 → thermal cap

**判定标准**: 末窗口 maxFreq < 首窗口 maxFreq × 0.85

##### 方法 3: Thermal Zone 温度数据 (权重 +3)

**原理**: 最直接的证据——设备温度高就是热降频的原因

**实现方式**:
- 查询 Perfetto 中的 thermal_zone / temperature counter
- 温度值可能是毫度 (45000) 或度 (45)，需规范化
- 温度 > 42°C + 频率同步下降 → 确定热降频

**注意**: 并非所有 trace 都包含温度数据（取决于 trace config 是否开启 `linux.sys_stats`），不可用时需要跳过

**数据来源**: `counter_track` (name LIKE '%thermal%' OR '%temp%')

##### 方法 4: 全核同步降频检测 (权重 +2)

**原理**: 热降频通常作用于整个 cluster（所有大核同时被限到同一频率）；正常 DVFS 各核可独立调节

```
正常 DVFS: core6=1800MHz, core7=1200MHz (各核独立)
热降频:    core6=1400MHz, core7=1400MHz (统一被 cap)
```

**实现方式**:
- 在降频事件时刻，检查同一 cluster 所有大核的频率
- 如果所有核心频率差异 < 5% 且均低于 max 的 85% → cluster-level thermal cap
- 如果各核频率差异大 → 各核独立调节 → 正常 DVFS

**数据来源**: 所有大核的 `cpufreq counter` 同一时刻对比

#### thermalScore 综合评分

将四种方法的证据加权汇总为 `thermalScore`：

| 证据 | 加分 | 说明 |
|------|------|------|
| 负载-频率背离存在 | +3 | 最实用的间接证据 |
| 温度 > 42°C | +3 | 最权威的直接证据 |
| 频率上限锁定 | +2 | 时间维度的 thermal cap 证据 |
| 全核同步降频 | +2 | cluster 维度的 thermal 证据 |

**综合判定**:

| thermalScore | 判定 | 报告中表述 |
|:------------:|------|-----------|
| 0-2 | 不太可能热降频 | "频率变化属于正常 DVFS 节能调节" |
| 3-4 | 中等热影响 | "存在部分热降频证据，建议关注设备温度" |
| ≥ 5 | 确认热降频 | "确认热降频，多维度证据交叉验证" |

#### 输出数据结构

```json
{
  "cpuFrequency": {
    "bigCoreAvgMhz": 1785,
    "littleCoreAvgMhz": 1317,
    "throttleEvents": [...],
    "frequencyTimeline": [...],
    "throttleClassification": {
      "thermalThrottle": true,
      "normalDvfs": false,
      "thermalScore": 7,
      "evidence": [
        "负载-频率背离: 8次高负载(>85%)时降频",
        "频率上限锁定: 频率天花板从1804MHz降至1400MHz (降22.4%)",
        "温度数据: 最高47.2°C, 均值44.1°C"
      ],
      "loadFreqDivergence": [{...}],
      "ceilingLock": {"detected": true, "windows": [...]},
      "thermalZone": {"available": true, "maxTemp": 47.2, ...},
      "clusterSyncDrops": [{...}]
    }
  }
}
```

### D. 线程调度效率

| 指标 | 正常 | 中等 | 严重 |
|------|------|------|------|
| Runnable 等待 (avg) | < 1ms | 1-3ms | > 3ms |
| 唤醒延迟 (avg) | < 0.5ms | 0.5-2ms | > 2ms |
| 被抢占次数 | 少量 | — | 频繁（结合F分析） |

### E. 多线程协作

| 指标 | 理想 | 异常 |
|------|------|------|
| Main-Render 重叠率 | > 50% | < 20% 基本串行 |
| Render 空闲率 | < 30% | > 60% 严重等待 |
| Job Worker 利用率 | 10-60% | < 10% 未充分使用 / > 60% 可能饱和 |
| Worker 大核占比 | < 30%（不抢占关键线程） | > 60% 竞争大核资源 |

### F. 系统干扰

| 级别 | 条件 | 影响 |
|------|------|------|
| 正常 | 系统进程占帧预算 < 5% | 不影响帧率 |
| 轻微 | 系统进程抢占 1-3ms | 可能导致偶发 Jank |
| 严重 | 系统进程抢占 > 5ms | 明确导致掉帧 |

### G. GPU 负载

| 判定 | 条件 | 置信度 |
|------|------|--------|
| GPU-bound | GPU utilization > 80% + Gfx.WaitForPresent 显著 | 高 |
| GPU-bound | GPU 频率持续 ≥ 95% max + Render 无等待 | 中 |
| 可能 GPU-bound | 无 GPU 数据但 CPU/调度无问题 + WaitForPresent 高 | 低 [推断] |
| 非 GPU-bound | GPU utilization < 50% 或无 WaitForPresent | — |

**注意**: GPU 数据不一定存在于每个 trace 中。无数据时标注"未采集"，不可凭空分析。

### H. 时间段分析

| 模式 | 检测条件 | 建议 |
|------|---------|------|
| 热降频 | 后段 FPS < 前段 × 0.85 + 频率/throttle 恶化 | 降负载/散热/GameMode |
| Burst Spike | 某段 Jank > 其余段之和 × 60% | 分帧/异步/预加载 |
| 预热模式 | 前段帧耗时 > 中后段 × 1.15 | AOT/Shader warmup |
| 持续慢帧 | 连续 ≥ 5 帧 > 帧预算 × 1.5 | 美术降级/逻辑优化 |

---

## 文件结构

```
perfetto-trace-analysis/
├── README.md                      ← 本文件（skill 文档）
├── config.json                    ← 配置（进程名、线程名、阈值）
├── skill.md                       ← Claude 执行指令 + 报告模板
├── scripts/
│   └── preprocess.py              ← 数据预处理脚本（Python）
└── references/
    └── perfetto-knowledge.md      ← 分析知识库（ARM/调度/GPU/趋势）
```

---

## 数据管线

```
.pftrace 文件
    │
    ▼
preprocess.py (TraceProcessor SQL 查询)
    │
    ▼
preprocess-result.json (结构化数据)
    │
    ▼
Claude (skill.md + knowledge.md 指导分析)
    │
    ▼
perfetto-report_YYYYMMDDHHmmss.md (最终报告)
```

---

## 使用方式

```bash
# 用户提供 .pftrace 文件后，skill 自动执行：
python .claude/skills/perfetto-trace-analysis/scripts/preprocess.py \
  --input <file.pftrace> \
  --target-fps 30 \
  --output-dir ./output/perfetto
```

报告产出路径: `./output/perfetto/perfetto-report_YYYYMMDDHHmmss.md`

---

## 输出报告结构

| 章节 | 内容 |
|------|------|
| 一、概览 | 基础指标表格（时长/帧数/FPS/Jank/设备） |
| 二、核心结论 | 2-3句话总结瓶颈 |
| 三、CPU 调度分析 | 大小核/Runnable/唤醒延迟/抢占 |
| 四、CPU 频率分析 | 频率均值/降频检测/热压力 |
| 五、多线程协作分析 | Main-Render 并行/瓶颈判定/Job Worker |
| 六、系统干扰分析 | TOP5 干扰进程/严重度 |
| 七、GPU 负载分析 | 频率/利用率/GPU-bound 判定 |
| 八、时间段分析 | 前中后段对比/趋势模式 |
| 九、优化建议 | P0/P1/P2 分级建议 |
| 十、补充说明 | 数据局限性/下一步建议 |

---

## 配置说明 (config.json)

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `targetFps` | 目标帧率 | 30 |
| `gameProcess` | 游戏进程名 | "com.tencent.aoeyz" |
| `jank.jankMultiplier` | Jank 倍数阈值 | 2 |
| `jank.bigJankMultiplier` | BigJank 倍数阈值 | 3 |
| `mainThread.name` | 主线程名 | "UnityMain" |
| `renderThread.name` | 渲染线程名 | "UnityGfxRenderS" |
| `jobWorker.namePatterns` | Worker 线程名匹配模式 | ["Worker Thread", "Job.Worker"] |
| `gpu.utilizationHighThreshold` | GPU-bound 利用率阈值 | 80 |
| `timeSegment.segmentCount` | 时间分段数 | 3 |
| `timeSegment.thermalDegradationThreshold` | 热降频判定阈值(FPS比) | 0.85 |
| `timeSegment.sustainedSlowFrames` | 持续慢帧最少连续帧数 | 5 |
