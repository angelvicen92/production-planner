import assert from 'node:assert/strict';
import {buildEngineInput} from '../../../../engine/buildInput';
import {author} from '../../p0-g03e/frontier';
import {finishDay} from './finish';
import {existsSync,unlinkSync} from 'node:fs';
export async function frontier(ctx:any){
 const {phaseTasks,phaseB,joint,last,save,read,planId}=ctx;
 const {storage}=await import('../../../../server/storage');
 const before=await buildEngineInput(planId,storage);save('native-before-structure',before);
 // Before any production proposal, attack only the SQL exception with the
 // original literal witness. Each probe rolls back its synthetic metadata.
 if(!process.env.G04A_SKIP_FOCAL){
  for(let attempt=0;;attempt++){
   try{
    const {sqlConsumerProbe}=await import(attempt===0?'./focal':'./focalRetry'+attempt);
    await sqlConsumerProbe({...ctx,input:before},process.env.G04A_ORIGINAL_PROBE!);break;
   }catch(error:any){
    save('focal-attempt-'+attempt,{message:error.message,stack:error.stack});
    if(!process.env.G04A_DEV_HOLD)throw error;
    console.error('FOCAL_DIAGNOSTIC_HOLD',error.message);
    const trigger=ctx.directory+'/retry-focal';
    while(!existsSync(trigger))await new Promise(r=>setTimeout(r,1000));
    unlinkSync(trigger);
   }
  }
 }
 const phases=[phaseTasks.map((t:any)=>t.id),phaseB.map((t:any)=>t.id),[joint[0].id,last.id]];
 await author({...ctx,phases,joint,label:'macro'});
 const input=await buildEngineInput(planId,storage);assert.equal(input.tasks.length,103);
 const result=await finishDay({...ctx,phaseTasks:[...phaseTasks,...phaseB,...joint,last],phases,joint,label:'macro',peerIndex:1});
 return result;
}
