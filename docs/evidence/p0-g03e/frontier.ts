import assert from 'node:assert/strict';
import {buildEngineInput} from '../../../engine/buildInput';
import {finishDay} from './finish';

export async function author({appUrl,db,page,read,responseTo,save,planId,phases,joint,label,directory}:any){
 const config=`/api/plans/${planId}/day-configuration`,path=`/api/plans/${planId}/effective-configuration`;
 let view=await read(path);save(label+'-before-effective',view);
 assert.equal(view.jointGroups.supported,false);
 await page.goto(`${appUrl}/plans/${planId}?tab=configuration`,{waitUntil:'networkidle'});
 const editor=page.getByTestId('daily-technical-chain');
 await editor.getByRole('button',{name:'Crear cadena técnica',exact:true}).click();
 await editor.getByLabel('Orden por fases',{exact:true}).check();
 for(let i=0;i<phases.length;i++){
  if(i)await editor.getByRole('button',{name:'Añadir fase',exact:true}).click();
  for(const id of phases[i])await editor.getByLabel(`Fase ${i+1}: ${view.technicalChains.tasks.find((t:any)=>t.id===id).label}`,{exact:true}).check();
 }
 save(label+'-phase-save',await responseTo(config,'PUT',()=>editor.getByRole('button',{name:'Guardar cadena técnica',exact:true}).click()));
 await page.reload({waitUntil:'networkidle'});view=await read(path);
 assert.equal(view.jointGroups.supported,true);
 const joints=page.getByTestId('daily-joint-groups');
 await joints.getByRole('button',{name:'Crear operación conjunta',exact:true}).click();
 for(const t of joint)await joints.getByLabel(`Miembro conjunto ${view.jointGroups.tasks.find((m:any)=>m.id===t.id).label}`,{exact:true}).check();
 save(label+'-joint-save',await responseTo(config,'PUT',()=>joints.getByRole('button',{name:'Guardar operación conjunta',exact:true}).click()));
 await page.reload({waitUntil:'networkidle'});view=await read(path);save(label+'-reloaded-effective',view);
 assert.deepEqual(view.jointGroups.authority.groups[0].taskIds,joint.map((t:any)=>t.id).sort((a:number,b:number)=>a-b));
 const {storage}=await import('../../../server/storage');const input=await buildEngineInput(planId,storage);save(label+'-reconstructed-input',input);
 assert.ok(input.dailyJointGroupsVersion===1&&input.dailyTechnicalChainsVersion===1);
 save(label+'-sql-authorities',(await db.query('SELECT daily_joint_groups,daily_technical_chains,current_config_revision_id FROM plans WHERE id=$1',[planId])).rows[0]);
 await page.screenshot({path:`${directory}/${label}-authorities.png`,fullPage:true});
 return view;
}

export async function frontier(ctx:any){
 const {phaseTasks,phaseB,joint,last,save,read,planId,page,appUrl,db}=ctx;
 const phases=[phaseTasks.map((t:any)=>t.id),phaseB.map((t:any)=>t.id),[joint[0].id,last.id]];
 await author({...ctx,phases,joint,label:'macro'});
 const {storage}=await import('../../../server/storage');
 const original=await buildEngineInput(planId,storage),resource=original.planResourceItems.find(r=>r.name==='EVA')!;
 const {editWindow,negatives}=await import('../p0-g03d/nativeFrontier');
 await editWindow({...ctx,globalId:resource.resourceItemId,name:'EVA',start:'18:00',end:'20:00'});
 assert.deepEqual((await buildEngineInput(planId,storage)).planResourceItems,original.planResourceItems);
 for(const [start,end] of [['17:00','20:00'],[null,null],['16:00','21:00']]){
  await editWindow({...ctx,id:resource.id,name:'EVA',start,end});
  const current=(await read(`/api/plans/${planId}/resource-items`)).find((r:any)=>r.id===resource.id);
  assert.equal(current.availabilityStart,start);assert.equal(current.availabilityEnd,end);
 }
 save('macro-window-reconstructed',await buildEngineInput(planId,storage));
 await negatives({...ctx,id:resource.id,protectedDay:false,save:(n:string,v:any)=>save('macro-'+n,v)});
 const result=await finishDay({...ctx,phaseTasks:[...phaseTasks,...phaseB,...joint,last],phases,joint,label:'macro',peerIndex:1});
 await negatives({...ctx,id:resource.id,protectedDay:true,save:(n:string,v:any)=>save('macro-'+n,v)});
 const input=result.input,first=result.captures[0].result,proof=first.evidence.nominalPhysicalFutureWitness;
 assert.equal(input.tasks.length,65);assert.equal(first.proposal.length,8);
 assert.equal(proof.tasks.length,46);assert.equal(proof.participantMeals.length,19);
 const eva=input.planResourceItems.find((r:any)=>r.name==='EVA');assert.ok(eva);assert.equal(eva.availabilityStart,'16:00');assert.equal(eva.availabilityEnd,'21:00');
 const uses=proof.tasks.filter((t:any)=>(t.requiredResourceIds??[]).includes(`plan-resource:${eva.id}`));assert.equal(uses.length,5);assert.ok(uses.every((t:any)=>t.start>=960&&t.end<=1260));
 save('macro-eva',{source:'DAILY_SNAPSHOT',resource:eva,uses});
 return result;
}
