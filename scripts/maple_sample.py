#!/usr/bin/env python3
"""maple_sample.py - Maple ILOpt 一键同步采样脚本

使用方式：
    python scripts/maple_sample.py \\
        --label maple_base \\
        --duration 60 \\
        --scene StressTestBattleSimpleMode \\
        --tools simpleperf,perfetto \\
        [--runs 1] \\
        [--device <serial>]

流程：
    1. 获取游戏进程 PID
    2. 启动 simpleperf（后台持续采样，--no-duration）
    3. 启动 perfetto（后台持续录制，可选）
    4. 发 am start Intent 触发游戏进入 CombinedProfile 采样
    5. 轮询 logcat，等待 [CombinedProfile] END 日志（含 mono_ns）
    6. 停止 simpleperf / perfetto
    7. adb pull perf.data / trace.pftrace / *.pdata
    8. 保存 meta.json

输出目录：output/maple/<label>_<device>_<date>_<time>/
"""

import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import time
import shutil

# ---------------------------------------------------------------------------
# 常量配置
# ---------------------------------------------------------------------------
PACKAGE_NAME       = "com.tencent.aoeyz"
PROFILE_ACTIVITY   = "com.tencent.aoeyz.MainActivity"
INTENT_ACTION      = "com.aoe.EXTERNAL_PROFILE"

# 设备上 simpleperf 路径（如不存在，先 push 一次）
DEVICE_SIMPLEPERF  = "/data/local/tmp/simpleperf"
DEVICE_PERF_DATA   = "/data/local/tmp/perf.data"
DEVICE_PDATA_DIR   = "/storage/emulated/0/Android/data/com.tencent.aoeyz/files/doc/log/profile_data/"

# PC 端 simpleperf 脚本目录
SCRIPT_DIR         = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT       = os.path.dirname(SCRIPT_DIR)
SIMPLEPERF_BIN_DIR = os.path.join(PROJECT_ROOT, "simpleperf", "bin", "android")

# perfetto 脚本路径（复用现有脚本）
PERFETTO_SCRIPT    = r"g:\AOEYZ_Trunk\Tools\AndroidPerfettoScripts\record_android_trace.py"
DEVICE_TRACE_PATH  = "/data/misc/perfetto-traces/trace.pftrace"

# perfetto 采样参数
PERFETTO_EVENTS    = [
    "sched", "freq", "idle",
    "am", "wm", "gfx", "view",
    "binder_driver", "hal",
    "dalvik", "camera", "input", "res", "memory",
]

OUTPUT_BASE        = os.path.join(PROJECT_ROOT, "output", "maple")

# ---------------------------------------------------------------------------
# ADB helpers
# ---------------------------------------------------------------------------
def adb(*args, device=None, capture=False, check=False):
    cmd = ["adb"]
    if device:
        cmd += ["-s", device]
    cmd += list(args)
    if capture:
        result = subprocess.run(cmd, capture_output=True, text=True)
        if check and result.returncode != 0:
            raise RuntimeError(f"adb command failed: {' '.join(cmd)}\n{result.stderr}")
        return result
    else:
        return subprocess.run(cmd, check=check)


def adb_shell(cmd, device=None, capture=False, check=False):
    return adb("shell", cmd, device=device, capture=capture, check=check)


def get_device_serial():
    result = subprocess.run(["adb", "devices"], capture_output=True, text=True)
    lines = [l.strip() for l in result.stdout.splitlines() if "\tdevice" in l]
    if not lines:
        raise RuntimeError("没有检测到已连接的 adb 设备，请先 adb connect 或连接 USB")
    if len(lines) > 1:
        print("[WARN] 检测到多个设备，使用第一个：" + lines[0].split("\t")[0])
    return lines[0].split("\t")[0]


def get_pid(package, device=None):
    r = adb_shell(f"pidof {package}", device=device, capture=True)
    pid_str = r.stdout.strip()
    if not pid_str:
        return None
    # pidof 可能返回多个 pid，取第一个
    return pid_str.split()[0]


