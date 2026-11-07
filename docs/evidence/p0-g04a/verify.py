"""Offline diagnosis checks: authentic UI authorities, obligation conservation and scope.
Does not create schedules or treat budget exhaustion as infeasibility.
"""
import hashlib,json,pathlib,sys
native,probe,out=map(pathlib.Path,sys.argv[1:])
read=lambda root,name:json.loads((root/(name+'.json')).read_text())
source=read(native,'native-input'); intended=read(native,'attempted-authorities')
input_=read(probe,'input'); a=read(probe,'adapter'); b=read(probe,'assisted-problem'); s=read(probe,'scope');run=read(probe,'run');summary=read(probe,'summary')
assert read(native,'integration')['status']=='PASS'
assert len(source['tasks'])==len({t['id'] for t in source['tasks']})==103
roles={r:[t for t in source['tasks'] if t.get('operationalRole')==r] for r in ['transport_arrival','transport_departure','meal_break_placeholder','productive_task']}
assert list(map(len,roles.values()))==[19,19,19,46]
participants={t['contestantId'] for t in roles['transport_arrival']}
assert len(participants)==19
for r in list(roles)[:3]:assert {t['contestantId'] for t in roles[r]}==participants
assert sum(t.get('plannerNextKind')=='main' for t in source['tasks'])==19
assert sum(t.get('plannerNextKind')=='vocal' for t in source['tasks'])==19
assert all(t['durationOverrideMin']==40 for t in roles['meal_break_placeholder'])
assert all(t.get('participantMarginBeforeMinutes')==0 for t in roles['transport_departure'])
assert source['workDay']=={'start':'09:00','end':'21:00'}
assert source['contestantAvailabilityById']['1']=={'start':'09:00','end':'15:30'}
assert all(w=={'start':'09:00','end':'19:00'} for k,w in source['contestantAvailabilityById'].items() if k!='1')
t=source['transportSettings']
assert (t['arrivalTargetGroupSize'],t['arrivalMaximumGroupSize'],t['arrivalMinGapMinutes'])==(3,3,30)
assert (t['departureTargetGroupSize'],t['departureMaximumGroupSize'],t['departureMinGapMinutes'])==(1,6,20)
assert t['arrivalTemplateId']!=t['departureTemplateId']
assert input_['transportSettings']==t
for key in source:
 if key!='tasks':assert source[key]==input_[key],key
for before,after in zip(source['tasks'],input_['tasks']):assert before=={k:v for k,v in after.items() if k!='jointGroupId'}
chain=input_['technicalChains'][0];group=input_['dailyJointGroups'][0]
assert list(map(len,chain['phases']))==[3,2,2]
assert chain==intended['technicalChains']['policies'][0]
assert group==intended['jointGroups']['groups'][0]
transport_ids={t['id'] for r in ['transport_arrival','transport_departure'] for t in roles[r]}
assert not transport_ids&set(chain['orderedTaskIds'])
unit=set(chain['orderedTaskIds'])|set(group['taskIds']);assert len(unit)==8
assert set(s['productTaskIds'])==unit
assert b['supportingTaskIds'] and set(b['supportingTaskIds'])<={f'task:{t}' for t in transport_ids}
assert set(b['supportingTaskIds']).isdisjoint({f'task:{t}' for t in unit})
assert a['status']=='SUPPORTED' and len(a['problem']['tasks'])==84 and len(a['problem']['participantMeals'])==19
producer=b.get('collectiveCoreProjection',b)
assert len(producer['problem']['tasks'])==84
assert len(producer['problem'].get('participantMeals',[]))+len(producer.get('analyticalParticipantMeals',[]))==19
assert len(producer['problem']['transportPolicy']['arrival']['taskIds'])==19
assert len(producer['problem']['transportPolicy']['departure']['taskIds'])==19
rej=read(native,'authoring-rejections');assert rej['disabled']
assert rej['rejects'][0]['body']['message']=='TECHNICAL_CHAIN_AUTHORITY_CONFLICT'
assert all(r['status']==422 for r in rej['rejects'])
assert [r['error']['message'] for r in read(native,'sql-readonly-rejections')]==['UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION','UNSUPPORTED_JOINT_COMBINATION']
assert not read(native,'sql-sources')['runs']
assert not any(s['ordinal']>0 for s in read(native,'sql-sources')['stages'])
assert run['evidence']['work']['branchBudgetLimit']==source['plannerNext']['searchBudget']['maxBranchExpansions']==10000
assert run['evidence']['work']['branchesExplored']<=10000
if summary['status']=='NO_COMPLETE_WITNESS':
 assert not run.get('proposal')
 assert 'ASSISTED_SCOPE_INCOMPLETE' in run['evidence']['reasonCodes']
else:
 assert summary['status']=='MEMORY_COMPLETE_WITNESS'
 assert read(probe,'validation')['hardValid']
 assert summary['witnessTasks']==84 and summary['witnessMeals']==19
result={'status':'PASS','outcome':summary['status'],'authenticUIObligations':103,'adaptedTasks':84,'adaptedMeals':19,'transportMembersInChain':0,'scope':s['productTaskIds'],'supporting':b['supportingTaskIds'],'branches':run['evidence']['work'],'acceptedStages':0,'physicalInfeasibilityProven':False,'remoteWrites':0}
out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
