"""Pack only public evidence, excluding local Auth credentials and application logs."""
import gzip,hashlib,json,shutil,sys
from pathlib import Path
native=Path(sys.argv[1]);dest=Path(__file__).parent/'native';dest.mkdir(exist_ok=True)
receipts={p.name:json.loads(p.read_text()) for p in sorted(native.glob('*.json'))}
assert receipts['integration.json']['status']=='PASS'
(dest/'receipts.json.gz').write_bytes(gzip.compress(json.dumps(receipts,sort_keys=True,separators=(',',':')).encode(),mtime=0))
manifest={name:hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest() for name,value in receipts.items()}
(dest/'manifest.json').write_text(json.dumps({'format':'JSON keys are original native/*.json filenames','receipt_count':len(receipts),'canonical_json_sha256':manifest},indent=2))
for p in native.glob('*.png'):shutil.copyfile(p,dest/p.name)
runner=json.loads((native.parent/'manifest.json').read_text())
(dest/'source-manifest.json.gz').write_bytes(gzip.compress(json.dumps(runner,sort_keys=True,separators=(',',':')).encode(),mtime=0))
for name in ['counterfactuals','first-hard-frontier','sql-readonly-rejection','semantic-identities']:
 shutil.copyfile(native/f'{name}.json',dest/f'{name}.json')
print('PASS: public receipts and source hashes packed; private logs excluded')
