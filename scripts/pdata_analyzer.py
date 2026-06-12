#!/usr/bin/env python3
"""pdata_analyzer.py - Unity Profiler .pdata 二进制解析 + 统计分析（Python 版）

移植自 src/main/profiler/pdata-parser.ts + profile-analyzer.ts。

对外 API：
    from pdata_analyzer import parse_pdata, analyze_pdata, compare_pdata

    base_data  = parse_pdata("base_001.pdata")
    base_stats = analyze_pdata(base_data)           # 返回 PdataStats

    # 对比两份数据：
    cmp = compare_pdata(base_stats, opt_stats)      # 返回 dict
"""

import struct
import os
import math
import json
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple

LATEST_VERSION = 7
BUCKET_COUNT = 20
DEPTH_ALL = -1

# ---------------------------------------------------------------------------
# 关键 Unity Profiler marker 名称（用于报告筛选）
# ---------------------------------------------------------------------------
KEY_MARKERS = [
    "PlayerLoop",
    "BehaviourUpdate",
    "ScriptRunBehaviourUpdate",
    "ScriptRunBehaviourLateUpdate",
    "FixedUpdate.ScriptRunBehaviourFixedUpdate",
    "Rendering",
    "Camera.Render",
    "Shadows.Draw",
    "RenderForward.RenderLoopJob",
    "GC.Collect",
    "Physics.Processing",
    "Physics.Simulate",
    "Coroutines",
    "WaitForTargetFPS",
    "Idle",
    "VSync",
    "Scripting",
    "AnimatorControllerPlayback",
    "UIEvents.MouseGUIs",
    "UIElementsRuntimeBinding",
    "UGUI.Rendering.AddToCommandBuffer",
    "RendererNotifyInvisible",
]

# 脚本层 marker（Lua/IL2CPP）
SCRIPTING_MARKERS = [
    "ScriptRunBehaviourUpdate",
    "BehaviourUpdate",
    "ScriptRunBehaviourLateUpdate",
    "Coroutines",
]

# ---------------------------------------------------------------------------
# 二进制读取（仿 BinaryReader）
# ---------------------------------------------------------------------------
class BinaryReader:
    def __init__(self, data: bytes):
        self._data = data
        self._pos = 0

    @property
    def position(self) -> int:
        return self._pos

    @property
    def remaining(self) -> int:
        return len(self._data) - self._pos

    def read_int32(self) -> int:
        v, = struct.unpack_from('<i', self._data, self._pos)
        self._pos += 4
        return v

    def read_float(self) -> float:
        v, = struct.unpack_from('<f', self._data, self._pos)
        self._pos += 4
        return float(v)

    def read_double(self) -> float:
        v, = struct.unpack_from('<d', self._data, self._pos)
        self._pos += 8
        return float(v)

    def read_7bit_encoded_int(self) -> int:
        result = 0
        shift = 0
        while True:
            b = self._data[self._pos]
            self._pos += 1
            result |= (b & 0x7F) << shift
            shift += 7
            if not (b & 0x80):
                break
        return result

    def read_string(self) -> str:
        byte_len = self.read_7bit_encoded_int()
        s = self._data[self._pos:self._pos + byte_len].decode('utf-8', errors='replace')
        self._pos += byte_len
        return s


# ---------------------------------------------------------------------------
# 数据结构
# ---------------------------------------------------------------------------
@dataclass
class Marker:
    name_index: int
    ms_total: float
    depth: int
    ms_children: float = 0.0


@dataclass
class Thread:
    thread_index: int
    markers: List[Marker] = field(default_factory=list)


@dataclass
class Frame:
    ms_start_time: float
    ms_frame: float
    threads: List[Thread] = field(default_factory=list)


@dataclass
class PdataFile:
    version: int
    frame_index_offset: int
    frames: List[Frame]
    marker_names: List[str]
    thread_names: List[str]
    file_path: str


# ---------------------------------------------------------------------------
# 解析
# ---------------------------------------------------------------------------
def _correct_thread_name(name: str) -> str:
    parts = name.split(':', 1)
    if len(parts) >= 2:
        group_idx_str, thread_name = parts
        if not thread_name.strip():
            return f"{group_idx_str}:[Unknown]"
        import re
        m = re.match(r'^(.*\S)\s+(\d+)$', thread_name)
        if m:
            prefix = m.group(1)
            idx = 1 + int(m.group(2))
            return f"{idx}:{prefix}"
    return name.strip()


