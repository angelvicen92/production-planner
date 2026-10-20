/** Disposable native PostgreSQL -> PostgREST -> Auth -> product HTTP -> Chromium. */
import assert from 'node:assert/strict';
import pg from 'pg';
import { chromium } from 'playwright';

type User = { id: string; token: string; email: string; password: string };
export async function runBulkExecutionReset({ appUrl, url, users, db, planId, directory, pass }: {
  appUrl: string; url: string; users: Record<string,User>; db: pg.Client; planId: number; directory: string; pass: (name: string) => void;
}) {
  assert.equal(db.host,'127.0.0.1'); assert.equal(new URL(url).hostname,'127.0.0.1');
  const path = `/api/plans/${planId}/execution/reset`;
  const request = async (role: string | null, endpoint: string, method='GET', body?: unknown) => {
    const response = await fetch(appUrl+endpoint,{method,headers:{'Content-Type':'application/json',...(role?{Authorization:`Bearer ${users[role].token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    return { status:response.status,body:await response.json() as any };
  };
  const snapshot = async () => (await db.query('SELECT id::float8 AS id,status,execution_version AS "executionVersion" FROM daily_tasks WHERE plan_id=$1 ORDER BY id',[planId])).rows;
  const material = async () => (await db.query(`SELECT
    (SELECT jsonb_agg(t ORDER BY id) FROM daily_tasks t) tasks,
    (SELECT jsonb_agg(t ORDER BY id) FROM task_status_events t) events,
    (SELECT jsonb_agg(t ORDER BY id) FROM locks t) locks`)).rows[0];
  const planning = async () => {
    const result: Record<string,unknown> = {};
    const tables = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE '%config%' OR tablename LIKE 'assisted_planning_%' OR tablename IN ('plans','plan_resource_items','plan_staff_assignments','plan_space_resource_assignments','plan_zone_resource_assignments')) ORDER BY tablename")).rows;
    for (const {tablename} of tables) result[tablename] = (await db.query(`SELECT coalesce(jsonb_agg(row ORDER BY row::text),'[]') rows FROM (SELECT to_jsonb(t) row FROM public."${tablename}" t) q`)).rows[0].rows;
    result.tasks = (await db.query(`SELECT jsonb_agg(to_jsonb(t)-ARRAY['status','start_real','end_real','start_real_seconds','end_real_seconds','start_real_at','end_real_at','paused_at','paused_at_hhmm','paused_at_seconds','paused_total_seconds','execution_clock_mode','execution_clock_revision','execution_version'] ORDER BY id) rows FROM daily_tasks t`)).rows[0].rows;
    return result;
  };
  const transition = async (id: number, status: string) => {
    const task = (await db.query('SELECT * FROM daily_tasks WHERE id=$1',[id])).rows[0];
    const result = await request('production',`/api/tasks/${id}/status`,'PATCH',{status,expectedStatus:task.status,expectedVersion:task.execution_version});
    assert.equal(result.status,200,JSON.stringify(result));
  };
  assert.equal((await request('admin','/api/program-settings','PATCH',{clockMode:'manual',simulatedTime:'10:00'})).status,200);
  const candidates = (await db.query("SELECT id,contestant_id,space_id FROM daily_tasks WHERE plan_id=$1 AND status='pending' AND space_id IS NOT NULL AND contestant_id IS NOT NULL ORDER BY id",[planId])).rows;
  const a = candidates[0], b = candidates.find(t=>t.space_id!==a.space_id&&t.contestant_id!==a.contestant_id);
  assert.ok(a&&b);
  const c = candidates.find(t=>t.id!==a.id&&t.id!==b.id)!;
  const d = candidates.find(t=>![a.id,b.id,c.id].includes(t.id))!;
  await transition(a.id,'in_progress'); await transition(a.id,'done');
  await transition(b.id,'in_progress'); await transition(b.id,'interrupted');
  await transition(c.id,'cancelled'); await transition(d.id,'in_progress');
  await db.query("INSERT INTO locks(plan_id,task_id,lock_type,created_by,reason) VALUES($1,$2,'time',$3,'Administrative rehearsal: manual lock')",[planId,a.id,users.admin.id]);
  const protectedPlanning = await planning();
  const expectedTasks = await snapshot(), before = await material();
  assert.equal(expectedTasks.length,266);
  assert.deepEqual([...new Set(expectedTasks.map(t=>t.status))].sort(),['cancelled','done','in_progress','interrupted','pending']);
  for (const role of [null,'norole','viewer','aux','production']) {
    const result = await request(role,path,'POST',{expectedTasks});
    assert.equal(result.status,role===null?401:403);
    assert.deepEqual(await material(),before);
  }
  for (const role of ['production','aux','viewer','norole']) {
    await assert.rejects(()=>db.query('SELECT reset_plan_execution($1,$2,$3)',[planId,users[role].id,JSON.stringify(expectedTasks)]),/EXECUTION_FORBIDDEN/);
  }
  for (const role of ['anon','authenticated']) {
    await db.query(`SET ROLE ${role}`);
    await assert.rejects(()=>db.query('SELECT reset_plan_execution($1,$2,$3)',[planId,users.admin.id,JSON.stringify(expectedTasks)]),/permission denied/);
    await db.query('RESET ROLE');
  }
  assert.deepEqual(await material(),before);
  pass('bulk reset: native ADMIN check, API 401/403 role matrix and service_role-only RPC ACL; no denied writes');

  // Fail at the last non-pending task, after earlier nested resets have run.
  const lastId = Math.max(a.id,b.id,c.id,d.id);
  await db.query(`CREATE FUNCTION fail_bulk_reset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.task_id=${lastId} AND NEW.event_kind='reset' THEN RAISE EXCEPTION 'Injected late reset failure'; END IF;
    RETURN NEW; END; $$; CREATE TRIGGER fail_bulk_reset BEFORE INSERT ON task_status_events FOR EACH ROW EXECUTE FUNCTION fail_bulk_reset();`);
  const failed = await request('admin',path,'POST',{expectedTasks});
  assert.equal(failed.status,503,JSON.stringify(failed));
  assert.deepEqual(await material(),before);
  await db.query('DROP TRIGGER fail_bulk_reset ON task_status_events; DROP FUNCTION fail_bulk_reset()');
  pass('bulk reset: native late failure rolls back all earlier tasks, versions, reset events and lock removals through real API');

  const blocker = new pg.Client({host:db.host,port:db.port,user:db.user,password:(db as any).password,database:db.database}); await blocker.connect();
  try {
    await blocker.query('BEGIN'); await blocker.query('SELECT id FROM plans WHERE id=$1 FOR UPDATE',[planId]);
    const pending = request('admin',path,'POST',{expectedTasks});
    try {
      const deadline = Date.now()+10_000;
      while (!(await db.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%reset_plan_execution%' AND pid<>pg_backend_pid()")).rowCount) {
        assert.ok(Date.now()<deadline,'bulk reset reaches the plan lock'); await new Promise(r=>setTimeout(r,50));
      }
      const originalStart = (await blocker.query('SELECT start_real_at FROM daily_tasks WHERE id=$1',[a.id])).rows[0].start_real_at;
      await blocker.query("SELECT correct_task_execution_time($1,$2,'start',$3,'Concurrent correction',(SELECT execution_version FROM daily_tasks WHERE id=$1))",[a.id,users.admin.id,new Date(originalStart.getTime()-5000).toISOString()]);
      await blocker.query('COMMIT');
      const afterCorrection = await material();
      assert.equal((await pending).status,409); assert.deepEqual(await material(),afterCorrection);
    } finally { await blocker.query('ROLLBACK'); await pending; }
  } finally { await blocker.end(); }
  pass('bulk reset: two native sessions serialize; post-lock version revalidation rejects the stale whole-day confirmation without partial changes');

  const browser = await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
  const errors: string[] = [];
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',error=>errors.push(error.message));
  const login = async (role: string) => {
    await page.goto(appUrl+'/login');
    await page.getByLabel('Email',{exact:true}).fill(users[role].email);
    await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users[role].password);
    await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click(); await page.waitForURL('**/dashboard');
    await page.goto(`${appUrl}/plans/${planId}?tab=execution`); await page.getByTestId('day-execution').waitFor();
  };
  const resetButton = page.getByRole('button',{name:'Resetear toda la ejecución',exact:true});
  try {
    await login('production');
    await page.getByTestId(`day-execution-task-${a.id}`).waitFor(); assert.equal(await resetButton.count(),0);
    await page.context().clearCookies(); await page.evaluate(()=>localStorage.clear());
    await login('admin'); await resetButton.waitFor();
    await page.getByRole('textbox',{name:'Buscar tareas de ejecución'}).fill('no matching activity in this day');
    await page.getByText('0 de 266 tareas',{exact:true}).waitFor();
    await resetButton.click(); await page.getByText(/Se restablecerá la ejecución de 4 actividades de toda la jornada/).waitFor();
    const cancelled = await material(); await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.deepEqual(await material(),cancelled);
    await page.context().setOffline(true);
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent?.includes('Resetear toda la ejecución')&&b.disabled));
    await page.context().setOffline(false);
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(b=>b.textContent?.includes('Resetear toda la ejecución')&&!b.disabled));
    // Real execution changes while the confirmation is open, with no UI interception.
    await resetButton.click(); await page.getByRole('alertdialog').waitFor();
    await transition(d.id,'done'); const concurrent = await material();
    const staleReply = page.waitForResponse(r=>r.url().endsWith(path)&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Resetear todas',exact:true}).click(); assert.equal((await staleReply).status(),409);
    assert.deepEqual(await material(),concurrent);
    await page.getByText('La actividad cambió en otra sesión. Actualiza la agenda antes de continuar.',{exact:true}).waitFor();
    const beforeSuccess = await material();
    await resetButton.click(); await page.getByRole('alertdialog').waitFor();
    const reply = page.waitForResponse(r=>r.url().endsWith(path)&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Resetear todas',exact:true}).click();
    const success = await reply; assert.equal(success.status(),200); assert.deepEqual(await success.json(),{resetCount:4});
    await page.getByText('Se han restablecido 4 actividades. El planning y el historial se conservan.',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Limpiar filtros',exact:true}).click();
    await page.getByRole('button',{name:'Pendiente 266',exact:true}).waitFor();
    for (const task of [a,b,c,d]) await page.getByTestId(`day-execution-task-${task.id}`).getByText('Pendiente',{exact:true}).waitFor();
    assert.equal(await resetButton.isDisabled(),true);
    const after = await material();
    const changed = beforeSuccess.tasks.filter((t: any)=>t.plan_id===planId&&t.status!=='pending');
    assert.equal(changed.length,4);
    for (const t of beforeSuccess.tasks) {
      const next = after.tasks.find((n: any)=>n.id===t.id);
      if (!changed.some((n: any)=>n.id===t.id)) assert.deepEqual(next,t);
      else {
        assert.equal(next.status,'pending'); assert.equal(next.execution_version,t.execution_version+1);
        for (const key of ['start_real','end_real','start_real_at','end_real_at','paused_at','execution_clock_mode','execution_clock_revision']) assert.equal(next[key],null);
      }
    }
    assert.deepEqual(after.events.slice(0,beforeSuccess.events.length),beforeSuccess.events);
    assert.deepEqual(after.events.slice(beforeSuccess.events.length).map((e: any)=>[e.task_id,e.event_kind,e.execution_version,e.changed_by,e.task_snapshot]),
      changed.map((t: any)=>[t.id,'reset',t.execution_version+1,users.admin.id,t]));
    assert.deepEqual(after.locks,beforeSuccess.locks.filter((l: any)=>!changed.some((t: any)=>t.id===l.task_id)||!l.execution_owned));
    assert.deepEqual(await planning(),protectedPlanning);
    await page.screenshot({path:`${directory}/bulk-execution-reset.png`});
    await page.getByRole('tab',{name:'Planning',exact:true}).click(); await page.getByTestId('assisted-workspace').waitFor();
    assert.deepEqual(await planning(),protectedPlanning);
    assert.deepEqual(errors,[]);
    pass('bulk reset: real UI hides ADMIN action from Production; filters, Cancel, offline, stale dialog, count=4, pending=266 and Planning remain coherent without reload');
  } finally { await browser.close(); }

  assert.deepEqual((await request('admin',path,'POST',{expectedTasks:await snapshot()})).body,{resetCount:0});
  await transition(c.id,'cancelled');
  const competing = {expectedTasks:await snapshot()}, raceBefore = await material();
  const results = await Promise.all([request('admin',path,'POST',competing),request('admin',path,'POST',competing)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await material()).events.length,raceBefore.events.length+1);
  await assert.rejects(()=>db.query("UPDATE task_status_events SET changed_by='tampered' WHERE task_id=$1",[a.id]),/EXECUTION_HISTORY_IMMUTABLE/);
  assert.deepEqual(await planning(),protectedPlanning);
  pass('bulk reset: empty repeat returns count=0; competing confirmations produce one complete success and one 409, exactly one new reset event; immutable prior audit');
  return {status:'PASS',resetCount:4,obligations:266,apiRoles:'PASS',rpcPrivileges:'service_role only',lateFailureRollback:'PASS',nativeConcurrency:'PASS',competingRequests:[200,409],auditPreservation:'PASS',planningStagesDraftConfigAndOtherDays:'PASS',uiFiltersCancelOfflineStaleCounters:'PASS',remoteWrites:0};
}
