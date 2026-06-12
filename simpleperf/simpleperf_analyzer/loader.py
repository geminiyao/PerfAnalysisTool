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


def _patch_load_record_file(record_data, time_start_ns, time_end_ns):
    """Monkey-patch record_data so load_record_file skips samples outside the window.

    RecordData.load_record_file() iterates over ReportLib.GetNextSample().
    Each raw_sample has a .time field (nanoseconds, clock_monotonic).
    We wrap the original method to skip samples whose timestamp falls
    outside [time_start_ns, time_end_ns].
    """
    original_load = record_data.load_record_file.__func__  # unbound

    def patched_load(self, record_file, show_art_frames):
        # Inline reimplementation of RecordData.load_record_file with time filter.
        # Import here to avoid circular imports.
        ndk_dir = config.NDK_SIMPLEPERF_DIR
        if ndk_dir not in sys.path:
            sys.path.insert(0, ndk_dir)
        from simpleperf_report_lib import ReportLib  # type: ignore

        lib = ReportLib()
        lib.SetRecordFile(record_file)
        lib.ShowIpForUnknownSymbol()
        if show_art_frames:
            lib.ShowArtFrames()
        if self.binary_cache_path:
            lib.SetSymfs(self.binary_cache_path)
        self.meta_info = lib.MetaInfo()
        self.cmdline = lib.GetRecordCmd()
        self.arch = lib.GetArch()

        skipped = 0
        kept = 0
        while True:
            raw_sample = lib.GetNextSample()
            if not raw_sample:
                lib.Close()
                break
            # Time filter
            if time_start_ns is not None and raw_sample.time < time_start_ns:
                skipped += 1
                continue
            if time_end_ns is not None and raw_sample.time > time_end_ns:
                skipped += 1
                continue
            kept += 1

            raw_event = lib.GetEventOfCurrentSample()
            symbol = lib.GetSymbolOfCurrentSample()
            callchain = lib.GetCallChainOfCurrentSample()
            event = self._get_event(raw_event.name)
            self.total_samples += 1
            event.sample_count += 1
            event.event_count += raw_sample.period
            process = event.get_process(raw_sample.pid)
            process.event_count += raw_sample.period
            thread = process.get_thread(raw_sample.tid, raw_sample.thread_comm)
            thread.event_count += raw_sample.period
            thread.sample_count += 1

            lib_id = self.libs.get_lib_id(symbol.dso_name)
            func_id = self.functions.get_func_id(lib_id, symbol)
            callstack = [(lib_id, func_id, symbol.vaddr_in_file)]
            for i in range(callchain.nr):
                sym = callchain.entries[i].symbol
                l_id = self.libs.get_lib_id(sym.dso_name)
                f_id = self.functions.get_func_id(l_id, sym)
                callstack.append((l_id, f_id, sym.vaddr_in_file))
            if len(callstack) > 750:  # MAX_CALLSTACK_LENGTH
                callstack = callstack[:750]
            thread.add_callstack(raw_sample.period, callstack, self.build_addr_hit_map)

        for event in self.events.values():
            for thread in event.threads:
                thread.update_subtree_event_count()

        print(f"[INFO] 时间窗口过滤: 保留 {kept} 个 sample，跳过 {skipped} 个")

    import types
    record_data.load_record_file = types.MethodType(patched_load, record_data)


def load_profile(
    path,
    binary_cache=None,
    label=None,
    aggregate_by_thread_name=False,
    min_func_percent=None,
    min_callchain_percent=None,
    time_start_ns=None,
    time_end_ns=None,
):
    """Load a perf.data file and return a :class:`Profile`.

    :param path: perf.data file path.
    :param binary_cache: path to binary_cache dir (for symbolization). May be
        None; symbols then come from whatever is embedded in perf.data.
    :param aggregate_by_thread_name: merge threads sharing a name (useful when
        averaging multiple runs of the same app).
    :param time_start_ns: if given, only include samples with timestamp >= this value (ns).
    :param time_end_ns: if given, only include samples with timestamp <= this value (ns).
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

    if time_start_ns is not None or time_end_ns is not None:
        # Monkey-patch load_record_file to filter samples by timestamp.
        # RecordData.load_record_file loops over ReportLib.GetNextSample();
        # raw_sample.time is the nanosecond clock_monotonic timestamp.
        _patch_load_record_file(record_data, time_start_ns, time_end_ns)

    record_data.load_record_file(path, False)
    if aggregate_by_thread_name:
        record_data.aggregate_by_thread_name()
    record_data.limit_percents(min_func_percent, min_callchain_percent)

    record_info = record_data.gen_record_info()
    return Profile(path, record_info, label=label)