def _read_marker(reader: BinaryReader, version: int) -> Marker:
    name_index = reader.read_int32()
    ms_total = reader.read_float()
    depth = reader.read_int32()
    ms_children = 0.0
    if version == 3:
        ms_children = reader.read_float()
    return Marker(name_index=name_index, ms_total=ms_total, depth=depth, ms_children=ms_children)


def _read_thread(reader: BinaryReader, version: int) -> Thread:
    thread_index = reader.read_int32()
    marker_count = reader.read_int32()
    markers = [_read_marker(reader, version) for _ in range(marker_count)]
    return Thread(thread_index=thread_index, markers=markers)


def _read_frame(reader: BinaryReader, version: int) -> Frame:
    ms_start_time = 0.0
    if version > 1:
        if version >= 6:
            ms_start_time = reader.read_double()
        else:
            ms_start_time = reader.read_double() * 1000.0
    ms_frame = reader.read_float()
    thread_count = reader.read_int32()
    threads = [_read_thread(reader, version) for _ in range(thread_count)]
    return Frame(ms_start_time=ms_start_time, ms_frame=ms_frame, threads=threads)


def _calculate_marker_children(pdata: PdataFile) -> None:
    for frame in pdata.frames:
        for thread in frame.threads:
            for m in thread.markers:
                m.ms_children = 0.0
            stack: List[Marker] = []
            for m in thread.markers:
                depth = m.depth
                while len(stack) >= depth:
                    child = stack.pop()
                    if stack:
                        stack[-1].ms_children += child.ms_total
                stack.append(m)


def parse_pdata(path: str) -> PdataFile:
    with open(path, 'rb') as f:
        data = f.read()
    reader = BinaryReader(data)

    version = reader.read_int32()
    if version < 0 or version > LATEST_VERSION:
        raise ValueError(f"Unsupported .pdata version: {version} (expected 1~{LATEST_VERSION})")

    frame_index_offset = reader.read_int32()
    frame_count = reader.read_int32()
    frames = [_read_frame(reader, version) for _ in range(frame_count)]

    marker_name_count = reader.read_int32()
    marker_names = [reader.read_string() for _ in range(marker_name_count)]

    thread_name_count = reader.read_int32()
    thread_names = [_correct_thread_name(reader.read_string()) for _ in range(thread_name_count)]

    pdata = PdataFile(
        version=version,
        frame_index_offset=frame_index_offset,
        frames=frames,
        marker_names=marker_names,
        thread_names=thread_names,
        file_path=path,
    )
    _calculate_marker_children(pdata)
    return pdata


# ---------------------------------------------------------------------------
# 统计分析
# ---------------------------------------------------------------------------
@dataclass
class MarkerStats:
    name: str
    ms_mean: float          # 帧均（仅存在该 marker 的帧）
    ms_median: float
    ms_p95: float
    ms_total: float
    present_frames: int     # 出现过的帧数
    depth_min: int
    depth_max: int
    threads: List[str]


@dataclass
class ThreadStats:
    name: str              # Unity 格式 "1:UnityMain"
    ms_mean: float
    ms_median: float
    ms_p95: float


@dataclass
class PdataStats:
    file_path: str
    frame_count: int
    fps_mean: float
    frame_ms_mean: float
    frame_ms_median: float
    frame_ms_p95: float
    frame_ms_p99: float
    markers: Dict[str, MarkerStats]   # name -> MarkerStats
    threads: Dict[str, ThreadStats]   # name -> ThreadStats
    all_marker_names: List[str]       # 全量 marker 名（供外部查询）


def _percentile(sorted_vals: list, pct: float):
    if not sorted_vals:
        return 0.0
    idx = int((len(sorted_vals) - 1) * pct / 100)
    return sorted_vals[max(0, min(idx, len(sorted_vals) - 1))]