def get_device_model(device=None):
    r = adb_shell("getprop ro.product.model", device=device, capture=True)
    return r.stdout.strip().replace(" ", "_")


def get_device_abi(device=None):
    r = adb_shell("getprop ro.product.cpu.abi", device=device, capture=True)
    return r.stdout.strip()


# ---------------------------------------------------------------------------
# simpleperf helpers
# ---------------------------------------------------------------------------
def push_simpleperf_if_needed(abi, device=None):
    """如果设备上没有 simpleperf，则从 PC 端推送对应 ABI 版本。"""
    r = adb_shell(f"ls {DEVICE_SIMPLEPERF}", device=device, capture=True)
    if DEVICE_SIMPLEPERF in r.stdout:
        return
    abi_map = {"arm64-v8a": "arm64", "armeabi-v7a": "arm", "x86_64": "x86_64", "x86": "x86"}
    arch = abi_map.get(abi, "arm64")
    local_bin = os.path.join(SIMPLEPERF_BIN_DIR, arch, "simpleperf")
    if not os.path.exists(local_bin):
        print(f"[WARN] 未找到本地 simpleperf：{local_bin}，跳过 push，假设设备已有")
        return
    print(f"[INFO] 推送 simpleperf ({arch}) 到设备...")
    adb("push", local_bin, DEVICE_SIMPLEPERF, device=device, check=True)
    adb_shell(f"chmod +x {DEVICE_SIMPLEPERF}", device=device)


_NDK_SIMPLEPERF_DIR = os.environ.get(
    "NDK_SIMPLEPERF_DIR",
    "D:/Android/android-ndk-r21e-windows-x86_64/simpleperf"
)
NDK_APP_PROFILER = os.path.join(_NDK_SIMPLEPERF_DIR, "app_profiler.py")

# 本地符号文件目录（-lib 参数），放 libil2cpp.so 等带符号的 so
SYMBOL_LIB_DIR = os.path.join(PROJECT_ROOT, "output", "maple", "symbols")


def _normalize_symbol_dir(lib_dir):
    """把 symbols/ 目录里的 *.dbg.so 兼容处理为 *.so。
    在 lib_dir 旁边创建一个临时目录 _lib_normalized/，
    把所有 so 文件（包括 dbg.so → so 的别名）软复制进去。
    返回规范化后的目录路径。
    """
    if not lib_dir or not os.path.isdir(lib_dir):
        return lib_dir

    import glob, shutil
    normalized = os.path.join(os.path.dirname(lib_dir), "_lib_normalized")
    os.makedirs(normalized, exist_ok=True)

    copied = 0
    for src in glob.glob(os.path.join(lib_dir, "*.so")) + \
               glob.glob(os.path.join(lib_dir, "*.dbg.so")):
        basename = os.path.basename(src)
        # libfoo.dbg.so → libfoo.so
        if basename.endswith(".dbg.so"):
            dest_name = basename[:-len(".dbg.so")] + ".so"
        else:
            dest_name = basename
        dest = os.path.join(normalized, dest_name)
        if not os.path.exists(dest) or os.path.getmtime(src) > os.path.getmtime(dest):
            shutil.copy2(src, dest)
            copied += 1

    if copied:
        print(f"[INFO] 符号规范化: {copied} 个文件复制到 {normalized}")
    return normalized



