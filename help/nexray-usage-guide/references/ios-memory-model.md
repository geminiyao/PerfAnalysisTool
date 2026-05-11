# iOS 内存模型深度参考

## OOM 阈值参考表

| 运行内存 | 代表机型 | OOM 阈值 (footprint, MB) |
| :--- | :--- | :--- |
| 2GB | iPhone 6s / 7 / 8 | 1449 |
| 3GB | iPhone 7P / 8P / X / XR | 1849 |
| 4GB | iPhone XS / XS Max / 11 / 12 / 13 | 2097 |
| 6GB | iPhone 12 Pro (Max) / 13 Pro (Max) / 14 / 15 (Plus) | 3071 |
| 8GB | iPhone 15 Pro (Max) / 16 / 17 | 3375 |
| 12GB | iPhone 17 Pro (Max) / 17 Air | 3375 |

> 部分机型在新 OS 版本上可通过内存扩展特性增加可用 footprint，但建议仍以原本阈值作为设计标准。

## Memory Footprint 精确定义

$$Memory\ Footprint \approx Dirty\ (Internal) + Compressed + IOKit$$

- **Dirty Memory**：被写入数据的内存页
- **Compressed Memory**：被压缩的脏页
- **IOKit**：驱动映射内存（UE 中主要是 GPU 显存）

**常见误区**：
- 错误：`Footprint = Resident + Swapped`。Resident 包含 Clean Pages（代码段等），系统可随时丢弃。
- Xcode 仪表盘统计 `Dirty + Swapped`，数值往往小于真实 `Physical Footprint`。

**获取方式**：
- 代码：`task_info` 接口获取 `phys_footprint`
- Instruments：VM Tracker → Bottom Summary → Physical Footprint

## iOS 特殊的 Swap 机制

与桌面系统不同，iOS 不支持将内存 Swap Out 到磁盘：
- **Read-Only Pages**（代码段）：内存紧张时直接从物理内存移除（Evict），下次访问重新加载
- **Dirty Pages**（动态分配数据）：无法被移除
- **Memory Compressor**：不活跃的 Dirty Pages 被压缩存储在物理内存中

## Swapped Size 的真实含义

- **macOS**：被换出到磁盘（Disk Swap）
- **iOS**：Compressed Memory。iOS 没有磁盘交换区，Memory Compressor 将不常用脏页压缩后继续放在 RAM 中
- 压缩率 3:1 时，30MB Dirty 压缩后 Swapped 显示 30MB，但实际只占 10MB 物理内存
- **卡顿原因**：解压消耗大量 CPU，导致 CPU 飙升和掉帧

## 系统判定 OOM 的唯一标准

**Total = Dirty Size + Swapped Size**

不看 Resident Size（包含可丢弃的 Clean Memory），不看 Virtual Size。

| 设备类型 | 参考阈值 (Dirty + Swap) |
| :--- | :--- |
| 2GB 内存 (iPhone 8/X) | 约 1.2 GB - 1.4 GB |
| 3GB 内存 (iPhone XR) | 约 1.6 GB - 1.8 GB |
| 4GB 内存 (iPhone 11/13) | 约 2.0 GB - 2.4 GB |

## mmap 文件映射优化

### 方案对比

| 方案 | 权限 | 映射类型 | 是否 Clean | 是否计入 Footprint | 脏页回写 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 直接构建 mmap 资源包 | `PROT_READ` | `MAP_PRIVATE` | 完全 Clean | 否 | 否 |
| 文件 mmap 动态分配器 | `PROT_READ\|PROT_WRITE` | `MAP_SHARED` | 动态 Clean | 动态部分计入 | 是 |

### 安全限制

- 6GB 设备累计文件 mmap > 1.4GB 时触发集中 Page Out（5-10 秒卡顿）
- 推荐控制在 600MB 以下
- 仅大内存（>20KB）走 mmap，小内存保留系统分配器

## PROT_NONE 的作用

`PROT_NONE` 不占物理内存（RSS），只占虚拟地址空间。典型用途：
1. **占坑（Reservation）**：先圈占大块虚拟内存，按需用 `mprotect` 开启权限
2. **警戒页（Guard Pages）**：在内存块间插入，越界时立即 SegFault 定位 Bug
