import os
import subprocess

restored = 0
errors = 0
with open('web/data/_missing_files.txt', 'r', encoding='utf-8') as f:
    for line in f:
        line = line.rstrip('\n')
        if not line:
            continue
        parts = line.split('\t', 1)
        if len(parts) != 2:
            continue
        blob, path = parts
        # Skip the obviously bogus filename "{console.error(e)"
        if path.startswith('{') or '\n' in path:
            print(f"SKIP suspicious path: {path!r}")
            continue
        # Make sure parent dir exists
        os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
        # Cat the blob to the file (binary-safe)
        with open(path, 'wb') as out:
            p = subprocess.run(['git', 'cat-file', '-p', blob], stdout=out, stderr=subprocess.PIPE)
            if p.returncode != 0:
                print(f"FAIL {path}: {p.stderr.decode('utf-8', errors='replace')[:120]}")
                errors += 1
                continue
        size = os.path.getsize(path)
        restored += 1
        if restored % 10 == 0:
            print(f"  ... {restored} files restored")

print(f"\n[done] restored={restored}, errors={errors}")
