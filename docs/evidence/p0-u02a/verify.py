"""Offline receipt and physical verification. Does not import the product or construct schedules."""
import gzip,hashlib,json,pathlib,itertools
base=pathlib.Path(__file__).parent
read=lambda folder:json.loads(gzip.decompress((base/folder/'receipts.json.gz').read_bytes()))
native,memory,main,phases=map(read,['native','memory','control-main','control-phases'])
for folder,data in [('native',native),('memory',memory),('control-main',main),('control-phases',phases)]:
 manifest=json.loads((base/folder/'manifest.json').read_text());assert manifest['receiptCount']==len(data)
 for k,v in data.items():assert hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()==manifest['files'][k]
assert all(d['integration.json']['status']=='PASS' for d in [native,main,phases])
for stem,count in [('first',4),('second',9)]:
 stage=main[stem+'-stage.json']['activeStage'];assert stage['ordinal']==1 and len(stage['snapshotJson']['tasks'])==count
 assert all(t['startPlanned'] for t in stage['snapshotJson']['tasks'])
checks=[]
def inside(task,windows):return any(w['start']<=task['start'] and task['end']<=w['end'] for w in windows)
def overlap(a,b):return a['start']<b['end'] and b['start']<a['end']
for label in ['integrated','reverse-order']:
 inp=native[label+'-input.json'];auth=native[label+'-authoring.json'];assert len(inp['tasks'])==24
 assert auth['beforePlan']==auth['afterPlan']
 assert all(a['response']['status']==422 and not a['sql']['accepted'] for a in auth['attempts'])
 assert native[label+'-ui.json']['technicalChainDisabled'] and native[label+'-ui.json']['jointDisabled']
 effective={a['taskId']:a['effectiveResourceIds'] for a in memory[label+'-effective.json']['assignments']}
 assert {int(r['id']):r['resources'] for r in native[label+'-sql-resources.json']}==effective
 for name,count in [('full',24),('repeat',24),('partial',1),('continuation',23),('scope-unit',8),('main-only',3)]:
  d=memory[f'{label}-{name}.json'];assert d['stage'] is False and d['memoryOnly'] is True
  p=d['adapter']['problem'];r=d['result'];w=r['evidence']['nominalPhysicalFutureWitness'];tasks=w['tasks'];assert len(tasks)==len({t['id'] for t in tasks})==24
  assert len(r['proposal'])==count and d['globalValidation']['hardValid'] and d['certificate']['status']=='WITNESS'
  assert r['evidence']['acceptedSupportingPlacements']==[] and r['evidence']['protectedPlacementsPreserved']
  source={t['id']:t for t in inp['tasks']};scheduled={int(t['id'][5:]):t for t in tasks};ops={}
  for t in tasks:
   src=source[int(t['id'][5:])];assert t['end']-t['start']==src['durationOverrideMin']
   resources=set(t.get('requiredResourceIds',[]))|({t['coachId']} if t.get('coachId') else set())
   assert resources=={'plan-resource:'+str(i) for i in effective[src['id']]}
   for dep in src.get('dependsOnTaskIds',[]):assert scheduled[dep]['end']<=t['start']
   if t.get('participantId'):assert inside(t,next(x for x in p['participants'] if x['id']==t['participantId'])['availability'])
   assert inside(t,next(x for x in p['spaces'] if x['id']==t['spaceId'])['availability'])
   for rid in resources:assert inside(t,next(x for x in p['resources']+p['coaches'] if x['id']==rid)['availability'])
   uid=src.get('itinerantTeamId');assert t.get('itinerantUnitId')==('itinerant-team:'+str(uid) if uid else None)
   if uid:assert inside(t,next(x for x in p['itinerantUnits'] if x['id']==t['itinerantUnitId'])['availability'])
   key=t.get('jointGroupId',t['id']);op=ops.setdefault(key,{'start':t['start'],'end':t['end'],'space':t['spaceId'],'resources':resources,'unit':t.get('itinerantUnitId'),'people':set()})
   assert (op['start'],op['end'],op['space'],op['resources'],op['unit'])==(t['start'],t['end'],t['spaceId'],resources,t.get('itinerantUnitId'))
   if t.get('participantId'):assert t['participantId'] not in op['people'];op['people'].add(t['participantId'])
  assert len(ops)==23
  for a,b in itertools.combinations(ops.values(),2):
   if overlap(a,b):assert a['space']!=b['space'] and not a['resources']&b['resources'] and not a['people']&b['people'] and not(a['unit'] and a['unit']==b['unit'])
  for rest in w['operationalMeals']:
   policy=next(x for x in p['operationalMealPolicies'] if x['id']==rest['id']);assert inside(rest,[policy['window']]) and rest['end']-rest['start']==policy['duration']
   assert set(rest['resourceIds'])==set(policy['resourceIds']) and set(rest['spaceIds'])==set(policy['spaceIds'])
   for op in ops.values():
    if overlap(op,rest):assert not op['resources']&set(rest['resourceIds']) and op['space'] not in rest['spaceIds']
  assert len(w['operationalMeals'])==1
  chain=[scheduled[i] for phase in auth['policy']['phases'] for i in sorted(phase,key=lambda i:scheduled[i]['start'])]
  assert all(a['end']==b['start'] for a,b in zip(chain,chain[1:]))
  mains=sorted([t for t in tasks if t['kind']=='main'],key=lambda t:t['start']);assert len(mains)==3 and len({t['coachId'] for t in mains})==2
  assert all(a['end']==b['start'] for a,b in zip(mains,mains[1:]))
  checks.append({'label':label,'case':name,'proposal':count,'globalObligations':24,'physicalOperations':23,'branches':r['evidence']['work']['branchesExplored']})
 assert memory[label+'-full.json']['result']['proposal']==memory[label+'-repeat.json']['result']['proposal']
 assert memory[label+'-full.json']['result']['evidence']['work']==memory[label+'-repeat.json']['result']['evidence']['work']
 fixed=memory[label+'-partial.json']['result']['proposal'];assert all(t in memory[label+'-continuation.json']['result']['evidence']['nominalPhysicalFutureWitness']['tasks'] for t in fixed)
 assert len(memory[label+'-attacks.json'])==6 and all(not x['validation']['hardValid'] for x in memory[label+'-attacks.json'])
negative=memory['impossible-full.json']['result'];assert negative['proposal'] is None and 'STANDALONE_BRANCH_BUDGET_EXHAUSTED' in negative['evidence']['reasonCodes']
assert phases['impossible-S1-run.json']['assisted_result_json']['outcome']=='NO_PROPOSAL'
assert phases['A-fixed-S1-sql.json']['ordinal']==1 and phases['A-fixed-S2-sql.json']['ordinal']==2
for label in ['integrated','reverse-order','impossible']:assert native[label+'-S0.json']['activeStage']['ordinal']==0
support=json.loads((base/'supporting.json').read_text());assert support['validation']['hardValid'] and support['changed'] in support['supportingTaskIds'] and support['acceptedSupportingPlacements']==[]
capacity=json.loads((base/'capacity.json').read_text());assert capacity['validation']['hardValid'] and capacity['taskCount']==24 and not capacity['stage']
report={'status':'PASS','runtimeBase':'bd6628d127624ba367f408422906b3da36150626','mainControl':[4,9],'freshPhaseStages':16,'freshIntegratedStages':0,'counterfactual':checks,'negativeSearch':'SEARCH_EXHAUSTED on physically infeasible input; no infeasibility certificate claimed','supportingRepair':support['changed'],'physicalWitnessTasks':24}
(base/'verification.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
