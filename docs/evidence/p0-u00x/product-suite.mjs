/** Existing CI scope and original budgets, isolated from real services. */
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const includeHistorical=process.argv.includes('--include-historical');
if(includeHistorical)assert.equal(typeof Object.groupBy,'function','The historical first-execution benchmark needs Node 22+.');
for(const key of ['SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','DATABASE_URL'])delete process.env[key];
Object.assign(process.env,{SUPABASE_URL:'http://127.0.0.1:1',SUPABASE_ANON_KEY:'isolated-evidence',SUPABASE_SERVICE_ROLE_KEY:'isolated-evidence'});
const baseline=JSON.parse(readFileSync('docs/evidence/p0-u00w/validation.json','utf8')).checks.productSuite;
assert.equal(baseline.sameExclusionsAsCI,true);
const exclusions=includeHistorical?[]:baseline.exclusions;
const files=execFileSync(process.execPath,['script/run-test-suite.mjs','--list','engine','server'],{encoding:'utf8'}).trim().split('\n').filter(file=>!exclusions.includes(file));
console.log(JSON.stringify({node:process.version,files:files.length,testConcurrency:1,budgets:'unchanged',realServices:false,exclusions,newExclusions:0}));
const result=spawnSync(process.execPath,['--import','tsx','--test','--test-concurrency=1',...files],{stdio:'inherit'});process.exitCode=result.status??1;
