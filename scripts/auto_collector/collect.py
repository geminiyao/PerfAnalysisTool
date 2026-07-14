#!/usr/bin/env python3
"""collect.py - 通用性能采集脚本

使用方式：
    # 简化指令（关键词解析），默认加载 projects/aoeyz/collect.yaml
    python scripts/auto_collector/collect.py "VG对比 60s"

    # 指定项目
    python scripts/auto_collector/collect.py "VG对比 60s" --project aoeyz

    # 显式指定配置文件（YAML 或旧版 JSON 均可）
    python scripts/auto_collector/collect.py --config projects/aoeyz/collect.yaml

    # 结构化参数
    python scripts/auto_collector/collect.py \\
        --label vg_compare \\
        --duration 60 \\
        --scene StressTestBattleSimpleMode \\
        --tools simpleperf,perfetto

配置：projects/<name>/collect.yaml（C1 起，YAML 驱动）
      旧版 scripts/auto_collector/config.json 仍向后兼容
Schema：docs/collector/plan/collect-yaml-schema.md
"""

import argparse
import datetime
import glob
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time

import yaml

# ---------------------------------------------------------------------------
# 路径常量（仅本脚本自身位置，不含项目特化信息）
# ---------------------------------------------------------------------------
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(SCRIPT_DIR))
PROJECTS_DIR = os.path.join(PROJECT_ROOT, "projects")
DEFAULT_PROJECT = "aoeyz"
# 旧版 JSON 配置（向后兼容）
LEGACY_CONFIG_PATH = os.path.join(SCRIPT_DIR, "config.json")


# ---------------------------------------------------------------------------
# 配置加载（C1: YAML 驱动，向后兼容 JSON）
# ---------------------------------------------------------------------------
def _project_collect_yaml_path(project_name):
    """返回 projects/<name>/collect.yaml 的绝对路径。"""
    return os.path.join(PROJECTS_DIR, project_name, "collect.yaml")


def _resolve_config_path(config_path=None, project=None):
    """解析配置文件路径，优先级：显式 config > project > 环境变量 > 默认项目。"""
    if config_path:
        return config_path
    if project:
        p = _project_collect_yaml_path(project)
        if os.path.isfile(p):
            return p
        raise FileNotFoundError(f"项目配置不存在: {p}")
    env_project = os.environ.get("COLLECTOR_PROJECT")
    if env_project:
        p = _project_collect_yaml_path(env_project)
        if os.path.isfile(p):
            return p
    # 默认项目
    p = _project_collect_yaml_path(DEFAULT_PROJECT)
    if os.path.isfile(p):
        return p
    # 兜底：旧版 JSON
    if os.path.isfile(LEGACY_CONFIG_PATH):
        return LEGACY_CONFIG_PATH
    raise FileNotFoundError(
        f"未找到采集配置。请创建 projects/{DEFAULT_PROJECT}/collect.yaml "
        f"或通过 --config 指定配置文件"
    )


