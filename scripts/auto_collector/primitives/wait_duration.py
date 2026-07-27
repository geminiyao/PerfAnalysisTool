"""wait_duration.py - 等待时长 Primitive（C2 CL-8）

最简 Primitive：sleep 指定秒数。用于采样窗口内的等待。
"""

import time
from typing import Dict

from primitives.base import Primitive, PrimitiveContext


class WaitDurationPrimitive(Primitive):
    """等待指定时长。

    params:
      duration: 等待秒数（必填）
    """

    @property
    def name(self) -> str:
        return "wait_duration"

    def execute(self, params: Dict, ctx: PrimitiveContext) -> Dict:
        duration = int(params.get("duration", 0))
        if duration <= 0:
            return {"ok": False, "method": "none", "detail": "duration <= 0"}

        print(f"[INFO] [wait_duration] 等待 {duration}s...")
        time.sleep(duration)
        return {"ok": True, "method": "sleep", "detail": f"{duration}s"}
