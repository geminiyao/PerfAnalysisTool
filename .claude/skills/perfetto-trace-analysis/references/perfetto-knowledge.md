# Android/Unity 系统级性能知识库

> 本知识库作为 System Prompt 注入 AI，帮助 AI 理解 Perfetto trace 数据并给出系统级性能分析。

---

## Part A: ARM CPU 架构与调度

### A1. 大小核架构 (big.LITTLE / DynamIQ)

| 架构 | 典型配置 | 说明 |
|------|---------|------|
| 4+4 | 4 大核 + 4 小核 | 骁龙 8 系列早期 |
| 1+3+4 | 1 超大核 + 3 大核 + 4 小核 | 骁龙 8 Gen1/Gen2 |
| 2+6 | 2 大核 + 6 小核 | 中端芯片（如天玑 700 系列） |
| 6+2 | 6 小核 + 2 大核 | 部分 vivo 定制（如 Y/S 系列） |

### A2. 调度关键指标

| 指标 | 含义 | 正常范围 | 异常 |
|------|------|---------|------|
| 大核占比 | 主线程在大核上运行的时间占比 | > 80% | < 50% 说明调度不合理 |
| 核心迁移 | 线程在不同核之间切换的次数 | < 每秒 5 次 | > 每秒 20 次说明频繁迁移 |
| Runnable 等待 | 线程就绪但等待 CPU 的时间 | < 1ms 均值 | > 3ms 说明 CPU 争抢严重 |
| 被抢占次数 | 线程被更高优先级任务打断 | 少量 | 频繁被 surfaceflinger 等打断 |

### A3. 调度策略

- **CFS (Completely Fair Scheduler)**: Linux 默认调度器，基于 vruntime 公平分配
- **EAS (Energy Aware Scheduling)**: Android 优化，考虑能效将任务分配到合适的核
- **cpuset**: Android 通过 cpuset 限制进程可用核心
- **SchedTune/UClamp**: 提升任务的调度权重，使其更容易被分配到大核

### A4. 游戏线程调度最佳实践

| 线程 | 建议核心 | 原因 |
|------|---------|------|
| Unity Main | 大核 | 游戏逻辑主循环，帧时间敏感 |
| Render Thread | 大核 | 渲染命令提交，与主线程串行 |
| Job Workers | 小核可接受 | 并行任务，延迟不敏感 |
| Audio | 小核 | 低负载，延迟通过 buffer 隐藏 |
| Network/IO | 小核 | 异步，不影响帧率 |

---

## Part B: CPU 频率与热降频

### B1. 频率管理

| 概念 | 说明 |
|------|------|
| DVFS | Dynamic Voltage and Frequency Scaling，动态调频 |
| Governor | 频率调节策略（schedutil/interactive/performance） |
| thermal_zone | 温度传感器区域 |
| 热降频 | 温度超过阈值时强制降低频率 |

### B2. 降频判定 — 确认级 vs 推测级

**核心原则**: 频率下降 ≠ 热降频。报告中必须区分证据等级。

#### 确认级（需要 sysfs 数据，由采集脚本 record_tmaoe_thermal.bat 提供）

| 方法 | 判定 | 来源 |
|------|------|------|
| `scaling_max_freq < cpuinfo_max_freq` | **确认降频** | Linux kernel cpufreq 子系统 |
| `cooling_device/cur_state > 0` | **确认 thermal governor 激活** | Linux kernel thermal framework |

没有 sysfs 数据时**不可**写"确认降频"。

#### 推测级（仅 Perfetto 频率数据，标注 [推测]）

| 方法 | 原理 | 热降频信号 | 正常 DVFS 信号 |
|------|------|-----------|---------------|
| 频率可达性 | 能否达到理论 max | P100 < 95% max → 被限制 | P100 ≈ max → 可达 |
| 负载-频率背离 | 负载高时频率应该升高 | 高负载(>70%) + 频率下降 | 低负载 + 频率下降 |
| 频率上限锁定 | 正常 DVFS 可恢复到 max | 后段 max < 前段 85% | max 始终可达 |
| 全核同步降频 | 热限制作用于整个 cluster | 所有大核降到同一低频 | 各核独立变化 |
| 持续低频占比 | 长时间被压频 | >30% 时间在 <80% max | 波动但能恢复 |
| Thermal Zone | 直接温度数据（如有） | 温度 > 42°C | 温度正常 |

**thermalScore 评分**（推测级置信度参考）:

