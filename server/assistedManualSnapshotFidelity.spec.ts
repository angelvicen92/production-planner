import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import fixture from './fixtures/assistedA2S10.json';
import {buildCanonicalA2AssistedStage1Fixture} from '../engine/planner-next/benchmarks/canonicalA2AssistedStage1Fixture';
import {fingerprintAssistedPlanningSnapshotV1,type AssistedPlanningSnapshotV1} from './assistedPlanningSnapshot';
import type {IStorage} from './storage';
process.env.SUPABASE_URL??='http://localhost';
process.env.SUPABASE_ANON_KEY??='test';
process.env.SUPABASE_SERVICE_ROLE_KEY??='test';
const {AssistedPlanningService}=await import('./assistedPlanningService');
const {validateManualAssistedDelta,materializeAssistedSnapshotOccupations}=await import('./assistedProposalService');
const {validatePlan}=await import('../engine/planner-next/validate');
const {input,adapter}=buildCanonicalA2AssistedStage1Fixture();
const base=fixture.snapshot as AssistedPlanningSnapshotV1;
const moved={...base,tasks:base.tasks.map(row=>row.taskId===10048?{...row,startPlanned:'19:00',endPlanned:'19:05'}:row)};
const fp=fingerprintAssistedPlanningSnapshotV1;
const db=new PGlite();after(()=>db.close());
async function harness(){
 await db.exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
 DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; END IF; END $$;
 CREATE TABLE public.assisted_planning_sessions(id bigint,plan_id integer,status text,active_stage_id bigint,draft_base_stage_id bigint,current_config_revision_id bigint,draft_snapshot_json jsonb,draft_fingerprint text,draft_scope_json jsonb,draft_validation_id bigint,updated_at timestamptz);
 CREATE TABLE public.assisted_planning_stages(id bigint,session_id bigint,plan_id integer,snapshot_json jsonb,snapshot_fingerprint text);
 CREATE TABLE public.daily_tasks(id integer,plan_id integer,status text);
 CREATE TABLE public.planning_stage_validations(id bigserial,plan_id integer,session_id bigint,base_stage_id bigint,draft_fingerprint text,config_revision_id bigint,hard_count integer,required_count integer,preferred_count integer,report_json jsonb);`);
 await db.exec(readFileSync('supabase/migrations/081_assisted_draft_editing.sql','utf8'));
 await db.exec(readFileSync('supabase/migrations/090_assisted_manual_snapshot_fidelity.sql','utf8'));
 await db.query('INSERT INTO assisted_planning_sessions VALUES(7,$1,\'ACTIVE\',13,13,1,$2,$3,\'{}\',NULL,now())',[input.planId,JSON.stringify(base),fp(base)]);
 await db.query('INSERT INTO assisted_planning_stages VALUES(13,7,$1,$2,$3)',[input.planId,JSON.stringify(base),fp(base)]);
 await db.exec(`INSERT INTO daily_tasks SELECT (t->>'taskId')::integer,${input.planId},'pending' FROM assisted_planning_sessions,jsonb_array_elements(draft_snapshot_json->'tasks') t`);
 const session=async()=>{const row=(await db.query<any>('SELECT * FROM assisted_planning_sessions')).rows[0];return {id:7,planId:input.planId,status:'ACTIVE',activeStageId:13,draftBaseStageId:13,currentConfigRevisionId:1,draftSnapshotJson:row.draft_snapshot_json,draftFingerprint:row.draft_fingerprint,draftScopeJson:row.draft_scope_json,draftValidationId:row.draft_validation_id};};
 const stage={id:13,sessionId:7,planId:input.planId,ordinal:10,parentStageId:null,snapshotJson:base,snapshotFingerprint:fp(base)};
 const calls:string[]=[];
 const storage=new Proxy({}, {get(_t,key:string){const reads:Record<string,Function>={getActiveAssistedPlanningSession:session,getAssistedPlanningStage:async()=>stage,listAssistedPlanningStages:async()=>[stage],listPlanningAcceptedExceptions:async()=>[],getTasksForPlan:async()=>input.tasks.map(t=>({...t,templateId:t.templateId})),getPlanOptimizerSnapshot:async()=>({}),getPlanTaskTemplateSnapshots:async()=>[],getPlanConfigRevision:async()=>({planId:input.planId,fingerprint:'config'})};return reads[key]??(async()=>{throw Error(`Unexpected storage call ${key}`);});}}) as IStorage;
 const service=new AssistedPlanningService(storage,async(name,p)=>{calls.push(name);await db.query(`SELECT public.${name}(${Object.keys(p).map((key,i)=>`${key} => $${i+1}`).join(',')})`,Object.values(p).map(v=>typeof v==='object'?JSON.stringify(v):v));return {error:null};},{buildInput:async()=>input,buildConfigRevision:()=>({contractVersion:1,planId:input.planId,components:[],configurationFingerprint:'config'})});
 return {service,session,calls,stage};
}
const auxiliaries=(snapshot:AssistedPlanningSnapshotV1)=>({meals:snapshot.operationalMeals,setup:snapshot.setupPreparations,round:snapshot.roundPreparations});

test('A2 causal replay distinguishes complete S10, complete C04 Draft and truncated Draft',()=>{
 assert.equal(base.tasks.length,266);assert.equal(base.operationalMeals!.length,8);assert.equal(base.roundPreparations!.length,17);assert.equal(base.setupPreparations!.length,1);assert.equal(fp(base),fixture.fingerprint);
 const a=validateManualAssistedDelta(input,base,[10048])!;
 assert.deepEqual(a.validationSummary.reasonCodes,[]);assert.deepEqual(a.structuredViolations,[]);
 const mealId=input.tasks.find(t=>t.breakKind==='participant_meal')!.id;
 const mealReplay=validateManualAssistedDelta(input,base,[mealId])!;
 assert.equal(mealReplay.completeForScope,true);assert.deepEqual(mealReplay.validationSummary.reasonCodes,[]);
 const b=validateManualAssistedDelta(input,moved,[10048])!;
 assert.deepEqual(b.validationSummary.reasonCodes,['AVAILABILITY_VIOLATION','TRANSPORT_GROUPING_VIOLATION']);
 assert.deepEqual(b.validationSummary.unstructuredReasonCodes,['TRANSPORT_GROUPING_VIOLATION']);
 assert.deepEqual(b.structuredViolations.map(v=>[v.ruleCode,v.affectedTaskIds,v.affectedSpaceIds,v.details]),[['AVAILABILITY_VIOLATION',[10048],[3023],{dimensions:{start:1140,end:1145}}]]);
 const {roundPreparations:_round,setupPreparations:_setup,...truncated}=moved;
 const c=validateManualAssistedDelta(input,truncated,[10048])!;
 assert.deepEqual(c.validationSummary.unstructuredReasonCodes,['ROUND_PREPARATION_VIOLATION','SECONDARY_CONTINUITY_VIOLATION','SETUP_PREPARATION_VIOLATION','TRANSPORT_GROUPING_VIOLATION']);
 assert.deepEqual(input,buildCanonicalA2AssistedStage1Fixture().input,'validation leaves input immutable');
 const unknown={...base,tasks:base.tasks.map(t=>t.taskId===10048?{...t,taskId:999999}:t)};
 assert.equal(validateManualAssistedDelta(input,unknown,[10001]),null,'never silently drops a placed product identity');
});

test('isolated omissions causally explain all seven anonymous legacy families',()=>{
 const context=materializeAssistedSnapshotOccupations(adapter.problem,adapter.identityMap,base);
 const run=(omit:string)=>validatePlan(adapter.problem,context.protectedPlacements,omit==='setup'?[]:context.protectedSetupPreparations,[],omit==='participant'?[]:context.protectedParticipantMeals,[],[],omit==='round'?[]:context.protectedRoundPreparations,omit==='operational'?[]:context.protectedOperationalMeals).reasonCodes;
 assert.deepEqual(run('setup'),['SECONDARY_CONTINUITY_VIOLATION','SETUP_PREPARATION_VIOLATION']);
 assert.deepEqual(run('round'),['ROUND_PREPARATION_VIOLATION']);
 assert.deepEqual(run('participant'),['DEPENDENCY_VIOLATION','PARTICIPANT_MEAL_VIOLATION']);
 assert.deepEqual(run('operational'),['BLOCK_VIOLATION','OPERATIONAL_MEAL_VIOLATION','ROUND_PREPARATION_VIOLATION']);
});

test('task move, native Draft Undo/Redo and reset preserve all 18 preparations and exact fingerprints',async()=>{
 const {service,session}=await harness();
 const acceptedBefore=(await db.query('SELECT * FROM assisted_planning_stages')).rows;
 const dailyBefore=(await db.query('SELECT * FROM daily_tasks')).rows;
 await service.patchDraft(input.planId,fp(base),13,[{taskId:10048,startPlanned:'19:00',endPlanned:'19:05'}]);
 assert.deepEqual((await session()).draftSnapshotJson,moved);assert.deepEqual(auxiliaries((await session()).draftSnapshotJson),auxiliaries(base));
 await service.undoDraft(input.planId,fp(moved),13);assert.deepEqual((await session()).draftSnapshotJson,base);assert.equal((await session()).draftFingerprint,fp(base));
 await service.redoDraft(input.planId,fp(base),13);assert.deepEqual((await session()).draftSnapshotJson,moved);assert.equal((await session()).draftFingerprint,fp(moved));
 await service.resetDraft(input.planId,fp(moved),13);assert.deepEqual((await session()).draftSnapshotJson,base);assert.equal((await session()).draftFingerprint,fixture.fingerprint);
 assert.deepEqual((await db.query('SELECT * FROM daily_tasks')).rows,dailyBefore);
 assert.deepEqual((await db.query('SELECT * FROM assisted_planning_stages')).rows,acceptedBefore);
});

test('block edit, block Undo/Redo and reset preserve the complete auxiliary contract',async()=>{
 const {service,session}=await harness();
 const members=input.tasks.filter(t=>t.templateId===input.tasks[0].templateId&&t.spaceId===input.tasks[0].spaceId).slice(0,2).map(t=>t.id);
 await service.editPlanningBlocks(input.planId,fp(base),13,{kind:'CREATE_BLOCK',memberTaskIds:members});
 const edited=(await session()).draftSnapshotJson;
 assert.equal(edited.planningBlocks.length,1);assert.deepEqual(auxiliaries(edited),auxiliaries(base));
 await service.undoDraft(input.planId,fp(edited),13);assert.deepEqual((await session()).draftSnapshotJson,base);
 await service.redoDraft(input.planId,fp(base),13);assert.deepEqual((await session()).draftSnapshotJson,edited);
 await service.resetDraft(input.planId,fp(edited),13);assert.equal((await session()).draftFingerprint,fixture.fingerprint);
});

test('native patch rejects omission, mutation or insertion of any structural field atomically',async()=>{
 await harness();
 for(const field of ['roundPreparations','setupPreparations','operationalMeals','contractVersion'] as const){
  const damaged:any=structuredClone(moved);delete damaged[field];
  await assert.rejects(()=>db.query('SELECT assisted_patch_draft($1,$2,13,$3,$4)',[input.planId,fp(base),JSON.stringify(damaged),'f'.repeat(64)]),/UNSUPPORTED_MANUAL_FIELD/);
 }
 const altered:any=structuredClone(moved);altered.roundPreparations![0]={...altered.roundPreparations![0],id:'changed'};
 await assert.rejects(()=>db.query('SELECT assisted_patch_draft($1,$2,13,$3,$4)',[input.planId,fp(base),JSON.stringify(altered),'f'.repeat(64)]),/UNSUPPORTED_MANUAL_FIELD/);
 await assert.rejects(()=>db.query('SELECT assisted_patch_draft($1,$2,13,$3,$4)',[input.planId,fp(base),JSON.stringify({...moved,futureStructuralField:[]}),fp(moved)]),/UNSUPPORTED_MANUAL_FIELD/);
 const row=(await db.query<any>('SELECT * FROM assisted_planning_sessions')).rows[0];assert.deepEqual(row.draft_snapshot_json,base);assert.equal(row.draft_fingerprint,fixture.fingerprint);assert.deepEqual(row.draft_scope_json,{});
});

test('real anonymous transport conflict blocks recording; rejecting/resetting leaves accepted S10 and daily tasks identical',async()=>{
 const {service,session,calls}=await harness();
 const before=(await db.query('SELECT * FROM assisted_planning_stages')).rows;
 await service.patchDraft(input.planId,fp(base),13,[{taskId:10048,startPlanned:'19:00',endPlanned:'19:05'}]);
 await assert.rejects(()=>service.validateDraft(input.planId,fp(moved),13),/ASSISTED_DELTA_VALIDATION_UNSUPPORTED/);
 assert.deepEqual(calls,['assisted_patch_draft']);assert.equal((await db.query<any>('SELECT count(*) AS n FROM planning_stage_validations')).rows[0].n,0);
 assert.equal((await session()).draftValidationId,null);
 await service.resetDraft(input.planId,fp(moved),13);assert.deepEqual((await db.query('SELECT * FROM assisted_planning_stages')).rows,before);
});
