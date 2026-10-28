"""Independent physical verifier. No App/solver imports; accepts live or packed receipts."""
import argparse,gzip,json,pathlib,itertools,hashlib,copy
p=argparse.ArgumentParser();p.add_argument('receipts',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);args=p.parse_args()
root=args.receipts
packed=json.loads(gzip.decompress((root/'receipts.json.gz').read_bytes())) if (root/'receipts.json.gz').exists() else None
def exists(n):return n+'.json' in packed if packed is not None else (root/(n+'.json')).exists()
def read(n):return packed[n+'.json'] if packed is not None else json.loads((root/(n+'.json')).read_text())
def minute(x):return int(x[:2])*60+int(x[3:5])
def overlap(a,b):return a['start']<b['end'] and b['start']<a['end']
def inside(t,windows):return any(minute(w['start'])<=t['start'] and t['end']<=minute(w['end']) for w in windows)
def check(inp,a,w):
 ts=w['tasks'];by={int(t['id'][5:]):t for t in ts};assert len(by)==len(ts)==27
 assert set(by)=={t['id'] for t in inp['tasks']}
 units={u['itinerantTeamId']:u for u in inp['itinerantTeamAvailability']}
 inventory={r['id']:r for r in inp['planResourceItems']};global_ids={r['resourceItemId']:r['id'] for r in inventory.values()}
 ops={}
 for src in inp['tasks']:
  t=by[src['id']];assert t['end']-t['start']==src['durationOverrideMin']
  assert t['spaceId']=='space:'+str(src['spaceId']) and t['kind']==src['plannerNextKind']
  assert t.get('blocksSpace',True)==src.get('blocksSpace',True)
  for declared in a['taskOperationScopes']['policies']:
   if src['id']==declared['taskId']:assert src['agendaScope']==declared['agendaScope'] and src['resourceInheritance']==declared['resourceInheritance']
  for declared in a['anchoredAccompaniments']['policies']:
   if src['id'] in declared['beforeTaskIds']+declared['afterTaskIds']:assert src['agendaScope']=='ITINERANT_UNIT' and src['resourceInheritance']=='OPERATION_ONLY'
   if src['id']==declared['anchorTaskId']:assert src['agendaScope']=='PHYSICAL_SPACE' and src['resourceInheritance']=='LOCATION'
  expected=set(src.get('declaredResourceIds') or [])|set(src.get('assignedResourceIds') or [])
  expected|={global_ids[int(k)] for k,v in (src.get('resourceRequirements') or {}).get('byItem',{}).items() if v==1}
  if src.get('resourceInheritance','LOCATION')=='LOCATION':
   expected|=set(inp['spaceResourceAssignments'].get(str(src['spaceId']),[]))|set(inp['zoneResourceAssignments'].get(str(src['zoneId']),[]))
  uid=src.get('itinerantTeamId');assert t.get('itinerantUnitId')==('itinerant-team:'+str(uid) if uid else None)
  if uid:expected|=set(units[uid]['planResourceItemIds']);assert inside(t,units[uid]['windows'])
  coach=inp['vocalCoachPlanResourceItemIdByContestantId'].get(str(src.get('contestantId'))) if src['plannerNextKind'] in ['main','vocal'] else None
  assert t.get('coachId')==('plan-resource:'+str(coach) if coach else None)
  if coach:expected.add(coach)
  resources={int(x[14:]) for x in t.get('requiredResourceIds',[])}|({coach} if coach else set());assert resources==expected,(src['id'],resources,expected)
  for rid in resources:
   r=inventory[rid];assert r['isAvailable'];assert minute(r['availabilityStart'] or inp['workDay']['start'])<=t['start'] and t['end']<=minute(r['availabilityEnd'] or inp['workDay']['end'])
  if src.get('contestantId'):
   avail=inp['contestantAvailabilityById'][str(src['contestantId'])];assert inside(t,[avail])
  assert inside(t,[inp['workDay']])
  sp=next(x for x in inp['planSpaceSettings'] if x['spaceId']==src['spaceId']);zone=next(x for x in inp['planZoneSettings'] if x['zoneId']==src['zoneId'])
  assert max(minute(sp.get('availabilityStart') or inp['workDay']['start']),minute(zone.get('availabilityStart') or inp['workDay']['start']))<=t['start']
  assert t['end']<=min(minute(sp.get('availabilityEnd') or inp['workDay']['end']),minute(zone.get('availabilityEnd') or inp['workDay']['end']))
  for br in inp['globalHardBreaks']:assert not overlap(t,{'start':minute(br['start']),'end':minute(br['end'])})
  for dep in src.get('dependsOnTaskIds',[]):assert by[dep]['end']<=t['start']
  op=ops.setdefault(src.get('jointGroupId') or str(src['id']),{'start':t['start'],'end':t['end'],'space':t['spaceId'],'blocks':t.get('blocksSpace',True),'resources':resources,'unit':uid,'people':set()})
  assert (op['start'],op['end'],op['space'],op['resources'],op['unit'])==(t['start'],t['end'],t['spaceId'],resources,uid)
  if src.get('contestantId'):op['people'].add(src['contestantId'])
 assert len(ops)==26
 for x,y in itertools.combinations(ops.values(),2):
  if overlap(x,y):
   assert not(x['blocks'] and y['blocks'] and x['space']==y['space'])
   assert not x['resources']&y['resources'] and not x['people']&y['people'] and not(x['unit'] and x['unit']==y['unit'])
 anchor=a['anchoredAccompaniments']['policies'][0];members=[by[i] for i in anchor['beforeTaskIds']+[anchor['anchorTaskId']]+anchor['afterTaskIds']]
 assert all(x['end']==y['start'] for x,y in zip(members,members[1:]));assert len({t['itinerantUnitId'] for t in members})==1
 mains=sorted([t for t in ts if t['kind']=='main'],key=lambda t:t['start']);assert len(mains)==3 and all(x['end']==y['start'] for x,y in zip(mains,mains[1:]))
 for policy in a['technicalChains']['policies']:
  ordered=[t for phase in policy['phases'] for t in sorted([by[i] for i in phase],key=lambda t:t['start'])]
  assert all(x['end']==y['start'] for x,y in zip(ordered,ordered[1:]))
 rests=w['operationalMeals'];assert len(rests)==1;r=rests[0];decl=a['operationalMealPolicies']['policies'][0]
 assert r['end']-r['start']==decl['durationMinutes'] and inside(r,[decl['window']])
 assert set(r['resourceIds'])=={'plan-resource:'+str(i) for i in decl['planResourceItemIds']};assert set(r['spaceIds'])=={'space:'+str(i) for i in decl['spaceIds']}
 for op in ops.values():
  if overlap(op,r):assert not op['resources']&set(decl['planResourceItemIds']) and not(op['blocks'] and op['space'] in r['spaceIds'])
 return {'obligations':len(ts),'physicalOperations':len(ops),'main':3,'vocal':3,'anchoredContinuity':True,'requiredPhases':True,'pause':True}
