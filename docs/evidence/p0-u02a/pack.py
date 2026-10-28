"""Archive only public receipts. Never includes logs, browser traces, source archives or credentials."""
import gzip,hashlib,json,pathlib,shutil,sys
root=pathlib.Path(sys.argv[1]);dest=pathlib.Path('docs/evidence/p0-u02a')
for name,source in [('control-main',root/'control-u00a'),('control-phases',root/'control-u01f/native'),('native',root/'integrated-final/native'),('memory',root/'memory-final')]:
 out=dest/name;out.mkdir(exist_ok=True)
 data={p.name:json.loads(p.read_text()) for p in sorted(source.glob('*.json'))}
 encoded=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode();(out/'receipts.json.gz').write_bytes(gzip.compress(encoded,mtime=0))
 manifest={'receiptCount':len(data),'files':{k:hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest() for k,v in data.items()}}
 (out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 for p in source.glob('*.png'):
  if name=='native' or (name=='control-main' and p.name in ['first-accepted.png','second-accepted.png']):shutil.copyfile(p,out/p.name)
for name in ['capacity','supporting','control-u01f-verification','control-u01f-supporting','integrated-search-path','impossible-search-path']:
 shutil.copyfile(root/(name+'.json'),dest/(name+'.json'))
for label,source in [('control-phases',root/'control-u01f/manifest.json'),('native',root/'integrated-final/manifest.json')]:
 (dest/label/'source-manifest.json.gz').write_bytes(gzip.compress(source.read_bytes(),mtime=0))
checks=dest/'checks';checks.mkdir(exist_ok=True)
for name in ['focal','typescript','control-u00a','control-u01f','integrated-final','capacity']:
 shutil.copyfile(root/(name+'.log'),checks/(name+'.log'))
attempts=[]
for label,path,kind in [('login-network-changed','integrated','harness/network'),('independent-technical-without-unit','integrated-retry','UNSUPPORTED_EXPLICIT')]:
 p=root/path/'native';data={'name':label,'classification':kind,'integration':json.loads((p/'integration.json').read_text())}
 if (p/'browser-events.json').exists():data['browserEvents']=json.loads((p/'browser-events.json').read_text())
 if label=='independent-technical-without-unit':data['memoryResult']=json.loads((root/'memory/integrated-full.json').read_text())
 attempts.append(data)
(dest/'attempts.json.gz').write_bytes(gzip.compress(json.dumps(attempts,ensure_ascii=False).encode(),mtime=0))
