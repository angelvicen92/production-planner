/** Native local PostgreSQL + Auth + PostgREST + product HTTP + Chromium. No solver. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import type pg from 'pg';
import { chromium, type Page } from 'playwright';
import { api, buildUrl } from '../../shared/routes';
import ts from 'typescript';
import { runInNewContext } from 'node:vm';

type User = {id:string;email:string;password:string;token:string};
export async function runAtomicTaskTemplate({appUrl,url,anon,service,db,users,directory,pass,transport}: {
  appUrl:string;url:string;anon:string;service:string;db:pg.Client;users:Record<string,User>;directory:string;pass:(name:string)=>void;transport:any[];
}) {
  assert.equal(db.host,'127.0.0.1');
  for(const endpoint of [appUrl,url])assert.equal(new URL(endpoint).hostname,'127.0.0.1');
  const report:any={checks:[],denials:[],invalid:[],concurrency:[],browser:[],remoteWrites:0,newSolverRuns:0};
  const save=()=>writeFileSync(directory+'/atomic-template.json',JSON.stringify(report,null,2));
  const check=(label:string)=>{report.checks.push(label);pass(label);save();};
  const request=async(path:string,method='GET',body?:unknown,role='admin')=>{
    const response=await fetch(appUrl+path,{method,headers:{'Content-Type':'application/json',...(role==='anonymous'?{}:{Authorization:`Bearer ${role==='invalid'?'invalid':users[role].token}`})},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:response.status,body:await response.json() as any};
  };
  const read=async()=>{const result=await request(api.taskTemplates.list.path);assert.equal(result.status,200);return result.body as any[];};
  const rows=async()=>(await db.query('SELECT to_jsonb(t) row FROM task_templates t ORDER BY id')).rows;
  const fingerprints=async()=>{
    const result:Record<string,unknown>={};
    for(const table of ['plan_task_template_snapshots','plans','daily_tasks','locks','assisted_planning_stages','plan_config_revisions'])
      result[table]=(await db.query(`SELECT count(*)::int count,md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) hash FROM public.${table} t`)).rows[0];
    return result;
  };
  const protectedBefore=await fingerprints();report.protectedBefore=protectedBefore;
  const catalogBefore=await rows();
  // Reapplying the additive migration must not alter any row (including revision).
  await db.query(readFileSync('supabase/migrations/103_atomic_task_template_inverse.sql','utf8'));
  assert.deepEqual(await rows(),catalogBefore);
  const created:number[]=[];
  const create=async(name:string,deps:number[]=[])=>{
    const result=await request(api.taskTemplates.create.path,'POST',{name,defaultDuration:12,defaultCameras:0,dependsOnTemplateIds:deps,
      participantMarginBeforeMinutes:null,participantMarginAfterMinutes:0,resourceRequirements:{byType:{},retained:{zero:0}},rulesJson:{retained:[0,null,'unchanged']},uiColor:'#11223344',defaultComment1Color:'#aabbcc',abbrev:'U06'});
    assert.equal(result.status,201,JSON.stringify(result));created.push(result.body.id);return result.body.id as number;
  };
  const anchor=await create('U06 anchor'),main=await create('U06 main',[anchor]),added=await create('U06 added',[anchor]),removed=await create('U06 removed',[main,anchor]);
  const path=buildUrl(api.taskTemplates.updateWithInverse.path,{id:main});
  const patchPath=(id:number)=>buildUrl(api.taskTemplates.update.path,{id});
  const input=async(patch:Record<string,unknown>,adds=[added],removes=[removed])=>({patch,addedInverseIds:adds,removedInverseIds:removes,
    expectedTemplates:(await read()).filter(row=>[main,...adds,...removes].includes(row.id)).map(row=>({id:row.id,revision:row.revision}))});
  const body=await input({name:'U06 happy',participantMarginBeforeMinutes:0,participantMarginAfterMinutes:null});
  let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
  try {
    // Real API, Auth roles and casing. Include invalid JWT and no token.
    const deniedBefore=await rows();
    for(const role of ['anonymous','invalid','norole','viewer','aux','production']) {
      const result=await request(path.toUpperCase()+'/', 'POST',body,role);
      assert.equal(result.status,role==='anonymous'||role==='invalid'?401:403);
      report.denials.push({role,status:result.status});assert.deepEqual(await rows(),deniedBefore);
    }
    // RPC ACL rejects anon and authenticated before function execution.
    for(const role of ['anon','authenticated']) {
      await db.query(`SET ROLE ${role}`);
      await assert.rejects(db.query('SELECT public.save_task_template_with_inverse($1,$2,$3,$4,$5,$6)',[main,users.admin.id,JSON.stringify({}),JSON.stringify(body.expectedTemplates),[added],[removed]]),/permission denied/);
      await db.query('RESET ROLE');assert.deepEqual(await rows(),deniedBefore);
    }
    const rpcBody={p_template_id:main,p_actor:users.production.id,p_patch:{name:'forbidden'},p_expected:body.expectedTemplates,p_added:[added],p_removed:[removed]};
    const sqlForbidden=await fetch(url+'/rest/v1/rpc/save_task_template_with_inverse',{method:'POST',headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},body:JSON.stringify(rpcBody)});
    assert.equal(sqlForbidden.status,400);assert.match((await sqlForbidden.json()).message,/TEMPLATE_FORBIDDEN/);assert.deepEqual(await rows(),deniedBefore);
    check('native Auth HTTP 401/403 and SQL anon/authenticated/actor denials, zero writes');

    const invalidBodies=[{...body,addedInverseIds:[main]}, {...body,addedInverseIds:[added,added]}, {...body,removedInverseIds:[added]},
      {...body,expectedTemplates:[]}, {...body,patch:{revision:44}}, {...body,patch:{dependsOnTemplateIds:[main]}},
      {...body,patch:{dependsOnTemplateIds:[anchor,anchor]}}, {...body,patch:{dependsOnTemplateIds:[2147483647]}},
      {...body,addedInverseIds:[-1]}, {...body,patch:{participantMarginBeforeMinutes:-1}}];
    for(const invalid of invalidBodies) {
      const result=await request(path,'POST',invalid);assert.equal(result.status,400,JSON.stringify(result));
      report.invalid.push({input:invalid,status:result.status});assert.deepEqual(await rows(),deniedBefore);
    }
    const nonexistent=await request(path,'POST',{...body,addedInverseIds:[2147483647],expectedTemplates:body.expectedTemplates.map(row=>row.id===added?{id:2147483647,revision:0}:row)});
    assert.equal(nonexistent.status,409);assert.deepEqual(await rows(),deniedBefore);
    check('invalid IDs, nonexistent rows/references, duplicates, self dependencies and arbitrary fields reject without writes');

    const initial=await read(), result=await request(path,'POST',body);assert.equal(result.status,200,JSON.stringify(result));
    const persisted=await read();assert.deepEqual(result.body,persisted.find(row=>row.id===main));
    for(const id of [added,removed]) {
      const before=initial.find(row=>row.id===id),after=persisted.find(row=>row.id===id);
      const {dependsOnTemplateIds:oldDeps,hasDependency:oldFlag,dependsOnTemplateId:oldLegacy,revision:oldRevision,...oldFields}=before;
      const {dependsOnTemplateIds:deps,hasDependency,dependsOnTemplateId,revision,...fields}=after;
      assert.deepEqual(fields,oldFields);assert.deepEqual(deps,id===added?[anchor,main]:[anchor]);
      assert.equal(hasDependency,true);assert.equal(dependsOnTemplateId,anchor);assert.equal(revision,oldRevision+1);
    }
    const mainAfter=persisted.find(row=>row.id===main);assert.equal(mainAfter.participantMarginBeforeMinutes,0);assert.equal(mainAfter.participantMarginAfterMinutes,null);
    report.happy={input:body,result,persisted:persisted.filter(row=>created.includes(row.id))};
    check('one HTTP save persists principal and inverse add/remove, preserves other fields/dependencies and null/zero; response equals GET');

    // A trigger sees the attempted main update and preceding dependent update.
    // Sequence increments intentionally survive rollback; table content must not.
    const rollbackBody=await input({name:'U06 must rollback'},[removed],[added]);
    await db.query(`CREATE SEQUENCE public.u06_attempts; GRANT USAGE,SELECT ON SEQUENCE public.u06_attempts TO service_role;
      CREATE FUNCTION public.u06_force_failure() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$ BEGIN
        PERFORM nextval('public.u06_attempts');
        IF NEW.id=${removed} AND EXISTS(SELECT 1 FROM public.task_templates WHERE id=${main} AND name='U06 must rollback')
          AND EXISTS(SELECT 1 FROM public.task_templates WHERE id=${added} AND NOT depends_on_template_ids @> '[${main}]'::jsonb) THEN
          RAISE EXCEPTION 'U06_FORCED_AFTER_MAIN_AND_PEER';
        END IF; RETURN NEW; END $$;
      CREATE TRIGGER u06_force_failure BEFORE UPDATE ON public.task_templates FOR EACH ROW EXECUTE FUNCTION public.u06_force_failure();`);
    const beforeRollback=await rows(),failed=await request(path,'POST',rollbackBody);
    assert.equal(failed.status,500);assert.deepEqual(await rows(),beforeRollback);
    const attempts=Number((await db.query('SELECT last_value FROM public.u06_attempts')).rows[0].last_value);assert.equal(attempts,3);
    report.rollback={input:rollbackBody,status:failed.status,attemptedUpdates:attempts,before:beforeRollback.filter(row=>created.includes(Number(row.row.id))),after:(await rows()).filter(row=>created.includes(Number(row.row.id)))};
    await db.query('DROP TRIGGER u06_force_failure ON public.task_templates; DROP FUNCTION public.u06_force_failure(); DROP SEQUENCE public.u06_attempts');
    check('forced dependent SQL failure after main and first peer updates: all catalog rows and revisions exactly rolled back');

    for(const target of [main,added]) {
      const stale=await input({name:'U06 stale'});const change=await request(patchPath(target),'PATCH',{defaultDuration:19});assert.equal(change.status,200);
      const concurrent=await rows(),rejected=await request(path,'POST',stale);assert.equal(rejected.status,409);assert.match(rejected.body.message,/Recargar/);assert.deepEqual(await rows(),concurrent);
      report.concurrency.push({target,status:rejected.status,message:rejected.body.message});
    }
    // A real waiting transaction: commit a normal writer after the RPC started.
    const stale=await input({name:'U06 waiting stale'});const peer=new (await import('pg')).default.Client((db as any).connectionParameters);await peer.connect();
    try {
      await peer.query('BEGIN');await peer.query('UPDATE task_templates SET default_duration=20 WHERE id=$1',[added]);
      let completed=false;const pending=request(path,'POST',stale).then(result=>{completed=true;return result;});
      let waiting=false;
      for(let attempt=0;attempt<200&&!waiting;attempt++) {
        waiting=(await db.query("SELECT 1 FROM pg_locks WHERE relation='task_templates'::regclass AND mode='ShareRowExclusiveLock' AND NOT granted")).rowCount!>0;
        if(!waiting)await new Promise(resolve=>setTimeout(resolve,25));
      }
      assert.equal(waiting,true,'RPC must actually wait on the catalog lock');assert.equal(completed,false);
      await peer.query('COMMIT');const concurrent=await rows(),rejected=await pending;assert.equal(rejected.status,409);assert.deepEqual(await rows(),concurrent);
      report.concurrency.push({case:'RPC waited for concurrent writer commit',status:rejected.status});
    } finally {await peer.end();}
    check('stale principal, stale dependent and genuine overlapping writer all return 409 without overwriting');

    // Add then remove the sole relationship: all three representation fields empty.
    const cleared=await create('U06 sole');
    assert.equal((await request(path,'POST',await input({},[cleared],[]))).status,200);
    assert.equal((await request(path,'POST',await input({},[],[cleared]))).status,200);
    const empty=(await read()).find(row=>row.id===cleared);assert.deepEqual(empty.dependsOnTemplateIds,[]);assert.equal(empty.hasDependency,false);assert.equal(empty.dependsOnTemplateId,null);

    // Execute the actual UI reader in an isolated test context, rather than
    // copying its legacy-fallback rules into another implementation.
    const settings = ts.createSourceFile('settings.tsx',readFileSync('client/src/pages/settings.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
    let readerSource = '';
    const visit = (node: ts.Node) => {
      if(ts.isVariableDeclaration(node)&&node.name.getText(settings)==='getTemplateDependencyIds')readerSource=node.initializer!.getText(settings);
      ts.forEachChild(node,visit);
    };
    visit(settings);assert.ok(readerSource);
    const uiReader = runInNewContext(ts.transpile(`(${readerSource})`)) as (row: unknown) => number[];
    const uiDependencies = (row: unknown): number[] => JSON.parse(JSON.stringify(uiReader(row)));
    report.legacyFallback=[];
    for(const storedArray of [[],null]) {
      const legacyMain=await create('U06 legacy main'),legacyPeer=await create('U06 legacy peer');
      const raw = async(id: number, legacy: number) => db.query('UPDATE task_templates SET depends_on_template_ids=$1::jsonb,depends_on_template_id=$2,has_dependency=true WHERE id=$3',[storedArray===null?null:JSON.stringify(storedArray),legacy,id]);
      const saveLegacy = async(patch: Record<string,unknown>,add: boolean) => {
        const before=(await read()).filter(row=>[legacyMain,legacyPeer].includes(row.id));
        const payload={patch,addedInverseIds:add?[legacyPeer]:[],removedInverseIds:add?[]:[legacyPeer],expectedTemplates:before.map(row=>({id:row.id,revision:row.revision}))};
        const saved=await request(buildUrl(api.taskTemplates.updateWithInverse.path,{id:legacyMain}),'POST',payload);assert.equal(saved.status,200,JSON.stringify(saved));
        const after=(await read()).filter(row=>[legacyMain,legacyPeer].includes(row.id));
        for(const previous of before) {
          const current=after.find(row=>row.id===previous.id);
          assert.deepEqual(current,{...previous,...(previous.id===legacyMain?patch:{}),revision:previous.revision+1,
            dependsOnTemplateIds:current.dependsOnTemplateIds,hasDependency:current.hasDependency,dependsOnTemplateId:current.dependsOnTemplateId});
          assert.equal(current.hasDependency,current.dependsOnTemplateIds.length>0);
          assert.equal(current.dependsOnTemplateId,current.dependsOnTemplateIds[0]??null);
        }
        return {before,after};
      };
      await raw(legacyMain,anchor);await raw(legacyPeer,anchor);
      const before=await read();for(const id of [legacyMain,legacyPeer])assert.deepEqual(uiDependencies(before.find(row=>row.id===id)),[anchor]);
      const addedResult=await saveLegacy({participantMarginBeforeMinutes:0},true);
      assert.deepEqual(addedResult.after.find(row=>row.id===legacyMain).dependsOnTemplateIds,[anchor],'principal must retain the effective legacy relation shown by UI');
      assert.deepEqual(addedResult.after.find(row=>row.id===legacyPeer).dependsOnTemplateIds,[anchor,legacyMain],'adding must retain an unrelated legacy relation');
      await raw(legacyPeer,anchor);
      const removedUnrelated=await saveLegacy({},false);
      assert.deepEqual(removedUnrelated.after.find(row=>row.id===legacyPeer).dependsOnTemplateIds,[anchor]);
      await raw(legacyPeer,legacyMain);
      const removedLegacy=await saveLegacy({},false);
      assert.deepEqual(removedLegacy.after.find(row=>row.id===legacyPeer).dependsOnTemplateIds,[]);
      // Explicitly clearing direct dependencies still wins over the stored legacy.
      await raw(legacyMain,anchor);
      const cleared=await saveLegacy({dependsOnTemplateIds:[]},true);
      assert.deepEqual(cleared.after.find(row=>row.id===legacyMain).dependsOnTemplateIds,[]);
      report.legacyFallback.push({storedArray,addedResult,removedUnrelated,removedLegacy,explicitClear:cleared});
    }
    check('empty and NULL persisted arrays match actual UI legacy fallback: main/add/remove preserve unrelated relations; explicit direct clear still clears');

    browser=await chromium.launch({headless:true});const page=await browser.newPage();
    await page.goto(appUrl+'/login');await page.getByLabel('Email',{exact:true}).fill(users.admin.email);
    await page.getByLabel('Contraseña (opcional para enlace)',{exact:true}).fill(users.admin.password);
    await page.getByRole('button',{name:'Entrar con contraseña',exact:true}).click();await page.waitForURL('**/dashboard');
    const open=async()=>{await page.goto(appUrl+'/settings');await page.getByRole('tab',{name:/plantillas|templates/i}).click();};
    const edit=async()=>{const card=page.locator('.bg-card').filter({has:page.getByText('U06 happy',{exact:true})}).last();await card.getByRole('button',{name:'Editar',exact:true}).click();};
    const inverse=()=>page.locator('div.space-y-2.border-t').filter({has:page.getByText('Dependen de esta plantilla',{exact:true})});
    const toggle=async(name:string)=>inverse().locator('label').filter({hasText:name}).getByRole('checkbox').click();
    const saveUI=async(expectedPath:string,status:number)=>{
      const writes:any[]=[];const listener=(req:any)=>{if(req.url().startsWith(appUrl+'/api/')&&['POST','PATCH','DELETE'].includes(req.method()))writes.push({method:req.method(),path:new URL(req.url()).pathname,body:req.postDataJSON()});};
      page.on('request',listener);const pending=page.waitForResponse(r=>new URL(r.url()).pathname===expectedPath&&r.request().method()!=='GET');
      await page.getByRole('button',{name:'Guardar',exact:true}).click();const response=await pending;assert.equal(response.status(),status,await response.text());
      await page.waitForTimeout(200);page.off('request',listener);assert.equal(writes.length,1,JSON.stringify(writes));report.browser.push({status,writes});return writes[0].body;
    };
    await open();await edit();await toggle('U06 added');await toggle('U06 removed');
    await page.getByRole('spinbutton',{name:'Margen antes (vacío = heredado)',exact:true}).fill('0');
    await page.getByRole('spinbutton',{name:'Margen después (vacío = heredado)',exact:true}).fill('7');
    await saveUI(path,200);await page.getByRole('button',{name:'Guardar',exact:true}).waitFor({state:'detached'});
    await page.reload();await page.getByRole('tab',{name:/plantillas|templates/i}).click();await edit();
    assert.equal(await inverse().locator('label').filter({hasText:'U06 added'}).getByRole('checkbox').getAttribute('data-state'),'unchecked');
    assert.equal(await inverse().locator('label').filter({hasText:'U06 removed'}).getByRole('checkbox').getAttribute('data-state'),'checked');
    assert.equal(await page.getByRole('spinbutton',{name:'Margen después (vacío = heredado)',exact:true}).inputValue(),'7');
    // No inverse changes keeps PATCH and U02 semantics (null and zero).
    await page.getByRole('spinbutton',{name:'Margen antes (vacío = heredado)',exact:true}).fill('');
    await page.getByRole('spinbutton',{name:'Margen después (vacío = heredado)',exact:true}).fill('0');
    await saveUI(patchPath(main),200);await page.getByRole('button',{name:'Guardar',exact:true}).waitFor({state:'detached'});
    const noInverse=(await read()).find(row=>row.id===main);assert.equal(noInverse.participantMarginBeforeMinutes,null);assert.equal(noInverse.participantMarginAfterMinutes,0);
    await open();await edit();await toggle('U06 added');
    assert.equal((await request(patchPath(added),'PATCH',{abbrev:'CONCURRENT'})).status,200);
    const conflictBefore=await rows();await saveUI(path,409);assert.deepEqual(await rows(),conflictBefore);
    assert.equal(await page.getByRole('button',{name:'Guardar',exact:true}).isDisabled(),true);
    await page.screenshot({path:directory+'/atomic-template-conflict.png',fullPage:true});
    await page.getByRole('button',{name:'Recargar',exact:true}).click();
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(button=>button.textContent==='Guardar'&&!button.disabled));
    await toggle('U06 added');await saveUI(path,200);await page.getByRole('button',{name:'Guardar',exact:true}).waitFor({state:'detached'});
    check('Chromium: one Save/one request, inverse add/remove persists after reload; unchanged inverse uses PATCH; conflict retains editor and explicit Recargar succeeds');
    await browser.close();browser=undefined;

    const relevantTransport=transport.filter(item=>JSON.stringify(item).includes('save_task_template_with_inverse'));
    // Gateway records only method/path/status; no credentials are saved.
    report.rpcTransport=relevantTransport;
    report.protectedAfter=await fingerprints();assert.deepEqual(report.protectedAfter,protectedBefore);
    assert.ok((protectedBefore.plan_task_template_snapshots as any).count>0);
    assert.ok((protectedBefore.assisted_planning_stages as any).count>0);
    check('all preexisting day snapshots, tasks, Stages, plans, revisions and locks have identical complete-table counts/hashes');
    report.status='PASS';save();return report;
  } catch(error) {
    report.status="FAIL";report.error=error instanceof Error?error.stack:String(error);save();throw error;
  } finally {
    await db.query("RESET ROLE");
    await browser?.close();
    await db.query('DROP TRIGGER IF EXISTS u06_force_failure ON public.task_templates; DROP FUNCTION IF EXISTS public.u06_force_failure(); DROP SEQUENCE IF EXISTS public.u06_attempts');
    await db.query('DELETE FROM task_templates WHERE id=ANY($1::bigint[])',[created]);
    assert.deepEqual(await rows(),catalogBefore,'original catalog is identical after removing only disposable fixtures');
    assert.deepEqual(await fingerprints(),protectedBefore);save();
  }
}
