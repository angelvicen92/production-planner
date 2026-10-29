/** Reuse the owned native-stack runner; instrument only its smoke test module.
 * HTTP fault injection never replaces application code or writes availability.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
const output=resolve(process.argv[2]);
let smoke=readFileSync('docs/evidence/p0-g03d/smokeJourney.ts','utf8').replace('{appUrl,users,pass}:any','{appUrl,users,pass,db,directory}:any');
const fault=String.raw`
 const list='/api/plans/'+day.id+'/resource-items',patch=list+'/1';
 const before=(await db.query('SELECT to_jsonb(r) row FROM plan_resource_items r WHERE id=1')).rows[0].row;
 await page.route(appUrl+patch,async route=>{if(route.request().method()==='PATCH')await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Fallo de guardado simulado'})});else await route.continue();});
 let failed=false;try{await editWindow({page,appUrl,responseTo,planId:day.id,id:1,name:'Equipo 1',start:'18:00',end:'19:00'});}catch{failed=true;}
 assert.equal(failed,true);await page.getByRole('alert').filter({hasText:'Fallo de guardado simulado'}).waitFor();
 await page.screenshot({path:directory+'/save-failure.png',fullPage:true});await page.unroute(appUrl+patch);
 assert.deepEqual((await db.query('SELECT to_jsonb(r) row FROM plan_resource_items r WHERE id=1')).rows[0].row,before);
 await page.route(appUrl+list,async route=>{if(route.request().method()==='GET')await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Fallo de recarga simulado'})});else await route.continue();});
 await page.reload();await page.getByText('Error cargando recursos del plan',{exact:true}).waitFor();await page.screenshot({path:directory+'/reload-failure.png',fullPage:true});
 await page.unroute(appUrl+list);await page.getByRole('button',{name:'Reintentar',exact:true}).click();
 await page.getByTestId('day-resources').waitFor();
 const daily=page.getByTestId('day-resources');for(const button of await daily.locator('button[data-day-section-trigger]').all())if(await button.getAttribute('aria-expanded')==='false')await button.click();
 await page.getByRole('button',{name:'Horario de Equipo 1: 17:00–20:00',exact:true}).waitFor();
 assert.deepEqual((await db.query('SELECT to_jsonb(r) row FROM plan_resource_items r WHERE id=1')).rows[0].row,before);
 (await import('node:fs')).writeFileSync(directory+'/failures.json',JSON.stringify({status:'PASS',httpFaultInjection:true,productCodeModified:false,saveErrorVisible:true,reloadErrorVisible:true,retryRestoresSavedWindow:true,before,after:before,partialWrites:0},null,2));
 pass('native UI save/reload failures: visible errors, retry and unchanged SQL');
`;
const protection=String.raw`
 const protectionBefore=(await db.query('SELECT to_jsonb(r) row FROM plan_resource_items r WHERE id=1')).rows[0].row;
 const revision=(await db.query('SELECT p.current_config_revision_id,r.identity_json,r.replay_snapshot_json FROM plans p JOIN plan_config_revisions r ON r.id=p.current_config_revision_id WHERE p.id=$1',[day.id])).rows[0];
 const protections=[];
 for(const kind of ['done','in_progress','lock','dirty_draft','pending_proposal']){
  let error:any;await db.query('BEGIN');try{
   if(kind==='dirty_draft')await db.query("UPDATE assisted_planning_sessions SET draft_scope_json='{\"negative\":true}' WHERE plan_id=$1 AND status='ACTIVE'",[day.id]);
   else if(kind==='pending_proposal')await db.query("INSERT INTO planning_runs(plan_id,status) VALUES($1,'running')",[day.id]);
   else {
   const template=(await db.query("INSERT INTO task_templates(name,default_duration) VALUES('Negative protection fixture',5) RETURNING id")).rows[0];
   const task=(await db.query('INSERT INTO daily_tasks(plan_id,template_id,status) VALUES($1,$2,$3) RETURNING id',[day.id,template.id,kind==='lock'?'pending':kind])).rows[0];
   if(kind==='lock')await db.query("INSERT INTO locks(plan_id,task_id,lock_type,locked_start,locked_end,created_by) VALUES($1,$2,'time','12:00','12:05','negative-fixture')",[day.id,task.id]);
   }
   await db.query('SET LOCAL ROLE service_role');
   await db.query('SELECT apply_day_config_operation_v5($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[day.id,users.admin.id,'RESOURCE_AVAILABILITY',{resourceAvailability:{id:1,availabilityStart:'20:00',availabilityEnd:'21:00'},expectedRevisionId:Number(revision.current_config_revision_id)},revision.current_config_revision_id,revision.identity_json,revision.replay_snapshot_json,revision.identity_json,revision.replay_snapshot_json,{}]);
  }catch(e:any){error={code:e.code,message:e.message};}finally{await db.query('ROLLBACK');}
  assert.equal(error?.message,kind==='dirty_draft'?'RESOURCE_AVAILABILITY_DIRTY_DRAFT':kind==='pending_proposal'?'RESOURCE_AVAILABILITY_PENDING_PROPOSAL':'RESOURCE_AVAILABILITY_PROTECTED_DECISIONS',JSON.stringify({kind,error}));
  assert.deepEqual((await db.query('SELECT to_jsonb(r) row FROM plan_resource_items r WHERE id=1')).rows[0].row,protectionBefore);protections.push({kind,error,transactionRolledBack:true});
 }
 (await import('node:fs')).writeFileSync(directory+'/protected-states.json',JSON.stringify({status:'PASS',fixtureOnlyInRolledBackTransactions:true,sourceWindowUnchanged:true,protections},null,2));
 pass('SQL window guard rejects done, in_progress, locks, dirty Draft and running proposal');
`;
assert.ok(smoke.includes(" pass('smoke native resource window"));smoke=smoke.replace(" pass('smoke native resource window",protection+" pass('smoke native resource window");
assert.ok(smoke.includes(' const bootstrap='));smoke=smoke.replace(' const bootstrap=',fault+' const bootstrap=');
let runner=readFileSync('docs/evidence/p0-g03d/run.ts','utf8');
const marker="const file=join(source,'script/demo/smokeNewDayIntegration.ts')";
assert.ok(runner.includes(marker));
runner=runner.replace(marker,`const instrumentedSmoke=${JSON.stringify(smoke)};writeFileSync(join(source,'docs/evidence/p0-g03d/smokeJourney.ts'),instrumentedSmoke);hashes['docs/evidence/p0-g03d/smokeJourney.ts']=sha(instrumentedSmoke);\n`+marker);
const script='/tmp/g03d-failure-runner-'+process.pid+'.ts';writeFileSync(script,runner);
try{execFileSync(process.execPath,['--import','tsx',script,output],{cwd:process.cwd(),env:{...process.env,G03D_SMOKE:'1'},stdio:'inherit'});}finally{unlinkSync(script);}
