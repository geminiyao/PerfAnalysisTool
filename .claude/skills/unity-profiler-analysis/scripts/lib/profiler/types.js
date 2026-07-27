/**
 * Main process Profiler data types
 * Mirrors Unity Profile Analyzer C# data structures
 */
// ============ Render / Memory counters (sidecar) ============
/** 与 sidecar JSON 中 `counters` 字段顺序一致的固定字段名集合。
 *  改顺序需要同步改 schemaVersion 和 C# 导出器。 */
export const COUNTER_FIELDS = [
    'drawCalls',
    'batches',
    'setPassCalls',
    'triangles',
    'vertices',
    'usedTexturesBytes',
    'usedTexturesCount',
    'totalReservedMemory',
    'totalUsedMemory',
    'gcAllocatedInFrame',
    'gcReservedMemory',
    'systemUsedMemory',
    // Unity 2019.4 Memory area 额外字段（2020+ 上 sidecar 也会保留 null）
    'particleMemory',
    'meshMemory',
    'materialCount',
    'objectCount'
];
export const DEPTH_ALL = -1;
export const BUCKET_COUNT = 20;
