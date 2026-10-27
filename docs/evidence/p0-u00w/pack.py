"""Copy only public receipts. Private server logs and credentials stay in work/."""
import gzip,json,shutil,sys
from pathlib import Path
source,target=map(Path,sys.argv[1:3]);target.mkdir(parents=True,exist_ok=False)
receipts={p.name:json.loads(p.read_text()) for p in sorted((source/'native').glob('*.json'))}
assert receipts['integration.json']['status']=='PASS'
def compressed(path,data):path.write_bytes(gzip.compress(data,mtime=0))
compressed(target/'receipts.json.gz',json.dumps(receipts,separators=(',',':'),ensure_ascii=False).encode())
compressed(target/'manifest.json.gz',(source/'manifest.json').read_bytes())
if (source/'checkout-delta.json').exists():shutil.copyfile(source/'checkout-delta.json',target/'checkout-delta.json')
for p in (source/'native').glob('*.png'):shutil.copyfile(p,target/p.name)
print(f'Packed {len(receipts)} public receipts into {target.name}')
