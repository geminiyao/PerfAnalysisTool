#!/usr/bin/env python
"""collect_perf.py - Wrapper around the NDK app_profiler.py for data collection.

NOTE: This step requires a connected, rooted (or debuggable-app) Android device
with adb. It CANNOT be validated on a host without a device. It delegates the
actual recording to the official ``app_profiler.py`` shipped in the NDK and then
organizes output into ``data/<label>/``.

Workflow:
  1. (optional) Lock CPU frequency to remove DVFS noise (performance governor).
  2. Run ``app_profiler.py -p <package> -r "<record_options>" -lib <unstripped>``.
  3. Move perf.data + binary_cache into data/<label>/.
  4. Repeat ``--runs`` times for averaging.

Usage:
    python scripts/collect_perf.py --package com.your.game --label baseline \
        --runs 3 --duration 30 --event cpu-cycles:u --freq 1000 \
        --lib /path/to/unstripped_libs
"""

import argparse
import os
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from simpleperf_analyzer import config

APP_PROFILER = os.path.join(config.NDK_SIMPLEPERF_DIR, "app_profiler.py")


def _adb(args):
    return subprocess.run(["adb"] + args, capture_output=True, text=True)


def lock_cpu_freq(enable):
    """Best-effort governor lock. Requires root. Failures are non-fatal."""
    governor = "performance" if enable else "schedutil"
    cmd = ("for c in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; "
           "do echo %s > $c; done" % governor)
    res = _adb(["shell", "su", "-c", cmd])
    if res.returncode != 0:
        print("  [warn] could not set governor (need root):", res.stderr.strip())
    else:
        print("  CPU governor set to", governor)


def run_once(args, run_index, out_dir):
    perf_data = os.path.join(out_dir, "perf_%d.data" % run_index)
    record_options = "-e %s -f %d -g --duration %d" % (
        args.event, args.freq, args.duration)
    cmd = [sys.executable, APP_PROFILER,
           "-p", args.package,
           "-r", record_options,
           "-o", perf_data]
    if args.lib:
        cmd += ["-lib", args.lib]
    if args.ndk_path:
        cmd += ["--ndk_path", args.ndk_path]
    print("  Running:", " ".join(cmd))
    res = subprocess.run(cmd)
    if res.returncode != 0:
        raise RuntimeError("app_profiler.py failed for run %d" % run_index)

    # app_profiler writes binary_cache next to cwd; move it under run dir.
    if os.path.isdir("binary_cache"):
        dst = os.path.join(out_dir, "binary_cache")
        if os.path.isdir(dst):
            shutil.rmtree(dst)
        shutil.move("binary_cache", dst)
    return perf_data


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--package", required=True, help="android app package name")
    ap.add_argument("--label", required=True, help="label for this collection set")
    ap.add_argument("--runs", type=int, default=1, help="number of repeated runs")
    ap.add_argument("--duration", type=int, default=30, help="record duration (s)")
    ap.add_argument("--event", default="cpu-cycles:u",
                    help="perf event, e.g. cpu-cycles:u or task-clock:u")
    ap.add_argument("--freq", type=int, default=1000, help="sampling frequency (Hz)")
    ap.add_argument("--lib", default=None, help="dir of unstripped native libs (-lib)")
    ap.add_argument("--ndk-path", default=config.NDK_PATH, help="ndk release path")
    ap.add_argument("--lock-freq", action="store_true",
                    help="lock CPU governor to performance during collection")
    ap.add_argument("--data-root", default="data", help="output root dir")
    args = ap.parse_args()

    if not os.path.isfile(APP_PROFILER):
        sys.exit("app_profiler.py not found at %s (check NDK_SIMPLEPERF_DIR)" % APP_PROFILER)

    # device presence check
    dev = _adb(["devices"])
    print(dev.stdout)
    if "device\n" not in dev.stdout and "device\r\n" not in dev.stdout:
        sys.exit("No adb device detected. Connect a device before collecting.")

    out_dir = os.path.join(args.data_root, args.label)
    os.makedirs(out_dir, exist_ok=True)

    if args.lock_freq:
        lock_cpu_freq(True)
    try:
        collected = []
        for i in range(1, args.runs + 1):
            print("=== Run %d/%d ===" % (i, args.runs))
            collected.append(run_once(args, i, out_dir))
        print("Collected:")
        for c in collected:
            print("  ", c)
        print("Done. Pass these to scripts/compare.py or batch_compare.py.")
    finally:
        if args.lock_freq:
            lock_cpu_freq(False)


if __name__ == "__main__":
    main()
