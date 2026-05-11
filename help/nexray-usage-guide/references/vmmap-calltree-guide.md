# VMMap 与 Calltree 深度分析参考

## vmmap vs malloc_history：两种视角

| 维度 | vmmap -fullstack | malloc_history -callTree |
| :--- | :--- | :--- |
| **视角** | 操作系统内核视角 (Physical/Virtual Layer) | 逻辑应用视角 (Logical/Heap Layer) |
| **关注点** | VM Region (地皮) | Object (住户) |
| **数据来源** | 内核 VM 表 + Stack Logging 数据库 | Malloc 库记录 + Stack Logging 数据库 |
| **变化频率** | 低，只有内存池扩容或大块申请时 | 高，每次 new/delete 都会变动 |
| **对复用内存** | 看不到复用，永远显示最初申请者 | 看到复用，显示当前持有者 |

## 堆栈不一致的三个核心原因

### 1. 内存缓存（最常见）

`free()` 不等于 `munmap`。Allocator 将释放的内存标记为空闲留着复用，不立刻还给内核。

- **malloc_history**：对象销毁后堆栈消失
- **vmmap**：Region 仍在，堆栈是当初申请时的

这些"多出来的堆栈"是**峰值内存痕迹**或**内存池缓存水位**。

**优化**：调用 `malloc_zone_pressure_relief` 或 UE 的 `FMemory::Trim()` 强制归还。

### 2. 内存碎片

一个大 Region 里只有一个小对象存活，整块 Region 无法释放。vmmap 显示完整 Region，malloc_history 只显示幸存的小对象。

### 3. 元数据开销

Allocator 自身的记账数据通过 `mmap` 申请，在 vmmap 可见但不在 malloc_history 的用户态列表中。

## Footprint Size vs CallTree Size

| 指标 | 统计方式 | 含义 |
| :--- | :--- | :--- |
| Footprint Size | 所有 Region 的 Dirty + Swapped | 真实物理内存占用 |
| CallTree Size | Live MallocBlock Size + Live mmap Region Dirty+Swapped | 逻辑分配大小 |

**常见悖论**：
- **CallTree > Footprint**：申请了 100MB 但只写了 1MB（申请量 vs 实际 Dirty）
- **Footprint 涨但 CallTree 不涨**：访问了历史分配的 Clean 页面使其变 Dirty、碎片化导致更多 Page 被标记 Dirty

## Region 类型速查

| 区域类型 | 来源 | UE/Unity 对应 | 异常分析 |
| :--- | :--- | :--- | :--- |
| VM_ALLOCATE | `vm_allocate` 系统调用 | UE: Binned Allocator; Unity: Mono/IL2CPP Heap | 占比最大且持续增长→游戏逻辑泄漏 |
| IOAccelerator/IOKit | GPU/显存驱动 | 纹理、顶点缓冲、RT | 暴涨→高分辨率纹理过多或 RT 未释放 |
| MALLOC_SMALL/TINY | 系统堆（小对象） | Unity: Native 插件; UE: 第三方库 | 碎片率高→C++ 大量临时对象 |
| IOSurface | 跨进程共享纹理 | WebView、视频播放、相机 | 关闭后不释放→检查引用 |
| Stack | 线程栈 | 线程数量 | Count > 数百→Thread Pool 滥用 |
| WebKit Malloc | Web 内核堆 | 内嵌网页 | 持续占用→WebView Cache 未清理 |

## 碎片化分析

### 碎片率计算公式

```
FRAG_Size = zone_dirty - zone_BytesAllocated
% FRAG = (zone_dirty - zone_BytesAllocated) / zone_dirty
```

仅对 MallocZone 计算。UE Binned 分配器使用 `mmap` 自行管理，不经过 MallocZone，因此 memgraph 显示碎片率为 0 **不代表没有碎片**。

### 碎片判定

| 指标 | 正常 | 警告 | 严重 |
|------|------|------|------|
| Frag % | 10%-25% | > 25% | > 50% |
| Region Count | 5,000-20,000 | > 50,000 | 接近 65,536（硬限制） |
| Empty / Virtual | < 15% | 15%-30% | > 30% |

## memgraph 堆栈采集机制

memgraph 通过 iOS 系统对内存分配 API 的 Hook 获取堆栈：
- **C 库层（libmalloc）**：`malloc_logger` Hook `malloc`/`free`/`realloc`/`calloc`
- **内核层（XNU）**：`syscall_logger` Hook `mmap`/`vm_allocate`/`mach_vm_allocate`

开启 `MallocStackLogging` 环境变量后，两类 API 均被 Hook，memgraph 可记录完整调用堆栈。
