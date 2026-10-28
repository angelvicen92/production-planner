"""Archive only public receipts and screenshots; exclude private stack logs."""
import argparse,gzip,json,pathlib,shutil,hashlib,subprocess
p=argparse.ArgumentParser();p.add_argument('stack',type=pathlib.Path);p.add_argument('target',type=pathlib.Path);a=p.parse_args()
a.target.mkdir(parents=True,exist_ok=True)
receipts={p.name:json.loads(p.read_text()) for p in sorted((a.stack/'native').glob('*.json'))}
assert receipts['integration.json']['status']=='PASS'
(a.target/'receipts.json.gz').write_bytes(gzip.compress(json.dumps(receipts,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
source=json.loads((a.stack/'manifest.json').read_text())
delta=a.stack/'checkout-delta.json'
changes=json.loads(delta.read_text()) if delta.exists() else [f for f,h in source['sourceHashes'].items() if hashlib.sha256(pathlib.Path(f).read_bytes()).hexdigest()!=h]
manifest={'manifest':source,'checkoutDelta':changes,'archiveCheckoutHead':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()}

assert manifest['checkoutDelta']==[]
(a.target/'manifest.json.gz').write_bytes(gzip.compress(json.dumps(manifest,separators=(',',':')).encode(),mtime=0))
for p in (a.stack/'native').glob('*.png'):shutil.copyfile(p,a.target/p.name)