def analyze_pdata(pdata: PdataFile, target_markers: Optional[List[str]] = None) -> PdataStats:
    """分析 pdata 文件，返回关键 marker 统计。

    :param target_markers: 需要统计的 marker 名列表；None 表示使用 KEY_MARKERS
    """
    if target_markers is None:
        target_markers = KEY_MARKERS

    target_set = set(target_markers)

    # 名称 -> index
    marker_name_to_idx: Dict[str, int] = {n: i for i, n in enumerate(pdata.marker_names)}
    target_indices = {marker_name_to_idx[n]: n for n in target_markers if n in marker_name_to_idx}

    # 每帧总时长
    frame_ms_list = [f.ms_frame for f in pdata.frames]
    frame_ms_sorted = sorted(frame_ms_list)

    fps_mean = (1000.0 / (sum(frame_ms_list) / len(frame_ms_list))) if frame_ms_list else 0.0

    # per-marker 帧级 ms 累积
    # marker_frames[name] = [ms per frame (sum across matching markers in that frame)]
    marker_frames: Dict[str, List[float]] = {n: [] for n in target_markers if n in marker_name_to_idx}

    # per-thread 帧级 ms
    thread_frames: Dict[str, List[float]] = {}   # thread_name -> [ms per frame]

    for frame in pdata.frames:
        # 本帧每个 marker 的累积
        frame_marker_ms: Dict[str, float] = {}

        for thread in frame.threads:
            tname = (pdata.thread_names[thread.thread_index]
                     if thread.thread_index < len(pdata.thread_names)
                     else str(thread.thread_index))

            thread_ms = 0.0
            for m in thread.markers:
                if m.depth == 1 and pdata.marker_names[m.name_index] != 'Idle':
                    thread_ms += m.ms_total

            if tname not in thread_frames:
                thread_frames[tname] = []
            thread_frames[tname].append(thread_ms)

            for m in thread.markers:
                mname = pdata.marker_names[m.name_index] if m.name_index < len(pdata.marker_names) else ''
                if mname in target_set:
                    frame_marker_ms[mname] = frame_marker_ms.get(mname, 0.0) + m.ms_total

        for name, ms in frame_marker_ms.items():
            if name in marker_frames:
                marker_frames[name].append(ms)

    # 生成 MarkerStats
    markers: Dict[str, MarkerStats] = {}
    for name in target_markers:
        if name not in marker_name_to_idx:
            continue
        vals = sorted(marker_frames.get(name, []))
        if not vals:
            continue
        markers[name] = MarkerStats(
            name=name,
            ms_mean=sum(vals) / len(vals),
            ms_median=_percentile(vals, 50),
            ms_p95=_percentile(vals, 95),
            ms_total=sum(vals),
            present_frames=len(vals),
            depth_min=0,
            depth_max=0,
            threads=[],
        )

    # 生成 ThreadStats
    threads: Dict[str, ThreadStats] = {}
    for tname, vals in thread_frames.items():
        if not vals:
            continue
        sv = sorted(vals)
        threads[tname] = ThreadStats(
            name=tname,
            ms_mean=sum(sv) / len(sv),
            ms_median=_percentile(sv, 50),
            ms_p95=_percentile(sv, 95),
        )

    return PdataStats(
        file_path=pdata.file_path,
        frame_count=len(pdata.frames),
        fps_mean=fps_mean,
        frame_ms_mean=_percentile(frame_ms_sorted, 50),   # median as mean proxy
        frame_ms_median=_percentile(frame_ms_sorted, 50),
        frame_ms_p95=_percentile(frame_ms_sorted, 95),
        frame_ms_p99=_percentile(frame_ms_sorted, 99),
        markers=markers,
        threads=threads,
        all_marker_names=list(pdata.marker_names),
    )


