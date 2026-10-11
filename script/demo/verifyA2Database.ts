import assert from 'node:assert/strict';
import {buildEngineInput} from '../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {buildA2ImportRows} from './a2ImportRows';
import {readFileSync} from 'node:fs';

// Strictly read-only. No bootstrap, RPC, planning run, schema change or write.
const project=process.argv[2],date=process.argv[3];
if(!project||!date)throw Error('Usage: demo:a2:verify-database -- approved-project-ref YYYY-MM-DD');
assert.equal(new URL(process.env.SUPABASE_URL!).hostname,`${project}.supabase.co`,'Wrong server target');
const {storage}=await import('../../server/storage');
const dataset=buildA2ImportRows(date),plan=await storage.getPlan(dataset.input.planId);
assert.ok(plan,'The imported day is missing');assert.equal(plan.date,date);
const input=await buildEngineInput(dataset.input.planId,storage),actual=adaptEngineInputToPlannerNextProblem(input),expected=adaptEngineInputToPlannerNextProblem(dataset.input);
assert.equal(actual.status,'SUPPORTED',JSON.stringify(actual.issues));assert.equal(expected.status,'SUPPORTED');
if(actual.status==='SUPPORTED'&&expected.status==='SUPPORTED')assert.deepEqual(actual.problem,expected.problem,'Persisted day differs from the complete A2 canon');
const contestants=await storage.getContestantsByPlan(dataset.input.planId);
assert.deepEqual(contestants.map(c=>c.name).sort(),dataset.tables.contestants.map(c=>c.name).sort());
assert.ok(input.tasks.every(t=>t.startPlanned==null&&t.endPlanned==null),'Verify immediately after import, before planning');
const baselinePath=process.argv[4];let preservedExistingRows=0;
if(baselinePath){
 const baseline=JSON.parse(readFileSync(baselinePath,'utf8'));
 const {supabaseAdmin}=await import('../../server/supabase');
 for(const [table,rows] of Object.entries(baseline) as [string,Record<string,any>[]][]){
  for(let i=0;i<rows.length;i+=100){
   const before=rows.slice(i,i+100),{data,error}=await supabaseAdmin.from(table).select('*').in('id',before.map(r=>r.id));
   if(error)throw error;
   for(const row of before){assert.deepEqual(data?.find(r=>r.id===row.id),row,`Existing row changed: ${table}:${row.id}`);preservedExistingRows++;}
  }
 }
}
console.log(JSON.stringify({mode:'READ_ONLY_REAL_DATABASE_INPUT',project,planId:dataset.input.planId,date,contestants:contestants.length,obligations:input.tasks.length,canonicalProblemEqual:true,preservedExistingRows,existingRowsAudit:baselinePath?'PASS':'BASELINE_NOT_SUPPLIED',writes:0}));
