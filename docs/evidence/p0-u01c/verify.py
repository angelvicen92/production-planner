"""Independent physical/accounting verification of public receipts, without writes."""
import argparse, gzip, json, pathlib
p=argparse.ArgumentParser();p.add_argument('native',type=pathlib.Path);p.add_argument('repeat',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);a=p.parse_args()
cache={}
def read(base,name):
 path=base/(name+'.json')
 if path.exists(): return json.loads(path.read_text())
 if base not in cache: cache[base]=json.loads(gzip.decompress((base/'receipts.json.gz').read_bytes()))
 return cache[base][name+'.json']
def minute(s): return int(s[:2])*60+int(s[3:5])
def overlap(x,y): return x['start']<y['end'] and y['start']<x['end']
def physical(proof,problem):
 ops={};by={t['id']:t for t in proof['tasks']}
 assert len(by)==len(proof['tasks'])==len(problem['tasks'])
 for t in proof['tasks']:
  assert t['end']-t['start']==t['duration']
  for dep in t['dependencies']: assert by[dep]['end']<=t['start']
  for r in t.get('requiredResourceIds',[]):
   resource=next(x for x in problem['resources'] if x['id']==r)
   assert any(w['start']<=t['start'] and t['end']<=w['end'] for w in resource['availability'])
  person=next((x for x in problem['participants'] if x['id']==t.get('participantId')),None)
  if person: assert any(w['start']<=t['start'] and t['end']<=w['end'] for w in person['availability'])
  key=t.get('jointGroupId') or t['id'];op=ops.setdefault(key,dict(start=t['start'],end=t['end'],space=t['spaceId'],resources=t.get('requiredResourceIds',[]),people=[],tasks=[]))
  assert (op['start'],op['end'],op['space'],op['resources'])==(t['start'],t['end'],t['spaceId'],t.get('requiredResourceIds',[]))
  op['people'].append(t.get('participantId'));op['tasks'].append(t['id'])
 for i,x in enumerate(list(ops.values())):
  assert len(x['people'])==len(set(x['people']))
  for y in list(ops.values())[i+1:]:
   if overlap(x,y): assert not set(x['resources'])&set(y['resources']) and not set(x['people'])&set(y['people']) and x['space']!=y['space']
  for rest in proof.get('operationalMeals',[]):
   if overlap(x,rest): assert not set(x['resources'])&set(rest['resourceIds']) and x['space'] not in rest['spaceIds']
 return len(ops)
def phases(proof,policy):
 by={int(t['id'][5:]):t for t in proof['tasks']}
 flat=[t for phase in policy['phases'] for t in sorted([by[i] for i in phase],key=lambda x:x['start'])]
 assert all(x['end']==y['start'] for x,y in zip(flat,flat[1:]))
 assert flat[-1]['end']-flat[0]['start']==sum(t['duration'] for t in flat)
 return [flat[0]['start'],flat[-1]['end']]
