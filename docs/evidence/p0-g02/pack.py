"""Pack public receipts only; never archive process logs, JWTs or credentials."""
import sys,pathlib,json,gzip,hashlib,re,shutil
base=pathlib.Path(__file__).parent;dest,source=sys.argv[1:];source=pathlib.Path(source);target=base/dest;target.mkdir(parents=True,exist_ok=True)
def public(v):
 if isinstance(v,dict):
  for k,x in v.items():assert k.lower() not in ['access_token','refresh_token','password','authorization','apikey','service_role_key','anon_key'],k;public(x)
 elif isinstance(v,list):
  for x in v:public(x)
 elif isinstance(v,str):assert not re.fullmatch(r'eyJ[\w-]+\.[\w-]+\.[\w-]+',v),'JWT'
data={p.name:json.loads(p.read_text()) for p in sorted((source/'native').glob('*.json'))};public(data)
(target/'receipts.json.gz').write_bytes(gzip.compress(json.dumps(data,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
digest=lambda v:hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
(target/'manifest.json').write_text(json.dumps({'receiptCount':len(data),'files':{k:digest(v) for k,v in data.items()}},indent=2)+'\n')
manifest={'manifest':json.loads((source/'manifest.json').read_text()),'checkoutDelta':json.loads((source/'checkout-delta.json').read_text())};public(manifest)
(target/'source-manifest.json.gz').write_bytes(gzip.compress(json.dumps(manifest,ensure_ascii=False).encode(),mtime=0))

for screenshot in (source/"native").glob("routes-*.png"):
 shutil.copyfile(screenshot,target/screenshot.name)
