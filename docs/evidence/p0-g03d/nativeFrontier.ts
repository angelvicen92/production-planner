import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {buildEngineInput} from '../../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem as adapt} from '../../../engine/planner-next/integration/engineInputAdapter';
import {jointCombinationSupported} from '../../../server/jointGroupStructure';
import {requiredPhaseCompositionSupported} from '../../../server/technicalChainStructure';

/** Native authoring only. SQL probes are read-only and introduce no authority. */
export async function frontier({appUrl,db,directory,pass,page,read,responseTo,save,planId,phaseTasks,phaseB,joint,last,users}:any){
 const {storage}=await import('../../../server/storage');
 const path=`/api/plans/${planId}/effective-configuration`,config=`/api/plans/${planId}/day-configuration`;
 const phases=[phaseTasks.map((t:any)=>t.id),phaseB.map((t:any)=>t.id),[joint[0].id,last.id]];
 const before=await buildEngineInput(planId,storage);save('native-before-input',before);
 assert.equal(before.tasks.length,65);assert.equal(adapt(before).status,'SUPPORTED');
 await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);let view=await read(path);
 const editor=page.getByTestId('daily-technical-chain');
 assert.equal(view.technicalChains.phasesSupported,true);
 await editor.getByRole('button',{name:'Crear cadena técnica',exact:true}).click();await editor.getByLabel('Orden por fases',{exact:true}).check();
 for(let p=0;p<phases.length;p++){
  if(p)await editor.getByRole('button',{name:'Añadir fase',exact:true}).click();
  for(const id of phases[p])await editor.getByLabel(`Fase ${p+1}: ${view.technicalChains.tasks.find((t:any)=>t.id===id).label}`,{exact:true}).check();
 }
 save('native-phase-save',await responseTo(config,'PUT',()=>editor.getByRole('button',{name:'Guardar cadena técnica',exact:true}).click()));
 await page.reload();view=await read(path);save('native-effective',view);
 const jointEditor=page.getByTestId('daily-joint-groups');
 assert.equal(view.jointGroups.supported,false);
 assert.equal(await jointEditor.getByRole('button',{name:'Crear operación conjunta',exact:true}).isEnabled(),false);
 await jointEditor.screenshot({path:directory+'/joint-frontier.png'});
 const input=await buildEngineInput(planId,storage);save('native-input',input);
 assert.equal(jointCombinationSupported(input),false);assert.equal(requiredPhaseCompositionSupported(input),true);
 const structure={contractVersion:1,groups:[{id:'probe-joint',taskIds:joint.map((t:any)=>t.id)}]};
 let error:any;await db.query('BEGIN READ ONLY');
 try{await db.query('SELECT public.assert_daily_joint_groups($1,$2)',[planId,structure]);}
 catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
 assert.equal(error?.code,'P0001');save('native-sql-readonly-rejection',{structure,error,readOnly:true,authorityInserted:false});
 const eva=input.planResourceItems.find(r=>r.name==='EVA')!;
 assert.equal(eva.availabilityStart,'16:00');assert.equal(eva.availabilityEnd,'21:00');save('native-snapshot',eva);
 // Editing the global catalogue after day creation cannot rewrite the snapshot.
 await editWindow({page,appUrl,responseTo,globalId:eva.resourceItemId,name:'EVA',start:'18:00',end:'20:00'});
 assert.deepEqual(JSON.parse(JSON.stringify((await storage.getPlanResourceItemsForPlan(planId)).find(r=>r.id===eva.id))),JSON.parse(JSON.stringify(eva)));
 await page.getByRole('tab',{name:/recursos|resources/i}).click();await page.locator('button[title="Expandir todos"]:visible').click();await page.getByTestId(`global-resource-${eva.resourceItemId}`).getByRole('button',{name:'Horario de EVA: 18:00–20:00',exact:true}).waitFor();
 await page.screenshot({path:directory+'/global-window-reloaded.png',fullPage:true});
 const beforeRow=(await db.query('SELECT to_jsonb(r) row FROM plan_resource_items r WHERE id=$1',[eva.id])).rows[0].row;
 await editWindow({page,appUrl,responseTo,planId,id:eva.id,name:'EVA',start:'17:00',end:'20:00'});
 await page.reload();save('native-daily-override',(await read(`/api/plans/${planId}/resource-items`)).find((r:any)=>r.id===eva.id));
 await editWindow({page,appUrl,responseTo,planId,id:eva.id,name:'EVA',start:null,end:null});
 save('native-full-workday',(await storage.getPlanResourceItemsForPlan(planId)).find(r=>r.id===eva.id));
 await editWindow({page,appUrl,responseTo,planId,id:eva.id,name:'EVA',start:'16:00',end:'21:00'});
 // Ad hoc creation shares the control; its boolean activation remains independent.
 await page.goto(`${appUrl}/plans/${planId}?tab=resources`);const add=page.getByTestId('day-resources');
 for(const button of await add.locator('button[data-day-section-trigger]').all())if(await button.getAttribute('aria-expanded')==='false')await button.click();
 await add.getByRole('combobox',{name:'Tipo de recurso del día',exact:true}).click();await page.getByRole('option',{name:'Equipo físico',exact:true}).click();
 await add.getByLabel('Nombre del recurso del día',{exact:true}).fill('Micro de apoyo');
 const fields=add.locator('fieldset');await fields.getByLabel('Jornada completa',{exact:true}).uncheck();await fields.getByLabel('Inicio de disponibilidad',{exact:true}).fill('10:30');await fields.getByLabel('Fin de disponibilidad',{exact:true}).fill('17:30');
 const adhoc=await responseTo(`/api/plans/${planId}/resource-items`,'POST',()=>add.getByRole('button',{name:'Añadir',exact:true}).click());
 await page.reload();for(const button of await add.locator('button[data-day-section-trigger]').all())if(await button.getAttribute('aria-expanded')==='false')await button.click();
 await responseTo(`/api/plans/${planId}/resource-items/${adhoc.id}`,'PATCH',()=>page.getByTestId(`daily-resource-${adhoc.id}`).getByRole('checkbox').uncheck());
 await editWindow({page,appUrl,responseTo,planId,id:adhoc.id,name:'Micro de apoyo',start:'11:00',end:'18:00'});
 const savedAdhoc=(await read(`/api/plans/${planId}/resource-items`)).find((r:any)=>r.id===adhoc.id);assert.equal(savedAdhoc.isAvailable,false);assert.equal(savedAdhoc.resourceItemId,null);save('adhoc-inactive-window',savedAdhoc);
 const assistedPath=`/api/plans/${planId}/assisted`;
 const bootstrap=await fetch(appUrl+assistedPath+'/session',{method:'POST',headers:{Authorization:`Bearer ${users.admin.token}`}});assert.equal(bootstrap.status,200,await bootstrap.text());
 // A clean S0 reuses the same revision/source transition, without replacing its session.
 const s0=await read(assistedPath);save('native-s0-before',s0);
 await editWindow({page,appUrl,responseTo,planId,id:eva.id,name:'EVA',start:'16:15',end:'21:00'});
 await editWindow({page,appUrl,responseTo,planId,id:eva.id,name:'EVA',start:'16:00',end:'21:00'});
 const s1=await read(assistedPath);assert.ok(s0.session.id);assert.equal(s0.session.id,s1.session.id);assert.deepEqual(s0.activeStage,s1.activeStage);save('native-s0-after',s1);
 await page.getByTestId(`daily-resource-${eva.id}`).getByRole('button',{name:'Horario de EVA: 16:00–21:00',exact:true}).waitFor();await page.getByTestId(`daily-resource-${eva.id}`).screenshot({path:directory+'/native-eva-window.png'});
 const final=await buildEngineInput(planId,storage);save('native-input',final);const adapter=adapt(final);save('native-adapter',adapter);assert.equal(adapter.status,'SUPPORTED');
 const afterRow=(await db.query('SELECT to_jsonb(r) row FROM plan_resource_items r WHERE id=$1',[eva.id])).rows[0].row;assert.deepEqual(beforeRow,afterRow);
 save('native-resource-preservation',{before:beforeRow,after:afterRow});
 await negatives({appUrl,users,db,read,save,planId,id:eva.id,protectedDay:false});
 save('native-sql-state',{resources:(await db.query('SELECT id,name,availability_start,availability_end FROM plan_resource_items WHERE plan_id=$1 ORDER BY id',[planId])).rows});
 pass('native EVA global → independent snapshot → override → full workday → reload → clean S0 transition → adapter');
 return {planId,obligations:65,phases:phases.map(p=>p.length),jointAuthoritySaved:false,newAcceptedStages:0,eva:{id:eva.id,start:'16:00',end:'21:00'}};
}

