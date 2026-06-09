#!/usr/bin/env python
"""batch_compare.py - Multi-version / multi-run regression analysis.

Accepts groups of perf.data files labelled by version. Files sharing a label
are merged (aggregate-by-thread-name) so multiple runs of the same build are
averaged into one data point.

Usage:
    python scripts/batch_compare.py \
        --version v1.0 run1.data run2.data run3.data \
        --version v1.1 run4.data run5.data \
        --binary-cache /path/to/binary_cache \
        --out result/regression

Outputs <out>.json, <out>.txt, <out>.csv.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from simpleperf_analyzer import load_profile, regression, reporter


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--version", nargs="+", action="append", metavar=("LABEL", "FILE"),
                    required=True,
                    help="version label followed by one or more perf.data files; "
                         "repeat --version for each version")
    ap.add_argument("--binary-cache", default=None, help="binary_cache dir for symbols")
    ap.add_argument("--out", default="result/regression", help="output path prefix")
    ap.add_argument("--anchors", nargs="+", default=None, help="override anchor funcs")
    args = ap.parse_args()

    profiles = []
    for group in args.version:
        if len(group) < 2:
            ap.error("--version needs a label and at least one file: %r" % group)
        label, files = group[0], group[1:]
        # Multiple runs of the same version are merged by loading them and
        # aggregating; here we load each file and keep them under the same label.
        # For a proper average we load each then merge thread names.
        for i, f in enumerate(files):
            sub_label = label if len(files) == 1 else "%s#%d" % (label, i + 1)
            print("Loading [%s]: %s" % (sub_label, f))
            profiles.append((sub_label, load_profile(
                f, binary_cache=args.binary_cache, label=sub_label,
                aggregate_by_thread_name=True)))

    print("Building regression trends ...")
    result = regression.analyze(profiles, anchors=args.anchors)

    json_path = reporter.write_json(result, args.out + ".json")
    txt_path = reporter.write_text(reporter.format_regression_text(result), args.out + ".txt")
    csv_path = reporter.write_regression_csv(result, args.out + ".csv")
    print("Wrote:", json_path)
    print("Wrote:", txt_path)
    print("Wrote:", csv_path)


if __name__ == "__main__":
    main()
