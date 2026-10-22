import assert from "node:assert/strict";
import test from "node:test";
import { createSupportedEngineInputAdapterFixture } from "./engineInputAdapter.fixture";
import { adaptEngineInputToPlannerNextProblem } from "./engineInputAdapter";
import { plannerReadiness } from "../../../server/plannerReadiness";
import { resolveAssistedScope } from "../../../server/assistedScopeResolver";

function fixture(){
  const source=createSupportedEngineInputAdapterFixture();
  const {mainFlow:_,...configuration}=source.plannerNext!;
  source.plannerNext={...configuration,profile:"STANDALONE_ONLY"};
  source.locks=[];source.coachResourceIds=[];source.vocalCoachPlanResourceItemIdByContestantId={};
  source.tasks=[{id:101,planId:701,templateId:1,status:"pending",spaceId:301,contestantId:201,plannerNextKind:"auxiliary",durationOverrideMin:10,dependsOnTaskIds:[]},
    {id:102,planId:701,templateId:2,status:"pending",spaceId:302,contestantId:201,plannerNextKind:"auxiliary",durationOverrideMin:10,dependsOnTaskIds:[101]}];
  return source;
}
test("productive adapter, readiness, scope and fingerprint distinguish an intentional absent main",()=>{
  const source=fixture(),before=structuredClone(source),a=adaptEngineInputToPlannerNextProblem(source);
  assert.equal(a.status,"SUPPORTED",JSON.stringify(a.issues));
  if(a.status!=="SUPPORTED")return;
  assert.equal("mainFlow" in a.problem,false);assert.equal(a.problem.coaches.length,0);
  assert.equal(plannerReadiness(source,{status:"READY",issues:[]}).status,"READY");
  const scoped=resolveAssistedScope(source,a,{kind:"TASK_IDS",taskIds:[101,102]});
  assert.ok(scoped);assert.deepEqual(source,before);
  const legacy=structuredClone(source);delete legacy.plannerNext!.profile;
  const absent=adaptEngineInputToPlannerNextProblem(legacy);
  assert.equal(absent.status,"UNSUPPORTED");
  assert.ok(absent.reasonCodes.includes("MISSING_MAIN_FLOW_CONFIGURATION"));
  assert.notEqual(absent.sourceFingerprint,a.sourceFingerprint);
});
test("references, dependency cycles, incompatible role and missing resources block before search",()=>{
  const cases=([
    ["DEPENDENCY_CYCLE",(source:ReturnType<typeof fixture>)=>{source.tasks[0].dependsOnTaskIds=[102];}],
    ["MISSING_DEPENDENCY_REFERENCE",(source:ReturnType<typeof fixture>)=>{source.tasks[1].dependsOnTaskIds=[999];}],
    ["UNSUPPORTED_TASK_ROLE",(source:ReturnType<typeof fixture>)=>{source.tasks[0].plannerNextKind="vocal";}],
    ["MISSING_RESOURCE_REFERENCE",(source:ReturnType<typeof fixture>)=>{source.tasks[0].declaredResourceIds=[999];}],
  ] as const);
  for(const [code,mutate] of cases){const source=fixture();mutate(source);const result=adaptEngineInputToPlannerNextProblem(source);
    assert.equal(result.status,"UNSUPPORTED");assert.ok(result.reasonCodes.includes(code),JSON.stringify(result.issues));
    assert.notEqual(plannerReadiness(source,{status:"READY",issues:[]}).status,"READY");}
});
