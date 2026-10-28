"""Independent offline physics and exact determinism checks; no product writes."""
import argparse,gzip,json,pathlib
p=argparse.ArgumentParser();p.add_argument('native',type=pathlib.Path);p.add_argument('repeat',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);a=p.parse_args();cache={}
def read(base,name):
 path=base/(name+'.json')
 if path.exists():return json.loads(path.read_text())
 if base not in cache:cache[base]=json.loads(gzip.decompress((base/'receipts.json.gz').read_bytes()))
 return cache[base][name+'.json']
def minute(t):return int(t[:2])*60+int(t[3:5])
def overlaps(x,y):return x['start']<y['end'] and y['start']<x['end']
def contained(t,windows):return any(w['start']<=t['start'] and t['end']<=w['end'] for w in windows)
labels=['baseline','A-fixed','B-segments','C-joint-unit','D-rest-competition','unused-snapshot']
report={'status':'PASS','physical':[],'determinism':[],'SQLStages':0,'itinerantStages':0,'remoteWrites':0}
for base in [a.native,a.repeat]:
 assert read(base,'integration')['status']=='PASS'
 for label in labels:
  inp=read(base,label+'-input');auth=read(base,label+'-authoring');policy=auth['policy'];effective={x['taskId']:x['effectiveResourceIds'] for x in read(base,label+'-memory-effective')['assignments']}
  unitmap={u['id']:sorted(m['planResourceItemId'] for m in u['members']) for u in inp['itinerantCompositionSnapshot']['units']}
  assert len(effective)==17
  for u in inp['itinerantCompositionSnapshot']['units']:
   for m in u['members']:assert [r['id'] for r in inp['planResourceItems'] if r['resourceItemId']==m['resourceItemId']]==[m['planResourceItemId']]
  for name in ['full','partial','continuation','scope-unit']:
   r=read(base,f'{label}-memory-{name}');problem=r['adapter']['problem'];result=r['result'];proof=result['evidence']['nominalPhysicalFutureWitness'];tasks=proof['tasks'];by={int(t['id'][5:]):t for t in tasks}
   assert len(tasks)==len(by)==17 and r['globalValidation']['hardValid'] and r['certificate']['status']=='WITNESS' and r['certificate']['consumed']==0
   ops={}
   for t in tasks:
    source=next(x for x in inp['tasks'] if x['id']==int(t['id'][5:]));expected=effective[source['id']]
    assert t.get('requiredResourceIds',[])==sorted('plan-resource:'+str(i) for i in expected)
    if source.get('itinerantTeamId') is not None:
     assert t['itinerantUnitId']=='itinerant-team:'+str(source['itinerantTeamId']);assert set(unitmap[source['itinerantTeamId']])<=set(expected)
     unit=next(u for u in problem['itinerantUnits'] if u['id']==t['itinerantUnitId']);assert contained(t,unit['availability'])
    else:assert 'itinerantUnitId' not in t
    assert t['end']-t['start']==source['durationOverrideMin']
    for dep in t['dependencies']:assert by[int(dep[5:])]['end']<=t['start']
    for rid in t.get('requiredResourceIds',[]):assert contained(t,next(x for x in problem['resources'] if x['id']==rid)['availability'])
    assert contained(t,next(x for x in problem['participants'] if x['id']==t['participantId'])['availability'])
    assert contained(t,next(x for x in problem['spaces'] if x['id']==t['spaceId'])['availability'])
    key=t.get('jointGroupId',t['id']);op=ops.setdefault(key,{'start':t['start'],'end':t['end'],'space':t['spaceId'],'blocks':t.get('blocksSpace',True),'resources':t.get('requiredResourceIds',[]),'participants':[],'unit':t.get('itinerantUnitId')})
    assert (op['start'],op['end'],op['space'],op['resources'],op['unit'])==(t['start'],t['end'],t['spaceId'],t.get('requiredResourceIds',[]),t.get('itinerantUnitId'));op['participants'].append(t['participantId'])
   assert len(ops)==16
   values=list(ops.values())
   for i,x in enumerate(values):
    assert len(x['participants'])==len(set(x['participants']))
    for y in values[i+1:]:
     if overlaps(x,y):
      assert not set(x['resources'])&set(y['resources']);assert not set(x['participants'])&set(y['participants']);assert not(x['space']==y['space'] and x['blocks'] and y['blocks']);assert not(x['unit'] and x['unit']==y['unit'])
    for rest in proof['operationalMeals']:
     if overlaps(x,rest):assert not set(x['resources'])&set(rest['resourceIds']) and not(x['blocks'] and x['space'] in rest['spaceIds'])
   assert len(proof['operationalMeals'])==1
   rest=proof['operationalMeals'][0];declared=auth['rest']['policies'][0]
   assert rest['end']-rest['start']==15 and minute(declared['window']['start'])<=rest['start'] and rest['end']<=minute(declared['window']['end'])
   assert set(rest['resourceIds'])=={'plan-resource:'+str(i) for i in declared['planResourceItemIds']}
   phases=[sorted([by[i] for i in phase],key=lambda t:t['start']) for phase in policy['phases']];flat=[t for phase in phases for t in phase];assert all(x['end']==y['start'] for x,y in zip(flat,flat[1:]))
   assert result['proposal']
   if name=='partial':
    assert len(result['proposal'])==1;fixed=result['proposal'][0]
   if name=='continuation':
    assert fixed in tasks and fixed['id'] not in [t['id'] for t in result['proposal']];assert result['evidence']['protectedPlacementsPreserved'];assert len(result['proposal'])==16
   if name=='scope-unit':
    assert len(result['proposal'])==8;assert len(tasks)-len(result['proposal'])==9
   report['physical'].append({'base':base.name,'label':label,'scope':name,'obligations':17,'physicalOperations':16,'branches':result['evidence']['work']['branchesExplored']})
  assert read(base,label+'-release')['released'] and not read(base,label+'-release')['withInventedHold']
  assert all(not x['validation']['hardValid'] for x in read(base,label+'-memory-attacks'))
  if label not in ['baseline','unused-snapshot']:
   assert auth['jointResponse']['status']==auth['phaseResponse']['status']==422
   assert auth['jointSQL']['message']=='UNSUPPORTED_JOINT_COMBINATION' and auth['phaseSQL']['message']=='UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION'
   assert auth['beforePlan']==auth['afterPlan'];assert auth['beforeDraft']['draft']==auth['afterDraft']['draft'];assert len(auth['afterDraft']['history'])==1
   # Existing SQL authority omits pure team contributions, as observed by SELECT.
   sql={int(x['id']):x['resources'] for x in read(base,label+'-sql-resources')}
   assert any(sql[t['id']]!=effective[t['id']] for t in inp['tasks'] if t.get('itinerantTeamId') is not None)
 for stage in [1,2]:
  run=read(base,f'baseline-S{stage}-run')['assisted_result_json'];sql=read(base,f'baseline-S{stage}-sql');accepted=read(base,f'baseline-S{stage}-accepted')['activeStage'];assert sql['snapshot_json']==accepted['snapshotJson']
  placed=[t for t in sql['snapshot_json']['tasks'] if t['startPlanned']];assert len(placed)==(1 if stage==1 else 17)
  if stage==1:fixed=placed
  else:assert all(t in placed for t in fixed)
  assert run['evidence']['technicalChainCertificate']['status']=='WITNESS';report['SQLStages']+=1
 neg=read(base,'impossible-memory-full');assert neg['adapter']['status']=='SUPPORTED' and neg['result']['proposal'] is None;assert not any('BUDGET' in c or 'TIME_LIMIT' in c for c in neg['result']['evidence']['reasonCodes'])
 assert read(base,'A-fixed-positive-transition')['validationOfZeroGapWitness']['hardValid'] is False
 assert not read(base,'B-segments-shared-members')['overlapPermitted']
 for blocks in ['true','false']:
  r=read(base,'A-fixed-memory-agenda-'+blocks);assert r['adapter']['status']=='SUPPORTED' and r['globalValidation']['hardValid'];assert r['certificate']['status']=='WITNESS'
  original={t['id']:t for t in read(base,'A-fixed-memory-full')['adapter']['problem']['tasks']}
  for t in r['adapter']['problem']['tasks']:
   assert t.get('requiredResourceIds',[])==original[t['id']].get('requiredResourceIds',[])
   if t.get('itinerantUnitId'):assert t.get('blocksSpace',True)==(blocks=='true')