# ---------------------------------------------------------------------------
def start_simpleperf(pid, device=None, out_dir=None, symbol_dir=None, duration=None):
    """用 app_profiler.py 采集 simpleperf 数据。
    duration 秒后自动停止，并 pull perf.data + binary_cache 到 out_dir。
    返回 Popen 对象（在后台运行，调用 stop_simpleperf 等待其完成）。
    """
    if not os.path.exists(NDK_APP_PROFILER):
        raise FileNotFoundError(f"app_profiler.py 不存在: {NDK_APP_PROFILER}")

    perf_out = os.path.join(out_dir, "perf.data") if out_dir else "perf.data"
    lib_dir  = _normalize_symbol_dir(symbol_dir or SYMBOL_LIB_DIR)

    # 采集时长 = 游戏采样窗口 + 15s 余量（start Intent 延迟 + stop 处理时间）
    rec_duration = (duration or 60) + 15

    record_opts = (
        f"-e cpu-clock"
        f" --call-graph fp"
        f" --clockid boottime"
        f" -f 4000"
        f" --duration {rec_duration}"
    )

    cmd = [sys.executable, NDK_APP_PROFILER,
           "-p", PACKAGE_NAME,
           "-r", record_opts,
           "-o", "perf.data",   # 相对路径，输出到 cwd=out_dir
           "--ndk_path", os.path.dirname(os.path.dirname(_NDK_SIMPLEPERF_DIR)),
    ]
    if lib_dir and os.path.isdir(lib_dir):
        cmd += ["-lib", lib_dir]
        print(f"[INFO] 符号目录: {lib_dir}")

    # 设备通过 ANDROID_SERIAL 环境变量传递
    env = dict(os.environ)
    if device:
        env["ANDROID_SERIAL"] = device

    # 以 out_dir 为 cwd，binary_cache 会在 out_dir/binary_cache/ 下生成
    print(f"[INFO] 启动 simpleperf (app_profiler.py): {PACKAGE_NAME}，采集 {rec_duration}s")
    proc = subprocess.Popen(cmd, env=env, cwd=out_dir or os.getcwd())

    # 等待 app_profiler.py 初始化完成（push simpleperf + 建连接）
    # 期间它会 push libil2cpp.dbg.so（1.3GB），需要等够
    print(f"[INFO] 等待 simpleperf 初始化（push 符号文件，可能需要 20-30s）...")
    for i in range(60):  # 最多等 60s
        time.sleep(1.0)
        if proc.poll() is not None:
            print(f"[WARN] app_profiler.py 意外退出（returncode={proc.returncode}）")
            return None
        # 检查设备上 simpleperf 是否在跑
        r = subprocess.run(["adb"] + (["-s", device] if device else []) + ["shell", "pidof simpleperf"],
                           capture_output=True, text=True, timeout=5)
        if r.stdout.strip():
            print(f"[INFO] simpleperf 运行中 (PID={r.stdout.strip()})")
            return proc
    print(f"[WARN] 等待超时，simpleperf 可能未启动")
    return proc

    # 等待 simpleperf 初始化（app_profiler.py 需要 push 二进制 + 等待 app 就绪）
    time.sleep(5.0)

    # 验证进程还在
    if proc.poll() is not None:
        out = proc.stdout.read().decode(errors='replace') if proc.stdout else ''
        print(f"[WARN] app_profiler.py 意外退出: {out[:300]}")
        return None

    print(f"[INFO] simpleperf 运行中 (app_profiler PID={proc.pid})")
    return proc




def stop_simpleperf(proc=None, device=None):
    """等待 app_profiler.py 自然结束（固定 duration 模式，采集完后自动 pull）。"""
    print("[INFO] 等待 simpleperf 完成采集和 pull...")
    if proc is None or proc.poll() is not None:
        print("[INFO] simpleperf 已完成")
        return
    try:
        proc.wait(timeout=120)  # 最多等 2 分钟（包含 pull binary_cache 时间）
        print("[INFO] simpleperf 采集完成")
    except subprocess.TimeoutExpired:
        print("[WARN] simpleperf 超时，强制终止")
        proc.kill()






# ---------------------------------------------------------------------------
# perfetto helpers
# ---------------------------------------------------------------------------
def start_perfetto(label, out_dir, duration, device=None):
    """调用 record_android_trace.py，后台启动 perfetto。
    使用固定时长 duration+15s，让脚本自然结束后自动 pull。
    返回 (Popen, out_dir)。
    """
    if not os.path.exists(PERFETTO_SCRIPT):
        print(f"[WARN] 未找到 perfetto 脚本：{PERFETTO_SCRIPT}，跳过 perfetto 采样")
        return None, None

    perfetto_duration = f"{duration + 15}s"  # 多录 15s，确保覆盖整个采样窗口
    cmd = [
        sys.executable, PERFETTO_SCRIPT,
        "-t", perfetto_duration,
        "-b", "64mb",
        "-n",                # 不自动打开浏览器
        "-o", out_dir,       # 输出到采样目录
        "--sideload",        # 强制使用 /data/local/tmp/（华为无 /data/misc/perfetto-traces/）
        "-a", PACKAGE_NAME,
    ] + PERFETTO_EVENTS

    if device:
        cmd += ["--serial", device]

    print(f"[INFO] 启动 perfetto（{perfetto_duration}，后台）...")
    kwargs = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
    proc = subprocess.Popen(cmd, **kwargs)
    time.sleep(3.0)  # 等待 perfetto daemon 初始化
    return proc, out_dir


