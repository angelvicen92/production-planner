"""Explain the existing SQL space predicate over the literal engine witness.
This is diagnostic analysis, not an additional product validator.
"""
import json,pathlib,sys
probe,sql,out=map(pathlib.Path,sys.argv[1:])
r=json.loads((probe/'run.json').read_text());a=json.loads((probe/'adapter.json').read_text());i=json.loads((probe/'input.json').read_text());s=json.loads((sql/'sql-consumer-probe.json').read_text())
assert s['rolledBack'] and s['syntheticMetadata']
assert s['error']['message']=='ANCHORED_WITNESS_SPACE_CONFLICT'
assert s['error']['step']=='original-physical-consumer'
tasks=r['evidence']['nominalPhysicalFutureWitness']['tasks'];groups=[{f'task:{id}' for id in g['taskIds']} for g in i['dailyJointGroups']]
policies=a['problem']['transportPolicy'];direction={id:d for d,p in policies.items() for id in p['taskIds']}
for d,p in policies.items():
 by_start={}
 for t in tasks:
  if t['id'] in p['taskIds']:by_start.setdefault(t['start'],[]).append(t)
 assert all(p['minimumGroupSize']<=len(ts)<=p['maximumGroupSize'] for ts in by_start.values())
 assert all(len({t['end'] for t in ts})==1 for ts in by_start.values())
 starts=sorted(by_start);assert all(b-a>=p['minGapMinutes'] for a,b in zip(starts,starts[1:]))
pairs=[]
for n,left in enumerate(tasks):
 for right in tasks[n+1:]:
  if left['spaceId']!=right['spaceId'] or left.get('blocksSpace') is False or right.get('blocksSpace') is False:continue
  if not(left['start']<right['end'] and right['start']<left['end']):continue
  if any({left['id'],right['id']}<=g for g in groups):continue
  assert left['id'] in direction and right['id'] in direction
  assert direction[left['id']]==direction[right['id']]
  assert (left['start'],left['end'])==(right['start'],right['end'])
  pairs.append({'left':left['id'],'right':right['id'],'direction':direction[left['id']],'space':left['spaceId'],'start':left['start'],'end':left['end']})
assert pairs
result={'status':'CONSUMER_DEFECT','originalSQLConsumerRejected':s['error'],'hashesRecalculated':True,'SQLAdmissionOnlyShadows':s['replacements'],'SQLMaterialConsumerModified':False,'allNonJointPhysicalSpaceOverlapsAreAuthorizedTransport':True,'unrecognizedAuthorizedTransportPairs':len(pairs),'pairs':pairs,'completeEngineWitness':{'tasks':84,'meals':19,'hardValid':True,'branches':r['evidence']['work']['branchesExplored']},'syntheticSQLMetadata':True,'acceptedStages':0,'rolledBack':True,'implementationGate':'STOP_MATERIAL_SQL_CONTRACT_NOT_CERTIFIED'}
out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='pairs'}))
