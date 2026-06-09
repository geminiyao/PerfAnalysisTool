"""loader.py - Clean wrapper around the official simpleperf ``RecordData``.

This module hides the ``sys.path`` juggling required to import the NDK's
``report_html`` module and exposes a small, stable API used by every analysis
module:

    profile = load_profile("perf.data", binary_cache="binary_cache")
    profile.record_info        # raw dict from RecordData.gen_record_info()
    profile.lib_id_to_name     # list: lib_id -> full path
    profile.function_map       # dict: func_id -> {'l': lib_id, 'f': name}
    profile.lib_list           # list of lib paths
    tree = profile.build_record_tree()   # {process_name: {tid: {...}}}

The call tree node shape (compatible with the original aoe_report_diff.py):
    {
        'lib_id': int,
        'func_name': str,
        'event_count': int,
        'subtree_event_count': int,
        'child_graph': [ ...nodes... ],
    }
"""

import os
import sys

from . import config

_RECORD_DATA_CLS = None


def _import_record_data():
    """Import RecordData from the NDK simpleperf dir, caching the class."""
    global _RECORD_DATA_CLS
    if _RECORD_DATA_CLS is not None:
        return _RECORD_DATA_CLS

    ndk_dir = config.NDK_SIMPLEPERF_DIR
    if not os.path.isdir(ndk_dir):
        raise RuntimeError(
            "NDK simpleperf dir not found: %s\n"
            "Set NDK_SIMPLEPERF_DIR env var or edit config.py." % ndk_dir
        )
    if ndk_dir not in sys.path:
        # Insert at front so the NDK's report_html/utils win over any clash.
        sys.path.insert(0, ndk_dir)
    try:
        from report_html import RecordData  # type: ignore
    except Exception as exc:  # pragma: no cover - environment dependent
        raise RuntimeError(
            "Failed to import RecordData from %s: %s" % (ndk_dir, exc)
        )
    _RECORD_DATA_CLS = RecordData
    return RecordData


def _modify_text_from_html(text):
    return text.replace("&gt;", ">").replace("&lt;", "<")


class Profile(object):
    """Loaded perf.data with convenient accessors and a built call tree."""

    def __init__(self, path, record_info, label=None):
        self.path = path
        self.label = label or os.path.basename(path)
        self.record_info = record_info
        self.lib_id_to_name = record_info["libList"]
        self.function_map = record_info["functionMap"]
        self.lib_list = record_info["libList"]
        self.total_samples = record_info.get("totalSamples", 0)
        self.record_time = record_info.get("recordTime", "")
        self.machine_type = record_info.get("machineType", "")
        self._tree = None

    # -- raw helpers --------------------------------------------------------
    def lib_name(self, lib_id):
        if lib_id is None or lib_id < 0:
            return ""
        return self.lib_id_to_name[lib_id]

    def func_name(self, func_id):
        if func_id is None or func_id < 0:
            return ""
        return _modify_text_from_html(self.function_map[func_id]["f"])

    def func_lib_id(self, func_id):
        if func_id is None or func_id < 0:
            return -1
        return self.function_map[func_id]["l"]

    # -- call tree ----------------------------------------------------------
    def build_record_tree(self):
        """Build {process_name: {tid: thread_dict}} from CPU sample info.

        thread_dict has keys: 'tid', 'thread_name', 'event_count',
        'libs' (raw), and 'call_graph' (recursive node dict).
        """
        if self._tree is not None:
            return self._tree

        info = self.record_info
        thread_names = info["threadNames"]
        process_names = info["processNames"]

        tree = {}
        for sample_info in info["sampleInfo"]:
            if sample_info["eventName"] not in config.CPU_EVENT_NAMES:
                continue
            for process in sample_info["processes"]:
                pid = process["pid"]
                pname = process_names.get(pid) or str(pid)
                proc_dict = tree.setdefault(pname, {})
                for thread in process["threads"]:
                    tid = thread["tid"]
                    tname = thread_names.get(tid) or str(tid)
                    call_graph = self._process_call_graph(thread["g"])
                    if not call_graph["func_name"]:
                        call_graph["func_name"] = tname
                    proc_dict[tid] = {
                        "tid": tid,
                        "thread_name": tname,
                        "event_count": thread.get("eventCount", 0),
                        "libs": thread.get("libs", []),
                        "call_graph": call_graph,
                    }
        self._tree = tree
        return tree

    def _process_call_graph(self, node):
        func_id = node["f"]
        func_name = ""
        lib_id = -1
        if func_id != -1:
            fm = self.function_map[func_id]
            lib_id = fm["l"]
            func_name = _modify_text_from_html(fm["f"])
        children = [self._process_call_graph(c) for c in node["c"]]
        return {
            "lib_id": lib_id,
            "func_name": func_name,
            "event_count": node["e"],
            "subtree_event_count": node["s"],
            "child_graph": children,
        }

    def iter_threads(self):
        """Yield (process_name, thread_dict) for every thread."""
        for pname, proc in self.build_record_tree().items():
            for thread in proc.values():
                yield pname, thread


def load_profile(
    path,
    binary_cache=None,
    label=None,
    aggregate_by_thread_name=False,
    min_func_percent=None,
    min_callchain_percent=None,
):
    """Load a perf.data file and return a :class:`Profile`.

    :param path: perf.data file path.
    :param binary_cache: path to binary_cache dir (for symbolization). May be
        None; symbols then come from whatever is embedded in perf.data.
    :param aggregate_by_thread_name: merge threads sharing a name (useful when
        averaging multiple runs of the same app).
    """
    record_data_cls = _import_record_data()

    if min_func_percent is None:
        min_func_percent = config.MIN_FUNC_PERCENT
    if min_callchain_percent is None:
        min_callchain_percent = config.MIN_CALLCHAIN_PERCENT

    if binary_cache and not os.path.isdir(binary_cache):
        binary_cache = None

    sys.setrecursionlimit(config.MAX_CALLSTACK_LENGTH * 2 + 50)

    record_data = record_data_cls(binary_cache, False, config.NDK_PATH)
    record_data.load_record_file(path, False)
    if aggregate_by_thread_name:
        record_data.aggregate_by_thread_name()
    record_data.limit_percents(min_func_percent, min_callchain_percent)

    record_info = record_data.gen_record_info()
    return Profile(path, record_info, label=label)
