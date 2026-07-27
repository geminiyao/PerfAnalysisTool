"""primitives/ - 游戏内原子动作框架（C2 CL-8）

Primitive = 可组合的原子动作（进场景/相机移动/等待）。
YAML 声明 action.steps: [enter_scene, camera_sweep, wait_duration] → 按序执行。

Lua 接口若游戏侧不支持，用 ADB input 降级（精度差但不阻塞）。
"""
