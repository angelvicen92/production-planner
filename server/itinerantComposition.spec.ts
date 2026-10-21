import assert from 'node:assert/strict';
import test from 'node:test';
import { applyDailyItinerantComposition } from './itinerantComposition';
import { itinerantCompositionInput } from '../shared/itinerantComposition';
import { createSupportedEngineInputAdapterFixture } from '../engine/planner-next/integration/engineInputAdapter.fixture';
import { adaptEngineInputToPlannerNextProblem } from '../engine/planner-next/integration/engineInputAdapter';
import { materializeItinerantUnitAssignment } from '../engine/planner-next/itinerantUnitAssignment';
import { canPlaceTask } from '../engine/planner-next/placement';
import { validatePlan } from '../engine/planner-next/validate';

function fixture() {
  const input = createSupportedEngineInputAdapterFixture();
  input.planResourceItems.push(...[601,602,603].map((id,index)=>({id,resourceItemId:801+index,typeId:20,name:['CAM_A','CAM_B','SON_1'][index],isAvailable:true,availabilityStart:null,availabilityEnd:null})));
  input.planSpaceSettings!.push({spaceId:304,zoneId:403,availabilityStart:null,availabilityEnd:null});
  const base = input.tasks[0];
  input.tasks = [
    {...base,id:301,plannerNextKind:'technical',contestantId:null,spaceId:303,zoneId:403,itinerantTeamRequirement:'any',itinerantTeamId:null,allowedItinerantTeamIds:[71,72],assignedResourceIds:[],declaredResourceIds:[],dependsOnTaskIds:[]},
    {...base,id:302,plannerNextKind:'technical',contestantId:null,spaceId:304,zoneId:403,itinerantTeamRequirement:'any',itinerantTeamId:null,allowedItinerantTeamIds:[71,72,73],assignedResourceIds:[],declaredResourceIds:[],dependsOnTaskIds:[]},
  ];
  input.spaceResourceAssignments={};input.zoneResourceAssignments={};input.locks=[];
  const units = [
    {id:91,source_team_id:71,members:[{resourceItemId:801,planResourceItemId:601}]},
    {id:92,source_team_id:72,members:[{resourceItemId:802,planResourceItemId:602}]},
    {id:93,source_team_id:73,members:[{resourceItemId:801,planResourceItemId:601},{resourceItemId:803,planResourceItemId:603}]},
  ].map(unit=>({...unit,plan_id:input.planId,source_revision:0,code:`unit-${unit.id}`,name:`Unit ${unit.id}`,availability_windows:null,transition_minutes:0}));
  return {input,units};
}
function adapted() {
  const {input,units}=fixture();
  const effective=applyDailyItinerantComposition(input,units,input.planId);
  const result=adaptEngineInputToPlannerNextProblem(effective);
  assert.equal(result.status,'SUPPORTED',result.status==='UNSUPPORTED'?JSON.stringify(result.issues):'');
  if(result.status!=='SUPPORTED')throw Error('unsupported');
  return {problem:result.problem,effective,result};
}
test('explicit global→daily and physical FK mappings reject coincidence, duplicates, missing and cross-day identities',()=>{
  for(const mutate of [
    (f:ReturnType<typeof fixture>)=>{f.units.pop();},
    (f:ReturnType<typeof fixture>)=>{f.units[0].members[0].planResourceItemId=801;},
    (f:ReturnType<typeof fixture>)=>{f.units[0].plan_id++;},
    (f:ReturnType<typeof fixture>)=>{f.units[1].source_team_id=71;},
    (f:ReturnType<typeof fixture>)=>{f.input.planResourceItems.push({...f.input.planResourceItems.find(r=>r.id===601)!,id:604});},
  ]) {const f=fixture();mutate(f);assert.throws(()=>applyDailyItinerantComposition(f.input,f.units,f.input.planId),/Configuración/);}
  const f=fixture();const before=structuredClone(f);const effective=applyDailyItinerantComposition(f.input,f.units,f.input.planId);
  assert.deepEqual(f,before);assert.deepEqual(effective.tasks[0].allowedItinerantTeamIds,[91,92]);
  assert.equal(effective.itinerantTeamAvailability![0].itinerantTeamId,91);
});
test('generic A+B allowed; A+C conflicts by CAM_A; forbidden C rejected; selected members counted once',()=>{
  const {problem}=adapted();
  const first=materializeItinerantUnitAssignment(problem,problem.tasks[0],'itinerant-team:91')!;
  const b=materializeItinerantUnitAssignment(problem,problem.tasks[1],'itinerant-team:92')!;
  const c=materializeItinerantUnitAssignment(problem,problem.tasks[1],'itinerant-team:93')!;
  const start=600;const scheduled={...first,start,end:start+first.duration};
  assert.equal(canPlaceTask(problem,b,start,[scheduled]),true);
  assert.equal(canPlaceTask(problem,c,start,[scheduled]),false);
  assert.equal(materializeItinerantUnitAssignment(problem,problem.tasks[0],'itinerant-team:93'),null);
  assert.deepEqual(first.requiredResourceIds,['plan-resource:601']);
  assert.deepEqual(c.requiredResourceIds,['plan-resource:601','plan-resource:603']);
  const validation=validatePlan({...problem,tasks:[first,c]},[scheduled,{...c,start,end:start+c.duration}]);
  assert.equal(validation.hardValid,false);
  assert.equal(problem.resources.some(r=>r.id.startsWith('itinerant-team:')),false);
});
test('independent physical requirements survive selection of another unit',()=>{
  const f=fixture();f.input.tasks[0].assignedResourceIds=[601];
  const result=adaptEngineInputToPlannerNextProblem(applyDailyItinerantComposition(f.input,f.units,f.input.planId));
  assert.equal(result.status,'SUPPORTED');if(result.status!=='SUPPORTED')return;
  const selected=materializeItinerantUnitAssignment(result.problem,result.problem.tasks[0],'itinerant-team:92')!;
  assert.deepEqual(selected.requiredResourceIds,['plan-resource:601','plan-resource:602']);
});
test('a catalog byItem physical requirement maps independently and survives choosing another unit',()=>{
  const f=fixture();f.input.tasks[0].resourceRequirements={byItem:{801:1}};
  const effective=applyDailyItinerantComposition(f.input,f.units,f.input.planId);
  assert.deepEqual(effective.tasks[0].declaredResourceIds,[601]);
  const result=adaptEngineInputToPlannerNextProblem(effective);assert.equal(result.status,'SUPPORTED');if(result.status!=='SUPPORTED')return;
  assert.deepEqual(materializeItinerantUnitAssignment(result.problem,result.problem.tasks[0],'itinerant-team:92')!.requiredResourceIds,['plan-resource:601','plan-resource:602']);
  f.input.tasks[0].resourceRequirements={byItem:{99999:1}};
  assert.throws(()=>applyDailyItinerantComposition(f.input,f.units,f.input.planId),/requisito físico independiente/);
});
test('unit windows are explicit intersections; null adds no restriction; 0 transition remains explicit',()=>{
  const f=fixture();f.units[0].availability_windows=[{start:'10:00',end:'11:00'}] as any;
  const effective=applyDailyItinerantComposition(f.input,f.units,f.input.planId);
  assert.deepEqual(effective.itinerantTeamAvailability![0].windows,[{start:'10:00',end:'11:00'}]);
  assert.deepEqual(effective.itinerantTeamAvailability![1].windows,[f.input.workDay]);
  assert.equal(effective.itinerantTeamAvailability![0].transitionMinutes,0);
  const result=adaptEngineInputToPlannerNextProblem(effective);assert.equal(result.status,'SUPPORTED');if(result.status!=='SUPPORTED')return;
  const selected=materializeItinerantUnitAssignment(result.problem,result.problem.tasks[0],'itinerant-team:91')!;
  assert.equal(canPlaceTask(result.problem,selected,540,[]),false);
  assert.equal(canPlaceTask(result.problem,selected,600,[]),true);
});
test('catalog rejects empty, duplicate, invalid and untyped compositions',()=>{
  const valid={code:'A',name:'Equipo A',resourceItemIds:[801],availabilityWindows:null,transitionMinutes:0,isActive:true};
  assert.equal(itinerantCompositionInput.safeParse(valid).success,true);
  for(const patch of [{resourceItemIds:[]},{resourceItemIds:[801,801]},{resourceItemIds:['801']},{transitionMinutes:-1},{availabilityWindows:[{start:'21:00',end:'09:00'}]}])
    assert.equal(itinerantCompositionInput.safeParse({...valid,...patch}).success,false);
});

