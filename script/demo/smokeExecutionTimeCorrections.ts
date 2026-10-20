/** P2B: real Auth -> product HTTP -> PostgREST -> native PostgreSQL.
 * Invoked only by smokeA2Integration's owned loopback stack, never a remote DB.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { chromium, type Page } from 'playwright';
import { executionDuration, formatExecutionDuration } from '../../shared/execution';
import { projectControlRoom } from '../../client/src/lib/control-room-metrics';
import { madridWallTime } from '../../client/src/lib/execution-time-correction';

type User = { id: string; token: string; email: string; password: string };
export async function runExecutionTimeCorrections({appUrl,url,anon,users,db,planId,directory,pass}:{
 appUrl:string;url:string;anon:string;users:Record<string,User>;db:pg.Client;planId:number;directory:string;pass:(name:string)=>void;
}) {
 assert.equal(db.host,'127.0.0.1');assert.equal(new URL(url).hostname,'127.0.0.1');
 const request=async(role:string,path:string,method='GET',body?:unknown)=>{
  const r=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(role==='anon'?{}:{Authorization:`Bearer ${users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});
  return {status:r.status,body:await r.json() as any};
 };
 const material=async()=>(await db.query(`SELECT (SELECT jsonb_agg(t ORDER BY id) FROM daily_tasks t) tasks,
  (SELECT jsonb_agg(e ORDER BY id) FROM task_status_events e) events,(SELECT jsonb_agg(l ORDER BY id) FROM locks l) locks`)).rows;
 const planning=async()=>(await db.query(`SELECT
  (SELECT jsonb_agg(to_jsonb(t)-ARRAY['status','start_real','end_real','start_real_seconds','end_real_seconds','start_real_at','end_real_at','paused_at','paused_at_hhmm','paused_at_seconds','paused_total_seconds','execution_clock_mode','execution_clock_revision','execution_version'] ORDER BY id) FROM daily_tasks t) tasks,
  (SELECT jsonb_agg(t ORDER BY id) FROM assisted_planning_stages t) stages,
  (SELECT jsonb_agg(t ORDER BY id) FROM assisted_planning_sessions t) sessions,
  (SELECT jsonb_agg(t ORDER BY id) FROM plans t) plans`)).rows;
 const before=await planning();assert.equal(before[0].tasks.filter((t:any)=>t.plan_id===planId).length,266);
 const tasks=(await db.query('SELECT DISTINCT ON(space_id) id,space_id,zone_id FROM daily_tasks WHERE plan_id=$1 AND space_id IS NOT NULL AND zone_id IS NOT NULL ORDER BY space_id,id',[planId])).rows;
 const [a,b,c]=tasks;assert.ok(a&&b&&c);
 const staff=(await db.query("INSERT INTO staff_people(name,role_type) VALUES('P2B nominal Production','production') RETURNING id")).rows[0];
 await db.query("INSERT INTO user_entity_links(user_id,entity_type,entity_id) VALUES($1,'staff_person',$2)",[users.aux.id,staff.id]);
 for(const t of [a,b]) {
  await db.query("INSERT INTO plan_zone_staff_mode(plan_id,zone_id,mode) VALUES($1,$2,'space') ON CONFLICT(plan_id,zone_id) DO UPDATE SET mode='space'",[planId,t.zone_id]);
  await db.query("INSERT INTO plan_staff_assignments(plan_id,staff_role,staff_person_id,scope_type,space_id) VALUES($1,'production',$2,'space',$3)",[planId,staff.id,t.space_id]);
 }
 assert.equal((await request('admin','/api/program-settings','PATCH',{clockMode:'manual',simulatedTime:'12:00'})).status,200);
 const version=async(t=a)=>(await db.query('SELECT execution_version FROM daily_tasks WHERE id=$1',[t.id])).rows[0].execution_version;
 const current=async(t=a)=>(await db.query('SELECT * FROM daily_tasks WHERE id=$1',[t.id])).rows[0];
 const status=async(value:string,expectedVersion:number,t=a,role='aux')=>request(role,`/api/tasks/${t.id}/status`,'PATCH',{status:value,expectedVersion,expectedStatus:(await current(t)).status});
 const correction=(field:string,realAt:string,expectedVersion:number,t=a,role='aux',extra={})=>request(role,`/api/tasks/${t.id}/real-time`,'PATCH',{field,realAt,expectedVersion,reason:'Registro tardío',...extra});
 const iso=(value:any,seconds:number)=>new Date(new Date(value).getTime()+seconds*1000).toISOString();
 const outcomes:{name:string;status:number}[]=[];
 const deny=async(name:string,action:()=>Promise<{status:number}>,expected=403)=>{
  const before=await material(),r=await action();assert.equal(r.status,expected,name);assert.deepEqual(await material(),before,name+' has no writes');outcomes.push({name,status:r.status});
 };
 assert.equal((await status('in_progress',0)).status,200);
 const start=await current();
 const locks=(await db.query('SELECT * FROM locks WHERE task_id=$1 ORDER BY id',[a.id])).rows;
 const earlier=iso(start.start_real_at,-120);
 for(const role of ['anon','norole','viewer']) await deny(role+' correction',()=>correction('start',earlier,1,a,role),role==='anon'?401:403);
 await deny('another space',()=>correction('start',earlier,0,c));
 const other=(await db.query('SELECT id FROM daily_tasks WHERE plan_id<>$1 LIMIT 1',[planId])).rows[0];assert.ok(other);
 await deny('another plan',()=>correction('start',earlier,0,other));
 await db.query("UPDATE plan_staff_assignments SET staff_role='editorial' WHERE staff_person_id=$1",[staff.id]);
 await deny('editorial only',()=>correction('start',earlier,1));
 await db.query("UPDATE plan_staff_assignments SET staff_role='production' WHERE staff_person_id=$1",[staff.id]);
 for(const extra of [{reason:' '},{expectedVersion:undefined},{p_actor:users.admin.id},{realAt:'12:00'}]) await deny('invalid HTTP '+JSON.stringify(Object.keys(extra)),()=>correction('start',earlier,1,a,'aux',extra),400);
 await deny('future instant',()=>correction('start',iso(start.start_real_at,3600),1),409);
 await deny('wrong day',()=>correction('start',iso(start.start_real_at,-86400),1),409);
 const first=await correction('start',earlier,1);assert.equal(first.status,200);assert.equal(first.body.executionVersion,2);
 await deny('stale correction',()=>correction('start',iso(start.start_real_at,-180),1),409);
 await deny('stale Finish after correction',()=>status('done',1),409);
 assert.equal((await correction('start',iso(start.start_real_at,-180),2)).status,200);
 // Native race correction vs Finish. Both observe version 3; exactly one commits.
 const race=await Promise.all([correction('start',iso(start.start_real_at,-240),3),status('done',3)]);
 assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
 if((await current()).status==='in_progress')assert.equal((await status('done',await version())).status,200);
 const finished=await current();
 assert.equal((await correction('end',iso(finished.end_real_at,-30),await version())).status,200);
 assert.deepEqual((await db.query('SELECT * FROM locks WHERE task_id=$1 ORDER BY id',[a.id])).rows,locks);
 // Two helpers correcting the same version must never overwrite each other.
 const observed=await version();
 const race2=await Promise.all([correction('start',iso(start.start_real_at,-300),observed),correction('start',iso(start.start_real_at,-360),observed,a,'production')]);
 assert.deepEqual(race2.map(r=>r.status).sort(),[200,409]);
 const history=await request('aux',`/api/tasks/${a.id}/execution-history`);assert.equal(history.status,200);
 const events=history.body.events;const corrections=events.filter((e:any)=>e.event_kind==='time_correction');
 assert.ok(corrections.length>=4);assert.equal(events.filter((e:any)=>e.event_kind==='transition').length,2);
 assert.equal(events[0].changed_by,users.aux.id);assert.equal(Date.parse(events[0].task_snapshot.start_real_at),new Date(start.start_real_at).getTime());
 assert.ok(corrections.every((e:any)=>e.old_value&&e.new_value&&e.reason&&e.created_at&&e.previous_snapshot&&e.task_snapshot&&e.previous_status===e.status));
 pass('P2B native Start/end, successive terminal corrections, complete original audit and correction/Finish races');
 // Rollback of task+version+event after an audit write failure.
 await db.query("CREATE FUNCTION p2b_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_kind='time_correction' THEN RAISE EXCEPTION 'P2B injected failure'; END IF;RETURN NEW;END;$$;CREATE TRIGGER p2b_fail BEFORE INSERT ON task_status_events FOR EACH ROW EXECUTE FUNCTION p2b_fail();");
 try{await deny('audit rollback',()=>correction('start',iso(start.start_real_at,-400),observed+1),503);}
 finally{await db.query('DROP TRIGGER p2b_fail ON task_status_events;DROP FUNCTION p2b_fail();');}
 // Revoke G0 after HTTP precheck while the RPC is queued at the real plan lock.
 const blocker=new pg.Client((db as any).connectionParameters);await blocker.connect();
 await blocker.query('BEGIN');await blocker.query('SELECT 1 FROM plans WHERE id=$1 FOR UPDATE',[planId]);
 const saved=await material();const pending=correction('start',iso(start.start_real_at,-420),await version());
 try {
  const deadline=Date.now()+15000;
  while(!(await db.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%correct_task_execution_time%' AND pid<>pg_backend_pid()")).rows.length) {
   assert.ok(Date.now()<deadline,'correction reached native plan lock');await new Promise(r=>setTimeout(r,25));
  }
  await db.query("UPDATE plan_staff_assignments SET staff_role='editorial' WHERE staff_person_id=$1",[staff.id]);
  await blocker.query('COMMIT');assert.equal((await pending).status,403);assert.deepEqual(await material(),saved);
 } finally{await blocker.query('ROLLBACK');await blocker.end();}
 const revokedVersion=await version();
 await deny('revoked assignment',()=>correction('start',iso(start.start_real_at,-430),revokedVersion));
 await db.query("UPDATE plan_staff_assignments SET staff_role='production' WHERE staff_person_id=$1",[staff.id]);
 // Second independent scope: pause facts cannot be crossed or edited.
 assert.equal((await status('in_progress',0,b)).status,200);const bstart=await current(b);
 assert.equal((await correction('start',iso(bstart.start_real_at,-60),1,b)).status,200);
 assert.equal((await status('interrupted',2,b)).status,200);const paused=await current(b);
 await deny('start beyond pause',()=>correction('start',iso(paused.paused_at,1),3,b),409);
 assert.equal((await status('in_progress',3,b)).status,200);assert.equal((await status('done',4,b)).status,200);
 await deny('end before resume',()=>correction('end',iso(paused.paused_at,-1),5,b),409);
 for(const rpc of ['correct_task_execution_time','execute_task_transition']) {
  const saved=await material();const r=await fetch(`${url}/rest/v1/rpc/${rpc}`,{method:'POST',headers:{apikey:anon,Authorization:`Bearer ${users.aux.token}`,'Content-Type':'application/json'},body:JSON.stringify({p_task_id:a.id,p_actor:users.admin.id,p_field:'start',p_real_at:earlier,p_reason:'forged',p_expected_version:await version()})});
  assert.ok(r.status>=400);assert.deepEqual(await material(),saved);
 }
 pass('P2B native G0 multiple scopes, denials/revocation under lock, pause chronology and complete rollback');
 const reread=await request('aux',`/api/plans/${planId}/tasks`);assert.equal(reread.status,200);
 const task=reread.body.find((t:any)=>Number(t.id)===Number(a.id));assert.ok(task);
 const context=(await request('aux',`/api/plans/${planId}/execution`)).body;
 const plan=(await request('production',`/api/plans/${planId}`)).body;
 const projected=projectControlRoom({plan,execution:{...context,role:'production'},nowMs:Date.parse(context.clock.operationalAt),incidents:[]});
 const metric=projected.tasks.find(t=>Number(t.id)===Number(a.id))!;
 const duration=executionDuration(task,Date.parse(context.clock.operationalAt),context.clock);
 assert.equal(metric.activeSeconds,duration);assert.equal(metric.realStart,Date.parse(task.startRealAt));assert.equal(metric.realEnd,Date.parse(task.endRealAt));
 assert.ok(metric.durationDeltaSeconds!==null);
 // Existing pages, real sessions and real data, reloaded after correction.
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
 const errors:string[]=[];
 const uiWrites:any[]=[];
 const login=async(page:Page,role:string)=>{
  page.setDefaultNavigationTimeout(120000); // Cold Vite builds the full application.
  page.on('pageerror',e=>errors.push(e.message));await page.goto(appUrl+'/login');
  await page.getByLabel('Email',{exact:true}).fill(users[role].email);await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users[role].password);
  await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
 };
 try {
  const operator=await browser.newPage({viewport:{width:820,height:1180},timezoneId:'America/New_York'});
  const observer=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'Europe/Madrid'});
  await login(operator,'aux');await login(observer,'production');
  await operator.goto(`${appUrl}/my-day?plan=${planId}`);await operator.reload();
  // Choose through the existing UI after loading identities/preferences, so an
  // initial default-day redirect cannot race the requested replay selection.
  await operator.getByRole('combobox',{name:'Seleccionar jornada',exact:true}).click();
  const label=new Intl.DateTimeFormat('es-ES',{dateStyle:'full',timeZone:'Europe/Madrid'}).format(new Date(`${plan.date}T12:00:00Z`));
  await operator.getByRole('option',{name:label,exact:true}).click();
  const information=operator.getByTestId(`activity-information-${a.id}`);await information.waitFor({state:'attached'});
  assert.ok((await information.textContent())?.includes(task.startReal));assert.ok((await information.textContent())?.includes(task.endReal));
  assert.equal(await information.getByTestId('execution-timer').textContent(),formatExecutionDuration(duration));
  await observer.goto(`${appUrl}/plans/${planId}/control-room`);await observer.reload();
  await observer.locator('#control-plan').selectOption(String(planId));
  await observer.getByText('Inspección detallada por plató y espacio', { exact: true }).click();
  const activity=observer.getByTestId(`control-room-activity-${a.id}`);await activity.waitFor({state:'attached'});
  assert.ok((await activity.textContent())?.includes(task.startReal));assert.ok((await activity.textContent())?.includes(task.endReal));
  assert.ok((await activity.textContent())?.includes(formatExecutionDuration(duration)));
  // Existing Start/Finish controls must still submit the observed version,
  // without editing either view component or obtaining a fresh server version.
  const pendingTask=reread.body.find((t:any)=>t.status==='pending'&&t.spaceId===Number(a.space_id));assert.ok(pendingTask);
  const agenda=operator.getByTestId(`agenda-task-${pendingTask.id}`);
  const startResponse=operator.waitForResponse(r=>r.url().endsWith(`/api/tasks/${pendingTask.id}/status`)&&r.request().method()==='PATCH');
  await agenda.getByRole('button',{name:/^Iniciar /}).click();
  const startHttp=await startResponse;assert.equal(startHttp.status(),200);assert.equal(startHttp.request().postDataJSON().expectedVersion,pendingTask.executionVersion);
  const openCorrection=async(page:Page)=>{
   await page.getByTestId(`agenda-task-${pendingTask.id}`).getByRole('button',{name:'Corregir hora',exact:true}).click();
   await page.getByRole('dialog').waitFor();
  };
  const prepareCorrection=async(page:Page,field:'start'|'end',at:string,reason:string)=>{
   const dialog=page.getByRole('dialog');await dialog.getByLabel('Hora que quieres corregir').selectOption(field);
   await dialog.getByLabel('Nueva hora real (con segundos)').fill(madridWallTime(at).slice(11));await dialog.getByLabel('Motivo obligatorio').fill(reason);
  };
  const confirmCorrection=async(page:Page,expectedVersion:number,expectedStatus=200)=>{
   const observedLocks=(await db.query('SELECT * FROM locks ORDER BY id')).rows;
   const response=page.waitForResponse(r=>r.url().endsWith(`/api/tasks/${pendingTask.id}/real-time`)&&r.request().method()==='PATCH');
   await page.getByRole('dialog').getByRole('button',{name:'Confirmar rectificación',exact:true}).click();
   const http=await response;assert.equal(http.status(),expectedStatus);const body=http.request().postDataJSON();assert.equal(body.expectedVersion,expectedVersion);uiWrites.push({body,status:http.status()});
   assert.deepEqual((await db.query('SELECT * FROM locks ORDER BY id')).rows,observedLocks);
   if(expectedStatus===200)await page.getByRole('dialog').waitFor({state:'hidden'});
  };
  const uiStart=await current(pendingTask);
  await operator.setViewportSize({width:390,height:844});
  await openCorrection(operator);assert.equal(await operator.getByRole('dialog').locator('option[value="end"]').count(),0);
  await operator.getByRole('dialog').getByLabel('Motivo obligatorio').fill('No redondear fracciones del servidor');
  assert.equal(await operator.getByRole('dialog').getByRole('button',{name:'Confirmar rectificación',exact:true}).isDisabled(),true);
  await prepareCorrection(operator,'start',iso(uiStart.start_real_at,-60),'Inicio registrado un minuto tarde desde Mi Día');
  assert.ok(await operator.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await operator.screenshot({path:directory+'/p3-correction-mobile.png'});
  await confirmCorrection(operator,pendingTask.executionVersion+1);
  const finishResponse=operator.waitForResponse(r=>r.url().endsWith(`/api/tasks/${pendingTask.id}/status`)&&r.request().method()==='PATCH');
  await agenda.getByRole('button',{name:/^Finalizar /}).click();
  const finishHttp=await finishResponse;assert.equal(finishHttp.status(),200);assert.equal(finishHttp.request().postDataJSON().expectedVersion,pendingTask.executionVersion+2);
  const uiFinish=await current(pendingTask);
  // Nominal authority survives completion in both scopes. canExecute currently
  // also reflects planning readiness, so it is not a status/eligibility test.
  const terminalContext=(await request('aux',`/api/plans/${planId}/execution`)).body.tasks.find((t:any)=>t.taskId===pendingTask.id);
  assert.equal(uiFinish.status,'done');assert.equal(terminalContext.hasAuthority,true);
  const secondScope=(await request('aux',`/api/plans/${planId}/execution`)).body.tasks.find((t:any)=>t.taskId===Number(b.id));
  assert.equal((await current(b)).status,'done');assert.equal(secondScope.hasAuthority,true);
  assert.equal(await operator.getByTestId(`agenda-task-${b.id}`).getByRole('button',{name:'Corregir hora',exact:true}).count(),1);
  await openCorrection(operator);await prepareCorrection(operator,'start',iso(uiStart.start_real_at,-120),'Rectificación del inicio de actividad completada');await confirmCorrection(operator,uiFinish.execution_version);
  await openCorrection(operator);await prepareCorrection(operator,'end',iso(uiFinish.end_real_at,-5),'Fin registrado cinco segundos tarde');await confirmCorrection(operator,uiFinish.execution_version+1);
  // Two independent browsers open the same observed version. HTTP polling may
  // update the page underneath, but cannot silently replace either form snapshot.
  await observer.goto(`${appUrl}/my-day?plan=${planId}`);
  await observer.getByRole('combobox',{name:'Seleccionar jornada',exact:true}).click();await observer.getByRole('option',{name:label,exact:true}).click();
  const concurrentVersion=await version(pendingTask);
  await openCorrection(operator);await openCorrection(observer);
  await prepareCorrection(observer,'start',iso(uiStart.start_real_at,-150),'Otra sesión corrige primero');await confirmCorrection(observer,concurrentVersion);
  await prepareCorrection(operator,'start',iso(uiStart.start_real_at,-170),'Formulario que observó la versión anterior');await confirmCorrection(operator,concurrentVersion,409);
  await operator.getByRole('dialog').getByRole('alert').filter({hasText:'El registro ha cambiado'}).waitFor();
  await operator.getByRole('dialog').getByRole('button',{name:'Usar datos actuales',exact:true}).click();
  await prepareCorrection(operator,'start',iso(uiStart.start_real_at,-180),'Revisión explícita después del conflicto');await confirmCorrection(operator,concurrentVersion+1);
  await operator.reload();await operator.getByTestId(`agenda-task-${pendingTask.id}`).waitFor();await operator.setViewportSize({width:820,height:1180});await openCorrection(operator);
  const historyResponse=operator.waitForResponse(r=>r.url().endsWith(`/api/tasks/${pendingTask.id}/execution-history`));await operator.getByRole('button',{name:'Ver historial',exact:true}).click();assert.equal((await historyResponse).status(),200);
  const uiEvents=(await db.query('SELECT * FROM task_status_events WHERE task_id=$1 ORDER BY id',[pendingTask.id])).rows;
  assert.equal(uiEvents.filter(e=>e.event_kind==='transition').length,2);assert.equal(uiEvents.filter(e=>e.event_kind==='time_correction').length,5);
  await operator.getByTestId(`time-correction-event-${uiEvents.at(-1).id}`).waitFor();assert.equal(await operator.locator('[data-testid^="time-correction-event-"]').count(),5);
  assert.ok(await operator.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await operator.screenshot({path:directory+'/p3-history-tablet.png'});
  await operator.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();
  const finalUiTask=(await request('aux',`/api/plans/${planId}/tasks`)).body.find((t:any)=>t.id===pendingTask.id);
  const uiInformation=operator.getByTestId(`activity-information-${pendingTask.id}`);
  const uiDuration=executionDuration(finalUiTask,Date.parse(context.clock.operationalAt),context.clock);
  assert.equal(await uiInformation.getByTestId('execution-timer').textContent(),formatExecutionDuration(uiDuration));
  await observer.goto(`${appUrl}/plans/${planId}/control-room`);await observer.reload();await observer.locator('#control-plan').selectOption(String(planId));
  await observer.getByText('Inspección detallada por plató y espacio', { exact: true }).click();
  const uiControl=observer.getByTestId(`control-room-activity-${pendingTask.id}`);await uiControl.waitFor();assert.ok((await uiControl.textContent())?.includes(formatExecutionDuration(uiDuration)));
  assert.ok((await uiControl.textContent())?.includes(finalUiTask.startReal));assert.ok((await uiControl.textContent())?.includes(finalUiTask.endReal));
  pass('P3 native UI: running start, terminal start/end, five immutable corrections, two-browser 409 with observed version, explicit recovery and reload/history/Control Room concordance');
  await information.scrollIntoViewIfNeeded();await activity.scrollIntoViewIfNeeded();
  await operator.screenshot({path:directory+'/p2b-my-day.png'});await observer.screenshot({path:directory+'/p2b-control-room.png'});
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
 assert.deepEqual(await planning(),before);
 assert.deepEqual((await db.query('SELECT * FROM locks WHERE task_id=$1 ORDER BY id',[a.id])).rows,locks);
 pass('P2B real Mi Día and Control Room reload corrected timestamps/duration; all 266 placements, Stages and locks preserved');
 return {outcomes,correctionFinishRace:race.map(r=>r.status).sort(),correctionRace:race2.map(r=>r.status).sort(),corrections:corrections.length,
  uiWrites,durationSeconds:duration,readViews:['Mi Día','Control Room'],acceptedTaskCount:266,planningSha256:createHash('sha256').update(JSON.stringify(before)).digest('hex'),preservedPlanning:true,newSolverRun:false,remoteWrites:0};
}
