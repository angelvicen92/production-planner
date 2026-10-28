"""Read-only verification of authentic receipts and memory experiments; never connects to DB."""
import argparse,gzip,json,pathlib,hashlib
p=argparse.ArgumentParser();p.add_argument('native',type=pathlib.Path);p.add_argument('repeat',type=pathlib.Path);p.add_argument('memory',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);a=p.parse_args()
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
  for rest in proof.get('operationalMeals',[]):
   if overlapping(x,rest):assert not set(x['resources'])&set(rest['resourceIds']) and not (x['blocks'] and x['space'] in rest['spaceIds'])
 return vals
policy=read(a.native,'integrated-requested-policy');phase_ids=policy['phases']
def phases(proof):
 by={int(t['id'][5:]):t for t in proof['tasks']};order=[]
 for ids in phase_ids:
  ts=sorted([by[i] for i in ids],key=lambda t:t['start']);assert all(x['end']==y['start'] for x,y in zip(ts,ts[1:]));order.append([t['id'] for t in ts])
 for x,y in zip(phase_ids,phase_ids[1:]):assert max(by[i]['end'] for i in x)==min(by[i]['start'] for i in y)
 return order
report={'status':'PASS','productChange':False,'phaseStageAccepted':False,'physical':[],'memory':[],'determinism':[]}
for base in [a.native,a.repeat]:
 assert read(base,'integration')['status']=='PASS'
 for stage in [1,2]:
  run=read(base,f'integrated-S{stage}-run')['assisted_result_json'];proof=run['evidence']['nominalPhysicalFutureWitness'];ops=physical(proof);assert len(proof['tasks'])==15 and len(ops)==14
  accepted=read(base,f'integrated-S{stage}-accepted')['activeStage'];sql=read(base,f'integrated-S{stage}-sql');assert accepted['snapshotJson']==sql['snapshot_json'];placed=[t for t in sql['snapshot_json']['tasks'] if t['startPlanned']]
  assert len(placed)==(1 if stage==1 else 15)
  for t in placed:
   other=next(x for x in proof['tasks'] if x['id']==f"task:{t['taskId']}");assert minute(t['startPlanned'])==other['start'] and minute(t['endPlanned'])==other['end'];assert [f'plan-resource:{i}' for i in t['assignedResourceIds']]==other.get('requiredResourceIds',[])
  report['physical'].append({'base':str(base),'stage':stage,'accepted':len(placed),'futureObligations':15,'physicalOccupations':14,'branches':run['evidence']['work']['branchesExplored']})
 # Stages certify only configured rules: show that absent phases are materially different.
 proof=read(base,'integrated-S2-run')['assisted_result_json']['evidence']['nominalPhysicalFutureWitness'];by={int(t['id'][5:]):t for t in proof['tasks']};assert max(by[i]['end'] for i in phase_ids[0])>min(by[i]['start'] for i in phase_ids[1])
 reject=read(base,'integrated-first-api-rejection');assert reject=={'status':400,'body':{'message':"Unrecognized key(s) in object: 'phases'"}}
 neg=read(base,'impossible-S1-run')['assisted_result_json'];assert neg['outcome']=='NO_PROPOSAL';assert neg['evidence']['work']['branchesExplored']==6;assert not any('BUDGET_EXHAUSTED' in s for s in neg['evidence']['reasonCodes'])
for name in ['full','member-scope','independent-scope','continuation','reverse-phase-1','reverse-phase-2','reverse-phase-3','rest-in-former-block','joint-peer-scope']:
 r=read(a.memory,name);assert r['result']['evidence']['hardValid'] and r['globalWitnessValidation']['hardValid'];proof=r['result']['evidence']['nominalPhysicalFutureWitness'];physical(proof);order=phases(proof);report['memory'].append({'name':name,'proposalCount':len(r['result']['proposal']),'globalObligations':len(proof['tasks']),'branches':r['result']['evidence']['work']['branchesExplored'],'phaseOrder':order,'fingerprint':proof['fingerprint']})
base_orders=report['memory'][0]['phaseOrder']
for phase in range(3):assert report['memory'][4+phase]['phaseOrder'][phase]!=base_orders[phase]
peer=read(a.memory,'joint-peer-scope');assert len(peer['scope']['productTaskIds'])==2 and len(peer['result']['proposal'])==2 and len(peer['problem']['supportingTaskIds'])==9
cert=read(a.memory,'existing-chain-certificate');assert cert['status']=='INVALID' and cert['validation']['reasonCodes']==['OPERATIONAL_MEAL_VIOLATION'];assert read(a.memory,'chain-certificate-without-rest')['status']=='WITNESS'
trace=read(a.memory,'direct-execution')['result'];assert trace['complete'];e=trace['evidence'];assert e['branchesExplored']==81 and e['standaloneBacktracks']==0;assert sum(v['total'] for v in e['causalDiagnostic']['waterfallByDepth'].values())==81
report['trace']={k:e[k]for k in ['branchesExplored','coreBranches','standaloneBacktracks','technicalChainBranchesExplored','technicalChainRootStartsConsidered','technicalChainRootStartsFeasible','lastExhaustionPhase']}
for stage in [1,2]:
 x=read(a.native,f'integrated-S{stage}-run')['assisted_result_json'];y=read(a.repeat,f'integrated-S{stage}-run')['assisted_result_json'];assert x['proposal']==y['proposal'];assert x['evidence']['work']==y['evidence']['work'];assert x['evidence']['nominalPhysicalFutureWitness']==y['evidence']['nominalPhysicalFutureWitness'];assert read(a.native,f'integrated-S{stage}-sql')['snapshot_fingerprint']==read(a.repeat,f'integrated-S{stage}-sql')['snapshot_fingerprint'];report['determinism'].append({'stage':stage,'exactProposal':True,'exactWitness':True,'exactWork':True,'exactSQLFingerprint':True,'idOrTimeNormalization':False})
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,ensure_ascii=False,indent=2));print('PASS: two discarded databases, authentic stages, physical occupancy, memory phases/continuation/certificate boundary and exact determinism')
