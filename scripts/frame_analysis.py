#!/usr/bin/env python3
"""frame_analysis.py — L1–L3 帧分析引擎 (perfetto / 共用逻辑)。

契约: docs/frame-analysis-data-contract.md
规格: docs/aoe-watch-spec.json
"""

from __future__ import annotations

import fnmatch
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC_JSON = os.path.join(ROOT, "docs", "aoe-watch-spec.json")
DEVICE_MAP_JSON = os.path.join(ROOT, "docs", "device-tier-map.json")

_SPEC_CACHE = None
_DEVICE_MAP_CACHE = None


def _round(n, d=2):
    try:
        return round(float(n), d)
    except (TypeError, ValueError):
        return 0.0


def _pct(sorted_vals, p):
    if not sorted_vals:
        return 0.0
    i = int((len(sorted_vals) - 1) * p / 100)
    return sorted_vals[max(0, min(i, len(sorted_vals) - 1))]


def load_watch_spec(path=None):
    global _SPEC_CACHE
    if path is None and _SPEC_CACHE is not None:
        return _SPEC_CACHE
    p = path or SPEC_JSON
    with open(p, encoding="utf-8") as f:
        spec = json.load(f)
    if path is None:
        _SPEC_CACHE = spec
    return spec


def load_device_tier_map(path=None):
    global _DEVICE_MAP_CACHE
    if path is None and _DEVICE_MAP_CACHE is not None:
        return _DEVICE_MAP_CACHE
    p = path or DEVICE_MAP_JSON
    if not os.path.isfile(p):
        return {"defaultTier": "unknown", "tiers": {}}
    with open(p, encoding="utf-8") as f:
        m = json.load(f)
    if path is None:
        _DEVICE_MAP_CACHE = m
    return m


def resolve_device_tier(device, target_fps=60.0):
    m = load_device_tier_map()
    default = m.get("defaultTier", "unknown")
    if not device:
        return default, 1000.0 / target_fps if target_fps else 16.67
    tiers = m.get("tiers", {})
    dev = device.strip()
    for tier in ("high", "mid", "low"):
        cfg = tiers.get(tier, {})
        if dev in cfg.get("devices", []):
            budget = cfg.get("frameBudgetMs") or (1000.0 / target_fps)
            return tier, float(budget)
        for pat in cfg.get("patterns", []):
            if fnmatch.fnmatch(dev, pat):
                budget = cfg.get("frameBudgetMs") or (1000.0 / target_fps)
                return tier, float(budget)
    spec = load_watch_spec()
    unk = spec.get("deviceTiers", {}).get("unknown", {})
    budget = unk.get("frameBudgetMs", 1000.0 / target_fps if target_fps else 16.67)
    return default, float(budget)


def resolve_preset(scene, spec=None):
    spec = spec or load_watch_spec()
    scene = scene or ""
    for name, preset in spec.get("presets", {}).items():
        if name == "default":
            continue
        for pat in preset.get("matchScenePatterns", []):
            if fnmatch.fnmatch(scene, pat):
                return name
    return "default"


def build_watch_spec_snapshot(device_tier, frame_budget_ms, scene, spec=None):
    spec = spec or load_watch_spec()
    preset = resolve_preset(scene, spec)
    return {
        "version": spec.get("version", 1),
        "schemaRef": spec.get("schemaRef", "docs/frame-analysis-data-contract.md"),
        "preset": preset,
        "deviceTier": device_tier,
        "frameBudgetMs": _round(frame_budget_ms, 2),
        "targets": spec.get("watchTargets", []),
        "specPath": "docs/aoe-watch-spec.json",
    }


