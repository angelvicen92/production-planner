"""Package only public JSON/PNG receipts. Never package server logs or credentials."""
import argparse,gzip,json,pathlib,shutil
p=argparse.ArgumentParser();p.add_argument('source',type=pathlib.Path);p.add_argument('destination',type=pathlib.Path);a=p.parse_args()
out=a.destination;out.mkdir(parents=True,exist_ok=True);native=a.source/'native'
def gz(path,value):path.write_bytes(gzip.compress(json.dumps(value,ensure_ascii=False,separators=(',',':')).encode(),mtime=0))
receipts={f.name:json.loads(f.read_text()) for f in sorted(native.glob('*.json'))}
gz(out/'receipts.json.gz',receipts)
manifest={'manifest':json.loads((a.source/'manifest.json').read_text()),'checkoutDelta':json.loads((a.source/'checkout-delta.json').read_text()) if (a.source/'checkout-delta.json').exists() else []}
gz(out/'manifest.json.gz',manifest)
for file in native.glob('*.png'):shutil.copyfile(file,out/file.name)
for file in native.glob('*.json.gz'):shutil.copyfile(file,out/file.name)
print(json.dumps({'destination':str(out),'receipts':len(receipts),'privateLogsIncluded':False}))