test('physical member windows, explicit unit meals and transitions remain separate authorities',()=>{
  const f=fixture();f.input.planResourceItems.find(r=>r.id===601)!.availabilityStart='11:00';f.input.planResourceItems.find(r=>r.id===601)!.availabilityEnd='18:00';
  const result=adaptEngineInputToPlannerNextProblem(applyDailyItinerantComposition(f.input,f.units,f.input.planId));
  assert.equal(result.status,'SUPPORTED');if(result.status!=='SUPPORTED')return;
  const a=materializeItinerantUnitAssignment(result.problem,result.problem.tasks[0],'itinerant-team:91')!;
  assert.equal(canPlaceTask(result.problem,a,600,[]),false);
  assert.equal(canPlaceTask(result.problem,a,660,[]),true);
  const mealProblem={...result.problem,itinerantUnitMeals:[{id:'explicit-unit-meal',itinerantUnitId:a.itinerantUnitId!,interval:{start:660,end:690}}]};
  assert.equal(canPlaceTask(mealProblem,a,660,[]),false);
  const transitionProblem=structuredClone(result.problem);
  transitionProblem.itinerantUnits!.find(unit=>unit.id===a.itinerantUnitId)!.transitionMinutes=20;
  const next={...a,id:'next',spaceId:result.problem.tasks[1].spaceId};
  const placed={...a,start:660,end:660+a.duration};
  assert.equal(canPlaceTask(transitionProblem,next,placed.end,[placed]),false);
  assert.equal(canPlaceTask(transitionProblem,next,placed.end+20,[placed]),true);
});

test('catalog and daily row order do not change the adapted composition or its fingerprint',()=>{
  const f=fixture();const before=structuredClone(f);
  const first=adaptEngineInputToPlannerNextProblem(applyDailyItinerantComposition(f.input,f.units,f.input.planId));
  f.units.reverse();f.units.forEach(unit=>unit.members.reverse());f.input.planResourceItems.reverse();f.input.tasks.reverse();
  const second=adaptEngineInputToPlannerNextProblem(applyDailyItinerantComposition(f.input,f.units,f.input.planId));
  assert.equal(first.status,'SUPPORTED');assert.equal(second.status,'SUPPORTED');
  assert.equal(first.problemFingerprint,second.problemFingerprint);
  assert.deepEqual(applyDailyItinerantComposition(before.input,before.units,before.input.planId).itinerantCompositionSnapshot!.units.map(unit=>unit.id),[91,92,93]);
});