def stop_perfetto(proc, device=None):
    """等待 perfetto 自然结束（固定时长模式），超时则强制终止。"""
    if proc is None:
        return
    print("[INFO] 等待 perfetto 完成 flush 和 pull...")
    try:
        proc.wait(timeout=60)  # 最多等 60s（含 adb pull 时间）
    except subprocess.TimeoutExpired:
        print("[WARN] perfetto 超时，强制终止")
        proc.kill()
    print("[INFO] perfetto 已停止")
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
    # 等待设备写入完毕
    time.sleep(2.0)
    print("[INFO] perfetto 已停止")


# ---------------------------------------------------------------------------
# logcat helpers
# ---------------------------------------------------------------------------
def parse_mono_ns(logcat_line, tag="END"):
    """从 logcat 行中解析 mono_ns 值。
    期望格式: [CombinedProfile] END ... mono_ns=<数字>
    """
    m = re.search(r"mono_ns=(\d+)", logcat_line)
    return int(m.group(1)) if m else None


def parse_frame_count(logcat_line):
    """从 END 行解析 frameCount。"""
    m = re.search(r"frameCount=(\d+)", logcat_line)
    return int(m.group(1)) if m else None


def parse_profile_name(logcat_line):
    """从 START/END 行解析 name=。"""
    m = re.search(r"name=(\S+)", logcat_line)
    return m.group(1) if m else ""


def clear_logcat(device=None):
    adb("logcat", "-c", device=device)


