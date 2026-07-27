"""core.py - Collector 共享核心函数（C2 从 collect.py 抽出）

包含 ADB 辅助、simpleperf/perfetto/unity-profiler 启停、logcat 信号检测、
intent 触发、文件拉取等。drivers/ 和 orchestrator.py 通过本模块访问这些函数，
避免循环导入。

C0/C1 时这些函数在 collect.py 内联；C2 抽到 core.py 以支持 Driver 热插拔。
collect.py 仍 re-export 这些函数，向后兼容。
"""

import glob
import os
import re
import shutil
import subprocess
import sys
import time

# ---------------------------------------------------------------------------
# 路径常量（仅本脚本自身位置，不含项目特化信息）
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
PROJECTS_DIR = os.path.join(PROJECT_ROOT, "projects")
DEFAULT_PROJECT = "aoeyz"
LEGACY_CONFIG_PATH = os.path.join(SCRIPT_DIR, "config.json")


# ---------------------------------------------------------------------------
# ADB helpers
# ---------------------------------------------------------------------------
def adb(*args, device=None, capture=False, check=False):
    cmd = ["adb"]
    if device:
        cmd += ["-s", device]
    cmd += list(args)
    if capture:
        # encoding/errors: logcat 输出含非 GBK 字节（如 0x9a），Windows 默认 GBK 解码会失败
        # 用 errors="replace" 避免 UnicodeDecodeError 导致 stdout=None
        result = subprocess.run(cmd, capture_output=True, text=True,
                                encoding="utf-8", errors="replace")
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
    return pid_str.split()[0]


def get_device_model(device=None):
    r = adb_shell("getprop ro.product.model", device=device, capture=True)
    return r.stdout.strip().replace(" ", "_")


def get_device_abi(device=None):
    r = adb_shell("getprop ro.product.cpu.abi", device=device, capture=True)
    return r.stdout.strip()


def get_app_version(package, device=None):
    """通过 dumpsys 获取应用 versionName。"""
    try:
        r = adb_shell(f"dumpsys package {package}", device=device, capture=True, check=False)
        for line in r.stdout.splitlines():
            line = line.strip()
            if line.startswith("versionName="):
                return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return ""


def check_device_ready(device=None):
    """预检：设备在线。"""
    serial = device or get_device_serial()
    print(f"[INFO] 设备: {serial}")
    return serial


# ---------------------------------------------------------------------------
# simpleperf driver functions
# ---------------------------------------------------------------------------
def push_simpleperf_if_needed(abi, device_simpleperf_path, device=None):
    """如果设备上没有 simpleperf，则从 PC 端推送对应 ABI 版本。"""
    r = adb_shell(f"ls {device_simpleperf_path}", device=device, capture=True)
    if device_simpleperf_path in r.stdout:
        return
    abi_map = {"arm64-v8a": "arm64", "armeabi-v7a": "arm", "x86_64": "x86_64", "x86": "x86"}
    arch = abi_map.get(abi, "arm64")
    local_bin_dir = os.path.join(PROJECT_ROOT, "simpleperf", "bin", "android")
    local_bin = os.path.join(local_bin_dir, arch, "simpleperf")
    if not os.path.exists(local_bin):
        print(f"[WARN] 未找到本地 simpleperf：{local_bin}，跳过 push，假设设备已有")
        return
    print(f"[INFO] 推送 simpleperf ({arch}) 到设备...")
    adb("push", local_bin, device_simpleperf_path, device=device, check=True)
    adb_shell(f"chmod +x {device_simpleperf_path}", device=device)


def _normalize_symbol_dir(lib_dir):
    """把 symbols/ 目录里的 *.dbg.so 兼容处理为 *.so。"""
    if not lib_dir or not os.path.isdir(lib_dir):
        return lib_dir

    normalized = os.path.join(os.path.dirname(lib_dir), "_lib_normalized")
    os.makedirs(normalized, exist_ok=True)

    copied = 0
    for src in glob.glob(os.path.join(lib_dir, "*.so")) + \
               glob.glob(os.path.join(lib_dir, "*.dbg.so")):
        basename = os.path.basename(src)
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


