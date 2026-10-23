/** Offline diagnosis. This never mutates product inputs, status, persistence or solver. */
import {execFileSync} from "node:child_process";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import type {EngineInput} from "../../engine/types";
import {adaptEngineInputToPlannerNextProblem} from "../../engine/planner-next/integration/engineInputAdapter";
import {resolveFlexibleParticipantMealTasks} from "../../engine/planner-next/integration/flexibleParticipantMealTasks";
import {buildAssistedProblem,createPlanningScope,executeAssistedPlanning} from "../../engine/planner-next/assistedPlanning";
import {preflight,validatePlan} from "../../engine/planner-next/validate";

export function verifyU00gNativeGate(root="docs/evidence/p0-u00g"){
 const read=(name:string)=>JSON.parse(readFileSync(`${root}/${name}.json`,"utf8"));
 const summary=read("native/diagnostic-summary"),manifest=read("intervention"),integration=read("native/integration");
 assert.equal(integration.status,"PASS");assert.equal(summary.status,"BLOCKED_VALIDATION_BEFORE_STAGE");
 assert.equal(summary.applyStatus,200);assert.equal(summary.validation.status,422);assert.equal(summary.validation.body.code,"RUN_RESULT_INVALID");
 const original=read("native/original-input"),restored=read("native/restored-native-input"),prior=read("native/builder-before-profile");
 assert.equal(prior.mealTaskTemplateId,3);assert.equal(original.mealTaskTemplateId,null);
 assert.deepEqual(restored,{...original,mealTaskTemplateId:prior.mealTaskTemplateId});
 const run=read("native/meal-only-run").assisted_result_json;
 assert.equal(run.outcome,"PROPOSAL");assert.deepEqual(run.proposal,[]);
 const scheduled=run.evidence.selectedMealWitnesses.participant.scheduled;assert.equal(scheduled.length,2);
 assert.deepEqual(run.proposedDraftSnapshot.tasks.filter((t:any)=>t.startPlanned).map((t:any)=>t.taskId),[3,6]);
 const predicates=read("native/sql-validation-predicates")[0];assert.equal(predicates.proposal_array_length,0);
 for(const key of ["result_fingerprint_matches","snapshot_matches","draft_fingerprint_matches","run_scope_matches","draft_scope_matches","prerequisites_match"])assert.equal(predicates[key],true,key);
 assert.match(predicates.function_source,/OR jsonb_array_length\(result->'proposal'\)=0/);
 assert.deepEqual(read("native/rows-before-apply"),read("native/rows-after-validation"));
 const applied=read("native/meal-only-draft"),after=read("native/meal-only-validation");
 assert.deepEqual(applied.draft,after.draft);assert.deepEqual(applied.activeStage,after.activeStage);assert.equal(after.activeStage.ordinal,0);
 assert.equal(manifest.base,"4571cb993ae221832630f3ac1c60a72318f83f8c");assert.equal(manifest.solverChanged,false);
 for(const [file,hash] of Object.entries(manifest.solverHashes))assert.equal(createHash("sha256").update(execFileSync("git",["show",`${manifest.base}:${file}`])).digest("hex"),hash,file);
 assert.equal(integration.sourceHashes["engine/buildInput.ts"],manifest.intervenedBuilderSha256);
 return {status:"DIAGNOSTIC_BLOCKED_BEFORE_STAGE",validationStatus:422,reasonCode:"RUN_RESULT_INVALID",sqlPredicate:"jsonb_array_length(result->'proposal')=0",
  identityOnlyCounterfactual:true,solverUnchanged:true,scopeTaskIds:run.scopeTaskIds,scheduledParticipantMeals:scheduled,previousAppliedDraftIntact:true,S0Intact:true,dailyTasksIntact:true,remoteWrites:0};
}

