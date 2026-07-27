"""camera_sweep.py - 相机移动 Primitive（C2 CL-8）

pattern:
  - move_to_grid: 游戏内大地图网格坐标 A→B 平滑移动（调用 MoveToGrid）
      通过 Intent cmd=move_camera_from_to，name 编码 "fromX,fromY,toX,toY"
      需要游戏侧 ProfileTestMgr 扩展支持
  - back_forth / circular / one_way: ADB input swipe 降级（屏幕坐标滑动，精度差）
"""

import time
from typing import Dict

from primitives.base import Primitive, PrimitiveContext


class CameraSweepPrimitive(Primitive):
    """相机移动 Primitive。

    params:
      duration: 总移动时长（秒），默认 30
      pattern:  move_to_grid | back_forth | circular | one_way，默认 back_forth
      enable:   是否移动相机，默认 true
                true  = 瞬移到 from_grid，再平滑移动到 to_grid
                false = 瞬移到 to_grid 后不动（静止采集）

      move_to_grid 专属参数：
        from_grid: [gridX, gridY] 起点网格坐标
        to_grid:   [gridX, gridY] 终点网格坐标
        rounds:    来回回合数，默认 1
                   1  = A→B（单程）
                   2  = A→B→A（一个来回）
                   N  = A→B→A→B→... 共 N 段移动，每段时长 = duration/N
    """

    @property
    def name(self) -> str:
        return "camera_sweep"

    def execute(self, params: Dict, ctx: PrimitiveContext) -> Dict:
        duration = int(params.get("duration", 30))
        pattern = params.get("pattern", "back_forth")
        enable = params.get("enable", True)

        print(f"[INFO] [camera_sweep] 时长={duration}s 模式={pattern} enable={enable}")

        # move_to_grid: 游戏内大地图网格坐标 A→B 平滑移动
        if pattern == "move_to_grid":
            from_grid = params.get("from_grid")
            to_grid = params.get("to_grid")
            if not from_grid or not to_grid:
                return {"ok": False, "method": "lua",
                        "detail": "move_to_grid 需要 from_grid 和 to_grid 参数"}

            # enable=false: 瞬移到 to_grid 后不动（from=to，零距离 sweep）
            if not enable:
                from_grid = list(to_grid)
                print(f"[INFO] [camera_sweep] enable=false, 瞬移到 {to_grid} 静止 {duration}s")

            rounds = int(params.get("rounds", 1))
            if rounds < 1:
                rounds = 1
            per_move = duration / rounds  # 每段移动时长
            print(f"[INFO] [camera_sweep] move_to_grid {from_grid}<->{to_grid} "
                  f"rounds={rounds} 每段={per_move:.1f}s")
            # 只发一次 Intent，Lua 层用 callback 链式管理来回移动（避免时序不匹配）
            name_str = f"move_camera:{from_grid[0]},{from_grid[1]},{to_grid[0]},{to_grid[1]},{rounds}"
            extra = f"--es name {name_str} --ei duration {int(duration)}"
            if not self._try_lua_intent("start_combined_profile", ctx, extra):
                return {"ok": False, "method": "lua",
                        "detail": "move_camera (via start_combined_profile) 未被游戏侧处理"}
            print(f"[INFO] [camera_sweep] move_to_grid {from_grid}<->{to_grid} "
                  f"rounds={rounds} 等待 {duration}s（Lua callback 链式驱动）")
            time.sleep(duration)
            return {"ok": True, "method": "lua",
                    "detail": f"move_to_grid {from_grid}<->{to_grid} {rounds}段 {duration}s"}

        # 尝试 Lua intent（back_forth/circular/one_way）
        extra = f"--ei duration {duration} --es pattern {pattern}"
        if self._try_lua_intent("camera_sweep", ctx, extra):
            # Lua 调用成功，等待 duration 秒让游戏内相机移动完成
            print(f"[INFO] [camera_sweep] Lua 调用成功，等待 {duration}s...")
            time.sleep(duration)
            return {"ok": True, "method": "lua", "detail": f"{pattern} {duration}s"}

        # 降级：ADB input swipe 序列
        return self._adb_sweep(duration, pattern, ctx, params)

    def _adb_sweep(self, duration: int, pattern: str, ctx: PrimitiveContext,
                   params: Dict = None) -> Dict:
        """ADB input swipe 降级实现。"""
        from core import adb_shell

        params = params or {}

        # 假设屏幕分辨率（可通过 getprop 获取，这里用常见值）
        # 实际应从 ctx 或设备动态获取
        screen_w, screen_h = 1080, 2400
        try:
            r = adb_shell("wm size", device=ctx.device, capture=True)
            import re
            m = re.search(r"(\d+)x(\d+)", r.stdout)
            if m:
                screen_w, screen_h = int(m.group(1)), int(m.group(2))
        except Exception:
            pass

        start_time = time.time()
        swipe_ms = 500  # 每次 swipe 500ms

        try:
            if pattern == "one_way":
                # 单向：从 from 滑到 to，滑完后保持不动
                from_coord = params.get("from_coord", [screen_w // 4, screen_h // 2])
                to_coord = params.get("to_coord", [screen_w * 3 // 4, screen_h // 2])
                # swipe 时长不超过 5s（ADB swipe 实际滑动速度有限）
                swipe_ms = min(duration * 1000, 5000)
                adb_shell(
                    f"input swipe {from_coord[0]} {from_coord[1]} "
                    f"{to_coord[0]} {to_coord[1]} {swipe_ms}",
                    device=ctx.device,
                )
                # 滑完后等待剩余时间
                elapsed = int(time.time() - start_time)
                remaining = duration - elapsed
                if remaining > 0:
                    time.sleep(remaining)
                elapsed = int(time.time() - start_time)
                return {"ok": True, "method": "adb_input",
                        "detail": f"one_way {from_coord}->{to_coord} {elapsed}s (swipe)"}

            if pattern == "circular":
                # 圆周：4 段弧
                cx, cy = screen_w // 2, screen_h // 2
                r = min(screen_w, screen_h) // 4
                points = [
                    (cx + r, cy), (cx, cy + r),
                    (cx - r, cy), (cx, cy - r), (cx + r, cy),
                ]
                idx = 0
                while time.time() - start_time < duration:
                    x1, y1 = points[idx % 4]
                    x2, y2 = points[(idx + 1) % 4]
                    adb_shell(f"input swipe {x1} {y1} {x2} {y2} {swipe_ms}", device=ctx.device)
                    idx += 1
                    time.sleep(swipe_ms / 1000 + 0.1)
            else:
                # back_forth：左右来回
                left_x = screen_w // 4
                right_x = screen_w * 3 // 4
                mid_y = screen_h // 2
                toggle = True
                while time.time() - start_time < duration:
                    x1 = left_x if toggle else right_x
                    x2 = right_x if toggle else left_x
                    adb_shell(f"input swipe {x1} {mid_y} {x2} {mid_y} {swipe_ms}", device=ctx.device)
                    toggle = not toggle
                    time.sleep(swipe_ms / 1000 + 0.1)

            elapsed = int(time.time() - start_time)
            return {"ok": True, "method": "adb_input", "detail": f"{pattern} {elapsed}s (swipe)"}
        except Exception as e:
            return {"ok": False, "method": "adb_input", "detail": f"swipe 失败: {e}"}
