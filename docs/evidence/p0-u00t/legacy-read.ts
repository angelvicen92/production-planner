/** Causal comparison only: literal pre-104 method + real current viewer HTTP GET. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import ts from 'typescript';
export async function legacyRead({db,appUrl,users,directory}:any){
 assert.equal(db.host,'127.0.0.1');assert.equal(new URL(appUrl).hostname,'127.0.0.1');
 const base='21f9b6cc72cec907162d597354f8cd7cc91b6cc0';
 const source=execFileSync('git',['show',base+':server/storage.ts'],{cwd:process.env.U00T_ORIGINAL_REPO,encoding:'utf8'});
 const start=source.indexOf('  async syncPlanMealBreaks('),end=source.indexOf('  async savePlannedBreakTimes(',start);assert.ok(start>0&&end>start);
 const method=source.slice(start,end);
 // Independent synthetic counterpart; this fixture initialization is not an API journey.
 const fields=(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='plans' ORDER BY ordinal_position")).rows.map((r:any)=>r.column_name);
 await db.query(`INSERT INTO plans(${fields.map((f:string)=>'"'+f+'"').join(',')}) OVERRIDING SYSTEM VALUE SELECT ${fields.map((f:string)=>f==='id'?'26998':'"'+f+'"').join(',')} FROM plans WHERE id=26999`);
 const input=(await db.query('SELECT id,meal_start,meal_end,meal_mode,space_meal_break_minutes,planner_next_configuration,planner_next_profile,itinerant_composition_version FROM plans WHERE id IN (26998,26999) ORDER BY id')).rows;
 const {supabaseAdmin}=await import('../../../server/supabase');
 const {planPlannerNextConfigurationSchema}=await import('../../../server/planPlannerNextConfiguration');
 const javascript=ts.transpileModule('class Probe {'+method+'}',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const probe=new Function('supabaseAdmin','planPlannerNextConfigurationSchema',javascript+';return new Probe();')(supabaseAdmin,planPlannerNextConfigurationSchema);
 const breaks=async(id:number)=>(await db.query("SELECT to_jsonb(b)-ARRAY['id','plan_id','created_at'] row FROM plan_breaks b WHERE plan_id=$1 ORDER BY space_id,itinerant_team_id",[id])).rows;
 const before={prior:await breaks(26998),current:await breaks(26999)};assert.deepEqual(before,{prior:[],current:[]});
 await probe.syncPlanMealBreaks(26998);
 const response=await fetch(appUrl+'/api/plans/26999',{headers:{Authorization:`Bearer ${users.viewer.token}`}});assert.equal(response.status,200);await response.json();
 const after={prior:await breaks(26998),current:await breaks(26999)};
 assert.ok(after.prior.length>0);assert.deepEqual(after.current,[],'viewer GET must preserve the historical day');
 const result={status:'PASS',classification:'localized GET repair; pre-104 method still reproduces legacy write',base,baseMethodSha256:createHash('sha256').update(method).digest('hex'),
  route:'GET /api/plans/26999',actor:'viewer',httpStatus:response.status,input,before,after,
  decision:'GET reads persisted history; creation/update retain the existing explicit legacy sync',strictHistoricalPreservation:true,remoteWrites:0};
 writeFileSync(directory+'/legacy-read-causal.json',JSON.stringify(result,null,2));return result;
}
