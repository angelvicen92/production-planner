"""Archive only public JSON receipts and selected original Chromium captures."""
import pathlib,json,gzip,hashlib,shutil,re
base=pathlib.Path(__file__).parent;work=pathlib.Path('work/p0-u02b')
folders={'native':'cold-a2','repeat':'cold-b2','control-main':'control-u00a','control-fixed':'control-u01f','control-phases':'control-u01b','control-no-common':'control-u01d','control-linear':'control-linear','visual':'visual'}
def public(value):
 if isinstance(value,dict):
  for k,v in value.items():
   assert k.lower() not in ['access_token','refresh_token','password','authorization','apikey','service_role_key','anon_key'],k
   public(v)
 elif isinstance(value,list):
  for v in value:public(v)
 elif isinstance(value,str):assert not re.fullmatch(r'eyJ[\w-]+\.[\w-]+\.[\w-]+',value),'JWT in public receipt'
def digest(v):return hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
for dest,src in folders.items():
 root=work/src;data={p.name:json.loads(p.read_text()) for p in sorted((root/'native').glob('*.json'))};assert data['integration.json']['status']=='PASS';public(data)
 target=base/dest;target.mkdir(parents=True,exist_ok=True)
 (target/'receipts.json.gz').write_bytes(gzip.compress(json.dumps(data,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
 (target/'manifest.json').write_text(json.dumps({'receiptCount':len(data),'files':{k:digest(v) for k,v in data.items()}},indent=2)+'\n')
 sources={'manifest':json.loads((root/'manifest.json').read_text()),'checkoutDelta':json.loads((root/'checkout-delta.json').read_text())};public(sources)
 (target/'source-manifest.json.gz').write_bytes(gzip.compress(json.dumps(sources,ensure_ascii=False).encode(),mtime=0))
 if dest=='visual':
  for p in (root/'native').glob('*-editor.png'):shutil.copyfile(p,target/p.name)
 if dest=='native':
  for label in ['integrated','reverse-order','segmented-joint']:shutil.copyfile(root/'native'/f'{label}-configuration.png',target/f'{label}-configuration.png')
upgrade=base/'upgrade';upgrade.mkdir(exist_ok=True)
for name in ['upgrade125.json','before.json.gz','after.json.gz']:shutil.copyfile(work/'upgrade/native'/name,upgrade/name)
shutil.copyfile(work/'upgrade/manifest.json',upgrade/'manifest.json')
for name in ['verification.json','control-u01f-verification.json','control-u01f-supporting.json']:shutil.copyfile(work/name,base/name)
checks=base/'checks';checks.mkdir(exist_ok=True)
for name in ['typescript','ledger','build','focal','harness-types','cold-a2','cold-b2','upgrade','control-u00a','control-u01f','control-u01b','control-u01d','control-linear','control-u01f-verification','control-u01f-supporting','visual']:
 if name=='typescript':(checks/(name+'.log.gz')).write_bytes(gzip.compress((work/(name+'.log')).read_bytes(),mtime=0))
 else:shutil.copyfile(work/(name+'.log'),checks/(name+'.log'))
(checks/'global.log.gz').write_bytes(gzip.compress((work/'global.log').read_bytes(),mtime=0))
(checks/'baseline-asst010.log.gz').write_bytes(gzip.compress((work/'baseline-asst010/test.log').read_bytes(),mtime=0));shutil.copyfile(work/'baseline-asst010/result.json',checks/'baseline-asst010.json')
attempts={}
for name in ['attempt1','attempt2','attempt3','attempt4','attempt5','native','cold-a']:
 root=work/name;data={}
 for suffix in ['integration','transport-failure','profiles','source-contention']:
  p=root/'native'/(suffix+'.json')
  if p.exists():data[suffix]=json.loads(p.read_text())
 public(data);attempts[name]=data
(base/'attempts.json.gz').write_bytes(gzip.compress(json.dumps(attempts).encode(),mtime=0));shutil.copyfile(work/'evidence-notes.md',base/'attempts.md')
a2=base/'a2';a2.mkdir(exist_ok=True)
for p in (work/'a2').iterdir():
 if p.is_file() and p.suffix in ['.json','.gz']:shutil.copyfile(p,a2/p.name)
print(json.dumps({'status':'PASS','publicFolders':list(folders),'remoteWrites':0}))
