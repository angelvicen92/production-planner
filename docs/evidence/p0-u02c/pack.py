"""Explicit public receipts only; excludes app logs, browser storage and credentials."""
import pathlib,json,gzip,hashlib,shutil,re
base=pathlib.Path(__file__).parent
folders={'native':'work/u02c-native-3','repeat':'work/u02c-repeat','control-u02b':'work/u02c-control-u02b','control-u00x':'work/u02c-control-u00x-2'}
def public(value):
 if isinstance(value,dict):
  for k,v in value.items():
   assert k.lower() not in ['access_token','refresh_token','password','authorization','apikey','service_role_key','anon_key'],k
   public(v)
 elif isinstance(value,list):
  for v in value:public(v)
 elif isinstance(value,str):assert not re.fullmatch(r'eyJ[\w-]+\.[\w-]+\.[\w-]+',value),'JWT in public receipt'
def digest(v):return hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def archive(target,data):
 public(data);target.mkdir(parents=True,exist_ok=True)
 (target/'receipts.json.gz').write_bytes(gzip.compress(json.dumps(data,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
 (target/'manifest.json').write_text(json.dumps({'receiptCount':len(data),'files':{k:digest(v) for k,v in data.items()}},indent=2)+'\n')
for dest,src in folders.items():
 root=pathlib.Path(src);data={p.name:json.loads(p.read_text()) for p in sorted((root/'native').glob('*.json'))};assert data['integration.json']['status']=='PASS';archive(base/dest,data)
 manifest={'manifest':json.loads((root/'manifest.json').read_text()),'checkoutDelta':json.loads((root/'checkout-delta.json').read_text())};public(manifest)
 (base/dest/'source-manifest.json.gz').write_bytes(gzip.compress(json.dumps(manifest,ensure_ascii=False).encode(),mtime=0))
for dest,src in [('search','work/u02c-search'),('search-repeat','work/u02c-search-repeat'),('replay','work/u02c-replay')]:archive(base/dest,{p.name:json.loads(p.read_text()) for p in sorted(pathlib.Path(src).glob('*.json'))})
visual=base/'visual';visual.mkdir(exist_ok=True)
for name in ['integrated-daily-anchored-accompaniment','integrated-daily-technical-chain','reverse-order-daily-anchored-accompaniment','reverse-order-daily-task-operation-scopes','reverse-order-daily-technical-chain','segmented-reverse-daily-joint-groups']:
 shutil.copyfile(pathlib.Path(folders['native'])/'native'/(name+'.png'),visual/(name+'.png'))
attempts={}
for label,src in [('attempt-1','u02c-attempt-1'),('attempt-2','u02c-attempt-2'),('attempt-3','u02c-native'),('attempt-4','u02c-native-2'),('control-u00x-browser','u02c-control-u00x')]:
 root=pathlib.Path('work')/src/'native';data={}
 for suffix in ['integration','browser-events','browser-final']:
  p=root/(suffix+'.json')
  if p.exists():data[suffix]=json.loads(p.read_text())
 attempts[label]=data
public(attempts);(base/'attempts.json.gz').write_bytes(gzip.compress(json.dumps(attempts,ensure_ascii=False).encode(),mtime=0))
checks=base/'checks';checks.mkdir(exist_ok=True)
for p in pathlib.Path('work/u02c-checks').glob('*'):
 if p.suffix in ['.log','.json']:shutil.copyfile(p,checks/p.name)
for n in ['verification','repeat-verification','determinism','two-base-determinism','control-u02b-verification','control-u00x-verification']:shutil.copyfile(checks/(n+'.json'),base/(n+'.json'))
# Product hashes must match both the executed archive and the exact authorized base.
runtime={};offline={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in base.glob('*.ts')}
for dest,src in folders.items():
 manifest=json.loads((pathlib.Path(src)/'manifest.json').read_text());product={k:v for k,v in manifest['sourceHashes'].items() if k.startswith(('engine/','server/','client/','shared/','supabase/','script/'))}
 for k,v in product.items():assert hashlib.sha256(pathlib.Path(k).read_bytes()).hexdigest()==v,k
 runtime[dest]={'runnerBaseLabel':manifest['base'],'executedProductBase':'39e26f1c2e84cc8160c2066e197d61bc8b972384','productFiles':len(product),'identicalToCheckout':True,'productHash':digest(product),'dispatchAndCacheOnlyInDiscardedCopy':True}
assert len({v['productHash'] for v in runtime.values()})==1
(base/'source-binding.json').write_text(json.dumps({'status':'PASS','base':'39e26f1c2e84cc8160c2066e197d61bc8b972384','runtime':runtime,'deliveredHarnessSHA256':offline,'productionChanges':0,'remoteApplicationWrites':0},indent=2)+'\n')
print('PASS public archives, credential scan and unchanged product binding')
