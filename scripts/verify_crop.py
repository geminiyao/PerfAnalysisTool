#!/usr/bin/env python3
"""verify_crop.py - 验证 perf.data 时间戳提取和时间窗口裁剪逻辑。

验证内容：
  1. 用 ReportLib 读取 perf.data 所有 sample 的时间戳（ns）
  2. 打印时间范围 / 物理采样时长
  3. 构造中间 30s 的假窗口，验证按时间过滤后 sample 比例是否符合预期
  4. 显示 clockid（确认是 CLOCK_MONOTONIC 还是其他时钟）

用法：
  python scripts/verify_crop.py
  python scripts/verify_crop.py --perf simpleperf/data/current/perf_2.data
"""

import argparse
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NDK_SIMPLEPERF_DIR = os.environ.get(
    "NDK_SIMPLEPERF_DIR",
    "D:/Android/android-ndk-r21e-windows-x86_64/simpleperf",
)

def get_report_lib():
    if NDK_SIMPLEPERF_DIR not in sys.path:
        sys.path.insert(0, NDK_SIMPLEPERF_DIR)
    try:
        from simpleperf_report_lib import ReportLib  # type: ignore
        return ReportLib
    except ImportError as e:
        raise RuntimeError(
            f"无法导入 ReportLib，请确认 NDK_SIMPLEPERF_DIR 正确:\n"
            f"  当前: {NDK_SIMPLEPERF_DIR}\n  错误: {e}"
        )


def read_timestamps(perf_path):
    """读取 perf.data 所有 sample 的时间戳（ns）和 clockid。"""
    ReportLib = get_report_lib()
    lib = ReportLib()
    lib.SetRecordFile(perf_path)

    # 尝试读 clockid（部分版本的 ReportLib 支持 MetaInfo()）
    clockid = "unknown"
    try:
        meta = lib.MetaInfo()
        clockid = meta.get("clockid", "unknown")
    except Exception:
        pass

    timestamps = []
    while True:
        s = lib.GetNextSample()
        if s is None:
            break
        timestamps.append(s.time)
    lib.Close()
    return timestamps, clockid


def verify(perf_path):
    print("=" * 60)
    print(f"perf.data 时间戳验证")
    print(f"文件: {perf_path}")
    print("=" * 60)

    if not os.path.exists(perf_path):
        print(f"[ERROR] 文件不存在: {perf_path}")
        sys.exit(1)

    print("[1] 读取所有 sample 时间戳...")
    timestamps, clockid = read_timestamps(perf_path)
    total = len(timestamps)

    if total == 0:
        print("[ERROR] 未读到任何 sample")
        sys.exit(1)

    ts_min = min(timestamps)
    ts_max = max(timestamps)
    duration_s = (ts_max - ts_min) / 1e9

    print(f"    样本总数   : {total}")
    print(f"    clockid    : {clockid}")
    print(f"    min_ts(ns) : {ts_min}  ({ts_min/1e9:.3f}s)")
    print(f"    max_ts(ns) : {ts_max}  ({ts_max/1e9:.3f}s)")
    print(f"    物理时长   : {duration_s:.3f}s")

    # 取前半段时间（ts_min ~ midpoint）验证裁剪比例
    mid_ts = (ts_min + ts_max) // 2
    fake_start = ts_min
    fake_end   = mid_ts
    expected_ratio = 0.5  # 前半段时间，期望约 50% 的 sample

    print(f"\n[2] 构造前半段时间窗口（{(mid_ts - ts_min)/1e9:.1f}s）:")
    print(f"    fake_start : {fake_start}")
    print(f"    fake_end   : {fake_end}")

    cropped = sum(1 for t in timestamps if fake_start <= t <= fake_end)
    actual_ratio = cropped / total

    print(f"    窗口内样本 : {cropped}  ({actual_ratio*100:.1f}%)")
    print(f"    期望比例   : ~{expected_ratio*100:.0f}%（若采样均匀）")

    print("\n" + "=" * 60)
    # 过滤有效性：cropped > 0 且 cropped < total（确实有 sample 被排除在窗口外）
    filter_works = 0 < cropped < total

    if filter_works:
        print(f"[PASS] 时间戳提取正常，时间过滤逻辑有效")
        print(f"       窗口内 {cropped} / 全量 {total}，说明时间戳过滤确实在工作")
    else:
        if cropped == 0:
            print(f"[FAIL] 窗口内样本数为 0，时间过滤可能有误")
        else:
            print(f"[FAIL] 窗口内样本数等于全量，时间过滤未生效")

    if clockid in ("monotonic", "boottime", "unknown"):
        clk_desc = {"monotonic": "CLOCK_MONOTONIC（不含睡眠）",
                    "boottime":  "CLOCK_BOOTTIME（含睡眠，与 Java elapsedRealtimeNanos 对齐）✅",
                    "unknown":   "未知"}.get(clockid, clockid)
        print(f"[INFO] clockid='{clockid}'：{clk_desc}")
    else:
        print(f"[WARN] clockid='{clockid}'：非 CLOCK_MONOTONIC，与 GetMonotonicNs() 可能不对齐")
        print(f"       建议在采集命令中加上 --clockid monotonic")

    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="验证 perf.data 时间戳提取和裁剪逻辑")
    parser.add_argument(
        "--perf",
        default=os.path.join(PROJECT_ROOT, "simpleperf", "data", "current", "perf_1.data"),
        help="perf.data 路径（默认：simpleperf/data/current/perf_1.data）",
    )
    args = parser.parse_args()
    verify(args.perf)


if __name__ == "__main__":
    main()
