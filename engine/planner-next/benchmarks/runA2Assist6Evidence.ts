import assert from "node:assert/strict";
import type { PlannerNextProblem,ScheduledTask } from "../contracts";
import { buildAssistedProblem,createPlanningScope,executeAssistedPlanning } from "../assistedPlanning";
import { validatePlan } from "../validate";
import { buildAssistedPlanningSnapshotV1,fingerprintAssistedPlanningSnapshotV1,type AssistedPlanningSnapshotV1 } from "../../../server/assistedPlanningSnapshot";
import type { IStorage } from "../../../server/storage";
import { createCanonicalFullA2Template,expandCanonicalFullA2Template } from "./focal-a2/full-day/canonicalFullA2Template";
import { buildCanonicalA2PlannerNextProblem } from "./runPlannerNextA2Assist1Benchmark";
import { acceptedRequiredViolations } from "../../../server/assistedAcceptedBaseline";

const canonical=buildCanonicalA2PlannerNextProblem();
const problem=():PlannerNextProblem=>structuredClone(canonical.problem);
const productTaskId=new Map(canonical.problem.tasks.map((task,index)=>[task.id,index+1]));
const productSpaceId=new Map(canonical.problem.spaces.map((space,index)=>[space.id,index+1]));
const identity=[...canonical.problem.tasks.map((task,index)=>({namespace:"task",sourceId:String(index+1),canonicalId:task.id})),
  ...canonical.problem.spaces.map((space,index)=>({namespace:"space",sourceId:String(index+1),canonicalId:space.id})),
  ...canonical.problem.resources.map((resource,index)=>({namespace:"resource",sourceId:String(index+1),canonicalId:resource.id}))];
const conflictA=canonical.problem.tasks.find(task=>task.id==="C01.in")!;
const conflictB=canonical.problem.tasks.find(task=>task.id==="C02.in")!;
const scopeTask=canonical.problem.tasks.find(task=>task.id==="C02.ensayo_estudio_7")!;
// A2 has no reproducibly violable REQUIRED authority in this bounded workflow.
// Keep that independent contract exercise explicit instead of weakening A2.
const requiredIntegrationProblem=():PlannerNextProblem=>({day:canonical.problem.day,spaces:canonical.problem.spaces,resources:canonical.problem.resources,
  participants:canonical.problem.participants,coaches:canonical.problem.coaches,tasks:[conflictA,conflictB].map(task=>({...task,dependencies:[]})),
  mainFlow:canonical.problem.mainFlow,participantTransitionMinutes:0,resourceTransitionMinutes:0,budget:canonical.problem.budget,auxiliaryPolicy:canonical.problem.auxiliaryPolicy,searchPolicy:"EXACT_CONSTRUCTIVE"});
