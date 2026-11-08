import assert from 'node:assert/strict';
import {buildEngineInput} from '../../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {author} from '../p0-g03e/frontier';
import {auditDay} from './auditDay';

/** Observe the first real boundary, retaining state even when native admission fails. */
export async function frontier(ctx:any){
 const {phaseTasks,phaseB,joint,last,save,planId,db,read}=ctx;
 const {storage}=await import('../../../server/storage');
 const capture=async(label:string)=>{
  const input=await buildEngineInput(planId,storage);save(label+'-input',input);
  save(label+'-adapter',adapt(input));save(label+'-effective',await read(`/api/plans/${planId}/effective-configuration`));
  save(label+'-sql-state',(await db.query(`SELECT id,current_config_revision_id,daily_technical_chains,daily_joint_groups FROM plans WHERE id=$1`,[planId])).rows);
  save(label+'-sql-stages',(await db.query(`SELECT id,ordinal,snapshot_fingerprint,snapshot_json FROM assisted_planning_stages WHERE plan_id=$1 ORDER BY id`,[planId])).rows);
  return input;
 };
 const before=await capture('before-structure');assert.equal(before.tasks.length,141);
 const phases=[phaseTasks.map((t:any)=>t.id),phaseB.map((t:any)=>t.id),[joint[0].id,last.id]];
 try{
  await author({...ctx,phases,joint,label:'macro'});
  const input=await capture('authored');assert.equal(input.tasks.length,141);
  return await auditDay({...ctx,phases});
 }catch(e:any){
  save('first-boundary',{message:e.message,stack:e.stack});await capture('boundary');throw e;
 }
}