def wait_for_combined_profile_end(timeout=300, device=None, duration=60, profile_name_hint=""):
    """
    等待 CombinedProfile 采样完成，返回 (profile_name, mono_ns_start, mono_ns_end, frame_count)。

    策略：
      1. 监听 ProfileCommandBridge:V 的 GetMonotonicNs() 日志（Java 层，V 级，华为不过滤）
         出现即代表 StartExternalCombinedProfile 已被 Lua 调用。
      2. 取该 V 日志里的 ns 值作为 mono_ns_start。
      3. 等待 duration 秒后（游戏 Lua 的 TickExternalCombinedProfile 到时自动结束），
         再监听第二次 GetMonotonicNs() 作为 mono_ns_end（StopExternalCombinedProfile 时调用）。
      4. 如果能读到 randolfLog 的 START/END 则优先用，否则退回上述方案。

    timeout: 最多等待秒数
    duration: 游戏侧设定的采样时长（用于估算何时等 END）
    profile_name_hint: 触发时传的 name 参数
    """
    print("[INFO] 等待采样开始（监听 ProfileCommandBridge GetMonotonicNs）...")
    mono_ns_start = None
    mono_ns_end = None
    profile_name = profile_name_hint
    frame_count = None
    deadline = time.time() + timeout

    # ---- 策略1: 先尝试 Unity Error 级别日志（Lua 改为 Error 后可用）----
    t0 = time.time()
    while time.time() < min(deadline, t0 + 15):
        r = adb("logcat", "-d", "-s", "Unity:E", device=device, capture=True)
        for line in r.stdout.splitlines():
            if "[CombinedProfile] START" in line:
                mono_ns_start = parse_mono_ns(line, "START")
                pn = parse_profile_name(line)
                if pn:
                    profile_name = pn
                print(f"[INFO] 检测到 START (Unity:E): name={profile_name} mono_ns={mono_ns_start}")
                break
        if mono_ns_start is not None:
            break
        time.sleep(0.5)

    # ---- 策略2: 退回 ProfileCommandBridge V 级日志（Lua 未热更时的备用）----
    if mono_ns_start is None:
        print("[INFO] Unity:E 未检测到，改用 ProfileCommandBridge:V 备用方案...")
        t0 = time.time()
        while time.time() < min(deadline, t0 + 15):
            r = adb("logcat", "-d", "-s", "ProfileCommandBridge:V", device=device, capture=True)
            for line in r.stdout.splitlines():
                if "GetMonotonicNs()" in line:
                    m = re.search(r"GetMonotonicNs\(\) = (\d+)", line)
                    if m:
                        mono_ns_start = int(m.group(1))
                        print(f"[INFO] 检测到 START (ProfileCommandBridge): mono_ns={mono_ns_start}")
                        break
            if mono_ns_start is not None:
                break
            time.sleep(0.5)

    if mono_ns_start is None:
        raise RuntimeError("超时未检测到采样开始信号（尝试了 randolfLog 和 ProfileCommandBridge）")

    # ---- 等待采样结束 ----
    print(f"[INFO] 等待采样结束（{duration}s 后）...")
    # 先等 duration 秒，然后主动发 Stop Intent（兼容热更场景下 Tick 失效的情况）
    wait_until = time.time() + duration
    while time.time() < min(deadline, wait_until):
        time.sleep(1.0)
        elapsed = int(time.time() - t0)
        if elapsed % 10 == 0:
            print(f"[INFO] 已等待 {elapsed}s / {duration}s...")

    # 主动发 stop，触发 StopExternalCombinedProfile（含 GetMonotonicNs + TraceEnd）
    stop_combined_profile(profile_name_hint or profile_name, device=device)
    time.sleep(3.0)  # 等游戏处理完 stop，日志写入 logcat

    # ---- 策略1: Unity Error 级别 END ----
    r = adb("logcat", "-d", "-s", "Unity:E", device=device, capture=True)
    for line in r.stdout.splitlines():
        if "[CombinedProfile] END" in line:
            if not profile_name or profile_name in line:
                mono_ns_end = parse_mono_ns(line, "END")
                frame_count = parse_frame_count(line)
                print(f"[INFO] 检测到 END (Unity:E): mono_ns={mono_ns_end} frameCount={frame_count}")
                return profile_name, mono_ns_start, mono_ns_end, frame_count

    # ---- 策略2: ProfileCommandBridge 第二次 GetMonotonicNs（备用）----
    print("[INFO] Unity:E END 未检测到，从 ProfileCommandBridge 日志取 END 时间戳...")
    r = adb("logcat", "-d", "-s", "ProfileCommandBridge:V", device=device, capture=True)
    ns_values = []
    for line in r.stdout.splitlines():
        if "GetMonotonicNs()" in line:
            m = re.search(r"GetMonotonicNs\(\) = (\d+)", line)
            if m:
                ns_values.append(int(m.group(1)))
    if len(ns_values) >= 2:
        # 第一个是 START，最后一个是 END
        mono_ns_start = ns_values[0]
        mono_ns_end   = ns_values[-1]
        print(f"[INFO] 从 ProfileCommandBridge 取到 START={mono_ns_start} END={mono_ns_end}")
        duration_actual = (mono_ns_end - mono_ns_start) / 1e9
        print(f"[INFO] 实际采样时长: {duration_actual:.2f}s")
    elif len(ns_values) == 1:
        print(f"[WARN] 只找到一个 GetMonotonicNs，END 可能还未触发，使用 START 值估算")
        mono_ns_end = mono_ns_start + int(duration * 1e9)

    return profile_name, mono_ns_start, mono_ns_end, frame_count


# ---------------------------------------------------------------------------
# Intent trigger
# ---------------------------------------------------------------------------
def trigger_combined_profile(name, duration, scene, device=None):
    """通过 am start 触发游戏进行 CombinedProfile 采样。"""
    intent_cmd = (
        f"am start"
        f" -n {PACKAGE_NAME}/{PROFILE_ACTIVITY}"
        f" -a {INTENT_ACTION}"
        f" --es cmd start_combined_profile"
        f" --es name {name}"
        f" --ei duration {duration}"
        f" --es scene {scene}"
    )
    print(f"[INFO] 发送 Intent: name={name} duration={duration}s scene={scene}")
    adb_shell(intent_cmd, device=device, check=True)


