import assert from "node:assert/strict";
import test from "node:test";
import type { EngineInput } from "../engine/types";
import { applyNewDayPlannerConfiguration } from "./newDayPlannerConfiguration";
import { normalizeTaskTemplateCatalogEntry, projectTaskTemplateSnapshotRow, taskTemplateSnapshotToPersistenceRow } from "./taskTemplateSnapshot";
import { projectEffectiveAuthoritiesFromEngineInputV1 } from "./effectivePlanConfigRevision";
import { plannerReadiness } from "./plannerReadiness";
import { newDayPlannerConfigurationSchema, templateRulesWithPlannerOperationSchema } from "../shared/newDayPlannerConfiguration";

const template=(id:number,kind?:"main"|"vocal",dependencies:number[]=[])=>normalizeTaskTemplateCatalogEntry({id,name:id===7?"IN":"Una actividad",defaultDuration:10,defaultCameras:0,requiresCoach:kind!=null,
  dependsOnTemplateIds:dependencies,rulesJson:kind?{plannerNextOperation:{contractVersion:1,kind}}:null},"inherited");
const profile={contractVersion:1,sourceRevision:1,configuration:{contractVersion:1,scenario:"MAIN_WITH_VOCAL_FEEDER",transport:"NONE",setup:"NONE",meals:"DAY_CONFIGURATION",
  searchPolicy:"EXACT_CONSTRUCTIVE",searchBudget:{bestK:2,maxBacktracks:20,maxPatterns:10,maxBranchExpansions:1000},timeGridMinutes:5,resourceTransitionMinutes:0,
  mainFlow:{spaceId:31,preferredEnd:"12:00",continuity:"REQUIRED",maxBlocksByKey:1,minTasksPerBlock:1}}};
const input=()=>({planId:12,workDay:{start:"09:00",end:"18:00"},meal:{start:"13:00",end:"14:00"},mealMode:"global_hard_break",
  defaultParticipantTransitionMinutes:5,tasks:[{id:101,planId:12,templateId:7,contestantId:44,status:"pending",spaceId:30,durationOverrideMin:10},
    {id:102,planId:12,templateId:8,contestantId:44,status:"pending",spaceId:31,durationOverrideMin:10}],
  vocalCoachPlanResourceItemIdByContestantId:{44:90,45:90},planResourceItems:[],locks:[],groupingZoneIds:[],zoneResourceAssignments:{},spaceResourceAssignments:{},zoneResourceTypeRequirements:{},spaceResourceTypeRequirements:{},resourceItemComponents:{}} as unknown as EngineInput);

test("historical input and fingerprints retain their exact shape without opt-in",()=>{
  const original=input();assert.equal(applyNewDayPlannerConfiguration(original,null,[]),original);
  assert.equal(applyNewDayPlannerConfiguration(original,{...profile,configuration:null},[]),original);
  const historical=template(7);assert.equal("plannerNextOperation" in historical,false);
});
test("roles and prerequisites come from the frozen templates, never names or current catalog",()=>{
  const original=input(),prior=structuredClone(original);
  const result=applyNewDayPlannerConfiguration(original,profile,[template(7,"vocal"),template(8,"main",[7])]);
  assert.equal(result.tasks[0].plannerNextKind,"vocal");assert.deepEqual(result.tasks[1].dependsOnTaskIds,[101]);
  assert.deepEqual(original,prior);assert.equal(result.transportSettings,undefined);assert.equal(result.mealTaskTemplateId,null);
  assert.equal(result.tasks.length,2);assert.equal(result.plannerNextMaterializationIssues?.length,0);
  assert.equal(applyNewDayPlannerConfiguration(original,profile,[template(7),template(8)]).tasks[0].plannerNextKind,undefined);
});
test("task additions rematerialize dependencies and change effective configuration identity",()=>{
  const templates=[template(7,"vocal"),template(8,"main",[7])];
  const a=applyNewDayPlannerConfiguration(input(),profile,templates);
  const added=input();added.tasks.push({...added.tasks[0],id:103,contestantId:45},{...added.tasks[1],id:104,contestantId:45});
  const b=applyNewDayPlannerConfiguration(added,profile,templates);
  assert.deepEqual(b.tasks.find(task=>task.id===104)?.dependsOnTaskIds,[103]);
  assert.notDeepEqual(projectEffectiveAuthoritiesFromEngineInputV1(a).plan_workday?.semanticValue,projectEffectiveAuthoritiesFromEngineInputV1(b).plan_workday?.semanticValue);
});
test("a missing prerequisite is blocking instead of silently erased",()=>{
  const source=input();source.tasks=source.tasks.slice(1);
  const result=applyNewDayPlannerConfiguration(source,profile,[template(7,"vocal"),template(8,"main",[7])]);
  assert.ok(result.plannerNextMaterializationIssues?.some(issue=>issue.code==="MISSING_DEPENDENCY_REFERENCE"));
  const readiness=plannerReadiness(result,{status:"READY",issues:[]});assert.notEqual(readiness.status,"READY");
  assert.ok(readiness.issues.some(issue=>issue.capabilityId==="MISSING_DEPENDENCY_REFERENCE"));
});
test("invalid operational role declarations fail the product write contract",()=>{
  assert.equal(templateRulesWithPlannerOperationSchema.safeParse({unrelated:[1,null]}).success,true);
  assert.equal(templateRulesWithPlannerOperationSchema.safeParse({plannerNextOperation:{contractVersion:1,kind:"guess-by-name"}}).success,false);
});
test("a persisted template round trip preserves prerequisites and role identity",()=>{
  const original=template(8,"main",[7]);
  const reloaded=projectTaskTemplateSnapshotRow({id:55,...taskTemplateSnapshotToPersistenceRow(12,original)});
  assert.deepEqual(reloaded.dependencyTemplateIds,[7]);assert.deepEqual(reloaded.plannerNextOperation,original.plannerNextOperation);
  assert.equal(reloaded.sourceFingerprint,original.sourceFingerprint);
});

