# UE iOS 内存优化参考

## VM Tracker 分类与 UE 资源对应

| VM Tracker 分类 | 精确解释 | UE 资源对应 |
| :--- | :--- | :--- |
| IOKit | 驱动映射内存（Metal API GPU 资源） | 显存：Render Targets, Vertex Buffers, Index Buffers, Textures。**最大头** |
| VM_ALLOCATE | 匿名虚拟内存（`vm_allocate`） | UE 核心堆：FMallocBinned 申请的大块（通常 Memory Tag 255） |
| Malloc_* | 系统标准 malloc | 非 UE 核心：第三方 SDK 使用的内存 |
| MappedFile | 文件映射 | 通常不计入 Footprint（除非被修改变 Dirty） |

## GPU 显存优化策略

### 1. Memoryless Targets（无内存渲染目标）

仅 GPU 内部使用、不需要 CPU 读回的 RT（如 Depth Buffer、G-Buffer 中间层），声明为 `MTLStorageModeMemoryless`，不占物理内存。

**注意**：严禁对 Memoryless RT 执行 `ReadPixels`，否则 Crash 或内存暴增。

### 2. Purgeable Memory（可清理内存）

将 Metal 资源标记为 Volatile，系统内存紧张时自动回收，不计入 Footprint。UE StreamingManager 利用此特性管理纹理流送池。

### 3. Metal Resource Heap & Alias

利用 Heap 预分配显存池，不同时间段使用的资源共享物理内存。UE Render Graph (RDG) 自动处理资源 Aliasing。

### 4. Metal Shader Library

项目设置 → iOS → Build → 启用 Metal Shader Library，运行时加载预编译 `.metallib`，减少 CPU 和内存消耗。

## CPU 堆内存优化

### Allocator 选择

对大量微小对象的项目，可尝试禁用 FMalloc 改用系统分配器：

```ini
[SystemSettings]
DefaultPlatformMemoryManager=SystemAllocator
```

需通过 LLM 对比 `Malloc Unused` 和 `Phys Footprint` 验证效果。

### 代码段优化

- Strip Symbols：移除调试符号
- 移除未使用的 UE 插件
- 避免头文件中大范围 C++ 模板实例化

## 低内存警告响应

```cpp
void UMyGameInstance::Init() {
    Super::Init();
    FCoreDelegates::OnMemoryTrim.AddUObject(this, &UMyGameInstance::HandleLowMemory);
}

void UMyGameInstance::HandleLowMemory() {
    // 1. 销毁不必要的 UI Widget
    // 2. 清理自定义对象池
    // 3. 清理闲置 Texture Streaming Pool
    // 4. 释放非关键缓存
}
```

## 自定义分区匹配策略

### 规则顺序优先（Rule Order Priority）

从叶子节点向上遍历，按配置顺序匹配，首次匹配即剪枝。

适用：业务模块划分明确、需要按重要性归类。

**关键**：最具体的规则放最前面，通用规则放最后。

### 堆栈深度优先（Stack Depth Priority）

扫描全路径，选择最深匹配（最接近叶子节点）。深度相同时按规则顺序。

适用：需要精确定位调用源头、多层框架嵌套。

### 配置格式

支持 JSON 和 INI 两种格式：

```json
{
    "Classes": [
        { "name": "AV/Audio", "filters": ["AK::", "Wwise", "AVAudioSession"] },
        { "name": "Gameplay/UI", "filters": ["UMHDynamicAtlas::", "UPanelWidget"] }
    ]
}
```

```ini
# AV/Audio
AK::
Wwise

# Gameplay/UI
UMHDynamicAtlas::
UPanelWidget
```

关键词支持部分匹配（如 `AK::` 匹配所有 `AK::` 开头的符号）。

## 内存排查清单

| 内存类型 | 分析工具 | 关注点 |
| :--- | :--- | :--- |
| 显存 (GPU) | VM Tracker (IOKit → Dirty Size) | RT, Textures, Buffers |
| UE 堆 (CPU) | VM Tracker (VM_ALLOCATE Tag 255) | UObject, Animation, StaticMesh |
| 系统/SDK | VM Tracker (Malloc_*) | 第三方 SDK 分配 |
| 代码段 | __TEXT / __LINKEDIT | 二进制包体积 |
| 内存浪费 | LLM (Malloc Unused) | 碎片、未释放 Slack |

### 排查流程

1. **第一眼看 Total (Dirty + Swap)**：离 OOM 还有多远？
2. **第二眼看 Region 分布**：谁是大头？VM_ALLOCATE → 引擎对象；IOAccelerator → 美术资源；MALLOC_* → C++ 代码/插件
3. **第三眼看 Frag % 和 Region Count**：碎片化问题？> 25% 或 > 50,000 需重构
4. **最后看 Dirty 增长趋势**：场景切换前后不回落 → 泄漏
