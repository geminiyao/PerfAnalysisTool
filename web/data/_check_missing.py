import subprocess
import os

p = subprocess.run(
    ['git', 'ls-tree', '-r', '815a3773a9f6ed911609e8c1d68f27c357a7164f'],
    capture_output=True, timeout=30,
)
text = p.stdout.decode('utf-8', errors='replace')

BACKSLASH = chr(92)

missing = []
present = []
for line in text.splitlines():
    parts = line.split('\t', 1)
    if len(parts) != 2:
        continue
    meta, path = parts
    blob = meta.split()[2]
    norm = path.replace(BACKSLASH, '/')
    if not os.path.exists(norm):
        missing.append((blob, norm))
    else:
        present.append(norm)

print(f"Total in stash: {len(missing) + len(present)}, on disk: {len(present)}, MISSING: {len(missing)}")
print()
print("--- 缺失清单 ---")
for blob, path in missing:
    print(f"  {path}")

# Save the missing list for the next step
with open('web/data/_missing_files.txt', 'w', encoding='utf-8') as f:
    for blob, path in missing:
        f.write(f"{blob}\t{path}\n")
print(f"\n[saved to web/data/_missing_files.txt]")
