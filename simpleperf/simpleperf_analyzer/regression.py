"""regression.py - Multi-version trend analysis.

Accepts N labelled perf.data files and tracks how key metrics evolve:
  * proportion (%) of each interesting so within UnityMain (or globally)
  * anchor-function subtree time (ms)

It computes mean +/- stddev per metric so a reviewer can judge whether a
version-to-version change is real or within noise. When multiple runs of the
SAME version are provided, group them by label first (see batch_compare.py).
"""

import math

from . import config
from . import so_compare
from . import anchor_compare


def _global_so_pct(profile, tokens=None):
    """Proportion (%) of each interesting so across the whole process."""
    info = profile.record_info
    lib_acc = {}
    total = 0
    for sample_info in info["sampleInfo"]:
        if sample_info["eventName"] not in config.CPU_EVENT_NAMES:
            continue
        for process in sample_info["processes"]:
            for thread in process["threads"]:
                for lib in thread.get("libs", []):
                    name = profile.lib_name(lib["libId"])
                    base = name.rsplit("/", 1)[-1] if name else "[unknown]"
                    ec = lib.get("eventCount", 0)
                    lib_acc[base] = lib_acc.get(base, 0) + ec
                    total += ec
    total = total or 1
    tokens = tokens or config.DEFAULT_LIB_TOKENS
    out = {}
    for base, ec in lib_acc.items():
        if any(tok in base for tok in tokens):
            out[base] = round(ec / total * 100.0, 3)
    return out


def _stats(values):
    if not values:
        return 0.0, 0.0
    mean = sum(values) / len(values)
    var = sum((v - mean) ** 2 for v in values) / len(values)
    return mean, math.sqrt(var)


def analyze(profiles, anchors=None, lib_tokens=None):
    """Build a trend report from a list of (label, profile) pairs.

    :param profiles: list of (label, Profile).
    :return: dict consumable by reporter.format_regression_text / write_regression_csv.
    """
    anchors = anchors or config.DEFAULT_ANCHOR_FUNCS

    versions = []
    lib_keys = set()
    anchor_keys = set()
    for label, profile in profiles:
        so_pct = _global_so_pct(profile, lib_tokens)
        anchor_ms = anchor_compare._profile_anchor_ms(profile, anchors)
        lib_keys |= set(so_pct)
        anchor_keys |= set(k for k, v in anchor_ms.items() if v > 0)
        versions.append({
            "label": label,
            "libs": so_pct,
            "anchors": {k: round(v, 3) for k, v in anchor_ms.items()},
        })

    lib_keys = sorted(lib_keys)
    anchor_keys = sorted(anchor_keys)

    trends = []
    for key in lib_keys:
        points = [{"label": v["label"], "value": v["libs"].get(key, 0.0)}
                  for v in versions]
        mean, std = _stats([p["value"] for p in points])
        trends.append({"metric": "so%% " + key, "points": points,
                       "mean": round(mean, 3), "stddev": round(std, 3)})
    for key in anchor_keys:
        points = [{"label": v["label"], "value": v["anchors"].get(key, 0.0)}
                  for v in versions]
        mean, std = _stats([p["value"] for p in points])
        trends.append({"metric": "anchor_ms " + key, "points": points,
                       "mean": round(mean, 3), "stddev": round(std, 3)})

    return {
        "versions": versions,
        "lib_keys": lib_keys,
        "anchor_keys": anchor_keys,
        "trends": trends,
    }
