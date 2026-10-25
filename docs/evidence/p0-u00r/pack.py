"""Pack only public receipts; never copy app-private.log, traces or environment."""
import gzip
import json
from pathlib import Path
import shutil
import sys

source, target = map(Path, sys.argv[1:3])
assert source.resolve() != target.resolve()
target.mkdir(parents=True, exist_ok=False)
receipts = {p.name: json.loads(p.read_text()) for p in sorted((source / 'native').glob('*.json'))}
assert receipts['integration.json']['status'] == 'PASS'
(target / 'receipts.json.gz').write_bytes(gzip.compress(json.dumps(receipts, separators=(',', ':'), ensure_ascii=False).encode(), mtime=0))
(target / 'manifest.json.gz').write_bytes(gzip.compress((source / 'manifest.json').read_bytes(), mtime=0))
for p in (source / 'native').glob('*.png'):
    shutil.copy2(p, target / p.name)
print(f'Packed {len(receipts)} public JSON receipts')