| 分值 | 报告表述 |
|------|---------|
| 0-2 | "未检测到明显降频迹象" |
| 3-4 | "疑似存在热降频 [推测]，建议使用增强版采集脚本确认" |
| 5+ | "多项指标指向热降频 [推测]，强烈建议采集 sysfs 数据确认" |

详细科学参考: [thermal-throttling-reference.md](thermal-throttling-reference.md)

### B3. 常见频率问题

| 问题 | 现象 | 原因 |
|------|------|------|
| 持续降频 | 后半段帧率下降 | 设备过热，thermal 限制 |
| 频率波动 | 帧耗时不稳定 | Governor 响应延迟，任务抖动 |
| 小核锁频 | 小核频率不上升 | 能耗策略限制 |

---

## Part C: 多线程协作模型

### C1. Unity 线程模型

```
Frame N:
  MainThread:    [Update][LateUpdate][WaitForRender][ idle ]
  RenderThread:  [  wait  ][  Submit Commands  ][Present]
  GPU:           [     wait     ][  Execute  ][wait]
```

### C2. 关键等待关系

| 等待方 | 等待谁 | Perfetto 中的信号 |
|--------|--------|-----------------|
| Render 等 Main | 主线程还没提交渲染命令 | Render 线程 Semaphore.WaitForSignal |
| Main 等 Render | 上一帧渲染还没完成 | Main 线程 Gfx.WaitForPresent |
| Main 等 GPU | GPU 还没完成（triple-buffer 满） | Gfx.WaitForPresentOnGfxThread |
| Main 等 Job | ECS/Burst Job 未完成 | WaitForJobGroupID |

### C3. 并行效率指标

| 指标 | 计算方式 | 理想值 |
|------|---------|--------|
| Main-Render 重叠率 | 两线程同时 running 的时间 / 总帧时间 | > 50% |
| Render 空闲率 | Render 等待时间 / Render 总时间 | < 30% |
| 帧瓶颈判定 | max(Main耗时, Render耗时, GPU耗时) | 哪个最大就是瓶颈 |

---

## Part D: 系统干扰

### D1. 常见干扰源

| 进程 | 功能 | 典型影响 |
|------|------|---------|
| surfaceflinger | 合成显示帧 | 抢占大核 ~0.5-2ms/帧 |
| system_server | Android 系统服务 | Binder 调用延迟 |
| thermal-engine | 热管理 | 触发降频 |
| kworker | 内核工作线程 | IO 操作回调 |
| Binder:xxx | 进程间通信 | 跨进程调用延迟 |
| HwBinder | HAL 通信 | 硬件相关延迟 |
| IRQ/softirq | 中断处理 | 短暂抢占（通常 < 0.1ms） |

### D2. 干扰严重程度判断

| 级别 | 条件 | 说明 |
|------|------|------|
| 正常 | 系统进程总占用 < 帧预算 5% | 不影响帧率 |
| 轻微 | 系统进程在游戏帧内占用 1-3ms | 可能导致偶发 Jank |
| 严重 | 系统进程抢占游戏线程 > 5ms | 明确导致掉帧 |

---

## Part E: AOE 项目 Android 特有问题

### E1. 已知设备问题

| 设备 | 问题 | 表现 |
|------|------|------|
| 华为 MateXs2 | GPU 驱动 bug | Gfx.PresentFrame 莫名高耗时 |
| 骁龙 480 设备 | CPU 性能不足 | 全场景帧率偏低 |
| 部分 vivo 设备 | 激进节能策略 | 游戏线程被调度到小核 |

### E2. AOE 性能基线（Android）

| 场景 | 1档机 | 3档机 | 说明 |
|------|-------|-------|------|
| 城内 | 40 FPS (GPU) | 28 FPS (GPU) | GPU Bound |
| 战斗压测 300队 | 58 FPS | 30~40 FPS | CPU + 渲染 |
| 行军压测 300队 | 60 FPS | 35~45 FPS | MapSignificanceMgr |
| 无极缩放 | - | 30 FPS (GPU) | Gfx.PresentFrame |

### E3. Android 端特有优化方向

| 方向 | 措施 | 效果 |
|------|------|------|
| 线程亲和性 | 将主线程/渲染线程绑定大核 | 减少调度延迟 |
| 频率提升 | 通过 GameMode API 请求高性能模式 | 防止降频 |
| 分辨率 | 移动端 900P 替代 2K | GPU 负载降 60% |
| 简化模式 | 低端机自动开启（关阴影/描边/特效） | 帧率+10FPS |

---

## Part F: GPU 性能分析

### F1. Perfetto 中的 GPU 数据

