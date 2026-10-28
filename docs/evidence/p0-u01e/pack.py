"""Archive public receipts only; never collect app-private.log or local secrets."""
import gzip,json,pathlib,sys
source=pathlib.Path(sys.argv[1]);target=pathlib.Path(sys.argv[2]);target.mkdir(parents=True,exist_ok=True)
receipts={p.name:json.loads(p.read_text()) for p in sorted((source/'native').glob('*.json'))}
(target/'receipts.json.gz').write_bytes(gzip.compress(json.dumps(receipts,sort_keys=True,separators=(',',':')).encode(),mtime=0))
manifest=json.loads((source/'manifest.json').read_text());manifest['checkoutDelta']=json.loads((source/'checkout-delta.json').read_text());assert manifest['checkoutDelta']==[]
(target/'manifest.json.gz').write_bytes(gzip.compress(json.dumps(manifest,sort_keys=True,separators=(',',':')).encode(),mtime=0))
print(json.dumps({'receipts':len(receipts),'bytes':(target/'receipts.json.gz').stat().st_size,'checkoutDelta':[]}))