def _flatten_yaml_config(yaml_cfg):
    """将结构化 collect.yaml 扁平化为旧版 dict 格式，保持采集逻辑不变。

    映射关系详见 docs/collector/plan/collect-yaml-schema.md
    """
    project = yaml_cfg.get("project") or {}
    device = yaml_cfg.get("device") or {}
    tools = yaml_cfg.get("tools") or {}
    simpleperf_cfg = tools.get("simpleperf") or {}
    perfetto_cfg = tools.get("perfetto") or {}
    scenes = yaml_cfg.get("scenes") or {}
    action = yaml_cfg.get("action") or {}
    output = yaml_cfg.get("output") or {}
    symbols = yaml_cfg.get("symbols") or {}
    meta = yaml_cfg.get("meta") or {}

    scenes_default = scenes.get("default") or {}

    flat = {
        # project
        "package": project.get("package", ""),
        "activity": project.get("activity", ""),
        "intentAction": project.get("intentAction", ""),
        "projectName": project.get("name", ""),
        # device
        "deviceSimpleperfPath": device.get("simpleperfPath", ""),
        "devicePdataDir": device.get("pdataDir", ""),
        # tools.simpleperf
        "ndkSimpleperfDir": simpleperf_cfg.get("ndkDir", ""),
        "simpleperfRecordOpts": simpleperf_cfg.get(
            "recordOpts", "-e cpu-clock --call-graph fp --clockid boottime -f 4000"
        ),
        "simpleperfDurationPadding": simpleperf_cfg.get("durationPadding", 15),
        # tools.perfetto
        "perfettoScript": perfetto_cfg.get("script", ""),
        "perfettoBufferSize": perfetto_cfg.get("bufferSize", "64mb"),
        "perfettoDurationPadding": perfetto_cfg.get("durationPadding", 15),
        "perfettoEvents": perfetto_cfg.get("events", []),
        # scenes
        "sceneAliases": scenes.get("aliases") or {},
        "defaultScene": scenes_default.get("scene", "StressTestBattleSimpleMode"),
        "defaultLabel": scenes_default.get("label", "collect"),
        # action
        "defaultDuration": action.get("defaultDuration", 60),
        # output
        "outputBase": output.get("baseDir", "output/collect"),
        "webApiBase": output.get("webApiBase", ""),
        # symbols
        "symbolLibDir": symbols.get("libDir", ""),
        # meta
        "metaProject": meta.get("project", project.get("name", "")),
    }
    return flat


def load_config(config_path=None, project=None):
    """加载采集配置（YAML 或 JSON），返回扁平化 dict。

    - YAML 文件（collect.yaml）：结构化加载后扁平化
    - JSON 文件（旧版 config.json）：直接加载，向后兼容
    """
    resolved_path = _resolve_config_path(config_path, project)
    if not os.path.exists(resolved_path):
        raise FileNotFoundError(f"配置文件不存在: {resolved_path}")

    ext = os.path.splitext(resolved_path)[1].lower()
    if ext in (".yaml", ".yml"):
        with open(resolved_path, "r", encoding="utf-8") as f:
            yaml_cfg = yaml.safe_load(f) or {}
        cfg = _flatten_yaml_config(yaml_cfg)
    elif ext == ".json":
        with open(resolved_path, "r", encoding="utf-8") as f:
            cfg = json.load(f)
    else:
        raise ValueError(f"不支持的配置文件格式: {ext}（支持 .yaml/.yml/.json）")

    # 将相对路径解析为相对于 PROJECT_ROOT 的绝对路径
    for key in ("symbolLibDir", "outputBase"):
        val = cfg.get(key, "")
        if val and not os.path.isabs(val):
            cfg[key] = os.path.join(PROJECT_ROOT, val)

    return cfg


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
    return pid_str.split()[0]


def get_device_model(device=None):
    r = adb_shell("getprop ro.product.model", device=device, capture=True)
    return r.stdout.strip().replace(" ", "_")


def get_device_abi(device=None):
    r = adb_shell("getprop ro.product.cpu.abi", device=device, capture=True)
    return r.stdout.strip()


def check_device_ready(device=None):
    """预检：设备在线 + 游戏进程存在。"""
    serial = device or get_device_serial()
    print(f"[INFO] 设备: {serial}")
    return serial


