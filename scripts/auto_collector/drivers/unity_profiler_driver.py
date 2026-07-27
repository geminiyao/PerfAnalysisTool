"""unity_profiler_driver.py - Unity Profiler Driver（C2 CL-7）

封装游戏 CombinedProfile intent 触发 + logcat 信号检测 + .pdata 拉取。
这是"游戏侧采样"的 Driver：触发游戏内 CombinedProfile → 等待 END 信号 → 拉 .pdata。

与其他 Driver 的协作：
  - simpleperf/perfetto 在本 Driver start() 之前 start()（后台录制）
  - 本 Driver start() 触发游戏采样窗口
  - 本 Driver stop() 等待采样窗口结束（阻塞，信号检测）
  - 然后简单驱动 stop()
"""

import os
from typing import Dict, List

from drivers.base import Driver, DriverContext
from core import (
    trigger_profile, stop_profile, wait_for_profile_end, pull_unity_pdata,
)


class UnityProfilerDriver(Driver):
    """Unity Profiler 采集 Driver。

    start: trigger_profile() 发送 start_combined_profile intent
    stop:  wait_for_profile_end() 等待 END 信号（阻塞），超时则 stop_profile()
    pull:  pull_unity_pdata() 拉取 .pdata/.raw 文件

    results: profile_name / mono_ns_start / mono_ns_end / frame_count / game_profile_ok
    """

    def __init__(self):
        self._profile_name: str = ""
        self._mono_ns_start = None
        self._mono_ns_end = None
        self._frame_count = None
        self._game_profile_ok = False
        self._pdata_paths: List[str] = []

    @property
    def name(self) -> str:
        return "unity-profiler"

    def start(self, ctx: DriverContext) -> None:
        trigger_profile(
            name=ctx.profile_name,
            duration=ctx.duration,
            scene=ctx.config.get("defaultScene", ""),
            config=ctx.config,
            device=ctx.device,
        )
        self._profile_name = ctx.profile_name

    def stop(self, ctx: DriverContext) -> None:
        """等待采样窗口结束。信号检测失败时降级，不中断收尾。"""
        try:
            self._profile_name, self._mono_ns_start, self._mono_ns_end, self._frame_count = (
                wait_for_profile_end(
                    timeout=ctx.duration + 120,
                    device=ctx.device,
                    duration=ctx.duration,
                    profile_name_hint=ctx.profile_name,
                    config=ctx.config,
                )
            )
            self._game_profile_ok = True
        except RuntimeError as e:
            print(f"[WARN] [unity-profiler] {e}")
            print("[WARN] [unity-profiler] 游戏内 CombinedProfile 信号未检测到，降级处理：simpleperf/perfetto 数据仍有效")

    def pull(self, ctx: DriverContext) -> List[str]:
        self._pdata_paths = pull_unity_pdata(
            out_dir=ctx.out_dir,
            config=ctx.config,
            device=ctx.device,
            profile_name=self._profile_name,
        )
        return self._pdata_paths

    @property
    def results(self) -> Dict:
        return {
            "profile_name": self._profile_name,
            "mono_ns_start": self._mono_ns_start,
            "mono_ns_end": self._mono_ns_end,
            "frame_count": self._frame_count,
            "game_profile_ok": self._game_profile_ok,
            "pdata_paths": list(self._pdata_paths),
        }
