# Android CPU 降频判定 — 科学参考资料

> 本文档记录用于判定 Android 设备 CPU 是否降频（thermal throttling）的科学方法、权威来源和技术原理。

---

## 一、降频判定分层体系

| 层级 | 方法 | 科学来源 | 可信度 |
|------|------|---------|:------:|
| **确认** | `scaling_max_freq < cpuinfo_max_freq` | Linux kernel cpufreq 子系统 | ⭐⭐⭐ |
| **确认** | `cooling_device/cur_state > 0` | Linux kernel thermal framework | ⭐⭐⭐ |
| **确认** | `AThermal_getCurrentThermalStatus() >= MODERATE` | Android ADPF (Google 官方) | ⭐⭐⭐ |
| **推测** | 频率突降且持续不回升 (sustained) | Perfetto 官方分析指南 | ⭐⭐ |
| **推测** | 高负载时频率下降 (load-freq divergence) | Perfetto 社区 / ARM IPA 原理 | ⭐⭐ |
| **推测** | 全核同步降到同一频率 | ARM cluster 共享频率域原理 | ⭐⭐ |
| **推测** | 频率可达性 < 95% max | 逻辑推导（无直接文献） | ⭐ |

---

## 二、确认级方法 — Linux 内核 Thermal Framework

### 2.1 架构概述

Linux 内核的标准热管理架构，所有 Android 设备都遵循：

```
温度传感器 (thermal_zone)
    → thermal_governor (IPA / step_wise) 决策
        → cooling_device (cpufreq_cooling) 执行限频
            → 修改 scaling_max_freq
                → CPU 硬件降频
```

来源: https://git.nju.edu.cn/nju/linux/-/blob/e5ce576d45bf72fd0e3dc37eff897bfcc488f6a9/drivers/thermal/cpufreq_cooling.c

核心逻辑：cooling_device state 越高 → 频率被压得越低。state=0 表示不限频。

### 2.2 关键 sysfs 节点

| 节点路径 | 含义 | 判定方法 |
|---------|------|---------|
| `/sys/devices/system/cpu/cpu*/cpufreq/cpuinfo_max_freq` | CPU 硬件理论最大频率 | 基准值（不变） |
| `/sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq` | 当前系统允许的最大频率 | **< cpuinfo_max_freq → 正在限频** |
| `/sys/devices/system/cpu/cpu*/cpufreq/scaling_cur_freq` | CPU 当前实际运行频率 | 实时值 |
| `/sys/class/thermal/thermal_zone*/temp` | 温度传感器读数（毫度） | > 42000 → 设备较热 |
| `/sys/class/thermal/thermal_zone*/trip_point_*_temp` | 降频触发温度阈值 | 超过此值系统会降频 |
| `/sys/class/thermal/cooling_device*/cur_state` | cooling device 当前状态 | **> 0 → thermal governor 已激活限频** |
| `/sys/class/thermal/cooling_device*/type` | cooling device 类型 | "thermal-cpufreq-*" 表示 CPU 限频 |
| `/sys/class/thermal/cooling_device*/max_state` | 最大限频等级 | state 越高，限频越严重 |

### 2.3 判定逻辑

```
if scaling_max_freq == cpuinfo_max_freq:
    # 系统未限制 CPU 频率 → 未降频
elif scaling_max_freq < cpuinfo_max_freq:
    # 系统主动压低了 CPU 频率上限 → 确认降频
    # 降频幅度 = (cpuinfo_max_freq - scaling_max_freq) / cpuinfo_max_freq

if cooling_device_cur_state > 0:
    # thermal governor 已经激活
    # state 值越大，限频越严重
    # 降频等级 = cur_state / max_state
```

### 2.4 普通 adb (非 root) 权限情况

| 节点 | 非 root 可读 | 说明 |
|------|:----------:|------|
| `cpuinfo_max_freq` | ✅ | 所有设备 |
| `scaling_max_freq` | ✅ | 所有设备 |
| `scaling_cur_freq` | ✅ | 所有设备 |
| `thermal_zone/temp` | ✅ | 大部分设备 |
| `cooling_device/cur_state` | ⚠️ | 部分厂商限制（华为/vivo） |
| `cooling_device/type` | ⚠️ | 同上 |

### 2.5 源码参考