def start_simpleperf(pid, config, device=None, out_dir=None, symbol_dir=None, duration=None):
    """用 app_profiler.py 采集 simpleperf 数据。"""
    ndk_simpleperf_dir = config["ndkSimpleperfDir"]
    app_profiler = os.path.join(ndk_simpleperf_dir, "app_profiler.py")
    if not os.path.exists(app_profiler):
        raise FileNotFoundError(f"app_profiler.py 不存在: {app_profiler}")

    perf_out = os.path.join(out_dir, "perf.data") if out_dir else "perf.data"
    lib_dir = _normalize_symbol_dir(symbol_dir or config.get("symbolLibDir"))

    duration_padding = config.get("simpleperfDurationPadding", 15)
    rec_duration = (duration or 60) + duration_padding

    record_opts_base = config.get(
        "simpleperfRecordOpts",
        "-e cpu-clock --call-graph fp --clockid boottime -f 4000",
    )
    record_opts = f"{record_opts_base} --duration {rec_duration}"

    cmd = [sys.executable, app_profiler,
           "-p", config["package"],
           "-r", record_opts,
           "-o", "perf.data",
           "--ndk_path", os.path.dirname(os.path.dirname(ndk_simpleperf_dir)),
           ]
    if lib_dir and os.path.isdir(lib_dir):
        cmd += ["-lib", lib_dir]
        print(f"[INFO] 符号目录: {lib_dir}")

    env = dict(os.environ)
    if device:
        env["ANDROID_SERIAL"] = device

    print(f"[INFO] 启动 simpleperf (app_profiler.py): {config['package']}，采集 {rec_duration}s")
    proc = subprocess.Popen(cmd, env=env, cwd=out_dir or os.getcwd())

    print(f"[INFO] 等待 simpleperf 初始化（push 符号文件，可能需要 20-30s）...")
    for i in range(60):
        time.sleep(1.0)
        if proc.poll() is not None:
            print(f"[WARN] app_profiler.py 意外退出（returncode={proc.returncode}）")
            return None
        r = subprocess.run(["adb"] + (["-s", device] if device else []) + ["shell", "pidof simpleperf"],
                           capture_output=True, text=True, timeout=5)
        if r.stdout.strip():
            print(f"[INFO] simpleperf 运行中 (PID={r.stdout.strip()})")
            return proc
    print(f"[WARN] 等待超时，simpleperf 可能未启动")
    return proc


def stop_simpleperf(proc=None, device=None):
    """等待 app_profiler.py 自然结束。"""
    print("[INFO] 等待 simpleperf 完成采集和 pull...")
    if proc is None or proc.poll() is not None:
        print("[INFO] simpleperf 已完成")
        return
    try:
        proc.wait(timeout=120)
        print("[INFO] simpleperf 采集完成")
    except subprocess.TimeoutExpired:
        print("[WARN] simpleperf 超时，强制终止")
        proc.kill()


# ---------------------------------------------------------------------------
# perfetto driver functions
# ---------------------------------------------------------------------------
def start_perfetto(label, out_dir, duration, config, device=None):
    """调用 record_android_trace.py，后台启动 perfetto。"""
    perfetto_script = config["perfettoScript"]
    if not os.path.exists(perfetto_script):
        print(f"[WARN] 未找到 perfetto 脚本：{perfetto_script}，跳过 perfetto 采样")
        return None, None

    perfetto_duration = f"{duration + config.get('perfettoDurationPadding', 15)}s"
    buffer_size = config.get("perfettoBufferSize", "64mb")
    cmd = [
        sys.executable, perfetto_script,
        "-t", perfetto_duration,
        "-b", buffer_size,
        "-n",
        "-o", out_dir,
        "--sideload",
        "-a", config["package"],
    ] + config.get("perfettoEvents", [])

    if device:
        cmd += ["--serial", device]

    print(f"[INFO] 启动 perfetto（{perfetto_duration}，后台）...")
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(3.0)
    return proc, out_dir


def stop_perfetto(proc, device=None):
    """等待 perfetto 自然结束，超时则强制终止。"""
    if proc is None:
        return
    print("[INFO] 等待 perfetto 完成 flush 和 pull...")
    try:
        proc.wait(timeout=60)
    except subprocess.TimeoutExpired:
        print("[WARN] perfetto 超时，强制终止")
        proc.kill()
    print("[INFO] perfetto 已停止")
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()


# ---------------------------------------------------------------------------
# logcat helpers
# ---------------------------------------------------------------------------
def parse_mono_ns(logcat_line, tag="END"):
    m = re.search(r"mono_ns=(\d+)", logcat_line)
    return int(m.group(1)) if m else None


def parse_frame_count(logcat_line):
    m = re.search(r"frameCount=(\d+)", logcat_line)
    return int(m.group(1)) if m else None


