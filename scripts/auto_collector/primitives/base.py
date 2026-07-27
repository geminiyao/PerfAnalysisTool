"""base.py - Primitive 统一接口（C2 CL-8）

所有游戏内原子动作实现此接口。
Orchestrator 通过 PrimitiveContext 传递运行时参数，按序调 execute()。

降级策略：
  - 优先：Lua intent（am start --es cmd <primitive> ...）— 精确
  - 降级：ADB input（input tap / input swipe）— 精度差但不阻塞
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, Optional


@dataclass
class PrimitiveContext:
    """Primitive 运行时上下文。"""
    device: Optional[str]      # adb 设备 serial
    config: dict               # 扁平化配置 dict
    package: str               # 游戏包名
    activity: str              # 游戏 Activity
    intent_action: str         # CombinedProfile intent action
    scene: str                 # 当前场景名


class Primitive(ABC):
    """游戏内原子动作抽象基类。

    生命周期：execute(params, ctx) → 返回结果 dict
    实现类需：
      1. 先尝试 Lua intent 调用
      2. 若不支持/失败，降级为 ADB input
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Primitive 标识名（如 'enter_scene' / 'camera_sweep' / 'wait_duration'）。"""
        ...

    @abstractmethod
    def execute(self, params: Dict, ctx: PrimitiveContext) -> Dict:
        """执行原子动作。

        Args:
            params: YAML 声明的参数（如 {scene: WildField, coord: [120, 45]}）
            ctx: 运行时上下文

        Returns:
            结果 dict，至少含 {ok: bool, method: str, detail: str}
            method: 'lua' | 'adb_input' | 'none'
        """
        ...

    # ---- 辅助方法 ----
    def _try_lua_intent(self, cmd: str, ctx: PrimitiveContext, extra_args: str = "") -> bool:
        """尝试通过 am start 发送 Lua primitive intent。

        游戏侧需支持 cmd=<primitive_name> 的 intent。
        返回 True 表示 intent 发送成功（不代表游戏侧执行成功）。
        """
        intent_cmd = (
            f"am start"
            f" -n {ctx.package}/{ctx.activity}"
            f" -a {ctx.intent_action}"
            f" --es cmd {cmd}"
            f" {extra_args}"
        )
        try:
            from core import adb_shell
            adb_shell(intent_cmd, device=ctx.device, check=True)
            return True
        except Exception as e:
            print(f"[WARN] [{self.name}] Lua intent '{cmd}' 失败: {e}，降级为 ADB input")
            return False