# ---------------------------------------------------------------------------
# 对比两份 PdataStats
# ---------------------------------------------------------------------------
def compare_pdata(base: PdataStats, opt: PdataStats) -> dict:
    """对比两份 pdata 统计，返回结构化对比结果。"""

    def delta_pct(b, o):
        if b and b != 0:
            return round((o - b) / b * 100, 2)
        return None

    # 帧级指标对比
    frame_cmp = {
        "base_frame_count": base.frame_count,
        "opt_frame_count":  opt.frame_count,
        "base_fps_mean":    round(base.fps_mean, 2),
        "opt_fps_mean":     round(opt.fps_mean, 2),
        "fps_delta_pct":    delta_pct(base.fps_mean, opt.fps_mean),
        "base_p50_ms":      round(base.frame_ms_median, 3),
        "opt_p50_ms":       round(opt.frame_ms_median, 3),
        "frame_p50_delta_pct": delta_pct(base.frame_ms_median, opt.frame_ms_median),
        "base_p95_ms":      round(base.frame_ms_p95, 3),
        "opt_p95_ms":       round(opt.frame_ms_p95, 3),
        "frame_p95_delta_pct": delta_pct(base.frame_ms_p95, opt.frame_ms_p95),
        "base_p99_ms":      round(base.frame_ms_p99, 3),
        "opt_p99_ms":       round(opt.frame_ms_p99, 3),
        "frame_p99_delta_pct": delta_pct(base.frame_ms_p99, opt.frame_ms_p99),
    }

    # Marker 级对比
    all_markers = sorted(set(base.markers) | set(opt.markers))
    marker_cmp = []
    for name in all_markers:
        b_s = base.markers.get(name)
        o_s = opt.markers.get(name)
        b_mean = b_s.ms_mean if b_s else 0.0
        o_mean = o_s.ms_mean if o_s else 0.0
        if b_mean < 0.05 and o_mean < 0.05:   # 低于 0.05ms 忽略
            continue
        delta = delta_pct(b_mean, o_mean)
        marker_cmp.append({
            "name": name,
            "base_mean_ms": round(b_mean, 3),
            "opt_mean_ms":  round(o_mean, 3),
            "delta_pct":    delta,
            "base_p95_ms":  round(b_s.ms_p95, 3) if b_s else 0.0,
            "opt_p95_ms":   round(o_s.ms_p95, 3) if o_s else 0.0,
        })
    # 按 base_mean 降序
    marker_cmp.sort(key=lambda x: x["base_mean_ms"], reverse=True)

    # Thread 级对比
    all_threads = sorted(set(base.threads) | set(opt.threads))
    thread_cmp = []
    for tname in all_threads:
        b_t = base.threads.get(tname)
        o_t = opt.threads.get(tname)
        b_ms = b_t.ms_mean if b_t else 0.0
        o_ms = o_t.ms_mean if o_t else 0.0
        if b_ms < 0.1 and o_ms < 0.1:
            continue
        thread_cmp.append({
            "name": tname,
            "base_mean_ms": round(b_ms, 3),
            "opt_mean_ms":  round(o_ms, 3),
            "delta_pct":    delta_pct(b_ms, o_ms),
            "base_p95_ms":  round(b_t.ms_p95, 3) if b_t else 0.0,
            "opt_p95_ms":   round(o_t.ms_p95, 3) if o_t else 0.0,
        })
    thread_cmp.sort(key=lambda x: x["base_mean_ms"], reverse=True)

    return {
        "frame": frame_cmp,
        "markers": marker_cmp,
        "threads": thread_cmp,
    }


# ---------------------------------------------------------------------------
# CLI（独立运行）
# ---------------------------------------------------------------------------
def main():
    import argparse
    parser = argparse.ArgumentParser(description="Unity Profiler .pdata 分析")
    parser.add_argument("pdata", help=".pdata 文件路径")
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    args = parser.parse_args()

    pdata_file = parse_pdata(args.pdata)
    stats = analyze_pdata(pdata_file)

    if args.json:
        out = {
            "frame_count": stats.frame_count,
            "fps_mean": stats.fps_mean,
            "frame_ms_median": stats.frame_ms_median,
            "frame_ms_p95":    stats.frame_ms_p95,
            "frame_ms_p99":    stats.frame_ms_p99,
            "markers": {
                n: {
                    "ms_mean":       round(m.ms_mean, 3),
                    "ms_median":     round(m.ms_median, 3),
                    "ms_p95":        round(m.ms_p95, 3),
                    "present_frames": m.present_frames,
                }
                for n, m in stats.markers.items()
            },
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
    else:
        print(f"文件: {stats.file_path}")
        print(f"帧数: {stats.frame_count}  帧均FPS: {stats.fps_mean:.1f}")
        print(f"帧时长: P50={stats.frame_ms_median:.2f}ms  P95={stats.frame_ms_p95:.2f}ms")
        print("\n关键 Marker (帧均 ms):")
        for name, m in sorted(stats.markers.items(), key=lambda x: x[1].ms_mean, reverse=True):
            print(f"  {name:<48} {m.ms_mean:>8.3f} ms  P95={m.ms_p95:.3f} ms  ({m.present_frames}/{stats.frame_count} 帧)")


if __name__ == "__main__":
    main()