# ---------------------------------------------------------------------------
# simpleperf driver
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
# perfetto driver
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

    # ---- START 已检测到，清空 logcat 后持续流式监听 END ----
    # 清空 logcat 防止旧日志干扰，同时避免 ring buffer 被 simpleperf W 日志冲掉
    adb("logcat", "-c", device=device)
    print(f"[INFO] 等待采样结束（{duration}s，持续监听 logcat）...")

    # 启动持续 logcat 进程，监听 ProfileCommandBridge 和 Unity
    logcat_cmd = ["adb"]
    if device:
        logcat_cmd += ["-s", device]
    logcat_cmd += ["logcat", "-s",
                   "ProfileCommandBridge:V", "ProfileCommandBridge:D", "Unity:E"]
    logcat_proc = subprocess.Popen(
        logcat_cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
        text=True, bufsize=1
    )

    # 用线程 + 队列实现非阻塞读取，避免 readline() 在无日志时永久阻塞
    line_queue = queue.Queue()

    def _logcat_reader():
        for line in logcat_proc.stdout:
            line_queue.put(line)
        line_queue.put(None)  # EOF 信号

    reader_thread = threading.Thread(target=_logcat_reader, daemon=True)
    reader_thread.start()

    try:
        wait_until = time.time() + duration + 30  # 多给 30s 余量等 END
        last_print = time.time()
        while time.time() < wait_until:
            # 非阻塞读取：0.5s 超时，确保 while 条件能被定期检查
            try:
                line = line_queue.get(timeout=0.5)
            except queue.Empty:
                now = time.time()
                if now - last_print >= 10:
                    elapsed = int(now - t0)
                    print(f"[INFO] 已等待 {elapsed}s / {duration}s...")
                    last_print = now
                continue

            if line is None:  # logcat 进程已退出
                break

            line = line.strip()

            # 进度打印
            now = time.time()
            if now - last_print >= 10:
                elapsed = int(now - t0)
                print(f"[INFO] 已等待 {elapsed}s / {duration}s...")
                last_print = now

            # 检测 END: Unity:E 的 [CombinedProfile] END
            if "[CombinedProfile] END" in line:
                if not profile_name or profile_name in line:
                    mono_ns_end = parse_mono_ns(line, "END")
                    frame_count = parse_frame_count(line)
                    print(f"[INFO] 检测到 END (Unity:E): mono_ns={mono_ns_end} frameCount={frame_count}")
                    return profile_name, mono_ns_start, mono_ns_end, frame_count

            # 检测 END: ProfileCommandBridge 的 TraceEnd + GetMonotonicNs
            if "TraceEnd" in line and "ProfileCommandBridge" in line:
                # TraceEnd 出现，接下来一行通常就是 GetMonotonicNs
                # 继续从队列读下一行找 ns（最多 10 行，每行 1s 超时）
                for _ in range(10):
                    try:
                        next_line = line_queue.get(timeout=1.0)
                    except queue.Empty:
                        break
                    if next_line is None:
                        break
                    next_line = next_line.strip()
                    m = re.search(r"GetMonotonicNs\(\) = (\d+)", next_line)
                    if m:
                        mono_ns_end = int(m.group(1))
                        duration_actual = (mono_ns_end - mono_ns_start) / 1e9
                        print(f"[INFO] 检测到 END (ProfileCommandBridge): mono_ns={mono_ns_end}")
                        print(f"[INFO] 实际采样时长: {duration_actual:.2f}s")
                        return profile_name, mono_ns_start, mono_ns_end, frame_count
                # TraceEnd 后没找到 ns，用 duration 估算
                if mono_ns_end is None:
                    print("[WARN] TraceEnd 后未找到 GetMonotonicNs，用 duration 估算 END")
                    mono_ns_end = mono_ns_start + int(duration * 1e9)
                return profile_name, mono_ns_start, mono_ns_end, frame_count

            # 也检测单独的 GetMonotonicNs（第二次出现即为 END）
            if "GetMonotonicNs()" in line and "ProfileCommandBridge" in line:
                m = re.search(r"GetMonotonicNs\(\) = (\d+)", line)
                if m:
                    ns_val = int(m.group(1))
                    # 如果 ns 比 start 大很多（超过 duration 的一半），认为是 END
                    if ns_val > mono_ns_start and (ns_val - mono_ns_start) > duration * 0.5 * 1e9:
                        mono_ns_end = ns_val
                        duration_actual = (mono_ns_end - mono_ns_start) / 1e9
                        print(f"[INFO] 检测到 END (GetMonotonicNs): mono_ns={mono_ns_end}")
                        print(f"[INFO] 实际采样时长: {duration_actual:.2f}s")
                        return profile_name, mono_ns_start, mono_ns_end, frame_count
    finally:
        logcat_proc.terminate()
        try:
            logcat_proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            logcat_proc.kill()

    # 超时仍未检测到 END，发 stop intent 后用 duration 估算
    print("[WARN] 超时未检测到 END 信号，发 Stop Intent 并用 duration 估算")
    stop_profile(profile_name_hint or profile_name, config, device=device)
    time.sleep(3.0)
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

    # pdata / raw（Unity Profiler）
    print(f"[INFO] 等待 Unity Profiler 文件写入完成（5s）...")
    time.sleep(5.0)
    print(f"[INFO] 拉取 Unity Profiler 文件...")
    device_pdata_dir = config["devicePdataDir"]
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
    for pf in pdata_files:
        local_pf = os.path.join(out_dir, os.path.basename(pf))
        adb("pull", pf, local_pf, device=device)
        print(f"[INFO] {os.path.basename(pf)} -> {local_pf}")

    if not pdata_files:
        print("[WARN] 未找到 .pdata 文件，Unity Profiler 可能未采集或路径不同")


