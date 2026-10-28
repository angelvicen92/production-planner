"""Reuse the original control verifiers against fresh receipts and historical public evidence."""
import gzip,json,pathlib,subprocess,sys
u00x,u02b,output=map(pathlib.Path,sys.argv[1:])
output.mkdir(parents=True,exist_ok=True)
historical=output/'u00x-historical'
(historical/'native').mkdir(parents=True,exist_ok=True)
for name,value in json.loads(gzip.decompress(pathlib.Path('docs/evidence/p0-u00x/native/receipts.json.gz').read_bytes())).items():
 assert pathlib.Path(name).name==name
 (historical/'native'/name).write_text(json.dumps(value))
subprocess.run(['node','--import','tsx','docs/evidence/p0-u00x/verify.ts',str(u00x),str(historical),str(output/'u00x.json')],check=True)
subprocess.run(['node','--import','tsx','docs/evidence/p0-u00x/physical.ts',str(u00x),str(output/'u00x-physical.json')],check=True)
subprocess.run([sys.executable,'docs/evidence/p0-u02b/verify.py',str(u02b/'native'),'docs/evidence/p0-u02b/native',str(output/'u02b.json')],check=True)