def parse_profile_name(logcat_line):
    m = re.search(r"name=(\S+)", logcat_line)
    return m.group(1) if m else ""


def clear_logcat(device=None):
    adb("logcat", "-c", device=device)


def wait_for_profile_end(timeout=300, device=None, duration=60, profile_name_hint="", config=None):
    """
    等待 CombinedProfile 采样完成，返回 (profile_name, mono_ns_start, mono_ns_end, frame_count)。

    策略：
      1. 监听 Unity:E 日志的 [CombinedProfile] START
      2. 退回 ProfileCommandBridge:V 的 GetMonotonicNs() 日志
      3. 等待 duration 秒后主动发 stop intent
      4. 监听 END 日志
    """
    print("[INFO] 等待采样开始（监听 ProfileCommandBridge GetMonotonicNs）...")
    mono_ns_start = None
    mono_ns_end = None
    profile_name = profile_name_hint
    frame_count = None
    deadline = time.time() + timeout

    # ---- 策略1: Unity Error 级别日志 ----
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

    # ---- 策略2: ProfileCommandBridge V 级日志 ----
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
        raise RuntimeError("超时未检测到采样开始信号（尝试了 Unity:E 和 ProfileCommandBridge）")

    # ---- START 已检测到，primitives 已跑完，立即发 Stop Intent 停采集 ----
    # wait_for_profile_end 在 driver.stop 时调用，此时 primitives 已执行完毕。
    # 不等 Lua 自己超时（duration 到了才停），而是主动发 Stop 立即停。
    # 先检查 buffer 里是否已有 END（Lua 可能已自己停了），没有就发 Stop。
    print(f"[INFO] 采样窗口 {duration}s 已到，停止采集...")

    def _check_end_in_lines(lines):
        """从日志行中查找 END 信号，返回 (mono_ns_end, frame_count) 或 None"""
        for line in reversed(lines):
            if "[CombinedProfile] END" in line:
                if not profile_name or profile_name in line:
                    return parse_mono_ns(line, "END"), parse_frame_count(line)
            if "TraceEnd" in line and "ProfileCommandBridge" in line:
                m = re.search(r"GetMonotonicNs\(\) = (\d+)", line)
                if m:
                    return int(m.group(1)), frame_count
        return None

    # 先查 buffer 是否已有 END
    r = adb("logcat", "-d", "-s", "Unity:E", "ProfileCommandBridge:V",
            device=device, capture=True)
    end_result = _check_end_in_lines(r.stdout.splitlines())
    if end_result:
        mono_ns_end, frame_count = end_result
        duration_actual = (mono_ns_end - mono_ns_start) / 1e9
        print(f"[INFO] 检测到 END（Lua 已自动停止）: mono_ns={mono_ns_end}")
        print(f"[INFO] 实际采样时长: {duration_actual:.2f}s")
        return profile_name, mono_ns_start, mono_ns_end, frame_count

    # buffer 里没有 END，发 Stop Intent
    stop_profile(profile_name_hint or profile_name, config, device=device)

    # 轮询等 END 确认（最多等 15s）
    wait_until = time.time() + 15
    last_print = time.time()
    while time.time() < wait_until:
        r = adb("logcat", "-d", "-s", "Unity:E", "ProfileCommandBridge:V",
                device=device, capture=True)
        end_result = _check_end_in_lines(r.stdout.splitlines())
        if end_result:
            mono_ns_end, frame_count = end_result
            duration_actual = (mono_ns_end - mono_ns_start) / 1e9
            print(f"[INFO] 检测到 END: mono_ns={mono_ns_end}")
            print(f"[INFO] 实际采样时长: {duration_actual:.2f}s")
            return profile_name, mono_ns_start, mono_ns_end, frame_count

        now = time.time()
        if now - last_print >= 5:
            print(f"[INFO] 等待 END 确认...（{int(now - t0)}s）")
            last_print = now
        time.sleep(0.5)

    # 超时仍未检测到 END，用 duration 估算
    print("[WARN] 未检测到 END 日志，用 duration 估算")
    mono_ns_end = mono_ns_start + int(duration * 1e9)

    return profile_name, mono_ns_start, mono_ns_end, frame_count


# ---------------------------------------------------------------------------
# intent trigger
# ---------------------------------------------------------------------------
def trigger_profile(name, duration, scene, config, device=None):
    """通过 am start 触发游戏进行 CombinedProfile 采样。"""
    intent_cmd = (
        f"am start"
        f" -n {config['package']}/{config['activity']}"
        f" -a {config['intentAction']}"
        f" --es cmd start_combined_profile"
        f" --es name {name}"
        f" --ei duration {duration}"
        f" --es scene {scene}"
    )
    print(f"[INFO] 发送 Intent: name={name} duration={duration}s scene={scene}")
    adb_shell(intent_cmd, device=device, check=True)