def frame_summary_from_timings(timings, frame_budget_ms=16.67):
    if not timings:
        return {
            "count": 0, "p50Ms": 0, "p95Ms": 0, "p99Ms": 0, "fps": 0,
            "slowFrameRate33": 0, "slowFrameRate50": 0,
        }
    s = sorted(timings)
    n = len(s)
    avg = sum(s) / n
    p50, p95, p99 = _pct(s, 50), _pct(s, 95), _pct(s, 99)
    worst_i = max(range(n), key=lambda i: timings[i])
    median_i = min(range(n), key=lambda i: abs(timings[i] - p50))
    p95_i = min(range(n), key=lambda i: abs(timings[i] - p95))
    slow33 = len([x for x in timings if x > 33.0]) / n * 100
    slow50 = len([x for x in timings if x > 50.0]) / n * 100
    return {
        "count": n,
        "p50Ms": _round(p50),
        "p95Ms": _round(p95),
        "p99Ms": _round(p99),
        "fps": _round(1000.0 / avg if avg else 0, 1),
        "slowFrameRate33": _round(slow33),
        "slowFrameRate50": _round(slow50),
        "worstFrameIndex": worst_i,
        "medianFrameIndex": median_i,
        "p95FrameIndex": p95_i,
    }


def slow_frame_entries(timings, top_n=5):
    indexed = sorted(enumerate(timings), key=lambda x: x[1], reverse=True)
    return [{"frameIndex": i, "ms": _round(ms), "rank": r + 1}
            for r, (i, ms) in enumerate(indexed[:top_n])]


# ------------------------------------------------------------
# Perfetto: PlayerLoop 帧
# ------------------------------------------------------------

def _win_for_slice(win):
    """Provider 的 win 形如 'AND ts >= N AND ts <= M'，slice 查询需表前缀。"""
    if not win:
        return ""
    return win.replace("ts >=", "s.ts >=").replace("ts <=", "s.ts <=")


def player_loop_frames(tp, utid, win, safe_query):
    """枚举外层 PlayerLoop slice (排除父子同名嵌套 wrapper)。"""
    win_s = _win_for_slice(win)
    rows = safe_query("""
        SELECT s.id id, s.ts ts, s.dur dur, p.name pname
        FROM slice s
        JOIN thread_track tt ON s.track_id = tt.id
        LEFT JOIN slice p ON s.parent_id = p.id
        WHERE tt.utid = %d AND s.name = 'PlayerLoop' %s
        ORDER BY s.ts
    """ % (utid, win_s), "playerloop frames")
    if not rows:
        return []
    out = []
    for r in rows:
        if (r.pname or "") == "PlayerLoop":
            continue
        dur_ms = float(r.dur or 0) / 1e6
        if dur_ms < 1.0:
            continue
        out.append({"id": int(r.id), "ts": int(r.ts), "durMs": _round(dur_ms, 3),
                    "endTs": int(r.ts) + int(r.dur or 0)})
    return out


def slice_ms_in_window(tp, utid, patterns, ts_start, ts_end, safe_query):
    """窗口内匹配 slice 名模式的总 dur (ms)。"""
    total_ns = 0
    for pat in patterns:
        rows = safe_query("""
            SELECT SUM(s.dur) sum_ns FROM slice s
            JOIN thread_track tt ON s.track_id = tt.id
            WHERE tt.utid = %d AND s.name LIKE '%%%s%%'
              AND s.ts >= %d AND s.ts < %d
        """ % (utid, pat.replace("'", "''"), ts_start, ts_end), "slice win %s" % pat)
        if rows and rows[0].sum_ns:
            total_ns += int(rows[0].sum_ns)
    return _round(total_ns / 1e6, 3) if total_ns else 0.0