def stop_combined_profile(name, device=None):
    """主动发 stop_combined_profile Intent，触发游戏端 StopExternalCombinedProfile。
    用于在热更场景下游戏 Tick 计时失效时，由脚本侧主动停止采集。
    """
    intent_cmd = (
        f"am start"
        f" -n {PACKAGE_NAME}/{PROFILE_ACTIVITY}"
        f" -a {INTENT_ACTION}"
        f" --es cmd stop_combined_profile"
        f" --es name {name}"
    )
    print(f"[INFO] 发送 Stop Intent: name={name}")
    adb_shell(intent_cmd, device=device)




# ---------------------------------------------------------------------------
# Pull output files
# ---------------------------------------------------------------------------
def pull_output_files(out_dir, device=None, profile_name=None):
    """从设备拉取 perf.data、pftrace、pdata 文件。"""
    # perf.data（由 app_profiler.py 直接输出到 out_dir）
    perf_local = os.path.join(out_dir, "perf.data")
    if os.path.exists(perf_local):
        print(f"[INFO] perf.data -> {perf_local}  ({os.path.getsize(perf_local)//1024}KB)")
    else:
        print("[WARN] perf.data 不存在（app_profiler.py 可能未正常输出）")

    # pftrace（由 record_android_trace.py 自动 pull 到 out_dir，扫描即可）
    import glob
    pftrace_files = glob.glob(os.path.join(out_dir, "*.pftrace"))
    if pftrace_files:
        print(f"[INFO] trace.pftrace -> {pftrace_files[0]}")
    else:
        print("[WARN] 未找到 .pftrace 文件（perfetto 可能未成功录制）")

    # pdata / raw（Unity Profiler，只拉本次采集对应的文件）
    print(f"[INFO] 等待 Unity Profiler 文件写入完成（5s）...")
    time.sleep(5.0)
    print(f"[INFO] 拉取 Unity Profiler 文件...")
    r = adb_shell(
        f"ls {DEVICE_PDATA_DIR}*.pdata {DEVICE_PDATA_DIR}*.raw 2>/dev/null",
        device=device, capture=True
    )
    all_files = [f.strip() for f in r.stdout.splitlines()
                 if f.strip().endswith((".pdata", ".raw"))]

    # 只拉 profile_name 对应的文件（文件名以 profile_name 开头）
    if profile_name:
        pdata_files = [f for f in all_files
                       if os.path.basename(f).startswith(profile_name)]
        if not pdata_files:
            # 回退：拉全部（兜底）
            print(f"[WARN] 未找到名称匹配 '{profile_name}' 的文件，拉取全部")
            pdata_files = all_files
    else:
        pdata_files = all_files
    for pf in pdata_files:
        local_pf = os.path.join(out_dir, os.path.basename(pf))
        adb("pull", pf, local_pf, device=device)
        print(f"[INFO] {os.path.basename(pf)} -> {local_pf}")

    if not pdata_files:
        print("[WARN] 未找到 .pdata 文件，Unity Profiler 可能未采集或路径不同")


