import assert from 'node:assert/strict';
import test from 'node:test';
import {buildA2ImportRows} from './a2ImportRows';
import {a2HistoricalCatalog} from './a2HistoricalCatalog';
import {a2ImportStorageFixture} from './a2ImportStorageFixture';
import {buildEngineInput} from '../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {canPlaceTask, exactTaskStartDomain} from '../../engine/planner-next/placement';
import {validatePlan} from '../../engine/planner-next/validate';
import {materializeItinerantUnitAssignment} from '../../engine/planner-next/itinerantUnitAssignment';
import {effectivePlanningResourceIds} from '../../client/src/lib/planning-view-policy';
import {projectTaskOperationScopes, usesItinerantAgenda} from '../../shared/taskOperationScope';
import {projectEffectiveAuthoritiesFromEngineInputV1} from '../../server/effectivePlanConfigRevision';
import {planPlannerNextConfigurationSchema} from '../../server/planPlannerNextConfiguration';
const fixture=()=>buildA2ImportRows('2026-10-31',100000,{historicalCatalog:a2HistoricalCatalog,planId:27002});
const adapt=(input:ReturnType<typeof fixture>['input'])=>{const a=adaptEngineInputToPlannerNextProblem(input);assert.equal(a.status,'SUPPORTED',JSON.stringify(a.issues));if(a.status!=='SUPPORTED')throw Error('unsupported');return a.problem;};

test('A2 effective configuration crosses real builder and revision; all 266 obligations and physical occupancy remain',async()=>{
 const d=fixture(),rebuilt=await buildEngineInput(d.input.planId,a2ImportStorageFixture(d).storage);
 assert.deepEqual(adapt(rebuilt),adapt(d.input));assert.equal(rebuilt.tasks.length,266);
 const anchors=new Set(d.input.anchoredAccompaniments!.map(op=>op.anchorTaskId));
 const view=projectTaskOperationScopes(d.input.tasks.map(t=>({...t,id:t.id})),d.configuration.taskOperations);
 for(const task of view){if(anchors.has(task.id))assert.equal(usesItinerantAgenda(task),false);
  if(task.templateName==='ALFOMBRA_ROJA_EVA')assert.equal(usesItinerantAgenda(task),false);}
 assert.equal(view.filter(usesItinerantAgenda).length,13);
 for(const op of d.input.anchoredAccompaniments!){assert.ok(op.beforeTaskIds.every(id=>rebuilt.tasks.find(t=>t.id===id)?.blocksSpace===false));assert.ok(op.afterTaskIds.every(id=>rebuilt.tasks.find(t=>t.id===id)?.blocksSpace===false));}
 const old=structuredClone(rebuilt);delete old.tasks[0].agendaScope;
 rebuilt.tasks[0].agendaScope='ITINERANT_UNIT';
 assert.notDeepEqual(projectEffectiveAuthoritiesFromEngineInputV1(old),projectEffectiveAuthoritiesFromEngineInputV1(rebuilt));
 const invalid=structuredClone(d.configuration);invalid.taskOperations[0].resourceInheritance='GUESS';
 assert.equal(planPlannerNextConfigurationSchema.safeParse(invalid).success,false);
});