def stop_profile(name, config, device=None):
    """主动发 stop_combined_profile Intent。"""
    intent_cmd = (
        f"am start"
        f" -n {config['package']}/{config['activity']}"
        f" -a {config['intentAction']}"
        f" --es cmd stop_combined_profile"
        f" --es name {name}"
    )
    print(f"[INFO] 发送 Stop Intent: name={name}")
    adb_shell(intent_cmd, device=device)


# ---------------------------------------------------------------------------
# pull files
# ---------------------------------------------------------------------------
def pull_output_files(out_dir, config, device=None, profile_name=None):
    """从设备拉取 perf.data、pftrace、pdata 文件。"""
    # perf.data（由 app_profiler.py 直接输出到 out_dir）
    perf_local = os.path.join(out_dir, "perf.data")
    if os.path.exists(perf_local):
        print(f"[INFO] perf.data -> {perf_local}  ({os.path.getsize(perf_local)//1024}KB)")
    else:
        print("[WARN] perf.data 不存在（app_profiler.py 可能未正常输出）")

    # pftrace（由 record_android_trace.py 自动 pull 到 out_dir）
    pftrace_files = glob.glob(os.path.join(out_dir, "*.pftrace"))
    if pftrace_files:
        print(f"[INFO] trace.pftrace -> {pftrace_files[0]}")
    else:
        print("[WARN] 未找到 .pftrace 文件（perfetto 可能未成功录制）")

    # pdata / raw（Unity Profiler）— 复用 pull_unity_pdata（含文件稳定性等待）
    pull_unity_pdata(out_dir, config, device=device, profile_name=profile_name)


def pull_unity_pdata(out_dir, config, device=None, profile_name=None):
    """仅拉取 Unity Profiler .pdata/.raw 文件。供 UnityProfilerDriver 使用。"""
    device_pdata_dir = config["devicePdataDir"]

    # 等待文件写入稳定（Unity Profiler 停止后 file flush 可能有延迟）
    print(f"[INFO] 等待 Unity Profiler 文件写入稳定...")
    prev_size = -1
    stable_count = 0
    for i in range(30):  # 最多等 60s
        time.sleep(2.0)
        r = adb_shell(
            f"ls -la {device_pdata_dir}*.raw 2>/dev/null",
            device=device, capture=True
        )
        current_size = 0
        for line in r.stdout.splitlines():
            parts = line.split()
            if len(parts) >= 5:
                try:
                    current_size = max(current_size, int(parts[4]))
                except ValueError:
                    pass
        if current_size == prev_size and current_size > 0:
            stable_count += 1
            if stable_count >= 2:
                print(f"[INFO] 文件大小稳定: {current_size // 1024 // 1024}MB")
                break
        else:
            stable_count = 0
            if prev_size > 0:
                print(f"[INFO] 文件仍在写入: {prev_size // 1024 // 1024}MB -> {current_size // 1024 // 1024}MB")
            prev_size = current_size
    else:
        print(f"[WARN] 文件未稳定（{prev_size // 1024 // 1024}MB），强制拉取")

    print(f"[INFO] 拉取 Unity Profiler 文件...")
    r = adb_shell(
        f"ls {device_pdata_dir}*.pdata {device_pdata_dir}*.raw 2>/dev/null",
        device=device, capture=True
    )
    all_files = [f.strip() for f in r.stdout.splitlines()
                 if f.strip().endswith((".pdata", ".raw"))]

    if profile_name:
        pdata_files = [f for f in all_files
                       if os.path.basename(f).startswith(profile_name)]
        if not pdata_files:
            print(f"[WARN] 未找到名称匹配 '{profile_name}' 的文件，拉取全部")
            pdata_files = all_files
    else:
        pdata_files = all_files

    pulled = []
    for pf in pdata_files:
        local_pf = os.path.join(out_dir, os.path.basename(pf))
        adb("pull", pf, local_pf, device=device)
        print(f"[INFO] {os.path.basename(pf)} -> {local_pf}")
        pulled.append(local_pf)

    if not pdata_files:
        print("[WARN] 未找到 .pdata 文件，Unity Profiler 可能未采集或路径不同")

    return pulled
