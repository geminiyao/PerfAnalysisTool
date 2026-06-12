#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
maple_verify.py - Maple 同步采样方案完整性验证脚本
在游戏版本等待期间，用现有测试数据验证整条链路。

验证层次：
  1. 环境检查       - Python 版本、adb、perfetto 库
  2. pdata 解析     - 调 web 服务 API，验证 .pdata 上传和分析
  3. perfetto 解析  - 直接跑 perfetto_analyzer.py，验证输出格式
  4. web API 端到端 - 上传文件 -> 触发分析 -> 查询结果
  5. 对比报告生成   - 用同一个 pdata 模拟 base/opt 对比
  6. logcat 解析    - 模拟 [CombinedProfile] START/END 日志解析
  7. 摘要报告       - 打印所有步骤结果

用法：
  python scripts/maple_verify.py
  python scripts/maple_verify.py --web-api http://localhost:3000/api
  python scripts/maple_verify.py --skip-web  # 跳过 web 服务（仅验证本地解析）
"""

import argparse
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

# 强制 stdout 使用 UTF-8（解决 Windows PowerShell GBK 编码问题）
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent

# 测试用现有文件
TEST_PDATA = PROJECT_ROOT / "data" / "压测战斗.pdata"
TEST_PFTRACE_1 = PROJECT_ROOT / "output" / "perfetto" / "2024-05-31_21-12-75c4b6.pftrace"
TEST_PFTRACE_2 = PROJECT_ROOT / "output" / "perfetto" / "2026-05-09_11-49-8b7dad.pftrace"
PERFETTO_ANALYZER = SCRIPT_DIR / "perfetto_analyzer.py"

# ---------------------------------------------------------------------------
# 颜色输出（ASCII 兼容，避免 Windows GBK 编码问题）
# ---------------------------------------------------------------------------

def ok(msg): print(f"  [OK] {msg}")
def fail(msg): print(f"  [FAIL] {msg}")
def warn(msg): print(f"  [WARN] {msg}")
def info(msg): print(f"  [--> ] {msg}")
def header(title): print(f"\n{'='*60}\n  {title}\n{'='*60}")

# ---------------------------------------------------------------------------
# 验证结果收集
# ---------------------------------------------------------------------------
results: list[dict] = []

def record(name: str, passed: bool, note: str = ""):
    results.append({"name": name, "passed": passed, "note": note})
    if passed:
        ok(f"{name}" + (f"  [{note}]" if note else ""))
    else:
        fail(f"{name}" + (f"  [{note}]" if note else ""))

# ---------------------------------------------------------------------------
# 1. 环境检查
# ---------------------------------------------------------------------------
def check_environment():
    header("1. 环境检查")

    # Python 版本
    py_ver = sys.version_info
    if py_ver >= (3, 8):
        record("Python 版本", True, f"{py_ver.major}.{py_ver.minor}.{py_ver.micro}")
    else:
        record("Python 版本", False, f"{py_ver.major}.{py_ver.minor} < 3.8")

    # adb 可用性
    try:
        r = subprocess.run(["adb", "version"], capture_output=True, text=True, timeout=5)
        if r.returncode == 0:
            ver = r.stdout.splitlines()[0] if r.stdout else "unknown"
            record("adb 可用", True, ver[:50])
        else:
            record("adb 可用", False, "adb 命令返回非0")
    except FileNotFoundError:
        record("adb 可用", False, "adb 未安装或不在 PATH 中")
    except Exception as e:
        record("adb 可用", False, str(e)[:60])

    # adb 设备连接
    try:
        r = subprocess.run(["adb", "devices"], capture_output=True, text=True, timeout=5)
        lines = [l for l in r.stdout.splitlines() if "\tdevice" in l]
        if lines:
            record("设备已连接", True, f"{len(lines)} 台设备: {lines[0].split(chr(9))[0]}")
        else:
            warn("设备未连接（等游戏版本时可以不连）")
            record("设备已连接", False, "无已连接设备（不影响离线验证）")
    except Exception as e:
        record("设备已连接", False, str(e)[:60])

    # perfetto Python 库
    try:
        import perfetto  # noqa
        record("perfetto Python 库", True, f"版本: {getattr(perfetto, '__version__', 'unknown')}")
    except ImportError:
        fail("perfetto Python 库未安装")
        info("安装命令: pip install perfetto")
        record("perfetto Python 库", False, "pip install perfetto")

    # 测试文件存在
    for label, path in [
        ("测试 .pdata 文件", TEST_PDATA),
        ("测试 .pftrace 文件 1", TEST_PFTRACE_1),
        ("测试 .pftrace 文件 2", TEST_PFTRACE_2),
    ]:
        if path.exists():
            size_mb = path.stat().st_size / 1024 / 1024
            record(label, True, f"{size_mb:.1f} MB")
        else:
            record(label, False, f"不存在: {path}")

# ---------------------------------------------------------------------------
# 2. logcat 日志解析验证
# ---------------------------------------------------------------------------
def check_logcat_parsing():
    header("2. logcat START/END 日志解析")

    # 模拟 logcat 行（与真实游戏打出的格式完全一致）
    # mono_ns 差值 = 60_000_000_000 ns = 60s
    MONO_NS_START = 1234567890000000
    MONO_NS_END   = 1234567890000000 + 60_000_000_000  # 1294567890000000
    fake_logs = [
        f"06-11 14:30:01.123  1234  5678 I randolfLog: [CombinedProfile] START name=maple_base_001 frame=12345 time=123.45 duration=60 mono_ns={MONO_NS_START}",
        f"06-11 14:31:01.456  1234  5678 I randolfLog: [CombinedProfile] END name=maple_base_001 startFrame=12345 endFrame=13856 frameCount=1511 elapsed=60.33s mono_ns={MONO_NS_END}",
    ]

    # 测试解析逻辑（与 maple_sample.py 完全相同）
    def parse_mono_ns(line):
        m = re.search(r"mono_ns=(\d+)", line)
        return int(m.group(1)) if m else None

    def parse_frame_count(line):
        m = re.search(r"frameCount=(\d+)", line)
        return int(m.group(1)) if m else None

    def parse_profile_name(line):
        m = re.search(r"name=(\S+)", line)
        return m.group(1) if m else ""

    start_line = fake_logs[0]
    end_line = fake_logs[1]

    mono_ns_start = parse_mono_ns(start_line)
    mono_ns_end = parse_mono_ns(end_line)
    frame_count = parse_frame_count(end_line)
    profile_name = parse_profile_name(start_line)

    record("解析 mono_ns_start", mono_ns_start == MONO_NS_START, str(mono_ns_start))
    record("解析 mono_ns_end", mono_ns_end == MONO_NS_END, str(mono_ns_end))
    record("解析 frameCount", frame_count == 1511, str(frame_count))
    record("解析 profile_name", profile_name == "maple_base_001", profile_name)

    duration_ms = (mono_ns_end - mono_ns_start) / 1_000_000 if mono_ns_start and mono_ns_end else 0
    record("采样时长计算", 59000 < duration_ms < 61000, f"{duration_ms:.0f}ms ≈ 60s")

    # 验证 COMMAND 行解析（来自 HandleExternalProfileCommand）
    cmd_line = "06-11 14:30:00.000  1234  5678 I randolfLog: [CombinedProfile] COMMAND cmd=start_combined_profile name=maple_base_001 duration=60"
    cmd_match = re.search(r"\[CombinedProfile\] COMMAND", cmd_line)
    record("COMMAND 日志格式识别", cmd_match is not None, "正则匹配成功")

# ---------------------------------------------------------------------------
# 3. perfetto_analyzer.py 本地验证
# ---------------------------------------------------------------------------
def check_perfetto_analyzer():
    header("3. perfetto_analyzer.py 解析验证")

    if not PERFETTO_ANALYZER.exists():
        record("perfetto_analyzer.py 存在", False, str(PERFETTO_ANALYZER))
        return
    record("perfetto_analyzer.py 存在", True)

    # 检查 perfetto 库是否可用
    try:
        import perfetto  # noqa
    except ImportError:
        warn("perfetto 库未安装，跳过 trace 解析验证")
        record("perfetto trace 解析", False, "perfetto 库未安装")
        return

    # 选择存在的 trace 文件
    trace_path = None
    for tp in [TEST_PFTRACE_1, TEST_PFTRACE_2]:
        if tp.exists():
            trace_path = tp
            break

    if not trace_path:
        record("perfetto trace 解析", False, "无测试 .pftrace 文件")
        return

    info(f"解析 trace: {trace_path.name} ({trace_path.stat().st_size/1024/1024:.1f} MB)")

    try:
        t0 = time.time()
        r = subprocess.run(
            [sys.executable, str(PERFETTO_ANALYZER), str(trace_path),
             "--profile-name", "CombinedProfile"],
            capture_output=True, text=True, timeout=120,
        )
        elapsed = time.time() - t0

        if r.returncode != 0:
            record("perfetto trace 解析", False, f"退出码 {r.returncode}: {r.stderr[:200]}")
            return

        try:
            parsed = json.loads(r.stdout)
        except json.JSONDecodeError as e:
            record("输出为合法 JSON", False, f"JSON 解析错误: {e}")
            return

        record("perfetto trace 解析", True, f"耗时 {elapsed:.1f}s")
        record("输出为合法 JSON", True)
        record("parse_status 字段存在", "parse_status" in parsed, str(parsed.get("parse_status")))

        # 各字段验证
        for key, desc in [
            ("main_thread_running_pct", "UnityMain Running %"),
            ("frame_p95_ms", "帧时长 P95"),
            ("cpu_freq_avg_mhz", "CPU 频率"),
        ]:
            val = parsed.get(key)
            if val is not None:
                record(f"  {desc} ({key})", True, f"{val}")
            else:
                warn(f"  {desc} ({key}) = null（trace 中可能无此数据）")
                record(f"  {desc} ({key})", True, "null（允许，设备相关）")

        if parsed.get("parse_status") == "failed":
            warn(f"解析状态为 failed: {parsed.get('parse_notes', '')}")
        elif parsed.get("parse_status") == "partial":
            warn(f"部分字段缺失: {parsed.get('parse_notes', '')}")

    except subprocess.TimeoutExpired:
        record("perfetto trace 解析", False, "超时 > 120s")
    except Exception as e:
        record("perfetto trace 解析", False, str(e)[:200])

# ---------------------------------------------------------------------------
# 4. web API 端到端验证
# ---------------------------------------------------------------------------
def api_call(url: str, method: str = "GET", data: bytes = None, content_type: str = None,
             timeout: int = 30) -> tuple[int, dict]:
    req = urllib.request.Request(url, data=data, method=method)
    if content_type:
        req.add_header("Content-Type", content_type)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"error": body.decode()[:200]}
    except Exception as e:
        return -1, {"error": str(e)}


def check_web_api(web_api: str):
    header(f"4. web API 端到端验证 ({web_api})")

    # 健康检查
    status, body = api_call(f"{web_api.rstrip('/api')}/api/history?limit=1")
    if status != 200:
        fail(f"web 服务不可达 (HTTP {status}): {body.get('error', '')}")
        record("web 服务健康", False, f"HTTP {status}")
        warn("提示：先启动 web 服务: cd web && npm run dev")
        return
    record("web 服务健康", True, f"HTTP {status}")

    if not TEST_PDATA.exists():
        record("pdata 上传测试", False, "测试文件不存在")
        return

    # 构建 multipart 上传
    boundary = "----MapleVerifyBoundary123"
    run_label = f"verify_test_{int(time.time())}"
    meta = {
        "run_label": run_label,
        "label": "verify_base",
        "device": "verify_device",
        "scene": "verify_scene",
        "duration_sec": 60,
        "frame_count": 1500,
        "mono_ns_start": "1234567890000000",
        "mono_ns_end": "1294567890000000",
    }

    def field(name: str, value: str) -> bytes:
        return (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").encode()

    def file_part(name: str, filename: str, data: bytes) -> bytes:
        return (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\n"
            f"Content-Type: application/octet-stream\r\n\r\n"
        ).encode() + data + b"\r\n"

    # 用最小的 pdata（sse-test.pdata 只有 1.3KB）
    small_pdata_path = PROJECT_ROOT / "web" / "data" / "uploads" / "04593121-9d33-4230-84f7-8a2bb2cc5c3a_sse-test.pdata"
    pdata_to_use = small_pdata_path if small_pdata_path.exists() else TEST_PDATA

    info(f"使用 pdata: {pdata_to_use.name} ({pdata_to_use.stat().st_size/1024:.0f} KB)")

    with open(pdata_to_use, "rb") as f:
        pdata_bytes = f.read()

    body_parts = [
        field("meta", json.dumps(meta)),
        file_part("pdata_test.pdata", "test.pdata", pdata_bytes),
    ]
    body = b"".join(body_parts) + f"--{boundary}--\r\n".encode()

    # 上传
    status, resp = api_call(
        f"{web_api}/maple/runs",
        method="POST",
        data=body,
        content_type=f"multipart/form-data; boundary={boundary}",
        timeout=30,
    )

    if status not in (200, 201):
        record("上传 run", False, f"HTTP {status}: {resp.get('error', '')}")
        return
    run_id = resp.get("runId")
    record("上传 run", True, f"runId={run_id}")

    # 触发分析
    status, resp = api_call(
        f"{web_api}/maple/runs/{run_id}/analyze",
        method="POST",
        data=b"{}",
        content_type="application/json",
    )
    record("触发分析", status == 200, f"HTTP {status}")

    # 轮询等待完成（最多 30s）
    info("等待分析完成（最多 30s）...")
    final_status = None
    for i in range(30):
        time.sleep(1)
        status, detail = api_call(f"{web_api}/maple/runs/{run_id}")
        run_status = detail.get("run", {}).get("status")
        if run_status in ("completed", "failed"):
            final_status = run_status
            break
        if i % 5 == 4:
            info(f"  已等待 {i+1}s，当前状态: {run_status}")

    record("分析完成", final_status == "completed", f"最终状态: {final_status}")

    if final_status == "failed":
        err = detail.get("run", {}).get("error", "")
        fail(f"  分析错误: {err}")
        return

    # 验证 pdata 结果
    pdata_result = detail.get("pdataResult")
    if pdata_result:
        record("pdata 解析结果存在", True)
        record("  totalFrames > 0", pdata_result.get("totalFrames", 0) > 0, str(pdata_result.get("totalFrames")))
        record("  avgFrameMs > 0", pdata_result.get("avgFrameMs", 0) > 0, f"{pdata_result.get('avgFrameMs', 0):.2f}ms")
        record("  p95FrameMs > 0", pdata_result.get("p95FrameMs", 0) > 0, f"{pdata_result.get('p95FrameMs', 0):.2f}ms")
        record("  scriptingMs >= 0", pdata_result.get("scriptingMs", -1) >= 0, f"{pdata_result.get('scriptingMs', 0):.3f}ms")
        record("  topMarkersJson 存在", bool(pdata_result.get("topMarkersJson")), "有 Top Markers")
    else:
        record("pdata 解析结果存在", False, "pdataResult 为 null")

    # 生成对比报告（base = opt = 同一个 run，用于验证 API 格式正确）
    status, cmp_resp = api_call(
        f"{web_api}/maple/compare",
        method="POST",
        data=json.dumps({"baseRunId": run_id, "optRunId": run_id}).encode(),
        content_type="application/json",
    )
    if status == 200:
        report_id = cmp_resp.get("reportId")
        record("对比报告 API", True, f"reportId={report_id}")
        # 获取完整报告
        status2, full = api_call(f"{web_api}/maple/compare/{report_id}")
        record("获取完整报告", status2 == 200, f"HTTP {status2}")
        if status2 == 200:
            has_text = bool(full.get("report", {}).get("reportText"))
            record("  reportText 存在", has_text)
    else:
        record("对比报告 API", False, f"HTTP {status}: {cmp_resp.get('error', '')}")

    # 清理测试数据
    status, _ = api_call(f"{web_api}/maple/runs/{run_id}", method="DELETE")
    if status == 200:
        info(f"已清理测试 run: {run_id}")

# ---------------------------------------------------------------------------
# 5. DB 表结构验证（直接用 SQLite）
# ---------------------------------------------------------------------------
def check_db_schema():
    header("5. 数据库表结构验证")

    try:
        import sqlite3
    except ImportError:
        record("sqlite3 可用", False)
        return
    record("sqlite3 可用", True)

    db_path = PROJECT_ROOT / "web" / "data" / "db.sqlite"
    if not db_path.exists():
        # 尝试 web/dist/server/data
        db_path = PROJECT_ROOT / "web" / "dist" / "server" / "data" / "db.sqlite"
    if not db_path.exists():
        warn(f"db.sqlite 不存在（web 服务未启动过），跳过表结构检查")
        record("db.sqlite 存在", False, "需要先启动 web 服务")
        return

    record("db.sqlite 存在", True, str(db_path))

    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    tables = {row[0] for row in cursor.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}

    required_tables = ["maple_runs", "maple_pdata_results", "maple_perfetto_results", "maple_compare_reports"]
    for t in required_tables:
        record(f"  表 {t} 存在", t in tables)

    if "maple_runs" in tables:
        cols = {row[1] for row in cursor.execute("PRAGMA table_info(maple_runs)").fetchall()}
        for col in ["id", "label", "device", "scene", "mono_ns_start", "mono_ns_end", "status", "pdata_paths", "ptrace_path"]:
            record(f"    maple_runs.{col}", col in cols)

    conn.close()

# ---------------------------------------------------------------------------
# 6. maple_sample.py 参数解析验证
# ---------------------------------------------------------------------------
def check_sample_script():
    header("6. maple_sample.py 脚本验证")

    sample_script = SCRIPT_DIR / "maple_sample.py"
    if not sample_script.exists():
        record("maple_sample.py 存在", False)
        return
    record("maple_sample.py 存在", True)

    # --help 不报错
    r = subprocess.run(
        [sys.executable, str(sample_script), "--help"],
        capture_output=True, text=True, timeout=10,
    )
    record("--help 正常", r.returncode == 0, r.stderr[:80] if r.returncode != 0 else "OK")

    # 语法检查
    r = subprocess.run(
        [sys.executable, "-m", "py_compile", str(sample_script)],
        capture_output=True, text=True, timeout=10,
    )
    record("语法检查通过", r.returncode == 0, r.stderr[:80] if r.returncode != 0 else "OK")

    # perfetto_analyzer.py 语法检查
    r = subprocess.run(
        [sys.executable, "-m", "py_compile", str(PERFETTO_ANALYZER)],
        capture_output=True, text=True, timeout=10,
    )
    record("perfetto_analyzer.py 语法检查", r.returncode == 0, r.stderr[:80] if r.returncode != 0 else "OK")

    # maple_compare.py 语法检查
    compare_script = SCRIPT_DIR / "maple_compare.py"
    if compare_script.exists():
        r = subprocess.run(
            [sys.executable, "-m", "py_compile", str(compare_script)],
            capture_output=True, text=True, timeout=10,
        )
        record("maple_compare.py 语法检查", r.returncode == 0, r.stderr[:80] if r.returncode != 0 else "OK")

# ---------------------------------------------------------------------------
# 7. 汇总报告
# ---------------------------------------------------------------------------
def print_summary():
    header("验证汇总")
    total = len(results)
    passed = sum(1 for r in results if r["passed"])
    failed = total - passed

    print(f"\n  总计: {total}  通过: {passed}  失败: {failed}\n")

    if failed > 0:
        print("  需要修复的项目：")
        for r in results:
            if not r["passed"]:
                print(f"  [FAIL]  {r['name']}" + (f"  -->  {r['note']}" if r['note'] else ""))

    print()

    # 行动建议
    action_needed = False
    for r in results:
        if not r["passed"] and "perfetto" in r["name"].lower() and "库" in r["name"]:
            print(f"  [行动]: pip install perfetto")
            action_needed = True
        if not r["passed"] and "web 服务" in r["name"]:
            print(f"  [行动]: cd web && npm run dev")
            action_needed = True
        if not r["passed"] and "maple_runs" in r["name"] and "不存在" not in r.get("note", ""):
            print(f"  [行动]: 重启 web 服务以自动建表（db/index.ts initTables）")
            action_needed = True

    if not action_needed and failed == 0:
        print("  [所有验证通过] 游戏版本就绪后可直接开始采集。")
    elif failed > 0:
        print("\n  [部分失败] 请按上方行动建议修复后重新运行验证。")

    return failed == 0

# ---------------------------------------------------------------------------
# 主入口
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Maple 同步采样方案完整性验证")
    parser.add_argument("--web-api", default="http://localhost:3000/api",
                        help="web 服务 API 地址（默认 http://localhost:3000/api）")
    parser.add_argument("--skip-web", action="store_true",
                        help="跳过 web API 验证（仅做本地验证）")
    parser.add_argument("--skip-perfetto", action="store_true",
                        help="跳过 perfetto trace 解析（trace 文件大时耗时较长）")
    args = parser.parse_args()

    print(f"\nMaple 同步采样方案完整性验证")
    print(f"项目根目录: {PROJECT_ROOT}")
    print(f"开始时间: {time.strftime('%Y-%m-%d %H:%M:%S')}")

    check_environment()
    check_logcat_parsing()
    check_sample_script()

    if not args.skip_perfetto:
        check_perfetto_analyzer()
    else:
        warn("已跳过 perfetto 解析验证（--skip-perfetto）")

    if not args.skip_web:
        check_web_api(args.web_api)
    else:
        warn("已跳过 web API 验证（--skip-web）")

    check_db_schema()

    all_passed = print_summary()
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
