# simpleperf-native-analysis Skill

This skill analyses Android **native C++** performance (libil2cpp.so, libunity.so,
libxlua.so, lib_burst_generated.so, etc.) from simpleperf `perf.data` files. It is
the native-engine counterpart to `unity-profiler-analysis` (which handles Unity
`.pdata`).

Toolkit root: `K:\AI\PerfAnalysisTool_Codebuddy\simpleperf\`

## When to use this skill

Trigger when the user:
- Provides a `perf.data` file or a `binary_cache` directory.
- Asks about native C++ / CPU-cycles performance, hotspots, or flamegraphs.
- Wants to **compare two builds** (A/B test) at the native level.
- Wants a **multi-version regression** trend.
- Mentions: simpleperf, libil2cpp, libxlua, lib_burst_generated, native profiling,
  MapleCC / MapleILOpt validation, IL2CPP code-gen comparison.

Do NOT use for Unity `.pdata` (use `unity-profiler-analysis`) or for Perfetto traces.

## Prerequisites

- Python 3 on PATH.
- NDK simpleperf dir reachable. Default `D:/Android/android-ndk-r21e-windows-x86_64/simpleperf`.
  Override with env var `NDK_SIMPLEPERF_DIR` if elsewhere. (Set in `simpleperf_analyzer/config.py`.)
- A `binary_cache/` directory for symbolization (produced by collection, or the
  NDK's own `binary_cache/`). Without it, function names degrade to `lib.so[+offset]`.

## Decision flow

1. Identify the task:
   - One file → **single analysis**.
   - Two files (baseline + current) → **A/B comparison**.
   - Three+ files with version labels → **regression**.
2. Run the matching CLI (commands below) with `--binary-cache` pointing at the
   relevant binary_cache.
3. Read the produced JSON in `result/` (machine-readable) and the `.txt` (summary).
4. Present findings: lead with Level 1 (so-proportion) and Level 2 (anchor subtree)
   because they are inline-resistant; use Level 3 (function diff) only for drill-down,
   noting `maybe_inlined` flags.

## Commands

All commands are run from the toolkit root.

### Single profile
```bash
python scripts/analyze.py PERF.data --binary-cache BC_DIR --out result/analyze --top 30 --flamegraph UnityMain
```
Outputs `result/analyze.json/.txt` and `result/analyze.folded` (pipe to
`FlameGraph/flamegraph.pl` for an SVG).

### A/B comparison (Level 1+2+3)
```bash
python scripts/compare.py BASELINE.data CURRENT.data --binary-cache BC_DIR --out result/compare
```
Use `--levels 12` to skip the (slower, inline-noisy) function diff.
Use `--anchors NameA NameB` to override anchor functions.

### Multi-version regression
```bash
python scripts/compare.py ... # for single A/B
python scripts/batch_compare.py \
  --version v1.0 run1.data run2.data \
  --version v1.1 run3.data run4.data \
  --binary-cache BC_DIR --out result/regression
```
Outputs `.json/.txt/.csv`.

### Data collection (requires a connected Android device + adb)
```bash
python scripts/collect_perf.py --package com.your.game --label baseline \
  --runs 3 --duration 30 --event cpu-cycles:u --lib /path/to/unstripped --lock-freq
```

## Interpreting output (key contract)

`compare.py` JSON shape:
```json
{
  "meta": {"baseline": "...", "current": "...", "event": "cpu-cycles:u"},
  "level1_so_compare": {"threads": [{"name":"UnityMain","libs":[
      {"name":"libil2cpp.so","baseline_pct":24.7,"current_pct":9.1,"delta_pct":-15.6}]}]},
  "level2_anchor_compare": {"anchors": [
      {"name":"ExecutePlayerLoop","baseline_ms":53640.7,"current_ms":52349.1,"delta_pct":-2.41}]},
  "level3_func_diff": {"items":[...], "text":"..."},
  "summary": {"il2cpp_delta_pct_unitymain": -15.6, "main_thread_delta_pct": -2.41}
}
```

Reading guidance:
- **Level 1 / Level 2 are authoritative.** A negative `delta_pct` on
  `ExecutePlayerLoop` or a drop in `libil2cpp.so` proportion is a real improvement.
- **Level 3 is directional only.** Functions flagged `maybe_inlined` had their cost
  absorbed by callers after compiler changes; do not treat a single function's delta
  as ground truth — cross-check against the so/anchor numbers.
- Ignore daemon/GC threads (HeapTaskDaemon, libart.so) unless GC is the subject.

## Notes / limitations
- For `cpu-cycles:u`, the millisecond values are scaled cycle counts; treat them as
  relative, not wall-clock. Use `task-clock:u` collection for true ms.
- Threads are matched across builds by characteristic function, so tid changes are fine.
