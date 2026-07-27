"""simpleperf_driver.py - Simpleperf Driver（C2 CL-7）

封装 start_simpleperf / stop_simpleperf / perf.data 拉取逻辑。
"""

import os
from typing import Dict, List

from drivers.base import Driver, DriverContext
from core import (
    start_simpleperf, stop_simpleperf, push_simpleperf_if_needed,
)


class SimpleperfDriver(Driver):
    """simpleperf 采集 Driver。

    start: push simpleperf 二进制（如需）+ 启动 app_profiler.py（后台）
    stop:  等待 app_profiler.py 自然结束
    pull:  验证 perf.data 存在（app_profiler.py 直接输出到 out_dir）
    """

    def __init__(self):
        self._proc = None
        self._perf_data_path: str = ""

    @property
    def name(self) -> str:
        return "simpleperf"

    def start(self, ctx: DriverContext) -> None:
        # 确保设备上有 simpleperf 二进制
        abi = ctx.device_abi or "arm64-v8a"
        device_path = ctx.config.get("deviceSimpleperfPath", "/data/local/tmp/simpleperf")
        push_simpleperf_if_needed(abi, device_path, device=ctx.device)

        self._proc = start_simpleperf(
            pid=ctx.pid,
            config=ctx.config,
            device=ctx.device,
            out_dir=ctx.out_dir,
            symbol_dir=ctx.config.get("symbolLibDir"),
            duration=ctx.duration,
        )

    def stop(self, ctx: DriverContext) -> None:
        stop_simpleperf(proc=self._proc, device=ctx.device)

    def pull(self, ctx: DriverContext) -> List[str]:
        """perf.data 由 app_profiler.py 直接输出到 out_dir，无需 adb pull。"""
        perf_path = os.path.join(ctx.out_dir, "perf.data")
        if os.path.exists(perf_path):
            size_kb = os.path.getsize(perf_path) // 1024
            print(f"[INFO] [simpleperf] perf.data -> {perf_path}  ({size_kb}KB)")
            self._perf_data_path = perf_path
            return [perf_path]
        else:
            print("[WARN] [simpleperf] perf.data 不存在（app_profiler.py 可能未正常输出）")
            return []

    @property
    def results(self) -> Dict:
        return {
            "perf_data_path": self._perf_data_path,
        }
