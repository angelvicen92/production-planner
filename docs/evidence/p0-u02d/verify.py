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

report={'status':'PASS','nativeSQL':True,'profiles':[]}
for profile in read('profiles'):
 label=profile['label'];inp=read(label+'-input');a=read(label+'-obligations')['authorities'];original=read(label+'-original-24')
 assert len(original['tasks'])==24 and len(inp['tasks'])==27
 assert {t['id'] for t in original['tasks']} <= {t['id'] for t in inp['tasks']}
 assert all(x['response']['status']==200 and x['sql']['accepted'] for x in read(label+'-authoring'))
 if label.startswith('segmented'):
  run=read(label+'-exhausted-run')['assisted_result_json'];assert run['outcome']=='NO_PROPOSAL' and run['evidence']['work']['branchesExplored']==10000
  report['profiles'].append({'label':label,'status':'SEARCH_EXHAUSTED','acceptedStages':0});continue
 full=read(label+'-full')['result'];assert len(full['proposal'])==27
 entry={'label':label,'full':check(inp,a,full['evidence']['nominalPhysicalFutureWitness']),'stages':[]}
 for route in ['competitor','anchor']:
  prior=None
  for n in [1,2]:
   prefix=f'{label}-{route}-S{n}';run=read(prefix+'-run')['assisted_result_json'];proof=run['evidence']['nominalPhysicalFutureWitness'];verified=check(inp,a,proof)
   draft=read(prefix+'-draft')['draft'];sql=read(prefix+'-sql');snap=sql['snapshot_json'];accepted=read(prefix+'-accepted')['activeStage']
   assert snap==draft==accepted['snapshotJson']==read(prefix+'-cold-read')['activeStage']['snapshotJson']
   expected=(1 if route=='competitor' else 4) if n==1 else 27
   placed=[t for t in snap['tasks'] if t.get('startPlanned')];assert len(placed)==expected
   assert run['evidence'].get('acceptedSupportingPlacements',[])==[]
   w={int(t['id'][5:]):t for t in proof['tasks']}
   for t in placed:
    p=w[t['taskId']];assert minute(t['startPlanned'])==p['start'] and minute(t['endPlanned'])==p['end'];assert t['spaceId']==int(p['spaceId'][6:])
    assigned=set(t['assignedResourceIds']);required={int(x[14:]) for x in p.get('requiredResourceIds',[])};coach={int(p['coachId'][14:])} if p.get('coachId') else set()
    assert required<=assigned|coach and assigned<=required|coach
   if prior:
    for t in prior:
     if t.get('startPlanned'):assert t in snap['tasks']
   prior=snap['tasks']
   entry['stages'].append({'id':sql['id'],'route':route,'ordinal':sql['ordinal'],'fingerprint':sql['snapshot_fingerprint'],'accepted':len(placed),'pending':27-len(placed),'branches':run['evidence']['work']['branchesExplored'],**verified})
 report['profiles'].append(entry)
args.output.write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