export async function editWindow({page,appUrl,responseTo,planId,id,globalId,name,start,end}:any){
 if(globalId){await page.goto(appUrl+'/settings');await page.getByRole('tab',{name:/recursos|resources/i}).click();await page.locator('button[title="Expandir todos"]:visible').click();}
 else {await page.goto(`${appUrl}/plans/${planId}?tab=resources`);const daily=page.getByTestId('day-resources');await daily.waitFor();for(const button of await daily.locator('button[data-day-section-trigger]').all())if(await button.getAttribute('aria-expanded')==='false')await button.click();}
 const row=page.getByTestId(globalId?`global-resource-${globalId}`:`daily-resource-${id}`);
 await row.getByRole('button',{name:new RegExp('^Horario de '+name+':')}).click();const dialog=page.getByRole('dialog');
 if(start===null)await dialog.getByLabel('Jornada completa',{exact:true}).check();
 else {await dialog.getByLabel('Jornada completa',{exact:true}).uncheck();await dialog.getByLabel('Inicio de disponibilidad',{exact:true}).fill(start);await dialog.getByLabel('Fin de disponibilidad',{exact:true}).fill(end);}
 const saved=await responseTo(globalId?`/api/resource-items/${globalId}`:`/api/plans/${planId}/resource-items/${id}`,'PATCH',()=>dialog.getByRole('button',{name:'Guardar horario',exact:true}).click());
 await dialog.waitFor({state:'hidden'});await page.reload();return saved;
}

