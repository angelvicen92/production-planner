"""Package public receipts only. Private app logs, credentials and browser traces stay local."""
import gzip,hashlib,json,pathlib,re,sys
source,target=map(pathlib.Path,sys.argv[1:3]);target.mkdir(parents=True,exist_ok=False)
read=lambda p:json.loads(gzip.decompress(p.read_bytes())) if p.suffix=='.gz' else json.loads(p.read_text())
receipts={p.name:read(p) for p in sorted((source/'native').iterdir()) if p.is_file() and (p.suffix=='.json' or p.name.endswith('.json.gz'))}
data=json.dumps(receipts,separators=(',',':'),ensure_ascii=False).encode()
assert not re.search(rb'eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.',data),'JWT in public receipts'
assert b'postgres://' not in data and b'postgresql://' not in data,'connection URI in public receipts'
(target/'receipts.json.gz').write_bytes(gzip.compress(data,mtime=0))
if (source/'manifest.json.gz').exists():(target/'manifest.json.gz').write_bytes((source/'manifest.json.gz').read_bytes())
harness=source/'source/docs/evidence/p0-u00t'
if harness.exists():
    (target/'harness.json.gz').write_bytes(gzip.compress(json.dumps({p.name:p.read_text() for p in sorted(harness.glob('*.ts'))},separators=(',',':')).encode(),mtime=0))
print(json.dumps({'receipts':len(receipts),'bytes':(target/'receipts.json.gz').stat().st_size,'status':receipts['integration.json']['status']}))
