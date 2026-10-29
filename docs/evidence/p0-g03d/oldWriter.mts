/** Genuine UI call against ledger 128. Only the disposable migration dispatch
 * and smoke test are instrumented; application/backend sources remain literal.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
const output=resolve(process.argv[2]);
let smoke=readFileSync('docs/evidence/p0-g03d/smokeJourney.ts','utf8').replace('{appUrl,users,pass}:any','{appUrl,users,pass,db,directory}:any');
const target="await editWindow({page,appUrl,responseTo,planId:day.id,id:1,name:'Equipo 1',start:'17:00',end:'20:00'});";
assert.ok(smoke.includes(target));
smoke=smoke.replace(target,String.raw`
 const before={resource:(await db.query('SELECT to_jsonb(r) row FROM plan_resource_items r WHERE id=1')).rows[0].row,plan:(await db.query('SELECT current_config_revision_id FROM plans WHERE id=$1',[day.id])).rows[0]};
 const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plans/'+day.id+'/resource-items/1'&&r.request().method()==='PATCH');
 let rejected=false;try{await editWindow({page,appUrl,responseTo,planId:day.id,id:1,name:'Equipo 1',start:'17:00',end:'20:00'});}catch(e:any){rejected=true;}
 const response=await pending;assert.equal(response.status(),409);
 assert.equal(rejected,true);await page.getByRole('alert').filter({hasText:'La edición horaria no está disponible en esta instalación.'}).waitFor();
 const after={resource:(await db.query('SELECT to_jsonb(r) row FROM plan_resource_items r WHERE id=1')).rows[0].row,plan:(await db.query('SELECT current_config_revision_id FROM plans WHERE id=$1',[day.id])).rows[0]};assert.deepEqual(after,before);
 (await import('node:fs')).writeFileSync(directory+'/old-writer.json',JSON.stringify({status:'PASS',ledger:128,expectedHTTP:response.status(),uiErrorVisible:true,before,after,partialWrites:0},null,2));
 pass('ledger 128 rejects the new operation via authentic UI; rows and revision unchanged');return {status:'PASS_OLD_WRITER_REJECTED'};
`);
let runner=readFileSync('docs/evidence/p0-g03d/run.ts','utf8');
const marker="const file=join(source,'script/demo/smokeNewDayIntegration.ts')";assert.ok(runner.includes(marker));
runner=runner.replace(marker,`const instrumentedSmoke=${JSON.stringify(smoke)};writeFileSync(join(source,'docs/evidence/p0-g03d/smokeJourney.ts'),instrumentedSmoke);hashes['docs/evidence/p0-g03d/smokeJourney.ts']=sha(instrumentedSmoke);\n`+marker);
const dispatch='const changed=before.replace(from,to)';assert.ok(runner.includes(dispatch));
runner=runner.replace(dispatch,`const changed=before.replace('await db.query(sql);','if(file.startsWith("129_"))continue; await db.query(sql);').replace(from,to)`);
const script='/tmp/g03d-old-writer-'+process.pid+'.ts';writeFileSync(script,runner);
try{execFileSync(process.execPath,['--import','tsx',script,output],{cwd:process.cwd(),env:{...process.env,G03D_SMOKE:'1'},stdio:'inherit'});const integration=JSON.parse(readFileSync(output+'/native/integration.json','utf8'));assert.ok(integration.migrations.every((m:any)=>!m.file.startsWith('129_')));}finally{unlinkSync(script);}
