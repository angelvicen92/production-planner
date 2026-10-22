import assert from 'node:assert/strict';
import test from 'node:test';
import {applyNewDayPlannerConfiguration} from '../../../server/newDayPlannerConfiguration';
import {applyDailyItinerantComposition} from '../../../server/itinerantComposition';
import {normalizeTaskTemplateCatalogEntry} from '../../../server/taskTemplateSnapshot';
import {createSupportedEngineInputAdapterFixture} from './engineInputAdapter.fixture';
import {adaptEngineInputToPlannerNextProblem} from './engineInputAdapter';
import {createPlanningScope,buildAssistedProblem,executeAssistedPlanning} from '../assistedPlanning';
import {validatePlan} from '../validate';
import type {ScheduledTask} from '../contracts';

function fixture(standalone:boolean,kind:'auxiliary'|'technical'){
  const input=createSupportedEngineInputAdapterFixture();
  input.defaultParticipantTransitionMinutes=5;input.locks=[];
  input.spaceResourceAssignments={};input.zoneResourceAssignments={};
  input.tasks=input.tasks.map(t=>({...t,itinerantTeamRequirement:'none' as const,assignedResourceIds:[]}));
  const consumer=input.tasks.find(t=>t.id===105)!;
  Object.assign(consumer,{plannerNextKind:kind,contestantId:kind==='auxiliary'?201:null,itinerantTeamRequirement:'any',allowedItinerantTeamIds:[71,72],resourceRequirements:{byItem:{604:1}}});
  if(standalone)input.tasks=[consumer];
  const templates=input.tasks.map(t=>normalizeTaskTemplateCatalogEntry({id:t.templateId,name:`Explicit ${t.id}`,defaultDuration:30,defaultCameras:0,
    requiresCoach:t.plannerNextKind==='main'||t.plannerNextKind==='vocal',
    dependsOnTemplateIds:(t.dependsOnTaskIds??[]).map(id=>input.tasks.find(other=>other.id===id)!.templateId),
    rulesJson:{plannerNextOperation:{contractVersion:1,kind:t.plannerNextKind}}}));
  const profile={contractVersion:1,sourceRevision:1,configuration:{contractVersion:1,
    scenario:standalone?'STANDALONE_ONLY':'MAIN_WITH_VOCAL_FEEDER',transport:'NONE',setup:'NONE',meals:'DAY_CONFIGURATION',
    searchPolicy:'EXACT_CONSTRUCTIVE',searchBudget:{bestK:2,maxBacktracks:20,maxPatterns:10,maxBranchExpansions:1000},timeGridMinutes:5,resourceTransitionMinutes:5,
    ...(standalone?{}:{mainFlow:{...input.plannerNext!.mainFlow!}})}};
  const units=[{id:91,source_team_id:71,members:[{resourceItemId:602,planResourceItemId:502}]},
    {id:92,source_team_id:72,members:[{resourceItemId:603,planResourceItemId:503}]}].map(unit=>({...unit,plan_id:input.planId,source_revision:0,code:`u${unit.id}`,name:`Unit ${unit.id}`,availability_windows:null,transition_minutes:0}));
  return {input,profile,templates,units};
}
for(const standalone of [true,false])for(const kind of ['auxiliary','technical'] as const)test(`${standalone?'STANDALONE':'MAIN'} profile consumes ${kind} daily compositions through the same Assisted pipeline`,()=>{
  const f=fixture(standalone,kind),before=structuredClone(f.input);
  const configured=applyNewDayPlannerConfiguration(f.input,f.profile,f.templates);
  assert.deepEqual(configured.plannerNextMaterializationIssues,[]);
  const mapped=applyDailyItinerantComposition(configured,f.units,f.input.planId);
  assert.deepEqual(mapped.tasks.find(t=>t.id===105)!.allowedItinerantTeamIds,[91,92]);
  const adapter=adaptEngineInputToPlannerNextProblem(mapped);assert.equal(adapter.status,'SUPPORTED',JSON.stringify(adapter.issues));
  if(adapter.status!=='SUPPORTED')return;
  const scope=createPlanningScope({kind:'DAY',value:'new-day'},{},adapter.problem.tasks.map(t=>t.id));
  const execute=()=>executeAssistedPlanning(buildAssistedProblem(adapter.problem,scope,[]));
  const result=execute();assert.equal(result.evidence.completeForScope,true,result.evidence.reasonCodes.join(','));
  const placed=result.proposal!.find(t=>t.id==='task:105')!;
  assert.ok(['itinerant-team:91','itinerant-team:92'].includes(placed.itinerantUnitId!));
  assert.ok(placed.requiredResourceIds!.includes('plan-resource:504'),'independent resource remains required');
  assert.equal(validatePlan(adapter.problem,[...result.proposal!]).hardValid,true);
  if(kind==='technical')for(const patch of [
    {itinerantUnitId:'itinerant-team:999'}, {requiredResourceIds:['plan-resource:504']},
    {requiredResourceIds:placed.requiredResourceIds!.filter(id=>id!=='plan-resource:504')},
    {duration:placed.duration+5}, {dependencies:['invented']}, {participantId:'participant:201'},
  ])assert.equal(validatePlan(adapter.problem,result.proposal!.map(t=>t.id===placed.id?{...t,...patch}:t) as ScheduledTask[]).hardValid,false);
  assert.deepEqual(result.proposal,execute().proposal);assert.deepEqual(f.input,before);
});
test('specific technical members enter domains and a dependent chain before scheduling',()=>{
  const f=fixture(true,'technical');
  Object.assign(f.input.tasks[0],{itinerantTeamRequirement:'specific',itinerantTeamId:71,allowedItinerantTeamIds:[71]});
  f.input.tasks.push({...f.input.tasks[0],id:106,templateId:906,spaceId:302,zoneId:402,dependsOnTaskIds:[105]});
  f.templates.push(normalizeTaskTemplateCatalogEntry({id:906,name:'Successor',defaultDuration:30,defaultCameras:0,
    dependsOnTemplateIds:[f.input.tasks[0].templateId],rulesJson:{plannerNextOperation:{contractVersion:1,kind:'technical'}}}));
  const adapter=adaptEngineInputToPlannerNextProblem(applyDailyItinerantComposition(applyNewDayPlannerConfiguration(f.input,f.profile,f.templates),f.units,f.input.planId));
  assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')return;
  assert.ok(adapter.problem.tasks.every(t=>t.requiredResourceIds?.includes('plan-resource:502')));
  const result=executeAssistedPlanning(buildAssistedProblem(adapter.problem,createPlanningScope({kind:'DAY',value:'chain'},{},adapter.problem.tasks.map(t=>t.id)),[]));
  assert.equal(result.evidence.completeForScope,true,result.evidence.reasonCodes.join(','));
  assert.equal(validatePlan(adapter.problem,[...result.proposal!]).hardValid,true);
  assert.ok(result.proposal!.find(t=>t.id==='task:106')!.start>=result.proposal!.find(t=>t.id==='task:105')!.end+5);
});
test('inferred technical dependencies with alternatives use one itinerant agenda and materialize both choices',()=>{
  const f=fixture(true,'technical');
  f.input.tasks.push({...f.input.tasks[0],id:106,templateId:906,spaceId:302,zoneId:402,dependsOnTaskIds:[105]});
  f.templates.push(normalizeTaskTemplateCatalogEntry({id:906,name:'Pooled successor',defaultDuration:30,defaultCameras:0,
    dependsOnTemplateIds:[f.input.tasks[0].templateId],rulesJson:{plannerNextOperation:{contractVersion:1,kind:'technical'}}}));
  const adapter=adaptEngineInputToPlannerNextProblem(applyDailyItinerantComposition(applyNewDayPlannerConfiguration(f.input,f.profile,f.templates),f.units,f.input.planId));
  assert.equal(adapter.status,'SUPPORTED');if(adapter.status!=='SUPPORTED')return;
  const result=executeAssistedPlanning(buildAssistedProblem(adapter.problem,createPlanningScope({kind:'DAY',value:'pooled-chain'},{},adapter.problem.tasks.map(t=>t.id)),[]));
  assert.equal(result.evidence.completeForScope,true,result.evidence.reasonCodes.join(','));
  assert.ok(result.proposal!.every(t=>t.itinerantUnitId&&t.requiredResourceIds!.includes('plan-resource:504')));
  assert.equal(validatePlan(adapter.problem,[...result.proposal!]).hardValid,true);
});
test('allowing auxiliary consumption never suppresses invalid composition or missing resource diagnostics',()=>{
  const f=fixture(true,'technical');const configured=applyNewDayPlannerConfiguration(f.input,f.profile,f.templates);
  assert.throws(()=>applyDailyItinerantComposition(configured,f.units.slice(1),f.input.planId),/correspondencia/);
  assert.throws(()=>applyDailyItinerantComposition(configured,[f.units[0],f.units[0]],f.input.planId),/ambigua/);
  const mapped=applyDailyItinerantComposition(configured,f.units,f.input.planId);
  mapped.itinerantTeamAvailability=[];
  const adapter=adaptEngineInputToPlannerNextProblem(mapped);
  assert.equal(adapter.status,'UNSUPPORTED');assert.ok(adapter.reasonCodes.includes('MISSING_ITINERANT_UNIT_AVAILABILITY'));
});
test('main and vocal consumption remain outside the new-day profile compatibility boundary',()=>{
  for(const kind of ['main','vocal'] as const){
    const f=fixture(false,'technical');const task=f.input.tasks.find(t=>t.plannerNextKind===kind)!;
    Object.assign(task,{itinerantTeamRequirement:'any',allowedItinerantTeamIds:[71,72]});
    const configured=applyNewDayPlannerConfiguration(f.input,f.profile,f.templates);
    assert.ok(configured.plannerNextMaterializationIssues?.some(issue=>issue.taskId===task.id&&issue.code==='UNSUPPORTED_TASK_ROLE'));
  }
});
