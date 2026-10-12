import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import fixture from '../../server/fixtures/assistedA2S10.json';
import {fingerprintAssistedPlanningSnapshotV1 as fp,type AssistedPlanningSnapshotV1} from '../../server/assistedPlanningSnapshot';
import {prepareA2DraftPreparationRecovery,type A2DraftRecoveryExport} from './prepareA2DraftPreparationRecovery';
const base=fixture.snapshot as AssistedPlanningSnapshotV1;
const {setupPreparations:_setup,roundPreparations:_round,...truncated}=base;
const draft={...truncated,tasks:base.tasks.map(t=>t.taskId===10048?{...t,startPlanned:'19:00',endPlanned:'19:05'}:t)};
const out=base.tasks.find(t=>t.taskId===10048)!;
const data:A2DraftRecoveryExport={session:{id:7,planId:27001,activeStageId:13,draftBaseStageId:13,currentConfigRevisionId:1,draftSnapshotJson:draft,draftFingerprint:fp(draft),draftScopeJson:{editKind:'MANUAL',manualTouchedTaskIds:[10048],redoLedger:[],editLedger:[{beforeFingerprint:fp(base),afterFingerprint:fp(draft),inverse:[out],forward:[draft.tasks.find(t=>t.taskId===10048)],forwardBlocks:[],inverseBlocks:[],forwardHasBlocks:false,inverseHasBlocks:false}]}},stage:{id:13,sessionId:7,planId:27001,ordinal:10,snapshotJson:base,snapshotFingerprint:fp(base)},acceptedExceptionCount:0};
const db=new PGlite();after(()=>db.close());
async function setup(){
 await db.exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
 CREATE TABLE assisted_planning_sessions(id bigint,plan_id integer,status text,active_stage_id bigint,draft_base_stage_id bigint,current_config_revision_id bigint,draft_snapshot_json jsonb,draft_fingerprint text,draft_scope_json jsonb,draft_validation_id bigint,updated_at timestamptz);
 CREATE TABLE assisted_planning_stages(id bigint,session_id bigint,plan_id integer,ordinal integer,snapshot_json jsonb,snapshot_fingerprint text,archived_at timestamptz);
 CREATE TABLE planning_accepted_exceptions(id bigint,plan_id integer);
 CREATE TABLE daily_tasks(id integer,plan_id integer,start_planned text,end_planned text);
 CREATE TABLE planning_stage_validations(id integer,plan_id integer);`);
 const migration=readFileSync('supabase/migrations/077_assisted_planning_state.sql','utf8');
 await db.exec(migration.match(/CREATE OR REPLACE FUNCTION public\.guard_assisted_planning_stage_update\(\)[\s\S]*?END \$\$;/)![0]);
 await db.exec('CREATE TRIGGER assisted_planning_stages_immutable BEFORE UPDATE ON assisted_planning_stages FOR EACH ROW EXECUTE FUNCTION guard_assisted_planning_stage_update()');
 await db.query('INSERT INTO assisted_planning_sessions VALUES(7,27001,\'ACTIVE\',13,13,1,$1,$2,$3,8,now())',[JSON.stringify(draft),fp(draft),JSON.stringify(data.session.draftScopeJson)]);
 await db.query('INSERT INTO assisted_planning_stages VALUES(13,7,27001,10,$1,$2,NULL)',[JSON.stringify(base),fp(base)]);
 await db.query('INSERT INTO assisted_planning_sessions SELECT 8,123,\'ACTIVE\',14,14,1,draft_snapshot_json,draft_fingerprint,draft_scope_json,NULL,updated_at FROM assisted_planning_sessions WHERE id=7');
 await db.exec("INSERT INTO daily_tasks VALUES(10048,27001,'18:55','19:00');INSERT INTO planning_stage_validations VALUES(8,27001)");
 await db.exec(`SET optiplan.a2_draft_recovery_approved='yes'; SET optiplan.a2_draft_recovery_backup_sha256='${prepareA2DraftPreparationRecovery(data).backupSha256}';`);
}
const stable=async()=>Promise.all(['assisted_planning_stages','daily_tasks','planning_accepted_exceptions','planning_stage_validations'].map(async table=>(await db.query(`SELECT * FROM ${table} ORDER BY id`)).rows));

test('offline repair restores exact base preparations while preserving C04 move and audit ledger',()=>{
 const repaired=prepareA2DraftPreparationRecovery(data);
 assert.deepEqual(repaired.repairedSnapshot.setupPreparations,base.setupPreparations);assert.deepEqual(repaired.repairedSnapshot.roundPreparations,base.roundPreparations);assert.deepEqual(repaired.repairedSnapshot.tasks,draft.tasks);
 assert.equal(repaired.repairedFingerprint,fp(repaired.repairedSnapshot));assert.match(repaired.sql,/ROLLBACK;/);assert.equal(repaired.legacyUndoStatus,'BLOCKED_CORRUPT_EDIT_LEDGER_AUDIT_UNCHANGED');
});

test('offline preflight rejects broader edits, changed identities, wrong Stage, bad fingerprints and unsupported ledger histories',()=>{
 for(const mutate of [(x:A2DraftRecoveryExport)=>{x.stage.id=14;},(x:A2DraftRecoveryExport)=>{x.session.draftFingerprint='f'.repeat(64);},(x:A2DraftRecoveryExport)=>{x.acceptedExceptionCount=1;},(x:A2DraftRecoveryExport)=>{(x.session.draftScopeJson as any).redoLedger=[{}];},(x:A2DraftRecoveryExport)=>{(x.session.draftScopeJson as any).editLedger.push({});},(x:A2DraftRecoveryExport)=>{const changed:any=structuredClone(x.session.draftSnapshotJson);changed.tasks[0].spaceId=999;x.session.draftSnapshotJson=changed;x.session.draftFingerprint=fp(changed);}]){
  const changed=structuredClone(data);mutate(changed);assert.throws(()=>prepareA2DraftPreparationRecovery(changed));
 }
});

test('prepared SQL defaults to rollback and requires a reviewed backup',async()=>{
 await setup();const prepared=prepareA2DraftPreparationRecovery(data);const before=(await db.query('SELECT * FROM assisted_planning_sessions ORDER BY id')).rows;
 await db.exec(prepared.sql);assert.deepEqual((await db.query('SELECT * FROM assisted_planning_sessions ORDER BY id')).rows,before);
 await db.exec("SET optiplan.a2_draft_recovery_approved='no'");
 await assert.rejects(()=>db.exec(prepared.sql),/RECOVERY_REVIEW_AND_BACKUP_REQUIRED/);await db.exec('ROLLBACK');
 assert.deepEqual((await db.query('SELECT * FROM assisted_planning_sessions ORDER BY id')).rows,before);
});

test('native repair changes only current Draft, clears stale validation and keeps all accepted/audit/other-day material',async()=>{
 await setup();const before=await stable(),other=(await db.query('SELECT * FROM assisted_planning_sessions WHERE id=8')).rows;
 const prepared=prepareA2DraftPreparationRecovery(data);
 await db.exec(prepared.sql.replace('ROLLBACK;','COMMIT;'));
 const repaired=(await db.query<any>('SELECT * FROM assisted_planning_sessions WHERE id=7')).rows[0];
 assert.deepEqual(repaired.draft_snapshot_json,prepared.repairedSnapshot);assert.equal(repaired.draft_fingerprint,prepared.repairedFingerprint);assert.equal(repaired.draft_validation_id,null);
 assert.deepEqual(repaired.draft_scope_json,data.session.draftScopeJson);assert.deepEqual(await stable(),before);assert.deepEqual((await db.query('SELECT * FROM assisted_planning_sessions WHERE id=8')).rows,other);
});

test('SQL preflight detects a concurrent edit or disabled Stage immutability and aborts atomically',async()=>{
 await setup();const prepared=prepareA2DraftPreparationRecovery(data);
 await db.exec("UPDATE assisted_planning_sessions SET draft_fingerprint=repeat('f',64) WHERE id=7");
 await assert.rejects(()=>db.exec(prepared.sql),/RECOVERY_PREFLIGHT_CHANGED/);await db.exec('ROLLBACK');
 await setup();await db.exec('UPDATE assisted_planning_sessions SET active_stage_id=NULL WHERE id=7');
 await assert.rejects(()=>db.exec(prepared.sql),/RECOVERY_PREFLIGHT_CHANGED/);await db.exec('ROLLBACK');
 await setup();await db.exec('ALTER TABLE assisted_planning_stages DISABLE TRIGGER assisted_planning_stages_immutable');
 await assert.rejects(()=>db.exec(prepared.sql),/RECOVERY_BASE_NOT_PROVEN_IMMUTABLE/);await db.exec('ROLLBACK');
 assert.equal((await db.query<any>('SELECT draft_fingerprint FROM assisted_planning_sessions WHERE id=7')).rows[0].draft_fingerprint,fp(draft));
});