const standaloneProfile=()=>{const {mainFlow:_,...common}=profile.configuration;return {...profile,configuration:{...common,scenario:"STANDALONE_ONLY"}};};
test("standalone snapshots omit mainFlow and never manufacture participants, tasks or coaches",()=>{
  const source=input();source.vocalCoachPlanResourceItemIdByContestantId={};
  const templates=[template(7),template(8) ].map(t=>({...t,requiresCoach:false,plannerNextOperation:{contractVersion:1 as const,kind:"auxiliary" as const}}));
  const result=applyNewDayPlannerConfiguration(source,standaloneProfile(),templates);
  assert.equal(result.plannerNext?.profile,"STANDALONE_ONLY");assert.equal("mainFlow" in result.plannerNext!,false);
  assert.deepEqual(result.tasks.map(t=>t.id),source.tasks.map(t=>t.id));assert.equal(result.planResourceItems.length,0);
  assert.equal(result.plannerNextMaterializationIssues?.length,0);
  assert.ok(result.tasks.every(t=>t.plannerNextKind==="auxiliary"&&!t.declaredResourceIds?.length));
  assert.notDeepEqual(projectEffectiveAuthoritiesFromEngineInputV1(result),projectEffectiveAuthoritiesFromEngineInputV1(source));
});
test("standalone rejects contradictory roles and preserves declared dependency/resource requirements",()=>{
  const source=input();source.tasks=source.tasks.slice(1);
  const result=applyNewDayPlannerConfiguration(source,standaloneProfile(),[template(8,"main",[7])]);
  assert.ok(result.plannerNextMaterializationIssues?.some(issue=>issue.code==="MISSING_DEPENDENCY_REFERENCE"));
  assert.ok(result.plannerNextMaterializationIssues?.some(issue=>issue.code==="UNSUPPORTED_TASK_ROLE"));
  const coach=applyNewDayPlannerConfiguration(source,standaloneProfile(),[{...template(8),requiresCoach:true,plannerNextOperation:{contractVersion:1,kind:"auxiliary"}}]);
  assert.deepEqual(coach.tasks[0].declaredResourceIds,[90]);
});
test("structural profiles are strict and retain the main profile contract",()=>{
  const standalone=standaloneProfile().configuration;
  assert.ok(newDayPlannerConfigurationSchema.safeParse(standalone).success);
  assert.equal(newDayPlannerConfigurationSchema.safeParse({...standalone,mainFlow:profile.configuration.mainFlow}).success,false);
  assert.equal(newDayPlannerConfigurationSchema.safeParse({...standalone,searchPolicy:"COMPATIBILITY_PRESERVING"}).success,false);
  const {mainFlow:_,...missing}=profile.configuration;
  assert.equal(newDayPlannerConfigurationSchema.safeParse(missing).success,false);
});
