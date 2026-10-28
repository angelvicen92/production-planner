"""Independent receipt physics and exact cold-stack determinism; no product calls."""
import argparse,gzip,json,pathlib
p=argparse.ArgumentParser();p.add_argument('native',type=pathlib.Path);p.add_argument('repeat',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);a=p.parse_args();cache={}
def read(base,name):
 path=base/(name+'.json')
 if path.exists():return json.loads(path.read_text())
 if base not in cache:cache[base]=json.loads(gzip.decompress((base/'receipts.json.gz').read_bytes()))
 return cache[base][name+'.json']
def minute(t):return int(t[:2])*60+int(t[3:5])
def overlap(x,y):return x['start']<y['end'] and y['start']<x['end']
def contained(t,windows):return any(w['start']<=t['start'] and t['end']<=w['end'] for w in windows)
labels=['baseline','A-fixed','B-segments','C-joint-unit','D-rest-competition','unused-snapshot','second','common-unit']
report={'status':'PASS','physical':[],'determinism':[],'SQLStages':0,'itinerantStages':0,'SQLNegatives':0,'remoteWrites':0}
for base in [a.native,a.repeat]:
 assert read(base,'integration')['status']=='PASS'
 for label in labels:
  inp=read(base,label+'-input');auth=read(base,label+'-authoring');policy=auth['policy'];problem=read(base,label+'-adapter')['problem'];count=len(inp['tasks'])
  assert count==(12 if label=='second' else 17)
  effective={x['taskId']:x['effectiveResourceIds'] for x in read(base,label+'-effective')['assignments']}
  sql={int(x['id']):x['resources'] for x in read(base,label+'-sql-resources')};assert sql==effective
  for u in inp['itinerantCompositionSnapshot']['units']:
   for m in u['members']:assert [r['id'] for r in inp['planResourceItems'] if r['resourceItemId']==m['resourceItemId']]==[m['planResourceItemId']]
  assert auth['jointResponse']['status']==auth['phaseResponse']['status']==200 and auth['jointSQL']['accepted'] and auth['phaseSQL']['accepted']
  for n in [1,2]:
   result=read(base,f'{label}-S{n}-run')['assisted_result_json'];proof=result['evidence']['nominalPhysicalFutureWitness'];tasks=proof['tasks'];by={int(t['id'][5:]):t for t in tasks}
   assert len(tasks)==len(by)==count and result['evidence']['technicalChainCertificate']['status']=='WITNESS' and result['evidence']['technicalChainCertificate']['consumed']==0
   operations={}
   for t in tasks:
    source=next(x for x in inp['tasks'] if x['id']==int(t['id'][5:]));ids=effective[source['id']]
    assert t.get('requiredResourceIds',[])==sorted('plan-resource:'+str(i) for i in ids)
    uid=source.get('itinerantTeamId');assert t.get('itinerantUnitId')==('itinerant-team:'+str(uid) if uid else None)
    if uid:assert contained(t,next(u for u in problem['itinerantUnits'] if u['id']==t['itinerantUnitId'])['availability'])
    assert t['end']-t['start']==source['durationOverrideMin']
    for dep in t['dependencies']:assert by[int(dep[5:])]['end']<=t['start']
    for rid in t.get('requiredResourceIds',[]):assert contained(t,next(r for r in problem['resources'] if r['id']==rid)['availability'])
    assert contained(t,next(r for r in problem['participants'] if r['id']==t['participantId'])['availability'])
    assert contained(t,next(r for r in problem['spaces'] if r['id']==t['spaceId'])['availability'])
    key=t.get('jointGroupId',t['id']);op=operations.setdefault(key,{'start':t['start'],'end':t['end'],'space':t['spaceId'],'resources':t.get('requiredResourceIds',[]),'unit':t.get('itinerantUnitId'),'participants':[]})
    assert (op['start'],op['end'],op['space'],op['resources'],op['unit'])==(t['start'],t['end'],t['spaceId'],t.get('requiredResourceIds',[]),t.get('itinerantUnitId'));op['participants'].append(t['participantId'])
   assert len(operations)==count-1
   values=list(operations.values())
   for i,x in enumerate(values):
    assert len(x['participants'])==len(set(x['participants']))
    for y in values[i+1:]:
     if overlap(x,y):assert not set(x['resources'])&set(y['resources']) and not set(x['participants'])&set(y['participants']) and x['space']!=y['space'] and not(x['unit'] and x['unit']==y['unit'])
    for rest in proof.get('operationalMeals',[]):
     if overlap(x,rest):assert not set(x['resources'])&set(rest['resourceIds']) and x['space'] not in rest['spaceIds']
   rests=proof.get('operationalMeals',[]);assert len(rests)==(0 if label=='second' else 1)
   if rests:
    rest=rests[0];declared=auth['rest']['policies'][0];assert rest['end']-rest['start']==15 and minute(declared['window']['start'])<=rest['start'] and rest['end']<=minute(declared['window']['end']);assert set(rest['resourceIds'])=={'plan-resource:'+str(i) for i in declared['planResourceItemIds']}
   phases=[sorted([by[i] for i in phase],key=lambda t:t['start']) for phase in policy['phases']];flat=[t for phase in phases for t in phase];assert all(x['end']==y['start'] for x,y in zip(flat,flat[1:]))
   accepted=read(base,f'{label}-S{n}-accepted')['activeStage'];sqlstage=read(base,f'{label}-S{n}-sql');assert sqlstage['snapshot_json']==accepted['snapshotJson'] and sqlstage['snapshot_fingerprint']==accepted['snapshotFingerprint']
   placed=[t for t in sqlstage['snapshot_json']['tasks'] if t['startPlanned']]
   if n==1:
    assert len(placed)==(8 if label=='second' else 1);fixed=placed
   else:assert len(placed)==count and all(t in placed for t in fixed)
   report['SQLStages']+=1;report['itinerantStages']+=int(label not in ['baseline','unused-snapshot'])
   for suffix in ['forgeries']+([] if label in ['baseline','unused-snapshot'] else ['unit-forgeries']):
    for attack in read(base,f'{label}-S{n}-{suffix}'):
     assert attack['error']['code']=='P0001';report['SQLNegatives']+=1
   report['physical'].append({'stack':base.name,'label':label,'stage':n,'obligations':count,'physicalOperations':len(operations),'branches':result['evidence']['work']['branchesExplored']})
  for entry in ['representative','peer']:
   r=read(base,f'{label}-scope-{entry}')['assisted_result_json'];assert len(r['proposal'])==len(policy['orderedTaskIds'])+1 and r['evidence']['acceptedSupportingPlacements']==[]
  if label in ['A-fixed','B-segments','C-joint-unit','baseline','unused-snapshot']:
   assert [read(base,f'{label}-S{n}-run')['assisted_result_json']['evidence']['work']['branchesExplored'] for n in [1,2]]==[83,82]
 neg=read(base,'impossible-S1-run')['assisted_result_json'];assert neg['outcome']=='NO_PROPOSAL' and not any('BUDGET' in c or 'TIME_LIMIT' in c for c in neg['evidence']['reasonCodes'])
 assert read(base,'resource-only-rest-protected')['response']['status']==409
 assert read(base,'A-fixed-resource-release-sql')['accepted'] and not read(base,'common-unit-resource-release-sql')['accepted']
for label in labels:
 assert read(a.native,label+'-adapter')['problemFingerprint']==read(a.repeat,label+'-adapter')['problemFingerprint']
 for stage in [1,2]:
  x=read(a.native,f'{label}-S{stage}-run')['assisted_result_json'];y=read(a.repeat,f'{label}-S{stage}-run')['assisted_result_json']
  for key in ['proposal','proposedDraftFingerprint','proposedDraftSnapshot']:assert x[key]==y[key],(label,stage,key)
  for key in ['work','nominalPhysicalFutureWitness','technicalChainCertificate']:assert x['evidence'][key]==y['evidence'][key],(label,stage,key)
  assert read(a.native,f'{label}-S{stage}-sql')==read(a.repeat,f'{label}-S{stage}-sql'),(label,stage,'SQL Stage rows')
  report['determinism'].append({'label':label,'stage':stage,'exact':True})
report['impossibleCapacity']={'demand':55,'available':40,'branches':read(a.native,'impossible-S1-run')['assisted_result_json']['evidence']['work']['branchesExplored']}
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if not isinstance(v,list)}))