- **Linux kernel cpufreq_cooling.c**: [kernel source](https://git.nju.edu.cn/nju/linux/-/blob/e5ce576d45bf72fd0e3dc37eff897bfcc488f6a9/drivers/thermal/cpufreq_cooling.c)
  - 当 thermal governor 决定降频时，调用 `cpufreq_cooling_set_cur_state()` 设置 cooling state
  - 内部通过 `freq_qos_update_request()` 修改 `scaling_max_freq`
  - 具体频率映射: `state=0` → 不限制, `state=N` → 限制到 freq_table[N]

- **Linux kernel thermal framework**: [kernel thermal docs](https://docs.kernel.org/driver-api/thermal/sysfs-api.html)
  - `trip_point` 定义温度阈值
  - `step_wise` governor: 超温时逐步提高 cooling state
  - `power_allocator` (IPA) governor: 基于 PID 控制器动态分配功率

---

## 三、确认级方法 — Android ADPF Thermal API

### 3.1 概述

Google 在 Android 11 (API 30)+ 提供了应用层可直接调用的热状态 API，属于 **ADPF (Android Dynamic Performance Framework)** 的一部分。

### 3.2 NDK Thermal API

#### AThermal_getCurrentThermalStatus()

返回当前设备热状态等级：

| 枚举值 | 数值 | 含义 | 是否降频 |
|--------|:----:|------|:--------:|
| `ATHERMAL_STATUS_NONE` | 0 | 无降频 | ❌ |
| `ATHERMAL_STATUS_LIGHT` | 1 | 轻微降频，UX 不受影响 | ⚠️ 轻微 |
| `ATHERMAL_STATUS_MODERATE` | 2 | 中等降频 | ✅ |
| `ATHERMAL_STATUS_SEVERE` | 3 | 严重降频，UX 大幅受影响 | ✅ 严重 |
| `ATHERMAL_STATUS_CRITICAL` | 4 | 平台已尽一切手段降功耗 | ✅ 极严重 |
| `ATHERMAL_STATUS_EMERGENCY` | 5 | 关键组件开始关闭 | ✅ 紧急 |
| `ATHERMAL_STATUS_SHUTDOWN` | 6 | 需要立即关机 | ✅ 危险 |

#### AThermal_getThermalHeadroom(forecastSeconds)

返回 0.0 - 1.0+ 的热余量值：

| 范围 | 含义 |
|------|------|
| 0.0 - 0.5 | 凉爽，有充足余量 |
| 0.5 - 0.7 | 开始变热，建议关注 |
| 0.7 - 0.85 | 接近降频阈值 |
| 0.85 - 1.0 | 即将触发严重降频 |
| ≥ 1.0 | **已超过 SEVERE 阈值，正在重度降频** |

### 3.3 使用方式

#### C++ (NDK)

```cpp
#include <android/thermal.h>

AThermalManager* thermal_manager = AThermal_acquireManager();

// 查询当前热状态
AThermalStatus status = AThermal_getCurrentThermalStatus(thermal_manager);
if (status >= ATHERMAL_STATUS_MODERATE) {
    // 确认正在降频，需要降低负载
}

// 查询热余量（预测 10 秒后的状态）
float headroom = AThermal_getThermalHeadroom(thermal_manager, 10);
if (headroom >= 1.0f) {
    // 正在重度降频
}

// 注册监听器（异步通知）
AThermal_registerThermalStatusListener(thermal_manager, callback, nullptr);

// 释放
AThermal_releaseManager(thermal_manager);
```

#### Java (Android SDK)

```java
PowerManager pm = getSystemService(PowerManager.class);

// 查询当前热状态
int thermalStatus = pm.getCurrentThermalStatus();
// PowerManager.THERMAL_STATUS_NONE = 0
// PowerManager.THERMAL_STATUS_MODERATE = 2
// PowerManager.THERMAL_STATUS_SEVERE = 3

// 查询热余量 (Android 12+)
float headroom = pm.getThermalHeadroom(10); // 预测 10 秒后

// 注册监听器
pm.addThermalStatusListener(executor, status -> {
    if (status >= PowerManager.THERMAL_STATUS_MODERATE) {
        // 降低画质/帧率
    }
});
```

### 3.4 注意事项

- `getThermalHeadroom()` 调用频率不能超过 1 次/秒，否则返回 NaN
- Headroom 追踪的是慢速传感器（如皮肤温度），不是瞬时 CPU/GPU 温度
- 预测时间越长准确度越低
- Android 11 以下不可用

### 3.5 行业案例

- **NCSoft《天堂W》**: 使用 ADPF Thermal API 实现动态画质调节，当 headroom > 0.7 时自动降低渲染质量
  - 参考: [Google Developer Story - Lineage W](https://developer.android.google.cn/stories/games/lineagew-adpf?hl=zh-cn)

### 3.6 官方文档

- [Android NDK Thermal Reference](https://developer.android.com/ndk/reference/group/thermal)
- [ADPF Thermal API Guide](https://developer.android.com/games/optimize/adpf/thermal)
- [ADPF Best Practices](https://developers.android.google.cn/games/optimize/adpf/best-practices-adpf)

---

## 四、推测级方法 — Perfetto 频率数据分析

### 4.1 Perfetto 官方建议的降频信号

来源: [Perfetto CPU Analysis Documentation](https://perfetto.dev/docs/analysis/cpu)

| 信号 | 英文原文 | 说明 |
|------|---------|------|
| 突降且持续 | "Sudden, sustained frequency reductions" | 频率突然降低且**不回升**才算 |
| 频率锁定 | "Frequency clamping at lower-than-expected levels" | 频率被锁在低于预期的水平 |
| 负载不降频降 | "Frequency drops below base without load reduction" | CPU 忙碌但频率反降 → 被外力限制 |
| 锯齿形波动 | "Sawtooth patterns in frequency tracks" | thermal governor 反复限频→恢复→限频 |

#### 关键区分

```
正常 DVFS（不算降频）:
  负载低 → 频率降 → 负载高 → 频率升（秒级恢复）

热降频（算降频）:
  负载高 → 频率降 → 负载仍高 → 频率不升（持续被压制）
```

### 4.2 推荐的 Perfetto 采集配置

来源: Perfetto 官方文档 + 社区最佳实践

```protobuf
# 推荐的 trace config（包含热降频分析所需的完整数据）
data_sources: {
  config {
    name: "linux.ftrace"
    ftrace_config {
      # CPU 频率变化事件（事件驱动，ARM 平台）
      ftrace_events: "power/cpu_frequency"
      # CPU idle 状态
      ftrace_events: "power/cpu_idle"
      # 挂起/恢复
      ftrace_events: "power/suspend_resume"
      # 热温度事件（如果内核支持）
      ftrace_events: "thermal/thermal_temperature"
      # cooling device 状态变化
      ftrace_events: "thermal/cdev_update"
      # 频率限制变化（最直接的限频证据）
      ftrace_events: "power/cpu_frequency_limits"
    }
  }
}

data_sources: {
  config {
    name: "linux.sys_stats"
    sys_stats_config {
      # 轮询方式采集 CPU 频率（补充事件驱动遗漏的初始值）
      cpufreq_period_ms: 500
      stat_period_ms: 1000
      stat_counters: STAT_CPU_TIMES
    }
  }
}

data_sources {
  config {
    name: "linux.system_info"
    # 采集可用频率范围（cpuinfo_max_freq 等）
  }
}
```

**最佳实践**: 同时使用事件驱动 (`power/cpu_frequency`) 和轮询 (`sys_stats cpufreq_period_ms`) 两种方式，前者捕获变化时刻，后者提供初始基线值。

### 4.3 Perfetto SQL 分析示例

```sql
-- 检查频率是否被限制在低于 base 水平
SELECT ts, cpu, value
FROM counter
JOIN cpu_counter_track ON counter.track_id = cpu_counter_track.id
WHERE cpu_counter_track.name = 'cpufreq'
AND value < base_frequency
ORDER BY ts

-- 计算大核频率在各水平的驻留时间
SELECT cpu,
       CAST(value/1000 AS INT) as freq_mhz,
       CAST(SUM(dur) / 1e9 AS REAL) as duration_sec
FROM counter
JOIN cpu_counter_track ON counter.track_id = cpu_counter_track.id
WHERE cpu_counter_track.name = 'cpufreq'
AND cpu IN (big_core_ids)
GROUP BY cpu, freq_mhz
ORDER BY cpu, freq_mhz DESC
```

### 4.4 参考来源

- [Perfetto CPU 频率与 Idle 状态监控技术解析 (CSDN)](https://blog.csdn.net/gitblog_00193/article/details/148549708)
- [Android Perfetto CPU 信息解读 (CSDN)](https://blog.csdn.net/w553000664/article/details/160124876)
- [Perfetto CPU 频率变化数据来源 (简书)](https://www.jianshu.com/p/cc7aae80bb2d)

---

## 五、推测级方法 — ARM 架构原理

### 5.1 ARM big.LITTLE / DynamIQ 调频机制

| 特性 | 说明 | 降频判定意义 |
|------|------|-------------|
| Cluster 共享频率域 | 同一 cluster 内所有核心运行在相同频率 | **全核同步降到同一频率 = cluster 级限频** |
| EAS (Energy Aware Scheduling) | 根据能效选择核心 | 低负载时自动调到小核（正常行为，不是降频） |
| IPA (Intelligent Power Allocation) | PID 控制器分配 CPU/GPU 功率预算 | 温度升高 → CPU 预算被压缩 → 频率降低 |
| DVFS | 根据负载动态调频调压 | 负载低时降频是正常节能行为 |

### 5.2 IPA (Intelligent Power Allocation) 工作原理

ARM 官方的智能功率分配机制：

```
目标温度 (target_temp)
    │
    ├── PID 控制器计算总功率预算
    │       │
    │       ├── 分配给 CPU (power_cpu)
    │       └── 分配给 GPU (power_gpu)
    │
    ├── CPU 功率预算 → 映射到最大频率
    │       当预算不足时 → 降低 max_freq → 降频
    │
    └── 温度反馈循环
            实际温度 > 目标温度 → 减少总预算 → 进一步降频
```

**关键**: IPA 是 cluster 级别操作的，所以当 IPA 决定降频时，同一 cluster 的所有大核会**同时**被限到相同频率。这就是"全核同步降频"方法的硬件原理。

### 5.3 参考来源

- [ARM Intelligent Power Allocation 技术详解 (CSDN)](https://blog.csdn.net/sinat_32960911/article/details/132192629)
- [Linux Kernel Thermal Documentation](https://docs.kernel.org/driver-api/thermal/sysfs-api.html)

---

## 六、实际应用 — 各方法适用场景对比

### 6.1 按数据可用性选择

| 场景 | 可用方法 | 推荐做法 |
|------|---------|---------|
| 有 adb 连接 + 采集脚本 | sysfs 全量读取 | **确认级**: 对比 scaling/cpuinfo max_freq |
| 游戏内集成 ADPF | Thermal API 实时查询 | **确认级**: headroom >= 1.0 即降频 |
| 只有 Perfetto trace（标准配置） | cpufreq counter | **推测级**: 看频率持续性 + 负载背离 |
| Perfetto trace + thermal ftrace | cpufreq + thermal 事件 | **接近确认**: cdev_update 事件 |

### 6.2 按 trace 时长选择

| trace 时长 | 适用推测方法 | 不适用 |
|-----------|------------|--------|
| < 5s | 频率可达性（能否达到 max）、全核同步 | 持续低频占比（样本不足） |
| 5-30s | 全部推测方法可用 | — |
| > 30s | 全部方法 + 频率上限锁定（窗口对比更可靠） | — |

### 6.3 偶发降频 vs 持续降频

| 类型 | 特征 | Perfetto 中表现 | 影响 |
|------|------|----------------|------|
| 偶发降频 | 频率短暂降低（< 100ms）后恢复 | 频率曲线有短暂尖刺 | 通常不影响帧率 |
| 持续降频 | 频率降低后 **数秒~数十秒不回升** | 频率曲线台阶式下降并锁定 | **严重影响帧率** |
| 周期降频 | 锯齿形：降→升→降→升 | 频率曲线呈锯齿 | 帧率波动不稳 |

**报告中的表述建议**:
- 偶发降频 → "观察到短暂频率波动，未构成持续降频"
- 持续降频 → "确认存在持续降频，频率被锁定在 Xms 的 Y%"
- 无 sysfs 数据时 → "基于频率数据推测 [推测]，建议使用增强版采集脚本确认"

---

## 七、推荐的降频判定流程

```
Step 1: 检查是否有 sysfs 数据（采集脚本产出的 thermal_before/after.txt）
    ├── 有 → 对比 scaling_max_freq vs cpuinfo_max_freq
    │       ├── scaling < cpuinfo → 【确认降频】+ 报告降幅
    │       └── scaling == cpuinfo → 【确认未降频】
    └── 无 → 进入 Step 2

Step 2: 检查 Perfetto trace 内是否有 thermal ftrace 事件
    ├── 有 cdev_update 事件 → 【接近确认】
    ├── 有 thermal_temperature 事件 → 看温度是否超 trip_point
    └── 无 → 进入 Step 3

Step 3: 基于 cpufreq counter 推测
    ├── 频率可达性: P100 < 95% 理论 max → 【推测: 频率受限】
    ├── 持续低频: >30% 时间在 <80% max → 【推测: 持续降频】
    ├── 负载-频率背离: 高负载时频率低 → 【推测: 被限制】
    ├── 全核同步: cluster 统一锁低频 → 【推测: thermal cap】
    └── 以上均无 → 【未检测到降频迹象】

最终: 在报告中标注证据等级（确认 / 推测）
```
