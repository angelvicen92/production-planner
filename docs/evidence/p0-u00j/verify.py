#!/usr/bin/env python3
"""Offline integrity audit of the type-selection native receipts and sources."""
import gzip, hashlib, json
from pathlib import Path
root=Path(__file__).resolve().parent
repo=root.parents[2]
def read(path):
 p=root/path
 if not p.exists():p=Path(str(p)+'.gz')
 return json.loads(gzip.decompress(p.read_bytes()) if p.suffix=='.gz' else p.read_bytes())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
manifest=read('native-manifest.json')
assert manifest['node']=='20.20.2' and manifest['remoteWrites']==0
for name,digest in manifest['sourceHashes'].items():assert sha(repo/name)==digest,name
assert sha(repo/'package-lock.json')==manifest['lockfileSha256']
authority=read('source-authority.json')
for name,digest in authority['historicalFiles'].items():assert sha(repo/name)==digest,name
assert read('gate1/gate1.json')['onlyRequirementChanged']
original=read('gate1/A-input.json');counter=read('gate1/A-counterfactual-input.json')
assert original['tasks'][0]['resourceRequirements']=={'byType':{'1':1}}
counter['tasks'][0]['resourceRequirements']=original['tasks'][0]['resourceRequirements'];assert original==counter
assert read('gate1/A-adapter.json')['status']=='UNSUPPORTED'
result=read('gate1/A-counterfactual-result.json');assert result['evidence']['completeForScope'] and result['evidence']['hardValid']
assert [t['requiredResourceIds'] for t in result['proposal']]==[['plan-resource:5'],['plan-resource:4']]
assert read('before111/sql-omission-before-111.json')=={'accepted':True,'hashesRecomputed':True,'rolledBack':True}
assert 'SQL accepted forged future-identity' in read('causal/witness-identity-probe.json')['error']
security=read('native/guard-security.json');assert security['privateSchema'] and not security['publicRpcAdded']
assert all(not r['prosecdef'] and not r['schema_usage'] and not r['executable'] and r['proconfig']==['search_path=""'] for r in security['roles'])
summary=read('native/summary.json');assert summary['status']=='PASS'
assert [(d['obligations'],len(d['stages'])) for d in summary['days']]==[(2,1),(4,2)]
attacks=0
for day in summary['days']:
 label=day['label'];source=read(f'native/{label}-input.json');previous={}
 daily={r['id']:r for r in source['planResourceItems']}
 for n in range(1,len(day['stages'])+1):
  prefix=f'native/{label}-S{n}'
  result=read(prefix+'-run.json')['assisted_result_json'];snapshot=result['proposedDraftSnapshot']
  assert read(prefix+'-stage.json')['activeStage']['snapshotJson']==snapshot==read(prefix+'-draft.json')['draft']
  validation=read(prefix+'-validation.json');assert validation['hardCount']==validation['requiredCount']==0
  assert validation['reportJson']['nominalResourceFuture']=='CERTIFIED'
  replay=read(prefix+'-replay.json')['assisted_result_json']
  for field in ['fingerprint','work','nominalPhysicalFutureWitness']:assert replay['evidence'][field]==result['evidence'][field]
  rows={int(r['id']):r for r in read(prefix+'-daily.json')};current={}
  assert result['evidence']['work']['branchBudgetLimit']==10000
  proof={t['id']:t for t in result['evidence']['nominalPhysicalFutureWitness']['tasks']};assert len(proof)==day['obligations']
  for row in snapshot['tasks']:
   assert rows[row['taskId']]['status']=='pending'
   if not row['startPlanned']:
    assert not row['assignedResourceIds'] and not rows[row['taskId']]['assigned_resource_ids'];continue
   current[row['taskId']]=row;assert row['assignedResourceIds']==rows[row['taskId']]['assigned_resource_ids']
   task=next(t for t in source['tasks'] if t['id']==row['taskId']);req=task['resourceRequirements']
   fixed={r['id'] for r in daily.values() if str(r['resourceItemId']) in req.get('byItem',{})}
   assert fixed<=set(row['assignedResourceIds'])
   if req.get('byType'):
    type_id=int(next(iter(req['byType'])));choices={r for r in row['assignedResourceIds'] if daily[r]['typeId']==type_id}
    assert len(choices)==1
    choice=proof[f"task:{row['taskId']}"]['nominalResourceChoice']
    assert choice['requestedResourceTypeId']==f'resource-type:{type_id}'
    assert choice['selectedResourceId']==f'plan-resource:{next(iter(choices))}'
  for id,row in previous.items():assert current[id]==row
  previous=current
  adversaries=read(prefix+'-sql-adversaries.json');attacks+=len(adversaries)
  assert all(x['rolledBack'] and x['hashesRecomputed'] and x['error'] for x in adversaries)
  assert {'omit','double','invented','missing-choice','future-identity','future-dependencies','type-identity','domain','unavailable','time-lock','space-availability','future-omission','future-collision','draft','base','revision','permission'}<={x['guard'] for x in adversaries}
 assert len(previous)==day['obligations']
assert attacks==60
b=read('native/B-input.json');adhoc=next(r for r in b['planResourceItems'] if r['resourceItemId'] is None)
b1=read('native/B-S1-stage.json')['activeStage']['snapshotJson']['tasks'];b2=read('native/B-S2-stage.json')['activeStage']['snapshotJson']['tasks']
assert not b1[2]['assignedResourceIds'] and b2[2]['assignedResourceIds']==[adhoc['id']]
assert all(x['adapter']['status']=='UNSUPPORTED' for x in read('native/native-negatives.json'))
assert len(read('native/native-negatives.json'))==8
assert read('cold-replay.json')['status']=='PASS'
print(json.dumps({'status':'PASS','nativeDays':[2,4],'stages':3,'sqlAdversaries':attacks,'adHocSelection':True,'nativeNegativeDays':8}))

# Preserve full material reports, certificates and snapshots, not just counters.
a2=read('a2/execution.json');assert a2['status']=='PASS' and a2['certificatesRevalidated']==22
assert a2['obligations']==266 and a2['stages']==11 and a2['branches']==27049
assert a2['a2RuntimeSourcesIdenticalToFinal'] and a2['latestU00iBaselineIdentical']
reports=[read(f'a2/{label}/run.json') for label in ['base','candidate','repeat']]
without_times=lambda r:{**r,'iterations':[{k:v for k,v in t.items() if k!='durationMs'} for t in r['iterations']]}
assert without_times(reports[0])==without_times(reports[1])==without_times(reports[2])
snapshots=[read(f'a2/{label}/snapshots.json') for label in ['base','candidate','repeat']]
assert snapshots[0]==snapshots[1]==snapshots[2]
audit=read('a2/canonical-audit.json');assert audit['status']=='PASS'
assert len(audit['stagesBefore'])+len(audit['stagesAfter'])==22
reg=read('regressions/regression-comparison.json');assert reg['status']=='PASS'
assert len(reg['mainStandaloneItinerant'])==6 and len(reg['stages'])==11
assert reg['historicalRebootstrapUnchanged'] and reg['setupFrozenIdentical'] and reg['transportReplay']=='PASS'
for family in ['main','standalone','itinerant','setup','transport','meals','byItem','anyOf']:
 assert read(f'regressions/{family}/integration.json')['status']=='PASS'
print(json.dumps({'status':'PASS','a2':[266,11,27049],'certificates':22,'historicalSnapshots':17}))
