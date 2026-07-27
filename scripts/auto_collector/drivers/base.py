"""base.py - Driver 统一接口（C2 CL-7）

所有采集工具（simpleperf / perfetto / unity-profiler）实现此接口。
Orchestrator 通过 DriverContext 传递运行时参数，按序调 start → stop → pull。
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class DriverContext:
    """Driver 运行时上下文，由 Orchestrator 构造。"""
    out_dir: str               # 本次采集输出目录
    device: Optional[str]      # adb 设备 serial
    config: dict               # 扁平化配置 dict（C1 格式）
    pid: str                   # 游戏 PID
    duration: int              # 采样时长（秒）
    label: str                 # 本次采集标签
    profile_name: str          # CombinedProfile 名称
    run_index: int             # 第几次采集（0-based）
    device_model: str          # 设备型号
    device_abi: str = ""       # 设备 ABI（arm64-v8a 等）


class Driver(ABC):
    """采集工具 Driver 抽象基类。

    生命周期：start() → [采样窗口] → stop() → pull()
    - start: 启动采集（后台进程或 intent 触发）
    - stop:  停止采集（等待自然结束或强制终止）
    - pull:  拉取采集文件到本地 out_dir

    results 属性：stop/pull 后填充的 driver 特定结果（如 mono_ns、frame_count），
    供 Orchestrator 汇总写入 meta.json 和 runs 表。
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Driver 标识名（如 'simpleperf' / 'perfetto' / 'unity-profiler'）。"""
        ...

    @abstractmethod
    def start(self, ctx: DriverContext) -> None:
        """启动采集。"""
        ...

    @abstractmethod
    def stop(self, ctx: DriverContext) -> None:
        """停止采集。"""
        ...

    @abstractmethod
    def pull(self, ctx: DriverContext) -> List[str]:
        """拉取采集文件到 out_dir，返回拉取的文件路径列表。"""
        ...

    @property
    def results(self) -> Dict:
        """Driver 特定结果（stop/pull 后填充）。"""
        return {}