report={'status':'PASS','experimentIsStage':False,'profiles':[]}
for profile in read('profiles'):
 label=profile['label'];inp=read(label+'-combined-input');o=read(label+'-obligations');a=o['authorities'];actual=read(label+'-actual-input');original=read(label+'-original-24')
 assert len(original['tasks'])==24 and set(o['originalTaskIds'])=={t['id'] for t in original['tasks']}
 assert all(t['id'] in {c['id'] for c in inp['tasks']} for t in original['tasks'])
 # Original tasks retain all source physical fields; only anchor and authored joint markers may differ.
 anchor=a['anchoredAccompaniments']['policies'][0]['anchorTaskId']
 for t in original['tasks']:
  c=next(c for c in inp['tasks'] if c['id']==t['id'])
  for k,v in t.items():
   if k=='jointGroupId' or t['id']==anchor and k in ['itinerantTeamRequirement','itinerantTeamId','allowedItinerantTeamIds']:continue
   assert c.get(k)==v,(label,t['id'],k)
 attempts=read(label+'-authoring');assert any(x['response']['status']==422 for x in attempts)
 for x in attempts:
  if x['response']['status']==422:assert x['before']['plan']==x['after']['plan'] and x['before']['revision']==x['after']['revision'] and x['before']['session']==x['after']['session']
 if label=='reverse-order':
  probe=read(label+'-sql-scope-peer-probe');assert probe['full']['message']=='TASK_SCOPE_PHYSICAL_CONFLICT' and probe['withoutPeer']['accepted']
  assert 'daily_joint_groups' not in probe['originalBody'] and 'jointGroupId' not in probe['originalBody']
 if 'reverse' in label:
  standalone=a['taskOperationScopes']['policies'][0]['taskId'];row=next(x for x in read(label+'-sql-task-resources') if int(x['id'])==standalone)
  location=set(inp['spaceResourceAssignments'][str(next(t['spaceId'] for t in inp['tasks'] if t['id']==standalone))]);assert location.issubset(set(row['resources']))
 if exists(label+'-pre-counterfactual-state'):assert read(label+'-pre-counterfactual-state')==read(label+'-post-counterfactual-state')
 entry={'label':label,'firstRejection':next(x['response'] for x in attempts if x['response']['status']==422),'witnesses':[]}
 for suffix in ['full','partial','continuation','anchor-partial','anchor-continuation','supporting-scope']:
  if not exists(label+'-'+suffix):continue
  data=read(label+'-'+suffix);result=data.get('result');proof=(result or {}).get('evidence',{}).get('nominalPhysicalFutureWitness')
  if proof:
   entry['witnesses'].append({'scope':suffix,**check(inp,a,proof),'branches':result['evidence']['work']['branchesExplored']})
 if read(label+'-partial')['result']['proposal']:
  partial=read(label+'-partial')['result'];cont=read(label+'-continuation')['result'];assert len(partial['proposal'])==1 and len(cont['proposal'])==26
  assert partial['evidence'].get('acceptedSupportingPlacements',[])==[]
  proof=cont['evidence']['nominalPhysicalFutureWitness']['tasks'];assert all(t in proof for t in partial['proposal'])
 # Attack the verifier itself with coherent in-memory physical tampering.
 proof=read(label+'-full').get('result',{}).get('evidence',{}).get('nominalPhysicalFutureWitness')
 if proof:
  negatives=[]
  for mode in ['missing-direct','inherited-location','virtual-main','split-anchor','split-joint','phase-gap','shared-member','missing-obligation','pause-invasion']:
   bad=copy.deepcopy(proof);by={int(t['id'][5:]):t for t in bad['tasks']};standalone=by[a['taskOperationScopes']['policies'][0]['taskId']];anchor=a['anchoredAccompaniments']['policies'][0]
   if mode=='missing-direct':standalone['requiredResourceIds'].remove('plan-resource:'+str(a['taskOperationScopes']['policies'][0]['declaredResourceIds'][0]))
   if mode=='inherited-location':standalone['requiredResourceIds'].extend('plan-resource:'+str(r) for r in inp['spaceResourceAssignments'][str(next(t['spaceId'] for t in inp['tasks'] if t['id']==int(standalone['id'][5:])))])
   if mode=='virtual-main':by[anchor['anchorTaskId']]['blocksSpace']=False
   if mode=='split-anchor':t=by[anchor['beforeTaskIds'][0]];t['start']-=5;t['end']-=5
   if mode=='split-joint':t=by[a['jointGroups']['groups'][0]['taskIds'][1]];t['start']+=5;t['end']+=5
   if mode=='phase-gap':t=by[a['technicalChains']['policies'][0]['phases'][0][0]];t['start']+=5;t['end']+=5
   if mode=='shared-member':t=by[next(t['id'] for t in inp['tasks'] if t['templateName'].endswith('rival A'))];span=by[anchor['anchorTaskId']];t['end']=span['start']+t['end']-t['start'];t['start']=span['start']
   if mode=='missing-obligation':bad['tasks'].pop()
   if mode=='pause-invasion':r=bad['operationalMeals'][0];t=by[a['technicalChains']['policies'][0]['phases'][0][0]];r['end']=t['start']+r['end']-r['start'];r['start']=t['start']
   try:check(inp,a,bad)
   except (AssertionError,KeyError):negatives.append({'mode':mode,'rejected':True})
   else:raise AssertionError('Independent verifier accepted '+mode)
  entry['independentNegatives']=negatives
 if label.startswith('segmented'):
  result=read(label+'-full')['result'];assert result['proposal'] is None and result['evidence']['work']['branchesExplored']==10000
  entry['unconditionedClassification']='SEARCH_EXHAUSTED'
  if exists(label+'-search-probe'):
   probe=read(label+'-search-probe');later=next(x for x in probe['experiments'] if x['name']=='after-pause-window')
   witness=later['result']['result']['evidence']['nominalPhysicalFutureWitness'];entry['conditionalPhysicalWitness']=check(inp,a,witness)
   assert later['validation']['hardValid'];entry['conditionalPlacement']=later['conditionedPlacement'];entry['conditionalIsUnconditionedSuccess']=False
 else:
  assert len(entry['witnesses'])==6
  supporting=read(label+'-supporting-scope')['result'];assert len(supporting['proposal'])==8 and len(supporting['evidence']['supportingTaskIds'])==3 and supporting['evidence']['acceptedSupportingPlacements']==[]
  assert not set(supporting['evidence']['supportingTaskIds'])&{t['id'] for t in supporting['proposal']}
  fixed=read(label+'-anchor-partial')['result']['proposal'];future=read(label+'-anchor-continuation')['result']['evidence']['nominalPhysicalFutureWitness']['tasks'];assert len(fixed)==4 and all(t in future for t in fixed)
 report['profiles'].append(entry)
args.output.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
