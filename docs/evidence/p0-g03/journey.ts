import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {writeFileSync} from 'node:fs';
import {buildEngineInput} from '../../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../../engine/planner-next/integration/engineInputAdapter';
import {requiredPhaseCompositionSupported,validateDailyTechnicalChains} from '../../../server/technicalChainStructure';
import {fixedItinerantCompositionSupported} from '../../../server/itinerantComposition';

/** All application writes originate in native Chromium controls. API/SQL below only read. */
export async function journey({appUrl,users,db,directory,pass}:any) {
 assert.equal(new URL(appUrl).hostname,'127.0.0.1');assert.equal(db.host,'127.0.0.1');
 const save=(n:string,v:unknown)=>writeFileSync(`${directory}/${n}.json`,JSON.stringify(v,null,2));
 const receipts:any[]=[],errors:string[]=[],semantic:any[]=[],networkEvents:any[]=[];
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium'});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(20000);
 page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>networkEvents.push({path:new URL(r.url()).pathname,method:r.method(),error:r.failure()?.errorText}));
 const pendingResponses=new Set<Promise<void>>();
 page.on('response',r=>{
  const path=new URL(r.url()).pathname,method=r.request().method();
  if(!path.startsWith('/api/')||method==='GET'||method==='OPTIONS')return;
  const pending=(async()=>{let response;try{response=await r.json();}catch{response=await r.text().catch(()=>null);}
   receipts.push({producer:'CHROMIUM_NATIVE',path,method,request:r.request().postDataJSON(),status:r.status(),response});save('ui-writes',receipts);})();
  pendingResponses.add(pending);void pending.finally(()=>pendingResponses.delete(pending));
 });
 const read=async(path:string)=>{const r=await fetch(appUrl+path,{headers:{Authorization:`Bearer ${users.admin.token}`}});assert.equal(r.status,200,await r.clone().text());return r.json() as Promise<any>;};
 const responseTo=async(path:string,method:string,action:()=>Promise<unknown>)=>{
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()===method);await action();const r=await pending;
  assert.ok(r.status()<300,`${path}: ${r.status()} ${await r.text()}`);return r.json();
 };
 const tab=async(name:RegExp)=>{await page.goto(appUrl+'/settings');await page.getByRole('tab',{name}).click();};
 const template=async(name:string,kind:string,spaceId:number|null,duration:number,deps:number[]=[],auto=false,physical:number[]=[])=>{
  await tab(/plantillas|templates/i);await page.getByRole('button',{name:'Create',exact:true}).click();const m=page.getByRole('dialog');
  await m.getByPlaceholder('Name',{exact:true}).fill(name);await m.getByLabel('Rol operativo Planner Next',{exact:true}).selectOption(kind);
  if(['main','vocal'].includes(kind))await m.getByText('Requiere el coach asignado al participante',{exact:true}).getByRole('checkbox').check();
  if(spaceId!=null)await m.getByLabel('Espacio de la plantilla',{exact:true}).selectOption(String(spaceId));
  await m.getByLabel('Plantillas previas',{exact:true}).selectOption(deps.map(String));await m.locator('input[type=number]').first().fill(String(duration));
  if(auto)await m.getByLabel('Auto-crear al crear concursante',{exact:true}).check();
  for(const id of physical){const e=m.getByTestId('template-specific-resources');await e.getByLabel('Recurso físico específico').selectOption(String(id));await e.getByRole('button',{name:'Añadir recurso',exact:true}).click();}
  const row=await responseTo('/api/task-templates','POST',()=>m.getByRole('button',{name:'Guardar',exact:true}).click());await m.waitFor({state:'hidden'});return row;
 };
 try {
  await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
  // Empty disposable catalogue; every identity below comes from an application response.
  await tab(/espacios|spaces/i);await page.getByRole('button',{name:'Crear nuevo plató',exact:true}).click();await page.getByPlaceholder('Ej. Plató 7').fill('G03 Producción');
  const zone=await responseTo('/api/zones','POST',()=>page.getByRole('button',{name:'Crear',exact:true}).click());
  const spaces:any={};
  for(const name of ['Estudio 7','Caracola Lucía','Caracola José María','Hall','Control','Buggy']){
   await page.getByRole('button',{name:'+ Espacio raíz',exact:true}).click();const m=page.getByRole('dialog');await m.getByLabel('Nombre del espacio',{exact:true}).fill(name);
   spaces[name]=await responseTo('/api/spaces','POST',()=>m.getByRole('button',{name:'Crear espacio',exact:true}).click());await m.waitFor({state:'hidden'});
  }
  const types:any={},items:any={};
  for(const [name,code] of [['Vocal Coach','vocal_coach'],['Equipo físico','g03_physical']]){
   await tab(/recursos|resources/i);await page.getByRole('button',{name:'Añadir tipo',exact:true}).click();await page.getByPlaceholder('Cámara',{exact:true}).fill(name);await page.getByPlaceholder('camera',{exact:true}).fill(code);
   types[code]=await responseTo('/api/resource-types','POST',()=>page.getByRole('button',{name:'Crear tipo',exact:true}).click());
  }
  for(const [name,typeName] of [['Lucía','Vocal Coach'],['José María','Vocal Coach'],['CAM3','Equipo físico'],['CAM4','Equipo físico'],['SON1','Equipo físico'],['SON2','Equipo físico'],['EVA','Equipo físico']]){
   await tab(/recursos|resources/i);await page.getByRole('button',{name:'Añadir unidad',exact:true}).click();const card=page.getByText('Añadir unidad (1 a 1)',{exact:true}).locator('..');
   await card.getByRole('combobox').click();await page.getByRole('option',{name:typeName,exact:true}).click();await page.getByPlaceholder('Cámara 1 / Eva / Lucía…').fill(name);
   items[name]=await responseTo('/api/resource-items','POST',()=>page.getByRole('button',{name:'Crear unidad',exact:true}).click());
  }
  pass('G03: empty catalogue identities created by UI');
  const teams:any={};
  for(const [name,members,transition] of [['A',['CAM3','SON1'],15],['B',['CAM4','SON2'],15],['C',['CAM3','CAM4','SON1'],0]] as const){
   await tab(/producción.*redacción|staff/i);const e=page.getByTestId('itinerant-compositions');await e.getByLabel('Código de equipo',{exact:true}).fill('g03-'+name.toLowerCase());await e.getByLabel('Nombre de equipo',{exact:true}).fill('Unidad '+name);
   for(const member of members)await e.getByLabel('Integrante '+member,{exact:true}).check();await e.getByLabel('Transición del equipo',{exact:true}).fill(String(transition));
   teams[name]=await responseTo('/api/itinerant-teams','POST',()=>e.getByRole('button',{name:'Crear composición',exact:true}).click());
  }
  pass('G03: native A/B/C compositions saved, unused A/B transitions 15 retained');
  const meal=await template('Sodexo','auxiliary',null,40,[],true);
  const feeders:any={},mains:any={};for(const coach of ['Lucía','José María']){
   feeders[coach]=await template('Prueba vocal - '+coach,'vocal',spaces['Caracola '+coach].id,15);
   mains[coach]=await template('Ensayo vocal - Estudio 7 · '+coach,'main',spaces['Estudio 7'].id,15,[feeders[coach].id]);
  }
  const macro:any={};for(const name of ['Reality Hall','Reality Control · Unidad C + EVA','Reality Buggy']){
   const space=name.startsWith('Reality Control')?'Control':name.slice(8);macro[name]=await template(name,'auxiliary',spaces[space].id,30,[],false,[items.EVA.id]);
   await tab(/plantillas|templates/i);const card=page.getByTestId(`task-template-${macro[name].id}`);await card.getByRole('button',{name:'Editar',exact:true}).click();await card.getByText('Requiere equipo itinerante',{exact:true}).getByRole('checkbox').check();await card.getByText('Unidad C',{exact:true}).getByRole('checkbox').check();
   await responseTo(`/api/ta/${macro[name].id}`,'PATCH',()=>card.getByRole('button',{name:'Guardar',exact:true}).click());
  }
  pass('G03: canonical task templates saved via UI');
  await tab(/general/i);await page.getByLabel('Inicio habitual',{exact:true}).fill('09:00');await page.getByLabel('Fin habitual',{exact:true}).fill('21:00');await page.locator('#default-meal-start').fill('13:00');await page.locator('#default-meal-end').fill('16:30');await page.locator('#contestant-meal-duration').fill('40');
  await page.locator('#default-meal-mode').click();await page.getByRole('option',{name:'Ventana flexible y comidas escalonadas',exact:true}).click();
  await page.locator('#meal-task-template').click();await page.getByRole('option',{name:'Sodexo',exact:true}).click();
  await responseTo('/api/program-settings','PATCH',()=>page.getByRole('button',{name:'Guardar',exact:true}).click());
  await page.getByLabel('Espacio del flujo principal',{exact:true}).selectOption(String(spaces['Estudio 7'].id));await page.getByLabel('Fin preferido del flujo principal',{exact:true}).fill('19:00');
  await responseTo('/api/new-day-planner-configuration','PUT',()=>page.getByRole('button',{name:'Guardar Planner para futuras jornadas',exact:true}).click());
  await page.goto(appUrl+'/plans');await page.getByRole('button',{name:'Crear día',exact:true}).click();let modal=page.getByRole('dialog');await modal.getByLabel('Fecha',{exact:true}).fill('2027-06-29');
  const day=await responseTo('/api/plans','POST',()=>modal.getByRole('button',{name:'Crear día',exact:true}).click());await modal.waitFor({state:'hidden'});const planId=Number(day.id);
  const openDay=async()=>{
   await page.goto(`${appUrl}/plans/${planId}?tab=tasks`);
   try{await page.getByLabel('Nombre del nuevo concursante').waitFor({timeout:15000});}
   catch(error){
    const retry=page.getByRole('button',{name:'Reintentar',exact:true});
    if(!await retry.isVisible())throw error;
    // One read-only recovery through the application's own error UI. Never retry a mutation.
    const checked=await read(`/api/plans/${planId}`);save('read-recovery',{planId:checked.id,networkEvents});
    await retry.click();await page.getByLabel('Nombre del nuevo concursante').waitFor();
   }
  };
  const participants:any={};const lucia=new Set([1,2,3,4,12,13,14,15]);
  for(let n=1;n<=19;n++){
   const code='C'+String(n).padStart(2,'0'),coach=lucia.has(n)?'Lucía':'José María';await openDay();
   await page.getByLabel('Nombre del nuevo concursante').fill(code);await page.getByRole('combobox',{name:'Vocal Coach del nuevo concursante',exact:true}).click();await page.getByRole('option',{name:coach,exact:true}).click();
   await page.getByText('Disponibilidad',{exact:true}).locator('..').getByRole('checkbox').check();await page.getByTitle('Hora inicio',{exact:true}).fill('09:00');await page.getByTitle('Hora fin',{exact:true}).fill(n===1?'15:30':'19:00');
   participants[code]=await responseTo(`/api/plans/${planId}/contestants`,'POST',()=>page.getByRole('button',{name:'Añadir',exact:true}).click());
  }
  pass('G03: new day and 19 canonical participant windows/coaches authored in Chromium');
  const addTask=async(code:string,t:any,family:string)=>{
   await openDay();await page.getByRole('button',{name:'Añadir tarea',exact:true}).first().click();const m=page.getByRole('dialog');
   await m.getByRole('combobox',{name:'Plantilla de tarea',exact:true}).click();await page.getByRole('option',{name:`${t.name} (${t.defaultDuration}min)`,exact:true}).click();
   const chooser=m.getByRole('combobox',{name:'Concursante (opcional)',exact:true});if(await chooser.count()){await chooser.click();await page.getByRole('option',{name:code,exact:true}).click();}
   const row=await responseTo('/api/daily-tasks','POST',()=>m.getByRole('button',{name:'Añadir tarea',exact:true}).click());await m.waitFor({state:'hidden'});semantic.push({participant:code,family,taskId:row.id,templateId:t.id});save('semantic-identities',semantic);return row;
  };
  for(let n=1;n<=19;n++){const code='C'+String(n).padStart(2,'0'),coach=lucia.has(n)?'Lucía':'José María';await addTask(code,feeders[coach],'Prueba vocal - '+coach);await addTask(code,mains[coach],'Ensayo vocal - Estudio 7');}
  const phaseTasks=[];for(const [code,family] of [['C06','Reality Hall'],['C12','Reality Control · Unidad C + EVA'],['C11','Reality Buggy']])phaseTasks.push(await addTask(code,macro[family],family));
  const {storage}=await import('../../../server/storage');const input=await buildEngineInput(planId,storage);save('engine-input',input);const adapter=adaptEngineInputToPlannerNextProblem(input);save('adapter',adapter);
  const view=await read(`/api/plans/${planId}/effective-configuration`);save('effective-configuration',view);
  const sql=(await db.query('SELECT id,template_id,contestant_id,status,start_planned,end_planned FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows;save('sql-tasks',sql);
  assert.equal(sql.length,60);assert.equal(input.tasks.length,60);assert.equal(input.mealMode,'flexible_meal_window');assert.ok(fixedItinerantCompositionSupported(input));assert.equal(requiredPhaseCompositionSupported(input),false);
  for(const t of input.tasks.filter(t=>t.templateId===meal.id))semantic.push({participant:Object.entries(participants).find(([,p]:any)=>p.id===t.contestantId)![0],family:'Sodexo',taskId:t.id,templateId:meal.id});save('semantic-identities',semantic);
  await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);const editor=page.getByTestId('daily-technical-chain');await editor.waitFor();
  assert.equal(await editor.getByRole('button',{name:'Crear cadena técnica',exact:true}).isDisabled(),true);assert.equal(view.technicalChains.supported,false);assert.equal(view.technicalChains.phasesSupported,false);
  await editor.screenshot({path:`${directory}/first-hard-frontier.png`});save('first-hard-frontier',{planId,taskCount:input.tasks.length,participants:19,control:'Crear cadena técnica',disabled:true,authority:view.technicalChains,mealMode:input.mealMode,remoteWrites:0});
  const policy={contractVersion:1 as const,policies:[{id:'g03-phase-a',orderedTaskIds:phaseTasks.map(t=>t.id),phases:[phaseTasks.map(t=>t.id)],adjacency:'REQUIRED' as const,resourceContinuity:'REQUIRED' as const,requiredResourceIds:[]}]};
  const counterfactuals=[];for(const mode of ['actual','only-global-meal-mode'] as const){const cloned=structuredClone(input);if(mode==='only-global-meal-mode')cloned.mealMode='global_hard_break';const before=JSON.stringify(cloned);let error:any=null;try{validateDailyTechnicalChains(cloned,policy);}catch(e:any){error={message:e.message,status:e.status};}
   counterfactuals.push({mode,guard:requiredPhaseCompositionSupported(cloned),error,mutated:before!==JSON.stringify(cloned)});
  }
  assert.match(counterfactuals[0].error?.message??'',/UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION/);assert.equal(counterfactuals[1].error,null);assert.equal(counterfactuals[1].guard,true);assert.ok(counterfactuals.every(c=>!c.mutated));save('counterfactuals',counterfactuals);
  let sqlRejection:any=null;await db.query('BEGIN READ ONLY');try{await db.query('SET LOCAL ROLE service_role');await db.query('SELECT public.assert_daily_technical_chains($1,$2::jsonb)',[planId,JSON.stringify(policy)]);}catch(e:any){sqlRejection={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  assert.match(sqlRejection?.message??'',/UNSUPPORTED_TECHNICAL_CHAIN_COMBINATION/);save('sql-readonly-rejection',{...sqlRejection,readOnly:true,policy});
  save('sql-authority',(await db.query("SELECT pg_get_functiondef('public.assert_daily_technical_chains(integer,jsonb)'::regprocedure) definition")).rows);
  save('sql-plan',(await db.query("SELECT to_jsonb(p) - 'created_at' - 'updated_at' AS snapshot FROM plans p WHERE id=$1",[planId])).rows);
  assert.equal(Number((await db.query('SELECT count(*) FROM assisted_planning_stages WHERE plan_id=$1 AND ordinal>0',[planId])).rows[0].count),0);
  save('identity-map',{planId,zone,spaces,types,items,teams,meal,feeders,mains,macro,participants});
  await page.screenshot({path:`${directory}/day-configuration.png`,fullPage:true});
  assert.deepEqual(errors,[]);assert.ok(sql.every((t:any)=>t.start_planned==null&&t.end_planned==null));
  pass('G03: native REQUIRED authoring disabled by meal mode; one-field in-memory counterfactual isolates cause');
  return {status:'HARD_FRONTIER',planId,participants:19,obligationsAuthored:60,canonicalObligations:266,stagesCreated:0,remoteWrites:0,apiApplicationWrites:0};
 } catch(e) {await page.screenshot({path:`${directory}/attempt-failure.png`,fullPage:true}).catch(()=>{});writeFileSync(`${directory}/attempt-dom.txt`,await page.locator('body').innerText().catch(()=>''));throw e;}
 finally {await Promise.allSettled([...pendingResponses]);save('ui-writes',receipts);save('browser-errors',errors);save('network-events',networkEvents);await browser.close();}
}