const time=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,"0")}:${String(minute%60).padStart(2,"0")}`;
const snapshot=(bStart:number)=>buildAssistedPlanningSnapshotV1(canonical.problem.tasks.map(task=>({id:productTaskId.get(task.id)!,
  startPlanned:task.id===conflictA.id?time(600):task.id===conflictB.id?time(bStart):null,
  endPlanned:task.id===conflictA.id?time(600+task.duration):task.id===conflictB.id?time(bStart+task.duration):null,
  spaceId:productSpaceId.get(task.spaceId)!})));

export async function runA2Assist6Evidence(){
  const sourceObligationCount=expandCanonicalFullA2Template(createCanonicalFullA2Template()).tasks
    .filter(task=>task.participantId).length;
  assert.equal(sourceObligationCount,canonical.expansion.tasks.filter(task=>task.participantId).length);
  process.env.SUPABASE_URL??="http://localhost";process.env.SUPABASE_SERVICE_ROLE_KEY??="test-service-role-key";process.env.SUPABASE_ANON_KEY??="test-anon-key";
  const [{AssistedPlanningError,AssistedPlanningService},{createManualDeltaValidationHarness,projectPlannerViolations}]=await Promise.all([import("../../../server/assistedPlanningService"),import("../../../server/assistedProposalService")]);
  const planId=6,userId="00000000-0000-0000-0000-000000000006",configId=31;let validation:any=null,dailyWrites=0,nextStage=3;
  const s1=snapshot(610);let stages:any[]=[{id:1,sessionId:7,planId,parentStageId:null,ordinal:1,snapshotJson:s1,snapshotFingerprint:fingerprintAssistedPlanningSnapshotV1(s1),validationSummaryJson:{}}];
  let session:any={id:7,planId,status:"ACTIVE",activeStageId:1,draftBaseStageId:1,currentConfigRevisionId:configId,draftScopeJson:{},draftSnapshotJson:s1,draftFingerprint:fingerprintAssistedPlanningSnapshotV1(s1),draftValidationId:null};let exceptions:any[]=[];
  const reads:Record<string,any>={getActiveAssistedPlanningSession:async()=>session,getAssistedPlanningStage:async(id:number)=>stages.find(s=>s.id===id),listAssistedPlanningStages:async()=>stages,getPlanningStageValidation:async()=>validation,listPlanningAcceptedExceptions:async(id:number)=>exceptions.filter(e=>e.stageId===id),getTasksForPlan:async()=>canonical.problem.tasks.map((_,index)=>({id:index+1,status:"pending"})),getPlanOptimizerSnapshot:async()=>({}),getPlanTaskTemplateSnapshots:async()=>[],getPlanConfigRevision:async()=>({planId,fingerprint:"c".repeat(64)})};
  const storage=new Proxy({}, {get:(_t,p:string)=>reads[p]??(async()=>{throw new Error(`unexpected storage ${p}`)})}) as IStorage;
  const rpc=async(name:string,p:any)=>{if(name==="assisted_patch_draft"){session={...session,draftSnapshotJson:p.p_snapshot,draftFingerprint:p.p_fingerprint,draftScopeJson:{editKind:"MANUAL",manualTouchedTaskIds:[3]},draftValidationId:null};return {error:null};}
    if(name==="assisted_record_stage_validation"){validation={id:9,planId,sessionId:7,baseStageId:p.p_expected_base,draftFingerprint:p.p_expected_fingerprint,configRevisionId:configId,hardCount:p.p_report.hardCount,requiredCount:p.p_report.requiredCount,reportJson:p.p_report};session={...session,draftValidationId:9};return {error:null};}
    if(name==="assisted_accept_stage"){if(validation.reportJson.newHardCount>0&&p.p_confirmation!=="HARD_EXCEPTIONS")return {error:{message:"HARD_CONFIRMATION_REQUIRED"}};dailyWrites++;const stage={id:nextStage++,sessionId:7,planId,parentStageId:session.draftBaseStageId,ordinal:stages.length+1,snapshotJson:session.draftSnapshotJson,snapshotFingerprint:session.draftFingerprint,validationSummaryJson:{report:validation.reportJson}};stages.push(stage);for(const item of validation.reportJson.violations.filter((v:any)=>v.severity==="HARD"&&v.inheritedAcceptedExceptionId==null))exceptions.push({id:20+exceptions.length,planId,stageId:stage.id,status:"ACTIVE",violationKey:item.violationKey,affectedTaskIdsJson:item.affectedTaskIds,detailsJson:item.details});session={...session,activeStageId:stage.id,draftBaseStageId:stage.id,draftScopeJson:{},draftValidationId:null};return {error:null};}throw new Error(name);};
  const service=new AssistedPlanningService(storage,rpc as any,{buildInput:async()=>({} as any),buildConfigRevision:()=>({configurationFingerprint:"c".repeat(64)} as any),validateManual:createManualDeltaValidationHarness(problem(),identity)});
  await service.patchDraft(planId,session.draftFingerprint,1,[{taskId:productTaskId.get(conflictB.id)!,startPlanned:time(600),endPlanned:time(600+conflictB.duration)}]);const beforeAccept=dailyWrites;await service.validateDraft(planId,session.draftFingerprint,1);
  const hardValidation=validation;assert.equal(hardValidation.hardCount>=1,true);assert.equal(hardValidation.reportJson.hardValid,false);await assert.rejects(()=>service.accept(planId,userId,session.draftFingerprint,1),(e:any)=>e instanceof AssistedPlanningError&&e.code==="HARD_CONFIRMATION_REQUIRED");assert.equal(dailyWrites,beforeAccept);
  await service.accept(planId,userId,session.draftFingerprint,1,"HARD_EXCEPTIONS");assert.equal(exceptions.length>=1,true);const s2=stages.at(-1)!;
  const p=problem(),byId=new Map(p.tasks.map(t=>[t.id,t]));const protectedRows=(s2.snapshotJson as AssistedPlanningSnapshotV1).tasks.flatMap(row=>row.startPlanned?[{...byId.get(identity.find(i=>i.namespace==="task"&&Number(i.sourceId)===row.taskId)!.canonicalId)!,start:Number(row.startPlanned.slice(0,2))*60+Number(row.startPlanned.slice(3)),end:Number(row.endPlanned!.slice(0,2))*60+Number(row.endPlanned!.slice(3))} as ScheduledTask]:[]);
  const assisted=buildAssistedProblem(p,createPlanningScope({kind:"TASK_IDS",value:scopeTask.id},{},[scopeTask.id]),protectedRows);const proposal=executeAssistedPlanning(assisted,{violations:validatePlan(assisted.originalValidationProblem,protectedRows).violations??[]});const projected=projectPlannerViolations(proposal.evidence.violations??[],identity);const inherited=projected.filter(v=>exceptions.some(e=>e.violationKey===v.violationKey));
  assert.ok(proposal.proposal,JSON.stringify(proposal.evidence));assert.ok(inherited.length>=1);const activeBeforeDraft=exceptions.filter(e=>e.status==="ACTIVE").length;
  const proposalById=new Map(proposal.proposal.map(row=>[Number(identity.find(i=>i.canonicalId===row.id)?.sourceId),row]));const s3Snapshot=buildAssistedPlanningSnapshotV1((s2.snapshotJson as AssistedPlanningSnapshotV1).tasks.map(row=>{const next=proposalById.get(row.taskId);return next?{id:row.taskId,...row,startPlanned:`${String(Math.floor(next.start/60)).padStart(2,"0")}:${String(next.start%60).padStart(2,"0")}`,endPlanned:`${String(Math.floor(next.end/60)).padStart(2,"0")}:${String(next.end%60).padStart(2,"0")}`}:{id:row.taskId,...row};}));session={...session,draftSnapshotJson:s3Snapshot,draftFingerprint:fingerprintAssistedPlanningSnapshotV1(s3Snapshot)};validation={id:10,planId,sessionId:7,baseStageId:s2.id,draftFingerprint:session.draftFingerprint,configRevisionId:configId,hardCount:inherited.length,requiredCount:0,reportJson:{contractVersion:1,hardCount:inherited.length,requiredCount:0,preferredCount:0,newHardCount:0,newRequiredCount:0,violations:inherited.map(v=>({...v,inheritedAcceptedExceptionId:exceptions.find(e=>e.violationKey===v.violationKey)?.id}))}};const followupValidation=validation;session={...session,draftValidationId:10};await service.accept(planId,userId,session.draftFingerprint,s2.id);const s3=stages.at(-1)!;assert.equal(exceptions.length,activeBeforeDraft);assert.ok((await service.state(planId)).acceptedExceptions.length>=1);
  const temporary=snapshot(605);session={...session,draftSnapshotJson:temporary,draftFingerprint:fingerprintAssistedPlanningSnapshotV1(temporary),draftScopeJson:{editKind:"MANUAL",manualTouchedTaskIds:[productTaskId.get(conflictB.id)!]}};await service.validateDraft(planId,session.draftFingerprint,s3.id);const reconfirmationValidation=validation;assert.ok(reconfirmationValidation.reportJson.newHardCount>=1);await assert.rejects(()=>service.accept(planId,userId,session.draftFingerprint,s3.id),(e:any)=>e instanceof AssistedPlanningError&&e.code==="HARD_CONFIRMATION_REQUIRED");assert.equal(exceptions.filter(e=>e.status==="ACTIVE").length,activeBeforeDraft);
  session={...session,draftSnapshotJson:s3.snapshotJson,draftFingerprint:s3.snapshotFingerprint,draftValidationId:null};assert.equal(exceptions.filter(e=>e.status==="ACTIVE").length,activeBeforeDraft);
  const requiredProblem=requiredIntegrationProblem();requiredProblem.tasks=requiredProblem.tasks.map(task=>({...task,requiredResourceIds:[...new Set([...(task.requiredResourceIds??[]),"cam-2"])]}));
  requiredProblem.resources=requiredProblem.resources.map(resource=>resource.id==="cam-2"?{...resource,presenceConcentrationPolicy:"REQUIRED"}:resource);
  const requiredPlacements=requiredProblem.tasks.map((task,index)=>({...task,start:600+index*100,end:600+index*100+task.duration} as ScheduledTask));
  const requiredSummary=validatePlan(requiredProblem,requiredPlacements);const requiredViolations=projectPlannerViolations(requiredSummary.violations??[],identity).filter(item=>item.severity==="REQUIRED");
  assert.equal((requiredSummary.violations??[]).some(item=>item.severity==="HARD"),false);assert.ok(requiredViolations.length>=1);
  const requiredSnapshot=buildAssistedPlanningSnapshotV1(requiredPlacements.map(task=>({id:productTaskId.get(task.id)!,startPlanned:time(task.start),endPlanned:time(task.end),spaceId:productSpaceId.get(task.spaceId)!})));
  const requiredStage={id:99,parentStageId:null,snapshotJson:requiredSnapshot,validationSummaryJson:{report:{violations:requiredViolations}}};
  const inheritedRequired=acceptedRequiredViolations([requiredStage],requiredSnapshot);
  const movedRequired=buildAssistedPlanningSnapshotV1(requiredSnapshot.tasks.map(task=>task.taskId===productTaskId.get(conflictB.id)?{id:task.taskId,...task,startPlanned:time(710),endPlanned:time(710+conflictB.duration)}:{id:task.taskId,...task}));
  assert.equal(acceptedRequiredViolations([requiredStage],movedRequired).length,0);
  return {benchmark:"A2-ASSIST-6",sourceObligationCount,validationMode:hardValidation.reportJson.mode,hardCount:hardValidation.hardCount,requiredCount:requiredViolations.length,requiredEvidenceSource:"SEPARATE_INTEGRATION_FIXTURE",productWritesBeforeAccept:beforeAccept,dailyTasksWritesAtAccept:dailyWrites,acceptedExceptionCount:exceptions.length,proposalExists:Boolean(proposal.proposal),acceptedFollowupStageId:s3.id,inheritedAcceptedHardViolationCount:inherited.length,newHardViolationCount:followupValidation.reportJson.newHardCount,inheritedAcceptedRequiredViolationCount:inheritedRequired.length,newRequiredViolationCount:requiredViolations.length-inheritedRequired.length,exceptionSurvivesValidateReset:exceptions.filter(e=>e.status==="ACTIVE").length===activeBeforeDraft,affectedTaskReconfirmationDemonstrated:reconfirmationValidation.reportJson.newHardCount>=1};
}
if(import.meta.url===`file://${process.argv[1]}`)runA2Assist6Evidence().then(e=>process.stdout.write(`${JSON.stringify(e,null,2)}\n`));
