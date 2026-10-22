/** U04a: real app/catalog/new-day snapshots, local Auth/PostgREST and Chromium. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import type pg from 'pg';
import { api } from '../../shared/routes';
import { buildEngineInput } from '../../engine/buildInput';
import { storage } from '../../server/storage';
import { adaptEngineInputToPlannerNextProblem } from '../../engine/planner-next/integration/engineInputAdapter';
import { createSupportedEngineInputAdapterFixture } from '../../engine/planner-next/integration/engineInputAdapter.fixture';
import { materializeItinerantUnitAssignment } from '../../engine/planner-next/itinerantUnitAssignment';
import { canPlaceTask } from '../../engine/planner-next/placement';
import { validatePlan } from '../../engine/planner-next/validate';
import { applyDailyItinerantComposition } from '../../server/itinerantComposition';

type User={id:string;email:string;password:string;token:string};
export async function runItinerantCompositionJourney({appUrl,url,anon,db,users,directory,pass}: {
 appUrl:string;url:string;anon:string;service:string;db:pg.Client;users:Record<string,User>;directory:string;pass:(name:string)=>void;transport:any[];
}) {
 for(const endpoint of [appUrl,url])assert.equal(new URL(endpoint).hostname,'127.0.0.1');
 const report:any={checks:[],denials:[],snapshots:[],planner:{},remoteWrites:0};
 const save=()=>writeFileSync(`${directory}/itinerant-composition.json`,JSON.stringify(report,null,2));
 const check=(name:string)=>{report.checks.push(name);pass(name);save();};
 const request=async(path:string,method='GET',body?:unknown,role='admin')=>{
   const response=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${role==='invalid'?'invalid':users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});
   return {status:response.status,body:await response.json() as any};
 };
 const historical=async()=>{
   const result:Record<string,unknown>={};
   for(const table of ['plans','daily_tasks','plan_resource_items','plan_task_template_snapshots','assisted_planning_stages','plan_config_revisions'])
     result[table]=(await db.query(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) hash FROM public.${table} t WHERE ${table==='plans'?'id':'plan_id'} IN (26999,27001,27002)`)).rows[0].hash;
   return result;
 };
 const before=await historical();report.historicalBefore=before;
 const types=await request('/api/resource-types-with-items');assert.equal(types.status,200);
 const typeId=Number(types.body[0].id);
 const members:any[]=[];
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 report.browserErrors=[];page.on('pageerror',error=>{report.browserErrors.push(error.message);save();});
 try {
   await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);
   await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
   await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
   await page.goto(appUrl+'/settings');
   await page.getByRole('tab',{name:/recursos|resources/i}).click();
   const resourceSection=page.getByTestId('settings-section-resources');
   for(const name of ['CAM_A','CAM_B','SON_1']) {
     await resourceSection.getByRole('button',{name:'Añadir unidad',exact:true}).click();
     const itemForm=resourceSection.locator('.bg-card').filter({has:page.getByText('Añadir unidad (1 a 1)',{exact:true})}).last();
     await itemForm.getByRole('combobox').click();await page.getByRole('option',{name:types.body[0].name,exact:true}).click();
     await itemForm.getByRole('textbox').fill(name);
     const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/resource-items'&&r.request().method()==='POST');
     await itemForm.getByRole('button',{name:'Crear unidad',exact:true}).click();const response=await created;
     assert.equal(response.status(),200);members.push(await response.json());
   }
   report.browserTabs={url:page.url(),labels:await page.getByRole('tab').allTextContents()};save();
   await page.locator('[role=tab][aria-controls$="-content-staff"]').click();
   const section=page.getByTestId('settings-section-teams');
   if(!await page.getByTestId('itinerant-compositions').isVisible())await section.locator('h3 > button').first().click();
   const editor=page.getByTestId('itinerant-compositions');await editor.waitFor();
   const teams:any[]=[];
   for(const [index,ids] of [[0,[0]],[1,[1]],[2,[0,2]]] as [number,number[]][]) {
     await editor.getByLabel('Código de equipo',{exact:true}).fill(`U04_${index}`);
     await editor.getByLabel('Nombre de equipo',{exact:true}).fill(`Equipo ${['A','B','C'][index]}`);
     for(const id of ids)await editor.getByRole('checkbox',{name:`Integrante ${members[id].name}`,exact:true}).check();
     const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/itinerant-teams'&&r.request().method()==='POST');
     await editor.getByRole('button',{name:'Crear composición',exact:true}).click();const created=await response;assert.equal(created.status(),201,await created.text());teams.push(await created.json());
     await editor.getByText('Composición guardada para nuevas jornadas.',{exact:true}).waitFor();
   }
   await page.reload();await page.locator('[role=tab][aria-controls$="-content-staff"]').click();if(!await editor.isVisible())await section.locator('h3 > button').first().click();
   await editor.getByText('Comparte CAM_A con Equipo C.',{exact:false}).waitFor();
   await editor.screenshot({path:`${directory}/u04a-catalog.png`});report.teams=teams;report.resources=members;
   check('U04a real catalog UI creates A/B/C from existing physical resources and shows shared CAM_A after reload');

   const value={code:'DENIED',name:'Denied',resourceItemIds:[members[0].id],availabilityWindows:null,transitionMinutes:0,isActive:true,orderIndex:0};
   for(const role of ['production','aux','viewer','norole','anonymous','invalid']) {
     const denied=await request('/api/itinerant-teams','POST',value,role);
     assert.equal(denied.status,['anonymous','invalid'].includes(role)?401:403);report.denials.push({role,status:denied.status});
     assert.equal((await request(`/API/ITINERANT-TEAMS/${teams[0].id}/`,'DELETE',undefined,role)).status,['anonymous','invalid'].includes(role)?401:403);
   }
   const path=`/api/itinerant-teams/${teams[0].id}`;
   const {id,revision,...base}=teams[0];
   await editor.getByRole('button',{name:'Editar Equipo A',exact:true}).click();
   await editor.getByLabel('Transición del equipo',{exact:true}).fill('0');
   const updated=page.waitForResponse(r=>new URL(r.url()).pathname===path&&r.request().method()==='PUT');
   await editor.getByRole('button',{name:'Guardar composición',exact:true}).click();const edited=await updated;assert.equal(edited.status(),200,await edited.text());
   assert.equal((await edited.json()).transitionMinutes,0);
   assert.equal((await request(path,'PUT',{...base,expectedRevision:revision,name:'Stale'})).status,409);
   for(const patch of [{resourceItemIds:[]},{resourceItemIds:[members[0].id,members[0].id]},{resourceItemIds:[2147483647]},{transitionMinutes:-1},{availabilityWindows:[{start:'21:00',end:'09:00'}]}])
     assert.equal((await request('/api/itinerant-teams','POST',{...value,...patch})).status,400);
   for(const object of ['itinerant_teams','itinerant_team_members','plan_itinerant_unit_snapshots'])for(const role of ['anon','authenticated']) {
     const grants=(await db.query("SELECT has_table_privilege($1,$2,'INSERT') OR has_table_privilege($1,$2,'UPDATE') OR has_table_privilege($1,$2,'DELETE') allowed",[role,object])).rows[0];assert.equal(grants.allowed,false);
   }
   for(const fn of ['save_itinerant_composition(bigint,uuid,integer,jsonb)','snapshot_plan_itinerant_units(integer,uuid)'])for(const role of ['anon','authenticated'])
     assert.equal((await db.query('SELECT has_function_privilege($1,$2,\'EXECUTE\') allowed',[role,fn])).rows[0].allowed,false);
   // Both requests carry the same revision: one atomic winner, one conflict.
   const racing=(await request('/api/itinerant-teams')).body.find((team:any)=>team.id===teams[1].id);
   const {id:racingId,revision:racingRevision,...racingValue}=racing;
   const concurrent=await Promise.all(['first','second'].map(suffix=>request(`/api/itinerant-teams/${racingId}`,'PUT',{...racingValue,name:`Equipo B ${suffix}`,expectedRevision:racingRevision})));
   assert.deepEqual(concurrent.map(result=>result.status).sort(),[200,409]);report.concurrentSaves=concurrent.map(result=>result.status);
   const afterRace=(await request('/api/itinerant-teams')).body.find((team:any)=>team.id===racingId);
   assert.equal((await request(`/api/itinerant-teams/${racingId}`,'PUT',{...racingValue,expectedRevision:afterRace.revision})).status,200);
   const rows=async()=>(await db.query('SELECT to_jsonb(t) team,(SELECT jsonb_agg(to_jsonb(m) ORDER BY resource_item_id) FROM itinerant_team_members m WHERE m.team_id=t.id) members FROM itinerant_teams t ORDER BY id')).rows;
   const beforeLateFailure=await rows();
   await db.query("CREATE FUNCTION pg_temp.u04a_fail_member() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'u04a late failure'; END $$; CREATE TRIGGER u04a_fail_member BEFORE INSERT ON public.itinerant_team_members FOR EACH ROW EXECUTE FUNCTION pg_temp.u04a_fail_member()");
   try {
     const current=(await request('/api/itinerant-teams')).body.find((team:any)=>team.id===teams[0].id);const {id,revision,...value}=current;
     assert.equal((await request(path,'PUT',{...value,resourceItemIds:[members[1].id],expectedRevision:revision})).status,500);
     assert.deepEqual(await rows(),beforeLateFailure);
   } finally {await db.query('DROP TRIGGER u04a_fail_member ON public.itinerant_team_members');}
   check('U04a ADMIN-only API, RLS/grants, validation and stale catalog save fail closed');

   const warmup=await request('/api/plans','POST',{date:'2026-12-07',configuration:{workday:{intent:'INHERIT'},meal:{intent:'INHERIT'},participantTransition:{intent:'INHERIT'}}},'production');
   assert.equal(warmup.status,201,JSON.stringify(warmup));const warmupPlanId=Number(warmup.body.id);
   await page.getByRole('tab',{name:/plantillas|templates/i}).click();
   const templates:any[]=[];
   for(const [name,allowed] of [['U04a alternativa',[teams[0].id,teams[1].id]],['U04a obligatoria',[teams[2].id]]] as [string,number[]][]) {
     await page.getByRole('button',{name:'Create',exact:true}).click();
     const dialog=page.getByRole('dialog');await dialog.getByPlaceholder('Name',{exact:true}).fill(name);
     const created=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/task-templates'&&r.request().method()==='POST');
     await dialog.getByRole('button',{name:'Guardar',exact:true}).click();const response=await created;assert.equal(response.status(),201);const template=await response.json();
     const card=page.locator('.bg-card').filter({has:page.getByText(name,{exact:true})}).last();
     await card.getByRole('button',{name:'Editar',exact:true}).click();
     const editing=page.locator('.bg-card').filter({has:page.getByRole('button',{name:'Cancelar',exact:true})}).last();
     await editing.getByLabel('Rol operativo Planner Next',{exact:true}).selectOption('technical');
     await editing.getByRole('checkbox',{name:'Requiere equipo itinerante',exact:true}).check();
     for(const team of teams.filter(team=>allowed.includes(team.id)))await editing.getByRole('checkbox',{name:team.name,exact:true}).check();
     const saved=page.waitForResponse(r=>new URL(r.url()).pathname===api.taskTemplates.update.path.replace(':id',String(template.id))&&r.request().method()==='PATCH');
     await editing.getByRole('button',{name:'Guardar',exact:true}).click();const update=await saved;assert.equal(update.status(),200);const updated=await update.json();
     report.combinedTemplateEdit={role:updated.rulesJson?.plannerNextOperation,allowed:updated.rulesJson?.itinerantTeamAllowedIds};
     assert.equal(updated.rulesJson?.plannerNextOperation?.kind,'technical','the same UI save preserves the edited Next role and itinerant alternatives');
     assert.deepEqual(updated.rulesJson.itinerantTeamAllowedIds,allowed);
     templates.push(updated);
   }
   await page.screenshot({path:`${directory}/u04a-templates.png`,fullPage:true});
   assert.equal(templates[0].itinerantTeamRequirement,'any');assert.equal(templates[1].itinerantTeamRequirement,'specific');report.templates=templates;
   const day=await request('/api/plans','POST',{date:'2026-12-08',configuration:{workday:{intent:'INHERIT'},meal:{intent:'INHERIT'},participantTransition:{intent:'INHERIT'}}},'production');
   assert.equal(day.status,201,JSON.stringify(day));const planId=Number(day.body.id);report.planId=planId;
   for(const template of templates) {
     const task=await request('/api/daily-tasks','POST',{planId,templateId:template.id});assert.equal(task.status,201,JSON.stringify(task));
   }
   const input=await buildEngineInput(planId,storage);
   const snapshots=await storage.getPlanItinerantUnitSnapshots(planId) as any[];report.snapshots=snapshots;
   const local=(team:any)=>snapshots.find(unit=>unit.source_team_id===team.id)!;
   assert.ok(teams.every(team=>local(team).id!==team.id),"daily identities must be resolved through the stored map even when their values differ");
   assert.deepEqual(input.tasks.find(task=>task.templateId===templates[0].id)!.allowedItinerantTeamIds,[local(teams[0]).id,local(teams[1]).id]);
   assert.equal(input.tasks.find(task=>task.templateId===templates[1].id)!.itinerantTeamId,local(teams[2]).id);
   assert.equal(local(teams[0]).members[0].planResourceItemId,local(teams[2]).members.find((m:any)=>m.resourceItemId===members[0].id).planResourceItemId);
   await page.goto(`${appUrl}/plans/${planId}?tab=configuration`);await page.getByTestId('daily-itinerant-compositions').waitFor();
   await page.getByTestId('daily-itinerant-compositions').screenshot({path:`${directory}/u04a-day.png`});
   check('U04a template UI alternatives/specific persist through snapshots and explicit daily mappings in a new application-created day');

   // Isolate composition under explicit non-itinerant controls. New generic
   // days do not acquire unrelated main-flow/classification policies implicitly.
   const controls=createSupportedEngineInputAdapterFixture();
   const generic={...controls,planId:input.planId,planResourceItems:input.planResourceItems,itinerantCompositionSnapshot:input.itinerantCompositionSnapshot,plannerNext:controls.plannerNext,workDay:controls.workDay,mealMode:controls.mealMode,meal:controls.meal,
     planZoneSettings:controls.planZoneSettings,planSpaceSettings:[...controls.planSpaceSettings!,{spaceId:304,zoneId:403,availabilityStart:null,availabilityEnd:null}],spaceResourceAssignments:{},zoneResourceAssignments:{},
     spaceResourceTypeRequirements:{},zoneResourceTypeRequirements:{},vocalCoachPlanResourceItemIdByContestantId:{},locks:[],
     tasks:input.tasks.filter(task=>templates.some(template=>template.id===task.templateId)).map((task,index)=>({...task,
       plannerNextKind:'technical' as const,operationalRole:'productive_task' as const,spaceId:index===0?303:304,zoneId:403,contestantId:null,
       camerasOverride:0,resourceRequirements:null,dependsOnTaskIds:[],assignedResourceIds:[],declaredResourceIds:[]})),
     itinerantTeamAvailability:input.itinerantTeamAvailability!.map(unit=>({...unit,windows:[controls.workDay]})),
   };
   const adapted=adaptEngineInputToPlannerNextProblem(generic);assert.equal(adapted.status,'SUPPORTED',adapted.status==='UNSUPPORTED'?JSON.stringify(adapted.issues):'');
   if(adapted.status!=='SUPPORTED')throw Error('unsupported');const problem=adapted.problem;
   const [first,second]=problem.tasks;
   const a=materializeItinerantUnitAssignment(problem,first,`itinerant-team:${local(teams[0]).id}`)!;
   const b=materializeItinerantUnitAssignment(problem,first,`itinerant-team:${local(teams[1]).id}`)!;
   const c=materializeItinerantUnitAssignment(problem,second,`itinerant-team:${local(teams[2]).id}`)!;
   const parallelB={...b,id:'probe-b',spaceId:second.spaceId};
   const at=600,placed={...a,start:at,end:at+a.duration};
   assert.equal(canPlaceTask(problem,parallelB,at,[placed]),true);assert.equal(canPlaceTask(problem,c,at,[placed]),false);
   assert.equal(materializeItinerantUnitAssignment(problem,first,c.itinerantUnitId!),null);
   assert.equal(validatePlan({...problem,tasks:[a,c]},[placed,{...c,start:at,end:at+c.duration}]).hardValid,false);
   report.planner={status:'SUPPORTED',sourceFingerprint:adapted.sourceFingerprint,problemFingerprint:adapted.problemFingerprint,AplusB:true,AplusC:false,forbiddenChoiceRejected:true,aResources:a.requiredResourceIds,cResources:c.requiredResourceIds,nonItinerantControls:'explicit synthetic control; not a complete new-day solver certificate'};
   assert.throws(()=>applyDailyItinerantComposition({...input,tasks:[{...input.tasks[0],itinerantTeamRequirement:'specific',itinerantTeamId:2147483647}]},snapshots,planId),/correspondencia/);
   const snapshotBefore=await storage.getPlanItinerantUnitSnapshots(planId);
   const live=(await request('/api/itinerant-teams')).body.find((team:any)=>team.id===teams[0].id);const {id:liveId,revision:liveRevision,...liveValue}=live;
   assert.equal((await request(path,'PUT',{...liveValue,name:'Equipo A revisado',resourceItemIds:[members[1].id],expectedRevision:liveRevision})).status,200);
   assert.deepEqual(await storage.getPlanItinerantUnitSnapshots(planId),snapshotBefore);
   assert.deepEqual(await buildEngineInput(planId,storage),input);
   await assert.rejects(()=>db.query("UPDATE public.plans SET itinerant_composition_version=NULL WHERE id=$1",[planId]),/IMMUTABLE/);
   await assert.rejects(()=>db.query("UPDATE public.plan_itinerant_unit_snapshots SET name='changed' WHERE plan_id=$1",[planId]),/IMMUTABLE/);
   assert.equal((await request(path,'DELETE')).status,409);
   const revisionRow=(await db.query('SELECT identity_json,replay_snapshot_json FROM plan_config_revisions WHERE plan_id=$1 ORDER BY id LIMIT 1',[planId])).rows[0];
   assert.ok(revisionRow);assert.deepEqual(revisionRow.replay_snapshot_json.authorities.plan_workday[0].itinerantComposition.units,snapshotBefore);report.revision=revisionRow;
   assert.deepEqual(await historical(),before);report.historicalAfter=await historical();
   check('U04a physical exclusivity, forbidden choices, immutable snapshots/replay and historical identity preservation');
   const rpcDenied=await fetch(`${url}/rest/v1/rpc/save_itinerant_composition`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${users.admin.token}`,'Content-Type':'application/json'},body:JSON.stringify({p_id:null,p_actor:users.admin.id,p_expected_revision:null,p_value:value})});assert.ok([401,403,404].includes(rpcDenied.status));
   // Remove only rows created by this disposable rehearsal. This restores the
   // shared harness's literal resource-catalog baseline after recording Evidence.
   await db.query('DELETE FROM public.daily_tasks WHERE plan_id=$1',[planId]);
   await db.query('DELETE FROM public.plans WHERE id=ANY($1::integer[])',[[planId,warmupPlanId]]);
   await db.query('DELETE FROM public.task_templates WHERE id=ANY($1::bigint[])',[templates.map(template=>template.id)]);
   await db.query('DELETE FROM public.itinerant_teams WHERE id=ANY($1::bigint[])',[teams.map(team=>team.id)]);
   await db.query('DELETE FROM public.resource_items WHERE id=ANY($1::bigint[])',[members.map(member=>member.id)]);
   report.disposableCleanup=true;assert.deepEqual(await historical(),before);
   save();return report;
 } catch(error) {await page.screenshot({path:`${directory}/u04a-failure.png`,fullPage:true});writeFileSync(`${directory}/u04a-failure.txt`,await page.locator('body').innerText());throw error;} finally {await browser.close();}
}