for label in labels+['impossible']:
 for name in ['full','repeat']+([] if label=='impossible' else ['partial','continuation','scope-unit']):
  x=read(a.native,f'{label}-memory-{name}');y=read(a.repeat,f'{label}-memory-{name}')
  assert x['adapter']['problemFingerprint']==y['adapter']['problemFingerprint']
  assert x['result']['proposal']==y['result']['proposal'];assert x['result']['evidence']['work']==y['result']['evidence']['work'];assert x['result']['evidence'].get('nominalPhysicalFutureWitness')==y['result']['evidence'].get('nominalPhysicalFutureWitness');report['determinism'].append({'label':label,'scope':name,'exact':True})
for stage in [1,2]:assert read(a.native,f'baseline-S{stage}-sql')['snapshot_fingerprint']==read(a.repeat,f'baseline-S{stage}-sql')['snapshot_fingerprint']
report['impossibleCapacity']={'resource':'A','phases':25,'competition':15,'rest':15,'demand':55,'available':40,'branches':read(a.native,'impossible-memory-full')['result']['evidence']['work']['branchesExplored']}
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2));print(json.dumps({'status':report['status'],'SQLStages':report['SQLStages'],'itinerantStages':0,'physicalWitnesses':len(report['physical']),'deterministicCases':len(report['determinism'])}))
