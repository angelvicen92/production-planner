/** Causal read-only replay of a captured canonical S10; never connects to Supabase. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import fixture from '../../../server/fixtures/assistedA2S10.json';
import {adaptEngineInputToPlannerNextProblem} from '../integration/engineInputAdapter';
import type {EngineInput} from '../../types';
import {buildAssistedProblem,createPlanningScope} from '../assistedPlanning';
import {validatePlan} from '../validate';
import {validateTransportGrouping} from '../transportGrouping';
import type {AssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
import {fingerprintAssistedPlanningSnapshotV1} from '../../../server/assistedPlanningSnapshot';
process.env.SUPABASE_URL??='http://localhost';process.env.SUPABASE_ANON_KEY??='evidence';process.env.SUPABASE_SERVICE_ROLE_KEY??='evidence';
const {validateManualAssistedDelta,materializeAssistedSnapshotOccupations}=await import('../../../server/assistedProposalService');
export function runAssistedManualSnapshotFidelityEvidence(){
 // A historical snapshot must use its historical authorities, just as the
 // corresponding server regression does; current topology is a different day.
 const input=JSON.parse(gunzipSync(readFileSync(new URL('../../../script/demo/fixtures/a2-legacy-import.json.gz',import.meta.url))).toString()).dataset.input as EngineInput;
 const adapter=adaptEngineInputToPlannerNextProblem(input);assert.equal(adapter.status,'SUPPORTED');
 if(adapter.status!=='SUPPORTED')throw Error('Historical A2 must remain representable');
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
 assert.deepEqual(A.reasonCodes,[]);assert.deepEqual(B.validationSummary.unstructuredReasonCodes,[]);
 const groups=(s:AssistedPlanningSnapshotV1)=>{const c=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,s);return validateTransportGrouping(adapter.problem,c.protectedPlacements,c.protectedParticipantMeals);};
 return {baseCommit:'138900801c27fad3bd53e75ce83e86f884fda53c',provenance:fixture.provenance,remoteReads:0,remoteWrites:0,
  stageFingerprint:fingerprintAssistedPlanningSnapshotV1(base),shape:{tasks:266,operationalMeals:8,roundPreparations:17,setupPreparations:1},
  before:{stage:legacy(base),truncatedDraft:legacy(truncated)},after:{A:{validation:A.validationSummary,productViolations:A.structuredViolations},B:{validation:B.validationSummary,productViolations:B.structuredViolations},C:{validation:C.validationSummary,productViolations:C.structuredViolations}},
  isolatedOmissions:Object.fromEntries(['setup','round','operationalMeals','participantMeals'].map(k=>[k,isolated(k)])),
  transport:{policy:adapter.problem.transportPolicy?.departure,baseline:groups(base),moved:groups(moved),diagnosis:'Moving 10048 splits the 18:55 departure group and creates a 19:00 group only 5 minutes later; minimum gap is 20 minutes. P9 preserves the count and emits exact group identities.'},
  decision:'TRANSPORT_IDENTITY_CERTIFIED_OTHER_FAMILIES_FAIL_CLOSED',automaticBaseline:'22d728894bd73c9cddc7acb5dbd1f518d60f36f910ec2895b3035f07be95d679'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=runAssistedManualSnapshotFidelityEvidence();const path=process.argv[2];assert.ok(path,'Provide evidence output file');writeFileSync(path,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({path,baseline:report.after.A.validation.reasonCodes,moved:report.after.B.validation.reasonCodes,stop:report.decision}));
}