# ---------------------------------------------------------------------------
# 单次采集
# ---------------------------------------------------------------------------
def run_single(args, run_index, device, device_model, config):
    """执行一次完整采集流程。"""
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    run_label = f"{args.label}_{device_model}_{ts}"
    if args.runs > 1:
        run_label += f"_run{run_index+1}"

    out_dir = os.path.join(config["outputBase"], run_label)
    os.makedirs(out_dir, exist_ok=True)
    print(f"\n{'='*60}")
    print(f"[INFO] 开始采集 run {run_index+1}/{args.runs}: {run_label}")
    print(f"[INFO] 输出目录: {out_dir}")
    print(f"{'='*60}")

    # 1. 获取 PID
    pid = get_pid(config["package"], device=device)
    if not pid:
        raise RuntimeError(f"未找到进程 {config['package']}，请先启动游戏并进入测试场景")
    print(f"[INFO] 游戏 PID: {pid}")

    # 2. 清空 logcat
    clear_logcat(device=device)

    # 3. 启动 simpleperf
    sp_proc = None
    use_simpleperf = "simpleperf" in args.tools
    if use_simpleperf:
        sp_proc = start_simpleperf(pid, config, device=device, out_dir=out_dir,
                                   symbol_dir=getattr(args, 'symbols', None),
                                   duration=args.duration)

    # 4. 启动 perfetto
    pf_proc = None
    use_perfetto = "perfetto" in args.tools
    if use_perfetto:
        pf_proc, _ = start_perfetto(run_label, out_dir, args.duration, config, device=device)

    # 5. 触发游戏采样
    profile_name = f"{args.label}_{run_index+1:03d}"
    trigger_profile(
        name=profile_name,
        duration=args.duration,
        scene=args.scene,
        config=config,
        device=device,
    )

    # 6. 等待 END 日志（信号检测失败时降级，不中断收尾）
    game_profile_ok = False
    prof_name = profile_name
    mono_ns_start = None
    mono_ns_end = None
    frame_count = None
    try:
        prof_name, mono_ns_start, mono_ns_end, frame_count = wait_for_profile_end(
            timeout=args.duration + 120,
            device=device,
            duration=args.duration,
            profile_name_hint=profile_name,
            config=config,
        )
        game_profile_ok = True
    except RuntimeError as e:
        print(f"[WARN] {e}")
        print("[WARN] 游戏内 CombinedProfile 信号未检测到，降级处理：simpleperf/perfetto 数据仍有效")

    # 7. 停止采样工具（无论信号检测是否成功都要停）
    if use_simpleperf:
        stop_simpleperf(proc=sp_proc, device=device)
    if use_perfetto:
        stop_perfetto(pf_proc, device=device)

    # 8. 拉取文件
    pull_output_files(out_dir, config, device=device, profile_name=prof_name)

    # 9. 保存 meta.json
    meta = {
        "project": config.get("metaProject", config.get("projectName", "")),
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
        "game_profile_ok": game_profile_ok,
    }
    meta_path = os.path.join(out_dir, "meta.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    print(f"\n[INFO] meta.json 已保存: {meta_path}")
    print(f"[INFO] mono_ns_start : {mono_ns_start}")
    print(f"[INFO] mono_ns_end   : {mono_ns_end}")
    print(f"[INFO] duration_ns   : {meta['duration_ns']}")
    print(f"[INFO] frame_count   : {frame_count}")
    print(f"[INFO] game_profile  : {'OK' if game_profile_ok else 'FAILED (降级)'}")
    print(f"[OK]  采集完成: {out_dir}")

    # 自动提交到 web 服务
    web_api = getattr(args, 'web_api', config.get("webApiBase", ""))
    if web_api and web_api.lower() != 'none':
        submit_to_web(out_dir, meta, web_api)

    return out_dir


# ---------------------------------------------------------------------------
# 提交到 web 服务
# ---------------------------------------------------------------------------
def submit_to_web(out_dir, meta, web_api):
    """将采集结果上传到 web 服务，触发分析。"""
    import urllib.request
    import urllib.error

    try:
        boundary = "----CollectUploadBoundary" + str(int(time.time()))

        def field_part(name, value):
            return (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'
                f"{value}\r\n"
            ).encode()

        def file_part(name, filename, data):
            return (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
                f"Content-Type: application/octet-stream\r\n\r\n"
            ).encode() + data + b"\r\n"

        parts = [field_part("meta", json.dumps(meta))]

        file_map = {
            "perf_data": os.path.join(out_dir, "perf.data"),
            "ptrace": os.path.join(out_dir, "trace.pftrace"),
        }
        for field, fpath in file_map.items():
            if os.path.exists(fpath):
                with open(fpath, "rb") as f:
                    parts.append(file_part(field, os.path.basename(fpath), f.read()))

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
# 需求解析（C0: 关键词匹配，C4 升级为 LLM）
# ---------------------------------------------------------------------------
def parse_request(natural_text, config):
    """从自然语言文本解析采集参数。

    C0 阶段：纯关键词匹配。
    - 时长：匹配 "60s" / "60秒" → duration
    - 场景：匹配 config["sceneAliases"] 里的别名 → label + scene
    - 工具：匹配 "simpleperf" / "perfetto" → tools
    - label：如未匹配到场景别名，取文本前几个字做 label
    """
    text = natural_text.strip()
    result = {}

    # 解析时长
    m = re.search(r"(\d+)\s*(?:s|秒)", text)
    if m:
        result["duration"] = int(m.group(1))
    else:
        result["duration"] = config.get("defaultDuration", 60)  # 从 YAML 读默认值

    # 解析场景（从 sceneAliases 匹配）
    result["label"] = None
    result["scene"] = None
    scene_aliases = config.get("sceneAliases", {})
    for alias, mapping in scene_aliases.items():
        if alias in text:
            result["label"] = mapping.get("label", alias)
            result["scene"] = mapping.get("scene", "")
            break

    # 如果没匹配到场景别名，用配置默认值
    if not result["label"]:
        # 去掉时长模式后，取文本中的中英文词作为 label
        text_clean = re.sub(r"\d+\s*(?:s|秒)", "", text)
        words = re.findall(r"[\u4e00-\u9fa5]+", text_clean)
        result["label"] = words[0] if words else config.get("defaultLabel", "collect")
        result["scene"] = config.get("defaultScene", "StressTestBattleSimpleMode")

    # 解析工具
    tools = []
    if "simpleperf" in text.lower():
        tools.append("simpleperf")
    if "perfetto" in text.lower():
        tools.append("perfetto")
    if not tools:
        tools = ["simpleperf", "perfetto"]  # 默认两个都采
    result["tools"] = tools

    return result


# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="通用性能采集脚本",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    # 位置参数：自然语言指令（与结构化参数二选一）
    parser.add_argument("request", nargs="?", default=None,
                        help='自然语言指令，如 "VG对比 60s"')

    # 结构化参数
    parser.add_argument("--label", default=None,
                        help="本次采集标签")
    parser.add_argument("--duration", type=int, default=None,
                        help="采样时长（秒），默认 60")
    parser.add_argument("--scene", default=None,
                        help="测试场景名")
    parser.add_argument("--tools", default=None,
                        help="采样工具，逗号分隔: simpleperf,perfetto")
    parser.add_argument("--runs", type=int, default=1,
                        help="采样次数，默认 1")
    parser.add_argument("--device", default=None,
                        help="adb 设备 serial")
    parser.add_argument("--symbols", default=None,
                        help="带调试符号的 so 目录")
    parser.add_argument("--web-api", default=None,
                        help="web API 地址；传 none 禁用自动上传")
    parser.add_argument("--project", default=None,
                        help=f"项目名，加载 projects/<name>/collect.yaml "
                             f"（默认 {DEFAULT_PROJECT}）")
    parser.add_argument("--config", default=None,
                        help="配置文件路径（YAML 或 JSON）。优先于 --project")

    args = parser.parse_args()

    # 加载配置（C1: YAML 驱动，向后兼容 JSON）
    config = load_config(args.config, args.project)
    config_source = args.config or _resolve_config_path(args.config, args.project)
    print(f"[INFO] 配置文件: {config_source}")

    # 如果传了自然语言指令，解析它
    if args.request:
        parsed = parse_request(args.request, config)
        if args.label is None:
            args.label = parsed["label"]
        if args.duration is None:
            args.duration = parsed["duration"]
        if args.scene is None:
            args.scene = parsed["scene"]
        if args.tools is None:
            args.tools = parsed["tools"]
        print(f"[INFO] 解析指令 '{args.request}'")
        print(f"[INFO]   label={args.label}, duration={args.duration}s, scene={args.scene}, tools={args.tools}")

    # 默认值（从 YAML 配置读）
    if args.label is None:
        args.label = config.get("defaultLabel", "collect")
    if args.duration is None:
        args.duration = config.get("defaultDuration", 60)
    if args.scene is None:
        args.scene = config.get("defaultScene", "StressTestBattleSimpleMode")
    if args.tools is None:
        args.tools = ["simpleperf", "perfetto"]
    elif isinstance(args.tools, str):
        args.tools = [t.strip() for t in args.tools.split(",")]
    if args.web_api is None:
        args.web_api = config.get("webApiBase", "")
    if args.symbols is None:
        args.symbols = config.get("symbolLibDir")

    # 预检设备
    device = args.device or get_device_serial()
    device_model = get_device_model(device=device)
    print(f"[INFO] 设备: {device_model} ({device})")
    print(f"[INFO] 工具: {args.tools}")
    print(f"[INFO] 采样次数: {args.runs}")

    # 确保输出目录存在
    os.makedirs(config["outputBase"], exist_ok=True)

    # 执行采集
    results = []
    for i in range(args.runs):
        out_dir = run_single(args, i, device, device_model, config)
        if out_dir:
            results.append(out_dir)
        if i < args.runs - 1:
            print(f"\n[INFO] 等待 10s 后进行下一次采集...")
            time.sleep(10)

    print(f"\n{'='*60}")
    print(f"[完成] 所有采集结果：")
    for d in results:
        print(f"  {d}")


if __name__ == "__main__":
    main()