# ---------------------------------------------------------------------------
# 单次采样
# ---------------------------------------------------------------------------
def run_single(args, run_index, device, device_model):
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    run_label = f"{args.label}_{device_model}_{ts}"
    if args.runs > 1:
        run_label += f"_run{run_index+1}"

    out_dir = os.path.join(OUTPUT_BASE, run_label)
    os.makedirs(out_dir, exist_ok=True)
    print(f"\n{'='*60}")
    print(f"[INFO] 开始采样 run {run_index+1}/{args.runs}: {run_label}")
    print(f"[INFO] 输出目录: {out_dir}")
    print(f"{'='*60}")

    # 1. 获取 PID
    pid = get_pid(PACKAGE_NAME, device=device)
    if not pid:
        raise RuntimeError(f"未找到进程 {PACKAGE_NAME}，请先启动游戏并进入测试场景")
    print(f"[INFO] 游戏 PID: {pid}")

    # 2. 清空 logcat
    clear_logcat(device=device)

    # 3. 启动 simpleperf（通过 app_profiler.py，自动收集 binary_cache）
    sp_proc = None
    use_simpleperf = "simpleperf" in args.tools
    if use_simpleperf:
        sp_proc = start_simpleperf(pid, device=device, out_dir=out_dir,
                                   symbol_dir=getattr(args, 'symbols', None),
                                   duration=args.duration)

    # 4. 启动 perfetto
    pf_proc = None
    use_perfetto = "perfetto" in args.tools
    if use_perfetto:
        pf_proc, _ = start_perfetto(run_label, out_dir, args.duration, device=device)

    # 5. 触发游戏采样
    profile_name = f"{args.label}_{run_index+1:03d}"
    trigger_combined_profile(
        name=profile_name,
        duration=args.duration,
        scene=args.scene,
        device=device,
    )

    # 6. 等待 END 日志
    try:
        prof_name, mono_ns_start, mono_ns_end, frame_count = wait_for_combined_profile_end(
            timeout=args.duration + 120,
            device=device,
            duration=args.duration,
            profile_name_hint=profile_name,
        )
    except RuntimeError as e:
        print(f"[ERROR] {e}")
        # 即便超时也尝试停止采样工具
    else:
        # 7. 停止采样工具
        if use_simpleperf:
            stop_simpleperf(proc=sp_proc, device=device)
        if use_perfetto:
            stop_perfetto(pf_proc, device=device)

        # 8. 拉取文件（perf.data 已由 app_profiler.py 输出到 out_dir，只需拉 pdata）
        pull_output_files(out_dir, device=device, profile_name=prof_name)

        # 9. 保存 meta.json
        meta = {
            "run_label": run_label,
            "label": args.label,
            "scene": args.scene,
            "duration_sec": args.duration,
            "profile_name": prof_name,
            "device": device_model,
            "device_serial": device,
            "pid": pid,
            "mono_ns_start": mono_ns_start,
            "mono_ns_end": mono_ns_end,
            "duration_ns": (mono_ns_end - mono_ns_start) if mono_ns_end and mono_ns_start else None,
            "frame_count": frame_count,
            "tools": args.tools,
            "timestamp": ts,
        }
        meta_path = os.path.join(out_dir, "meta.json")
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2, ensure_ascii=False)
        print(f"\n[INFO] meta.json 已保存: {meta_path}")
        print(f"[INFO] mono_ns_start : {mono_ns_start}")
        print(f"[INFO] mono_ns_end   : {mono_ns_end}")
        print(f"[INFO] duration_ns   : {meta['duration_ns']}")
        print(f"[INFO] frame_count   : {frame_count}")
        print(f"[OK]  采样完成: {out_dir}")

        # 自动提交到 web 服务（如未禁用）
        if hasattr(args, 'web_api') and args.web_api and args.web_api.lower() != 'none':
            submit_to_web(out_dir, meta, args.web_api)

        return out_dir

    return None


# ---------------------------------------------------------------------------
# 提交到 Web 服务（采样完成后自动上传 + 触发分析）
# ---------------------------------------------------------------------------
WEB_API_BASE = "http://localhost:3000/api"  # 可通过 --web-api 覆盖

