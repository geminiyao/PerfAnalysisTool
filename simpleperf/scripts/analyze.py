#!/usr/bin/env python
"""analyze.py - Single perf.data analysis (hotspots + thread/so breakdown).

Usage:
    python scripts/analyze.py perf.data \
        --binary-cache /path/to/binary_cache \
        --out result/analyze \
        [--top 30] [--flamegraph UnityMain]

Outputs <out>.json, <out>.txt, and optionally <out>.folded for flamegraph.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from simpleperf_analyzer import load_profile, single_profile, reporter, config


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("perf_data", help="perf.data file to analyze")
    ap.add_argument("--binary-cache", default=None, help="binary_cache dir for symbols")
    ap.add_argument("--out", default="result/analyze", help="output path prefix")
    ap.add_argument("--top", type=int, default=config.DEFAULT_TOP_N, help="top-N hotspots")
    ap.add_argument("--flamegraph", nargs="?", const="__ALL__", default=None,
                    help="emit folded stacks; optional thread name to filter")
    args = ap.parse_args()

    print("Loading:", args.perf_data)
    profile = load_profile(args.perf_data, binary_cache=args.binary_cache,
                           label=os.path.basename(args.perf_data))

    result = single_profile.analyze(profile, top_n=args.top)
    json_path = reporter.write_json(result, args.out + ".json")
    txt_path = reporter.write_text(reporter.format_single_text(result), args.out + ".txt")
    print("Wrote:", json_path)
    print("Wrote:", txt_path)

    if args.flamegraph is not None:
        tf = None if args.flamegraph == "__ALL__" else args.flamegraph
        folded = single_profile.folded_stacks(profile, thread_filter=tf)
        folded_path = reporter.write_text(folded, args.out + ".folded")
        print("Wrote:", folded_path, "(pipe to FlameGraph/flamegraph.pl)")


if __name__ == "__main__":
    main()
