/** Same complete discovery and original test budgets, isolated from real services. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
assert.equal(typeof Object.groupBy,'function','The existing full-A2 first-execution test needs a runtime with Object.groupBy (Node 22+). Native gates use Node 20.');
for(const key of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL'])delete process.env[key];
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_ANON_KEY:'isolated-evidence',SUPABASE_SERVICE_ROLE_KEY:'isolated-evidence'});
const files=execFileSync(process.execPath,['script/run-test-suite.mjs','--list','engine','server'],{encoding:'utf8'}).trim().split('\n');
console.log(JSON.stringify({node:process.version,files:files.length,testConcurrency:1,budgets:'unchanged',realServices:false}));
const result=spawnSync(process.execPath,['--import','tsx','--test','--test-concurrency=1',...files],{stdio:'inherit'});process.exitCode=result.status??1;
