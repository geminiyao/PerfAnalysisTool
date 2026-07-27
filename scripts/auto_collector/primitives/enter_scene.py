"""enter_scene.py - 进入场景 Primitive（C2 CL-8）

优先：Lua intent cmd=enter_scene --es scene <name> --es coord <x,y>
降级：ADB input tap <x> <y>（点击场景入口坐标）
"""

from typing import Dict

from primitives.base import Primitive, PrimitiveContext


class EnterScenePrimitive(Primitive):
    """进入指定场景。

    params:
      scene: 场景名（如 WildField）
      coord: [x, y] 场景入口屏幕坐标（可选，用于 ADB 降级）
    """

    @property
    def name(self) -> str:
        return "enter_scene"

    def execute(self, params: Dict, ctx: PrimitiveContext) -> Dict:
        scene = params.get("scene", ctx.scene)
        coord = params.get("coord") or params.get("coords")  # [x, y]

        print(f"[INFO] [enter_scene] 场景={scene} 坐标={coord}")

        # 尝试 Lua intent
        extra = f"--es scene {scene}"
        if coord and len(coord) >= 2:
            extra += f" --esa coord {coord[0]},{coord[1]}"
        if self._try_lua_intent("enter_scene", ctx, extra):
            return {"ok": True, "method": "lua", "detail": f"scene={scene}"}

        # 降级：ADB input tap
        if coord and len(coord) >= 2:
            try:
                from core import adb_shell
                adb_shell(f"input tap {coord[0]} {coord[1]}", device=ctx.device)
                print(f"[INFO] [enter_scene] ADB input tap {coord[0]} {coord[1]}（降级）")
                return {"ok": True, "method": "adb_input", "detail": f"tap {coord[0]},{coord[1]}"}
            except Exception as e:
                return {"ok": False, "method": "adb_input", "detail": f"tap 失败: {e}"}

        return {"ok": False, "method": "none", "detail": "无坐标，无法降级"}
