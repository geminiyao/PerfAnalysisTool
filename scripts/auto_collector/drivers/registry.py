"""registry.py - Driver 注册表（C2 CL-7）

Driver 热插拔核心：注册名 → Driver 类的映射。
新 Driver 只需 @register_driver("name") 装饰，YAML/CLI 声明 name 即可使用。

默认注册：simpleperf / perfetto / unity-profiler
"""

from typing import Dict, List, Optional, Type

from drivers.base import Driver
from drivers.simpleperf_driver import SimpleperfDriver
from drivers.perfetto_driver import PerfettoDriver
from drivers.unity_profiler_driver import UnityProfilerDriver


_DRIVER_REGISTRY: Dict[str, Type[Driver]] = {}


def register_driver(name: str):
    """装饰器：注册 Driver 类到注册表。"""
    def decorator(cls: Type[Driver]):
        _DRIVER_REGISTRY[name] = cls
        return cls
    return decorator


def get_driver_class(name: str) -> Optional[Type[Driver]]:
    """按名查 Driver 类。"""
    return _DRIVER_REGISTRY.get(name)


def list_drivers() -> List[str]:
    """列出已注册的 Driver 名。"""
    return list(_DRIVER_REGISTRY.keys())


def create_drivers(tool_names: List[str]) -> List[Driver]:
    """根据工具名列表创建 Driver 实例列表（按声明顺序）。

    Args:
        tool_names: 工具名列表，如 ["simpleperf", "perfetto"]

    Returns:
        Driver 实例列表。未知工具名会打印警告并跳过。
    """
    drivers: List[Driver] = []
    for name in tool_names:
        cls = get_driver_class(name)
        if cls:
            drivers.append(cls())
        else:
            print(f"[WARN] 未知 Driver: {name}（已注册: {list_drivers()}）")
    return drivers


# ---- 默认注册 ----
register_driver("simpleperf")(SimpleperfDriver)
register_driver("perfetto")(PerfettoDriver)
register_driver("unity-profiler")(UnityProfilerDriver)
