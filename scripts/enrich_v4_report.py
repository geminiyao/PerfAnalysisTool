#!/usr/bin/env python3
"""Deterministic v4 narrative enrich (hybrid AI slot): Provider data + gold-style formatting."""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if ROOT not in sys.path:
    sys.path.insert(0, os.path.join(ROOT, "simpleperf"))

from simpleperf_analyzer.project_pack import detect_project_from_libs, load_project_pack
from simpleperf_analyzer.top_n_engine import compute_top_n
from simpleperf_analyzer.v4_report_renderer import render_v4_report


def _load_meta(out_dir: str, diff: dict) -> dict:
    summary_path = os.path.join(out_dir, "simpleperf-diff-summary.json")
    # Project-agnostic defaults: real labels come from the upload payload
    # (web ingest passes sceneBase/sceneCur via meta). Keep the fallback empty
    # so missing user input is visible rather than masked by a stale default.
    meta = {
        "device": "—",
        "sceneBase": "base 采集",
        "sceneCur": "cur 采集",
        "durationSec": diff.get("cur", {}).get("durationSec", 20),
        "subjectiveFps": None,
    }
    if os.path.isfile(summary_path):
        try:
            summary = json.load(open(summary_path, encoding="utf-8"))
            m = summary.get("meta") or {}
            if m.get("device"):
                meta["device"] = m["device"]
        except OSError:
            pass
    return meta


def main():
    out_dir = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "docs/report/_intermediate/aoeyz_diff")
    diff = json.load(open(os.path.join(out_dir, "diff", "simpleperf-diff.json"), encoding="utf-8"))
    base_sp = json.load(open(os.path.join(out_dir, "base", "simpleperf-profile.json"), encoding="utf-8"))[
        "detail"]["simpleperf"]
    cur_sp = json.load(open(os.path.join(out_dir, "cur", "simpleperf-profile.json"), encoding="utf-8"))[
        "detail"]["simpleperf"]
    # Auto-detect the project pack:
    #   1. PERFTOOL_PROJECT env var (explicit)
    #   2. Substring of out_dir path (e.g. aoeyz_diff → aoeyz)
    #   3. Scan diff.libs for any pack's identify.selfDeveloperSoNames
    #   4. Fallback to _generic
    if not os.environ.get("PERFTOOL_PROJECT"):
        # Try out_dir path-based detection.
        from simpleperf_analyzer.project_pack import _list_real_projects
        for project_name in _list_real_projects():
            if project_name in out_dir:
                os.environ["PERFTOOL_PROJECT"] = project_name
                break
    detected = detect_project_from_libs(diff.get("libs") or [])
    active = load_project_pack().name
    print("[enrich] active project pack: %s (env=%s, lib-detect=%s)" % (
        active, os.environ.get("PERFTOOL_PROJECT", ""), detected or "—",
    ), flush=True)
    # Pull globally-aggregated hotspots from the summary file (Burst Top-N
    # uses these for correct global-self %; callTree-level selfPct is per
    # thread and would mis-scale.)
    cur_summary_path = os.path.join(out_dir, "cur", "simpleperf-profile-summary.json")
    if os.path.isfile(cur_summary_path):
        try:
            cur_summary = json.load(open(cur_summary_path, encoding="utf-8"))
            cur_sp["hotspots"] = cur_summary.get("hotspots", [])
        except OSError:
            cur_sp.setdefault("hotspots", [])
    meta = _load_meta(out_dir, diff)
    top_n = compute_top_n(diff["businessModules"], diff["probes"])
    md = render_v4_report(diff, top_n, base_sp, cur_sp, meta=meta, enriched=True)

    # NOTE: LLM enrichment for §0 / §4.3-§4.6 / §6.2 / §9 is NOT called here.
    # It runs at the web layer via codebuddy CLI (see
    # web/server/services/simpleperf-diff-service.ts:runCliDiffEnrich) which
    # consumes this enriched-template output, patches narrative sections,
    # then runs the quality gate. CLI failures fall back to this template.

    # Single canonical deliverable. The Provider draft is kept in .provider/
    # for debugging only; users should read performance-report.md.
    report_dir = os.path.join(out_dir, "report")
    os.makedirs(report_dir, exist_ok=True)
    debug_dir = os.path.join(report_dir, ".provider")
    os.makedirs(debug_dir, exist_ok=True)

    final_path = os.path.join(report_dir, "performance-report.md")
    with open(final_path, "w", encoding="utf-8") as f:
        f.write(md)

    # Mirror to out_dir root for legacy web export pickup.
    web = os.path.join(out_dir, "performance-report.md")
    with open(web, "w", encoding="utf-8") as f:
        f.write(md)

    # Provider draft (un-enriched) lands under .provider/ for diff/debug.
    md_provider = render_v4_report(diff, top_n, base_sp, cur_sp, meta=meta, enriched=False)
    provider_path = os.path.join(debug_dir, "provider-draft.md")
    with open(provider_path, "w", encoding="utf-8") as f:
        f.write(md_provider)

    # Legacy filenames kept (symlink-equivalent copies) so existing tooling
    # that hard-codes them still finds the deliverable. Remove once tooling
    # migrates to performance-report.md.
    for legacy in ("performance-report_simpleperf_AI_v4.md", "performance-report_simpleperf_v4.md"):
        with open(os.path.join(report_dir, legacy), "w", encoding="utf-8") as f:
            f.write(md if "AI" in legacy else md_provider)

    print(json.dumps({
        "deliverable": final_path,
        "providerDraft": provider_path,
        "bytes": len(md),
        "lines": md.count("\n") + 1,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
