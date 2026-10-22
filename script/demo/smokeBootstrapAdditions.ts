import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import type {Page} from 'playwright';
import type pg from 'pg';

export async function incorporateBootstrapAdditions({page,appUrl,planId,db,api,request,directory,label,pass,negatives=false,concurrent=false}:{
 page:Page;appUrl:string;planId:number;db:pg.Client;api:(path:string,method?:string,body?:unknown)=>Promise<any>;
 request:(path:string,method?:string,body?:unknown,role?:string)=>Promise<{status:number;body:any}>;
 directory:string;label:string;pass:(name:string)=>void;negatives?:boolean;concurrent?:boolean;
}) {
 const path=`/api/plans/${planId}/assisted`,before=await api(path);
 const preview=await api(path+'/bootstrap-additions');assert.equal(preview.allowed,true,JSON.stringify(preview));
 const body={expectedSessionId:preview.expectedSessionId,expectedBaseStageId:preview.expectedBaseStageId,
  expectedDraftFingerprint:preview.expectedDraftFingerprint,expectedConfigRevisionId:preview.expectedConfigRevisionId,
  sourceToken:preview.sourceToken,confirmation:'INCORPORATE_NEW_TASKS'};
 if(negatives){
  const rejected=async(reason:string)=>{const p=await api(path+'/bootstrap-additions');assert.equal(p.allowed,false);assert.equal(p.reason,reason);};
  const transactionalNegative=async(sql:string,reason:string)=>{
    await db.query('BEGIN');try{await db.query(sql);await db.query('SET LOCAL ROLE service_role');
      const value=(await db.query('SELECT assisted_preview_bootstrap_additions($1) preview',[planId])).rows[0].preview;
      assert.equal(value.allowed,false);assert.equal(value.reason,reason);
    }finally{await db.query('ROLLBACK');}
  };
  await transactionalNegative(`DELETE FROM daily_tasks WHERE id=${Number(before.draft.tasks[0].taskId)}`,'REBOOTSTRAP_TASK_CHANGED_OR_REMOVED');
  await transactionalNegative(`UPDATE program_settings SET meal_task_template_name='Modified authority' WHERE id=1`,'REBOOTSTRAP_AUTHORITY_CHANGED');
  await transactionalNegative(`INSERT INTO locks(plan_id,task_id,lock_type,created_by) VALUES(${planId},${Number(before.draft.tasks[0].taskId)},'time','test operator')`,'REBOOTSTRAP_PROTECTED_DAY');
  await transactionalNegative(`DELETE FROM assisted_bootstrap_sources WHERE session_id=${Number(before.session.id)}`,'REBOOTSTRAP_BASELINE_UNAVAILABLE');
  const original=(await db.query('SELECT draft_scope_json FROM assisted_planning_sessions WHERE id=$1',[before.session.id])).rows[0];
  await db.query(`UPDATE assisted_planning_sessions SET draft_scope_json='{"editKind":"MANUAL"}' WHERE id=$1`,[before.session.id]);
  await rejected('REBOOTSTRAP_DIRTY_DRAFT');await db.query('UPDATE assisted_planning_sessions SET draft_scope_json=$2 WHERE id=$1',[before.session.id,original.draft_scope_json]);
  const taskId=before.draft.tasks[0].taskId;
  await db.query('UPDATE daily_tasks SET duration_override=coalesce(duration_override,10)+1 WHERE id=$1',[taskId]);await rejected('REBOOTSTRAP_TASK_CHANGED_OR_REMOVED');
  await db.query('UPDATE daily_tasks SET duration_override=$2 WHERE id=$1',[taskId,before.draft.tasks[0].durationOverride]);
  await db.query("UPDATE daily_tasks SET status='done' WHERE id=$1",[taskId]);await rejected('REBOOTSTRAP_PROTECTED_DAY');await db.query("UPDATE daily_tasks SET status='pending' WHERE id=$1",[taskId]);
  const participant=(await db.query('SELECT * FROM contestants WHERE plan_id=$1 ORDER BY id LIMIT 1',[planId])).rows[0];
  if(participant){await db.query("UPDATE contestants SET availability_end='16:55' WHERE id=$1",[participant.id]);await rejected('REBOOTSTRAP_PARTICIPANT_CHANGED_OR_REMOVED');await db.query('UPDATE contestants SET availability_end=$2 WHERE id=$1',[participant.id,participant.availability_end]);}
  const run=(await db.query(`INSERT INTO planning_runs(plan_id,status,engine,execution_kind,assisted_session_id,base_stage_id,config_revision_id,scope_json,scope_task_ids_json,include_prerequisites,source_draft_fingerprint)
   VALUES($1,'running','planner-next','ASSISTED_SCOPE',$2,$3,$4,'{}',$5,false,$6) RETURNING id`,[planId,before.session.id,before.draftBaseStageId,before.currentConfigRevisionId,JSON.stringify([taskId]),before.draftFingerprint])).rows[0];
  await rejected('REBOOTSTRAP_PENDING_PROPOSAL');
  await transactionalNegative(`UPDATE planning_runs SET execution_kind='FULL_PLAN',assisted_session_id=NULL,base_stage_id=NULL WHERE id=${Number(run.id)}`,'REBOOTSTRAP_PENDING_PROPOSAL');
  await db.query(`UPDATE planning_runs SET status='success',assisted_result_json='{"contractVersion":1,"outcome":"PROPOSAL"}' WHERE id=$1`,[run.id]);
  await rejected('REBOOTSTRAP_PENDING_PROPOSAL');
  assert.equal((await request(path+`/proposals/${run.id}/discard`,'POST',{expectedBaseStageId:before.draftBaseStageId,expectedDraftFingerprint:before.draftFingerprint},'production')).status,200);
  const discarded=(await db.query('SELECT status,cancel_reason,assisted_result_json FROM planning_runs WHERE id=$1',[run.id])).rows[0];
  assert.equal(discarded.cancel_reason,'OPERATOR_DISCARDED_PROPOSAL');assert.equal(discarded.assisted_result_json.outcome,'PROPOSAL');
  await db.query('BEGIN');try{
    await db.query('UPDATE daily_tasks SET duration_override=duration_override WHERE id=$1',[taskId]);
    const blocked=await request(path+'/bootstrap-additions','POST',body);
    assert.equal(blocked.status,409);assert.equal(blocked.body.code,'REBOOTSTRAP_STALE_SOURCES');
  }finally{await db.query('ROLLBACK');}

  for(const role of ['aux','viewer','norole'])assert.equal((await request(path+'/bootstrap-additions','POST',body,role)).status,403);
  for(const stale of [{...body,sourceToken:'0'.repeat(64)},{...body,expectedBaseStageId:body.expectedBaseStageId+999},{...body,expectedDraftFingerprint:'0'.repeat(64)},{...body,expectedConfigRevisionId:body.expectedConfigRevisionId+999}])assert.equal((await request(path+'/bootstrap-additions','POST',stale)).status,409);
  // Genuine intermediate failure, with no production failure switches: a temporary
  // trigger aborts Stage insertion after old session closure/new session creation.
  await db.query(`CREATE FUNCTION public.u00c_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'U00C_INJECTED_FAILURE'; END $$;
   CREATE TRIGGER u00c_test_fail BEFORE INSERT ON assisted_planning_stages FOR EACH ROW EXECUTE FUNCTION public.u00c_test_fail()`);
  const counts=async()=>(await db.query('SELECT (SELECT count(*) FROM assisted_planning_sessions WHERE plan_id=$1)::int sessions,(SELECT count(*) FROM plan_config_revisions WHERE plan_id=$1)::int revisions,(SELECT count(*) FROM assisted_planning_stages WHERE plan_id=$1)::int stages',[planId])).rows[0];
  const countsBefore=await counts();
  await assert.rejects(()=>api(path+'/bootstrap-additions','POST',body),/500/);
  await db.query('DROP TRIGGER u00c_test_fail ON assisted_planning_stages; DROP FUNCTION public.u00c_test_fail()');
  assert.deepEqual(await api(path),before);assert.deepEqual(await counts(),countsBefore);
  pass('U00c native: dirty Draft, changed tasks/participants, protected execution, running proposal, roles, stale CAS and complete intermediate rollback');
 }
 if(concurrent){
  const replies=await Promise.all([request(path+'/bootstrap-additions','POST',body),request(path+'/bootstrap-additions','POST',body,'production')]);
  assert.deepEqual(replies.map(r=>r.status).sort(),[200,409]);
  writeFileSync(`${directory}/${label}-concurrent.json`,JSON.stringify(replies,null,2));
 }else{
 await page.goto(`${appUrl}/plans/${planId}?tab=planning`);
 await page.getByText('Nuevas tareas pendientes de incorporar a Assisted',{exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Generar propuesta',exact:true}).isEnabled(),false);
 await page.getByRole('button',{name:'Revisar nuevas tareas',exact:true}).click();
 await page.getByRole('button',{name:'Actualizar Assisted con nuevas tareas',exact:true}).click();
 const dialog=page.getByRole('alertdialog');await dialog.waitFor();
 const pending=page.waitForResponse(r=>new URL(r.url()).pathname===path+'/bootstrap-additions'&&r.request().method()==='POST');
 await dialog.getByRole('button',{name:'Confirmar incorporación',exact:true}).click();
 const response=await pending;assert.equal(response.status(),200,await response.text());
 }
 const after=await api(path);assert.notEqual(after.session.id,before.session.id);assert.equal(after.activeStage.ordinal,0);
 assert.equal(after.draft.tasks.length,before.draft.tasks.length+preview.addedTaskIds.length);
 const historical=(await db.query('SELECT * FROM assisted_planning_stages WHERE id=$1',[before.activeStage.id])).rows[0];
 assert.deepEqual(historical.snapshot_json,before.activeStage.snapshotJson);assert.equal(historical.snapshot_fingerprint,before.activeStage.snapshotFingerprint);assert.equal(historical.archived_at,null);
 assert.equal((await db.query('SELECT status FROM assisted_planning_sessions WHERE id=$1',[before.session.id])).rows[0].status,'CLOSED');
 assert.equal((await db.query("SELECT count(*)::int n FROM assisted_planning_sessions WHERE plan_id=$1 AND status='ACTIVE'",[planId])).rows[0].n,1);
 assert.equal((await request(path+'/bootstrap-additions','POST',body)).status,409);
 assert.equal((await api(path+'/bootstrap-additions')).reason,'REBOOTSTRAP_NO_ADDITIONS');
 const lineage=(await db.query('SELECT previous_session_id FROM assisted_bootstrap_sources WHERE session_id=$1',[after.session.id])).rows[0];assert.equal(Number(lineage.previous_session_id),before.session.id);
 writeFileSync(`${directory}/${label}-rebootstrap.json`,JSON.stringify({before,preview,after,historical,lineage},null,2));
 await page.screenshot({path:`${directory}/${label}-rebootstrap.png`,fullPage:true});
 pass(concurrent?'U00c concurrency: two requests, one commit and one conflict, one active session, immutable history':'U00c UI: explicit review and confirmation, new coherent S0, immutable prior Stage, audit lineage and one active session');
 return after;
}
