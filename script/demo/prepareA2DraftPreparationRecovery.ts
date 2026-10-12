/** Offline preparation only. This module never connects to a database. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fingerprintAssistedPlanningSnapshotV1,rebuildAssistedPlanningSnapshotV1,type AssistedPlanningSnapshotV1} from '../../server/assistedPlanningSnapshot';
import {jointCompletionCanonicalJson as canonical} from '../../engine/planner-next/jointCompletionWitness';
import {literal} from './sql';

export interface A2DraftRecoveryExport {
 session:{id:number;planId:number;activeStageId:number;draftBaseStageId:number;currentConfigRevisionId:number;
   draftSnapshotJson:AssistedPlanningSnapshotV1;draftFingerprint:string;draftScopeJson:Record<string,unknown>};
 stage:{id:number;sessionId:number;planId:number;ordinal:number;snapshotJson:AssistedPlanningSnapshotV1;snapshotFingerprint:string};
 acceptedExceptionCount:number;
}
export function prepareA2DraftPreparationRecovery(data:A2DraftRecoveryExport){
 const {session:s,stage:b}=data;
 assert.ok(Number.isSafeInteger(s.id)&&s.id>0&&Number.isSafeInteger(s.currentConfigRevisionId)&&s.currentConfigRevisionId>0,'invalid session identity');
 assert.equal(s.planId,27001);assert.equal(b.planId,s.planId);assert.equal(b.id,13);assert.equal(b.ordinal,10);
 assert.equal(s.activeStageId,b.id);assert.equal(s.draftBaseStageId,b.id);assert.equal(b.sessionId,s.id);
 assert.equal(data.acceptedExceptionCount,0);
 assert.equal(fingerprintAssistedPlanningSnapshotV1(b.snapshotJson),b.snapshotFingerprint,'corrupt base fingerprint');
 assert.equal(fingerprintAssistedPlanningSnapshotV1(s.draftSnapshotJson),s.draftFingerprint,'corrupt draft fingerprint');
 const base=rebuildAssistedPlanningSnapshotV1(b.snapshotJson),draft=rebuildAssistedPlanningSnapshotV1(s.draftSnapshotJson);
 assert.equal(canonical(base),canonical(b.snapshotJson),'unsupported base snapshot fields');
 assert.equal(canonical(draft),canonical(s.draftSnapshotJson),'unsupported draft snapshot fields');
 assert.equal(base.tasks.length,266);assert.ok(base.tasks.every(t=>t.startPlanned&&t.endPlanned));assert.equal(base.operationalMeals?.length,8);assert.equal(base.roundPreparations?.length,17);assert.equal(base.setupPreparations?.length,1);
 assert.equal(draft.tasks.length,266);assert.equal(draft.operationalMeals?.length,8);
 assert.equal(draft.roundPreparations,undefined);assert.equal(draft.setupPreparations,undefined);
 const out=base.tasks.find(t=>t.taskId===10048)!;assert.ok(out);
 assert.equal(out.startPlanned,'18:55');assert.equal(out.endPlanned,'19:00');
 const expectedTasks=base.tasks.map(t=>t.taskId===10048?{...t,startPlanned:'19:00',endPlanned:'19:05'}:t);
 const {setupPreparations:_setup,roundPreparations:_round,...baseWithoutPreparations}=base;
 assert.equal(canonical(draft),canonical({...baseWithoutPreparations,tasks:expectedTasks}),'changes exceed the one temporal edit and missing preparations');
 // Require a single unbranched manual edit, with unchanged task identity and
 // no block history. Do not rewrite the user's existing audit/Undo ledger.
 const trace=s.draftScopeJson as any;
 assert.equal(trace.editKind,'MANUAL');assert.deepEqual(trace.manualTouchedTaskIds,[10048]);assert.deepEqual(trace.redoLedger,[]);
 assert.equal(trace.editLedger?.length,1);
 const op=trace.editLedger[0];assert.equal(op.beforeFingerprint,b.snapshotFingerprint);assert.equal(op.afterFingerprint,s.draftFingerprint);
 assert.equal(canonical(op.inverse),canonical([out]));assert.equal(canonical(op.forward),canonical([expectedTasks.find(t=>t.taskId===10048)]));
 assert.deepEqual(op.forwardBlocks,[]);assert.deepEqual(op.inverseBlocks,[]);assert.equal(op.forwardHasBlocks,false);assert.equal(op.inverseHasBlocks,false);
 const repairedSnapshot=rebuildAssistedPlanningSnapshotV1({...draft,setupPreparations:base.setupPreparations,roundPreparations:base.roundPreparations});
 const repairedFingerprint=fingerprintAssistedPlanningSnapshotV1(repairedSnapshot);
 const backupExportJson=JSON.stringify(data,null,2);
 const backupSha256=createHash('sha256').update(backupExportJson).digest('hex');
 const json=(v:unknown)=>`${literal(JSON.stringify(v))}::jsonb`;
 const sql=`-- PREPARED ONLY. Review preflight, export backup and stop concurrent editors first.
-- Set both values explicitly after reviewing the exported backup; default is rollback.
BEGIN;
DO $recovery$
DECLARE s public.assisted_planning_sessions%rowtype; b public.assisted_planning_stages%rowtype;
BEGIN
 IF current_setting('optiplan.a2_draft_recovery_approved',true) IS DISTINCT FROM 'yes'
   OR current_setting('optiplan.a2_draft_recovery_backup_sha256',true) IS DISTINCT FROM ${literal(backupSha256)}
 THEN RAISE EXCEPTION 'RECOVERY_REVIEW_AND_BACKUP_REQUIRED'; END IF;
 SELECT * INTO s FROM public.assisted_planning_sessions WHERE id=${s.id} AND plan_id=27001 AND status='ACTIVE' FOR UPDATE;
 IF NOT FOUND OR s.active_stage_id IS DISTINCT FROM 13 OR s.draft_base_stage_id IS DISTINCT FROM 13 OR s.current_config_revision_id IS DISTINCT FROM ${s.currentConfigRevisionId}
   OR s.draft_fingerprint IS DISTINCT FROM ${literal(s.draftFingerprint)}
   OR s.draft_snapshot_json IS DISTINCT FROM ${json(s.draftSnapshotJson)}
   OR s.draft_scope_json IS DISTINCT FROM ${json(s.draftScopeJson)}
 THEN RAISE EXCEPTION 'RECOVERY_PREFLIGHT_CHANGED'; END IF;
 SELECT * INTO b FROM public.assisted_planning_stages WHERE id=13 AND session_id=s.id AND plan_id=27001 FOR SHARE;
 IF NOT FOUND OR b.ordinal IS DISTINCT FROM 10 OR b.snapshot_fingerprint IS DISTINCT FROM ${literal(b.snapshotFingerprint)}
   OR b.snapshot_json IS DISTINCT FROM ${json(b.snapshotJson)} OR b.archived_at IS NOT NULL
   OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.assisted_planning_stages'::regclass
     AND tgname='assisted_planning_stages_immutable' AND tgenabled='O' AND NOT tgisinternal
     AND tgfoid='public.guard_assisted_planning_stage_update()'::regprocedure)
   OR EXISTS(SELECT 1 FROM public.planning_accepted_exceptions WHERE plan_id=27001)
 THEN RAISE EXCEPTION 'RECOVERY_BASE_NOT_PROVEN_IMMUTABLE'; END IF;
 UPDATE public.assisted_planning_sessions SET draft_snapshot_json=${json(repairedSnapshot)},
   draft_fingerprint=${literal(repairedFingerprint)},draft_validation_id=NULL,updated_at=now() WHERE id=s.id AND plan_id=27001;
 IF NOT FOUND THEN RAISE EXCEPTION 'RECOVERY_SESSION_MISSING'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.assisted_planning_sessions WHERE id=s.id AND plan_id=27001
   AND draft_snapshot_json=${json(repairedSnapshot)} AND draft_fingerprint=${literal(repairedFingerprint)}
   AND draft_scope_json=${json(s.draftScopeJson)} AND draft_validation_id IS NULL)
 THEN RAISE EXCEPTION 'RECOVERY_VERIFY_FAILED'; END IF;
END $recovery$;
-- Review the returned snapshot and fingerprint before changing ROLLBACK to COMMIT.
SELECT id,plan_id,active_stage_id,draft_base_stage_id,draft_fingerprint,draft_snapshot_json FROM public.assisted_planning_sessions WHERE id=${s.id} AND plan_id=27001;
ROLLBACK;
`;
 return {repairedSnapshot,repairedFingerprint,backupSha256,sql,legacyUndoStatus:'BLOCKED_CORRUPT_EDIT_LEDGER_AUDIT_UNCHANGED' as const};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [file,directory]=process.argv.slice(2);assert.ok(file&&directory,'Usage: node --import tsx script/demo/prepareA2DraftPreparationRecovery.ts export.json output-directory');
 const data=JSON.parse(readFileSync(file,'utf8')) as A2DraftRecoveryExport;
 const prepared=prepareA2DraftPreparationRecovery(data);mkdirSync(directory,{recursive:true,mode:0o700});
 writeFileSync(`${directory}/backup-export.json`,JSON.stringify(data,null,2),{mode:0o600});
 writeFileSync(`${directory}/repair-reviewed-only.sql`,prepared.sql,{mode:0o600});
 writeFileSync(`${directory}/repair-manifest.json`,JSON.stringify({...prepared,sql:undefined},null,2),{mode:0o600});
 console.log(JSON.stringify({preparedOnly:true,remoteWrites:0,repairedFingerprint:prepared.repairedFingerprint,legacyUndoStatus:prepared.legacyUndoStatus}));
}
