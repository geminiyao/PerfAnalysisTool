"""UnityMain 栈 unwind 自检 — 对齐 docs/simpleperf_symbol_fix/_selfcheck.py 判据。"""

import os
import subprocess
import sys

from . import config


def _find_simpleperf_exe():
    ndk = config.NDK_SIMPLEPERF_DIR
    candidates = [
        os.path.join(ndk, 'bin', 'windows', 'x86_64', 'simpleperf.exe'),
        os.path.join(ndk, 'bin', 'linux', 'x86_64', 'simpleperf'),
    ]
    for c in candidates:
        if os.path.isfile(c):
            return c
    for root, _dirs, files in os.walk(ndk):
        for name in ('simpleperf.exe', 'simpleperf'):
            if name in files:
                return os.path.join(root, name)
    return None


def run_stack_selfcheck(perf_path, binary_cache=None, out_dir=None, timeout_sec=180):
    """跑 report-sample + _selfcheck.py，返回 dict 写入 symbolCheck.stackUnwind。"""
    perf_path = os.path.abspath(perf_path)
    sp = _find_simpleperf_exe()
    if not sp:
        return {"status": "SKIP", "message": "simpleperf.exe not found (NDK_SIMPLEPERF_DIR)"}

    samples_path = os.path.join(out_dir or os.path.dirname(perf_path), 'samples.selfcheck.tmp')
    cmd = [sp, 'report-sample', '--show-callchain', '-i', perf_path]
    if binary_cache and os.path.isdir(binary_cache):
        cmd.extend(['--symdir', os.path.abspath(binary_cache)])

    try:
        with open(samples_path, 'w', encoding='utf-8', errors='replace') as out:
            proc = subprocess.run(
                cmd, stdout=out, stderr=subprocess.PIPE, timeout=timeout_sec,
                text=True, errors='replace',
            )
        if proc.returncode != 0:
            return {
                "status": "SKIP",
                "message": "report-sample failed (code %s): %s" % (proc.returncode, (proc.stderr or '')[:200]),
            }
    except subprocess.TimeoutExpired:
        return {"status": "SKIP", "message": "report-sample timeout (%ss)" % timeout_sec}
    except OSError as e:
        return {"status": "SKIP", "message": str(e)}

    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    selfcheck = os.path.join(repo_root, 'docs', 'simpleperf_symbol_fix', '_selfcheck.py')
    if not os.path.isfile(selfcheck):
        return {"status": "SKIP", "message": "_selfcheck.py not found"}

    try:
        proc = subprocess.run(
            [sys.executable, selfcheck, samples_path],
            capture_output=True, text=True, timeout=60, errors='replace',
        )
        text = (proc.stdout or '') + (proc.stderr or '')
    except Exception as e:
        return {"status": "SKIP", "message": str(e)}

    status = "WARN"
    if "[OK] HEALTHY" in text:
        status = "PASS"
    elif "[FAIL] BROKEN" in text:
        status = "FAIL"
    elif "no UnityMain samples" in text:
        status = "SKIP"

    return {
        "status": status,
        "samplesPath": samples_path,
        "summary": text.strip()[-800:] if text else "",
        "ref": "docs/simpleperf_symbol_fix/SIMPLEPERF_TROUBLESHOOTING.md",
    }
