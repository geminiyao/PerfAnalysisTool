"""perfetto_driver.py - Perfetto Driver（C2 CL-7）

封装 start_perfetto / stop_perfetto / .pftrace 拉取逻辑。
"""

import glob
import os
from typing import Dict, List

from drivers.base import Driver, DriverContext
from core import start_perfetto, stop_perfetto


class PerfettoDriver(Driver):
    """perfetto 采集 Driver。

    start: 调用 record_android_trace.py（后台）
    stop:  等待 perfetto 自然结束（flush + pull）
    pull:  验证 .pftrace 存在（record_android_trace.py 自动 pull 到 out_dir）
    """

    def __init__(self):
        self._proc = None
        self._pftrace_path: str = ""

    @property
    def name(self) -> str:
        return "perfetto"

    def start(self, ctx: DriverContext) -> None:
        self._proc, _ = start_perfetto(
            label=ctx.label,
            out_dir=ctx.out_dir,
            duration=ctx.duration,
            config=ctx.config,
            device=ctx.device,
        )

    def stop(self, ctx: DriverContext) -> None:
        stop_perfetto(self._proc, device=ctx.device)

    def pull(self, ctx: DriverContext) -> List[str]:
        """.pftrace 由 record_android_trace.py 自动 pull 到 out_dir。"""
        pftrace_files = glob.glob(os.path.join(ctx.out_dir, "*.pftrace"))
        if pftrace_files:
            self._pftrace_path = pftrace_files[0]
            print(f"[INFO] [perfetto] trace.pftrace -> {self._pftrace_path}")
            return [self._pftrace_path]
        else:
            print("[WARN] [perfetto] 未找到 .pftrace 文件（perfetto 可能未成功录制）")
            return []

    @property
    def results(self) -> Dict:
        return {
            "pftrace_path": self._pftrace_path,
        }
