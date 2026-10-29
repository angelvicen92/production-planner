import assert from 'node:assert/strict';
import {author} from './frontier';
import {finishDay} from './finish';

export async function genericDay(ctx:any){
 const {page,appUrl,tab,template,spaces,feeders,mains,meal,responseTo,read,save}=ctx;
 await tab(/recursos|resources/i);await page.getByRole('button',{name:'Añadir unidad',exact:true}).click();
 const card=page.getByText('Añadir unidad (1 a 1)',{exact:true}).locator('..');
 await card.getByRole('combobox').click();await page.getByRole('option',{name:'Equipo físico',exact:true}).click();
 await page.getByPlaceholder('Cámara 1 / Eva / Lucía…').fill('Sensor móvil');
 await card.getByLabel('Jornada completa',{exact:true}).uncheck();await card.getByLabel('Inicio de disponibilidad',{exact:true}).fill('10:00');await card.getByLabel('Fin de disponibilidad',{exact:true}).fill('15:00');
 const sensor=await responseTo('/api/resource-items','POST',()=>card.getByRole('button',{name:'Crear unidad',exact:true}).click());
 const templates=[];
 for(const [i,duration] of [10,15,20,10].entries())templates.push(await template('Inspección '+(i+1),'auxiliary',spaces[['Hall','Control','Buggy','Alfombra Roja'][i]].id,duration,[],false,[sensor.id]));
 await tab(/general/i);await page.locator('#contestant-meal-capacity').fill('2');await responseTo('/api/program-settings','PATCH',()=>page.getByRole('button',{name:'Guardar',exact:true}).click());
 await page.goto(appUrl+'/plans',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Crear día',exact:true}).click();const modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill('2027-06-30');
 const day=await responseTo('/api/plans','POST',()=>modal.getByRole('button',{name:'Crear día',exact:true}).click());await modal.waitFor({state:'hidden'});const planId=Number(day.id);
 const dailySensor=(await read(`/api/plans/${planId}/resource-items`)).find((r:any)=>r.resourceItemId===sensor.id);save('generic-snapshot',dailySensor);
 assert.equal(dailySensor.availabilityStart,'10:00');assert.equal(dailySensor.availabilityEnd,'15:00');
 const {editWindow}=await import('../p0-g03d/nativeFrontier');
 await editWindow({...ctx,planId,id:dailySensor.id,name:'Sensor móvil',start:'09:30',end:'15:30'});
 const open=()=>page.goto(`${appUrl}/plans/${planId}?tab=tasks`,{waitUntil:'networkidle'});
 const add=async(name:string,t:any)=>{
  await open();await page.getByRole('button',{name:'Añadir tarea',exact:true}).first().click();const m=page.getByRole('dialog');
  await m.getByRole('combobox',{name:'Plantilla de tarea',exact:true}).click();await page.getByRole('option',{name:`${t.name} (${t.defaultDuration}min)`,exact:true}).click();
  await m.getByRole('combobox',{name:'Concursante (opcional)',exact:true}).click();await page.getByRole('option',{name,exact:true}).click();
  const task=await responseTo('/api/daily-tasks','POST',()=>m.getByRole('button',{name:'Añadir tarea',exact:true}).click());await m.waitFor({state:'hidden'});return task;
 };
 for(let i=0;i<4;i++){
  const name='Operador '+(i+1),coach=i%2?'José María':'Lucía';await open();await page.getByLabel('Nombre del nuevo concursante').fill(name);
  await page.getByRole('combobox',{name:'Vocal Coach del nuevo concursante',exact:true}).click();await page.getByRole('option',{name:coach,exact:true}).click();
  await page.getByText('Disponibilidad',{exact:true}).locator('..').getByRole('checkbox').check();await page.getByTitle('Hora inicio',{exact:true}).fill('09:00');await page.getByTitle('Hora fin',{exact:true}).fill('19:00');
  await responseTo(`/api/plans/${planId}/contestants`,'POST',()=>page.getByRole('button',{name:'Añadir',exact:true}).click());
  await add(name,feeders[coach]);await add(name,mains[coach]);
 }
 const joint=[await add('Operador 1',templates[0]),await add('Operador 2',templates[0])];
 const b=await add('Operador 3',templates[1]),c=await add('Operador 1',templates[2]),rival=await add('Operador 4',templates[3]);
 const phases=[[joint[0].id],[b.id],[c.id]];await author({...ctx,planId,phases,joint,label:'generic'});
 const result=await finishDay({...ctx,planId,phaseTasks:[...joint,b,c],phases,joint,label:'generic',peerIndex:0});
 assert.equal(result.input.tasks.length,17);save('generic-competitor',{id:rival.id,resourceId:dailySensor.id});return result;
}