export async function negatives({appUrl,users,db,read,save,planId,id,protectedDay}:any){
 const receipts:any[]=[];const url=`/api/plans/${planId}/resource-items/${id}`;
 const state=await read(`/api/plans/${planId}/day-configuration/refresh`);
 const payload={availabilityStart:'20:00',availabilityEnd:'20:05',expectedRevisionId:state.revisionId};
 const send=async(path:string,body:any,expected:number,role='admin')=>{const r=await fetch(appUrl+path,{method:'PATCH',headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${users[role].token}`})},body:JSON.stringify(body)});const result={path,body,status:r.status,result:await r.json(),role};receipts.push(result);assert.equal(r.status,expected,JSON.stringify(result));};
 for(const role of ['viewer','aux','norole','anonymous'])await send(url,payload,role==='anonymous'?401:403,role);
 for(const body of [{...payload,availabilityEnd:undefined},{...payload,availabilityStart:'24:00'},{...payload,availabilityStart:'21:00'},{...payload,availabilityStart:null}])await send(url,body,400);
 await send(url,{...payload,expectedRevisionId:1},409);
 if(protectedDay){
  const before=(await db.query('SELECT to_jsonb(r) row FROM plan_resource_items r WHERE id=$1',[id])).rows[0].row;
  await send(url,payload,409);await send(url,payload,409,'production');
  assert.deepEqual((await db.query('SELECT to_jsonb(r) row FROM plan_resource_items r WHERE id=$1',[id])).rows[0].row,before);
 }
 else await send(`/api/plans/${planId}/resource-items/999999`,payload,404);
 for(const role of ['service_role','postgres']){let error:any;await db.query('BEGIN');try{if(role==='service_role')await db.query('SET LOCAL ROLE service_role');await db.query("UPDATE plan_resource_items SET availability_start='20:00',availability_end='20:05' WHERE id=$1",[id]);}catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}assert.ok(error);receipts.push({role,directSQL:error});}
 save(protectedDay?'protected-window-negatives':'window-negatives',receipts);
}