| 数据源 | 表/Track | 含义 | 可用性 |
|--------|----------|------|--------|
| GPU 频率 | `gpu_counter_track` (name LIKE '%freq%') | GPU 当前运行频率 | 多数高通/Mali 设备有 |
| GPU 利用率 | `gpu_counter_track` (name LIKE '%utilization%' / '%busy%') | GPU 忙碌比例 (0-100%) | 部分设备有 |
| GPU slice | `gpu_track` / `gpu_slice` | GPU 命令执行耗时 | 较少设备提供 |
| GPU Memory | `gpu_mem_total` | GPU 显存使用 | 少数设备 |

### F2. GPU-bound 判定

| 信号 | 判断方法 | 置信度 |
|------|---------|--------|
| 高利用率 | GPU utilization avg > 80% | 高 |
| 主线程等 GPU | `Gfx.WaitForPresent` 出现在 top slices 且耗时显著 | 高 |
| GPU 满频 | GPU 频率持续在 max（>95% max） | 中 |
| Render 非瓶颈 | Render 线程 idle 少 + 无明显等待 + 主线程有等待 | 中 |
| 无 GPU 数据 | 排除法：CPU/调度/热 都不是主要瓶颈 | 低（标记[推断]） |

### F3. GPU vs CPU 瓶颈对比

| 特征 | CPU-bound | GPU-bound |
|------|-----------|-----------|
| 主线程 | 帧内计算时间长，无明显等待 | 大量等待 (`Gfx.WaitForPresent`) |
| Render 线程 | 等主线程 (`Semaphore.WaitForSignal`) | 快速提交命令，少等待 |
| GPU 利用率 | 低-中 (<60%) | 高 (>80%) |
| GPU 频率 | 未满频 | 持续满频或接近满频 |
| 降分辨率效果 | 无明显改善 | 帧率显著提升 |
| 降低画质效果 | 无明显改善 | 帧率提升 |

### F4. GPU 数据不可用时的处理

当 trace 中无 GPU 数据时：
1. 明确标注"本 trace 未采集 GPU 数据，无法直接判定 GPU 负载"
2. 可通过间接信号推断（标记[推断]）：
   - `Gfx.WaitForPresent` 耗时高 → 可能 GPU-bound
   - Render 线程无明显等待 + 主线程有 Present 等待 → 可能 GPU-bound
3. 建议用户下次采集时开启 GPU counter：`perfetto --gpu`

---

## Part G: 时间段分析与性能趋势

### G1. 常见性能趋势模式

| 模式 | 特征 | 根因 | 处置建议 |
|------|------|------|---------|
| 热降频 (Thermal Degradation) | 后段帧率 < 前段 85%，频率递减，throttle events 递增 | 设备过热，thermal 限制频率 | 降负载/散热优化/GameMode |
| Burst Spike | Jank 集中在某段（>60% 集中在单一段），前后正常 | 瞬时高负载（GC/加载/场景切换） | 分帧/异步处理/预加载 |
| 预热模式 (Warmup) | 前段帧耗时 > 中后段 15%+，之后趋于平稳 | JIT 编译/Cache cold/首次 Shader 编译 | AOT 编译/预热策略/Shader warmup |
| 持续慢帧 (Sustained Slow) | 全程帧率均低，连续 ≥5 帧超 1.5x 帧预算 | 稳态性能不足 | 美术降级/逻辑优化/降档策略 |
| 周期波动 | 帧率周期性起伏 | 定时任务（GC/同步/心跳） | 分散定时任务/增量 GC |

### G2. 分段对比解读规则

| 对比项 | 判读方法 |
|--------|---------|
| 前段 vs 后段帧率 | 差值 > 15% → 时间相关退化（thermal 或累积泄漏） |
| 前段 vs 后段频率 | 后段低 > 15% → 热降频 |
| 前段 vs 后段 Jank | 后段多 → thermal；前段多 → warmup |
| 某段 Jank > 其余之和 | 该段发生了特殊事件（需结合 top slices 定位） |
| 各段 avgFps 差异 < 5% | 性能稳定，问题是稳态性能不足而非退化 |

### G3. 模式组合解读

| 组合 | 含义 |
|------|------|
| thermalDegradation + sustainedSlow | 初始就不达标 + 后续更差 → 设备能力严重不足 |
| warmup + 后续稳定 | 短暂启动成本，正常运行无问题 |
| burstSpike + 其余正常 | 特定事件触发，需定位具体 slice |
| 无模式 + 帧率不达标 | 稳态 CPU-bound 或 GPU-bound，非时间相关 |