test('Reality Corner occupies real Corner without CAM1; ordinary Corner retains CAM1; locks and explicit extra resources survive team choice',()=>{
 const d=fixture(),i=d.input,source=i.tasks.find(t=>t.templateName==='REALITY_INFLUENCER')!;
 const cam1=i.planResourceItems.find(r=>r.name==='cam-1')!.id;
 const p=adapt(i),raw=p.tasks.find(t=>t.id===`task:${source.id}`)!;
 const mobile=materializeItinerantUnitAssignment(p,raw,raw.allowedItinerantUnitIds![1])!;
 assert.equal(mobile.spaceId,'space:31');assert.notEqual(mobile.blocksSpace,false);
 assert.ok(!mobile.requiredResourceIds?.includes(`plan-resource:${cam1}`));
 const ordinary=p.tasks.find(t=>t.id===`task:${i.tasks.find(t=>t.templateName==='CORNER_INFLUENCER')!.id}`)!;
 assert.ok(ordinary.requiredResourceIds?.includes(`plan-resource:${cam1}`));
 const other={...ordinary,id:'other',participantId:'participant:100219',dependencies:[]};
 const busy={...mobile,dependencies:[],start:790,end:820};
 assert.equal(canPlaceTask(p,other,790,[busy]),false);
 assert.ok(![...exactTaskStartDomain(p,other,[busy]).starts()].includes(790));
 assert.equal(validatePlan(p,[busy,{...other,start:790,end:800}]).overlapViolationCount,1);
 const unitMember=i.itinerantTeamAvailability![0].planResourceItemIds![0];
 source.assignedResourceIds=[cam1,unitMember];source.declaredResourceIds=[cam1,unitMember];
 i.locks=[{id:1,planId:i.planId,taskId:source.id,lockType:'resource',lockedResourceId:cam1}];
 const q=adapt(i),explicit=q.tasks.find(t=>t.id===raw.id)!;
 for(const unit of explicit.allowedItinerantUnitIds!){const selected=materializeItinerantUnitAssignment(q,explicit,unit)!;
  assert.ok(selected.requiredResourceIds!.includes(`plan-resource:${cam1}`));assert.ok(selected.requiredResourceIds!.includes(`plan-resource:${unitMember}`));
  const selectedResources=selected.requiredResourceIds!.map(id=>Number(id.split(':').at(-1)));
  const ui=effectivePlanningResourceIds({...source,assignedResources:selectedResources},new Map(i.planSpaceSettings!.map(s=>[s.spaceId,{zoneId:s.zoneId}])),i.spaceResourceAssignments,i.zoneResourceAssignments);
  assert.deepEqual(ui,selectedResources.sort((a,b)=>a-b));
 }
});

test('Reality Hall C retains EVA and member resources, while only location inheritance changes',()=>{
 const d=fixture(),source=d.input.tasks.find(t=>t.templateName==='REALITY_HALL'&&t.itinerantTeamId!=null)!;
 const eva=d.input.planResourceItems.find(r=>r.name==='eva')!.id;
 const p=adapt(d.input),actual=p.tasks.find(t=>t.id===`task:${source.id}`)!;
 assert.ok(actual.requiredResourceIds!.includes(`plan-resource:${eva}`));assert.equal(source.resourceInheritance,'OPERATION_ONLY');
 const changed=structuredClone(d.input);changed.tasks.find(t=>t.id===source.id)!.resourceInheritance='LOCATION';
 assert.equal(adapt(changed).tasks.find(t=>t.id===actual.id)!.spaceId,actual.spaceId);
});


test('accepted unit composition is never reclassified as an authored resource declaration on SQL reload',()=>{
 const d=fixture(),source=d.input.tasks.find(t=>t.itinerantTeamRequirement==='any')!;
 assert.deepEqual(source.declaredResourceIds,[]);
 const p=adapt(d.input),task=p.tasks.find(t=>t.id===`task:${source.id}`)!;
 const selected=materializeItinerantUnitAssignment(p,task,task.allowedItinerantUnitIds![1])!;
 source.assignedResourceIds=selected.requiredResourceIds!.map(id=>Number(id.split(':').at(-1)));
 const q=adapt(d.input),reloaded=q.tasks.find(t=>t.id===task.id)!;
 assert.deepEqual(reloaded.nonSubstitutableResourceIds,task.nonSubstitutableResourceIds);
 for(const unitId of task.allowedItinerantUnitIds!){
  assert.deepEqual(materializeItinerantUnitAssignment(q,reloaded,unitId),materializeItinerantUnitAssignment(p,task,unitId));
 }
});
