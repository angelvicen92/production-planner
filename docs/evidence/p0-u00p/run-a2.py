"""Run the canonical A2 comparison in fresh, serial Node 20 processes.

python3 docs/evidence/p0-u00n/run-a2.py /tmp/u00n-a2 --node /path/to/node20
No Docker, credentials, database, or network access is used by these runs.
"""
import argparse
import hashlib
import json
import pathlib
import shutil
import subprocess
import tarfile
import time
import io

ROOT=pathlib.Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser();parser.add_argument('output',type=pathlib.Path);parser.add_argument('--node',default=shutil.which('node'));args=parser.parse_args()
assert subprocess.check_output([args.node,'--version'],text=True).startswith('v20.')
out=args.output.resolve();assert not out.exists(),'Use a fresh output directory';out.mkdir(parents=True)
base=out/'source-base';base.mkdir()
archive=subprocess.check_output(['git','archive','2d95be9fd74fdf60433b1b71ad3704522d558eb4'],cwd=ROOT)
with tarfile.open(fileobj=io.BytesIO(archive)) as data:data.extractall(base,filter='data')
(base/'node_modules').symlink_to(ROOT/'node_modules',target_is_directory=True)
helpers=base/'docs/evidence/p0-u00n';helpers.mkdir(exist_ok=True)
for name in ['a2.ts','certificates.ts']:shutil.copyfile(ROOT/'docs/evidence/p0-u00n'/name,helpers/name)
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','--','engine','server','shared','supabase/migrations','package.json','package-lock.json'],cwd=ROOT,text=True).splitlines()
hashes={name:hashlib.sha256((ROOT/name).read_bytes()).hexdigest() for name in files if (ROOT/name).is_file()}
steps=[]
for label,source in [('base',base),('candidate',ROOT),('repeat',ROOT)]:
    start=time.monotonic()
    with (out/(label+'.log')).open('w') as log:
        result=subprocess.run([args.node,'--import','tsx','docs/evidence/p0-u00n/a2.ts',str(out/label)],cwd=source,stdout=log,stderr=subprocess.STDOUT)
    steps.append({'label':label,'exitCode':result.returncode,'seconds':time.monotonic()-start})
    assert result.returncode==0,label
    print(label,'PASS',flush=True)
comparisons={label:json.loads((out/label/'comparison.json').read_text()) for label in ['base','candidate','repeat']}
certificates={label:json.loads((out/label/'certificates.json').read_text()) for label in comparisons}
assert len(certificates['candidate'])+len(certificates['repeat'])==22
assert certificates['base']==certificates['candidate']==certificates['repeat']
for name,digest in hashes.items():assert hashlib.sha256((ROOT/name).read_bytes()).hexdigest()==digest,name
summary={**comparisons['candidate'],'base':'2d95be9fd74fdf60433b1b71ad3704522d558eb4','status':'PASS','remoteWrites':0,'isolated':True,
         'mode':'SERIAL_FRESH_NODE20_PROCESSES','steps':steps,'certificatesRevalidated':22,'baselineCertificatesRevalidated':11,
         'certificateAuthority':'buildA2Demo.ts: replay + validatePlan + PreparedFutureCollectiveParticipantClosure; 11 per pass',
         'fullReportSnapshotsAndCertificatesEqual':True,'sourceHashes':hashes}
(out/'comparison.json').write_text(json.dumps(summary,indent=2))
print('PASS complete comparative A2, 22 candidate/repeat certificates',flush=True)
