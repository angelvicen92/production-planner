"""Pack only public receipts and source hashes; exclude Auth credentials and logs."""
import gzip,hashlib,json,pathlib,re,shutil,sys
source,dest=map(pathlib.Path,sys.argv[1:]);dest.mkdir(parents=True,exist_ok=True)
receipts={p.name:json.loads(p.read_text()) for p in sorted(source.glob('*.json'))}
assert receipts['integration.json']['status']=='PASS'
def public(value):
    if isinstance(value,dict):
        for key,item in value.items():
            assert key.lower() not in ['access_token','refresh_token','password','authorization','apikey','service_role_key','anon_key'],key
            public(item)
    elif isinstance(value,list):
        for item in value:public(item)
    elif isinstance(value,str):assert not re.fullmatch(r'eyJ[\w-]+\.[\w-]+\.[\w-]+',value),'JWT'
public(receipts)
canonical=lambda value:json.dumps(value,sort_keys=True,separators=(',',':')).encode()
(dest/'receipts.json.gz').write_bytes(gzip.compress(canonical(receipts),mtime=0))
(dest/'manifest.json').write_text(json.dumps({'receiptCount':len(receipts),'canonicalJSONSHA256':{name:hashlib.sha256(canonical(value)).hexdigest() for name,value in receipts.items()}},indent=2)+'\n')
for p in source.glob('*-authorities.png'):shutil.copyfile(p,dest/p.name)
(dest/'source-manifest.json.gz').write_bytes(gzip.compress(canonical(json.loads((source.parent/'manifest.json').read_text())),mtime=0))
shutil.copyfile(source.parent/'checkout-delta.json',dest/'checkout-delta.json')
print('PASS public receipts packed; private logs excluded')