export function analyseU00gMealGate(directory="docs/evidence/p0-u00g/causal"){
 const read=(name:string)=>JSON.parse(readFileSync(`${directory}/${name}.json`,"utf8"));
 const original=read("original-input") as EngineInput,before=structuredClone(original);
 const authorities=read("authorities"),mealId=Number(authorities.templateIds.meal);
 assert.equal(original.mealTaskTemplateId,null);
 assert.equal(resolveFlexibleParticipantMealTasks(original).obligations.length,0);
 const rejected=adaptEngineInputToPlannerNextProblem(original);assert.equal(rejected.status,"UNSUPPORTED");
 assert.ok(rejected.reasonCodes.includes("UNSUPPORTED_BREAK_SCOPE"));
 assert.ok(rejected.reasonCodes.includes("MISSING_SPACE_REFERENCE"));
 const counterfactual=structuredClone(original);counterfactual.mealTaskTemplateId=mealId;
 const adapter=adaptEngineInputToPlannerNextProblem(counterfactual);assert.equal(adapter.status,"SUPPORTED");
 if(adapter.status!=="SUPPORTED")throw Error("Counterfactual unsupported");
 const p=adapter.problem,sourceIds=[...p.tasks.map(t=>t.id),...(p.participantMeals??[]).map(m=>m.sourceTaskId)];
 const scope=createPlanningScope({kind:"DAY",value:"u00g-causal"},{},sourceIds);
 const solve=()=>executeAssistedPlanning(buildAssistedProblem(p,scope,[]));
 const result=solve(),repeat=solve();
 assert.ok(result.evidence.selectedMealWitnesses?.participant);
 const meals=result.evidence.selectedMealWitnesses.participant.scheduled;
 assert.equal(result.evidence.completeForScope,true);assert.equal(result.evidence.hardValid,true);assert.equal(result.evidence.requiredValid,true);
 assert.equal(result.proposal?.length,4);assert.equal(meals.length,2);
 assert.equal(validatePlan(p,[...result.proposal!],[],[],[...meals]).hardValid,true);
 assert.deepEqual(result.proposal,repeat.proposal);assert.deepEqual(result.evidence.selectedMealWitnesses,repeat.evidence.selectedMealWitnesses);
 assert.equal(result.evidence.fingerprint,repeat.evidence.fingerprint);assert.deepEqual(result.evidence.work,repeat.evidence.work);
 assert.deepEqual(original,before);
 // A valid full witness supplies accepted geometry for an offline continuation
 // probe. It is never injected into native Draft/Stage or the subsequent search.
 const protectedPlacements=result.proposal!.filter(t=>!t.dependencies.length);
 const pending=result.proposal!.filter(t=>t.dependencies.length);
 const continuation=buildAssistedProblem(p,createPlanningScope({kind:"DAY",value:"pending-u00g"},{},pending.map(t=>t.id)),
   protectedPlacements,new Set(),[],[],meals);
 const continuationBefore=structuredClone(continuation),continuationResult=executeAssistedPlanning(continuation);
 const reasons=preflight(continuation.problem);
 assert.deepEqual(reasons,[]);
 assert.ok(continuation.problem.participantMeals!.every(m=>m.status==="pending"&&m.protectedInterval&&!m.fixedInterval));
 assert.equal(continuationResult.evidence.completeForScope,true);assert.equal(continuationResult.evidence.hardValid,true);
 assert.ok(continuationResult.evidence.selectedMealWitnesses?.participant);
 assert.deepEqual(continuationResult.evidence.selectedMealWitnesses.participant.scheduled,meals);
 assert.deepEqual(continuation,continuationBefore);
 return {status:"ENGINE_GATE_PASS",firstCause:{component:"applyNewDayPlannerConfiguration",discardedMealTemplateId:mealId,
   originalReasons:rejected.reasonCodes,originalMealCount:0,identityOnlyCounterfactual:true},
   counterfactual:{taskCount:p.tasks.length,mealCount:p.participantMeals!.length,completeForScope:true,hardValid:true,requiredValid:true,
     meals,fingerprint:result.evidence.fingerprint,work:result.evidence.work,futureFeasibility:result.evidence.participantMealFutureFeasibility,deterministic:true},
   protectedContinuation:{evidenceLevel:"OFFLINE_PROJECTION_OF_VALID_FULL_WITNESS; NOT_AN_ACCEPTED_NATIVE_STAGE",component:"buildAssistedProblem → preflight",
     reasons,mealAuthorities:continuation.problem.participantMeals,branches:continuationResult.evidence.work.branchesExplored,proposal:continuationResult.proposal,
     existingFullWitnessHardValid:true,inputIntact:true},
   remoteWrites:0};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const report=analyseU00gMealGate(process.argv[2]);
 if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
}
