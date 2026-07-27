#!/usr/bin/env python
"""Self-check helper for profile.bat.

Reads a `simpleperf report-sample --show-callchain` text output, computes
the distribution of UnityMain's outermost (last) callchain frame, and
prints a verdict.

Healthy:  most samples reach __start_thread / __pthread_start
Broken:   many samples top out at dummy::SuiteTLSModule_Dummy...::RunImpl
          (this means simpleperf's record-time DWARF unwind failed because
          the device-side .dbg.so had .eh_frame=NOBITS; see
          SIMPLEPERF_TROUBLESHOOTING.md)
"""

from __future__ import print_function
import sys
from collections import Counter


def parse(path):
    samples = []
    cur = None
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            line = line.rstrip()
            if line == 'sample:':
                if cur is not None:
                    samples.append(cur)
                cur = {'tid': None, 'cn': '', 'in_cc': False, 'fs': []}
            elif line.startswith('  thread_id: '):
                cur['tid'] = line.split(':', 1)[1].strip()
            elif line.startswith('  thread_name: '):
                cur['cn'] = line.split(':', 1)[1].strip()
            elif line == '  callchain:':
                cur['in_cc'] = True
            elif line.lstrip().startswith('symbol: ') and cur['in_cc']:
                cur['fs'].append(line.split('symbol:', 1)[1].strip())
    if cur is not None:
        samples.append(cur)
    return samples


def main():
    if len(sys.argv) < 2:
        print('usage: _selfcheck.py <samples.tmp>')
        sys.exit(2)
    path = sys.argv[1]
    try:
        samples = parse(path)
    except FileNotFoundError:
        print('[selfcheck] samples file not found:', path)
        sys.exit(0)

    um = [x for x in samples if x['cn'] == 'UnityMain']
    n = len(um)
    if n == 0:
        print('[selfcheck] no UnityMain samples found (app idle?)')
        return

    top = Counter()
    for x in um:
        sym = x['fs'][-1] if x['fs'] else '<no callchain>'
        top[sym] += 1

    print('  UnityMain samples: %d' % n)
    print('  Top 5 outermost frame:')
    for sym, k in top.most_common(5):
        bar = '#' * int(50 * k / n)
        print('    %5d (%5.1f%%)  %-50s  %s' % (k, 100.0 * k / n, sym[:50], bar))

    real = sum(1 for x in um if x['fs']
               and x['fs'][-1] in ('__start_thread', '__pthread_start(void*)'))
    fake = sum(1 for x in um if x['fs']
               and 'Testkey_GetPubKey' in x['fs'][-1])
    print('')
    print('  reach __start_thread: %d / %d (%.1f%%)' %
          (real, n, 100.0 * real / n))
    print('  fake top dummy::RunImpl: %d (%.1f%%)' %
          (fake, 100.0 * fake / n))
    print('')

    if 100.0 * real / n >= 50.0 and fake == 0:
        print('  [OK] HEALTHY: stacks unwound correctly to __start_thread')
    elif fake > 0:
        print('  [FAIL] BROKEN: %d samples topped at dummy::RunImpl - .eh_frame unwind failed' % fake)
        print('         Likely cause: /data/local/tmp/native_libs/ still has stale .dbg.so')
        print('         Fix: adb shell rm -rf /data/local/tmp/native_libs/  and re-run')
    else:
        print('  [WARN] only %.1f%% reached __start_thread - inspect the report manually' %
              (100.0 * real / n))


if __name__ == '__main__':
    main()