def classify_contexts_perfetto(tp, utid, frames, classifiers, safe_query):
    """L1.5: 按帧 context 标签。"""
    by_frame = []
    counts = {}
    for fi, fr in enumerate(frames):
        labels = {}
        evidence = []
        ts0, ts1 = fr["ts"], fr["endTs"]
        for cid, cfg in classifiers.items():
            if cfg.get("not"):
                continue
            ap = cfg.get("anyPresent", {})
            pats = ap.get("perfettoSlicePatterns", [])
            hit = False
            for pat in pats:
                ms = slice_ms_in_window(tp, utid, [pat], ts0, ts1, safe_query)
                if ms > 0:
                    hit = True
                    evidence.append({"classifierId": cid, "markers": [pat], "confidence": "high"})
                    break
            if hit:
                domain = cid.split("-")[0] if "-" in cid else cid
                state = cid.split("-", 1)[1] if "-" in cid else "active"
                labels[domain] = state
                counts[cid] = counts.get(cid, 0) + 1
        # camera-idle = not dragging
        drag_cfg = classifiers.get("camera-dragging", {})
        idle_cfg = classifiers.get("camera-idle", {})
        if idle_cfg.get("not") == "camera-dragging":
            if labels.get("camera") != "dragging":
                labels["camera"] = "idle"
        by_frame.append({"frameIndex": fi, "labels": labels, "evidence": evidence or None})
    return by_frame, {"byClassifier": counts}


def build_series_perfetto(tp, utid, frames, targets, safe_query):
    series = []
    for tgt in targets:
        m = tgt.get("match", {}).get("perfetto")
        if not m:
            continue
        pats = m.get("patterns", [])
        timings = []
        for fr in frames:
            ms = slice_ms_in_window(tp, utid, pats, fr["ts"], fr["endTs"], safe_query)
            timings.append(ms if ms > 0 else None)
        present = [t for t in timings if t is not None]
        med = _pct(sorted(present), 50) if present else 0
        series.append({
            "targetId": tgt["id"],
            "timings": timings,
            "presentCount": len(present),
            "summary": {
                "medianMs": _round(med),
                "p95Ms": _round(_pct(sorted(present), 95)) if present else 0,
                "maxMs": _round(max(present)) if present else 0,
            },
        })
    return series


def _eval_when(when, ctx, frame_ms, stats, device_tier):
    if not when or when == "always":
        return True
    when = when.strip()
    if when.startswith("context."):
        # context.camera == idle
        parts = when.replace("context.", "").split("==")
        if len(parts) == 2:
            key = parts[0].strip()
            val = parts[1].strip()
            return ctx.get("labels", {}).get(key) == val
        return False
    if "frameMs < frameP50" in when:
        ratio = 0.85
        if "frameBelowP50Ratio" in when:
            pass
        return frame_ms < stats["p50Ms"] * ratio
    if "frameMs >= frameP95" in when:
        ratio = 0.9
        return frame_ms >= stats["p95Ms"] * ratio
    return True


def _apply_rule(rule_ref, params, series_ms, frame_ms, frame_budget_ms, series_median, stats):
    p = dict(params or {})
    if rule_ref == "pct-of-budget":
        return series_ms / frame_budget_ms > p.get("maxPct", 0.12)
    if rule_ref == "pct-of-frame":
        return frame_ms > 0 and series_ms / frame_ms > p.get("maxPct", 0.15)
    if rule_ref == "spike-vs-median":
        k = p.get("k", 2.5)
        floor = p.get("floorMs", 0.5)
        return series_ms > k * series_median and series_ms > floor
    if rule_ref == "low-load-strict":
        ratio = p.get("frameBelowP50Ratio", 0.85)
        if frame_ms >= stats["p50Ms"] * ratio:
            return False
        return series_ms > p.get("maxMs", 2.0)
    if rule_ref == "high-load-relaxed":
        ratio = p.get("frameAboveP95Ratio", 0.9)
        if frame_ms < stats["p95Ms"] * ratio:
            return False
        return series_ms > p.get("maxMs", 3.5)
    if rule_ref in ("hard-cap", "ecs-dispatch-cap"):
        return series_ms > p.get("maxMs", 10.0)
    return False


