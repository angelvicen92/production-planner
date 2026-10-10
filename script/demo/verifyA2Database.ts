import assert from 'node:assert/strict';
import {buildEngineInput} from '../../engine/buildInput';
import {adaptEngineInputToPlannerNextProblem} from '../../engine/planner-next/integration/engineInputAdapter';
import {buildA2ImportRows} from './a2ImportRows';

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
console.log(JSON.stringify({mode:'READ_ONLY_REAL_DATABASE_INPUT',project,planId:dataset.input.planId,date,contestants:contestants.length,obligations:input.tasks.length,canonicalProblemEqual:true,writes:0}));
