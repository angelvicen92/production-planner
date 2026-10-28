"""Package only public receipts. Local Auth secrets and app logs are never included."""
import argparse,gzip,json,pathlib,shutil,re
p=argparse.ArgumentParser();p.add_argument('source',type=pathlib.Path);p.add_argument('destination',type=pathlib.Path);p.add_argument('--memory',action='store_true');a=p.parse_args()
a.destination.mkdir(parents=True,exist_ok=True)
root=a.source if a.memory else a.source/'native'
receipts={f.name:json.loads(f.read_text())for f in sorted(root.glob('*.json'))}
encoded=json.dumps(receipts,ensure_ascii=False,separators=(',',':')).encode()
assert not re.search(rb'eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}',encoded),'JWT must not be packaged'
(a.destination/'receipts.json.gz').write_bytes(gzip.compress(encoded,mtime=0))
if not a.memory:
 manifest={k:json.loads((a.source/f).read_text())for k,f in [('manifest','manifest.json'),('checkoutDelta','checkout-delta.json')]}
 (a.destination/'manifest.json.gz').write_bytes(gzip.compress(json.dumps(manifest,separators=(',',':')).encode(),mtime=0))
 for f in root.glob('*.png'):shutil.copyfile(f,a.destination/f.name)
print(json.dumps({'receipts':len(receipts),'privateLogsIncluded':False,'destination':str(a.destination)}))
