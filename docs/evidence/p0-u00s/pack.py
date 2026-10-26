"""Pack public JSON receipts and screenshots; exclude private logs and credentials."""
import gzip,json,shutil,sys
from pathlib import Path
source,target=map(Path,sys.argv[1:3]);target.mkdir(parents=True,exist_ok=False)
receipts={p.name:json.loads(p.read_text()) for p in sorted((source/'native').glob('*.json'))}
assert receipts['integration.json']['status']=='PASS'
(target/'receipts.json.gz').write_bytes(gzip.compress(json.dumps(receipts,separators=(',',':'),ensure_ascii=False).encode(),mtime=0))
(target/'manifest.json.gz').write_bytes(gzip.compress((source/'manifest.json').read_bytes(),mtime=0))
for p in (source/'native').glob('*.png'):shutil.copyfile(p,target/p.name)
print(f'Packed {len(receipts)} public receipts')
