"""config.py - Configurable parameters for the simpleperf analysis toolkit.

All values can be overridden via environment variables or by editing this file.
The most important one is ``NDK_SIMPLEPERF_DIR`` which must point at the
``simpleperf`` folder shipped inside the Android NDK, because the toolkit
re-uses the official ``simpleperf_report_lib`` / ``report_html.RecordData``.
"""

import os

# ---------------------------------------------------------------------------
# NDK / simpleperf location
# ---------------------------------------------------------------------------
# Directory that contains report_html.py, simpleperf_report_lib.py,
# app_profiler.py, etc. (i.e. <ndk>/simpleperf).
NDK_SIMPLEPERF_DIR = os.environ.get(
    "NDK_SIMPLEPERF_DIR",
    r"D:/Android/android-ndk-r21e-windows-x86_64/simpleperf",
)

# Optional ndk_path passed to RecordData (used to locate addr2line/objdump for
# source/disassembly annotation). None lets simpleperf auto-detect.
NDK_PATH = os.environ.get("NDK_PATH") or None

# ---------------------------------------------------------------------------
# Event handling
# ---------------------------------------------------------------------------
# Events that represent CPU time. record_info['sampleInfo'][i]['eventName']
# is matched against this set when building the per-thread call tree.
CPU_EVENT_NAMES = ("cpu-clock", "cpu-cycles:u", "cpu-cycles", "task-clock")

# simpleperf reports event_count in raw units; for cpu-clock 1 unit == 1 ns,
# so dividing by this scale yields milliseconds. Kept configurable because
# cpu-cycles is frequency dependent and only meaningful as a proportion.
TIME_SCALE_NS = 1_000_000.0  # ns -> ms

# ---------------------------------------------------------------------------
# Anchor functions (Level 2 subtree comparison)
# ---------------------------------------------------------------------------
# Substring match against function names. Sensible defaults for Unity games.
DEFAULT_ANCHOR_FUNCS = [
    "ExecutePlayerLoop",                 # main-thread total
    "ScriptRunBehaviourUpdate",          # C# Update phase
    "GfxDeviceWorker::RunCommand",       # render thread
    "TranscriptScriptableRenderContext::ExecuteScriptableRenderLoop",
]

# Functions used to identify a "characteristic" thread (Level 3). A thread is
# only diffed if its call tree contains one of these.
THREAD_CHARACTERISTIC_FUNCS = [
    "ExecutePlayerLoop",
    "GfxDeviceWorker::RunCommand",
    "TranscriptScriptableRenderContext::ExecuteScriptableRenderLoop",
]

# ---------------------------------------------------------------------------
# Library filtering
# ---------------------------------------------------------------------------
# When no explicit whitelist is given, libs whose basename contains any of
# these tokens are considered "interesting" (auto-detected from libList).
DEFAULT_LIB_TOKENS = [
    "libil2cpp.so",
    "libunity.so",
    "libxlua.so",
    "lib_burst_generated.so",
    "base.odex",
    "base.vdex",
]

# Function names containing any of these are ignored entirely.
FUNC_NAME_BLACK_LIST = ["gcloud", "crashsight"]

# These pseudo-roots should not be recorded as anchor nodes themselves.
NO_RECORD_FUNC_NAMES = ["PlayerLoop"]

# ---------------------------------------------------------------------------
# Thresholds / limits
# ---------------------------------------------------------------------------
MAX_CALLSTACK_LENGTH = 750
# Minimum |delta| in ms for a function to appear in a Level 3 diff.
TIME_THRESHOLD_MS = 5.0
# Defaults forwarded to RecordData.limit_percents.
MIN_FUNC_PERCENT = 0.01
MIN_CALLCHAIN_PERCENT = 0.01
# Top-N hotspots for single profile analysis.
DEFAULT_TOP_N = 30


def resolve_lib_whitelist(lib_list, tokens=None):
    """Auto-detect interesting libs from a perf.data ``libList``.

    :param lib_list: list of full lib paths (record_info['libList']).
    :param tokens: iterable of substrings; defaults to DEFAULT_LIB_TOKENS.
    :return: set of full lib paths that match any token.
    """
    tokens = tokens or DEFAULT_LIB_TOKENS
    whitelist = set()
    for name in lib_list:
        base = os.path.basename(name)
        for tok in tokens:
            if tok in base or tok in name:
                whitelist.add(name)
                break
    return whitelist
