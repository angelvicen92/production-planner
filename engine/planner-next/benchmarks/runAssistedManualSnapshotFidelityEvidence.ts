/** Causal read-only replay of a captured canonical S10; never connects to Supabase. */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import fixture from '../../../server/fixtures/assistedA2S10.json';
import {buildCanonicalA2AssistedStage1Fixture} from './canonicalA2AssistedStage1Fixture';
import {buildAssistedProblem,createPlanningScope} from '../assistedPlanning';
import {validatePlan} from '../validate';
import {validateTransportGrouping} from '../transportGrouping';
import type {AssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
process.env.SUPABASE_URL??='http://localhost';process.env.SUPABASE_ANON_KEY??='evidence';process.env.SUPABASE_SERVICE_ROLE_KEY??='evidence';
const {validateManualAssistedDelta,materializeAssistedSnapshotOccupations}=await import('../../../server/assistedProposalService');
export function runAssistedManualSnapshotFidelityEvidence(){
 const {input,adapter}=buildCanonicalA2AssistedStage1Fixture();
 const base=fixture.snapshot as AssistedPlanningSnapshotV1;
 const moved={...base,tasks:base.tasks.map(t=>t.taskId===10048?{...t,startPlanned:'19:00',endPlanned:'19:05'}:t)};
 const {setupPreparations:_setup,roundPreparations:_round,...truncated}=moved;
 const replay=(s:AssistedPlanningSnapshotV1)=>validateManualAssistedDelta(input,s,[10048])!;
 // Literal old call path: fixed productive tasks, no auxiliary context, and no
 // auxiliary arguments to validatePlan. Search itself never supplies those arguments.
 const legacy=(s:AssistedPlanningSnapshotV1)=>{
  const context=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,s);
  const scope=createPlanningScope({kind:'TASK_IDS',value:'10048'},{validationMode:'MANUAL_DELTA_CLEAN_V1'},['task:10048']);
  const assisted=buildAssistedProblem(adapter.problem,scope,context.protectedPlacements);
  return validatePlan(assisted.originalValidationProblem,context.protectedPlacements);
 };
 const context=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,base);
 const isolated=(omit:string)=>validatePlan(adapter.problem,context.protectedPlacements,omit==='setup'?[]:context.protectedSetupPreparations,[],omit==='participantMeals'?[]:context.protectedParticipantMeals,[],[],omit==='round'?[]:context.protectedRoundPreparations,omit==='operationalMeals'?[]:context.protectedOperationalMeals);
 const A=replay(base),B=replay(moved),C=replay(truncated);
 assert.deepEqual(A.reasonCodes,[]);assert.deepEqual(B.validationSummary.unstructuredReasonCodes,['TRANSPORT_GROUPING_VIOLATION']);
 const groups=(s:AssistedPlanningSnapshotV1)=>{const c=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,s);return validateTransportGrouping(adapter.problem,c.protectedPlacements,c.protectedParticipantMeals);};
 return {baseCommit:'138900801c27fad3bd53e75ce83e86f884fda53c',provenance:fixture.provenance,remoteReads:0,remoteWrites:0,
  stageFingerprint:fingerprintAssistedPlanningSnapshotV1(base),shape:{tasks:266,operationalMeals:8,roundPreparations:17,setupPreparations:1},
  before:{stage:legacy(base),truncatedDraft:legacy(truncated)},after:{A:{validation:A.validationSummary,productViolations:A.structuredViolations},B:{validation:B.validationSummary,productViolations:B.structuredViolations},C:{validation:C.validationSummary,productViolations:C.structuredViolations}},
  isolatedOmissions:Object.fromEntries(['setup','round','operationalMeals','participantMeals'].map(k=>[k,isolated(k)])),
  transport:{policy:adapter.problem.transportPolicy?.departure,baseline:groups(base),moved:groups(moved),diagnosis:'Moving 10048 splits the 18:55 departure group and creates a 19:00 group only 5 minutes later; minimum gap is 20 minutes. Aggregate transport identity remains unsupported.'},
  decision:'STOP_TRANSPORT_IDENTITY_SUBPROBLEM_KEEP_FAIL_CLOSED',automaticBaseline:'22d728894bd73c9cddc7acb5dbd1f518d60f36f910ec2895b3035f07be95d679'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=runAssistedManualSnapshotFidelityEvidence();const path=process.argv[2];assert.ok(path,'Provide evidence output file');writeFileSync(path,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({path,baseline:report.after.A.validation.reasonCodes,moved:report.after.B.validation.reasonCodes,stop:report.decision}));
}
