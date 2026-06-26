"""Metric key sanitization helpers."""

import re

_LIB_EXT = re.compile(r"\.(so|odex|vdex|oat|apk|dex)(\[|$)")


def sanitize_lib(lib_basename):
    name = lib_basename
    m = _LIB_EXT.search(name)
    if m:
        name = name[: m.start()]
    name = name.strip("[]")
    return re.sub(r"[^A-Za-z0-9_]+", "_", name).strip("_") or "unknown"


def sanitize_thread(name):
    return re.sub(r"[^A-Za-z0-9_]+", "_", name or "unknown").strip("_") or "unknown"


def sanitize_func(name, max_len=80):
    s = re.sub(r"[^A-Za-z0-9_]+", "_", name or "").strip("_")
    if len(s) > max_len:
        s = s[:max_len].rstrip("_")
    return s or "anon"


def thread_key(thread):
    """Composite key {comm}#{tid} for thread dicts."""
    return "%s#%d" % (thread["thread_name"], thread["tid"])
