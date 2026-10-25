"""Verify public evidence, source binding, exact Stage snapshots and independent identities."""
import gzip,hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parent
read=lambda p:json.loads(gzip.decompress(p.read_bytes()))
a=read(root/'native/receipts.json.gz');b=read(root/'native/repeat-receipts.json.gz')
assert a['integration.json']['status']==b['integration.json']['status']=='PASS'
assert len(a)==len(b)==78
assert len(a['integration.json']['migrations'])==len(b['integration.json']['migrations'])==117
for file,hash in json.loads((root/'authorities.json').read_text())['files'].items():assert hashlib.sha256(Path(file).read_bytes()).hexdigest()==hash,file
ma=read(root/'native/manifest.json.gz');mb=read(root/'native/repeat-manifest.json.gz')
for manifest in [ma,mb]:
 for path,digest in manifest['sourceHashes'].items():
  if not path.startswith('docs/evidence/p0-u00r/'):
   assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest,path
normalized=[]
for bundle in [a,b]:
 records=[]
 for label,count in [('A',3),('B',2)]:
  c=bundle[label+'-created.json'];task_ids=[int(t['id']) for t in c['tasks']]
  spaces=[int(t['id']) for t in c['spaces']]
  stages=[]
  for n in range(1,count+1):
   accepted=bundle[f'{label}-S{n}-accepted.json']['activeStage'];s=accepted['snapshotJson']
   assert accepted['validationSummaryJson']['hardCount']==accepted['validationSummaryJson']['requiredCount']==0
   items=[]
   for task in s['tasks']:
    items.append({'task':task_ids.index(task['taskId']),'space':spaces.index(task['spaceId']),'start':task['startPlanned'],'end':task['endPlanned'],'equipment':['rig'] if task['assignedResourceIds'] else []})
   run=bundle[f'{label}-S{n}-run.json']['assisted_result_json']
   assert run['outcome']=='PROPOSAL'
   assert run['proposedDraftSnapshot']==bundle[f'{label}-S{n}-repeat.json']['assisted_result_json']['proposedDraftSnapshot']
   stages.append({'placements':items,'work':run['evidence']['work']})
  records.append({'label':label,'stages':stages})
 normalized.append(records)
assert normalized[0]==normalized[1]
for label in ['A','B']:
 ac=a[label+'-created.json'];bc=b[label+'-created.json']
 assert ac['day']['id']!=bc['day']['id']
 assert ac['kit']['id']!=bc['kit']['id']
 assert [t['id'] for t in ac['tasks']]!=[t['id'] for t in bc['tasks']]
 for n in range(1,4 if label=='A' else 3):
  assert a[f'{label}-S{n}-accepted.json']['activeStage']['snapshotFingerprint']!=b[f'{label}-S{n}-accepted.json']['activeStage']['snapshotFingerprint']
before=read(root/'checks/before.json.gz');after=read(root/'checks/after.json.gz')
assert len(before)==len(after)==4
assert all(r['result']['proposal'] is None and r['result']['evidence']['work']['branchesExplored']==0 for r in before)
assert all(r['result']['proposal'] and r['result']['evidence']['hardValid'] for r in after)
a2=json.loads((root/'a2/comparison.json').read_text())
assert a2['certificatesRevalidated']==22
for label in ['candidate','repeat']:
 c=a2[label];assert (c['completed'],c['stages'],c['branches'],c['fingerprint'])==(266,11,27049,'2a3bf5d32c0102266290f8ddf699cf2ad366d7200b24214efc6c6b23f473df8d')
assert (root/'a2/candidate/snapshots.json.gz').read_bytes()==(root/'a2/repeat/snapshots.json.gz').read_bytes()
assert (root/'a2/candidate/certificates.json').read_bytes()==(root/'a2/repeat/certificates.json').read_bytes()
print('PASS: two distinct disposable bases, 156 receipts, 10 accept_stage checkpoints + two native root bootstraps, normalized placements/counters, source hashes and A2')