def evaluate_flags(timings, series_list, context_by_frame, watch_spec, stats, device_tier):
    templates = load_watch_spec().get("ruleTemplates", {})
    flags = []
    budget = watch_spec.get("frameBudgetMs", 16.67)
    for tgt in watch_spec.get("targets", []):
        tid = tgt["id"]
        ser = next((s for s in series_list if s["targetId"] == tid), None)
        if not ser:
            continue
        present = [t for t in ser["timings"] if t is not None]
        med = _pct(sorted(present), 50) if present else 0
        for rule in tgt.get("rules", []):
            ref = rule.get("ref")
            if not ref:
                continue
            tpl = templates.get(ref, {})
            params = {**(tpl.get("params") or {}), **(rule.get("params") or {})}
            when = rule.get("when") or tpl.get("when") or "always"
            sev = rule.get("severity") or ("critical" if ref == "hard-cap" and params.get("maxMs", 99) >= 10 else "warn")
            for fi, series_ms in enumerate(ser["timings"]):
                if series_ms is None:
                    continue
                ctx = context_by_frame[fi] if fi < len(context_by_frame) else {"labels": {}}
                if not _eval_when(when, ctx, timings[fi], stats, device_tier):
                    continue
                if _apply_rule(ref, params, series_ms, timings[fi], budget, med, stats):
                    msg = rule.get("message") or "%s %.2fms 触发 %s (帧 %d)" % (tid, series_ms, ref, fi)
                    flags.append({
                        "frameIndex": fi,
                        "targetId": tid,
                        "ruleId": ref,
                        "severity": sev,
                        "actualMs": series_ms,
                        "frameMs": timings[fi],
                        "context": ctx.get("labels"),
                        "deviceTier": device_tier,
                        "message": msg,
                    })
    return flags


def build_frame_analysis_perfetto(
    tp, main_utid, win, safe_query,
    device=None, scene=None, target_fps=60.0,
    slice_tree_fn=None, slice_tree_args=None,
):
    """Perfetto 主线程 PlayerLoop frameAnalysis 合包。"""
    spec = load_watch_spec()
    device_tier, budget = resolve_device_tier(device, target_fps)
    frames = player_loop_frames(tp, main_utid, win, safe_query) if main_utid else []
    timings = [f["durMs"] for f in frames]
    summary = frame_summary_from_timings(timings, budget)
    classifiers = spec.get("contextClassifiers", {})
    ctx_frames, ctx_summary = classify_contexts_perfetto(
        tp, main_utid, frames, classifiers, safe_query) if frames else ([], {"byClassifier": {}})
    targets = spec.get("watchTargets", [])
    series = build_series_perfetto(tp, main_utid, frames, targets, safe_query) if frames else []
    watch_snap = build_watch_spec_snapshot(device_tier, budget, scene, spec)
    flags = evaluate_flags(timings, series, ctx_frames, watch_snap, summary, device_tier) if timings else []

    frame_trees = []
    if slice_tree_fn and frames and summary.get("worstFrameIndex") is not None:
        for label, idx_key in (("worstFrame", "worstFrameIndex"), ("medianFrame", "medianFrameIndex"), ("p95Frame", "p95FrameIndex")):
            idx = summary.get(idx_key)
            if idx is None or idx >= len(frames):
                continue
            fr = frames[idx]
            tree = slice_tree_fn(tp, main_utid, fr["ts"], fr["endTs"], * (slice_tree_args or ()))
            if tree:
                frame_trees.append({
                    "thread": "UnityMain",
                    "label": "%s#%d" % (label, idx),
                    "root": {"name": "PlayerLoop", "totalMs": timings[idx], "totalPct": 100.0, "children": tree},
                })

    return {
        "frameDefinition": "playerloop",
        "thread": "UnityMain",
        "summary": summary,
        "timings": timings,
        "slowFrames": slow_frame_entries(timings),
        "frameTrees": frame_trees or None,
        "contextByFrame": ctx_frames or None,
        "contextSummary": ctx_summary,
        "watchSpec": watch_snap,
        "series": series or None,
        "flags": flags or None,
    }