report={'status':'PASS','base':'815dbc76cc1d7e52c3d298c9584cfcc82fff050b','remoteWrites':0,'physical':[],'determinism':[],'negative':[]}
for base in [a.native,a.repeat]:
 assert read(base,'integration')['status']=='PASS'
 manifest=base/'manifest.json.gz'
 if manifest.exists():
  m=json.loads(gzip.decompress(manifest.read_bytes()));assert m['checkoutDelta']==[] and m['manifest']['base']==report['base']
 for label in ['common','mixed']:
  inp=read(base,label+'-input');assert len(inp['tasks'])==17
  effective=read(base,label+'-effective-resources')['assignments'];policy=read(base,label+'-requested-policy')
  intersection=set.intersection(*(set(t['effectiveResourceIds']) for t in effective if t['taskId'] in policy['orderedTaskIds']))
  assert bool(intersection)==(label=='common')
  for stage in [1,2]:
   r=read(base,f'{label}-S{stage}-run')['assisted_result_json'];proof=r['evidence']['nominalPhysicalFutureWitness'];sql=read(base,f'{label}-S{stage}-sql');accepted=read(base,f'{label}-S{stage}-accepted')['activeStage']
   assert r['outcome']=='PROPOSAL' and len(proof['tasks'])==17
   assert sql['snapshot_json']==accepted['snapshotJson'] and sql['snapshot_fingerprint']==accepted['snapshotFingerprint']
   placed=[t for t in sql['snapshot_json']['tasks'] if t['startPlanned']];assert len(placed)==(1 if stage==1 else 17)
   by={int(t['id'][5:]):t for t in proof['tasks']}
   for t in placed:
    assert minute(t['startPlanned'])==by[t['taskId']]['start'] and minute(t['endPlanned'])==by[t['taskId']]['end']
    assert [f'plan-resource:{i}' for i in t['assignedResourceIds']]==by[t['taskId']].get('requiredResourceIds',[])
   if stage==1: fixed=placed
   else: assert all(t in placed for t in fixed)
   if label=='common':
    assert r['evidence']['technicalChainCertificate']['status']=='WITNESS' and r['evidence']['technicalChainCertificate']['consumed']==0
    phases(proof,policy)
   else: assert not inp.get('technicalChains') and not r['evidence'].get('technicalChainCertificate')
   validation=read(base,f'{label}-S{stage}-validation');assert validation['hardCount']==validation['requiredCount']==0
   report['physical'].append({'stack':str(base),'profile':label,'stage':stage,'accepted':len(placed),'branches':r['evidence']['work']['branchesExplored'],'requiredPhases':label=='common'})
  if label=='mixed':
   rejections=read(base,'mixed-first-rejections');assert [x['api']['status'] for x in rejections]==[400,422,422,422,422]
   assert all(x['sql']['code']=='P0001' for x in rejections)
   alternatives=read(base,'mixed-alternative-A-api');assert all(x['status']==400 for x in alternatives['alternatives']) and alternatives['scope']['status']==422
   m=read(base,'mixed-memory-full');proof=m['result']['evidence']['nominalPhysicalFutureWitness'];assert physical(proof,m['adapter']['problem'])==16
   assert m['globalValidation']['hardValid'] and m['certificate']['status']=='WITNESS' and m['certificate']['consumed']==0
   assert phases(proof,policy)[1]-phases(proof,policy)[0]==40
   assert read(base,'mixed-memory-partial')['result']['proposal'].__len__()==1
   assert read(base,'mixed-memory-continuation')['result']['evidence']['protectedPlacementsPreserved']
   assert read(base,'mixed-original-assertion-validation')['technicalChainViolationCount']>0
   assert all(not x['validation']['hardValid'] for x in read(base,'mixed-memory-attacks'))
   assert read(base,'mixed-release-control')['resourceReleasePermitsCompetition'] and not read(base,'mixed-release-control')['inventedHoldPermitsCompetition']
 for name in ['impossible-S1-run','impossible-memory-full']:
  r=read(base,name);r=r.get('assisted_result_json',r.get('result'));assert not r['proposal'] and not any('BUDGET_EXHAUSTED' in c for c in r['evidence']['reasonCodes'])
  report['negative'].append({'stack':str(base),'case':name,'branches':r['evidence']['work']['branchesExplored'],'budgetExhausted':False})
 i=read(base,'itinerant-control');assert i['rejection']['status']==422 and i['sql']['message']=='UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION'
 im=read(base,'itinerant-memory-full');assert im['globalValidation']['hardValid'] and im['certificate']['status']=='WITNESS';assert physical(im['result']['evidence']['nominalPhysicalFutureWitness'],im['adapter']['problem'])==3
for label in ['common','mixed']:
 for stage in [1,2]:
  x=read(a.native,f'{label}-S{stage}-run')['assisted_result_json'];y=read(a.repeat,f'{label}-S{stage}-run')['assisted_result_json']
  for key in ['proposal']:assert x[key]==y[key]
  for key in ['work','nominalPhysicalFutureWitness']:assert x['evidence'][key]==y['evidence'][key]
  assert read(a.native,f'{label}-S{stage}-sql')['snapshot_fingerprint']==read(a.repeat,f'{label}-S{stage}-sql')['snapshot_fingerprint']
  report['determinism'].append({'profile':label,'stage':stage,'proposalWitnessWorkSqlFingerprintExact':True,'normalization':False})
for name in ['mixed-memory-full','mixed-memory-partial','mixed-memory-continuation','itinerant-memory-full']:
 x=read(a.native,name)['result'];y=read(a.repeat,name)['result'];assert x['proposal']==y['proposal'] and x['evidence']['work']==y['evidence']['work'] and x['evidence']['nominalPhysicalFutureWitness']==y['evidence']['nominalPhysicalFutureWitness']
report['nativeStages']=8;report['mixedRequiredStages']=0
a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2));print('PASS physics, actual SQL Stages, rejection boundaries, memory controls and exact determinism')
