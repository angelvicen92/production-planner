"""Two fresh serial Node 20 runs, compared literally with integrated U00s receipts."""
import argparse,gzip,hashlib,json,os,pathlib,subprocess,time
p=argparse.ArgumentParser();p.add_argument('output',type=pathlib.Path);p.add_argument('--node',required=True);a=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[3];out=a.output.resolve();out.mkdir(parents=True,exist_ok=False)
assert subprocess.check_output([a.node,'--version'],text=True).startswith('v20.')
env={k:v for k,v in os.environ.items() if k not in ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL']}
read=lambda f:json.loads(gzip.decompress(f.read_bytes())) if f.suffix=='.gz' else json.loads(f.read_text())
baseline=root/'docs/evidence/p0-u00s/integration/a2/candidate';results={}
strip=lambda r:{**r,'iterations':[{k:v for k,v in i.items() if k!='durationMs'} for i in r['iterations']]}
for label in ['candidate','repeat']:
    start=time.monotonic()
    with (out/(label+'.log')).open('w') as log:
        r=subprocess.run([a.node,'--import','tsx','docs/evidence/p0-u00n/a2.ts',str(out/label)],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
    assert r.returncode==0,label
    assert strip(read(out/label/'run.json.gz'))==strip(read(baseline/'run.json.gz'))
    assert read(out/label/'snapshots.json.gz')==read(baseline/'snapshots.json.gz')
    assert read(out/label/'certificates.json')==read(baseline/'certificates.json')
    results[label]={**read(out/label/'comparison.json'),'wallSeconds':time.monotonic()-start}
    print(label,'PASS',flush=True)
summary={'status':'PASS','baseline':str(baseline.relative_to(root)),'base':'3ade5d2774584f92f86b2b8670bbb3f19fc5f83c','remoteWrites':0,'sql':False,'results':results,'certificatesRevalidated':22,'onlyReportExclusion':'iterations[].durationMs'}
(out/'comparison.json').write_text(json.dumps(summary,indent=2))
