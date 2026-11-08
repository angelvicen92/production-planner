"""Archive public diagnostic receipts, without credentials or private app logs."""
import gzip,hashlib,json,pathlib,re,shutil,sys
source,dest=map(pathlib.Path,sys.argv[1:]);dest.mkdir(parents=True,exist_ok=True)
receipts={p.name:json.loads(p.read_text()) for p in sorted(source.glob('*.json'))}
def public(v):
 if isinstance(v,dict):
  for k,x in v.items():
   assert k.lower() not in ['access_token','refresh_token','password','authorization','apikey','service_role_key','anon_key'],k
   public(x)
 elif isinstance(v,list):
  for x in v:public(x)
 elif isinstance(v,str):assert not re.fullmatch(r'eyJ[\w-]+\.[\w-]+\.[\w-]+',v),'JWT'
public(receipts)
canonical=lambda v:json.dumps(v,sort_keys=True,separators=(',',':')).encode()
(dest/'receipts.json.gz').write_bytes(gzip.compress(canonical(receipts),mtime=0))
(dest/'manifest.json').write_text(json.dumps({'receiptCount':len(receipts),'canonicalJSONSHA256':{n:hashlib.sha256(canonical(v)).hexdigest() for n,v in receipts.items()}},indent=2)+'\n')
for name in ['first-authoring-rejection.png','transport-settings.png']:
 if (source/name).exists():shutil.copyfile(source/name,dest/name)
for name in ['manifest.json','checkout-delta.json']:
 p=source.parent/name
 if p.exists():(dest/('source-'+name+'.gz')).write_bytes(gzip.compress(p.read_bytes(),mtime=0))
print(json.dumps({'status':'PASS','directory':str(dest),'receipts':len(receipts),'privateLogsIncluded':False}))
