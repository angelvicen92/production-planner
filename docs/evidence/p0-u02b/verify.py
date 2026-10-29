"""Independent receipt physics and literal determinism across fresh SQL bases."""
import argparse,gzip,json,pathlib,itertools,hashlib
p=argparse.ArgumentParser();p.add_argument('native',type=pathlib.Path);p.add_argument('repeat',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);a=p.parse_args();cache={}
def read(base,name):
 path=base/(name+'.json')
 if path.exists():return json.loads(path.read_text())
 if base not in cache:
  cache[base]=json.loads(gzip.decompress((base/'receipts.json.gz').read_bytes()));manifest=json.loads((base/'manifest.json').read_text());assert manifest['receiptCount']==len(cache[base])
  for k,v in cache[base].items():assert hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()==manifest['files'][k]
 return cache[base][name+'.json']
def minute(t):return int(t[:2])*60+int(t[3:5])
def overlap(x,y):return x['start']<y['end'] and y['start']<x['end']
def inside(t,windows):return any(w['start']<=t['start'] and t['end']<=w['end'] for w in windows)
labels=['integrated','reverse-order','segmented-joint'];report={'status':'PASS','physical':[],'determinism':[],'SQLStages':0,'SQLMaterialNegatives':0,'remoteWrites':0}
for base in [a.native,a.repeat]:
 assert read(base,'integration')['status']=='PASS'
 for label in labels:
  inp=read(base,label+'-input');auth=read(base,label+'-authoring');policy=auth['policy'];problem=read(base,label+'-adapter')['problem'];assert len(inp['tasks'])==24
  assert inp['plannerNext'].get('mainFlow') and inp['plannerNext'].get('profile')!='STANDALONE_ONLY'
  ui=read(base,label+'-ui');assert ui['readiness']=={'status':'READY','issues':[]} and ui['technicalChains']['phasesSupported'] and all(ui[k]['supported'] and ui[k]['authority'] for k in ['technicalChains','jointGroups','operationalMeals'])
  assert all(x['response']['status']==200 and x['sql']['accepted'] for x in auth['attempts'])
  effective={x['taskId']:x['effectiveResourceIds'] for x in read(base,label+'-effective')['assignments']}
  assert {int(x['id']):x['resources'] for x in read(base,label+'-sql-resources')}==effective
  support=read(base,label+'-supporting');assert support['sqlAccepted'] and support['rolledBack'] and support['draftUnchanged'] and support['acceptedSupportingPlacements']==[]
  for suffix,expected in [('representative',8),('peer',8),('main',3),('vocal',3)]:
   r=read(base,label+'-scope-'+suffix)['assisted_result_json'];assert len(r['proposal'])==expected and len(r['evidence']['nominalPhysicalFutureWitness']['tasks'])==24 and r['evidence']['acceptedSupportingPlacements']==[]
  for n in [1,2]:
   r=read(base,f'{label}-S{n}-run')['assisted_result_json'];proof=r['evidence']['nominalPhysicalFutureWitness'];tasks=proof['tasks'];by={int(t['id'][5:]):t for t in tasks}
   assert len(tasks)==len(by)==24 and len(r['proposal'])==(1 if n==1 else 23)
   assert r['evidence']['technicalChainCertificate']['status']=='WITNESS' and r['evidence']['technicalChainCertificate']['consumed']==0
   assert r['evidence']['acceptedSupportingPlacements']==[];operations={}
   for t in tasks:
    src=next(x for x in inp['tasks'] if x['id']==int(t['id'][5:]));resources=set(t.get('requiredResourceIds',[]))|({t['coachId']} if t.get('coachId') else set())
    assert resources=={'plan-resource:'+str(i) for i in effective[src['id']]}
    assert t['end']-t['start']==src['durationOverrideMin']
    for dep in src.get('dependsOnTaskIds',[]):assert by[dep]['end']<=t['start']
    assert inside(t,next(s for s in problem['spaces'] if s['id']==t['spaceId'])['availability'])
    if t.get('participantId'):assert inside(t,next(s for s in problem['participants'] if s['id']==t['participantId'])['availability'])
    for rid in resources:assert inside(t,next(s for s in problem['resources']+problem['coaches'] if s['id']==rid)['availability'])
    uid=src.get('itinerantTeamId');assert t.get('itinerantUnitId')==('itinerant-team:'+str(uid) if uid else None)
    if uid:assert inside(t,next(s for s in problem['itinerantUnits'] if s['id']==t['itinerantUnitId'])['availability'])
    if t.get('coachId'):
     assert t['coachId']=='plan-resource:'+str(inp['vocalCoachPlanResourceItemIdByContestantId'][str(src['contestantId'])])
    op=operations.setdefault(t.get('jointGroupId',t['id']),{'start':t['start'],'end':t['end'],'space':t['spaceId'],'resources':resources,'unit':t.get('itinerantUnitId'),'people':set()})
    assert (op['start'],op['end'],op['space'],op['resources'],op['unit'])==(t['start'],t['end'],t['spaceId'],resources,t.get('itinerantUnitId'))
    if t.get('participantId'):assert t['participantId'] not in op['people'];op['people'].add(t['participantId'])
   assert len(operations)==23
   for x,y in itertools.combinations(operations.values(),2):
    if overlap(x,y):assert x['space']!=y['space'] and not x['resources']&y['resources'] and not x['people']&y['people'] and not(x['unit'] and x['unit']==y['unit'])
   rests=proof['operationalMeals'];assert len(rests)==1
   rest=rests[0];declared=auth['rest']['policies'][0];assert rest['end']-rest['start']==declared['durationMinutes'] and minute(declared['window']['start'])<=rest['start'] and rest['end']<=minute(declared['window']['end'])
   assert set(rest['resourceIds'])=={'plan-resource:'+str(i) for i in declared['planResourceItemIds']} and set(rest['spaceIds'])=={'space:'+str(i) for i in declared['spaceIds']}
   for op in operations.values():
    if overlap(op,rest):assert not op['resources']&set(rest['resourceIds']) and op['space'] not in rest['spaceIds']
   ordered=[t for phase in policy['phases'] for t in sorted([by[i] for i in phase],key=lambda t:t['start'])];assert all(x['end']==y['start'] for x,y in zip(ordered,ordered[1:]))
   mains=sorted([t for t in tasks if t['kind']=='main'],key=lambda t:t['start']);assert len(mains)==3 and all(x['end']==y['start'] for x,y in zip(mains,mains[1:]))
   accepted=read(base,f'{label}-S{n}-accepted')['activeStage'];sql=read(base,f'{label}-S{n}-sql');assert sql['snapshot_json']==accepted['snapshotJson'] and sql['snapshot_fingerprint']==accepted['snapshotFingerprint']
   placed=[t for t in sql['snapshot_json']['tasks'] if t['startPlanned']]
   if n==1:assert len(placed)==1;fixed=placed
   else:assert len(placed)==24 and all(t in placed for t in fixed)
   for suffix in ['forgeries','unit-forgeries']:
    for attack in read(base,f'{label}-S{n}-{suffix}'):
     assert attack['error']['code']=='P0001'
     if attack['mode'] not in ['bad-fingerprint','wrong-run']:
      assert not any(s in attack['error']['message'] for s in ['FINGERPRINT','AUTHENTIC_PROPOSAL','CERTIFICATE_REQUIRED'])
      if attack.get('consumer')=='guard_resource_availability_operation':
       assert attack['mode'] in ['coach-unavailable','resource-unavailable'] and attack['error']['message']=='RESOURCE_AVAILABILITY_CAPTURED_SOURCES'
       report['SQLSourceProtectionNegatives']=report.get('SQLSourceProtectionNegatives',0)+1
      else:report['SQLMaterialNegatives']+=1
   report['SQLStages']+=1;report['physical'].append({'stack':str(base),'label':label,'stage':n,'obligations':24,'physicalOperations':23,'branches':r['evidence']['work']['branchesExplored']})
 neg=read(base,'impossible-S1-run')['assisted_result_json'];assert neg['outcome']=='NO_PROPOSAL' and neg['evidence']['work']['branchesExplored']==10000 and any('BUDGET' in c for c in neg['evidence']['reasonCodes'])
for label in labels:
 assert read(a.native,label+'-adapter')['problemFingerprint']==read(a.repeat,label+'-adapter')['problemFingerprint']
 for n in [1,2]:
  x=read(a.native,f'{label}-S{n}-run')['assisted_result_json'];y=read(a.repeat,f'{label}-S{n}-run')['assisted_result_json']
  for k in ['proposal','proposedDraftFingerprint','proposedDraftSnapshot']:assert x[k]==y[k],(label,n,k)
  for k in ['work','nominalPhysicalFutureWitness','technicalChainCertificate']:assert x['evidence'][k]==y['evidence'][k],(label,n,k)
  assert read(a.native,f'{label}-S{n}-sql')==read(a.repeat,f'{label}-S{n}-sql'),(label,n,'SQL')
  report['determinism'].append({'label':label,'stage':n,'literal':True})
report['integratedImpossible']='SEARCH_EXHAUSTED, not an infeasibility certificate';a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if not isinstance(v,list)}))
