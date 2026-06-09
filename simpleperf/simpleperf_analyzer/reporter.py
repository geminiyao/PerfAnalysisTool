"""reporter.py - Output formatting for analysis results.

Every analysis module returns a plain dict. This module turns those dicts into:
  * JSON  (machine-readable, the integration contract for web/electron)
  * text  (human-readable summary printed to console / saved to .txt)
  * CSV   (tabular, for spreadsheets / regression trends)

Usage:
    from simpleperf_analyzer import reporter
    reporter.write_json(result, "result/compare.json")
    print(reporter.format_compare_text(result))
"""

import csv
import io
import json
import os


# ---------------------------------------------------------------------------
# Generic helpers
# ---------------------------------------------------------------------------
def ensure_dir(path):
    d = os.path.dirname(os.path.abspath(path))
    if d and not os.path.isdir(d):
        os.makedirs(d)


def write_json(data, path):
    ensure_dir(path)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return path


def write_text(text, path):
    ensure_dir(path)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    return path


def _pct(value):
    return "%+.2f%%" % value


def _fmt_ms(value):
    return "%.2f" % value


# ---------------------------------------------------------------------------
# Compare (Level 1 + 2 + 3) text rendering
# ---------------------------------------------------------------------------
def format_compare_text(result):
    """Render a full comparison result dict to human-readable text."""
    out = io.StringIO()
    meta = result.get("meta", {})
    out.write("=" * 72 + "\n")
    out.write("Native Performance Comparison\n")
    out.write("  baseline: %s\n" % meta.get("baseline", "?"))
    out.write("  current : %s\n" % meta.get("current", "?"))
    out.write("  event   : %s\n" % meta.get("event", "?"))
    out.write("=" * 72 + "\n\n")

    if "level1_so_compare" in result:
        out.write(_format_level1(result["level1_so_compare"]))
    if "level2_anchor_compare" in result:
        out.write(_format_level2(result["level2_anchor_compare"]))
    if "level3_func_diff" in result:
        out.write(_format_level3(result["level3_func_diff"]))
    if "summary" in result:
        out.write(_format_summary(result["summary"]))
    return out.getvalue()


def _format_level1(level1):
    out = io.StringIO()
    out.write("-" * 72 + "\n")
    out.write("Level 1 - So-level CPU proportion (per thread)\n")
    out.write("-" * 72 + "\n")
    for thread in level1.get("threads", []):
        out.write("[%s]\n" % thread["name"])
        out.write("  %-32s %10s %10s %10s\n"
                  % ("so", "base%", "cur%", "delta"))
        for lib in thread.get("libs", []):
            out.write("  %-32s %9.2f%% %9.2f%% %9s\n" % (
                lib["name"][:32],
                lib["baseline_pct"],
                lib["current_pct"],
                _pct(lib["delta_pct"]),
            ))
        out.write("\n")
    return out.getvalue()


def _format_level2(level2):
    out = io.StringIO()
    out.write("-" * 72 + "\n")
    out.write("Level 2 - Anchor subtree time\n")
    out.write("-" * 72 + "\n")
    out.write("  %-44s %10s %10s %8s\n"
              % ("anchor", "base(ms)", "cur(ms)", "delta"))
    for a in level2.get("anchors", []):
        out.write("  %-44s %10s %10s %8s\n" % (
            a["name"][:44],
            _fmt_ms(a["baseline_ms"]),
            _fmt_ms(a["current_ms"]),
            _pct(a["delta_pct"]),
        ))
    out.write("\n")
    return out.getvalue()


def _format_level3(level3):
    out = io.StringIO()
    out.write("-" * 72 + "\n")
    out.write("Level 3 - Function-level diff (A=Added M=Modified D=Deleted)\n")
    out.write("-" * 72 + "\n")
    out.write(level3.get("text", "  (no text representation)\n"))
    out.write("\n")
    return out.getvalue()


def _format_summary(summary):
    out = io.StringIO()
    out.write("=" * 72 + "\n")
    out.write("Summary\n")
    out.write("=" * 72 + "\n")
    for k, v in summary.items():
        if isinstance(v, float):
            out.write("  %-36s %s\n" % (k, _pct(v) if "pct" in k else "%.2f" % v))
        else:
            out.write("  %-36s %s\n" % (k, v))
    return out.getvalue()


# ---------------------------------------------------------------------------
# Single profile text rendering
# ---------------------------------------------------------------------------
def format_single_text(result):
    out = io.StringIO()
    meta = result.get("meta", {})
    out.write("=" * 72 + "\n")
    out.write("Single Profile Analysis: %s\n" % meta.get("file", "?"))
    out.write("  event: %s  totalSamples: %s\n"
              % (meta.get("event", "?"), meta.get("total_samples", "?")))
    out.write("=" * 72 + "\n\n")

    out.write("Top hotspots (self time):\n")
    out.write("  %-44s %12s %8s\n" % ("function", "self(ms)", "pct"))
    for h in result.get("hotspots", []):
        out.write("  %-44s %12s %7.2f%%\n"
                  % (h["func"][:44], _fmt_ms(h["self_ms"]), h["pct"]))
    out.write("\n")

    out.write("Per-thread CPU breakdown:\n")
    for t in result.get("threads", []):
        out.write("  %-24s %10s ms  %6.2f%%\n"
                  % (t["name"][:24], _fmt_ms(t["self_ms"]), t["pct"]))
    out.write("\n")

    out.write("Per-so CPU breakdown:\n")
    for s in result.get("libs", []):
        out.write("  %-44s %10s ms  %6.2f%%\n"
                  % (s["name"][:44], _fmt_ms(s["self_ms"]), s["pct"]))
    out.write("\n")
    return out.getvalue()


# ---------------------------------------------------------------------------
# Regression / CSV rendering
# ---------------------------------------------------------------------------
def write_regression_csv(result, path):
    """Write multi-version trends to CSV (one row per version)."""
    ensure_dir(path)
    versions = result.get("versions", [])
    lib_keys = result.get("lib_keys", [])
    anchor_keys = result.get("anchor_keys", [])
    with open(path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        header = ["version"] + ["so:" + k for k in lib_keys] \
            + ["anchor:" + k for k in anchor_keys]
        w.writerow(header)
        for v in versions:
            row = [v["label"]]
            row += [v["libs"].get(k, "") for k in lib_keys]
            row += [v["anchors"].get(k, "") for k in anchor_keys]
            w.writerow(row)
    return path


def format_regression_text(result):
    out = io.StringIO()
    out.write("=" * 72 + "\n")
    out.write("Multi-version Regression Trend\n")
    out.write("=" * 72 + "\n\n")
    for trend in result.get("trends", []):
        out.write("[%s]\n" % trend["metric"])
        for point in trend["points"]:
            out.write("  %-24s %s\n" % (point["label"], point["value"]))
        if "mean" in trend:
            out.write("  -> mean=%.2f stddev=%.2f\n" % (trend["mean"], trend["stddev"]))
        out.write("\n")
    return out.getvalue()
