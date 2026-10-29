import assert from 'node:assert/strict';
import {chromium} from 'playwright';
export async function journey({appUrl,users,pass}:any){
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium'});
 const page=await browser.newPage();page.setDefaultTimeout(20000);
 const responseTo=async(path:string,method:string,action:()=>Promise<any>)=>{const pending=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()===method);await action();const r=await pending;assert.ok(r.status()<300,await r.text());return r.json();};
 try{
 await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
 await page.goto(appUrl+'/settings');await page.getByRole('tab',{name:/recursos|resources/i}).click();await page.getByRole('button',{name:'Añadir tipo',exact:true}).click();await page.getByPlaceholder('Cámara',{exact:true}).fill('Equipo');await page.getByPlaceholder('camera',{exact:true}).fill('equipo');await responseTo('/api/resource-types','POST',()=>page.getByRole('button',{name:'Crear tipo',exact:true}).click());
 await page.getByRole('button',{name:'Añadir unidad',exact:true}).click();const card=page.getByText('Añadir unidad (1 a 1)',{exact:true}).locator('..');await card.getByRole('combobox').click();await page.getByRole('option',{name:'Equipo',exact:true}).click();await page.getByPlaceholder('Cámara 1 / Eva / Lucía…').fill('Equipo 1');await card.getByLabel('Jornada completa',{exact:true}).uncheck();await card.getByLabel('Inicio de disponibilidad',{exact:true}).fill('16:00');await card.getByLabel('Fin de disponibilidad',{exact:true}).fill('21:00');await responseTo('/api/resource-items','POST',()=>card.getByRole('button',{name:'Crear unidad',exact:true}).click());
 await page.getByRole('tab',{name:/general/i}).click();await page.getByLabel('Perfil de la jornada',{exact:true}).selectOption('STANDALONE_ONLY');await responseTo('/api/new-day-planner-configuration','PUT',()=>page.getByRole('button',{name:'Guardar Planner para futuras jornadas',exact:true}).click());
 await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();const m=page.getByRole('dialog');await m.getByLabel('Fecha',{exact:true}).fill('2027-07-03');const day=await responseTo('/api/plans','POST',()=>m.getByRole('button',{name:'Crear día',exact:true}).click());
 const {editWindow}=await import('./nativeFrontier');await editWindow({page,appUrl,responseTo,planId:day.id,id:1,name:'Equipo 1',start:'17:00',end:'20:00'});
 const bootstrap=await fetch(appUrl+`/api/plans/${day.id}/assisted/session`,{method:'POST',headers:{Authorization:`Bearer ${users.admin.token}`}});assert.equal(bootstrap.status,200,await bootstrap.text());
 await editWindow({page,appUrl,responseTo,planId:day.id,id:1,name:'Equipo 1',start:'18:00',end:'20:00'});
 pass('smoke native resource window CAS transaction and clean S0 transition');return {status:'PASS'};
 }finally{await browser.close();}
}
