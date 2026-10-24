import assert from 'node:assert/strict';
import test from 'node:test';
import {createSupportedEngineInputAdapterFixture} from './engineInputAdapter.fixture';
import {adaptEngineInputToPlannerNextProblem} from './engineInputAdapter';
import {resolveConcreteTaskResourceRequirements,resolveEffectiveTaskResourceAssignments} from './effectiveTaskResourceAssignments';
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from '../assistedPlanning';
import {canPlaceTask} from '../placement';
import {validatePlan} from '../validate';
import {evaluateResourcePresence} from '../resourcePresence';
import {materializeItinerantUnitAssignment} from '../itinerantUnitAssignment';

function fixture(){
  const s=createSupportedEngineInputAdapterFixture();
  const {mainFlow:_,...configuration}=s.plannerNext!;
  s.plannerNext={...configuration,profile:'STANDALONE_ONLY'};
  s.tasks=[{id:101,planId:701,templateId:1,status:'pending',plannerNextKind:'auxiliary',spaceId:301,contestantId:201,durationOverrideMin:20,resourceRequirements:{byItem:{603:1}}},
    {id:102,planId:701,templateId:2,status:'pending',plannerNextKind:'auxiliary',spaceId:302,contestantId:202,durationOverrideMin:20,resourceRequirements:{byItem:{603:1}}},
    {id:103,planId:701,templateId:3,status:'pending',plannerNextKind:'auxiliary',spaceId:303,contestantId:201,durationOverrideMin:20,dependsOnTaskIds:[101],resourceRequirements:{byItem:{603:1}}}];
  s.locks=[];s.coachResourceIds=[];s.vocalCoachPlanResourceItemIdByContestantId={};s.spaceResourceAssignments={};s.zoneResourceAssignments={};
  return s;
}
function problem(s=fixture()) {const a=adaptEngineInputToPlannerNextProblem(s);assert.equal(a.status,'SUPPORTED',JSON.stringify(a.issues));if(a.status!=='SUPPORTED')throw Error('unsupported');return a.problem;}
const run=(p:ReturnType<typeof problem>)=>executeAssistedPlanning(buildAssistedProblem(p,createPlanningScope({kind:'DAY',value:'concrete resources'},{},p.tasks.map(t=>t.id)),[]));

