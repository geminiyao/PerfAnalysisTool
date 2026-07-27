"""registry.py - Primitive 注册表（C2 CL-8）

Primitive 热插拔核心：注册名 → Primitive 类的映射。
新 Primitive 只需 @register_primitive("name") 装饰，YAML 声明 name 即可使用。

默认注册：enter_scene / camera_sweep / wait_duration
"""

from typing import Dict, List, Optional, Type

from primitives.base import Primitive
from primitives.enter_scene import EnterScenePrimitive
from primitives.camera_sweep import CameraSweepPrimitive
from primitives.wait_duration import WaitDurationPrimitive
from primitives.stress_test import StressTestPrimitive


_PRIMITIVE_REGISTRY: Dict[str, Type[Primitive]] = {}


def register_primitive(name: str):
    """装饰器：注册 Primitive 类到注册表。"""
    def decorator(cls: Type[Primitive]):
        _PRIMITIVE_REGISTRY[name] = cls
        return cls
    return decorator


def get_primitive_class(name: str) -> Optional[Type[Primitive]]:
    """按名查 Primitive 类。"""
    return _PRIMITIVE_REGISTRY.get(name)


def list_primitives() -> List[str]:
    """列出已注册的 Primitive 名。"""
    return list(_PRIMITIVE_REGISTRY.keys())


def create_primitive(name: str, params: dict) -> Optional[Primitive]:
    """创建 Primitive 实例。"""
    cls = get_primitive_class(name)
    if cls:
        return cls()
    print(f"[WARN] 未知 Primitive: {name}（已注册: {list_primitives()}）")
    return None


# ---- 默认注册 ----
register_primitive("enter_scene")(EnterScenePrimitive)
register_primitive("camera_sweep")(CameraSweepPrimitive)
register_primitive("wait_duration")(WaitDurationPrimitive)
register_primitive("stress_test")(StressTestPrimitive)
