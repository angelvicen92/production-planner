"""Offline verification of complete physical receipts; no database writes."""
import argparse,gzip,json,pathlib
p=argparse.ArgumentParser();p.add_argument('native',type=pathlib.Path);p.add_argument('repeat',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);a=p.parse_args()
def read(base,name):return json.loads((base/(name+'.json')).read_text())
def minute(t):return int(t[:2])*60+int(t[3:5])
def overlapping(a,b):return a['start']<b['end'] and b['start']<a['end']
def physical(proof):
 ops={}
 for t in proof['tasks']:
  key=t.get('jointGroupId') or t['id'];op=ops.setdefault(key,dict(start=t['start'],end=t['end'],space=t['spaceId'],resources=sorted(t.get('requiredResourceIds',[])),participants=[],tasks=[],blocks=t.get('blocksSpace',True)))
  assert (op['start'],op['end'],op['space'],op['resources'])==(t['start'],t['end'],t['spaceId'],sorted(t.get('requiredResourceIds',[])))
  op['tasks'].append(t['id']);op['participants'].append(t.get('participantId'))
 for t in proof['tasks']:
  for dep in t['dependencies']:assert next(x for x in proof['tasks'] if x['id']==dep)['end']<=t['start']
 vals=list(ops.values())
 for i,x in enumerate(vals):
  assert len(x['participants'])==len(set(x['participants']))
  for y in vals[i+1:]:
   if overlapping(x,y):
    assert not set(x['resources'])&set(y['resources'])
    assert not set(x['participants'])&set(y['participants'])
    assert not (x['space']==y['space'] and x['blocks'] and y['blocks'])
  for rest in proof['operationalMeals']:
   if overlapping(x,rest):assert not set(x['resources'])&set(rest['resourceIds']) and not (x['blocks'] and x['space'] in rest['spaceIds'])
 return vals
report={'status':'PASS','physical':[],'determinism':[],'forgeries':[],'remoteWrites':0}
for base in [a.native,a.repeat]:
 assert read(base,'integration')['status']=='PASS'
 for label,count in [('integrated',15),('second',11),('shifted',15)]:
  policy=read(base,label+'-configuration')['technicalChains']['authority']['policies'][0]
  phase_ids=policy['phases'];ids={i for phase in phase_ids for i in phase};order=[]
  for stage in [1,2]:
   run=read(base,f'{label}-S{stage}-run')['assisted_result_json'];proof=run['evidence']['nominalPhysicalFutureWitness'];ops=physical(proof)
   assert len(proof['tasks'])==count and len(ops)==count-1
   by={int(t['id'][5:]):t for t in proof['tasks']}
   phases=[sorted([by[i] for i in phase],key=lambda t:t['start']) for phase in phase_ids]
   flat=[t for phase in phases for t in phase];assert all(x['end']==y['start'] for x,y in zip(flat,flat[1:]))
   assert run['evidence']['technicalChainCertificate']['status']=='WITNESS' and run['evidence']['technicalChainCertificate']['consumed']==0
   accepted=read(base,f'{label}-S{stage}-accepted')['activeStage'];sql=read(base,f'{label}-S{stage}-sql');assert accepted['snapshotJson']==sql['snapshot_json']
   placed=[t for t in sql['snapshot_json']['tasks'] if t['startPlanned']];assert len(placed)==(1 if stage==1 else count)
   for t in placed:
    other=by[t['taskId']];assert minute(t['startPlanned'])==other['start'] and minute(t['endPlanned'])==other['end'];assert [f'plan-resource:{i}' for i in t['assignedResourceIds']]==other.get('requiredResourceIds',[])
   failures=read(base,f'{label}-S{stage}-forgeries');assert all(f['error']['code']=='P0001' and f['hashesRecomputed'] and f['rolledBack'] for f in failures)
   report['forgeries'].extend({'base':str(base),'label':label,'stage':stage,**f} for f in failures)
   report['physical'].append({'base':str(base),'label':label,'stage':stage,'accepted':len(placed),'globalObligations':count,'physicalOperations':len(ops),'branches':run['evidence']['work']['branchesExplored'],'phaseOrder':[[t['id'] for t in phase] for phase in phases]})
   if stage==1:fixed=placed
   else:
    for t in fixed:assert t in placed
  for entry in ['representative','peer','space']:
   r=read(base,f'{label}-scope-{entry}')['assisted_result_json'];assert len(r['scopeTaskIds'])==len(ids)+1 and r['outcome']=='PROPOSAL'
  assert read(base,f'{label}-rollback-redo')['activeStage']['snapshotJson']==accepted['snapshotJson']
  if label=='second':assert any([t['id'] for t in phase]!=['task:'+str(i) for i in ids] for ids,phase in zip(phase_ids,phases))
 neg=read(base,'impossible-S1-run')['assisted_result_json'];assert neg['outcome']=='NO_PROPOSAL';assert not any('BUDGET_EXHAUSTED' in s for s in neg['evidence']['reasonCodes'])
 report.setdefault('negativeBranches',[]).append(neg['evidence']['work']['branchesExplored'])
for label in ['integrated','second','shifted']:
 for stage in [1,2]:
  x=read(a.native,f'{label}-S{stage}-run')['assisted_result_json'];y=read(a.repeat,f'{label}-S{stage}-run')['assisted_result_json']
  assert x['proposal']==y['proposal'];assert x['evidence']['work']==y['evidence']['work'];assert x['evidence']['nominalPhysicalFutureWitness']==y['evidence']['nominalPhysicalFutureWitness']
  assert read(a.native,f'{label}-S{stage}-sql')['snapshot_fingerprint']==read(a.repeat,f'{label}-S{stage}-sql')['snapshot_fingerprint']
  report['determinism'].append({'label':label,'stage':stage,'proposal':True,'witness':True,'work':True,'SQLFingerprint':True,'normalization':False})
x=read(a.native,'integrated-S1-run')['assisted_result_json']['evidence']['nominalPhysicalFutureWitness'];y=read(a.native,'shifted-S1-run')['assisted_result_json']['evidence']['nominalPhysicalFutureWitness']
px=read(a.native,'integrated-requested-policy')['orderedTaskIds'];py=read(a.native,'shifted-requested-policy')['orderedTaskIds']
root=lambda p,ids:min(t['start'] for t in p['tasks'] if int(t['id'][5:]) in ids)
assert root(x,px)!=root(y,py);report['shiftedWholeBlock']={'before':root(x,px),'after':root(y,py),'contiguous':True}
failures=report.pop('forgeries');report['materialRejectionCount']=len(failures)
report['materialRejectionsByMode']={mode:{'count':sum(f['mode']==mode for f in failures),'errors':sorted({f['error']['message'] for f in failures if f['mode']==mode}),'consumer':'assert_daily_technical_chain_snapshot','hashesRecomputed':True} for mode in sorted({f['mode'] for f in failures})}
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2));print('PASS native phase Stages, physical witness, scopes, negatives and exact determinism')