def submit_to_web(out_dir: str, meta: dict, web_api: str) -> str | None:
    """
    将采样结果上传到 PerfAnalysisTool web 服务，触发 pdata + perfetto 自动分析。
    返回 runId，失败时返回 None（不阻断主流程）。
    """
    import urllib.request
    import urllib.error

    try:
        # multipart/form-data 手动构造（避免依赖 requests 库）
        boundary = "----MapleUploadBoundary" + str(int(time.time()))

        def field_part(name: str, value: str) -> bytes:
            return (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode()

        def file_part(name: str, filename: str, data: bytes) -> bytes:
            return (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
                f"Content-Type: application/octet-stream\r\n\r\n"
            ).encode() + data + b"\r\n"

        parts = [field_part("meta", json.dumps(meta))]

        # 附加文件
        file_map = {
            "perf_data": os.path.join(out_dir, "perf.data"),
            "ptrace":    os.path.join(out_dir, "trace.pftrace"),
        }
        for field, fpath in file_map.items():
            if os.path.exists(fpath):
                with open(fpath, "rb") as f:
                    parts.append(file_part(field, os.path.basename(fpath), f.read()))

        # .pdata 文件
        pdata_files = [f for f in os.listdir(out_dir) if f.endswith(".pdata")]
        for pf in pdata_files:
            fpath = os.path.join(out_dir, pf)
            with open(fpath, "rb") as f:
                parts.append(file_part(f"pdata_{pf}", pf, f.read()))

        body = b"".join(parts) + f"--{boundary}--\r\n".encode()

        req = urllib.request.Request(
            f"{web_api}/maple/runs",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
            run_id = result.get("runId")
            print(f"[INFO] 已上传到 web 服务: runId={run_id}")

        # 触发分析
        analyze_req = urllib.request.Request(
            f"{web_api}/maple/runs/{run_id}/analyze",
            data=b"{}",
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(analyze_req, timeout=10) as resp:
            print(f"[INFO] 自动分析已触发，在 web 界面查看结果：http://localhost:3000/maple")

        return run_id

    except Exception as e:
        print(f"[WARN] 上传到 web 服务失败（不影响本地数据）: {e}")
        return None


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Maple ILOpt 一键同步采样脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--label",    required=True,
                        help="本次采样标签，如 maple_base / maple_opt")
    parser.add_argument("--duration", type=int, default=60,
                        help="Unity Profiler 采样时长（秒），默认 60")
    parser.add_argument("--scene",    default="StressTestBattleSimpleMode",
                        help="测试场景名，默认 StressTestBattleSimpleMode")
    parser.add_argument("--tools",    default="simpleperf,perfetto",
                        help="使用的采样工具，逗号分隔: simpleperf,perfetto（默认两者）")
    parser.add_argument("--runs",     type=int, default=1,
                        help="采样次数（多次取均值），默认 1")
    parser.add_argument("--device",   default=None,
                        help="adb 设备 serial（多设备时需要指定）")
    parser.add_argument("--symbols",  default=SYMBOL_LIB_DIR,
                        help=f"带调试符号的 so 目录（默认 {SYMBOL_LIB_DIR}）；"
                             "需包含 libil2cpp.so/libil2cpp.dbg.so、libunity.so 等")
    parser.add_argument("--web-api",  default=WEB_API_BASE,
                        help=f"PerfAnalysisTool web API 地址（默认 {WEB_API_BASE}）；传 none 禁用自动上传")
    args = parser.parse_args()
    args.tools = [t.strip() for t in args.tools.split(",")]

    # 确定设备
    device = args.device or get_device_serial()
    device_model = get_device_model(device=device)
    print(f"[INFO] 设备: {device_model} ({device})")
    print(f"[INFO] 工具: {args.tools}")
    print(f"[INFO] 采样次数: {args.runs}")

    os.makedirs(OUTPUT_BASE, exist_ok=True)

    results = []
    for i in range(args.runs):
        out_dir = run_single(args, i, device, device_model)
        if out_dir:
            results.append(out_dir)
        if i < args.runs - 1:
            print(f"\n[INFO] 等待 10s 后进行下一次采样...")
            time.sleep(10)

    print(f"\n{'='*60}")
    print(f"[完成] 所有采样结果：")
    for d in results:
        print(f"  {d}")
    print(f"\n提示：使用 maple_compare.py 对比 base 和 opt 的采样结果")
    print(f"示例：")
    print(f"  python scripts/maple_compare.py \\")
    print(f"    --base output/maple/maple_base_* \\")
    print(f"    --opt  output/maple/maple_opt_*  \\")
    print(f"    --out  output/maple/report.txt")


if __name__ == "__main__":
    main()