test('byItem alone reserves the daily identity in search, transitions, presence and validation',()=>{
  const s=fixture(),before=structuredClone(s),p=problem(s),a=run(p),b=run(p);
  assert.deepEqual(s,before);assert.equal(a.evidence.completeForScope,true);assert.deepEqual(a.proposal,b.proposal);assert.equal(a.evidence.fingerprint,b.evidence.fingerprint);assert.deepEqual(a.evidence.work,b.evidence.work);
  assert.ok(p.tasks.every(t=>JSON.stringify(t.requiredResourceIds)==='["plan-resource:503"]'));
  const rows=[...a.proposal!].sort((a,b)=>a.start-b.start);
  assert.ok(rows.every(t=>t.start>=570&&t.end<=990));
  assert.ok(rows.slice(1).every((t,i)=>t.start>=rows[i].end+15));
  assert.equal(validatePlan(p,rows).hardValid,true);
  assert.equal(canPlaceTask(p,p.tasks[1],rows[0].start,[rows[0]]),false);
  assert.equal(evaluateResourcePresence(p.resources.find(r=>r.id==='plan-resource:503')!,rows).productiveTaskMinutes,60);
  const forged=rows.map((t,i)=>i===1?{...t,start:rows[0].start,end:rows[0].start+t.duration}:t);
  assert.equal(validatePlan(p,forged).hardValid,false);
});
for(const [name,mutate,reason] of [
  ['absent item',(s:ReturnType<typeof fixture>)=>{s.planResourceItems=s.planResourceItems.filter(r=>r.resourceItemId!==603);},'MISSING_DAILY_RESOURCE'],
  ['daily mapping missing',(s:ReturnType<typeof fixture>)=>{s.planResourceItems.find(r=>r.id===503)!.resourceItemId=999;},'MISSING_DAILY_RESOURCE'],
  ['ambiguous mapping',(s:ReturnType<typeof fixture>)=>{s.planResourceItems.push({...s.planResourceItems.find(r=>r.id===503)!,id:999});},'AMBIGUOUS_DAILY_RESOURCE'],
  ['quantity two',(s:ReturnType<typeof fixture>)=>{s.tasks[0].resourceRequirements={byItem:{603:2}};},'UNREPRESENTABLE_QUANTITY'],
] as const)test(`${name} blocks without choosing an arbitrary resource`,()=>{
  const s=fixture();mutate(s);assert.equal(resolveConcreteTaskResourceRequirements(s,s.tasks[0]).issues[0].reason,reason);
  const a=adaptEngineInputToPlannerNextProblem(s);assert.equal(a.status,'UNSUPPORTED');assert.ok(a.reasonCodes.includes('UNSUPPORTED_RESOURCE_REQUIREMENT'));
});
test('unavailable resource cannot disappear from required availability',()=>{const s=fixture();s.planResourceItems.find(r=>r.id===503)!.isAvailable=false;const a=adaptEngineInputToPlannerNextProblem(s);assert.equal(a.status,'UNSUPPORTED');assert.ok(a.reasonCodes.includes('MISSING_RESOURCE_AVAILABILITY'));});
test('auxiliary attention and zone-sharing capacity is not replaced with universal exclusivity',()=>{const s=fixture();s.planResourceItems.find(r=>r.id===503)!.typeCode='auxiliar';const a=adaptEngineInputToPlannerNextProblem(s);assert.equal(a.status,'UNSUPPORTED');assert.ok(a.issues.some(i=>i.details?.reason==='UNREPRESENTABLE_AUXILIARY_CAPACITY'));});
test('direct, declared, location and byItem references consume once',()=>{const s=fixture();Object.assign(s.tasks[0],{assignedResourceIds:[503],declaredResourceIds:[503]});s.spaceResourceAssignments={301:[503]};s.zoneResourceAssignments={401:[503]};const a=resolveEffectiveTaskResourceAssignments(s).assignments[0];assert.deepEqual(a.directResourceIds,[503]);assert.deepEqual(a.effectiveResourceIds,[503]);assert.deepEqual(problem(s).tasks[0].requiredResourceIds,['plan-resource:503']);});
test('names, types and inventory order never substitute a fixed identity',()=>{const s=fixture();s.planResourceItems=s.planResourceItems.reverse().map(r=>({...r,name:'same display name',typeId:13}));assert.deepEqual(problem(s).tasks.map(t=>t.requiredResourceIds),problem().tasks.map(t=>t.requiredResourceIds));});
test('protected Stage occupation constrains the remaining scope and preserves literal placement',()=>{
  const p=problem(),first=run(p).proposal!.find(t=>t.id==='task:101')!;
  const pending=p.tasks.filter(t=>t.id!==first.id).map(t=>t.id);
  const a=executeAssistedPlanning(buildAssistedProblem(p,createPlanningScope({kind:'TASK_IDS',value:'continuation'},{},pending),[first]));
  assert.equal(a.evidence.completeForScope,true);assert.ok(a.proposal!.every(t=>t.start>=first.end+15));assert.equal(validatePlan(p,[first,...a.proposal!]).hardValid,true);
});
test('a time lock outside the concrete resource availability has no hard-valid completion',()=>{
  const s=fixture();s.locks=[{id:1,planId:701,taskId:101,lockType:'time',lockedStart:'08:00',lockedEnd:'08:20'}];const p=problem(s);assert.equal(run(p).evidence.completeForScope,false);
});
for(const requirement of [{byType:{13:1}}])test('generic selection remains explicitly unsupported',()=>{const s=fixture();s.tasks[0].resourceRequirements=requirement;const a=adaptEngineInputToPlannerNextProblem(s);assert.equal(a.status,'UNSUPPORTED');assert.ok(a.reasonCodes.includes('UNSUPPORTED_RESOURCE_REQUIREMENT'));});
for(const inheritance of ['OPERATION_ONLY','LOCATION'] as const)test(`${inheritance} keeps byItem even when it is a member of an unchosen itinerant alternative`,()=>{
  const s=fixture();s.tasks[0].resourceInheritance=inheritance;const p=problem(s),task={...p.tasks[0],allowedItinerantUnitIds:['u1','u2']};
  const selected=materializeItinerantUnitAssignment({itinerantUnits:[{id:'u1',availability:[p.day],resourceIds:['plan-resource:503']},{id:'u2',availability:[p.day],resourceIds:['plan-resource:504']}]},task,'u2');
  assert.deepEqual(selected!.requiredResourceIds,['plan-resource:503','plan-resource:504']);
});
